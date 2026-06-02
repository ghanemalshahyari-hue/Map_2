---
name: project-authoring-slice2-next
description: Slice 2A (Geography) BUILT 2026-06-02 — next concrete step is Slice 2B (Forces / red_units + blue_units_initial editing inside Edit Mode)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fca86e4-e6c4-4274-a551-da787767e6cf
---

**Status (2026-06-02).** Edit Mode **Slice 2A (Geography)** landed: `shell/scenario-edit-mode.js`
now makes `map_bbox`, `ao_boundaries[]`, `obj` (with client-side `carver` 0..60 hard block),
`pipeline`, `throughput_ceilings_km`, and `bls_template[]` editable on the same in-memory working
copy as Slice 1 (Metadata + Sides + Posture). Save now also repaints the map via
`AppAdjudicatorMap.drawScenario` + `fitScenarioAO` — geometry edits must redraw. Static test
`test-edit-mode-slice2a.js` is 50/50 green, including a round-trip on the playbook sample that
re-validates `ok:true`. The "Use map_bbox as AO" one-click writes the GeoJSON Polygon shape the
renderer expects (not the playbook sample's flat `coords` shape).

**Why this order.** CMO build-order says *define the AO before placing units* — and the wargame3
audit (2026-06-02) showed exactly the geography fields missing/empty (`ao_boundaries: []`,
`throughput_ceilings_km` absent). Splitting Slice 2 into 2A (Geography, done) + 2B (Forces, next)
keeps PRs small/Node-testable per the roadmap rule.

**Next = Slice 2B (Forces).** Make `red_units[]` and `blue_units_initial[]` editable inside Edit
Mode. Reuse the existing ORBAT-dock + `units-map.js` cursor-follow placement plumbing **but write
into the in-memory scenario draft** (`window.RmoozScenario.scenario`), not the durable
`/api/units/:id/place` SQLite store — those stores are unbridged and the durable one is the wrong
target for scenario authoring. AUTH1 in the roadmap is exactly this. Slice 1's boundary
(in-memory only, no `/api/sim/commit`, no journal write, no download) carries forward unchanged.

Build against:
- [`docs/cmo-functional-rules/exhaustive/scenario-authoring-part{1,2}.md`](../cmo-functional-rules/exhaustive)
  (behavior contract for OOB + appearance + roles).
- [`docs/cmo-functional-rules/sample-sahil-corridor.json`](../cmo-functional-rules/sample-sahil-corridor.json)
  — target JSON shape (passes `scenario-validator`).
- Validator hard rules to mirror in 2B: every `red_units[].bls` must match a `bls_template[].name`;
  `red_units[].appear` ∈ steps range; `blue_units_base_ids.length === blue_units_initial.length`.
