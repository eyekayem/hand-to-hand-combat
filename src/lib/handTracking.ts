// Hand Tracking Module using MediaPipe Tasks Vision
// Handles webcam access and hand landmark detection

import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface TrackedHand {
  landmarks: HandLandmark[];
  worldLandmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
}

export interface TrackingResult {
  hands: TrackedHand[];
  timestamp: number;
  fps: number;
}

let handLandmarker: HandLandmarker | null = null;
let lastFrameTime = 0;
let frameCount = 0;
let currentFps = 0;

export async function initializeHandTracking(): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU'
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
}

export function detectHands(video: HTMLVideoElement, timestamp: number): TrackingResult {
  if (!handLandmarker) {
    return { hands: [], timestamp, fps: 0 };
  }

  // Calculate FPS
  frameCount++;
  if (timestamp - lastFrameTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFrameTime = timestamp;
  }

  const result: HandLandmarkerResult = handLandmarker.detectForVideo(video, timestamp);

  const hands: TrackedHand[] = [];

  if (result.landmarks && result.landmarks.length > 0) {
    for (let i = 0; i < result.landmarks.length; i++) {
      const landmarks = result.landmarks[i];
      const worldLandmarks = result.worldLandmarks?.[i] || landmarks;
      const handedness = result.handednesses?.[i]?.[0];

      hands.push({
        landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
        worldLandmarks: worldLandmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
        handedness: (handedness?.categoryName as 'Left' | 'Right') || 'Right',
        confidence: handedness?.score || 0.5
      });
    }
  }

  return { hands, timestamp, fps: currentFps };
}

export function isTrackingReady(): boolean {
  return handLandmarker !== null;
}

// Landmark indices for reference
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
  PINKY_TIP: 20
};
