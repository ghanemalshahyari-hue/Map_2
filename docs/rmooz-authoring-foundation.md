# RMOOZ Authoring Foundation (P0)

Foundation for a future **Scenario Authoring Mode**. P0 ships **pure data/schema utilities only** — no UI, no simulation, no AI, no scenario mutation of live state. It does **not** touch the read-only Review/Playback mode and does **not** lift the locked AI/sim no-mutation boundary.

**Module:** `UI_MOdified/client/shell/scenario-authoring-schema.js`
**Bridge:** `window.AppScenarioAuthoring` (browser console) + `module.exports` (Node tests). Loads cleanly in pure Node.
**Tests:** `test-p0-authoring-foundation.js` (`node test-p0-authoring-foundation.js`) — 33/33 pass.

## Purpose
Operational scenarios will often be missing CMO-style fields. RMOOZ should **detect the gaps** and offer a **standard/default structure** an operator can review and edit later — without ever fabricating combat data.

## Exported functions
| Function | Purpose |
|---|---|
| `buildStandardScenarioAuthoringTemplate(options?)` | Returns a safe standard template with all authoring sections + flags (`authoringMode`, `reviewModeCompatible`, `liveMutationAllowed:false`, `aiCommitAllowed:false`, `operatorEditable:true`). |
| `fillScenarioAuthoringGaps(scenario, options?)` | Returns a **copy** with missing sections added (never mutates input); marks each default `source:"standard_template"`, `confidence:"template"`, `operator_editable:true`, `requires_review:true`; preserves all existing data. |
| `diagnoseScenarioAuthoringGaps(scenario)` | `{ passed, gaps, warnings, summary }` — identifies missing sections with severity. |
| `isScenarioAuthoringDraftSafe(draft)` | `{ safe, violations }` — rejects lua/scripts, executable values, backend URLs, fetch, storage keys, and `autoApply`/`liveMutationAllowed`/`aiCommitAllowed=true`. |
| `AUTHORING_SECTIONS`, `PLACEHOLDERS`, `SCHEMA_VERSION`, `sectionPresent` | Schema descriptor + honest-placeholder constants. |

## Authoring sections (canonical descriptor)
metadata · sides · posture matrix · units · ORBAT · objectives · BLS/reference points · phases/timeline · missions · events · doctrine/ROE/EMCON · unit capability profiles · logistics state · damage/attrition state · detection/contact state · source/confidence/provenance · validation diagnostics.

## Honesty rules (no fabricated data)
Unknown/unmodeled operational fields use explicit placeholders — `unknown`, `not_assigned`, `not_modeled`, `manual_required`, `not_available`. The template **never** invents weapons, ammo, fuel, damage, detection, combat power, or casualties. Doctrine is a **skeleton** (`manual_required`), not invented ROE. Capabilities/logistics/attrition/detection are `not_modeled`.

## Gap diagnostics — example on Wargame 3
```
passed:  false
summary: 9 authoring gap(s) [2 high]: sides, posture, missions, events, doctrine,
         capabilities, logistics, attrition, detection — operator review required.
gaps:    sides(high), posture(high), missions(medium), events(medium), doctrine(medium),
         capabilities(info), logistics(info), attrition(info), detection(info)
```
`fillScenarioAuthoringGaps(wargame3)` → **preserved**: metadata, units, orbat, objectives, bls, phases, provenance · **defaulted**: sides, posture, missions, events, doctrine, capabilities, logistics, attrition, detection, validation · input **not mutated**.

## Where this fits (authoring roadmap)
- **P0 (this)** — schema + standard template + gap-fill + diagnostics + safety guard. *Data/util only.*
- P1 — editable **Sides & Posture** UI.
- P2 — **Doctrine / ROE** editor.
- P3 — **Missions & Events** editor.
- P4 — **Save / Export + "New from template" / "Fill standards"** UX.

Authoring produces/edits scenario **data** (canonical RMOOZ Live Scenario JSON); it then loads into the existing read-only Review/Playback. The AI/sim path stays locked (operator authoring ≠ AI mutation).
