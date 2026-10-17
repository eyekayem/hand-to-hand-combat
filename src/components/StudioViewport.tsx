// 3D Viewport for Gesture Studio. Hands are driven from refs inside useFrame,
// so tracking updates move them without re-rendering React.
import { useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { SceneText } from './SceneText';
import type { Group } from 'three';
import { Hand3D } from './Hand3D';

export interface HandState {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface StudioViewportProps {
  userHand: MutableRefObject<HandState>;
  /** Target pose; the app hand eases toward it. */
  appHandTarget: MutableRefObject<HandState>;
  showGrid?: boolean;
}

function DrivenHand({ source, ease, color, label }: {
  source: MutableRefObject<HandState>;
  ease: number | null; // null = follow exactly
  color: string;
  label: string;
}) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const { position: p, rotation: r } = source.current;
    // Frame-rate independent easing.
    const k = ease === null ? 1 : 1 - Math.pow(1 - ease, delta * 60);
    g.position.x += (p[0] - g.position.x) * k;
    g.position.y += (p[1] - g.position.y) * k;
    g.position.z += (p[2] - g.position.z) * k;
    g.rotation.x += (r[0] - g.rotation.x) * k;
    g.rotation.y += (r[1] - g.rotation.y) * k;
    g.rotation.z += (r[2] - g.rotation.z) * k;
  });
  const init = source.current;
  return (
    <group ref={group} position={init.position} rotation={init.rotation}>
      <Hand3D position={[0, 0, 0]} color={color} label={label} showPosition={false} />
    </group>
  );
}

export function StudioViewport({ userHand, appHandTarget, showGrid = true }: StudioViewportProps) {
  return (
    <Canvas camera={{ position: [0, 200, 400], fov: 60 }} style={{ background: '#1a1a2e' }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[100, 200, 100]} intensity={0.8} />
      <pointLight position={[-100, 100, -100]} intensity={0.3} />

      <DrivenHand source={userHand} ease={0.5} color="#22d3ee" label="User" />
      <DrivenHand source={appHandTarget} ease={0.1} color="#f97316" label="App" />

      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[40, 50, 32]} />
        <meshBasicMaterial color="#4a5568" opacity={0.3} transparent />
      </mesh>

      <SceneText position={[0, -100, 200]} fontSize={16} color="#22d3ee">+Z (User)</SceneText>
      <SceneText position={[0, -100, -200]} fontSize={16} color="#f97316">-Z (App)</SceneText>

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

      <OrbitControls enablePan enableZoom enableRotate minDistance={100} maxDistance={800} />
    </Canvas>
  );
}
