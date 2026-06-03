# RMOOZ vs CMO — Detailed Functional Comparison Report
*Generated 2026-06-03 from `docs/cmo-functional-rules/exhaustive/` (945 rules, 9 buckets) + `APP_INVENTORY.md` (audit HEAD `0efdf17`)*

---

## How to read this report

Each CMO functional bucket is broken into:
- **✅ Matches CMO** — RMOOZ implements this behaviour
- **🟡 Partial** — The mechanic exists but is incomplete or approximated
- **❌ Gap** — CMO does it; RMOOZ doesn't yet
- **🚫 Deliberately out of scope** — RMOOZ will not build this (see Guardrail in APP_INVENTORY §TODO)

Rating scale per bucket:  
`★★★★★` = fully faithful to CMO · `★★★☆☆` = structurally aligned, key gaps · `★★☆☆☆` = foundational only · `★☆☆☆☆` = not started

---

## 1. Scenario Authoring & Build Order  **Rating: ★★★★☆**

CMO defines a strict 15-step canonical build sequence (spec `4-scenario-authoring.md` + exhaustive `scenario-authoring-part1/2.md`, 137 rules). RMOOZ's Edit Mode mirrors this sequence almost exactly.

### ✅ Matches CMO
| CMO Step | CMO Rule | RMOOZ Implementation |
|---|---|---|
| 1. Database/version first | Set DB before anything; gates unit pool | `model_version` + `schema_variant` fields; Edit Mode Step 1 |
| 2. Map/AO before units | Geography is load-bearing prerequisite | Edit Mode Step 2 — `map_bbox` + `ao_boundaries` (click-to-draw); validator enforces `obj.coord` inside bbox |
| 3. Sides | Name doesn't matter at creation; renameable | Edit Mode Step 3 — `sides[]` with EN/AR name/color |
| 4. Posture (directional) | A-hostile-to-B ≠ B-hostile-to-A; asymmetric matrix | Edit Mode Step 4 — `postures[from][to]` ∈ FRIENDLY/NEUTRAL/UNFRIENDLY/HOSTILE |
| 7. Time & duration | `current ≤ start + duration` enforced; don't exceed | Edit Mode Step 6 — `phase_table[]` + `steps[].time_label/elapsed_hours/phase`; Synthesize preset |
| 9. Units / OOB | Place units by side; groups/formations | Edit Mode Step 9 — Red OOB + Blue OOB via tree+detail+search (70 Red / 83 Blue at wargame3 scale) |
| 10. Objective & route | Objective + pipeline before missions | Edit Mode Step 8+9 — `obj{}`, `pipeline[]`, `throughput_ceilings_km`, click-to-draw on map |
| 11. BLS / areas | Area boundaries and defensive laydown | `bls_template[]`, `ao_boundaries[]` — click-to-draw polygon |
| 13. Adjudication baselines | Per-step test | `steps[].*_baseline` fields + scenario-validator |
| 14. Test & balance | Validate + Monte Carlo | `scenario-validator` 0-error check + MC runner (`/api/ai/mc/start`) |
| 15. Briefing | HTML/per-step narrative | Edit Mode Step 12 — per-step EN/AR briefing textareas |
| Build-order rail | Stepped ordered navigator | **13-step stepped left-rail** matching CMO's sequence; completion pills per step |
| New Scenario | Create-blank-first pattern | "+ New scenario" form → `buildStandardScenarioAuthoringTemplate()` |
| Save constantly | Version + revert | Save-to-server (`POST /api/scenarios`, 409 anti-clobber) + Save-As-JSON (Blob) |

### 🟡 Partial
| CMO Step | Gap |
|---|---|
| 6. Proficiency slider | CMO: Ace/Regular/Novice → affects reaction time, G-tolerance, min-altitude. RMOOZ: `red_units[].strength` (0–1 combat power) is a different axis — not proficiency. No `proficiency` field. |
| 8. Weather / terrain | CMO: temperature, rainfall, sky/cloud tier, wind/sea-state (all affect detection + performance). RMOOZ: `terrain_friction` + `terrain_note` text field only; no weather simulation. |

