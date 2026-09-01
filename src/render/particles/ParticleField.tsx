import { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Points,
  ShaderMaterial, DataTexture, RGBAFormat, FloatType,
} from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { ADVECT_FRAGMENT, PARTICLE_VERTEX, PARTICLE_FRAGMENT } from './advect.glsl';
import type { FieldTexture } from '../field/FieldTexture';

interface Props {
  field: FieldTexture;
  n?: number;
  uInlet: number;
}

export function ParticleField({ field, n = 128, uInlet }: Props) {
  const { gl } = useThree();
  const matRef = useRef<ShaderMaterial>(null);

  const { gpu, posVar, geometry, material } = useMemo(() => {
    const gpu = new GPUComputationRenderer(n, n, gl);

    const seed = gpu.createTexture();
    const d = seed.image.data as unknown as Float32Array;
    for (let i = 0; i < n * n; i++) {
      d[i * 4 + 0] = Math.random() * 0.6;
      d[i * 4 + 1] = 0.05 + Math.random() * 0.9;
      d[i * 4 + 2] = 0.05 + Math.random() * 0.9;
      d[i * 4 + 3] = Math.random() * 6.0;
    }

    const posVar = gpu.addVariable('texturePosition', ADVECT_FRAGMENT, seed);
    gpu.setVariableDependencies(posVar, [posVar]);
    Object.assign(posVar.material.uniforms, {
      uField: { value: field.texture },
      uGrid: { value: [1, 1, 1] },
      uDt: { value: 0 },
      uSpeedScale: { value: 0 },
      uTime: { value: 0 },
    });

    const err = gpu.init();
    if (err) console.error('[ParticleField] GPUComputationRenderer:', err);

    const geometry = new BufferGeometry();
    const refs = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) {
      refs[i * 3 + 0] = (i % n) / n;
      refs[i * 3 + 1] = Math.floor(i / n) / n;
    }
    geometry.setAttribute('position', new BufferAttribute(refs, 3));

    const material = new ShaderMaterial({
      uniforms: {
        uPositions: { value: null },
        uField: { value: field.texture },
        uMaxSpeed: { value: uInlet },
        uPointSize: { value: 1.6 },
      },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      glslVersion: '300 es' as never,
    });

    return { gpu, posVar, geometry, material };
  }, [gl, n, field, uInlet]);

  useEffect(() => () => { gpu.dispose(); geometry.dispose(); material.dispose(); },
    [gpu, geometry, material]);

  useFrame((state, delta) => {
    const u = posVar.material.uniforms;
    u.uDt.value = Math.min(delta, 1 / 30) * 60;
    u.uSpeedScale.value = 0.02 / Math.max(uInlet, 1e-6);
    u.uTime.value = state.clock.elapsedTime;

    gpu.compute();
    material.uniforms.uPositions.value = gpu.getCurrentRenderTarget(posVar).texture;
    material.uniforms.uMaxSpeed.value = uInlet;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
