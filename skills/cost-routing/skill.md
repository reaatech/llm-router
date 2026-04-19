# Cost-Based Routing

## Capability

Routes LLM requests to the cheapest available model that meets quality and capability requirements while respecting budget constraints.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_cost_optimized` | `{ prompt: string, max_tokens?: number, required_capabilities?: string[], budget_id?: string }` | `{ model_id: string, cost: number, estimated_tokens: { input: number, output: number } }` | 100 RPM |

## Usage Examples

### Example 1: Basic Cost Optimization

**User Intent:** Route a simple summarization task to the cheapest model.

**Tool Call:**
```json
{
  "name": "route_cost_optimized",
  "arguments": {
    "prompt": "Summarize this article in 3 sentences...",
    "max_tokens": 500,
    "budget_id": "team-alpha"
  }
}
```

**Expected Response:**
```json
{
  "model_id": "glm-edge",
  "cost": 0.0003,
  "estimated_tokens": {
    "input": 200,
    "output": 50
  }
}
```

### Example 2: Cost Optimization with Capability Requirements

**User Intent:** Route a coding task to the cheapest model that supports code generation.

**Tool Call:**
```json
{
  "name": "route_cost_optimized",
  "arguments": {
    "prompt": "Write a function to sort an array...",
    "required_capabilities": ["code"],
    "max_tokens": 2000
  }
}
```

**Expected Response:**
```json
{
  "model_id": "kat-coder-pro",
  "cost": 0.0025,
  "estimated_tokens": {
    "input": 100,
    "output": 150
  }
}
```

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `BUDGET_EXCEEDED` | Budget limit reached for budget_id | Return error, suggest increasing budget |
| `NO_QUALIFYING_MODELS` | No models match capability requirements | Return error with available capabilities |
| `COST_CALCULATION_ERROR` | Token count or pricing error | Log error, use fallback cost estimate |

### Recovery Strategies

1. **Budget exceeded**: Suggest alternative budget_id or increase limit
2. **No qualifying models**: List available models and their capabilities
3. **Cost calculation error**: Use cached cost estimate, log warning

### Escalation Paths

- If cost optimization consistently fails, escalate to latency-optimized strategy
- If budget is consistently exceeded, trigger budget review alert

## Security Considerations

### PII Handling

- **Never log raw prompts** — hash or truncate before logging
- **Never include budget details in client responses** — only show remaining budget
- **Isolate budget tracking** — each budget_id is independent

### Permission Requirements

- API key required for all routing requests
- Budget management requires elevated permissions
- Cost reports are restricted to authorized users

### Audit Logging

All cost-based routing decisions are logged with:
- `request_id` — unique request identifier
- `budget_id` — budget being charged
- `selected_model` — model chosen
- `cost` — cost of the request
- `alternatives_considered` — number of models evaluated
