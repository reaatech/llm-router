/**
 * Fallback barrel export
 */

// Circuit breaker
export { CircuitBreaker, createCircuitBreaker } from './circuit-breaker.js';
export type { CircuitBreakerEvent } from './circuit-breaker.js';

// Fallback chain
export { FallbackChain, createFallbackChain } from './fallback-chain.js';
export type { FallbackChainResult, ModelExecutor } from './fallback-chain.js';
export { FallbackChainExhaustedError } from './fallback-chain.js';

// Retry logic
export { RetryLogic, createRetryLogic } from './retry-logic.js';
export type { RetryConfig, RetryContext, RetryableErrorChecker } from './retry-logic.js';
export {
  RetryExhaustedError,
  generateIdempotencyKey,
  isRetryableStatusCode,
  createHttpRetryableChecker,
} from './retry-logic.js';
export { IdempotencyStore } from './retry-logic.js';
export type { StoredResult, IdempotencyStoreConfig } from './retry-logic.js';
