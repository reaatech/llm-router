/**
 * Performance Tracker - Latency, success rate, and model ranking
 */

import type { ModelDefinition } from '../types/domain.js';

/** Performance metrics for a model */
export interface ModelPerformance {
  modelId: string;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  successRate: number;
  avgQualityScore: number;
  costEfficiency: number;
  ranking: number;
}

/** Latency sample */
interface LatencySample {
  latencyMs: number;
  success: boolean;
  qualityScore?: number;
  timestamp: number;
}

/** Performance data for a model */
interface ModelPerformanceData {
  samples: LatencySample[];
  totalRequests: number;
  successfulRequests: number;
}

/**
 * Performance Tracker - Tracks model performance metrics
 *
 * Features:
 * - Latency percentiles (P50, P95, P99)
 * - Success rate tracking
 * - Quality vs cost analysis
 * - Model ranking updates
 */
export class PerformanceTracker {
  private modelData: Map<string, ModelPerformanceData> = new Map();
  private maxSamplesPerModel: number;

  constructor(maxSamplesPerModel: number = 1000) {
    this.maxSamplesPerModel = maxSamplesPerModel;
  }

  /** Record a request result */
  record(modelId: string, latencyMs: number, success: boolean, qualityScore?: number): void {
    let data = this.modelData.get(modelId);
    if (!data) {
      data = {
        samples: [],
        totalRequests: 0,
        successfulRequests: 0,
      };
      this.modelData.set(modelId, data);
    }

    data.totalRequests++;
    if (success) {
      data.successfulRequests++;
    }

    data.samples.push({
      latencyMs,
      success,
      qualityScore,
      timestamp: Date.now(),
    });

    // Trim old samples
    if (data.samples.length > this.maxSamplesPerModel) {
      data.samples = data.samples.slice(-this.maxSamplesPerModel);
    }
  }

  /** Get latency percentiles for a model */
  getLatencyPercentiles(modelId: string): { p50: number; p95: number; p99: number } {
    const data = this.modelData.get(modelId);
    if (!data || data.samples.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const latencies = data.samples.map((s) => s.latencyMs).sort((a, b) => a - b);

    return {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    };
  }

  /** Get success rate for a model */
  getSuccessRate(modelId: string): number {
    const data = this.modelData.get(modelId);
    if (!data || data.totalRequests === 0) {
      return 0;
    }

    return data.successfulRequests / data.totalRequests;
  }

  /** Get average quality score for a model */
  getAverageQualityScore(modelId: string): number {
    const data = this.modelData.get(modelId);
    if (!data || data.samples.length === 0) {
      return 0;
    }

    const qualityScores = data.samples
      .filter((s) => s.qualityScore !== undefined)
      .map((s) => s.qualityScore!) as number[];

    if (qualityScores.length === 0) {
      return 0;
    }

    return qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length;
  }

  /** Calculate cost efficiency (quality / cost) */
  calculateCostEfficiency(model: ModelDefinition, avgQualityScore: number): number {
    const avgCost = (model.costPerMillionInput + model.costPerMillionOutput) / 2;
    if (avgCost === 0) {
      return avgQualityScore;
    }
    return avgQualityScore / (avgCost / 100); // Normalize to per-dollar
  }

  /** Get performance metrics for all models */
  getAllPerformance(modelPool: ModelDefinition[]): ModelPerformance[] {
    const performances: ModelPerformance[] = [];

    for (const model of modelPool) {
      const latency = this.getLatencyPercentiles(model.id);
      const successRate = this.getSuccessRate(model.id);
      const avgQuality = this.getAverageQualityScore(model.id);
      const costEfficiency = this.calculateCostEfficiency(model, avgQuality);

      performances.push({
        modelId: model.id,
        latencyP50: latency.p50,
        latencyP95: latency.p95,
        latencyP99: latency.p99,
        successRate,
        avgQualityScore: avgQuality,
        costEfficiency,
        ranking: 0, // Calculated below
      });
    }

    // Calculate rankings based on cost efficiency
    performances.sort((a, b) => b.costEfficiency - a.costEfficiency);
    performances.forEach((p, i) => {
      p.ranking = i + 1;
    });

    return performances;
  }

  /** Get top performing models */
  getTopModels(modelPool: ModelDefinition[], count: number = 3): ModelPerformance[] {
    const all = this.getAllPerformance(modelPool);
    return all.slice(0, count);
  }

  /** Get recent samples for a model */
  getRecentSamples(modelId: string, count: number = 100): LatencySample[] {
    const data = this.modelData.get(modelId);
    if (!data) {
      return [];
    }
    return data.samples.slice(-count);
  }

  /** Clear all data */
  clear(): void {
    this.modelData.clear();
  }

  /** Clear data for a specific model */
  clearModel(modelId: string): boolean {
    return this.modelData.delete(modelId);
  }
}

/** Calculate percentile from sorted array */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) {
    return sortedValues[lower];
  }

  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

/** Default performance tracker instance */
export const performanceTracker = new PerformanceTracker();
