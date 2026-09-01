import { CELL, type GridSpec } from '../engine/voxel/Voxelizer';

export interface ConservationReport {
  massImbalance: number;
  momentumResidual: number;
  totalDensityDrift: number;
  nonFiniteCells: number;
  nonPositiveDensityCells: number;
  maxMach: number;
  pass: boolean;
  failures: string[];
}

const MASS_TOL = 0.01;
const MOMENTUM_TOL = 0.15;
const MACH_CEILING = 0.15;
const CS2 = 1 / 3;

const at = (m: Float32Array, i: number) =>
  ({ ux: m[i * 4], uy: m[i * 4 + 1], uz: m[i * 4 + 2], rho: m[i * 4 + 3] });

const idx = (x: number, y: number, z: number, g: GridSpec) =>
  x + y * g.nx + z * g.nx * g.ny;

function planeMassFlux(m: Float32Array, flags: Uint32Array, g: GridSpec, x: number): number {
  let flux = 0;
  for (let z = 0; z < g.nz; z++) {
    for (let y = 0; y < g.ny; y++) {
      const i = idx(x, y, z, g);
      if (flags[i] === CELL.SOLID) continue;
      const c = at(m, i);
      flux += c.rho * c.ux;
    }
  }
  return flux;
}

function planeMomentumFlux(m: Float32Array, flags: Uint32Array, g: GridSpec, x: number): number {
  let flux = 0;
  for (let z = 0; z < g.nz; z++) {
    for (let y = 0; y < g.ny; y++) {
      const i = idx(x, y, z, g);
      if (flags[i] === CELL.SOLID) continue;
      const c = at(m, i);
      flux += c.rho * CS2 + c.rho * c.ux * c.ux;
    }
  }
  return flux;
}

export function checkConservation(
  macros: Float32Array,
  flags: Uint32Array,
  grid: GridSpec,
  measuredFx: number,
  referenceMass: number,
): ConservationReport {
  const failures: string[] = [];
  const cells = grid.nx * grid.ny * grid.nz;

  let nonFinite = 0;
  let nonPositive = 0;
  let maxMach = 0;
  let totalMass = 0;

  for (let i = 0; i < cells; i++) {
    if (flags[i] === CELL.SOLID) continue;
    const c = at(macros, i);
    if (!Number.isFinite(c.rho) || !Number.isFinite(c.ux) ||
        !Number.isFinite(c.uy) || !Number.isFinite(c.uz)) { nonFinite++; continue; }
    if (c.rho <= 0) nonPositive++;
    totalMass += c.rho;
    const speed = Math.hypot(c.ux, c.uy, c.uz);
    const mach = speed / Math.sqrt(CS2);
    if (mach > maxMach) maxMach = mach;
  }

  const inflow = planeMassFlux(macros, flags, grid, 1);
  const outflow = planeMassFlux(macros, flags, grid, grid.nx - 2);
  const massImbalance = Math.abs(inflow) > 1e-9
    ? Math.abs(inflow - outflow) / Math.abs(inflow)
    : Infinity;

  const cvForce = planeMomentumFlux(macros, flags, grid, 1)
                - planeMomentumFlux(macros, flags, grid, grid.nx - 2);
  const momentumResidual = Math.abs(measuredFx) > 1e-9
    ? Math.abs(cvForce - measuredFx) / Math.abs(measuredFx)
    : Infinity;

  const totalDensityDrift = referenceMass > 0
    ? Math.abs(totalMass - referenceMass) / referenceMass
    : Infinity;

  if (nonFinite > 0) failures.push(`${nonFinite} non-finite cells`);
  if (nonPositive > 0) failures.push(`${nonPositive} cells with rho <= 0`);
  if (maxMach > MACH_CEILING) failures.push(`Mach ${maxMach.toFixed(3)} exceeds ${MACH_CEILING}`);
  if (massImbalance > MASS_TOL) {
    failures.push(`Mass imbalance ${(massImbalance * 100).toFixed(2)}% > ${MASS_TOL * 100}%`);
  }
  if (momentumResidual > MOMENTUM_TOL) {
    failures.push(
      `Momentum-exchange force disagrees with control-volume balance by ` +
      `${(momentumResidual * 100).toFixed(1)}% (measured ${measuredFx.toFixed(4)}, ` +
      `CV ${cvForce.toFixed(4)})`,
    );
  }
  if (totalDensityDrift > MASS_TOL) {
    failures.push(`Total density drifted ${(totalDensityDrift * 100).toFixed(2)}%`);
  }

  return {
    massImbalance, momentumResidual, totalDensityDrift,
    nonFiniteCells: nonFinite, nonPositiveDensityCells: nonPositive,
    maxMach, pass: failures.length === 0, failures,
  };
}
