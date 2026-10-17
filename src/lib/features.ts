// Feature Extraction Module - Simplified gesture detection

import { TrackedHand, HandLandmark, LANDMARK_INDICES } from './handTracking';

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
}

export interface FeatureConfig {
  opennessThreshold: number;
  fistThreshold: number;
  pointThreshold: number;
  boundaryY: number;
  boundarySensitivity: number;
  smoothingWindow: number;
}

interface PositionHistory {
  x: number;
  y: number;
  timestamp: number;
}

const positionHistory: PositionHistory[] = [];
const MAX_HISTORY = 20;

function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function getFingerExtension(landmarks: HandLandmark[], mcp: number, pip: number, dip: number, tip: number, wrist: number): number {
  // Simple: how far is fingertip from wrist compared to mcp from wrist
  const tipToWrist = distance2D(landmarks[tip], landmarks[wrist]);
  const mcpToWrist = distance2D(landmarks[mcp], landmarks[wrist]);

  if (mcpToWrist < 0.01) return 0.5;

  // Ratio > 1.5 means extended, < 1 means curled
  const ratio = tipToWrist / mcpToWrist;
  return Math.min(1, Math.max(0, (ratio - 0.8) / 1.2));
}

// Specialized thumb extension - measures lateral spread from palm
function getThumbExtension(landmarks: HandLandmark[]): number {
  const L = LANDMARK_INDICES;
  const thumbTip = landmarks[L.THUMB_TIP];
  const thumbMcp = landmarks[L.THUMB_MCP];
  const indexMcp = landmarks[L.INDEX_MCP];
  const pinkyMcp = landmarks[L.PINKY_MCP];

  // Palm width for normalization
  const palmWidth = distance2D(indexMcp, pinkyMcp);
  if (palmWidth < 0.01) return 0.5;

  // Distance from thumb tip to index MCP (extended = far from index)
  const thumbToIndex = distance2D(thumbTip, indexMcp);

  // Distance from thumb MCP to tip (measures curl)
  const thumbLength = distance2D(thumbTip, thumbMcp);

  // Combined metric: lateral spread + extension
  const lateralRatio = thumbToIndex / (palmWidth * 1.5);
  const extensionRatio = thumbLength / (palmWidth * 0.8);

  // Weight lateral spread more (0.6) than pure extension (0.4)
  const combined = (lateralRatio * 0.6) + (extensionRatio * 0.4);

  return Math.min(1, Math.max(0, combined));
}

function isFingerUp(landmarks: HandLandmark[], tip: number, pip: number): boolean {
  // Finger is "up" if tip is above (lower Y) than pip
  return landmarks[tip].y < landmarks[pip].y - 0.02;
}

function isFingerCurled(landmarks: HandLandmark[], tip: number, mcp: number, wrist: number): boolean {
  // Finger is curled if tip is closer to wrist than mcp, or tip Y is below mcp Y
  const tipToWrist = distance2D(landmarks[tip], landmarks[wrist]);
  const mcpToWrist = distance2D(landmarks[mcp], landmarks[wrist]);
  return tipToWrist < mcpToWrist * 1.3;
}

