import type { GeometryTransform, SlotValues, Vehicle, Vec3 } from '../../types/simulation';
import { boxTriangleSoup } from '../../engine/geometry/boxTriangles';

const transform = (position: Vec3 = [0, 0, 0], rotation: Vec3 = [0, 0, 0]): GeometryTransform => {
  if (![...position,...rotation].every(Number.isFinite)) throw new Error('Geometry transforms must be finite.');
  return { position, rotation };
};

export const genericCar: Vehicle = {
  id: 'generic-car',
  name: 'Generic aero car',
  type: 'car',
  baseModelPath: '', // Procedural geometry is shared by rendering and voxelization.
  refArea: 1.8 * 1.2, // Metadata only: the solver measures projected voxel area.
  slots: [
    {
      slotId: 'wingAngle', label: 'Rear wing angle', category: 'wing', kind: 'range',
      range: { min: 0, max: 24, step: 2, default: 8 }, unit: '°',
      geometryTransform: value => transform([1.3, 1.2, 0], [0, 0, Number(value) * Math.PI / 180]),
    },
    {
      slotId: 'diffuser', label: 'Rear diffuser', category: 'diffuser', kind: 'toggle',
      defaultValue: true,
      geometryTransform: value => transform([0, 0, 0], [0, 0, value ? 14 * Math.PI / 180 : 0]),
    },
    {
      slotId: 'frontSplitter', label: 'Front splitter', category: 'diffuser', kind: 'toggle',
      defaultValue: false,
      geometryTransform: value => transform(value ? [-2.125, 0, 0] : [-2, 0, 0]),
    },
    {
      slotId: 'rideHeight', label: 'Ride height', category: 'rideHeight', kind: 'range',
      range: { min: 0.1, max: 0.6, step: 0.025, default: 0.25 }, unit: 'm',
      geometryTransform: value => transform([0, Number(value), 0]),
    },
  ],
};

// Envelope of every allowed configuration. X is the flow axis throughout.
// Keep this fixed while editing so buffers and grid coordinates remain stable.
export const CAR_BOUNDS = { min: [-2.25, 0, -1.12] as Vec3, max: [2, 2.05, 1.12] as Vec3 };
export const CAR_LENGTH = CAR_BOUNDS.max[0] - CAR_BOUNDS.min[0];

export function defaultCarSlots(): SlotValues {
  return Object.fromEntries(genericCar.slots.map(s => [s.slotId, s.range?.default ?? s.defaultValue ?? false]));
}

export function normaliseSlotValue(slotId: string, value: number | boolean): number | boolean {
  const slot = genericCar.slots.find(s => s.slotId === slotId);
  if (!slot) throw new Error('Unknown car slot: ' + slotId);
  if (slot.kind === 'toggle') {
    if (typeof value !== 'boolean') throw new Error('A toggle requires a boolean.');
    return value;
  }
  const r = slot.range!;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('A slider requires a finite number.');
  return Number(Math.min(r.max, Math.max(r.min, r.min + Math.round((value - r.min) / r.step) * r.step)).toFixed(6));
}

export interface CarMesh {
  id: string;
  color: string;
  positions: Float32Array;
}

function rotateAndMove(positions: Float32Array, t: GeometryTransform): Float32Array {
  const out = positions.slice();
  const angle = t.rotation[2];
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i], y = out[i + 1];
    out[i] = c * x - s * y + t.position[0];
    out[i + 1] = s * x + c * y + t.position[1];
    out[i + 2] += t.position[2];
  }
  return out;
}

