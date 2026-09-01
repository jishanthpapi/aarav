import { checkConservation, type ConservationReport } from './conservation';
import { checkSymmetry, type SymmetryReport } from './symmetry';
import { evaluateGci, GCI_CASES, type GciGateResult } from './gciGate';
import { judgePerf, PERF_BUDGETS, type PerfResult } from './perfBudget';
import { judgeFuzz, FUZZ_CASES, type FuzzResult } from './fuzzGeometry';
import { diffSignature, type SignatureDiff } from './goldenField';
import { TREND_CASES } from './referenceCases';

export const GATING = {
  conservation: true,
  symmetry: true,
  gci: true,
  fuzz: true,
  perf: true,
  trends: true,
  scaling: false,
  golden: false,     // flip on once a baseline has held for two weeks
  anchors: false,    // permanently: diagnostic only
} as const;

export interface HarnessReport {
  conservation: ConservationReport[];
  symmetry: SymmetryReport[];
  gci: GciGateResult[];
  perf: PerfResult[];
  fuzz: FuzzResult[];
  golden: SignatureDiff[];
  trends: { id: string; pass: boolean; reason?: string }[];
  anchors: { id: string; expected: number; actual: number; deviation: number }[];
  gatingFailures: string[];
  advisoryFailures: string[];
  exitCode: 0 | 1;
}

export function summarise(r: Omit<HarnessReport, 'gatingFailures' | 'advisoryFailures' | 'exitCode'>): HarnessReport {
  const gating: string[] = [];
  const advisory: string[] = [];

  const push = (gate: boolean, label: string, msgs: string[]) => {
    for (const m of msgs) (gate ? gating : advisory).push(`[${label}] ${m}`);
  };

  r.conservation.forEach(c => push(GATING.conservation, 'conservation', c.failures));
  r.symmetry.forEach(s => push(GATING.symmetry, `symmetry-${s.axis}`, s.failures));
  r.gci.forEach(g => push(GATING.gci, `gci-${g.case.geometryClass}`, g.failures.filter(f => !f.startsWith('WARN'))));
  r.gci.forEach(g => advisory.push(...g.failures.filter(f => f.startsWith('WARN')).map(f => `[gci-${g.case.geometryClass}] ${f}`)));
  r.perf.forEach(p => { if (!p.pass) push(GATING.perf, 'perf', [p.note]); else if (p.warn) advisory.push(`[perf] ${p.id}: ${p.note}`); });
  r.fuzz.forEach(f => { if (!f.pass) push(GATING.fuzz, 'fuzz', [`${f.id}: ${f.failure}`]); });
  r.trends.forEach(t => { if (!t.pass) push(GATING.trends, 'trend', [`${t.id}: ${t.reason ?? 'failed'}`]); });
  r.golden.forEach(g => { if (!g.pass) push(GATING.golden, 'golden', g.failures.map(f => `${g.caseId}: ${f}`)); });

  r.anchors.forEach(a => advisory.push(
    `[anchor] ${a.id}: ${a.actual.toFixed(3)} vs published ${a.expected.toFixed(3)} ` +
    `(${a.deviation >= 0 ? '+' : ''}${(a.deviation * 100).toFixed(0)}%) — reported, never corrected`,
  ));

  return { ...r, gatingFailures: gating, advisoryFailures: advisory, exitCode: gating.length ? 1 : 0 };
}

export function formatReport(r: HarnessReport): string {
  const lines = ['', '=== Aarav solver validation ===', ''];
  if (r.gatingFailures.length === 0) lines.push('All gating suites passed.');
  else {
    lines.push(`${r.gatingFailures.length} gating failure(s):`);
    r.gatingFailures.forEach(f => lines.push(`   ${f}`));
  }
  if (r.advisoryFailures.length) {
    lines.push('', 'Advisory (non-gating):');
    r.advisoryFailures.forEach(f => lines.push(`   ${f}`));
  }
  lines.push('', `Trend suite: ${r.trends.filter(t => t.pass).length}/${TREND_CASES.length} passing`, '');
  return lines.join('\n');
}
