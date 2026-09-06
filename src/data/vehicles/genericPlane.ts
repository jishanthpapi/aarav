import { Euler, Matrix4, SphereGeometry, Vector3 } from 'three';
import type { Slot, SlotValues, Vec3, VehicleDefinition, VehicleMesh } from '../../types/simulation';
import { boxTriangleSoup } from '../../engine/geometry/boxTriangles';

const radians = (degrees: number) => {
  if (!Number.isFinite(degrees)) throw new Error('Geometry transforms must be finite.');
  return degrees * Math.PI / 180;
};
const range = (slotId: string, label: string, category: Slot['category'], min: number, max: number, initial = 0): Slot => ({
  slotId, label, category, kind: 'range', unit: '°', range: { min, max, step: 1, default: initial },
  geometryTransform: value => ({ position: [0, 0, 0], rotation: category === 'rudder'
    ? [0, radians(Number(value)), 0] : [0, 0, radians(Number(value))] }),
});

function transformed(positions: Float32Array, pivot: Vec3, rotation: Vec3, offset: Vec3 = [0, 0, 0]) {
  const matrix = new Matrix4().makeTranslation(...pivot)
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(...rotation)))
    .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
  const out = positions.slice(), p = new Vector3();
  for (let i = 0; i < out.length; i += 3) {
    p.fromArray(out, i).applyMatrix4(matrix).add(new Vector3(...offset));
    p.toArray(out, i);
  }
  return out;
}

const bodyGeometry = new SphereGeometry(1, 24, 12).toNonIndexed();
const body = new Float32Array(bodyGeometry.getAttribute('position').array);
for (let i = 0; i < body.length; i += 3) { body[i] *= 2.65; body[i + 1] = body[i + 1] * 0.38 + 3; body[i + 2] *= 0.42; }
bodyGeometry.dispose();

export const genericPlane: VehicleDefinition = {
  id: 'generic-plane', name: 'NASA B777 reference aircraft', type: 'plane', baseModelPath: 'assets/B777_LARC_AIR_0626.glb', refArea: 10.4,
  bounds: { min: [-3.5, 1.2, -4.25], max: [3.5, 5, 4.25] },
  slots: [
    range('angleOfAttack', 'Angle of attack', 'aoa', -15, 25, 4),
    range('flaps', 'Flaps', 'flap', 0, 35),
    range('rudder', 'Rudder', 'rudder', -25, 25),
    range('ailerons', 'Ailerons (differential)', 'aileron', -20, 20),
    range('elevator', 'Elevator', 'elevator', -25, 25),
  ],
  build(values: SlotValues): VehicleMesh[] {
    const get = (id: string) => Number(values[id] ?? genericPlane.slots.find(s => s.slotId === id)!.range!.default);
    const rotation = (id: string) => genericPlane.slots.find(s => s.slotId === id)!.geometryTransform(get(id)).rotation;
    const meshes: VehicleMesh[] = [{ id: 'fuselage', color: '#dbe8f5', positions: body }];
    const box = (id: string, center: Vec3, size: Vec3, color: string, pivot?: Vec3, rot?: Vec3) => {
      const p = boxTriangleSoup(center, size);
      meshes.push({ id, color, positions: pivot ? transformed(p, pivot, rot!) : p });
    };
    for (const side of [-1, 1]) {
      box('main-wing-' + side, [-0.3, 3, side * 2], [1.3, 0.12, 4], '#6c91ba');
      box('flap-' + side, [0.575, 3, side * 1.35], [0.45, 0.10, 1.85], '#60d7db',
        [0.35, 3, side * 1.35], [0, 0, -rotation('flaps')[2]]);
      box('aileron-' + side, [0.575, 3, side * 3.15], [0.45, 0.10, 1.7], '#60d7db',
        [0.35, 3, side * 3.15], [0, 0, side * rotation('ailerons')[2]]);
    }
    box('tailplane', [2, 3.12, 0], [0.7, 0.10, 2.65], '#6c91ba');
    box('elevator', [2.525, 3.12, 0], [0.35, 0.09, 2.65], '#60d7db', [2.35, 3.12, 0], rotation('elevator'));
    box('tail-fin', [2, 3.66, 0], [0.7, 1.05, 0.10], '#6c91ba');
    box('rudder', [2.525, 3.66, 0], [0.35, 1.05, 0.09], '#60d7db', [2.35, 3.66, 0], rotation('rudder'));
    // The inlet remains +X. Raising the nose at -X requires negative Z rotation.
    return meshes.map(mesh => ({ ...mesh, positions: transformed(mesh.positions, [0, 3, 0], [0, 0, -rotation('angleOfAttack')[2]]) }));
  },
};
