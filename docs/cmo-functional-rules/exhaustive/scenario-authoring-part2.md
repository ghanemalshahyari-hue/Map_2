# Scenario Authoring & Structure — Part 2/2

> **Scope.** This is **Part 2 of 2** of the exhaustive functional-rules spec for the *Scenario Authoring & Structure* bucket of Command: Modern Operations (CMO). Sibling parts cover the remaining authoring rules; this part covers the rules enumerated below and only those.
>
> **Exhaustive.** Every mechanic in the supplied rule set is represented here. Near-identical mechanics observed across multiple tutorial videos have been **merged** (richest description kept; all source video IDs cited).
>
> **Caveat — auto-generated captions.** These rules were distilled from auto-generated YouTube captions of community tutorials. Transcription noise affects exact tool names, hotkeys, and numbers. Stated numbers are reproduced **verbatim**; nothing has been invented. Confidence is tagged per rule. Treat hotkeys and DB IDs as indicative, not authoritative.

---

## 1. Database, Era & Time Setup

### Set scenario database / era before building (database selection)
- **Models:** Choosing which equipment database (era) the scenario uses, which gates every available platform.
- **Inputs / parameters:** Database menu → select database (e.g., 'Cold War database'); scenario date.
- **Behavior / rules:** Set the database (e.g., Cold War DB) **FIRST**, "before you do anything with a new scenario." The chosen database **plus** the scenario date together determine which platforms/weapons appear in pickers (e.g., only Cold-War-era Soviet bombers; within that, only year-1955-available variants).
- **Outputs / effects:** Constrains the entire unit/weapon catalog available to the scenario to the selected database and era.
- **Edge cases / quirks:** Forgetting to set it first means building against the wrong catalog. Interacts with date-based availability gating (e.g., F-89D only variant in 1955; Bear-A/Bison too new).
- **Source:** qVQCSV2wLag
- **Confidence:** High

### Scenario start time / date affects munition ready-times and day-night capability
- **Models:** Time-of-day and peace/war context modulate how long aircraft take to arm and whether non-night-capable aircraft can fly; scenario year gates equipment variants.
- **Inputs / parameters:** Scenario date/time (e.g., 1955, mid-summer, 06:30); peacetime vs wartime context; operational tempo (Surge vs Sustained); aircraft night-capability (e.g., F-86D not night-rated).
- **Behavior / rules:** With an early-morning peacetime start, default time-to-ready an armed aircraft was **~3 HOURS** (deemed unrealistically long for that context). Operational tempo changes it: **SUSTAINED** ops = **~20 HOURS** to arm those airplanes (probably not enough lead time → harder scenario); **SURGE** = much faster (easier). Day/night: F-86Ds at a base showed READY but RED at night because they were not night-capable ("cannot use them at night") — so a night bomber raid could catch them grounded. F-89 "D model Scorpion" was the only variant available in 1955 given the set date, illustrating year-gating of equipment availability.
- **Outputs / effects:** Determines arming lead time, which airframes are usable at the current hour, and which equipment variants are even selectable for the scenario year.
- **Edge cases / quirks:** Author flagged F-86D night behavior as a possible **BUG** (it's all-weather day/night but "doesn't want to behave"). 3-hour peacetime ready-time vs 20-hour sustained vs fast surge are the stated levers. Equipment availability is strictly gated by scenario date.
- **Source:** qVQCSV2wLag | 3IgCJs1m0O4
- **Confidence:** High

### Scenario environment setup: start date/time, weather, and time-zone offset awareness
- **Models:** Setting the scenario clock and atmospheric conditions, accounting for UTC-vs-local offset.
- **Inputs / parameters:** Scenario date/time field; weather: temperature (°C), cloud cover, rain, wind; local time-zone offset.
- **Behavior / rules:** Author sets a start time and notes the entered time maps to a different local time (entered **14:30 ≈ 09:30 local** — a UTC/local offset applies). Weather is set explicitly: temperature **22 °C** (warmer tropical setting), moderate clouds, optional rain, low wind (justified by terrain/trees). These environment values feed sensor/flight conditions for the run.
- **Outputs / effects:** Scenario clock and weather state used by the sim (lighting, sensor/visibility, flight conditions).
- **Edge cases / quirks:** Time entry is offset from local time (14:30 → ~09:30 local) — author flags the conversion. Wind kept low because of dense forest. Values are author choices, not rules.
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

---

## 2. Sides, Postures & Diplomacy

### Inter-side posture matrix (hostile / friendly / neutral) and computer-only / awareness-disabled sides
- **Models:** Defining factions and how each side relates to every other side (governing engagement/IFF), plus marking a side as AI-only with no situational picture.
- **Inputs / parameters:** Side names (e.g., USAF, US Army, Red Force, Civil; or Colombia, Insurgents, Civil); per-pair posture set in Add/Edit Sides (Friendly / Neutral / Unfriendly / Hostile); 'computer only' flag; awareness/visibility ("does not need to be able to see") flag.
- **Behavior / rules:** For every side pair the designer explicitly sets posture, configured **per side / per direction** in the UI (postures need not be symmetric in intent). Example multi-side setups: US Army & USAF friendly to each other; Red Force hostile to all blue sides and to Civil; Civil friendly to both blue sides. COIN example: Colombia sees Insurgents Hostile and Civil Friendly; Insurgents see both Hostile; Civil sees Insurgents Hostile. A side can be flagged **'computer only'** (no human player) — used for Civil. A side can also be set so it doesn't need sensor/awareness (civilian structures don't need to see anything), reducing irrelevant processing. Postures drive who auto-engages whom.
- **Outputs / effects:** Determines automatic engagement eligibility and IFF between sides; marks AI-only sides; disables awareness/visibility processing for non-combatant sides.
- **Edge cases / quirks:** Real-world morality "isn't black and white," but the sim forces explicit hostile/friendly assignments. Splitting forces into extra sides (Army vs Air Force) requires re-specifying all postures. Civil set computer-only AND sight-irrelevant. 'Computer only' also prevents the player from switching to that side and changing its doctrine.
- **Source:** 3IgCJs1m0O4 | ozWKI2_Zn_o
- **Confidence:** High

### Side 'Awareness/Blind' setting
- **Models:** Forcing a side to have no situational picture (skip its sensor/visibility calculations).
- **Inputs / parameters:** Per-side awareness setting (set Civil side to 'blind').
- **Behavior / rules:** Designer sets the Civil side to **BLIND** because "there's no reason to calculate visibility from the Civil side" — if a civilian has seen the bomber it's already too late. Used both to save computation and because that side does no fighting.
- **Outputs / effects:** That side performs no detection/visibility calculations; remains passive targets.
- **Edge cases / quirks:** Appropriate only for non-combatant/target-only sides. Reduces CPU load.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

### Separate-side trick to declutter mission target menus + remove player control
- **Models:** Putting certain assets on their own side so they don't pollute selection menus and so the player can't command them.
- **Inputs / parameters:** A new side created via Add/Edit Sides; units imported directly onto it (Import/Export Units); 'computer only' / player-control flag.
- **Behavior / rules:** Designer creates a dedicated side (e.g., 'US Army' for Nike-Ajax SAM sites) and imports the SAM sites onto it rather than onto the main playable side. Stated advantages: (1) those units won't "clutter up the screen / the select-objects menu" when picking units for missions on the other side; (2) it "takes control away from the player" — combined with setting that side to **COMPUTER ONLY** so the player has no choice over it. Bomarc sites, by contrast, were imported onto the player's USAF side to give the player control.
- **Outputs / effects:** Cleaner mission-builder unit lists; specified assets are computer-controlled and hidden from player tasking.
- **Edge cases / quirks:** Whether to give the player control is a deliberate per-asset decision (Army Nike = AI-only; Air Force Bomarc = player). 'Computer only' also prevents the player from switching to that side and changing its doctrine.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

### Side / unit 'Proficiency' setting
- **Models:** A skill/training rating applied to a side (or boosted on individual units) reflecting training/experience for the era; modulates combat effectiveness, especially under stress.
- **Inputs / parameters:** Per-side proficiency level (e.g., 'Regular', 'Ace'); per-unit override (raise/lower); historical context (year, presence of veterans/aces).
- **Behavior / rules:** Designer sets proficiency by era reasoning: 1955 USAF is not WWII-end nor Vietnam-era; **'Regular'** assumes well-trained plus some experience; few/no WWII aces remain, so a regular (not ace) level fits. Proficiency is a deliberate realism dial. It can also be **reduced for a whole side** or **raised for specific units**: author lowers Insurgent proficiency to model that irregulars "struggle" once heavy ordnance (cluster bombs) lands near them, while cranking the Insurgent HQ unit's proficiency **UP** to represent leadership knowing more. Defenders are sometimes set to **'Ace'** broadly "to make things extra fun."
- **Outputs / effects:** Affects unit combat effectiveness / reaction quality for that side or unit.
- **Edge cases / quirks:** Purely a design judgment about historical training levels; exact numeric effect not stated (qualitative — no numeric proficiency tiers or modifiers). Per-unit override (HQ higher) coexists with a side-level reduction.
- **Source:** 3IgCJs1m0O4 | ozWKI2_Zn_o
- **Confidence:** Med

---

## 3. Doctrine, Realism & Operational Tempo

### Doctrine controls: nuclear release, RoE/engagement authority, opportunity targets, auto-evasion, weapons-free
- **Models:** Per-side rules-of-engagement and weapon-use permissions governing autonomous behavior.
- **Inputs / parameters:** Doctrine page toggles: 'use of nuclear weapons' (grant/deny); engagement authority = Tight (hostile only) vs Free Fire; 'engage opportunity targets' yes/no; automatic evasion on/off; weapon-state (e.g., nuclear vs conventional warhead pre-selected).
- **Behavior / rules:** Designer sets per side: **GRANT nuclear weapon use** (else nuclear strikes never fire and "scenario is going to be a lot shorter"); keep RoE **TIGHT** (engage hostile/identified only) for a realistic ID-then-engage flow, where one side IDs (Air Force) and another shoots (Army) — making the scenario harder; turn **opportunity targets ON** for defenders (take free shots) but explicitly turn them **OFF** for attacking bombers (turning them on "you're going to find your scenario much shorter"); turn **automatic evasion OFF** for 1950s bombers ("you don't need to evade a missile yet"). Author can also **lock the player out** of changing nuclear permission. Warhead selection (conventional vs nuclear) is pre-set so "as soon as these fire it'll be nuclear."
- **Outputs / effects:** Controls whether/when units fire nuclear weapons, whether they engage only confirmed-hostile vs anything, whether they take targets of opportunity, and whether they perform evasive maneuvers.
- **Edge cases / quirks:** Opportunity-targets ON shortens the scenario (bombers get diverted/killed). Tight RoE means if you can't ID an inbound, you can't engage it (realistic risk). Disabling auto-evasion is era-appropriate but removes a survivability behavior.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

