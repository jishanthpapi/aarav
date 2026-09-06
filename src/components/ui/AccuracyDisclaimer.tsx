import { Info } from 'lucide-react';

export function AccuracyDisclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs leading-tight text-white/40">
        Real-time approximation — educational, not a certified CFD result.
      </p>
    );
  }

  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
      <div className="space-y-1">
        <p className="text-xs font-medium text-amber-200/90">
          Real-time approximation
        </p>
        <p className="text-xs leading-relaxed text-white/50">
          These figures come from a genuine but deliberately coarse flow solver
          running live in your browser. Geometry changes feed directly into the
          flow solver. Aerodynamic trends and absolute values still need validation;
          they are not a certified CFD result and should not be quoted as one.
        </p>
      </div>
    </div>
  );
}
