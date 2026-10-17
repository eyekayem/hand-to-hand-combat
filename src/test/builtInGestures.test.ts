import { describe, it, expect, beforeEach } from 'vitest';
import { extractFeatures, resetFeatureHistory } from '@/lib/features';
import type { HandLandmark, TrackedHand } from '@/lib/handTracking';
import { rightHand, rotate, OPEN, CURLED } from './syntheticHand';

const t = (w: HandLandmark[]): TrackedHand => ({ landmarks: w, worldLandmarks: w, handedness: 'Left', confidence: 1 });
const open = rightHand([OPEN, OPEN, OPEN, OPEN], 'out');
const fist = rightHand([CURLED, CURLED, CURLED, CURLED], 'tucked');
const peace = rightHand([OPEN, OPEN, CURLED, CURLED], 'tucked');
const point = rightHand([OPEN, CURLED, CURLED, CURLED], 'tucked');
// A real thumbs-up: fist turned so the thumb (radial side, +x) points up (-y).
const thumbsUp = rotate(rightHand([CURLED, CURLED, CURLED, CURLED], 'up'), 0, 0, -Math.PI / 2);

beforeEach(() => resetFeatureHistory());

describe('built-in arena gestures', () => {
  it.each([
    ['OPEN', open], ['FIST', fist], ['PEACE', peace], ['POINT', point], ['THUMBS_UP', thumbsUp],
  ] as const)('detects %s', (name, w) => {
    expect(extractFeatures(t(w), 0).detectedGesture).toBe(name);
  });

  it('thumb out but pointing down is not THUMBS_UP', () => {
    const down = rotate(thumbsUp, 0, 0, Math.PI);
    expect(extractFeatures(t(down), 0).isThumbsUp).toBe(false);
  });

  it('a fist rotated sideways is still a fist, not a thumbs up', () => {
    expect(extractFeatures(t(rotate(fist, 0, 0, -Math.PI / 2)), 0).detectedGesture).toBe('FIST');
  });
});
