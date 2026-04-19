/**
 * Model Registry - Manages LLM model definitions, capabilities, and pricing
 */

import type { ModelDefinition, ModelCapability, CircuitBreakerState } from '../types/domain.js';
import { ModelDefinitionSchema } from '../types/schemas.js';
import type { ZodError } from 'zod';

/** Options for filtering models */
export interface ModelFilterOptions {
  /** Required capabilities */
  capabilities?: ModelCapability[];
  /** Maximum cost per request in USD */
  maxCostPerRequest?: number;
  /** Minimum max tokens */
  minMaxTokens?: number;
  /** Only enabled models */
  enabledOnly?: boolean;
  /** Specific model IDs to include */
  modelIds?: string[];
  /** Provider filter */
  provider?: string;
}

/** Error thrown when model validation fails */
export class ModelValidationError extends Error {
  constructor(
    message: string,
    public readonly causes: ZodError | null,
  ) {
    super(message);
    this.name = 'ModelValidationError';
  }
}

/** Error thrown when no matching model is found */
export class NoMatchingModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoMatchingModelError';
  }
}

/**
 * Model Registry - Central registry for LLM model definitions
 *
 * Handles model registration, capability-based filtering, and cost constraint filtering.
 */
export class ModelRegistry {
  private models: Map<string, ModelDefinition> = new Map();

  /**
   * Register a single model
   * @throws {ModelValidationError} if model definition is invalid
   */
  register(model: ModelDefinition): void {
    // Validate the model definition
    const result = ModelDefinitionSchema.safeParse(model);
    if (!result.success) {
      throw new ModelValidationError(`Invalid model definition for '${model.id}'`, result.error);
    }

    const validatedModel = result.data;
    this.models.set(validatedModel.id, validatedModel);
  }

  /**
   * Register multiple models at once
   * @throws {ModelValidationError} if any model definition is invalid
   */
  registerAll(models: ModelDefinition[]): void {
    for (const model of models) {
      this.register(model);
    }
  }

  /**
   * Get a model by ID
   */
  getById(id: string): ModelDefinition | undefined {
    return this.models.get(id);
  }

  /**
   * Get all registered models
   */
  getAll(): ModelDefinition[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by provider
   */
  getByProvider(provider: string): ModelDefinition[] {
    return this.filter({ provider });
  }

  /**
   * Get workhorse models (typically cheaper, faster models)
   */
  getWorkhorses(): ModelDefinition[] {
    // Workhorses are typically models with lower cost per million tokens
    return this.getAll().filter(
      (m) => m.enabled !== false && m.costPerMillionInput < 5.0 && m.costPerMillionOutput < 10.0,
    );
  }

  /**
   * Get judge models (typically premium, high-quality models)
   */
  getJudges(): ModelDefinition[] {
    // Judges are typically models with higher cost but better capabilities
    return this.getAll().filter(
      (m) =>
        m.enabled !== false &&
        (m.costPerMillionInput >= 5.0 || m.costPerMillionOutput >= 10.0) &&
        m.capabilities.includes('evaluation'),
    );
  }

  /**
   * Filter models by options
   */
  filter(options: ModelFilterOptions = {}): ModelDefinition[] {
    let models = this.getAll();

    // Filter by enabled status
    if (options.enabledOnly !== false) {
      models = models.filter((m) => m.enabled !== false);
    }

    // Filter by model IDs
    if (options.modelIds && options.modelIds.length > 0) {
      models = models.filter((m) => options.modelIds!.includes(m.id));
    }

    // Filter by provider
    if (options.provider !== undefined && options.provider.length > 0) {
      models = models.filter((m) => m.provider === options.provider);
    }

    // Filter by capabilities
    if (options.capabilities && options.capabilities.length > 0) {
      models = models.filter((m) =>
        options.capabilities!.every((cap) => m.capabilities.includes(cap)),
      );
    }

    // Filter by max tokens
    if (options.minMaxTokens !== undefined && options.minMaxTokens > 0) {
      models = models.filter((m) => m.maxTokens >= options.minMaxTokens!);
    }

    // Filter by cost per request (estimated)
    if (options.maxCostPerRequest !== undefined && options.maxCostPerRequest > 0) {
      models = models.filter((m) => {
        // Estimate cost for a typical request (1000 input, 500 output tokens)
        const estimatedCost =
          (1000 / 1_000_000) * m.costPerMillionInput + (500 / 1_000_000) * m.costPerMillionOutput;
        return estimatedCost <= options.maxCostPerRequest!;
      });
    }

    return models;
  }

  /**
   * Find the cheapest model matching the criteria
   */
  findCheapest(options: ModelFilterOptions = {}): ModelDefinition | undefined {
    const candidates = this.filter(options);
    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by total cost (input + output) and return the cheapest
    return candidates.reduce((cheapest, current) => {
      const cheapestCost = cheapest.costPerMillionInput + cheapest.costPerMillionOutput;
      const currentCost = current.costPerMillionInput + current.costPerMillionOutput;
      return currentCost < cheapestCost ? current : cheapest;
    });
  }

  /**
   * Find models with specific capabilities
   */
  findByCapabilities(capabilities: ModelCapability[]): ModelDefinition[] {
    return this.filter({ capabilities });
  }

  /**
   * Calculate estimated cost for a request
   */
  estimateCost(modelId: string, inputTokens: number, outputTokens: number): number | undefined {
    const model = this.getById(modelId);
    if (!model) {
      return undefined;
    }

    return (
      (inputTokens / 1_000_000) * model.costPerMillionInput +
      (outputTokens / 1_000_000) * model.costPerMillionOutput
    );
  }

  /**
   * Check if a model has specific capabilities
   */
  hasCapabilities(modelId: string, capabilities: ModelCapability[]): boolean {
    const model = this.getById(modelId);
    if (!model) {
      return false;
    }

    return capabilities.every((cap) => model.capabilities.includes(cap));
  }

  /**
   * Get model status including circuit breaker state
   */
  getStatus(
    modelId: string,
    circuitBreakerStates: Map<string, CircuitBreakerState>,
  ): {
    model: ModelDefinition | undefined;
    available: boolean;
    circuitBreakerState: CircuitBreakerState;
  } {
    const model = this.getById(modelId);
    const cbState = circuitBreakerStates.get(modelId) ?? 'CLOSED';
    const available = model?.enabled !== false && cbState !== 'OPEN';

    return {
      model,
      available,
      circuitBreakerState: cbState,
    };
  }

  /**
   * Get all available models (enabled and not circuit-broken)
   */
  getAvailable(circuitBreakerStates: Map<string, CircuitBreakerState>): ModelDefinition[] {
    return this.getAll().filter((m) => {
      const status = this.getStatus(m.id, circuitBreakerStates);
      return status.available;
    });
  }

  /**
   * Remove a model from the registry
   */
  remove(modelId: string): boolean {
    return this.models.delete(modelId);
  }

  /**
   * Clear all models
   */
  clear(): void {
    this.models.clear();
  }

  /**
   * Get the count of registered models
   */
  count(): number {
    return this.models.size;
  }

  /**
   * Export registry state for serialization
   */
  export(): ModelDefinition[] {
    return this.getAll();
  }

  /**
   * Import models from serialized state
   */
  import(models: ModelDefinition[]): void {
    const previousModels = this.export();
    try {
      this.clear();
      this.registerAll(models);
    } catch (error) {
      // Restore previous state on failure
      this.registerAll(previousModels);
      throw error;
    }
  }
}
