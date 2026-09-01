export interface AbsoluteAnchor {
  id: string;
  description: string;
  reynolds: number;
  expectedCd: number;
  tolerance: number;
  source: string;
  verified: boolean;
}

export const ABSOLUTE_ANCHORS: AbsoluteAnchor[] = [
  {
    id: 'sphere',
    description: 'Smooth sphere, subcritical regime',
    reynolds: 1e5,
    expectedCd: 0.47,
    tolerance: 0.30,
    source: 'Standard drag curve — cite a specific text/dataset before use',
    verified: false,
  },
  {
    id: 'cube-face-on',
    description: 'Cube, face normal to flow',
    reynolds: 1e5,
    expectedCd: 1.05,
    tolerance: 0.25,
    source: 'Standard bluff-body tables — cite before use',
    verified: false,
  },
  {
    id: 'ahmed-25',
    description: 'Ahmed reference body, 25 deg slant',
    reynolds: 1e6,
    expectedCd: 0.285,
    tolerance: 0.25,
    source: 'Ahmed, Ramm & Faltin (1984) — read exact value + ref. area from paper',
    verified: false,
  },
];

export interface TrendCase {
  id: string;
  description: string;
  sweep: number[];
  expect: (values: number[]) => { pass: boolean; reason?: string };
}

const monotonicIncreasing = (v: number[]) => {
  for (let i = 1; i < v.length; i++) {
    if (v[i] <= v[i - 1]) {
      return { pass: false, reason: `Non-monotonic at index ${i}: ${v[i - 1]} -> ${v[i]}` };
    }
  }
  return { pass: true };
};

export const TREND_CASES: TrendCase[] = [
  {
    id: 'wing-aoa-downforce',
    description: 'Rear wing: downforce rises with angle of attack, then stalls',
    sweep: [0, 4, 8, 12, 16, 20, 24, 28],
    expect: (cl) => {
      const peak = cl.indexOf(Math.min(...cl));
      if (peak === 0) return { pass: false, reason: 'No downforce gain with AoA at all' };
      if (peak === cl.length - 1) return { pass: false, reason: 'Never stalls — separation is not emerging' };
      const rising = monotonicIncreasing(cl.slice(0, peak + 1).map(v => -v));
      if (!rising.pass) return rising;
      return cl[cl.length - 1] > cl[peak]
        ? { pass: true }
        : { pass: false, reason: 'Post-stall downforce did not fall' };
    },
  },
  {
    id: 'wing-drag-penalty',
    description: 'Downforce costs drag — Cd must rise with wing angle',
    sweep: [0, 5, 10, 15, 20],
    expect: monotonicIncreasing,
  },
  {
    id: 'ride-height-ground-effect',
    description: 'Lowering ride height increases downforce until the floor stalls',
    sweep: [0.20, 0.15, 0.10, 0.07, 0.05, 0.03],
    expect: (cl) => {
      const peak = cl.indexOf(Math.min(...cl));
      return peak > 0 && peak < cl.length - 1
        ? { pass: true }
        : { pass: false, reason: 'No ground-effect peak — floor physics is not emerging' };
    },
  },
  {
    id: 'frontal-area-scaling',
    description: 'Doubling frontal area at fixed shape must not change Cd (it is normalised)',
    sweep: [1, 2, 4],
    expect: (cd) => {
      const spread = (Math.max(...cd) - Math.min(...cd)) / cd[0];
      return spread < 0.10
        ? { pass: true }
        : { pass: false, reason: `Cd varies ${(spread * 100).toFixed(0)}% with scale — reference area is wrong` };
    },
  },
  {
    id: 'speed-invariance',
    description: 'Cd must be nearly constant across speed in the turbulent regime',
    sweep: [80, 120, 160, 200, 250],
    expect: (cd) => {
      const spread = (Math.max(...cd) - Math.min(...cd)) / cd[0];
      return spread < 0.08
        ? { pass: true }
        : { pass: false, reason: `Cd drifts ${(spread * 100).toFixed(0)}% with speed — numerical, not physical` };
    },
  },
];
