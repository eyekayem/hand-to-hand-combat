// Synthetic world-landmark hands for tests. Models a physical RIGHT hand,
// palm toward the camera, fingers up, in MediaPipe's world frame
// (+x image right, +y down, +z away from camera). Fingers flex toward -z.

import type { HandLandmark } from '@/lib/handTracking';

type V = HandLandmark;
const v = (x: number, y: number, z: number): V => ({ x, y, z });
const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: V, s: number): V => v(a.x * s, a.y * s, a.z * s);
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y, a.z);
  return scale(a, 1 / l);
};
const DEG = Math.PI / 180;

export interface FingerFlex { mcp: number; pip: number; dip: number } // degrees
export type ThumbPose = 'out' | 'tucked' | 'up';

const FINGERS = [
  { base: v(0.025, -0.09, 0), lens: [0.04, 0.025, 0.02] },   // index
  { base: v(0, -0.095, 0), lens: [0.045, 0.028, 0.022] },    // middle
  { base: v(-0.02, -0.09, 0), lens: [0.042, 0.026, 0.021] }, // ring
  { base: v(-0.04, -0.08, 0), lens: [0.032, 0.02, 0.018] },  // pinky
];

const dirAt = (theta: number) => v(0, -Math.cos(theta), -Math.sin(theta));

function finger(i: number, f: FingerFlex): V[] {
  const { base, lens } = FINGERS[i];
  let a = f.mcp * DEG;
  const pip = add(base, scale(dirAt(a), lens[0]));
  a += f.pip * DEG;
  const dip = add(pip, scale(dirAt(a), lens[1]));
  a += f.dip * DEG;
  const tip = add(dip, scale(dirAt(a), lens[2]));
  return [base, pip, dip, tip];
}

function thumb(pose: ThumbPose): V[] {
  const cmc = v(0.02, -0.025, -0.005);
  if (pose === 'tucked') {
    // Folded across the front of a fist, tip resting on the curled index/middle.
    return [cmc, v(0.03, -0.05, -0.02), v(0.012, -0.065, -0.035), v(-0.005, -0.07, -0.04)];
  }
  const d = norm(pose === 'out' ? v(1, -1, -0.2) : v(1, -0.2, -0.1));
  const mcp = add(cmc, scale(d, 0.04));
  const ip = add(mcp, scale(d, 0.032));
  return [cmc, mcp, ip, add(ip, scale(d, 0.028))];
}

export const OPEN: FingerFlex = { mcp: 0, pip: 5, dip: 5 };
export const CURLED: FingerFlex = { mcp: 85, pip: 100, dip: 60 };

export function rightHand(
  flex: [FingerFlex, FingerFlex, FingerFlex, FingerFlex],
  thumbPose: ThumbPose,
): HandLandmark[] {
  return [v(0, 0, 0), ...thumb(thumbPose), ...flex.flatMap((f, i) => finger(i, f))];
}

/** Mirror a right hand into a left hand (x flipped). */
export const mirror = (w: HandLandmark[]) => w.map(p => v(-p.x, p.y, p.z));

/** Rotate rigidly about the wrist by Euler angles (radians). */
export function rotate(w: HandLandmark[], rx: number, ry: number, rz: number): HandLandmark[] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  return w.map(p => {
    let { x, y, z } = p;
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return v(x, y, z);
  });
}
