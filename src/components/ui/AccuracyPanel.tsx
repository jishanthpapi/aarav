import { Info, TriangleAlert, CircleCheck, Loader2 } from 'lucide-react';
import type { DomainPlan, ReynoldsReport } from '../../engine/GridPlanner';
import type { ConvergenceState } from '../../engine/Convergence';

function Row({ label, value, tone = 'normal' }: {
  label: string; value: string; tone?: 'normal' | 'warn' | 'good';
}) {
  const colour = tone === 'warn' ? 'text-amber-300/90' : tone === 'good' ? 'text-emerald-300/90' : 'text-white/70';
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] uppercase tracking-widest text-white/35">{label}</span>
      <span className={`font-mono text-[11px] tabular-nums ${colour}`}>{value}</span>
    </div>
  );
}

export function AccuracyPanel({ plan, re, conv, cd }: {
  plan: DomainPlan; re: ReynoldsReport; conv: ConvergenceState; cd: number;
}) {
  const uncertaintyPct = Number.isFinite(conv.ci95) && Math.abs(cd) > 1e-9
    ? (conv.ci95 / Math.abs(cd)) * 100
    : NaN;

  return (
    <div className="w-72 space-y-3 rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        {conv.developing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
          : conv.converged ? <CircleCheck className="h-3.5 w-3.5 text-emerald-400/80" />
          : <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400/70" />}
        <span className="text-[11px] font-medium text-white/80">
          {conv.developing ? 'Flow developing'
            : conv.converged ? 'Converged'
            : 'Averaging'}
        </span>
        <span className="ml-auto font-mono text-[10px] text-white/35">{conv.stepsRun} steps</span>
      </div>

      <div className="space-y-1 border-t border-white/10 pt-3">
        <Row
          label="Statistical spread"
          value={Number.isFinite(uncertaintyPct) ? `+/- ${uncertaintyPct.toFixed(1)} %` : '—'}
          tone={uncertaintyPct > 5 ? 'warn' : 'good'}
        />
        <Row
          label="Resolution"
          value={`${plan.cellsPerLength.toFixed(0)} cells / length`}
          tone={plan.fidelity === 'good' ? 'good' : plan.fidelity === 'coarse' ? 'warn' : 'normal'}
        />
        <Row
          label="Blockage"
          value={`${(plan.blockageRatio * 100).toFixed(1)} %`}
          tone={plan.blockageRatio > 0.05 ? 'warn' : 'good'}
        />
        <Row
          label="Reynolds"
          value={re.achieved.toExponential(1)}
          tone={re.regime === 'fully-turbulent' ? 'good' : 'warn'}
        />
        <Row label="Regime" value={re.regime} />
      </div>

      <p className="border-t border-white/10 pt-3 text-[10px] leading-relaxed text-white/45">
        {re.note}
      </p>

      {plan.warnings.map((w) => (
        <div key={w} className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" />
          <p className="text-[10px] leading-relaxed text-white/55">{w}</p>
        </div>
      ))}

      <div className="flex gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-white/40" />
        <p className="text-[10px] leading-relaxed text-white/45">
          The statistical spread above is the scatter of this solver's own answer,
          not its distance from reality. Separation from sharp edges — wing trailing
          edges, diffuser exits, the rear of the body — is set by geometry and is
          captured well. Separation from smooth curves depends on a boundary layer
          this grid does not resolve, and is the largest remaining source of error.
        </p>
      </div>
    </div>
  );
}
