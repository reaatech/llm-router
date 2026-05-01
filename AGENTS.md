---
agent_id: "llm-router"
display_name: "LLM Router"
version: "1.0.0"
description: "Intelligent LLM routing based on cost, latency, and quality"
type: "router"
confidence_threshold: 0.9
---

# llm-router — Agent Development Guide

## What this is

This document defines how to use `llm-router` to build cost-aware, multi-model
AI agents. It covers routing strategies, model configuration, fallback chains,
cost management, and eval integration for agents that need to balance quality,
latency, and cost across multiple LLM providers.

**Target audience:** Engineers building production AI agents who need intelligent
model routing, budget enforcement, and quality-aware model selection.

---

## Architecture Overview

`llm-router` is a **pnpm monorepo** of 7 packages published under the `@reaatech`
scope. The dependency graph:

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

### Key Components

| Component | Package | Purpose |
|-----------|---------|---------|
| **Routing Engine** | `@reaatech/llm-router-engine` | Main `LLMRouter` class, model registry, config loading |
| **Strategies** | `@reaatech/llm-router-strategies` | Pluggable routing strategies (cost/latency/judgment/capability) |
| **Fallback Chains** | `@reaatech/llm-router-fallback` | Degradation paths with circuit breakers and retry logic |
| **Cost Telemetry** | `@reaatech/llm-router-telemetry` | Per-model cost tracking, budget enforcement, metrics |
| **Eval Hooks** | `@reaatech/llm-router-engine` | Quality scoring, A/B testing, pre/post execution hooks |
| **MCP Server** | `@reaatech/llm-router-mcp` | Expose router as MCP tools for agent integration |
| **CLI** | `@reaatech/llm-router-cli` | Route, benchmark, cost-report, and validate-config commands |
| **Core Types** | `@reaatech/llm-router-core` | All shared TypeScript types, Zod schemas, domain enums |

---

## Getting Started

### As a consumer

```bash
# Install the engine (pulls in core, strategies, fallback, telemetry automatically)
pnpm add @reaatech/llm-router-engine

# Or install individual packages as needed
pnpm add @reaatech/llm-router-core
pnpm add @reaatech/llm-router-telemetry
pnpm add @reaatech/llm-router-mcp
```

### As a contributor

```bash
git clone https://github.com/reaatech/llm-router.git
cd llm-router
pnpm install
pnpm build        # turbo run build — builds all 7 packages in dep order
pnpm test         # turbo run test
pnpm lint         # biome check .
pnpm typecheck    # tsc --noEmit -p tsconfig.typecheck.json
```

The monorepo uses:
- **pnpm** for workspaces and strict dependency resolution
- **Turborepo** for task orchestration
- **tsup** for bundling (dual CJS/ESM per package)
- **Biome** for linting and formatting (replaces ESLint + Prettier)
- **Changesets** for versioning and CHANGELOG generation

Publishing is handled via Changesets — see `.changeset/config.json` for configuration.

---

## Routing Strategies

The router supports multiple pluggable strategies for model selection. All 
strategies implement the `RoutingStrategy` interface from `@reaatech/llm-router-core`.

### Cost-Optimized Routing

Selects the cheapest model that meets requirements while respecting budget constraints.

```typescript
import { CostOptimizedStrategy } from '@reaatech/llm-router-strategies';

new CostOptimizedStrategy({
  workhorsePool: ['kat-coder-pro', 'kimi-chat', 'glm-edge'],
  budgetPerRequest: 0.05,
});
```

**When to use:** High-volume, routine tasks where cost is the primary concern.

### Latency-Optimized Routing

Selects the fastest model based on historical latency data and current conditions.

```typescript
import { LatencyOptimizedStrategy } from '@reaatech/llm-router-strategies';

new LatencyOptimizedStrategy({
  modelPool: ['glm-edge', 'kat-coder-pro'],
  targetP99Ms: 2000,
  defaultTimeoutMs: 3000,
});
```

**When to use:** Interactive applications where response time is critical.

### Judgment-Based Routing

Uses cheap workhorse models for routine tasks, escalates to premium judge models
for complex reasoning, debugging, or evaluation.

```typescript
import { JudgmentBasedStrategy } from '@reaatech/llm-router-strategies';

new JudgmentBasedStrategy({
  workhorsePool: ['kat-coder-pro', 'kimi-chat'],
  judgePool: ['claude-opus', 'gpt-4-turbo'],
  escalationThreshold: 0.7,
  maxJudgeInvocations: 2,
  consensusRequired: false,
});
```

**When to use:** Tasks requiring high-quality reasoning, code review, or when
the workhorse model's confidence is low.

### Capability-Based Routing

Routes based on required capabilities (code, vision, long-context, etc.).

```typescript
import { CapabilityBasedStrategy } from '@reaatech/llm-router-strategies';

new CapabilityBasedStrategy({
  preferredModels: {
    code: ['kat-coder-pro', 'gpt-4-turbo'],
    'complex-reasoning': ['claude-opus'],
  },
});
```

**When to use:** Tasks with specific capability requirements.

### Strategy Orchestrator

Evaluates all registered strategies in priority order:

