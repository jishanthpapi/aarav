export const LBM_TRT_WGSL = /* wgsl */ `
override NX: u32 = 128u;
override NY: u32 = 64u;
override NZ: u32 = 64u;
override SMAGORINSKY: u32 = 1u;

const Q: u32 = 19u;
const CS2: f32 = 0.3333333333;
const INV_CS2: f32 = 3.0;
const FORCE_SCALE: f32 = 100000.0;

const C = array<vec3<i32>, 19>(
  vec3<i32>( 0, 0, 0),
  vec3<i32>( 1, 0, 0), vec3<i32>(-1, 0, 0),
  vec3<i32>( 0, 1, 0), vec3<i32>( 0,-1, 0),
  vec3<i32>( 0, 0, 1), vec3<i32>( 0, 0,-1),
  vec3<i32>( 1, 1, 0), vec3<i32>(-1,-1, 0),
  vec3<i32>( 1,-1, 0), vec3<i32>(-1, 1, 0),
  vec3<i32>( 1, 0, 1), vec3<i32>(-1, 0,-1),
  vec3<i32>( 1, 0,-1), vec3<i32>(-1, 0, 1),
  vec3<i32>( 0, 1, 1), vec3<i32>( 0,-1,-1),
  vec3<i32>( 0, 1,-1), vec3<i32>( 0,-1, 1)
);

const W = array<f32, 19>(
  0.3333333333,
  0.0555555556, 0.0555555556, 0.0555555556,
  0.0555555556, 0.0555555556, 0.0555555556,
  0.0277777778, 0.0277777778, 0.0277777778, 0.0277777778,
  0.0277777778, 0.0277777778, 0.0277777778, 0.0277777778,
  0.0277777778, 0.0277777778, 0.0277777778, 0.0277777778
);

struct Params {
  omegaPlus:  f32,
  uInlet:     f32,
  csmag:      f32,
  lambdaTRT:  f32,
};

@group(0) @binding(0) var<storage, read>       fIn:    array<f32>;
@group(0) @binding(1) var<storage, read_write> fOut:   array<f32>;
@group(0) @binding(2) var<storage, read>       flags:  array<u32>;
@group(0) @binding(3) var<storage, read_write> macros: array<vec4<f32>>;
@group(0) @binding(4) var<uniform>             params: Params;
@group(0) @binding(5) var<storage, read>       qFrac:  array<f32>;
@group(0) @binding(6) var<storage, read_write> accum:  array<atomic<i32>, 4>;

fn cellIndex(p: vec3<u32>) -> u32 { return p.x + p.y * NX + p.z * NX * NY; }
fn fIndex(q: u32, i: u32) -> u32  { return q * (NX * NY * NZ) + i; }
fn opposite(q: u32) -> u32 {
  if (q == 0u) { return 0u; }
  if ((q & 1u) == 1u) { return q + 1u; }
  return q - 1u;
}
fn inBounds(p: vec3<i32>) -> bool {
  return p.x >= 0 && p.y >= 0 && p.z >= 0 &&
         p.x < i32(NX) && p.y < i32(NY) && p.z < i32(NZ);
}
fn isSolid(p: vec3<i32>) -> bool {
  if (!inBounds(p)) { return false; }
  return flags[cellIndex(vec3<u32>(p))] == 1u;
}
fn equilibrium(q: u32, rho: f32, u: vec3<f32>) -> f32 {
  let cq = vec3<f32>(C[q]);
  let cu = dot(cq, u);
  return W[q] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * dot(u, u));
}

// ── 1. COLLISION — TRT + Smagorinsky ────────────────────────────────────────
@compute @workgroup_size(4, 4, 4)
fn collide(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  if (flags[i] == 1u) {
    macros[i] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return;
  }

  var f: array<f32, 19>;
  var rho = 0.0;
  var mom = vec3<f32>(0.0);
  for (var q = 0u; q < Q; q = q + 1u) {
    let v = fIn[fIndex(q, i)];
    f[q] = v;
    rho = rho + v;
    mom = mom + v * vec3<f32>(C[q]);
  }
  rho = max(rho, 1e-6);
  let u = mom / rho;
  macros[i] = vec4<f32>(u, rho);

  var feq: array<f32, 19>;
  for (var q = 0u; q < Q; q = q + 1u) { feq[q] = equilibrium(q, rho, u); }

  var omegaP = params.omegaPlus;

  if (SMAGORINSKY == 1u) {
    var pi = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    for (var q = 1u; q < Q; q = q + 1u) {
      let d  = f[q] - feq[q];
      let cq = vec3<f32>(C[q]);
      pi[0] = pi[0] + d * cq.x * cq.x;
      pi[1] = pi[1] + d * cq.y * cq.y;
      pi[2] = pi[2] + d * cq.z * cq.z;
      pi[3] = pi[3] + d * cq.x * cq.y;
      pi[4] = pi[4] + d * cq.x * cq.z;
      pi[5] = pi[5] + d * cq.y * cq.z;
    }
    let piMag = sqrt(pi[0]*pi[0] + pi[1]*pi[1] + pi[2]*pi[2]
                   + 2.0*(pi[3]*pi[3] + pi[4]*pi[4] + pi[5]*pi[5]));
    let tau0 = 1.0 / omegaP;
    let cs2m = params.csmag * params.csmag;
    let tauT = 0.5 * (tau0 + sqrt(tau0 * tau0 + 25.4558441 * cs2m * piMag / rho));
    omegaP = 1.0 / max(tauT, 0.5000001);
  }

  let tauP   = 1.0 / omegaP;
  let tauM   = 0.5 + params.lambdaTRT / max(tauP - 0.5, 1e-6);
  let omegaM = 1.0 / tauM;

  for (var q = 0u; q < Q; q = q + 1u) {
    let qb = opposite(q);
    let fPlus   = 0.5 * (f[q]   + f[qb]);
    let fMinus  = 0.5 * (f[q]   - f[qb]);
    let ePlus   = 0.5 * (feq[q] + feq[qb]);
    let eMinus  = 0.5 * (feq[q] - feq[qb]);
    fOut[fIndex(q, i)] = f[q]
                       - omegaP * (fPlus  - ePlus)
                       - omegaM * (fMinus - eMinus);
  }
}

// ── 2. STREAM + Bouzidi interpolated bounce-back + momentum exchange ────────
@compute @workgroup_size(4, 4, 4)
fn streamBounceForce(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  if (flags[i] == 1u) { return; }

  let p = vec3<i32>(gid);
  var force = vec3<f32>(0.0);
  var links = 0;

  for (var d = 0u; d < Q; d = d + 1u) {
    let src = p - C[d];

    if (!inBounds(src)) {
      fOut[fIndex(d, i)] = fIn[fIndex(opposite(d), i)];
      continue;
    }
    let si = cellIndex(vec3<u32>(src));
    if (flags[si] != 1u) {
      fOut[fIndex(d, i)] = fIn[fIndex(d, si)];
      continue;
    }

    let q  = opposite(d);
    let fq = fIn[fIndex(q, i)];
    let qf = clamp(qFrac[fIndex(q, i)], 0.0, 1.0);

    var fNew: f32;
    let up = p + C[d];
    if (qf < 0.5) {
      if (inBounds(up) && !isSolid(up)) {
        let ui = cellIndex(vec3<u32>(up));
        fNew = 2.0 * qf * fq + (1.0 - 2.0 * qf) * fIn[fIndex(q, ui)];
      } else {
        fNew = fq;
      }
    } else {
      let inv = 1.0 / (2.0 * qf);
      fNew = inv * fq + (2.0 * qf - 1.0) * inv * fIn[fIndex(d, i)];
    }

    fOut[fIndex(d, i)] = fNew;
    force = force + vec3<f32>(C[q]) * (fq + fNew);
    links = links + 1;
  }

  if (links == 0) { return; }
  atomicAdd(&accum[0], i32(force.x * FORCE_SCALE));
  atomicAdd(&accum[1], i32(force.y * FORCE_SCALE));
  atomicAdd(&accum[2], i32(force.z * FORCE_SCALE));
  atomicAdd(&accum[3], links);
}

// ── 3. BOUNDARY — inlet / convective outlet / free-slip walls ───────────────
@compute @workgroup_size(4, 4, 4)
fn boundary(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  let flag = flags[i];

  if (flag == 2u) {
    let u = vec3<f32>(params.uInlet, 0.0, 0.0);
    for (var q = 0u; q < Q; q = q + 1u) { fOut[fIndex(q, i)] = equilibrium(q, 1.0, u); }
    macros[i] = vec4<f32>(u, 1.0);
    return;
  }

  if (flag == 3u) {
    let U = params.uInlet;
    let src = cellIndex(vec3<u32>(gid.x - 1u, gid.y, gid.z));
    let inv = 1.0 / (1.0 + U);
    for (var q = 0u; q < Q; q = q + 1u) {
      fOut[fIndex(q, i)] = (fIn[fIndex(q, i)] + U * fOut[fIndex(q, src)]) * inv;
    }
    macros[i] = macros[src];
    return;
  }

  if (flag == 4u) {
    var rho = 0.0;
    var mom = vec3<f32>(0.0);
    for (var q = 0u; q < Q; q = q + 1u) {
      let v = fOut[fIndex(q, i)];
      rho = rho + v;
      mom = mom + v * vec3<f32>(C[q]);
    }
    rho = max(rho, 1e-6);
    var u = mom / rho;
    if (gid.y == 0u || gid.y == NY - 1u) { u.y = 0.0; }
    if (gid.z == 0u || gid.z == NZ - 1u) { u.z = 0.0; }
    for (var q = 0u; q < Q; q = q + 1u) { fOut[fIndex(q, i)] = equilibrium(q, rho, u); }
    macros[i] = vec4<f32>(u, rho);
  }
}

@compute @workgroup_size(1)
fn clearForces() {
  atomicStore(&accum[0], 0); atomicStore(&accum[1], 0);
  atomicStore(&accum[2], 0); atomicStore(&accum[3], 0);
}

@compute @workgroup_size(4, 4, 4)
fn init(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  let u = select(vec3<f32>(params.uInlet, 0.0, 0.0), vec3<f32>(0.0), flags[i] == 1u);
  for (var q = 0u; q < Q; q = q + 1u) { fOut[fIndex(q, i)] = equilibrium(q, 1.0, u); }
  macros[i] = vec4<f32>(u, 1.0);
}
`;
