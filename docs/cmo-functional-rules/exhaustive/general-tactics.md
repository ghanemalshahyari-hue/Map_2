# CMO Functional Rules — Exhaustive: General Tactics & Employment

**Scope.** This is the **General Tactics & Employment** bucket: how an operator *employs* forces in
Command: Modern Operations once units, sensors, and weapons exist — mission construction and the
mission lifecycle (Patrol/CAP, Support/on-call, Strike, Air-Intercept/scramble, Ferry), flight-size
and concentration-of-force, attack methods/geometry, time-on-target coordination, WRA range/salvo
employment, intercept-lead math, SEAD/DEAD and SAM-penetration tactics, anti-ship saturation, ASW
(TMA, hammer-and-anvil, sonobuoys, convoy escort), submarine employment, EMCON/intermittent-emission
scheduling, decoys/jammers, recon search allocation, refueling/endurance/sortie-tempo, crew fatigue,
weather effects on employment, satellite/ASAT engagement, and civilian-traffic generation. It is the
*operator-tactics* counterpart to the four core clusters (Movement & Detection, Doctrine/WRA &
Engagement, Damage & Attrition, Scenario Authoring) — where those describe the underlying mechanics,
this describes how players actually drive them. Where a rule restates a core-cluster mechanic, it is
kept here only for the **employment** angle and cross-referenced in spirit.

This pass is **exhaustive**: it merges **every** rule extracted from **all** transcripts in this
bucket. Near-identical mechanics seen across multiple videos have been **deduplicated into one rule**
that keeps the richest version and **cites all source video IDs**.

> **AUTO-GENERATED CAPTION CAVEAT.** All source transcripts are YouTube auto-generated captions, so
> spelling and exact numbers can be imperfect (e.g. "WRA" as "W-R-A"/"Wright", "NEZ" as "no-escape",
> "DLZ" as "DLC", "MAWS" as "maus", "Winchester"/"shotgun" weapon-states, "TARCAP"/"BARCAP"). **Stated
> numbers are reproduced verbatim** and should be treated as *illustrations of the specific database
> unit / scenario shown*, **not** universal constants. Rules tagged Low/Med confidence are inferred or
> rest on a single secondary mention. Nothing here is invented — every field traces to the extracted
> rule set.

---

## Mission framework: types, pools, packages & the ATO

### Mission types vs Task Pools vs Packages
- **Models:** Three distinct ways to organize forces for tasking: a standard **Mission** (units
  assigned from anywhere), a **Task Pool / Task Force** (a named reservoir of units, no mission), and
  a **Package** (a mission that may draw units *only* from a designated Task Pool).
- **Inputs / parameters:** Mission editor (F11 / Ctrl+F11) with mode selector Mission / Mission Task
  Pool / Package. A Task Pool: only a unit-membership list (units may be grouped by similarity but
  need not be similar; "Add → Task Pool"). A Package: a mission plus a **"pull units from
  &lt;task pool&gt;"** selector; auto-assigned package number; a mission class (patrol/anti-surface,
  land strike, support, etc.); the editor's left tree shows each task force with its packages nested.
- **Behavior / rules:** A standard mission is created directly. A Task Pool is created with **no
  mission and no mission options** — the only action is selecting members. A Package behaves like a
  normal mission (on-station counts, flight size, transit/attack altitude, WRA, target focus) but once
  a task pool is chosen the unit-assignment list is **restricted to that pool's aircraft only** ("the
  only people available for tasking are the aircraft I put into this group"). A Package with an
  empty/insufficient pool **errors/panics** until aircraft are added. An **Air Tasking Order (ATO)**
  aggregates all packages/flights and lets you edit individual flight numbers.
- **Outputs / effects:** Units become organized into named task forces; packages appear nested under
  their parent; the ATO is the aggregated mission board.
- **Edge cases / quirks:** Units assigned to a task pool are **NOT available to regular (non-package)
  missions** — a new ordinary mission won't list them. A package's flight-plan range warning can be
  cleared by assigning a tanker package. Packages/pools are **purely organizational** (no combat-
  behavior change) and only earn their keep on large orders of battle (e.g. Operation Allied Force);
  for a simple same-target strike, "don't bother." The civilian/commercial edition exposes only a
  subset of these tools.
- **Source:** OOMcIVfQxaQ; K1CjUSr2o5Y
- **Confidence:** High

### Air Tasking Order (ATO) — generation, status flow & editing
- **Models:** An operational management view of all scheduled/active air missions over the campaign
  clock; an **information tool for the player that does NOT drive the AI**.
- **Inputs / parameters:** Missions/packages (optionally grouped into task pools); the scenario clock
  (**must be running** to generate entries); per-flight task type, aircraft type, loadout, takeoff
  time, time-on-target/time-on-station, landing location, priority; an "in ATO" flag per package; a
  "Privity" field (a mission is either *go* / must-happen, or *none*).
- **Behavior / rules:** Entries are generated **only while the clock runs** (nothing appears while
  paused, even with pre-built missions). Each flight shows call sign, flight-plan type, status, task,
  aircraft type, loadout, takeoff time, TOT/time-on-station, and landing location. Status progresses
  in **cycles** (Planning → Taking off → Airborne → Landing/down), not continuously — a flight can
  still read "Airborne" briefly after landing. The **task** label (TARCAP, BARCAP, RESCAP,
  surveillance, support, strike, …) is a player reference that mostly does **not** change behavior
  (only slightly different flight profiles, no large effect; there is **no DEAD task option**). Sort
  by alphabetical, takeoff location, takeoff time, or aircraft type. Patrol missions carry a **Time-on-
  Station** (no TOT); strike missions carry a **Time-on-Target** — only one of takeoff-time / TOT need
  be set and the other auto-derives.
- **Outputs / effects:** An organized, sortable mission board; editable takeoff times / TOT / landing
  locations; package in/out-of-ATO membership.
