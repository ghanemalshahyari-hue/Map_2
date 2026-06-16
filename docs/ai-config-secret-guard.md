# ai-config committed-secret guard — RMOOZ-SECURITY-AI-CONFIG-GUARD-F

A committed safety net so **`UI_MOdified/server/ai/ai-config.js` can never accidentally carry a real
cloud secret or a cloud-default provider/url/style change**.

- **Test:** `UI_MOdified/scripts/test-ai-config-guard-f.js`
- **Run:** `cd UI_MOdified && node scripts/test-ai-config-guard-f.js` (exit 0 = green)
- **Changes AI behavior?** No. It is a static source check; `ai-config.js` is **not modified**.

## Why
`ai-config.js` is the single source of truth for the AI gateway and is meant to be safe to push to
git. A previous foreign WIP change tried to hardcode a Zen `sk-…` key and flip the default provider
from local Ollama to a cloud gateway. That was caught and reverted by hand. This guard makes the same
mistake impossible to commit silently: it fails CI/the test run instead.

## What it checks (the committed `defaults` only)
The guard reads the source and evaluates **only the committed `defaults` object literal** — it does
**not** read the env/overlay-merged export, because `RMOOZ_*` env vars and the gitignored
`ai-secrets.local.js` overlay are *supposed* to override the defaults at runtime. It fails if:

| # | Rule |
|---|------|
| 1 | A real `sk-…` style API key appears anywhere in the file (`/sk-[A-Za-z0-9._-]{20,}/`). |
| 2 | Any `apiKey` in the defaults is a non-empty string — top-level **and** nested (`claude`, `zen`, `openrouter`). |
| 3 | The top-level `url` default is anything other than `http://localhost:11434`. |
| 4 | The default `apiStyle` is anything other than `ollama`. |
| 5 | The default `aiProvider` is anything other than `ollama` (no cloud default). |

Comment **placeholders are allowed**: `<api-key>` and `<claude-api-key>` are not real keys and are not
values, so they never trip the scan.

The suite also includes **guard-the-guard** negative cases (a planted `sk-ant-…` key, `apiStyle:'openai'`,
a cloud `url`, `aiProvider:'zen'`, and a non-empty nested key) that must each fail-closed — proving the
guard is not a no-op.

## How to fix a failure (the operator message)
Do **not** put secrets or overrides in the committed defaults. Instead:

- **Env vars** (always win): `RMOOZ_OLLAMA_API_KEY`, `ANTHROPIC_API_KEY`, `OPENCODE_ZEN_API_KEY`,
  `OPENROUTER_API_KEY`, `RMOOZ_OLLAMA_URL`, `RMOOZ_AI_PROVIDER`, …
- **Gitignored overlay:** create `UI_MOdified/server/ai/ai-secrets.local.js` (next to `ai-config.js`)
  with `module.exports = { apiKey: '<api-key>', url: '...' }`. It overlays the defaults and is not
  committed.

See also: `[[feedback_free_fight_local_only_security]]`, the Free Fight local-only security lock
(RMOOZ-AI-FREE-FIGHT-SECURITY-CLEANUP-A), and `.env.example`.
