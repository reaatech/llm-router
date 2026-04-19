/**
 * Budget Manager - Per-user/project budget tracking and enforcement
 */

import type { BudgetConfig, BudgetState } from '../types/domain.js';

/** Budget alert event */
export interface BudgetAlert {
  budgetId: string;
  threshold: number;
  spent: number;
  limit: number;
  percentage: number;
  timestamp: Date;
}

/** Budget check result */
export interface BudgetCheckResult {
  allowed: boolean;
  remaining: number;
  limitExceeded: boolean;
  alert?: BudgetAlert;
  reason?: string;
}

/**
 * Budget Manager - Manages budgets and enforces limits
 *
 * Tracks spending per budget ID and enforces soft and hard limits.
 * Supports alerting at configurable thresholds.
 */
export class BudgetManager {
  private budgets: Map<string, BudgetConfig> = new Map();
  private states: Map<string, BudgetState> = new Map();
  private alertListeners: ((alert: BudgetAlert) => void)[] = [];

  constructor() {}

  /**
   * Register a budget configuration
   */
  register(config: BudgetConfig): void {
    if (!config.id || config.id.length === 0) {
      throw new Error('Budget ID cannot be empty');
    }
    if (config.dailyLimit <= 0) {
      throw new Error('Daily limit must be positive');
    }
    for (const threshold of config.alertThresholds) {
      if (threshold < 0 || threshold > 1) {
        throw new Error('Alert thresholds must be between 0 and 1');
      }
    }

    // Sort alert thresholds once at registration time
    const sortedThresholds = [...config.alertThresholds].sort((a, b) => a - b);
    const configWithSorted = { ...config, alertThresholds: sortedThresholds };

    this.budgets.set(config.id, configWithSorted);

    // Initialize state if not exists
    if (!this.states.has(config.id)) {
      this.states.set(config.id, {
        budgetId: config.id,
        spentToday: 0,
        remaining: config.dailyLimit,
        limitExceeded: false,
        alertsTriggered: [],
        lastReset: new Date(),
      });
    }
  }

  /**
   * Register multiple budgets
   */
  registerAll(configs: BudgetConfig[]): void {
    for (const config of configs) {
      this.register(config);
    }
  }

  /**
   * Get a budget configuration
   */
  getConfig(budgetId: string): BudgetConfig | undefined {
    return this.budgets.get(budgetId);
  }

  /**
   * Get budget state
   */
  getState(budgetId: string): BudgetState | undefined {
    return this.states.get(budgetId);
  }

  /**
   * Check if a request can proceed within budget
   */
  checkBudget(budgetId: string, estimatedCost: number): BudgetCheckResult {
    if (estimatedCost < 0) {
      return {
        allowed: false,
        remaining: 0,
        limitExceeded: false,
        reason: 'Estimated cost cannot be negative',
      };
    }

    const config = this.budgets.get(budgetId);
    const state = this.states.get(budgetId);

    if (!config || !state) {
      // No budget configured, allow by default
      return {
        allowed: true,
        remaining: Infinity,
        limitExceeded: false,
      };
    }

    // Check if we need to reset (new day)
    this.checkReset(state, config);

    const remaining = state.remaining;
    const newRemaining = remaining - estimatedCost;
    const limitExceeded = newRemaining < 0;

    if (limitExceeded && config.hardLimit) {
      return {
        allowed: false,
        remaining: 0,
        limitExceeded: true,
        reason: `Budget limit of $${config.dailyLimit.toFixed(2)} exceeded`,
      };
    }

    // Check alert thresholds
    const percentage = state.spentToday / config.dailyLimit;
    let alert: BudgetAlert | undefined;

    for (const threshold of config.alertThresholds) {
      if (percentage >= threshold && !state.alertsTriggered.includes(threshold)) {
        state.alertsTriggered.push(threshold);
        alert = {
          budgetId,
          threshold,
          spent: state.spentToday,
          limit: config.dailyLimit,
          percentage: percentage * 100,
          timestamp: new Date(),
        };
        this.notifyAlertListeners(alert);
        break;
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, newRemaining),
      limitExceeded,
      alert,
      reason: limitExceeded
        ? `Soft limit exceeded. $${remaining.toFixed(4)} remaining, request costs $${estimatedCost.toFixed(4)}`
        : undefined,
    };
  }

  /**
   * Record spending against a budget
   */
  recordSpending(budgetId: string, cost: number): void {
    if (cost < 0) {
      throw new Error('Cost must be non-negative');
    }

    const state = this.states.get(budgetId);
    if (!state) {
      return;
    }

    state.spentToday += cost;
    state.remaining = Math.max(0, state.remaining - cost);
    state.limitExceeded = state.remaining <= 0;
  }

  /**
   * Get remaining budget
   */
  getRemaining(budgetId: string): number {
    const state = this.states.get(budgetId);
    if (!state) {
      return Infinity;
    }

    const config = this.budgets.get(budgetId);
    if (config) {
      this.checkReset(state, config);
    }

    return state.remaining;
  }

  /**
   * Get all budget states
   */
  getAllStates(): Map<string, BudgetState> {
    const result = new Map<string, BudgetState>();
    for (const [id, config] of this.budgets) {
      const state = this.states.get(id);
      if (state) {
        this.checkReset(state, config);
        result.set(id, { ...state });
      }
    }
    return result;
  }

  /**
   * Reset a budget
   */
  reset(budgetId: string): void {
    const config = this.budgets.get(budgetId);
    if (!config) {
      return;
    }

    const state = this.states.get(budgetId);
    if (state) {
      state.spentToday = 0;
      state.remaining = config.dailyLimit;
      state.limitExceeded = false;
      state.alertsTriggered = [];
      state.lastReset = new Date();
    }
  }

  /**
   * Subscribe to budget alerts
   */
  onAlert(listener: (alert: BudgetAlert) => void): () => void {
    this.alertListeners.push(listener);
    return () => {
      const index = this.alertListeners.indexOf(listener);
      if (index !== -1) {
        this.alertListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get budget statistics
   */
  getStats(): {
    totalBudgets: number;
    budgets: Array<{
      budgetId: string;
      dailyLimit: number;
      spentToday: number;
      remaining: number;
      percentageUsed: number;
      limitExceeded: boolean;
    }>;
  } {
    const budgetStats = [];
    for (const [id, config] of this.budgets) {
      const state = this.states.get(id);
      if (state) {
        this.checkReset(state, config);
        budgetStats.push({
          budgetId: id,
          dailyLimit: config.dailyLimit,
          spentToday: state.spentToday,
          remaining: state.remaining,
          percentageUsed: (state.spentToday / config.dailyLimit) * 100,
          limitExceeded: state.limitExceeded,
        });
      }
    }

    return {
      totalBudgets: this.budgets.size,
      budgets: budgetStats,
    };
  }

  private checkReset(state: BudgetState, config: BudgetConfig): void {
    const now = new Date();
    const lastReset = state.lastReset;

    // Check if we've crossed midnight in UTC (consistent daily reset)
    const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const lastResetUTC = Date.UTC(
      lastReset.getFullYear(),
      lastReset.getMonth(),
      lastReset.getDate(),
    );

    if (nowUTC > lastResetUTC) {
      state.spentToday = 0;
      state.remaining = config.dailyLimit;
      state.limitExceeded = false;
      state.alertsTriggered = [];
      state.lastReset = now;
    }
  }

  private notifyAlertListeners(alert: BudgetAlert): void {
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Create a budget manager instance
 */
export function createBudgetManager(): BudgetManager {
  return new BudgetManager();
}
