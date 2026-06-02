# Strike & Weapons — Part 2/3

**Scope.** This document is an *exhaustive* functional-rules spec for the **Strike & Weapons** bucket
of Command: Modern Operations (CMO), Part 2 of 3. It covers the mechanics in the source set below:
ballistic-missile / re-entry-vehicle employment, nuclear weapons, the platform-armament editor model,
the weapon-employment gating chain (fire-control checks), Weapon Release Authorization (WRA) range &
shot discipline, probability-of-hit / survivability math, anti-radiation missiles and SEAD,
directed-energy weapons (microwave/EMP, solid-state laser, dazzler), C-RAM and projectile object
modeling, laser-guided weapons / buddy lasing, air-to-ground munition effectiveness, snap-up /
kinematic engagement limits, and strike-mission planning & coordination. **Sibling parts (1/3 and 3/3)
cover the remaining Strike & Weapons rules** — do not assume a mechanic is missing from CMO just
because it is absent here.

**Caveat — auto-generated captions.** These rules were synthesized from auto-transcribed tutorial
video captions. Stated numbers, weapon names, and option labels are reproduced **verbatim** where
given, but some figures and proper nouns may carry transcription error (flagged where it matters, e.g.
HOBOS minimum range read as "1 to five"). Confidence ratings reflect how clearly each mechanic was
demonstrated in the source. Nothing here is invented; gaps are left as gaps.

---

## 1. Ballistic Missiles & Re-entry Vehicles

### Manual / bearing-only ballistic launch vs automatic valid-target restriction
- **Models:** Two distinct launch paths for ballistic missiles. A manual point/bearing launch lets the
  operator fire at any arbitrary map coordinate — even at targets the engine will **not** auto-engage —
  whereas an automatic engage requires the contact to be a "valid target" for that weapon type.
- **Inputs / parameters:** Launch command — **Ctrl+F1** = manual / bearing point launch (click a map
  point, then allocate rounds); **Shift+F1** = automatic engage of a contact. Weapon-vs-target-type
  validity table (a surface ship is **not** a valid auto-target for these SRBMs). Per-shot allocation
  (double-click to allocate a round to a contact in the auto path).
- **Behavior / rules:** Ctrl+F1 lets the operator click any map coordinate (center of a ship, or grid
  points around an area) and assign ballistic rounds there manually. The same weapon **cannot** be
  auto-launched (Shift+F1) at a surface vessel because it is "not considered a valid target" for that
  ballistic-missile type. Individual missiles can be hand-aimed across a grid pattern. Allocating a
  round to a contact in the auto path requires a **double-click**.
- **Outputs / effects:** Missiles assigned to manual coordinates or to auto-engaged contacts; impacts
  at the chosen points.
- **Edge cases / quirks:** A bearing-launched SRBM (**SS-26**) actually damaged a *stationary* aircraft
  carrier and a parked vehicle despite the carrier not being an auto-valid target — surprising the
  narrator. Dedicated **anti-ship ballistic missiles** (DF-21, "Donald Fang") exist for the valid
  auto-engage carrier case. **Context note:** Ctrl+F1 here = manual ballistic point-launch, distinct
  from Ctrl+F1's manual-bomb-drop usage in the ship-bombing video — the meaning is context/weapon
  dependent.
- **Source:** DsFGDL-MOUA
- **Confidence:** High

### ESM-cued ballistic saturation strike on imprecise targets
- **Models:** A sensor platform (drone with ESM) localizes emitters to a coarse, "non-precise" area
  fix; ballistic missiles are then fired in a grid pattern to saturate that area and destroy the
  target even without a precise coordinate.
