# Eval Hooks

## Capability

Provides quality scoring, A/B testing, and performance tracking for LLM routing decisions. Enables continuous optimization through automated quality evaluation, statistical A/B testing, and model performance analytics.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `score_quality` | `{ request_id: string, model_id: string, response: string, criteria?: string[] }` | `{ overall_score: number, criteria_scores: { [key: string]: number }, confidence: number, feedback?: string }` | 50 RPM |
| `run_ab_test` | `{ test_name: string, variants: [{ model_id: string, traffic_percentage: number }], duration_days?: number }` | `{ test_id: string, status: 'running' \| 'completed', winner?: string, statistical_significance?: number }` | 10 RPM |
| `get_model_performance` | `{ model_id: string, period?: string }` | `{ model_id: string, avg_quality_score: number, avg_latency_ms: number, success_rate: number, cost_per_request: number }` | 30 RPM |

## Usage Examples

### Example 1: Score Response Quality

**User Intent:** Evaluate the quality of a model's response using automated criteria.

**Tool Call:**
```json
{
  "name": "score_quality",
  "arguments": {
    "request_id": "req-123",
    "model_id": "kat-coder-pro",
    "response": "Here's the code you requested...",
    "criteria": ["correctness", "efficiency", "readability"]
  }
}
```

**Expected Response:**
```json
{
  "overall_score": 4.2,
  "criteria_scores": {
    "correctness": 4.5,
    "efficiency": 4.0,
    "readability": 4.1
  },
  "confidence": 0.87,
  "feedback": "Code is correct and well-structured. Consider optimizing the loop."
}
```

### Example 2: Run A/B Test

**User Intent:** Compare two models to determine which performs better for a specific task.

**Tool Call:**
```json
{
  "name": "run_ab_test",
  "arguments": {
    "test_name": "code-generation-comparison",
    "variants": [
      { "model_id": "kat-coder-pro", "traffic_percentage": 0.5 },
      { "model_id": "gpt-4-turbo", "traffic_percentage": 0.5 }
    ],
    "duration_days": 7
  }
}
```

**Expected Response:**
```json
{
  "test_id": "ab-test-456",
  "status": "running",
  "winner": null,
  "statistical_significance": null
}
```

**Completed Test Response:**
```json
{
  "test_id": "ab-test-456",
  "status": "completed",
  "winner": "kat-coder-pro",
  "statistical_significance": 0.95,
  "results": {
    "kat-coder-pro": { "avg_quality": 4.3, "avg_cost": 0.003 },
    "gpt-4-turbo": { "avg_quality": 4.1, "avg_cost": 0.012 }
  }
}
```

### Example 3: Get Model Performance

**User Intent:** View performance metrics for a specific model over the past week.

**Tool Call:**
```json
{
  "name": "get_model_performance",
  "arguments": {
    "model_id": "kat-coder-pro",
    "period": "week"
  }
}
```

**Expected Response:**
```json
{
  "model_id": "kat-coder-pro",
  "avg_quality_score": 4.2,
  "avg_latency_ms": 2340,
  "success_rate": 0.97,
  "cost_per_request": 0.0028
}
```

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `SCORING_TIMEOUT` | Quality scoring took too long | Use cached score, mark as approximate |
| `INSUFFICIENT_AB_DATA` | Not enough data for statistical significance | Continue collecting, report preliminary results |
| `MODEL_NOT_FOUND` | Specified model doesn't exist | Return error with available models |

### Recovery Strategies

1. **Scoring timeout**: Use heuristic-based score with lower confidence
2. **Insufficient A/B data**: Report preliminary results with confidence interval
3. **Model not found**: List available models and their performance data

### Escalation Paths

- If quality scores consistently drop, trigger model review
- If A/B test shows significant difference, auto-promote winner
- If model performance degrades, reduce traffic allocation

## Quality Scoring

### Scoring Criteria

| Criterion | Description | Weight |
|-----------|-------------|--------|
| **Correctness** | Factual accuracy and logical consistency | 30% |
| **Relevance** | Alignment with user intent | 25% |
| **Completeness** | Thoroughness of response | 20% |
| **Clarity** | Readability and structure | 15% |
| **Conciseness** | Appropriate length | 10% |

### Scoring Methods

1. **LLM-as-Judge**: Use Claude/GPT to score responses
2. **Rule-based**: Automated checks for specific criteria
3. **Human feedback**: Thumbs up/down from users
4. **Hybrid**: Weighted combination of above

## A/B Testing

### Test Configuration

```yaml
ab_tests:
  code-quality-test:
    variants:
      - model_id: kat-coder-pro
        traffic_percentage: 0.5
      - model_id: gpt-4-turbo
        traffic_percentage: 0.5
    success_metric: quality_score
    minimum_sample_size: 1000
    statistical_threshold: 0.95
```

### Statistical Methods

- **Chi-squared test** for categorical outcomes
- **T-test** for continuous metrics
- **Bayesian methods** for sequential testing
- **Bonferroni correction** for multiple comparisons

## Security Considerations

### PII Handling

- **Responses are anonymized** before scoring
- **Quality scores are aggregated** — no individual response exposure
- **A/B test data is de-identified** — no user-level tracking

### Permission Requirements

- API key required for all eval operations
- Quality scoring may require elevated permissions
- A/B test configuration requires admin access

### Audit Logging

All eval hook operations are logged with:
- `request_id` — unique request identifier
- `operation` — type of operation (score, ab_test, performance)
- `model_id` — model being evaluated
- `result` — summary of result (score, winner, metrics)
- `user_id` — hashed user identifier
