import { describe, it, expect } from 'vitest';
import { handLandmarks } from '@/lib/hand/handModel';
import { computeFingers, computeRoll } from '@/lib/hand/handGeometry';
import type { FingerState } from '@/lib/hand/handGeometry';

const keys: (keyof FingerState)[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

describe('parametric hand model', () => {
  it('round-trips finger extension through the tracker geometry', () => {
    for (const e of [0, 0.25, 0.5, 0.75, 1]) {
      const f: FingerState = { thumb: e, index: e, middle: e, ring: e, pinky: e };
      const back = computeFingers(handLandmarks({ fingers: f }));
      for (const k of keys.slice(1)) expect(Math.abs(back[k] - e)).toBeLessThan(0.12);
    }
  });

  // The thumb blends joint positions between tucked and out, so mid-range is a
  // visual blend, not a calibrated extension. Only the endpoints are exact.
  it('thumb endpoints read as tucked and out', () => {
    const t = (e: number) => computeFingers(handLandmarks({ fingers: { thumb: e, index: 0, middle: 0, ring: 0, pinky: 0 } })).thumb;
    expect(t(0)).toBeLessThan(0.35);
    expect(t(1)).toBeGreaterThan(0.9);
  });

  it('roll matches computeRoll', () => {
    const f: FingerState = { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 };
    for (const r of [-1.2, -0.3, 0, 0.5, 1.4]) {
      expect(computeRoll(handLandmarks({ fingers: f, roll: r }))).toBeCloseTo(r, 6);
    }
  });
});
