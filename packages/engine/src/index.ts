/**
 * llm-router - Cost-aware, multi-model LLM routing
 *
 * @packageDocumentation
 */

// Types
export * from '@reaatech/llm-router-core';
// Fallback
export * from '@reaatech/llm-router-fallback';
export type {
  CapabilityBasedConfig,
  ComplexityIndicators,
  CostOptimizedConfig,
  JudgmentBasedConfig,
  LatencyOptimizedConfig,
  OrchestratorConfig,
  StrategyEvaluationResult,
  StrategySelectionResult,
} from '@reaatech/llm-router-strategies';
// Strategies (explicit exports to avoid duplicate RoutingStrategy)
export {
  BaseRoutingStrategy,
  CapabilityBasedStrategy,
  CostOptimizedStrategy,
  JudgmentBasedStrategy,
  LatencyOptimizedStrategy,
  StrategyOrchestrator,
} from '@reaatech/llm-router-strategies';
// Telemetry
export * from '@reaatech/llm-router-telemetry';
export {
  MetricsCollector,
  type MetricsConfig,
  metricsCollector,
} from '@reaatech/llm-router-telemetry';
export {
  type ABTestConfig,
  ABTestManager,
  type ABTestStats,
  abTestManager,
} from './eval/ab-testing.js';
export {
  EvalHooksManager,
  evalHooksManager,
  type HookContext,
  type PostExecutionHook,
  type PostRoutingHook,
  type PreRoutingHook,
} from './eval/eval-hooks.js';
export {
  type ModelPerformance,
  PerformanceTracker,
  performanceTracker,
} from './eval/performance-tracker.js';
// Eval (exclude QualityScore to avoid conflict with types)
export {
  createQualityScorerWithFeedback,
  createRuleBasedScorer,
  type HumanFeedback,
  HumanFeedbackStore,
  humanFeedbackStore,
  QualityScorer,
  qualityScorer,
  type ScorerFunction,
  type ScoringCriteria,
} from './eval/quality-scorer.js';
export {
  type CostTrend,
  type CostTrendEntry,
  type DashboardSnapshot,
  type ModelHealthStatus,
  ObservabilityDashboard,
  type RoutingStats,
  type TrendWindowConfig,
} from './observability/dashboard.js';
// Observability (exclude QualityScore to avoid conflict with types)
export {
  childLogger,
  containsPII,
  createLogger,
  type LogContext,
  type LoggerConfig,
  logger,
  redactPIIPatterns,
  redactSensitiveFields,
} from './observability/logger.js';
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
} from './observability/tracing.js';
// Registry
export * from './registry/index.js';
export type { RouterOptions, RouterRouteSummary } from './router.js';
// Router core
export { createRouter, LLMRouter } from './router.js';

// Utilities
export * from './utils/index.js';
