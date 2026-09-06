import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, SRGBColorSpace } from 'three';
import { useGLTF, useTexture } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { vehicleFor } from '../../data/vehicles/catalog';
import { useSimulationStore } from '../../store/useSimulationStore';

export default function GenericCar() {
  const values = useSimulationStore(s => s.slotValues);
  const vehicleId = useSimulationStore(s => s.vehicleId);
  const renderMode = useSimulationStore(s => s.renderMode);
  const vehicle = vehicleFor(vehicleId);
  if (renderMode === 'asset' && vehicle.baseModelPath) return <AssetVehicle path={vehicle.baseModelPath} vehicleId={vehicleId} />;
  return <ProceduralVehicle values={values} vehicleId={vehicleId} />;
}

function ProceduralVehicle({ values, vehicleId }: { values: Record<string, number | boolean>; vehicleId: string }) {
  const atlas = useTexture(new URL('../../../assets/kenney-car-kit/Models/GLB format/Textures/colormap.png', import.meta.url).href);
  atlas.flipY = false;
  atlas.colorSpace = SRGBColorSpace;
  const meshes = useMemo(() => vehicleFor(vehicleId).build(values).map(part => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(part.positions, 3));
    if (part.uvs) geometry.setAttribute('uv', new BufferAttribute(part.uvs, 2));
    geometry.computeVertexNormals();
    return { ...part, geometry };
  }), [values, vehicleId]);
  useEffect(() => () => meshes.forEach(m => m.geometry.dispose()), [meshes]);
  return <group name="vehicle-root" userData={{ geometrySource: 'procedural' }}>
    {meshes.map(part => <mesh key={part.id} name={part.id} geometry={part.geometry} castShadow receiveShadow>
      <meshStandardMaterial color={part.color} map={part.uvs ? atlas : null} roughness={0.6} metalness={0.15} />
    </mesh>)}
  </group>;
}

function AssetVehicle({ path, vehicleId }: { path: string; vehicleId: string }) {
  const url = new URL('../../../' + path, import.meta.url).href;
  const { scene } = useGLTF(url);
  const model = useMemo(() => cloneSkeleton(scene), [scene]);
  // The NASA GLB carries a centimetre-scale node transform; normalize it to the plane definition.
  const scale = vehicleId === 'generic-plane' ? 10 : 1;
  return <primitive name="vehicle-asset" object={model} scale={scale} castShadow />;
}
