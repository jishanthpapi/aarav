import { WallModelRow } from './AccuracyPanel.wall';
import { AccuracyDisclaimer } from './AccuracyDisclaimer';
import { AccuracyPanel } from './AccuracyPanel';
import { useSimulationStore } from '../../store/useSimulationStore';
import type { AaravSimulation } from '../../engine/useAaravSimulation';

function Metric({ label, value, unit, unstable }: {
  label: string; value: number; unit?: string; unstable: boolean;
}) {
  return <div className="flex flex-col gap-0.5">
    <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
    <span className={'font-mono text-xl tabular-nums ' + (unstable ? 'text-slate-500' : 'text-white')}>
      {unstable ? '—' : value.toFixed(unit ? 0 : 3)}
      {unit && !unstable && <span className="ml-1 text-xs text-slate-400">{unit}</span>}
    </span>
  </div>;
}

export function ReadoutPanel({ sim }: { sim: AaravSimulation }) {
  const { computed, readoutValid, readoutReason } = useSimulationStore();
  const tier = useSimulationStore(s => s.solverTier);
  const unstable = !readoutValid;
  return <div className="absolute bottom-4 left-4 right-4 z-20 max-h-[45%] w-auto sm:bottom-auto sm:left-auto sm:top-4 sm:max-h-[70%] sm:w-64 space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-4 backdrop-blur-md">
    <div className="grid grid-cols-2 gap-4">
      <Metric label="Drag (Cd)" value={computed.Cd} unstable={unstable} />
      <Metric label="Lift (Cl)" value={computed.Cl} unstable={unstable} />
    </div>
    <div className="border-t border-white/10 pt-3">
      <Metric label="Slow wake" value={computed.wakeSize} unit="cells" unstable={unstable} />
      <p className="mt-1 text-xs text-slate-400">Downstream fluid below half the inlet speed.</p>
    </div>
    {unstable && readoutReason && <p role="status" className="text-xs text-amber-300">{readoutReason}</p>}
    <p className="text-xs text-blue-200">{tier === 'fallback' ? 'WebGL2 stable fluids · unvalidated fallback' : 'WebGPU · D3Q19 LBM'}</p>
    <WallModelRow stats={sim.wallStats} active={sim.wallModelActive} />
    <p className="text-xs text-amber-200/80">Physical wall-model validation pending.</p>
    <AccuracyDisclaimer compact />
    {sim.reynolds?.resolutionLimited && <p className="text-xs text-amber-300">Requested wind speed exceeds this grid’s Reynolds limit. Further speed changes may produce the same simulated flow.</p>}
    {sim.reynolds && <details className="border-t border-white/10 pt-3">
      <summary className="cursor-pointer text-sm text-blue-200">Resolution &amp; uncertainty</summary>
      <AccuracyPanel plan={sim.plan} re={sim.reynolds} conv={sim.convergence} cd={computed.Cd} />
    </details>}
    <p className="text-xs text-amber-200/80">Aerodynamic trends and absolute values have not been validated.</p>
  </div>;
}
