import { useFrame } from '@react-three/fiber';
import { ParticleField } from '../../render/particles/ParticleField';
import type { AaravSimulation } from '../../engine/useAaravSimulation';
import { useSimulationStore } from '../../store/useSimulationStore';
import { vehicleFor } from '../../data/vehicles/catalog';
import { FlowLines } from '../../render/field/FlowLines';

export function SolverDriver({ sim }: { sim: AaravSimulation }) {
  const style = useSimulationStore(s => s.flowStyle);
  const vehicleId = useSimulationStore(s => s.vehicleId);
  useFrame(() => { sim.tick(); });
  if (!sim.field) return null;
  return <>
    {style === 'trails' && <FlowLines field={sim.field} bounds={vehicleFor(vehicleId).bounds} uInlet={sim.uLattice} enabled={sim.status.kind === 'running'} />}
    {style === 'particles' && <ParticleField field={sim.field} uInlet={sim.uLattice} n={64} enabled={sim.status.kind === 'running'} />}
  </>;
}