```typescript
import { StrategyOrchestrator } from '@reaatech/llm-router-strategies';

const orchestrator = new StrategyOrchestrator();
orchestrator.register(new CostOptimizedStrategy());
orchestrator.register(new LatencyOptimizedStrategy());

// Or build from YAML config
const orchestrator = StrategyOrchestrator.fromConfig(config.strategies, {
  workhorsePool: config.models.workhorses.map(m => m.id),
  judgePool: config.models.judges.map(m => m.id),
});
```

---

## Model Configuration

Models are defined in YAML and validated at load time. Two conceptual roles:

### Workhorse Models (Cost-Effective)

These models handle the majority of requests at low cost:

| Model | Provider | Cost/M Input | Cost/M Output | Best For |
|-------|----------|--------------|---------------|----------|
| KAT-Coder Pro | Kuaishou | $0.50 | $1.00 | Code generation, reasoning |
| Kimi Chat | Moonshot | $0.80 | $1.60 | Long-context analysis |
| GLM Edge | Zhipu | $0.30 | $0.60 | General tasks, Chinese |

### Judge Models (Premium Quality)

These models are reserved for complex tasks and evaluation:

| Model | Provider | Cost/M Input | Cost/M Output | Best For |
|-------|----------|--------------|---------------|----------|
| Claude Opus | Anthropic | $15.00 | $75.00 | Complex reasoning, evaluation |
| GPT-4 Turbo | OpenAI | $10.00 | $30.00 | Code, evaluation |

### Sample Configuration

```yaml
# llm-router.config.yaml
models:
  workhorses:
    - id: kat-coder-pro
      provider: kuaishou
      cost_per_million_input: 0.50
      cost_per_million_output: 1.00
      max_tokens: 32000
      capabilities: [code, reasoning]
      api_key_env: KAT_CODER_API_KEY

    - id: kimi-chat
      provider: moonshot
      cost_per_million_input: 0.80
      cost_per_million_output: 1.60
      max_tokens: 200000
      capabilities: [long-context, analysis]
      api_key_env: KIMI_API_KEY

    - id: glm-edge
      provider: zhipu
      cost_per_million_input: 0.30
      cost_per_million_output: 0.60
      max_tokens: 128000
      capabilities: [general, chinese]
      api_key_env: GLM_API_KEY

  judges:
    - id: claude-opus
      provider: anthropic
      cost_per_million_input: 15.00
      cost_per_million_output: 75.00
      capabilities: [evaluation, complex-reasoning]
      api_key_env: ANTHROPIC_API_KEY

    - id: gpt-4-turbo
      provider: openai
      cost_per_million_input: 10.00
      cost_per_million_output: 30.00
      capabilities: [evaluation, code]
      api_key_env: OPENAI_API_KEY
```

---

## Fallback Chains

Fallback chains define the degradation path when a model fails:

```yaml
fallback_chains:
  - name: code-review-chain
    models: [kat-coder-pro, glm-edge, kimi-chat]
    circuit_breaker:
      failure_threshold: 5
      reset_timeout_ms: 60000
      half_open_max_calls: 3

  - name: judgment-chain
    models: [claude-opus, gpt-4-turbo]
    circuit_breaker:
      failure_threshold: 3
      reset_timeout_ms: 120000
```

### Circuit Breaker States

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation, requests pass through |
| **OPEN** | Model is unhealthy, skip to next in chain |
| **HALF_OPEN** | Testing if model has recovered |

```typescript
import { FallbackChain, CircuitBreaker } from '@reaatech/llm-router-fallback';

const chain = new FallbackChain({
  name: 'code-review-chain',
  models: ['kat-coder-pro', 'glm-edge', 'kimi-chat'],
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 60000, halfOpenMaxCalls: 3 },
});

chain.registerModels(allModels);
const result = await chain.executeFrom('kat-coder-pro', async (model) => {
  return await callLLM(model);
}, allModels);
```

---

## Cost Management

### Budget Configuration

```yaml
budgets:
  default:
    daily_limit: 100.00
    alert_thresholds: [0.5, 0.75, 0.9]
    hard_limit: true

  premium:
    daily_limit: 500.00
    alert_thresholds: [0.25, 0.5, 0.75]
    hard_limit: false
```

### Budget Enforcement

- **Soft limit**: Alerts are triggered but requests continue
- **Hard limit**: Requests are rejected when budget is exceeded

### Cost Telemetry

The router tracks costs in real-time:

```typescript
import { LLMRouter, parseRouterConfig } from '@reaatech/llm-router-engine';

const router = LLMRouter.fromConfig(parseRouterConfig(configYaml), {
  executeModel: myExecutor,
});

const result = await router.route({
  prompt: 'Review this code...',
  strategy: 'cost-optimized',
  budgetId: 'user-123',
});

console.log(`Cost: $${result.cost.toFixed(6)}`);

const budget = router.getBudget('user-123');
if (budget) {
  console.log(`Remaining budget: $${budget.remaining.toFixed(2)}`);
}
```

---

## Eval Hooks

### Quality Scoring

Integrate quality scoring to improve routing decisions:

