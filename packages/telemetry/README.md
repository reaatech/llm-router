# @reaatech/llm-router-telemetry

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-telemetry.svg)](https://www.npmjs.com/package/@reaatech/llm-router-telemetry)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Cost telemetry and budget management for llm-router. Real-time cost tracking per model, per-request, per-strategy with budget enforcement (soft/hard limits), cost aggregation, reporting, and OpenTelemetry-compatible metrics collection.

## Installation

```bash
npm install @reaatech/llm-router-telemetry
# or
pnpm add @reaatech/llm-router-telemetry
```

## Feature Overview

- **Per-request cost tracking** — record cost, tokens, model, strategy, and budget ID for every routed call
- **Budget enforcement** — daily limits with configurable alert thresholds and hard/soft enforcement modes
- **Cost aggregation** — group costs by model, strategy, budget, and time period
- **Cost reporting** — generate structured reports with per-model breakdowns and trend data
- **OTel-compatible metrics** — `MetricsCollector` provides a facade over OTel for request counts, latency histograms, and cost gauges
- **Budget alerts** — callbacks fire at configured thresholds (50%, 75%, 90%) to integrate with your alerting stack

## Quick Start

```typescript
import {
  CostTracker,
  BudgetManager,
  CostReporter,
} from "@reaatech/llm-router-telemetry";

// Track costs across all routing decisions
const tracker = new CostTracker();

tracker.record({
  requestId: "req-abc123",
  modelId: "glm-edge",
  cost: 0.0012,
  inputTokens: 500,
  outputTokens: 200,
  strategy: "cost-optimized",
  budgetId: "team-alpha",
});

// Get per-model cost summaries
const aggregated = tracker.getAggregation("glm-edge");
console.log(aggregated.totalCost, aggregated.totalRequests);
```

## API Reference

### `CostTracker`

Tracks per-request costs and provides aggregation queries.

```typescript
import { CostTracker, createCostTracker } from "@reaatech/llm-router-telemetry";

const tracker = createCostTracker();
```

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `record(entry: CostEntry)` | `void` | Record a single request's cost and token usage |
| `getAggregation(modelId)` | `CostAggregation` | Get cost summary for a model |
| `getAllAggregations()` | `Map<string, CostAggregation>` | Get summaries for all models |
| `getAllEntries()` | `CostEntry[]` | Get every recorded cost entry |
| `calculateCost(model, inputTokens, outputTokens)` | `number` | Estimate cost using the model's per-million-token rates |
| `reset()` | `void` | Clear all recorded entries |

#### `CostEntry`

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | `string` | Unique request identifier |
| `modelId` | `string` | Which model was used |
| `cost` | `number` | Actual cost in USD |
| `inputTokens` | `number` | Input token count |
| `outputTokens` | `number` | Output token count |
| `strategy` | `string` | Which strategy selected the model |
| `budgetId` | `string` | Which budget this cost counts against |
| `timestamp` | `Date` | When the request was recorded |

#### `CostAggregation`

| Field | Type | Description |
|-------|------|-------------|
| `totalCost` | `number` | Sum of all costs |
| `totalRequests` | `number` | Number of requests |
| `totalInputTokens` | `number` | Total input tokens |
| `totalOutputTokens` | `number` | Total output tokens |
| `modelId` | `string` | Which model these aggregates apply to |

#### `CostByModel`

| Field | Type | Description |
|-------|------|-------------|
| `modelId` | `string` | Model identifier |
| `cost` | `number` | Total cost |
| `percentage` | `number` | Share of total cost (0–100) |
| `requests` | `number` | Request count |

### `BudgetManager`

Enforces daily spending limits with alert thresholds.

```typescript
import { BudgetManager, createBudgetManager } from "@reaatech/llm-router-telemetry";

const manager = createBudgetManager();

manager.register({
  id: "team-alpha",
  dailyLimit: 100,
  alertThresholds: [0.5, 0.75, 0.9],
  hardLimit: true,
});
```

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `register(config: BudgetConfig)` | `void` | Register a new budget |
| `registerAll(configs: BudgetConfig[])` | `void` | Register multiple budgets at once |
| `getConfig(id)` | `BudgetConfig \| undefined` | Get a budget's configuration |
| `getState(id)` | `BudgetState \| undefined` | Get a budget's current state |
| `checkBudget(id, estimatedCost)` | `BudgetCheckResult` | Check if a cost fits within the budget |
| `recordSpending(id, cost)` | `void` | Deduct cost from the budget |
| `getRemaining(id)` | `number \| undefined` | Get remaining budget |
| `resetBudget(id)` | `void` | Reset daily spending (for midnight cron) |
| `getAllStates()` | `Map<string, BudgetState>` | Get all budget states |
| `onAlert(id, callback)` | `void` | Register a callback for budget threshold alerts |

#### `BudgetCheckResult`

| Field | Type | Description |
|-------|------|-------------|
| `allowed` | `boolean` | Whether the expense is within budget |
| `reason` | `string \| undefined` | Human-readable reason if rejected |
| `remainingAfter` | `number` | Projected remaining budget if expense goes through |
| `thresholdsTriggered` | `number[]` | Which alert thresholds (if any) this expense would cross |

#### `BudgetAlert`

| Field | Type | Description |
|-------|------|-------------|
| `budgetId` | `string` | Which budget triggered the alert |
| `threshold` | `number` | Which threshold was crossed (e.g., 0.75 = 75%) |
| `spentToday` | `number` | Current spend amount |
| `dailyLimit` | `number` | The budget's total daily limit |

### `CostReporter`

Generates structured cost reports.

```typescript
import { CostReporter } from "@reaatech/llm-router-telemetry";

const reporter = new CostReporter(tracker, manager);

const report = reporter.getReport({
  budgetId: "team-alpha",
  period: "today",
});
console.log(report.totalCost, report.byModel);
```

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `getReport(options)` | `CostReport` | Generate a cost report for a budget and time period |

#### `CostReportOptions`

| Field | Type | Description |
|-------|------|-------------|
| `budgetId` | `string` | Budget to report on |
| `period` | `"today" \| "week" \| "month"` | Time window |
| `modelId` | `string` | Optional filter to a single model |

#### `CostReport`

| Field | Type | Description |
|-------|------|-------------|
| `totalCost` | `number` | Total spend in the period |
| `totalRequests` | `number` | Number of requests |
| `budgetId` | `string` | Budget being reported on |
| `period` | `string` | Time window |
| `byModel` | `CostByModel[]` | Per-model breakdown |
| `byStrategy` | `Record<string, number>` | Cost grouped by strategy |
| `remainingBudget` | `number` | Remaining in the budget |

### `MetricsCollector`

OTel-compatible metrics collector for routing observability.

```typescript
import { MetricsCollector } from "@reaatech/llm-router-telemetry";

const collector = new MetricsCollector({ enabled: true });
await collector.initialize();
```

#### Methods

| Method | Description |
|--------|-------------|
| `recordRequest(attributes)` | Tracks a request by strategy, status, model, cost, and latency |
| `recordFallbackActivation(chainName)` | Counts fallback chain activations |
| `updateBudgetRemaining(budgetId, remaining)` | Updates the budget remaining gauge |
| `recordTokenUsage(modelId, inputTokens, outputTokens)` | Accumulates token usage per model |
| `updateCircuitBreakerState(modelId, state)` | Tracks circuit breaker state changes |
| `getMetrics()` | Returns a `Map<string, number>` of current metric values |
| `initialize()` | `Promise<boolean>` — initializes the collector |
| `shutdown()` | `Promise<void>` — shuts down and clears metrics |

#### `MetricsConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serviceName` | `string` | `"llm-router"` | Service identifier for metrics |
| `enabled` | `boolean` | `false` | Whether to collect metrics |
| `exportIntervalMs` | `number` | `60000` | Export interval in milliseconds |

### `TelemetryMetrics`

Convenience facade over `MetricsCollector` for telemetry-specific events.

```typescript
import { TelemetryMetrics } from "@reaatech/llm-router-telemetry";

const metrics = new TelemetryMetrics(collector);
metrics.recordCost("glm-edge", "cost-optimized", 0.123, 42);
```

## Related Packages

- [`@reaatech/llm-router-core`](https://www.npmjs.com/package/@reaatech/llm-router-core) — Shared types including `BudgetConfig`, `BudgetState`, and `CostTelemetry`
- [`@reaatech/llm-router-engine`](https://www.npmjs.com/package/@reaatech/llm-router-engine) — Main routing engine that consumes telemetry

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
