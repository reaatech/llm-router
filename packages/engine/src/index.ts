/**
 * llm-router - Cost-aware, multi-model LLM routing
 *
 * @packageDocumentation
 */

// Types
export * from '@reaatech/llm-router-core';

// Registry
export * from './registry/index.js';

// Router core
export { LLMRouter, createRouter } from './router.js';
export type { RouterOptions, RouterRouteSummary } from './router.js';

// Strategies (explicit exports to avoid duplicate RoutingStrategy)
export {
  BaseRoutingStrategy,
  CostOptimizedStrategy,
  LatencyOptimizedStrategy,
  JudgmentBasedStrategy,
  CapabilityBasedStrategy,
  StrategyOrchestrator,
} from '@reaatech/llm-router-strategies';
export type {
  StrategySelectionResult,
  CostOptimizedConfig,
  LatencyOptimizedConfig,
  JudgmentBasedConfig,
  CapabilityBasedConfig,
  ComplexityIndicators,
  StrategyEvaluationResult,
  OrchestratorConfig,
} from '@reaatech/llm-router-strategies';

// Fallback
export * from '@reaatech/llm-router-fallback';

// Telemetry
export * from '@reaatech/llm-router-telemetry';

// Observability (exclude QualityScore to avoid conflict with types)
export {
  createLogger,
  childLogger,
  redactSensitiveFields,
  redactPIIPatterns,
  containsPII,
  logger,
  type LoggerConfig,
  type LogContext,
} from './observability/logger.js';

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
} from './observability/tracing.js';

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
} from './observability/dashboard.js';

// Eval (exclude QualityScore to avoid conflict with types)
export {
  QualityScorer,
  qualityScorer,
  humanFeedbackStore,
  createRuleBasedScorer,
  createQualityScorerWithFeedback,
  HumanFeedbackStore,
  type ScoringCriteria,
  type ScorerFunction,
  type HumanFeedback,
} from './eval/quality-scorer.js';

export {
  ABTestManager,
  abTestManager,
  type ABTestConfig,
  type ABTestStats,
} from './eval/ab-testing.js';

export {
  PerformanceTracker,
  performanceTracker,
  type ModelPerformance,
} from './eval/performance-tracker.js';

export {
  EvalHooksManager,
  evalHooksManager,
  type HookContext,
  type PreRoutingHook,
  type PostRoutingHook,
  type PostExecutionHook,
} from './eval/eval-hooks.js';

// Utilities
export * from './utils/index.js';
