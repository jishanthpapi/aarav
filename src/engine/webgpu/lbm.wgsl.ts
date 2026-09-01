export const LBM_WGSL = /* wgsl */ `
override NX: u32 = 128u;
override NY: u32 = 64u;
override NZ: u32 = 64u;

const Q: u32 = 19u;

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

// FLUID=0 SOLID=1 INLET=2 OUTLET=3 WALL=4
struct Params {
  omega:   f32,   // 1/tau
  uInlet:  f32,   // lattice units, Ma-capped host-side
  _pad0:   f32,
  _pad1:   f32,
};

@group(0) @binding(0) var<storage, read>       fIn:    array<f32>;
@group(0) @binding(1) var<storage, read_write> fOut:   array<f32>;
@group(0) @binding(2) var<storage, read>       flags:  array<u32>;
@group(0) @binding(3) var<storage, read_write> macros: array<vec4<f32>>; // (ux,uy,uz,rho)
@group(0) @binding(4) var<uniform>             params: Params;

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

fn equilibrium(q: u32, rho: f32, u: vec3<f32>) -> f32 {
  let cq  = vec3<f32>(C[q]);
  let cu  = dot(cq, u);
  let uu  = dot(u, u);
  return W[q] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * uu);
}

// ── 1. COLLISION (BGK) — also publishes macroscopic fields ──────────────────
@compute @workgroup_size(4, 4, 4)
fn collide(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);

  if (flags[i] == 1u) {
    macros[i] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    return;
  }

  var rho = 0.0;
  var mom = vec3<f32>(0.0);
  for (var q = 0u; q < Q; q = q + 1u) {
    let f = fIn[fIndex(q, i)];
    rho = rho + f;
    mom = mom + f * vec3<f32>(C[q]);
  }
  rho = max(rho, 1e-6);
  let u = mom / rho;

  macros[i] = vec4<f32>(u, rho);

  for (var q = 0u; q < Q; q = q + 1u) {
    let k = fIndex(q, i);
    let feq = equilibrium(q, rho, u);
    fOut[k] = fIn[k] - params.omega * (fIn[k] - feq);
  }
}

// ── 2. STREAMING (pull) + halfway bounce-back off solids ────────────────────
@compute @workgroup_size(4, 4, 4)
fn stream(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  if (flags[i] == 1u) { return; }

  let p = vec3<i32>(gid);
  for (var q = 0u; q < Q; q = q + 1u) {
    let src = p - C[q];
    let opp = opposite(q);
    if (!inBounds(src)) {
      fOut[fIndex(q, i)] = fIn[fIndex(opp, i)];
      continue;
    }
    let si = cellIndex(vec3<u32>(src));
    if (flags[si] == 1u) {
      fOut[fIndex(q, i)] = fIn[fIndex(opp, i)];   // no-slip wall
    } else {
      fOut[fIndex(q, i)] = fIn[fIndex(q, si)];
    }
  }
}

// ── 3. BOUNDARY — inlet / outlet / tunnel walls ─────────────────────────────
@compute @workgroup_size(4, 4, 4)
fn boundary(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  let flag = flags[i];

  if (flag == 2u) {
    let u = vec3<f32>(params.uInlet, 0.0, 0.0);
    for (var q = 0u; q < Q; q = q + 1u) {
      fOut[fIndex(q, i)] = equilibrium(q, 1.0, u);
    }
    macros[i] = vec4<f32>(u, 1.0);
    return;
  }

  if (flag == 3u) {
    let src = cellIndex(vec3<u32>(gid.x - 1u, gid.y, gid.z));
    for (var q = 0u; q < Q; q = q + 1u) {
      fOut[fIndex(q, i)] = fOut[fIndex(q, src)];
    }
    macros[i] = macros[src];
    return;
  }

  if (flag == 4u) {
    var rho = 0.0;
    var mom = vec3<f32>(0.0);
    for (var q = 0u; q < Q; q = q + 1u) {
      let f = fOut[fIndex(q, i)];
      rho = rho + f;
      mom = mom + f * vec3<f32>(C[q]);
    }
    rho = max(rho, 1e-6);
    var u = mom / rho;
    if (gid.y == 0u || gid.y == NY - 1u) { u.y = 0.0; }
    if (gid.z == 0u || gid.z == NZ - 1u) { u.z = 0.0; }
    for (var q = 0u; q < Q; q = q + 1u) {
      fOut[fIndex(q, i)] = equilibrium(q, rho, u);
    }
    macros[i] = vec4<f32>(u, rho);
  }
}

// ── Init: equilibrium at rest-plus-inlet ────────────────────────────────────
@compute @workgroup_size(4, 4, 4)
fn init(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  let u = select(vec3<f32>(params.uInlet, 0.0, 0.0), vec3<f32>(0.0), flags[i] == 1u);
  for (var q = 0u; q < Q; q = q + 1u) {
    fOut[fIndex(q, i)] = equilibrium(q, 1.0, u);
  }
  macros[i] = vec4<f32>(u, 1.0);
}
`;