- **Edge cases / quirks:** You can create a flight **inside a package independent of units** and
  assign aircraft later, even overriding its flight-plan profile — but flight-plan values are in
  **meters** and editing them is complex. Double-clicking an aircraft type does **not** open its
  database page. Task pools/packages advised only for very large orders of battle.
- **Source:** qFEqo-cdynk
- **Confidence:** High

### Strike-mission lifecycle automation (RTB / unassign / chain missions)
- **Models:** Mission-end behaviors that let aircraft auto-return, auto-unassign, and free themselves
  for the next mission, enabling chained operations.
- **Inputs / parameters:** Mission flags: **"Mark phase satisfied upon reaching destination"** (RTB-
  on-arrival); on-deactivation options to **unassign units, order RTB, and delete the mission**; the
  ability to assign one unit to **multiple missions**; an activation/deactivation schedule.
- **Behavior / rules:** When a mission deactivates it can unassign its units, send them home, and
  delete itself. Because a unit can belong to several missions, finishing/deactivating one frees the
  aircraft and activates them for the next queued mission. "Mark phase satisfied upon reaching
  destination" triggers the phase/RTB once aircraft reach a destination. This lets the operator pre-
  build many sequential missions that hand aircraft off automatically.
- **Outputs / effects:** Automated RTB, unit reassignment to the next mission, and self-cleanup of
  completed missions; supports long chains of strikes without manual re-tasking.
- **Edge cases / quirks:** Tied to the Operations Planner/Manager; there is added complexity ("stuff
  that makes it tricky to use"). Multi-mission assignment is the enabler for the hand-off.
- **Source:** ypsaYQ5Xp5w
- **Confidence:** Med

### Multi-mission ("Dynamic") units must be *triggered* before they launch
- **Models:** A pool model where one aircraft can be a candidate for several missions and only flies
  the one whose trigger/priority wins.
- **Inputs / parameters:** Unit posture set to **Dynamic** (multi-mission); the set of missions it is
  assigned to; each mission's active/triggered state and **priority**; mission activation time.
- **Behavior / rules:** A Dynamic unit can be assigned to multiple missions at once (selecting it
  shows every mission it belongs to). Crucially, multi-mission units will **NOT take off just because
  a mission is active — the mission must be TRIGGERED.** Pressing F6 on an untriggered mission shows
  nobody assigned even though units were added, because they are multi-mission and not yet triggered.
  Two ways to trigger: directly from the mission/unit, or via the Operations Planner. Once triggered
  (and active), launch timing also depends on mission **priority**.
- **Outputs / effects:** Triggered units begin the get-airborne sequence; untriggered multi-mission
  units stay grounded and show no mission assignment in F6.
- **Edge cases / quirks:** These units "don't like to take off unless they're triggered" — the most-
  repeated gotcha. The Operations Planner's three buttons (unassign mission units, order RTB, delete
  mission) work **only with GENERATED missions** (from special scripts/Lua planners), **not** custom/
  hand-built missions.
- **Source:** Pbx_3HTS9Tk
- **Confidence:** High

### Operations Planner mission priority breaks ties for unit assignment
- **Models:** Deterministic resolution when one Dynamic unit could serve multiple eligible missions.
- **Inputs / parameters:** Each mission's priority value; whether each mission is active **and**
  triggered; the order in which missions were activated.
- **Behavior / rules:** Stated rule: **"if two missions have the same priority and they're both
  active and they're both triggered, the FIRST mission activated receives all the units."** To control
  reassignment you tweak priority (higher number = higher priority in the demo: set the desired next
  mission to a higher value and the prior to 0) so units shift to the intended mission when the prior
  is satisfied.
- **Outputs / effects:** Units flow to the winning mission by priority; equal priority resolves by
  earliest activation.
- **Edge cases / quirks:** Equal-priority + both-active + both-triggered is the failure mode that
  "always gives issues"; fix by adjusting priority.
- **Source:** Pbx_3HTS9Tk
- **Confidence:** High

### Mission activation time auto-reactivates a mission (overrides manual "satisfied")
- **Models:** The scheduler treats a set activation time as authoritative on each tick/refresh.
- **Inputs / parameters:** Mission activation time; deactivation time; manual "satisfied"/"inactive"
  state set via the Operations Planner.
- **Behavior / rules:** If a mission has an activation time set, the engine sets it **back to active**
  when that time is reached (or on refresh), overriding a manual deactivation. Observed: after
  disabling/satisfying a mission, pressing **F11 (refresh)** caused it to "immediately go back to
  active" because it still had an activation time. To truly stop it you must **clear the activation
  time (and deactivation time)** before manually setting it inactive.
- **Outputs / effects:** Mission flips back to active on its activation time / on refresh unless its
  activation time is cleared.
- **Edge cases / quirks:** This fights manual chaining — sequencing missions by hand requires clearing
  activation/deactivation times so the scheduler doesn't undo your manual state.
- **Source:** Pbx_3HTS9Tk
- **Confidence:** High

### RTB lock — an RTB'ing unit can't switch missions unless the target mission is already active
- **Models:** Aircraft committing to a return-to-base task and ignoring reassignment.
- **Inputs / parameters:** Unit RTB state; target mission active/inactive; manual ready/arm action
  (F6).
- **Behavior / rules:** **"You cannot switch them to the new mission without the new mission being
  activated."** Once units decide to RTB they will RTB regardless, unless the destination mission is
  active. **Recovery:** select the RTB'ing units, **F6**, and "instantly ready them" (arm immediately)
  so they take off again toward the now-active mission.
- **Outputs / effects:** RTB units stay committed to landing unless the new mission is active; readying
  them (arm/ready) relaunches them.
