# Sensors / EW / IADS — Part 1/3

**Bucket scope.** This is the *exhaustive* functional-rules spec for the **Sensors / EW /
IADS** bucket of *Command: Modern Operations*. The bucket is split across three sibling
documents; **this is Part 1/3**. It covers the sensing-and-electronic-warfare core:

- **Radar fundamentals** — band/wavelength range-vs-resolution tradeoff, generation/anti-jam,
  scan type & update rate, 2D vs 3D height-finding, over-the-horizon, weather/precipitation,
  periscope detection, terrain-following/weather radar.
- **Radar line-of-sight & horizon** — the radar-horizon LOS limit, terrain masking, the
  radio-horizon-vs-optical-horizon split, and waypoint altitude-change timing for low ingress.
- **Doppler processing** — look-down/shoot-down, ground-clutter rejection, the perpendicular
  (notch/beaming) blind spot, and the pulse-only / semi-Doppler / true-pulse-Doppler ladder.
- **RCS, aspect & stealth** — aspect-dependent detection range, detection-range-as-RCS-proxy,
  and stealth vs radar band.
- **Range resolution & phased-array geometry** — unresolved-target merging, side-lobe/boresight
  gain falloff, fixed-face baffles, and the fire-control-lock continuous track.
- **Passive detection (ESM/ELINT/RWR)** — bearing + classification, the ~1.5–3× detection-range
  multiplier, generation effects, triangulation/cross-fixing, satellite & OTH ESM, RWR/HTS
  band limits, side-lobe detection.
- **Optical / EO-IR / satellite reconnaissance** — camera max-range + slant + zoom model,
  imaging radars (GMTI/SAR/SLAR), real-time-recon abstraction, satellites, contact decay,
  visual detection range & zoom.
- **Offensive ECM (noise jamming)** — band-match requirement, position-denial, burn-through,
  geometry traps, home-on-jam, multi-jammer stacking, imprecise-target firing inhibit.
- **Defensive ECM & deception** — the DECM/chaff Pk-reduction dice roll, terminal hit-probability
  calculation, RGPO / multiple-false-target / angle-deception techniques, stacked survivability.
- **SEAD / DEAD & SAM engagement** — engagement envelopes, search vs fire-control emission
  discipline, ARM baiting & missile-defense-value salvos, DLZ, "cheese" depletion tactics,
  jamming-assisted SEAD, SEAD mission framework, and weapon-class ranking.
- **SAM internals & missile flight model** — non-cooperative recognition on a SAM radar, return
  strength vs range, two-stage boost/sustainer/coast flight, and loft/energy-management range.
- **IFF / identification** — kinematic ID against the platform DB, EMCON/emission cues, rotating
  search-radar refresh, and detection range as an ID clue.
- **Realism toggles** — gun-control/director gating, submarine radio isolation, aircraft
  sub-system damage spreading, terrain-type effects.

**Exhaustive.** This document is self-contained: it merges **every** rule from the transcripts
assigned to this part, and the overlapping radar / look-down / ESM / RCS / IFF / horizon
mechanics (radar-horizon LOS model and calculator readings, the look-down/clutter and ~8° notch
model, the ESM detection-range multiplier and triangulation geometry, the LPI/F-22 exception, the
aspect/RCS rules, the rotating-radar refresh cadence, and IFF reasoning) are all stated in full
below. Near-identical mechanics across videos have been deduplicated into a single richest entry
that cites **all** source video IDs.

**Auto-generated-caption caveat.** Source transcripts are auto-generated YouTube captions, so
numbers, unit names, band letters, and API field names may contain transcription errors. Stated
numbers are captured **verbatim**; where a value is qualitative or eyeballed by the narrator,
that is noted. Nothing here is invented — unstated formulas are flagged as "observed test
values / worked example, not a stated formula."

---

## Radar fundamentals

### Radar band / wavelength — range vs resolution and stealth-detection tradeoff
- **Models:** The operating band/wavelength of a radar dictates transmit power (hence range),
  positional resolution (angular ambiguity), altitude availability, and how well it detects
  stealth. This is the master radar knob the other radar mechanics specialize.
- **Inputs / parameters:** Operating band (A through higher bands; **A-band ≈ HF/VHF**, very long
  wavelength); wavelength/frequency; transmit power; target range; target stealth shaping; PRF
  (sets max range). Each unit in the DB carries **two** radar-detection-range signatures — one for
  very-long-wavelength radars and one for short-wavelength radars.
- **Behavior / rules:** Lower-frequency / longer-wavelength (e.g. A-band) radars can produce much
  higher wattage → see targets at much greater range, BUT have **poor resolution**: a contact
  appears as a smeared arc and you cannot tell exact angle/position (and a 2D set gives no
  altitude). Higher-frequency / shorter-wavelength fire-control radars (e.g. **J-band Patriot**)
  give a tight, reliable, precise track. For non-stealth aircraft the long- and short-wavelength
  detection-range values are **equal**; for stealth (e.g. **F-22**) the **long-wavelength** value
  is much larger — a 1950s long-wavelength early-warning radar detects an F-22 significantly more
  easily than short-wavelength fire-control radars can. Visible light is just the very short end of
  the same EM spectrum.
- **Outputs / effects:** Per radar, determines detection range, positional ambiguity (smear),
  whether altitude is available (via 2D/3D), and stealth detectability.
- **Edge cases / quirks:** A long-wavelength radar can **detect** stealth but cannot generate a
  precise **weapons-grade** track on it. PRF sets typical max range (range ambiguity is modeled
  away in CMO). This underlies the "long-wave sees stealth, short-wave guides weapons" rule.
- **Source:** 7mmQ2y11hPc
- **Confidence:** High

### Radar generation vs jamming / counter-detection (anti-jam, frequency agility, side-lobe blanking)
- **Models:** A radar's technological generation determines its jamming resistance, side-lobe
  vulnerability, frequency agility, burn-through power, and how easily it can be counter-detected
  by ESM.
- **Inputs / parameters:** Radar generation/era; side-lobe quality; frequency agility (ability to
  change frequency when jammed); bandwidth (single vs range of frequencies); pulse characteristics
  (short pulses sprayed across the sky); transmit power (burn-through).
- **Behavior / rules:** 1950s radars can be jammed so hard through their side-lobes that the entire
  display blanks out. Modern radars detect the frequency they are being jammed on and rapidly
  **change frequency** to evade. Wide-bandwidth radars transmit over a range of frequencies
  (harder to jam). A sufficiently powerful radar can **burn through** jamming. Frequency-agile
  radars that emit very short pulses all over the sky (e.g. the F-22's radar) are extremely
  difficult to counter-detect — in the demo the F-22's radar was **not** detected as even being
  on, while a conventional F-15 radar was instantly bearing-detected by a Cobra/"conference" ESM
  platform.
- **Outputs / effects:** Determines whether jamming blanks the display, degrades to ambiguous, or
  is ignored; determines whether the emitting radar is counter-detectable via ESM.
- **Edge cases / quirks:** With very sophisticated frequency-agile / short-pulse radars, the normal
  "first to emit is first to get hit" counter-detection rule does **not** apply. Some ships do
  over-the-horizon ESM analysis and detect emitting radars at extreme range. (See ESM section.)
- **Source:** 7mmQ2y11hPc
- **Confidence:** High

### Radar scanning type → update rate and tracking-cone limits
- **Models:** How the radar is steered (mechanical rotation, mechanical+electronic, phased array,
  synthetic) sets how often a target is refreshed and the 3D volume it can cover.
- **Inputs / parameters:** Scan type (mechanical rotation; phased array/electronic; synthetic-
  aperture body-moved); rotation/update period (DB value, as slow as **once per 10 s** for old
  radars); the radar's coverage cone (azimuth + vertical limits).
- **Behavior / rules:** Mechanically scanned radars only detect a target when the beam sweeps onto
  its bearing; between sweeps a contact shows an age timer (e.g. "2 seconds" / "10 seconds") and is
  not updated. Old radars update as slowly as once every **10 s** (or worse). **Phased-array**
  (electronically scanned) radars have a "stupidly fast" update rate, scan all points
  near-instantly, can ID target type plus position/speed, and are very hard to counter-detect.
  Tracking is limited to a 3D **cone**: a target significantly below the cone is invisible even if
  the radar has look-down/shoot-down; the Patriot's array has limited vertical coverage (cannot see
  straight up — e.g. a target at **50,000 ft** directly overhead is outside the array).
  Synthetic-array = a phased array where the whole airframe moves instead of the antenna (SAR,
  side-looking).
- **Outputs / effects:** Determines contact freshness/age timers, how quickly tracks build (an
  initial contact is positionally poor and improves over successive sweeps), and the angular/vertical
  volume covered.
- **Edge cases / quirks:** Heading and speed of a contact are **derived over time** (compare
  position now vs ~1 minute later); a fresh single-sweep contact often shows wildly wrong speed
  (e.g. "180 knots") until refined. Phased arrays bypass the slow-derivation problem. See also the
  rotating-search-radar refresh entry under IFF (the TPS-43 ~5 s sweep cadence).
- **Source:** 7mmQ2y11hPc
- **Confidence:** High

### 2D vs 3D radar (height-finding) and paired nodding radars
- **Models:** Whether a radar yields target altitude; a bare range-only radar gives no height,
  while 3D/height-finder radars (multiple lobes) or a paired nodding radar supply altitude.
- **Inputs / parameters:** Radar type flag (2D vs 3D / height-finding); number of vertical lobes;
  presence of a paired nodding radar.
- **Behavior / rules:** A range-only/2D radar tells you distance and (over time) bearing/speed but
  **not** altitude; multiple targets at different altitudes and ranges along the same bearing can
  collapse into a single contact. 3D / height-finding radars use multiple lobes to resolve altitude
  as the radar rotates. Historically (old Russian setups) a 2D search radar was paired with a
  dedicated **nodding radar** that measured the height of targets the main radar had already
  detected. Multifunction radars (e.g. "Top Plate") can search air and surface and, being 3D, also
  give altitude.
- **Outputs / effects:** Adds (or omits) altitude to a contact; affects ambiguity and
  weapon-guidance feasibility.
- **Edge cases / quirks:** Without altitude, a single contact may actually be a stack of targets.
  2D nature compounds the angular smear of long-wavelength radars. Target-indicator radars are
  small/portable and often 2D (no altitude).
- **Source:** 7mmQ2y11hPc
- **Confidence:** High

### Over-the-horizon (OTH) radar
- **Models:** Very-long-wavelength radars bounce signals off the upper atmosphere/horizon to detect
  targets far beyond the normal radar horizon, at the cost of huge positional ambiguity.
- **Inputs / parameters:** OTH radar type (e.g. Steel Yard/Duga for space search; TPS-71 for
  surface OTH); very long wavelength; atmosphere/ionosphere for the bounce; target range.
- **Behavior / rules:** OTH radars ricochet signals off the horizon/upper atmosphere to detect
  targets at extreme range (Duga quoted at **3,200 nm**; designed for space search). Some air-search
  OTH radars can also do surface search at extreme range and see targets beyond the radar horizon.
  Positional accuracy is "ferocious" ambiguity — you can be off by **~60 miles** in range at long
  distance.
- **Outputs / effects:** Very-long-range detection of contacts otherwise below the horizon, but with
  large position error (rough cueing only).
- **Edge cases / quirks:** Duga-type is for space search, not normally for detecting ships/aircraft.
  **Exempt** from the standard radar-horizon LOS limit. (OTH *ESM* is a separate mechanic — see the
  ESM section.)
- **Source:** 7mmQ2y11hPc
- **Confidence:** Med

### Weather and precipitation effects on radar
- **Models:** Rain/moisture in the atmosphere scatters and burns radar signals, degrading
  detection; clouds alone are mostly transparent to radar unless very water-laden.
- **Inputs / parameters:** Rain intensity; cloud/sky setting; radar generation (filtering quality);
  terrain (mountains) between radar and target.
- **Behavior / rules:** With heavy rain cranked up, a previously stable contact starts "bouncing"
  all over the display (positional jitter) because the wall of rain/cloud scatters returns. Older
  legacy radars degrade badly in heavy rain; a very modern radar can filter out the rain and keep a
  reliable track. **Clouds by themselves do NOT block radar** signals unless very thick with
  water/moisture. (Clouds DO block optical/visual and satellite imaging — see the optical section.)
- **Outputs / effects:** Degraded/jittery contact position and reduced detection through
  precipitation for susceptible radars; reliable track retained by modern filtering radars.
- **Edge cases / quirks:** Mountains still block LOS regardless of weather. Distinct from optical
  sensors, which are heavily blocked by even light clouds.
- **Source:** 7mmQ2y11hPc
- **Confidence:** High

### Periscope / surface-search detection of submerged submarines
- **Models:** High-resolution surface-search radars can detect a submerged submarine's periscope.
- **Inputs / parameters:** Radar surface-search resolution / specific periscope-detection capability
  (DB flag "periscope surface search"); radar generation; range; submarine periscope exposure.
- **Behavior / rules:** Some surface-search radars have enough resolution to detect the periscope of
  a submerged submarine. In the demo a 1970s-tech specialty radar detected a submerged submarine
  ("goblin") at relatively short range; more modern sets (e.g. **P-8**) detect them much farther
  out. Tied to the "dive on threat detected" emissions-control/doctrine setting referenced in the
  radar UI.
- **Outputs / effects:** A submerged-submarine contact from a surface-search radar.
- **Edge cases / quirks:** Range depends heavily on radar generation (70s set = short range, P-8 =
  long range).
- **Source:** 7mmQ2y11hPc
- **Confidence:** Med

### Terrain-following / terrain-avoidance and weather radar behavior
- **Models:** Terrain-following radar lets an aircraft safely fly at minimum altitude over rough
  terrain by automatically climbing over obstacles; weather radar marks civilian aircraft.
- **Inputs / parameters:** Presence of terrain-following/avoidance radar (e.g. F-111); aircraft
  commanded altitude (minimum); terrain profile/obstacle height; whether the TF radar is switched on.
- **Behavior / rules:** Two identical F-111s at the same minimum altitude: the one with
  terrain-following radar ON pops up (**~250 ft** over the obstacle in the demo; **~350 ft** stated
  as its max during the climb) to clear terrain safely; the one with it OFF still cleared terrain
  identically — i.e. the aircraft does **NOT** need the TF radar switched on to safely cross
  terrain (both showed the same max clearance altitude). A weather/Doppler-navigation radar (e.g. on
  a 737) detected as emitting simply indicates a civilian aircraft.
- **Outputs / effects:** Safe low-altitude terrain crossing (automatic altitude pop-ups); detecting
  a weather/nav-Doppler emission flags a likely civilian aircraft.
- **Edge cases / quirks:** Counterintuitive demo result: TF radar off vs on produced the same safe
  clearance, so the radar type need not be active to cross terrain. Weather radar is otherwise mostly
  a civilian-ID cue.
- **Source:** 7mmQ2y11hPc
- **Confidence:** Med

---

## Radar line-of-sight & horizon

### Radar horizon / line-of-sight limit
> Merged from three transcripts (7mmQ2y11hPc, bsLLZwqi4Mg, FOQ6kcf9YzA) that describe the same
> LOS/horizon mechanic; richest numbers retained from each.
- **Models:** Radar (like light) travels straight, so it cannot see past the curvature of the earth
  or through terrain; both sensor mast height and target altitude set the detection floor. Effective
  detection range is the geometry of radar height + target altitude, **not** just the radar's
  nominal max range.
- **Inputs / parameters:** Radar/antenna (mast) height above the surface; target altitude; terrain
  elevation/obstacles between radar and target; target range; site ground elevation. Computed via a
  "Radar Horizon and Target Visibility Calculator" (takes radar height + target height → horizon /
  target-visibility range) and a "line of sight" tool. Naval/surface radar height is the **mast
  height** (DB field; a 10 m mast ≈ **32 ft**); some platforms have an explicit "height" field, and
  unlisted ones require interpolation/experimentation.
