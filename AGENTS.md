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

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Client     │────▶│   llm-router     │────▶│  Model Pool     │
│  (Agent/MCP)    │     │  (Routing Core)  │     │  (Multi-LLM)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Cost Telemetry  │
                       │  + Eval Hooks    │
                       └──────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Routing Engine** | `src/strategies/` | Pluggable routing strategies (cost/latency/judgment) |
| **Model Registry** | `src/registry/` | Model definitions, capabilities, pricing |
| **Fallback Chains** | `src/fallback/` | Degradation paths with circuit breakers |
| **Cost Telemetry** | `src/telemetry/` | Per-model cost tracking and budgeting |
| **Eval Hooks** | `src/eval/` | Quality scoring and A/B testing |
| **MCP Server** | `src/mcp-server/` | Expose router as MCP tools |

---

## Routing Strategies

The router supports multiple pluggable strategies for model selection:

### Cost-Optimized Routing

Selects the cheapest model that meets requirements while respecting budget constraints.

```yaml
strategies:
  default:
    type: cost-optimized
    workhorse_pool: [kat-coder-pro, kimi-chat, glm-edge]
    budget_per_request: 0.05
    max_tokens: 10000
```

**When to use:** High-volume, routine tasks where cost is the primary concern.

### Latency-Optimized Routing

Selects the fastest model based on historical latency data and current conditions.

```yaml
strategies:
  real-time:
    type: latency-optimized
    workhorse_pool: [glm-edge, kat-coder-pro]
    timeout_ms: 3000
    target_p99_ms: 2000
```

**When to use:** Interactive applications where response time is critical.

### Judgment-Based Routing

Uses cheap workhorse models for routine tasks, escalates to premium judge models
for complex reasoning, debugging, or evaluation.

```yaml
strategies:
  complex-tasks:
    type: judgment-based
    workhorse_pool: [kat-coder-pro, kimi-chat]
    judge_pool: [claude-opus, gpt-4-turbo]
    escalation_threshold: 0.7
    max_judge_invocations: 2
    consensus_required: false
```

**When to use:** Tasks requiring high-quality reasoning, code review, or when
the workhorse model's confidence is low.

### Capability-Based Routing

Routes based on required capabilities (code, vision, long-context, etc.).

```yaml
strategies:
  code-review:
    type: capability-based
    required_capabilities: [code, reasoning]
    preferred_models: [kat-coder-pro, gpt-4-turbo]
```

**When to use:** Tasks with specific capability requirements.

---

## Model Configuration

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
import { createRouter } from 'llm-router';

const router = createRouter(config);

const result = await router.route({
  prompt: 'Review this code...',
  strategy: 'cost-optimized',
  budget_id: 'user-123',
});

console.log(`Cost: $${result.cost.toFixed(6)}`);
console.log(`Remaining budget: $${result.budget_remaining.toFixed(2)}`);
```

---

## Eval Hooks

### Quality Scoring

Integrate quality scoring to improve routing decisions:

```yaml
eval:
  quality_scorer:
    type: llm-as-judge
    judge_model: claude-opus
    scoring_criteria:
      - relevance
      - correctness
      - completeness
    scale: 1-5

  ab_testing:
    enabled: true
    traffic_split:
      kat-coder-pro: 0.6
      gpt-4-turbo: 0.4
    statistical_threshold: 0.95
```

### Pre-Routing Hooks

Modify requests before routing:

```typescript
router.addHook('pre-routing', async (request) => {
  // Add context based on user tier
  if (request.user_tier === 'premium') {
    request.allowed_models = ['claude-opus', 'gpt-4-turbo'];
  }
  return request;
});
```

### Post-Execution Hooks

Score results after execution:

```typescript
router.addHook('post-execution', async (result) => {
  // Send to eval pipeline
  const score = await evaluateQuality(result);
  result.metadata.quality_score = score;
  return result;
});
```

---

## MCP Integration

The router exposes MCP tools for agent integration:

### route_request Tool

```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Review this code for bugs",
    "strategy": "judgment-based",
    "max_tokens": 4096,
    "budget_id": "team-alpha"
  }
}
```

### get_model_info Tool

```json
{
  "name": "get_model_info",
  "arguments": {
    "model_id": "kat-coder-pro"
  }
}
```

### get_cost_report Tool

```json
{
  "name": "get_cost_report",
  "arguments": {
    "budget_id": "team-alpha",
    "period": "today"
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

### Agent-to-Agent Routing

```
User Query → Orchestrator (e.g. agent-mesh, LangGraph, AutoGen)
                   │
                   ▼
             llm-router (agent)
                   │
                   ▼
             Selected LLM Model
```

---

## Security Considerations

### API Key Management

- All API keys come from environment variables
- Never log API keys or tokens
- Use separate keys per model/provider

### Budget Isolation

- Each user/team has isolated budget tracking
- Hard limits prevent budget overruns
- Audit logging for all cost events

### Input Sanitization

- Prompts are validated before sending to models
- PII is redacted from logs
- Token limits prevent runaway costs

---

## Observability

### Structured Logging

Every routing decision is logged with:

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

Each routing decision creates a trace with spans for:
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

- **ARCHITECTURE.md** — System design deep dive
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **config/examples/** — Example configurations
- **skills/** — Domain-specific guides for each routing capability
- **MCP Specification** — https://modelcontextprotocol.io/
