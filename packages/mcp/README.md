# @reaatech/llm-router-mcp

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-mcp.svg)](https://www.npmjs.com/package/@reaatech/llm-router-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP server integration for llm-router. Exposes three MCP tools — `route_request`, `get_model_info`, and `get_cost_report` — enabling AI agents and orchestration frameworks to route LLM requests through the router via the Model Context Protocol.

## Installation

```bash
npm install @reaatech/llm-router-mcp @modelcontextprotocol/sdk
# or
pnpm add @reaatech/llm-router-mcp @modelcontextprotocol/sdk
```

## Feature Overview

- **Three MCP tools** — route LLM requests, query model metadata, and generate cost reports
- **Dual transports** — stdio for desktop clients (Claude Desktop, VS Code) and Streamable HTTP for remote agents
- **Pluggable router interface** — `RouterInterface` decouples the server from the router implementation
- **Zero additional MCP tooling** — all tool schemas and handlers are self-contained
- **Auto-start** — `server.start()` detects the transport environment and activates the right transport

## Quick Start

```typescript
import { createMCPServer } from "@reaatech/llm-router-mcp";
import type { RouterInterface } from "@reaatech/llm-router-mcp";

// Implement the router interface
const router: RouterInterface = {
  async route(request) {
    const result = await myLLMRouter.route(request);
    return {
      model: result.model,
      strategy: result.strategy,
      cost: result.cost,
      confidence: result.confidence,
      latencyMs: result.latencyMs,
      result: result.result,
    };
  },
  getModels() {
    return myLLMRouter.getModels();
  },
  getBudget(budgetId) {
    return myLLMRouter.getBudget(budgetId);
  },
};

// Create and start the MCP server
const server = createMCPServer({ name: "llm-router", version: "1.0.0" });
server.setRouter(router);
await server.start();
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "llm-router": {
      "command": "npx",
      "args": ["@reaatech/llm-router-mcp"]
    }
  }
}
```

## API Reference

### `createMCPServer(config?): MCPServer`

Factory function for creating an MCP server instance.

#### `MCPServerConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | `"llm-router"` | Server name reported to MCP clients |
| `version` | `string` | `"1.0.0"` | Server version |
| `description` | `string` | — | Optional human-readable description |

### `MCPServer` (class)

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `setRouter(router)` | `void` | Attach the router implementation that tools delegate to |
| `start()` | `Promise<void>` | Starts the server, auto-detecting stdio vs HTTP transport |
| `stop()` | `Promise<void>` | Gracefully shuts down the server |
| `getTools()` | `Tool[]` | Returns the registered MCP tool schemas |

### `RouterInterface`

Your router must implement this contract for the MCP tools to function:

```typescript
interface RouterInterface {
  route(request: RoutingRequest): Promise<RouterRouteSummary>;
  getModels(): ModelDefinition[];
  getBudget(budgetId?: string): BudgetInfo | null;
}
```

| Method | Description |
|--------|-------------|
| `route(request)` | Route a single LLM request through the router |
| `getModels()` | Return all registered model definitions |
| `getBudget(budgetId?)` | Return a budget's current state (daily limit, remaining, spent today) |

### MCP Tools

#### `route_request`

Routes a prompt through the LLM router and returns the routing decision, selected model, execution result, cost, and latency.

**Input parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | `string` | Yes | The text to route through an LLM |
| `strategy` | `string` | No | Strategy to use (`cost-optimized`, `latency-optimized`, `judgment-based`, `capability-based`) |
| `maxTokens` | `number` | No | Maximum output tokens |
| `requiredCapabilities` | `string[]` | No | Required model capabilities (`code`, `reasoning`, etc.) |
| `budgetId` | `string` | No | Budget to count this request against |
| `confidenceThreshold` | `number` | No | Minimum confidence for strategy acceptance |

#### `get_model_info`

Returns detailed information about a specific model: capabilities, pricing, max tokens, and provider.

**Input parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `modelId` | `string` | Yes | The model ID to look up |

#### `get_cost_report`

Generates a cost report for a budget within a time period.

**Input parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `budgetId` | `string` | Yes | Budget to report on |
| `period` | `string` | No | Time period: `today`, `week`, or `month` (default: `today`) |

### Transport Selection

The server auto-detects its transport at startup:

| Condition | Transport | Client Examples |
|-----------|-----------|-----------------|
| `stdin` is not a TTY | `StdioServerTransport` | Claude Desktop, VS Code Copilot |
| `PORT` env var is set | `StreamableHTTPServerTransport` | Remote agents, web-based MCP clients |
| Neither | `StdioServerTransport` (default) | — |

## Integration with the Engine

```typescript
import { LLMRouter, loadRouterConfig } from "@reaatech/llm-router-engine";
import { createMCPServer } from "@reaatech/llm-router-mcp";

const router = LLMRouter.fromConfig(loadRouterConfig("llm-router.config.yaml"));

const server = createMCPServer({ name: "llm-router", version: "1.0.0" });

server.setRouter({
  async route(request) {
    const result = await router.route(request);
    return { model: result.model, strategy: result.strategy, cost: result.cost, confidence: result.confidence, latencyMs: result.latencyMs, result: result.result };
  },
  getModels: () => router.getModels(),
  getBudget: (id) => router.getBudget(id),
});

await server.start();
```

## Related Packages

- [`@reaatech/llm-router-core`](https://www.npmjs.com/package/@reaatech/llm-router-core) — Shared types including `RoutingRequest` and `ModelDefinition`
- [`@reaatech/llm-router-engine`](https://www.npmjs.com/package/@reaatech/llm-router-engine) — Main routing engine

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
