/**
 * Quality Scorer - Pluggable quality scoring for routing decisions
 */

import type {
  ModelDefinition,
  QualityScore,
  RoutingRequest,
  RoutingResult,
} from "@reaatech/llm-router-core";

export type { QualityScore };

/** Human feedback entry */
export interface HumanFeedback {
  /** Request/result identifier */
  requestId: string;
  /** Score (1-5 scale) */
  score: number;
  /** Optional detailed feedback */
  feedback?: string;
  /** Reviewer identifier */
  reviewerId?: string;
  /** Timestamp of feedback */
  timestamp?: Date;
}

/** Scoring criteria configuration */
export interface ScoringCriteria {
  /** Weight for relevance (default: 0.33) */
  relevanceWeight?: number;
  /** Weight for correctness (default: 0.34) */
  correctnessWeight?: number;
  /** Weight for completeness (default: 0.33) */
  completenessWeight?: number;
  /** Weight for human feedback in blended score (default: 0) */
  humanFeedbackWeight?: number;
}

/** Scorer function type */
export type ScorerFunction = (
  request: RoutingRequest,
  result: RoutingResult,
  model: ModelDefinition,
) => Promise<QualityScore>;

/**
 * Human Feedback Store - Stores and retrieves human feedback scores
 */
export class HumanFeedbackStore {
  private feedback: Map<string, HumanFeedback[]> = new Map();

  submit(feedback: HumanFeedback): void {
    const key = feedback.requestId;
    const existing = this.feedback.get(key) ?? [];
    existing.push({
      ...feedback,
      timestamp: feedback.timestamp ?? new Date(),
    });
    this.feedback.set(key, existing);
  }

  getAverageScore(requestId: string): number | null {
    const entries = this.feedback.get(requestId);
    if (!entries || entries.length === 0) {
      return null;
    }
    const sum = entries.reduce((acc, f) => acc + f.score, 0);
    return sum / entries.length;
  }

  getFeedback(requestId: string): HumanFeedback[] {
    return this.feedback.get(requestId) ?? [];
  }

  getAllFeedback(): HumanFeedback[] {
    const all: HumanFeedback[] = [];
    for (const entries of this.feedback.values()) {
      all.push(...entries);
    }
    return all;
  }

