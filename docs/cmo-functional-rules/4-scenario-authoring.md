# CMO Functional Rules — Cluster 4: Scenario Authoring Flow & the Event Editor

**Scope.** Ground-truth extraction of how Command: Modern Operations (CMO) actually
authors a scenario: the canonical build order, the rules of each authoring step, and
the Event Editor's trigger→condition→action model. Target audience: a developer
building RMOOZ's (currently unbuilt) authoring mode so it follows CMO's *real*
workflow rather than an invented approximation.

**Videos read (transcripts in `docs/cmo-captions/<id>.txt`):**
- *CMO Scenario Editor Tutorial* (`vy5glbQ1G6k`) — the master build-order walkthrough.
- *Scenario Editor Tutorial: Event Editor* (`TCApvEgog4U`) — the canonical trigger/condition/action enumeration.
- *Building a Mission Part 1–4* (`ixu2x6doLFA`, `wCaE47aRaHA`, `b5RbZgiSpPU`, `0SwTlMuRdzo`) — full start-to-finish scenario, incl. events, areas, zones, testing/balancing.
- *Area Creation* (`rj1AM-xUycU`), *Reference Points Tips* (`-3xf9HqBSV0`), *Relative and Moving Reference Points* (`kdLSo-_DDxg`) — areas/zones/RP mechanics.
- *Custom Environment Zones* (`-BsOyOScvRQ`) — weather override regions.
- *Making airfields in scenario editor* (`5xB8RNooK50`) — multi-piece airfield construction.
- *Customizing Quick Battles* (`Qc4pohpgRmU`), *Editing Quick Battle Generator Locations* (`SKyOl8umX6s`) — QB generator HTML/Lua editing.
- *"Workflow"* (`cMYv6wzbvmI`) — author's offensive-scenario planning workflow (mostly play, but confirms briefing/doctrine/OOB-first order).
- *Creating units in a specific area* (`is-mr11RJqA`) — **Lua** area-constrained spawning; context for what the Event Editor / area tools replace.

**Caveat.** Captions are auto-generated and wording is imperfect; UI labels and exact
key bindings are transcribed phonetically and may differ slightly from the real menus.
Build numbers are noted where the tutorial flagged beta-specific behavior.

---

## Build order

### Canonical scenario build order (CMO)
- **Models:** The fixed sequence CMO authors follow from "Create New Scenario" to a testable scenario.
- **Inputs / parameters:** none beyond the per-step inputs below.
- **Behavior / rules:** The tutorials are consistent on this order, and several steps are *hard prerequisites* (the editor or the author calls them out as "do this before anything"):
  1. **Pick the location / concept** (out-of-game research: news, real OOB, Google Earth, Wikipedia/Scramble for unit assignments). Optional but the author's universal first move.
  2. **Set the DATABASE** — `Editor → Database`. **Critical and must be first**; "set the database before you do anything." DB choice (e.g. DB3000 modern vs a Cold-War DB) gates which units exist. Changing it later is destructive.
  3. **Add SIDES** — `Editor → Sides → Add`. Side *name* doesn't matter (renameable later); what matters is the per-side settings configured next.
  4. **Set POSTURE** between every side-pair (neutral / friendly / unfriendly / hostile). Posture is *directional* — setting Side A hostile to B does **not** auto-set B hostile to A (though an actual attack will flip the victim automatically).
  5. **Set DOCTRINE & ROE per side** (incl. the per-rule "player may edit" lock toggles), plus side flags: proficiency slider, awareness level, player-selectable, collective responsibility, auto-track civilians.
  6. **Set scenario TIME & DURATION** — `Editor → Scenario Times and Duration`. Set *both* current time and start time; set duration. (See validation rules below.)
  7. **Set WEATHER** — temperature, rainfall, sky/cloud tier, wind/sea-state.
  8. **Set scenario FEATURES / realism settings** — `Editor → Features and Settings`.
  9. **(Save the base version now** — author saves "00" base after sides/doctrine, before placing units.)
  10. **Place UNITS / build OOB** — import pre-built groups, then add/trim units side by side; build airfields; set facings, groups, formations, magazines, loadouts.
  11. **Build AREAS / REFERENCE POINTS & ZONES** (mission areas, no-nav, exclusion, environment zones).
  12. **Create MISSIONS** (patrol/strike/support, etc.) and assign units — for AI sides this is the "AI setup."
  13. **Create EVENTS** (Event Editor) for scoring and scripted outcomes.
  14. **TEST & BALANCE** — run the scenario, watch losses/difficulty, tweak loadouts/timings/areas, re-save iteratively.
  15. **Add BRIEFING** (last; HTML-editable side briefing) and final scoring polish.
