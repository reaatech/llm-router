/**
 * Cost report command.
 */

import { LLMRouter, loadRouterConfig } from '@reaatech/llm-router-engine';
import { writeError, writeLine } from '../output.js';

interface CostReportOptions {
  budgetId?: string;
  period: string;
  config: string;
}

export async function costReportCommand(options: CostReportOptions): Promise<void> {
  try {
    const config = loadRouterConfig(options.config);
    const router = LLMRouter.fromConfig(config);
    const report = router.costReporter.getReport({
      budgetId: options.budgetId,
      ...resolvePeriod(options.period),
    });

    writeLine('Cost Report');
    writeLine(`Period: ${options.period}`);
    writeLine(`Total requests: ${report.totalRequests}`);
    writeLine(`Total cost: $${report.totalCost.toFixed(6)}`);

    if (report.budget) {
      writeLine(`Budget: ${report.budget.id}`);
      writeLine(`Remaining: $${report.budget.remaining.toFixed(4)}`);
      writeLine(`Spent today: $${report.budget.spentToday.toFixed(4)}`);
    }

    for (const entry of report.byModel) {
      writeLine(
        `${entry.modelId}: $${entry.cost.toFixed(6)} across ${entry.requestCount} requests`,
      );
    }
  } catch (error) {
    writeError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

function resolvePeriod(period: string): { startTime: Date } {
  const now = new Date();
  switch (period) {
    case 'month':
      return { startTime: new Date(now.getFullYear(), now.getMonth(), 1) };
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return { startTime: start };
    }
    default:
      return { startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  }
}
