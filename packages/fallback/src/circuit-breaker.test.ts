import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from "./circuit-breaker.js";

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and can be reset', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      halfOpenMaxCalls: 1,
    });

    breaker.onFailure('one');
    expect(breaker.getState()).toBe('CLOSED');

    breaker.onFailure('two');
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.canExecute()).toBe(false);

    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');
  });
});
