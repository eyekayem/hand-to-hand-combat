// 3D Viewport for Gesture Studio - Shows User and App hands
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text } from '@react-three/drei';
import { Hand3D } from './Hand3D';

interface HandState {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface StudioViewportProps {
  userHand: HandState;
  appHand: HandState;
  showGrid?: boolean;
}

export function StudioViewport({ userHand, appHand, showGrid = true }: StudioViewportProps) {
  return (
    <Canvas
      camera={{ position: [0, 200, 400], fov: 60 }}
      style={{ background: '#1a1a2e' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 200, 100]} intensity={0.8} />
      <pointLight position={[-100, 100, -100]} intensity={0.3} />

      {/* User Hand (cyan) - positioned at +Z */}
      <Hand3D
        position={userHand.position}
        rotation={userHand.rotation}
        color="#22d3ee"
        label="User"
        showPosition={true}
      />

      {/* App Hand (coral) - positioned at -Z */}
      <Hand3D
        position={appHand.position}
        rotation={appHand.rotation}
        color="#f97316"
        label="App"
        showPosition={true}
      />

      {/* Center plane indicator */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[40, 50, 32]} />
        <meshBasicMaterial color="#4a5568" opacity={0.3} transparent />
      </mesh>

      {/* Axis labels */}
      <Text position={[0, -100, 200]} fontSize={16} color="#22d3ee">
        +Z (User)
      </Text>
      <Text position={[0, -100, -200]} fontSize={16} color="#f97316">
        -Z (App)
      </Text>

      {/* Grid */}
      {showGrid && (
        <Grid
          args={[500, 500]}
          cellSize={50}
          cellThickness={0.5}
          cellColor="#334155"
          sectionSize={100}
          sectionThickness={1}
          sectionColor="#475569"
          fadeDistance={800}
          fadeStrength={1}
          followCamera={false}
          position={[0, -100, 0]}
        />
      )}

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={100}
        maxDistance={800}
      />
    </Canvas>
  );
}
