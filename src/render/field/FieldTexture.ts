import { Data3DTexture, RGBAFormat, FloatType, LinearFilter, ClampToEdgeWrapping } from 'three';
import type { GridSpec } from '../../engine/voxel/Voxelizer';

export class FieldTexture {
  readonly texture: Data3DTexture;
  private data: Float32Array;

  constructor(private grid: GridSpec) {
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
    this.data.set(macros);
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}
