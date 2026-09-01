export const ADVECT_FRAGMENT = /* glsl */ `
precision highp float;
precision highp sampler3D;

uniform sampler3D uField;
uniform vec3  uGrid;
uniform float uDt;
uniform float uSpeedScale;
uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 pos = texture2D(texturePosition, uv);

  vec3 vel = texture(uField, pos.xyz).xyz;
  float rho = texture(uField, pos.xyz).w;

  pos.xyz += vel * uSpeedScale * uDt;
  pos.w += uDt;

  bool outside = any(lessThan(pos.xyz, vec3(0.001))) ||
                 any(greaterThan(pos.xyz, vec3(0.999)));
  bool trapped = length(vel) < 1e-6 || rho < 1e-5;
  bool old     = pos.w > 6.0;

  if (outside || trapped || old) {
    float h1 = fract(sin(dot(uv, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
    float h2 = fract(sin(dot(uv, vec2(39.3468, 11.135)) + uTime) * 24634.6345);
    pos = vec4(0.02, 0.05 + h1 * 0.90, 0.05 + h2 * 0.90, 0.0);
  }

  gl_FragColor = pos;
}
`;

export const PARTICLE_VERTEX = /* glsl */ `
precision highp float;
uniform sampler2D uPositions;
uniform sampler3D uField;
uniform float uMaxSpeed;
uniform float uPointSize;
varying float vSpeed;
varying float vAge;

void main() {
  vec4 p = texture2D(uPositions, position.xy);
  vec3 vel = texture(uField, p.xyz).xyz;

  vSpeed = clamp(length(vel) / max(uMaxSpeed, 1e-6), 0.0, 1.0);
  vAge = p.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz - 0.5, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPointSize * (1.0 + vSpeed) * (300.0 / -mv.z);
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
precision highp float;
varying float vSpeed;
varying float vAge;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;

  vec3 slow = vec3(0.97, 0.42, 0.18);
  vec3 fast = vec3(0.35, 0.72, 1.00);
  vec3 col = mix(slow, fast, vSpeed);

  float fade = smoothstep(0.0, 0.4, vAge) * (1.0 - smoothstep(4.5, 6.0, vAge));
  gl_FragColor = vec4(col, (1.0 - r * 4.0) * 0.85 * fade);
}
`;
