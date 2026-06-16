# OpenRouter cloud mode (RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A)

**Default RMOOZ AI is LOCAL-ONLY (Ollama).** OpenRouter is an *explicit, opt-in* cloud test mode for
running large models (e.g. **Qwen3.5 397B A17B**) that aren't yet available offline.

> ⚠ **Cloud egress.** When enabled, the AI Commander Free Fight prompt — the *filtered* candidate
> units (10–25, not the full force) + the objective + tactical context — is sent to `openrouter.ai`.
> **Data leaves this machine.** Use only for test/eval, never with real classified data.

## How to enable (local `.env` / shell only — never commit the key)
```
RMOOZ_ALLOW_SIM_RUN=1        # existing execution gate
RMOOZ_ALLOW_CLOUD_AI=1       # NEW cloud gate — without this, OpenRouter cannot run and is hidden
OPENROUTER_API_KEY=sk-or-... # your OpenRouter key — local only, NEVER committed
# optional: RMOOZ_OPENROUTER_MODEL=<exact slug>   (else pick live in the selector)
# optional: OPENROUTER_URL=https://openrouter.ai/api/v1   (default)
```
Then in the app's **model selector** (header HUD): set the **Provider** dropdown to **OpenRouter**,
pick the **Qwen3.5 397B A17B** model from the live list, click **Use**, and run AI Free Fight.

## Safety model (what stays true)
- **Three independent conditions** must ALL hold for any OpenRouter call: `RMOOZ_ALLOW_SIM_RUN=1`
  **and** `RMOOZ_ALLOW_CLOUD_AI=1` **and** `OPENROUTER_API_KEY` set **and** provider=openrouter selected.
- If `RMOOZ_ALLOW_CLOUD_AI` ≠ 1 (or no key): OpenRouter is **blocked** (`remote_blocked`, zero cloud
  calls), it is **hidden/disabled** in the selector, and Free Fight stays local-only.
- **`zen` / `claude` / `openai` / `auto` remain blocked unconditionally** — only OpenRouter was approved.
- The **candidate pre-filter still runs first** — only 10–25 units are sent, never the full force.
- A real cloud plan reports `plan_source:"llm"`, `provider_used:"openrouter"`, `model_used:<your slug>`.

## Where it's wired
- Gate: `server/ai/llm-runtime-config.js` → `cloudAllowed()` / `openrouterReady()`.
- Guardrail: `isRemoteProvider('openrouter') === !openrouterReady()` in the COA planner / capability
  analyst / decision modules; backstop in `server/ai/ai-provider.js` (`resolveProvider` throws if cloud off).
- Client: `server/ai/openrouter-client.js` (OpenAI-compatible `/chat/completions` + `/models`).
- Config: `server/ai/ai-config.js` `openrouter` block (key ships blank).
- Selector: `server/ai/model-selection.js` persists `{provider, model}`; `GET /api/ai/models[?provider=openrouter]`
  lists the cloud catalog; `POST /api/ai/model/select {provider, model}`. UI: header HUD provider dropdown.

## Verify
- Offline (no key, stubbed): `node scripts/test-openrouter-cloud-mode-a.js` → 9/9.
- **Real cloud (owner, needs your key):** set the env above, then
  `cd UI_MOdified && node scripts/verify-openrouter-qwen-e2e.js` — lists models, selects the Qwen3.5
  slug, runs a Qatar-objective plan, and asserts provider/model/plan_source/candidates 10–25.
