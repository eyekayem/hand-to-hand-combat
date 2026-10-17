// Arena: the user's hand and the app's hand share one canvas.
// Every camera frame runs geometry -> gesture graph -> response follower,
// and every animation frame draws. Nothing waits for a held gesture: the app
// hand is always easing toward whatever the user's hand is becoming.
//
// Per-frame state lives in refs. React only hears about it through a
// throttled snapshot for the debug panel.
import { useRef, useEffect, useCallback, useState } from 'react';
import { initializeHandTracking, detectHands, setMaxHands, TrackedHand, TrackingResult, HandLandmark } from '@/lib/handTracking';
import { computeGeometry, pickPrimaryHand, L, type HandGeometry } from '@/lib/hand/handGeometry';
import { handLandmarks, rotate } from '@/lib/hand/handModel';
import {
  resolve, graphInputFrom, ResponseFollower, CommitTracker, MOODS, IDLE, MOOD_RGB,
  type Resolution, type AppHandState, type Mood,
} from '@/lib/graph/gestureGraph';
import { WaveMeter } from '@/lib/graph/motion';

export interface ArenaSnapshot {
  fps: number;
  geometry: HandGeometry | null;
  resolution: Resolution | null;
  committed: string | null;
  app: AppHandState;
}

interface HandArenaProps {
  isActive: boolean;
  onActiveChange: (active: boolean) => void;
  onSnapshot?: (s: ArenaSnapshot) => void;
}


const SNAPSHOT_MS = 100;
const USER_RGB = '79, 209, 197';
const IDLE_TARGET = resolve({ fingers: IDLE.fingers, thumbUp: 0, wave: 0 }).target;

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
const TIPS = new Set<number>([L.THUMB_TIP, L.INDEX_TIP, L.MIDDLE_TIP, L.RING_TIP, L.PINKY_TIP]);

function moodColor(mood: Record<Mood, number>): [number, number, number] {
  let r = 0, g = 0, b = 0, w = 0;
  for (const m of MOODS) {
    const k = mood[m];
    r += MOOD_RGB[m][0] * k; g += MOOD_RGB[m][1] * k; b += MOOD_RGB[m][2] * k; w += k;
  }
  return w > 0 ? [r / w, g / w, b / w] : MOOD_RGB.neutral;
}