- **Outputs / effects:** a complete, saved, testable `.scen`.
- **Edge cases / quirks:**
  - **Save constantly and version** ("00", "01", "02"...): "pretty much every time you twitch your hand you have to Ctrl+S."
  - "**Scenario creep**" is the named anti-pattern: scenarios balloon with units until performance/balance suffer. Authors deliberately trim and substitute units to fight it.
  - Performance trick: replace non-target airbases with **single-unit airfields** to cut unit count / lag (see Units & placement).
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 1–4 (ixu2x6doLFA / wCaE47aRaHA / b5RbZgiSpPU / 0SwTlMuRdzo)"; "Workflow (cMYv6wzbvmI)"
- **Confidence:** High (build order is consistent across all five videos).

---

## Sides & posture

### Adding sides
- **Models:** Creates the belligerents/factions in the scenario.
- **Inputs / parameters:** side name (placeholder, renameable); per-side: briefing (rich text / HTML), posture vs each other side, doctrine & ROE, proficiency, awareness, three side flags, tanker/air-ops tempo settings.
- **Behavior / rules:** Add sides via `Editor → Sides → Add`. Double-clicking a unit auto-selects its side; `Switch to` changes the active editing side. Each side carries an independent doctrine block.
- **Outputs / effects:** side records the rest of authoring references.
- **Edge cases / quirks:** name truly doesn't matter at creation time.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"
- **Confidence:** High

### Posture (per side-pair)
- **Models:** Defines how each side regards each other side.
- **Inputs / parameters:** one of **Neutral / Friendly / Unfriendly / Hostile** set from one side toward another.
- **Behavior / rules:**
  - *Friendly* = shares intelligence.
  - *Unfriendly* = won't necessarily fire but shadows/follows.
  - *Hostile* = will fire.
  - **Directional & asymmetric:** you must set each direction; an actual attack auto-flips the attacked side to hostile toward the attacker.
- **Outputs / effects:** governs engagement/intel sharing at runtime.
- **Edge cases / quirks:** easy to forget the reciprocal direction; combat will correct it but only after the first shot.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"
- **Confidence:** High

### Doctrine & ROE + per-rule editability locks
- **Models:** Sets a side's standing rules of engagement and whether the *player* may later change each rule.
- **Inputs / parameters (rules called out):** ignore plotted course when attacking; engage-opportunity targets (should I fire at everybody / nobody / ...); ambiguous-target identification (optimistic/pessimistic); air-ops tempo (**Surge** vs **Sustained**); quick-turnaround; fuel state; weapon state; air-to-ground strafing; jettison ordnance; BVR engagement logic; SAM/WCS; automatic evasion; **WRA**. Each rule has a **checkbox = "player may edit this later."**
- **Behavior / rules:** Configure per side. If you lock the AI's ability to engage, units will still **fire in self-defense** but never initiate. Surge = aircraft cycle fast but unsustainable; Sustained = slower regeneration (the realistic default for most missions). The lock toggle is the key scenario-design lever — e.g. uncheck "edit nuclear ROE" so the player can't go nuclear; uncheck strafing when low-altitude AAA (ZSU-23) is present.
- **Outputs / effects:** stored per-side doctrine + a player-editability mask.
- **Edge cases / quirks:** BVR logic isn't lockable, so tweaking it is low-value (the player can re-adjust anyway). Leaving Tomahawk/long-range SAM ROE editable lets players trivialize the scenario.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 1 (ixu2x6doLFA)"; "Workflow (cMYv6wzbvmI)"
- **Confidence:** High

