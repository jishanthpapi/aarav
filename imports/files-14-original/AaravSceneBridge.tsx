import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, type MeshStandardMaterial } from 'three';
import { useSimulationStore } from '../../store/useSimulationStore';
import { focusPointFor, meshNameFor } from '../../engine/aaravSceneMap';

/**
 * Lives inside <Canvas>, since it needs useThree for the scene graph, the
 * active camera, and the OrbitControls instance registered by
 * <OrbitControls makeDefault />. Renders nothing itself.
 *
 * Camera moves are an immediate jump, not an eased animation. Smoothing
 * that is a reasonable follow-up and is not required for the tool call to
 * actually move the camera.
 */
export default function AaravSceneBridge() {
  const { scene, camera, controls } = useThree();
  const highlightedSlotId = useSimulationStore(s => s.highlightedSlotId);
  const cameraFocusRequest = useSimulationStore(s => s.cameraFocusRequest);
  const restoreRef = useRef<{ meshName: string; emissive: Color } | null>(null);

  useEffect(() => {
    if (restoreRef.current) {
      const previous = scene.getObjectByName(restoreRef.current.meshName) as unknown as
        { material?: MeshStandardMaterial } | undefined;
      previous?.material?.emissive.copy(restoreRef.current.emissive);
      restoreRef.current = null;
    }

    if (!highlightedSlotId) return;
    const meshName = meshNameFor(highlightedSlotId);
    if (!meshName) return;
    const target = scene.getObjectByName(meshName) as unknown as
      { material?: MeshStandardMaterial } | undefined;
    if (!target?.material) return;

    restoreRef.current = { meshName, emissive: target.material.emissive.clone() };
    target.material.emissive.set('#ffb020');
  }, [highlightedSlotId, scene]);

  useEffect(() => {
    if (!cameraFocusRequest) return;
    const point = focusPointFor(cameraFocusRequest.slotId);
    camera.position.set(...point.position);
    camera.lookAt(...point.target);
    const orbit = controls as unknown as { target?: { set: (...args: number[]) => void }; update?: () => void } | null;
    orbit?.target?.set(...point.target);
    orbit?.update?.();
  }, [cameraFocusRequest, camera, controls]);

  return null;
}
