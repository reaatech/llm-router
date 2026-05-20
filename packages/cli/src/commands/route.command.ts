/**
 * Route command - route a single request to the optimal model.
 */

import type { ModelCapability, RoutingRequest } from '@reaatech/llm-router-core';
import { LLMRouter, loadRouterConfig } from '@reaatech/llm-router-engine';
import { writeError, writeLine } from '../output.js';

const VALID_CAPABILITIES = [
  'code',
  'reasoning',
  'vision',
  'analysis',
  'long-context',
  'general',
  'chinese',
  'evaluation',
  'complex-reasoning',
] as const;
type ValidCapability = (typeof VALID_CAPABILITIES)[number];

const VALID_USER_TIERS = ['free', 'standard', 'premium'] as const;
type ValidUserTier = (typeof VALID_USER_TIERS)[number];

interface RouteOptions {
  prompt: string;
  strategy: string;
  maxTokens?: number;
  budgetId?: string;
  capabilities?: string;
  userTier: string;
  config: string;
}

function validateCapability(value: string): ModelCapability {
  const trimmed = value.trim() as ValidCapability;
  if (VALID_CAPABILITIES.includes(trimmed)) {
    return trimmed as unknown as ModelCapability;
  }
  throw new Error(`Invalid capability '${value}'. Valid: ${VALID_CAPABILITIES.join(', ')}`);
}

function validateUserTier(value: string): ValidUserTier {
  const tier = value as ValidUserTier;
  if (VALID_USER_TIERS.includes(tier)) {
    return tier;
  }
  throw new Error(`Invalid user tier '${value}'. Valid: ${VALID_USER_TIERS.join(', ')}`);
}

export async function routeCommand(options: RouteOptions): Promise<void> {
  try {
    const config = loadRouterConfig(options.config);
    const router = LLMRouter.fromConfig(config);

    const requiredCapabilities =
      options.capabilities !== undefined && options.capabilities.length > 0
        ? options.capabilities.split(',').map(validateCapability)
        : undefined;

    const request: RoutingRequest = {
      prompt: options.prompt,
      strategy: options.strategy,
      maxTokens:
        options.maxTokens !== undefined && options.maxTokens > 0
          ? Number(options.maxTokens)
          : undefined,
      budgetId: options.budgetId,
      requiredCapabilities,
      userTier: validateUserTier(options.userTier),
    };

    const routed = await router.route(request);
    const { model, result } = routed;

    writeLine('Routing Decision');
    writeLine(`Model: ${model.id}`);
    writeLine(`Provider: ${model.provider}`);
    writeLine(`Strategy: ${routed.strategy}`);
    writeLine(`Estimated cost: $${result.decision.estimatedCost.toFixed(6)}`);
    writeLine(`Actual cost: $${routed.cost.toFixed(6)}`);
    writeLine(`Latency: ${routed.latencyMs}ms`);
    writeLine(`Confidence: ${(routed.confidence * 100).toFixed(1)}%`);
    writeLine(`Reason: ${result.decision.selectionReason}`);
  } catch (error) {
    writeError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