### Doctrine setting (operational tempo: sustained vs normal)
- **Models:** A doctrine/tempo setting that scales how fast a side conducts operations (sortie rate / pacing).
- **Inputs / parameters:** Doctrine page; tempo option (e.g., 'Sustained').
- **Behavior / rules:** Setting Doctrine to **'Sustained'** (commonly chosen for COIN) slows the scenario's operational pace "massively" — more realistic but less action-dense. Left at the faster default it plays quicker. (Note: tempo also interacts with arming lead-time — see §1 ready-time rule, where Sustained = ~20 hours to arm aircraft.)
- **Outputs / effects:** Scaled operational tempo for the side (slower with Sustained).
- **Edge cases / quirks:** Effect described qualitatively ("slow your scenario down massively"); no numeric sortie/tempo values stated. Author cautions it may be less fun.
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### Disable return-to-base / fuel logic for one-way scripted strikes
- **Models:** Preventing bingo-fuel RTB behavior so suicide bombers complete their attack.
- **Inputs / parameters:** Doctrine/behavior toggle 'units do not return to base when they run out of fuel' (set via Ctrl+Shift+F referenced); presence/absence of an assigned air base.
- **Behavior / rules:** If scripted attackers are based at an air base, they will **ALWAYS** try to RTB and never execute a one-way mission. Fix: set 'units do not return to base when they run out of fuel' (eliminates the bingo/RTB logic) so they fly the one-way strike. Author notes this is "super dangerous" but necessary if the units have a home base.
- **Outputs / effects:** Units ignore RTB-on-bingo and continue to target even when fuel-critical.
- **Edge cases / quirks:** Only an issue if you created air bases for the strikers; free-spawned (no base) aircraft don't have the RTB problem. Also: red force MUST be granted nuclear-weapon use or the (nuclear-armed) strike fizzles and "the scenario is going to be a lot shorter."
- **Source:** 3IgCJs1m0O4
- **Confidence:** Med

### Scenario Features & Realism options (and their default-set persistence)
- **Models:** Global toggles governing realism/abstraction for a scenario, settable only in editor mode and saved as the scenario's defaults.
- **Inputs / parameters:** Scenario → Features/Realism page: Realistic Communications / Communication Disruption, Detailed/Realistic Fire Control, Unlimited Magazines at air & naval bases, Advanced Terrain techniques/effects, etc.; editor mode vs play mode; Save.
- **Behavior / rules:** The Scenario Features & Realism Options page is **READ-ONLY in normal play** (Start New Game → Load Selected → pick side → Enter Scenario shows the box but greyed out). To **CHANGE** the defaults you must open the scenario in the **EDITOR** (Edit Scenario → Enter Scenario — note the options box does NOT pop up here; instead you access Scenario → Features). Toggle the options (it warns first), press OK, then **SAVE** the scenario — this writes them as the official defaults so that next time the scenario is loaded in play mode those options are pre-applied. Author's COIN choices: leave Realistic Comms OFF, enable detailed Fire Control, enable Unlimited Magazines at air/naval bases, enable Advanced Terrain.
- **Outputs / effects:** Persisted per-scenario realism configuration; affects comms, fire control, magazine limits, terrain effects.
- **Edge cases / quirks:** Cannot edit features outside editor mode (greyed out). Editing requires Save to persist; unsaved changes don't become the default. The features dialog suppresses the usual pre-game options popup when entered via the editor.
- **Source:** teanDoZu4fA
- **Confidence:** High

### Mission Condition (MCON) / readiness posture per unit & its CPU cost
- **Models:** How aggressively a unit's sensors/weapons are active (e.g., Active vs lower MCON) and the radar-calculation load that implies.
- **Inputs / parameters:** Per-unit MCON setting (Active vs default/passive); number of emitters; number of radar systems they'd track against; weapons-release-per-target setting.
- **Behavior / rules:** Designer warns: setting **128** Nike batteries to **ACTIVE** MCON means all of them engage **~5** separate radar systems simultaneously ("**north of 600 radar calculations**") for fidelity that isn't needed. Recommends leaving them at a lower MCON because each battery already has its own air-traffic-control radar to keep watch — making always-active redundant. Explicitly: turning MCON to active is a way to "really really slow the scenario down." Separately set **Weapons Release** = how many missiles per target (Nike noted as able to track only **one** missile at a time).
- **Outputs / effects:** Controls sensor/engagement activity per unit; directly scales radar-calculation CPU cost and scenario speed.
- **Edge cases / quirks:** Redundant active radars waste cycles; default/passive plus organic ATC radar is enough. Per-weapon tracking limits (Nike one-missile-at-a-time) inform the WRA setting.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

---

## 4. Events, Triggers & Scoring

### Events system: triggers + conditions + actions for scoring
- **Models:** Rule-based scenario logic that awards/deducts points (and can drive outcomes) when game states occur.
- **Inputs / parameters:** Event with: a 'repeatable' flag; one or more TRIGGERS (e.g., 'unit is destroyed' filtered by side/type/class/specific-unit; also 'scenario loaded', 'scenario started'); CONDITIONS (e.g., 'scenario has started'); ACTIONS (e.g., 'points' +/- with a side; Lua script).
- **Behavior / rules:** Designer creates events, e.g.: **'NATO air loss'** = repeatable, trigger 'a unit is destroyed' (side NATO, type aircraft, scope = any/class/specific), condition 'scenario has started', action **'lose 100 points side NATO'** (and a paired **+50** gain action). **'Chemical facility destroyed'** = trigger unit destroyed (side Syria, land facility, type Structure), action GAIN points. **'Syria aircraft loss'** = repeatable, **+5** points. **CRITICAL UI behavior:** after selecting a trigger you must click the explicit Add/confirm button or it won't take effect ("make sure after you click this you have to actually click this button to make it work"). Triggers/actions can be **CLONED** to build similar ones faster. You can make one event per aircraft type each with its own score, or keep it generic ("any loss is a loss").
- **Outputs / effects:** Side scores change (e.g., -100 / +50 / +5 per event); a scoring log records each award; supports victory/feedback evaluation.
- **Edge cases / quirks:** Point values are arbitrary/designer-defined ("you decide what's valuable"). Granularity vs effort tradeoff (per-type events = many clones). Forgetting the confirm-add click silently breaks the trigger.
- **Source:** 0SwTlMuRdzo
- **Confidence:** High

### Event-driven Lua execution at scenario start (for run-to-run variety)
- **Models:** Wiring a Lua script to fire automatically when the scenario loads/starts so randomized setup runs each playthrough.
- **Inputs / parameters:** Event Editor → create event; triggers 'scenario loaded' AND 'scenario has started'; action type 'Lua script' (Create New Action) containing the targeting code.
- **Behavior / rules:** Create an event named e.g. 'scenario started', add trigger 'scenario has started' (and ensure 'scenario loaded'), then add an action **'Lua Script'** pasting the random-target-assignment code. Result: every time the scenario starts, bombers are randomly re-tasked, producing different targets each run — "if you've already put the bombers into place we're basically ready to go."
- **Outputs / effects:** The Lua targeting logic executes automatically at scenario start, randomizing the raid per playthrough.
- **Edge cases / quirks:** Pairs naturally with the random-target script (which itself seeds RNG). Trigger must actually be added/confirmed (same add-button caveat as scoring events).
- **Source:** 3IgCJs1m0O4
- **Confidence:** Med

---

## 5. Bulk Placement: Imports & KML

### Built-in import packs for installations (radar lines, SAM sites, cities, OOB)
- **Models:** Prebuilt importable datasets shipped with CMO that drop historical installations/units in bulk.
- **Inputs / parameters:** Import/Export → Load Installations menus by region; named packs: Continental US (SAM sites, DEW/'do' line, Pine Tree, SAGE), Nike-Ajax sites, Bomarc sites, 'World Cities' import, US air bases.
- **Behavior / rules:** Designer uses built-in imports to load entire historical structures with a checkbox + 'Load selected installations': radar early-warning lines, Army Nike-Ajax sites (onto Army side), Air Force Bomarc sites (onto USAF side), and a 'World Cities' pack to instantiate target cities globally. Praised as saving enormous research time ("would have taken half a lifetime"). Each pack's units arrive preconfigured for the era.
- **Outputs / effects:** Large sets of named installations/cities placed in one operation onto the selected side.
- **Edge cases / quirks:** Importing cities onto a combat side bloats it (**~600** extra units on a side already at **~1,000**) → author makes a dedicated 'Civil' side first. After importing, prune out-of-range/anachronistic entries (e.g., remove Honolulu as not-yet-a-state, Puerto Rico/Anchorage as unreachable).
- **Source:** qVQCSV2wLag | 3IgCJs1m0O4
- **Confidence:** High

### KML → import-file conversion for bulk facility placement
- **Models:** Authoring large geographic laydowns externally (Google Earth KML) and converting them into CMO importable installation sets.
- **Inputs / parameters:** A KML file of labeled locations (e.g., air bases) built in Google Earth; CMO's KML→import conversion; database-region import menus.
- **Behavior / rules:** Designer builds a KML of all US air bases (labeled), saves it, and converts it into a CMO imports file, then imports the whole set at once into a side ("boop... instantaneously have all"). Selecting the import region (Database → United States → 'Culver air bases') drops all bases simultaneously.
- **Outputs / effects:** Many facilities placed at once on the chosen side, ready for squadron population.
- **Edge cases / quirks:** Easy to import onto the **WRONG side** (author accidentally put US bases on the USSR side, then fixed). Naming is **NOT preserved** through conversion if not labeled correctly — author had to rename each base manually afterward (cross-referencing Google Earth), calling it "my bad."
- **Source:** qVQCSV2wLag
- **Confidence:** High

