import { TriangleAlert } from 'lucide-react';
import type { SimStatus } from '../../engine/useAaravSimulation';

export function SolverStatusBanner({ status }: { status: SimStatus }) {
  if (status.kind === 'running') return null;

  const message =
    status.kind === 'unsupported' ? status.reason :
    status.kind === 'error' ? status.message :
    'Starting solver...';

  return (
    <div className="absolute left-1/2 top-20 z-20 w-96 -translate-x-1/2 rounded-lg border border-amber-500/30 bg-black/80 p-3 backdrop-blur-md">
      <div className="flex gap-2">
        {status.kind !== 'initializing' && (
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/80" />
        )}
        <p className="text-[11px] leading-relaxed text-white/70">{message}</p>
      </div>
    </div>
  );
}
