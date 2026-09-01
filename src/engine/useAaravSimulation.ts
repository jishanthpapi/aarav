import { useEffect, useRef, useState } from 'react';
import { LBMSolver } from './webgpu/LBMSolver';
import { voxelize, type GridSpec } from './voxel/Voxelizer';
import { boxTriangleSoup } from './geometry/boxTriangles';
import { planDomain } from './GridPlanner';
import { ForceIntegrator, frontalAreaCells } from './ForceIntegrator';
import { FieldTexture } from '../render/field/FieldTexture';
import { useSimulationStore } from '../store/useSimulationStore';

// Placeholder vehicle geometry — must match VehiclePlaceholder.tsx exactly
// (box at [0, 0.5, 0], size [2, 1, 4]) or the voxelized flow field and the
// rendered box will visibly disagree.
const VEHICLE_CENTER: [number, number, number] = [0, 0.5, 0];
const VEHICLE_SIZE: [number, number, number] = [2, 1, 4];
const CELL_BUDGET = 400_000; // conservative starting point, untuned against real hardware

export type SimStatus =
  | { kind: 'unsupported'; reason: string }
  | { kind: 'initializing' }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

export interface AaravSimulation {
  status: SimStatus;
  field: FieldTexture | null;
  uLattice: number;
  tick: () => void;
}

const STEPS_PER_FRAME = 2;
const READOUT_EVERY_N_FRAMES = 12;

/**
 * Owns the WebGPU device, the LBM solver, and the voxelize->simulate->readback
 * loop. Nothing in the source transcript connected these pieces to React —
 * this hook is new integration code, written during packaging, not extracted.
 *
 * IMPORTANT: this has been type-checked but never run against a real GPUDevice
 * — there is no browser in the environment that wrote it. Treat first runs as
 * a debugging session, not a demo.
 */
export function useAaravSimulation(): AaravSimulation {
  const [status, setStatus] = useState<SimStatus>({ kind: 'initializing' });
  const [field, setField] = useState<FieldTexture | null>(null);

  const solverRef = useRef<LBMSolver | null>(null);
  const integratorRef = useRef(new ForceIntegrator());
  const gridRef = useRef<GridSpec | null>(null);
  const refAreaRef = useRef(0);
  const frameRef = useRef(0);
  const statusRef = useRef<SimStatus>(status);
  statusRef.current = status;

  const applyReadout = useSimulationStore((s) => s.applyReadout);
  const windSpeedKph = useSimulationStore((s) => s.windSpeedKph);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
        setStatus({ kind: 'unsupported', reason: 'WebGPU is not available in this browser. The WebGL2 fallback tier has not been built yet (see HANDOFF-SOLVER.md section 4.4).' });
        return;
      }

      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          setStatus({ kind: 'unsupported', reason: 'No suitable WebGPU adapter was returned.' });
          return;
        }
        const device = await adapter.requestDevice();
        if (cancelled) return;

        device.lost.then((info) => {
          if (!cancelled) setStatus({ kind: 'error', message: `WebGPU device lost: ${info.message}` });
        });

        const bbox = {
          min: [
            VEHICLE_CENTER[0] - VEHICLE_SIZE[0] / 2,
            VEHICLE_CENTER[1] - VEHICLE_SIZE[1] / 2,
            VEHICLE_CENTER[2] - VEHICLE_SIZE[2] / 2,
          ] as [number, number, number],
          max: [
            VEHICLE_CENTER[0] + VEHICLE_SIZE[0] / 2,
            VEHICLE_CENTER[1] + VEHICLE_SIZE[1] / 2,
            VEHICLE_CENTER[2] + VEHICLE_SIZE[2] / 2,
          ] as [number, number, number],
        };

        const plan = planDomain(bbox, 24, CELL_BUDGET);
        gridRef.current = plan.grid;

        const triangles = boxTriangleSoup(VEHICLE_CENTER, VEHICLE_SIZE);
        const flags = voxelize({ positions: triangles, grid: plan.grid });
        refAreaRef.current = frontalAreaCells(flags, plan.grid);

        const refLengthCells = VEHICLE_SIZE[2] / plan.grid.dx;

        const solver = new LBMSolver();
        await solver.init(device, { grid: plan.grid, refLengthCells });
        solver.setFlags(flags);
        solver.setWindSpeed(windSpeedKph);
        solver.reset();

        if (cancelled) { solver.destroy(); return; }

        solverRef.current = solver;
        setField(new FieldTexture(plan.grid));
        setStatus({ kind: 'running' });
      } catch (err) {
        if (!cancelled) {
          setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      }
    }

    setup();
    return () => {
      cancelled = true;
      solverRef.current?.destroy();
      solverRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    solverRef.current?.setWindSpeed(windSpeedKph);
  }, [windSpeedKph]);

  const tick = () => {
    const solver = solverRef.current;
    const grid = gridRef.current;
    if (!solver || !grid || statusRef.current.kind !== 'running') return;

    solver.step(STEPS_PER_FRAME);
    frameRef.current++;

    if (frameRef.current % READOUT_EVERY_N_FRAMES === 0) {
      // Fire-and-forget: readback is async (mapAsync). Not awaited here
      // because tick() runs inside useFrame, which must stay synchronous.
      Promise.all([solver.readMacros(), solver.readForces()])
        .then(([macros, rawAccum]) => {
          field?.update(macros);
          const readout = integratorRef.current.compute(rawAccum, solver.uLattice, refAreaRef.current);
          applyReadout(readout);
        })
        .catch((err) => {
          console.error('[useAaravSimulation] readback failed', err);
        });
    }
  };

  return { status, field, uLattice: solverRef.current?.uLattice ?? 0.08, tick };
}