- **Behavior / rules:** A target below the radar horizon for its range is undetectable; the listed
  max range can be effectively **larger** than terrain/horizon allows — the horizon is the binding
  limit. Detection range increases monotonically with both mast height and target altitude.
  - Worked example (7mmQ2y11hPc): target at **1,000 m** altitude with a **30 m mast** → horizon
    **~22 km / 22 nm**; below that altitude the aircraft hides.
  - SEAD horizon-vs-range pairs for a **155 nm**-range emitter: to hide at 155 nm you need
    **~15,647 ft** of intervening ground; at 100 nm you need **~6,450 ft (≈6,500 ft)**; also stated
    as "100 nm ≈ 6,500 ft radar horizon." **Add** the site's ground elevation (e.g. **+1,200 ft**).
  - Calculator readings for a **240 nm** radar at ~32 ft mast height (auto-caption, illustrative):
    36,000 ft → **~240.17 nm**; 32,000 ft → **~196.45 nm (~200)**; 25,000 ft → **~201 nm**;
    18,000 ft → **~177 nm**; 12,000 ft → **~141 nm**; 10,000 ft → **~125 nm**; 8,000 ft →
    **~160 nm** (transcript noise); ~1,500 ft → **~60 nm**. Same radar detected a 36,000-ft target
    at ~240 nm but a **~104 ft-AGL** target only when very close.
  - Detection requires unobstructed LOS — a radar cannot see through terrain (mountains/hills) between
    it and the target. A target dropping behind a hill becomes invisible until it crosses back over
    (even while otherwise being tracked/filtered). Example: two MiG-21s at the same range at 12,000
    ft and 36,000 ft were both detected (LOS clear), while a third identical MiG-21 at **400 ft** was
    **not** detected because mountains blocked LOS.
- **Outputs / effects:** Detection yes/no based on whether the target rises above the LOS horizon for
  that range; the basis for low-altitude ingress and terrain-masking tactics, and for planning a
  descending altitude profile that stays just under a defender's horizon.
- **Edge cases / quirks:** Over-the-horizon radars are **exempt** (see OTH radar/ESM). Weapons may
  have their own altitude floor independent of the radar horizon (see SAM engagement-envelope). The
  enemy player typically does **not** have the LOS tool for the opponent's radar — attackers must
  estimate radar position (e.g. via ESM triangulation) and compute the horizon manually. On RTB,
  aircraft **ignore** commanded ingress altitude and overfly enemy SAMs.
- **Source:** 7mmQ2y11hPc, bsLLZwqi4Mg, FOQ6kcf9YzA
- **Confidence:** High (model High; exact numbers Med due to transcription)

### Radio horizon vs EO/visual horizon (over-the-horizon radar bending) — Beta 1278.1
- **Models:** Electromagnetic (radar/ESM) energy refracts and "hangs on" to the curvature of the
  Earth, so the **radar/ESM horizon extends beyond the geometric/optical horizon**; EO/visual
  sensors are limited to the shorter true line-of-sight horizon. Two distinct horizon radii now exist
  per unit.
- **Inputs / parameters:** Sensor type (radar/ESM vs EO/visual); observer (sensor) height; target
  height (demo used an **80-foot** target); Earth curvature; atmospheric EM propagation model.
- **Behavior / rules:** Patch **1278.1** changed Horizon calculation: radar signals shot over the
  horizon "hang on to the horizon a tiny bit," giving an enhancement in max detection range. Using
  LOS mode with an **80 ft** target: the RADAR/ESM horizon worked out to **~19–20 nm**, while the
  EO/VISUAL horizon was only **~12 nm** (geometric). A low (80 ft) inbound aircraft was detected on
  AIR-SEARCH RADAR at **~19 nm** (vs the OLD model which would not detect it until **~10–12 nm**),
  but no VISUAL/IR fix occurred until the target crossed the shorter **~11–12 nm** optical horizon.
- **Outputs / effects:** Maximum detection range now differs by sensor type — radar/ESM extends past
  the geometric horizon (~19–20 nm here) while EO/visual is capped at the true horizon (~11–12 nm
  here). Low-flying penetration of radar coverage is harder than before.
- **Edge cases / quirks:** Identification still requires crossing the (shorter) horizon and gathering
  more data: radar gave a track at 19 nm but no visual fix until ~12 nm. A powerful IR system
  identified the aircraft "pretty much instantaneously" once within optical range, but ALTITUDE took
  longer to compute "based on that angle." Flying super-low to sneak between radars still works but is
  "seriously adjusted" / harder. Exact figures (19–20 nm radar, 11–12 nm visual) are for an 80-ft
  target and specific sensor heights, **not** universal constants.
- **Source:** Ccyl-4E_dl4
- **Confidence:** High

### Terrain masking of radar line-of-sight (terrain vs altitude)
- **Models:** Tall terrain between radar and target blocks detection independently of (and can
  dominate over) the target's altitude; a radar on a peak can still have severely limited coverage.
- **Inputs / parameters:** Terrain elevation along the radar-to-target line; radar emplacement
  altitude; target altitude/position; the relief/terrain view and the line-of-sight tool.
- **Behavior / rules:** Of three aircraft at the same altitude, two remained undetected while flying
  the same profile — the difference was **terrain, not altitude**. Mountains taller than the radar's
  emplacement block the beam: even a radar placed atop a mountain at **~12,000 ft** had drastically
  limited line of sight because surrounding peaks were taller. The LOS tool visualizes this restricted
  coverage, and the relief layer reveals exploitable masking corridors (valleys, depressions) to
  sneak through.
- **Outputs / effects:** Shape and extent of the radar's actual coverage footprint (masked sectors
  are blind regardless of nominal range).
- **Edge cases / quirks:** Tactical exploit: route strikers through masked valleys while a decoy is
  detected, so interceptors chase the decoy. A full terrain-masking treatment lives in the Terrain &
  Environment bucket; here it is demonstrated qualitatively.
- **Source:** bsLLZwqi4Mg
- **Confidence:** High

### Waypoint altitude-change timing (descent occurs AT the waypoint, not before)
- **Models:** An aircraft does not begin changing to a waypoint's commanded altitude until it
  actually reaches that waypoint, so it flies the previous leg at the previous altitude. (Detection
  consequence of a movement mechanic; retained here because it gates low-altitude radar evasion.)
- **Inputs / parameters:** Per-waypoint commanded altitude; current altitude on the inbound leg;
  waypoint placement/spacing.
- **Behavior / rules:** If you set altitude X (e.g. **8,000 ft**) at a waypoint, the aircraft holds
  its PREVIOUS (higher) altitude until it arrives there, then descends — so at the moment it crosses
  that waypoint it can already be detected because it was still high on the approach. Correct
  technique: set the LOWER altitude on an EARLIER (intermediate) waypoint so the descent completes
  before the segment where you need to be low — the previous point must carry the target altitude.
  The narrator builds a descending "half sine wave" profile (e.g. 32,000 → 18,000 → 8,000 → ~1,500
  ft) by assigning each successive earlier waypoint the altitude needed by the NEXT point. Confirmed
  live: a leg flown at **~7,690 ft** was picked up at **115 nm** because the 8,000 ft setting was a
  touch too high / set too late.
- **Outputs / effects:** Actual altitude flown on each leg; whether the aircraft is above or below the
  radar horizon when crossing each waypoint.
- **Edge cases / quirks:** Narrator warns this timing behavior "makes everybody positively absolutely
  nutters." Also: altitude/order settings can be silently **reset to the platform default** whenever
  you take certain other actions on the unit, so a previously-issued low-altitude order can revert to
  the original (36,000 ft) without notice — always re-verify.
- **Source:** bsLLZwqi4Mg
- **Confidence:** High

---

## Doppler processing — look-down, clutter & notching

### Doppler filtering, look-down/shoot-down & ground-clutter rejection
> Merged from 7mmQ2y11hPc, xV-H7HJd2-I, and FOQ6kcf9YzA, which describe the same Doppler/clutter
> family. The pulse-only / semi-Doppler / true-Doppler **ladder** and the **notch** are split into
> their own entries below.
- **Models:** Pulse-Doppler radars reject strong ground returns by filtering on relative (radial)
  speed, enabling look-down/shoot-down; a plain-pulse radar without Doppler filtering cannot separate
  a low/below target's skin return from the ground return.
- **Inputs / parameters:** Radar Doppler-filtering capability (pulse-Doppler vs plain pulse);
  relative radial velocity between radar and target; target aspect angle; relative altitude
  (above/below); availability of a plain-pulse mode; presence of a "look-down/shoot-down" capability
  flag and era; ground clutter; radar-beam spread.
- **Behavior / rules:** A plain-pulse radar without Doppler filtering CANNOT detect a target below it
  (ground returns swamp it) — e.g. a **MiG-21bis** could not see a target beneath it; dropping the
  MiG to a lower altitude (so the target is above it, no ground behind it) restored detection.
  Pulse-Doppler radars (e.g. **F-4 Phantom**) filter out ground by detecting the speed difference, so
  they see low targets against ground clutter. Conceptually: a co-altitude target gives one return; a
  target BELOW own aircraft produces TWO returns (target + the much stronger broad ground return), and
  for sufficiently low targets the target return is "completely touching the return of the ground" and
  cannot be differentiated. Look-down/shoot-down sets (e.g. the **Sapphire-23ML**, 1970s) detect low
  targets in ground clutter; a MiG-23 with look-down detected a low target with no impact from
  clutter, whereas a MiG-21bis WITHOUT look-down flew right over a medium-altitude target and never
  saw it. A lower-flying radar platform can still detect a higher target without needing look-down.
- **Outputs / effects:** Determines whether low-altitude / below targets are seen and against which
  radar; can cause loss of radar lock on launched weapons when the target beams (see notch entry).
- **Edge cases / quirks:**
  - **Tactic:** fly LOWER to improve detection of targets above you (no ground clutter behind them);
    descend the radar platform **below** the clutter layer and even a poor non-Doppler set holds low
    targets ("getting it underneath where the ground clutter was going to make it impossible").
  - **Slow/hover does NOT hide you in CMO:** a parked Mi-24V (0 kt) and one doing only 20 kt were both
    detected by an old P-37 (contrast flight sims). A pure ground-radar that detects ONLY by speed
    difference shows "zero noise" against a no-speed-difference target.
  - "Just about all radars have some form of Doppler filtering at this point."
- **Source:** 7mmQ2y11hPc, xV-H7HJd2-I, FOQ6kcf9YzA
- **Confidence:** High

### Pulse-only / semi-pulse-Doppler / true-pulse-Doppler detection ladder
- **Models:** The three rungs of clutter-rejection capability, demonstrated with three F-4-era radars
  plus an F-16 radar, governing how well each sees low/below targets.
- **Inputs / parameters:** Radar type (pulse-only e.g. "dropkick"; semi-Doppler e.g. APQ-120 "semi
  pulse stopper"; true pulse-Doppler e.g. APQ-68 / F-16 radar); target altitude AGL; target altitude
  relative to own aircraft; range; radar-beam spread; light Doppler filtering (semi); radial velocity
  (true).
- **Behavior / rules:**
  - **Pulse-only:** cannot detect low targets at all. At 36,000 ft using the pulse-only "dropkick,"
    co-altitude/high contacts were detected (**~21–23 nm**), but a slightly-lower contact was picked
    up then DISAPPEARED "once the ground took up the majority of the radar scope" — even at 25,000 ft.
    Targets very low (~2,000 ft, ~1,000 ft, ~200 ft) were NEVER detectable: "no matter how hard I try
    this radar will never be able to detect those guys… there's no Doppler filtering on it — this is a
    non-look-down/shoot-down radar." (DCS MiG-21 analogy: bottom half of scope is one solid clutter
    blob.)
  - **Semi-pulse-Doppler:** "a super unique radar… uses basically an algorithm to identify certain
    contacts it could see in pulse mode and identify them as aircraft because of their return… plus a
    little bit of Doppler filtering." Detected co-altitude/high contacts (**~36–39 nm**) AND held
    low/below targets at **~12,000 ft, ~2,000 ft, even ~200 ft** (all ~36–38 nm). Performance sits
    between pulse-only and true pulse-Doppler; still imperfect ("ancient technology"), some low
    contacts drop in/out.
  - **True pulse-Doppler (look-down/shoot-down):** filters by Doppler shift, identifies "things that
    are closing towards us or going away from us" through clutter. The F-16 radar held high,
    co-altitude, medium and very-low (**1,000 ft, 400 ft AGL**) contacts at long range (**~39–43 nm**).
- **Outputs / effects:** Recovers (or fails to recover) detection of low/below targets per radar rung.
- **Edge cases / quirks:** Advanced versions of the F-4 were historically rare/unbuilt. True
  pulse-Doppler trades clutter rejection for a perpendicular blind **notch** (next entry). Phased-array
  radars are a separate, more sophisticated topic.
- **Source:** xV-H7HJd2-I
- **Confidence:** High

### Doppler notch / beaming blind spot (zero radial velocity)
> Merged from xV-H7HJd2-I, 7mmQ2y11hPc, and FOQ6kcf9YzA; includes the explicit CMO behavioral quirk.
- **Models:** A target with ~zero radial velocity relative to the radar (flying perpendicular /
  "beaming") produces ~zero Doppler shift and is indistinguishable from stationary clutter, so a
  Doppler-filtering radar rejects it — the "notch."
- **Inputs / parameters:** Angle between target velocity vector and line-of-sight to radar; target
  speed; radar type (Doppler-dependent vs pulse-only).
- **Behavior / rules:** A target flying exactly perpendicular ("no movement relative to us") is
  COMPLETELY invisible to a pulse-Doppler radar even at close range — a demo target at **26 nm** was
  undetectable while beaming; the instant the geometry became slightly oblique, it was detected. The
  narrator eyeballs the blind window: "360 degrees minus 8 — about an **8 degree** window where he's
  completely utterly blind," and notes the detectable shift ≈ sin(angle off perpendicular) × speed.
  **CMO QUIRK (important):** the classic notch/co-speed evasion "actually does not apply here" in the
  *radar tutorial* demo — the F-4's radar detected crossing, co-speed, and approaching targets with
  "no difficulty." So treat the notch as **modeled for true Doppler look-down sets** (xV-H7HJd2-I
  measured an ~8° blind window) but explicitly **not** applied in the 7mmQ2y11hPc / FOQ6kcf9YzA F-4
  demos — a documented CMO inconsistency, not a single fixed rule.
- **Outputs / effects:** Targets within the narrow perpendicular notch produce no detection on a
  Doppler radar; leaving the notch yields immediate detection. Beaming during a missile engagement can
  break the radar lock (launched weapons lose lock when a target beams them).
- **Edge cases / quirks:** Exact notch width is **eyeballed** (~8°), NOT a confirmed CMO constant. A
  **pulse-ONLY** radar has no notch — switching to the "dropkick" immediately detected
  perpendicular/beaming targets (at the cost of clutter performance). A pure pulse mode (e.g. F-14)
  could still see a beaming target if not also masked by ground clutter.
- **Source:** xV-H7HJd2-I, 7mmQ2y11hPc, FOQ6kcf9YzA
- **Confidence:** Med (notch width eyeballed; CMO application inconsistent across demos)

---

## Radar cross section, aspect & stealth

### Radar cross section varies with aspect/altitude (and the "point at it to hide" rule)
> Merged from FOQ6kcf9YzA and xV-H7HJd2-I (aspect/look-down geometry).
- **Models:** Detection range depends on the target's presented radar cross section, which changes
  with aspect angle and altitude (look-down angle).
- **Inputs / parameters:** Target aspect relative to radar; altitude (look-down angle = own altitude
  vs target altitude); radar type (pulse vs Doppler).
- **Behavior / rules:** Two identical aircraft at identical speed and altitude were detected at
  different ranges purely due to RCS differences from aspect — one at **~217 nm**, the identical one
  not until **~204 nm**. Pointing **nose-on** at the radar presents a smaller RCS and delays detection
  — "pointing at the radar you're trying to hide from is one of the best ways to not be seen by it."
  Look-down geometry inverts intuitively: a LOWER target was detected at a LONGER range (**42 nm**)
  than a CO-ALTITUDE target (**~39 nm**) because "I'm now seeing part of the top of the airplane,"
  which presents more reflective planform than a head-on nose view; low contacts were repeatedly
  picked up **~3–3.5 miles** farther out than co-altitude ones.
- **Outputs / effects:** Smaller presented RCS → shorter detection range; more reflective planform
  (top/look-down) → earlier detection. Detection range scales with presented aspect, not purely with
  slant range.
- **Edge cases / quirks:** **CRITICAL EXCEPTION:** against a **pure-Doppler** radar, pointing right at
  it is the WORST choice because the radial speed difference is maximal and it detects/IDs you through
  clutter regardless of RCS. The look-down planform benefit only applies once Doppler/look-down lets
  the radar see down at all.
- **Source:** FOQ6kcf9YzA, xV-H7HJd2-I
- **Confidence:** High (aspect High; look-down planform effect Med)

