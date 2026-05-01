/**
 * Telemetry-oriented metrics facade.
 */

import { MetricsCollector } from './metrics-collector.js';

export class TelemetryMetrics {
  constructor(private readonly collector: MetricsCollector) {}

  recordCost(modelId: string, strategy: string, cost: number, latencyMs: number): void {
    this.collector.recordRequest({
      modelId,
      strategy,
      status: 'success',
      cost,
      latencyMs,
    });
  }

  updateBudget(budgetId: string, remaining: number): void {
    this.collector.updateBudgetRemaining(budgetId, remaining);
  }

  recordModelUsage(modelId: string, tokens: { input: number; output: number }): void {
    this.collector.recordTokenUsage(modelId, tokens.input, tokens.output);
  }
}
