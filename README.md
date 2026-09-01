# Aarav Project — Merged Folder Index

This folder merges everything from `files.zip` (the original foundations) with the new v2 multi-agent
orchestration prompt and v2 plan you provided. Nothing was removed; original files are kept alongside the
merged versions so you can diff them if needed.

## prompts/
- **master-orchestration-prompt.txt** — the v2.0 multi-agent orchestration prompt you pasted, with the
  full technical foundations (solver design, phased roadmap, data model, Aarav's full system prompt,
  constraints) folded back in so it's self-contained. **Use this one to actually run the agent loop.**
- **master-prompt-foundations.txt** — original, unedited, from `files.zip`. The detailed single-agent build
  prompt this project started from.
- **open-source-sourcing-prompt.txt** — original, unedited, from `files.zip`. Hand this to a
  search-enabled agent to vet/attribute open assets (including the Kenney Kit and NASA Resources packs
  named in the plan).

## plans/
- **master-plan-merged.txt** — `master-plan.txt` (from `files.zip`) with the v2 plan's unique material
  merged in (multi-agent strategy, the workstation UI layout, progress bar, named starting asset packs).
  **Use this one as the reference plan.**
- **master-plan-foundations-original.txt** — original, unedited, from `files.zip`.
- **master-plan-v2-original.txt** — original, unedited, the v2 plan you uploaded.

## assets/
- **kenney-car-kit/** — Kenney "Car Kit" v3.1, CC0/public domain (confirmed via the pack's own
  `License.txt`). **Sourced and cleared** — this is the car pack named in the plan. Includes GLB/FBX/OBJ
  models; good generic-silhouette candidates: `sedan`, `sedan-sports`, `hatchback-sports`, `suv`,
  `suv-luxury`, `van`, `race`, `race-future`, plus separate swappable wheel models.
- **B777_LARC_AIR_0626.glb** — the NASA glTF model you uploaded. Flagged in the merged plan (§10) as
  needing a license/attribution check and a real-vs-generic-silhouette decision before use, since it's a
  real, identifiable aircraft (a Boeing 777), even though NASA-sourced. **Still open, unlike the car kit.**

## One thing worth your attention before handing this to an agent
- **B777 model**: it's a real, branded aircraft. Decide whether it's meant as an offline geometry
  reference only, or something to reskin into a generic silhouette, before it goes in front of the
  in-app "no real/branded vehicles" rule. (See `master-plan-merged.txt` §10.)

(The lattice dimensionality was aligned to 3D — D3Q19/D3Q27 — in both `master-orchestration-prompt.txt`
and `master-plan-merged.txt`, so that mismatch is resolved.)
