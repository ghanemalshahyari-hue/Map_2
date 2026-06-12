# CMO Functional Rules — Movement & Detection

**Scope.** Implementable behavior rules extracted from P Gatcomb's *Command: Modern
Operations* tutorial transcripts, covering the **Movement & Detection** cluster:
unit movement (throttle/altitude/fuel, formations, grouping, waypoints), detection &
sensors (radar, radar horizon, look-down/shoot-down, aspect/RCS, IFF, ESM,
jamming/EMCON, visual sensors, MPA altitude), and terrain/environment effects on
movement & detection.

**Videos read for this spec** (videoId in parentheses):
- *Tactical Effects of Altitudes* (KOOxlw5dfrU)
- *Tutorial - Radar* (7mmQ2y11hPc) — radar fundamentals
- *Understanding Radar Horizon* (bsLLZwqi4Mg)
- *Terrain Masking* (wycT9grtrOE)
- *Helicopter Terrain Masking* (hu1Mu_qaXQ8)
- *Look Down/Shoot Down Radar* (xV-H7HJd2-I)
- *Radar Aspect and Detectability* (1r4P_gI-Pdw)
- *Electronic Support Measures* (oF8LwbZSm28)
- *IFF* (0R6-5oQR-l0)
- *Effect of Multiple Jammers on Detection* (FI-ZwDubiMY)
- *MPA Altitudes* (_qeXJWmRBks)
- *Visual Sensor Distances* (A7oqIAMhKF8)
- *Visual Sensors and time of day* (o4bPT47vuK8)
- *Effects of Rain on Detection* (P6UAdBqTUhk)
- *Cloud Cover's Effects on Spotting* (yhs02DUz9bg)
- *Land Cover* (2SJDdTiuRPs) — terrain land-cover effects on spotting/attack/movement
- *Effects of formation spacing* (I2HX_78aErs)
- *Grouping and Formations* (0mxcfrMWpSU) — group/formation editor mechanics
- *Grouped vs Single Ground Units* (eame83G2Asw)
- *Determining a point in terrain with the best LOS* (u9R-59fusCM) — Lua best-LOS algorithm
- *Effects of Volume on Detection Range* (-Q9AfTrF4vM, sonar — included for the
  detectability-vs-emission math model)
- *Making a unit move, pause, and then move again* (xhmuBfBQ_DY)

**Caveat.** Transcripts are auto-generated (YouTube captions), so numbers and unit
names may contain transcription errors. Where a number is stated, it is captured
verbatim and flagged; where it is qualitative, that is noted explicitly.

---

## Movement

### Altitude bands and their tradeoffs
- **Models:** how flight altitude trades fuel economy, sensor line-of-sight, and exposure to threats.
- **Inputs / parameters:** altitude band (low / medium / high), aircraft fuel-burn-vs-altitude table, threat envelope of defending systems.
- **Behavior / rules:** Three working bands the narrator uses:
  - **High (~36,000 ft):** best electronic line-of-sight ("if it's out there and electronically detectable, we detect it as long as we can see it"); best fuel economy (see fuel rule); but you are very easy to detect from the ground and give the enemy a long engagement window (defenders began shooting ~30 mi before the strikers reached the target).
  - **Medium (~10,000–18,000 ft, demo used 12,000 ft):** a tradeoff — somewhat reduced sensor LOS but a much shorter enemy engagement window.
  - **Low (terrain-following, demo used 1,000 ft):** minimal enemy reaction time but you traverse the full short-range AAA / MANPADS / short-SAM corridor; worst fuel economy.
- **Outputs / effects:** changes fuel range, who detects whom first, and engagement-window length.
- **Edge cases / quirks:** A waypoint's altitude is only reached **at** that waypoint — the aircraft does not descend early. To be low *before* a threat point you must insert an intermediate waypoint earlier (see Waypoint altitude timing). Defensive maneuvering can be disabled on strikers so they hug the deck while escorts soak missiles.
- **Source:** *Tactical Effects of Altitudes* (KOOxlw5dfrU)
- **Confidence:** High

### Fuel burn vs altitude
- **Models:** altitude-dependent fuel consumption from the unit database.
- **Inputs / parameters:** altitude band, speed setting (cruise/military/afterburner); per-airframe database table.
- **Behavior / rules:** For the demo F-16 at **cruise**: between **36,000 and 45,000 ft → 21 kg fuel/min**; at moderate altitudes **~29–30 kg/min**. That is roughly a **30% higher consumption** at the middle altitudes, and "if my consumption goes up 30%, my range decreases by the exact same amount."
- **Outputs / effects:** higher altitude → less burn → longer range/endurance. Low-altitude legs can cause strikers to run out of fuel before reaching the target.
- **Edge cases / quirks:** Common technique: hold/cruise high (e.g. 36,000 ft) to save fuel, then drop to attack altitude only at a late waypoint. Numbers are airframe-specific — read them from the database per unit.
- **Source:** *Tactical Effects of Altitudes* (KOOxlw5dfrU)
- **Confidence:** High (numbers stated for the demo F-16)

### Waypoint altitude timing
- **Models:** how a unit transitions altitude/speed along a flight plan.
- **Inputs / parameters:** per-waypoint altitude, speed (cruise/military/afterburner), terrain-following toggle, manual-override altitude.
- **Behavior / rules:** A unit only begins changing to a waypoint's altitude/speed **once it reaches the previous waypoint** — i.e. the new value takes effect on the leg *into* the waypoint, not before it. To be at altitude X by point P, set point **P-1** to X (manual override). Inserting an intermediate waypoint is the standard way to schedule an early descent. Speed settings are likewise per-leg (e.g. afterburner on the dash-in leg, cruise after).
- **Outputs / effects:** controls exactly where the profile changes; mis-set altitudes get you detected early.
- **Edge cases / quirks:** The narrator repeatedly warns that the sim "automatically resets all your hard work every time you do anything" — re-check assigned altitudes after any edit. "Holding" waypoints should be set high to save fuel.
- **Source:** *Understanding Radar Horizon* (bsLLZwqi4Mg), *Tactical Effects of Altitudes* (KOOxlw5dfrU)
- **Confidence:** High

### Helicopter altitude vs throttle (terrain masking)
- **Models:** real helicopter low-level flight — slow = lower, fast = pop up to clear obstacles.
- **Inputs / parameters:** throttle/speed setting (loiter / cruise / military), AGL altitude.
- **Behavior / rules:** Helicopter AGL altitude is tied to throttle: **loiter ≈ 50 ft AGL; cruise ≈ 100 ft AGL; military ≈ 100 ft AGL.** When ordered to move from a hover, a helicopter at 50 ft automatically climbs to ~100 ft AGL to avoid obstacles at speed. To stay maximally masked you must use a loiter speed.
- **Outputs / effects:** lower speed → lower altitude → better terrain masking and lower detectability behind ridgelines.
- **Edge cases / quirks:** "Pop-up attack": order a hover, then briefly command a higher altitude (demo: 200 ft) to fire over a ridge, then descend. Note: automatic evasion mode can make a low helicopter climb/sprint and expose itself ("it'll try to shoot away at high speed").
- **Source:** *Helicopter Terrain Masking* (hu1Mu_qaXQ8)
- **Confidence:** High