- **Inputs / parameters:** ESM detection (drone emitter-locates SAM/radar contacts, classifying e.g.
  Big Bird radar, SA-22); position confidence (improves over time as the emitter is tracked, "more and
  more confident"); a grid/saturation pattern of manual launch points; number of missiles; warhead
  size.
- **Behavior / rules:** Drone ESM produces a coarse area location for emitters; confidence tightens
  with continued tracking. The operator manually lays a grid of ballistic impact points across the
  suspected area and fires to saturate. With enough rounds the technique reliably destroys the
  SAM/radar ("the radar's gone") — the narrator confirms "ESM then follow-up with ballistic missiles
  worked perfectly." Stationary high-value emitters that stay visible are killed; **~8 missiles**
  were consumed per SAM site in the demo.
- **Outputs / effects:** Destroyed emitters/aircraft within the saturated area; heavy missile
  expenditure.
- **Edge cases / quirks:** A target "still visible on the map" after the strike likely survived (a
  partial-miss indicator). More sensor platforms = tighter fix ("with a third vehicle I could get a
  more precise shot"). Drones with insufficient lock quality cannot be engaged at all by some weapons.
  A third-party warhead with built-in ECM (an SS-26 variant) was noted as making intercept harder.
- **Source:** DsFGDL-MOUA
- **Confidence:** High

### Ballistic launcher readiness / launch-prep delay and salvo staggering
- **Models:** Ballistic launchers are not instantly ready — each takes time to spin up (erect/prep)
  before it can fire, so a multi-launcher volley fires in staggered waves rather than simultaneously.
- **Inputs / parameters:** Per-launcher readiness/prep time ("takes them a minute to get ready to
  fire"); the erect-to-launch sequence (launchers "raising up, pointing toward the sky"); number of
  launchers tasked.
- **Behavior / rules:** When a salvo is ordered, only the ready launchers fire; others "didn't fire
  because they're not ready to fire yet — it takes them a minute to get these things ready." Launchers
  visibly erect/point skyward during prep, then fire, producing staggered launch waves across the
  battery.
- **Outputs / effects:** A time-staggered launch sequence; delayed availability of follow-on rounds.
- **Edge cases / quirks:** The operator must wait/iterate ("let those go up") for subsequent launchers;
  this readiness gating shapes the effective rate of a saturation barrage. **No explicit numeric reload
  time is given** — only "about a minute" qualitatively.
- **Source:** DsFGDL-MOUA
- **Confidence:** Med

### Ballistic re-entry vehicle (RV) immunity to non-ABM defenses by speed/geometry
- **Models:** A ballistic RV arriving at high Mach on a steep re-entry gives the defended target little
  to no shot window; point/area defenders that are not dedicated ABM systems simply cannot engage it.
- **Inputs / parameters:** RV terminal speed (~**Mach 6**); steep re-entry geometry; defender weapon
  type (non-ABM SAMs like SA-21 cannot engage re-entering RVs); target type (stationary ship/airfield).
- **Behavior / rules:** Against a stationary carrier the narrator judged it would "not really get much
  of a shot" at an incoming Mach-6 RV; the round impacted and did real damage (Enterprise to ~quarter
  damage, air facilities damaged, deck fire). At the airfield an SA-21 "just been chilling" was
  "worthless — unable to engage targets re-entering the atmosphere at that speed." RVs with very large
  warheads wiped out most struck targets.
- **Outputs / effects:** High-Mach impacts; heavy damage on struck targets; non-ABM defenders
  contribute nothing.
- **Edge cases / quirks:** An ECM-equipped warhead variant (SS-26) further degrades intercept.
  Stationary/parked targets are especially vulnerable ("if you're stupid enough to park your vehicles
  you are now in missile range"). RVs cannot themselves engage very-low-lock-quality drones (not enough
  target lock).
- **Source:** DsFGDL-MOUA
- **Confidence:** Med

---

## 2. Nuclear Weapons

### Nuclear yield vs tactical/strategic classification (blast scales with yield only)
- **Models:** Whether a nuke is "tactical" or "strategic" is defined by intended **use**, not yield;
  in-game the ground effect is purely a function of yield/size.
- **Inputs / parameters:** Weapon yield (e.g. **10 kt, 15 kt, 200 kt, 15 Mt, 20 kt**); classification
  by usage rather than yield; target hardness/type.
- **Behavior / rules:** Tactical vs strategic is a usage distinction, not a yield distinction (tactical
  weapons can be 200 kt; strategic can be 15 kt). Against a city, a 10 kt tactical weapon and a 15 Mt
  strategic weapon "achieve the same goal" of leveling downtown — the difference is just blast
  **size/radius**. A 10 kt detonation flattened essentially every downtown building; a tank ~1.5 miles
  from the epicenter survived. Damage falls off with distance from epicenter; harder/distant objects
  can survive smaller yields.
- **Outputs / effects:** Area destruction scaling with yield; survival depends on distance from
  epicenter and target hardness.
- **Edge cases / quirks:** Yield does **not** change the tactical/strategic label. Tactical nukes are
  awkward against dispersed ground troops ("very awkward to hit a ground troop with a blast wave") —
  they were really meant for submarines and aircraft formations, not ground troops; a big nuke on
  ground targets is "too big a sledgehammer."
- **Source:** LO2zxtP5yFg
- **Confidence:** High

### Nuclear blast EMP blinding of radars
- **Models:** A nuclear detonation emits EMP that blinds nearby radars (notably SAM radars), separate
  from blast destruction.
- **Inputs / parameters:** Detonation proximity to radar-equipped units (SAM sites); EMP effect radius.
- **Behavior / rules:** When a nuclear weapon detonates near SAM sites, their radars are blinded by the
  EMP effects of the blast (called out as a demonstrated effect), degrading their ability to
  track/engage independent of physical blast damage.
- **Outputs / effects:** Affected radars blinded / SAM tracking disrupted around the detonation.
- **Edge cases / quirks:** Stated qualitatively; **no EMP radius value given** in this video.
  Conceptually parallels the microwave/EMP sensor-blinding mechanic (see §8).
- **Source:** LO2zxtP5yFg
- **Confidence:** Med

### Underwater nuclear detonation (nuclear depth bomb) shock model
- **Models:** A nuclear weapon detonated underwater creates a huge lethal shock-wave radius because
  water transmits the shock far better than air.
- **Inputs / parameters:** Yield (e.g. **B-57** sub bomb; **20 kt** example); detonation depth (drop
  from low altitude / shallow); distance of targets from detonation; medium = water.
- **Behavior / rules:** Air-delivered nuclear depth bombs (**B-57** multi-purpose sub bomb) are dropped
  on submarines; detonating that much energy underwater "splatters anything within ~a mile." A ~20 kt
  example produced a **~7–8 nautical-mile** underwater "mega explosion" lethal radius — water transmits
  the shock wave much better than other effects, so the underwater kill radius is large.
- **Outputs / effects:** A wide-area underwater kill zone destroying subs/sea life within radius.
- **Edge cases / quirks:** It is a "plus or minus" (area/proximity) weapon — exact aim is less critical
  underwater. The delivery aircraft should gain altitude before/at detonation to avoid friendly weapon
  effects (see *Friendly weapon-effects damage*, this section). 20 kt "is a lot bigger" than smaller
  tactical examples.
- **Source:** LO2zxtP5yFg
- **Confidence:** Med

### Nuclear air-to-air weapons require physical proximity/contact to the target
- **Models:** Nuclear anti-aircraft weapons (Bomarc, Genie) must still get close enough to the target
  formation to detonate effectively; the warhead does not magically reach out.
- **Inputs / parameters:** Weapon — **CIM-10B Bomarc**: 200-mile range, ~20,000 mph, **10 kt** warhead;
  **AIR-2 Genie**: a small unguided nuclear rocket. Engagement range; whether the weapon makes
  contact/gets close enough; formation tightness.
- **Behavior / rules:** Concept: one nuclear AA shot clears an entire bomber formation. Reality
  modeled: the weapon must physically get close enough to detonate — at extreme range (200 nm) Bomarcs
  commonly missed and did nothing, so it could take **~600 Bomarcs** to do real damage ("basically
  data-link weapons... trying to get close enough"). When one finally got close enough, a **single
  10 kt** detonation destroyed every aircraft in a tight formation (one survivor). The **Genie** is
  essentially **unguided** — you shoot and hope; it is much smaller than the Bomarc's warhead. A tight
  enemy formation maximizes the one-shot-clears-all effect.
- **Outputs / effects:** On a close-enough detonation, the whole formation is destroyed by one weapon;
  on a long-range miss, no effect.
- **Edge cases / quirks:** Bomarc fire has its own short ready delay ("can't fire for another 5
  seconds"). The Genie shooter was expected/designed "not to damage the shooter" (period assumption) —
  contrast with weapon-effects damage that actually occurs in-sim (next rule). **WRA/DLZ note:** a
  shooter can be told it is "out of DLZ range" yet does not need to be in the DLZ to take an
  unguided/area nuclear shot.
- **Source:** LO2zxtP5yFg
- **Confidence:** High

### Friendly weapon-effects damage and "avoid weapon effects" behavior
- **Models:** A unit's own / nearby nuclear detonation can damage friendly platforms; units can be set
  to actively avoid the weapon-effects radius.
- **Inputs / parameters:** Detonation location and effect radius; friendly platform position; an
  "avoiding weapon effects" setting/behavior on the unit.
- **Behavior / rules:** Nuclear effects damage friendlies in range: a delivering aircraft was damaged
  when its own **15 Mt** weapon went off. An "avoiding weapon effects" option/behavior exists — when
  active, the launching/nearby platform maneuvers away from the blast (demo: a Delta Dart / F-106 after
  firing a Genie ran clear and "dodged it very safely"). A unit **not** avoiding weapon effects while
  delivering a large nuke is in serious danger.
- **Outputs / effects:** Friendly units take damage if inside the effect radius; with avoidance
  enabled they egress to survive.
- **Edge cases / quirks:** Presented as a newer feature ("I don't know how long we've had that").
  Especially important for short-range/unguided nuclear AA (Genie) and low-altitude nuclear depth-bomb
  delivery (gain altitude / avoid before detonation).
- **Source:** LO2zxtP5yFg
- **Confidence:** Med

### Nuclear weapon dud chance (early-generation weapons)
- **Models:** Early/older nuclear weapons have a chance to fail to detonate (a dud), motivating firing
  several.
- **Inputs / parameters:** Weapon era/reliability (e.g. 1960s-era warheads); number fired.
- **Behavior / rules:** Because there is "always a chance you're going to get a dud," especially with
  early ~1960s weapons, the recommended play is to fire a **few** at the target rather than one, to
  ensure at least one detonates as intended.
- **Outputs / effects:** Some launched nuclear weapons may fail to detonate; firing multiples mitigates
  the risk.
- **Edge cases / quirks:** Tied specifically to early-generation weapons; **no numeric dud probability
  given.**
- **Source:** LO2zxtP5yFg
- **Confidence:** Med

---

## 3. Platform Armament Modeling (Weapon Editor)

### Weapon record vs weapon mount vs loadout (armament hierarchy)
- **Models:** How a platform's armament is structured — the firing weapon vs the launcher/station that
  holds it, and where added ordnance lives (unit vs loadout).
- **Inputs / parameters:** Platform type (aircraft/ship); the weapon item (e.g. AIM-120, AIM-7, GBU-12,
  SM-2 Block III, RIM, Tomahawk, AIM-9); the mount/station (VLS cell e.g. **Mk41**, gun mount);
  quantity per mount; mount firing arc.
- **Behavior / rules:** A platform has two layers: an "internal loadout" (always-attached, e.g. an
  internal gun) and the "actual loadout" (ordnance dangling on stations). The model hierarchy is:
  **weapon record** (the individual weapon, e.g. an AIM-9) → **mount** (the station holding N of them,
  shown as "x out of y", e.g. **4/4**) → **loadout** (the total package). On a weapon item you can "Add
  weapon record" or "Add mount"; on the loadout node you can do both; on a mount node you can **only**
  "Add mount." To add a brand-new weapon family you "Add weapon record"; to add a launcher/gun you "Add
  mount." Mounts can have a defined firing **arc** (e.g. a 30mm GO8 set to a wide arc fires in any
  direction in the arc, independent of the rest of the loadout). Ships start with nothing to attach
  weapons to, so you must "Add mount" first (e.g. a Mk41 VLS) to gain a firing capability; you can then
  set quantity per cell (drop to 0 and reallocate among missile types, e.g. **29/29** SM Block III).
- **Outputs / effects:** Platform gains/loses firing capability for a weapon; the mount shows available
  rounds (x/y); the arc defines engageable directions.
- **Edge cases / quirks:** Items with a **rate-of-fire of 60** are typically magazines/reloaders, **not**
  meant to be used as a fired weapon. Aircraft loadouts are fixed per mission: you cannot change a
  loadout, land, and keep it — a modified loadout must be edited in mid-flight, and changes made to the
  **unit** (a mount added to the unit) persist after takeoff while changes to the **loadout** do not
  (demo: a GO8 added to the unit stayed attached on launch while loadout edits were lost). Editing
  pulls from ~60 underlying databases; everything must be self-integrated or it silently will not work.
- **Source:** _4bB81QPcFc
- **Confidence:** High

### Mandatory data link for guided weapons
- **Models:** A guided weapon cannot be controlled/launched unless the launching platform carries the
  correct **matching** data-link communication device.
- **Inputs / parameters:** The weapon's required data-link type; data-link devices present on the
  platform (comms list); the specific variant (command data link, missile data link, two-way,
  off-board / CEC).
- **Behavior / rules:** When you add a data-link weapon (e.g. AIM-120), the editor automatically offers
  to add a data link to the aircraft and asks you to confirm the item — but it may default to the
  **wrong** data link, so you must search/select the appropriate one. There are distinct AIM-120
  data-link types: **command data link** (tells the missile what to do), **missile data link** (sends
  info back), **two-way** versions, and an **off-board** version enabling **CEC** (cooperative
  engagement, launching guided missiles via another platform). Skipping the data-link step leaves you
  with **no control** over the weapon and **no launches**. To find the needed link, open the weapon and
  scroll: it names the required link (e.g. "Aegis missile data link," "AIM-120 missile data link
  two-way"). There are **~50+** data-link variants; picking the wrong one (e.g. SSN two-way vs SPY
  two-way) yields a non-functional weapon.
- **Outputs / effects:** With the correct link the weapon is controllable/launchable. Without it (or
  with the wrong one), there is no launch — or a "no weapons director available to illuminate the
  target" type failure.
- **Edge cases / quirks:** The data link **persists** on the platform even after the matching weapons
  are expended (you keep the AIM-120 data link though you can't fire AIM-120s with none aboard). Some
  weapons add their data link automatically (the editor prompts); **SARH weapons do not prompt** and do
  not even tell you which illuminator guides them (see next rule).
- **Source:** _4bB81QPcFc
- **Confidence:** High

### Sensor / illuminator / targeting-component requirement for employment
- **Models:** Putting a weapon on a platform does not grant the ability to employ it; the platform must
  also carry the supporting sensors (illuminating radar, laser spot tracker, targeting pod) the weapon
  needs.
- **Inputs / parameters:** Weapon guidance type (SARH, semi-active laser / laser-spot-tracker,
  active-radar); platform sensors (e.g. **SPY** radar, a targeting pod such as the **Sniper pod**, a
  laser designator).
- **Behavior / rules:** Different guided weapons need different supporting tech: a SARH missile
  (**AIM-7**) needs sufficient radar illumination to even launch — without it you may fire and find you
  can't get illumination, and the editor will **not** warn you when adding it. A laser-guided bomb
  (**GBU-12**) has a laser spot tracker and is useless without laser-spot-tracker technology on the
  platform; adding a targeting pod (e.g. a **Sniper pod**, which is actually two components) supplies
  it. On a ship, you must add an illuminating/search radar (e.g. **SPY**) under Sensors and turn radars
  on before you can illuminate/engage surrounding targets.
- **Outputs / effects:** With the supporting sensor the weapon can illuminate/guide and engage; without
  it, it cannot fire ("no weapons director available to illuminate the target").
- **Edge cases / quirks:** The editor only auto-prompts for missing **data links**, never for missing
  illuminators/sensors — SARH and laser weapons can be mounted with no warning yet remain unusable.
  "For everything else to work correctly, it needs to be self-integrated."
- **Source:** _4bB81QPcFc
- **Confidence:** High

---

## 4. Weapon-Employment Gating (Fire-Control Chain)

### Weapons-fire diagnosis via manual engagement (Shift+F1) red/green readout
- **Models:** CMO gates weapon firing behind a chain of doctrine / authorization / physics checks; the
  manual-engagement panel surfaces each blocking reason as **red** (cannot) or **green** (can).
- **Inputs / parameters:** Manual engage / **Shift+F1** on a target; per-weapon status lines (red =
  cannot fire, green = can fire).
- **Behavior / rules:** Range alone does **not** trigger fire (unlike StarCraft). Open manual
  engagement (Shift+F1) and read each weapon's line: red text = a blocking reason, green = clear to
  fire. Resolve each red reason in turn; a weapon can fire once it shows green **and** no further
  range/precision limit applies. A green (non-red) weapon may still not actually fire if a numeric
  range/precision limit is violated.
- **Outputs / effects:** Per-weapon fire eligibility, plus a path to identify and clear each block.
- **Edge cases / quirks:** A weapon can show green yet still not fire due to a separate range or
  precision constraint (e.g. minimum-firing-range, imprecise target). Shift+F1 is repeatedly called the
  "magical trick" for diagnosing non-firing. **This is the master diagnostic for all the gates in this
  section.**
- **Source:** hCDLw5AZk0E
- **Confidence:** High

### Weapon-employment readiness delay (time-to-engage countdown)
- **Models:** After ordering an attack, a platform may not fire immediately; there is a computed delay
  before the weapon can be employed even when all components and range are satisfied. This is the
  fire-control / director-availability flavor of the broader OODA delay (see also *OODA-loop engagement
  delay*).
- **Inputs / parameters:** Platform/weapon system spin-up or director-availability time; whether the
  target is in range; the correct data link present.
- **Behavior / rules:** Ordering an attack on an in-range target can produce a fire-control delay
  countdown before launch (demo: a Q-ship in range showed a **307-second delay** before it could
  engage). The clock must expire, then the engagement proceeds — but it still requires the mandatory
  data link; an illumination/director failure ("no weapons director available to illuminate the
  target") blocks it regardless of the timer.
- **Outputs / effects:** A countdown timer to engagement; on expiry the platform attempts to launch
  (subject to data-link / illumination checks).
- **Edge cases / quirks:** Having all weapons physically on the platform does **not** mean it can employ
  them; range alone is insufficient. (Separately, aircraft have a "time to ready" arming clock — e.g.
  set ready in 00:01 to make a plane ready in ~1 minute — before they can launch.)
- **Source:** _4bB81QPcFc
- **Confidence:** Med

### OODA-loop engagement delay (time to bring a weapon to bear)
- **Models:** Acquiring a target does not allow instant fire; the crew must Observe, Orient, Decide,
  Act before shooting, and this takes a crew-and-platform-dependent amount of time.
- **Inputs / parameters:** Crew/platform combat-system generation (modern SAM = fast; WWII-vintage
  Fletcher Combat System Gen 1 = slow); time-to-engage value shown per engagement (e.g. **SA-5 crew 36
  sec; Fletcher 282 sec**); how early the target was known.
- **Behavior / rules:** Per OODA: point the weapon, calculate, confirm hostile, then begin shooting.
  CMO shows the delay: a good SAM crew takes **36 seconds** (called very fast); a WWII **Fletcher**
  destroyer takes **282 seconds** to bring its 5-inch guns around. The **only** way to shorten it is to
  have known about the target sooner. During the wait the target can freely attack ("nothing stopping
  that MiG-15 from taking pot shots").
- **Outputs / effects:** A countdown before fire; longer for older/slower combat systems.
- **Edge cases / quirks:** Small guns / machine guns may fire sooner but are often not represented for
  some platforms, so the ship may be defenseless during the long spool-up.
- **Source:** hCDLw5AZk0E
- **Confidence:** High

### Imprecise-target gate (radar cannot localize a distant/high target)
- **Models:** A weapon cannot engage a target the firing radar cannot localize precisely enough; it
  must wait until the target is close enough to resolve.
- **Inputs / parameters:** Target range/precision quality; radar type (a continuous-wave / large
  fire-control radar helps); target altitude vs radar mechanical elevation.
- **Behavior / rules:** "Automatic fire not possible — weapon is unable to engage imprecise targets":
  when a target is too far, the radar can't point exactly where the target is, so no aim/hit is
  possible — the unit can't even aim. Ordering it to fire anyway makes it take the shot the instant the
  target is close enough (a "snapshot"); firing "resolved the ambiguity immediately" — the true
  position was elsewhere than the estimate. A big continuous-wave fire-control radar improves precision
  and helps engage.
- **Outputs / effects:** Fire deferred until the target is localized; on firing, the position ambiguity
  resolves and engagement proceeds.
- **Edge cases / quirks:** Very high re-entering "fireball" ballistic targets (e.g. 848 km, then lower)
  cannot even be tracked because the radar can't mechanically point high enough. **Jamming is not the
  cause here** — these are simply imprecise/hard targets.
- **Source:** hCDLw5AZk0E
- **Confidence:** High

### IR missile target-aspect (Stern-Chase) constraint
- **Models:** Certain IR missiles (early Sidewinder) can only be fired from behind the target
  (rear/stern aspect); head-on shots are out of envelope.
- **Inputs / parameters:** Weapon aspect capability ("Stern Chase weapon"); engagement geometry
  (head-on vs from behind); a target-aspect-vs-range check.
- **Behavior / rules:** In a head-on engagement, Shift+F1 reports "target aspect is out of range for
  this type of weapon" — you can't hit because you're not behind it. The Sidewinder's data lists it as
  a **Stern-Chase** weapon. The only way to know is the Shift+F1 readout or the weapon's own details.
  Workaround shown: fire cannons in the merge instead.
- **Outputs / effects:** IR missile fire blocked from the front; allowed from the rear aspect.
- **Edge cases / quirks:** High-speed head-on passes give no shot; falling back to guns in one pass got
  all the attacking aircraft killed — illustrating the constraint's tactical cost.
- **Source:** hCDLw5AZk0E
- **Confidence:** High

### Weapon minimum range and vertical bore-side firing limits
- **Models:** Weapons have a minimum firing range and an angular cone limit; being too close or at too
  steep an angle blocks firing even with a valid lock.
- **Inputs / parameters:** Weapon min/max range (**GBU-8 HOBOS** min range "1 to five" — i.e. ~1 nm);
  target slant geometry; an "outside vertical bore-side limit" condition.
- **Behavior / rules:** With a valid lock the operator still can't fire when inside minimum range ("I
  was within one mile") — error "outside of vertical bore-side limit." Getting too steep/overhead also
  triggers the bore-side limit. You must back off to beyond min range and into the allowed angular cone
  before the weapon will release.
- **Outputs / effects:** Fire blocked until range/angle constraints are satisfied; otherwise the weapon
  releases.
- **Edge cases / quirks:** The same constraint applies to the player's own glide weapons, not just
  enemy SAMs. The exact HOBOS minimum read as "1 to five" (**auto-caption ambiguity**).
- **Source:** WotKOJAiKlk
- **Confidence:** Med

### Weapon cannot fire backwards (geometry, no explicit warning)
- **Models:** A weapon already past or behind its target can't shoot backward; CMO may give **no
  explicit warning**, so the operator must reason geometrically.
- **Inputs / parameters:** Relative geometry of shooter vs target (target behind the shooter).
- **Behavior / rules:** After overflying a target, a weapon "simply can't shoot backwards." This case
  can present with no clear warning text — the operator must apply common sense; Shift+F1 still helps
  but the explanation can be implicit.
- **Outputs / effects:** No fire when the target is behind the shooter.
- **Edge cases / quirks:** Explicitly noted there may be "no warning here" — distinct from the explicit
  red-text gates.
- **Source:** hCDLw5AZk0E
- **Confidence:** Med

### Line-of-sight / illumination gating of air-to-air engagement
- **Models:** A shooter cannot launch at a target it cannot see/lock; low-altitude masking breaks line
  of sight and prevents firing.
- **Inputs / parameters:** Line of sight between shooter and target (terrain/curvature/altitude);
  availability of an off-board sensor (AWACS/AEW) that can see the target; lock/illumination quality.
- **Behavior / rules:** When two low-altitude fighters lose line of sight they cannot fire (Shift+F1 →
  "cannot fire" / illumination issue) and they close to point-blank before either can engage. Adding a
  look-down AEW platform (**E-2D / E-3**) that can see the low target restores the ability to fire and
  can guide the weapon (see *Cooperative Engagement*, §6). Without LOS or a supporting sensor, no launch
  occurs no matter the WRA setting.
- **Outputs / effects:** Fire allowed/blocked; with an AEW sensor providing the track, missiles can be
  launched and guided.
- **Edge cases / quirks:** Demo experiments were repeatedly "invalidated" because low-altitude LOS loss
  forced merges; AEW aircraft were added specifically to re-establish detection/guidance. **Distinct
  from a data-link failure** — this is a sensor/track problem, not a comms-device problem.
- **Source:** qHuId62Lba8
- **Confidence:** High

### Magazine/weapon availability and manual weapon allocation
- **Models:** Weapons physically stowed in magazines can't launch; an allocation count caps how many
  can be fired at once.
- **Inputs / parameters:** Weapon location (on rail/launcher vs in magazine); manual weapon-allocation
  count (e.g. up to **30** at a time).
- **Behavior / rules:** A green readout can still show "cannot fire" for the subset of weapons
  currently in magazines (not loaded to launch). A separate line confirms manual weapon allocation
  (e.g. "we can fire up to 30 of these at a time"). Only the launch-ready, allocated weapons actually
  fire.
- **Outputs / effects:** Determines the launchable subset and the maximum simultaneous launches.
- **Edge cases / quirks:** Magazine-stored rounds explicitly **cannot launch** even when the unit is
  otherwise green to fire.
- **Source:** hCDLw5AZk0E
- **Confidence:** High

### Co-located multiple batteries enable large simultaneous salvos
- **Models:** Stacking several SAM batteries at one point lets a single "site" fire far more missiles
  at once than one battery could.
- **Inputs / parameters:** Number of batteries co-located at the same point; per-battery salvo limits.
- **Behavior / rules:** An **SA-5** "site" can fire many missiles at once because multiple batteries
  are collocated at the same point; this is what makes spamming many simultaneous launches possible
  ("we can fire quite a few missiles at one time... because we have multiple batteries actually
  collocated").
- **Outputs / effects:** A larger combined salvo than a single battery; rapid "panic fire" possible.
- **Edge cases / quirks:** Common misconception called out: people assume an SA-5 can't fire that many
  at once — collocation is the reason it can.
- **Source:** hCDLw5AZk0E
- **Confidence:** Med

### Cancel an in-flight engagement / re-task via Shift+F1
- **Models:** After firing, the operator can cancel tracking/guidance on an already-engaged target and
  re-task the launcher.
- **Inputs / parameters:** Shift+F1 on a target already fired upon; a cancel-attack action.
- **Behavior / rules:** Pressing Shift+F1 and clicking a target you've already fired at lets you cancel
  the engagement ("you can actually cancel if you need to") — e.g. to stop tracking missiles that no
  longer need attention and redirect the SAM to new incoming threats.
- **Outputs / effects:** The in-flight engagement is cancelled; the launcher is freed to engage other
  targets.
- **Edge cases / quirks:** Used to stop wasting tracking on doomed/irrelevant inbound missiles ("no
  reason to even continue tracking those").
- **Source:** hCDLw5AZk0E
- **Confidence:** Med

---

## 5. Doctrine: WRA & Weapon Control

### Weapon Control Status (WCS) gate
- **Models:** A doctrine setting that holds fire by domain (air/surface/subsurface) regardless of
  target validity.
- **Inputs / parameters:** WCS per domain (Weapons Free / Weapons Tight / Weapons Hold); accessed via
  **Ctrl+Shift+F9** / the doctrine dialog.
- **Behavior / rules:** If WCS for air targets is **Weapons Hold**, automatic fire is not allowed even
  on a positively identified hostile in range. Change to e.g. "fire against positively identified
  hostile air targets" (Weapons Free for that case) to clear the block.
- **Outputs / effects:** Removes the WCS block; auto-fire permitted for that domain/condition.
- **Edge cases / quirks:** "Weapons tight" is a separate, less-restrictive state checked among other
  issues. WCS is only one link in the chain — clearing it alone may not start fire.
- **Source:** hCDLw5AZk0E
- **Confidence:** High

### WRA — per weapon type, rounds-per-salvo, and range limits
- **Models:** Weapon Release Authorization controls whether a specific weapon may be used against a
  given target type, how many per salvo, and within what range band. *(This merges the dedicated WRA
  range-setting rule with the WRA target-type/salvo rule — same mechanic, two demos.)*
- **Inputs / parameters:** WRA table by weapon vs target type (e.g. "guided weapons vs unidentified
  aircraft" = 2; vs helicopter = OK); rounds-per-salvo (e.g. 2); WRA-set range limits (min/max, e.g.
  **15 nm** set against a **116 nm** weapon). Range **mode** per weapon set in Doctrine → WRA (via
  **Ctrl+Shift+F9** then WRA, per side/unit/weapon): a **percent of max range** (e.g. 75%), **No Escape
  Zone (NEZ)**, 100%, 50%; **DLZ** also referenced. Weapon max range (e.g. SA-21b 40N6: 75% = 161 mi).
- **Behavior / rules:**
  - *Target-type / salvo / range-window:* If WRA says "do not use weapon against this target type,"
    fire is blocked; set an allowed count (e.g. 2 or 3 per target). WRA also enforces a rounds-per-salvo
    (e.g. 2) and a firing range window: a WRA range set to **15 nm** (vs a weapon capable of 116 nm)
    blocks firing beyond 15 nm even though the line is **not red** — widen it to e.g. 50 nm. Guidance:
    anything under ~20 nm is "probably fine for guided weapons."
  - *Range-mode (when to shoot):* "75% of max range" fires when the target reaches 75% of the weapon's
    max range (computed numerically, e.g. 75% of a 40N6's max = **161 mi**; 75% of a ~120 nm AMRAAM
    shot ≈ **90 mi**). **NEZ** ("No Escape Zone") fires only when the target is inside the no-escape
    zone — purely range-based, generally a much shorter/closer launch (demo NEZ launches at 114 nm /
    "60% of range"; air-to-air NEZ shots at **26, 18 nm**). **100%** fires at max range (wastes
    missiles); **50%** is even more conservative. The setting governs **when** the first shot is taken;
    a unit set to NEZ may hold fire while a 75% unit shoots first.
- **Outputs / effects:** Enables/blocks a weapon vs a target type, caps salvo size, and defines both
  the engageable range band and the launch range/timing — affecting probability of hit, missiles
  expended, and whether the enemy gets a shot off first.
- **Edge cases / quirks:** A misconfigured WRA range (15 nm) silently prevents firing **without showing
  red**. Salvo size in one demo didn't match expectation ("we would only be firing one"). Tactical
  conclusions: for a very long-range high-velocity SAM, 75% is fine — 100% wastes missiles, NEZ waits
  too long. Air-to-air at high altitude, a 75% launch is essentially a "freebie" that wastes missiles,
  and units only start killing at NEZ range. At **low** altitude the 75% bonus "doesn't do much" and
  ~50% is safer (see *Atmospheric density*, §6).
- **Source:** qHuId62Lba8, hCDLw5AZk0E
- **Confidence:** High

### Jettison ordnance under attack (WRA option) and its agility/survival effect
- **Models:** Dumping weapons when fired upon to reduce weight and gain agility/speed to evade the
  incoming missile.
- **Inputs / parameters:** WRA setting "Jettison ordinance when under attack" = No / Yes (accessed via
  **Ctrl+Shift+9**, Weapon Release Authorization); current ordnance + fuel load (drives empty weight
  fraction — see §6); aircraft type/performance.
- **Behavior / rules:** When set to jettison and fired on, the aircraft **automatically** drops all
  ordnance, immediately lowering its empty weight fraction; this feeds the agility chain (see §6) so
  agility and acceleration/climb rate rise. Observed: an F-15 jettison cut weight fraction **0.97 →
  0.54**, agility rose ~one third, but final Pk only fell from ~10% → 7% (a "3% better probability of
  not getting shot down," called "basically negligible"). The aircraft also turns quicker and "climbs
  like a rocket / picks up speed a lot faster" after dropping. Fuel weight matters too: a B-52 with
  fuel burned down (set airborne time 2h30m / 3h flying lowers weight) gained ~4% Pk improvement (22%
  → 18%) from dumping payload.
- **Outputs / effects:** All ordnance lost (mission auto-failed if the bombs were the objective);
  reduced weight → higher agility/acceleration/climb → slightly lower incoming-missile Pk.
- **Edge cases / quirks:** Net benefit is small and aircraft-dependent: big aircraft that have burned
  lots of fuel benefit more; "a little airplane with tons of gas on board" that dumps payload "just
  failed the mission automatically." Jettison did not always trigger in time — the aircraft must
  perceive the attack early enough; a B-52 "immediately jettisoned nothing" without enough time, so the
  operator manually emptied the loadout to simulate. Conclusion: against highly capable weapons
  (S-300/SA-20, 90% base Pk) jettison is far less useful (B-52 only 90% → 76%; F-15 still 42%) — "much
  safer to not get launched on in the first place or trick them into launching at long distance."
  Aircraft sometimes "get panicky" and do silly things (e.g. turn and run into another missile).
- **Source:** CwRX1W5LQEU
- **Confidence:** High

---

## 6. Probability-of-Hit & Survivability Modeling

### Missile probability-of-hit vs aircraft (agility / weight chain)
- **Models:** How an incoming SAM's chance to hit a maneuvering aircraft is computed from the
  aircraft's agility, speed, altitude, weight, and engagement geometry, resolved by a single RNG roll.
- **Inputs / parameters:** Weapon's nominal/original probability of hit (Pk); aircraft nominal agility;
  current speed; current altitude; empty weight fraction (current weight / max weight); crew
  proficiency (e.g. "Cadet"); engagement/impact angle (deflection: forward-oblique vs square /
  high-deflection); ECM/jamming (set aside in this test); a random roll value.
- **Behavior / rules:** From the displayed engagement report, step by step:
  1. Start from the weapon's **original/nominal Pk** — "based on the weapon" (**SA-2 = 30%**).
  2. Adjust for **actual speed**: an F-15 at Mach ~1.22 dropped Pk 30% → 20% ("a 10% reduction because
     of speed").
  3. **Agility** is derived: starts from nominal agility (**F-15 nominal 4.5; B-52 nominal 1.5**), then
     "adjusted altitude" lowers it at high altitude ("high altitude less agility"; **F-15 adjusted
     2.2**).
  4. **Empty weight fraction** further modifies agility: F-15 at **0.97** weight fraction (near max)
     gave "actual agility adjusted to **4.6**"; B-52 at **0.99** gave agility "adjusted to **2.6**"
     (~half the F-15's). Lighter = more agile: F-15 jettisoned to **0.54** and "agility went up by an
     entire third"; B-52 burning fuel to **0.89** raised agility from 2.6 to ~"3."
  5. **Engagement geometry** applies an impact-angle term: a "forward oblique impact" or "high
     deflection impact" — high-deflection/square-to-the-missile shots are **worse for the missile**
     (lower Pk). The initial turn that creates a deflection shot "matters almost more than your empty
     weight fraction."
  6. These combine into a **final agility modifier** (F-15: minus five, "the magical number") and a
     **final Pk**.
  7. Resolution is a **single RNG roll vs final Pk**: hit if roll < Pk. Examples: F-15 final Pk 8%,
     rolled 65 = miss; B-52 final Pk 21%, rolled 22 = miss (very close); B-52 final Pk 22%, rolled 28 =
     miss.
- **Outputs / effects:** A final per-shot Pk and a pass/fail RNG roll determining hit/destruction. The
  report exposes each intermediate factor (original Pk, speed-adjusted Pk, nominal agility,
  altitude-adjusted agility, empty-weight-fraction-adjusted agility, impact/deflection term, final
  agility modifier, final Pk, roll).
- **Edge cases / quirks:** High altitude reduces agility. Near-max weight (high empty weight fraction)
  sharply cuts agility (~halves the Pk benefit). Each successive missile in a salvo can have different
  geometry: a shot taken before the aircraft finished its evasive turn had a worse (forward-oblique)
  angle and a slightly different Pk (B-52 21% vs 19% across two shots). Speed lost in a heavy turn
  (B-52 "losing all sorts of speed") affects the speed term. Crew proficiency "Cadet" is a stated
  input.
- **Source:** CwRX1W5LQEU
- **Confidence:** High

### Probability-of-hit vs range, plus per-shot hit roll
- **Models:** Each missile has a Pk that varies with engagement range, and the actual hit is resolved
  by a random roll against that probability.
- **Inputs / parameters:** Engagement range (range as % of max); target type/altitude; EW/spoofing
  state; the weapon's Pk; a random roll value.
- **Behavior / rules:** Closer engagements give modestly higher Pk: a NEZ shot at a high-altitude
  bomber showed Pk **~68%** versus **~59–60%** for the same bomber at the longer 75%-range distance
  ("slightly better probability at the closer distance"). The hit is then a roll: in one engagement the
  missile that hit had an **84%** chance; on a previous shot at the same target they "rolled a 98" and
  missed (i.e. a roll above the Pk threshold misses). EW can cause a **"spoof"** result that defeats
  the shot independent of the raw Pk.
- **Outputs / effects:** A per-engagement probability value, a pass/fail roll, and a hit/miss/spoofed
  outcome shown in stats.
- **Edge cases / quirks:** The exact roll mechanic is stated only via examples (84% Pk hit; rolled 98 →
  miss), implying the roll must be ≤ Pk; not fully specified. **Spoof (EW) is a separate failure mode**
  from a normal probability miss.
- **Source:** qHuId62Lba8
- **Confidence:** Med

### Atmospheric density / altitude effect on missile performance
- **Models:** Missiles fired and/or flying through the dense lower atmosphere lose energy and stall,
  sharply reducing effective range and Pk at low altitude.
- **Inputs / parameters:** Launch altitude and target altitude (minimum/low altitude = thick air);
  missile energy state along the trajectory.
- **Behavior / rules:** At minimum/low altitude the "thick part of the atmosphere" plays "massive
  havoc" on hit probability: a missile must climb out of thick air and come back down into thick air,
  degrading performance. In the low-altitude air-to-air test the AMRAAMs "entered the thick part of the
  atmosphere and both stalled" and were wasted. Long-range SAMs fly a very tall arcing/lofted
  trajectory (climb extremely high — well above the target — then come back down) to preserve energy.
  Stated guidance: if all the work is at low altitude, ~50% range is safer because 75% launches stall
  out and are wasted.
- **Outputs / effects:** Reduced effective engagement range, stalled missiles, lower Pk; favors shorter
  (lower-%) launch settings at low altitude.
- **Edge cases / quirks:** The effect is described qualitatively (stall / "doesn't want to go"); **no
  numeric drag coefficient given**. A high-energy long-range SAM is largely immune (75% still fine even
  at low altitude in one case); fast/low targets are harder to hit.
- **Source:** qHuId62Lba8
- **Confidence:** Med

### Cooperative Engagement (CEC) / remote missile guidance
- **Models:** A missile can be guided to its target by a different friendly platform (e.g. an AEW
  aircraft) rather than the launcher, enabling shots the shooter could not otherwise guide.
- **Inputs / parameters:** A "CEC quality / high quality lock" from the guiding platform; a matching
  **two-way data link** on both shooter and guider (e.g. AIM-120 missile data link two-way present on
  the E-2D Hawkeye and the F-15EX); cooperative-attack capability on the guiding sensor.
- **Behavior / rules:** With Hawkeyes carrying cooperative-attack capability and the correct two-way
  AIM-120 data link, an F-15EX fires the AMRAAM and the **E-2D actually guides it** to the target —
  allowing launches at low-altitude / over-the-horizon targets the shooter can't see. The system
  requires a "high quality lock" for CEC; the weapon, when opened, states the exact data link it needs
  (AIM-120 missile data link two-way), and you verify both platforms carry it.
- **Outputs / effects:** Missile guided by the cooperating platform to intercept; enables
  otherwise-impossible engagements; produces effective long/early shots.
- **Edge cases / quirks:** Needs the correct two-way data link on **both** the shooter and the guiding
  aircraft (mismatch → no CEC). "Cooperative weapons" produced dramatic re-targeting/turning intercepts
  in the demo. *(Pairs with the §3 mandatory-data-link rule and the §4 LOS/illumination rule.)*
- **Source:** qHuId62Lba8
- **Confidence:** Med

---

## 7. Anti-Radiation Missiles & SEAD

### ARM homing requires an active emitting radar
- **Models:** ARMs ride a passive radar seeker onto an enemy radar's RF emission; no emission means no
  guidance.
- **Inputs / parameters:** Target radar emitting state (on/off); radar type (fire-control vs search);
  the weapon's seeker frequency band (generalized in CMO); target motion.
- **Behavior / rules:** The missile's passive seeker identifies a target emitting a specific frequency
  and homes on that radar signal. An active radar signal is **required** to fire/guide
  ("anti-radiation missiles require an active radar signal"; "if you had somebody not emitting we would
  not be able to fire on them"). If the target is moving, the missile adjusts and tracks the mover.
  Preferred targets are **fire-control** radars, not search radars; wasting an ARM on a search radar is
  called poor practice.
- **Outputs / effects:** The missile flies to the emitting radar; on hit, the targeted radar/sensor is
  damaged or destroyed.
- **Edge cases / quirks:** Frequency sensitivity is simplified ("generic") in CMO. Firing on search
  radars is allowed but wasteful.
- **Source:** geXup7Gkcys
- **Confidence:** High

### ARMs are valid against emitting naval radars
- **Models:** ARMs home on ship-borne radars just like land radars — but only those currently emitting.
- **Inputs / parameters:** A **Standard** ARM (70s vintage); the ship's emitting radars (e.g. Palm
  Frond, Top Plate, HOT FLASH, CADS naval radar); the ship's defensive systems (naval SA-N-9, Sea Whiz
  CIWS).
- **Behavior / rules:** Firing two Standards at a ship emitting multiple radars: only emitting radars
  can be targeted — if a ship runs only a "lame" masted surface radar, that is the only thing
  engageable. The ship reacts (spins up CIWS/Sea Whiz, fires SAMs, even a last-second Sea Whiz shot).
  On hit, the specifically targeted radar (CADS naval radar) is damaged and the Top Plate is snapped
  off, plus collateral sensor damage.
- **Outputs / effects:** The targeted ship radar/sensor is damaged or destroyed; the ship may shoot
  down some inbound ARMs.
- **Edge cases / quirks:** Naval targets are "a whole other beast" (heavily defended). Only
  currently-emitting radars are selectable.
- **Source:** geXup7Gkcys
- **Confidence:** High

### Early ARM behavior vs radar shutdown (no memory) — AGM-45 Shrike / Standard
- **Models:** First-generation ARMs with no memory fly toward where the radar last emitted; if the
  emitter shuts off, they have no guidance and miss badly.
- **Inputs / parameters:** Missile generation (**AGM-45 Shrike** = worst; "Standard" = later 70s
  vintage); target emitting/shutdown timing; intermittent-emission setting.
- **Behavior / rules:** On launch the early ARM spins up off the rail and tries to close. While the
  radar emits, it tracks. If the operator shuts the radar **off** mid-flight, the missile flies to the
  radar's last known position and cannot correct — "never ever ever going to hit." Demonstrated misses:
  a hit landing **31 ft** from target (still destroys a vehicle); ~**30 ft** typical miss when the
  emitter stayed on; ~**almost a nautical mile** miss when the radar stopped emitting.
- **Outputs / effects:** A hit (small CEP, ~30 ft, destroys soft targets) if the emitter stayed on; a
  large miss (~1 nm) if the emitter shut off; a possible dud/malfunction doing nothing.
- **Edge cases / quirks:** Malfunction/dud rate is non-trivial for early weapons ("that's going to
  happen especially in the early days"). A 31 ft miss still kills a vehicle. Intermittent emission
  (flashing the radar on/off) further degrades early-ARM guidance (see *Intermittent emission*, this
  section).
- **Source:** geXup7Gkcys
- **Confidence:** High

### HARM-class ARM with onboard memory + GPS keeps tracking after shutdown
- **Models:** Later ARMs store the target location (memory) and have GPS guidance, so they continue to
  the target even if the radar shuts off.
- **Inputs / parameters:** Missile type (**HARM**); the target's last-known position stored in memory;
  onboard GPS.
- **Behavior / rules:** While the radar emits, the HARM locks. If the radar is shut off mid-flight, the
  HARM is "smart enough because it has GPS guidance on board to actually keep going to the target
  itself and actually strike it." Two HARMs scored strikes even after the operator turned the radar
  off.
- **Outputs / effects:** The target radar/site is struck even after emitter shutdown.
- **Edge cases / quirks:** Contrasted directly with the no-memory early ARMs that miss on shutdown.
- **Source:** geXup7Gkcys
- **Confidence:** High

### Latest-generation HARM can attack non-emitting targets via onboard radar
- **Models:** The newest HARM variant flips on its own active radar seeker to find and hit a ground
  target even if it never emits.
- **Inputs / parameters:** Missile type (latest-gen HARM, nicknamed "unfair aim"); a target that may or
  may not emit.
- **Behavior / rules:** Even if the target shuts its radar off, this variant "will flip on their
  automatic radar tools," identify the target on the ground, and strike it conventionally and
  precisely — emission no longer required.
- **Outputs / effects:** The target is struck cleanly regardless of emission state.
- **Edge cases / quirks:** Explicitly the **exception** to the "must be emitting" rule for ARMs.
- **Source:** geXup7Gkcys
- **Confidence:** High

### Loitering ARM (ALARM) — parachute hang-and-wait, requires low launch altitude
- **Models:** A loitering anti-radiation weapon that pops a parachute, hangs in mid-air, and waits for
  a radar to emit before diving on it.
- **Inputs / parameters:** Launch-aircraft altitude (must be **low** — at ~3,000 ft elevation, ordered
  to low altitude); firing mode (**bearing-only launch via Ctrl+F1**, fired in front of the targets —
  **not** a conventional direct attack); radar emission timing.
- **Behavior / rules:** Order the launch aircraft to low altitude (high altitude "is not going to
  work"). Use a bearing-only launch (Ctrl+F1) in front of the targets rather than a direct attack. Each
  missile leaves the rail, pauses ~half a second to deploy its parachute, then hangs/loiters; when a
  target emits, a loitering missile reignites, flies in, and attacks. The weapons **sink** while
  loitering and can run out of energy.
- **Outputs / effects:** Missiles loiter aloft; on detecting an emission, one dives and strikes;
  otherwise they sink/expire.
- **Edge cases / quirks:** Must **not** be fired with a conventional direct attack order. Insufficient
  launch altitude means they run out of energy before re-engaging ("didn't really get employed
  perfectly"). Demonstrated with too little altitude, so the attack was imperfect.
- **Source:** geXup7Gkcys
- **Confidence:** Med

### Intermittent emission (EMCON emission-duration trick) to defeat ARMs
- **Models:** Cycling a radar's emission on/off in short bursts so ARMs have fewer continuous seconds
  to guide, making the emitter harder to hit.
- **Inputs / parameters:** Emission duration setting (e.g. on **5** / off — "5 goes on for five and
  then shuts itself off"); a shorter "emission duration 2" for an even harder target; for search
  radars, e.g. **1 minute on / 1 minute off**.
- **Behavior / rules:** Setting a radar to intermittent emission (5 on then off, or duration-2 for a
  harder target) periodically interrupts the ARM's lock so the missile must keep re-guessing the
  location, complicating the engagement; for search radars a 1-min-on/1-min-off cadence is suggested as
  easy.
- **Outputs / effects:** ARM guidance is degraded; the emitter is harder to strike; the defender keeps
  some situational awareness.
- **Edge cases / quirks:** Shorter durations ("emission duration 2") make targeting even harder.
  Fire-control radars need to emit to guide their own SAMs, so blinking is a tradeoff.
- **Source:** geXup7Gkcys
- **Confidence:** Med

### Modern long-range SAM (SA-21 / S-400) intercepts incoming ARMs — saturation needed
- **Models:** A high-end SAM site shoots ARMs out of the sky one at a time at long range; small salvos
  are wasted.
- **Inputs / parameters:** Number of ARMs fired (e.g. 4); engagement range (~**30 nautical miles**);
  target SAM type (cheeseboard radar ⇒ S-300/S-400 family).
- **Behavior / rules:** Firing four expensive ARMs at an S-400-class site: each weapon is "simply
  getting slapped out of the sky one at a time," all wasted before reaching ~30 nm — and "even if I did
  half that distance... wouldn't make any difference." Recommended counters: artillery or dumb/iron
  bombs against such effective systems; otherwise saturate.
- **Outputs / effects:** All ARMs intercepted; the site survives; munitions wasted.
- **Edge cases / quirks:** Halving the standoff distance does not help. The owner explicitly recommends
  **iron bombs / artillery** as the reliable kill against top-tier SAMs (a theme repeated across this
  video's SEAD attempts).
- **Source:** geXup7Gkcys
- **Confidence:** High

### Ballistic anti-radiation / anti-ship missiles vs modern SAM
- **Models:** High-speed ballistic ARMs (Kh-31 / YJ anti-ship repurposed; Hermos-1 ballistic ARM)
  attacking a top-tier SAM, and whether speed alone defeats interception.
- **Inputs / parameters:** Weapon type — **Kh-31 / YJ** at ~**Mach 3.48**; **Hermos-1** ballistic ARM
  re-entering at ~**Mach 4.15**; flight profile (ballistic arc — climb high then arc down); seeker
  (anti-radiation on the nose).
- **Behavior / rules:** Kh-31 / YJ travel ballistically (up high, then arc down) at Mach 3.48 against an
  SA-21; both were destroyed — strategy failed. The Hermos-1 fires a ballistic missile with an ARM
  seeker; it takes a long time to get airborne, climbs very high, captures the seeker on the way back
  down, and re-enters at Mach 4.15 (described as "pretty slow" for the interceptors). The SA-21 still
  "gently slaps" most out of the way, with one malfunctioning. Effective against Patriot-type batteries
  but unreliable vs SA-21.
- **Outputs / effects:** Mostly intercepted by the SA-21; occasional early/late detonations and
  malfunctions; effective vs lesser (Patriot) targets.
- **Edge cases / quirks:** Even Mach 4.15 re-entry is treated as too slow to beat an SA-21. These
  weapons are "tremendously expensive" / "gigantic."
- **Source:** geXup7Gkcys
- **Confidence:** Med

### Jamming + ARM combo (SEAD with Growler escort) vs SA-21
- **Models:** An EA-18G Growler jams the SAM while small ARMs fired through the jamming exploit the 3D
  geometry to cut across the jam and complicate intercept.
- **Inputs / parameters:** Jammer (**EA-18G Growler** at max power); ARM (latest "unfair" HARM) fired
  through the target's altitude; SAM radar mode (search vs big fire-control radar); saturation level.
- **Behavior / rules:** The Growler jams at maximum power; ARMs are fired through the jammed SA-21's
  altitude. Ideally the ARM plunges so it "cuts across the jamming" (a 3D problem), making acquisition
  harder for the SAM. While only the search radar is up under heavy jamming, the missiles/jammer aren't
  identified; flipping on the high-power fire-control ("gravestone") radar burns through and detects
  them at ~**12 nm**, after which the SAM fires (and even jams the inbound weapons). Conclusion: more
  saturation and specialized weapons are needed to succeed.
- **Outputs / effects:** Degraded SAM detection while jammed; detection at ~12 nm once the high-power FC
  radar is used; partial success; no full kill with this loadout.
- **Edge cases / quirks:** One ARM went **up** to max altitude before plunging (opposite of intended),
  still arcing down to cut the jam. Heavy jamming hides both the jammer and the missiles until the
  powerful FC radar is enabled.
- **Source:** geXup7Gkcys
- **Confidence:** Med

### Stealth cruise-missile + standoff jamming vs S-400 ("the bomb always gets through")
- **Models:** Active-RF jammer-decoy missiles (penetrators) saturate the SAM's attention while stealthy
  JASSM cruise missiles slip in behind to strike.
- **Inputs / parameters:** Active-RF penetrator/jammer munitions (from a B-52H); stealth cruise missiles
  (**JASSM**, mixed into the group, trailing); a standoff jammer (F-18) still jamming; the target S-400
  site.
- **Behavior / rules:** Penetrators are active-RF weapons: even ordering the SAM to engage them, the
  defender locks onto the **jammers**. The stealthy JASSMs (the actual lethal weapons) ride behind,
  unspotted, backed by continued F-18 jamming. The S-400 only detects/jams late ("surprise jams...
  start firing like crazy"). JASSMs hit the S-400 site: about **half** the launchers killed ("the cheap
  part") but the expensive component survived — the tack still "failed."
- **Outputs / effects:** The S-400 is partially destroyed (cheaper elements) but the key/expensive
  component survives; the lethal stealth missiles largely get through.
- **Edge cases / quirks:** Nearly lost a B-52 and an F-18 to "cheap shots" during the run. Repeated
  owner conclusion: **iron bombs are the most reliable kill** against these sophisticated systems.
- **Source:** geXup7Gkcys
- **Confidence:** Med

---

## 8. Directed-Energy Weapons (Microwave / EMP, Laser, Dazzler)

### Microwave / EMP weapon damage model
- **Models:** High-power-microwave weapons deliver a localized EMP at the aim point that progressively
  damages a target's electronics (sensors/comms), eventually knocking it out, rather than physically
  destroying it.
- **Inputs / parameters:** Beam type (narrow/laser-like ESA beam vs wide/thick beam); range to target
  (closer = worse damage); target's electrical complexity (e.g. a simple drone / FLIR sensor); the
  "Communications disruption" scenario setting; firing-platform proficiency.
- **Behavior / rules:** Two flavors exist — a tight **narrow** beam and a **wide thick** beam (both
  shown firing simultaneously). Each microwave "burst" inflicts EMP damage; the Damage Control readout
  shows component damage (e.g. damage to the FLIR / "eyes," which are electrically simple). Damage
  **accumulates** and worsens as the target gets progressively closer; eventually the target is fully
  blinded, then goes out of communication and drops off the net. Microwave weapons blind/disable rather
  than blow up.
- **Outputs / effects:** Degraded/destroyed sensors and comms on the target; eventual loss of contact
  and loss of player control over the EMP'd unit (when comms disruption is on).
- **Edge cases / quirks:** **Critical:** requires "Communications disruption" turned **on** under
  scenario Features & Settings — otherwise destroying sensors merely limits their seeing and does **not**
  fully knock units out of action. Once a unit is EMP'd out of communication, the owning player can no
  longer directly control it. **Biological/living crew are not affected** by this generation of
  microwave weapon. Firing-platform proficiency must be high enough or the engagement underperforms
  (proficiency was raised in the demo to fix poor results).
- **Source:** 7UFHmSrJHmM
- **Confidence:** High

### Microwave weapon valid-target restriction (anti-drone only)
- **Models:** Microwave/EMP weapons can only engage a narrow, configured set of target classes; they
  will not auto-engage anything outside that list.
- **Inputs / parameters:** The weapon's "desired contacts" / valid-target list (for "microwave burst":
  **Unknowns, Unspecified, Micro UAVs**); the actual target classification.
- **Behavior / rules:** Opening the weapon shows desired contacts limited to unknowns (contacts whose
  identity is not known), unspecified, or micro-UAVs — there is nothing for surface vehicles, ships, or
  ground units. So microwaves engage drones/UAVs and aircraft but simply sit idle ("what do I do?")
  against an inbound cruise missile or other non-listed contact, even though they could physically
  damage its radar/electronics.
- **Outputs / effects:** Engagement allowed only for the listed contact types; otherwise the weapon
  does not fire.
- **Edge cases / quirks:** Even a fast inbound cruise missile with an active-radar seeker (damageable
  in principle) is ignored because it isn't a configured valid target. Stated summary: "only works
  against basically drones and airplanes." Other weapons (e.g. a 300 kW solid-state laser) must handle
  the missile threat instead.
- **Source:** 7UFHmSrJHmM
- **Confidence:** High

### Solid-state laser engagement (point defense vs missiles, with LOS)
- **Models:** A directed-energy laser can shoot down incoming missiles/threats line-of-sight, used as
  point defense.
- **Inputs / parameters:** Laser power (e.g. **300 kW**); clear line of sight to target; minimum range;
  proficiency.
- **Behavior / rules:** A solid-state laser (300 kW example) can engage and destroy incoming
  missiles/lasers, unlike the microwave weapon. It requires **line of sight** — if the target is masked
  by terrain (an island) the laser must wait until the missile clears the obstacle to take the shot.
  Effectiveness scales with laser tech/power and proficiency. It can intercept incoming missiles within
  range, but can fail if the target enters minimum range or there is not enough time.
- **Outputs / effects:** A destroyed incoming missile/threat when LOS and range/time permit; otherwise
  no shot.
- **Edge cases / quirks:** Stated as immature tech ("still immature, going to have to get better"). A
  threat inside minimum range or arriving with too little time gets through (a B-52 demo got hit when a
  missile was within minimum range / not enough time). Wasting shots on the wrong target can let the
  real missile leak through.
- **Source:** 7UFHmSrJHmM
- **Confidence:** Med

### Laser dazzler weapon (crew/sensor blinding, not destruction)
- **Models:** A laser that degrades a target's optics/eyes rather than dealing structural/hull damage.
- **Inputs / parameters:** Dazzler range (here **10 nm**); line-of-sight to target; aim point on target
  (geometry/angle); target type (ship vs manned aircraft/helo vs UAV); accumulated dazzle exposure;
  weather/clouds; a base percent-to-hit (range-dependent); allocation (number of lasers / "allocate
  all").
- **Behavior / rules:** The dazzler does **not** damage the hull — it damages the crew's "Mark 1
  eyeball" (optics). Effects by target type:
  1. **Ships** — crew eyeballs get damaged then "destroyed"; destroying **all** eyeballs aboard makes
     you lose control of the vessel, but ships keep operating safely even with eyeballs gone (just
     blinded crew, regained as new crew rotate in).
  2. **Manned aircraft/helicopters** — once blinded the pilot enters **"LOST CONTROL"** and the
     aircraft auto-enters a slow death-spiral descent into the ground.
  3. **UAVs** — no eyeball to blind; instead the TV/EO sensors and instruments are damaged (gain must
     be turned down), but UAVs are resistant and keep flying because the cameras have protective
     safeties.
  Hits resolve against a "base percent to hit" that degrades with range (misses near max range are a
  "range issue," not aiming). Aiming at the bottom of an aircraft (shallow angle) makes it much harder
  to actually hit the pilot.
- **Outputs / effects:** Degraded/destroyed optics (Damage Control shows eyeball damaged/destroyed);
  temporary or permanent LOST CONTROL for manned air (→ crash); loss of vessel control if all eyeballs
  destroyed; UAV sensor degradation. **No hull/structural damage and no ammunition expended** (only
  laser charge).
- **Edge cases / quirks:** Targets both ships **and** aircraft. Range (10 nm) **and** angle both reduce
  effectiveness. **Weather/clouds defeat it:** no visual line of sight through cloud = cannot engage
  ("that technology for dazzling doesn't exist for conventional lasers"); raising target altitude above
  a cloud layer grants immunity. Immunity is achievable by breaking LOS or staying outside the range
  ring. The laser has a finite charge ("gone through half my laser"). The dazzling unit's own radar
  (not flares) can make it detectable. Typically used on small/soft craft (cruise ships, small boats),
  not major warships (destroying a warship's eyeballs "took quite a bit").
- **Source:** qt-kuIpzVrU
- **Confidence:** High

---

## 9. C-RAM & Projectile Object Modeling

### Projectile modeling: ballistic shells (mortar/artillery) as a calculation vs rockets as physical objects
- **Models:** Whether an in-flight projectile is a real interceptable game object or merely a
  trajectory calculation determines whether C-RAM (or anything) can shoot it down.
- **Inputs / parameters:** Projectile type (mortar/artillery shell vs rocket vs ballistic missile /
  Scud); the projectile's existence as an in-game object; the weapon's valid-target-list flags.
- **Behavior / rules:** Mortar and (conventional) artillery shells are **not** in-game objects — they
  are "a representation of a calculation of this particular trajectory to this target," so there is
  literally nothing to click on or shoot at; C-RAM cannot intercept them (the "M" in C-RAM effectively
  doesn't function). **Rockets**, by contrast, are integrated as actual physical objects that exist in
  the world — clicking a rocket selects a real object with full projectile details — so they **can** be
  targeted and intercepted. Scud/ballistic missiles are also real objects (identified as "Fireballs" on
  re-entry — see *Projectile identification*, this section) and are technically valid targets.
- **Outputs / effects:** Mortar/artillery: uninterceptable, always impacts (subject to its own
  accuracy/CEP). Rocket/missile: selectable, interceptable by appropriately flagged weapons.
- **Edge cases / quirks:** A mortar's impact accuracy is independent (first rounds ~250 m off,
  improving with the spotter). Quirk noted: theoretically if you can hit a mortar shell you could hit a
  battleship shell — but those shells currently aren't objects, so it's moot.
- **Source:** gDeOE5SJRVQ
- **Confidence:** High

### Projectile identification by trajectory/speed (rocket vs Scud "Fireball")
- **Models:** The player cannot read a projectile's exact model but classifies incoming projectiles by
  their flight trajectory and speed.
- **Inputs / parameters:** Projectile trajectory shape, speed, and re-entry heating signature; sensor
  coverage (e.g. a radar on a mountain to track).
- **Behavior / rules:** Hovering/holding the mouse over an incoming object identifies it as a "rocket"
  based on its trajectory and speed as it enters the atmosphere (you can't read the
  manufacturer/serial). Ballistic missiles (Scud) re-entering are identified as **"Fireballs"** rather
  than "RVs entering the atmosphere" — accurate because they heat up and look like a streak of light on
  re-entry. A radar with line of sight (e.g. on high terrain) is needed to track these.
- **Outputs / effects:** A contact classified by trajectory class (rocket / fireball) without an exact
  type ID.
- **Edge cases / quirks:** The friendly/owning side sees full object detail (manufacturer, projectile
  specs) when clicking its own rocket; the receiving side only gets the trajectory-based class.
- **Source:** gDeOE5SJRVQ
- **Confidence:** Med

### C-RAM valid-target flag (only C-RAM-flagged weapons can intercept rockets)
- **Models:** Only weapons that carry a special internal flag for engaging rockets can be ordered to
  intercept incoming rockets; ordinary SAMs cannot, even short-range ones.
- **Inputs / parameters:** The weapon's valid-target list / special anti-rocket flag; the incoming
  projectile type (rocket, missile, guided bomb).
- **Behavior / rules:** With **Shift+F1 + left-click** on an incoming rocket: a **Tor (SA-15)** cannot
  engage it (its valid targets are missiles and guided bombs, not rockets); a **Pantsir/Greyhound**
  also has nothing to fire at. A **C-RAM** system (e.g. Mantis, Centurion) shows the rocket as a
  **valid** target and can engage it — because it carries a special hidden flag saying it can be used
  against rockets. Listed C-RAM systems: **NSA-15, NSA-22, 35mm Mantis, Centurion, Mantis C-RAM mod
  with Sky Guard FCR**.
- **Outputs / effects:** Engagement allowed only for C-RAM-flagged systems vs rockets; standard SAMs
  decline (no valid target).
- **Edge cases / quirks:** C-RAM "takes no time in the universe" to bring up (instant fire-control,
  unlike artillery). Range is very limited; a system can be out of range yet still recognize the valid
  target.
- **Source:** gDeOE5SJRVQ
- **Confidence:** High

### C-RAM single-target fire control and saturation defeat
- **Models:** C-RAM systems engage only one target at a time with very short range, so coordinated
  salvos saturate and defeat them.
- **Inputs / parameters:** Number of incoming projectiles; number of C-RAM units; the per-unit
  one-target-at-a-time constraint; very limited C-RAM range; proximity of C-RAM to the protected asset.
- **Behavior / rules:** A C-RAM can engage only a **single target at a time** and has very, very
  limited range. Against individual rockets it is very effective; against saturation it fails. With
  multiple C-RAM units there is no central allocation, so units pile onto the same target: one must
  finish targeting a rocket before the next unit can target it, meanwhile other rockets leak through.
  Under heavy saturation, units enter **"panic mode"** — retargeting repeatedly (target A, miss, switch
  to B, miss, switch...) and fire-control collapses. Demo: ~**90-rocket** salvos overwhelmed **3**
  C-RAMs; estimated only ~the first **25** could be blocked.
- **Outputs / effects:** The first few / individual threats intercepted; under saturation most rockets
  get through; soft targets near the aim point are destroyed by leakers.
- **Edge cases / quirks:** You must keep C-RAM very close to the asset it protects (limited range).
  Manual allocation doesn't help much — the same real-world saturation problem. No
  targeting/command/allocation priorities yet (a future central computer could de-conflict). Grad
  rocket dispersion ~**330 m** (accurate for a rocket system); soft units (SAM sites) nearby were
  wrecked by spillover.
- **Source:** gDeOE5SJRVQ
- **Confidence:** High

### C-RAM engagement window vs projectile speed (very fast/ballistic targets)
- **Models:** Even when a target is "valid," the physical time-of-flight of the C-RAM's bullets must be
  less than the available engagement window, or the intercept cannot complete.
- **Inputs / parameters:** Incoming projectile speed and re-entry profile (e.g. Scud apogee ~**140,000
  ft**, descending fast); the brief firing window (~one to two-and-a-half seconds); bullet flight time
  to the target.
- **Behavior / rules:** A descending Scud/ballistic warhead ("Fireball") is a valid C-RAM target, but
  the system gets only ~one to two-and-a-half seconds to fire and the bullets physically cannot reach
  the target in that time, so the intercept fails despite a valid lock. Presented in real time to show
  how short the window is.
- **Outputs / effects:** A valid-target lock but a failed intercept; the projectile gets through against
  very fast / steeply-descending threats.
- **Edge cases / quirks:** The Scud is one of the least accurate threats (may miss the whole island /
  land in the sea), so the "defense" partly relies on the threat's own inaccuracy. C-RAM is at "a heck
  of a disadvantage" against ballistic-speed weapons.
- **Source:** gDeOE5SJRVQ
- **Confidence:** Med

---

## 10. Laser-Guided Weapons & Buddy Lasing

### LGB requires a designator with line-of-sight; clouds and altitude block it
- **Models:** LGBs need an onboard laser designator that can illuminate the target; cloud cover or being
  above the designator's altitude/LOS limit prevents release and continued guidance. *(This merges the
  cloud/altitude designator-LOS rule with the LGB min-altitude / post-release-freedom rule — same weapon
  class, complementary constraints.)*
- **Inputs / parameters:** Laser designator range (~**15 nm**) and altitude limit (**40,000 ft**); cloud
  cover between aircraft and target; required drop altitude to clear clouds (cloud base **7,000 ft**;
  drop at ~**6,500 ft**); LGB **minimum** launch altitude (**2,000 ft AGL**); LGB **maximum** employment
  altitude (**12,000 ft or less**); terrain elevation under the path (mountainous, up to ~**900 ft**);
  line-of-sight maintained during guidance.
- **Behavior / rules:** "No directors are able to illuminate this target — insufficient reflection — no
  line of sight": even with a working laser pod, clouds between a 36,000 ft aircraft and the ground
  block illumination, so the bombs won't release. Descend below the cloud layer (to ~6,500 ft) and the
  LGBs release immediately. The legal employment band is **≤ 12,000 ft** and (under cloud) **below
  7,000 ft**, while staying **above the 2,000 ft AGL minimum** — so over high terrain you must hand-pick
  a strike altitude inside that narrow window. **After release you no longer need to point at the
  target** ("once you drop a bomb you don't need to point at the target anymore"): the shooter can break
  off, slow down, and arc away while the laser keeps guiding — but LOS must be **maintained** (you
  **cannot** climb back through the clouds; turning away while keeping LOS is fine).
- **Outputs / effects:** LGB release once the designator has clear LOS; continued guidance while LOS is
  maintained; precise hits; ability to spread shots across multiple aimpoints (one bomb each) and depart
  the threat ring while weapons fly. Release is blocked otherwise. Removing AAA first with LGBs makes the
  rest of a strike far safer.
- **Edge cases / quirks:** The aircraft was below the 40,000 ft designator limit (36,000 ft) yet still
  blocked purely by clouds. Dropping at ~6,500 ft is realistic exposure to AAA (used for demo). Climbing
  back through clouds breaks guidance; turning away (keeping LOS) does not. Terrain up to ~900 ft AGL on
  the run-in means a too-low setting (e.g. 1,000 ft) is below the 2,000 ft min and a too-high (7,100 ft)
  is above the cloud. **500 kg LGBs** are "pretty big"; even solid hits on hangars didn't always score a
  kill first pass — re-attack as needed.
- **Source:** hCDLw5AZk0E, 1PuSQh4Co3c
- **Confidence:** High

### Buddy lasing / remote laser designation over obstacles
- **Models:** One unit illuminates a target with a laser so another (concealed, no-LOS) unit's
  laser-guided weapons can hit it from behind cover.
- **Inputs / parameters:** A shooter unit (e.g. **Comanche**) with laser-guided weapons (**Hellfire**)
  and a separate designator / forward observer (e.g. **Kiowa Warrior**) that **has** line of sight;
  terrain/cover (terrain masking via **F2** "land cover masking"); altitude/hover state; a radio/comms
  link between units; the "illumination vectors" display.
- **Behavior / rules:** Position the designator where it has LOS to the target (low, hovering,
  terrain-masked) and the shooter where it is concealed (LOS to the target may be fully blocked). Order
  the shooter(s) to engage (**F1** auto-attack + Shift-drag a box over targets). The **designator**
  fires a laser onto the target ("illumination vectors of the selected unit" shows the lasing); the
  shooter's laser-guided missiles fly out of cover and follow the reflected laser onto the target ("a
  freebie hit"). Units coordinate the shot timing via radio. Multiple shooters from different directions
  can be combined.
- **Outputs / effects:** Laser-guided weapons strike a target the shooter cannot see, while the shooter
  stays hidden; the designator keeps lasing during weapon flight (~13 s seen).
- **Edge cases / quirks:** Works with any platform that can communicate to the firing units — "even if
  it was a satellite weapon" (joke: satellites can't actually fire lasers down, but if they could you
  could designate from space). Helicopters add cover via very-low-altitude terrain masking; at such low
  altitude an enemy SAM (e.g. **SA-8**) is below its minimum engagement altitude and "wouldn't even be
  able to fire a missile at us." Terrain masking (F2 land-cover masking) sticks only a sensor up,
  greatly reducing speed and radar signature. Open grasslands offer no trees to hide behind, so masking
  depends on the **"advanced terrain"** scenario setting (Scenario Features & Settings); hovering also
  reduces radar detectability. Weapons fired directly by the shooter (when it does have LOS) don't need
  the buddy laser.
- **Source:** cIfd_uCAxdQ
- **Confidence:** High

---

## 11. Air-to-Ground Munition Effectiveness

### Air-to-ground weapon effectiveness vs target hardness (qualitative matrix)
- **Models:** Relative lethality of weapon classes against soft (infantry), hard (armor/tanks), and
  medium (trucks) targets, plus building durability/size.
- **Inputs / parameters:** Weapon class and submunition type; target type/hardness (infantry, T-55
  tanks, trucks, training buildings); target size (smaller = harder to hit); number of weapons per pass;
  release altitude; aircraft accuracy (platform-dependent); terrain.
- **Behavior / rules:** Qualitative ranking demonstrated on identical target rows:
  - **(a) Conventional bombs** (Mark 82 low-drag; Snake Eye / Mk-82 Air high-drag): very effective vs
    infantry and trucks, only **weak vs armor** — high-drag got "a few destroyed" tanks; low-drag
    dropped 12-at-once from 12,000 ft killed "one of the three tanks." High-drag's stated real purpose:
    a slowing device lets the aircraft release at low altitude without being caught in its own blast.
  - **(b) Unguided rockets** (80mm, HEAT, **160 carried/aircraft**): individually weak — **can** kill
    tanks but need huge volume; **690 rockets** fired and one target still survived. Cheap but not
    optimum.
  - **(c) Cluster bombs:** **highly effective vs all target types.** CBU-87 CEM (~**202** dual-purpose
    bomblets, dropping 6) and a larger-bomblet / area-denial type with mines (**45** large submunitions
    + mines, dropping 6) both devastated infantry and armor.
  - **(d) Guided missiles** (Maverick, **304 kg**, fire-and-forget, lock-then-self-guide): pinpoint
    "plinking" — **two missiles → exactly two units killed** per target; great reach but poor area
    damage; **least effective** strike of the test for wide rows.
  - **(e) Aircraft cannon / air-to-ground strafing:** must be explicitly enabled in the loadout; the
    aircraft must get "stupid low"; on non-A2G F-16s it hit essentially nothing ("kept shooting into the
    terrain").
  Overall rule: heavier targets require heavier munitions; for **area** damage, conventional weapons
  beat precision missiles; precision missiles are best for **single** targets.
- **Outputs / effects:** Per-target destruction outcomes; per-unit kills (for guided weapons, kills ≈
  number of weapons that acquired). Damage Control shows partial damage (structural/sensor) even when a
  unit isn't destroyed.
- **Edge cases / quirks:** The smallest target repeatedly survived nearly everything — "too small of a
  target to reliably hit." Infantry are "fairly distributed," making clean hits harder. Cluster-bomb
  submunition **size** has only a **minor** effect on damage but a small effect on hit probability ("go
  small or go home"). Guided weapons must still **detect/lock** the target before firing — F-16s failed
  to acquire infantry (no thermal structure), and the front row fired after the back row due to lock
  difficulty. A2G cannon is useless against terrain-masked targets / on non-strike platforms. The "final
  weapon" (implied a large/area weapon) was blunted by uneven terrain — "a lot of that blast basically
  didn't even touch several of our targets," a watchtower survived.
- **Source:** NsNzObOegPk
- **Confidence:** High

### Release altitude vs accuracy for unguided bombs
- **Models:** How drop altitude trades off hit reliability against survivability for dumb bombs.
- **Inputs / parameters:** Release altitude AGL/MSL; weapon type (low-drag vs high-drag); target size.
- **Behavior / rules:** Higher release altitude increases dispersion/variability and lowers accuracy,
  especially against small targets; lower altitude improves hits but exposes the aircraft to its own
  blast (mitigated by high-drag retarders) and to defenses. Rule of thumb: "anything under 10,000 [ft]
  is a pretty good altitude if you're trying to get a fairly reliable hit." Demonstration leveled at
  ~**12,000 ft** for low-drag Mk-82s; a high-drag run flown at ~**2,000 ft AGL** to simulate low-level
  retarded delivery. A long dive to reach release altitude "telegraphs your move" to ground defenses.
- **Outputs / effects:** Bomb dispersion / hit probability and the time-of-fall (closer release = sooner
  impact); affects exposure to ground fire.
- **Edge cases / quirks:** Long shallow dives warn the enemy and invite SHORADS. High-drag bombs
  specifically enable safe low-altitude release without self-blast. Small targets remain unreliable to
  hit even with otherwise accurate platforms.
- **Source:** NsNzObOegPk
- **Confidence:** Med

### Unguided (dumb) bombs vs PGM accuracy & dispersion
- **Models:** Free-fall conventional bombs scatter widely; PGMs hit the aimpoint. Saturating a large
  soft target with many dumb bombs can still be highly effective.
- **Inputs / parameters:** Weapon type (**Mark 82 500 lb low-drag GP bomb**, qty **45** carried);
  guided vs unguided flag; release altitude (dropped from ~**20,000 ft** / "knocked myself down to 20
  grand"); target hardness.
- **Behavior / rules:** Unguided bombs are independently aimed at individual aimpoints but land with
  large dispersion ("look at the spread"). Saturating a packed airfield with 45 Mark 82s across multiple
  B-52 passes destroyed **28 parked aircraft**. The result was many aircraft kills but little
  hard-structure ("tarmac base") damage — soft, exposed targets (parked planes) die readily while
  reinforced structures survive dumb-bomb near-misses.
- **Outputs / effects:** Damage assessed per impact; expenditure tallied in Losses & Expenditures (45
  bombs → 28 planes). Parked aircraft destroyed; runway/hardstand largely intact.
- **Edge cases / quirks:** The best place to kill a plane is on the ground. Dumb-bomb saturation is
  framed as a "cheese" / area effect tactic, not pinpoint. The 28-from-45 figure is the **observed
  outcome**, not a guaranteed ratio.
- **Source:** ULBEQf191hA
- **Confidence:** High

### Effective bombing / weapon-release envelope (nose-cone arc)
- **Models:** A platform can only release a weapon when the target lies inside that platform's release
  footprint — modeled as a forward arc/circle ahead of the aircraft.
- **Inputs / parameters:** Platform type and its effective bombing range; aircraft heading and position;
  target position; weapon type.
- **Behavior / rules:** The B-52's effective bombing range is shown as a circle; as long as targets are
  kept inside that circle the platform will drop on them. Practically the release zone behaves like a
  forward "nose cone" — weapons drop on assigned targets that fall within that arc ahead of the aircraft
  as it flies over; targets outside it are not engaged that pass.
- **Outputs / effects:** Weapons release only against in-envelope aimpoints; targets outside the
  circle/arc are skipped until a later pass aligns them.
- **Edge cases / quirks:** Each released bomb is independently targeted; the visible spread is wide for
  unguided weapons. The same maneuver works with a PGM to achieve "basically the same exact kind of
  thing" — the envelope concept is weapon-agnostic, only accuracy differs.
- **Source:** ULBEQf191hA
- **Confidence:** High

### Manual attack (Shift+F1) — operator-flown weapon allocation
- **Models:** The player manually flies the platform and hand-picks which weapon hits which target,
  rather than letting an auto/mission resolver decide.
- **Inputs / parameters:** A platform with weapons loaded; a selectable target list (aircraft, tarmac,
  access points, hangars, runway, etc.); weapon allocation count (e.g. one weapon per aimpoint);
  per-shot target selection.
- **Behavior / rules:** Pause, press **Shift+F1**, click the target/airbase. Any sub-target the firing
  unit can observe appears in an allocation list. Select targets (single or shift-click groups) and
  allocate weapons (e.g. one bomb per part of the airfield). The aircraft then attempts to engage all
  manually-assigned targets as they enter its weapon-release envelope; the operator steers the platform
  across the targets to bring them inside the release arc; the unit drops on each assigned aimpoint as
  geometry permits, across as many passes as needed until munitions are expended.
- **Outputs / effects:** Weapons are pre-committed to specific aimpoints; on each pass the platform
  releases on whichever assigned targets fall in its release geometry until ordnance is gone.
- **Edge cases / quirks:** You can over-assign (allocate to an absurd number of aimpoints on one large
  base). A presenter recommends **disabling the automatic "TLE/V timeout"** (weapon-release
  auto-timeout) for manual runs, warning "if you leave that on things are going to happen" (it
  cancels/aborts the manual attack). Manual attacks can be auto-cancelled by the engine (seen: "the
  manual attack got cancelled") and must be re-ordered.
- **Source:** ULBEQf191hA
- **Confidence:** Med

### Automatic attack (F1) vs manual — efficiency tradeoff
- **Models:** F1 hands the strike to the AI: aircraft self-select aimpoints and engage "whenever
  convenient," trading precision/ammo economy for low operator workload.
- **Inputs / parameters:** Selected unit(s) + target (click unit, **F1**, click airbase);
  altitude/formation as flown; weapon load.
- **Behavior / rules:** Press F1 on a unit and click the target (e.g. airbase); the unit autonomously
  decides when to attack and which aimpoints to hit. Compared to manual **Shift+F1** control, the auto
  attack is **less efficient** — it sprays around, wastes munitions, and is less precise; manual
  micromanagement saved ammo and was more precise but cost much more operator effort. From high altitude
  with unguided bombs the AI still releases but accuracy is poor ("aiming at the middle… concentration
  of bombs is everywhere").
- **Outputs / effects:** Targets engaged with less control; higher munition expenditure for equivalent
  or worse damage versus careful manual play.
- **Edge cases / quirks:** With unguided heavy-bomber bombs even modern units "still have that same
  fundamental problem" — wide spaghetti dispersion regardless of automation. The sim briefly freezes
  while it "calculates all the collisions" for large bomb drops.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Heavy bomber as area-effect (unguided) vs tactical precision aircraft
- **Models:** Heavy bombers with unguided bombs are area-suppression weapons (wide dispersion) rather
  than pinpoint strikers; the higher the release, the worse the accuracy.
- **Inputs / parameters:** Bomber type (Badger / large bomber; also B-52); bomb guidance (unguided);
  release altitude (high vs low); ordnance quantity (high).
- **Behavior / rules:** Bombers carry lots of unguided ordnance and produce a wide impact pattern
  ("spaghetti" / "shotgun"). Releasing from high altitude makes them very inaccurate (demonstrated
  deliberately); dropping lower yields a more pinpoint strike but exposes them to AAA. They excel at
  suppressing/softening a wide area, not killing a specific point target. To drop their bombs at all in
  one scenario they'd need ~**8,000 ft** — and would "get shot to pieces" at that altitude inside AAA
  range.
- **Outputs / effects:** Broad area damage; good for suppression and probabilistically hitting
  hard-to-target things (like AAA) by spreading the pattern.
- **Edge cases / quirks:** Bombers can drop unguided bombs **through cloud** (no LOS), letting them
  attack AAA from above the weather where AAA can't reach them — turning their inaccuracy into an asset
  (use flight-size 1, single-axis, spread out so the wide pattern probabilistically lands on the AAA).
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Unguided rockets — accuracy / CEP and salvo saturation
- **Models:** Air-to-ground rockets are low-accuracy (large CEP), so you saturate a target with whole
  racks / squadron salvos rather than precision shots.
- **Inputs / parameters:** Rocket type (**122 mm** rockets; also S-13B); circular error probable (CEP)
  stated **20 m** ("accuracy good to about 20 m"); rounds per aircraft (**20** each → e.g. 12 planes ×
  20 = **240 rockets**); whole-rack release; the Shooters-per-Salvo setting.
- **Behavior / rules:** Rockets have a CEP of ~20 m (land "in the neighborhood" of the target). Because
  they're inaccurate you fire entire racks and can set multiple shooters per salvo so the squadron
  volley-fires simultaneously — fewer passes, some wasted rockets, but high saturation. Best against
  easy/soft targets, **not** against AAA (you'd "lose a lot of airplanes" because you must point at and
  close on the target).
- **Outputs / effects:** Saturation of an area target; tarmac / soft targets suppressed. High
  expenditure (hundreds of rockets), but the run also showed rockets "doing basically nothing" against
  some targets — saturation is hit-or-miss.
- **Edge cases / quirks:** Pointing a rocket attack straight at AAA gets the shooter shot at / damaged
  (demonstrated: a crew kept "smoking from a 130 mm round"). There is a stated launch-altitude check
  before firing. Setting Shooters-per-Salvo to e.g. 2 of 4 units keeps a backup so you don't over-commit
  in one pass.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Warhead damage-points model and small-vs-large missile effectiveness
- **Models:** Each weapon has a numeric warhead damage value; many small warheads spread shallow damage
  while one large warhead concentrates penetrating damage.
- **Inputs / parameters:** Per-weapon warhead damage points (**Hellfire ~8** damage; **Harpoon
  ~166.173** initial-hit value); number of missiles (e.g. 20 Hellfires vs 1 Harpoon); target type/armor
  (carrier, Fletcher destroyer, Iowa battleship with "special/medium" armor, merchant/civilian);
  Harpoon's fuel-fed post-impact fire bonus.
- **Behavior / rules:** Damage is computed from warhead points against the target's systems/armor. 20
  Hellfires (8 each) into a Midway carrier scored hits but only ~**3%** total damage, knocking out light
  topside systems (machine guns, Mk 35, radio, radar, an elevator) with damage **spread** widely. A
  single Harpoon (166.173) did substantially more, more **concentrated** damage, and its onboard fuel
  adds fire damage on impact. Across targets, the big single missile consistently did roughly **twice**
  the damage of the many-small approach and was more effective vs heavy/armored hulls; small missiles
  only shoot off light topside equipment. Heavily armored ships (Iowa) shrug off both (e.g. 3 Harpoons
  ~**7%**, barely scratching "special/medium" armor).
- **Outputs / effects:** Per-system damage and an overall percentage; fires/flooding on softer hulls;
  armored hulls largely intact.
- **Edge cases / quirks:** Small-missile salvos **do** more easily "get through the defenses"
  (saturation) even if low damage. Harpoon's fuel can start fires; surprisingly a fire did **not** start
  in one merchant case the narrator expected. Iowa armor ("specials at mediums") makes small missiles
  "do nothing." Radars are almost always damaged on any hit ("you're always going to shoot a radar
  whenever you take damage"). A "blind" setting prevents the ship from seeing/reacting to inbound
  weapons.
- **Source:** dIQmufLikyQ
- **Confidence:** High

---

## 12. Snap-Up & Kinematic Engagement Limits

### Snap-up altitude limitation (SAM vertical-shot kinematic limit)
- **Models:** A SAM cannot make a near-vertical shot at a target directly overhead because, with no
  aerodynamic lift, gravity prevents the missile from climbing to that altitude before burnout.
- **Inputs / parameters:** SAM type and max effective operating altitude (**SA-6 Gainful = 35,000 ft**);
  SA-6 sea-level climb rate ~**1,476 ft/min**; missile burn/endurance (SA-6 ~**30 sec** aviation fuel);
  target altitude vs slant geometry (roughly a 45-degree band); target horizontal range to the launcher.
- **Behavior / rules:** Geometric model: a shot at ~45 degrees splits the range so the missile gets lift
  on the way up; directly overhead, all thrust fights gravity with no lift, so the missile burns out and
  stops climbing at a "snap-up distance." Keeping the aircraft **high** (within the SA-6's 35,000 ft
  ceiling but at a steep angle / short ground range) puts it inside the snap-up zone where the SAM
  cannot guide a shot. The SA-6's slow ~1,476 ft/min climb and ~30 sec endurance reinforce that it can't
  reach a near-overhead high target. As the aircraft pulls away (flattening to ~45 degrees), it
  re-enters the engageable band and the SAM can shoot. You **cannot** cheat by sitting at 34,999 ft to
  draw a "cheap shot" — that simply doesn't happen.
- **Outputs / effects:** While in the snap-up zone the SAM holds fire even with a fire-control lock and
  the target in range; outside it (flatter geometry) the SAM can engage.
- **Edge cases / quirks:** Sitting just below the ceiling (34,999) does **not** enable a shot. The
  aircraft's own glide weapon (GBU-8 HOBOS) has the same "outside vertical bore-side limit" problem
  firing straight down (see §4). The tactic only works against older short-endurance SAMs.
- **Source:** WotKOJAiKlk
- **Confidence:** High

### Snap-up does NOT apply to high-thrust / long-endurance SAMs (SA-2)
- **Models:** SAMs with abundant thrust and endurance (SA-2) can climb to near-overhead targets, so the
  snap-up trick fails against them.
- **Inputs / parameters:** SA-2 missile: speed up to **2,000 knots, 46 sec burn, 58 sec endurance** vs
  SA-6's ~30 sec aviation fuel; target altitude (e.g. 40,000 ft, ~5,000 ft above the SA-2's target
  ceiling).
- **Behavior / rules:** Because the SA-2 has "more than enough time to climb" (2,000 kt, 46s burn / 58s
  endurance — a totally different category from the SA-6's 30s), flying directly over it does **not**
  create a safe snap-up zone the way it does over an SA-6. The SA-2 readily takes high near-vertical
  shots. (When the target sits above the SA-2's target ceiling by ~5,000 ft, the radar can't elevate
  enough and a snap-type limit can still appear — situational.)
- **Outputs / effects:** The SA-2 engages high overhead targets (multiple missiles fired); the snap-up
  exploit is ineffective.
- **Edge cases / quirks:** The SA-2 was designed for high-altitude, constant-direction targets — it
  struggles to track aircraft doing tight "donuts"/spirals (early dev had missiles "stuck in circles").
  When the aircraft is above the SA-2's target ceiling, the radar cannot elevate enough to engage.
- **Source:** WotKOJAiKlk
- **Confidence:** High

### Spiral-down attack to defeat older SAMs (combine snap-up + maneuver)
- **Models:** Staying directly over a SAM and spiraling tightly down (with speed brakes) keeps the
  aircraft inside the snap-up zone and inside older missiles' maneuver limits, allowing a safe attack
  from overhead.
- **Inputs / parameters:** Aircraft altitude during the spiral (e.g. 40,000 ft down to ~1,000–11,000
  ft); tight-turn "power donuts" with speed brakes; weapon characteristics (glide weapons like HOBOS,
  not straight-down).
- **Behavior / rules:** Fly over the SAM and perform tight descending spirals ("power donuts"), slowing
  with speed brakes. Older SAMs (SA-2) cannot track the tight maneuver or make the steep overhead shot,
  so the aircraft remains unengaged across a wide altitude range. After spiraling low, release glide
  weapons (which need a glide geometry, not a vertical drop), then spiral back up and leave.
  Demonstrated never being successfully engaged despite the SA-2 firing 2 of its 6 missiles.
- **Outputs / effects:** The target SAM is struck from overhead; the attacker survives unengaged; works
  only against older SAM generations.
- **Edge cases / quirks:** Glide weapons (HOBOS) are **not** straight-down weapons (unlike later JDAMs)
  — must respect glide geometry and "vertical bore-side" limits. The strategy is explicitly limited to
  older-generation SAMs incapable of steep engagement.
- **Source:** WotKOJAiKlk
- **Confidence:** High

---

## 13. Strike Mission Planning & Coordination

### Strike mission composition (strikers + escorts) with time-on-target
- **Models:** Coordinating a multi-aircraft strike package against a target so bombers and fighter
  escorts arrive together in an organized manner.
- **Inputs / parameters:** Mission type (**Land Strike**); striker set (e.g. B-52s); escort set (e.g.
  F-16s); Time On Target (DTG, e.g. **13:15 / 13:30** on Aug 15); striker flight-size setting (single
  strikers / flights of one); escort flight-size setting (groups of three).
- **Behavior / rules:** Create a strike mission, assign strikers, mark selected aircraft as escorts,
  set a Time On Target to synchronize the package. Under Mission settings the strikers fly as "single
  strikers" (flights of one) and escorts as flights of three. Aircraft group up before TOT, take off,
  and converge on the target at the set time. If the TOT is set wrong (e.g. wrong time of day), the
  mission **does not auto-launch** and units must be launched individually.
- **Outputs / effects:** A scheduled strike package; aircraft launch, rendezvous, and attack at TOT; on
  a bad TOT, no launch occurs.
- **Edge cases / quirks:** Setting a wrong time-of-day TOT silently prevents launch ("did somebody not
  launch... I poked in the wrong time of day"); the fix is manual individual launch. A whole-package
  single mission causes bombers to scatter into individual targets and escorts to chase distant threats
  — motivating the per-target template approach in the same video.
- **Source:** luwcD04-3jY
- **Confidence:** High

### Mission creation & timing math (time-on-target via distance/speed)
- **Models:** A strike mission can be fully built (targets, settings, flight plan) before any aircraft
  are assigned, with arrival time computed from distance ÷ cruise speed.
- **Inputs / parameters:** Distance to target (**100 nm**); cruise speed (J-15 cruises 400–500 kt, used
  **480 kt**); current scenario clock (**09:35 Zulu**); desired time-on-target; flight size; mission
  type (Strike-Land / Patrol).
- **Behavior / rules:** Compute transit: distance ÷ speed = 100 nm ÷ 480 kt = **0.20 hours**; × 60 = ~12
  min 30 sec to reach the target. Add to the current time (09:35) to get an achievable TOT (~**09:47**),
  choosing a realistic window. Set the mission's time-on-target accordingly. You can pre-build the
  entire mission (targets + settings + flight plan) and only add aircraft afterward. Individual aircraft
  30 min out easily make a tight window; very large mass formations need extra time to "get organized"
  after takeoff.
- **Outputs / effects:** A mission with a scheduled TOT; aircraft launch/transit to arrive on time.
- **Edge cases / quirks:** If the scheduled takeoff/TOT leaves no time to reach the target, the mission
  simply won't launch (demonstrated twice: bombers "never launched" because they couldn't reach the
  target in time; fix = clear/relax the station time). The presenter's verbatim arithmetic includes a
  self-correction (12:50 → 12:30).
- **Source:** ZD0z_nWLSp4
- **Confidence:** High

### Stacked attack timing (split seconds / split distance)
- **Models:** De-conflicting multiple strikers attacking the same area so they arrive staggered rather
  than all at once.
- **Inputs / parameters:** A stacked-attack toggle; split time (e.g. **30 seconds**); split-distance
  setting.
- **Behavior / rules:** For a stacked attack the operator sets a split of 30 seconds and a split
  distance; bombers then naturally spread out in time and space — some speed up, some automatically slow
  down so each group arrives within ~30 seconds of the others, from different/opposite directions.
- **Outputs / effects:** Strikers de-conflicted in time (within ~30s of each other) and approaching from
  varied directions.
- **Edge cases / quirks:** Only "split distance" was kept loose ("keep this one pretty all set"); the
  exact split-distance value is not stated.
- **Source:** luwcD04-3jY
- **Confidence:** Med

### Escort engagement-range leash (investigate/prosecution radius)
- **Models:** Preventing escort fighters from chasing distant threats far from the package they protect.
- **Inputs / parameters:** Escort engagement/prosecution distance (e.g. **30 nautical miles**).
- **Behavior / rules:** The operator sets escorts to a 30-nautical-mile leash so they don't "go running
  halfway across Nevada to chase down a MiG-21." With the leash set, escorts stay spread out, each
  escorting its own striker, engaging only nearby threats.
- **Outputs / effects:** Escorts remain near their charges; engagements are limited to within the set
  radius.
- **Edge cases / quirks:** Stated as a deliberate guard against escorts being "useless" by
  over-pursuing; the exact field name is not given.
- **Source:** luwcD04-3jY
- **Confidence:** High

### Weapon-state Winchester / RTB behavior
- **Models:** An ammo-expenditure ceiling and return-to-base trigger that bounds a strike. *(Merges the
  Winchester/RTB rule with the strike-mission weapon-state / targets-destroyed-behavior rule — same
  settings cluster.)*
- **Inputs / parameters:** Weapon state setting (e.g. **"Winchester"** = use all weapons / engage until
  out); RTB rule ("RTB when all targets destroyed"); "Focus on strike targets" targeting filter; flight
  size (e.g. 1 for single-LGB strikes; 3 = 12÷4; 2 = 8÷4); a "targets destroyed" option = RTB vs
  **Continue Mission**; Bingo/Winchester thresholds.
- **Behavior / rules:** Setting weapon state to **Winchester** directs units to keep
  engaging/expending until weapons are exhausted (used to stop them wasting passes or to force full
  expenditure). "Engage into Winchester" combined with "use all weapons" and "RTB is fine when all
  targets destroyed" makes a strike package empty its load on assigned targets, then return. "Focus on
  strike targets" restricts engagement to the designated strike-target set rather than targets of
  opportunity. Set flight size to match how many shooters a target needs (one airplane per LGB target).
  Set "targets destroyed" to **Continue Mission** (not RTB) so that if a target is killed before an
  aircraft shoots, the aircraft stays and re-tasks instead of aborting its attack run.
- **Outputs / effects:** Determines when aircraft stop attacking and head home (out of ammo or all
  targets dead); controls sortie composition and ammo economy; prevents premature aborts and
  wasted return-with-bombs.
- **Edge cases / quirks:** Used to prevent the "come in, dive, forget they're attacking, go home"
  partial-engagement behavior with guns. Pairs with WRA shot discipline (one-unit-per-target) to control
  over-expenditure. Leaving "targets destroyed" on **RTB** causes aircraft to abort attack runs when the
  target is already dead — "you don't want it to do that." Using a single bomber per target is called
  "very sloppy" but works when each target needs only one LGB.
- **Source:** cTG9XKo8Ih0, ZD0z_nWLSp4
- **Confidence:** High

### Bombs-per-attack / shot-discipline (WRA quantity per pass and one-unit-per-target)
- **Models:** How many bombs an aircraft releases per pass, and whether multiple shooters can
  simultaneously engage the same target.
- **Inputs / parameters:** WRA per-weapon release quantity (e.g. "drop 4" vs "drop all"); firing mode
  "fire weapons automatically"; option "allow one unit to fire at a time per target"; aircraft total
  ordnance count.
- **Behavior / rules:** Reducing release quantity (e.g. 4 bombs/pass on an 84-bomb aircraft) forces many
  more passes: stated math "84 divided by 6 is going to be **14 attacks**" (and "four bombs at a time
  mean six attacks" for a 24-bomb load — 24/4 = **6**). Smaller sticks = more attack cycles = more
  chances to do damage but vastly more time over target. Separately, **"allow one unit to fire at a time
  per target"** prevents other shooters from wasting sticks on a target while bombs already in flight
  haven't yet impacted — the engine otherwise lets multiple aircraft dump on the same target before
  damage resolves ("not really caring whether the previous stack" hit), causing massive
  overkill/collateral.
- **Outputs / effects:** Number of passes per aircraft, total time over target, ordnance economy, and
  reduced redundant strikes on an already-engaged/destroyed target.
- **Edge cases / quirks:** Without one-unit-per-target, groups circle and re-attack already-doomed
  targets ("that one canceled his attack because the previous target got destroyed") and waste enormous
  ordnance/time (the video burned hours and most of its bombs). Dropping all bombs at once = heavy
  overkill and collateral; tiny sticks = thorough but can run a scenario out of time. Bombers in a
  single huge formation still "argue amongst themselves who gets to attack," so shot discipline alone
  doesn't spread fire well (see *Prosecution area*, this section).
- **Source:** cTG9XKo8Ih0
- **Confidence:** High

### Targeting priority list (ordered target-type preference)
- **Models:** An operator-defined ordering of which target classes/subtypes are struck first.
- **Inputs / parameters:** Per-mission / per-unit targeting-priority entries built from target type →
  subtype → specific class (e.g. Facilities → Building/Surface → Government building, Railway station,
  Sports stadium, Very large, Large; plus Bridges, Industrial plants); each entry can be "limited to" a
  specific target.
- **Behavior / rules:** The list defines strike order; units engage higher-priority target types before
  expending ordnance on lower-priority ones. Entries are added and re-ordered (move up/down) and can be
  narrowed with a "limit to" constraint tying an entry to specific named targets. Combined with shot
  discipline, a very large flight then attacks "one target at a time in the order of the priority of the
  targets."
- **Outputs / effects:** Engagement order — high-value targets (govt buildings, bridges, rail, industry)
  hit first; prevents wasting ordnance on inconsequential targets early.
- **Edge cases / quirks:** The "limit to" (restrict to a specific target instance) button is **not**
  available outside the scenario editor — a stated limitation. Priority ordering does not by itself
  spread fire geographically (the formation still clumps).
- **Source:** cTG9XKo8Ih0
- **Confidence:** Med

### Prosecution area + patrol-area boxing to distribute a strike
- **Models:** Geographic partitioning so separate groups attack separate sub-regions instead of all
  clumping on one aimpoint, spreading damage and avoiding mutual interference.
- **Inputs / parameters:** Reference areas defined via **Ctrl+Enter → Define Area** (Rectangle or
  3-point polygon); a patrol/strike mission per box; a larger "prosecution area" overlaying the boxes;
  mission options (investigate unknown contacts in/out of patrol/weapon range toggles); flight size;
  attack altitude.
- **Behavior / rules:** Divide the target into boxes (quadrants/regions). Assign each group a patrol (or
  land-strike) mission bounded to its own box so it concentrates fire only within that zone. Overlay a
  **prosecution area** ("allowed to attack anything in that region but please stay in this square") that
  constrains where units may roam while engaging. Result: groups arrive and attack their assigned
  sub-region roughly simultaneously, picking one target apiece and spreading bombs — the cleanest,
  fastest, most complete destruction in the comparison (whole city leveled by ~12:45, all ordnance
  used). Clone the mission to replicate identical box settings for other regions. Lowering attack
  altitude per box increases lethality (recommended only without AAA). Pairs with one-unit-per-target so
  each box's group also avoids internal overkill.
- **Outputs / effects:** Per-group geographic confinement; simultaneous, evenly distributed strikes; far
  better time-and-ordnance efficiency than the mega-formation or individual-targeting approaches.
- **Edge cases / quirks:** Area-validation often errors on the first build (a stray waypoint out of
  zone) — fix by deleting the offending point, "add all highlighted points," then re-validate. Keep
  units **out** of the area while building it. Resetting/regenerating a mission re-launches/regenerates
  plans (units launch piecemeal, "usually not recommended" — spread launches for safety). A single giant
  formation flying a "donut"/circle does **not** distribute fire — individual bombers in a formation
  can't make the per-unit decisions to optimize, so they cluster and contest targets (a "perfect circle"
  stalemate) even with priorities + one-per-target set. Flight size **6** recommended for bombers (4
  acceptable). Bombers take much room and a long time to get airborne. Time-on-target calc is unreliable
  when a package mixes aircraft of very different speeds (B-52 vs Tu-95).
- **Source:** cTG9XKo8Ih0
- **Confidence:** High

### Per-target single-strike templates via mission cloning + duplicate-target detection
- **Models:** Organizing a large multi-part target (an airfield) so each cluster gets its own dedicated
  strike rather than all bombers piling onto one mission.
- **Inputs / parameters:** A target rendered inactive (**Ctrl+F11** to name/group, e.g. "buff one"); a
  mission template with all settings (TOT, weapon state, EMCON, formation); a clone-sub-mission action;
  target-already-targeted warnings.
- **Behavior / rules:** Build one mission as a template (set TOT inactive while configuring, weapon
  expansion, EMCON, formation single-aim, off-axis attack allowed, escort flights of three, pre-planned
  weapon state). Clone the sub-mission once per target cluster (e.g. 8 "buffs"). CMO flags when a target
  is already assigned to other strike missions ("struck by seven other strike missions"); delete the
  target from the other clones so each target is used by **one** mission. For each mission, select a
  target group, add it to the map (the system warns when adding units already on another strike
  mission), then add one bomber + three F-16 escorts marked as escort, and activate. All missions share
  the same TOT.
- **Outputs / effects:** Many small synchronized single-strike missions, each hitting a distinct
  cluster; damage spread evenly across the facility instead of concentrated on one spot.
- **Edge cases / quirks:** Adding units highlights/scrolls to them, which can be disruptive (some users
  wait until the end). Targeting yourself by mis-click is possible (shown with the fake-mission check
  below). The system repeatedly "screams" (warns) when adding already-targeted units.
- **Source:** luwcD04-3jY
- **Confidence:** High

### Fake-mission coverage check
- **Models:** Verifying every target in an area is assigned to at least one striker before committing.
- **Inputs / parameters:** A temporary "fake" strike mission; a selected target group added to it.
- **Behavior / rules:** Create a throwaway strike mission over the target area and add the targets; CMO
  reports which targets are newly selectable vs already struck. By inspecting the fake mission the
  operator confirms "every single one of these targets is being struck by at least one particular
  attacker," then deletes the fake mission.
- **Outputs / effects:** Confirmation of full target coverage (or gaps); the fake mission is removed
  afterward.
- **Edge cases / quirks:** Easy to accidentally include your own unit when selecting targets — re-select
  carefully. Purely a planning/verification aid, not a combat mechanic.
- **Source:** luwcD04-3jY
- **Confidence:** Med

### Manual flight-plan / IP geometry to preserve laser LOS & avoid masking terrain
- **Models:** The auto-generated flight plan is "dumb" and may route over masking terrain; you must
  shape the Ingress Point (IP) and per-leg altitudes so the laser keeps line of sight on the target.
- **Inputs / parameters:** IP placement/heading; per-waypoint altitudes (**F2**; set IP 2,000 ft,
  over-target 2,000 ft); terrain elevation along the route (~200–900 ft); cloud base (7,000 ft); LGB min
  launch altitude (2,000 ft AGL); the "Create or update flight plan" button.
- **Behavior / rules:** Generate flight plans (Create/Update Flight Plan), then inspect each:
  auto-routes often swing over the highest part of the mountain where there's no LOS to the target. Grab
  the IP and rotate it so the run-in comes around/behind terrain with a clear LOS. Set IP and
  over-target waypoint altitudes inside the legal band (2,000 ft here — above the 2,000 ft AGL min,
  below the 7,000 ft cloud, clear of ~900 ft terrain). Optionally add a dogleg before the target for
  more turning room, drop, laser-guide, and egress fast. You can step through waypoints (arrow keys) to
  set each one's altitude.
- **Outputs / effects:** A flight plan that keeps the weapon's laser/optical LOS unbroken so bombs
  actually hit.
- **Edge cases / quirks:** If a leg masks the target behind terrain, or altitude is set into the cloud
  (e.g. 25,000 ft) or below min-launch, the strike fails. Command "will not do this for you" — you must
  explicitly tell mission aircraft to use the predesigned flight plan or they ignore it. Always **Save**
  before/after building missions ("always a 90% chance" you forgot a setting).
- **Source:** ZD0z_nWLSp4
- **Confidence:** High

---

## 14. Reconnaissance & Run-In Profiling (Strike Support)

### Reconnaissance sensor: search vs identify ranges & required line-of-sight
- **Models:** A recon sensor has a longer detection radius than its positive-identification radius; both
  need line of sight, and closer = better resolution.
- **Inputs / parameters:** Sensor type (generic **Recon pod** on a MiG-21R / "Romeo"); camera max search
  range **5 nm**; max identify/confirm range **10 nm**; line-of-sight (blocked by cloud); altitude vs
  cloud base.
- **Behavior / rules:** The generic Recon pod camera has a **5 nm** max range for searching and **10 nm**
  for actually seeing/confirming a ground object. Flying parallel to the target at ~1 nm offset lets the
  side-looking camera snapshot it without overflying. Visual/optical sensing requires being **under** the
  cloud layer (cloud base 7,000 ft here) to have line of sight; getting closer improves target
  resolution.
- **Outputs / effects:** Contacts are detected then positively identified, revealing target types
  (watchtower, tarmac, boats, mobile AAA) — building the priority target picture before risking strike
  aircraft.
- **Edge cases / quirks:** Bombers can use radar to detect ground targets, and inertial/GPS-guided
  weapons don't need optical LOS — those bypass the cloud/visual constraint. The numbers (5 nm search /
  10 nm identify) are stated verbatim for the **generic Recon pod specifically**.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Recon pass geometry & survivability vs AAA
- **Models:** Flying along the length of a defended runway/airfield maximizes exposure time and gives
  every AAA a free shot; flying parallel and offset minimizes time in the threat ring.
- **Inputs / parameters:** Recon platform speed (MiG-21R cruised ~**470 kt**; afterburner used to build
  speed); altitude relative to cloud base (7,000 ft); offset distance (~**1 nm**); runway facing; AAA
  lethal range.
- **Behavior / rules:** Do **not** rip across the middle or down the runway's length — defenses expect
  that and get long engagement windows. Instead fly parallel to the field at ~1 nm offset under the
  clouds at high speed (afterburner) to minimize dwell in the danger zone. A deliberate overflight down
  the runway centerline immediately drew triple-A fire ("under attack almost immediately"), confirming
  the exposure-time risk.
- **Outputs / effects:** Successful parallel passes reveal targets at low risk; a centerline overflight
  exposes/locates AAA but at high risk of loss.
- **Edge cases / quirks:** Provoking AAA can be used deliberately to reveal hidden AAA positions ("I
  wanted to reveal the enemy AAA") — but the recon plane risks becoming a "victim of its own success."
  AAA was shown firing very large-caliber rounds (130 mm class) capable of hitting fast movers.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Waypoint-driven altitude/speed profiling for the attack run
- **Models:** Per-waypoint altitude and throttle let you script a descent/afterburner profile; the
  aircraft begins transitioning toward a waypoint's settings before reaching it.
- **Inputs / parameters:** Per-waypoint altitude (set via **F2**), per-waypoint throttle (afterburner),
  waypoint placement (**F3** to add); cloud base (7,000 ft); minimum safe operating altitude (stated
  **6,950 ft** to skim just under the clouds).
- **Behavior / rules:** Build waypoints (F3), then set each one's altitude/throttle (F2). Aircraft start
  their descent/climb toward a waypoint's commanded altitude **in advance** (waypoints "trigger the
  descent") rather than snapping at arrival; e.g. set the first WP 10,000 ft + afterburner, the next WP
  6,950 ft (just under the 7,000 ft cloud base) keeping afterburner, and an exfil WP that converts speed
  into a climb to safety. Do not let up on afterburner during the run or "that'll give us issues."
- **Outputs / effects:** A scripted speed/altitude profile so the platform is fast and under the clouds
  exactly during the dangerous pass, then zoom-climbs out.
- **Edge cases / quirks:** If you click the wrong waypoint you must override altitude manually. After
  passing the low waypoint the aircraft tends to climb and slow automatically unless you manually
  override altitude. 6,950 ft is the stated "minimum we can safely operate" just below the 7,000 ft
  cloud base in this scenario.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Cloud cover gates line-of-sight (optical/laser) weapons
- **Models:** A cloud layer between the weapon and the ground blocks optical/laser guidance; the firing
  aircraft must get below the cloud base to see and hit the target.
- **Inputs / parameters:** Cloud base altitude (scenario: **7,000 ft**; clouds **7,000–16,000 ft**);
  weapon guidance type (LGB, rockets, optical = need LOS; GPS/inertial = don't); aircraft altitude.
- **Behavior / rules:** Anything requiring line of sight (laser-guided bombs, rockets, optical) must be
  employed **below 7,000 ft** so the aircraft/weapon can see the ground. GPS- or inertial-guided weapons
  do not need optical LOS and can be used from above the clouds. Practically, aircraft are dropped to
  **6,900 ft** to stay just below the 7,000 ft cloud base while delivering LGBs.
- **Outputs / effects:** If you release above the cloud base with an LOS weapon it will miss (the laser
  loses sight of the ground). Below-cloud delivery enables precise hits.
- **Edge cases / quirks:** Weather is explicitly the scenario's main complication. Bombers can drop
  unguided bombs **through** clouds (no LOS needed) — exploited to attack AAA from above the weather. The
  cloud-base value is scenario-specific, **not** a universal constant.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

### Runway attack geometry — strike along length at an oblique
- **Models:** To hit a thin linear target (runway), attack along its length at a slight oblique so the
  bomb stick walks down it instead of crossing it once.
- **Inputs / parameters:** Runway facing/heading (read by clicking the runway; example facing **180** =
  due south); attacker approach axis; formation alignment.
- **Behavior / rules:** Read the runway's facing, then orient the attack so bombers cross/run **along**
  the runway's length at a slight oblique angle (not perpendicular, not exactly parallel). A column
  formation aligned to the runway length makes a bomb stick much more likely to score hits along it.
- **Outputs / effects:** Higher hit probability on the linear runway target.
- **Edge cases / quirks:** The presenter mislabels N/S vs E/W mid-video and "fixes" the runway facing in
  the editor; the geometric principle (along-length oblique) is the load-bearing rule. Runways "can be
  repaired very very quickly" (fast concrete) — so killing parked aircraft is often a better way to put
  a base out of commission than cratering the runway.
- **Source:** 1PuSQh4Co3c
- **Confidence:** Med

### Manual formation assignment (F4) to concentrate fire
- **Models:** Putting a group into a tight column with set spacing makes them deliver weapons in a
  coherent line instead of a scattered "star" that sprays.
- **Inputs / parameters:** Formation type (column); inter-aircraft spacing (set ~**250 m**); group
  membership.
- **Behavior / rules:** Select the group, **F4**, choose Column, set spacing (~250 m). Aircraft line up
  single-file so their weapon release falls along one axis (e.g. down a runway), concentrating effect.
  Without this the group flies in a spread/"star" formation and sprays munitions all around the target,
  requiring multiple half-passes and exposing them repeatedly.
- **Outputs / effects:** A tighter, more concentrated weapon pattern along the intended axis; fewer
  wasted passes.
- **Edge cases / quirks:** If formation isn't set, trailing aircraft in a "weird star formation" spray
  around the base and do twisty half-passes, each re-exposing them to MANPADS/AAA. Demonstrated as a
  recurring failure when the presenter forgot to fix the formation.
- **Source:** 1PuSQh4Co3c
- **Confidence:** High

---

## 15. Platform Generation & Standoff-Weapon Survivability

### Fighter generation gap — detectability, weapon reach & survivability in a strike
- **Models:** A 4th-gen fighter (F-16) must close into dense defenses and trade missiles attritionally;
  a 5th-gen fighter (F-35) uses low observability + long-range weapons to shoot first from standoff —
  but neither guarantees target destruction if the standoff weapons get shot down.
- **Inputs / parameters:** Aircraft generation/RCS (F-16 vs F-35A); weapon reach (long-range AMRAAM, SDB
  **60 nm**, JSOW ~**60 nm**); weapon stealth (SDB slightly stealthy); enemy radar detection vs
  low-observable radar; force size (12 strikers / 12 escorts vs 24 F-35s).
- **Behavior / rules:** *4th-gen:* aircraft must fly in close ("get nailed"); both sides exchange
  missiles until one runs out; heavy attrition (lost half the F-16s, did almost no target damage).
  *5th-gen:* low-observable radar means the enemy "isn't even going to know it's been shot at" — the
  F-35 detects/shoots first from much farther out (doesn't have to get nearly as close); the enemy only
  picks up the incoming missiles, not the shooters. F-35s fire and immediately run at max speed.
  Standoff SDBs were launched from beyond SAM detection.
- **Outputs / effects:** The 5th-gen run took **zero losses** and downed **6** aircraft, but did "very
  very little damage to the target because all of those standoff weapons were all shot down" by
  interceptors before reaching the target. The 4th-gen run suffered heavy losses for negligible damage.
- **Edge cases / quirks:** A target can be "too well defended" for ordinary standoff weapons regardless
  of platform stealth. Trading SDBs for LGBs would get closer to the target but put the F-35s in much
  greater danger — a survivability-vs-effect tradeoff. Outcome numbers (6 kills, 0 losses; half F-16s
  lost) are **observed single-run results** with acknowledged stochastic variance.
- **Source:** lKuGbWOd3is
- **Confidence:** Med

### Weapon selection by reach vs stealth (no-HARM SEAD problem)
- **Models:** Against well-defended targets you must match weapon reach (and ideally low observability)
  to the threat; lacking dedicated SEAD (no HARM) forces reliance on long-reach standoff weapons.
- **Inputs / parameters:** Available weapons and their stated ranges (**SDB 60 nm, JSOW ~60 nm**);
  stealth attribute (SDB slightly stealthy, JSOW less stealthy); presence/absence of HARM; threat-ring
  depth.
- **Behavior / rules:** With no HARMs available, you need weapons with "reach" so the launch point sits
  outside the SAM envelope. SDB is "almost optimum" here: ~60 nm range and slightly stealthy. JSOW is
  also ~60 nm but "not nearly as stealthy." Choose the weapon whose range keeps the launcher safe and
  whose signature reduces interception.
- **Outputs / effects:** Launch from beyond the defender's detection/engagement range; reduced launcher
  exposure.
- **Edge cases / quirks:** Even an optimal reach/stealth weapon can fail if interceptors shoot the
  weapons down (next rule). SDB and JSOW ranges (both ~60 nm) are stated verbatim.
- **Source:** lKuGbWOd3is
- **Confidence:** High

### Strike package roles: Strikers vs Escorts (assignment order matters)
- **Models:** A strike package separates weapon-carrying Strikers from defensive Escorts/CAP; the engine
  cares about the **order** you add them.
- **Inputs / parameters:** Per-aircraft role (Striker, Escort, CAP); weapon loadouts (strikers =
  SDB/JSOW/LGB; escorts/CAP = AMRAAM + AIM-9X internal); group counts (e.g. 12 strikers + 12 escorts).
- **Behavior / rules:** Assign escorts **first**, then add the strikers/everyone else ("you always do
  the escorts first and then you add everybody else") — doing it in the wrong order forces a redo.
  Strikers carry the ground-attack ordnance; escorts/CAP carry air-to-air (AMRAAM, AIM-9X) to protect
  them.
- **Outputs / effects:** A two-element package (Strikers + Escorts) with correct role tagging.
- **Edge cases / quirks:** The presenter explicitly demonstrates getting the order backwards and having
  to redo it, indicating the assignment workflow is order-sensitive. (UI-adjacent, but the order
  dependency is a real mechanic.)
- **Source:** lKuGbWOd3is
- **Confidence:** Med

### Standoff weapons can be intercepted in flight
- **Models:** Long-range glide/standoff munitions (SDB, JSOW) fly slowly enough that enemy fighters can
  chase and shoot them down before impact.
- **Inputs / parameters:** Weapon type & speed (SDB, JSOW glide weapons; ~60 nm range); enemy
  interceptors (MiG-35) and their air-to-air weapons; number of inbound weapons; target defenses.
- **Behavior / rules:** After release, SDBs/JSOWs transit toward the target where defending fighters
  actively try to "shoot as many of these down before they actually get down." In the demo essentially
  all the standoff weapons "got splattered before they got close to the target," so despite a clean
  launch the target took minimal damage.
- **Outputs / effects:** The inbound weapon count is attrited by defenders; target damage depends on how
  many leak through, not just how many were launched.
- **Edge cases / quirks:** Contrast with cruise missiles + jamming (next rule), which **did** get
  through the same defenses — weapon survivability against fighters/SAMs is decisive, not just standoff
  range.
- **Source:** lKuGbWOd3is
- **Confidence:** Med

### Cruise-missile saturation with jamming decoys (penetration of dense defenses)
- **Models:** Salvoing many stealth cruise missiles together with jamming/decoy drones creates a "wall
  of noise" that overwhelms defenders so enough missiles leak through to strike.
- **Inputs / parameters:** Stealth cruise missiles (**JASSM** — "stealth cruise missiles" at high
  altitude); jamming/decoy drones (MALD-style "standin oecm1" that jams and loiters/circulates); number
  of simultaneous inbounds; defender fighters/radars; a B-52 as the launch truck (full rack, then can be
  deleted).
- **Behavior / rules:** Sprinkle jamming decoys across the target area, then launch a large simultaneous
  wave of stealth cruise missiles plus the jammers so a "wall of noise" arrives at once. Defenders
  scramble and chase the inbounds; some missiles and decoys are shot down, but the saturation + jamming
  lets missiles get through. This **did** strike the target perfectly and did substantial damage where
  bare standoff weapons (SDB/JSOW) had failed against the same defenses.
- **Outputs / effects:** Target struck with substantial damage (pier annihilated; ground kills — **2×
  MiG-35** and **12× Su-27** destroyed on the ground, plus a radar). The defender force was left
  "utterly disorganized." Expenditure comparable in cost to the whole F-16 package.
- **Edge cases / quirks:** Jammers protect themselves and the strike ("the jammer jams") and
  circulate/loiter. The B-52 dumps its entire rack and can be deleted immediately (it's just the launch
  truck). The presenter notes he did **not** spend 25 minutes optimizing each missile's route — even
  unoptimized, saturation + jamming worked. **Sub kills not achieved** (subs survived) — saturation
  isn't omnipotent.
- **Source:** lKuGbWOd3is
- **Confidence:** Med
