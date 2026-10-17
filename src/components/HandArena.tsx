import { useRef, useEffect, useCallback, useState } from 'react';
import { initializeHandTracking, detectHands, isTrackingReady, TrackedHand, TrackingResult, LANDMARK_INDICES, HandLandmark } from '@/lib/handTracking';
import { pickPrimaryHand } from '@/lib/hand/handGeometry';
import { GestureCommand, Mood } from '@/lib/behaviorEngine';

interface HandArenaProps {
  onHandUpdate: (hands: TrackedHand[], fps: number) => void;
  gesture: GestureCommand | null;
  isActive: boolean;
  onActiveChange: (active: boolean) => void;
  detectedGesture: string;
}

const MOOD_COLORS: Record<Mood, string> = {
  waiting: '#6B7280',
  responding: '#4FD1C5',
  friendly: '#4FD1C5',
  aggressive: '#FC8181',
};

// Smoothed app hand state
interface AppHandState {
  x: number;
  y: number;
  z: number; // depth - affects scale
  landmarks: HandLandmark[];
}

// Gesture-specific pose landmarks (normalized positions relative to wrist)
const GESTURE_POSES: Record<string, HandLandmark[]> = {
  THUMBS_UP: createThumbsUpPose(),
  PEACE: createPeacePose(),
  FIST: createFistPose(),
  MIDDLE_FINGER: createMiddleFingerPose(),
  WAVE: createWavePose(),
  POINT: createPointPose(),
  OPEN: createOpenPose(),
  IDLE: createIdleLandmarks(),
};

