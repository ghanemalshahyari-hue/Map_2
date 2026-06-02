# CMO Functional Rules (Exhaustive) — Doctrine & Adjudication

**Bucket scope.** This is the *exhaustive* rules spec for the **Doctrine & Adjudication** bucket: every
mechanic that governs how a CMO unit *decides to fire* and how that decision is resolved. It covers the
doctrine inheritance hierarchy and force-override; Rules of Engagement (Free/Tight/Hold) keyed per
target environment; movement/evasion/RTB doctrine that shapes whether an attack even happens; Weapon
Release Authorization (WRA) — salvo sizing, shooters-per-salvo, automatic-firing-range bands,
target-type binding, inherited missile-defense values; self-defense as a separate axis; unit
proficiency and its narrow four-effect scope; the OODA reaction-time model; targeting-priority lists
and how manual orders override them; No-Escape-Zone (NEZ) launch timing; collective responsibility and
identification gating; and the probabilistic resolution of salvo Pk and soft-kill (chaff/spoof).

This document is **exhaustive for this bucket**: it consolidates *every* rule extracted from *every*
<<<<<<< HEAD
transcript in the bucket, then merges in the corrections and additional detail from the first-pass
spec (`docs/cmo-functional-rules/2-doctrine-wra-engagement.md`). Near-identical mechanics are merged
into one rule citing all source videos; nothing from the first pass (especially its **CORRECTION**
findings and the "Why won't my weapons fire?" diagnostic checklist) has been dropped.
=======
transcript in the bucket. Near-identical mechanics are merged into one rule citing all source videos.
Hand-verified **CORRECTION** findings (the proficiency Ace→Regular→Novice scale and its exactly-four
effects; Weapons Hold still self-defending against the incoming weapon; the side→mission→group→unit
doctrine inheritance with per-setting scenario-designer lock; the geometric `1−(1−p)^n` salvo math;
the air-vs-ground opportunity-target split) are carried inline below, along with the "Why won't my
weapons fire?" diagnostic checklist; nothing has been dropped.
>>>>>>> 10671e19ae9977053062c737c8cd82d831f79b78

> **AUTO-GENERATED-CAPTION CAVEAT.** All source material is YouTube **auto-generated captions**, so
> spelling and exact numbers may be imperfect (e.g. "WRA" mis-transcribed as "W Ur"/"Wright window",
> "OODA" as "uda"/"oota", "DLZ" as "dlc", missile/aircraft names garbled). **Stated numbers are
> reproduced verbatim** and should be treated as illustrative of that specific database unit, not as
> universal constants — pull the real value from the unit's record. Where a number is the presenter's
> explicit guess, it is flagged.

**Source videos in this bucket** (transcripts in `docs/cmo-captions/`):
`XjfL2uNhGR0` Doctrine Settings · `YepPcVyCtnA` WRA · `H4_mmTVn_Yk` How WRA & Doctrine interact ·
`NPvpb7s5SNE` Unit Proficiency · `s63NJyONLAE` OODA Loop · `7DIqKLoe3p4` No Escape Zone WRA Quirks ·
`v3aWJ3s1zQM` Targeting Priority · `AyjnPvsooWw` Self Defense WRA · `fjKeHlO1RsE` Self Defense vs
Automatic Firing · `5E-Kl2lq18k` Estimating/Setting Salvo Sizes · `BB6pZ3agGFs` Collective
Responsibility · `JqZYvpCP7ik` Ground Units Automatic Attack · `qHuId62Lba8` NEZ vs 75% Max Range ·
`hCDLw5AZk0E` Why won't my weapons fire? · `0_DVQq8fIUQ` No Escape Zone Launches (partial).

---

## 1. Doctrine hierarchy & scope

### Doctrine scope, inheritance, and force-override (side → mission → unit)
- **Models:** Behavior rules cascade from the whole side down to individual units, with narrower
  (more-specific) scopes overriding broader ones — *unless* an explicit force-override at the side level
  flips the cascade top-down.
- **Inputs / parameters:** A doctrine record can attach at three nested scopes — **side (whole side)**
  → **mission** → **individual unit/group**. Verbatim: *"this is the entire side's doctrine, it is a
  mission's doctrine, it is an individual unit's doctrine — unless of course you come down here and you
  tell it to automatically override everybody's doctrine in the entire side."* Plus: an
  **"automatically override everybody's doctrine for the entire side"** toggle; a per-unit
  **"inherited from side"** vs **specify-own** choice (shown for proficiency, same model for doctrine);
  a **scenario-designer per-setting lock** checkbox. Access: `Ctrl+Shift+F9` opens side-level Doctrine
  & ROE; per object via its WRA/Doctrine button. WRA and Targeting Priority are *"just another form of
  Doctrine and ROE"* and scope identically.
- **Behavior / rules:**
  - **Default resolution = most-specific wins.** A unit uses its own doctrine if set; else its mission's;
    else the side's. A child scope **inherits** its parent unless it defines an override (demonstrated
    with WRA: a group set to "no automatic fire," a child unit opened and it *"should inherit
    everything — which you can see it did,"* and a sibling *"automatically take[s] advantage of that
    particular feature"*).
  - **Force-override flag (distinct control).** The side Doctrine page toggle *"automatically override
    everybody's doctrine in the entire side"* forces **all** missions/units to the side-level settings
    just configured — the inverse of most-specific-wins.
  - **Missions re-default doctrine.** Creating a mission can override standing doctrine with a
    mission-type default — e.g. **Sea Control** *"automatically turn[s] the radar on … automatically
    ignore[s] plotted course"* (and makes submarines turn radar on / ignore plotted course). Mission
    assignment is therefore an *active* doctrine event, not a passive inherit: *"when you're doing
    missions they can have a different doctrine and WRA than your general forces."*
  - **Per-unit vs inherit is an explicit choice** in the order-of-battle (*"inherited from side"* or
    specify a value).
  - **Scenario-designer lock.** *"Scenario designers can allow you or disallow you from being able to
    change a doctrine setting"* via a per-setting checkbox; locked settings can't be edited by the
    player at runtime.
- **Outputs / effects:** The effective doctrine values that actually apply to a given unit at a given
  time, and whether the player may edit each setting.
- **Edge cases / quirks:** The doctrine page is **blended with EMCON, weapon-release-optimization, and
  withdraw/redeploy** settings (same scoping applies). Watch for mission-default surprises — Sea Control
  silently overrides several settings. A **manual/automatic player-ordered attack overrides** the unit's
  standing doctrine and targeting priority (see §6, §7).
- **Source:** `XjfL2uNhGR0`, `YepPcVyCtnA`, `H4_mmTVn_Yk`, `NPvpb7s5SNE`; corroborated by `v3aWJ3s1zQM`,
  `AyjnPvsooWw`.
- **Confidence:** High.

### Mission vs side/unit doctrine & WRA separation
- **Models:** Missions carry their own doctrine and WRA distinct from the side's general forces; getting
  the mission copy wrong is the single most common source of misbehavior.
- **Inputs / parameters:** Per-mission doctrine & WRA; side/general-force doctrine & WRA.
- **Behavior / rules:** When you create a mission it can have a different doctrine and WRA than the
  general side forces; you must configure the mission's settings explicitly or assigned units inherit
  defaults that misbehave (dumping full bomb stacks, wrong salvo sizes, RTB after a single engagement).
- **Outputs / effects:** Which doctrine/WRA governs units assigned to a mission.
- **Edge cases / quirks:** Getting mission doctrine/WRA wrong *"the first time"* causes the most issues;
  a weapons-state set to a single attack at mission level yields only one missile launched even with a
  full magazine.
- **Source:** `YepPcVyCtnA` (corroborated by `H4_mmTVn_Yk`, `XjfL2uNhGR0`).
- **Confidence:** High.

### WRA / doctrine scope & inheritance (group vs individual unit) + the apply/propagate button
- **Models:** WRA and Targeting Priority can be set at multiple scopes; children inherit the parent
  unless overridden, and a global edit must be explicitly propagated.
- **Inputs / parameters:** Scope of the edit (individual / group / mission / side-global); the
  **apply/propagate** button when editing globally; per-unit override.
- **Behavior / rules:** Set at the group level, an individual unit's WRA shows the **inherited** values
  (e.g. "no automatic fire" appears on each member). **When editing globally you must press the
  propagate/apply button or the change does not stick** across units. Individual units can diverge from
  the group if edited separately.
- **Outputs / effects:** How broadly a doctrine/WRA change takes effect.
- **Edge cases / quirks:** Forgetting the apply button on a global change causes *"confusion"* (settings
  silently not applied). Always re-check individual units after a group change.
- **Source:** `AyjnPvsooWw` (corroborated by `fjKeHlO1RsE`, `YepPcVyCtnA`).
- **Confidence:** Med.

---

## 2. Rules of Engagement & target classification

### Target environments doctrine is keyed on (air / surface / sub-surface; land == surface)
- **Models:** Doctrine/WRA/ROE are resolved **per target environment**, not as one global switch; the
  environment taxonomy is a small fixed set.
- **Inputs / parameters:** ROE/WRA rows separated into **air**, **surface**, and **sub-surface
  (submarine)** targets. Verbatim: *"land surface and land are considered the same type of target"* —
  i.e. **land and surface are the SAME target type**.
- **Behavior / rules:** A unit can be (e.g.) **Hold against air** while **Free against surface**
  simultaneously — the weapons-control state is per-environment, not a single value. This is why "Why
  won't my weapons fire?" diagnoses *"holding fire against air targets"* specifically.
- **Outputs / effects:** Drives which control state / WRA row applies once a contact's environment is
  known.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Rules of Engagement (ROE) — Free / Tight / Hold per target domain
- **Models:** Per-domain weapons-control posture governing when a unit may engage, based on contact
  classification. This is the side ROE state per target environment and it gates the per-weapon WRA
  beneath it.
- **Inputs / parameters:** Target domain (air / surface / sub-surface / land — land == surface); ROE
  state **Free / Tight / Hold**; contact classification (unknown/unidentified, hostile, unfriendly,
  friendly). Contacts are **acquired well before they are identified**.
- **Behavior / rules:** ROE is set **separately per target domain**.
  - **FREE** — *"we will attack anything that is not friendly."* Engages unidentified contacts too
    (risks civilians/friendlies).
  - **TIGHT** — *"it will not allow you to attack targets that have a good positive identif[ication]; it
    has hostile/unfriendly targets [that] don't get attacked — they do get followed."* Engages **only
    confirmed-hostile** contacts; positively-identified hostile/unfriendly targets are tracked/followed
    but **not** attacked. (Presenter keeps units on **Tight** by default.)
  - **HOLD** — *"it won't allow any attacks unless it's in self-defense."* Not a blanket no-fire: a Hold
    unit fired upon by an anti-ship missile *"is smart enough to know … to return fire at it [the
    incoming missile], but not to attack the platform that attacked it first."* So Hold engages an
    **inbound weapon** in self-defense but never counter-attacks the **shooter**. (Red text "weapons
    control status is weapons hold" appears in "Why won't my weapons fire?".)
  - **Manual reclassification override:** the operator can force a contact's identity — hotkey **H/K =
    hostile**, **F = friendly** — changing whether Tight/Free will engage it.
- **Outputs / effects:** Whether and when a unit autonomously engages a contact.
- **Edge cases / quirks:**
  - **ID lag is the structural catch:** *"you'll acquire a target way sooner than you actually identif[y]
    the target,"* so Tight may hold fire on a genuinely-hostile contact until classification catches up —
    the reason aggressive players pre-mark contacts H/K.
  - **On FREE-air a friendly aircraft that drops off the comms network** (battle-damaged radio or
    jamming) becomes an unidentified contact and **gets shot down by its own side** — most common when
    escorts are already airborne.
- **Source:** `XjfL2uNhGR0` (corroborated by `hCDLw5AZk0E`).
- **Confidence:** High.

### Engaging ambiguous targets (Ignore / Optimistic / Pessimistic)
- **Models:** Whether a unit will shoot at a target whose precise location is not fixed (e.g. a
  submarine).
- **Inputs / parameters:** Mode **Ignore / Optimistic / Pessimistic**; confidence in the target's range.
- **Behavior / rules:** **IGNORE** = never attack ambiguous targets. **OPTIMISTIC** = fire if fairly
  confident in the target's range (presenter recalls the threshold as *"like point four nautical miles"*
  of positional confidence). **PESSIMISTIC** = take the shot even on a mediocre (not great, not bad)
  target. Critical for torpedoes vs submarines, which are almost always ambiguous targets.
