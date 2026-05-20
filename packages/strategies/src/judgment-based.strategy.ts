/**
 * Judgment-Based Strategy - Uses workhorses for routine tasks, escalates to judges for complex ones
 */

import type { ModelDefinition, RoutingContext, RoutingRequest } from '@reaatech/llm-router-core';
import type { StrategySelectionResult } from './strategy.interface.js';
import { BaseRoutingStrategy } from './strategy.interface.js';

/** Configuration for judgment-based strategy */
export interface JudgmentBasedConfig {
  /** Pool of workhorse model IDs for routine tasks */
  workhorsePool: string[];
  /** Pool of judge model IDs for complex tasks */
  judgePool: string[];
  /** Confidence threshold for escalation (0-1) */
  escalationThreshold: number;
  /** Maximum number of judge invocations per request */
  maxJudgeInvocations: number;
  /** Whether consensus from multiple judges is required */
  consensusRequired: boolean;
}

/** Complexity indicators for escalation detection */
export interface ComplexityIndicators {
  /** Prompt length score (0-1) */
  lengthScore: number;
  /** Code complexity score (0-1) */
  codeComplexity: number;
  /** Reasoning depth required (0-1) */
  reasoningDepth: number;
  /** User tier multiplier */
  tierMultiplier: number;
}

/**
 * Judgment-Based Routing Strategy
 *
 * Uses cheap workhorse models for routine tasks and escalates to premium
 * judge models for complex reasoning, debugging, or evaluation tasks.
 * Escalation is triggered when confidence is below threshold.
 */
export class JudgmentBasedStrategy extends BaseRoutingStrategy {
  readonly name = 'judgment-based';
  readonly priority = 2;

  private config: JudgmentBasedConfig;

  constructor(
    config: Omit<
      JudgmentBasedConfig,
      'escalationThreshold' | 'maxJudgeInvocations' | 'consensusRequired'
    > &
      Partial<
        Pick<
          JudgmentBasedConfig,
          'escalationThreshold' | 'maxJudgeInvocations' | 'consensusRequired'
        >
      >,
  ) {
    super(2);
    this.config = {
      workhorsePool: config.workhorsePool,
      judgePool: config.judgePool,
      escalationThreshold: config.escalationThreshold ?? 0.7,
      maxJudgeInvocations: config.maxJudgeInvocations ?? 2,
      consensusRequired: config.consensusRequired ?? false,
    };
  }

  applies(request: RoutingRequest, _context: RoutingContext): boolean {
    // Apply if strategy is explicitly set or if request has confidence threshold
    return request.strategy === this.name || request.confidenceThreshold !== undefined;
  }

  select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null {
    // Get workhorse and judge candidates
    const workhorses = availableModels.filter(
      (m) => m.enabled !== false && this.config.workhorsePool.includes(m.id),
    );
    const judges = availableModels.filter(
      (m) => m.enabled !== false && this.config.judgePool.includes(m.id),
    );

    // Filter by required capabilities
    const requiredCaps = request.requiredCapabilities ?? [];

    const capableWorkhorses =
      requiredCaps.length > 0 ? this.filterByCapabilities(workhorses, requiredCaps) : workhorses;

    // Analyze request complexity
    const complexity = this.analyzeComplexity(request, context);
    const shouldEscalate = this.shouldEscalate(complexity, request);

    if (shouldEscalate && judges.length > 0) {
      // Escalate to judge model
      const capableJudges =
        requiredCaps.length > 0 ? this.filterByCapabilities(judges, requiredCaps) : judges;

      if (capableJudges.length > 0) {
        // Select the best judge (prefer cheaper judges if multiple available)
        const selectedJudge = this.selectBestJudge(capableJudges, request);

        return this.createSelectionResult(
          selectedJudge,
          0.85,
          `Escalated to judge (complexity: ${(complexity.lengthScore + complexity.reasoningDepth) / 2})`,
          capableJudges.slice(1, 3),
        );
      }
    }

    // Use workhorse for routine task
    if (capableWorkhorses.length > 0) {
      // Select cheapest workhorse
      const selectedWorkhorse = this.selectCheapestWorkhorse(capableWorkhorses, request);

      return this.createSelectionResult(
        selectedWorkhorse,
        0.7, // Lower confidence - may need escalation after execution
        `Workhorse selected (routine task, complexity: ${(complexity.lengthScore + complexity.reasoningDepth) / 2})`,
        capableWorkhorses.slice(1, 3),
      );
    }

    // Fallback to any available model
    if (availableModels.length > 0) {
      const fallback = availableModels[0];
      return this.createSelectionResult(
        fallback,
        0.5,
        'Fallback: no workhorse or judge available',
        availableModels.slice(1, 3),
      );
    }

    return null;
  }

