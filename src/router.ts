/**
 * Router core for llm-router.
 */

import { randomUUID } from 'node:crypto';
import type {
  BudgetConfig,
  ModelDefinition,
  RoutingContext,
  RoutingDecision,
  RoutingRequest,
  RoutingResult,
} from './types/domain.js';
import { ModelRegistry } from './registry/model-registry.js';
import { StrategyOrchestrator } from './strategies/strategy-orchestrator.js';
import { CostTracker } from './telemetry/cost-tracker.js';
import { BudgetManager } from './telemetry/budget-manager.js';
import { PerformanceTracker } from './eval/performance-tracker.js';
import { EvalHooksManager } from './eval/eval-hooks.js';
import { QualityScorer, createRuleBasedScorer } from './eval/quality-scorer.js';
import { ProviderClientFactory } from './registry/provider-clients.js';
import { FallbackChain } from './fallback/fallback-chain.js';
import type { RouterConfig } from './utils/config-loader.js';
import { parseRouterConfig } from './utils/config-loader.js';
import { CostOptimizedStrategy } from './strategies/cost-optimized.strategy.js';
import { LatencyOptimizedStrategy } from './strategies/latency-optimized.strategy.js';
import { JudgmentBasedStrategy } from './strategies/judgment-based.strategy.js';
import { CapabilityBasedStrategy } from './strategies/capability-based.strategy.js';
import { CostReporter } from './telemetry/cost-reporter.js';

interface ExecutionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  finishReason?: string;
}

export interface RouterRouteSummary {
  model: ModelDefinition;
  strategy: string;
  cost: number;
  confidence: number;
  latencyMs: number;
  result: RoutingResult;
}

export interface RouterOptions {
  registry?: ModelRegistry;
  orchestrator?: StrategyOrchestrator;
  costTracker?: CostTracker;
  budgetManager?: BudgetManager;
  performanceTracker?: PerformanceTracker;
  evalHooks?: EvalHooksManager;
  qualityScorer?: QualityScorer;
  providerFactory?: ProviderClientFactory;
  fallbackChains?: FallbackChain[];
  defaultBudgetId?: string;
  responseEvaluator?: boolean;
  executeModel?: (model: ModelDefinition, request: RoutingRequest) => Promise<ExecutionResult>;
}

export class LLMRouter {
  readonly registry: ModelRegistry;
  readonly orchestrator: StrategyOrchestrator;
  readonly costTracker: CostTracker;
  readonly budgetManager: BudgetManager;
  readonly performanceTracker: PerformanceTracker;
  readonly evalHooks: EvalHooksManager;
  readonly qualityScorer: QualityScorer;
  readonly providerFactory: ProviderClientFactory;
  readonly costReporter: CostReporter;
  readonly fallbackChains: Map<string, FallbackChain>;
  readonly defaultBudgetId?: string;
  private readonly responseEvaluator: boolean;
  private readonly executeModelImpl?: RouterOptions['executeModel'];

  constructor(options: RouterOptions = {}) {
    this.registry = options.registry ?? new ModelRegistry();
    this.orchestrator = options.orchestrator ?? new StrategyOrchestrator();
    this.costTracker = options.costTracker ?? new CostTracker();
    this.budgetManager = options.budgetManager ?? new BudgetManager();
    this.performanceTracker = options.performanceTracker ?? new PerformanceTracker();
    this.evalHooks = options.evalHooks ?? new EvalHooksManager();
    this.qualityScorer = options.qualityScorer ?? new QualityScorer();
    this.providerFactory = options.providerFactory ?? ProviderClientFactory.getInstance();
    this.costReporter = new CostReporter(this.costTracker, this.budgetManager);
    this.fallbackChains = new Map(
      (options.fallbackChains ?? []).map((chain) => [chain.getName(), chain]),
    );
    this.defaultBudgetId = options.defaultBudgetId;
    this.responseEvaluator = options.responseEvaluator ?? false;
    this.executeModelImpl = options.executeModel;

    if (this.qualityScorer.getScorerNames().length === 0) {
      this.qualityScorer.register('rule-based', createRuleBasedScorer(), true);
    }

    if (this.orchestrator.getAll().length === 0) {
      const workhorsePool = this.registry.getWorkhorses().map((model) => model.id);
      const judgePool = this.registry.getJudges().map((model) => model.id);
      if (workhorsePool.length > 0 && judgePool.length > 0) {
        this.orchestrator.register(
          new JudgmentBasedStrategy({
            workhorsePool,
            judgePool,
          }),
        );
      }
      this.orchestrator.register(new LatencyOptimizedStrategy());
      this.orchestrator.register(new CapabilityBasedStrategy());
      this.orchestrator.register(new CostOptimizedStrategy());
    }
  }

