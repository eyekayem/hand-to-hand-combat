// Gesture Trainer - Train custom gestures with 2-position capture
import { useState, useCallback, useRef, useEffect } from 'react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiveCapture } from '@/components/LiveCapture';
import { TrackedHand, LANDMARK_INDICES } from '@/lib/handTracking';
import { extractFeatures } from '@/lib/features';
import {
  TrainedGesture,
  GesturePosition,
  GestureMatch,
  FingerState,
  HandOrientation,
  fingerStateFromExtensions,
  calculatePalmFacing,
  calculateHandRotation,
  matchGesture,
  generateGestureId,
} from '@/lib/gestureTypes';

interface CurrentHandState {
  fingerState: FingerState;
  orientation: HandOrientation;
  relativePosition: { x: number; y: number; z: number };
}

export default function GestureTrainer() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [gestureName, setGestureName] = useState('');
  const [trainedGestures, setTrainedGestures] = useState<TrainedGesture[]>([]);
  const [currentHandState, setCurrentHandState] = useState<CurrentHandState | null>(null);
  const [position1, setPosition1] = useState<GesturePosition | null>(null);
  const [position2, setPosition2] = useState<GesturePosition | null>(null);
  const [activeMatches, setActiveMatches] = useState<GestureMatch[]>([]);
  const [testMode, setTestMode] = useState(false);

  const timestampRef = useRef(Date.now());

  // Process tracked hand into finger state and orientation
  const processHand = useCallback((hand: TrackedHand): CurrentHandState => {
    const features = extractFeatures(hand, {
      opennessThreshold: 0.5,
      fistThreshold: 0.35,
      pointThreshold: 0.5,
      boundaryY: 0.5,
      boundarySensitivity: 0.1,
      smoothingWindow: 5,
    }, timestampRef.current);

    const fingerState = fingerStateFromExtensions(
      features.thumbExtension,
      features.indexExtension,
      features.middleExtension,
      features.ringExtension,
      features.pinkyExtension
    );

    const L = LANDMARK_INDICES;
    const landmarks = hand.landmarks;

    const palmFacing = calculatePalmFacing(
      landmarks[L.WRIST],
      landmarks[L.INDEX_MCP],
      landmarks[L.PINKY_MCP],
      landmarks[L.MIDDLE_MCP]
    );

    const { rotation, tilt } = calculateHandRotation(
      landmarks[L.WRIST],
      landmarks[L.MIDDLE_MCP]
    );

    const orientation: HandOrientation = {
      palmFacing,
      rotation,
      tilt,
    };

    // Calculate relative position (centered)
    const wrist = landmarks[L.WRIST];
    const relativePosition = {
      x: (wrist.x - 0.5) * 2,  // -1 to 1
      y: (wrist.y - 0.5) * 2,  // -1 to 1
      z: hand.worldLandmarks[L.WRIST].z * 10, // depth
    };

    return { fingerState, orientation, relativePosition };
  }, []);

  // Handle hand tracking updates
  const handleHandsUpdate = useCallback((leftHand: TrackedHand | null, rightHand: TrackedHand | null) => {
    timestampRef.current = Date.now();

    // Use right hand by default for training
    const hand = rightHand || leftHand;
    if (!hand) {
      setCurrentHandState(null);
      setActiveMatches([]);
      return;
    }

    const state = processHand(hand);
    setCurrentHandState(state);

    // In test mode, try to match against trained gestures
    if (testMode && trainedGestures.length > 0) {
      const matches: GestureMatch[] = [];
      for (const gesture of trainedGestures) {
        const match = matchGesture(state.fingerState, state.orientation, gesture);
        if (match) {
          matches.push(match);
        }
      }
      // Sort by confidence
      matches.sort((a, b) => b.confidence - a.confidence);
      setActiveMatches(matches.slice(0, 3));
    }
  }, [processHand, testMode, trainedGestures]);

  // Capture current position
  const capturePosition = (posNum: 1 | 2) => {
    if (!currentHandState) return;

    const position: GesturePosition = {
      fingerState: { ...currentHandState.fingerState },
      orientation: { ...currentHandState.orientation },
      relativePosition: { ...currentHandState.relativePosition },
    };

    if (posNum === 1) {
      setPosition1(position);
    } else {
      setPosition2(position);
    }
  };

  // Save trained gesture
  const saveGesture = () => {
    if (!gestureName.trim() || !position1 || !position2) return;

    const gesture: TrainedGesture = {
      id: generateGestureId(),
      name: gestureName.trim(),
      position1,
      position2,
      transitionMs: 500,
      hand: 'right',
      createdAt: Date.now(),
    };

    setTrainedGestures(prev => [...prev, gesture]);

    // Reset form
    setGestureName('');
    setPosition1(null);
    setPosition2(null);
  };

  // Delete gesture
  const deleteGesture = (id: string) => {
    setTrainedGestures(prev => prev.filter(g => g.id !== id));
  };

  // Format finger state for display
  const formatFingerState = (state: FingerState) => {
    return Object.entries(state)
      .map(([finger, value]) => `${finger[0].toUpperCase()}: ${(value * 100).toFixed(0)}%`)
      .join(' | ');
  };

  // Format orientation for display
  const formatOrientation = (orient: HandOrientation) => {
    const degrees = (orient.rotation * 180 / Math.PI).toFixed(0);
    return `${orient.palmFacing} / ${degrees}°`;
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Gesture Trainer</h1>
            <span className={`text-xs px-2 py-0.5 rounded ${testMode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}>
              {testMode ? 'Test Mode' : 'Training Mode'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant={testMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTestMode(!testMode)}
            >
              {testMode ? 'Switch to Train' : 'Switch to Test'}
            </Button>
            <NavLink to="/" className="text-xs text-muted-foreground hover:text-foreground">
              ← Back to Arena
            </NavLink>
          </div>
        </div>
      </header>

      <main className="flex-1 flex min-h-0">
        {/* Left: Training Panel */}
        <div className="w-96 flex-shrink-0 border-r border-border p-4 overflow-y-auto">
          {/* Live Capture */}
          <div className="mb-6 pb-6 border-b border-border">
            <LiveCapture
              isActive={isCapturing}
              onActiveChange={setIsCapturing}
              onHandsUpdate={handleHandsUpdate}
            />
          </div>

          {/* Current Hand State */}
          <div className="mb-6 pb-6 border-b border-border">
            <h3 className="text-sm font-medium mb-3">Current Hand State</h3>
            {currentHandState ? (
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Fingers:</span>
                  <div className="font-mono mt-1 p-2 bg-secondary rounded">
                    {formatFingerState(currentHandState.fingerState)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Orientation:</span>
                  <div className="font-mono mt-1 p-2 bg-secondary rounded">
                    {formatOrientation(currentHandState.orientation)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Position:</span>
                  <div className="font-mono mt-1 p-2 bg-secondary rounded">
                    X: {currentHandState.relativePosition.x.toFixed(2)} |
                    Y: {currentHandState.relativePosition.y.toFixed(2)} |
                    Z: {currentHandState.relativePosition.z.toFixed(2)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No hand detected</p>
            )}
          </div>

          {/* Training Form */}
          {!testMode && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Train New Gesture</h3>

              <div>
                <label className="text-xs text-muted-foreground">Gesture Name</label>
                <Input
                  value={gestureName}
                  onChange={(e) => setGestureName(e.target.value)}
                  placeholder="e.g., Wave Hello"
                  className="mt-1"
                />
              </div>

              {/* Position 1 */}
              <div className="p-3 border border-border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Position 1 (Start)</span>
                  <Button
                    size="sm"
                    variant={position1 ? 'secondary' : 'default'}
                    onClick={() => capturePosition(1)}
                    disabled={!currentHandState}
                  >
                    {position1 ? 'Recapture' : 'Capture'}
                  </Button>
                </div>
                {position1 ? (
                  <div className="text-xs font-mono text-muted-foreground">
                    <div>{formatFingerState(position1.fingerState)}</div>
                    <div>{formatOrientation(position1.orientation)}</div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not captured</p>
                )}
              </div>

              {/* Position 2 */}
              <div className="p-3 border border-border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Position 2 (End)</span>
                  <Button
                    size="sm"
                    variant={position2 ? 'secondary' : 'default'}
                    onClick={() => capturePosition(2)}
                    disabled={!currentHandState}
                  >
                    {position2 ? 'Recapture' : 'Capture'}
                  </Button>
                </div>
                {position2 ? (
                  <div className="text-xs font-mono text-muted-foreground">
                    <div>{formatFingerState(position2.fingerState)}</div>
                    <div>{formatOrientation(position2.orientation)}</div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not captured</p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={saveGesture}
                disabled={!gestureName.trim() || !position1 || !position2}
              >
                Save Gesture
              </Button>
            </div>
          )}

          {/* Test Mode Matches */}
          {testMode && (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Detected Gestures</h3>
              {activeMatches.length > 0 ? (
                <div className="space-y-2">
                  {activeMatches.map((match, i) => (
                    <div
                      key={match.gestureId}
                      className={`p-3 rounded-lg border ${
                        i === 0 ? 'border-primary bg-primary/10' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{match.gestureName}</span>
                        <span className="text-xs">
                          {(match.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Position {match.matchedPosition} matched
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {trainedGestures.length === 0
                    ? 'No gestures trained yet'
                    : 'No gesture match detected'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: Trained Gestures List */}
        <div className="flex-1 p-6 overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">
            Trained Gestures ({trainedGestures.length})
          </h2>

          {trainedGestures.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-2">No gestures trained yet</p>
              <p className="text-sm">
                Start capturing by entering a name, then capture Position 1 and Position 2
              </p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {trainedGestures.map((gesture) => (
                <div
                  key={gesture.id}
                  className="p-4 border border-border rounded-lg bg-card"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium">{gesture.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {gesture.hand} hand • {gesture.transitionMs}ms transition
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteGesture(gesture.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Delete
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2 bg-secondary rounded">
                      <div className="font-medium mb-1">Position 1</div>
                      <div className="text-muted-foreground">
                        {formatFingerState(gesture.position1.fingerState)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatOrientation(gesture.position1.orientation)}
                      </div>
                    </div>
                    <div className="p-2 bg-secondary rounded">
                      <div className="font-medium mb-1">Position 2</div>
                      <div className="text-muted-foreground">
                        {formatFingerState(gesture.position2.fingerState)}
                      </div>
                      <div className="text-muted-foreground">
                        {formatOrientation(gesture.position2.orientation)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
