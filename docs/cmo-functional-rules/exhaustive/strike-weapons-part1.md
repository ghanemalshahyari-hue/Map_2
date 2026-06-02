# CMO Functional Rules — Strike & Weapons — Part 1/3 (Exhaustive)

**Scope.** This is **Part 1 of 3** for the *Command: Modern Operations* **Strike & Weapons** bucket.
It covers, exhaustively: **naval mine warfare** (fuse/trigger types, depth class, transit-speed
effect, arming delay, laying methods, quick-strike air mines, detection, clearing/sweeping);
**coordinated anti-ship strike planning** (time-on-target salvo math, reference-point firing
waypoints, beaming/pincer geometry, terrain-masked cruise-missile runs, missile detection by cruise
altitude); **stealth & detectability** (aspect-dependent RCS, external-stores signature, radar
wavelength-band trade-offs, belly aspect, stand-in jamming, anti-stealth radar factors); **unguided
bombing** (bomb-sight tiers, attack/release altitude gates, damage-vs-armor/penetration model, yield
tradeoffs, WRA salvo discipline, retarded/cluster bombs, attack-axis geometry on linear & point
targets, ship directional armor, bomb-stick patterning); **guidance taxonomy** (LGB / GPS-INS /
command / passive / laser-JDAM bombs, and IR / SARH / ARH / CEC air-to-air missile guidance);
**naval point defense & saturation** (guns, CIWS, SARH/active short-range missiles, long-range SAM
used for missile defense, defensive laser, the published missile-defense rating, defeating detection,
oversaturation); **ballistic-missile attack & defense** (trajectory physics, interceptor engagement
gates, overshoot, phase intercept, MIRV split, pre-split mid-course intercept, nuclear ABMs, ROE
salvo discipline, attacker saturation doctrine, the effective-speed/time-on-target model, motor
burnout & energy bleed); **EMP weapons** (omnidirectional vs directional, fall-short offset,
susceptibility by modernity & power state, range/line-of-sight, nuclear EMP-vs-blast, comms
disruption, offset-detonation trick); **SEAD/DEAD & strike flight planning** (per-waypoint flight-plan
editing, automatic-mode requirement, target-ID gating, anti-radiation/radiating gate, SEAD-vs-DEAD
loadout economy, terrain masking, WRA-range/vertical-drop trick, manual afterburner, slow-VTOL
standoff, beaming a tracking radar); and **hypersonic & advanced strike** (HGV flight profile &
energy-bleed vulnerability, lofted ballistic re-entry, radar-horizon/curvature masking, anti-ballistic
interceptor engagement geometry, low-observable subsonic cruise-missile penetration).

**This file is exhaustive for the rules assigned to Part 1.** It is the merged, de-duplicated union of
90 raw caption extractions for this slice of the bucket. Near-identical mechanics seen in multiple
videos have been merged into a single rule that keeps the richest wording and cites **all**
contributing `source_video_id`s. Sibling files **Part 2/3** and **Part 3/3** cover the remaining
Strike & Weapons rules.

**General damage/Pk/armor authorities.** This part is the home of the *general* hit-probability,
penetration/armor/damage, degradation/mission-kill, point-defense, range/altitude, and special-weapon
authorities for the Strike & Weapons bucket; the relevant ones are stated self-contained below — the
**altitude-vs-accuracy resolution conditioned on bomb-sight tier** (§4), the **HE ≈80% light-armor
reduction / divide-to-kill** formula and the **damage-points × through-armor-fraction** model (§4),
the **probability-to-hit / Pht modifier chain** and **half-range rule** (§6), **ship directional
belt-vs-deck armor** (§5), the per-layer **point-defense Pk ladder** (§6), the published
**missile-defense rating** (§6), the **DLZ/min-release-altitude "won't drop"** gates (§4, §10), the
guidance/loadout **gating taxonomy** (§8), and **EMP electronics-only damage** (§11).

**Caveat.** Transcripts are YouTube **auto-generated captions** — unit names, weapon designations, and
especially numbers may carry transcription errors. Stated numbers are captured **verbatim** and are
almost always *single-engagement illustrations from one database unit*, **not** documented formulas or
constants — treat exact percentages and counts as examples. Several key parameters (notably a weapon's
**penetration value**) are explicitly **hidden/obfuscated** in the player-visible database. Confidence
tags reflect how directly the rule was demonstrated.

---

## 1. Naval mine warfare

### Naval mine fuse / trigger types
- **Models:** how a mine decides to detonate based on the sensor/fuse it carries.
- **Inputs / parameters:** fuse type carried by the mine; target's acoustic signature
  (broadband/narrowband), pressure displacement, magnetic field, seismic vibration, physical contact,
  remote command, target IFF/team.
- **Behavior / rules:** each mine carries **one** fuse type that defines its trigger logic.
  - **Narrowband (acoustic) fuse:** listens for **specific** frequencies; more discriminating (a whale
    is less likely to set it off).
  - **Broadband (acoustic) fuse:** listens on a hydrophone and detonates the moment it hears **any**
    noise go by — everything sets these off (e.g. a 4-blade propeller or a generator). Some modern
    mines can identify what they are listening to.
  - **Pressure fuse:** triggered by the pressure change / displacement (weight) of a passing vessel —
    biased toward **bigger** targets; smaller things are less likely to set them off.
  - **Remote-controlled:** detonate on operator button press.
  - **Seismic fuse:** detects vibrations through the water (behaves much like acoustic). A variant
    **with target discrimination** detects the same way but knows whose team the target is on.
  - **Magnetic fuse:** detects the magnetic field of a passing ship (the classic WW2 spiky-ball type) —
    **easy to clear**. A **magnetometer** is an improved version of the magnetic fuse.
  - **Contact fuse:** must physically bump into it to set it off (spiky ball on a chain, surface or
    underwater).
- **Outputs / effects:** mine detonates (large below-the-waterline damage) when its specific trigger
  condition is met; otherwise stays inert. Target discrimination prevents detonation on friendlies.
