# Judgment-Based Routing

## Capability

Routes LLM requests using a two-tier approach: cheap workhorse models (KAT-Coder, Kimi, GLM) handle routine tasks, while premium judge models (Claude, GPT-4) are reserved for complex reasoning, debugging, and evaluation. Escalation is triggered by low confidence scores or explicit request.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_judgment_based` | `{ prompt: string, task_type?: string, confidence_threshold?: number, max_judge_invocations?: number, require_consensus?: boolean }` | `{ primary_model: string, judge_model?: string, confidence_score: number, escalated: boolean, total_cost: number }` | 50 RPM |

## Usage Examples

### Example 1: Standard Judgment-Based Routing

**User Intent:** Route a code review task — use workhorse for initial review, escalate to judge if confidence is low.

**Tool Call:**
```json
{
  "name": "route_judgment_based",
  "arguments": {
    "prompt": "Review this code for security vulnerabilities...",
    "task_type": "code_review",
    "confidence_threshold": 0.7,
    "max_judge_invocations": 2
  }
}
```

**Expected Response (No Escalation):**
```json
{
  "primary_model": "kat-coder-pro",
  "confidence_score": 0.85,
  "escalated": false,
  "total_cost": 0.003
}
```

**Expected Response (With Escalation):**
```json
{
  "primary_model": "kat-coder-pro",
  "judge_model": "claude-opus",
  "confidence_score": 0.45,
  "escalated": true,
  "total_cost": 0.045
}
```

### Example 2: Consensus-Based Judgment

**User Intent:** Get evaluation from multiple judge models for critical decisions.

**Tool Call:**
```json
{
  "name": "route_judgment_based",
  "arguments": {
    "prompt": "Evaluate the correctness of this mathematical proof...",
    "task_type": "evaluation",
    "confidence_threshold": 0.8,
    "require_consensus": true,
    "max_judge_invocations": 3
  }
}
```

**Expected Response:**
```json
{
  "primary_model": "kimi-chat",
  "judge_model": "gpt-4-turbo",
  "consensus_models": ["claude-opus", "gpt-4-turbo"],
  "confidence_score": 0.92,
  "escalated": true,
  "total_cost": 0.078
}
```

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `JUDGE_UNAVAILABLE` | All judge models are circuit-broken | Return workhorse result with confidence warning |
| `CONSENSUS_TIMEOUT` | Consensus not reached within max invocations | Return best available result |
| `CONFIDENCE_CALCULATION_ERROR` | Error computing confidence score | Default to escalation |

### Recovery Strategies

1. **Judge unavailable**: Return workhorse result with low-confidence flag
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

All judgment-based routing decisions are logged with:
- `request_id` — unique request identifier
- `task_type` — type of task (code_review, evaluation, etc.)
- `primary_model` — workhorse model used
- `judge_model` — judge model used (if escalated)
- `confidence_score` — workhorse confidence
- `escalated` — whether escalation occurred
- `total_cost` — combined cost of workhorse + judge
