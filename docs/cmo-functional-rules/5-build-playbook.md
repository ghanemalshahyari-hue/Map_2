# CMO-Faithful Scenario Build Playbook (worked example → `sample-sahil-corridor.json`)

**Goal.** Build a scenario by following CMO's actual authoring order *video-by-video*, applying the
caption-grounded rules in [`1`–`4`](README.md), so the result follows CMO exactly. The worked
output is **[`sample-sahil-corridor.json`](sample-sahil-corridor.json)** — a small, complete
ground/amphibious scenario that **passes the real RMOOZ validator** (`ok: true`, 0 errors).

**Approach = Hybrid + flag gaps** (your choice): follow CMO's build *sequence* and the applicable
rules, but instantiate them in RMOOZ's ground/amphibious model (`BLS_STATUS`, `phase_line_km`,
`force_ratio`, `EW_BANDS`). Where a CMO mechanic has **no RMOOZ representation**, the step is marked
**⚠️ GAP** — that list is the build backlog (it lines up with "what we haven't done re: CMO").

**Schema ground-truth** (so we don't invent fields): `server/ai/scenario-schema-spec.js` +
`scenario-validator.js`. Every field below is a real key from that contract.

> **How to use:** read a step's *CMO rule* (with its source video), then its *RMOOZ action* (the
> exact field set in the JSON). Build top-to-bottom; the order is load-bearing. Re-validate after
> edits with the snippet in §Validation.

---

## Build order at a glance (CMO sequence → RMOOZ field)

| # | CMO step (spec 4) | RMOOZ field(s) | Status |
| --- | --- | --- | --- |
| 1 | Database / version | `model_version`, `schema_variant` | ✅ |
| 2 | Map / area of operations | `map_bbox`, `ao_boundaries` | ✅ |
| 3 | Sides | `sides[]` | ✅ (schema; author it) |
| 4 | Posture (directional) | `postures[from][to]` | ✅ (schema; author it) |
| 5 | Doctrine / ROE | — | ⚠️ GAP (no data model) |
| 6 | Side flags / proficiency | `red_units[].strength` (proxy) | ⚠️ partial |
| 7 | Time & duration | `phase_table[]`, `steps[].time_label/elapsed_hours/phase` | ✅ |
| 8 | Weather / terrain | `terrain_note`, `bls_template[].terrain_friction` | 🟡 terrain only |
| 9 | Units / OOB | `red_units[]`, `blue_units_initial[]`, `blue_units_base_ids[]`, `bls_template[]` | ✅ |
| 10 | Objective & advance route | `obj{}`, `pipeline[]`, `throughput_ceilings_km` | ✅ |
| 11 | Missions (packages) | — | ⚠️ GAP (use per-step `actors`/`affected` instead) |
| 12 | Events (trigger→cond→action) | — | ⚠️ GAP (Event Log is a ledger, not rules) |
| 13 | Per-step adjudication baselines | `steps[].*_baseline` | ✅ (RMOOZ-specific) |
| 14 | Test & balance | `scenario-validator` + Monte Carlo runner | ✅ |
| 15 | Briefing | `scenario_label`, `narrative_*_baseline` | ✅ |

---

## Step 1 — Database / version first
**CMO rule** *(Scenario Editor `vy5glbQ1G6k`; spec 4 §Build order)*: the database is chosen **first**
and gates which units exist; it is destructive to change later. Stamp a version.
**RMOOZ action:** set provenance/version metadata.
```json
"name": "sample-sahil-corridor",
"scenario_label": "Sahil Corridor — Coastal Corridor Defense (CMO build-order sample)",
"model_version": "cmo-playbook-v1"
```
RMOOZ has no unit *database* (units are authored inline), so "database" maps to version metadata
only. `name` **must equal the on-disk filename** (loader enforces).