export function HandArena({ onHandUpdate, gesture, isActive, onActiveChange, detectedGesture }: HandArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userHandRef = useRef<TrackedHand | null>(null);
  const appHandRef = useRef<AppHandState>({
    x: 0.5,
    y: 0.5,
    z: 0.5,
    landmarks: createIdleLandmarks()
  });

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!isTrackingReady()) {
        await initializeHandTracking();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });

      streamRef.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      videoRef.current = video;
      onActiveChange(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access camera');
      onActiveChange(false);
    } finally {
      setIsLoading(false);
    }
  }, [onActiveChange]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    onActiveChange(false);
  }, [onActiveChange]);

  // The render loop runs once for the component's lifetime and reads live
  // values through refs, so per-frame prop changes don't tear it down.
  const gestureRef = useRef(gesture);
  const onHandUpdateRef = useRef(onHandUpdate);
  const isActiveRef = useRef(isActive);
  gestureRef.current = gesture;
  onHandUpdateRef.current = onHandUpdate;
  isActiveRef.current = isActive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    let lastResult: TrackingResult | null = null;
    let raf = 0;

    const render = (timestamp: number) => {
      const { width, height } = canvas;
      const currentGesture = gestureRef.current;

      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, width, height);

      const video = videoRef.current;
      if (isActiveRef.current && video && video.readyState >= 2) {
        const result = detectHands(video, timestamp);
        // detectHands returns the same object until a new video frame arrives.
        if (result !== lastResult) {
          lastResult = result;
          onHandUpdateRef.current(result.hands, result.fps);
          userHandRef.current = pickPrimaryHand(result.hands);
        }
      } else if (!isActiveRef.current) {
        userHandRef.current = null;
      }

      updateAppHand(userHandRef.current, currentGesture);
      drawAppHand(ctx, width, height, appHandRef.current, currentGesture);
      if (userHandRef.current) drawUserHand(ctx, userHandRef.current, width, height);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // Release the camera if the arena unmounts while live.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const updateAppHand = (userHand: TrackedHand | null, gesture: GestureCommand | null) => {
    const app = appHandRef.current;
    const isResponding = gesture?.isResponding || false;
    const smoothing = isResponding ? 0.12 : 0.08; // Faster transition when responding

    if (userHand) {
      // Get user hand center (wrist)
      const wrist = userHand.landmarks[LANDMARK_INDICES.WRIST];
      const worldWrist = userHand.worldLandmarks[LANDMARK_INDICES.WRIST];

      // Mirror position (app hand follows but offset/mirrored)
      const targetX = wrist.x;
      const targetY = wrist.y + 0.15;

      // Z affects how "close" app hand appears
      const targetZ = isResponding
        ? (gesture?.mood === 'aggressive' ? 0.8 : 0.6) // Come closer when responding
        : 0.5 - worldWrist.z * 2;

      app.x += (targetX - app.x) * smoothing;
      app.y += (targetY - app.y) * smoothing;
      app.z += (Math.max(0.2, Math.min(0.9, targetZ)) - app.z) * smoothing;

      // RESPONDING: use gesture-specific pose
      if (isResponding && gesture) {
        const gestureName = gesture.gesture;
        const targetPose = GESTURE_POSES[gestureName] || GESTURE_POSES.IDLE;

        // Offset pose to current position
        const wristOffset = { x: app.x - 0.5, y: app.y - 0.5 };

        app.landmarks = app.landmarks.map((lm, i) => {
          const target = targetPose[i];
          if (!target) return lm;
          return {
            x: lm.x + ((target.x + wristOffset.x) - lm.x) * smoothing * 2,
            y: lm.y + ((target.y + wristOffset.y) - lm.y) * smoothing * 2,
            z: lm.z + (target.z - lm.z) * smoothing
          };
        });
      } else {
        // NOT RESPONDING: mirror user landmarks loosely
        const mirroredLandmarks = userHand.landmarks.map((lm, i) => {
          const current = app.landmarks[i] || { x: 0.5, y: 0.5, z: 0 };
          return {
            x: current.x + (lm.x - current.x) * smoothing * 1.5,
            y: current.y + (lm.y - current.y) * smoothing * 1.5,
            z: current.z + (lm.z - current.z) * smoothing
          };
        });
        app.landmarks = mirroredLandmarks;
      }
    } else {
      // Drift to center when no hand
      app.x += (0.5 - app.x) * 0.02;
      app.y += (0.4 - app.y) * 0.02;
      app.z += (0.5 - app.z) * 0.02;

      // Relax to idle pose
      const idle = createIdleLandmarks();
      app.landmarks = app.landmarks.map((lm, i) => ({
        x: lm.x + (idle[i].x - lm.x) * 0.03,
        y: lm.y + (idle[i].y - lm.y) * 0.03,
        z: lm.z + (idle[i].z - lm.z) * 0.03
      }));
    }
  };

  const drawUserHand = (ctx: CanvasRenderingContext2D, hand: TrackedHand, width: number, height: number) => {
    const { landmarks } = hand;
    const L = LANDMARK_INDICES;

    // Map to screen space (mirrored for selfie view)
    const mapX = (x: number) => (1 - x) * width;
    const mapY = (y: number) => y * height;

    ctx.strokeStyle = '#4FD1C5';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#4FD1C5';
    ctx.shadowBlur = 12;

    const connections = [
      [L.WRIST, L.THUMB_CMC], [L.THUMB_CMC, L.THUMB_MCP], [L.THUMB_MCP, L.THUMB_IP], [L.THUMB_IP, L.THUMB_TIP],
      [L.WRIST, L.INDEX_MCP], [L.INDEX_MCP, L.INDEX_PIP], [L.INDEX_PIP, L.INDEX_DIP], [L.INDEX_DIP, L.INDEX_TIP],
      [L.WRIST, L.MIDDLE_MCP], [L.MIDDLE_MCP, L.MIDDLE_PIP], [L.MIDDLE_PIP, L.MIDDLE_DIP], [L.MIDDLE_DIP, L.MIDDLE_TIP],
      [L.WRIST, L.RING_MCP], [L.RING_MCP, L.RING_PIP], [L.RING_PIP, L.RING_DIP], [L.RING_DIP, L.RING_TIP],
      [L.WRIST, L.PINKY_MCP], [L.PINKY_MCP, L.PINKY_PIP], [L.PINKY_PIP, L.PINKY_DIP], [L.PINKY_DIP, L.PINKY_TIP],
      [L.INDEX_MCP, L.MIDDLE_MCP], [L.MIDDLE_MCP, L.RING_MCP], [L.RING_MCP, L.PINKY_MCP], [L.WRIST, L.PINKY_MCP],
    ];

    for (const [start, end] of connections) {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(mapX(p1.x), mapY(p1.y));
      ctx.lineTo(mapX(p2.x), mapY(p2.y));
      ctx.stroke();
    }

    ctx.fillStyle = '#4FD1C5';
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const isFingerTip = [L.THUMB_TIP, L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP].includes(i);
      ctx.beginPath();
      ctx.arc(mapX(lm.x), mapY(lm.y), isFingerTip ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  };

  const drawAppHand = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    appState: AppHandState,
    gesture: GestureCommand | null
  ) => {
    const L = LANDMARK_INDICES;
    const { landmarks, z } = appState;

    // Scale based on z-depth (closer = larger)
    const scale = 0.6 + z * 0.8;
    const alpha = 0.4 + z * 0.4;

    const isResponding = gesture?.isResponding || false;
    const mood = gesture?.mood || 'waiting';
    const baseColor = isResponding ? MOOD_COLORS[mood] : '#6B7280';

    // Map to screen (NOT mirrored - creates mirror effect)
    const mapX = (x: number) => x * width;
    const mapY = (y: number) => y * height;

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = 'round';
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = isResponding ? 20 : 8;

    const connections = [
      [L.WRIST, L.THUMB_CMC], [L.THUMB_CMC, L.THUMB_MCP], [L.THUMB_MCP, L.THUMB_IP], [L.THUMB_IP, L.THUMB_TIP],
      [L.WRIST, L.INDEX_MCP], [L.INDEX_MCP, L.INDEX_PIP], [L.INDEX_PIP, L.INDEX_DIP], [L.INDEX_DIP, L.INDEX_TIP],
      [L.WRIST, L.MIDDLE_MCP], [L.MIDDLE_MCP, L.MIDDLE_PIP], [L.MIDDLE_PIP, L.MIDDLE_DIP], [L.MIDDLE_DIP, L.MIDDLE_TIP],
      [L.WRIST, L.RING_MCP], [L.RING_MCP, L.RING_PIP], [L.RING_PIP, L.RING_DIP], [L.RING_DIP, L.RING_TIP],
      [L.WRIST, L.PINKY_MCP], [L.PINKY_MCP, L.PINKY_PIP], [L.PINKY_PIP, L.PINKY_DIP], [L.PINKY_DIP, L.PINKY_TIP],
      [L.INDEX_MCP, L.MIDDLE_MCP], [L.MIDDLE_MCP, L.RING_MCP], [L.RING_MCP, L.PINKY_MCP], [L.WRIST, L.PINKY_MCP],
    ];

    for (const [start, end] of connections) {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(mapX(p1.x), mapY(p1.y));
      ctx.lineTo(mapX(p2.x), mapY(p2.y));
      ctx.stroke();
    }

    ctx.fillStyle = baseColor;
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm) continue;
      const isFingerTip = [L.THUMB_TIP, L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP].includes(i);
      ctx.beginPath();
      ctx.arc(mapX(lm.x), mapY(lm.y), (isFingerTip ? 5 : 3) * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="flex items-center gap-3">
          {detectedGesture && detectedGesture !== 'NONE' && (
            <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary font-mono">
              YOU: {detectedGesture}
            </span>
          )}
          {gesture?.isResponding && (
            <span className="text-xs px-2 py-1 rounded font-mono" style={{ backgroundColor: MOOD_COLORS[gesture.mood] + '30', color: MOOD_COLORS[gesture.mood] }}>
              APP: {gesture.gesture}
            </span>
          )}
        </div>
        <button
          onClick={isActive ? stopCamera : startCamera}
          disabled={isLoading}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
            isActive
              ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
              : 'bg-primary/20 text-primary hover:bg-primary/30'
          }`}
        >
          {isLoading ? 'Loading...' : isActive ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="relative flex-1 bg-background rounded-lg overflow-hidden border border-border/30">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm p-4 text-center z-10">
            {error}
          </div>
        )}

        {!isActive && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-sm z-10 gap-3">
            <span className="text-lg">Shared Space</span>
            <span className="text-xs text-muted-foreground/60">Your hand and the app hand exist together</span>
            <span className="text-xs text-muted-foreground/60">Move closer/further to see depth response</span>
          </div>
        )}

        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}

// Create default idle hand landmarks (roughly centered, relaxed pose)
function createIdleLandmarks(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.07, y: baseY + 0.03, z: 0 }, { x: baseX - 0.09, y: baseY, z: 0 }, { x: baseX - 0.1, y: baseY - 0.02, z: 0 }, // Thumb
    { x: baseX - 0.02, y: baseY + 0.02, z: 0 }, { x: baseX - 0.03, y: baseY - 0.04, z: 0 }, { x: baseX - 0.03, y: baseY - 0.08, z: 0 }, { x: baseX - 0.03, y: baseY - 0.11, z: 0 }, // Index
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX, y: baseY - 0.05, z: 0 }, { x: baseX, y: baseY - 0.1, z: 0 }, { x: baseX, y: baseY - 0.14, z: 0 }, // Middle
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.03, y: baseY - 0.04, z: 0 }, { x: baseX + 0.03, y: baseY - 0.08, z: 0 }, { x: baseX + 0.03, y: baseY - 0.11, z: 0 }, // Ring
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.05, y: baseY - 0.02, z: 0 }, { x: baseX + 0.05, y: baseY - 0.05, z: 0 }, { x: baseX + 0.05, y: baseY - 0.07, z: 0 }, // Pinky
  ];
}

// THUMBS UP: thumb points up, other fingers curled into fist
function createThumbsUpPose(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.05, z: 0 }, { x: baseX - 0.05, y: baseY - 0.02, z: 0 }, { x: baseX - 0.05, y: baseY - 0.08, z: 0 }, { x: baseX - 0.05, y: baseY - 0.13, z: 0 }, // Thumb UP
    { x: baseX - 0.02, y: baseY + 0.02, z: 0 }, { x: baseX - 0.02, y: baseY + 0.01, z: 0 }, { x: baseX - 0.01, y: baseY + 0.04, z: 0 }, { x: baseX, y: baseY + 0.06, z: 0 }, // Index curled
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX + 0.01, y: baseY + 0.04, z: 0 }, { x: baseX + 0.01, y: baseY + 0.06, z: 0 }, // Middle curled
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.05, z: 0 }, { x: baseX + 0.02, y: baseY + 0.07, z: 0 }, // Ring curled
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.05, z: 0 }, { x: baseX + 0.04, y: baseY + 0.07, z: 0 }, // Pinky curled
  ];
}

// PEACE: index and middle up, others curled
function createPeacePose(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.05, y: baseY + 0.04, z: 0 }, { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.03, y: baseY + 0.08, z: 0 }, // Thumb curled
    { x: baseX - 0.03, y: baseY + 0.02, z: 0 }, { x: baseX - 0.05, y: baseY - 0.04, z: 0 }, { x: baseX - 0.06, y: baseY - 0.09, z: 0 }, { x: baseX - 0.06, y: baseY - 0.13, z: 0 }, // Index UP
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX + 0.01, y: baseY - 0.05, z: 0 }, { x: baseX + 0.02, y: baseY - 0.1, z: 0 }, { x: baseX + 0.02, y: baseY - 0.14, z: 0 }, // Middle UP
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.05, z: 0 }, { x: baseX + 0.02, y: baseY + 0.07, z: 0 }, // Ring curled
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.05, z: 0 }, { x: baseX + 0.04, y: baseY + 0.07, z: 0 }, // Pinky curled
  ];
}

// FIST: all fingers curled
function createFistPose(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.05, y: baseY + 0.04, z: 0 }, { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.03, y: baseY + 0.08, z: 0 }, // Thumb
    { x: baseX - 0.02, y: baseY + 0.02, z: 0 }, { x: baseX - 0.02, y: baseY + 0.01, z: 0 }, { x: baseX - 0.01, y: baseY + 0.04, z: 0 }, { x: baseX, y: baseY + 0.06, z: 0 }, // Index
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX + 0.01, y: baseY + 0.04, z: 0 }, { x: baseX + 0.01, y: baseY + 0.06, z: 0 }, // Middle
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.05, z: 0 }, { x: baseX + 0.02, y: baseY + 0.07, z: 0 }, // Ring
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.05, z: 0 }, { x: baseX + 0.04, y: baseY + 0.07, z: 0 }, // Pinky
  ];
}

// MIDDLE FINGER: only middle extended
function createMiddleFingerPose(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.05, y: baseY + 0.04, z: 0 }, { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.03, y: baseY + 0.08, z: 0 }, // Thumb curled
    { x: baseX - 0.02, y: baseY + 0.02, z: 0 }, { x: baseX - 0.02, y: baseY + 0.01, z: 0 }, { x: baseX - 0.01, y: baseY + 0.04, z: 0 }, { x: baseX, y: baseY + 0.06, z: 0 }, // Index curled
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX, y: baseY - 0.05, z: 0 }, { x: baseX, y: baseY - 0.1, z: 0 }, { x: baseX, y: baseY - 0.15, z: 0 }, // Middle UP!
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.05, z: 0 }, { x: baseX + 0.02, y: baseY + 0.07, z: 0 }, // Ring curled
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.05, z: 0 }, { x: baseX + 0.04, y: baseY + 0.07, z: 0 }, // Pinky curled
  ];
}

// WAVE: open hand
function createWavePose(): HandLandmark[] {
  return createOpenPose();
}

// POINT: index extended, others curled
function createPointPose(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.05, y: baseY + 0.04, z: 0 }, { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.03, y: baseY + 0.08, z: 0 }, // Thumb
    { x: baseX - 0.02, y: baseY + 0.02, z: 0 }, { x: baseX - 0.03, y: baseY - 0.04, z: 0 }, { x: baseX - 0.03, y: baseY - 0.09, z: 0 }, { x: baseX - 0.03, y: baseY - 0.13, z: 0 }, // Index UP
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX + 0.01, y: baseY + 0.04, z: 0 }, { x: baseX + 0.01, y: baseY + 0.06, z: 0 }, // Middle curled
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.02, y: baseY + 0.05, z: 0 }, { x: baseX + 0.02, y: baseY + 0.07, z: 0 }, // Ring curled
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.04, y: baseY + 0.05, z: 0 }, { x: baseX + 0.04, y: baseY + 0.07, z: 0 }, // Pinky curled
  ];
}

// OPEN: all fingers extended
function createOpenPose(): HandLandmark[] {
  const baseX = 0.5, baseY = 0.5;
  return [
    { x: baseX, y: baseY + 0.1, z: 0 }, // Wrist
    { x: baseX - 0.04, y: baseY + 0.06, z: 0 }, { x: baseX - 0.07, y: baseY + 0.03, z: 0 }, { x: baseX - 0.09, y: baseY, z: 0 }, { x: baseX - 0.11, y: baseY - 0.02, z: 0 }, // Thumb
    { x: baseX - 0.02, y: baseY + 0.02, z: 0 }, { x: baseX - 0.03, y: baseY - 0.04, z: 0 }, { x: baseX - 0.04, y: baseY - 0.09, z: 0 }, { x: baseX - 0.04, y: baseY - 0.13, z: 0 }, // Index
    { x: baseX, y: baseY + 0.01, z: 0 }, { x: baseX, y: baseY - 0.05, z: 0 }, { x: baseX, y: baseY - 0.11, z: 0 }, { x: baseX, y: baseY - 0.15, z: 0 }, // Middle
    { x: baseX + 0.02, y: baseY + 0.02, z: 0 }, { x: baseX + 0.03, y: baseY - 0.04, z: 0 }, { x: baseX + 0.04, y: baseY - 0.09, z: 0 }, { x: baseX + 0.04, y: baseY - 0.12, z: 0 }, // Ring
    { x: baseX + 0.04, y: baseY + 0.03, z: 0 }, { x: baseX + 0.05, y: baseY - 0.02, z: 0 }, { x: baseX + 0.06, y: baseY - 0.06, z: 0 }, { x: baseX + 0.06, y: baseY - 0.09, z: 0 }, // Pinky
  ];
}
