# CMO Operating-Model Reference → RMOOZ Mapping & Adoption Roadmap

> **Purpose.** A durable reference so we never re-read the 425-page manual or rebuild something
> RMOOZ already has. It captures *how the real Command: Modern Operations (CMO) reasons about
> combat*, maps each concept to RMOOZ's current code (with file paths), and lays out a roadmap that
> respects the locked architecture.
>
> **Source.** `CMO manual EBOOK.pdf` (U:\SteamLibrary\…\Command - Modern Operations\Manuals),
> read sections: Important Terms / Fundamentals (pp.19–26), Doctrine/ROE/WRA/EMCON (pp.54–72),
> Combat — sensors, weapons, battle, EW, damage (pp.280–323), the **"My weapon won't fire"**
> checklist + DLZ (pp.309–322), Events/Triggers/Actions + Scoring (pp.124–146), Unit Status /
> Contact-Report panel (pp.84–91). (The 13 "Command Live" issues are narrative scenario DLC, not
> mechanics — not covered here.)
>
> **Stance (locked).** RMOOZ is a scenario-**adjudication** tool, not a wargame engine. We mirror
> CMO's *way of reasoning* (explainable detection / engagement / doctrine) using **our own
> class-based values, public physics, and read-only evidence** — never CMO data, never new mutating
> behavior. See `[[project_world_state_connection_central]]`,
> `[[project_doctrine_a_evidence_source]]`, `[[feedback_ai_sim_boundary_rules]]`.

> ⚠️ **This doc is a COMPANION, not a new authority.** The **single source of truth for CMO
> behavior** is already in-repo: **`docs/cmo-functional-rules/exhaustive/`** (945 caption-grounded
> rules, 9 buckets), and the **chosen build roadmap is the guardrailed "CMO→RMOOZ capability
> roadmap" (items 1–10) in `APP_INVENTORY.md`**. That guardrail is binding: *build only what's on
> that chosen list; do not invent CMO mechanics off-list.* This file adds the **official manual's
> narrative model** (the captions are video-sourced; this is the printed manual) as grounding, and
> in §3 it **maps onto the existing chosen items** rather than proposing parallel ones. If something
> here looks worth building and isn't on the chosen list, add it there first (citing the rule file),
> get it chosen, *then* build.

---

## 1. How CMO operates (the model)

### 1.1 Core objects
- **Units** are the entities. Many *house* other units (carrier→aircraft, airbase→hangar→aircraft).
  Special units (missiles, sonobuoys) may not be directly controllable.
- **Groups** — units bound together (drag-select + `G`); aerial missions auto-group by flight size.
- **Mounts** — weapon/sensor hardpoints on a unit (gun mount, aircraft pylon, sonobuoy dispenser).
  A mount holds loaded ammunition; reload pulls from a **Magazine**.
- **Magazines** — storage of weapon records; must contain stock for a mount to fire / a sortie to launch.
- **Missions** — let units share a common task (ASW, strike, patrol) under their own ROE/Doctrine/Posture.
- **Formations** — a lead + escorts, each with a station and a primary task.

### 1.2 The combat loop: identify → engage → resolve
CMO frames every engagement in explicit steps (manual §9.2):
1. **Identification.** Targets/threats must be *resolved* — this takes time governed by the unit's
   proficiency and **OODA clock** (delay between first detection and being able to target/engage;
   higher proficiency = shorter clock). Surprise threats can beat the clock → fatal.
2. **Engage.** Move into envelope and fire — gated by sensors *and* weapon capability, not just range.
3. **Resolve.** Endgame calc (Pk, DECM spoof chance, damage), then damage/fire/flood model over time.

### 1.3 Sensors (the "see them first" half)
Four families, with an **active-vs-passive asymmetry** at the heart of the model:
- **Radar** (active): generation matters hugely — mechanical scan → frequency-agile → AESA. Affects
  jam-resistance, NCTR (target ID), field-of-view limits, ground-clutter rejection. Active emitters
  can be *detected farther than they can see* ("a flashlight in the dark").
- **ESM** (passive): detects radar/jammer emissions; imprecise alone, but **multiple ESM units
  triangulate**. Crude RWR → advanced classifiers that name the emitter type.
