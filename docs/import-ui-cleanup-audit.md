# Import UI cleanup audit (IMPORT-UI-CLEANUP-AUDIT-A)

**Audit only — no code changed, nothing committed/pushed.** Method: direct code reading of
`client/shell/scenario-import-wizard.js` (+ server `wargame-sim-bridge.js`, `operational-brief.js`)
and the legacy-flow audit (`docs/import-to-scenario-map-flow.md` /
`docs/import-scenario-legacy-flow-audit.md`).

> **Headline:** the truly-legacy thing is **"Start Scenario Generation" → `/api/wargame-sim/run`
> → WarGamingGEN** (Python sim over a sample `scenario.json`, bypasses review, one-direction
> movement). The **Red/Blue DOCX *inputs* are NOT purely legacy** — the same staged DOCX also
> feeds the new **"Review AI Understanding" → `/analyze` → operational_brief** path. So the safe
> move is **demote/guard the legacy *action*** and **promote the reviewed path**, rather than
> deleting the DOCX inputs outright.

---

## 1. Red/Blue DOCX flow audit

| Question | Finding (file:line) |
|---|---|
| Red DOCX input | `scenario-import-wizard.js:83` `#wg-wz-red` (`.docx`); Blue `:94` `#wg-wz-blue` |
| Handler | `el.red/.blue` `change` → `stageDoc(slot,file)` (~:796) → `POST /api/wargame-sim/stage-doc?slot=` (`:804`); progress "staging <slot> document" (`:803`) |
| DOCX actually parsed? | **Not in the browser.** Parsed only by **Python** `WarGamingGEN/src/parsers/docx_parser.parse_docx_oob()` during `/run`; **or** by the dependency-free `server/ai/docx-text.js` when **Review AI Understanding** calls `/analyze` |
| Goes to `/analyze`? | **Only via the "Review AI Understanding" button** (`runAnalyze`, `:426`, empty body → server reads staged DOCX). **Start Scenario Generation does NOT** call `/analyze` |
| Creates `operational_brief`? | Yes — but only through the **Review** path (`/analyze`). The **Start** path does not |
| Uses old hardcoded/sample JSON? | **Yes** — Start → `/run` → WarGamingGEN loads `inputs/scenario.json` (auto-written **canonical 17-phase Libya sample**, SCENARIO-AUTOGEN-1) |
| Bypasses Review AI Understanding? | **Yes** — Start → run → generate → import → open, no review |
| Opens scenario workspace directly? | Yes — `finishSuccess`→`/import`→`openScenario`→`AppShellScenarioWorkspace.loadLiveScenarioFromJson` (`:1232`) |
| Causes one-direction movement? | Yes — the generated scenario's **phase-by-phase playback** (WarGamingGEN orchestrator → geojson). Separate from Free Fight; ignores `domain-movement.js` |

**Answers**
- **Is this flow legacy?** The **action** *Start Scenario Generation* (→`/run`/WarGamingGEN) is legacy. The **DOCX inputs themselves are dual-use** (also feed the new `/analyze`/Review path).
- **Still needed?** The WarGamingGEN generator is the only path today that produces a *full playable scenario with a timeline*; the reviewed path currently stops at the **brief/draft** (`/generate` draft), not a full timeline. So **keep it available** until the reviewed pipeline can generate a full workspace scenario.
- **What breaks if we *hide* the DOCX cards from the main UI?** You also lose **DOCX → Review AI Understanding** (a valid reviewed input for the Arabic أمر إنذاري). Mitigation: keep DOCX behind a collapsed "Legacy DOCX import" section rather than deleting.
- **What breaks if we *remove* the code later?** `Start Scenario Generation`, the WarGamingGEN spawn, `stage-doc`, `objective-override`, the Libya `scenario.json` seed, and `openScenario` import would all need removal together; any operator relying on offline WarGamingGEN generation loses it. **Do not remove yet.**

## 2. Better import path audit

