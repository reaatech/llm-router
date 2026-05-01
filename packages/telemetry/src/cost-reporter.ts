/**
 * Cost reporting utilities.
 */

import type { BudgetManager } from './budget-manager.js';
import type { CostTracker } from './cost-tracker.js';

export interface CostReport {
  totalCost: number;
  totalRequests: number;
  byModel: ReturnType<CostTracker['getCostByModel']>;
  byStrategy: ReturnType<CostTracker['getCostByStrategy']>;
  budget?: {
    id: string;
    dailyLimit: number;
    remaining: number;
    spentToday: number;
  };
}

export class CostReporter {
  constructor(
    private readonly tracker: CostTracker,
    private readonly budgetManager: BudgetManager,
  ) {}

  getReport(options: { budgetId?: string; startTime?: Date; endTime?: Date } = {}): CostReport {
    const aggregation = this.tracker.getAggregation(options);
    const budgetId = options.budgetId;
    const config =
      budgetId !== undefined && budgetId.length > 0
        ? this.budgetManager.getConfig(budgetId)
        : undefined;
    const state =
      budgetId !== undefined && budgetId.length > 0
        ? this.budgetManager.getState(budgetId)
        : undefined;

    return {
      totalCost: aggregation.totalCost,
      totalRequests: aggregation.requestCount,
      byModel: this.tracker.getCostByModel({
        startTime: options.startTime,
        endTime: options.endTime,
      }),
      byStrategy: this.tracker.getCostByStrategy({
        startTime: options.startTime,
        endTime: options.endTime,
      }),
      budget:
        budgetId !== undefined && budgetId.length > 0 && config !== undefined && state !== undefined
          ? {
              id: budgetId,
              dailyLimit: config.dailyLimit,
              remaining: state.remaining,
              spentToday: state.spentToday,
            }
          : undefined,
    };
  }
}
