# @reaatech/llm-router-engine

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-engine.svg)](https://www.npmjs.com/package/@reaatech/llm-router-engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

The central routing engine for llm-router. Ties together model registry, strategy orchestration, fallback chains, cost telemetry, eval hooks, quality scoring, A/B testing, performance tracking, observability (logging, tracing, dashboards), and config loading into a single `LLMRouter` class.

## Installation

```bash
npm install @reaatech/llm-router-engine
# or
pnpm add @reaatech/llm-router-engine
```

## Feature Overview

- **Config-driven construction** — `LLMRouter.fromConfig()` builds a complete router from YAML/JSON in one call
- **Model registry** — register, validate, and query models by capability, cost, or role (workhorse vs judge)
- **Strategy orchestration** — evaluates all registered strategies and selects the best model
- **Fallback chains** — automatic degradation with circuit breakers per model in the chain
- **Cost telemetry** — per-request cost tracking, budget enforcement, and cost reporting
- **Eval hooks** — pre-routing, post-routing, and post-execution hooks for A/B testing and quality monitoring
- **Quality scoring** — pluggable scorers (rule-based, LLM-as-judge, human feedback) with multi-criteria evaluation
- **A/B testing** — traffic splitting with statistical comparison between models
- **Performance tracking** — per-model latency and success rate tracking with percentile queries
- **Observability** — structured logging (Pino), OpenTelemetry tracing, and dashboard snapshots
- **Config loader** — YAML/JSON config parsing with snake_case → camelCase normalization and Zod validation
- **Fail-closed by default** — requires `executeModel` callback or registered provider clients; ships no live provider SDK integrations

## Quick Start

```typescript
import { LLMRouter, parseRouterConfig } from "@reaatech/llm-router-engine";

const config = parseRouterConfig(`
models:
  workhorses:
    - id: glm-edge
      provider: zhipu
      cost_per_million_input: 0.30
      cost_per_million_output: 0.60
      max_tokens: 128000
      capabilities: [general]
  judges:
    - id: claude-opus
      provider: anthropic
      cost_per_million_input: 15.00
      cost_per_million_output: 75.00
      max_tokens: 200000
      capabilities: [evaluation, complex-reasoning]
strategies:
  default:
    type: cost-optimized
    workhorse_pool: [glm-edge]
  complex:
    type: judgment-based
    workhorse_pool: [glm-edge]
    judge_pool: [claude-opus]
budgets:
  default:
    daily_limit: 25
    alert_thresholds: [0.5, 0.75, 0.9]
    hard_limit: true
`);

const router = LLMRouter.fromConfig(config, {
  executeModel: async (model, request) => {
    const response = await myProviderSDK.complete({
      model: model.id,
      prompt: request.prompt,
      maxTokens: request.maxTokens,
    });
    return { content: response.text, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens };
  },
});

const result = await router.route({
  prompt: "Explain the Observer pattern in TypeScript.",
  strategy: "cost-optimized",
});

console.log(result.model.id, result.cost, result.latencyMs);
```

## API Reference

### `LLMRouter` (class)

The main class for the entire routing engine. Wires together all subsystems.

#### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `fromConfig(config, options?)` | `LLMRouter` | Build from a parsed `RouterConfig` object |
| `fromConfigText(raw, options?)` | `LLMRouter` | Build from a raw YAML/JSON string |

#### Instance Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `route(request)` | `Promise<RouterRouteSummary>` | Route a request through full pipeline: hooks → strategy eval → budget check → execution → cost recording → quality scoring |
| `getModels()` | `ModelDefinition[]` | All registered models |
| `getBudget(budgetId?)` | `{ dailyLimit, remaining, spentToday } \| null` | Budget state |
| `getBudgetConfigs()` | `BudgetConfig[]` | All registered budget configurations |

#### `RouterRouteSummary`

| Field | Type | Description |
|-------|------|-------------|
| `model` | `ModelDefinition` | The model that executed the request |
| `strategy` | `string` | Which strategy selected the model |
| `cost` | `number` | Actual cost in USD |
| `confidence` | `number` | Strategy's confidence in the selection (0–1) |
| `latencyMs` | `number` | Request latency in milliseconds |
| `result` | `RoutingResult` | Full execution result including content and tokens |

#### `RouterOptions`

| Field | Type | Description |
|-------|------|-------------|
| `registry` | `ModelRegistry` | Custom model registry |
| `orchestrator` | `StrategyOrchestrator` | Custom strategy orchestrator |
| `costTracker` | `CostTracker` | Custom cost tracker |
| `budgetManager` | `BudgetManager` | Custom budget manager |
| `performanceTracker` | `PerformanceTracker` | Custom performance tracker |
| `evalHooks` | `EvalHooksManager` | Custom eval hooks manager |
| `qualityScorer` | `QualityScorer` | Custom quality scorer |
| `providerFactory` | `ProviderClientFactory` | Custom provider client factory |
| `fallbackChains` | `FallbackChain[]` | Fallback chains to register |
| `defaultBudgetId` | `string` | Default budget for requests without one |
| `responseEvaluator` | `boolean` | Whether to quality-score every response |
| `executeModel` | `function` | Custom execution callback |

### `createRouter(options?): LLMRouter`

Convenience factory for creating a router from options without a config file.

```typescript
import { createRouter } from "@reaatech/llm-router-engine";

const router = createRouter({ executeModel: myExecutor });
```

### `ModelRegistry`

Register, validate, and query models.

```typescript
import { ModelRegistry } from "@reaatech/llm-router-engine";

const registry = new ModelRegistry();
registry.register({
  id: "gpt-4-turbo",
  provider: "openai",
  costPerMillionInput: 10,
  costPerMillionOutput: 30,
  maxTokens: 128000,
  capabilities: ["code", "reasoning"],
  apiKeyEnv: "OPENAI_API_KEY",
});
```

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `register(model)` | `void` | Add a model (throws `ModelValidationError` on invalid data) |
| `registerAll(models)` | `void` | Register many models at once |
| `getAll()` | `ModelDefinition[]` | All models |
| `getWorkhorses()` | `ModelDefinition[]` | Models not tagged as judges/evaluation |
| `getJudges()` | `ModelDefinition[]` | Models with evaluation capability |
| `getAvailable(circuitBreakerStates)` | `ModelDefinition[]` | Models not in OPEN state |
| `filterModels(options)` | `ModelDefinition[]` | Filter by capability, provider, cost |

### `ProviderClientFactory`

Factory for creating provider API clients. Ships with stub implementations; register real clients for production.

```typescript
import { ProviderClientFactory } from "@reaatech/llm-router-engine";

const factory = ProviderClientFactory.getInstance();

factory.registerClientFactory("openai", () => ({
  provider: "openai",
  async complete(options) {
    const response = await openai.chat.completions.create({
      model: options.modelId ?? "gpt-4-turbo",
      messages: [{ role: "user", content: options.prompt }],
      max_tokens: options.maxTokens,
    });
    return {
      content: response.choices[0]?.message?.content ?? "",
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  },
}));
```

### `QualityScorer`

Pluggable quality evaluation framework.

```typescript
import { QualityScorer, createRuleBasedScorer } from "@reaatech/llm-router-engine";

const scorer = new QualityScorer();

// Register a rule-based scorer (included by default)
scorer.register("rule-based", createRuleBasedScorer(), true);

// Score a result
const score = await scorer.score(request, result, model);
console.log(score.overall, score.relevance, score.correctness);
```

#### `QualityScore`

| Field | Type | Description |
|-------|------|-------------|
| `overall` | `number` | Overall score (1–5 scale) |
| `relevance` | `number \| undefined` | Relevance to the prompt |
| `correctness` | `number \| undefined` | Factual correctness |
| `completeness` | `number \| undefined` | How thoroughly the task was completed |
| `clarity` | `number \| undefined` | Clarity and readability |
| `custom` | `Record<string, number> \| undefined` | Custom criteria scores |
| `explanation` | `string \| undefined` | Human-readable justification |

### `EvalHooksManager`

Pre-routing, post-routing, and post-execution hooks.

```typescript
import { evalHooksManager } from "@reaatech/llm-router-engine";

evalHooksManager.onPreRouting(async (request, context) => {
  if (request.userTier === "premium") {
    request.confidenceThreshold = 0.95;
  }
  return request;
});

evalHooksManager.onPostExecution(async (result, decision, request, context) => {
  await analytics.track("routing_complete", {
    modelId: decision.modelId,
    cost: result.actualCost,
  });
  return result;
});
```

### `ABTestManager`

A/B testing with traffic splitting between models.

```typescript
import { ABTestManager } from "@reaatech/llm-router-engine";

const ab = new ABTestManager();
ab.start({
  testA: { modelId: "glm-edge", trafficPercent: 50 },
  testB: { modelId: "kat-coder-pro", trafficPercent: 50 },
});

const selectedModel = ab.select(); // Randomly assigns to A or B
ab.record(selectedModel, { latencyMs: 42, qualityScore: 4.5 });

const stats = ab.getStats();
console.log(stats.testA.winRate, stats.testB.winRate);
```

### `PerformanceTracker`

Per-model latency and success rate tracking.

```typescript
import { PerformanceTracker } from "@reaatech/llm-router-engine";

const tracker = new PerformanceTracker();
tracker.record("glm-edge", 42, true, 4.5);

const perf = tracker.getAllPerformance([modelDef1, modelDef2]);
console.log(perf[0].latencyP50, perf[0].latencyP95);
```

### Config Loading

```typescript
import { loadRouterConfig, parseRouterConfig } from "@reaatech/llm-router-engine";

// Load from file
const config = loadRouterConfig("llm-router.config.yaml");

// Parse from string
const config2 = parseRouterConfig(`...`);
```

### Observability

```typescript
import {
  createLogger,
  setupTracing,
  MetricsCollector,
  ObservabilityDashboard,
} from "@reaatech/llm-router-engine";
```

| Export | Description |
|--------|-------------|
| `createLogger(config?)` | Creates a Pino-based structured logger with PII redaction |
| `setupTracing(config?)` | Initializes OpenTelemetry tracing |
| `startRoutingSpan(name)` | Starts a trace span for a routing decision |
| `recordStrategyEvaluation(span, attrs)` | Records strategy evaluation attributes on a span |
| `recordModelExecution(span, attrs)` | Records model execution attributes on a span |
| `getTraceId()` / `getSpanId()` | Returns the current OTel trace and span IDs |
| `ObservabilityDashboard` | Generates real-time routing stats, cost trends, and model health snapshots |

## Related Packages

- [`@reaatech/llm-router-core`](https://www.npmjs.com/package/@reaatech/llm-router-core) — Shared types and Zod schemas
- [`@reaatech/llm-router-strategies`](https://www.npmjs.com/package/@reaatech/llm-router-strategies) — Pluggable routing strategies
- [`@reaatech/llm-router-fallback`](https://www.npmjs.com/package/@reaatech/llm-router-fallback) — Fallback chains and circuit breakers
- [`@reaatech/llm-router-telemetry`](https://www.npmjs.com/package/@reaatech/llm-router-telemetry) — Cost tracking and budget management
- [`@reaatech/llm-router-mcp`](https://www.npmjs.com/package/@reaatech/llm-router-mcp) — MCP server integration
- [`@reaatech/llm-router-cli`](https://www.npmjs.com/package/@reaatech/llm-router-cli) — CLI tool

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