### Importing pre-built bases/airfields from the scenario database vs. building single-unit airfields
- **Models:** Seeding the map with ready-made real installations from the DB, or hand-rolling a minimal single-unit airfield.
- **Inputs / parameters:** Database browser (by country → named real bases, e.g., 'Captain Louise' fighter base east of Bogotá); Insert to place; OR single-unit Airfield facility with a chosen runway type/length (e.g., tactical support, 2600 ft).
- **Behavior / rules:** Open the DB, browse by country, pick an existing real base record and place it (must press **Insert** at the click location or it won't drop). Alternatively build a 'single unit airfield': choose an airfield/runway facility, set a small runway type and length (**2600 ft** tactical support), name it, and set not-auto-detectable. Imported full bases come pre-populated with sub-facilities (hangar, ammo shelter, terminal, tower, tarmac) which you then stock.
- **Outputs / effects:** An operational airbase on the map, either richly pre-populated (import) or minimal (single-unit).
- **Edge cases / quirks:** Forgetting to press Insert silently fails the placement (author had to redo it). Single-unit airfield runway length/type constrains which aircraft can operate (implied by choosing 2600 ft tactical-support).
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### AI/script-generated facility grid placement
- **Models:** Bulk-populating a region with facilities via an external generator script instead of hand placement.
- **Inputs / parameters:** Center coordinates; a database/list of building types with properties; spacing; optional jitter.
- **Behavior / rules:** An external GPT-written script generates a grid of facilities centered on entered coordinates, using a chosen set of building DB types with properties; running it imports a dense regular grid of buildings at once. Parameters can be tuned (closer spacing, jitter/randomization) to make it look natural; intended for quickly populating an entire city/country.
- **Outputs / effects:** Many facility units placed programmatically in a grid pattern.
- **Edge cases / quirks:** Raw output is an unnaturally 'precise grid'; jitter/spacing edits needed for realism. This is an **external-tooling technique, not a built-in CMO feature**; prompt was iterated several times. Heightmap/Heros-model methods mentioned but not detailed.
- **Source:** ENwbz9RaPoM
- **Confidence:** Low

---

## 6. Lua Procedural Generation & Targeting

### Lua scripted random unit creation within a bounding lat/long box
- **Models:** Procedurally placing many units at randomized coordinates inside a rectangular region.
- **Inputs / parameters:** Lua console; a definite for-loop (e.g., `for x=1,10`); `math.random` for latitude/longitude; corner coordinates read by hovering the mouse (e.g., lat ~38–43, near the 38th parallel); `ScenEdit_AddUnit` with a table `{side, type='Facility', name, dbid, autodetectable, latitude, longitude}`.
- **Behavior / rules:** Loop N times; for each iteration generate a random lat and lon. **KEY technique** to avoid units snapping to integer grid intersections: generate a random integer then **DIVIDE** it to add decimal variance (so coordinates land at fractional values, not just on major grid lines). Then call `ScenEdit_AddUnit` with the randomized lat/lon and a looked-up dbid (from the Database Viewer, e.g., **SA-2 = 1288**).
- **Outputs / effects:** N facilities/units scattered at randomized fractional coordinates across the lat/long box.
- **Edge cases / quirks:** Without the divide-for-decimals trick you "only get people on the intersection of major grid lines." A pure lat/long box leaks units into unwanted countries when borders are irregular (units end up in China/South Korea) — solved by the in-area check (separate mechanic). Corner coordinates are found by hovering the mouse, not hard-coded knowledge.
- **Source:** is-mr11RJqA
- **Confidence:** High

### Lua land/water elevation gate via `repeat...until World_GetElevation`
- **Models:** Rejecting placements that fall in the wrong medium (water for land units, land for subs) using terrain elevation.
- **Inputs / parameters:** `World_GetElevation({latitude=, longitude=})` returning elevation; a `repeat...until` loop regenerating coordinates.
- **Behavior / rules:** Inside a repeat loop, regenerate random lat/lon, then loop **until `World_GetElevation{lat,lon} > 0`** — i.e., elevation ≤ 0 means water/depth, so reject and retry; > 0 means land, accept. **Invert** the comparison for submarines (require water). Only after the elevation check passes is the unit created.
- **Outputs / effects:** Units guaranteed on the correct medium (land vs sea) per the comparison direction.
- **Edge cases / quirks:** **STRONG warning:** repeat loops can become **INFINITE** if the condition is never satisfiable — must be careful. Author notes many people move this elevation check to the wrong place in the flow. Common typos break it (misspelled function, missing longitude key) — debug by reading the error line.
- **Source:** is-mr11RJqA
- **Confidence:** High

### Lua in-area constraint via reference-point polygon + `unit:inArea()`
- **Models:** Constraining placement to an irregular polygon (a country) defined by reference points, not just a lat/long box.
- **Inputs / parameters:** A set of named Reference Points (RPs) placed around the region's border; an area table listing those RP names (e.g., `NorthKorea = {RP1, RP2, ...}`); the created unit handle; the special property `unit:inArea(areaTable)` returning true/false.
- **Behavior / rules:** 1) Place RPs around the border (can verify contiguity by drawing a fake patrol mission over them). 2) Define area = table of those RP names. 3) Capture the created unit (`lastUnit = ScenEdit_AddUnit(...)`). 4) Evaluate `isInArea = lastUnit:inArea(NorthKorea)`. 5) If **FALSE** (outside polygon), either **DELETE** the unit (`ScenEdit_DeleteUnit{side, guid=lastUnit.guid}`) — author's preference — or regenerate its location. `inArea` returns a Lua boolean (printed as yes/no but is true/false).
- **Outputs / effects:** Only units whose coordinates fall inside the RP polygon survive; out-of-polygon units are deleted (or relocated).
- **Edge cases / quirks:** Use `ScenEdit_DeleteUnit`, **NOT** 'remove unit' — the author warns "remove unit is actually going to trigger any sort of events you have to be very careful with that" (delete is silent, remove fires events). The `inArea` result is true/false despite displaying yes/no. Polygon need not be a simple box, so it handles irregular country shapes the lat/long box can't.
- **Source:** is-mr11RJqA
- **Confidence:** High

### Lua guaranteed-count placement loop (`repeat...until` with success counter)
- **Models:** Producing an EXACT number of successfully-placed in-area units despite rejections.
- **Inputs / parameters:** A counter (`sams=0`); an outer repeat loop; the in-area check; a target count (e.g., 20); optionally a randomized target count via `math.random(min,max)`.
- **Behavior / rules:** Replace the definite for-loop with an indefinite repeat loop. Logic: set counter=0; repeat { generate coords; test `inArea`; if NOT in area → delete unit (do NOT increment); else → counter = counter + 1 } **UNTIL counter ≥ target** (e.g., 20). This guarantees N successful placements regardless of how many attempts were rejected. The target itself can be **randomized**: `numSams = math.random(10,50)` then loop until counter reaches `numSams`, so each scenario start spawns a different count.
- **Outputs / effects:** Exactly the desired (or randomized) number of in-area units placed.
- **Edge cases / quirks:** Classic bug called out: writing 'while' where 'until' is needed (and only incrementing in the else branch). If you forget to NOT-increment on failed placements, the count is wrong. Randomizing count per scenario-start (**10–50**) is praised as a way to keep the scenario unpredictable for the player. Author notes future refinements: spacing SAMs apart, gridding, or placing on highest elevation.
- **Source:** is-mr11RJqA
- **Confidence:** High

### Lua bulk aircraft generation via for-loop + `ScenEdit_AddUnit` (air type)
- **Models:** Spawning hundreds of identical aircraft programmatically instead of placing each by hand.
- **Inputs / parameters:** `for k=1,N do ... end` (e.g., N=200, 400); `ScenEdit_AddUnit{type='Air', unitname='tu16'..k, loadoutid=7381, dbid=629, side='red four', latitude, longitude, altitude (meters)}`; per-type DB IDs (Tu-16 dbid **629**) and loadout IDs.
- **Behavior / rules:** A simple counted loop calls AddUnit each iteration with a name suffixed by the loop index `k`, spawning N aircraft at a fixed launch coordinate/altitude. Author spawns **200** Tu-16s and **400** Tu-4s → **600** bombers in "a few seconds." Altitude supplied in **METERS**. Contrast with the manual alternative (Ctrl+F11 'create N bombers' against all targets) which "works" but wastes fuel and string-of-pearls attacks each target sequentially.
- **Outputs / effects:** N aircraft instantiated on the specified side at the given position/altitude/loadout.
- **Edge cases / quirks:** Easy to mistype `type=Air`. Manual Ctrl+F11 mass-creation makes all bombers hit the FIRST target, then the next, etc., wasting fuel and exposing them; scripted creation + per-aircraft targeting avoids that.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

### Lua per-aircraft target assignment from contact list (deterministic 1:1)
- **Models:** Giving each spawned bomber exactly one target by indexing a target array in lockstep with the unit array.
- **Inputs / parameters:** Collect targets: `redfor = VP_GetSide{name='red four'}`; `targets = redfor.contacts` (all map contacts) OR collect own units: `redUnits = VP_GetSide{name='red four'}.units`; `numTargets = #targets`; loop `for k,v in ipairs(redUnits)`; `ScenEdit_AttackContact(attacker_guid, targets[k].guid, mode=0 automatic)`.
- **Behavior / rules:** Build a list of targets (enemy contacts) and a list of attacker units, then loop with `ipairs` over the units, assigning `targets[k]` to unit `k` via `AttackContact` with attack **mode 0 (automatic)**. Because there are **FEWER bombers than targets**, the 1:1 index mapping works without overflow.
- **Outputs / effects:** Each bomber receives one distinct target and proceeds to attack it automatically.
- **Edge cases / quirks:** If unit count **EXCEEDS** target count, `targets[k]` goes nil → "attempt to index a nil field" error; author fixed by reducing bombers (e.g., **150** Tu-16s) to stay below **~500** targets. NOTE deleting radar sites earlier reduced the contact/target count, breaking the math — counts must be re-checked. Deterministic mapping makes the raid **PREDICTABLE**: drawing a line from a bomber along its heading reveals its likely target (no zig-zag), an exploitable weakness.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

### Lua random target assignment with range validation
- **Models:** Assigning each bomber a randomly-chosen, in-range target for an unpredictable raid.
- **Inputs / parameters:** Seeded RNG (`math.randomseed(os.time())` — "randomize timer"); `math.random(numTargets)`; per-type max range (Tu-16 maxrange=**2200**; Tu-4A its own range) selected via `ScenEdit_GetUnit` dbid check (**62/629**); `ScenEdit_GetRange` / `Tool_Range(attacker_guid, target_guid)` returning nm; `AttackContact`.
- **Behavior / rules:** For each unit (`ipairs` over `redUnits`): **SEED the RNG first** ("always randomly generate the seed"); pick a random target index; set `maxRange` by checking the unit's dbid (if dbid==629 → maxRange=**2200** else maxRange = Tu-4A range); then **`while range > maxRange do`** pick another random target and recompute `range = Tool_Range(unit.guid, target.guid)` — looping until a target within maxRange is found; then issue `AttackContact`. Because two bomber types with different ranges coexist, both ranges must be handled (author set maxRange=0 initially then branched).
- **Outputs / effects:** Each bomber attacks a randomly selected target that is within its range; targeting differs every run.
- **Edge cases / quirks:** **'Circly' bombers:** some units still can't attack (out of range, visibility, wrong/forbidden weapon, or an engine cap on simultaneous attacks) and orbit in a "bomb hop circle" — author fixes by manually assigning them an in-range target. Recommend running the RANDOM script **AFTER** the deterministic one for redundancy to reduce circlers. Moving targets closer reduces out-of-range picks. Must not accidentally run both the random and non-random versions unintentionally.
- **Source:** 3IgCJs1m0O4
- **Confidence:** High

---

## 7. Reference Points, Areas & Zones

### Reference Points / Zones — creation methods, selection state, and area definition
- **Models:** The primitive geometry layer (points, rectangles, circles, polygons) used to define mission areas, exclusion/no-nav zones, and patrol boxes — built from reference points.
- **Inputs / parameters:** Owning **SIDE** (must be correct before creating a point); creation via menu 'Add new reference point' or **Ctrl+Insert** + click; **Ctrl+right-click → Define Area** → Rectangle (Ctrl+K) or Circle; **Ctrl+P** polygon; **Ctrl+Delete** to remove selected points; area name; optional color.
- **Behavior / rules:** Multiple ways to create a zone, each producing a named set of reference points:
  - **Manual:** Ctrl+Insert repeatedly to drop points, then in the Area/Reference Points Manager select the points, name the zone (e.g., 'Iceland'), optionally set a color. Points must be added in correct **ring order** or the polygon self-intersects ("goofiness").
  - **Rectangle:** Ctrl+K, drag a box, release → prompt "do you want to create a Zone entity from this defined area?" → name → OK creates the zone from the box corners.
  - **Circle:** click-and-drag **FROM THE CENTER outward**; release → name → creates a many-vertex approximation drawn as straight-line segments (not true curves, to save memory).
  - **Polygon:** Ctrl+P, name first, then click each vertex, Escape to finish/cancel; more vertices = more authoring work.
  - **Ctrl+right-click** on map offers a 'define an area' drag option that also prompts to create a named area.
  A newly placed point spawns **UNSELECTED** by default (bites you when box-selecting points into an area and one is missed).
