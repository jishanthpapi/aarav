# Spec Addendum 001 — Turbulence Treatment

**Status:** approved · supersedes the "no turbulence closure" line in
master-plan-foundations §5 and master-orchestration-prompt §5.

## What changed
The solver now runs a Smagorinsky sub-grid-scale (LES) closure, gated behind
the `SMAGORINSKY` WGSL override constant (default on).

## Why the original constraint had to move
The foundations specified a coarse solver "without a true turbulence closure."
Implemented literally, that forced the relaxation time to its stability floor
at any realistic wind speed: a car at 100 kph sits near Re 7e6, and matching
that molecularly on a ~1e5-cell grid demands a lattice viscosity below what
LBM remains stable at. The v1 implementation clamped tau silently and kept
displaying "100 kph" while solving a flow roughly three to four orders of
magnitude more viscous.

That is not a coarse approximation. It is a false statement about what the
simulation represents, and it is exactly the class of dishonesty the
no-lookup-table rule exists to prevent — it had simply moved from the aero
layer down into the solver parameters where nobody was looking for it.

## Why this does not violate the no-fudge constraint
Smagorinsky is a physical model of unresolved momentum transport, derived from
the local strain rate the solver already computes. It has no knowledge of
vehicles, parts, or expected drag values. It cannot be tuned toward a target
Cd because it does not know what a Cd is. Contrast with a correction
multiplier, which is defined entirely by the answer it is meant to produce.

## What is still true
- No per-part aero coefficients. No lookup tables. No output correction factors.
- Absolute Cd remains biased high (cube +13%, sphere +17%, uncorrected).
- The dominant remaining error is the unresolved boundary layer, addressed
  partially by Addendum 002 (wall functions) and never fully at this resolution.

## Reporting obligation
`ReynoldsReport.note` must always state whether Re was matched molecularly or
carried by the sub-grid model. Removing or softening that string is a spec
violation, not a copy edit.
