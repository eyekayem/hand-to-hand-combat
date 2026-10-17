// Continuous motion features for the gesture graph.
import { smoothstep } from './gestureGraph';

/**
 * Wave strength 0..1 from side-to-side direction reversals of the hand in a
 * short window. Rises with each reversal instead of firing on a count, so the
 * graph can start answering on the first swing.
 */
export class WaveMeter {
  private pts: { x: number; t: number }[] = [];

  constructor(public windowMs = 900, public minSwing = 0.02) {}

  update(x: number, t: number): number {
    this.pts.push({ x, t });
    while (this.pts.length && t - this.pts[0].t > this.windowMs) this.pts.shift();

    // Count reversals with hysteresis: a swing only counts once it travels minSwing.
    let reversals = 0;
    let dir = 0;
    let anchor = this.pts[0]?.x ?? x;
    for (const p of this.pts) {
      const d = p.x - anchor;
      if (Math.abs(d) >= this.minSwing) {
        const nd = Math.sign(d);
        if (dir !== 0 && nd !== dir) reversals++;
        dir = nd;
        anchor = p.x;
      } else if (dir !== 0 && Math.sign(d) === dir) {
        // Still moving the same way: keep the anchor at the extreme.
        anchor = dir > 0 ? Math.max(anchor, p.x) : Math.min(anchor, p.x);
      }
    }
    return smoothstep(0.5, 2.5, reversals);
  }

  reset() {
    this.pts = [];
  }
}
