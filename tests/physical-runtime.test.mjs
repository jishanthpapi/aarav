import test from 'node:test';
import assert from 'node:assert/strict';
import { create, globals } from 'webgpu';
import { LBMSolver } from '../src/engine/webgpu/LBMSolver.ts';
import { voxelize } from '../src/engine/voxel/Voxelizer.ts';
Object.assign(globalThis,globals);
const options={skip:process.env.AARAV_EXECUTING_GPU!=='1'?'Run node scripts/run-physical-tests.mjs on an executing GPU.':false};

test('executing GPU: a uniform empty free-slip tunnel preserves inlet velocity',options,async()=>{
  const gpu=create([]),adapter=await gpu.requestAdapter();assert.ok(adapter,'An executing adapter is required.');
  const device=await adapter.requestDevice(),solver=new LBMSolver();
  try{
    const grid={nx:32,ny:16,nz:16,dx:1,origin:[0,0,0]},flags=voxelize({positions:new Float32Array(0),grid});
    await solver.init(device,{grid,refLengthCells:4,smagorinsky:false});solver.setFlags(flags);solver.setWindSpeed(36,32);solver.reset();solver.step(128);
    const {macros}=await solver.readSnapshot();let error=0;
    for(let i=0;i<macros.length;i+=4)error=Math.max(error,Math.abs(macros[i]-solver.uLattice),Math.abs(macros[i+1]),Math.abs(macros[i+2]));
    assert.ok(error<1e-5,'Uniform-flow velocity error: '+error);
  }finally{solver.destroy();device.destroy();}
});
