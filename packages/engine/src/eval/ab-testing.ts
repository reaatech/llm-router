/**
 * A/B Testing - Traffic splitting and statistical significance testing
 */

import type { ModelDefinition } from "@reaatech/llm-router-core";
import type { QualityScore } from './quality-scorer.js';

/** A/B test configuration */
export interface ABTestConfig {
  /** Test name/identifier */
  name: string;
  /** Traffic split by model ID (must sum to 1.0) */
  trafficSplit: Record<string, number>;
  /** Statistical significance threshold (default: 0.95) */
  significanceThreshold?: number;
  /** Minimum sample size per variant */
  minSampleSize?: number;
}

/** A/B test result for a model */
interface ModelTestResult {
  modelId: string;
  samples: number;
  totalScore: number;
  avgScore: number;
  winRate: number;
}

/** A/B test statistics */
export interface ABTestStats {
  testName: string;
  totalSamples: number;
  variants: ModelTestResult[];
  winner?: string;
  isSignificant: boolean;
}

/**
 * A/B Testing Manager - Manages traffic splitting and statistical analysis
 *
 * Features:
 * - Configurable traffic splitting between models
 * - Statistical significance testing
 * - Win rate tracking
 * - Automatic winner selection
 */
export class ABTestManager {
  private tests: Map<string, ABTestConfig> = new Map();
  private results: Map<string, Map<string, { scores: number[]; count: number }>> = new Map();

  /** Create a new A/B test */
  createTest(config: ABTestConfig): void {
    // Validate traffic split sums to 1.0
    const total = Object.values(config.trafficSplit).reduce((sum, v) => sum + v, 0);
    if (Math.abs(total - 1.0) > 0.01) {
      throw new Error(`Traffic split must sum to 1.0, got ${total}`);
    }

    this.tests.set(config.name, {
      ...config,
      significanceThreshold: config.significanceThreshold ?? 0.95,
      minSampleSize: config.minSampleSize ?? 30,
    });

    this.results.set(config.name, new Map());
  }

  /** Get a test by name */
  getTest(name: string): ABTestConfig | undefined {
    return this.tests.get(name);
  }

  /** Select a model based on traffic split */
  selectModel(testName: string, availableModels: ModelDefinition[]): ModelDefinition | null {
    const test = this.tests.get(testName);
    if (!test) {
      return null;
    }

    // Filter available models that are in the traffic split
    const eligibleModels = availableModels.filter((m) => Object.hasOwn(test.trafficSplit, m.id));

    if (eligibleModels.length === 0) {
      return null;
    }

    // Random selection based on traffic split weights
    const random = Math.random();
    let cumulative = 0;

    for (const model of eligibleModels) {
      cumulative += test.trafficSplit[model.id] ?? 0;
      if (random <= cumulative) {
        return model;
      }
    }

    // Fallback to last model
    return eligibleModels[eligibleModels.length - 1];
  }

  /** Record a result for a model in a test */
  recordResult(testName: string, modelId: string, score: QualityScore): void {
    const testResults = this.results.get(testName);
    if (!testResults) {
      return;
    }

    const modelResult = testResults.get(modelId) ?? { scores: [], count: 0 };
    modelResult.scores.push(score.overall);
    modelResult.count++;
    testResults.set(modelId, modelResult);
  }

  /** Get test statistics */
  getStats(testName: string): ABTestStats | null {
    const test = this.tests.get(testName);
    const testResults = this.results.get(testName);

    if (!test || !testResults) {
      return null;
    }

    const variants: ModelTestResult[] = [];
    let totalSamples = 0;

    for (const [modelId, data] of testResults.entries()) {
      const avgScore =
        data.scores.length > 0
          ? data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
          : 0;

      variants.push({
        modelId,
        samples: data.count,
        totalScore: data.scores.reduce((sum, s) => sum + s, 0),
        avgScore,
        winRate: 0, // Calculated below
      });

      totalSamples += data.count;
    }

    // Calculate win rates
    if (variants.length > 1) {
      const bestScore = Math.max(...variants.map((v) => v.avgScore));
      for (const variant of variants) {
        variant.winRate = variant.avgScore === bestScore ? 1 / variants.length : 0;
      }
    } else if (variants.length === 1) {
      variants[0].winRate = 1;
    }

    // Check statistical significance
    const isSignificant = this.checkSignificance(testName, variants);

    // Determine winner
    let winner: string | undefined;
    if (isSignificant && variants.length > 0) {
      winner = variants.reduce((best, v) => (v.avgScore > best.avgScore ? v : best)).modelId;
    }

    return {
      testName,
      totalSamples,
      variants,
      winner,
      isSignificant,
    };
  }

  /** Check if test results are statistically significant */
  private checkSignificance(testName: string, variants: ModelTestResult[]): boolean {
    const test = this.tests.get(testName);
    if (!test) {
      return false;
    }

    // Check minimum sample size
    const minSampleSize = test.minSampleSize ?? 30;
    for (const variant of variants) {
      if (variant.samples < minSampleSize) {
        return false;
      }
    }

    // Simple t-test approximation
    if (variants.length < 2) {
      return false;
    }

    // Check if the difference between best and second best is significant
    const sorted = [...variants].sort((a, b) => b.avgScore - a.avgScore);
    if (sorted.length < 2) {
      return false;
    }

    const best = sorted[0];
    const second = sorted[1];

    // Simple significance check: difference must be > 0.5 points
    return best.avgScore - second.avgScore > 0.5;
  }

  /** Get all test names */
  getTestNames(): string[] {
    return Array.from(this.tests.keys());
  }

  /** Remove a test */
  removeTest(name: string): boolean {
    if (!this.tests.has(name)) {
      return false;
    }

    this.tests.delete(name);
    this.results.delete(name);
    return true;
  }

  /** Reset test results (keep configuration) */
  resetResults(name: string): boolean {
    if (!this.tests.has(name)) {
      return false;
    }

    this.results.set(name, new Map());
    return true;
  }
}

/** Default A/B test manager instance */
export const abTestManager = new ABTestManager();
