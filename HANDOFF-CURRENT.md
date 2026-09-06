# Aarav — current implementation handoff

Updated 2026-09-06. This describes the current workspace, including the grid-detail
changes made after importing `aarav-project-all-changes.zip`. Historical plans and
solver addenda describe goals and earlier claims; they do not establish validation.

## Version reconciliation

`aarav-project-updated.zip` contains an earlier `HANDOFF-CURRENT.md` describing
three part controls and a four-metre geometry envelope. Its old planner produces
177 × 38 × 42 cells at 0.271389 m spacing. The later `aarav-project-all-changes.zip`
adds the front splitter and extends the fixed envelope to 4.25 m along X. With the
same old planner, that produces 177 × 36 × 39 cells at 0.288351 m spacing.

The current workspace matched the latter archive before this session's edits.
That archive itself omitted all three handoff files, so the missing document was
not an extraction failure. This file restores the handoff with current facts.
The selectable grids below replace both old fixed-grid descriptions.

## Implemented behavior

- React, React Three Fiber/Three.js, Zustand and Tailwind provide the workstation,
  orbit camera, controls and readouts. A procedural generic car supplies the same
  triangle geometry to rendering and voxelization. Eight CC0 Kenney silhouettes
  and a generic aircraft are also connected through the same geometry path.
- Four part controls adjust rear wing angle, rear diffuser, front splitter and ride
  height. Wind speed is a requested physical speed; the accuracy panel reports the
  achieved molecular Reynolds number.
- Part changes debounce for 200 ms, then a module worker recomputes solid flags and
  Bouzidi link fractions. Superseded jobs cannot replace newer geometry. Geometry
  changes reuse the selected grid and solver allocation; changing grid detail
  recreates them. Changes invalidate readouts and reset flow/statistics.
- The active solver is WebGPU D3Q19 TRT with Smagorinsky. Each timestep collides
  A→B, then streams/bounces/integrates momentum exchange B→A. Separate boundary,
  outlet and macro publication dispatches preserve completed-state coherence.
  The Spalding wall-model modules are wired but remain disabled pending physical validation.
- The browser submits one timestep at a time and waits for GPU completion before
  another batch. Readbacks occur at most once per 200 ms and copy field/force data
  together. Old revisions cannot publish results after a configuration change.
- Particle motion and colors sample the solver field. The supplied GLSL version
  is applied in `src/render/particles/advect.glsl.ts`. Its animation time scale is
  visual, and is not elapsed physical simulation time. Pressure and wake rendering
  layers remain unfinished; the wake readout counts downstream slow-fluid cells.
- The accuracy panel shows grid dimensions, total cells, spacing, achieved
  Reynolds number and statistical spread. Statistical settling is distinct from
  physical validation. Smagorinsky does not restore a Reynolds number lost to the
  molecular-viscosity stability floor.

## Grid detail and resource limits

Maximum detail is the default. Requested budgets are 400,000 cells for Responsive,
900,000 for Fine and 2,000,000 for Maximum detail. A bisection search finds the
finest spacing that fits the selected budget and dimension limits, avoiding the
old planner's repeated 15% resolution reductions.

The actual budget also respects the created WebGPU device's buffer limits and a
512 MiB solver-buffer allocation policy. Dimension limits include the renderer's
WebGL 3D texture size and WebGPU dispatch capacity. The 512 MiB policy excludes CPU
geometry/readback copies and renderer allocations; it is not a VRAM measurement.

With a 128 MiB storage-binding limit and no tighter dimension constraint, the
current 4.25 m envelope gives:

| Selection | Grid | Cells | Cell spacing |
| --- | --- | ---: | ---: |
| Responsive | 207 × 42 × 46 | 399,924 | 0.246377 m |
| Fine | 272 × 55 × 60 | 897,600 | 0.187500 m |
| Maximum detail | 341 × 69 × 75 | 1,764,675 | 0.149560 m |

Maximum detail still resolves only about 28 cells along the envelope. Thin parts,
narrow ground gaps and boundary layers remain under-resolved. These presets are
grid choices, not aerodynamic-accuracy or frame-rate certifications.

