# Batch E — CMO Sensor-to-Engagement Fidelity: duplication matrix

Audit performed against `f479946c` via 3 parallel read-only passes (detection engine + DEM,
engagement engine + doctrine/WRA, overlays + explainability panels) before any implementation.
Source: `docs/cmo-vs-rmooz-gap-report.md` (dated 2026-06-03, stale on doctrine/missions/events —
Batches B-D closed those; the remaining gaps it names for detection/engagement are still current).

## What exists today, exactly

| Area | File | Current shape |
|---|---|---|
| Detection engine (DET1) | `UI_MOdified/client/shell/detection.js` | `computeContacts(worldState, opts)` — **synchronous**, pure. Handles `radar`/`esm` sensor types only; `sonar`/`ir`/`optical`/`iff` types are declared in DB-Lite but produce zero contacts. EMCON per-sensor is a 3-value string (`active`/`silent`/`always`), read at `detection.js:114,155,171`. |
| **DET2 hook (terrain LOS)** | `detection.js:126,143` | `opts.losBlocked` — a function hook, checked and called, but **no caller anywhere passes one**. Not a stub returning "clear" — it is fully unwired. Confirmed via `Grep losBlocked` across the repo: zero call sites pass this option. |
| DEM (elevation) | `UI_MOdified/client/dem-layer.js` + `UI_MOdified/server/dem-service.js` | Client: `DemLayer.queryElevation(lon,lat)` → `/api/dem/elevation`. Server: `getElevation(lon,lat)`, `renderHeights()` (feeds Cesium), sync/file-backed GeoTIFF. |
| **Terrain line-sampling (already built, unused for detection)** | `UI_MOdified/server/terrain-api.js` `POST /api/terrain/profile` (`terrain-api.js:131`) | Samples elevation along a multi-point line (~1/200m), returns `{samples[], elevation:{min_m,max_m}, slope:{...}}`. Built for route-mobility analysis (`terrain-analysis.js`), **never used for detection**. This is the correct raycast primitive to reuse for DET2 — not a new implementation. |
| Unrelated "terrain visibility" concept — do not confuse | `UI_MOdified/server/ai/terrain-effects-engine.js` | Text-hint heuristic (`terrain_note` string → coarse `los_risk` tag), explicitly DEMO/REVIEW-ONLY, no DEM, no coordinates. A second, unrelated "terrain" concept already exists under a similar name — naming collision risk. |
| Engagement engine (ENG1) | `UI_MOdified/client/shell/engagement.js` | `computeEngagements(worldState, contacts, opts)` — pure. Reason codes (exactly 4, no more): `weapons_hold`, `out_of_range`, `winchester`, `no_fire_control_channel`. Range gating via `RANGE_MODE_FACTOR:{max:1.0, '75pct':0.75, nez:0.5}` — a **per-weapon mode**, not an authored field. No IFF/identification concept anywhere in the file. |
| Doctrine/ROE/WRA data model (DOC1) | `UI_MOdified/client/shell/doctrine-rules.js` | `wra_rules[i]` already carries `weapon_class, target_class, max_range_nm, min_confidence, required_sensor_quality, salvo_limit` as **authored fields** — but this evaluator is wired ONLY into `runtime-events.js`'s `gateRuntimeEffectWithDoctrine` (a session-level `weapon_release` effect gate), **never consulted by ENG1's `computeEngagements`**. |
| Dangerous-effect safety lock (must stay intact) | `UI_MOdified/client/shell/runtime-events.js:81` `DANGEROUS_RUNTIME_EFFECT_REASONS`, `:555` `classifyRuntimeEffectForExecution` | Blocks `destroy_unit/engage_unit/engage_target/fire_weapon/change_weapon_state/...`; `weapon_release` is explicitly `requires_world_state_executor` and never executes even when doctrine-approved (Batch C "Locked Decision 8"). Confirmed intact at `f479946c`. |
| Explainability idiom #1 (structured gate) | `doctrine-rules.js:144` | `{decision, reasons[], matched_rules:[{id,kind,decision,severity,reason}], required_authority, severity}` |
| Explainability idiom #2 (flat per-candidate) | `engagement.js` output | `{status:'engaged'\|'blocked', reason}` per shooter/target pair |
| Explainability idiom #3 (taskability) | `unit-taskability.js:47` `classifyUnit` | `{taskable, reason, review_status, allowed_actions, blocked_actions, blockers:{...}}` |
| **A dedicated "why can't X" panel already exists** | `UI_MOdified/client/shell/why-not-panel.js` (L3-B-1) | `#wn-body`, row shape `{code, explanation, source}` rendered as `.wn-group > .wn-item{.wn-code,.wn-exp,.wn-src}`, `.wn-verdict-{verdict}`, i18n-tagged, repaints on `rmooz:playback-tick`/`rmooz:scenario-visibility-changed` + polling. |
| Map contact/ring/engagement rendering | `adjudicator-map.js:5335` (`renderCoverageRings`), `:5482` (`renderDetectionContacts`, firm=filled/tentative=hollow-dashed), `:5540` (`renderEngagements`, Pk-weighted lines) | All colored by **holding side** (blue/red) — no IFF ladder color exists; `standardIdentity` (line 1543) is a direct side→affiliation map, not a progressive state. |
| **A second, independent ring/line renderer already exists** | `UI_MOdified/client/shell/evidence-map-overlays.js:285-362` | Draws its OWN weapon/sensor rings + shooter→target line **per selected unit**, Ready/Blocked/Unknown-colored, Arabic reason labels (`REASON_LABELS_AR`), listening on `rmooz:unit-selected`. Runs simultaneously with `adjudicator-map.js`'s always-on renderer — a pre-existing duplication, not one this batch introduces. |
| Map-linked highlighting mechanism | `adjudicator-map.js:2264/2341` dispatches `rmooz:unit-selected`; `evidence-map-overlays.js:355` is the only listener that draws | Event-based, **no camera pan/flyTo** — selection highlights via overlay only, never moves the viewport. |
| Cesium 3D parity | `cesium-view.js:511/565/606` | Already mirrors coverage rings / detection contacts / engagements from the 2D map. **No LOS/terrain-visibility code exists in 2D or 3D today.** Duplicated at `UI_MOdified/Offline_Deployment/offline_app/client/wargame/cesium-view.js` — both copies need touching for any new visual, per `[[feedback_keep_cesium_3d_in_sync]]`. |
| Proficiency / OODA / targeting priority | — | Confirmed absent from all production code (only appears in docs and a classification-bucket label in `scripts/classify-cmo-inventory.js`). `strength` (0-1 combat power) is a different, pre-existing axis — not proficiency. |

