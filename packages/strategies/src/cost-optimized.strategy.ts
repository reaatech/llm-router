/**
 * Cost-Optimized Strategy - Selects the cheapest model that meets requirements
 */

import type { ModelDefinition, RoutingContext, RoutingRequest } from '@reaatech/llm-router-core';
import { BaseRoutingStrategy } from './strategy.interface.js';
import type { StrategySelectionResult } from './strategy.interface.js';

/** Configuration for cost-optimized strategy */
export interface CostOptimizedConfig {
  /** Pool of workhorse model IDs to consider */
  workhorsePool?: string[];
  /** Maximum budget per request in USD */
  budgetPerRequest?: number;
  /** Default estimated input tokens for budget calculation */
  defaultEstimatedInputTokens: number;
  /** Default estimated output tokens for budget calculation */
  defaultEstimatedOutputTokens: number;
}

/**
 * Cost-Optimized Routing Strategy
 *
 * Selects the cheapest model that meets the request requirements while
 * respecting budget constraints. This strategy is ideal for high-volume,
 * routine tasks where cost is the primary concern.
 */
export class CostOptimizedStrategy extends BaseRoutingStrategy {
  readonly name = 'cost-optimized';
  readonly priority = 5;

  private config: CostOptimizedConfig;

  constructor(config: Partial<CostOptimizedConfig> = {}) {
    super(5);
    this.config = {
      workhorsePool: config.workhorsePool,
      budgetPerRequest: config.budgetPerRequest,
      defaultEstimatedInputTokens: config.defaultEstimatedInputTokens ?? 1000,
      defaultEstimatedOutputTokens: config.defaultEstimatedOutputTokens ?? 500,
    };
  }

  applies(_request: RoutingRequest, _context: RoutingContext): boolean {
    // This strategy applies to all requests by default
    // It can be overridden by higher-priority strategies
    return true;
  }

  select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null {
    let candidates = availableModels.filter((m) => m.enabled !== false);

    // Filter by workhorse pool if configured
    if (this.config.workhorsePool && this.config.workhorsePool.length > 0) {
      candidates = candidates.filter((m) => this.config.workhorsePool?.includes(m.id));
    }

    // Filter by required capabilities
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      candidates = this.filterByCapabilities(candidates, request.requiredCapabilities);
    }

    // Filter by token limit
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      candidates = this.filterByTokenLimit(candidates, request.maxTokens);
    }

    // Calculate estimated tokens
    const estimatedInputTokens =
      request.maxTokens ?? this.config.defaultEstimatedInputTokens ?? 1000;
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.5);

    // Filter by budget constraint
    const metadataBudget =
      typeof request.metadata?.budgetPerRequest === 'number'
        ? (request.metadata.budgetPerRequest as number)
        : undefined;
    const budgetLimit: number | undefined =
      metadataBudget ?? this.config.budgetPerRequest ?? context.remainingBudget;

    if (budgetLimit !== undefined) {
      candidates = this.filterByBudget(
        candidates,
        budgetLimit,
        estimatedInputTokens,
        estimatedOutputTokens,
      );
    }

    if (candidates.length === 0) {
      return null;
    }

    // Sort by total cost and select the cheapest
    const sortedCandidates = [...candidates].sort((a, b) => {
      const costA = this.estimateCost(a, estimatedInputTokens, estimatedOutputTokens);
      const costB = this.estimateCost(b, estimatedInputTokens, estimatedOutputTokens);
      return costA - costB;
    });

    const selected = sortedCandidates[0];
    const estimatedCost = this.estimateCost(selected, estimatedInputTokens, estimatedOutputTokens);

    return this.createSelectionResult(
      selected,
      0.9, // High confidence - cost calculation is deterministic
      `Cheapest model: $${estimatedCost.toFixed(6)} estimated cost`,
      sortedCandidates.slice(1, 4), // Top 3 alternatives
    );
  }

  getConfig(): Record<string, unknown> {
    return {
      workhorsePool: this.config.workhorsePool,
      budgetPerRequest: this.config.budgetPerRequest,
      defaultEstimatedInputTokens: this.config.defaultEstimatedInputTokens,
      defaultEstimatedOutputTokens: this.config.defaultEstimatedOutputTokens,
    };
  }

  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<CostOptimizedConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