  getAverageScoreByModel(): Map<string, number> {
    const modelScores = new Map<string, number[]>();
    for (const entries of this.feedback.values()) {
      for (const f of entries) {
        if (f.reviewerId !== undefined && f.reviewerId.length > 0) {
          const existing = modelScores.get(f.reviewerId) ?? [];
          existing.push(f.score);
          modelScores.set(f.reviewerId, existing);
        }
      }
    }
    const averages = new Map<string, number>();
    for (const [modelId, scores] of modelScores) {
      averages.set(modelId, scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    return averages;
  }

  clear(): void {
    this.feedback.clear();
  }
}

/**
 * Quality Scorer - Evaluates response quality
 */
export class QualityScorer {
  private scorers: Map<string, ScorerFunction> = new Map();
  private defaultScorer: string | null = null;
  private feedbackStore: HumanFeedbackStore | null = null;

  constructor(feedbackStore?: HumanFeedbackStore) {
    this.feedbackStore = feedbackStore ?? null;
  }

  setFeedbackStore(store: HumanFeedbackStore): void {
    this.feedbackStore = store;
  }

  /** Register a scoring function */
  register(name: string, scorer: ScorerFunction, isDefault = false): void {
    this.scorers.set(name, scorer);
    if (isDefault) {
      this.defaultScorer = name;
    }
  }

  /** Get a scorer by name */
  get(name: string): ScorerFunction | undefined {
    return this.scorers.get(name);
  }

  /** Set default scorer */
  setDefault(name: string): void {
    if (!this.scorers.has(name)) {
      throw new Error(`Scorer '${name}' not found`);
    }
    this.defaultScorer = name;
  }

  /** Score a response using the default or specified scorer */
  async score(
    request: RoutingRequest,
    result: RoutingResult,
    model: ModelDefinition,
    scorerName?: string,
  ): Promise<QualityScore> {
    const name = scorerName ?? this.defaultScorer;
    if (name === null || name === undefined || name.length === 0) {
      throw new Error('No default scorer configured');
    }

    const scorer = this.scorers.get(name);
    if (!scorer) {
      throw new Error(`Scorer '${name}' not found`);
    }

    return scorer(request, result, model);
  }

  /** Calculate weighted overall score */
  calculateWeightedScore(
    score: QualityScore,
    criteria: ScoringCriteria = {},
    humanScore?: number,
  ): number {
    const relevanceWeight = criteria.relevanceWeight ?? 0.33;
    const correctnessWeight = criteria.correctnessWeight ?? 0.34;
    const completenessWeight = criteria.completenessWeight ?? 0.33;
    const humanWeight = criteria.humanFeedbackWeight ?? 0;

    const automatedScore =
      (score.relevance ?? 0) * relevanceWeight +
      (score.correctness ?? 0) * correctnessWeight +
      (score.completeness ?? 0) * completenessWeight;

    if (humanWeight > 0 && humanScore !== undefined && humanScore !== null) {
      const normalizedHumanScore = humanScore;
      const automatedComponent = automatedScore * (1 - humanWeight);
      const humanComponent = normalizedHumanScore * humanWeight;
      return automatedComponent + humanComponent;
    }

    return automatedScore;
  }

  /** Score a response with optional human feedback blending */
  async scoreWithFeedback(
    request: RoutingRequest,
    result: RoutingResult,
    model: ModelDefinition,
    criteria: ScoringCriteria = {},
  ): Promise<QualityScore> {
    const automatedScore = await this.score(request, result, model);

    if (this.feedbackStore) {
      const humanAvg = this.feedbackStore.getAverageScore(result.requestId);
      if (humanAvg !== null) {
        const blendedOverall = this.calculateWeightedScore(automatedScore, criteria, humanAvg);
        return {
          ...automatedScore,
          overall: Math.round(blendedOverall),
          explanation: `Blended score (automated + ${(criteria.humanFeedbackWeight ?? 0) * 100}% human feedback)`,
        };
      }
    }

    return automatedScore;
  }

  /** Get all registered scorer names */
  getScorerNames(): string[] {
    return Array.from(this.scorers.keys());
  }
}

/**
 * Rule-based scorer - Simple heuristic scoring
 */
export function createRuleBasedScorer(): ScorerFunction {
  return async (_request, result, _model) => {
    const content = result.content;

    // Relevance: Check if response addresses the prompt
    const relevance = checkRelevance(content);

    // Correctness: Check for error indicators
    const correctness = checkCorrectness(content);

    // Completeness: Check response length and structure
    const completeness = checkCompleteness(content);

    const overall = (relevance + correctness + completeness) / 3;

    return {
      overall: Math.round(overall),
      relevance,
      correctness,
      completeness,
      explanation: 'Rule-based scoring',
    };
  };
}

function checkRelevance(response: string): number {
  if (response.length === 0 || response.trim().length === 0) {
    return 1;
  }
  if (response.includes("I don't know") || response.includes('I cannot')) {
    return 2;
  }
  return 4;
}

function checkCorrectness(response: string): number {
  const errorPatterns = [/error/i, /failed/i, /unable to/i, /cannot process/i];
  const hasErrors = errorPatterns.some((p) => p.test(response));
  if (hasErrors) {
    return 2;
  }
  return 4;
}

function checkCompleteness(response: string): number {
  const length = response.length;
  if (length < 10) {
    return 1;
  }
  if (length < 50) {
    return 2;
  }
  if (length < 200) {
    return 3;
  }
  if (length < 500) {
    return 4;
  }
  return 5;
}

/** Default quality scorer instance */
export const qualityScorer = new QualityScorer();

/** Default human feedback store instance */
export const humanFeedbackStore = new HumanFeedbackStore();

// Register default rule-based scorer
qualityScorer.register('rule-based', createRuleBasedScorer(), true);

/**
 * Create a quality scorer with human feedback integration
 */
export function createQualityScorerWithFeedback(): QualityScorer {
  const scorer = new QualityScorer(humanFeedbackStore);
  scorer.register('rule-based', createRuleBasedScorer(), true);
  return scorer;
}