- **Edge cases / quirks:** A recurring frustration ("over and over"). Activating the new mission
  **before** units commit to RTB avoids the lock. (See also "Opportunity targeting toggle interacts
  with RTB state" under Air-Intercept.)
- **Source:** Pbx_3HTS9Tk
- **Confidence:** High

### Order-of-operations latency causes transient "clueless" units when chaining live
- **Models:** The engine processes activations and deactivations in a tick order, so reassignment is
  not instantaneous.
- **Inputs / parameters:** Simultaneous activation of a new mission + deactivation of the old; the
  current waypoint each unit is flying.
- **Behavior / rules:** When you satisfy/deactivate one mission and trigger+activate the next mid-
  flight, units only switch **after completing their current waypoint**, and some end up temporarily
  with no task ("completely clueless"). This is "a function of the order of operations in which the
  system activates and deactivates things." **Fix:** re-issue the mission (give them a "kick") to push
  them back onto the correct mission.
- **Outputs / effects:** Units finish the current leg, then shift to the new mission; a subset may idle
  until re-kicked.
- **Edge cases / quirks:** Inherent to multi-mission chaining; expect stragglers. Units complete their
  first waypoint before honoring the abort/switch.
- **Source:** Pbx_3HTS9Tk
- **Confidence:** Med

### Sequencing dependent strike waves by activation timing (turnaround budget)
- **Models:** Real sortie generation — an aircraft cannot start the next mission until it has flown
  home, refueled, and rearmed.
- **Inputs / parameters:** Previous mission end time; transit time back to base (~45 min stated);
  refuel + rearm time; the next mission's on-station duration.
- **Behavior / rules:** Two philosophies: (A) don't enable the next mission until **at least ~6 hours**
  have passed (transit ~45 min + refuel + rearm), or (B) just activate the next mission when the
  previous units are done. Worked example: Op Able runs 0330→0530; the next wave should **not** be
  activated at 0530+2h (2h is too little to rearm/refuel) — the narrator allots **~9 hours**
  (0530 + 9h ≈ 1300; sets activate 0531, end 1300), then the next mission activate 1301, +9h → 2200.
  Big time blocks exist specifically to cover finish-prev + gas + return + re-do.
- **Outputs / effects:** Each successive strike's activation/end windows are spaced by the turnaround
  budget so the same airframes can fly all waves.
- **Edge cases / quirks:** The most common mistake is setting the wrong **date** on start/end (check
  the day field). 2h windows are explicitly too short to rearm/refuel.
- **Source:** Pbx_3HTS9Tk
- **Confidence:** High

### Manual grouped takeoff vs auto-launch timing
- **Models:** Manually launching aircraft together from a base versus letting the mission auto-launch
  them, affecting how quickly the sim treats them as one coordinated group.
- **Inputs / parameters:** Launch method (manual from airbase vs mission auto-launch); flight/cell size
  (cells of 3, up to 6, or one group of 24); optional takeoff time.
- **Behavior / rules:** Auto-launch incurs recognition latency — "it's going to take a few moments for
  the system to recognize that you're launching these together." Launching **manually** from the
  airbase as a batch makes them depart immediately and be recognized as a group without that delay.
  For time-on-target the ATO needs time to compute, so speed up time after setting it up.
- **Outputs / effects:** Faster, coordinated group departure; group cohesion recognized sooner.
- **Edge cases / quirks:** Mainly a timing/recognition latency in the auto-launch path; manual launch
  sidesteps it.
- **Source:** J8r5FSRvekQ
- **Confidence:** Low

---

## Patrol / CAP construction & coverage geometry

### Patrol-area shape validity (simple-polygon requirement)
- **Models:** Geometric validity requirement for any drawn mission zone.
- **Inputs / parameters:** The set of reference points defining a patrol / anti-surface / ground-attack
  / ASW / prosecution polygon.
- **Behavior / rules:** A drawn mission area **must be a valid simple (non-self-intersecting)
  polygon.** If the points form a self-crossing/twisted ("Riesling") shape, CMO throws an "angry
  error" and the mission is **not formed** until the point ordering is fixed.
- **Outputs / effects:** Accept/reject of the mission area.
- **Edge cases / quirks:** Same constraint appears across patrol, ground-attack, ASW, and prosecution
  areas.
- **Source:** o-fQ8eeydHM; Q9s-NBZP-Yc
- **Confidence:** High

### Reference points — rename / move / delete, and link-to-unit (fixed vs moving bearing)
- **Models:** Operator-defined map anchors used to draw mission/patrol zones, including ones that
  **track a moving force**.
- **Inputs / parameters:** **Ctrl+Insert** place, **Ctrl+R** rename, **Ctrl+Delete** delete; "link
  reference point to unit"; bearing type **fixed** vs **moving/rotating** relative to that unit.
- **Behavior / rules:** Reference points define mission areas; they can be renamed and deleted.
  Critically they can be **LINKED to a unit** (e.g. a carrier group) with a fixed or moving bearing, so
  the whole patrol/engagement zone **translates as that force moves** — keeping CAP/ASW boxes correctly
  positioned around a moving carrier.
- **Outputs / effects:** Anchors that define and (optionally) move mission/patrol/prosecution zones.
- **Edge cases / quirks:** Mission areas must still form a valid simple polygon (see above). AWACS/
  tanker tracks and CAP zones are commonly set to follow the carrier this way.
- **Source:** o-fQ8eeydHM; eqYjCWRLeRM; Fz6_cwdMjYU
- **Confidence:** High

### Patrol station settings — transit vs station throttle/altitude, terrain-following, investigate toggles
- **Models:** How an aircraft transits to and holds at its patrol station (speed and height) and how
  willingly it leaves to chase contacts.
- **Inputs / parameters:** **Transit throttle** and **station throttle** (e.g. cruise); transit
  altitude; station altitude; terrain-following toggle; the **1/3 rule** ("keep ⅓ airborne"); per-
  mission toggles **"investigate contacts outside the patrol area"** and **"investigate within weapons
  range"** (can be mutually exclusive); **"turn radar on inside area"**; a **repeatable-loop** toggle.
- **Behavior / rules:** You set both transit and station throttle/altitude. For a recon patrol the
  operator picks station altitude **6500 ft** (below a 7000 ft cloud base, above ~5000 ft AAA reach)
  to split detection vs survivability; alternatively **2000 ft + terrain-following**. The investigate
  toggles control whether the flight chases contacts **outside** the patrol box or only **within
  weapons range**.
- **Outputs / effects:** Defines patrol geometry, sortie rotation, and engagement willingness.
- **Edge cases / quirks:** For a **"random area"** patrol, **transit altitude must equal station
  altitude** (the aircraft is effectively always transiting between random points). **Repeatable-loop**
  patrols behave differently and decouple transit/station. (See barrier-CAP and prosecution-area rules.)
- **Source:** Q9s-NBZP-Yc; vYj5qAZ0NyM
- **Confidence:** High

### CAP staffing — the one-third (1/3) rule and on-station overrides
- **Models:** A combat air patrol keeps only a fraction of assigned aircraft airborne, rotating the
  rest, with an explicit override count.
- **Inputs / parameters:** Patrol mission with assigned aircraft; flight size; **1/3 rule** / "keep N
  airborne" setting; "enforce flight size"; transit & station throttle.
- **Behavior / rules:** The 1/3 rule keeps one-third of assigned aircraft airborne at a time, rotating
  the others. You can **override to an explicit count** ("keep 4 each", "keep one on station"). For
  support orbiters (AWACS) "keep one on station" launches a replacement as the first returns;
  **"enforce flight size"** guarantees replacement launches stay at full flight size even after losses.
- **Outputs / effects:** Number of aircraft maintained on station, rotation cadence, fuel-consumption
  profile.
- **Edge cases / quirks:** "Keep ⅓ of 6" = 12 airborne was deemed "too much" in one demo, overridden to
  a fixed 4; "keep ⅓" rejected outright in another ("a bad number") in favor of "keep four". Stagger
  takeoff times so you don't launch into a live enemy SAM (delay AWACS until the SA-5 is suppressed or
  it gets shot down).
