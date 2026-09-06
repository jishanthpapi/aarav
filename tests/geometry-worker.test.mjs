import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenericCar, carTriangleSoup, defaultCarSlots, genericCar, CAR_BOUNDS, CAR_LENGTH } from '../src/data/vehicles/genericCar.ts';
import { planDomain, reynoldsFor } from '../src/engine/GridPlanner.ts';
import { voxelize, CELL } from '../src/engine/voxel/Voxelizer.ts';
import { computeLinkFractions } from '../src/engine/voxel/linkFractions.ts';
import { VoxelWorkerClient, SupersededVoxelJob } from '../src/engine/voxel/VoxelWorkerClient.ts';
import { ConvergenceMonitor } from '../src/engine/Convergence.ts';
import { wakeSize } from '../src/engine/ForceIntegrator.ts';
import { useSimulationStore } from '../src/store/useSimulationStore.ts';

test('rendering and voxelization consume exactly the same car triangles on the X axis', () => {
  const values = defaultCarSlots();
  const rendered = new Float32Array(buildGenericCar(values).flatMap(m => Array.from(m.positions)));
  assert.deepEqual(carTriangleSoup(values), rendered);
  for (const mesh of buildGenericCar(values)) {
    let volume6 = 0;
    const p = mesh.positions;
    for (let i = 0; i < p.length; i += 9) {
      volume6 += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7])
        + p[i + 1] * (p[i + 5] * p[i + 6] - p[i + 3] * p[i + 8])
        + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
    }
    assert.ok(volume6 > 0, mesh.id + ' has inward faces and would be culled by the renderer.');
  }
  const xs = Array.from(rendered).filter((_, i) => i % 3 === 0);
  assert.ok(Math.min(...xs) >= CAR_BOUNDS.min[0]);
  assert.ok(Math.max(...xs) <= CAR_BOUNDS.max[0]);
  const plan = planDomain(CAR_BOUNDS, 24, 400_000);
  assert.ok(Math.abs(plan.cellsPerLength - CAR_LENGTH / plan.grid.dx) < 1e-10);
  assert.ok(plan.grid.nx * plan.grid.ny * plan.grid.nz <= 400_000);
});

test('front splitter toggle adds and removes the visible shared mesh', () => {
  const off = buildGenericCar({ ...defaultCarSlots(), frontSplitter: false });
  const on = buildGenericCar({ ...defaultCarSlots(), frontSplitter: true });
  assert.equal(off.some(mesh => mesh.id === 'front-splitter'), false);
  const splitter = on.find(mesh => mesh.id === 'front-splitter');
  assert.ok(splitter);
  assert.ok(Math.min(...Array.from(splitter.positions).filter((_, i) => i % 3 === 0)) < -2);
  assert.ok(carTriangleSoup({ ...defaultCarSlots(), frontSplitter: true }).length >
    carTriangleSoup({ ...defaultCarSlots(), frontSplitter: false }).length);
});

test('every permitted geometry extreme fits the same preallocated domain', () => {
  for (const wingAngle of [0, 24]) for (const diffuser of [false, true]) for (const frontSplitter of [false, true]) for (const rideHeight of [0.1, 0.6]) {
    const vertices = carTriangleSoup({ wingAngle, diffuser, frontSplitter, rideHeight });
    for (let i = 0; i < vertices.length; i++) {
      assert.ok(Number.isFinite(vertices[i]));
      assert.ok(vertices[i] >= CAR_BOUNDS.min[i % 3] - 1e-6 && vertices[i] <= CAR_BOUNDS.max[i % 3] + 1e-6);
    }
  }
});

