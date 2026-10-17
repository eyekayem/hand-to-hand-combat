// Gesture templates, matching and sequencing.
//
// A gesture is two positions (start and end). Each position stores many
// captured frames, not one, so matching is nearest-sample on hand SHAPE
// (rotation-invariant) blended with a separate ORIENTATION score.
// A "static" gesture is just one whose two positions are the same shape.

import type { TrackedHand } from './handTracking';
import {
  type FingerState, type PalmFacing, type Vec3, type HandGeometry,
  computeGeometry, shapeVector, handAxis, poseDistance, classifyPalmFacing,
  normalize, dot, angleDiff,
} from './hand/handGeometry';

export type { FingerState } from './hand/handGeometry';

export const GESTURE_FORMAT_VERSION = 2;

export interface HandOrientation {
  palmFacing: PalmFacing;
  rotation: number; // roll, radians (see computeRoll)
  tilt: number;     // reserved
}

/** One processed tracking frame. Axis and normal are mirrored for left hands. */
export interface HandFrame {
  geometry: HandGeometry;
  shape: number[];
  axis: Vec3;
  normal: Vec3;
  orientation: HandOrientation;
  t: number;
}

export interface GesturePosition {
  fingerState: FingerState;   // mean over samples, for display
  orientation: HandOrientation;
  samples: number[][];        // shape vectors
  axis: Vec3;                 // mean, mirrored-for-left frame
  normal: Vec3;
}

export interface TrainedGesture {
  version: typeof GESTURE_FORMAT_VERSION;
  id: string;
  name: string;
  description?: string;
  position1: GesturePosition;
  position2: GesturePosition;
  transitionMs: number;
  /** 0 = shape only, 1 = orientation only. */
  orientationWeight: number;
  hand: 'left' | 'right' | 'both';
  createdAt: number;
}

export interface GestureMatch {
  gestureId: string;
  gestureName: string;
  confidence: number;
  matchedPosition: 1 | 2;
  fingerMatchScores: FingerState;
  shapeScore: number;
  orientationScore: number;
}

// ---------- tuning ----------
/** RMS shape distance (hand-scale units) at which shape score hits 0. */
export const SHAPE_RANGE = 0.35;
/** Mean angular error at which orientation score hits 0. */
export const ORIENT_RANGE = (60 * Math.PI) / 180;
export const MATCH_FLOOR = 0.6;
export const K_NEAREST = 3;
export const DEFAULT_ORIENTATION_WEIGHT = 0.25;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const angleBetween = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, Math.max(-1, dot(a, b))));

export function buildFrame(tracked: TrackedHand, t: number): HandFrame {
  const geometry = computeGeometry(tracked);
  const w = tracked.worldLandmarks;
  const n = geometry.palmNormal;
  const normal = geometry.hand === 'left' ? { x: -n.x, y: n.y, z: n.z } : n;
  return {
    geometry,
    shape: shapeVector(w, geometry.hand),
    axis: handAxis(w, geometry.hand),
    normal,
    orientation: { palmFacing: geometry.palmFacing, rotation: geometry.roll, tilt: 0 },
    t,
  };
}

// ---------- capture ----------
export function positionFromFrames(frames: HandFrame[]): GesturePosition {
  if (frames.length === 0) throw new Error('positionFromFrames: no frames');
  const n = frames.length;
  const mean = (k: keyof FingerState) => frames.reduce((s, f) => s + f.geometry.fingers[k], 0) / n;
  const sumV = (pick: (f: HandFrame) => Vec3) =>
    normalize(frames.reduce((s, f) => {
      const v = pick(f);
      return { x: s.x + v.x, y: s.y + v.y, z: s.z + v.z };
    }, { x: 0, y: 0, z: 0 }));
  const roll = Math.atan2(
    frames.reduce((s, f) => s + Math.sin(f.orientation.rotation), 0),
    frames.reduce((s, f) => s + Math.cos(f.orientation.rotation), 0),
  );
  const normal = sumV(f => f.normal);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    fingerState: { thumb: r2(mean('thumb')), index: r2(mean('index')), middle: r2(mean('middle')), ring: r2(mean('ring')), pinky: r2(mean('pinky')) },
    orientation: { palmFacing: classifyPalmFacing(normal), rotation: roll, tilt: 0 },
    samples: frames.map(f => f.shape),
    axis: sumV(f => f.axis),
    normal,
  };
}

// ---------- matching ----------
export function scorePosition(frame: HandFrame, pos: GesturePosition, orientationWeight: number) {
  const ds = pos.samples.map(s => poseDistance(frame.shape, s)).sort((a, b) => a - b);
  const k = Math.min(K_NEAREST, ds.length);
  const d = ds.slice(0, k).reduce((s, v) => s + v, 0) / Math.max(k, 1);
  const shapeScore = clamp01(1 - d / SHAPE_RANGE);
  const err = (angleBetween(frame.axis, pos.axis) + angleBetween(frame.normal, pos.normal)) / 2;
  const orientationScore = clamp01(1 - err / ORIENT_RANGE);
  const w = clamp01(orientationWeight);
  return { score: (1 - w) * shapeScore + w * orientationScore, shapeScore, orientationScore };
}