### ❌ Gaps
| CMO Step | CMO Rule Summary | Missing in RMOOZ |
|---|---|---|
| 5. Doctrine / ROE | Layered side→mission→unit hierarchy; WRA per target environment; per-setting designer lock | **No `doctrine{}` data block** in scenario schema. AI adjudicator uses prompt prose, not authored policy. Highest-value gap. **DOC1** is next planned PR. |
| 11. Missions (packages) | Structured mission objects (patrol/BARCAP/strike/SEAD) that OWN their own doctrine/WRA separately from the side's general forces | Only per-step `actors`/`affected` exist. **TASK1** is planned. |
| 12. Events (trigger → condition → action) | Event Editor: 11+ trigger types × conditions × scored actions; CMO scores with event rules | **No `events[]` rule engine**. Event Log is a read-only ledger (by design). Item #10 on roadmap. |
| Side flags: collective responsibility | Side-level "penalise side if civilians harmed" flag | Not in RMOOZ schema |
| Side flags: awareness level | Pre-set detection state at scenario start | Not in RMOOZ schema |
| Custom Environment Zones | Per-polygon weather overrides (rain inside a box, clear outside) | Not in RMOOZ; item #7 on roadmap (declarative, no physics engine) |
| Reference Points (relative/rotating) | Waypoints that track moving units (e.g. anchor to a ship) | Not in RMOOZ |

---

## 2. Doctrine, ROE & WRA  **Rating: ★★☆☆☆**

The most CMO-specific mechanic — 58 rules in `exhaustive/doctrine-adjudication.md`. Also the single biggest gap in RMOOZ.

### ✅ Matches CMO
| CMO Rule | RMOOZ |
|---|---|
| Salvo Pk formula `1−(1−pk)^n` | ENG1 (`shell/engagement.js`) uses exactly this formula |
| WRA Hold prevents firing | ENG1 `weapons_hold` reason in `computeEngagements` |
| Magazine decrement on fire | ENG1 clones and decrements magazine state |
| Fire-control channel gate | ENG1 `no_fire_control_channel` reason |
| Explainable non-shot reasons | ENG1 returns `reason`: out_of_range / winchester / weapons_hold / no_fire_control_channel |

