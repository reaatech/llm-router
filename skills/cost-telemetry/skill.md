# Cost Telemetry

## Capability

Provides real-time cost tracking, budget management, and spend analytics across all LLM model usage. Tracks per-request costs, enforces budget limits, detects anomalies, and generates detailed cost reports. Provided by `@reaatech/llm-router-telemetry` and consumed by `@reaatech/llm-router-engine`.

## MCP Tools

The llm-router MCP server (`@reaatech/llm-router-mcp`) exposes two telemetry tools:

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `get_cost_report` | `{ budgetId: string, period?: string }` | `{ totalCost: number, totalRequests: number, budgetId: string, period: string, byModel: [...], byStrategy: {...}, remainingBudget: number }` | 30 RPM |
| `get_model_info` | `{ modelId: string }` | `{ id: string, provider: string, capabilities: string[], costPerMillionInput: number, costPerMillionOutput: number, maxTokens: number }` | 100 RPM |

## Usage Examples

### Example 1: Get Cost Report

**User Intent:** View cost breakdown for a specific team this month.

**Tool Call:**
```json
{
  "name": "get_cost_report",
  "arguments": {
    "budgetId": "team-alpha",
    "period": "month"
  }
}
```

**Expected Response:**
```json
{
  "totalCost": 45.67,
  "totalRequests": 1250,
  "budgetId": "team-alpha",
  "period": "month",
  "byModel": [
    { "modelId": "kat-coder-pro", "cost": 23.45, "percentage": 51.4, "requests": 600 },
    { "modelId": "glm-edge", "cost": 12.22, "percentage": 26.8, "requests": 580 },
    { "modelId": "claude-opus", "cost": 10.00, "percentage": 21.8, "requests": 70 }
  ],
  "remainingBudget": 54.33
}
```

### Example 2: Check Model Pricing

**User Intent:** Look up the cost per token for a specific model before routing.

**Tool Call:**
```json
{
  "name": "get_model_info",
  "arguments": {
    "modelId": "claude-opus"
  }
}
```

**Expected Response:**
```json
{
  "id": "claude-opus",
  "provider": "anthropic",
  "capabilities": ["evaluation", "complex-reasoning"],
  "costPerMillionInput": 15.00,
  "costPerMillionOutput": 75.00,
  "maxTokens": 200000,
  "enabled": true
}
```

## Programmatic Usage

```typescript
import { CostTracker, BudgetManager, CostReporter } from '@reaatech/llm-router-telemetry';
import { LLMRouter, parseRouterConfig } from '@reaatech/llm-router-engine';

// Build a router with budget tracking
const router = LLMRouter.fromConfig(config, { executeModel: myExecutor });

// Route a request — cost tracking is automatic
const result = await router.route({ prompt: '...', budgetId: 'team-alpha' });
console.log('Cost:', result.cost);

// Check budget status
const budget = router.getBudget('team-alpha');
if (budget) {
  console.log('Remaining:', budget.remaining, 'of', budget.dailyLimit);
}

// Register budget alerts
import { BudgetManager } from '@reaatech/llm-router-telemetry';

const manager = new BudgetManager();
manager.register({
  id: 'team-alpha',
  dailyLimit: 100,
  alertThresholds: [0.5, 0.75, 0.9],
  hardLimit: true,
});
```

See the `@reaatech/llm-router-telemetry` README for the full API reference.

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `BUDGET_NOT_FOUND` | Specified budgetId doesn't exist | Return error with available budgets |
| `COST_DATA_UNAVAILABLE` | Cost data not yet processed | Use cached estimate, mark as approximate |
| `CALCULATION_ERROR` | Pricing data mismatch | Log error, use fallback pricing |

### Recovery Strategies

1. **Budget not found**: List available budgets or create new budget
2. **Cost data unavailable**: Use cached estimates with freshness indicator
3. **Calculation error**: Use last known good pricing, alert ops team

### Escalation Paths

- If budget is consistently exceeded, trigger budget review
- If cost anomalies detected, alert finance team
- If pricing data is stale, trigger pricing refresh

## Budget Management

### Budget Tiers

| Tier | Daily Limit | Alert Thresholds | Hard Limit |
|------|-------------|------------------|------------|
| **Free** | $5 | 50%, 75% | Yes |
| **Team** | $100 | 50%, 75%, 90% | Yes |
| **Enterprise** | $1000 | 25%, 50%, 75% | No |

### Alert Configuration

```yaml
budgets:
  team-alpha:
    daily_limit: 100.00
    alert_thresholds: [0.5, 0.75, 0.9]
    hard_limit: true
```

## Security Considerations

### PII Handling

- **Budget IDs are anonymized** — no user-identifiable information
- **Cost data is aggregated** — individual request costs not exposed externally
- **Access is role-based** — only authorized users can view cost reports

### Permission Requirements

- API key required for all cost queries
- Budget management requires elevated permissions
- Cost reports are restricted to user's own budgets

### Audit Logging

All cost telemetry operations are logged via `@reaatech/llm-router-engine` observability with:
- `request_id` — unique request identifier
- `operation` — type of operation (route, report, budget check)
- `budget_id` — budget being queried
- `cost` — cost incurred
- `tokens` — input/output token counts
