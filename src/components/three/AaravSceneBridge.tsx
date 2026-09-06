import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, BoxHelper, Vector3 } from 'three';
import { useSimulationStore } from '../../store/useSimulationStore';
import { meshNamesFor } from '../../engine/aaravSceneMap';

export default function AaravSceneBridge() {
  const { scene, camera, controls } = useThree();
  const highlight = useSimulationStore(s => s.highlightedSlotId);
  const revision = useSimulationStore(s => s.highlightRevision);
  const focus = useSimulationStore(s => s.cameraFocusRequest);
  const vehicle = useSimulationStore(s => s.vehicleId);
  const helpers = useRef<BoxHelper[]>([]);
  const destination = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const orbit = controls as unknown as { target: Vector3; update(): void; addEventListener(type: string, cb: () => void): void; removeEventListener(type: string, cb: () => void): void } | null;
  useEffect(() => {
    const cancel = () => { destination.current = null; };
    orbit?.addEventListener('start', cancel);
    return () => orbit?.removeEventListener('start', cancel);
  }, [orbit]);
  useEffect(() => {
    const box = new Box3();
    const names = focus ? meshNamesFor(focus.slotId) : ['vehicle-root'];
    names.forEach(name => { const o = scene.getObjectByName(name); if (o) box.expandByObject(o); });
    if (box.isEmpty()) return;
    const target = box.getCenter(new Vector3());
    const size = Math.max(1.5, box.getSize(new Vector3()).length());
    destination.current = { target, position: target.clone().add(new Vector3(0.8, 0.5, 0.9).multiplyScalar(size)) };
  }, [focus, vehicle, scene]);
  useEffect(() => {
    if (!highlight) return;
    const list = meshNamesFor(highlight).flatMap(name => {
      const object = scene.getObjectByName(name);
      if (!object) return [];
      const helper = new BoxHelper(object, 0xffb020); scene.add(helper); return [helper];
    });
    helpers.current = list;
    const timer = setTimeout(() => useSimulationStore.getState().setHighlightedSlot(null), 5000);
    return () => { clearTimeout(timer); list.forEach(h => { scene.remove(h); h.geometry.dispose(); h.material.dispose(); }); helpers.current = []; };
  }, [highlight, revision, vehicle, scene]);
  useFrame((_, dt) => {
    helpers.current.forEach(h => h.update());
    const dest = destination.current;
    if (!dest) return;
    const alpha = 1 - Math.exp(-5 * dt);
    camera.position.lerp(dest.position, alpha);
    if (orbit) { orbit.target.lerp(dest.target, alpha); orbit.update(); } else camera.lookAt(dest.target);
    if (camera.position.distanceTo(dest.position) < 0.01) destination.current = null;
  });
  return null;
}
