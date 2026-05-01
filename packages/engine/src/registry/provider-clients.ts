/**
 * Provider Client Factory - Creates LLM provider clients with unified interface
 *
 * Built-in clients are explicit reference stubs for tests and local
 * experimentation. Production integrations should supply `executeModel` to
 * `LLMRouter` or register a custom `LLMClient` factory.
 */

import { createHash } from 'node:crypto';
import type { ModelDefinition } from '@reaatech/llm-router-core';
import { logger } from '../observability/logger.js';

/** Supported LLM providers */
export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'kuaishou'
  | 'moonshot'
  | 'zhipu'
  | 'azure'
  | 'unknown';

/** Unified LLM client interface */
export interface LLMClient {
  /** Provider name */
  provider: ProviderType;
  /** Indicates this client is a non-production stub */
  isStub?: boolean;
  /** Generate completion */
  complete(options: CompletionOptions): Promise<CompletionResult>;
  /** Count tokens (if supported) */
  countTokens?(text: string): Promise<number>;
  /** Close the client */
  close(): void;
}

/** Options for completion request */
export interface CompletionOptions {
  /** The prompt */
  prompt: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Stop sequences */
  stopSequences?: string[];
}

/** Result of completion */
export interface CompletionResult {
  /** Generated content */
  content: string;
  /** Input tokens used */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Finish reason */
  finishReason: string;
  /** Model used */
  model: string;
}

/** Provider client configuration */
export interface ProviderConfig {
  /** API key (from env var) */
  apiKey: string;
  /** Optional base URL override */
  baseURL?: string;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Factory for creating LLM provider clients
 *
 * Built-in clients are lightweight stubs suitable for testing and development.
 * For production, register your own client via `registerClientFactory()` or supply an
 * `executeModel` callback to `LLMRouter`.
 */
export class ProviderClientFactory {
  private static instance: ProviderClientFactory;
  private clients: Map<string, LLMClient> = new Map();
  private customClients: Map<ProviderType, (config: ProviderConfig) => LLMClient> = new Map();

  static getInstance(): ProviderClientFactory {
    if (ProviderClientFactory.instance === undefined) {
      ProviderClientFactory.instance = new ProviderClientFactory();
    }
    return ProviderClientFactory.instance;
  }

  /**
   * Register a custom client factory for a provider type.
   * Overrides the built-in stub for that provider.
   */
  registerClientFactory(
    provider: ProviderType,
    factory: (config: ProviderConfig) => LLMClient,
  ): void {
    this.customClients.set(provider, factory);
    this.clients.delete(`provider:${provider}:default`);
  }

  /**
   * Create a client for a specific model
   */
  createClient(model: ModelDefinition): LLMClient | undefined {
    const provider = this.resolveProvider(model.provider);
    const apiKey =
      model.apiKeyEnv !== undefined && model.apiKeyEnv.length > 0
        ? process.env[model.apiKeyEnv]
        : undefined;

    if (apiKey === undefined || apiKey.length === 0) {
      logger.warn(
        { modelId: model.id, envVar: model.apiKeyEnv },
        'API key not configured for model',
      );
      return undefined;
    }

    const existingKey = this.getClientCacheKey(model, provider, apiKey);
    if (this.clients.has(existingKey)) {
      return this.clients.get(existingKey);
    }

    const config: ProviderConfig = {
      apiKey,
      baseURL: typeof model.config?.baseURL === 'string' ? model.config.baseURL : undefined,
      timeout: typeof model.config?.timeout === 'number' ? model.config.timeout : undefined,
    };

    const client = this.createProviderClient(provider, config);
    if (client) {
      this.clients.set(existingKey, client);
    }

    return client;
  }

  /**
   * Create a client by provider name
   */
  createByProvider(provider: string, config: ProviderConfig): LLMClient | undefined {
    const resolvedProvider = this.resolveProvider(provider);
    return this.createProviderClient(resolvedProvider, config);
  }

  private getClientCacheKey(
    model: ModelDefinition,
    provider: ProviderType,
    apiKey: string,
  ): string {
    const baseURL = typeof model.config?.baseURL === 'string' ? model.config.baseURL : 'default';
    const timeout = typeof model.config?.timeout === 'number' ? String(model.config.timeout) : '';
    const credentialHash = createHash('sha256').update(apiKey).digest('hex').slice(0, 12);

    return `provider:${provider}:model:${model.id}:env:${model.apiKeyEnv ?? 'none'}:base:${baseURL}:timeout:${timeout}:key:${credentialHash}`;
  }

  /**
   * Resolve provider string to known provider type
   */
  private resolveProvider(provider: string): ProviderType {
    const normalized = provider.toLowerCase();

    switch (normalized) {
      case 'openai':
        return 'openai';
      case 'anthropic':
        return 'anthropic';
      case 'google':
      case 'gemini':
        return 'google';
      case 'kuaishou':
      case 'kuaishou-tech':
        return 'kuaishou';
      case 'moonshot':
        return 'moonshot';
      case 'zhipu':
      case 'zhipu-ai':
        return 'zhipu';
      case 'azure':
      case 'azure-openai':
        return 'azure';
      default:
        return 'unknown';
    }
  }

  /**
   * Create provider-specific client
   *
   * If a custom factory was registered for the provider, it is used.
   * Otherwise a built-in reference stub is returned.
   */
  private createProviderClient(
    provider: ProviderType,
    config: ProviderConfig,
  ): LLMClient | undefined {
    const customFactory = this.customClients.get(provider);
    if (customFactory) {
      return customFactory(config);
    }

    return this.createStubClient(provider);
  }

  /**
   * Create a reference stub client for the given provider.
   *
   * Stub clients echo the prompt back and estimate tokens via character count.
   * They are intended for testing and development only.
   */
  private createStubClient(provider: ProviderType): LLMClient {
    const providerLabel = provider as string;
    return {
      provider,
      isStub: true,
      async complete(options): Promise<CompletionResult> {
        return {
          content: `[${providerLabel}] stub response to: ${options.prompt.slice(0, 50)}...`,
          inputTokens: Math.ceil(options.prompt.length / 4),
          outputTokens: 100,
          finishReason: 'stop',
          model: `${providerLabel}-stub`,
        };
      },
      async countTokens(text): Promise<number> {
        return Math.ceil(text.length / 4);
      },
      close(): void {},
    };
  }

  /**
   * Close all clients
   */
  closeAll(): void {
    for (const client of this.clients.values()) {
      client.close();
    }
    this.clients.clear();
  }

  /**
   * Reset all active clients and custom client factories.
   */
  reset(): void {
    this.closeAll();
    this.customClients.clear();
  }

  /**
   * Get all active clients
   */
  getActiveClients(): Map<string, LLMClient> {
    return new Map(this.clients);
  }
}

/**
 * Get the singleton factory instance
 */
export function getProviderFactory(): ProviderClientFactory {
  return ProviderClientFactory.getInstance();
}

/**
 * Check if a provider API key is configured
 */
export function isProviderConfigured(model: ModelDefinition): boolean {
  if (model.apiKeyEnv === undefined || model.apiKeyEnv.length === 0) {
    return false;
  }
  const key = process.env[model.apiKeyEnv];
  return key !== undefined && key.length > 0;
}

/**
 * Get all configured providers from environment
 */
export function getConfiguredProviders(): string[] {
  const knownEnvVars = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'KAT_CODER_API_KEY',
    'KIMI_API_KEY',
    'GLM_API_KEY',
  ];

  const configured: string[] = [];
  for (const envVar of knownEnvVars) {
    if (process.env[envVar] !== undefined) {
      configured.push(envVar);
    }
  }
  return configured;
}
