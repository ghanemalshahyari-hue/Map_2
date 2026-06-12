# FAST-INT-3 — Home Command Launch Integration for WarGamingGEN Import Flows

**Date:** 2026-06-05
**Status:** ✅ IMPLEMENTED + verified (static test **22/22 PASS**, browser-checked)
**Builds on:** FAST-INT-2 (`wargame-geojson-import.js`) + FAST-DOC-1 (`wargame-sim-import.js`)

## Goal
Surface the two WarGamingGEN import flows on the main **"Begin an operation"** (Command Launch) screen, beside Quick Demo / Start New / Load / Editor / Resume — opening the **existing** import panels without changing scenario state until an explicit import.

---

## Approach — reuse the existing intent architecture (no new importer)
The home screen already routes every action through `data-intent` → `home.js go(intent)` → `app.html?launch=<intent>` → `native-scenario-loader.js handleLaunchIntent()`. FAST-INT-3 adds two intents into that same pipe and a **reveal-only** handler. No importer logic is duplicated; the FAST-INT-2/FAST-DOC-1 cards remain the single, explicit import trigger.

```
Home button (data-intent) ──▶ app.html?launch=import-geojson | import-docx
                                       │
        native-scenario-loader.js · revealImportCard(cardId)
                                       │  (NO load, NO convert, NO mutation)
           AppToolRail.switchTool('scenario-workspace')  +  card.scrollIntoView()
                                       │
        existing card (#wg-geojson-import-card | #wg-sim-import-card) ← user clicks Import here
```

## Changes (UI only — 3 files)
1. **`UI_MOdified/client/home.html`** — two new `.hub-btn` buttons in the Command Launch action group:
   - **Import WarGamingGEN GeoJSON** — *"Load generated GeoJSON phases into RMOOZ."* (`data-intent="import-geojson"`)
   - **DOCX Simulation Import** — *"Stage Red/Blue force documents and import generated results."* (`data-intent="import-docx"`)
   The original five entries are unchanged.
2. **`UI_MOdified/client/home.js`** — EN + AR i18n strings (`hub-import-geojson(-sub)`, `hub-import-docx(-sub)`). No wiring change — `wire()` already routes unknown intents through `go(intent)`.
3. **`UI_MOdified/client/shell/native-scenario-loader.js`** — `revealImportCard(cardId, label)` helper + dispatch:
   - `import-geojson` → reveal `#wg-geojson-import-card`
   - `import-docx` → reveal `#wg-sim-import-card`
   Reveal = open the scenario-workspace panel via `AppToolRail.switchTool` + `scrollIntoView` + a brief self-clearing highlight. It **never** calls `loadLiveScenarioFromJson`, the porter, or `/api/scenario/import`.

## Verification
- **Static test** `node test-fast-int-3-home-launch-integration.js` → **22/22 PASS**: both buttons present with i18n label+subtitle inside the launch group; the original five kept; EN+AR i18n strings defined; reveal dispatch maps to the correct card IDs; `revealImportCard` body proven to contain **no** `loadLiveScenarioFromJson` / no importer call (no mutation, no duplicate import).
- **Browser** (preview): home shows **7 launch buttons** (5 + 2). `?launch=import-geojson` → workspace panel revealed, `#wg-geojson-import-card` present, **`window.RmoozScenario` = none (no mutation)**. `?launch=import-docx` → panel revealed, `#wg-sim-import-card` ("WarGamingGEN DOCX Simulation Import") present, no mutation. **Zero console errors.**

## Guardrails honored
❌ no rebuild of `port-wargame.js` / DOCX bridge · ❌ no DOCX parsing in browser · ❌ no auto-simulation · ❌ no LLM · ❌ **no `window.RmoozScenario` mutation on button click** · ❌ no hardcoded scenario data · ❌ no Step0 · ✅ Quick Demo / Start New / Load / Editor / Resume all retained · ✅ reuses the FAST-INT-2 + FAST-DOC-1 modules unchanged.

## Manual test
1. Open `/home.html` → see **Import WarGamingGEN GeoJSON** and **DOCX Simulation Import** beneath Resume Last Session.
2. Click **Import WarGamingGEN GeoJSON** → app opens, Scenario Workspace reveals, the GeoJSON import card scrolls into view + highlights. No scenario loads yet.
3. Use the card's own file picker + Import (FAST-INT-2 flow) to actually import.
4. Back to `/home.html` → click **DOCX Simulation Import** → the DOCX Simulation panel is revealed (FAST-DOC-1 flow). No scenario change until you explicitly import.

## Acceptance
✅ Both WarGamingGEN import flows are visible from the main "Begin an operation" screen and open the existing safe import panels **without changing scenario state until explicit import**. Verified: static **22/22 PASS** + browser (panels revealed, `RmoozScenario` unchanged, no console errors).