- **Optical / EO/IR** (passive): confirm identity, no emissions, but "looking through a straw" FOV
  and only precise at short range; heavily weather/temperature-dependent.
- **Sonar** (active precise but loud / passive quiet but vague), plus **PCLS** (passive coherent
  location off ambient RF — early-warning only, needs a real sensor for a targeting track) and
  **MAD** (bearing-only, no range).

### 1.4 Weapons & guidance
Unguided (guns/bombs/rockets — accuracy ∝ FCS + crew + range), ballistic missiles (full trajectory
modeled), and guided families: inertial, optical, IR (stern-chase / rear-aspect / all-aspect),
SARH, SAL, **ARH** (note: ARH ≠ fire-and-forget — usually needs launch-platform illumination first).
Boost-coast kinematics mean a missile is fast only briefly → maneuvering/dragging defeats it.

### 1.5 Doctrine / ROE / WRA / EMCON (the behavior controls)
Settings **inherit** down a hierarchy: **side → mission → unit** (override prompts on conflict).
Key levers (manual §3.3.12–3.3.16):
- **Weapons Control Status** per domain (air/surface/subsurface/land): **FREE** (fire at anything not
  confirmed friendly) / **TIGHT** (confirmed hostile only) / **HOLD** (manual only).
- **Engage Ambiguous** — *ignore / optimistic (uncertainty < 3× weapon tolerance) / pessimistic
  (< 1× tolerance)*. This is the doctrine knob behind the DLZ/ambiguity no-fire reasons below.
- **Engage Opportunity**, **Maintain Standoff**, **Kinematic vs practical range**, BVR logic
  (straight-in / crank / crank-and-drag), fuel & weapon states (Bingo/Joker; Winchester/Shotgun).
- **EMCON** — per emitter category (radar / active sonar / OECM): **ACTIVE** or **PASSIVE**, with
  **side alert levels Green→Blue→Orange→Yellow→Red** and **intermittent emissions** (timed/random/
  threat-cued) so you can use active sensors without "blaring them constantly."

### 1.6 The "My weapon won't fire" checklist — CMO's explainability gold (pp.309–322)
A manual weapon assignment runs an *exhaustive checklist*; each failure is a **named, human-readable
reason**. This is the single most relevant CMO idea for RMOOZ's evidence chain. The ~25 reasons:

| Reason | Meaning |
|---|---|
| Weapon mount not operational | mount damaged/destroyed |
| Not authorized (nuclear) | WRA forbids |
| Target speed > weapon max target speed | SAM/ABM kinematic/seeker limit |
| Target altitude > ceiling / < min engage alt | envelope |
| Weapon not BOL-capable / needs precise target | guidance can't do bearing-only |
| Weapon not loaded on mount | in magazine, not on mount |
| Weapon not suitable for this target | e.g. torpedo vs aircraft |
| Launch altitude too high / too low | platform outside launch envelope |
| Target outside boresight limits / stern-chase/rear-aspect aspect out of envelope | geometry |
| **OODA loop limitation — cannot engage for N s** | identification delay |
| ASW torpedo must drop within 0.5 nm | drop geometry |
| Target out of range / within minimum range | range envelope |
| Horizontal range > downrange-at-altitude (ballistic toss) | lofted/ballistic limit |
| Within 5 nm and outside mount arc | ship turret can't bear |
| Cannot fire through/under ice | environment |
| Gun has no local control & no director | blind FC |
| Weapon must detect target prior to firing | IR lock-before-launch |
| No / all illumination channels in use | FC director saturated |
| All directors unable to illuminate (no LOS / low-observable) | stealth / masking |
| No datalink channel available | wire/datalink saturated |
| **Target out of weapon's DLZ** | dynamic launch zone |
| **Downrange / cross-range ambiguity > weapon tolerance** | tied to Engage-Ambiguous doctrine |

**DLZ** (§9.2.9): unlike the static No-Escape-Zone, the **Dynamic Launch Zone** accounts for the
target's heading/speed/alt at launch — the realistic "can this shot actually reach?" envelope.

### 1.7 Weather → sensors (pp.129–130)
Temperature (IR range; night helps, hot day shrinks it), rainfall (visual to 1–5%, IR severely),
cloud (LOS for visual/IR/LGB), sea state (sonar surface-duct loss, gunfire accuracy, min safe alt).

