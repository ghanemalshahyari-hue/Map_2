# CMO Functional Rules (Exhaustive) — Terrain & Environment

**Bucket scope.** This is the *exhaustive* functional-rules spec for the **Terrain &
Environment** bucket of *Command: Modern Operations* — everything that governs how the
physical world (terrain elevation, land cover, the curved Earth, weather, cloud, and the
sensor/weapon line-of-sight geometry through them) affects detection, movement, and
engagement. It covers:

- **Terrain & elevation:** masking of radar/visual LOS by relief, terrain-following effects
  on movement speed, and the Lua tooling to scan elevation and find best-LOS points.
- **Land cover:** how the surface type under a ground unit changes visual spotting range,
  movement speed, and weapon effectiveness.
- **Weather — rain & cloud:** rain's (non-)effect on radar vs its blocking of EO/IR/laser,
  and cloud layers as opaque altitude-banded barriers to optical sensors and weapon seekers.
- **LOS / sensor geometry:** Earth curvature, slant range vs observer altitude, radar
  notching/Doppler, and the rule that a weapon seeker must independently detect its target.
- **Terrain & defensive geometry:** how attackers exploit terrain (low-corridor routing,
  deflection arcs, helicopter pop-ups) and how capable SAMs defeat masking by lofting.

**Exhaustive.** This document merges every rule extracted from all transcripts assigned to
this bucket and is self-contained — all terrain/environment corrections, quirks, and the
overlapping radar/LOS authorities (radar horizon, Doppler notch) are stated in full below.
Near-identical mechanics across videos have been deduplicated into a single richest entry
that cites all source videos.

**Auto-generated-caption caveat.** Source transcripts are auto-generated YouTube captions, so
numbers, unit names, and API field names may contain transcription errors. Stated numbers are
captured **verbatim**; where a value is qualitative, that is noted. Nothing here is invented —
unstated formulas are flagged as "observed test values, not a stated formula."

---

## Terrain & Elevation

### Terrain / elevation masking of LOS (radar & visual)
- **Models:** Terrain elevation blocks radar and visual line-of-sight and missile paths; valleys,
  ridges, riverbeds, and lake depressions conceal low-flying weapons and aircraft from ground
  radar (radar horizon / LOS blocking). Cruise missiles and aircraft "hide" from ground radar by
  flying low behind terrain.
- **Inputs / parameters:** Terrain elevation along the LOS (read off the **relief layer**, which
  shows *average* elevation — e.g. ~40 ft flat coast = "no cover", vs ~1000 ft inland, vs high
  mountains); weapon/aircraft altitude; position of radars; valleys, riverbeds, and lake
  depressions as low corridors; radar look-down capability; both observer and target elevation.
  The in-game planning aids are the **relief layer** and the **LOS tool** (Map Settings → LOS
  tool, set to a unit as Observer).
- **Behavior / rules:** A sensor cannot see through higher terrain, so terrain can cut a radar's
  effective coverage far below its instrumented/horizon range (a radar even on a 12,000-ft peak
  can be blocked by taller mountains). To delay detection to the last second, route weapons low
  through depressions (valleys, low riverbeds, lake basins) and stay beneath the radar horizon of
  nearby posts. Over flat/low ground (e.g. ~40 ft) there is **no masking**, so the weapon is a
  "free hit" and is detected immediately. Flying over high ground means anyone looking up sees you
  **unless** the weapon travels mostly over the high sections (terrain between it and the looker).
  Because most SAMs "can't shoot down well," posting your flight path **below** radars/SAMs that
  sit above is favorable. Use the LOS tool (set to one of your own units as Observer) to confirm
  what a given radar can/can't see along a ridge.
- **Outputs / effects:** Whether/when a low-flying weapon is detected; routes that stay masked
  reach the target undetected, routes over open low ground are detected immediately. Dramatically
  shortened detection/engagement ranges along masked corridors let weapons reach targets through
  dense defenses.
- **Edge cases / quirks:** CMO's relief layer is **granular** — fine micro-terrain (individual
  trees, tiny folds) is **not** modeled for elevation LOS; only macro elevation (ridges, mountains)
  masks. Open desert offers no masking other than elevation. Detection LOS depends on **both**
  observer and target elevation. The LOS tool is only available for *your own* units — for enemy
  radars you must estimate (e.g. ESM + horizon math). Qualitative terrain values are read off the
  relief layer, not exact thresholds. In one demo, Tomahawks were capped by "maximum weapon range,"
  forcing detours around masking corridors. High-arc SAMs (S-300/S-400) can still loft a missile
  over a ridge to hit a masked target (see *Long-range SAM arcing/lofting defeats terrain masking*).
- **Source:** wycT9grtrOE (Terrain Masking); also corroborated by bsLLZwqi4Mg (Understanding Radar
  Horizon) and hu1Mu_qaXQ8 (Helicopter Terrain Masking)
- **Confidence:** High

### Highest-point search over terrain (GetElevation grid scan, Lua)
- **Models:** Sampling terrain elevation across a lat/lon bounding box to find high points
  (candidate observation positions).
- **Inputs / parameters:** `start_lat`/`end_lat`, `start_lon`/`end_lon` (e.g. lon -74 to -72);
  step/granularity (`0.01` default; `0.001` for ultra granularity at higher processing cost); a
  max-elevation tracker init (`0`, or e.g. `-1000` for Death Valley); `GetElevation(latitude=y,
  longitude=x)`.
- **Behavior / rules:** Nested for-loops — outer over longitude `x` from `start_long` to `end_long`
  by `step`, inner over latitude `y` from `start_lat` by `step`. Each cell calls
  `GetElevation{latitude=y, longitude=x}`. If the returned elevation is greater than the running
  `max_elevation`, record a new high point: set `lat_max=y`, `long_max=x`, insert `lat_max` into
  `lat_list` and `long_max` into `long_list`, and update `max_elevation` to the new value. The
  result is a table of progressively-higher points found while scanning. (Narrator notes easy
  lat/lon (x/y) and N/S sign mistakes.)
