import { describe, expect, it } from 'vitest';
import { ProviderClientFactory } from "@reaatech/llm-router-engine";

describe('provider client contract', () => {
  it('creates a generic provider client with the shared completion contract', async () => {
    const factory = ProviderClientFactory.getInstance();
    const client = factory.createByProvider('zhipu', {
      apiKey: 'test-key',
    });

    const result = await client?.complete({ prompt: 'hello' });

    expect(result?.content).toContain('hello');
    expect(result?.inputTokens).toBeGreaterThan(0);
    expect(result?.outputTokens).toBeGreaterThan(0);
  });
});
