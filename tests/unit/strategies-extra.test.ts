import { describe, expect, it } from 'vitest';
import { JudgmentBasedStrategy } from '../../src/strategies/judgment-based.strategy.js';
import { LatencyOptimizedStrategy } from '../../src/strategies/latency-optimized.strategy.js';
import type { ModelDefinition, RoutingContext } from '../../src/types/domain.js';

const context: RoutingContext = {
  timestamp: new Date(),
  requestId: 'req-1',
  latencyHistory: new Map([
    ['fast-model', 100],
    ['slow-model', 2000],
  ]),
  circuitBreakerStates: new Map([
    ['fast-model', 'HALF_OPEN'],
    ['slow-model', 'CLOSED'],
  ]),
};

const models: ModelDefinition[] = [
  {
    id: 'workhorse',
    provider: 'kuaishou',
    costPerMillionInput: 0.5,
    costPerMillionOutput: 1,
    maxTokens: 32000,
    capabilities: ['code', 'reasoning'],
  },
  {
    id: 'judge-cheap',
    provider: 'openai',
    costPerMillionInput: 10,
    costPerMillionOutput: 30,
    maxTokens: 128000,
    capabilities: ['evaluation', 'reasoning', 'code'],
  },
  {
    id: 'judge-expensive',
    provider: 'anthropic',
    costPerMillionInput: 15,
    costPerMillionOutput: 75,
    maxTokens: 200000,
    capabilities: ['evaluation', 'complex-reasoning'],
  },
  {
    id: 'fast-model',
    provider: 'zhipu',
    costPerMillionInput: 0.3,
    costPerMillionOutput: 0.6,
    maxTokens: 128000,
    capabilities: ['general'],
  },
  {
    id: 'slow-model',
    provider: 'moonshot',
    costPerMillionInput: 0.8,
    costPerMillionOutput: 1.6,
    maxTokens: 128000,
    capabilities: ['general'],
  },
];

describe('strategy extras', () => {
  it('escalates complex requests to a judge and exposes config', () => {
    const strategy = new JudgmentBasedStrategy({
      workhorsePool: ['workhorse'],
      judgePool: ['judge-cheap', 'judge-expensive'],
      escalationThreshold: 0.7,
    });

    const result = strategy.select(
      {
        prompt:
          'Analyze, debug, evaluate, and explain why this complex function import class interface fails',
        strategy: 'judgment-based',
        userTier: 'premium',
        requiredCapabilities: ['code'],
      },
      context,
      models,
    );

    expect(result?.model.id).toBe('judge-cheap');
    expect(strategy.getConfig()).toMatchObject({
      escalationThreshold: 0.7,
    });
  });

  it('falls back to a workhorse or any available model when judges are not usable', () => {
    const strategy = new JudgmentBasedStrategy({
      workhorsePool: ['missing-workhorse'],
      judgePool: ['missing-judge'],
    });

    const result = strategy.select(
      {
        prompt: 'simple prompt',
        confidenceThreshold: 1,
      },
      context,
      models.slice(0, 1),
    );

    expect(result?.model.id).toBe('workhorse');
  });

  it('judgment strategy requires workhorse and judge pools at construction', () => {
    const strategy = new JudgmentBasedStrategy({
      workhorsePool: ['workhorse'],
      judgePool: ['judge'],
    });

    expect(strategy.name).toBe('judgment-based');
    expect(strategy.getConfig()).toEqual(
      expect.objectContaining({
        workhorsePool: ['workhorse'],
        judgePool: ['judge'],
      }),
    );
  });

  it('selects the fastest model and respects target p99 filtering', () => {
    const strategy = new LatencyOptimizedStrategy({
      modelPool: ['fast-model', 'slow-model'],
      targetP99Ms: 500,
      defaultTimeoutMs: 3000,
    });

    const result = strategy.select(
      {
        prompt: 'hello',
        strategy: 'latency-optimized',
      },
      context,
      models,
    );

    expect(result?.model.id).toBe('fast-model');
    strategy.updateConfig({ targetP99Ms: 50 });
    const stillReturns = strategy.select(
      { prompt: 'hello', strategy: 'latency-optimized' },
      context,
      models,
    );
    expect(stillReturns?.model.id).toBe('fast-model');
  });
});
