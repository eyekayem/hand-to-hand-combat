// Shared hand geometry. Single source of truth for finger extension,
// orientation and pose vectors, used by both the arena and Gesture Studio.
//
// All shape measurements use MediaPipe *world* landmarks (metric, centered on
// the hand), so they don't change with distance to camera, frame aspect ratio
// or where the hand sits in frame. Image landmarks are only used for screen
// position.
//
// Coordinate frame (world landmarks, unmirrored webcam):
//   +x = image right (the user's LEFT), +y = down, +z = away from camera.

import type { HandLandmark, TrackedHand } from '../handTracking';

export const L = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
} as const;

export type Vec3 = { x: number; y: number; z: number };
export type PhysicalHand = 'left' | 'right';
export type PalmFacing = 'camera' | 'away' | 'left' | 'right' | 'up' | 'down';

export interface FingerState {
  thumb: number;  // 0 = curled, 1 = extended
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export interface HandGeometry {
  hand: PhysicalHand;
  fingers: FingerState;
  /** Unit vector pointing out of the palm. */
  palmNormal: Vec3;
  palmFacing: PalmFacing;
  /** Roll in the image plane, radians. 0 = fingers up, + = clockwise on screen (user view). */
  roll: number;
  /** Unit vector from thumb MCP to thumb tip. Used for thumbs up/down. */
  thumbDirection: Vec3;
  /** Wrist to middle MCP length in metres; the scale reference. */
  handScale: number;
}

// ---------- vector helpers ----------
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3) => Math.sqrt(dot(a, a));
export const dist = (a: Vec3, b: Vec3) => len(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const DEG = Math.PI / 180;

/** Bend at joint b in the chain a-b-c, radians. 0 = straight, PI = folded back. */
export function bendAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const u = normalize(sub(b, a));
  const v = normalize(sub(c, b));
  return Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
}

/** Smallest signed difference a - b, wrapped into (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * MediaPipe labels handedness as if the frame were mirrored (selfie view).
 * We feed it the raw, unmirrored webcam frame, so the label is swapped.
 */
export function physicalHandFromLabel(label: 'Left' | 'Right'): PhysicalHand {
  return label === 'Left' ? 'right' : 'left';
}

// ---------- finger extension ----------
// Total bend across MCP + PIP + DIP. A straight finger sits around 10 to 25 deg
// (natural curve), a full fist around 230 to 280 deg.
const FINGER_BEND_STRAIGHT = 25 * DEG;
const FINGER_BEND_CURLED = 220 * DEG;

export function fingerExtension(w: HandLandmark[], mcp: number, pip: number, dip: number, tip: number): number {
  const wrist = w[L.WRIST];
  const bend =
    bendAngle(wrist, w[mcp], w[pip]) +
    bendAngle(w[mcp], w[pip], w[dip]) +
    bendAngle(w[pip], w[dip], w[tip]);
  return clamp01(1 - (bend - FINGER_BEND_STRAIGHT) / (FINGER_BEND_CURLED - FINGER_BEND_STRAIGHT));
}

// Thumb: combine straightness (MCP + IP bend) with reach (tip distance from the
// index knuckle, relative to hand size). Reach separates "thumb tucked across
// the palm" from "thumb out", which bend alone can't, because a tucked thumb
// can still be fairly straight.
// These are first-pass values from hand anatomy; calibrate against real
// captures (Studio shows the live numbers).
export const THUMB_BEND_STRAIGHT = 20 * DEG;
export const THUMB_BEND_CURLED = 110 * DEG;
export const THUMB_REACH_IN = 0.5;   // tip resting on the curled index/middle (fist)
export const THUMB_REACH_OUT = 0.85; // tip well clear of the index knuckle

export function thumbExtension(w: HandLandmark[], handScale: number): number {
  const bend =
    bendAngle(w[L.THUMB_CMC], w[L.THUMB_MCP], w[L.THUMB_IP]) +
    bendAngle(w[L.THUMB_MCP], w[L.THUMB_IP], w[L.THUMB_TIP]);
  const straight = clamp01(1 - (bend - THUMB_BEND_STRAIGHT) / (THUMB_BEND_CURLED - THUMB_BEND_STRAIGHT));
  const reach = dist(w[L.THUMB_TIP], w[L.INDEX_MCP]) / Math.max(handScale, 1e-6);
  const out = clamp01((reach - THUMB_REACH_IN) / (THUMB_REACH_OUT - THUMB_REACH_IN));
  // Reach dominates: it is the more reliable signal under self-occlusion.
  return clamp01(0.35 * straight + 0.65 * out);
}

export function computeFingers(w: HandLandmark[]): FingerState {
  const handScale = dist(w[L.WRIST], w[L.MIDDLE_MCP]);
  return {
    thumb: thumbExtension(w, handScale),
    index: fingerExtension(w, L.INDEX_MCP, L.INDEX_PIP, L.INDEX_DIP, L.INDEX_TIP),
    middle: fingerExtension(w, L.MIDDLE_MCP, L.MIDDLE_PIP, L.MIDDLE_DIP, L.MIDDLE_TIP),
    ring: fingerExtension(w, L.RING_MCP, L.RING_PIP, L.RING_DIP, L.RING_TIP),
    pinky: fingerExtension(w, L.PINKY_MCP, L.PINKY_PIP, L.PINKY_DIP, L.PINKY_TIP),
  };
}