```typescript
import { QualityScorer, createRuleBasedScorer } from '@reaatech/llm-router-engine';

const scorer = new QualityScorer();
scorer.register('rule-based', createRuleBasedScorer(), true);

const score = await scorer.score(request, result, model);
console.log(score.overall, score.relevance, score.correctness);
```

### Pre-Routing Hooks

Modify requests before routing:

```typescript
import { evalHooksManager } from '@reaatech/llm-router-engine';

evalHooksManager.onPreRouting(async (request, context) => {
  if (request.userTier === 'premium') {
    request.confidenceThreshold = 0.95;
  }
  return request;
});
```

### Post-Execution Hooks

Score results after execution:

```typescript
evalHooksManager.onPostExecution(async (result, decision, request, context) => {
  await analytics.track('routing_complete', {
    modelId: decision.modelId,
    cost: result.actualCost,
  });
  return result;
});
```

### A/B Testing

```typescript
import { ABTestManager } from '@reaatech/llm-router-engine';

const ab = new ABTestManager();
ab.start({
  testA: { modelId: 'glm-edge', trafficPercent: 50 },
  testB: { modelId: 'kat-coder-pro', trafficPercent: 50 },
});
```

---

## MCP Integration

The MCP package exposes three tools for agent integration:

```typescript
import { createMCPServer } from '@reaatech/llm-router-mcp';

const server = createMCPServer({ name: 'llm-router', version: '1.0.0' });

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

### Tools

| Tool | Purpose |
|------|---------|
| `route_request` | Route a prompt through the router with full decision + execution |
| `get_model_info` | Return capabilities, pricing, and provider for a model ID |
| `get_cost_report` | Generate a cost report for a budget/period |

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

---

## Using with Multi-Agent Systems

### Integration with Agent Orchestrators

Register llm-router as an agent in your multi-agent orchestration system:

```yaml
# agents/llm-router.yaml
agent_id: llm-router
display_name: LLM Router
description: >-
  Intelligent model routing with cost optimization.
  Routes requests to the optimal LLM based on strategy,
  budget, and quality requirements.
endpoint: "${LLM_ROUTER_ENDPOINT:-http://localhost:8082}"
type: mcp
is_default: false
confidence_threshold: 0.8
examples:
  - "Route this request to the cheapest model"
  - "Use a premium model for complex reasoning"
  - "What's my remaining API budget?"
```

### CLI Usage

```bash
llm-router route --config llm-router.config.yaml --strategy cost-optimized --prompt "..."
llm-router benchmark --config llm-router.config.yaml --models "glm-edge,kat-coder-pro" --runs 3
llm-router cost-report --config llm-router.config.yaml --period today --budgetId default
llm-router validate-config --config llm-router.config.yaml
```

---

## Security Considerations

### API Key Management

- All API keys come from environment variables (e.g., `GLM_API_KEY`, `ANTHROPIC_API_KEY`)
- Never log API keys or tokens
- Use separate keys per model/provider

### Budget Isolation

- Each user/team has isolated budget tracking via `budgetId`
- Hard limits prevent budget overruns
- Audit logging for all cost events

### Input Sanitization

- Prompts are validated before sending to models
- PII is redacted from logs via `redactPIIPatterns()` from the engine's observability module
- Token limits prevent runaway costs

---

## Observability

### Structured Logging

Every routing decision is logged as structured JSON (Pino):

```json
{
  "timestamp": "2026-04-15T23:00:00Z",
  "request_id": "req-123",
  "strategy": "judgment-based",
  "selected_model": "kat-coder-pro",
  "escalated_to": "claude-opus",
  "cost": 0.0234,
  "latency_ms": 1234,
  "tokens": { "input": 500, "output": 200 }
}
```

### OpenTelemetry Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `llm_router.requests.total` | Counter | Total requests by strategy |
| `llm_router.requests.cost` | Histogram | Cost per request |
| `llm_router.requests.latency_ms` | Histogram | Latency percentiles |
| `llm_router.budget.remaining` | Gauge | Remaining budget |
| `llm_router.model.usage` | Counter | Token usage per model |

### Tracing

Each routing decision creates an OpenTelemetry trace with spans for:
- Strategy evaluation
- Model selection
- Fallback chain execution
- Cost calculation

---

## Checklist: Production Readiness

Before deploying an agent using llm-router:

- [ ] All model API keys configured in environment
- [ ] Budget limits set appropriately for use case
- [ ] Fallback chains configured for critical paths
- [ ] Circuit breaker thresholds tuned for traffic patterns
- [ ] Cost telemetry enabled and alerts configured
- [ ] PII redaction verified in logs
- [ ] Rate limits configured per provider
- [ ] Eval hooks configured for quality monitoring
- [ ] MCP endpoint secured with API key
- [ ] Health check endpoint implemented
- [ ] Disaster recovery plan for provider outages

---

## References

- **ARCHITECTURE.md** — System design deep dive with data flow diagrams
- **README.md** — Quick start and package overview
- **config/examples/** — Example configurations (cost-optimized, low-latency, workhorse-judge)
- **skills/** — Domain-specific guides for each routing capability
- **MCP Specification** — https://modelcontextprotocol.io/
