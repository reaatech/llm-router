/**
 * OpenTelemetry Tracing - Distributed tracing for routing decisions
 */

import { trace, context, SpanStatusCode, type Tracer, type Span } from '@opentelemetry/api';

/** Tracing configuration */
export interface TracingConfig {
  serviceName: string;
  enabled: boolean;
}

/** Routing span attributes */
export interface RoutingSpanAttributes {
  strategy: string;
  modelId: string;
  cost: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  budgetId?: string;
  escalated?: boolean;
  fallbackUsed?: boolean;
}

/** Strategy evaluation span attributes */
export interface StrategyEvalAttributes {
  strategyName: string;
  applies: boolean;
  candidates: string[];
  reason?: string;
}

/** Create and configure tracing */
export function setupTracing(config: Partial<TracingConfig> = {}): Tracer | undefined {
  const tracingConfig: TracingConfig = {
    serviceName: config.serviceName ?? 'llm-router',
    enabled: config.enabled ?? process.env.OTEL_ENABLED === 'true',
  };

  if (!tracingConfig.enabled) {
    return undefined;
  }

  return trace.getTracer(tracingConfig.serviceName);
}

/** Start a routing decision span */
export function startRoutingSpan(
  tracer: Tracer,
  requestId: string,
  attributes: Partial<RoutingSpanAttributes> = {},
): Span {
  const span = tracer.startSpan('llm_router.route', {
    attributes: {
      'request.id': requestId,
      ...attributes,
    },
  });

  return span;
}

/** Record strategy evaluation */
export function recordStrategyEvaluation(
  tracer: Tracer,
  parentContext: ReturnType<typeof context.active>,
  attributes: StrategyEvalAttributes,
): void {
  context.with(parentContext, () => {
    const span = tracer.startSpan('strategy.evaluate', {
      attributes: {
        'strategy.name': attributes.strategyName,
        'strategy.applies': attributes.applies,
        'strategy.candidates': JSON.stringify(attributes.candidates),
        ...(attributes.reason !== undefined && attributes.reason.length > 0
          ? { 'strategy.reason': attributes.reason }
          : {}),
      },
    });

    span.end();
  });
}

/** Record model execution */
export function recordModelExecution(
  tracer: Tracer,
  parentContext: ReturnType<typeof context.active>,
  attributes: {
    modelId: string;
    tokens: { input: number; output: number };
    latencyMs: number;
    success: boolean;
    error?: string;
  },
): void {
  context.with(parentContext, () => {
    const span = tracer.startSpan('model.execute', {
      attributes: {
        'model.id': attributes.modelId,
        'model.input_tokens': attributes.tokens.input,
        'model.output_tokens': attributes.tokens.output,
        'model.latency_ms': attributes.latencyMs,
        'model.success': attributes.success,
        ...(attributes.error !== undefined && attributes.error.length > 0
          ? { 'model.error': attributes.error }
          : {}),
      },
    });

    if (!attributes.success) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: attributes.error });
    }

    span.end();
  });
}

/** Record fallback attempt */
export function recordFallbackAttempt(
  tracer: Tracer,
  parentContext: ReturnType<typeof context.active>,
  attributes: {
    modelId: string;
    attempt: number;
    success: boolean;
    error?: string;
  },
): void {
  context.with(parentContext, () => {
    const span = tracer.startSpan('fallback.try', {
      attributes: {
        'fallback.model_id': attributes.modelId,
        'fallback.attempt': attributes.attempt,
        'fallback.success': attributes.success,
        ...(attributes.error !== undefined && attributes.error.length > 0
          ? { 'fallback.error': attributes.error }
          : {}),
      },
    });

    if (!attributes.success) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: attributes.error });
    }

    span.end();
  });
}

/** Record cost calculation */
export function recordCostCalculation(
  tracer: Tracer,
  parentContext: ReturnType<typeof context.active>,
  attributes: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    modelId: string;
  },
): void {
  context.with(parentContext, () => {
    const span = tracer.startSpan('cost.calculate', {
      attributes: {
        'cost.input_tokens': attributes.inputTokens,
        'cost.output_tokens': attributes.outputTokens,
        'cost.amount': attributes.cost,
        'model.id': attributes.modelId,
      },
    });

    span.end();
  });
}

/** End a span with status */
export function endSpan(span: Span, success: boolean, error?: string): void {
  if (!success && error !== undefined && error.length > 0) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: error });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

/** Get current trace ID */
export function getTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext().traceId;
}

/** Get current span ID */
export function getSpanId(): string | undefined {
  const span = trace.getActiveSpan();
  return span?.spanContext().spanId;
}