## Step 2 — Define the operational area before units
**CMO rule** *(Scenario Editor `vy5glbQ1G6k`; Area Creation `rj1AM-xUycU`)*: set geography/areas
before placing units. **RMOOZ action:** `map_bbox` = `[lon_min, lat_min, lon_max, lat_max]`, plus
optional `ao_boundaries` polygons. Validator requires `obj.coord` to fall inside `map_bbox`.
```json
"map_bbox": [18.0, 29.8, 19.8, 30.9],
"ao_boundaries": [{ "name": "AO SAHIL", "coords": [[18.2,29.95],[19.6,29.95],[19.6,30.75],[18.2,30.75]] }]
```

## Step 3 — Create sides
**CMO rule** *(Doctrine Settings `XjfL2uNhGR0`; spec 2)*: sides exist before posture/doctrine.
**RMOOZ action:** author `sides[]` explicitly (loader would otherwise default BLUE/RED/NEUTRAL — but
CMO practice is to author them, and spec 4 flags side flags as set *at placement time*).
```json
"sides": [
  { "id": "BLUE", "name_en": "Blue (Defender)", "name_ar": "الأزرق (المدافع)", "color": "#3a76c2" },
  { "id": "RED",  "name_en": "Red (Amphibious Assault)", "name_ar": "الأحمر (الإنزال البرمائي)", "color": "#c23a3a" }
]
```

## Step 4 — Posture is directional
**CMO rule** *(Doctrine Settings `XjfL2uNhGR0`; spec 2 — "A-hostile-to-B ≠ B-hostile-to-A")*: posture
is an asymmetric matrix. **RMOOZ action:** author `postures[from][to]` ∈ `FRIENDLY|NEUTRAL|UNFRIENDLY|HOSTILE`.
```json
"postures": {
  "BLUE": { "RED": "HOSTILE", "BLUE": "FRIENDLY", "NEUTRAL": "NEUTRAL" },
  "RED":  { "BLUE": "HOSTILE", "RED": "FRIENDLY", "NEUTRAL": "NEUTRAL" }
}
```

