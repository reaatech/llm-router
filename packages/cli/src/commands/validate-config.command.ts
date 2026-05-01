/**
 * Validate configuration command.
 */

import { loadRouterConfig } from "@reaatech/llm-router-engine";
import { writeError, writeLine } from '../output.js';

interface ValidateConfigOptions {
  config: string;
}

export async function validateConfigCommand(options: ValidateConfigOptions): Promise<void> {
  try {
    const config = loadRouterConfig(options.config);
    const workhorseCount = config.models?.workhorses?.length ?? 0;
    const judgeCount = config.models?.judges?.length ?? 0;
    const modelCount = workhorseCount + judgeCount;
    writeLine(`Configuration is valid: ${options.config}`);
    writeLine(`Models: ${modelCount}`);
    writeLine(`Strategies: ${Object.keys(config.strategies ?? {}).length}`);
    writeLine(`Fallback chains: ${config.fallbackChains?.length ?? 0}`);
    writeLine(`Budgets: ${Object.keys(config.budgets ?? {}).length}`);
  } catch (error) {
    writeError(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
