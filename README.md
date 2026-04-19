# llm-router

> Cost-aware, multi-model LLM routing with pluggable strategies, fallback chains, telemetry, eval hooks, and MCP tools.

## Overview

`llm-router` is a TypeScript library and CLI for routing LLM requests across multiple providers while balancing cost, latency, and reasoning quality. It includes strategy orchestration, fallback chains, budget enforcement, cost reporting, eval hooks, and MCP integration.

The router does not ship production provider SDK integrations. Public release behavior is fail-closed: you must provide `executeModel` or register a custom provider client factory before `route()` can execute a model.

## Features

- Cost-optimized, latency-optimized, judgment-based, and capability-based routing
- Fallback chains with circuit breakers and retry support
- Budget management, cost tracking, and cost reporting
- Eval hooks, quality scoring, A/B testing, and performance tracking
- CLI commands for routing, benchmarking, reporting, and config validation
- MCP tools for `route_request`, `get_model_info`, and `get_cost_report`

## Quick Start

```bash
npm install llm-router
```

```typescript
import { LLMRouter, parseRouterConfig } from 'llm-router';

const config = parseRouterConfig(`
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
`);

const router = LLMRouter.fromConfig(config);
const routed = await router.route({
  prompt: 'Summarize this design doc.',
  strategy: 'cost-optimized',
});

console.log(routed.model.id);
console.log(routed.result.decision.estimatedCost);
```

For an executable setup, provide an execution callback or register a provider client factory:

```typescript
const router = LLMRouter.fromConfig(config, {
  executeModel: async (model, request) => {
    const response = await myProviderSdk.complete({
      model: model.id,
      prompt: request.prompt,
      maxTokens: request.maxTokens,
    });

    return {
      content: response.content,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      finishReason: response.finishReason,
    };
  },
});
```

## End-to-End Walkthrough

### 1. Install Dependencies

```bash
npm ci
```

### 2. Configure the Router

Use the provided sample config or one of the examples in `config/examples/`.

```bash
cp llm-router.config.yaml local-router.config.yaml
```

Set provider credentials as needed:

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export GOOGLE_API_KEY=...
export KAT_CODER_API_KEY=...
export KIMI_API_KEY=...
export GLM_API_KEY=...
```

### 3. Validate the Config

```bash
npm run build
node dist/src/cli.js validate-config --config local-router.config.yaml
```

### 4. Route a Request

```bash
node dist/src/cli.js route \
  --config local-router.config.yaml \
  --strategy cost-optimized \
  --prompt "Review this TypeScript module for bugs."
```

### 5. Generate a Cost Report

```bash
node dist/src/cli.js cost-report \
  --config local-router.config.yaml \
  --period today
```

### 6. Start MCP Integration

```typescript
import { LLMRouter, createMCPServer, loadRouterConfig } from 'llm-router';

const router = LLMRouter.fromConfig(loadRouterConfig('local-router.config.yaml'));
const server = createMCPServer({ name: 'llm-router', version: '1.0.0' });
server.setRouter(router);
await server.start();
```

## Routing Strategies

### Cost-Optimized

```typescript
import { CostOptimizedStrategy } from 'llm-router';

new CostOptimizedStrategy({
  workhorsePool: ['kat-coder-pro', 'kimi-chat', 'glm-edge'],
  budgetPerRequest: 0.05,
});
```

### Latency-Optimized

```typescript
import { LatencyOptimizedStrategy } from 'llm-router';

new LatencyOptimizedStrategy({
  modelPool: ['glm-edge', 'kat-coder-pro'],
  targetP99Ms: 2000,
  defaultTimeoutMs: 3000,
});
```

### Judgment-Based

```typescript
import { JudgmentBasedStrategy } from 'llm-router';

