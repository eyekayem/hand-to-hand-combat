// Test Panel - Live gesture recognition
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Camera, CameraOff, Zap } from 'lucide-react';
import type { GestureMatch, TrainedGesture, FingerState, HandOrientation } from '@/lib/gestureTypes';

interface TestPanelProps {
  isCapturing: boolean;
  currentMatch: GestureMatch | null;
  allMatches: GestureMatch[];
  gestures: TrainedGesture[];
  currentFingers: FingerState | null;
  currentOrientation: HandOrientation | null;
}

function ConfidenceMeter({ confidence, label }: { confidence: number; label: string }) {
  const percentage = Math.round(confidence * 100);
  const color = confidence > 0.8 ? 'bg-green-500' : confidence > 0.6 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-mono">{percentage}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-150`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function TestPanel({
  isCapturing,
  currentMatch,
  allMatches,
  gestures,
  currentFingers,
  currentOrientation,
}: TestPanelProps) {
  if (!isCapturing) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <CameraOff className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">Enable camera to test gestures</p>
      </div>
    );
  }

  if (gestures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <p className="text-sm">No gestures to test.</p>
        <p className="text-xs mt-1">Teach some gestures first!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2 text-sm">
        <Camera className="w-4 h-4 text-primary animate-pulse" />
        <span>Scanning...</span>
      </div>

      {/* Current Match */}
      {currentMatch ? (
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-semibold text-lg">{currentMatch.gestureName}</span>
            <Badge variant="secondary" className="ml-auto">
              Position {currentMatch.matchedPosition}
            </Badge>
          </div>
          <ConfidenceMeter
            confidence={currentMatch.confidence}
            label="Overall Match"
          />
          <ConfidenceMeter
            confidence={currentMatch.orientationScore}
            label="Orientation"
          />
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-muted/50 text-center text-muted-foreground">
          <p className="text-sm">No gesture detected</p>
          <p className="text-xs mt-1">Make a gesture with your hand</p>
        </div>
      )}

      {/* All Matches */}
      {allMatches.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">All Matches</span>
          {allMatches.slice(0, 5).map((match) => (
            <div
              key={match.gestureId}
              className="flex items-center justify-between p-2 rounded bg-muted/30"
            >
              <span className="text-sm">{match.gestureName}</span>
              <div className="flex items-center gap-2">
                <Progress value={match.confidence * 100} className="w-16 h-2" />
                <span className="text-xs font-mono w-10 text-right">
                  {Math.round(match.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live finger state */}
      {currentFingers && (
        <div className="p-2 rounded bg-muted/30 space-y-1">
          <span className="text-[10px] text-muted-foreground">Live Fingers</span>
          <div className="flex gap-1 font-mono text-[10px]">
            <span>T:{Math.round(currentFingers.thumb * 100)}</span>
            <span>I:{Math.round(currentFingers.index * 100)}</span>
            <span>M:{Math.round(currentFingers.middle * 100)}</span>
            <span>R:{Math.round(currentFingers.ring * 100)}</span>
            <span>P:{Math.round(currentFingers.pinky * 100)}</span>
          </div>
          {currentOrientation && (
            <div className="text-[10px] text-muted-foreground">
              Palm: {currentOrientation.palmFacing} | Rot: {Math.round(currentOrientation.rotation * 180 / Math.PI)}°
            </div>
          )}
        </div>
      )}
    </div>
  );
}
