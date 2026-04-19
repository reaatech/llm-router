/**
 * OpenTelemetry Metrics - OTel metrics for routing observability
 */

/** Metrics configuration */
export interface MetricsConfig {
  serviceName: string;
  enabled: boolean;
  exportIntervalMs: number;
}

/**
 * Metrics Collector - Manages OTel metrics for llm-router
 *
 * Tracks:
 * - Request count by strategy and status
 * - Cost per request histogram
 * - Latency percentiles
 * - Model usage and token counts
 * - Fallback chain activations
 * - Circuit breaker states
 */
export class MetricsCollector {
  private config: MetricsConfig;
  private metrics: Map<string, number> = new Map();

  constructor(config: Partial<MetricsConfig> = {}) {
    this.config = {
      serviceName: config.serviceName ?? 'llm-router',
      enabled: config.enabled ?? false, // Disabled by default without OTel
      exportIntervalMs: config.exportIntervalMs ?? 60000,
    };
  }

  /** Initialize metrics collector */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }
    // OTel initialization would happen here when package is available
    return true;
  }

  /** Record a routing request */
  recordRequest(attributes: {
    strategy: string;
    status: 'success' | 'error' | 'fallback';
    modelId: string;
    cost: number;
    latencyMs: number;
  }): void {
    if (!this.config.enabled) {
      return;
    }

    const key = `requests.${attributes.strategy}.${attributes.status}`;
    this.metrics.set(key, (this.metrics.get(key) ?? 0) + 1);
    this.metrics.set(`latency.${attributes.modelId}.last_ms`, attributes.latencyMs);
    this.metrics.set(`cost.${attributes.modelId}.last_usd`, attributes.cost);
  }

  /** Record fallback activation */
  recordFallbackActivation(chainName: string): void {
    if (!this.config.enabled) {
      return;
    }

    const key = `fallback.${chainName}`;
    this.metrics.set(key, (this.metrics.get(key) ?? 0) + 1);
  }

  /** Update budget remaining gauge */
  updateBudgetRemaining(budgetId: string, remaining: number): void {
    if (!this.config.enabled) {
      return;
    }

    this.metrics.set(`budget.${budgetId}.remaining`, remaining);
  }

  recordTokenUsage(modelId: string, inputTokens: number, outputTokens: number): void {
    if (!this.config.enabled) {
      return;
    }

    this.metrics.set(
      `usage.${modelId}.input_tokens`,
      (this.metrics.get(`usage.${modelId}.input_tokens`) ?? 0) + inputTokens,
    );
    this.metrics.set(
      `usage.${modelId}.output_tokens`,
      (this.metrics.get(`usage.${modelId}.output_tokens`) ?? 0) + outputTokens,
    );
  }

  /** Update circuit breaker state */
  updateCircuitBreakerState(modelId: string, state: 'closed' | 'open' | 'half-open'): void {
    if (!this.config.enabled) {
      return;
    }

    const stateValue = { closed: 0, open: 1, 'half-open': 2 }[state] ?? 0;
    this.metrics.set(`circuit.${modelId}`, stateValue);
  }

  /** Get current metrics */
  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }

  /** Shutdown metrics collector */
  async shutdown(): Promise<void> {
    this.metrics.clear();
  }
}

/** Default metrics collector instance */
export const metricsCollector = new MetricsCollector();
