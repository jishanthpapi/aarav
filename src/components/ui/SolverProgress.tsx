import type { AaravSimulation } from '../../engine/useAaravSimulation';

export default function SolverProgress({ sim }: { sim: AaravSimulation }) {
  const { status, convergence: conv, plan, uLattice } = sim;
  const warmup = Math.ceil(2 * plan.grid.nx / uLattice);
  const label = status.kind === 'running'
    ? conv.developing ? 'Flow developing' : conv.converged ? 'Statistically settled' : 'Averaging'
    : status.kind === 'voxelizing' ? 'Updating geometry' : status.kind === 'initializing' ? 'Starting solver' : 'Solver unavailable';
  return <div className="absolute left-4 top-4 z-20 w-56 rounded-lg border border-white/10 bg-black/70 p-3 backdrop-blur-md">
    <div className="mb-2 flex justify-between gap-2 text-xs text-slate-300">
      <span role="status">{label}</span>
      {status.kind === 'running' && <span className="font-mono">{conv.stepsRun} steps</span>}
    </div>
    {status.kind === 'running' && conv.developing &&
      <progress aria-label="Flow development" className="h-1 w-full accent-blue-400" value={conv.stepsRun} max={warmup} />}
    {status.kind === 'running' && !conv.developing &&
      <p className="text-xs text-slate-400">{conv.samples} samples · statistical agreement only</p>}
  </div>;
}