### Side flags: player-selectable, collective responsibility, awareness, auto-track, proficiency
- **Models:** Side-wide behavioral switches set at authoring time.
- **Inputs / parameters:**
  - **Computer-only / not player-selectable:** side can't be chosen by the player at load (used for AI/neutral sides).
  - **Collective responsibility (ON/OFF):** if ON, attacking *one* unit of a side makes that whole side declare war on the *whole* attacking side; if OFF, the grievance is limited to the single offending unit.
  - **Auto-track civilians:** auto-tracks anything flagged "commercial."
  - **Awareness level:** *Blind* (recommended for civilian shipping — eliminates calculations) / *Normal* (standard, contacts unknown until identified) / *Auto Side ID* (instantly know side of any contact — simulates IFF) / *Auto Unit ID* (know exact unit too) / *Omniscient* (god mode, see everything).
  - **Proficiency slider:** Novice / Cadet / Regular / Veteran / Ace — **applied at unit-placement time.** Set it high, place units (they're aces), set it low, place more (those are novices) — i.e. it's a *stamp* applied as you drop units, not a retroactive side property.
- **Behavior / rules:** as above; proficiency's place-time semantics are the non-obvious one.
- **Outputs / effects:** per-side flags + per-unit proficiency baked at placement.
- **Edge cases / quirks:** Collective responsibility can cause cascading wars from a single stray shot — use with caution. Omniscient/Auto-ID trivialize detection.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 1 (ixu2x6doLFA)"
- **Confidence:** High

---

## Geography & areas

### Scenario time & duration
- **Models:** Defines clock and length.
- **Inputs / parameters:** scenario **current time**, scenario **start time** (distinct fields!), duration, optional daylight-savings, complexity & difficulty ratings, a free-text location label.
- **Behavior / rules — validation the editor enforces:** Duration must be a **positive number**, and **current time must not exceed start time + duration** or the scenario instantly ends on load. (Newer builds auto-copy current→start to help; older builds did not.)
- **Outputs / effects:** scenario clock + metadata.
- **Edge cases / quirks:** localization can relabel the fields; the current/start-time distinction is the classic gotcha.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"
- **Confidence:** High

### Weather
- **Models:** Global default atmosphere/sea conditions.
- **Inputs / parameters:** average (sea-level) temperature; rainfall rate; **sky/cloud as a stepped tier**; wind / sea-state.
- **Behavior / rules:** Weather is **static** by default (only Lua can vary it over time). Temperature is sea-level average and **decreases with altitude**. The cloud control is *stepped* through discrete regimes — each click shifts cloud bases/tops and thickness (low puffy → mid → high thin → high thick → full-stack overcast + fog 0–2 kft). Wind/sea-state above a platform's max sea-state cripples that platform. Affects weapon accuracy and (via cloud/temperature) IR/visual detection.
- **Outputs / effects:** global environment used by sensor/weapon math.
- **Edge cases / quirks:** authors look up real monthly climate for the chosen region/month to set plausible values; sea-state 6 disables most small craft.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 2 (wCaE47aRaHA)"
- **Confidence:** High

### Scenario features / realism settings
- **Models:** Global realism toggles.
- **Inputs / parameters (called out):** **detailed gun/fire control** (must actually see+lock target to hit, vs move-and-fire); **unlimited ammunition/magazines at airbases** (convenience but lets players overload on premium PGMs); **realistic submarine communications** (must be shallow to talk to subs); **effects of terrain type** (mountains/trees reduce hit probability); **communication disruption** (losing your radio cuts C2 → friend/foe & blue-on-blue incidents).
- **Behavior / rules:** set once; affects whole scenario. Unlimited mags removes the need to stock magazines.
- **Outputs / effects:** global realism flags.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 2 (wCaE47aRaHA)"
- **Confidence:** High

### Reference points
- **Models:** Named points on the map used to define areas/mission geometry, and optionally attached to moving objects.
- **Inputs / parameters:** position; name; **tags** (must first be added to the tag vocabulary, then applied); color (via the zone they back); optional attachment to a unit/group.
- **Behavior / rules:**
  - Create via `Mission → Reference Points → Add`, or **Ctrl+Insert** then click. **Set the active side before creating** (RPs belong to a side).
  - Freshly placed RP is **unselected** — a frequent source of "I forgot one point" bugs when boxing/cross-selecting.
  - **Tags** let you group RPs by role (e.g. "West WP", "CAP area", "ASW area") and recolor/summon them quickly — essential when a strike has 40–50 RPs.
  - **Relative reference points** — `Mission → Reference Points → make selected RP relative fixed-bearing to` vs `relative rotating-bearing to`, then click the anchor object:
    - *Fixed bearing:* the point holds its absolute position regardless of the anchor's heading.
    - *Rotating bearing:* the point rotates with the anchor's facing (so a zone "whips around" as the unit turns) — used for look-ahead/sanitization zones around a convoy or sub.
    - Works for single points **and** whole areas/zones, and can anchor to a whole group.
- **Outputs / effects:** RP records; optionally moving zones.
- **Edge cases / quirks:** rotating-bearing zones on a fast mover are expensive to recompute at high time-compression. RP math is on a globe — moving a big set of points distorts near the poles/edges.
- **Source:** "Reference Points Tips (-3xf9HqBSV0)"; "Relative and Moving Reference Points (kdLSo-_DDxg)"
- **Confidence:** High

### Areas & zones (creation + zone types)
- **Models:** Polygonal/circular regions reused as mission areas or rule zones.
- **Inputs / parameters:** the defining points; a name; color; zone type; per-type properties (violators, submarines, etc.).
- **Behavior / rules — creation methods:**
  - Classic: Ctrl+Insert several RPs, then `Mission → Area/Reference Points Manager → add highlighted points → name`. Risk: points get connected in the wrong order producing a self-crossing shape (no undo for that).
  - **Define Area Rectangle** (Ctrl+K drag), **Circle** (drag from center — generates many straight-segment points), **Polygon** (Ctrl+P, click each vertex, Esc to finish) — modern, order-safe.
  - **Ctrl+right-click → Define Area** (rectangle/circle); **Shift+right-click on an area** → select RPs / rename / delete / **Interpolate** (double / 16× the points for finer editing).
  - Hold **Shift** + drag to move *all* of an area's points together; left-click-drag moves a single point.
- **Zone types (what an area can be promoted to):**
  - **Mission area** (patrol/strike/support geometry).
  - **Exclusion zone** — anyone crossing in is auto-classified **hostile** (used to auto-ID border crossers).
  - **No-navigation zone** — bans a side from flying/transiting (e.g. forbid overflying Lebanon); set *not visible* and *not player-editable* so players can't route around it.
  - **Custom Environment Zone (CEZ)** — local weather override (see next).
  - Any zone can be **transformed** into another type later (e.g. regular → exclusion) via the manager.
- **Dynamic mission creation from a zone:** with a unit selected, **Shift+right-click a zone** → create a mission (e.g. AAW patrol) with that unit + zone pre-selected; a `Pick Area` button + filter helps choose among many zones.
- **Outputs / effects:** area/zone entities referenced by missions/rules.
- **Edge cases / quirks:** circles create heavy point counts (more area-membership math); zone build numbers shown were beta (`1323.1`) so menu labels may shift.
- **Source:** "Area Creation (rj1AM-xUycU)"; "Reference Points Tips (-3xf9HqBSV0)"; "Building a Mission Part 4 (0SwTlMuRdzo)"; "Building a Mission Part 2 (wCaE47aRaHA)"
- **Confidence:** High

### Custom Environment Zones (CEZ)
- **Models:** Region with weather distinct from the global default.
- **Inputs / parameters:** an area + name + color; then four core switches — **temperature**, **rainfall**, **cloud/sky**, **wind/sea-state** (plus advanced thermal-layer / CZ acoustic settings not covered).
- **Behavior / rules:** Define an area → `Missions/Ref Points → Reference Points Manager → Custom Environment Zones → create new → assign waypoints → edit data → Save`. The zone then renders distinct weather (e.g. snow/overcast localized over one region). You can stack many CEZs. Recommend authoring them on a **neutral layer** and **freezing** them so players can't edit weather to their advantage.
- **Outputs / effects:** localized weather override entities.
- **Edge cases / quirks:** must create the zone before you can color it; advanced thermal/acoustic options exist but were not demonstrated.
- **Source:** "Custom Environment Zones (-BsOyOScvRQ)"
- **Confidence:** High

---

## Units & placement

### Inserting units
- **Models:** Adds platforms/facilities to the map.
- **Inputs / parameters:** **Insert** key then click location; pick category **Aircraft (incl. helos) / Ship (incl. surface platforms) / Submarine / Facility (everything else)**; search by name; filter by country; toggle hypothetical platforms; optional **custom GUID/name**.
- **Behavior / rules:** Units cannot be click-dragged — to relocate, select and press **M** then click destination. **C** = copy at click (does NOT copy cargo); **Shift+C** = copy *with* cargo. Right-click → `Scenario Editor` to edit unit details (orientation, etc.). Orientation set in **degrees** (0/360 = up/north, 90 = right/east, 180 = down, 270 = left). Range rings drawn at placement reflect max weapon range.
- **Outputs / effects:** unit entities on the map; proficiency stamped from current side slider.
- **Edge cases / quirks:** **cloning a unit resets its orientation to 0** (called out as a long-standing annoyance) — copy (C) preserves it, clone does not. When adding helos/aircraft to a surface group, add **by ship, not by group**, or they get placed on the wrong vessel.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"
- **Confidence:** High

### Grouping & formations
- **Models:** Combine units into a managed group/formation.
- **Inputs / parameters:** select units + **G** to group; **Delete** removes a group/unit; numpad **9** = normal-select mode (to pick a member inside a group); **D** detaches a selected member; **F4** = formation mode; Formation Editor sets group lead, member positions, and **relative vs fixed bearing** per member.
- **Behavior / rules:** You can't group a group into a group directly (the editor tells you to detach first). In Formation Editor, set escorts to **fixed bearing** so the threat axis is always covered even if the player forgets to orient the formation; set others **relative** (rotate with the group). Naming the group (e.g. "Route 10") aids organization.
- **Outputs / effects:** group entity with formation geometry + initial speed/heading.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 2 (wCaE47aRaHA)"
- **Confidence:** High

### Importing pre-built units & populating bases
- **Models:** Drop in canned installations/OOBs instead of hand-placing.
- **Inputs / parameters:** `Editor → Import/Export Units → load groups → pick country → Load Selected Installations`.
- **Behavior / rules:** CMO ships pre-built grouped installations per country/side; authors load them then **trim** to what the scenario needs. For hosted aircraft on single-unit airfields: `Edit Hosted Aircraft → set country → use the "from" button to filter aircraft by scenario date → set callsign/quantity → Add Selected`. KML-from-Google-Earth can be converted into units via a forum "CMANO KML transfer" tool (edit DBID + lat/long in a text file, paste into the import folder) — for placing real-world targets like chemical plants.
- **Outputs / effects:** grouped units in the scenario.
- **Edge cases / quirks:** put your own imports in groups (easier to remove). DBID must match the intended platform or you get the wrong unit.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 1–2 (ixu2x6doLFA / wCaE47aRaHA)"
- **Confidence:** High

### Single-unit airfields vs hand-built airfields
- **Models:** Two ways to create an airbase, with opposite targetability/performance tradeoffs.
- **Inputs / parameters:** single-unit = `Insert → Facility → "airfield" → choose runways & count → OK`. Hand-built = place each piece.
- **Behavior / rules:**
  - **Single-unit airfield:** one entity; **cannot be attacked except by nuclear weapons**; low lag. Use for any airbase that is **not** a target. Easiest aircraft hosting.
  - **Hand-built airfield (required when it must be a conventional target):** place pieces in order — **Runway(s)** (set length in meters; **right-click → set orientation to the TRUE heading**, since CMO uses true not magnetic) → **fuel storage** → **ammo/magazine storage** (load ammo *before* grouping) → **Access Points** (taxiway-to-runway connectors; **as long as one access point survives the field still works**, so authors deliberately add *few* to make it harder to fully disable) → **parking spots / hangars** (orient to match building footprint or bombers hit the wrong angle) → optional barracks/control tower/ATC radar. Then **select-box everything + G** to group; use F4 to pick the group lead.
- **Outputs / effects:** an airfield entity (single) or a grouped multi-piece field.
- **Edge cases / quirks:** Runway-grade taxiways can also launch/recover (extra targets). **Do not mix a single-unit airfield with hand-built pieces, and don't group two airfields together** — both cause glitchy behavior. Place aircraft into specific parking spots *before* regrouping (Ctrl+F6 per spot); arming them *after* regroup relocates them for rearm.
- **Source:** "Making airfields in scenario editor (5xB8RNooK50)"; "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"
- **Confidence:** High

### Loadouts, magazines & readiness
- **Models:** Arm units and stock bases.
- **Inputs / parameters:** `Ready/Arm` per aircraft/group (choose loadout, set Ready Immediately / time-to-ready / maintenance / reserve); `Magazines → Add Magazine → Add/Remove Weapons` per airbase.
- **Behavior / rules:** Without **unlimited magazines** (a scenario feature), you must add magazines with the exact weapons aircraft will use, or loadouts won't be available. "Ready Immediately" makes the unit available at scenario start; maintenance/reserve units are effectively unavailable (and can be omitted if not targets). The "**one-third rule**" is the author's convention for how many of a group are airborne/available at once.
- **Outputs / effects:** armed units + stocked magazines.
- **Source:** "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"; "Building a Mission Part 3 (b5RbZgiSpPU)"; "Making airfields (5xB8RNooK50)"
- **Confidence:** High

### Lua area-constrained spawning (context — what authoring tools replace)
- **Models:** Scripted random placement of N units inside an irregular real-world area (not a lat/long box).
- **Inputs / parameters:** Lua via the script console: `ScenEdit_AddUnit{...}`, `World_GetElevation{...}` (reject water/land), `unit:inArea(area)` where `area` is a table of RP names, `math.random`.
- **Behavior / rules:** loop generating random lat/long (divide a random int to get sub-integer variance so units don't snap to grid intersections), reject by elevation, then reject/delete units whose `inArea` test fails for the RP-defined country polygon; count successes with an indefinite (`repeat ... until count == N`) loop. Use `ScenEdit_DeleteUnit` (not move) to avoid triggering events.
- **Outputs / effects:** N randomly-but-constrained units; can randomize count/type per scenario start.
- **Edge cases / quirks:** **Lua is permanently BLOCKED in RMOOZ** — included only to show the kind of generative placement CMO offloads to scripting that a built-in authoring tool would have to provide natively (e.g. "scatter N units inside polygon").
- **Source:** "Creating units in a specific area (is-mr11RJqA)"
- **Confidence:** High

---

## Missions

### Creating missions & assigning units (AI setup)
- **Models:** Tasks a group of units with a behavior over an area/route.
- **Inputs / parameters:** **Ctrl+F11** (or `Mission` menu) → choose type → name → assign units, area/RPs, doctrine, altitudes, timing.
- **Mission types referenced:** **Patrol** (AAW/BARCAP, ASW, AsuW, SEAD, Sea-control, Ground patrol), **Strike** (Land strike / Air-to-ground; also anti-runway vs access-point sub-strikes), **Support** (tankers/AEW; can attach to a moving RP), **Ferry/transit**, plus mission movement style (**repeatable loop** vs one-pass).
- **Behavior / rules — author conventions & rules called out:**
  - **One-third rule:** set "keep N per class on station" so a fraction is airborne at a time.
  - **Repeatable loop must be checked** for patrol missions or aircraft "explore" out of the area and die.
  - **BARCAP via a line of RPs**, not an area, to stop wandering (area patrol units drift into SAMs in some builds).
  - **Station/transit/attack altitudes** are set per mission to exploit terrain masking and cloud cover and to stay under SAM/ship-SAM envelopes.
  - **"Allow refueling" on a patrol can make aircraft fly across enemy SAMs to a tanker** — turn it off or it self-destructs the mission.
  - **Mission activation/deactivation times:** delay a mission so AI aircraft are *airborne exactly when the player arrives* (compute transit time from distance/speed); deactivate near scenario end to save fuel. Missions can also be created **inactive** and activated during play/test.
  - **Weapon-release doctrine per mission** (e.g. "fire only 1 HARM," "anti-runway bombs only vs runways") prevents waste.
- **Outputs / effects:** mission entity driving AI units.
- **Edge cases / quirks:** the **Strike planner** has a limitation (units arrive piecemeal/at different times); the author's preferred robust alternative is a **patrol mission over a defined area with altitude floors** rather than a one-shot strike package. Add dog-leg waypoints to time-coordinate arrivals.
- **Source:** "Building a Mission Part 3–4 (b5RbZgiSpPU / 0SwTlMuRdzo)"; "Workflow (cMYv6wzbvmI)"; "CMO Scenario Editor Tutorial (vy5glbQ1G6k)"
- **Confidence:** High

---

## Event Editor (triggers / conditions / actions)

### Event model overview
- **Models:** CMO's built-in scripted-event system — the no-Lua way to score and script outcomes. `Editor → Event Editor → Events`.
- **Inputs / parameters per event:** **name**; **Repeatable** flag; optional **Probability** (%); then three composable parts:
  1. one or more **Triggers** (what fires the event),
  2. zero or more **Conditions** (gates/catches that must hold),
  3. one or more **Actions** (what happens).
- **Behavior / rules — how they combine:**
  - An event = (Trigger fires) AND (all Conditions true) → run Actions.
  - **Multiple triggers** can be attached to one event; **multiple actions** likewise. After creating/selecting a trigger/condition/action you must explicitly click the **Add** button to attach it (forgetting this is the #1 mistake — the tutorial repeats "make sure you actually add it").
  - Set **Repeatable** for anything that can happen more than once (per-loss scoring); leave it off for one-shot outcomes (e.g. "win at 30 points").
  - Triggers/conditions/actions are **reusable libraries** — create once, attach to many events (cloning an existing trigger is the fast path).
- **Source:** "Scenario Editor Tutorial: Event Editor (TCApvEgog4U)"; "Building a Mission Part 4 (0SwTlMuRdzo)"
- **Confidence:** High

### Trigger types (enumerated from the tutorials)
- **Models:** The condition that activates an event.
- **Trigger types observed:**
  - **Unit Is Destroyed** — params: target **side**, target **type** (Aircraft / Surface Ship / Submarine / Facility / Land facility...), optional **subtype** (e.g. "merchant"), optional **specific class**, optional **specific unit**, and quantity/value-style specifiers (e.g. "any/any/any"). Granularity from "any aircraft on side X" down to "this exact hull."
  - **Side Points (points threshold)** — fires when a side's score exceeds a value (e.g. "succeeds 29 points" to mean ≥30).
  - (Implied by actions/other videos: unit-enters-area / regular-time / random-time style triggers exist in CMO, but the read tutorials explicitly demonstrated only the two above.)
- **Behavior / rules:** target selectors are hierarchical (side → type → subtype → class → unit). Threshold triggers compare against current side score.
- **Edge cases / quirks:** "30 points" is authored as ">29" because the comparison is strictly-greater.
- **Source:** "Scenario Editor Tutorial: Event Editor (TCApvEgog4U)"; "Building a Mission Part 4 (0SwTlMuRdzo)"
- **Confidence:** High (for the two demonstrated types); Med (for the existence of time/area triggers — inferred, not shown in the read clips).

### Condition types (enumerated)
- **Models:** Gate that must be true for the event to run.
- **Condition types observed (the tutorial states there are essentially three):**
  1. **Side posture / relationship** — "is [side] hostile/friendly [to side]."
  2. **Scenario Has Started** — the near-universal guard (author creates a reusable "scenario started" condition and reuses it on every event).
  3. **Lua Script condition** — a custom scripted predicate (out of scope / blocked for RMOOZ).
- **Behavior / rules:** conditions are ANDed with the trigger.
- **Edge cases / quirks:** "Scenario has started" is used so events don't fire during setup/initial spawn.
- **Source:** "Scenario Editor Tutorial: Event Editor (TCApvEgog4U)"
- **Confidence:** High

### Action types (enumerated)
- **Models:** What the event does when it fires.
- **Action types observed:**
  - **Points** — add/subtract points to/from a side (e.g. +15, −10, −100); the core scoring primitive.
  - **Message** — post a message (to a side or any side) shown in the message log (e.g. "Merchant destroyed — keep up the good work").
  - **End Scenario** — terminate the scenario (win/end condition).
  - **Teleport (to area)** — relocate units to an area (the author flags this as a fun randomizable action).
  - **Change Mission Status** — flip a mission active/inactive.
  - **(Spawn/"add planes"/units)** — referenced as available ("you can also [add] planes").
  - **Lua Script action** — run arbitrary Lua (out of scope / blocked for RMOOZ).
- **Behavior / rules:** multiple actions per event run together; pair a Points action with a Message action for player feedback.
- **Outputs / effects:** score changes, log messages, scenario end, unit relocation/spawn, mission toggles.
- **Source:** "Scenario Editor Tutorial: Event Editor (TCApvEgog4U)"; "Building a Mission Part 4 (0SwTlMuRdzo)"
- **Confidence:** High

### Worked scoring pattern (canonical example)
- **Models:** The reference event set authors build for a strike scenario.
- **Behavior / rules (from both Event-Editor videos):**
  - *"Merchant destroyed"* — Trigger: Unit Destroyed (Pakistan / Surface Ship / merchant); Condition: Scenario Started; Actions: +15 to India, Message "merchant destroyed." Repeatable.
  - *"India loses airplane"* — Trigger: Unit Destroyed (India / Aircraft / any); Condition: Scenario Started; Action: −10 India. Repeatable.
  - *"Win"* — Trigger: Side Points (India >29); Condition: Scenario Started; Action: End Scenario. **Not** repeatable.
  - Building-a-Mission analog: per-side "aircraft lost" (−100/+50), "chemical facility destroyed" (Land facility / structure → +points), "Syria aircraft loss" (+5) — all guarded by "scenario has started," all cloned from a base trigger/action.
- **Edge cases / quirks:** Event Editor is **explicitly distinct from and weaker than Lua/SBR** — it's the "potent but not scripting" tier. Test events by deliberately triggering them and checking the Scoring/Scoring-log/Scoring-graph.
- **Source:** "Scenario Editor Tutorial: Event Editor (TCApvEgog4U)"; "Building a Mission Part 4 (0SwTlMuRdzo)"
- **Confidence:** High

---

## Quick Battle generator

### Editing Quick Battle units & loadouts
- **Models:** The QB generator (Air-to-air, Surface duel, ASW, Submarine duel, etc.) is **data-driven by per-battle HTML + Lua + CSS files**, not a bespoke UI — fully author-editable.
- **Inputs / parameters:** files under `.../Command Modern Operations/QuickBattle/<BattleName>/` — one **`.html`** (the dropdown options the user sees), one **`.lua`** (the random tables / generation logic), one **stylesheet**.
- **Behavior / rules:**
  - **Folder name = battle name** in the QB menu. Duplicate a folder to make a new battle variant (back up first).
  - In the HTML, each selectable unit is encoded as **`<unitDBID>_<helo/secondaryDBID>` plus a loadout DBID** — i.e. unit database-ID, optional embarked-aircraft DBID, and **loadout DBID** (every loadout has its own DBID). **A loadout is mandatory** or the generator errors.
  - To add a *new* option to the dropdown: copy-paste an `<option>` line and swap in the new DBIDs.
  - To include a unit in the **random** pool you must edit the **Lua** random table (the HTML only feeds explicit picks), e.g. add the DBID twice (`507, 507`) into the table.
- **Outputs / effects:** customized QB option sets / random pools.
- **Edge cases / quirks:** edit with Notepad (not WordPad); QB uses the **Modern DB** in these examples; mis-editing the side fields can break generation — start with values you understand. CMO validates and warns on malformed files; keep a backup folder.
- **Source:** "Customizing Quick Battles (Qc4pohpgRmU)"
- **Confidence:** High

### Editing Quick Battle generator locations
- **Models:** QB places units around a **center lat/long** with a randomized radius; you add new center points.
- **Inputs / parameters:** HTML `gameLocation` entry (display name, no spaces/symbols in the key) + matching Lua entry with **latitude (decimal), longitude (decimal), and a GMT offset**.
- **Behavior / rules:**
  - HTML: add a `gameLocation` keyed by a no-space name (the friendly description is separate).
  - Lua: append to the `gameLocations` list — **comma-separate entries (last needs none); a missing comma breaks the whole list.** Convert real-world **degrees-minutes-seconds → decimal degrees** (CMO display gives DMS, the script needs decimals). **Sign matters:** +lat = N, −lat = S; +lon = E, −lon = W (wrong sign drops units in the wrong hemisphere). Compute **GMT offset** by comparing Zulu vs local time at that point.
- **Outputs / effects:** new selectable QB locations.
- **Edge cases / quirks:** the radius-from-center approach means you only ever set the center; same technique works for any battle type.
- **Source:** "Editing Quick Battle Generator Locations (SKyOl8umX6s)"
- **Confidence:** High

---

## Contradictions / flags

- **Area-patrol vs RP-line BARCAP:** *Area Creation* (`rj1AM-xUycU`) promotes drawing an area and patrolling it; *Building a Mission Part 3* and *Workflow* warn that in the demonstrated build aircraft **wander out of patrol areas and die**, so they switch to a **line of reference points**. This is build-version-dependent behavior, not a hard contradiction — flag for implementers: support **both** area-bounded and waypoint-line patrol geometries.
- **Trigger/condition completeness:** the read clips conclusively enumerate only **Unit-Destroyed** and **Side-Points** triggers and **3** condition types (posture / scenario-started / Lua). CMO's full Event Editor has additional trigger types (time, unit-enters-area, etc.) that were *not* demonstrated in the transcripts read — do not treat the lists above as exhaustive of the real CMO without checking the remaining IADS-editor videos (`sfxAYvnk8FM`, `flw8O10fxPE`) or the live editor.
- **Single-unit airfields are non-targetable except by nukes** — this is stated identically in two videos (consistent), but means "make it a target" and "reduce lag" are mutually exclusive choices for a given airbase; the author resolves it case-by-case.
