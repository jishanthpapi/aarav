import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import WindTunnel from '../three/WindTunnel';
import { SolverDriver } from '../three/SolverDriver';
import { SolverStatusBanner } from './SolverStatusBanner';
import { ReadoutPanel } from './ReadoutPanel';
import { useAaravSimulation } from '../../engine/useAaravSimulation';

export default function SimulationViewport() {
  // Called once here — owns the GPU device, the solver, and the render loop
  // driver. Passed down to SolverDriver (inside Canvas) and read directly
  // here for the 2D status banner (outside Canvas).
  const sim = useAaravSimulation();

  return (
    <div className="relative h-full w-full">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[5, 3, 5]} fov={50} />
        <OrbitControls makeDefault minDistance={2} maxDistance={20} />
        <WindTunnel />
        <SolverDriver sim={sim} />
      </Canvas>
      <SolverStatusBanner status={sim.status} />
      {sim.status.kind === 'running' && <ReadoutPanel />}
    </div>
  );
}
