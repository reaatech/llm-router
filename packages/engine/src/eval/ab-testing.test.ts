import type { ModelDefinition } from '@reaatech/llm-router-core';
import { describe, expect, it, vi } from 'vitest';
import { ABTestManager } from './ab-testing.js';

const models: ModelDefinition[] = [
  {
    id: 'a',
    provider: 'openai',
    costPerMillionInput: 1,
    costPerMillionOutput: 2,
    maxTokens: 1000,
    capabilities: ['general'],
  },
  {
    id: 'b',
    provider: 'anthropic',
    costPerMillionInput: 1,
    costPerMillionOutput: 2,
    maxTokens: 1000,
    capabilities: ['general'],
  },
];

describe('ABTestManager', () => {
  it('selects eligible variants, resets results, and removes tests', () => {
    const manager = new ABTestManager();
    manager.createTest({
      name: 'routing',
      trafficSplit: {
        a: 0.7,
        b: 0.3,
      },
      minSampleSize: 1,
    });

    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.95);
    expect(manager.selectModel('routing', models)?.id).toBe('a');
    expect(manager.selectModel('routing', models)?.id).toBe('b');
    expect(manager.selectModel('missing', models)).toBeNull();
    expect(manager.selectModel('routing', [models[0], { ...models[1], id: 'c' }])).toMatchObject({
      id: 'a',
    });
    expect(manager.getTestNames()).toContain('routing');
    expect(manager.resetResults('routing')).toBe(true);
    expect(manager.removeTest('routing')).toBe(true);
    expect(manager.removeTest('routing')).toBe(false);
  });

  it('tracks results and reports a winner after enough samples', () => {
    const manager = new ABTestManager();
    manager.createTest({
      name: 'quality',
      trafficSplit: {
        a: 0.5,
        b: 0.5,
      },
      minSampleSize: 2,
    });

    manager.recordResult('quality', 'a', {
      overall: 5,
      relevance: 5,
      correctness: 5,
      completeness: 5,
    });
    manager.recordResult('quality', 'a', {
      overall: 5,
      relevance: 5,
      correctness: 5,
      completeness: 5,
    });
    manager.recordResult('quality', 'b', {
      overall: 4,
      relevance: 4,
      correctness: 4,
      completeness: 4,
    });
    manager.recordResult('quality', 'b', {
      overall: 4,
      relevance: 4,
      correctness: 4,
      completeness: 4,
    });

    const stats = manager.getStats('quality');
    expect(stats?.winner).toBe('a');
    expect(stats?.isSignificant).toBe(true);
  });

  it('returns null or non-significant stats when configuration is missing or undersampled', () => {
    const manager = new ABTestManager();
    expect(manager.getStats('missing')).toBeNull();

    manager.createTest({
      name: 'small',
      trafficSplit: { a: 1 },
      minSampleSize: 2,
    });
    manager.recordResult('small', 'a', {
      overall: 5,
      relevance: 5,
      correctness: 5,
      completeness: 5,
    });

    const stats = manager.getStats('small');
    expect(stats?.winner).toBeUndefined();
    expect(stats?.isSignificant).toBe(false);
  });
});
