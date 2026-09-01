import { CELL, type GridSpec } from '../engine/voxel/Voxelizer';

export interface SymmetryReport {
  axis: 'y' | 'z';
  maxParallelResidual: number;
  maxNormalResidual: number;
  maxDensityResidual: number;
  flagMismatches: number;
  pass: boolean;
  failures: string[];
}

const TOL = 1e-4;

export function checkSymmetry(
  macros: Float32Array,
  flags: Uint32Array,
  grid: GridSpec,
  axis: 'y' | 'z',
): SymmetryReport {
  const { nx, ny, nz } = grid;
  const n = axis === 'y' ? ny : nz;
  const failures: string[] = [];

  let maxPar = 0, maxNorm = 0, maxRho = 0, flagMismatches = 0;

  const index = (x: number, y: number, z: number) => x + y * nx + z * nx * ny;

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const my = axis === 'y' ? n - 1 - y : y;
        const mz = axis === 'z' ? n - 1 - z : z;
        const a = index(x, y, z);
        const b = index(x, my, mz);
        if (a >= b) continue;

        if (flags[a] !== flags[b]) { flagMismatches++; continue; }
        if (flags[a] === CELL.SOLID) continue;

        const ua = [macros[a * 4], macros[a * 4 + 1], macros[a * 4 + 2], macros[a * 4 + 3]];
        const ub = [macros[b * 4], macros[b * 4 + 1], macros[b * 4 + 2], macros[b * 4 + 3]];

        const normalIdx = axis === 'y' ? 1 : 2;
        const parallelIdx = axis === 'y' ? 2 : 1;

        maxPar = Math.max(maxPar, Math.abs(ua[0] - ub[0]), Math.abs(ua[parallelIdx] - ub[parallelIdx]));
        maxNorm = Math.max(maxNorm, Math.abs(ua[normalIdx] + ub[normalIdx]));
        maxRho = Math.max(maxRho, Math.abs(ua[3] - ub[3]));
      }
    }
  }

  if (flagMismatches > 0) {
    failures.push(`${flagMismatches} mirrored cells have mismatched flags — voxelizer is not symmetric`);
  }
  if (maxPar > TOL) failures.push(`Parallel-velocity asymmetry ${maxPar.toExponential(2)} > ${TOL}`);
  if (maxNorm > TOL) failures.push(`Normal-velocity is not antisymmetric: ${maxNorm.toExponential(2)}`);
  if (maxRho > TOL) failures.push(`Density asymmetry ${maxRho.toExponential(2)}`);

  return {
    axis,
    maxParallelResidual: maxPar,
    maxNormalResidual: maxNorm,
    maxDensityResidual: maxRho,
    flagMismatches,
    pass: failures.length === 0,
    failures,
  };
}
