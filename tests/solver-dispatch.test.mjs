import test from 'node:test';
import assert from 'node:assert/strict';
import { globals } from 'webgpu';
import { LBMSolver } from '../src/engine/webgpu/LBMSolver.ts';
Object.assign(globalThis, globals);

function recordingDevice() {
  const submitted = [];
  let id = 0;
  return {
    submitted,
    limits: { maxStorageBufferBindingSize: 128 * 1024 * 1024, maxBufferSize: 256 * 1024 * 1024 },
    pushErrorScope() {},
    async popErrorScope() { return null; },
    createBuffer(desc) { return { ...desc, id: ++id, destroy() {} }; },
    createShaderModule() { return { async getCompilationInfo() { return { messages: [] }; } }; },
    createBindGroupLayout(desc) { return desc; },
    createPipelineLayout(desc) { return desc; },
    async createComputePipelineAsync(desc) { return desc.compute; },
    createBindGroup(desc) { return desc; },
    createCommandEncoder() {
      const commands = [];
      let pipeline, group;
      return {
        beginComputePass() { return {
          setPipeline(p) { pipeline = p; }, setBindGroup(_, g) { group = g; },
          dispatchWorkgroups(...workgroups) { commands.push({ entry: pipeline.entryPoint, group, workgroups }); },
          end() {},
        }; },
        finish() { return commands; },
      };
    },
    queue: { writeBuffer() {}, submit(batches) { submitted.push(...batches.flat()); } },
  };
}

test('collision output is consumed by streaming and carried into the next full timestep', async () => {
  const device = recordingDevice(), solver = new LBMSolver();
  await solver.init(device, { grid: { nx: 8, ny: 8, nz: 8, dx: 1, origin: [0, 0, 0] }, refLengthCells: 4 });
  solver.setWindSpeed(100);
  solver.reset();
  solver.step(2);
  const buffer = (command, binding) => command.group.entries[binding].resource.buffer;
  const init = device.submitted.find(c => c.entry === 'init');
  const collisions = device.submitted.filter(c => c.entry === 'collide');
  const streams = device.submitted.filter(c => c.entry === 'streamBounceForce');
  const macros = device.submitted.find(c => c.entry === 'publishMacros');
  assert.equal(collisions.length, 2);
  assert.equal(streams.length, 2);
  assert.equal(buffer(init, 1), buffer(collisions[0], 0), 'First collision must read initialized state.');
  for (let i = 0; i < 2; i++) {
    assert.equal(buffer(streams[i], 0), buffer(collisions[i], 1), 'Streaming must read collision output.');
    assert.notEqual(buffer(streams[i], 0), buffer(streams[i], 1), 'Streaming may not read/write the same buffer.');
  }
  assert.equal(buffer(collisions[1], 0), buffer(streams[0], 1), 'Next collision must read the streamed state.');
  assert.equal(buffer(macros, 0), buffer(streams[1], 1), 'Readouts must describe the completed timestep.');
  assert.equal(solver.stepsRun, 2);
  solver.destroy();
});

test('reset remains valid after either an odd or an even number of timesteps', async () => {
  const device = recordingDevice(), solver = new LBMSolver();
  await solver.init(device, { grid: { nx: 8, ny: 8, nz: 8, dx: 1, origin: [0, 0, 0] }, refLengthCells: 4 });
  solver.setWindSpeed(100);
  for (const n of [1, 2, 3]) {
    solver.reset();
    const initialized = device.submitted.at(-2).group.entries[1].resource.buffer;
    solver.step(n);
    const last = device.submitted.at(-1);
    assert.equal(last.entry, 'publishMacros');
    assert.equal(last.group.entries[0].resource.buffer, initialized);
    assert.equal(solver.stepsRun, n);
  }
  solver.destroy();
});
