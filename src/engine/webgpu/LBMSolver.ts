import { WALL_MODEL_WGSL } from './wallModel.wgsl';
import { COLLIDE_WITH_WALL_MODEL } from './lbm.wall.wgsl';
import { LBM_TRT_WGSL } from './lbm.trt.wgsl';
import type { GridSpec } from '../voxel/Voxelizer';
import { reynoldsFor, type ReynoldsReport } from '../GridPlanner';

// Lattice velocity, not Mach number (lattice sound speed is sqrt(1/3)).
const U_LATTICE = 0.05;

export interface LBMConfig {
  grid: GridSpec;
  refLengthCells: number;
  smagorinsky?: boolean;
  /** Experimental: leave off until physical validation gates pass. */
  wallModel?: boolean;
  /** Optional benchmark-only link-force and moment readback, in world coordinates. */
  diagnosticsOrigin?: [number, number, number];
}

export interface SolverSnapshot {
  /** Six fixed-point values per fluid cell: force xyz, moment xyz. */
  surfaceForces?: Int32Array;
  yPlus?: Float32Array;
  macros: Float32Array;
  forces: Int32Array;
  stepsRun: number;
}

export class LBMSolver {
  private device!: GPUDevice;
  private cfg!: LBMConfig;
  private wallGeom!: GPUBuffer;
  private yPlus!: GPUBuffer;
  private yPlusReadback!: GPUBuffer;
  private state!: GPUBuffer;
  private postCollision!: GPUBuffer;
  private flagBuf!: GPUBuffer;
  private fractionBuf!: GPUBuffer;
  private macroBuf!: GPUBuffer;
  private paramBuf!: GPUBuffer;
  private forceAccum!: GPUBuffer;
  private macroReadback!: GPUBuffer;
  private forceReadback!: GPUBuffer;
  private buffers: GPUBuffer[] = [];
  private pipelines!: Record<'init' | 'collide' | 'clearForces' | 'streamBounceForce' | 'boundary' | 'outlet' | 'publishMacros', GPUComputePipeline>;
  private stateToPost!: GPUBindGroup;
  private postToState!: GPUBindGroup;
  private pendingReadback: Promise<SolverSnapshot> | null = null;
  private destroyed = false;
  stepsRun = 0;
  reynolds: ReynoldsReport | null = null;