- **Edge cases / quirks:** mines have very little target discrimination by default ("they go off when
  anything loud gets near them"). Contact fuses are described as "never gonna get hit" unless you
  saturate the water with them. Magnetic mines are easy to clear.
- **Source:** Bdjz8HohxOY
- **Confidence:** High

### Naval mine depth class (where the mine sits in the water)
- **Models:** vertical placement of a mine determines what it can reach and how it attacks.
- **Inputs / parameters:** mine depth class (bottom, floating, moored, rising, capped/CAPTOR); local
  water depth.
- **Behavior / rules:**
  - **Bottom mine:** sits on the seabed; in very deep water it can only reach a **submarine** (cannot
    reach surface ships).
  - **Floating mine:** sits on the surface, can be placed anywhere/anytime, and can be
    engaged/destroyed with machine guns (a contact-floating type).
  - **Moored mine:** tethered, sits barely under the water ("only six feet under") — nasty but
    relatively easy to sweep, and **detectable sooner/better than bottom mines**.
  - **Rising mine** (narrow-band produced): sits on the bottom like a bottom mine but, when triggered,
    shoots to the surface and then explodes.
  - **CAPTOR / "capped" mine:** a **torpedo inside a mine** — when it detects a certain frequency it
    releases a torpedo that attacks the first target it sees.
- **Outputs / effects:** determines reachable target set (sub-only vs surface), detectability,
  sweepability, and attack profile (direct blast vs rising vs torpedo release).
- **Edge cases / quirks:** a bottom mine in deep water (example given: ~102 ft) may only "nick" a
  passing ship rather than score a direct hit because the explosion must travel up through the water
  column; quick-strike bottom mines in shallow water (~46 ft) are "dynamite." Moored mines are detected
  sooner and better than bottom mines.
- **Source:** Bdjz8HohxOY
- **Confidence:** High

### Mine effectiveness vs transit speed
- **Models:** how fast a ship moves through a minefield changes how much damage it takes.
- **Inputs / parameters:** ship transit speed through the field; mine trigger range/sensitivity.
- **Behavior / rules:** a mine fires when the target is essentially right on top of it. A ship moving
  at **full speed** sets mines off **early** (its loud signature is detected from farther out / it
  trips them before it is directly over them), causing detonations at a distance and therefore **little
  to no damage** to itself. A ship moving **slowly (creep)** has to be almost directly on top of a mine
  for it to go off, so detonations occur at point-blank range and inflict far more damage. Therefore
  "the speed at which you transit the minefield will dictate how effective the mines are going to be."
- **Outputs / effects:** faster transit ⇒ more (early) detonations but much less self-damage; slower
  transit ⇒ fewer/late detonations at close range causing severe damage.
- **Edge cases / quirks:** demonstrated — a full-speed ship cleared the field taking barely any damage
  while tripping mines "left and right"; a creeping ship passed within ~six inches of a mine without
  triggering it until almost on top. A carrier (larger signature) sets mines off quicker.
- **Source:** Bdjz8HohxOY
- **Confidence:** Med

### Mine arming delay
- **Models:** time between a mine entering the water and its fuse going live.
- **Inputs / parameters:** operator-set arming-delay timer in the mining mission.
- **Behavior / rules:** when mines are laid there is a **mine arming delay** — a countdown from when
  the mine is dropped in the water to when its fuse arms. The operator sets this in the mining mission.
  While the timer runs the mine is inert (shown per-mine, e.g. a dropped mine read "won't go active for
  another hour and 32 minutes"). Guidance: if you expect enemies the next day, set a solid **2–3 hour**
  timer; a **10-minute** timer is dangerous ("bad things are gonna happen") because the laying vessel
  is still nearby and will drive over its own (now-armed) mines.
- **Outputs / effects:** mine becomes live (capable of triggering) only after the delay elapses; gives
  the laying platform time to clear the area.
- **Edge cases / quirks:** the laying ship will drive over its own freshly-dropped mines; a short delay
  causes self-detonation. Aircraft-laid mines shown with a **2-minute** mission delay to get all
  aircraft airborne at once.
- **Source:** Bdjz8HohxOY
- **Confidence:** High

### Mine laying methods (platform & loadout requirements)
- **Models:** how mines are placed into the world — editor minefield vs ship/sub vs aircraft mission.
- **Inputs / parameters:** mission-editor minefield (depth, fuse type, area size, count) **or** a
  platform's magazine loaded with a mine magazine / specific mine weapon record; mining-mission area
  (reference points); flight size / single-vessel settings.
- **Behavior / rules:** four ways to lay:
  1. **Mission-editor minefield:** pick fuse type and depth; the field is constrained by water depth
     (editor showed ~100 ft) and area (a ~50 sq mi zone needs a large count to be effective; example
     yielded ~41 mines per add — click again for more).
  2. **Ships/subs:** **no ship in CMO carries mines by default** — not even submarines (historically
     the most popular minelayers). You must add a **mine magazine** (generic gives **80** old-school
     contact mines) or a specific mine weapon record (narrowband, remote, pressure, magnetic, contact,
     etc., in varying counts), set the magazine to "lay in all directions," then assign the platform to
     a mining mission and it lays automatically along its track.
  3. **Aircraft** (the most popular method): assign to a mining mission; a tighter mission area ⇒ mines
     land closer to where you want.
  4. **Editor placement** (direct).
  Ships/subs **cannot use a bearing point** for mines — they must use a mine-line mission.
- **Outputs / effects:** a field of mines is laid across the assigned area; loadout count and area size
  determine density.
- **Edge cases / quirks:** realism note — a Kilo would carry far fewer than 80 mines (≈ a quarter or
  less). For realism, load mines into the platform's own **class magazine** rather than mounting a
  generic one. Tighter mission area = better placement accuracy. Submarines surface (periscope depth)
  to lay.
- **Source:** Bdjz8HohxOY
- **Confidence:** High

### Quick-strike (air-dropped) mines & launch-altitude matching
- **Models:** air-delivered bomb-bodied mines and the requirement to match the weapon's launch
  envelope.
- **Inputs / parameters:** aircraft transit altitude and **station altitude**; the mine's required
  launch altitude; flight formation (single aircraft vs rows/comb).
- **Behavior / rules:** quick-strike mines are literally a bomb with a mine fuse, dumped unceremoniously
  into the water (e.g. **Mk 83 quick strike**). For an aircraft to drop a mine, its **station altitude**
  (and the relevant transit altitude) must **agree** with the weapon's required launch altitude — if a
  mine has a **4,000 ft** launch altitude you must be at 4,000 ft to drop it. Ideal would be high
  transit altitude (e.g. **36,000 ft**) to arrive sooner, then drop station altitude to 4,000 ft, but
  matching both can be awkward on a large bomber. Aircraft can be set to single-aircraft or **rows**
  (rows approach in a comb shape).
- **Outputs / effects:** mines are laid only when the aircraft is within the weapon's launch envelope;
  a dense field results quickly.
- **Edge cases / quirks:** quick-strike mines sit on the bottom, so they are very hard to detect by
  sonar; devastating in shallow water (~46 ft). **Older mine-clearing sets cannot sweep quick-strikes.**
- **Source:** Bdjz8HohxOY
- **Confidence:** Med

### Mine detection (sonar wavelength & platform)
- **Models:** how mines are found before they are hit.
- **Inputs / parameters:** active sonar frequency (high-frequency mine-hunting sonar vs general active
  sonar); platform type (submarine, surface combatant, MCM vessel, helicopter dipping sonar); mine
  depth class; own-ship speed.
- **Behavior / rules:** the easiest detection is hitting one. Active sonar is precise but reveals own
  position. **High-frequency sonar** attenuates so quickly it is effectively useless at range **but
  cannot be counter-detected**, making it ideal for mine hunting; a quiet, sophisticated submarine with
  high-frequency sonar can detect bottom mines (e.g. quick-strikes on the seabed) and is itself quiet
  enough to be **less likely to trigger** them. **Bottom mines** are hard to detect; **moored mines**
  can be detected sooner and better. Slow speed aids detection of bottom mines.
  Helicopters/MCM vessels use a special mine-detection sonar.
- **Outputs / effects:** mines become known contacts (can then be cleared); active sonar may also
  accidentally set a mine off.
- **Edge cases / quirks:** even with sonar a detecting platform can still set a mine off (a sub "broke"
  and set one off while hunting). Mines sitting on the bottom in deep water are the hardest to detect.
- **Source:** Bdjz8HohxOY
- **Confidence:** Med

### Mine clearing / sweeping (MCM vessel & helicopter)
- **Models:** how mines are physically removed, and the self-damage that entails.
- **Inputs / parameters:** clearing platform (MCM vessel or mine-countermeasures helicopter, e.g. Sea
  Dragon); clearing gear behind the platform (towed wire/sled); mine-clearing mission area;
  mission/WRA return-to-base damage thresholds; sweepable vs unsweepable mine type; matching the
  clearing method to the mine type.
- **Behavior / rules:** set up a mine-clearing mission; keep the area **as small as possible** (a tight
  corridor). The clearing method **must match** the mine type. A helicopter dangles a wire/sled behind
  it that defines a clearing zone; when it bumps a mine it auto-clears it. A surface minesweeper
  (typically lightweight, very quiet, wooden) drags gear behind it and must **drive over the top** of
  the mines to position the cable, so it **will take heavy damage and get hit a lot**; the longer a
  ship mine-clears the more damage it takes. Some mines are **"unsweepable"** — you must send a **diver
  with demolition gear** underwater to deal with the explosives. Some mines can only be cleared by
  detonating them, damaging the clearing vessel. Helicopters can be shot down by mines too.
- **Outputs / effects:** mines are progressively cleared (visible small detonations); clearing
  platforms accumulate damage and may sink.
- **Edge cases / quirks:** never expect 100% clearance ("that never happens"). Use ROE/WRA to auto-RTB
  damaged sweepers (suggested: return when **>75% damaged**, redeploy at **25%** to go blow themselves
  up again). Helicopters and own sweepers can themselves trigger mines. Older clearing sets cannot
  handle quick-strike mines.
- **Source:** Bdjz8HohxOY
- **Confidence:** High

---

## 2. Coordinated anti-ship strike planning

### Coordinated time-on-target (TOT) salvo math
- **Models:** saturating a defended naval group by making missiles of different speeds/ranges arrive
  together.
- **Inputs / parameters:** per-weapon cruise speed and maximum range; chosen desired time-on-target
  (strike time); distance from each launcher to target; safety/fuel factor (**0.9**); a constant
  "standard" interval (**5 min = 300 s**) used for planning.
- **Behavior / rules:** launching missiles piecemeal never penetrates a US-Navy-style anti-missile
  screen; missiles must arrive in very short order. Procedure:
  1. For each weapon compute how far it travels in a standard **5 minutes (300 s)** — this reveals which
     can't even reach (e.g. a **P-70** can't make 50 nm before running out of fuel).
  2. Don't fire at max range; ideally ~**half** max range to keep terminal fuel for evasive turns, but
     for risky platforms multiply the achievable travel times by **0.9** to get a "modified range" /
     firing time that keeps a little fuel left.
  3. Since speed is constant, range and time are interchangeable.
  4. For each weapon, compute time-to-target at its modified range; **launch time = (desired
     time-on-target) − (time-to-target)**.
  5. **Slowest / longest-flight weapons launch first**, fastest last. Fire each launcher precisely at
     its computed launch time (down to the second).
- **Outputs / effects:** all missiles converge on the target at (approximately) the same moment,
  overwhelming defenses.
- **Edge cases / quirks:** a real professional gets arrivals within **30 seconds**; in CMO you're
  "lucky to get within 2 minutes," and 30 s is considered the gold standard. Missiles that take a
  non-direct (e.g. legging) path throw off the timing. Release-authorization limits can block surface
  attack and force re-allocation. An external strike-planner Excel/Google-Sheets tool ("command strike
  planner") does this calculation more rigorously.
- **Source:** dxlJME1Mc7c
- **Confidence:** High

### Reference-point firing waypoints with fixed bearing to a moving group
- **Models:** pre-positioning launchers at the correct standoff distance from a moving target before a
  coordinated launch.
- **Inputs / parameters:** per-weapon required launch distance (nm) from the target group; a waypoint
  placed at that distance; bearing-reference type (**fixed** vs rotating); transit-speed setting (full
  to get in position, cruise once on station).
- **Behavior / rules:** for each weapon, place a waypoint at the distance you want to launch from (e.g.
  echo group at **225 nm**, Charlie-2 at **72 nm**, Charlie-1 at **36 nm**, Kynda at **198 nm**, KSR-5
  at **162 nm**, KH-22 at **194 nm**, KSR-2 at **108 nm**) and reference that waypoint to the enemy
  carrier group using a **fixed** bearing (**not** a rotating bearing — rotating makes units
  swing/rotate). Assign each launcher to a **"support"** mission to drive it to that point at full
  speed, then cruise on station. Because the reference points are tied to the moving group, the
  waypoints (and thus the launchers) move with the target over time.
- **Outputs / effects:** each launcher ends up at the proper standoff range and stays correctly
  positioned relative to the moving group, ready to fire on command.
- **Edge cases / quirks:** if you lose sight of the target group, the relative waypoints get confused.
  Use fixed bearing, not rotating. Parked units don't need the relative reference. Support missions are
  the easy way to mass-position units.
- **Source:** dxlJME1Mc7c
- **Confidence:** High

### Waypoint (plotted-course) missiles
- **Models:** assigning a missile a custom flight path of waypoints to its target.
- **Inputs / parameters:** attacking unit and chosen weapon; per-weapon ability to use waypoints
  (limited by the launch platform's fire control); plotted waypoints (entered **last-to-target**
  order); target; the weapon's cruise speed (e.g. **~9 nm/min** for the cruise missile shown).
- **Behavior / rules:** select the firing unit and weapon (Shift+F1 / Manual Targeting), double-click
  the weapon, choose "plot course"; a dashed line shows the missile's default direct path. Each map
  click adds a waypoint the missile must fly through before reaching the target; press Escape when
  satisfied, then fire (spacebar). When ordering the relative launch timing of two paths, plot the
  **latest / most-distant** waypoint **first** and work toward the target. Not every platform that can
  launch a given missile can actually use waypoints — fire-control limits apply. The weapon then flies
  the plotted path (cruise missile noted at **~9 nm/min**, i.e. ~4.5 nm covered in ~30 s, used to judge
  pop-up timing).
- **Outputs / effects:** the missile follows the operator-defined route to the target instead of the
  direct path.
- **Edge cases / quirks:** double-clicking the weapon **again** before launch just adds **more
  missiles** to the same plotted path — wait until the salvo fires before plotting a new course. On
  re-attack the previously plotted waypoints are **auto-reused**; use "clear course" to reset before
  plotting fresh. The dashed line looks draggable but isn't (missile is on INS/GPS). Air-launched cruise
  missiles are **not stealthy** and are very easy to shoot down.
- **Source:** zp_I-v6enoI
- **Confidence:** High

### Terrain-masking cruise-missile attack vs SAM reaction time
- **Models:** routing a missile through terrain to defeat a SAM's detection-to-engage delay.
- **Inputs / parameters:** SAM engagement range and reaction / "noodle loop" time (example **SA-3 ≈
  30 s**); terrain/valleys and the radar horizon; missile cruise speed (~9 nm/min ⇒ ~4.5 nm needed
  before pop-up); plotted pop-up point.
- **Behavior / rules:** a SAM (SA-3) has a **~30-second loop**: anything detected within range can't be
  engaged until ~30 s have elapsed, and it takes a minimum of ~30 s to engage. Firing a cruise missile
  straight at it gives the SAM that 30 s. Instead, plot the missile down a valley (ideally **below the
  radar horizon**) and **pop up at the last second** so it dumps on the SAM before the radar can slew
  around and complete an engagement. Time the pop-up using the missile's speed: at ~9 nm/min it covers
  ~4.5 nm in the ~30 s engage window, so the final waypoint must let it appear inside that margin.
  Multiple missiles can use different valley approaches to overwhelm/distract the SAM (some as decoys
  drawing fire while others pop up behind a mountain just in time).
- **Outputs / effects:** the SAM either never gets a firing solution or wastes ammunition on missiles
  that duck back behind terrain; the masked missiles strike the SAM.
- **Edge cases / quirks:** cut it too fine and the SAM may still get a shot ("minimum range" can also
  save the missile if it pops up too close). A nearby naval combatant (Grisha) along a direct route
  would shoot the missiles down, so terrain routing also avoids other defenders. Missiles can be routed
  in "silly" / looping sign paths purely to trigger and waste enemy SAM ammunition.
- **Source:** zp_I-v6enoI
- **Confidence:** High

### Beaming / multi-axis pincer attack vs ship weapon directors
- **Models:** splitting a missile salvo onto multiple bearings to defeat a ship's fire-control coverage.
- **Inputs / parameters:** target ship's weapon-director / fire-control layout (typically one forward,
  one aft, each covering one side); incoming missile bearings; per-missile plotted courses and launch
  ordering; missile travel distance per axis.
- **Behavior / rules:** ships have fire-control **weapon directors** (target indicators) that aim all
  weapons on a given side, usually one forward and one aft. When attacked, a ship tries to **beam** the
  incoming threat to unmask as many weapon systems as possible. Counter: fire one missile group
  straight down the middle **and** another off the nose (a different bearing) so the ship cannot cover
  both with one director — a pincer that forces the fire-control to choose. Because the off-axis
  (flanking) missiles travel farther, **plot and launch them first** so all groups arrive together; if
  you mistime it, the close/early missiles get shot down before the others arrive. While the ship wastes
  SAMs beaming one group, the other group attacks the now-exposed side. You can also route missiles
  around a corner to come from the opposite side.
- **Outputs / effects:** the defender's fire control is overloaded / forced to split, letting at least
  one axis penetrate.
- **Edge cases / quirks:** if the flanking missiles haven't "legged" / spread yet when the central
  group arrives, the central group is easily shot down first. A capable point-defense (Sea Whiz/CIWS)
  can still down a poorly-timed or small Harpoon salvo. Aegis cruisers/destroyers make this far harder;
  a pair of Aegis ships may stop everything. (Note the contrast with the **all-aspect missile-defense
  rating** — see §6 — which makes pure off-axis attack ineffective against a top-tier AAW ship; this
  tactic works by overwhelming *throughput*, not by finding a blind arc.)
- **Source:** zp_I-v6enoI
- **Confidence:** High

### Missile detection by cruise altitude (radar horizon / sea-skimmer masking)
- **Models:** how early a defender's radar acquires an inbound anti-ship missile based on the missile's
  cruising height vs the radar horizon and sea clutter.
- **Inputs / parameters:** missile cruise altitude; defender/AEW radar position & altitude;
  sea-state/clutter; weather.
- **Behavior / rules:** detection range scales with the inbound missile's cruise altitude. A missile
  cruising at **~800 ft** gives "pretty early warning." A **sea-skimming** missile is so low it
  "probably would not be noticed until it is about **20 miles** away." AEW (E-2D) extends detection
  beyond the defender's own horizon, but low/sea-skimming missiles get lost in sea clutter — "very
  difficult for AWACS to see missiles traveling very low to the water," especially in strong sea clutter
  / bad weather. Reduced warning directly shrinks the engagement window and the number of intercept
  attempts possible.
- **Outputs / effects:** time/range at which the threat appears as a contact; effective engagement
  window for point defense.
- **Edge cases / quirks:** strong sea clutter or bad weather suppresses low-altitude detection; AEW
  raises detection of higher-flying missiles but not sea-skimmers.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** Med

---

## 3. Stealth & detectability

### Aspect-dependent radar cross-section (detectability by viewing angle)
- **Models:** an aircraft's detectability changes with the angle it presents to the sensor.
- **Inputs / parameters:** aircraft type; aspect angle to the detector (front / side / rear / belly);
  per-aspect detectability values in the database (radar **2D** band, radar **EDM** band, infrared);
  signed detectability rating (**negative = harder, positive = easier**).
- **Behavior / rules:** every aircraft has different detectability at different angles to the detector;
  the database lists per-aspect values. The **front** aspect of a stealth aircraft is hardest to detect
  (e.g. one shown identifiable only at ~2 nm and visible at ~3.6 nm head-on); when an aircraft points
  directly at the radar it can **vanish**, and it reappears when it turns. Turning to expose the
  **side** generally raises detectability (bigger signature). The **rear** is much easier to detect,
  especially in infrared, because that is where engine heat exits. The radar rating is split into a
  long-wavelength **"2D"** band and a short-wavelength **"EDM"** band; some aircraft are equally
  detectable in both (J-20 example), others differ. More negative = harder; more positive = easier.
- **Outputs / effects:** detection range and the ability to identify/track/engage vary **continuously**
  with the target's current aspect; a maneuvering target flickers in and out of track.
- **Edge cases / quirks:** an aircraft pointing straight at the radar can momentarily disappear
  entirely. Infrared detection (rear especially) persists regardless of radar stealth.
- **Source:** ZzFr_hG7gg4
- **Confidence:** High

### External stores break stealth (signature from munitions)
- **Models:** ordnance hung externally dominates an otherwise stealthy aircraft's signature.
- **Inputs / parameters:** whether munitions are carried internally vs externally (wingtip stations);
  presence of external pods.
- **Behavior / rules:** munitions hanging off a wingtip — even a single Sidewinder — can have a
  **greater emission than the rest of the aircraft combined**. As a result, stealth aircraft carrying
  external stores (Su-57 "external," externally-loaded F-22/F-35) are detected by their **munitions**
  rather than their airframe, and are picked up far earlier than the same aircraft carrying
  internal-only loads. The UI flags such contacts as **"external."** Fully internal-munition aircraft
  (e.g. F-117 at 100% internal, B-2) remain far stealthier.
- **Outputs / effects:** external-stores aircraft are detected/identified at much longer ranges;
  internal-only aircraft remain hard to detect.
- **Edge cases / quirks:** in demonstrations the external-stores stealth aircraft were consistently
  detected first; internal-only ones (especially the B-2) were never or last detected.
- **Source:** ZzFr_hG7gg4
- **Confidence:** High

### Radar wavelength bands vs stealth (long vs short wavelength tradeoff)
- **Models:** long-wavelength radars detect stealth but imprecisely; short-wavelength radars are
  precise but stealth-blind.
- **Inputs / parameters:** radar wavelength/band (**long:** UHF/VHF, the "A/B/2D" end; **short:**
  fire-control/missile-guidance bands, the "EDM" end); target stealth design; range; radar
  size/gain/power.
- **Behavior / rules:** two simulated zones.
  - **Long wavelengths** (UHF, VHF; A/B band; an over-the-horizon radar with an ultra-long wavelength)
    are excellent for **long-range and stealth** detection but are **not range/bearing accurate** —
    contacts are ambiguous ("big EW/AOU situation"), often un-engageable.
  - **Short wavelengths** (fire-control, missile-guidance) are far more **accurate** but have a tougher
    time detecting stealth **and** much shorter range (in the demo the longest short-wavelength
    detection was **~40 nm**; some only **~22 nm**).
  Doctrine: long wavelengths detect enemies early; short wavelengths prosecute/engage. Examples: an
  "ancient" **A-band** radar detected external-ordnance aircraft at **110 nm** and an F-117 at **60 nm**;
  short-wavelength radars never detected the internal stealth aircraft even as they flew overhead.
  Bigger radar ⇒ more gain/power and more precision.
- **Outputs / effects:** you may **detect** a stealth target on a long-wavelength radar yet be unable to
  **engage** it with your accurate short-wavelength fire-control radars — a critical planning constraint.
- **Edge cases / quirks:** an over-the-horizon ultra-long-wavelength radar (range shown **242 mi**) saw
  external stealth first but **never** detected the internal-only ones — long wavelength alone is
  insufficient without enough processing/power. The F-117 front is basically invisible to short
  wavelengths but detectable from the side against long wavelengths.
- **Source:** ZzFr_hG7gg4
- **Confidence:** High

### Belly aspect at short range / high look-up angle
- **Models:** geometry between a low radar and a high-passing aircraft changes which aspect (the belly)
  is seen.
- **Inputs / parameters:** horizontal range to target; target altitude; resulting look-up angle (the
  radar sees the bottom rather than the front).
- **Behavior / rules:** when a target is close horizontally but high (example: ~10 nm out and ~6 nm up),
  the radar is looking at the aircraft's **belly/bottom** rather than its front. As external-stores
  aircraft pass over the top at this geometry their stores become detectable immediately, while
  internal-only aircraft flying directly overhead can still be never detected. Aspect-based
  detectability therefore depends on the full **3D geometry**, not just compass bearing.
- **Outputs / effects:** detection flips as the engagement geometry rotates the presented aspect (e.g.
  to the belly); some aircraft are better/worse from the bottom.
- **Edge cases / quirks:** the F-22 is noted as "not the greatest" against short wavelengths from the
  belly aspect (picked up relatively early in that geometry).
- **Source:** ZzFr_hG7gg4
- **Confidence:** Med

### Jamming to defeat detection / overcome jamming power (stand-in jamming)
- **Models:** stand-in jamming lets stealth aircraft close the distance; detection through jamming
  requires beating the jammer's power.
- **Inputs / parameters:** jammer platform and its coverage area/orientation (e.g. an EA-18 with ECM
  on); which aircraft fall inside vs outside the jamming coverage; the detecting radar's power/quality
  (only the most powerful can burn through).
- **Behavior / rules:** counterintuitively, the best way to improve stealth is to **jam** — but jam
  with a **different** aircraft (a stand-in jammer), not the stealth aircraft itself. To detect an
  object inside jamming, a radar must **overcome the jamming power**. With the jammer on, aircraft
  inside its coverage are hidden (e.g. F-35 detected significantly later; F-22 closed to **~41 nm**
  instead of being seen at **90 nm**). An aircraft that flies far enough away from the jammer's coverage
  loses protection and gets detected; one no longer being jammed is re-acquired. Only the most capable
  radar in the demo (the **APY-9** on the E-2 Hawkeye / "Nebo") could detect through the jamming.
- **Outputs / effects:** jamming shrinks detection range for covered aircraft, letting them approach
  much closer; only a sufficiently powerful radar burns through.
- **Edge cases / quirks:** coverage is directional/partial — uncovered aircraft (or those that drift out
  of coverage) are still detected. Jamming can even make a non-stealth aircraft (F-18) very hard to
  acquire when it's the one being covered.
- **Source:** ZzFr_hG7gg4
- **Confidence:** High

### Anti-stealth radar performance factors (gain, power, wavelength, processing) & airborne advantage
- **Models:** why certain specific radars are exceptionally good at finding stealth.
- **Inputs / parameters:** physical radar size (⇒ antenna gain), transmitter power (megawatts),
  operating wavelength/band, signal-processing capability, platform (ground vs airborne); IR detection
  systems.
- **Behavior / rules:** a radar's anti-stealth ability rises with physical size (bigger antenna ⇒ more
  gain), raw power (the Nebo described as "a megawatt plus"), operating on a long ("B") wavelength
  (easier on most stealth), and signal processing/precision. Large size also yields relatively better
  precision than other long-wavelength sets. **Airborne radars** (AWACS like the Mainstay, E-2
  APY-9/Nebo) are the "champions of anti-stealth" due to range plus heavy processing power. Specialist
  sets called out: **Nebo** (epically good), **MPQ-65** (Patriot, combined detect+engage), **S-400
  "Cheese Board"** detector, **YLC-4** (excellent anti-stealth, long wavelength), **over-the-horizon
  coastal radar** (ultra-long wavelength, ~242 mi). An opponent with **IR detection** can still pick up
  stealth aircraft, especially from behind.
- **Outputs / effects:** high-gain / high-power / long-wavelength / well-processed (and especially
  airborne) radars detect stealth earlier and more usefully; weak long-wavelength sets see them only
  ambiguously.