All "better path" inputs **already exist** in the production wizard:
- **External MDMP JSON** — `#wg-wz-mdmp` (`.json/.jsonc`, multiple, `:312`) → `runAnalyze` sends `{bundle: mdmpFiles}` to `/analyze` (`:432`).
- **Coalition workbook (Excel)** — `#wg-wz-coalition-xlsx` (`.xlsx`, `:364`) → base64 → `/analyze {workbook_base64,filename}` (`:537`).
- **Paste multi-country JSON** — paste `<details>` (`:368`) → `/analyze {countries:[…]}` (`:538`).
- **Review AI Understanding** — `#wg-wz-analyze` (`:284`) → `runAnalyze` → `/analyze` → `renderReview` (doc-understanding-review).
- Then server `operational-brief.js` builds `operational_brief` (+ `placement_candidates`, `proposed_units`); client review wires `unit-intel-normalizer` → `symbol-identity` → `sidc-preview`; Free Fight uses `demo-units` → `free-fight-ai` → `domain-movement`.

**Answers**
- **Best source of truth today:** the **reviewed `operational_brief`** produced by `/api/wargame-sim/analyze` (from MDMP-JSON / Coalition-XLSX / paste-JSON / DOCX). It is side-separated, review-gated, and feeds the new symbol + Free-Fight + domain-aware stack.
- **Which should be the main import path:** **Coalition XLSX / multi-country JSON (and MDMP-JSON) → Review AI Understanding.** (DOCX stays as a secondary reviewed input.)
- **Which button after selecting a file:** **"Review AI Understanding"** — not "Start Scenario Generation."

## 3. Objective X duplication audit

