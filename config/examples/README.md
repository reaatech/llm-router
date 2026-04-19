# Configuration Examples

This directory contains example router configurations demonstrating different
routing strategies and model pool setups.

## Available Configs

### workhorse-judge.yaml

A two-tier setup using cheap workhorse models (KAT-Coder Pro, Kimi Chat, GLM Edge)
for routine tasks and premium judge models (Claude Opus, GPT-4 Turbo) for complex
reasoning and evaluation. Uses judgment-based routing with automatic escalation.

**Best for:** Code review, complex reasoning tasks, quality-critical applications.

### cost-optimized.yaml

Focuses on minimizing cost by routing all requests to the cheapest available
models that meet capability requirements. Uses cost-optimized strategy with
strict budget enforcement.

**Best for:** High-volume routine tasks, budget-constrained environments.

### low-latency.yaml

Prioritizes response time by selecting the fastest models based on historical
latency data. Uses latency-optimized strategy with aggressive timeout targets.

**Best for:** Real-time chat, interactive applications, user-facing features.

## Using These Configs

```bash
# Validate a config
node dist/src/cli.js validate-config --config config/examples/workhorse-judge.yaml

# Route a request using a specific config
node dist/src/cli.js route \
  --config config/examples/cost-optimized.yaml \
  --strategy cost-optimized \
  --prompt "Summarize this document..."

# Generate a cost report
node dist/src/cli.js cost-report \
  --config config/examples/workhorse-judge.yaml \
  --period today
```

## Customizing

Copy any example and modify:

1. **Models** — Add/remove models, adjust pricing, change capabilities
2. **Strategies** — Tune thresholds, pool selections, escalation rules
3. **Fallback chains** — Define degradation paths for your use case
4. **Budgets** — Set daily limits and alert thresholds

See [README.md](../../README.md#configuration) and [AGENTS.md](../../AGENTS.md#model-configuration)
for detailed configuration documentation.
