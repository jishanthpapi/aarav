import { CELL, type GridSpec } from './Voxelizer';

const D3Q19: [number, number, number][] = [
  [0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
  [1,1,0],[-1,-1,0],[1,-1,0],[-1,1,0],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1],
  [0,1,1],[0,-1,-1],[0,1,-1],[0,-1,1],
];

/** Per-cell wall geometry: (nx, ny, nz, y) — y <= 0 marks a non-wall cell. */
export function computeWallGeometry(
  flags: Uint32Array,
  qFrac: Float32Array,
  grid: GridSpec,
): Float32Array {
  const { nx, ny, nz } = grid;
  const cells = nx * ny * nz;
  const out = new Float32Array(cells * 4);

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = x + y * nx + z * nx * ny;
        if (flags[i] !== CELL.FLUID) continue;

        let n0 = 0, n1 = 0, n2 = 0;
        let minDist = Infinity;
        let links = 0;

        for (let q = 1; q < 19; q++) {
          const c = D3Q19[q];
          const sx = x + c[0], sy = y + c[1], sz = z + c[2];
          if (sx < 0 || sy < 0 || sz < 0 || sx >= nx || sy >= ny || sz >= nz) continue;
          if (flags[sx + sy * nx + sz * nx * ny] !== CELL.SOLID) continue;

          const len = Math.hypot(c[0], c[1], c[2]);
          const qf = qFrac[q * cells + i];

          const w = 1 / len;
          n0 -= c[0] * w; n1 -= c[1] * w; n2 -= c[2] * w;

          minDist = Math.min(minDist, qf * len);
          links++;
        }

        if (links === 0) continue;

        const mag = Math.hypot(n0, n1, n2);
        if (mag < 1e-9) continue;

        out[i * 4 + 0] = n0 / mag;
        out[i * 4 + 1] = n1 / mag;
        out[i * 4 + 2] = n2 / mag;
        out[i * 4 + 3] = Math.max(minDist * (mag / links), 1e-4);
      }
    }
  }
  return out;
}

export interface YPlusStats {
  min: number; max: number; median: number;
  inBandFraction: number; resolvedFraction: number; nonFinite: number;
  wallCells: number;
}

export function summariseYPlus(yPlusPerCell: Float32Array, wallGeom: Float32Array): YPlusStats {
  const vals: number[] = [];
  let nonFinite = 0, inBand = 0, resolved = 0;

  for (let i = 0; i < yPlusPerCell.length; i++) {
    if (wallGeom[i * 4 + 3] <= 0) continue;
    const v = yPlusPerCell[i];
    if (!Number.isFinite(v)) { nonFinite++; continue; }
    vals.push(v);
    if (v >= 30 && v <= 300) inBand++;
    if (v < 1) resolved++;
  }

  if (vals.length === 0) {
    return { min: 0, max: 0, median: 0, inBandFraction: 0, resolvedFraction: 0,
             nonFinite, wallCells: 0 };
  }
  vals.sort((a, b) => a - b);
  return {
    min: vals[0],
    max: vals[vals.length - 1],
    median: vals[Math.floor(vals.length / 2)],
    inBandFraction: inBand / vals.length,
    resolvedFraction: resolved / vals.length,
    nonFinite,
    wallCells: vals.length,
  };
}
