/**
 * Executing-GPU smoke/regression check. This is not the complete CFD benchmark
 * harness. A missing adapter is reported as unavailable and exits nonzero.
 *
 * Dawn Node bindings: https://github.com/dawn-gpu/node-webgpu
 */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { create, globals } from 'webgpu';
import { LBMSolver, type SolverSnapshot } from '../src/engine/webgpu/LBMSolver';
import { voxelize, CELL, type GridSpec } from '../src/engine/voxel/Voxelizer';
import { boxTriangleSoup } from '../src/engine/geometry/boxTriangles';
import { computeLinkFractions } from '../src/engine/voxel/linkFractions';

Object.assign(globalThis, globals);
const report: {
  kind: string; status: string; tests: { name: string; pass: boolean; detail?: string }[];
  adapter?: Record<string, string>; reason?: string;
} = { kind: 'executing-GPU smoke regression, not aerodynamic validation', status: 'not-run', tests: [] };
let device: GPUDevice | undefined;
const solvers: LBMSolver[] = [];

function finiteField(snapshot: SolverSnapshot) {
  assert.ok(snapshot.macros.every(Number.isFinite), 'Field contains NaN or Infinity.');
  for (let i = 3; i < snapshot.macros.length; i += 4) assert.ok(snapshot.macros[i] > 0, 'Non-positive density.');
}

async function main() {
  const suites = process.argv.find(arg => arg.startsWith('--suites='))?.slice(9).split(',') ?? ['smoke'];
  if (suites.some(s => s !== 'smoke')) {
    throw new Error('This runner implements --suites=smoke. The legacy aerodynamic suites are not connected yet.');
  }
  const gpu = create([]);
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    report.status = 'unavailable';
    report.reason = 'No executing WebGPU adapter. No numerical tests were run.';
    process.exitCode = 2;
    return;
  }
  report.adapter = {
    vendor: adapter.info.vendor, architecture: adapter.info.architecture,
    device: adapter.info.device, description: adapter.info.description,
  };
  device = await adapter.requestDevice();
  const errors: string[] = [];
  device.addEventListener('uncapturederror', event => errors.push(event.error.message));

  const grid: GridSpec = { nx: 32, ny: 24, nz: 24, dx: 1, origin: [0, 0, 0] };
  const positions = boxTriangleSoup([10, 11.5, 11.5], [4, 4, 4]);
  const flags = voxelize({ positions, grid });
  const fractions = computeLinkFractions(positions, flags, grid);
  const fields: SolverSnapshot[] = [];

  // Same inlet, geometry and initial equilibrium; only molecular viscosity
  // changes. Streaming old pre-collision data makes these fields identical.
  for (const viscosity of [2, 8]) {
    const solver = new LBMSolver();
    solvers.push(solver);
    await solver.init(device, { grid, refLengthCells: 4, smagorinsky: false });
    solver.setFlags(flags, fractions);
    solver.setWindSpeed(36, viscosity);
    solver.reset();
    solver.step(32);
    const pending = solver.readSnapshot();
    assert.equal(solver.readSnapshot(), pending);
    const field = await pending;
    assert.equal(field.stepsRun, 32);
    finiteField(field);
    fields.push(field);
  }
  let maxVelocityDifference = 0;
  for (let i = 0; i < fields[0].macros.length; i++) {
    if (i % 4 !== 3) maxVelocityDifference = Math.max(maxVelocityDifference,
      Math.abs(fields[0].macros[i] - fields[1].macros[i]));
  }
  assert.ok(maxVelocityDifference > 1e-5, 'Changing viscosity had no effect: collision output may have been discarded.');
  report.tests.push({ name: 'collision affects the propagated velocity field', pass: true,
    detail: 'Maximum velocity difference: ' + maxVelocityDifference.toExponential(3) });

  // Actual geometry replacement reuses the initialized solver and its buffers.
  const solver = solvers[0];
  const changedPositions = boxTriangleSoup([10, 11.5, 11.5], [6, 6, 6]);
  const changedFlags = voxelize({ positions: changedPositions, grid });
  const changedFractions = computeLinkFractions(changedPositions, changedFlags, grid);
  solver.setFlags(changedFlags, changedFractions);
  solver.reset();
  solver.step(8);
  const changed = await solver.readSnapshot();
  finiteField(changed);
  let newSolids = 0;
  for (let i = 0; i < changedFlags.length; i++) {
    if (changedFlags[i] !== CELL.SOLID || flags[i] === CELL.SOLID) continue;
    assert.deepEqual(Array.from(changed.macros.slice(i * 4, i * 4 + 4)), [0, 0, 0, 1]);
    newSolids++;
  }
  assert.ok(newSolids > 0);
  assert.equal(changed.stepsRun, 8);
  report.tests.push({ name: 'geometry replacement and reset reach the existing solver', pass: true });
  assert.deepEqual(errors, []);
  report.tests.push({ name: 'no uncaptured WebGPU errors', pass: true });
  report.status = 'passed';
}

try { await main(); }
catch (error) {
  report.status = 'failed';
  report.reason = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  for (const solver of solvers) solver.destroy();
  device?.destroy();
  await writeFile('validation-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
