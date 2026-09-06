import { useSimulationStore } from '../../store/useSimulationStore';
import { advanceGroundEffect, LESSON_STEPS } from '../../engine/aaravToolHandlers';
export function LessonPanel() {
  const id = useSimulationStore(s => s.lessonId), step = useSimulationStore(s => s.lessonStep);
  if (!id) return null;
  return <aside className="absolute top-4 left-4 w-64 rounded-lg bg-black/90 p-4 text-xs text-white z-20">
    <strong>Ground effect · {step + 1}/{LESSON_STEPS.length}</strong>
    <p className="my-3">{LESSON_STEPS[step].text}</p>
    {step < LESSON_STEPS.length - 1 && <button className="mr-4 text-blue-300" onClick={() => advanceGroundEffect(step + 1)}>Next experiment</button>}
    <button onClick={() => useSimulationStore.getState().setLesson(null)}>Close lesson</button>
  </aside>;
}
