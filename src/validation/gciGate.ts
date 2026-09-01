import { gridConvergenceIndex, type GciResult } from './gridConvergence';

export type GeometryClass = 'sharp-edge' | 'rounded' | 'thin-wing';

export interface GciCase {
  geometryClass: GeometryClass;
  description: string;
  metric: 'Cd' | 'Cl';
  minOrder: number;
  maxGci: number;
}

export const GCI_CASES: GciCase[] = [
  { geometryClass: 'rounded', description: 'Circular cylinder, cross-flow', metric: 'Cd', minOrder: 1.6, maxGci: 0.05 },
  { geometryClass: 'sharp-edge', description: 'Square cylinder, face-on', metric: 'Cd', minOrder: 1.3, maxGci: 0.05 },
  { geometryClass: 'thin-wing', description: 'Flat plate at 8 deg incidence, AR 4', metric: 'Cl', minOrder: 1.0, maxGci: 0.12 },
];

export interface GciGateResult extends GciResult {
  case: GciCase;
  pass: boolean;
  failures: string[];
}

export function evaluateGci(
  c: GciCase,
  coarse: { h: number; value: number },
  medium: { h: number; value: number },
  fine: { h: number; value: number },
): GciGateResult {
  const r = gridConvergenceIndex(coarse, medium, fine);
  const failures: string[] = [];

  if (!Number.isFinite(r.order)) {
    failures.push('Observed order is not finite — the three grids are not converging monotonically');
  } else if (r.order < c.minOrder) {
    failures.push(`Observed order ${r.order.toFixed(2)} below floor ${c.minOrder}`);
  }
  if (r.gciFine > c.maxGci) {
    failures.push(`GCI ${(r.gciFine * 100).toFixed(1)}% exceeds ${(c.maxGci * 100).toFixed(0)}%`);
  }
  if (!r.asymptotic) {
    failures.push('WARN: grids are outside the asymptotic range — GCI is indicative only');
  }

  const hard = failures.filter(f => !f.startsWith('WARN'));
  return { ...r, case: c, pass: hard.length === 0, failures };
}
