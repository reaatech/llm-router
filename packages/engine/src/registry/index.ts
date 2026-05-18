/**
 * Registry barrel export
 */

export type { ModelFilterOptions } from './model-registry.js';
export { ModelRegistry, ModelValidationError, NoMatchingModelError } from './model-registry.js';
export type {
  CompletionOptions,
  CompletionResult,
  LLMClient,
  ProviderConfig,
  ProviderType,
} from './provider-clients.js';
export {
  getConfiguredProviders,
  getProviderFactory,
  isProviderConfigured,
  ProviderClientFactory,
} from './provider-clients.js';
