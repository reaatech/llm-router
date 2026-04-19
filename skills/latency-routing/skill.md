# Latency-Optimized Routing

## Capability

Routes LLM requests to the fastest available model based on historical latency data, current queue depth, and timeout constraints. Prioritizes response time over cost.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_latency_optimized` | `{ prompt: string, timeout_ms?: number, target_p99_ms?: number, required_capabilities?: string[] }` | `{ model_id: string, predicted_latency_ms: number, historical_p50_ms: number, historical_p99_ms: number }` | 100 RPM |

## Usage Examples

### Example 1: Basic Latency Optimization

**User Intent:** Route a real-time chat message to the fastest model.

**Tool Call:**
```json
{
  "name": "route_latency_optimized",
  "arguments": {
    "prompt": "Hello, how are you?",
    "timeout_ms": 3000,
    "target_p99_ms": 2000
  }
}
```

**Expected Response:**
```json
{
  "model_id": "glm-edge",
  "predicted_latency_ms": 1500,
  "historical_p50_ms": 1200,
  "historical_p99_ms": 1800
}
```

### Example 2: Latency Optimization with Capabilities

**User Intent:** Route a coding question to the fastest model that supports code generation.

**Tool Call:**
```json
{
  "name": "route_latency_optimized",
  "arguments": {
    "prompt": "How do I reverse a string in Python?",
    "required_capabilities": ["code"],
    "timeout_ms": 5000
  }
}
```

**Expected Response:**
```json
{
  "model_id": "kat-coder-pro",
  "predicted_latency_ms": 2800,
  "historical_p50_ms": 2200,
  "historical_p99_ms": 3500
}
```

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `NO_MODEL_MEETS_TIMEOUT` | No model can meet timeout requirement | Relax timeout or return error |
| `INSUFFICIENT_LATENCY_DATA` | Not enough historical data | Use conservative estimate |
| `ALL_MODELS_DEGRADED` | All models experiencing high latency | Fall back to cost-optimized strategy |

### Recovery Strategies

1. **No model meets timeout**: Suggest increased timeout or fall back to best-effort
2. **Insufficient data**: Use p99 estimate with warning flag
3. **All models degraded**: Trigger alert, use cost-optimized fallback

### Escalation Paths

- If latency consistently exceeds targets, trigger infrastructure alert
- If all models are degraded, escalate to operations team

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

All latency-optimized routing decisions are logged with:
- `request_id` — unique request identifier
- `timeout_ms` — requested timeout
- `selected_model` — model chosen
- `predicted_latency_ms` — estimated response time
- `historical_p50_ms` — historical median
- `historical_p99_ms` — historical 99th percentile
