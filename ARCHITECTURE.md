# llm-router — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  AI Agent   │    │  MCP Client │    │  Direct API │                  │
│  │  (orchestr.)│   │  (Claude)   │    │  Consumer   │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │ HTTP/MCP                                    │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        @reaatech/llm-router-engine                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Request Pipeline                             │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │  Pre-Route  │───▶│  Budget     │───▶│  Strategy   │           │   │
│  │  │   Hooks     │    │  Check      │    │  Selector   │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   @reaatech/llm-router-strategies                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Cost      │  │  Latency    │  │  Judgment   │  │ Capability  │    │
│  │  Optimized  │  │  Optimized  │  │   Based     │  │   Based     │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                 │                │                │           │
│         └─────────────────┼────────────────┼────────────────┘           │
│                           ▼                                              │
│                  ┌─────────────────┐                                    │
│                  │    Strategy     │                                    │
│                  │   Orchestrator  │                                    │
│                  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Model Pool                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Model Registry                               │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │ Workhorses  │    │   Judges    │    │  Fallback   │           │   │
│  │  │ KAT-Coder   │    │  Claude     │    │   Chains    │           │   │
│  │  │ Kimi        │    │  GPT-4      │    │   (from     │           │   │
│  │  │ GLM         │    │             │    │  fallback)  │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM Provider APIs                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   OpenAI    │  │  Anthropic  │  │   Google    │  │  Kuaishou   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Cross-Cutting Concerns                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │  Cost Telemetry  │  │    Observability │  │    Eval Hooks    │       │
│  │  (telemetry pkg) │  │  (engine pkg)    │  │  (engine pkg)    │       │
│  │  - Per-request   │  │  - Tracing (OTel)│  │  - Quality Score │       │
│  │  - Budget track  │  │  - Metrics (OTel)│  │  - A/B Testing   │       │
│  │  - Anomaly detect│  │  - Logging (Pino)│  │  - Performance   │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Package Architecture

llm-router is a pnpm monorepo with 7 packages in a strict dependency tree:

```
@reaatech/llm-router-core          (types, schemas — zero workspace deps)
    │
    ├── @reaatech/llm-router-strategies  (cost/latency/judgment/capability)
    ├── @reaatech/llm-router-fallback    (circuit breakers, chains, retry)
    ├── @reaatech/llm-router-telemetry   (cost tracking, budgets, metrics)
    └── @reaatech/llm-router-mcp         (MCP server + tools)
    │
    └── @reaatech/llm-router-engine      (router, registry, eval, observability)
           │
           └── @reaatech/llm-router-cli  (CLI: route, benchmark, report, validate)
```

### Package Responsibilities

| Package | Directory | Responsibility |
|---------|-----------|----------------|
| `core` | `packages/core/` | Domain types (`ModelDefinition`, `RoutingRequest`, etc.), Zod schemas for all config/input validation, enums |
| `strategies` | `packages/strategies/` | `RoutingStrategy` interface, 4 strategy implementations, priority-based `StrategyOrchestrator` |
| `fallback` | `packages/fallback/` | `CircuitBreaker` (CLOSED/OPEN/HALF_OPEN), `FallbackChain` with ordered degradation, `RetryLogic` with exponential backoff |
| `telemetry` | `packages/telemetry/` | `CostTracker`, `BudgetManager`, `CostReporter`, `MetricsCollector`, `TelemetryMetrics` |
| `mcp` | `packages/mcp/` | MCP server with 3 tools (`route_request`, `get_model_info`, `get_cost_report`), dual stdio + HTTP transports |
| `engine` | `packages/engine/` | `LLMRouter` class, `ModelRegistry`, `ProviderClientFactory`, `QualityScorer`, `ABTestManager`, `PerformanceTracker`, `EvalHooksManager`, observability (logging, tracing, dashboard), config loader |
| `cli` | `packages/cli/` | 4 CLI commands: `route`, `benchmark`, `cost-report`, `validate-config` |

### Dependency Rationale

- **core** has zero workspace dependencies — every other package depends on it for types
- **strategies**, **fallback**, **telemetry**, and **mcp** are independent of each other — you can install them individually
- **engine** depends on core, strategies, fallback, and telemetry — it ties everything together
- **cli** depends on core and engine — it's a consumer entry point

---

## Design Principles

### 1. Cost-Aware by Default
- Every routing decision considers cost as a primary factor
- Budget enforcement is non-negotiable (hard limits)
- Cost telemetry is automatic and accurate

