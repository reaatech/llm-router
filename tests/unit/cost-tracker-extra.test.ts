import { describe, expect, it } from 'vitest';
import { CostTracker, createCostTracker } from '../../src/telemetry/cost-tracker.js';
import type { ModelDefinition } from '../../src/types/domain.js';

const model: ModelDefinition = {
  id: 'glm-edge',
  provider: 'zhipu',
  costPerMillionInput: 0.3,
  costPerMillionOutput: 0.6,
  maxTokens: 128000,
  capabilities: ['general'],
};

describe('CostTracker extras', () => {
  it('calculates estimates, aggregations, and grouped breakdowns', () => {
    const tracker = createCostTracker();

    tracker.record({
      requestId: 'req-1',
      modelId: 'glm-edge',
      cost: 1,
      inputTokens: 100,
      outputTokens: 50,
      strategy: 'cost-optimized',
      budgetId: 'team-a',
    });
    tracker.record({
      requestId: 'req-2',
      modelId: 'glm-edge',
      cost: 2,
      inputTokens: 200,
      outputTokens: 100,
      strategy: 'cost-optimized',
      budgetId: 'team-a',
    });
    tracker.record({
      requestId: 'req-3',
      modelId: 'kat-coder-pro',
      cost: 3,
      inputTokens: 300,
      outputTokens: 150,
      strategy: 'judgment-based',
      budgetId: 'team-b',
    });

    expect(tracker.calculateCost(model, 1_000_000, 1_000_000)).toBeCloseTo(0.9);
    expect(tracker.estimateCost(model, 1000)).toBeCloseTo(0.0006);
    expect(tracker.getTotalCost({ budgetId: 'team-a' })).toBe(3);

    expect(tracker.getAggregation({ budgetId: 'missing' })).toMatchObject({
      totalCost: 0,
      requestCount: 0,
      averageCostPerRequest: 0,
    });

    const byModel = tracker.getCostByModel();
    expect(byModel).toHaveLength(2);
    expect(byModel.find((entry) => entry.modelId === 'glm-edge')?.percentage).toBe(50);

    const byStrategy = tracker.getCostByStrategy();
    expect(byStrategy.find((entry) => entry.strategy === 'cost-optimized')).toMatchObject({
      cost: 3,
      requestCount: 2,
      percentage: 50,
    });
  });

  it('detects anomalies, limits retained entries, and clears state', () => {
    const tracker = new CostTracker(10);

    const costs = [1, 2, 1, 2, 1, 2, 10];
    for (let index = 0; index < costs.length; index++) {
      tracker.record({
        requestId: `req-${index}`,
        modelId: 'glm-edge',
        cost: costs[index],
        inputTokens: 10,
        outputTokens: 5,
        strategy: 'cost-optimized',
      });
    }

    expect(tracker.getEntryCount()).toBe(7);
    expect(tracker.getRecentEntries(2).map((entry) => entry.requestId)).toEqual(['req-5', 'req-6']);
    expect(
      tracker.detectAnomalies({
        threshold: 1,
        windowSize: 2,
      })[0],
    ).toMatchObject({
      requestId: 'req-6',
      expectedCost: 1.5,
    });

    const limitedTracker = new CostTracker(3);
    for (let index = 0; index < 5; index++) {
      limitedTracker.record({
        requestId: `trim-${index}`,
        modelId: 'glm-edge',
        cost: 1,
        inputTokens: 10,
        outputTokens: 5,
        strategy: 'cost-optimized',
      });
    }
    expect(limitedTracker.getRecentEntries().map((entry) => entry.requestId)).toEqual([
      'trim-2',
      'trim-3',
      'trim-4',
    ]);

    tracker.clear();
    expect(tracker.getEntryCount()).toBe(0);
  });
});
