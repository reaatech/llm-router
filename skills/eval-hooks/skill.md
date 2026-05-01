# Eval Hooks

## Capability

Provides quality scoring, A/B testing, and performance tracking for LLM routing decisions. Enables continuous optimization through automated quality evaluation, statistical A/B testing, and model performance analytics. Provided by `@reaatech/llm-router-engine`.

## MCP Tools

Quality scoring and performance data are available via the router's internal eval hooks system. The MCP server does not expose dedicated eval tools — eval is configured in the router and runs automatically during `route_request`:

| Tool | How eval integrates |
|------|---------------------|
| `route_request` | Post-execution hooks run quality scoring, update A/B test stats, and record performance metrics automatically when the router is configured with eval hooks |
| `get_model_info` | Returns model metadata — performance data is tracked internally by `PerformanceTracker` |
| `get_cost_report` | Returns cost data — quality and performance trends are available via the `ObservabilityDashboard` |

## Usage Examples

### Example 1: Quality Scoring via Route Request

**User Intent:** Route a request and get a quality score back with the response.

**Tool Call:**
```json
{
  "name": "route_request",
  "arguments": {
    "prompt": "Write a function to calculate Fibonacci numbers...",
    "strategy": "cost-optimized",
    "maxTokens": 1000
  }
}
```

**Expected Response (with quality score when `responseEvaluator` is enabled):**
```json
{
  "model": { "id": "kat-coder-pro", "provider": "kuaishou" },
  "strategy": "cost-optimized",
  "cost": 0.0035,
  "confidence": 0.91,
  "latencyMs": 720,
  "result": {
    "content": "function fibonacci(n: number): number { ... }",
    "qualityScore": 4.2,
    "success": true
  }
}
```

### Example 2: A/B Test via Programmatic Setup

**User Intent:** Compare two models to determine which performs better. Configured via code, not MCP.

```typescript
import { ABTestManager, LLMRouter, parseRouterConfig } from '@reaatech/llm-router-engine';

const ab = new ABTestManager();
ab.start({
  testA: { modelId: 'glm-edge', trafficPercent: 50 },
  testB: { modelId: 'kat-coder-pro', trafficPercent: 50 },
});

// In your route handler, use the AB test to select
const variant = ab.select();
const result = await router.route({ prompt, modelId: variant.modelId });
ab.record(variant, { latencyMs: result.latencyMs, qualityScore: result.result.qualityScore });
```

**Checking Results:**
```typescript
const stats = ab.getStats();
console.log(`glm-edge: winRate=${stats.testA.winRate}, kat-coder-pro: winRate=${stats.testB.winRate}`);
const winner = ab.getWinner(); // Returns the variant with the best stats
```

### Example 3: Model Performance Tracking

**User Intent:** Check aggregated performance stats for a model. Available programmatically via `PerformanceTracker`.

```typescript
import { PerformanceTracker } from '@reaatech/llm-router-engine';

const tracker = new PerformanceTracker();
const allPerf = tracker.getAllPerformance(router.getModels());

for (const perf of allPerf) {
  console.log(
    perf.modelId,
    `avg: ${perf.latencyP50}ms`,
    `p95: ${perf.latencyP95}ms`,
    `success: ${(perf.successRate * 100).toFixed(1)}%`,
  );
}
```

## Programmatic Usage

### Quality Scoring

```typescript
import { QualityScorer, createRuleBasedScorer } from '@reaatech/llm-router-engine';

const scorer = new QualityScorer();
scorer.register('rule-based', createRuleBasedScorer(), true);

const score = await scorer.score(request, result, model);
console.log(score.overall, score.relevance, score.correctness);
```

### Eval Hooks Manager

```typescript
import { evalHooksManager } from '@reaatech/llm-router-engine';

evalHooksManager.onPreRouting(async (request, context) => {
  request.confidenceThreshold = 0.95;
  return request;
});

evalHooksManager.onPostExecution(async (result, decision, request, context) => {
  await analytics.track('routing_complete', { modelId: decision.modelId, cost: result.actualCost });
  return result;
});
```

See the `@reaatech/llm-router-engine` README for the full API reference.

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

1. **Rule-based** (`createRuleBasedScorer`): Automated checks for specific criteria — included by default in `LLMRouter`
2. **LLM-as-Judge**: Use a judge model (Claude/GPT-4) to score responses
3. **Human feedback** (`HumanFeedbackStore`): Thumbs up/down from users
4. **Hybrid**: Weighted combination of above via `createQualityScorerWithFeedback`

## A/B Testing

### Test Configuration

```typescript
abTestManager.start({
  testA: { modelId: 'kat-coder-pro', trafficPercent: 50 },
  testB: { modelId: 'gpt-4-turbo', trafficPercent: 50 },
});
```

### Statistical Methods

The `ABTestManager` tracks per-variant aggregates (quality scores, latency, cost) and can compute win rates. For production use, integrate with a statistical testing library for significance calculations.

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

All eval hook operations are logged via `@reaatech/llm-router-engine` observability with:
- `request_id` — unique request identifier
- `operation` — type of operation (score, ab_test, performance)
- `model_id` — model being evaluated
- `result` — summary of result (score, winner, metrics)
