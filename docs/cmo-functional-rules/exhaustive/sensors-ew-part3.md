# Sensors / EW / IADS — Part 3/3

**Scope.** This is Part 3 of 3 of the exhaustive CMO functional-rules spec for the **Sensors / EW / IADS** bucket. It covers anti-radiation weapons and emitter homing, communications & GNSS jamming, decoys and offensive ECM, active vs. passive sensing and detection/identification gating, air-to-air seeker behavior (R-27 family), SAM siting / line-of-sight / arc constraints, multi-component IADS modeling and survivability, the automatic countermeasure / hit-probability adjudication model, and the supporting terrain-masking, point-defense, and ground-insertion mechanics that bear on EW/IADS play. Sibling Parts 1 and 2 cover the remainder of the bucket; this document does **not** restate their rules.

This spec aims to be **exhaustive** for the rules assigned to it: every assigned mechanic is captured, near-identical mechanics have been merged (with all source video IDs cited), and stated numbers are reproduced **verbatim**. Nothing here is invented beyond what the sources state.

**⚠️ Auto-generated-caption caveat.** These rules were synthesized from **automatically generated** video captions (YouTube auto-transcripts). Spoken numbers, unit names, and terminology may be mis-transcribed or garbled; where the source itself is clearly unreliable, the rule's **Confidence** is lowered and the doubt is called out in the edge cases. Treat low-confidence figures as directional, not authoritative.

---

## 1. Anti-Radiation Weapons & Emitter Homing

### Anti-radiation missiles (HARM) home on any active emitter — radars or jammers; emission-off (EMCON) defeats them
- **Models:** Anti-radiation missiles (AGM-88 HARM / HARM-type ARMs) guide onto the strongest active radio emission they can detect — whether that emitter is a SAM/fire-control radar or a GNSS jammer. A silent emitter is neither detected nor targeted; the act of radiating invites an immediate ARM. The jamming the emitter produces does **not** degrade the inbound ARM.
- **Inputs / parameters:** Enemy emitter state (on/emitting vs. silent / EMCON); emitter emission strength (a powerful jammer or fire-control radar is a bright, easy target); HARM shooters' position/altitude (fire "from the safety of altitude"); per-shot HARM allocation (operator caps it at **2 per target** / "two allowed per shot" to avoid waste); SEAD platform's ability to detect the emitter class (F-16CJ block 52 can detect GPS/GNSS jammers); presence of proximity / anti-missile point-defense near the emitter.
- **Behavior / rules:**
  1. HARMs key on **active emitters**. They are fired at "now radiating missile silos," and a SEAD jet (F-16CJ) that detects a GNSS jammer fires **one AGM-88 HARM** at it.
  2. The instant SAM radars turn on to engage, "everybody with a harm is now going to start to fire the harm from the safety of altitude" — "he turned his radar on and got splattered for it."
  3. Radars/emitters that "never emitted" are not picked up and not engaged, so the strike force gets surprised by hidden SAMs later.
  4. "A HARM has no problem tracking this particular signal," and critically "the jammer does not affect the HARM missile — the HARM missile just wants to go for the big strong radar signal." The emitter's own emission guides the ARM in.
  5. **Emission-off defeats the ARM:** the counter is for the operator to "shut off his jammer" / keep the radar silent — no emission, no lock.
  6. Operator caps HARM allocation at **2 per target** to avoid waste.
- **Outputs / effects:** Emitting radars/jammers are destroyed; a jammer kill immediately restores GNSS to friendly GPS-guided weapons (see §3). Silent emitters stay safe but blind. Nearby point-defense can intercept the inbound HARM.
- **Edge cases / quirks:** Defender's trade-off is emit-to-engage (and risk an ARM) vs. stay-silent-and-undetected; non-emitting sites create nasty surprises. **Co-locating anti-missile-capable SAMs near the emitter is the documented counter** ("if you want to stop them from cheapshotting enemy silos, you have to put something with anti-missile capability nearby"). GPS satellite signals are "very weak by the time they get down to the ground... very easy to jam," which is **why** a relatively cheap jammer is effective — but its powerful jamming emission makes it a bright, easy ARM target.
- **Source:** trL6M6PdnMM, F2qF40ekodo
- **Confidence:** High