- **Outputs / effects:** Whether torpedoes/weapons launch at imperfectly-located contacts.
- **Edge cases / quirks:** The 0.4 nm figure is the presenter's **uncertain recollection** (*"I think
  it's like point four nautical miles"*), not confirmed. Submarines **on the surface** stop being
  ambiguous.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

### Engage opportunity targets (ground vs air — opposite defaults)
- **Models:** Whether a unit attacks targets it was not explicitly tasked against (targets of
  opportunity) versus self-defense only.
- **Inputs / parameters:** Doctrine boolean **"Engage opportunity targets"** (Yes/No), sitting after
  "ignore plotted course when attacking" and the ambiguous-targets setting; unit proficiency; whether
  the unit is under attack.
- **Behavior / rules:**
  - **Ground units default to self-defense only.** Verbatim demo: a max-proficiency HIMARS in range
    *"did not fire at the enemy targets even though he was perfectly within range,"* because the weapons
    are *"programmed not to use these weapons [except] self defense."* A ground unit fires only if (a)
    the flag is **Yes**, or (b) it gets a direct/manual attack order, or (c) it is on a mission that
    orders engagement: *"ground units that do not have 'engage opportunities' will not engage … unless
    they're attacked first."* **WRA permission alone is insufficient for ground units.** Flipping the
    flag on, *"as soon as they did that he started firing."* Also applies to coastal batteries; requires
    **line of sight** (terrain/vegetation can block).
  - **Air units behave the OPPOSITE way — they take opportunity targets by default.** *"Let's say they
    have cruise missiles and they're … ordered to attack [a place], they take off and attack these guys
    first because they're targets of opportunity."* An air strike can be derailed by opportunistic
    engagements on the way out, attacking *closer* targets first before proceeding to its tasked target.
- **Outputs / effects:** Autonomous engagement of untasked, in-range targets.
- **Edge cases / quirks:** Classic trap — WRA says "allowed" while a ground unit still holds fire because
  of this flag. The air-unit divert-to-nearest behavior can waste cruise-missile carriers on
  low-value nearer targets.
- **Source:** `XjfL2uNhGR0` (corroborated by `JqZYvpCP7ik`).
- **Confidence:** High.

---

## 3. Movement, evasion & emissions doctrine (shapes whether the attack happens)

### Ignore plotted course when attacking
- **Models:** Whether a unit abandons its movement path to maneuver onto a target, or stays on its
  plotted course.
- **Inputs / parameters:** Setting on/off; the unit's current plotted course/waypoints; target location
  and weapon range.
- **Behavior / rules:** **OFF** (do not ignore): an ordered-to-attack unit must first traverse its
  existing course to a waypoint, then turn to attack — useful to hit a target (e.g. a runway) from a
  specific angle. A ship/aircraft on a course leading *away* from the target keeps travelling and may go
  out of range without firing (*"keep on trucking right out of range"*). **ON**: the unit immediately
  deviates to engage. **This being ON is a prerequisite for the BVR engagement-logic settings
  (follow/crank/crank-and-drag) to work at all** (see §6).
- **Outputs / effects:** The unit's flight/movement path during an attack; whether the attack succeeds.
- **Edge cases / quirks:** Shortcut — with the setting ON, order a Move, then select the waypoint and
  press **Delete** to cancel it (the unit reverts to its own behavior). Sea Control mission default sets
  this to ignore-plotted-course automatically.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Automatic evasion (kinematics vs ECM) — set per mission, not per side
- **Models:** Whether a platform maneuvers away from an inbound missile, or relies on electronic
  countermeasures while staying on course.
- **Inputs / parameters:** Setting on/off; platform ECM strength; platform maneuverability vs threat
  missile performance; **settable per side OR per mission**.
