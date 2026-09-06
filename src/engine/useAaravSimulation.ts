import { WALL_MODEL_VALIDATED } from '../validation/wallModel';
import { summariseYPlus, type YPlusStats } from './voxel/wallGeometry';
import type { WebGLRenderer } from 'three';
import type { FlowSolver } from './FlowSolver';
import { StableFluidsSolver } from './webgl/StableFluidsSolver';
import { useEffect, useRef, useState } from 'react';
import { LBMSolver } from './webgpu/LBMSolver';
import { VoxelWorkerClient, SupersededVoxelJob } from './voxel/VoxelWorkerClient';
import { CAR_BOUNDS } from '../data/vehicles/genericCar';
import { vehicleFor, vehicleTriangleSoup } from '../data/vehicles/catalog';
import { gridCellBudget, planDomain, type DomainPlan, type ReynoldsReport } from './GridPlanner';
import { GRID_QUALITIES, TARGET_CELLS_PER_LENGTH } from './GridQuality';
import { ForceIntegrator, frontalAreaCells, wakeSize } from './ForceIntegrator';
import { ConvergenceMonitor, type ConvergenceState } from './Convergence';
import { FieldTexture } from '../render/field/FieldTexture';
import { useSimulationStore } from '../store/useSimulationStore';

const INITIAL_PLAN = planDomain(CAR_BOUNDS, TARGET_CELLS_PER_LENGTH, GRID_QUALITIES.responsive.cellBudget);
const STEPS_PER_BATCH = 1;
const READOUT_INTERVAL_MS = 200;
const DEBOUNCE_MS = 200;

export type SimStatus =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'initializing' }
  | { kind: 'voxelizing' }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

const developing = (): ConvergenceState => ({
  converged: false, developing: true, mean: 0, ci95: NaN, samples: 0, stepsRun: 0, residual: NaN,
});

interface Runtime {
  plan: DomainPlan;
  solver: FlowSolver;
  worker: VoxelWorkerClient;
  field: FieldTexture;
  integrator: ForceIntegrator;
  cdMonitor: ConvergenceMonitor;
  clMonitor: ConvergenceMonitor;
  wallGeometry: Float32Array;
  flags: Uint32Array;
  refArea: number;
  ready: boolean;
  busy: boolean;
  lastReadout: number;
  revision: number;
}

export interface AaravSimulation {
  wallStats: YPlusStats | null;
  wallModelActive: boolean;
  status: SimStatus;
  field: FieldTexture | null;
  uLattice: number;
  plan: DomainPlan;
  reynolds: ReynoldsReport | null;
  convergence: ConvergenceState;
  tick: () => void;
}

