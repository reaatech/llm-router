/**
 * Dashboard snapshot helper with real-time routing stats, cost trends, and model health.
 */

import { MetricsCollector } from '@reaatech/llm-router-telemetry';
import { CostReporter } from '@reaatech/llm-router-telemetry';
import type { CostReport } from '@reaatech/llm-router-telemetry';
import { CostTracker } from '@reaatech/llm-router-telemetry';
import type { CostEntry } from '@reaatech/llm-router-telemetry';
import type { CircuitBreaker } from '@reaatech/llm-router-fallback';

export interface RoutingStats {
  requestsPerMinute: number;
  strategyDistribution: Record<string, { count: number; percentage: number }>;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface CostTrendEntry {
  timestamp: Date;
  cost: number;
  requestCount: number;
}

export interface CostTrend {
  entries: CostTrendEntry[];
  trend: 'increasing' | 'decreasing' | 'stable';
  percentChange: number;
}

export interface ModelHealthStatus {
  modelId: string;
  healthy: boolean;
  errorRate: number;
  avgLatencyMs: number;
  circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  lastErrorTime?: Date;
  requestsLastHour: number;
}

export interface DashboardSnapshot {
  metrics: Record<string, number>;
  cost: CostReport;
  routing: RoutingStats;
  costTrend: CostTrend;
  modelHealth: ModelHealthStatus[];
  timestamp: Date;
}

export interface TrendWindowConfig {
  windowMinutes: number;
  comparisonWindowMinutes: number;
}

export class ObservabilityDashboard {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private latencySamples: number[] = [];
  private readonly maxLatencySamples = 10000;

  constructor(
    private readonly metrics: MetricsCollector,
    private readonly reporter: CostReporter,
    private readonly costTracker: CostTracker,
  ) {}

  registerCircuitBreaker(modelId: string, cb: CircuitBreaker): void {
    this.circuitBreakers.set(modelId, cb);
  }

  recordLatency(latencyMs: number): void {
    this.latencySamples.push(latencyMs);
    if (this.latencySamples.length > this.maxLatencySamples) {
      this.latencySamples = this.latencySamples.slice(-this.maxLatencySamples);
    }
  }

  getSnapshot(
    options: { budgetId?: string; startTime?: Date; endTime?: Date } = {},
    trendConfig: TrendWindowConfig = { windowMinutes: 60, comparisonWindowMinutes: 60 },
  ): DashboardSnapshot {
    const rawMetrics = this.metrics.getMetrics();
    const costReport = this.reporter.getReport(options);
    const routingStats = this.computeRoutingStats(rawMetrics, options);
    const costTrend = this.computeCostTrend(options, trendConfig);
    const modelHealth = this.computeModelHealth(rawMetrics, options);

    return {
      metrics: Object.fromEntries(rawMetrics),
      cost: costReport,
      routing: routingStats,
      costTrend,
      modelHealth,
      timestamp: new Date(),
    };
  }

  private computeRoutingStats(
    rawMetrics: Map<string, number>,
    options: { startTime?: Date; endTime?: Date },
  ): RoutingStats {
    const entries = this.costTracker.getRecentEntries(1000);
    const filtered = this.filterByTime(entries, options);

    const strategyCounts = new Map<string, number>();
    let successCount = 0;

    for (const entry of filtered) {
      strategyCounts.set(entry.strategy, (strategyCounts.get(entry.strategy) ?? 0) + 1);
      successCount++;
    }

    const totalRequests = filtered.length;
    const strategyDistribution: Record<string, { count: number; percentage: number }> = {};
    for (const [strategy, count] of strategyCounts) {
      strategyDistribution[strategy] = {
        count,
        percentage: totalRequests > 0 ? (count / totalRequests) * 100 : 0,
      };
    }

    const latenciesFromMetrics = this.getLatenciesFromMetrics(rawMetrics);
    const sortedLatencies = [...latenciesFromMetrics].sort((a, b) => a - b);

    return {
      requestsPerMinute: totalRequests / Math.max(1, this.getTimeWindowMinutes(options)),
      strategyDistribution,
      successRate: totalRequests > 0 ? (successCount / totalRequests) * 100 : 100,
      avgLatencyMs:
        sortedLatencies.length > 0
          ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
          : 0,
      p95LatencyMs: this.percentile(sortedLatencies, 95),
      p99LatencyMs: this.percentile(sortedLatencies, 99),
    };
  }

  private getLatenciesFromMetrics(rawMetrics: Map<string, number>): number[] {
    const latencies: number[] = [];
    for (const [key, value] of rawMetrics) {
      if (key.startsWith('latency.') && key.endsWith('.last_ms')) {
        latencies.push(value);
      }
    }
    return latencies.length > 0 ? latencies : this.latencySamples.slice(-100);
  }