- **Behavior / rules:** **ON**: on seeing an inbound missile the unit begins evasive maneuvering
  (beaming/turning), throwing it off its attack heading — applies to submarines, ships, and aircraft.
  **OFF**: the unit stays on its attack run and relies on ECM/countermeasures (works if countermeasures
  beat the threat's maneuvering). Strong ECM lets you keep the attack run instead of turning away.
- **Outputs / effects:** Platform heading under threat; whether the attack run completes; survivability.
- **Edge cases / quirks:** **Strongly recommended per MISSION, not per side** — turning it off globally
  stops ALL ships/subs from maneuvering away. Rule of thumb: don't disable evasion for a large bomber vs
  a very modern SAM; the relationship reverses for older SAMs vs maneuverable older bombers (e.g. a B-66
  could outmaneuver an early SA-2 B/C). **Combining "jettison ordnance when attacked" with evasion-off is
  self-defeating** (*"you are silly"*) — you lighten the aircraft for maneuvering yet don't maneuver.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Jettison ordnance when attacked
- **Models:** Whether an attacked strike aircraft dumps its stores to gain maneuvering performance and
  escape.
- **Inputs / parameters:** Setting on/off; ordnance type (**excludes air-to-air weapons**).
- **Behavior / rules:** **ON**: when attacked, the aircraft drops all eligible ordnance (fuel tanks,
  bombs, even very expensive missiles) and bugs out, gaining maneuvering speed (e.g. an F-105 dumping
  stores when an SA-2 is fired). Does **not** include air-to-air weapons.
- **Outputs / effects:** Aircraft weapon/stores load; maneuverability and survivability after dumping.
- **Edge cases / quirks:** Combining this with **"do not evade"** is contradictory/self-defeating (you
  lighten for maneuvering yet don't maneuver).
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### EMCON / auto-activate sensors on weapon-incoming-attack (defend at the cost of concealment)
- **Models:** Whether a unit automatically lights up jammer/radar/active sonar when a weapon is inbound,
  trading concealment for the ability to defend.
- **Inputs / parameters:** Setting on/off; detection that a weapon is about to attack the unit.
- **Behavior / rules:** **ON**: on detecting an inbound weapon the unit automatically turns on its
  jammer, radar, and active sonar so it can engage the incoming weapon and return fire. **OFF**: it does
  none of these — which may prevent it from returning fire or even **engaging the incoming weapon at all**
  — but it does not give away its position to a chance shot. (Self-defense presupposes these sensors come
  on; this toggle can therefore preclude self-defense.)
- **Outputs / effects:** Sensor/emitter state under attack; ability to intercept incoming weapons;
  emissions signature.
- **Edge cases / quirks:** **Exploitable** — firing a wall of decoys at an enemy surface action group
  that has this ON forces it to switch on radars to engage the decoys, revealing position and radar
  types. ROE **Free** combined with this lets a unit auto-fire at unidentified inbound decoys. With it
  OFF the unit stays dark but defenseless.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Naval / submarine / land navigation route mode
- **Models:** How pathing is computed for ships, submarines, and land units across the map.
- **Inputs / parameters:** Mode per domain — **ship**: shortest / deepest / stay-in-shallow;
  **submarine**: shortest / deepest / littoral (shallow); **land**: shortest route only.
- **Behavior / rules:** Navigation chooses a route per the selected preference. Submarine depth affects
  how sound reflects in ASW. Land warfare offers **only** "shortest route."
- **Outputs / effects:** The route a unit takes between points.
- **Edge cases / quirks:** Over very long distances the route calculation can take the game noticeable
  time to compute.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

---

## 4. Logistics & sortie-generation doctrine

### Air refueling / underway replenishment doctrine
- **Models:** Whether and how units use tankers/replenishment, including tanker-selection priority.
- **Inputs / parameters:** Allow/disallow refueling & underway replenishment; tanker selection
  (**nearest** vs **priority-to-objective** vs **priority-to-tanker**); **allow refueling allied units**
  toggle.
- **Behavior / rules:** If allowed, a tanker can refuel another tanker, and units will seek tankers.
  Selection can favor nearest tanker, the objective, or tankers. Units can optionally refuel allied
  units (useful in mixed Navy/Air Force missions).
- **Outputs / effects:** Whether/where units refuel; mission routing.
- **Edge cases / quirks:** Known **failure loop** — aircraft take off, fly back to a tanker behind them,
  fly forward to the mission, run out of fuel halfway, return to the tanker: a vicious loop.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

### Air operations tempo (Surge vs Sustained) — rearm/refuel turnaround
- **Models:** How long it takes to rearm and refuel an aircraft between sorties, reflecting operational
  intensity.
- **Inputs / parameters:** Tempo mode **Surge vs Sustained**; loadout being prepared.
- **Behavior / rules:** Sets aircraft turnaround time. **SURGE**: fast turnaround for maximum sortie rate
  (target ~4–5 sorties/day) — demo: preparing an F-16 with GBU-12s took **6 hours**. **SUSTAINED** (more
  realistic for long campaigns): roughly **one mission per day** — the same F-16/GBU-12 prep took **20
  hours**, including extra maintenance, fueling, unload/reload/reset.
- **Outputs / effects:** Ground turnaround duration before an aircraft is ready again.
- **Edge cases / quirks:** Surge is hard for any air force to sustain, so many scenario designers disable
  it. Large turnaround numbers seen elsewhere are large specifically because **Sustained** is active.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Quick turnaround
- **Models:** A fast rearm/refuel mode that returns an aircraft to the air almost immediately, at the
  cost of a limited sortie quota.
- **Inputs / parameters:** Quick-turnaround enabled; per-sortie quota (total sorties/takeoff-landings);
  maximum cumulative flying time across sorties.
- **Behavior / rules:** When enabled and the aircraft is Ready, it gets a quick-turnaround budget: a
  fixed number of sorties (demo: **2 sorties** total), a maximum cumulative flying time (demo: **4
  hours**), and **no downtime** between sorties. After landing it rearms/refuels in **~30 minutes** (vs
  hours). Each launch consumes one sortie opportunity and draws down the flying-time budget.
- **Outputs / effects:** Near-instant rearm; decremented sortie/flying-time budget.
- **Edge cases / quirks:** If the first sortie already used ~4.5 hours of a 4-hour budget, the aircraft
  is **not** allowed to fly again. Works for both air-to-air and anti-submarine loadouts.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

---

## 5. Disengagement & return-to-base (RTB) triggers

### Bingo / Joker fuel state (fuel-state RTB trigger)
- **Models:** The fuel-reserve threshold at which a unit decides to return to base.
- **Inputs / parameters:** **Bingo fuel** (kg + time + range to return from current position); RTB-on-fuel
  mode — **Bingo** / **Joker (= +10%)** / custom up to **+50%** above bingo / **never RTB**; current
  position relative to home.
- **Behavior / rules:** **Bingo fuel** = exactly enough to reach base from the current location
  (recomputed continuously as the unit moves; an "out-of-fuel" blue ring shows reachable extent). RTB
  trigger choices: **Bingo** (return when fuel hits bingo); **Joker** (return with ~10% extra reserve —
  reduces available air time); custom percentages up to **+50%** above bingo (*"paranoid"*); or **"don't
  RTB when fuel runs out"** (yields many aircraft losses).
- **Outputs / effects:** When a unit turns for home; remaining loiter/air time; survivability.
- **Edge cases / quirks:** Range stays constant (absolute range) but the *reachable/return* distance
  shrinks as you fly away from home and grows toward it. Higher reserves shorten usable flight. Demo
  bingo: **3,500 kg**.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Group fuel-state RTB behavior
- **Models:** How a low-fuel condition within a group triggers RTB for the individual vs the whole group.
- **Inputs / parameters:** Mode — **individual-leaves-group-when-low** / **whole-group-RTB-when-last-unit-is-low**;
  optional **forced-bingo** overlay.
- **Behavior / rules:** **Option A**: a low-fuel unit leaves the group and flies home alone (loses group
  support). **Option B** (opposite): the group only goes home when the **last** member runs low (often
  paired with a forced-bingo to avoid stragglers). *"A lot of fuel just go home"* (individual RTB on
  bingo) is the common safe choice; *"don't return to base when fuel runs out"* produces heavy losses.
- **Outputs / effects:** Which units RTB and when; group cohesion and mutual support.
- **Edge cases / quirks:** Individual-leaves drops mutual support; whole-group-on-last-unit risks running
  others dry unless combined with a forced bingo.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

### Weapons-state RTB triggers (Winchester / Shotgun / one-engagement / percentage)
- **Models:** When a unit returns to base based on remaining weapons / engagement count.
- **Inputs / parameters:** Weapons-state mode — **Winchester** (first time out of mission-specific
  weapons) / **Winchester-but-use-guns** / **Shotgun** (one engagement with guns) /
  **one-engagement-with-BVR-or-standoff** / **fire-all-then-run** / **by percentage of weapons**;
  **targets-of-opportunity-with-air-to-air-guns** toggle.
- **Behavior / rules:** **WINCHESTER** = RTB as soon as mission-specific weapons are exhausted (a variant
  also allows strafing with guns if a worthwhile air target appears). **SHOTGUN** = limit to **one
  engagement with guns** (hit-and-run with guns). Other "one engagement" variants: one engagement with
  BVR/standoff weapons (hit-and-run with standoff, **not** including dogfight missiles), or
  fire-all-then-run. Percentages can also trigger RTB. **A "salvo" counts as one engagement**, so a
  shotgun/one-engagement unit fires only the salvo size set by WRA even if more missiles remain. (WRA↔
  Doctrine example: a "fire a quarter" order on a 10-weapon jet = 3 rounds, then RTB.)
- **Outputs / effects:** When the unit disengages and returns; how many weapons it expends.
- **Edge cases / quirks:** Enabling air-to-air-gun targets-of-opportunity on a poorly-maneuverable
  carrier aircraft (e.g. an F-4E that fired all its AIM-7s, finds a MiG-17) gets it shot down — reserve
  it for true dogfighters like the F-16. **Loadouts carry their OWN preset weapons-state** (e.g. "1
  engagement then RTB / use loadout setting"); you must override per mission or the aircraft turns home
  after the first fight regardless of remaining weapons, then faces a long rearm.
- **Source:** `XjfL2uNhGR0` (loadout-preset trap corroborated by `H4_mmTVn_Yk`).
- **Confidence:** High.

---

## 6. Engagement geometry & maneuver doctrine

### BVR engagement logic (Follow / Crank / Crank-and-drag)
- **Models:** How a shooter maneuvers after launching a BVR missile that needs continued guidance.
- **Inputs / parameters:** Mode **Follow / Crank / Crank-and-drag**; **requires "ignore plotted course
  when attacking" = ON**; radar cone; weapon time-to-engage; missile go-active range.
- **Behavior / rules:** **Prerequisite: ignore-plotted-course must be ON** for these to function.
  - **FOLLOW (missiles straight in):** keep the nose pointed directly at the target so it stays in the
    radar cone (closes distance fast; if the target maneuvers outside the cone the missiles go dumb).
  - **CRANK:** after firing, turn the nose to an angle that still keeps the target inside the radar cone
    but slows the closure rate, keeping the missile guided while not closing as quickly.
  - **CRANK-AND-DRAG:** crank after firing, then as soon as the missile goes active turn the aircraft
    **away** from the target to avoid return fire (you lose sight of the target but stop closing).
- **Outputs / effects:** Shooter heading after launch; closure rate; whether guidance is maintained;
  shooter exposure.
- **Edge cases / quirks:** Use **Follow** to close to a deadlier weapon's range with an inferior missile
  (e.g. fire R-27R to force a turn, then use R-27T) — only viable while pointed at the target the whole
  time; **Sparrows cannot do that** (semi-active, must keep pointing). For **Crank-and-drag** you need a
  modern active-radar missile (e.g. **AIM-54**) that can guide itself after going active; the AIM-54 must
  get within **~10 nm** to actually work, so the shooter can't turn away until that last weapon is locked
  on. Some missiles have a **minimum firing limitation** requiring you to back off before firing.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Anti-surface warfare with SAMs (use SAMs in ASuW mode) & maintain standoff
- **Models:** Allowing surface-to-air missiles to engage surface targets, and keeping shooters at
  distance from their targets.
- **Inputs / parameters:** **Use SAMs in anti-surface mode** (on/off); **maintain-standoff-to-target**
  (on/off); SAM-type capability.
- **Behavior / rules:** Certain SAMs can engage surface targets when ASuW mode is enabled — very useful
  against massed small-boat attacks (but burns expensive SAMs). **Maintain standoff to target** simply
  tries to keep the shooter away from the target it is firing at.
- **Outputs / effects:** Whether SAMs fire at surface targets; shooter standoff distance.
- **Edge cases / quirks:** Risk of expending very expensive SAMs on cheap boats; maintain-standoff
  interacts with the automatic firing range.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

### Air-to-ground strafing doctrine
- **Models:** Whether ground-attack aircraft make repeated low-altitude gun strafing passes versus a
  single bomb pass.
- **Inputs / parameters:** Strafing allowed/disallowed; targets-of-opportunity-with-guns toggle (loadouts
  default to one attack); aircraft attack altitude from the loadout profile (e.g. Hi-Lo-Hi ≈ **100 ft**
  attack altitude).
- **Behavior / rules:** If strafing is allowed, aircraft drop bombs first, then make **repeated gun
  passes** (presenter cites **FIVE attacks per pass**), looping around again and again at extremely low
  altitude. Because guns require very low altitude and may not penetrate, the aircraft linger in the
  threat envelope and take heavy losses. If disallowed, after the bomb pass they track for home.
- **Outputs / effects:** Number/altitude of attack passes; aircraft exposure and losses.
- **Edge cases / quirks:** Loadouts are preset to one attack, so to strafe you must enable **both** "use
  gun" and "targets of opportunity." Even an A-10 with a powerful gun is a usable-but-not-decisive weapon
  in game terms and still takes losses strafing.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

---

## 7. Weapon Release Authorization (WRA)

### WRA panel structure & per-weapon firing authorization
- **Models:** For each weapon a unit carries, under what conditions and at what range it may fire, and
  how many rounds it commits — keyed to the target's classification.
- **Inputs / parameters (per weapon, per target category):** Panel reached via Doctrine & ROE
  (`Ctrl+Shift+F9`, "Weapon Release Authorization / WRA"). Per-row fields:
  - **Weapons per salvo** — *"how many weapons we're going to fire per attack"* (a salvo = one
    engagement; left side = target type, right side = qty).
  - **Shooters per salvo** — *"how many people should try to attack the target at a time"*: **"fire
    weapons from enough units to fill the salvo requirement"** or a fixed **1 / 2 / 4 units**.
  - **Automatic firing range** — *"the 'I'm going to fire at it' range"*: **No Escape Zone (NEZ)**,
    **50% of max**, **75% of max**, **max range** (system default — *"takes into account the dynamic
    launch zone"*, won't fire on a target flying out of reach), **No automatic fire**, **Very close**, or
    a **specific distance**.
  - **Self-defense** range (separate axis — see §8): max range / specific range /
    do-not-use-in-self-defense.
  - **Inherited missile-defense value** (land/surface targets — see dedicated rule below).
  - **Target categories** observed: *unspecified / unidentified*, *aircraft (unspecified/generic)*, plus
    fine-grained classes — **low/medium/high-performance reconnaissance**, **low/medium/high-performance
    bombers**, **fighters**, **AWACS**, **tankers**, **UAV / Class-1 / Class-2 UAV**, **guided weapons**,
    **ballistic weapons**, and (ground) **facility / runway facility / mobile-target / building** rows.
- **Behavior / rules:**
  - The system looks up the target's **current classification**, then fires the configured
    weapons-per-salvo from the configured shooters-per-salvo. **Default behavior fires in pairs** (e.g.
    SA-2 defaults to **2** across the board; Patriot GEM/"errant" rows default to **1** because the
    engine is "confident" in Patriot Pk). Operator overrides per category.
  - A target's **classification drives which WRA row applies.** Unknown → the **unspecified** row; once
    classified (e.g. "bear" bomber, "attack aircraft") its specific row applies — which can flip firing
    order/range.
  - **No automatic fire** (per weapon): the weapon never auto-launches; the player must manually allocate.
    Manual fire is still permitted (with a warning) unless the weapon is also barred against that target
    type.
  - **Manual attack ignores automatic firing range** — *"if you're doing a manual attack you can always
    attack at max distance, it will ignore this."*
- **Outputs / effects:** Determines launch/hold and the number of rounds committed; drives ammo
  expenditure and combined Pk.
- **Edge cases / quirks:** Manual allocation can exceed/override automatic limits (e.g. fire up to 30 at
  once, or force "1 round but 4 shooters"). Ballistic/low-Pk weapons default to 1 per salvo because extra
  rounds are wasted. **Weapon-state RTB interacts with WRA** (a "one engagement / Winchester / fire 25%"
  doctrine can send a unit home after firing far fewer rounds than the salvo would suggest). Displayed
  max range can understate true reach (UI showed 239 km but real reach 900 nm; another showed 239 km vs
  much farther) — auto firing range is set independently of the displayed max.
- **Source:** `YepPcVyCtnA`, `XjfL2uNhGR0`, `H4_mmTVn_Yk` (corroborated by `5E-Kl2lq18k`, `AyjnPvsooWw`,
  `fjKeHlO1RsE`, `hCDLw5AZk0E`).
- **Confidence:** High.

<<<<<<< HEAD
=======
### Diagnosing why a weapon won't fire (ordered checklist)
- **Models:** The full set of gates that must each clear before an acquired, in-range target is actually
  fired upon — the diagnostic order to walk when a weapon refuses to launch.
- **Inputs / parameters:** A manual-engage attempt (**Shift+F1** then click the target) surfaces the
  blocking reason in red (cannot fire) or green (clear) text.
- **Behavior / rules — ordered checklist (each blocker must clear):**
  1. **Weapons control = Hold** for that target environment (e.g. "holding fire against air targets").
  2. **WRA bars the weapon vs this target type** ("do not use weapon against this target type").
  3. **Weapon stowed in magazine** ("cannot fire because the weapons are currently located in our
     magazines") — must be loaded/ready.
  4. **Range gate** — target outside the WRA min/automatic-firing range (e.g. set to 15 nm but target at
     116 nm; or below a minimum). Green text but still no launch.
  5. **Imprecise target** — sensor track too coarse: "weapon is unable to engage imprecise targets"
     (long-range radar can't point precisely enough). Resolves as track quality improves.
  6. **No illumination / no director** — needs a fire-control/illuminator with LOS ("no directors are
     able to illuminate this target," "insufficient reflection," "no line of sight").
  7. **Weather/LOS for designators** — laser-guided bombs fail when clouds sit between designator and
     target even within the 15 nm / 40,000 ft designator envelope; must descend below the cloud layer and
     **maintain LOS** while guiding.
  8. **Weapon geometry/aspect** — e.g. a Stern-Chase (rear-aspect) IR missile reports "target aspect is
     out of range for this type of weapon" in a head-on pass.
  9. **Reaction (OODA) delay not elapsed** (see §13) — even when acquired, the unit's proficiency-scaled
     per-system reaction countdown must finish before launch.
- **Outputs / effects:** Identifies the single blocking gate so the operator can clear it; **"Shift+F1
  and click" is the universal diagnostic.**
- **Edge cases / quirks:** Red text = cannot fire; green text = clear. Multiple blockers can stack, so
  re-check after clearing each.
- **Source:** `hCDLw5AZk0E` (corroborated by `YepPcVyCtnA`, `XjfL2uNhGR0`).
- **Confidence:** High.

>>>>>>> 10671e19ae9977053062c737c8cd82d831f79b78
### WRA: weapons-per-salvo vs target durability and Pk (the two damage gates)
- **Models:** How many weapons to fire per target type, which must satisfy **both** the weapon's kill
  probability **and** enough cumulative damage to destroy the target's hit points.
- **Inputs / parameters:** Weapons-per-salvo per target category; weapon **Pk** (% chance to hit/kill);
  weapon **damage points**; target **damage/hit points**; small-target **size & speed modifiers**.
- **Behavior / rules:** Correct quantity must satisfy **(a)** the weapon's Pk to actually arrive/hit, and
  **(b)** enough cumulative damage to destroy the target's hit points. Verbatim example: **R-60M = 80%
  Pk but only 1.2 damage**, so default single-shot WRA may hit but not destroy a **20-damage Backfire
  bomber**, forcing re-attacks while the shooter is exposed → recommendation **2 rounds vs bombers**.
  Default unknown-contact = fire whatever you have; bombers default to a single weapon. Also applies to
  SAM units. For **guided-weapon (missile-defense) targets**, small missiles apply a **size modifier
  (~−25%)** and a **speed modifier (−15%)**: e.g. a 65% Hawk vs a small missile ≈ 65−25 = 40, then −15%
  ≈ **~25%** hit per missile, so two rounds are far too few.
- **Outputs / effects:** Number of weapons launched per target; probability of a kill; ammo consumption.
- **Edge cases / quirks:** Default WRA for unguided bombs makes aircraft **dump their ENTIRE bomb stack**
  on the first target they see. **Plan damage first, then hit probability.** Verbatim: R-60M Pk 80%,
  damage 1.2; Backfire 20 damage; small-missile size mod ~−25%, speed mod −15%.
- **Source:** `YepPcVyCtnA`.
- **Confidence:** High.

### WRA: shooters-per-salvo (units firing per engagement)
- **Models:** How many separate platforms participate in filling one salvo against a target.
- **Inputs / parameters:** Mode — **"fire enough weapons from enough units to fill the salvo
  requirement"** / **N units fire** (1, 2, 4…); salvo size from weapons-per-salvo; number of available
  shooters.
- **Behavior / rules:** "Fire enough weapons from enough units" spreads the required salvo across units
  (e.g. 3 SA-2 batteries each launch 1 of 3 required missiles). Fixing to **1 unit** = one platform fires
  the whole salvo. Setting **2/4 units** = that many platforms each contribute. **Setting shooters to 1
  unit increases the NUMBER of distinct targets engaged simultaneously** (each unit takes its own
  target) — used to spread fire across many targets rather than concentrating.
- **Outputs / effects:** How fire is distributed across shooters and targets.
- **Edge cases / quirks:** **A salvo IS one engagement**, so a shotgun/one-engagement weapons-state
  combined with weapons-per-salvo = 1 means the unit fires only that single missile even with several
  still on the wings — a common mistake with strike aircraft.
- **Source:** `YepPcVyCtnA`.
- **Confidence:** High.

### WRA: automatic firing range bands (and self-defense range) per target type
- **Models:** The range at which a unit autonomously fires a given weapon, tuned per target type to
  balance kinematics (fast/maneuverable targets engaged closer; slow targets engaged far), plus a
  separate range for self-defense.
- **Inputs / parameters:** Automatic-firing-range mode — system default (max range) / explicit shorter
  distance / **maintain-standoff** / percentage presets (**75%**, **50%**, **35 miles ≈ 2/3**) / **NEZ**
  / **Very close**; weapon **dynamic launch zone (DLZ)**; separate **self-defense firing range**;
  terrain/radar-horizon; **"if we don't know" (unknown)** target value; **manual-attack override**.
- **Behavior / rules:** Per target performance class the operator picks a firing range. System default is
  max range and respects the DLZ (won't fire on a target flying away even if nominally in range, unless
  the missile can actually reach it). Demonstrated curve: slow/low-performance targets engaged far (75%,
  even max); maneuverable/high-performance targets and fighters brought to 50% or NEZ; **unknown targets
  default to ~50% of max range**. **Patriot example**: unknown reduced to **41 miles**, fighters **50%
  of max**, bombers **~35 mi (~2/3)**, AWACS/tankers **75%**, UAV at minimum range. A separate
  **self-defense** range governs attack-of-opportunity engagements against immediately-threatening
  targets regardless of the unit's tasked mission (applies mostly to SAMs). **Lowering** the auto range
  forces the enemy into a kill zone before you fire, preventing waste against targets that duck behind
  terrain.
- **Outputs / effects:** Engagement range; ammo efficiency; whether targets can exploit terrain/horizon;
  combined with salvo size, the full engagement profile.
- **Edge cases / quirks:** **Manual attacks ignore the automatic firing range** and may fire at max
  distance. Tactical examples: set a Hawk to fire only inside a **15 nm** valley so enemies can't hide
  behind a mountain ridge; set an S-400/S-300 to **~50 nm** instead of 200 mi so fast aircraft can't duck
  below the radar horizon (curvature wastes half the nominal range). When **NEZ** is selected but the
  weapon **has no escape-zone data**, the panel still lists 50%/25% of max as fallbacks. Engaging
  unknowns at max range is *"not thrilling / not going to hit anything."* Interacts with maintain-standoff.
- **Source:** `YepPcVyCtnA`, `5E-Kl2lq18k`.
- **Confidence:** High.

### Engagement ordering driven by firing-range arc, not time-of-entry
- **Models:** Which of several inbound targets gets shot first when their per-target firing ranges differ.
- **Inputs / parameters:** Each target's assigned automatic-firing-range band (% of weapon max) and its
  current slant range to the launcher.
- **Behavior / rules:** A target is engaged when it crosses **into its own assigned firing-range arc**. A
  target with a **larger** firing-range setting (e.g. 75% of max — an identified "Bear") is shot
  **before** a target with a smaller setting (e.g. an unknown set to 50% of max) **even if the
  smaller-arc target physically enters overall weapon range first**. Demonstrated: 50% and 75% arcs drawn
  at 22-mile total range; the 75% target fires first.
- **Outputs / effects:** Order and timing of launches across multiple simultaneous threats.
- **Edge cases / quirks:** Counterintuitive — the closer-approaching target can be shot **later**.
  Inspect each target's effective firing range with **Shift+F1** then clicking the target (shows e.g.
  "three missiles at 50% max range" vs "75% of max range").
- **Source:** `5E-Kl2lq18k`.
- **Confidence:** High.

### WRA target-type binding (set the correct land/target class)
- **Models:** WRA quantities are bound to a specific target classification; ordering a generic attack
  uses the generic class.
- **Inputs / parameters:** Target class (surface contact, runway facility, facility/building,
  mobile-target, specific facility type); per-class round count.
- **Behavior / rules:** You must set the round count against the **actual** target class you intend to
  kill (e.g. set "facility" to 4 rounds), otherwise a plain attack falls back to e.g. "surface contact"
  with the default count. Different land types carry **independent** WRA quantities.
- **Outputs / effects:** Which WRA quantity governs a given attack.
- **Edge cases / quirks:** Pressing the generic attack without setting the land type only attacks *"a
  surface contact with four rounds"* — the wrong category.
- **Source:** `YepPcVyCtnA`.
- **Confidence:** Med.

### Inherited target missile-defense value (auto salvo sizing for land/ship targets)
- **Models:** A per-target attribute telling the engager how many missiles of a type are *expected* to
  be needed to kill that target, used to auto-size salvos.
- **Inputs / parameters:** Target's **missile-defense value** (e.g. **Hawk battery = 11**, **medium
  hangar = 4**, **search radar = 1**); weapon type & damage; **"use inherited target missile-defense
  value"** vs explicit round count; fire-enough-weapons toggle.
- **Behavior / rules:** When "inherited target missile-defense value" is selected as the attack quantity,
  the engager launches that many weapons. Because the value reflects defended/multi-radar targets, it
  **grossly over-fires against fixed, non-defended buildings** (would put 11 missiles into a Hawk, 4
  expensive Kh-31s into a hangar). Appropriate for **ships and ground targets like tanks** but *"useless
  against fixed non-defended targets."* Better practice: compute rounds from **target damage points vs
  weapon damage** — e.g. **hangar 600 dmg / FAB-500 319 dmg ≈ 2 bombs**; **ammo revetment 300 dmg /
  Kh-31[AS-10] 140 dmg ≈ 3 missiles**; **Kh-58 vs search radar = 1**.
- **Outputs / effects:** Number of weapons fired per target; ammo efficiency.
- **Edge cases / quirks:** The Hawk's missile-defense value is very high because US SAM systems use 6–7
  radars (vs Russian search + height + fire-control), so many radars engage simultaneously. Verbatim:
  hangar 600 dmg, FAB-500 319 dmg, medium-hangar defense value 4, Hawk defense value 11, ammo revetment
  300 dmg, Kh-31 140 dmg, search radar defense value 1.
- **Source:** `YepPcVyCtnA`.
- **Confidence:** High.

### WRA target-category salvo defaults & overrides (per-category granularity)
- **Models:** Doctrine pre-authorizes weapons-per-salvo and shooters-per-salvo keyed to the
  identification/threat category of the target.
- **Inputs / parameters:** Per-weapon-type WRA table; rows broken out by **Unidentified target**,
  **Aircraft - unspecified**, and fine-grained categories (low/medium/high-performance recon, bombers,
  fighters, AWACS, tankers, UAV class 1/2, guided weapons, ballistic weapons).
- **Behavior / rules:** Defaults shown: **SA-2 fires 2 missiles** for an unidentified target, 2 for a
  generic aircraft, 2 otherwise (2 across the board). Operator can override per category — demo raises
  SA-2 unknown-target salvo **2 → 3**. **Patriot** GEM/"errant" rows default to **1** round per salvo.
  The setting is applied at fire time per target category, so **changing a target's ID changes which
  salvo size is used.**
- **Outputs / effects:** Sets the salvo size actually launched at each target type; drives ammo and
  combined Pk.
- **Edge cases / quirks:** Categories are granular; the default of firing in pairs is suboptimal for
  low-Pk weapons. Guided-weapon and ballistic-weapon rows are deliberately capped at **1** because
  intercept Pk is ~nil.
- **Source:** `5E-Kl2lq18k`.
- **Confidence:** High.

### Weapon-control-channel cap on simultaneous missiles in flight
- **Models:** Physical limit of a fire-control system on how many guided missiles it can simultaneously
  guide, capping the maximum achievable salvo size.
- **Inputs / parameters:** Number of missile-control / fire-control channels of the launching system
  (**SA-2 = 3 missile control channels**).
- **Behavior / rules:** Salvo size **cannot exceed** the system's channel count — *"that means we can
  only launch three, we can't do more than that."* SA-2 set to exactly 3 because that is its channel
  ceiling; *"some modern systems can shoot quite a few more."*
- **Outputs / effects:** Hard upper bound on weapons-per-salvo for that platform regardless of WRA desire.
- **Edge cases / quirks:** The cap is **per-system capability, not per-weapon**; a mismatch between
  desired salvo (for Pk) and channel limit forces accepting lower combined Pk. (Self-defense demo also
  shows only **6 missiles guided at a time** for a ship.)
- **Source:** `5E-Kl2lq18k` (corroborated by `AyjnPvsooWw`).
- **Confidence:** High.

---

## 8. Salvo sizing & probabilistic resolution

### Multi-missile hit probability — geometric vs ×1.5 heuristic (RECONCILED)
- **Models:** Combined probability of at least one hit when firing multiple independent rounds at one
  target. **Two formulations appear in the corpus; they disagree, and the primary WRA videos supersede
  the Salvo-Sizes tutorial.**
- **Inputs / parameters:** Per-missile **Pk** (read off the weapon record); number of missiles fired.
- **Behavior / rules:**
  - **Geometric / independent-events formula (PRIMARY — implement this):** `P(≥1 hit) = 1 − (1 − Pk)^n`.
    Worked examples: **SA-2 (S-75M F) Pk 35% → two missiles ≈ 58%, three ≈ 72%.** The WRA and WRA↔
    Doctrine videos explicitly use a real "probability of two events" OR calculator.
  - **×1.5 heuristic (Salvo-Sizes tutorial — LESS accurate):** each missile beyond the first adds
    **half** the single-shot Pk. For a 30% weapon: **1 missile = 30%; 2 = 45% (30+15); 3 = 52.5%**
    (computed as 0.45 × 1.5). This is the *"ideal scenario / straight-line"* figure **before** chaff and
    jamming, and is the tutorial's own simplification — *"very accurate"* vs an observed final ~28% but
    not identical, and **not** the same as geometric (which gives 51% / 65.7% for that case).
  - **Recommendation:** against modern targets fire enough rounds (often **three**) to reach a meaningful
    hit probability.
- **Outputs / effects:** Determines how many missiles to put in a salvo; higher salvo = higher
  pre-soft-kill combined hit probability but more channels/ammo consumed.
- **Edge cases / quirks:** The quoted figures are **planning estimates**; the actual per-engagement roll
  still applies (the presenter still missed with 1/3-per-missile odds). Very low single-shot Pk weapons
  (guided/ballistic intercepts vs a small fast target) are a *"waste of time"* regardless of salvo size.
- **Source:** `YepPcVyCtnA`, `H4_mmTVn_Yk` (geometric 58%/72%); `5E-Kl2lq18k` (×1.5 heuristic 45%/52.5%).
- **Confidence:** High.

### Final probability-of-hit degradation vs maneuvering / aware targets
- **Models:** How the catalog single-shot Pk is reduced in the actual end-game when the target maneuvers
  or beams the incoming missile.
- **Inputs / parameters:** Catalog Pk at a given range (e.g. **Patriot "E model" 95% at 55 miles**, valid
  for a target that does **not** turn between 2 and 55 miles); whether the target maneuvers; whether it
  is **beaming** / aware.
- **Behavior / rules:** Catalog Pk assumes a non-maneuvering target across the stated band. If the target
  maneuvers or is aware and beams, Pk drops sharply — a **95% shot "would go down to about 60%"** against
  a beaming target. Doctrine consequence: fire **one** missile at a non-maneuvering target (don't waste
  rounds) but **at least two** against a maneuvering target. Observed end-game Pk values (28%, 85%)
  confirm the realized number differs from the static catalog figure.
- **Outputs / effects:** Actual hit/miss resolution; informs how many missiles to commit.
- **Edge cases / quirks:** High catalog Pk (95%) is explicitly conditional on no turn over the whole
  flight. **Engine limitation:** the operator cannot manually tag a contact as a "fighter," so the engine
  keeps over-committing missiles to a known-but-unclassifiable maneuvering contact.
- **Source:** `5E-Kl2lq18k`.
- **Confidence:** Med.

### Soft-kill (chaff / sensor-spoof) resolution as a per-engagement roll
- **Models:** Defensive chaff/jamming attempts to spoof the missile's sensor, resolved probabilistically
  per incoming weapon/group, **separately** from the terminal hit roll.
- **Inputs / parameters:** Defender's **chaff/jamming salvo**; a **spoof probability** per missile or
  group; the missile's terminal hit roll (described in d-roll terms — *"I rolled a one, so I blew him out
  of the sky"*).
- **Behavior / rules:** When a target deploys chaff, **each missile/group checks independently** whether
  the sensor is spoofed; some succeed and some fail (*"the generic salvo of chaff actually failed the
  first time, these two groups succeeded"*). Missiles **not** spoofed then resolve their terminal hit
  roll against the (degraded) Pk. The final reported probability (e.g. 28%, 85%) is the **net** chance to
  destroy after soft-kill.
- **Outputs / effects:** Whether each missile is decoyed vs proceeds to terminal engagement; net kill
  probability shown at end-game.
- **Edge cases / quirks:** Against very high-energy terminal geometry (a Patriot *"re-entering through
  his roof"*), **chaff does not help** — *"Chaff ain't going to stop that."* Merely turning on the
  fire-control radar can scare an aircraft into *"engaged defensive"* even without a launch (described as
  realistic).
- **Source:** `5E-Kl2lq18k`.
- **Confidence:** Med.

---

## 9. Self-defense (a separate firing axis)

### Self-defense firing is a separate axis from automatic firing
- **Models:** A unit defending itself when *it* is the target, independent of its general auto-engage
  doctrine. Self-defense is a category **completely separate** from automatic firing range.
- **Inputs / parameters:** Per-weapon **self-defense** range (max range / specific distance /
  do-not-use-in-self-defense), set independently of **automatic firing range**; weapons per salvo; number
  of shooters; fire-control channel count.
- **Behavior / rules:**
  - You can set **automatic fire = "no automatic fire"** while leaving **self-defense enabled**, or
    vice-versa. **Weapons Hold** is the baseline self-defense behavior — a Hold unit *"won't allow any
    attacks unless it's in self-defense"* yet still defends against the **incoming weapon** while
    withholding any counter-attack on the **shooter**.
  - When changing globally you must click the **apply/propagate** button or settings won't take.
  - When triggered, self-defense can be bounded to **maximum range** or to a **specific shorter range**.
- **Outputs / effects:** Whether/at what range a unit fires automatically vs only reactively; lets you
  assign one unit to do all interception while another holds fire.
- **Edge cases / quirks:** Engagement is also gated by **physical detection** — low/small inbound weapons
  (sea-skimming Tomahawks) may be out of slant range due to earth curvature / lack of reflection even
  when nominally in range; raising the threat altitude or the sensor helps. Salvo size is capped by
  **fire-control channels** (only **6 missiles** guided at a time shown). **Reload** after expenditure
  takes time and limited cranes/crew; reload priority can be set per launcher.
- **Source:** `AyjnPvsooWw`, `fjKeHlO1RsE`, `XjfL2uNhGR0` (Hold semantics).
- **Confidence:** High.

### Self-defense requires the unit to KNOW it is the victim (weapon-track vs FCR-lock)
- **Models:** A unit only fires in self-defense if it actually knows it personally is being
  targeted/attacked — not merely that hostile weapons are nearby.
- **Inputs / parameters:** Whether the unit has determined it is the target of incoming weapons; for
  weapons — detection/track of the inbound; for unit threats (aircraft) — detection of an enemy
  **fire-control radar locked on** (a "unit attack" = being targeted by a platform).
- **Behavior / rules:** Even with self-defense set to maximum range and the inbound weapons fully within
  range, a unit will **not** fire in self-defense unless it knows it is the victim. In the demo an SA-20
  watched incoming Tomahawks pass through its envelope and **never** self-defended because it did not know
  it was the target, and was destroyed. **Key distinction: "being attacked by a missile" vs "being
  attacked by a unit"** are *different* triggers. For aircraft, being attacked by a unit typically means
  an enemy **FCR has locked you up**; an inbound weapon with no FCR warning may not trigger self-defense.
  Conversely, F-16s with auto-fire OFF / self-defense ON fired **AMRAAMs the instant** they detected they
  were targeted by enemy platforms that had already fired on them.
- **Outputs / effects:** Whether the unit returns fire reactively; if it never recognizes it is the
  victim, it takes no self-defense shots even while the threat is in range.
- **Edge cases / quirks:** An anti-ship-style missile that lights you up with its **own seeker/radar
  emissions** WOULD trigger self-defense if set; a weapon merely *"doing its thing flying by"* will not.
  Because there was no FCR warning in the Tomahawk case, the SAM never started defending for the right
  reason.
- **Source:** `AyjnPvsooWw` (corroborated by `fjKeHlO1RsE`).
- **Confidence:** High.

### Self-defense engages the incoming weapon, NOT the attacking platform
- **Models:** A self-defense-only posture shoots down inbound munitions but never shoots back at the
  aircraft/launcher that fired them.
- **Inputs / parameters:** WRA set to self-defense only (automatic fire off); incoming weapon tracks; the
  attacking platform track.
- **Behavior / rules:** With all weapons set to self-defense only, a ship under attack automatically
  defends against the **incoming missiles** but will **not** fire at the platform that launched them. In
  the demo an Su-34 attacked and was *"never ever shot at"*; only the inbound ESSMs were intercepted.
  Stated rule: self-defense *"defends itself against things attacking it, it doesn't defend against the
  actual platform that is attacking it."*
- **Outputs / effects:** Inbound weapons are engaged; the shooter platform is left untouched, so it can
  keep attacking.
- **Edge cases / quirks:** To also hit attacking platforms you must change doctrine — e.g. enable
  automatic fire at a limited range (see fractional-range rule). A salvo of inbound missiles may all be
  spoofed/decoyed by the target aircraft. Apparent "shots" at the platform may actually be **defensive
  missiles that missed** their inbound target and flew on.
- **Source:** `fjKeHlO1RsE`.
- **Confidence:** High.

### Self-defense-only suppresses both automatic fire AND auto-engage orders (manual still allowed with warning)
- **Models:** Setting a weapon to self-defense only blocks the engine from auto-firing it even when you
  click **Auto Engage Target**; only a manual allocation can still fire it.
- **Inputs / parameters:** WRA weapon mode = self-defense only (no automatic fire); **"Auto Engage
  Target"** order on a specific contact; **manual attack (Shift+F1)** allocation; target-type suitability.
- **Behavior / rules:** When a weapon is self-defense only: (1) the unit will not auto-fire it at in-range
  targets; (2) even issuing **"Auto Engage Target"** on that contact will **not** cause it to fire,
  because the WRA forbids automatic fire; (3) a **manual attack (Shift+F1) is still permitted** — the
  operator can manually allocate weapons. Self-defense vs incoming weapons still works; offensive
  engagement requires an explicit manual order.
- **Outputs / effects:** Blocks auto and auto-engage firing; preserves the operator's ability to manually
  commit weapons; preserves reactive self-defense.
- **Edge cases / quirks:** The **"do not use weapons against this target type" warning is informational**
  — manual fire proceeds anyway. Displayed max range can understate true reach (UI showed 239 km vs real
  900 nm); auto firing range is set independently of that.
- **Source:** `fjKeHlO1RsE`.
- **Confidence:** High.

### Automatic firing range as a fraction of max range (limited-range auto-engage bubble)
- **Models:** Reducing the range at which a unit auto-fires so it only engages threats that penetrate
  inside a chosen safety bubble, while still self-defending against direct attack.
- **Inputs / parameters:** Weapon max range (e.g. **ESSM 22 nm**, **SM-6 Blk1A 172 nm**); automatic
  firing range as a **percentage of max (50% set)** or an **absolute distance** (e.g. 50 nm, 15 nm);
  per-weapon salvo size (single/pair/normal); separate self-defense setting (left enabled).
- **Behavior / rules:** Lower a weapon's automatic firing range below its max (e.g. ESSM auto range to
  **50%** → auto-engages only threats inside ~15 nm of a 22 nm weapon; SM-6 set to **15 nm** or **50
  nm**). Once an enemy **platform** crosses that configured range, the unit auto-fires **without a manual
  order**. This is **independent of self-defense** — even with reduced auto range, the unit still
  self-defends immediately if shot at. Demo: SM-6 auto range set to **50 nm** — the moment the target
  aircraft came within 50 nm it auto-fired and downed it.
- **Outputs / effects:** Unit auto-engages platforms only inside the chosen range; lets a designer define
  a "come no closer than X nm" bubble around a ship while keeping incoming-weapon self-defense intact.
- **Edge cases / quirks:** Self-defense range and automatic firing range are **explicitly different
  knobs** — *"this is automatic firing range, not self-defense range."* Lets designers dare players to
  enter a bubble without disabling defenses. Salvo size (pair vs single) for expensive missiles like the
  SM-6 is set per weapon to conserve them.
- **Source:** `fjKeHlO1RsE`.
- **Confidence:** High.

### Leaker / layered defense via staggered self-defense vs auto ranges
- **Models:** A long-range system thins out a salvo while inner systems engage only "leakers" that
  penetrate to a short range.
- **Inputs / parameters:** Per-unit automatic-firing-range thresholds (e.g. an inner system set to engage
  only within **10 nm = leakers**); proficiency setting (raised to make crews quicker to fire);
  slant-range / line-of-sight constraints.
- **Behavior / rules:** Set a heavy/long-range battery to fire at long range to wear down a salvo, then
  configure shorter-range point-defense units to start engaging only once a threat penetrates inside a
  small range (**10 nm "leaker" threshold** in the demo). Crews will not fire until the inbound crosses
  the configured range **AND** is within slant range / line of sight. Raising proficiency makes a crew
  quicker on the draw. Inner-layer systems (e.g. Pantsir/"Greyhound") act as last-ditch defense.
- **Outputs / effects:** A layered engagement; inner units conserve fire until threats leak through while
  the long-range unit attrits the salvo first.
- **Edge cases / quirks:** The presenter wanted **8 nm** (or a distance equal to ~11 seconds of flight)
  but the UI only allowed certain values, so he picked **10 nm**. **Point-defense units placed behind
  terrain (mountain/coast) or even inside a tree can have no line of sight and fail to engage** despite
  correct WRA. Effectiveness depends on getting threats into that critical range with LOS.
- **Source:** `AyjnPvsooWw` (corroborated by `fjKeHlO1RsE`).
- **Confidence:** Med.

---

## 10. ASW & submarine doctrine

### Submarine ASW doctrine: avoid contact & dive-when-threat-detected
- **Models:** When a submarine evades versus engages, and what threat cue triggers an automatic dive.
- **Inputs / parameters:** **Avoid contact** mode (**Yes-always** / **Self-defense**);
  **dive-when-threat-detected** mode (**No** / range-based **"ship within 20 nm or aircraft within 30
  nm"** / on-periscope-or-surface-search-radar-detection / on-ESM-detection / on-threat-proximity /
  combination); contact classification & range.
- **Behavior / rules:** **AVOID CONTACT = Yes always**: the sub never engages, always flees anything
  attacking it. **Self-defense**: stays evasive but will defend itself. **DIVE triggers:** No = don't
  dive; **range model = dive if a ship within 20 nm or an aircraft within 30 nm** (*"World War 2 model —
  saw something, dive dive dive"*); dive on periscope/surface-search-radar detection; on ESM detection;
  on threat proximity (the sub's own judgment); or a combination (harder for the game to calculate). Demo:
  under "periscope & surface-search," a sub detecting an aircraft's radar drove deeper; once the contact
  was classified hostile it dived.
- **Outputs / effects:** Submarine depth and whether it engages or evades.
- **Edge cases / quirks:** ESM-detection alone may not trigger a dive on a far contact (the sub may judge
  a distant aircraft *"too far away to matter"*). The **20 nm / 30 nm** numbers are verbatim for the
  range-based option.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Diesel submarine battery-recharge doctrine
- **Models:** When a diesel sub automatically surfaces/snorkels to recharge its battery, and its conflict
  with stealth/dive doctrine.
- **Inputs / parameters:** Recharge-start battery % (cruising); minimum battery % to recharge while under
  attack / on offense; avoid-contact and dive-when-detected settings.
- **Behavior / rules:** While cruising, the sub automatically comes to periscope depth and recharges when
  battery falls to the set percentage. If under attack / on offense it will **not** surface to recharge
  until battery drops to the (lower) second threshold. These compete with avoid-contact and
  dive-when-detected.
- **Outputs / effects:** Submarine depth and battery charge level.
- **Edge cases / quirks:** If a diesel sub keeps detecting threats, **dive-when-detected can prevent it
  from ever surfacing to recharge** — an infinite up-down loop that never actually recharges the battery.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Weapon range setting: kinematic vs practical (torpedoes etc.)
- **Models:** At what range a weapon with a maximum/kill range is actually fired.
- **Inputs / parameters:** Mode **Kinematic range vs Practical range**; weapon max range; weapon
  fuel/energy; target maneuverability.
- **Behavior / rules:** **KINEMATIC** range = fire at the weapon's absolute maximum range. **PRACTICAL**
  range = fire at a closer range giving a higher chance the weapon reaches the target before running out
  of fuel. Large targets (e.g. ships) cannot turn fast enough to evade a torpedo, so practical can
  suffice.
- **Outputs / effects:** Engagement range; probability the weapon reaches/strikes the target.
- **Edge cases / quirks:** In submarine scenarios you usually want **practical-or-closer**: if the sub
  detects targets at ~10 nm but is itself detected at ~5 nm, firing at max range gets the sub killed
  before its weapon arrives.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** High.

### Helicopter dipping-sonar deployment
- **Models:** Automatic vs manual deployment of a helicopter's dipping sonar while hovering.
- **Inputs / parameters:** Hover altitude (**< 200 ft** required); auto-deploy-dipping-sonar setting;
  mission assignment.
- **Behavior / rules:** At a hover **below 200 ft** the helicopter can deploy dipping sonar — manually via
  right-click **ASW > deploy dipping sonar**, or automatically via the doctrine setting. It lowers the
  sonar into the water, listens for a few minutes, then can move and re-dip elsewhere.
- **Outputs / effects:** Sonar in/out of water; localized sonar detections.
- **Edge cases / quirks:** Helicopters generally only auto-dip **when assigned to a mission**; they won't
  necessarily do it automatically otherwise.
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

---

## 11. Nuclear release authority

### Nuclear weapons release authority (doctrine)
- **Models:** Side-level permission to employ nuclear weapons.
- **Inputs / parameters:** Setting **Not granted / Granted** (the top doctrine option).
- **Behavior / rules:** The top doctrine setting gates nuclear weapon use: not-granted vs granted.
- **Outputs / effects:** Whether nuclear weapons may be used.
- **Edge cases / quirks:** Scenario designers can **lock** this so the player cannot change it (like other
  doctrine settings).
- **Source:** `XjfL2uNhGR0`.
- **Confidence:** Med.

---

## 12. Unit proficiency

### Unit proficiency — named scale & the four things it affects (and the two it does NOT)
- **Models:** Crew skill is a deliberately **narrow** modifier — it affects exactly **four** things and
  explicitly does **NOT** affect sensors or weapon accuracy.
- **Inputs / parameters:** An ordered scale **Ace → Veteran → Regular → … → Novice** (*"all the way up to
  Ace … all the way down to Novice,"* with **Regular** as the mid/default). Set at the **side** level
  (Editor → Add/Edit Sides → proficiency) or **per unit** as **"inherited from side"** *or* a specific
  level. *"Clicking this switch only affects units set to inherit the side's proficiency."*
- **Behavior / rules — proficiency affects these FOUR things, and only these:**
  1. **OODA reaction time (detect-ID → first shot).** For an SA-9/2K11 (Strela-10): **Regular = 30 s**,
     **Ace = 24 s**, **Novice = 60 s** from the moment a target is *identified hostile and in range* to
     weapons away (in-game demo confirmed novice ≈ 1:00, ace ≈ 30 s). Faster OODA also means faster
     re-attack and faster target switching. Timing is **per system type × proficiency** — modern
     automated systems are inherently faster regardless of crew.
  2. **Missile evasion (dodging).** A more proficient crew is better at getting out of the way of launched
     weapons, reducing its chance of being hit (*"adjusts his ability to get hit"*). It does **not** change
     weapon accuracy/Pk and does **not** affect detection.
  3. **Minimum flight altitude.** Higher proficiency lets aircraft fly lower: F-4E **novice floor 150 ft**
     vs **ace 80 ft**; the gap is far larger for a B-52. Airframe terrain-following capability also matters
     (the demo F-4E had no low-level nav capability).
  4. **G-force tolerance.** Higher proficiency sustains tighter turns; a low-proficiency fighter is forced
     into a *"wide"* turn and cannot turn inside a higher-proficiency opponent. A G-tolerance bar builds up
     during hard turns; described as a relatively new addition simulating lack of G-suits. Lowering
     altitude changed turn performance in the demo.
- **Behavior / rules — proficiency does NOT affect:**
  - **Detection / sensors** — *"there's no impact whatsoever on detection."* Novice and ace frigates
    detected the same air and sub-surface contacts at the **same ~8 nm** range; tiny variances are
    geometry/rounding, not skill.
  - **Weapon accuracy / Pk** — *"a crew that has a very good shot is exactly the same as a crew that has a
    very bad shot as far as the game is concerned."* Guided weapons still hit high-proficiency units;
    proficiency only helps the **evader**.
- **Outputs / effects:** Time-to-first-shot, re-attack cadence, evasion survivability, low-level ingress
  altitude, and dogfight turn performance.
- **Edge cases / quirks:** Even a perfect crew can't beat the database reaction floor for a system.
  Demo: novice attackers lost more aircraft than ace; weapon expenditure differed because **OODA (not
  accuracy)** changed how many shots defenders got off (a KS-19 fired **408 rounds** at a regular crew vs
  only **8** at a novice). Proficiency's turn/altitude effects shrink for high-performance airframes (a
  MiG-29's raw performance swamps the crew gap). Gun lethality is separate from proficiency (F-86 .50-cal
  Pk 50%, 0.2 dmg vs MiG-15 cannon Pk 65%, 1.0 dmg). Verbatim numbers: Regular 30 s, Ace 24 s, Novice 60
  s; F-4E floors 150 ft / 80 ft; detection ~8 nm.
- **Source:** `NPvpb7s5SNE` (corroborated by `s63NJyONLAE`, `XjfL2uNhGR0`, `AyjnPvsooWw`, `v3aWJ3s1zQM`).
- **Confidence:** High.

---

## 13. OODA / decision-cycle timing

### OODA loop — reaction time (detect → engage) as a per-target timer
- **Models:** The delay between detecting/identifying a hostile and being able to launch. The corpus
  contains **two descriptions** that must be reconciled (see edge cases).
- **Inputs / parameters:** Per-platform OODA cycle from the database; crew quality/proficiency;
  identification requirement (manual vs automatic); **DLZ** (a separate gate).
- **Behavior / rules:** After detecting a contact, a window must elapse before any weapon can fly.
  - **OODA-Loop video model (`s63NJyONLAE`):** a **fixed 15-second observe/orient/decide phase** (*"found
    something, point missiles, decide to shoot, start targeting"*) THEN a separate **targeting time** that
    varies by system/crew — e.g. **classic S-75 ≈ 36 s targeting → ~50 s total**; **modern S-300 PMU ≈
    6 s targeting** (still launches by ~15 s because targeting is largely automated). The 15 s
    decide-window is **per-target and EXPIRES once started**: a target detected early but out of range has
    its 15 s elapse, so the moment it enters range (and the DLZ) the unit fires essentially instantly. You
    do **not** pay the full delay again on a target already being tracked.
  - **Re-acquisition is instant:** if a target ducks behind a mountain you can still engage instantly as
    long as it is re-identified as the **same** contact (the timer doesn't reset).
- **Outputs / effects:** Time-to-first-shot per target; whether re-engagement is instant.
- **Edge cases / quirks:**
  - **RECONCILIATION (primary source supersedes):** the **Unit Proficiency video (`NPvpb7s5SNE`)** states
    the detect-ID→shot interval as a **single per-(system × proficiency) figure** (SA-9: 30 / 24 / 60 s),
    **not** a fixed universal "15 s + variable targeting" split. **Model it as one proficiency-scaled
    reaction time per system; do not hard-code a universal 15 s phase.** Treat the 15 s / 6 s / 36 s
    figures as the OODA-Loop tutorial's per-system illustration.
  - **Separate from DLZ** — a shot can be delayed purely because the weapon isn't in its dynamic launch
    zone, not by OODA. ("Why won't my weapons fire?" shows the delay as a countdown — "36 seconds," up to
    **"282 seconds"** for a WWII-vintage CIC.)
  - **Applies to ALL weapons** (e.g. an F-14 engaging incoming missiles still pays the act time). On
    offense you are *"immune"* for the duration of the shooter's reaction window after first detection.
- **Source:** `s63NJyONLAE` (the two-phase model); reconciled by `NPvpb7s5SNE` (single proficiency-scaled
  figure); `hCDLw5AZk0E` (countdown display).
- **Confidence:** High.

---

## 14. Targeting priority & autonomous target selection

### Default auto-attack target selection = closest engageable target
- **Models:** A unit on a manual or automatic attack picks whatever valid target is physically closest,
  not the most valuable.
- **Inputs / parameters:** Set of targets it has weapons for; range to each; attack-run geometry/approach
  direction; loadout (weapons available for a given target type).
- **Behavior / rules:** On a **manual attack (F1 + click)** or an automatic attack, the unit selects the
  **closest object it can attack that it has the weapons for**, and releases on it during the pass.
  Example: bombers ran the runway and dropped on "runway axis point #2" simply because it was closest,
  ignoring hangars. **This selection IGNORES any configured targeting-priority list.**
- **Outputs / effects:** Which target actually gets hit; ordnance is expended on the nearest valid target
  along the run.
- **Edge cases / quirks:** **Approach direction matters** — to hit a specific desired target you must
  line the run up so that target is the closest one on the pass; coming from a different side makes a
  different object closest and it gets hit instead. Old-tech bombs from high altitude (e.g. 12,000 ft,
  1965 tech) frequently miss regardless of correct targeting.
- **Source:** `v3aWJ3s1zQM`.
- **Confidence:** High.

### Targeting Priority lists (a Doctrine/ROE component)
- **Models:** Operator-defined ordered preference for which target types a unit/group/mission/side should
  attack first **when choosing autonomously**.
- **Inputs / parameters:** A **Targeting Priority** doctrine record (scopable: global / side / mission /
  group / unit — same scoping as WRA). Priority entries, each = a target type/subtype (e.g.
  facility>supply>surface facility; building>surface>control tower; tarmac space; hangar/surface building;
  aircraft subtype e.g. attack aircraft), optionally **restricted to targets present in the mission**;
  ordered top-to-bottom; an **engagement-timing** field per entry (default **Immediate**).
- **Behavior / rules:** Create a priority list, then "add item" rows. **Ordering is strict: top items are
  engaged first, lower items are lower priority.** An entry with all fields set to **"any/any/any"**
  becomes the **LAST (catch-all lowest)** priority — placing it above specific items pushes those
  specifics to fire AFTER any-target, so manage order/specificity deliberately. A unit acting
  autonomously (no manual/auto order) chooses targets per this list. Demonstrated: an SA-2 told to
  prioritize "attack aircraft" engaged the A-6 Intruder before the F-4 Phantom flying alongside.
- **Outputs / effects:** Determines which target types autonomous units prefer; pairs naturally with WRA
  (e.g. SAMs preferring a specific aircraft subtype).
- **Edge cases / quirks:** Honored **only when the unit decides on its own** — manual/automatic attacks
  ignore it. An "any/any/any" row anywhere is always lowest priority. Restricting to "available in this
  mission" simplifies setup.
- **Source:** `v3aWJ3s1zQM`.
- **Confidence:** High.

### Manual/automatic player-ordered attack overrides targeting priority
- **Models:** Directly ordering an attack bypasses the unit's configured priority doctrine.
- **Inputs / parameters:** Order type (manual attack via F1, automatic attack) vs autonomous engagement;
  existing targeting-priority list; closest-engageable-target logic.
- **Behavior / rules:** Whenever you issue a **manual** OR an **automatic** attack against a target/area,
  you **override** the unit's targeting-priority doctrine. Even with a priority list installed, the unit
  reverts to attacking the **object closest to it that it has weapons for** during that ordered attack.
  The priority list is therefore effective **only** where units must decide on their own (a patrol/mission
  with no specific manual order, or a SAM defending autonomously).
- **Outputs / effects:** The priority list is ignored for that engagement; the nearest valid target is
  struck instead.
- **Edge cases / quirks:** The presenter repeatedly ordered a strike expecting a specific target to be
  hit, but the access point/tarmac was hit because the manual order re-engaged the closest target. Best
  use of priority lists is explicitly **autonomous-decision** situations, not ordered attacks.
- **Source:** `v3aWJ3s1zQM`.
- **Confidence:** High.

### Multi-unit target deconfliction under priority doctrine
- **Models:** Within a group/mission, units avoid piling multiple shooters onto the same target.
- **Inputs / parameters:** Targets already selected/engaged by other units in the group; in-flight weapons
  already committed to a target; each unit's priority list.
- **Behavior / rules:** Units sharing a mission/priority doctrine spread out across the assigned priority
  targets rather than all hitting one: *"the reason more than one person did not drop a bomb on the same
  target is because they're not supposed to."* If a target already has bombs on the way, other units are
  *"smart enough"* to recognize this and pick a different target. A unit out front that has already
  selected a target frees the others to attack whatever they prioritize next.
- **Outputs / effects:** Distributes shooters across multiple priority targets; reduces overkill/wasted
  ordnance on an already-committed target.
- **Edge cases / quirks:** Not perfectly efficient — the presenter notes repeated re-prioritizing of one
  stubborn building and imperfect coordination, but cross-targeting of the same object is generally
  avoided by design.
- **Source:** `v3aWJ3s1zQM`.
- **Confidence:** Med.

### Salvo concentration vs distribution across a group
- **Models:** Whether a group of bombers concentrates all fire on one target or spreads across many,
  governed by group size, weapons-per-salvo, and shooters-per-salvo.
- **Inputs / parameters:** Group/section size; weapons-per-salvo; shooters-per-salvo (1 unit vs
  fire-enough); target hit points; whether the target is marked destroyed.
- **Behavior / rules:** Default WRA + "fire as many as needed to meet salvo" makes bombers all attack the
  **same** target (until it is marked destroyed). **Tight groups concentrate; loose/smaller sections
  spread** to individual targets. Setting shooters to **1 unit each** + a round count matched to target
  durability makes each aircraft attack a **separate** target, all launching simultaneously and delivering
  exactly the needed number of bombs. After a target is hit but **not yet flagged destroyed**, follow-on
  aircraft re-attack the same (already-damaged) target — wasteful; manually mark/skip damaged targets.
- **Outputs / effects:** Distribution of fire across targets; overkill vs spread; group losses.
- **Edge cases / quirks:** **Section size is a deliberate lever**: single-aircraft sections vs the same
  hangar = attacked **12 times**; sections = **6 times**. Large simultaneous groups are preferred so
  losses aren't strung out. A **formation editor** lets you place each aircraft (e.g. trail formation).
- **Source:** `YepPcVyCtnA`.
- **Confidence:** High.

### One-bomb-per-target spread attack (cluster effect)
- **Models:** Forcing a single munition per target so one platform damages many targets in one pass.
- **Inputs / parameters:** Weapons-per-salvo = **1** (one bomb per target); aircraft drop rate; available
  stores (e.g. a **B-52 with 45 JDAMs**).
- **Behavior / rules:** Setting one bomb per target makes a heavy bomber drop a single bomb on each target
  across its pass, then loop and repeat, damaging many individual targets with one aircraft. Works
  especially well with cluster bomb units.
- **Outputs / effects:** Many lightly-damaged targets per pass instead of one destroyed target.
- **Edge cases / quirks:** The aircraft cannot release fast enough to hit 100% of targets in one pass, so
  it comes around for additional passes.
- **Source:** `YepPcVyCtnA`.
- **Confidence:** Med.

---

## 15. No-Escape-Zone (NEZ) launch logic

### No Escape Zone (NEZ) launch mode
- **Models:** Holding fire on an approaching air target until it is too close/slow to out-run the SAM,
  instead of firing at max range.
- **Inputs / parameters:** WRA per-weapon setting toggled to **"No Escape Zone"** (per missile type);
  target speed & heading (closing geometry); target max speed / maneuverability (kinematic escape
  envelope); weapon range; illumination/fire-control availability.
- **Behavior / rules:** When set to NEZ, the shooter will **not** fire at long range even when the target
  is well within weapon range. It withholds the shot and lets the target close until the target reaches a
  point where it **can no longer turn around and run away at maximum speed and escape the missile** (its
  no-escape / kill zone). Only then does it launch. (The narrator limits a long-range SA-21 to NEZ-only so
  it doesn't *"take pop shots"* at extreme range.) **Shot timing depends on the target's own escape
  kinematics, not just range.**
- **Outputs / effects:** Delays launch until the target enters the no-escape envelope; greatly improves
  Pk for that shot; avoids wasting a missile on a target that could turn and burn away.
- **Edge cases / quirks:** A fast/maneuverable target (**MiG-31, 450 kt**) is engaged much later
  (sometimes never if it overflies and opens range) than a slow non-maneuverable one. Two targets at
  **identical ground speed** are still engaged at different times because their max-speed escape envelopes
  differ. Launch also still requires sufficient **illumination/fire-control**; lack of illumination can
  force the operator to *"nudge"* (re-order) a shot. Without NEZ the same weapon fires at extreme range
  and may need multiple hits / get spoofed.
- **Source:** `7DIqKLoe3p4` (corroborated by `0_DVQq8fIUQ`, range options in `5E-Kl2lq18k`).
- **Confidence:** High.

### Classification drives the NEZ firing sequence
- **Models:** Knowing exactly what type of platform a contact is lets the SAM compute that target's true
  max-speed escape envelope and time the shot correctly.
- **Inputs / parameters:** Contact classification / awareness level (type known vs only "bogey"/unknown);
  side-ID settings; per-target max speed implied by its type.
- **Behavior / rules:** When the firing side actually knows the target type, the NEZ logic **automatically
  changes its firing sequence** so it engages each target at the moment that specific target can no longer
  turn and run at max speed. Because a 737 and a MiG-31 have very different max speeds, knowing the type
  lets the system engage the slower one (737) essentially immediately/first and hold fire on the faster
  one (MiG-31) until much later. If contacts are only **bogeys**, the system cannot do this correctly.
  Conclusion: classification is *"more important than ever"* for NEZ shots.
- **Outputs / effects:** Per-target launch timing; engagement ordering between multiple simultaneous
  targets; whether a shot is taken at all.
- **Edge cases / quirks:** With two unidentified bogies at equal speed the operator could not tell them
  apart and had to wait. **Tactical inverse:** if *you* get identified as a high-capability platform,
  enemies on NEZ doctrine become **LESS** likely to fire on you (they wait for an envelope they may never
  get).
- **Source:** `7DIqKLoe3p4`.
- **Confidence:** High.

### NEZ vs 75%/max-range tradeoffs (by altitude & weapon class)
- **Models:** When to prefer NEZ vs a percentage-of-max-range shot, as a function of altitude and weapon
  energy.
- **Inputs / parameters:** Weapon class/energy (e.g. very-long-range high-energy SAM such as an S-400
  40N6); target altitude (high vs low); target awareness (fog / no warning vs aware); observed Pk at the
  chosen range.
- **Behavior / rules:**
  - **Very-long-range high-energy SAMs:** **75% of max is fine**; NEZ *"waits too long,"* 100%/max
    *"wastes missiles."* 75% gave slightly **lower** Pk than NEZ at the closer point in one run (**≈59–60%
    at 75% vs ≈68% NEZ** for a high-altitude bomber) but far more standoff and earlier kills.
  - **High-altitude air-to-air:** a 75% shot is largely *"a freebie / waste of missiles"*; real kills
    happen once both close into NEZ — *"whoever runs out of missiles first loses."*
  - **Low altitude:** the 75% bonus **evaporates** — missiles fired high then re-entering thick low air
    **stall and are wasted**; **50% (or NEZ) is safer** low. In **fog / no warning**, a 75% shot can still
    work because the target can't see/dodge the incoming missile.
- **Outputs / effects:** Trades standoff distance for guaranteed-hit geometry; sets the actual launch
  range dynamically.
- **Edge cases / quirks:** NEZ requires identification to be meaningful (*"makes classification more
  important than ever"*). Forgetting to set NEZ reverts to the target-type's normal range row.
- **Source:** `qHuId62Lba8` (corroborated by `7DIqKLoe3p4`, `0_DVQq8fIUQ`).
- **Confidence:** High.

---

## 16. Collective responsibility & escalation

### Collective Responsibility (side-wide hostility propagation)
- **Models:** Whether an attack on one unit of a side makes the **entire** side hostile to the attacker.
- **Inputs / parameters:** Scenario-editor per-side **Collective Responsibility** toggle (on/off); the act
  of declaring/attacking a single unit of that side as hostile; side allegiance.
- **Behavior / rules:** **OFF:** attacking/destroying one unit does **not** turn the rest of that side
  hostile — other sites stay neutral and you can *"pick off one at a time."* **ON:** the moment you
  declare a single unit of that side hostile (or attack it), the **entire side immediately turns
  hostile/red.** Set independently per side.
- **Outputs / effects:** Whether hostility cascades to the whole side after one engagement; controls
  red/neutral status of all sibling units.
- **Edge cases / quirks:** **Recommended OFF for civilian sides** (so an accidental hit doesn't make all
  civilians declare war) and for **neutral observers** (e.g. a NATO-exercise side that is targetable but
  shouldn't go to war over a stray miss). Even with it ON and the side turned hostile, units still won't
  necessarily shoot the attacker until they actually **identify who fired** (see next rule).
- **Source:** `BB6pZ3agGFs`.
- **Confidence:** High.

### Identification required before engaging the actual shooter
- **Models:** A side that knows it has been attacked still won't fire on a specific contact until it
  identifies that contact as the hostile that did it.
- **Inputs / parameters:** Knowledge that an attack occurred; identification/classification state of the
  suspected attacker; available sensors (e.g. a watchtower with a good LLTV camera) to ID the contact.
- **Behavior / rules:** Even after Collective Responsibility flips the whole side hostile, individual SAM
  sites will **not** *"go hard"* on a particular aircraft until it is **identified** as being on the
  attacker's side. They know they were attacked but not necessarily which contact fired. Once a sensor (an
  added watchtower with **3rd-gen LLTV**) identifies the contact as hostile, **every** SAM site in the
  group begins lighting it up and engaging.
- **Outputs / effects:** Gates whether units actually launch at a given contact; identification turns a
  passive "we were attacked" state into active engagement of that specific target.
- **Edge cases / quirks:** Adding/upgrading a sensor that achieves identification is what unlocks
  engagement. Until ID, the attacker can be over the target unmolested despite side-wide hostility.
- **Source:** `BB6pZ3agGFs`.
- **Confidence:** High.

### Engage inbound guided weapons before the delivery platform
- **Models:** When defending, a unit prioritizes shooting down the incoming guided weapons over the
  aircraft that launched them.
- **Inputs / parameters:** Presence of in-flight guided weapons inbound vs the launching aircraft; each
  defender's engagement geometry/timing.
- **Behavior / rules:** When a side engages an attacker that has already released ordnance, the **first
  priority is to shoot down the incoming guided weapons** rather than the delivering aircraft.
  Demonstrated as radars popping on **one at a time**, with the stated first priority being to kill the
  guided weapons in flight; some units still also fire at the aircraft.
- **Outputs / effects:** Defensive fires are allocated to inbound munitions first; the launching aircraft
  is a secondary target.
- **Edge cases / quirks:** Time-critical — a defender *"will never hit this in time"* if the weapon is
  already too close. Multiple radars activate **sequentially**, not all at once.
- **Source:** `BB6pZ3agGFs`.
- **Confidence:** Med.

---

## 17. Implementation traps to encode in the adjudicator

These are the highest-leverage gotchas for `server/ai/adjudicator-schema.js`, distilled from the rules
above:

1. **WRA permission ≠ will-fire.** **Ground units** also need **"engage opportunity targets"** to engage
   untasked targets; **air units take opportunity targets by default** (opposite defaults).
2. **Self-defense only triggers when the unit knows it is the victim** (a weapon tracking *it*, or an
   enemy **FCR lock** for aircraft), and defends the *incoming weapon* — never counter-attacking the
   *shooter platform* — unless you raise an automatic-firing-range bubble. Even **Weapons Hold** retains
   weapon-vs-incoming self-defense.
3. **Player-ordered/manual attacks override targeting priority AND ignore the automatic-firing range**
   (fire at max distance, pick the nearest valid target along the run).
4. **Proficiency-scaled reaction (OODA) delay gates every auto shot** and is cached per tracked contact
   (re-acquisition / in-range entry is instant). **Proficiency does NOT affect detection or Pk** — only
   reaction time, evasion, min-altitude, and G-tolerance. Model the reaction as **one per-(system ×
   proficiency) figure**, not a universal 15 s phase.
5. **Classification gates NEZ** and decides which WRA row / control-state applies; **ROE is keyed per air
   / surface / sub-surface** environment (land == surface).
6. **Doctrine resolves most-specific-wins (unit → mission → side)** unless the side's **force-override**
   flag is set; **mission assignment can re-default doctrine** (e.g. Sea Control turns radar on / ignores
   plotted course). A global edit needs the **apply/propagate** button to stick.
7. **Salvo size must satisfy BOTH Pk and target damage-points**; **inherited missile-defense-value** rows
   wildly over-commit against undefended fixed targets — size to real damage needed. Compute combined Pk
   with the **geometric `1−(1−p)^n`** formula (35% → 58% / 72%), not the ×1.5 heuristic.
8. **Salvo size is hard-capped by fire-control channels** (SA-2 = 3; a ship guided only 6 at once),
   regardless of WRA desire.
9. **Collective responsibility** controls side-wide hostility escalation, but firing still needs the
   attacker to be **identified**; defenders shoot **inbound guided weapons first**, then the platform.
10. **Weapon-state RTB (Winchester/Shotgun/one-engagement/percentage) interacts with WRA** — a single
    "engagement" = one salvo, so a one-engagement unit fires only the salvo size even with magazines full.

---

## 18. Cross-video notes & reconciliations

- **No hard contradictions** across the transcripts; they cross-reference each other (the reaction delay
  reappears in "Why won't my weapons fire?").
- **OODA timing (reconciled):** the OODA-Loop walkthrough's *"≈15 s decide + separate 6 s / 36 s
  targeting"* two-timer model is a per-system illustration; the **primary Unit Proficiency video** states
  one **per-(system × proficiency)** reaction time (SA-9: 30 / 24 / 60 s). **Implement a single
  proficiency-scaled reaction time per system.**
- **Salvo math (reconciled):** the Salvo-Sizes video's **×1.5 heuristic** ("45% → 52.5%") is superseded by
  the **geometric `1−(1−p)^n`** calculator used in the primary WRA / WRA↔Doctrine videos ("35% → 58% / 72%").
- **Numbers are unit-specific:** 30/24/60 s reaction times; 6 s vs tens-of-seconds vs **282 s** targeting;
  Pk values (30%/35%/80%/95%/65%/50%); damage points (R-60M 1.2, Backfire 20, hangar 600, FAB-500 319,
  ammo revetment 300, Kh-31 140); missile-defense values (Hawk 11, hangar 4, search radar 1); channel
  counts (SA-2 = 3); altitude floors (F-4E 150/80 ft); detection ~8 nm — **all per-database-entry
  illustrations, not constants.**
