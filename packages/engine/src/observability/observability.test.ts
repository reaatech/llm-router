import { CircuitBreaker } from '@reaatech/llm-router-fallback';
import { MetricsCollector } from '@reaatech/llm-router-telemetry';
import { CostTracker } from '@reaatech/llm-router-telemetry';
import { BudgetManager } from '@reaatech/llm-router-telemetry';
import { CostReporter } from '@reaatech/llm-router-telemetry';
import { describe, expect, it } from 'vitest';
import { ObservabilityDashboard } from './dashboard.js';
import {
  childLogger,
  containsPII,
  createLogger,
  redactPIIPatterns,
  redactSensitiveFields,
} from './logger.js';
import { setupTracing } from './tracing.js';

describe('observability helpers', () => {
  it('redacts sensitive fields and can create a logger', () => {
    const logger = createLogger({ level: 'info' });
    expect(logger).toBeDefined();
    expect(
      childLogger(logger, {
        requestId: 'req-1',
        userId: 'user-1',
        budgetId: 'budget-1',
      }),
    ).toBeDefined();
    expect(redactSensitiveFields({ apiKey: 'secret', prompt: 'hello' })).toEqual({
      apiKey: '[REDACTED]',
      prompt: '[REDACTED]',
    });
    expect(redactSensitiveFields({ safe: 'value' })).toEqual({ safe: 'value' });
  });

  it('redacts PII patterns in string values', () => {
    const result = redactSensitiveFields({
      message: 'Contact me at test@example.com or 555-123-4567',
      ip: '192.168.1.1',
    });
    expect(result.message).toContain('[REDACTED_PII]');
    expect(result.message).not.toContain('test@example.com');
    expect(result.ip).toContain('[REDACTED_PII]');
    expect(result.ip).not.toContain('192.168.1.1');
  });

  it('detects PII in strings', () => {
    expect(containsPII('test@example.com')).toBe(true);
    expect(containsPII('555-123-4567')).toBe(true);
    expect(containsPII('192.168.1.1')).toBe(true);
    expect(containsPII('123-45-6789')).toBe(true);
    expect(containsPII('no pii here')).toBe(false);
  });

  it('redacts PII patterns directly', () => {
    expect(redactPIIPatterns('email: user@domain.com')).toContain('[REDACTED_PII]');
    expect(redactPIIPatterns('ssn: 123-45-6789')).toContain('[REDACTED_PII]');
    expect(redactPIIPatterns('card: 4111-1111-1111-1111')).toContain('[REDACTED_PII]');
  });

  it('records metrics and builds a dashboard snapshot with routing stats and model health', () => {
    const metrics = new MetricsCollector({ enabled: true });
    metrics.recordRequest({
      strategy: 'cost-optimized',
      status: 'success',
      modelId: 'glm-edge',
      cost: 0.1,
      latencyMs: 10,
    });
    metrics.recordFallbackActivation('default-chain');
    metrics.updateBudgetRemaining('team-alpha', 9.9);
    metrics.recordTokenUsage('glm-edge', 100, 50);
    metrics.updateCircuitBreakerState('glm-edge', 'half-open');

    const tracker = new CostTracker();
    const budgets = new BudgetManager();
    tracker.record({
      requestId: 'req-1',
      modelId: 'glm-edge',
      cost: 0.1,
      inputTokens: 100,
      outputTokens: 50,
      strategy: 'cost-optimized',
    });

    const dashboard = new ObservabilityDashboard(
      metrics,
      new CostReporter(tracker, budgets),
      tracker,
    );

    const cb = new CircuitBreaker();
    dashboard.registerCircuitBreaker('glm-edge', cb);
    dashboard.recordLatency(15);

    const snapshot = dashboard.getSnapshot();

    expect(snapshot.metrics['requests.cost-optimized.success']).toBe(1);
    expect(snapshot.metrics['fallback.default-chain']).toBe(1);
    expect(snapshot.metrics['budget.team-alpha.remaining']).toBe(9.9);
    expect(snapshot.cost.totalCost).toBe(0.1);
    expect(snapshot.routing.strategyDistribution['cost-optimized']).toBeDefined();
    expect(snapshot.costTrend.trend).toBeDefined();
    expect(snapshot.modelHealth).toBeDefined();
    expect(snapshot.timestamp).toBeDefined();
  });

  it('handles enabled and disabled metric collector lifecycle', async () => {
    const disabled = new MetricsCollector({ enabled: false });
    expect(await disabled.initialize()).toBe(false);
    disabled.recordRequest({
      strategy: 'cost-optimized',
      status: 'error',
      modelId: 'glm-edge',
      cost: 0.5,
      latencyMs: 22,
    });
    disabled.recordFallbackActivation('disabled-chain');
    disabled.updateBudgetRemaining('disabled-budget', 1);
    disabled.recordTokenUsage('glm-edge', 5, 5);
    disabled.updateCircuitBreakerState('glm-edge', 'open');
    expect(disabled.getMetrics().size).toBe(0);

    const enabled = new MetricsCollector({ enabled: true });
    expect(await enabled.initialize()).toBe(true);
    enabled.recordRequest({
      strategy: 'latency-optimized',
      status: 'fallback',
      modelId: 'glm-edge',
      cost: 0.2,
      latencyMs: 7,
    });
    enabled.recordTokenUsage('glm-edge', 2, 3);
    enabled.recordTokenUsage('glm-edge', 4, 5);
    enabled.updateCircuitBreakerState('glm-edge', 'closed');
    enabled.updateCircuitBreakerState('glm-edge', 'open');
    enabled.updateCircuitBreakerState('glm-edge', 'unexpected' as 'closed');
    expect(enabled.getMetrics().get('requests.latency-optimized.fallback')).toBe(1);
    expect(enabled.getMetrics().get('usage.glm-edge.input_tokens')).toBe(6);
    expect(enabled.getMetrics().get('circuit.glm-edge')).toBe(0);
    await enabled.shutdown();
    expect(enabled.getMetrics().size).toBe(0);
  });

  it('returns undefined tracer when tracing is disabled', () => {
    expect(setupTracing({ enabled: false })).toBeUndefined();
  });
});
