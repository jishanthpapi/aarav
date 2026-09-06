# Prompt: build the Aarav backend

Paste this into your AI coding agent with the repository checked out. Read `HANDOFF-CURRENT.md`
and `aarav-intelligence-description.md` in full before starting. The second document defines
Aarav's persona, its scene awareness requirement, and its tool surface; treat it as the
specification for what this task is building toward, not background color. Do not touch the
wall model, the WebGL2 fallback, or the airplane module while doing this task.

## Current state, precisely

`AaravChat.tsx` is a disabled placeholder. The input is disabled, the send button is disabled,
and the panel reads "The tutor is not connected yet." There is no server route in this
repository, no dependency on an Anthropic SDK, and no implementation of any tool. This task
starts from zero, not from a partially working chat.

## What this task requires

1. **A server side proxy, never a client side API key.** Add a minimal backend route, a
   Node or edge function is fine given the rest of the stack, that accepts a user message plus
   the current scene state and returns Aarav's response. The Anthropic API key must live only
   in that server's environment, never in client bundled code. If this repository has no
   backend runtime configured yet, set up the smallest one that fits the existing Vite based
   frontend rather than introducing a second framework.

2. **Scene state as context on every turn.** The request to the backend should include the
   current `SceneState` from the Zustand store: vehicle id, every slot value, wind speed, and
   the computed drag and lift coefficients along with their validity flag. The system prompt
   sent to Claude must instruct it to ground explanations in this state rather than generic
   aerodynamics knowledge, matching the persona described in `aarav-intelligence-description.md`.

3. **Tool calling for the five planned tools.** Implement `set_part`, `focus_camera`,
   `highlight`, `get_scene_state`, and `start_lesson` as real tool definitions passed to the
   Anthropic API, with real handlers on the client side that a tool call result maps to:
   `set_part` calls the same `setSlotValue` action the sliders already use, `focus_camera` and
   `highlight` animate the R3F camera and outline a mesh, `get_scene_state` returns the current
   store snapshot, and `start_lesson` advances a lesson script (a minimal one topic script is
   sufficient for this task, a full lesson library is out of scope here).

4. **Enable the chat UI without discarding its honesty.** Remove the `disabled` attributes and
   wire real `onChange` and `onSubmit` handlers to `AaravChat.tsx`. If the backend is
   unreachable or the API key is not configured, the panel must say so plainly, the same way it
   currently says the tutor is not connected, rather than failing silently or showing a generic
   error.

5. **Never let Aarav overstate the simulation's accuracy.** The system prompt must explicitly
   instruct the model to describe the solver as a coarse, real time approximation when asked
   about accuracy, consistent with the accuracy panel's own disclosures, and never to quote a
   drag or lift number without noting whether the readout is currently marked valid or still
   converging.

## Explicit constraints

- Do not fabricate or hardcode example Aarav responses anywhere in the shipped code. Every
  response the user sees must come from an actual API call.
- Do not use a real vehicle brand or model name in the system prompt, examples, or any
  fallback text.
- Do not implement a sixth tool or expand scope into the lesson content itself; a single
  minimal lesson script exists only to prove `start_lesson` wires end to end.

## Verification

Run `npm run typecheck` and `npm run build` and report the actual results. Since this task
depends on network access to the Anthropic API and a configured key, also report explicitly
which parts you were able to test end to end (for example, tool call handlers firing against a
mocked scene state) versus which parts require a real API key and a browser to confirm (for
example, an actual model response arriving in the chat panel). Do not report this task as fully
verified unless it was actually exercised against a real API call at least once.