- **Outputs / effects:** A new named Zone/Area entity composed of reference points; optional custom color; usable by missions and zones.
- **Edge cases / quirks:** Always confirm the correct **side** before creating points. **No Undo** for reference-point/zone mistakes (Ctrl+Z does NOT undo a misordered polygon or an accidental move); Escape cancels an in-progress circle/polygon. **Circle areas** are stored as straight-segment polygons (not curves) and "create quite a bit of extra data that we need to calculate when working in areas" — a performance cost vs rectangles. Wrong vertex order yields a self-crossing 'bowtie' polygon. A typical strike (air-land-sea) scenario can have **'40, 50'** reference points. Demonstrated on build **1.32.31 beta**; details may change.
- **Source:** -3xf9HqBSV0 | rj1AM-xUycU
- **Confidence:** High

### Reference Point tags + zone transform/creation (Reference Points Manager)
- **Models:** Organizing/grouping large reference-point sets by purpose (e.g., CAP area, ASW area, West/East zones) and converting tagged groups into typed zones.
- **Inputs / parameters:** Per-point/per-group tags (a tag value must first be **ADDED as a possibility** before it can be applied; e.g., 'West WP', 'East WP', 'West Zone', 'East Zone'); selection set; zone validation; zone color; zone type for transform (e.g., Exclusion Zone, with violators/properties incl. submarines).
- **Behavior / rules:** In Reference Points Manager, add a tag possibility, then select points and apply the tag (must have the **correct points selected** — author repeatedly mis-clicks and has to remove/re-add a wrong tag like 106). Tagged points can be **recolored** on the map (e.g., West Zone green, East Zone pink) for instant identification. To build a zone: select the tagged points, choose 'add all points', **VALIDATE** the area (must pass area validation), optionally color it, and SAVE — note: it does **NOT auto-grab** points; you must select them to put them on the map. A saved zone can be **TRANSFORMED** into another type (e.g., press a button to convert a plain zone into an Exclusion Zone), after which you set violators/properties.
- **Outputs / effects:** Tagged, color-coded reference-point groups summonable by tag; validated zones; zones convertible to exclusion/no-nav/etc. types with their own rule properties.
- **Edge cases / quirks:** Tag value must be created as a possibility before assignment. Zone creation requires explicit point selection (won't grab points automatically) and a passing area validation. Manager consolidates what used to be separate menus (no-nav zones, environment zones, exclusion zones). Tags are freely renamable.
- **Source:** -3xf9HqBSV0
- **Confidence:** High

### Editing existing areas: per-point move, whole-area move, and reference-point interpolation
- **Models:** Post-creation adjustment of a zone's geometry by moving individual vertices, translating the whole polygon, or subdividing edges to add detail.
- **Inputs / parameters:** Left-click+drag (single point); **Shift+click+drag** (whole area); **Shift+right-click** on area → context menu (select RPs / rename / delete / interpolate); interpolation factor (e.g., 'double reference points', up to **16x**).
- **Behavior / rules:** Left-click and drag moves one reference point. Holding **SHIFT** while click-dragging moves **ALL** points of the area simultaneously (rigid translation), letting you reposition the entire zone by grabbing one corner. Shift+right-click on the area opens a context menu to select the reference points, rename, delete, or **INTERPOLATE** the area. Interpolate inserts new vertices along existing edges by a chosen multiple (double = 2x points; 16x adds many), so you can then drag the newly created points to refine the outline without deleting and rebuilding.
- **Outputs / effects:** Modified area geometry (moved points / added vertices); same named entity retained.
- **Edge cases / quirks:** Rigid (shift) translation across large lat/long spans gets **distorted** because the map is a globe projected to a flat surface — points on the far side of a moved shape shift relative to the near side. Still **no undo**.
- **Source:** rj1AM-xUycU
- **Confidence:** High

### Relative reference point — Fixed Bearing mode
- **Models:** A reference point that stays at a constant offset (range + true bearing) from a parent object, regardless of how the parent rotates/turns; the offset is locked in world-relative (compass) terms.
- **Inputs / parameters:** Parent object (any unit/contact, e.g., own ship, a hostile/'skunk' contact, or a whole group); the reference point's initial position relative to that object at the moment of attachment (which fixes its range and absolute bearing). Set via Missions and Reference Points → 'Make selected reference point relative — fixed bearing to', then click the parent.
- **Behavior / rules:** 1) Create a reference point normally (Ctrl+Insert, then click map). 2) Choose 'Make selected reference point relative — fixed bearing to', then click the parent object. 3) The RP is labeled with **'F'** and shows its name plus what it is attached to. 4) As the parent **translates** (moves position), the RP moves with it, preserving the same relative position. 5) When the parent **CHANGES COURSE/HEADING**, the RP does **NOT** swing around — it holds the same absolute (world/compass) bearing offset, so it "stays there no matter what" the parent's facing does. Demonstrated: ordering the parent to turn does not whip the point around; it remains in a stable safe spot offset from the parent.
- **Outputs / effects:** The reference point's geographic position continuously updates to track the parent's location while keeping a fixed compass-bearing offset; it does not rotate with the parent's heading.
- **Edge cases / quirks:** Used to keep a point in a "nice safe spot far away" from a moving threat's range. Recommended when you do NOT want the point to swing as the parent maneuvers (contrast with rotating mode, where a parent course change sends a mission-bound unit chasing the relocated point). Switching an already-rotating point to fixed mode stabilizes it.
- **Source:** kdLSo-_DDxg | rj1AM-xUycU
- **Confidence:** High

### Relative reference point — Rotating Bearing mode
- **Models:** A reference point whose bearing offset rotates with the parent object's heading/facing, so the point (and any zone built from such points) turns as the parent turns — i.e., it stays ahead of / off a specific side of the parent.
- **Inputs / parameters:** Parent object (own unit, an enemy contact/'skunk', or a whole group); the point's initial relative position; the parent's current facing/heading (which the offset is measured against). Set via Missions and Reference Points → 'Make selected reference point relative — rotating bearing to', then click the parent.
- **Behavior / rules:** 1) Create reference point (Ctrl+Insert, click map). 2) Choose 'Make selected reference point relative — rotating bearing to', then click the parent object. 3) The RP now both **translates** with the parent AND **rotates** so its position is relative to the parent's current facing. 4) As the parent maneuvers (e.g., a turn), the point "hangs out" off the parent and swings around with the heading. 5) Speeding up time shows the RP continuously moving with the parent. Multiple points can be attached this way to one parent.
- **Outputs / effects:** Reference point position tracks parent location and re-orients with parent heading; a set of such points forms a zone that whips/rotates around the parent as it turns.
- **Edge cases / quirks:** If a mission-bound unit is assigned to a rotating point attached to a maneuvering target, a target course change relocates the point and the assigned unit will "run over there" and re-cycle its radar at the new position — a reason to use fixed mode when chasing is undesirable. Works attaching to enemy contacts and to whole groups (point follows the group). Author warns relative points are computationally expensive: recomputing many attached points each tick will choke the sim at high time-compression.
- **Source:** kdLSo-_DDxg | rj1AM-xUycU
- **Confidence:** High

### Relative / moving Zone (reference-point area attached to an object)
- **Models:** A multi-point area (Zone) whose vertices are all relative reference points tied to an object, producing a dynamic search/exclusion area that moves and (in rotating mode) rotates with that object — e.g., a forward-looking sanitization area ahead of a submarine or convoy.
- **Inputs / parameters:** A defined area/zone (created via Ctrl+Right-click → define new area → confirm (Yes) → name it) and a parent object; mode chosen (rotating vs fixed) applied to the zone's reference points.
- **Behavior / rules:** 1) Create a Zone: Ctrl+Right-click, define a new area, confirm (Yes), give it a name. 2) Apply 'reference points rotating bearing' (or fixed) and attach to the parent object. 3) In **rotating** mode the whole zone shape translates AND rotates based on the parent's current facing — the shape visibly "whips around" as the parent turns, creating a dynamic zone (described as a "death zone"). 4) The same can be attached to a whole **group** so the zone follows the entire group.
- **Outputs / effects:** An area/zone that continuously repositions (and reorients, in rotating mode) with the parent object or group; usable to drive missions tied to that zone.
- **Edge cases / quirks:** Popular use: forward 'sanitization' area to ensure no subs ahead of a convoy; can compose several dynamic zones around a central asset (e.g., CAP one side, ASW another) all moving with a carrier in the middle.
- **Source:** kdLSo-_DDxg
- **Confidence:** High

### Mission interaction with a moving reference point (support mission tracking a contact)
- **Models:** How an assigned unit on a mission behaves when its target reference point is a moving/relative point attached to a contact — the unit continuously repositions to the live point and toggles sensors on arrival.
- **Inputs / parameters:** A support mission (created via Ctrl+F11, named, type set to Support) with a moving reference point added as a waypoint/area; an assigned unit set to 'active' EMCON (radar on) for the mission; the reference point attached (rotating) to a moving contact.
- **Behavior / rules:** 1) Create support mission and add the moving reference point to it (the editor warns it can't find/confirm the point — proceed anyway). 2) Assign a unit and set it active on missions so it uses its radar. 3) The unit transits to the current point location; on reaching the reference zone it turns its radar **ON**. 4) Because the point is attached (rotating) to the moving target, the point stays with that target and the unit effectively **shadows** the target the whole time. 5) If the target changes course while in rotating mode, the point jumps to a new relative position; the unit shuts its radar **off**, repositions to the new point, then turns radar back **on** — i.e., it re-cycles each time the point relocates.
- **Outputs / effects:** Assigned unit continuously chases the live reference-point position and toggles emissions (radar off in transit, on at the point); mission effectively trails the target.
- **Edge cases / quirks:** Adding a moving point to a mission triggers a "can't find it / are you sure" warning that can be safely ignored. Rotating mode causes repeated radar off/reposition/radar-on cycling on every target course change — switch the point to **fixed** mode to stop the chasing/cycling. You must still set the unit active on the mission for it to emit. Separately noted limitation: there is no right-click 'identify contact' to temporarily ID a contact and get its range rings (anticipated for a future version).
- **Source:** kdLSo-_DDxg
- **Confidence:** Med

### Create-mission-from-zone (dynamic mission authoring via Shift+right-click)
- **Models:** Quickly spawning a mission that uses a selected zone as its area, with the selected unit pre-assigned.
- **Inputs / parameters:** A pre-selected unit (left-clicked); **Shift+right-click** on a Zone; mission type chosen (e.g., AAW patrol, support); optional 'pick area' selection with a filter.
- **Behavior / rules:** Left-click a unit to pre-select it, then Shift+right-click a Zone → a 'create missions using the zone' menu appears with **BOTH** the unit and that area already pre-selected, so choosing a mission type (e.g., AAW air patrol) builds the mission immediately. A 'pick area' button lets you left-click to choose among existing areas, and a filter button narrows the (potentially very many) areas by type to make selection easier. After assignment, right-click ordering (intercept/patrol/support) works directly on the map for the assigned unit.
- **Outputs / effects:** A new mission bound to the unit + zone; reduces multi-step mission setup to a couple of clicks.
- **Edge cases / quirks:** Helps scenario designers manage many area types (marshalling, refueling, no-control, SAM, air-defense areas) without overwhelming the player. Build **1.32.31 beta**; may change.
- **Source:** rj1AM-xUycU
- **Confidence:** Med

### Marshalling/reference points and one-way strike-radius planning
- **Models:** Using map reference points to plan bomber launch geometry against published combat radius, treating strikes as one-way.
- **Inputs / parameters:** Marshalling points placed on map; aircraft combat/strike radius from the DB (one-way values); great-circle distance to targets; chosen scenario year (gates which bombers exist).
- **Behavior / rules:** Designer reads each bomber's listed range/strike radius and explicitly **DOUBLES** it for a one-way (suicide) mission: e.g., Tu-16/'Badger A' strike radius **1,300 nm** → treated as **2,600 nm**; Tu-4/'Bull A' radius **2,324 nm** → **4,648 (~'4,600') nm**. Direct great-circle Russia→US distances stated: **~4,000 nm** to Washington DC, **~4,500 nm** to Texas. Then geometry: a 4,600 nm Tu-4 from Severnaya/Cola can reach Texas/Florida or "barely" DC; 2,600 nm Tu-16s must launch from the nearest landmass. Marshalling points are placed to mark these launch origins for each bomber type.
- **Outputs / effects:** Determines feasible launch points, which targets each bomber type can reach, and overall raid geometry.
- **Edge cases / quirks:** Bombers must be year-appropriate (Bison/Blinder/Bear-A excluded as too new or too short-legged for 1955). One-way assumption is a deliberate doubling of catalog range. Out-of-range targets (Puerto Rico ~3,800 nm; Anchorage/Honolulu) get culled because nothing can reach them.
- **Source:** qVQCSV2wLag | 3IgCJs1m0O4
- **Confidence:** High

---

## 8. Mission & Flight-Plan Authoring

### Mission types as the scenario tasking structure (Support / Patrol / Strike / Escort)
- **Models:** How an author structures aircraft tasking: distinct mission objects each with their own editor, assigned aircraft, and behavior settings.
- **Inputs / parameters:** Mission name; mission type (Support, Patrol/CAP via Ctrl+F11 on an area, Strike, Escort); assigned aircraft (F6 to select at base then right-click 'assign mission'); flight size; reference-point area (Ctrl+right-click to define rectangle/zone) for patrol/support coverage; per-mission options (e.g., 'one-third rule', EMCON).
- **Behavior / rules:** 1) Create a **support** track for tankers + AEW (radar services). 2) Create a **CAP/patrol** by Ctrl+right-click defining a rectangle area, then Ctrl+F11 to make it a patrol mission, assign fighters. 3) Create a **strike** mission by selecting the target then Ctrl+F11 → strike. 4) Reserve some aircraft and assign them an **Escort** mission via right-click 'assign a mission → escorts'. Each mission has its own settings panel; aircraft inherit mission behavior. Author recommends, for hitting many targets at one airbase, using **four or five separate missions** each with its own target (or a support-mission gather then strike) rather than one mega-mission.
- **Outputs / effects:** Multiple coordinated missions (support, CAP, strike, escort) feeding a single operation; assigned flights appear in the ATO with takeoff/landing data.
- **Edge cases / quirks:** A 'Dynamic' mission option exists but is flagged very advanced / beta / work-in-progress and deferred. Naming a flight reportedly makes it "live longer" (an author claim repeated twice). For deeper coordination there is an 'Operation Planner' (not covered).
- **Source:** PhLwO7mmmRc
- **Confidence:** High

