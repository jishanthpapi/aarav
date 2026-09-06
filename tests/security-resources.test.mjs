import test from 'node:test';
import assert from 'node:assert/strict';
import { planDomain, gridCellBudget } from '../src/engine/GridPlanner.ts';
import { VEHICLES } from '../src/data/vehicles/catalog.ts';
import { voxelize } from '../src/engine/voxel/Voxelizer.ts';
const grid={nx:16,ny:16,nz:16,dx:1,origin:[0,0,0]};

test('planner and cell budget cannot exceed the solver memory ceiling under extreme input',()=>{
  const bounds={min:[0,0,0],max:[1,1,1]}, ceiling=Math.floor((512*1024*1024-48)/288);
  const result=planDomain(bounds,1e200,Number.MAX_SAFE_INTEGER);
  assert.ok(result.grid.nx*result.grid.ny*result.grid.nz<=ceiling);
  assert.ok(gridCellBudget({maxStorageBufferBindingSize:Number.MAX_SAFE_INTEGER,maxBufferSize:Number.MAX_SAFE_INTEGER},Number.MAX_SAFE_INTEGER)<=ceiling);
  for(const end of [0,-1,NaN,Infinity]) assert.throws(()=>planDomain({min:[0,0,0],max:[end,1,1]},24,400000));
});
test('slot geometry rejects non-finite numeric values before voxelization',()=>{
  for(const vehicle of VEHICLES)for(const slot of vehicle.slots.filter(s=>s.kind==='range'))
    for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>slot.geometryTransform(value),vehicle.id+': '+slot.slotId);
});
test('voxelization rejects malformed triangle soups before allocating cell arrays',()=>{
  for(const positions of [new Float32Array(1),new Float32Array(10),new Float32Array(9).fill(Infinity),new Float32Array(9).fill(NaN),[]])
    assert.throws(()=>voxelize({positions,grid}),/positions|triangle|finite/i);
});
test('voxelization rejects oversized grids before attempting an allocation',()=>{
  const Original=globalThis.Uint32Array;let allocated=false;
  globalThis.Uint32Array=new Proxy(Original,{construct(){allocated=true;throw new Error('Allocation attempted');}});
  try {assert.throws(()=>voxelize({positions:new Float32Array(9),grid:{...grid,nx:1e9}}),/grid|budget|limit/i);assert.equal(allocated,false);}
  finally{globalThis.Uint32Array=Original;}
});
test('worker replies with an error for malformed input and never publishes flags',async()=>{
  const previous=globalThis.self;const replies=[];
  globalThis.self={postMessage:reply=>replies.push(reply)};
  try {
    await import('../src/engine/voxel/voxel.worker.ts');
    for(const positions of [new Float32Array(1),new Float32Array(9).fill(Infinity),new Float32Array(900009)]){
      const jobId=replies.length+1;
      assert.doesNotThrow(()=>globalThis.self.onmessage({data:{jobId,positions,grid}}));
      const reply=replies.at(-1);assert.equal(reply.jobId,jobId);assert.equal(typeof reply.error,'string');assert.equal(reply.flags,undefined);
    }
  }finally{if(previous===undefined)delete globalThis.self;else globalThis.self=previous;}
});
