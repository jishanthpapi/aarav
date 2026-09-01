<div align="center">

<h1>AARAV</h1>
<p><strong>Aarav Intelligence</strong>, a play on AI</p>
<p>A GPU-simulated wind tunnel for learning real aerodynamics, in your browser.</p>

<p>
  <img src="https://img.shields.io/badge/status-experimental-orange" alt="status" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript&logoColor=white" alt="typescript" />
  <img src="https://img.shields.io/badge/React-18-149eca?logo=react&logoColor=white" alt="react" />
  <img src="https://img.shields.io/badge/WebGPU-required-6e40c9?logo=webgpu&logoColor=white" alt="webgpu" />
  <img src="https://img.shields.io/badge/Three.js-r160-black?logo=threedotjs&logoColor=white" alt="threejs" />
  <img src="https://img.shields.io/badge/build-untested-red" alt="build" />
  <img src="https://img.shields.io/badge/license-unset-lightgrey" alt="license" />
</p>

</div>

<br />

## Table of contents

- [Overview](#overview)
- [Status](#status)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Roadmap](#roadmap)
- [License](#license)

<br />

## Overview

Aarav is a wind tunnel that only exists in a browser tab. Adjust a rear wing, drop the ride
height, deploy a rudder, and the airflow recomputes live, because it is being solved on the
GPU in real time rather than pulled from a lookup table.

Aarav, the in-scene AI tutor, watches along with you and explains why a number moved, using
the same values you are looking at on screen.

<div align="center">
<img src="https://img.shields.io/badge/solver-D3Q19%20LBM-1f2937?style=for-the-badge" alt="solver" />
<img src="https://img.shields.io/badge/compute-WebGPU%20shaders-1f2937?style=for-the-badge" alt="compute" />
<img src="https://img.shields.io/badge/grid-96x48x48-1f2937?style=for-the-badge" alt="grid" />
</div>

<br />

## Status

This section is not marketing copy. The project's own internal rule is that a tool which is
15 percent off and says so is more useful than one that is 5 percent off and implies it is
exact, so this table follows the same standard.

| Piece | Status |
|---|---|
| App shell, UI chrome, 3D viewport | Builds and type-checks |
| LBM solver and force integration | Wired to the UI, never run on a real GPU |
| Accuracy and validation harness | Written, never executed |
| Part sliders (wing, diffuser, ride height) | Not wired yet |
| Airplane module | Not started |
| WebGL2 fallback tier | Not built, WebGPU only for now |

If this breaks in the console on first load, that is expected, not a regression.

<br />

## Features

<table>
<tr>
<td width="50%" valign="top">

**Real flow, not animation**
A D3Q19 Lattice Boltzmann solver runs on WebGPU compute shaders. Streamlines, wake, and
separation emerge from the physics instead of being scripted.

**Tunable parts**
Rear wing angle, diffuser, independent front and rear ride height, with flaps, rudder, and
ailerons planned for the airplane module.

</td>
<td width="50%" valign="top">

**Aarav, the tutor**
Scene aware, able to move the camera, highlight a part, and adjust a slider mid explanation
instead of only describing what to try.

**Honesty by design**
A live accuracy panel reports statistical confidence, resolution, blockage ratio, and
Reynolds regime. Accuracy against published data is tracked and never corrected toward.

</td>
</tr>
</table>

<br />

## Tech stack

| Layer | Choice |
|---|---|
| UI | React, TypeScript, Tailwind CSS |
| 3D scene | React Three Fiber, Three.js |
| Simulation | WebGPU compute shaders, D3Q19 Lattice Boltzmann |
| State | Zustand |
| AI tutor | Claude (Anthropic API), backend integration pending |

<br />

## Getting started

```bash
npm install
npm run dev         # http://localhost:5173, needs a WebGPU capable browser
npm run typecheck    # tsc --noEmit
npm run build        # production build into dist/
```

<br />

## Project structure

```
src/
  components/     UI chrome and 3D scene components
  engine/
    webgpu/       LBM compute kernels and solver class
    voxel/        triangle to lattice voxelization
    geometry/     geometry helpers
  render/         particle field, flow texture
  store/          Zustand scene state
  validation/     accuracy harness: conservation, symmetry, GCI, trends
docs/             spec addenda for the turbulence model and wall functions
plans/, prompts/  the planning documents this project grew from
```

<br />

## Roadmap

- [x] Phase 0, render pipeline and placeholder vehicle
- [x] Phase 1 partial, LBM solver wired to a live readout panel
- [ ] Part and slider wiring with re-voxelization
- [ ] WebGL2 fallback tier
- [ ] Airplane module: flaps, rudder, ailerons, stall behavior
- [ ] Aarav backend: real Anthropic API tool calling into the scene

<br />

## License

Not yet chosen. Pick one before publishing this repository.