### 2. Pluggable Strategies
- Routing strategies are isolated, testable modules in their own package
- New strategies can be added without modifying core or engine
- Strategies can be chained and prioritized via the orchestrator

### 3. Resilient by Design
- Fallback chains prevent single points of failure
- Circuit breakers protect against cascading failures
- Graceful degradation when models are unavailable

### 4. Observable Everything
- Every routing decision is traced and logged
- Cost, latency, and quality metrics are always available
- Debugging is possible through comprehensive telemetry

### 5. Provider-Agnostic
- No vendor lock-in — any provider can be swapped
- Unified `ProviderClientFactory` interface for all LLM providers
- Provider-specific optimizations are encapsulated

---

## Component Deep Dive

### Request Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Request Pipeline                                │
│                                                                      │
│  1. Pre-Routing Hooks                                                │
│     └─ Modify/enrich request (eval hooks from engine)               │
│                                                                      │
│  2. Budget Check                                                     │
│     └─ Verify budget remaining, reject if exceeded (from telemetry) │
│                                                                      │
│  3. Strategy Evaluation                                              │
│     └─ Orchestrator evaluates all strategies in priority order       │
│     └─ Strategies from strategies pkg, orchestration from engine    │
│                                                                      │
│  4. Post-Routing Hooks                                               │
│     └─ Log decision, track metrics (engine eval hooks)              │
│                                                                      │
│  5. Model Execution with Fallback                                    │
│     └─ Execute primary model or chain (fallback from fallback pkg)  │
│     └─ Circuit breakers check model health before each attempt      │
│                                                                      │
│  6. Cost Recording                                                   │
│     └─ Calculate actual cost, update budget (from telemetry)        │
│                                                                      │
│  7. Post-Execution Hooks                                             │
│     └─ Quality scoring, A/B testing, performance tracking           │
└─────────────────────────────────────────────────────────────────────┘
```

### Strategy Engine

The strategy engine evaluates routing strategies in priority order:

```typescript
// RoutingStrategy interface (from @reaatech/llm-router-core)
interface RoutingStrategy {
  name: string;
  priority: number;
  applies(request: RoutingRequest, context: RoutingContext): boolean;
  select(request: RoutingRequest, context: RoutingContext, availableModels: ModelDefinition[]): ModelDefinition | null;
}
```

**Strategy Evaluation Order:**
1. Check if strategy applies to request via `applies()`
2. If applies, use `select()` to pick the optimal model
3. If model unavailable (circuit breaker OPEN), try next strategy
4. Fall back to default strategy if none apply

### Cost-Optimized Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Cost-Optimized Strategy                            │
│                                                                      │
│  Input: RoutingRequest { prompt, max_tokens, budget_id, ... }       │
│                                                                      │
│  Process:                                                            │
│  1. Filter models by required capabilities                          │
│  2. Filter models by max_tokens limit                               │
│  3. Filter models by budget constraint                              │
│  4. Sort by total cost (input + output)                             │
│  5. Select cheapest available model                                 │
│                                                                      │
│  Output: ModelDefinition (cheapest qualifying model)                │
└─────────────────────────────────────────────────────────────────────┘
```

**Cost Calculation:**
```
total_cost = (input_tokens / 1M) * input_rate + (output_tokens / 1M) * output_rate
```

