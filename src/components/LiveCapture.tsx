// Live Capture: webcam + hand tracking for Gesture Studio.
// The <video> element is always mounted, so toggling the preview never
// restarts the camera. Callbacks are read through refs, so a parent re-render
// doesn't restart the tracking loop.
import { useRef, useEffect, useState } from 'react';
import { initializeHandTracking, detectHands, setMaxHands, TrackedHand, TrackingResult } from '@/lib/handTracking';
import { physicalHandFromLabel } from '@/lib/hand/handGeometry';

export interface TrackingState {
  /** The user's physical left hand. */
  leftHand: TrackedHand | null;
  /** The user's physical right hand. */
  rightHand: TrackedHand | null;
  fps: number;
  t: number;
}

interface LiveCaptureProps {
  isActive: boolean;
  showVideo?: boolean;
  onTrackingUpdate?: (state: TrackingState) => void;
  onError?: (message: string) => void;
}

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export function LiveCapture({ isActive, showVideo = true, onTrackingUpdate, onError }: LiveCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onUpdateRef = useRef(onTrackingUpdate);
  const onErrorRef = useRef(onError);
  const showVideoRef = useRef(showVideo);
  onUpdateRef.current = onTrackingUpdate;
  onErrorRef.current = onError;
  showVideoRef.current = showVideo;

  const [status, setStatus] = useState<'off' | 'starting' | 'live' | 'error'>('off');
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Studio shows both hands. Warm the tracker before the camera is switched on.
  useEffect(() => {
    setMaxHands(2).catch(() => {});
    initializeHandTracking().catch(() => {});
  }, []);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let lastResult: TrackingResult | null = null;
    let lastFpsShown = -1;
    const videoEl = videoRef.current;

    const loop = (now: number) => {
      const video = videoRef.current;
      if (video && video.readyState >= 2) {
        const result = detectHands(video, now);
        if (result !== lastResult) {
          lastResult = result;
          let leftHand: TrackedHand | null = null;
          let rightHand: TrackedHand | null = null;
          for (const hand of result.hands) {
            if (physicalHandFromLabel(hand.handedness) === 'left') leftHand = hand;
            else rightHand = hand;
          }
          onUpdateRef.current?.({ leftHand, rightHand, fps: result.fps, t: now });
          if (result.fps !== lastFpsShown) {
            lastFpsShown = result.fps;
            setFps(result.fps);
          }
          if (showVideoRef.current) drawPreview(canvasRef.current, video, result);
        }
      }
      raf = requestAnimationFrame(loop);
    };

    (async () => {
      setStatus('starting');
      setError(null);
      try {
        await initializeHandTracking();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 60 }, facingMode: 'user' },
        });
        if (cancelled) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        setStatus('live');
        raf = requestAnimationFrame(loop);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to start camera';
        setError(msg);
        setStatus('error');
        onErrorRef.current?.(msg);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      if (videoEl) videoEl.srcObject = null;
      onUpdateRef.current?.({ leftHand: null, rightHand: null, fps: 0, t: performance.now() });
      setStatus('off');
      setFps(0);
    };
  }, [isActive]);

  return (
    <div className={showVideo ? 'space-y-2' : 'hidden'}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">Live Capture</h4>
        <span className="text-xs text-muted-foreground">{status === 'live' ? `${fps} FPS` : status}</span>
      </div>
      <div className="relative aspect-[4/3] bg-muted rounded overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full opacity-0" playsInline muted />
        <canvas ref={canvasRef} width={320} height={240} className="relative w-full h-full" />
        {status !== 'live' && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <span className="text-xs text-muted-foreground">
              {status === 'starting' ? 'Starting camera…' : status === 'error' ? 'Camera error' : 'Camera off'}
            </span>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function drawPreview(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, result: TrackingResult) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const { width: w, height: h } = canvas;
  ctx.save();
  ctx.scale(-1, 1); // mirror for a selfie view
  ctx.drawImage(video, -w, 0, w, h);
  ctx.restore();
  for (const hand of result.hands) {
    const color = physicalHandFromLabel(hand.handedness) === 'right' ? '#22d3ee' : '#f97316';
    const px = (x: number) => w - x * w;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    for (const [a, b] of CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(px(hand.landmarks[a].x), hand.landmarks[a].y * h);
      ctx.lineTo(px(hand.landmarks[b].x), hand.landmarks[b].y * h);
      ctx.stroke();
    }
    for (const p of hand.landmarks) {
      ctx.beginPath();
      ctx.arc(px(p.x), p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