  async init(device: GPUDevice, cfg: LBMConfig) {
    this.device = device;
    this.cfg = cfg;
    const { nx, ny, nz } = cfg.grid;
    const cells = nx * ny * nz;
    if (![nx, ny, nz].every(n => Number.isInteger(n) && n >= 3) ||
        !(cfg.grid.dx > 0) || !(cfg.refLengthCells > 0)) {
      throw new Error('Invalid solver grid or reference length.');
    }
    const fBytes = cells * 19 * 4;
    if (fBytes > device.limits.maxStorageBufferBindingSize || fBytes > device.limits.maxBufferSize) {
      throw new Error('This grid exceeds the device storage-buffer limit.');
    }
    const buffer = (label: string, size: number, usage: GPUBufferUsageFlags) => {
      const b = device.createBuffer({ label, size, usage });
      this.buffers.push(b);
      return b;
    };
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    device.pushErrorScope('validation');
    try {
      this.wallGeom = buffer('Wall geometry', cells * 16, storage);
      this.yPlus = buffer('Wall y plus', cells * 4, storage | GPUBufferUsage.COPY_SRC);
      this.yPlusReadback = buffer('Wall y plus readback', cells * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      this.state = buffer('Completed timestep', fBytes, storage);
      this.postCollision = buffer('Post-collision scratch', fBytes, storage);
      this.flagBuf = buffer('Cell flags', cells * 4, storage);
      this.fractionBuf = buffer('Boundary link fractions', fBytes, storage);
      this.macroBuf = buffer('Velocity and density', cells * 16, storage | GPUBufferUsage.COPY_SRC);
      this.paramBuf = buffer('TRT parameters', 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
      const forceBytes = cfg.diagnosticsOrigin ? 16 + cells * 24 : 16;
      if (forceBytes > device.limits.maxStorageBufferBindingSize || cells * 288 + 48 + (cfg.diagnosticsOrigin ? cells * 48 : 0) > 512 * 1024 * 1024)
        throw new Error('Diagnostic buffers exceed the solver memory budget.');
      this.forceAccum = buffer('Momentum exchange', forceBytes, storage | GPUBufferUsage.COPY_SRC);
      this.macroReadback = buffer('Field readback', cells * 16, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      this.forceReadback = buffer('Force readback', forceBytes, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);

      const module = device.createShaderModule({ label: 'D3Q19 TRT + Smagorinsky', code: WALL_MODEL_WGSL + COLLIDE_WITH_WALL_MODEL + LBM_TRT_WGSL });
      const compilation = await module.getCompilationInfo();
      const errors = compilation.messages.filter(m => m.type === 'error');
      if (errors.length) throw new Error(errors.map(m => 'WGSL line ' + m.lineNum + ': ' + m.message).join('\n'));

      const layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
          { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ],
      });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
      const gridConstants = { NX: nx, NY: ny, NZ: nz };
      const make = (entryPoint: string, constants: Record<string, number> = gridConstants) =>
        device.createComputePipelineAsync({ label: entryPoint, layout: pipelineLayout, compute: { module, entryPoint, constants } });
      const [init, collide, clearForces, streamBounceForce, boundary, outlet, publishMacros] = await Promise.all([
        make('init'),
        make('collide', { ...gridConstants, SMAGORINSKY: cfg.smagorinsky === false ? 0 : 1, WALL_MODEL: cfg.wallModel === true ? 1 : 0 }),
        make('clearForces', {}),
        make('streamBounceForce', { ...gridConstants, FORCE_DIAGNOSTICS: cfg.diagnosticsOrigin ? 1 : 0,
          MOMENT_X: ((cfg.diagnosticsOrigin?.[0] ?? cfg.grid.origin[0]) - cfg.grid.origin[0]) / cfg.grid.dx,
          MOMENT_Y: ((cfg.diagnosticsOrigin?.[1] ?? cfg.grid.origin[1]) - cfg.grid.origin[1]) / cfg.grid.dx,
          MOMENT_Z: ((cfg.diagnosticsOrigin?.[2] ?? cfg.grid.origin[2]) - cfg.grid.origin[2]) / cfg.grid.dx }),
        make('boundary'),
        make('outlet'),
        make('publishMacros'),
      ]);
      this.pipelines = { init, collide, clearForces, streamBounceForce, boundary, outlet, publishMacros };
      const bind = (read: GPUBuffer, write: GPUBuffer) => device.createBindGroup({
        layout,
        entries: [read, write, this.flagBuf, this.macroBuf, this.paramBuf, this.fractionBuf, this.forceAccum, this.wallGeom, this.yPlus]
          .map((b, binding) => ({ binding, resource: { buffer: b } })),
      });
      this.stateToPost = bind(this.state, this.postCollision);
      this.postToState = bind(this.postCollision, this.state);
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      const error = await device.popErrorScope();
      if (error) {
        this.destroy();
        throw new Error(error.message);
      }
    }
  }

  setFlags(flags: Uint32Array, fractions?: Float32Array, wallGeometry?: Float32Array) {
    this.assertAlive();
    const { nx, ny, nz } = this.cfg.grid;
    const cells = nx * ny * nz;
    if (flags.length !== cells || (fractions && fractions.length !== cells * 19)) {
      throw new Error('Voxel data does not match the allocated grid.');
    }
    if (wallGeometry && wallGeometry.length !== cells * 4) throw new Error('Invalid wall geometry length.');
    if (this.cfg.wallModel && !wallGeometry) throw new Error('Wall model requires wall geometry.');
    this.device.queue.writeBuffer(this.wallGeom, 0, (wallGeometry ?? new Float32Array(cells * 4)) as unknown as BufferSource);
    this.device.queue.writeBuffer(this.yPlus, 0, new Float32Array(cells) as unknown as BufferSource);
    this.device.queue.writeBuffer(this.flagBuf, 0, flags as unknown as BufferSource);
    this.device.queue.writeBuffer(this.fractionBuf, 0,
      (fractions ?? new Float32Array(cells * 19).fill(0.5)) as unknown as BufferSource);
  }

  setWindSpeed(kph: number, kinematicViscosity = 1.5e-5): ReynoldsReport {
    this.assertAlive();
    if (!Number.isFinite(kph) || kph <= 0 || !Number.isFinite(kinematicViscosity) || kinematicViscosity <= 0) {
      throw new Error('Wind speed and viscosity must be positive and finite.');
    }
    const re = reynoldsFor(kph, this.cfg.refLengthCells * this.cfg.grid.dx,
      this.cfg.refLengthCells, U_LATTICE, this.cfg.smagorinsky !== false, kinematicViscosity);
    // Standard model parameters, never fitted to vehicle drag.
    this.device.queue.writeBuffer(this.paramBuf, 0,
      new Float32Array([1 / re.tauPlus, U_LATTICE, 0.16, 3 / 16]) as unknown as BufferSource);
    this.reynolds = re;
    return re;
  }

  get uLattice() { return U_LATTICE; }

  reset() {
    this.assertAlive();
    this.stepsRun = 0;
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    this.dispatch(pass, 'init', this.postToState); // writes the completed-state buffer
    this.dispatch(pass, 'clearForces', this.postToState, [1, 1, 1]);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  step(iterations = 1) {
    this.assertAlive();
    if (!Number.isInteger(iterations) || iterations < 1) throw new Error('Invalid iteration count.');
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    for (let n = 0; n < iterations; n++) {
      // Each dispatch is a WebGPU synchronization scope. Complete one full
      // timestep as A -> B -> A; never stream from the pre-collision A.
      this.dispatch(pass, 'collide', this.stateToPost);
      this.dispatch(pass, 'clearForces', this.postToState, [1, 1, 1]);
      this.dispatch(pass, 'streamBounceForce', this.postToState);
      this.dispatch(pass, 'boundary', this.postToState);
      // Separate outlet dispatch avoids reading edge cells while walls write them.
      this.dispatch(pass, 'outlet', this.postToState);
    }
    this.dispatch(pass, 'publishMacros', this.stateToPost);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.stepsRun += iterations;
  }

  private dispatch(pass: GPUComputePassEncoder, stage: keyof typeof this.pipelines,
    bind: GPUBindGroup, workgroups?: [number, number, number]) {
    const { nx, ny, nz } = this.cfg.grid;
    pass.setPipeline(this.pipelines[stage]);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(...(workgroups ?? [Math.ceil(nx / 4), Math.ceil(ny / 4), Math.ceil(nz / 4)] as [number, number, number]));
  }

  readSnapshot(): Promise<SolverSnapshot> {
    this.assertAlive();
    // Callers share one transfer. Never copy into an already mapped buffer.
    if (this.pendingReadback) return this.pendingReadback;
    const stepsRun = this.stepsRun;
    const read = async () => {
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(this.macroBuf, 0, this.macroReadback, 0, this.macroReadback.size);
      encoder.copyBufferToBuffer(this.forceAccum, 0, this.forceReadback, 0, this.forceReadback.size);
      if (this.cfg.wallModel) encoder.copyBufferToBuffer(this.yPlus, 0, this.yPlusReadback, 0, this.yPlusReadback.size);
      this.device.queue.submit([encoder.finish()]);
      try {
        const maps = await Promise.allSettled([
          this.macroReadback.mapAsync(GPUMapMode.READ),
          this.forceReadback.mapAsync(GPUMapMode.READ),
          ...(this.cfg.wallModel ? [this.yPlusReadback.mapAsync(GPUMapMode.READ)] : []),
        ]);
        for (const result of maps) if (result.status === 'rejected') throw result.reason;
        return {
          yPlus: this.cfg.wallModel ? new Float32Array(this.yPlusReadback.getMappedRange().slice(0)) : undefined,
          macros: new Float32Array(this.macroReadback.getMappedRange().slice(0)),
          forces: new Int32Array(this.forceReadback.getMappedRange().slice(0,16)),
          surfaceForces: this.cfg.diagnosticsOrigin ? new Int32Array(this.forceReadback.getMappedRange().slice(16)) : undefined,
          stepsRun,
        };
      } finally {
        if (this.macroReadback.mapState === 'mapped') this.macroReadback.unmap();
        if (this.yPlusReadback.mapState === 'mapped') this.yPlusReadback.unmap();
        if (this.forceReadback.mapState === 'mapped') this.forceReadback.unmap();
      }
    };
    this.pendingReadback = read().finally(() => { this.pendingReadback = null; });
    return this.pendingReadback;
  }

  async readMacros() { return (await this.readSnapshot()).macros; }
  async readForces() { return (await this.readSnapshot()).forces; }

  whenIdle(): Promise<void> {
    this.assertAlive();
    return this.device.queue.onSubmittedWorkDone();
  }

  private assertAlive() {
    if (this.destroyed || !this.pipelines) throw new Error('Solver is not initialized or has been destroyed.');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const buffer of this.buffers) buffer.destroy();
    this.buffers = [];
  }
}
