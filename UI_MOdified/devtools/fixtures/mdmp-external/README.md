# MDMP-external fixtures (sanitized)

Key-schema templates captured 2026-06-11 from the **other AI app's** MDMP pipeline drop
(`UI_MOdified/TestingAI/Other_App_Ai_Generated output/` — that raw folder is **gitignored**
because its `task_Analysi/step2_task_analysis.py` carries internal LLM endpoint IPs).
These five JSON files contain **no secrets/IPs** (verified) and only placeholder values
(`<نص>`, `…`, `"..."`); they exist so tests can pin the external key schema.

| File | MDMP stage | Notes |
|---|---|---|
| `step1.json` | Step 1 — planning guidance / WARNO package | JSONC (`/* */` + `//` comments); 110 keys |
| `step3.json` | Step 3 — COA development | JSONC; force comparison `{count, unit_type, weight}` ×9 categories ×2 sides + two COAs (`phose_*` = "phase" typo, kept verbatim) |
| `step4_out.json` | Step 4 — COA analysis (wargame) | JSONC; action/reaction/counteraction triads ×6 events ×2 COAs |
| `step5.json` | Step 5 — COA comparison | JSONC with **trailing inline comments** (hardest parse case) |
| `warning_order.json` | Field dictionary | strict JSON; key → Arabic meaning (synonym-map source) |

COA suffix families across files: `<key>` (COA 1) vs `<key>2` / `<key>_2` / `<key>_c2` (COA 2).

Used by: `scripts/test-mdmp-external-detect-1.js` (MDMP-EXTERNAL-1 / G-1 detection layer).
Do not "fix" the JSONC or the `phose_` typo — they intentionally mirror the external app's
real output quirks.
