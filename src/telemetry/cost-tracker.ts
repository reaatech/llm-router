/**
 * Cost Tracker - Per-request cost calculation and accumulation
 */

import type { ModelDefinition } from '../types/domain.js';

/** Cost entry for tracking */
export interface CostEntry {
  requestId: string;
  modelId: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
  strategy: string;
  budgetId?: string;
}

/** Cost aggregation by dimension */
export interface CostAggregation {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
  averageCostPerRequest: number;
  averageInputTokens: number;
  averageOutputTokens: number;
}

/** Cost by model breakdown */
export interface CostByModel {
  modelId: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  percentage: number;
}

/**
 * Cost Tracker - Tracks and aggregates costs across requests
 *
 * Provides accurate cost calculation per request and accumulates costs
 * by model, user, project, and time period.
 */
export class CostTracker {
  private entries: CostEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 100000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Record a cost entry
   */
  record(entry: Omit<CostEntry, 'timestamp'>): void {
    const costEntry: CostEntry = {
      ...entry,
      timestamp: new Date(),
    };

    this.entries.push(costEntry);

    // Trim old entries if exceeding max
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(model: ModelDefinition, inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1_000_000) * model.costPerMillionInput +
      (outputTokens / 1_000_000) * model.costPerMillionOutput
    );
  }

  /**
   * Estimate cost based on typical token ratios
   */
  estimateCost(model: ModelDefinition, estimatedInputTokens: number): number {
    const estimatedOutputTokens = Math.ceil(estimatedInputTokens * 0.5);
    return this.calculateCost(model, estimatedInputTokens, estimatedOutputTokens);
  }

  /**
   * Get total cost for a time period
   */
  getTotalCost(options?: { budgetId?: string; startTime?: Date; endTime?: Date }): number {
    return this.getFilteredEntries(options).reduce((sum, entry) => sum + entry.cost, 0);
  }

  /**
   * Get cost aggregation for a time period
   */
  getAggregation(options?: {
    budgetId?: string;
    startTime?: Date;
    endTime?: Date;
  }): CostAggregation {
    const entries = this.getFilteredEntries(options);
    const totalCost = entries.reduce((sum, e) => sum + e.cost, 0);
    const totalInputTokens = entries.reduce((sum, e) => sum + e.inputTokens, 0);
    const totalOutputTokens = entries.reduce((sum, e) => sum + e.outputTokens, 0);
    const requestCount = entries.length;

    return {
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      requestCount,
      averageCostPerRequest: requestCount > 0 ? totalCost / requestCount : 0,
      averageInputTokens: requestCount > 0 ? totalInputTokens / requestCount : 0,
      averageOutputTokens: requestCount > 0 ? totalOutputTokens / requestCount : 0,
    };
  }

  /**
   * Get cost breakdown by model
   */
  getCostByModel(options?: { startTime?: Date; endTime?: Date }): CostByModel[] {
    const entries = this.getFilteredEntries(options);
    const modelCosts = new Map<
      string,
      { cost: number; inputTokens: number; outputTokens: number; count: number }
    >();

    for (const entry of entries) {
      const existing = modelCosts.get(entry.modelId) ?? {
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        count: 0,
      };
      existing.cost += entry.cost;
      existing.inputTokens += entry.inputTokens;
      existing.outputTokens += entry.outputTokens;
      existing.count++;
      modelCosts.set(entry.modelId, existing);
    }

    const totalCost = Array.from(modelCosts.values()).reduce((sum, v) => sum + v.cost, 0);

    return Array.from(modelCosts.entries()).map(([modelId, data]) => ({
      modelId,
      cost: data.cost,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      requestCount: data.count,
      percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
    }));
  }

  /**
   * Get cost by strategy
   */
  getCostByStrategy(options?: {
    startTime?: Date;
    endTime?: Date;
  }): Array<{ strategy: string; cost: number; requestCount: number; percentage: number }> {
    const entries = this.getFilteredEntries(options);
    const strategyCosts = new Map<string, { cost: number; count: number }>();

    for (const entry of entries) {
      const existing = strategyCosts.get(entry.strategy) ?? { cost: 0, count: 0 };
      existing.cost += entry.cost;
      existing.count++;
      strategyCosts.set(entry.strategy, existing);
    }

    const totalCost = Array.from(strategyCosts.values()).reduce((sum, v) => sum + v.cost, 0);

    return Array.from(strategyCosts.entries()).map(([strategy, data]) => ({
      strategy,
      cost: data.cost,
      requestCount: data.count,
      percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
    }));
  }

  /**
   * Detect cost anomalies (sudden spikes)
   */
  detectAnomalies(options?: {
    budgetId?: string;
    threshold?: number; // Standard deviations
    windowSize?: number; // Number of entries for moving average
  }): Array<{ requestId: string; cost: number; expectedCost: number; deviation: number }> {
    const entries = this.getFilteredEntries(options);
    const threshold = options?.threshold ?? 3;
    const windowSize = options?.windowSize ?? 20;

    const anomalies: Array<{
      requestId: string;
      cost: number;
      expectedCost: number;
      deviation: number;
    }> = [];

    if (entries.length < windowSize * 2) {
      return anomalies; // Not enough data
    }

    // Calculate moving average and standard deviation
    for (let i = windowSize; i < entries.length; i++) {
      const window = entries.slice(i - windowSize, i);
      const costs = window.map((e) => e.cost);
      const mean = costs.reduce((sum, c) => sum + c, 0) / costs.length;
      const variance = costs.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / costs.length;
      const stdDev = Math.sqrt(variance);

      const currentCost = entries[i].cost;
      const deviation = stdDev > 0 ? (currentCost - mean) / stdDev : 0;

      if (Math.abs(deviation) > threshold) {
        anomalies.push({
          requestId: entries[i].requestId,
          cost: currentCost,
          expectedCost: mean,
          deviation,
        });
      }
    }

    return anomalies;
  }

  /**
   * Get recent entries
   */
  getRecentEntries(count: number = 100): CostEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  private getFilteredEntries(options?: {
    budgetId?: string;
    startTime?: Date;
    endTime?: Date;
  }): CostEntry[] {
    let entries = [...this.entries];

    if (options?.budgetId !== undefined && options.budgetId.length > 0) {
      entries = entries.filter((e) => e.budgetId === options.budgetId);
    }

    if (options?.startTime) {
      entries = entries.filter((e) => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      entries = entries.filter((e) => e.timestamp <= options.endTime!);
    }

    return entries;
  }
}

/**
 * Create a cost tracker instance
 */
export function createCostTracker(maxEntries: number = 100000): CostTracker {
  return new CostTracker(maxEntries);
}
