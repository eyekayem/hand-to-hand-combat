import { describe, it, expect } from 'vitest';
import { OneEuroFilter, IMAGE_ONE_EURO, WORLD_ONE_EURO, type OneEuroParams } from '@/lib/hand/oneEuro';

// Lag in ms while tracking a steady ramp sampled at 30 fps.
function lagMs(p: OneEuroParams, unitsPerSec: number) {
  const f = new OneEuroFilter(p);
  let out = 0, t = 0;
  for (; t <= 400; t += 1000 / 30) out = f.filter((unitsPerSec * t) / 1000, t);
  t -= 1000 / 30;
  return ((unitsPerSec * t) / 1000 - out) / unitsPerSec * 1000;
}

// Fraction of +-amp alternating noise that survives at rest.
function restJitter(p: OneEuroParams, amp: number) {
  const f = new OneEuroFilter(p);
  let worst = 0;
  for (let i = 0, t = 0; t <= 2000; t += 1000 / 30, i++) {
    const v = f.filter((i % 2 ? 1 : -1) * amp, t);
    if (t > 500) worst = Math.max(worst, Math.abs(v));
  }
  return worst / amp;
}

describe('landmark smoothing budget', () => {
  it('image coords: under 30 ms lag on a moving hand, rest jitter under 25%', () => {
    expect(lagMs(IMAGE_ONE_EURO, 1.5)).toBeLessThan(30);
    expect(restJitter(IMAGE_ONE_EURO, 0.002)).toBeLessThan(0.25);
  });

  it('world coords: under 30 ms lag on a moving hand, rest jitter under 25%', () => {
    expect(lagMs(WORLD_ONE_EURO, 0.5)).toBeLessThan(30);
    expect(restJitter(WORLD_ONE_EURO, 0.001)).toBeLessThan(0.25);
  });
});
