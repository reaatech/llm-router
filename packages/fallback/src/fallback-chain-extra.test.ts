import type { ModelDefinition } from '@reaatech/llm-router-core';
import { describe, expect, it } from 'vitest';
import {
  createFallbackChain,
  type FallbackChain,
  FallbackChainExhaustedError,
} from './fallback-chain.js';

const models: ModelDefinition[] = [
  {
    id: 'primary',
    provider: 'openai',
    costPerMillionInput: 1,
    costPerMillionOutput: 2,
    maxTokens: 1000,
    capabilities: ['general'],
  },
  {
    id: 'secondary',
    provider: 'anthropic',
    costPerMillionInput: 2,
    costPerMillionOutput: 4,
    maxTokens: 1000,
    capabilities: ['general'],
  },
];

function createChain(): FallbackChain {
  return createFallbackChain({
    name: 'chain',
    models: ['primary', 'secondary', 'missing'],
    circuitBreaker: {
      failureThreshold: 1,
      resetTimeoutMs: 1000,
      halfOpenMaxCalls: 1,
    },
  });
}

describe('FallbackChain extras', () => {
  it('exposes definitions, primary model, available models, and stats', () => {
    const chain = createChain();
    chain.registerModels(models);

    expect(chain.getName()).toBe('chain');
    expect(chain.getDefinition().models).toEqual(['primary', 'secondary', 'missing']);
    expect(chain.getPrimaryModel(models)?.id).toBe('primary');
    expect(
      chain.getAvailableModels([...models, { ...models[1], id: 'disabled', enabled: false }]),
    ).toHaveLength(2);
    expect(chain.getCircuitBreakerState('primary')).toBe('CLOSED');
    expect(chain.getAllCircuitBreakerStates().size).toBe(3);
    expect(chain.getStats()).toMatchObject({
      chainName: 'chain',
    });
  });

  it('opens breakers on failure, resets them, and throws exhausted errors', async () => {
    const chain = createChain();

    await expect(
      chain.execute(async () => {
        throw new Error('boom');
      }, [models[0]]),
    ).rejects.toBeInstanceOf(FallbackChainExhaustedError);

    expect(chain.getCircuitBreakerState('primary')).toBe('OPEN');
    expect(chain.getAvailableModels(models).map((model) => model.id)).toEqual(['secondary']);

    chain.resetAll();
    expect(chain.getCircuitBreakerState('primary')).toBe('CLOSED');
  });

  it('returns null when no primary model is usable', () => {
    const chain = createFallbackChain({
      name: 'empty',
      models: [],
      circuitBreaker: {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        halfOpenMaxCalls: 1,
      },
    });

    expect(chain.getPrimaryModel(models)).toBeNull();
  });
});
