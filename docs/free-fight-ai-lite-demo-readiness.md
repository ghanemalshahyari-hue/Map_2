# Free Fight AI-Lite — offline demo readiness (OFFLINE-DEMO-STABILIZE-A)

**Status (2026-06-13):** ready for offline-machine deployment/testing. Verified clean on
`origin/main` (`ce18aff`); 8 suites green (127 assertions); live-verified in the real
`app.html`. **No LiteLLM, no Qwen, no DEM, and no external network are required.**

This is a verification/readiness note — it adds **no features** and changes **no planner
behavior**. For the (future, optional) LLM upgrade see
[`free-fight-ai-litellm-design.md`](free-fight-ai-litellm-design.md).

---

## What works

- **Symbolic action–reaction demo** on multi-country Step 1 data: RED attacks Objective X,
  BLUE coalition reacts (intercept / defend_objective / screen / hold).
- **Deterministic offline "AI-lite" planner** (`free-fight-ai.js`, no LLM): picks ≤3 RED
  attackers (nearest anchor + platform-category attack-suitability) and ≤3 BLUE reactors
  with a reaction type + standoff point; produces `red_attack_plan[]` / `blue_reaction_plan[]`
  with `reason`, `route_summary`, `terrain_summary`, `confidence`.
- **Free Fight card** appears on the review screen whenever a Step 1 input has proposed
  units + an anchor/base source (no Objective X required to *show* the card).
- **Objective X**: place on the map, **reuse** a previously-placed point across card
  re-open, **clear** it. Start is enabled only once Objective X + groups + anchors exist.
- **AI reasoning panel** explains every RED/BLUE choice (planner name, suitability, route,
  terrain, confidence, warnings, missing info).
- **Map**: base anchors render with the symbol registry (✈ air / ⚓ naval / ▣ land / etc. —
  never a generic "B"); demo groups glide anchor→target on Start; Reset returns to anchors.
- **Terrain awareness when a DEM is present** via read-only `/api/terrain` (advisory only);
  **graceful geometric fallback + warning when absent** (the offline default on this box).

## What is demo-only (hard guardrails — do not cross)

Everything the Free Fight produces is tagged `demo_only` + `review_only` + `needs_review` +
`requires_commander_approval`, `exact_unit_position:false`. Specifically there is:

- **no** final tasking, COA, or scenario units written;
- **no** weapons, damage, kill-probability, or attrition;
- **no** real adjudication / WHITE ruling, **no** taxi/runway/takeoff, **no** doctrine
  execution;
- **no** world-state mutation and **no** journal/commit writes.

The planner *proposes and explains* a symbolic movement; a commander would still decide.

## What is not implemented yet

- **No LLM/Qwen planning.** The "AI" is a deterministic heuristic. The LiteLLM/Qwen
  *advisory* layer is design-only (env-gated, not built) — see the design doc.
- **No real terrain on this box** (no DEM configured) → routes are straight-line geometry.
- **No persistence** of a Free Fight run (it is a transient overlay; nothing is saved).
- **No production app.html driving in a logged-out browser** (auth-gated — use the devtools
  harness for auth-free verification; see below).

---

## How to run (offline machine)

```bash
# 1. Start the real web server (serves /app.html, /shell/*, /lib/*, /devtools/*, /api/*)
cd UI_MOdified && node server/web-server.js          # listens on :8000
```

- **Production app:** `http://localhost:8000/app.html` — requires an authenticated
  operator session (the client redirects to sign-in on `GET /api/auth/me` ≠ 200).
- **Auth-free devtools harness (canonical offline verification):**
  `http://localhost:8000/devtools/fixtures/multi-country/verify-free-fight.html`
  — loads the **same** shell modules in the **same** order as `app.html`, against a real
  Leaflet map, and drives the real `RmoozFreeFightDemo`. (Devtools is `.dockerignore`d, so
  it is not in the offline image; copy it alongside if you want it on the deploy box, or
  verify on a build box before imaging.)

## How to verify

### Tests (no server needed — pure Node, dependency-free)

```bash
node UI_MOdified/scripts/test-free-fight-ai-a.js                 # 9  — planner
node UI_MOdified/scripts/test-free-fight-demo-a.js               # 16 — demo controller
node UI_MOdified/scripts/test-free-fight-card-visibility-a.js    # 7  — show vs start gating
node UI_MOdified/scripts/test-multi-country-flexible-a.js        # 7  — external Step1 shapes
node UI_MOdified/scripts/test-multi-country-orbat-a.js           # 21 — coalition model
node ./test-placement-candidates-panel-1.js                      # 18 — map anchors  (repo root)
node ./test-base-status-panel-a.js                               # 38 — base card    (repo root)
node UI_MOdified/scripts/test-symbol-registry-a.js               # 11 — symbol glyphs
# Expected: 127 assertions, 0 failed.
```

### Browser (harness URL above)

Open the harness, then in DevTools / via automation:
1. It auto-fetches the LITE fixture → `POST /api/wargame-sim/analyze` → renders the review.
2. **Free Fight card appears** (button present).
3. Mount → **Place Objective X** → RED 3 / BLUE 3 groups, 1 objective marker, 6 group markers.
4. **Start** → groups glide from anchors; **Reset** → back to anchors; **Clear** → all gone.

