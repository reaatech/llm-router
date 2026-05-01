import { describe, expect, it } from 'vitest';
import { EvalHooksManager } from './eval/eval-hooks.js';
import { sampleConfigYaml } from './fixtures/sample-config.js';
import { LLMRouter } from './router.js';
import { parseRouterConfig } from './utils/config-loader.js';

describe('router hooks and telemetry', () => {
  it('tracks cost telemetry accurately for routed requests', async () => {
    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml), {
      executeModel: async () => ({
        content: 'ok',
        inputTokens: 100,
        outputTokens: 50,
      }),
    });

    await router.route({
      prompt: 'hello',
      strategy: 'cost-optimized',
      budgetId: 'default',
    });

    const report = router.costReporter.getReport({ budgetId: 'default' });
    expect(report.totalRequests).toBe(1);
    expect(report.totalCost).toBeGreaterThan(0);
    expect(report.budget?.spentToday).toBeGreaterThan(0);
  });

  it('lets eval hooks modify request and observe decision/result execution', async () => {
    const hooks = new EvalHooksManager();
    let postRoutingSeen = false;
    let postExecutionSeen = false;

    hooks.registerPreRouting('append', async (request) => ({
      ...request,
      prompt: `${request.prompt} updated`,
    }));
    hooks.registerPostRouting('mark', async (decision) => {
      if (decision.modelId.length > 0) {
        postRoutingSeen = true;
      }
    });
    hooks.registerPostExecution('capture', async (result) => {
      if (result.content.includes('updated')) {
        postExecutionSeen = true;
      }
    });

    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml), {
      evalHooks: hooks,
      responseEvaluator: true,
      executeModel: async (_model, request) => ({
        content: request.prompt,
        inputTokens: 20,
        outputTokens: 10,
      }),
    });

    const routed = await router.route({
      prompt: 'original',
      strategy: 'cost-optimized',
    });

    expect(routed.result.content).toContain('updated');
    expect(routed.result.qualityScore).toBeGreaterThan(0);
    expect(postRoutingSeen).toBe(true);
    expect(postExecutionSeen).toBe(true);
  });
});
