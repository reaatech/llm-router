import type { ModelDefinition } from '@reaatech/llm-router-core';
import { describe, expect, it } from 'vitest';
import { FallbackChain } from './fallback-chain.js';

const models: ModelDefinition[] = [
  {
    id: 'glm-edge',
    provider: 'zhipu',
    costPerMillionInput: 0.3,
    costPerMillionOutput: 0.6,
    maxTokens: 128000,
    capabilities: ['general'],
  },
  {
    id: 'kat-coder-pro',
    provider: 'kuaishou',
    costPerMillionInput: 0.5,
    costPerMillionOutput: 1,
    maxTokens: 32000,
    capabilities: ['code'],
  },
];

describe('FallbackChain', () => {
  it('fails over to the next available model', async () => {
    const chain = new FallbackChain({
      name: 'test-chain',
      models: ['glm-edge', 'kat-coder-pro'],
      circuitBreaker: {
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        halfOpenMaxCalls: 1,
      },
    });

    const result = await chain.execute(async (model) => {
      if (model.id === 'glm-edge') {
        throw new Error('boom');
      }
      return 'ok';
    }, models);

    expect(result.selectedModel.id).toBe('kat-coder-pro');
    expect(result.isFallback).toBe(true);
    expect(result.errors).toHaveLength(1);
  });
});