### Strike-package creation (Ctrl+F11) with strikers/escorts and attack options
- **Models:** Rapidly assembling a coordinated air strike: pick targets, pick units, assign each unit a role, set attack geometry.
- **Inputs / parameters:** Hotkey-launched mission/strike builder (Ctrl+F11; also Shift+F1 referenced); target set; selectable units (with ability to exclude types like helicopters, AEW, COD); per-unit role = Striker or Escort; 'off-axis attack' option.
- **Behavior / rules:** Designer opens the strike builder, chooses a strike type (Land Strike), selects all relevant units (excluding non-combat types), and assigns each group as **Striker** or **Escort**. Adds 'off-axis attack' for ingress geometry. The engine then coordinates the package ('alpha strike'). Roles are assigned per group sequentially.
- **Outputs / effects:** A coordinated multi-aircraft package with defined strikers, escorts, and attack axis launches against the targets.
- **Edge cases / quirks:** Easy to accidentally include/exclude wrong types ("grabbed the E-2s by accident", "left a couple aircraft out — happens all the time"). Very large packages cause heavy lag.
- **Source:** 0SwTlMuRdzo
- **Confidence:** Med

### Reassigning units to escort to simplify doomed long-range tasking
- **Models:** Repurposing units whose original mission would just get them killed.
- **Inputs / parameters:** Units mid-mission (Su-24s slated as long-range bombers); reassignment to Escort role.
- **Behavior / rules:** Observing that Su-24M bombers would fly over enemy air-defense and be slaughtered, the designer reassigns that whole group to **ESCORT** (protecting Tu-22s) instead — "simplifies things" and works far better. Demonstrates editing tasking after observing failure.
- **Outputs / effects:** Units change role from striker/bomber to escort; survivability and scenario coherence improve.
- **Edge cases / quirks:** Decision is judgment-based ("you can decide how this would have gone"); driven by observed losses in testing.
- **Source:** 0SwTlMuRdzo
- **Confidence:** Med

### Mission timing: takeoff time and time-on-target (TOT) coordination
- **Models:** Authoring deconfliction so support/escort assets are on-station before strikers arrive over the target.
- **Inputs / parameters:** Scenario clock (Zulu); per-mission takeoff time; per-mission/per-flight time-on-target; (locks for fixing times or speeds in the flight-plan editor).
- **Behavior / rules:** Set support track to take off later (e.g., **11:40Z**) so CAP fighters ordered to take off earlier (e.g., **11:30:30Z**) get into position first. For the main strike, set a time-on-target (e.g., **12:30**) **BEFORE** editing the flight plan; the engine **auto-generates** a flight plan (including a holding pattern) to meet that TOT. Setting/locking a speed on a waypoint recomputes the timeline to still meet the TOT, propagating speed changes across other legs. **Workflow rule stated:** do all waypoint edits first, then altitude/speed edits, and **lock the TOT** before clicking around.
- **Outputs / effects:** Auto-generated flight plan + holding pattern sized to satisfy the TOT; aircraft arrive within seconds of the ordered time.
- **Edge cases / quirks:** Demonstrated arrival was "**7:32, two minutes late**" but author notes the flight did NOT turn around — had it not, it "would have been within **10 seconds** of where they're supposed to be" (i.e., TOT accuracy is ~seconds when geometry is clean). **Changing attack methods OR the time-on-target REGENERATES the entire flight plan and discards manual waypoint/altitude work** — author wishes for a deferred 'regen' button. Auto-save recommended before running.
- **Source:** PhLwO7mmmRc
- **Confidence:** High

### Flight Plan Editor — waypoint insertion, refuel waypoints, per-leg altitude/speed
- **Models:** Fine-grained authored routing of a strike package: where it refuels, holds, and at what altitude/speed it crosses the target.
- **Inputs / parameters:** Selected flight + selected aircraft within the flight (multiple aircraft listed; must pick the one being edited); waypoint type (Turning Point vs Refueling); per-waypoint altitude and speed; afterburner toggle; hold altitude/speed; landing speed.
- **Behavior / rules:** Open Flight Plan Editor GUI; it lists every aircraft and every flight. Insert a waypoint after the highlighted turning point; the editor prompts "did you mean Turning Point?" — choose **Refueling** to convert it into a refuel point. Aircraft will route to a previously-created refueling track to take on gas en route, then continue. Edit per-leg altitude/speed: e.g., raise the target-crossing leg from **200 ft** to **2000 ft** and go to afterburner so they cross faster and higher; raise the **HOLD** leg altitude (from **~2 grand** to **36,000 ft**) to save fuel in thinner air while loitering. Can also insert a second refuel waypoint and set a separate 'extra gas' point over the target. Define landing speed too.
- **Outputs / effects:** A customized per-leg route with refuel points, high-altitude holds, and target-pass altitude/speed; aircraft execute it (observed climbing to 36,000 ft for the hold, taking gas at the refuel point, popping to correct altitude over target).
- **Edge cases / quirks:** Crossing the target at **200 ft** gets aircraft "chewed up by 23 millimeter cannons" — author pops to **2000 ft** to mitigate. **CAUTION repeated:** the editor shows all airplanes and it's easy to change the wrong one. Hold-altitude trick: "obviously you don't let the enemies know that you're holding." These manual edits are **wiped** if TOT/attack-method changes trigger plan regeneration (see timing mechanic).
- **Source:** PhLwO7mmmRc
- **Confidence:** High

### Air Tasking Order (ATO) as a consolidated flight ledger
- **Models:** A single read-out of all flights in the scenario with their schedule, names, and base assignments (Falcon-style ATO).
- **Inputs / parameters:** All authored flights; per-flight editable fields: assigned crew/aircraft, flight name, takeoff time, takeoff position, landing position; local objective time and Zulu time (lockable).
- **Behavior / rules:** Open the ATO to see every flight in one table: takeoff time, who's flying, names, local objective time, Zulu time, takeoff and landing positions. Fields can be **locked or edited here without disturbing existing flight plans** (author re-checks F11 afterward: "our flights are perfectly intact, nothing bad happened").
- **Outputs / effects:** Edits to crew/name/takeoff/landing propagate to the flights; provides scheduling visibility (e.g., reading off a 6:52 AM takeoff ~5 min out).
- **Edge cases / quirks:** Editing in the ATO is presented as **safe** vs. flight-plan regeneration; naming flights here again tied to the "named flights live longer" claim.
- **Source:** PhLwO7mmmRc
- **Confidence:** Med

### Authoring missions/areas during play: support mission, surveillance station params, and strike with reserve
- **Models:** Building patrol/support/strike missions and tuning station altitude, throttle, third-rule, and reserves.
- **Inputs / parameters:** Ctrl+Insert (reference area), Ctrl+F11 (mission), F6 (aircraft loadout/mission); area-surveillance assignment; mission settings: 1/3 rule on/off, group size, escorts, station throttle & altitude, one-time vs sustained attack, reserve allocation.
- **Behavior / rules:** Author creates a support mission (Ctrl+F11) over an AO, assigns surveillance aircraft (Scan Eagle, OT-47B) to area surveillance, and tunes station parameters: turns **OFF the one-third rule** (so more airframes are committed), sets group size, escorts, lowers station altitude (e.g., **12,000 ft**) for better sensor view. For strikes, Ctrl+F11 → Land Strike, commit aircraft but deliberately **HOLD a reserve** (don't commit all A-37s) — reserves are stressed as critical; group of four, escorts optional, one-time attack vs loiter chosen per intent.
- **Outputs / effects:** Active patrol/support/strike missions with controlled altitude, throttle, force commitment, and reserves.
- **Edge cases / quirks:** Turning off the 1/3 rule frees more aircraft per mission (otherwise only ~1/3 are on-station). Default station altitude is "way too high" for spotting irregulars — lowering to ~12,000 ft improves detection. Committing 100% of a strike package is repeatedly warned against (keep reserves).
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

---

## 9. Unit Composition & Group Editing

### Generic placeholder ground units with editable mounts (single-unit-represents-many)
- **Models:** Modeling a large ground formation (company/battalion) as one map unit instead of hundreds of individual vehicle icons, to keep unit counts low while staying combat-tenable.
- **Inputs / parameters:** Facility type selected at insert time (search keyword e.g., 'armored' / 'mech' returns generic options: armor generic, armored battalion, brigade, company, mechanized infantry company); per-mount: weapon/vehicle database item chosen via Add Mount (filter by keyword, e.g., 't55','bmp1','bmp2','t-62','2s1','zsu23','sa-9'); quantity of each mount; unit name; parent regiment/brigade assignment.
- **Behavior / rules:** 1) Insert a new unit and choose a generic 'facility' archetype (armored/mech company etc.). 2) The placeholder spawns with a single default machine gun mount only. 3) **Delete that default mount.** 4) Use 'Add Mount' to add individual vehicles — in this version of Command, **mounts ARE individual vehicles** — adding e.g., **12 T-55s** makes a tank company. 5) Add a heterogeneous mix for a combined-arms unit (e.g., BMPs + T-62s + 2S1 + ZSU-23 + SA-9) to build a 'reinforced' mechanized infantry company. 6) Rename and assign to a regiment/brigade. 7) Press **Shift+C** on the finished unit to clone it into Company B, C, D, etc., mass-producing a battalion from one authored template.
- **Outputs / effects:** A single map unit whose composition (weapons/vehicles and counts) is fully defined by its mount list; clones replicate the full mount loadout. Net effect: fewer individual unit objects on the map representing a large force.
- **Edge cases / quirks:** Generic placeholder ALWAYS comes with one stock machine gun that must be removed first. Pressing 'C' repeatedly scales a normally-inserted group into company/battalion which "runs up the unit count really really fast" — the mount trick avoids that. Author notes the demoed mech company is actually a 'reinforced' (oversized) company. Same mount mechanic can attach vehicles to other carriers (e.g., tanks parked on a landing craft).
- **Source:** 14386Qbw24A
- **Confidence:** High

