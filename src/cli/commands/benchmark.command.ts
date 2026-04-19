/**
 * Benchmark command.
 */

import { LLMRouter } from '../../router.js';
import { loadRouterConfig } from '../../utils/config-loader.js';
import { writeError, writeLine } from '../output.js';

interface BenchmarkOptions {
  prompt: string;
  models?: string;
  runs: number;
  config: string;
}

export async function benchmarkCommand(options: BenchmarkOptions): Promise<void> {
  try {
    const config = loadRouterConfig(options.config);
    const baseRouter = LLMRouter.fromConfig(config);
    const selectedModelIds = options.models?.split(',').map((value) => value.trim());
    const models = baseRouter
      .getModels()
      .filter((model) => selectedModelIds === undefined || selectedModelIds.includes(model.id));

    if (models.length === 0) {
      throw new Error('No models found to benchmark');
    }

    writeLine(`Benchmarking ${models.length} models with ${options.runs} runs each`);
    for (const model of models) {
      const router = LLMRouter.fromConfig(config, {
        executeModel: async (_selectedModel, request) => ({
          content: `[${model.id}] ${request.prompt}`,
          inputTokens: Math.max(1, Math.ceil(request.prompt.length / 4)),
          outputTokens: 128,
        }),
      });
      router.registry.clear();
      router.registry.register(model);

      let totalLatency = 0;
      let totalCost = 0;

      for (let run = 0; run < Number(options.runs); run++) {
        const startedAt = Date.now();
        const result = await router.route({
          prompt: options.prompt,
          strategy: 'cost-optimized',
          maxTokens: 128,
        });
        totalLatency += Date.now() - startedAt;
        totalCost += result.cost;
      }

      writeLine(
        `${model.id}: avg latency ${Math.round(totalLatency / Number(options.runs))}ms, avg cost $${(totalCost / Number(options.runs)).toFixed(6)}`,
      );
    }
  } catch (error) {
    writeError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
