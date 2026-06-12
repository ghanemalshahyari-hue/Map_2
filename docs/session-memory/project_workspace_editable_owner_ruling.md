---
name: project_workspace_editable_owner_ruling
description: "Owner (Ghanem) ruled 2026-06-01 to make the live scenario workspace editable, overriding the read-only/locked AI-sim boundary design."
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f50e4da-e782-4f7f-9ff3-a1bce14efef3
---

On 2026-06-01 the app owner (Ghanem) explicitly ruled that the **live scenario workspace should
become editable** — a CMO-style "start the app → build/edit a scenario → fix issues as we proceed"
flow — rather than staying a read-only review surface.

This **overrides** the previously locked read-only design and supersedes the default posture in
[[feedback_ai_sim_boundary_rules]] and [[feedback_event_log_not_chat]] *for the workspace editing
surfaces*. It directly bears on drift **D3** (`APP_INVENTORY.md`): D3 should be re-classified from
"OPEN, needs owner ruling" toward "sanctioned editable path" once the implementation lands.

**Why:** the owner wants the product to support actual scenario authoring/iteration in-app, modeled on
CMO's early tutorial flow, instead of only consuming pre-built scenarios.

**How to apply:**
- Recommended (agreed default unless owner says otherwise): make cards edit a **working copy** with
  change-tracking; keep the **commit/journal step as the explicit gate** so the audit trail survives.
  "Editable" ≠ "silent live mutation."
- Do NOT also remove the commit/journal dry-run guard without a *separate* explicit owner decision.
- Event Log stays a tabular ledger ([[feedback_event_log_not_chat]] still holds — that wasn't ruled on).
- Update `APP_INVENTORY.md` Drift D3 + `docs/read-only-surface-audit.md` as the editable path lands.
- Roadmap context lives in `docs/cmo-vs-rmooz-capability-comparison.md` (CMO→RMOOZ TODO).
