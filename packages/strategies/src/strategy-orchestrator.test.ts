import { describe, expect, it } from 'vitest';
import { StrategyOrchestrator } from "@reaatech/llm-router-strategies";
import { CostOptimizedStrategy } from "@reaatech/llm-router-strategies";
import { CapabilityBasedStrategy } from "@reaatech/llm-router-strategies";
import { JudgmentBasedStrategy } from "@reaatech/llm-router-strategies";
import type { ModelDefinition, RoutingContext } from "@reaatech/llm-router-core";

const models: ModelDefinition[] = [
  {
    id: 'cheap-code',
    provider: 'kuaishou',
    costPerMillionInput: 0.5,
    costPerMillionOutput: 1,
    maxTokens: 32000,
    capabilities: ['code', 'reasoning'],
  },
  {
    id: 'cheap-general',
    provider: 'zhipu',
    costPerMillionInput: 0.3,
    costPerMillionOutput: 0.6,
    maxTokens: 128000,
    capabilities: ['general'],
  },
];

const context: RoutingContext = {
  timestamp: new Date(),
  requestId: 'req-1',
  latencyHistory: new Map(),
  circuitBreakerStates: new Map(),
};

describe('StrategyOrchestrator', () => {
  it('uses the applicable higher-priority strategy first', () => {
    const orchestrator = new StrategyOrchestrator();
    orchestrator.register(new CostOptimizedStrategy());
    orchestrator.register(new CapabilityBasedStrategy());

    const result = orchestrator.evaluate(
      {
        prompt: 'write code',
        requiredCapabilities: ['code'],
      },
      context,
      models,
    );

    expect(result?.model.id).toBe('cheap-code');
    expect(result?.strategy.name).toBe('capability-based');
  });

  it('preserves configured strategy names from config', () => {
    const orchestrator = StrategyOrchestrator.fromConfig({
      complex: {
        type: 'judgment-based',
        priority: 2,
        workhorsePool: ['cheap-code'],
        judgePool: ['cheap-general'],
      },
    });

    const strategy = orchestrator.get('complex');

    expect(strategy).toBeInstanceOf(JudgmentBasedStrategy);
    expect(strategy?.name).toBe('complex');

    const result = orchestrator.evaluate(
      {
        prompt: 'route this',
        strategy: 'complex',
      },
      context,
      models,
    );

    expect(result?.strategy.name).toBe('complex');
  });
});
