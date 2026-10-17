// 3D Blocking Tool - Lightweight scene development for hand choreography
import { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Text, PerspectiveCamera } from '@react-three/drei';
import { Vector3 } from 'three';
import { Hand3D } from '@/components/Hand3D';
import { LiveCapture } from '@/components/LiveCapture';
import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/NavLink';
import { TrackedHand, LANDMARK_INDICES } from '@/lib/handTracking';

interface HandState {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface SceneState {
  userLeft: HandState;
  userRight: HandState;
  appLeft: HandState;
  appRight: HandState;
}

type HandKey = keyof SceneState;

// Movement controller component
function MovementController({
  selectedHand,
  onMove
}: {
  selectedHand: HandKey | null;
  onMove: (hand: HandKey, delta: [number, number, number]) => void;
}) {
  const keysPressed = useRef<Set<string>>(new Set());
  const { camera } = useThree();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame(() => {
    if (!selectedHand) return;

    const speed = 5;
    let dx = 0, dy = 0, dz = 0;

    // WASD for horizontal movement
    if (keysPressed.current.has('w')) dz -= speed;
    if (keysPressed.current.has('s')) dz += speed;
    if (keysPressed.current.has('a')) dx -= speed;
    if (keysPressed.current.has('d')) dx += speed;

    // Q/E for vertical
    if (keysPressed.current.has('q')) dy -= speed;
    if (keysPressed.current.has('e')) dy += speed;

    if (dx !== 0 || dy !== 0 || dz !== 0) {
      onMove(selectedHand, [dx, dy, dz]);
    }
  });

  return null;
}

// Room grid and bounds
function Room() {
  return (
    <group>
      {/* Floor grid */}
      <Grid
        position={[0, -500, 0]}
        args={[1000, 1000]}
        cellSize={50}
        cellThickness={0.5}
        cellColor="#1a1a2e"
        sectionSize={100}
        sectionThickness={1}
        sectionColor="#3a3a5e"
        fadeDistance={2000}
        infiniteGrid={false}
      />

      {/* Walls - wireframe boxes for reference */}
      <mesh position={[0, 0, -500]}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#1a1a2e" transparent opacity={0.3} />
      </mesh>

      <mesh position={[0, 0, 500]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#2a1a1e" transparent opacity={0.3} />
      </mesh>

      <mesh position={[-500, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#1a2a1e" transparent opacity={0.3} />
      </mesh>

      <mesh position={[500, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#1a2a1e" transparent opacity={0.3} />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, 500, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#1a1a2e" transparent opacity={0.2} />
      </mesh>

      {/* Axis markers */}
      <Text position={[550, 0, 0]} fontSize={30} color="#ff6b6b">+X</Text>
      <Text position={[-550, 0, 0]} fontSize={30} color="#ff6b6b">-X</Text>
      <Text position={[0, 550, 0]} fontSize={30} color="#6bff6b">+Y</Text>
      <Text position={[0, -550, 0]} fontSize={30} color="#6bff6b">-Y</Text>
      <Text position={[0, 0, 550]} fontSize={30} color="#6b6bff">+Z (User)</Text>
      <Text position={[0, 0, -550]} fontSize={30} color="#6b6bff">-Z (App)</Text>

      {/* Center marker */}
      <mesh position={[0, -495, 0]}>
        <cylinderGeometry args={[20, 20, 5, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

// Scene with all hands
function Scene({
  state,
  selectedHand,
  onSelectHand,
  onMove
}: {
  state: SceneState;
  selectedHand: HandKey | null;
  onSelectHand: (hand: HandKey) => void;
  onMove: (hand: HandKey, delta: [number, number, number]) => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[800, 400, 800]} fov={60} />
      <OrbitControls enablePan enableZoom enableRotate />

      <ambientLight intensity={0.4} />
      <directionalLight position={[200, 500, 200]} intensity={1} />
      <directionalLight position={[-200, 300, -200]} intensity={0.5} />

      <Room />

      <MovementController selectedHand={selectedHand} onMove={onMove} />

      {/* User hands - positioned on +Z side (facing -Z) */}
      <group onClick={() => onSelectHand('userLeft')}>
        <Hand3D
          position={state.userLeft.position}
          rotation={state.userLeft.rotation}
          color="#4ecdc4"
          label="User L"
          isSelected={selectedHand === 'userLeft'}
        />
      </group>

      <group onClick={() => onSelectHand('userRight')}>
        <Hand3D
          position={state.userRight.position}
          rotation={state.userRight.rotation}
          color="#45b7aa"
          label="User R"
          isSelected={selectedHand === 'userRight'}
        />
      </group>

      {/* App hands - positioned on -Z side (facing +Z) */}
      <group onClick={() => onSelectHand('appLeft')}>
        <Hand3D
          position={state.appLeft.position}
          rotation={state.appLeft.rotation}
          color="#ff6b6b"
          label="App L"
          isSelected={selectedHand === 'appLeft'}
        />
      </group>

      <group onClick={() => onSelectHand('appRight')}>
        <Hand3D
          position={state.appRight.position}
          rotation={state.appRight.rotation}
          color="#ee5a5a"
          label="App R"
          isSelected={selectedHand === 'appRight'}
        />
      </group>
    </>
  );
}

export default function BlockingTool() {
  const [selectedHand, setSelectedHand] = useState<HandKey | null>('userRight');
  const [liveMode, setLiveMode] = useState(false);

  const [state, setState] = useState<SceneState>({
    // User hands on +Z side, facing -Z (toward app)
    userLeft: {
      position: [-100, 0, 300],
      rotation: [0, Math.PI, 0]
    },
    userRight: {
      position: [100, 0, 300],
      rotation: [0, Math.PI, 0]
    },
    // App hands on -Z side, facing +Z (toward user)
    appLeft: {
      position: [100, 0, -300],  // Mirrored X position
      rotation: [0, 0, 0]
    },
    appRight: {
      position: [-100, 0, -300], // Mirrored X position
      rotation: [0, 0, 0]
    },
  });

  // Map webcam hand tracking to 3D space
  const handleHandsUpdate = useCallback((leftHand: TrackedHand | null, rightHand: TrackedHand | null) => {
    setState(prev => {
      const next = { ...prev };

      // Map normalized coordinates (0-1) to 3D space (-500 to 500)
      // X: 0-1 → -400 to 400 (invert for mirror)
      // Y: 0-1 → 300 to -300 (invert Y, higher = up)
      // Z: depth from wrist world coords → 100 to 500

      if (leftHand) {
        const wrist = leftHand.landmarks[LANDMARK_INDICES.WRIST];
        const worldWrist = leftHand.worldLandmarks[LANDMARK_INDICES.WRIST];

        // Calculate depth from world Z (closer = more negative Z in world coords)
        const depth = 300 + (worldWrist.z * 400); // Closer hand = lower Z in 3D

        next.userLeft = {
          position: [
            (0.5 - wrist.x) * 800,  // Center and scale X
            (0.5 - wrist.y) * 600,  // Center and scale Y
            Math.max(100, Math.min(500, depth))
          ],
          rotation: [0, Math.PI, 0]
        };
      }

      if (rightHand) {
        const wrist = rightHand.landmarks[LANDMARK_INDICES.WRIST];
        const worldWrist = rightHand.worldLandmarks[LANDMARK_INDICES.WRIST];

        const depth = 300 + (worldWrist.z * 400);

        next.userRight = {
          position: [
            (0.5 - wrist.x) * 800,
            (0.5 - wrist.y) * 600,
            Math.max(100, Math.min(500, depth))
          ],
          rotation: [0, Math.PI, 0]
        };
      }

      return next;
    });
  }, []);

  const handleMove = useCallback((hand: HandKey, delta: [number, number, number]) => {
    // Disable manual movement when in live mode
    if (liveMode && (hand === 'userLeft' || hand === 'userRight')) return;

    setState(prev => {
      const current = prev[hand];
      const newPos: [number, number, number] = [
        Math.max(-500, Math.min(500, current.position[0] + delta[0])),
        Math.max(-500, Math.min(500, current.position[1] + delta[1])),
        Math.max(-500, Math.min(500, current.position[2] + delta[2])),
      ];
      return {
        ...prev,
        [hand]: { ...current, position: newPos }
      };
    });
  }, [liveMode]);

  const resetPositions = () => {
    setState({
      userLeft: { position: [-100, 0, 300], rotation: [0, Math.PI, 0] },
      userRight: { position: [100, 0, 300], rotation: [0, Math.PI, 0] },
      appLeft: { position: [100, 0, -300], rotation: [0, 0, 0] },
      appRight: { position: [-100, 0, -300], rotation: [0, 0, 0] },
    });
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">3D Blocking Tool</h1>
            <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
              1000³ Grid
            </span>
          </div>
          <div className="flex items-center gap-4">
            <NavLink to="/trainer" className="text-xs text-muted-foreground hover:text-foreground">
              Gesture Trainer
            </NavLink>
            <NavLink to="/" className="text-xs text-muted-foreground hover:text-foreground">
              ← Back to Arena
            </NavLink>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 flex min-h-0">
        <div className="flex-1 relative">
          <Canvas>
            <Scene
              state={state}
              selectedHand={selectedHand}
              onSelectHand={setSelectedHand}
              onMove={handleMove}
            />
          </Canvas>

          {/* Overlay controls */}
          <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur p-4 rounded-lg border border-border space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Controls</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-muted-foreground">W/S:</span><span>Forward/Back</span>
              <span className="text-muted-foreground">A/D:</span><span>Left/Right</span>
              <span className="text-muted-foreground">Q/E:</span><span>Up/Down</span>
              <span className="text-muted-foreground">Click:</span><span>Select hand</span>
              <span className="text-muted-foreground">Drag:</span><span>Orbit camera</span>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="w-64 flex-shrink-0 border-l border-border p-4 overflow-y-auto">
          {/* Live Capture */}
          <div className="mb-6 pb-6 border-b border-border">
            <LiveCapture
              isActive={liveMode}
              onActiveChange={setLiveMode}
              onHandsUpdate={handleHandsUpdate}
            />
          </div>

          <h3 className="text-sm font-medium mb-4">Hand Selection</h3>

          <div className="space-y-2 mb-6">
            {(['userLeft', 'userRight', 'appLeft', 'appRight'] as HandKey[]).map(hand => (
              <button
                key={hand}
                onClick={() => setSelectedHand(hand)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                  selectedHand === hand
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary hover:bg-secondary/80'
                } ${liveMode && (hand === 'userLeft' || hand === 'userRight') ? 'opacity-50' : ''}`}
              >
                {hand.replace(/([A-Z])/g, ' $1').trim()}
                {liveMode && (hand === 'userLeft' || hand === 'userRight') && (
                  <span className="text-xs ml-2 opacity-60">(live)</span>
                )}
              </button>
            ))}
          </div>

          {selectedHand && (
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground">
                {selectedHand.replace(/([A-Z])/g, ' $1').trim()} Position
              </h4>
              <div className="font-mono text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-destructive">X:</span>
                  <span>{state[selectedHand].position[0].toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-primary">Y:</span>
                  <span>{state[selectedHand].position[1].toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-accent-foreground">Z:</span>
                  <span>{state[selectedHand].position[2].toFixed(0)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={resetPositions}
            >
              Reset Positions
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Scene Layout</h4>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• User hands: +Z side (cyan)</p>
              <p>• App hands: -Z side (red)</p>
              <p>• Hands face each other</p>
              <p>• Grid: 1000×1000×1000</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
