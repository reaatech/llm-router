# Cost Telemetry

## Capability

Provides real-time cost tracking, budget management, and spend analytics across all LLM model usage. Tracks per-request costs, enforces budget limits, detects anomalies, and generates detailed cost reports for chargeback and optimization.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `get_cost_report` | `{ budget_id?: string, period?: string, group_by?: string }` | `{ total_cost: number, breakdown: [{ model_id: string, cost: number, tokens: { input: number, output: number } }], budget_remaining?: number }` | 30 RPM |
| `check_budget` | `{ budget_id: string }` | `{ budget_id: string, daily_limit: number, spent: number, remaining: number, percentage_used: number, status: 'ok' \| 'warning' \| 'exceeded' }` | 100 RPM |
| `estimate_cost` | `{ prompt: string, model_id: string, max_tokens?: number }` | `{ estimated_cost: number, estimated_tokens: { input: number, output: number }, cost_per_million_input: number, cost_per_million_output: number }` | 100 RPM |

## Usage Examples

### Example 1: Get Cost Report

**User Intent:** View cost breakdown for a specific team this month.

**Tool Call:**
```json
{
  "name": "get_cost_report",
  "arguments": {
    "budget_id": "team-alpha",
    "period": "month",
    "group_by": "model"
  }
}
```

**Expected Response:**
```json
{
  "total_cost": 45.67,
  "breakdown": [
    {
      "model_id": "kat-coder-pro",
      "cost": 23.45,
      "tokens": { "input": 1200000, "output": 450000 }
    },
    {
      "model_id": "glm-edge",
      "cost": 12.22,
      "tokens": { "input": 2100000, "output": 320000 }
    },
    {
      "model_id": "claude-opus",
      "cost": 10.00,
      "tokens": { "input": 50000, "output": 8000 }
    }
  ],
  "budget_remaining": 54.33
}
```

### Example 2: Check Budget Status

**User Intent:** Check remaining budget for a specific project.

**Tool Call:**
```json
{
  "name": "check_budget",
  "arguments": {
    "budget_id": "project-x"
  }
}
```

**Expected Response:**
```json
{
  "budget_id": "project-x",
  "daily_limit": 100.00,
  "spent": 75.50,
  "remaining": 24.50,
  "percentage_used": 75.5,
  "status": "warning"
}
```

### Example 3: Estimate Cost Before Execution

**User Intent:** Estimate the cost of a request before sending it.

**Tool Call:**
```json
{
  "name": "estimate_cost",
  "arguments": {
    "prompt": "Write a detailed analysis of...",
    "model_id": "claude-opus",
    "max_tokens": 4000
  }
}
```

**Expected Response:**
```json
{
  "estimated_cost": 0.09,
  "estimated_tokens": { "input": 100, "output": 4000 },
  "cost_per_million_input": 15.00,
  "cost_per_million_output": 75.00
}
```

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `BUDGET_NOT_FOUND` | Specified budget_id doesn't exist | Return error with available budgets |
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
    alert_channels: [slack, email]
```

## Security Considerations

### PII Handling

- **Budget IDs are anonymized** — no user-identifiable information
- **Cost data is aggregated** — individual request costs not exposed
- **Access is role-based** — only authorized users can view cost reports

### Permission Requirements

- API key required for all cost queries
- Budget management requires elevated permissions
- Cost reports are restricted to user's own budgets

### Audit Logging

All cost telemetry operations are logged with:
- `request_id` — unique request identifier
- `operation` — type of operation (report, check, estimate)
- `budget_id` — budget being queried
- `result` — summary of result (cost, remaining, status)
- `user_id` — hashed user identifier
