export const COLLIDE_WITH_WALL_MODEL = /* wgsl */ `
override WALL_MODEL: u32 = 1u;

@group(0) @binding(7) var<storage, read>       wallGeom: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> yPlusOut: array<f32>;

// Patch for the tail of collide(). Composes with Smagorinsky rather than
// replacing it — LES handles the resolved outer flow, the wall model handles
// the one cell the grid cannot resolve.
fn wallAdjustedOmega(
  i: u32, u: vec3<f32>, rho: f32, omegaLES: f32, nuMolecular: f32,
) -> f32 {
  if (WALL_MODEL == 0u) { return omegaLES; }

  let g = wallGeom[i];
  let yDist = g.w;
  if (yDist <= 0.0) { return omegaLES; }

  let n = g.xyz;
  let uTangential = length(u - dot(u, n) * n);

  let w = wallModel(uTangential, yDist, nuMolecular);
  yPlusOut[i] = w.yPlus;

  let blend = smoothstep(1.0, 30.0, w.yPlus);
  let nuLES = (1.0 / omegaLES - 0.5) / 3.0;
  let nuBlended = mix(nuLES, max(w.nuEff, nuLES), blend);

  return 1.0 / max(3.0 * nuBlended + 0.5, 0.5000001);
}
`;
