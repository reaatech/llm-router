# llm-router — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  AI Agent   │    │  MCP Client │    │  Direct API │                  │
│  │  (agent-mesh)│   │  (Claude)   │    │  Consumer   │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │ HTTP/MCP                                       │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Router Core                                    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Request Pipeline                             │   │
│  │                                                                   │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐           │   │
│  │  │   Auth      │───▶│  Budget     │───▶│  Strategy   │           │   │
│  │  │ Middleware  │    │  Check      │    │  Selector   │           │   │
│  │  └─────────────┘    └─────────────┘    └─────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Strategy Engine                                   │
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
│  │  │ Kimi        │    │  GPT-4      │    │             │           │   │
│  │  │ GLM         │    │             │    │             │           │   │
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
│  │  - Per-request   │  │  - Tracing (OTel)│  │  - Quality Score │       │
│  │  - Budget track  │  │  - Metrics (OTel)│  │  - A/B Testing   │       │
│  │  - Anomaly detect│  │  - Logging (pino)│  │  - Performance   │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Cost-Aware by Default
- Every routing decision considers cost as a primary factor
- Budget enforcement is non-negotiable (hard limits)
- Cost telemetry is automatic and accurate to within 1%

### 2. Pluggable Strategies
- Routing strategies are isolated, testable modules
- New strategies can be added without modifying core
- Strategies can be chained and prioritized

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
- Unified interface for all LLM providers
- Provider-specific optimizations are encapsulated

---

## Component Deep Dive

### Request Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Request Pipeline                                │
│                                                                      │
│  1. Budget Check                                                     │
│     └─ Verify budget remaining, reject if exceeded                  │
│                                                                      │
│  2. Strategy Selector                                                │
│     └─ Evaluate strategies in priority order                        │
│                                                                      │
│  3. Model Selection                                                  │
│     └─ Select optimal model based on strategy                       │
│                                                                      │
│  4. Fallback Chain                                                   │
│     └─ Execute with fallback on failure                             │
│                                                                      │
│  5. Cost Tracking                                                    │
│     └─ Calculate and record cost                                    │
│                                                                      │
│  6. Eval Hooks                                                       │
│     └─ Score quality, update metrics                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Strategy Engine

The strategy engine evaluates routing strategies in priority order:

```typescript
interface RoutingStrategy {
  // Unique identifier
  name: string;

  // Evaluation priority (lower = higher priority)
  priority: number;

  // Select the optimal model for this request
  select(request: RoutingRequest, context: RoutingContext): ModelDefinition;

  // Check if this strategy applies to this request
  applies(request: RoutingRequest): boolean;
}
```

**Strategy Evaluation Order:**
1. Check if strategy applies to request
2. If applies, use strategy to select model
3. If model unavailable (circuit breaker), try next strategy
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
│  1. Get historical latency percentiles per model                    │
│  2. Filter models by timeout constraint                             │
│  3. Check current queue depth / rate limit status                   │
│  4. Score models by predicted latency                               │
│  5. Select fastest available model                                  │
│                                                                      │
│  Output: ModelDefinition (fastest qualifying model)                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Latency Prediction:**
```
predicted_latency = p50_historical * queue_factor * rate_limit_factor
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

**Confidence Scoring:**
```
confidence = f(response_length, uncertainty_markers, self_contradiction)
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
│  │   Request   │    │   Budget    │    │   Anomaly   │              │
│  │  Cost Calc  │───▶│  Tracker    │───▶│  Detector   │              │
│  │             │    │             │    │             │              │
│  └─────────────┘    └──────┬──────┘    └─────────────┘              │
│                            │                                         │
│                            ▼                                         │
│                     ┌─────────────┐                                 │
│                     │   Alerting  │                                 │
│                     │   System    │                                 │
│                     └─────────────┘                                 │
│                                                                      │
│  Metrics Tracked:                                                    │
│  - Cost per request                                                  │
│  - Cost per user/team/project                                        │
│  - Cost per model                                                    │
│  - Budget remaining                                                  │
│  - Budget burn rate                                                  │
│  - Cost anomalies (sudden spikes)                                    │
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
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
│  │  Validate   │───▶│  Log        │    │  Track      │              │
│  │  Decision   │    │  Decision   │    │  Metrics    │              │
│  └─────────────┘    └─────────────┘    └─────────────┘              │
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

### Complete Routing Flow

```
1. Client sends routing request
        │
2. Auth middleware validates API key
        │
3. Budget check verifies remaining budget
        │
4. Strategy selector evaluates strategies in priority order:
   - Cost-optimized: select cheapest qualifying model
   - Latency-optimized: select fastest qualifying model
   - Judgment-based: select workhorse, escalate if needed
   - Capability-based: select model with required capabilities
        │
5. Model selected, check circuit breaker:
   - If OPEN: try next model in fallback chain
   - If CLOSED/HALF_OPEN: proceed
        │
6. Execute request against selected model
        │
7. On failure:
   - Record failure for circuit breaker
   - Try next model in fallback chain
   - Repeat until success or chain exhausted
        │
8. Calculate cost based on tokens used
        │
9. Update budget tracker
        │
10. Execute eval hooks:
    - Score quality
    - Update A/B test results
    - Update model rankings
        │
11. Return response with metadata:
    - Selected model
    - Cost
    - Latency
    - Strategy used
    - Quality score (if eval enabled)
        │
12. Log and trace complete request
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
│ - Hard budget limits enforced                                        │
│ - Per-user/team/project isolation                                    │
│ - Real-time budget tracking                                          │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Input                                                       │
│ - Token count validation                                             │
│ - Prompt size limits                                                 │
│ - PII redaction in logs                                              │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Output                                                      │
│ - Cost included in all responses                                     │
│ - Audit logging for all cost events                                  │
│ - Anomaly detection for unusual patterns                             │
└─────────────────────────────────────────────────────────────────────┘
```

### API Key Management

- All API keys stored in environment variables or secret manager
- Never logged or included in responses
- Separate keys per provider for isolation
- Key rotation supported without downtime

### Budget Enforcement

- **Soft limit**: Warning alerts at thresholds (50%, 75%, 90%)
- **Hard limit**: Requests rejected when budget exhausted
- **Isolation**: Each user/team/project has separate budget
- **Audit**: All budget events logged for compliance

---

## Deployment Architecture

### GCP Cloud Run

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Run Service                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    llm-router Container                      │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ Router    │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Core      │  │ Sidecar   │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Min instances: 0 (scale to zero)                                 │
│  - Max instances: 10 (configurable)                                 │
│  - Memory: 512MB, CPU: 1 vCPU                                       │
│  - Timeout: 60s (configurable)                                      │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
│  State: Firestore (budget tracking, circuit breaker state)          │
└─────────────────────────────────────────────────────────────────────┘
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
| Budget exceeded | Budget check | Reject request with 429 |
| All models unavailable | Fallback chain exhausted | Return error with details |
| Provider rate limit | 429 response | Backoff, try next model |
| Cost calculation error | Exception in calculator | Log error, use fallback cost |

---

## References

- **AGENTS.md** — Agent development guide
- **DEV_PLAN.md** — Development checklist
- **README.md** — Quick start and overview
- **config/examples/** — Example configurations
- **MCP Specification** — https://modelcontextprotocol.io/
