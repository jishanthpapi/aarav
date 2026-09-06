import { lazy, Suspense } from 'react';
import PartLibrary from './PartLibrary';
import AaravChat from './AaravChat';

const SimulationViewport = lazy(() => import('./SimulationViewport'));

function SimulationLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-[#050505] text-sm text-slate-400" role="status">
      Loading simulation…
    </div>
  );
}

export default function Workstation() {
  return (
    <div className="relative h-full w-full flex flex-col md:flex-row overflow-hidden bg-[#050505]">
      {/* Left Sidebar: Part Library */}
      <aside className="max-h-[38vh] w-full shrink-0 overflow-y-auto md:max-h-none md:w-72 border-r border-white/10 bg-[#0a0a0a] z-10">
        <PartLibrary />
      </aside>

      {/* Main Viewport */}
      <main className="min-h-0 flex-1 relative">
        <Suspense fallback={<SimulationLoading />}>
          <SimulationViewport />
        </Suspense>
        <AaravChat />
      </main>
    </div>
  );
}
