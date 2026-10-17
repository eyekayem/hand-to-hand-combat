import { describe, it, expect } from 'vitest';
import {
  buildFrame, positionFromFrames, matchAll, GestureSequencer, isStaticGesture, parseGestures,
  GESTURE_FORMAT_VERSION, type TrainedGesture, type HandFrame,
} from '@/lib/gestureTypes';
import type { HandLandmark, TrackedHand } from '@/lib/handTracking';
import { rightHand, mirror, rotate, OPEN, CURLED } from './syntheticHand';

const tracked = (w: HandLandmark[], label: 'Left' | 'Right' = 'Left'): TrackedHand =>
  ({ landmarks: w, worldLandmarks: w, handedness: label, confidence: 1 });
const frame = (w: HandLandmark[], t = 0, label: 'Left' | 'Right' = 'Left') => buildFrame(tracked(w, label), t);

// Small deterministic jitter so captures have several distinct samples.
const jitter = (w: HandLandmark[], seed: number, amt = 0.002) =>
  w.map((p, i) => {
    const r = Math.sin(seed * 97.1 + i * 13.7);
    return { x: p.x + r * amt, y: p.y + Math.cos(r * 5) * amt, z: p.z + r * r * amt };
  });
const capture = (w: HandLandmark[]) => positionFromFrames(Array.from({ length: 12 }, (_, i) => frame(jitter(w, i))));

const open = rightHand([OPEN, OPEN, OPEN, OPEN], 'out');
const fist = rightHand([CURLED, CURLED, CURLED, CURLED], 'tucked');
const thumbsUp = rightHand([CURLED, CURLED, CURLED, CURLED], 'up');
const peace = rightHand([OPEN, OPEN, CURLED, CURLED], 'tucked');

const gesture = (id: string, a: HandLandmark[], b: HandLandmark[] = a, extra: Partial<TrainedGesture> = {}): TrainedGesture => ({
  version: GESTURE_FORMAT_VERSION, id, name: id, position1: capture(a), position2: capture(b),
  transitionMs: 500, orientationWeight: 0.25, hand: 'both', createdAt: 0, ...extra,
});

const library = [gesture('fist', fist), gesture('thumbsUp', thumbsUp), gesture('peace', peace), gesture('open', open)];

describe('matching', () => {
  it('ranks the right gesture first for each pose', () => {
    for (const [w, id] of [[fist, 'fist'], [thumbsUp, 'thumbsUp'], [peace, 'peace'], [open, 'open']] as const) {
      const m = matchAll(frame(jitter(w, 99)), library);
      expect(m[0]?.gestureId).toBe(id);
      expect(m[0].confidence).toBeGreaterThan(0.85);
    }
  });

  it('still matches a tilted hand by shape', () => {
    const m = matchAll(frame(rotate(thumbsUp, 0.25, 0.25, 0)), library);
    expect(m[0]?.gestureId).toBe('thumbsUp');
    // Rotation costs nothing on shape; any gap from 1 is template jitter only.
    const upright = matchAll(frame(thumbsUp), library)[0];
    expect(m[0].shapeScore).toBeCloseTo(upright.shapeScore, 6);
    expect(m[0].orientationScore).toBeLessThan(upright.orientationScore);
  });

  it('a left hand matches a template taught with the right', () => {
    const m = matchAll(frame(mirror(peace), 0, 'Right'), library);
    expect(m[0]?.gestureId).toBe('peace');
  });

  it('respects hand restriction', () => {
    const rightOnly = [gesture('peaceR', peace, peace, { hand: 'right' })];
    expect(matchAll(frame(mirror(peace), 0, 'Right'), rightOnly)).toHaveLength(0);
  });

  it('orientation weight separates thumbs up from thumbs down', () => {
    const down = rotate(thumbsUp, 0, 0, Math.PI);
    const g = [gesture('up', thumbsUp, thumbsUp, { orientationWeight: 0.5 }), gesture('down', down, down, { orientationWeight: 0.5 })];
    expect(matchAll(frame(thumbsUp), g)[0].gestureId).toBe('up');
    expect(matchAll(frame(down), g)[0].gestureId).toBe('down');
  });
});

describe('sequencer', () => {
  const run = (seq: GestureSequencer, frames: [HandFrame | null, number][], g: TrainedGesture[]) =>
    frames.flatMap(([f, t]) => seq.update(f, g, t).map(x => x.id));

  it('fires a static gesture after the hold time, once', () => {
    const g = [gesture('fist', fist)];
    expect(isStaticGesture(g[0])).toBe(true);
    const seq = new GestureSequencer();
    const fired = run(seq, [0, 100, 200, 300, 400, 500, 600].map(t => [frame(fist, t), t] as [HandFrame, number]), g);
    expect(fired).toEqual(['fist']);
  });

  it('does not fire a static gesture on a brief flash', () => {
    const seq = new GestureSequencer();
    const fired = run(seq, [[frame(fist, 0), 0], [frame(fist, 100), 100], [frame(open, 200), 200], [frame(fist, 300), 300]], [gesture('fist', fist)]);
    expect(fired).toEqual([]);
  });

  it('fires a two-position gesture only in order and in time', () => {
    const g = [gesture('openClose', open, fist)];
    expect(isStaticGesture(g[0])).toBe(false);
    const inOrder = run(new GestureSequencer(), [[frame(open, 0), 0], [frame(open, 100), 100], [frame(fist, 500), 500]], g);
    expect(inOrder).toEqual(['openClose']);
    const reversed = run(new GestureSequencer(), [[frame(fist, 0), 0], [frame(open, 300), 300]], g);
    expect(reversed).toEqual([]);
    const tooSlow = run(new GestureSequencer(), [[frame(open, 0), 0], [frame(fist, 3000), 3000]], g);
    expect(tooSlow).toEqual([]);
  });
});

describe('persistence', () => {
  it('rejects old-format and malformed gestures', () => {
    const good = gesture('fist', fist);
    const old = { id: 'x', name: 'x', position1: { fingerState: {} }, position2: {} };
    const r = parseGestures([good, old, null, 'nope']);
    expect(r.gestures.map(g => g.id)).toEqual(['fist']);
    expect(r.rejected).toBe(3);
    expect(parseGestures({}).gestures).toEqual([]);
  });

  it('round-trips through JSON', () => {
    const g = gesture('peace', peace);
    expect(parseGestures(JSON.parse(JSON.stringify([g]))).gestures).toHaveLength(1);
  });
});
