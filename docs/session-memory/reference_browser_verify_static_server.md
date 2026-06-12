---
name: browser-verify-static-server
description: How to browser-verify the RMOOZ client (UI_MOdified/client/app.html) on a static server without the auth redirect loop
metadata: 
  node_type: memory
  type: reference
  originSessionId: 7deb72c4-c896-44ad-8d36-7b4903d952af
---

To browser-verify `UI_MOdified/client/app.html` on a backend-less static server, the server MUST return HTTP 200 JSON for `GET /api/auth/me`. Otherwise `client/server-sync.js` `runInitialLoad()` sees a non-200 and calls `location.replace('/?next=app.html')`; the static server 302-redirects `/` → `/client/app.html`, so the page **reload-loops forever** — every `preview_eval` shows `readyState:"loading"`, `window.AppShell*` is undefined, and any eval-based panel reveal is wiped before the screenshot lands.

**Fix (already applied):** the verify server `/tmp/rmooz-verify-server.js` (launch.json config `rmooz-web`, port 8000, serves `UI_MOdified/`) stubs `GET /api/auth/me` → `{id,username,role:"verify"}` and all other `/api/*` → `{}`. Read-only canned JSON, no DB, no real auth backend.

**How to apply:** Use that verify server (preview_start "rmooz-web"), open `http://localhost:8000/client/app.html`, and confirm `readyState:"complete"` + `window.AppShellScenarioWorkspace` is an object before trusting evals/screenshots. The Scenario Workspace lives in `#scenario-workspace-panel` (class `context-section hidden`) — hidden by default; reveal via eval for inspection (`panel.classList.remove('hidden')`), but the app re-applies `hidden` on its render cycle, so reveal-then-screenshot in quick succession. preview_eval shares the page JS world (not isolated).

**Cache trap (cost a real debugging detour 2026-05-29):** the static server originally sent no cache headers, so the browser served a STALE cached `shell/scenario-workspace.js` — a full rewrite of `paintPhaseTimeline()` was invisible (old hardcoded output rendered instead). Symptom: DOM shows behavior the current source can't produce. Fix (now applied): the verify server sends `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma: no-cache` on all static files. After editing client JS/CSS/HTML, **restart the server (preview_stop + preview_start) and navigate with a `?v=Date.now()` cache-buster** to guarantee fresh scripts.

**Inter-eval state loss:** `window.RmoozScenario` gets cleared (page reload/poll) BETWEEN separate `preview_eval` calls. Any multi-step check (load scenario → navigate steps → read DOM) MUST run inside ONE eval, or the scenario is gone by the next call. Load a scenario for verification via the exposed API `window.AppShellScenarioWorkspace.loadLiveScenarioFromJson(json)` (fetch the real `/data/scenarios/wargame3.json` inside the eval). `goToStep` is NOT exposed — drive step nav by `.click()`ing the real buttons `#sw-nav-first` / `#sw-nav-prev` / `#sw-nav-next` / `#sw-nav-last` (exercises the genuine handler→repaint chain).
