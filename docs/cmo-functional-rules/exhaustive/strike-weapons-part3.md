# Strike & Weapons — Part 3/3

> **Scope.** This is Part 3 of a 3-part exhaustive spec for the **Strike & Weapons** bucket. It covers the
> mechanics enumerated in this part's source set only: layered/de-conflicted strike scheduling and attack-method
> options, air-to-ground strafing, target hardness & repairability, autonomous anti-ground patrol missions with
> prioritized target lists, ad-hoc unassign/re-assign, stochastic outcomes & save discipline, unguided iron & cluster
> bomb effectiveness, wind/weather degradation, ship hit-pattern lethality (bracketing vs speckling), laser-guided
> (LGB) and INS-guided weapons, bunker hardness/penetration/reliability/accuracy, standoff PGMs (AGM-130),
> air-to-ground rockets (rate-of-fire, altitude/accuracy, caliber-vs-hardness, guided rockets), anti-satellite (ASAT)
> intercepts, and the full **naval mine** lifecycle (depth gating, zone vs line laying, arming delay, detonation
> geometry, damage scaling, mine taxonomy, detectability, sweeping/clearing, safe-path discovery, and lane sizing).
> Sibling parts (1/3 and 2/3) cover the remaining Strike & Weapons mechanics.
>
> **Exhaustive.** Every distinct mechanic in this part's rule set is captured. Near-identical mechanics have been
> merged (richest description retained, all source video IDs cited).
>
> **⚠️ Auto-generated-caption caveat.** These rules were synthesized from automatically generated video captions.
> Transcription errors are possible in proper nouns, designations, and especially numbers. All stated numbers are
> reproduced **verbatim** from the source captions; treat them as the captions' claims, not independently verified
> CMO ground truth. Nothing here is invented — where the captions are silent, the spec says so.

---

## 1. Strike Planning & Mission Coordination

### Backup / Staggered Strike Timing
- **Models:** Scheduling a follow-up ("backup") strike to arrive a couple of minutes after the primary so anything that survived the first pass gets finished — without the two waves overlapping.
- **Inputs / parameters:** Per-mission time-on-target (TOT) offsets (primary 10:00, backup 10:02, tarmac 10:05, hangars 10:06, area-bombing bombers 09:58); flight sizes; mission duplication.
- **Behavior / rules:** Duplicate a mission and edit the copies into per-target strikes plus a single "backup" strike that targets everything. Offset the TOTs so waves don't arrive simultaneously — overlapping waves "bomb each other" on overfly, which is dangerous. Recommended sequence: bombers / AAA-suppression first (here 09:58, the earliest, because they can't be shot at through cloud), then flak-suppression LGBs, then the rocket tarmac strike (10:05), then the hangar strike (10:06, ~1 min after the tarmac since the hangar strikers are "about that accurate"), with a 2-minute backup to mop up survivors.
- **Outputs / effects:** A de-conflicted, layered strike where suppression precedes the main force and a backup wave catches survivors.
- **Edge cases / quirks:** Arriving at the exact same time is "sloppy" and risks fratricide on overflight. Duplicating missions lets you name/scope each copy to one target (e.g. `aa37`, `mobile38`, `none36`).
- **Source:** ZD0z_nWLSp4
- **Confidence:** High

