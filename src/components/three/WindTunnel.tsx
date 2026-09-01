import { Grid } from '@react-three/drei';
import VehiclePlaceholder from './VehiclePlaceholder';

export default function WindTunnel() {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />

      {/* Simulation Grid */}
      <Grid
        infiniteGrid
        fadeDistance={30}
        sectionSize={1}
        sectionColor="#333"
        cellColor="#222"
      />

      {/* Placeholder Vehicle */}
      <VehiclePlaceholder />

      {/* Tunnel Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#080808" />
      </mesh>
    </>
  );
}
