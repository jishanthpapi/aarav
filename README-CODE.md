# Aarav — extracted solver code

This `src/` tree, `HANDOFF-SOLVER.md`, and the `docs/spec-addendum-*.md`
files were extracted from a multi-agent chat transcript (see the parent
project's HANDOFF.txt for how this relates to the rest of the plan). See
HANDOFF-SOLVER.md section 6 before trusting anything in here.

Not yet done, in order:
- npm install
- npm run typecheck  (expect real errors — this has never compiled)
- wire the "additions"/"patch" files (useSimulationStore.forces.ts,
  LBMSolver.forces.ts, lbm.wall.wgsl.ts) into their base files by hand —
  they were written as diffs in the source transcript, not standalone modules
- part/slider UI wiring (PartLibrary.tsx is referenced by Workstation.tsx but
  was never actually written in the transcript — you'll need to add it)
- the WebGL2 fallback tier (never built, see HANDOFF-SOLVER.md 4.4)
