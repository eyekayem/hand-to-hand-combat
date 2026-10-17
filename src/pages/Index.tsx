import { useState, useCallback, useEffect, useRef } from 'react';
import { HandArena } from '@/components/HandArena';
import { TrackedHand } from '@/lib/handTracking';
import { extractFeatures, HandFeatures, resetFeatureHistory } from '@/lib/features';
import { pickPrimaryHand } from '@/lib/hand/handGeometry';
import { updateBehavior, getState, GestureCommand, BehaviorState, resetBehavior } from '@/lib/behaviorEngine';
import { NavLink } from '@/components/NavLink';

const Index = () => {
  const [cameraActive, setCameraActive] = useState(false);
  const [fps, setFps] = useState(0);


  const [currentFeatures, setCurrentFeatures] = useState<HandFeatures | null>(null);
  const [gesture, setGesture] = useState<GestureCommand | null>(null);
  const [behaviorState, setBehaviorState] = useState<BehaviorState>(getState());

  useEffect(() => {
    if (!cameraActive) {
      resetFeatureHistory();
      resetBehavior();
      setCurrentFeatures(null);
      setBehaviorState(getState());
    }
  }, [cameraActive]);

  const handleHandUpdate = useCallback((hands: TrackedHand[], trackingFps: number) => {
    setFps(trackingFps);
    const timestamp = performance.now();

    const primary = pickPrimaryHand(hands);
    const features: HandFeatures | null = primary ? extractFeatures(primary, timestamp) : null;
    setCurrentFeatures(features);

    const newGesture = updateBehavior(features, timestamp);
    setGesture(newGesture);
    setBehaviorState(getState());
  }, []);

  return (
    <div className="h-screen w-screen bg-background overflow-hidden flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold glow-text">Handspite Lab</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
              Call & Response
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <NavLink to="/studio" className="hover:text-foreground text-primary font-medium">
              Gesture Studio →
            </NavLink>
            <span>{fps} FPS</span>
            {behaviorState.isResponding && (
              <span className="text-primary animate-pulse">● RESPONDING</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex min-h-0 p-4 gap-4">
        {/* Arena */}
        <div className="flex-1 min-w-0 glass-panel p-4">
          <HandArena
            onHandUpdate={handleHandUpdate}
            gesture={gesture}
            isActive={cameraActive}
            onActiveChange={setCameraActive}
            detectedGesture={currentFeatures?.detectedGesture || 'NONE'}
          />
        </div>

        {/* Debug Panel */}
        <div className="w-64 flex-shrink-0 glass-panel p-4 overflow-y-auto">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Debug</h3>

          <div className="space-y-4 text-xs">
            <div>
              <div className="text-muted-foreground mb-2">Your Gesture</div>
              <div className="font-mono text-lg text-primary">
                {currentFeatures?.detectedGesture || 'NONE'}
              </div>
              {currentFeatures?.isStable && (
                <div className="text-primary mt-1">● Holding steady...</div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="text-muted-foreground mb-2">App Response</div>
              <div className="font-mono text-lg" style={{ color: gesture?.isResponding ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                {gesture?.isResponding ? gesture.gesture : 'WAITING'}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="text-muted-foreground mb-2">Finger Extensions</div>
              {currentFeatures && (
                <div className="space-y-1 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span>Thumb:</span>
                    <span>{(currentFeatures.thumbExtension * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Index:</span>
                    <span>{(currentFeatures.indexExtension * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Middle:</span>
                    <span>{(currentFeatures.middleExtension * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ring:</span>
                    <span>{(currentFeatures.ringExtension * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pinky:</span>
                    <span>{(currentFeatures.pinkyExtension * 100).toFixed(0)}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <div className="text-muted-foreground mb-2">Gesture Checks</div>
              {currentFeatures && (
                <div className="space-y-1 font-mono text-[10px]">
                  <div className={currentFeatures.isFist ? 'text-primary' : 'text-muted-foreground'}>
                    {currentFeatures.isFist ? '✓' : '○'} Fist
                  </div>
                  <div className={currentFeatures.isOpenHand ? 'text-primary' : 'text-muted-foreground'}>
                    {currentFeatures.isOpenHand ? '✓' : '○'} Open Hand
                  </div>
                  <div className={currentFeatures.isThumbsUp ? 'text-primary' : 'text-muted-foreground'}>
                    {currentFeatures.isThumbsUp ? '✓' : '○'} Thumbs Up
                  </div>
                  <div className={currentFeatures.isPeaceSign ? 'text-primary' : 'text-muted-foreground'}>
                    {currentFeatures.isPeaceSign ? '✓' : '○'} Peace
                  </div>
                  <div className={currentFeatures.isPoint ? 'text-primary' : 'text-muted-foreground'}>
                    {currentFeatures.isPoint ? '✓' : '○'} Point
                  </div>
                  <div className={currentFeatures.isWaving ? 'text-primary' : 'text-muted-foreground'}>
                    {currentFeatures.isWaving ? '✓' : '○'} Waving
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 px-6 py-2 border-t border-border/50 text-xs text-muted-foreground text-center">
        Make a gesture and hold still → App responds! | 👍→👍 | 👋→👋 | ✌️→✌️ | ✊→🖕
      </footer>
    </div>
  );
};

export default Index;