### Move → pause → move (ground units)
- **Models:** scheduling a halt mid-route.
- **Inputs / parameters:** waypoints with per-waypoint speed; optionally a mission start-time / time-on-target.
- **Behavior / rules:** No native "wait N minutes" order; three approaches:
  1. **Speed-changed waypoints:** WP1 at full throttle, WP2 a short distance away with speed set to *minimum*, WP3 the finish. Pause duration = distance / (very low) speed; you can do the division to time it, or use a small holding box.
  2. **Delayed mission:** set up a strike mission with a start time or time-on-target; units stay put until kickoff then move. Requires the units to start **out of weapons range** of targets (else they fire immediately) and the mission set **inactive** while being configured.
  3. Lua scripting (not usable in situ).
- **Outputs / effects:** unit halts then resumes on schedule.
- **Edge cases / quirks:** A *moving* ground unit is generally easier to detect than a still one, but against side-looking airborne radar (E-8 JSTARS) or a MIG-25RBSh's radar a stationary vehicle is still detected at range — so the speed trick gives little stealth benefit against those sensors.
- **Source:** *Making a unit move, pause, and then move again* (xhmuBfBQ_DY)
- **Confidence:** High

### Naval formation spacing
- **Models:** dispersion of a surface group vs incoming saturation attack.
- **Inputs / parameters:** spacing between units (demo: 1 nm, 10 nm, and stacked ~150 m).
- **Behavior / rules:** Spacing changes how interceptors must engage incoming missiles. Tight clustering lets ships concentrate defensive fire on shared inbound tracks with no deflection geometry; very wide spacing forces long-range interceptors into hard deflection shots. A quirk: ships have **no collision volume** — they can be stacked into the same point and fire through each other.
- **Outputs / effects:** affects leakers vs intercepts; "ultimate cheese": stacking makes the group fuse into a single contact (confuses opponents) and concentrates defensive fire.
- **Edge cases / quirks:** A practical reason to place ships extremely close: a hit/sinking ship remains a target and keeps drawing incoming weapons, soaking fire that would otherwise hit a nearby high-value vessel. Multiple contacts at the same point/altitude eventually **fuse into one contact**. (The spacing itself is set via the formation editor's per-station offsets — see *Grouping & formation editor*.)
- **Source:** *Effects of formation spacing* (I2HX_78aErs)
- **Confidence:** Med (qualitative; the only numbers are the spacing distances tried)

### Grouped vs single units (damage model)
- **Models:** whether a unit is a single hit-point object or a distributed collection of sub-units.
- **Inputs / parameters:** database "damage points" field; whether the unit has a populated weapons/components list.
- **Behavior / rules:** A **single unit** (e.g. a P-19 "Flat Face" radar truck) has a finite damage-points value (truck = 1 damage point → one good hit kills it). A **distributed/battery unit** (e.g. SA-2 battery) shows **0 damage points** because it is not one target — you must destroy each sub-component (individual launchers, search radar, fire-control radar, MANPADS, etc.) separately. A hardened aircraft shelter example had **350 damage points** (needs many hits). Killing the search radar of a battery does not kill the (separately-tracked) fire-control radar.
- **Outputs / effects:** explains why "the effect of the weapon is not what you expected" against batteries; partial damage degrades specific capabilities rather than removing the unit.
- **Edge cases / quirks:** A battery can keep fighting if a component that can cue its weapons survives. Warhead "damage points" of the attacking weapon are compared against the target's damage points (e.g. Standard ARM warhead ~62, Maverick ~66, vs a 64-point Osa).
- **Source:** *Grouped vs Single Ground Units* (eame83G2Asw)
- **Confidence:** High

### Grouping & formation editor (mechanics)
- **Models:** collecting units into a group that moves together, with a station-keeping formation editor.
- **Inputs / parameters:** selected unit set; group lead (the member tagged "lead"); per-station **location** offset and **bearing mode** (relative `R` vs fixed); ghosted-group-members game option (all groups / selected only / do not show); unit type (ground/naval vs aircraft).
- **Behavior / rules:**
  - **Group / ungroup:** select units and press **G** (or right-click → Group operations → Group selected units, or Unit orders → Group) to form a group; the group then collapses to a **single lead icon** on the map and accepts normal movement/attack orders as a unit. Pressing **Delete** on the lead deletes the whole group at once.
  - **Member selection:** by default you cannot select individual members of a selected group. Tapping **numpad 9** toggles a mode that lets you select individual members. **D** detaches the selected members into a separate group; re-selecting everything and pressing **G** re-links them to the lead. A detached single unit remains a one-member group. (The re-link-after-detach behavior is new vs the previous Command version.)
  - **Independent action:** linked members still act independently — in an airstrike (element/flight/squadron) they engage targets normally, and only re-form into formation when given a **movement** command.
  - **Formation editor (F4 / "formation editor"):** every formation has a **lead** unit; each other unit keeps a **station** with a location and a bearing mode. **Relative bearing** (marked `R`) rotates the station relative to the lead's heading — order the group onto a new course and ships move *radially* to hold the same relative bearing. **Fixed bearing** holds an absolute point regardless of where the lead is (use for pickets that must stay in a fixed sector). You can also reassign the lead and lay units out manually (e.g. an old-school **line of battle**) — but turns are not choreographed: when the lead turns, members rush to re-take station rather than turning in sequence. Formation placement has a stated "precision issue."
  - **Naming:** groups can be named separately from their members; named groups appear cleanly in the Order of Battle and can be selected as the group to attack with in a mission.
  - **Aircraft limitation:** in the demoed build (**1134.3 / "build 1 1 3 1134.3"**) aircraft do **not** hold a formation-editor station — they keep flying their normal path even if you assign stations. You **can**, in individual-member view (numpad 9), set a per-member **altitude** different from the rest of the group (e.g. one at max, one at medium) — watch for an accidental altitude stack hitting a target at a bad angle.
  - **Mega-groups:** you can launch all aircraft at a base simultaneously as one large group (demo: 12). Typical group launches are 4 (sometimes up to 6). Because the **mission editor caps group size at 6**, launching a large hand-built group is the way to mass more than six aircraft on one target.
- **Outputs / effects:** coordinated movement, station-keeping for naval/ground formations, and a way to mass aircraft beyond the mission-editor limit.
- **Edge cases / quirks:** Map-display "ghosted group members" option controls how many members are drawn (all groups → very cluttered map; do-not-show → only the lead). Airbases are themselves groups of multiple units (click the arrow to expand). Formation editor display does not clearly show relative positions, so manual layouts take some fiddling.
- **Source:** *Grouping and Formations* (0mxcfrMWpSU)
- **Confidence:** High

---

## Detection & Sensors

### Radar fundamentals (band, wavelength, resolution, waveform)
- **Models:** how a radar's database characteristics (generation, band/wavelength, PRF, waveform, scan type) drive its detection range, positional accuracy, and counter-detectability. This is the foundational rule the other radar mechanics specialize.
- **Inputs / parameters:** per-radar database fields — **generation** (1950s → modern), **type** (air search / surface search / fire control / height-finder / terrain-avoidance / weather / nav), **range** (instrumented; short / medium / long), **operating bands (search and track)**, wavelength/frequency, **PRF** (pulse repetition frequency), waveform (pulse / continuous-wave / FM / pulse-Doppler), scan/update method (mechanical rotate, electronic, phased array, synthetic-aperture), and **two separate radar-detection-range values** carried on each *target* (one for long wavelengths, one for short).
- **Behavior / rules:**
  - **Principle:** radar sends a pulse and times the return at light-speed; in-game this yields range to the target. A 6.1-nm return ≈ 0.0000003 s one-way (doubled for the round trip) — instantaneous for game purposes. Raw radar inherently returns **range only**, not altitude (see height-finding).
  - **Generation:** newer radars are more sensitive and have better processing and anti-jamming. 1950s radars could be jammed through their side-lobes so badly the whole scope blanks; modern radars detect the jammed frequency and hop. Processing matters as much as raw power — a 1-MW old radar can equal a 25-kW modern one because the modern set processes better, and better radars **integrate** multiple passes over the same area to pull a weak signal up over time.
  - **Band / wavelength tradeoff (core rule):** long wavelength / low frequency → can transmit **much higher power** → **longer detection range**, but **poor resolution**: the contact smears across an arc and you may get range only, with no reliable heading/altitude (positional **ambiguity**). Short wavelength / high frequency → far **better resolution** (tight, reliable track with speed + heading) but shorter range — this is why **fire-control radars use short wavelengths** and **early-warning radars use long wavelengths** (extremely high power). Mechanically scanned long-wave sets need several sweeps before the track tightens.
  - **Two detection ranges per target:** every unit carries a long-wavelength and a short-wavelength radar-detection-range. For non-stealth aircraft they are equal; for stealth (e.g. **F-22**) the **long-wavelength** value is much larger — a 1950s long-wave EW radar detects an F-22 significantly more easily than a short-wave fire-control radar can. (Implements the "long-wave sees stealth, short-wave guides weapons" tradeoff.)
  - **PRF → max range:** the pulse repetition frequency sets the radar's typical maximum range (the set stops listening past the distance light can round-trip in one interval, avoiding range ambiguity). Sophisticated processing can extend beyond this.
  - **Waveform:** earliest radars were **pulse** (send, then listen). **Continuous-wave (CW)** pours energy continuously and reads Doppler but can't range by itself; **frequency modulation (FM)** tags successive emissions with slightly different frequencies so the return can be matched to its emission and ranged. Many **fire-control radars illuminate continuously** to guide semi-active weapons (e.g. a Sparrow needs the target lit), and an airframe (demo F-16A) can carry separate **search (pulse)** and **track (CW)** settings.
  - **Scan / update rate:** mechanically scanned radars only detect a target when the beam sweeps onto it; the database **update rate** can be as slow as **once every ~10 s** on old sets, so contacts go stale (a "2 s"/age counter shows under the symbol) between sweeps and a maneuvering target can be lost. **Phased-array** radars electronically scan nearly instantaneously (very fast update, more precise, hard to counter-detect, can also classify the airframe). **Synthetic-aperture / side-looking** radars move the whole platform instead of the antenna (satellites, MiG-25 recon).
  - **Coverage volume:** a radar's vertical coverage is a 3-D **cone** — a target far below the cone is invisible even to a look-down/shoot-down set (demo Patriot array could not see a target ~50,000 ft directly overhead).
  - **2D vs 3D / height-finding:** a plain 2D radar gives range/bearing but **no altitude**; **3D / height-finding** radars use multiple lobes (slices) to derive altitude. Historically a 2D search radar was **paired** with a dedicated **nodding height-finder** radar to supply altitude for contacts the search radar found.
  - **Radar types in CMO:** air search (includes missiles), surface search (military sets resolve enough to spot **periscopes** — controlled via the "Dive when threat detected"/periscope option; 70s sets detect at short range, a P-8 much farther), fire control (tight wavelength, often **paired kits** so two targets can be tracked one per side; losing a director cripples weapon direction; some have TV backup), multifunction (e.g. a Top Plate searches air **and** surface and is 3D), terrain-avoidance/following (lets an aircraft auto-clear terrain even when the TFR is **off** — demo F-111 popped to ~250 ft, max ~350 ft over the ridge), and **weather/nav** radars (a civil airliner's generic Doppler-nav radar — detecting it just flags a probable civilian).
- **Outputs / effects:** determines for each radar how far it detects, how precisely it locates (point vs smear), whether it yields altitude, how fast it updates, and how detectable it is to enemy ESM.
- **Edge cases / quirks:**
  - **Frequency agility / LPI:** a very frequency-agile radar that fires very short pulses all over the sky (demo **F-22**) can be impossible for enemy ESM to even register as emitting, while a conventional radar is instantly classified and bearing-fixed. Wide-bandwidth radars transmit over a frequency range (harder to jam); a strong enough radar can **burn through** jamming.
  - **Weather:** rain/moisture along the path attenuates radar (heavy rain throws the contact around the scope for weak sets); clouds generally **don't** block radar unless extremely water-laden. (See Rain and Cloud entries for the detailed model.)
  - **Counter-detection truism:** "the first to emit is the first to get hit" — except for very sophisticated phased-array/LPI radars.
  - A developer anecdote: the only change the US military requested to the radar model was switching the math from **decimals to logarithms** (cited as a credibility note, not a usable rule).
- **Source:** *Tutorial - Radar* (7mmQ2y11hPc)
- **Confidence:** High (model High; specific numbers Med — auto-caption)

### Radar horizon (line-of-sight limit)
- **Models:** Earth-curvature / LOS limit on radar detection range.
- **Inputs / parameters:** target altitude, radar/sensor mast height above its platform, Earth curvature.
- **Behavior / rules:** All radars are LOS-limited. Maximum detection range against a target is the *lesser* of the radar's instrumented range and the radar-horizon distance for that geometry. Lower targets are detected at much shorter ranges; high targets near the radar's max instrumented range. In the demo, a 240-nm radar detected a 36,000-ft target at ~240 nm but a 104-ft-AGL target only when very close. Detection range increases monotonically with both platform/sensor height and target altitude.
  - **Radar/sensor height inputs:** for a ground/sea platform on the water the radar height is the **mast height** (database field, e.g. "10 m ≈ 32 ft"); some platforms have an explicit "height" option. If no height is listed, interpolate/experiment.
  - The tutorial uses a "radar horizon and target visibility calculator": given **own height** and **radar height** it returns a target-visibility distance (e.g. own 36,000 ft + radar mast 32.8 ft → ~240 nm; 32,000 ft → ~196 nm; 25,000 ft → ~201 nm [transcript noise]; 12,000 ft → ~141 nm; 10,000 ft → ~125 nm; 8,000 ft → ~160 nm [noise]; 1,500 ft → ~60 nm). Treat exact figures as approximate (auto-caption), but the model is "altitude maps to a horizon distance." The Radar tutorial reproduces this with a generic radar-horizon calculator: a **1,000 m** target against a **30 m** radar mast gives a horizon of only **~22 nm / 22 km** — i.e. an aircraft below 1,000 m vs a 30 m mast can hide from a long-range radar purely on LOS.
- **Outputs / effects:** lets an attacker plan a descending altitude profile (sine-wave / staircase) to stay just under the defender's horizon, popping up only when needed, while keeping high altitude as long as possible for fuel.
- **Edge cases / quirks:** **Over-the-horizon (OTH) radars** ignore the radar horizon (bounce signals off the upper atmosphere) — e.g. a **Steel Yard / Duga** (separate transmit and receive sites) rated at **~3,200 nm** for space search, or a TPS-71 doing surface search beyond the horizon; the price is **ferocious ambiguity** (can be off by **~60 miles** in range), so OTH gives only rough cueing. Terrain can cut the horizon far shorter than the geometric value — a radar even on a 12,000-ft mountain can be blocked by taller terrain, and even a 1,300-ft island peak blocks coastal radars/missiles at certain altitudes (see Terrain masking). Same descent-timing trap as waypoints: descend a waypoint *early* or you're already spotted.
- **Source:** *Understanding Radar Horizon* (bsLLZwqi4Mg), *Tutorial - Radar* (7mmQ2y11hPc)
- **Confidence:** High (model High; exact numbers Med due to transcription)

### Look-down / shoot-down (pulse-Doppler vs ground clutter)
- **Models:** radar's ability to see low-flying targets against ground-clutter return.
- **Inputs / parameters:** radar type (pulse-only / semi-pulse-Doppler / true pulse-Doppler), target altitude, target's closing/receding velocity (Doppler), own altitude.
- **Behavior / rules:** A target below the radar produces two returns (target + ground); a sufficiently low target's return merges with the ground return and is lost.
  - **Pulse-only radar:** cannot detect low targets at all — the lower half of coverage is one clutter blur; in the demo it lost a 25,000-ft target as the ground filled the scope and never saw 200–2,000-ft targets.
  - **Semi-pulse-Doppler:** uses an algorithm to pick aircraft-like returns out of clutter; detected low (200–2,000 ft) targets fairly well (~36–38 nm).
  - **True pulse-Doppler (look-down/shoot-down):** filters by Doppler shift, sees closing/receding low targets. Quirk: it can detect a *lower* target at *greater* range than a co-altitude one, because looking down it sees more of the top surface of the airframe.
- **Outputs / effects:** determines whether flying low actually hides you, and against which radar.
- **Edge cases / quirks:**
  - **Notch/beam gate:** a target flying **perpendicular** to a pulse-Doppler radar (zero relative velocity) is invisible because the radar filters out its **own** motion and the target shows zero relative Doppler. Demo measured a roughly **8°** blind window; the moment the target's path becomes oblique, Doppler returns and it is seen. The Radar tutorial confirms this and adds that **launched weapons can lose radar lock** when a target beams them, and that a pure **pulse** mode (e.g. F-14) could still see a beaming target if it weren't also masked by ground clutter. Nearly all radars now have some Doppler filtering, so notching applies broadly.
  - You can defeat ground clutter on a pulse-only radar by descending **below** the targets so they are no longer against the ground. The Radar tutorial frames the general trick: **fly lower to improve your own detection of things above you** — looking up there are no ground returns, so a non-Doppler radar that can't see down can still cleanly see targets overhead.
- **Source:** *Look Down/Shoot Down Radar* (xV-H7HJd2-I), *Tutorial - Radar* (7mmQ2y11hPc)
- **Confidence:** High (8° figure Med — narrator eyeballed it)

### Radar aspect & RCS (detectability by angle)
- **Models:** radar cross-section varies with viewing aspect; detection range scales with RCS.
- **Inputs / parameters:** per-aspect RCS from the database (front/side/rear and, for some airframes, bottom), in **dBsm / m²**; radar transmit power.
- **Behavior / rules:** Each airframe has separate RCS values per aspect (demo F-16: front 4.65, side 2.9, rear 4.7, side 2.9 m²; F-104: nose 2.7, side 6.5, rear 2.7). Detection range scales with RCS but **weakly** against a very high-power early-warning radar: a 0.3 m² nose difference moved detection by only ~3 nm at ~210 nm (~2%); showing the side vs nose changed range only ~2–2.5% on that radar. So aspect alone barely changes detection vs a powerful EW radar.
- **Outputs / effects:** small range changes from aspect; large changes only when combined with jamming or true stealth.
- **Edge cases / quirks:**
  - **Receding targets** can be harder to detect (Doppler filtering favors approaching targets) — narrator notes this is modeled in some systems but unsure of exact math.
  - **Loadout matters:** external stores massively increase RCS (GBU-49s on an F-35 hugely inflated the "square-meterage"); internal carriage keeps it small.
  - F-35 from below: the wide belly aspect only changed detectability ~5–8%, i.e. stealth shaping dominates.
- **Source:** *Radar Aspect and Detectability* (1r4P_gI-Pdw)
- **Confidence:** High

### Jamming / RCS interaction (stealth + noise)
- **Models:** noise jamming degrades detection range; stacks with low RCS.
- **Inputs / parameters:** jammer band coverage vs target radar's search/track band, jammer power, target aspect/RCS.
- **Behavior / rules:** A jammer must cover the **band** the victim radar uses or it does nothing useful (and may make the jammer *more* electronically obvious). When effective, jamming + small aspect compounded to roughly a **10% detection-range reduction** in the demo (vs ~2% from aspect alone), e.g. nose-on F-104 with jamming detected at ~187 nm vs ~207 nm. A "jammed" radar still sees — "jammed" just means it is receiving jamming, not blinded (modern radars don't get the 1950s spaghetti scope).
- **Outputs / effects:** "jamming + stealth is the greatest thing ever invented" — combined they meaningfully cut the range at which weapons can be brought to bear.
- **Edge cases / quirks:** **Multiple jammers scale very poorly.** Going from 1 → 2 same-band jammers changed detection by ~2 nm (not the naively-expected ~25%); adding 5–8 jammers actually *increased* detection range. Real value of many jammers: covering many different radar **frequencies** (one jammer per band), and forcing the enemy to split power — not raw power stacking. Wrong-band jamming (generic OECM on a B-band radar) detected the bomber at the **same or farther** range.
- **Source:** *Radar Aspect and Detectability* (1r4P_gI-Pdw), *Effect of Multiple Jammers on Detection* (FI-ZwDubiMY)
- **Confidence:** High

### ESM (passive electronic detection)
- **Models:** detecting and locating emitters by their emissions without emitting yourself.
- **Inputs / parameters:** ESM sensor generation (1950s → 2010s), emitter type/frequency/PRF/pulse-dwell signature, geometry (must face/see the emission), number of cooperating sensors.
- **Behavior / rules:**
  - ESM gives **bearing + emitter classification** but **not** exact position from a single sensor — you get a bearing line / wedge of uncertainty. Position requires triangulation.
  - **Detection range:** ESM can typically detect an emitter to **~1.5× the emitter's own detecting range** (e.g. a 100-nm radar is sensed to ~150 nm). Better/older generation widens or narrows the uncertainty wedge; modern (2010s) ESM gives a very tight wedge but still no instant fix.
  - **LOS requirement:** you must be able to see the emission (face the emitter); contacts drop when the emitter turns away, with exceptions (see OTH ESM). Some energy radiates sideways, so a non-facing radar may still be partially detectable.
  - **Triangulation:** cross two bearings (from RPs taken at different times, or from two/three platforms simultaneously). Best accuracy near a **90°** cut between bearings; three-way fixes can localize everything within <1 min of game time. Satellites in groups of three self-triangulate. Demo achieved ~2.3 nm fix accuracy from a platform that never came within 100 nm.
- **Outputs / effects:** locate SAMs/ships/aircraft passively; classify by signature (e.g. PRF reveals long-range search radar; demodulated return reveals engine count/type and rough size class).
- **Edge cases / quirks:**
  - **If the target does not emit, ESM cannot detect it** — clever players radar-snap then go silent (EMCON), giving ESM only a stale bearing.
  - Sensors are **frequency-specific**: early RWRs only detected pre-programmed SAM bands (historical SA-6 surprise). RWR and HARM Targeting System are just less-accurate ESM.
  - OTH ESM (e.g. some sub sensors) can sense beyond LOS via atmospheric scatter — a surfaced sub detected a ship that could not yet detect the sub. The Radar tutorial confirms some **surface ships (e.g. an Arleigh Burke)** also do **over-the-horizon analysis of electromagnetic signals**, sensing an enemy radar before that ship is itself detected.
  - **Frequency-agile / LPI emitters can be un-locatable:** the Radar tutorial shows an **F-22** whose frequency-agile, very-short-pulse radar a high-end ESM platform (Conformal/AWACS-type) could **not even register as emitting**, while a conventional radar nearby was immediately classified and bearing-fixed. So the "emit → get located at 1.5×" rule has an explicit LPI exception.
- **Source:** *Electronic Support Measures* (oF8LwbZSm28), *IFF* (0R6-5oQR-l0), *Tutorial - Radar* (7mmQ2y11hPc)
- **Confidence:** High (1.5× and 90° figures stated; 1.5× restated in the Radar tutorial)

### IFF / identification reasoning
- **Models:** classifying a contact (friend/neutral/hostile) from kinematics, emissions, and scenario OOB.
- **Inputs / parameters:** detected speed, altitude, formation behavior, emissions (radar type, fire-control vs search), known scenario platform list, detection range (RCS clue).
- **Behavior / rules:** A contact starts as a **bogey**; the operator narrows identity using:
  - **Kinematics vs database cruise speeds at altitude** — match observed speed/altitude against scenario platforms' database cruise figures (e.g. 480 kt at 25,000 ft narrows the airframe). Speeds atypical for civilian airliners (>~320 kt at altitude) flag a likely military target.
  - **Behavior** — tight formation + one aircraft accelerating to catch up suggests a military flight, not airliners.
  - **Emissions** — a **fire-control radar** emission ⇒ almost certainly hostile/dangerous; civilian aircraft "almost always fly with radars on," so a fast, high, **non-emitting** contact while everyone else emits is suspicious. Detected emission type (e.g. terrain-following radar) can pin the exact platform.
  - **Detection range as an RCS clue** — detecting a contact unusually far out implies a large RCS (big aircraft/bomber); only-when-close implies small RCS.
  - **Logical elimination** — if only one scenario platform has a given radar (e.g. only the AWACS has a 3D long-range search radar), the contact must be that platform.
- **Outputs / effects:** drives manual hostile/neutral tagging and whether weapons may engage.
- **Edge cases / quirks:** A determined opponent can fly a fighter at airliner speed to spoof IFF — then you fall back to formation/emissions cues or send an interceptor for visual ID. SAM-system electronics are modeled finely enough to read engine count/single-vs-multi-engine and size class from the demodulated return.
- **Source:** *IFF* (0R6-5oQR-l0)
- **Confidence:** High

### Visual / EO-IR sensors (detection vs classification range)
- **Models:** eyeball, binoculars, TV/LLTV/IR/FLIR detection and identification distances.
- **Inputs / parameters:** per-target **visual detection range** by aspect (database field, e.g. ship 12.97 nm front, ~22 nm side), sensor max range, sensor **zoom multiplier**, scan interval, slant range, time of day, weather, cueing.
- **Behavior / rules:**
  - Targets carry a **visual detection range** that depends on **aspect** (front vs side) just like RCS, and is reduced by dark/rain/cloud.
  - A sensor has a **max range** (hard cutoff) and a **zoom** factor. **Detection** uses the target's visual detection range; **classification/identification** range ≈ detection range × **zoom**, but never beyond the sensor's max range. Example: side visual detection 22.04 nm → halve to ~13.36 nm classification baseline, × zoom; a 4× binocular gave ~53 nm theoretical ID but capped at its 18 nm max range. So the eyeball can *see* farther than binoculars while binoculars *identify* better once in range.
  - **Slant range** governs everything (you view at an oblique angle, not the flat side).
  - **Cueing**: a searching sensor is slow; once another sensor (radar, AEW) cues it where to look, it IDs at much longer range because it's "looking down the scope," not searching. Example: SR-71 IR frame camera (15-80, 80 nm) only useful once an E-2 cued it.
- **Outputs / effects:** sets the range at which a target is spotted vs positively identified vs engageable; weapons with EO/IR seekers need their own detection of the target ("weapon must detect target prior to firing").
- **Edge cases / quirks:** Binoculars have a deliberately short max range (~18 nm) modeling the difficulty of holding high zoom steady. Combining radar (find) + camera (ID) is the strong play.
- **Source:** *Visual Sensor Distances* (A7oqIAMhKF8)
- **Confidence:** High

### Visual sensors — time of day
- **Models:** daylight level scales visual/EO detection range.
- **Inputs / parameters:** local time of day (day / dawn-dusk / night), sensor type (eyeball, TV, LLTV, IR/FLIR), target contrail.
- **Behavior / rules:** Detection range as a fraction of full-daylight range:
  - **Day:** baseline (demo eyeball spotted a contrailing bomber at ~53 nm).
  - **Dawn/dusk (civil twilight):** ~**60–66%** of daylight range (demo ~35 nm).
  - **Night:** ~**25–28%** of daylight range, i.e. about a **75% reduction** (demo ~15 nm).
  - **Moon phase has no appreciable effect** (full vs new moon tested — no measurable difference).
  - **Contrails** (generally formed at **~20,000 ft and above**) are detectable far beyond the airframe itself, even at night; below ~12,000–20,000 ft no contrail, so low aircraft are only seen close in.
  - **IR/FLIR** does *not* give a big night advantage in this model — it detected at about the same range regardless of daylight (IR targets are inherently obvious), so a FLIR+TV combo is best for long range.
- **Outputs / effects:** drives detection ranges for any optical sensor; night sharply shrinks them except for contrailing/IR-hot targets.
- **Edge cases / quirks:** Day/night terminator, civil twilight, and polar perma-day/perma-night are modeled. Binoculars/TV/FLIR can classify (not just detect) once in range and at any time of day, but still need the target close enough.
- **Source:** *Visual Sensors and time of day* (o4bPT47vuK8)
- **Confidence:** High

### MPA altitude — radar vs visual optima (and curvature)
- **Models:** patrol-aircraft altitude tradeoff between radar reach and visual/slant detection.
- **Inputs / parameters:** altitude, radar max range, target surface geometry/aspect, Earth curvature, sensor type (radar vs visual/MAD/camera).
- **Behavior / rules:**
  - **For radar search: fly high.** Higher altitude extends the radar horizon (curvature) and lets the beam strike more of the target's top surface, improving return — until the radar's own max range caps it. A high MPA detected a stealthy-bowed destroyer sooner than at low altitude. Below the horizon a target is simply undetectable regardless of altitude. (Note a weaker mechanically-scanned F-16 surface radar showed little altitude sensitivity in-range — the high-altitude benefit is strongest for powerful long-range maritime radars.)
  - **For visual/EO acquisition: fly lower.** Visual ID is slant-range limited; descending to MPA altitude shrank visual acquisition from ~6 nm (at 36,000 ft) to ~3 nm-onset — roughly **1.5× sooner** detection than radar-only allowed at altitude. Hence real MPA patrol low when looking, high when relying on radar.
  - Aspect again matters: a Zumwalt-type hull was detected ~161 nm side-on but much later bow-on (stealth shaping).
- **Outputs / effects:** pick altitude per sensor goal — high to maximize radar pickup range, low to visually acquire/identify sooner.
- **Edge cases / quirks:** Clouds/night defeat the low-altitude visual benefit. Curvature can hide a flat-aspect reflection geometrically even when nominally in range.
- **Source:** *MPA Altitudes* (_qeXJWmRBks)
- **Confidence:** High

### Emission intensity → detection range (logarithmic model)
- **Models:** how an emission's intensity (here: acoustic dB; generalizable to emitter loudness) maps to detection distance, including depth/layer shielding. Included as the clearest stated **intensity→range** math in the cluster.
- **Inputs / parameters:** source intensity (dB), spherical spreading/attenuation, acoustic layer/depth.
- **Behavior / rules:** Decibels are logarithmic (+10 dB = ×10 power) but because energy radiates in all directions and attenuates, detection range scaled far more gently in the demo: **every +10 dB ≈ +33% detection range** (31.5 dB→4.0 nm; 42 dB→5.7 nm; 52 dB→7.5 nm; 102 dB→13 nm). Crossing below the **acoustic layer** (going deep) cut detectability ~**75%** (a ~90 dB sub that would be heard ~9 nm in the layer was only heard ~3.5 nm below it).
- **Outputs / effects:** quiet/slow → short detection range; a shielding layer (or terrain/horizon analog) sharply reduces it.
- **Edge cases / quirks:** Shallow water/coastline reflections drastically *increase* detectability (sound bounces everywhere). The exact +33%/+10 dB won't be uniform in reality; it's a useful first-order model.
- **Source:** *Effects of Volume on Detection Range* (-Q9AfTrF4vM)
- **Confidence:** High (numbers stated and reproduced in-demo)

---

## EW / EMCON

(Cross-references: see ESM, Jamming/RCS, and IFF above — they are tightly coupled.)

### EMCON / radar-snap discipline
- **Models:** managing own emissions to avoid passive (ESM) detection.
- **Inputs / parameters:** emitter on/off state, scan interval, who else is emitting.
- **Behavior / rules:** Emitting makes you locatable by enemy ESM/RWR to ~1.5× your radar range. The counter: turn the radar on briefly, grab a snapshot of contacts, then **shut it off** — enemy ESM then holds only a stale bearing, not a current fix. In an IFF context, a fast/high contact that is silent while everyone around it emits is itself a red flag.
- **Outputs / effects:** trades own situational awareness for survivability.
- **Edge cases / quirks:** Side-lobe radiation means a non-facing radar can still leak detectable energy. Wrong-band jamming makes a jammer *more* conspicuous, not less.
- **Source:** *Electronic Support Measures* (oF8LwbZSm28), *IFF* (0R6-5oQR-l0)
- **Confidence:** High

### Sensor refresh / track-formation timing
- **Models:** mechanically-scanned radars revisit targets on a scan interval; tracks need multiple looks.
- **Inputs / parameters:** radar scan/rotation interval (database, e.g. 10 s), number of looks.
- **Behavior / rules:** Identifying a track requires the radar to come around **twice**; targeting-quality range/speed needs a further revisit (~one more interval). Slow-rotating early-warning radars therefore lag in updating contacts; a fast-maneuvering target can be lost between sweeps. A message-log option can force time-scale to 1× on each new contact (useful for catching pop-up detections). The **update rate is a per-radar database field**; the Radar tutorial states old radars update **as slowly as once every ~10 s (or worse)**, shows a stale-contact age counter appearing under the symbol between sweeps, and contrasts this with **phased-array** sets whose electronic scan refreshes nearly instantaneously.
- **Outputs / effects:** delay between first detection and a fire-control-quality track.
- **Edge cases / quirks:** during the gap, a notching/turning target's estimated position can be badly wrong (box shown in UI may not contain the true target).
- **Source:** *Radar Aspect and Detectability* (1r4P_gI-Pdw), *Effects of Rain on Detection* (P6UAdBqTUhk), *Tutorial - Radar* (7mmQ2y11hPc)
- **Confidence:** High (≥10 s slow-update figure restated in the Radar tutorial; exact interval is per-radar)

---

## Terrain & Environment

### Terrain masking (LOS blocking by elevation)
- **Models:** terrain blocks radar/visual LOS and missile paths; valleys/ridges conceal movers.
- **Inputs / parameters:** terrain elevation along the LOS, sensor and target heights, the relief layer / line-of-sight tool.
- **Behavior / rules:** A sensor cannot see through higher terrain. Terrain can cut a radar's effective coverage far below its instrumented/horizon range — a radar on a 12,000-ft peak had drastically limited LOS because taller mountains blocked it. Cruise missiles and aircraft routed through valleys/river depressions and behind ridges stay undetected until very late; SAMs that "can't shoot down well" are bypassed by staying below them. The **relief layer** and **line-of-sight tool** are the in-game planning aids (LOS tool only available for your own units — for enemy radars you must estimate, e.g. via ESM + horizon math).
- **Outputs / effects:** dramatically shortened detection/engagement ranges along masked corridors; lets weapons reach targets through dense defenses.
- **Edge cases / quirks:** CMO's relief layer is **granular** — fine micro-terrain (individual trees, tiny folds) is **not** modeled; only macro elevation (ridges, mountains) masks. Open desert offers no masking other than elevation. High-arc SAMs (S-300/S-400) can still loft a missile over a ridge to hit a masked helicopter.
- **Source:** *Terrain Masking* (wycT9grtrOE), *Understanding Radar Horizon* (bsLLZwqi4Mg), *Helicopter Terrain Masking* (hu1Mu_qaXQ8)
- **Confidence:** High

### Best-LOS terrain point (computation / algorithm)
- **Models:** finding the position in an area with the best (longest) line-of-sight, by combining a terrain-elevation scan with the LOS/horizon tool.
- **Inputs / parameters:** a bounding box (start/end latitude and longitude), a scan **granularity step** (demo `0.01`; `0.001` for ultra-fidelity at the cost of processing time), elevation per point (`GetElevation`), a sample count (demo 10), and the **horizon/LOS tool** parameters.
- **Behavior / rules:** The dedicated tutorial walks an actual Lua algorithm (the standalone caption is now available):
  1. **Scan elevations:** nested loops step over lon (`x`) and lat (`y`) by `step`, calling `GetElevation{latitude=y, longitude=x}`. Track the running max elevation and **append** each new high point's lat/lon to two lists. (Result is a set of candidate high points.)
  2. **Sample:** pick `numberOfSamples` (≈10) high points out of the list (clamp the count to the list size to avoid overrun).
  3. **Probe LOS:** create a temporary marker **facility unit** (a generic geographic-marker DBID, e.g. `2349`) at each sampled point, then call the LOS tool — in the transcript `...HorizonTool_LOS{ observer = <unit guid>, target altitude = 100, mode = 0 (distance), horizon = 1 (visual), use range limits = false }`. `use range limits = false` is **required** because the bare markers have no sensors. The call returns a **horizon distance**; larger = sees farther.
  4. **Pick best:** keep the point with the greatest returned horizon (`bestLat/bestLon/bestHorizon`), then drop a final unit there (and ideally delete the temporary probe units afterward).
- **Outputs / effects:** the single best-LOS sensor/observer position in the area, plus the LOS distance from it.
- **Edge cases / quirks:** In the demo the point with the best horizon **was** simply the **highest** point (Bear Mtn, CT; best horizon ≈ **64.67**), so elevation is usually the dominant driver — but the LOS probe is what proves it, since a high point ringed by taller terrain would lose. Confirms the *Terrain masking* note that elevation alone isn't sufficient if surrounded by higher ground.
- **Source:** *Determining a point in terrain with the best LOS* (u9R-59fusCM)
- **Confidence:** High (algorithm shown end-to-end; exact API field names Med due to auto-caption)

### Rain — effect on detection
- **Models:** precipitation degrades radar and blocks EO/IR/laser/visible light.
- **Inputs / parameters:** rain intensity (none → extreme), rain layer height, radar band/power/generation, target aspect (notching).
- **Behavior / rules:**
  - **Powerful, low-frequency early-warning radars (e.g. wide-wavelength ~700 kW set):** rain has **essentially no effect** on radar detection range (B-52/F-22 detected at the same ranges with extreme rain as with clear sky). Such radars "burn through" rain.
  - **High-frequency / fire-control / X-band radars:** these are where rain (and clouds) start to hurt — detection/lock range drops markedly. A weak fighter radar (Sapphire/MIG-21) acquired an F-15 at ~4–4.5 nm in heavy rain vs ~8.1 nm clear — roughly **half** the range.
  - **EO/IR/laser/visible weapons:** rain **blocks** infrared, laser, and visible light — "weapon must detect target prior to firing" failures occur; IR-guided and laser weapons can't acquire through rain.
  - Rain has a **height** (a rain/cloud layer): an aircraft above the layer is unaffected; flying *inside* the layer is where attenuation applies.
- **Outputs / effects:** main practical impact is not loss of long-range *search* (for strong radars) but inability to *engage* with fighters' EO/IR/short-range systems in the weather.
- **Edge cases / quirks:** Old radars without good notch filtering still can't track a perpendicular (zero-Doppler) target — rain doesn't change that, it just ruins precise positioning. Rain and cloud are set separately in the weather editor.
- **Source:** *Effects of Rain on Detection* (P6UAdBqTUhk)
- **Confidence:** High

### Cloud cover — effect on spotting
- **Models:** cloud layers act as opaque physical barriers to visual/EO sensors.
- **Inputs / parameters:** cloud density tier (light/moderate/very moderate/solid/thick fog), cloud layer altitude band, sensor altitude relative to the layer.
- **Behavior / rules:** Clouds are a **single layer** with one density bar, occupying an altitude band (e.g. light high clouds 20,000–23,000 ft). You **cannot see through a cloud layer** with visual/EO sensors: an aircraft above the layer sees nothing on the ground below; an aircraft **inside** the layer also sees nothing; only when the sensor is **below** the layer does visual detection return to normal range. Even with a target radar-cued (datalink) below the clouds, an EO/IR-seeker weapon still "must detect the target prior to firing" and cannot engage through cloud. High-frequency sensors (and up-looking guidance) are degraded by cloud; satellites' optical view is blocked.
- **Outputs / effects:** must descend below the deck to visually acquire/engage; radar (low-frequency) still works through cloud.
- **Edge cases / quirks:** Clouds are not visualized as discrete puffs — no flying "between" individual clouds; it's a flat layer model. Density tiers above "solid" become fog. Clouds and rain are independent settings.
- **Source:** *Cloud Cover's Effects on Spotting* (yhs02DUz9bg)
- **Confidence:** High

### Land cover — effect on spotting
- **Models:** the terrain **land-cover type** under a ground unit changes how easily it is visually spotted and how survivable it is to attack (distinct from macro-elevation masking).
- **Inputs / parameters:** land-cover classification at the unit's location; whether **"effects of terrain type"** is enabled (Scenario editor → scenario features/options); spotter LOS/altitude. View it via View → Land Cover (+ Map settings → terrain-type legend; the mouse cursor reports the cover type underneath it).
- **Behavior / rules:** Land cover is a relatively new feature with a modest set of types. Holding aspect/altitude constant and flying identical F-16s over identical ground targets, the demo measured the **visual detection range by cover type** (all numbers verbatim, nm):
  - **Easiest / detected first, roughly equal (~4.4 → 3.3 nm):** grasslands, snow & ice, croplands, wetlands, barren — open types are all spotted at about the same long range, trending slightly shorter as the ground gets greener/more wooded.
  - **Harder:** woody savanna, then **cropland/vegetation mosaic** (crops dotted with trees) take noticeably longer.
  - **Forest:** detected at about **half** the cropland range — cropland onset ~**3.2 nm** vs forest ~**1.6 nm** (transcript: "half of that distance"). A big deal for recon runs.
  - **Urban / built-up — the standout:** a vehicle in an urban tile may **never be acquired** even on a low overflight; in the demo the F-16 only detected the urban target at **~1.2 nm** after descending to ~417 ft directly over it. Hiding in a city is extremely effective.
- **Outputs / effects:** sets the visual-acquisition range for a ground unit by terrain type; drives where to hide vs bait units. Cover effect compounds with line-of-sight (in some runs the target couldn't be seen at all), and a **moving** ground unit is easier to detect (not separately quantified here).
- **Edge cases / quirks:**
  - **Granularity / micro-placement:** at high zoom each pixel of land resolves to its own cover type, so you can tuck a unit into a small hard-to-see patch (e.g. an SA-15 in a dense-town pixel right beside an "obvious" T-55 bait in cropland) — a deliberate scenario-design trick. This refines the *Terrain masking* note that micro-terrain isn't modeled for **elevation** LOS: land **cover** *is* modeled at fine scale even though micro-relief is not.
  - **Oceans:** land cover doesn't apply over water, but radar there is still affected by weather and sea state/height.
- **Source:** *Land Cover* (2SJDdTiuRPs)
- **Confidence:** High (detection-range numbers stated verbatim)

### Land cover — effect on movement & attack
- **Models:** land-cover type and slope change ground-unit movement speed, and cover changes the effectiveness of different weapons against units in it.
- **Inputs / parameters:** land-cover density at the unit's position; terrain **slope**; attacking weapon type (area/cluster vs unitary bomb).
- **Behavior / rules:**
  - **Movement:** the **denser the terrain, the slower** a ground unit moves/climbs through it; a **slope** also slows a unit. (Stated qualitatively; no numbers given.)
  - **Attack / weaponeering:** dense cover sharply changes weapon effectiveness, and you must pick the weapon to match. With **cluster munitions (CBU)**: a 12-vehicle M113 group in the **woods** was cut to ~2/12 and the **savanna** group fared similarly, but the **urban** group "did pretty well" (survived). Re-running with **unitary bombs (Mk-84)** instead "plastered" the woods and urban groups (only the savanna group got lucky); total tally **12× Mk-84 ⇒ ~35 APCs killed**. So area/cluster weapons work on open ground while unitary/penetrating bombs are needed for dense cover and especially urban.
- **Outputs / effects:** slower maneuver through dense/sloped terrain; weapon selection must match the cover (area weapons for open ground, unitary/penetrating weapons for dense cover/urban).
- **Edge cases / quirks:** You must explicitly order the attack (units don't engage dense-cover targets well on their own). Cross-reference *Grouped vs single units* — a 12-vehicle group is a distributed target, so "kills" are per-vehicle.
- **Source:** *Land Cover* (2SJDdTiuRPs)
- **Confidence:** Med (movement effects qualitative; attack outcome counts stated but example-specific)

---

## Contradictions & cross-video notes
- **Altitude vs detection direction:** higher altitude both *improves your own radar reach* (curvature/horizon, MPA video) **and** *makes you easier to detect / gives enemies longer engagement windows* (altitudes video). These are consistent (LOS is symmetric) but cut opposite ways tactically — implement both effects.
- **Aspect/RCS magnitude:** the aspect video stresses aspect changes are *small* (~2%) against powerful EW radars, becoming significant (~10%) only with jamming or against weaker radars. Don't model aspect as a large standalone detection modifier.
- **Jammers don't stack:** explicitly modeled — more same-band jammers ≠ proportionally less detection; can backfire. Model jamming as band-coverage, not additive power.
- **Band/wavelength is the master radar knob:** the Radar tutorial makes explicit what the aspect/horizon/look-down videos each touched — a radar's band sets a *range-vs-resolution* tradeoff (long wave = far but smeared/ambiguous; short wave = precise but short). This underlies the two-detection-ranges-per-target stealth rule, the height-finding limitation, and why EW vs fire-control radars differ. Implement radar performance from the database band/wavelength rather than a single "range" scalar.
- **Land cover vs elevation masking are separate layers:** elevation (relief) masks LOS at *macro* scale and ignores micro-relief; land **cover** modifies *spotting/movement/weapon-effect* at *fine* (per-pixel) scale. A unit benefits from both independently (e.g. low in a valley *and* in forest/urban cover).
- **Formation spacing ↔ formation editor:** the spacing effects (saturation defense, fusing-into-one-contact) are produced via the formation-editor stations (relative vs fixed bearing) described in *Grouping and Formations*; the editor is the mechanism, the spacing video is the tactic.

## Gaps (videos in the cluster not readable / not yet mined)
- **Now resolved (captions fetched & incorporated):** the standalone *Tutorial - Radar* (7mmQ2y11hPc), *Land Cover* (2SJDdTiuRPs), *Determining a point in terrain with the best LOS* (u9R-59fusCM), and *Grouping and Formations* (0mxcfrMWpSU) are read and folded into the rules above (radar fundamentals, land-cover spotting/movement/attack, the best-LOS algorithm, and grouping/formation-editor mechanics).
- **Not yet read** (lower priority, likely incremental): *Formation Width* (trk7WTa9SzI), *Grouping tips and Tricks* (O7qj1RaEU9M), *Radar Misconceptions* (FOQ6kcf9YzA), *Radar Horizon chart* details, *Radar Jamming Bands* (BIiSHFYKFQ8), *Radar versus Visual Recon* (agqnyM3Hwkg), *Cloud Cover and Visual Sensors* (f8uR3dLCq0M), *Beta detection-changes* patch videos (Ccyl-4E_dl4). These would refine the band/jamming and formation rules but the core mechanics above are well-established.
