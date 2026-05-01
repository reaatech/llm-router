import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { RouterInterface } from './mcp-server.js';

const VALID_CAPABILITIES = [
  'code',
  'reasoning',
  'vision',
  'analysis',
  'long-context',
  'general',
  'chinese',
  'evaluation',
  'complex-reasoning',
];
const VALID_USER_TIERS = ['free', 'standard', 'premium'];

export const routeRequestTool: Tool = {
  name: 'route_request',
  description: 'Route a request to the optimal LLM model',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The prompt to route' },
      strategy: {
        type: 'string',
        description: 'Configured strategy name or built-in strategy identifier to use for routing',
      },
      max_tokens: { type: 'number' },
      budget_id: { type: 'string' },
      required_capabilities: { type: 'array', items: { type: 'string' } },
      user_tier: { type: 'string', enum: ['free', 'standard', 'premium'] },
    },
    required: ['prompt'],
  },
};

export async function handleRouteRequestTool(
  router: RouterInterface,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  let userTier: 'free' | 'standard' | 'premium' | undefined;
  if (typeof args.user_tier === 'string' && VALID_USER_TIERS.includes(args.user_tier)) {
    userTier = args.user_tier as 'free' | 'standard' | 'premium';
  }

  const requiredCapabilities = Array.isArray(args.required_capabilities)
    ? args.required_capabilities.filter(
        (v): v is string => typeof v === 'string' && VALID_CAPABILITIES.includes(v),
      )
    : undefined;

  const result = await router.route({
    prompt: String(args.prompt ?? ''),
    strategy: typeof args.strategy === 'string' ? args.strategy : undefined,
    maxTokens: typeof args.max_tokens === 'number' ? args.max_tokens : undefined,
    budgetId: typeof args.budget_id === 'string' ? args.budget_id : undefined,
    requiredCapabilities,
    userTier,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            model: result.model.id,
            strategy: result.strategy,
            cost: result.cost,
            confidence: result.confidence,
            latency_ms: result.latencyMs,
          },
          null,
          2,
        ),
      },
    ],
  };
}
