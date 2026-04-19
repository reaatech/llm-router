/**
 * Strategies barrel export
 */

// Strategy interface and base class
export { BaseRoutingStrategy } from './strategy.interface.js';
export type { RoutingStrategy, StrategySelectionResult } from './strategy.interface.js';

// Cost-optimized strategy
export { CostOptimizedStrategy } from './cost-optimized.strategy.js';
export type { CostOptimizedConfig } from './cost-optimized.strategy.js';

// Latency-optimized strategy
export { LatencyOptimizedStrategy } from './latency-optimized.strategy.js';
export type { LatencyOptimizedConfig } from './latency-optimized.strategy.js';

// Judgment-based strategy
export { JudgmentBasedStrategy } from './judgment-based.strategy.js';
export type { JudgmentBasedConfig, ComplexityIndicators } from './judgment-based.strategy.js';

// Capability-based strategy
export { CapabilityBasedStrategy } from './capability-based.strategy.js';
export type { CapabilityBasedConfig } from './capability-based.strategy.js';

// Strategy orchestrator
export { StrategyOrchestrator } from './strategy-orchestrator.js';
export type { StrategyEvaluationResult, OrchestratorConfig } from './strategy-orchestrator.js';
