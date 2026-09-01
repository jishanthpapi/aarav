# Spec Addendum 002 — Wall Functions

**Status:** approved (scoped as its own chunk) · extends Addendum 001.

## What this adds
A Spalding-law wall model applied at the first fluid cell off any solid
surface, implemented as a modified effective viscosity in the TRT relaxation
rather than as a directly imposed shear. Gated behind `WALL_MODEL`.

## Why an effective viscosity and not an imposed stress
Momentum-exchange force integration reads the actual populations crossing the
boundary links. If the wall shear were imposed as a separate body force, the
force reported to the user and the force felt by the fluid would be two
different numbers computed two different ways, and nothing would keep them
consistent. Feeding the model through viscosity means the wall stress the user
sees IS the wall stress the solver applied.

## Validity envelope — read this before trusting any number
The model assumes a local equilibrium boundary layer. That holds on:
  - the front and upper surfaces of an attached body
  - an attached wing upper surface below stall
  - the fuselage of the Phase 3 aircraft

It does NOT hold in:
  - separated wakes (the entire rear of a bluff body)
  - post-stall wing suction surfaces
  - strong adverse-pressure-gradient regions just before separation

Spalding's law degrades continuously to the viscous sublayer solution as
u_tau -> 0, so these regions fall back toward molecular viscosity rather than
producing garbage. But "does not explode" is not "is correct," and the UI
reports the in-band fraction so that distinction is visible to the user.

## What this deliberately does NOT do
- It does not move the separation point. Sharp-edge separation is geometric
  and was already correct.
- It does not close the anchor gap by construction.

## Consequence for grid convergence
Refining the grid moves the first cell, which changes y+, which changes the
model's contribution. A wall-modelled solution therefore does not converge to
the wall-resolved solution. Classic GCI does not apply.

Handling: the GCI gate now runs with `WALL_MODEL=0` (discretisation only).
Grid dependence under the wall model is tracked separately as
`modelSensitivity`, deliberately NOT called convergence.

## Consequence for speed invariance
tau_w genuinely depends on Re now. `speed-invariance` is replaced with
`reynolds-trend`, which checks the drift follows the expected weak power law.
This is a stricter test than the one it replaces, not a relaxed one.
