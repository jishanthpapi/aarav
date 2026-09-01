import { AccuracyDisclaimer } from './AccuracyDisclaimer';
import { useSimulationStore } from '../../store/useSimulationStore';

function Metric({ label, value, unit, unstable }: {
  label: string; value: number; unit?: string; unstable: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-white/40">{label}</span>
      <span className={`font-mono text-xl tabular-nums ${unstable ? 'text-white/25' : 'text-white'}`}>
        {unstable ? '—' : value.toFixed(3)}
        {unit && !unstable && <span className="ml-1 text-xs text-white/40">{unit}</span>}
      </span>
    </div>
  );
}

export function ReadoutPanel() {
  const { computed, readoutValid, readoutReason } = useSimulationStore();
  const unstable = !readoutValid;

  return (
    <div className="absolute right-6 top-6 z-20 w-64 space-y-3 rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-md">
      <div className="grid grid-cols-2 gap-4">
        <Metric label="Drag (Cd)" value={computed.Cd} unstable={unstable} />
        <Metric label="Lift (Cl)" value={computed.Cl} unstable={unstable} />
      </div>

      <div className="border-t border-white/10 pt-3">
        <Metric label="Wake" value={computed.wakeSize} unit="cells" unstable={unstable} />
      </div>

      {unstable && readoutReason && (
        <p className="text-[10px] leading-tight text-amber-400/70">{readoutReason}</p>
      )}

      <AccuracyDisclaimer />
    </div>
  );
}
