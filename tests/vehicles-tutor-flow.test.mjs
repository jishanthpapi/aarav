import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES, defaultsFor, vehicleTriangleSoup } from '../src/data/vehicles/catalog.ts';
import { useSimulationStore } from '../src/store/useSimulationStore.ts';
import { runAaravTool, snapshotSceneState } from '../src/engine/aaravToolHandlers.ts';
import { FieldTexture } from '../src/render/field/FieldTexture.ts';
import { traceFlowLines } from '../src/render/field/traceFlowLines.ts';
import handler from '../api/aarav-chat.ts';

test('all ten vehicles provide finite shared rendering/solver geometry and each control changes it', () => {
  assert.equal(VEHICLES.length, 10);
  for (const vehicle of VEHICLES) {
    const values=defaultsFor(vehicle.id), base=vehicleTriangleSoup(vehicle.id,values);
    assert.ok(base.length>0 && base.length%9===0);
    assert.ok(base.every(Number.isFinite));
    assert.equal(base.length,vehicle.build(values).reduce((n,m)=>n+m.positions.length,0));
    for(const slot of vehicle.slots){
      const changed={...values,[slot.slotId]:slot.kind==='toggle'?!values[slot.slotId]:slot.range.max};
      assert.notDeepEqual(vehicleTriangleSoup(vehicle.id,changed),base,vehicle.id+': '+slot.slotId);
    }
  }
});
test('aircraft controls stay in declared bounds at extrema',()=>{
  const v=VEHICLES.find(v=>v.type==='plane');
  for(const edge of ['min','max']){
    const values=Object.fromEntries(v.slots.map(s=>[s.slotId,s.range[edge]]));
    const soup=vehicleTriangleSoup(v.id,values);
    for(let i=0;i<soup.length;i++)assert.ok(soup[i]>=v.bounds.min[i%3]-1e-5 && soup[i]<=v.bounds.max[i%3]+1e-5,`axis ${i%3}: ${soup[i]}`);
  }
});
test('tutor tools use current vehicle, reject invalid slots and values, and invalidate old measurements',()=>{
  const s=useSimulationStore.getState();s.setVehicle('generic-plane');s.updateComputed({Cd:0.3});
  assert.ok(runAaravTool('set_part',{slotId:'wingAngle',value:10}).error);
  assert.ok(runAaravTool('set_part',{slotId:'rudder',value:'25'}).error);
  assert.ok(runAaravTool('set_part',{slotId:'rudder',value:100}).error);
  assert.ok(runAaravTool('set_part',{slotId:'rudder',value:-100}).error);
  assert.equal(runAaravTool('set_part',{slotId:'rudder',value:25}).value,25);
  assert.equal(snapshotSceneState().readoutValid,false);
  assert.equal(snapshotSceneState().availableSlots.length,5);
  assert.ok(runAaravTool('start_lesson',{lessonId:'ground-effect'}).error);
  s.setVehicle('generic-car');assert.equal(runAaravTool('start_lesson',{lessonId:'ground-effect'}).ok,true);
  assert.equal(useSimulationStore.getState().lessonId,'ground-effect');
});
test('hostile tool arguments are rejected without changing any scene state',()=>{
  useSimulationStore.getState().setVehicle('generic-car');
  const base = useSimulationStore.getState();
  const nested = {}; let cursor = nested;
  for(let i=0;i<200;i++) cursor = cursor.child = {};
  for(const input of [JSON.parse('{"__proto__":{"polluted":true}}'), {constructor:{prototype:{polluted:true}}}, nested,
    42, 'text', null, [], {slotId:'wingAngle',value:{}}, {slotId:'wingAngle',value:Infinity},
    {slotId:'wingAngle',value:8,extra:{constructor:true}}]) {
    assert.ok(runAaravTool('get_scene_state',input).error, 'Unexpected input must be explicitly rejected');
    assert.ok(runAaravTool('set_part',input).error);
    assert.equal(useSimulationStore.getState(),base);
  }
  assert.equal({}.polluted,undefined);
});
test('unknown model tool names are rejected without executing their content',()=>{
  const base=useSimulationStore.getState();
  for(const name of ['eval','constructor','__proto__','import','globalThis.compromised=true']) {
    assert.match(runAaravTool(name,{}).error,/Unknown tool/);
    assert.equal(useSimulationStore.getState(),base);
  }
  assert.equal(globalThis.compromised,undefined);
});
test('flow traces follow the sampled field and stop at a solid obstacle',()=>{
  const grid={nx:40,ny:16,nz:16,dx:0.25,origin:[-3,-1,-2]}, field=new FieldTexture(grid);
  const data=new Float32Array(40*16*16*4);for(let i=0;i<data.length;i+=4){data[i]=0.05;data[i+3]=1;}field.update(data);
  const bounds={min:[0,0,-0.5],max:[1,1,0.5]};const clear=traceFlowLines(field,bounds,0.05);
  assert.ok(clear.positions.length>0);
  const flags=new Uint32Array(40*16*16);for(let z=0;z<16;z++)for(let y=0;y<16;y++)flags[16+40*(y+16*z)]=1;field.setFlags(flags);
  const blocked=traceFlowLines(field,bounds,0.05);assert.ok(blocked.positions.length<clear.positions.length);
  field.clear();assert.equal(traceFlowLines(field,bounds,0.05).positions.length,0);field.dispose();
});
test('tutor backend clearly reports missing configuration without calling provider',async()=>{
  const saved=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;
  try {const response=await handler(new Request('http://localhost/api/aarav-chat',{method:'POST',headers:{Origin:'http://localhost'},body:JSON.stringify({messages:[{role:'user',content:'Explain'}],sceneState:snapshotSceneState()})}));assert.equal(response.status,503);assert.match((await response.json()).error,/server API key/);}
  finally{if(saved)process.env.ANTHROPIC_API_KEY=saved;}
});
