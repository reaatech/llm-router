import { StrategyOrchestrator } from '@reaatech/llm-router-strategies';
import { CostOptimizedStrategy } from '@reaatech/llm-router-strategies';
import { describe, expect, it } from 'vitest';
import { ModelRegistry } from './registry/model-registry.js';
import { createRouter } from './router.js';

describe('router flow', () => {
  it('routes end-to-end with explicit collaborators', async () => {
    const registry = new ModelRegistry();
    registry.registerAll([
      {
        id: 'cheap',
        provider: 'zhipu',
        costPerMillionInput: 0.1,
        costPerMillionOutput: 0.2,
        maxTokens: 1000,
        capabilities: ['general'],
      },
      {
        id: 'expensive',
        provider: 'openai',
        costPerMillionInput: 10,
        costPerMillionOutput: 20,
        maxTokens: 1000,
        capabilities: ['general'],
      },
    ]);

    const orchestrator = new StrategyOrchestrator();
    orchestrator.register(new CostOptimizedStrategy());

    const router = createRouter({
      registry,
      orchestrator,
      executeModel: async () => ({
        content: 'done',
        inputTokens: 8,
        outputTokens: 4,
      }),
    });

    const result = await router.route({ prompt: 'hello world' });
    expect(result.model.id).toBe('cheap');
    expect(result.result.content).toBe('done');
  });
});
