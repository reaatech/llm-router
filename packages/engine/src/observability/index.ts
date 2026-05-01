/**
 * Observability Module - Barrel export for observability components
 */

export {
  createLogger,
  childLogger,
  redactSensitiveFields,
  redactPIIPatterns,
  containsPII,
  logger,
  type LoggerConfig,
  type LogContext,
} from './logger.js';

export {
  setupTracing,
  startRoutingSpan,
  recordStrategyEvaluation,
  recordModelExecution,
  recordFallbackAttempt,
  recordCostCalculation,
  endSpan,
  getTraceId,
  getSpanId,
  type TracingConfig,
  type RoutingSpanAttributes,
  type StrategyEvalAttributes,
} from './tracing.js';

export {
  MetricsCollector,
  metricsCollector,
  type MetricsConfig,
} from '@reaatech/llm-router-telemetry';

export {
  ObservabilityDashboard,
  type DashboardSnapshot,
  type RoutingStats,
  type CostTrend,
  type CostTrendEntry,
  type ModelHealthStatus,
  type TrendWindowConfig,
} from './dashboard.js';
