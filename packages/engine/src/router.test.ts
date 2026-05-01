import { describe, expect, it } from 'vitest';
import { LLMRouter } from "./router.js";
import { parseRouterConfig } from "./utils/config-loader.js";
import { sampleConfigYaml } from './fixtures/sample-config.js';
import { ModelRegistry } from "./registry/model-registry.js";
import { StrategyOrchestrator } from "@reaatech/llm-router-strategies";
import { ProviderClientFactory } from "@reaatech/llm-router-engine";

describe('LLMRouter', () => {
  it('routes a request with loaded config', async () => {
    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml), {
      executeModel: async (model, request) => ({
        content: `${model.id}:${request.prompt}`,
        inputTokens: 10,
        outputTokens: 5,
      }),
    });

    const routed = await router.route({
      prompt: 'summarize this',
      strategy: 'cost-optimized',
    });

    expect(routed.model.id).toBe('glm-edge');
    expect(routed.result.success).toBe(true);
    expect(routed.result.actualCost).toBeGreaterThan(0);
  });

  it('uses a fallback chain when requested', async () => {
    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml), {
      executeModel: async (model) => {
        if (model.id === 'glm-edge') {
          throw new Error('primary failed');
        }
        return {
          content: `${model.id}:ok`,
          inputTokens: 20,
          outputTokens: 10,
        };
      },
    });

    const routed = await router.route({
      prompt: 'write code',
      strategy: 'cost-optimized',
      metadata: { fallbackChain: 'default-chain' },
    });

    expect(routed.model.id).toBe('kat-coder-pro');
    expect(routed.result.decision.isFallback).toBe(true);
    expect(routed.result.decision.fallbackPosition).toBe(1);
  });

  it('preserves the selected model as the first fallback attempt', async () => {
    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml), {
      executeModel: async (model) => ({
        content: `${model.id}:ok`,
        inputTokens: 20,
        outputTokens: 10,
      }),
    });

    const routed = await router.route({
      prompt: 'routine code task',
      strategy: 'complex',
      metadata: { fallbackChain: 'default-chain' },
    });

    expect(routed.model.id).toBe('kat-coder-pro');
    expect(routed.result.decision.isFallback).toBe(false);
    expect(routed.result.decision.fallbackPosition).toBe(0);
  });

  it('throws when no strategy can select a model', async () => {
    const router = new LLMRouter({
      registry: new ModelRegistry(),
      orchestrator: new StrategyOrchestrator(),
    });

    await expect(router.route({ prompt: 'no models' })).rejects.toThrow(
      'No strategy could select a model for the request',
    );
  });

  it('rejects requests that exceed a hard budget', async () => {
    const config = parseRouterConfig(sampleConfigYaml);
    config.budgets.default.dailyLimit = 0.000001;
    const router = LLMRouter.fromConfig(config, {
      executeModel: async () => ({
        content: 'ok',
        inputTokens: 100,
        outputTokens: 50,
      }),
    });

    await expect(
      router.route({
        prompt: 'hello',
        strategy: 'cost-optimized',
        budgetId: 'default',
      }),
    ).rejects.toThrow('Budget');
  });

  it('fails closed when no provider client is configured', async () => {
    const factory = ProviderClientFactory.getInstance();
    factory.reset();

    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml));

    await expect(
      router.route({
        prompt: 'hello',
        strategy: 'default',
      }),
    ).rejects.toThrow('No executable provider client is configured');
  });

  it('fails closed when only a stub provider client is available', async () => {
    process.env.GLM_API_KEY = 'test-key';
    const factory = ProviderClientFactory.getInstance();
    factory.reset();

    const router = LLMRouter.fromConfig(parseRouterConfig(sampleConfigYaml), {
      providerFactory: factory,
    });

    await expect(
      router.route({
        prompt: 'hello',
        strategy: 'default',
      }),
    ).rejects.toThrow('is backed by a stub provider client');

    delete process.env.GLM_API_KEY;
    factory.reset();
  });
});
