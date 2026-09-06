# Prompt: build the WebGL2 fallback tier

Paste this into your AI coding agent with the repository checked out. Read `HANDOFF-CURRENT.md`
in full before starting. Do not touch the wall model, the Aarav backend, or the airplane
module while doing this task.

## Current state, precisely

`SolverTier` in `src/types/simulation.ts` already has a `fallback` value, and
`SolverManager.ts`'s `detectBestTier` already returns `'fallback'` when `navigator.gpu` is
missing or no adapter is returned. Nothing consumes that result. `useAaravSimulation.ts`
unconditionally attempts to construct a WebGPU `LBMSolver` and, if that fails, sets a status
of `unsupported` with an honest message telling the user the fallback tier does not exist yet.
There is no `StableFluidsSolver` class, and no branch anywhere that picks between two solver
implementations.

## What this task requires

1. **A stable fluids solver behind the same interface `LBMSolver` exposes.** Build a
   `StableFluidsSolver` class implementing `init`, `setFlags`, `setWindSpeed`, `reset`, `step`,
   `readMacros`, `readForces` or an equivalent readout method, and `destroy`, using the
   semi Lagrangian advect, diffuse, project method on WebGL2, so that `useAaravSimulation.ts`
   can be changed to depend on a shared interface rather than the concrete WebGPU class.

2. **No wall treatment parity claim.** `HANDOFF-CURRENT.md` and the wall model prompt both
   note that stable fluids has no boundary populations to modify, so it cannot run the same
   Spalding wall model the WebGPU tier does. Do not attempt to fake equivalent behavior. Run
   this tier with an unmodelled, free slip or simple no slip boundary condition and say so
   explicitly in the accuracy panel, in the same row where wall model coverage is reported for
   the WebGPU tier. Do not let the two tiers silently disagree without the user being told
   which one they are looking at.

3. **Real tier selection, not a config left unused.** Change `useAaravSimulation.ts` to call
   `detectBestTier` (or a revised version of it that also distinguishes actual device
   capability, not just presence of WebGPU) and construct whichever solver class matches the
   result, storing the chosen tier in `solverTier` on the store so the UI can display it.

4. **Force integration must exist on this tier too.** The drag and lift readouts should not
   silently disappear or read zero on the fallback tier. Compute an equivalent surface force
   integration against the stable fluids velocity field, using whatever method is natural for a
   grid based Eulerian solver, and mark it with the same or a comparably honest confidence
   treatment the WebGPU tier already applies through `ConvergenceMonitor`.

5. **Shared downstream code.** `HANDOFF-CURRENT.md` states the intention that both tiers should
   feed the same downstream consumers, the field texture, the particle system, and the readout
   panel. Confirm `FieldTexture` and `ParticleField` can consume whichever solver's macroscopic
   output without tier specific branching outside `useAaravSimulation.ts` itself.

## Explicit constraints

- Do not remove or weaken the existing `unsupported` status path. A device with neither WebGPU
  nor a usable WebGL2 context must still show an honest message, not a frozen scene.
- Do not tune the stable fluids solver's parameters to make its drag and lift numbers match the
  WebGPU tier's numbers on a specific test case. The two tiers are allowed to disagree, and are
  expected to, given their different numerical methods; the goal is that each is honest about
  its own resolution and treatment, not that they are forced to agree.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`, and report the actual results. Since
this task's core logic (the fluid solve itself) can only be meaningfully checked by running it,
also report explicitly whether you were able to exercise the WebGL2 path in an actual browser
context, and if not, say so rather than reporting the task complete based on type checking
alone.