- **Source:** Q9s-NBZP-Yc; Y9T2YfdWn8Y; VS5JIOvKQIE; eqYjCWRLeRM
- **Confidence:** High

### Endurance vs ready-time to sustain CAP (the doubling rule)
- **Models:** Keeping continuous CAP requires on-station endurance ≥ ground ready time.
- **Inputs / parameters:** On-station endurance (fuel ÷ burn-rate, e.g. P-51 ~6 hrs); ground prep/ready
  time (~3 hrs); missile/ammo count (modern jets).
- **Behavior / rules:** If aircraft can stay airborne **at least as long as it takes to ready the next
  batch (~3 hrs prep)**, you can **DOUBLE** the number airborne over time. If endurance < ready time
  and you launch everyone at once, you'll run out of airborne aircraft (coverage gaps). Modern jets
  with few missiles run out of **weapons** and RTB far sooner than fuel would suggest. Endurance ≈
  fuel-on-board ÷ burn-rate.
- **Outputs / effects:** Whether CAP can be sustained continuously or develops coverage gaps.
- **Edge cases / quirks:** Propeller aircraft cruise efficiently and stay up a long time even at
  military power; jets must be watched for fuel. Higher altitude = longer endurance but worse low-
  target detection (see altitude tradeoff).
- **Source:** 4ubDYtkAILU
- **Confidence:** High

### CAP coverage math — area-per-aircraft / area-per-flight
- **Models:** Quantifying how much patrol area each aircraft (and each flight) must cover, to size the
  CAP.
- **Inputs / parameters:** Patrol area size (nm × nm, e.g. ~50 × ~30 nm); number of aircraft flying;
  flight size.
- **Behavior / rules:** Compute **area ÷ number of airborne flights** for sq-nm-per-flight and
  **area ÷ aircraft** for sq-nm-per-aircraft. Example: 8 aircraft, flight size 4 → each of 2 flights
  covers **~400 sq nm**; flight size 1 → each aircraft covers **~200 sq nm**. Smaller flight size =
  better coverage and more simultaneous searchers, but less firepower per intercept; larger flights
  concentrate firepower but thin coverage. The bigger the zone, the more aircraft needed.
- **Outputs / effects:** Per-aircraft / per-flight area burden guiding flight-size and aircraft-count
  decisions.
- **Edge cases / quirks:** Without radar (visual only) and with clouds, one fighter responsible for
  hundreds of sq nm gives poor coverage. With radar vs slow propeller bombers the math is nearly moot
  (just detect on radar).
- **Source:** 4ubDYtkAILU
- **Confidence:** High

### Patrol altitude tradeoff (detection vs endurance vs threat); split high/low CAP
- **Models:** Choosing station altitude balances target detection, fuel endurance, and contrail/visual
  cues.
- **Inputs / parameters:** Station altitude; clouds; target altitude band; contrail altitude; threat
  envelope.
- **Behavior / rules:** Fly **lower** → easier to detect low targets but less endurance; fly **higher**
  → longer airborne time but harder to see/engage low targets. With clouds, **split the CAP into
  separate high and low missions** (fewer high looking for contrail-making high bombers, more low for
  low penetrators). With clear skies, put everyone at medium altitude. Summary: "fly lower = easier to
  detect; fly higher = stay up longer."
- **Outputs / effects:** Per-altitude detection/endurance profile; multi-layer CAP design.
- **Edge cases / quirks:** Bombers create contrails at high altitude (aids visual spotting); clever
  players hug terrain to defeat high CAP entirely.
- **Source:** 4ubDYtkAILU
- **Confidence:** Med

### Repeatable-loop barrier CAP
- **Models:** Aircraft flying a back-and-forth barrier line between two points instead of orbiting an
  area.
- **Inputs / parameters:** Two reference points defining the line; movement style = **repeatable loop**
  (instead of random-within-area); section sizing; ability to send sections to opposite ends.
- **Behavior / rules:** Setting movement style to repeatable loop makes the flight run a **barrier
  between two points**. Combined with a prosecution area it loiters on the line and only engages inside
  the kill box. Position flights at **opposite ends** so each turn yields a fresh look down the line.
  The barrier can be made very "nutty"/zig-zag — excellent for ASW barriers.
