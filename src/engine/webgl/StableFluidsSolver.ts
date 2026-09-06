import { GLSL3, DataTexture, FloatType, NearestFilter, RGBAFormat, WebGLRenderTarget, ShaderMaterial, Scene, Mesh, PlaneGeometry, OrthographicCamera, type WebGLRenderer, type Texture } from 'three';
import type { GridSpec } from '../voxel/Voxelizer';
import type { FlowSolver } from '../FlowSolver';
import { reynoldsFor } from '../GridPlanner';
import { FORCE_SCALE } from '../webgpu/forces.wgsl';

// Three-dimensional velocity/pressure fields packed into a nearest-filtered 2D atlas.
const FRAGMENT = `precision highp float;
out vec4 fragColor;
vec4 sampleTex(sampler2D tex, vec2 p) { return textureLod(tex,p,0.0); }
uniform sampler2D velocity, source, pressure, divergence, flags;
uniform vec3 dims; uniform vec2 atlas; uniform int stage; uniform float nu, inlet;
vec2 uv(vec3 p) { p=clamp(p,vec3(0),dims-1.0); float i=p.x+dims.x*(p.y+dims.y*p.z); return (vec2(mod(i,atlas.x),floor(i/atlas.x))+0.5)/atlas; }
float flag(vec3 p) { return sampleTex(flags,uv(p)).r; }
vec3 v(vec3 p) { return flag(p)==1.0 ? vec3(0) : sampleTex(velocity,uv(p)).xyz; }
float pr(vec3 p,vec3 center) { return flag(p)==1.0 ? sampleTex(pressure,uv(center)).r : sampleTex(pressure,uv(p)).r; }
vec3 interp(vec3 p) { p=clamp(p,vec3(0),dims-1.001); vec3 b=floor(p),f=fract(p); vec3 r=vec3(0);
 for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec3 d=vec3(x,y,z);vec3 w=mix(1.0-f,f,d);r+=v(b+d)*w.x*w.y*w.z;}return r; }
void main(){ float i=floor(gl_FragCoord.x)+atlas.x*floor(gl_FragCoord.y);
 vec3 p=vec3(mod(i,dims.x),mod(floor(i/dims.x),dims.y),floor(i/(dims.x*dims.y)));
 if(p.z>=dims.z){fragColor=vec4(0);return;}
 float f=flag(p); vec3 X=vec3(1,0,0),Y=vec3(0,1,0),Z=vec3(0,0,1);
 if(stage==0){fragColor=vec4(f==1.0?vec3(0):vec3(inlet,0,0),1);return;}
 if(stage<=2 || stage==5){
  vec3 u=v(p);
  if(stage==1)u=interp(p-u);
  if(stage==2)u=(sampleTex(source,uv(p)).xyz+nu*(v(p-X)+v(p+X)+v(p-Y)+v(p+Y)+v(p-Z)+v(p+Z)))/(1.0+6.0*nu);
  if(stage==5)u-=0.5*vec3(pr(p+X,p)-pr(p-X,p),pr(p+Y,p)-pr(p-Y,p),pr(p+Z,p)-pr(p-Z,p));
  if(f==1.0)u=vec3(0); else if(p.x<1.0)u=vec3(inlet,0,0);
  if(p.y<1.0||p.y>=dims.y-1.0)u.y=0.0; if(p.z<1.0||p.z>=dims.z-1.0)u.z=0.0;
  fragColor=vec4(u,1);return;
 }
 if(stage==3){float d=0.5*(v(p+X).x-v(p-X).x+v(p+Y).y-v(p-Y).y+v(p+Z).z-v(p-Z).z);fragColor=vec4(d,0,0,1);return;}
 float sum=pr(p-X,p)+pr(p+X,p)+pr(p-Y,p)+pr(p+Y,p)+pr(p-Z,p)+pr(p+Z,p);
 float value=(sum-sampleTex(divergence,uv(p)).r)/6.0;
 fragColor=vec4((f==1.0||p.x>=dims.x-1.0)?0.0:value,0,0,1);
}`;

