# @reaatech/llm-router-cli

[![npm version](https://img.shields.io/npm/v/@reaatech/llm-router-cli.svg)](https://www.npmjs.com/package/@reaatech/llm-router-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/llm-router/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/llm-router/ci.yml?branch=main&label=CI)](https://github.com/reaatech/llm-router/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Command-line interface for llm-router. Provides four commands — `route`, `benchmark`, `cost-report`, and `validate-config` — for routing prompts, benchmarking model performance, generating cost reports, and validating configuration files from the terminal.

## Installation

```bash
npm install -g @reaatech/llm-router-cli
# or
pnpm add -g @reaatech/llm-router-cli
```

## Feature Overview

- **Route** — send a prompt through the router with full strategy selection, cost estimation, and execution
- **Benchmark** — run a prompt against one or more models with multiple runs, reporting latency and cost stats
- **Cost report** — generate daily, weekly, or monthly cost summaries per budget
- **Config validation** — validate a YAML/JSON router configuration file against the `RouterConfigSchema`

## Quick Start

```bash
# Route a single request
llm-router route \
  --config llm-router.config.yaml \
  --strategy cost-optimized \
  --prompt "Review this TypeScript module for bugs."

# Benchmark two models with 3 runs each
llm-router benchmark \
  --config llm-router.config.yaml \
  --models "glm-edge,kat-coder-pro" \
  --prompt "Write a function to reverse a linked list." \
  --runs 3

# Generate a cost report
llm-router cost-report \
  --config llm-router.config.yaml \
  --period today \
  --budgetId default

# Validate a config file
llm-router validate-config --config llm-router.config.yaml
```

## Commands

### `route`

Route a prompt through the router and display the decision, cost, and result.

```bash
llm-router route [options]
```

| Option | Type | Description |
|--------|------|-------------|
| `--config <path>` | `string` | Path to the router config file |
| `--prompt <text>` | `string` | The prompt to route |
| `--strategy <name>` | `string` | Strategy to use |
| `--user-tier <tier>` | `string` | User tier: `free`, `standard`, or `premium` |
| `--max-tokens <n>` | `number` | Maximum output tokens |
| `--capabilities <list>` | `string` | Comma-separated required capabilities |
| `--budget-id <id>` | `string` | Budget to charge this request against |

**Sample output:**

```
Routing Decision
  Model: glm-edge (zhipu)
  Strategy: cost-optimized
  Confidence: 0.95
  Estimated Cost: $0.0005

Execution Result
  Actual Cost: $0.0004
  Latency: 42ms
  Input Tokens: 120
  Output Tokens: 85
  Content: ...
```

### `benchmark`

Benchmark one or more models against a prompt with multiple runs.

```bash
llm-router benchmark [options]
```

| Option | Type | Description |
|--------|------|-------------|
| `--config <path>` | `string` | Path to the router config file |
| `--models <list>` | `string` | Comma-separated model IDs to benchmark |
| `--prompt <text>` | `string` | The prompt to benchmark |
| `--runs <n>` | `number` | Number of runs per model (default: 3) |
| `--strategy <name>` | `string` | Strategy to use for routing |

**Sample output:**

```
Benchmarking 2 models with 3 runs each

kat-coder-pro (3 runs)
  Avg Latency: 234ms  |  P50: 220ms  |  P95: 280ms
  Avg Cost: $0.0012

glm-edge (3 runs)
  Avg Latency: 45ms  |  P50: 42ms  |  P95: 52ms
  Avg Cost: $0.0004
```

### `cost-report`

Generate a cost report for a budget within a time period.

```bash
llm-router cost-report [options]
```

| Option | Type | Description |
|--------|------|-------------|
| `--config <path>` | `string` | Path to the router config file |
| `--period <period>` | `string` | Time period: `today`, `week`, or `month` (default: `today`) |
| `--budgetId <id>` | `string` | Budget to report on |

**Sample output:**

```
Cost Report
  Budget: default
  Period: today
  Total Cost: $0.0123
  Total Requests: 8
  Remaining Budget: $4.9877

By Model
  glm-edge: $0.0032 (3 requests)
  kat-coder-pro: $0.0091 (5 requests)
```

### `validate-config`

Validate a YAML/JSON router configuration file.

```bash
llm-router validate-config [options]
```

| Option | Type | Description |
|--------|------|-------------|
| `--config <path>` | `string` | Path to the config file to validate |

**Sample output:**

```
Configuration is valid
```

On invalid configs, validation errors are printed with the specific field and reason.

## Related Packages

- [`@reaatech/llm-router-engine`](https://www.npmjs.com/package/@reaatech/llm-router-engine) — Main routing engine
- [`@reaatech/llm-router-core`](https://www.npmjs.com/package/@reaatech/llm-router-core) — Shared types and schemas

## License

[MIT](https://github.com/reaatech/llm-router/blob/main/LICENSE)
