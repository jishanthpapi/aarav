export interface GciResult {
  order: number;
  extrapolated: number;
  gciFine: number;
  asymptotic: boolean;
}

export function gridConvergenceIndex(
  coarse: { h: number; value: number },
  medium: { h: number; value: number },
  fine: { h: number; value: number },
  safetyFactor = 1.25,
): GciResult {
  const r21 = medium.h / fine.h;
  const r32 = coarse.h / medium.h;
  const e21 = medium.value - fine.value;
  const e32 = coarse.value - medium.value;

  const s = Math.sign(e32 / e21) || 1;
  let p = 2;
  for (let i = 0; i < 50; i++) {
    const q = Math.log((Math.pow(r21, p) - s) / (Math.pow(r32, p) - s));
    p = Math.abs(Math.log(Math.abs(e32 / e21)) + q) / Math.log(r21);
  }

  const extrapolated = (Math.pow(r21, p) * fine.value - medium.value) / (Math.pow(r21, p) - 1);
  const relError21 = Math.abs(e21 / fine.value);
  const gciFine = (safetyFactor * relError21) / (Math.pow(r21, p) - 1);
  const gci32 = (safetyFactor * Math.abs(e32 / medium.value)) / (Math.pow(r32, p) - 1);

  return {
    order: p,
    extrapolated,
    gciFine,
    asymptotic: Math.abs((Math.pow(r21, p) * gciFine) / gci32 - 1) < 0.1,
  };
}
