import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Html, Line, PointerLockControls, Sky, Stars } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useMovement } from '../hooks/useMovement';
import type { LayoutNode } from '../lib/types';

interface VeraSceneProps {
  nodes: LayoutNode[];
  activeNodeId: string | null;
  selectedNodeId: string | null;
  onActiveNodeChange: (nodeId: string | null) => void;
  onInspectNode: (nodeId: string) => void;
  artifactUrls: Record<string, string>;
}

function NodeMesh({
  node,
  isActive,
  isSelected,
  artifactUrl,
}: {
  node: LayoutNode;
  isActive: boolean;
  isSelected: boolean;
  artifactUrl?: string;
}) {
  const color = new THREE.Color().setHSL(0.62 - node.uncertainty * 0.35, 0.72, 0.55);
  const intensity = isSelected ? 3.8 : isActive ? 2.7 : 1.6;
  const scale = isSelected ? 1.18 : isActive ? 1.08 : 1;

  return (
    <group position={node.position}>
      <Float speed={1.4 + node.depth * 0.1} rotationIntensity={0.2} floatIntensity={0.45}>
        <mesh scale={[1.2 * scale, 1.8 * scale, 1.2 * scale]}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial emissive={color} emissiveIntensity={intensity} color={color.clone().multiplyScalar(0.5)} roughness={0.15} metalness={0.65} />
        </mesh>
      </Float>
      <mesh position={[0, -1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.55, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.65} />
      </mesh>
      <Html position={[0, 2.4, 0]} center distanceFactor={12} occlude>
        <div className={`node-label ${isSelected ? 'selected' : isActive ? 'active' : ''}`}>
          <strong>{node.title}</strong>
          <span>{node.relation}</span>
        </div>
      </Html>
      {artifactUrl ? (
        <Html position={[0, 0.8, -2.3]} transform distanceFactor={10}>
          <img className="artifact-badge" src={artifactUrl} alt={`${node.title} artifact`} />
        </Html>
      ) : null}
    </group>
  );
}

function SceneContents({
  nodes,
  activeNodeId,
  selectedNodeId,
  onActiveNodeChange,
  onInspectNode,
  artifactUrls,
}: VeraSceneProps) {
  const { camera } = useThree();
  useMovement();

  const nearestNode = useMemo(() => ({ current: null as string | null }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyE' && nearestNode.current) {
        onInspectNode(nearestNode.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onInspectNode, nearestNode]);

  useFrame(() => {
    let closest: { id: string | null; distance: number } = { id: null, distance: Infinity };

    for (const node of nodes) {
      const dx = node.position[0] - camera.position.x;
      const dy = node.position[1] - camera.position.y;
      const dz = node.position[2] - camera.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < closest.distance) {
        closest = { id: node.id, distance };
      }
    }

    const nextActive = closest.distance < 5.8 ? closest.id : null;
    if (nearestNode.current !== nextActive) {
      nearestNode.current = nextActive;
      onActiveNodeChange(nextActive);
    }
  });

  return (
    <>
      <color attach="background" args={['#050816']} />
      <fog attach="fog" args={['#050816', 12, 80]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[12, 18, 10]} intensity={1.7} color="#8ec5ff" />
      <pointLight position={[0, 6, 0]} intensity={2.5} color="#6df7ff" />
      <Sky distance={450000} sunPosition={[5, 0.8, 5]} inclination={0.52} azimuth={0.2} turbidity={8} rayleigh={0.6} />
      <Stars radius={120} depth={45} count={2500} factor={4} saturation={0.8} fade speed={0.6} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[180, 180, 1, 1]} />
        <meshStandardMaterial color="#08152d" roughness={0.9} metalness={0.18} />
      </mesh>

      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.8, 5, 80]} />
        <meshBasicMaterial color="#7ce6ff" transparent opacity={0.45} />
      </mesh>

      {nodes.map((node) => (
        <group key={node.id}>
          {node.parentId ? (
            <Line
              points={[
                nodes.find((candidate) => candidate.id === node.parentId)?.position ?? [0, 1.5, 0],
                node.position,
              ]}
              color={node.uncertainty > 0.6 ? '#ff6ad5' : '#62d7ff'}
              transparent
              opacity={0.55}
              lineWidth={1.6}
            />
          ) : null}
          <NodeMesh
            node={node}
            isActive={activeNodeId === node.id}
            isSelected={selectedNodeId === node.id}
            artifactUrl={artifactUrls[node.id]}
          />
        </group>
      ))}

      <PointerLockControls />
    </>
  );
}

export function VeraScene(props: VeraSceneProps) {
  return (
    <Canvas camera={{ position: [0, 1.7, 8], fov: 68 }}>
      <SceneContents {...props} />
    </Canvas>
  );
}
