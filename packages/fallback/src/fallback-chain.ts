/**
 * Fallback Chain - Ordered list of models for degradation
 */

import type {
  CircuitBreakerState,
  FallbackChainDefinition,
  ModelDefinition,
} from '@reaatech/llm-router-core';
import { CircuitBreaker } from './circuit-breaker.js';

/** Result of fallback chain execution */
export interface FallbackChainResult {
  /** The model that succeeded */
  selectedModel: ModelDefinition;
  /** Position in the chain (0 = first) */
  position: number;
  /** Whether this was a fallback (position > 0) */
  isFallback: boolean;
  /** Number of attempts made */
  attempts: number;
  /** Errors from failed attempts */
  errors: Array<{ modelId: string; error: string; position: number }>;
}

/** Function to execute a request against a model */
export type ModelExecutor<T> = (model: ModelDefinition) => Promise<T>;

/**
 * Fallback Chain implementation
 *
 * Manages an ordered list of models and automatically fails over to the next
 * model when the current one fails. Integrates with circuit breakers to skip
 * unhealthy models.
 */
export class FallbackChain {
  private definition: FallbackChainDefinition;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private models: Map<string, ModelDefinition> = new Map();

  constructor(definition: FallbackChainDefinition) {
    this.definition = definition;

    // Create circuit breakers for each model
    for (const modelId of definition.models) {
      this.circuitBreakers.set(modelId, new CircuitBreaker(definition.circuitBreaker));
    }
  }

  /**
   * Register a model definition
   */
  registerModel(model: ModelDefinition): void {
    if (this.definition.models.includes(model.id)) {
      this.models.set(model.id, model);
    }
  }

  /**
   * Register multiple model definitions
   */
  registerModels(models: ModelDefinition[]): void {
    for (const model of models) {
      this.registerModel(model);
    }
  }

  /**
   * Get the chain definition
   */
  getDefinition(): FallbackChainDefinition {
    return { ...this.definition };
  }

  /**
   * Get the name of the chain
   */
  getName(): string {
    return this.definition.name;
  }

  /**
   * Get circuit breaker state for a model
   */
  getCircuitBreakerState(modelId: string): CircuitBreakerState {
    const cb = this.circuitBreakers.get(modelId);
    return cb?.getState() ?? 'CLOSED';
  }

  /**
   * Get all circuit breaker states
   */
  getAllCircuitBreakerStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>();
    for (const [modelId, cb] of this.circuitBreakers) {
      states.set(modelId, cb.getState());
    }
    return states;
  }

  /**
   * Execute a request through the fallback chain
   *
   * Tries each model in order until one succeeds or all fail.
   */
  async execute<T>(
    executor: ModelExecutor<T>,
    availableModels: ModelDefinition[],
  ): Promise<FallbackChainResult> {
    return this.executeWithOrder(this.definition.models, executor, availableModels);
  }

  /**
   * Execute a request starting from the already-selected model.
   *
   * This preserves the router's primary decision and only falls forward to the
   * chain when execution of that chosen model fails.
   */
  async executeFrom<T>(
    selectedModelId: string,
    executor: ModelExecutor<T>,
    availableModels: ModelDefinition[],
  ): Promise<FallbackChainResult> {
    const orderedModelIds = this.buildExecutionOrder(selectedModelId);
    return this.executeWithOrder(orderedModelIds, executor, availableModels);
  }

  private buildExecutionOrder(selectedModelId: string): string[] {
    const remaining = this.definition.models.filter((modelId) => modelId !== selectedModelId);
    return [selectedModelId, ...remaining];
  }

  private async executeWithOrder<T>(
    orderedModelIds: string[],
    executor: ModelExecutor<T>,
    availableModels: ModelDefinition[],
  ): Promise<FallbackChainResult> {
    const errors: Array<{ modelId: string; error: string; position: number }> = [];
    let attempts = 0;

    for (let position = 0; position < orderedModelIds.length; position++) {
      const modelId = orderedModelIds[position];
      const model = availableModels.find((m) => m.id === modelId);

      if (!model) {
        errors.push({
          modelId,
          error: 'Model not available',
          position,
        });
        continue;
      }

      // Check circuit breaker
      const cb = this.circuitBreakers.get(modelId);
      if (cb && !cb.canExecute()) {
        errors.push({
          modelId,
          error: `Circuit breaker is ${cb.getState()}`,
          position,
        });
        continue;
      }

      attempts++;

      try {
        await executor(model);

        // Record success
        cb?.onSuccess();

        return {
          selectedModel: model,
          position,
          isFallback: position > 0,
          attempts,
          errors,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Record failure
        cb?.onFailure(errorMessage);

        errors.push({
          modelId,
          error: errorMessage,
          position,
        });
      }
    }

    // All models failed
    throw new FallbackChainExhaustedError(
      `All ${attempts} attempted models in chain '${this.definition.name}' failed`,
      errors,
    );
  }

  /**
   * Get available models in chain order (excluding circuit-broken models)
   */
  getAvailableModels(availableModels: ModelDefinition[]): ModelDefinition[] {
    return this.definition.models
      .map((modelId) => availableModels.find((m) => m.id === modelId))
      .filter(
        (model): model is ModelDefinition =>
          model !== undefined &&
          model.enabled !== false &&
          this.getCircuitBreakerState(model.id) !== 'OPEN',
      );
  }

  /**
   * Get the primary model (first in chain)
   */
  getPrimaryModel(availableModels: ModelDefinition[]): ModelDefinition | null {
    if (this.definition.models.length === 0) {
      return null;
    }

    const primaryId = this.definition.models[0];
    const model = availableModels.find((m) => m.id === primaryId);

    if (!model || model.enabled === false) {
      return null;
    }

    if (this.getCircuitBreakerState(primaryId) === 'OPEN') {
      return null;
    }

    return model;
  }

  /**
   * Reset all circuit breakers in the chain
   */
  resetAll(): void {
    for (const cb of this.circuitBreakers.values()) {
      cb.reset();
    }
  }

  /**
   * Get statistics for all circuit breakers
   */
  getStats(): {
    chainName: string;
    models: Array<{
      modelId: string;
      state: CircuitBreakerState;
      failureCount: number;
      lastFailureTime: Date | null;
    }>;
  } {
    return {
      chainName: this.definition.name,
      models: this.definition.models.map((modelId) => {
        const cb = this.circuitBreakers.get(modelId);
        const stats = cb?.getStats();
        return {
          modelId,
          state: stats?.state ?? 'CLOSED',
          failureCount: stats?.failureCount ?? 0,
          lastFailureTime: stats?.lastFailureTime ?? null,
        };
      }),
    };
  }
}

/**
 * Error thrown when all models in a fallback chain have failed
 */
export class FallbackChainExhaustedError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ modelId: string; error: string; position: number }>,
  ) {
    super(message);
    this.name = 'FallbackChainExhaustedError';
  }
}

/**
 * Create a fallback chain from a definition
 */
export function createFallbackChain(definition: FallbackChainDefinition): FallbackChain {
  return new FallbackChain(definition);
}
