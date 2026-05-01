import { describe, expect, it } from 'vitest';
import { BudgetManager } from "@reaatech/llm-router-telemetry";

describe('BudgetManager extras', () => {
  it('fires threshold alerts and reports stats', () => {
    const manager = new BudgetManager();
    const alerts: number[] = [];
    manager.register({
      id: 'team',
      dailyLimit: 10,
      alertThresholds: [0.5, 0.75],
      hardLimit: false,
    });
    manager.onAlert((alert) => alerts.push(alert.threshold));

    manager.recordSpending('team', 6);
    const check = manager.checkBudget('team', 1);

    expect(check.allowed).toBe(true);
    expect(alerts).toEqual([0.5]);
    expect(manager.getStats().budgets[0].percentageUsed).toBe(60);
  });

  it('resets budgets when the last reset was on a previous day', () => {
    const manager = new BudgetManager();
    manager.register({
      id: 'team',
      dailyLimit: 10,
      alertThresholds: [0.5],
      hardLimit: true,
    });
    manager.recordSpending('team', 8);

    const state = manager.getState('team');
    if (!state) {
      throw new Error('Expected budget state to exist');
    }
    state.lastReset = new Date('2000-01-01T00:00:00.000Z');

    expect(manager.getRemaining('team')).toBe(10);
    manager.reset('team');
    expect(manager.getState('team')?.spentToday).toBe(0);
  });
});