### 1.8 Events / triggers / scoring (pp.124–146) — *wargame-engine territory*
- **Triggers**: Unit Destroyed/Damaged, Enters/Remains-In Area, Time/Random/Regular Time, **Unit Is
  Detected**, Side Points threshold, Scenario Loaded/Ends. Scoped Side→Type→Subtype→Class→Specific.
- **Actions**: Points (+/−), End Scenario, Teleport (reinforcements), Message, Change Mission Status,
  Lua / Special Actions.
- **Scoring**: Triumph/Disaster thresholds; designer weights kills vs losses vs objective.

### 1.9 Unit Status & Contact Report panel (pp.84–91)
Right-side panel shows **only what the player's sensors justify** (fog-of-war filtered). Notable:
**Contact Report** (detected emissions → ranked *possible unit matches*, + spotted hosted units),
**Last Detections** (which unit/sensor last saw the contact), **WRA classification** of the contact,
systems/fire/flood damage, fuel & flying-time, magazines, status (`unassigned`/`engaged
offensive`/`on plotted course`), and mission link.

---

## 2. CMO → RMOOZ mapping

Legend: **HAVE** (structure already mirrors CMO) · **PARTIAL** (started, narrower than CMO) ·
**GAP** (not built) · **OUT-OF-SCOPE** (conflicts with locked rules — needs owner unlock).

