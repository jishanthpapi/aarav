import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, ShaderMaterial } from 'three';
import type { FieldTexture } from './FieldTexture';
import type { VehicleDefinition } from '../../types/simulation';
import { traceFlowLines } from './traceFlowLines';

export function FlowLines({ field, bounds, uInlet, enabled }: {
  field: FieldTexture; bounds: VehicleDefinition['bounds']; uInlet: number; enabled: boolean;
}) {
  const seen = useRef(-1);
  const geometry = useMemo(() => new BufferGeometry(), [field]);
  const material = useMemo(() => new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float distanceAlong; attribute float flowSpeed;
      varying float vDistance; varying float vSpeed;
      void main() { vDistance=distanceAlong; vSpeed=flowSpeed; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `precision highp float; uniform float uTime; varying float vDistance; varying float vSpeed;
      void main() { float pulse=pow(0.5+0.5*cos(vDistance*8.0-uTime*4.0),8.0);
        vec3 color=mix(vec3(1.0,0.48,0.18),vec3(0.30,0.86,1.0),clamp(vSpeed,0.0,1.0));
        gl_FragColor=vec4(color,0.10+0.82*pulse); }`,
  }), []);
  useEffect(() => { seen.current = -1; return () => geometry.dispose(); }, [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    if (!enabled) return;
    material.uniforms.uTime.value = clock.elapsedTime;
    if (seen.current === field.revision) return;
    seen.current = field.revision;
    const lines = traceFlowLines(field, bounds, uInlet);
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(lines.positions), 3));
    geometry.setAttribute('distanceAlong', new BufferAttribute(new Float32Array(lines.distances), 1));
    geometry.setAttribute('flowSpeed', new BufferAttribute(new Float32Array(lines.speeds), 1));
    geometry.setDrawRange(0, lines.positions.length / 3);
  });
  return <lineSegments geometry={geometry} material={material} frustumCulled={false} visible={enabled && field.ready} />;
}

