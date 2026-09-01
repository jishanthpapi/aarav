import { CELL, type GridSpec } from './Voxelizer';

const D3Q19: [number, number, number][] = [
  [0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
  [1,1,0],[-1,-1,0],[1,-1,0],[-1,1,0],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1],
  [0,1,1],[0,-1,-1],[0,1,-1],[0,-1,1],
];

function rayTriangle(
  o: Float32Array | number[], dir: number[],
  a: number[], b: number[], c: number[],
): number {
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const pv = [
    dir[1]*e2[2] - dir[2]*e2[1],
    dir[2]*e2[0] - dir[0]*e2[2],
    dir[0]*e2[1] - dir[1]*e2[0],
  ];
  const det = e1[0]*pv[0] + e1[1]*pv[1] + e1[2]*pv[2];
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det;
  const tv = [o[0]-a[0], o[1]-a[1], o[2]-a[2]];
  const u = (tv[0]*pv[0] + tv[1]*pv[1] + tv[2]*pv[2]) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return -1;
  const qv = [
    tv[1]*e1[2] - tv[2]*e1[1],
    tv[2]*e1[0] - tv[0]*e1[2],
    tv[0]*e1[1] - tv[1]*e1[0],
  ];
  const v = (dir[0]*qv[0] + dir[1]*qv[1] + dir[2]*qv[2]) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
  return (e2[0]*qv[0] + e2[1]*qv[1] + e2[2]*qv[2]) * inv;
}

export function computeLinkFractions(
  positions: Float32Array,
  flags: Uint32Array,
  grid: GridSpec,
  bucket = 4,
): Float32Array {
  const { nx, ny, nz, dx, origin } = grid;
  const cells = nx * ny * nz;
  const out = new Float32Array(cells * 19).fill(0.5);

  const bx = Math.ceil(nx / bucket), by = Math.ceil(ny / bucket), bz = Math.ceil(nz / bucket);
  const buckets: number[][] = Array.from({ length: bx * by * bz }, () => []);
  const gi = (x: number) => Math.floor((x - origin[0]) / dx / bucket);
  const gj = (y: number) => Math.floor((y - origin[1]) / dx / bucket);
  const gk = (z: number) => Math.floor((z - origin[2]) / dx / bucket);

  for (let t = 0; t < positions.length; t += 9) {
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, k0 = Infinity, k1 = -Infinity;
    for (let v = 0; v < 3; v++) {
      const i = gi(positions[t + v*3]), j = gj(positions[t + v*3 + 1]), k = gk(positions[t + v*3 + 2]);
      i0 = Math.min(i0, i); i1 = Math.max(i1, i);
      j0 = Math.min(j0, j); j1 = Math.max(j1, j);
      k0 = Math.min(k0, k); k1 = Math.max(k1, k);
    }
    for (let k = Math.max(0,k0); k <= Math.min(bz-1,k1); k++)
      for (let j = Math.max(0,j0); j <= Math.min(by-1,j1); j++)
        for (let i = Math.max(0,i0); i <= Math.min(bx-1,i1); i++)
          buckets[i + j*bx + k*bx*by].push(t);
  }

  const tri = [[0,0,0],[0,0,0],[0,0,0]];
  const o = new Float32Array(3);

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const idx = x + y*nx + z*nx*ny;
        if (flags[idx] !== CELL.FLUID) continue;
        o[0] = origin[0] + x*dx; o[1] = origin[1] + y*dx; o[2] = origin[2] + z*dx;

        for (let q = 1; q < 19; q++) {
          const c = D3Q19[q];
          const sx = x + c[0], sy = y + c[1], sz = z + c[2];
          if (sx < 0 || sy < 0 || sz < 0 || sx >= nx || sy >= ny || sz >= nz) continue;
          if (flags[sx + sy*nx + sz*nx*ny] !== CELL.SOLID) continue;

          const dir = [c[0]*dx, c[1]*dx, c[2]*dx];
          const bi = Math.min(bx-1, Math.max(0, Math.floor(x / bucket)));
          const bj = Math.min(by-1, Math.max(0, Math.floor(y / bucket)));
          const bk = Math.min(bz-1, Math.max(0, Math.floor(z / bucket)));

          let best = Infinity;
          for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const i = bi+di, j = bj+dj, k = bk+dk;
            if (i < 0 || j < 0 || k < 0 || i >= bx || j >= by || k >= bz) continue;
            for (const t of buckets[i + j*bx + k*bx*by]) {
              for (let v = 0; v < 3; v++) {
                tri[v][0] = positions[t + v*3];
                tri[v][1] = positions[t + v*3 + 1];
                tri[v][2] = positions[t + v*3 + 2];
              }
              const hit = rayTriangle(o, dir, tri[0], tri[1], tri[2]);
              if (hit > 1e-4 && hit <= 1.0 && hit < best) best = hit;
            }
          }
          if (best < Infinity) out[q * cells + idx] = best;
        }
      }
    }
  }
  return out;
}
