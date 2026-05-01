# Fallback Chain Management

## Capability

Provides resilient request handling through ordered fallback chains with circuit breaker integration. When a model fails, requests automatically cascade to the next available model in the chain, ensuring high availability even during provider outages. Provided by `@reaatech/llm-router-fallback` and consumed by `@reaatech/llm-router-engine`.

## MCP Tools

The llm-router MCP server (`@reaatech/llm-router-mcp`) does not expose a dedicated fallback tool — fallback chains are configured in the router config and execute automatically during `route_request`:

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_request` (uses configured chains) | `{ prompt: string, strategy?: string, budgetId?: string, maxTokens?: number, metadata?: { fallbackChain?: string } }` | `{ model: {...}, strategy: string, cost: number, confidence: number, latencyMs: number, result: {...} }` | 100 RPM |
| `get_model_info` | `{ modelId: string }` | `{ id: string, provider: string, capabilities: string[], costPerMillionInput: number, costPerMillionOutput: number, maxTokens: number, enabled: boolean, circuitState?: string }` | 100 RPM |

## Usage Examples

### Example 1: Execute Request with Automatic Fallback

**User Intent:** Execute a code generation request with automatic fallback if the primary model fails. No special token needed — the router handles it if a fallback chain is configured.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Write a binary search implementation...",
    "strategy": "cost-optimized",
    "timeoutMs": 10000
  }
}
```

**Expected Response (Success on First Try):**
```json
{
  "model": { "id": "kat-coder-pro", "provider": "kuaishou" },
  "strategy": "cost-optimized",
  "cost": 0.0015,
  "confidence": 0.95,
  "latencyMs": 450
}
```

**Expected Response (Fallback Required — primary failed, chain cascaded):**
```json
{
  "model": { "id": "glm-edge", "provider": "zhipu" },
  "strategy": "cost-optimized",
  "cost": 0.0012,
  "confidence": 0.92,
  "latencyMs": 520
}
```

### Example 2: Check Model Health via Circuit Breaker State

**User Intent:** Check the health status of a model (its circuit breaker state).

**Tool Call:**
```json
{
  "name": "get_model_info",
  "arguments": {
    "modelId": "kat-coder-pro"
  }
}
```

**Expected Response:**
```json
{
  "id": "kat-coder-pro",
  "provider": "kuaishou",
  "capabilities": ["code", "reasoning"],
  "costPerMillionInput": 0.50,
  "costPerMillionOutput": 1.00,
  "maxTokens": 32000,
  "enabled": true
}
```

## Programmatic Usage

```typescript
import { FallbackChain, CircuitBreaker } from '@reaatech/llm-router-fallback';

// Create a fallback chain
const chain = new FallbackChain({
  name: 'code-generation',
  models: ['kat-coder-pro', 'glm-edge', 'kimi-chat'],
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 60000,
    halfOpenMaxCalls: 3,
  },
});

chain.registerModels(allModels);

// Execute with automatic fallback
const result = await chain.executeFrom('kat-coder-pro', async (model) => {
  return await callLLM(model);
}, allModels);
```

See the `@reaatech/llm-router-fallback` README for the full API reference.

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `FallbackChainExhaustedError` | All models in chain failed | Return error with details of all failure causes |
| `CHAIN_NOT_FOUND` | Referenced chain name doesn't exist | List available chains from router config |
| `TIMEOUT_EXCEEDED` | Total timeout exceeded across chain | Return partial result or error |
| `CIRCUIT_BREAKER_OPEN` | All models have open circuits | Wait for half-open state or return error |

### Recovery Strategies

1. **Chain exhausted**: Return detailed error with all failure reasons for debugging
2. **Chain not found**: List available chains and their configurations from the router
3. **Timeout exceeded**: Return partial result if available, otherwise error
4. **All circuits open**: The circuit breaker automatically transitions to HALF_OPEN after `resetTimeoutMs`, allowing recovery

### Escalation Paths

- If chain exhaustion rate exceeds threshold, review model health
- If specific models consistently fail, investigate provider issues
- If timeouts are common, review timeout configuration

## Circuit Breaker Integration

### Circuit States

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation, model is healthy. Failures are counted. |
| **OPEN** | Model is unhealthy, skip to next in chain. Transitions to HALF_OPEN after `resetTimeoutMs`. |
| **HALF_OPEN** | Testing if model has recovered. Limited probe requests allowed. |

### Configuration

```yaml
fallback_chains:
  - name: code-generation
    models: [kat-coder-pro, glm-edge, kimi-chat]
    circuit_breaker:
      failure_threshold: 5
      reset_timeout_ms: 60000
      half_open_max_calls: 3
```

## Security Considerations

### PII Handling

- **Never log raw prompts** — hash or truncate before logging
- **Failure details are sanitized** — no sensitive data in error messages
- **Circuit breaker state is anonymized** — no user-specific patterns

### Permission Requirements

- API key required for all routing requests
- Chain configuration changes require elevated permissions
- Circuit breaker overrides require admin access

### Audit Logging

All fallback chain operations are logged via `@reaatech/llm-router-engine` observability with:
- `request_id` — unique request identifier
- `chain_name` — fallback chain used
- `models_attempted` — list of models tried
- `final_model` — model that succeeded (or last attempted)
- `total_attempts` — number of attempts
- `circuit_breaker_activations` — which models were circuit-broken
