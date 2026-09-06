import { TriangleAlert, CircleCheck } from 'lucide-react';
import type { YPlusStats } from '../../engine/voxel/wallGeometry';

export function WallModelRow({ stats, active }: { stats: YPlusStats | null; active: boolean }) {

  if (!active) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-white/35">Wall model</span>
        <span className="font-mono text-[11px] text-white/40">off</span>
      </div>
    );
  }

  if (!stats) return <p className="text-xs text-amber-300">Wall diagnostics pending.</p>;
  const coverage = stats.inBandFraction;
  const poor = coverage < 0.5 || stats.nonFinite > 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-white/35">Wall y+</span>
        <span className={`font-mono text-[11px] tabular-nums ${poor ? 'text-amber-300/90' : 'text-emerald-300/90'}`}>
          {stats.median.toFixed(0)} med, {stats.min.toFixed(0)}-{stats.max.toFixed(0)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] uppercase tracking-widest text-white/35">y+ in band</span>
        <span className={`font-mono text-[11px] tabular-nums ${poor ? 'text-amber-300/90' : 'text-emerald-300/90'}`}>
          {(coverage * 100).toFixed(0)} % of wall cells
        </span>
      </div>

      {poor ? (
        <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/80" />
          <p className="text-[10px] leading-relaxed text-white/55">
            Only {(coverage * 100).toFixed(0)}% of the
            wall-adjacent cells are in the y+ band at this resolution. This does not validate attached-flow assumptions or separated-flow accuracy.
          </p>
        </div>
      ) : (
        <div className="flex gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <CircleCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/70" />
          <p className="text-[10px] leading-relaxed text-white/45">
            Most wall-adjacent cells are in the target y+ band. Coverage alone does not establish model validity or separation accuracy.
          </p>
        </div>
      )}
    </div>
  );
}