### Latency-Optimized Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Latency-Optimized Strategy                          │
│                                                                      │
│  Input: RoutingRequest { prompt, timeout_ms, ... }                  │
│                                                                      │
│  Process:                                                            │
│  1. Get historical latency data per model from RoutingContext       │
│  2. Filter models by timeout constraint                             │
│  3. Check circuit breaker states for degraded models                │
│  4. Score models by predicted latency                               │
│  5. Select fastest available model                                  │
│                                                                      │
│  Output: ModelDefinition (fastest qualifying model)                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Judgment-Based Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Judgment-Based Strategy                             │
│                                                                      │
│  Input: RoutingRequest { prompt, confidence_threshold, ... }        │
│                                                                      │
│  Process:                                                            │
│  1. Route to workhorse model first                                  │
│  2. Evaluate workhorse response confidence                          │
│  3. If confidence < threshold, escalate to judge                    │
│  4. Optionally get consensus from multiple judges                   │
│  5. Return best response                                            │
│                                                                      │
│  Output: ModelDefinition + escalation chain                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Fallback Chain Manager

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Fallback Chain Manager                            │
│                                                                      │
│  Chain: [model_a, model_b, model_c]                                 │
│                                                                      │
│  Execution:                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │ model_a  │───▶│ model_b  │───▶│ model_c  │                      │
│  │ (try)    │    │(fallback)│    │(fallback)│                      │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘                      │
│       │                │                │                             │
│       ▼                ▼                ▼                             │
│  Success?          Success?          Success?                        │
│       │                │                │                             │
│       └────────────────┴────────────────┘                             │
│                        │                                              │
│                        ▼                                              │
│              Return first successful result                           │
│                                                                      │
│  Circuit Breaker Integration:                                        │
│  - Each model has independent circuit breaker                       │
│  - OPEN circuit = skip model, go to next in chain                   │
│  - HALF_OPEN = allow limited test requests                          │
└─────────────────────────────────────────────────────────────────────┘
```

### Cost Telemetry System

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Cost Telemetry System                            │
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │   Request   │    │   Budget    │    │   Cost      │              │
│  │  Cost Calc  │───▶│  Tracker    │───▶│  Reporter   │              │
│  │             │    │             │    │             │              │
│  └─────────────┘    └──────┬──────┘    └─────────────┘              │
│                            │                                         │
│                            ▼                                         │
│                     ┌─────────────┐                                 │
│                     │   Alerting  │                                 │
│                     │   Callbacks │                                 │
│                     └─────────────┘                                 │
│                                                                      │
│  Metrics Tracked:                                                    │
│  - Cost per request (by model, strategy, budget)                    │
│  - Cost per budget (daily tracking)                                 │
│  - Budget remaining (gauge)                                         │
│  - Token usage per model                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Eval Hooks System

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Eval Hooks System                              │
│                                                                      │
│  Pre-Routing Hooks:                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Enrich     │───▶│  Validate   │───▶│  Prioritize │              │
│  │  Request    │    │  Input      │    │  Models     │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
│                                                                      │
│  Post-Routing Hooks:                                                 │
│  ┌─────────────┐    ┌─────────────┐                                 │
│  │  Log        │    │  Track      │                                 │
│  │  Decision   │    │  Metrics    │                                 │
│  └─────────────┘    └─────────────┘                                 │
│                                                                      │
│  Post-Execution Hooks:                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Quality    │───▶│  A/B Test   │───▶│  Update     │              │
│  │  Scoring    │    │  Analysis   │    │  Rankings   │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Complete Routing Flow (LLMRouter.route())

```
1. Client sends RoutingRequest { prompt, strategy?, budgetId?, ... }
        │
2. Pre-routing hooks execute (eval hooks from engine)
        │
3. Budget check verifies remaining budget (from telemetry)
        │
4. Strategy orchestrator evaluates strategies in priority order:
   - Cost-optimized: select cheapest qualifying model
   - Latency-optimized: select fastest qualifying model
   - Judgment-based: select workhorse, escalate if needed
   - Capability-based: select model with required capabilities
        │
5. Model selected, check circuit breaker (from fallback):
   - If OPEN: try next model in fallback chain
   - If CLOSED/HALF_OPEN: proceed
        │
6. Post-routing hooks execute (eval hooks from engine)
        │
7. Execute request against selected model (via executeModel or ProviderClientFactory)
        │
8. On failure:
   - Record failure for circuit breaker
   - Try next model in fallback chain
   - Repeat until success or chain exhausted
        │
9. Calculate cost based on tokens used (from telemetry)
        │
10. Update budget tracker (from telemetry)
        │
11. Record performance data (from engine PerformanceTracker)
        │
12. Execute post-execution eval hooks:
     - Quality scoring (QualityScorer)
     - A/B test recording (ABTestManager)
     - Performance update (PerformanceTracker)
        │
13. Return RouterRouteSummary:
     - model: ModelDefinition
     - strategy: string
     - cost: number
     - confidence: number
     - latencyMs: number
     - result: RoutingResult (content, tokens, success, qualityScore)
        │
14. Log and trace complete request
```

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                                     │
│ - HTTPS required in production                                       │
│ - API key validation on all endpoints                                │
│ - Rate limiting per client                                           │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Budget                                                      │
│ - Hard budget limits enforced via BudgetManager                      │
│ - Per-user/team/project isolation                                    │
│ - Real-time budget tracking via CostTracker                           │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Input                                                       │
│ - Token count validation via Zod schemas                             │
│ - Prompt size limits via maxTokens                                   │
│ - PII redaction in logs via redactPIIPatterns()                     │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Output                                                      │
│ - Cost included in all responses                                     │
│ - Audit logging for all cost events                                  │
│ - Anomaly detection for unusual patterns                             │
└─────────────────────────────────────────────────────────────────────┘
```

