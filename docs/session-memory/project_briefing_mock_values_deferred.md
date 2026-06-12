---
name: project-briefing-mock-values-deferred
description: "oid-value-phase and apc-value-linked-intent show hardcoded \"Briefing\" mock text from i18n.js; replace with dynamic active-phase display values once scenario display is approved"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f293b17-89b6-4b86-a3dc-6beef59be27b
---

`oid-value-phase` and `apc-value-linked-intent` currently render hardcoded "Briefing" mock values sourced from `i18n.js`. These are placeholders, not bugs in the rendering path.

**Current hardcoded mock values (in `i18n.js`):**

- `oid-value-phase` → `"Briefing"` / `"الإحاطة"`
- `apc-value-linked-intent` → `"Operator Intent Draft (Briefing phase)"` / `"مسودة نية المشغّل (مرحلة الإحاطة)"`

**Current render path:**

- `paintIntentCard()` reads `OID_FIELDS` → `oid-value-phase` → `tx()`
- `paintProposalCard()` reads `APC_FIELDS` → `apc-value-linked-intent` → `tx()`

**Future fix (when triggered):**

When safe scenario display data is introduced, replace these static i18n values with dynamic reads using the following mapping:

- `PHASES[currentPhase]` → `oid-value-phase`
- `activeProposal.linkedIntent` → `apc-value-linked-intent`

The data sources (`PHASES` + `currentPhase`, `activeProposal`) come from whichever safe scenario display surface gets approved — likely the `PHASES` array, a read-only scenario state object, or a future display-only `loadScenario(data)` method. Both elements should resolve from the same scenario state so the OID phase value and the APC linked-intent stay consistent with the live scenario.

**Trigger to act:** Scenario data display has been approved for Wargame 1/2/3. Do not introduce this fix before then.

**How to apply now:** Do not swap these to dynamic reads opportunistically — the surrounding wiring isn't there yet, and replacing mock text with a partial read will create a worse failure mode (empty / undefined values in the UI). If a task touches either element, `paintIntentCard()`, `paintProposalCard()`, `OID_FIELDS`, `APC_FIELDS`, or the i18n keys above, surface this dependency rather than spot-fixing.

**PR-48 scope rule:** In PR-48, leave `oid-value-phase` and `apc-value-linked-intent` unchanged. The only exception is if the Decision Preview Summary work directly requires touching them — and even then, do not convert them to dynamic phase reads as part of PR-48. The dynamic-phase change belongs to the later Wargame scenario-display PR.
