/**
 * Latency-Optimized Strategy - Selects the fastest model based on historical data
 */

import type { ModelDefinition, RoutingContext, RoutingRequest } from '@reaatech/llm-router-core';
import type { StrategySelectionResult } from './strategy.interface.js';
import { BaseRoutingStrategy } from './strategy.interface.js';

/** Configuration for latency-optimized strategy */
export interface LatencyOptimizedConfig {
  /** Pool of model IDs to consider */
  modelPool?: string[];
  /** Target P99 latency in milliseconds */
  targetP99Ms?: number;
  /** Default timeout in milliseconds */
  defaultTimeoutMs: number;
  /** Weight for historical latency (vs current conditions) */
  historicalWeight: number;
}

/**
 * Latency-Optimized Routing Strategy
 *
 * Selects the fastest model based on historical latency data and current
 * conditions. This strategy is ideal for interactive applications where
 * response time is critical.
 */
export class LatencyOptimizedStrategy extends BaseRoutingStrategy {
  readonly name = 'latency-optimized';
  readonly priority = 3;

  private config: LatencyOptimizedConfig;

  constructor(config: Partial<LatencyOptimizedConfig> = {}) {
    super(3);
    this.config = {
      modelPool: config.modelPool,
      targetP99Ms: config.targetP99Ms,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 3000,
      historicalWeight: config.historicalWeight ?? 0.7,
    };
  }

  applies(request: RoutingRequest, _context: RoutingContext): boolean {
    // Apply if request has a timeout constraint or strategy is explicitly set
    return request.timeoutMs !== undefined || request.strategy === this.name;
  }

  select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null {
    let candidates = availableModels.filter((m) => m.enabled !== false);

    // Filter by model pool if configured
    if (this.config.modelPool && this.config.modelPool.length > 0) {
      candidates = candidates.filter((m) => this.config.modelPool?.includes(m.id));
    }

    // Filter by required capabilities
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      candidates = this.filterByCapabilities(candidates, request.requiredCapabilities);
    }

    // Filter by token limit
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      candidates = this.filterByTokenLimit(candidates, request.maxTokens);
    }

    if (candidates.length === 0) {
      return null;
    }

    // Calculate predicted latency for each candidate
    const timeout = request.timeoutMs ?? this.config.defaultTimeoutMs;
    const scoredCandidates = candidates.map((model) => ({
      model,
      predictedLatency: this.predictLatency(model, context, timeout),
    }));

    // Filter by target P99 if configured
    if (this.config.targetP99Ms !== undefined && this.config.targetP99Ms > 0) {
      const { targetP99Ms } = this.config;
      const filteredCandidates = scoredCandidates.filter((c) => c.predictedLatency <= targetP99Ms);
      if (filteredCandidates.length > 0) {
        scoredCandidates.splice(0, scoredCandidates.length, ...filteredCandidates);
      }
    }

    if (scoredCandidates.length === 0) {
      return null;
    }

    // Sort by predicted latency and select the fastest
    scoredCandidates.sort((a, b) => a.predictedLatency - b.predictedLatency);

    const selected = scoredCandidates[0].model;
    const predictedLatency = scoredCandidates[0].predictedLatency;

    return this.createSelectionResult(
      selected,
      0.8, // Good confidence - latency prediction is probabilistic
      `Fastest model: ${predictedLatency}ms predicted latency`,
      scoredCandidates.slice(1, 4).map((c) => c.model),
    );
  }

  /**
   * Predict latency for a model based on historical data and current conditions
   */
  private predictLatency(model: ModelDefinition, context: RoutingContext, timeout: number): number {
    // Get historical latency for this model
    const historicalLatency = context.latencyHistory.get(model.id);

    if (historicalLatency === undefined) {
      // No historical data, use a default estimate based on model characteristics
      return this.estimateDefaultLatency(model, timeout);
    }

    // Apply weight to historical data
    const weightedLatency = historicalLatency * this.config.historicalWeight;

    // Factor in current conditions (queue depth, rate limits via circuit breaker)
    // Note: OPEN models should already be filtered out in getAvailable(), but we
    // still apply a small penalty to HALF_OPEN models since they're in recovery testing
    const cbState = context.circuitBreakerStates.get(model.id);
    let conditionFactor = 1.0;

    if (cbState === 'HALF_OPEN') {
      conditionFactor = 1.1; // Slightly degraded during recovery testing
    }
    // OPEN state should not occur here - such models are filtered out earlier

    return Math.min(weightedLatency * conditionFactor, timeout);
  }

  /**
   * Estimate default latency for a model without historical data
   */
  private estimateDefaultLatency(model: ModelDefinition, timeout: number): number {
    // Cheaper models tend to be faster, but not always
    // Use a conservative estimate
    const costFactor = (model.costPerMillionInput + model.costPerMillionOutput) / 10;

    // Base latency estimate (in ms)
    const baseLatency = 500 + costFactor * 1000;

    return Math.min(baseLatency, timeout);
  }

  getConfig(): Record<string, unknown> {
    return {
      modelPool: this.config.modelPool,
      targetP99Ms: this.config.targetP99Ms,
      defaultTimeoutMs: this.config.defaultTimeoutMs,
      historicalWeight: this.config.historicalWeight,
    };
  }

  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<LatencyOptimizedConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
