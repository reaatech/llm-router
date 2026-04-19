import { describe, expect, it } from 'vitest';
import { EvalHooksManager } from '../../src/eval/eval-hooks.js';

describe('EvalHooksManager', () => {
  it('runs hooks in priority order', async () => {
    const manager = new EvalHooksManager();
    manager.registerPreRouting(
      'later',
      async (request) => ({ ...request, prompt: `${request.prompt}-later` }),
      20,
    );
    manager.registerPreRouting(
      'earlier',
      async (request) => ({ ...request, prompt: `${request.prompt}-earlier` }),
      10,
    );

    const result = await manager.executePreRouting(
      { prompt: 'start' },
      { requestId: 'req-1', timestamp: Date.now(), metadata: {} },
    );

    expect(result.prompt).toBe('start-earlier-later');
  });

  it('tracks registered hooks, executes all hook types, and unregisters cleanly', async () => {
    const manager = new EvalHooksManager();
    const calls: string[] = [];

    manager.registerPreRouting('pre', async (request) => {
      calls.push('pre');
      return { ...request, prompt: `${request.prompt}-pre` };
    });
    manager.registerPostRouting('post-route', async () => {
      calls.push('post-route');
    });
    manager.registerPostExecution('post-exec', async () => {
      calls.push('post-exec');
    });

    expect(manager.getRegisteredHooks()).toEqual({
      preRouting: ['pre'],
      postRouting: ['post-route'],
      postExecution: ['post-exec'],
    });

    const context = { requestId: 'req-1', timestamp: Date.now(), metadata: {} };
    const request = await manager.executePreRouting({ prompt: 'start' }, context);
    await manager.executePostRouting(
      {
        modelId: 'glm-edge',
        strategy: 'cost-optimized',
        estimatedCost: 0.1,
        estimatedInputTokens: 10,
        estimatedOutputTokens: 5,
        isFallback: false,
        fallbackPosition: 0,
        alternativesConsidered: [],
        selectionReason: 'test',
      },
      request,
      context,
    );
    await manager.executePostExecution(
      {
        decision: {
          modelId: 'glm-edge',
          strategy: 'cost-optimized',
          estimatedCost: 0.1,
          estimatedInputTokens: 10,
          estimatedOutputTokens: 5,
          isFallback: false,
          fallbackPosition: 0,
          alternativesConsidered: [],
          selectionReason: 'test',
        },
        actualCost: 0.1,
        actualInputTokens: 10,
        actualOutputTokens: 5,
        latencyMs: 5,
        content: 'done',
        success: true,
        requestId: 'req-1',
        completedAt: new Date(),
      },
      {
        modelId: 'glm-edge',
        strategy: 'cost-optimized',
        estimatedCost: 0.1,
        estimatedInputTokens: 10,
        estimatedOutputTokens: 5,
        isFallback: false,
        fallbackPosition: 0,
        alternativesConsidered: [],
        selectionReason: 'test',
      },
      request,
      context,
    );

    expect(calls).toEqual(['pre', 'post-route', 'post-exec']);
    expect(manager.unregister('pre')).toBe(true);
    expect(manager.unregister('missing')).toBe(false);
    manager.clear();
    expect(manager.getRegisteredHooks()).toEqual({
      preRouting: [],
      postRouting: [],
      postExecution: [],
    });
  });
});
