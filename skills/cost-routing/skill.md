# Cost-Based Routing

## Capability

Routes LLM requests to the cheapest available model that meets quality and capability requirements while respecting budget constraints. Provided by `@reaatech/llm-router-strategies` via the `CostOptimizedStrategy` class.

## MCP Tools

The llm-router MCP server (`@reaatech/llm-router-mcp`) exposes routing through a unified `route_request` tool. The strategy parameter selects the routing approach:

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `route_request` (strategy: cost-optimized) | `{ prompt: string, maxTokens?: number, requiredCapabilities?: string[], budgetId?: string }` | `{ model: {...}, strategy: string, cost: number, confidence: number, latencyMs: number, result: {...} }` | 100 RPM |

## Usage Examples

### Example 1: Basic Cost Optimization

**User Intent:** Route a simple summarization task to the cheapest model.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Summarize this article in 3 sentences...",
    "strategy": "cost-optimized",
    "maxTokens": 500,
    "budgetId": "team-alpha"
  }
}
```

**Expected Response:**
```json
{
  "model": { "id": "glm-edge", "provider": "zhipu" },
  "strategy": "cost-optimized",
  "cost": 0.0003,
  "confidence": 0.95,
  "latencyMs": 320
}
```

### Example 2: Cost Optimization with Capability Requirements

**User Intent:** Route a coding task to the cheapest model that supports code generation.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Write a function to sort an array...",
    "strategy": "cost-optimized",
    "requiredCapabilities": ["code"],
    "maxTokens": 2000
  }
}
```

**Expected Response:**
```json
{
  "model": { "id": "kat-coder-pro", "provider": "kuaishou" },
  "strategy": "cost-optimized",
  "cost": 0.0025,
  "confidence": 0.92,
  "latencyMs": 520
}
```

## Programmatic Usage

```typescript
import { CostOptimizedStrategy } from '@reaatech/llm-router-strategies';

const strategy = new CostOptimizedStrategy({
  workhorsePool: ['kat-coder-pro', 'kimi-chat', 'glm-edge'],
  budgetPerRequest: 0.05,
});
```

See the `@reaatech/llm-router-strategies` README for the full API reference.

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `BUDGET_EXCEEDED` | Budget limit reached for budgetId | Return error, suggest increasing budget or using a different budgetId |
| `NO_QUALIFYING_MODELS` | No models match capability requirements | Return error with available capabilities |
| `COST_CALCULATION_ERROR` | Token count or pricing error | Log error, use fallback cost estimate |

### Recovery Strategies

1. **Budget exceeded**: Suggest alternative budgetId or request a budget increase
2. **No qualifying models**: List available models and their capabilities
3. **Cost calculation error**: Use cached cost estimate, log warning

### Escalation Paths

- If cost optimization consistently fails, escalate to latency-optimized strategy
- If budget is consistently exceeded, trigger budget review alert
- Circuit breaker integration (via `@reaatech/llm-router-fallback`) skips unhealthy models automatically

## Security Considerations

### PII Handling

- **Never log raw prompts** — hash or truncate before logging
- **Never include budget details in client responses** — only show remaining budget
- **Isolate budget tracking** — each budgetId is independent

### Permission Requirements

- API key required for all routing requests
- Budget management requires elevated permissions
- Cost reports are restricted to authorized users

### Audit Logging

All cost-based routing decisions are logged via `@reaatech/llm-router-engine` observability with:
- `request_id` — unique request identifier
- `budget_id` — budget being charged
- `selected_model` — model chosen
- `cost` — cost of the request
- `alternatives_considered` — number of models evaluated
