import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const SPEED = 6.5;
const scratchForward = new THREE.Vector3();
const scratchRight = new THREE.Vector3();

export function useMovement() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      keys.current[event.code] = true;
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const flatForward = useMemo(() => new THREE.Vector3(), []);
  const flatRight = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const forwardInput = Number(keys.current.KeyW) - Number(keys.current.KeyS);
    const strafeInput = Number(keys.current.KeyD) - Number(keys.current.KeyA);

    if (forwardInput === 0 && strafeInput === 0) {
      return;
    }

    camera.getWorldDirection(scratchForward);
    flatForward.copy(scratchForward.setY(0)).normalize();
    flatRight.copy(scratchRight.crossVectors(flatForward, camera.up)).normalize();

    camera.position.addScaledVector(flatForward, forwardInput * SPEED * delta);
    camera.position.addScaledVector(flatRight, strafeInput * SPEED * delta);
    camera.position.y = 1.7;
  });
}
