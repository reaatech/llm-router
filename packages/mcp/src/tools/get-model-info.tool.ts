import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { RouterInterface } from './mcp-server.js';

export const getModelInfoTool: Tool = {
  name: 'get_model_info',
  description: 'Get information about configured models',
  inputSchema: {
    type: 'object',
    properties: {
      model_id: { type: 'string' },
    },
  },
};

export function handleGetModelInfoTool(
  router: RouterInterface,
  args: Record<string, unknown>,
): { content: Array<{ type: 'text'; text: string }> } {
  const modelId = typeof args.model_id === 'string' ? args.model_id : undefined;
  const models = router.getModels();
  const payload =
    modelId !== undefined ? (models.find((model) => model.id === modelId) ?? null) : models;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}
