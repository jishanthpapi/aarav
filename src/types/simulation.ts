export type SolverTier = "high" | "medium" | "fallback";

export interface Slot {
  slotId: string;
  label: string;
  category: "wing" | "diffuser" | "rideHeight" | "flap" | "rudder" | "aileron" | "elevator" | "aoa";
  kind: "toggle" | "range";
  range?: { min: number; max: number; step: number; default: number };
  geometryTransform: (value: number | boolean) => any;
}

export interface Vehicle {
  id: string;
  name: string;
  type: "car" | "plane";
  baseModelPath: string;
  refArea: number;
  slots: Slot[];
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
