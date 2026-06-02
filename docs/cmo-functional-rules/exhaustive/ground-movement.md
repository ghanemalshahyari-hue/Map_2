# CMO Functional Rules — Ground & Movement Operations (Exhaustive)

**Bucket scope.** This is the *exhaustive* functional-rules spec for the **Ground &
Movement Operations** bucket of *Command: Modern Operations* (CMO/CMO2). It covers how
land and air/sea units are modeled and moved, how they detect and are detected, how
terrain and environment shape both, and the engagement-control / weapon-delivery /
weapon-physics rules that movement and positioning feed into. It is **self-contained**:
every rule object extracted from **every transcript** mined for this bucket is deduplicated
and merged below, and the overlapping radar-fundamentals, radar-horizon,
look-down/shoot-down, RCS/aspect, jamming, ESM, IFF, rain, cloud, sonar-intensity,
best-LOS-algorithm, and helicopter-masking authorities are stated in full inline (with their
verbatim numbers) so nothing must be looked up elsewhere.

**Auto-generated-caption caveat.** Source transcripts are YouTube auto-generated
captions. Stated numbers and unit/weapon names may contain transcription errors. All
numbers below are kept **verbatim** from the extraction and should be treated as
approximate where a caption is noisy. Qualitative statements ("significantly degraded,"
"about half") are flagged as such. Nothing here is invented — every rule traces to a
cited `source_video_id`.

**Source video IDs referenced** (CMO tutorial transcripts):
`5dJfIKiNHj8`, `miMhUGP6fGg`, `FTRQtZg_jwk`, `0mxcfrMWpSU`, `I2HX_78aErs`,
`RDE4S8kzZTQ`, `_qeXJWmRBks`, `a47fSjGQYq4`, `fh1QmQVLiBs`, `trk7WTa9SzI`,
`dui_lPsECfE`, `ILGHFWHn6Rk`, `JqZYvpCP7ik`, `O7qj1RaEU9M`, `OWCZPAVviuE`,
`eame83G2Asw`, `atcxgWfXnX4`, `xhmuBfBQ_DY`, `ffTSj81bjBU`, `2H3gazg1seo`,
`8WqQ-alekog`, `O4HTj5ct7yg`, `KOOxlw5dfrU`. Additional radar/EW/terrain authorities folded
inline below: `7mmQ2y11hPc`, `bsLLZwqi4Mg`, `wycT9grtrOE`, `hu1Mu_qaXQ8`,
`xV-H7HJd2-I`, `1r4P_gI-Pdw`, `oF8LwbZSm28`, `0R6-5oQR-l0`, `FI-ZwDubiMY`,
`A7oqIAMhKF8`, `o4bPT47vuK8`, `P6UAdBqTUhk`, `yhs02DUz9bg`, `2SJDdTiuRPs`,
`u9R-59fusCM`, `-Q9AfTrF4vM`.

---

## 1. Ground-Unit Modeling & Composition

### Ground Unit vs Mobile Facility (database modeling distinction)
- **Models:** CMO represents land combat power two ways — a *mobile facility* is an aggregated platoon/company of identical vehicles, while a *ground unit* is a single discrete vehicle modeled in ship-like detail.
- **Inputs / parameters:** database type selector "Ground Unit" vs "Mobile Facility"; per-platform mounts/weapons; crew and mass attributes; fuel quantity (ground units only).
- **Behavior / rules:** A **mobile facility** (e.g. a T-72 platoon) stores each vehicle as an individual mount with one contained weapon system ("three T-72 turrets chilling together"); it has **NO fuel** and represents a group. A **ground unit** (single tank) is modeled like a ship: it exposes discrete mounts (e.g. a T-80 turret main weapon, two countermeasure launchers, a remote weapons station), per-unit "performance details," and precise mass/crew. Mobile facilities = the traditional aggregated platoons/companies; ground units = single, precisely-modeled vehicles.
- **Outputs / effects:** whether the entity behaves as an aggregate (platoon) or a single detailed vehicle; what mounts/sensors/attributes it exposes.
- **Edge cases / quirks:** The editor lets you mount nonsensical combos (e.g. dual T-80 turrets) — the system permits it. Mobile facilities carry many vehicles in "giant blobs" (e.g. "like 30 tanks"), whereas unloaded ground units each appear as their own vehicle. One DB entry threw an error in the demo (a bug/joke), not a rule.
- **Source:** a47fSjGQYq4
- **Confidence:** High

### Multi-vehicle land units — component count, dispersal, per-component kill
- **Models:** a single ground "unit" is internally a facility of N component vehicles/mounts spread over an area, each individually killable (treated "like a 76 mm turret on a ship").
- **Inputs / parameters:** component/vehicle count (small number badge on the icon, e.g. SAM site "9," tank platoon "4"); component **dispersal radius** (BMP-3 stated **80 m**); per-mount armor; weapon needed per component; area/cluster vs unitary munition.
- **Behavior / rules:** The numeric badge on a land icon = number of separate vehicles/components. To destroy the unit you must kill components individually: a 4-vehicle platoon needs ~4 separate weapons (e.g. 4 Mavericks/Hellfires) — one bomb cannot kill four vehicles unless it is a large enough (area) bomb, which CMO does model. Components sit a "component dispersal radius" apart (BMP-3 = 80 m), so an area/cluster munition hits multiple only if they fall within that spacing. A ground unit is internally a magazine + weapon mounts + sensors; each mount has its own components/weapons and possibly its own armor (mount armor can exist even when the vehicle shows no general armor).
- **Outputs / effects:** per-component damage state; the unit is fully dead only when all components are killed.
- **Edge cases / quirks:** Vehicles within a unit are attackable individually but **not** individually selectable. You build unit strength by adding mounts (e.g. add BMP-3 mounts to reach company strength, shown reaching 12) or by copying units; to model a single vehicle you must delete the extra mounts. Buildings/facilities are single objects and have **no** dispersal radius.
- **Source:** 5dJfIKiNHj8, miMhUGP6fGg
- **Confidence:** High

### Infantry abstraction (sections, organic weapons, reload magazines)
- **Models:** infantry units are abstracted into sections of ~5 soldiers carrying weapons; support weapons are modeled as mounts with reload magazines.
- **Inputs / parameters:** section count (each section ≈ 5 soldiers + generic rifles); added mounts (e.g. Stinger); a magazine container + weapon rounds added to it (e.g. 12× FIM-92E); prebuilt company templates.
- **Behavior / rules:** An infantry platoon is represented as **sections** (≈5 soldiers each — UK "section" vs US "squad"), not individual soldiers. You can give a platoon organic support by adding a mount (e.g. a single Stinger). To get reloads you add a magazine (a generic munitions container) and then add the actual weapon rounds into it (e.g. find FIM-92E, carry 12), so a launcher showing "1" ready can be reloaded from the stored rounds. Prebuilt company templates ("Infantry Company") come complete with squads plus organic 81 mm mortar and anti-tank weapons; "placeholder" templates are empty.
- **Outputs / effects:** unit composition, ready vs reloadable weapon counts, organic sensors/weapons.
- **Edge cases / quirks:** Each mount has its **own** sensor set (binoculars etc.); to give a company-wide sensor you add it via Sensors (e.g. a laser designator) and it benefits the whole company while that sensor functions. **Copy (C)** does NOT carry custom modifications; **Clone (Shift+C)** DOES preserve modifications.
- **Source:** miMhUGP6fGg
- **Confidence:** High

### Uniform ground-vehicle speed (no per-vehicle top speed)
- **Models:** all ground vehicles move at the same simplified speed regardless of type ("land ships").
- **Inputs / parameters:** none unit-specific — there is no per-vehicle speed stat in the database for mobile vehicles.
- **Behavior / rules:** The database "mobile vehicle" entry contains **NO field** for how fast the vehicle goes; all vehicles travel at the same speed, and there is no unique high-speed vehicle. The presenter frames ground units as "land ships" under a deliberately simplified movement model.
- **Outputs / effects:** movement speed is uniform across vehicle types.
- **Edge cases / quirks:** Faster movement makes a vehicle easier to detect against some sensors — move fast to close distance and spot, accepting higher detectability (see *Detection of stationary vs moving land units*). But note the contradicting evidence under *Ground-unit detectability vs capable surveillance radars* below: movement does **not** help against JSTARS-class sensors.
- **Source:** miMhUGP6fGg
- **Confidence:** High

### Ground-unit armor is simple / omnidirectional (no facing arcs)
- **Models:** armor protection for these ground units is a single value, not directional.
- **Inputs / parameters:** unit armor attribute (single value).
- **Behavior / rules:** Armor is "still considered the same" — "relatively simple... there's no like front arc back arc side arc" modeling for these new ground units.
- **Outputs / effects:** damage resolution uses one omnidirectional armor value (no aspect-dependent penetration).
- **Edge cases / quirks:** Explicitly called out as a current limitation ("at this time") — directional armor is not modeled.
- **Source:** a47fSjGQYq4
- **Confidence:** Med

---

## 2. Ground Logistics, Fuel & Cargo

### Ground-unit fuel & replenishment (fuel bowser)
- **Models:** single ground units carry a finite fuel quantity that depletes and can be replenished, enabling logistics simulation; aggregated platoons (mobile facilities) do not model fuel.
- **Inputs / parameters:** ground unit's fuel quantity (editable; example default **1,200 units**, set down to **250 units**); a fuel-carrying unit (the **fuel bowser** — the only ground unit type that holds/dispenses fuel); a replenishment order (right-click → replenish → select manually → click target).
- **Behavior / rules:** A ground unit shows "units of fuel remaining" (1,200) and you can edit it down (e.g. 250) to simulate low fuel. To refuel, order the unit to replenish from a fuel bowser; the unit drives to the bowser, stops, and replenishes. Mobile-facility platoons have **no** fuel and cannot be refueled.
- **Outputs / effects:** unit fuel level (decreases with movement, increases on replenishment); ability/inability to keep moving.
- **Edge cases / quirks:** Only the fuel bowser holds fuel for ground replenishment. Aircraft analogue: running out of fuel strands the platform (a Tu-95 "ran out of fuel" mid-mission). Fuel can be set arbitrarily in the editor to script logistics scenarios.
- **Source:** a47fSjGQYq4
- **Confidence:** High

