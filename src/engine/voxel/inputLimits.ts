import type { GridSpec, VoxelizeInput } from './Voxelizer';

// Includes all current solver buffers; CPU and renderer storage are additional.
export const MAX_GRID_CELLS = Math.floor((512 * 1024 * 1024 - 48) / 288);
export const MAX_TRIANGLE_VALUES = 9 * 100000;

export function validateGrid(grid: GridSpec): void {
  if (!grid || ![grid.nx,grid.ny,grid.nz].every(n => Number.isSafeInteger(n) && n >= 3 && n <= 4096) ||
      grid.nx * grid.ny * grid.nz > MAX_GRID_CELLS || !Number.isFinite(grid.dx) || grid.dx <= 0 ||
      !Array.isArray(grid.origin) || grid.origin.length !== 3 || !grid.origin.every(Number.isFinite) ||
      !grid.origin.every((v,i) => Number.isFinite(v + [grid.nx,grid.ny,grid.nz][i] * grid.dx)))
    throw new Error('Invalid grid or grid memory limit exceeded.');
}
export function validateVoxelInput(input: VoxelizeInput): void {
  if (!input || !(input.positions instanceof Float32Array) || input.positions.length % 9 !== 0 ||
      input.positions.length > MAX_TRIANGLE_VALUES || !input.positions.every(Number.isFinite))
    throw new Error('Triangle positions must be finite Float32 triplets with a bounded triangle count.');
  validateGrid(input.grid);
}
