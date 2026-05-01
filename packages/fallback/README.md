# @reaatech/llm-router-fallback

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-fallback.svg)](https://www.npmjs.com/package/@reaatech/llm-router-fallback)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Resilience infrastructure for LLM routing: ordered fallback chains for graceful degradation, circuit breakers to skip unhealthy models, and exponential-backoff retry logic with idempotency support.

## Installation

```bash
npm install @reaatech/llm-router-fallback
# or
pnpm add @reaatech/llm-router-fallback
```

## Feature Overview

- **Ordered fallback chains** — define degradation paths with prioritized model lists
- **Circuit breaker** — three-state machine (CLOSED → OPEN → HALF_OPEN) prevents requests to failing models
- **Exponential backoff retry** — configurable attempt limits, base delay, and max delay with jitter
- **Idempotency store** — in-memory deduplication for safely retrying non-idempotent operations
- **Retryable error detection** — pluggable error classifiers for HTTP status codes and custom conditions
- **Chain-wide circuit breaker integration** — each model in the chain gets its own breaker state

## Quick Start

```typescript
import {
  FallbackChain,
  CircuitBreaker,
  RetryLogic,
  createHttpRetryableChecker,
} from "@reaatech/llm-router-fallback";

// Create a fallback chain with circuit breakers
const chain = new FallbackChain({
  name: "code-review",
  models: ["kat-coder-pro", "glm-edge", "kimi-chat"],
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenMaxCalls: 3,
  },
});

chain.registerModels(allModels);

// Execute with automatic fallback
const result = await chain.executeFrom("kat-coder-pro", async (model) => {
  return await callLLM(model);
}, allModels);

console.log(result.selectedModel.id, result.isFallback);
```

## API Reference

### `FallbackChain`

Ordered model list that iterates through candidates when the primary fails.

```typescript
import { FallbackChain, createFallbackChain } from "@reaatech/llm-router-fallback";
import type { FallbackChainDefinition } from "@reaatech/llm-router-core";

const def: FallbackChainDefinition = {
  name: "production-chain",
  models: ["claude-opus", "gpt-4-turbo", "kat-coder-pro"],
  circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 120000, halfOpenMaxCalls: 2 },
};

const chain = createFallbackChain(def);
```

#### Constructor

`new FallbackChain(definition: FallbackChainDefinition)`

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `registerModels(models: ModelDefinition[])` | `void` | Register models so the chain can look them up by ID |
| `getName()` | `string` | Returns the chain's name |
| `executeFrom(modelId, executor, allModels)` | `Promise<FallbackChainResult>` | Execute starting from a model, falling back through the chain on failure |
| `getAllCircuitBreakerStates()` | `Map<string, CircuitBreakerState>` | Get current state of every circuit breaker in the chain |

#### `FallbackChainResult`

| Field | Type | Description |
|-------|------|-------------|
| `selectedModel` | `ModelDefinition` | The model that succeeded |
| `isFallback` | `boolean` | `true` if a fallback model was used |
| `position` | `number` | 0 = primary, 1+ = fallback depth |
| `errors` | `Error[]` | Errors from failed attempts |

#### `FallbackChainExhaustedError`

Thrown when every model in the chain fails. Carries an `errors` array with all failures.

### `CircuitBreaker`

Three-state machine that opens after `failureThreshold` consecutive failures and resets after `resetTimeoutMs`.

```typescript
import { CircuitBreaker } from "@reaatech/llm-router-fallback";
import type { CircuitBreakerConfig } from "@reaatech/llm-router-core";

const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
});
```

#### States

| State | Behavior |
|-------|----------|
| `CLOSED` | Normal — requests pass through, failures are counted |
| `OPEN` | Model is unhealthy — requests are rejected immediately |
| `HALF_OPEN` | Testing recovery — limited probe requests allowed |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `allowRequest()` | `boolean` | `true` if the breaker permits the request |
| `recordSuccess()` | `void` | Reset failure count (transitions OPEN → CLOSED if HALF_OPEN) |
| `recordFailure()` | `void` | Increment failure count (transitions CLOSED → OPEN at threshold) |
| `getState()` | `CircuitBreakerState` | Returns `"CLOSED"`, `"OPEN"`, or `"HALF_OPEN"` |

#### `CircuitBreakerEvent`

`"OPENED" | "CLOSED" | "HALF_OPEN"` — emitted on state transitions.

### `RetryLogic`

Exponential backoff retry with configurable limits and error classification.

```typescript
import { RetryLogic, createHttpRetryableChecker, isRetryableStatusCode } from "@reaatech/llm-router-fallback";

const retry = new RetryLogic({
  maxAttempts: 3,
  backoffMs: 1000,
  maxBackoffMs: 30000,
});

const result = await retry.execute(
  async () => await fetch(url),
  createHttpRetryableChecker(),
);
```

#### `RetryConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxAttempts` | `number` | `3` | Total attempts including the first try |
| `backoffMs` | `number` | `1000` | Base delay in milliseconds |
| `maxBackoffMs` | `number` | `30000` | Maximum backoff cap |
| `jitter` | `boolean` | `true` | Whether to apply random jitter to delays |

#### `RetryContext`

Carries the current attempt count and accumulated errors across retry cycles.

| Field | Type | Description |
|-------|------|-------------|
| `attempt` | `number` | Current attempt (1-indexed) |
| `errors` | `Error[]` | All errors encountered so far |

#### `RetryableErrorChecker`

```typescript
type RetryableErrorChecker = (error: Error) => boolean;
```

#### `RetryExhaustedError`

Thrown when all retry attempts fail. Includes the accumulated `errors` array.

### Utility Functions

| Export | Description |
|--------|-------------|
| `createCircuitBreaker(config)` | Factory for `CircuitBreaker` |
| `createFallbackChain(definition)` | Factory for `FallbackChain` |
| `createRetryLogic(config?)` | Factory for `RetryLogic` |
| `generateIdempotencyKey()` | Generates a unique key for idempotent retries |
| `isRetryableStatusCode(status)` | Returns `true` for 5xx and 429 status codes |
| `createHttpRetryableChecker()` | Creates a checker that retries on 5xx, 429, and network errors |

### `IdempotencyStore`

In-memory store for deduplicating non-idempotent operations across retries.

```typescript
import { IdempotencyStore } from "@reaatech/llm-router-fallback";

const store = new IdempotencyStore({ ttlMs: 300000 });
const key = generateIdempotencyKey();
const cached = store.get(key);
if (cached) return cached.result;

const result = await doWork();
store.set(key, result);
```

## Related Packages

- [`@reaatech/llm-router-core`](https://www.npmjs.com/package/@reaatech/llm-router-core) — Shared types including `FallbackChainDefinition` and `CircuitBreakerConfig`
- [`@reaatech/llm-router-engine`](https://www.npmjs.com/package/@reaatech/llm-router-engine) — Main routing engine that consumes fallback chains

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
