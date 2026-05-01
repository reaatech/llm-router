import { describe, expect, it } from 'vitest';
import { MCPServer } from "./mcp-server.js";
import type { RouterInterface } from "./mcp-server.js";
import { handleGetCostReportTool } from "./tools/get-cost-report.tool.js";
import { handleGetModelInfoTool } from "./tools/get-model-info.tool.js";
import { handleRouteRequestTool } from "./tools/route-request.tool.js";

describe('MCPServer', () => {
  it('returns helpful errors for uninitialized, unknown, and failing tool calls', async () => {
    const server = new MCPServer();
    const handler = server as unknown as {
      handleToolCall: (
        name: string,
        args?: Record<string, unknown>,
      ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
    };

    expect((await handler.handleToolCall('route_request')).content[0].text).toContain(
      'Router not initialized',
    );

    server.setRouter({
      getModels: () => [],
      route: async () => {
        throw new Error('broken route');
      },
      getBudget: () => null,
    });

    expect((await handler.handleToolCall('unknown_tool')).content[0].text).toContain(
      'Unknown tool',
    );
    // Error messages should be sanitized to prevent internal details leaking
    expect(
      (await handler.handleToolCall('route_request', { prompt: 'x' })).content[0].text,
    ).toContain('Error:');
  });

  it('routes tool calls through the configured router', async () => {
    const server = new MCPServer();
    const router: RouterInterface = {
      getModels: () => [
        {
          id: 'glm-edge',
          provider: 'zhipu',
          costPerMillionInput: 0.3,
          costPerMillionOutput: 0.6,
          maxTokens: 128000,
          capabilities: ['general'],
        },
      ],
      route: async () => ({
        model: {
          id: 'glm-edge',
          provider: 'zhipu',
          costPerMillionInput: 0.3,
          costPerMillionOutput: 0.6,
          maxTokens: 128000,
          capabilities: ['general'],
        },
        strategy: 'cost-optimized',
        cost: 0.001,
        confidence: 0.9,
        latencyMs: 25,
      }),
      getBudget: () => ({
        dailyLimit: 10,
        remaining: 9,
        spentToday: 1,
      }),
    };
    server.setRouter(router);

    const handler = server as unknown as {
      handleToolCall: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
    };

    const response = await handler.handleToolCall('route_request', {
      prompt: 'hello',
    });

    expect(response.content[0].text).toContain('"model": "glm-edge"');

    const modelInfo = await handler.handleToolCall('get_model_info', {
      model_id: 'glm-edge',
    });
    expect(modelInfo.content[0].text).toContain('"id": "glm-edge"');

    const costReport = await handler.handleToolCall('get_cost_report', {
      budget_id: 'team-alpha',
      period: 'today',
    });
    expect(costReport.content[0].text).toContain('"budget_id": "team-alpha"');
  });

  it('covers direct MCP tool handlers and default argument branches', async () => {
    const seenArgs: Array<Record<string, unknown>> = [];
    const router: RouterInterface = {
      getModels: () => [
        {
          id: 'glm-edge',
          provider: 'zhipu',
          costPerMillionInput: 0.3,
          costPerMillionOutput: 0.6,
          maxTokens: 128000,
          capabilities: ['general'],
        },
      ],
      route: async (args) => {
        seenArgs.push(args as unknown as Record<string, unknown>);
        return {
          model: {
            id: 'glm-edge',
            provider: 'zhipu',
            costPerMillionInput: 0.3,
            costPerMillionOutput: 0.6,
            maxTokens: 128000,
            capabilities: ['general'],
          },
          strategy: args.strategy ?? 'cost-optimized',
          cost: 0.01,
          confidence: 0.5,
          latencyMs: 12,
        };
      },
      getBudget: () => null,
    };

    const modelInfoAll = handleGetModelInfoTool(router, {});
    expect(modelInfoAll.content[0].text).toContain('"id": "glm-edge"');

    const modelInfoMissing = handleGetModelInfoTool(router, { model_id: 'missing' });
    expect(modelInfoMissing.content[0].text.trim()).toBe('null');

    const costReport = handleGetCostReportTool(router, {});
    expect(costReport.content[0].text).toContain('"budget_id": "default"');
    expect(costReport.content[0].text).toContain('"period": "today"');

    const routed = await handleRouteRequestTool(router, {
      prompt: 'hello',
      max_tokens: 10,
      required_capabilities: ['general', 123],
      user_tier: 'premium',
    });
    expect(routed.content[0].text).toContain('"strategy": "cost-optimized"');

    const routedWithExplicitArgs = await handleRouteRequestTool(router, {
      strategy: 'latency-optimized',
      budget_id: 'team-alpha',
      user_tier: 'free',
    });
    expect(routedWithExplicitArgs.content[0].text).toContain('"strategy": "latency-optimized"');
    expect(seenArgs[1]).toMatchObject({
      prompt: '',
      strategy: 'latency-optimized',
      budgetId: 'team-alpha',
      userTier: 'free',
    });
    expect(seenArgs[1].requiredCapabilities).toBeUndefined();
  });
});
