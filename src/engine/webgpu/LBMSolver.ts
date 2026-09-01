import { LBM_WGSL } from './lbm.wgsl';
import { FORCES_WGSL, FORCE_SCALE } from './forces.wgsl';
import type { GridSpec } from '../voxel/Voxelizer';

const MA_CAP = 0.08;          // lattice velocity ceiling — above this, LBM blows up
const TAU_MIN = 0.51;         // omega < 2 guard

export interface LBMConfig {
  grid: GridSpec;
  /** Characteristic length of the vehicle in cells (for Reynolds matching). */
  refLengthCells: number;
}

export class LBMSolver {
  private device!: GPUDevice;
  private grid!: GridSpec;
  private cfg!: LBMConfig;

  private fA!: GPUBuffer;
  private fB!: GPUBuffer;
  private flagBuf!: GPUBuffer;
  private macroBuf!: GPUBuffer;
  private paramBuf!: GPUBuffer;
  private readback!: GPUBuffer;

  private pipelines!: Record<'init' | 'collide' | 'stream' | 'boundary', GPUComputePipeline>;
  private layout!: GPUBindGroupLayout;
  private bindAB!: GPUBindGroup;
  private bindBA!: GPUBindGroup;
  private flip = false;

  // ── Force integration (merged from the Chunk 3 "additions" file) ─────────
  private forceLayout!: GPUBindGroupLayout;
  private forceAccumBuf!: GPUBuffer;
  private forceReadback!: GPUBuffer;
  private forceClear!: GPUComputePipeline;
  private forceIntegrate!: GPUComputePipeline;
  // Keyed by which raw buffer holds this step's POST-COLLISION data — i.e.
  // the collide pass's write target, not the flip flag directly. See step().
  private forceBindForPostA!: GPUBindGroup;
  private forceBindForPostB!: GPUBindGroup;

