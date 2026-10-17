// Parametric hand: finger extensions (+ roll) in, 21 world-space landmarks out.
// Same frame and anatomy the tracker uses, so computeFingers(handLandmarks(f))
// comes back close to f. Drives the app hand, and builds synthetic hands for tests.
//
// Models a physical RIGHT hand, palm toward the camera, fingers up, in
// MediaPipe world coordinates (+x image right, +y down, +z away). Fingers
// flex toward -z (toward the camera, over the palm).

import type { HandLandmark } from '../handTracking';
import type { FingerState } from './handGeometry';

type V = HandLandmark;
const v = (x: number, y: number, z: number): V => ({ x, y, z });
const add = (a: V, b: V): V => v(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: V, s: number): V => v(a.x * s, a.y * s, a.z * s);
const lerp = (a: V, b: V, t: number): V => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
const norm = (a: V): V => scale(a, 1 / Math.hypot(a.x, a.y, a.z));
const DEG = Math.PI / 180;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface FingerFlex { mcp: number; pip: number; dip: number } // degrees

const FINGERS = [
  { base: v(0.025, -0.09, 0), lens: [0.04, 0.025, 0.02] },   // index
  { base: v(0, -0.095, 0), lens: [0.045, 0.028, 0.022] },    // middle
  { base: v(-0.02, -0.09, 0), lens: [0.042, 0.026, 0.021] }, // ring
  { base: v(-0.04, -0.08, 0), lens: [0.032, 0.02, 0.018] },  // pinky
];

/** Joint split of a finger's total flex, from typical curl. */
const FLEX_SPLIT = [85, 100, 60];
const FLEX_SPLIT_SUM = FLEX_SPLIT.reduce((a, b) => a + b, 0);

const dirAt = (theta: number) => v(0, -Math.cos(theta), -Math.sin(theta));

export function fingerFromFlex(i: number, f: FingerFlex): V[] {
  const { base, lens } = FINGERS[i];
  let a = f.mcp * DEG;
  const pip = add(base, scale(dirAt(a), lens[0]));
  a += f.pip * DEG;
  const dip = add(pip, scale(dirAt(a), lens[1]));
  a += f.dip * DEG;
  const tip = add(dip, scale(dirAt(a), lens[2]));
  return [base, pip, dip, tip];
}

/** Flex angles for an extension value, matched to handGeometry's scale. */
export function flexForExtension(ext: number): FingerFlex {
  // handGeometry maps total bend 25..220 deg to extension 1..0; about 10 deg
  // of that comes from the knuckle offset, the rest is joint flex.
  const total = Math.max(0, 25 + 195 * (1 - clamp01(ext)) - 10);
  return {
    mcp: (total * FLEX_SPLIT[0]) / FLEX_SPLIT_SUM,
    pip: (total * FLEX_SPLIT[1]) / FLEX_SPLIT_SUM,
    dip: (total * FLEX_SPLIT[2]) / FLEX_SPLIT_SUM,
  };
}

const THUMB_CMC = v(0.02, -0.025, -0.005);
/** Folded across the front of a fist, tip resting on the curled index/middle. */
const THUMB_TUCKED: V[] = [THUMB_CMC, v(0.03, -0.05, -0.02), v(0.012, -0.065, -0.035), v(-0.005, -0.07, -0.04)];

function thumbAlong(dir: V): V[] {
  const d = norm(dir);
  const mcp = add(THUMB_CMC, scale(d, 0.04));
  const ip = add(mcp, scale(d, 0.032));
  return [THUMB_CMC, mcp, ip, add(ip, scale(d, 0.028))];
}
/** Abducted out to the side, perpendicular to the hand axis (the thumbs-up thumb). */
export const THUMB_OUT = thumbAlong(v(1, -0.2, -0.1));
/** Out but angled up beside the index (relaxed open hand). */
export const THUMB_OPEN = thumbAlong(v(1, -1, -0.2));

export function thumbFromExtension(ext: number, out: V[] = THUMB_OUT): V[] {
  const t = clamp01(ext);
  return THUMB_TUCKED.map((p, i) => lerp(p, out[i], t));
}

export interface HandPose {
  fingers: FingerState;
  /** Rotation in the image plane, radians, same sign as computeRoll. */
  roll?: number;
}

/** Rotate rigidly about the wrist by Euler angles (radians). */
export function rotate(w: V[], rx: number, ry: number, rz: number): V[] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  return w.map(p => {
    let { x, y, z } = p;
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return v(x, y, z);
  });
}

export function handFromFlex(flex: [FingerFlex, FingerFlex, FingerFlex, FingerFlex], thumb: V[]): V[] {
  return [v(0, 0, 0), ...thumb, ...flex.flatMap((f, i) => fingerFromFlex(i, f))];
}

/** 21 world landmarks for a pose. */
export function handLandmarks(pose: HandPose): V[] {
  const f = pose.fingers;
  const w = handFromFlex(
    [flexForExtension(f.index), flexForExtension(f.middle), flexForExtension(f.ring), flexForExtension(f.pinky)],
    thumbFromExtension(f.thumb),
  );
  // computeRoll is measured in the user's mirrored view, so image-plane
  // rotation is the negative of roll.
  return pose.roll ? rotate(w, 0, 0, -pose.roll) : w;
}