### Attack Method: Independent Aim vs Coordinated, and Single-Axis vs Multi-Axis
- **Models:** Mission attack-method settings that control whether aircraft spread their aimpoints simultaneously, and whether they ingress from one direction or several.
- **Inputs / parameters:** Attack method = "independent attack/aim" (spread attacks across targets at once) vs coordinated/sequential (one target at a time); axis = single-axis (all from the same direction) vs multi-axis (from multiple directions, the "safe" option); flight sizes.
- **Behavior / rules:** Independent attack causes the flight to split apart, rejoin, and "all attack at the same time," hitting different targets simultaneously rather than queuing on one target. Axis choice: multi-axis spreads ingress directions (safer vs defenses); single-axis brings everyone in from the same direction (chosen here for the rocket strike). Combined — e.g. flights of 3 doing single-axis independent attack — the flight splits and saturates all aimpoints at once.
- **Outputs / effects:** Determines the temporal/spatial pattern of the attack: simultaneous multi-target saturation vs sequential single-target focus; concentrated vs dispersed ingress.
- **Edge cases / quirks:** Multi-axis is described as "usually the safe option" (spreads the defender's shots). Independent aim is preferred when you want bombs spread across many aimpoints rather than piling onto one target.
- **Source:** ZD0z_nWLSp4
- **Confidence:** High

### Air-to-Ground Strafing Toggle
- **Models:** A mission flag permitting gun strafing of ground targets — realistic only with surprise / suppressed defenses, otherwise suicidal.
- **Inputs / parameters:** "Air to ground strafing" on/off; state of enemy defenses (flak suppressed or not).
- **Behavior / rules:** Enabling air-to-ground strafing lets mission aircraft make gun passes on ground targets. The presenter enables it only because he knows the flak will already be destroyed; he notes that in reality you "basically can't do air-to-ground strafing unless you are so lucky you get maximum surprise." Not recommended for bombers.
- **Outputs / effects:** Aircraft may add strafing gun passes to their attack repertoire.
- **Edge cases / quirks:** Without suppressed defenses, strafing exposes aircraft to lethal short-range fire. Explicitly NOT used with bombers.
- **Source:** ZD0z_nWLSp4
- **Confidence:** Med

### Autonomous Anti-Ground Patrol Mission with Prioritized Target List
- **Models:** A standing ground-attack patrol over an area autonomously selects and strikes targets according to an operator-ordered priority list — high autonomy, low operator control over exact aimpoints. Replaces building many individual strike missions.
- **Inputs / parameters:**
  - Patrol type: **AsuW Ground Patrol** / **Patrol → Anti-Ground (AGSA)** (chosen so aircraft don't waste shots on irrelevant contacts such as fishing vessels / enemy aircraft).
  - Patrol area: a Zone/reference area drawn via **Define Area Rectangle** (Ctrl+Right-click) or with reference points (**Ctrl+Insert**, left-click to add vertices).
  - Flight size / cells (e.g. flights of 2; or cells/squads of 3, F-15 Strike Eagles).
  - **Targeting-priority list** (Targeting Priority → Create → Add Item): an ordered list of target types / facility subtypes; the editor's "lock to available units in scenario" / "mission objects only" scoping checkbox affects which subtypes appear in the picker.
  - Altitudes: custom transit/station/attack (e.g. station & attack 6,900 ft — just under the 7,000 ft cloud — to stay below cloud for line-of-sight and minimize time in the danger zone).
  - Throttle (military power on-station so aircraft aren't loitering slowly / "teeing").
  - **1/3 rule** on/off.
  - **RTB / weapon-state trigger** = "mission specific weapons expended."
  - Targets-of-opportunity allowed (yes/no); explicit takeoff time; enforce-flight-size toggle.
- **Behavior / rules:** Draw the area, create the patrol, then build the ordered targeting-priority list of target/facility subtypes. Aircraft expend ordnance on the **highest-priority class first**, then the next, then free-engage anything else; the patrol re-tasks itself continuously and was observed to "perfectly prioritize" the desired targets. Worked priority orders from the sources:
  - (1) AAA, (2) open structures / tarmac, (3) hangars, then everyone else.
  - Largest aircraft hangars first → next-largest surviving hangars → ammo bunkers → AV-gas → "any open structure" (= anything on the surface) → everything else last. (Demo: jets hit the "4× large aircraft hangar" first, then automatically shifted to the second-largest surviving hangars.)
  Aircraft keep attacking until the weapon-state trigger ("mission specific weapons expended") fires, then RTB; with targets-of-opportunity ON they also hit incidental targets. Turning OFF the 1/3 rule launches all assigned aircraft at once for a single massed quick attack. Setup takes ~3 minutes vs building many individual strike groups, and it is ammo-efficient (no wasted rounds).
- **Outputs / effects:** Continuous autonomous strikes that walk down the priority list, far less setup than per-target missions (but you can't dictate exactly what dies when); aircraft RTB on weapon-state; losses/expenditures logged.
- **Edge cases / quirks:**
  - The **1/3 rule** keeps 1/3 of aircraft on station at all times (more time between strikes); turn it OFF to mass all aircraft in one quick attack.
  - Items with **no assigned priority** (e.g. AV-gas tanks) are effectively deprioritized — and CMO does not simulate air-base fuel supplies anyway, so AV-gas was intentionally ranked below ammo bunkers.
  - **Detectability gates engagement:** surface/open-structure targets only get engaged if detectable ("great if you can see something … a lot of times you just don't").
  - Choosing AsuW-ground / anti-ground type prevents wasting shots on non-ground contacts.
  - Working inside the scenario editor lets you scope the target-type picker to only this mission's objects (the "lock to available units" / "mission objects only" checkbox).
  - Targeting-priority subtypes include facility classes such as AAA, structure-open, hangar, taxiway/access points, and **runway** — runway is deliberately AVOIDED (see Target Hardness & Repairability).
- **Source:** mNyASjG5-iM, agWi0pAUrTM
- **Confidence:** High

### Ad-hoc Unassign / Re-assign for One-off Attacks During a Mission
- **Models:** Momentarily pulling a unit off its mission, hand-flying a single attack, then returning it to the mission — without rebuilding anything.
- **Inputs / parameters:** A unit on a mission; **U** to unassign; **F1** + target for the ad-hoc attack; manual altitude/throttle (set 5,000 ft, afterburner); **right-click → assign to mission** to return it.
- **Behavior / rules:** Pause, click the unit, press **U** to unassign, press **F1** and click the desired target; the unit goes "engaged defensive," lines up, and attacks (and will come back for a second pass if it still has ammo). When done, right-click the unit and assign it back to the mission ("look for targets") and it resumes automatic patrol behavior.
- **Outputs / effects:** A targeted one-off strike (e.g. confirming a stubborn AAA is killed) layered on top of the autonomous patrol, with the unit cleanly returned to mission control afterward.
- **Edge cases / quirks:** Pointing the ad-hoc attack straight at AAA risks battle damage (the unit took a hit / kept "smoking from a 130 mm round"). Useful when the autonomous patrol won't prioritize a specific surviving threat you want gone now.
- **Source:** mNyASjG5-iM
- **Confidence:** High

### Stochastic Outcomes & Save Discipline
- **Models:** Combat resolution is stochastic (randomized), so identical setups can yield different results; frequent saving guards against bad rolls and setup mistakes.
- **Inputs / parameters:** RNG in engagement resolution; save/load; mission-setup completeness.
- **Behavior / rules:** Outcomes vary run-to-run ("stochastic … sometimes things won't work out exactly the same"). The presenter re-ran the F-16 strike multiple times with different results (one run lost zero F-16s and did real damage; another lost half). He repeatedly saves before launching missions because there's a high chance of having missed a setting (time-on-target, mission split, add-mission).
- **Outputs / effects:** Variance in losses/damage across identical scenarios; saving enables retry.
- **Edge cases / quirks:** Acknowledged beta bugs cause occasional errors/freezes/mislaunches. A J-15 was lost not to combat but to running out of fuel because a unit didn't RTB when low — fuel-state/RTB logic matters as much as combat.
- **Source:** mNyASjG5-iM
- **Confidence:** Med

---

## 2. Target Hardness, BDA & Repairability

### Target Hardness & Repairability — Runways vs Aircraft vs Structures
- **Models:** Different airbase targets have different durability and recovery rates; killing aircraft is often the most durable way to neutralize a base.
- **Inputs / parameters:** Target subtype (runway, tarmac/hardstand, hangar, control tower, AAA, vehicles, parked aircraft, AV-gas tank); weapon hardness vs target; repeated hits.
- **Behavior / rules:** Runways can be repaired "very very quickly" (fast-setting concrete), so cratering them is low-value. Parked aircraft, once destroyed, don't come back fast, so destroying the airplanes "is often the simplest way to put the base out of commission even though the runway looks fine." Some targets soak multiple hits — hangars took solid LGB hits without dying on the first pass; a target "somehow keeps surviving" 500-pounders, prompting extra bombs. **BDA discipline:** check whether the target is destroyed before expending more ("I don't have to waste any munitions because I checked").
- **Outputs / effects:** Damage/destruction tracked per target; some require re-attack; expenditure is conserved by re-checking BDA between passes.
- **Edge cases / quirks:** 500 kg / 500 lb bombs are "pretty big" yet sometimes insufficient for a single structure. The AV-gas tank is flagged as a high-value / priority target. The best place to kill a plane is on the ground. (See also the autonomous patrol rule, where runways are deliberately left off the priority list for exactly this reason.)
- **Source:** 1PuSQh4Co3c
- **Confidence:** Med

---

## 3. Unguided Bombs (Iron & Cluster) and Environmental Degradation

### Iron (Unguided HE) Bomb Effectiveness vs Target Hardness/Mobility
- **Models:** Unguided high-explosive bombs are good against large stationary hard targets, poor against mobile/armored units that need direct hits.
- **Inputs / parameters:** Bomb type (iron/HE unguided), warhead size, target type (armor / soft / infantry / hard structure / ship), required hit proximity (direct hit vs near-miss), terrain quality, release altitude, crew/pilot skill (set to "Ace"), guidance (none for iron bombs).
- **Behavior / rules:** Aircraft line up and release. Damage scales with how stationary and physically hard the target is:
  1. **Armored units (T-72s):** essentially NO damage from unguided iron bombs unless a much more direct hit lands — a near miss does nothing.
  2. **Soft trucks:** only need to land "in the neighborhood" to destroy.
  3. **Infantry:** any close hit wipes them out.
  4. **Hard stationary targets (bridge):** iron bomb "blown away," i.e. very effective.
  5. **Underground bunker:** iron bomb scratched it for ~1.2–2% damage.
  Stated progression: "as the target gets progressively harder and more stationary, it does a substantially larger quantity of damage." Iron bombs are described as the better choice vs "very very hard physical targets."
- **Outputs / effects:** Target damage %; armor unaffected on near miss; soft/infantry destroyed; hard stationary targets heavily damaged or destroyed.
- **Edge cases / quirks:** Laser-guided bombs are "a very different story" (far more effective). The demo deliberately used barren terrain — the narrator warns sketchier terrain (e.g. jungle) has "a dramatic impact in basically degrading the quality of the weapon." Armor needs a direct hit; trucks/infantry forgive near misses.
- **Source:** XZ1EdSDI0mE
- **Confidence:** High

### Cluster Bomb Area-Effect Coverage and Target Suitability
- **Models:** Cluster bombs spread submunitions over a wider area: great vs vehicles / soft / lightly-armored targets and grouped units, poor vs hardened structures.
- **Inputs / parameters:** Cluster bomb type (e.g. 250 kg cluster, CBU-103, armor-piercing cluster), spread/coverage area, target type (armor / soft / hard structure / ship), target grouping/clustering, terrain, wind.
- **Behavior / rules:** Cluster bombs "covered a wider area" than iron bombs.
  - **Vs armor (T-72):** "significantly greater amount of damage" than the iron bomb.
  - **Vs trucks/infantry:** effective (wide reach, especially if targets are clustered together and you attack one).
  - **Vs hard targets (bridge):** "barely scratched" / "not nearly as effective against this hardened target."
  - **Vs underground bunker:** "nothing happened" (maybe knocked off an antenna).
  - **Summary:** "anything that's a vehicle, there's a cluster bomb for it," but cluster is weak against hard targets.
  - **Vs lightly-armored carrier:** the cluster "speckled the deck," creating "a million little holes" — low per-hit damage but enough cumulatively to sink it.
- **Outputs / effects:** Wide-area damage; high effectiveness vs soft/vehicle/grouped targets; minimal effect vs hardened structures and well-armored ships.
- **Edge cases / quirks:** Cluster bombs are "notorious for getting carried by the wind" — high wind degrades them, yet a T-72 was still dented in awful wind. Against well-armored ships (e.g. Iowa-class), cluster bombs "wouldn't be able to damage it" — only knock antennas off, no armor penetration. Many cluster dispensers (CBU-103) are INS weapons (see *INS-Guided Dispensers*) and cannot hit moving targets, and "can't be directly used against ships."
- **Source:** XZ1EdSDI0mE
- **Confidence:** High

### Wind / Weather Degrades Unguided Weapon Accuracy ("Entropy")
- **Models:** Wind introduces dispersion error for weapons without wind correction or guidance.
- **Inputs / parameters:** Wind speed (set via the weather panel, e.g. "Sea State 4" / strong wind); weapon guidance type (unguided iron/cluster have no wind correction); presence of wind-corrected munitions (WCMD).
- **Behavior / rules:** The narrator "cranks up the wind" to add "entropy … lack of accuracy." With strong wind on unguided weapons (no wind correction, no laser guidance, not WCMD): iron bombs vs armor did NO damage at all (the near-miss spread widened and missed); cluster bombs got carried by wind but still scored some hits on the T-72; soft/large/stationary targets still got hit. Wind degrades dispersion but big stationary targets remain hittable.
- **Outputs / effects:** Wider impact dispersion; reduced hit probability for unguided weapons; armor effectively immune to displaced near-misses.
- **Edge cases / quirks:** Only affects weapons without wind correction/guidance. WCMD (wind-corrected munitions dispenser) would resist this. Effect is qualitative — no numeric wind-to-CEP formula is stated.
- **Source:** XZ1EdSDI0mE
- **Confidence:** Med

### Bracketing vs Speckling — Hit-Pattern Effect on Ships
- **Models:** How a weapon distributes its impacts on/around a ship determines lethality; lightly-armored ships are durable like buildings.
- **Inputs / parameters:** Weapon spread pattern (cluster = speckle many small holes; iron/LGB = discrete direct hits); number of direct vs near hits ("bracket" = hitting around the target, but also hitting the ship with more than one); ship armor level; ship damage states (fire, flooding).
- **Behavior / rules:** Ships are "very similar to buildings … very durable," so "when you hit them with a lot of little things, overall your effect is going to be different than if you try to hit it with a big thing." Cluster on a carrier "speckled the deck … creating a million little holes" — a relatively low damage number, but unrecoverable (fire + flooding sink it). Iron bombs "bracketed" the ship (mostly near-misses) so did less. Even **4× 250 kg cluster bombs** sank an aircraft carrier. **4 direct non-bracketed LGB hits** still did LESS total damage to the carrier than the armor-piercing cluster bomb (carrier left at **8.4%** damage from the LGBs).
- **Outputs / effects:** Ship damage %, fire and flooding states; flooding can extinguish fire but the ship still sinks; sinking occurs when damage is unrecoverable.
- **Edge cases / quirks:** "The flood will put the fire out" but the ship still sinks. Lightly-armored ships (carriers) are vulnerable to cluster; heavily-armored ships (Iowa) are not (no penetration). Parallax in the display can make you misjudge releases.
- **Source:** XZ1EdSDI0mE
- **Confidence:** High

---

## 4. Guided Weapons (LGB & INS)

### Laser-Guided Bomb (LGB) Targeting Requires a Designator / Laser Spot
- **Models:** Semi-active laser-guided bombs home on a laser spot held on the target by a designating platform.
- **Inputs / parameters:** LGB type (e.g. KAB-250, GBU-10, GBU-28); a platform lasing/designating the target (e.g. an Su-25 "keeping his laser right on it"); target contrast; target motion.
- **Behavior / rules:** LGBs have a laser "lighting right in the center of the carrier" with a designator holding the spot; the weapons "automatically lock based on contrast." They produce direct, non-bracketed hits (4 direct hits demonstrated). Much more accurate than unguided, so they work against moving ships (unlike INS-only dispensers).
- **Outputs / effects:** Direct precise hits on the lased aimpoint.
- **Edge cases / quirks:** The narrator notes there are "really no laser-guided cluster bombs" — guidance + cluster don't combine in CMO. The designator must maintain the spot; turning away / losing line-of-sight ends the engagement (analogous to command-guided rockets losing the shot).
- **Source:** XZ1EdSDI0mE
- **Confidence:** Med

### INS-Guided Dispensers Cannot Engage Moving Targets
- **Models:** Inertial-navigation-only weapons fly to a fixed coordinate and so cannot track movers.
- **Inputs / parameters:** Weapon guidance type = INS (e.g. CBU-103, WCMD-class dispenser); target motion state.
- **Behavior / rules:** The CBU-103 "is an INS weapon … it cannot hit a moving target." The narrator states wind-corrected munitions dispensers "can't be directly used against ships" (ships move). Contrast: penetrator bombs (GBU-10 with a BLU nose) trade the cluster "speckle" for "punch" and go through a carrier deck.
- **Outputs / effects:** Weapon strikes a fixed aimpoint only; misses a moving target.
- **Edge cases / quirks:** If the ship/target is stationary it becomes "pretty easy." The penetrator-warhead variant solves the ship problem by punching through the deck and detonating internally (below the waterline → flooding → unrecoverable).
- **Source:** XZ1EdSDI0mE
- **Confidence:** High

---

## 5. Hard / Buried Target Attack (Bunker Busting)

### Bunker Types, Hardness, Hit Points and Detectability
- **Models:** Different bunker classes (surface, underground, mountain) have distinct hit points, armor, hit-size, and detection signatures.
- **Inputs / parameters:** Structure category (surface "hardened building bunker" vs "land structure hardened building underground" vs integrated mountain bunker vs underground hardened bunker C3M); damage points; general armor rating; physical size (affects hit probability); signatures (visual/radar); scenario "auto-detect" flag; label note (e.g. "Penetrators are required").
- **Behavior / rules:**
  1. **Surface bunker:** "hardened," "building bunker," ~1,600 damage points, average/big, can be hit conventionally (no penetration needed).
  2. **Underground bunker:** "land structure hardened building underground," strong general armor, ~double the damage points (~double 1,600), but bigger so "theoretically easier to hit."
  3. **Mountain bunker:** integrated, has NO signatures (no visual, no radar) — "this target cannot be detected."
  4. **Underground hardened bunker C3M:** label says "Penetrators are required" — the narrator notes that's "only partially true"; similar hit points/size to the others.
  Bigger physical target = easier to land a hit on.
- **Outputs / effects:** A damage-point pool consumed by hits; detectability state.
- **Edge cases / quirks:** If a target is set non-auto-detectable it is permanently invisible — "you could be inside of this thing and you still will not be able to see it." The "Penetrators required" note is not strictly enforced (non-penetrators still did some damage). You must detect the target first, but you can't unless the scenario designer allows it.
- **Source:** jcBmWBHbj8U
- **Confidence:** High

### Penetration vs Explosive-Yield Trade-off for Hard/Buried Targets
- **Models:** Bunker-buster effectiveness depends on whether the warhead is optimized to dive deep (penetrate) or to maximize explosive yield, relative to how deep the bunker is.
- **Inputs / parameters:** Warhead design (penetrator vs blast); bomb total weight (e.g. GBU-28/GBU-37 = 4,700 lb with 670 lb tritonal; KAB-1500LPR = 750 kg / ~2,000 lb but larger warhead fraction; GBU-57 MOP = ~30,000 lb with 2,400 kg HE); warhead-to-body mass ratio; modeled bunker depth (scenario-settable); impact angle (penetration favored near-vertical); clean hit vs near miss.
- **Behavior / rules:** Traditional/large HE bombs (GBU-31 Mk84) on an underground target "cut it in half" but "didn't really penetrate" — only a few hits did real damage (~10% each), no fire (can't flood since it's not underwater). Penetrators (GBU-28/37) are "designed for more penetration" (rocket-boosted, dive into the ground then explode). Blast-optimized weapons (KAB-1500LPR, BLU-109/122) dedicate more mass to explosive than to guidance/penetration, giving "enormous damage" on a clean hit via a bigger warhead. The narrator's rule: deeper-buried bunkers favor the penetrator; shallower favor the bigger-warhead blast weapon — "if we could dial in how deep the bunker is" the penetrator would beat the blast weapon for deep bunkers. The GBU-57 MOP "does more damage than any of these bunkers can survive."
- **Outputs / effects:** Damage-point reduction; possible fire; structure "obliterated" on a clean MOP hit.
- **Edge cases / quirks:** Modeled bunker depth is a scenario parameter that flips which warhead type wins. Impact-angle realism (near-vertical for max penetration) is NOT simulated — the narrator says CMO doesn't enforce vertical delivery for the GBU-28 (it allowed a 26° oblique drop). MOP gives ~18 seconds of cruise. Can't flood a bunker that isn't underwater.
- **Source:** jcBmWBHbj8U
- **Confidence:** High

### Weapon Malfunction / Reliability Probability
- **Models:** Each weapon has a reliability rating; some fraction of releases malfunction and do little/no damage.
- **Inputs / parameters:** Per-weapon reliability rating (stated for GBU-28: "15% chance of malfunctioning"; GBU-28 also described as "pretty reliable"); number of weapons dropped.
- **Behavior / rules:** On release, a weapon may malfunction independently. The GBU-28 had a stated "15% chance of it malfunctioning" and repeatedly "cleaned flat out missed / the weapon malfunctioned." A GBU-10E earlier "had a malfunctioning" fuze (whistled, thunk, no detonation). Because of malfunction + accuracy, the narrator's takeaway is: "you're going to need a lot more than you expect" / "you probably need to drop a few of them to be successful."
- **Outputs / effects:** A dud / no-detonation or greatly reduced effect for the malfunctioning round.
- **Edge cases / quirks:** Reliability is per weapon type (15% for GBU-28). "Many of my weapons malfunctioned, which is just the nature of the beast" — explicitly modeled as random per shot.
- **Source:** jcBmWBHbj8U
- **Confidence:** High

### Weapon Accuracy / Miss Distance (CEP) on Hard Targets
- **Models:** Even guided bombs have a miss distance; a near miss greatly reduces effect against a hardened/buried target.
- **Inputs / parameters:** Weapon accuracy/guidance generation (GBU-28 early laser vs GBU-37 INS vs MOP INS+GPS); "clean hit" vs miss distance in feet; target hardness.
- **Behavior / rules:** Misses quantified: a bomb "45 ft off … against a bunker, that's not good"; MOP "missed it by 31 ft" but still set the bunker on fire (showing MOP's lethal radius). A clean hit does the heavy damage; near misses "shatter all their China and knock all their Legos over" (minor). Later-generation guidance (INS on GBU-37, INS+GPS on MOP) is more accurate than early laser (GBU-28), reducing miss distance. "Same amount of explosives, much much higher effect" from a clean hit vs a near miss.
- **Outputs / effects:** Damage scales sharply with proximity of impact to the (often invisible) aimpoint.
- **Edge cases / quirks:** Against invisible buried bunkers you may only hit "a little vent on the ground." Pilot skill affects spread (the narrator credits "a really talented pilot" for tight results). The same physical impact distance is far more forgiving on soft targets than on hard ones.
- **Source:** jcBmWBHbj8U
- **Confidence:** High

### Standoff Glide / Rocket-Boosted PGM Range Extension (AGM-130)
- **Models:** Mounting a penetrating warhead on a powered glide weapon trades the walk-overhead delivery for long standoff range.
- **Inputs / parameters:** Weapon platform (AGM-130 = rocket-powered glide bomb carrying a BLU-109-class warhead); launch range vs target; launch altitude/energy.
- **Behavior / rules:** A BLU-109 warhead can be mounted on the AGM-130 glide weapon instead of a gravity bomb, giving "a whole different kind of tactical flexibility." At launch the operator is "already within range," fires, and the weapon rocket-boosts past the speed of sound then glides "in a nice sweet arc all the way down." Same warhead capability as the gravity bombs but "massively improved range."
- **Outputs / effects:** A long-range standoff strike with a hardened warhead; an arcing glide trajectory.
- **Edge cases / quirks:** A flat/glancing delivery can still occur ("this would basically be a glancing shot") and the round can still malfunction. Subject to the same reliability/accuracy mechanics as other PGMs.
- **Source:** jcBmWBHbj8U
- **Confidence:** Med

---

## 6. Air-to-Ground Rockets

### Rocket Salvo Rate Limiting (Internal Rate of Fire)
- **Models:** Aircraft cannot ripple a whole rocket pod instantly; rockets fire one (or a few) at a time at a capped internal cadence.
- **Inputs / parameters:** Rocket type (S-5 57 mm, S-8 80 mm, S-13 122 mm, S-24 240 mm, 266 mm); pod capacity (e.g. 256× 57 mm, 160× S-8, 40× 122 mm, 8× big rockets); WRA "salvo size" setting (system default = "fire all weapons"); time the aircraft remains in firing parameters (a function of altitude/dive/speed).
- **Behavior / rules:** Even with WRA set to fire all weapons, the aircraft "can only fire each one of those rockets internally so fast" — it "squeezes one off every once in a while." So a single pass yields only a handful (e.g. "8 rockets of your 256"). Total rockets per pass = (time in firing window) × (internal rate). Bigger/heavier rockets fire even fewer per pass ("your speeds are totally different when dealing with things heavier"). Real-world instant ripple-fire is explicitly NOT simulated (narrator: "we just don't have that … they'll probably change that in the future").
- **Outputs / effects:** The number of rockets actually launched per attack pass (far fewer than pod capacity).
- **Edge cases / quirks:** WRA being on "all weapons" is not a bug — the cap is the per-weapon internal cycle time. Caliber affects cadence (heavier = slower/fewer).
- **Source:** dSKMM3N3-P4
- **Confidence:** High

### Rocket Accuracy Governed by Altitude (and Dive Angle); Fixed Rocket Range
- **Models:** Unguided rockets have a fixed (non-adjustable) range; the operator's only accuracy lever is launch altitude, trading dispersion against the number of rockets fired.
- **Inputs / parameters:** Launch altitude AGL (3,000 ft cited as the sweet spot ≈ "1,000 meters / a kilometer up" per literature; tested 9,000–10,000 ft and 500–1,000 ft); dive angle (examples 1.6°, ~3°, 0° at pull-up); aircraft speed (loiter/slow extends firing time); fixed effective range per rocket (no manual range adjustment); terrain.
- **Behavior / rules:** Rocket effective range is fixed and "cannot be hav[ed]" (not adjustable) — higher altitude automatically yields a longer effective range (e.g. S-5 ≈ 1.3 nm at 3,000 ft → 2 nm at 9,000 ft). Higher altitude = more rockets fired per pass (more time in the window: 8 at low vs ~15 at 10,000 ft) BUT "reduced accuracy" / a much wider spread. ~3,000 ft AGL is the stated optimum balance for both small and large rockets. Flying lower AND slower (e.g. 500–1,000 ft AGL, reduced speed) gives the tightest "perfect hit" but less firing time, so fewer rockets — best with few large rockets, poor for spam tactics. Near misses are normal and considered "a good day" with rockets.
- **Outputs / effects:** Rocket effective-range value, the number fired per pass, and impact dispersion (CEP).
- **Edge cases / quirks:** Some rockets have a proximity fuze (266 mm) making them "slightly more accurate." "Optimum altitude" still yielded 60 ft misses on the 240 mm (called "really good"). Trade rule: high alt = more rockets / less accuracy; low+slow = fewer rockets / best accuracy; ~3,000 ft = balanced. For guided rockets you can fly a bit higher; for fewer big rockets you can fly lower.
- **Source:** dSKMM3N3-P4
- **Confidence:** High

### Rocket Warhead Caliber vs Target Hardness
- **Models:** Rocket lethality scales with warhead size/caliber; small rockets defeat soft/open targets but do nothing to armor or hardened structures.
- **Inputs / parameters:** Rocket caliber/warhead (57 mm S-5 small; 80 mm S-8 "heat" rocket; 122 mm S-13 ~6 kg warhead; 240 mm S-24 ~25 kg; 266 mm 87 damage points); warhead type (HEAT vs HE vs proximity/air-burst); target type (infantry/open soft / armor / ammo bunker / runway / parked aircraft).
- **Behavior / rules:** Stated lethality bands:
  1. **Small rockets (57 mm, 80 mm; ~60–90 mm "NATO sweet spot"):** devastating vs infantry/soft targets in the open ("one of these could defeat an entire division"), but "worthless against anything with armor" — 57 mm did ZERO damage to an ammo bunker ("didn't even scrape the paint"); 80 mm only "scratched the paint."
  2. **"Standard" rockets, 122 mm and up:** the do-anything rocket; can hit armor/bunkers/runways for real damage on a clean hit, but less accurate and carried in smaller numbers (~40), with a different (higher) flight speed.
  3. **Big rockets (240 mm, 266 mm):** anti-runway / anti-big-building / soft-area weapons, not really for point ground targets (only 8 carried). The 266 mm S-25-class has a HE air-burst fuze "designed to blow up an area" — best vs parked aircraft. The largest rocket (266 mm, 87 dmg pts) is only "marginally" less powerful than a Mk82 iron bomb.
  Runways are so big you "basically can't miss them with a rocket" — they take heavy damage.
- **Outputs / effects:** Target damage scaled by caliber and target hardness; armor/bunkers immune to small calibers.
- **Edge cases / quirks:** HEAT rockets (S-8) are "a little bit better against targets that are armored." Some rocket WRAs carry a usage note "do not use against [runways]" for the air-burst fuze (counter-intuitive since it's an area weapon — the narrator disputes it). Some target types are simply not engageable (e.g. runway refused for certain weapons). Eastern design philosophy = a different rocket per job vs the Western do-everything approach.
- **Source:** dSKMM3N3-P4
- **Confidence:** High

### Guided / Command-Guided Rocket (Vikhr) Precision Strike
- **Models:** Laser/command-guided rockets behave like tiny line-of-sight missiles — very high hit chance and armor penetration despite a small warhead.
- **Inputs / parameters:** Weapon (Vikhr laser/command-guided rocket with a tandem HEAT warhead); CEP (stated ~2 m); guidance type (command-guided — no laser-designation "shenanigans"); line-of-sight maintenance; launch speed (loiter speed gives more time to shoot); impact speed (~1,200 knots cited).
- **Behavior / rules:** Guided rockets have a CEP of ~2 m → "very unlikely to miss." Tandem warheads make them "extremely effective against armored units" even though the warhead is tiny — accuracy outweighs small yield (one missile "creamed" a BTR). Being command-guided, no laser-spot handling is needed. Setting the shooter to loiter speed gives "more time to take the shots." A few can be fired at a time. Getting close = direct hits = even more effective.
- **Outputs / effects:** Near-guaranteed direct hits; armor kills from a small warhead.
- **Edge cases / quirks:** Line-of-sight limited — when the aircraft turns away it "lost the ability to take the shot" and stops engaging (you can't keep firing once LOS is broken). The narrator semantically blurs "rocket" vs "missile" for this class.
- **Source:** dSKMM3N3-P4
- **Confidence:** High

---

## 7. Anti-Satellite (ASAT) Engagements

### Air-Launched ASAT Intercept Geometry and Launch Envelope (ASM-135)
- **Models:** An air-launched ASAT (ASM-135) must be positioned in the satellite's ground track and pointed correctly so the high-speed interceptor crosses the target's path; it is hit-to-kill.
- **Inputs / parameters:** Satellite speed (~15,123 knots) and orbital period (~90 min); interceptor (ASM-135 on F-15A) launch altitude (80,000 ft) and target altitude both within the envelope; weapon range (250 nm); guidance (IR seeker, hit-to-kill); shooter heading/alignment toward an alignment point then a shooting point; time-to-overhead from range/speed; weapon-vs-target closing/deflection angle.
- **Behavior / rules:** Procedure:
  1. Read the satellite's projected ground-track course line; account for parallax by overlapping the course line seen "through the planet" until the lines intersect → that intersection is the **SHOOTING POINT** (mark it).
  2. Mark a second **ALIGNMENT POINT** earlier along your path; aim the F-15 at the alignment point and proceed toward the shooting point so you arrive pre-pointed.
  3. Compute time-to-overhead = distance ÷ closing speed. Worked example: 3,046 nm ÷ (~15,000 × 60) ⇒ "over us in 12 minutes."
  4. Confirm launch altitude, target altitude, and range (250 nm) are within parameters, then fire near "critical range."
  The weapon does not need an intercepting/lead pursuit; it is hit-to-kill and splatters the satellite even at a large deflection angle. Key rule: "make sure you get there pointing towards the target before it gets there."
- **Outputs / effects:** Satellite destroyed on impact (hit-to-kill, creating debris); a placed shooting point and alignment point.
- **Edge cases / quirks:** The first mistake players make is expecting a classic intercept geometry — closure (~2× weapon speed) means it's a high-deflection snapshot, not a tail-chase. Being off by a couple of miles "is not going to break the game" but makes a harder shot. No requirement to be at high speed / Mach 1.35 like the real launch. Parallax in the 2D view makes the true 3D angle hard to read. Hit-to-kill "makes more space junk."
- **Source:** ZI33voJYRpE
- **Confidence:** High

### Surface / Naval SAMs (SM-3, SM-6) as ASAT Interceptors
- **Models:** Some naval SAMs carry an explicit anti-satellite capability and can engage satellites at extreme range when positioned under the track.
- **Inputs / parameters:** Weapon (SM-3 — "no [air] capability" but is an ASAT; SM-6 — also lists a satellite-engage capability); extreme weapon range; ship position relative to the satellite ground track; timing.
- **Behavior / rules:** Target the satellite (**Shift+F1**, click the satellite, fire a pair, **Execute**). The missile launches and travels an extreme distance; due to Earth's curvature the weapon must "level off" on the way out. At intercept the weapons are doing ~Mach 13 and "easily slap that satellite out of the sky." Same core requirement as the air-launched ASAT: be at the right place at the right time under the track.
- **Outputs / effects:** Satellite destroyed; a very-long-range ballistic intercept trajectory.
- **Edge cases / quirks:** "Problem with ships … is you have to be at the right place at the right time." Earth curvature affects the trajectory ("if we go this way, we're actually going that way"). SM-3 has no other (air) engagement capability but does ASAT.
- **Source:** ZI33voJYRpE
- **Confidence:** Med

---

## 8. Naval Mine Warfare — Emplacement

### Mine Depth-of-Water Gating (Emplacement Validity by Target Altitude)
- **Models:** A real-world constraint that each mine type can only be laid in water shallow enough for its design depth.
- **Inputs / parameters:** Per-weapon **Launch Altitude**; **Target Altitude** (e.g. −148 ft for the "2462" bottom mine); mine type (bottom/moored/etc.); seafloor depth at the drop point (visible via the **Relief** layer).
- **Behavior / rules:** Each mine weapon carries a Target Altitude value expressed as a negative depth (e.g. minus 148 ft). When a unit attempts to drop the mine, CMO compares the seafloor depth at the drop location against that mine's target/operating depth. If the water is DEEPER than the mine's rated depth (e.g. dropping a −148 ft bottom mine in water deeper than 148 ft), the mine simply will NOT drop / will not be emplaced. Shallow-enough water = a valid emplacement. Crews laying moored mines specifically must match the exact depth of the weapon being used. The operator can inspect depths beforehand via the Relief layer to see where placement is valid.
- **Outputs / effects:** Mine is emplaced (valid) or refused / not dropped (invalid); a region can be pre-screened as valid/invalid for a given mine type.
- **Edge cases / quirks:** Bottom mines dropped in very deep water (e.g. 10,000 ft) are harmless: they sink to the bottom and "don't bother anybody" — i.e. ineffective rather than refused. This is the most common point of confusion ("different types of mines have different depths they can operate at"). Launch altitude must also be respected for air-dropped mines.
- **Source:** 9Aefk11L9VA
- **Confidence:** High

### Mine Zone Mission (Random Scatter Placement)
- **Models:** Quick area mine-laying where mines are scattered randomly inside a drawn zone — the "default" way most players lay mines.
- **Inputs / parameters:** A drawn reference area (mine zone); the assigned mine-laying platform and its mine loadout; mission type = mining (vs mine clearing).
- **Behavior / rules:** The operator draws an AREA reference zone and assigns a mining mission to it. CMO then places mines at RANDOM positions within that area as the platform transits it. Fast but imprecise — placement is non-deterministic and not evenly patterned.
- **Outputs / effects:** Mines emplaced at pseudo-random locations inside the zone.
- **Edge cases / quirks:** Called out explicitly as "not very precise" — random placement is the trade-off; use a line-based mission for exact spacing. (The mission can be deleted with **Ctrl+Delete** to switch methods.)
- **Source:** 9Aefk11L9VA
- **Confidence:** Med

### Line Mine-Laying with Fixed Mine Interval (Precise Patterned Emplacement)
- **Models:** Precise mine laying along an operator-drawn polyline so mines are evenly spaced at a chosen interval, enabling arbitrary minefield shapes.
- **Inputs / parameters:** A drawn reference **LINE** (multi-vertex path, not an area); a mine mission with "Line vs Random mine mode"; **Mine Interval** (distance between mines, in feet, e.g. 6,280 ft); optional **Group Interval** (left unset); platform mine count (e.g. 42 mines carried); **Station Altitude**; movement style; enforce-flight-size toggle.
- **Behavior / rules:**
  1. Draw a line (**Ctrl+Insert** + left-click to add vertices) tracing the desired minefield shape.
  2. Open the mission editor (**Ctrl+F11**), set mission type = Mining, set mode to "Line" (vs Random).
  3. Size the field by computing spacing manually: total line length × needed coverage, then total distance ÷ number of mines = required interval. Worked example: a 44 nm line, treated as 44 nm × ~6,000 ft = 264,000 ft, ÷ 42 mines = ~6,285 ft between mines (≈ one mine per nautical mile); the operator enters **Mine Interval = 6,280 ft**.
  4. Mines are laid at that fixed interval along the line. Verified in-sim: consecutive mines measured 1.1 nm apart ≈ 6,280 ft.
- **Outputs / effects:** Mines emplaced evenly along the drawn line at the specified interval; the minefield takes the exact drawn shape.
- **Edge cases / quirks:** Must turn OFF enforced flight size (set to 1) or the mission errors. Must set movement style to "Repeatable Loop" or the laying behaves unexpectedly ("you're going to get a little confused"). After exhausting its load the aircraft flies all the way back to its reference point (RP) and repeats the loop. Pathfinding can overshoot — observed dropping a few mines onto an island ("out of scope"); the operator notes a little nudging helps. Station altitude must be correct (too high/low = won't work). Mine Interval is in feet. There is also a fuller "PE version" with extra options (set distances between mines, group intervals) not available in this build.
- **Source:** 9Aefk11L9VA
- **Confidence:** High

### Mine Arming Delay
- **Models:** A real-world arming / safe-separation delay before a freshly laid mine becomes live.
- **Inputs / parameters:** **Arming Delay** time value set in the mission (e.g. 2 hours default, reducible to 1 hour for aircraft); a "1/3 rule" option offered.
- **Behavior / rules:** Each laid mine has an arming delay before it goes hot. The default shown was 2 hours; the operator notes an aircraft-laid field can use 1 hour. Until the delay elapses the mine is presumably inert. A "1/3 rule" option is offered in the same dialog (declined here, not explained).
- **Outputs / effects:** Mine becomes armed / live after the configured delay.
- **Edge cases / quirks:** The value is operator-tunable per mission; the "1/3 rule" exists as a related option but its behavior is not described in the transcript.
- **Source:** 9Aefk11L9VA
- **Confidence:** Med

---

## 9. Naval Mine Warfare — Detonation, Damage & Avoidance

### Mine Detonation Requires Near-Direct Overlap (Contact / Proximity Hit Geometry)
- **Models:** Mines only damage a ship that passes essentially on top of them; small course offsets dramatically change how many mines are struck.
- **Inputs / parameters:** Ship track vs individual mine positions; mine detonation/effective range; ship size/displacement.
- **Behavior / rules:** A mine only triggers when a ship effectively lands on / passes directly over it ("you basically have to land on them to actually get them to go off"). Detonations are computed per individual mine against the passing hull. Because spacing leaves gaps, a vessel can transit a dense field and hit zero mines, or — with a small lateral offset — hit many. Demonstrated: a ULCC sailed straight through "the world's most deadly mines" with zero hits; moved ~1 mile right, it then struck 8 mines. Same effect with a battleship driving the field — the first mine "missed," subsequent ones hit one-by-one.
- **Outputs / effects:** Per-mine hit/miss; cumulative damage to the transiting ship; mines consumed when they detonate.
- **Edge cases / quirks:** "If you put a thousand mines in an area there's still a probability you get through without bumping into anyone." Once a ship's exact track is known to clear the field, that track is a reusable SAFE PATH — the operator draws 2 waypoints over the proven path and routes following ships behind it. Pathfinding / path-fighting can make a unit deviate from the intended safe line (kinks in turns), requiring manual route adjustment; shallow water + unmodeled channels worsen this.
- **Source:** 8LcvBud3kj4
- **Confidence:** High

### Mine Damage Scales with Detonation Standoff Distance and Target Size
- **Models:** Damage from a mine depends on how close the detonation occurs to the hull and how large/tough the target is; big ships shrug off near-misses.
- **Inputs / parameters:** Detonation range from target (logged in the message log, e.g. 0 nm / directly underneath, ~1,300 ft, ~450 m); target size/displacement/toughness; hit location/subsystems.
- **Behavior / rules:** On each mine event CMO logs the detonation distance to the affected unit and applies damage accordingly. A direct / zero-range underwater detonation is catastrophic; a detonation at standoff (e.g. 1,300 ft from the battleship) does little. Larger, tougher hulls take proportionally less damage per hit: the battleship took only 1% from a direct mine; a 420,000-DWT ULCC took only "scratches" per mine and survived 8 hits before being disabled. Damage is also localized — the Iowa mine hit popped SERVOX/decoys and "mangled the Mark 13 fire control" for ~1% total.
- **Outputs / effects:** Per-event damage %, subsystem/component damage, possible mobility kill (engine/diesels "cooked"), unit loss if severe.
- **Edge cases / quirks:** Effective mine range is roughly "a kilometer at the most" per the host; observed lethal underwater hits at 0 nm and damaging hits well under that. A mobility-killed ship can be set "operational" again and sailed home (and will likely hit more mines en route). Big ships need many hits to sink; small mine-warfare ships are "snapped in two" by a single hit.
- **Source:** 8LcvBud3kj4
- **Confidence:** Med

### Safe-Path Discovery and Reuse (Durable-Ship Probe Tactic)
- **Models:** Using a heavily-armored expendable ship to physically prove a survivable lane through a minefield, then reusing that exact track for other units.
- **Inputs / parameters:** A very durable probe ship (e.g. a battleship); its actually-traveled track; drawn waypoints over the proven path; follower units.
- **Behavior / rules:** Send a highly durable ship straight through the field. Whatever path it takes and survives is, by definition, a safe path. The operator records that path by drawing waypoints (e.g. two points) over it and routes all following ships to follow behind along that exact track. (An "old-school, stupid" but functional method.)
- **Outputs / effects:** A reusable cleared / safe route; follower ships transit with the probe ship's hit risk.
- **Edge cases / quirks:** The probe can still clip a mine (the battleship "clipped one" but took effectively no damage — "you heard a thump"). Pathfinding / path-fighting can make the probe (and followers) deviate from the intended straight line, especially with shallow water and unmodeled channels, so the recorded route may need manual correction (extra kinks/turns).
- **Source:** 8LcvBud3kj4
- **Confidence:** Med

### Minefield / Cleared-Lane Width Sizing from Mine Effective Range
- **Models:** How wide a swept corridor must be for safe transit, derived from a mine's effective (lethal standoff) range plus a safety margin.
- **Inputs / parameters:** Mine effective range (estimated, e.g. ~1 km max from logged detonation distances); desired transit-lane geometry; message-log detonation-range readouts (e.g. 450 m, 1,300 ft, 0 nm).
- **Behavior / rules:** The operator reads detonation standoff distances from the message log to estimate a mine's effective range (the host pegs it at ~1 km max). The cleared corridor only needs to be as wide as twice that range so a ship down the centerline stays outside lethal range on both sides. Demo: a ~4 nm-wide swept zone was far wider than necessary; a ~1 km mine reach implies a lane built at ~1 km spacing would "be okay" IF you stay perfectly centered. For safety, DOUBLE the coverage and sweep a ~2 km-wide zone so off-center transits survive.
- **Outputs / effects:** A chosen cleared-lane width (rule of thumb ≈ 2× mine effective range, e.g. ~2 km for a ~1 km-reach mine).
- **Edge cases / quirks:** A bare 1-km lane forces perfect centerline navigation; deviation re-enters lethal range. You don't have to sweep the whole ocean — only a corridor. Even doubled, surprises remain because clearance is never complete.
- **Source:** 8LcvBud3kj4
- **Confidence:** Med

---

## 10. Naval Mine Warfare — Taxonomy, Detection & Clearance

### Mine Type Taxonomy and Per-Type Fusing / Behavior
- **Models:** CMO models distinct real mine archetypes, each with its own placement, fusing sensors, and counter-tactics.
- **Inputs / parameters:** Mine class (floating/drifting, moored, bottom, captor/torpedo, rising/transit); fuse/sensor type (acoustic, magnetic, contact/seismic, pressure, broadband, narrowband, remote-controlled); water depth; target signature.
- **Behavior / rules:**
  - **Floating ("movie") mines:** sit on/near the surface, triggered by acoustic, magnetic, or contact sensors (contact requires bumping the mine); very hard to detect despite being at the surface.
  - **Moored mines:** anchor on the bottom with a cable, mine floats below the surface; fused by magnetic/pressure/contact; only work in water shallow enough for the cable, so the layer must know the exact depth.
  - **Bottom mines:** lie on the seabed in shallow water and listen; fuse variants — broadband (anything loud passes), narrowband (loud with a specific signature), pressure (pressure change overhead), seismic, and remote-controlled (a shore operator clicks to fire).
  - **Captor/torpedo mines:** a torpedo housed in a bottom mine that detects (typically) a submarine and launches a torpedo at it.
  - **Rising/transit-then-bottom mines:** torpedo-like mines that swim to a target area, run out of energy, sink, and become bottom mines (also described as a bottom mine that floats up and explodes); useful to route a mine around defenses (e.g. fire past an AAA battery, swim in, then settle).
- **Outputs / effects:** Determines detectability, what sensor sets can find it, what sweep gear can neutralize it, and the lethality profile.
- **Edge cases / quirks:** Remote-controlled mines and seismic-fuse mines are flagged UNSWEEPABLE ("we haven't figured out a way to deal with them") and are NOT laid by default in the base game (specialty types). Mine warfare is INDISCRIMINATE — it damages friend or foe alike, denying the area to everyone. Captor/torpedo mines can be mixed with conventional explosive mines to create a far deadlier mixed field.
- **Source:** 8LcvBud3kj4
- **Confidence:** High

### Mine Detectability by Sensor Type / Platform
- **Models:** Which sensors can find which mines — most surface and air sensors are nearly blind to mines; submarine HF sonar is the standout detector.
- **Inputs / parameters:** Sensor type per platform (surface-search radar, maritime-patrol-aircraft sensors, submarine high-frequency sonar / "mine-hunting" sonar); platform altitude/depth/speed; mine type; range.
- **Behavior / rules:** Floating mines sit low enough in the water that even a sophisticated MPA (P-8) cannot detect them, and lowering the aircraft's altitude does NOT help. A surface ship's surface-search radar also will NOT detect floating mines. You can only spot floaters visually with a good view. The best mine detector is a **SUBMARINE** using short-range high-frequency sonar/radar: it picks mines up accurately, is very short-ranged, and is hard to detect at distance. Dedicated MCM ships carry a high-quality mine-hunting sonar that "works fantastically." Submarine detection works from beneath the mines (it "sailed underneath" a drifting contact mine and still detected it). Slower transit aids detection: the sub is ordered to creep speed to detect.
- **Outputs / effects:** Mine contacts revealed/classified for the operator (enabling subsequent sweeping/avoidance).
- **Edge cases / quirks:** A high-freq-sonar sub run at high speed (e.g. 35 kt) through a field is unrealistic but interestingly defeats captor-mine torpedoes (they "have a heck of a time tracking him" at 35 kt) even while it attracts more launches. Detecting a mine doesn't let you simply "gun" it as in reality — the engine forces conventional sweeping (see the sweeping mechanic).
- **Source:** 8LcvBud3kj4
- **Confidence:** High

### Mine Sweeping / Clearing — Gear Is Type-Specific and Only Works in a Straight Line
- **Models:** Active minefield clearance via towed/airborne sweep gear and divers; each tool only affects certain mine types and only while running straight.
- **Inputs / parameters:** MCM platform and its specific sweep tools (mine-hunting sonar; cable cutter; acoustic influence; magnetic influence; diver with explosive charge; airborne ALQ-220 "Oasis" magnetic-influence pod); mine type being targeted; platform speed; altitude (air); heading-straightness; mine-clearing mission with flight-size / repeatable-loop options.
- **Behavior / rules:** Set up a **Mine Clearing** mission (same as a normal mission; set flight size to 1 for one-at-a-time; can use repeatable loops for tight coverage). Sweep gear behavior by tool:
  - **Cable cutter** — snaps a moored mine's chain so it floats up, then you destroy it with gunfire ("old-fashioned way").
  - **Acoustic + magnetic influence** — emit noise/magnetic disturbance to trigger mine fuses to self-detonate.
  - **Diver charge** — manual, "takes a hot second."
  **CRITICAL constraint:** sweep gear only operates while the platform travels in a STRAIGHT LINE; when the unit turns it STOPS sweeping, re-lines up, and only then re-deploys the sweep array (the towed chain must trail straight behind). The swept area is visualized as a band / "blue things" trailing the platform.
  **Airborne sweep (ALQ-220 on a helicopter):** magnetic-influence ONLY (no cable cutter), so it affects only one mine type; the helicopter must descend to low altitude and slow down for the pod to work; sweep width is very narrow (300 m).
  **MCM/sweeper detect-and-attack:** when these platforms detect a mine they automatically move to it and attempt to destroy it.
- **Outputs / effects:** Targeted mines neutralized/detonated; a swept lane is cleared; the expenditure log records mines destroyed vs total laid.
- **Edge cases / quirks:** Type-specificity means many mines are immune to a given sweeper ("they can only influence certain types of mines") — clearance is very incomplete (demo: ~13 of 300 mines, <5%, cleared). MODERN mines auto-IGNORE the first acoustic/magnetic influence pass and detonate on the SECOND pass. Floating mines + trailing sweep gear: if you try to sweep a floater with gear behind you, you will physically run into and detonate it — clear/know floater positions FIRST before sweeping for bottom/captor mines. MCM ships are NOT immune: special low-signature hull materials make them less likely to set off mines, but a direct hit still explodes them and "snaps them in two" (lost the Avenger to a rising mine). Sweeping is inherently noisy/detectable ("people are going to know you're doing it"). The job is "never done" — even after heavy effort most mines may remain.
- **Source:** 8LcvBud3kj4
- **Confidence:** High
