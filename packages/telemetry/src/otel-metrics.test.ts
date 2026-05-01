import { describe, expect, it } from 'vitest';
import { MetricsCollector } from './metrics-collector.js';
import { TelemetryMetrics } from './otel-metrics.js';

describe('TelemetryMetrics', () => {
  it('forwards telemetry events to the collector', () => {
    const collector = new MetricsCollector({ enabled: true });
    const metrics = new TelemetryMetrics(collector);

    metrics.recordCost('glm-edge', 'cost-optimized', 0.123, 42);
    metrics.updateBudget('team-alpha', 9.5);
    metrics.recordModelUsage('glm-edge', { input: 10, output: 5 });

    const values = collector.getMetrics();
    expect(values.get('requests.cost-optimized.success')).toBe(1);
    expect(values.get('cost.glm-edge.last_usd')).toBe(0.123);
    expect(values.get('budget.team-alpha.remaining')).toBe(9.5);
    expect(values.get('usage.glm-edge.input_tokens')).toBe(10);
    expect(values.get('usage.glm-edge.output_tokens')).toBe(5);
  });
});
