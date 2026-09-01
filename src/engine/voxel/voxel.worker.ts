import { voxelize, type VoxelizeInput } from './Voxelizer';

self.onmessage = (e: MessageEvent<VoxelizeInput & { jobId: number }>) => {
  const { jobId, positions, grid } = e.data;
  const flags = voxelize({ positions, grid });
  (self as unknown as Worker).postMessage({ jobId, flags }, [flags.buffer]);
};
