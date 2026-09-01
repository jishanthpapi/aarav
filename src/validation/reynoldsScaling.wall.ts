import type { ScalingCase } from './reynoldsScaling';

/**
 * Replaces `speed-invariance`. With a wall model, tau_w genuinely depends on
 * Re, so this constrains the SHAPE of the Cd(Re) dependence rather than
 * asserting it's near zero — stricter, not looser.
 */
export const REYNOLDS_TREND: ScalingCase = {
  id: 'reynolds-trend',
  description:
    'Cd(Re) must be weakly decreasing with an exponent consistent with a ' +
    'friction contribution scaling as Re^-0.2, not an arbitrary drift.',
  expect: (s) => {
    if (s.length < 4) return { pass: false, reason: 'need at least 4 speed samples' };

    const n = s.length;
    const lx = s.map(v => Math.log(v.re));
    const ly = s.map(v => Math.log(Math.max(v.cd, 1e-12)));
    const mx = lx.reduce((a, b) => a + b, 0) / n;
    const my = ly.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
    const slope = num / den;

    if (slope > 0.01) {
      return { pass: false, reason: `Cd rises with Re (exponent ${slope.toFixed(3)}) — unphysical here` };
    }
    if (slope < -0.20) {
      return {
        pass: false,
        reason: `Cd falls as Re^${slope.toFixed(3)}, steeper than pure skin friction (-0.2).`,
      };
    }
    return { pass: true };
  },
};
