import type { GridSpec } from './voxel/Voxelizer';
import { MAX_GRID_CELLS } from './voxel/inputLimits';

export interface DomainPlan {
  grid: GridSpec;
  cellsPerLength: number;
  blockageRatio: number;
  upstreamLengths: number;
  downstreamLengths: number;
  warnings: string[];
  fidelity: 'coarse' | 'moderate' | 'good';
}

const MIN_UPSTREAM = 3;
const MIN_DOWNSTREAM = 8;
const MAX_BLOCKAGE = 0.05;
const MIN_DIMENSION = 16;
const DISTRIBUTION_BYTES_PER_CELL = 19 * 4;
// Two distributions, link fractions, flags, macros and the macro readback.
const SOLVER_BYTES_PER_CELL = 3 * DISTRIBUTION_BYTES_PER_CELL + 4 + 16 + 16 + 16 + 4 + 4;
const SOLVER_FIXED_BYTES = 3 * 16;
// Allocation policy, not a claim about available VRAM or interactive speed.
const SOLVER_MEMORY_BUDGET = 512 * 1024 * 1024;

export function gridCellBudget(
  limits: Pick<GPUSupportedLimits, 'maxStorageBufferBindingSize' | 'maxBufferSize'>,
  requestedCellBudget: number,
): number {
  if (![requestedCellBudget, limits.maxStorageBufferBindingSize, limits.maxBufferSize]
    .every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new Error('Cell budget and GPU buffer limits must be positive safe integers.');
  }
  return Math.min(
    requestedCellBudget,
    Math.floor(limits.maxStorageBufferBindingSize / DISTRIBUTION_BYTES_PER_CELL),
    Math.floor(limits.maxBufferSize / DISTRIBUTION_BYTES_PER_CELL),
    Math.floor((SOLVER_MEMORY_BUDGET - SOLVER_FIXED_BYTES) / SOLVER_BYTES_PER_CELL),
  );
}

