#!/usr/bin/env node
/**
 * CLI Tool - Command-line interface for llm-router
 *
 * Commands:
 * - route: Route a single request
 * - benchmark: Benchmark models
 * - cost-report: Generate cost report
 * - validate-config: Validate configuration
 */

import { Command } from 'commander';
import { routeCommand } from './cli/commands/route.command.js';
import { benchmarkCommand } from './cli/commands/benchmark.command.js';
import { costReportCommand } from './cli/commands/cost-report.command.js';
import { validateConfigCommand } from './cli/commands/validate-config.command.js';

const program = new Command();

program.name('llm-router').description('Cost-aware, multi-model LLM routing CLI').version('1.0.0');

// Route command
program
  .command('route')
  .description('Route a single request to the optimal model')
  .requiredOption('-p, --prompt <text>', 'The prompt to send')
  .option(
    '-s, --strategy <strategy>',
    'Routing strategy (cost-optimized, latency-optimized, judgment-based, capability-based)',
    'cost-optimized',
  )
  .option('-m, --max-tokens <number>', 'Maximum tokens to generate')
  .option('-b, --budget-id <id>', 'Budget identifier for cost tracking')
  .option('-c, --capabilities <caps>', 'Required capabilities (comma-separated)')
  .option('-t, --user-tier <tier>', 'User tier (free, standard, premium)', 'standard')
  .option('--config <path>', 'Path to configuration file', 'llm-router.config.yaml')
  .action(routeCommand);

// Benchmark command
program
  .command('benchmark')
  .description('Benchmark models for latency and cost')
  .requiredOption('-p, --prompt <text>', 'Test prompt to use')
  .option('-m, --models <models>', 'Comma-separated list of model IDs to benchmark')
  .option('-r, --runs <number>', 'Number of runs per model', '3')
  .option('--config <path>', 'Path to configuration file', 'llm-router.config.yaml')
  .action(benchmarkCommand);

// Cost report command
program
  .command('cost-report')
  .description('Generate cost report')
  .option('-b, --budget-id <id>', 'Budget identifier')
  .option('-p, --period <period>', 'Time period (today, week, month)', 'today')
  .option('--config <path>', 'Path to configuration file', 'llm-router.config.yaml')
  .action(costReportCommand);

// Validate config command
program
  .command('validate-config')
  .description('Validate configuration file')
  .requiredOption('-c, --config <path>', 'Path to configuration file')
  .action(validateConfigCommand);

// Parse and execute
program.parse(process.argv);
