---
name: audit-app
description: Deep-dig + live-test the RMOOZ/CMO app and refresh APP_INVENTORY.md (the app map) plus memory. Use when the session brief says the map is stale, when the user asks to "audit the app", "re-scan", "check what we have/what's duplicated/what's missing", or before planning a big change. Scans every subsystem, runs the server for a smoke test, diffs reality against the recorded inventory, updates statuses + duplications + drift, and re-stamps the audit SHA.
---

# /audit-app — refresh the self-learning app map

This is the "learner" half of the knowledge base. `APP_INVENTORY.md` is the **what**, memory is the
**why**, and this skill keeps both honest. Run it, then the session brief reports "fresh" again.

Goal: end with `APP_INVENTORY.md` matching the real code at the current HEAD, with statuses flipped,
new modules added, new duplications/gaps recorded, drift items (D1, D2, …) re-checked, and the
`AUDIT_SHA` marker re-stamped. Be honest — an inventory that overstates "done" is worse than none.

## Procedure

### 1. Stamp the run
```bash
git rev-parse HEAD          # full SHA -> becomes the new AUDIT_SHA
git rev-parse --short HEAD  # short SHA for the human line
date -u +%Y-%m-%d           # audit date (UTC)
git rev-parse --abbrev-ref HEAD
```
Read the current `APP_INVENTORY.md` (esp. line 1 `<!-- AUDIT_SHA: ... -->` and the Drift section) so
you know the previous baseline and what to re-verify.

### 2. Fan out exploration (parallel)
Launch **Explore** agents (one message, multiple calls) — one per subsystem bucket. Ask each for a
status table: `| Module | Status | Key file | Notes |` with the legend ✅/🟡/🔴/⏸️/♻️/⚠️.
Buckets (match the inventory sections):
- **A** client shell ops — `UI_MOdified/client/shell/*`
- **B** wargame/adjudicator viz — `UI_MOdified/client/wargame/*`
- **C** server AI + sim — `UI_MOdified/server/ai/*`, `server/sim/*`
- **D** cross-cutting client — `map-engine.js`, `units*.js`, `i18n.js`, `chat.js`, `io.js`, `server-sync.js`
- **E** server REST surface + test/verify infra — `server/web-server.js`, root `test-pr-*.js`/`verify-pr-*.js`

Tell each agent to **judge wiring by reading code** (grep `app.js`/`app.html` for init), and to flag
anything that contradicts the current inventory or a memory note.

### 3. Live smoke test (prove it runs, don't just read it)
Reuse the existing verify infra (commands below are already permission-approved):
```bash
lsof -ti:8000 || true                                  # free the port if needed
cd UI_MOdified && node server/web-server.js &          # real server on :8000 (API works)
#   NOTE: the bare web-server.js returns 404 for /app.html. For app/browser checks use the
#   verify stub instead (recreate /tmp/rmooz-verify-server.js if missing): it serves the
#   client AND stubs GET /api/auth/me -> 200.   PORT=8000 node /tmp/rmooz-verify-server.js &
curl -s -o /dev/null -w "app.html: %{http_code}\n" http://localhost:8000/app.html
curl -s -o /dev/null -w "auth/me: %{http_code}\n"  http://localhost:8000/api/auth/me
curl -s http://localhost:8000/api/ai/scenarios | head -c 400
curl -s http://localhost:8000/api/ai/scenario/wargame3 | head -c 400
```
Then run a representative slice of the harnesses (no unified runner exists):
- A few latest static checks: `node test-pr-<latest>.js` (no server needed).
- Optionally one browser check with the server up: `node verify-pr-<latest>.js` (screenshots → `docs/pr-*-verify/`).
- For deeper visual confirmation, prefer the `preview_*` MCP tools / the `/run` skill.

Always stop the server when done: `pkill -f "server/web-server.js"` (or `pkill -f rmooz-verify-server`).
Note `[[reference_browser_verify_static_server]]`: the verify env must stub `GET /api/auth/me` → 200 or
the client redirect-loops.

### 4. Diff reality vs the recorded inventory
For every subsystem:
- Flip statuses that changed; **add rows for new modules**; delete rows for removed files.
- Record **new duplications** (cross-check the authoritative list in `docs/scenario-workspace-consolidation-map.md`).
- Re-check each **Drift item (D1, D2, D3, …)**: is it resolved? If yes, note it; if the locked rule
  still disagrees with code, keep it flagged.
- Don't silently truncate — if you sampled rather than read everything, say so in the report.

### 5. Update `APP_INVENTORY.md`
- Rewrite changed rows and the duplications / gaps sections.
- **Re-stamp** line 1: `<!-- AUDIT_SHA: <new-full-sha> -->` and the human `**Last audited:**` line
  (short SHA · date · "by /audit-app"). This resets the staleness clock the session brief reads.

### 6. Refresh memory (the "why")
- For genuinely new decisions/rationale or newly-deferred work, write/refresh a memory file in the
  format used by the existing notes, and add a one-line pointer to `MEMORY.md`. Link `[[like-this]]`.
- ⚠️ **Do not unilaterally rewrite a locked `feedback_*` rule** (e.g. the AI/sim boundary). If code
  now contradicts it, surface it to the user and get a ruling before editing that memory.

### 7. Report
Give the user a concise summary:
- Status changes (X→Y) and any new modules found.
- New duplications / cleanup candidates.
- Drift items resolved vs still open.
- Top 3–5 "could be better" opportunities (the developer's-eye view).
- New `AUDIT_SHA` so they know the map is fresh.

## Scope notes
- This audit reads broadly and runs a smoke test; it is **read-only on app code** — it edits only
  `APP_INVENTORY.md`, memory files, and (transiently) starts/stops the dev server.
- Don't re-run the big one-time audits already on disk (CSP51, workspace consolidation) — link them.
- Scale effort to the ask: a quick "is the map stale?" check can skip the browser harness; a
  "thorough audit before a big change" should run the smoke test and a verify-pr script.
