export const KARMAN = 0.41;
export const B_LOG = 5.2;

export interface ProfileSample {
  yPlus: number;
  uPlus: number;
}

export interface WallTestResult {
  id: string;
  pass: boolean;
  measured: string;
  expected: string;
  deviation: number;
  reason?: string;
}

export function checkLogLaw(samples: ProfileSample[], reTau = 395): WallTestResult {
  const TOL = 0.08;
  const inRegion = samples.filter(s => s.yPlus > 30 && s.yPlus < 0.3 * reTau);

  if (inRegion.length < 4) {
    return {
      id: 'log-law-recovery', pass: false, deviation: NaN,
      measured: `${inRegion.length} samples in the log region`,
      expected: 'at least 4 samples between y+ 30 and 0.3*Re_tau',
      reason: 'Grid too coarse to even sample the log region.',
    };
  }

  let worst = 0;
  for (const s of inRegion) {
    const uLog = Math.log(s.yPlus) / KARMAN + B_LOG;
    worst = Math.max(worst, Math.abs(s.uPlus - uLog) / uLog);
  }

  const first = inRegion[0], last = inRegion[inRegion.length - 1];
  const measuredKappa = Math.log(last.yPlus / first.yPlus) / (last.uPlus - first.uPlus);
  const kappaErr = Math.abs(measuredKappa - KARMAN) / KARMAN;

  const pass = worst < TOL && kappaErr < 0.15;
  return {
    id: 'log-law-recovery', pass,
    measured: `max profile error ${(worst * 100).toFixed(1)}%, kappa ${measuredKappa.toFixed(3)}`,
    expected: `<8% profile error, kappa 0.41 +/- 15%`,
    deviation: worst,
    reason: pass ? undefined
      : kappaErr >= 0.15
        ? `von Karman constant measured at ${measuredKappa.toFixed(3)} — the log-layer slope is wrong`
        : `profile deviates ${(worst * 100).toFixed(1)}% from the log law`,
  };
}

export function localCfPrandtl(reX: number): number {
  return 0.0592 * Math.pow(reX, -0.2);
}

export function checkSkinFriction(samples: { reX: number; cf: number }[]): WallTestResult {
  const MAG_TOL = 0.20;
  const EXP_TOL = 0.25;

  let worst = 0;
  for (const s of samples) {
    const expected = localCfPrandtl(s.reX);
    worst = Math.max(worst, Math.abs(s.cf - expected) / expected);
  }

  const n = samples.length;
  const lx = samples.map(s => Math.log(s.reX));
  const ly = samples.map(s => Math.log(Math.max(s.cf, 1e-12)));
  const mx = lx.reduce((a, b) => a + b, 0) / n;
  const my = ly.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
  const slope = den > 0 ? num / den : NaN;
  const slopeErr = Math.abs(slope - (-0.2)) / 0.2;

  const pass = worst < MAG_TOL && slopeErr < EXP_TOL;
  return {
    id: 'flat-plate-skin-friction', pass,
    measured: `max |dCf| ${(worst * 100).toFixed(1)}%, Re exponent ${slope.toFixed(3)}`,
    expected: `<20% magnitude error, exponent -0.200 +/- 25%`,
    deviation: worst,
    reason: pass ? undefined
      : slopeErr >= EXP_TOL
        ? `Re exponent ${slope.toFixed(3)} vs -0.200 — skin friction scales wrongly with Reynolds number`
        : `Cf off by ${(worst * 100).toFixed(1)}%`,
  };
}

export interface YPlusReport {
  min: number; max: number; median: number;
  inBandFraction: number;
  resolvedFraction: number;
  nonFinite: number;
  uiWarnsCoverage: boolean;
}

export function checkYPlusBand(r: YPlusReport): WallTestResult {
  const problems: string[] = [];
  if (r.nonFinite > 0) problems.push(`${r.nonFinite} cells with non-finite y+`);
  if (r.inBandFraction < 0.5 && !r.uiWarnsCoverage) {
    problems.push(
      `only ${(r.inBandFraction * 100).toFixed(0)}% of the surface is in the wall model's ` +
      `valid band and the UI does not say so`,
    );
  }
  return {
    id: 'y-plus-band', pass: problems.length === 0,
    measured: `y+ ${r.min.toFixed(1)}..${r.max.toFixed(1)} (median ${r.median.toFixed(1)}), ` +
              `${(r.inBandFraction * 100).toFixed(0)}% in band, ${(r.resolvedFraction * 100).toFixed(0)}% resolved`,
    expected: 'finite everywhere; coverage below 50% must be disclosed in the UI',
    deviation: 1 - r.inBandFraction,
    reason: problems.join('; ') || undefined,
  };
}

export function checkModelInertWhenResolved(
  cdModelOff: number, cdModelOn: number, maxYPlus: number,
): WallTestResult {
  const TOL = 0.01;
  const dev = Math.abs(cdModelOn - cdModelOff) / Math.abs(cdModelOff);
  const applicable = maxYPlus < 1.0;
  return {
    id: 'wall-model-inert-when-resolved',
    pass: applicable ? dev < TOL : false,
    measured: `Cd ${cdModelOff.toFixed(4)} -> ${cdModelOn.toFixed(4)} (${(dev * 100).toFixed(2)}%), max y+ ${maxYPlus.toFixed(2)}`,
    expected: '<1% change when the boundary layer is already resolved',
    deviation: dev,
    reason: !applicable
      ? `Test invalid: max y+ ${maxYPlus.toFixed(2)} >= 1, the case is not actually resolved`
      : dev >= TOL
        ? 'Wall model is altering an already-correct answer'
        : undefined,
  };
}

export function checkStallAngleUnmoved(stallOff: number, stallOn: number): WallTestResult {
  const TOL_DEG = 2;
  const d = Math.abs(stallOn - stallOff);
  return {
    id: 'stall-angle-preserved', pass: d <= TOL_DEG,
    measured: `stall ${stallOff}deg -> ${stallOn}deg`,
    expected: 'moves by at most 2 degrees',
    deviation: d,
    reason: d > TOL_DEG
      ? 'Wall model is changing separation behaviour, outside its validity envelope'
      : undefined,
  };
}

export const WALL_MODEL_GATING = true;
