/**
 * Registry barrel export
 */

export { ModelRegistry } from './model-registry.js';
export type { ModelFilterOptions } from './model-registry.js';
export { ModelValidationError, NoMatchingModelError } from './model-registry.js';

export {
  ProviderClientFactory,
  getProviderFactory,
  isProviderConfigured,
  getConfiguredProviders,
} from './provider-clients.js';
export type {
  ProviderType,
  LLMClient,
  CompletionOptions,
  CompletionResult,
  ProviderConfig,
} from './provider-clients.js';
