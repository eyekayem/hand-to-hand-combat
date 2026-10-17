// Teach Panel - Capture gesture positions
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Camera, Check, X } from 'lucide-react';
import type { FingerState, HandOrientation, GesturePosition } from '@/lib/gestureTypes';

interface TeachPanelProps {
  gestureName: string;
  onNameChange: (name: string) => void;
  position1: GesturePosition | null;
  position2: GesturePosition | null;
  onCapturePosition: (positionNumber: 1 | 2) => void;
  onSave: () => void;
  onClear: () => void;
  currentFingers: FingerState | null;
  currentOrientation: HandOrientation | null;
  isCapturing: boolean;
}

function FingerDisplay({ fingers, label }: { fingers: FingerState | null; label: string }) {
  if (!fingers) return null;

  const fingerNames = ['T', 'I', 'M', 'R', 'P'];
  const values = [fingers.thumb, fingers.index, fingers.middle, fingers.ring, fingers.pinky];

  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {fingerNames.map((name, i) => (
          <div key={name} className="text-center">
            <div className="text-[10px] text-muted-foreground">{name}</div>
            <div
              className="w-6 h-6 rounded text-[10px] flex items-center justify-center"
              style={{
                backgroundColor: `hsl(${values[i] * 120}, 70%, 40%)`,
                color: 'white'
              }}
            >
              {Math.round(values[i] * 100)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrientationDisplay({ orientation }: { orientation: HandOrientation | null }) {
  if (!orientation) return null;

  return (
    <div className="flex gap-2 text-xs">
      <Badge variant="secondary" className="text-[10px]">
        {orientation.palmFacing}
      </Badge>
      <Badge variant="secondary" className="text-[10px]">
        {Math.round(orientation.rotation * 180 / Math.PI)}°
      </Badge>
    </div>
  );
}

export function TeachPanel({
  gestureName,
  onNameChange,
  position1,
  position2,
  onCapturePosition,
  onSave,
  onClear,
  currentFingers,
  currentOrientation,
  isCapturing,
}: TeachPanelProps) {
  const canSave = gestureName.trim() && position1 && position2;

  return (
    <div className="space-y-4">
      {/* Gesture Name */}
      <div className="space-y-2">
        <Label htmlFor="gesture-name">Gesture Name</Label>
        <Input
          id="gesture-name"
          value={gestureName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Peace Sign"
          className="bg-background"
        />
      </div>

      {/* Current State */}
      {isCapturing && (
        <div className="p-3 rounded-lg bg-muted/50 space-y-2">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Live State</span>
          </div>
          <FingerDisplay fingers={currentFingers} label="Fingers" />
          <OrientationDisplay orientation={currentOrientation} />
        </div>
      )}

      {/* Position 1 */}
      <div className="p-3 rounded-lg border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Position 1 (Start)</span>
          {position1 ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <X className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        {position1 && (
          <FingerDisplay fingers={position1.fingerState} label="" />
        )}
        <Button
          size="sm"
          variant={position1 ? "outline" : "default"}
          onClick={() => onCapturePosition(1)}
          disabled={!isCapturing}
          className="w-full"
        >
          {position1 ? 'Recapture' : 'Capture'} Position 1
        </Button>
      </div>

      {/* Position 2 */}
      <div className="p-3 rounded-lg border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Position 2 (End)</span>
          {position2 ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <X className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        {position2 && (
          <FingerDisplay fingers={position2.fingerState} label="" />
        )}
        <Button
          size="sm"
          variant={position2 ? "outline" : "default"}
          onClick={() => onCapturePosition(2)}
          disabled={!isCapturing}
          className="w-full"
        >
          {position2 ? 'Recapture' : 'Capture'} Position 2
        </Button>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onClear}
          className="flex-1"
        >
          Clear
        </Button>
        <Button
          onClick={onSave}
          disabled={!canSave}
          className="flex-1"
        >
          Save Gesture
        </Button>
      </div>

      {/* Keyboard hints */}
      <div className="text-[10px] text-muted-foreground space-y-1">
        <div><kbd className="px-1 bg-muted rounded">1</kbd> Capture Position 1</div>
        <div><kbd className="px-1 bg-muted rounded">2</kbd> Capture Position 2</div>
        <div><kbd className="px-1 bg-muted rounded">S</kbd> Save gesture</div>
      </div>
    </div>
  );
}
