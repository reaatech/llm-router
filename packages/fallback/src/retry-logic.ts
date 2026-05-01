/**
 * Retry Logic - Exponential backoff with jitter for resilient request handling
 */

/** Stored result for idempotency deduplication */
export interface StoredResult<T> {
  result: T;
  timestamp: Date;
  idempotencyKey: string;
}

/** Configuration for idempotency store */
export interface IdempotencyStoreConfig {
  /** TTL for stored results in milliseconds */
  ttlMs: number;
  /** Maximum number of entries to store */
  maxEntries: number;
}

const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyStoreConfig = {
  ttlMs: 24 * 60 * 60 * 1000,
  maxEntries: 10000,
};

/**
 * Idempotency Store - Caches results keyed by idempotency key
 * to prevent duplicate execution on retries.
 */
export class IdempotencyStore {
  private store: Map<string, StoredResult<unknown>> = new Map();
  private config: IdempotencyStoreConfig;

  constructor(config: Partial<IdempotencyStoreConfig> = {}) {
    this.config = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };
  }

  async get<T>(key: string): Promise<StoredResult<T> | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp.getTime();
    if (age > this.config.ttlMs) {
      this.store.delete(key);
      return null;
    }

    return entry as StoredResult<T>;
  }

  async set<T>(key: string, result: T): Promise<void> {
    // Evict multiple entries to avoid repeated evictions when store is full
    while (this.store.size >= this.config.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.store.delete(oldestKey);
    }

    this.store.set(key, {
      result,
      timestamp: new Date(),
      idempotencyKey: key,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  getSize(): number {
    return this.store.size;
  }

  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now - entry.timestamp.getTime() > this.config.ttlMs) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

/** Configuration for retry behavior */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to add jitter */
  jitter: boolean;
  /** Jitter factor (0-1) */
  jitterFactor: number;
}

/** Default retry configuration */
const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
  jitterFactor: 0.2,
};

/** Context for a retry attempt */
export interface RetryContext {
  /** Current attempt number (0-indexed) */
  attempt: number;
  /** Total number of attempts allowed */
  maxAttempts: number;
  /** Delay before this attempt in milliseconds */
  delayMs: number;
  /** Last error encountered */
  lastError?: Error;
  /** Whether this is a retry (not the first attempt) */
  isRetry: boolean;
}

/** Function to check if an error is retryable */
export type RetryableErrorChecker = (error: Error) => boolean;

/** Default retryable error checker */
const DEFAULT_RETRYABLE_CHECKER: RetryableErrorChecker = (error: Error): boolean => {
  // Network errors, timeouts, and 5xx errors are typically retryable
  const retryableMessages = [
    'network',
    'timeout',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    '5',
  ];

  const message = error.message.toLowerCase();
  return retryableMessages.some((m) => message.includes(m.toLowerCase()));
};

/**
 * Retry Logic implementation
 *
 * Provides exponential backoff with jitter for resilient request handling.
 * Supports idempotency keys and configurable retry conditions.
 */
export class RetryLogic {
  private config: RetryConfig;
  private retryableChecker: RetryableErrorChecker;
  private idempotencyStore: IdempotencyStore | null = null;

  constructor(
    config: Partial<RetryConfig> = {},
    retryableChecker: RetryableErrorChecker = DEFAULT_RETRYABLE_CHECKER,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.retryableChecker = retryableChecker;
  }

  setIdempotencyStore(store: IdempotencyStore): void {
    this.idempotencyStore = store;
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: (context: RetryContext) => Promise<T>, idempotencyKey?: string): Promise<T> {
    if (idempotencyKey !== undefined && idempotencyKey.length > 0 && this.idempotencyStore) {
      const cached = await this.idempotencyStore.get<T>(idempotencyKey);
      if (cached !== null) {
        return cached.result;
      }
    }

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const context: RetryContext = {
        attempt,
        maxAttempts: this.config.maxRetries + 1,
        delayMs: this.calculateDelay(attempt),
        lastError,
        isRetry: attempt > 0,
      };

      try {
        const result = await fn(context);

        if (idempotencyKey !== undefined && idempotencyKey.length > 0 && this.idempotencyStore) {
          await this.idempotencyStore.set(idempotencyKey, result);
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        lastError = err;

        // Check if we should retry
        if (attempt < this.config.maxRetries && this.shouldRetry(err)) {
          // Wait before retrying
          await this.sleep(context.delayMs);
        } else {
          // No more retries or non-retryable error
          throw new RetryExhaustedError(
            `All ${this.config.maxRetries + 1} attempts failed`,
            lastError,
            attempt + 1,
          );
        }
      }
    }

    // Should never reach here, but TypeScript needs it
    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Calculate delay for a given attempt
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff
    let delay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt);

    // Cap at maximum delay
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter if enabled
    if (this.config.jitter) {
      const jitterRange = delay * this.config.jitterFactor;
      delay = delay + (Math.random() * 2 - 1) * jitterRange;
    }

    return Math.max(0, Math.round(delay));
  }

  /**
   * Check if an error should be retried
   */
  private shouldRetry(error: Error): boolean {
    return this.retryableChecker(error);
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Error thrown when all retry attempts have been exhausted
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly cause: Error,
    public readonly attempts: number,
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

/**
 * Generate an idempotency key for a request
 */
export function generateIdempotencyKey(
  modelId: string,
  prompt: string,
  timestamp?: number,
): string {
  const ts = timestamp ?? Date.now();
  const content = `${modelId}:${prompt}:${ts}`;

  // Simple hash (not cryptographically secure, but sufficient for idempotency)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & 0xffffffff; // Convert to 32bit integer
  }

  return `idem-${Math.abs(hash).toString(16)}-${ts}`;
}

/**
 * Create a retry logic instance with default configuration
 */
export function createRetryLogic(config: Partial<RetryConfig> = {}): RetryLogic {
  return new RetryLogic(config);
}

/**
 * Check if an HTTP status code is retryable
 */
export function isRetryableStatusCode(statusCode: number): boolean {
  // 429 (Too Many Requests), 503 (Service Unavailable), 504 (Gateway Timeout)
  const retryableCodes = [429, 503, 504, 502, 500];
  return retryableCodes.includes(statusCode);
}

/**
 * Create a retryable error checker for HTTP errors
 */
export function createHttpRetryableChecker(
  additionalRetryableCodes: number[] = [],
): RetryableErrorChecker {
  return (error: Error): boolean => {
    // Check for status code in error message
    const match = error.message.match(/status[:\s]*(\d{3})/i);
    if (match) {
      const statusCode = parseInt(match[1], 10);
      return isRetryableStatusCode(statusCode) || additionalRetryableCodes.includes(statusCode);
    }

    // Fall back to default checker
    return DEFAULT_RETRYABLE_CHECKER(error);
  };
}
