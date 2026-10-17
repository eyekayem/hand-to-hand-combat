import { describe, it, expect } from 'vitest';
import {
  resolve, validateGraph, DEFAULT_GRAPH, IDLE, ResponseFollower, CommitTracker, graphInputFrom,
  type GraphInput, type GraphNode,
} from '@/lib/graph/gestureGraph';
import { computeGeometry, type FingerState } from '@/lib/hand/handGeometry';
import { handLandmarks } from '@/lib/hand/handModel';
import { WaveMeter } from '@/lib/graph/motion';

const F = (thumb: number, index: number, middle: number, ring: number, pinky: number): FingerState =>
  ({ thumb, index, middle, ring, pinky });
const input = (fingers: FingerState, thumbUp = 0, wave = 0): GraphInput => ({ fingers, thumbUp, wave });
const weight = (r: ReturnType<typeof resolve>, id: string) => r.nodes.find(n => n.id === id)!.weight;

describe('graph structure', () => {
  it('default graph is valid', () => expect(() => validateGraph(DEFAULT_GRAPH)).not.toThrow());

  it('rejects unknown or out-of-order parents', () => {
    const bad: GraphNode[] = [{ id: 'b', label: 'b', parents: ['a'], when: () => 1, response: IDLE }, { id: 'a', label: 'a', when: () => 1, response: IDLE }];
    expect(() => validateGraph(bad)).toThrow(/listed before/);
    expect(() => validateGraph([{ id: 'x', label: 'x', parents: ['nope'], when: () => 1, response: IDLE }])).toThrow(/unknown/);
  });
});

describe('resolution', () => {
  it('a relaxed hand rests mostly on idle', () => {
    const r = resolve(input(F(0.5, 0.5, 0.5, 0.5, 0.5)));
    expect(r.dominant).toBeNull();
  });

  it('a full fist answers with the middle finger', () => {
    const r = resolve(input(F(0.1, 0.02, 0.02, 0.02, 0.02)));
    expect(r.dominant).toBe('fist');
    expect(r.target.fingers.middle).toBeGreaterThan(0.85);
    expect(r.target.mood.aggressive).toBeGreaterThan(0.85);
  });

  it('a half-closed hand already starts the middle finger', () => {
    const half = resolve(input(F(0.3, 0.35, 0.35, 0.35, 0.35)));
    const open = resolve(input(F(0.9, 1, 1, 1, 1)));
    expect(half.target.fingers.middle).toBeGreaterThan(IDLE.fingers.middle * 0.9);
    expect(half.target.mood.aggressive).toBeGreaterThan(0.2);
    expect(open.target.mood.aggressive).toBeLessThan(0.01);
  });

  it('closing is continuous: no jumps as the hand curls', () => {
    let prev: number | null = null;
    for (let e = 1; e >= 0; e -= 0.05) {
      const m = resolve(input(F(0.15, e, e, e, e))).target.fingers.middle;
      if (prev !== null) expect(Math.abs(m - prev)).toBeLessThan(0.2);
      prev = m;
    }
  });

  it('moving past fist to thumbs up retargets', () => {
    const fist = resolve(input(F(0.1, 0, 0, 0, 0), 0.9));
    const up = resolve(input(F(0.95, 0, 0, 0, 0), 0.9));
    expect(fist.dominant).toBe('fist');
    expect(up.dominant).toBe('thumbsUp');
    expect(up.target.fingers.middle).toBeLessThan(0.15);
    expect(up.target.fingers.thumb).toBeGreaterThan(0.85);
    expect(up.target.roll).toBeCloseTo(Math.PI / 2, 1);
  });

  it('thumb down routes to thumbsDown', () => {
    expect(resolve(input(F(0.95, 0, 0, 0, 0), -0.9)).dominant).toBe('thumbsDown');
  });

  it('wave takes over from open', () => {
    const r = resolve(input(F(0.9, 1, 1, 1, 1), 0, 1));
    expect(r.dominant).toBe('wave');
    expect(weight(r, 'open')).toBeLessThan(0.05);
    expect(r.target.wave).toBeGreaterThan(0.9);
  });

  it('weights plus idle never exceed 1', () => {
    for (let i = 0; i < 200; i++) {
      const rnd = () => Math.random();
      const r = resolve(input(F(rnd(), rnd(), rnd(), rnd(), rnd()), rnd() * 2 - 1, rnd()));
      expect(r.nodes.reduce((s, n) => s + n.weight, 0)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('works end to end from tracked geometry', () => {
    const w = handLandmarks({ fingers: F(1, 0, 0, 0, 0), roll: Math.PI / 2 }); // thumbs up
    const g = computeGeometry({ landmarks: w, worldLandmarks: w, handedness: 'Left', confidence: 1 });
    expect(resolve(graphInputFrom(g, 0)).dominant).toBe('thumbsUp');
  });
});

describe('follower and commit', () => {
  it('reaches ~80% of a step within 50 ms regardless of frame rate', () => {
    for (const dt of [8, 16.7, 33.3]) {
      const f = new ResponseFollower();
      const target = resolve(input(F(0.1, 0.02, 0.02, 0.02, 0.02))).target;
      const start = f.state.fingers.middle;
      for (let t = 0; t < 50 - 1e-6; t += dt) f.step(target, Math.min(dt, 50 - t));
      const progress = (f.state.fingers.middle - start) / (target.fingers.middle - start);
      expect(progress).toBeGreaterThan(0.78);
      expect(progress).toBeLessThan(0.85);
    }
  });

  it('commits after a short dwell and releases immediately', () => {
    const c = new CommitTracker(0.6, 80);
    const fist = resolve(input(F(0.1, 0.02, 0.02, 0.02, 0.02)));
    const idle = resolve(input(F(0.5, 0.5, 0.5, 0.5, 0.5)));
    expect(c.update(fist, 0)).toBeNull();
    expect(c.update(fist, 50)).toBeNull();
    expect(c.update(fist, 90)).toBe('fist');
    expect(c.update(idle, 100)).toBeNull();
  });
});


describe('wave meter', () => {
  it('stays at 0 for a still or slowly drifting hand', () => {
    const w = new WaveMeter();
    let v = 0;
    for (let t = 0; t < 1000; t += 33) v = w.update(0.5 + t * 0.00002, t);
    expect(v).toBe(0);
  });

  it('builds with each swing of a real wave', () => {
    const w = new WaveMeter();
    const vals: number[] = [];
    for (let t = 0; t < 900; t += 33) vals.push(w.update(0.5 + 0.06 * Math.sin((2 * Math.PI * t) / 400), t));
    expect(vals[vals.length - 1]).toBeGreaterThan(0.9);
    expect(vals.findIndex(v => v > 0)).toBeGreaterThan(0);
  });

  it('ignores jitter below the swing threshold', () => {
    const w = new WaveMeter();
    let v = 0;
    for (let t = 0; t < 900; t += 16) v = w.update(0.5 + (t % 32 ? 0.005 : -0.005), t);
    expect(v).toBe(0);
  });
});
