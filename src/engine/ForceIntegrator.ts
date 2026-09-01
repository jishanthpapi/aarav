import { FORCE_SCALE } from './webgpu/forces.wgsl';
import { CELL, type GridSpec } from './voxel/Voxelizer';

export interface AeroReadout {
  Cd: number;
  Cl: number;
  wakeCells: number;
  refAreaCells: number;
  valid: boolean;
  reason?: string;
}

export function frontalAreaCells(flags: Uint32Array, g: GridSpec): number {
  const { nx, ny, nz } = g;
  let area = 0;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        if (flags[x + y * nx + z * nx * ny] === CELL.SOLID) { area++; break; }
      }
    }
  }
  return area;
}

const WAKE_FRACTION = 0.5;

export function wakeSize(macros: Float32Array, g: GridSpec, uInlet: number): number {
  const { nx, ny, nz } = g;
  const threshold = uInlet * WAKE_FRACTION;
  let count = 0;
  for (let i = 0; i < nx * ny * nz; i++) {
    const b = i * 4;
    const speed = Math.hypot(macros[b], macros[b + 1], macros[b + 2]);
    if (speed > 1e-9 && speed < threshold) count++;
  }
  return count;
}

const EMA_ALPHA = 0.08;

export class ForceIntegrator {
  private emaCd: number | null = null;
  private emaCl: number | null = null;

  compute(rawAccum: Int32Array, uLattice: number, refAreaCells: number): AeroReadout {
    const Fx = rawAccum[0] / FORCE_SCALE;
    const Fy = rawAccum[1] / FORCE_SCALE;
    const links = rawAccum[3];

    if (links === 0 || refAreaCells === 0) {
      return { Cd: 0, Cl: 0, wakeCells: 0, refAreaCells, valid: false,
               reason: 'No wetted surface — geometry may have failed to voxelize.' };
    }

    const denom = 1.0 * uLattice * uLattice * refAreaCells;
    const Cd = (2 * Fx) / denom;
    const Cl = (2 * Fy) / denom;

    if (!Number.isFinite(Cd) || !Number.isFinite(Cl)) {
      return { Cd: 0, Cl: 0, wakeCells: 0, refAreaCells, valid: false,
               reason: 'Solver diverged — values are not finite.' };
    }
    if (Cd < 0) {
      return { Cd, Cl, wakeCells: 0, refAreaCells, valid: false,
               reason: 'Negative drag — solver has not converged or is unstable.' };
    }

    this.emaCd = this.emaCd === null ? Cd : this.emaCd + EMA_ALPHA * (Cd - this.emaCd);
    this.emaCl = this.emaCl === null ? Cl : this.emaCl + EMA_ALPHA * (Cl - this.emaCl);

    return { Cd: this.emaCd, Cl: this.emaCl, wakeCells: 0, refAreaCells, valid: true };
  }

  reset() { this.emaCd = null; this.emaCl = null; }
}
