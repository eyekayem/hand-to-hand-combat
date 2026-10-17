// Gesture Training Types - Define finger positions and hand orientation

export interface FingerState {
  thumb: number;   // 0 = curled, 1 = extended
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export interface HandOrientation {
  // Palm facing direction relative to camera
  palmFacing: 'camera' | 'away' | 'left' | 'right' | 'up' | 'down';
  // Wrist rotation
  rotation: number; // radians, 0 = neutral
  // Hand tilt
  tilt: number; // radians, positive = tilted toward pinky
}

export interface GesturePosition {
  fingerState: FingerState;
  orientation: HandOrientation;
  // Optional: relative position in normalized space
  relativePosition?: {
    x: number; // -1 to 1, center = 0
    y: number; // -1 to 1, center = 0
    z: number; // depth, 0 = neutral, negative = closer
  };
}

export interface TrainedGesture {
  id: string;
  name: string;
  description?: string;
  // Two-position gesture (start and end)
  position1: GesturePosition;
  position2: GesturePosition;
  // Timing between positions
  transitionMs: number;
  // Which hand(s) this gesture applies to
  hand: 'left' | 'right' | 'both';
  // Creation timestamp
  createdAt: number;
}

export interface GestureMatch {
  gestureId: string;
  gestureName: string;
  confidence: number;
  matchedPosition: 1 | 2;
  fingerMatchScores: FingerState;
  orientationScore: number;
}

// Helper to calculate finger state from extension values
export function fingerStateFromExtensions(
  thumb: number,
  index: number,
  middle: number,
  ring: number,
  pinky: number
): FingerState {
  return {
    thumb: Math.round(thumb * 100) / 100,
    index: Math.round(index * 100) / 100,
    middle: Math.round(middle * 100) / 100,
    ring: Math.round(ring * 100) / 100,
    pinky: Math.round(pinky * 100) / 100,
  };
}

// Calculate palm facing direction from landmarks
export function calculatePalmFacing(
  wrist: { x: number; y: number; z: number },
  indexMcp: { x: number; y: number; z: number },
  pinkyMcp: { x: number; y: number; z: number },
  middleMcp: { x: number; y: number; z: number }
): HandOrientation['palmFacing'] {
  // Calculate palm normal using cross product of two vectors on palm
  const v1 = {
    x: indexMcp.x - wrist.x,
    y: indexMcp.y - wrist.y,
    z: indexMcp.z - wrist.z,
  };
  const v2 = {
    x: pinkyMcp.x - wrist.x,
    y: pinkyMcp.y - wrist.y,
    z: pinkyMcp.z - wrist.z,
  };

  // Cross product gives palm normal
  const normal = {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x,
  };

  // Normalize
  const len = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
  if (len < 0.001) return 'camera';

  normal.x /= len;
  normal.y /= len;
  normal.z /= len;

  // Determine dominant direction
  const absX = Math.abs(normal.x);
  const absY = Math.abs(normal.y);
  const absZ = Math.abs(normal.z);

  if (absZ > absX && absZ > absY) {
    return normal.z > 0 ? 'camera' : 'away';
  } else if (absY > absX) {
    return normal.y > 0 ? 'down' : 'up';
  } else {
    return normal.x > 0 ? 'right' : 'left';
  }
}

// Calculate hand rotation and tilt
export function calculateHandRotation(
  wrist: { x: number; y: number; z: number },
  middleMcp: { x: number; y: number; z: number }
): { rotation: number; tilt: number } {
  const dx = middleMcp.x - wrist.x;
  const dy = middleMcp.y - wrist.y;

  // Rotation is angle from vertical
  const rotation = Math.atan2(dx, -dy);

  // Tilt could be calculated from z differences but simplified for now
  const tilt = 0;

  return { rotation, tilt };
}

// Compare two finger states and return similarity (0-1)
export function compareFingerStates(a: FingerState, b: FingerState, tolerance: number = 0.3): number {
  const diffs = [
    Math.abs(a.thumb - b.thumb),
    Math.abs(a.index - b.index),
    Math.abs(a.middle - b.middle),
    Math.abs(a.ring - b.ring),
    Math.abs(a.pinky - b.pinky),
  ];

  // Score each finger (1 if within tolerance, scaled down otherwise)
  const scores = diffs.map(d => Math.max(0, 1 - d / tolerance));

  return scores.reduce((sum, s) => sum + s, 0) / 5;
}

// Compare orientations
export function compareOrientations(a: HandOrientation, b: HandOrientation): number {
  // Facing must match
  if (a.palmFacing !== b.palmFacing) return 0.3;

  // Rotation similarity (allow 30 degree tolerance)
  const rotationDiff = Math.abs(a.rotation - b.rotation);
  const rotationScore = Math.max(0, 1 - rotationDiff / (Math.PI / 6));

  return 0.5 + 0.5 * rotationScore;
}

// Match a current hand state against a trained gesture
export function matchGesture(
  currentFingers: FingerState,
  currentOrientation: HandOrientation,
  gesture: TrainedGesture
): GestureMatch | null {
  const fingerScore1 = compareFingerStates(currentFingers, gesture.position1.fingerState);
  const orientScore1 = compareOrientations(currentOrientation, gesture.position1.orientation);
  const score1 = fingerScore1 * 0.7 + orientScore1 * 0.3;

  const fingerScore2 = compareFingerStates(currentFingers, gesture.position2.fingerState);
  const orientScore2 = compareOrientations(currentOrientation, gesture.position2.orientation);
  const score2 = fingerScore2 * 0.7 + orientScore2 * 0.3;

  const bestScore = Math.max(score1, score2);
  const bestPosition = score1 >= score2 ? 1 : 2;

  if (bestScore < 0.6) return null;

  return {
    gestureId: gesture.id,
    gestureName: gesture.name,
    confidence: bestScore,
    matchedPosition: bestPosition,
    fingerMatchScores: bestPosition === 1
      ? gesture.position1.fingerState
      : gesture.position2.fingerState,
    orientationScore: bestPosition === 1 ? orientScore1 : orientScore2,
  };
}

// Generate unique ID
export function generateGestureId(): string {
  return `gesture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