  static fromConfig(
    config: RouterConfig,
    options: Omit<RouterOptions, 'registry' | 'orchestrator' | 'defaultBudgetId'> = {},
  ): LLMRouter {
    const registry = new ModelRegistry();
    registry.registerAll([...config.models.workhorses, ...config.models.judges]);

    const budgetManager = options.budgetManager ?? new BudgetManager();
    budgetManager.registerAll(
      Object.entries(config.budgets).map(([id, budget]) => ({
        ...budget,
        id,
      })),
    );

    const orchestrator = StrategyOrchestrator.fromConfig(config.strategies ?? {}, {
      workhorsePool: config.models.workhorses.map((model) => model.id),
      judgePool: config.models.judges.map((model) => model.id),
    });

    const fallbackChains = config.fallbackChains.map((definition) => {
      const chain = new FallbackChain(definition);
      chain.registerModels(registry.getAll());
      return chain;
    });

    return new LLMRouter({
      ...options,
      registry,
      orchestrator,
      budgetManager,
      fallbackChains,
      defaultBudgetId: config.defaultBudget,
    });
  }

  static fromConfigText(
    raw: string,
    options: Omit<RouterOptions, 'registry' | 'orchestrator' | 'defaultBudgetId'> = {},
  ): LLMRouter {
    return LLMRouter.fromConfig(parseRouterConfig(raw), options);
  }

  getModels(): ModelDefinition[] {
    return this.registry.getAll();
  }

  getBudget(
    budgetId?: string,
  ): { dailyLimit: number; remaining: number; spentToday: number } | null {
    const resolvedBudgetId = budgetId ?? this.defaultBudgetId;
    if (resolvedBudgetId === undefined || resolvedBudgetId.length === 0) {
      return null;
    }

    const config = this.budgetManager.getConfig(resolvedBudgetId);
    const state = this.budgetManager.getState(resolvedBudgetId);
    if (config === undefined || state === undefined) {
      return null;
    }

    return {
      dailyLimit: config.dailyLimit,
      remaining: state.remaining,
      spentToday: state.spentToday,
    };
  }

  getBudgetConfigs(): BudgetConfig[] {
    return Array.from(this.budgetManager.getAllStates().keys())
      .map((id) => this.budgetManager.getConfig(id))
      .filter((value): value is BudgetConfig => Boolean(value));
  }

