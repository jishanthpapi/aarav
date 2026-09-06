/// <reference types="vite/client" />
import { WebGLRenderer } from 'three';
import { StableFluidsSolver } from '../engine/webgl/StableFluidsSolver';
import { planDomain } from '../engine/GridPlanner';
import { voxelize } from '../engine/voxel/Voxelizer';
import { CAR_BOUNDS, CAR_LENGTH, carTriangleSoup, defaultCarSlots } from '../data/vehicles/genericCar';
import source from '../engine/webgl/StableFluidsSolver.ts?raw';

if (!import.meta.env.DEV) throw new Error('Runtime harness is development-only.');
document.body.style.cssText='background:#111;color:#ddd;font:16px system-ui;padding:24px';
const title=document.createElement('h1');title.textContent='Real WebGL2 stability benchmark';document.body.append(title);
const description=document.createElement('p');description.textContent='Two 3,000-step runs using the actual fallback, at 10 and 250 km/h. Every step is read back and checked. This can take several minutes.';document.body.append(description);
const button=document.createElement('button');button.textContent='Run fallback stability';document.body.append(button);
const status=document.createElement('p');status.setAttribute('role','status');document.body.append(status);
const output=document.createElement('pre');output.id='runtime-results';output.style.whiteSpace='pre-wrap';document.body.append(output);
button.onclick=async()=>{
  button.disabled=true;
  const renderer=new WebGLRenderer();renderer.setSize(64,64);document.body.append(renderer.domElement);
  const results:unknown[]=[];
  try{
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))).map(n=>n.toString(16).padStart(2,'0')).join('');
    for(const [budget,kph] of [[5000,10],[100000,250]]){
      const grid=planDomain(CAR_BOUNDS,128,budget).grid, flags=voxelize({positions:carTriangleSoup(defaultCarSlots()),grid});
      const before=renderer.info.memory.textures;
      const solver=new StableFluidsSolver(renderer,grid,CAR_LENGTH/grid.dx);
      const reynolds=solver.setWindSpeed(kph);solver.setFlags(flags);solver.reset();
      let steps=0, maxSpeed=0, fieldChecks=0;const started=performance.now();
      let failure:string|null=null;
      try{
        for(;steps<3000;steps++){
          solver.step();await solver.whenIdle();const snapshot=await solver.readSnapshot();
          if(snapshot.stepsRun!==steps+1)throw new Error('Step counter mismatch.');
          for(let i=0;i<snapshot.macros.length;i+=4){
            for(let k=0;k<4;k++)if(!Number.isFinite(snapshot.macros[i+k]))throw new Error('Non-finite field at step '+(steps+1));
            maxSpeed=Math.max(maxSpeed,Math.hypot(snapshot.macros[i],snapshot.macros[i+1],snapshot.macros[i+2]));
          }
          fieldChecks++;
          if(steps%50===0){status.textContent=`${kph} km/h · ${grid.nx*grid.ny*grid.nz} cells · ${steps+1}/3000 steps`;await new Promise(r=>setTimeout(r,0));}
        }
      }catch(error){failure=String(error);}finally{solver.destroy();}
      results.push({grid,kph,reynolds,steps,fieldChecks,maxSpeed,seconds:(performance.now()-started)/1000,failure,
        texturesBefore:before,texturesAfterDestroy:renderer.info.memory.textures});
      output.textContent=JSON.stringify({kind:'actual WebGL2 fallback execution',sourceSHA256:hash,results},null,2);
    }
    status.textContent='Runtime measurements finished.';
  }catch(error){status.textContent='Benchmark failed: '+String(error);}finally{renderer.dispose();renderer.forceContextLoss();button.disabled=false;}
};
