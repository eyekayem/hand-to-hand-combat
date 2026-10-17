// Arena feature extraction: built-in gestures from the shared hand geometry.
// Finger values come from handGeometry (world landmarks, joint angles), the
// same numbers Gesture Studio shows, so the two can't drift apart.

import type { TrackedHand } from './handTracking';
import { computeGeometry, type HandGeometry, type PhysicalHand } from './hand/handGeometry';

export interface HandFeatures {
  handOpenness: number;
  isFist: boolean;
  isOpenHand: boolean;
  isThumbsUp: boolean;
  isPeaceSign: boolean;
  isPoint: boolean;
  isWaving: boolean;

  thumbExtension: number;
  indexExtension: number;
  middleExtension: number;
  ringExtension: number;
  pinkyExtension: number;

  handSpeed: number;
  center: { x: number; y: number };
  detectedGesture: string;
  isStable: boolean; // Hand is relatively still
  geometry: HandGeometry;
}

export interface GestureThresholds {
  extended: number; // a finger above this counts as out
  curled: number;   // a finger below this counts as in
  thumbOut: number;
  thumbUpDot: number; // thumb direction . up must exceed this for THUMBS_UP
}

export const DEFAULT_THRESHOLDS: GestureThresholds = { extended: 0.65, curled: 0.35, thumbOut: 0.7, thumbUpDot: 0.6 };

interface PositionSample { x: number; y: number; t: number }

const MAX_HISTORY = 20;
let history: PositionSample[] = [];
let historyHand: PhysicalHand | null = null;

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function classifyBuiltIn(g: HandGeometry, th: GestureThresholds = DEFAULT_THRESHOLDS) {
  const f = g.fingers;
  const out = (v: number) => v > th.extended;
  const inn = (v: number) => v < th.curled;
  const fourIn = inn(f.index) && inn(f.middle) && inn(f.ring) && inn(f.pinky);
  // World y is down, so "up" is -y.
  const thumbPointsUp = -g.thumbDirection.y > th.thumbUpDot;
  return {
    isFist: fourIn && f.thumb < th.thumbOut,
    isOpenHand: out(f.index) && out(f.middle) && out(f.ring) && out(f.pinky),
    isThumbsUp: fourIn && f.thumb > th.thumbOut && thumbPointsUp,
    isPeaceSign: out(f.index) && out(f.middle) && inn(f.ring) && inn(f.pinky),
    isPoint: out(f.index) && inn(f.middle) && inn(f.ring) && inn(f.pinky),
  };
}

export function extractFeatures(hand: TrackedHand, timestamp: number, thresholds: GestureThresholds = DEFAULT_THRESHOLDS): HandFeatures {
  const geometry = computeGeometry(hand);
  const f = geometry.fingers;
  const handOpenness = (f.thumb + f.index + f.middle + f.ring + f.pinky) / 5;
  const checks = classifyBuiltIn(geometry, thresholds);

  // Motion history is per physical hand; a swap starts a fresh history.
  if (historyHand !== geometry.hand) {
    history = [];
    historyHand = geometry.hand;
  }
  const lm = hand.landmarks;
  const center = {
    x: lm.reduce((s, p) => s + p.x, 0) / lm.length,
    y: lm.reduce((s, p) => s + p.y, 0) / lm.length,
  };
  history.push({ ...center, t: timestamp });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  let handSpeed = 0;
  if (history.length >= 2) {
    const a = history[history.length - 2], b = history[history.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt > 0) handSpeed = distance2D(a, b) / dt;
  }

  let isWaving = false;
  if (checks.isOpenHand && history.length >= 8) {
    const recent = history.slice(-8);
    let changes = 0, lastDir = 0;
    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i - 1].x;
      if (Math.abs(dx) > 0.008) {
        const dir = dx > 0 ? 1 : -1;
        if (lastDir !== 0 && dir !== lastDir) changes++;
        lastDir = dir;
      }
    }
    isWaving = changes >= 2;
  }

  let isStable = false;
  if (history.length >= 5) {
    const recent = history.slice(-5);
    let moved = 0;
    for (let i = 1; i < recent.length; i++) moved += distance2D(recent[i], recent[i - 1]);
    isStable = moved < 0.03;
  }

  let detectedGesture = 'NONE';
  if (isWaving) detectedGesture = 'WAVE';
  else if (checks.isThumbsUp) detectedGesture = 'THUMBS_UP';
  else if (checks.isPeaceSign) detectedGesture = 'PEACE';
  else if (checks.isPoint) detectedGesture = 'POINT';
  else if (checks.isFist) detectedGesture = 'FIST';
  else if (checks.isOpenHand) detectedGesture = 'OPEN';

  return {
    handOpenness,
    ...checks,
    isWaving,
    thumbExtension: f.thumb,
    indexExtension: f.index,
    middleExtension: f.middle,
    ringExtension: f.ring,
    pinkyExtension: f.pinky,
    handSpeed,
    center,
    detectedGesture,
    isStable,
    geometry,
  };
}

export function resetFeatureHistory(): void {
  history = [];
  historyHand = null;
}
