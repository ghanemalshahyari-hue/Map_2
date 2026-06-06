# OFFLINE-GEN-DIAG-0 — Scenario Generation Reset Diagnosis

**Status:** Diagnosis complete (read-only — no production files changed)
**Date:** 2026-06-06
**Server:** 155.140.70.51 · App: http://155.140.70.51:8640
**Symptom:** Start Scenario Generation shows "20% — generating phase 0 / 17 / Starting new generation…" then resets to idle with no useful logs.

---

## TL;DR — Root Cause

**The WarGamingGEN Python generator dies on the first LLM call with `openai.APIConnectionError: Connection error.`**

The generator's LLM endpoint is `LLM_BASE_URL=http://localhost:11434/v1` (from the baked
`TestingAI/WarGamingGEN/.env`). Inside the container there is **no Ollama on localhost:11434**,
so the very first adjudicator call fails, Python exits 1, and **0 checkpoints** are written.

The bridge's run-id gating reports `phases_done=0` (→ frontend shows **20%**) while Python is
briefly alive, then on the next poll sees `running=false, status=error` and the UI **resets to
"Ready to start a new generation"** without surfacing the Python traceback.

**Classification:** Primary **G** (LLM endpoint unreachable) + **D** (backend process crashes
immediately) + Secondary **I** (UI hides the error and resets).

**The user has LiteLLM, but generation never uses it** — the bridge wires only
`LLM_LOCAL_FORCE_FALLBACK=1` + `LLM_MODEL` into the Python child and never passes the
LiteLLM endpoint/key. Generation uses a **separate** LLM config from the RMOOZ Node AI.

---

## Evidence (captured live from the running container)

### 1. A real Start was triggered
```
POST http://127.0.0.1:8640/api/wargame-sim/run
→ {"ok":true,"started":true,"sim":{"running":true,"baselineRun":null,...}}
```

### 2. Status ~12s later
```
running: false | phases_done: 0 | phases_total: 17 | status: error | exit_code: 1
```

### 3. Full Python error (from sim.error)
```
sim exited 1 — ...
  File "/opt/rmooz-venv/lib/python3.11/site-packages/openai/_base_client.py", line 1054, in request
    raise APIConnectionError(request=request) from err
openai.APIConnectionError: Connection error.
```

### 4. Run directory WAS created (so paths/permissions are fine)
```
/app/TestingAI/WarGamingGEN/runs/2026-06-06_19-53-28/
  run-meta.json
  run_index.json
  llm_audit/20260606_195329_adjudicator_scene_phase00.json   ← LLM call attempted
  checkpoints/   ← 0 files (died before writing phase00.json checkpoint)
```
The `llm_audit` file proves the generator reached the phase-0 adjudicator scene-setter,
built the request, then the HTTP call to the LLM failed.

### 5. Generator LLM config (baked into image, NOT overridden by the bridge)
`/app/TestingAI/WarGamingGEN/.env`:
```
LLM_BASE_URL=http://localhost:11434/v1     ← Ollama inside container → nothing listening
LLM_MODEL=qwen2.5:7b
LLM_USE_RESPONSES_API=0
LLM_LOCAL_FORCE_FALLBACK=0
OPENAI_API_KEY=<present but unused for local base_url>
```

### 6. Container env (the bridge inherits this for the Python child)
```
RMOOZ_ALLOW_SIM_RUN=1
RMOOZ_AI_PROVIDER=ollama
RMOOZ_SIM_MODEL=qwen2.5:7b
OLLAMA_HOST=http://host.docker.internal:11434
RMOOZ_AI_BASE_URL=   (EMPTY)
RMOOZ_AI_API_KEY=    (EMPTY)
LLM_BASE_URL=        (EMPTY in process env → WarGamingGEN/.env value wins)
```

