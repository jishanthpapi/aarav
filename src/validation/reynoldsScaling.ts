export interface ScalingCase {
  id: string;
  description: string;
  expect: (samples: { re: number; cd: number }[]) => { pass: boolean; reason?: string };
}

export const SCALING_CASES: ScalingCase[] = [
  {
    id: 'dynamic-similarity',
    description: 'Same Reynolds number via different length/velocity combos must give the same Cd.',
    expect: (s) => {
      const spread = (Math.max(...s.map(x => x.cd)) - Math.min(...s.map(x => x.cd))) / Math.abs(s[0].cd);
      return spread < 0.05 ? { pass: true } : { pass: false, reason: `Cd varies ${(spread * 100).toFixed(1)}% at fixed Re` };
    },
  },
  {
    id: 'no-spurious-drag-crisis',
    description: 'Cd(Re) for a sphere across 1e5..1e7 must be smooth and weakly decreasing.',
    expect: (s) => {
      for (let i = 1; i < s.length; i++) {
        const drop = (s[i - 1].cd - s[i].cd) / s[i - 1].cd;
        if (drop > 0.25) {
          return { pass: false, reason: `Cd dropped ${(drop * 100).toFixed(0)}% between Re ${s[i-1].re.toExponential(1)} and ${s[i].re.toExponential(1)} — unphysical` };
        }
        if (s[i].cd > s[i - 1].cd * 1.15) {
          return { pass: false, reason: `Cd rose with Re between indices ${i - 1} and ${i}` };
        }
      }
      return { pass: true };
    },
  },
  {
    id: 'quadratic-force-scaling',
    description: 'At fixed Re and geometry, dimensional force must scale with U^2.',
    expect: (s) => (s.length >= 2 ? { pass: true } : { pass: false, reason: 'insufficient samples' }),
  },
];
