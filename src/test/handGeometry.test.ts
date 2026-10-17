import { describe, it, expect } from 'vitest';
import {
  computeFingers, palmNormal, classifyPalmFacing, angleDiff, poseVector, poseDistance,
  physicalHandFromLabel, computeGeometry, computeRoll,
} from '@/lib/hand/handGeometry';
import type { TrackedHand } from '@/lib/handTracking';
import { rightHand, mirror, rotate, OPEN, CURLED } from './syntheticHand';

const open = rightHand([OPEN, OPEN, OPEN, OPEN], 'out');
const fist = rightHand([CURLED, CURLED, CURLED, CURLED], 'tucked');
const thumbsUp = rightHand([CURLED, CURLED, CURLED, CURLED], 'up');
const peace = rightHand([OPEN, OPEN, CURLED, CURLED], 'tucked');

describe('finger extension', () => {
  it('reads an open hand as extended', () => {
    const f = computeFingers(open);
    for (const k of ['index', 'middle', 'ring', 'pinky'] as const) expect(f[k]).toBeGreaterThan(0.85);
    expect(f.thumb).toBeGreaterThan(0.6);
  });

  it('reads a fist as curled, thumb included', () => {
    const f = computeFingers(fist);
    for (const k of ['index', 'middle', 'ring', 'pinky'] as const) expect(f[k]).toBeLessThan(0.15);
    expect(f.thumb).toBeLessThan(0.35);
  });

  it('separates thumbs-up from fist on the thumb alone', () => {
    const up = computeFingers(thumbsUp);
    const fs = computeFingers(fist);
    expect(up.thumb).toBeGreaterThan(0.8);
    expect(up.thumb - fs.thumb).toBeGreaterThan(0.5);
    expect(up.index).toBeLessThan(0.15);
  });

  it('reads peace sign per finger', () => {
    const f = computeFingers(peace);
    expect(f.index).toBeGreaterThan(0.85);
    expect(f.middle).toBeGreaterThan(0.85);
    expect(f.ring).toBeLessThan(0.15);
    expect(f.pinky).toBeLessThan(0.15);
  });

  it('is invariant to hand rotation and handedness', () => {
    const base = computeFingers(thumbsUp);
    for (const w of [rotate(thumbsUp, 0.4, -0.9, 1.6), rotate(thumbsUp, 1.2, 0.3, -2.5), mirror(thumbsUp)]) {
      const f = computeFingers(w);
      for (const k of Object.keys(base) as (keyof typeof base)[]) expect(f[k]).toBeCloseTo(base[k], 6);
    }
  });

  it('is invariant to hand size', () => {
    const big = open.map(p => ({ x: p.x * 1.3, y: p.y * 1.3, z: p.z * 1.3 }));
    const a = computeFingers(open), b = computeFingers(big);
    expect(b.thumb).toBeCloseTo(a.thumb, 6);
    expect(b.index).toBeCloseTo(a.index, 6);
  });
});

describe('orientation', () => {
  it('right hand palm to camera faces camera', () => {
    expect(classifyPalmFacing(palmNormal(open, 'right'))).toBe('camera');
  });

  it('left hand palm to camera also faces camera (handedness-corrected)', () => {
    expect(classifyPalmFacing(palmNormal(mirror(open), 'left'))).toBe('camera');
  });

  it('turning the hand around reads as away', () => {
    expect(classifyPalmFacing(palmNormal(rotate(open, 0, Math.PI, 0), 'right'))).toBe('away');
  });

  it('roll is 0 for fingers up and grows clockwise in the user view', () => {
    expect(computeRoll(open)).toBeCloseTo(0, 6);
    // rz = -0.3 tilts fingers toward image -x, which is the user's right in a mirrored view.
    expect(computeRoll(rotate(open, 0, 0, -0.3))).toBeCloseTo(0.3, 6);
    expect(computeRoll(rotate(open, 0, 0, 0.3))).toBeCloseTo(-0.3, 6);
  });

  it('wraps angle differences', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2, 6);
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2, 6);
  });
});

describe('handedness and pose vectors', () => {
  it('maps MediaPipe selfie labels to physical hands', () => {
    expect(physicalHandFromLabel('Left')).toBe('right');
    expect(physicalHandFromLabel('Right')).toBe('left');
  });

  it('mirrored left hand gives the same pose vector as the right', () => {
    expect(poseDistance(poseVector(open, 'right'), poseVector(mirror(open), 'left'))).toBeCloseTo(0, 9);
  });

  it('distinguishes poses by distance', () => {
    const p = (w: typeof open) => poseVector(w, 'right');
    expect(poseDistance(p(fist), p(thumbsUp))).toBeGreaterThan(0.1);
    expect(poseDistance(p(open), p(fist))).toBeGreaterThan(poseDistance(p(fist), p(thumbsUp)));
  });

  it('computeGeometry uses the physical hand', () => {
    const tracked: TrackedHand = { landmarks: open, worldLandmarks: open, handedness: 'Left', confidence: 1 };
    const g = computeGeometry(tracked);
    expect(g.hand).toBe('right');
    expect(g.palmFacing).toBe('camera');
  });
});
