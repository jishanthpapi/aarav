import type { ReynoldsReport } from './GridPlanner';
import type { SolverSnapshot } from './webgpu/LBMSolver';
export interface FlowSolver {
  readonly uLattice: number;
  stepsRun: number;
  setFlags(flags: Uint32Array, fractions?: Float32Array, wallGeometry?: Float32Array): void;
  setWindSpeed(kph: number): ReynoldsReport;
  reset(): void;
  step(iterations?: number): void;
  whenIdle(): Promise<void>;
  readSnapshot(): Promise<SolverSnapshot>;
  destroy(): void;
}
