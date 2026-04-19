import { describe, expect, it } from 'vitest';
import { BudgetManager } from '../../src/telemetry/budget-manager.js';
import { CostTracker } from '../../src/telemetry/cost-tracker.js';
import { CostReporter } from '../../src/telemetry/cost-reporter.js';

describe('CostReporter', () => {
  it('builds a cost report with budget details', () => {
    const tracker = new CostTracker();
    const budgets = new BudgetManager();
    budgets.register({
      id: 'team-alpha',
      dailyLimit: 10,
      alertThresholds: [0.5],
      hardLimit: true,
    });
    budgets.recordSpending('team-alpha', 1.25);
    tracker.record({
      requestId: 'req-1',
      modelId: 'glm-edge',
      cost: 1.25,
      inputTokens: 100,
      outputTokens: 50,
      strategy: 'cost-optimized',
      budgetId: 'team-alpha',
    });

    const reporter = new CostReporter(tracker, budgets);
    const report = reporter.getReport({ budgetId: 'team-alpha' });

    expect(report.totalCost).toBe(1.25);
    expect(report.totalRequests).toBe(1);
    expect(report.budget?.remaining).toBe(8.75);
  });
});
