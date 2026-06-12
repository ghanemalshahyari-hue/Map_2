# Read-Only Surface Audit (RMOOZ)

_Generated 2026-05-30. Classifies every read-only / preview-only / not-wired surface
in the client + server so we can tell **deliberate safety** apart from **unfinished wiring**._

## The principle (answer to "should all read-only become production?")

**No.** In RMOOZ, "read-only" is two completely different things:

- **A — Read-only *by design*:** the read-only-ness IS the feature (a locked safety boundary).
  Converting these to "production" mutation would dismantle the safety model. **Keep them.**
- **B — Read-only *because it's not wired yet*:** the data exists but never reaches its
  destination. These are genuine gaps — wire them up, but **still read-only**, behind the
  `preview → operator-review → controlled-apply` boundary.
- **C — Already wired.**

The checklist we were missing is not "convert all read-only → production." It's this A/B/C tag.

---

## A — Keep read-only (safety IS the feature)

### The AI/Sim boundary — LOCKED after PR-12 (do not reopen without architecture review)
| Rule | Where | What it guarantees |
|---|---|---|
| **R1 — no state without commit** | `server/sim/journal.js` (`appendCommit`) + `adjudicator-agent.js` (`commitStep`) | The append-only JSONL journal is the *only* durable state writer; `commitStep` is the only caller; `/api/sim/commit` is the only HTTP surface. |
| **R2 — no commit without intent** | `adjudicator-schema.js` `validateCommitRequest` | Every commit needs `operator_id` (UI) **or** `headless.reason` (mc-trial/legacy). Full attribution. |
| **R3 — AI emits proposals, never state** | `adjudicator-agent.js` `proposeStep` / `wrapAsProposal` + `sim/proposal-store.js` | `/api/sim/propose` returns `projected_state` only; proposals are ephemeral (15-min TTL, single-use). `propose` is the dry-run — no `dry_run` flag needed because it never mutates. |

**These stay read-only permanently.** Forcing them to "production" = removing the safety gates.

### Client read-only surfaces that are safety by design (keep)
- **Scenario Workspace = "review surface, not an editor"** (`app.html` ~§943–950, the `Read-only workspace. Scenario mutation is disabled.` strip) and its passive accessor (`getScenario`/`getActiveStep`, never writes).
- **~35 snapshot/preview cards** (Objective, BLS, Force Balance, Red/Blue Force, Red Attrition, Engagement Tempo, Unit Composition, Step Summary/Narrative/Effects, Decision Point, Briefing, Metadata). All `textContent`-only, no mutation.
- **Decision Package preview** — `normaliseDecisionPackage` rejects anything not `read_only:true && no_auto_adjudication:true`. (Converting a DP into a *separate* live scenario is fine — that's PR-242, and it doesn't touch the preview.)
- **Event Log** — append-only SYSTEM/UI/OPERATOR ledger; AI-adjudication events are NOT written here.
- **Boundary Audit panel**, **commit bridge (dry-run only)**, **journal-draft preview (no export/download)**, **timeline UI placeholder** — all mirrors/placeholders by design.

---

## B — Genuine gaps (wire up, but keep read-only)

### B1 — Data exists, no UI yet → the real "to-do" list (safe, high value)
These are fully computed/persisted but never surfaced. Each is a **read-only display** to add — no safety work required.

| Gap | Where the data is | Wire-up (read-only) |
|---|---|---|
| **AI feedback summary** | `GET /api/ai/feedback/summary` (works) | Add a HUD widget that calls it with `?scenario=&posture=&reserve_hr=` and shows accept/reject counts. |
| **AAR lessons** | `GET /api/ai/lessons` (works) | List/append form widget; server already folds lessons into priors. |
| **Red-team / Blue-team proposals** | `POST /api/ai/red-team/propose`, `/blue-team/propose` (generate, return plans) | Display the returned plans; route an *approved* one through the existing propose→review→commit path (no new commit surface). |
| **Monte-Carlo comparison report** | `GET /api/ai/report.json` / `report.html` (built from mc-runs) | Surface baseline vs live-AI vs MC distribution in-HUD. |
| **Full live step-status grid** | per-step status derivable from Event Log decision records | `paintLiveStepStatusGrid()` reading `scenario.steps` + Event Log; cells display-only (active-step status already shown). |
| **Decision-Package → scenario** | ✅ shipped (PR-242 converter) | *(done — see C)* |
| **BLS Snapshot card click-to-select** | card is `textContent`-only; map BLS markers exist | Optional: emit `rmooz:unit-selected` from a card row. **Low priority / arguably intentional** (PR-62 read-only spec) — confirm before adding. |

### B2 — Deliberately gated behind Gate-7 / PR-189+ (NOT casual gaps — do not wire without the safety work)
These are read-only *on purpose, for now*. They flip only when the real-commit safety work lands.
- **Real commit path** — `backendCommitPlanned` hard-locked `false`; `/api/sim/commit` exists server-side but the client never calls it.
- **Real journal write + download** — `journal-contract.js` `ALLOWED_MODES` gate closed; download guard locked at construction.
- **`expectedResult` ↔ committed result linkage**, **`window.units` live overlay sync** — explicitly "not wired yet" pending Gate 7.

> Treat B2 as the **roadmap**, not loose ends. Wiring them early would breach the PR-12 boundary.

---

## C — Already wired / done (summary)
- **Map drawing**: BLS, OBJ, pipeline, red + blue unit markers, off-map markers, AO boundaries, EW halo, engagement arcs — all rendered by `adjudicator-map.js drawScenario`/`applyState`.
- **Scenario-marker selection**: red **and** blue scenario markers emit `rmooz:unit-selected` on click (`adjudicator-map.js:1460,1527`). → **The "scenario marker selection deferred" memory note is STALE — this is done.**
- **Import paths**: HUD GeoJSON import draws + persists; Workspace live import draws via PR-288M (`maybeDrawLiveScenarioOnMap`); **Decision Package → scenario → map via PR-242**.
- **Server**: all GET/preview routes, scenario loader+validator, COA generator, Monte-Carlo runner (+SSE), learning store (priors from feedback/lessons), proposal store, journal replay.

---

## Recommended priority for B1
1. **MC comparison report widget** + **AI feedback summary widget** — highest insight-per-effort; data is already there.
2. **AAR lessons** panel — closes the learning loop visibly.
3. **Full step-status grid** — operator situational awareness across all steps.
4. **Red/Blue-team proposal display** — only the *display* (routing to commit stays behind the existing review path).
5. BLS card click-to-select — only if desired (it may be intentionally read-only).

_All B1 items are read-only displays — none require touching the locked AI/Sim boundary._