  /**
   * Analyze request complexity
   */
  private analyzeComplexity(
    request: RoutingRequest,
    _context: RoutingContext,
  ): ComplexityIndicators {
    const prompt = request.prompt;

    // Length score: longer prompts tend to be more complex
    const lengthScore = Math.min(prompt.length / 2000, 1);

    // Code complexity: check for code-related patterns
    const codePatterns = [
      /function\s+\w+/,
      /class\s+\w+/,
      /interface\s+\w+/,
      /const\s+\w+\s*=\s*\(/,
      /import\s+.*from/,
      /<\w+>/, // JSX/HTML tags
      /{\s*\w+\s*:/, // JSON-like structures
    ];
    const codeMatches = codePatterns.filter((p) => p.test(prompt)).length;
    const codeComplexity = Math.min(codeMatches / codePatterns.length, 1);

    // Reasoning depth: check for reasoning indicators
    const reasoningPatterns = [
      /think\s+step/,
      /reason(ing)?\s+through/,
      /analyze/,
      /compare/,
      /evaluate/,
      /optimize/,
      /debug/,
      /why\s+does/,
      /how\s+does/,
      /explain\s+why/,
    ];
    const reasoningMatches = reasoningPatterns.filter((p) => p.test(prompt)).length;
    const reasoningDepth = Math.min(reasoningMatches / 3, 1);

    // Tier multiplier: premium users get easier escalation to judges
    // (lower multiplier = lower adjusted complexity = easier to escalate)
    // Free users get harder escalation (higher multiplier)
    let tierMultiplier = 1.0;
    if (request.userTier === 'premium') {
      tierMultiplier = 0.7; // Premium users escalate more easily
    } else if (request.userTier === 'free') {
      tierMultiplier = 1.5; // Free users escalate less easily
    }

    return {
      lengthScore,
      codeComplexity,
      reasoningDepth,
      tierMultiplier,
    };
  }

  /**
   * Determine if request should be escalated to a judge
   */
  private shouldEscalate(complexity: ComplexityIndicators, request: RoutingRequest): boolean {
    // Calculate overall complexity score
    const overallComplexity =
      (complexity.lengthScore +
        complexity.codeComplexity * 1.5 + // Code is weighted higher
        complexity.reasoningDepth * 2) / // Reasoning is weighted highest
      4.5;

    // Adjust by user tier
    const adjustedComplexity = overallComplexity * complexity.tierMultiplier;

    // Use custom threshold if provided, otherwise use config threshold
    const threshold = request.confidenceThreshold ?? this.config.escalationThreshold;

    // Escalate if complexity is above threshold
    // (higher complexity = lower confidence in workhorse ability)
    return adjustedComplexity > 1 - threshold;
  }

  /**
   * Select the best judge model
   */
  private selectBestJudge(judges: ModelDefinition[], request: RoutingRequest): ModelDefinition {
    // Sort by cost (prefer cheaper judges) but also consider capabilities
    const sorted = [...judges].sort((a, b) => {
      const costA = a.costPerMillionInput + a.costPerMillionOutput;
      const costB = b.costPerMillionInput + b.costPerMillionOutput;

      // If costs are similar, prefer model with more relevant capabilities
      if (Math.abs(costA - costB) < 5) {
        const capsA = a.capabilities.filter((c) =>
          request.requiredCapabilities?.includes(c),
        ).length;
        const capsB = b.capabilities.filter((c) =>
          request.requiredCapabilities?.includes(c),
        ).length;
        return capsB - capsA;
      }

      return costA - costB;
    });

    return sorted[0];
  }

  /**
   * Select the cheapest workhorse model
   */
  private selectCheapestWorkhorse(
    workhorses: ModelDefinition[],
    _request: RoutingRequest,
  ): ModelDefinition {
    // Sort by cost
    const sorted = [...workhorses].sort((a, b) => {
      const costA = a.costPerMillionInput + a.costPerMillionOutput;
      const costB = b.costPerMillionInput + b.costPerMillionOutput;
      return costA - costB;
    });

    return sorted[0];
  }

  getConfig(): Record<string, unknown> {
    return {
      workhorsePool: this.config.workhorsePool,
      judgePool: this.config.judgePool,
      escalationThreshold: this.config.escalationThreshold,
      maxJudgeInvocations: this.config.maxJudgeInvocations,
      consensusRequired: this.config.consensusRequired,
    };
  }

  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<JudgmentBasedConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
