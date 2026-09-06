# Prompt: complete wall-model physical validation

Paste this into your AI coding agent with the repository checked out. Read `HANDOFF-CURRENT.md`,
`prompt-wall-model.md`, and `wall-model-baseline.json` first. The baseline file currently marks
all five gates as "not measured," each with a specific reason (no developed channel profile
benchmark, no flat-plate Reynolds sweep, no y+ buffer, no paired on/off force benchmark, no
converged angle sweep). This task is to actually produce those five measurements, not to change
the code that checks them.

This requires real WebGPU execution against the running solver, either through Dawn (as
`shaders.test.mjs` already does for pipeline validation) or an actual browser. Static analysis
and type checking cannot produce a benchmark result. If neither is available in your
environment, stop and say so rather than filling `wall-model-baseline.json` with numbers that
were not actually measured, that is precisely the failure mode this project's disclosure rules
exist to prevent.

## The five benchmarks, and what each one actually requires

**log-law-recovery.** Run a turbulent channel flow at Re_tau near 395 with `WALL_MODEL` on,
long enough to reach a statistically converged mean velocity profile. Sample `u+` against `y+`
at wall-adjacent cells and pass the resulting array to `checkLogLaw` in
`src/validation/wallModel.ts`. This needs a channel geometry and boundary condition distinct
from the car's wind-tunnel domain, build whatever minimal harness that requires rather than
trying to extract a channel profile from the car case, they are not the same flow.

**flat-plate-skin-friction.** Run a flat plate at several Reynolds numbers spanning roughly
1e5 to 1e7, with `WALL_MODEL` on, and measure the local skin friction coefficient at each. Feed
the resulting `{ reX, cf }` pairs to `checkSkinFriction`. The genericPlane geometry or a
simpler standalone flat plate, whichever gets a clean, unobstructed boundary layer with the
least additional geometry, is fine for this.

**y-plus-band.** Run any resolved case with `WALL_MODEL` on and use `summariseYPlus` from
`src/engine/voxel/wallGeometry.ts` to build the `YPlusReport` that `checkYPlusBand` expects.
This is the cheapest of the five to produce, since it can piggyback on whichever other
benchmark case is already running.

**wall-model-inert-when-resolved.** Find or construct a case where the boundary layer is
already resolved at the grid's native resolution (low Reynolds number, `y+ < 1` everywhere near
the wall), run it once with `WALL_MODEL` off and once on, and pass both Cd values plus the
measured max `y+` to `checkModelInertWhenResolved`. This is the single most important gate.
If the model changes an already-correct answer by more than the one percent threshold, that is
a real defect in the model, not a threshold to loosen.

**stall-angle-preserved.** Sweep a wing or the airplane's angle of attack with `WALL_MODEL` off,
record the angle where lift peaks and separation begins, then repeat the same sweep with the
model on. Feed both stall angles to `checkStallAngleUnmoved`. Sharp-edge separation was already
correct before the wall model existed; if this gate fails, the model is reaching into territory
it has no business touching, not something to explain away.

## Recording results

Update `wall-model-baseline.json` with the actual measured status for each gate, `"pass"` or
`"fail"`, replacing `"not measured"`, and include the actual numbers, not just pass or fail, the
same level of detail the project's own Chunk 6 record used, log-law profile error percentage
and measured kappa, skin friction magnitude and Reynolds exponent error, y+ coverage fraction,
the Cd delta at the inert-when-resolved case, and the stall angle shift in degrees.

## What this task does not authorize

- Do not flip `WALL_MODEL`'s default to on, even if all five gates pass. That is a separate
  decision with product-level consequences (every existing accuracy disclosure and anchor
  comparison in the app would need to be re-evaluated against the new default), and it belongs
  to whoever owns that decision, not to this task.
- Do not tune `KARMAN`, `B_LOG`, or any Smagorinsky constant to make a failing gate pass. A
  gate that fails after an honest measurement is a real finding, record it as a failure with
  the actual numbers, the same way the original anchor gaps were recorded uncorrected.
- Do not substitute a synthetic or hand-typed dataset for an actual solver run because building
  the channel or flat-plate harness is more work than expected. If time runs out, report which
  of the five gates were actually measured and which remain "not measured," rather than
  quietly filling in the rest with something that looks measured and is not.

## Verification

Report, for each of the five gates: what case was actually run, what the solver actually
produced, and the exact pass or fail result from calling the real check function on that real
data. Run `npm run typecheck`, `npm test`, and `npm run build` and report their actual output.
A gate marked "pass" in `wall-model-baseline.json` without a reproducible case behind it is not
an acceptable outcome of this task.
