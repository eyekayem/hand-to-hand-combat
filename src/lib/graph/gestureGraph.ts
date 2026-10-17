// Gesture graph: resolves hand features into a continuous app response.
//
// Nodes form a DAG. Each node has a soft condition (0..1) on the input; its
// score is its condition times its best parent's score. A parent covers
// everything its children share, so partial evidence lights the parent
// first (four fingers curling = "closing") and the children split the mass
// as the remaining features resolve (thumb in = fist, thumb up = thumbs up).
//
// Every node owns a response pose. The app hand is the blend of all
// responses, weighted by each node's *residual* score (its score minus what
// its children claim), plus an idle pose for whatever mass is left. Nothing
// waits for a hold: the blend moves every frame, and a follower eases the
// app hand toward it with a short time constant.

import type { FingerState, HandGeometry } from '../hand/handGeometry';

export type Mood = 'neutral' | 'friendly' | 'playful' | 'aggressive' | 'challenging';
export const MOODS: Mood[] = ['neutral', 'friendly', 'playful', 'aggressive', 'challenging'];

/** Display colour per mood. */
export const MOOD_RGB: Record<Mood, [number, number, number]> = {
  neutral: [107, 114, 128],
  friendly: [79, 209, 197],
  playful: [246, 196, 83],
  aggressive: [252, 92, 92],
  challenging: [249, 140, 60],
};

export interface GraphInput {
  fingers: FingerState;
  /** Thumb direction . world up, -1..1. */
  thumbUp: number;
  /** Continuous wave strength, 0..1. */
  wave: number;
}

export interface Response {
  fingers: FingerState;
  roll: number;
  mood: Mood;
  wave?: boolean;
}

export interface GraphNode {
  id: string;
  label: string;
  parents?: string[];
  /** Soft condition on top of the parents', 0..1. */
  when: (x: GraphInput) => number;
  response: Response;
}

export interface NodeState { id: string; label: string; score: number; weight: number }

export interface Resolution {
  nodes: NodeState[];
  /** Blended target for the app hand. */
  target: { fingers: FingerState; roll: number; wave: number; mood: Record<Mood, number> };
  /** Node with the most weight, or null when idle dominates. */
  dominant: string | null;
  dominantWeight: number;
}

// ---------- membership helpers ----------
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
export const extended = (x: number) => smoothstep(0.45, 0.8, x);
export const curled = (x: number) => 1 - smoothstep(0.2, 0.55, x);
export const thumbOut = (x: number) => smoothstep(0.4, 0.75, x);
export const thumbIn = (x: number) => 1 - smoothstep(0.35, 0.65, x);
const all = (...xs: number[]) => Math.min(...xs);

const F = (thumb: number, index: number, middle: number, ring: number, pinky: number): FingerState =>
  ({ thumb, index, middle, ring, pinky });

export const IDLE: Response = { fingers: F(0.45, 0.55, 0.55, 0.5, 0.45), roll: 0, mood: 'neutral' };

// ---------- default graph ----------
export const DEFAULT_GRAPH: GraphNode[] = [
  {
    id: 'closing', label: 'Closing',
    when: x => all(curled(x.fingers.index), curled(x.fingers.middle), curled(x.fingers.ring), curled(x.fingers.pinky)),
    // Starting to answer a fist before it lands: the middle finger begins to rise.
    response: { fingers: F(0.2, 0.1, 0.5, 0.1, 0.1), roll: 0, mood: 'aggressive' },
  },
  {
    id: 'fist', label: 'Fist', parents: ['closing'],
    when: x => thumbIn(x.fingers.thumb),
    response: { fingers: F(0.15, 0.03, 1, 0.03, 0.03), roll: 0, mood: 'aggressive' },
  },
  {
    id: 'thumbsUp', label: 'Thumbs up', parents: ['closing'],
    when: x => thumbOut(x.fingers.thumb) * smoothstep(0.2, 0.6, x.thumbUp),
    response: { fingers: F(1, 0, 0, 0, 0), roll: Math.PI / 2, mood: 'friendly' },
  },
  {
    id: 'thumbsDown', label: 'Thumbs down', parents: ['closing'],
    when: x => thumbOut(x.fingers.thumb) * smoothstep(0.2, 0.6, -x.thumbUp),
    response: { fingers: F(1, 0, 0, 0, 0), roll: -Math.PI / 2, mood: 'challenging' },
  },
  {
    id: 'point', label: 'Point',
    when: x => all(extended(x.fingers.index), curled(x.fingers.middle), curled(x.fingers.ring), curled(x.fingers.pinky)),
    response: { fingers: F(0.2, 1, 0.03, 0.03, 0.03), roll: 0, mood: 'challenging' },
  },
  {
    id: 'peace', label: 'Peace',
    when: x => all(extended(x.fingers.index), extended(x.fingers.middle), curled(x.fingers.ring), curled(x.fingers.pinky)),
    response: { fingers: F(0.15, 1, 1, 0.03, 0.03), roll: 0, mood: 'playful' },
  },
  {
    id: 'open', label: 'Open',
    when: x => all(extended(x.fingers.index), extended(x.fingers.middle), extended(x.fingers.ring), extended(x.fingers.pinky)),
    response: { fingers: F(0.9, 1, 1, 1, 1), roll: 0, mood: 'friendly' },
  },
  {
    id: 'wave', label: 'Wave', parents: ['open'],
    when: x => x.wave,
    response: { fingers: F(0.9, 1, 1, 1, 1), roll: 0, mood: 'playful', wave: true },
  },
];

