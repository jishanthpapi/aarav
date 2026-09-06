import { create } from 'zustand';
import type { SceneState, SolverTier } from '../types/simulation';
import type { AeroReadout } from '../engine/ForceIntegrator';
import { defaultCarSlots, normaliseSlotValue } from '../data/vehicles/genericCar';
import { GRID_QUALITIES, type GridQuality } from '../engine/GridQuality';

interface SimulationStore extends SceneState {
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
  vehicleId: 'generic-car',
  windSpeedKph: 100,
  slotValues: defaultCarSlots(),
  solverTier: 'fallback',
  gridQuality: 'maximum',
  setGridQuality: gridQuality => {
    if (!Object.hasOwn(GRID_QUALITIES, gridQuality)) return;
    set(state => state.gridQuality === gridQuality ? state : { gridQuality, ...pending });
  },
  ...pending,
  computed: { Cd: 0, Cl: 0, wakeSize: 0, stability: 0 },
  setWindSpeed: speed => {
    if (!Number.isFinite(speed)) return;
    const windSpeedKph = Math.min(250, Math.max(10, Math.round(speed)));
    set(state => state.windSpeedKph === windSpeedKph ? state : { windSpeedKph, ...pending });
  },
  setSlotValue: (slotId, value) => {
    const clean = normaliseSlotValue(slotId, value);
    set(state => state.slotValues[slotId] === clean ? state : {
      slotValues: { ...state.slotValues, [slotId]: clean }, ...pending,
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
  resetConfiguration: () => set({ slotValues: defaultCarSlots(), windSpeedKph: 100, ...pending }),
}));