new JudgmentBasedStrategy({
  workhorsePool: ['kat-coder-pro', 'kimi-chat'],
  judgePool: ['claude-opus', 'gpt-4-turbo'],
  escalationThreshold: 0.7,
  maxJudgeInvocations: 2,
  consensusRequired: false,
});
```

### Capability-Based

```typescript
import { CapabilityBasedStrategy } from 'llm-router';

new CapabilityBasedStrategy({
  preferredModels: {
    code: ['kat-coder-pro', 'gpt-4-turbo'],
    'complex-reasoning': ['claude-opus'],
  },
});
```

## Fallback Chains

```typescript
import { FallbackChain } from 'llm-router';

const chain = new FallbackChain({
  name: 'code-review-chain',
  models: ['kat-coder-pro', 'glm-edge', 'kimi-chat'],
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenMaxCalls: 3,
  },
});
```

## Cost Management

```typescript
import { BudgetManager, CostTracker, CostReporter } from 'llm-router';

const budgetManager = new BudgetManager();
budgetManager.register({
  id: 'team-alpha',
  dailyLimit: 100,
  alertThresholds: [0.5, 0.75, 0.9],
  hardLimit: true,
});

const tracker = new CostTracker();
tracker.record({
  requestId: 'req-123',
  modelId: 'glm-edge',
  cost: 0.0012,
  inputTokens: 500,
  outputTokens: 200,
  strategy: 'cost-optimized',
  budgetId: 'team-alpha',
});

const reporter = new CostReporter(tracker, budgetManager);
console.log(reporter.getReport({ budgetId: 'team-alpha' }));
```

## MCP Integration

```typescript
import { createMCPServer } from 'llm-router/mcp';
```

Available tools:

- `route_request`
- `get_model_info`
- `get_cost_report`

## Skills

The `skills/` directory contains domain-specific guides for each routing capability:

- **[Cost-Based Routing](skills/cost-routing/skill.md)** — Cheapest model selection with budget constraints
- **[Latency-Optimized Routing](skills/latency-routing/skill.md)** — Fastest model selection with timeout targets
- **[Judgment-Based Routing](skills/judgment-routing/skill.md)** — Workhorse + judge two-tier escalation
- **[Fallback Chains](skills/fallback-chains/skill.md)** — Resilient request handling with circuit breakers
- **[Cost Telemetry](skills/cost-telemetry/skill.md)** — Real-time cost tracking and budget management
- **[Eval Hooks](skills/eval-hooks/skill.md)** — Quality scoring, A/B testing, and performance tracking

Each skill includes MCP tool definitions, usage examples, error handling, recovery strategies, and security considerations.

## Configuration

The repo includes:

- `llm-router.config.yaml`
- `config/examples/workhorse-judge.yaml`
- `config/examples/cost-optimized.yaml`
- `config/examples/low-latency.yaml`

Config files support the snake_case keys shown in the examples and are normalized to the router’s internal camelCase types at load time.

## Development

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

See [AGENTS.md](./AGENTS.md), [CONTRIBUTING.md](./CONTRIBUTING.md), and [ARCHITECTURE.md](./ARCHITECTURE.md) for development and architecture details.

## FAQ

**Q: Do I need API keys for all providers?**
A: No. Only configure the providers you plan to use. Set the appropriate `api_key_env` in your model definitions and ensure the corresponding environment variable is set.

**Q: Will this work with self-hosted models?**
A: Yes. You can define custom providers in your model configuration by specifying a provider type and the appropriate API endpoint.

**Q: How accurate are the cost calculations?**
A: Cost calculations are based on the `cost_per_million_input` and `cost_per_million_output` values in your model definitions and the actual token counts. They should match provider billing within rounding.

**Q: Can I add my own routing strategy?**
A: Yes. Implement the `RoutingStrategy` interface and register it with the `StrategyOrchestrator`. See `src/strategies/strategy.interface.ts` for the interface definition.

**Q: What happens when a model fails?**
A: If a fallback chain is configured, the router automatically tries the next model in the chain. A circuit breaker prevents requests to unhealthy models.

## License

MIT