export function useAaravSimulation(renderer: WebGLRenderer | null): AaravSimulation {
  const solverPreference = useSimulationStore(s => s.solverPreference);
  const maxFieldDimension = renderer?.capabilities.isWebGL2 ? Number(renderer.getContext().getParameter((renderer.getContext() as WebGL2RenderingContext).MAX_3D_TEXTURE_SIZE)) : renderer ? 0 : null;
  const gridQuality = useSimulationStore(s => s.gridQuality);
  const vehicleId = useSimulationStore(s => s.vehicleId);
  const vehicle = vehicleFor(vehicleId);
  const [wallStats, setWallStats] = useState<YPlusStats | null>(null);
  const [plan, setPlan] = useState(INITIAL_PLAN);
  const [status, setStatus] = useState<SimStatus>({ kind: 'initializing' });
  const [field, setField] = useState<FieldTexture | null>(null);
  const [reynolds, setReynolds] = useState<ReynoldsReport | null>(null);
  const [convergence, setConvergence] = useState(developing);
  const runtimeRef = useRef<Runtime | null>(null);

  useEffect(() => {
    if (maxFieldDimension === null || !renderer) return;
    setStatus({ kind: 'initializing' });
    setWallStats(null);
    setField(null);
    setReynolds(null);
    setConvergence(developing());
    useSimulationStore.getState().invalidateReadout('Waiting for the updated grid and flow.');
    let cancelled = false;
    let device: GPUDevice | null = null;
    let solver: FlowSolver | null = null;
    let worker: VoxelWorkerClient | null = null;
    let runtime: Runtime | null = null;
    let revision = 0;
    let geometryDirty = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const store = useSimulationStore;

    const fail = (error: unknown) => {
      if (cancelled) return;
      if (runtime) runtime.ready = false;
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ kind: 'error', message });
      store.getState().invalidateReadout(message);
    };

    const resetFlow = (r: Runtime) => {
      r.revision = revision;
      const re = r.solver.setWindSpeed(store.getState().windSpeedKph);
      r.solver.reset();
      r.integrator.reset();
      r.cdMonitor.reset();
      r.clMonitor.reset();
      r.field.clear();
      r.lastReadout = -Infinity;
      r.ready = true;
      setConvergence(developing());
      setReynolds(re);
      store.getState().setTelemetry({ reynolds: re, grid: r.plan.grid, wallModel: "off — validation pending", developing: true, stepsRun: 0 });
      setStatus({ kind: 'running' });
    };

    const update = async () => {
      if (cancelled || !runtime) return;
      const r = runtime;
      const jobRevision = revision;
      try {
        if (geometryDirty) {
          setStatus({ kind: 'voxelizing' });
          const result = await r.worker.run({
            positions: vehicleTriangleSoup(vehicleId, store.getState().slotValues),
            grid: r.plan.grid,
          });
          if (cancelled || jobRevision !== revision) return;
          r.solver.setFlags(result.flags, result.fractions, result.wallGeometry);
          r.flags = result.flags;
          r.wallGeometry = result.wallGeometry;
          r.field.setFlags(result.flags);
          r.refArea = frontalAreaCells(result.flags, r.plan.grid);
          if (r.refArea === 0) throw new Error('The vehicle did not produce a solid voxel surface.');
          geometryDirty = false;
        }
        if (!cancelled && jobRevision === revision) resetFlow(r);
      } catch (error) {
        if (jobRevision === revision && !(error instanceof SupersededVoxelJob)) fail(error);
      }
    };

    const unsubscribe = store.subscribe((next, previous) => {
      if (next.gridQuality !== previous.gridQuality || next.vehicleId !== previous.vehicleId || next.solverPreference !== previous.solverPreference) {
        revision++;
        if (runtime) { runtime.ready = false; runtime.revision = revision; }
        clearTimeout(timer);
        // The effect will recreate the grid. Stop old readbacks immediately,
        // before React runs its cleanup, so they cannot revalidate old results.
        return;
      }
      const geometryChanged = next.slotValues !== previous.slotValues;
      if (!geometryChanged && next.windSpeedKph === previous.windSpeedKph) return;
      revision++;
      geometryDirty ||= geometryChanged;
      if (runtime) { runtime.ready = false; runtime.revision = revision; }
      clearTimeout(timer);
      if (runtime) {
        setStatus({ kind: 'voxelizing' });
        setConvergence(developing());
        timer = setTimeout(() => { void update(); }, DEBOUNCE_MS);
      }
    });

    const setup = async () => {
      if (!Number.isInteger(maxFieldDimension) || maxFieldDimension < 16) {
        const reason = 'The particle field requires WebGL2 with 3D texture support.';
        setStatus({ kind: 'unsupported', reason });
        store.getState().invalidateReadout(reason);
        return;
      }
      try {
        let nextPlan: DomainPlan;
        let adapter: GPUAdapter | null = null;
        if (solverPreference !== 'webgl' && navigator.gpu) {
          try { adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }); }
          catch (error) { if (solverPreference === 'webgpu') throw error; }
        }
        if (cancelled) return;
        if (!adapter && solverPreference === 'webgpu') throw new Error('No WebGPU adapter is available. Select Auto or WebGL2 fallback.');
        if (adapter) {
          device = await adapter.requestDevice();
          if (cancelled) { device.destroy(); return; }
          device.addEventListener('uncapturederror', event => fail(new Error((event as GPUUncapturedErrorEvent).error.message)));
          device.lost.then(info => { if (!cancelled) fail(new Error('WebGPU device lost: ' + info.message)); });
          const budget = gridCellBudget(device.limits, GRID_QUALITIES[gridQuality].cellBudget);
          nextPlan = planDomain(vehicle.bounds, TARGET_CELLS_PER_LENGTH, budget, Math.min(maxFieldDimension, 4 * device.limits.maxComputeWorkgroupsPerDimension));
          const lbm = new LBMSolver(); solver = lbm;
          await lbm.init(device, { grid: nextPlan.grid, refLengthCells: (vehicle.bounds.max[0]-vehicle.bounds.min[0])/nextPlan.grid.dx, smagorinsky: true, wallModel: WALL_MODEL_VALIDATED });
          store.getState().setSolverTier('medium');
        } else {
          nextPlan = planDomain(vehicle.bounds, TARGET_CELLS_PER_LENGTH, Math.min(100000, GRID_QUALITIES[gridQuality].cellBudget), maxFieldDimension);
          nextPlan.warnings.push('WebGL2 fallback uses a 100,000-cell ceiling and a diffusive stable-fluids method. Aerodynamic accuracy is unvalidated.');
          solver = new StableFluidsSolver(renderer, nextPlan.grid, (vehicle.bounds.max[0]-vehicle.bounds.min[0])/nextPlan.grid.dx);
          store.getState().setSolverTier('fallback');
        }
        setPlan(nextPlan);
        if (cancelled) { solver.destroy(); return; }
        worker = new VoxelWorkerClient();
        const texture = new FieldTexture(nextPlan.grid);
        // Discard two domain-flow-through times, measured in solver iterations.
        const transientSteps = Math.ceil(2 * nextPlan.grid.nx / solver.uLattice);
        runtime = {
          plan: nextPlan,
          solver, worker, field: texture, integrator: new ForceIntegrator(),
          cdMonitor: new ConvergenceMonitor(transientSteps, 160),
          clMonitor: new ConvergenceMonitor(transientSteps, 160),
          wallGeometry: new Float32Array(0), flags: new Uint32Array(0), refArea: 0, ready: false, busy: false, lastReadout: -Infinity, revision,
        };
        runtimeRef.current = runtime;
        setField(texture);
        await update();
      } catch (error) { fail(error); }
    };
    void setup();

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(timer);
      if (runtime) runtime.ready = false;
      runtimeRef.current = null;
      worker?.destroy();
      solver?.destroy();
      runtime?.field.dispose();
      device?.destroy();
    };
  }, [gridQuality, maxFieldDimension, vehicleId, solverPreference, renderer]);

  const tick = () => {
    const runtime = runtimeRef.current;
    if (!runtime?.ready || runtime.busy) return;
    const { solver } = runtime;
    const revision = runtime.revision;
    const current = () => runtimeRef.current === runtime && runtime.ready && revision === runtime.revision;
    runtime.busy = true;
    try {
      // A fine grid can take longer than a display frame. Never queue another
      // batch until this one (and any readback) finishes.
      solver.step(STEPS_PER_BATCH);
      solver.whenIdle().then(async () => {
        if (!current() || performance.now() - runtime.lastReadout < READOUT_INTERVAL_MS) return;
        runtime.lastReadout = performance.now();
        const snapshot = await solver.readSnapshot();
        if (!current()) return;
        const { macros, forces, stepsRun } = snapshot;
        for (let i = 0; i < macros.length; i++) {
          if (!Number.isFinite(macros[i]) || (i % 4 === 3 && macros[i] <= 0)) {
            throw new Error('Flow became unstable. Try resetting the configuration.');
          }
        }
        runtime.field.update(macros);
        if (snapshot.yPlus) setWallStats(summariseYPlus(snapshot.yPlus, runtime.wallGeometry));
        const readout = runtime.integrator.compute(forces, solver.uLattice, runtime.refArea);
        readout.wakeCells = wakeSize(macros, runtime.plan.grid, solver.uLattice, runtime.flags, vehicle.bounds.max[0]);
        if (readout.valid) {
          const cd = runtime.cdMonitor.push(readout.Cd, stepsRun);
          const cl = runtime.clMonitor.push(readout.Cl, stepsRun);
          setConvergence(cd);
          useSimulationStore.getState().setTelemetry({ convergence: cd, liftConvergence: cl });
          if (!cd.developing) { readout.Cd = cd.mean; readout.Cl = cl.mean; }
        } else {
          // Development progress still advances when a force sample is invalid.
          // Such samples never enter the statistical average.
          setConvergence(previous => ({ ...previous, stepsRun, converged: false }));
        }
        useSimulationStore.getState().applyReadout(readout);
        useSimulationStore.getState().setTelemetry({ stepsRun, status: "running", developing: stepsRun < Math.ceil(2 * runtime.plan.grid.nx / solver.uLattice) });
      }).catch(error => {
        if (runtimeRef.current !== runtime || revision !== runtime.revision) return;
        runtime.ready = false;
        const message = error instanceof Error ? error.message : String(error);
        useSimulationStore.getState().invalidateReadout(message);
        setStatus({ kind: 'error', message });
      }).finally(() => { runtime.busy = false; });
    } catch (error) {
      runtime.busy = false;
      runtime.ready = false;
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ kind: 'error', message });
      useSimulationStore.getState().invalidateReadout(message);
    }
  };

  return { wallStats, wallModelActive: WALL_MODEL_VALIDATED && useSimulationStore.getState().solverTier !== 'fallback', status, field, plan, reynolds, convergence, uLattice: runtimeRef.current?.solver.uLattice ?? 0.05, tick };
}
