import { describe, expect, it } from 'vitest';
import { PerformanceTracker } from '../../src/eval/performance-tracker.js';

describe('PerformanceTracker', () => {
  it('calculates latency and success metrics', () => {
    const tracker = new PerformanceTracker();
    tracker.record('glm-edge', 100, true, 4);
    tracker.record('glm-edge', 200, false, 2);
    tracker.record('glm-edge', 150, true, 5);

    const latency = tracker.getLatencyPercentiles('glm-edge');
    expect(latency.p50).toBeGreaterThan(0);
    expect(tracker.getSuccessRate('glm-edge')).toBeCloseTo(2 / 3, 3);
    expect(tracker.getAverageQualityScore('glm-edge')).toBeCloseTo((4 + 2 + 5) / 3, 3);
  });
});
