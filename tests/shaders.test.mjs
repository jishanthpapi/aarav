import test from 'node:test';
import assert from 'node:assert/strict';
import { create, globals } from 'webgpu';
import { LBMSolver } from '../src/engine/webgpu/LBMSolver.ts';
Object.assign(globalThis, globals);

test('Dawn validates TRT pipelines and dispatches with SGS both on and off (no numerical execution)', async () => {
  const gpu = create(['backend=null']);
  const adapter = await gpu.requestAdapter();
  assert.ok(adapter, 'Dawn validation adapter is required.');
  const device = await adapter.requestDevice();
  const errors = [];
  device.addEventListener('uncapturederror', event => errors.push(event.error.message));
  try {
    for (const smagorinsky of [false, true]) for (const wallModel of [false, true]) {
      const solver = new LBMSolver();
      await solver.init(device, { grid: { nx: 16, ny: 16, nz: 16, dx: 1, origin: [0, 0, 0] }, refLengthCells: 4, smagorinsky, wallModel });
      device.pushErrorScope('validation');
      solver.setFlags(new Uint32Array(16 ** 3), undefined, new Float32Array(16 ** 3 * 4));
      solver.setWindSpeed(100);
      solver.reset();
      solver.step(3);
      const first = solver.readSnapshot();
      assert.equal(solver.readSnapshot(), first, 'Readback callers must share one mapping.');
      const snapshot = await first;
      assert.equal(snapshot.stepsRun, 3);
      assert.equal(snapshot.macros.length, 16 ** 3 * 4);
      // A null adapter does not execute arithmetic. Never assert numerical correctness here.
      assert.equal(await device.popErrorScope(), null);
      solver.destroy();
    }
    assert.deepEqual(errors, []);
  } finally { device.destroy(); }
});
