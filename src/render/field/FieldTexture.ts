import { Data3DTexture, RGBAFormat, FloatType, LinearFilter, ClampToEdgeWrapping } from 'three';
import type { GridSpec } from '../../engine/voxel/Voxelizer';

export class FieldTexture {
  readonly texture: Data3DTexture;
  private data: Float32Array;
  private flags: Uint32Array = new Uint32Array(0);
  revision = 0;
  ready = false;

  constructor(readonly grid: GridSpec) {
    const { nx, ny, nz } = grid;
    this.data = new Float32Array(nx * ny * nz * 4);
    this.texture = new Data3DTexture(this.data as unknown as BufferSource as any, nx, ny, nz);
    this.texture.format = RGBAFormat;
    this.texture.type = FloatType;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.wrapS = ClampToEdgeWrapping;
    this.texture.wrapT = ClampToEdgeWrapping;
    this.texture.wrapR = ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  update(macros: Float32Array) {
    if (macros.length !== this.data.length) throw new Error('Flow field dimensions do not match.');
    this.data.set(macros);
    this.texture.needsUpdate = true;
    this.revision++;
    this.ready = true;
  }

  setFlags(flags: Uint32Array) { this.flags = flags; }

  sample(x: number, y: number, z: number): [number, number, number] | null {
    if (!this.ready) return null;
    const { nx, ny, nz, dx, origin } = this.grid;
    const p = [(x - origin[0]) / dx, (y - origin[1]) / dx, (z - origin[2]) / dx];
    if (p.some((v, a) => v < 0 || v >= [nx, ny, nz][a] - 1)) return null;
    const nearest = Math.round(p[0]) + nx * (Math.round(p[1]) + ny * Math.round(p[2]));
    if (this.flags[nearest] === 1) return null;
    const base = p.map(Math.floor), f = p.map((v, a) => v - base[a]);
    const result: [number, number, number] = [0, 0, 0];
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = base[0] + dx + nx * (base[1] + dy + ny * (base[2] + dz));
      const weight = (dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]);
      for (let a = 0; a < 3; a++) result[a] += weight * this.data[i * 4 + a];
    }
    return result.every(Number.isFinite) ? result : null;
  }

  clear() { this.data.fill(0); this.ready = false; this.revision++; this.texture.needsUpdate = true; }

  dispose() { this.texture.dispose(); }
}