export function matchGesture(frame: HandFrame, gesture: TrainedGesture): GestureMatch | null {
  const w = gesture.orientationWeight ?? DEFAULT_ORIENTATION_WEIGHT;
  const s1 = scorePosition(frame, gesture.position1, w);
  const s2 = scorePosition(frame, gesture.position2, w);
  const best = s1.score >= s2.score ? 1 : 2;
  const s = best === 1 ? s1 : s2;
  if (s.score < MATCH_FLOOR) return null;
  return {
    gestureId: gesture.id,
    gestureName: gesture.name,
    confidence: s.score,
    matchedPosition: best,
    fingerMatchScores: (best === 1 ? gesture.position1 : gesture.position2).fingerState,
    shapeScore: s.shapeScore,
    orientationScore: s.orientationScore,
  };
}

export function matchAll(frame: HandFrame, gestures: TrainedGesture[]): GestureMatch[] {
  return gestures
    .filter(g => g.hand === 'both' || g.hand === frame.geometry.hand)
    .map(g => matchGesture(frame, g))
    .filter((m): m is GestureMatch => m !== null)
    .sort((a, b) => b.confidence - a.confidence);
}

/** True when both positions are effectively the same pose (a held gesture). */
export function isStaticGesture(g: TrainedGesture): boolean {
  const a = g.position1, b = g.position2;
  const d = poseDistance(a.samples[0], b.samples[0]);
  const rot = Math.abs(angleDiff(a.orientation.rotation, b.orientation.rotation));
  return d < SHAPE_RANGE * 0.3 && rot < Math.PI / 12;
}

// ---------- sequencing ----------
export interface SequencerOptions {
  enter: number;   // confidence to count a position as hit
  holdMs: number;  // static gestures: continuous hold before firing
  slackMs: number; // extra time allowed beyond transitionMs for p1 -> p2
  cooldownMs: number;
}

export const DEFAULT_SEQUENCER: SequencerOptions = { enter: 0.72, holdMs: 350, slackMs: 600, cooldownMs: 1200 };

/**
 * Turns per-frame matches into discrete gesture events.
 * Dynamic gesture: position 1 seen, then position 2 within transitionMs + slack.
 * Static gesture: position held continuously for holdMs.
 */
export class GestureSequencer {
  private armedAt = new Map<string, number>();
  private holdStart = new Map<string, number>();
  private lastFired = new Map<string, number>();

  constructor(private opts: SequencerOptions = DEFAULT_SEQUENCER) {}

  update(frame: HandFrame | null, gestures: TrainedGesture[], t: number): TrainedGesture[] {
    const fired: TrainedGesture[] = [];
    for (const g of gestures) {
      if (t - (this.lastFired.get(g.id) ?? -Infinity) < this.opts.cooldownMs) continue;
      if (!frame || !(g.hand === 'both' || g.hand === frame.geometry.hand)) {
        this.holdStart.delete(g.id);
        continue;
      }
      const w = g.orientationWeight ?? DEFAULT_ORIENTATION_WEIGHT;
      const hit1 = scorePosition(frame, g.position1, w).score >= this.opts.enter;
      const hit2 = scorePosition(frame, g.position2, w).score >= this.opts.enter;

      if (isStaticGesture(g)) {
        if (hit1 || hit2) {
          const start = this.holdStart.get(g.id) ?? t;
          this.holdStart.set(g.id, start);
          if (t - start >= this.opts.holdMs) fired.push(this.fire(g, t));
        } else {
          this.holdStart.delete(g.id);
        }
        continue;
      }

      const armed = this.armedAt.get(g.id);
      if (armed !== undefined && hit2 && !hit1) {
        if (t - armed <= g.transitionMs + this.opts.slackMs) fired.push(this.fire(g, t));
        else this.armedAt.delete(g.id);
      } else if (hit1) {
        this.armedAt.set(g.id, t);
      } else if (armed !== undefined && t - armed > g.transitionMs + this.opts.slackMs) {
        this.armedAt.delete(g.id);
      }
    }
    return fired;
  }

  private fire(g: TrainedGesture, t: number) {
    this.lastFired.set(g.id, t);
    this.armedAt.delete(g.id);
    this.holdStart.delete(g.id);
    return g;
  }

  reset() {
    this.armedAt.clear();
    this.holdStart.clear();
    this.lastFired.clear();
  }
}

// ---------- persistence ----------
export function isCurrentGesture(x: unknown): x is TrainedGesture {
  const g = x as TrainedGesture;
  const posOk = (p: GesturePosition | undefined) =>
    !!p && Array.isArray(p.samples) && p.samples.length > 0 && p.samples.every(s => Array.isArray(s) && s.length === 63);
  return !!g && g.version === GESTURE_FORMAT_VERSION && typeof g.id === 'string' && typeof g.name === 'string'
    && posOk(g.position1) && posOk(g.position2);
}

/** Splits unknown JSON into valid current-format gestures and a count of rejected entries. */
export function parseGestures(raw: unknown): { gestures: TrainedGesture[]; rejected: number } {
  if (!Array.isArray(raw)) return { gestures: [], rejected: 0 };
  const gestures = raw.filter(isCurrentGesture);
  return { gestures, rejected: raw.length - gestures.length };
}

export function generateGestureId(): string {
  return `gesture_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
