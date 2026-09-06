import type { Vec3 } from '../types/simulation';

// Maps a slot id to the mesh `name` prop set in GenericCar.tsx (which is set
// to the CarMesh.id from buildGenericCar). Not every slot corresponds to a
// single mesh; rideHeight affects every mesh's vertical placement, so it is
// mapped to the chassis as the most representative single part to outline.
const SLOT_TO_MESH_NAME: Record<string, string> = {
  wingAngle: 'wing',
  diffuser: 'diffuser',
  rideHeight: 'chassis',
};

export function meshNameFor(slotId: string): string | null {
  return SLOT_TO_MESH_NAME[slotId] ?? null;
}

interface FocusPoint {
  position: Vec3;
  target: Vec3;
}

// Hand placed camera positions, not derived from exact part geometry. Good
// enough to point a user at roughly the right area of the car; not meant to
// frame a part with pixel precision.
const CAMERA_FOCUS_POINTS: Record<string, FocusPoint> = {
  wingAngle: { position: [3.5, 2.2, 4], target: [1.3, 1.4, 0] },
  diffuser: { position: [3.5, 1, -4], target: [1.5, 0.3, 0] },
  rideHeight: { position: [4.5, 1.4, 3.2], target: [-0.5, 0.4, 0] },
};

const DEFAULT_FOCUS: FocusPoint = { position: [5, 3, 5], target: [0, 0.5, 0] };

export function focusPointFor(slotId: string): FocusPoint {
  return CAMERA_FOCUS_POINTS[slotId] ?? DEFAULT_FOCUS;
}
