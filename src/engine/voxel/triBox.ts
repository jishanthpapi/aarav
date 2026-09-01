// Akenine-Möller triangle/AABB overlap. boxHalf is the half-extent of a unit cell.
const AXES: [number, number][] = [[1, 2], [0, 2], [0, 1]];

function axisTest(
  a: number, b: number, fa: number, fb: number,
  v0: number[], v2: number[], i: number, j: number, half: number[],
): boolean {
  const p0 = a * v0[i] - b * v0[j];
  const p2 = a * v2[i] - b * v2[j];
  const min = Math.min(p0, p2);
  const max = Math.max(p0, p2);
  const rad = fa * half[i] + fb * half[j];
  return !(min > rad || max < -rad);
}

export function triBoxOverlap(
  center: number[], half: number[],
  a: number[], b: number[], c: number[],
): boolean {
  const v0 = [a[0] - center[0], a[1] - center[1], a[2] - center[2]];
  const v1 = [b[0] - center[0], b[1] - center[1], b[2] - center[2]];
  const v2 = [c[0] - center[0], c[1] - center[1], c[2] - center[2]];

  const e0 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
  const e2 = [v0[0] - v2[0], v0[1] - v2[1], v0[2] - v2[2]];

  // 9 edge cross-product axes
  for (const [e, p, q] of [[e0, v0, v2], [e1, v0, v1], [e2, v0, v1]] as const) {
    const f = [Math.abs(e[0]), Math.abs(e[1]), Math.abs(e[2])];
    for (const [i, j] of AXES) {
      if (!axisTest(e[j], e[i], f[j], f[i], p, q, i, j, half)) return false;
    }
  }

  // 3 AABB face axes
  for (let i = 0; i < 3; i++) {
    const min = Math.min(v0[i], v1[i], v2[i]);
    const max = Math.max(v0[i], v1[i], v2[i]);
    if (min > half[i] || max < -half[i]) return false;
  }

  // triangle plane axis
  const n = [
    e0[1] * e1[2] - e0[2] * e1[1],
    e0[2] * e1[0] - e0[0] * e1[2],
    e0[0] * e1[1] - e0[1] * e1[0],
  ];
  const d = -(n[0] * v0[0] + n[1] * v0[1] + n[2] * v0[2]);
  const r = half[0] * Math.abs(n[0]) + half[1] * Math.abs(n[1]) + half[2] * Math.abs(n[2]);
  return Math.abs(d) <= r;
}
