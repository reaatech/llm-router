import { context, trace } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import {
  endSpan,
  getSpanId,
  getTraceId,
  recordCostCalculation,
  recordFallbackAttempt,
  recordModelExecution,
  recordStrategyEvaluation,
  setupTracing,
  startRoutingSpan,
} from './tracing.js';

class FakeSpan {
  public ended = false;
  public status: { code: number; message?: string } | undefined;
  constructor(
    public readonly name: string,
    public readonly attributes: Record<string, unknown> = {},
  ) {}
  setStatus(status: { code: number; message?: string }): this {
    this.status = status;
    return this;
  }
  end(): void {
    this.ended = true;
  }
  spanContext(): { traceId: string; spanId: string; traceFlags: number } {
    return {
      traceId: 'trace-123',
      spanId: 'span-456',
      traceFlags: 1,
    };
  }
}

class FakeTracer {
  public readonly spans: FakeSpan[] = [];
  startSpan(name: string, options?: { attributes?: Record<string, unknown> }): FakeSpan {
    const span = new FakeSpan(name, options?.attributes ?? {});
    this.spans.push(span);
    return span;
  }
}

describe('tracing helpers', () => {
  it('creates and completes spans for all tracing helpers', () => {
    const tracer = new FakeTracer();
    const routingSpan = startRoutingSpan(tracer as never, 'req-1', {
      strategy: 'cost-optimized',
      modelId: 'glm-edge',
      cost: 0.1,
      latencyMs: 10,
      inputTokens: 4,
      outputTokens: 2,
    });

    recordStrategyEvaluation(tracer as never, context.active(), {
      strategyName: 'cost-optimized',
      applies: true,
      candidates: ['glm-edge'],
      reason: 'cheapest',
    });
    recordModelExecution(tracer as never, context.active(), {
      modelId: 'glm-edge',
      tokens: { input: 4, output: 2 },
      latencyMs: 10,
      success: false,
      error: 'boom',
    });
    recordFallbackAttempt(tracer as never, context.active(), {
      modelId: 'glm-edge',
      attempt: 1,
      success: true,
    });
    recordCostCalculation(tracer as never, context.active(), {
      modelId: 'glm-edge',
      inputTokens: 4,
      outputTokens: 2,
      cost: 0.1,
    });
    endSpan(routingSpan as never, false, 'failed');

    expect(tracer.spans).toHaveLength(5);
    expect(tracer.spans.every((span) => span.ended)).toBe(true);
    expect(tracer.spans[2].status?.message).toBe('boom');
    expect(tracer.spans[0].status?.message).toBe('failed');
  });

  it('returns undefined trace and span ids without an active span', () => {
    const activeContext = trace.setSpan(context.active(), new FakeSpan('active') as never);

    context.with(activeContext, () => {
      expect(getTraceId()).toBeUndefined();
      expect(getSpanId()).toBeUndefined();
    });
  });

  it('returns no tracer when tracing is disabled', () => {
    expect(setupTracing({ enabled: false })).toBeUndefined();
  });
});
