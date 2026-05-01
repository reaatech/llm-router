# llm-router

[![CI](https://github.com/reaatech/llm-router/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> Cost-aware, multi-model LLM routing with pluggable strategies, fallback chains, cost telemetry, eval hooks, and MCP integration.

This monorepo provides an intelligent routing engine for LLM requests across multiple providers, balancing cost, latency, and quality. It includes strategy orchestration, circuit breakers, budget enforcement, quality scoring, A/B testing, and an MCP server for agent integration.

## Features

- **Pluggable routing strategies** — cost-optimized, latency-optimized, judgment-based (two-tier escalation), and capability-based routing
- **Fallback chains** — ordered degradation paths with circuit breakers and exponential-backoff retry logic
- **Cost telemetry** — real-time cost tracking, daily budget enforcement (soft/hard limits), alert thresholds, and structured cost reports
- **Eval hooks** — pre-routing, post-routing, and post-execution hooks for quality monitoring and A/B testing
- **Quality scoring** — rule-based, LLM-as-judge, and human-feedback scoring with multi-criteria evaluation
- **MCP server** — exposes `route_request`, `get_model_info`, and `get_cost_report` tools via the Model Context Protocol
- **Observability** — structured logging (Pino), OpenTelemetry tracing, metrics collection, and real-time dashboard snapshots
- **CLI** — route, benchmark, cost-report, and validate-config commands
- **Fail-closed security** — no live provider SDK integrations shipped; requires explicit `executeModel` callback or provider client registration

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Core types and schemas
pnpm add @reaatech/llm-router-core

# Routing engine (includes observability, eval, config loading)
pnpm add @reaatech/llm-router-engine

# Pluggable routing strategies
pnpm add @reaatech/llm-router-strategies

# Fallback chains and circuit breakers
pnpm add @reaatech/llm-router-fallback

# Cost telemetry and budget management
pnpm add @reaatech/llm-router-telemetry

# MCP server integration
pnpm add @reaatech/llm-router-mcp

# CLI tool
pnpm add @reaatech/llm-router-cli
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/llm-router.git
cd llm-router

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Run linting
pnpm lint
```

## Quick Start

Create a router from a YAML config and route a request:

```typescript
import { LLMRouter, parseRouterConfig } from "@reaatech/llm-router-engine";

const router = LLMRouter.fromConfig(
  parseRouterConfig(`
models:
  workhorses:
    - id: glm-edge
      provider: zhipu
      cost_per_million_input: 0.30
      cost_per_million_output: 0.60
      max_tokens: 128000
      capabilities: [general]
strategies:
  default:
    type: cost-optimized
    workhorse_pool: [glm-edge]
budgets:
  default:
    daily_limit: 25
    alert_thresholds: [0.5, 0.75, 0.9]
    hard_limit: true
  `),
  {
    executeModel: async (model, request) => ({
      content: `Response from ${model.id}`,
      inputTokens: 10,
      outputTokens: 20,
    }),
  },
);

const result = await router.route({
  prompt: "Explain the Observer pattern.",
  strategy: "cost-optimized",
});

console.log(result.model.id, result.cost);
```

See the [`config/examples/`](./config/examples/) directory for complete configuration samples including cost-optimized, low-latency, and workhorse-judge setups.

## Packages

| Package | Description |
| ------- | ----------- |
| [`@reaatech/llm-router-core`](./packages/core) | Core types, Zod schemas, and input validation |
| [`@reaatech/llm-router-engine`](./packages/engine) | Main routing engine with registry, eval, observability, and config loading |
| [`@reaatech/llm-router-strategies`](./packages/strategies) | Pluggable routing strategies with priority-based orchestrator |
| [`@reaatech/llm-router-fallback`](./packages/fallback) | Fallback chains, circuit breakers, and retry logic |
| [`@reaatech/llm-router-telemetry`](./packages/telemetry) | Cost tracking, budget management, and metrics collection |
| [`@reaatech/llm-router-mcp`](./packages/mcp) | MCP server exposing routing tools to AI agents |
| [`@reaatech/llm-router-cli`](./packages/cli) | Command-line interface for routing, benchmarking, and reporting |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, package relationships, and data flows
- [`AGENTS.md`](./AGENTS.md) — Agent development guide with strategy configs and security checklist
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution workflow and quality gate commands
- [`skills/`](./skills/) — Domain-specific guides for each routing capability

## License

[MIT](LICENSE)
