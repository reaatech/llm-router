/**
 * Capability-Based Strategy - Routes based on required capabilities
 */

import type {
  ModelDefinition,
  RoutingRequest,
  RoutingContext,
  ModelCapability,
} from "@reaatech/llm-router-core";
import { BaseRoutingStrategy } from './strategy.interface.js';
import type { StrategySelectionResult } from './strategy.interface.js';

/** Configuration for capability-based strategy */
export interface CapabilityBasedConfig {
  /** Preferred models for each capability */
  preferredModels: Partial<Record<ModelCapability, string[]>>;
  /** Preferred models regardless of capability */
  preferredModelIds?: string[];
  /** Default model if no capability match */
  defaultModel?: string;
}

/**
 * Capability-Based Routing Strategy
 *
 * Routes requests to models based on required capabilities. This strategy
 * matches model strengths to task types, ensuring the selected model has
 * the specific capabilities needed for the request.
 */
export class CapabilityBasedStrategy extends BaseRoutingStrategy {
  readonly name = 'capability-based';
  readonly priority = 4;

  private config: CapabilityBasedConfig;

  constructor(config: Partial<CapabilityBasedConfig> = {}) {
    super(4);
    this.config = {
      preferredModels: config.preferredModels ?? {},
      preferredModelIds: config.preferredModelIds ?? [],
      defaultModel: config.defaultModel,
    };
  }

  applies(request: RoutingRequest, _context: RoutingContext): boolean {
    // Apply if request has required capabilities or strategy is explicitly set
    return (
      (request.requiredCapabilities && request.requiredCapabilities.length > 0) ||
      request.strategy === this.name
    );
  }

  select(
    request: RoutingRequest,
    _context: RoutingContext,
    availableModels: ModelDefinition[],
  ): StrategySelectionResult | null {
    const requiredCaps = request.requiredCapabilities ?? [];

    // Filter by required capabilities
    let candidates = availableModels.filter((m) => m.enabled !== false);

    if (requiredCaps.length > 0) {
      candidates = this.filterByCapabilities(candidates, requiredCaps);
    }

    // Filter by token limit
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      candidates = this.filterByTokenLimit(candidates, request.maxTokens);
    }

    if (candidates.length === 0) {
      // Try to find the default model
      if (this.config.defaultModel !== undefined && this.config.defaultModel.length > 0) {
        const defaultModel = availableModels.find(
          (m) => m.id === this.config.defaultModel && m.enabled !== false,
        );
        if (defaultModel) {
          return this.createSelectionResult(
            defaultModel,
            0.5,
            `Fallback to default model (no model with capabilities: ${requiredCaps.join(', ')})`,
            [],
          );
        }
      }
      return null;
    }

    // Score candidates based on capability match and preferences
    const scoredCandidates = candidates.map((model) => ({
      model,
      score: this.scoreModel(model, requiredCaps),
    }));

    // Sort by score (higher is better)
    scoredCandidates.sort((a, b) => b.score - a.score);

    const selected = scoredCandidates[0].model;
    const score = scoredCandidates[0].score;

    return this.createSelectionResult(
      selected,
      Math.min(score / 100, 1), // Normalize confidence to 0-1
      `Best capability match (score: ${score})`,
      scoredCandidates.slice(1, 4).map((c) => c.model),
    );
  }

  /**
   * Score a model based on capability match and preferences
   */
  private scoreModel(model: ModelDefinition, requiredCaps: ModelCapability[]): number {
    let score = 0;

    // Base score for having required capabilities
    const matchedCaps = model.capabilities.filter((cap) => requiredCaps.includes(cap));
    score += matchedCaps.length * 20; // 20 points per matched capability

    // Bonus for having extra relevant capabilities
    const extraCaps = model.capabilities.filter((cap) => !requiredCaps.includes(cap));
    score += extraCaps.length * 5; // 5 points per extra capability

    // Check if model is in preferred list for any required capability
    for (const cap of requiredCaps) {
      const preferred = this.config.preferredModels[cap];
      if (preferred && preferred.includes(model.id)) {
        score += 15; // Bonus for being preferred
      }
    }

    if (
      this.config.preferredModelIds !== undefined &&
      this.config.preferredModelIds.includes(model.id)
    ) {
      score += 10;
    }

    // Prefer models with more specific capabilities
    if (requiredCaps.includes('code') && model.capabilities.includes('code')) {
      score += 10;
    }
    if (
      requiredCaps.includes('complex-reasoning') &&
      model.capabilities.includes('complex-reasoning')
    ) {
      score += 10;
    }
    if (requiredCaps.includes('evaluation') && model.capabilities.includes('evaluation')) {
      score += 10;
    }

    // Small penalty for cost (prefer cheaper models when capabilities are equal)
    const costFactor = 1 - (model.costPerMillionInput + model.costPerMillionOutput) / 100;
    score += costFactor * 5;

    return score;
  }

  getConfig(): Record<string, unknown> {
    return {
      preferredModels: this.config.preferredModels,
      preferredModelIds: this.config.preferredModelIds,
      defaultModel: this.config.defaultModel,
    };
  }

  /**
   * Update strategy configuration
   */
  updateConfig(config: Partial<CapabilityBasedConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add a preferred model for a capability
   */
  addPreferredModel(capability: ModelCapability, modelId: string): void {
    if (!this.config.preferredModels[capability]) {
      this.config.preferredModels[capability] = [];
    }
    if (!this.config.preferredModels[capability].includes(modelId)) {
      this.config.preferredModels[capability].push(modelId);
    }
  }

  /**
   * Remove a preferred model for a capability
   */
  removePreferredModel(capability: ModelCapability, modelId: string): void {
    const preferred = this.config.preferredModels[capability];
    if (preferred) {
      this.config.preferredModels[capability] = preferred.filter((id) => id !== modelId);
    }
  }
}
