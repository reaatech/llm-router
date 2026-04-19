# Fallback Chain Management

## Capability

Provides resilient request handling through ordered fallback chains with circuit breaker integration. When a model fails, requests automatically cascade to the next available model in the chain, ensuring high availability even during provider outages.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `execute_with_fallback` | `{ prompt: string, chain_name: string, timeout_ms?: number, max_retries?: number }` | `{ model_id: string, attempt: number, success: boolean, result?: any, error?: string }` | 100 RPM |
| `get_chain_status` | `{ chain_name: string }` | `{ chain_name: string, models: [{ model_id: string, circuit_state: string, last_failure?: string }], available: boolean }` | 50 RPM |

## Usage Examples

### Example 1: Execute Request with Fallback

**User Intent:** Execute a code generation request with automatic fallback if the primary model fails.

**Tool Call:**
```json
{
  "name": "execute_with_fallback",
  "arguments": {
    "prompt": "Write a binary search implementation...",
    "chain_name": "code-generation",
    "timeout_ms": 10000,
    "max_retries": 1
  }
}
```

**Expected Response (Success on First Try):**
```json
{
  "model_id": "kat-coder-pro",
  "attempt": 1,
  "success": true,
  "result": {
    "content": "def binary_search(arr, target):...",
    "tokens": { "input": 50, "output": 120 }
  }
}
```

**Expected Response (Fallback Required):**
```json
{
  "model_id": "glm-edge",
  "attempt": 2,
  "success": true,
  "result": {
    "content": "def binary_search(arr, target):...",
    "tokens": { "input": 50, "output": 120 }
  }
}
```

### Example 2: Check Chain Status

**User Intent:** Check the health status of all models in a fallback chain.

**Tool Call:**
```json
{
  "name": "get_chain_status",
  "arguments": {
    "chain_name": "code-generation"
  }
}
```

**Expected Response:**
```json
{
  "chain_name": "code-generation",
  "models": [
    {
      "model_id": "kat-coder-pro",
      "circuit_state": "CLOSED",
      "last_failure": null
    },
    {
      "model_id": "glm-edge",
      "circuit_state": "CLOSED",
      "last_failure": "2026-04-15T22:30:00Z"
    },
    {
      "model_id": "kimi-chat",
      "circuit_state": "OPEN",
      "last_failure": "2026-04-15T22:45:00Z"
    }
  ],
  "available": true
}
```

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `CHAIN_EXHAUSTED` | All models in chain failed | Return error with details of all failures |
| `CHAIN_NOT_FOUND` | Specified chain doesn't exist | Return error with available chains |
| `TIMEOUT_EXCEEDED` | Total timeout exceeded across chain | Return partial result or error |
| `CIRCUIT_BREAKER_OPEN` | All models have open circuits | Wait for recovery or return error |

### Recovery Strategies

1. **Chain exhausted**: Return detailed error with all failure reasons
2. **Chain not found**: List available chains and their configurations
3. **Timeout exceeded**: Return partial result if available, otherwise error
4. **All circuits open**: Wait for half-open state or suggest alternative chain

### Escalation Paths

- If chain exhaustion rate exceeds threshold, review model health
- If specific models consistently fail, investigate provider issues
- If timeouts are common, review timeout configuration

## Circuit Breaker Integration

### Circuit States

| State | Behavior |
|-------|----------|
| **CLOSED** | Normal operation, model is healthy |
| **OPEN** | Model is unhealthy, skip to next in chain |
| **HALF_OPEN** | Testing if model has recovered (limited requests) |

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

All fallback chain operations are logged with:
- `request_id` — unique request identifier
- `chain_name` — fallback chain used
- `models_attempted` — list of models tried
- `final_model` — model that succeeded (or last attempted)
- `total_attempts` — number of attempts
- `total_duration_ms` — total time across chain
- `circuit_breaker_activations` — which models were circuit-broken