  private computeCostTrend(
    options: { startTime?: Date; endTime?: Date },
    config: TrendWindowConfig,
  ): CostTrend {
    const now = options.endTime ?? new Date();
    const windowStart = new Date(now.getTime() - config.windowMinutes * 60 * 1000);
    const comparisonStart = new Date(
      windowStart.getTime() - config.comparisonWindowMinutes * 60 * 1000,
    );

    const currentEntries = this.costTracker
      .getRecentEntries(10000)
      .filter((e) => e.timestamp >= windowStart && e.timestamp <= now);

    const previousEntries = this.costTracker
      .getRecentEntries(10000)
      .filter((e) => e.timestamp >= comparisonStart && e.timestamp < windowStart);

    const currentCost = currentEntries.reduce((sum, e) => sum + e.cost, 0);
    const previousCost = previousEntries.reduce((sum, e) => sum + e.cost, 0);

    const percentChange =
      previousCost > 0 ? ((currentCost - previousCost) / previousCost) * 100 : 0;

    const bucketSize = Math.max(1, Math.floor(config.windowMinutes / 6));
    const buckets = this.bucketCosts(currentEntries, bucketSize, windowStart, now);

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (percentChange > 10) {
      trend = 'increasing';
    } else if (percentChange < -10) {
      trend = 'decreasing';
    }

    return {
      entries: buckets,
      trend,
      percentChange,
    };
  }

  private bucketCosts(
    entries: CostEntry[],
    bucketSizeMinutes: number,
    start: Date,
    _end: Date,
  ): CostTrendEntry[] {
    const bucketMs = bucketSizeMinutes * 60 * 1000;
    const buckets = new Map<number, { cost: number; count: number; timestamp: Date }>();

    for (const entry of entries) {
      const bucketKey = Math.floor((entry.timestamp.getTime() - start.getTime()) / bucketMs);
      const existing = buckets.get(bucketKey) ?? {
        cost: 0,
        count: 0,
        timestamp: new Date(start.getTime() + bucketKey * bucketMs),
      };
      existing.cost += entry.cost;
      existing.count++;
      buckets.set(bucketKey, existing);
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map((b) => ({ timestamp: b.timestamp, cost: b.cost, requestCount: b.count }));
  }

  private computeModelHealth(
    rawMetrics: Map<string, number>,
    options: { startTime?: Date; endTime?: Date },
  ): ModelHealthStatus[] {
    const modelIds = this.extractModelIds(rawMetrics);
    const entries = this.costTracker.getRecentEntries(10000);
    const filtered = this.filterByTime(entries, options);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    return modelIds.map((modelId) => {
      const cb = this.circuitBreakers.get(modelId);
      const cbStats = cb?.getStats();
      const modelEntries = filtered.filter((e) => e.modelId === modelId);
      const recentEntries = modelEntries.filter((e) => e.timestamp >= oneHourAgo);
      const latencies = this.extractModelLatencies(rawMetrics, modelId);

      return {
        modelId,
        healthy: cbStats?.state !== 'OPEN',
        errorRate:
          cbStats?.state === 'OPEN'
            ? 1
            : cbStats
              ? cbStats.failureCount / Math.max(1, cbStats.failureCount + 100)
              : 0,
        avgLatencyMs:
          latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
        circuitBreakerState: cbStats?.state ?? 'CLOSED',
        requestsLastHour: recentEntries.length,
      };
    });
  }

  private extractModelIds(rawMetrics: Map<string, number>): string[] {
    const modelIds = new Set<string>();
    for (const key of rawMetrics.keys()) {
      if (key.startsWith('latency.')) {
        const parts = key.split('.');
        if (parts.length >= 2) {
          modelIds.add(parts[1]);
        }
      }
      if (key.startsWith('usage.')) {
        const parts = key.split('.');
        if (parts.length >= 2) {
          modelIds.add(parts[1]);
        }
      }
    }
    return Array.from(modelIds);
  }

  private extractModelLatencies(rawMetrics: Map<string, number>, modelId: string): number[] {
    const key = `latency.${modelId}.last_ms`;
    const value = rawMetrics.get(key);
    if (value !== undefined) {
      return [value];
    }
    return [];
  }

  private filterByTime<T extends { timestamp: Date }>(
    entries: T[],
    options: { startTime?: Date; endTime?: Date },
  ): T[] {
    return entries.filter((e) => {
      if (options.startTime && e.timestamp < options.startTime) {
        return false;
      }
      if (options.endTime && e.timestamp > options.endTime) {
        return false;
      }
      return true;
    });
  }

  private getTimeWindowMinutes(options: { startTime?: Date; endTime?: Date }): number {
    if (options.startTime && options.endTime) {
      return (options.endTime.getTime() - options.startTime.getTime()) / (60 * 1000);
    }
    return 60;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) {
      return 0;
    }
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
