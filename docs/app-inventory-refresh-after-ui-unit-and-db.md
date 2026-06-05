# APP_INVENTORY Refresh — Post UI-Unit + DB Wave
**Audit run:** 2026-06-05  
**HEAD at audit:** `f43fd97` (branch `claude/reverent-shirley-1d92fa`, based on `main`)  
**Prior AUDIT_SHA:** `90dc412` (Wave 5, 2026-06-03)  
**Commits since prior audit (on main):** ~18 (Phases 4A–5D)

---

## 1. Smoke Test

| Check | Result |
|---|---|
| Server port :8000 | ✅ Already running (from prior session) |
| `GET /app.html` | ✅ 200 |
| `GET /api/auth/me` | ✅ 401 (expected — no auth stub; server mode) |
| `GET /api/ai/scenarios` | ✅ 200 — `{active:"wargame3", scenarios:["coastal-shield-training-v1","dp-test-001","dp-test-002","dp-test-003","wargame3"]}` |
| Static test `test-pr-289L.js` | ✅ **80/80 PASS** |

Server boots, scenario loader works, coastal-shield scenario present.

---

## 2. CRITICAL FINDING — Last Session Branch Not Merged

> **The Commander Unit Status Panel, unit-status-panel.js, applied-state.js, and all Phase 6 work exist on `claude/busy-ritchie-e5c133` only — NOT on `main` and NOT in this worktree.**

The last session (2026-06-04, branch `busy-ritchie-e5c133`) produced:

| Commit | Feature | Status in this worktree |
|---|---|---|
| `ee6b209` | `feat(ui-unit-1-a): static read-only commander unit status panel` | ❌ NOT merged |
| `7b8760e` | `feat(phase-6f-a): in-memory applied-state overlay module` | ❌ NOT merged |
| `4db8139` | `fix(phase-6f-a1): readiness enum alignment` | ❌ NOT merged |
| `2a81ccd` | `fix(event-log): Add STATE category to allowed categories` | ❌ NOT merged |
| `ef6f0f8` | `feat(ui-unit-1-b): commander unit status panel section refinement` | ❌ NOT merged |
| `6394728` | `feat(db-1-b): middle east platform catalog expansion` | ❌ NOT merged |
| `d13476a` | `Fix unit-status-panel section overlapping - add explicit section styling` | ❌ NOT merged |

**Impact on this audit's focus areas:**

| Focus Area | Finding |
|---|---|
| Commander Unit Status Panel files | Does NOT exist on main. Panel is `unit-panel.js` → `#unit-panel` |
| `unit-status-panel.js` | Does NOT exist anywhere in this worktree |
| `applied-state.js` | Does NOT exist — only on unmerged branch |
| `middle-east-platform-loader.js` | Does NOT exist — only on unmerged branch |
| `platforms.json` | Does NOT exist — only on unmerged branch |
| Event-log STATE category | NOT added — only on unmerged branch. Current: SYSTEM/OPERATOR/UI only |
| Right panel layout fixes | ✅ CSS changes from busy-ritchie ARE on main (45d3666/171b728/d13476a) — these landed on main via the merge |

**Action required before UI-Unit-1-C:** merge `claude/busy-ritchie-e5c133` → `main` (or verify it was merged and re-check).

---

## 3. Focus Area Results

### 3.1 Commander Unit Status Panel / unit-status-panel.js
- **unit-status-panel.js:** Does NOT exist in `UI_MOdified/client/shell/` or anywhere in client.
- **What exists:** `shell/unit-panel.js` (460 L) — the "Selected Unit Panel", fully wired.
- **HTML element:** `#unit-panel` in `app.html:3445` — `<aside class="unit-panel unit-panel--empty" hidden>`
- **Load order in app.html:** `shell/unit-panel.js?v=1` at line 4841
- **Public API:** `window.AppShellUnitPanel` — `{ renderEmpty, renderUnit, getCurrentUnit }`
- **Sections (6):** Identity · Composition & Role · Symbol Profile · Current Step Status · Capability Profile · Position
- **Conclusion:** If the user's goal was to verify the "Commander Unit Status Panel" from last session, it has NOT landed on main yet.

### 3.2 unit-status-panel.js Integration
- File does not exist. No reference to `unit-status-panel` anywhere in `app.html` or `app.js`.
- The existing selected-unit panel is `unit-panel.js` and functions correctly for unit display.

### 3.3 app.html Panel Markup and CSS

