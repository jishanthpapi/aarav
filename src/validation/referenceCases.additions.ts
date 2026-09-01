import type { AbsoluteAnchor, TrendCase } from './referenceCases';

export const LIFT_SLOPE_ANCHORS: AbsoluteAnchor[] = [
  {
    id: 'flat-plate-ar4',
    description: 'Flat plate, AR 4, lift-curve slope in the linear range (0-6 deg)',
    reynolds: 5e5,
    expectedCd: 4.19,
    tolerance: 0.25,
    source: 'Thin-airfoil theory + Prandtl lifting-line finite-span correction (analytic)',
    verified: true,
  },
  {
    id: 'ahmed-35',
    description: 'Ahmed reference body, 35 deg slant (post-critical, fully separated)',
    reynolds: 1e6,
    expectedCd: 0.26,
    tolerance: 0.25,
    source: 'Ahmed, Ramm & Faltin (1984) — read exact value + ref. area from paper',
    verified: false,
  },
];

export const AHMED_TRANSITION: TrendCase = {
  id: 'ahmed-slant-transition',
  description: 'Ahmed body: Cd peaks near 30 deg slant, then falls as the slant fully separates',
  sweep: [15, 20, 25, 30, 35, 40],
  expect: (cd) => {
    const peak = cd.indexOf(Math.max(...cd));
    if (peak === 0 || peak === cd.length - 1) {
      return { pass: false, reason: 'No interior Cd peak — the separation transition is not being captured' };
    }
    const slantAngles = [15, 20, 25, 30, 35, 40];
    const peakAngle = slantAngles[peak];
    return peakAngle >= 25 && peakAngle <= 35
      ? { pass: true }
      : { pass: false, reason: `Cd peaks at ${peakAngle} deg, expected 25-35 deg` };
  },
};

export const LIFT_SLOPE_TREND: TrendCase = {
  id: 'flat-plate-linear-range',
  description: 'Flat plate Cl must be linear in alpha below stall and pass through ~0 at 0 deg',
  sweep: [-4, -2, 0, 2, 4, 6],
  expect: (cl) => {
    const zeroIdx = 2;
    if (Math.abs(cl[zeroIdx]) > 0.05) {
      return { pass: false, reason: `Cl(0 deg) = ${cl[zeroIdx].toFixed(3)}, expected ~0 for a symmetric plate` };
    }
    const slopes: number[] = [];
    for (let i = 1; i < cl.length; i++) slopes.push(cl[i] - cl[i - 1]);
    const spread = (Math.max(...slopes) - Math.min(...slopes)) / Math.abs(slopes[0]);
    return spread < 0.2
      ? { pass: true }
      : { pass: false, reason: `Lift curve is non-linear below stall (slope spread ${(spread * 100).toFixed(0)}%)` };
  },
};