// ---------- orientation ----------
/** Unit normal pointing out of the palm, correct for either hand. */
export function palmNormal(w: HandLandmark[], hand: PhysicalHand): Vec3 {
  const n = cross(sub(w[L.INDEX_MCP], w[L.WRIST]), sub(w[L.PINKY_MCP], w[L.WRIST]));
  // For a right hand, (index - wrist) x (pinky - wrist) points out of the palm.
  // A left hand is the mirror image, so the same product points out of the back.
  return normalize(hand === 'right' ? n : { x: -n.x, y: -n.y, z: -n.z });
}

/** Dominant direction of the palm normal, named from the user's point of view. */
export function classifyPalmFacing(n: Vec3): PalmFacing {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  if (az >= ax && az >= ay) return n.z < 0 ? 'camera' : 'away';
  if (ay >= ax) return n.y < 0 ? 'up' : 'down';
  // +x is image right, which is the user's left.
  return n.x > 0 ? 'left' : 'right';
}

export function computeRoll(w: HandLandmark[]): number {
  const d = sub(w[L.MIDDLE_MCP], w[L.WRIST]);
  // Negate x so the angle reads in the user's (mirrored) view.
  return Math.atan2(-d.x, -d.y);
}

export function computeGeometry(tracked: TrackedHand): HandGeometry {
  const w = tracked.worldLandmarks;
  const hand = physicalHandFromLabel(tracked.handedness);
  const normal = palmNormal(w, hand);
  return {
    hand,
    fingers: computeFingers(w),
    palmNormal: normal,
    palmFacing: classifyPalmFacing(normal),
    roll: computeRoll(w),
    thumbDirection: normalize(sub(w[L.THUMB_TIP], w[L.THUMB_MCP])),
    handScale: dist(w[L.WRIST], w[L.MIDDLE_MCP]),
  };
}

// ---------- pose vectors for matching ----------
/**
 * Wrist-centred, scale-normalised world landmarks as a flat 63-vector.
 * Left hands are mirrored in x so one template covers both hands.
 * Orientation is kept on purpose: thumbs up and thumbs down should differ.
 */
export function poseVector(w: HandLandmark[], hand: PhysicalHand): number[] {
  const wrist = w[L.WRIST];
  const scale = Math.max(dist(wrist, w[L.MIDDLE_MCP]), 1e-6);
  const mx = hand === 'left' ? -1 : 1;
  const out: number[] = new Array(63);
  for (let i = 0; i < 21; i++) {
    out[i * 3] = (mx * (w[i].x - wrist.x)) / scale;
    out[i * 3 + 1] = (w[i].y - wrist.y) / scale;
    out[i * 3 + 2] = (w[i].z - wrist.z) / scale;
  }
  return out;
}

/**
 * Hand shape as a 63-vector in the hand's own frame (origin at wrist, y along
 * wrist to middle knuckle, z out of the palm), scale-normalised. Invariant to
 * where the hand points and to which hand it is, so it captures the shape of
 * the gesture only. Orientation is compared separately.
 */
export function shapeVector(w: HandLandmark[], hand: PhysicalHand): number[] {
  const pts = hand === 'left' ? w.map(p => ({ x: -p.x, y: p.y, z: p.z })) : w;
  const wrist = pts[L.WRIST];
  const scale = Math.max(dist(wrist, pts[L.MIDDLE_MCP]), 1e-6);
  const ey = normalize(sub(pts[L.MIDDLE_MCP], wrist));
  const n = palmNormal(pts, 'right');
  // Re-orthogonalise the palm normal against the hand axis.
  const ez = normalize(sub(n, { x: ey.x * dot(n, ey), y: ey.y * dot(n, ey), z: ey.z * dot(n, ey) }));
  const ex = cross(ey, ez);
  const out: number[] = new Array(63);
  for (let i = 0; i < 21; i++) {
    const d = sub(pts[i], wrist);
    out[i * 3] = dot(d, ex) / scale;
    out[i * 3 + 1] = dot(d, ey) / scale;
    out[i * 3 + 2] = dot(d, ez) / scale;
  }
  return out;
}

/** Unit vector from wrist to middle knuckle, mirrored for left hands. */
export function handAxis(w: HandLandmark[], hand: PhysicalHand): Vec3 {
  const a = normalize(sub(w[L.MIDDLE_MCP], w[L.WRIST]));
  return hand === 'left' ? { x: -a.x, y: a.y, z: a.z } : a;
}

export function poseDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s / 21); // RMS per landmark, in hand-scale units
}

/** Pick the hand to treat as primary: physical right if present, else the first. */
export function pickPrimaryHand(hands: TrackedHand[]): TrackedHand | null {
  if (hands.length === 0) return null;
  return hands.find(h => physicalHandFromLabel(h.handedness) === 'right') ?? hands[0];
}
