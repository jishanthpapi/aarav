import type { SlotValues, VehicleDefinition, VehicleMesh } from '../../types/simulation';
import { buildGenericCar, CAR_BOUNDS, defaultCarSlots, genericCar } from './genericCar';
import { genericPlane } from './genericPlane';
import assets from './generated/kenney.json';

const labels: Record<keyof typeof assets, string> = {
  sedan: 'City sedan', 'sedan-sports': 'Sport sedan', 'hatchback-sports': 'Sport hatchback',
  suv: 'Utility vehicle', 'suv-luxury': 'Touring utility', van: 'Delivery van', race: 'Track car', 'race-future': 'Concept racer',
};
const assetVehicles: VehicleDefinition[] = Object.entries(assets).map(([name, source]) => {
  const base: VehicleMesh[] = source.parts.map(p => ({ id: p.id, color: '#ffffff',
    positions: new Float32Array(p.positions), uvs: new Float32Array(p.uvs) }));
  return {
    ...genericCar, id: 'kit-' + name, name: labels[name as keyof typeof assets],
    baseModelPath: `assets/kenney-car-kit/Models/GLB format/${name}.glb`,
    slots: genericCar.slots.filter(s => s.slotId !== 'diffuser'),
    bounds: { min: [-2.25, 0, -Math.max(source.width / 2 + 0.02, 1.12)],
      max: [2, Math.max(source.height + 0.36, 2.05), Math.max(source.width / 2 + 0.02, 1.12)] },
    build(values) {
      const h = Number(values.rideHeight ?? 0.25) - 0.25;
      const parts = base.map(part => {
        const positions = part.positions.slice();
        if (part.id === 'chassis') for (let i = 1; i < positions.length; i += 3) positions[i] += h;
        return { ...part, positions };
      });
      const addons = buildGenericCar({ ...defaultCarSlots(), ...values }).filter(p => p.id === 'wing' || p.id.startsWith('wing-support') || p.id === 'front-splitter');
      return [...parts, ...addons];
    },
  };
});

export const VEHICLES: VehicleDefinition[] = [
  { ...genericCar, bounds: CAR_BOUNDS, build: buildGenericCar }, ...assetVehicles, genericPlane,
];

export function vehicleFor(id: string): VehicleDefinition {
  const vehicle = VEHICLES.find(v => v.id === id);
  if (!vehicle) throw new Error('Unknown vehicle: ' + id);
  return vehicle;
}
export function defaultsFor(id: string): SlotValues {
  return Object.fromEntries(vehicleFor(id).slots.map(s => [s.slotId, s.range?.default ?? s.defaultValue ?? false]));
}
export function normaliseVehicleSlot(id: string, slotId: string, value: number | boolean): number | boolean {
  const slot = vehicleFor(id).slots.find(s => s.slotId === slotId);
  if (!slot) throw new Error('Unknown slot: ' + slotId);
  if (slot.kind === 'toggle') {
    if (typeof value !== 'boolean') throw new Error('A toggle requires a boolean.');
    return value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('A slider requires a finite number.');
  const r = slot.range!;
  return Number(Math.min(r.max, Math.max(r.min, r.min + Math.round((value - r.min) / r.step) * r.step)).toFixed(6));
}
export function vehicleTriangleSoup(id: string, values: SlotValues): Float32Array {
  const meshes = vehicleFor(id).build(values);
  const out = new Float32Array(meshes.reduce((sum, m) => sum + m.positions.length, 0));
  let offset = 0;
  for (const mesh of meshes) { out.set(mesh.positions, offset); offset += mesh.positions.length; }
  return out;
}
