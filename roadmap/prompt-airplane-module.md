# Prompt: build the airplane module

Paste this into your AI coding agent with the repository checked out. Read `HANDOFF-CURRENT.md`
in full before starting. Do not touch the wall model, the Aarav backend, or the WebGL2 fallback
while doing this task, beyond depending on whichever solver interface they already expose at
the time this task is done.

## Current state, precisely

`types/simulation.ts` already types the relevant slot categories: `flap`, `rudder`, `aileron`,
`elevator`, and `aoa`. Nothing implements them. `src/data/vehicles/genericCar.ts` is the only
existing `Vehicle` definition. There is no aircraft geometry, no aircraft specific voxelization
call, and the NASA aircraft model referenced in `assets/` is unused. This task is closer to
"build a second vehicle from scratch, following an established pattern" than to modifying
anything that currently runs.

## What this task requires

1. **A second `Vehicle` definition, following `genericCar.ts`'s structure exactly.** Create
   `src/data/vehicles/genericPlane.ts` with a generic, non branded light aircraft silhouette
   (do not model a specific real aircraft, generic geometry only, consistent with the project's
   existing avoidance of real vehicle brands). Build it the same way `genericCar.ts` builds the
   car: a base mesh plus a set of `Slot` objects, each with a `geometryTransform`, each
   contributing its own triangles to the combined triangle soup consumed by voxelization.

2. **Flaps.** A `range` slot from retracted to fully extended, moving a trailing edge surface
   and, if reasonably feasible given the existing coefficient calculation, contributing to lift
   and drag in the direction flaps actually behave: more lift, more drag, at any given angle of
   attack.

3. **Rudder.** A `range` slot for yaw deflection angle, moving a vertical tail surface.

4. **Ailerons.** A pair of `range` slots, or one slot representing differential deflection,
   moving trailing edge surfaces on each wing in opposite directions.

5. **Elevator.** A `range` slot for pitch deflection, moving a horizontal tail surface.

6. **Angle of attack.** This is the single most important control for teaching lift and stall,
   more so than any individual control surface. Implement it as a whole aircraft pitch relative
   to the oncoming flow, not a part of the mesh moving, since it is a change in how the geometry
   sits relative to the inlet direction, not a change to the geometry itself. Confirm this
   composes correctly with the fixed inlet direction assumption already established for the car
   (flow along positive X): rotating the aircraft's geometry relative to that fixed inlet is the
   correct way to represent a changing angle of attack, rotating the inlet itself is not,
   because the domain and grid are already built around a fixed flow direction.

7. **A second entry point in the UI.** Add a way to switch the active vehicle between the
   generic car and the generic plane, reusing the existing part slider component pattern rather
   than building a parallel one specific to the aircraft.

## Explicit constraints

- No real aircraft manufacturer or model name anywhere in code, UI text, or comments.
- Do not invent new aerodynamic coefficients or lookup tables for lift and drag. Whatever force
  integration method the car currently uses (measured momentum exchange against the voxelized
  geometry, not an authored coefficient) is the same method the airplane module must use.
  A hardcoded lift curve for the airplane would directly violate the project's standing rule
  against authored aerodynamic coefficients.
- Stall behavior, if it emerges, must emerge from the solver's own separation, not from a
  scripted angle threshold that flips numbers.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`, and report the actual results. Add at
least one new automated test, following the existing style in `tests/`, that confirms switching
the active vehicle correctly changes the triangle soup fed to voxelization and does not silently
mix car and plane geometry together. Report whether angle of attack changes were exercised
against a running solver or only checked for type correctness, and say so plainly either way.
