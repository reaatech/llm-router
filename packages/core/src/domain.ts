/**
 * Core domain types for llm-router
 */

/** Model capabilities that can be required for routing */
export type ModelCapability =
  | 'code'
  | 'reasoning'
  | 'vision'
  | 'long-context'
  | 'analysis'
  | 'general'
  | 'chinese'
  | 'evaluation'
  | 'complex-reasoning'
  | 'creative'
  | 'math'
  | 'summarization'
  | 'translation';

/** Definition of an LLM model with pricing and capabilities */
export interface ModelDefinition {
  /** Unique model identifier */
  id: string;
  /** Provider name (e.g., 'openai', 'anthropic', 'google', 'kuaishou', 'moonshot', 'zhipu') */
  provider: string;
  /** Cost per million input tokens in USD */
  costPerMillionInput: number;
  /** Cost per million output tokens in USD */
  costPerMillionOutput: number;
  /** Maximum tokens supported by this model */
  maxTokens: number;
  /** Capabilities this model supports */
  capabilities: ModelCapability[];
  /** Environment variable name for API key */
  apiKeyEnv?: string;
  /** Whether this model is currently available */
  enabled?: boolean;
  /** Model-specific configuration */
  config?: Record<string, unknown>;
}

/** Context for routing decisions */
export interface RoutingContext {
  /** Current timestamp */
  timestamp: Date;
  /** Request ID for tracing */
  requestId: string;
  /** User/team identifier for budget tracking */
  budgetId?: string;
  /** Historical latency data per model */
  latencyHistory: Map<string, number>;
  /** Circuit breaker states per model */
  circuitBreakerStates: Map<string, CircuitBreakerState>;
  /** Remaining budget for this request */
  remainingBudget?: number;
}

/** Incoming routing request */
export interface RoutingRequest {
  /** The prompt/content to process */
  prompt: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Required model capabilities */
  requiredCapabilities?: ModelCapability[];
  /** Budget identifier for cost tracking */
  budgetId?: string;
  /** Strategy name to use (optional, auto-selected if not provided) */
  strategy?: string;
  /** User tier for priority routing */
  userTier?: 'free' | 'standard' | 'premium';
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Confidence threshold for judgment-based routing */
  confidenceThreshold?: number;
  /** Additional context for routing */
  metadata?: Record<string, unknown>;
}

/** Decision made by the router */
export interface RoutingDecision {
  /** Selected model ID */
  modelId: string;
  /** Strategy used for selection */
  strategy: string;
  /** Estimated cost for this request */
  estimatedCost: number;
  /** Estimated input tokens */
  estimatedInputTokens: number;
  /** Estimated output tokens */
  estimatedOutputTokens: number;
  /** Whether this was a fallback selection */
  isFallback: boolean;
  /** Fallback chain position (0 = primary, 1+ = fallback) */
  fallbackPosition: number;
  /** Alternative models considered */
  alternativesConsidered: string[];
  /** Reason for selection */
  selectionReason: string;
}

/** Result of executing a routing request */
export interface RoutingResult {
  /** The routing decision made */
  decision: RoutingDecision;
  /** Actual cost incurred */
  actualCost: number;
  /** Actual input tokens used */
  actualInputTokens: number;
  /** Actual output tokens generated */
  actualOutputTokens: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Model response content */
  content: string;
  /** Whether the request was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Quality score if eval was performed */
  qualityScore?: number;
  /** Request ID for tracing */
  requestId: string;
  /** Timestamp of completion */
  completedAt: Date;
}

/** Interface for pluggable routing strategies */
export interface RoutingStrategy {
  /** Unique strategy identifier */
  name: string;
  /** Evaluation priority (lower = higher priority) */
  priority: number;
  /** Check if this strategy applies to this request */
  applies(request: RoutingRequest, context: RoutingContext): boolean;
  /** Select the optimal model for this request */
  select(
    request: RoutingRequest,
    context: RoutingContext,
    availableModels: ModelDefinition[],
  ): ModelDefinition | null;
}

/** Fallback chain definition */
export interface FallbackChainDefinition {
  /** Chain name */
  name: string;
  /** Ordered list of model IDs */
  models: string[];
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
}

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  /** Number of failures before opening */
  failureThreshold: number;
  /** Time in ms before attempting recovery */
  resetTimeoutMs: number;
  /** Max calls in half-open state */
  halfOpenMaxCalls: number;
  /** Time in ms for half-open state */
  halfOpenTimeoutMs?: number;
}

/** Circuit breaker states */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Cost telemetry data */
export interface CostTelemetry {
  /** Request ID */
  requestId: string;
  /** Model ID used */
  modelId: string;
  /** Cost in USD */
  cost: number;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Budget ID if applicable */
  budgetId?: string;
  /** Timestamp */
  timestamp: Date;
  /** Strategy used */
  strategy: string;
}

/** Evaluation result */
export interface EvalResult {
  /** Request ID */
  requestId: string;
  /** Model ID evaluated */
  modelId: string;
  /** Quality score (1-5 or 0-1 depending on scale) */
  qualityScore: number;
  /** Evaluation criteria scores */
  criteriaScores?: Record<string, number>;
  /** Evaluator model used */
  evaluatorModel?: string;
  /** Evaluation metadata */
  metadata?: Record<string, unknown>;
  /** Timestamp */
  timestamp: Date;
}

/** Quality score details */
export interface QualityScore {
  /** Overall score (1-5 scale) */
  overall: number;
  /** Relevance score (1-5) */
  relevance?: number;
  /** Correctness score (1-5) */
  correctness?: number;
  /** Completeness score (1-5) */
  completeness?: number;
  /** Clarity score (1-5) */
  clarity?: number;
  /** Additional criteria */
  custom?: Record<string, number>;
  /** Score explanation */
  explanation?: string;
}

/** Budget configuration */
export interface BudgetConfig {
  /** Budget identifier */
  id: string;
  /** Daily limit in USD */
  dailyLimit: number;
  /** Alert thresholds (as fractions of limit) */
  alertThresholds: number[];
  /** Whether to enforce hard limit */
  hardLimit: boolean;
  /** Reset time (cron expression or 'midnight') */
  resetTime?: string;
}

/** Budget state */
export interface BudgetState {
  /** Budget ID */
  budgetId: string;
  /** Amount spent today */
  spentToday: number;
  /** Remaining budget */
  remaining: number;
  /** Whether limit is exceeded */
  limitExceeded: boolean;
  /** Alerts triggered */
  alertsTriggered: number[];
  /** Last reset time */
  lastReset: Date;
}
