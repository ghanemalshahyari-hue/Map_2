# RMOOZ-AI-COMMANDER-TRACE-VERIFY-B — real-browser verification of the AI Commander / Staff-Safe Planning Trace

- **Date:** 2026-06-16
- **Code under test:** `origin/main` working tree (the only diff from origin/main is the *not-mine*
  uncommitted `web-server.js` `.env` gap-filler + `.env.example`; both insulated from the free-fight path).
- **How:** real Chromium via the Claude preview tools → the auth-stub proxy
  (`scripts/verify-proxy-server.js`, stubs `GET /api/auth/me`) → the real `server/web-server.js`
  (`RMOOZ_ALLOW_SIM_RUN=1`, `:8002`) → local Ollama `qwen2.5:3b`. Local launch config: `.claude/launch.json`
  `rmooz-ff-app-verify` (gitignored, per-machine).
- **Screenshot note:** `preview_screenshot` (JPEG) timed out consistently in this environment (the
  renderer never reached network-idle), while `preview_snapshot` (accessibility tree) + `preview_eval`
  (DOM extraction) worked. So the evidence below is the **real rendered DOM** captured as accessibility
  text + extracted `textContent` from the live browser — not a Node DOM harness. To capture JPEGs
  manually: run the proxy + a web-server (see launch config) and open the app in a browser.

## 1. Global model selector — live (accessibility snapshot)

```
group "Local AI model — النموذج المحلي"
  StaticText "OLLAMA"
  combobox (value "qwen2.5:3b"): qwen2.5:3b | bge-m3:latest | qwen2.5:7b | llama3.2:1b | gpt-oss:20b
  button "↻"
  button "Use — استخدم"
  StaticText "QWEN2.5:3B · ✓ · GATE ON"
```
App loaded through the proxy with `GET /api/auth/me → 200` (no redirect loop), map present.

## 2. AI Commander — live generate (real local LLM)

Mounted the Free Fight card with a Qatar scenario (30 RED: 22 near + 8 far, 8 BLUE), **AI Commander**
mode (default), model `qwen2.5:3b`, clicked **Generate AI Attack Plan**.

In-flight (live elapsed ticker — the wait reads as the AI thinking, not a frozen spinner):
```
🧠 AI Commander reasoning… 11s    Normal · High Variation · local model
◐ Reading OOB, capability & terrain   ○ Drafting courses of action
○ Validating against real units        ○ Repairing invalid references
Local LLM on this hardware can take 1–3 minutes — the commander is thinking.
```

Completed (~270s): `plan_source:"llm"`, `llm_status:"ok"`, `model_used:"qwen2.5:3b"`, `repaired:false`,
no fallback. Rendered Planning Trace (`data-ff-mode="ai_commander"`):
```
🧠 AI Commander Mode — وضع القائد بالذكاء الاصطناعي    ollama · qwen2.5:3b
Input understood — الإدخال مفهوم
✓ 38 units analyzed
✓ Candidate units sent to AI: 20 / 30 · excluded far/not-relevant: 10
  — excluded 8: too far for its type to reach the objective
  — excluded 2: different country/zone from the objective
✓ Force (RED): 14 maneuver · 16 fires
✓ Enemy (BLUE): 8 air-defense · 0 armor · 0 recon
✓ 1 objective(s) prioritized
✓ Terrain: unknown (inferred (no DEM))          ← after the fix below (was "[object Object]")
✓ Posture: alert ENGAGEMENT_READY · ROE ENGAGE_IF_HOSTILE
AI reasoning — تفسير الذكاء الاصطناعي
• COA-1 (Cautious Recon / Hold and Warn): …
• COA-2 (Deception Feint / Shift Axis): …
• COA-3 (Direct Attack / Defense): …
Validation — التحقق
✓ All unit IDs valid   ✓ All actions matched to real units   ✓ Kill/engage actions blocked
✓ Targets within map bounds (no teleport)   ✓ 3 valid COA(s) generated
```
- **No `readiness` / `supply`** anywhere in the trace (asserted `mentionsReadiness:false`, `mentionsSupply:false`).
- Candidate pre-filter visibly applied (20 of 30 sent; 10 excluded with grouped reasons).

## 3. Staff-Safe — manual toggle (honest badge)

Clicked **Staff-Safe** then **Generate**: `plan_source:"deterministic_diverse_coa"`,
`data-ff-mode="staff_safe"`, badge **`🛡 Staff-Safe Mode — الوضع الآمن (تخطيط حتمي)`**, same Input-understood
trace. Clearly labeled as the deterministic staff planner — not dressed as AI.

## 4. Auto-fallback — visibly labeled, not silent

Rendered a representative AI-Commander-timeout plan through the card's real render function
(`_renderCoaPlanHtmlForTest`) — a true 300s timeout is impractical to force live:
```
Plan source: deterministic_diverse_coa (local_llm_unavailable: Backend timed out after 300000ms)
🛡 Staff-Safe Mode — الوضع الآمن (تخطيط حتمي)
⏱ Local AI timed out — used Staff-Safe planner. Raise RMOOZ_FREE_FIGHT_TIMEOUT_MS or use a faster model.
```
The fallback reason + the Staff-Safe planner + the timeout message all render → the auto-fallback is
visible, not silent.

## 5. Bug found + fixed (UI-label only)

Browser verification caught `✓ Terrain: unknown ([object Object])` — `terrain_provenance` is an OBJECT
(`{terrain_class:'absent', threat_rings:'inferred_geometric', …}`) that the trace string-coerced. Fixed
with a display-only `_provenanceStr()` in `free-fight-coa-planner.js` (renders `inferred (no DEM)` /
`partly GIS DEM`). **Terrain computation, COA scoring, DB-Lite, readiness/supply unchanged.** Confirmed
live: `GET plan-coas (depth=fast)` now returns `terrain_provenance: "inferred (no DEM)"` (string). Test
assertion added in `scripts/test-free-fight-repair-loop-a.js` (7/7).

## Caveats
- `preview_screenshot` (JPEG) is non-functional in this environment; evidence is real-DOM text, not images.
- The manual **Staff-Safe** path still runs the capability-analyst LLM when `depth≠fast` + `useLlm=true`
  (only the COA-generation LLM is skipped), so it isn't instant unless `depth=fast`. Not a defect — noted
  for demo expectations.
- 3b COA narrative occasionally contains a literal placeholder ("…against string") — LLM output quality,
  out of scope for this UI pass.