## Step 5 — Doctrine / ROE  ⚠️ GAP
**CMO rule** *(Doctrine Settings `XjfL2uNhGR0`, WRA `YepPcVyCtnA`, WRA↔Doctrine `H4_mmTVn_Yk`; spec 2)*:
doctrine is a **layered policy** (side→mission→group→unit) over WRA (Free/Tight/Hold), self-defense,
EMCON, fuel/withdrawal, with a per-setting *editable* lock; children inherit unless they override.
**RMOOZ status:** **no scenario field exists** for doctrine/WRA/ROE. The AI adjudicator uses prompt
prose, not authored policy. **Build backlog:** a `doctrine{}` block + WRA state machine per spec 2
(this is the single highest-value engine gap — it's what makes a unit "decide to fire the CMO way").

## Step 6 — Side flags / proficiency  ⚠️ partial
**CMO rule** *(Unit Proficiency `NPvpb7s5SNE`; spec 2)*: proficiency = **Ace / Regular / Novice**,
stamped at placement; affects reaction time, missile evasion, min-altitude, G-tolerance (NOT
detection or Pk). **RMOOZ status:** no proficiency field; closest proxy is `red_units[].strength`
(0–1 combat power), which is *not* the same axis. **Build backlog:** add `proficiency` per unit +
wire it to adjudication timing.

## Step 7 — Time & duration → the clock
**CMO rule** *(Scenario Editor `vy5glbQ1G6k`; spec 4 — separate current-time vs start-time;
duration > 0)*. **RMOOZ action:** `phase_table[]` is the clock (one row per step), mirrored by each
`steps[]` row's `time_label`/`elapsed_hours`/`phase`. **Validator hard rule:**
`phase_table.length === steps.length`. Phase strings use the `PHASES` enum
(`PRE-H, PHASE 1, PHASE 2A, PHASE 2B, PHASE 3, RESOLUTION`).
```json
"phase_table": [
  { "index": 0, "time_label": "H-3",  "elapsed_hours": -3, "phase": "PRE-H" },
  { "index": 1, "time_label": "H+0",  "elapsed_hours": 0,  "phase": "PHASE 1" }
  /* …4 more, total 6 = steps.length */
]
```

## Step 8 — Weather / terrain  🟡 terrain only
**CMO rule** *(Land Cover `2SJDdTiuRPs`, spec 1 — denser/sloped cover slows movement & cuts spotting;
weather degrades high-freq sensors)*. **RMOOZ action:** `terrain_note` (free text, fed to the
adjudicator) + per-BLS `terrain_friction` (0–1). **GAP:** no `weather`/`sea_state` field — sea state
matters for an amphibious landing but can't be authored today.
```json
"terrain_note": "Coastal plain with wadis channeling the advance; sabkha west of BLS-WEST restricts heavy vehicles.",
"bls_template": [ { "name": "BLS-WEST", "coord": [18.55,30.18], "terrain_friction": 0.55, "permanently_limited": true } ]
```

## Step 9 — Units / OOB (Red, Blue, landing sites)
**CMO rule** *(Building a Mission `ixu2x6doLFA`; Ground Units; spec 4 — import grouped then trim;
roles drive behavior)*. **RMOOZ action:** three required arrays.
- `bls_template[]` — Beach Landing Sites: `{name, coord}` (+ role/throughput/terrain_friction). The
  amphibious anchor RMOOZ models that CMO handles via ports/airfields.
- `red_units[]` — `{uid, label, bls, appear, role, coord}`. **Validator rules:** `bls` must match a
  `bls_template.name`; `appear` ∈ `[0..steps-1]`. Use the maneuver `role` names the renderer knows
  (`Main effort, Fixing, Support, External envelopment, Follow-on, Exploitation, Recon`) so the map
  draws the right attack graphic (spec 1 / map renderer).
- `blue_units_initial[]` — `{unit_uid, base_id, coord}`; `blue_units_base_ids[]` lists the base ids 1:1.
```json
"red_units": [
  { "uid": "RED-1", "label": "1st Mech Bde", "bls": "BLS-CENTER", "appear": 0, "role": "Main effort", "coord": [18.85,30.22], "strength": 1.0 }
]
```

## Step 10 — Objective & advance route
**CMO rule** *(Building a Mission `ixu2x6doLFA`; Reference Points / route geometry)*. **RMOOZ action:**
`obj{name, coord, target_depth_km, carver}` (**`carver` must be integer 0..60**), the Red advance
`pipeline[]` (≥2 `[lon,lat]` waypoints), and `throughput_ceilings_km` (hard km caps per time
checkpoint — RMOOZ's logistics-realism lever, spec 4 throughput discipline).
```json
"obj": { "name": "OBJ HARBOR", "coord": [19.20,30.45], "target_depth_km": 40, "carver": 6, "radius_km": 6 },
"pipeline": [ [18.70,30.20], [18.85,30.24], [19.00,30.30], [19.10,30.36], [19.18,30.42], [19.20,30.45] ],
"throughput_ceilings_km": { "H12": 8, "H24": 18, "H48": 30, "H72": 38, "H120": 42 }
```

## Step 11 — Missions / packages  ⚠️ GAP
**CMO rule** *(Building a Mission `ixu2x6doLFA`; spec 4)*: missions are packages with roles
(striker/escort/tanker/AEW/SEAD), target sets, prosecution/transit areas. **RMOOZ status:** no
`missions[]`; intent is expressed per step via `actors[]`/`affected[]`/`engagement_arcs[]`
(W3-rich) + the Decision/AI-Proposal flow. **Build backlog:** a `missions[]` layer (spec 4 shape) if
tactical packages are ever in-domain.

## Step 12 — Events (trigger → condition → action)  ⚠️ GAP
**CMO rule** *(Event Editor `TCApvEgog4U`; spec 4 — each event = name + Repeatable + Probability,
composed of Trigger(s) → Condition(s) → Action(s); evaluated `(trigger) AND (all conditions) → run
actions`)*. **RMOOZ status:** no structured `events[]`; the Event Log is a *ledger of what happened*,
not *rules that fire*. **Build backlog:** an `events[]` schema per spec 4's enumerated trigger/
condition/action types (keep firings logged as timeline facts, honor the read-only boundary).

## Step 13 — Per-step adjudication baselines (RMOOZ-specific)
This is RMOOZ's analogue to "the AI/adjudication setup": each `steps[]` row carries the baseline
state the adjudicator falls back to. Only `objective_status_baseline` is enum-checked
(`OBJECTIVE_STATUS = DORMANT|THREATENED|CONTESTED|CAPTURED|DENIED`); the rest are advisory.
```json
{
  "index": 2, "time_label": "H+12", "elapsed_hours": 12, "phase": "PHASE 2A",
  "phase_line_km_baseline": 15, "objective_status_baseline": "CONTESTED",
  "bls_status_baseline": { "BLS-CENTER": "SECURE", "BLS-EAST": "CONTESTED" },
  "force_ratio_baseline": "3.0:1", "ew_effect_baseline": "Heavy",
  "logistics_state_baseline": "Building combat power ashore"
}
```
The arc across the 6 steps follows a coherent operation: `DORMANT → THREATENED → CONTESTED → …→
DENIED`, `phase_line_km` rising toward (and capped by) `throughput_ceilings_km`, `EW_BANDS` decaying
`Idle→Active→Heavy→…→Idle`, `force_ratio` eroding as Red culminates. This is where CMO's *runtime*
behavior rules (specs 1–3) should constrain the numbers — e.g. don't let `phase_line_km` exceed the
throughput ceiling for the elapsed hour.

## Step 14 — Test & balance
**CMO rule** *(spec 4 — iterate test runs to catch range/fuel/realism failures)*. **RMOOZ action:**
run the validator (below) + the Monte Carlo runner before trusting a scenario.

## Step 15 — Briefing last
**CMO rule** *(spec 4 — briefing written last, after the scenario is stable)*. **RMOOZ action:**
`scenario_label` + per-step `narrative_en_baseline`/`narrative_ar_baseline` (Arabic-first).

---

## Validation (run after any edit)
```bash
node -e "const v=require('./UI_MOdified/server/ai/scenario-validator.js');const s=require('./docs/cmo-functional-rules/sample-sahil-corridor.json');const r=v.validateScenario(s);console.log('ok:',r.ok,'errors:',r.errors.length);console.log(v.formatErrors(r.errors));"
```
Current result: **`ok: true`, 0 errors**, 5 warnings (all "count smaller than wargame1/2 norm" —
expected for a compact sample; raise counts to silence).

## ⚠️ Gap summary — CMO functions this build could NOT represent
| CMO function | Why it can't be authored today | Spec ref |
| --- | --- | --- |
| **Doctrine / WRA / ROE** | no scenario field; adjudicator uses prompt prose | spec 2 |
| **Unit proficiency** | no field; `strength` is a different axis | spec 2 §Proficiency |
| **Weather / sea state** | only `terrain_note` + `terrain_friction` exist | spec 1 |
| **Missions / packages** | no `missions[]`; per-step actors/arcs instead | spec 4 |
| **Event Editor (rules)** | Event Log is a ledger, not trigger→cond→action | spec 4 §Event Editor |
| **Sensors/EW/IADS detail** | only a broad `EW_BANDS` scale | spec 1 |
| **Damage/Pk model** | adjudicator/MC, not authored weaponeering | spec 3 |

These are the concrete "mimic-CMO" build items, ordered by leverage: **Doctrine/WRA first** (drives
fire decisions), then **proficiency** and **events**, then the tactical layers if they're ruled
in-domain.

## To load this scenario in the app
Copy to the scenarios dir (filename must equal `name`) and pick it in the adjudicator panel:
```
cp docs/cmo-functional-rules/sample-sahil-corridor.json UI_MOdified/data/scenarios/sample-sahil-corridor.json
```
(It will render markers + the salient/advance graphics; the rich per-step animation is gated on
`schema_variant === "w3-rich"`, which this sample deliberately does not claim — see the P0B coverage
gap.)
