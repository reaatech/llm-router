import { BudgetManager } from '@reaatech/llm-router-telemetry';
import { describe, expect, it } from 'vitest';

describe('BudgetManager', () => {
  it('enforces hard budget limits', () => {
    const manager = new BudgetManager();
    manager.register({
      id: 'default',
      dailyLimit: 1,
      alertThresholds: [0.5],
      hardLimit: true,
    });

    manager.recordSpending('default', 0.8);
    const result = manager.checkBudget('default', 0.3);

    expect(result.allowed).toBe(false);
    expect(result.limitExceeded).toBe(true);
  });
});
