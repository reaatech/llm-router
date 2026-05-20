/**
 * Configuration loader and normalizer for llm-router.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  BudgetConfig,
  FallbackChainDefinition,
  ModelDefinition,
  RouterConfigInput,
} from '@reaatech/llm-router-core';
import { RouterConfigSchema } from '@reaatech/llm-router-core';
import YAML from 'yaml';

export interface RouterConfig {
  models: {
    workhorses: ModelDefinition[];
    judges: ModelDefinition[];
  };
  strategies: RouterConfigInput['strategies'];
  fallbackChains: FallbackChainDefinition[];
  budgets: Record<string, BudgetConfig>;
  defaultBudget?: string;
  observability: NonNullable<RouterConfigInput['observability']>;
}

export function loadRouterConfig(configPath: string): RouterConfig {
  const absolutePath = path.resolve(configPath);
  const raw = readFileSync(absolutePath, 'utf8');
  return parseRouterConfig(raw, absolutePath);
}

export function parseRouterConfig(raw: string, source = '<inline>'): RouterConfig {
  const parsed = source.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
  const normalized = enrichConfigIds(normalizeConfigShape(parsed));
  const result = RouterConfigSchema.safeParse(normalized);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid router config in ${source}: ${issues}`);
  }

  return {
    models: {
      workhorses: result.data.models.workhorses,
      judges: result.data.models.judges,
    },
    strategies: result.data.strategies,
    fallbackChains: result.data.fallbackChains,
    budgets: result.data.budgets,
    defaultBudget: result.data.defaultBudget,
    observability: result.data.observability ?? { enabled: true, logLevel: 'info' },
  };
}

function normalizeConfigShape(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(normalizeConfigShape);
  }

  if (input === null || input === undefined || typeof input !== 'object') {
    return input;
  }

  const normalized: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input)) {
    const key = normalizeKey(rawKey);
    normalized[key] = normalizeConfigShape(value);
  }
  return normalized;
}

function normalizeKey(key: string): string {
  const aliases: Record<string, string> = {
    cost_per_million_input: 'costPerMillionInput',
    cost_per_million_output: 'costPerMillionOutput',
    max_tokens: 'maxTokens',
    api_key_env: 'apiKeyEnv',
    fallback_chains: 'fallbackChains',
    default_budget: 'defaultBudget',
    daily_limit: 'dailyLimit',
    alert_thresholds: 'alertThresholds',
    hard_limit: 'hardLimit',
    reset_time: 'resetTime',
    workhorse_pool: 'workhorsePool',
    budget_per_request: 'budgetPerRequest',
    timeout_ms: 'timeoutMs',
    target_p99_ms: 'targetP99Ms',
    judge_pool: 'judgePool',
    escalation_threshold: 'escalationThreshold',
    max_judge_invocations: 'maxJudgeInvocations',
    consensus_required: 'consensusRequired',
    preferred_models: 'preferredModels',
    required_capabilities: 'requiredCapabilities',
    circuit_breaker: 'circuitBreaker',
    failure_threshold: 'failureThreshold',
    reset_timeout_ms: 'resetTimeoutMs',
    half_open_max_calls: 'halfOpenMaxCalls',
    half_open_timeout_ms: 'halfOpenTimeoutMs',
    otlp_endpoint: 'otlpEndpoint',
    service_name: 'serviceName',
    log_level: 'logLevel',
  };

  return aliases[key] ?? key;
}

function enrichConfigIds(input: unknown): unknown {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  const config = input as Record<string, unknown>;
  const budgets = config.budgets;
  if (
    budgets !== undefined &&
    budgets !== null &&
    typeof budgets === 'object' &&
    !Array.isArray(budgets)
  ) {
    config.budgets = Object.fromEntries(
      Object.entries(budgets).map(([budgetId, value]) => [
        budgetId,
        value !== null && value !== undefined && typeof value === 'object'
          ? { ...(value as Record<string, unknown>), id: budgetId }
          : value,
      ]),
    );
  }

  return config;
}
