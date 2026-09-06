# Prompt: integrate the Spalding wall model

Paste this into your AI coding agent with the repository checked out. Read `HANDOFF-CURRENT.md`
in full before starting, it is the current source of truth for what already works. Do not
touch the Aarav backend, the WebGL2 fallback, or the airplane module while doing this task. If
this task turns out to require work in one of those areas, stop and report that instead of
proceeding.

## What already exists and must not be re-derived

`LBMSolver.ts` currently compiles `lbm.trt.wgsl.ts`, a TRT collision operator with an optional
Smagorinsky sub grid closure, gated by a `SMAGORINSKY` pipeline override constant. Its bind
group layout has seven entries, bindings 0 through 6: `fIn`, `fOut`, `flags`, `macros`,
`params`, `qFrac`, and `accum`. The pipeline stages are `init`, `collide`, `clearForces`,
`streamBounceForce`, `boundary`, `outlet`, and `publishMacros`. Every timestep runs collision
into a scratch buffer, then streaming, force accumulation, boundary handling, and a separate
outlet dispatch back into the completed state buffer. There is no alternating flip flag; the
completed state is always the same named buffer between timesteps.

Two other files already contain most of what a wall model needs, written but never wired in:
`src/engine/webgpu/wallModel.wgsl.ts` (a Spalding law solved with damped Newton iteration,
exposed as a `wallModel` function) and `src/engine/voxel/wallGeometry.ts` (a CPU side
`computeWallGeometry` function that derives, per fluid cell adjacent to a solid, a wall normal
and a wall distance from the existing `qFrac` link fractions, plus a `summariseYPlus` helper).
Neither has been connected to the running solver.

## What this task requires

1. **Concatenate the WGSL, do not just import it.** WGSL has no module system. The `wallModel`
   function from `wallModel.wgsl.ts` and the collision tail patch that calls it (previously
   drafted as a separate file) need their source text combined with `lbm.trt.wgsl.ts` into one
   shader module string before `device.createShaderModule` is called, not left as three
   separately compiled pieces that happen to share function names.

2. **Extend the bind group layout to nine entries.** Add binding 7, a read only storage buffer
   for per cell wall geometry (`vec4<f32>`, matching what `computeWallGeometry` produces), and
   binding 8, a storage buffer for the per cell `y+` output that the accuracy panel will read
   back. Update every place in `LBMSolver.ts` that currently builds a bind group from a fixed
   list of buffers to include these two, in both directions of the state and scratch buffers.

3. **Gate it behind a real override constant.** Add `WALL_MODEL` alongside the existing
   `SMAGORINSKY` override when creating the `collide` pipeline, defaulting to off. Do not wire
   it to default on until the gating tests below pass.

4. **Compute wall geometry where link fractions are already computed.** `wallGeometry.ts`'s
   `computeWallGeometry` needs the same `flags` and `qFrac` data the voxel worker already
   produces. Add this computation to the existing worker job in `VoxelWorkerClient.ts` and
   `voxel.worker.ts` rather than introducing a second worker or running it on the main thread.
   Follow the existing job coalescing pattern, one active job and one queued job, exactly as
   flags and fractions already do.

5. **Upload the new buffer the same way `setFlags` uploads flags and fractions.** Extend
   `LBMSolver.setFlags` or add a parallel method with the same validation discipline it already
   has: reject data that does not match the allocated grid size, do not silently truncate or
   pad.

6. **Surface `y+` in the accuracy panel, not just internally.** The accuracy panel already
   reports a clamped molecular Reynolds number honestly. Add a `y+` coverage row using
   `summariseYPlus`, following the same rule already established there: never claim more than
   what is actually being resolved, and disclose when coverage is below fifty percent of the
   wetted surface rather than silently applying the model everywhere.

## Gating tests, write these before wiring the model in, not after

`src/validation/wallModel.ts` already defines the check functions: `checkLogLaw`,
`checkSkinFriction`, `checkYPlusBand`, `checkModelInertWhenResolved`, and
`checkStallAngleUnmoved`. None of these are currently connected to `npm test`. Before writing
any collision kernel changes, wire these into the existing `tests/` suite using the same style
as `tests/solver-dispatch.test.mjs`, run them against the current, wall model free solver, and
record the baseline failures. Only then implement the wall model, and confirm those same tests
now pass.

The two tests that matter most, and must never be loosened to make the model look better than
it is:

- `checkModelInertWhenResolved`: with the wall model on, a case where the boundary layer is
  already resolved must change the reported drag by under one percent. A wall model that
  changes an already correct answer is a correction multiplier wearing a physics name.
- `checkStallAngleUnmoved`: turning the wall model on must not move a wing's stall angle by
  more than two degrees. Sharp edge separation is geometric and was already correct before
  this task; the wall model has no business touching it.

## What this task explicitly does not include

- Fitting `KARMAN`, `B_LOG`, or any Smagorinsky constant to make a specific vehicle's drag
  coefficient land closer to a published value. If a constant needs adjusting, it is adjusted
  because the physics it represents was wrong, never because the output was wrong.
- Standing up the full conservation, symmetry, GCI, trend, and fuzz benchmark suites described
  in `HANDOFF-CURRENT.md`'s remaining work list. That is a separate, larger task. Wiring in
  only the five wall model specific checks above is the scope here.
- Any change to `AaravChat.tsx`, the fallback tier, or the airplane module.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`, and report the actual output of each,
not an expectation of what they should show. Additionally report, explicitly, the before and
after result of each of the five wall model gating tests, the same way `HANDOFF-SOLVER.md`'s
Chunk 6 section originally intended to, except this time the numbers must come from an actual
test run.
