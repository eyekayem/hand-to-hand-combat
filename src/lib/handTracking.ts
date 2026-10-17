// Hand Tracking Module using MediaPipe Tasks Vision.
// Owns the single HandLandmarker and applies One Euro smoothing per physical hand.

import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { LandmarkSmoother } from './hand/oneEuro';
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
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

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

/** Safe to call repeatedly or concurrently; loads once. */
export function initializeHandTracking(): Promise<void> {
  if (handLandmarker) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

function smooth(hand: TrackedHand, t: number): TrackedHand {
  const key = physicalHandFromLabel(hand.handedness);
  let s = smoothers.get(key);
  if (!s || t - s.lastSeen > SMOOTH_RESET_MS) {
    s = { image: new LandmarkSmoother(), world: new LandmarkSmoother(), lastSeen: t };
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
