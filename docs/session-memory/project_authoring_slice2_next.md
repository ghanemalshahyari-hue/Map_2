---
name: project-authoring-slice2-next
description: Slices 1 + 2A + 2B + 2C all BUILT 2026-06-02 — next concrete step is DOC1 (Doctrine/ROE/WRA), the highest-value engine gap per the CMO playbook
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fca86e4-e6c4-4274-a551-da787767e6cf
---

**Status (2026-06-02).** Edit Mode now has FOUR slices live, all on the same
in-memory working-copy boundary as Slice 1:

- **Slice 1** — Metadata + Sides + Posture.
- **Slice 2A (Geography)** — `map_bbox`, `ao_boundaries[]` ("Use map_bbox as
  AO" one-click), `obj` (carver 0..60 hard block), `pipeline`,
  `throughput_ceilings_km`, `bls_template[]`. Save repaints the map.
- **Slice 2B (Forces)** — `red_units[]` and `blue_units_initial[]` editing.
  Writes into the in-memory scenario draft, NOT the durable `/api/units`
  SQLite. `blue_units_base_ids` is derived on Save. Add Red unit
  disabled-state is live-reactive to BLS changes upstream.
- **Slice 2C (Layout + New Scenario)** — restructures the editor into a
  **stepped left-rail navigator** matching CMO's 13-step build-order
  (Metadata → Map → Sides → Posture → Doctrine → Time → Weather → Forces
  Geometry → Forces → Missions → Events → Briefing → Validate & Save).
  Replaces a 4136-px crowded scroll with a 520-px per-step pane (≈ 8×
  reduction). Each step has a completion-pill indicator (green ✓ / empty /
  dashed-gap). Adds Step 6 (Time & Duration with "Synthesize H-3 → H+120"
  preset + lockstep `phase_table.length === steps.length`) and Step 12
  (Briefing — per-step EN/AR textareas). Adds **"+ New scenario"**
  affordance (inline form → fresh draft stamp), **"Save As JSON"** (client
  Blob download — boundary-safe; the locked guard is journal download), and
  **"Save to server"** via new endpoint `POST /api/scenarios` (validates,
  sanitises name, 409 anti-clobber, writes JSON, sets active).

**Tests** — 146 client assertions across `test-edit-mode-slice2{a,b,c}.js` +
17 server assertions in `test-api-scenarios-post.js` (spawns web-server on
a temp data dir + random port). Browser-verified end-to-end via
`scripts/verify-server.js` (registered as `rmooz-web-verify`).

**Architectural notes for the next slice author:**

- **Two unit stores** stay unbridged. Scenario draft (`red_units[]`,
  `blue_units_initial[]`) is the authoring target. Durable
  `/api/units/:id/place` SQLite is for persistent force structure.
- **STEPS table** in `scenario-edit-mode.js` is the contract for the rail.
  Adding DOC1 = add one entry, switch `gap:true` → `gap:false`, point at a
  new render function. The rail / pill / nav layer doesn't need changes.
- **PHASES_ENUM** is hardcoded inline in the client (mirrors
  `adjudicator-schema.js:15` server-side) to avoid a network call for a
  6-item static enum. If the server enum changes, update both.
- **Save flows** are tiered: in-memory (Save draft) → client file (Save As)
  → server file (Save to server). The boundary rule that's still locked is
  the *journal* download — scenario JSON file ops are fine and crossed
  intentionally for the New Scenario surface.

**Next = DOC1 — Doctrine/ROE/WRA.** Per the CMO playbook Step 5
(`docs/cmo-functional-rules/5-build-playbook.md`) this is the
**highest-value engine gap** (⚠️ GAP marker): no scenario field exists for
doctrine/WRA/ROE today and the AI adjudicator uses prompt prose instead of
authored policy. The playbook +
`docs/cmo-functional-rules/exhaustive/doctrine-adjudication.md` are the
behavior contract. Roadmap row calls this out as **DOC1**: *"Doctrine/ROE
layer — visible & auditable data; AI decisions cite doctrine/ROE."*

DOC1 build sketch:
- Add `doctrine{}` top-level scenario block (per-side, hierarchical:
  side → mission → group → unit overrides).
- Author WRA state (Free / Tight / Hold) per side; self-defense, EMCON,
  fuel/withdrawal policies.
- A render function `renderDoctrineCard()` filling the Step 5 placeholder.
  Just flip `gap:true → false` in the STEPS entry.
- `stepIsComplete('doctrine')` predicate (currently returns null).
- AI proposal explainer surfaces "decision X cited doctrine policy Y" —
  separate work, blocked on doctrine schema landing first.

**Pre-DOC1 questions to settle:**
1. Schema shape — bilateral matrix vs per-side flat? Hierarchical override
   semantics?
2. WRA UI: per-unit override, or only side/group level? CMO does both.
3. AI citation: do we add a `cites:[{path, policy}]` field on AI proposals
   or wire it through the existing explainability surface?

After DOC1: TASK1 (Tasking/Mission layer — the Step 10 placeholder), then
Weather (Step 7 placeholder) when the schema is settled.