  async route(request: RoutingRequest): Promise<RouterRouteSummary> {
    const requestId = `req-${randomUUID()}`;
    const hookContext = {
      requestId,
      timestamp: Date.now(),
      metadata: {},
    };

    const effectiveRequest = await this.evalHooks.executePreRouting(request, hookContext);
    const budgetId = effectiveRequest.budgetId ?? this.defaultBudgetId;
    const context = this.createRoutingContext(requestId, budgetId);
    const availableModels = this.registry.getAvailable(context.circuitBreakerStates);

    const evaluation = this.orchestrator.evaluate(effectiveRequest, context, availableModels);
    if (!evaluation) {
      throw new Error('No strategy could select a model for the request');
    }

    const estimatedInputTokens = estimateTokens(effectiveRequest.prompt);
    const estimatedOutputTokens =
      effectiveRequest.maxTokens ?? Math.max(128, Math.ceil(estimatedInputTokens * 0.5));
    const estimatedCost = this.costTracker.calculateCost(
      evaluation.model,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    if (budgetId !== undefined && budgetId.length > 0) {
      const budgetCheck = this.budgetManager.checkBudget(budgetId, estimatedCost);
      if (!budgetCheck.allowed) {
        throw new Error(budgetCheck.reason ?? `Budget '${budgetId}' exceeded`);
      }
    }

    const decision: RoutingDecision = {
      modelId: evaluation.model.id,
      strategy: evaluation.strategy.name,
      estimatedCost,
      estimatedInputTokens,
      estimatedOutputTokens,
      isFallback: false,
      fallbackPosition: 0,
      alternativesConsidered: evaluation.selectionResult.alternatives.map((model) => model.id),
      selectionReason: evaluation.selectionResult.reason,
    };

    await this.evalHooks.executePostRouting(decision, effectiveRequest, hookContext);

    const startedAt = Date.now();
    const execution = await this.executeWithOptionalFallback(effectiveRequest, evaluation.model);
    const latencyMs = Date.now() - startedAt;
    const actualCost = this.costTracker.calculateCost(
      execution.model,
      execution.result.inputTokens,
      execution.result.outputTokens,
    );

    const result: RoutingResult = {
      decision: {
        ...decision,
        modelId: execution.model.id,
        isFallback: execution.isFallback,
        fallbackPosition: execution.position,
      },
      actualCost,
      actualInputTokens: execution.result.inputTokens,
      actualOutputTokens: execution.result.outputTokens,
      latencyMs,
      content: execution.result.content,
      success: true,
      requestId,
      completedAt: new Date(),
    };

    if (budgetId !== undefined && budgetId.length > 0) {
      this.budgetManager.recordSpending(budgetId, actualCost);
    }

    this.costTracker.record({
      requestId,
      modelId: execution.model.id,
      cost: actualCost,
      inputTokens: execution.result.inputTokens,
      outputTokens: execution.result.outputTokens,
      strategy: evaluation.strategy.name,
      budgetId,
    });
    this.performanceTracker.record(execution.model.id, latencyMs, true);

    if (this.responseEvaluator) {
      const score = await this.qualityScorer.score(effectiveRequest, result, execution.model);
      result.qualityScore = score.overall;
      this.performanceTracker.record(execution.model.id, latencyMs, true, score.overall);
    }

    await this.evalHooks.executePostExecution(result, decision, effectiveRequest, hookContext);

    return {
      model: execution.model,
      strategy: evaluation.strategy.name,
      cost: actualCost,
      confidence: evaluation.selectionResult.confidence,
      latencyMs,
      result,
    };
  }

  private createRoutingContext(requestId: string, budgetId?: string): RoutingContext {
    const circuitBreakerStates = new Map<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'>();
    for (const chain of this.fallbackChains.values()) {
      for (const [modelId, state] of chain.getAllCircuitBreakerStates()) {
        circuitBreakerStates.set(modelId, state);
      }
    }

    return {
      timestamp: new Date(),
      requestId,
      budgetId,
      latencyHistory: new Map(
        this.performanceTracker
          .getAllPerformance(this.registry.getAll())
          .map((performance) => [
            performance.modelId,
            performance.latencyP50 || performance.latencyP95 || 0,
          ]),
      ),
      circuitBreakerStates,
      remainingBudget:
        budgetId !== undefined ? this.budgetManager.getRemaining(budgetId) : undefined,
    };
  }

  private async executeWithOptionalFallback(
    request: RoutingRequest,
    selectedModel: ModelDefinition,
  ): Promise<{
    model: ModelDefinition;
    result: ExecutionResult;
    isFallback: boolean;
    position: number;
  }> {
    const fallbackChainName =
      typeof request.metadata?.fallbackChain === 'string'
        ? request.metadata.fallbackChain
        : undefined;
    const chain =
      fallbackChainName !== undefined ? this.fallbackChains.get(fallbackChainName) : undefined;

    if (chain === undefined) {
      return {
        model: selectedModel,
        result: await this.executeModel(selectedModel, request),
        isFallback: false,
        position: 0,
      };
    }

    let executedResult: ExecutionResult | undefined;
    const fallbackResult = await chain.executeFrom(
      selectedModel.id,
      async (model) => {
        executedResult = await this.executeModel(model, request);
        return executedResult;
      },
      this.registry.getAll(),
    );

    return {
      model: fallbackResult.selectedModel,
      result: executedResult ?? (await this.executeModel(fallbackResult.selectedModel, request)),
      isFallback: fallbackResult.isFallback,
      position: fallbackResult.position,
    };
  }

  private async executeModel(
    model: ModelDefinition,
    request: RoutingRequest,
  ): Promise<ExecutionResult> {
    if (this.executeModelImpl) {
      return this.executeModelImpl(model, request);
    }

    const client = this.providerFactory.createClient(model);
    if (client === undefined) {
      throw new Error(
        `No executable provider client is configured for model '${model.id}'. Supply a custom client factory or executeModel callback.`,
      );
    }

    if (client.isStub === true) {
      throw new Error(
        `Model '${model.id}' is backed by a stub provider client. Register a real client factory or provide executeModel.`,
      );
    }

    const response = await client.complete({
      prompt: request.prompt,
      maxTokens: request.maxTokens,
    });
    return {
      content: response.content,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      finishReason: response.finishReason,
    };
  }
}

export function createRouter(options: RouterOptions = {}): LLMRouter {
  return new LLMRouter(options);
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}
