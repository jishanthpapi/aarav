import { createHash } from 'node:crypto';
import { LBMSolver } from '../src/engine/webgpu/LBMSolver';
import { voxelize, type GridSpec } from '../src/engine/voxel/Voxelizer';
import { computeLinkFractions } from '../src/engine/voxel/linkFractions';
import { computeWallGeometry, summariseYPlus } from '../src/engine/voxel/wallGeometry';
import { ForceIntegrator, frontalAreaCells } from '../src/engine/ForceIntegrator';
import { ConvergenceMonitor } from '../src/engine/Convergence';

export async function runSteadyCase(device: GPUDevice, input: {
  id: string; grid: GridSpec; positions: Float32Array; length: number; wallModel: boolean;
  kph?: number; viscosity?: number; maxSteps?: number; sampleEvery?: number;
  diagnosticsOrigin?: [number,number,number];
}) {
  const started=Date.now(), {grid,positions}=input;
  const flags=voxelize({positions,grid}), fractions=computeLinkFractions(positions,flags,grid);
  const wallGeometry=computeWallGeometry(flags,fractions,grid);
  const solver=new LBMSolver(), integrator=new ForceIntegrator();
  await solver.init(device,{grid,refLengthCells:input.length/grid.dx,smagorinsky:true,wallModel:input.wallModel,diagnosticsOrigin:input.diagnosticsOrigin});
  try {
    solver.setFlags(flags,fractions,wallGeometry);
    const reynolds=solver.setWindSpeed(input.kph??100,input.viscosity??1.5e-5);
    solver.reset();
    const warmup=Math.ceil(2*grid.nx/solver.uLattice), every=input.sampleEvery??16;
    const monitor=new ConvergenceMonitor(warmup,160);
    const area=frontalAreaCells(flags,grid), samples: {steps:number;Cd:number;Cl:number;side:number;pitch:number;leftLift:number;rightLift:number}[]=[];
    let convergence=monitor.push(NaN,0), lastSnapshot;
    let maxYPlus=0, maxSpeed=0, minDensity=Infinity, maxDensity=0;
    for(let steps=0;steps<(input.maxSteps??12000);steps+=every){
      solver.step(every);lastSnapshot=await solver.readSnapshot();
      for(let i=0;i<lastSnapshot.macros.length;i+=4){
        const values=lastSnapshot.macros.subarray(i,i+4);
        if(!values.every(Number.isFinite)||values[3]<=0)throw new Error(input.id+': non-finite field or non-positive density at step '+solver.stepsRun);
        maxSpeed=Math.max(maxSpeed,Math.hypot(values[0],values[1],values[2]));minDensity=Math.min(minDensity,values[3]);maxDensity=Math.max(maxDensity,values[3]);
      }
      if(lastSnapshot.yPlus){
        if(!lastSnapshot.yPlus.every(Number.isFinite))throw new Error(input.id+': non-finite y+');
        for(const value of lastSnapshot.yPlus)maxYPlus=Math.max(maxYPlus,value);
      }
      const r=integrator.compute(lastSnapshot.forces,solver.uLattice,area);
      if(!r.valid)continue;
      convergence=monitor.push(r.Cd,solver.stepsRun);
      if(!convergence.developing){
        let pitch=0,leftLift=0,rightLift=0;
        if(lastSnapshot.surfaceForces)for(let i=0;i<flags.length;i++){
          pitch+=lastSnapshot.surfaceForces[i*6+5]/100000;
          const z=grid.origin[2]+Math.floor(i/(grid.nx*grid.ny))*grid.dx;
          const x=grid.origin[0]+(i%grid.nx)*grid.dx;
          if(x>-1.5 && x<1.5 && Math.abs(z)>1.3){if(z<0)leftLift+=lastSnapshot.surfaceForces[i*6+1]/100000;else rightLift+=lastSnapshot.surfaceForces[i*6+1]/100000;}
        }
        samples.push({steps:solver.stepsRun,Cd:r.Cd,Cl:r.Cl,side:2*(lastSnapshot.forces[2]/100000)/(solver.uLattice**2*area),pitch,leftLift,rightLift});
      }
      if(convergence.converged)break;
    }
    if(!lastSnapshot)throw new Error('No solver output.');
    const window=samples.slice(-160);
    const mean=(key:'Cd'|'Cl'|'side'|'pitch'|'leftLift'|'rightLift')=>window.length?window.reduce((sum,s)=>sum+s[key],0)/window.length:null;
    return { id:input.id, grid, wallModel:input.wallModel, reynolds, warmup, convergence,
      elapsedSeconds:(Date.now()-started)/1000, steps:solver.stepsRun, sampledSteps:Math.ceil(solver.stepsRun/every),
      sampleEvery:every, finiteAtEverySample:true, maxSpeed,minDensity,maxDensity,
      Cd:mean('Cd'),Cl:mean('Cl'),side:mean('side'),pitch:mean('pitch'),leftLift:mean('leftLift'),rightLift:mean('rightLift'), samples:window,
      maxYPlusAcrossRun:maxYPlus, yPlus:lastSnapshot.yPlus?summariseYPlus(lastSnapshot.yPlus,wallGeometry):null,
      geometryHash:createHash('sha256').update(positions).digest('hex'), flagsHash:createHash('sha256').update(flags).digest('hex'),
      solidCells:flags.reduce((sum,f)=>sum+Number(f===1),0), referenceAreaCells:area };
  } finally {solver.destroy();}
}
