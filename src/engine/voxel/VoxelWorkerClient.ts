import type { VoxelizeInput } from './Voxelizer';
import type { VoxelJob, VoxelReply, VoxelResult } from './workerProtocol';
import { validateVoxelInput } from './inputLimits';

interface PendingJob {
  input: VoxelJob;
  resolve: (result: VoxelResult) => void;
  reject: (error: Error) => void;
}

export class SupersededVoxelJob extends Error {}

/** One active job and at most one queued job, even during continuous dragging. */
export class VoxelWorkerClient {
  private worker: Worker;
  private active: PendingJob | null = null;
  private queued: PendingJob | null = null;
  private jobId = 0;
  private dead = false;

  constructor(createWorker = () => new Worker(new URL('./voxel.worker.ts', import.meta.url), { type: 'module' })) {
    this.worker = createWorker();
    this.worker.onmessage = (event: MessageEvent<VoxelReply>) => {
      const reply = event.data;
      if (!this.active || reply.jobId !== this.active.input.jobId) return;
      if ('error' in reply) this.active.reject(new Error(reply.error));
      else this.active.resolve(reply);
      this.active = null;
      this.startNext();
    };
    this.worker.onerror = (event) => this.destroy(new Error(event.message || 'Geometry worker failed.'));
    this.worker.onmessageerror = () => this.destroy(new Error('Could not read the geometry worker response.'));
  }

  run(input: VoxelizeInput): Promise<VoxelResult> {
    if (this.dead) return Promise.reject(new Error('Geometry worker is unavailable.'));
    try { validateVoxelInput(input); } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      this.queued?.reject(new SupersededVoxelJob('Replaced by a newer geometry update.'));
      this.queued = { input: { ...input, jobId: ++this.jobId }, resolve, reject };
      this.startNext();
    });
  }

  private startNext() {
    if (this.active || !this.queued || this.dead) return;
    this.active = this.queued;
    this.queued = null;
    try {
      this.worker.postMessage(this.active.input, [this.active.input.positions.buffer]);
    } catch (error) {
      this.active.reject(error instanceof Error ? error : new Error(String(error)));
      this.active = null;
      this.startNext();
    }
  }

  destroy(error: Error = new SupersededVoxelJob('Geometry worker closed.')) {
    if (this.dead) return;
    this.dead = true;
    this.worker.terminate();
    this.active?.reject(error);
    this.queued?.reject(error);
    this.active = this.queued = null;
  }
}