### Stealth vs radar frequency band
- **Models:** Low-band (early-warning) radars detect stealth aircraft more easily than modern
  high-frequency radars.
- **Inputs / parameters:** Radar band (VHF / early-warning low band vs higher microwave bands);
  aircraft stealth shaping; presence of other defenses (jamming/clutter).
- **Behavior / rules:** Stealth shaping is tuned against higher-frequency bands; older early-warning
  radars on lower bands (the demo bar-lock is "enf"/VHF-class, early-1960s tech) detect stealth more
  easily. An **F-117** flying straight at a bar-lock early-warning radar was detected electronically
  (not visually) at **~37 nm** with "no difficulty." Real stealth survivability in CMO usually comes
  from OTHER factors (jamming, clutter) rather than radar invisibility per se.
- **Outputs / effects:** Stealth aircraft are detectable (at reduced but non-trivial range) by
  low-band radars; high-frequency modern radars have a harder time.
- **Edge cases / quirks:** Detection was electronic, not visual. Stealth is **not** a binary cloak in
  CMO — it reduces, doesn't eliminate, detection, and band matters. (See also the band/wavelength
  fundamentals entry: each target has separate long- and short-wavelength detection ranges.)
- **Source:** FOQ6kcf9YzA
- **Confidence:** Med

---

## Range resolution & phased-array geometry

### Range/angular resolution — unresolved targets merge (patch 1147.39)
- **Models:** A radar has finite range/angular resolution; targets closer together than that
  resolution cell merge into a single contact or an elongated blob. Resolution is worse at longer
  wavelengths / lower frequencies and with smaller dishes.
- **Inputs / parameters:** Radar frequency/wavelength; antenna dish size (beam width); transmit power;
  target spacing within a formation. (Demo also varies kilowatts via a separate proprietary
  radar-design tool.)
- **Behavior / rules:** Targets separated by less than the radar's range-resolution cell cannot be
  told apart and appear as one contact (or one long smeared target). Resolution improves with HIGHER
  frequency: three contacts are tiny distinct specks at **8.5 GHz** and very easy at **9.5 GHz** (near
  fighter-control), but at **1.5 GHz** they merge into one long/ambiguous return. Resolution degrades
  with a SMALLER dish: shrinking the dish (1 → ~1.5, raising power to **250 kW** to compensate) widens
  the beam massively, producing a giant smeared line instead of point targets. In-game: a **P-8 "Knife
  Rest"** 2D radar (low frequency, low resolution) viewing tightly-spaced F-16s shows them as a
  **single** contact, with an area-of-uncertainty line spanning **~16 nm** wide. **Eight** launched
  aircraft were reported as only **six** contacts (then later more) because closely-spaced members
  collapsed into shared contacts; wider-spaced aircraft resolved separately. Lower wavelength worsens
  it: ABM radars with ~5,000-mile range render ~10 launched missiles as a single bouncing line.
- **Outputs / effects:** Number and shape of displayed contacts (merged/elongated vs discrete) and the
  positional area-of-uncertainty for a formation.
- **Edge cases / quirks:** A very tight fire-control radar (e.g. the SA-2's tall, very-tight-wavelength
  FC radar) has so narrow a beam that while locked onto one target it CANNOT see nearby targets at all
  — the narrator notes a real SA-2 should still glimpse neighbors, so he is surprised this is **not**
  simulated. As an engaged formation member breaks away, it separates and becomes individually
  visible. Demo GHz/kW numbers come from the narrator's separate proprietary radar-design tool, not
  CMO itself. See the naval-formation-spacing note (movement-detection doc): stacked contacts at the
  same point fuse into one.
- **Source:** g8Qzj1l56_E
- **Confidence:** High

### Phased-array side-lobe / off-boresight gain falloff (patch 1147.39)
> Merged from g8Qzj1l56_E and ESM7cvhTkco (the "new phased array radar changes"); both describe the
> same boresight-gain-falloff / fixed-face-baffle mechanic.
- **Models:** A phased-array (electronically scanned) radar concentrates gain straight ahead
  (boresight); range falls off toward the edges of its scan, so "if you don't point at it you can't
  see it." A single-face radar has a blind off-boresight region (baffle).
- **Inputs / parameters:** Angle of the target off boresight relative to the antenna face; the array's
  nominal boresight range; antenna mounting (single fixed face vs 360° rotating); target RCS/stealth;
  own-radar quality.
- **Behavior / rules:** Gain (and thus range) is maximal out the straight front of the array and
  deteriorates progressively toward the lobe/edge of physical coverage — "as you get further away from
  the center you basically lose gain… it's a little more complicated than that." Worked example
  (**AN/SPY-class "Aegis"**): nominal/home range **175 nm** at boresight, falling to **111 nm** at the
  physical edge — computed as a **~63%** range reduction off boresight. Tactical result: a target near
  boresight is detected immediately at long range (175 nm) and its closely-spaced mates (~1.5 mi
  apart) all instantly resolved; a target approaching from the side/edge sector is detected only much
  closer — one group was not picked up until **30 nm** while the boresight group was tracked at 175 nm;
  a separate group at ~50 mi in a weak sector went undetected until much closer (low altitude further
  delayed it). In the ESM7cvhTkco demo a single-direction **Su-57** radar detected the B-52 (large RCS,
  within usable cone) and eventually the F-35 (own radar very good + came into cone) but **completely
  missed** the **F-16** on multiple sweeps because it sat in the radar's blind off-boresight region.
- **Outputs / effects:** Effective detection range as a function of bearing off boresight; which
  sectors are strong vs degraded. Off-boresight contacts can be dropped or never acquired even at close
  range. Not modeled as a simple on/off circle for these radars — it is angle-dependent gain.
- **Edge cases / quirks:** A full **360° phased array** (e.g. **S-400**) does NOT suffer this
  directional effect (multiple faces "cover each other's nodes," no weak sector). Many **aircraft**
  carry phased arrays too (F-16 AESA pods, F-35, Su-57), so the same boresight rule applies — an F-35
  in another phased array's weak/side sector becomes effectively invisible where a traditionally-scanned
  radar would have seen it. Very-low-observable targets with their own excellent radar (F-35) can still
  be detected because own gain is high; a large non-stealthy target (B-52) is easy; the dangerous quirk
  is a modest non-stealth fighter (F-16) sitting in the baffle being "completely invisible" close enough
  to fire. Narrator flags this as a recent CMO modification.
- **Source:** g8Qzj1l56_E, ESM7cvhTkco
- **Confidence:** High (Med where geometry numbers are example-specific)

### Baffle-clearing maneuver (zig-zag / weave to expose the blind aspect)
- **Models:** Aircrew physically slewing the airframe (and thus the fixed radar face) by weaving so
  the radar sweeps the previously-blind side — clearing the baffles.
- **Inputs / parameters:** Aircraft heading changes over time (turn/weave amplitude); waypoint/
  reference-point pattern; mission movement style (repeatable loop); base course.
- **Behavior / rules:** Place reference points in a zig-zag pattern, build an A/A patrol mission over
  them, and set movement style to "repeatable loop" so the aircraft continuously weaves left/right
  along its base course. Each turn momentarily points the fixed radar face toward the previously-blind
  side ("clear the baffle in the other direction"), letting it detect contacts there. In the demo,
  after switching to the weave the same aircraft detected the B-52, then the F-16 (previously
  invisible), then re-acquired the F-35. Key point: the weave does **NOT** need to be aggressive —
  "you don't really have to be super aggressive… you can actually keep them pretty much on the same
  course." A small heading oscillation suffices.
- **Outputs / effects:** Converts a fixed-face radar's blind off-boresight zone into
  intermittently-covered space; previously-undetected side contacts become detectable as the nose
  sweeps across them.
- **Edge cases / quirks:** Implementation quirk — when a weaving CAP aircraft detects a contact it may
  break off and chase it ("immediately chases after him"), pulling it off the patrol pattern; manually
  return it. The pattern was a straight line "in the old days" before the phased-array change made
  weaving necessary.
- **Source:** ESM7cvhTkco
- **Confidence:** High

### Fire-control radar lock gives continuous, high-confidence track on the locked target
- **Models:** When a dedicated fire-control radar points its full energy at one target to engage, that
  target is tracked with continuous, frequent updates regardless of the formation-merging that affects
  search radars.
- **Inputs / parameters:** Fire-control radar pointing at a specific target (engagement); the FC
  radar's wavelength/beam; whether the unit is committed to engage.
- **Behavior / rules:** Ordering the SAM (SA-2) to engage flips on its fire-control radar; the instant
  it activates, that one radar target is reliably picked out and receives CONSTANT updates because the
  whole dish is pointed directly at it. This contrasts with the 2D search radar's merged/ambiguous
  returns: the FC lock resolves the engaged target even when search returns were blobbed. The very
  tight FC wavelength means it sees ONLY the locked target and not the surrounding formation members
  (see range-resolution entry).
- **Outputs / effects:** A continuously-updated, well-resolved track on the engaged target while other
  contacts remain ambiguous on the search picture.
- **Edge cases / quirks:** Turning on the FC radar to engage also makes the SAM detectable/announces
  the engagement (ties into ARM-needs-emission). Narrator notes the real-world expectation that an SA-2
  FC radar would still glimpse nearby targets is **not** modeled.
- **Source:** g8Qzj1l56_E
- **Confidence:** High

---

## Passive detection — ESM / ELINT / RWR

### ESM passive detection — bearing + classification, no instant fix
> Merged from oF8LwbZSm28, hCvQYbFYlt4 (recon ELINT), and the radar-tutorial ESM notes (7mmQ2y11hPc);
> the detection-range multiplier and triangulation get their own entries below.
- **Models:** Passive electronic-support-measures detection of any radar that is actively emitting,
  yielding emitter identity and a bearing/uncertainty wedge but not an exact position from a single
  sensor.
- **Inputs / parameters:** ESM platform sensitivity/era; emitter type and signal parameters (pulse
  intensity, frequency, pulse repetition frequency, pulse/dwell times); angle to emitter; emitter must
  be radiating; LOS (with OTH exceptions); range; ESM package range ceiling; curvature of earth.
- **Behavior / rules:** With no active radar of your own, ESM picks up emissions by intensity and
  angle. It can **classify** the emitter type (e.g. "air search 2D radar," "2D medium range radar,"
  "3D long range radar") and produce a bearing with an uncertainty region, but generally CANNOT
  directly give exact target position — this basic limitation persists even with the most modern
  (2010s) ESM. Getting physically closer shrinks the uncertainty region. You can only detect radars
  that are **switched on**. Identity is often deducible by matching the detected radar type against the
  known scenario platform list (e.g. a "3D long range air-to-air radar" must be the AWACS/A-50 if it's
  the only carrier). Low-PRF emissions imply a long-range search radar. Some ESM only flags "a radar
  signal" or a generic class ("search radar 4"); better sets give a specific emitter ID (open the unit
  → emitter ID).
- **Outputs / effects:** New contact with type/classification + bearing + uncertainty wedge; identity
  inferable by elimination; with two spaced platforms the position can be triangulated.
- **Edge cases / quirks:** ESM requires the emitter to be radiating — if the enemy doesn't emit (or
  shuts down after a quick scan) you cannot locate them. You generally must FACE the target / have LOS
  (OTH and side-lobe exceptions are separate entries). Logic checks apply: a "skunk" (surface) contact
  can't be on land, narrowing its position along the bearing. **There is NO communications intelligence
  (comm-Intel) in CMO** — you cannot direction-find radio traffic or read intercepted orders.
- **Source:** oF8LwbZSm28, hCvQYbFYlt4, 7mmQ2y11hPc
- **Confidence:** High

### ESM detection-range multiplier vs an emitting radar (~1.5–3×)
> Merged from s4t0ugMfDFY (EW), hCvQYbFYlt4 (recon), 7mmQ2y11hPc (radar), and oF8LwbZSm28 (ESM); the
> multiplier figure differs by video, so the **range** of values is preserved verbatim rather than a
> single constant.
- **Models:** A passive ESM receiver detects an emitting radar out to a **multiple** of the emitter's
  own detection range.
- **Inputs / parameters:** Emitter's own (active) detection range; the emitter must be ON; ESM/ELINT
  sensitivity/era; ESM package range ceiling; curvature of earth.
