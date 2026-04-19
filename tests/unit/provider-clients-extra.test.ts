import { afterEach, describe, expect, it } from 'vitest';
import {
  ProviderClientFactory,
  getConfiguredProviders,
  isProviderConfigured,
} from '../../src/registry/provider-clients.js';
import type { ModelDefinition } from '../../src/types/domain.js';

const model: ModelDefinition = {
  id: 'gpt-4-turbo',
  provider: 'openai',
  costPerMillionInput: 10,
  costPerMillionOutput: 30,
  maxTokens: 128000,
  capabilities: ['evaluation', 'reasoning'],
  apiKeyEnv: 'OPENAI_API_KEY',
};

describe('ProviderClientFactory extras', () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const factory = ProviderClientFactory.getInstance();
    factory.reset();
  });

  it('creates and caches provider clients from environment config', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const factory = ProviderClientFactory.getInstance();
    const first = factory.createClient(model);
    const second = factory.createClient(model);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    expect(isProviderConfigured(model)).toBe(true);

    const result = await first?.complete({ prompt: 'hello world' });
    expect(result?.model).toBe('openai-stub');
    expect(factory.getActiveClients().size).toBe(1);
  });

  it('creates direct provider clients for multiple providers', async () => {
    const factory = ProviderClientFactory.getInstance();
    const anthropic = factory.createByProvider('anthropic', { apiKey: 'a' });
    const google = factory.createByProvider('gemini', { apiKey: 'g' });
    const azure = factory.createByProvider('azure-openai', { apiKey: 'z' });

    expect((await anthropic?.complete({ prompt: 'hi' }))?.finishReason).toBe('stop');
    expect((await google?.complete({ prompt: 'hi' }))?.model).toBe('google-stub');
    expect((await azure?.complete({ prompt: 'hi' }))?.model).toBe('azure-stub');
  });

  it('isolates cached clients by model and credential set', async () => {
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const factory = ProviderClientFactory.getInstance();
    factory.registerClientFactory('openai', ({ apiKey }) => ({
      provider: 'openai',
      close(): void {},
      async complete() {
        return {
          content: apiKey,
          inputTokens: 1,
          outputTokens: 1,
          finishReason: 'stop',
          model: apiKey,
        };
      },
    }));

    const first = factory.createClient(model);
    const second = factory.createClient({
      ...model,
      id: 'gpt-4-turbo-alt',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    });

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect((await first?.complete({ prompt: 'hello' }))?.model).toBe('openai-key');
    expect((await second?.complete({ prompt: 'hello' }))?.model).toBe('anthropic-key');
  });

  it('lists configured providers from environment', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';

    expect(getConfiguredProviders()).toEqual(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']);
  });
});
