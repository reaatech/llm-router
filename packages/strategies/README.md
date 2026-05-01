# @reaatech/llm-router-strategies

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-strategies.svg)](https://www.npmjs.com/package/@reaatech/llm-router-strategies)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Pluggable routing strategies for cost-aware, multi-model LLM routing. Four strategies plus a priority-based orchestrator that evaluates them in order, selecting the best model for each request.

## Installation

```bash
npm install @reaatech/llm-router-strategies
# or
pnpm add @reaatech/llm-router-strategies
```

## Feature Overview

- **Cost-optimized routing** — selects the cheapest model that meets budget constraints
- **Latency-optimized routing** — selects the fastest model based on historical P50/P95 data
- **Judgment-based routing** — two-tier escalation from cheap workhorses to premium judges
- **Capability-based routing** — matches models to required capabilities (code, reasoning, vision, etc.)
- **Strategy orchestrator** — evaluates all registered strategies in priority order, picks the best fit
- **Pluggable interface** — implement `RoutingStrategy` to add custom logic
- **Config-driven construction** — `StrategyOrchestrator.fromConfig()` builds from YAML/JSON

## Quick Start

```typescript
import {
  CostOptimizedStrategy,
  LatencyOptimizedStrategy,
  StrategyOrchestrator,
} from "@reaatech/llm-router-strategies";

const orchestrator = new StrategyOrchestrator();

orchestrator.register(
  new CostOptimizedStrategy({
    workhorsePool: ["glm-edge", "kat-coder-pro"],
    budgetPerRequest: 0.05,
  }),
);

orchestrator.register(
  new LatencyOptimizedStrategy({
    modelPool: ["glm-edge", "kat-coder-pro"],
    targetP99Ms: 2000,
  }),
);

const evaluation = orchestrator.evaluate(request, context, availableModels);
console.log(evaluation?.model.id, evaluation?.strategy.name);
```

## API Reference

### `BaseRoutingStrategy` (abstract)

All strategies extend this base class which implements the `RoutingStrategy` interface.

| Member | Description |
|--------|-------------|
| `name` | Unique strategy identifier (set by subclass) |
| `priority` | Evaluation order — lower numbers evaluated first |
| `applies(request, context)` | Returns `true` if this strategy should be considered for the request |
| `select(request, context, availableModels)` | Returns a `StrategySelectionResult` with the chosen model and reason |

### `StrategySelectionResult`

| Field | Type | Description |
|-------|------|-------------|
| `model` | `ModelDefinition` | The selected model |
| `confidence` | `number` (0–1) | How confident the strategy is in its selection |
| `reason` | `string` | Human-readable explanation |
| `alternatives` | `ModelDefinition[]` | Other models that were considered |

### `CostOptimizedStrategy`

Selects the cheapest model that fits within the budget constraint.

```typescript
import { CostOptimizedStrategy, type CostOptimizedConfig } from "@reaatech/llm-router-strategies";

const strat = new CostOptimizedStrategy({
  workhorsePool: ["glm-edge", "kat-coder-pro", "kimi-chat"],
  budgetPerRequest: 0.05,
});
```

#### `CostOptimizedConfig`

| Field | Type | Description |
|-------|------|-------------|
| `workhorsePool` | `string[]` | Model IDs available for selection |
| `budgetPerRequest` | `number` | Maximum cost in USD for a single request |

### `LatencyOptimizedStrategy`

Selects the fastest model based on historical latency from the `RoutingContext`.

```typescript
import { LatencyOptimizedStrategy, type LatencyOptimizedConfig } from "@reaatech/llm-router-strategies";

const strat = new LatencyOptimizedStrategy({
  modelPool: ["glm-edge", "kat-coder-pro"],
  targetP99Ms: 2000,
  defaultTimeoutMs: 3000,
});
```

#### `LatencyOptimizedConfig`

| Field | Type | Description |
|-------|------|-------------|
| `modelPool` | `string[]` | Model IDs available for selection |
| `targetP99Ms` | `number` | Target P99 latency in milliseconds |
| `defaultTimeoutMs` | `number` | Fallback timeout when no history exists |

### `JudgmentBasedStrategy`

Two-tier routing: cheap workhorse models handle routine requests, premium judge models handle complex reasoning.

```typescript
import {
  JudgmentBasedStrategy,
  type JudgmentBasedConfig,
} from "@reaatech/llm-router-strategies";

const strat = new JudgmentBasedStrategy({
  workhorsePool: ["kat-coder-pro", "kimi-chat"],
  judgePool: ["claude-opus", "gpt-4-turbo"],
  escalationThreshold: 0.7,
  maxJudgeInvocations: 2,
  consensusRequired: false,
});
```

#### `JudgmentBasedConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workhorsePool` | `string[]` | — | Low-cost models for routine tasks |
| `judgePool` | `string[]` | — | Premium models for complex tasks |
| `escalationThreshold` | `number` | `0.7` | Confidence threshold below which escalation triggers |
| `maxJudgeInvocations` | `number` | `1` | How many judge models to consult per escalation |
| `consensusRequired` | `boolean` | `false` | Whether all judges must agree |

### `CapabilityBasedStrategy`

Routes based on required model capabilities (code, reasoning, vision, etc.).

```typescript
import {
  CapabilityBasedStrategy,
  type CapabilityBasedConfig,
} from "@reaatech/llm-router-strategies";

const strat = new CapabilityBasedStrategy({
  preferredModels: {
    code: ["kat-coder-pro", "gpt-4-turbo"],
    "complex-reasoning": ["claude-opus"],
  },
});
```

#### `CapabilityBasedConfig`

| Field | Type | Description |
|-------|------|-------------|
| `preferredModels` | `Partial<Record<ModelCapability, string[]>>` | Capability-to-preferred-model mapping |
| `preferredModelIds` | `string[]` | Fallback preferred models regardless of capability |
| `defaultModel` | `string` | Default model when no capability match |

### `StrategyOrchestrator`

Evaluates all registered strategies in priority order and returns the best match.

```typescript
import { StrategyOrchestrator } from "@reaatech/llm-router-strategies";

const orchestrator = new StrategyOrchestrator();

// Register strategies individually
orchestrator.register(new CostOptimizedStrategy());

// Or build from config
const orchestrator2 = StrategyOrchestrator.fromConfig(
  {
    default: { type: "cost-optimized", workhorsePool: ["glm-edge"] },
    complex: { type: "judgment-based", workhorsePool: ["kat-coder-pro"], judgePool: ["claude-opus"] },
  },
  { workhorsePool: ["glm-edge", "kat-coder-pro"], judgePool: ["claude-opus"] },
);

const evaluation = orchestrator.evaluate(request, context, availableModels);
if (!evaluation) {
  throw new Error("No strategy could select a model");
}
```

#### `StrategyEvaluationResult`

| Field | Type | Description |
|-------|------|-------------|
| `model` | `ModelDefinition` | The model selected by the winning strategy |
| `strategy` | `RoutingStrategy` | The strategy that made the selection |
| `selectionResult` | `StrategySelectionResult` | The detailed result including confidence and alternatives |

## Creating a Custom Strategy

Implement the `RoutingStrategy` interface or extend `BaseRoutingStrategy`:

```typescript
import { BaseRoutingStrategy, type StrategySelectionResult } from "@reaatech/llm-router-strategies";
import type { ModelDefinition, RoutingRequest, RoutingContext } from "@reaatech/llm-router-core";

class MyCustomStrategy extends BaseRoutingStrategy {
  readonly name = "my-custom";
  readonly priority = 5;

  constructor() {
    super(5);
  }

  applies(request: RoutingRequest, _context: RoutingContext): boolean {
    return request.strategy === "my-custom" || request.metadata?.useCustom === true;
  }

  select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null {
    const candidates = availableModels.filter((m) => m.enabled !== false);
    if (candidates.length === 0) return null;

    const selected = candidates[0]; // Your custom selection logic
    return {
      model: selected,
      confidence: 0.8,
      reason: `Selected ${selected.id} via custom logic`,
      alternatives: candidates.slice(1),
    };
  }
}

orchestrator.register(new MyCustomStrategy());
```

## Related Packages

- [`@reaatech/llm-router-core`](https://www.npmjs.com/package/@reaatech/llm-router-core) — Shared types and Zod schemas
- [`@reaatech/llm-router-engine`](https://www.npmjs.com/package/@reaatech/llm-router-engine) — Main routing engine that consumes strategies

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
