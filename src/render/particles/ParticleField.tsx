import { useState, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from 'three';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { ADVECT_FRAGMENT, PARTICLE_VERTEX, PARTICLE_FRAGMENT } from './advect.glsl';
import type { FieldTexture } from '../field/FieldTexture';

interface ParticleResources {
  gpu: GPUComputationRenderer;
  posVar: Variable;
  geometry: BufferGeometry;
  material: ShaderMaterial;
}

interface Props { field: FieldTexture; n?: number; uInlet: number; enabled?: boolean; }

export function ParticleField({ field, n = 128, uInlet, enabled = true }: Props) {
  const { gl } = useThree();
  const [resources, setResources] = useState<ParticleResources | null>(null);
  const active = useRef<ParticleResources | null>(null);
  // Own GPU resources in the effect, so StrictMode's setup/cleanup/setup cycle
  // creates a fresh computation renderer instead of reusing a disposed one.
  useEffect(() => {
    const { nx, ny, nz, dx, origin } = field.grid;
    const gpu = new GPUComputationRenderer(n, n, gl);
    const seed = gpu.createTexture();
    const d = seed.image.data as unknown as Float32Array;
    for (let i = 0; i < n * n; i++) {
      d[i * 4] = Math.random();
      d[i * 4 + 1] = 0.02 + Math.random() * 0.96;
      d[i * 4 + 2] = 0.02 + Math.random() * 0.96;
      d[i * 4 + 3] = Math.random() * 8;
    }
    const posVar = gpu.addVariable('texturePosition', ADVECT_FRAGMENT, seed);
    gpu.setVariableDependencies(posVar, [posVar]);
    Object.assign(posVar.material.uniforms, {
      uField: { value: field.texture },
      uGrid: { value: new Vector3(nx, ny, nz) },
      uDt: { value: 0 }, uSpeedScale: { value: nx / Math.max(uInlet, 1e-6) / 8 },
      uTime: { value: 0 },
    });
    const err = gpu.init();
    if (err) {
      gpu.dispose();
      throw new Error('Particle rendering failed: ' + err);
    }
    const geometry = new BufferGeometry();
    const refs = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) {
      refs[i * 3] = ((i % n) + 0.5) / n;
      refs[i * 3 + 1] = (Math.floor(i / n) + 0.5) / n;
    }
    geometry.setAttribute('position', new BufferAttribute(refs, 3));
    const material = new ShaderMaterial({
      uniforms: {
        uPositions: { value: null }, uField: { value: field.texture },
        // Texture coordinate zero is half a cell before the first cell centre.
        uOrigin: { value: new Vector3(...origin).addScalar(-0.5 * dx) },
        uDomainSize: { value: new Vector3(nx * dx, ny * dx, nz * dx) },
        // A small pixel size prevents near-camera particles from obscuring
        // the vehicle when additive blending accumulates many points.
        uMaxSpeed: { value: uInlet }, uPointSize: { value: 1.15 },
      },
      vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT,
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      // Three r160 supplies the GLSL 3 compatibility preamble on WebGL2.
    });
    const next = { gpu, posVar, geometry, material };
    active.current = next;
    setResources(next);
    return () => {
      active.current = null;
      gpu.dispose(); geometry.dispose(); material.dispose();
    };
  }, [gl, n, field, uInlet]);
  useFrame((state, delta) => {
    if (!enabled || !field.ready || !active.current) return;
    const { gpu, posVar, material } = active.current;
    posVar.material.uniforms.uDt.value = Math.min(delta, 1 / 30);
    posVar.material.uniforms.uTime.value = state.clock.elapsedTime;
    gpu.compute();
    material.uniforms.uPositions.value = gpu.getCurrentRenderTarget(posVar).texture;
  });
  if (!resources) return null;
  return <points geometry={resources.geometry} material={resources.material} visible={enabled} frustumCulled={false} />;
}