### ❌ Gaps
| CMO Rule | RMOOZ Status |
|---|---|
| **Doctrine inheritance hierarchy** (side → mission → unit; most-specific wins) | Not built. No per-unit or per-side doctrine record exists. AI adjudicator uses prose prompts. |
| **Force-override flag** (side-level toggle overrides all missions/units) | Not built. |
| **Per-environment ROE** (air / surface / sub-surface independently) | ENG1 is a single-axis check; no per-environment split. `land == surface` distinction not modeled. |
| **WRA target-type binding** (WRA rows per target type within each environment) | Not built. No WRA record per unit. |
| **WRA salvo-size authored** (the # of missiles per salvo is a WRA parameter) | ENG1 uses a fixed salvo model. No authored salvo-count per unit/WRA. |
| **WRA firing-range bands** (max/75%/NEZ) — especially NEZ (No-Escape Zone) | ENG1 has max-range and approximate 75% checks; NEZ launch gate not implemented. |
| **Self-defense WRA** (separate axis: can fire even on Hold for self-defense) | Not in ENG1. A unit on Hold cannot engage at all in the current model. |
| **Unit proficiency** (Ace/Regular/Novice) → OODA reaction time, G-tolerance, missile evasion, min-altitude | Not in RMOOZ. `strength` is a combat-power scalar, not the proficiency axis. |
| **OODA loop** (reaction delay before engagement, based on proficiency + detection quality) | Not modeled. |
| **Targeting priority list** (ordered threat list; manual order overrides it) | Not in RMOOZ. AI adjudicator selects targets by LLM reasoning, not a structured priority list. |
| **Designer-lock per setting** (scenario author locks individual doctrine fields from player edit) | Not in schema. |
| **Mission re-defaults doctrine** (Sea Control silently overrides EMCON/RTB/radar) | No mission-type doctrine model. |
| **Collective responsibility** (side penalised for civilian harm) | Not in schema. |

---

## 3. Detection (Sensors / EW / IADS)  **Rating: ★★★☆☆**

197 rules across `exhaustive/sensors-ew-part1/2/3.md`. RMOOZ has a clean CMO-formula detection engine (DET1) but the full EW/IADS/jamming stack is deliberately out of scope.

### ✅ Matches CMO
| CMO Rule | RMOOZ |
|---|---|
| Radar-horizon LOS formula `1.23(√h₁ + √h₂)` nm | DET1 (`shell/detection.js`) implements this verbatim |
| RCS range scaling `R_ref·(σ/σ_ref)^¼` | DET1 implements this formula |
| EMCON gating (emitting = detectable) | DET1 binary EMCON check: silent unit not detected by radar |
| ESM passive detection (~1.5× emitter range) | DET1 ESM passive rule: `1.5× emitter's sensor range` |
| Detection confidence (firm / tentative) | DET1 returns confidence; overlay renders filled vs hollow markers |
| Detection method tagging | DET1 tags: radar / esm / visual per contact |
| Own-side never appears as contact | DET1 engine-gated (side check before contact creation) |
| Coverage rings visual | Live per-unit sensor+weapon rings from DB-Lite values; tooltip tags resolved DB class |
| Detection contacts live overlay | DET1 wired to adjudicator map; updates per step |

### 🟡 Partial
| CMO Rule | RMOOZ |
|---|---|
| RCS / domain altitude defaults | DB-Lite (`shell/world-state-db.js`) assigns domain-based defaults; CMO uses per-unit DB values. RMOOZ's catalog is class-based, not per-unit. |
| Terrain masking (LOS) | DET2 hook exists in DET1's interface but not implemented — the formula and hook are wired but the actual terrain-masking computation returns no-obstruction. Libya DEM exists but LOS raycast not plugged in. |

### ❌ Gaps (in scope for RMOOZ but not yet built)
| CMO Rule | Gap |
|---|---|
| Multiple EMCON levels | CMO has graduated EMCON (levels 1–5+, each permitting different emissions). RMOOZ has binary on/off. |
| IFF gating | CMO requires a positive IFF return before firing (identification gating). Not in ENG1's decision chain. |

### 🚫 Deliberately NOT building
- Radar band/wavelength simulation (A-band vs J-band, long-wave sees stealth)
- Jamming burn-through, noise-jamming (ECM/DECM)
- SEAD/DEAD as a simulation mechanic
- Offensive ECM stacking, home-on-jam
- IADS network integration (kill-chain from search radar → fire-control radar → SAM)
- SAM internals (two-stage missile flight, loft model)
- ESM triangulation / cross-fixing
- Satellite / OTH detection

---

## 4. Engagement & Weapons  **Rating: ★★★☆☆**

211 rules across `exhaustive/strike-weapons-part1/2/3.md`. RMOOZ has the core CMO engagement pipeline (ENG1). The naval/advanced-weapons stack is deliberately out of scope.

### ✅ Matches CMO
| CMO Rule | RMOOZ |
|---|---|
| Salvo Pk formula `1−(1−pk)^n` | ENG1 |
| Detection-gated engagement (must be detected to be targeted) | ENG1 requires DET1 contact before an engagement is valid |
| Magazine (winchester) gating | ENG1 checks ammo; `winchester` reason if empty |
| Range gating | ENG1 checks `max_range_nm` from weapon DB-Lite |
| Explainable reasons per non-shot | ENG1 `reason` field per blocked engagement |
| Firing-solutions visual overlay | ENG1 live wired: shooter→target dotted lines, weight ∝ Pk |
| Engagement arcs (authored kill outcomes) | Per-step `engagement_arcs[]` in scenario → APP-6 axis arrows + attrition visuals |

### 🟡 Partial
| CMO Rule | RMOOZ |
|---|---|
| Weapon class capabilities | DB-Lite (`shell/world-state-db.js`) holds class-based ranges; CMO holds per-weapon-record precision. RMOOZ is role→class, not unit→weapon-record. |
| Point defense / autonomous fire | ENG1 models "fire-control channels" as a gate; no full autonomous-point-defense Pk ladder |

### ❌ Gaps (in scope for RMOOZ)
| CMO Rule | Gap |
|---|---|
| NEZ (No-Escape Zone) launch gate | CMO: WRA fires when the DLZ boundary (NEZ) is reached regardless of other rules. ENG1: range-band check only, no NEZ. |
| WRA salvo-size authored per unit | CMO: salvo count is a WRA parameter per unit/target type. ENG1: fixed model. |
| Chaff / spoof soft-kill | CMO: defensive countermeasures reduce Pk via a dice roll on the terminal leg. Not in ENG1. |

### 🚫 Deliberately NOT building
- Mine warfare (fuse types, laying methods, sweeping)
- Unguided bombing (bomb-sight tiers, altitude gates, stick patterning)
- Guidance taxonomy (LGB/GPS-INS/SARH/ARH/IR — weapon guidance fidelity)
- Naval point defense Pk ladder (CIWS, SARH short-range SAMs)
- Ballistic missile trajectory / interceptor engagement
- EMP (omnidirectional vs directional)
- Hypersonic flight profile (HGV energy bleed)
- Naval mine warfare
- Coordinated anti-ship salvo time-on-target math

---

## 5. Ground & Movement  **Rating: ★★★☆☆**

97 rules in `exhaustive/ground-movement.md`. RMOOZ has continuous movement and basic unit composition; the logistics and per-component damage model are deferred/out-of-scope.

### ✅ Matches CMO
| CMO Rule | RMOOZ |
|---|---|
| Continuous movement (no teleport) | MOVE1 (`wargame/movement-playback.js`) — lerps markers between step positions over wall-clock; matches "units glide" CMO feel |
| Units placed before missions | Edit Mode: OOB placement before mission/events steps |
| Unit roles / echelon | `red_units[].role`, `echelon` fields; DB-Lite `classifyKind` by role |
| Echelon aggregation at wide zoom | Echelon roll-up: division↔units collapse to one aggregate icon on zoom-out; CMO-style |
| Movement trails per step | AN4 (`renderMovementTrails`) — polylines from `*_unit_step_prev`/`_coords` |
| Formation hover-peek | `setFormationPeek` — hover temporarily expands a rolled-up formation |

### 🟡 Partial
| CMO Rule | RMOOZ |
|---|---|
| Terrain friction | `terrain_friction` field in `bls_template`; not fed into MOVE1 speed (no speed formula). CMO: no per-vehicle speed (uniform), but terrain affects route. |
| Per-unit coordinates | Edit Mode forces `coord` field; "Pick coord on map" single-click. CMO uses Insert-then-drag. |

### ❌ Gaps
| CMO Rule | Gap |
|---|---|
| Multi-vehicle / component model | CMO: a "unit" is N component vehicles (dispersal radius 80 m); badge shows count; each individually killable. RMOOZ: units are atomic. No component count, no dispersal radius. |
| Per-component kill | CMO: destroying a platoon requires killing each component. RMOOZ: unit is destroyed as a whole. |
| Ground-unit fuel | CMO: single ground units carry finite fuel; replenishment from a fuel bowser. RMOOZ: no fuel field (deliberately deferred). |
| Infantry sections model | CMO: platoon = sections ≈ 5 soldiers; organic mounts; copy vs clone distinction. RMOOZ: units are a single record. |
| Mobile facility vs ground unit | CMO: mobile facility = aggregate platoon (no fuel); ground unit = single detailed vehicle (has fuel, mounts). RMOOZ: one unit type. |

### 🚫 Deliberately NOT building
- Fuel logistics (bowser replenishment, supply chains)
- Maintenance / reliability / crew availability (flagged as future gate/multiplier)
- Cargo missions / container-based logistics

---

## 6. Naval & Subsurface  **Rating: 🚫 Not in scope**

112 rules in `exhaustive/naval-subsurface.md`.

RMOOZ is scoped to **ground and amphibious operations**. Naval/subsurface simulation (sonar, submarine tactics, torpedo guidance, UNREP, port basing) is deliberately excluded.

🚫 Not building: sonar (active/passive), submarine patrol, torpedo guidance, surface combatant AAW/ASW, ship launch delays, port damage and repair, UNREP, anti-ship missile saturation.

---

## 7. Logistics & Basing  **Rating: ★☆☆☆☆ (by design)**

74 rules in `exhaustive/logistics-basing.md`.

RMOOZ has no logistics simulation by design. The roadmap defers logistics as a future "gate/multiplier" layer.

### ✅ Matches CMO (structural only)
- Scenario has `bls_template[]` defining defensive basing positions (Beach Landing Sites) — a structural analog to CMO's base placement

### 🚫 Deliberately NOT building
- Airfield structure (runway/taxiway/access points/parking/revetments/hangars/ammo-fuel dumps)
- Aircraft turnaround / sortie accounting / ready-arm cycle
- Cargo model (containers, manual load/unload, cargo missions)
- Underway Replenishment (UNREP)
- Air refuelling (buddy refuelling, refuel waypoints)
- Fuel/range estimation (speed-vs-fuel curve)
- Port structure and damage/repair

---

## 8. General Tactics & Employment  **Rating: ★★★☆☆**

37 rules in `exhaustive/general-tactics.md`.

RMOOZ doesn't simulate tactics (LLM adjudicator does this), but many visual/operational outputs match CMO:

### ✅ Matches CMO
- APP-6 mission graphics (axis-of-attack / counterattack-axis arrows) from `engagement_arcs` → CMO-style visual
- Echelon-scaled unit symbols (CMO-style zoom-dependent aggregation)
- Event pins with provenance (actor / intended effect / doctrine) per step
- SIDC family-symbol resolver — honest category-level fallback (never invents symbols)
- Before/after step compare via scenario-workspace preview strip
- Per-step attrition visuals (destroyed/degraded marker treatment, same as CMO's live unit degradation)

### ❌ Gaps
- Targeting priority (manual override of the AI's target selection is not a structured operator affordance)
- Formation editor (CMO lets you arrange units in a physical formation before assigning a mission; RMOOZ has the visual hover-peek but no formation editor)

---

## 9. Terrain & Environment  **Rating: ★★★☆☆**

22 rules in `exhaustive/terrain-environment.md`.

### ✅ Matches CMO
| CMO Rule | RMOOZ |
|---|---|
| Real terrain elevation (DEM) | Libya DEM (`client/dem-layer.js` 2D + Cesium 3D `CustomHeightmapTerrainProvider`; `/api/dem/*`); real Libya relief at 1.6× vertical exaggeration |
| Terrain affects visibility | `terrain_friction` structural field; DEM exists for raycast |
| 3D globe with elevation | Cesium view with DEM terrain |

### ❌ Gaps
| CMO Rule | Gap |
|---|---|
| Terrain LOS masking (in detection engine) | DET2 hook declared in DET1 but not implemented — Libya DEM exists but LOS raycast not plugged into `computeContacts`. |
| Weather simulation | CMO: temperature/rainfall/sky tiers/wind/sea-state all degrade sensor ranges and affect performance. RMOOZ: `terrain_note` text only. Item #7 on roadmap. |
| Day/night lighting (detection range changes) | Not modeled. CMO changes visual detection range by time-of-day. |
| Custom Environment Zones | Per-polygon weather regions. Item #7 on roadmap. |

---

## 10. AI Adjudication (RMOOZ-specific, no direct CMO analog)

CMO adjudicates purely deterministically — every rule is applied programmatically. RMOOZ's thesis is **AI-assisted adjudication** where an LLM proposes outcomes and a human operator reviews/accepts/rejects.

| Capability | Status |
|---|---|
| Per-step LLM adjudicator | ✅ `ai/adjudicator-agent.js` → `/api/sim/propose` |
| Operator Accept / Reject / Hold | ✅ `shell/ai-proposal-panel.js` + `ai-proposal-commit-bridge.js` |
| Durable journal (audit trail) | ✅ `sim/journal.js` → append-only `data/journal/<runId>.jsonl` |
| Monte Carlo probability distribution | ✅ `ai/monte-carlo-runner.js` N trials + SSE streaming |
| Red-team / Blue-team agents | ✅ `/api/ai/red-team/propose`, `/api/ai/blue-team/propose` |
| COA (Courses of Action) | ✅ `/api/ai/coa` (3–5 options, schema-validated) |
| World State Transition Engine (WS3) | ✅ `shell/world-state-transition.js` — MOVE/ENGAGE/EMCON/WRA/RESUPPLY decisions; recomputes contacts after every decision |
| Deterministic sim seam (server) | ✅ `sim/world-state-engine.js` → `/api/sim/decide` |
| Explainable effects changelog | ✅ WS3 returns `effects[]` per decision — feeds DOC1/AI |
| Feedback / lesson learning | ✅ `ai/feedback-store.js` + `lesson-store.js` + `learning-store.js` (feeds adjudicator prompt with MC priors) |

**CMO analog gap:** CMO's adjudicator is purely rule-based (every unit fires or doesn't fire, per WRA + ROE + proficiency + OODA). RMOOZ's adjudicator is LLM-driven. Until **DOC1** lands, AI proposals cite prose rules rather than authored per-unit doctrine. This is the central trust/auditability gap.

---

## Summary Table

| Domain | CMO Rules | RMOOZ Rating | Key Gap |
|---|---|---|---|
| Scenario Authoring | 137 | ★★★★☆ | Doctrine/ROE step, Missions step, Events engine |
| Doctrine / ROE / WRA | 58 | ★★☆☆☆ | Entire doctrine data model missing — **DOC1 is #1 priority** |
| Detection (Sensors/EW) | 197 | ★★★☆☆ | Terrain LOS, graduated EMCON, IFF (EW/IADS deliberately out) |
| Engagement / Weapons | 211 | ★★★☆☆ | NEZ, WRA salvo-size, soft-kill (most of this bucket deliberately out) |
| Ground & Movement | 97 | ★★★☆☆ | Component model, fuel (logistics deliberately out) |
| Naval & Subsurface | 112 | 🚫 | Deliberately out of scope |
| Logistics & Basing | 74 | ★☆☆☆☆ | Deliberately out of scope (future gate layer) |
| General Tactics | 37 | ★★★☆☆ | Targeting priority, formation editor |
| Terrain & Environment | 22 | ★★★☆☆ | LOS masking not plugged in, no weather sim |

---

## Top 5 Gaps to Close (by value to "feel like CMO")

1. **DOC1 — Doctrine/ROE/WRA data layer** *(next PR planned)*  
   Add a `doctrine{}` block to the scenario schema: per-side WRA rows (Free/Tight/Hold per air/surface/sub-surface), salvo counts, firing-range bands (max/75%/NEZ). Wire it so the AI adjudicator cites authored policy, not prose. This single PR closes the biggest auditability gap and is the CMO "heart."

2. **Terrain LOS in DET1 (DET2 hook)**  
   The DET2 hook already exists in `detection.js`. Plugging the Libya DEM raycast into it makes detection feel genuinely terrain-aware — units behind ridges go silent, hilltop radars see further. This is a concrete "alive" improvement.

3. **Graduated EMCON + IFF gating in ENG1**  
   Multi-level EMCON (not just binary) + an IFF pass before ENG1 fires. CMO's "why won't it fire" checklist starts here.

4. **TASK1 — Structured Missions/Tasking view**  
   A read-only ATO-like rollup synthesised from `steps[].actors`. Makes multi-unit coordination visible to the operator, matching CMO's mission-assignment flow visually.

5. **Events declarative rule object**  
   A `events[]` array in the scenario with trigger/condition/outcome (declarative, no code). The Event Log becomes an output of these rules rather than a hand-written ledger.

---

## What RMOOZ Does That CMO Does NOT

| RMOOZ Capability | Notes |
|---|---|
| LLM-generated proposals with human Accept/Reject | CMO is fully automated — no operator review loop |
| Audit journal (durable append-only `data/journal/`) | CMO has no operator decision record |
| Monte Carlo probability distributions | CMO has no probabilistic scenario analysis |
| 3D Cesium globe with real DEM terrain | CMO's 3D is limited; RMOOZ has real Libya elevation |
| Operator identity on commit (`operator_id`) | CMO has no operator identification in the simulation record |
| Arabic/RTL UI | CMO is English-only |
| AI-generated COA (3–5 options) | CMO has no AI-driven course-of-action generation |

---
*Sources: `docs/cmo-functional-rules/exhaustive/` (945 rules), `docs/cmo-functional-rules/5-build-playbook.md`, `APP_INVENTORY.md` (audit HEAD `0efdf17`, 2026-06-02)*
