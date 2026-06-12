---
name: feedback-mission-first-outcome-driven
description: "Owner rulings L14–L16 (2026-06-11) — RMOOZ is mission-first/outcome-driven (not upload-first), with a data-fusion model and TACTICA-AI-as-inspiration-only boundary; G-track roadmap renumbered (G-3A unification, G-3B location resolver)."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 57bd7aa2-bef0-4563-a87e-91d645068017
---

Owner rulings added 2026-06-11 to `docs/coa-wargame-design.md` (v3, §0 register + §0.6):

**L14 — Mission-first / outcome-driven, NOT upload-first.** A session starts from a desired outcome (السيطرة على هدف · اختبار عملية إبرار · حماية قاعدة · منع تقدم عدو · تقييم رد فعل العدو · مقارنة الأعمال الممكنة → additive `OUTCOME_TYPES` enum), and RMOOZ derives a deterministic **requirements checklist** (AO, objectives, units, locations, incident history, doctrine, readiness/supply, routes/BLS/objective links, COAs, missing-info). Uploads/builder/AI are just ways to FILL the checklist. **RMOOZ is a mission decision-support and wargaming platform, not an AI document importer.**

**L15 — Data fusion model.** Nine source classes (builder, DOCX/PDF, JSON/MDMP, location DB, incident log مجرى الحوادث, doctrine, World State, DB-Lite, commander input) normalize into the ONE planning model; every object carries `source.type` + confidence + citations. Precedence: **operator-declared > reviewed > derived > AI-suggested**; conflicts → `conflicts[]` surfaced for review, never silently resolved. AI = orchestration/reasoning layer, never final authority.

**L16 — tacticalabs.ai / TACTICA AI is public product-direction inspiration ONLY.** No UI, code, asset, schema, or text may be copied from it — ever. Digital-twin direction: the live map + World State projection is the twin, evidence-first (every rendered relationship traces to a derivation or declared source).

**Why:** the owner wants RMOOZ positioned as a decision-support/wargaming platform whose front door is the commander's intent, with documents demoted to one feed among many — and an explicit IP-safety line around the TACTICA inspiration.

**How to apply:** any new G-track feature must hang off the mission/requirements model (§0.6) and the fusion precedence; never add upload-only logic ([[feedback-native-builder-parity-l13]]); never copy from tacticalabs.ai; keep the unchanged core rule — AI suggests → RMOOZ validates → commander approves → WHITE adjudicates → journaled.

**Roadmap (L12 updated):** G-2 ✅ → G-3 ✅ → **G-3A Planning Model Unification ✅ (2026-06-11, commit da11550)** — `server/ai/planning-model.js`: one deterministic model from both front doors (fromOperationalBrief / fromWorldState / mergePlanningModels with precedence + surfaced conflicts; 11-type source taxonomy; 7 outcome checklists; `test-planning-model-g3a.js` 43/43) → **G-3B Location Intelligence Resolver ✅ (2026-06-11, commit f8616c1)** — `server/ai/location-intelligence.js`: deterministic/offline resolver (coord detect, AR-aware gazetteer fixture, ladder explicit>gazetteer>incident>llm-placeholder, incident مجرى الحوادث parser, AO warn-not-block, `enrichPlanningModelLocations` no-mutation; placement candidates are needs_review-only, never final placement; `test-location-intelligence-g3b.js` 43/43) → **G-3C Surfacing ✅ (2026-06-11, commit a9a5c79)** — read-only `POST /api/wargame-sim/placement` (server runs planning-model+location-intelligence over a brief→candidates) + pure-render `client/shell/placement-candidates-panel.js` mounted in `doc-understanding-review.js` (wizard fetches post-analyze, attaches `payload.placement`); `/analyze` contract byte-unchanged; verified in real app (screenshot) → OBJLINK-B ✅ (`ws.derived.unit_objective_links`, 29/29) → G-4 Tasking → G-5 RED/BLUE/WHITE timeline → G-6 Doctrine cards → G-7 Animation → G-8 reality layer.