- **Outputs / effects:** Continuous barrier coverage along a line; repeated fresh sensor looks.
- **Edge cases / quirks:** Spreading sections along the line gives continuous coverage; pairs with
  prosecution-area engagement gating.
- **Source:** 4ubDYtkAILU
- **Confidence:** High

### Prosecution area vs Patrol area (engagement boundary)
- **Models:** Two distinct zones — where aircraft loiter (**patrol**) vs where they are permitted to
  engage (**prosecution**).
- **Inputs / parameters:** Patrol-area polygon; prosecution-area polygon; **"investigate / leave patrol
  area"** toggle (must be ON for the technique); **"stay within weapon range"** toggle (usually OFF);
  active-emissions-in-prosecution-area toggle; a central anchor waypoint added via **"add all points"**;
  repeatable-loop.
- **Behavior / rules:** Aircraft on a **patrol** area MAY shoot **outside** that zone; a **prosecution**
  area restricts engagement to **only inside** it. For a barrier-CAP, make the loiter line the patrol
  track and a larger prosecution area the kill box; aircraft only engage detected contacts within the
  prosecution zone and otherwise keep flying the patrol/barrier. The technique **requires** enabling
  "leave patrol zone and stay in prosecution zone"; turn **off** "stay within weapon range" (that only
  engages things within weapon range of the central point). Submarine missions also use a prosecution
  area to stop the sub firing into things outside its zone. Fighters fly "power donuts" around the
  anchor until a contact violates the zone, engage, then return.
- **Outputs / effects:** Geographic gating of weapon engagement separate from loiter geometry.
- **Edge cases / quirks:** You can enable active emissions specifically within the prosecution area.
  Making the prosecution zone too small is dangerous against long-range-missile enemies; some split it
  into **North/South** zones. Patrol-only zones allow firing outward; prosecution zones do not.
- **Source:** 4ubDYtkAILU; y0vcyujzgRE; Fz6_cwdMjYU; VS5JIOvKQIE
- **Confidence:** High

### Layered inner/outer ring air-defense (nested patrol + prosecution)
- **Models:** Two concentric CAP zones for defense in depth.
- **Inputs / parameters:** Inner-ring polygon; outer-ring polygon; larger section sizes for max
  firepower inside; doctrine **"maximum firepower."**
- **Behavior / rules:** Build an **outer ring** whose *patrol* zone is the inner ring and whose
  *prosecution* zone is the outer ring, so outer-ring fighters loiter inner but engage out. The
  **inner ring** holds maximum-firepower flights (larger sections) as a last-ditch zone. Set doctrine
  to "maximum firepower" for big groups. Aircraft on prosecution immediately turn toward the zone edge
  and engage aggressively once contacts touch it.
- **Outputs / effects:** Defense-in-depth engagement layering around a high-value asset.
- **Edge cases / quirks:** Narrator is "not really a fan" but it works fairly well; prioritization
  defaults to the nearest target first.
- **Source:** 4ubDYtkAILU
- **Confidence:** Med

### Single-point orbit ("power donut") vs multi-waypoint track for AWACS/tanker/CAP anchors
- **Models:** An aircraft holding over one point flies continuous orbits, acting as a rotating radar.
- **Inputs / parameters:** A **single** waypoint/anchor assigned to the mission's patrol area; an
  aircraft with side-looking/airborne radar; loop = repeatable/continuous.
- **Behavior / rules:** Instead of drawing a multi-point line, assign a **single point**; the aircraft
  flies continuous orbits ("air donuts"/"power donuts") around it until recovery. With repeatable loop
  set, fighters orbit the anchor and "go into a constant circle like a radar does" — usable as a cheap
  AWACS substitute.
- **Outputs / effects:** Aircraft hold a continuous orbit over one anchor, providing rotating radar
  coverage and returning there after engagements.
- **Edge cases / quirks:** Especially natural for side-looking airborne radar. A line of waypoints is
  "completely unnecessary" for orbit tracks.
- **Source:** y0vcyujzgRE
- **Confidence:** High

### Flights-on-station / flights-to-investigate / flights-to-engage caps
- **Models:** Throttling how many flights respond, to keep coverage in multiple directions and avoid
  over-committing.
- **Inputs / parameters:** Flight size; **number of flights to keep on station**; **number of flights
  to investigate unknown contacts**; **number of flights to engage hostile contacts**.
- **Behavior / rules:** For HVT escort: flight size 2; keep **four** on station (so coverage exists in
  case threats come from both directions); set flights-to-investigate-unknowns = **1** and flights-to-
  engage-hostiles = **1**, deliberately limiting how many flights run off after bad guys in any one
  direction (prevents all escorts chasing one group and leaving the HVT exposed).
- **Outputs / effects:** Caps the flights that leave station to investigate/engage, preserving
  directional coverage of the protected asset.
- **Edge cases / quirks:** Keeping investigate/engage low is a deliberate trade so the escort isn't
  drawn off the HVT.
- **Source:** y0vcyujzgRE
- **Confidence:** High

### Patrol/CAP "spread out" launch options
- **Models:** Checkboxes controlling whether patrol aircraft fill/spread into the whole zone and how
  aggressively they launch.
- **Inputs / parameters:** Patrol area (Ctrl+F11, e.g. AAW patrol); the mission's restricting
  checkboxes; per-unit activation times; throttle/altitude.
- **Behavior / rules:** **Unchecking** the mission's restricting boxes lets aircraft spread out into the
  whole zone as fast as possible and get airborne immediately. Activation times stagger/delay launches.
  CAP aircraft loiter in the zone and chase/engage detected hostiles once trouble develops.
- **Outputs / effects:** Aircraft launch and distribute across the patrol area; engage contacts that
  enter; timing controlled by activation settings.
- **Edge cases / quirks:** Match patrol-area size to the map. Activation times let you stagger or delay
  engagement.
- **Source:** vYj5qAZ0NyM
- **Confidence:** Low

---

## Support / on-call missions, refueling & sortie tempo

