// One Euro filter (Casiez et al. 2012): low lag when the hand moves fast,
// strong smoothing when it is still. Applied per landmark coordinate.

import type { HandLandmark } from '../handTracking';

export interface OneEuroParams {
  minCutoff: number; // Hz. Lower = smoother at rest.
  beta: number;      // Speed coefficient. Higher = less lag on fast motion.
  dCutoff: number;   // Hz, cutoff for the derivative.
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.2, beta: 0.02, dCutoff: 1.0 };

const alpha = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;

  constructor(private p: OneEuroParams = DEFAULT_ONE_EURO) {}

  /** @param tMs timestamp in milliseconds */
  filter(value: number, tMs: number): number {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.t = tMs;
      return value;
    }
    const dt = Math.max((tMs - this.t) / 1000, 1e-3);
    this.t = tMs;
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.p.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }

  reset() {
    this.x = null;
    this.t = null;
    this.dx = 0;
  }
}

/** Smooths a 21-point landmark set. One instance per tracked hand and space. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[];

  constructor(params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.filters = Array.from({ length: 63 }, () => new OneEuroFilter(params));
  }

  smooth(landmarks: HandLandmark[], tMs: number): HandLandmark[] {
    return landmarks.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, tMs),
      y: this.filters[i * 3 + 1].filter(p.y, tMs),
      z: this.filters[i * 3 + 2].filter(p.z, tMs),
    }));
  }

  reset() {
    this.filters.forEach(f => f.reset());
  }
}