### Expected visible results

- Coalition rollup: **RED 1 (Iran) / BLUE 6 (GCC)** on the LITE fixture.
- **12 base anchors** with symbol glyphs (✈ ×7, ⚓ ×3, ▣ ×2) — **no generic "B"**.
- Control panel: Start / Pause / Reset / Clear Objective X, "Place new Objective X" once set,
  bilingual safety banner *"AI-assisted demo only — not final tasking — requires commander
  approval / عرض تجريبي بمساعدة الذكاء الاصطناعي…"*. **No debug line.**

### Expected terrain fallback (DEM missing — the offline default)

- `GET /api/terrain/health` → `{ ok:true, available:false, dem_exists:false }`.
- The planner stays **geometric**; the panel shows the warning
  **"Terrain unavailable; using geometric demo movement only"**; `terrain_used:false`.
- If `/api/terrain` is entirely absent (minimal server), the probe's `.catch` swallows it —
  still geometric, no error, no hang.

### Expected AI reasoning panel text

- Header: **"AI Free Fight Reasoning — تفسير قرار الذكاء الاصطناعي"**.
- Sub: **"free-fight-ai-lite (deterministic heuristic; no LLM) · terrain_used: false"**.
- **RED attack (3)** — e.g. *Iran · Bandar Abbas AB* "Nearest RED anchor (…km) with
  air_fighter suitability 100% …", route "straight-line ≈ …km (geometric)", confidence.
- **BLUE reaction (3)** — e.g. *UAE · screen · Zayed Port Naval* "…naval_surface → screen to
  protect Objective X", *Qatar · hold · Al Udeid AB*, each with route + confidence.

### Expected RED/BLUE movement

- On **Start**, all selected groups glide anchor→target; progress steps 0→1.
- Phases: RED `staged → moving → approaching objective → holding`; BLUE
  `staged → moving → reacting → holding`. **Reset** returns every group to its anchor
  (`progress 0`, phase `staged`), no stale markers/lines.

---

## Files involved (exact)

**Client runtime chain** (under `UI_MOdified/client/shell/`):

| file | lines | role |
|------|------:|------|
| `free-fight-ai.js` | 191 | deterministic planner (pure, no network, no LLM) |
| `free-fight-demo.js` | 474 | demo controller, map overlay, panels, terrain probe |
| `doc-understanding-review.js` | 743 | renders the review + Free Fight card (show/start gating) |
| `demo-units.js` | 163 | proposed_units → demo groups / anchors |
| `symbol-registry.js` | 148 | object/base/platform → display glyph |
| `base-status-panel.js` | 440 | base card (country/side/symbol) |
| `placement-candidates-panel.js` | 302 | map anchor markers |

**Wiring:** `UI_MOdified/client/app.html` loads `free-fight-ai.js` before
`free-fight-demo.js` (`?v=ff-card-fix`).
**Server (optional, read-only):** `UI_MOdified/server/terrain-api.js` (292) —
`/api/terrain/health|elevation|profile`; degrades gracefully with no DEM.
**Fixtures:** `UI_MOdified/devtools/fixtures/multi-country/GCC_vs_Iran_step1_multicountry_freefight_trial{,_LITE}.json`
+ harness `verify-free-fight.html`.

---

## Offline machine requirements

- **Node.js** (same version family used for the app server). No npm install needed for the
  Free Fight path — the parsers are dependency-free (Node `zlib` only).
- **No Python, no LLM, no Ollama/LiteLLM endpoint, no DEM** required for the demo.
- **No internet.** The only HTTP the Free Fight makes is **same-origin** `GET
  /api/terrain/health` + `POST /api/terrain/profile`; both are optional and degrade. Basemap
  tiles are served by the in-app tile proxy / offline tiles per the existing offline setup
  (the Free Fight overlay itself does not fetch tiles).
- **Browser** with the app served from the same origin (auth for `app.html`, or the
  devtools harness for auth-free verification).

## Future LiteLLM / Qwen option (not enabled)

Per [`free-fight-ai-litellm-design.md`](free-fight-ai-litellm-design.md): an **advisory**
LLM may later re-rank/re-explain within the deterministic planner's guardrails
(env-gated `RMOOZ_FREE_FIGHT_LLM=1`; deterministic stays authoritative + fallback +
validator; endpoint/key only in `.env.offline` / `ai-secrets.local.js`, never hardcoded).
**Today it is fully OFF and the demo does not depend on it.**

## Known limitations

- Routes are **straight-line geometry** until a DEM is configured (advisory terrain only).
- Sample size is capped at **≤3 RED + ≤3 BLUE** (nearest/most-suitable); not all units move.
- The Free Fight is a **transient overlay** — nothing is saved/journaled.
- `app.html` cannot be driven in a logged-out browser (auth) — verify via the devtools
  harness (or an auth-stub proxy on a dev box).
- `preview_screenshot` may be slow against a tile-less Leaflet canvas (harness); the real
  `app.html` (with basemap) screenshots fine.
