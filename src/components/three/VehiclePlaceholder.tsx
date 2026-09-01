export default function VehiclePlaceholder() {
  return (
    <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
      <boxGeometry args={[2, 1, 4]} />
      <meshStandardMaterial color="#3b82f6" wireframe={false} />
    </mesh>
  );
}
