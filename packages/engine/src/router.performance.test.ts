import { performance } from 'node:perf_hooks';
import { StrategyOrchestrator } from '@reaatech/llm-router-strategies';
import { CostOptimizedStrategy } from '@reaatech/llm-router-strategies';
import { describe, expect, it } from 'vitest';
import { ModelRegistry } from './registry/model-registry.js';
import { createRouter } from './router.js';

describe('router performance smoke', () => {
  it('makes a routing decision quickly in-memory', async () => {
    const registry = new ModelRegistry();
    registry.register({
      id: 'fast',
      provider: 'zhipu',
      costPerMillionInput: 0.1,
      costPerMillionOutput: 0.2,
      maxTokens: 2048,
      capabilities: ['general'],
    });

    const orchestrator = new StrategyOrchestrator();
    orchestrator.register(new CostOptimizedStrategy());

    const router = createRouter({
      registry,
      orchestrator,
      executeModel: async () => ({
        content: 'ok',
        inputTokens: 4,
        outputTokens: 2,
      }),
    });

    const startedAt = performance.now();
    await router.route({ prompt: 'hi' });
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(100);
  });
});
