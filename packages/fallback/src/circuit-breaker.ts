/**
 * Circuit Breaker - Per-model failure tracking and recovery
 */

import type { CircuitBreakerConfig, CircuitBreakerState } from '@reaatech/llm-router-core';

/** Default circuit breaker configuration */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
  halfOpenTimeoutMs: 60000,
};

/** Circuit breaker event types */
export type CircuitBreakerEvent =
  | { type: 'CLOSED'; timestamp: Date }
  | { type: 'OPEN'; timestamp: Date; failureCount: number }
  | { type: 'HALF_OPEN'; timestamp: Date }
  | { type: 'SUCCESS'; timestamp: Date }
  | { type: 'FAILURE'; timestamp: Date; error?: string };

/**
 * Circuit Breaker implementation
 *
 * Tracks failures per model and prevents requests to unhealthy models.
 * Implements the standard CLOSED -> OPEN -> HALF_OPEN -> CLOSED state machine.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private halfOpenCalls = 0;
  private halfOpenSuccesses = 0;
  private halfOpenStartTime: Date | null = null;
  private config: CircuitBreakerConfig;
  private eventListeners: ((event: CircuitBreakerEvent) => void)[] = [];

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime.getTime();
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
    return this.state;
  }

  /**
   * Check if requests can proceed
   */
  canExecute(): boolean {
    const state = this.getState();
    return state !== 'OPEN';
  }

  /**
   * Record a successful request
   */
  onSuccess(): void {
    const event: CircuitBreakerEvent = {
      type: 'SUCCESS',
      timestamp: new Date(),
    };

    switch (this.state) {
      case 'CLOSED':
        // Reset failure count on success
        this.failureCount = 0;
        break;

      case 'HALF_OPEN':
        this.halfOpenSuccesses++;
        this.halfOpenCalls++;

        // If we've had enough successes in half-open, close the circuit
        if (
          this.halfOpenSuccesses >= this.config.halfOpenMaxCalls ||
          (this.halfOpenStartTime &&
            Date.now() - this.halfOpenStartTime.getTime() >=
              (this.config.halfOpenTimeoutMs ?? this.config.resetTimeoutMs))
        ) {
          this.transitionTo('CLOSED');
        }
        break;

      case 'OPEN':
        // Shouldn't happen, but handle gracefully
        break;
    }

    this.notifyListeners(event);
  }

  /**
   * Record a failed request
   */
  onFailure(error?: string): void {
    const event: CircuitBreakerEvent = {
      type: 'FAILURE',
      timestamp: new Date(),
      error,
    };

    this.lastFailureTime = new Date();

    switch (this.state) {
      case 'CLOSED':
        this.failureCount++;

        // Open the circuit if threshold is reached
        if (this.failureCount >= this.config.failureThreshold) {
          this.transitionTo('OPEN');
        }
        break;

      case 'HALF_OPEN':
        this.halfOpenCalls++;
        // Immediately open on failure in half-open state
        this.transitionTo('OPEN');
        break;

      case 'OPEN':
        // Already open, just update failure time
        break;
    }

    this.notifyListeners(event);
  }

  /**
   * Force the circuit breaker to open
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
  }

  /**
   * Force the circuit breaker to close
   */
  forceClose(): void {
    this.transitionTo('CLOSED');
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
    this.halfOpenSuccesses = 0;
    this.halfOpenStartTime = null;
    this.notifyListeners({ type: 'CLOSED', timestamp: new Date() });
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime: Date | null;
    halfOpenCalls: number;
    halfOpenSuccesses: number;
    config: CircuitBreakerConfig;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenCalls: this.halfOpenCalls,
      halfOpenSuccesses: this.halfOpenSuccesses,
      config: { ...this.config },
    };
  }

  /**
   * Subscribe to circuit breaker events
   */
  onEvent(listener: (event: CircuitBreakerEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const index = this.eventListeners.indexOf(listener);
      if (index !== -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private transitionTo(newState: CircuitBreakerState): void {
    this.state = newState;

    switch (newState) {
      case 'CLOSED':
        this.failureCount = 0;
        this.halfOpenCalls = 0;
        this.halfOpenSuccesses = 0;
        this.halfOpenStartTime = null;
        break;

      case 'OPEN':
        this.lastFailureTime = new Date();
        this.halfOpenCalls = 0;
        this.halfOpenSuccesses = 0;
        break;

      case 'HALF_OPEN':
        this.halfOpenCalls = 0;
        this.halfOpenSuccesses = 0;
        this.halfOpenStartTime = new Date();
        break;
    }

    let event: CircuitBreakerEvent;
    if (newState === 'OPEN') {
      event = {
        type: newState,
        timestamp: new Date(),
        failureCount: this.failureCount,
      };
    } else {
      event = {
        type: newState,
        timestamp: new Date(),
      };
    }
    this.notifyListeners(event);
  }

  private notifyListeners(event: CircuitBreakerEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

/**
 * Create a circuit breaker with default configuration
 */
export function createCircuitBreaker(config: Partial<CircuitBreakerConfig> = {}): CircuitBreaker {
  return new CircuitBreaker(config);
}