### Adding/removing components from a group's organization (mortar attachment) for capability tuning
- **Models:** Editing a group's composition to grant or remove specific weapon systems beyond its default TO&E.
- **Inputs / parameters:** Selected group; add-organization / add-unit menus; chosen component (e.g., 60 mm mortar, infantry).
- **Behavior / rules:** Authors add components to a group (e.g., attach a 60 mm mortar to an insurgent section) to give it "more capability than it really should have," deliberately raising the threat (mortar fire scares players). Conversely the player's own added mortar is flagged as scenario-unbalancing. This is direct composition editing of groups in the editor.
- **Outputs / effects:** Modified group capability (extra weapons/units).
- **Edge cases / quirks:** Explicitly used to over-arm irregulars for difficulty; the same mortar "unbalances the scenario painfully" on the friendly side. No numeric balance values given.
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### Grouping units and reassigning the group lead / center (F4)
- **Models:** Aggregating placed units into one group whose displayed center is a chosen anchor unit.
- **Inputs / parameters:** Multi-selected units; Group command; **F4** group-edit dialog; chosen lead/center unit.
- **Behavior / rules:** Selecting many units and grouping them designates a default center that is often visually off (the group icon jumps to an arbitrary member). Pressing **F4** opens the group editor where you can RESET and pick which member is the group **lead/'command base'**; that member becomes the group's geometric center, so the group icon then sits on the chosen (more central) building.
- **Outputs / effects:** A single group entity with a deliberately chosen center/lead unit.
- **Edge cases / quirks:** Default auto-chosen center is frequently not the spatial middle — manual F4 reassignment fixes the "frustrating" off-center grouping.
- **Source:** ENwbz9RaPoM
- **Confidence:** Med

### Mounting aircraft on facilities/parking spots (Ctrl+F6) and populating decorative target vehicles
- **Models:** Attaching aircraft (or other units) to a facility/parking location so they appear parked there.
- **Inputs / parameters:** A placed parking-spot/facility unit; **Ctrl+F6** (add aircraft); chosen aircraft type + nationality.
- **Behavior / rules:** Select a parking-spot facility and press Ctrl+F6 to add an aircraft to it; choose type and nation (e.g., SH-2F, US Navy). The aircraft is then parked on that spot/'runway' even though it warns it's not a normal airbase. Similarly facilities can host train engines/locomotives on a rail yard, cars in a car park, and military vehicles (radars, tanks, AAA, MANPADS) sprinkled for flavor; radars kept ungrouped so they can be toggled on.
- **Outputs / effects:** Aircraft/vehicles attached to facilities, giving a populated installation.
- **Edge cases / quirks:** Some specific rolling-stock items (e.g., straight locomotive) may be absent depending on DB version ("not in this version"). Author keeps sensor units ungrouped to control emissions individually.
- **Source:** ENwbz9RaPoM
- **Confidence:** Med

---

## 10. Facility Authoring & Installations

### Building a facility 'target base' by size-matching real imagery (OpenStreetMap/OpenTopoMap)
- **Models:** Reconstructing a plausible real-world installation as adjudicatable facility units by matching each building's measured footprint to a database facility of equivalent dimensions.
- **Inputs / parameters:** Background layer (OpenTopoMap/OpenStreetMap buildings, or satellite/Base Earth); the distance-measuring tool; the Database Viewer facility search (keyword + facility class); measured building length/width; chosen facility DB record (has length & width fields).
- **Behavior / rules:** Workflow: (1) Turn ON only the OpenTopoMap layer (other layers hidden) so building outlines stay visible — they vanish if you zoom past their render level. (2) Use the distance-measuring tool to measure a building's footprint (e.g., **~80 m** across). (3) In the Database Viewer search facilities by keyword (e.g., 'building','structure','barracks') and read each candidate's Length/Width fields; pick the DB record whose dimensions match the measurement (medium building = **~60 m** was too small; large building = **~70 m** matched). (4) Press Insert, click the building center, choose that facility from the facility menu, OK to place it. Repeat per building, optionally renaming each placed facility (e.g., 'officers quarters', 'command building'). Small **~10 m** blips are placed as interpreted small structures (TV mast, generator). Large composite structures recognized by shape (rail yard → place 'railway yard'/'rail depot'/'rail station').
- **Outputs / effects:** A cluster of individually placed, correctly-sized facility units approximating the real installation; each can be named.
- **Edge cases / quirks:** Facilities don't overlap as long as each is placed near a building's center. Stray hotkeys noted: **'T'** spawns unwanted units; **numpad '9'** toggles unit visibility/selection layers. Author guesstimates story count/use from footprint when ground truth is unknown.
- **Source:** ENwbz9RaPoM
- **Confidence:** High