| CMO concept | RMOOZ today | File(s) | Verdict |
|---|---|---|---|
| Sensors: radar horizon, RCS power-law, active/passive, ESM, EMCON gating | **DET1** engine — `R_h=1.23·(√h+√h)`, `R_det=R_ref·(σ/σ_ref)^¼`, `R_eff=min(...)`, EMCON gate, ESM≈1.5× emitter range. Header literally says *"mimic CMO's detection BEHAVIOUR with PUBLIC physics."* | `client/shell/detection.js`, `client/shell/world-state-db.js` | **HAVE** |
| ESM triangulation; PCLS; MAD; LOS/terrain masking | LOS is a **hook only** (`clear by default — DET2`); no triangulation/PCLS/MAD | `detection.js` (LOS hook) | **GAP** |
| Fire-decision chain ("whether a weapon fires") | **ENG1** — 6 gates: detection → WRA/ROE (`weapons_hold`) → range (`out_of_range`) → ammo (`winchester`) → FC channel (`no_fire_control_channel`) → salvo `Pk=1−(1−pk)^salvo`. Every non-shot yields `{status,reason}`. | `client/shell/engagement.js` | **PARTIAL** (4 of CMO's ~25 reasons) |
| OODA delay / proficiency timing; DLZ; ambiguity-vs-tolerance; altitude/boresight/aspect/arc/illumination envelopes | not modeled — these are the *missing* no-fire reasons | — (extends `engagement.js`) | **GAP** |
| Doctrine / ROE / WRA / EMCON as state | **DOCTRINE-A** — 9 read-only evidence types in the ledger (weapons-control per domain, EMCON status, engage-ambiguous, posture, echelon, tags, inheritance scope, priority, compliance summary); confidence-tiered; `rec(type,value,source,confidence)`. | `client/shell/world-state.js` `computeDoctrineEvidence()`, `DOCTRINE-A-SPECIFICATION.md` | **HAVE (as evidence)** |
| Side→mission→unit inheritance hierarchy | inferred only — W3 always `'side'` (`unit_doctrine_inheritance_scope`) | `world-state.js` | **PARTIAL** |
| EMCON **alert ladder** (Green→Red) + intermittent emissions | EMCON is a flat status, no alert levels / intervals | `world-state.js` (`side_emcon_status`) | **GAP** |
| Weather → sensor range (IR/visual/rain/cloud/sea-state) | not modeled (no weather feed into DET1) | — | **GAP** |
| Contact report (emissions→possible matches) + Last-Detections | contacts exist with confidence (`firm/probable/possible`), but no emissions→match list or last-detection attribution in the unit panel | `detection.js` (contacts), unit panel placeholders | **PARTIAL/GAP** |
| Fog-of-war: panel shows only sensor-justified info | contact confidence tiers exist; per-side filtering present in WS | `world-state.js`, `detection.js` | **HAVE (partial UI)** |
| Evidence display surface (grouped, read-only) | **OBJ-C** panel with 6 groups incl. a **Combat** group (`evidence-group-combat`) | `client/shell/objective-evidence-panel.js` | **HAVE** |
| Scoring / victory conditions | none by design | — | **OUT-OF-SCOPE** |
| Events / triggers (kill-unit, zone, detected, points) | none (only read-only visual event ticks) | `client/shell/timeline-event-ticks.js` | **OUT-OF-SCOPE** |

---

## 3. How these findings map onto the **existing chosen roadmap**

There is no new roadmap here. The binding plan is the guardrailed **"CMO→RMOOZ capability roadmap"
(items 1–10)** in `APP_INVENTORY.md`, sourced from `docs/cmo-functional-rules/exhaustive/`. This
section shows where the manual sections above **reinforce or detail** those already-chosen items, so
the manual's grounding feeds the *right* in-bounds work.

| Manual finding (this doc) | Maps to chosen item | Notes |
|---|---|---|
| "Weapon won't fire" checklist (§1.6) + DLZ/OODA/ambiguity | **Item 8** — *"Why did the adjudicator allow/deny this?" explainer panel* | Best fit. The panel **cites the reasons ENG1 already emits** (`weapons_hold`/`out_of_range`/`winchester`/`no_fire_control_channel`) read-only in the OBJ-C **Combat** group — borrowing CMO's UX, **not** adding firing math (firing math is on the *NOT-building* list). Richer reasons (DLZ/OODA/ambiguity) only if added to the chosen list first. |
| Doctrine / ROE / WRA / EMCON (§1.5) | **Item 4 — DOC1** (read-only data the adjudicator cites) | Largely **shipped as DOCTRINE-A** evidence; manual §1.5 is the reference for the inheritance hierarchy + Engage-Ambiguous semantics behind it. |
| EMCON alert ladder + intermittent emissions (§1.5) | **Item 4 / Item 1 (postures)** | Detail for the doctrine/posture data cards — descriptive, not behavioral. |
| Weather → sensors (§1.7) | **Item 7** — *optional per-zone `environment` overrides* | Manual §1.7 is the effects reference; item 7 is "weather without a global physics model." |
| Unit Status / Contact Report / Last-Detections (§1.9) | **Item 6** — *unit capability + readiness/supply descriptors* | Fills Unit Panel's empty Combat/C2 sections; contact-report match-list is the CMO pattern to imitate read-only. |
| Sensor families / IADS coverage (§1.3) | **Item 9** — *IADS/SAM coverage-envelope overlay (visual only)* | "No detection sim" — DET1 already exists as the "feel-alive" engine; item 9 is the visual overlay. |
| Missions / tasking (§1.1) | **Item 5** — *structured read-only Missions/Tasking view* | ATO-like rollup synthesized from step actors, not a planning engine. |
| Events / triggers (§1.8) | **Item 10** — *declarative `events[]` data object* | In-bounds analogue of CMO's Event Editor — **data, previewable, never Lua/code execution**. |
| Scoring / victory conditions (§1.8) | **Deliberately NOT building** | Out-of-thesis; stays out unless an explicit owner unlock adds it to the chosen list. |

**If a first build is wanted**, the natural pick is **chosen item 8** (the explainer panel) because
the data already exists: ENG1 emits structured `{status, reason}` records and OBJ-C already has a
**Combat** evidence group. Implementation would surface those existing reasons as read-only
evidence — mirroring `computeDoctrineEvidence()` in `world-state.js` and the `test-doctrine-evidence.js`
static-check pattern — **without** touching the firing math (which is off-limits per the guardrail).

---

## 4. Notes
- We mirror CMO's *reasoning model*, not its data: all class values are RMOOZ DB-Lite / public
  physics (see `detection.js` / `engagement.js` headers).
- This doc is text-derived. If UI/visual fidelity is wanted (panel layouts, datablocks), specific
  manual pages can be rendered as annotated images and appended.
- Update discipline (CLAUDE.md §Update): when any R-item ships, flip its row here and in
  `APP_INVENTORY.md`, and refresh the relevant memory "why" note.
