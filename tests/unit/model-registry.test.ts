/**
 * Model Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModelRegistry } from '../../src/registry/model-registry.js';
import type { ModelDefinition } from '../../src/types/domain.js';

describe('ModelRegistry', () => {
  let registry: ModelRegistry;

  const sampleModels: ModelDefinition[] = [
    {
      id: 'kat-coder-pro',
      provider: 'kuaishou',
      costPerMillionInput: 0.5,
      costPerMillionOutput: 1.0,
      maxTokens: 32000,
      capabilities: ['code', 'reasoning'],
    },
    {
      id: 'glm-edge',
      provider: 'zhipu',
      costPerMillionInput: 0.3,
      costPerMillionOutput: 0.6,
      maxTokens: 128000,
      capabilities: ['general', 'chinese'],
    },
    {
      id: 'kimi-chat',
      provider: 'moonshot',
      costPerMillionInput: 0.8,
      costPerMillionOutput: 1.6,
      maxTokens: 200000,
      capabilities: ['long-context', 'analysis'],
    },
  ];

  beforeEach(() => {
    registry = new ModelRegistry();
  });

  describe('register', () => {
    it('should register a single model', () => {
      registry.register(sampleModels[0]);
      expect(registry.getAll()).toHaveLength(1);
      expect(registry.getById('kat-coder-pro')).toBeDefined();
    });

    it('should register multiple models', () => {
      registry.registerAll(sampleModels);
      expect(registry.getAll()).toHaveLength(3);
    });

    it('should not throw on duplicate registration (overwrites)', () => {
      registry.register(sampleModels[0]);
      expect(() => registry.register(sampleModels[0])).not.toThrow();
    });
  });

  describe('getById', () => {
    it('should return model by id', () => {
      registry.registerAll(sampleModels);
      const model = registry.getById('kat-coder-pro');
      expect(model).toBeDefined();
      expect(model?.provider).toBe('kuaishou');
    });

    it('should return undefined for unknown model', () => {
      const model = registry.getById('unknown');
      expect(model).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered models', () => {
      registry.registerAll(sampleModels);
      expect(registry.getAll()).toHaveLength(3);
    });

    it('should return empty array when no models registered', () => {
      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('getWorkhorses', () => {
    it('should return low-cost models as workhorses', () => {
      registry.registerAll(sampleModels);
      const workhorses = registry.getWorkhorses();
      // All sample models have cost < $5/M input, so all should be workhorses
      expect(workhorses).toHaveLength(3);
    });

    it('should exclude high-cost models from workhorses', () => {
      const highCostModel: ModelDefinition = {
        id: 'premium-model',
        provider: 'openai',
        costPerMillionInput: 10.0,
        costPerMillionOutput: 30.0,
        maxTokens: 128000,
        capabilities: ['code', 'reasoning'],
      };
      registry.registerAll([...sampleModels, highCostModel]);
      const workhorses = registry.getWorkhorses();
      expect(workhorses).toHaveLength(3);
      expect(workhorses.find((m) => m.id === 'premium-model')).toBeUndefined();
    });
  });

  describe('getJudges', () => {
    it('should return high-cost models with evaluation capability as judges', () => {
      const judgeModel: ModelDefinition = {
        id: 'claude-opus',
        provider: 'anthropic',
        costPerMillionInput: 15.0,
        costPerMillionOutput: 75.0,
        maxTokens: 200000,
        capabilities: ['evaluation', 'complex-reasoning'],
      };
      registry.registerAll([judgeModel]);
      const judges = registry.getJudges();
      expect(judges).toHaveLength(1);
      expect(judges[0].id).toBe('claude-opus');
    });

    it('should exclude models without evaluation capability from judges', () => {
      const highCostNoEval: ModelDefinition = {
        id: 'expensive-no-eval',
        provider: 'openai',
        costPerMillionInput: 10.0,
        costPerMillionOutput: 30.0,
        maxTokens: 128000,
        capabilities: ['code', 'reasoning'],
      };
      registry.register(highCostNoEval);
      const judges = registry.getJudges();
      expect(judges).toHaveLength(0);
    });
  });

  describe('filter', () => {
    it('should filter by model IDs', () => {
      registry.registerAll(sampleModels);
      const filtered = registry.filter({ modelIds: ['kat-coder-pro', 'glm-edge'] });
      expect(filtered).toHaveLength(2);
      expect(filtered.map((m) => m.id)).toContain('kat-coder-pro');
      expect(filtered.map((m) => m.id)).toContain('glm-edge');
    });

    it('should filter by capabilities', () => {
      registry.registerAll(sampleModels);
      const filtered = registry.filter({ capabilities: ['code'] });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('kat-coder-pro');
    });

    it('should filter by provider', () => {
      registry.registerAll(sampleModels);
      const filtered = registry.filter({ provider: 'zhipu' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('glm-edge');
    });
  });

  describe('findByCapabilities', () => {
    it('should find models with specified capabilities', () => {
      registry.registerAll(sampleModels);
      const codeModels = registry.findByCapabilities(['code']);
      expect(codeModels).toHaveLength(1);
      expect(codeModels[0].id).toBe('kat-coder-pro');
    });
  });

  describe('estimateCost', () => {
    it('should calculate estimated cost correctly', () => {
      registry.register(sampleModels[0]);
      const cost = registry.estimateCost('kat-coder-pro', 1000, 500);
      // (1000/1M * 0.5) + (500/1M * 1.0) = 0.0005 + 0.0005 = 0.001
      expect(cost).toBeCloseTo(0.001, 5);
    });

    it('should return undefined for unknown model', () => {
      const cost = registry.estimateCost('unknown', 1000, 500);
      expect(cost).toBeUndefined();
    });
  });

  describe('count', () => {
    it('should return correct count', () => {
      expect(registry.count()).toBe(0);
      registry.register(sampleModels[0]);
      expect(registry.count()).toBe(1);
      registry.registerAll(sampleModels.slice(1));
      expect(registry.count()).toBe(3);
    });
  });

  describe('remove', () => {
    it('should remove a model', () => {
      registry.registerAll(sampleModels);
      expect(registry.remove('kat-coder-pro')).toBe(true);
      expect(registry.count()).toBe(2);
      expect(registry.getById('kat-coder-pro')).toBeUndefined();
    });

    it('should return false for non-existent model', () => {
      expect(registry.remove('unknown')).toBe(false);
    });
  });
});