// ---------- evaluation ----------
export function validateGraph(graph: GraphNode[]): void {
  const ids = new Set(graph.map(n => n.id));
  const seen = new Set<string>();
  for (const n of graph) {
    if (seen.has(n.id)) throw new Error(`Duplicate node ${n.id}`);
    for (const p of n.parents ?? []) {
      if (!ids.has(p)) throw new Error(`${n.id}: unknown parent ${p}`);
      // Parents must come first: keeps evaluation single-pass and acyclic.
      if (!seen.has(p)) throw new Error(`${n.id}: parent ${p} must be listed before it`);
    }
    seen.add(n.id);
  }
}

export function resolve(x: GraphInput, graph: GraphNode[] = DEFAULT_GRAPH, idle: Response = IDLE): Resolution {
  const score = new Map<string, number>();
  for (const n of graph) {
    const parent = n.parents?.length ? Math.max(...n.parents.map(p => score.get(p) ?? 0)) : 1;
    score.set(n.id, parent * Math.min(1, Math.max(0, n.when(x))));
  }

  const childSum = new Map<string, number>();
  for (const n of graph) for (const p of n.parents ?? []) childSum.set(p, (childSum.get(p) ?? 0) + score.get(n.id)!);

  const raw = graph.map(n => Math.max(0, score.get(n.id)! - (childSum.get(n.id) ?? 0)));
  const total = raw.reduce((a, b) => a + b, 0);
  const k = total > 1 ? 1 / total : 1;
  const weights = raw.map(w => w * k);
  const idleW = Math.max(0, 1 - weights.reduce((a, b) => a + b, 0));

  const fingers = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  const mood = Object.fromEntries(MOODS.map(m => [m, 0])) as Record<Mood, number>;
  let rollX = 0, rollY = 0, wave = 0;
  const addResp = (r: Response, w: number) => {
    if (w <= 0) return;
    for (const key of Object.keys(fingers) as (keyof FingerState)[]) fingers[key] += r.fingers[key] * w;
    rollX += Math.cos(r.roll) * w;
    rollY += Math.sin(r.roll) * w;
    mood[r.mood] += w;
    if (r.wave) wave += w;
  };
  graph.forEach((n, i) => addResp(n.response, weights[i]));
  addResp(idle, idleW);

  let dominant: string | null = null, dominantWeight = idleW;
  graph.forEach((n, i) => {
    if (weights[i] > dominantWeight) { dominant = n.id; dominantWeight = weights[i]; }
  });

  return {
    nodes: graph.map((n, i) => ({ id: n.id, label: n.label, score: score.get(n.id)!, weight: weights[i] })),
    target: { fingers, roll: Math.atan2(rollY, rollX), wave, mood },
    dominant,
    dominantWeight,
  };
}

export function graphInputFrom(g: HandGeometry, wave: number): GraphInput {
  return { fingers: g.fingers, thumbUp: -g.thumbDirection.y, wave };
}

// ---------- following ----------
/** Default response time constant: ~63% of the way in 30 ms, ~80% by 50 ms. */
export const RESPONSE_TAU_MS = 30;

export interface AppHandState {
  fingers: FingerState;
  roll: number;
  wave: number;
  mood: Record<Mood, number>;
}

/** Eases the app hand toward the resolved target, frame-rate independent. */
export class ResponseFollower {
  state: AppHandState = {
    fingers: { ...IDLE.fingers },
    roll: 0,
    wave: 0,
    mood: Object.fromEntries(MOODS.map(m => [m, m === 'neutral' ? 1 : 0])) as Record<Mood, number>,
  };

  constructor(public tauMs = RESPONSE_TAU_MS) {}

  step(target: Resolution['target'], dtMs: number): AppHandState {
    const a = 1 - Math.exp(-Math.max(0, dtMs) / this.tauMs);
    const s = this.state;
    for (const k of Object.keys(s.fingers) as (keyof FingerState)[]) s.fingers[k] += (target.fingers[k] - s.fingers[k]) * a;
    // Ease roll along the short way round.
    let d = target.roll - s.roll;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    s.roll += d * a;
    s.wave += (target.wave - s.wave) * a;
    for (const m of MOODS) s.mood[m] += (target.mood[m] - s.mood[m]) * a;
    return s;
  }
}

// ---------- commit (for labels, sound, analytics) ----------
/** A node counts as committed once it has dominated for a short dwell. */
export class CommitTracker {
  private candidate: string | null = null;
  private since = 0;
  committed: string | null = null;

  constructor(public minWeight = 0.6, public dwellMs = 80) {}

  update(r: Resolution, t: number): string | null {
    const id = r.dominant && r.dominantWeight >= this.minWeight ? r.dominant : null;
    if (id !== this.candidate) {
      this.candidate = id;
      this.since = t;
    }
    if (t - this.since >= this.dwellMs || id === null) this.committed = id;
    return this.committed;
  }
}