test('all four controls change the geometry the solver receives', () => {
  const plan = planDomain(CAR_BOUNDS, 24, 400_000);
  const input = values => {
    const positions = carTriangleSoup(values);
    const flags = voxelize({ positions, grid: plan.grid });
    return { flags, fractions: computeLinkFractions(positions, flags, plan.grid) };
  };
  const base = input(defaultCarSlots());
  assert.ok(base.flags.some(v => v === CELL.SOLID));
  for (const change of [{ wingAngle: 24 }, { diffuser: false }, { frontSplitter: true }, { rideHeight: 0.6 }]) {
    const next = input({ ...defaultCarSlots(), ...change });
    const changedFlags = next.flags.some((v, i) => v !== base.flags[i]);
    const changedLinks = next.fractions.some((v, i) => v !== base.fractions[i]);
    assert.ok(changedFlags || changedLinks, JSON.stringify(change) + ' did not reach the lattice.');
  }
});

class FakeWorker {
  sent = [];
  terminated = false;
  postMessage(message) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(jobId) { this.onmessage({ data: { jobId, flags: new Uint32Array(1), fractions: new Float32Array(19) } }); }
}
const input = () => ({ positions: new Float32Array(9), grid: { nx: 4, ny: 4, nz: 4, dx: 1, origin: [0, 0, 0] } });

test('worker backpressure keeps only the newest queued slider change', async () => {
  const worker = new FakeWorker(), client = new VoxelWorkerClient(() => worker);
  const first = client.run(input());
  const obsolete = client.run(input());
  const rejected = assert.rejects(obsolete, SupersededVoxelJob);
  const latest = client.run(input());
  assert.equal(worker.sent.length, 1);
  worker.reply(worker.sent[0].jobId);
  await first;
  await rejected;
  assert.equal(worker.sent.length, 2);
  assert.equal(worker.sent[1].jobId, 3);
  worker.reply(3);
  assert.equal((await latest).jobId, 3);
  client.destroy();
});

test('closing the worker rejects all pending callers and ignores late replies', async () => {
  const worker = new FakeWorker(), client = new VoxelWorkerClient(() => worker);
  const active = assert.rejects(client.run(input()), SupersededVoxelJob);
  const queued = assert.rejects(client.run(input()), SupersededVoxelJob);
  client.destroy();
  worker.reply(1);
  await Promise.all([active, queued]);
  assert.equal(worker.terminated, true);
  await assert.rejects(client.run(input()), /unavailable/);
});

test('geometry changes invalidate previous coefficients immediately and clamp inputs', () => {
  const store = useSimulationStore;
  store.getState().resetConfiguration();
  store.getState().applyReadout({ Cd: 0.3, Cl: -0.2, wakeCells: 10, refAreaCells: 100, valid: true });
  store.getState().setSlotValue('wingAngle', 999);
  assert.equal(store.getState().slotValues.wingAngle, 24);
  assert.equal(store.getState().readoutValid, false);
  assert.throws(() => store.getState().setSlotValue('rideHeight', NaN));
  assert.equal(genericCar.slots.length, 4);
  store.getState().resetConfiguration();
});

test('Reynolds reporting does not claim SGS restores a clamped molecular Reynolds number', () => {
  const re = reynoldsFor(100, 4, 15, 0.05, true);
  assert.equal(re.resolutionLimited, true);
  assert.ok(re.achieved < re.requested);
  assert.match(re.note, /does not restore/);
});

test('convergence warmup uses solver timesteps, not the number of readbacks', () => {
  const monitor = new ConvergenceMonitor(100, 4);
  assert.equal(monitor.push(1, 48).developing, true);
  const after = monitor.push(1, 120);
  assert.equal(after.developing, false);
  assert.equal(after.stepsRun, 120);
  assert.equal(after.samples, 1);
});

test('wake count excludes solids, boundaries and upstream slow flow', () => {
  const g = { nx: 5, ny: 1, nz: 1, dx: 1, origin: [0, 0, 0] };
  const macros = new Float32Array(20);
  for (let i = 0; i < 5; i++) macros.set([0.01, 0, 0, 1], i * 4);
  const flags = new Uint32Array([CELL.FLUID, CELL.FLUID, CELL.SOLID, CELL.FLUID, CELL.OUTLET]);
  assert.equal(wakeSize(macros, g, 0.05, flags, 1), 1);
});
