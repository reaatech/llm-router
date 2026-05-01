/**
 * MCP Server - expose llm-router as MCP tools.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { ModelDefinition } from "@reaatech/llm-router-core";
import { routeRequestTool, handleRouteRequestTool } from './tools/route-request.tool.js';
import { getModelInfoTool, handleGetModelInfoTool } from './tools/get-model-info.tool.js';
import { getCostReportTool, handleGetCostReportTool } from './tools/get-cost-report.tool.js';

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
}

export interface RouterInterface {
  getModels(): ModelDefinition[];
  route(args: {
    prompt: string;
    strategy?: string;
    maxTokens?: number;
    budgetId?: string;
    requiredCapabilities?: string[];
    userTier?: 'free' | 'standard' | 'premium';
  }): Promise<{
    model: ModelDefinition;
    strategy: string;
    cost: number;
    confidence: number;
    latencyMs: number;
  }>;
  getBudget(budgetId?: string): {
    dailyLimit: number;
    remaining: number;
    spentToday: number;
  } | null;
}

export class MCPServer {
  private readonly server: Server;
  private router: RouterInterface | null = null;
  private readonly config: MCPServerConfig;
  private streamableHttpTransport: StreamableHTTPServerTransport | null = null;

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = {
      name: config.name ?? 'llm-router',
      version: config.version ?? '1.0.0',
      description: config.description ?? 'Intelligent LLM model routing with cost optimization',
    };

    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
  }

  setRouter(router: RouterInterface): void {
    this.router = router;
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [routeRequestTool, getModelInfoTool, getCostReportTool],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.handleToolCall(request.params.name, request.params.arguments),
    );
  }

  private async handleToolCall(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    if (!this.router) {
      return {
        content: [{ type: 'text', text: 'Error: Router not initialized' }],
      };
    }

    try {
      switch (name) {
        case 'route_request':
          return await handleRouteRequestTool(this.router, args);
        case 'get_model_info':
          return handleGetModelInfoTool(this.router, args);
        case 'get_cost_report':
          return handleGetCostReportTool(this.router, args);
        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedMessage = errorMessage.includes('ECONNREFUSED')
        ? 'Connection refused - please check network and service availability'
        : errorMessage.includes('timeout')
          ? 'Request timed out - please try again'
          : errorMessage.includes('API key')
            ? 'API key configuration error'
            : 'An internal error occurred';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${sanitizedMessage}`,
          },
        ],
      };
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    const cleanup = (): void => {
      this.stop().catch(() => {
        /* already shutting down */
      });
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  async attachStreamableHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.streamableHttpTransport) {
      this.streamableHttpTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await this.server.connect(this.streamableHttpTransport);
    }
    await this.streamableHttpTransport.handleRequest(request, response);
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}

export function createMCPServer(config: Partial<MCPServerConfig> = {}): MCPServer {
  return new MCPServer(config);
}