### Support (on-call) mission + unassign / strike / reassign loop for ad-hoc attack
- **Models:** Keeping strike aircraft airborne on a support mission and pulling them off momentarily to
  attack newly found targets, then returning them.
- **Inputs / parameters:** A Support mission with patrol area sized to aircraft **strike radius**; the
  1/3 rule; a recon-found target; **F1** manual-assign-to-target; **right-click → reassign-to-mission.**
- **Behavior / rules:** Create a Support mission that keeps aircraft orbiting near the expected fight
  (area sized within strike radius, e.g. half of a 540 nm radius). When recon finds a target: **unassign
  a flight (F1/assign), order it onto the target, let it strike, then right-click reassign it back** to
  the support mission to keep it airborne. This yields detection-to-attack times **under ~5 minutes** vs
  launching cold from base (much slower). Keep the **1/3 rule ON** for support so you don't burn all
  aircraft at once.
- **Outputs / effects:** Very low reaction time to pop-up targets; a continuous on-call airborne strike
  pool.
- **Edge cases / quirks:** Works for any mission type (e.g. pre-position strikers on support before
  recon reveals an airfield). With aerial refueling the loop is even more sustainable. If you **delete**
  a mission, aircraft still airborne tied to it "won't know what to do" and just circle.
- **Source:** o1k2qzwV-zU
- **Confidence:** High

### Support mission scheduling — takeoff time vs Time-On-Station vs activation/deactivation time
- **Models:** How CMO times tanker/AWACS-type support so they reach orbit before the strike packages
  that depend on them.
- **Inputs / parameters:** Mission type = Support; assigned units (e.g. KC-135R tankers, E-8 JSTARS);
  **Time On Station (TOS)**; optional takeoff time; activation time; deactivation time; transit
  distance to station.
- **Behavior / rules:** Choose **one** of three scheduling philosophies: (1) set a **takeoff time**,
  (2) set a **Time On Station**, or (3) **activate/deactivate** the mission at specific times. Using a
  station time, reason that the unit needs **~30–40 min** to fly to position, so for a desired on-
  station of 0340 set station time 0340 (the engine back-computes launch). Set a **deactivation time**
  (e.g. "0"/midnight = end of night) so the mission runs the whole window. Setting a station time
  "kicks everything off" immediately when you click away. Rule of thumb: dependent **CAP should be on-
  station BEFORE the support track** — CAP station 0335 to precede the tanker's 0340.
- **Outputs / effects:** Aircraft launch/transit are scheduled so the unit is physically on station at
  the specified time; the mission auto-disables at the deactivation time.
- **Edge cases / quirks:** Station time is computed from transit — you set the **arrival** time, not
  launch. "0" deactivation meant midnight. Pause the sim before editing any mission.
- **Source:** Pbx_3HTS9Tk
- **Confidence:** High

### Air-to-air refueling assignment between packages (shared tanker pool)
- **Models:** A range-limited strike package made viable by designating a separate (tanker) package as
  its refueling source; tankers are a shared pool any thirsty flight can use.
- **Inputs / parameters:** On a range-limited package, an **"air-to-air refueling"** selector pointing
  to another package (the tanker package); the tanker package itself (set up with radars/role).