### Place-name markers vs. facility buildings (and marker damage points)
- **Models:** Two ways to represent a populated place: a non-targetable map MARKER vs. individually placed facility buildings; markers have huge damage tolerance so they survive attacks.
- **Inputs / parameters:** Database search 'village' / 'town' (markers) vs. 'building'/specific structures (facilities); marker damage-point value; marker length/width.
- **Behavior / rules:** Searching 'village' yields a **MARKER** (open structure, counts as a simple object) that has a whopping **50,000 damage points** — so the village survives being attacked (it doesn't get destroyed when insurgents harass it). A 'town' is likewise a marker (with somewhat absurd length/width). For a town/village you can place one marker rather than modeling every building; for the insurgent base camp the author DOES build individual structures. Markers can be renamed to the real place name (lookup gives the name) and **COPIED** (Ctrl+C / Ctrl+V) to stamp the same town representation into other locations, then renamed.
- **Outputs / effects:** Either a durable area marker representing a settlement, or a set of discrete targetable facilities.
- **Edge cases / quirks:** **50,000 damage points** cited verbatim for the village marker; town length/width called "a little absurd." Modeling each building is possible but not recommended for whole settlements (only for small key sites like the base camp).
- **Source:** ozWKI2_Zn_o
- **Confidence:** High

### Choosing facility size to control detectability ('too big gets picked up')
- **Models:** A facility's physical size drives how easily/at-what-range it is detected, so authors pick small structures for things that should hide.
- **Inputs / parameters:** Facility footprint/size (from DB); facility 'detectable out to' range; auto-detectable flag.
- **Behavior / rules:** Large facilities (desert fort, FOB, military base, the big 'generator' structure, ammo pad) are visually huge and "get picked up pretty much right away" / are detectable out to a large range (ammo pad "detectable out to one" — a large radius). To hide an insurgent base the author deliberately picks tiny structures (communication hub, small surface building, tents, a CB-radio antenna) because you "basically have to be right on top of" them to detect, especially inside thick forest. Detectability is a property of the chosen DB structure (size/emission), combined with the not-auto-detectable flag.
- **Outputs / effects:** Lower or higher effective detection range depending on chosen structure size; supports a stealthy base camp.
- **Edge cases / quirks:** Some intuitively-detectable picks turn out NOT to be (CB radio antenna "literally the most perfect thing"). The generator and ammo-pad structures are flagged as undesirably large; until per-unit size editing exists, you can't shrink them, so you avoid or delete them. "Detectable out to one" radius not given in absolute units.
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### Bridge placement, tonnage class, and heading alignment
- **Models:** Bridges as terrain-derived chokepoint facilities that have a load/tonnage rating and a heading you align to the real span.
- **Inputs / parameters:** River presence (terrain feature); bridge facility with a tonnage rating (e.g., ~30 ton, single-lane); heading field (degrees).
- **Behavior / rules:** Where rivers exist there are bridges, which become strategic chokepoint objectives. A placed bridge has a tonnage class (author reads **~30 ton single-lane**). Authors align the bridge by setting its **HEADING** in degrees to match the real-world span orientation (read off the map as **329°**, set to **~330°**). Crossing points double as ambush points: an insurgent path forced across a river gives the defender a guaranteed engagement window if they watch the crossing.
- **Outputs / effects:** An oriented, capacity-rated bridge facility usable as objective/ambush trigger.
- **Edge cases / quirks:** Map text for the heading is hard to read (~329 vs 330 — author approximates). Tonnage limits which ground units can cross (implied by 'single lane'/30-ton rating, not elaborated).
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### Radar-coverage pruning to manage radar-calculation load
- **Models:** Deleting/limiting radar/SAM stations where threats won't appear, to cut per-tick sensor math.
- **Inputs / parameters:** Imported early-warning lines (DEW/'do' line, Pine Tree, Mid-Canada, SAGE); known threat ingress arc; designer judgment of which stations are 'useless'.
- **Behavior / rules:** Reasoning given (in spirit): hundreds of radar stations doing "constant radar calculations" against **~1,000** targets "gets a little absurd." So the designer imports only needed lines (loads Pine Tree + DEW, leaves SAGE out as "just more units we don't need"), then **DELETES** the radar stations on bearings where bombers won't come (draws the threat arc and removes the most useless stations on the far flanks), shrinking the DEW line to its NW portion and Pine Tree to its southern portion. Alternative offered: leave all radars but let the player choose which to turn on, or run only **~half** on at any time.
- **Outputs / effects:** Far fewer active radar emitters → lower CPU load and faster scenario, while preserving warning on the threat axis.
- **Edge cases / quirks:** DEW line gave a **~7-hour** warning which "doesn't matter" because US aircraft can rebase; deleting it and relying on Pine Tree gave **~2-hour** warning, judged better. Designers may also deliberately **BREAK** some radar stations to simulate maintenance. Trade realism (full coverage) vs performance. (NOTE: deleting radar stations reduces total map contacts, which can break Lua per-aircraft 1:1 targeting math — re-check counts.)
- **Source:** 3IgCJs1m0O4 | qVQCSV2wLag
- **Confidence:** High

---

## 11. Sensors, Detection & Deception

### Per-unit 'Auto-detectable' flag (forced visibility) and sensor-driven detection/classification
- **Models:** Whether a unit is automatically known to the opposing side (used to bait the player into wasting ordnance on decoys while real assets stay hidden) vs. only revealed through real sensor contact, and how confidence decays after the sensor leaves.
- **Inputs / parameters:** Right-click per-unit/group toggle 'set as Auto detectable' (on/off; Scenario Editor; multi-select supported); applied per unit on the correct **side**; enemy sensors (SLAR, optical camera, visual range); line-of-sight/range; sensor presence over time; optionally combined with stripping a unit's weapons to make it a pure decoy.
- **Behavior / rules:** By default placed units may be **auto-detectable** (instantly known to the other side). Setting a unit/group to **NOT auto-detectable** forces the opposing side to actually find it with sensors. **Deception use:** mark a sacrificial Patriot battery as Auto-detectable AND strip all its missiles, so the player sees and "wastes a free shot" destroying a battery oriented toward the threat; keep the REAL battery NOT auto-detectable and oriented to fire on the likely ingress, so when it fires (e.g., at a Tomahawk coming around a corner) the player wrongly concludes the visible battery is the real one. **Sensor-driven detection (demonstrated):** a U-2R with SLAR + optical camera overflying a base only detects units once within sensor/visual range (had to "get within visual range" before buildings popped; press numpad 9 to see all); the optical camera classifies a contact. After the sensing aircraft turns away, already-classified contacts remain identified **while the camera can still see them**; once the sensor is gone, contacts persist but their classification **confidence DROPS to 'not confident'** (and brand-new contacts show as 'detected by unknown'). Enables detect-then-strike design (find targets, then attack with bombers). Forward observers, radars and AAA are generally left NOT auto-detectable so they ambush.
- **Outputs / effects:** Controls initial side-awareness of a unit; drives the player's targeting choices (over/under-committing ordnance to decoys); yields contact tracks with a confidence/identification state dependent on current sensor coverage.
- **Edge cases / quirks:** "Turning something on auto-detectable is a great way to trick the player into acting in a way they shouldn't." Must set the unit on the correct **SIDE** before toggling (author kept switching to Red Team after mis-setting). Pairing auto-detectable with a known-orientation battery exploits that a Patriot "is going to be pointed in the direction of the threat." Confidence is qualitative ("not confident" — no numeric threshold stated). Sensor must satisfy range/LOS; SLAR + optical noted as effective.
- **Source:** KX53_D1jUS0 | ENwbz9RaPoM
- **Confidence:** High

### Authoring hidden ground sensor posts (observers/coast-watchers) for early warning
- **Models:** Cheap, undetectable forward observers that see the player without being seen, providing early warning that drives the hidden defenses.
- **Inputs / parameters:** Building/facility with an observer (selected from Building list); added sensors via the sensors window (Night Vision Goggles; Forward-Looking Infrared (FLIR) — works even if marked deprecated; visual; surveillance); **Shift+C** to clone WITH sensors; placement (must be on land, not ocean); Line-of-Sight tool 'same as Observer' to preview field of view; per-unit auto-detectable flag.
- **Behavior / rules:** Place an observer building on high terrain; it is **NOT detectable** by default. Add NVG + FLIR + visual/surveillance sensors so it can identify aircraft and even discriminate flares. Use the LOS tool ('same as Observer') to confirm the field of view (author can "see all the way into America"). **Clone with Shift+C** to seed an array of observers along likely ingress corridors (mountain passes, the lake, the border, downtown bridge). Some are left not-auto-detectable; the downtown observer is explicitly set detectable.
- **Outputs / effects:** A network of forward observers that detect/identify incoming aircraft and feed targeting to the hidden SAM/AAA, without revealing themselves.
- **Edge cases / quirks:** Deprecated FLIR "still works." Must press **Shift+C** (not plain copy) or clones lose the configured sensors. Easy to accidentally place a unit in the ocean. Underwater placement quirk: author notes the lake bed "elevation of three feet" is "more than enough" to site things; the low-flying-over-lake ingress is the hardest to defend.
- **Source:** KX53_D1jUS0
- **Confidence:** Med

### Optical/EO sensor units (watchtowers) cloned around a border
- **Models:** Adding hard-to-detect passive visual identification coverage that doesn't emit radar.
- **Inputs / parameters:** A watchtower facility; an added EO sensor (generic 'low light TV' surveillance); copy via **Shift+C** (copy) vs plain C.
- **Behavior / rules:** Designer adds a watchtower, edits its sensors to add a generic low-light-TV surveillance sensor, then **CLONES** it (Shift+C is 'copy'; plain C is something else) repeatedly to ring the border (Syria) with optical ID platforms. Rationale: optical sensors are **passive** and "difficult to detect," giving identification coverage without radar emissions.
- **Outputs / effects:** A belt of passive EO identification stations that can classify nearby contacts while being hard for the enemy to find.
- **Edge cases / quirks:** **Shift+C vs C** distinction is load-bearing for cloning. Presented as a late "one more idea" to harden a too-easy scenario; complements active radar by adding stealthy ID.
- **Source:** 0SwTlMuRdzo
- **Confidence:** Med

### Intermittent radar emissions (EMCON time-cycling) for deception
- **Models:** A radar that cycles on/off on a defined schedule per posture, making it harder for the player to localize/target.
- **Inputs / parameters:** EMCON posture context (author "assume we are in yellow"); per-posture continuous vs intermittent toggle; ON duration (seconds); OFF/period value; random variation (seconds). Demo values: one radar **'10 seconds'** on (entered '10', F5); a cloned radar set to **'5'/'8'** with **'random variation is 3'**.
- **Behavior / rules:** In the radar's EMCON/M-con window, for a given posture set emissions to non-continuous and specify the on-time (e.g., run for **10 seconds**) so the radar flicks on and off; this "confuses the heck out of players." Combine with **NOT auto-detectable** so the player can't simply see it.
- **Outputs / effects:** Radar emits in bursts per the schedule rather than continuously; intermittent + random-variation makes detection/targeting timing unpredictable.
- **Edge cases / quirks:** Different posture levels can have different emission rules ("under yellow this one is not continuous"). Random variation (e.g., **3 s**) added on top of the on/off period to further trick the player. Pairs with the cloned-radar decoy trick.
- **Source:** KX53_D1jUS0
- **Confidence:** High

### Clone-and-displace decoy emitters ('two-feet-away' twin radars/batteries)
- **Models:** Placing a near-duplicate emitter immediately adjacent to a real one so the player mis-estimates how many aimpoints exist and mis-allocates ordnance.
- **Inputs / parameters:** A source unit (radar/SAM battery); clone command (**Shift+C** / clone) — note Shift+C is required so clones inherit all configured sensors; placement offset ('two feet away'); orientation; per-clone EMCON/auto-detectable settings.
- **Behavior / rules:** Clone a radar and place the copy **~2 ft** from the original; the player targets what looks like the single radar and ends up under- or over-shooting the number of weapons needed because there are actually **two**, wasting time/ordnance. Same pattern used for SAM batteries: a visible/known battery + a hidden displaced twin oriented to surprise. Author warns: when cloning forward observers you MUST use **Shift+C** ("c as in Charlie"), otherwise the clones won't inherit the fancy sensors you configured.
- **Outputs / effects:** Two co-located emitters where the player perceives one; degrades the player's targeting economy.
- **Edge cases / quirks:** Shift+C clone inherits full sensor/weapon config; a non-Shift copy may drop sensors. Decoy twin typically also set NOT auto-detectable and given a different intermittent-emission schedule to deepen the confusion.
- **Source:** KX53_D1jUS0
- **Confidence:** Med

---

## 12. Weapon Release Authorization & Ambush Setup

### Per-unit Weapon Release Authorization (WRA) for offensive behavior shaping
- **Models:** Author-set rules of engagement that constrain what a unit shoots, how many rounds, and at what range — used to script ambushes and prevent premature/wasteful firing.
- **Inputs / parameters:** Per-weapon-type target-class permissions (e.g., torpedoes: against ships yes/no, against carriers only, 'all surface targets valid'); rounds-to-allocate per target (e.g., 'every round on carriers'); engagement range gate / 'automatic firing range'; firing-range qualifier options including 'No Escape Zone', '< No Escape Zone', 'weapon minimum range'; 'engage until Winchester/shotgun' option; air-to-air guns enable; 'don't run away after engagement' option. Opened via right-click WRA / **Ctrl+Shift+F9**.
- **Behavior / rules:** Author restricts a sub's SST-4 torpedoes to attack **ONLY carriers** and to dump its entire rack on a carrier — so it ignores everything else and ambushes when the carrier enters the torpedo's short automatic firing range. For SAM/AAA batteries, set firing gate to **'No Escape Zone'** (or tighter) so launchers don't waste ammo on targets they can't hit; this trades kills for forcing the player to expend effort/ammo. Enable **'air-to-air guns'** + **'engage until shotgun/Winchester'** so escorts and bombers keep firing until empty, and toggle off the auto-disengage so fighters don't flee after a kill. Late in the run, author flips torpedo WRA to **'all surface targets valid / free fire'** to remove engagement delay.
- **Outputs / effects:** Changes which targets a unit will engage, ammo expenditure pattern, and the range at which it opens fire; observed effect: a Hawk battery using No-Escape-Zone gating ended up the most valuable defender by shooting down guided weapons rather than the missile-carriers.
- **Edge cases / quirks:** **'No Escape Zone within weapon minimum range'** produced a deliberate withheld "cheap shot on the way back." Setting too generous a gate causes a unit to "fire at the first thing it could try to fire at and get duped into getting whacked." Observed failure: a Hawk repeatedly did NOT fire ("must detect the target prior to firing") because targets kept diving into the cloud layer and "escaping the WRA" / sitting just outside range (target at **~8200 ft** vs ceiling) — fixing required **raising the cloud ceiling**, not just WRA.
- **Source:** KX53_D1jUS0
- **Confidence:** High

### Authoring unit kinematic initial state and crew proficiency for ambush setup
- **Models:** Pre-positioning a unit's speed/depth/throttle and crew skill so it behaves as a quiet, lethal surprise at scenario start.
- **Inputs / parameters:** Per-unit depth setting (e.g., 'shallow depth'); throttle/order ('stop', then a creep speed e.g., '2 knots'); heading/orientation (faced toward expected threat / approach corridor); crew proficiency level (set to 'Ace'); placement distance from target (e.g., 'about 10 nautical miles away').
- **Behavior / rules:** For the ambush sub: set shallow depth, stop, then creep at **~2 knots** so it makes minimal noise while moving into firing position. For SAM/AAA batteries and ships: set orientation to cover the likely ingress, and crank crew proficiency to **Ace** to make them more effective/surprising. Position assets at author-chosen standoff (sub **~10 nm**; batteries faced down specific mountain corridors).
- **Outputs / effects:** Units begin the scenario already moving/oriented/skilled as the author intends, enabling scripted ambushes without runtime control.
- **Edge cases / quirks:** Slow speed is deliberately chosen for acoustic stealth ("making enough noise basically to get into position"). Orientation matters specifically for directional launchers (Patriot "can't shoot in all directions like an S-300"), so facing is a key authored parameter. Proficiency=Ace applied broadly to defenders "to make things extra fun."
- **Source:** KX53_D1jUS0
- **Confidence:** Med

---

## 13. Weather as a Tactical Constraint

### Custom Environment Zones — author-painted weather regions
- **Models:** Localized weather overriding the scenario default inside a drawn polygon (e.g., a storm cell over a region) to complicate air planning.
- **Inputs / parameters:** Scenario default weather first (average temperature, sea state/wind, cloud type). Zone defined from reference-point waypoints (Ctrl+right-click an area). In the zone's Edit Data, four primary switches: cloud cover/type (e.g., 'solid middle clouds', 'high clouds'), temperature (°C), precipitation (e.g., light rain = snow when cold), sea state (numeric). Plus advanced thermal-layer / convergence-zone settings (not used). Color/label assignable.
- **Behavior / rules:** 1) In editor, set a non-default baseline weather (author does this for sanity + to confirm zones work). 2) Ctrl+right-click to draw an area; open Reference Points Manager → Custom Environment Zones → name it → **Create New** (creating the zone first is required before you can color it). 3) Add the previously-created waypoints to give the zone its polygon. 4) Edit Data: set colder temp, add snow, thicker clouds, more wind. 5) Close and **SAVE** — weather inside the polygon visibly changes (demo: high clouds → solid middle clouds, light rain/snow, **sea state 2**, **~10 °C**) while time-of-day is unchanged.
- **Outputs / effects:** A bounded region with its own clouds/temperature/precip/sea-state distinct from the rest of the map; can stack arbitrarily many zones.
- **Edge cases / quirks:** Build CEZ on a **NEUTRAL layer** (not the player's) so the player can't move/edit them. Designer can **FREEZE** the zones so players can't tamper. Tactical use: draw an overcast to hamper laser-/IR-guided bombs ("have fun trying to find tanks with laser guided bombs"). Light rain renders as **snow** when temperature is cold.
- **Source:** -BsOyOScvRQ
- **Confidence:** High

### Editor weather as a tactical constraint (cloud ceiling forcing attack altitude)
- **Models:** Using the scenario-wide weather (cloud ceiling) to force GBU-armed strikers below a ceiling and into short-range SAM/AAA kill rings.
- **Inputs / parameters:** Editor weather: cloud type/severity (e.g., 'moderate middle clouds'), cloud BASE/ceiling altitude (e.g., **7000 ft**), wind (a little windy), temperature.
- **Behavior / rules:** Author sets a **~7000 ft** cloud ceiling. Because GBUs require a visual on target, strikers must descend below 7000 ft, which brings them within the 'critical range' of short-range IR SAMs (Chaparral) and AAA sited downtown — turning the city into a "death trap for anybody who wants to fly less than seven thousand feet."
- **Outputs / effects:** Forces enemy attack-profile altitude; couples weather to weapon employment and to the engagement envelopes of the placed defenses.
- **Edge cases / quirks:** Observed **backfire**: with the ceiling at ~7000 ft, attackers repeatedly DOVE into the clouds and "escaped the WRA," and a defender sat at **~8200 ft** target altitude "slightly outside range," so the SAM couldn't engage ("must detect the target prior to firing"). Author's experimental fix was to **RAISE the cloud ceiling** "a teeny tiny bit" so the diving attackers stayed in the weapons' detection/range window — i.e., ceiling height must be tuned against the defenders' range, not just set low.
- **Source:** KX53_D1jUS0
- **Confidence:** Med

---

## 14. Logistics, Cargo & Transport

### Cargo/transport capacity and unit-size load constraints (Cargo Ops)
- **Models:** Whether a transport (helicopter/aircraft) can carry a given ground unit, gated by the unit's cargo size vs. the carrier's capacity and load-out type.
- **Inputs / parameters:** Carrier loadout (e.g., Commandos vs cargo vs slung-load); carrier troop/cargo capacity (e.g., 33 or 55 troops); carried unit's size class (small/medium/large) and personnel count (infantry platoon = 16); Cargo Ops / Ready+Arm dialogs.
- **Behavior / rules:** Each transport has a capacity and a loadout mode. A **Bell 212** set to 'Commandos' still lacks space for a **16-man** infantry platoon. A **CH-47** readied with the right loadout shows **33 or 55** troop capacity and can lift the platoons via Cargo Ops, but it **CANNOT** carry a mortar section in normal internal cargo because the mortar exceeds the largest internal item size ("biggest thing I can carry — I can't carry small/that one is too much"). Switching the carrier loadout to **SLUNG LOAD** cargo lets it carry the oversized mortar section externally. Some helicopters are **CARGO-ONLY** (Bard/cargo helo) and cannot load infantry at all — you must pick a utility/troop-capable airframe. Alternative: reduce squad size (manual/handheld squads) to fit. Selecting the loadout (Ready+Arm) then Cargo Ops determines what can be embarked.
- **Outputs / effects:** A transport loaded (or refused) per capacity/size rules; internal vs slung-load changes what fits.
- **Edge cases / quirks:** Verbatim numbers: infantry platoon = **16** personnel; CH-47 = **33 or 55** troops; Bell 212 carries Commandos but not the 16-man platoon. Slung load is the workaround for the oversized mortar section ("fun being slung lo as a mortar team"). Cargo-only helos reject infantry entirely. 'Edit cargo' errors if cargo is bound inside a facility building (cargo loaded into a terminal building is edited from that building).
- **Source:** ozWKI2_Zn_o
- **Confidence:** High

### Loading cargo (infantry/ground units) into facilities and aircraft maintenance/ready states
- **Models:** Stocking an airfield's terminal building with deployable ground units, and gating aircraft availability via maintenance vs. ready.
- **Inputs / parameters:** A facility that accepts cargo (airport/passenger-cargo terminal building); ground units added as cargo (infantry platoons, mortar section); aircraft readiness state (ready / maintenance); quantities.
- **Behavior / rules:** Identify a cargo-capable facility (the airport **TERMINAL** building, not the tower/tarmac) and add ground units as cargo to it (generic infantry platoons, plus a mortar for imbalance). Those units later board transports from the terminal. For aircraft, you choose how many are **READY** vs. in **MAINTENANCE** to throttle available force (e.g., own **32** A-37s, add **12**, set half to maintenance so only **~6** are usable; set decoy aircraft to maintenance "to taunt the player"). Ready+Arm sets munitions/loadout.
- **Outputs / effects:** Deployable infantry stored at a base; a controlled number of flyable aircraft.
- **Edge cases / quirks:** Cargo is attached to one specific terminal building, so 'edit cargo' must be done from that building (gets "grumpy" otherwise). Maintenance state deliberately reduces effective fleet size for balance. Mortar in the player's cargo is called out as scenario-unbalancing.
- **Source:** ozWKI2_Zn_o
- **Confidence:** High

---

## 15. Ground/Unit Movement & Autonomous Engagement

### Unit movement: throttle/speed settings, top-speed cap, and travel-time planning
- **Models:** Ground/air units move at a set throttle up to a platform top speed; authors compute arrival time from distance and ordered speed.
- **Inputs / parameters:** Throttle setting (creep/…/full); platform top speed (e.g., mortar team max 16 knots — checked via **F3**); ordered move waypoint; measured distance.
- **Behavior / rules:** A unit's speed is capped at its platform top speed (mortar team top speed = **16 knots**, viewed with F3). Authors set a slow throttle (e.g., 'creep', '4') and order a move so the unit takes a realistic time to reach a firing position — measuring distance (**3.38 nm**) yields **~1 hour** travel, deliberately delaying when the mortar can start firing (so it doesn't bombard in the first 5 minutes). A **7 nm** leg is called "a long day's march"; **3.5 nm ≈ a 4-hour march** on foot in rough terrain.
- **Outputs / effects:** Timed arrival of units at objectives; staggered start of harassment fires.
- **Edge cases / quirks:** Verbatim: mortar top speed **16 knots**; **3.38 nm ≈ 1 hour** at the set creep speed; rough/mountainous terrain slows foot movement further. F3 shows speed envelope.
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### Engage-opportunity-targets order (Ctrl+F9) for autonomous harassment
- **Models:** Telling a unit to autonomously attack targets of opportunity within range once in position.
- **Inputs / parameters:** Selected unit/group; **Ctrl+F9** (engage opportunity targets); the unit's weapon range (e.g., 60 mm mortar — short range); arrival in position.
- **Behavior / rules:** Pressing Ctrl+F9 sets a unit to engage opportunity targets, so once it reaches firing position it autonomously harasses the player without manual orders. Combined with a delayed slow move, the unit starts firing roughly when it arrives (about an hour into the scenario in the demo). A short-range **60 mm** mortar is used precisely because it must close to the city to be effective, controlling timing.
- **Outputs / effects:** Unit begins autonomous engagement of in-range enemies upon arrival.
- **Edge cases / quirks:** Mortar range described as "pathetic"/short (no number given beyond '60 mm'); pairing with creep movement times the first fires. Author also manually orders other sections to sneak into town.
- **Source:** ozWKI2_Zn_o
- **Confidence:** Med

