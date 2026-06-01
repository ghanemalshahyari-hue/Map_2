# CMO → RMOOZ — Deep Function/Capability Comparison

> **Purpose.** This is the *deep* companion to [`cmo-scenario-editor-application.md`](cmo-scenario-editor-application.md)
> (which is the general "concept → status" map). Here we go one level lower: we mine the actual P-Gatcomb
> tutorial **transcripts** (245 captions in `…/youthful-chebyshev-471e9f/docs/cmo-captions/`) to capture
> **how each CMO function actually works** — its mechanics, fields, and rules — then compare it, function by
> function, against what RMOOZ has today, what it lacks, and what a product team would improve.
>
> **Read it like a product team would.** CMO is the *reference product* in this space. RMOOZ is **not** a CMO
> clone — it is a **read-only scenario-adjudication / operator-review** tool for **ground/amphibious operational**
> scenarios, Arabic-first, with an AI adjudicator and a hard safety boundary. So "what we can improve" is filtered
> through *our* product thesis, not "port everything CMO has." Three buckets run through the whole doc:
> **CORE** (central to RMOOZ's value), **ADJACENT** (fits the model, real upside), **OUT-OF-DOMAIN**
> (tactical air/naval sim depth that may never belong here — catalogued for honesty, not as a backlog).

**Method note.** Transcripts are auto-generated YouTube captions, so spoken numbers/wording can be imperfect — treat
specific figures (ranges, dB, seconds) as *directional*, not authoritative. A handful of the canonical editor videos
(`Scenario Editor`, `Event Editor`, `Doctrine Settings`, `WRA basics`, `Unit Proficiency`) had no caption file on
disk; those rows were reconstructed from adjacent demonstrations and are flagged `⚠︎ reconstructed`.

---

## Legend

| Status | Meaning in RMOOZ today |
|---|---|
| ✅ **HAVE** | Exists in schema **and** surfaced/working in the app |
| 🟡 **PARTIAL** | Some data or UI exists, with a real gap vs CMO |
| 🟦 **SCHEMA-READY** | Schema accepts it + loader defaults it, but nothing authors or shows it |
| 🔴 **ABSENT** | Confirmed zero presence in client+server source |
| ⛔ **BLOCKED** | Deliberately excluded by a locked rule (safety boundary / Lua) |

| Bucket | Meaning for the product |
|---|---|
| **CORE** | Central to RMOOZ (authoring/review/adjudication of ground-amphibious ops) |
| **ADJ** | Adjacent — fits the operational model, clear value |
| **OOD** | Out-of-domain — tactical air/naval sim fidelity; scope deliberately |

---

## Executive summary — the product picture

**What CMO is, mechanically.** CMO is a *deterministic, rules-based wargame simulator*. Almost every tutorial,
under the hood, is teaching one of a small set of engines:

1. **A platform database** — every unit carries sensors, weapons, mounts, magazines, signatures, mobility, datalinks.
2. **A detection engine** — line-of-sight + radar horizon + RCS + EMCON + jamming + acoustics decide *what is seen*.
3. **A doctrine/WRA engine** — a scenario→side→mission→unit inheritance tree decides *whether a weapon fires*.
4. **An engagement engine** — geometry (NEZ/DLZ, aspect, altitude, penetration vs armor) decides *whether it hits*.
5. **A mission/tasking engine** — strike/CAP/patrol/support/intercept packages with areas, TOT, RTB logic.
6. **A logistics engine** — fuel, magazines, cargo, readiness states, refuel/rearm.
7. **An authoring layer** (editor + Lua) — build geography → sides → doctrine → units → missions → test.

**What RMOOZ is, mechanically.** RMOOZ consumes an *already-built* scenario and presents it for **operator review +
AI-proposed decisions**, then renders the adjudicated result on a map. It has a **strong authoring-foundation +
review/visualization layer** and an **AI-adjudication engine**, but it intentionally has **no detection, engagement,
doctrine, or logistics simulation** — those live inside the LLM adjudicator's prose reasoning, not as data models.

**The headline gap.** CMO's value is *simulation depth* (engines 2–6). RMOOZ's value is *review legibility, AI
adjudication, and a safety boundary*. So most of CMO's hundreds of tutorials map to **OUT-OF-DOMAIN** rows for us —
they prove a sim rule exists that RMOOZ models, if at all, only as an adjudicator input. **The real, in-thesis
upside for RMOOZ is concentrated in engines 1, 3, 5, and 7**: authoring, doctrine/ROE/WRA as *data*, missions as
*structured packages*, and surfacing sides/posture/clock that are already schema-ready.

**Coverage at a glance** (by functional domain, RMOOZ vs CMO):

| Domain | RMOOZ coverage of CMO function | Bucket |
|---|---|---|
| A. Scenario authoring/editor | 🟡 foundation only (P0 schema unwired; review-not-edit by design) | CORE |
| B. Sides / posture / forces | 🟦 schema-ready, not surfaced | CORE |
| C. Doctrine / ROE / WRA / proficiency | 🔴 absent as data (prose-only in adjudicator) | CORE |
| D. Missions & tasking | 🟡 adjudicated narrative, not structured packages | CORE |
| E. Movement / formations | 🟡 echelon+trails visualized; no maneuver model | ADJ |
| F. Sensors / detection / EW / IADS | 🔴 absent (markers only, no network/coverage) | OOD |
| G. Weapons / engagement | 🔴 absent (engagement_arcs are outcomes, not a model) | OOD |
| H. Naval / subsurface | 🔴 absent | OOD |
| I. Logistics / basing | 🔴 absent (only `strength`; BLS throughput is the analogue) | ADJ |
| J. Environment / terrain / time | 🟡 terrain friction only; no weather/sea/explicit clock | ADJ |
| K. Units / database | 🟡 SIDC + echelon + ORBAT; no capability DB | ADJ |
| L. Map / UI / visualization | ✅ strong (W3 suite: symbols, pins, trails, mission graphics) | CORE |
| M. Scripting (Lua) | ⛔ permanently blocked by safety rule | OOD |

---

## A. Scenario Authoring & Editor  ·  **CORE**

**How CMO works.** CMO is fundamentally an *editor*. Build order is canonical: **geography → database/version →
sides → posture → doctrine/ROE → time → weather/realism → units → missions → test-run**. Concrete editor mechanics
from the transcripts:

| Function | How CMO does it (mechanics / fields / workflow) | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Scenario build sequence | Fixed order: geography first, database/version locked before unit placement, then sides → posture → doctrine → units → missions → quick test run ⚠︎reconstructed | 🟡 We *review*, don't author. P0 authoring schema exists (`scenario-authoring-schema.js`) but **unwired** | **CORE.** Wire P0→P4 authoring mode as a *guided readiness review* in CMO's order. Biggest "feels organized like CMO" win. |
| Area / zone creation | `Ctrl+K` rect, `Ctrl+drag` circle, `Ctrl+P` polygon; zones serve no-nav / exclusion / environment / mission-execution roles | 🟡 We have AO boundaries, BLS, OBJ + a map-engine draw tool (snap/scallop/freehand) | **ADJ.** We already draw shapes; add typed *zones* (exclusion/no-nav) as first-class scenario data, not just geometry. |
| Reference points + tags | `Ctrl+Insert` to place; Reference Points Manager; tag/name points; **relative fixed-bearing** or **relative rotating-bearing** points that move with a unit | 🔴 No reference-point primitive | **ADJ.** Moving/relative reference points would power patrol areas + moving objectives if missions are added. |
| Custom environment zones | Per-area weather override (temp/precip/wind/cloud), nameable, freezable so players can't edit | 🔴 Absent (terrain_note only) | **ADJ.** See domain J — per-zone environment is the clean way to add weather without a global model. |
| Scenario features / realism toggles | `Scenario → Features`; toggles (detailed fire control, comms disruption) persist as defaults | 🟡 Our analogue = safety invariants + read-only boundary | **CORE.** Surface a single "scenario rules/realism" card rather than scattering it. |
| Mass unit placement | Import prebuilt networks (DEW line, SAM belts), world cities; then prune for CPU; group + set leader | 🟡 We register units + echelon roll-up, no import-network concept | **OOD** for networks; **ADJ** for "import + prune + group" authoring ergonomics. |
| Build large ground units | Facility placeholder → delete default weapons → add individual mounts (T-55/BMP) → `Shift+C` duplicate to company → copy to battalion | 🟡 We have ORBAT tree + SIDC build; no mount-level composition | **ADJ.** Mount/echelon composition could enrich Unit Composition card. |
| Cold-war / COIN authoring patterns | Separate *civilian* side to de-clutter mission menus; observation posts on high ground; scatter irregulars; disable auto-detect on scenery | 🟦 Sides are schema-ready; no civilian-side pattern | **CORE.** Reinforces "author sides explicitly" (domain B). |

**CMO authoring principles worth adopting (review-mode framing):** lock source/version before units; define the
operational area before forces; author sides + posture as *data* (don't rely on loader defaults); treat the phase
table as the scenario clock; disable "auto-detect" on scenery so recon is meaningful; start small + iterate.

> **Product call:** RMOOZ should not become a free-form editor — its safety boundary is a feature. The win is a
> **guided, read-mostly "scenario readiness" authoring mode** that follows CMO's build order over the cards we
> already have, plus the unwired P0 schema. Pure reorg + wiring, minimal new domain.

---

## B. Sides, Posture & Forces  ·  **CORE**

**How CMO works.** Sides are first-class. Posture is **directional** (A→B can differ from B→A: friendly / neutral /
unfriendly / hostile). **Collective Responsibility** is a doctrine flag: ON = engaging one unit of a side makes the
whole side hostile; OFF = units keep independent allegiance (neutrals, civilians, observers). Forces are organized
into groups/echelons with a designated leader.

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Create sides | Add/edit sides; assign units; computer-only sides for doctrine control | 🟦 `sides` optional in schema; **wargame3.json doesn't author them**; loader defaults BLUE/RED/NEUTRAL | **CORE, cheap.** Add one read-only **Sides card** showing the (currently invisible) side list. |
| Directional posture | `postures[from][to]` matrix of friendly→hostile | 🟦 `postures` matrix in schema, absent from data, loader defaults BLUE↔RED HOSTILE | **CORE, cheap.** Surface the posture matrix as a card; author it in data. |
| Collective Responsibility | Side-level flag toggling whole-side hostility | 🔴 Absent | **ADJ.** Matters only if RMOOZ adds neutral/civilian sides to scenarios. |
| Force grouping / echelon | Group → leader → formation; echelon hierarchy | ✅ Echelon roll-up + ORBAT tree/dock + SIDC echelon | **HAVE.** Strong already. |

> **Product call:** B is the **highest value-to-effort** item in the whole doc — the data already exists and is
> thrown away at load. Two read-only cards (Sides, Posture) close a visible gap with near-zero risk.

---

## C. Doctrine, ROE & WRA  ·  **CORE** (biggest conceptual gap)

**How CMO works.** This is CMO's "*whether a weapon fires*" brain — a **layered inheritance tree:
scenario → side → mission → unit**, where lower overrides higher. Key engines from transcripts:

- **WRA (Weapon Release Authorization)** — per-weapon policy: *automatic firing range* (max / 75% / 50% / 25% / NEZ),
  *self-defense* (independent toggle), *weapons-per-salvo*, *shooters-per-salvo*. Bounded by the system's control
  channels (e.g., SA-2 ≈ 3 channels).
- **Self-defense vs automatic fire** — separate switches. Self-defense fires only when the unit detects an *incoming*
  missile or a fire-control lock on itself; passive detection of an enemy platform is **not** enough.
- **No-Escape-Zone (NEZ)** — fire deferred until the target can't kinematically escape; requires target
  classification, so *unknown* contacts may not be engaged even in range.
- **Salvo math** — `P(hit) = 1 − (1 − p)^N`; salvo size chosen from single-shot Pk vs channel limit.
- **OODA delay** — detection→launch isn't instant: ~15 s orient + a system targeting cycle (modern ≪ cold-war).
- **Proficiency** — crew skill (novice→ace) shortens OODA and improves accuracy; set per side with unit overrides.
- **Targeting priority** — ranked target preferences applied to *autonomous* fire (manual attacks override).

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Doctrine inheritance tree | scenario→side→mission→unit, lower overrides; UI shows inherited vs overridden | 🔴 "doctrine" in our code = flank-drawing presets + LLM-prompt prose, **not policy data** | **CORE.** If RMOOZ ever models *why* the adjudicator allowed/denied an action, a doctrine data object is the honest place. |
| WRA policy | per-weapon range mode + salvo + self-defense | 🔴 0 occurrences | **CORE/ADJ.** A read-only **ROE/WRA card** would make AI proposals legible ("engagement allowed because ROE = WEAPONS FREE"). |
| Self-defense vs auto | independent toggles, trigger = incoming/lock-on | 🔴 Absent | **ADJ.** Could become an adjudicator input flag. |
| NEZ / range policy | classification-gated deferred fire | 🔴 Absent | **OOD** (tactical-air geometry). |
| Salvo sizing | Pk-driven `1−(1−p)^N`, channel-capped | 🔴 Absent | **OOD.** |
| OODA timing | orient + targeting-cycle latency | 🟡 Our step model is the abstraction of this | **ADJ.** Frame step latency/tempo as an OODA analogue in the Engagement Tempo card. |
| Unit proficiency | side default + unit override; affects detect/engage quality | 🔴 0 occurrences | **ADJ.** Cheap scenario field; feeds adjudicator + Force Readiness card. |
| Targeting priority | ranked preference list for autonomous fire | 🔴 Absent | **OOD.** |

> **Product call:** RMOOZ doesn't need CMO's firing math, but it has an **AI adjudicator that makes engagement
> decisions with no visible policy layer**. Adding **doctrine/ROE/WRA as read-only scenario *data* that the
> adjudicator cites** is squarely in-thesis: it makes AI proposals auditable, which is RMOOZ's whole safety story.
> This is the most valuable *new-domain* investment in the doc.

---

## D. Missions & Tasking  ·  **CORE** (different shape today)

**How CMO works.** Missions are structured objects (`Ctrl+F11`). Types: **Strike** (land/ASuW), **Patrol** (CAP /
AAW / ASW / ground), **Support** (tanker / AWACS), **Interception**, **Cargo/Ferry**. Each carries: assigned units,
**packages with roles** (striker / escort / tanker / AEW / SEAD), **areas** (patrol / prosecution / reference /
transit), **flight-plan waypoints** (per-leg altitude/speed/throttle), **Time-on-Target** (back-propagates takeoff
time), **RTB logic** (weapon-state / bingo-fuel / time-on-station / deactivation), and an **ATO** view of every
mission's status. **Task Pools/Packages** group units so missions draw from a shared pool. The **Operations Planner**
sequences multi-mission units by activation time + priority.

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Mission objects | typed missions with units/areas/timing | 🟡 We express per-step `actors`/`affected`/`engagement_arcs` + Decision/Proposal flow — *adjudicated narrative*, not packages | **CORE.** A read-only **Missions card** derived from step actors would bridge narrative→structured. |
| Packages & roles | striker/escort/tanker/AEW/SEAD groupings | 🔴 Absent | **OOD** for air packages; the *concept* of role-tagged groups is **ADJ**. |
| Patrol / prosecution areas | engage-inside zones, station altitude, "keep N on-station" | 🔴 Absent | **ADJ** if zones (domain A) land. |
| Flight-plan waypoints | per-leg alt/speed/throttle, TOT back-propagation | 🔴 Absent (we show movement *trails* post-hoc) | **OOD.** |
| ATO view | sortable table of all missions + live status | 🟡 Closest = Engagement Tempo + Event Log | **ADJ.** An "operations/tasking" rollup table is a natural RMOOZ card. |
| Operations Planner | activation-time + priority sequencing of multi-mission units | 🔴 Absent | **OOD.** |
| RTB / weapon-state logic | bingo/joker fuel, winchester/shotgun, time-on-station | 🔴 Absent | **OOD** (needs logistics + engagement models). |

> **Product call:** Missions are CORE conceptually but **OOD as a live simulator**. The honest RMOOZ move is a
> **structured, read-only "Tasking/Missions" view synthesized from existing step data** — not a mission-planning
> engine. This makes the adjudicated story read like an ATO without claiming to simulate flight plans.

---

## E. Movement, Formations & Maneuver  ·  **ADJ**

**How CMO works.** Units get waypoint courses with per-leg **throttle** (cruise/military/afterburner) and
**altitude**. **Formations**: group (`G`), pick leader, set **type** (wedge/echelon/diamond/line/custom angle-table),
**spacing** (m or nm), heading; gaps don't auto-fill on losses. **Spacing is tactical** — tight = concentrated fire +
poor maneuver; wide = flanking + weak mutual support; ships can stack on a point to pool defenses. **Altitude bands**
trade fuel vs detection vs threat exposure (high = best radar/fuel but max SAM window; low = terrain masking but worst
fuel + MANPADS). **Terrain masking / LOS**: stay below radar horizon through valleys; helicopters hug ridgelines at
~50 ft then pop up to fire. **Ship screening**: rules-of-thumb spacing (e.g., ~45 nm AAW screen, ASW escorts in a
cross around the HVT).

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Waypoint course + throttle/altitude | per-leg speed/alt; afterburner fuel penalty | 🟡 We render **movement trails (AN4)** from step coords; no plotting/throttle | **ADJ.** Trails already give the *review* value; plotting is authoring-mode territory. |
| Formation editor | type + spacing + leader + heading; manual gap-fill | ✅ Echelon roll-up + formation hover-peek + formation guide overlay | **HAVE (visualization).** No editable spacing model — fine for review. |
| Formation spacing tactics | concentration vs flanking vs mutual support | 🔴 No spacing semantics | **OOD.** |
| Altitude bands | fuel/detection/threat trade per band | 🔴 Absent (ground/amphibious domain) | **OOD.** |
| Terrain masking / LOS | radar-horizon + relief LOS tools | 🟡 We have terrain_note + BLS terrain_friction | **ADJ.** Terrain friction is the ground analogue; could extend to LOS for objective overwatch. |
| Pause/resume movement | min-speed waypoint or timed mission | 🟡 Step model implies this | **ADJ.** |
| Grouped vs single units (damage) | distributed battery = per-component damage pools | 🟡 We do per-unit attrition (AN1) | **ADJ.** Component-level attrition could enrich Red Attrition. |

> **Product call:** Movement is well served for *review* (trails + echelon + attrition). Maneuver *simulation* is OOD.

---

## F. Sensors, Detection & EW / IADS  ·  **OOD** (deep, deliberately out of scope)

**How CMO works.** This is CMO's richest engine. Detection = **line-of-sight + radar horizon + RCS + aspect +
EMCON + jamming + scan interval**. Radars have **roles** (early-warning / acquisition / fire-control) and **channels**.
**ESM** is passive (detects emitters at ~1.5× their range; triangulates with 2+ platforms; TMA refines). **EMCON**
trades stealth vs lock. **Jamming**: OECM (noise, burn-through distance) vs DECM (range-gate pull-off / angle
deception / false targets, activates only on seeker lock, success = f(DECM gen − seeker gen)); chaff/flares are
expendable. **IFF** needs transponder + emissions. **IADS** = layered EW/acquisition/FC radars + comms dependency +
exclusion zones (outer "suspicious", inner "engage"). **SEAD/DEAD**: HARM needs a lock; radars shut down on warning.

| Function (consolidated) | How CMO does it | RMOOZ status | Bucket |
|---|---|---|---|
| Radar roles & detection (horizon, RCS, aspect, look-down, scan interval) | physics-based LOS + radar equation + Doppler | 🔴 Absent | OOD |
| ESM / passive detection / triangulation / TMA | emitter detection at 1.5× range; multi-platform fix | 🔴 Absent | OOD |
| EMCON states | radar on/off, intermittent emission vs ESM | 🔴 `emcon` = 0 occurrences | OOD |
| Jamming OECM/DECM, chaff/flares | burn-through + spoof-vs-seeker generation | 🔴 Absent | OOD |
| IFF | transponder + emission dependent | 🔴 Absent | OOD |
| IADS network + comms dependency | layered radars, node roles, exclusion zones | 🔴 `off_map_markers` carry only `{id,side,type,coord,sidc,name}` — no role/EMCON/coverage | OOD (note below) |
| SEAD / DEAD | lock-required HARM, radar shutdown | 🔴 Absent | OOD |

> **Product call:** This entire engine is **out-of-thesis** for a ground/amphibious *review* tool. The **one**
> in-domain idea: an IADS/SAM **coverage-envelope overlay** (purely visual, drawn from marker + a range field) would
> aid operator review *without* a detection model. Everything else: catalogue, don't build.

---

## G. Weapons & Engagement  ·  **OOD**

**How CMO works.** Whether a shot *hits*: **engagement geometry** (NEZ vs 75%-max, aspect, snap-up limits, missile
performance vs altitude/atmosphere, lofting), **guidance types** (ARH / SARH / IR / laser / ARM / CEC cooperative),
**bombing accuracy** (altitude, ground-radar cueing, guided vs unguided), **penetration vs armor** (penetrator vs
special armor ≈ 50%; vs unarmored ≈ 2×; non-penetrator vs special ≈ 4%), **countermeasures**, **point/area defense**
(CIWS/C-RAM single-target), **salvo/ROF** (VLS ~2 s vs torpedo ~120 s), and a clear **"why won't my weapon fire"**
diagnostic (doctrine hold / WRA range / unidentified target / no illumination / out of DLZ).

| Function (consolidated) | How CMO does it | RMOOZ status | Bucket |
|---|---|---|---|
| Engagement geometry (NEZ/DLZ, aspect, snap-up, altitude) | kinematic + atmosphere models | 🔴 Absent | OOD |
| Guidance types (ARH/SARH/IR/laser/ARM/CEC) | per-weapon seeker logic | 🔴 Absent | OOD |
| Bombing accuracy factors | altitude + cueing + guidance | 🔴 Absent | OOD |
| Penetration vs armor | warhead-class × armor-class table | 🔴 Absent | OOD |
| Countermeasures (chaff/flares/decoys) | probabilistic spoof | 🔴 Absent | OOD |
| Point/area defense (CIWS, C-RAM) | single-target tracking, saturation | 🔴 Absent | OOD |
| Salvo / ROF | mount reload + Pk math | 🔴 Absent | OOD |
| "Engagement" representation | — | 🟡 We render **engagement_arcs as APP-6 mission graphics (MG1)** — *outcomes*, not a model | — |

> **Product call:** RMOOZ shows engagements as **adjudicated outcomes** (mission graphics, attrition), which is the
> right altitude for a review tool. The firing model is OOD. *Possible adjacent borrow:* CMO's "why won't it fire"
> diagnostic is a great UX pattern — an **"why did the adjudicator allow/deny this engagement"** explainer panel
> would translate that idea into RMOOZ's AI-proposal review.

---

## H. Naval & Subsurface  ·  **OOD**

**How CMO works.** Sonar (passive vs active; speed/depth/thermocline/shallow-water/masking all change range),
torpedoes (kinematic range vs speed, aspect/beam shots, wire-guidance, wake-homing, evasion), submarine propulsion
(nuclear always-noisy vs diesel-electric silent-at-idle vs AIP), ASW search patterns (raster / sawtooth / barrier /
expanding-box + sonobuoy fields), carrier battlegroup screening + CAP rings, naval mines (floating/moored/bottom/
captor/rising; laying intervals; sweeping effectiveness).

| Function | RMOOZ status | Bucket |
|---|---|---|
| All sonar / torpedo / submarine / ASW / carrier / mine mechanics | 🔴 Absent (RMOOZ is ground/amphibious; BLS is the maritime-edge analogue) | OOD |

> **Product call:** Wholly out-of-domain. The only adjacency is **amphibious landing** (BLS throughput, beach
> friction) — which RMOOZ *already* models better than CMO for that specific use case.

---

## I. Logistics & Basing  ·  **ADJ**

**How CMO works.** **Fuel** (per-type; ships burn ∝ speed³; aircraft range rings; bingo/joker reserves),
**magazines** (finite stock; rearm by transferring munitions/containers; ground-unit reload priorities),
**cargo** (ISO containers/pallets with mass+area+crew limits; load/unload/transfer missions; helicopter sling-load),
**readiness states** (surge ~3 h vs sustained ~20 h; ready/readying/reserve/maintenance), **refuel/rearm**
(air tanker + underway replenishment), **airfield component model** (runways + access points + fuel farm + ammo
bunker + warehouse — disable a component to disable the base).

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Throughput / sustainment | fuel + magazine + cargo flow | 🟡 **BLS throughput ceilings + terrain_friction** are RMOOZ's sustainment model | **ADJ.** This is RMOOZ's genuine strength for amphibious ops — keep leaning in. |
| Magazines / loadouts | finite stock, rearm, loadout-vs-range | 🔴 Absent (only `strength`; earlier doc fabricated magazine fields — do not reintroduce) | **ADJ.** A simple per-unit "supply state" field could feed Force Readiness without a full logistics sim. |
| Readiness states | surge/sustained, ready/readying/maintenance | 🟡 `strength` + BLS status approximate it | **ADJ.** Explicit readiness enum is cheap + feeds adjudicator. |
| Airfield component model | runway/parking/fuel/magazine; disable-a-part | 🔴 BLS + markers are point installations | **OOD** (tactical-air basing). |
| Cargo / amphibious lift | container/sling-load delivery | 🟡 Amphibious landing is modeled at the BLS level, not cargo level | **ADJ.** Lift-to-beach throughput could become a richer card. |

> **Product call:** Logistics is where RMOOZ's *ground/amphibious* thesis actually **beats** CMO's generic model
> (BLS throughput + friction). Don't import CMO's fuel/magazine sim; do **surface a unit "supply/readiness" field**
> and enrich the beach-throughput story.

---

## J. Environment, Terrain & Time  ·  **ADJ**

**How CMO works.** **Weather** as physics: rain (degrades high-freq fire-control radar + blocks optical/laser),
cloud layers (opaque curtains at altitude; block visual + laser, not SAR), ice (blocks non-icebreakers + sub
surfacing), fog/time-of-day (night ≈ 25–30% of day visual range; contrails always visible). **Acoustics**
(thermocline, +10 dB ≈ +33% range). **Time control** (1×–15×, message-log auto-pause on events, manual step-advance).
**Underground targets** (no signature unless flagged; need penetrator warheads). **Pilot exhaustion** + **sea-state**
caps on speed.

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Terrain effect | friction / LOS / land cover | 🟡 `terrain_note` + BLS `terrain_friction` | **HAVE (basic).** Extend with land-cover classes if authoring grows. |
| Weather / sea-state | per-zone + global; affects detection/movement/weapons | 🔴 Absent (i18n strings only) | **ADJ.** Add optional `environment` (weather/sea_state) — best done as **per-zone** (domain A) overrides. |
| Scenario clock | explicit start UTC + duration; time-step controls | 🟡 `phase_table` + `steps[].time_label/elapsed_hours` act as clock; **no explicit start/duration**; *three overlapping clock surfaces* | **CORE-ish, cheap.** Add `scenario_clock.start_utc/duration_hours`; **consolidate the 3 clock cards into 1**. |
| Time acceleration / step | 1×–15×, auto-pause on event | 🟡 HUD scrubber re-walks history; transport bar is scaffolding | **ADJ.** Wire the transport bar to real step playback. |
| Pilot/crew fatigue | mission-duration exhaustion clock | 🔴 Absent | **OOD.** |

> **Product call:** The cheap, high-value items here are **explicit clock field + clock-card consolidation** (closes
> a real PARTIAL gap and a known 3× duplication) and **optional per-zone weather** if the operational model needs it.

---

## K. Units & Database  ·  **ADJ**

**How CMO works.** A compiled **platform database** is the backbone: every unit carries `type/subtype`, `proficiency`,
`sensors[]` (range/band/role), `datalinks[]` (Link-11/16), `mounts[]` (hardpoints/VLS/tubes), `magazines[]`,
`weapons[]`, `signature` (RCS/acoustic), mobility, fuel, component-dispersal radius. Ground units = single vehicles
(fuel-tracked); facilities = platoons/companies. Variants matter (F-16A→Block-52 differ in radar/payload). The DB is
read-only in the UI but fully queryable.

| Function | How CMO does it | RMOOZ status | Gap & improvement |
|---|---|---|---|
| Unit identity / SIDC | DB-driven symbology | ✅ SIDC build + family-symbol resolver (SYM2) + ORBAT | **HAVE.** |
| Echelon / hierarchy | group→leader→echelon | ✅ Echelon roll-up + ORBAT tree/dock | **HAVE.** |
| Capability database | sensors/weapons/mounts/signatures per platform | 🔴 Units carry `strength`/`echelon`/`role`/`sidc`, no capability fields | **ADJ.** A *lightweight* capability tag (e.g., role + sensor class) would feed the adjudicator + Unit Panel's empty Combat/C2 sections. |
| Database inspection | filter by class/country/subtype; read entries | 🔴 No reference DB | **ADJ.** Unit Panel could show "what this unit is" if a capability tag existed. |
| Variants | per-block capability deltas | 🔴 Absent | **OOD.** |

> **Product call:** RMOOZ's symbology/ORBAT is strong. The adjacent win is a **minimal capability descriptor** per
> unit (role + sensor/weapon *class*, not CMO's full DB) to populate the Unit Panel's placeholder Combat/C2 sections.

---

## L. Map / UI / Visualization  ·  **CORE strength** (we're ahead in spots)

**How CMO works.** Personal map profile (range rings, contact trails, datalink view, place names), NTDS symbology
with per-affiliation icon sizing, extensive hotkeys/camera, Tacview 3D, layered map settings.

| Function | How CMO does it | RMOOZ status | Note |
|---|---|---|---|
| Symbology / icons | NTDS shapes, per-affiliation sizing | ✅ milsymbol + SYM2 resolver + echelon scaling | **HAVE / ahead** (APP-6 mission graphics MG1). |
| Map layers / profile | personal profile, layer toggles | ✅ Layers controller/panel + map engine | **HAVE.** |
| Contact trails | per-unit trails | ✅ Movement trails (AN4) | **HAVE.** |
| Event markers | message log + map | ✅ Event pins (AN2) with provenance | **HAVE / ahead** (provenance: actor/effect/doctrine). |
| Engagement depiction | plain attack lines | ✅ APP-6 mission graphics (MG1) | **HAVE / ahead.** |
| Range/coverage rings | sensor/weapon envelopes | 🟡 Measure tool has range-circle/sector; not auto from unit data | **ADJ.** Auto coverage rings (ties to F's IADS overlay idea). |
| RTL / Arabic-first | n/a (CMO is LTR English) | ✅ Full EN/AR + RTL | **HAVE / unique to RMOOZ.** |

> **Product call:** This is RMOOZ's clear **competitive strength**. The W3 presentation suite already exceeds CMO's
> 2-D map legibility in places (provenance pins, APP-6 mission graphics, Arabic/RTL). Main gap = the rich animation is
> gated on `schema_variant === "w3-rich"`, so non-W3 imports get markers+movement only (see `…animation-readiness-audit.md`).

---

## M. Scripting / Automation (Lua)  ·  **OOD / ⛔ BLOCKED**

**How CMO works.** Lua is CMO's automation layer: `ScenEdit_AddUnit`, events (triggers/conditions/actions),
`ScenEdit_GetUnit` introspection, `ScenEdit_AddExplosion`, message boxes, world elevation queries, dynamic spawning
(civil traffic, bridges, comms-loss, IADS disruption). It's how power users build and randomize scenarios.

| Function | RMOOZ status | Note |
|---|---|---|
| Lua execution | ⛔ **Permanently blocked** by the AI/sim safety boundary (`feedback_ai_sim_boundary_rules`) | Locked rule — do not propose executing CMO Lua. |
| Event rules (trigger/condition/action) | 🔴 Absent as *data* (Event **Log** is a ledger, not a rule engine) | **ADJ.** A *declarative, previewable* `events[]` rule object (no code execution) would be in-bounds — see the proposed shape in `cmo-scenario-editor-application.md` §Event Editor. |

> **Product call:** Never execute Lua. The legitimate borrow is a **declarative event-rule object** (data, not code)
> that the adjudicator/timeline can evaluate and that stays previewable behind the safety boundary.

---

## Synthesis — what a product team should actually build

Ordered by **value ÷ effort**, filtered through RMOOZ's read-only / ground-amphibious / AI-adjudication thesis:

| # | Move | Bucket | Effort | Why |
|---|---|---|---|---|
| 1 | **Surface Sides + Posture cards** | CORE | XS | Data already exists + is discarded at load. Pure surfacing. (Domain B) |
| 2 | **Consolidate the 3 clock surfaces → 1 + add explicit `scenario_clock`** | CORE | S | Closes a real PARTIAL gap and a known 3× duplication. (Domain J) |
| 3 | **Wire the P0 authoring schema into a guided "scenario readiness" mode** in CMO build-order | CORE | M | Biggest "feels organized like CMO" win; foundation already shipped, just unwired. (Domain A) |
| 4 | **Doctrine/ROE/WRA as read-only *data* the adjudicator cites** | CORE | M | Makes AI proposals auditable — RMOOZ's core safety story. (Domain C) |
| 5 | **Structured read-only "Missions/Tasking" view synthesized from step actors** | CORE | M | Turns adjudicated narrative into an ATO-like rollup without a planning engine. (Domain D) |
| 6 | **Minimal unit "capability + readiness/supply" descriptors** | ADJ | S–M | Fills Unit Panel's empty Combat/C2 sections; feeds adjudicator. (Domains C/I/K) |
| 7 | **Optional per-zone `environment` (weather/sea-state) overrides** | ADJ | M | Adds weather without a global physics model. (Domains A/J) |
| 8 | **"Why did the adjudicator allow/deny this?" explainer panel** | ADJ | M | Borrows CMO's "why won't it fire" UX for AI-proposal review. (Domain G) |
| 9 | **IADS/SAM coverage-envelope overlay (visual only)** | ADJ | M | The one in-domain idea from the sensors engine; no detection sim. (Domains F/L) |
| 10 | **Declarative `events[]` rule object (data, previewable, no code)** | ADJ | M | In-bounds analogue of CMO's Event Editor; never Lua. (Domain M) |

**Deliberately NOT building (catalogued, out-of-thesis):** detection/EW/IADS *simulation*, weapons/engagement
firing math, naval/subsurface mechanics, airfield component model, flight-plan/mission-planning engine, Lua
execution. These are CMO's tactical-air/naval sim depth; RMOOZ models their *outcomes* (mission graphics, attrition),
which is the correct altitude for an operator-review tool.

**One-line thesis.** *CMO simulates the battle; RMOOZ reviews and adjudicates a decision. Our highest-value work is
not porting CMO's engines — it's making the decision **legible and auditable** (sides, posture, doctrine/ROE, tasking,
clock) over the strong visualization layer we already have.*

---

## Provenance

- Source transcripts: 245 caption files in `…/.claude/worktrees/youthful-chebyshev-471e9f/docs/cmo-captions/`
  (one per video; auto-generated, treat figures as directional). Playlist index:
  [`cmo-pgatcomb-playlist-inventory.md`](cmo-pgatcomb-playlist-inventory.md).
- Extraction: 10 parallel domain readers over the transcript set (Jun 2026).
- RMOOZ ground-truth: [`APP_INVENTORY.md`](../APP_INVENTORY.md) (audit `e75ff65`),
  [`cmo-scenario-editor-application.md`](cmo-scenario-editor-application.md),
  [`scenario-schema.md`](scenario-schema.md), [`wargame3-schema.md`](wargame3-schema.md),
  [`scenario-animation-presentation-readiness-audit.md`](scenario-animation-presentation-readiness-audit.md).
- Missing canonical-editor captions (rows flagged ⚠︎reconstructed): Scenario Editor, Event Editor,
  Doctrine Settings, WRA basics, Unit Proficiency, CAP/AAW Patrols, Building-a-Mission 4.
