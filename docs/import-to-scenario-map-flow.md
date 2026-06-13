# Import to Scenario Map Flow Audit

Date: 2026-06-13
Scope: Audit-only flow map (no feature changes)

## 1) Scope, constraints, and method
- This audit traces the live import flow from UI entry points to map drawing, then reviews symbol and Free Fight side paths.
- No code changes were made for this report.
- Inputs used:
  - Direct code reading across client/server modules.
  - Graphify artifacts under graphify-out/ for topology context.
  - Git ancestry checks for pushed/local-only status.

## 2) Primary entry points (what starts import)
- Timeline strip Import button:
  - UI node: `client/app.html` -> `#tl-import-scenario` (label: `Import · استيراد`).
  - Handler: `client/shell/timeline.js::bindScenarioControls()` -> `AppNativeScenarioLoader.openImportScenario()`.
- Launch intent path (from home/launcher):
  - `client/shell/native-scenario-loader.js::handleLaunchIntent()`
  - `launch=import-docx` -> `openImportCardModal('wg-wizard-card', 'Import Scenario')`.
- Operational Scenario Generate button (same path reuse):
  - `client/shell/native-scenario-loader.js::bindOperationalScenarioGenerate()` -> `openImportScenario()`.

## 3) Ingestion variants map (JSON/XLSX/paste/DOCX/PDF)
- DOCX (connected to full analyze->generate->import flow):
  - Wizard file inputs accept `.docx` only in `client/shell/scenario-import-wizard.js`.
  - Staging endpoint enforces DOCX ZIP signature in `server/wargame-sim-bridge.js` (`/api/wargame-sim/stage-doc`).
- JSON (connected in multiple places):
  - Live scenario JSON import to workspace in `client/shell/scenario-workspace.js::initLiveScenarioImport()`.
  - Folder scan/import for JSON candidates in `client/shell/scenario-workspace.js` (`classifyScenarioFolderFile`, `scanScenarioFolderFiles`, `importSelectedFolderScenarioJson`).
  - MDMP JSON/JSONC bundle path in wizard -> `/api/wargame-sim/analyze` with `{ bundle:[...] }`.
  - Coalition pasted JSON path in wizard -> `/api/wargame-sim/analyze` with `{ countries:[...] }`.
- XLSX (connected to analyze/review path):
  - Coalition workbook selector in `client/shell/scenario-import-wizard.js` (base64 upload field `workbook_base64`).
  - Parsed server-side by `server/ai/xlsx-text.js`, adapted via `server/ai/multi-country-orbat.js` through `/api/wargame-sim/analyze`.
- DOC (legacy/non-docx) and PDF:
  - Not wired into the main import wizard pipeline.
  - Scenario folder catalog classifies `.pdf/.docx/.rtf/.txt` as unsupported briefing files for live scenario import (`client/shell/scenario-workspace.js` comments and classifier sets).
  - Net: DOC/PDF are currently non-authoritative for live scenario import-to-map path.

## 4) Analyze API path (server-side decision tree)
- Endpoint: `POST/GET /api/wargame-sim/analyze` in `server/wargame-sim-bridge.js`.
- Branches:
  - Empty body (or GET): analyze staged DOCX via `BRIEF.analyzeDocuments(inputs)`.
  - `bundle:[...]`: MDMP external adapter path (`MDMP_ADAPTER.adaptMdmpBundle`).
  - `workbook_base64`: XLSX extraction + multi-country Step 1 ORBAT builder.
  - Classified JSON input via `BRIEF.classifyJsonInput()`:
    - `rmooz_scenario`
    - `operational_brief`
    - `mdmp_external`
    - `multi_country_step1`
    - fallback `unknown` (best-effort brief mapping)
- Output for review path consistently includes `brief` + `understanding` envelope.

## 5) Review UI path (what is rendered, and when)
- Analyze call from wizard:
  - `client/shell/scenario-import-wizard.js::runAnalyze()` -> `POST /api/wargame-sim/analyze`.
