import { CELL, type GridSpec } from '../engine/voxel/Voxelizer';

export interface FieldSignature {
  version: 1;
  caseId: string;
  blocks: { nx: number; ny: number; nz: number };
  data: number[];
  scalars: { cd: number; cl: number; wakeCells: number };
}

const BLOCKS = { nx: 8, ny: 4, nz: 4 };

export function signField(
  caseId: string,
  macros: Float32Array,
  flags: Uint32Array,
  grid: GridSpec,
  scalars: FieldSignature['scalars'],
): FieldSignature {
  const total = BLOCKS.nx * BLOCKS.ny * BLOCKS.nz;
  const sums = new Float64Array(total * 4);
  const counts = new Float64Array(total);

  for (let z = 0; z < grid.nz; z++) {
    const bz = Math.min(BLOCKS.nz - 1, Math.floor((z / grid.nz) * BLOCKS.nz));
    for (let y = 0; y < grid.ny; y++) {
      const by = Math.min(BLOCKS.ny - 1, Math.floor((y / grid.ny) * BLOCKS.ny));
      for (let x = 0; x < grid.nx; x++) {
        const i = x + y * grid.nx + z * grid.nx * grid.ny;
        if (flags[i] === CELL.SOLID) continue;
        const bx = Math.min(BLOCKS.nx - 1, Math.floor((x / grid.nx) * BLOCKS.nx));
        const b = bx + by * BLOCKS.nx + bz * BLOCKS.nx * BLOCKS.ny;
        sums[b * 4 + 0] += macros[i * 4 + 0];
        sums[b * 4 + 1] += macros[i * 4 + 1];
        sums[b * 4 + 2] += macros[i * 4 + 2];
        sums[b * 4 + 3] += macros[i * 4 + 3];
        counts[b]++;
      }
    }
  }

  const data: number[] = [];
  for (let b = 0; b < total; b++) {
    const n = Math.max(counts[b], 1);
    for (let k = 0; k < 4; k++) data.push(Number((sums[b * 4 + k] / n).toPrecision(6)));
  }

  return { version: 1, caseId, blocks: BLOCKS, data, scalars };
}

export interface SignatureDiff {
  caseId: string;
  maxBlockDelta: number;
  cdDelta: number;
  clDelta: number;
  pass: boolean;
  failures: string[];
}

const BLOCK_TOL = 0.02;
const SCALAR_TOL = 0.03;

export function diffSignature(base: FieldSignature, next: FieldSignature): SignatureDiff {
  const failures: string[] = [];
  if (base.data.length !== next.data.length) {
    return {
      caseId: next.caseId, maxBlockDelta: Infinity, cdDelta: Infinity, clDelta: Infinity,
      pass: false, failures: ['Signature shape changed — regenerate the baseline deliberately'],
    };
  }

  let maxDelta = 0;
  for (let i = 0; i < base.data.length; i++) {
    maxDelta = Math.max(maxDelta, Math.abs(base.data[i] - next.data[i]));
  }

  const rel = (a: number, b: number) => (Math.abs(a) > 1e-9 ? Math.abs(b - a) / Math.abs(a) : 0);
  const cdDelta = rel(base.scalars.cd, next.scalars.cd);
  const clDelta = rel(base.scalars.cl, next.scalars.cl);

  if (maxDelta > BLOCK_TOL) failures.push(`Field block delta ${maxDelta.toFixed(4)} > ${BLOCK_TOL}`);
  if (cdDelta > SCALAR_TOL) failures.push(`Cd moved ${(cdDelta * 100).toFixed(1)}%`);
  if (clDelta > SCALAR_TOL) failures.push(`Cl moved ${(clDelta * 100).toFixed(1)}%`);

  return { caseId: next.caseId, maxBlockDelta: maxDelta, cdDelta, clDelta,
           pass: failures.length === 0, failures };
}
