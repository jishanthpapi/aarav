import type { WebGLRenderer } from 'three';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import AaravSceneBridge from '../three/AaravSceneBridge';
import { LessonPanel } from './LessonPanel';
import WindTunnel from '../three/WindTunnel';
import { SolverDriver } from '../three/SolverDriver';
import { SolverStatusBanner } from './SolverStatusBanner';
import { ReadoutPanel } from './ReadoutPanel';
import SolverProgress from './SolverProgress';
import { useAaravSimulation } from '../../engine/useAaravSimulation';

export default function SimulationViewport() {
  // Called once here — owns the GPU device, the solver, and the render loop
  // driver. Passed down to SolverDriver (inside Canvas) and read directly
  // here for the 2D status banner (outside Canvas).
  const [renderer, setRenderer] = useState<WebGLRenderer | null>(null);
  const sim = useAaravSimulation(renderer);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows onCreated={({ gl }) => {
        setRenderer(gl);
      }}>
        <PerspectiveCamera makeDefault position={[5, 3, 5]} fov={50} />
        <OrbitControls makeDefault minDistance={2} maxDistance={20} />
        <WindTunnel />
        <AaravSceneBridge />
        <SolverDriver sim={sim} />
      </Canvas>
      <LessonPanel />
      <SolverProgress sim={sim} />
      <SolverStatusBanner status={sim.status} />
      <ReadoutPanel sim={sim} />
    </div>
  );
}