- Placement enrichment call:
  - `attachPlacement()` -> `POST /api/wargame-sim/placement` with `includeTerrain:true` (best-effort, non-blocking).
- Shared renderer:
  - `renderReview()` -> `window.RmoozDocReview.render(...)` in `client/shell/doc-understanding-review.js`.
- Section visibility and behavior highlights:
  - Import Summary card uses side-split unit counts (`friendly_units`, `enemy_units`, `unknown_units`).
  - Placement candidates panel mounts when candidates exist via `window.RmoozPlacementPanel.hasCandidates(...)`.
  - Free Fight button visibility uses `canShowFreeFight(p)` (units + anchor/base source, no objective gate).

## 6) Generate/publish/import/open scenario path
- Generate from reviewed payload:
  - `client/shell/scenario-import-wizard.js::generateFromReviewedBrief()` -> `POST /api/wargame-sim/generate`.
- Full run path (wizard run mode):
  - `start()` -> `POST /api/wargame-sim/run`.
  - Polling -> `/api/wargame-sim/status`.
  - Success chain in `finishSuccess()`:
    - `POST /api/wargame-sim/publish`
    - `POST /api/wargame-sim/import` (with stale-confirm fallback)
- Partial path:
  - `importPartial()` -> regenerate -> publish -> import partial.
- Final open/load:
  - `openScenario()` fetches `/api/ai/scenario/<name>` then calls `AppShellScenarioWorkspace.loadLiveScenarioFromJson(...)`.

## 7) Scenario workspace to map draw path (and map-not-ready skips)
- Main load function:
  - `client/shell/scenario-workspace.js::loadLiveScenarioFromJson(json, options)`.
  - Validates/normalizes, writes `window.RmoozScenario = { scenario, stepIndex:0 }`, refreshes workspace views.
- Draw bridge:
  - Calls `maybeDrawLiveScenarioOnMap(scenario, options)`.
  - That delegates to `window.AppAdjudicatorMap.drawScenario(scenario)` when available.
- Non-error skip points:
  - `maybeDrawLiveScenarioOnMap()` returns:
    - `map-api-unavailable`
    - `draw-unavailable`
    - `map-not-ready` (drawScenario returned false)
  - `client/wargame/adjudicator-map.js::drawScenario()` explicitly returns false when map is not ready (`!hasMap() || !scenario`).

## 8) Symbol pipeline by surface (current connected path)
- Shared identity resolver:
  - `client/shell/symbol-identity.js::resolve(input)` composes:
    - `unit-intel-normalizer`
    - `symbol-registry`
    - `sidc-preview` (review-only)
- Review/map surfaces that consume resolver/fallback:
  - Free Fight labels/icons: `client/shell/free-fight-demo.js` (`identity()` + `groupGlyph()`).
  - Placement anchor icons: `client/shell/placement-candidates-panel.js` (`mapAnchorIcon()`).
  - Base Status panel per-unit symbol lines: `client/shell/base-status-panel.js` (`bspIdentity(...)`).
- Authoritative runtime symbology remains in map drawing paths:
  - `client/units-map.js`, `client/wargame/adjudicator-map.js` (milsymbol render path).

## 9) Free Fight execution path (demo-only)
- Launch from review:
  - `client/shell/doc-understanding-review.js` button `data-act="free-fight"` -> `window.RmoozFreeFightDemo.mount(p)`.
- Core flow:
  - `client/shell/free-fight-demo.js`
    - Builds groups from anchors via `RmoozDemoUnits.buildGroupsFromAnchors(...)`.
    - Objective set/derive (`setObjective`, `deriveObjective`).
    - Planner mode: deterministic AI-lite or LLM advisory (`requestLlmPlan`).
    - Applies domain-aware route shaping via `domainize()` -> `RmoozDomainMovement.buildDemoRoute(...)`.
- Planner engines:
  - Deterministic planner: `client/shell/free-fight-ai.js`.
  - Domain route helper: `client/shell/domain-movement.js`.
- Invariants in code/comments are explicit: demo/review-only, no final tasking or world-state commit.