**Right panel (#unit-panel) — confirmed wired:**
- Location: `app.html:3445`
- CSS (style.css): `.unit-panel { overflow: hidden; flex-direction: column }` + `.unit-panel-body { flex: 1 1 auto; overflow-y: auto }` + `.unit-panel-header { flex-shrink: 0 }`
- All flex-containment rules confirmed present.

**Left sidebar (#wargame-panel) — confirmed wired:**
- Location: `app.html:835`
- Part of `.context-panel` which has `overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable`
- Workspace root has `min-height: 0` (critical flex fix, `style.css:151`)

### 3.4 Right Panel Layout Containment Fixes (from last session)
These CSS additions from `claude/busy-ritchie-e5c133` **DID land on main** (4 commits):
- `45d3666` — `.unit-panel` + `.panel-body` overflow-x:hidden + box-sizing:border-box + `.unit-panel-header` flex-shrink:0
- `171b728` + `d13476a` — `.panel-body` min-height:0; `.panel-section` display:block; explicit section CSS
- `8a6c495` — `.wargame-panel` overflow-y:auto + min-height:0; `.wargame-brief-card` flex-shrink:0; `#drawing-panel` flex rules

**Confirmed:** all 4 layout-fix commits are present in `app.html` and `style.css` in this worktree.

### 3.5 Left Sidebar / Wargame Panel Overlap Fixes
✅ Confirmed present:
- `style.css:225` — `.context-panel { overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable }`
- `style.css:151` — `.workspace { min-height: 0 }` (critical containment)
- `UI_MOdified/client/style.css` — `.wargame-panel` flex rules intact

### 3.6 event-log.js Category Boundary
Current ALLOWED_CATEGORIES in `shell/event-log.js:61-64`:
```javascript
const ALLOWED_CATEGORIES = new Set([
    CATEGORY.SYSTEM,
    CATEGORY.OPERATOR,
    CATEGORY.UI,
]);
```
**3 categories only.** The `STATE` category fix from `fix(event-log): Add STATE category` on `busy-ritchie` has NOT been merged. If any code appends with `CATEGORY.STATE`, it will throw/silently fail on this branch.

### 3.7 applied-state.js Module
- **Does NOT exist** in this worktree.
- `window.AppAppliedState` is not defined anywhere.
- The in-memory applied-state overlay is only on `claude/busy-ritchie-e5c133`.

### 3.8 middle-east-platform-loader.js
- **Does NOT exist** in this worktree.
- No `platforms.json` or `middle-east-platforms.json` found.
- **What exists:** `shell/world-state-db.js` — the CAPABILITY_CATALOG with 10 entries:
  - 5 generic role-based (air_defense, naval_combatant, ground_maneuver, air_unit, ew_site, generic)
  - 4 Soviet-era platforms added by Phase 5D-1: `sam_s300`, `sam_s75`, `aaa_zsu`/`aaa_23mm`, `radar_p37`

### 3.9 platforms.json DB Catalog Load Path
- **Does NOT exist** as a separate file.
- Platform data is embedded in `shell/world-state-db.js` as `CAPABILITY_CATALOG` (10 entries).
- `AppWorldStateDB.enrichUnit(unit)` is the single entry point.
- `classifyKind()` does role/domain regex matching → resolves to a catalog key.

### 3.10 Unit Selection Event Flow — End-to-End Verified
```
MAP UNIT CLICK
  └─ adjudicator-map.js:2118-2126 (RED markers)
  └─ adjudicator-map.js:2189-2195 (BLUE markers)
  └─ units-map.js:357-362 (placed units, planning mode)
       │
       ▼ document.dispatchEvent(new CustomEvent('rmooz:unit-selected', { detail: { unit, selectedAt } }))
       │
       ├─► shell/unit-panel.js:427 — renderUnit(u, at) → shows #unit-panel, populates 6 sections
       └─► shell/event-log.js:342 — append({ severity:NOTICE, category:OPERATOR, … })
```
✅ **Flow is intact and complete.** No second listener opens a parallel panel.

### 3.11 Stale References in APP_INVENTORY
The current inventory (Wave 5, `90dc412`) is missing 6 shell modules and 1 wargame module that have since been committed. See section 4 below.

### 3.12 Duplicate Panel Systems / Conflicting Unit Panel Files
- **No duplicates** for selected-unit display. Only `unit-panel.js` + `#unit-panel`.
- **Stray `wargame 6/` directory:** Still present at `UI_MOdified/client/wargame 6/` with 6 dead file copies (adjudicator-client, adjudicator-hud, adjudicator-map, approved-actions, red-team-controller, scenario-state). NOT referenced in `app.html` or `app.js`. **Delete candidate** (per APP_INVENTORY duplication #6).

---

## 4. New Modules Found (Not in APP_INVENTORY)

These files are loaded in `app.html` but have no row in `APP_INVENTORY.md`:

| Module | Lines | app.html line | Export | Status | Notes |
|---|---|---|---|---|---|
| `shell/action-feasibility.js` | 329 | 4819 | (none) | ✅ | L3-A "Why-Not" feasibility evaluator — ENGAGE action only; reads WS/DET1/ENG1; pure, no DOM, no mutation. Part of L3 decision-support ladder. |
| `shell/why-not-panel.js` | 128 | 4845 | `window.AppShellWhyNotPanel` | ✅ | L3-B read-only UI: renders action feasibility results from action-feasibility.js into a panel card. |
| `shell/native-scenario-loader.js` | 90 | 4984 | `window.AppNativeScenarioLoader` | ✅ | Loads W3 scenario JSON from native/browser sources. |
| `shell/workspace-consolidation.js` | 86 | 4987 | `window.AppWorkspaceConsolidation` | ✅ | Consolidates multi-source scenario state for workspace display. |
| `shell/objectives-editor-step.js` | 297 | 4993 | (none) | ⏸️ | Scenario objective editor UI — deferred/incomplete. |
| `wargame/coverage-summary.js` | 200 | 4823 | `window.AppCoverageSummary` | ✅ | **Phase 5C** — Read-only air-defense coverage summary panel: groups units by SAM/AAA/Radar; `gatherCoverageData(scenario)` + `renderPanel(scenario)`. |

---

## 5. Drift Items — Confirmed Status

| # | Status | Finding |
|---|---|---|
| D1 | ✅ RESOLVED | Confirmed: `adjudicator-map.js:2118/2189` dispatches `rmooz:unit-selected`; consumed by `unit-panel.js:427`. |
| D2 | ✅ RESOLVED | Confirmed: full per-step `applyState()` BLS/breach/attrition wiring at ~:4608. |
| D3 | ✅ RESOLVED | Confirmed: `POST /api/sim/commit` live + durable journal. Owner-unlocked 2026-06-01. |
| D4 | ✅ RESOLVED | OBJ-A test `test-obj-a.js` 33/33 green after DOCTRINE-A whitelist widening. |

No new drift items found on main. The `applied-state.js` / `unit-status-panel.js` / `STATE` category items are on an **unmerged branch**, not drift.

---

## 6. Summary: What Needs to Happen Before UI-Unit-1-C

| Priority | Action | Reason |
|---|---|---|
| 🔴 BLOCKER | Merge `claude/busy-ritchie-e5c133` → `main` | Commander Unit Status Panel, unit-status-panel.js, applied-state.js, event-log STATE category, and Phase 6F-A work are all on this branch only |
| 🟡 INVENTORY | Add 6 new rows to APP_INVENTORY.md (see §4) | action-feasibility, why-not-panel, native-scenario-loader, workspace-consolidation, objectives-editor-step, coverage-summary |
| 🟡 INVENTORY | Update `world-state-db.js` row | Now 10 CAPABILITY_CATALOG entries (+4 Soviet platforms Phase 5D-1) |
| 🟢 DONE | AUDIT_SHA re-stamped to `f43fd97` | Freshness clock reset |
| 🟢 CLEAN | `wargame 6/` stray dir still present | Delete when convenient (no urgency; not referenced) |

---

## 7. Top Opportunities (Developer's-Eye View)

1. **Merge the last session's branch** — The commander panel, applied-state, and event-log STATE work are all built and tested. The only missing step is the merge.
2. **`unit-status-panel.js` naming clarification** — The new panel from busy-ritchie is called `unit-status-panel.js` but the existing selected-unit panel in main is `unit-panel.js`. After merge, both will exist and listen to the same event — verify they don't conflict.
3. **`wargame 6/` cleanup** — 6 dead copies, mtime still recent (touched by merge). One `rm -rf` to clean.
4. **`shell/objectives-editor-step.js` gap** — 297 lines, loaded in app.html, but deferred/incomplete. No window export, no consumer. Mark ⏸️ clearly in inventory.
5. **CAPABILITY_CATALOG enrichment** — Phase 5D-1 added 4 Soviet platforms. Middle East catalog expansion (from busy-ritchie) adds regional specificity. After merge, CAPABILITY_CATALOG will grow further.

---

*Generated by /audit-app · HEAD `f43fd97` · 2026-06-05*
