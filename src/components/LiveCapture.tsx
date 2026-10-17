// Live Capture Component - Webcam hand tracking
import { useRef, useEffect, useState, useCallback } from 'react';
import { initializeHandTracking, detectHands, isTrackingReady, TrackedHand } from '@/lib/handTracking';
import { Button } from '@/components/ui/button';

// Export tracking state for consumers
export interface TrackingState {
  leftHand: TrackedHand | null;
  rightHand: TrackedHand | null;
  fps: number;
}

interface LiveCaptureProps {
  isActive: boolean;
  showVideo?: boolean;
  // New unified callback
  onTrackingUpdate?: (state: TrackingState) => void;
  // Legacy callbacks for BlockingTool
  onHandsUpdate?: (leftHand: TrackedHand | null, rightHand: TrackedHand | null) => void;
  onActiveChange?: (active: boolean) => void;
}

export function LiveCapture({
  isActive,
  showVideo = true,
  onTrackingUpdate,
  onHandsUpdate,
  onActiveChange,
}: LiveCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  const [isInitializing, setIsInitializing] = useState(false);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [internalActive, setInternalActive] = useState(false);

  const startCapture = useCallback(async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // Initialize MediaPipe if needed
      if (!isTrackingReady()) {
        await initializeHandTracking();
      }

      // Get webcam stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setInternalActive(true);
      onActiveChange?.(true);
    } catch (err) {
      console.error('Failed to start capture:', err);
      setError(err instanceof Error ? err.message : 'Failed to start camera');
    } finally {
      setIsInitializing(false);
    }
  }, [onActiveChange]);

  const stopCapture = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setInternalActive(false);
    onActiveChange?.(false);
    onHandsUpdate?.(null, null);
    onTrackingUpdate?.({ leftHand: null, rightHand: null, fps: 0 });
  }, [onActiveChange, onHandsUpdate, onTrackingUpdate]);

  // Auto-start when isActive changes externally
  useEffect(() => {
    if (isActive && !internalActive && !isInitializing) {
      startCapture();
    } else if (!isActive && internalActive) {
      stopCapture();
    }
  }, [isActive, internalActive, isInitializing, startCapture, stopCapture]);

  // Tracking loop
  useEffect(() => {
    if (!internalActive || !videoRef.current) return;

    const video = videoRef.current;

    const trackFrame = () => {
      if (!internalActive || video.readyState !== 4) {
        animationRef.current = requestAnimationFrame(trackFrame);
        return;
      }

      const result = detectHands(video, performance.now());
      setFps(result.fps);

      // Separate left and right hands
      let leftHand: TrackedHand | null = null;
      let rightHand: TrackedHand | null = null;

      for (const hand of result.hands) {
        // MediaPipe reports handedness from camera's perspective (mirrored)
        // So 'Right' from camera = user's left hand
        if (hand.handedness === 'Right') {
          leftHand = hand;
        } else {
          rightHand = hand;
        }
      }

      // Call both callbacks for compatibility
      onHandsUpdate?.(leftHand, rightHand);
      onTrackingUpdate?.({ leftHand, rightHand, fps: result.fps });

      // Draw debug preview if showVideo is true
      if (showVideo && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          // Draw video (mirrored)
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(video, -canvasRef.current.width, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.restore();

          // Draw landmarks
          for (const hand of result.hands) {
            const color = hand.handedness === 'Right' ? '#22d3ee' : '#14b8a6';
            ctx.fillStyle = color;

            for (const landmark of hand.landmarks) {
              const x = canvasRef.current.width - (landmark.x * canvasRef.current.width);
              const y = landmark.y * canvasRef.current.height;
              ctx.beginPath();
              ctx.arc(x, y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      animationRef.current = requestAnimationFrame(trackFrame);
    };

    animationRef.current = requestAnimationFrame(trackFrame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [internalActive, onHandsUpdate, onTrackingUpdate, showVideo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Minimal mode - no UI, just tracking
  if (!showVideo) {
    return (
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">Live Capture</h4>
        <span className="text-xs text-muted-foreground">{fps} FPS</span>
      </div>

      {/* Video preview */}
      <div className="relative aspect-[4/3] bg-muted rounded overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover opacity-0"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={160}
          height={120}
          className="w-full h-full"
        />

        {!internalActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <span className="text-xs text-muted-foreground">Camera off</span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {onActiveChange && (
        <Button
          variant={internalActive ? "destructive" : "default"}
          size="sm"
          className="w-full"
          onClick={internalActive ? stopCapture : startCapture}
          disabled={isInitializing}
        >
          {isInitializing ? 'Starting...' : internalActive ? 'Stop Capture' : 'Start Capture'}
        </Button>
      )}

      {internalActive && onActiveChange && (
        <div className="text-xs text-muted-foreground">
          <p>• Move hands to control user hands</p>
          <p>• Depth (Z) from hand distance to camera</p>
        </div>
      )}
    </div>
  );
}
