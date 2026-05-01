# @reaatech/llm-router-core

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-core.svg)](https://www.npmjs.com/package/@reaatech/llm-router-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Core TypeScript types, Zod schemas, and input validation for the llm-router ecosystem. This package is the single source of truth for all domain types used throughout the `@reaatech/llm-router-*` monorepo.

## Installation

```bash
npm install @reaatech/llm-router-core
# or
pnpm add @reaatech/llm-router-core
```

## Feature Overview

- **30+ exported types** — every routing domain object has a matching TypeScript interface
- **11 Zod schemas** — runtime validation for model definitions, routing requests, configs, budgets, quality scores, and cost telemetry
- **Composable enums** — `ModelCapability` covers 13 capability axes (code, reasoning, vision, etc.)
- **Circuit breaker types** — `CLOSED | OPEN | HALF_OPEN` state machine with config shapes
- **Zero dependencies beyond `zod`** — lightweight and tree-shakeable
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  ModelDefinitionSchema,
  RoutingRequestSchema,
  RouterConfigSchema,
  type ModelDefinition,
  type RoutingRequest,
} from "@reaatech/llm-router-core";

// Validate a model definition at the boundary
const model = ModelDefinitionSchema.parse({
  id: "gpt-4-turbo",
  provider: "openai",
  costPerMillionInput: 10,
  costPerMillionOutput: 30,
  maxTokens: 128000,
  capabilities: ["code", "reasoning"],
});

// Validate an incoming routing request
const req = RoutingRequestSchema.parse({
  prompt: "Review this code for bugs.",
  strategy: "cost-optimized",
  maxTokens: 4096,
});
```

## Exports

### Domain Types

The core domain objects the entire router operates on.

| Export | Description |
|--------|-------------|
| `ModelDefinition` | Model config: id, provider, cost per million tokens, max tokens, capabilities, API key env |
| `ModelCapability` | String enum: `code`, `reasoning`, `vision`, `long-context`, `analysis`, `general`, `chinese`, `evaluation`, `complex-reasoning`, `creative`, `math`, `summarization`, `translation` |
| `RoutingRequest` | Incoming request: prompt, maxTokens, requiredCapabilities, budgetId, strategy, userTier, timeoutMs, confidenceThreshold, metadata |
| `RoutingContext` | Strategy decision context: timestamp, requestId, latency history per model, circuit breaker states, remaining budget |
| `RoutingDecision` | Selected model: modelId, strategy, estimated cost/tokens, isFallback, fallbackPosition, alternatives considered, selection reason |
| `RoutingResult` | Execution result: decision, actual cost/tokens, latencyMs, content, success flag, qualityScore, requestId, completedAt |
| `RoutingStrategy` | Strategy interface: name, priority, `applies()`, `select()` |

### Fallback & Resilience

| Export | Description |
|--------|-------------|
| `FallbackChainDefinition` | Ordered model list with circuit breaker config |
| `CircuitBreakerConfig` | Thresholds: failureThreshold, resetTimeoutMs, halfOpenMaxCalls |
| `CircuitBreakerState` | `"CLOSED" \| "OPEN" \| "HALF_OPEN"` |

### Cost & Budget

| Export | Description |
|--------|-------------|
| `CostTelemetry` | Per-request record: requestId, modelId, cost, inputTokens, outputTokens, strategy, budgetId, timestamp |
| `BudgetConfig` | Daily limit, alert thresholds (fractions of limit), hard/soft limit, reset schedule |
| `BudgetState` | Spending tracking: spentToday, remaining, limitExceeded, alerts triggered |

### Evaluation

| Export | Description |
|--------|-------------|
| `QualityScore` | Multi-criteria score: overall, relevance, correctness, completeness, clarity, custom criteria, explanation |
| `EvalResult` | Per-request evaluation: requestId, modelId, qualityScore, criteria breakdown, evaluator model, metadata |

### Schemas (Zod)

Every domain type has a corresponding Zod schema for runtime validation.

| Export | Validates |
|--------|-----------|
| `ModelDefinitionSchema` | Model config objects |
| `RoutingRequestSchema` | Incoming routing requests |
| `RoutingDecisionSchema` | Router's model selections |
| `RoutingResultSchema` | Execution results |
| `RouterConfigSchema` | The complete YAML/JSON router config file |
| `StrategyConfigSchema` | Strategy configuration blocks (`cost-optimized`, `latency-optimized`, etc.) |
| `FallbackChainSchema` | Fallback chain definitions |
| `CircuitBreakerConfigSchema` | Circuit breaker thresholds |
| `BudgetConfigSchema` | Budget configurations |
| `QualityScoreSchema` | Quality evaluation results |
| `CostTelemetrySchema` | Cost tracking records |

### Schema Input Types

| Export | Description |
|--------|-------------|
| `ModelDefinitionInput` | `z.infer<typeof ModelDefinitionSchema>` |
| `RoutingRequestInput` | `z.infer<typeof RoutingRequestSchema>` |
| `RouterConfigInput` | `z.infer<typeof RouterConfigSchema>` |
| `StrategyConfigInput` | `z.infer<typeof StrategyConfigSchema>` |
| `FallbackChainInput` | `z.infer<typeof FallbackChainSchema>` |
| `BudgetConfigInput` | `z.infer<typeof BudgetConfigSchema>` |

## Usage Pattern

Every schema export has a matching type export. Use the schema for runtime validation and the type for compile-time checking:

```typescript
import { ModelDefinitionSchema, type ModelDefinition } from "@reaatech/llm-router-core";

function loadModel(raw: unknown): ModelDefinition {
  // Parse at the boundary — throws ZodError on invalid data
  return ModelDefinitionSchema.parse(raw);
}
```

## Related Packages

- [`@reaatech/llm-router-strategies`](https://www.npmjs.com/package/@reaatech/llm-router-strategies) — Pluggable routing strategies
- [`@reaatech/llm-router-engine`](https://www.npmjs.com/package/@reaatech/llm-router-engine) — Main routing engine
- [`@reaatech/llm-router-fallback`](https://www.npmjs.com/package/@reaatech/llm-router-fallback) — Fallback chains and circuit breakers

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
