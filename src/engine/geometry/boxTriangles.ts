/**
 * Triangle soup for an axis-aligned box, matching Voxelizer's expected input
 * format ([x,y,z, x,y,z, x,y,z] per triangle, world-space).
 *
 * Not present anywhere in the source transcript — the voxelizer and
 * VehiclePlaceholder (a plain Three.js <boxGeometry>) were never connected.
 * This exists to bridge them.
 */
export function boxTriangleSoup(
  center: [number, number, number],
  size: [number, number, number],
): Float32Array {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;

  const c = (dx: number, dy: number, dz: number): [number, number, number] =>
    [cx + dx * hx, cy + dy * hy, cz + dz * hz];

  const p = {
    nnn: c(-1, -1, -1), pnn: c(1, -1, -1), npn: c(-1, 1, -1), ppn: c(1, 1, -1),
    nnp: c(-1, -1, 1),  pnp: c(1, -1, 1),  npp: c(-1, 1, 1),  ppp: c(1, 1, 1),
  };

  const faces: [number, number, number][][] = [
    [p.nnn, p.pnn, p.ppn], [p.nnn, p.ppn, p.npn],
    [p.nnp, p.ppp, p.pnp], [p.nnp, p.npp, p.ppp],
    [p.nnn, p.npn, p.npp], [p.nnn, p.npp, p.nnp],
    [p.pnn, p.ppp, p.ppn], [p.pnn, p.pnp, p.ppp],
    [p.nnn, p.pnp, p.pnn], [p.nnn, p.nnp, p.pnp],
    [p.npn, p.ppn, p.ppp], [p.npn, p.ppp, p.npp],
  ];

  const out = new Float32Array(faces.length * 9);
  let k = 0;
  for (const tri of faces) {
    for (const v of tri) {
      out[k++] = v[0]; out[k++] = v[1]; out[k++] = v[2];
    }
  }
  return out;
}
