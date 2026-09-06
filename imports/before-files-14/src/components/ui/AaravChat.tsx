import { MessageSquare } from 'lucide-react';

export default function AaravChat() {
  return (
    <div className="absolute bottom-6 left-4 hidden w-56 lg:block bg-[#0f0f0f] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-20">
      <div className="p-3 border-b border-white/10 bg-white/5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-slate-500" />
        <span className="text-xs font-semibold text-white/80 tracking-tight">Aarav AI</span>
      </div>
      <div className="p-4 overflow-y-auto text-xs text-white/40 italic">
        The tutor is not connected yet.
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          type="text"
          disabled
          placeholder="Ask Aarav about aerodynamics..."
          className="flex-1 bg-white/5 border border-white/10 rounded-md px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 transition-colors"
        />
        <button disabled aria-label="Tutor unavailable" className="p-2 bg-blue-600 hover:bg-blue-500 rounded-md transition-colors">
          <MessageSquare className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