- **Outputs / effects:** Lists (`lat_list`, `long_list`) of high-point coordinates plus the running
  maximum elevation; used as candidate observation positions, fed to the LOS probe below.
- **Edge cases / quirks:** Smaller step => finer fidelity but longer runtime. Wrong hemisphere sign
  or swapped x/y places points in Antarctica / the wrong spot. Positive longitudes must be handled
  separately. This records **every new running-max**, not strictly the single global max.
- **Source:** u9R-59fusCM (Determining a point in terrain with the best LOS)
- **Confidence:** High

### Best-LOS / visual-horizon evaluation (HorizonTool_LOS, Lua)
- **Models:** Measuring how far a candidate point can see (visual-horizon distance) to pick the
  best observation/sensor position, combining the elevation scan above with the LOS/horizon tool.
- **Inputs / parameters:** A temporary observer unit (a facility / generic geographic marker, e.g.
  **DBID 2349**) placed at each candidate point; `HorizonTool_LOS{observer=<unit guid>,
  target=altitude (e.g. 100 m), mode=0 (distance), horizon=1 (visual horizon),
  useRangeLimits=false}`; a sample count (demo ≈ **10**).
- **Behavior / rules:** Down-sample the high-point list (e.g. 10 samples; clamp `num_samples` to the
  list size to avoid overrun; sample index via `lat_list[math.floor(#lat_list / x)]` each loop
  iteration). Create a temporary facility unit at each sampled point. For each unit, call
  `HorizonTool_LOS` with a fake target at **100 m** altitude, `mode=0` (return a distance),
  `horizon=1` (visual horizon), and **`useRangeLimits=false`** — this last is **critical** because
  the bare markers have no real sensors. The call returns a horizon distance; larger = sees farther.
  Track `best_horizon`; if a unit's returned horizon exceeds it, store its lat/lon as
  `best_lat`/`best_long` and update `best_horizon`. Finally place a "best point" unit at
  `best_lat`/`best_long` (and ideally delete the temporary probe units afterward).
- **Outputs / effects:** The candidate point with the greatest visual-horizon distance (best LOS),
  plus the LOS distance from it. In the demo the best-horizon point **equals** the highest point
  (Bear Mtn, CT) with horizon ≈ **64.67** (units); the LOS tool confirms it sees much farther than a
  lower point.
- **Edge cases / quirks:** Must set `useRangeLimits=false` or sensor-less markers break the call.
  `horizon=1` selects the **visual** horizon (vs radar). The highest point tends to win, but the
  **tool, not raw elevation, is the authority** — a high point ringed by taller terrain would lose
  (consistent with the terrain-masking note that elevation alone isn't sufficient if surrounded by
  higher ground). Best practice: delete the temporary probe unit after testing.
- **Source:** u9R-59fusCM (Determining a point in terrain with the best LOS)
- **Confidence:** High (algorithm shown end-to-end; exact API field names Med due to auto-caption)

### Earth curvature limiting visual LOS / radar horizon
- **Models:** The curved Earth creates a horizon that blocks line-of-sight to distant low targets
  even when they are within nominal sensor range.
- **Inputs / parameters:** Observer altitude (height above the surface) and target range; the planet
  is modeled as curved.
- **Behavior / rules:** The Earth's curvature is explicitly modeled (visibly obvious when zoomed
  out). Even with a large nominal range (e.g. a **30-mile** radius), being only **~1,000 ft** up
  does **not** guarantee you can see a target at that distance — the curvature/horizon blocks the
  low-altitude line-of-sight. Demonstrated consequence: while flying very low near the surface, two
  passing aircraft that were much lower than the observer were **never seen** because they could
  not be made out from ground clutter and were beyond effective low-altitude LOS.
- **Outputs / effects:** Maximum effective detection range is capped by the radar/optical horizon,
  which grows with observer altitude; low altitude shrinks how far you can actually see regardless
  of sensor spec.
