export const WALL_MODEL_WGSL = /* wgsl */ `
// Spalding-law wall model. Valid continuously from viscous sublayer through
// log layer, which matters here because the first cell lands in wildly
// different places over a single body on a browser-sized grid.
//
//   y+ = u+ + e^(-kB) * [ e^(k u+) - 1 - k u+ - (k u+)^2/2 - (k u+)^3/6 ]

const KAPPA: f32 = 0.41;
const B_LOG: f32 = 5.2;
const NEWTON_ITERS: u32 = 8u;
const U_MIN: f32 = 1e-6;

struct WallResult {
  uTau:      f32,
  yPlus:     f32,
  nuEff:     f32,
  inBand:    u32,
  resolved:  u32,
};

fn spaldingResidual(uTau: f32, uT: f32, y: f32, nu: f32) -> f32 {
  let uPlus = uT / max(uTau, 1e-12);
  let yPlus = y * uTau / nu;
  let ku    = KAPPA * uPlus;
  let expTerm = exp(-KAPPA * B_LOG) *
                (exp(ku) - 1.0 - ku - 0.5 * ku * ku - ku * ku * ku / 6.0);
  return uPlus + expTerm - yPlus;
}

fn solveUTau(uT: f32, y: f32, nu: f32) -> f32 {
  if (uT < U_MIN || y <= 0.0) { return 0.0; }

  var uTau = sqrt(nu * uT / y);
  uTau = max(uTau, 1e-8);

  for (var i = 0u; i < NEWTON_ITERS; i = i + 1u) {
    let f  = spaldingResidual(uTau, uT, y, nu);
    let h  = max(uTau * 1e-3, 1e-9);
    let df = (spaldingResidual(uTau + h, uT, y, nu) - f) / h;
    if (abs(df) < 1e-12) { break; }
    let step = f / df;
    uTau = max(uTau - clamp(step, -0.5 * uTau, 0.5 * uTau), 1e-9);
  }
  return uTau;
}

fn wallModel(uT: f32, y: f32, nu: f32) -> WallResult {
  var r: WallResult;
  r.uTau = solveUTau(uT, y, nu);
  r.yPlus = y * r.uTau / nu;
  r.inBand = select(0u, 1u, r.yPlus >= 30.0 && r.yPlus <= 300.0);
  r.resolved = select(0u, 1u, r.yPlus < 1.0);

  if (uT < U_MIN) {
    r.nuEff = nu;
  } else {
    r.nuEff = max(r.uTau * r.uTau * y / uT, nu);
  }
  return r;
}
`;
