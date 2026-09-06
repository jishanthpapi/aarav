import { useSimulationStore } from '../store/useSimulationStore';
import { genericCar } from '../data/vehicles/genericCar';
import type { SceneSnapshot } from '../types/aarav';

export function snapshotSceneState(): SceneSnapshot {
  const state = useSimulationStore.getState();
  return {
    vehicleId: state.vehicleId,
    windSpeedKph: state.windSpeedKph,
    slotValues: state.slotValues,
    computed: state.computed,
    readoutValid: state.readoutValid,
    readoutReason: state.readoutReason,
  };
}

// A single, minimal script, enough to prove start_lesson wires end to end.
// A real lesson library is out of scope here; see prompt-ai-backend.md.
const GROUND_EFFECT_LESSON = {
  title: 'Ground effect and ride height',
  steps: [
    'Lower the ride height a little and watch the drag and lift readouts.',
    'Downforce should increase as the floor gets closer to the road, up to a point.',
    'Go too low and the effect can reverse. Try to find where that happens.',
  ],
};

/**
 * Executes one tool call and returns whatever should be sent back to Claude
 * as the tool_result content. Reads and writes the real store, the same
 * actions the sliders already use, there is no parallel code path here.
 */
export function runAaravTool(name: string, input: unknown): unknown {
  const store = useSimulationStore.getState();
  const args = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case 'set_part': {
      const slotId = String(args.slotId ?? '');
      const slot = genericCar.slots.find(s => s.slotId === slotId);
      if (!slot) return { error: `Unknown slot id: ${slotId}` };
      try {
        store.setSlotValue(slotId, args.value as number | boolean);
        return { ok: true };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    case 'focus_camera': {
      const slotId = String(args.slotId ?? '');
      store.requestCameraFocus(slotId);
      return { ok: true };
    }
    case 'highlight': {
      const slotId = String(args.slotId ?? '');
      store.setHighlightedSlot(slotId);
      return { ok: true };
    }
    case 'get_scene_state':
      return snapshotSceneState();
    case 'start_lesson': {
      const lessonId = String(args.lessonId ?? '');
      if (lessonId !== 'ground-effect') return { error: `No lesson script exists for: ${lessonId}` };
      return GROUND_EFFECT_LESSON;
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
