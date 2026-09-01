export default function SolverProgress() {
  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-64 px-4 py-2 bg-black/60 border border-white/10 rounded-full backdrop-blur-md z-20">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/50 mb-1 px-1">
        <span>Solver Status</span>
        <span>Idle</span>
      </div>
      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
        <div className="h-full w-0 bg-blue-500 transition-all duration-500" />
      </div>
    </div>
  );
}
