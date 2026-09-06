import { create, globals } from 'webgpu';
import { writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runSteadyCase } from './physical-cases';
import { boxTriangleSoup } from '../src/engine/geometry/boxTriangles';
import { checkModelInertWhenResolved, checkYPlusBand } from '../src/validation/wallModel';
import { WallModelRow } from '../src/components/ui/AccuracyPanel.wall';
Object.assign(globalThis,globals);
const gpu=create([]), adapter=await gpu.requestAdapter();
if(!adapter)throw new Error('No executing WebGPU adapter: no measurements made.');
const device=await adapter.requestDevice();
const errors:string[]=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
try {
  const cases=[];
  for(const wallModel of [false,true]){
    const result=await runSteadyCase(device,{id:'resolved-block-'+(wallModel?'on':'off'),
      grid:{nx:32,ny:16,nz:16,dx:1,origin:[0,0,0]},positions:boxTriangleSoup([10,7.5,7.5],[4,2,4]),
      length:4,kph:36,viscosity:32,wallModel,maxSteps:12000});
    cases.push(result);console.log(JSON.stringify({id:result.id,steps:result.steps,Cd:result.Cd,converged:result.convergence.converged,yPlus:result.yPlus}));
  }
  const [off,on]=cases;
  const inert=checkModelInertWhenResolved(off.Cd??NaN,on.Cd??NaN,on.maxYPlusAcrossRun);
  const markup=renderToStaticMarkup(createElement(WallModelRow,{stats:on.yPlus,active:true}));
  const coverage=checkYPlusBand({...on.yPlus!,uiWarnsCoverage:markup.includes('Only')});
  const inertMeasured=off.convergence.converged&&on.convergence.converged;
  const report={adapter:{vendor:adapter.info.vendor,device:adapter.info.device,description:adapter.info.description},cases,
    gates:[{id:inert.id,pass:inertMeasured&&inert.pass,measured:inertMeasured,checker:inert},
      {id:coverage.id,pass:!!on.yPlus&&coverage.pass,measured:!!on.yPlus,checker:coverage,uiMarkup:markup}],errors};
  await writeFile('docs/wall-resolved-measurements.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({gates:report.gates,errors},null,2));
}finally{device.destroy();}
