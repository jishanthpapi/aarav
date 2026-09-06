import { useSimulationStore } from '../store/useSimulationStore';
import { vehicleFor } from '../data/vehicles/catalog';
import type { SceneSnapshot } from '../types/aarav';

export function snapshotSceneState(): SceneSnapshot {
  const s = useSimulationStore.getState();
  return { vehicleId: s.vehicleId, windSpeedKph: s.windSpeedKph, slotValues: { ...s.slotValues },
    computed: { ...s.computed }, readoutValid: s.readoutValid, readoutReason: s.readoutReason,
    telemetry: { ...s.telemetry }, availableSlots: vehicleFor(s.vehicleId).slots.map(({slotId,label,kind,range}) => ({slotId,label,kind,range})) };
}
export const LESSON_STEPS = [
  { height: 0.5, text: 'Start with a high ride height. Wait for the flow to develop and record drag and lift with their uncertainty.' },
  { height: 0.25, text: 'Compare a medium ride height at the same wind speed. Look at the underbody flow; do not assume downforce must increase.' },
  { height: 0.1, text: 'Compare the lowest ride height. Check grid spacing: a gap smaller than a few cells is not resolved reliably.' },
  { height: 0.1, text: 'Compare your observations and uncertainty. Statistical settling does not establish aerodynamic accuracy.' },
];
export function advanceGroundEffect(step: number) {
  const s = useSimulationStore.getState();
  if (vehicleFor(s.vehicleId).type !== 'car') return { error: 'Select a car for the ground-effect lesson.' };
  if (!Number.isInteger(step) || !LESSON_STEPS[step]) return { error: 'Unknown lesson step.' };
  s.setSlotValue('rideHeight', LESSON_STEPS[step].height);
  s.requestCameraFocus('rideHeight'); s.setHighlightedSlot('rideHeight'); s.setLesson('ground-effect', step);
  return { ok: true, step, ...LESSON_STEPS[step] };
}
export function runAaravTool(name: string, input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Tool input must be an object.' };
  const args = input as Record<string, unknown>, s = useSimulationStore.getState();
  const fields: Record<string, string[]> = { set_part: ['slotId','value'], focus_camera: ['slotId'], highlight: ['slotId'], get_scene_state: [], start_lesson: ['lessonId'] };
  if (!Object.hasOwn(fields, name)) return { error: 'Unknown tool.' };
  if (Object.getPrototypeOf(input) !== Object.prototype || Object.keys(args).some(key => !fields[name].includes(key)) ||
      fields[name].some(key => !Object.hasOwn(args,key)) || Object.values(args).some(value =>
        typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))))
    return { error: 'Unexpected tool arguments.' };
  if (name === 'get_scene_state') return snapshotSceneState();
  if (name === 'start_lesson') return args.lessonId === 'ground-effect' ? advanceGroundEffect(0) : { error: 'Unknown lesson.' };
  if (!['set_part','focus_camera','highlight'].includes(name)) return { error: 'Unknown tool.' };
  const slot = vehicleFor(s.vehicleId).slots.find(v => v.slotId === args.slotId);
  if (!slot) return { error: 'Unknown slot for the current vehicle.' };
  if (name === 'set_part' && slot.range && (typeof args.value !== 'number' || args.value < slot.range.min || args.value > slot.range.max))
    return { error: 'Value is outside the slot range.' };
  try {
    if (name === 'set_part') s.setSlotValue(slot.slotId, args.value as number | boolean);
    if (name === 'focus_camera') s.requestCameraFocus(slot.slotId);
    if (name === 'highlight') s.setHighlightedSlot(slot.slotId);
    return { ok: true, slotId: slot.slotId, value: useSimulationStore.getState().slotValues[slot.slotId], readoutValid: useSimulationStore.getState().readoutValid };
  } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
}