- **Edge cases / quirks:** even with an ultra-long wavelength, without enough processing+power the radar
  only sees external stealth and never the internal-only aircraft. The B-2 is consistently detected last
  because its size distributes/resonates the wavelength so effectively. IR sensors bypass radar stealth.
- **Source:** ZzFr_hG7gg4
- **Confidence:** Med

---

## 4. Unguided bombing — accuracy, altitude, and the damage model

### Bomb-sight quality tiers vs unguided accuracy & altitude
- **Models:** an aircraft's **bomb-sight rating** governs how accurately it drops dumb bombs and how
  low it must fly — for unguided bombs this is the single dominant accuracy term (a per-platform DB
  field), not the bomb.
- **Inputs / parameters:** platform bomb-sight rating — **Basic**, **Ballistic computing**, **Advanced
  computing**, **Advanced / INS navigation**; attack altitude; wind; plus pilot proficiency.
- **Behavior / rules:** four tiers, worst → best:
  - **Basic** (≈ WWI-bomber accuracy; like the Mk21 reflector sight; e.g. S-3B).
  - **Ballistic computing** (≈ 1960s; like Mk21 with lead computation, e.g. Mirage F1).
  - **Advanced computing** (CCIP; e.g. **B-52**, F-16CJ).
  - **Advanced / INS navigation** (best possible short of dropping by hand; F-18, F-35, Su-34).
  The older/worse the sight, the **lower** you must fly to be effective; advanced/INS lets you drop
  unguided weapons accurately from very high altitude. Accuracy is "about the same" across the lower
  tiers until you reach advanced/INS, where it jumps markedly. Quantified demo, same target (4 ammo
  pads), Mk82s, **holding everything but the sight constant**:
  - **Basic sight** (Mk-82 @ 200 ft) ⇒ **120 bombs killed only 1 pad** ("with a basic sight you're as
    effective as World War 1 bombers").
  - **Ballistic computing** (Mirage F1, 250 kg @ 200 ft) ⇒ **168 bombs killed 3** (≈ 56 bombs/kill).
  - **Advanced computing** (B-52 @ 36,000 ft) ⇒ **540 bombs killed ~6** (≈ 100 bombs/target).
  - **Advanced / INS** (F-18) ⇒ **under 100 bombs killed 3** (≈ 33 bombs/target — the floor).
- **Outputs / effects:** determines bombs-per-target needed, safe release altitude, and resistance to
  wind drift. The operator is told to divide target damage-points by per-hit damage, then scale by the
  sight's hit ratio.
- **Edge cases / quirks:** high-altitude unguided drops drift significantly in any wind; advanced/INS
  mitigates this. The B-52 also supports **radar bombing** (can attack through cloud as long as the
  target is detected) vs optical bombing (needs line of sight).
- **Source:** bPVkIPVlNlA
- **Confidence:** High

### Accuracy vs bombing altitude (conditioned on bomb-sight tier — resolved)
- **Models:** unguided-bomb accuracy falls off with altitude **for lower bomb-sight tiers** but
  **flattens out at the Advanced-INS tier** — altitude is conditioned on sight quality. This resolves
  the apparent "non-monotonic vs monotonic" contradiction seen across other videos.
- **Inputs / parameters:** release altitude, **bomb-sight tier** (the gate), wind (grows with
  altitude), weapon min-release / fuze-arming altitude, local terrain elevation.
- **Behavior / rules (authoritative wording):** *"in general the accuracy is about the same until you
  get to advanced INS — once you start getting into that category you can start dropping from very high
  altitudes unguided without being nervous about it."* So:
  - **Basic / Ballistic / Advanced-computing sights:** lower = more accurate; "the older the bomb-sight
    system the lower altitude you're going to have to be to be effective." Wind at 36,000 ft "deviates
    significantly," so high drops rely on **volume** (more bombs) to compensate.
  - **Advanced INS-GPS sight:** can drop accurately from very high altitude — the altitude penalty is
    effectively removed (the F-18C 33-bombs/kill result, and the narrator would "still hit" from high).
- **Outputs / effects:** sets the trade between AAA exposure (low) and miss rate (high) for non-top
  sights; top-tier INS aircraft can stay high **and** accurate.
- **Edge cases / quirks:** the "non-monotonic survival curve" seen elsewhere reflects a GPS/CCIP-sighted
  aircraft where altitude barely matters, plus a min-release floor at the very bottom — not a genuine
  mid-altitude accuracy peak. Treat the sight-tier rule as governing.
- **Source:** bPVkIPVlNlA
- **Confidence:** High

### Default attack altitude & manual-attack altitude override
- **Models:** how CMO chooses bomb-release altitude and how the operator forces a specific one.
- **Inputs / parameters:** per-aircraft **default attack altitude (AGL)**; auto-attack vs manual (WPN)
  attack; operator-set altitude; local terrain elevation.
- **Behavior / rules:** when you ready an aircraft for a strike it shows a default attack altitude. If
  you do **not** override it, the aircraft attacks at that default (commonly **2,000 ft AGL** for
  tactical jets; **36,000 ft** for a B-52). To set a specific attack altitude you **must use a manual
  (WPN) attack** — an auto-attack with no altitude set will **dive to 200 ft AGL**. Altitude is **AGL**
  (above ground level), so it interacts with terrain.
- **Outputs / effects:** sets the altitude at which weapons are released; affects survivability vs
  ground fire and accuracy vs sight tier.
- **Edge cases / quirks:** if a mountain/terrain is too high relative to the set altitude the aircraft
  is "too low" and **cannot deploy** (a drop failed because terrain was higher than the aircraft's
  commanded altitude); too high above the target also blocks line-of-sight delivery. Reconcile commanded
  AGL altitude with local terrain elevation.
- **Source:** bPVkIPVlNlA
- **Confidence:** High

### Minimum release altitude & terrain-blocked drops ("won't drop")
- **Models:** a bomb has a **minimum / default release altitude**; below it — or with terrain in the
  way — the weapon **does not release at all** (a precondition gate before any Pk roll). Corroborated
  across the bombing / ship-bombing tutorials.
- **Inputs / parameters:** weapon min-release / retarder-arming altitude (example **~1,000 ft AGL**);
  **AGL vs local terrain elevation**; auto- vs manual-attack mode; commanded attack altitude;
  aircraft-sight ceiling.
- **Behavior / rules:** if the aircraft is **below** the weapon's minimum release altitude it cannot
  drop — the pilot repeatedly "goes over the top" of the target. Solution: ingress very low (~500 ft)
  then **pop up** to ≥ min altitude at the last second and release. Demonstrated failure modes: a bomber
  **too high over a mountain** would not drop (the bomb path was terrain-blocked), and setting altitude
  **too low** relative to local terrain elevation also blocked release until raised to a clear AGL. At
  the high end, with **traditional sights** anything past **~10,000 ft** is unlikely to hit (CMO will
  not let even a sophisticated aircraft plink from 16,000 ft the way DCS CCIP can).
- **Outputs / effects:** "where are my bombs?" — no release event, target untouched, no expenditure.
- **Edge cases / quirks:** flying directly over the target deck after a low pop-up is "ironically one of
  the safer places to fly." Low/pop-up profiles also reduce wind drift (bombs travel less distance).
  **GPS/sat-nav bombs refuse to target anything in the water** ("it assumes it's not going to hit it").
- **Source:** bPVkIPVlNlA, oVs-5gylEcA
- **Confidence:** High

### Damage-points vs armor / warhead-type damage model (penetration resolution)
- **Models:** computing how many hits a bomb needs to destroy a target. Damage = (weapon damage points)
  × (fraction that gets through armor), where the through-fraction compares the weapon's **penetration
  value** to the target's **armor class**.
- **Inputs / parameters:** target **damage points (HP)** and **armor class** (None / Light / Medium /
  Heavy / **Special**; "Special" labeled with an mm band, e.g. Iowa "special 201–500 mm" — a class
  label, **not** literal HP); weapon **damage value**; **warhead type** (high-explosive HE,
  semi-armor-piercing SAP, armor-piercing AP, penetrator); HE-vs-armor penalty (**~80% reduction**;
  "0.8" multiplier used in the math). Weapon **penetration value is hidden/obfuscated** in the
  player-visible DB even when the record says "penetrator."
- **Behavior / rules:** hits needed ≈ target HP ÷ effective per-hit damage. Stated rules:
  - **No armor:** ~100% of damage applies; when penetration **vastly overmatches** the armor (or the
    target is unarmored), the weapon does **double damage** (observed: GBU-31 363 dmg vs no-armor straw
    house and vs light wood house each delivered ~double; 363 × 2 ≈ ~726).
  - **High-explosive (HE) vs armor:** roughly an **80% reduction** — the tutorial models effective
    damage as **weapon_damage × 0.8** (e.g. Mk82 130 dmg ⇒ ≈ **104** vs light armor). Worked examples: a
    **450-HP light-armor building** needs ⌈450/130.5⌉ = 4 raw, but with the HE penalty (≈ 104) needs
    **5 direct Mk82 hits**; a **150-HP light-armor two-lane bridge** needs **2 solid Mk82 hits** (at ≈
    104 effective). Against a **Special** brick house only ~4% of a non-penetrator's HE damage gets
    through (armor reduction ~90%+).
  - **SAP** (e.g. S-14): **ignores light armor** and delivers full damage (250 to a building, less to a
    bunker).
  - **AP:** punches through anything but does little structural damage (just bores a hole).
  - **Penetrator** (e.g. BLU-109): defeats extremely hardened targets (≈ **100 m of earth** over an
    underground bunker) and delivers **100%** of its damage to what it hits. When penetration is
    **balanced/matched** to equal-grade special armor it does ~**full (single)** damage (observed GBU-31
    vs special brick house = "100% penetration achieved" but only ~40% of damage applied, a 313-dmg
    event).
  - **Below-threshold damage does nothing:** tiny per-hit weapons (.50 cal vs battleship) never
    accumulate effective damage.
- **Outputs / effects:** effective per-hit damage and the number of hits/bombs (and thus aircraft)
  required for a kill; HP reduction → percent-damaged readout; instant fire on heavy damage.
- **Edge cases / quirks:** the **same weapon does ~2× damage to an unarmored target as to a matched
  target** — counterintuitive but stated explicitly. The ~80% HE reduction is qualitative ("80%
  reduction-ish") and demonstrated only for **light** armor; don't extrapolate the exact multiplier to
  medium/heavy/special. Very-hard targets (T-80 tank, hardened bunkers) require special weapons
  (AP/penetrator/HEAT). Penetration is invisible to the operator, so you cannot pre-compute the
  through-fraction from the UI. Weapons can **malfunction** on impact and do 0 damage (always carry a
  backup); splash/debris from one struck building can damage adjacent buildings. Grouped units can
  confusingly read as "no armor."
- **Source:** bPVkIPVlNlA, Skejttm4Pv8
- **Confidence:** High (qualitative rules), Med (the explicit double-damage / 4% / 0.8 figures)

### Bomb yield vs accuracy/count tradeoff
- **Models:** choosing bomb size trades carry-count and required precision.
- **Inputs / parameters:** bomb yield/weight; target size and HP; carriage capacity.
- **Behavior / rules:** **bigger yield ⇒ less need for accuracy** (more damage per hit) but you can
  carry fewer; **smaller yield ⇒ more pinpoint and lighter**, but you carry more. For a large target
  it's fine to use fewer big bombs since you'll hit it. Doubling yield (500 lb → 1,000 lb) roughly
  **halves** the bombs needed; conversely many small bombs (e.g. "30 Mk82s") are packed because you only
  need one decent hit. Worked example: Mk83 = 303 dmg, ×4 carried ×0.8 ≈ ~1,000 effective — a **single
  aircraft's load destroys the 450-HP building**. Sometimes you **must** use big bombs because they're
  the only way to do enough damage to the target at all.
- **Outputs / effects:** drives loadout choice (size vs quantity) and the bombs-per-target figure.
- **Edge cases / quirks:** using too-small bombs on a hard/high-HP target wastes the stack; using bigger
  bombs than needed reduces sortie efficiency.
- **Source:** bPVkIPVlNlA
- **Confidence:** Med

### Weapon Release Authorization (WRA) salvo size & re-attack
- **Models:** how many weapons each aircraft expends per target and whether it re-attacks.
- **Inputs / parameters:** WRA salvo setting (default **"all weapons"** for unguided bombs; can set a
  fixed number per target); flight size; allow/disallow re-attack; guided-weapon defaults.
- **Behavior / rules:** the default WRA for almost every **unguided** bomb is **"all weapons"** — an
  aircraft drops its **entire stack** on the first target it sees, dropping enough to fill the salvo
  requirement (e.g. all 8 Mk82s per target). To force re-attacks and spread bombs across multiple
  targets, set a **smaller per-target number**; each aircraft then attacks a single target with that
  many bombs and turns around to re-attack. You can split a load (e.g. half its bombs) so a second pass
  or second aircraft finishes the job. **Guided** bombs default differently (don't dump everything). If
  re-attack is **disallowed** in the mission, leftover targets are skipped (must re-assign the unit).
- **Outputs / effects:** controls bombs-per-target, number of targets serviced per sortie, and whether
  aircraft re-engage.
- **Edge cases / quirks:** demonstration — WRA limited to 4 of 8 snake-eyes made each F-18 hit a
  separate target then turn back to re-attack already-hit targets; with re-attack disallowed one target
  was left and the flight went unassigned and had to be re-assigned. More important for big bombs than
  small ones. (This is the same allocation lever that, in the ground-radar demo, accounts for lethality
  gains independent of radar: turning on the air-to-ground radar produced identical damage in a
  controlled rerun — radar's value is **detection**, not a Pk modifier on the drop; the lethality gain
  came from changing the WRA salvo size, i.e. doctrine/allocation.)
- **Source:** bPVkIPVlNlA
- **Confidence:** High

### Retarded / air-brake (high-drag) bombs
- **Models:** drag-retarded bombs for very-low-altitude release.
- **Inputs / parameters:** weapon type (e.g. Snakeye, BLU high-drag Mk82); release altitude (very low,
  **~80 ft AGL**); wind.
- **Behavior / rules:** air-brake/retarded bombs deploy drag (fins/parachute) so the dropping aircraft
  isn't caught in its own blast and can release at extremely low altitude — the observed attack altitude
  was **~80 ft above the ground**. They are dropped as you overfly the target and can be launched
  somewhat off-bore. They are **virtually useless on a windy day**.
- **Outputs / effects:** allows accurate very-low-altitude lay-down delivery with the morale effect of
  simultaneous impacts; nullified by wind.
- **Edge cases / quirks:** at ~80 ft AGL the aircraft is extremely exposed to AAA. Wind makes them
  virtually useless — be very careful.
- **Source:** bPVkIPVlNlA
- **Confidence:** Med

### Cluster bombs (CBU) — bomblet count vs damage tradeoff
- **Models:** submunition dispensers that trade per-bomblet lethality for area coverage.
- **Inputs / parameters:** CBU type; number of bomblets dispensed per drop; bomblet type
  (anti-personnel/area vs anti-armor); wind-correction capability; target environment.
- **Behavior / rules:** a CBU splits after release into many small bomblets. **More bomblets ⇒ more area
  coverage but less individual damage**; fewer, larger submunitions ⇒ better penetration/anti-armor but
  less coverage. Examples: **CBU-49** dispenses **670 bomblets** per drop (wide, light); **CBU-78
  "Gator"** and **CBU-97** (only **~10 submunitions**) are anti-armor types. Modern "CBU-100-series" can
  **correct for wind**; older Vietnam-era series cannot. CBUs are poor in urban/jungle/forest. Good
  against spread-out SAM sites and parked aircraft (you don't need much to disable a parked plane).
- **Outputs / effects:** a pattern of submunition detonations over an area; effectiveness scales with
  target dispersion and environment.
- **Edge cases / quirks:** not useful in urban/jungle/forest. Older CBUs lack wind correction; modern
  ones self-correct.
- **Source:** bPVkIPVlNlA
- **Confidence:** Med

### Attack orientation / flight-size geometry (bridges & point targets)
- **Models:** approach axis and formation column dramatically affect hits on linear/point targets.
- **Inputs / parameters:** attack heading relative to the target's long axis (perpendicular vs
  along-axis vs oblique); flight size (small column vs large); target shape (linear like a bridge, or
  small point target); weapon type (LGB vs unguided).
- **Behavior / rules:** you **cannot** attack **perpendicular** to a linear target (a bridge) with
  unguided bombs and expect hits (perpendicular runs with a ballistic sight missed entirely / barely
  scratched). Attacking **along the bridge's axis** roughly **doubled** the damage (the bomb stick lands
  along the structure — "100% more damage") but the enemy expects this and defends both ends, and the
  bridge can fall in a gap between sticks. The Vietnam-era compromise is an **oblique** angle (not
  perpendicular, partly off the defended axis). **Small flight sizes** make aircraft attack in a column
  ("like ants"), letting each hit the same aim point without circling — best for a pinpoint target;
  stacking aircraft directly **in trail** puts them all on the same point of the bridge. Large flights
  spread over an area target (set WRA accordingly). Snake-eye/retarded bombs and some weapons can be
  launched slightly off-bore.
- **Outputs / effects:** pattern alignment with the target — perpendicular = misses on linear targets;
  along-axis/oblique with a column formation = hits; column formation concentrates the stick on a point.
- **Edge cases / quirks:** perpendicular bridge attacks only work with an **LGB**. A column along-axis
  still risks the bridge sitting in the gap between bomb sticks. Worked planning example for a **150-HP
  light-armor bridge** needing **2 solid Mk82 hits**: ~**50 aircraft** with a Basic sight at altitude,
  ~a **quarter** of that at low altitude, fewer with ballistic, and just **~2 aircraft / ~4 bombs** with
  advanced-INS at medium altitude.
- **Source:** bPVkIPVlNlA
- **Confidence:** High

---

## 5. Unguided bombing vs ships & bomb-stick patterning

### Ship armor model for unguided-bomb penetration (belt vs deck RHA)
- **Models:** ships carry **separate armor values by location** expressed in mm RHA (e.g. belt
  91–140 mm RHA); modern ships typically have **belt armor but no deck armor**, so top-down hits
  penetrate easily while side hits must defeat the thick belt. Impact geometry selects which armor the
  weapon must defeat: a top-down/oblique stick "goes through the deck" (little/no deck armor) and does
  heavy damage, while a low side-on run hits the thick belt and is largely absorbed (~5% total in one
  example). Fires + flooding can finish a ship even after a moderate penetration.
- **Inputs / parameters:** DB armor entries per zone (belt mm RHA, deck mm RHA); hit angle/aspect
  (top-down vs low-angle side); bomb size/penetration capability; ship size.
- **Behavior / rules:** before striking, check the target DB armor entry. If **deck armor is absent**
  (modern carriers like CVN-65 Enterprise, Kuznetsov), bombs dropped "right down the middle" (top-down)
  **penetrate the deck** and do heavy internal damage; **low-angle hits into the belt** "have to work a
  lot harder" and may be absorbed. Old-era ships **do** have deck armor (you must go "way back" in the
  DB years), changing the optimal axis. Penetration is reported as a number (one side-strike achieved
  "34" / "about half the bomb got through the armor").
- **Outputs / effects:** the armor-penetration value, internal damage / damage-control component losses,
  fires.
- **Edge cases / quirks:** even a near-perfect top-down stick on a big ship can do limited damage if
  individual bombs are too small ("didn't have the kick"). Side/belt hits with small bombs scored ~**5%**
  damage ("armor basically sucked it all off"). Ship size dilutes damage — big ships shrug off good hits.
- **Source:** oVs-5gylEcA
- **Confidence:** High

### Bomb size vs bomb count tradeoff (hit probability vs damage per hit)
- **Models:** for a fixed payload, **bigger bombs (fewer of them)** raise per-hit damage but lower hit
  probability; **smaller bombs (more of them)** raise hit probability but each does less damage. Optimal
  choice depends on target size.
- **Inputs / parameters:** bomb type/size (Mk 82 500-lb, Mk 83, Mk 84-class, GBU-43); number carried
  (inverse of size); target physical size (frigate vs carrier).
- **Behavior / rules:** pick **big bombs for big targets** (carrier) because you'll likely hit anyway
  and want the damage; pick **many small bombs for small targets** (frigate) to maximize the chance any
  hit lands. Demonstrated: a Mk 82 stick on a carrier bracketed well but under-penetrated/under-damaged;
  a 4-bomb mix of Mk 82/Mk 83 "dead on" run **missed entirely** (too few bombs to absorb aim error).
- **Outputs / effects:** number of impacts on the target, total damage.
- **Edge cases / quirks:** dropping fewer/larger bombs means "we have to hit it right the first time" —
  a small stack has no margin for aim error. A very large bomb (**GBU-43 MOAB**) was **"not a [valid]
  target" / "not a [release]-capable weapon"** against the ship and the engine refused the drop.
- **Source:** oVs-5gylEcA
- **Confidence:** High

### Stick/"stack" bomb pattern geometry and oblique bracketing
- **Models:** an unguided salvo lands as a **straight line** ("stack/stick") along the flight axis; to
  bracket a long thin target you cross it at a slight **oblique** so the line cuts across the hull,
  instead of running parallel (where one aim error or crosswind throws the whole stack off-target).
- **Inputs / parameters:** strike-point placement (Shift+F1 area, Ctrl+F1 manual); aircraft heading vs
  target long axis; oblique angle (gentle, **not** ~45°); wind direction; aircraft turn rate; number of
  bombs in the stack (stack length).
- **Behavior / rules:** if you run straight down a ship's long axis, all bombs must hit on the same axis
  and any crosswind (N/S) pushes the whole stack to port/starboard → total miss. Instead aim the stack
  to **cross** the target at a small oblique so the impact line brackets the hull. Account for aircraft
  turn lag when setting the oblique so you neither under- nor over-shoot. A too-small oblique on a
  parallel attack lets the whole line miss long (demonstrated B-52 **45× Mk-82** stick offset slightly →
  "beautiful straight line" entirely in the water, **zero damage**).
- **Outputs / effects:** spatial distribution of impacts (line crossing vs parallel); number of hits on
  the hull.
- **Edge cases / quirks:** dropping all bombs at once: if the first misses, the whole stack misses, but
  it **minimizes time in the defensive-fire envelope** (tradeoff). **Longer sticks amplify offset
  error** — the longer the stack, the more a small initial offset throws the entire line off. Same
  philosophy as striking bridges (cross, don't run along).
- **Source:** oVs-5gylEcA
- **Confidence:** High

### Unguided-bomb accuracy by delivery platform (tactical vs strategic bombing)
- **Models:** the same bomb tonnage delivered by **single-engine tactical aircraft** is more accurate /
  does more concentrated target damage than by **high-altitude level bombers**, with both far less
  precise than PGMs.
- **Inputs / parameters:** aircraft type / bomb-delivery method; bomb count and size (held **equal**
  across the test: **768× 500-lb** bombs both runs); release altitude (B-24s at **~21,000 ft** "daylight
  precision bombing"); target hardness (coastal bunkers, command bunker).
- **Behavior / rules:** holding bomb tonnage constant — carrier **Hellcats vs 96 B-24Ms**, each dropping
  **768× 500-lb** bombs — the carrier/tactical single-engine aircraft produced more complete damage to
  the bunkers; the high-altitude B-24 level-bomb run was explicitly **"not accurate"** and left the
  command bunker **"completely unscathed."** Conclusion: tactical aircraft are more accurate than level
  bombers in this WWII-era, unguided regime; the outcome "would be different if we had PGMs."
- **Outputs / effects:** target-structure damage state; bomb-expenditure tally; attacker losses (lost
  **3 Hellcats** in the carrier run).
- **Edge cases / quirks:** frame-rate/"choppiness" scales with aircraft count (graphical, not
  CPU/adjudication). Level bombers incur a long ferry (~8-hr round trip) and need climb time to reach
  bombing altitude. Keeping aircraft in "very large flights" lets the engine parcel out attack runs
  rather than striking all at once. Real-world expectation cited (not a sim number): ~**10–15%** of
  bombers would suffer maneuverability/mobility casualties.
- **Source:** dBDmncdpD9g
- **Confidence:** Med

### Naval gunfire shore bombardment
- **Models:** battleship main + secondary batteries area-bombard a shore target — wide dispersion, high
  ammo consumption, moderate lethality vs hardened structures; the ship is more vulnerable than aircraft.
- **Inputs / parameters:** ship class (BB, e.g. USS Massachusetts); gun calibers (**406 mm** main, 5-in
  secondaries); engagement range (set ~**4 nm**, then decreased); ship speed (set to "creep"); WRA
  settings; target side/arc.
- **Behavior / rules:** the operator sets a patrol/bombardment box (F1 drag box), low speed, and a range
  ring (~4 nm). The ship fires secondaries heavily and periodic 406 mm main rounds. Guns are
  **arc-limited** — "can't shoot much out the back" — so the ship must rotate to bring the forward
  406 mm guns to bear. Bombardment is **dispersed** ("spread it out"), dents structures and ignites
  fires, destroys shore batteries, but is **"not terribly deadly"** to hardened bunkers. Consumes large
  quantities of 5-in ammunition.
- **Outputs / effects:** shore-structure damage + fires; expenditure tally; range-ring-controlled fire
  distribution.
- **Edge cases / quirks:** a patch / "new thing that basically slows everybody down initially" affects
  WRA — modify WRA before bombarding to account for it (an initial firing-slowdown mechanic).
  Historically bombardment used a *pack* of battleships, not one — a single ship is a contrived demo.
- **Source:** dBDmncdpD9g
- **Confidence:** Med

---

## 6. Naval point defense & saturation

> Per-layer Pk figures below are **single-engagement endgame readouts**, not constants. This section is
> the authoritative per-layer point-defense Pk ladder: ship air defense is a layered ladder of
> independent systems, each resolved with its own per-engagement Pk and its own concurrency limit, and
> CMO scores every layer separately.

### Dual-purpose gun point defense (5 in / 127 mm) vs high-speed missiles
- **Models:** a last-ditch gun engagement of an inbound missile, limited by gun range and rate of fire.
- **Inputs / parameters:** gun max range (described as "pretty darn small" for the 5-inch); rate of
  fire; per-round probability-to-hit; target speed; fire-control lock (visual or radar).
- **Behavior / rules:** the gun **cannot engage until the missile is inside its (short) range**, so the
  number of shots is severely limited by rate of fire. Each shot is resolved with an individual
  probability-to-hit. In the demonstrated engagement the per-round Ph against a fast inbound missile was
  **1% each time** (3 rounds fired). Guns can be directed visually or by radar and can engage surface or
  air targets, but are "embarrassingly bad" at reliably hitting a high-speed target closing on the ship.
- **Outputs / effects:** round(s) fired; hit/miss roll per round; ship damage if the missile leaks
  through.
- **Edge cases / quirks:** essentially last-ditch / shore-bombardment only against missiles; the endgame
  screen shows the per-shot Ph (1%) — use the database/endgame to see the actual Ph.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### CIWS (Phalanx / AK-630) burst engagement
- **Models:** a high-rate gun CIWS fires a fixed **burst** of rounds at an arriving missile, computing
  an aggregate hit probability.
- **Inputs / parameters:** rounds per engagement burst (**AK-630 = 400 rounds per engagement**); limited
  firing arcs; number of simultaneous inbound missiles; ability to manually order an attack.
- **Behavior / rules:** each CIWS engagement expends a large burst (AK-630 = 400 rounds) at the incoming
  missile and resolves an aggregate probability-to-hit. Over a full Sea Whiz engagement the demonstrated
  overall Ph was **~45%**. CIWS is a last-ditch "leaker" killer; it **cannot keep up when many missiles
  arrive at once**. Ships often mount fore + aft mounts; orienting (**"beaming"**) the ship so both
  mounts bear lets both engage. Limited arcs constrain which mounts can fire.
- **Outputs / effects:** burst expended; hit/miss; the ship continues to take damage from leakers while
  still firing (a ship can be 99% damaged / on fire and still defending).
- **Edge cases / quirks:** described as "dynamite against helicopters"; can be manually ordered to
  attack a specific target; arcs are limited so ship heading matters.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### Semi-active radar homing (SARH) short-range SAM single-target limit
- **Models:** an RIM-7 Sea Sparrow-class SARH interceptor can only guide on **one target at a time**
  because it homes on the **strongest illuminated radar return**.
- **Inputs / parameters:** illuminator/mount pointing; target radar-return strength; number of inbound
  targets; re-attack capability after a miss.
- **Behavior / rules:** the defender points the mount/illuminator at the incoming target; the SARH
  missile homes automatically on that target (strongest radar signal). Because of the SARH limitation,
  **only one inbound can be engaged at a time**. **Two missiles** are launched per engagement; if they
  miss there is time to **re-attack** with two more, but **no parallel** engagement of multiple inbounds.
- **Outputs / effects:** missiles launched at the single illuminated target; re-attack opportunity if
  missed.
- **Edge cases / quirks:** came out early 1970s but still effective vs older threats; explicitly
  contrasted with later systems that auto-retarget.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### Automatic re-targeting of an interceptor on miss/kill (modern SAM / ESSM)
- **Models:** modern interceptors automatically slew to the **next** inbound target when the current one
  is destroyed or the intercept misses.
- **Inputs / parameters:** number of inbound missiles in the engagement basket; interceptor seeker type
  (active); engagement range line.
- **Behavior / rules:** when an interceptor's target is destroyed or it misses, the missile "will
  automatically [re-]target the next missile effortlessly," cutting through a stream of inbounds without
  manual intervention. **ESSM packs four per VLS cell** (some ships up to **256** of them), enabling
  very efficient multi-target engagement vs older single-target SARH.
- **Outputs / effects:** sequential intercepts across multiple inbounds from one engagement.
- **Edge cases / quirks:** contrast with SARH, which cannot do this; the ESSM quad-pack greatly raises
  magazine depth.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### Long-range SAM used for missile defense, gated by late sea-skimmer detection
- **Models:** a long-range SAM can begin engaging inbound anti-ship missiles the instant they are
  detected, but sea-skimmers are detected so late that the long range is wasted.
- **Inputs / parameters:** SAM max engagement range (very long); inbound missile altitude (sea-skimmer
  **~20 mi** detection); cost asymmetry.
- **Behavior / rules:** if the radar is on and the inbound is detected far out, the long-range SAM "can
  actually begin engaging them immediately" at maximum range. But **sea-skimming missiles are not
  noticed until ~20 miles**, which "reduces the effectiveness of extremely long-range SAMs." Noted cost
  inefficiency: launching ~**$10M** SAMs at ~**$100k** anti-ship missiles, so there must be a balance.
  *(Compare the WRA auto-fire-range economy below in this section: firing defensive missiles at max
  range can also "fire over the heads" of fast maneuvering threats, so tightening the engage range
  conserves the magazine and raises per-shot Pk.)*
- **Outputs / effects:** early engagement when detection allows; otherwise the long range provides no
  benefit vs low flyers.
- **Edge cases / quirks:** **detection limit, not missile range, is the binding constraint** for
  sea-skimmers; the cost trade-off is called out.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** Med

### Laser point defense ("if you can see it you can hit it")
- **Models:** directed-energy point defense that kills an inbound only if it can detect/see it; defeated
  by denying detection.
- **Inputs / parameters:** laser-shots magazine (test platform had **10,000 laser shots**);
  line-of-sight/visibility to the target; fog/weather.
- **Behavior / rules:** the laser engages and destroys inbound missiles essentially the instant it has a
  track — **"if you can see it you can hit it."** Demonstrated against **Mach 4.2 KH-22s diving from
  ~75,000 ft** and it still killed them. The **only** way to defeat it is to prevent detection of the
  missile in the first place. **Fog blocks the laser** ("the laser can't see through the fog"), causing
  a leak.
- **Outputs / effects:** instant kill on a detected inbound; the magazine of laser shots is decremented.
- **Edge cases / quirks:** fog/heavy weather defeats it; stealth/no-detection defeats it; the very large
  shot count makes magazine depletion a non-issue in short engagements.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### Missile-defense rating (DB stat: missiles-to-score-a-hit) & all-aspect coverage
- **Models:** each ship has a published **"missile defense rating"** expressing how many incoming
  missiles of a given type it takes to score one hit at usual probability — a single scalar summarizing
  the whole PD ladder against a reference threat.
- **Inputs / parameters:** ship's anti-missile platform quality (database page → "missile defense");
  attacking weapon type (e.g. Harpoon).
- **Behavior / rules:** on a unit's database page, scrolling down shows a **"missile defense"** value:
  the number of missiles needed to score a hit with usual probability. Example: **CG-52 Bunker Hill
  requires 96 Harpoons** to hit it. The defense **faces all directions at all times**, so attacking
  from multiple angles "wouldn't make a single difference." The demo confirmed a Bunker Hill-class would
  defeat ~100 inbound ("would literally protect itself against a hundred ATM-96 [Harpoons]").
- **Outputs / effects:** an expected number of inbound rounds required before a hit; informs how many
  weapons an attacker must salvo. A salvo **below** the rating is expected to be fully defeated.
- **Edge cases / quirks:** **omnidirectional** coverage — angle of attack does **not** help (contrast
  the throughput-overload pincer tactic in §2). This is a derived/aggregate stat shown in the DB, not a
  per-shot value, and it is against a *reference* missile — a faster/higher-diving threat (KH-22 at
  Mach 4.2 / ~75,000 ft, diving) is far harder than the Harpoon baseline implies.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### Defeating modern missile defense: deny detection or jam the guiding sensor
- **Models:** two ways to beat layered missile defense — prevent the defender from ever **detecting**
  the launch, or **jam the specific sensor/fire-control** guiding the interceptors.
- **Inputs / parameters:** jammer strength; which sensor guides the weapon (ship radar vs the missile's
  own seeker); inbound missile altitude vs jammer altitude geometry.
- **Behavior / rules:** **Technique 1** — keep the defender from noticing the missile was launched at
  all. **Technique 2** — jam the fire-control directors / missile guidance, but ships have "very
  powerful radars" that are very hard to jam effectively. Jamming only works if you can jam **whatever
  sensor is actually guiding** that weapon; otherwise the intercept proceeds. **Geometry matters:** a
  jammer flying low while the inbound missiles fly high leaves the jamming field "so far below where the
  missiles themselves were" that the laser/defender still acquires them. Active-radar-seeker interceptors
  can still acquire through a mismatched jamming field. Bad weather + night + a poor visual fix further
  degrade a ship that lacks good air-to-air radar.
- **Outputs / effects:** a successful leak only if the guiding sensor is jammed or detection is denied;
  otherwise the intercept succeeds.
- **Edge cases / quirks:** stealth platforms are still detected and engaged once within a certain
  distance; an APY/air-search radar catching the jammer carrier negates the surprise; the jammer
  altitude must match the threat-altitude band to be effective.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** Med

### Saturation / oversaturation from multiple directions
- **Models:** the overall doctrine for defeating point defense — present **more simultaneous inbounds
  (and from multiple bearings)** than the defense can engage.
- **Inputs / parameters:** number of simultaneous inbound weapons; arrival timing; attack bearings; the
  defender's parallel-engagement capacity & magazine.
- **Behavior / rules:** "it's all about **oversaturation from multiple directions**" — defenses fail
  when more missiles arrive simultaneously than they can engage in the available time, regardless of how
  advanced each layer is. Conversely, to optimize the defense, position the units with the **best
  anti-air / anti-ship-missile systems directly in the path** of the incoming attack ("the best
  optimization is geometry, not hardware").
- **Outputs / effects:** leakers when defense capacity is exceeded; a clean defense when inbounds are
  below capacity.
- **Edge cases / quirks:** even an excellent layered defense (guns + CIWS + short-range + long-range +
  laser) can be beaten purely by simultaneity/volume.
- **Source:** 3E5MA0i5Wzc
- **Confidence:** High

### WRA auto-fire range & probability-to-hit (Pht) calculation (engagement economy)
- **Models:** a per-weapon **auto-firing-range** setting that governs automatic fires and the resulting
  hit probability against maneuvering targets. **This is the general probability-to-hit / Pht modifier
  chain and half-range rule** (CMO resolves each shot as a base Pk, then applies a chain of
  multiplicative/additive modifiers for speed/range/agility/deflection/EW, then rolls a d100 against the
  final number; a single hit/miss per weapon, with EW able to zero the whole chain). It applies equally
  to SAM defense and air-to-air shots.
- **Inputs / parameters:** WRA / "automatic firing range" setting per weapon type (e.g. set to half of
  max range); weapon maximum range; actual launch distance; target speed; target agility/maneuverability;
  line-of-sight / radar horizon (terrain masking); target ECM/jamming & RWR.
- **Behavior / rules:** hit probability is built up by **sequential modifiers** shown in the engagement
  detail box. Worked example near max range (~80 nm for Nike Hercules, max ~80 nm): "percent to hit
  adjusted for distance" = **46** (≈ −10% lost to extreme distance), then after agility/maneuver
  adjustments the **final probability to hit ≈ 20%** (called "terrible"). **Reducing range to half**
  (~40 nm) **removes the distance penalty entirely**: example showed "45 adjusted for target speed," "no
  adjustment for distance," final percent to hit = **25%**. A slower target yields higher Pht. Key rule:
  at long range you fire **far more** weapons that never connect (e.g. needing 4 missiles instead of 3);
  shrinking auto-fire range raises per-shot hit chance and conserves interceptors. Real advantage in
  saturation defense (e.g. Aegis vs sea-skimmers): launching SM interceptors at max range causes them to
  fly **over/past** the incoming missiles and miss; tightening the per-weapon max engagement range
  improves intercept probability.
- **Outputs / effects:** determines whether/when units auto-engage, how many weapons are expended, and
  the final hit probability; a mis-set (too-long) range wastes the magazine and misses maneuvering
  targets.
- **Edge cases / quirks:** if the target can **hide behind terrain/mountains** the long-range weapon
  becomes useless (it ducks behind the mountain). For a **non-maneuvering** target you may fire at
  absolute maximum range freely (no penalty matters). **Jamming/ECM and RWR can spoof every missile**
  (example: all SAMs "spoofed" by an Su defensive ECM until the ECM/RWR sensors were removed). Specific
  tip: the **F-14 firing long-range Phoenix at maximum range "will never hit anything."**
- **Source:** 2PzsXm-fhFA
- **Confidence:** High

---

## 7. Air-to-air missile guidance families

### Infrared (IR) homing missile guidance
- **Models:** heat-seeking air-to-air missiles that home on engine/airframe thermal signature.
- **Inputs / parameters:** target temperature/heat output (afterburner increases it); **visibility** to
  the target; atmospheric attenuation/range; missile aspect capability (rear-aspect vs all-aspect);
  high-off-boresight capability.
- **Behavior / rules:** sensor sensitivity is modeled from target **temperature** and (more important
  per the narrator) **visibility** to the target. Aspect gate by weapon era: **AIM-9B (1957)** is
  **rear-aspect** — only valid when shooting the target's back/rear quarter; **AIM-9X / P5** are
  **all-aspect** — valid from any angle as long as you point at the target **and** the target gives off
  enough heat. Newer weapons add **"high off boresight"** = can launch at an angle off the rail.
  Weapons are **fire-and-forget**: once off the rail the shooter can immediately turn away and need not
  use radar at all (silent ambush). Atmospheric absorption limits range, so long-range IR weapons are
  rare (cited exception: Russian **R-27T/ET**, an IR missile with **~30–40 nm** range).
- **Outputs / effects:** launch permitted/denied based on aspect + heat + visibility; the missile guides
  autonomously to the target after launch; the shooter is freed to maneuver immediately.
- **Edge cases / quirks:** IR weapons are treated as **visual** — if the target sits in thick/solid
  cloud cover the engagement is computed as impossible and the **fire command is blocked entirely**
  (cannot fire), regardless of turning on the fire-control radar or descending to e.g. 25,000 ft. Getting
  close enough might eventually allow a shot, but in cloud the weapon will not fire. An afterburning
  target is much easier to lock.
- **Source:** IhZP1Jxh5hw
- **Confidence:** High

### Semi-active radar homing (SARH) guidance (air-to-air)
- **Models:** the missile rides the **reflected energy** of the launching aircraft's radar painting the
  target.
- **Inputs / parameters:** launch-platform radar illumination on the target (must remain pointed at the
  target); target reflectivity; range (closing distance improves reliability).
- **Behavior / rules:** the shooter points/illuminates the target with its radar as strongly as
  possible, fires, and the missile tracks the **strongest source of reflected radar energy**. The
  launching aircraft **must keep its radar pointed at the target for the entire flight** of the missile.
  Reliability **increases as the missile gets closer**. If the shooter **breaks lock** (e.g. maneuvers
  away/dodges), the missiles go blind **instantly** and lose track. **Re-illuminating** (swinging back
  around to point the radar at the target) lets the missile **reacquire** and resume the engagement.
- **Outputs / effects:** the missile is guided only while illumination is maintained; loss of
  illumination = instant loss of track; reacquisition is possible on re-illumination.
- **Edge cases / quirks:** cited example weapon **AIM-7**; real-world counterparts **R-27R/ER**. Unlike
  IR, SARH is **not** blocked by deep cloud (radar penetrates weather). There are "other mechanical
  components" to the tracking the narrator does not detail.
- **Source:** IhZP1Jxh5hw
- **Confidence:** High

### Active radar homing (ARH) guidance with midcourse updates
- **Models:** the missile carries its own radar that activates late in flight; it gets midcourse
  steering from the launcher until then.
- **Inputs / parameters:** launch range; launcher radar lock on the target (until **pitbull**); the
  missile's own onboard-radar activation threshold (range-based); target position updates from the
  launch platform.
- **Behavior / rules:** at long range the missile is fired and **continuously receives midcourse
  updates** from the launching platform telling it where to steer ("turn right a little, turn left a
  little") relative to the launch platform's track. The shooter must keep pointing at the target
  **until** the weapons activate their own onboard radars. Once each missile turns on its active radar
  (goes **"pitbull"**), it acquires the target itself and the shooter can break away and disengage; the
  missiles then guide autonomously to impact. At very short range you can **"mad dog"** / fire
  immediately so the missile goes active straight off the rail.
- **Outputs / effects:** the missile self-guides after radar activation; the shooter is freed once all
  missiles are active; long-range shots require sustained lock through the midcourse phase.
- **Edge cases / quirks:** cited weapons — **AIM-54 Phoenix** (very long range), **AIM-120** (most
  common), the older **Genie**, and many SAMs use this method.
- **Source:** IhZP1Jxh5hw
- **Confidence:** High

### Cooperative Engagement Capability (CEC) / third-party missile guidance
- **Models:** a missile launched by one platform is guided by a **different networked platform** via
  datalink.
- **Inputs / parameters:** the missile must be a CEC-capable / "lock-on after launch" weapon (e.g.
  **AIM-120D**); a guiding platform with an active sensor (e.g. E-2 Hawkeye); a compatible
  communications datalink between the guiding platform and the missile (cited: "AIM-120 data link"); a
  target track held by the guiding platform.
- **Behavior / rules:** the shooter fires **without turning on its own radar**. The missiles receive
  position updates **not** from the shooter but from the separate guiding platform's radar, all the way
  to the target, then switch to their own active radar homing once close enough. This permits: (a) a
  shooter with **radar off**; (b) a shooter with **no radar at all** still scoring kills; (c) one
  fighter flips its radar on to "spook"/illuminate while a **second** fighter actually launches and the
  first guides the weapons in.
- **Outputs / effects:** the missiles are guided by the third-party platform's track; the shooter can
  stay fully passive/disengage; the terminal phase reverts to onboard active radar.
- **Edge cases / quirks:** requires the **correct comms datalink** — not every platform/missile can talk
  to the missiles; without the datalink the shot is not allowed. Noted as effectively "command guidance"
  returning in modern form. Cited as AIM-120D "lock on after launch, CEC capable."
- **Source:** IhZP1Jxh5hw
- **Confidence:** High

### IR seeker aspect class: rear-aspect / stern-chase missile
- **Models:** early IR Sidewinders (e.g. AIM-9B) can only lock and launch from **behind** the target
  (at its hot exhaust) and must chase it down; very short effective reach because the motor burns out
  fast.
- **Inputs / parameters:** weapon DB fields — "IR Seeker," "single spectral IR," sensor type "anti-air
  Stern" (rear-aspect); launch geometry (shooter vs target tail); closure/energy state; motor burn
  duration.
- **Behavior / rules:** the engine **refuses to fire** when the shooter is forward of / abeam the target
  ("when you have an air-rear Stern-Chase missile you can only launch at the stern"). A head-on intercept
  yields **no launch** even with the target locked and "in range." Maneuvering behind the target enables
  fire. Because the missile **burns its motor out very, very quickly**, the shooter must close
  "extremely close" before launch; after launch the missile begins its stern chase and bleeds energy.
  **AIM-9B fired 4 to down one B-52**, several missing.
- **Outputs / effects:** launch enabled/blocked by aspect; the missile flies a stern pursuit; hit/miss.
- **Edge cases / quirks:** the tail-chase requirement historically forced attackers into the target's
  tail-gunner field of view — why old B-52s / Tu-95 / Tu-16 mounted tail guns; modern all-aspect
  missiles removed that need (B-52H DB entries dropped the tail gun). **Single-spectral IR is less
  flare-resistant.** Hits-to-kill scale with target size (a B-52 takes many).
- **Source:** 8RAjIrn_meU
- **Confidence:** High

### IR seeker aspect class: all-aspect missile
- **Models:** later IR missiles (e.g. AIM-9M) sense the **heated skin** of the target, so they can lock
  from any direction including head-on; a dual-spectral seeker is more flare-resistant.
- **Inputs / parameters:** DB fields — "dual spectral IR" (multiple IR bands), sensor "anti-air all
  aspect"; launch geometry (any aspect); motor burn (~1 s) then energy bleed.
- **Behavior / rules:** lock/launch is permitted **from any aspect** because the seeker is sensitive
  enough to detect surface heating in any direction. The narrator gets into range "right away" on a
  front-on pass. After launch the weapon "burns for about a second and then immediately starts losing
  energy," but a front-on geometry denies the target the option to turn-and-run, improving kill odds.
  **AIM-9M fired 4 to kill one B-52 head-on.**
- **Outputs / effects:** launch enabled from the front aspect; the missile chases; multiple required for
  a large target.
- **Edge cases / quirks:** **dual-spectral IR is explicitly more resistant to flares** than
  single-spectral. Hits-to-kill scale with target size (a B-52 → ~4 Sidewinders).
- **Source:** 8RAjIrn_meU
- **Confidence:** High

### IR seeker field-of-view / high-off-boresight (HOBS) dogfight missile
- **Models:** the seeker arc/FOV is modeled per-weapon: old seekers have a very narrow FOV; modern ones
  (e.g. **R-73**) have a huge **~180°** forward arc and a **"dogfight high off boresight"** flag, letting
  a **helmet-mounted sight** cue the missile to fire at extreme off-axis angles.
- **Inputs / parameters:** DB fields — sensor Arc (R-73 "massive 180-degree arc"), property "dogfight
  high off boresight"; dual-spectral IR; helmet-mounted-sight cueing; lock time (~**3 s** shown);
  shooter-target relative angle.
- **Behavior / rules:** with a wide-arc HOBS weapon the shooter can lock and engage a target far off the
  nose ("out of our shoulder") — the pilot/HMS tells the seeker where to look. **~3 s** to
  acquire/enable the engagement after pointing the cue. On launch the missile flies straight off the
  rail for a moment then makes a sharp turn ("takes a left" / launches nearly sideways) to pursue any
  aspect of the target.
- **Outputs / effects:** engagement enabled at extreme off-boresight; a visibly oblique missile flyout
  that maneuvers onto the target.
- **Edge cases / quirks:** even a HOBS shot can miss if the target has time to accelerate away (one R-73
  engagement failed because the B-52 began accelerating out). Narrow-FOV legacy seekers cannot take
  these off-axis shots at all. Dual-spectral aids flare resistance.
- **Source:** 8RAjIrn_meU
- **Confidence:** High

---

## 8. Bomb guidance taxonomy & employment constraints

### Guidance types & their launch constraints (LGB / GPS-INS / command / passive / laser-JDAM)
- **Models:** how each weapon-guidance class is employed and what it can/can't hit. **This is the
  general guidance/loadout gating taxonomy:** each guidance class imposes a precondition (a gate before
  the Pk/CEP roll) on whether/where it can be employed; CEP itself is a per-munition accuracy +
  reliability rating.
- **Inputs / parameters:** weapon guidance label (**LGB** = laser; **JDAM/GPS/GLONASS** = satnav;
  **command-guided**; **passive** IR/laser/anti-radiation; **laser-JDAM** dual); target coordinates;
  laser source & its max range; weather/cloud; whether the target is moving; whether the target is over
  water.
- **Behavior / rules:**
  - **LGB (laser-guided):** needs a laser **continuously painting** the target the whole way; lasers are
    only visible to the bomb from about **2 nm (≈ 10,000 ft)**, so the painting platform must get into
    the line of fire / under the clouds — old aircraft (A-10A) need **someone else's** laser (laser-spot
    tracker), newer ones carry a **targeting pod** (a pod shown good to **40,000 ft**). If the
    illuminator dies, the bomb "goes huh" and crashes. LGBs can **re-attack**.
  - **GPS/satnav (JDAM/GLONASS):** fly to a commanded **coordinate**; you must **know** the target
    location; can be released from very high altitude (**up to ~60,000 ft**) and you can turn home before
    impact; **cannot hit a moving target**.
  - **Command-guided:** remote-control (e.g. Walleye, RB-05 flown with a joystick) — **cannot guide
    through cloud**.
  - **Passive (IR / laser / anti-radiation, e.g. Hellfire, CAB-500):** needs the target to emit or be
    illuminated; can't see a return laser through cloud.
  - **Laser-JDAM:** dual-mode laser **or** GPS — best/worst of both.
  - GPS-coordinate bombs like **CAB-500** are fire-and-forget and can attack through thick fog (demo hit
    through complete fog).
- **Outputs / effects:** determines required release geometry/altitude, weather tolerance, moving-target
  capability, and re-attack behavior; feeds CEP into the hit roll once the gate passes.
- **Edge cases / quirks:** **satnav/GPS bombs refuse to attack a target in the water** (assumes it won't
  hit). LGBs are weather/cloud-limited and altitude-dependent (must be low enough for the laser to reach,
  ~2 nm). **JSOW** noted as similar to CAB-500 but with **~50 nm** glide range. **Radar bombing** (B-52 /
  advanced) sees **through cloud** as long as the target is detected (only fails vs a soft point target
  like a man in the woods).
- **Source:** bPVkIPVlNlA
- **Confidence:** High

### Bomb employment constraints (range, bore/line-of-sight, weather, illumination)
- **Models:** the hard **preconditions** for releasing any bomb, and the factors that **degrade
  accuracy**.
- **Inputs / parameters:** range to target; bearing/bore alignment (must point at the target);
  line-of-sight (cloud/terrain); cloud cover; radar-bombing capability; pilot skill (proficiency);
  weather/wind; visibility (night); munition CEP/reliability; AAA threat.
- **Behavior / rules:** preconditions to drop — be **in range**; be **pointed at the target**
  (bearing/bore sight; there is **no over-the-shoulder bombing**); and have **line of sight**. Heavy
  clouds block optical/laser delivery (you can't shoot through cloud) **unless** the platform is
  **radar-bomb capable** (radar bombing ignores clouds as long as the target is detected — but not for a
  soft point target). Accuracy degrades with: lower **pilot proficiency** (veterans drop better),
  **wind** (extremely hard even with LGBs in bad weather), **poor visibility** (night bombing of a
  non-illuminated target won't hit), **munition quality** (each has a CEP/accuracy + reliability rating
  — lower CEP is better), and **being shot at from the ground** (accuracy drops, nothing you can do).
  With advanced/INS sights you can drop unguided from very high altitude without worry.
- **Outputs / effects:** whether a drop is permitted at all, and the resulting accuracy/CEP of the impact.
- **Edge cases / quirks:** avoid routing aircraft into AAA kill zones (accuracy and survival suffer).
  Radar bombing can't service a soft target with no radar return. Earlier LGB aircraft had to descend
  under the clouds specifically to get the laser to reach.
- **Source:** bPVkIPVlNlA
- **Confidence:** High

---

## 9. SEAD/DEAD & strike flight planning

### Per-waypoint flight-plan editing for strike missions
- **Models:** editing an individual aircraft/flight's route by moving waypoints and setting per-waypoint
  altitude/throttle to thread terrain and threat envelopes.
- **Inputs / parameters:** selected mission aircraft (must be launched/airborne to fully use); waypoint
  position (drag); per-waypoint altitude; per-waypoint throttle (cruise/afterburner); waypoint
  description/rename; F2 editor.
- **Behavior / rules:** selecting a mission aircraft and choosing the mission shows its flight plan as a
  **white line with waypoints**; left-click a unit shows which path it follows. Edit by
  **left-click-drag** to move a waypoint, or **left-click + F2** to open per-waypoint settings
  (description, throttle, altitude). Set each leg's altitude and throttle independently (e.g. cruise at
  36,000 ft, drop to 12,000 ft and kick afterburner approaching the IP, attack at 10,000 ft, egress then
  climb back to 36,000 ft at cruise to save fuel). Hold **Ctrl while left-click-dragging** a waypoint to
  spawn a **brand-new** waypoint, letting you route precisely (e.g. through a valley) below a known SAM's
  range.
- **Outputs / effects:** a customized altitude/speed profile per leg; the aircraft flies the edited plan.
- **Edge cases / quirks:** to select a hard-to-click waypoint, click the previous one and press the
  **Right-arrow** to step to the next. The **landing waypoint cannot be grabbed/moved** — grab the
  waypoint before it and make that your exit/egress point to stop afterburner fuel waste. With good intel
  you can route **outside** a known SAM's range (e.g. SA-2 ~30 nm) so it cannot engage.
- **Source:** K3LG_shk2pg
- **Confidence:** High

### Automatic-mode requirement for commanded altitude changes
- **Models:** aircraft only execute commanded waypoint altitude/throttle changes if their flight is in
  **automatic mode**.
- **Inputs / parameters:** flight automatic-vs-manual mode flag; commanded per-waypoint altitudes.
- **Behavior / rules:** an aircraft "can't descend [to commanded waypoint altitudes] unless you have
  this set to automatic mode." With automatic mode on, the aircraft hits the waypoint and automatically
  descends / kicks afterburner / changes speed exactly as ordered for that waypoint (demonstrated:
  crossing the pre-IP waypoint it auto-descended to **12,000 ft** and went to afterburner ~**700 knots**).
- **Outputs / effects:** commanded altitude/speed transitions actually execute (or not, if not in
  automatic mode).
- **Edge cases / quirks:** if not in automatic mode the per-waypoint altitude commands are ignored.
- **Source:** K3LG_shk2pg
- **Confidence:** High

### Target identification requires proximity / sensor type (classification gating)
- **Models:** contacts start as unknown "mobile" returns and must be approached (or imaged by the right
  sensor) before they classify into a specific type.
- **Inputs / parameters:** sensor type (**SHARP pod** = combined camera + synthetic-aperture radar; EO
  camera; air-search radar); range to contact; sensor on/off; weather/visual conditions.
- **Behavior / rules:** sensors first reveal **generic** contacts ("unknown, all mobile" = some vehicle)
  — could be a truck, a UAV, AAA, or an SA-6, with no way to tell until closer. Turning on a SHARP/SAR
  pod instantly populates contacts ("like night vision — click"). To classify, you must **get closer**;
  historically you'd skirt a recon aircraft (MiG-21R / camera) in at minimum altitude, get the photo,
  and turn away at the last second without getting shot down. A SAM taking a "pot shot" at you also
  reveals/IDs what it is. AEW (E-2 Hawkeye) provides continuous up-to-date intelligence once airborne
  with radar on.
- **Outputs / effects:** contact classification (unknown mobile → specific type); positional refinement
  of EW sites as you close.
- **Edge cases / quirks:** old-school visual recon is high-risk (must dash low and turn out at the last
  second); a fired/radiating SAM self-identifies; a SHARP pod dramatically reduces the need to fly into
  the threat.
- **Source:** pxnOTUgJHeA
- **Confidence:** Med

### SAM hold-fire-until-identified behavior (defender won't engage an unclassified contact)
- **Models:** an air-defense site generally **will not fire a SAM** at an aircraft until it has
  **identified** what type of aircraft it is.
- **Inputs / parameters:** the defender's identification state of the inbound aircraft; whether the
  aircraft overflies an EW/identification site.
- **Behavior / rules:** "they're not going to fire a SAM at me until they know exactly what kind of
  aircraft I am." The presenter deliberately **flies over the enemy EW site** to get his aircraft
  identified so the SAM will then engage (so he can bait and kill it). Conversely, if you avoid being
  identified you have more freedom to operate. To bait a known SA-2: drop to low altitude using terrain
  (a large mountain range) to trick it into firing, loose HARMs in its direction, then immediately
  egress.
- **Outputs / effects:** whether the SAM fires; a baiting opportunity once identified.
- **Edge cases / quirks:** staying unidentified prevents engagement; overflying an EW site triggers
  classification and subsequent SAM engagement.
- **Source:** pxnOTUgJHeA
- **Confidence:** Med

### Anti-radiation (HARM) engagement requires the target radar to be radiating
- **Models:** HARMs can only lock/engage an emitter that is **actively radiating**; a powered-off radar
  cannot be targeted by a HARM.
- **Inputs / parameters:** target radar emitting/radiating state; HARM seeker; pre-selection of the
  target.
- **Behavior / rules:** "since it's not actually radiating we can't do anything with it just yet" — a
  HARM cannot engage a non-radiating radar. SEAD play therefore **baits emitters**: provoke a SAM/gun
  radar into turning on its fire-control (e.g. by presenting a target so it shoots) to get a "freebie"
  HARM shot. You can **pre-select** a target for HARMs, but the shot only proceeds when it radiates.
  Occasionally HARMs **fail to lock** onto a battery even when it has fired ("my HARMs do not want to
  lock onto that battery"). Demonstrated: with "no radar left on this map," the remaining HARM-armed
  aircraft were useless.
- **Outputs / effects:** HARM lock/launch only against live emitters; a wasted sortie if nothing is
  radiating.
- **Edge cases / quirks:** non-radiating radars are immune to HARM (kill them with guns/CBU instead);
  HARMs may still occasionally fail to lock a radiating battery; against a known SAM you bait it to
  radiate then shoot.
- **Source:** pxnOTUgJHeA
- **Confidence:** High

### SEAD vs DEAD loadout distinction and weapon economy
- **Models:** Suppression (**SEAD**, kill the radar) vs Destruction (**DEAD**, kill the radar then
  destroy the site) are distinguished by the **loadout** carried.
- **Inputs / parameters:** loadout composition (HARM-only vs HARM + CBU/APAM like CBU-59; laser
  Maverick); target type (just a radar vs a full site).
- **Behavior / rules:** a package is **DEAD** (not just SEAD) when it carries **both** a missile to kill
  the radar **and** a cluster weapon (CBU) to destroy the site. Weapon-economy rule: don't waste an
  expensive HARM on something that is "just a radar" — an unarmed EW radar can be killed with **guns or a
  cheap CBU/laser Maverick**, saving HARMs for actual SAM batteries (e.g. the long-range SA-2). Conserve
  the standoff/expensive weapons for the threats that require them.
- **Outputs / effects:** which weapon is committed to which target; preserved HARM inventory for SAM
  batteries.
- **Edge cases / quirks:** killing a bare EW radar with a gun pass is the "cheapest and easiest" option;
  reserve HARMs for radiating SAM batteries.
- **Source:** pxnOTUgJHeA
- **Confidence:** Med

### Terrain masking / line-of-sight defeats SAMs and recon exposure
- **Models:** terrain (mountains, valleys, reverse slopes) blocks radar/SAM line-of-sight; ducking
  behind terrain breaks lock and a fired SAM gets "lost" in the terrain.
- **Inputs / parameters:** terrain elevation between shooter and target; aircraft altitude; valley/ridge
  geometry; SAM in-flight path vs terrain.
- **Behavior / rules:** routing through a valley or behind a mountain range **denies the SAM
  line-of-sight**; a launched SA-2 "is going to get lost in the mountain range" / arcs into terrain and
  misses. An SA-6 that lacks line-of-sight **cannot engage** ("did the SA-6 get line of sight? No it does
  not"). Recon-wise, ducking over a valley **breaks radar lock** (safer than zig-zagging in the open).
  High ground (a peak overlooking a valley) is the logical place for a warning site because it sees down
  into the valley — so check it before transiting. Conversely a wide flat zone gives SAM batteries long
  warning and clear shots.
- **Outputs / effects:** SAM no-fire or in-flight miss when LOS is broken; safe ingress corridors via
  terrain.
- **Edge cases / quirks:** a SAM already fired can be defeated by ducking behind terrain mid-flight;
  valleys that look conveniently placed often hide short-range threats — reconnoiter them first.
- **Source:** pxnOTUgJHeA
- **Confidence:** High

### WRA range adjustment to force vertical drops / minimize weapon flight time
- **Models:** editing the mission's **WRA firing range** changes how far out weapons are released;
  reducing it forces aircraft to drive in close and drop near-vertically, minimizing weapon flight time.
- **Inputs / parameters:** mission WRA firing-range setting; weapon type (JDAM vs LGB/GBU); target AAA
  reaction time; aircraft altitude.
- **Behavior / rules:** if you release standoff weapons (e.g. JDAMs) far out, the AAA/SAM gets "a lot
  more time" to launch / lock onto the falling weapons and shoot them down. Going into the mission's
  **Weapon Release Authority** and **reducing the firing range** makes the aircraft drive right up and
  drop the weapons (near-vertically) "right on top" of the target, giving defenses "no time in which to
  react." For **JDAMs the release altitude doesn't matter** to the weapon, so dropping vertically
  minimizes weapon flight time. The presenter notes he "usually loses every single JDAM" when firing
  from long range at active AAA, so minimizing flight time is key.
- **Outputs / effects:** shorter weapon time-of-flight; fewer weapons shot down by point defense;
  near-vertical impact geometry.
- **Edge cases / quirks:** long-range release exposes the weapon to AAA/SAM the whole way down; JDAM is
  altitude-agnostic so a steep close drop is optimal vs reactive guns (Zeus/Shilka).
- **Source:** pxnOTUgJHeA
- **Confidence:** Med

### Manual afterburner on the attack run for time-on-target minimization
- **Models:** aircraft do **not** automatically go to afterburner during an attack run; manually
  commanding afterburner minimizes exposure time in the threat's death zone.
- **Inputs / parameters:** per-leg throttle (afterburner) setting in the flight plan; the attack-run
  leg; fuel state.
- **Behavior / rules:** "for some reason they don't [go to afterburner] automatically" on the attack run
  — you can edit the flight plan directly to kick everyone to afterburner during the attack to minimize
  time spent in the engagement zone. Trade-off: sustained afterburner burns fuel fast, so set a
  downstream **egress waypoint back to cruise/altitude** to stop the waste once clear.
- **Outputs / effects:** reduced time-in-threat-envelope at the cost of fuel; faster ingress/egress.
- **Edge cases / quirks:** must be set manually (not automatic); pair with an egress waypoint at cruise
  power to avoid running out of fuel.
- **Source:** pxnOTUgJHeA
- **Confidence:** Med

### Standoff from a slow VTOL platform (Harrier "pretend to be a helicopter")
- **Models:** a platform that can fly **very slowly** (Harrier) can release standoff/laser weapons at
  extreme range and turn home, with the weapons arriving **before** the launcher enters threat range.
- **Inputs / parameters:** platform minimum speed (Harrier can go very slow / hover-like); weapon
  standoff range (laser Mavericks); target short-range threat envelope (e.g. Shilka/ZSU ~1 mile).
- **Behavior / rules:** because the Harrier can fly very slowly, it can loose all its standoff weapons at
  extreme range and immediately turn around; "because I'm traveling so slow, the missiles get there
  before [the aircraft gets] in range" of the short-range defenses. This lets it engage AAA/short-range
  SAMs from **outside their lethal envelope** and egress without overflying the target — an advantage
  most fast jets lack (they must overfly and get "ripped" by AAA). Effective against gun systems
  (Shilka/Zeus, ~1 mile range) and SA-2/SA-9 once the long-range threats are suppressed.
- **Outputs / effects:** targets destroyed from outside their engagement range; the launcher survives
  without overflight.
- **Edge cases / quirks:** laser-guided weapons require the launcher to keep the target in view / not
  turn away too early ("turn back around or my lasers won't work"); slow speed is the enabler, so the
  tactic is platform-specific; a Zeus/Shilka remains "very tricky" even so.
- **Source:** pxnOTUgJHeA
- **Confidence:** Med

### Beaming a tracking radar/missile to defeat lock
- **Models:** flying **perpendicular (beaming)** to a tracking radar degrades its lock vs flying directly
  away from it.
- **Inputs / parameters:** aircraft heading relative to the threat radar (beam vs flee); radar type.
- **Behavior / rules:** demonstrated as the correct evasion — an aircraft that "is beaming it rather than
  running from it" is doing the right thing ("a huge difference between what you should be doing versus
  what he chose to do"). Beaming (crossing perpendicular to the radar) frustrates the track, whereas
  running straight away keeps a clean closing/opening Doppler and gets you killed. (The same beaming
  concept is used at sea to orient a ship so both CIWS mounts bear — see §6.)
- **Outputs / effects:** degraded enemy radar lock / improved survival when beaming vs fleeing.
- **Edge cases / quirks:** running directly away from the radar is the wrong move (the demo aircraft did
  this and died); qualitative — no numeric lock-degradation given.
- **Source:** pxnOTUgJHeA
- **Confidence:** Low

---

## 10. Ballistic-missile attack & defense

### Ballistic trajectory: range sets reentry speed, reentry angle, and the engagement window
- **Models:** core physics of ballistic missiles — they boost, burn out, then coast on a ballistic arc;
  the chosen **range** shapes the entire intercept problem.
- **Inputs / parameters:** launch-to-target range; rocket/boost; weapon max altitude (apogee, e.g.
  ~**300 km** example); min vs max range firing choice.
- **Behavior / rules:** after launch the missile burns its engine, runs out of fuel, and coasts the rest
  of the way. **Greater range forces higher boost speed**, so the projectile **reenters faster**. Range
  also sets the **reentry angle**: short/minimum-range shots come almost **straight down** (a vertical,
  easy "aim straight up" shot for the defender but with a very short engagement window because it falls
  fast); long/flat shots (ICBM-like) reenter **shallow**, giving the defender plenty of time but
  requiring an interceptor that can make a deflection (lead) shot. A weapon with **high apogee
  (~300 km)** can spend most of its flight inside an interceptor's engagement envelope.
- **Outputs / effects:** determines which interceptors are geometrically/kinematically capable, and how
  long the defender has to react.
- **Edge cases / quirks:** designer tip — firing at **minimum range** makes defenders miserable (very
  short reaction window, missile falls out of the sky); MLRS-type tactical ballistic missiles are
  extremely short reaction-time.
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Interceptor engagement gates: min/max range, min/max speed, max target altitude, cruise altitude
- **Models:** every anti-ballistic interceptor has hard min/max bounds on **range**, **speed**, and
  **target altitude**; a target outside any bound **cannot be engaged**.
- **Inputs / parameters:** interceptor max range (examples: **SC-19 ~645 nm**; **Aegis Ashore ~300 nm**;
  cat-house **Dunay-3U** radar **1500 nm**, **Hen House/Nester 1900 nm**); interceptor max engageable
  target speed (**SA-26 max 2300 knots**); cruise altitude & max target altitude; the incoming target's
  current speed & altitude.
- **Behavior / rules:** an interceptor can fire only if the target is within its min/max **range** AND
  within its min/max engageable **speed** AND within its max target **altitude**. Cruise altitude and
  max-target-altitude can "severely limit" what a long-range system can engage. Concrete gating example:
  the **SA-26** has a max engageable speed of **2300 knots** — a reentering MIRV group doing ~**1100
  knots** is engageable, but a target reentering at **Mach 7.6** is too fast for the SA-26 to fire on.
  **Iskander DECM** trades a longer (wider-arc) flight for reentry speed so high that point-defense
  systems "can't actually fire at that speed because it's too darn fast."
- **Outputs / effects:** a fire / no-fire decision per interceptor; an **unwinnable** scenario if no
  available system's envelope covers the threat's speed/range/altitude.
- **Edge cases / quirks:** designer warning — if the threat's speed/altitude/range falls outside **every**
  available interceptor's envelope, the player literally cannot win; radars must also be physically
  **pointed in the correct direction** to detect/guide.
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Interceptor "overshoot" from too-long boost vs a descending target
- **Models:** an interceptor fired too early spends so long boosting/climbing that it **overshoots** the
  top of a target that has begun reentering (descending).
- **Inputs / parameters:** interceptor boost/climb time; the time the shot is taken vs when the target
  starts arcing downward; target reentry speed; the deflection required.
- **Behavior / rules:** if you fire while the ballistic target is still high and then it starts arcing
  down, an interceptor that spends a long time in boost will **overshoot from above** as the target
  descends (a too-large deflection shot). Repeatedly demonstrated: **Aegis Ashore overshot** a descending
  ICBM RV; **Arrow-3s** "spent so much time in boost they basically literally overshot the top";
  **THAAD** went "right under the missile because of the speeds involved." The fix is to **not** fire at
  maximum range and to time the shot so you are not overshooting as the target reenters — i.e. limit the
  engagement so the interceptor and target geometry match.
- **Outputs / effects:** miss (overshoot) vs hit depending on launch timing/range relative to the
  target's descent.
- **Edge cases / quirks:** player remedy — reduce the interceptor's firing range / wait until the
  trajectory tips downward; firing too early wastes the shot. A short-range interceptor (THAAD/Patriot)
  can cleanly hit a fast descending RV that a long-range one overshoots.
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Boost / midcourse / terminal phase intercept and the energy-bleed arc of mid-course interceptors
- **Models:** **where** in the trajectory an interceptor meets the target (boost, midcourse-above-
  atmosphere, or terminal) changes geometry and effectiveness; **mid-course interceptors fly their own
  ballistic arc**.
- **Inputs / parameters:** interceptor type (SC-19 mid-course / GMD; SH-11 high-arc; Gorgon nuclear;
  SA-26 short-range); target altitude (examples cited **290–373 km**); intercept geometry.
- **Behavior / rules:** different interceptors take different paths: **SC-19s** "fly at the missile"
  (direct), **SH-11s** climb very high then arc down ("mid-course"), **short-range** systems wait for
  descent. SH-11/mid-course interceptors climb to their own cruise altitude and then **arc downward** on
  their own ballistic trajectory to get in front of the target. Firing them **too early** bleeds their
  energy (they reach cruise/coast before reaching the target); the presenter waited for the target
  trajectory to **tip downward**, but waiting too long shortens intercept time. Interceptors that boosted
  **above** the incoming weapon "can never geometrically hope to hit it"; ones still climbing /
  unfinished boosting can't reach it either — a hit needs matching geometry. The wiggles/squiggles seen
  are the interceptor maneuvering onto an intercept heading.
- **Outputs / effects:** a hit only when boost timing and arc geometry align with the target; otherwise a
  geometric miss.
- **Edge cases / quirks:** mid-course (GMD/SC-19) can hit the bus before MIRV separation (see next rule);
  gazelles/nuclear interceptors struggle vs fast-moving ICBMs.
- **Source:** DLX9f5QMxOQ
- **Confidence:** Med

### MIRV separation (the "bus" splits into multiple independent reentry vehicles + decoys)
- **Models:** a ballistic missile that **splits** at/near apogee into many independently-targeted reentry
  vehicles, each a separate target, optionally accompanied by **decoys**.
- **Inputs / parameters:** missile type (MIRV-capable, e.g. DF-5A / SLBM); apogee/altitude at split;
  number of RVs and decoys; defender interceptor count.
- **Behavior / rules:** near the top of the trajectory the **"bus" separates** and drops individual
  warheads onto multiple aim points. Each RV is a separate small projectile; some RVs can
  re-target/zig-zag in the atmosphere, some cannot. Reentry vehicles **slow** when they hit the
  atmosphere (no longer boosted) but there are so many that even good terminal systems get overwhelmed.
  Defenders "never just drop the bombs — you also drop **decoys**" to make discrimination harder. The key
  defensive goal is to **hit the missile before it splits** (see next rule); once split, you typically
  lack enough interceptors to reliably engage every RV.
- **Outputs / effects:** many simultaneous terminal targets (plus decoys); high probability of leakers.
- **Edge cases / quirks:** post-split RVs slow on reentry; some RVs re-target/zig-zag (appear to "stop");
  a single SLBM salvo of MIRVs can present hundreds of targets if many subs fire — a near no-win.
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Mid-course intercept before MIRV split (GMD / SC-19 / Aegis Ashore advantage)
- **Models:** long-range mid-course interceptors that engage the missile while it is still a **single
  body** (before it breaks into MIRVs), eliminating many warheads with one kill.
- **Inputs / parameters:** interceptor range (GMD/Aegis Ashore very long; example altitudes 290–373 km);
  time-to-split; whether the interceptor reaches the target before separation.
- **Behavior / rules:** if a mid-course interceptor (**GMD, SC-19, or Aegis Ashore**) can hit the missile
  before it splits into MIRVs, that **removes all those warheads at once** and saves the inner layers
  work. Aegis Ashore "is able to engage before the weapon breaks into the different pieces" and assigns
  **~2 missiles per incoming weapon**. SC-19 can **re-target after a miss**. Once the missile has split,
  these long-range systems are **useless** because there aren't enough of them to engage every RV.
- **Outputs / effects:** one pre-split kill removes multiple inbound RVs; post-split these interceptors
  are ineffective.
- **Edge cases / quirks:** a race against split timing; Aegis Ashore demonstrated firing 2 interceptors
  per inbound and re-targeting on a miss.
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Nuclear anti-ballistic interceptor (proximity kill)
- **Models:** nuclear-tipped interceptors (Gorgon/SH-11/Gazelle) that only need to get **close enough** —
  a proximity detonation kills the target without a direct hit.
- **Inputs / parameters:** interceptor proximity to the target; nuclear-weapons enable/disable doctrine
  flag (weapons-hold); target speed (gazelles limited vs fast targets).
- **Behavior / rules:** nuclear interceptors do not need a direct hit: "as long as one gets close enough
  it's not going to matter" — the nuclear blast clips the inbound. When they detonate it produces a
  nuclear explosion (which can chain/clip nearby inbounds, even other RVs). They remain subject to
  geometry: an interceptor that boosted above or hasn't finished boosting still can't reach the target. A
  conventional **"Gazelle"** variant exists but has trouble hitting targets moving too quickly (struggles
  vs ICBMs). Nuclear ABMs only fire **if nuclear weapons are enabled** (weapons-hold/disable gates them).
- **Outputs / effects:** a proximity kill of one or more inbounds; a nuclear-detonation effect on the map.
- **Edge cases / quirks:** Gazelle limited vs very-fast targets; nuclear ABMs won't fire while nuclear
  weapons are disabled in doctrine; one nuke can clip multiple nearby RVs.
- **Source:** DLX9f5QMxOQ
- **Confidence:** Med

### Weapon doctrine: rounds-assigned-per-incoming-target (salvo discipline / ROE)
- **Models:** doctrine controls how many interceptors/weapons are committed per incoming target, to avoid
  waste and avoid running out.
- **Inputs / parameters:** weapon doctrine / ROE setting (interceptors per inbound); per-target Pk;
  whether the target is a MIRV vs a single body.
- **Behavior / rules:** set ROE so you do not commit multiple weapons to one inbound that already has a
  high Pk. Aegis Ashore auto-assigned **~2 missiles per incoming weapon**. General guidance: vs a
  **MIRV-type** target the minimum is **2** interceptors; vs a **single** inbound missile you can "dump
  your entire stack." If about to be saturated, set doctrine to fire only **one** missile per incoming
  weapon to **stretch the magazine**. The player's core job is deciding how many weapons to fire at each
  incoming target.
- **Outputs / effects:** the number of interceptors committed per inbound; magazine longevity.
- **Edge cases / quirks:** over-committing wastes interceptors and accelerates magazine exhaustion
  (running out of interceptors is the usual failure mode under saturation).
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Offensive ballistic-missile saturation tactics (attacker doctrine)
- **Models:** how an attacker maximizes leak-through — fire more than the defender has interceptors, fire
  at minimum range, synchronize arrival, add MIRVs/decoys/jammers.
- **Inputs / parameters:** number of missiles vs number of defender interceptors; firing range (min vs
  max); arrival timing/synchronization; MIRV/decoy use; jammers.
- **Behavior / rules:** the easiest way to make the defender lose is to **launch more missiles than they
  have interceptors**. **Fire at minimum range** to shorten reaction time. A few MLRS batteries can
  saturate almost any defense. To "crush another country," launch everything at once — the only
  requirement is making the weapons **arrive at the same time**, otherwise the defense piecemeals them.
  **Jammers** can extend/degrade the defender's reaction further. Add **decoys** alongside MIRVs to
  complicate discrimination.
- **Outputs / effects:** defender saturation / guaranteed leakers when volume or simultaneity exceeds
  defender capacity.
- **Edge cases / quirks:** staggered (non-simultaneous) arrival lets the defender defeat the salvo
  piecemeal; deny targeting info or force shot-spacing to defend.
- **Source:** DLX9f5QMxOQ
- **Confidence:** High

### Ballistic-missile flight profile & effective-speed model (time-on-target)
- **Models:** how simulated ballistic missiles climb, cruise, and re-enter, and the **effective average
  speed** used to estimate arrival time.
- **Inputs / parameters:** weapon maximum range; actual shot range (as % of max); the weapon's listed
  cruise/vertical speed and altitude bands; a hard altitude breakpoint of **65,000 ft**; a global
  effective-speed constant **4,500 (knots)** for all ballistic missiles; the top speed of the specific
  weapon.
- **Behavior / rules:** short-range ballistic missiles reach the target sooner initially but then slow;
  long-range missiles take long to reach altitude but then **match** their peers' speed once high. The
  per-altitude vertical-speed table does **not** hold above the breakpoint: below 65,000 ft a missile may
  be rated e.g. 200 kt but observed speed climbs (226 → 230 → 250 → 274 kt) and the moment it crosses
  **65,000 ft** it accelerates dramatically ("whoosh"), invalidating naive band-by-band integration. At/
  above range thresholds the trajectory shape changes: fired at exactly the right range it flies a clean
  ballistic arc; fired **beyond** that it goes up, then **plateaus** at a constant top speed for a stretch
  (observed cruising at constant speed for ~**136 km** without changing speed) before dumping the RV to
  re-enter. Empirical effective-speed relationship: the global effective speed of all ballistic missiles
  is quoted as **4,500**; for **long-range** missiles, firing at **half (50%)** of max range gives an
  effective speed equal to the **RMS factor (0.707)** of that weapon's top speed; for **short-range**
  weapons (e.g. Scuds) ~**75%** (later cited ~**71%**) of range gives a slightly faster value, and 4,500
  corresponds to ~**52%** of max speed. Practical guidance: peak/fastest effective speed occurs somewhere
  **between 50% and 75% of maximum range** — beyond that it takes too long to slow on re-entry, below
  that it never has time to speed up.
- **Outputs / effects:** an estimated total cruise/arrival time for time-on-target coordination; rough
  rule = pick **65% of the weapon's max speed** and divide range by it for an arrival estimate.
- **Edge cases / quirks:** the presenter concludes CMO's ballistic projectile model is **not precise
  enough** for exact time-on-target math, especially for long-range weapons (> ~1,000 nm, e.g.
  DongFeng-17) where the plateau behavior spoils closed-form calculation. **Atmospheric friction is
  modeled** (which broke the cited research-paper approach that omitted it). Cited arrival ballparks:
  Russia → US ICBM ~**20 min**; short-range ~**5 min**. The RMS/0.707 value is explicitly an empirical
  fit, not a documented formula.
- **Source:** QKc9ZHwPcXo
- **Confidence:** Med

### Missile motor burnout and kinetic-energy decay ("exhausting the missile")
- **Models:** missiles run a finite-duration rocket motor, then **coast** on accumulated kinetic energy
  that bleeds off with air density, gravity, and stall speed.
- **Inputs / parameters:** motor burn duration (boost/sustainer); accumulated kinetic energy at burnout;
  air density (altitude); stall speed of the missile; battery/seeker life; gravity; the target's evasive
  energy management.
- **Behavior / rules:** added in **build 1243.5** (ported from the Professional edition). On launch the
  missile runs its motor for a short time, accelerating (observed SA-2 climbing to ~**1,400 kt** on boost
  motor); once the motor **burns out** the missile coasts and the energy it built during the climb is all
  it has left to reach the target. Coasting speed decays rapidly in dense air (observed missile decaying
  **1,400 → 965 kt** while chasing). The flight is bounded by stall speed and by battery/seeker life;
  beyond effective energy a missile often **self-destructs**. Defender AI counter (autonomous): instead of
  beaming, the fighter does a **"turn and burn"** — turns away and goes full afterburner to run the
  missile out of energy ("exhausting the missile"). Pitching/diving into thicker low air drains the
  missile faster, but diving lets the missile regain energy from gravity. Gameplay consequence: a missile
  with a long **sustainer** motor gains a major effective-range edge in air-to-air, and **printed max
  range can far exceed** the range at which a coasting missile can actually still kill.
- **Outputs / effects:** missile speed/energy over time, effective (vs printed) engagement range, and a
  kill or self-destruct outcome; rewards energy-management tactics for both shooter and target.
- **Edge cases / quirks:** HARM/anti-radiation profile — **lofts very high then glides down**; the motor
  burns then it glides to the target (loft depends on launch range and HARM version); it slows as it
  re-enters thicker atmosphere near impact. Self-destruct/expiry explains "how did it shoot that far" when
  chasing a fleeing target. Emission-control (MCON) interacts: a SAM site set to yellow/continuous/
  intermittent emission affects when it acquires and fires (intermittent mode noted as powerful,
  deferred). **Printed maximum range ≠ the range you can still score a hit at after burnout.**
- **Source:** o89BWqy-83U
- **Confidence:** High

---

## 11. EMP weapons

> This section is the authoritative, exhaustive treatment of EMP for this bucket. EMP/microwave is an
> **electronics-only** effect: it damages **electronics/comms** (scaling with how modern they are and
> whether they are powered on), line-of-sight at speed-of-light, and causes **no HP/structure loss** by
> itself — a sensor/comms mission-kill, not a hard kill.

### Omnidirectional vs directional EMP warhead
- **Models:** two EMP delivery patterns — **directional** (focused cone) vs **omnidirectional** (spreads
  energy in all directions).
- **Inputs / parameters:** EMP warhead type (omnidirectional vs directional); aim point; delivery
  platform (AGM-158 stealth cruise; GBU-31 JDAM).
- **Behavior / rules:** **directional EMP** = a "tight blast like a shotgun," concentrating energy into a
  cone at a particular system. **Omnidirectional EMP** spreads energy everywhere, wasting much of it
  blasting in the wrong direction, to cover a bigger area; one center hit can damage an entire
  co-located group even if not aimed at each unit. The **standard (non-Pro) edition only has
  omnidirectional EMP**. Available EMP weapons in-game: **AGM-158** (stealth cruise-missile EMP) and
  **GBU-31** (JDAM EMP); plus **nuclear** weapons as EMP sources. **No anti-ship EMP weapons** exist
  in-game.
- **Outputs / effects:** an area (omni) vs focused (directional) EMP effect footprint; damage spread
  across nearby units (omni).
- **Edge cases / quirks:** omnidirectional area-effect damages clustered units together (good vs grouped
  SAM sites); directional avoids the fall-short problem (see next rule).
- **Source:** xzP8hBNXiu0
- **Confidence:** High

### EMP cruise-missile "fall-short" detonation offset
- **Models:** air-delivered EMP cruise weapons consistently detonate **short** of the aim point, so you
  must aim **beyond** the target.
- **Inputs / parameters:** aim point; weapon type (AGM-158 JASSM-style); delivery profile.
- **Behavior / rules:** the weapon "always, always, always falls short" of the commanded aim point.
  Demonstrated: aiming at a point, the weapon detonated short by roughly a **full nautical mile** (aim was
  the half-mile / 1-mile / 2-mile / 3-mile reference; actual detonation ~**1.5 mi** from a unit that was
  supposed to be ~0.5 mi from aim). Mitigation: **aim/overshoot beyond** the intended target so the short
  fall lands the EMP on it. This applies to **omnidirectional** EMP; directional EMP's shotgun spread
  avoids needing to compensate.
- **Outputs / effects:** the actual detonation point is offset short of the aim; determines which units
  fall inside the EMP footprint.
- **Edge cases / quirks:** unclear whether it's an engine limitation or modeled realism (presenter
  unsure); directional EMP does not require the compensation.
- **Source:** xzP8hBNXiu0
- **Confidence:** High

### EMP susceptibility: modern vs legacy electronics, and powered-on vs powered-off
- **Models:** EMP damage probability scales with **how modern** the target's electronics are and
  **whether they are currently energized** (radars on vs off).
- **Inputs / parameters:** target electronics modernity (modern S-300 vs legacy SA-2); component type
  (fire-control radar, search radar, command data link); radar on/off state; range from detonation;
  per-event randomization.
- **Behavior / rules:**
  - **Rule 1 — modernity:** EMP works **better on modern electronics** — "the more modern the electronic,
    the more effective it will be" (applies to missile warheads, aircraft, radios alike).
  - **Rule 2 — power state:** electronics that are turned **on** (especially radars) suffer **far more**
    damage than if turned off.
  Demonstrated: a modern **S-300 with radar on at 0.5 mi** had its fire-control radar annihilated + command
  data link badly damaged; the same system **at 1 mi** still took significant search + fire-control
  damage; with **radar off** the same modern unit only had its data link "nipped," and a 1-mi radar-off
  unit took **no** damage. A legacy **SA-2 with radar on** in line-of-sight took **no** damage at the
  demonstrated range; at 1 mi only very minor (radar-off-equivalent) damage. Damage is **randomized per
  event** ("a little random each time"). **Component-level damage is tracked** separately (fire-control
  radar, search radar, command data link).
- **Outputs / effects:** per-component damage state (nipped / badly damaged / destroyed) on each affected
  unit; loss of fire-control, search, or comms links.
- **Edge cases / quirks:** per-strike randomization; legacy systems with radars off survive best; in an
  alpha strike each unit took its own weapon and modern radar-on units were destroyed while legacy
  radar-off units were only lightly damaged.
- **Source:** xzP8hBNXiu0
- **Confidence:** High

### EMP effective range and line-of-sight propagation
- **Models:** EMP has a **finite radius** beyond which there is no effect, and it is **line-of-sight
  blocked** by terrain.
- **Inputs / parameters:** distance from detonation (reference rings 0.5 / 1 / 2 / 3 nm); EMP weapon type
  (omni vs directional reach); terrain/mountains; airburst height.
- **Behavior / rules:** EMP has a **hard outer radius**: in the demo "none of the EMP reached this far"
  at 2–3 nm for the omnidirectional weapon (units at 2 nm typically took no damage; you need a
  **directional** EMP to reach farther). EMP is "generally **line of sight**" — hiding on the opposite
  side of a mountain shields a target; **airbursts extend coverage** over terrain. EMP also pulses at the
  **speed of light** (units far away are hit "instantly").
- **Outputs / effects:** a binary in-range/out-of-range effect plus LOS masking; damage falls off with
  distance.
- **Edge cases / quirks:** terrain masking (reverse-slope) protects targets; directional EMP reaches
  farther in its cone than omni; an airburst broadens the LOS footprint.
- **Source:** xzP8hBNXiu0
- **Confidence:** Med

### Nuclear EMP vs blast-radius interplay (small vs large yield)
- **Models:** whether a nuclear weapon's EMP matters depends on **yield** — small yields are dominated by
  blast; large yields produce long-range EMP well beyond the blast.
- **Inputs / parameters:** yield (examples: **1.5 kiloton**; **9 megaton** "Tsar"-class); detonation
  distance from targets; blast radius vs EMP radius.
- **Behavior / rules:** **small nuclear weapon** — an EMP pulse exists but is so short-lived that the
  physical blast overtakes the EMP range, so the explosion itself kills whatever the EMP touched; you
  don't need EMP for a small nuke. Demonstrated **1.5 kt**: distant units were nipped by EMP at
  light-speed, then the blast swallowed them; units **beyond blast** took **no** EMP damage and survived
  — here a conventional **directed EMP weapon actually out-performed** the small nuke for EMP purposes.
  **Large nuclear weapon (9 Mt):** can EMP targets at **extremely long ranges** from the blast center;
  detonated far away, "everybody instantly got cooked by electromagnetic pulse," and the
  modern-vs-legacy and radar-on-vs-off susceptibility rules **still hold** (modern radar-on destroyed,
  legacy radar-off only lightly damaged).
- **Outputs / effects:** a blast kill vs an EMP-only effect depending on yield and distance; EMP damage
  states following the modernity/power rules.
- **Edge cases / quirks:** for small yields the EMP is irrelevant (blast dominates); large-yield EMP can
  produce flak-like air effects; the same modernity/radar-state susceptibility applies to nuclear EMP.
- **Source:** xzP8hBNXiu0
- **Confidence:** Med

### EMP destroys communications (comms-disruption play option)
- **Models:** EMP knocks out **radios/data links**, not just radars — usable to sever a whole formation's
  communications.
- **Inputs / parameters:** the communication-disruption game option enabled; EMP footprint over a
  formation; command data link components.
- **Behavior / rules:** EMP "doesn't just destroy radars, it also destroys communication." With the
  **communication-disruption option enabled**, an EMP can knock out the communications of **every unit in
  an entire formation** so they cannot talk to each other / receive guidance. Loss of the **command data
  link** also prevents a SAM site from talking to its missiles (seen in the per-unit damage as "command
  data link badly damaged").
- **Outputs / effects:** severed comms / data links across affected units; degraded coordination and
  missile guidance.
- **Edge cases / quirks:** requires the comms-disruption option to model formation-wide comms loss;
  data-link loss specifically breaks missile control.
- **Source:** xzP8hBNXiu0
- **Confidence:** Med

### EMP attack-placement trick vs hardened SAM sites (offset detonation + stealth)
- **Models:** the best way to EMP a hardened site (e.g. S-300) is to detonate on something **nearby**
  rather than the site itself, ideally with a **stealth** delivery.
- **Inputs / parameters:** target site hardness; nearby aim points; stealth weapon (still detected within
  a certain distance); EMP area effect.
- **Behavior / rules:** to attack an S-300 site with EMP, **detonate the weapon on something nearby**
  rather than aiming directly at the site, leveraging the area EMP effect. This is especially relevant
  with stealth weapons because "whenever you use things that are stealth they're going to be picked up
  anyway once they get within a certain distance" and will be engaged — so relying on a direct stealth
  approach to the site is risky; an offset detonation still EMPs it.
- **Outputs / effects:** EMP damage to the hardened site without needing a direct, defended approach.
- **Edge cases / quirks:** stealth weapons are detected and can be engaged once inside a threshold
  distance, so don't count on penetrating all the way to the site.
- **Source:** xzP8hBNXiu0
- **Confidence:** Low

---

## 12. Hypersonic & advanced strike weapons

### Hypersonic Glide Vehicle (HGV) flight profile and post-boost glide
- **Models:** an HGV (e.g. IR-CPS) boosts to high altitude on a **relatively shallow arc**, releases an
  **unpowered glide vehicle** that pops up then performs a low sub-orbital **skip-glide** through the
  atmosphere toward the target, intentionally staying **low** to hide behind the Earth's curvature.
- **Inputs / parameters:** boost climb angle (~**42°** shown); apogee/release altitude (the glide vehicle
  climbed to ~**78,000 ft** after separation); speed (cruises ~**Mach 4–6** in atmosphere); atmospheric
  drag; range-to-go (e.g. **760 nm**); terminal dive into thicker air.
- **Behavior / rules:** the booster lofts on a casual ~42° arc (**not** a steep ballistic shot), then at
  the top of the arc the warhead/glide vehicle **separates** ("this is the platform, this is the actual
  warhead"). The unpowered glider climbs slightly (~78,000 ft) then does a sub-orbital arc/skip-glide
  sustained only by momentum + atmosphere, **staying low to use Earth-curvature masking**; in the
  terminal phase it "ducks downward" into thicker atmosphere and picks up energy on descent. Sustained
  atmospheric speed ~Mach 4–6.
- **Outputs / effects:** a low, curvature-masked trajectory; **later** radar detection than ballistic; a
  terminal dive.
- **Edge cases / quirks:** because it flies in the dense lower atmosphere it is comparatively **slow**
  (Mach 4) and follows a "fairly predictable trajectory" once acquired. A near-**Mach-30** readout was
  called out as a **sim quirk/anomaly** (would exceed orbital/escape velocity; ~24,000 mph observed,
  ~48,000 mph = escape) and **explicitly told to ignore**.
- **Source:** fX6TBorNbHM
- **Confidence:** Med

### Ballistic missile lofted trajectory and re-entry (ASBM / IRBM)
- **Models:** a pure ballistic missile climbs on a **very steep/vertical lofted arc** to extreme altitude
  (hundreds-to-1000+ km apogee), then re-enters and dives onto the target at high terminal speed; near-
  zero maneuverability at high altitude.
- **Inputs / parameters:** loft angle (near-vertical, "points straight up"); apogee (~**160 km** vertical
  shown; narration says the arc can be ~1,000 km class / past ISS ~360 km); re-entry speed (~**Mach 6+**;
  earlier "7–8 km/s" cited); terminal maneuverability (essentially none at altitude).
- **Behavior / rules:** the missile boosts nearly straight up to a very high apogee, spends a long time
  building energy, then must **cancel that energy** on re-entry as it drops back into the atmosphere and
  dives on the target at high Mach. At high/exo-atmospheric altitudes it has "now no maneuverability."
- **Outputs / effects:** very high apogee, steep re-entry, high terminal-speed impact.
- **Edge cases / quirks:** the steep climb defeats some search radars — the radar beam "no longer sees
  above it" once the missile goes very vertical (geometry too steep), so it is briefly detected then
  lost. Conversely its exo-atmospheric, non-maneuvering re-entry makes it an **easy target for exo
  interceptors** (SM-3). Far cheaper to mass-fire than HGVs ("could fire 400 and they will get through").
- **Source:** fX6TBorNbHM
- **Confidence:** Med

### HGV maneuver energy-bleed vulnerability
- **Models:** an HGV **can** maneuver in atmosphere, but any significant turn at hypersonic speed creates
  huge drag that **bleeds energy**, so after dodging the first interceptor it lacks energy to evade
  follow-up shots.
- **Inputs / parameters:** vehicle speed (~Mach 4, "7 km/s" direction example); required turn magnitude
  (e.g. **30°**); object size/drag; number of incoming interceptors.
- **Behavior / rules:** to turn, the vehicle must overcome its forward momentum (speed in its current
  direction) and accelerate sideways, generating "a tremendous amount of drag." Modeled like "a cruise
  vessel trying to skid on ice" — it sheds a significant fraction of speed per maneuver. Result: it may
  defeat the **first** interceptor by maneuvering, but the **second** interceptor finds it slow/easy
  because it "burnt up so much energy" turning.
- **Outputs / effects:** lower post-maneuver speed; raised hit probability on subsequent interceptor
  shots.
- **Edge cases / quirks:** despite marketing as un-interceptable, HGVs in the demo were **killed easily by
  exo-atmospheric interceptors (THAAD)** once they slowed in atmosphere — "no better even with multiple,
  against conventional technology" because atmospheric drag slows them so much.
- **Source:** fX6TBorNbHM
- **Confidence:** Med

### Radar horizon / curvature masking & altitude detection envelopes for high-speed threats
- **Models:** detection of incoming missiles depends on **line-of-sight over the Earth's curvature** and
  on the radar beam's **elevation envelope** — low HGVs stay hidden by the horizon until close; very-high
  steep ballistic tracks can rise **above** the beam.
- **Inputs / parameters:** threat altitude/trajectory; defender radar position and beam-elevation
  coverage; range; Earth curvature; target IR/heat signature (atmospheric heating aids satellite/IR
  detection).
- **Behavior / rules:** low-flying HGVs are "still hidden by the horizon" at long range and were only
  acquired ~**430 miles** out (still "plenty of room" to start interceptors). High ballistic missiles
  were detected far off due to altitude but then **lost** when they pitched so vertical that the radar
  beam couldn't see above them. **Atmospheric heating** of fast vehicles (Mach 6) makes them detectable
  via IR/satellite ("bright flash," heat).
- **Outputs / effects:** detection range / track-hold differs by trajectory; the cueing window for
  interceptors.
- **Edge cases / quirks:** curvature both **helps the attacker** (HGV masking) and **hurts the
  defender's** reach. A high-altitude exo target is easy for exo interceptors precisely because it's out
  of the atmosphere with a clean track.
- **Source:** fX6TBorNbHM
- **Confidence:** Med

### Anti-ballistic interceptor engagement geometry (THAAD / SM-3 / Patriot)
- **Models:** interceptors are **tier-specialized by engagement regime**; an interceptor optimized for one
  altitude band/geometry can whiff if the threat's trajectory phase puts it outside that band at intercept
  time.
- **Inputs / parameters:** interceptor type (**THAAD** = exo/high reach; **SM-3** = exo-atmospheric;
  **Patriot / "Lambda"** = lower atmospheric, needs Fire-Control-Quality lock); reach/range; threat
  altitude at intercept (HGV ~**120,000 ft** and ducking lower); required precision; lock state; Ctrl+V
  engage command shown.
- **Behavior / rules:** THAAD fired with correct timing for the HGV's **upward** trend, but because the
  HGV's terminal phase **ducks into lower atmosphere** (~120,000 ft and descending), the interceptors flew
  "right over the top" / behind the curvature and many drove into the ground — a **reach/geometry
  mismatch**. SM-3 cleanly killed the **exo, non-maneuvering** ballistic re-entry vehicles (clear track,
  no atmosphere). **Patriot ("new Lambda")** must spin up Fire-Control Radars and get a "Fire-Control-
  Quality lock" before firing on low cruise threats. Engagements consume many interceptors per kill;
  saturation forces interceptor expenditure.
- **Outputs / effects:** a hit/miss vs the threat phase; large interceptor expenditure; some threats leak
  through.
- **Edge cases / quirks:** using an exo-optimized interceptor against a dipping HGV is called out as "the
  mistake" — long reach demands a precise shot and the terminal dive defeats it. Saturating defenses
  "wastes an awful lot of missiles" even when intercepts succeed.
- **Source:** fX6TBorNbHM
- **Confidence:** Med

### Low-observable subsonic cruise missile (JASSM / AGM-158) penetration
- **Models:** a slow **stealthy turbojet** cruise missile (JASSM) is essentially undetectable — it
  terrain-follows through hills/valleys/weather and cannot be locked, so it leaks through air defenses far
  better than fast ballistic/HGV weapons.
- **Inputs / parameters:** missile type **AGM-158 JASSM** (own engine, much slower, very low
  detectability); terrain/weather along the route; defender detection capability; salvo size; cost.
- **Behavior / rules:** defenders had "no knowledge we'd been launched at" and could not detect the
  launching **B-52** either, so nothing could be fired at the platform. The cruise missiles **navigate
  carefully through terrain and weather** and pop out near the target; very accurate terminal results with
  little interference. They got through where mass ballistic/HGV salvos were heavily intercepted.
- **Outputs / effects:** low/late detection; high leak-through and accurate target destruction.
- **Edge cases / quirks:** expensive ("not cheap," 24 fired ≈ "budget of some small countries"). The
  point-defense at the target is still looking **up** for fast threats and is mismatched against the low,
  slow cruiser.
- **Source:** fX6TBorNbHM
- **Confidence:** Med