## Verification and performance evidence

| Check | Current result |
| --- | --- |
| `npm test` | 46 passed, 0 failed; includes all discovered tests, security reproductions and production-bundle secret scan |
| `npm run typecheck` | Passed |
| `npm run build` | Passed inside the security bundle test; existing large-chunk warning remains |
| Browser rendering and controls | Particle, asset and fallback checks passed in the preceding implementation work; security HTTP middleware checked through loopback |
| Standalone executing-GPU grid benchmark | Five grids produced finite, positive-density fields after 32 steps |
| Aerodynamic accuracy, trends and long-run stability | Not established |

The benchmark is preserved in [docs/grid-benchmark.json](docs/grid-benchmark.json).
It used Intel HD Graphics 620 through D3D12, without concurrent browser rendering.
Its largest tested grid had 1,695,784 cells, slightly below the current Maximum
detail grid, and took a median 824 ms per two-step batch. At that measured rate,
the two-domain-flow-through warmup alone would take roughly 93 minutes. This is
an extrapolation, not an observed converged run; browser overhead and the current
one-step scheduling can change the timing. Responsive remains available for
faster iteration. The report's default recommendation predates the decision to
start the app at Maximum detail.

The benchmark checks short execution and timing, not correct drag/lift values.
Dawn's null adapter does not execute physics. `npm run test:gpu` remains the
separate viscosity/geometry smoke runner; only `--suites=smoke` is implemented.
The pre-existing `validation-report.json` and `docs/validation-status.json` record
the earlier archive's checks and unavailable numerical adapter, and should not be
read as results for this revision. CI has not been run from this workspace.

## Current scope and limits

Aarav now has a server-only Anthropic proxy, live scene telemetry, validated tool
inputs, camera focus/highlighting, and a small ground-effect lesson. It reports a
clear missing-key error when `ANTHROPIC_API_KEY` is not configured; no browser
secret is used. The merged vehicle catalog contains the generic car, eight CC0
Kenney silhouettes, and a generic aircraft with angle-of-attack, flap, rudder,
aileron, and elevator controls. All vehicle geometry is shared by rendering and
voxelization.

Moving flow lines trace the sampled velocity field. Particles use the corrected
GLSL3D shader and a capped foreground size/opacity so they cannot wash out the
scene. WebGL2 stable fluids is an explicitly labelled fallback with a 100,000-cell
ceiling and no claim of LBM accuracy parity. Automatic mode selects WebGPU when
available and falls back to WebGL2 when it is not.

The wall model remains off. Its five physical gates are recorded as not measured
in `docs/wall-model-baseline.json`; unit tests of gate logic and shader validation
are not physical evidence. No real-world error percentage or certified coefficient
is established. The full test suite currently has 46 passing tests; typecheck,
production build, browser checks, and the executing Intel HD 620 WebGPU smoke
runner have passed.

## Security verification and deployment limits

See [docs/security-findings.md](docs/security-findings.md) for reproductions and
actual command logs. Baseline: 28 passed/0 failed. Added pre-fix tests: 33 passed/
9 failed out of 42. Final suite: 46 passed/0 failed. No Anthropic API quota was used.

The tutor handler now enforces exact application Origin, bounded JSON input,
20 requests per caller per minute and a 60-request per-process cap. Replies past
the cap use 429 with Retry-After. Middleware caller identity comes from the socket;
untrusted forwarding headers do not grant new budgets. Grid and worker inputs
are validated before allocation; tool arguments use exact fields and range checks.

Remaining deployment work: authentication and durable shared quotas across
process restarts/replicas are absent. An Origin header can be forged by a non-browser
client. These first-pass limits do not certify a public billed API against abuse.
The recorded npm audit has one high Vite entry and one moderate esbuild entry,
both deferred/unresolved; neither is labelled fixed or a false positive. See the
audit baseline and license inventory under docs/. No dependency versions changed.

The earlier `aarav-project-merged-2026-09-06.zip` flattened directory paths and must
not be used as a runnable checkout. `scripts/package-source.ps1` creates a new
structured archive and verifies every relative path and SHA-256 against this folder.