### Anti-radiation air-to-air missile (R-27P/EP) homes on the target aircraft's radar emissions
- **Models:** An air-to-air anti-radiation seeker (R-27P/EP variant) guides onto the **radar transmissions of the target aircraft**, rather than onto a radar return (active/SARH) or onto heat (IR). It is a distinct seeker on the common R-27 body (see §5).
- **Inputs / parameters:** Seeker = air-to-air anti-radiation (homes on radar emissions); target must be **emitting** (radar on); target type must be **airborne** — surface emitters are categorically invalid.
- **Behavior / rules:** If the enemy doesn't know it has been launched on and leaves its radar on, the missile guides straight to it. Quirk shown: the F-16 target "turns immediately" / cuts emissions when threatened, so the missile can lose guidance. This is **not** a conventional anti-ship ARM — you **cannot** fire it at a surface target (e.g., a ship's surface-search radar); it simply does not work against surface emitters. A very long-range emission shot can have very low hit probability, but the target may not know it was fired on (so it doesn't evade), which can still make the shot worthwhile.
- **Outputs / effects:** Missile guides onto the airborne emitter; if the target shuts down its radar or maneuvers, guidance degrades and it misses.
- **Edge cases / quirks:** Surface targets are categorically invalid even though they emit. Effectiveness depends on the target leaving its radar on **and** not knowing it's targeted. Low PK at extreme range, but surprise (no launch warning to the target) can still justify the shot.
- **Source:** U_eBSdZMR6U
- **Confidence:** High

---

## 2. Communications Jamming & Link-Loss Behavior

### Communications jamming (line-of-sight comms / datalink denial)
- **Models:** An emitter that severs the radio link between a controlling unit and its remote units (e.g., drones), denying command/telemetry over line-of-sight. SATCOM-linked units are immune.
- **Inputs / parameters:** Scenario feature flag **"communications jamming" must be ON**; a unit's comms jammer (sensor) toggled on; target units' communication paths (line-of-sight datalink vs. satellite comms); line-of-sight geometry between jammer and the linked units.
- **Behavior / rules:** When the scenario "communications jamming" option is enabled and a unit turns its comms jammer on, **every unit whose datalink can be reached line-of-sight is flagged "jammed"** and drops off the network — the controller can no longer see, identify, or command them. Jamming is **line-of-sight only**: units with satellite comms cannot be jammed this way (in the demo, SATCOM was manually removed from the drones so the LOS jammer could fully deny them). While jammed, the operator loses position/identity of the jammed units **unless** it detects them with its own onboard sensors (radar/visual). Turning the jammer off restores the link, and the units resume/continue their previous mission/orders.
- **Outputs / effects:** Affected units show a "jammed" label and disappear from the controller's network track picture; the controller loses command and telemetry; the now-autonomous units' behavior is governed by their autonomy level (see next rule); on un-jam, link and prior orders resume.
- **Edge cases / quirks:** SATCOM-equipped units are immune to LOS comms jamming. A unit that RTBs while jammed (because it lost the link) will, once the jam is lifted, **continue/resume its original mission** rather than stay home. The operator can still track jammed *friendly* units via its own radar/visual sensors, independent of the datalink.
- **Source:** tKndAfw6m34
- **Confidence:** High

### Drone autonomy levels (link-loss behavior)
- **Models:** How an unmanned aircraft behaves when it cannot communicate with home base, ranging from "go home" to "keep fighting the mission."
- **Inputs / parameters:** Per-unit autonomy level setting (e.g., **"self-recovering"** vs. **"fault/event adaptive"**); link state (jammed / link lost vs. link present); the unit's assigned mission/orders.
- **Behavior / rules:** Each drone has an autonomy level that determines link-loss behavior. A **"self-recovering"** drone (MQ-1C in demo) that loses comms with home base attempts to **Return To Base**. A **"fault/event adaptive"** drone (MQ-9 Reaper in demo) can operate where it cannot talk to home base **and** will attempt to fulfill its assigned mission autonomously (e.g., proceed to the target area and try to find/identify the target on its own). There are multiple autonomy modes beyond these two (narrator references an external article). Quirk shown: an autonomous drone with no current target knowledge can fly right over/past the target because it has no updated position, then loops back to search.
- **Outputs / effects:** On link loss, the unit either RTBs (self-recovering) or continues prosecuting the mission (adaptive); the drone's own side may lose its track/identity while it is off-network.
- **Edge cases / quirks:** An adaptive drone disregards that it has no knowledge of the enemy and still tries to complete the mission, overflying the target. A self-recovering drone that returns home due to a temporary link loss does **not** automatically re-launch into the mission once the link returns (it lands "confused") — **but** a unit whose RTB was caused purely by **jamming** will resume its mission when jamming ends (interaction with the comms-jamming mechanic above).
- **Source:** tKndAfw6m34
- **Confidence:** Med

---

## 3. GNSS / GPS Jamming

### GNSS/GPS jamming degrades navigation-dependent weapon accuracy progressively over time
- **Models:** A GNSS jammer denies GPS/GNSS to weapons in its line-of-sight; affected weapons drift, and **miss-distance grows the longer the signal is denied**.
- **Inputs / parameters:** Jammer coverage — **all GNSS satellite signals (GPS, Compass/BeiDou, GLONASS, Galileo) affected**; per-weapon GNSS reliability shown as a percentage (e.g., **"GNSS 62%"**); weapon altitude; terrain/horizon between jammer and weapon; **time without signal**.
- **Behavior / rules:** Cruise missiles show a "GNSS 62%" indicator while jammed — the jammer is "blocking the GPS signal which is causing them to lose accuracy of their particular position." Key rule: **"the longer something does not have GPS or GNSS signal... it is going to be progressively less accurate over time."** Demonstrated numerically via Losses & Expenditures: a weapon jammed ~15 min the whole flight degraded to **14.3 m** accuracy; an identical weapon that flew terrain-masked and only lost GPS for a few percent right before impact achieved **9.5 m** — "basically a 3 m difference between having GPS at all and not having GPS." Altitude strongly affects exposure: "missiles at really high altitude are losing the GPS much quicker" while "missiles at low altitude have great GPS reliability."
- **Outputs / effects:** Per-weapon GNSS reliability %; final weapon CEP/miss distance (e.g., **14.3 m** jammed vs. **9.5 m** mostly-clear); confidence in weapon position.
- **Edge cases / quirks:** Even fully jammed (satellite signal entirely lost), the weapon still hit "more or less directly" — "these things were designed to be jammed," so degraded ≠ useless ("14.3 m... it's good enough"). In CMO the unit's **own position stays known to the player** even when its GNSS is lost ("they're pretty confident because this is command modern operations") — a stated simplification the devs may change later.
- **Source:** F2qF40ekodo
- **Confidence:** High

### GNSS jamming is line-of-sight — Earth curvature + terrain masking defeat it
- **Models:** Jammer effect requires LOS from jammer to target; the Earth's curvature and intervening terrain block the jamming beam, creating **jam-free pockets**.
- **Inputs / parameters:** Jammer position; target position; Earth curvature; terrain/horizon between them; target altitude (sets radio horizon).
- **Behavior / rules:** "The Earth is curved... if my jammer is on this side of the curve and my [missile] is on the other, they don't talk to each other." Therefore "terrain masking has a massive impact on the ability to guarantee that your particular platform does not get jammed" — "jammers are line of sight." Demonstrated: missiles launched over open water get maximum jamming exposure and lose GPS early; missiles routed through a mountain valley stay below the jammer's LOS and only begin degrading ("GPS quickly degrading") when they "pop out of these valleys" just before impact — "they've only lost a few percentage before they show up."
- **Outputs / effects:** Whether a given weapon is in the jammer's LOS and thus jammed; timing of the onset of degradation.
- **Edge cases / quirks:** Higher altitude = larger radio horizon = jammed sooner/harder; staying low and behind terrain delays jamming until the terminal pop-up. Jammer range is described as "incredibly long, very, very powerful" when LOS exists. (Pairs with the progressive-degradation rule above and the LOS-reciprocity / terrain-masking rules in §6.)
- **Source:** F2qF40ekodo
- **Confidence:** High

### GPS-guided weapons (JDAM) fully restored once the jammer is removed
- **Models:** GPS-dependent munitions regain **full** accuracy the instant GNSS is no longer denied — degradation is applied continuously based on current GNSS availability, not latched at launch.
- **Inputs / parameters:** Weapon GNSS dependency (JDAM); presence/absence of an active jammer in LOS.
- **Behavior / rules:** After a HARM kills the jammer (see §1), the F-16 drops JDAMs: "our J dams, which of course are GPS weapons, are not affected anymore. There's just no problem... nothing's going to affect their accuracy any longer and they're going to happily smash into those targets... with no consequence."
- **Outputs / effects:** Full weapon accuracy (no degradation) post-jammer-kill.
- **Edge cases / quirks:** Implies the accuracy-degradation model is **continuous**, not latched at launch — remove the jammer and accuracy snaps back to nominal. (This is the payoff of killing the emitter with an ARM in §1.)
- **Source:** F2qF40ekodo
- **Confidence:** High

---

## 4. Decoys & Offensive ECM

### Decoys hold launch altitude (and only jam/decoy at that altitude)
- **Models:** Air-launched decoys fly and stay at the altitude they were released at; their effect (jamming or seduction) exists **only** in that altitude band.
- **Inputs / parameters:** Launch altitude of the decoy at release; decoy type (passive vs. active jamming decoy, e.g., ADM-160 MALD); target type/altitude (e.g., a ground SAM); the SAM's max engagement ceiling.
- **Behavior / rules:** A decoy tries to stay at the altitude it was fired at. **Consequence 1:** against a ground target like a SAM, if the decoy is launched **above** the altitude the SAM can shoot to, the SAM will never engage it (the decoy is irrelevant). **Consequence 2:** an active jamming decoy (ADM-160) provides jamming **only** at the altitude it was launched at — it is not jamming other altitudes. So a single decoy covers only a thin altitude slice.
- **Outputs / effects:** Decoy persists at its launch altitude; SAM ignores too-high decoys; jamming coverage is confined to the decoy's altitude.
- **Edge cases / quirks:** To bait a low-altitude SAM you must launch the decoy low enough to be within the SAM's engagement envelope. Jamming is line-of-sight, which sets up the "ladder" technique below.
- **Source:** Hj4gbSDi03w
- **Confidence:** High

### Decoy "ladder" — vertical stack of jamming decoys
- **Models:** Stacking active-jamming decoys at descending altitudes to build a **continuous vertical wall** of line-of-sight jamming through which strike weapons fly.
- **Inputs / parameters:** A launch aircraft with multiple active jamming decoys (ADM-160); a descending flight profile so each decoy drops at a different altitude; weather / min-altitude limits; the defender's radar / LOS to the attack corridor.
- **Behavior / rules:** The launching aircraft descends in steps and pops one active-jamming decoy at each altitude (demo used **~30k, ~25k, ~20k, ~16k, ~12k, ~9k, then a low one ~2k ft**). Because jamming is line-of-sight, the resulting vertical "ladder" of decoys creates a continuous column of jamming. Any defender trying to track/shoot **through** that ladder is jammed across the whole altitude span, and the defender's HQ/track picture is saturated. Strike missiles fired through the ladder benefit from the jamming, making it geometrically very hard for the ground defender to acquire the inbound weapon/target.
- **Outputs / effects:** Persistent multi-altitude jamming corridor; degraded enemy detection/track; in the demo, **the SAM never fired a single shot** because the ladder jamming was so complete. Combine with offensive ECM (Growler) for added effect.
- **Edge cases / quirks:** Each decoy covers only its own altitude (see decoy-altitude rule above), which is **why** the ladder is needed. Weather / min-altitude can prevent releasing the lowest decoy — the aircraft may be below the decoy's release floor and must climb back up (e.g., to **12k**) to fire the last one. Active jamming decoys keep jamming after release; jamming does not guarantee no shot, it just degrades the firing solution.
- **Source:** Hj4gbSDi03w
- **Confidence:** High

### Offensive ECM (dedicated jammer aircraft support)
- **Models:** A dedicated jammer (EA-18G Growler) actively jamming enemy sensors to support a strike.
- **Inputs / parameters:** Jammer aircraft with ECM sensors toggled on (offensive ECM mode); position/altitude relative to the strike corridor; enemy radars being jammed.
- **Behavior / rules:** Turning on the Growler's sensors in offensive ECM mode adds jamming to the engagement, degrading enemy radar and making the strike more effective and safer. Used together with the decoy ladder to stack electronic-warfare effects over the target. The jammer is positioned in the "thick" of the corridor (**~20k ft** in demo).
- **Outputs / effects:** Enemy radars degraded/disabled; reduced enemy firing solutions; safer/more effective friendly shots.
- **Edge cases / quirks:** Effect is **additive** with decoy jamming and DECM (see §7); qualitative in this transcript — no numeric ECM value stated here.
- **Source:** Hj4gbSDi03w
- **Confidence:** Med

---

## 5. Active vs. Passive Sensing, Detection/ID Gating & A2A Seeker Behavior

### Radar (active) vs. passive (thermal/IR, ESM) sensing and emission-based detection
- **Models:** A unit can detect targets actively (own radar emits) or passively (thermal/IR sight, RWR/ESM picking up emissions), each with different range and stealth implications. Detection — including missile-launch warning — is fundamentally **information-based**: you only know what something can see/track.
- **Inputs / parameters:** Whether the unit's radar is ON or OFF; presence of an IR/thermal sight on the platform; whether the target is emitting (radar on) and at what range; third-party emitters (e.g., a ground radar) that can cue/track for someone else.
- **Behavior / rules:** With its own radar **ON**, a unit detects/tracks targets actively but also emits (and can itself be detected/HARMed). Turning the radar **OFF**, a unit can still see a target passively via a thermal/IR sight, though tracking quality degrades and the contact can be lost as range opens. Detection of an enemy is possible just from its **emissions** (e.g., a fire-control radar is identified as "air-to-air, medium range"), and target classification (fighter- vs. bomber-sized) is inferred partly from the range at which it was first picked up. Critically, **missile-launch warning is information-based**: an aircraft only "knows" a missile was fired at it if **something** can see/track the shooter — e.g., a friendly/own radar or a ground radar site tracking the launcher feeds that warning; with no such track, the targeted aircraft is oblivious to an inbound (enabling surprise long-range shots).
- **Outputs / effects:** Active radar = better track but emits; passive thermal = quieter detection but shorter/degrading range; emissions enable both ID/classification and launch warnings to third parties.
- **Edge cases / quirks:** A target can be tracked thermally with radar off but at much reduced effective range. A targeted aircraft may detect an inbound missile **only** because a separate radar site is illuminating/tracking the shooter — remove that radar and the warning disappears. Classification from first-detection range is approximate, not exact.
- **Source:** U_eBSdZMR6U
- **Confidence:** High

### Detection vs. Identification — separate sensor steps required to engage
- **Models:** A unit you can engage must be **both** identified (classified) **and** detected/tracked by a sensor with current line-of-sight; a friendly's prior ID does not by itself give you a firing solution.
- **Inputs / parameters:** Friendly sensor detections (own platform radar/EO); shared classification from other units (e.g., an F-35 ID); line-of-sight to the target; target track quality (precise vs. imprecise).
- **Behavior / rules:** An F-35 flying ahead "identified the targets" (classified the SAMs), but the attacking helicopter "still ha[s] to detect the targets in order to safely go ahead and engage them." Even knowing a SAM is "out there" from a buddy, without its own detection the helicopter "did not detect the SAM site... and without knowing where the SAM site is, we're kind of in trouble." **Track quality matters:** at one altitude the target is called "an imprecise target," improving as altitude/LOS improves. A laser designator can refine/maintain the track once some detection exists.
- **Outputs / effects:** Whether a fire-control solution exists; track precision (precise vs. imprecise) gating engagement; ability to allocate weapons.
- **Edge cases / quirks:** Identification by one unit propagates (shared picture) but does **not** substitute for the shooter's own sensor detection/LOS. Imprecise tracks may still allow some weapons (laser-guided) but not others. (Cueing a sensorless shooter is handled in §6.)
- **Source:** fT2Zbd5K6MY
- **Confidence:** High

### IR/thermal (passive) missile seeker behavior — "dumb" until it sees heat; tail-chases are inefficient
- **Models:** An IR-guided air-to-air missile (R-27T/ET) flies ballistically/straight ("dumb") until it acquires the target's heat/exhaust trail, then chases it; stern-chase geometry is inefficient.
- **Inputs / parameters:** Seeker type = thermal/IR (no radar lock needed); target heat signature/aspect (turning / afterburner lights it up); target speed and aspect (tail-on vs. beam); missile motor energy (extended-range ET has a bigger booster → higher speed, **~Mach 4** shown).
- **Behavior / rules:** An IR missile launched without a heat lock flies straight ("completely dumb"). As the target maneuvers/lights up (turn, afterburner exposing the exhaust trail), the IR seeker acquires and begins chasing it. IR missiles often must maneuver to get **behind** the target (the ET "has to go behind the target before it goes"), so engagement geometry matters. Tail chases are inefficient for any weapon: a stern-chase missile "putts along" and has a tough time catching a fast/afterburning target. The bigger ET booster gives high speed (**≈Mach 4**), which helps run a target down.
- **Outputs / effects:** Missile loft/track changes from straight-line to pursuit upon IR acquisition; PK drops in tail-chase geometry; high-energy motor improves catch-up.
- **Edge cases / quirks:** Radar-guided variants "don't care" about the heat trail (they track regardless). The **dual-launch tactic** pairs a radar (R) and a thermal (T) missile at the same target so that if one guidance mode works, the other is redundant. The IR seeker can lose or fail to acquire if the target never presents heat/aspect.
- **Source:** U_eBSdZMR6U
- **Confidence:** High

### Semi-active radar missile (SARH) requires the shooter to keep illuminating — "turn and you lose"
- **Models:** Non-active (semi-active radar homing) A2A missiles like the AIM-7 Sparrow and R-27R/ER need the launching aircraft to keep its nose/radar on the target to guide; turning away breaks guidance.
- **Inputs / parameters:** Weapon guidance type (SARH vs. active radar like AIM-54/AMRAAM); shooter heading / radar pointing; each side's weapon max range; range at the moment of launch.
- **Behavior / rules:** For SARH weapons the shooter must continue pointing/illuminating to guide the missile home. **Tactic:** get the enemy to turn around — especially **after** he has already fired — because once he turns tail-on he can no longer guide his own SARH missile and you get a "free shot." Range math drives the standoff: with your missile out-ranging his, you can fire while he is still out of range; if both are within range you "both get a free shot." Demo numbers: Sparrow **~38 mi** range, so "if I wait to 20 miles we both get a free shot"; the R-27 ER's extra **~5 mi** reach lets you shoot first from outside his envelope. Firing on an enemy frequently triggers him to panic/turn (defensive), which then defeats his own SARH shot.
- **Outputs / effects:** A SARH missile goes "stupid"/misses if the shooter stops illuminating (turns away); whoever can shoot from outside the other's range and force a turn wins.
- **Edge cases / quirks:** Active-radar missiles (AIM-54, AMRAAM) do **not** need continued illumination (exempt from this rule). Being too close removes the standoff advantage — in one run the player was "too close," the enemy's missile overshot, and the player got hit because he lacked the extra 5-mile margin. The AI will often auto-turn/evade once fired upon, which is exactly what defeats its own SARH weapon.
- **Source:** U_eBSdZMR6U
- **Confidence:** High

### Modular missile warhead / seeker / booster as PK and range drivers (R-27 family)
- **Models:** Interchangeable seeker (radar / IR / anti-radiation) and booster (standard vs. extended-range) modules on a common large-warhead body define each variant's range and behavior.
- **Inputs / parameters:** Seeker module (radar **R**, thermal **T**, anti-radiation **P**); booster module (standard vs. extended-range **"E"**); warhead mass; resulting max range; salvo / multi-target capability (Track-While-Scan).
- **Behavior / rules:** The R-27 shares one body with a large **39 kg** warhead (vs. AIM-7 **16 kg** and AIM-120 **7.7 kg** for comparison) and swappable front (seeker) and rear (booster) modules. Standard R/T models: max range **"up to 32 nautical miles"** (shown as ~30 mi engagement max). Extended-range E models (ER/ET/EP) add a much larger booster for more reach and higher speed (ET stepped to **≈Mach 4**). The Su-27 supports **Track-While-Scan** and can fire **4 missiles in one salvo**; the dual radar+thermal pairing per target is a deliberate redundancy tactic.
- **Outputs / effects:** Variant selection sets max range, speed, guidance mode, and surface-target legality; bigger warhead = more lethal per hit; E-booster = longer reach / faster.
- **Edge cases / quirks:** **Do NOT climb in a tail-chase:** if you climb to **~45,000 ft** the altitude difference to a lower target gets too large and the (long-range) shot won't reach. The anti-radiation **P** variant cannot engage surface targets (see §1). Standard versions are short-ranged (Sparrow-class); the long reach is only on the E models.
- **Source:** U_eBSdZMR6U
- **Confidence:** High

---

## 6. SAM Siting, Line-of-Sight, Arc & Cueing

### SAM placement vs. terrain / line-of-sight (Relief layer & LOS tool)
- **Models:** A SAM battery only engages what its radar/sensors can see by line-of-sight; terrain both creates coverage and creates blind spots.
- **Inputs / parameters:** Site location and elevation (use the **Relief layer** + **Line-of-Sight tool**); surrounding terrain (mountains/valleys); target altitude (LOS tool **"same altitude as observer"** toggle); the asset being defended.
- **Behavior / rules:** Place SAMs to actually cover the defended asset, not just sit centrally. Use the Relief layer to find high ground and the Line-of-Sight tool to visualize what the site can see. A site low in a valley sees only its immediate region; a site on a high hill (demo **~531 ft**) gets gorgeous seaward coverage. There is an explicit tradeoff: higher placement that sees the water blinds you behind/inland (the LOS tool shows you "can't see anything behind us"). The LOS tool has a toggle to assume the target is at the **same altitude as the observer** (vs. surface), and toggling it + refresh is computationally heavy (lags). **"There is no sweet spot"** — coverage of one threat axis sacrifices another, which is why important assets typically get **two** SAM sites.
- **Outputs / effects:** Effective detection/engagement footprint = LOS-limited area; high ground extends one axis while blinding the opposite; OpenTopoMap heights can be used to pick hilltops.
- **Edge cases / quirks:** Target-at-observer-altitude LOS refresh causes heavy client lag. A single perfectly seaward site leaves the inland sector totally blind. OpenTopoMap marks named hills with spot heights (e.g., **Black Hill 360, Divis 478**) usable for siting.
- **Source:** iZu53v0JmyM
- **Confidence:** High

### Line-of-sight reciprocity for SAM engagement — "if you can see it, it can see you"
- **Models:** Both the shooter and the SAM need unobstructed line-of-sight to engage; LOS is **symmetric**, so terrain that lets you target a SAM also lets the SAM target you.
- **Inputs / parameters:** Terrain profile between units (intervening hill heights); shooter altitude; target altitude.
- **Behavior / rules:** Repeatedly the helicopter "has no line of sight" to multiple SAM components while masked and cannot engage. To gain LOS it must rise; the moment LOS exists it is **mutual**: "this S400, if we can see the S400, they can see us." Specific terrain numbers given: helicopter at **1,060 ft**, target SAMs up on a hill at **1,135 ft**, intervening hill **1,283 ft** — "we're going to have to go up in order to engage them." Rising for LOS is called "your first mistake" because it triggers SAM engagement.
- **Outputs / effects:** Whether either side can fire; survival vs. being shot at.
- **Edge cases / quirks:** Beam geometry matters for some shooters — turning broadside ("put your beam to him") lets an SA-type SAM "hit you from the side." SAM weapons are "very very quick acting" — "if they see this helicopter, they will get a shot out" essentially immediately on gaining LOS. (Reaction-time math is detailed below; general reaction time in §7.)
- **Source:** fT2Zbd5K6MY
- **Confidence:** High

### Terrain / land-cover masking and minimum-altitude flight (helicopter NOE concealment)
- **Models:** Flying very low behind terrain and under vegetation breaks line-of-sight to enemy sensors, concealing a platform; concealment is gated by actual terrain elevation, object height, and aircraft AGL altitude.
- **Inputs / parameters:** Scenario setting **"advanced terrain type" must be ON**; ground elevation; terrain object "height" (e.g., trees); composite "skyline" value; aircraft altitude AGL; land-cover type (e.g., "mixed forest"). **Command stacking/order:** set speed to loiter → minimum altitude → terrain following → land-cover masking — "if you do that in that order, your helicopter will get itself as low as mechanically possible."
- **Behavior / rules:** With advanced terrain on, hovering over a point shows **elevation 1,247 ft, object height 16 ft, skyline 1,263 ft (1247+16=1263)** — trees provide a 16 ft masking layer. The helicopter flies **~20 ft AGL**; over 16 ft mixed forest that leaves **"4 ft of clearance underneath"** the rotor (the helicopter sits above the tree-height mask, so masking is imperfect). The platform automatically descends to the lowest mechanically feasible altitude given terrain following. To engage, the helicopter must climb (e.g., to **60 ft AGL minimum** to fire) to clear an intervening hill, which simultaneously exposes it ("if we can see the S400, they can see us"). **Tactic:** pop up just enough for LOS, fire, then "duck back behind the mountain as fast as you can."
- **Outputs / effects:** Whether enemy sensors hold LOS to the platform; whether the platform has LOS to fire; effective concealment vs. exposure.
- **Edge cases / quirks:** Masking only works where terrain supports it — "a lot harder to do over water... you can't do this over water, you're just going to get slapped out of the sky." Tree height (16 ft mixed forest) may be **less** than the helicopter's minimum achievable AGL (~20 ft), so masking is partial. Intervening hills block LOS in **both** directions (can't be seen, but also can't fire). "Minimum altitude" is "not as low as it sounds" mechanically.
- **Source:** fT2Zbd5K6MY
- **Confidence:** High

### Pop-up / terrain-masked attack vs. SAM (reaction-time exploit)
- **Models:** An attacker exploits intervening terrain and the SAM's reaction/flyout time so the SAM cannot get a missile off before being killed or before the attacker re-masks.
- **Inputs / parameters:** Distance from the nearest masking terrain to the SAM; assumed cruise-missile / attacker speed; SAM crew reaction time; attacker altitude relative to the masking ridge.
- **Behavior / rules:** The narrator gives explicit reaction-time math: terrain **~1.5 miles** away **≈ "15 seconds travel time for your average cruise missile"** — too little for the SAM to ever launch, so the SAM is "basically worthless / pointless" there. At **~2.5 miles ≈ "20 seconds"** a "very, very quick SAM crew might be able to get a missile off." Therefore a SAM tucked tight against terrain can be popped before it reacts. Conversely an attacker can hide just below a masking ridge (e.g., a **~1,000 ft** hill), stay in range, pop up only briefly, and dive back to minimum altitude to break LOS.
- **Outputs / effects:** Whether the SAM can fire at all is gated by **(distance-to-mask / closing speed) vs. crew reaction time**; too-tight terrain renders the SAM unable to shoot.
- **Edge cases / quirks:** "Average cruise missile" speed is the implied basis for the 1.5 mi→15 s and 2.5 mi→20 s figures (not stated as an exact m/s). A masking ridge **too close** to the SAM is a liability for the defender (no reaction time); slightly farther (downtown, ~2.5 mi) is better. (See §7 for the general SAM reaction-time rule.)
- **Source:** iZu53v0JmyM
- **Confidence:** High

### Range baiting and "launch at max range" doctrine (wasting SAM missiles)
- **Models:** A SAM with permissive ROE fires at low/maneuvering targets at max range; an attacker baits those shots then masks behind terrain so the missiles waste themselves on the ground.
- **Inputs / parameters:** SAM weapon-control / ROE settings (**"engage opportunities"**, **"launch at max range"**, proficiency e.g. **"Ace"**); target posture (must be **HOSTILE**); target altitude vs. nearby terrain height; target speed (loiter to look tempting); attacker auto-evade on/off; per-weapon max engagement range (editable, **Ctrl+F9** in demo).
- **Behavior / rules:** The observed SAM doctrine engages "at max range" against a "high maneuverability target." A baiting attacker descends to just above the masking terrain (e.g., **2,000–5,000 ft** over ~1,000 ft hills), slows to loiter to look like easy prey, gets the SAM to launch, then drops to minimum altitude so the ridge breaks LOS and the missile flies into the terrain — repeat to drain the whole magazine. **COUNTER (defender side):** cap the SAM's engagement range to **less** than the distance to the masking terrain (demo limited it to **"5 miles"** when nearest mountains were ~2.4–3 miles) so it only fires when the target is too close to duck behind terrain; also enable **"engage opportunities"** so it actually shoots. **Gating fact:** the SAM will **NOT** fire unless the target is marked **HOSTILE** (in the demo it sat idle for a long time purely because the contact was still "friendly").
- **Outputs / effects:** Permissive max-range ROE → wasted missiles on baited/masked targets; range-capped ROE → SAM only engages inside its "no-duck" bubble and lands hits; HOSTILE posture is required for any engagement.
- **Edge cases / quirks:** A target **too low** can be unhittable ("I think he's too low for us to hit"), so the attacker climbs slightly to stay engageable while baiting. **Auto-evade can be the wrong response** — in one run the AI auto-evaded a 5-mile shot when "it would have been safer to just die below" (i.e., descend/mask). A contact still "friendly" is never engaged regardless of geometry — the "world's most patient crew" was just an un-set posture. (See "exclusion zones" in §8 for the auto-hostile boundary mechanic.)
- **Source:** iZu53v0JmyM
- **Confidence:** High

### SAM radar arc / set orientation (fixed engagement sector)
- **Models:** Some SAM/ABM radars cover only a **fixed angular sector** set by the editor; they can see and engage only within that arc, with a dead zone behind.
- **Inputs / parameters:** System type (**S-400 is omnidirectional**/no arc issue; **Patriot, THAAD** have fixed arcs); the editor-set orientation/facing of the battery; expected threat azimuth.
- **Behavior / rules:** Directional systems (Patriot, THAAD) have a limited radar arc that is **also** the limited arc in which they can engage; there is a dead zone behind the facing. The scenario editor must point ("**Set orientation**") the battery toward the expected threat axis. Once oriented, the radar covers that sector and that sector is the only zone where it can engage. Orientation is set **in the editor** and (in gameplay) you "can't actually change this" afterward — where you point it at design time is where it stays.
- **Outputs / effects:** Engagement is constrained to the radar's facing sector; threats from the dead-zone/rear are not seen or engaged.
- **Edge cases / quirks:** **S-400 does NOT have this directional limitation** (treat as 360°). Misorienting a Patriot/THAAD leaves an exploitable blind rear arc. "Set orientation" is the editor control used to aim the arc.
- **Source:** iZu53v0JmyM
- **Confidence:** High

### SAM minimum engagement range (dead-zone exploit)
- **Models:** Long-range SAM systems (e.g., S-400) have a **minimum range** inside which they cannot engage; a platform that penetrates inside that radius is safe **from that system**.
- **Inputs / parameters:** Target platform's slant/horizontal range from the SAM; SAM system minimum-range parameter (per weapon).
- **Behavior / rules:** The helicopter survives at point-blank because "this platform has a minimum range that we managed to get ourselves inside of." Once inside, the S-400 "can't do much to us" even while the helicopter pounds it: "we're inside of the minimum range of the S400, so it can't do much to us." Getting inside requires flying low/masked to close distance without being engaged en route.
- **Outputs / effects:** Whether the SAM can launch at the close-in attacker (it cannot, inside min range).
- **Edge cases / quirks:** Min-range immunity is **per-system**: the S-400 cannot fire inside its min range, but a co-located **short-range system (Pantsir SA-22, or man-portable SA-16/SA-18)** can still engage the close-in attacker — "the Pantsir is jumping in," and a shoulder-launched SA-16 dooms the Apache at close range. **So penetrating inside one system's dead zone exposes you to shorter-range layers** (see §7 point-defense and §6 layered defense).
- **Source:** fT2Zbd5K6MY
- **Confidence:** High

### Sensor cueing / shared track between cooperating units
- **Models:** A unit with good sensors can detect/acquire a target and share that track, giving a poorly-sensored shooter a firing solution it couldn't get alone.
- **Inputs / parameters:** A sensor platform's detections; the shooter's lack of detection; data sharing between friendly units; a short hand-off/lock delay.
- **Behavior / rules:** The Tiger helicopter (no RFI sensor) cannot detect the SAM site alone. The operator brings in a Kiowa ("we just need sensors basically") as a cueing platform. Once the Kiowa "did a nice job of acquiring the other SAM," the Tiger "now actually has a shot" — "we actually acquired both SAMs." There is a fixed lock/engage delay after acquisition: "it takes us into two seconds before we can actually engage. So you will get two as well." (**~2-second delay** before firing on the newly cued target.)
- **Outputs / effects:** Shooter gains a firing solution on the cued target; **~2 s** arming/lock delay before launch.
- **Edge cases / quirks:** The cueing platform itself is vulnerable (the Kiowa would "be way too high up and basically get himself killed before the party even starts"). The **Apache Guardian's "RFI" sensor** is repeatedly cited as the key tech that lets one platform self-detect SAMs without external cueing; platforms lacking RFI need a cueing buddy. (Detection ≠ identification — see §5.)
- **Source:** fT2Zbd5K6MY
- **Confidence:** High

### Layered point/local defense of high-value SAM sites
- **Models:** Protecting a long-range SAM/ABM site (e.g., THAAD) with short-range SAMs, AAA, and observers to cover its blind zones and stop low/close penetrators.
- **Inputs / parameters:** Primary site type and its dead zone (e.g., THAAD rear arc); local-defense assets (NASAMS / short-range SAM; AAA like Linebacker / ZSU-23 "Zeus"; MANPADS / Stinger infantry); observation posts (generic observer facility); expected ingress route (valleys).
- **Behavior / rules:** Because a directional ABM/SAM site has a dead zone and is vulnerable to low/close attackers, add local defense: pop a short-range SAM (NASAMS, AMRAAM-armed truck) near it to cover the gap and surprise low penetrators; place AAA (Linebacker, ZSU) along likely ingress valleys to ambush aircraft flying the gap; set up observation posts on high ground to give visual coverage and make it harder to sneak up. Mixing system types makes the defended area much harder and more irritating to penetrate.
- **Outputs / effects:** Reduced blind-zone exposure; pop-up surprise engagements on low ingress; better early visual detection; attrition of the attacker even when the main system can't engage.
- **Edge cases / quirks:** Local-defense magazines are finite — AAA/NASAMS can run out of ammo (demo: "NAS Sams ran out of ammo"), after which the gap reopens. MANPADS/Stinger infantry are cheap, effective surprises. Observers/EO add detection **without** adding weapons.
- **Source:** iZu53v0JmyM
- **Confidence:** Med

---

## 7. IADS Modeling, Survivability & Point Defense

### Decoupling search radar from fire-control/launcher (separate-unit IADS modeling)
- **Models:** Modeling an IADS so the **search radar is a physically separate unit** from the missile launchers / fire-control, changing what an anti-radiation strike actually kills.
- **Inputs / parameters:** A composite SAM battery's sensor list (e.g., SA-2 has TV/optical, Fan Song E fire-control radar, Spoon Rest C search radar); editor ability to add/remove components and create dummy units; unit naming and the **"auto-detectable"** flag.
- **Behavior / rules:** In the editor you can split a battery's radar from its launchers: create a separate unit holding just the search radar (e.g., a Spoon Rest), remove that radar from the missile battery, and optionally rename the radar unit so it still reads as "SA-2" (or "SA-2 battery search radar") and set components **not auto-detectable**. **Effect on play:** a striker sees the emitting search-radar unit and fires a HARM at it. If the radar unit is named generically (just "SA-2"), the player assumes he killed the SAM — but he only destroyed the **search radar**; the launcher unit (the "business end" with the missiles) remains fully operable. However, with its search radar gone the launcher can no longer **see** targets (no LOS picture) unless given another sensor.
- **Outputs / effects:** HARM / anti-radiation hits the **search radar unit only**; launchers survive but go **blind**; track picture and engagement depend on whatever sensor the launcher still has.
- **Edge cases / quirks:** **Naming is a deception:** leaving it labeled plainly "SA-2" tricks the player into thinking the kill ended the threat. A blinded launcher can be restored to lethality by attaching an **independent sensor** — e.g., an optical/EO camera (LLTV) or a co-located observer/visual — letting it engage on visual even with no radar (in the demo, a generic LLTV gave it the ability to spot and engage a hostile). **Spotting the target visually is enough to take the shot.**
- **Source:** iZu53v0JmyM
- **Confidence:** High

### SAM battery is a multi-component target — partial hits do not kill it
- **Models:** A SAM battery (e.g., S-400) is composed of separate components (radar, multiple launchers, point-defense); destroying some launchers leaves the battery operational until the radar / critical nodes are killed.
- **Inputs / parameters:** Per-component health (Nebo-M radar, **12 launchers**, Pantsir / "Greyhound", individual TELs); number/placement of hits.
- **Behavior / rules:** A B-52 salvo of stealth cruise missiles (**allocated 6** to the S-400 plus extras) scores **5+ hits** yet "we did not destroy the S400... I don't even think we got the radar." Losses & Expenditures shows only "**two of the launchers**" destroyed, so "this S400 battery is completely operable." **The radar must be killed** to neutralize the battery ("we might as well get the radar too"). Reinforces the close-in finding: hitting an S-400 once does little — "an S400, if you just hit it, nothing happens" — because there are "plenty of things" in the battery still firing; saturation / sharing across multiple shooters is needed.
- **Outputs / effects:** Per-component destruction; the battery stays operational/firing until the radar **and** enough launchers are gone.
- **Edge cases / quirks:** Even a heavy, expensive precision salvo can be a poor exchange if it misses the radar / right components ("all that money... was a big waste"). **Component targeting matters more than raw number of hits.** Stealth cruise missiles stay un-engaged until "on the other side of the horizon" the SAM gains LOS (radio-horizon gating again — see §3 / §6).
- **Source:** gLJQE8FhdJw, fT2Zbd5K6MY
- **Confidence:** High

### Per-engagement hit-probability resolution (percentile roll, roll-under to hit)
- **Models:** Every weapon shot is resolved by comparing a computed hit chance to a **percentile (d100) roll**; **lower rolls hit** (must roll at/under the chance).
- **Inputs / parameters:** Computed per-shot hit chance (depends on geometry, energy, target maneuver, countermeasures); a percentile (d100) roll; shooter type (e.g., SA-7 MANPADS).
- **Behavior / rules:** Each shot has a stated hit chance and a roll; the result hits only if the roll is at/under the chance. Demo: an **SA-7** (shoulder-launched) had a **"1% chance to hit"** a wind-corrected munitions dispenser and **"rolled a 74" → MISS** (74 > 1). This is the same percentile / roll-under mechanic used by countermeasures (below). Energy-depleted or geometrically bad shots (e.g., a SAM that "ran out of energy" in a tail chase) effectively fail to connect.
- **Outputs / effects:** Hit or miss per shot, logged with the chance and the rolled number.
- **Edge cases / quirks:** Very low-PK shots (1%) are essentially attrition gambles. Tail-chase / energy-depleted missiles lose the engagement even without a formal "miss" if they run out of energy before reaching the target.
- **Source:** WV4w-TJdBoo
- **Confidence:** High

### Automatic, prioritized countermeasure ladder with simultaneous per-tool dice rolls
- **Models:** When a weapon is incoming, the platform's defensive aids (TOAD/towed decoy, chaff, flare, DECM) fire **automatically**; each tool independently rolls to defeat the seeker, and all tools resolve **simultaneously** per incoming weapon.
- **Inputs / parameters:** Per-tool success probability vs. the incoming seeker type (e.g., **ALE-50 TOAD ~40%** vs. the SAM seeker; chaff a "really good chance" vs. SA-2); a random **d100 roll per tool** (lower = better — must roll **under** the chance); number of incoming weapons; whether the pilot is set to deploy defenses; seeker quality vs. countermeasure modernity.
- **Behavior / rules:** Countermeasures are handled **automatically** by the (simulated) pilot at the right moment — no manual "press chaff" for normal use. Against an inbound missile the tools are tried as a ladder **and** resolve simultaneously: first the **ALE-50 towed decoy (TOAD)** attempts to "seduce" the missile (demo: **~40% chance**; it **"rolled an 81" → FAIL** because 81 > 40); then **generic chaff** rolls (demo: **SUCCESS** — caused the missile to lose its target and miss; "SA-2 is garbage against modern chaff"). Each incoming missile is scored **separately**: the log shows missile #1 = TOAD/RT fail + chaff success, missile #2 = TOAD/RT fail + chaff success, so **both** miss ("all seekers were spoofed, missed target"). The apparent "second try" of the decoy in the log is actually its roll against the **second** missile, not a re-roll on the first — because events resolve simultaneously per weapon.
- **Outputs / effects:** Per incoming weapon, a per-tool success/fail; **if any tool succeeds the weapon is spoofed and misses** (message "all seekers were spoofed, missed target"); the contact vanishes; finite countermeasure stores are consumed.
- **Edge cases / quirks:** Roll is read as percentile where **SUCCESS requires rolling UNDER the listed chance** (40% chance, rolled 81 = fail). Tools resolve simultaneously, so logs can look like duplicate / second shots when they are really separate rolls against separate missiles. Effectiveness depends on seeker modernity: the old SA-2 seeker is very vulnerable to modern chaff; against a more modern weapon the same chaff/decoy chance would be lower. Continuous-stream chaff **can** be manually laid (covered elsewhere), but the per-missile reaction is automatic.
- **Source:** WV4w-TJdBoo
- **Confidence:** High

### DECM/OECM as a direct subtraction from hit chance (radar weapons & torpedoes)
- **Models:** Defensive/offensive ECM and decoy systems **reduce a weapon's probability of hit by a value subtracted directly** at the moment of impact/engagement, applied automatically.
- **Inputs / parameters:** The weapon's base hit chance; the defending platform's DECM/OECM value and correct wavelength match; decoy success probability vs. target domain (e.g., **torpedo decoy 20%** vs. a subsurface target); the attacking weapon's modernity vs. the countermeasure.
- **Behavior / rules:** Defensive ECM is "subtracted directly from the attack" — i.e., it lowers the incoming weapon's hit probability rather than being a separate evade roll, and it is applied automatically. With correct-wavelength OECM/DECM it is even possible to **block radars from ever detecting the platform** (wavelength-dependent). The **same subtract-on-hit model applies to torpedoes**: a torpedo decoy is "subtracted as the torpedo hits" (automatic, no special activation). Stated decoy value: the submarine's torpedo decoy has a **20% chance** of succeeding against a subsurface (sub) target.
- **Outputs / effects:** Reduced effective hit probability for the incoming weapon (radar missile or torpedo); possible total detection denial with matched-wavelength ECM; automatic application at engagement/impact.
- **Edge cases / quirks:** Wavelength must match for ECM to block detection. Decoy/ECM effectiveness assumes the threat is **not** a more modern version of the weapon — against a more modern seeker the listed chance drops. The torpedo decoy is always automatic ("never special activation"), contrasting with manual systems in other sims. (Additive with offensive ECM and decoy jamming — see §4.)
- **Source:** WV4w-TJdBoo
- **Confidence:** High

### SAM system reaction/engagement time
- **Models:** Air-defense systems have a finite reaction time from detection to launch.
- **Inputs / parameters:** Time from target detection (LOS gained) to first missile launch.
- **Behavior / rules:** Qualitative only: a missile seen mid-flight "was launched when I first set up the mission. That just gives you an idea of the engagement time of the system" — i.e., there is a measurable lag between threat appearance and SAM launch. Elsewhere the same class of system is described as "very very quick acting" once it has LOS. **No numeric reaction time stated.**
- **Outputs / effects:** Delay before the SAM's first launch after acquiring a target.
- **Edge cases / quirks:** Reaction is fast but non-zero; combined with the close-in / low-flight tactics, this brief reaction window is what makes pop-up-and-duck and terrain dashes survivable. No exact seconds given — qualitative. (The reaction-time *exploit math* — 1.5 mi ≈ 15 s, 2.5 mi ≈ 20 s — is in §6.)
- **Source:** gLJQE8FhdJw, fT2Zbd5K6MY
- **Confidence:** Low

### Weapon travel time vs. SAM intercept (close-in firing + point-defense intercept of incoming missiles)
- **Models:** Firing from very close minimizes weapon flight time so the target / point-defenses have less time to react or intercept; conversely, SAM point-defense guns **can** shoot down incoming missiles given enough flight time.
- **Inputs / parameters:** Launch range to target; weapon speed; target point-defense capability (e.g., **Pantsir 30 mm** gun); incoming-missile track.
- **Behavior / rules:** Rationale for closing in: "we need to get so close that when we fire, the travel time of our weapons is basically minimum." Demonstrated: when missiles are "lobbed over a hill" from farther out, the Pantsir "who now knows there's incoming missiles" engages them "with its 30 mm" and "slap[s] those out of the sky" — point-defense can defeat slower / longer-flight incoming weapons. Very fast weapons (e.g., the new spike-type missile: "a very, very fast weapon... really big charge... really good seeker") and short flight times reduce successful interception.
- **Outputs / effects:** Whether incoming weapons survive to impact; probability of point-defense intercept.
- **Edge cases / quirks:** The same Pantsir keeps shooting down salvos until it runs out of interceptors/ammo. Hitting an S-400 once does not kill it: "an S400, if you just hit it, nothing happens" — there are "plenty of things" in the battery still firing (see multi-component rule above). Saturation / sharing across multiple shooters is needed.
- **Source:** fT2Zbd5K6MY
- **Confidence:** High

### Point-defense / C-RAM ineffective against mortar rounds
- **Models:** Counter-Rocket-Artillery-Mortar interception struggles against **mortar shells**; mortars can defeat SAM point-defense that swats missiles.
- **Inputs / parameters:** Incoming projectile type (**120 mm mortar** vs. missile); defender C-RAM capability.
- **Behavior / rules:** Marines drop 120 mm mortars on the S-400 from inside artillery range; "the mortar shells are very, very, very challenging for non-CRAM artillery to do anything about," and the shells "just do their thing," destroying the battery. The operator notes the sim's evolving model: first "there's no CRAM yet... that's actually much in our favor," then corrects "we do have CRAM now, but it's a little different." **Net:** mortar fire bypasses the air-defense interception that stopped cruise missiles in the same video, killing "millions... of dollars worth of equipment" for **~42 mortar shells (≈$500 each ≈ $21,000)** vs. a million-dollar system.
- **Outputs / effects:** Target destroyed by indirect fire; massively favorable cost exchange.
- **Edge cases / quirks:** The Pantsir's 30 mm readily intercepts missiles (above), but mortars are a hard intercept problem — **projectile type drives interceptability**. C-RAM modeling is stated to be in flux across CMO versions.
- **Source:** gLJQE8FhdJw
- **Confidence:** Med

---

## 8. Engagement Gating, Weapon Constraints & Ground Insertion (EW/IADS-relevant)

### Exclusion zones — auto-mark violators hostile / trigger engagement
- **Models:** A scenario-defined exclusion zone declares that any unit crossing its boundary is marked hostile (and may be shot), letting designers control when the engagement "party" starts.
- **Inputs / parameters:** A drawn zone designated as an exclusion zone with a rule ("shoot anything here / mark violators as hostile"); the zone must be **validated and SAVED**; crossing units' positions.
- **Behavior / rules:**
  1. Create a zone and set it as an exclusion zone with the action **"mark violators as hostile."**
  2. **Validate and SAVE** (explicitly required).
  3. At runtime: contacts stay "unknown" until they cross the line; "as soon as they cross that, they started getting engaged," and each successive unit that crosses is engaged in turn.
  4. This gives strikers time to launch all decoys and set up before fire begins, producing a controlled engagement instead of either total passivity (tight ROE) or chaos (weapons-free).
- **Outputs / effects:** Units crossing the zone are auto-marked hostile and engaged; engagement timing is gated on the boundary crossing.
- **Edge cases / quirks:** Must remember to hit **Save** or the zone won't apply; this overrides / works alongside the side ROE to localize where firing is allowed; designers use it to make decoys viable and pace the fight (mainly needed when civilian units are present). (Connects to the HOSTILE-posture gating in the range-baiting rule, §6.)
- **Source:** trL6M6PdnMM
- **Confidence:** High

### Old/legacy cruise-missile single-altitude flight + terrain collision
- **Models:** Older cruise missiles fly at **one fixed altitude** and cannot terrain-follow, so intervening terrain can block or kill the shot.
- **Inputs / parameters:** Missile type (older cruise missile that flies "only one altitude"); terrain/relief between launcher and target; the **"ASCM terrain following restrictions"** scenario option (referenced); target geometry (mountains in the path).
- **Behavior / rules:** Older cruise missiles fly at a single altitude and do not climb over terrain. If mountains lie between launcher and target, the auto-fire solution is **BLOCKED** — the engagement is disallowed ("cannot fire"). The operator can force a manual shot (**Ctrl+F1**) to override and fire anyway, but the missile will normally slam into the intervening terrain and never reach the target on the far side. Re-positioning the launcher so there is a clear (no-terrain) line lets the shot proceed normally.
- **Outputs / effects:** Auto engagement is refused when terrain blocks; forced shots impact terrain (or, if terrain is too low, overfly it); a clear line allows a valid shot.
- **Edge cases / quirks:** If the intervening mountains aren't tall enough, a forced missile can "overshoot" / cruise over them and survive. The single-altitude limit is specific to **older** cruise missiles; modern ones terrain-follow. A separate scenario toggle "ASCM terrain following restrictions" governs this class of behavior.
- **Source:** tKndAfw6m34
- **Confidence:** Med

### Stealth / RCS is a finite value, not binary invisibility
- **Models:** Low observability reduces detection range but does **not** make a platform invisible; against powerful radars (S-400) stealth is insufficient without jamming.
- **Inputs / parameters:** Platform stealth/RCS value; enemy radar strength; platform speed.
- **Behavior / rules:** F-35 stealth "does not work against an S400 unless you have a lot of jamming capability" — the F-35's standoff JASSM-type missiles get intercepted **~26 mi** out and the jet would be shot down if it closed. The RAH-66 "Comanche" is the stealthiest helicopter but "it doesn't mean it's a stealth helicopter" — its total stealth capability is "about as good as an F-35," just slower-moving, which "helps out a bit." **Stealth lowers but does not eliminate detection;** low speed plus terrain masking compensates.
- **Outputs / effects:** Effective enemy detection range against the platform.
- **Edge cases / quirks:** Slow speed is treated as **additive** to survivability when combined with terrain masking (§6). Jamming can extend stealth effectiveness against high-end radars (§4).
- **Source:** fT2Zbd5K6MY
- **Confidence:** Med

### Mandatory data-link weapons
- **Models:** Certain weapons require an active **data-link** (mid-course guidance) to be allocated/fired; without it the engagement is blocked.
- **Inputs / parameters:** Weapon's data-link requirement flag; presence of a configured data-link channel/source.
- **Behavior / rules:** Attempting to fire a long-range missile from the Beijing helicopter, the operator hits **"mandatory data link... Oh, no. We missed our mandatory data link. Whoopsies. Let me fix that."** He must configure/select the data link before the salvo can launch. Once set, the large salvo (**8 per target, up to 16**) fires.
- **Outputs / effects:** Whether the weapon can be allocated/launched.
- **Edge cases / quirks:** Distinct from fire-and-forget weapons in the same video ("spike and loss... basically a fire and forget weapon") which need no data link. Some platforms also require explicit authorization to use guns ("we have to tell them to actually be allowed to use guns") before the cannon will fire.
- **Source:** fT2Zbd5K6MY
- **Confidence:** Med

### Cannon (aerial weapon system) accuracy and range model
- **Models:** Helicopter cannons are modeled as short-range, low-accuracy "aerial weapon systems" requiring extreme close range.
- **Inputs / parameters:** Cannon type (e.g., M230 ~25/30 mm AWS); horizontal distance to target; firing authorization.
- **Behavior / rules:** The Apache's cannon is "an aerial weapon system, meaning it's not accurate," with a range of "on a good day 20 ft" (verbatim, clearly exaggerated/qualitative) — to use it the operator must "get within 6" (nautical miles, garbled) and ultimately "point blank range." A missile fired point-blank can also miss ("you missed, you had one job"). Firing requires guns to be enabled.
- **Outputs / effects:** Hit/miss at very close range; whether the cannon is in range.
- **Edge cases / quirks:** Numbers are spoken loosely (the "20 ft" / "within 6" figures are **unreliable** from the auto-caption); treat the cannon as short-range, low-PK qualitatively. Closing to gun range against any air-defense system is "the stupidest thing you can do."
- **Source:** fT2Zbd5K6MY
- **Confidence:** Low

### Ground-unit / mortar engagement range and movement to firing position
- **Models:** Indirect-fire ground units must close to **within their weapon's max range** of the target before they can fire; they must physically move there.
- **Inputs / parameters:** Weapon max range (**120 mm mortar shown as ~3.5 nautical miles**); unit ground speed; distance to target.
- **Behavior / rules:** After air-dropping the mortar crew by cargo helicopter, they are "completely out of range." The operator measures the needed range: first says "within five nautical miles," **corrects to "three and a half nautical miles,"** then orders the crew to road-march ("hoof it") to a firing point inside that radius. Movement takes significant time ("not exactly a quick hoofing"). Once in range, the crew halts and fires.
- **Outputs / effects:** Whether the indirect-fire unit can engage; time-to-position.
- **Edge cases / quirks:** Range figure stated then corrected (**5 → 3.5 nm**) — treat **~3.5 nm** as the 120 mm mortar engagement range from this clip. Ground movement is slow and is itself a survivability window. (Pairs with the cargo-unload slope gate below.)
- **Source:** gLJQE8FhdJw
- **Confidence:** Med

### Cargo unload requires sufficiently flat ground
- **Models:** Air-droppable / cargo units can only be unloaded onto terrain that is flat enough; otherwise the drop is refused.
- **Inputs / parameters:** Local ground slope at the drop point; cargo type.
- **Behavior / rules:** Unloading a mortar team from a cargo helicopter: "be very patient when it comes to unloading cargo. If it doesn't find that exact spot on the ground that's precisely flat **within 2 and 1/2 degrees**, it refuses to drop the cargo." The unload takes "a hot second" until a slope **≤ 2.5°** spot is found.
- **Outputs / effects:** Whether/when cargo (e.g., a ground combat team) is deployed to the map.
- **Edge cases / quirks:** Verbatim threshold: flat **"within 2 and 1/2 degrees."** This is a terrain-slope gate on deploying air-landed / air-dropped ground forces — relevant to inserting SEAD/EW ground teams (e.g., the mortar crew that kills the S-400 in §7).
- **Source:** gLJQE8FhdJw
- **Confidence:** Med
