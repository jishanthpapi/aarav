# Aarav application

Read [HANDOFF-CURRENT.md](HANDOFF-CURRENT.md) for the implemented scope and exact
validation status, including the differences between the uploaded archives.
Historical plans and solver addenda include unverified claims.

This revision was checked with Node.js 20.9.0 and npm 10.1.0.

    npm ci
    npm run dev

Open the address printed by Vite in a WebGPU-capable browser. WebGPU requires
a secure context; localhost is suitable for development. WebGL2 stable fluids is
available as an educational fallback. The tutor backend runs in the local Vite
server: copy `.env.example` to `.env`, set the server key and restart. See
[docs/security-findings.md](docs/security-findings.md) before considering public hosting.

The left panel controls wing angle, rear diffuser, front splitter, ride height,
requested wind speed and grid detail. Maximum detail is the default; Responsive
and Fine offer smaller grids. Device buffer limits, renderer texture limits and
a 512 MiB solver-buffer policy can reduce the requested resolution. The accuracy
panel shows the actual dimensions, cell count and spacing.

Geometry processing occurs in a worker after a short debounce. Part changes
reset flow on the existing grid; grid-detail changes recreate it. Readouts remain
invalid until a fresh result arrives. The accuracy panel distinguishes statistical
settling from physical validation and reports the achieved molecular Reynolds
number. Even Maximum detail remains coarse for thin parts and boundary layers.

Maximum detail can take over an hour to develop on integrated graphics. A
[standalone benchmark](docs/grid-benchmark.json) measured about 824 ms per two
steps at 1.70 million cells on Intel HD Graphics 620, excluding rendering. It ran
only 32 steps per grid and does not establish aerodynamic accuracy or browser
frame rate. Choose Responsive for faster changes.

## Checks

    npm test
    npm run typecheck
    npm run build

npm test discovers all test files and currently reports 46 passed, 0 failed.
It checks source data flow, grid planning, worker behaviour, security boundaries,
WGSL compilation and WebGPU API usage using Dawn's null adapter. It also runs
`npm run build` and scans the production output for secrets, so it takes longer
than a pure unit-test run. These checks do not execute the physics and do not
require an installed GPU driver. Typechecking and the production build passed.

On a machine with an executing GPU adapter:

    npm run test:gpu

This writes validation-report.json and runs a small numerical regression:
changing viscosity must affect the propagated field, and replacing geometry
must update the existing solver. A missing adapter exits 2, a failure exits 1,
and successful smoke checks exit 0. These checks do not certify aerodynamic
accuracy. --suites=smoke is the only implemented selection; unsupported legacy
suite names fail explicitly.

GitHub Actions runs the regression and build job. Its optional numerical job
requires the owner to provision a self-hosted runner with the gpu label and
select run_gpu in a manual workflow dispatch. CI has not been run from this
uploaded archive.