export class StableFluidsSolver implements FlowSolver {
  readonly uLattice = 0.05;
  stepsRun = 0;
  private nu = 0.01;
  private flags: Uint32Array;
  private width: number;
  private height: number;
  private targets: WebGLRenderTarget[];
  private velocity: WebGLRenderTarget;
  private scratch: WebGLRenderTarget;
  private advected: WebGLRenderTarget;
  private pressure: WebGLRenderTarget;
  private pressureScratch: WebGLRenderTarget;
  private divergence: WebGLRenderTarget;
  private flagTexture: DataTexture;
  private material: ShaderMaterial;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1,1,1,-1,0,1);
  private geometry = new PlaneGeometry(2,2);
  private destroyed = false;
  constructor(private renderer: WebGLRenderer, private grid: GridSpec, private refLengthCells: number) {
    if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) throw new Error('WebGL2 float render targets are unavailable.');
    const n=grid.nx*grid.ny*grid.nz;
    this.width=Math.ceil(Math.sqrt(n)); this.height=Math.ceil(n/this.width);
    this.flags=new Uint32Array(n);
    this.flagTexture=new DataTexture(new Float32Array(this.width*this.height*4),this.width,this.height,RGBAFormat,FloatType);
    this.flagTexture.needsUpdate=true;
    this.targets=Array.from({length:6},()=>new WebGLRenderTarget(this.width,this.height,{type:FloatType,format:RGBAFormat,minFilter:NearestFilter,magFilter:NearestFilter,depthBuffer:false,stencilBuffer:false}));
    [this.velocity,this.scratch,this.advected,this.pressure,this.pressureScratch,this.divergence]=this.targets;
    this.material=new ShaderMaterial({glslVersion:GLSL3,depthTest:false,depthWrite:false,
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:FRAGMENT,
      uniforms:{velocity:{value:null},source:{value:null},pressure:{value:null},divergence:{value:null},flags:{value:this.flagTexture},dims:{value:[grid.nx,grid.ny,grid.nz]},atlas:{value:[this.width,this.height]},stage:{value:0},nu:{value:this.nu},inlet:{value:this.uLattice}}});
    this.scene.add(new Mesh(this.geometry,this.material));
  }
  setFlags(flags: Uint32Array) {
    if(flags.length!==this.flags.length)throw new Error('Invalid fallback flags.');
    this.flags=flags.slice();const data=this.flagTexture.image.data as unknown as Float32Array;
    flags.forEach((f,i)=>{data[i*4]=f;});this.flagTexture.needsUpdate=true;
  }
  setWindSpeed(kph:number){
    const re=reynoldsFor(kph,this.refLengthCells*this.grid.dx,this.refLengthCells,this.uLattice,false);
    this.nu=Math.max(0.01,(re.tauPlus-0.5)/3);
    const achieved=this.uLattice*this.refLengthCells/this.nu;
    return {...re,achieved,tauPlus:0.5+3*this.nu,resolutionLimited:achieved<re.requested,regime:'subcritical' as const,
      note:'WebGL2 stable fluids: low-Re educational fallback with numerical diffusion; no LBM or wall-model accuracy parity.'};
  }
  private pass(stage:number,target:WebGLRenderTarget,source?:Texture){
    if(this.destroyed)throw new Error('Fallback solver destroyed.');
    const u=this.material.uniforms;u.stage.value=stage;u.velocity.value=this.velocity.texture;
    u.source.value=source??this.advected.texture;u.pressure.value=this.pressure.texture;u.divergence.value=this.divergence.texture;u.nu.value=this.nu;
    // Avoid read/write feedback even for shader branches that do not sample a uniform.
    for(const key of ['velocity','source','pressure','divergence'])if(u[key].value===target.texture)u[key].value=this.flagTexture;
    const previous=this.renderer.getRenderTarget(); const auto=this.renderer.autoClear;
    try{this.renderer.autoClear=false;this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);}
    finally{this.renderer.setRenderTarget(previous);this.renderer.autoClear=auto;}
  }
  reset(){this.stepsRun=0;this.pass(0,this.velocity);const prev=this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.pressure);this.renderer.clearColor();this.renderer.setRenderTarget(prev);}
  step(iterations=1){for(let n=0;n<iterations;n++){
    this.pass(1,this.advected); [this.velocity,this.advected]=[this.advected,this.velocity];
    const source=this.velocity.texture;
    // Keep the advected right-hand side immutable while diffusing into two other targets.
    for(let j=0;j<8;j++){this.pass(2,this.scratch,source);[this.velocity,this.scratch]=[this.scratch,this.velocity];if(j===0)[this.scratch,this.advected]=[this.advected,this.scratch];}
    this.pass(3,this.divergence);
    for(let j=0;j<32;j++){this.pass(4,this.pressureScratch);[this.pressure,this.pressureScratch]=[this.pressureScratch,this.pressure];}
    this.pass(5,this.scratch);[this.velocity,this.scratch]=[this.scratch,this.velocity];this.stepsRun++;
  }}
  async whenIdle(){const gl=this.renderer.getContext() as WebGL2RenderingContext;const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
    if(!fence)return;try{await new Promise<void>((resolve,reject)=>{const started=Date.now();const poll=()=>{if(this.destroyed){resolve();return;}const status=gl.clientWaitSync(fence,0,0);if(status===gl.WAIT_FAILED||Date.now()-started>30000)reject(new Error('Fallback GPU wait failed.'));else if(status===gl.TIMEOUT_EXPIRED)setTimeout(poll,8);else resolve();};poll();});}finally{gl.deleteSync(fence);}}
  async readSnapshot(){
    const pixels=new Float32Array(this.width*this.height*4),p=new Float32Array(pixels.length);
    this.renderer.readRenderTargetPixels(this.velocity,0,0,this.width,this.height,pixels);
    this.renderer.readRenderTargetPixels(this.pressure,0,0,this.width,this.height,p);
    const {nx,ny,nz}=this.grid, forces=[0,0,0], normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];let faces=0;
    for(let z=1;z<nz-1;z++)for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){
      const i=x+nx*(y+ny*z);if(this.flags[i]!==1)continue;
      for(const normal of normals){const j=x+normal[0]+nx*(y+normal[1]+ny*(z+normal[2]));if(this.flags[j]!==0)continue;faces++;
        const un=normal.reduce((sum,a,k)=>sum+a*pixels[j*4+k],0);
        normal.forEach((a,k)=>{forces[k]+=-p[j*4]*a+2*this.nu*(pixels[j*4+k]-un*a);});
      }
    }
    if(forces.some(f=>!Number.isFinite(f)||Math.abs(f*FORCE_SCALE)>2147483647))throw new Error('Fallback force integration overflow.');
    return {macros:pixels.slice(0,this.flags.length*4),forces:new Int32Array([...forces.map(f=>Math.round(f*FORCE_SCALE)),faces]),stepsRun:this.stepsRun};
  }
  destroy(){this.destroyed=true;this.targets.forEach(t=>t.dispose());this.flagTexture.dispose();this.geometry.dispose();this.material.dispose();}
}
