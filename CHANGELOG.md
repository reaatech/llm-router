# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-04-18

### Added

- **Router core** — Strategy orchestration, budget enforcement, fallback support, and execution flow
- **Routing strategies** — Cost-optimized, latency-optimized, judgment-based, and capability-based
- **Model registry** — Multi-provider model definitions with capabilities, pricing, and limits
- **Fallback chains** — Ordered degradation paths with circuit breaker integration
- **Cost telemetry** — Per-request cost tracking, budget management, anomaly detection, and reporting
- **Eval hooks** — Quality scoring, A/B testing, performance tracking, and pre/post-execution hooks
- **MCP server** — Expose router as MCP tools (`route_request`, `get_model_info`, `get_cost_report`)
- **CLI** — Commands for routing, benchmarking, cost reports, and config validation
- **Observability** — Structured logging with PII redaction, OpenTelemetry tracing and metrics, dashboard
- **Config examples** — Workhorse+judge, cost-optimized, and low-latency patterns
- **Skills directory** — Domain-specific guidance for cost routing, latency routing, judgment routing, fallback chains, telemetry, and eval hooks
