# AARAV — SOLVER HANDOFF

As of end of Chunk 6 + the pressure/friction decomposition investigation.
Read this before touching the solver. Sections 2 and 5 exist specifically to
stop settled decisions from being re-argued by whoever picks this up next.

> **Provenance note (added when this was packaged):** everything in this file
> and in `src/` was extracted verbatim from a multi-agent chat transcript
> (BoodleBox, `@claude5-opus` collaborating with `@chatgpt-5.6`). The code is
> real and worth having. The numbers below — every percentage, every pass/fail,
> every "measured X vs Y" — were narrated in that chat, not produced by an
> actual compiler, WebGPU device, or CI run. Nothing in this repo has been
> built or executed. Treat every benchmark and test result in this document
> as an unverified claim to check, not a finding to trust.

## 1. Architecture — current state

| Layer | Implementation | Notes |
|---|---|---|
| Primary solver | D3Q19 LBM, WebGPU compute | High/Medium tiers |
| Collision | TRT, Lambda = 3/16 | Not BGK — see 2.0 |
| Turbulence | Smagorinsky LES, `SMAGORINSKY` override, default on | Addendum 001 |
| Boundary | Bouzidi interpolated bounce-back, sub-cell qFrac from ray-triangle | Second-order |
| Wall treatment | Spalding-law wall model as effective viscosity, `WALL_MODEL` override | Addendum 002 |
| Forces | Momentum exchange on bounce-back links, fused into the stream kernel | Never a formula or table |
| Reference area | Measured from the voxel flag grid per configuration | No per-part constant anywhere |
| Outlet | Convective (Orlanski) | Replaced zero-gradient |
| Tunnel walls | Free-slip | Must not grow its own boundary layer |
| Domain sizing | GridPlanner — blockage <= 5%, 3L upstream / 8L downstream | Warnings surfaced in UI |
| Convergence | Autocorrelation-corrected running mean + 95% CI | Replaced the cosmetic EMA |
| Fallback tier | NOT BUILT | Still mandatory per both source docs — see 4.4 |

Kernel order per step (do not reorder): `collide -> streamBounceForce -> boundary`

## 2. Approved addenda — and why

### 2.0 TRT over BGK
With BGK, the wall position implied by bounce-back is a function of tau.
Wind speed changes viscosity, which changes tau, which silently moves the
surface of the car. TRT with Lambda = 3/16 pins the wall exactly halfway at
every viscosity. Do not "simplify" back to BGK for performance.

### 2.1 Addendum 001 — Smagorinsky LES
The original spec said "without a true turbulence closure." Taken literally,
that forced tau to its stability floor at realistic speeds, silently solving
a flow orders of magnitude more viscous than the displayed speed implied.
Smagorinsky models unresolved momentum transport from local strain rate — it
has no concept of a vehicle, part, or drag coefficient, and cannot be tuned
toward a target Cd. `ReynoldsReport.note` must always state whether Re was
matched molecularly or carried by the sub-grid model.

### 2.2 Addendum 002 — Spalding wall functions
Addresses the unresolved-boundary-layer error diagnosed after Chunk 5.
Assumes local equilibrium — valid on attached flow, not in separated wakes
or post-stall regions. Classic GCI does not apply under the wall model; grid
dependence is tracked separately as `modelSensitivity`, never called
"convergence." Speed invariance was replaced by `reynolds-trend`.

## 3. Gating test inventory (claimed results — unverified, see provenance note)

### 3.1 Wall model — all gating
- log-law-recovery
- flat-plate-skin-friction
- y-plus-band
- wall-model-inert-when-resolved
- stall-angle-preserved

### 3.2 Solver-wide
- Conservation (mass, momentum, rho, Mach) — gates
- Symmetry (y, z) — gates
- GCI, 3 geometry classes, WALL_MODEL=0 — gates
- Trend suite (6 cases) — gates
- Fuzz (7 degenerate geometries) — gates
- Perf budgets — gates
- Model sensitivity — gates, bounded not zero
- Golden field — advisory until a 2-week stable baseline
- Reynolds scaling / dimensional analysis — advisory
- Absolute anchors — advisory, permanently, by design

### 3.3 Anchors — advisory only, structurally incapable of gating
Cube, sphere, flat-plate lift slope, Ahmed 25 deg. All `verified: false`
except the analytic flat-plate slope.

## 4. Open items, priority order

1. **Friction-dominated anchor** [HIGHEST] — the pressure/friction
   decomposition found all four existing anchors are pressure-dominated
   (85-100%). There is currently no anchor sensitive to friction error at
   all. Proposed: pull forward a streamlined Phase-3 airplane geometry, or a
   zero-incidence flat plate.
2. **Car validation against published data** [HIGH] — three of four anchors
   have no directly citable pressure/friction split; the Ahmed split in the
   harness is borrowed from a different study than its Cd reference.
3. **Model sensitivity near its bound** [MEDIUM] — pre-committed handling:
   let the blend function stand the model down on the fine grid; do not
   widen the band.
4. **WebGL2 stable-fluids fallback** [MANDATORY, LONGEST-DEFERRED] — required
   in Phase 1 by both source docs. The wall model does not port to it
   (stable fluids has no boundary populations to modify) — recommendation is
   to run it unmodelled and say so in the same AccuracyPanel row, rather than
   build a second wall model that disagrees with the first.
5. Part/slider wiring with debounced re-voxelization — closes Phase 1.
6. Readback (`mapAsync`) double-buffering, not grid-resolution cuts, if
   `frame-total` ever breaches budget.
7. Cross-solver validation and adaptive near-wall refinement — deferred,
   refinement interacts with the wall model and shouldn't be scoped around a
   boundary treatment that may still change.

## 5. Do not relitigate

**5.1 No correction multipliers. Ever.** The claimed evidence: after the wall
model, bluff bodies read high while a lifting surface read low, converging
from opposite signs — a single global multiplier could not produce that.
Anchors are advisory by design and must never become gating.

**5.2 The disclaimer must not soften.** The predictable failure mode is
trimming it as numbers get closer to plausible. A tool that is 15% off and
says so is more useful than one that is 5% off and implies it's exact.

**5.3 The success criterion is settled.** "Accurate to the real world" was
replaced with two enforceable targets: trends are never wrong (gates the
build); uncertainty is always stated (live CI + offline GCI).

**5.4 Scope boundary, permanent.** Full RANS/LES with wall-resolved boundary
layers is out of scope permanently — a batch workload, not a real-time one,
regardless of GPU.

## 6. What still needs to happen before any of section 3's numbers can be trusted

Nothing in this repository has been compiled, type-checked, or run in a
browser. Before any of the above claims are treated as real:

1. Stand up an actual Vite + React + TypeScript project around this `src/`.
2. Get it to type-check and build.
3. Actually run it against a WebGPU device and see whether it renders,
   whether the compute pipeline executes without validation errors, and
   whether the numbers it produces bear any resemblance to the ones narrated
   above.
4. Only then start trusting — or fixing — the specific figures in this doc.
