export interface PerfBudget {
  id: string;
  description: string;
  budgetMs: number;
  warnAt: number;
}

export const PERF_BUDGETS: PerfBudget[] = [
  { id: 'voxelize', description: 'Voxelization + link fractions, per part swap (worker)', budgetMs: 400, warnAt: 0.6 },
  { id: 'step-high', description: 'One LBM step, high tier', budgetMs: 4.0, warnAt: 0.7 },
  { id: 'step-medium', description: 'One LBM step, medium tier', budgetMs: 6.0, warnAt: 0.7 },
  { id: 'step-fallback', description: 'One stable-fluids step, WebGL2 tier', budgetMs: 8.0, warnAt: 0.7 },
  { id: 'readback', description: 'Macros + force readback (throttled path)', budgetMs: 6.0, warnAt: 0.7 },
  { id: 'frame-total', description: 'Full frame incl. render + particles, medium tier', budgetMs: 16.6, warnAt: 0.8 },
];

export interface PerfResult {
  id: string;
  medianMs: number;
  p95Ms: number;
  budgetMs: number;
  pass: boolean;
  warn: boolean;
  note: string;
}

export function judgePerf(b: PerfBudget, samplesMs: number[]): PerfResult {
  const s = [...samplesMs].sort((a, x) => a - x);
  const pick = (q: number) => s[Math.min(s.length - 1, Math.floor(s.length * q))];
  const median = pick(0.5);
  const p95 = pick(0.95);
  const pass = p95 <= b.budgetMs;
  const warn = !pass || p95 > b.budgetMs * b.warnAt;
  return {
    id: b.id, medianMs: median, p95Ms: p95, budgetMs: b.budgetMs, pass, warn,
    note: pass
      ? `p95 ${p95.toFixed(2)}ms of ${b.budgetMs}ms budget`
      : `p95 ${p95.toFixed(2)}ms EXCEEDS ${b.budgetMs}ms — do not fix this by lowering resolution without recording the accuracy cost`,
  };
}
