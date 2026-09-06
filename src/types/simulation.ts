export type SolverTier = "high" | "medium" | "fallback";
export type Vec3 = [number, number, number];
export type SlotValues = Record<string, number | boolean>;
export interface GeometryTransform { position: Vec3; rotation: Vec3; }

export interface Slot {
  slotId: string;
  label: string;
  category: "wing" | "diffuser" | "rideHeight" | "flap" | "rudder" | "aileron" | "elevator" | "aoa";
  kind: "toggle" | "range";
  range?: { min: number; max: number; step: number; default: number };
  defaultValue?: number | boolean;
  unit?: string;
  geometryTransform: (value: number | boolean) => GeometryTransform;
}

export interface Vehicle {
  id: string;
  name: string;
  type: "car" | "plane";
  baseModelPath: string;
  refArea: number;
  slots: Slot[];
}

export interface VehicleMesh {
  id: string;
  color: string;
  positions: Float32Array;
  uvs?: Float32Array;
}

export interface VehicleDefinition extends Vehicle {
  bounds: { min: Vec3; max: Vec3 };
  build: (values: SlotValues) => VehicleMesh[];
}

export interface SceneState {
  vehicleId: string;
  windSpeedKph: number;
  slotValues: Record<string, number | boolean>;
  solverTier: SolverTier;
  computed: {
    Cd: number;
    Cl: number;
    wakeSize: number;
    stability: number;
  };
}
