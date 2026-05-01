import { describe, expect, it } from 'vitest';
import { sampleConfigYaml } from '../fixtures/sample-config.js';
import { parseRouterConfig } from './config-loader.js';

describe('config-loader', () => {
  it('parses snake_case config into router config', () => {
    const config = parseRouterConfig(sampleConfigYaml, 'sample.yaml');

    expect(config.models.workhorses).toHaveLength(2);
    expect(config.models.judges).toHaveLength(1);
    expect(config.budgets.default.id).toBe('default');
    expect(config.fallbackChains[0].circuitBreaker?.failureThreshold).toBe(1);
    expect(config.strategies?.default?.budgetPerRequest).toBe(0.05);
  });
});