### 7. Misleading green health check
```
GET /api/ai/config → {"provider":"ollama","model":"qwen2.5:7b","baseUrlConfigured":true}
GET /api/ai/health → {"ok":true,"provider":"ollama","statusCode":200}
```
`/api/ai/health` tests the **RMOOZ Node AI** path (Ollama via `OLLAMA_HOST=host.docker.internal`,
which resolves on this Windows Docker-Desktop test box). It does **NOT** test the WarGamingGEN
Python generator LLM. **AI health passing does not mean generation will work** — they are two
different LLM configs. On the Linux server (155.140.70.51) `host.docker.internal` will not
resolve either, so even the Node AI path will fail there unless `extra_hosts` is set.

---

## Why the UI shows "20%" then resets (exact mechanics)

| Step | Component | File:line | Behaviour |
|------|-----------|-----------|-----------|
| 1 | Click Start | `client/shell/scenario-import-wizard.js:910` → `start(false)` | POST `/api/wargame-sim/run` |
| 2 | Bridge spawns Python | `server/wargame-sim-bridge.js:790` | `env = process.env + {LLM_LOCAL_FORCE_FALLBACK:'1', LLM_MODEL}` — no LiteLLM/base-url |
| 3 | Progress % | `scenario-import-wizard.js:51-54` `pct()` | `phases_done=0,total=17` → `20 + round(60*0/17)` = **20%** |
| 4 | Poll | `scenario-import-wizard.js:646-685` `beginPoll/tick` | GET `/api/wargame-sim/status` every 4s, **no runId in URL** |
| 5 | Python dies | openai APIConnectionError | exit 1, 0 checkpoints |
| 6 | Next poll | `scenario-import-wizard.js:665-684` | `sim.running=false`, `status='error'` → not "complete" → `else` branch → `setStatus('Ready to start a new generation.')` |
| 7 | Error lost | `wargame-sim-bridge.js` errTail | Python stderr kept only as a truncated in-memory tail; never written to a run log file or docker stdout; frontend never renders it as a failure panel for this case |

The "reset" is the `else` branch at `scenario-import-wizard.js:~683` firing because the failed
run is not `complete` and (depending on fingerprint match) does not show a stopped panel that
surfaces the Python error.

---

## Why there are "no useful logs"

1. The bridge captures Python **stderr into an in-memory tail** (`errTail`) and exposes only a
   truncated, caret-mangled fragment via `sim.error` / `sim.message`.
2. The full traceback is **not** written to a log file inside the run directory.
3. The Python stderr is **not** forwarded to the container's stdout, so `docker logs` shows
   nothing about the failure (confirmed — logs only show server boot + scenario-loader warnings).
4. The frontend's reset branch replaces the status text with "Ready to start a new generation,"
   erasing even the fragment.

---

## Confirmed NOT the cause

| Candidate | Ruled out because |
|-----------|-------------------|
| E — Python/WarGamingGEN path missing | `/app/TestingAI/WarGamingGEN/src` present; Python ran |
| F — run/output folder not writable | Run dir + run-meta.json + llm_audit were written successfully |
| H — scenario file missing | `inputs/scenario.json` present; `wargame3` loaded (17 phases) |
| B — backend returns no runId | True, but a run dir WAS created and gating resolved; not the failure here |
| J — old cached JS | Generation is a server-side Python failure, not a frontend cache issue |

---

## Root Cause (final)

**G — The generation LLM endpoint is unreachable.**

WarGamingGEN's Python uses `LLM_BASE_URL=http://localhost:11434/v1` (its own baked `.env`).
The RMOOZ bridge spawns Python with only `LLM_LOCAL_FORCE_FALLBACK=1` and `LLM_MODEL`, and
**never injects the operator's LiteLLM endpoint or key**. Inside the container nothing listens
on `localhost:11434`, so the first adjudicator LLM call throws `APIConnectionError`, Python
exits 1, and no checkpoints are produced. The UI surfaces this only as a brief 20% flash
followed by a silent reset (secondary issue **I**).

---

## Recommended fix plan — OFFLINE-GEN-RUN-FIX-1