### Ground rearm / replenishment via ammo truck
- **Models:** units rearm by drawing ammunition from a nearby provider (ammo truck).
- **Inputs / parameters:** a provider unit (specifically an **ammo truck** — other ammo options reportedly don't work well); proximity between consumer and provider; the "Unlimited Magazines" scenario setting; shell/round size.
- **Behavior / rules:** To reload, right-click the depleted unit → Replenish → Select provider → left-click the ammo truck. If close enough, it loads rounds back up over time. Reload time scales with round size: "the bigger the shell the longer it takes to reload." One ammo truck can supply anyone who can reach it (terrain/water can block access).
- **Outputs / effects:** replenished magazine/round counts on the consuming unit over time.
- **Edge cases / quirks:** With **"Unlimited Magazines"** enabled (Scenario Features & Settings) you skip micromanaging individual rounds inside the truck's magazine (simplified logistics). **The AI never auto-rearms** — the player (or doctrine) must initiate replenishment when ammo runs out.
- **Source:** miMhUGP6fGg
- **Confidence:** High

### Loading / unloading ground units as cargo on carriers
- **Models:** carriers (e.g. an LCAC service ship) can load ground units either from the database or by picking up units already on the ground, then unload them as individual units at a destination.
- **Inputs / parameters:** a carrier with cargo capacity (LCAC); the Edit Cargo action; source = units already on the ground OR database picks; a cargo capacity / remaining-space counter; unit type (ground unit vs mobile facility); an unload order (auto or via editor).
- **Behavior / rules:** Via Unit Actions → Edit Cargo you can load a unit physically on the ground (it is removed from the map and placed in the carrier), or add units from the database; a counter shows remaining cargo space and auto-closes selection when full. Ordering "unload cargo" drops everything next to the carrier as a separate group. Each unloaded **ground** unit appears as its own individual vehicle (vs the old behavior where platoons unloaded as giant aggregated blobs).
- **Outputs / effects:** units transferred between map and carrier hold; on unload, discrete units placed adjacent to the carrier.
- **Edge cases / quirks:** Terrain can block unloading ("a little tricky to get in and out where we are parked") so units may refuse to exit. A UI bug in the demo blocked auto-unload; the editor can place/eject units directly as a workaround. Loading from the ground is the new/simplified path vs database-only loading.
- **Source:** a47fSjGQYq4
- **Confidence:** High

---

## 3. Movement, Waypoints & Throttle

### Plotting a course / waypoint navigation
- **Models:** units follow an ordered list of waypoint legs; no course = idle behavior.
- **Inputs / parameters:** the Plot-Course command (**F3**) then clicked waypoints; per-leg distance and bearing readout; waypoint drag / **Ctrl + left-click-drag** to insert a new intermediate waypoint.
- **Behavior / rules:** Movement is **not** right-click-to-move; you press **Plot Course (F3)** and click waypoints. The tool shows distance and degrees (bearing) for each leg. The unit traverses legs in order, reaching one point then proceeding to the next. Existing waypoints can be dragged; holding **Ctrl + left-click-drag** on a waypoint creates a new intermediate waypoint. Re-issuing F3 overrides/replaces the current course.
- **Outputs / effects:** a plotted course (gray line with dots) the unit will follow.
- **Edge cases / quirks:** With **no** course: an aircraft just orbits ("air donuts"); a ship keeps going at the same speed and heading until told otherwise. **All bearings/headings in CMO are TRUE north** (compasses assumed corrected to true); the map does not rotate.
- **Source:** FTRQtZg_jwk
- **Confidence:** High

### When units deviate from their plotted course
- **Models:** the tactical AI overrides the plotted course under specific combat/logistics conditions.
- **Inputs / parameters:** incoming missiles; dogfight engagement; an assigned/needed tanker; damage; doctrine/evasion settings.
- **Behavior / rules:** A unit follows its course "whenever it can," but deviates to: evade incoming missiles; maneuver in a dogfight (turn/reposition for best position); divert to the nearest or assigned tanker when low on fuel; or react when damaged. It can also abandon course to execute an ordered attack — and conversely may keep following its course and never get into attack range (avoidable via doctrine).
- **Outputs / effects:** temporary path deviation; returns to course when able.
- **Edge cases / quirks:** If evasion is enabled, an attacked aircraft may "jump off" its plotted line. Whether an attack order interrupts the course depends on doctrine settings.
- **Source:** FTRQtZg_jwk
- **Confidence:** High

### Throttle settings (Loiter / Cruise / Military / Afterburner)
- **Models:** discrete throttle presets trade endurance vs distance vs speed, driving fuel burn.
- **Inputs / parameters:** throttle preset selection (or click-drag speed); aircraft type.
- **Behavior / rules:** Presets — **Loiter** = maximize time in the air (endurance/orbit); **Cruise** = maximize distance covered for the fuel; **Military** = "in a hurry"; **Afterburner** = "really in a hurry" (highest burn). Key distinction: loiter = longest time aloft, cruise = most distance. Throttle directly changes fuel consumption and therefore the projected range ring (afterburner shrinks reach, loiter extends it).
- **Outputs / effects:** aircraft speed and fuel-burn rate (and thus range).
- **Edge cases / quirks:** Choice is mission-dependent (loiter to linger over a patrol zone vs cruise to cover distance). Speed can also be set by click-dragging rather than presets.
- **Source:** FTRQtZg_jwk
- **Confidence:** High

### Per-waypoint speed & altitude
- **Models:** each waypoint can carry its own commanded speed and altitude, applied on arrival at that waypoint.
- **Inputs / parameters:** selected waypoint; the **F2** dialog (name + speed); per-waypoint altitude (set in individual-unit view); AGL/ASL toggle; terrain-following option; "Insert waypoint" (can apply to all flights of a mission).
- **Behavior / rules:** Select a waypoint and press **F2** to name it and set its speed; the unit adjusts speed (and altitude) **as it reaches that waypoint**, not at order time — the new value takes effect on the leg *into* the waypoint. To be at altitude X by point P, set point **P-1** to X. The editor offers terrain-following at a set height (e.g. 1,000 ft / 2,000 ft). A demo strike flew the assigned profile: cruise at 1,000 ft AGL, climb to ~4,000 ft at the IP, descend, then pop up to drop on the target.
- **Outputs / effects:** scheduled speed/altitude changes triggered at specific waypoints; controls exactly where the profile changes.
- **Edge cases / quirks:** The presenter labels per-waypoint editing "pretty advanced" and recommends beginners ignore it. Within a group, individual members' altitudes can be set per-unit (see *Aircraft formation limitation*). The sim "automatically resets all your hard work every time you do anything" — re-check assigned altitudes after any edit. A "holding" waypoint should be set **high** (e.g. 36,000 ft) to conserve fuel before a low dive; insert an extra high waypoint before the dive so the aircraft doesn't run out of fuel crossing to the target. One flight (Goose 51, LGB) automatically **inherited/shared** another flight's (Astro 40) edited flight plan.
- **Source:** FTRQtZg_jwk, O4HTj5ct7yg, bsLLZwqi4Mg
- **Confidence:** High

### Move → pause → move via speed-changed waypoints (ground units)
- **Models:** a ground unit can be made to slow to a near-stop for a controllable duration mid-route by setting an intermediate waypoint's speed to minimum (there is no native "wait N minutes" order).
- **Inputs / parameters:** a sequence of waypoints; each waypoint's speed setting; the unit's initial throttle; the distance of the slow leg; the unit's min and max (full) speed.
- **Behavior / rules:** Use three waypoints: (1) initial position, (2) a short distance away with its **speed set to MINIMUM** (the unit's slowest speed), (3) the final destination. The trick: waypoint #2 is set to minimum speed while the **initial throttle is FULL** — so the unit charges out, crawls across the slow leg, then charges to the finish. To time the effective "pause," compute **slow-leg distance ÷ minimum speed = time on that leg**. You can also draw a small "holding box" loop of waypoints so the unit lingers in place without traveling far.
- **Outputs / effects:** the unit decelerates over the low-speed leg (an effective pause), then accelerates to full on the final leg; dwell time is deterministic from distance/speed.
- **Edge cases / quirks:** It is a workaround, not a true "wait" order — the unit never fully stops, it moves at minimum speed. Use a tight holding-box waypoint loop to dwell without covering ground. (Lua scripting is the alternative but isn't usable in situ.)
- **Source:** xhmuBfBQ_DY
- **Confidence:** High

### Delayed / timed mission start to gate movement and engagement
- **Models:** a mission can be scheduled to kick off later, letting pre-positioned units hold until a set time and then move/strike together.
- **Inputs / parameters:** a strike mission definition; a **Start Time** OR a **Time On Target**; the mission's **Active/Inactive** flag; the assigned units' starting range to their targets.
- **Behavior / rules:** Set up a normal strike mission but give it either a Start Time or a Time On Target. **Critical ordering rule:** set the mission to **Inactive** before editing its details, or the engine may try to kick it off before you finish configuring it. The assigned ground units must **start out of range** of their targets; if they begin in range they "simply start firing the moment you give them the go-ahead," defeating the delay. At the prescribed time the units "get rolling again... towards the target zone."
- **Outputs / effects:** units hold until the scheduled time, then begin movement/engagement at the start/Time-On-Target.
- **Edge cases / quirks:** If you don't mark the mission Inactive while configuring, it may auto-kickoff prematurely. If units start in range, they fire immediately rather than waiting. The same delayed-mission technique works for submarines and ships; **aircraft are "a little tougher"** but the principle still applies.
- **Source:** xhmuBfBQ_DY
- **Confidence:** High

---

## 4. Altitude Control & Terrain-Following

### Altitude control: AGL vs ASL and terrain-following
- **Models:** commanded altitude is sea-level by default, but the sim follows terrain and respects a minimum safe altitude.
- **Inputs / parameters:** commanded altitude value; a toggle for relative-to-ground (AGL) vs above-sea-level (ASL); pilot proficiency; terrain elevation; cloud-layer markers on the altitude widget.
- **Behavior / rules:** Entering e.g. "100 ft" means 100 ft **above sea level** by default. The sim won't fly the aircraft into terrain: over higher ground it flies its minimum safe altitude and only descends to the commanded value where terrain permits (example: commanded ~2,000 ft ASL reads ~1,000 ft AGL over land). You can set altitude relative to ground level instead (e.g. always 1,000 ft AGL). The altitude widget marks cloud-layer bands so you can sit inside cloud (example: mid cloud ≈ 12,000 ft; local ground ≈ 3,500 ft).
- **Outputs / effects:** commanded vs actual flown altitude; AGL/ASL readouts; cloud positioning.
- **Edge cases / quirks:** "Minimum altitude" = fly as low as possible; the achievable minimum depends on **technology** (terrain-following radar lets some aircraft fly extremely low, e.g. ~20 ft) and otherwise on **pilot proficiency**. Aircraft auto-avoid terrain ("won't smack into mountains"). Submarines start at 0 ft and go down; aircraft start at 0 and go up. **Terrain elevation ADDS to a SAM's effective ceiling** — a SAM on high ground reaches a higher absolute altitude (important for terrain masking vs SAM coverage).
- **Source:** FTRQtZg_jwk
- **Confidence:** High

### Helicopter altitude vs throttle (terrain masking)
- **Models:** real helicopter low-level flight — slow = lower, fast = pop up to clear obstacles.
- **Inputs / parameters:** throttle/speed setting (loiter / cruise / military); AGL altitude.
- **Behavior / rules:** Helicopter AGL altitude is tied to throttle: **loiter ≈ 50 ft AGL; cruise ≈ 100 ft AGL; military ≈ 100 ft AGL.** When ordered to move from a hover, a helicopter at 50 ft automatically climbs to ~100 ft AGL to avoid obstacles at speed. To stay maximally masked, use a loiter speed.
- **Outputs / effects:** lower speed → lower altitude → better terrain masking and lower detectability behind ridgelines.
- **Edge cases / quirks:** "Pop-up attack": order a hover, briefly command a higher altitude (demo: 200 ft) to fire over a ridge, then descend. Automatic evasion mode can make a low helicopter climb/sprint and expose itself.
- **Source:** hu1Mu_qaXQ8 (Helicopter Terrain Masking)
- **Confidence:** High

### Aircraft/object altitude rendered relative to ground level (true-altitude display)
- **Models:** units can be drawn at their true 3D altitude so their height relative to the underlying terrain (and to each other) is visible. (Display feature, not sim physics.)
- **Inputs / parameters:** Game Options → Map Display → **"Draw units at true altitude"** toggle; each unit's altitude (MSL); underlying terrain elevation; camera altitude.
- **Behavior / rules:** Enabling "Draw units at true altitude" offsets a unit's marker from its ground position by a leader line proportional to altitude, so aircraft no longer plot straight-down. The displayed height is referenced to **ground level** — flying along mountains you can see the aircraft's clearance over rising terrain (example: an aircraft at ~1,000 ft AGL vs mountains ~1,500 ft). Ballistic objects render their true apogee.
- **Outputs / effects:** marker offset / leader line showing relative altitude; visible terrain-clearance relationship; no change to the simulation itself (display-only).
- **Edge cases / quirks:** Perceived on-screen altitude scales with **camera** altitude (a 700 km camera makes an 87 km missile "not feel" that high). The AGL-relative rendering is the one substantive ground/terrain-relevant point; the rest is visualization.
- **Source:** 2H3gazg1seo
- **Confidence:** Low

---

## 5. Formations & Grouping

### Grouping & ungrouping units (create / detach / disband / re-link)
- **Models:** a group is a metaphor over real member units that lets them move/act together under one lead.
- **Inputs / parameters:** selected units; **G** (group); **D** (detach); **Delete** (disband); **numpad 9** (toggle individual-member selection); Game Options → Map Display → **Ghosted Group Members** (all / do not show / stylized).
- **Behavior / rules:** Select units and press **G** (or right-click → Group Operations → Group selected units, or Unit Orders → Group) to bind them to one lead element. The group moves in formation at the same speed and shares information, but it is **not** a real object — just a metaphor over the real members. A collapsed group shows as a single (double-circle) icon; selecting it can reveal contents per map settings. **Numpad 9** toggles between lead-only view and selecting individual members. To split: in member view, select members and press **D** to detach into a new sub-group (press 9 again to see the two groups). Pressing **Delete** on the group lead disbands the entire group at once (units split off; nothing is destroyed). Members can be regrouped later with **G**, snapping back to the original unit.
- **Outputs / effects:** group membership; collapsed/expanded display; sub-groups.
- **Edge cases / quirks:** Members can still act independently (e.g. a flight engages targets normally) **until given a movement command**, which pulls them back together to move. A detached single unit is still a group on its own. Groups can be named separately from members, appear labeled in the Order of Battle, and a whole group can be selected as the asset for a mission. Repeatedly break/rejoin can "give you some interesting issues" (instability warning).
- **Source:** 0mxcfrMWpSU, O7qj1RaEU9M
- **Confidence:** High

### Grouping operations & constraints (merge/split, ground-unit limits, homogeneity)
- **Models:** groups are managed via discrete operations (group = **G**, dissolve = **Delete**, detach = **D**, plus Unit Operations Merge/Split and Group Operations) with specific constraints per context.
- **Inputs / parameters:** selection (group vs individual units); keys **G / Delete / D**; Unit Operations panel (Merge/Split — **air only**); Group Operations panel (Group selected units / Detach selected units); aircraft type + loadout (for homogeneity prompt).
- **Behavior / rules:**
  - **Homogeneous-type enforcement vs mixed override:** Aircraft "do not like to group with things that are not them." Pressing **G** on a heterogeneous selection raises a prompt: "Enforce a wing with homogeneous types of aircraft (splitting into multiple wings)" OR "Force the entire selection into a mixed group." Choosing homogeneous auto-splits into multiple wings by type/loadout; choosing mixed forces one mixed group (e.g. F-16s with Mavericks + air-to-air load together). Joining a single same-loadout unit to an existing homogeneous group via box-select + G simply orders it to join. (Mixed grouping is a relatively newer feature.)
  - **Break a subset:** You cannot use **G** to break a subset off an existing group (no-op because they're already grouped) — select the subset and press **D** (detach) to create a separate group; then **G** on those can re-form them.
  - **Merge two groups:** **G** on two existing groups raises an error; the workaround is to **dissolve** all groups (Delete on each), select all, then **G**.
  - **Ground units have no Merge/Split:** the Merge/Split buttons under Unit Operations appear only for the right selection level (group vs individual) and are **not** available for ground units — ground units use Group Operations → Group/Detach instead.
- **Outputs / effects:** one mixed group, several homogeneous wings, or merged/dissolved groups; per-unit formation station assignments.
- **Edge cases / quirks:** **G** on already-grouped units is a no-op. Two whole groups can't be directly G-merged (error + dissolve-and-regroup workaround).
- **Source:** O7qj1RaEU9M
- **Confidence:** High

### Flight/group ID numbering and inheritance on split/merge
- **Models:** each group/flight carries a unique auto-incrementing ID; splitting spawns new incrementing IDs, and merging assigns a fresh ID (the old number is lost).
- **Inputs / parameters:** split/detach actions; merge actions; manual rename (**R**); launch-from-base groups (which get codeword IDs).
- **Behavior / rules:** Detaching and regrouping **increments** the flight number (observed Flight 13 → 14 → 15 each break). Merging groups assigns a brand-new number and the prior flight number is lost (observed jump to "Flight 56"). Groups appear in the F11 missions list and can be renamed with **R** (e.g. "land at 4/5"); base-launched flights get codeword IDs (e.g. "Raidar 4," "Vegas 43," "Bubba 31"). A broken-off subunit turns **white** on the map to indicate it is no longer part of the original combined group while still on its original assigned mission.
- **Outputs / effects:** group/flight identifiers updated; mission list reflects new group names.
- **Edge cases / quirks:** IDs only increment (never reused) on split; merge discards the old number and picks a new one. Manually grouped flights keep the manual count even if a mission intended a different size (observed F11 showing "22" after manual mega-grouping despite the mission saying 2).
- **Source:** O7qj1RaEU9M
- **Confidence:** Med

### Overriding launch group size from a base
- **Models:** you can override the auto-assigned launch group size by manually selecting and launching your own sub-groups of aircraft from a base.
- **Inputs / parameters:** aircraft assigned to a base mission; manual selection of N aircraft; the "launch group" action; whether aircraft are already grouped.
- **Behavior / rules:** Instead of letting the mission decide group sizes, the player manually selects e.g. 4, then 6, then 8 aircraft and launches each as its own group; once airborne each launched selection is its own group of that size. If aircraft are already grouped, unpausing makes them instantly regroup. There is a brief delay while a group "finishes grouping up" before it acts. F11 afterward shows each created group with its manually chosen size.
- **Outputs / effects:** player-defined launch group sizes; multiple independent airborne groups.
- **Edge cases / quirks:** A just-launched crew may sit idle until grouping completes. Already-grouped aircraft snap back together on unpause unless re-managed.
- **Source:** O7qj1RaEU9M
- **Confidence:** Med

### Formations: stations, relative vs fixed bearing
- **Models:** each group member holds an assigned station offset from the lead, defined by position plus a bearing mode.
- **Inputs / parameters:** the formation editor (**F4**); per-station position; per-station bearing mode = **Relative ("R")** or **Fixed**; the designated formation lead.
- **Behavior / rules:** Every formation has a **lead** (the member tagged "lead"); each other member keeps its own station defined by (1) a location and (2) a bearing mode. **Relative bearing** (shown by an "r"): the station **rotates with the lead's heading** — turn the group and members swing radially to keep the same relative geometry/bearing to the lead. **Fixed bearing:** the station holds a specific compass point regardless of the lead's heading — members hold absolute positions (good for keeping picket vessels along an expected threat axis); ordering the lead one way makes fixed-bearing members move ahead/behind accordingly.
- **Outputs / effects:** member positioning behavior as the group maneuvers.
- **Edge cases / quirks:** There is acknowledged formation positioning imprecision ("precision issue with formations"). Line-of-battle is built by designating a lead and placing ships behind it; CMO does **not** do a coordinated simultaneous turn — on a course change everyone rushes to re-form behind the new lead position (no "turn-in-sequence"); must be done manually. No display shows exact relative positions, making fine layout hard to verify.
- **Source:** 0mxcfrMWpSU
- **Confidence:** High

### Aircraft formation limitation & per-member altitude in a group
- **Models:** in this build aircraft can't hold assigned formation stations, but group members can fly different altitudes.
- **Inputs / parameters:** formation-editor stations (ignored by aircraft in build **1134.3**); per-unit altitude set in individual-member view (numpad 9).
- **Behavior / rules:** At the stated build (1.13.x / **1134.3**) aircraft do **NOT** adopt/keep a formation station — assigning stations in the formation editor has no effect; they keep flying as before. **However**, in individual-unit view (numpad 9) you can set each member's altitude independently (e.g. one at max altitude, another at medium) and they will fly different altitudes while remaining one group.
- **Outputs / effects:** aircraft ignore station offsets; per-member altitude differences persist.
- **Edge cases / quirks:** Earlier versions could hold aircraft formations. Watch out: forgotten per-member altitudes create a vertically "stacked" group hitting a target at the wrong angle. **Launch group sizes:** typically **4** (sometimes up to **6**); you can launch all aircraft at an airbase at once (shown launching **12**) as one mega-group, exceeding the mission editor's group-size cap of **6**.
- **Source:** 0mxcfrMWpSU
- **Confidence:** High

### Mega-group formation coordination cost
- **Models:** forcing a very large number of units into one group makes the sim continuously recompute the combined formation/coverage polygon, which is computationally expensive.
- **Inputs / parameters:** number of units forced into a single group (**G** on a large selection); simulation time-compression rate; formation/coverage polygon regeneration.
- **Behavior / rules:** Grouping a large flight into "one mega group" causes the engine to coordinate all aircraft simultaneously into one formation; at high time compression (e.g. 15×) it "regenerates one heck of a polygon" representing the group's combined environmental coverage, slowing the client ("get a little chunky").
- **Outputs / effects:** a single large formation; visible performance/coordination load.
- **Edge cases / quirks:** Purely a coordination/perf consequence; no numeric threshold given.
- **Source:** O7qj1RaEU9M
- **Confidence:** Low

### Zero-collision stacking of naval units & contact fusion ("cheese" tactic)
- **Models:** ships occupy no physical space, can overlap and fire through each other; tightly stacked contacts fuse on radar.
- **Inputs / parameters:** inter-ship separation (can be ~**60 ft / ~151 m**, effectively zero); target altitude/band for fusion; incoming-fire targeting.
- **Behavior / rules:** Ships do not take up space and do not collide; you can stack a whole group at one point (~151 m / ~60 ft apart, even "inside" each other) and they shoot through one another. Concentrating fire from a stacked group removes deflection-shot geometry, so outgoing weapons are more likely to hit a stacked target. Conversely, multiple contacts stacked at the same altitude eventually **fuse into a single radar contact** over time — useful to confuse human players.
- **Outputs / effects:** overlapping unit positions; merged enemy contacts; concentrated fire.
- **Edge cases / quirks:** A practical (non-cheese) use: keeping ships extremely close means a hit/sinking ship remains a target and keeps soaking incoming weapons ("spammed out of existence"), shielding more valuable vessels ~60 ft away.
- **Source:** I2HX_78aErs
- **Confidence:** Med

### Formation spacing vs missile-defense effectiveness (naval)
- **Models:** how far escorts are spread from the high-value unit affects layered defense vs leakers.
- **Inputs / parameters:** spacing between escorts and center (tested ~**1 nm**, ~**10 nm**, and a screen-on-threat-axis layout); escort weapon mix (SM-2/SM-3 vs older types); attack saturation (**20+ AS-16** missiles, **100+** interceptors expended).
- **Behavior / rules:** Experimental, qualitative findings: long-range interceptors (SM-2/SM-3) fire first, older weapons join as range closes ("opening the bidding"). Tight (~1 nm) spacing still defeated a heavy AS-16 salvo (no hits, despite a leaker). Wider (~10 nm) spacing also held because long-range SMs could "reach all the way over there." A **screen placed along the expected threat axis** (carrier inside, escorts on the edge in a line) layered the defense well, expending 100+ interceptors. **Deflection (crossing) shots are very hard to make**, so geometry strongly affects intercept success.
- **Outputs / effects:** number of leakers/hits vs interceptors expended; relative defensive effectiveness.
- **Edge cases / quirks:** No numeric thresholds for "too much/too little" spacing are given — purely demonstrated. Tactical guidance: put picket vessels on the expected threat vector; center carriers; occasionally split high-value ships for screening. (Spacing is set via the formation-editor stations above; the editor is the mechanism, this is the tactic.)
- **Source:** I2HX_78aErs
- **Confidence:** Low

### Formation spacing / frontage width in BVR (air)
- **Models:** lateral spacing between aircraft sets total frontage covered; spacing has little effect on a head-on missile duel but provides area control.
- **Inputs / parameters:** formation type (line); per-aircraft spacing (meters or nautical miles, e.g. **100 m, 1 nm, 10 nm**); number of aircraft (total frontage = spacing × gaps; 1 nm across 4 aircraft = "4 nm frontage"); attack-order timing.
- **Behavior / rules:** Tested line spacings **100 m → 1 nm → 10 nm** vs an equal enemy F-16 group. Detection of incoming F-16s occurred around **~43 nm** head-on regardless. Conclusion: formation type/width gave "no tactical advantage" in the pure spam-AMRAAM exchange — results were "inconclusive"/neutral at 100 m and 1 nm. **But** very wide spacing (10 nm) created a broad frontal control pattern: the formation acts "like the spade on the front of a bulldozer," pincering and forcing enemy aircraft to keep dodging missiles so they get "pushed backwards." Practical extension: spacing F-35s ~**100 miles** apart yields "the world's widest AWACS" for sensor coverage.
- **Outputs / effects:** total frontage/area covered; whether you can pincer/push the enemy; detection geometry. Little change to raw kill outcome of a head-on duel.
- **Edge cases / quirks:** "Set the formation **after** you've already given them a move order" — works better. At extreme width some aircraft never get into range to shoot ("too wide"); a slight oblique heading helps bring them to bear. Maintaining huge spacing would be hard in a real flight sim (you'd rely on datalink for position).
- **Source:** trk7WTa9SzI
- **Confidence:** Med

---

## 6. Detection — Radar, Line-of-Sight & Sensor Geometry

### Radar fundamentals (band, wavelength, resolution, waveform)
- **Models:** how a radar's database characteristics (generation, band/wavelength, PRF, waveform, scan type) drive its detection range, positional accuracy, and counter-detectability. This is the foundational rule the bucket-specific radar/LOS mechanics below specialize.
- **Inputs / parameters:** per-radar database fields — **generation** (1950s → modern), **type** (air search / surface search / fire control / height-finder / terrain-avoidance / weather / nav), **range** (instrumented; short / medium / long), **operating bands (search and track)**, wavelength/frequency, **PRF** (pulse repetition frequency), waveform (pulse / continuous-wave / FM / pulse-Doppler), scan/update method (mechanical rotate, electronic, phased array, synthetic-aperture), and **two separate radar-detection-range values** carried on each *target* (one for long wavelengths, one for short).
- **Behavior / rules:**
  - **Principle:** radar sends a pulse and times the return at light-speed; in-game this yields range to the target. Raw radar inherently returns **range only**, not altitude (see height-finding).
  - **Generation:** newer radars are more sensitive with better processing and anti-jamming. 1950s radars could be jammed through their side-lobes so badly the whole scope blanks; modern radars detect the jammed frequency and hop. Processing matters as much as raw power — a 1-MW old radar can equal a 25-kW modern one, and better radars **integrate** multiple passes to pull a weak signal up over time.
  - **Band / wavelength tradeoff (core rule):** long wavelength / low frequency → can transmit **much higher power** → **longer detection range**, but **poor resolution** (the contact smears across an arc; you may get range only, with no reliable heading/altitude — positional **ambiguity**). Short wavelength / high frequency → far **better resolution** (tight track with speed + heading) but shorter range — hence **fire-control radars use short wavelengths** and **early-warning radars use long wavelengths** (extremely high power). Mechanically scanned long-wave sets need several sweeps before the track tightens.
  - **Two detection ranges per target:** every unit carries a long-wavelength and a short-wavelength radar-detection-range. For non-stealth aircraft they are equal; for stealth (e.g. **F-22**) the **long-wavelength** value is much larger — a 1950s long-wave EW radar detects an F-22 far more easily than a short-wave fire-control radar can.
  - **PRF → max range:** the pulse repetition frequency sets the radar's typical maximum range (it stops listening past the round-trip distance for one interval, avoiding range ambiguity). Sophisticated processing can extend beyond this.
  - **Waveform:** earliest radars were **pulse** (send, then listen). **Continuous-wave (CW)** pours energy continuously and reads Doppler but can't range by itself; **frequency modulation (FM)** tags successive emissions so the return can be matched and ranged. Many **fire-control radars illuminate continuously** to guide semi-active weapons (a Sparrow needs the target lit); an airframe can carry separate **search (pulse)** and **track (CW)** settings.
  - **Scan / update rate:** mechanically scanned radars detect a target only when the beam sweeps onto it; the database **update rate** can be as slow as **once every ~10 s** on old sets, so contacts go stale between sweeps (an age counter shows under the symbol) and a maneuvering target can be lost. **Phased-array** radars electronically scan nearly instantaneously (very fast update, more precise, hard to counter-detect, can classify the airframe). **Synthetic-aperture / side-looking** radars move the whole platform instead of the antenna (satellites, MiG-25 recon).
  - **Coverage volume:** a radar's vertical coverage is a 3-D **cone** — a target far below the cone is invisible even to a look-down/shoot-down set (a Patriot array could not see a target ~50,000 ft directly overhead).
  - **2D vs 3D / height-finding:** a plain 2D radar gives range/bearing but **no altitude**; **3D / height-finding** radars use multiple lobes to derive altitude. Historically a 2D search radar was **paired** with a dedicated **nodding height-finder** to supply altitude.
- **Outputs / effects:** determines for each radar how far it detects, how precisely it locates (point vs smear), whether it yields altitude, how fast it updates, and how detectable it is to enemy ESM.
- **Edge cases / quirks:** A very frequency-agile radar firing very short pulses all over the sky (e.g. **F-22**) can be impossible for enemy ESM to even register as emitting (LPI), while a conventional radar is instantly classified and bearing-fixed. Wide-bandwidth radars are harder to jam; a strong enough radar can **burn through** jamming. Counter-detection truism: "the first to emit is the first to get hit" — except for very sophisticated phased-array/LPI radars.
- **Source:** 7mmQ2y11hPc (Tutorial - Radar)
- **Confidence:** High (model High; specific numbers Med — auto-caption)

### Terrain elevation / line-of-sight masking for sensors
- **Models:** 3D terrain blocks radar and visual/IR line of sight between sensor and target.
- **Inputs / parameters:** terrain height field (relief data); sensor position and altitude; target position and altitude; Earth curvature.
- **Behavior / rules:** Terrain elevation data is what CMO uses to compute LOS for radars and visual cameras. A sensor only loses LOS to a target if terrain is **between** sensor and target **AND** the target is low enough to be masked: a target at **36,000 ft** is not masked by mountains unless it is down inside a valley. Higher sensor placement (hilltop/mountaintop) yields better LOS; valleys can hide/mask aircraft on ingress. **Earth curvature also masks** — a unit flying low enough can hide behind the curvature of the Earth even when nominally "in range."
- **Outputs / effects:** whether a sensor can detect/track a given target (a binary LOS gate layered on top of range).
- **Edge cases / quirks:** "In range does not mean you can hit it" — LOS masking and curvature can deny a track even within nominal sensor range. The dedicated Line-of-Sight tool visualizes this (next rule). CMO's relief layer is **granular** — macro elevation only; individual trees/tiny folds aren't modeled for elevation LOS, only ridges/mountains mask. Open desert offers no masking other than elevation. A radar even on a 12,000-ft peak can be blocked by taller terrain. High-arc SAMs (S-300/S-400) can still loft a missile over a ridge to hit a masked target.
- **Source:** 5dJfIKiNHj8, wycT9grtrOE (Terrain Masking), bsLLZwqi4Mg (Understanding Radar Horizon)
- **Confidence:** High

### Line-of-sight blocked by terrain prevents engagement ("Effects of terrain type")
- **Models:** units won't engage each other if intervening terrain (mountains, trees, vegetation, buildings) blocks LOS; terrain elevation and land-cover type gate visibility and thus engagement.
- **Inputs / parameters:** scenario setting **"Effects of terrain type"** (scenario features & settings); terrain land-cover type and elevation/height along the sightline (e.g. "woody savanna height 16 ft, skyline 1643," "natural vegetation mosaic / cropland"); relative positions (e.g. looking down into a valley).
- **Behavior / rules:** With terrain effects active, LOS is computed against terrain; if blocked, the units cannot see each other and **will not engage** — even if WRA/doctrine permit and they're in range. The map hover readout exposes the land-cover classification and height/skyline values used. Looking down into a valley dramatically changes available LOS. Framed as the classic "cover vs concealment."
- **Outputs / effects:** detection/engagement allowed or denied based on terrain occlusion.
- **Edge cases / quirks:** **Many failures to engage are actually LOS failures** rather than ROE/WRA problems — explicitly warned to check this first. The verbatim readout values (16 ft height, 1643 skyline) are example tile values, not thresholds.
- **Source:** JqZYvpCP7ik
- **Confidence:** Med

### Line-of-Sight (LOS) coverage tool
- **Models:** computes and highlights every map cell a given sensor can see for a target at a chosen altitude.
- **Inputs / parameters:** selected unit (sensor); max radius/distance; target altitude (e.g. 10 m / 30 ft, 100 m, 1500 m); terrain. Must click **Refresh** after changing parameters.
- **Behavior / rules:** You select any unit, set its maximum radius and the target's altitude, hit Refresh, and the tool shades the map where that target altitude would be visible to that sensor. Raising the assumed target altitude **dramatically increases** the highlighted (visible) area; lowering it shrinks it. Increasing max distance also enlarges coverage.
- **Outputs / effects:** a highlighted visibility footprint on the map (a detection zone, not an engagement zone).
- **Edge cases / quirks:** Can be used "in reverse" by the attacker: knowing a radar's position, route strike assets (e.g. Tomahawks) through the un-shaded/non-visible terrain to stay masked. The LOS tool is only available for your **own** units; for enemy radars you must estimate via ESM + horizon math. The Lua *best-LOS-point* algorithm (next rule) automates finding the longest-LOS position.
- **Source:** 5dJfIKiNHj8, u9R-59fusCM (Determining a point in terrain with the best LOS)
- **Confidence:** High

### Best-LOS terrain point (Lua elevation-scan + horizon-probe algorithm)
- **Models:** finding the position in an area with the best (longest) line-of-sight, by combining a terrain-elevation scan with the LOS/horizon tool.
- **Inputs / parameters:** a bounding box (start/end latitude and longitude); a scan **granularity step** (demo `0.01`; `0.001` for ultra-fidelity at the cost of processing time); elevation per point (`GetElevation`); a sample count (demo ≈ 10); and the **horizon/LOS tool** parameters.
- **Behavior / rules:** The dedicated tutorial walks an actual Lua algorithm:
  1. **Scan elevations:** nested loops step over lon (`x`) and lat (`y`) by `step`, calling `GetElevation{latitude=y, longitude=x}`. Track the running max elevation and **append** each new high point's lat/lon to two lists (a set of candidate high points).
  2. **Sample:** pick `numberOfSamples` (≈10) high points out of the list (clamp the count to the list size to avoid overrun).
  3. **Probe LOS:** create a temporary marker **facility unit** (a generic geographic-marker DBID, e.g. `2349`) at each sampled point, then call the LOS tool — `HorizonTool_LOS{ observer = <unit guid>, target altitude = 100, mode = 0 (distance), horizon = 1 (visual), use range limits = false }`. `use range limits = false` is **required** because the bare markers have no sensors. The call returns a **horizon distance**; larger = sees farther.
  4. **Pick best:** keep the point with the greatest returned horizon (`bestLat/bestLon/bestHorizon`), drop a final unit there, and ideally delete the temporary probe units afterward.
- **Outputs / effects:** the single best-LOS sensor/observer position in the area, plus the LOS distance from it.
- **Edge cases / quirks:** In the demo the best-horizon point **was** simply the **highest** point (Bear Mtn, CT; best horizon ≈ **64.67**), so elevation is usually the dominant driver — but the LOS probe is what proves it, since a high point ringed by taller terrain would lose. Confirms that elevation alone isn't sufficient if surrounded by higher ground. Easy lat/lon (x/y) and hemisphere-sign mistakes place points in the wrong spot.
- **Source:** u9R-59fusCM (Determining a point in terrain with the best LOS)
- **Confidence:** High (algorithm shown end-to-end; exact API field names Med due to auto-caption)

### Radar horizon from Earth curvature (altitude extends max detection range)
- **Models:** radar detection is line-of-sight; raising the sensor's altitude pushes the horizon out so distant low contacts beyond the curve become visible.
- **Inputs / parameters:** sensor (aircraft) altitude; target height above surface; Earth's curvature; the radar's intrinsic max range (a hard cap).
- **Behavior / rules:** With a maritime patrol aircraft's long-range radar: at maximum altitude two ship contacts were detected at ~**195 nm** and ~**160.3 nm**; at medium altitude the "maximum detection radius shrunk" and both ships were picked up much closer. Climbing visibly grows the detection circle and increases range until it "caps out" at the radar's maximum range. Lowering altitude makes you unable to "see on the other side of that curve," hiding targets below the horizon.
- **Outputs / effects:** size of the radar detection ring; range at which contacts first appear.
- **Edge cases / quirks:** There is a **hard maximum radar range** altitude cannot exceed (the circle stops growing). A target on the far side of the horizon cannot be detected at all regardless of altitude. CMO provides a **"Radar Horizon and Target Visibility Calculator"** (own height + radar/mast height → target-visibility distance); the radar height for a sea platform is its **mast height** (DB field, e.g. 10 m ≈ 32 ft). Worked figures (auto-caption, approximate): a **1,000 m** target vs a **30 m** mast → only **~22 nm**; a **240 nm** radar at ~32.8 ft mast saw 36,000 ft → **~240 nm**, 12,000 ft → **~141 nm**, 10,000 ft → **~125 nm**, ~1,500 ft → **~60 nm**, and a 104-ft-AGL target only when very close. **Over-the-horizon (OTH) radars** ignore the horizon (atmospheric bounce) — e.g. a **Steel Yard / Duga** rated **~3,200 nm** for space search, or a TPS-71 for surface search — at the price of **ferocious ambiguity** (can be off by **~60 miles**), so OTH gives only rough cueing.
- **Source:** _qeXJWmRBks, bsLLZwqi4Mg (Understanding Radar Horizon), 7mmQ2y11hPc (Tutorial - Radar)
- **Confidence:** High

### Target aspect / radar cross-section effect on detection range
- **Models:** detection range depends on how much reflective surface the radar sees; a beam striking a ship's flat broadside returns more energy than one hitting a stealth-shaped bow, and geometry/altitude change which facets are illuminated.
- **Inputs / parameters:** target geometry/RCS shape (e.g. Zumwalt stealthy bow vs flat broadside); target aspect (bow-on/"facing us" vs "beaming us"/broadside); sensor altitude (changes how much of the deck/side the beam can strike).
- **Behavior / rules:** Two identical Zumwalt destroyers were detected at very different ranges purely from aspect: the broadside ("beaming") ship at ~**182 nm** and the bow-on (facing) ship at ~**161.3 nm** — the stealth bow delayed detection. A beam hitting the flat side gives "the best return," while hitting an angled/spiky top deflects energy away; flying higher lets the beam see more of the ship's large top/side surface, improving the return.
- **Outputs / effects:** earlier vs later detection / shorter vs longer detection range for otherwise-identical targets.
- **Edge cases / quirks:** Interacts with curvature: even with a good RCS aspect, geometry/curvature may block the reflection so you still can't detect it. The effect is strongest with a top-tier long-range radar; with a lesser radar it is muted (next rule). Quantitatively, **aspect alone is a small modifier** against a powerful EW radar: each airframe carries separate per-aspect RCS values (demo F-16 front 4.65, side 2.9, rear 4.7 m²), but a 0.3 m² nose difference moved detection only ~3 nm at ~210 nm (~2%), and showing side vs nose changed range only ~2–2.5%. Aspect becomes significant (~10%) only when combined with jamming (e.g. nose-on F-104 with jamming ~187 nm vs ~207 nm) or true stealth. **External stores** massively inflate RCS (GBU-49s on an F-35); internal carriage keeps it small. So model aspect as a *small* standalone detection modifier.
- **Source:** _qeXJWmRBks, 1r4P_gI-Pdw (Radar Aspect and Detectability)
- **Confidence:** Med

### Lesser (mechanically-scanned) radar shows little altitude sensitivity in detection range
- **Models:** a short-range, non-phased-array radar does not gain meaningful detection range from altitude the way a long-range maritime radar does.
- **Inputs / parameters:** radar type/quality (F-16 traditional mechanically-scanned vs phased array); aircraft altitude; the same two Zumwalt targets.
- **Behavior / rules:** F-16 at 36,000 ft detected the two ships at ~**42 nm** and ~**35.3 nm**. Dropping the F-16 to 12,000 ft had "no impact in the slightest" on detection range — the re-test gave ~**43 nm** and ~**30.2 nm**, essentially the same as at 36k.
- **Outputs / effects:** first-detection range stays roughly constant across the tested altitudes for this radar.
- **Edge cases / quirks:** Contrasts directly with the long-range MPA radar that **did** benefit from altitude — the altitude/RCS advantage is **radar-dependent**.
- **Source:** _qeXJWmRBks
- **Confidence:** Med

### Mechanically-steered radar conical scan & look-down blind spot
- **Models:** a mechanically-scanned radar sees only a narrow cone; high own-altitude creates a blind spot beneath the aircraft, worsened by ground clutter.
- **Inputs / parameters:** radar type (mechanically steered vs electronic); current radar pointing angle/cone; own altitude; presence of ground/terrain behind a target.
- **Behavior / rules:** A mechanically steered radar (e.g. F-16) looks through a narrow "conicle section" — roughly a **quarter-degree** concentrated beam; targets outside the cone are "completely undetected even though they exist in the world." Real radars sweep "1 of 16 points" each way to cover more sky. Practical rules modeled: (1) at high own-altitude a **blind spot** forms directly underneath the aircraft, so low-flying targets can slip under your radar; (2) **ground clutter behind a low target** makes it "very, very challenging to identify," especially with older radars; (3) operating at **lower** own-altitude shrinks the lower blind spot; (4) a target **above** you is easier to detect because "there's no terrain behind it."
- **Outputs / effects:** which targets are detected/identified vs missed (look-down vs look-up); detection difficulty against cluttered low targets.
- **Edge cases / quirks:** Older radars suffer more from ground clutter; CAP aircraft at middle altitudes are very hard to sneak under; targets silhouetted against open sky (above you) are detected most easily. **Pulse-Doppler ladder vs ground clutter:** a target below the radar produces two returns (target + ground); a low-enough target merges with the ground return and is lost. A **pulse-only** radar cannot detect low targets at all (the lower half of coverage is one clutter blur); **semi-pulse-Doppler** picks aircraft-like returns out of clutter (detected 200–2,000 ft targets ~36–38 nm); **true pulse-Doppler (look-down/shoot-down)** filters by Doppler shift and sees closing/receding low targets. **Notch / beam gate:** a target flying **perpendicular** to a pulse-Doppler radar (zero relative velocity) is invisible because the radar filters out its own motion — the demo measured a roughly **~8°** blind window (eyeballed); the moment the path becomes oblique, Doppler returns. A launched weapon can **lose lock** when a target beams it. You can also defeat clutter by flying **lower** than the targets so they are no longer against the ground (looking up there are no ground returns).
- **Source:** KOOxlw5dfrU, xV-H7HJd2-I (Look Down/Shoot Down Radar)
- **Confidence:** Med (8° figure Med — eyeballed)

### Radar lock mechanical elevation limit / vertical bore-sight gate
- **Models:** a radar has a mechanical scan/elevation limit, so very steep geometry (high shooter vs low target, or vice versa) can prevent acquiring a lock or releasing a weapon at all.
- **Inputs / parameters:** shooter altitude vs target altitude; resulting depression/elevation (look-down) angle; radar mechanical limits; target minimum altitude needed to be "seen."
- **Behavior / rules:** Engaging a low target from very high (e.g. an F-16 at **45,000 ft** over a **7,200 ft** target) can exceed the radar's mechanical limit, so the fighter cannot lock. Conversely a fighter had to be brought **up** from 5,000 ft because that altitude was "too low" to even see the target it was supposed to engage. When the shooter is too far above a lower target, the shot is refused with **"target is outside vertical bore sight limit"** ("looking down too far"); bringing the shooter down (e.g. from 50,000 to 45,000 ft) reduced the look-down angle and allowed the shot.
- **Outputs / effects:** lock acquired or denied; weapon launch permitted or blocked by an error message.
- **Edge cases / quirks:** Stated as a qualitative mechanical limit — no numeric angle threshold given. Overland engagements add ground-return ("ink train mixing") complications vs over-ocean shots. Also referenced "slightly out of DLC/DLZ" — manual altitude must be adjusted to satisfy the bore-sight limit.
- **Source:** dui_lPsECfE, 8WqQ-alekog
- **Confidence:** Med

### Track-quality gating of weapon engagement (radar reliability / look-down clutter)
- **Models:** a weapon won't launch without a good-enough fire-control track; track quality degrades with range and adverse geometry.
- **Inputs / parameters:** sensor/radar quality; range to target; relative-altitude geometry (look-down / ground reflections); target altitude vs shooter altitude.
- **Behavior / rules:** Even within range, the firing unit needs a high-quality track or it won't engage. Track quality drops at long range and with adverse geometry: a high shooter (e.g. **45,000 ft**) looking down at a low target suffers ground reflections / look-down clutter and may fail to lock; a target at **1,000 ft ASL** viewed from **36,000 ft** is very hard to hold. Pulling the sensor closer and lower recovers the track.
- **Outputs / effects:** whether an automatic attack proceeds; the presence/persistence of a radar track.
- **Edge cases / quirks:** In one demo the auto attack stalled until a workaround weapon (AIM-9X) was used because the radar couldn't hold the look-down track. "Auto-detectable" target flags can also suppress normal tracking behavior.
- **Source:** FTRQtZg_jwk
- **Confidence:** Med

### Passive collection vs active transmission state of radar units
- **Models:** a radar can passively collect data without transmitting/sharing, only emitting (and revealing itself / cueing others) when a threat gets close.
- **Inputs / parameters:** radar unit's emission/transmit state; range to incoming threat; the unit's role (early-warning collector vs fire-control); scan rotation cycle.
- **Behavior / rules:** In the demo a P-70 radar was actively communicating a track to the SAM site, while a separate radar station "is actually not transmitting anything... not going to do any of that until it gets much much closer. Basically it's collecting data." Some radar units stay passive/silent (collecting) and only begin transmitting/emitting when a target closes to a threshold range. A scanning radar has a rotation cycle — stated "**every 15 seconds** the radar finishes rotating around" — and a SAM flips up its fire-control radar only as the target enters SAM range before launching.
- **Outputs / effects:** no emissions/sharing while passive; begins transmitting (and contributing/cueing) once the threat is close enough; fire-control radar activates at engagement range.
- **Edge cases / quirks:** A passive collector won't appear to emit, affecting both detectability-by-ARM and what it shares. The rotation period (15 s example) means detection/update is not instantaneous. The exact "much closer" transmit-threshold range is not quantified.
- **Source:** ffTSj81bjBU
- **Confidence:** Med

---

## 7. Detection — Visual / EO-IR & Day/Night

### Visual (electro-optical) acquisition by slant distance — lower is better
- **Models:** visual/EO acquisition (camera, eyeballs) is governed by **slant distance** to the target; flying lower shortens slant distance and lets you see/identify the target from farther out horizontally.
- **Inputs / parameters:** aircraft altitude (sets slant distance); target; daylight/clouds; EO/camera + MAD sensors aboard.
- **Behavior / rules:** With radar **off**, a Tu-95 at **36,000 ft** did not visually acquire two ships until ~**6 nm** (essentially overhead). Dropped to "MPA altitude" (~**7,000–12,000 ft** band), it acquired both ships at ~**3 nm**. The presenter computes 3 vs 6 nm as "1.6 times... almost 150 percent sooner" acquisition by lowering altitude (reduced slant distance enables the visual lock at a closer point).
- **Outputs / effects:** the range/point at which the target is visually acquired and the confidence of identification.
- **Edge cases / quirks:** Clouds or night break this ("if there were clouds... we'd be hopeless"; nighttime "gets more complicated"). Confidence ramps — first "not 100% confident" then upgraded as it closes. Direct trade-off vs radar: for visual search go **LOW** (short slant), for radar detection go **HIGH** (better cross-section + horizon).
- **Source:** _qeXJWmRBks
- **Confidence:** Med

### MPA search-altitude doctrine trade-off (radar-high vs visual-low)
- **Models:** optimal patrol altitude depends on the sensor — maximize altitude for radar; minimize altitude (slant distance) for visual/EO acquisition.
- **Inputs / parameters:** which sensor is primary (radar vs visual/EO); the target must be physically "visible" (not below horizon, not obscured).
- **Behavior / rules:** Stated takeaway: "if you are using radar get as high as you can to take advantage of that better cross section"; for visual acquisition you must reduce altitude to cut slant distance so you can see it sooner. Maritime search often flies lower (the ~7,000–12,000 ft band) precisely because the goal is to **see** contacts, not just paint them.
- **Outputs / effects:** recommended patrol altitude given the detection method.
- **Edge cases / quirks:** Hard precondition for any detection: the target must be on the near side of the horizon and not hidden by clouds/night. **Time-of-day visual model** (detection range as a fraction of full daylight): **day** = baseline (demo eyeball spotted a contrailing bomber ~53 nm); **dawn/dusk** ≈ **60–66%** (~35 nm); **night** ≈ **25–28%** (~15 nm, i.e. a ~75% reduction). **Moon phase** has no appreciable effect. **Contrails** (formed ~20,000 ft and above) are detectable far beyond the airframe even at night; below ~12,000–20,000 ft there is no contrail, so low aircraft are only seen close in. **IR/FLIR** gains little night advantage (it detects at roughly the same range regardless of daylight), so a FLIR+TV combo is best for long range. Clouds and rain gate optical/EO detection further (see the Terrain & Environment bucket's cloud/rain entries).
- **Source:** _qeXJWmRBks, A7oqIAMhKF8 (Visual Sensor Distances), o4bPT47vuK8 (Visual Sensors and time of day), P6UAdBqTUhk (Effects of Rain), yhs02DUz9bg (Cloud Cover's Effects on Spotting)
- **Confidence:** High

### Day/night lighting effect on visual & IR sensors
- **Models:** ambient light level degrades electro-optical/infrared detection at night.
- **Inputs / parameters:** local time of day at the contact's location (scenario clock + geography); sensor type (visual/camera/IR vs radar/sonar).
- **Behavior / rules:** Day vs night does **NOT** matter to radar or sonar, but it matters to **visual** and **IR** sensors (cameras/pods that detect units from far away). At night their performance is "significantly degraded"; during the day it is "great." A day/night terminator overlay shows lit vs dark regions (example: ~11:00 local = lit; ~18:00 in October over China = night).
- **Outputs / effects:** reduced visual/IR detection range/quality at night for affected sensors.
- **Edge cases / quirks:** Magnitude is qualitative in this transcript ("significantly degraded" / "can't see"). The quantitative model is stated under *MPA search-altitude doctrine trade-off* above: night ≈ 25–28% of daylight range; dawn/dusk ≈ 60–66%; moon phase negligible; IR/FLIR not strongly night-advantaged; contrails (≥ ~20,000 ft) visible far beyond the airframe even at night.
- **Source:** 5dJfIKiNHj8, o4bPT47vuK8 (Visual Sensors and time of day)
- **Confidence:** High

### Sensor / targeting-pod effect on target ID and weapon delivery accuracy
- **Models:** carrying a targeting pod (sniper pod) lets the aircraft detect, identify, and strike ground targets faster and more accurately.
- **Inputs / parameters:** presence of a targeting pod (sniper pod) on the aircraft; sensor line-of-sight to target.
- **Behavior / rules:** The presenter was surprised how quickly F-16s spotted and shot "so straight" at ZSUs, then realized "I forgot they had the sniper pods... that's why they're shooting so straight" — attributing rapid ID and accurate delivery to the pod.
- **Outputs / effects:** faster target detection/identification and improved delivery accuracy.
- **Edge cases / quirks:** Purely qualitative in this transcript; no numbers for the pod's contribution.
- **Source:** RDE4S8kzZTQ
- **Confidence:** Low

---

## 8. Detection of Ground Units & Movement Effects

### Detection of stationary vs moving land units & camouflage assumption
- **Models:** stationary land units are very hard to spot; movement (and speed) sharply increases detectability against general observers.
- **Inputs / parameters:** whether the target is moving; movement speed; terrain (concealment); observer proximity/LOS; time of day; infantry vs vehicle.
- **Behavior / rules:** CMO assumes stationary land units camouflage themselves, making non-moving targets very difficult to spot even at point-blank range (demo: enemy tanks drove right past dug-in defenders with mutual non-detection). Moving reveals a unit — units that "moved, that's how they got spotted." Faster movement = easier to detect, so attackers must trade speed (close fast to get within detection range) against exposure. Infantry are "always basically impossible to spot."
- **Outputs / effects:** detection state of land units (drives whether automatic/opportunity engagement can occur).
- **Edge cases / quirks:** Counter-tactics: move infantry in slowly as scouts; use elevation (top of a hill sees better); use a low-flying UAV/recon to spot for indirect fire; exploit night. Auto-detectable objects (e.g. a watch tower) are spotted/killed easily by design. **Tension with the next rule** — movement only helps hide against ordinary observers, not against capable battlefield-surveillance radars.
- **Source:** miMhUGP6fGg
- **Confidence:** High

### Ground-unit detectability vs capable surveillance radars (movement-independent)
- **Models:** against capable battlefield-surveillance radars, a ground vehicle is detectable whether moving or stationary.
- **Inputs / parameters:** detecting sensor type/capability (e.g. E-8 JSTARS side-looking airborne radar, MiG-25RB "Fox Fire" radar); target presence in the radar's coverage; movement state (found largely irrelevant for these sensors).
- **Behavior / rules:** The common "moving units are easier to detect than still ones" intuition is acknowledged, but against a capable sensor it "won't matter if you're going fast or slow as long as you're out there." An E-8 JSTARS with side-looking airborne radar will have "little difficulty" finding a ground unit regardless of speed; even a MiG-25RB "Fox Fire" radar can pick up a ground vehicle "at a reasonable distance even if it is not moving."
- **Outputs / effects:** the ground unit is detected whether moving or stationary (movement does not meaningfully shield it from these radars).
- **Edge cases / quirks:** Stated qualitatively — no MTI/Doppler speed threshold given. **Sensor-dependent:** capable surveillance radars negate the moving-vs-still distinction; the video does not claim this for all sensors. Reconcile with the previous rule (movement reveals you to ordinary observers; capable radars see you anyway).
- **Source:** xhmuBfBQ_DY
- **Confidence:** Med

### Underground targets: no signature → auto-detectable flag governs detection
- **Models:** underground units have no emission/signature, so their detectability is governed by an explicit auto-detectable flag rather than by sensors.
- **Inputs / parameters:** unit category flag "building / underground"; signature fields (none for underground); a per-unit **"auto-detectable"** flag; a sensor (e.g. Reaper EO/IR) with auto-detection on/off; an optional scenario-designer "radar mask" mount.
- **Behavior / rules:** A unit is underground when its category includes "underground" **AND** it shows **no** signatures ("universal sign you're dealing with an underground target"). Detection then splits by the auto-detectable flag: an underground hangar that **is** auto-detectable is always visible; a bunker that is **not** auto-detectable can **never** be detected by sensors no matter how close you fly (demonstrated by flying a Reaper directly over it with auto-detection off — never detected).
- **Outputs / effects:** whether the underground unit appears as a contact at all.
- **Edge cases / quirks:** Scenario designers use non-auto-detectable bunkers to make truly hidden objects, and can mount a "radar mask" on a bunker for special effects. Underground entrances don't block aircraft from reaching the surface; underground piers allow launching submarines unnoticed.
- **Source:** OWCZPAVviuE
- **Confidence:** High

---

## 9. Detection — ESM, Emissions, Comms & Networks

### ESM (passive electronic detection) — bearing, classification, triangulation
- **Models:** detecting and locating emitters by their emissions without emitting yourself.
- **Inputs / parameters:** ESM sensor generation (1950s → 2010s); emitter type/frequency/PRF/pulse-dwell signature; geometry (must face/see the emission); number of cooperating sensors.
- **Behavior / rules:**
  - ESM gives **bearing + emitter classification** but **not** exact position from a single sensor — you get a bearing line / wedge of uncertainty. Position requires triangulation.
  - **Detection range:** ESM can typically detect an emitter to **~1.5× the emitter's own detecting range** (e.g. a 100-nm radar is sensed to ~150 nm). Better/newer generation tightens the wedge; modern (2010s) ESM gives a very tight wedge but still no instant fix.
  - **LOS requirement:** you must be able to see the emission (face the emitter); contacts drop when the emitter turns away (with OTH exceptions). Some energy radiates sideways, so a non-facing radar may still be partially detectable.
  - **Triangulation:** cross two bearings (from RPs at different times, or from two/three platforms simultaneously). Best accuracy near a **~90°** cut between bearings; three-way fixes localize within <1 min of game time. Satellites in groups of three self-triangulate. A demo achieved ~2.3 nm fix accuracy from a platform that never came within 100 nm.
- **Outputs / effects:** locate SAMs/ships/aircraft passively; classify by signature (PRF reveals long-range search radar; demodulated return reveals engine count/type and rough size class).
- **Edge cases / quirks:** **If the target does not emit, ESM cannot detect it** — clever players radar-snap then go silent (EMCON), leaving ESM only a stale bearing. Sensors are **frequency-specific** (early RWRs only detected pre-programmed SAM bands; RWR and HARM Targeting System are just less-accurate ESM). **Frequency-agile / LPI emitters can be un-locatable:** an **F-22**'s frequency-agile, very-short-pulse radar could not even be registered as emitting by a high-end ESM platform, while a conventional radar nearby was immediately classified and bearing-fixed — an explicit exception to the "emit → get located at 1.5×" rule. Some **surface ships (e.g. an Arleigh Burke)** also do over-the-horizon analysis of electromagnetic signals.
- **Source:** oF8LwbZSm28 (Electronic Support Measures), 0R6-5oQR-l0 (IFF), 7mmQ2y11hPc (Tutorial - Radar)
- **Confidence:** High (1.5× and 90° figures stated)

### EMCON / radar-snap discipline
- **Models:** managing own emissions to avoid passive (ESM) detection.
- **Inputs / parameters:** emitter on/off state; scan interval; who else is emitting.
- **Behavior / rules:** Emitting makes you locatable by enemy ESM/RWR to ~1.5× your radar range. The counter: turn the radar on briefly, grab a snapshot of contacts, then **shut it off** — enemy ESM then holds only a stale bearing, not a current fix. In an IFF context, a fast/high contact that is silent while everyone around it emits is itself a red flag.
- **Outputs / effects:** trades own situational awareness for survivability.
- **Edge cases / quirks:** Side-lobe radiation means a non-facing radar can still leak detectable energy. Wrong-band jamming makes a jammer *more* conspicuous, not less.
- **Source:** oF8LwbZSm28 (Electronic Support Measures), 0R6-5oQR-l0 (IFF)
- **Confidence:** High

### IFF / identification reasoning
- **Models:** classifying a contact (friend/neutral/hostile) from kinematics, emissions, and scenario OOB.
- **Inputs / parameters:** detected speed, altitude, formation behavior, emissions (radar type, fire-control vs search), known scenario platform list, detection range (RCS clue).
- **Behavior / rules:** A contact starts as a **bogey**; the operator narrows identity using: **kinematics vs database cruise speeds at altitude** (e.g. 480 kt at 25,000 ft narrows the airframe; speeds atypical for airliners — >~320 kt at altitude — flag a likely military target); **behavior** (tight formation + one aircraft accelerating to catch up suggests a military flight); **emissions** (a **fire-control radar** emission ⇒ almost certainly hostile; civilian aircraft "almost always fly with radars on," so a fast, high, **non-emitting** contact while everyone else emits is suspicious); **detection range as an RCS clue** (detecting far out implies a large RCS; only-when-close implies small); and **logical elimination** (if only one scenario platform has a given radar, the contact must be that platform).
- **Outputs / effects:** drives manual hostile/neutral tagging and whether weapons may engage.
- **Edge cases / quirks:** A determined opponent can fly a fighter at airliner speed to spoof IFF — then fall back to formation/emissions cues or send an interceptor for visual ID. SAM electronics are modeled finely enough to read engine count and size class from the demodulated return.
- **Source:** 0R6-5oQR-l0 (IFF)
- **Confidence:** High

### ESM / contact-emissions classification
- **Models:** passive detection and classification of contacts by their radar/sensor emissions.
- **Inputs / parameters:** the contact's emitting sensors; ESM sensor sensitivity/quality; emission type (search vs fire-control / navigation).
- **Behavior / rules:** CMO models every sensor individually; you can passively detect a contact's emissions and classify what it is from its electromagnetic signature (e.g. "this radar sounds like a civilian ship / civilian aircraft / battleship") — "passive sonar but for radars." The emissions display can show all emissions, fire-control-only, or "all emissions for the selected contact and fire-control-only for the rest." A fire-control emission turns **bright red** as a launch warning.
- **Outputs / effects:** a contact identity / possible-type list; emission warnings.
- **Edge cases / quirks:** Different ESM sets have different sensitivities/qualities. **No emission warning at all if the threat sensor is passive** (e.g. a camera). See *ESM (passive electronic detection)* above for the ~1.5× detect-range rule and the F-22 LPI un-locatable exception.
- **Source:** 5dJfIKiNHj8, oF8LwbZSm28 (Electronic Support Measures), 7mmQ2y11hPc (Tutorial - Radar)
- **Confidence:** Med

### Comms jamming requires the target to actually have a comm device
- **Models:** communications jamming only breaks links between units that possess modeled comm devices; a unit with no comms is treated as permanently in communication.
- **Inputs / parameters:** jammer system type (**Comms Jamming** system — distinct from a Comms Monitoring system and from active noise/barrage jamming); target units' comm-device list (type, band UHF/VHF/HF, secure vs unsecure); the comms network linking units.
- **Behavior / rules:** **Key rule:** select a ground unit, open its Comms tab — if it has **no comm devices**, that unit is **always** considered in communication, so comms jamming has **zero** effect on it (the F-16's comms jammer did nothing while the radar and SAM site had no comms; the SAM engaged normally). To make jamming work you must **add comm devices** to the units (demo added a generic UHF/VHF radio; noted HF is "really insecure"). Once both stations have a (jammable) radio and the jammer is the correct Comms-Jamming type, flying the jammer overhead severs the link: the two units show an **"A" marker with "no comm"** underneath ("no longer on speaking terms"). Comms jamming affects **only** communications — it is not active radar/noise jamming, so the emitting radar still detects the aircraft.
- **Outputs / effects:** when jammed, the two units lose their data link ("no comm" / "A" marker); downstream, the cueing radar's contact is no longer shared, so dependent units (the SAM site) never receive the track and cannot engage on cue.
- **Edge cases / quirks:** A unit with no comm device cannot be jammed (always in comms) — why default ground units appear "immune" until you give them radios. The comms jammer must be the **right** system (the narrator first equipped a "Comms Monitor" by mistake — it doesn't jam). **Ctrl+V** (read-only/peek) mode does **not** let you add/remove a unit's comm devices on the fly. A unit can be told to keep its **"hard line"** (wired) link so it still receives radar signals even when radios are jammed. Comms jamming does not stop the local radar from physically detecting the target.
- **Source:** ffTSj81bjBU
- **Confidence:** High

### Network / data-sharing collapse from severed comms (loss of common operating picture)
- **Models:** contacts are shared to the force-wide map only over the comms network; cutting a sensor's link drops its contacts from the shared picture.
- **Inputs / parameters:** the sensor unit's comms link status; the central-command data network that generates the world map; downstream consumers of the shared track (e.g. a SAM site).
- **Behavior / rules:** When the cueing radar is jammed off the network, its detections stop propagating: the player "can't see this F-16 at all in the world map because this radar has dropped off the network," and central command (which generates the map) no longer receives its readings. Consequently a downstream SAM site with its own radar **off** "doesn't even know there's an F-16 flying over until it sees the contrail with its camera," at which point it may only manage a "parting shot." Tied to real doctrine: "one of the first things they do is destroy all the communications hubs."
- **Outputs / effects:** the jammed sensor's contacts vanish from the shared/world map; units relying on shared cueing go blind and cannot engage until they detect the target with their own organic sensors (large tactical impact — aircraft can overfly undetected).
- **Edge cases / quirks:** The local jammed radar still "sees" the target itself the whole time — only the **sharing** is broken. A downstream unit with its own active sensor could still detect independently (the SAM only went blind because its own radar was off). Visual/camera detection of a contrail can still trigger a last-ditch engagement.
- **Source:** ffTSj81bjBU
- **Confidence:** High

---

## 10. Terrain & Environment Effects on Land Operations

### Land cover — quantitative spotting ranges and weaponeering by cover type
- **Models:** the terrain **land-cover type** under a ground unit changes how easily it is visually spotted and how survivable it is to attack (distinct from macro-elevation masking).
- **Inputs / parameters:** land-cover classification at the unit's location; whether **"effects of terrain type"** is enabled (Scenario editor → scenario features/options); spotter LOS/altitude; attacking weapon type (area/cluster vs unitary bomb). View via View → Land Cover (+ terrain-type legend; the mouse cursor reports the cover type underneath).
- **Behavior / rules:** Holding aspect/altitude constant and flying identical F-16s over identical ground targets, the demo measured **visual detection range by cover type** (all numbers verbatim, nm):
  - **Easiest / detected first, roughly equal (~4.4 → 3.3 nm):** grasslands, snow & ice, croplands, wetlands, barren — open types are all spotted at about the same long range, trending slightly shorter as the ground gets greener/more wooded.
  - **Harder:** woody savanna, then **cropland/vegetation mosaic** (crops dotted with trees) take noticeably longer.
  - **Forest:** detected at about **half** the cropland range — cropland onset ~**3.2 nm** vs forest ~**1.6 nm**. A big deal for recon runs.
  - **Urban / built-up — the standout:** a vehicle in an urban tile may **never be acquired** even on a low overflight; in the demo the F-16 only detected the urban target at **~1.2 nm** after descending to ~417 ft directly over it. Hiding in a city is extremely effective.
  - **Weaponeering / attack:** dense cover sharply changes weapon effectiveness — with **cluster munitions (CBU)** a 12-vehicle M113 group in the **woods** was cut to ~2/12 and savanna fared similarly, but the **urban** group "did pretty well" (survived); re-running with **unitary bombs (Mk-84)** "plastered" the woods and urban groups (total **12× Mk-84 ⇒ ~35 APCs killed**). So **area/cluster weapons** work on open ground while **unitary/penetrating bombs** are needed for dense cover and especially urban.
- **Outputs / effects:** sets the visual-acquisition range for a ground unit by terrain type and the weapon needed to defeat cover; drives where to hide vs bait units.
- **Edge cases / quirks:** Land **cover** is modeled at fine (per-pixel) scale even though micro-**relief** isn't modeled for elevation LOS — so you can tuck a unit into a small hard-to-see patch (e.g. an SA-15 in a dense-town pixel beside an "obvious" T-55 bait in cropland). A **moving** ground unit is easier to detect. Land cover doesn't apply over water (but radar there is still affected by weather/sea state). You must explicitly order the attack (units don't engage dense-cover targets well on their own); a 12-vehicle group is a distributed target, so "kills" are per-vehicle.
- **Source:** 2SJDdTiuRPs (Land Cover)
- **Confidence:** High (detection-range numbers stated verbatim)

### Terrain / land-cover effects on land units (sighting, damage, speed)
- **Models:** the underlying terrain/land-cover type changes how ground units move, are seen, and take damage.
- **Inputs / parameters:** terrain type at the unit's location (e.g. desert, built-up city, crop land, mixed forest, barren/sparsely vegetated); unit type (land units specifically); a "terrain type legend" map setting; mouse-hover terrain readout.
- **Behavior / rules:** CMO2 added a **land cover** terrain layer where the underlying terrain type has real effects on (1) unit sighting/detectability, (2) unit damage, and (3) unit **speed** for land units. Stated qualitatively: **cities slow things down AND can speed things up, and make units a lot harder to see**; **desert is a lot easier to see units in** than cities. Open desert lets you "see very very far," making high-precision weapons "way too effective." Mixed forest gives near-zero open spots / heavy concealment. No numeric modifiers given in this source.
- **Outputs / effects:** modified land-unit movement speed, detection probability/range, and damage outcomes depending on the terrain class under the unit.
- **Edge cases / quirks:** Devs explicitly frame this as extending the established hydrographic/oceanography water modeling onto land. Land-cover "splashes" (where people live, i.e. cities) can be used as a metagame hint for likely SAM placement. A terrain-type legend (map setting) maps colors to terrain classes; hovering the mouse anywhere reads out the terrain type. The verbatim detection-range numbers (open types ~4.4→3.3 nm, forest ~1.6 nm vs cropland ~3.2 nm "half," urban as low as ~1.2 nm) and the weaponeering result (**area/cluster weapons** on open ground vs **unitary/penetrating** weapons for dense cover/urban) are stated in *Land cover — quantitative spotting ranges and weaponeering by cover type* above.
- **Source:** 5dJfIKiNHj8, 2SJDdTiuRPs (Land Cover)
- **Confidence:** Med

---

## 11. Engagement Control — Doctrine, ROE, Attack Modes & WRA

### Ground/surface units require "Engage opportunity targets," a mission, or a manual order
- **Models:** land and surface units do **not** autonomously open fire on detected enemies unless explicitly permitted — modeling units not giving away their position. (This is the single most-emphasized engagement rule across three transcripts.)
- **Inputs / parameters:** the per-unit/per-group/per-side **"Engage Opportunity Targets"** doctrine setting (Yes/No; reachable via **Ctrl+F9 / Ctrl+Shift+F9**); assignment to a mission that allows engaging ground vehicles (create via **Ctrl+F11**, e.g. a Ground Patrol / ground-strike mission); a manual attack order; WRA permission; ROE posture; target identification (hostile classification).
- **Behavior / rules:** By default ground vehicles will **not** automatically engage even an enemy sitting right next to them — they lack the system that allows automatic engagement, and are "built in such a way they're not supposed to give themselves away." To get autonomous fire you must either set **"Engage Opportunity Targets" = Yes**, or put them in a mission that lets them patrol and engage ground vehicles. **WRA permitting the shot is necessary but not sufficient** — even with WRA fully correct (positively identified, automatic firing range, land-contact = automatic) and **even with ROE posture set to "Free,"** the unit sits idle until the opportunity-target toggle is enabled. Once enabled, the unit loads, calculates firing solutions, and engages detected hostile targets on its own. A manually ordered attack (**F1** → click target, or **Shift+F1** to allocate) **always works regardless** of the toggle. Rule of thumb: "anything that is a Surface Target will not be engaged unless you tell it to or it's allowed to do opportunity fire."
- **Outputs / effects:** whether idle ground/surface units begin autonomous fire; both sides must independently enable it to get a mutual exchange (one side only = a one-sided steamroll).
- **Edge cases / quirks:**
  - **Hard exception:** **ship vs ship always auto-engage.** But **ship-vs-surface(land)** and **surface(land)-vs-ship** do **not** auto-engage — they need the opportunity-target toggle.
  - Firing is also gated by **detection** (stationary/camouflaged enemies may never be engaged) and by **side posture** (target must be Hostile); marking a contact hostile causes mission-tasked units to begin shooting at it.
  - **Warning for aircraft:** enabling opportunity engagement makes aircraft go "willy-nilly" and shoot anything, "even if it's something stupid like a building or a hut."
  - When tasking via mission, allocate the units (avoiding multi-mission units).
  - An **OODA-loop** limitation throttles how fast units react/decide.
- **Source:** miMhUGP6fGg, ILGHFWHn6Rk, JqZYvpCP7ik
- **Confidence:** High

### Attack types: Automatic, Manual, Bearing-only
- **Models:** three engagement modes differing in AI control vs player weapon selection vs blind fire.
- **Inputs / parameters:** a target (or a bearing); the attacking unit; for manual — chosen weapon type and quantity per target.
- **Behavior / rules:**
  - **Automatic (F1 / Auto engage target):** hand the target to the unit AI, which moves into engagement range and fires the weapon(s) it judges best, in the quantity it judges right (e.g. 2 Harpoons vs a civilian ship, up to ~40 vs an Aegis destroyer).
  - **Manual (Shift+F1 / Manual engage target):** you pick the exact weapon and how many per target via a dialog (firing platforms top-left, selected targets bottom-left, weapons-on-platform in the middle).
  - **Bearing-only (blind fire):** click a direction, no track needed; only some weapons support it (anti-ship missiles like Harpoon that self-acquire, and many torpedoes) — you cannot bearing-fire an AMRAAM.
- **Outputs / effects:** weapon launch orders / queued attacks.
- **Edge cases / quirks:** Auto attack can decline to fire (e.g. against a civilian target per ROE; or no high-quality track). **Shift+1** on a stalled auto attack shows **why** it isn't firing. Weapon/target compatibility is enforced (an aircraft can only be hit by SAM-type weapons, not by a Harpoon). **Green-highlighted** weapons can fire now; non-green can still be **queued** (e.g. double-click 5× 5-inch) and will fire when a fire-control solution exists, unless a time-limit checkbox cancels the attack after a timeout. **Destroying a target cancels all attacks queued against it.**
- **Source:** FTRQtZg_jwk
- **Confidence:** High

### Manual weapon allocation across multiple targets
- **Models:** distribute N weapons-per-target across a multi-selected target set.
- **Inputs / parameters:** the selected weapon system; quantity per target; a band/shift-selected target list.
- **Behavior / rules:** In the manual attack dialog, set "weapons per target" (e.g. 1), select all targets, and assign — yielding that many of the chosen weapon at **each** selected target (e.g. one Harpoon per ship across many ships), provided you have enough weapons. Targets can be band/shift-selected (Shift+F1 then drag).
- **Outputs / effects:** per-target weapon assignments / simultaneous salvo orders.
- **Edge cases / quirks:** Ships can salvo many missiles at once; missiles can be pre-programmed with legs so a salvo arrives from different angles.
- **Source:** FTRQtZg_jwk
- **Confidence:** High

### Weapon Release Authorization (WRA) — per-target / per-bomb allocation
- **Models:** WRA controls how many weapons go to each contact, either via manual per-bomb assignment or via rules that cap weapons per target so ordnance isn't wasted overkilling one aim point.
- **Inputs / parameters:** WRA settings per contact type (e.g. land contact, runway facility, mobile target); "how many we need" = units/weapons per target; weapons-per-strike count (e.g. fire 2 of 4 Mk-84s); ROE/Doctrine context (**Ctrl+Shift+F9** / RWR-WRA panel).
- **Behavior / rules:** **Manual mode:** select a target, select the weapon, and allocate exact bombs (e.g. assign 8 bombs to each of several target clusters across multiple B-52s — "a separate bomb target for each bomb on board"). With **4 B-52D** each carrying many Mk-84s and per-bomb targeting, effectiveness roughly **doubled** vs an earlier F-15E strike while using about half the ordnance type-for-type. Careful WRA editing "spreads the weaponry out" so you "don't drop everything on the same target."
- **Outputs / effects:** number of weapons committed per target; overall spread/effectiveness; ordnance economy.
- **Edge cases / quirks:** Manual per-bomb allocation is an enormous workload ("legendary amount of workload"). You can also set WRA to **avoid** striking specific things (e.g. not the runway). Unguided bombs at high altitude still scored well here purely because targeting was spread.
- **Source:** fh1QmQVLiBs
- **Confidence:** Med

### WRA "engage 1 unit only" + in-flight weapon reservation = maximum target spread
- **Models:** setting weapons-per-target to a single unit, combined with the rule that a target with a weapon already in the air cannot be re-engaged, forces a flight to scatter its bombs across many distinct targets.
- **Inputs / parameters:** WRA "how many we need" = **1 unit** per contact; weapons-per-attack reduced (e.g. fire only **2 of 4** Mk-84s); a tightly-clumped wide formation of shooters (**24 F-15Es**); standard attack-order timing (delay the attack until close to keep multiple bombs simultaneously airborne).
- **Behavior / rules:** Set WRA to engage only 1 unit so "nobody can double-team our target." Because a target with a bomb still in flight is **locked out** ("nobody else are allowed to attack those other targets" until "everything has been deployed"), each shooter is pushed onto a fresh target. Firing only 2 of 4 bombs per pass and ordering the attack at the last second keeps many bombs mid-flight at once, so 24 aircraft hit ~24 different aim points. Result: attacks "beautifully spread out... everywhere throughout this base," nearly every parked aircraft destroyed (~18 kills, beating the ~12–20 expected).
- **Outputs / effects:** each target engaged by exactly one shooter per cycle; maximally dispersed impacts; very high kill spread across the base.
- **Edge cases / quirks:** "Very very very critical" to set 1-unit-only or "my little spam will not work correctly." Reserving partial ordnance (2 of 4) lets the same flight loop back for additional dispersed passes. Aircraft may drift wide / lose altitude on their own (could be manually overridden). **Realism caveat:** in a live fight the enemy shoots back, so you can't leisurely orbit and re-attack.
- **Source:** fh1QmQVLiBs
- **Confidence:** High

### Independent-action strike targeting (prevents whole flight stacking one target)
- **Models:** how a single strike mission distributes aircraft across multiple targets instead of all tracking the same one.
- **Inputs / parameters:** the mission setting **"Independent action"** (per-mission flag); flight composition (e.g. 24 F-15Es as one group); a multi-target list; optional Time-on-Target and inter-element separation (e.g. 30 s).
- **Behavior / rules:** Without independent action, "everybody is going to track the same target" (undesired). Enabling it makes elements pick targets independently so strikes spread out and hit "almost randomly" across the target set. Natural sub-grouping still occurs: flights arrive from different directions, each sub-group concentrating on a handful of facilities (an "A for coordination"). Example: an independent-action F-15E strike damaged ~6–9 of the airfield's aircraft.
- **Outputs / effects:** target assignment spread across many aim points; resulting kills distributed across the base.
- **Edge cases / quirks:** "Really really important" to enable independent action or you get target stacking. You can instead split each element into separate missions for total control, but that is slow and micromanagement-heavy. Off-axis attack and 30-second separation were available but didn't materially change the spread.
- **Source:** fh1QmQVLiBs
- **Confidence:** Med

### Cooperative (datalink) engagement and silent (radar-off) launch
- **Models:** datalinked aircraft can share tracks so one shooter fires on another sensor's track, including a "cooperative engagement" where shooters keep radars **off** and rely on an off-board sensor.
- **Inputs / parameters:** datalink between friendly aircraft; an off-board sensor providing the track/bearing (AWACS, a leading fighter, or a wingman's radar); radar on/off state; bearing precision/confidence of the track; engagement order ("follow the missile straight in," automatic-evasion on/off, "fire at will").
- **Behavior / rules:** Because aircraft are datalinked, a shooter can launch on a track held by another platform — e.g. an F-15E got the firing solution from F-16s' radar ("using the F-16s to datalink his attacks"), so "my F-16 is actually the one taking the shot." For a **cooperative engagement** the shooters keep radars off (so they don't expose via their own emissions) and fire using the off-board track. **ROE gate:** aircraft "won't engage unless they're confident that we're hostile." When the AWACS bearing was too coarse ("too much ambiguity in our bearing"), the cooperative shot was **disallowed** and the fighters had to close into danger range, flip their own radars on at the last second, then call automatic evasion.
- **Outputs / effects:** whether a remote/cooperative launch is permitted; which platform actually fires; emissions exposure; success of the silent engagement.
- **Edge cases / quirks:** Requires sufficient bearing/track precision and identification confidence — a weak AWACS bearing blocks the cooperative shot. Disabling automatic evasion ("follow the missile straight in") is "extremely dangerous" but needed for the strategy to work. Combined with the wide "bulldozer" frontage, one flight keeps pressure on while a follow-up unit (e.g. an F-15EX "kill shooter") closes for the kill.
- **Source:** trk7WTa9SzI
- **Confidence:** Med

### Anti-radiation / active-radar fire permission (emitter-only engagement)
- **Models:** ARM-type and radar-cued weapons can only engage **emitting** targets; a SAM's ability to intercept a small fast inbound depends on its radar resolution.
- **Inputs / parameters:** the target's active-radar emission state (on/off); SAM fire-control radar resolution; incoming target size and speed; engagement geometry (head-on vs tail chase); altitude/air density.
- **Behavior / rules:** To fire an anti-radiation weapon (e.g. Standard ARM) at a ground emitter the target must have an **active** radar signal — the F-4 could only be granted a fire solution (**Shift+F1** attack) against units that were actively emitting (the radiating Flat Face, and the SA-2 once its fire-control radar was switched on). The SA-2 attempts to intercept the inbound ARM but "doesn't have the resolution to hit something that small and fast," so interception is very unlikely (it cycles trying to acquire). Tail-chase shots against a fleeing fast jet are "very unlikely" to connect; a missile chasing into thinner (higher) air can run out of energy and **stall**.
- **Outputs / effects:** a fire solution is granted only vs emitters; low probability of intercept vs small/fast inbound; tail-chase / high-altitude intercepts frequently miss or stall.
- **Edge cases / quirks:** Switching a SAM's fire-control radar **on** makes it engageable by ARMs (deliberately done in the demo). A missile can visibly stall climbing into thin air during a stern chase. No exact Pk numbers given (qualitative "very unlikely").
- **Source:** eame83G2Asw
- **Confidence:** Med

### Active-radar / self-guiding missile terminal homing (e.g. Harpoon)
- **Models:** sea-skimming anti-ship missiles fly to an activation waypoint, switch on their own seeker, then attack whatever they detect.
- **Inputs / parameters:** an activation waypoint; the missile's onboard surface-search radar; targets within the seeker's footprint; decoys/chaff.
- **Behavior / rules:** A Harpoon-type weapon flies out, and at its activation waypoint turns on its own surface-search radar and tries to kill anything it detects in that area. This enables fire-and-forget and bearing-only launches. Decoys can defeat it: chaff can break the lock, after which the seeker may **re-acquire** and lock onto a different (possibly wrong) nearby ship.
- **Outputs / effects:** autonomous terminal target acquisition; possible mis-targeting onto decoys/other ships.
- **Edge cases / quirks:** Historical Exocet/Atlantic Conveyor decoy-induced re-acquisition cited as illustration. CMO models chaff/decoys, towed decoys (ALE-50/-55), and Nulka-type rocket decoys.
- **Source:** FTRQtZg_jwk
- **Confidence:** Med

### Illumination / fire-control channel limits (SAM saturation)
- **Models:** ships / SAM sites have a finite number of illumination (fire-control) radars limiting simultaneous engagements.
- **Inputs / parameters:** number of illumination/fire-control channels per platform; number of incoming targets; channel/radar damage state.
- **Behavior / rules:** A platform can only guide missiles at as many targets as it has illumination channels. Example: a Burke/Aegis ship can **track up to ~64** incoming but has only **three** illumination radars, so it can only **shoot at three targets at a time** — forcing you to allocate missiles to channels when e.g. 20 missiles are inbound. This finite-channel limit is a primary way SAM defenses get penetrated/saturated.
- **Outputs / effects:** a cap on concurrent missile engagements; illumination vectors drawn to targets.
- **Edge cases / quirks:** Radars and illumination channels can be **damaged**, further reducing simultaneous engagements. Illumination = pointing an active sensor/fire-control radar at a target (shown as a line). Passive sensors (cameras/IR) give no emission warning. A fire-control radar turning on shows bright red in the contact-emissions display.
- **Source:** 5dJfIKiNHj8
- **Confidence:** High

### No-fly / exclusion zones and pathfinding
- **Models:** type-restricted map zones that units may not enter and will route around.
- **Inputs / parameters:** a zone polygon (red area); the restricted unit type (e.g. air vs surface); applies to both player and AI units.
- **Behavior / rules:** A no-fly/exclusion zone forbids entry for the affected unit type; ordering a unit across it makes it pathfind **around** (example: an aircraft rerouted to the north). Zones are set per unit type (you can forbid flying but allow surface transit, or vice-versa). Both player and AI units obey. Permissions can also be inverted (everything blocked except where allowed), "like a Unix permission."
- **Outputs / effects:** path re-routing; entry prohibition.
- **Edge cases / quirks:** If a designer forgets to bound the world, a unit can take an absurdly long way around. Crossing into another country isn't inherently penalized unless that side is set to defend. Commonly used to keep neutral countries out of a fight, or placed around SAM sites to keep friendly aircraft clear.
- **Source:** 5dJfIKiNHj8
- **Confidence:** High

---

## 12. Weapon Delivery — Release Envelopes & Bombing Accuracy

### Weapon launch-altitude envelope (per-weapon min/max release altitude) & drop-floor enforcement
- **Models:** each weapon has a permitted release-altitude window (an AGL floor plus a sea-level ceiling); if the carrier is outside it the weapon cannot be released.
- **Inputs / parameters:** aircraft altitude AGL and ASL; the weapon's min-altitude attribute and max-altitude attribute (database). Examples: **Mk-82 minimum = 800 ft AGL**; Mk-82 launch window = **800 ft AGL (floor) → 65,000 ft ASL (ceiling)**.
- **Behavior / rules:** The weapons page shows a launch-altitude envelope, deliberately mixing reference frames (floor AGL, ceiling ASL). A release is valid only when the aircraft is inside this window. When ordered too low (e.g. a manual override to 500 ft) and run, the aircraft simply does **not** drop its bombs — diagnosed "too darn low" because 500 < the 800 ft AGL floor (so you "can't even drop the bombs lower than a thousand feet" effectively). Sending an aircraft to "minimum altitude" makes it too low to safely drop.
- **Outputs / effects:** weapon withheld (retained) until the altitude is inside the envelope; the attack aborts silently rather than dropping below the floor.
- **Edge cases / quirks:** Floor expressed AGL, ceiling expressed ASL within the same envelope. (Combine with the horizontal-range gate below — both must be satisfied.)
- **Source:** RDE4S8kzZTQ, O4HTj5ct7yg
- **Confidence:** High

### Weapon release envelope — horizontal range + altitude profile gate
- **Models:** a weapon refuses to fire unless the firing platform satisfies that weapon's specific range **and** altitude (and other profile) constraints.
- **Inputs / parameters:** horizontal range to target vs weapon max/min range; launch-platform altitude vs the weapon's required release altitude; weapon-specific delivery profile.
- **Behavior / rules:** When an aircraft ordered to drop CBUs "did not drop," diagnostics showed the shot rejected as "out of range horizontal" **and** for altitude: the weapon required a specific release altitude. Stated value: "I need to be 4,000 ft"; the fix was to set altitude to 4,000 ft (it read 3,999) via Unit Properties, then close the horizontal range slightly, after which the weapon released. Generalization: "sometimes these weapons have very very specific profiles."
- **Outputs / effects:** the weapon is withheld until both horizontal range and altitude satisfy the profile, then releases and impacts.
- **Edge cases / quirks:** Being **1 ft** off (3,999 vs 4,000) and slightly out of horizontal range was enough to block release until corrected. Profiles are per-weapon — no universal threshold.
- **Source:** atcxgWfXnX4
- **Confidence:** Med

### Bombing accuracy vs release altitude (unguided bombs, probability-of-hit)
- **Models:** a strike aircraft's per-bomb hit probability on a ground target degrades sharply as release altitude increases (iron-bomb ballistics + bombsight quality); GPS/laser guidance blunts the penalty.
- **Inputs / parameters:** release/attack altitude; bomb type (unguided Mk-82 vs GPS-guided); aircraft bombsight/avionics quality (F-16CM block 52 has GPS guidance making it "a little bit more accurate"); per-bomb probability-of-hit value shown in the weapon-damage/message log; wind ("no wind" noted as a simplifying condition).
- **Behavior / rules:** Per-bomb hit probability rises sharply as the aircraft flies lower. Observed test (5 F-16s, 5 target houses; lower survivors = better strike): **~36,000 ft → 3.5/5 survived; 25,000 ft → 4.7/5 survived (essentially no real damage); 15,000/12,000 ft → 3.9/5 survived; 2,000 ft → 0.8/5 survived; 1,000 ft → 0.2/5 survived.** Summary: "above twelve thousand feet" all altitudes behave about the same (only ~1 of 5 killed), then the average "spikes" once you drop to ~2,000 ft, and "anything between 1000 and 2000" is roughly the same high-effectiveness band. High-altitude unguided drop: probability-of-hit ~**20%** with "high deflection shot, no effect"; the same shot at 1,000 ft estimated at roughly **75% Ph**. A separate demo: 12 Mk-82s from high altitude all missed ("near missed, 1,000 ft off"), but re-running from ~12,000 ft produced a direct hit on the depot.
- **Outputs / effects:** number of bombs that hit/miss; resulting structural damage; messages logging per-weapon Ph and qualifiers like "high deflection shot / no effect."
- **Edge cases / quirks:** The relationship is non-linear / not monotone in the test noise (36k and 12–15k are similar; the big improvement appears only below ~2,000 ft). **GPS-guided** bombs stay "fine" at high altitude — drop, turn away immediately, and leave. **Laser-guided** bombs require line of sight, so the AI flies **under** interfering weather/cloud to keep the target visible — which pushes the aircraft lower (into AAA range). A single run is noisy; a precise number needs many runs.
- **Source:** RDE4S8kzZTQ, O4HTj5ct7yg
- **Confidence:** Med

### Automatic weapon-release altitude selection (auto-attack picks its own altitude)
- **Models:** in a fully automatic attack the AI chooses the release altitude it considers optimal for accuracy, ignoring threat exposure.
- **Inputs / parameters:** target; weapon type; automatic vs manual attack mode; current aircraft altitude.
- **Behavior / rules:** Ordered to attack automatically (**F1** → select target) with no manual altitude, the aircraft positions itself ("puts the pipper on the target," CCIP/CCRP mode) and releases at an altitude the game deems optimal. In one strike example an F-16 ran its whole attack at ~**1,460 ft AGL** on its own. The AI also will **not** fire if its geometry is wrong — flying at an oblique to the target it "never actually got the shot" and overflew without releasing. **Snapping a unit to automatic at a new waypoint re-enables this auto behavior.**
- **Outputs / effects:** chosen release altitude and run-in geometry; whether/when bombs are released.
- **Edge cases / quirks:** Auto altitude can be tactically terrible (e.g. 1,460 ft AGL inside ZSU-23-4 range = aircraft destroyed); a wrong (oblique) approach causes a dry overfly with no release; hitting a new waypoint re-snaps the unit back to automatic mode.
- **Source:** O4HTj5ct7yg
- **Confidence:** High

### Manual override / cancel-automatic to force a release at a chosen altitude
- **Models:** to make an aircraft release at the operator's altitude, order the attack then cancel the automatic attack so it executes at the manual altitude.
- **Inputs / parameters:** the manual altitude order; the automatic-attack toggle state.
- **Behavior / rules:** After setting the desired drop altitude (via **F2** waypoint editing), order the attack and then **cancel the automatic attack**, which lets the aircraft deploy its weapons at the manually-chosen altitude rather than the auto-optimal one. Because reaching a new waypoint re-snaps a unit back to automatic mode, the operator must toggle it off again so "nothing tells it not to do what it's about to do."
- **Outputs / effects:** the aircraft releases at the operator-specified altitude instead of the AI default.
- **Edge cases / quirks:** Hitting a fresh waypoint reverts the unit to automatic mode, undoing a manual-off toggle.
- **Source:** O4HTj5ct7yg
- **Confidence:** Med

### Smart AI weather/cloud handling for guided weapons
- **Models:** aircraft AI will fly **below** an interfering cloud layer to preserve line of sight for LOS-guided weapons.
- **Inputs / parameters:** weather/cloud layer altitude; weapon guidance type (e.g. a laser-guided bomb requiring LOS).
- **Behavior / rules:** If a weather pattern interferes, aircraft "know to stay underneath it" when they need a line-of-sight weapon such as a laser-guided bomb. Doing so keeps the target visible but forces the aircraft lower (into threat/AAA range).
- **Outputs / effects:** the aircraft chooses an altitude below the cloud deck; LOS maintained for the weapon.
- **Edge cases / quirks:** Staying under the clouds puts the aircraft "right in the line of fire" of short-range AAA like the ZSU-23. **Full visual/EO weather-gating model:** clouds are a **single opaque layer** at one density bar occupying an altitude band (e.g. light high clouds 20,000–23,000 ft); you **cannot see through** it with visual/EO sensors — only when the sensor is **below** the layer does visual detection return to normal range, and an EO/IR-seeker weapon still "must detect the target prior to firing" and cannot engage through cloud (radar/low-frequency still works through it). **Rain:** powerful low-frequency EW radars "burn through" rain with essentially no range loss, but high-frequency/fire-control/X-band radars lose markedly (a weak fighter radar dropped from ~8.1 nm clear to ~4–4.5 nm in heavy rain — roughly half); rain **blocks** IR, laser, and visible light, causing "weapon must detect target prior to firing" failures. Both rain and cloud occupy a height band — an aircraft above the layer is unaffected.
- **Source:** O4HTj5ct7yg, yhs02DUz9bg (Cloud Cover's Effects on Spotting), P6UAdBqTUhk (Effects of Rain on Detection)
- **Confidence:** Med

### Manual point-targeting of a ground location (Ctrl+F1 / bombardment)
- **Models:** a weapon can be ordered to attack an arbitrary map point rather than locking a detected unit, enabling indirect fire at coordinates.
- **Inputs / parameters:** the selected firing platform; a chosen ground point (not a contact); the chosen weapon; quantity allocated.
- **Behavior / rules:** Press **Ctrl+F1**, click a ground point, and order an attack at that point. The munitions are "manually targeted... not locked onto" any contact there — they impact the chosen coordinates regardless of what is detected. The narrator states this Ctrl+F1 point-attack "to this day remains the most reliable way" to simulate a preparation/bombardment of an area you cannot see, especially combined with a wide-spread ballistic weapon. (Contrast: ordering an attack against a Pre-Planned Target object, which is a fixed reference point.)
- **Outputs / effects:** rounds delivered to the selected coordinates; nearby unspotted units affected via collateral/spread; pre-planned target objects can be very high-HP markers (e.g. **100,000 damage points**) that merely serve as aim references and may not be destroyed.
- **Edge cases / quirks:** A pre-planned target with 100,000 damage/hit points effectively cannot be destroyed ("not going to kill one of these even with a nuke") — it functions only as an aim reference, so the real effect is on surrounding units. The workflow pairs well with Lua scripting to spam munitions across an area.
- **Source:** atcxgWfXnX4
- **Confidence:** High

---

## 13. Weapon Physics — Missile Energy, Lofting, Speed Bands & Range

> Three transcripts (`8WqQ-alekog`, `dui_lPsECfE`, `trk7WTa9SzI`) cover the same
> missile-energy physics from different demos; they are merged here, keeping all stated
> numbers from each.

### Missile motor burn duration (boost vs coast phases)
- **Models:** real modern missiles burn their rocket motor only briefly, then coast on momentum to the target.
- **Inputs / parameters:** weapon type/profile (boost-only vs continuous/sustain burn); time since launch; gravity.
- **Behavior / rules:** Most modern missiles fire their motor for only about **10 to 20 seconds**, then it burns out; the weapon then coasts unpowered on remaining momentum/energy. The narrator contrasts the **AIM-120B** as a "continuous burn" (and shorter range), implying CMO models distinct burn profiles per weapon. Two archetypes: (1) **boost** — large thrust to accelerate fast, then coast; (2) **boost-sustain** — burns to push through the transonic high-drag region past Mach 1, then sustains toward the target. During boost the missile spends energy climbing; after burnout it only loses energy (to drag and gravity) until intercept.
- **Outputs / effects:** the missile's speed/energy state transitions from accelerating (motor on) to decaying (coasting); determines speed available at intercept.
- **Edge cases / quirks:** AIM-120B = continuous burn (vs boost-glide A/C/D variants); the AIM-7 uses boost-then-coast and is called out as slow with very short effective range.
- **Source:** 8WqQ-alekog, dui_lPsECfE
- **Confidence:** Med

### Atmospheric density vs altitude (drag on missiles/aircraft)
- **Models:** air gets thicker at lower altitude, thinner at high altitude; drag scales with density.
- **Inputs / parameters:** altitude (above sea level) of the missile/aircraft along its flight path.
- **Behavior / rules:** Air density increases as altitude decreases. A missile flying low fights much higher drag; atmospheric density at high altitude is "only about **10 to 15%** of what it was" at low altitude. Low/transonic flight produces "transsonic drag" that "sucks the energy right out of" the weapon. A weapon fired from low altitude must first climb through the thickest air (fighting both gravity and drag), losing most of its energy before burnout; the same weapon fired high wastes almost none on the climb. On re-entry into thick lower air the (unpowered) weapon gains speed from gravity but then slows in the denser air and heats up.
- **Outputs / effects:** drag force / energy-loss rate; effective range; intercept speed at the target.
- **Edge cases / quirks:** Numbers are qualitative except the "10–15%" figure; the "tropopause" is referenced as where re-entry speed-up begins.
- **Source:** 8WqQ-alekog
- **Confidence:** High

### Missile speed bands by altitude (database table & kinematic gates)
- **Models:** a missile's achievable top speed depends on the air-density band (altitude) it flies through, catalogued in the database; identical missiles perform very differently high vs low.
- **Inputs / parameters:** the weapon kinematic table — discrete altitude bands with a max speed per band; current launch/flight altitude; air density.
- **Behavior / rules:** The weapon record exposes "different speeds capable at different altitude bands" at the bottom of the weapon detail. **AMRAAM:** below ~**12,000 ft** the top speed is capped at **1,620 kt**; in the **36,000 ft+** band the cap is much higher ("not quite double but pretty close"). A separate demo's example missile lists peak Mach by altitude: around **36,000 ft → Mach 4.62**; a little lower loses "almost .7 Mach"; below ~**10,000 ft** peak speed is only about **Mach 2.6**. The achievable speed drives achievable range — a missile that cannot reach its top speed cannot reach its rated max range. In the 3D track view a high-altitude AMRAAM accelerated to ~**2,500 kt**; a low-altitude shot pushing through thick air climbed slowly and bled to ~**Mach 1.5** then stalled.
- **Outputs / effects:** per-shot achievable peak velocity, and downstream achievable range / time-to-target; the missile may stall short of the target.
- **Edge cases / quirks:** Air density is explicitly the driver — the same missile is "very capable in thin atmospheres" and weak when forced through thick air. The **AIM-7** is much slower with very short effective range (~38 mi listed; narrator estimates lucky hits ~10 mi).
- **Source:** dui_lPsECfE, 8WqQ-alekog
- **Confidence:** High

### Lofting / boost-then-coast trajectory
- **Models:** air-to-air missiles burn their motor early then coast ballistically; many **loft** (climb high, then dive) to extend range, rather than flying a flat constant-speed path.
- **Inputs / parameters:** missile propulsion type (boost vs boost-sustain); launch altitude; target altitude/range; motor burn duration; gravity.
- **Behavior / rules:** On launch a lofting missile (e.g. AMRAAM) burns the whole motor, gains altitude, arcs over ("bent itself over"), then begins a terminal **descent** diving back onto the target using gravity. Fired from high altitude it climbs as much as it can while the motor burns, reaching very high apogees (examples: ~**76,000 ft**, ~**80,000 ft**, burnout observed at ~**72,000 ft**), then coasts over the top on a "gentle ballistic trajectory" and dives. The loft lets the weapon spend most of its flight in thin air at high speed, arriving much faster (Mach 3–4 intercepts) than a low shot. A "partial loft" gives modest range gain.
- **Outputs / effects:** a curved (arc) flight path; altitude gain then terminal dive; remaining kinetic energy at intercept.
- **Edge cases / quirks:** **Loft only pays off near max range and/or when the missile spends most of its flight in thin air.** Firing a lofting missile at a target well inside max range (e.g. <½ rated range) **wastes** the loft: it climbs through thick air, bleeds all energy on the way up, then must go "uphill" and arrives with no energy. Lofting against a low-altitude target forces the missile to climb into and then descend through the thick lower atmosphere.
- **Source:** dui_lPsECfE, 8WqQ-alekog
- **Confidence:** High

### Energy bleed / stall in dense atmosphere after motor burnout
- **Models:** once the motor burns out, a coasting missile loses speed rapidly when passing through (or descending into) dense lower atmosphere and can stall before reaching even a close target.
- **Inputs / parameters:** post-burnout (coasting) state; altitude band / air density along the remaining path; target maneuver state; range remaining; gravity.
- **Behavior / rules:** After burnout the missile relies on momentum plus gravity; in thick (low) air drag bleeds energy fast. Observed: a shot from ~**12 nmi** dropping through atmosphere slowed to ~**Mach 1.5** ("critically low") then completely **stalled** before reaching a non-maneuvering target only 12 nmi away; another from ~**13 nmi** also failed; a shot from ~**7 nmi** retained energy (~**Mach 1.9**) and was on track, though one such shot still ran out of energy. Effective kill range against the **same** target can collapse to single-digit nautical miles depending on geometry/altitude.
- **Outputs / effects:** the missile decelerates, may stall ("no joy / missile stalled"), and fail to intercept even when nominally "in range."
- **Edge cases / quirks:** **Heavier/bigger missiles** (e.g. off SAMs, an SM-2 by weight comparison) "don't care" — they resist this energy bleed far better than the light AMRAAM. Going low is only "half right" as a defense because heavy SAM missiles still reach you. Targets here were non-maneuvering; a maneuvering target is even harder.
- **Source:** dui_lPsECfE, 8WqQ-alekog
- **Confidence:** High

### Missile energy depletion at long range (wasted long-range shots)
- **Models:** a missile fired beyond its effective range can run out of kinetic energy before reaching the target and miss, even with a good initial lock.
- **Inputs / parameters:** launch range vs the missile's effective/no-escape range; target maneuvering (turn-and-run); missile motor energy.
- **Behavior / rules:** Firing AMRAAMs "a little bit too far outside my maximum range" while the enemy fires then "turn around and run" causes the missiles to "run out of energy" and fail to kill; the fight then devolves into a close-range dogfight ("down to the dogfight missiles"). Launch range strongly affects whether the missile retains enough energy to catch a fleeing target.
- **Outputs / effects:** missile hit vs miss (energy-starved fly-out); depletion of the limited missile loadout.
- **Edge cases / quirks:** Both sides have finite missiles ("we don't have an unlimited supply"), so wasted long-range shots leave you reliant on guns. Defensive "turn and run" after firing is the typical modern BVR behavior that bleeds the attacker's missile energy.
- **Source:** trk7WTa9SzI
- **Confidence:** Med

### Effective vs maximum (database) range — low-altitude range collapse
- **Models:** a weapon's catalogued max range is achievable only in ideal (high-altitude) geometry; real auto-fire launch ranges are far shorter and computed dynamically.
- **Inputs / parameters:** launch altitude; target altitude; the weapon's max range.
- **Behavior / rules:** The **AIM-120D** is listed at almost **90 miles** max range, but in the worst case (both aircraft low, ~**500 ft** shooter / ~**200 ft** target) the AI fighter only auto-fired at about **45 nautical miles** — roughly **half** the maximum. As shooter/target altitude rose, the auto-fire range increased: ~**65 nmi** (shooter at 40,000 ft), ~**64 nmi** (both high), up to **max range minus ~6–7 nmi** (both at ~45,000–50,000 ft). CMO computes a dynamic engagement range from launch/target geometry rather than always using the database max.
- **Outputs / effects:** the range at which the AI actually launches; whether a shot is offered/valid.
- **Edge cases / quirks:** Low-low geometry roughly halves usable range; "ideal" high-high geometry approaches the database maximum.
- **Source:** 8WqQ-alekog
- **Confidence:** High

### DLZ (Dynamic Launch Zone / No-Escape) vs maximum indicated firing range
- **Models:** being inside the max-range ring does **not** mean a hit is achievable; the achievable-hit zone (DLZ) is tighter, and a target can simply outrun a low-energy missile.
- **Inputs / parameters:** weapon max firing range (a red band/ring); the DLZ envelope; target aspect/closure (turning nose-on reduces signature); target speed vs missile residual speed; WRA range mode (**Automatic Firing Range** vs **No-Escape Range**; a band between the two numbers is "almost optimum").
- **Behavior / rules:** Max firing range is dictated by the red band on the engagement display and represents a best-case (far + favorable altitude) shot. WRA can be set to **Automatic Firing Range**, **No-Escape Range**, or anywhere between (the in-between band is near-optimal). Even with No-Escape **off**, a manual attack ordered outside DLZ range is **blocked** because the weapon physically can't hit; the sim also lets you "order an attack that ignores the DLZ." The shooter must still get a radar lock before firing; with no Cooperative Engagement Capability each fighter must lock its own target (CEC, e.g. F-35s, could bypass this).
- **Outputs / effects:** whether a launch is permitted/feasible; whether the missile can actually run the target down.
- **Edge cases / quirks:** Targets dropped off radar when they put their nose on (minimum radar signature) even though in visual range. A target right next to you can still be "out of DLZ range" if it's flying away faster than the missile's residual speed ("he can outrun the missile"); when it turned back toward the shooter the shot became feasible. **At short range an AIM-9 is a better missile than the AMRAAM.**
- **Source:** dui_lPsECfE
- **Confidence:** High

### No-Escape-Zone (NEZ) launch option
- **Models:** a launch-doctrine setting that withholds launch until the target is within the weapon's no-escape (kinematically un-evadable) range rather than at max range.
- **Inputs / parameters:** WRA/launch setting toggled to **"No Escape Zone launches"** (via the **Ctrl+Shift+F9** doctrine panel); also an "ignore plotted course when attacking" option.
- **Behavior / rules:** The presenter explicitly orders aircraft "to be using the No Escape Zone launches," pairing it with the wide bulldozer formation so shots are taken at higher-Pk ranges. Firing "a little bit too far outside my maximum range" wastes missiles that "run out of energy" — motivating NEZ launches for effective shots.
- **Outputs / effects:** missiles launched only inside the no-escape zone (higher hit probability / less wasted ordnance).
- **Edge cases / quirks:** The transcript states only that the option is selected; it does not give the NEZ range formula.
- **Source:** trk7WTa9SzI
- **Confidence:** Low

### Probability of kill / hit degradation by terminal speed (energy & agility adjustment)
- **Models:** a missile arriving with low energy is easy for the target to evade, sharply reducing kill probability — CMO tracks both a base Pk and a speed/agility-adjusted final Pk.
- **Inputs / parameters:** base probability-to-kill (weapon-vs-target); missile terminal/intercept speed (energy state); target agility.
- **Behavior / rules:** CMO starts from a base Pk — **95%** in every example — then applies an "agility adjusted" / "adjusted for speed" modifier from the missile's terminal energy. Worst case (low-low, missile out of energy): Pk fell from 95% base to ~**30%** adjusted ("1 in 4 chance of actually doing damage"). Improving geometry raised the final number: ~**50%** (one mid case); **79% adjusted → 77% final** (very long-range high shot); an **88% final** (high-high shot at moderate range). Both base-Pk and a speed/agility-adjusted final-Pk are shown in the in-game weapon report.
- **Outputs / effects:** the final probability-to-hit shown in the engagement report; whether the hit succeeds (still subject to luck — a 50% and an 88% shot both missed in the examples).
- **Edge cases / quirks:** Final Pk can drop even with high terminal speed if launched at extreme range (79%→77%); against a maneuvering target a low-energy missile is "just turn"-evadable.
- **Source:** 8WqQ-alekog
- **Confidence:** High

### Afterburner launch-speed boost on weapons
- **Models:** firing with afterburners lit imparts the launch aircraft's higher airspeed to the weapon at release.
- **Inputs / parameters:** the launch aircraft's speed at release (afterburner on/off).
- **Behavior / rules:** Lighting the afterburners before firing raises the aircraft's speed (example: up to ~**780 knots**, then weapons "left the rail already doing 800 knots"), imparting a higher initial missile speed. The effect on the engagement is "minimal, but it's there."
- **Outputs / effects:** slightly higher missile initial velocity / energy.
- **Edge cases / quirks:** Explicitly a minimal effect; high-altitude thin air also means the engine works less hard / burns little fuel to reach speed.
- **Source:** 8WqQ-alekog
- **Confidence:** Med

### SAM effectiveness vs target altitude (large-SAM energy advantage)
- **Models:** surface-to-air missiles struggle against low-altitude targets, but huge long-range SAMs retain enough energy to reach high/distant targets.
- **Inputs / parameters:** target altitude; SAM size/energy (e.g. S-400 vs a short-range SAM); terrain-masking availability.
- **Behavior / rules:** At low altitude a SAM has "a really, really hard time of cutting its way through" (the same low-atmosphere drag/energy problem as air-to-air), and low altitude also lets the target hide behind terrain. Very large SAMs like the **S-400** ("a bus launched at you") carry so much energy they still arrive with plenty, making low-altitude evasion harder against them.
- **Outputs / effects:** SAM intercept feasibility / energy at the target as a function of target altitude and SAM size.
- **Edge cases / quirks:** Terrain masking compounds the low-altitude advantage against SAMs; the energy advantage of very large SAMs partially negates flying low. (Cross-ref *Stealth + low-altitude cruise-missile penetration* below.)
- **Source:** 8WqQ-alekog
- **Confidence:** Med

### Stealth + low-altitude cruise-missile penetration (JASSM)
- **Models:** stealthy low-altitude standoff cruise missiles can defeat even dense, high-precision air defenses.
- **Inputs / parameters:** weapon stealth (low observability); cruise altitude profile; target air-defense density (AAA, S-300).
- **Behavior / rules:** Stealth cruise missiles (JASSM) descend through medium altitude while sneaking toward the target region, then arrive over the enemy. Even dense AAA had "a hell of a time" engaging them and the strike was "devastatingly effective." Principle: with enough stealth and low enough altitude, even the best AAA cannot stop the strike.
- **Outputs / effects:** cruise-missile survivability and target damage against heavy air defense.
- **Edge cases / quirks:** Demonstrated at unrealistically long range for effect; AAA still fires at the missiles as they arrive but largely fails to stop them.
- **Source:** KOOxlw5dfrU
- **Confidence:** Med

### Ballistic trajectory / apogee modeling for missiles (true 3D flight)
- **Models:** ballistic missiles fly a real lofted arc, climbing to a high apogee proportional to range before reentering steeply.
- **Inputs / parameters:** weapon class (short-range ballistic vs heavy ICBM-class); range to target; flight phase (boost, midcourse, reentry).
- **Behavior / rules:** Missiles climb to large altitudes then arc down. Observed apogees: **SS-21 Scarab ~50 km** ("halfway to space"); the heavy demo missile reached **3,487 km** (cited as higher than the ISS, "into TLI altitudes"), peaking around **4,000 km** before turning around. Reentry is fast and steep — reentry speed cited at "**about 16 Mach**" ("Mach 15 or so") with "look at how steep these things reenter." For MIRV/combined warheads a **missile bus** separates from the warhead in the upper atmosphere and dispenses warheads one at a time, producing a fireball-like reentry spread.
- **Outputs / effects:** a 3D arcing flight path; altitude/speed readouts during flight; steep high-speed reentry; for cluster/MIRV types, warhead dispensing during reentry.
- **Edge cases / quirks:** Apparent on-screen altitude depends on camera altitude (the same missile "doesn't feel like 87 km" because the camera was at 700 km). The very high apogees are framed as realistic ballistic behavior, not a bug.
- **Source:** atcxgWfXnX4
- **Confidence:** Med

---

## 14. Guns, Ground/Coastal Fire & AAA

### Naval / ground gun firing-solution time delay (load + range calculation)
- **Models:** large guns are not instant — after being told to fire they incur a delay to load and compute a firing solution before the first round leaves.
- **Inputs / parameters:** gun/weapon type and caliber (e.g. **406 mm / 18-inch** battleship guns, **130 mm** coastal cannons); reload state; range-finding requirement.
- **Behavior / rules:** After committing to an opportunity/ordered shot, the unit shows a countdown delay before firing. Observed value: a **163-second** delay on a coastal battery, attributed to loading the gun and calculating range/angles by visual means. Guns fire in **salvos** (not one shot at a time): rounds accelerate, arc, and "rain down." Big-caliber guns take a noticeable reload time between salvos ("they are kind of battleship guns, they do take a minute").
- **Outputs / effects:** a delay before the first/next salvo; salvo (multi-round) impacts; ammunition magazine depletion.
- **Edge cases / quirks:** Verbatim: **163 s** observed delay; 406 mm and 130 mm calibers cited. Ammo expenditure is heavy — the coastal side burned **468 rounds of 130 mm**; the battleship burned ~three-quarters of its magazine. A 406 mm mount was knocked out and had to reload.
- **Source:** ILGHFWHn6Rk
- **Confidence:** High

### Gun arc / masking by own ship/unit heading
- **Models:** turning a gun-armed unit so its body is between its guns and the target masks (blocks) those guns, preventing them from firing even though the target is in range.
- **Inputs / parameters:** unit heading relative to target bearing; gun-mount positions/arcs; target profile.
- **Behavior / rules:** Turning nose-on to the enemy presents a smaller profile but "masks your rear guns which can't fire." For a ship that needs to bring its main battery to bear, this is problematic — guns whose firing arc is blocked by the hull will not engage. Keep the firing arc clear (broadside) to use the big guns.
- **Outputs / effects:** a subset of weapons unable to fire due to blocked arcs; reduced volume of fire.
- **Edge cases / quirks:** Qualitative only; the trade-off between a smaller target profile and masked weapons is explicitly called out.
- **Source:** ILGHFWHn6Rk
- **Confidence:** Med

### AAA engagement governed by slant range vs effective ceiling/range (not horizontal range)
- **Models:** anti-aircraft artillery (ZSU/"Zeus" 23 mm) effectiveness depends on the true 3-D **slant** distance relative to the gun's effective range, so a fast high-overflying jet can stay outside effective range even within nominal ceiling.
- **Inputs / parameters:** the gun's max/effective range and altitude ceiling (**ZSU ceiling cited as 10,000 ft**); aircraft altitude; aircraft horizontal offset/speed; the resulting slant distance; rounds available (**23 mm**).
- **Behavior / rules:** With jets at **5,000 ft** over ZSUs whose ceiling is **10,000 ft**, the actual **slant** distance to the F-16 was about **7,500 ft** "for a good chunk of that time," keeping the jet "well outside its effective engagement range" even though detected. Result: the ZSUs never fired (Losses & Expenditures = **0 rounds**), and ~1.7 buildings were left intact with no shots fired. In a later slower/closer pass at 5,000 ft ingress the AAA **did** engage: it fired ~**900 rounds** of 23 mm ("50 times 18, divide by two"), killed buildings, and downed/wounded F-16s — engagement happens once slant distance falls inside effective range.
- **Outputs / effects:** whether the gun fires at all; rounds expended; aircraft damage/losses (logged in Losses & Expenditures).
- **Edge cases / quirks:** **Detection does not imply engagement** — the jet was "detected all the way down" yet outside effective range, so no shots. **Speed matters:** a fast straight overflight spends little time in the lethal envelope, while reducing speed to regroup at the initial point puts the aircraft in range and gets it hit. Lowered jets "still are slightly out of AAA range" — "slightly is the key word."
- **Source:** RDE4S8kzZTQ
- **Confidence:** Med

### Rocket-artillery weapons bypass point defense
- **Models:** rocket weapons are classified as rockets (not artillery), so CIWS / point defense cannot intercept them.
- **Inputs / parameters:** weapon classification (rocket vs gun-artillery); presence of enemy point-defense.
- **Behavior / rules:** A multiple-rocket weapon (e.g. **Smerch**) is treated as a **rocket**, not artillery, and therefore "cannot be engaged with point defense" — making it effective for softening defended targets. (Contrast: tube/gun artillery shells and mortars **can** be engaged.)
- **Outputs / effects:** rocket projectiles arrive uninterceptable by CIWS-type defenses.
- **Edge cases / quirks:** Stated plainly as a rule in the ground demo; no numbers given.
- **Source:** miMhUGP6fGg
- **Confidence:** Med

---

## 15. Munitions Effects — Area Spread, Collateral & Distributed/Hardened Targets

### Area / unguided ordnance and collateral damage
- **Models:** large unguided bomb loads spread over an area damage everything in the footprint, including civilian structures.
- **Inputs / parameters:** number and size of bombs (e.g. **51 bombs, each 750 lb** from a B-52); spread/footprint; presence of buildings/civilian structures.
- **Behavior / rules:** Dropping a big unguided load (demo: a B-52 dropping **51× 750-lb** bombs lined up on a target) blankets the impact area and damages whatever is there, including civilian buildings (collateral). Spread quality varies: one demo spread was "really clean" and the targeted infantry platoon survived with light wounds. Multi-tube weapons fire all tubes (e.g. three mortars = three impacts/bangs per volley).
- **Outputs / effects:** area damage to units and structures within the blast footprint.
- **Edge cases / quirks:** CMO does **not** auto-penalize collateral damage in the demo scenario — designers must script penalties (e.g. "damaged civilian building = −60 points"). Reinforces multi-component targeting: area weapons are how you affect dispersed components at once.
- **Source:** miMhUGP6fGg
- **Confidence:** Med

### Collateral / proximity blast damage to nearby unseen units (indirect fire)
- **Models:** munitions striking a point inflict damage on other units within a blast radius, so you can hit unspotted targets by aiming at a nearby point.
- **Inputs / parameters:** impact point; warhead blast/lethal radius (qualitative, weapon-dependent); distance from impact to the nearby unit; target posture (entrenched vs in the open); target damage points.
- **Behavior / rules:** Damage falls off with distance from impact. Concrete distances cited: infantry ~**150 m** from the aim point is "a pretty good distance... not really a safe distance for most heavy weapons"; a naval gun shell landing ~**17 m** from infantry was "pretty darn close" yet the infantry "looked pretty chill" — even ~17 m may do little against entrenched troops. The narrator distinguishes a **morale** hit from a **physical** hit: "if they're entrenched... that blast might not have done anything to them but [been] more of a morale hit than a physical hit." Standard (non-special) warheads did **not** produce enough collateral spread to reliably kill nearby unseen infantry.
- **Outputs / effects:** damage/suppression applied to units near the impact based on distance and posture; entrenched units may take only a morale effect; no effect if outside the lethal radius.
- **Edge cases / quirks:** Entrenchment greatly reduces physical effect (morale-only at close range). The ~17 m near-miss did not visibly hurt entrenched infantry. Exact blast-radius numbers are not given — only the observed miss distances (150 m, 17 m).
- **Source:** atcxgWfXnX4
- **Confidence:** Med

### Weapon dispersion / spread on impact (precision vs area saturation)
- **Models:** different weapons land their effect with very different spread, from tight precision impacts to wide area saturation.
- **Inputs / parameters:** weapon type and warhead type (precision unitary vs cluster/CBU vs ballistic-cluster/combined-effect vs MIRV bus); number of rounds/munitions allocated.
- **Behavior / rules:** Observed spread by weapon: **naval artillery** "landed everywhere... typical for very very large artillery" (wide, scattered); **F-15E CBUs** gave "a pretty clean spread" but were "too darn accurate" (concentrated, not enough scatter); **GMLRS GLSDB from HIMARS** "nailed pre-planned targets and did nothing as far as spreading out" (high precision, no area effect); **SS-21 Scarab** with combined-effect munitions has "a massive spread" and "spray everywhere" (best for area saturation); a **SCUD** is so inaccurate it "lands in the water even from that distance" ("scud accuracy"); a large **MIRV/missile-bus** releases warheads one at a time from the bus, producing a wide reentry spread.
- **Outputs / effects:** an impact pattern from tight (CBU, GMLRS) to wide (heavy artillery, ballistic combined-effect, MIRV); area saturation kills clustered/unspotted units; precision weapons hit only the aim point.
- **Edge cases / quirks:** To area-saturate you need **either** a ballistic cluster/combined-effect warhead **or** a very large special warhead; standard warheads don't give the needed spread. SCUD CEP is so large it can miss into the sea. Sub-munition reliability varies (one run: "whoever was packing the sub munitions that day didn't do a great job" — duds/malfunctions).
- **Source:** atcxgWfXnX4
- **Confidence:** Med

### Distributed (multi-component) ground targets vs single-unit targets
- **Models:** large ground installations (e.g. SAM batteries) are collections of individually-damageable sub-units, while small vehicles are single all-or-nothing targets.
- **Inputs / parameters:** the database **"damage points"** value of the unit; the unit's internal component/weapons list (launchers, radars, MANPADS, etc.); incoming-weapon warhead damage points.
- **Behavior / rules:** A unit carries a "damage points" number. A **single unit** (e.g. a P-19 "Flat Face" radar truck) has a nonzero pool (stated "one damage point") and a **blank** weapons page — one complete unit; one sufficient hit destroys the whole truck. A **distributed target** (e.g. an SA-2DE "PVO" battery) shows **ZERO** damage points specifically because it is not a single target — you can't kill the whole battery with one hit. It is composed of many separately-damageable pieces visible on its weapons page (the example battery: six single-rail launchers, several shoulder-launch MANPADS, the "Fan Song" fire-control radar, a "Spoon Rest" P-12 search radar). Each piece is damaged/destroyed individually; killing one (e.g. the search radar) leaves the rest operational. CMO gives no diagram of the layout — infer composition from the weapons page and check status afterward via the unit's **Damage Control** panel.
- **Outputs / effects:** per-component destruction; a remaining-strength counter near the unit (e.g. "11" → "10" as components are lost); Damage Control marks which sub-units are destroyed vs operational; the battery keeps functioning as long as a cueing/fire-control component survives.
- **Edge cases / quirks:** Because the battery has zero damage points as a whole, a player expecting a single hit to wipe it gets a surprising result ("the effect of the weapon is not what you expected"). Destroying the cheap search/"Spoon Rest" radar does not disable the battery if the expensive Fire Control radar survives. A **Hardened Aircraft Shelter** is an example single structure with a very large pool (**350 damage points**) needing many hits.
- **Source:** eame83G2Asw
- **Confidence:** High

### Warhead damage points vs target damage points (hit resolution)
- **Models:** each weapon warhead carries a damage-point value checked against a target component's damage-point pool to decide destruction.
- **Inputs / parameters:** the weapon warhead's "damage points" (weapon database); the target unit/component's damage-point pool; hit/proximity of the round.
- **Behavior / rules:** On a hit, the warhead's damage points are applied to the struck unit or sub-component. Stated values: a **Standard ARM warhead = 62** damage points (obliterates a radar truck/post); an **AGM-65 Maverick = 66** ("that is enough"); a single radar **truck = 1** damage point, so either weapon vastly over-kills it. Against a distributed battery, each round is allocated to and resolved against an **individual component**, not the battery as a whole (UI shows "one missile allocated to this target").
- **Outputs / effects:** the component is destroyed if warhead damage ≥ component pool; the remaining-strength counter decrements; surviving components keep operating.
- **Edge cases / quirks:** Over-killing a 1-damage-point truck with a 62/66-point warhead is normal (warhead damage points — Standard ARM ~62, Maverick ~66 — are compared against the target's damage points, e.g. a 64-point Osa). Very large structures (350-dmg shelter; 100,000-dmg training/pre-planned target) cannot be killed by normal warheads at all.
- **Source:** eame83G2Asw
- **Confidence:** High

### Underground targets require penetrator warheads (blast/nuclear weapons miss/ineffective)
- **Models:** only weapons whose warhead is flagged "penetrator" can damage underground targets; conventional bombs and even non-penetrating nuclear bombs fail entirely.
- **Inputs / parameters:** weapon warhead type (the **"penetrator"** tag, e.g. BLU-116B SLB on a GBU-24C Paveway; other penetrators like Popeye IIR, MPR-500); the target's underground status and durability (damage points); hit/penetration resolution; delivery profile (low-altitude delivery, midcourse autopilot).
- **Behavior / rules:** Against an underground aircraft shelter: **108× Mk 82** (conventional) all **missed** ("we can't hit something that's underground"); **15 kT tactical nuclear bombs** (non-penetrating) did **nothing** ("target completely unaffected," hangar unscratched). The fix is a penetrator warhead — "penetrator is the magic term." The **GBU-24C / BLU-116B** (low-altitude delivery, midcourse autopilot) hit and produced "armor penetrated," damaging and setting the shelter on fire. The shelter has **3,200 damage points** of durability, so it "takes a really hard hit to disable" — penetrating hits damaged it but did not one-shot disable it.
- **Outputs / effects:** hit vs miss against underground; on success "armor penetrated" + damage applied (and possible fire); high-durability targets may survive multiple hits.
- **Edge cases / quirks:** Verbatim: 108 Mk 82 all missed; 15 kT nuke ineffective (one weapon malfunctioned, noted as common); shelter durability = **3,200 damage points**. Penetrator weapons flew a more **horizontal** terminal path rather than steeply vertical. Many nations have penetrators (Popeye IIR, MPR-500, etc.).
- **Source:** OWCZPAVviuE
- **Confidence:** High

---

## 16. Display Aids, Range Rings & Map Settings

### Aircraft projected range ring (fuel-based reach)
- **Models:** a live estimate of how far an aircraft can still fly given current fuel burn.
- **Inputs / parameters:** current fuel quantity/capacity; current fuel-consumption rate; altitude; throttle setting; engine damage state; external stores (munitions on wings).
- **Behavior / rules:** With the "aircraft range" map setting on, a ring projects the aircraft's reachable distance based on **current** fuel consumption. Changing throttle changes the ring near-instantly: afterburner shrinks it quickly (more burn), loiter expands it (less burn). The estimate factors current consumption, altitude, throttle, **and** damaged state — e.g. a B-52 with half its engines damaged has significantly reduced range; carried munitions also reduce it.
- **Outputs / effects:** a visual reach ring; fuel readouts (kg of fuel, mission fuel vs reserve, kg/min burn rate, time-to-bingo, range).
- **Edge cases / quirks:** "Mission fuel" = fuel available before you must turn for home (reserve is held back separately). If in-flight-refueling capable, the readout also shows proximity/time to the assigned tanker. Example burn shown: **37 kg/min**.
- **Source:** 5dJfIKiNHj8
- **Confidence:** High

### Fuel burn rate vs altitude (range = endurance tradeoff)
- **Models:** fuel consumption per minute depends strongly on the altitude band; higher altitude burns less, extending range.
- **Inputs / parameters:** aircraft altitude band; cruise speed; the database fuel-burn entry.
- **Behavior / rules:** From the F-16 database: at high altitude (between **36,000 and 45,000 ft**) at cruise, the aircraft burns **21 kg/min**. At moderate altitudes it's about **29–30 kg/min** — "up almost 30%," and "if my consumption goes up 30%, my range decreases by the exact same amount." So lower altitude → higher burn → proportionally reduced range/endurance; low/terrain-following altitude is the worst for fuel.
- **Outputs / effects:** fuel-per-minute consumption; remaining range/endurance; whether the aircraft reaches the target before bingo fuel.
- **Edge cases / quirks:** Flying low repeatedly caused flights to "run out of fuel before they get home" / before reaching the target (mission failures and a crash); a high holding waypoint banks fuel savings before a low dive; defensive maneuvering burns extra fuel and can cause fuel-out failures.
- **Source:** KOOxlw5dfrU
- **Confidence:** High

### Sensor & weapon range rings (display + merge)
- **Models:** visualizes detection and weapon-engagement envelopes per platform.
- **Inputs / parameters:** per-unit sensor ranges (by sensor band) and weapon ranges (air vs surface, gun vs missile); the display-scope setting (all units / selected unit / do not show); friendly vs non-friendly; a merge toggle.
- **Behavior / rules:** Top-half rings = **sensors**, bottom-half rings = **weapons**. Ring color encodes the band/type (air sensor vs surface weapon vs air weapon). **Friendly** rings are solid; **non-friendly** (enemy) rings are **dashed** in matching colors. A **"merge"** option fuses many overlapping rings from one group into a single combined coverage circle (declutters and is lighter to render) but hides which individual platform contributes each ring.
- **Outputs / effects:** on-screen circles; affects clutter/readability only (a display aid, not the underlying engagement logic).
- **Edge cases / quirks:** Being inside a weapon ring does **not** guarantee a shot: older radars can't hold a reliable track at long range (e.g. a nominal 150-mi range still not usable), and you must also be inside the Dynamic Launch Zone. Torpedo rings overstate reach because the weapon must chase a fleeing target (next rule).
- **Source:** 5dJfIKiNHj8
- **Confidence:** High

### Torpedo effective range vs paper range (target-motion / lead-pursuit)
- **Models:** a weapon that must chase a maneuvering target has far less usable range than its catalog range.
- **Inputs / parameters:** torpedo paper range; the assumption that the target ship runs away at max speed.
- **Behavior / rules:** Because the launching submarine must assume the target ship will flee directly away, the torpedo has to chase it, consuming range. Stated example: a torpedo with a **60 nautical-mile** paper range effectively yields only ~**15 nautical miles** of launch range from the submarine's perspective.
- **Outputs / effects:** reduced usable engagement range / launch envelope for chasing weapons.
- **Edge cases / quirks:** This same motion-based shrinkage is the general reason "in range" on a ring is optimistic; it is most pronounced for torpedoes.
- **Source:** 5dJfIKiNHj8
- **Confidence:** High

---

## 17. Altitude Tactics — Integrated Tradeoffs

> These rules synthesize the altitude/detectability/fuel/engagement-window relationships
> across the altitudes transcript; they restate effects detailed individually above (fuel
> burn, sensor LOS, radar horizon, AAA slant range) as a single tactical model.

### Altitude vs sensor line-of-sight & detectability (mutual)
- **Models:** high altitude maximizes your own sensor line of sight but equally maximizes how easily ground threats detect you.
- **Inputs / parameters:** aircraft altitude; sensor type; terrain; enemy ground-sensor positions.
- **Behavior / rules:** At high altitude (~**36,000 ft**) the aircraft gets "fabulous line of sight for any sensors" — anything electrically detectable and in LOS is detected at long range. The same altitude makes the aircraft "very, very easy to detect by anything on the ground." Lower altitude trades sensor range/LOS for reduced exposure. **Terrain masking** at low altitude can fully hide an aircraft (example: mountain **6,500 ft**, aircraft at **5,100 ft** = "completely masked by this terrain").
- **Outputs / effects:** detection range (own sensors and enemy sensors); whether terrain masks the aircraft.
- **Edge cases / quirks:** Terrain masking only works when the aircraft is below intervening terrain; high altitude gives best mutual detection (good SA but a long enemy engagement window).
- **Source:** KOOxlw5dfrU
- **Confidence:** High

### Enemy engagement window scales with your altitude
- **Models:** the higher (and earlier-detected) you fly, the longer the enemy has to shoot at you; flying low compresses their firing window.
- **Inputs / parameters:** aircraft altitude; enemy detection range; ingress geometry / time inside threat range.
- **Behavior / rules:** High-altitude ingress let the enemy detect the strikers early and engage "about **30 miles** away," giving a "very long" engagement window — strikers were driven off before striking. Medium altitude (~**12,000 ft**) gave the enemy "a lot less time." Low/minimum altitude (terrain-following ~**1,000 ft**) gave "very minimal" reaction time. Aligning the IP/run-in through valleys further shortens time "in the danger zone."
- **Outputs / effects:** how early and for how long the enemy fires; striker survivability vs ability to reach the release point.
- **Edge cases / quirks:** At high altitude inside threat range the strikers burned all their fuel reacting to missiles and the mission failed before any shot; low altitude shortens the window but exposes the aircraft to massed short-range AAA/MANPADS that "reach up" with no trouble.
- **Source:** KOOxlw5dfrU
- **Confidence:** High

### Altitude band tactical tradeoff (high / medium / low strike profiles)
- **Models:** each altitude band trades SA / fuel / accuracy against survivability and enemy engagement time, with distinct outcomes.
- **Inputs / parameters:** the chosen strike altitude band (high ~36,000 ft / medium 10,000–18,000 ft, demo 12,000 ft / low terrain-following ~1,000 ft); the threat mix (long-range SAM vs short-range SAM/AAA).
- **Behavior / rules:** Demonstrated one-variable-at-a-time:
  - **High (~36,000 ft):** most time to employ weapons, best sensor LOS, best fuel economy, but the enemy detects early and has a long engagement window; untouchable by short-range SAMs/AAA; unguided bombs can't be dropped accurately.
  - **Medium (~12,000 ft):** a tradeoff — fuel economy not as good, LOS "okay," but much less enemy engagement opportunity.
  - **Low (terrain-following ~1,000 ft):** minimal enemy reaction time and terrain masking against long-range systems, but routes the aircraft through a "lethal air defense corridor" where every short-range SAM/AAA/MANPADS can engage; worst fuel economy; the aircraft can even struggle to reach a usable weapon-employment position.
  - Summary: roughly similar F-16 losses across bands in these (deliberately suboptimal) runs, but the **failure mode differs** by band.
- **Outputs / effects:** mission success/damage, aircraft losses, fuel state, and detection/engagement timing per altitude choice.
- **Edge cases / quirks:** Defensive maneuvering can be disabled on strikers so escorts soak the SAMs, letting low strikers reach the release point. Middle altitude is hard for enemies to get underneath (radar blind-spot rule). The medium-altitude run still had **every released weapon shot down** by the SAM despite reaching release — reaching the drop point doesn't guarantee weapon survival.
- **Source:** KOOxlw5dfrU
- **Confidence:** High

---

## Cross-video notes, contradictions & open items

- **Opportunity-fire gate is the master ground-engagement rule.** Three separate
  transcripts (`miMhUGP6fGg`, `ILGHFWHn6Rk`, `JqZYvpCP7ik`) independently stress that
  ground/surface units do nothing autonomously until **"Engage Opportunity Targets" =
  Yes** or they're in a mission — and that WRA permitting the shot, and even ROE = Free,
  is *not enough*. The one carve-out is **ship-vs-ship auto-engages**. Implement the gate
  as: `auto-fire ⇐ (oppTargets=Yes OR tasked-by-mission) AND detected AND hostile AND
  WRA-permits AND LOS`, with the ship-vs-ship exception.

- **"In range" never means "can hit."** Multiple independent gates sit on top of the
  range ring: LOS/terrain masking, radar track quality / look-down clutter, vertical
  bore-sight limit, illumination-channel saturation, DLZ/no-escape vs paper range,
  missile terminal energy, and (for guns) slant-range vs effective range and arc masking.
  Model the ring as advisory display only.

- **Movement vs detectability is sensor-dependent and partly contradictory.**
  `miMhUGP6fGg` says moving reveals a ground unit (stationary units are camouflaged and
  near-invisible); `xhmuBfBQ_DY` says against JSTARS-class side-looking radar it "won't
  matter if you're going fast or slow." Both are true under different sensors — keep a
  "moving reveals to ordinary observers" effect that capable surveillance radars ignore.

- **Altitude cuts both ways.** Higher altitude improves *your* radar reach
  (curvature/horizon) and missile energy/range, **and** makes you easier to detect with a
  longer enemy engagement window, **and** improves fuel economy, **but** wrecks unguided
  bombing accuracy. Lower altitude is the inverse on every axis plus terrain masking.
  These are consistent (LOS is symmetric) but cut opposite ways tactically — implement all
  effects.

- **Missile energy physics is the same model across three videos** (`8WqQ-alekog`,
  `dui_lPsECfE`, `trk7WTa9SzI`): brief 10–20 s boost then coast; speed capped per
  altitude band (AMRAAM 1,620 kt < 12,000 ft vs ~2× at 36,000 ft+; an example missile
  Mach 4.62 at 36k vs Mach 2.6 below 10k); loft only pays off near max range / in thin
  air; thick low air bleeds energy and stalls light missiles while heavy SAM missiles
  resist it; base Pk (95%) is multiplied by a speed/agility-adjusted factor (down to
  ~30%). Implement Pk as `basePk × f(terminal-energy, target-agility)`.

- **Ground vehicles are simplified ("land ships").** Uniform speed (no per-vehicle top
  speed), single omnidirectional armor value (no facing arcs), fuel only on single
  *ground units* (not aggregated *mobile-facility* platoons), and the
  ground-unit-vs-mobile-facility database split. The AI never auto-rearms or auto-refuels.

- **Distributed targets vs damage-points.** A unit with a **populated** weapons page and
  **0 damage points** is a distributed battery (kill components individually); a unit with
  a **blank** weapons page and a **nonzero** pool is a single object (one good hit kills
  it). Warhead damage points (ARM 62, Maverick 66) are checked against the
  component/unit pool. Underground targets need a **penetrator** tag; very large pools
  (350, 3,200, 100,000) need many hits or can't be killed by normal warheads.

- **Land cover vs elevation masking are separate layers:** relief
  masks LOS at *macro* scale (no micro-relief), while land **cover** modifies
  spotting/movement/weapon-effect at *fine* (per-pixel) scale. A unit benefits from both
  independently. The extracted `5dJfIKiNHj8` land-cover rule is qualitative; the verbatim
  detection-range numbers and the area-weapon-vs-unitary-weapon weaponeering result are in
  *Land cover — quantitative spotting ranges and weaponeering by cover type* (`2SJDdTiuRPs`).

- **Jamming / RCS interaction and multi-jammer non-stacking** (`1r4P_gI-Pdw`,
  `FI-ZwDubiMY`): a noise jammer must cover the **band** the victim radar uses or it does
  nothing useful (and may make the jammer more obvious); when effective, jamming + small
  aspect compounded to roughly a **10%** detection-range reduction (vs ~2% from aspect alone).
  A "jammed" radar still sees — "jammed" just means it is receiving jamming, not blinded.
  **Multiple same-band jammers scale very poorly:** going from 1 → 2 jammers changed detection
  by only ~2 nm, and adding 5–8 jammers actually *increased* detection range. The real value of
  many jammers is covering many different radar **frequencies** (one per band) and forcing the
  enemy to split power — not raw power stacking. Wrong-band jamming detected the target at the
  same or **farther** range.

- **Emission intensity → detection range (logarithmic model)** (`-Q9AfTrF4vM`, sonar, but the
  clearest stated intensity→range math): decibels are logarithmic (+10 dB = ×10 power) but
  because energy radiates in all directions and attenuates, detection range scaled gently —
  **every +10 dB ≈ +33% detection range** (31.5 dB→4.0 nm; 42 dB→5.7 nm; 52 dB→7.5 nm;
  102 dB→13 nm). Crossing below the **acoustic layer** (going deep) cut detectability ~**75%**
  (a ~90 dB sub heard ~9 nm in the layer was only heard ~3.5 nm below it). Shallow water /
  coastline reflections drastically *increase* detectability. Quiet/slow → short detection
  range; a shielding layer (terrain/horizon analog) sharply reduces it.

- **Open / not-yet-mined** (low priority): *Radar Misconceptions* (`FOQ6kcf9YzA`),
  *Radar Jamming Bands* (`BIiSHFYKFQ8`), *Radar versus Visual Recon* (`agqnyM3Hwkg`),
  *Cloud Cover and Visual Sensors* (`f8uR3dLCq0M`), beta detection-change patch videos
  (`Ccyl-4E_dl4`). These would refine the band/jamming and visual-recon rules; the core
  mechanics above are well-established.
