import { create } from 'zustand';
import { SceneState, SolverTier } from '../types/simulation';
import type { AeroReadout } from '../engine/ForceIntegrator';

interface SimulationStore extends SceneState {
  readoutValid: boolean;
  readoutReason: string | null;
  setWindSpeed: (speed: number) => void;
  setSlotValue: (slotId: string, value: number | boolean) => void;
  setSolverTier: (tier: SolverTier) => void;
  updateComputed: (data: Partial<SceneState['computed']>) => void;
  applyReadout: (r: AeroReadout) => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  vehicleId: 'generic-car',
  windSpeedKph: 100,
  slotValues: {},
  solverTier: 'fallback',
  readoutValid: true,
  readoutReason: null,
  computed: {
    Cd: 0,
    Cl: 0,
    wakeSize: 0,
    stability: 1,
  },

  setWindSpeed: (windSpeedKph) => set({ windSpeedKph }),
  setSlotValue: (slotId, value) =>
    set((state) => ({
      slotValues: { ...state.slotValues, [slotId]: value }
    })),
  setSolverTier: (solverTier) => set({ solverTier }),
  updateComputed: (data) =>
    set((state) => ({
      computed: { ...state.computed, ...data }
    })),
  // Merged in from useSimulationStore.forces.ts (Chunk 3) — that file was a
  // diff note in the source transcript, not a standalone module; this is the
  // actual merge, done during packaging, not part of the original transcript.
  applyReadout: (r) => set((state) => ({
    computed: { ...state.computed, Cd: r.Cd, Cl: r.Cl, wakeSize: r.wakeCells },
    readoutValid: r.valid,
    readoutReason: r.reason ?? null,
  })),
}));