### Fix 1 (PRIMARY): wire the offline LLM endpoint into the Python child
In an **offline overlay** of the bridge — `Offline_Deployment/offline_app/server/wargame-sim-bridge.js`
— change the spawn env (currently line 790) so the Python generator uses the operator-configured
endpoint instead of localhost Ollama. Map the offline AI env onto the WarGamingGEN LLM_* vars:

```
LLM_BASE_URL  = RMOOZ_AI_BASE_URL (LiteLLM)  OR  derive from OLLAMA_HOST + '/v1'
LLM_API_KEY   = RMOOZ_AI_API_KEY              (passed via env only — never logged)
LLM_MODEL     = RMOOZ_AI_MODEL  OR  RMOOZ_SIM_MODEL
LLM_USE_RESPONSES_API = 0 for LiteLLM/OpenAI-compatible chat-completions
LLM_LOCAL_FORCE_FALLBACK = 0 when a real base URL is configured
```
Pass these in the `spawn(...)` env object. Do **not** print the key. (python-dotenv in
WarGamingGEN does not override existing env, so setting them in the child env takes precedence
over the baked `.env`.)

### Fix 2: make `.env.offline` carry the generation endpoint
Document/support in `.env.offline(.example)`:
```
RMOOZ_AI_PROVIDER=litellm
RMOOZ_AI_BASE_URL=https://<litellm-host>/v1
RMOOZ_AI_API_KEY=<set in real .env.offline only — never in .example or code>
RMOOZ_AI_MODEL=<model-name>
```
Placeholders only in `.example`; real key only in the server's `.env.offline`.

### Fix 3 (SECONDARY — surface the error)
- Make the bridge write the full Python stderr to `runs/<id>/error.log` (no secrets) and/or
  forward to container stdout so `docker logs` shows it.
- In the offline wizard overlay, when `sim.status==='error'`, show a failure panel with the
  captured reason instead of silently resetting to "Ready to start a new generation."

### Fix 4: make `/api/ai/health` honor the generation path
Add an offline AI health that tests the **actual generation endpoint** (LLM_BASE_URL/RMOOZ_AI_BASE_URL),
so a green check reflects whether generation can run. Never expose the key.

### Fix 5 (Linux server caveat)
On the Linux host 155.140.70.51, `host.docker.internal` does not resolve by default. If the LLM
runs on the host, add to compose:
```
extra_hosts:
  - "host.docker.internal:host-gateway"
```
With LiteLLM over HTTPS this is moot (use the real LiteLLM URL).

---

## Files that would change in OFFLINE-GEN-RUN-FIX-1

| File | Change | New image required? |
|------|--------|---------------------|
| `Offline_Deployment/offline_app/server/wargame-sim-bridge.js` | **New overlay** — inject LLM_BASE_URL/LLM_API_KEY/LLM_MODEL into spawn env; write error.log | Yes (rebuild) |
| `Offline_Deployment/Dockerfile.offline` | COPY the bridge overlay over `./server/wargame-sim-bridge.js` | Yes |
| `Offline_Deployment/offline_app/client/shell/scenario-import-wizard.js` | Surface `status==='error'` instead of resetting | Yes |
| `Offline_Deployment/.env.offline(.example)` | LiteLLM generation vars (placeholders in example) | No (env only) |
| `Offline_Deployment/offline_app/server/offline-map-config.js` or a new `ai-health` overlay | Optional: generation-aware AI health | Yes if added |

**A new image IS required** (the bridge and wizard are baked into the image). `.env.offline`
changes alone are necessary but not sufficient, because the bridge currently ignores the
LiteLLM vars and the WarGamingGEN `.env` hardcodes localhost.

---

## Cleanup note
This diagnosis created one failed run dir: `runs/2026-06-06_19-53-28` (run-meta + empty
checkpoints). Harmless; can be deleted from the `TestingAI_Runtime/runs` volume.
