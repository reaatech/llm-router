/**
 * Strategy Interface - Base interface for all routing strategies
 */

import type { ModelDefinition, RoutingRequest, RoutingContext } from "@reaatech/llm-router-core";

/** Result of strategy model selection */
export interface StrategySelectionResult {
  /** Selected model */
  model: ModelDefinition;
  /** Confidence in selection (0-1) */
  confidence: number;
  /** Reason for selection */
  reason: string;
  /** Alternative models considered */
  alternatives: ModelDefinition[];
}

/**
 * Interface for pluggable routing strategies
 *
 * Each strategy implements a different approach to selecting the optimal model
 * for a given request. Strategies are evaluated in priority order, and the
 * first strategy that applies to a request is used.
 */
export interface RoutingStrategy {
  /** Unique strategy identifier */
  readonly name: string;

  /**
   * Evaluation priority (lower = higher priority)
   *
   * Strategies with lower priority values are evaluated first.
   * Use values like 1, 2, 3 for specific strategies and 10+ for generic ones.
   */
  readonly priority: number;

  /**
   * Check if this strategy applies to this request
   *
   * This allows strategies to opt-in only to requests they can handle.
   * For example, a judgment-based strategy might only apply to requests
   * with high complexity indicators.
   *
   * @returns true if this strategy should be considered for this request
   */
  applies(request: RoutingRequest, context: RoutingContext): boolean;

  /**
   * Select the optimal model for this request
   *
   * Called only if applies() returns true. Must return a model from the
   * available models list, or null if no suitable model is found.
   *
   * @param request - The routing request
   * @param context - Current routing context
   * @param availableModels - Models that are available for selection
   * @returns Selection result with the chosen model, or null
   */
  select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null;

  /**
   * Get strategy configuration
   *
   * Returns the current configuration for this strategy.
   * Useful for debugging and monitoring.
   */
  getConfig?(): Record<string, unknown>;
}

/**
 * Base class for routing strategies
 *
 * Provides common functionality and default implementations.
 */
export abstract class BaseRoutingStrategy implements RoutingStrategy {
  abstract readonly name: string;
  readonly priority: number;

  constructor(priority: number = 10) {
    this.priority = priority;
  }

  abstract applies(request: RoutingRequest, context: RoutingContext): boolean;

  abstract select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null;

  getConfig(): Record<string, unknown> {
    return {};
  }

  /**
   * Filter models by required capabilities
   */
  protected filterByCapabilities(
    models: ModelDefinition[],
    requiredCapabilities: Array<ModelDefinition['capabilities'][number]>,
  ): ModelDefinition[] {
    if (requiredCapabilities.length === 0) {
      return models;
    }

    return models.filter((model) =>
      requiredCapabilities.every((cap) => model.capabilities.includes(cap)),
    );
  }

  /**
   * Filter models by budget constraint
   */
  protected filterByBudget(
    models: ModelDefinition[],
    maxBudget: number,
    estimatedInputTokens: number,
    estimatedOutputTokens: number,
  ): ModelDefinition[] {
    return models.filter((model) => {
      const cost =
        (estimatedInputTokens / 1_000_000) * model.costPerMillionInput +
        (estimatedOutputTokens / 1_000_000) * model.costPerMillionOutput;
      return cost <= maxBudget;
    });
  }

  /**
   * Filter models by token limit
   */
  protected filterByTokenLimit(models: ModelDefinition[], maxTokens: number): ModelDefinition[] {
    return models.filter((model) => model.maxTokens >= maxTokens);
  }

  /**
   * Calculate estimated cost for a model
   */
  protected estimateCost(
    model: ModelDefinition,
    inputTokens: number,
    outputTokens: number,
  ): number {
    return (
      (inputTokens / 1_000_000) * model.costPerMillionInput +
      (outputTokens / 1_000_000) * model.costPerMillionOutput
    );
  }

  /**
   * Create a selection result
   */
  protected createSelectionResult(
    model: ModelDefinition,
    confidence: number,
    reason: string,
    alternatives: ModelDefinition[] = [],
  ): StrategySelectionResult {
    return {
      model,
      confidence,
      reason,
      alternatives,
    };
  }
}
