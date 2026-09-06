# Files (16) validation status

The two prompts from `files (16).zip` are preserved in `roadmap/` and treated as test specifications. Measurements below are from the executing Intel HD Graphics 620 WebGPU adapter, or are explicitly marked not measured.

## Completed measurements

- The empty-tunnel regression test initially measured a maximum velocity error of `0.048157110414467755`. The cause was boundary handling that reversed tangential populations at free-slip walls. The implementation now reflects only the population component crossing the wall normal. The same executing test passes after the fix (`docs/free-slip-after.txt`).
- A resolved 32×16×16 block case ran with wall model off and on for 2,560 steps each. Both runs converged with `Cd = 34.702666666666616`; the inert-model checker measured `0%` change. Wall-model-on y+ was finite for all 208 wall cells, with min `0.0699`, median `0.2204`, max `0.4066`, and 100% below 1. The UI emits the required low-coverage warning. These are solver regression measurements, not aircraft or turbulent-wall validation.

## Remaining gates

The turbulent channel Reτ≈395, flat-plate Re_x sweep, and aircraft stall-angle campaign are not certified. They require dedicated statistically converged physical cases and cannot be inferred from the block or smoke runs. The current grid and relaxation floor also limit the requested high-Reynolds-number sweep; the limitation remains disclosed rather than hidden by changing constants.

The browser fallback prompt is implemented in `runtime-checks.html` and `src/validation/browserRuntimeEntry.ts`, but its two 3,000-step cases still need to be executed in a browser and copied into `docs/fallback-runtime-measurements.json`.

