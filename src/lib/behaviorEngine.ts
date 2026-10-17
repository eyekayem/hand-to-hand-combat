// Behavior Engine - Call and Response System
// User does gesture → pauses → App responds

import { HandFeatures } from './features';

export type Mood = 'waiting' | 'responding' | 'friendly' | 'aggressive';

export interface Position {
  x: number;
  y: number;
}

export interface GestureCommand {
  gesture: string;
  fingerExtensions: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    pinky: number;
  };
  position: Position;
  mood: Mood;
  isResponding: boolean;
}

export interface BehaviorState {
  mood: Mood;
  position: Position;
  lastUserGesture: string;
  currentResponse: string;
  isResponding: boolean;
  responseStartTime: number;
  waitingForPause: boolean;
  gestureHoldStart: number;
}

// Gesture responses: what app does when user does X
const GESTURE_RESPONSES: Record<string, { gesture: string; mood: Mood }> = {
  'THUMBS_UP': { gesture: 'THUMBS_UP', mood: 'friendly' },
  'WAVE': { gesture: 'WAVE', mood: 'friendly' },
  'PEACE': { gesture: 'PEACE', mood: 'friendly' },
  'FIST': { gesture: 'MIDDLE_FINGER', mood: 'aggressive' },
  'POINT': { gesture: 'POINT', mood: 'friendly' },
  'OPEN': { gesture: 'OPEN', mood: 'friendly' },
};

const GESTURE_FINGERS: Record<string, { thumb: number; index: number; middle: number; ring: number; pinky: number }> = {
  'THUMBS_UP': { thumb: 0.95, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 },
  'WAVE': { thumb: 0.7, index: 0.95, middle: 0.95, ring: 0.95, pinky: 0.95 },
  'PEACE': { thumb: 0.2, index: 0.95, middle: 0.95, ring: 0.1, pinky: 0.1 },
  'FIST': { thumb: 0.2, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 },
  'MIDDLE_FINGER': { thumb: 0.2, index: 0.1, middle: 0.95, ring: 0.1, pinky: 0.1 },
  'POINT': { thumb: 0.3, index: 0.95, middle: 0.1, ring: 0.1, pinky: 0.1 },
  'OPEN': { thumb: 0.6, index: 0.7, middle: 0.7, ring: 0.6, pinky: 0.5 },
  'IDLE': { thumb: 0.4, index: 0.4, middle: 0.4, ring: 0.4, pinky: 0.4 },
};

let state: BehaviorState = {
  mood: 'waiting',
  position: { x: 0.5, y: 0.4 },
  lastUserGesture: 'NONE',
  currentResponse: 'IDLE',
  isResponding: false,
  responseStartTime: 0,
  waitingForPause: false,
  gestureHoldStart: 0,
};

const HOLD_TIME_TO_TRIGGER = 400; // ms user must hold gesture
const RESPONSE_DURATION = 1500; // ms app holds response
const WAVE_RESPONSE_DURATION = 2000; // longer for wave

let wavePhase = 0;

export function updateBehavior(
  features: HandFeatures | null,
  timestamp: number
): GestureCommand {

  // Currently in response mode - hold the response
  if (state.isResponding) {
    const elapsed = timestamp - state.responseStartTime;
    const duration = state.currentResponse === 'WAVE' ? WAVE_RESPONSE_DURATION : RESPONSE_DURATION;

    if (elapsed < duration) {
      // Continue response
      const position = { ...state.position };

      // Wave animation - oscillate
      if (state.currentResponse === 'WAVE') {
        wavePhase += 0.15;
        position.x = 0.5 + Math.sin(wavePhase) * 0.15;
      }

      return {
        gesture: state.currentResponse,
        fingerExtensions: GESTURE_FINGERS[state.currentResponse] || GESTURE_FINGERS.IDLE,
        position,
        mood: state.mood,
        isResponding: true
      };
    } else {
      // Response finished, go back to waiting
      state.isResponding = false;
      state.mood = 'waiting';
      state.currentResponse = 'IDLE';
      state.lastUserGesture = 'NONE';
    }
  }

  // Waiting mode - watch for user gesture
  if (features && features.detectedGesture !== 'NONE') {
    const userGesture = features.detectedGesture;

    // Same gesture as before?
    if (userGesture === state.lastUserGesture) {
      // Check if user is holding steady
      if (features.isStable) {
        const holdTime = timestamp - state.gestureHoldStart;

        if (holdTime > HOLD_TIME_TO_TRIGGER) {
          // TRIGGER RESPONSE!
          const response = GESTURE_RESPONSES[userGesture] || { gesture: 'OPEN', mood: 'friendly' };

          state.isResponding = true;
          state.responseStartTime = timestamp;
          state.currentResponse = response.gesture;
          state.mood = response.mood;
          wavePhase = 0;

          // Position based on mood
          if (response.mood === 'aggressive') {
            state.position = { x: 0.5, y: 0.25 }; // Come forward
          } else {
            state.position = { x: 0.5, y: 0.35 };
          }

          return {
            gesture: state.currentResponse,
            fingerExtensions: GESTURE_FINGERS[state.currentResponse] || GESTURE_FINGERS.IDLE,
            position: state.position,
            mood: state.mood,
            isResponding: true
          };
        }
      }
    } else {
      // New gesture - start tracking
      state.lastUserGesture = userGesture;
      state.gestureHoldStart = timestamp;
    }
  } else {
    // No gesture or hand - reset
    state.lastUserGesture = 'NONE';
  }

  // Idle state - slightly open, waiting
  return {
    gesture: 'IDLE',
    fingerExtensions: GESTURE_FINGERS.IDLE,
    position: { x: 0.5, y: 0.4 },
    mood: 'waiting',
    isResponding: false
  };
}

export function getState(): BehaviorState {
  return { ...state };
}

export function resetBehavior(): void {
  state = {
    mood: 'waiting',
    position: { x: 0.5, y: 0.4 },
    lastUserGesture: 'NONE',
    currentResponse: 'IDLE',
    isResponding: false,
    responseStartTime: 0,
    waitingForPause: false,
    gestureHoldStart: 0,
  };
  wavePhase = 0;
}
