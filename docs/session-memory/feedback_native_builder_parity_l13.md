---
name: feedback-native-builder-parity-l13
description: "Owner ruling L13/LI-11 (2026-06-11) — native scenario builder parity is mandatory for COA/Location-Intelligence; one planning model, global source.type taxonomy"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e14a492b-eb87-4f0e-9ccf-18500bc3ff4f
---

Owner ruling (2026-06-11), recorded as **L13** in `docs/coa-wargame-design.md` §0/§0.5 and
**LI-11** in `docs/location-intelligence-design.md`:

- Every COA/planning capability must work from BOTH paths: (A) upload/import (MDMP docs,
  external JSON) and (B) the RMOOZ in-app native scenario builder (user-created AO, objectives,
  BLUE/RED units, assigned/requested locations, manual incident notes / مجرى الحوادث, "ask AI
  for COAs" with no document).
- Both paths converge into the SAME Operational Brief / Planning Model BEFORE any AI step.
  **No separate upload-only AI logic, ever** — no module may branch on "was uploaded".
- Every planning object carries `source: { type }` from the global taxonomy:
  `uploaded_doc · external_json · mdmp_adapter · manual_app_entry · map_click · location_db ·
  incident_log · llm_candidate · doctrine_rule`. Composes with (never replaces) the L6
  invariants (needs_review/confidence/citations). Operator-authored (`manual_app_entry`,
  `map_click`) = declared data, confidence high, no review gate; LLM output stays
  needs_review regardless of path.
- Map click skips resolver stages 1–4 but still passes AO validation (stage 5).

**Why:** the owner is building RMOOZ as one app — commanders must be able to author a scenario
entirely in-app and get COAs without any document; upload is an input adapter, not the system.

**How to apply:** when coding G-2/G-3/G-3A/G-3B+ (COA adapter, review panel, location resolver,
placement panel, tasking), build ONE brief-assembly module shared by both paths; add `source.type`
to every schema; write the 5 owner-mandated tests (uploaded-MDMP COA review · no-upload manual
COA review · resolver-from-document-text · resolver-from-typed-location · tasking consumes
readiness/supply/status when available, honest degrade when null). See [[feedback_ai_sim_boundary_rules]].
