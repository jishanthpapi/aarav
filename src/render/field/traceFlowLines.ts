import type { Vec3, VehicleDefinition } from '../../types/simulation';
import type { FieldTexture } from './FieldTexture';

export function traceFlowLines(field: FieldTexture, bounds: VehicleDefinition['bounds'], uInlet: number) {
  const positions: number[] = [], distances: number[] = [], speeds: number[] = [];
  if (!field.ready) return { positions, distances, speeds };
  const length = bounds.max[0] - bounds.min[0];
  const h = bounds.max[1] - bounds.min[1], w = bounds.max[2] - bounds.min[2];
  const ds = field.grid.dx * 0.38;
  for (let iy = 0; iy < 8; iy++) for (let iz = 0; iz < 15; iz++) {
    let p: Vec3 = [bounds.min[0] - length * 0.5, bounds.min[1] + h * (0.08 + iy / 7 * 1.12),
      bounds.min[2] - w * 0.25 + w * 1.5 * iz / 14];
    let distance = 0;
    for (let step = 0; step < 500; step++) {
      const velocity = field.sample(...p);
      if (!velocity) break;
      const speed = Math.hypot(...velocity);
      if (speed < uInlet * 0.015) break;
      const mid = p.map((v, a) => v + velocity[a] / speed * ds / 2) as Vec3;
      const vMid = field.sample(...mid);
      if (!vMid) break;
      const m = Math.hypot(...vMid);
      if (m < 1e-8) break;
      const next = p.map((v, a) => v + vMid[a] / m * ds) as Vec3;
      if (!field.sample(...next) || next[0] > bounds.max[0] + length * 1.5) break;
      positions.push(...p, ...next);
      distances.push(distance, distance + ds);
      speeds.push(speed / uInlet, m / uInlet);
      distance += ds;
      p = next;
    }
  }
  return { positions, distances, speeds };
}