## Locked architecture decisions this batch follows

1. **DET2 reuses `POST /api/terrain/profile`, not a new elevation sampler.** The real design
   question is sync-vs-async: DET1's `computeContacts` is synchronous and runs client-side; the
   terrain profile endpoint is server-side/HTTP. Resolution: LOS is computed **once per step,
   server-side, alongside/after world-state transition** — a per-step LOS matrix (or a memoized
   per-pair cache) is handed to `computeContacts` as `opts.losBlocked`, a plain synchronous lookup
   function over already-fetched results. DET1's own function signature does not become async.
2. **ENG1 is wired to consult `AppDoctrineRules`'s existing `wra_rules` fields**
   (`target_class`/`max_range_nm`/`min_confidence`/`salvo_limit`), rather than inventing a third,
   parallel WRA representation alongside ENG1's own `wra.mode`/`RANGE_MODE_FACTOR` and DOC1's
   `wra_rules`. NEZ and self-defense are genuinely new fields (neither representation has them
   today) and are added to `wra_rules`, not to ENG1's local `RANGE_MODE_FACTOR`.
3. **The new "why can't detect/identify/engage" panel extends `why-not-panel.js`**, reusing its
   `{code, explanation, source}` row shape and `#wn-body`/`.wn-group`/`.wn-item` DOM idiom — not a
   new panel component. Map-linked highlighting for it extends `evidence-map-overlays.js` (it
   already has the Ready/Blocked/Unknown + Arabic-reason semantics this needs), not
   `adjudicator-map.js`'s always-on renderer and not a fourth ring engine.
4. **The dangerous-effect block-list (`runtime-events.js`) is read-only for this batch.** Detection
   identification states, IFF gating, and engagement-eligibility previews are additive checks
   evaluated *before* ENG1 reaches its existing reason-code chain — none of them touch
   `DANGEROUS_RUNTIME_EFFECT_REASONS`/`classifyRuntimeEffectForExecution`, and `weapon_release`
   stays inert. This batch produces eligibility/preview data, never fires anything.
5. **IFF is a new sensor-adjacent concept, not retrofitted onto the unused `type:'iff'` sensors.**
   DB-Lite declares `iff` sensor types today but DET1 never reads them (only `radar`/`esm` are
   handled) — this batch decides whether IFF becomes a real sensor type DET1 consults, or a
   separate per-contact identification-progression field. (Resolved in Slice 3's own doc when that
   slice starts.)
6. **Terrain-effects-engine.js's `terrain_note`-based heuristic is left untouched and unrenamed** —
   it is a different, pre-existing, demo-only concept; this batch's real DEM-backed LOS work must
   not be confused with it in code comments, memory, or the inventory.
7. **3D parity**: any new 2D visual (LOS indicator, IFF color ladder, identification-state marker)
   gets a `cesium-view.js` mirror in the SAME slice it ships in — both the main-tree and
   `Offline_Deployment` copies are out of scope for this batch (main-only), so only the main-tree
   `cesium-view.js` needs updating; the offline copy is deferred with offline sync generally.

## Explicitly out of scope (per the decision gate)

Full IADS networking · radar-band physics · jamming/burn-through · ballistic/missile-flight
simulation · chaff/soft-kill · automatic firing or destruction · offline synchronization · trusted
unit/function authorization.