- **Behavior / rules:** When a radar transmits, ESM detects it at roughly:
  - **~2× to 3×** the emitter's own range (s4t0ugMfDFY, equipment-dependent),
  - **~1.5× to 2×** (hCvQYbFYlt4 recon video),
  - **~1.5×** (7mmQ2y11hPc radar video, and oF8LwbZSm28 baseline: "esm has the ability to detect
    something out to about **1.5 times** its actual detecting range").

  Worked examples: a **100 nm**-range long-range radar is reliably ESM-detected to **~150 nm** (the
  A-50's radar was being picked up at **~93 nm**); a 1960s ESM picked up a short-range "dog ear" radar
  "at about **double** its effective range." The ESM package's **own** range ceiling can cap this even
  when geometry allows — a **Long Track** radar of **~200 nm** range was detected at only **~184 nm**
  (not 350+) because the package range was limited.
- **Outputs / effects:** A bearing line / emitter contact at the derived range; basis for placing very
  sensitive ESM platforms well back.
- **Edge cases / quirks:** **Treat the multiplier as roughly 1.5–3×, equipment-/era-dependent, NOT a
  single fixed value.** The multiplier grows with ESM generation/sensitivity. Curvature of earth still
  limits some signals.
- **Source:** s4t0ugMfDFY, hCvQYbFYlt4, 7mmQ2y11hPc, oF8LwbZSm28
- **Confidence:** Med (numbers vary across videos by design)

### ESM generation/era effects on resolution and classification
- **Models:** Newer ESM tech detects more signals at greater range and resolves finer
  identity/position.
- **Inputs / parameters:** ESM era (1950s, 1960s, 1990s, 2010s); antenna sensitivity; miniaturization.
- **Behavior / rules:**
  - **1950s:** only general DIRECTION of the target plus rough radar details; manual oscilloscope-style
    work; large uncertainty.
  - **1960s:** detects far more signals at greatly expanded range, near-instant recognition of
    distinctive emitters (SA-2 pattern), can narrow a ship to its specific class, and can identify
    specific unit types by signal parameters.
  - **2010s:** very tight area-of-certainty and faster fixes, but STILL cannot directly pinpoint exact
    position (the fundamental ESM limit).

  Across all eras, two emitters using the exact same frequency cannot be told apart by ESM alone.
- **Outputs / effects:** Higher era → more contacts, longer range, finer classification (down to
  class/type), tighter uncertainty; still no instantaneous exact fix.
- **Edge cases / quirks:** Identical-frequency emitters remain indistinguishable regardless of ESM era.
  Identity ambiguity (e.g. SA-6A vs SA-6B) is resolved only by detective work / the number of distinct
  radars emitting.
- **Source:** oF8LwbZSm28
- **Confidence:** High

### ESM triangulation / cross-fixing for position
- **Models:** Crossing two or more ESM bearings (or moving the platform over time) converges an
  emitter's position; multiple platforms or grouped/co-located sensors do it automatically.
- **Inputs / parameters:** Two+ bearing lines from different positions/times; the angle between
  bearings (geometry); number of ESM platforms; reference points (RPs); for moving emitters, TMA over
  time.
- **Behavior / rules:** Drop reference points along an early bearing, wait, take a new bearing from a
  different position, and the intersection triangulates the emitter (for a moving emitter this is
  **TMA** — target motion analysis). Two ESM aircraft do the math simultaneously for a much faster,
  precise fix; three-way triangulation is better still and can fix nearly every emitter in **<1 minute**
  game-time without exposure. Confidence grows with more time, stronger signal, and better geometry.
  **OPTIMAL GEOMETRY: aim for ~90 degrees between the two bearings** for the most reliable reading. A
  single 1990s platform flying a pattern triangulated a target to **~2.3 nm** error without ever closing
  within **100 nm**. Fixed (stationary) emitters fix faster than moving ones. Co-located sensor pairs
  (e.g. satellite + aircraft) auto-triangulate so the operator need not draw bearings.
- **Outputs / effects:** Converged emitter position estimate with shrinking uncertainty; precise
  multi-platform fixes; no own-emission/exposure required.
- **Edge cases / quirks:** Requires the emitter to be radiating throughout. Moving emitters require TMA
  and stay more uncertain. Two emitters on the same frequency still cannot be separated even with
  triangulation. "Clever players" scan, fix, then shut radars off so ESM only gets a stale "taste" of
  position.
- **Source:** oF8LwbZSm28
- **Confidence:** High

### Satellite ESM (NOSS triangulating triplets)
- **Models:** High-altitude ESM satellites passively locate emitters over huge footprints and
  self-triangulate when flown in clusters.
- **Inputs / parameters:** Satellite type (e.g. **NOSS** naval-observation sats); cluster count
  (deployed in groups of **three**); slant angle/geometry; altitude (**~300 nm** vertical in demo);
  ground range.
- **Behavior / rules:** NOSS satellites are deployed in groups of three precisely so they can
  triangulate a signal on their own. They begin electronically locating emitters at very long range
  (demo: started identifying platforms at **~1,500 nm**). Confidence improves as the geometry becomes
  less of a slant (more overhead); at **~300 nm** ground range (with ~300 nm vertical) a confident fix
  on much of the equipment was achieved. Hard to engage because of altitude. Logic checks apply: a
  SAM/radar fixed "in the middle of the ocean" must really be on land, so the position can be projected
  onto the landmass.
- **Outputs / effects:** Wide-area passive emitter geolocation; self-triangulated fixes from the
  triplet; confidence rising as slant decreases; can be paired with an aircraft to cross-fix
  automatically.
- **Edge cases / quirks:** Emitter must be radiating. Slant geometry degrades early fixes. Combine
  satellite + aircraft for even better cross-fixes without drawing bearings.
- **Source:** oF8LwbZSm28
- **Confidence:** Med

### Over-the-horizon (OTH) ESM via scattering
- **Models:** Certain ESM/sensor systems detect emissions beyond LOS via over-the-horizon scattering.
- **Inputs / parameters:** Sensor OTH-capability flag (e.g. a Sea Wolf sub's sensor); platform
  depth/height (surface vs periscope depth raises detection distance); emitter radiating.
- **Behavior / rules:** Most ESM in the scenario required LOS, but some systems have an OTH-detect
  flag. A submarine with an OTH sensor, brought to the surface (raising detection distance vs periscope
  depth), detected radars (target-indicator "dog ear," "3D long-range") it had no direct LOS to. This
  creates an asymmetry: the sub could electronically see a surface ship via OTH scattering BEFORE that
  ship (with only a surface-search radar, no OTH) could see the sub. Long-range radars are recognizable
  by very low PRF even at OTH ranges. The radar tutorial confirms some surface ships (e.g. an **Arleigh
  Burke**) also do over-the-horizon analysis of EM signals, sensing an enemy radar before being
  detected themselves.
- **Outputs / effects:** Detection of emitters beyond LOS; asymmetric early warning vs non-OTH
  emitters; depth/height trades detection range against survivability.
- **Edge cases / quirks:** Surfacing a sub is normally very risky (done here only to extend OTH range).
  Only **OTH-flagged** sensors get this; ordinary LOS rules apply to everything else.
- **Source:** oF8LwbZSm28, 7mmQ2y11hPc
- **Confidence:** Med

### RWR / HTS as ESM-class sensors with frequency-band limits
- **Models:** Radar warning receivers and HARM targeting systems are the same passive ESM mechanic,
  just less accurate, and are bounded by their frequency coverage / threat library.
- **Inputs / parameters:** RWR/HTS sensor era; the specific frequency bands the receiver is sensitive
  to; a pre-programmed threat library; emitter type/band.
- **Behavior / rules:** RWR and HTS pick up the SAME type of emitter info as dedicated ESM
  (type/bearing) but are much less accurate, and can be triangulated just like other ESM. **CRITICAL
  LIMIT:** a receiver only detects frequencies/threats it is **sensitive to**. An early-80s set (e.g.
  **ALR-56**) can do air AND surface electronic search; very early (1950s/1960s) RWRs could only sense
  specific pre-programmed SAM systems. If a threat's frequency isn't in the receiver's coverage/library,
  you get **NO warning** — cited historically: Israeli RWRs didn't know the SA-6 frequency (Six-Day /
  Yom Kippur era), and Vietnam SA-2 variants introduced new frequencies operators hadn't pre-programmed,
  so launches went unwarned.
- **Outputs / effects:** Threat type + (coarse) bearing when in-band; can feed triangulation; nothing
  at all for out-of-band / unlibraried emitters.
- **Edge cases / quirks:** Out-of-band threats are invisible to the receiver (no launch warning).
  RWR/HTS have no special properties beyond standard ESM other than lower accuracy and band/library
  constraints.
- **Source:** oF8LwbZSm28
- **Confidence:** High

### Radar side-lobe / non-frontal emission detection (CMO quirk)
- **Models:** Radars in CMO radiate energy sideways, not only along the main beam, creating off-axis
  detection opportunities.
- **Inputs / parameters:** Emitter orientation/facing; receiver position relative to the emitter's main
  beam.
- **Behavior / rules:** Stated as "a little different in this compared to the real world": not all
  radar energy goes straight out the front — a lot radiates sideways, so ESM can detect an emitter even
  when its main beam is not facing the receiver. Conversely, in the early-1950s ESM demo several
  air-warning radars dropped off ESM "because they're probably not facing us anymore" — so facing still
  strongly affects detectability, but off-axis side-lobe leakage gives extra chances.
- **Outputs / effects:** Some emitters detectable off the main-beam axis; facing still the dominant
  factor for many emitters.
- **Edge cases / quirks:** Tension in the transcript: ESM "must face the target" generally, yet
  side-lobe radiation gives non-frontal detection — treat side-lobe as an **additional (weaker)
  detection path**, not a guarantee.
- **Source:** oF8LwbZSm28
- **Confidence:** Med

---

## Optical / EO-IR / satellite reconnaissance

### Camera / optical sensor model — max range, slant geometry, zoom-level signature multiplier
- **Models:** How CMO decides if an optical (visual/IR/LLTV) camera can detect/classify a ground
  target, combining the camera's hard max range, the slant distance from altitude, and a zoom-level
  multiplier applied to the target's base signature.
- **Inputs / parameters:** Camera max range (vertical AND horizontal/slant; e.g. **5 nm** tactical pod,
  **20 nm** Viggen long-range frame, **80 nm** SR-71/U-2); detection zoom level (**×2** RQ-4, **×10**
  Viggen, **×20** U-2/SR-71); classification zoom level; scan interval (e.g. **once per 10 s**);
  target's base visual/IR detection range (e.g. **T-64 = 0.6 nm**); aircraft altitude → slant distance
  to side targets; clouds/weather; day/night; land cover/terrain.
- **Behavior / rules:** If the **slant** distance to the target exceeds the camera's max range, the
  camera sees NOTHING regardless of quality ("if the slant is greater than 5 you can't see anything").
  Effective detection range = target base signature × camera detection-zoom level, but **capped** at the
  camera max range. Worked example: **T-64** base detection **0.6 nm × zoom 10 = 6 nm** desired, but
  capped at the camera's **5 nm** max → tank detected instantaneously at 5 nm (and classified, since
  classification zoom is also high). With a **20 nm**-max camera (zoom ×10 → 6 nm < 20 nm cap) the tank
  is seen at 6 nm instantaneously. Slant geometry: at **25,000 ft (~5 nm up)**, a 5 nm camera can only
  look straight down; a side target is **~7.1 nm** slant (exceeds 5 nm) → invisible. Descending to **~2
  nm** altitude brings side slant (**~3.4 nm**) within the 5 nm max. Scan interval is how often it "looks
  out the window" (10 s) — usually not a limiting factor.
- **Outputs / effects:** Detection and/or classification of ground/surface/air targets at the computed
  ranges; identifies aircraft parked at airfields (a contact-report arrow icon appears on the airport).
- **Edge cases / quirks:** Tactical recon is almost universally limited to a ~**5 nm** camera regardless
  of country → must fly low (e.g. dive to **2,000 ft**) and fast over the target. Small, non-moving
  targets (a tank, PT-76) are very hard to see unless moving or directly overhead. **Clouds (even
  "light" clouds) severely limit optical/satellite imaging.** Land cover matters: targets hidden in
  cities/lush forests have detection range vastly reduced; desert = easy, jungle = hard. Day/night and
  weather gate visual cameras (LLTV for night, lower resolution).
- **Source:** hCvQYbFYlt4
- **Confidence:** High

### Active imaging radars for recon (GMTI, SAR/ISAR, SLAR) vs cloud penetration
- **Models:** Ground-mapping and Doppler ground-moving-target-indicator radars, plus synthetic-aperture
  radar, detect ground targets through clouds — moving targets especially — where optical sensors fail.
- **Inputs / parameters:** Sensor type (ground-mapping radar; GMTI/MTI Doppler-filtered; SAR/ISAR; SLAR
  side-looking); whether the radar is switched ON; target motion (moving vs stationary); target radar
  signature/size; cloud cover.
- **Behavior / rules:** Optical sensors cannot see through clouds; radar can. **GMTI** (Doppler-filtered
  ground-mapping) makes MOVING targets very visible. **SAR** holds the beam steady while moving the
  airframe to image through clouds; **SLAR** is the side-looking variant (e.g. on MiG-25). A J-STARS-class
  SAR "spits out the sides," imaging one slice of sky per beam: anything moving is detected AND anything
  still is detected (the demo found a "Sofa-norman" ship plus previously-unknown truck depots, and
  pinpointed an emitting radar). You must turn the radar ON to use it.
- **Outputs / effects:** Detection/pinpointing of ground targets (moving and stationary) through cloud
  cover; reveals depots, vehicles, ships, and emitter locations.
- **Edge cases / quirks:** Active radar emission is detectable by enemy ESM (you light yourself up).
  **SLAR struggles to ID stationary targets and won't reliably ID ships.** Large radar signatures (e.g.
  a hospital at thousands of m²) are detectable from very far (claimed **~300 miles** if curvature
  allowed).
- **Source:** hCvQYbFYlt4
- **Confidence:** High

### All reconnaissance is real-time (no film-development delay); no comm-Intel
- **Models:** CMO abstraction — every recon sensor (including film cameras and satellites) delivers
  instantaneous results; communications intelligence is not simulated.
- **Inputs / parameters:** Any recon sensor (frame/film camera, digital, satellite, tactical Tomahawk
  camera).
- **Behavior / rules:** Even "frame cameras" that historically required physical film development return
  their imagery **instantaneously** in CMO — recon is real-time. There is **NO communications
  intelligence (comm-Intel)** in CMO: you cannot direction-find enemy radio traffic or read intercepted
  orders. Units only become contacts via sensors that have LOS/range on them.
- **Outputs / effects:** Immediate contact/classification info from any recon sensor; no intel derived
  from enemy communications.
- **Edge cases / quirks:** Explicit simplification vs the real world (where film analysis and comm-Intel
  dominate). Data-link-capable weapons (e.g. a camera Tomahawk with a datalink to its launching ship) can
  radio back battle-damage assessment **before** impact.
- **Source:** hCvQYbFYlt4
- **Confidence:** High

### Satellite reconnaissance — orbits, pass prediction, range, same optical limits
- **Models:** Satellites are sensor platforms subject to the same optical detection limits as aircraft
  (cloud-blocked, range-limited) but immune to being shot down; coverage depends on orbital passes.
- **Inputs / parameters:** Satellite type (image-intel/photo, MASINT "omni," NOSS/EORSAT
  naval-observation, SIGINT, early-warning, Keyhole blocks); current scenario year (whether a given
  satellite is in orbit yet); orbit (LEO passing vs geosynchronous); clouds; satellite sensor range
  (very large); satellite pass-prediction tool.
- **Behavior / rules:** Satellites can't see well through clouds (same as other optical sensors) and are
  subject to the same detection-vs-range limit as aircraft — but get a very large effective range bonus.
  A LEO satellite only sees a target when its orbit brings it close enough; use **Game → satellite pass
  predictions**, click the map, and it tells you when the next satellite passes (e.g. next pass in **55
  minutes** / **USA-116** in ~1 hour) — flagged as a very expensive calculation. Geosynchronous
  satellites loiter over one area. SIGINT satellites detect emissions over an enormous range. A satellite
  performs the same detection/classification as recon aircraft (IDs aircraft at airfields, ships) but
  **cannot be shot down**.
- **Outputs / effects:** Periodic detection/classification of ground/sea targets; emitter detection
  (SIGINT sats); ballistic-launch detection (early-warning sats).
- **Edge cases / quirks:** Availability is **year-gated** (the satellite must be in orbit for the
  scenario date). Each added satellite **slows the simulation**. Pass-prediction is computationally
  expensive. Clouds still block optical satellites.
- **Source:** hCvQYbFYlt4
- **Confidence:** High

### Contact decay / staleness and manual mark-position
- **Models:** Contacts no longer being sensed age and are automatically dropped after a time threshold;
  operators can pin a last-known position.
- **Inputs / parameters:** Time since last sensor update on a contact; **~1-hour** drop threshold; manual
  "mark position" action.
- **Behavior / rules:** A contact not refreshed by a sensor accumulates an age and, if it exceeds roughly
  **one hour** without update, is automatically dropped from the picture (example: a contact "48 minutes
  ago" still shown, with the note that >1 hr auto-drops). Operators counter this by right-clicking the
  contact → "mark position" to retain a reference marker after the live contact disappears.
- **Outputs / effects:** Stale contacts vanish; marked positions persist as static references.
- **Edge cases / quirks:** Short-sweep mechanical radars also show short-term age timers (2–10 s) between
  sweeps (distinct from the ~1 hr full-drop). Mark-position is the standard mitigation before a contact
  times out.
- **Source:** hCvQYbFYlt4
- **Confidence:** Med

### Visual detection range (database value, aspect-dependent)
- **Models:** How far away a target can be visually spotted, varying by viewing aspect and conditions.
- **Inputs / parameters:** Per-target database **visual detection range** value (front vs side); viewing
  aspect (front/side/oblique); environmental conditions (darkness, rain, cloud).
- **Behavior / rules:** Each platform has a stored visual detection range that differs by aspect. Example:
  a large commercial vessel is detectable at **12.97 nm** from the **front** and **~22 nm** from the
  **side** (active visual detection range from the side stated as **22.04 nm**). If it is dark, rainy, or
  cloudy, that value will be "significantly different" (reduced) — magnitude not specified. This base
  range is then modified by the sensor's zoom (next entry).
- **Outputs / effects:** Determines the maximum range at which an unaided/baseline (1×) sensor can spot
  (not necessarily identify) the target.
- **Edge cases / quirks:** Front-aspect range is much shorter than side aspect (12.97 vs 22.04 nm for the
  example ship). Weather degrades it but no numeric penalty is stated.
- **Source:** A7oqIAMhKF8
- **Confidence:** High

### Visual sensor zoom multiplier (detection & classification scaling)
- **Models:** Optical magnification (cameras/binoculars) extending how far a sensor can detect and
  especially classify targets vs the naked eye.
- **Inputs / parameters:** Sensor's "visual zoom detection and classification" factor (e.g. **1×, 4×,
  8×, 20×**); sensor max range cap; base visual detection range; base classification/ID range (stated to
  be about **half** of detection range).
- **Behavior / rules:** A sensor with zoom N detects/classifies at N times the distance of a 1× device.
  Examples: Harrier **TIALD** pod zoom = **8** (8× a 1× device); **O-2 binoculars** zoom = **4×** with an
  **18 nm** sensor range; **F-18 Lightning** pod = **20×**. Classification/ID distance is computed as
  roughly **half** the detection range, then multiplied by the zoom: side detection **13.36 nm** (used as
  the classification base) **× 4 = 53 nm** classification distance. **CRITICAL:** the result is still
  capped by the sensor's own maximum range — binoculars compute a 53 nm classification distance but the
  sensor max range is **18 nm**, so identification only triggers once inside 18 nm.
- **Outputs / effects:** Effective spot range and (separately) classification/identify range; gated by
  the hard sensor max-range cap.
- **Edge cases / quirks:** Higher zoom can ID better than the naked eye even when the naked (Mark 1)
  eyeball can SPOT farther — spot range and ID range are independent. The eyeball example: the eyeball
  spots farther than binoculars, but the 4× binoculars classify instantly once in their range while the
  eyeball still cannot ID. The computed classification distance is frequently irrelevant because the
  max-range cap dominates.
- **Source:** A7oqIAMhKF8
- **Confidence:** High

---

## Offensive ECM — noise jamming