export function planDomain(
  bbox: { min: [number, number, number]; max: [number, number, number] },
  targetCellsPerLength: number,
  cellBudget: number,
  maxDimension = Infinity,
): DomainPlan {
  const warnings: string[] = [];
  const L = bbox.max[0] - bbox.min[0];
  const H = bbox.max[1] - bbox.min[1];
  const W = bbox.max[2] - bbox.min[2];

  if (![...bbox.min, ...bbox.max, L, H, W].every(Number.isFinite) ||
      ![L, H, W].every(n => n > 0)) {
    throw new Error('Domain bounds must be finite and have positive extent on every axis.');
  }
  if (!Number.isFinite(targetCellsPerLength) || targetCellsPerLength <= 0 ||
      !Number.isFinite(L / targetCellsPerLength) || L / targetCellsPerLength <= 0) {
    throw new Error('Target resolution must give a positive finite cell spacing.');
  }
  if (!Number.isSafeInteger(cellBudget) || cellBudget < MIN_DIMENSION ** 3) {
    throw new Error('The cell budget must fit at least a 16 by 16 by 16 grid.');
  }
  cellBudget = Math.min(cellBudget, MAX_GRID_CELLS);
  if (maxDimension !== Infinity && (!Number.isSafeInteger(maxDimension) || maxDimension < MIN_DIMENSION)) {
    throw new Error('The dimension limit must be an integer of at least 16.');
  }

  const spanX = L * (1 + MIN_UPSTREAM + MIN_DOWNSTREAM);
  const spanY = Math.max(H * 5, Math.sqrt((H * W) / MAX_BLOCKAGE));
  const spanZ = Math.max(W * 5, Math.sqrt((H * W) / MAX_BLOCKAGE));

  if (![spanX, spanY, spanZ].every(Number.isFinite)) {
    throw new Error('Domain extents exceed the supported numeric range.');
  }

  const dimensions = (cpl: number) => {
    const dx = L / cpl;
    return {
      nx: Math.max(MIN_DIMENSION, Math.ceil(spanX / dx)),
      ny: Math.max(MIN_DIMENSION, Math.ceil(spanY / dx)),
      nz: Math.max(MIN_DIMENSION, Math.ceil(spanZ / dx)),
      dx,
    };
  };
  const fits = ({ nx, ny, nz, dx }: ReturnType<typeof dimensions>) =>
    Number.isFinite(dx) && dx > 0 &&
    Math.max(nx, ny, nz) <= maxDimension && nx * ny * nz <= cellBudget;

  let cpl = targetCellsPerLength;
  if (!fits(dimensions(cpl))) {
    // Every other axis occupies at least 16 cells. This bounds the search
    // even for a very large requested resolution, without skipping usable grids.
    const axisLimit = Math.min(maxDimension, Math.floor(cellBudget / MIN_DIMENSION ** 2));
    let low = 0;
    let high = Math.min(cpl, ...[spanX, spanY, spanZ].map(span => axisLimit * (L / span)));
    for (let guard = 0; guard < 80; guard++) {
      const middle = low + (high - low) / 2;
      if (middle === low || middle === high) break;
      if (fits(dimensions(middle))) low = middle;
      else high = middle;
    }
    // Keep the feasible endpoint: rounding upward can add an entire cell plane.
    cpl = low;
  }
  const { nx, ny, nz, dx } = dimensions(cpl);
  if (!(cpl > 0) || !fits({ nx, ny, nz, dx })) {
    throw new Error('No representable grid fits the requested limits.');
  }

  const blockage = (H * W) / (ny * dx * nz * dx);
  if (blockage > MAX_BLOCKAGE) {
    warnings.push(
      `Blockage ratio ${(blockage * 100).toFixed(1)}% exceeds the 5% guideline — ` +
      `the tunnel may influence drag. Trends also require validation.`,
    );
  }
  if (cpl < targetCellsPerLength * 0.9) {
    warnings.push(
      `Resolution limited to ${cpl.toFixed(0)} cells per body length by the selected grid budget and device limits.`,
    );
  }
  if (cpl < 40) {
    warnings.push('Below 40 cells per body length: fine geometry (gurney flaps, small vanes) is not resolved.');
  }

  return {
    grid: {
      nx, ny, nz, dx,
      origin: [
        bbox.min[0] - MIN_UPSTREAM * L,
        bbox.min[1] - dx,
        bbox.min[2] - (nz * dx - W) / 2,
      ],
    },
    cellsPerLength: cpl,
    blockageRatio: blockage,
    upstreamLengths: MIN_UPSTREAM,
    downstreamLengths: MIN_DOWNSTREAM,
    warnings,
    fidelity: cpl >= 120 ? 'good' : cpl >= 40 ? 'moderate' : 'coarse',
  };
}

export interface ReynoldsReport {
  requested: number;
  achieved: number;
  resolutionLimited: boolean;
  regime: 'subcritical' | 'transitional' | 'fully-turbulent';
  tauPlus: number;
  note: string;
}

export const TAU_FLOOR = 0.5005;

export function reynoldsFor(
  kph: number, refLengthM: number, refLengthCells: number,
  uLattice: number, smagorinsky: boolean, kinematicViscosity = 1.5e-5,
): ReynoldsReport {
  const ms = Math.max(kph, 1) / 3.6;
  const requested = (ms * refLengthM) / kinematicViscosity;

  const nuNeeded = (uLattice * refLengthCells) / requested;
  const tauNeeded = 3 * nuNeeded + 0.5;
  const tauPlus = Math.max(tauNeeded, TAU_FLOOR);
  const nuUsed = (tauPlus - 0.5) / 3;
  const achievedMolecular = (uLattice * refLengthCells) / nuUsed;

  const limited = tauNeeded < TAU_FLOOR;
  // SGS viscosity models unresolved transport; it cannot undo a molecular
  // viscosity floor or restore a Reynolds number that was not simulated.
  const achieved = achievedMolecular;

  const regime = achieved > 1e5 ? 'fully-turbulent'
               : achieved > 1e4 ? 'transitional'
               : 'subcritical';

  const note = !limited
    ? 'Reynolds number matched directly by molecular viscosity.'
    : smagorinsky
      ? `Resolution-limited: molecular Re ~ ${achievedMolecular.toExponential(1)} instead of the requested ${requested.toExponential(1)}. Smagorinsky adds local sub-grid viscosity; it does not restore the requested Re.`
      : `Resolution-limited: solving Re ~ ${achievedMolecular.toExponential(1)} instead of the requested ${requested.toExponential(1)}.`;

  return { requested, achieved, resolutionLimited: limited, regime, tauPlus, note };
}
