# Judgment-Based Routing

## Capability

Routes LLM requests using a two-tier approach: cheap workhorse models (KAT-Coder, Kimi, GLM) handle routine tasks, while premium judge models (Claude, GPT-4) are reserved for complex reasoning, debugging, and evaluation. Escalation is triggered by low confidence scores or explicit request. Provided by `@reaatech/llm-router-strategies` via the `JudgmentBasedStrategy` class.

## MCP Tools

The llm-router MCP server (`@reaatech/llm-router-mcp`) exposes routing through a unified `route_request` tool:

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_request` (strategy: judgment-based) | `{ prompt: string, strategy: string, confidenceThreshold?: number, maxTokens?: number, budgetId?: string }` | `{ model: {...}, strategy: string, cost: number, confidence: number, latencyMs: number, result: {...} }` | 50 RPM |

## Usage Examples

### Example 1: Standard Judgment-Based Routing

**User Intent:** Route a code review task — use workhorse for initial review, escalate to judge if confidence is low.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Review this code for security vulnerabilities...",
    "strategy": "judgment-based",
    "confidenceThreshold": 0.7,
    "maxTokens": 4000
  }
}
```

**Expected Response (No Escalation — workhorse confident):**
```json
{
  "model": { "id": "kat-coder-pro", "provider": "kuaishou" },
  "strategy": "judgment-based",
  "cost": 0.0030,
  "confidence": 0.85,
  "latencyMs": 1200
}
```

**Expected Response (With Escalation — escalated to judge):**
```json
{
  "model": { "id": "claude-opus", "provider": "anthropic" },
  "strategy": "judgment-based",
  "cost": 0.0450,
  "confidence": 0.92,
  "latencyMs": 3200
}
```

### Example 2: Consensus-Based Judgment

**User Intent:** Get evaluation from multiple judge models for critical decisions.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Evaluate the correctness of this mathematical proof...",
    "strategy": "judgment-based",
    "confidenceThreshold": 0.8,
    "maxTokens": 8000
  }
}
```

**Expected Response:**
```json
{
  "model": { "id": "gpt-4-turbo", "provider": "openai" },
  "strategy": "judgment-based",
  "cost": 0.0780,
  "confidence": 0.92,
  "latencyMs": 4500
}
```

## Programmatic Usage

```typescript
import { JudgmentBasedStrategy } from '@reaatech/llm-router-strategies';

const strategy = new JudgmentBasedStrategy({
  workhorsePool: ['kat-coder-pro', 'kimi-chat'],
  judgePool: ['claude-opus', 'gpt-4-turbo'],
  escalationThreshold: 0.7,
  maxJudgeInvocations: 2,
  consensusRequired: false,
});
```

See the `@reaatech/llm-router-strategies` README for the full API reference.

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `JUDGE_UNAVAILABLE` | All judge models are circuit-broken | Return workhorse result with confidence warning |
| `CONSENSUS_TIMEOUT` | Consensus not reached within max invocations | Return best available result |
| `CONFIDENCE_CALCULATION_ERROR` | Error computing confidence score | Default to escalation for safety |

### Recovery Strategies

1. **Judge unavailable**: Return workhorse result with low-confidence flag — circuit breakers (via `@reaatech/llm-router-fallback`) handle this automatically
2. **Consensus timeout**: Return majority vote or highest-confidence result
3. **Confidence error**: Default to escalation for safety

### Escalation Paths

- If judge models are consistently unavailable, trigger infrastructure alert
- If escalation rate exceeds threshold, review workhorse model performance
- If consensus is rarely achieved, review judge model selection

## Security Considerations

### PII Handling

- **Never log raw prompts** — hash or truncate before logging
- **Confidence scores are anonymized** — no user-specific patterns stored
- **Judge model access is restricted** — only authorized users can escalate

### Permission Requirements

- API key required for all routing requests
- Judge model access may require elevated permissions
- Consensus-based routing may be restricted to premium tiers

### Audit Logging

All judgment-based routing decisions are logged via `@reaatech/llm-router-engine` observability with:
- `request_id` — unique request identifier
- `strategy` — always `judgment-based`
- `primary_model` — workhorse model used (if not escalated)
- `escalated_model` — judge model used (if escalated)
- `confidence_score` — route confidence
- `total_cost` — combined cost of workhorse + judge