### Offensive (noise) jamming — band-match requirement, position denial & radar-suppression contest
> Merged from s4t0ugMfDFY (offensive jamming), W6MStyQhQIY (OECM position denial), and FI-ZwDubiMY
> (band-match requirement). These three describe the same noise-jamming mechanic; richest detail and all
> numbers retained.
- **Models:** Standoff noise jamming floods a radar with electromagnetic noise so it cannot resolve
  range/track in the jammed direction. Effectiveness is a contest between jammer generation and radar
  generation/quality, and it **denies position confidence while making the jammer itself more obvious**.
- **Inputs / parameters:** Jammer generation/era (e.g. 1970s vs 2020s); radar generation/quality;
  electronic band(s) the pod covers vs the band(s) the radar uses; number of channels/bands the jammer
  can block simultaneously; antenna geometry; range between jammer and radar; relative geometry (jammer
  must be on the line between target and radar, and NOT above the jammed unit); LOS to the radar; radar
  power (burn-through).
- **Behavior / rules:**
  - **Band match is mandatory:** a jammer must operate on the same band(s) the enemy radar uses or it
    does **nothing** (a jammer covering only EFGHIJ bands cannot touch an A/B-band radar; a generic
    2000s OECM pod "can't jam radars of that band" — the B-band Nebo-M). When the pod **cannot** match
    the band, turning jamming on does NOT reduce detection range; instead the emission makes the platform
    **more** electronically obvious, so it is detected at the **same or a farther** range than unjammed
    (B-52 detected at **~250+ nm** with wrong-band jamming vs unjammed). When a **band-matched** pod is
    used (e.g. **AN/ALQ-99J** on the right frequency), the radar IS jammed and detection range collapses
    dramatically (B-52 baseline 250 nm → new air contact at **104–105 nm** with a single matched pod).
  - **Multi-frequency coverage:** each enemy radar on a distinct frequency = one band/channel that must
    be jammed; a jammer can block only a limited number of channels at once, so multiple radars on
    different frequencies overwhelm a single jammer. With **nine** enemy radars on nine frequencies, one
    pod covers only a couple; **nine** pods could each jam one frequency — multi-frequency coverage is
    explicitly modeled.
  - **Generation contest:** against a much older radar than the jammer, the radar's whole display can be
    blanked (early radars have "really lousy side lobes," so even side-on signal blinds the entire PPI) —
    even non-jamming targets between/behind the jammer become invisible. As radar generation approaches
    the jammer's, the radar can acquire targets *through* the jamming but still cannot get a precise/range
    shot on the jammer. A very modern radar (e.g. **APY-9**) defeats older jamming entirely and tracks
    normally.
  - **Directional "wall":** jamming only works in the direction it is projected; a unit on the opposite
    side of the radar from the jammer is seen perfectly. Effect is cumulative: two jammers side-by-side
    add together ("really multiply" when the target is on the far side).
  - **Position denial, not position gift:** "when you jam somebody you don't deny them a position, you
    just make yourself more obvious." The victim's confident track downgrades to "jammed" / large
    uncertainty (display fills with vertical lines/fuzz) and firing solutions are blocked while the target
    is imprecise (see the imprecise-target firing inhibit). OECM operates **continuously** regardless of
    whether anyone is attacking (contrast DECM, which only fires when attacked).
- **Outputs / effects:** Jammed radar loses range/precise-track info in the jammed sector; targets in/behind
  the jamming corridor become undetectable or only ambiguous; the jamming unit itself is typically not
  precisely targetable; the enemy receives a "jammed" indication and a bearing toward the noise source.
- **Edge cases / quirks:** Using offensive jamming **announces your presence** ("not like Star Wars").
  Some weapons home automatically on a jamming emitter (**home-on-jam**), e.g. **AIM-120 AMRAAM** and the
  noted "A-11"/SA-11 type — but home-on-jam yields an **imprecise** target (angle, not range). Enemies with
  low-light TV or FLIR can still detect a jammed target optically. **Geometry trap:** if the jammer flies
  HIGHER than the target it protects, the protected aircraft can climb "above the corridor of jamming" and
  get a free shot — a jammer above the jammed radar "is not going to do anything." Stealth aircraft should
  not themselves jam, but a jammer can fly behind a stealth aircraft to enhance effect. **DECM is always
  on; offensive ECM must be explicitly enabled.** OECM does NOT protect against an incoming missile's seeker
  (that is DECM's job).
- **Source:** s4t0ugMfDFY, W6MStyQhQIY, FI-ZwDubiMY
- **Confidence:** High

### Burn-through distance
> Merged from W6MStyQhQIY (burn-through), s4t0ugMfDFY (burn-through tactic), and FOQ6kcf9YzA (search-radar
> jam-strobe / homing).
- **Models:** The range at which a radar's signal overpowers jamming noise and re-acquires the jamming
  target.
- **Inputs / parameters:** Jammer strength/generation; victim radar power/quality (e.g. a continuous-wave
  illumination radar is strong); closing distance; time spent attempting to burn through; special
  burn-through instruments; radar elevation/tilt.
- **Behavior / rules:** While jammed, a radar cannot see the jamming aircraft beyond the burn-through
  range; as the jammer closes, at a certain distance the radar "cooks right on through" and detection
  resumes. **Stronger/higher-generation jamming shortens (pushes inward) the burn-through distance;
  stronger radars push it outward.** Demo values: **1970s OECM** burned through at **~20 nm**; **2020s
  OECM** (similar jamming strength) required closing to within **~1 nm**. For a powerful **CW fire-control
  radar** vs OECM, FC burn-through happened at **~10 nm**, after which the SAM could finally launch.
  **Time also matters** — given enough time a radar can burn through to lock the jamming source. On a
  search radar the jamming paints distinctive **vertical noise lines** along the jammer bearing; targets
  directly behind the strobe are invisible while targets to either side remain visible; turning the radar
  into the strobe blanks the target.
- **Outputs / effects:** Below burn-through range the contact becomes detectable/precise again and weapons
  can be released; above it the target stays hidden/imprecise. You must move jammers **farther away** to
  keep them hidden as a target/radar closes.
- **Edge cases / quirks:** Even when jammed, the operator can sometimes lock onto the **jamming itself**
  (the noise-source bearing) for guidance, but there is "no object to lock onto" for **range** — you get
  **angle, not range**, from jam-homing. With burn-through instruments the operator can lock the jam strobe
  bearing even without the transmitter energized (passive). A very low-altitude jammer can still be lost
  when it drops behind terrain. Electronic tilt can angle the beam down without physically bottoming the
  dish.
- **Source:** W6MStyQhQIY, s4t0ugMfDFY, FOQ6kcf9YzA
- **Confidence:** High

### Imprecise-target firing inhibit under jamming
- **Models:** A fire-control / SAM system cannot launch on a target whose position is too imprecise due
  to OECM.
- **Inputs / parameters:** Target track precision/uncertainty (degraded by OECM); whether the shooter's
  fire-control radar can burn through; range.
- **Behavior / rules:** When the search picture is jammed, the contact is known only roughly (large
  uncertainty). When the operator orders the attack, the shooter flips on its fire-control radar to get a
  cleaner look. If the FC radar still cannot resolve the target, the system reports **"automatic fire is
  not possible weapon is unable to engage an imprecise target"** and will NOT launch. As range closes and
  the powerful FC radar burns through the OECM, the picture becomes clean enough and the system can launch.
  "The further away you are and the stronger you're jamming the less likely things are going to be able to
  hit it."
- **Outputs / effects:** Launch blocked until the target-precision threshold is met; turning on the FC
  radar increases track confidence (and exposes the shooter); once burned through, weapons release is
  enabled.
- **Edge cases / quirks:** Ordering the attack itself improves the picture because the attacker activates
  its FC radar. Demo burn-through-to-launch for a CW SAM radar occurred around **10 nm**.
- **Source:** W6MStyQhQIY
- **Confidence:** High

---

## Defensive ECM, chaff & deception

### Defensive jamming / DECM — probability-of-kill (Pk) reduction dice roll
> Merged from s4t0ugMfDFY (DECM Pk roll), W6MStyQhQIY (anti-missile spoof), and tWsIW0WxANg (explicit dice
> numbers). All describe the same per-attempt d100 spoof roll; richest numbers and quirks retained.
- **Models:** Onboard deceptive ECM that, only when the platform is being attacked, attempts to spoof the
  incoming radar-guided weapon's seeker. In CMO this is abstracted to a per-attempt Pk-reduction dice roll.
- **Inputs / parameters:** The specific ECM set's stated "percent of kill reduction" / "final probability"
  (a fixed value per emitter, viewable in the BlueNiX/database); seeker type/era it is spoofing
  (radar-guided only; e.g. SARH); a **d100** roll; whether the DECM band matches the threat radar band;
  incoming-missile Pk. Stated values: **1–5%** for one B-52 set; **20%** for an F-16CM ALQ pod; **15%** in
  the SA-11 example; an early-80s DECM vs SARH read as "**6… 20 percent**"; an SA-2-era engagement needed
  "**30 percent or less**"; a modern **ALQ-211** had **35%** vs an older system's **30%**.
- **Behavior / rules:** DECM is **ALWAYS on** (no need to activate) but **only emits/acts when the platform
  is being attacked/locked** — so it does not give the platform away in advance, and it ceases the instant
  the threat radar shuts off (DECM "does not run itself if it does not have a lock signal on it"). On each
  incoming radar-guided missile, CMO rolls a d100 against the ECM's magic number **BEFORE** the missile
  resolves its hit: rolling **at or under** the reduction value (e.g. "15 or less," "30 percent or less")
  → the missile is **BLOCKED / spoofed** and never makes its attack roll. If the roll **fails**, the
  missile proceeds to its normal hit calculation (see terminal Pk). Higher tech raises the spoof
  probability (35% modern vs 30% old). DECM is **reusable forever** (not expendable, unlike chaff).
  Worked sequences:
  - **SA-11 vs Su-27 (s4t0ugMfDFY):** (1) target fired chaff — variable; (2) defensive jammer attempt
    needing **15%** — rolled, failed; (3) missile arrived with base **75%** hit, reduced for distance,
    modified by agility (decent pilot) and empty-weight-fraction (a "bad shot") → final **~53%**; hit roll
    **66** → miss.
  - **tWsIW0WxANg demo 1:** needed "**30 percent or less**," rolled **45** → jam failed → weapon's own
    hit, "because of the distance was a 20… basically 28 chance," rolled **8** → hit.
  - **tWsIW0WxANg ALQ-211 demo:** final probability **35%** (vs older 30%); rolled **64** → jam failed →
    weapon still **missed** due to range.
- **Outputs / effects:** On a successful roll the incoming missile is spoofed and removed before it
  attacks; on failure the normal hit probability is computed and rolled. No change to the platform's own
  detectability before it is attacked.
- **Edge cases / quirks:** Affects **radar-guided weapons only**, not infrared (IR shots give no radar
  warning, so the warning/defensive-jam step is bypassed). DECM is **band-limited** — "not every DECM can
  jam every frequency"; an ALQ-119 keyed to one band "couldn't protect you if it was a c-band radar," and
  an out-of-band threat gets no DECM effect. Reduction is "minor protection" and stacks with chaff and the
  distance/agility/weight modifiers. DECM does NOT deny range/position to a search radar — "you need OECM
  for that." Quoted intuition: an S-400 hitting at 50% at long range would drop to ~25% with a strong
  (halving) ECM set. Ships carry much larger jammers because they are much bigger targets. CMO simplifies
  the whole manual SAM-sim process to these dice rolls.
- **Source:** s4t0ugMfDFY, W6MStyQhQIY, tWsIW0WxANg
- **Confidence:** High

### Final weapon hit-probability calculation (terminal Pk)
- **Models:** How CMO computes whether a guided missile hits an air target after defensive measures,
  combining base accuracy with range, target agility, and a weight-based shot-quality term.
- **Inputs / parameters:** Base/weapon chance-to-hit (**75%** in the example); shot distance (longer =
  harder); target agility modifier (pilot/airframe); target empty-weight fraction (affects whether it is a
  "bad shot"); prior DECM Pk-reduction roll; chaff.
- **Behavior / rules:** Order per incoming missile: **chaff attempt → defensive-jammer Pk-reduction roll →**
  if not blocked, compute final hit % = base (**75%**) reduced for distance, then adjusted by the agility
  modifier and the empty-weight-fraction modifier; in the example the final figure was **53%**. A single
  random roll (result **66**) is compared to the final 53% to decide hit/miss (66 > 53 → miss).
- **Outputs / effects:** Hit or miss of the individual missile.
- **Edge cases / quirks:** Stated only via one worked example; the exact formula/weighting of each modifier
  is **not** given beyond the 75% → 53% and the 66 roll. Infrared missiles give no radar warning, so the
  warning/defensive-jam step is bypassed for IR shots.
- **Source:** s4t0ugMfDFY
- **Confidence:** Med

### Chaff — reactive bursts, chaff corridors, and the expendable last-ditch decoy
> Merged from s4t0ugMfDFY (chaff & chaff corridor) and W6MStyQhQIY (expendable last-ditch chaff roll).
- **Models:** Dispensed metallic reflectors that confuse older radars; either reactive bursts
  (self-protection) or a laid "chaff corridor" that hides aircraft flying within it. Modeled as an
  expendable per-salvo dice roll plus an altitude-banded concealment volume.
- **Inputs / parameters:** Aircraft chaff capability (not all aircraft can lay a corridor); chaff
  altitude band (each chaff cloud has a specific altitude, e.g. a corridor between **35,000–36,000 ft**);
  enemy radar generation / Doppler-filtering capability; the protected aircraft's altitude relative to the
  band; chaff seeker era/tech (e.g. early-1970s); a per-salvo probability of success; a d100 roll;
  remaining chaff stock.
- **Behavior / rules:** Reactive chaff is auto-fired by a target when a radar-guided missile is incoming —
  one attempt in the engagement sequence (tried **before** DECM). Each salvo gets one roll: demo "early
  1970s chaff… probability of success **35 percent**… they rolled the **19** → successful." Chaff succeeds
  "about **one third** of the time" in the demo. Chaff and DECM fire on the SAME incoming weapon
  independently; if any layer succeeds the missile is defeated ("even though our jamming didn't do the job
  the combination of the jamming and the chaff did," and conversely chaff can fail while DECM works). Chaff
  is **EXPENDABLE** (finite count) whereas DECM is permanent; when chaff (the "big stuff") runs out the SAM
  "switches over and reloads to fire again." A **chaff corridor**: the aircraft dumps chaff along its path,
  each chunk at a specific altitude; a friendly aircraft must fly **within** the chaff's altitude band
  (e.g. set altitude to **35,550 ft** to stay inside a 35,000–36,000 ft corridor) to gain concealment.
  Against older radars the aircraft inside becomes invisible / very hard to engage; modern radars with
  Doppler filtering are "basically immune," so the corridor does little.
- **Outputs / effects:** On a successful roll the incoming missile is decoyed/misses and chaff stock is
  decremented; on failure, pass to the next defense layer (DECM) then the weapon hit roll. An aircraft
  inside the chaff band is hidden from / hard to target by susceptible (older, non-Doppler) radars.
- **Edge cases / quirks:** You can fly through chaff without engine damage ("I don't know how that works").
  Must stay inside the chaff altitude band for the corridor benefit. Effectiveness is era/seeker-matched
  (early-70s chaff is "very effective against an SA-5"); great in the 1960s, weak against modern
  Doppler-filtering radars. Quirk: when the target is destroyed close-in, the engagement detail for its
  jamming isn't even shown ("we don't need to be watching something that got destroyed").
- **Source:** s4t0ugMfDFY, W6MStyQhQIY
- **Confidence:** High

### Cumulative survivability from stacked defensive systems (per-jammer independent rolls)
> Merged from W6MStyQhQIY and tWsIW0WxANg (same stacked-DECM, per-missile-independent-roll mechanic).
- **Models:** Combining OECM + multiple DECM + chaff to drive down the probability of being hit; each
  layer is an independent roll per incoming weapon.
- **Inputs / parameters:** Count and type of each defensive system; each system's per-attempt probability;
  number of incoming missiles; d100 rolls.
- **Behavior / rules:** Each defensive layer (chaff salvo, each DECM, OECM at range) is rolled
  **independently** against an incoming weapon; the more layers present, the lower the net probability of
  a hit ("statistically speaking the more DECM you have the less likely to actually be hit"). OECM forces
  the shooter to close before it can even launch (imprecise-target rule), and then DECM/chaff each get
  attempts on every launched missile. There is "nothing stopping" a platform from carrying many jammers —
  the operator stacked **~10** jamming systems plus chaff on one platform; each attached jammer "gets one
  free effort to try to block the actual incoming weapon" per missile. With **6** missiles fired at a
  heavily-jammed stationary balloon, initial missiles were defeated well but several eventually got through
  — it "took an awful lot of them." The combination is **multiplicative across independent rolls**, not a
  single roll.
- **Outputs / effects:** Reduced hit probability per missile; the shooter is forced to expend more
  weapons; the engagement may be defeated outright, but saturation (enough missiles) eventually leaks.
- **Edge cases / quirks:** **Band-matching still applies to each jammer** — stacking jammers that don't
  cover the threat band adds nothing. A stationary target makes the underlying hit roll easy, so leakers
  connect. CMO is explicitly a **simplified** abstraction of the manual SAM-sim process.
- **Source:** W6MStyQhQIY, tWsIW0WxANg
- **Confidence:** High

### Range Gate Pull-Off (RGPO) DECM technique
- **Models:** Defensive technique that projects a false copy of the radar return that walks away in range
  to drag the tracking gate off the real target, denying range.
- **Inputs / parameters:** RGPO jammer present; victim radar range-tracking/locking; whether the victim
  attempts a range lock.
- **Behavior / rules:** The system creates a copy of the radar's own return and slowly projects it away
  from the true target ("an extra little beam keeps coming off the top"), trying to capture and pull the
  range gate off the target. When the operator locks in range, the false target "snaps" and de-locks the
  radar, forcing a re-snap to the real target — so reliable range cannot be measured. In CMO this is
  abstracted into a DECM spoof roll; in the demo the DECM roll FAILED so the missile still hit. With range
  denied, the shooter must fall back to a **three-point / command-guidance** attack (aim missile at target
  center, no range track).
- **Outputs / effects:** Denies reliable range / range-gate lock; forces three-point guidance; in CMO
  resolves as a DECM spoof roll.
- **Edge cases / quirks:** Especially dangerous against moving targets (a co-located moving target would be
  "a very very tricky shot"). A **proximity fuse** mitigates the lack of precise range.
- **Source:** tWsIW0WxANg
- **Confidence:** High

### Multiple-false-target (range deception) DECM
- **Models:** DECM that splits the contact into several valid-looking targets so the operator must guess
  which is real.
- **Inputs / parameters:** False-target jammer present; number of false targets generated; the operator's
  guess.
- **Behavior / rules:** The radar shows multiple targets (demo: **5** individual targets, one real). Each
  is a "valid target" the operator could engage; switching range modes, cycling the transmitter, etc. do
  **NOT** reveal which is real ("changing range modes don't work… shutting off transmitter didn't work").
  The operator must predict the correct one; guessing wrong causes the missile to overshoot. In CMO this
  abstracts to denied/unreliable tracking; a wrong guess = miss.
- **Outputs / effects:** Operator forced to choose among N candidate tracks; a correct guess can hit, a
  wrong guess overshoots; range/identity reliability denied.
- **Edge cases / quirks:** If the chosen target ALSO has another form of DECM, the engagement can still
  fail. "Space invaders method" is the narrator's nickname for many-false-targets.
- **Source:** tWsIW0WxANg
- **Confidence:** High

### Angle deception jamming
- **Models:** DECM that distorts the electronic return so the radar cannot find the angular center of the
  target.
- **Inputs / parameters:** Angle-deception jammer present; victim radar angle-tracking (azimuth/elevation
  lock).
- **Behavior / rules:** The target appears to "breathe" — its sides tip away so there is no stable
  electronic center. The radar cannot reliably resolve the angular center and "goes whoa," failing to hold
  an angle lock. The operator must MANUALLY point radar and missile together to engage — very hard,
  especially against a moving/maneuvering or night target. In CMO this is abstracted into a DECM roll. A
  **proximity fuse** is what makes such engagements survivable for the shooter (the fuse triggers near the
  target despite poor angle), otherwise reliably hitting is essentially impossible.
- **Outputs / effects:** Denies reliable angle lock; forces manual / three-point guidance; abstracted as a
  DECM spoof roll in CMO.
- **Edge cases / quirks:** Against a Mach-2 maneuvering target, manual angle engagement is described as
  effectively impossible. Proximity fuze required for any reliable kill.
- **Source:** tWsIW0WxANg
- **Confidence:** High

### DECM only emits while locked (no passive signature)
- **Models:** Defensive ECM is reactive: it produces no signal unless a lock/attack is present — the key
  behavioral difference from always-on OECM.
- **Inputs / parameters:** Whether the platform is currently being locked/attacked; victim radar
  transmitter state.
- **Behavior / rules:** DECM "does not run itself if it does not have a lock signal on it." If the threat
  radar shuts off, the DECM-protected target stops being jammed and "will disappear" (DECM stops). On
  search radars you therefore get **NO** jamming lines from DECM (contrast OECM noise) — targets stay
  constant until you lock them. So OECM = always-on noise that gives you away; DECM = fires only when
  attacked and never gives you away in advance.
- **Outputs / effects:** No DECM emission/effect until a lock exists; DECM ceases the instant the
  lock/transmitter drops.
- **Edge cases / quirks:** Using OECM and DECM together is "awful" for the victim and the worst case to
  engage. CMO simplifies all of this to dice rolls relative to the manual SAM-sim experience.
- **Source:** tWsIW0WxANg
- **Confidence:** High

---

## SEAD / DEAD & SAM engagement

### SAM seeker types and resulting detectability/defenses
- **Models:** SAMs fall into radar-guided (command, beam-riding, or illumination/home-on-strongest-source)
  vs passive IR/TV seekers, which determines what warning and counters apply.
- **Inputs / parameters:** Seeker type (radar: command guidance / beam-riding / semi-active illumination;
  passive: IR or TV); missile range class; presence of an illumination radar.
- **Behavior / rules:** Radar seekers require a radar to look at you: either guide the weapon directly
  (command guidance), point a beam the missile rides, or illuminate you so the missile homes on the
  strongest radar source (you, when illuminated — e.g. **SA-5/S-200**). Passive **IR/TV** missiles give
  **NO radar warning** when fired and are typically shorter-ranged; the best defense is to stay outside
  their engagement envelope. Defensive ECM/jam only affects radar-guided weapons, not IR.
- **Outputs / effects:** Determines whether the target receives a launch/lock warning and which
  countermeasures (jamming, chaff, beaming) are effective.
- **Edge cases / quirks:** IR/TV shots bypass radar-warning and the defensive-jam Pk roll.
  Illumination/home-on-source seekers home on the strongest radar reflection.
- **Source:** -Ivt6KX_onQ
- **Confidence:** High

### SAM engagement envelope — altitude floor/ceiling, min/max range, and exploiting them
- **Models:** Each SAM has hard min/max range and min/max engagement altitude (with its own altitude floor
  distinct from the radar horizon); operating outside any limit makes you immune.
- **Inputs / parameters:** SAM max range (e.g. **SA-5 ≈ 155 nm**); min range (e.g. SA-5 cannot launch
  inside **~9 nm**); missile altitude floor (SA-5 can't hit below **~650 ft AGL**; SA-2 can't shoot above
  **~1,000 ft**; SA-3 max engagement **~46,000 ft**); site ground elevation; target altitude; terrain.
- **Behavior / rules:** A SAM cannot engage targets below its altitude floor, above its ceiling, beyond max
  range, or inside its min range. Exploits: fly below the missile's altitude floor (SA-5 immune below ~650
  ft AGL; set a SEAD patrol station altitude like **950 ft** to nullify an SA-2 capped at 1,000 ft), or
  close inside the min range (SA-5 cannot launch if you are within ~9 nm — close to ~9 nm to defeat it).
  For SA-3 (ceiling ~46,000 ft) you cannot out-climb it, so you must operate inside its zone by other
  means. **Always add the site's ground elevation** to altitude calcs. Combine with radar-horizon masking
  to ingress unseen. Recon to learn type → look up the exact envelope in the DB (click the missile for its
  limitations).
- **Outputs / effects:** Determines whether a given aircraft at a given altitude/range can be engaged at
  all; basis for altitude-selection and stand-in tactics.
- **Edge cases / quirks:** Missiles often have their **own** launch-altitude limits separate from the radar
  horizon. Anti-radiation missiles (e.g. AS-9/Kh-28) have their own launch-altitude floor too, constraining
  how low you can go and still shoot. On RTB, aircraft ignore your commanded low altitude and overfly SAMs.
- **Source:** -Ivt6KX_onQ
- **Confidence:** High

### Weapon employment terrain (altitude-AGL) release limitation
- **Models:** Some weapons impose a minimum terrain-relative altitude for release; if local terrain
  elevation is too high relative to the launch altitude the shot is blocked until you climb.
- **Inputs / parameters:** Weapon's terrain/altitude floor (e.g. needs **10,000 ft**); local
  terrain/ground elevation under the aircraft (e.g. ~23.88, i.e. **~2,388 ft**); aircraft altitude AGL.
- **Behavior / rules:** CMO flags a "terrain limitation" when a weapon release would violate the weapon's
  altitude-relative-to-ground requirement. Example: a weapon requires **10,000 ft** AGL; with a local
  altitude readout of ~23.88 the aircraft must climb higher than initially set before release is allowed.
  Resolution is simply to climb so the AGL clearance requirement is met, then deliver.
- **Outputs / effects:** Whether the attack is permitted (target shown out of range / terrain-limited until
  altitude corrected).
- **Edge cases / quirks:** Distinct from the LOS horizon — this is a **release constraint of the weapon
  itself**. Flying too low near a SAM site also risks shoulder-launched (MANPADS-type) surprises, so the
  release altitude trades terrain-limit vs threat exposure.
- **Source:** W1ag1FPJMGk
- **Confidence:** Med

### SAM site structure: search radar vs fire-control radar, and emission discipline
- **Models:** A SAM battery separates a search radar (finds targets) from a fire-control radar (guides the
  missile); good emission discipline keeps the FC radar off until launch so it can't be pre-detected.
- **Inputs / parameters:** Search radar emissions; fire-control radar emissions; battalion radars;
  mission-editor doctrine settings (whether FC radar emits early / engages incoming missiles);
  target-indicator radars (small, truck-mounted, often 2D).
- **Behavior / rules:** ESM can usually fix the **SEARCH** radars (they emit to find targets), but a
  well-run site / competent mission designer keeps the **FIRE-CONTROL** radar dark until a missile has
  essentially been fired, so you cannot pre-target it. Killing all search radars can force the enemy to
  switch on battalion radars (making them more obvious) — but only if the scenario/AI is set to do so.
  Triangulating two spaced ESM platforms on an omnidirectionally-emitting search radar pinpoints it; a
  single platform gives only a bearing. Target-indicator radars are small/portable and often 2D (no
  altitude).
- **Outputs / effects:** Distinguishes which emitters you can detect/target when; drives the
  recon-then-bait sequence for SEAD.
- **Edge cases / quirks:** Emission discipline is **mission-editor-configurable**: editors can disable the
  behavior where a SAM lights its FC radar to engage incoming ARMs. Some scenarios DO let battalion/search
  radars activate; many don't.
- **Source:** -Ivt6KX_onQ
- **Confidence:** High

### Anti-radiation missile (ARM/HARM) — requires an emitting radar lock
> Merged from W1ag1FPJMGk (HARM needs emission) and -Ivt6KX_onQ (ARM baiting & missile-defense-value
> salvo). Same "ARM needs a live emitter" mechanic; baiting/salvo detail folded in.
- **Models:** Anti-radiation weapons need a positive lock on an actively **emitting** radar; if the radar
  shuts down the missile loses its target — which drives SEAD/DEAD baiting tactics. Salvo size against a
  detected radar is governed by a unit's "missile defense value."
- **Inputs / parameters:** Whether the target radar is currently emitting; a positive target lock; ARM
  type (e.g. **AGM-88C HARM**); the SAM's emission-control behavior; unit "missile defense value" (number
  of missiles salvoed per detected radar — e.g. **7**); ARM's ability to remember a target's last position
  after the radar shuts off; number of strikers grouped together; enemy FC-radar reaction-to-incoming-ARM
  behavior (editor-configurable).