function prism(x0: number, x1: number, y0: number, y1: number, roof: number, width: number) {
  const z = width / 2;
  const v = [[x0,y0,-z],[x1,y1,-z],[x0,roof,-z],[x1,roof,-z],
    [x0,y0,z],[x1,y1,z],[x0,roof,z],[x1,roof,z]];
  const faces = [0,1,3,0,3,2, 4,7,5,4,6,7, 0,2,6,0,6,4,
    1,7,3,1,5,7, 0,4,5,0,5,1, 2,3,7,2,7,6];
  const out: number[] = [];
  for (let i = 0; i < faces.length; i += 3) {
    out.push(...v[faces[i]], ...v[faces[i + 2]], ...v[faces[i + 1]]);
  }
  return new Float32Array(out);
}

function wheel(center: Vec3): Float32Array {
  const triangles: number[] = [];
  const radius = 0.31, halfWidth = 0.11, segments = 16;
  for (let i = 0; i < segments; i++) {
    const a = 2 * Math.PI * i / segments, b = 2 * Math.PI * (i + 1) / segments;
    const p = (angle: number, z: number) =>
      [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle), center[2] + z];
    const p0 = p(a, -halfWidth), p1 = p(b, -halfWidth), p2 = p(a, halfWidth), p3 = p(b, halfWidth);
    triangles.push(...p0, ...p1, ...p3, ...p0, ...p3, ...p2,
      ...[center[0],center[1],center[2]-halfWidth], ...p1, ...p0,
      ...[center[0],center[1],center[2]+halfWidth], ...p2, ...p3);
  }
  return new Float32Array(triangles);
}

export function buildGenericCar(values: SlotValues): CarMesh[] {
  const slots = defaultCarSlots();
  for (const slot of genericCar.slots) {
    if (values[slot.slotId] !== undefined) slots[slot.slotId] = normaliseSlotValue(slot.slotId, values[slot.slotId]);
  }
  const transforms = Object.fromEntries(genericCar.slots.map(s => [s.slotId, s.geometryTransform(slots[s.slotId])]));
  const h = transforms.rideHeight.position[1];
  const wing = transforms.wingAngle;
  const meshes: CarMesh[] = [
    { id: 'chassis', color: '#3b82f6', positions: boxTriangleSoup([-0.5, h + 0.275, 0], [3, 0.55, 1.8]) },
    // The switch reshapes the underside of the rear body, rather than placing
    // an invisible diffuser inside an unchanged solid box.
    { id: 'diffuser', color: '#2863bf', positions: prism(1, 2, h,
      h + Math.tan(transforms.diffuser.rotation[2]), h + 0.55, 1.8) },
    { id: 'cabin', color: '#16314d', positions: boxTriangleSoup([-0.15, h + 0.78, 0], [1.6, 0.46, 1.45]) },
    { id: 'wing', color: '#d4e4ff', positions: rotateAndMove(boxTriangleSoup([0, 0, 0], [0.9, 0.1, 2.15]),
      { ...wing, position: [wing.position[0], wing.position[1] + h, wing.position[2]] }) },
  ];
  if (slots.frontSplitter) {
    const splitter = transforms.frontSplitter;
    meshes.push({
      id: 'front-splitter',
      color: '#162033',
      positions: boxTriangleSoup(
        [splitter.position[0], h + 0.035, splitter.position[2]],
        [0.25, 0.07, 2.1],
      ),
    });
  }
  for (const z of [-0.65, 0.65]) {
    meshes.push({ id: 'wing-support-' + z, color: '#50637a',
      positions: boxTriangleSoup([1.3, h + 0.875, z], [0.1, 0.65, 0.1]) });
  }
  for (const x of [-1.3, 1.25]) for (const z of [-1.0, 1.0]) {
    meshes.push({ id: 'wheel-' + x + '-' + z, color: '#19212c', positions: wheel([x, 0.32, z]) });
  }
  return meshes;
}

export function carTriangleSoup(values: SlotValues): Float32Array {
  const meshes = buildGenericCar(values);
  const out = new Float32Array(meshes.reduce((sum, m) => sum + m.positions.length, 0));
  let offset = 0;
  for (const mesh of meshes) { out.set(mesh.positions, offset); offset += mesh.positions.length; }
  return out;
}
