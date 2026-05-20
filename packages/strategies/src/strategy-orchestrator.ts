/**
 * Strategy Orchestrator - Coordinates multiple routing strategies
 */

import type {
  ModelDefinition,
  RoutingContext,
  RoutingRequest,
  StrategyConfigInput,
} from '@reaatech/llm-router-core';
import { CapabilityBasedStrategy } from './capability-based.strategy.js';
import { CostOptimizedStrategy } from './cost-optimized.strategy.js';
import { JudgmentBasedStrategy } from './judgment-based.strategy.js';
import { LatencyOptimizedStrategy } from './latency-optimized.strategy.js';
import type { RoutingStrategy, StrategySelectionResult } from './strategy.interface.js';

/** Result of strategy evaluation */
export interface StrategyEvaluationResult {
  /** Selected model */
  model: ModelDefinition;
  /** Strategy that made the selection */
  strategy: RoutingStrategy;
  /** Selection result from the strategy */
  selectionResult: StrategySelectionResult;
  /** Strategies that were evaluated but didn't apply */
  skippedStrategies: string[];
}

/** Configuration for strategy orchestrator */
export interface OrchestratorConfig {
  /** Whether to log strategy evaluation details */
  debugMode: boolean;
  /** Maximum number of strategies to evaluate */
  maxStrategiesToEvaluate: number;
}

/**
 * Strategy Orchestrator
 *
 * Evaluates routing strategies in priority order and selects the first
 * strategy that applies to a request. This enables pluggable routing
 * where new strategies can be added without modifying existing ones.
 */
export class StrategyOrchestrator {
  private strategies: RoutingStrategy[] = [];
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = {
      debugMode: config.debugMode ?? false,
      maxStrategiesToEvaluate: config.maxStrategiesToEvaluate ?? 10,
    };
  }

  /**
   * Register a routing strategy
   */
  register(strategy: RoutingStrategy): void {
    this.strategies.push(strategy);
    // Keep strategies sorted by priority
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Unregister a strategy by name
   */
  unregister(name: string): boolean {
    const index = this.strategies.findIndex((s) => s.name === name);
    if (index !== -1) {
      this.strategies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get a strategy by name
   */
  get(name: string): RoutingStrategy | undefined {
    return this.strategies.find((s) => s.name === name);
  }

  /**
   * Get all registered strategies
   */
  getAll(): RoutingStrategy[] {
    return [...this.strategies];
  }

  /**
   * Evaluate strategies and select the best model
   *
   * Strategies are evaluated in priority order. The first strategy that
   * applies to the request is used to select a model.
   * If an explicitly requested strategy cannot select a model, other
   * applicable strategies are tried as fallback.
   */
  evaluate(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategyEvaluationResult | null {
    const skippedStrategies: string[] = [];
    const explicitlyRequested = request.strategy !== undefined && request.strategy.length > 0;
    let requestedStrategyFailed = false;

    // If request specifies a strategy, try that first
    if (explicitlyRequested) {
      const specifiedStrategy = this.strategies.find((s) => s.name === request.strategy);
      if (specifiedStrategy) {
        const result = specifiedStrategy.select(request, context, availableModels);
        if (result) {
          return {
            model: result.model,
            strategy: specifiedStrategy,
            selectionResult: result,
            skippedStrategies: [],
          };
        }
        // Specified strategy couldn't select - mark for fallback
        requestedStrategyFailed = true;
      }
    }

    // Evaluate strategies in priority order
    const strategiesToEvaluate = this.strategies.slice(0, this.config.maxStrategiesToEvaluate);

    for (const strategy of strategiesToEvaluate) {
      // Skip the explicitly requested strategy since it already failed
      if (explicitlyRequested && strategy.name === request.strategy) {
        continue;
      }

      // Check if strategy applies
      if (!strategy.applies(request, context)) {
        skippedStrategies.push(strategy.name);
        continue;
      }

      // Try to select a model
      const result = strategy.select(request, context, availableModels);
      if (result) {
        let skipped: string[] = skippedStrategies;
        if (
          requestedStrategyFailed &&
          request.strategy !== undefined &&
          request.strategy.length > 0
        ) {
          skipped = [...skippedStrategies, request.strategy];
        }
        return {
          model: result.model,
          strategy,
          selectionResult: result,
          skippedStrategies: skipped,
        };
      }

      skippedStrategies.push(strategy.name);
    }

    // If we had a requested strategy that failed and no other strategy succeeded,
    // try the requested strategy again even if it didn't apply (last resort)
    if (requestedStrategyFailed) {
      const specifiedStrategy = this.strategies.find((s) => s.name === request.strategy);
      if (specifiedStrategy) {
        const result = specifiedStrategy.select(request, context, availableModels);
        if (result) {
          return {
            model: result.model,
            strategy: specifiedStrategy,
            selectionResult: result,
            skippedStrategies,
          };
        }
      }
    }

    // No strategy could select a model
    return null;
  }

  /**
   * Create strategies from configuration
   */
  static fromConfig(
    configs: Record<string, StrategyConfigInput>,
    options: {
      workhorsePool?: string[];
      judgePool?: string[];
    } = {},
  ): StrategyOrchestrator {
    const orchestrator = new StrategyOrchestrator();

    for (const [_name, config] of Object.entries(configs)) {
      let strategy: RoutingStrategy;

      switch (config.type) {
        case 'cost-optimized':
          strategy = new CostOptimizedStrategy({
            workhorsePool: config.workhorsePool ?? options.workhorsePool,
            budgetPerRequest: config.budgetPerRequest,
          });
          break;

        case 'latency-optimized':
          strategy = new LatencyOptimizedStrategy({
            modelPool: config.workhorsePool,
            targetP99Ms: config.targetP99Ms,
            defaultTimeoutMs: config.timeoutMs,
          });
          break;

        case 'judgment-based':
          if (
            !(config.workhorsePool ?? options.workhorsePool) ||
            !(config.judgePool ?? options.judgePool)
          ) {
            throw new Error('judgment-based strategy requires workhorsePool and judgePool');
          }
          strategy = new JudgmentBasedStrategy({
            workhorsePool: config.workhorsePool ?? options.workhorsePool ?? [],
            judgePool: config.judgePool ?? options.judgePool ?? [],
            escalationThreshold: config.escalationThreshold,
            maxJudgeInvocations: config.maxJudgeInvocations,
            consensusRequired: config.consensusRequired,
          });
          break;

        case 'capability-based':
          strategy = new CapabilityBasedStrategy({
            defaultModel: config.preferredModels?.[0],
            preferredModelIds: config.preferredModels,
          });
          break;

        default:
          throw new Error(`Unknown strategy type: ${(config as { type: string }).type}`);
      }

      Object.defineProperty(strategy, 'name', {
        value: _name,
        writable: false,
      });

      // Override priority if specified
      if (config.priority !== undefined) {
        Object.defineProperty(strategy, 'priority', {
          value: config.priority,
          writable: false,
        });
      }

      orchestrator.register(strategy);
    }

    return orchestrator;
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    totalStrategies: number;
    strategies: Array<{
      name: string;
      priority: number;
      applies: 'unknown';
    }>;
  } {
    return {
      totalStrategies: this.strategies.length,
      strategies: this.strategies.map((s) => ({
        name: s.name,
        priority: s.priority,
        applies: 'unknown',
      })),
    };
  }

  /**
   * Clear all strategies
   */
  clear(): void {
    this.strategies = [];
  }
}
