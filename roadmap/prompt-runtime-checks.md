# Prompt: finish runtime checks, aircraft controls, fallback stability, solver switching

Paste this into your AI coding agent with the repository checked out. Read `HANDOFF-CURRENT.md`
and `prompt-airplane-module.md` and `prompt-fallback.md` first. This task requires actually
running the solver, either through Dawn or a real browser, the same constraint as the wall
model validation task; static analysis cannot substitute for any of the three checks below.

## Aircraft controls against the actually running solver

`src/data/vehicles/genericPlane.ts` defines flap, rudder, aileron, elevator, and angle of
attack slots. Confirm each one does what it should when actually driving the live LBM solver,
not just that its `geometryTransform` type-checks:

- **Flaps**, sweep from retracted to fully extended and confirm both lift and drag rise with
  deflection at a fixed angle of attack. A flap that raises lift without raising drag, or does
  neither, is not behaving like a flap.
- **Rudder**, confirm a nonzero side force appears when deflected and that the voxelized
  geometry actually changes shape, not just the yaw angle recorded in scene state.
- **Ailerons**, confirm opposite deflection on each wing produces opposite-signed forces on
  each side, not merely that the two slots are independently adjustable.
- **Elevator**, confirm it changes pitching moment in the expected direction. Computing an
  actual moment may require extending `ForceIntegrator` if it does not already report one;
  if so, scope that addition narrowly to what this check needs, not a general moment API.
- **Angle of attack**, confirm the lift curve is linear at low angles, matches the expected
  sign and rough slope, and stalls, lift drops, at some angle rather than continuing to climb
  indefinitely. `prompt-airplane-module.md` already flagged that this must rotate the aircraft
  geometry relative to the fixed inlet direction, not rotate the inlet, confirm that is actually
  how it is implemented before trusting any sweep result from it.

Write these as real tests in `tests/`, following the existing style, not as a one-off manual
check whose result only exists in a report.

## Fallback (WebGL2, StableFluidsSolver) stability

- Run `StableFluidsSolver` for an extended number of steps, at least several thousand, and
  confirm no NaN or Infinity appears in its velocity field at any point, not just at the end.
- Confirm it degrades gracefully rather than diverging under the same domain-planning inputs
  the WebGPU tier uses, including whatever coarse-grid and wind-speed-range conditions were
  already identified as stressing the WebGPU solver's stability limits.
- Confirm the accuracy panel correctly discloses the fallback's lack of wall treatment when
  this solver is active, per `prompt-fallback.md`, this is a UI-and-data-plumbing check as much
  as a numerical one, both need to be exercised together, not separately.

## Solver-tier switching

`useAaravSimulation.ts` now imports both `LBMSolver` and `StableFluidsSolver`. Confirm the
switching logic between them actually works end to end, not just that both classes exist:

- Force a fallback-tier selection (simulate the absence of WebGPU, or whatever mechanism
  `SolverManager`/`GridQuality` uses to decide) and confirm the app actually constructs and
  runs `StableFluidsSolver` rather than failing silently or still attempting the WebGPU path.
- Confirm switching tiers, if this can happen mid-session rather than only at startup, tears
  down the previous solver's GPU resources cleanly. A tier switch that leaks the old solver's
  buffers is a real memory bug that will not show up in a short test run.
- Confirm the readout panel, particle field, and accuracy panel all correctly reflect which
  tier is actually active after a switch, not whichever tier was active when the component
  last rendered.

## Constraints

- Do not adjust any aerodynamic constant, coefficient, or threshold to make a control produce
  the expected sign or trend. If a control produces the wrong trend, for example a flap that
  lowers lift, that is a real defect in the geometry transform or the force integration, fix
  the mechanism, not the test's expectation of it.
- Do not report a check as passing based on a single run. Aerodynamic forces on a coarse
  real-time solver are noisy; use the same convergence discipline (`ConvergenceMonitor`) already
  established elsewhere in this codebase rather than trusting one instantaneous sample.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`, and report their actual output.
For each of the three sections above, report specifically which checks were run against a real
solver execution and which, if any, could only be verified structurally due to environment
limits, do not blur that distinction in the summary.
