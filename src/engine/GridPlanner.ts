import type { GridSpec } from './voxel/Voxelizer';

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

export function planDomain(
  bbox: { min: [number, number, number]; max: [number, number, number] },
  targetCellsPerLength: number,
  cellBudget: number,
): DomainPlan {
  const warnings: string[] = [];
  const L = bbox.max[0] - bbox.min[0];
  const H = bbox.max[1] - bbox.min[1];
  const W = bbox.max[2] - bbox.min[2];

  let cpl = targetCellsPerLength;
  let dx = L / cpl;

  const spanX = L * (1 + MIN_UPSTREAM + MIN_DOWNSTREAM);
  const spanY = Math.max(H * 5, Math.sqrt((H * W) / MAX_BLOCKAGE));
  const spanZ = Math.max(W * 5, Math.sqrt((H * W) / MAX_BLOCKAGE));

  for (let guard = 0; guard < 24; guard++) {
    const n = Math.ceil(spanX / dx) * Math.ceil(spanY / dx) * Math.ceil(spanZ / dx);
    if (n <= cellBudget) break;
    cpl *= 0.85;
    dx = L / cpl;
  }

  const nx = Math.max(16, Math.ceil(spanX / dx));
  const ny = Math.max(16, Math.ceil(spanY / dx));
  const nz = Math.max(16, Math.ceil(spanZ / dx));

  const blockage = (H * W) / (ny * dx * nz * dx);
  if (blockage > MAX_BLOCKAGE) {
    warnings.push(
      `Blockage ratio ${(blockage * 100).toFixed(1)}% exceeds the 5% guideline — ` +
      `absolute drag will read high. Trends between setups remain valid.`,
    );
  }
  if (cpl < targetCellsPerLength * 0.9) {
    warnings.push(
      `Resolution reduced to ${cpl.toFixed(0)} cells per body length to fit this device.`,
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

const TAU_FLOOR = 0.5005;

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
  const achieved = smagorinsky && limited ? requested : achievedMolecular;

  const regime = achieved > 1e5 ? 'fully-turbulent'
               : achieved > 1e4 ? 'transitional'
               : 'subcritical';

  const note = !limited
    ? 'Reynolds number matched directly by molecular viscosity.'
    : smagorinsky
      ? 'Molecular Re exceeds what this grid resolves; unresolved scales are carried by the sub-grid model (LES). Valid in the fully-turbulent regime, where drag is only weakly Re-dependent.'
      : `Resolution-limited: solving Re ~ ${achievedMolecular.toExponential(1)} instead of the requested ${requested.toExponential(1)}.`;

  return { requested, achieved, resolutionLimited: limited, regime, tauPlus, note };
}
