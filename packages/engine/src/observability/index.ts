/**
 * Observability Module - Barrel export for observability components
 */

export {
  MetricsCollector,
  type MetricsConfig,
  metricsCollector,
} from '@reaatech/llm-router-telemetry';
export {
  type CostTrend,
  type CostTrendEntry,
  type DashboardSnapshot,
  type ModelHealthStatus,
  ObservabilityDashboard,
  type RoutingStats,
  type TrendWindowConfig,
} from './dashboard.js';
export {
  childLogger,
  containsPII,
  createLogger,
  type LogContext,
  type LoggerConfig,
  logger,
  redactPIIPatterns,
  redactSensitiveFields,
} from './logger.js';
export {
  endSpan,
  getSpanId,
  getTraceId,
  type RoutingSpanAttributes,
  recordCostCalculation,
  recordFallbackAttempt,
  recordModelExecution,
  recordStrategyEvaluation,
  type StrategyEvalAttributes,
  setupTracing,
  startRoutingSpan,
  type TracingConfig,
} from './tracing.js';