## 10) Current mismatch/gaps table (status: pushed/local-only/uncommitted/missing)
| Item | Evidence | Status |
|---|---|---|
| Global symbol identity resolver | commit `7b54a2c` is ancestor of `origin/main` | pushed |
| SIDC preview bridge | commit `b6eb281` is ancestor of `origin/main` | pushed |
| Unit-intel Arabic symbol line | commit `d15cea7` is ancestor of `origin/main` | pushed |
| Free Fight AI-lite planner | commit `c5214b5` is ancestor of `origin/main` | pushed |
| Free Fight LLM advisory mode | commit `7064f76` is ancestor of `origin/main` | pushed |
| Domain-aware movement routing | commit `14ac9dd` not ancestor of `origin/main` | local-only |
| Import Summary / review semantics edits in working tree | `client/shell/doc-understanding-review.js` modified | uncommitted |
| Timeline/import-wizard integration edits in working tree | `client/app.html`, `client/shell/scenario-import-wizard.js` modified | uncommitted |
| DOC/PDF direct import-to-map adapter | no connected path in main wizard/server import chain | missing |
| Graphify precision for this question | graph reports are broad/noisy; query outputs skew to large corpus communities | gap (tooling signal quality) |

## 11) Graphify summary, flow map, and next safest fix
### Graphify summary (for this audit)
- Useful for macro topology size and drift context:
  - app-only report: ~5883 nodes / 11787 edges / 302 communities.
  - full report: very large mixed corpus (~38978 nodes / 78289 edges / 2640 communities).
- Limitation observed for this task:
  - Query precision is diluted by fixture/offline/auxiliary corpus.
  - Direct code reads were required to establish exact runtime path.
- Orphan/parallel module note:
  - Parallel offline variants (for example under `UI_MOdified/Offline_Deployment/offline_app/...`) include similarly named modules (including import wizard/bridge), but are not the primary live app path used here.

### Text flow (canonical runtime path)
1. User presses timeline Import (or launch intent `import-docx`).
2. Native loader opens wizard modal with existing `wg-wizard-card`.
3. Wizard stages DOCX and/or posts JSON/XLSX inputs.
4. Server analyze returns normalized brief + understanding.
5. Wizard enriches with placement candidates.
6. Review UI renders sections and action controls.
7. Generate/run/publish/import endpoints execute.
8. Wizard fetches saved scenario and calls workspace loader.
9. Workspace loader validates, refreshes cards, and asks adjudicator map to draw.
10. If map not ready, draw is safely skipped and can be retried by later refresh/load.

```mermaid
flowchart TD
    A[Timeline Import or launch=import-docx] --> B[native-scenario-loader openImportScenario]
    B --> C[scenario-import-wizard modal]
    C --> D1[POST /api/wargame-sim/analyze]
    D1 --> D2[POST /api/wargame-sim/placement]
    D2 --> E[RmoozDocReview.render]
    E --> F1[POST /api/wargame-sim/generate]
    E --> F2[POST /api/wargame-sim/run]
    F2 --> G[/api/wargame-sim/status poll]
    G --> H[POST /api/wargame-sim/publish]
    H --> I[POST /api/wargame-sim/import]
    I --> J[GET /api/ai/scenario/name]
    J --> K[AppShellScenarioWorkspace.loadLiveScenarioFromJson]
    K --> L[maybeDrawLiveScenarioOnMap]
    L --> M[AppAdjudicatorMap.drawScenario]
    M --> N{Map ready?}
    N -- yes --> O[Scenario drawn]
    N -- no --> P[map-not-ready safe skip]
```

### Next safest fix (audit recommendation only)
- Implement one small "ingestion contract matrix" diagnostic surface in the wizard (read-only):
  - show, per file type, whether it is connected to import-to-map (`connected`, `review-only`, `unsupported`).
  - This addresses current operator ambiguity around DOC/PDF vs DOCX/JSON/XLSX without changing backend behavior.
  - Low risk because it is presentation-only and uses already-known rules from current code paths.