- **Behavior / rules:** To get a successful ARM launch/hit you need a positive lock, which requires the
  enemy radar to be EMITTING. Modern SAM operators **shut down their radar** when they detect an ARM launch,
  denying the missile its source (it can't strike a radar that stops radiating). When a radar **is**
  detected, a launcher fires a salvo equal to its **missile defense value** (a value of 7 launches 7
  missiles every time it detects the radar). A SAM that sees an incoming ARM may **activate its
  fire-control radar to try to shoot the ARM down** — and by emitting it gives the ARM a target to home on.
  ARMs that "remember" the last known emitter position can still strike after the radar shuts off, and
  re-home on fresh emission. You must fire MANY ARMs **together** (group strikers in large sections, e.g.
  sections of 6) or the attack is too piecemeal to saturate. Demo flow: Su-22 fires ARMs at ATC/search
  radars → SA-3 activates FC radar to engage the incoming missiles → that draws the larger ARM response →
  SA-3 hammered; a nearby SA-2 also lit up and exposed itself. You can **pre-arm** the weapon so it fires
  the instant the target radar goes active. After the SEAD kill shot, a separate **DEAD** platform (kept
  **outside** the SAM's range, e.g. with CBU-103 cluster bombs) walks in to finish the site. Re-baiting:
  pulling the bait aircraft back around and popping up can re-trick the targeting radar into re-locking,
  enabling additional shots.
- **Outputs / effects:** Whether the ARM achieves/holds a lock and hits; forces FC radars to emit and be
  killed; consumes ARMs; degrades/destroys SAM radars so follow-on PGM/CBU strikes finish the site.
- **Edge cases / quirks:** Careful mission editors **disable** the "FC radar engages incoming missiles"
  behavior, defeating the bait. Need enough simultaneous ARMs (concentration) or it fails. ARMs without
  target-memory lose the target when the radar shuts off. If you fire the HARM the moment you first enter
  range you may be forced to run and unable to fire a needed second HARM — deliberately delay/loiter
  (loiter speed, zigzag) to stay flexible. Keep the SEAD bait **IN** range and the DEAD finisher **OUT** of
  range simultaneously. F-35's sensor makes detecting the engagement easier.
- **Source:** W1ag1FPJMGk, -Ivt6KX_onQ
- **Confidence:** High

### SAM Dynamic Launch Zone (DLZ) reacts to closure speed
- **Models:** A SAM computes a dynamic launch zone from the target's geometry and closure rate; a
  fast-closing target lets the SAM fire at very long range, so baiting works by presenting high closure
  then breaking before the shot lands.
- **Inputs / parameters:** Target range; target closure speed toward the SAM (e.g. closing at **~700
  knots**); target altitude; the SAM's DLZ calculation.
- **Behavior / rules:** The SAM continuously runs DLZ calculations against the inbound aircraft. High
  closure speed (a target charging at **~700 kt**) **expands** the effective firing range — it can launch a
  very-long-range shot and still expect to hit. SEAD bait exploits the timing: charge the SAM at high speed
  and altitude (pop up to **~12,000 ft**, afterburner) to invite a long-range shot, then dive into terrain
  cover right as the SAM commits. Being inside the SAM's range does **NOT** guarantee it fires — in the run
  the bait sat fully within range and the SAM held fire until presented with a favorable (easy, high-closure
  or radar-locked) solution. Flying slightly **toward** the launcher makes it more likely to launch (it
  works out the DLZ).
- **Outputs / effects:** Whether/when the SAM launches and the maximum range of that launch; drives
  attacker speed/altitude timing.
- **Edge cases / quirks:** F-35's sophisticated sensor makes it much easier to know WHEN you're being fired
  upon (better launch-warning), improving bait timing. The strike aircraft must be kept just **outside** the
  SAM's range while the bait operates **inside** it.
- **Source:** W1ag1FPJMGk
- **Confidence:** Med

### SAM "cheese" tactics — sawtooth baiting and porpoising under the radar horizon
- **Models:** Deliberately exhausting a SAM battery's finite missile stock by repeatedly baiting launches
  and then defeating each missile via geometry, without firing back.
- **Inputs / parameters:** SAM engagement-envelope edge (turn-on/off boundary); the battery's finite
  missile count (typical battery **~36 missiles**); missile-launch warning timing; target altitude and dive
  timing; terrain/radar horizon.
- **Behavior / rules:** **Sawtooth method:** fly a single aircraft to the edge of the SAM's envelope; when
  it enters, the SAM launches; immediately order the aircraft back out so the missile is wasted; repeat.
  Demo: **~10 of ~36** missiles burned in **~25 minutes** with one aircraft (could halve the time with two).
  **Porpoising / radar-horizon method:** approach low, climb to bait a launch (**~25,000 ft**), then on the
  launch warning dive below the radar horizon (e.g. **25,000 → ~12,000 ft**, count "one-Mississippi… three-
  Mississippi" then dive) so the missiles fly into the ground; demo wasted **~2** missiles per cycle. A
  typical battery has **36** missiles, so repeat many times to deplete.
- **Outputs / effects:** Depletes the SAM battery's missile inventory without losing aircraft, eventually
  rendering it safe to overfly.
- **Edge cases / quirks:** Timing the dive is delicate (mistimed dives fail). Flying slightly toward the
  launcher makes it more likely to launch (DLZ). Some fire-control radars give little launch warning,
  complicating the dive timing.
- **Source:** -Ivt6KX_onQ
- **Confidence:** High

### Jamming-assisted SEAD against long-range SAMs (stand-in jamming geometry)
- **Models:** Using offensive ECM to suppress a long-range SAM's fire-control radar so strikers can close
  to weapons range, with strict altitude/line-of-sight geometry between jammer and strikers.
- **Inputs / parameters:** Jammer LOS to the SAM's FC radar; jammer altitude vs strikers' altitude; slant
  angle (farther out = lower slant angle = jammer better masks the strikers from the SAM's viewpoint);
  required stand-in distance (must get within **~9 nm** of an SA-5 where jamming alone doesn't suffice);
  ARM/CBU launch-altitude floors.
- **Behavior / rules:** Jammers preferentially jam **fire-control** radars first, then other radars. The
  SAM cannot get a precise track while its FC radar is jammed (lock flickers in and out as jamming catches
  up). **CRITICAL geometry:** from the SAM's viewpoint the jammer must block the LOS to the strikers; if the
  jammer is at **25,000 ft** but strikers climb to **36,000 ft**, the strikers rise ABOVE the jamming and
  the SAM gets a free shot — repeatedly the failure mode (AI strikers keep climbing back out of the jamming
  pattern, a "known limitation"). Fighters/strikers also tend to out-fly their slower escort jammers,
  breaking LOS — set manual speeds (e.g. **400 kt**) to keep them together. Doing this far out gives a
  shallower slant angle so the jammer masks the strikers better. To finish an SA-5 you must close to **~9
  nm** (inside its min range) AND be at a weapon-deployable altitude (e.g. **~1,000 ft AGL** for RBK-500,
  launch altitude 200 ft).
- **Outputs / effects:** Suppresses long-range-SAM FC tracking long enough for strikers to reach min-range /
  weapon-release and destroy the site.
- **Edge cases / quirks:** Stated to be very hard to do reliably with an automated **mission** ("if you try
  this tactic with a mission you're going to be disappointed") — needs manual altitude/speed control. AI
  repeatedly climbs above the jamming corridor. Escorts die faster, so strikers leave jammer LOS. On RTB
  they overfly SAMs ignoring altitude.
- **Source:** -Ivt6KX_onQ
- **Confidence:** High

### SEAD mission types and area-suppression doctrine
- **Models:** CMO mission framework for SEAD: support/strike missions, and a SEAD-mode area patrol over a
  defined kill zone that reacts to detected radars.
- **Inputs / parameters:** Mission area / kill-zone polygon (kept small); mission type (strike/land-strike;
  patrol set to "SEAD"); strikers grouped into sections (2–6 for max weapon deployment); simultaneous launch
  (whole group launches together); weapon load (ARMs vs CBUs/PGMs); station altitude over the combat zone
  (set to nullify low-ceiling SAMs).
- **Behavior / rules:** Define a small kill-zone around the target, create a patrol mission set to **SEAD**;
  aircraft on station react to detected radars by firing ARMs. Works well even against unknown-location SAMs
  because the SEAD patrol prosecutes whatever radars light up. **Launch the entire ARM group
  simultaneously** (otherwise insufficient missile concentration). Group attackers in sections of **2–6**
  for maximum simultaneous delivery (a 1-missile-per-aircraft type like Su-22 needs big groups; an F-18
  carrying 4 needs fewer). Set the station/overflight altitude deliberately to sit **under** a low-ceiling
  SAM (e.g. **950 ft AGL** to nullify an SA-2 capped at 1,000 ft) while accepting you're inside a
  high-ceiling SAM's zone. After radars are suppressed, follow-on low-altitude CBU/PGM aircraft finish the
  physical site.
- **Outputs / effects:** A repeatable SEAD pattern that detects, suppresses, then destroys SAM sites;
  consumes ARMs then PGMs/CBUs.
- **Edge cases / quirks:** Manual altitude control is hard to enforce via missions (AI climbs out / mis-sets
  altitude). A recon asset with a good camera (e.g. MiG-25 "Fox Pat") accompanying the package helps ID SAM
  launches/types. SAM sites are "not one thing" — many vehicles around them, so CBUs/iron bombs are valued
  for area kill.
- **Source:** -Ivt6KX_onQ
- **Confidence:** High

### Weapon-class ranking for SEAD (effectiveness/standoff order)
- **Models:** A best-to-worst preference ordering of weapons for attacking SAM sites, by standoff and
  guidance type.
- **Inputs / parameters:** Weapon type and standoff range; whether it self-guides (fire-and-forget) vs needs
  guidance; area vs point effect.
- **Behavior / rules:** Stated best→worst: **EMP** (if available) beats everything; then **long-range
  anti-radiation missiles** (e.g. HARM — need a LOT of them); then **cruise missiles / standoff weapons**
  (e.g. B-52-launched, AGM, JSOW, JDAM — great because fire-and-forget, no guidance needed); then
  **Maverick-class** (must get fairly close); then **CBUs** (great because a SAM site is many targets, not
  one); then **iron bombs**, then **rockets and guns** (must get very close).
- **Outputs / effects:** Guides weapon selection for a SEAD package.
- **Edge cases / quirks:** JDAM is a very small target itself (hard for the enemy to intercept). ARMs require
  concentration/quantity to be effective.
- **Source:** -Ivt6KX_onQ
- **Confidence:** Med

---

## SAM internals & missile flight model

### SAM fire-control radar: signal demodulation → engine count / propulsion type (NCTR-style)
- **Models:** Demodulating the radar return (jet-engine modulation) reveals propulsion characteristics —
  turbine vs propeller, and number of engines — for non-cooperative recognition while locked.
- **Inputs / parameters:** Demodulated return spectrum of a manually-acquired contact (strong single
  spectral line vs distributed); number of distinct engine lines in the return.
- **Behavior / rules:** After manually acquiring a contact on a SAM fire-control radar, the operator
  inspects the demodulated signal: "one very very strong signal — it's not all distributed like something
  with a propeller" → indicates a **TURBINE**; that appearance indicates a **SINGLE** engine. A true bomber
  would show **MULTIPLE** distinct engine lines. The demo target showed a non-bomber single signal; a
  separate target that looked like a bomber by return turned out to be a **drone** (so spectral lines, not
  just magnitude, distinguish a real multi-engine bomber).
- **Outputs / effects:** Inferred propulsion type (turbine vs prop) and engine count, contributing to
  platform classification (fighter vs bomber) without visual ID.
- **Edge cases / quirks:** Magnitude alone can mislead (a high-return drone mimicked a bomber); the
  distinguishing feature for a true bomber is **multiple visible engine lines**. Requires manual
  acquisition/lock on the SAM radar.
- **Source:** 0R6-5oQR-l0
- **Confidence:** Med

### SAM radar return strength vs range → target size classification (fighter vs bomber chart)
- **Models:** Cross-referencing measured electronic return magnitude against estimated range classifies
  target size, because a larger target both returns more energy and is detectable farther.
- **Inputs / parameters:** Measured electronic return value of the locked contact (units stated as
  "microamps or milliamps… about **30 and a half**"); estimated range to contact (read off the radar scale,
  **~50–60 km** in the example); a size lookup/chart mapping return-vs-range to class.
- **Behavior / rules:** The operator reads the return value (~"30 and a half" micro/milliamps) and estimates
  range (~60 km, refined to **~50–60 km** on the 100-scale). Plotting return ≈ 30 at range ≈ 60 on the chart
  yields "this particular target must probably be a **fighter**." Rule: "if it was a bomber we'd be able to
  detect it at a longer distance AND expect its total return to be significantly higher" (plus multiple
  engine signals). A second contact showed a "massive" return at its range → classified as a
  **bomber-sized** target. The relative **blip size** on the acquisition scope is itself a clue.
- **Outputs / effects:** Target size class (fighter vs bomber) from the return-magnitude-vs-range
  relationship; corroborated by blip size on the lock scope.
- **Edge cases / quirks:** Units uncertain ("microamps or milliamps, I think microamps"); chart thresholds
  not numerically given beyond the worked example. A high-return non-bomber (drone) can read bomber-sized by
  magnitude — engine-line count disambiguates. To actually engage, the target must be locked into a
  Doppler-style "gate" that contains it (described as overkill).
- **Source:** 0R6-5oQR-l0
- **Confidence:** Med

### SAM missile flight model: boosted launch, sustainer burnout, then unpowered ballistic coast
- **Models:** Two-stage SAM (e.g. SA-2 analog): a solid booster accelerates to supersonic and drops off, a
  sustainer (liquid) burns then runs out of fuel; afterwards the missile coasts on momentum and can still
  reach/kill the target.
- **Inputs / parameters:** Booster impulse; sustainer fuel quantity/burn time; launch altitude (air
  density); pitch/climb angle; target range and altitude; remaining kinetic energy after burnout.
- **Behavior / rules:** Observed sequence in CMO: the missile boosts to **~Mach 2**, climbs aggressively,
  "slowly burning through its fuel," then accelerates less and then SLOWS DOWN "because the engine has
  stopped firing — it literally ran out of fuel and is relying just on momentum alone" to coast to the
  target. At **25,000 ft** (thin air) the missile only pitched up **~10–20 degrees**. Even after burnout and
  slowing to **~Mach 1.5** it still hit the drone ("even though the missile ran out of gas it still had
  plenty of capability to get to the target"). The companion SimpleRockets SA-2 analog: the booster takes it
  supersonic and drops off (~burnout **~20 seconds** after takeoff), then it flies on conventionally; at
  burnout it was **~Mach 3.5** with energy and maneuvering capability remaining at **30+ km**.
- **Outputs / effects:** Missile speed/energy profile over flight (accelerate → burnout → decelerating
  coast); whether it retains enough energy to intercept; intercept success even post-burnout.
- **Edge cases / quirks:** Launch altitude / air density limits achievable pitch (only 10–20° at 25,000
  ft). Of two missiles fired, one hit and "the other one sails on by" (miss). Post-burnout the weapon is
  still lethal — **energy management, not fuel, governs reach**.
- **Source:** blDlSkDLKg0
- **Confidence:** High

### Missile flight-profile / loft range trade (vertical vs horizontal energy management)
- **Models:** Shaping a missile's trajectory (lofting steeper while powered to gain altitude) trades
  horizontal distance for altitude/energy, dramatically extending coast range via a high ballistic arc.
- **Inputs / parameters:** Powered-phase climb/pitch angle (e.g. ~10–20° shallow vs **45°** loft); altitude
  attained at burnout; remaining Mach/energy; atmospheric density at altitude (less drag higher up).
- **Behavior / rules:** Demonstrated in the SimpleRockets analog (explicitly to explain CMO's missile
  model): firing at a SHALLOW profile reached **~Mach 3.5** and **30–45 km** but stayed low. Re-firing at a
  **45-degree LOFT** "intentionally trying to get the missile while still under power to a higher
  altitude… trading horizontal distance for vertical distance." Lofted, after burnout the missile was **~25
  km** up and could "complete its arc and land down on the target," reaching an apogee **~39 km** and, by
  managing the descent, traveling **100+ km then 135 km then 170 km — we could have gone a lot farther."
  Stated takeaway: "just because we ran out of fuel doesn't make us any less of a weapon… by tweaking our
  flight profile we really get our range," and a lofted re-entering missile is faster / "more terrifying" on
  terminal dive.
- **Outputs / effects:** Total achievable range and terminal speed change drastically with the powered-phase
  climb angle; lofting greatly extends both.
- **Edge cases / quirks:** Thin air at high altitude means little aerodynamic energy can be rebuilt during
  the coast/dive ("really struggling to build up any sort of speed") but speed is retained. SimpleRockets
  uses a **different atmosphere** than Earth (though to Earth scale) — figures are **illustrative**, not
  exact CMO numbers; this demonstrates the **principle** behind CMO's energy-state missile model rather than
  CMO-internal constants.
- **Source:** blDlSkDLKg0
- **Confidence:** Med

---

## IFF & target identification

### Non-cooperative target recognition by kinematics (altitude + speed lookup vs platform DB)
- **Models:** Identifying an unknown contact by comparing its measured altitude and speed against the known
  cruise-speed/ceiling envelopes of candidate platforms (no IFF/transponder cue available).
- **Inputs / parameters:** Measured contact altitude; measured contact speed (knots, and implied Mach at
  altitude); the scenario platform database's cruise speed at altitude and service ceiling per platform;
  formation behavior.
- **Behavior / rules:** The operator runs an OODA loop: collect altitude+speed, then open **Browse Scenario
  Platforms** and check each candidate's cruise speed AT THAT ALTITUDE and ceiling. Examples: a contact at
  **45,000 ft / 1,400 kt** is flagged hostile (no airliner does that — "Concorde retired"). A contact at
  **25,000 ft / 480 kt** matches a **Fresco (MiG-17)** (cruise at that altitude is 480 kt). A helicopter at
  **2,000 ft / 145 kt** matches a **Hokum (Ka-50)** (cruise 145 kt "on the nose") whereas a Bell 206 cruises
  115 kt. Civilian airliners typically cap **~320 kt** at altitude, so **480–490 kt** "is unlikely for a
  747" → flag unfriendly. Platforms whose ceiling is below the contact's altitude (Cessna 172, C-47) are
  **excluded** ("can't get that high").
- **Outputs / effects:** Contact classification (hostile / neutral / still-unknown) and tentative platform
  type, derived purely from kinematics matched against the platform DB.
- **Edge cases / quirks:** Ambiguity is explicit — multiple platforms can share a cruise speed at an
  altitude (480 kt matched several types) → may remain unidentifiable. Speed-changing/accelerating contacts
  ("he's changing speed, that's why we check") frustrate matching. A clever adversary flying a fighter at
  airliner speed defeats kinematic ID — then "look for formations, look for emissions, or send an
  intercept." Tight formation + a trailing accelerating member is itself a hostile cue ("unless these are
  airliners flying in formation"). A demilitarized fighter (MiG-15) flying an odd altitude was deliberately
  a trick (neutral despite military performance).
- **Source:** 0R6-5oQR-l0
- **Confidence:** High

### Detection range as a proxy for target radar cross section (RCS)
- **Models:** Initial detection range of a contact reveals its RCS — large/high-RCS targets are detected
  far out, small/low-RCS targets must close before being detected.
- **Inputs / parameters:** Range at first detection; own radar capability; (inferred) target RCS.
- **Behavior / rules:** Rule of thumb: "whoever this guy is, his radar cross section has got to be in such a
  way that at certain distances we detect him — if he was very small he'd have to get closer; if he's very
  far away we'd have to not be able to see him unless he was huge." A contact first detected **~175 nm** is
  reasoned to be physically large; one only seen close-in would be small. A new contact picked up "at an
  extremely long distance… suggests something very large" → inferred civilian airliner. First-detect range
  is used as evidence of physical/RCS size for classification.
- **Outputs / effects:** An RCS/size inference (large vs small platform) used as an additional
  identification clue.
- **Edge cases / quirks:** Qualitative inference only — **no numeric RCS-to-range formula** stated.
  Confounded by own radar power and aspect (see aspect rule). Used jointly with kinematics, not alone.
- **Source:** 0R6-5oQR-l0
- **Confidence:** Med

### Emissions / EMCON and ESM-based identification (emitter type classification)
- **Models:** Detecting and classifying a contact's electronic emissions (radar/jammer type) via ESM, and
  using EMCON discipline (who is emitting vs silent) as an identification and threat cue.
- **Inputs / parameters:** Contact emission state (emitting vs silent); emitter type (fire-control radar,
  generic Doppler radar, terrain-following radar/TFR, SLAR, jamming pod); whether own/enemy emissions are
  enabled in the scenario; an ESM sensor fitted to the detecting platform; the ambient EMCON pattern of
  surrounding contacts.
- **Behavior / rules:** Adding a generic ESM sensor lets the operator read emitters. Classifications drive
  ID: a contact emitting a **FIRE-CONTROL** radar is flagged hostile ("you have a fire control radar —
  you're hostile"); a **generic DOPPLER** radar is "usually pretty safe" (friendly/benign); a **TFR**
  (terrain-following radar) emission can be matched to a specific airframe ("it's a re-[name] TFR, we can
  identify that exact emission"). EMCON reasoning: civilian aircraft "typically almost always fly with their
  radars on," so a contact that is **silent** while everyone around it emits, AND is at military speed, "is
  usually a pretty solid sign you're dealing with somebody on the hostile side." Jamming itself is a cue: a
  contact that drops off radar while jamming is active is marked suspicious; only one platform in the group
  (Su-24) carries a jamming pod, so the jammer location implies its identity. The contact report lists
  detected emissions, usable to ID the platform indirectly; a button on the contact shows exactly which
  emission was detected and why.
- **Outputs / effects:** Contact threat classification (hostile from fire-control radar; safer from generic
  Doppler); platform identification via unique emitter signatures (TFR/SLAR/jammer); suspicion flags from
  EMCON anomalies; a populated contact-report "detected emissions" field.
- **Edge cases / quirks:** Requires enemy emissions enabled in the scenario AND an ESM sensor fitted,
  otherwise no emitter data. A deliberately-silent high/fast contact is itself a red flag (intentional
  EMCON). Slow-rotating search radars delay refreshes. A neutral can still be flagged from anomalous
  behavior even without emissions.
- **Source:** 0R6-5oQR-l0
- **Confidence:** High

### Rotating (mechanically-scanned) search radar sweep period → intermittent contact refresh
- **Models:** A mechanically-rotating radar antenna only updates a contact when the beam sweeps across it,
  so track data refreshes once per rotation, not continuously.
- **Inputs / parameters:** Antenna rotation rate / sweep period of the radar (e.g. TPS-43 slow rotation;
  **~5 seconds** per sweep cited elsewhere).
- **Behavior / rules:** "When the TPS-43 rotates it rotates at about [a slow] speed, which means it takes
  time for the radar to come all the way around again and reacquire everybody" — so positional/identification
  updates arrive only **once per full rotation**, creating noticeable latency between refreshes on each
  contact. A separate video states a comparable air-search radar "slowly turns around taking **five
  seconds** to sweep the sky," giving a 5-second update cadence.
- **Outputs / effects:** Per-contact track/position updates arrive at the antenna's rotation period; faster
  rotation = more frequent refresh.
- **Edge cases / quirks:** Slow rotation lengthens the OODA loop and can let fast/maneuvering contacts change
  state between looks. The ~5 s figure comes from a different transcript (Ccyl-4E_dl4); the TPS-43 rate is
  described only qualitatively. See also the scan-type/update-rate entry under Radar fundamentals.
- **Source:** 0R6-5oQR-l0
- **Confidence:** Med

---

## Realism toggles affecting sensing & engagement

### Gun/weapon engagement gating ("gun control" realism: director, LOS, emission strength) and EW effect on gunfire
- **Models:** With the gun-control realism option, a unit cannot fire just because a target is in range — it
  needs a weapon director, line-of-sight, and a sufficiently strong emission/track; EW therefore degrades
  gunfire.
- **Inputs / parameters:** Presence/availability of a proper weapon director; line-of-sight to target;
  emission/track strength (radar quality); target in range; jamming state.
- **Behavior / rules:** Under the "gun control" realism feature, an engagement requires: a proper weapons
  director assigned, the director pointed at the target, confirmed LOS, and a strong-enough emission/track to
  safely engage — being merely "in range" is insufficient. Because the engagement depends on emission/track
  quality, **electronic warfare** (e.g. jamming a searchlight's control radar) directly **degrades** the
  ability to put effective gunfire on a target.
- **Outputs / effects:** Whether a gun engagement is permitted and how effective it is; jamming can deny or
  degrade it.
- **Edge cases / quirks:** This is a **scenario-level realism toggle** (may be off). Explicitly stated that
  EW affects gunfire when this is on.
- **Source:** RQgODnnYYsI
- **Confidence:** Med

### Submarine isolation / radio-communication realism (sensor-sharing & datalink gating)
- **Models:** Submerged submarines cannot use radio, so under the relevant realism setting they are isolated
  — they build/track their own contacts but cannot share targeting with other friendly units unless brought
  shallow to re-establish a radio link.
- **Inputs / parameters:** Submarine depth (deep vs shallow enough for radio); realism setting toggle;
  presence of a datalink-capable platform; unit type (subs, missiles, torpedoes).
- **Behavior / rules:** When the submarine-communication realism setting is on, a deep submarine is placed in
  an **isolated** state: it can still develop and track its own contacts, but it cannot collaborate / share
  targeting with other friendly units (e.g. an F-35 overhead and the sub cannot fuse target data). To give it
  orders or re-link it, you must bring it **shallow** enough to raise a wire/antenna for radio. The same
  non-sharing applies to other entities (missiles, torpedoes) by default unless they specifically have a
  **datalink** capability (e.g. a camera-equipped Tomahawk with a datalink to its launching ship can transmit
  BDA before impact).
- **Outputs / effects:** Sensor/targeting data fusion is allowed or denied per unit based on the
  communication link; isolated units fight on their own picture.
- **Edge cases / quirks:** Default behavior for missiles/torpedoes is also no-sharing unless datalink-capable.
  Communications jamming exists in concept ("was patched in once") but is **not** a usable mechanic in this
  build (only a button to disable comms, not true comm-jamming).
- **Source:** RQgODnnYYsI
- **Confidence:** Med

### Aircraft-damage spreading model (sub-system degradation vs one-hit kill)
- **Models:** With the aircraft-damage realism feature, aircraft are not destroyed by a single light hit;
  damage is localized to subsystems and can spread, causing secondary effects.
- **Inputs / parameters:** Aircraft-damage realism toggle; weapon lethality (e.g. low-lethality cannon /
  7.62 mm, air-to-air laser); aircraft size/durability; which subsystem is hit (engine, radio, etc.).
- **Behavior / rules:** Without the feature, a single small round (stated: one **7.62 mm** round) downs even
  the largest aircraft in one hit. With the feature on, a large aircraft can take many hits; damage is applied
  per-subsystem and **spreads**, producing secondary effects — e.g. losing an engine reduces max speed; losing
  the radio drops the aircraft out of communication. Motivated by air-to-air **lasers** (a single laser hit
  shouldn't kill) and to model rugged airframes (A-10, Su-25 survivability).
- **Outputs / effects:** Progressive performance/communication degradation instead of instant kill; cascading
  subsystem failures.
- **Edge cases / quirks:** Scenario-level toggle. Specifically tied to enabling realistic survivability for
  armored/large aircraft and to lasers. (Relevant to sensing because losing the radio cuts the aircraft out of
  sensor-sharing.)
- **Source:** RQgODnnYYsI
- **Confidence:** Med

### Terrain-type effects on accuracy, sighting, and movement
- **Models:** With the terrain-type realism feature, the ground type under a unit modifies weapon
  accuracy/damage, detection/sighting, and movement speed.
- **Inputs / parameters:** Terrain / land-cover type at the unit's location; weapon type (point vs
  wide-area); target concealment.
- **Behavior / rules:** Depending on terrain type, CMO modifies: weapon accuracy and effective damage (e.g.
  conventional bombs in jungle/Vietnam-type terrain do less effective damage than a wider-area weapon),
  sighting/detection, and movement speed across the ground. Qualitative only — no numeric thresholds given.
- **Outputs / effects:** Adjusted hit/damage, detection range, and movement rate based on terrain.
- **Edge cases / quirks:** Scenario-level toggle; effects stated qualitatively. Related to (but broader than)
  the land-cover detection penalty in the recon/terrain material (cities/jungle reduce detection range). The
  full land-cover treatment lives in the Terrain & Environment bucket.
- **Source:** RQgODnnYYsI
- **Confidence:** Low

---

## Air-to-ground sensing & weaponeering (CMO modeling notes)

### Air-to-ground radar does NOT improve bombing accuracy (CMO modeling)
- **Models:** Turning on a strike aircraft's air-to-ground radar has no effect on dumb-bomb hit results in
  CMO — an explicit modeling abstraction.
- **Inputs / parameters:** Aircraft attack radar on/off (e.g. "use active radar from IP to Winchester");
  target type (buildings vs tarmac/aircraft); weapon (Mk-82); weather/cloud cover.
- **Behavior / rules:** Controlled experiment: the same strike with radar OFF vs radar ON (active from IP to
  Winchester) produced **EXACTLY identical** results (radar-off: **48 Mk-82s → 1 building + 6 MiG-21s** of
  ~50 present; radar-on: identical damage). So in CMO the air-to-ground radar does **not** change
  accuracy/lethality of the attack run. The narrator confirms this is a modeling abstraction divergent from
  real life (where you'd need the radar to find/designate the ground target). Practical use is for **spotting
  additional ground targets** you might be missing, not improving the bomb solution. Heavy cloud cover did
  not alter the outcome either.
- **Outputs / effects:** No change in bombs-on-target / kills from toggling the attack radar; the radar is
  useful only for additional target detection.
- **Edge cases / quirks:** Explicitly flagged as "fake efficacy" / a divergence from real-world physics.
  Weather (cloud) had no measured effect on the dumb-bomb result in this test.
- **Source:** nxaO2Er_9Lw
- **Confidence:** High

### Weapon Release Authorization (WRA) — partial salvos for spread targets
- **Models:** Per-target-class doctrine controlling how many weapons are released per pass, which strongly
  affects coverage of spread-out targets.
- **Inputs / parameters:** WRA setting per target class (e.g. "runway facility" = **4 rounds**; full stack vs
  half vs N-per-target); the doctrine page; weapon load.
- **Behavior / rules:** You do NOT have to drop the entire bomb stack on each target. Setting WRA to a partial
  salvo (demo: **4 rounds** per "runway facility"/tarmac target) spreads ordnance across many aim points.
  Same total bombs, but with the smarter WRA the strike got **3** buildings/aircraft results vs only ~1
  building + 6 aircraft with the default "drop the whole stack" doctrine — markedly better coverage of a
  spread target with identical expenditure. WRA can be set **per mission or per unit** on the doctrine page.
  (Narrator notes there's no "set all" button — a UI gap, not a mechanic.)
- **Outputs / effects:** Bombs distributed across more aim points per pass; higher target coverage/kills for
  the same total expenditure against spread targets.
- **Edge cases / quirks:** The benefit is specific to spread-out/area targets; you can set WRA narrowly (just
  the intended bomb-target) rather than for all. Over-the-shoulder/lofted releases observed but are weapon
  behavior, not WRA.
- **Source:** nxaO2Er_9Lw
- **Confidence:** High

### Decoy / drag (bait-and-pull) tactic against AI air defenders
- **Models:** AI interceptors/CAP commit toward the nearest detected threat; presenting a detected decoy at
  distance pulls defenders away, opening a masked corridor for strikers — an explicitly "anti-AI" exploit.
- **Inputs / parameters:** Decoy aircraft position/speed/altitude; striker route through masked terrain;
  travel time over the gap; enemy interceptor reaction time; number of enemy CAPs.
- **Behavior / rules:** Time/geometry budgeting: leg time = distance/speed, e.g. **34 nm at ~600 kt →
  (34/600)×60 ≈ 3.4 min ≈ 3 min 24 s**; because high-altitude interceptors need that same time to reach the
  strikers, the decoy must be placed at least **TWICE** as far from the strikers' pop-out point as the
  strikers are from the target (he doubles 34 nm to **~68 nm** for the decoy point). Strikers fly minimum
  altitude up a terrain-masked valley to stay undetected; the decoy is sent low/slow (loiter) into position
  behind masking terrain, then sprinted to military/afterburner to be detected and "pull" the CAP away. Once
  interceptors commit and turn (kicking to afterburner to chase), the decoy slows/runs to keep them committed
  while strikers pop out, deliver, and egress before the interceptors return. Scales to multiple CAPs: split
  strikers into small groups flying an in-and-out shape that repeatedly crosses the patrol edge to keep
  pulling defenders.
- **Outputs / effects:** Where AI interceptors are drawn; the timing window during which strikers can attack
  unopposed; engagement outcome (run reported **13** enemy "Tigers" destroyed).
- **Edge cases / quirks:** Explicitly described as exploiting the AI ("be a dumb AI"); the narrator also
  exploits drag profiles (half-sine altitude weaving) to make interceptors waste energy repeatedly regaining
  locks. Defender behavior depends on **detecting** the decoy, so the decoy must be made detectable
  (speed/altitude) at the right moment while strikers stay masked.
- **Source:** EgrrTt4ldHw
- **Confidence:** Med

---

## Cross-references & absorbed corrections

- **Overlapping radar/EW mechanics are stated in full above:** the radar-horizon LOS model (mast height +
  target altitude → horizon distance; calculator readings), the look-down/clutter and notch model (incl. the
  "fly lower to see above you" trick and the ~8° eyeballed notch), the ESM ~1.5× detection-range rule and 90°
  triangulation geometry, the LPI/F-22 un-locatable exception, the aspect/RCS "point at the radar to hide"
  rule and its pure-Doppler inversion, the rotating-radar refresh cadence (~5 s / ~10 s), and the IFF
  kinematic/emission reasoning — each merged into its entry above with the richest numbers (e.g. the 240 nm
  calculator table, the SEAD horizon-vs-range pairs, the multi-video ESM 1.5–3× spread).
- **Naval formation contact-fusing** (stacked contacts merging into one) lives in the movement-detection doc
  under *Naval formation spacing* and is also reflected in the range-resolution entry here.
- **Sibling parts (2/3, 3/3):** this part deliberately stops at the sensing/EW/IADS *engagement* core listed
  in the scope. Topics such as the full terrain-masking treatment, land-cover spotting/movement/attack, and
  weather/cloud detailed models are owned by the **Terrain & Environment** bucket
  (`docs/cmo-functional-rules/exhaustive/terrain-environment.md`); deeper non-IADS weapon/doctrine adjudication
  lives in the doctrine/general-tactics buckets. Where a rule here touches those (e.g. terrain masking of LOS,
  terrain-type realism toggle), it is summarized and cross-referenced rather than duplicated.

## Contradictions & caption-quality notes
- **ESM detection multiplier is not a single constant:** 7mmQ2y11hPc and oF8LwbZSm28 say ~1.5×; hCvQYbFYlt4
  says ~1.5–2×; s4t0ugMfDFY says ~2–3×. Implement as an **equipment-/era-dependent 1.5–3× band**, not a fixed
  number.
- **Doppler notch is inconsistently applied:** xV-H7HJd2-I measures a real ~8° beaming blind window on a true
  pulse-Doppler set, but the F-4 demos in 7mmQ2y11hPc / FOQ6kcf9YzA explicitly show crossing/co-speed targets
  detected "with no difficulty." This is a documented CMO inconsistency — model the notch for true-Doppler
  look-down sets, but do not assume universal notching.
- **Multiple jammers scale poorly / can backfire:** FI-ZwDubiMY (and the movement-detection jamming note) show
  going 1→2 same-band jammers changed detection by only ~2 nm, and 5–8 jammers *increased* detection range.
  The "quarter power" expectation was the narrator's "really really quick fake math," NOT a CMO rule. The real
  value of many jammers is covering many **frequencies** and forcing the enemy to split power.
- **Air-to-ground radar "fake efficacy":** nxaO2Er_9Lw explicitly flags that toggling the attack radar does
  nothing to dumb-bomb results — a deliberate modeling abstraction.
- **SimpleRockets missile-loft numbers are illustrative:** blDlSkDLKg0's loft/range figures come from a
  different-atmosphere sandbox used to explain the *principle* of CMO's energy-state missile model, not
  CMO-internal constants.
- **SA-2 FC radar neighbor-blindness:** g8Qzj1l56_E flags that a real SA-2 FC radar should still glimpse
  nearby formation members while locked, but CMO does **not** simulate this (the tight FC beam sees only the
  locked target).
- **Beta/patch-gated mechanics:** range-resolution merging and phased-array side-lobe falloff are tagged
  **patch 1147.39**; the radio-horizon-vs-optical-horizon split is **Beta 1278.1**. Behavior may differ on
  other builds.