- **Edge cases / quirks:** No explicit horizon-distance formula is stated in this video —
  qualitative only ("be surprised that if only 1,000 ft up, even if I have a 30-mi radius, doesn't
  mean I can see"). Low-altitude observers also suffer from ground clutter masking low targets. The
  radar-specific "altitude → horizon distance" calculator model is stated in the next rule.
- **Source:** f8uR3dLCq0M (Cloud Cover and Visual Sensors)
- **Confidence:** Med

### Radar horizon (line-of-sight limit) — altitude/mast-height → horizon distance
- **Models:** Earth-curvature / LOS limit on radar detection range — the radar-specific quantitative
  form of the curvature rule above. All radars are LOS-limited; the maximum detection range against a
  target is the **lesser** of the radar's instrumented range and the radar-horizon distance for that
  geometry.
- **Inputs / parameters:** target altitude; the radar/sensor mast height above its platform (a
  database field — for a ship/sea platform this is the **mast height**, e.g. "10 m ≈ 32 ft"; some
  platforms have an explicit "height" option; if none is listed, interpolate/experiment); Earth
  curvature; the radar's instrumented range (a hard cap). CMO provides a **"Radar Horizon and Target
  Visibility Calculator"** (own height + radar height → target-visibility distance).
- **Behavior / rules:** Lower targets are detected at much shorter ranges; high targets near the
  radar's max instrumented range. Detection range increases monotonically with both platform/sensor
  height and target altitude. Worked figures (auto-caption, treat as approximate — the model is
  "altitude maps to a horizon distance"):
  - A **1,000 m** target against a **30 m** radar mast gives a horizon of only **~22 nm / 22 km** —
    an aircraft below 1,000 m vs a 30 m mast can hide from a long-range radar purely on LOS.
  - Calculator readings for a **240 nm** radar at a ~32.8 ft mast: 36,000 ft → **~240 nm**; 32,000 ft
    → **~196 nm**; 25,000 ft → **~201 nm** [transcript noise]; 18,000 ft → **~177 nm**; 12,000 ft →
    **~141 nm**; 10,000 ft → **~125 nm**; 8,000 ft → **~160 nm** [noise]; ~1,500 ft → **~60 nm**.
    That radar detected a 36,000-ft target at ~240 nm but a **104-ft-AGL** target only when very close.
- **Outputs / effects:** lets an attacker plan a descending altitude profile (sine-wave / staircase)
  to stay just under the defender's horizon, popping up only when needed, while keeping high altitude
  as long as possible for fuel.
- **Edge cases / quirks:** **Over-the-horizon (OTH) radars** ignore the radar horizon (bounce signals
  off the upper atmosphere) — e.g. a **Steel Yard / Duga** (separate transmit and receive sites) rated
  at **~3,200 nm** for space search, or a TPS-71 doing surface search beyond the horizon; the price is
  **ferocious ambiguity** (can be off by **~60 miles** in range), so OTH gives only rough cueing.
  Terrain can cut the horizon far shorter than the geometric value (see *Terrain / elevation masking
  of LOS*). Same descent-timing trap as waypoints: descend early or you are already spotted.
- **Source:** bsLLZwqi4Mg (Understanding Radar Horizon), 7mmQ2y11hPc (Tutorial - Radar)
- **Confidence:** High (model High; exact numbers Med due to transcription)

### Slant range and observer altitude in LOS detection
- **Models:** An airborne sensor's range is measured along the **slant** (3D straight-line)
  distance from sensor to target, not the horizontal ground distance, because the platform sits at
  altitude above the surface. The sensor's stated range radius is a 3D radius.
- **Inputs / parameters:** Observer altitude (converted to distance: **36,000 ft** is treated as
  **~7 miles** up); target horizontal offset; the resulting slant angle.
- **Behavior / rules:** When looking straight down from altitude, the sensor is **not** looking
  0 ft to the target — it is already consuming range equal to its altitude (at 36,000 ft / ~7 miles
  up, looking straight down is a 7-mile look). The horizontal offset plus the altitude form a slant
  angle, and detection consumes the **slant (hypotenuse)** distance, which eats into the sensor's
  range budget. As the observer descends so the target is nearly directly below at short slant, the
  slant angle effectively "goes away" and the target is picked up at the sensor's maximum visibility
  range with only a moment needed to swing the camera and identify. A target that is **co-altitude**
  with the observer is detected purely on horizontal distance (example: a co-altitude air target
  picked up at **~8 miles**).
- **Outputs / effects:** The effective detection distance to ground/sea targets **shrinks with
  altitude** because more of the range radius is spent on the vertical/slant component.
- **Edge cases / quirks:** The presenter notes the math (resolving altitude + horizontal into slant)
  is something to be mindful of; numbers are qualitative/illustrative (36,000 ft ≈ 7 miles), **not**
  a stated formula. Co-altitude targets remove the slant consideration entirely.
- **Source:** f8uR3dLCq0M (Cloud Cover and Visual Sensors)
- **Confidence:** High

---

## Land Cover

### Land-cover effect on visual/optical spotting of ground units
- **Models:** Vegetation / built-up density conceals ground targets from airborne observers
  (line-of-sight optical detection). The land-cover type under a unit changes how easily it is
  visually spotted (distinct from macro-elevation masking).
- **Inputs / parameters:** The land-cover / terrain type of the tile the target occupies; observer
  altitude; slant range; line-of-sight. Requires the scenario feature **"effects of terrain type"**
  to be enabled (Scenario editor → scenario features/options). View it via **View → Land Cover**
  (plus Map settings → terrain-type legend; the mouse cursor reports the cover type underneath it).
  (Target movement increases detection probability but was excluded from this demo.)
- **Behavior / rules:** Detection range depends on the land-cover class under the target, ordered
  from easiest to hardest to spot. In the test (identical F-16 observers at constant geometry vs
  identical ground units; all numbers verbatim, nm):
  - **Easiest / detected first, roughly equal (~4.4 → 3.3 NM):** **grasslands** and **snow & ice**
    detected first/easiest; then **croplands**; then **wetlands**; then **barren** — this whole open
    group is detected at roughly equal ranges, trending slightly shorter as the ground gets
    greener/more wooded.
  - **Harder ("odd" classes):** **woody savanna** detected later; **cropland/natural-vegetation
    mosaic** (crops dotted with trees) later still (**~3.2 NM** where plain cropland was detected).
  - **Forest:** detected at about **HALF** the cropland distance — **~1.6 NM** (transcript: "half of
    that distance"). A big deal for recon runs.
  - **Urban / built-up — the extreme:** the target is essentially **never acquired** even when
    overflown at low altitude; in the demo it was only acquired at **~1.2 NM** at **~417 ft**
    altitude directly over it. Hiding in a city is extremely effective.
  All spotting is gated by line-of-sight, so terrain blocking can prevent detection entirely
  regardless of class.
- **Outputs / effects:** The range at which a ground unit is first detected (and whether it is
  detected at all). Greener/denser cover → shorter detection range; urban → near-undetectable until
  very close. Drives where to hide vs bait units.
- **Edge cases / quirks:** Land cover is sampled at a very **fine (sub-pixel)** scale, so adjacent
  tiles can differ — a designer can exploit this to place units in hard-to-detect micro-tiles (e.g.
  an SA-15 in a dense-town pixel right beside an "obvious" T-55 bait in cropland). This refines the
  terrain-masking note: micro-terrain isn't modeled for **elevation** LOS, but land **cover** *is*
  modeled at fine scale. Line-of-sight can block detection in any class. Numbers are observed test
  values, **not** a stated formula. Radar-into-terrain (e.g. radar through jungle) was explicitly
  excluded from this demo. Land cover does not apply over oceans (but radar there is still affected
  by weather and sea state/height).
- **Source:** 2SJDdTiuRPs (Land Cover)
- **Confidence:** High (detection-range numbers stated verbatim)

### Land-cover (and slope) effect on ground-unit movement speed
- **Models:** Dense terrain and slopes slow ground-vehicle movement.
- **Inputs / parameters:** Land-cover density of the tile being traversed; terrain slope.
- **Behavior / rules:** The **denser the terrain, the slower** a unit moves/"climbs" through it. A
  **slope** additionally slows a unit down. (Stated qualitatively; not demonstrated, no numbers
  given.)
- **Outputs / effects:** Reduced ground-movement speed over dense cover and over slopes.
- **Edge cases / quirks:** Purely qualitative — the narrator declines to demonstrate and gives no
  thresholds or multipliers.
- **Source:** 2SJDdTiuRPs (Land Cover)
- **Confidence:** Med

### Weapon-type vs terrain/cover effectiveness against dug-in ground units
- **Models:** Submunition vs unitary-bomb lethality interacting with concealing terrain — cover
  changes the effectiveness of different weapons against units in it, and you must pick the weapon
  to match.
- **Inputs / parameters:** Weapon type (CBU/cluster submunitions vs Mk-84 unitary bomb); the
  target's land-cover concealment; target grouping (**12× M113 per group**); attacker (A-10s, same
  loadout per pass).
- **Behavior / rules:** The same attackers hit three identical 12-vehicle M113 groups hidden in
  **woods**, **savanna** (open), and **urban**.
  - With **CBUs (cluster munitions):** the woods group was devastated (down to ~2 of 12); the
    savanna group was similarly hit hard; the **urban** group "did pretty well" (low losses /
    survived).
  - Switching to **Mk-84 conventional/unitary bombs:** both the woods and savanna groups were
    "plastered" (heavy losses) while only the urban/savanna outlier got lucky — i.e. unitary bombs
    did **better** damage in this dense/grouped scenario than CBUs. Net tally with Mk-84s:
    **12 bombs killed ~35 APCs.**
  - Takeaway: select the correct weapon for dense environments. Concealment makes targets both
    **harder to detect AND harder to engage**. Area/cluster weapons work on open ground while
    unitary/penetrating bombs are needed for dense cover and especially urban.
- **Outputs / effects:** The number of vehicles killed per attack run varies by weapon type and by
  the target's cover; the wrong weapon in dense terrain yields poor results.
- **Edge cases / quirks:** Results are anecdotal/observed in one playthrough; you must **explicitly
  order the attack** or units engage poorly (units don't engage dense-cover targets well on their
  own). Urban concealment both hides units and reduces weapon effect. No stated damage formula.
  Cross-reference *grouped vs single units* (Movement & Detection bucket): a 12-vehicle group is a
  distributed target, so "kills" are per-vehicle.
- **Source:** 2SJDdTiuRPs (Land Cover)
- **Confidence:** Med (attack outcome counts stated but example-specific)

---

## Weather — Rain

### Rain / cloud effect on RADAR detection range (band/age dependent)
- **Models:** Weather (rain intensity, cloud cover) and radar wavelength/generation determine
  whether rain degrades radar **range**.
- **Inputs / parameters:** Rain level (none/clear .. extreme/maximum, set **independently** of cloud
  cover); radar type/age/band/power (e.g. **P-37**, 1961, **700 kW**, wide wavelength; **P3 "Dumbo"**
  1947; **X-band** Fire Control radars); target size (B-52 large, F-22 small/ambiguous, F-15).
- **Behavior / rules:** For powerful, long/wide-wavelength early-warning radars, rain has
  **essentially no effect** on detection **range**. The P-37 detected a B-52 at **~231.5/231.6 NM**
  and an F-22 at **~29.7 NM** with no rain; cranking the sky to solid cloud + maximum rain gave the
  **same** ranges (B-52 ~231.5; F-22 ~3.7 — i.e. unchanged). With the much older **P3 Dumbo (1947)**:
  clear-weather initial detection **~120–130 NM** (F-15 ~119, B-52 ~127–130) but a very **ambiguous**
  position (the target is placed/shown off to one side; confidence drops as the antenna sweeps);
  under maximum rain it still detected at **~142–152 NM** (B-52) and **~119 NM** (F-15) — range still
  unaffected. Detection works even when targets fly **directly through** the rain layer (descended
  into a 7,000–36,000 ft cloud/rain deck). General rule: the **higher the band / higher the
  frequency** (X-band fire-control radars), the more rain becomes a problem; very wide-wavelength
  powerful EW radars **"burn through"** rain.
- **Outputs / effects:** Radar detection **range** vs rain — unchanged for wide-band/powerful radars
  regardless of rain intensity; problems emerge for high-band fire-control radars. Position-fix
  **ambiguity** (separate from range) is large on old radars.
- **Edge cases / quirks:** Rain and cloud are **independent** settings in the weather editor.
  Position ambiguity (not range) is the limiting factor on old radars. A radar's effect must be
  reasoned from its database attributes (year, power in kW, band). No effect on range was observed
  even at absolute-max rain through the cloud deck. Rain has a **height** (a rain/cloud layer): an
  aircraft above the layer is unaffected; flying *inside* the layer is where attenuation applies.
- **Source:** P6UAdBqTUhk (Effects of Rain on Detection)
- **Confidence:** High

### Rain / cloud blocking of IR, laser, and visible light (engagement, not radar detection)
- **Models:** Precipitation/cloud attenuates optical/IR/laser sensors and weapon seekers, blocking
  **engagement** even when radar still tracks.
- **Inputs / parameters:** Rain present; cloud deck altitude/extent; sensor/weapon seeker type
  (IR/laser/visible vs radar); engagement geometry; time of day.
- **Behavior / rules:** Rain **blocks infrared light, laser light, AND visible light**. Consequence:
  a Fire-Control radar may still hold the target on radar, but an IR/visible-dependent engagement
  fails. Examples: an **SA-3** "lost sight" of an F-22 because it physically couldn't see it through
  a wall of clouds; a **MIG-21** with an IR (R-13M tail-aspect) missile got **"weapon must detect
  target prior to firing"** because rain blocked the IR seeker. Detection ranges with vs without
  weather (MIG-21 Sapphire radar): **radar** acquisition stayed about the same with rain, but
  **visible/optical** detection collapsed — an F-15 was acquired at only **~4–4.5 NM** in rain vs
  **~8.1 NM** with rain/clouds removed (roughly half). Net rule: in heavy rain/cloud your problem is
  **not** long-range radar **detection**, it's the inability to **engage** with optical/IR-cued
  fighter weapons.
- **Outputs / effects:** Optical/IR/laser detection range and weapon seekers are degraded or
  disabled (weapon won't fire / loses lock); radar detection is largely unaffected.
- **Edge cases / quirks:** A cloud deck above the shooter can fully block engagement of a target
  above it. Tail-aspect (chase) IR missiles are also constrained by geometry ("weapon must detect
  target", "not a chase weapon"); you must drop to **loiter** so the missile has settle time off the
  rail. Low light / early day compounds the visible-detection difficulty.
- **Source:** P6UAdBqTUhk (Effects of Rain on Detection)
- **Confidence:** High

### Radar notching / Doppler limitation of old radars (position-fix loss)
- **Models:** A target flying **perpendicular** (zero Doppler) defeats old non-pulse-Doppler radars'
  ability to fix position.
- **Inputs / parameters:** Target aspect/heading relative to the radar (turning to a beam/notch
  aspect = no Doppler shift); radar generation (old radars lack good notch handling).
- **Behavior / rules:** When a target turns so it has no Doppler shift ("notching"), very old radars
  can tell it is **turning** but lose the ability to precisely fix its **position** — the position
  estimate box is shown but the target is actually **outside** it. Larger targets (B-52) retain
  somewhat better confidence than small ones (F-15). Notching here does **not** reduce detection
  **range**; it ruins position accuracy.
- **Outputs / effects:** Degraded/erroneous target position estimate (track ambiguity) for notching
  targets against old radars; detection persists.
- **Edge cases / quirks:** The narrator is unsure of the exact modeled mechanism (possible Doppler-
  beam shift). Affects position precision, not detectability range. Modern pulse-Doppler radars
  handle notching better (implied). Related measurement on a **true pulse-Doppler look-down/shoot-down
  set**: a target flying **perpendicular** to the radar (zero relative velocity) is *invisible*
  because the radar filters out its own motion and the target shows zero relative Doppler — the demo
  measured a roughly **~8°** blind window (eyeballed by the narrator, not a confirmed CMO constant);
  the moment the target's path becomes oblique, Doppler returns and it is seen. A launched weapon can
  **lose radar lock** when a target beams it, and a pure **pulse**-only radar (e.g. F-14) has no notch
  at all (it would still see a beaming target if not also masked by ground clutter). Nearly all radars
  now have some Doppler filtering, so notching applies broadly.
- **Source:** P6UAdBqTUhk (Effects of Rain on Detection); ~8° figure from xV-H7HJd2-I (Look Down/Shoot
  Down Radar) and 7mmQ2y11hPc (Tutorial - Radar)
- **Confidence:** Med

---

## Weather — Cloud

### Cloud layers as discrete altitude-banded opaque barriers
- **Models:** Atmospheric cloud cover physically blocks line-of-sight between an observer and
  anything on the opposite side of the cloud band's altitude. Clouds act as opaque physical
  barriers to visual/EO sensors. (This is the richest, fully-detailed cloud-barrier entry; see also
  the radar-penetration and weapon-seeker rules below for the radar/engagement consequences.)
- **Inputs / parameters:** A **single global cloud-density slider** in the weather editor (no
  per-altitude cloud stacking — only one bar). The slider position determines **both** cloud
  thickness/severity **and** the altitude band the clouds occupy. Named bands/categories from low to
  high slider: **light low clouds (5,000–7,000 ft**, called the edge of VFR pilots), **light middle
  clouds**, **light high clouds (20,000–23,000 ft)**. Density progression as the bar is dragged up:
  **light → moderate → very moderate → solid clouds → thick fog**. A **rainstorm** corresponds to a
  specific slider line and can also create rain. Full-left = no clouds; full-right/full-width =
  **thick fog 0–2,000 ft**.
- **Behavior / rules:**
  1. The weather editor exposes **one** cloud bar; you cannot specify clouds at multiple altitudes
     simultaneously (e.g. cannot set 5,000 **and** 8,000).
  2. The chosen slider position places an **opaque** cloud layer at a fixed altitude band (shown
     when hovering the slider, e.g. "light high clouds between 20 and 23,000 ft").
  3. A sensor on **one side** of that altitude band **cannot** see/spot/identify any target on the
     **other side** of the band — the layer is treated as **100% opaque** ("a fixed object", "a
     physical barrier", "a veil or curtain that disables that particular altitude").
  4. To see a target you must be on the **same side** of the cloud layer as the target: fly the
     observer **below** the layer to see surface/low targets, or **above** to see high targets.
  5. Being **co-altitude** with a target sandwiched between two layers lets you ID it; targets above
     the upper layer or below the lower layer (relative to you) remain unidentified.
  6. Flying **inside / dead-center** of the layer still yields no detection of targets beyond it.
  7. Confirmed **identical** detection range once the layer no longer blocks (the target is
     re-acquired at the same distance as the clear-sky baseline once the observer drops under the
     layer).
- **Outputs / effects:** Whether a target is spottable/identifiable **at all** (binary block),
  independent of nominal sensor range. The **F2** key renders a visual representation of the cloud
  layer's altitude for the selected unit.
- **Edge cases / quirks:** **Single slider only** — no choosing two separate cloud altitudes from
  the standard editor (the presenter says making "a cloud here and a cloud here" is possible but is
  for another video). Clouds are **not** volumetrically visualized (no puffy shapes to weave
  around); it is purely a flat altitude-band abstraction. **Thin fog** is described as fairly nasty.
  The block is **absolute (100%)** for visual sensors regardless of how light the cloud is. Clouds
  and rain are independent settings.
- **Source:** yhs02DUz9bg (Cloud Cover's Effects on Spotting)
- **Confidence:** High

### Cloud-deck altitude as a vertical LOS blocker for engagement
- **Models:** A solid cloud layer at a given altitude band physically blocks line-of-sight to
  targets inside/above it (the engagement-geometry consequence of the cloud-barrier model).
- **Inputs / parameters:** Cloud-deck top/bottom altitudes (e.g. a solid deck **~7,000–36,000 ft**);
  target altitude relative to the deck (skimming the top ~36,000 ft vs descended into the middle
  ~25,000 ft); observer position.
- **Behavior / rules:** A target **skimming the TOP** of a solid cloud deck is not "inside" it;
  ordering it down (e.g. to **25,000 ft**) puts it in the **middle** of the deck. A large overhead
  "wall of clouds" can completely prevent engaging a target above/within it (the SA-3 couldn't
  engage the F-22 through the cloud wall) while **radar still reports it**. Whether weather blocks
  you depends on the target's altitude versus the cloud band and the optical LOS through it.
- **Outputs / effects:** Optical/IR engagement is **blocked** when the cloud deck lies between
  observer and target; a target inside the deck is shielded from visual engagement.
- **Edge cases / quirks:** This is **distinct** from rain attenuation — it is **geometric** blocking
  by the cloud layer's altitude band. Detection (radar) can persist while engagement is denied.
- **Source:** P6UAdBqTUhk (Effects of Rain on Detection)
- **Confidence:** Med

### Radar (active sensor) penetration through clouds vs SAR imaging without visual ID
- **Models:** Active radar can detect and image targets **through** cloud cover (in contrast to
  visual sensors), with frequency-dependent degradation through thick cloud.
- **Inputs / parameters:** Radar sophistication/type (example: **P-8's** sophisticated phased-array
  radar; an old-school surface radar on a T95RT); cloud thickness; radar frequency (very high
  frequencies, e.g. weapon/missile guidance radars going up into the air, struggle more); the
  target's electronic emissions.
- **Behavior / rules:**
  1. A capable radar detects and identifies targets through the opaque cloud layer essentially
     **instantly** — clouds "didn't do anything" to the radar; a sophisticated phased-array can
     produce a **synthetic-aperture-radar (SAR)** image good enough to read the lettering / determine
     the vessel class.
  2. However, even when radar provides identity/class, **visual** identification of details below
     the cloud (e.g. aircraft parked on a carrier deck) is still impossible — the cloud blocks the
     optical channel.
  3. Radar can **cue** the visual sensor: a radar-detected (skunk) contact is shared/data-linked so
     another platform's optical sensor can attempt to ID it (subject to the cloud block).
  4. **Older / very-high-frequency** radars have a harder time seeing through clouds, and the
     **thicker** the cloud the harder older radars must work to see through it.
  5. When a contact moves into the radar's **blind zone**, the contact drops out.
- **Outputs / effects:** Radar contacts (with class/identity via SAR) appear despite cloud cover;
  visual detail/ID of those contacts does not; thicker cloud degrades older/high-frequency radar
  performance.
- **Edge cases / quirks:** **Satellites:** cloud over a target makes **optical** satellites
  effectively useless, but other (non-optical) satellite types still work. **Tactical implication:**
  with **no electronic emissions**, ships can legitimately hide under cloud cover; emission-
  controlled missiles (e.g. Harpoons) stay invisible under cloud until the last second.
- **Source:** f8uR3dLCq0M (Cloud Cover and Visual Sensors)
- **Confidence:** High

---

## Sensor & Weapon LOS Geometry

### Visual/optical sensor dual-range model (search range vs identify range)
- **Models:** Electro-optical / FLIR / eyeball sensors have a **shorter** range to first-detect an
  unknown target and a **longer** range to identify a target once it is already known (e.g. cued by
  another sensor).
- **Inputs / parameters:** Two published ranges per visual sensor — a **searching range** (shorter)
  and an **identification range** (longer). Example for a high-magnification FLIR: **20** nautical
  mile search range and **30** nautical mile identify range. Whether the target is already
  known/cued by an external sensor (e.g. radar).
- **Behavior / rules:**
  1. The **SEARCH** range (the smaller number, 20 nm in the example) governs detecting a
     previously-**unknown** target: "anything I'm looking for, I can see in 20."
  2. The **IDENTIFY** range (the larger number, 30 nm) only applies **after** a target has already
     been seen/cued: "I've already seen a target but I need to identify the target."
  3. Therefore, absent an external cue (radar etc.), the longer 30-mile range is **meaningless** and
     only the 20-mile search range matters.
  4. With an external cue, the sensor can effectively reach out to the longer range to look at /
     identify that cued spot, **expanding** the effective search radius onto the cued location.
- **Outputs / effects:** The maximum range at which the sensor will auto-detect **new** contacts vs
  the range at which it can resolve/identify **already-known** contacts.
- **Edge cases / quirks:** Cued detection **expands** the effective search radius — a radar-cued
  target lets the optical sensor "look in at that spot and have a better idea of seeing it." The
  dual-range property is stated to apply to **all** visual sensors, not just FLIR.
- **Source:** f8uR3dLCq0M (Cloud Cover and Visual Sensors)
- **Confidence:** High

### Weapon-seeker must independently detect target before firing
- **Models:** A weapon (and its onboard seeker) needs its **own** valid detection of the target
  prior to launch — a data-link/cued track alone is insufficient for seekers that must physically
  see the target, and clouds block that seeker just as they block the launch platform.
- **Inputs / parameters:** Weapon seeker type (e.g. **AGM-65 Maverick** infrared/IR seeker — also
  able to use an inference/IR seeker); whether the target is only a **data-link** contact vs
  physically detected by the firing platform's own sensors; cloud layer between weapon/platform and
  target; weapon range; detection range.
- **Behavior / rules:**
  1. Firing is gated by a check: **"weapon must detect target prior to firing."**
  2. If the platform only has a **data-link** target (provided by another sensor) and cannot itself
     physically see the target, the IR-seeker weapon will **not** engage — it has "no concept of
     where that target physically is," so even firing for demonstration sails the missile over the
     target's head.
  3. The IR seeker on the weapon's nose has the **same** cloud limitation as the aircraft: it cannot
     physically see **through** the cloud layer for engagement purposes.
  4. **"Out of detection"** and **"out of range"** are **distinct** gates — you can be in detection
     but out of weapon range (get closer to enter range), or in range but unable to detect (blocked
     by cloud).
  5. Dropping the platform's altitude to dive **through/under** the cloud layer restores the
     platform's (and weapon seeker's) physical detection, after which the shot is permitted once
     also in range.
  6. **Laser-guided bombs are worthless** in heavy cloud/fog because you cannot point the laser at
     something you cannot see.
- **Outputs / effects:** Whether a weapon launch is **permitted**; whether a fired weapon can
  actually acquire and hit the target.
- **Edge cases / quirks:** A radar (e.g. an F-16 air-to-ground radar) easily spots an easy target
  like a small SAM (**Osa**/"wasp"), but a radar lock still does **not** let an IR/visual-seeker
  weapon fire if that seeker itself cannot see through the cloud. The distinction between being
  out-of-range vs out-of-detection is surfaced **separately** in the firing dialog.
- **Source:** yhs02DUz9bg (Cloud Cover's Effects on Spotting)
- **Confidence:** High

---

## Terrain & Defensive Geometry

### Detection-alert cascade across a side's air defense
- **Models:** Once a strike is detected, the **whole** defending network goes to alert.
- **Inputs / parameters:** First detection of any inbound weapon by any sensor on the defending
  side.
- **Behavior / rules:** The moment you fire / are detected, **every** other unit on the defending
  side is effectively alerted that an attack is underway (they "know they're being attacked"), even
  before each individually tracks a target.
- **Outputs / effects:** The whole defending side is raised to alert / expectation of attack after
  first contact.
- **Edge cases / quirks:** Stated as a general rule; no timing/decay numbers given.
- **Source:** wycT9grtrOE (Terrain Masking)
- **Confidence:** Med

### SAM engagement vs target type and look-down limit (SA-2 vs SA-3, anti-cruise-missile)
- **Models:** Older SAM systems' inability to engage certain low/small targets and to look down.
- **Inputs / parameters:** SAM type (SA-2, SA-3, SA-6, Hawk, etc.); target type (Tomahawk cruise
  missile, ARM/HARM-style, aircraft); whether the SAM is short-range; relative geometry (target
  below the SAM).
- **Behavior / rules:** In a Persian Gulf scenario with only **SA-2s and SA-3s**: **SA-3s CAN**
  engage Tomahawk cruise missiles, **SA-2s CANNOT** — so a route can pass **directly over SA-2
  sites** with no shot taken. When attackers used only **long-range / non-short-range** weapons,
  **short-range-only** crews could not engage at all and held fire. Most SAMs shoot **down** poorly,
  so flying **below** them (they "are posted above") reduces their engagement ability.
- **Outputs / effects:** Whether a given SAM fires at a given inbound — SA-2 passes Tomahawks, SA-3
  engages them; short-range systems can't reach high/long-range inbounds.
- **Edge cases / quirks:** Capability is **per-system / database-driven** (which weapon can hit
  which target class). The look-down limitation is stated qualitatively.
- **Source:** wycT9grtrOE (Terrain Masking)
- **Confidence:** High

### Defeating SAMs with deflection/arc geometry and terrain dipping
- **Models:** Old SAMs miss crossing ("deflection") and chasing shots, especially when targets dip
  behind terrain.
- **Inputs / parameters:** Missile flight-path geometry (straight beeline vs arc/circle around the
  battery); SAM age/quality; whether the target keeps dropping behind terrain; waypoint count
  allowed.
- **Behavior / rules:** A SAM (especially older ones) **cannot hit a deflecting target** well.
  Tactic: fly an **arc/curve** in-and-out of the SAM batteries so they fire **deflection (crossing)**
  shots that mostly miss, exhausting their interceptors; then **beeline** to the target after the
  missiles are wasted. **Chasing/tail shots** are also very hard for any missile, particularly when
  the target dips behind terrain between shots. You can even design a **decoy Tomahawk** routed in a
  **full circle** around enemies purely to soak interceptors — and it may still survive and hit. By
  contrast, a straight "general assault" lets the defenders make easier shots and slap the inbounds
  out of the sky.
- **Outputs / effects:** Greatly increased miss rate of defending SAMs and interceptor depletion;
  more weapons survive to target.
- **Edge cases / quirks:** A **"squiggle"** at the last second further helps; very skilled / late-
  night-modeled crews can still make some deflection shots. Effectiveness scales with SAM **age**
  (older = worse against deflection). Limited by allowed waypoints and weapon max range.
- **Source:** wycT9grtrOE (Terrain Masking)
- **Confidence:** High

### Helicopter speed-to-altitude coupling (auto AGL by throttle setting)
- **Models:** A real helicopter trades low-altitude masking for speed; faster flight forces a higher
  safety altitude.
- **Inputs / parameters:** Helicopter throttle/speed setting (loiter vs cruise vs military); current
  AGL; terrain.
- **Behavior / rules:** Helicopter AGL is **tied to commanded speed**. At **loiter** speed it stays
  at **50 ft AGL**. The instant you order it to MOVE faster (**cruise OR military**), it pops up from
  50 ft to **100 ft AGL** (modeled so a ~160 mph helicopter avoids power lines / trees). Slower speed
  → better low-altitude (masking) performance. So to stay maximally hidden behind terrain you drop to
  loiter to hold 50 ft; you accept 100 ft when you need to transit at cruise/military.
- **Outputs / effects:** The commanded AGL of the helicopter (50 ft at loiter, 100 ft at
  cruise/military); affects whether it stays masked behind ridgelines.
- **Edge cases / quirks:** Both cruise and military give 100 ft (not a continuous scale in the demo).
  The relief layer is granular, so only **macro** terrain (ridges/mountains), not individual trees,
  provides masking. After a pop-up you must **explicitly command it back down to 50 ft**.
- **Source:** hu1Mu_qaXQ8 (Helicopter Terrain Masking)
- **Confidence:** High

### Helicopter pop-up attack and auto-evasion behavior
- **Models:** Bob-up / pop-up masking attack and the autopilot's self-endangering evasion.
- **Inputs / parameters:** Hover order at min altitude; pop-up target altitude (set via F10, e.g.
  **200 ft**); the weapon engagement envelope (must reach firing altitude); an incoming missile
  triggering auto-evasion.
- **Behavior / rules:** Stay masked low (50 ft, in range), order a **hover**, then command a brief
  **pop-up** to a set altitude (e.g. 200 ft) to clear the ridge, **fire**, and drop back down. When
  fired upon, the helicopter enters **automatic evasion mode** which makes it flee at high speed —
  which forces it **UP** off minimum altitude and can get it killed; the human therefore manually
  orders it back down (down/down/down) to re-mask. **Alpha-strike** (fire everything the moment in
  range) is advised because the firing window behind terrain is tiny.
- **Outputs / effects:** Brief exposure to launch weapons then re-masking; auto-evasion raises
  altitude/speed (a liability near SAMs).
- **Edge cases / quirks:** Auto-evasion "kills itself" by climbing/speeding; manual low-altitude
  control is safer. A pop-up altitude set too high over-exposes the aircraft.
- **Source:** hu1Mu_qaXQ8 (Helicopter Terrain Masking)
- **Confidence:** High

### Long-range SAM arcing/lofting defeats terrain masking
- **Models:** High-end SAMs (S-300/S-400) loft missiles **over** ridgelines to hit terrain-masked
  targets — terrain masking does **not** guarantee safety.
- **Inputs / parameters:** SAM system type (S-300/S-400 vs SA-19 point defense); target hidden
  behind a ridge; missile flight profile (arc/loft).
- **Behavior / rules:** Even when an Apache successfully sneaks behind a ridgeline and gets off
  initial missiles, an **S-300/S-400 can arc/loft** its interceptor missile **OVER** the ridge and
  down onto the masked helicopter. Engagement starts **immediately** once exposed. The way to
  actually beat it is to place the SAM in a poor/exposed spot (so its **own** LOS is bad); a well-
  placed S-400 **cannot be reliably sneaked up on**.
- **Outputs / effects:** A masked target can still be hit by an arcing missile from a capable long-
  range SAM after a brief firing window.
- **Edge cases / quirks:** The outcome depends heavily on SAM **placement / LOS quality**. S-300/
  S-400 handle decoys/stealth/saturation well. A cannon (shorter range) would require getting even
  closer than the missile envelope.
- **Source:** hu1Mu_qaXQ8 (Helicopter Terrain Masking)
- **Confidence:** Med

---

## Cross-video notes & deduplication log

- **Terrain masking appears across three videos** (wycT9grtrOE, bsLLZwqi4Mg, hu1Mu_qaXQ8). The core
  "elevation blocks LOS / route low through depressions" mechanic is merged into one *Terrain /
  elevation masking* entry citing all three; the helicopter-specific (AGL coupling, pop-up,
  auto-evasion) and high-end-SAM-lofting behaviors are kept as separate entries because they add
  distinct mechanics.
- **Notching/Doppler position-loss** is described in both the rain video (P6UAdBqTUhk) and the
  look-down/shoot-down + radar videos (xV-H7HJd2-I, 7mmQ2y11hPc). The rain video's version
  (position-fix loss on old radars, range unaffected) and the ~8° beaming blind-window measurement
  are both stated in full in the *Radar notching / Doppler limitation* entry above.
- **Cloud as an opaque layer** is the through-line of yhs02DUz9bg (editor mechanics + binary visual
  block), P6UAdBqTUhk (vertical engagement blocking), and f8uR3dLCq0M (radar penetration / SAR /
  satellites). These are split into the *cloud barrier* (richest editor+block detail), *cloud-deck
  vertical LOS block* (engagement geometry), and *radar penetration vs SAR* entries rather than one
  monolith, because each adds a distinct dimension.
- **Land cover (2SJDdTiuRPs)** yielded three separable mechanics — spotting range by cover type,
  movement/slope slowdown, and weapon-vs-cover effectiveness — kept as three entries from one source.
- **"Weapon must detect target prior to firing"** surfaces in both the cloud video (yhs02DUz9bg) and
  the rain video (P6UAdBqTUhk). The fullest seeker-gating treatment (data-link insufficiency,
  out-of-detection vs out-of-range, laser-guided-bomb uselessness) is from yhs02DUz9bg and is kept as
  the single *weapon-seeker must independently detect* entry; the rain video's IR/laser/visible
  blocking is its own entry.
- **Earth curvature, slant range, and visual dual-range** all come from f8uR3dLCq0M (Cloud Cover and
  Visual Sensors) and are kept as three distinct geometry entries.
- **Land cover vs elevation masking are separate layers:**
  elevation (relief) masks LOS at **macro** scale and ignores micro-relief; land **cover** modifies
  spotting/movement/weapon-effect at **fine** (sub-pixel) scale. A unit benefits from both
  independently (e.g. low in a valley **and** in forest/urban cover).
