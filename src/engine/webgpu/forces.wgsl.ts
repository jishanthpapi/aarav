export const FORCES_WGSL = /* wgsl */ `
override NX: u32 = 128u;
override NY: u32 = 64u;
override NZ: u32 = 64u;

const Q: u32 = 19u;
const SCALE: f32 = 100000.0;

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

@group(0) @binding(0) var<storage, read>       fPost:  array<f32>;
@group(0) @binding(1) var<storage, read>       flags:  array<u32>;
@group(0) @binding(2) var<storage, read_write> accum:  array<atomic<i32>, 4>;

fn cellIndex(p: vec3<u32>) -> u32 { return p.x + p.y * NX + p.z * NX * NY; }
fn fIndex(q: u32, i: u32) -> u32  { return q * (NX * NY * NZ) + i; }
fn inBounds(p: vec3<i32>) -> bool {
  return p.x >= 0 && p.y >= 0 && p.z >= 0 &&
         p.x < i32(NX) && p.y < i32(NY) && p.z < i32(NZ);
}

@compute @workgroup_size(4, 4, 4)
fn integrateForces(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { return; }
  let i = cellIndex(gid);
  if (flags[i] != 0u) { return; }

  let p = vec3<i32>(gid);
  var f = vec3<f32>(0.0);
  var links = 0;

  for (var q = 1u; q < Q; q = q + 1u) {
    let n = p + C[q];
    if (!inBounds(n)) { continue; }
    if (flags[cellIndex(vec3<u32>(n))] != 1u) { continue; }
    f = f + 2.0 * vec3<f32>(C[q]) * fPost[fIndex(q, i)];
    links = links + 1;
  }

  if (links == 0) { return; }

  atomicAdd(&accum[0], i32(f.x * SCALE));
  atomicAdd(&accum[1], i32(f.y * SCALE));
  atomicAdd(&accum[2], i32(f.z * SCALE));
  atomicAdd(&accum[3], links);
}

@compute @workgroup_size(1)
fn clearForces() {
  atomicStore(&accum[0], 0);
  atomicStore(&accum[1], 0);
  atomicStore(&accum[2], 0);
  atomicStore(&accum[3], 0);
}
`;

export const FORCE_SCALE = 100000.0;
