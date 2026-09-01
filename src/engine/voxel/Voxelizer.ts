import { triBoxOverlap } from './triBox';

export const CELL = { FLUID: 0, SOLID: 1, INLET: 2, OUTLET: 3, WALL: 4 } as const;

export interface GridSpec {
  nx: number; ny: number; nz: number;
  /** World-space size of one lattice cell (metres). */
  dx: number;
  /** World-space position of cell (0,0,0)'s centre. */
  origin: [number, number, number];
}

export interface VoxelizeInput {
  /** Flat, world-space, triangle-soup positions: [x,y,z, x,y,z, ...]. */
  positions: Float32Array;
  grid: GridSpec;
}

const idx = (x: number, y: number, z: number, g: GridSpec) =>
  x + y * g.nx + z * g.nx * g.ny;

/**
 * Surface-rasterize the triangle soup, then flood-fill the exterior so the
 * enclosed volume is marked solid too (an open shell degrades to a shell,
 * which is the correct failure mode — the solver still sees a wall).
 */
export function voxelize({ positions, grid }: VoxelizeInput): Uint32Array {
  const { nx, ny, nz, dx, origin } = grid;
  const flags = new Uint32Array(nx * ny * nz);
  const half = [dx * 0.5, dx * 0.5, dx * 0.5];
  const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

  for (let t = 0; t < positions.length; t += 9) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let v = 0; v < 3; v++) {
      const p = tri[v];
      p[0] = positions[t + v * 3];
      p[1] = positions[t + v * 3 + 1];
      p[2] = positions[t + v * 3 + 2];
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
    }

    const x0 = Math.max(0, Math.floor((minX - origin[0]) / dx));
    const x1 = Math.min(nx - 1, Math.ceil((maxX - origin[0]) / dx));
    const y0 = Math.max(0, Math.floor((minY - origin[1]) / dx));
    const y1 = Math.min(ny - 1, Math.ceil((maxY - origin[1]) / dx));
    const z0 = Math.max(0, Math.floor((minZ - origin[2]) / dx));
    const z1 = Math.min(nz - 1, Math.ceil((maxZ - origin[2]) / dx));

    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = idx(x, y, z, grid);
          if (flags[i] === CELL.SOLID) continue;
          const c = [origin[0] + x * dx, origin[1] + y * dx, origin[2] + z * dx];
          if (triBoxOverlap(c, half, tri[0], tri[1], tri[2])) flags[i] = CELL.SOLID;
        }
      }
    }
  }

  fillInterior(flags, grid);
  markDomainBoundaries(flags, grid);
  return flags;
}

/** BFS from every boundary fluid cell; anything unvisited and not surface is inside. */
function fillInterior(flags: Uint32Array, g: GridSpec) {
  const { nx, ny, nz } = g;
  const seen = new Uint8Array(flags.length);
  const queue = new Int32Array(flags.length);
  let head = 0, tail = 0;

  const push = (x: number, y: number, z: number) => {
    const i = idx(x, y, z, g);
    if (seen[i] || flags[i] === CELL.SOLID) return;
    seen[i] = 1;
    queue[tail++] = i;
  };

  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++)
        if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1)
          push(x, y, z);

  while (head < tail) {
    const i = queue[head++];
    const x = i % nx;
    const y = ((i / nx) | 0) % ny;
    const z = (i / (nx * ny)) | 0;
    if (x > 0) push(x - 1, y, z);
    if (x < nx - 1) push(x + 1, y, z);
    if (y > 0) push(x, y - 1, z);
    if (y < ny - 1) push(x, y + 1, z);
    if (z > 0) push(x, y, z - 1);
    if (z < nz - 1) push(x, y, z + 1);
  }

  for (let i = 0; i < flags.length; i++) if (!seen[i]) flags[i] = CELL.SOLID;
}

function markDomainBoundaries(flags: Uint32Array, g: GridSpec) {
  const { nx, ny, nz } = g;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      const inI = idx(0, y, z, g);
      const outI = idx(nx - 1, y, z, g);
      if (flags[inI] !== CELL.SOLID) flags[inI] = CELL.INLET;
      if (flags[outI] !== CELL.SOLID) flags[outI] = CELL.OUTLET;
    }
  }
  for (let z = 0; z < nz; z++) {
    for (let x = 1; x < nx - 1; x++) {
      for (const y of [0, ny - 1]) {
        const i = idx(x, y, z, g);
        if (flags[i] !== CELL.SOLID) flags[i] = CELL.WALL;
      }
    }
  }
  for (let y = 1; y < ny - 1; y++) {
    for (let x = 1; x < nx - 1; x++) {
      for (const z of [0, nz - 1]) {
        const i = idx(x, y, z, g);
        if (flags[i] !== CELL.SOLID) flags[i] = CELL.WALL;
      }
    }
  }
}