- **Behavior / rules:** A package shows a range/fuel warning → open its air-refueling option → select
  the tanker package as provider → the range warning **clears** and flights generate without errors.
  Once tankers launch, **ANY flight can use them** — the assignment is **not exclusive** ("anybody can
  use them").
- **Outputs / effects:** Range-limited flights are cleared to plan/launch; aircraft fly out, return to
  a tanker, then continue; in the demo many flights repeatedly RTB'd to refuel.
- **Edge cases / quirks:** Tanker availability is the gating factor — without tankers the long flight is
  rejected; with them the AI accepts it ("an awfully long flight but whatever you say boss"). Some
  aircraft still ran out of gas despite tankers.
- **Source:** OOMcIVfQxaQ
- **Confidence:** Med

### Forced mid-route refueling via inserted "Refuel" waypoint
- **Models:** Compelling a flight to top off at a tanker at a specific point in its route.
- **Inputs / parameters:** **"Insert waypoint"** (default type "turning point"); set the waypoint type
  to **"Refuel"**; reposition it near an available tanker (KC-135); a prompt to disable refuel at all
  other waypoints; **"Edit refueling missions"** settings incl. **"follow receiver's flight plan"**
  toggle.
- **Behavior / rules:** In the Flight Plan Editor, **Insert waypoint** → change type to **Refuel** →
  the editor prompts "disable it for all except this one?" → drag the refuel waypoint to where a tanker
  orbits. At runtime, **even with plenty of fuel aboard**, the flight stops at that waypoint and takes
  on gas, then continues. Separately, "Edit refueling missions" lets you pick the tanker mission and
  toggle e.g. "follow receiver's flight plan" (disable it so the tanker doesn't trail the strikers
  ~50 mi to the target).
- **Outputs / effects:** Flight detours to the refuel waypoint, tanks, and resumes; tanker behavior per
  the refueling-mission settings.
- **Edge cases / quirks:** Forces refueling even when not needed (it's a hard waypoint). Tanker follows
  receivers unless "follow receiver's flight plan" is disabled. Confirmed: the aircraft tanked at the
  dragged waypoint exactly as scripted.
- **Source:** yWAmaMli_Qw
- **Confidence:** High

### In-flight refueling via tanker tracks (track geometry & top-off time)
- **Models:** Strike aircraft topping off mid-route by linking with a tanker on a defined track.
- **Inputs / parameters:** A **tanker support mission** (KC-135s); a tanker track/orbit (recommended
  **short, ~5–6 miles or even a single point**, NOT ~35 miles apart); a **Refuel-type waypoint** on the
  strikers' route over the track; transit-altitude setting; available time at the track.
- **Behavior / rules:** Create a tanker support mission and get all tankers airborne. On the strike
  mission set a route waypoint's type to **Refuel** (from Turning Point Ingress → Refuel, with
  confirmation prompts), positioned over the track. Strikers fly to the refuel point and **automatically
  link** with a tanker (a "chain line" connects them), then continue. Strikers can also opportunistically
  grab a tanker encountered en route. Position refuel so aircraft arrive at the target near-full.
- **Outputs / effects:** Aircraft fuel state increased mid-mission; a tanker-to-receiver link; long-
  range missions (demo route ~412 mi each way) become feasible.
- **Edge cases / quirks:** Aircraft do **NOT** always fill completely — too little time at the track and
  they leave partially fueled ("you have to keep that in mind when you give them time"). Tracks set too
  long (~35 mi) waste tanker transit; keep them short. **Transit altitude defaulting to "Max" burns
  excessive fuel** climbing — drop it to the aircraft's operating altitude. Send tankers home by
  selecting the group and pressing **"b"** (RTB).
- **Source:** _mQqGS3XxR4
- **Confidence:** High

### Refuel-aircraft assignment trap (do NOT add tankers to the consuming patrol mission)
- **Models:** Why dedicated refuelers must be in their own support mission, not folded into the patrol
  they feed.
- **Inputs / parameters:** Tanker/refueler aircraft; choice to add them to the patrol mission directly
  vs to a separate boom/support mission.
- **Behavior / rules:** You **CAN** add refuelers directly into the patrol mission and it "works
  initially," but when those tankers run low they **RTB per their own logic**, leaving the patrol
  aircraft with no tanker — and the patrol aircraft then run out of fuel and "fall right out of the
  sky." Correct approach: put refuelers on a **separate support (boom) mission** with their own track so
  receivers can top off without the tankers abandoning them.
- **Outputs / effects:** Whether fuel supply to the patrol persists; mass fuel-starvation losses if done
  wrong.
- **Edge cases / quirks:** The failure mode is catastrophic and **delayed** ("lose 30 F-35s because they
  went swimming"). Unprotected refueling tracks get attacked — the enemy "always" goes for the
  refuelers; put a protective mission around the track.
- **Source:** -c-IH_4sI-A
- **Confidence:** High

### Automatic air-to-air refueling between engagements
- **Models:** Fighters topping off from an organic tanker without explicit orders.
- **Inputs / parameters:** Presence of a friendly air-refueling unit; fighters' fuel state; optional
  manual refuel order.
- **Behavior / rules:** Fighters "**will refuel on their own — we don't actually have to order them to
  refuel.**" Between battles you **can** manually send them to the tanker for a quick top-off so they're
  ready for the next wave, but the engine handles it automatically when needed.
- **Outputs / effects:** Fighters transit to the tanker, refuel, and return to station — automatically
  or on command.
- **Edge cases / quirks:** Manual refuel is optional optimization; the AI refuels autonomously by
  default.
- **Source:** y0vcyujzgRE
- **Confidence:** High

### Sustained operations (reload/turnaround time) & surge-vs-trickle scheduling
- **Models:** Long ground reload times that dictate launching everything in daylight then reloading
  overnight.
- **Inputs / parameters:** Mission **"sustained operations"** setting; per-unit reload / time-to-
  available (example ~20 hours); daylight window; carrier rearm/refuel time (~3 hours).
- **Behavior / rules:** Under sustained operations, reload time can be very long (a reload showed
  **~20 hours**). Because the platform is useless at night anyway, the optimal pattern is to **surge
  everyone during daylight, then reload overnight**, rather than dribbling sorties. Carrier aircraft
  returning need **~3 hours** to rearm/refuel/maintain before re-launch.
- **Outputs / effects:** Drives surge-vs-trickle sortie scheduling and downtime.
- **Edge cases / quirks:** Recon bombers with poor side/rear visibility were avoided as endurance recon
  because they'd take **~2 days** to service afterward, outside the scenario time limit. (See also the
  Logistics "ready/arm time" rule and "quick turnaround.")
- **Source:** o1k2qzwV-zU
- **Confidence:** Med

### Aircraft ready/arm (loadout preparation) time
- **Models:** The lead time before a parked aircraft can launch once you assign a weapon loadout.
- **Inputs / parameters:** Selected aircraft + chosen loadout (Ready→Armed); air-ops **tempo (surge vs
  sustained)** in Doctrine & RoE; magazine stocks; a **"quick mode"/"enable quick"** toggle; scenario-
  editor **"ready immediately"** / "set time to ready" overrides; multi-select (click, Shift+click,
  Ctrl+click) to ready several at once.
- **Behavior / rules:** Selecting a loadout via Ready→Armed begins a **preparation countdown** before
  the aircraft is usable. Different loadouts on the same airframe have different prep times (observed
  **3 hours**, **6 hours**). The dialog shows weapons carried, count available from base/ship, and
  ranges/profiles. **Tempo matters:** the *same* loadout that readies in **3 hours** under surge takes
  **20 hours** under "sustained" (sustained bakes in maintenance, crew rest, etc.). You may order an
  unready aircraft into a mission; it just won't take off until ready. In the editor you can force
  "ready immediately" or set a custom time (e.g. 2h, 3h). A "quick mode" exists but **does NOT
  necessarily make the loadout finish faster.**
- **Outputs / effects:** A per-aircraft ready countdown; aircraft becomes launchable when it elapses;
  consumes magazine stock.
- **Edge cases / quirks:** Aircraft flagged **"in maintenance"** by the designer cannot be used unless
  in the scenario editor (a way to make them targets only). Long-range loadout variants may take longer
  to prepare. Tempo can only be changed in the editor. Two red loadout buttons are editor-only.
- **Source:** Q9s-NBZP-Yc; k2Fc8dVycIQ
- **Confidence:** High

### Quick-turnaround ("enable quick") ready setting
- **Models:** An airfield rapidly re-services and relaunches aircraft instead of a long full
  turnaround.
- **Inputs / parameters:** Per-aircraft **"enable quick"** / quick-turnaround flag (**Ctrl+Shift+F9**
  sets quick-turnaround to yes); loadout type.
- **Behavior / rules:** When readying aircraft, the "enable quick" button must be toggled on; if it's
  off, that's the "universal sign you forgot something." With it on, the field keeps relaunching
  aircraft quickly, sustaining traffic; without it you get far fewer cycles. Quick turnaround foregoes
  long turnaround between landings for a **limited number of sorties** (it just refuels and relaunches).
- **Outputs / effects:** Shorter re-arm/refuel turnaround so units cycle back into the air faster.
- **Edge cases / quirks:** For pure fighters you can sometimes leave it off; for sustained traffic it
  must be on. A normal full turnaround can be **6–9 hours** for large aircraft.
- **Source:** v015fQfQ9tc; Y9T2YfdWn8Y; k2Fc8dVycIQ
- **Confidence:** Med

### Special loadout states (Reserve / Maintenance / Ferry)
- **Models:** Non-combat airframe states governing whether an aircraft is usable and whether it remains
  targetable.
- **Inputs / parameters:** Aircraft loadout assignment in the scenario (Reserve / Maintenance / Ferry).
- **Behavior / rules:** **Reserve** = ready-to-use aircraft with no loadout currently assigned (loadout
  id 3 is used for civil traffic because per-aircraft loadouts aren't known). **Maintenance** = unusable
  (cannot launch) but still **physically present and therefore still targetable** by the enemy — the
  designer's way to make static ground targets. **Ferry** carries maximum fuel.
- **Outputs / effects:** Reserve aircraft can be armed/launched once a loadout is chosen; Maintenance
  aircraft cannot sortie yet remain destroyable; Ferry maximizes fuel/range.
- **Edge cases / quirks:** The key distinction is that Maintenance aircraft count as present-for-
  targeting even though they cannot fly.
- **Source:** k2Fc8dVycIQ; Y9T2YfdWn8Y; K2KCpbYHrtc
- **Confidence:** High

### Logistics — magazines, weapon inventory & loadout availability
- **Models:** Aircraft can only load weapons that physically exist in compatible magazines at the base.
- **Inputs / parameters:** Magazine contents (weapon type + quantity); weapon–aircraft compatibility; a
  **"only show weapons compatible with the aircraft that exist here"** filter; the scenario-wide
  **"unlimited ammo"** flag; loadout type (reserve/ferry/maintenance/quick).
- **Behavior / rules:** Loadouts appear **italicized/unavailable** if the required weapon isn't in stock
  anywhere at the field; you must **stock the ammo magazine** (add weapon, by keyword) before that
  loadout becomes selectable. The "unlimited ammo" setting removes stock limits **but arms every side,
  including the enemy's nukes/anti-ship** (a double-edged toggle).
- **Outputs / effects:** Which loadouts are armable, current magazine quantities, and whether an
  airframe is in the ready pool.
- **Edge cases / quirks:** You **cannot bulk-fill** magazines with shift-select — each weapon line is
  set individually. Comms-disruption and similar scenario flags are separate toggles.
- **Source:** Y9T2YfdWn8Y
- **Confidence:** Med

### Pilot exhaustion / crew fatigue (flying-time limit)
- **Models:** Aircrew fatigue accumulating with continuous airborne time, forcing RTB when exhausted.
- **Inputs / parameters:** Per-platform **max flying time** (fixed duration in the unit panel); elapsed
  airborne time of the specific aircraft.
- **Behavior / rules:** Each aircraft tracks **"flying time"** against a per-platform maximum ("how long
  your aircraft can remain in the air and still have a pilot that can function"). As time accumulates
  the status color shifts (turns "a little yellow" at ~3 h 9 min for a fighter). At/over the limit the
  aircraft "no longer keeps going" and automatically RTBs; the RTB reason is shown as **"exhaustion."**
  **Refueling from a tanker refills fuel but does NOT reset the exhaustion clock** — only landing/
  recovery at base (getting "new pilots") resets it. Stated limits: fighters **~8 h** (exhaustion at
  "8 hours and 5 minutes"); **KC-135 = 12-hour** limitation; another type shown with a **one-day (24-h)**
  limitation.
- **Outputs / effects:** The "flying time" counter increments; status color shifts toward yellow; at the
  limit RTB reason = "exhaustion" and the unit flies home autonomously; landing/recovery resets the
  timer.
- **Edge cases / quirks:** Refueling no longer lets you stay up indefinitely (the "tanker cheese" is
  prevented). The tanker's 12 h limit is **lower** than some other types' 24 h. Speculative/unconfirmed:
  possible future two-stage fatigue (e.g. 8 h per mission vs 18 h over 2 days) and operational-accident
  effects.
- **Source:** lERU0OuVzMU
- **Confidence:** High

### Auto return-to-base triggers (Winchester / damage / exhaustion / bingo)
- **Models:** Conditions that cause a mission-assigned aircraft to autonomously break off and fly home
  (or to a tanker).
- **Inputs / parameters:** Remaining ammunition (configurable RTB-on-Winchester behavior); damage state;
  exhaustion timer; fuel/bingo state; tanker availability.
- **Behavior / rules:** Aircraft return to base "as fast as it can" when any RTB trigger fires.
  Demonstrated triggers: (1) **out of ammunition** (operator configured units to leave the patrol zone
  only when out of ammo — i.e. RTB-on-Winchester is settable); (2) **damage** (damaged aircraft break
  from the formation and head home to recover/get new pilots); (3) **exhaustion** (flying-time limit).
  **Low fuel sends the unit to an available tanker** (refuel and resume) rather than home, so fuel alone
  need not force RTB if tanking is set up.
- **Outputs / effects:** The unit detaches from its mission formation and routes to base; on arrival it
  recovers (rearm/refuel/new pilots) before redeployment.
- **Edge cases / quirks:** Damage RTB overrides staying on station. (See "RTB lock" — once committed to
  RTB, switching missions requires the new mission to be active.)
- **Source:** lERU0OuVzMU
- **Confidence:** Med

---