  async init(device: GPUDevice, cfg: LBMConfig) {
    this.device = device;
    this.cfg = cfg;
    this.grid = cfg.grid;

    const cells = this.grid.nx * this.grid.ny * this.grid.nz;
    const fBytes = cells * 19 * 4;

    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.fA = device.createBuffer({ size: fBytes, usage: storage });
    this.fB = device.createBuffer({ size: fBytes, usage: storage });
    this.flagBuf = device.createBuffer({ size: cells * 4, usage: storage });
    this.macroBuf = device.createBuffer({
      size: cells * 16,
      usage: storage | GPUBufferUsage.COPY_SRC,
    });
    this.paramBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.readback = device.createBuffer({
      size: cells * 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const module = device.createShaderModule({ code: LBM_WGSL });
    const constants = { NX: this.grid.nx, NY: this.grid.ny, NZ: this.grid.nz };

    this.layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });

    const make = (entryPoint: string) =>
      device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint, constants } });

    this.pipelines = {
      init: make('init'),
      collide: make('collide'),
      stream: make('stream'),
      boundary: make('boundary'),
    };

    this.bindAB = this.makeBindGroup(this.fA, this.fB);
    this.bindBA = this.makeBindGroup(this.fB, this.fA);

    this.initForceResources(constants);
  }

  private initForceResources(constants: Record<string, number>) {
    const device = this.device;
    this.forceAccumBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.forceReadback = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const module = device.createShaderModule({ code: FORCES_WGSL });
    this.forceLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.forceLayout] });

    const bind = (post: GPUBuffer) => device.createBindGroup({
      layout: this.forceLayout,
      entries: [
        { binding: 0, resource: { buffer: post } },
        { binding: 1, resource: { buffer: this.flagBuf } },
        { binding: 2, resource: { buffer: this.forceAccumBuf } },
      ],
    });

    this.forceBindForPostA = bind(this.fA);
    this.forceBindForPostB = bind(this.fB);

    this.forceClear = device.createComputePipeline({
      layout: pipelineLayout, compute: { module, entryPoint: 'clearForces', constants },
    });
    this.forceIntegrate = device.createComputePipeline({
      layout: pipelineLayout, compute: { module, entryPoint: 'integrateForces', constants },
    });
  }

  private makeBindGroup(read: GPUBuffer, write: GPUBuffer): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: read } },
        { binding: 1, resource: { buffer: write } },
        { binding: 2, resource: { buffer: this.flagBuf } },
        { binding: 3, resource: { buffer: this.macroBuf } },
        { binding: 4, resource: { buffer: this.paramBuf } },
      ],
    });
  }

  setFlags(flags: Uint32Array) {
    this.device.queue.writeBuffer(this.flagBuf, 0, flags as unknown as BufferSource);
  }

  setWindSpeed(kph: number, kinematicViscosity = 1.5e-5) {
    const ms = Math.max(kph, 1) / 3.6;
    const refLengthM = this.cfg.refLengthCells * this.grid.dx;
    const reynolds = (ms * refLengthM) / kinematicViscosity;

    const uLattice = MA_CAP;
    const nuLattice = Math.max((uLattice * this.cfg.refLengthCells) / reynolds, 1e-4);
    const tau = Math.max(3 * nuLattice + 0.5, TAU_MIN);

    const data = new Float32Array([1 / tau, uLattice, 0, 0]);
    this.device.queue.writeBuffer(this.paramBuf, 0, data as unknown as BufferSource);
  }

  /** Lattice inlet velocity, for readers that need it directly (ForceIntegrator, particles). */
  get uLattice(): number { return MA_CAP; }

  reset() {
    this.flip = false;
    this.dispatch('init', this.bindAB);
    this.flip = true;
  }

  /**
   * One or more LBM iterations. Force accumulation runs on POST-COLLISION,
   * PRE-STREAM data within the SAME pass as collide/stream/boundary — the
   * exact reflected population force integration needs only exists at that
   * point, so this must not be split into a separate submit.
   *
   * Per iteration, before flip is toggled: the main bind group is bindAB when
   * flip is currently false (fIn=fA, fOut=fB — post-collision data lands in
   * fB) or bindBA when flip is true (post-collision lands in fA). The force
   * bind group must read whichever buffer is that iteration's fOut.
   */
  step(iterations = 1) {
    for (let n = 0; n < iterations; n++) {
      const usingAB = !this.flip;
      const mainBind = usingAB ? this.bindAB : this.bindBA;
      const forceBind = usingAB ? this.forceBindForPostB : this.forceBindForPostA;

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setPipeline(this.pipelines.collide);
      pass.setBindGroup(0, mainBind);
      pass.dispatchWorkgroups(...this.workgroups());

      pass.setPipeline(this.forceClear);
      pass.setBindGroup(0, forceBind);
      pass.dispatchWorkgroups(1, 1, 1);

      pass.setPipeline(this.forceIntegrate);
      pass.setBindGroup(0, forceBind);
      pass.dispatchWorkgroups(...this.workgroups());

      pass.setPipeline(this.pipelines.stream);
      pass.setBindGroup(0, mainBind);
      pass.dispatchWorkgroups(...this.workgroups());

      pass.setPipeline(this.pipelines.boundary);
      pass.setBindGroup(0, mainBind);
      pass.dispatchWorkgroups(...this.workgroups());

      pass.end();
      this.device.queue.submit([encoder.finish()]);
      this.flip = !this.flip;
    }
  }

  async readMacros(): Promise<Float32Array> {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.macroBuf, 0, this.readback, 0, this.readback.size);
    this.device.queue.submit([encoder.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(this.readback.getMappedRange().slice(0));
    this.readback.unmap();
    return out;
  }

  /** Raw [Fx, Fy, Fz, links] accumulator from the most recently completed step(). */
  async readForces(): Promise<Int32Array> {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.forceAccumBuf, 0, this.forceReadback, 0, 16);
    this.device.queue.submit([encoder.finish()]);
    await this.forceReadback.mapAsync(GPUMapMode.READ);
    const out = new Int32Array(this.forceReadback.getMappedRange().slice(0));
    this.forceReadback.unmap();
    return out;
  }

  private dispatch(stage: keyof typeof this.pipelines, bind: GPUBindGroup) {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipelines[stage]);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(...this.workgroups());
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  private workgroups(): [number, number, number] {
    return [
      Math.ceil(this.grid.nx / 4),
      Math.ceil(this.grid.ny / 4),
      Math.ceil(this.grid.nz / 4),
    ];
  }

  destroy() {
    for (const b of [this.fA, this.fB, this.flagBuf, this.macroBuf, this.paramBuf,
                      this.readback, this.forceAccumBuf, this.forceReadback]) {
      b?.destroy();
    }
  }
}
