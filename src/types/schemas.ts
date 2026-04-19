/**
 * Zod schemas for input validation
 */

import { z } from 'zod';

/** Schema for model capability validation */
export const ModelCapabilitySchema = z.enum([
  'code',
  'reasoning',
  'vision',
  'long-context',
  'analysis',
  'general',
  'chinese',
  'evaluation',
  'complex-reasoning',
  'creative',
  'math',
  'summarization',
  'translation',
]);

/** Schema for model definition validation */
export const ModelDefinitionSchema = z.object({
  id: z.string().min(1, 'Model ID is required'),
  provider: z.string().min(1, 'Provider is required'),
  costPerMillionInput: z.number().nonnegative('Cost must be non-negative'),
  costPerMillionOutput: z.number().nonnegative('Cost must be non-negative'),
  maxTokens: z.number().int().positive('Max tokens must be positive'),
  capabilities: z.array(ModelCapabilitySchema).default([]),
  apiKeyEnv: z.string().optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for routing request validation */
export const RoutingRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  maxTokens: z.number().int().positive().optional(),
  requiredCapabilities: z.array(ModelCapabilitySchema).optional(),
  budgetId: z.string().optional(),
  strategy: z.string().optional(),
  userTier: z.enum(['free', 'standard', 'premium']).optional(),
  timeoutMs: z.number().int().positive().optional(),
  confidenceThreshold: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Schema for routing decision validation */
export const RoutingDecisionSchema = z.object({
  modelId: z.string(),
  strategy: z.string(),
  estimatedCost: z.number().nonnegative(),
  estimatedInputTokens: z.number().int().nonnegative(),
  estimatedOutputTokens: z.number().int().nonnegative(),
  isFallback: z.boolean(),
  fallbackPosition: z.number().int().nonnegative(),
  alternativesConsidered: z.array(z.string()),
  selectionReason: z.string(),
});

/** Schema for routing result validation */
export const RoutingResultSchema = z.object({
  decision: RoutingDecisionSchema,
  actualCost: z.number().nonnegative(),
  actualInputTokens: z.number().int().nonnegative(),
  actualOutputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  content: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
  qualityScore: z.number().optional(),
  requestId: z.string(),
  completedAt: z.date(),
});

/** Schema for circuit breaker configuration */
export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive().default(5),
  resetTimeoutMs: z.number().int().positive().default(60000),
  halfOpenMaxCalls: z.number().int().positive().default(3),
  halfOpenTimeoutMs: z.number().int().positive().optional(),
});

/** Schema for fallback chain definition */
export const FallbackChainSchema = z.object({
  name: z.string().min(1, 'Chain name is required'),
  models: z.array(z.string()).min(1, 'At least one model is required'),
  circuitBreaker: CircuitBreakerConfigSchema.optional(),
});

/** Schema for budget configuration */
export const BudgetConfigSchema = z.object({
  id: z.string().min(1, 'Budget ID is required'),
  dailyLimit: z.number().positive('Daily limit must be positive'),
  alertThresholds: z.array(z.number().min(0).max(1)).default([0.5, 0.75, 0.9]),
  hardLimit: z.boolean().default(true),
  resetTime: z.string().optional(),
});

/** Schema for strategy configuration */
export const StrategyConfigSchema = z.object({
  type: z.enum(['cost-optimized', 'latency-optimized', 'judgment-based', 'capability-based']),
  priority: z.number().int().nonnegative().optional().default(10),
  // Cost-optimized strategy options
  workhorsePool: z.array(z.string()).optional(),
  budgetPerRequest: z.number().positive().optional(),
  // Latency-optimized strategy options
  timeoutMs: z.number().int().positive().optional(),
  targetP99Ms: z.number().int().positive().optional(),
  // Judgment-based strategy options
  judgePool: z.array(z.string()).optional(),
  escalationThreshold: z.number().min(0).max(1).optional(),
  maxJudgeInvocations: z.number().int().positive().optional(),
  consensusRequired: z.boolean().optional(),
  // Capability-based strategy options
  requiredCapabilities: z.array(ModelCapabilitySchema).optional(),
  preferredModels: z.array(z.string()).optional(),
});

/** Schema for the complete router configuration file */
export const RouterConfigSchema = z.object({
  models: z.object({
    workhorses: z.array(ModelDefinitionSchema).optional().default([]),
    judges: z.array(ModelDefinitionSchema).optional().default([]),
  }),
  strategies: z.record(z.string(), StrategyConfigSchema).optional().default({}),
  fallbackChains: z.array(FallbackChainSchema).optional().default([]),
  budgets: z.record(z.string(), BudgetConfigSchema).optional().default({}),
  defaultBudget: z.string().optional(),
  observability: z
    .object({
      enabled: z.boolean().default(true),
      otlpEndpoint: z.string().optional(),
      serviceName: z.string().optional(),
      logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    })
    .optional()
    .default({ enabled: true }),
});

/** Schema for quality score validation */
export const QualityScoreSchema = z.object({
  overall: z.number().min(0).max(5),
  relevance: z.number().min(0).max(5).optional(),
  correctness: z.number().min(0).max(5).optional(),
  completeness: z.number().min(0).max(5).optional(),
  clarity: z.number().min(0).max(5).optional(),
  custom: z.record(z.string(), z.number()).optional(),
});

/** Schema for evaluation result validation */
export const EvalResultSchema = z.object({
  requestId: z.string(),
  modelId: z.string(),
  qualityScore: z.number(),
  criteriaScores: z.record(z.string(), z.number()).optional(),
  evaluatorModel: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.date(),
});

/** Schema for cost telemetry validation */
export const CostTelemetrySchema = z.object({
  requestId: z.string(),
  modelId: z.string(),
  cost: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  budgetId: z.string().optional(),
  timestamp: z.date(),
  strategy: z.string(),
});

// Export type inference helpers
export type ModelDefinitionInput = z.infer<typeof ModelDefinitionSchema>;
export type RoutingRequestInput = z.infer<typeof RoutingRequestSchema>;
export type RouterConfigInput = z.infer<typeof RouterConfigSchema>;
export type StrategyConfigInput = z.infer<typeof StrategyConfigSchema>;
export type FallbackChainInput = z.infer<typeof FallbackChainSchema>;
export type BudgetConfigInput = z.infer<typeof BudgetConfigSchema>;
