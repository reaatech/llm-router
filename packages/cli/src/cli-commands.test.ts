import path from 'node:path';
import { ProviderClientFactory } from '@reaatech/llm-router-engine';
import { describe, expect, it } from 'vitest';
import { benchmarkCommand } from './commands/benchmark.command.js';
import { costReportCommand } from './commands/cost-report.command.js';
import { routeCommand } from './commands/route.command.js';
import { validateConfigCommand } from './commands/validate-config.command.js';
import { writeError } from './output.js';

const configPath = path.resolve(import.meta.dirname, '../../../llm-router.config.yaml');

describe('CLI commands', () => {
  it('prints summaries for route, validate-config, benchmark, and cost-report', async () => {
    let stdout = '';
    let stderr = '';
    const originalWrite = process.stdout.write.bind(process.stdout);
    const originalErrorWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderr += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    process.env.GLM_API_KEY = 'glm-test-key';
    const factory = ProviderClientFactory.getInstance();
    factory.reset();
    factory.registerClientFactory('zhipu', () => ({
      provider: 'zhipu',
      close(): void {},
      async complete() {
        return {
          content: 'ok',
          inputTokens: 5,
          outputTokens: 3,
          finishReason: 'stop',
          model: 'glm-edge',
        };
      },
    }));

    try {
      await validateConfigCommand({ config: configPath });
      await validateConfigCommand({ config: 'missing.yaml' });
      await routeCommand({
        prompt: 'hello',
        strategy: 'cost-optimized',
        userTier: 'standard',
        config: configPath,
      });
      await costReportCommand({
        period: 'today',
        config: configPath,
      });
      await costReportCommand({
        period: 'week',
        budgetId: 'default',
        config: configPath,
      });
      await costReportCommand({
        period: 'month',
        config: configPath,
      });
      await benchmarkCommand({
        prompt: 'hello',
        runs: 1,
        models: 'glm-edge',
        config: configPath,
      });
      await routeCommand({
        prompt: 'hello',
        strategy: 'cost-optimized',
        userTier: 'standard',
        config: 'missing.yaml',
      });
      writeError('custom error');
    } finally {
      process.stdout.write = originalWrite;
      process.stderr.write = originalErrorWrite;
      process.env.GLM_API_KEY = undefined;
      factory.reset();
      process.exitCode = 0;
    }

    expect(stdout).toContain('Configuration is valid');
    expect(stdout).toContain('Routing Decision');
    expect(stdout).toContain('Cost Report');
    expect(stdout).toContain('Period: week');
    expect(stdout).toContain('Period: month');
    expect(stdout).toContain('Budget: default');
    expect(stdout).toContain('Benchmarking 1 models');
    expect(stderr).toContain('missing.yaml');
    expect(stderr).toContain('custom error');
  });
});