| | A. Scenario Setup picker (Import modal) | B. Free Fight / review Objective X |
|---|---|---|
| File / function | `scenario-import-wizard.js` `initObjectiveMap` (`:856`), `saveObjective` (`:900`), inputs `#wg-wz-lon/#wg-wz-lat` | `free-fight-demo.js` `setObjective()` / `armPlaceObjective()` |
| Where stored | `POST /api/wargame-sim/objective-override` → WarGamingGEN `inputs/scenario.json` | `window.__rmoozFreeFightObjective` (persisted, reused) |
| Writes `operational_brief.objectives`? | **No** | No |
| Passed to scenario generation? | **Yes** — legacy `/run` (via scenario.json) **and** new `/generate` (`generateFromReviewedBrief` reads `#wg-wz-lon/lat` → `{objective}`, `:479`) | No |
| Passed to Free Fight? | **No** | **Yes** — drives `free-fight-ai` + `domain-movement` |
| Persists/reuses old Objective X? | Persists in scenario.json (server) | Persists in `window.__rmoozFreeFightObjective`; reused on re-mount (`objective_source:'reused_previous'`) |
| Affects old (one-direction) movement? | Yes (it's the WarGamingGEN objective) | No |
| Affects domain-aware movement? | No | **Yes** |

**Answers**
- **Newer/correct:** **B (Free Fight Objective X)** carries the review-only semantics (`source_type:'user_marked_demo_objective'`, `needs_review`, reuse) and drives the new domain-aware demo.
- **Legacy:** **A** is the generation objective (older WarGamingGEN concern) — though it is *also* wired into the new `/generate`, so it is **dual-use**, not pure legacy.
- **One source of truth?** **Yes** — there should be a single Objective X object shared by Review/generate **and** Free Fight.
- **Import-modal objective → optional metadata only?** It should become an **optional input that writes the single shared Objective X** (used by generate when present), not a separate generation-only value.
- **Free Fight Objective X as primary review objective?** **Yes** — make the shared object, and have the Import-modal picker and Free Fight read/write the same state.
- **Sync to the same state?** **Yes** — that is the core fix (one `{lat,lon,source_type,needs_review,exact_position_review_required}` object).

## 4. Recommended UX change (one safe option)

**Promote the reviewed path; demote/guard the legacy action; do not delete DOCX.**
- Re-order the modal so **Coalition XLSX / paste multi-country JSON / MDMP JSON → "Review AI Understanding"** is the **primary** block at the top.
- Move **Red/Blue DOCX** into a **collapsed "Legacy DOCX import (WarGamingGEN)"** `<details>` — kept (DOCX→Review still valid; WarGamingGEN still available), just de-emphasized.
- **"Start Scenario Generation"** → either **relabel "Legacy Demo Import (WarGamingGEN)"** or **disable until "Review AI Understanding" has run** for the current setup.
- **Objective X**: one source of truth shared by Review/generate and Free Fight.

## 5. Safe implementation plan (minimal, for approval — NOT done yet)

1. **Re-order / group the modal (presentation only):** primary reviewed block (XLSX/paste/MDMP + Review AI Understanding) on top; Red/Blue DOCX inside a collapsed "Legacy DOCX import" `<details>`. No handler/endpoint changes.
2. **Make Review AI Understanding the primary button** (visible by default with guidance; keep `Start` secondary). Low risk — both already exist.
3. **Guard Start Scenario Generation:** relabel "Legacy Demo Import (WarGamingGEN)" and/or disable until a review has run this setup (gate on `st.reviewed === true`). No backend change.
4. **(Optional, later) Route Start through the reviewed brief** when one exists — defer until `/generate` yields a full workspace scenario with domain-aware movement.
5. **Merge Objective X to one state object:**
   ```
   { lat, lon, source_type:"user_marked_objective", needs_review:true, exact_position_review_required:true }
   ```
   - the Import-modal picker and Free Fight both read/write this single object;
   - `generateFromReviewedBrief` and `objective-override` read it;
   - Free Fight `setObjective`/reuse reads it. One Objective X everywhere.

All steps are presentation/labels/state-sync — **no deletion, no endpoint changes, no world-state mutation.**

## 6. Tests to propose (before implementation)

1. Red/Blue DOCX still present but **collapsed/marked legacy** (UI assertion).
2. **JSON / XLSX / paste multi-country import still works** → `/analyze` → review renders.
3. **Review AI Understanding still works** (DOCX empty-body + MDMP bundle + coalition).
4. **Objective X selected once appears in BOTH** the Review/generate body and Free Fight (`window.__rmoozFreeFightObjective` and `#wg-wz-lon/lat` reflect the same object).
5. **Start Scenario Generation cannot bypass review** unless explicitly in legacy mode (gate assertion).
6. **No regression in Free Fight / domain-aware movement** (existing 6 suites stay green).
7. **No world-state mutation before review approval** (resolver/demo outputs stay `needs_review`/`demo_only`).

---

## Status of involved modules

| File | Role | Old/New | Recommended action |
|---|---|---|---|
| `scenario-import-wizard.js` Red/Blue DOCX cards | input | dual-use | collapse into "Legacy DOCX import"; keep |
| `scenario-import-wizard.js` `#wg-wz-coalition-xlsx` + paste | input | new | promote to primary |
| `scenario-import-wizard.js` `#wg-wz-mdmp` | input | new | keep (primary group) |
| `#wg-wz-analyze` Review AI Understanding | action | new | **make primary** |
| `#wg-wz-start` Start Scenario Generation → `/run` | action | **legacy** | relabel/guard (no delete) |
| `inputs/scenario.json` (Libya sample) | seed | legacy | keep (required by WarGamingGEN) |
| Objective picker A (Scenario Setup) | objective | dual-use | merge into one shared Objective X |
| Free Fight Objective X (B) | objective | new | make the shared source of truth |
| `domain-movement.js` / `free-fight-*` / `symbol-identity` / `sidc-preview` | reviewed demo | new | unaffected; keep |

**Recommendation:** approve **§5 steps 1–3 + 5** first (presentation + labels + objective sync — lowest risk, non-destructive, reversible). Defer step 4 (routing Start through the brief) until the reviewed pipeline can generate a full timeline scenario. **No code, deletion, commit, or push until you approve.**
