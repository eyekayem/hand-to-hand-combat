// Hand Tracking Module using MediaPipe Tasks Vision.
// Owns the single HandLandmarker and applies One Euro smoothing per physical hand.

import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { LandmarkSmoother, IMAGE_ONE_EURO, WORLD_ONE_EURO } from './hand/oneEuro';
import { physicalHandFromLabel, type PhysicalHand } from './hand/handGeometry';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHand {
  landmarks: HandLandmark[];
  worldLandmarks: HandLandmark[];
  /** MediaPipe's label, which assumes a mirrored (selfie) frame. Use physicalHandFromLabel. */
  handedness: 'Left' | 'Right';
  confidence: number;
}

export interface TrackingResult {
  hands: TrackedHand[];
  timestamp: number;
  fps: number;
}

// Must match the installed @mediapipe/tasks-vision version (pinned in package.json).
const MEDIAPIPE_VERSION = '0.10.35';
// Served from our own origin (staged by scripts/fetch-mediapipe.mjs), with the
// public CDNs as fallback if a build couldn't stage them.
const LOCAL_WASM = `${import.meta.env.BASE_URL}mediapipe/${MEDIAPIPE_VERSION}/wasm`;
const LOCAL_MODEL = `${import.meta.env.BASE_URL}mediapipe/hand_landmarker_float16_v1.task`;
const CDN_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let maxHands = 2;

let handLandmarker: HandLandmarker | null = null;
let initPromise: Promise<void> | null = null;
let lastFrameTime = 0;
let frameCount = 0;
let currentFps = 0;
let lastVideoTime = -1;
let lastResult: TrackingResult = { hands: [], timestamp: 0, fps: 0 };

// Smoothing state per physical hand, in both coordinate spaces.
const SMOOTH_RESET_MS = 300;
const smoothers = new Map<PhysicalHand, { image: LandmarkSmoother; world: LandmarkSmoother; lastSeen: number }>();
let smoothingEnabled = true;

export function setSmoothing(enabled: boolean) {
  smoothingEnabled = enabled;
  smoothers.clear();
}

/** Fetch the model bytes, preferring our origin. Rejects HTML (SPA fallback) and truncated files. */
async function loadModel(): Promise<Uint8Array> {
  for (const url of [LOCAL_MODEL, CDN_MODEL]) {
    try {
      const res = await fetch(url);
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || type.includes('text/html')) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 1_000_000) return buf;
    } catch {
      /* try next */
    }
  }
  throw new Error('Could not load the hand tracking model');
}

async function createLandmarker(wasmRoot: string, model: Uint8Array, delegate: 'GPU' | 'CPU') {
  const vision = await FilesetResolver.forVisionTasks(wasmRoot);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetBuffer: model, delegate },
    runningMode: 'VIDEO',
    numHands: maxHands,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/** Safe to call repeatedly or concurrently; loads once. */
export function initializeHandTracking(): Promise<void> {
  if (handLandmarker) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      const model = await loadModel();
      let lastErr: unknown;
      for (const wasm of [LOCAL_WASM, CDN_WASM]) {
        for (const delegate of ['GPU', 'CPU'] as const) {
          try {
            handLandmarker = await createLandmarker(wasm, model, delegate);
            return;
          } catch (err) {
            lastErr = err;
          }
        }
      }
      throw lastErr;
    })().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/**
 * How many hands to track. MediaPipe re-runs palm detection every frame while
 * fewer hands than this are in view, so asking for 2 with one hand up costs a
 * detection pass per frame. Use 1 unless the page needs both.
 */
export async function setMaxHands(n: 1 | 2): Promise<void> {
  maxHands = n;
  if (handLandmarker) await handLandmarker.setOptions({ numHands: n });
}

function smooth(hand: TrackedHand, t: number): TrackedHand {
  const key = physicalHandFromLabel(hand.handedness);
  let s = smoothers.get(key);
  if (!s || t - s.lastSeen > SMOOTH_RESET_MS) {
    s = { image: new LandmarkSmoother(IMAGE_ONE_EURO), world: new LandmarkSmoother(WORLD_ONE_EURO), lastSeen: t };
    smoothers.set(key, s);
  }
  s.lastSeen = t;
  return { ...hand, landmarks: s.image.smooth(hand.landmarks, t), worldLandmarks: s.world.smooth(hand.worldLandmarks, t) };
}

/**
 * Runs detection on the current video frame. Repeated calls for the same
 * video frame return the previous result instead of re-running the model.
 */
export function detectHands(video: HTMLVideoElement, timestamp: number): TrackingResult {
  if (!handLandmarker) return { hands: [], timestamp, fps: 0 };
  if (video.currentTime === lastVideoTime) return lastResult;
  lastVideoTime = video.currentTime;

  frameCount++;
  if (timestamp - lastFrameTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFrameTime = timestamp;
  }

  const result: HandLandmarkerResult = handLandmarker.detectForVideo(video, timestamp);
  const hands: TrackedHand[] = [];

  for (let i = 0; i < (result.landmarks?.length ?? 0); i++) {
    const landmarks = result.landmarks[i];
    const worldLandmarks = result.worldLandmarks?.[i] || landmarks;
    const handedness = result.handedness?.[i]?.[0] ?? result.handednesses?.[i]?.[0];
    const raw: TrackedHand = {
      landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
      worldLandmarks: worldLandmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
      handedness: (handedness?.categoryName as 'Left' | 'Right') || 'Right',
      confidence: handedness?.score ?? 0.5,
    };
    hands.push(smoothingEnabled ? smooth(raw, timestamp) : raw);
  }

  lastResult = { hands, timestamp, fps: currentFps };
  return lastResult;
}

export function isTrackingReady(): boolean {
  return handLandmarker !== null;
}

// Landmark indices for reference (also exported as L from hand/handGeometry).
export const LANDMARK_INDICES = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
};