export function extractFeatures(
  hand: TrackedHand,
  config: FeatureConfig,
  timestamp: number
): HandFeatures {
  const { landmarks } = hand;
  const L = LANDMARK_INDICES;

  // Finger extensions (0 = curled, 1 = extended)
  // Use specialized algorithm for thumb (lateral movement)
  const thumbExtension = getThumbExtension(landmarks);
  const indexExtension = getFingerExtension(landmarks, L.INDEX_MCP, L.INDEX_PIP, L.INDEX_DIP, L.INDEX_TIP, L.WRIST);
  const middleExtension = getFingerExtension(landmarks, L.MIDDLE_MCP, L.MIDDLE_PIP, L.MIDDLE_DIP, L.MIDDLE_TIP, L.WRIST);
  const ringExtension = getFingerExtension(landmarks, L.RING_MCP, L.RING_PIP, L.RING_DIP, L.RING_TIP, L.WRIST);
  const pinkyExtension = getFingerExtension(landmarks, L.PINKY_MCP, L.PINKY_PIP, L.PINKY_DIP, L.PINKY_TIP, L.WRIST);

  const handOpenness = (thumbExtension + indexExtension + middleExtension + ringExtension + pinkyExtension) / 5;

  // Simple finger state checks
  const thumbUp = landmarks[L.THUMB_TIP].y < landmarks[L.THUMB_IP].y - 0.03;
  const indexUp = isFingerUp(landmarks, L.INDEX_TIP, L.INDEX_PIP);
  const middleUp = isFingerUp(landmarks, L.MIDDLE_TIP, L.MIDDLE_PIP);
  const ringUp = isFingerUp(landmarks, L.RING_TIP, L.RING_PIP);
  const pinkyUp = isFingerUp(landmarks, L.PINKY_TIP, L.PINKY_PIP);

  const indexCurled = isFingerCurled(landmarks, L.INDEX_TIP, L.INDEX_MCP, L.WRIST);
  const middleCurled = isFingerCurled(landmarks, L.MIDDLE_TIP, L.MIDDLE_MCP, L.WRIST);
  const ringCurled = isFingerCurled(landmarks, L.RING_TIP, L.RING_MCP, L.WRIST);
  const pinkyCurled = isFingerCurled(landmarks, L.PINKY_TIP, L.PINKY_MCP, L.WRIST);

  // GESTURE DETECTION

  // Fist: all fingers curled (low openness)
  const isFist = handOpenness < 0.35;

  // Open hand: all fingers extended
  const isOpenHand = handOpenness > 0.6;

  // Thumbs up: thumb extended, other fingers curled (orientation-agnostic)
  const isThumbsUp = thumbExtension > 0.55 && indexExtension < 0.35 && middleExtension < 0.35 && ringExtension < 0.35 && pinkyExtension < 0.35;

  // Peace sign: index and middle up, ring and pinky down
  const isPeaceSign = indexUp && middleUp && !ringUp && !pinkyUp && indexExtension > 0.5 && middleExtension > 0.5;

  // Point: only index up
  const isPoint = indexUp && !middleUp && !ringUp && !pinkyUp && indexExtension > 0.5;

  // Calculate hand center
  const center = {
    x: landmarks.reduce((sum, l) => sum + l.x, 0) / landmarks.length,
    y: landmarks.reduce((sum, l) => sum + l.y, 0) / landmarks.length
  };

  // Track position for wave detection and stability
  positionHistory.push({ x: center.x, y: center.y, timestamp });
  while (positionHistory.length > MAX_HISTORY) positionHistory.shift();

  // Calculate speed
  let handSpeed = 0;
  if (positionHistory.length >= 2) {
    const curr = positionHistory[positionHistory.length - 1];
    const prev = positionHistory[positionHistory.length - 2];
    const dt = (curr.timestamp - prev.timestamp) / 1000;
    if (dt > 0) {
      handSpeed = distance2D(curr, prev) / dt;
    }
  }

  // Wave detection: oscillating X movement with open hand
  let isWaving = false;
  if (isOpenHand && positionHistory.length >= 8) {
    const recent = positionHistory.slice(-8);
    let dirChanges = 0;
    let lastDir = 0;
    for (let i = 1; i < recent.length; i++) {
      const dx = recent[i].x - recent[i - 1].x;
      if (Math.abs(dx) > 0.008) {
        const dir = dx > 0 ? 1 : -1;
        if (lastDir !== 0 && dir !== lastDir) dirChanges++;
        lastDir = dir;
      }
    }
    isWaving = dirChanges >= 2;
  }

  // Stability check: hand is still for response trigger
  let isStable = false;
  if (positionHistory.length >= 5) {
    const recent = positionHistory.slice(-5);
    let totalMovement = 0;
    for (let i = 1; i < recent.length; i++) {
      totalMovement += distance2D(recent[i], recent[i - 1]);
    }
    isStable = totalMovement < 0.03; // Very little movement
  }

  // Determine gesture name (priority order)
  let detectedGesture = 'NONE';
  if (isWaving) detectedGesture = 'WAVE';
  else if (isThumbsUp) detectedGesture = 'THUMBS_UP';
  else if (isPeaceSign) detectedGesture = 'PEACE';
  else if (isPoint) detectedGesture = 'POINT';
  else if (isFist) detectedGesture = 'FIST';
  else if (isOpenHand) detectedGesture = 'OPEN';

  return {
    handOpenness,
    isFist,
    isOpenHand,
    isThumbsUp,
    isPeaceSign,
    isPoint,
    isWaving,
    thumbExtension,
    indexExtension,
    middleExtension,
    ringExtension,
    pinkyExtension,
    handSpeed,
    center,
    detectedGesture,
    isStable
  };
}

export function resetFeatureHistory(): void {
  positionHistory.length = 0;
}
