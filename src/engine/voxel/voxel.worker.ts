import { computeWallGeometry } from './wallGeometry';
import { voxelize } from './Voxelizer';
import { computeLinkFractions } from './linkFractions';
import type { VoxelJob, VoxelReply } from './workerProtocol';

self.onmessage = (e: MessageEvent<VoxelJob>) => {
  const { jobId, positions, grid } = e.data;
  try {
    const flags = voxelize({ positions, grid });
    const fractions = computeLinkFractions(positions, flags, grid);
    const wallGeometry = computeWallGeometry(flags, fractions, grid);
    const reply: VoxelReply = { jobId, flags, fractions, wallGeometry };
    (self as unknown as Worker).postMessage(reply, [flags.buffer, fractions.buffer, wallGeometry.buffer]);
  } catch (error) {
    const reply: VoxelReply = { jobId, error: error instanceof Error ? error.message : String(error) };
    (self as unknown as Worker).postMessage(reply);
  }
};
