import { useFrame } from '@react-three/fiber';
import { ParticleField } from '../../render/particles/ParticleField';
import type { AaravSimulation } from '../../engine/useAaravSimulation';

/**
 * Lives inside <Canvas>. Does NOT own the simulation hook — that would call
 * useAaravSimulation() (and its GPU device request) once per Canvas remount,
 * and useFrame is only available inside the R3F tree, so the hook itself is
 * called once in SimulationViewport and passed down here.
 */
export function SolverDriver({ sim }: { sim: AaravSimulation }) {
  useFrame(() => {
    sim.tick();
  });

  if (sim.status.kind !== 'running' || !sim.field) return null;

  return <ParticleField field={sim.field} uInlet={sim.uLattice} n={96} />;
}
