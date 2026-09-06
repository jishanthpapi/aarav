import { create } from 'zustand';
import type { SceneState, SolverTier } from '../types/simulation';
import type { AeroReadout } from '../engine/ForceIntegrator';
import { defaultCarSlots } from '../data/vehicles/genericCar';
import { defaultsFor, normaliseVehicleSlot, vehicleFor } from '../data/vehicles/catalog';
import { GRID_QUALITIES, type GridQuality } from '../engine/GridQuality';

interface SimulationStore extends SceneState {
  renderMode: 'procedural' | 'asset';
  setRenderMode: (mode: 'procedural' | 'asset') => void;
  setVehicle: (id: string) => void;
  highlightedSlotId: string | null;
  highlightRevision: number;
  cameraFocusRequest: { slotId: string; nonce: number } | null;
  setHighlightedSlot: (id: string | null) => void;
  requestCameraFocus: (id: string) => void;
  lessonId: string | null;
  lessonStep: number;
  setLesson: (id: string | null, step?: number) => void;
  flowStyle: 'trails' | 'particles' | 'off';
  setFlowStyle: (style: 'trails' | 'particles' | 'off') => void;
  solverPreference: 'auto' | 'webgpu' | 'webgl';
  setSolverPreference: (preference: 'auto' | 'webgpu' | 'webgl') => void;
  telemetry: Record<string, unknown>;
  setTelemetry: (data: Record<string, unknown>) => void;
  gridQuality: GridQuality;
  setGridQuality: (quality: GridQuality) => void;
  readoutValid: boolean;
  readoutReason: string | null;
  setWindSpeed: (speed: number) => void;
  setSlotValue: (slotId: string, value: number | boolean) => void;
  setSolverTier: (tier: SolverTier) => void;
  updateComputed: (data: Partial<SceneState['computed']>) => void;
  applyReadout: (r: AeroReadout) => void;
  invalidateReadout: (reason: string) => void;
  resetConfiguration: () => void;
}

const pending = { readoutValid: false, readoutReason: 'Waiting for the updated flow.' };
export const useSimulationStore = create<SimulationStore>((set) => ({
  renderMode: 'procedural',
  setRenderMode: renderMode => set({ renderMode }),
  vehicleId: 'generic-car',
  setVehicle: vehicleId => {
    vehicleFor(vehicleId);
    set(state => state.vehicleId === vehicleId ? state : { vehicleId, slotValues: defaultsFor(vehicleId),
      highlightedSlotId: null, cameraFocusRequest: null, lessonId: null, telemetry: {}, ...pending });
  },
  highlightedSlotId: null,
  highlightRevision: 0,
  cameraFocusRequest: null,
  setHighlightedSlot: highlightedSlotId => set(state => ({ highlightedSlotId, highlightRevision: state.highlightRevision + 1 })),
  requestCameraFocus: slotId => set(state => ({ cameraFocusRequest: { slotId, nonce: (state.cameraFocusRequest?.nonce ?? 0) + 1 } })),
  lessonId: null,
  lessonStep: 0,
  setLesson: (lessonId, lessonStep = 0) => set({ lessonId, lessonStep }),
  flowStyle: 'trails',
  setFlowStyle: flowStyle => set({ flowStyle }),
  solverPreference: 'auto',
  setSolverPreference: solverPreference => set({ solverPreference, telemetry: {}, ...pending }),
  telemetry: {},
  setTelemetry: telemetry => set(state => ({ telemetry: { ...state.telemetry, ...telemetry } })),
  windSpeedKph: 100,
  slotValues: defaultCarSlots(),
  solverTier: 'fallback',
  gridQuality: 'maximum',
  setGridQuality: gridQuality => {
    if (!Object.hasOwn(GRID_QUALITIES, gridQuality)) return;
    set(state => state.gridQuality === gridQuality ? state : { gridQuality, telemetry: {}, ...pending });
  },
  ...pending,
  computed: { Cd: 0, Cl: 0, wakeSize: 0, stability: 0 },
  setWindSpeed: speed => {
    if (!Number.isFinite(speed)) return;
    const windSpeedKph = Math.min(250, Math.max(10, Math.round(speed)));
    set(state => state.windSpeedKph === windSpeedKph ? state : { windSpeedKph, ...pending });
  },
  setSlotValue: (slotId, value) => {
    set(state => {
      const clean = normaliseVehicleSlot(state.vehicleId, slotId, value);
      return state.slotValues[slotId] === clean ? state : { slotValues: { ...state.slotValues, [slotId]: clean }, ...pending };
    });
  },
  setSolverTier: solverTier => set({ solverTier }),
  updateComputed: data => set(state => ({ computed: { ...state.computed, ...data } })),
  applyReadout: r => set(state => ({
    computed: { ...state.computed, Cd: r.Cd, Cl: r.Cl, wakeSize: r.wakeCells },
    readoutValid: r.valid,
    readoutReason: r.reason ?? null,
  })),
  invalidateReadout: readoutReason => set({ readoutValid: false, readoutReason }),
  resetConfiguration: () => set(state => ({ slotValues: defaultsFor(state.vehicleId), windSpeedKph: 100, ...pending })),
}));
