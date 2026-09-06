import type { VoxelizeInput } from './Voxelizer';

export type VoxelJob = VoxelizeInput & { jobId: number };
export type VoxelResult = { jobId: number; flags: Uint32Array; fractions: Float32Array; wallGeometry: Float32Array };
export type VoxelReply = VoxelResult | { jobId: number; error: string };
