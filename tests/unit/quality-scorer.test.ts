import { describe, expect, it } from 'vitest';
import {
  QualityScorer,
  createRuleBasedScorer,
  HumanFeedbackStore,
  createQualityScorerWithFeedback,
} from '../../src/eval/quality-scorer.js';

describe('QualityScorer', () => {
  it('scores using the registered default scorer', async () => {
    const scorer = new QualityScorer();
    scorer.register('default', createRuleBasedScorer(), true);

    const result = await scorer.score(
      { prompt: 'hello' },
      {
        decision: {
          modelId: 'glm-edge',
          strategy: 'cost-optimized',
          estimatedCost: 0.001,
          estimatedInputTokens: 1,
          estimatedOutputTokens: 1,
          isFallback: false,
          fallbackPosition: 0,
          alternativesConsidered: [],
          selectionReason: 'cheap',
        },
        actualCost: 0.001,
        actualInputTokens: 1,
        actualOutputTokens: 1,
        latencyMs: 10,
        content: 'Here is a useful answer.',
        success: true,
        requestId: 'req-1',
        completedAt: new Date(),
      },
      {
        id: 'glm-edge',
        provider: 'zhipu',
        costPerMillionInput: 0.3,
        costPerMillionOutput: 0.6,
        maxTokens: 128000,
        capabilities: ['general'],
      },
    );

    expect(result.overall).toBeGreaterThan(0);
    expect(scorer.calculateWeightedScore(result)).toBeGreaterThan(0);
  });

  it('blends human feedback into weighted score', () => {
    const scorer = new QualityScorer();
    const score = {
      overall: 4,
      relevance: 4,
      correctness: 4,
      completeness: 4,
    };
    const blended = scorer.calculateWeightedScore(score, { humanFeedbackWeight: 0.5 }, 2);
    const automated = scorer.calculateWeightedScore(score, {});
    expect(blended).toBeLessThan(automated);
    expect(blended).toBeGreaterThan(0);
  });
});

describe('HumanFeedbackStore', () => {
  it('stores and retrieves feedback by request id', () => {
    const store = new HumanFeedbackStore();
    store.submit({ requestId: 'req-1', score: 4, feedback: 'good', reviewerId: 'user-1' });
    store.submit({ requestId: 'req-1', score: 5, feedback: 'excellent', reviewerId: 'user-2' });

    expect(store.getAverageScore('req-1')).toBe(4.5);
    expect(store.getFeedback('req-1').length).toBe(2);
    expect(store.getAverageScore('nonexistent')).toBeNull();
  });

  it('returns all feedback', () => {
    const store = new HumanFeedbackStore();
    store.submit({ requestId: 'req-1', score: 4, reviewerId: 'user-1' });
    store.submit({ requestId: 'req-2', score: 3, reviewerId: 'user-2' });

    const all = store.getAllFeedback();
    expect(all.length).toBe(2);
  });

  it('computes average score by model', () => {
    const store = new HumanFeedbackStore();
    store.submit({ requestId: 'req-1', score: 4, reviewerId: 'glm-edge' });
    store.submit({ requestId: 'req-2', score: 2, reviewerId: 'glm-edge' });
    store.submit({ requestId: 'req-3', score: 5, reviewerId: 'kat-coder-pro' });

    const averages = store.getAverageScoreByModel();
    expect(averages.get('glm-edge')).toBe(3);
    expect(averages.get('kat-coder-pro')).toBe(5);
  });

  it('clears all feedback', () => {
    const store = new HumanFeedbackStore();
    store.submit({ requestId: 'req-1', score: 4 });
    store.clear();
    expect(store.getAllFeedback().length).toBe(0);
  });
});

describe('QualityScorer with human feedback', () => {
  it('blends automated and human scores when feedback is available', async () => {
    const feedbackStore = new HumanFeedbackStore();
    feedbackStore.submit({
      requestId: 'req-1',
      score: 2,
      reviewerId: 'human-reviewer',
    });

    const scorer = new QualityScorer(feedbackStore);
    scorer.register('default', createRuleBasedScorer(), true);

    const result = await scorer.scoreWithFeedback(
      { prompt: 'hello' },
      {
        decision: {
          modelId: 'glm-edge',
          strategy: 'cost-optimized',
          estimatedCost: 0.001,
          estimatedInputTokens: 1,
          estimatedOutputTokens: 1,
          isFallback: false,
          fallbackPosition: 0,
          alternativesConsidered: [],
          selectionReason: 'cheap',
        },
        actualCost: 0.001,
        actualInputTokens: 1,
        actualOutputTokens: 1,
        latencyMs: 10,
        content: 'Here is a useful answer.',
        success: true,
        requestId: 'req-1',
        completedAt: new Date(),
      },
      {
        id: 'glm-edge',
        provider: 'zhipu',
        costPerMillionInput: 0.3,
        costPerMillionOutput: 0.6,
        maxTokens: 128000,
        capabilities: ['general'],
      },
      { humanFeedbackWeight: 0.5 },
    );

    expect(result.overall).toBeLessThan(4);
  });

  it('falls back to automated score when no feedback exists', async () => {
    const feedbackStore = new HumanFeedbackStore();
    const scorer = new QualityScorer(feedbackStore);
    scorer.register('default', createRuleBasedScorer(), true);

    const result = await scorer.scoreWithFeedback(
      { prompt: 'hello' },
      {
        decision: {
          modelId: 'glm-edge',
          strategy: 'cost-optimized',
          estimatedCost: 0.001,
          estimatedInputTokens: 1,
          estimatedOutputTokens: 1,
          isFallback: false,
          fallbackPosition: 0,
          alternativesConsidered: [],
          selectionReason: 'cheap',
        },
        actualCost: 0.001,
        actualInputTokens: 1,
        actualOutputTokens: 1,
        latencyMs: 10,
        content: 'Here is a useful answer.',
        success: true,
        requestId: 'req-new',
        completedAt: new Date(),
      },
      {
        id: 'glm-edge',
        provider: 'zhipu',
        costPerMillionInput: 0.3,
        costPerMillionOutput: 0.6,
        maxTokens: 128000,
        capabilities: ['general'],
      },
    );

    expect(result.overall).toBeGreaterThan(0);
  });
});

describe('createQualityScorerWithFeedback', () => {
  it('creates a scorer with feedback integration pre-configured', async () => {
    const scorer = createQualityScorerWithFeedback();
    expect(scorer).toBeInstanceOf(QualityScorer);
    expect(scorer.getScorerNames()).toContain('rule-based');
  });
});
