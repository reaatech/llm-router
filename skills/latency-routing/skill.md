# Latency-Optimized Routing

## Capability

Routes LLM requests to the fastest available model based on historical latency data, current queue depth, and timeout constraints. Prioritizes response time over cost. Provided by `@reaatech/llm-router-strategies` via the `LatencyOptimizedStrategy` class.

## MCP Tools

The llm-router MCP server (`@reaatech/llm-router-mcp`) exposes routing through a unified `route_request` tool:

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_request` (strategy: latency-optimized) | `{ prompt: string, timeoutMs?: number, confidenceThreshold?: number, requiredCapabilities?: string[] }` | `{ model: {...}, strategy: string, cost: number, confidence: number, latencyMs: number, result: {...} }` | 100 RPM |

## Usage Examples

### Example 1: Basic Latency Optimization

**User Intent:** Route a real-time chat message to the fastest model.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Hello, how are you?",
    "strategy": "latency-optimized",
    "timeoutMs": 3000,
    "confidenceThreshold": 0.9
  }
}
```

**Expected Response:**
```json
{
  "model": { "id": "glm-edge", "provider": "zhipu" },
  "strategy": "latency-optimized",
  "cost": 0.0002,
  "confidence": 0.95,
  "latencyMs": 320
}
```

### Example 2: Latency Optimization with Capabilities

**User Intent:** Route a coding question to the fastest model that supports code generation.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "How do I reverse a string in Python?",
    "strategy": "latency-optimized",
    "requiredCapabilities": ["code"],
    "timeoutMs": 5000
  }
}
```

**Expected Response:**
```json
{
  "model": { "id": "kat-coder-pro", "provider": "kuaishou" },
  "strategy": "latency-optimized",
  "cost": 0.0015,
  "confidence": 0.88,
  "latencyMs": 520
}
```

## Programmatic Usage

```typescript
import { LatencyOptimizedStrategy } from '@reaatech/llm-router-strategies';

const strategy = new LatencyOptimizedStrategy({
  modelPool: ['glm-edge', 'kat-coder-pro'],
  targetP99Ms: 2000,
  defaultTimeoutMs: 3000,
});
```

See the `@reaatech/llm-router-strategies` README for the full API reference.

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `NO_MODEL_MEETS_TIMEOUT` | No model can meet timeout requirement | Relax timeout or return error with fastest available model |
| `INSUFFICIENT_LATENCY_DATA` | Not enough historical data | Use conservative estimate, warm up with a few requests |
| `ALL_MODELS_DEGRADED` | All models experiencing high latency | Fall back to cost-optimized strategy |

### Recovery Strategies

1. **No model meets timeout**: Suggest increased timeout or fall back to best-effort
2. **Insufficient data**: Use p99 estimate with warning flag, data improves over time
3. **All models degraded**: Trigger alert, use cost-optimized fallback

### Escalation Paths

- If latency consistently exceeds targets, trigger infrastructure alert
- If all models are degraded, escalate to operations team
- Circuit breaker integration (via `@reaatech/llm-router-fallback`) skips degraded models automatically

## Security Considerations

### PII Handling

- **Never log raw prompts** — hash or truncate before logging
- **Latency data is anonymized** — no user-specific patterns stored
- **Rate limiting per client** — prevent latency probing attacks

### Permission Requirements

- API key required for all routing requests
- Latency targets are configurable per user tier
- Infrastructure alerts require elevated permissions

### Audit Logging

All latency-optimized routing decisions are logged via `@reaatech/llm-router-engine` observability with:
- `request_id` — unique request identifier
- `timeout_ms` — requested timeout
- `selected_model` — model chosen
- `predicted_latency_ms` — estimated response time
- `historical_p50_ms` — historical median
- `historical_p99_ms` — historical 99th percentile
