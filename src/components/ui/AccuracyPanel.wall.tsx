import { TriangleAlert, CircleCheck } from 'lucide-react';
import type { YPlusStats } from '../../engine/voxel/wallGeometry';

export function WallModelRow({ stats, active }: { stats: YPlusStats; active: boolean }) {
  const coverage = stats.inBandFraction;
  const poor = coverage < 0.5;

  if (!active) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-white/35">Wall model</span>
        <span className="font-mono text-[11px] text-white/40">off</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-white/35">Wall y+</span>
        <span className={`font-mono text-[11px] tabular-nums ${poor ? 'text-amber-300/90' : 'text-emerald-300/90'}`}>
          {stats.median.toFixed(0)} med, {stats.min.toFixed(0)}-{stats.max.toFixed(0)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-white/35">Model valid on</span>
        <span className={`font-mono text-[11px] tabular-nums ${poor ? 'text-amber-300/90' : 'text-emerald-300/90'}`}>
          {(coverage * 100).toFixed(0)} % of surface
        </span>
      </div>

      {poor ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" />
          <p className="text-[10px] leading-relaxed text-white/55">
            The wall model's assumptions hold on only {(coverage * 100).toFixed(0)}% of the
            wetted surface at this resolution. Elsewhere it stands down toward the
            unmodelled solution.
          </p>
        </div>
      ) : (
        <div className="flex gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/70" />
          <p className="text-[10px] leading-relaxed text-white/45">
            First cell is inside the log layer over most of the body. Attached-flow
            friction is modelled; separated regions still fall back to the coarse
            solution.
          </p>
        </div>
      )}
    </div>
  );
}
