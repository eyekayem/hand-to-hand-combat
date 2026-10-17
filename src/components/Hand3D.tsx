// Simple 3D Hand representation for blocking tool
import { useRef } from 'react';
import { Group } from 'three';
import { Text, Billboard } from '@react-three/drei';

interface Hand3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  label: string;
  isSelected?: boolean;
  showPosition?: boolean;
}

export function Hand3D({ position, rotation = [0, 0, 0], color, label, isSelected, showPosition = true }: Hand3DProps) {
  const groupRef = useRef<Group>(null);

  // Simple hand shape: palm + 5 fingers
  return (
    <group ref={groupRef} position={position} rotation={rotation}>
      {/* Selection indicator */}
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[80, 16, 16]} />
          <meshBasicMaterial color="#ffffff" wireframe opacity={0.3} transparent />
        </mesh>
      )}

      {/* Palm */}
      <mesh>
        <boxGeometry args={[40, 50, 15]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Thumb */}
      <mesh position={[-25, 0, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[25, 12, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Index finger */}
      <mesh position={[-12, 40, 0]}>
        <boxGeometry args={[10, 35, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Middle finger */}
      <mesh position={[0, 45, 0]}>
        <boxGeometry args={[10, 40, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Ring finger */}
      <mesh position={[12, 40, 0]}>
        <boxGeometry args={[10, 35, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Pinky finger */}
      <mesh position={[22, 32, 0]}>
        <boxGeometry args={[8, 28, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Label - always faces camera */}
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          position={[0, -60, 0]}
          fontSize={18}
          color="#ffffff"
          anchorX="center"
          anchorY="top"
          outlineWidth={1}
          outlineColor="#000000"
        >
          {label}
        </Text>

        {/* Position data */}
        {showPosition && (
          <group position={[0, -85, 0]}>
            <Text
              position={[0, 0, 0]}
              fontSize={12}
              color="#ff6b6b"
              anchorX="center"
              anchorY="top"
            >
              {`X: ${position[0].toFixed(0)}`}
            </Text>
            <Text
              position={[0, -15, 0]}
              fontSize={12}
              color="#6bff6b"
              anchorX="center"
              anchorY="top"
            >
              {`Y: ${position[1].toFixed(0)}`}
            </Text>
            <Text
              position={[0, -30, 0]}
              fontSize={12}
              color="#6b6bff"
              anchorX="center"
              anchorY="top"
            >
              {`Z: ${position[2].toFixed(0)}`}
            </Text>
          </group>
        )}
      </Billboard>
    </group>
  );
}
