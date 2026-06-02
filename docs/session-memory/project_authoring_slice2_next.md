---
name: project-authoring-slice2-next
description: Slices 1 + 2A + 2B all BUILT 2026-06-02 — next concrete step is DOC1 (Doctrine/ROE/WRA), the highest-value engine gap per the CMO playbook
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fca86e4-e6c4-4274-a551-da787767e6cf
---

**Status (2026-06-02).** Edit Mode now has THREE slices live, all on the same
in-memory working-copy boundary as Slice 1:

- **Slice 1** — Metadata + Sides + Posture.
- **Slice 2A (Geography)** — `map_bbox`, `ao_boundaries[]` (with "Use map_bbox
  as AO" one-click), `obj` (with carver 0..60 client-side hard block),
  `pipeline`, `throughput_ceilings_km`, `bls_template[]`. Save repaints the
  map via `AppAdjudicatorMap.drawScenario` + `fitScenarioAO`.
- **Slice 2B (Forces)** — `red_units[]` and `blue_units_initial[]` with full
  add/remove/edit. `blue_units_base_ids` is **derived** from
  `blue_units_initial[].base_id` on Save (single source of truth — operator
  never edits the parallel array). **Writes into the in-memory scenario
  draft, NOT the durable `/api/units` SQLite store** (the AUTH1 roadmap
  decision: those two stores are unbridged and the durable one is the wrong
  target for scenario authoring). Add Red unit is **disabled until ≥1 BLS
  exists**, with a visible hint; disable-state is live-reactive to BLS
  add/remove in the Geometry card via a small cross-card refresh hook
  (`_refreshForcesAvailability`) — no full re-render, no input-focus loss.

**Hard rules mirrored client-side** (matching `scenario-validator.js`): 2A
carver 0..60; 2B every `red_units[].bls` ∈ `bls_template[].name`, `appear` ∈
steps range, `uid`/`unit_uid` non-empty + unique. Static tests
`test-edit-mode-slice2a.js` (50/50) and `test-edit-mode-slice2b.js` (46/46)
round-trip the playbook sample against the **real** validator. Browser
verification via `scripts/verify-server.js` (registered as
`rmooz-web-verify` in `.claude/launch.json`).

**Next = DOC1 — Doctrine/ROE/WRA.** Per the CMO playbook Step 5
(`docs/cmo-functional-rules/5-build-playbook.md`) this is the **highest-value
engine gap** (⚠️ GAP marker): no scenario field exists for doctrine/WRA/ROE
today and the AI adjudicator uses prompt prose instead of authored policy.
The playbook +
`docs/cmo-functional-rules/exhaustive/doctrine-adjudication.md` are the
behavior contract. The roadmap row also calls this out as **DOC1** in the
AUTH track — its definition: *"Doctrine/ROE layer — visible & auditable
data; AI decisions cite doctrine/ROE."*

Concrete shape for DOC1 (sketch — to be confirmed before building):
- Add a `doctrine{}` top-level scenario block (per-side, hierarchical:
  side → mission → group → unit overrides).
- Author WRA state (Free / Tight / Hold) per side.
- Stamp self-defense, EMCON, fuel/withdrawal policies.
- An Edit Mode **Slice 3 (Doctrine)** card to author it, mirroring the
  2A/2B pattern (defaults + render + hard rules + repaint).
- AI proposal explainer surfaces "decision X cited doctrine policy Y".

**Pre-DOC1 questions to settle:**
1. Schema shape — bilateral matrix vs per-side flat? Hierarchical override
   semantics?
2. WRA UI: per-unit override, or only side/group level? CMO does both.
3. AI citation: do we add a `cites:[{path, policy}]` field on AI proposals
   or wire it through the existing explainability surface?

After DOC1: TASK1 (Tasking/Mission layer — structured mission objects +
tasking view, per the roadmap row).
