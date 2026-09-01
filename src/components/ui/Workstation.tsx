import PartLibrary from './PartLibrary';
import SimulationViewport from './SimulationViewport';
import AaravChat from './AaravChat';
import SolverProgress from './SolverProgress';

export default function Workstation() {
  return (
    <div className="relative h-full w-full flex overflow-hidden bg-[#050505]">
      {/* Left Sidebar: Part Library */}
      <aside className="w-64 border-r border-white/10 bg-[#0a0a0a] z-10">
        <PartLibrary />
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 relative">
        <SolverProgress />
        <SimulationViewport />
        <AaravChat />
      </main>
    </div>
  );
}