### Direct override of unit altitude/depth in the scenario editor
- **Models:** Instantly setting a platform's vertical position instead of waiting for it to climb/dive in real sim time.
- **Inputs / parameters:** Editor mode (F1); selected unit; right-click → Scenario Editor → Edit Unit Properties → Set Unit Properties; a numeric altitude (aircraft) or depth (submarine) value with sign.
- **Behavior / rules:** Conventionally an aircraft must physically climb/descend (e.g., a B-52 set to min altitude took **~47 sim-minutes** / lots of fuel to reach 36–40k ft). The override field **instantly teleports** the platform to the entered value: enter 1500 → drops to 1500 ft; enter 40000 (or push the button) → jumps to 40,000 ft. **CRITICAL SIGN CONVENTION** for naval/sub units: the field is labeled DEPTH, not altitude, but it is still signed as altitude — **POSITIVE = ABOVE the surface, NEGATIVE = below.** So a submarine at '0' sits on the surface; entering 200 does **NOTHING** visible (that's 200 ft above water for a non-flying hull); entering **-200** puts it at -200 ft submerged. Rule stated verbatim: "if you're going negative we're going negative, going positive we're going positive." Verify the result with **F2**.
- **Outputs / effects:** Unit's altitude/depth is set instantly; fuel/time not consumed.
- **Edge cases / quirks:** **Hard clamp** to platform performance envelope: entering a value beyond the platform's limit is silently capped. B-52 entered as 150,000 or 120,000 ft is clamped to its ceiling (**~45,000 ft** on F2). Sea Wolf entered as **-5,000 ft** initially shows -5,000 on F2, but it is a built-in safety check (**NOT a bug**): on unpause the sub auto-corrects up to its maximum operating depth and cannot exceed crush depth. **Warning:** always re-check the entered number with F2 because an out-of-range value will be auto-undone the moment the platform moves, silently negating the edit.
- **Source:** oncQrobmhnA
- **Confidence:** High

---

## 16. Briefing & Documentation

### Scenario briefing authoring
- **Models:** Attaching mission briefing text to a scenario for the player.
- **Inputs / parameters:** Scenario editor briefing field; optional external briefing-format templates (e.g., 'US/NATO mission briefing format PDF').
- **Behavior / rules:** Designer reopens the scenario and adds a briefing (e.g., 'destroy enemy Syrian chemical facilities'). Suggests using real briefing-format templates found online (weather, intent, etc.) and studying **OTHER scenarios** as the best source for briefing structure.
- **Outputs / effects:** Player-facing briefing text stored with the scenario.
- **Edge cases / quirks:** Largely content/quality guidance rather than a hard mechanic; included because it's part of authoring structure.
- **Source:** 0SwTlMuRdzo
- **Confidence:** Low
