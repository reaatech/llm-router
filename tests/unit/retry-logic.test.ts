import { describe, expect, it } from 'vitest';
import {
  RetryLogic,
  RetryExhaustedError,
  generateIdempotencyKey,
  isRetryableStatusCode,
  IdempotencyStore,
} from '../../src/fallback/retry-logic.js';

describe('RetryLogic', () => {
  it('retries until success', async () => {
    const logic = new RetryLogic({
      maxRetries: 2,
      initialDelayMs: 1,
      maxDelayMs: 1,
      jitter: false,
    });
    let attempts = 0;

    const result = await logic.execute(async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error('timeout');
      }
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('throws RetryExhaustedError when retries are exhausted', async () => {
    const logic = new RetryLogic({
      maxRetries: 1,
      initialDelayMs: 1,
      maxDelayMs: 1,
      jitter: false,
    });

    await expect(
      logic.execute(async () => {
        throw new Error('timeout');
      }),
    ).rejects.toBeInstanceOf(RetryExhaustedError);
  });

  it('supports retry helpers', () => {
    expect(generateIdempotencyKey('model', 'prompt', 123)).toContain('idem-');
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(400)).toBe(false);
  });
});

describe('IdempotencyStore', () => {
  it('stores and retrieves results by key', async () => {
    const store = new IdempotencyStore();
    await store.set('key-1', { value: 42 });
    const result = await store.get<{ value: number }>('key-1');
    expect(result).not.toBeNull();
    expect(result!.result.value).toBe(42);
  });

  it('returns null for missing keys', async () => {
    const store = new IdempotencyStore();
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('deletes entries', async () => {
    const store = new IdempotencyStore();
    await store.set('key-1', 'value');
    expect(await store.delete('key-1')).toBe(true);
    expect(await store.get('key-1')).toBeNull();
  });

  it('clears all entries', async () => {
    const store = new IdempotencyStore();
    await store.set('key-1', 'a');
    await store.set('key-2', 'b');
    store.clear();
    expect(store.getSize()).toBe(0);
  });

  it('prunes expired entries', async () => {
    const store = new IdempotencyStore({ ttlMs: 1 });
    await store.set('key-1', 'value');
    await new Promise((r) => setTimeout(r, 5));
    const pruned = store.pruneExpired();
    expect(pruned).toBe(1);
    expect(store.getSize()).toBe(0);
  });

  it('respects maxEntries limit', async () => {
    const store = new IdempotencyStore({ maxEntries: 3 });
    await store.set('key-1', 'a');
    await store.set('key-2', 'b');
    await store.set('key-3', 'c');
    await store.set('key-4', 'd');
    expect(store.getSize()).toBe(3);
  });
});

describe('RetryLogic with IdempotencyStore', () => {
  it('returns cached result on retry with same idempotency key', async () => {
    const store = new IdempotencyStore();
    const logic = new RetryLogic({
      maxRetries: 2,
      initialDelayMs: 1,
      maxDelayMs: 1,
      jitter: false,
    });
    logic.setIdempotencyStore(store);

    let callCount = 0;
    const result1 = await logic.execute(async () => {
      callCount++;
      return 'first-result';
    }, 'idem-key-1');

    expect(callCount).toBe(1);
    expect(result1).toBe('first-result');

    const result2 = await logic.execute(async () => {
      callCount++;
      return 'second-result';
    }, 'idem-key-1');

    expect(callCount).toBe(1);
    expect(result2).toBe('first-result');
  });

  it('executes function when idempotency key is not cached', async () => {
    const store = new IdempotencyStore();
    const logic = new RetryLogic({
      maxRetries: 0,
      initialDelayMs: 1,
      maxDelayMs: 1,
      jitter: false,
    });
    logic.setIdempotencyStore(store);

    let callCount = 0;
    await logic.execute(async () => {
      callCount++;
      return 'result';
    }, 'new-key');

    expect(callCount).toBe(1);
    const cached = await store.get('new-key');
    expect(cached).not.toBeNull();
    expect(cached!.result).toBe('result');
  });
});