### API Key Management

- All API keys stored in environment variables (referenced by `apiKeyEnv` in model defs)
- Never logged or included in responses
- Separate keys per provider for isolation
- Key rotation supported without downtime

### Budget Enforcement

- **Soft limit**: Warning alerts at thresholds (50%, 75%, 90%)
- **Hard limit**: Requests rejected when budget exhausted via BudgetManager
- **Isolation**: Each budgetId has independent tracking
- **Audit**: All cost events logged for compliance

---

## Development Architecture

### Monorepo Tooling

```
llm-router/
├── packages/
│   ├── core/          → @reaatech/llm-router-core
│   ├── strategies/    → @reaatech/llm-router-strategies
│   ├── fallback/      → @reaatech/llm-router-fallback
│   ├── telemetry/     → @reaatech/llm-router-telemetry
│   ├── mcp/           → @reaatech/llm-router-mcp
│   ├── engine/        → @reaatech/llm-router-engine
│   └── cli/           → @reaatech/llm-router-cli
├── pnpm-workspace.yaml
├── turbo.json
├── biome.json
├── tsconfig.json
├── tsconfig.typecheck.json
├── .changeset/
└── .github/workflows/
```

| Tool | Purpose |
|------|---------|
| **pnpm** | Workspace manager with strict dependency resolution |
| **Turborepo** | Parallel task orchestration with caching |
| **tsup** | Per-package bundler producing dual CJS/ESM output |
| **Biome** | Unified linter + formatter (replaces ESLint + Prettier) |
| **Changesets** | Package versioning, CHANGELOG generation, and npm publishing |

### Build Pipeline

```
pnpm build → turbo run build
            → Build in dependency order (^build)
            → tsup per package → dist/index.js + dist/index.cjs + dist/index.d.ts
```

Each package outputs:
- `dist/index.js` — ESM entry
- `dist/index.cjs` — CJS entry
- `dist/index.d.ts` + `dist/index.d.cts` — TypeScript declarations

### Test Architecture

Tests are colocated with source files in each package:

```
packages/engine/src/
├── router.ts
├── router.test.ts
├── registry/
│   ├── model-registry.ts
│   └── model-registry.test.ts
├── eval/
│   ├── quality-scorer.ts
│   └── quality-scorer.test.ts
...
```

---

## Observability

### Tracing

Every routing decision generates an OpenTelemetry trace:

| Span | Attributes |
|------|------------|
| `llm_router.route` | strategy, budget_id, cost |
| `strategy.evaluate` | strategy_name, candidates |
| `model.execute` | model_id, tokens, latency |
| `fallback.try` | model_id, attempt, success |
| `cost.calculate` | input_tokens, output_tokens, cost |

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `llm_router.requests.total` | Counter | `strategy`, `status` | Total requests |
| `llm_router.requests.cost` | Histogram | `model` | Cost per request |
| `llm_router.requests.latency_ms` | Histogram | `model`, `strategy` | Latency |
| `llm_router.budget.remaining` | Gauge | `budget_id` | Remaining budget |
| `llm_router.model.usage` | Counter | `model` | Token usage |
| `llm_router.fallback.activations` | Counter | `chain` | Fallback usage |
| `llm_router.circuit_breaker.state` | Gauge | `model` | Circuit breaker state |

### Logging

All logs are structured JSON with standard fields:

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "service": "llm-router",
  "request_id": "req-123",
  "level": "info",
  "message": "Request routed successfully",
  "strategy": "judgment-based",
  "selected_model": "kat-coder-pro",
  "escalated_to": "claude-opus",
  "cost": 0.0234,
  "latency_ms": 1234,
  "tokens": { "input": 500, "output": 200 },
  "budget_remaining": 45.67
}
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Model API error | Non-2xx response | Try next model in fallback chain |
| Model timeout | Request exceeds timeout | Record timeout, try next model |
| Circuit breaker OPEN | State check | Skip model, use fallback |
| Budget exceeded | Budget check via BudgetManager | Reject request with reason |
| All models unavailable | Fallback chain exhausted | Return `FallbackChainExhaustedError` |
| Provider rate limit | 429 response | Backoff, try next model |
| Cost calculation error | Exception in calculator | Log error, use fallback cost |

---

## References

- **AGENTS.md** — Agent development guide with strategy configs and security checklist
- **README.md** — Quick start and package overview
- **config/examples/** — Example configurations
- **skills/** — Domain-specific guides for each routing capability
- **MCP Specification** — https://modelcontextprotocol.io/