/** Skeleton with a cheap glow: one wide translucent pass, one sharp pass. No shadowBlur. */
function drawSkeleton(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], rgb: string, width: number, alpha: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, a] of [[width * 3.5, 0.18 * alpha], [width, alpha]] as const) {
    ctx.strokeStyle = `rgba(${rgb}, ${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const [s, e] of BONES) {
      ctx.moveTo(pts[s].x, pts[s].y);
      ctx.lineTo(pts[e].x, pts[e].y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const r = (TIPS.has(i) ? 1.6 : 1.1) * width;
    ctx.moveTo(p.x + r, p.y);
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  });
  ctx.fill();
}

export function HandArena({ isActive, onActiveChange, onSnapshot }: HandArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isActiveRef = useRef(isActive);
  const onSnapshotRef = useRef(onSnapshot);
  isActiveRef.current = isActive;
  onSnapshotRef.current = onSnapshot;

  // Warm the tracker as soon as the arena mounts, so Start only waits on the camera.
  useEffect(() => {
    // One hand: with 2 allowed and one in view, MediaPipe re-runs palm detection every frame.
    setMaxHands(1).catch(() => {});
    initializeHandTracking().catch(() => {
      /* surfaced on Start */
    });
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [stream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: 'user' },
        }),
        initializeHandTracking(),
      ]);
      streamRef.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      videoRef.current = video;
      onActiveChange(true);
    } catch (err) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setError(err instanceof Error ? err.message : 'Failed to start camera');
      onActiveChange(false);
    } finally {
      setIsLoading(false);
    }
  }, [onActiveChange]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    videoRef.current = null;
    onActiveChange(false);
  }, [onActiveChange]);

  useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;

    let dpr = 1;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(parent.clientWidth * dpr);
      canvas.height = Math.round(parent.clientHeight * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const follower = new ResponseFollower();
    const commit = new CommitTracker();
    const wave = new WaveMeter();
    let lastResult: TrackingResult | null = null;
    let user: TrackedHand | null = null;
    let geometry: HandGeometry | null = null;
    let resolution: Resolution | null = null;
    let committed: string | null = null;
    let fps = 0;
    let lastT = performance.now();
    let lastSnap = 0;
    let wavePhase = 0;
    const appPos = { x: 0.5, y: 0.45 };
    let raf = 0;

    const render = (t: number) => {
      const dt = Math.min(100, Math.max(0, t - lastT));
      lastT = t;
      const W = canvas.width, H = canvas.height;

      // 1. Input: new camera frame -> geometry -> graph.
      const video = videoRef.current;
      if (isActiveRef.current && video && video.readyState >= 2) {
        const result = detectHands(video, t);
        if (result !== lastResult) {
          lastResult = result;
          fps = result.fps;
          user = pickPrimaryHand(result.hands);
          if (user) {
            geometry = computeGeometry(user);
            const w = wave.update(user.landmarks[L.WRIST].x, t);
            resolution = resolve(graphInputFrom(geometry, w));
          } else {
            geometry = null;
            resolution = null;
            wave.reset();
          }
          committed = resolution ? commit.update(resolution, t) : null;
        }
      } else if (!isActiveRef.current) {
        user = null;
        geometry = null;
        resolution = null;
        committed = null;
      }

      // 2. Response: ease toward the blended target (idle when no hand).
      const app = follower.step(resolution?.target ?? IDLE_TARGET, dt);

      // App hand drifts toward a mirror of the user's hand position.
      const k = 1 - Math.exp(-dt / 120);
      const tx = user ? 1 - user.landmarks[L.WRIST].x : 0.5;
      const ty = user ? Math.min(0.75, user.landmarks[L.WRIST].y) : 0.5;
      appPos.x += (0.5 + (tx - 0.5) * 0.6 - appPos.x) * k;
      appPos.y += (0.42 + (ty - 0.5) * 0.3 - appPos.y) * k;
      wavePhase += dt * 0.012;

      // 3. Draw.
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, W, H);

      const aggression = app.mood.aggressive + app.mood.challenging * 0.5;
      const pxPerM = ((H * 0.38) / 0.18) * (1 + 0.25 * aggression);
      const sway = Math.sin(wavePhase) * 0.12 * app.wave;
      const appLm = rotate(handLandmarks({ fingers: app.fingers, roll: app.roll + sway * 2, thumbAbduct: app.thumbAbduct }), 0.35, 0, 0);
      const ox = appPos.x * W + Math.sin(wavePhase) * W * 0.06 * app.wave;
      const oy = appPos.y * H + 0.09 * pxPerM;
      const appPts = appLm.map((p: HandLandmark) => ({ x: ox + p.x * pxPerM, y: oy + p.y * pxPerM }));
      const [r, g, b] = moodColor(app.mood);
      drawSkeleton(ctx, appPts, `${r | 0}, ${g | 0}, ${b | 0}`, 2.4 * dpr * (1 + 0.3 * aggression), 0.55 + 0.35 * (1 - app.mood.neutral));

      if (user) {
        const userPts = user.landmarks.map(p => ({ x: (1 - p.x) * W, y: p.y * H }));
        drawSkeleton(ctx, userPts, USER_RGB, 2.6 * dpr, 0.95);
      }

      // 4. Throttled snapshot for the UI.
      if (t - lastSnap >= SNAPSHOT_MS) {
        lastSnap = t;
        onSnapshotRef.current?.({
          fps, geometry, resolution, committed,
          app: { ...app, fingers: { ...app.fingers }, mood: { ...app.mood } },
        });
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-end mb-3 px-2">
        <button
          onClick={isActive ? stopCamera : startCamera}
          disabled={isLoading}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            isActive ? 'bg-destructive/20 text-destructive hover:bg-destructive/30' : 'bg-primary/20 text-primary hover:bg-primary/30'
          }`}
        >
          {isLoading ? 'Loading…' : isActive ? 'Stop' : 'Start'}
        </button>
      </div>

      <div className="relative flex-1 bg-background rounded-lg overflow-hidden border border-border/30">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-destructive text-sm p-4 text-center z-10">{error}</div>
        )}
        {!isActive && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground text-sm z-10 gap-3 pointer-events-none">
            <span className="text-lg">Shared Space</span>
            <span className="text-xs text-muted-foreground/60">Your hand and the app hand exist together</span>
            <span className="text-xs text-muted-foreground/60">It answers as your hand changes, not after</span>
          </div>
        )}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
}
