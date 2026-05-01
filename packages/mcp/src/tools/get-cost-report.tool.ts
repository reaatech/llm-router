import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { RouterInterface } from './mcp-server.js';

export const getCostReportTool: Tool = {
  name: 'get_cost_report',
  description: 'Get a cost and budget summary',
  inputSchema: {
    type: 'object',
    properties: {
      budget_id: { type: 'string' },
      period: { type: 'string', enum: ['today', 'week', 'month'] },
    },
  },
};

export function handleGetCostReportTool(
  router: RouterInterface,
  args: Record<string, unknown>,
): { content: Array<{ type: 'text'; text: string }> } {
  const budgetId = typeof args.budget_id === 'string' ? args.budget_id : undefined;
  const budget = router.getBudget(budgetId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            budget_id: budgetId ?? 'default',
            period: typeof args.period === 'string' ? args.period : 'today',
            daily_limit: budget?.dailyLimit ?? null,
            remaining: budget?.remaining ?? null,
            spent_today: budget?.spentToday ?? null,
          },
          null,
          2,
        ),
      },
    ],
  };
}
