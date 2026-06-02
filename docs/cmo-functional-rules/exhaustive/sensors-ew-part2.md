# Sensors / EW / IADS — Part 2/3

**Scope.** This is Part 2 of a three-part functional-rules specification for the **Sensors / EW / IADS** bucket of Command Modern Operations (CMO). It covers the mechanics enumerated in the source set assigned to this part only — chiefly: search-vs-cued visual/EO detection, sensor cross-cueing and fusion, weather/terrain/aspect penalties, the radar-cross-section (RCS) and detection-range model, ESM passive triangulation, OECM (offboard noise) and DECM (defensive deception) jamming, decoys (weapons, units, and flags), the side-wide comms/sensor-fusion network and its disruption, IADS posture automation (exclusion zones, EW vs FC radars, 2D/3D, PCL, EMCON), SAM kinematics and engagement geometry (snap-up, minimum range, deflection, FCR directionality, effective vs max range), SAM-vs-surface and over-horizon datalink shots, semi-active radar homing (SARH) illumination/datalink requirements, and passive submarine acoustic detection. Sibling parts (1/3 and 3/3) cover the remaining rules of this bucket and are **not** duplicated here.

**Exhaustive intent.** Within the assigned rule set this document is intended to be exhaustive: every distinct mechanic is captured, and near-identical mechanics drawn from different source videos have been merged into a single richer entry that cites all contributing sources.

**Caption caveat.** These rules were reverse-engineered from **auto-generated video captions**. Numbers, unit names, and band/designation labels are transcribed verbatim and may contain transcription artifacts (e.g., ambiguous units, mis-heard designations). Where a value's units were unclear in the transcript it is reproduced as stated and flagged. Treat low/medium-confidence entries as directional rather than authoritative.

---

## 1. Visual / Electro-Optical Detection Model

### Search vs Identify/Classify vs Cued detection (three distinct ranges)
- **Models:** The realistic distinction between blindly searching for an unknown target, identifying one you can already see, and detecting/IDing one whose rough position you've been handed. Every visual/EO sensor (and the naked eye) exposes a long "I-can-see-you-if-cued" range and a much shorter unaided "find-it-yourself" range.
- **Inputs / parameters:** Sensor search/spot range; identification/classification range; cued range (up to the sensor max); whether the sensor has external cueing (another sensor providing a position); target known/unknown status; sensor max-range cap.
- **Behavior / rules:** Without a cue the sensor must SEARCH — slow and short-ranged. With a cue it simply "looks down the scope" and acquires/IDs at a much longer range up to the sensor max. Stated rule: "if I KNOW something is there I can see it at 50 [nm]; if I DON'T know something is there I can only see it at 5 nm." Examples: the SR-71's IRR frame camera is a "15-80" device (uncued ≈ 15 nm / max-cued = 80 nm) — uncued it acquired at ~15 nm, but once an E-2 cued it, it photographed targets at ~50 nm. A Vigilante visual pod has a 15 nm range (won't see anything until ~15 nm). A camera recon pod is "12 nm find-it-yourself / 20 nm if-you-can-tell-me-where-it-is" — verified by IDing a carrier at ~10 nm (under 12, checks out). The "maximum range" vs "I-can-see-you range" fields appear directly in the sensor's database entry.
- **Outputs / effects:** Determines which of the three ranges applies; cueing dramatically extends acquisition/ID distance and speeds response time.
- **Edge cases / quirks:** Uncued cameras "slow down their response time" because they are searching. A radar+camera pairing is the recommended combination (radar cues camera). Without cueing the fine sensor reverts to its short, slow search range.
- **Source:** A7oqIAMhKF8, agqnyM3Hwkg
- **Confidence:** High

### Cross-sensor cueing and sensor fusion (radar cues EO/IR; one platform cues another)
- **Models:** Best-practice pipeline — one sensor (radar/AEW) finds a contact's rough position and hands it off to a finer sensor (camera/FLIR/eyeball), which skips the search phase and acquires/IDs at long range. Same-platform and cross-platform.
- **Inputs / parameters:** A cueing sensor with a position-fix capability (search/surface-search radar, AEW like E-2/Hawkeye, J-STARS, F-35 nose radar); a cued fine sensor (camera/FLIR/eyeball/distributed-aperture); the sensor network/comms linking them; line of sight; current detection state.
- **Behavior / rules:** When a friendly sensor detects a contact and shares it, other sensors are cued to that location and acquire/ID at extended range (up to their max) and faster. Cross-platform examples: SR-71 camera + separate radar platform; Hawkeye cueing a ship-search aircraft; E-2 cueing SR-71 frame cameras (enabled ~50 nm photos vs ~15 nm uncued). Same-platform: flipping on the F-18 search radar instantly upgraded uncertain visual contacts to recognized and let the FLIR lock the cued target directly; a recon aircraft turning ON its own surface-search radar suddenly let it ID "many many things" (helicopters at an airport, ships at ports) it couldn't classify visually — "we've got the radar which now means we can cue the cameras." The F-35 combines a "stupidly strong" nose radar + FLIR + 360° distributed-aperture system to collect in one pass what previously needed many recon units. Stated conclusion: the best combination of any of these is **Sensor Fusion** — see the target on radar first, then cue regular visual sensors to spot/identify/engage.
- **Outputs / effects:** Cued sensors acquire/classify at extended range and faster; many simultaneous contacts resolved in a single pass; a radar+camera combination yields a high-fidelity all-in-one recon platform.
- **Edge cases / quirks:** Cueing takes about "a minute" to acquire/propagate before the cued sensor benefits. Turning the radar on is what enables cueing — purely visual (radar off) reverts to short unaided ranges and far fewer IDs. Flying past the edge of the radar lobe drops the radar contacts even though close-in visual sensors persist.
- **Source:** A7oqIAMhKF8, 8wfY7-TT4Xo, agqnyM3Hwkg
- **Confidence:** High

### Radar cueing of EO/IR and progressive recognize → classify → identify refinement
- **Models:** Turning on a search radar immediately upgrades the tactical picture and lets electro-optical sensors lock the cued target; affiliation/side ID is refined as range closes.
- **Inputs / parameters:** Search radar on/off; existing visual/FLIR sensor; range to target; cloud-layer state; land-cover.
- **Behavior / rules:** Flipping the search radar on causes "almost every single target I wasn't sure of" to be instantly recognized. Once the radar cues where the target is, the FLIR can "lock onto that target directly" as the aircraft closes, rather than searching. Radar recognizes presence/type at long range (e.g., detects generic "armor"); the cued FLIR/EO then provides finer side-affiliation ID at close range (~1.5 nm in the cropland example). Progressive refinement: recognize → classify → identify side as range closes.
- **Outputs / effects:** Mass instantaneous recognition of contacts; direct FLIR lock; staged identity refinement with closing range.
- **Edge cases / quirks:** Radar often "can't read the flag off the side of the tank" — it detects presence/type but not affiliation; EO/visual closes that gap at short range.
- **Source:** 8wfY7-TT4Xo
- **Confidence:** High

### Mark-1 eyeball baseline visual sensor (aspect-dependent FOV)
- **Models:** The naked-eye sensor every crewed platform carries, with directional (front/side/rear) visibility and its own search-vs-cued ranges.
- **Inputs / parameters:** Eyeball search range and ID range (cited as 15 nm "if you tell me where it is" / 50 nm "if it's big enough and you tell me where it is"); viewing direction (front/side good, rear poor); altitude; target size.
- **Behavior / rules:** Has separable uncued (short) and cued/large-target (up to ~50 nm) ranges plus directional limits — for the O-1 Bird Dog visibility is good front and side but "pretty doo-doo out the back." Uncued and searching, the eyeball had to close to ~1 mile to start spotting buildings and missed many ground units entirely.
- **Outputs / effects:** A weak default detection/ID capability strongly dependent on cueing, target size, altitude, and aspect.
- **Edge cases / quirks:** Rear-aspect visibility heavily reduced. The eyeball can sometimes SPOT farther than a zoom optic yet still cannot ID without the optic's magnification (a target may be detected by the eyeball but identified earlier/closer by a camera).
- **Source:** 8wfY7-TT4Xo
- **Confidence:** High

### Detection vs classification/identification as separate stages; passive optical track can guide weapons
- **Models:** Spotting that "something is there" (a bogey, position only) is distinct from classifying WHAT it is; a high-enough passive visual track can guide a weapon with no radar emission at all.
- **Inputs / parameters:** Sensor type and its capability flags (classify? side/IFF info? continuous tracking?); range vs the sensor's ID range; zoom (e.g., 25x binoculars, 20x TV); whether the contact is continuously tracked.
- **Behavior / rules:** A contact progresses DETECTED → CLASSIFIED/IDENTIFIED. Naked eye can detect far (via contrail) but rarely yields ID or a fire-control-quality lock. Dedicated optics improve ID, not search: generic binoculars = 18 nm max, 25x zoom — "binoculars are not for searching, they're for identifying"; they can build a track good enough to "guide a weapon to it without turning on the radar" (cited: SA-19 guided purely visually, no radar signal). A generic 3rd-gen-surveillance TV camera = 30 nm range, 20x zoom, gives side (IFF) info, classify, and CONTINUOUS TRACKING with zero radar emitting. **Speed is NOT obtainable from a passive optical track** ("the only thing we don't have is speed"), and lacking speed you cannot fire certain missiles even with a confident position track.
- **Outputs / effects:** Contact classification/type; track quality (high enough can support weapon guidance); persistence; a remaining speed/velocity gap for passive-only tracks.
- **Edge cases / quirks:** Which sensor reports the ID is shown (e.g., "generic binoculars" vs "Mark-1 eyeball") by range. Continuous tracking is hard to achieve on certain platforms. Passive optical tracking is emphasized as not emitting / not giving you away.
- **Source:** o4bPT47vuK8
- **Confidence:** High

### EO sensor classes, ranges, zoom, and weapon-director vs surveillance roles
- **Models:** Distinct electro-optical classes (TV, low-light TV, FLIR/IR, binoculars) with their own max ranges, zoom, capability flags, and day/night behavior; "weapon-director" optics reach far longer than "surveillance" ones.
- **Inputs / parameters:** Sensor class; listed max range; zoom factor; capability flags (side/IFF, classify, continuous track, auto target acquisition); surveillance vs weapon-director vs surface-search variant; time of day.
- **Behavior / rules:** Database values stated: generic 3rd-gen-surveillance TV = 30 nm, 20x, side info + classify + continuous track. Generic FLIR = 45 nm, 20x, classify + continuous track. Generic binoculars = 18 nm, 25x. The SAME base camera reconfigured as a "weapon detector/director" (vs "surveillance") jumps to ~100 nm range (a "staggering" range); even the 3rd-gen surveillance becomes very long-ranged as a weapon director. Surface-search EO variants are much shorter ranged. Recommendation: pair a FLIR + TV camera for best detection over very long distances.
- **Outputs / effects:** The detection/identification range envelope and capability set a unit brings; loadout choice changes how early and how well contacts are detected.
- **Edge cases / quirks:** Plain (non-low-light) TV at night still saw targets only via contrails; lower targets were invisible. All EO ranges degrade under the time-of-day rule. Capability flags (IFF/classify/continuous-track/auto-acquire) are visible in the database and gate what info you can derive.
- **Source:** o4bPT47vuK8
- **Confidence:** High

### Detect/classify vs identify range separation (database fields)
- **Models:** Each sensor lists a maximum (detection) range and a separate, shorter identification / zoom-detection-classification range; you can detect a contact farther than you can identify it.
- **Inputs / parameters:** Sensor DB fields — maximum range; identification (zoom detection/classification) range.
- **Behavior / rules:** Read from DB: generic LLTV max 30 nm / ID 20 nm; generic FLIR max 45 nm / ID 20 nm; generic TV identical to LLTV minus night capability. The ID number (20) is consistently smaller than max detection range; there is "no limit" beyond which you can't identify other than that listed value.
- **Outputs / effects:** Two distinct ranges per sensor governing first detection vs when classification becomes possible.
- **Edge cases / quirks:** A higher max range (FLIR 45) does NOT translate to earlier real detection because contrail effects dominate; the ID range gates classification independently of detection.
- **Source:** ORRsS2Jx14s
- **Confidence:** High

---

## 2. EO/Visual Sensor Types — Empirical Day/Night & Contrail Behavior

### Visual detection range scales strongly with time of day (day / dawn-dusk / night)
- **Models:** Ambient light governs how far purely-visual sensors (and the naked eye) detect; night roughly quarters the range.
- **Inputs / parameters:** Local lighting phase (full daylight, dawn/dusk/civil twilight, night); ambient light level; sensor type (Mark-1 eyeball, TV, low-light TV, IR/FLIR).
- **Behavior / rules:** Measured against a baseline max daytime spotting distance: full daylight (~12:07 local) detected a contrail contact at ~53 nm (the stated MAX). Night (~22:00) detected at ~15 nm — 15/53 ≈ 25-28%, summarized as "roughly one-quarter (1/4)" effective range, i.e., night ≈ −75%. Dawn/dusk (~05:30, civil twilight) detected at ~35 nm — 35/53 ≈ 66%, summarized as "about 60%." So **day = 100%, dawn/dusk ≈ 60-66%, night ≈ 25%**. Framed as experimental/approximate, not exact constants. Better cameras (TV/FLIR) raise absolute numbers but the day/night PENALTY still applies (a generic TV with 30 nm max detected only ~17 nm at night).
- **Outputs / effects:** Effective visual/optical detection range, setting when a contact first appears and at what range ID becomes possible.
- **Edge cases / quirks:** **Moon phase is NOT a factor** — full moon vs new moon showed no appreciable difference. Day/night terminator, polar perma-day/night arcs, and seasonal lighting are modeled accurately on the globe. IR/FLIR detects hot targets at essentially the same (or slightly farther) range regardless of darkness because "infrared targets are very obvious," but still struggles to RESOLVE/identify until close.
- **Source:** o4bPT47vuK8
- **Confidence:** High

### Contrail-based detection (altitude-dependent long-range visual cue)
- **Models:** Aircraft above a threshold altitude leave contrails detectable at very long range even by crude visible-light sensors; dropping below removes this cue.
- **Inputs / parameters:** Aircraft altitude; visual/EO sensor (only visible-light/EO exploit contrails; IR/FLIR cannot); a scenario toggle to force contrails off.
- **Behavior / rules:** Aircraft generally "mark" (leave a contrail) only at/above ~20,000 ft; below that they generally do not. Contrails let even a Mark-1 eyeball or observation post detect aircraft at extreme range (e.g., a contact at 53 nm in daylight; an observation post flagged it at 53 nm and auto-dropped game speed to 1x). A bomber at 12,000 ft (below threshold) produced "no contrail detected" and was picked up only at ~10 nm. Low-flyers (Blackjack flown low, F-117) are seen only very close. Contrails remain a key long-range cue even at night. With contrails turned off (scenario edit) and target dropped to 12,000 ft, the cue disappears and visible-sensor ranges collapse — lowering altitude is the demonstrated counter to enemy EO.
- **Outputs / effects:** Whether (and at what range) a high-altitude aircraft is detectable by contrail vs requiring close approach; large detection-range swings when contrails are present vs absent.
- **Edge cases / quirks:** A contrail gives only crude info — you know something is up there but typically can't ID it or get a fire-control lock from the contrail alone. Only visible-light/EO sensors benefit; IR/FLIR never report a contrail. Contrail strength is qualitative ("really really small contrail" on some). Scenario authors can toggle contrails off entirely.
- **Source:** o4bPT47vuK8, ORRsS2Jx14s
- **Confidence:** High

### TV camera (daylight, contrail-sensitive)
- **Models:** A passive EO TV camera detects by visible light and can spot high-altitude aircraft by their contrails at long range.
- **Inputs / parameters:** Camera type (generic 3rd-gen surveillance TV); time of day / ambient light; contrail presence (altitude-dependent); weather; bearing/range.
- **Behavior / rules:** In daylight a generic TV detected a bogey at ~28 nm, picking it up by contrail at 50°. Relies on visible light, so contrails greatly extend range vs high fliers. At night it is degraded but "not completely useless" — still picked up a "very large contrail" at ~10 nm. Its detection/classification/ID ranges match the LLTV exactly except the LLTV adds night-vision (so by day plain TV and LLTV detect at the same distance).
- **Outputs / effects:** Detection range/bearing; contrail-based long-range pickups; reduced range at night.
- **Edge cases / quirks:** Effective only with enough light and/or a contrail; loses the contrail advantage if the target drops below contrail altitude; identical DB ranges to LLTV minus the night capability.
- **Source:** ORRsS2Jx14s
- **Confidence:** High

### Low-Light TV (LLTV) — night-capable + contrail-sensitive, longest practical range
- **Models:** Combines visible-light contrail detection with night vision — long-range contrail pickups even in darkness and poor weather.
- **Inputs / parameters:** Camera type (generic LLTV, max 30 nm, ID/zoom-detection-classification 20); ambient light; contrails; weather (rain).
- **Behavior / rules:** By day, LLTV detected at the same range as the regular TV (~26-27 nm) because both exploit contrails. At night it still detected at ~27 nm — "the same range we picked them up during the day" — via night vision + contrail visibility. In a 4-way contest (TV/IR/LLTV/FLIR) under heavy rain at 1 AM, LLTV detected the bomber FIRST by its large contrail. With the contrail off and target at 12,000 ft, LLTV STILL detected it through heavy rain and dark when others did not. DB: max 30 nm; ID (zoom detection/classification) 20 nm.
- **Outputs / effects:** Earliest/longest detections in adverse light and weather; detect-vs-identify ranges differ (30 vs 20 nm).
- **Edge cases / quirks:** Identical to plain TV in DB except for night capability; the stealthiest passive choice ("when you don't want people to know you're looking"); detection range (30) exceeds ID range (20).
- **Source:** ORRsS2Jx14s
- **Confidence:** High

### Infrared (IR) camera — heat-based, day or night, shorter range, no contrail
- **Models:** Detects by heat/thermal signature, so it works at night but sees the airframe (not contrails) at substantially shorter range.
- **Inputs / parameters:** Camera type (generic 3rd-gen IR); target thermal signature/airframe; range (independent of day/night).
- **Behavior / rules:** Swapping to IR "substantially reduced" detection range vs TV. Detects by the target's "physical existence"/airframe, NOT contrail. Day vs night give essentially the SAME distance (matched "almost to the 0.1 nautical mile"). Myth corrected: a fancy IR camera does NOT see farther than a TV against contrailing high-altitude targets.
- **Outputs / effects:** Detection range/bearing by thermal signature; consistent range day or night; no contrail extension.
- **Edge cases / quirks:** Loses the long-range contrail pickups TV/LLTV get; shorter than visible cameras vs high-altitude contrailing aircraft; works equally at night.
- **Source:** ORRsS2Jx14s
- **Confidence:** High

### Forward-Looking Infrared (FLIR) — night-capable but ~half range, no contrail
- **Models:** A thermal night sensor that, despite reputation, detects at only ~half the range of TV/LLTV vs contrailing high-altitude targets and cannot exploit contrails.
- **Inputs / parameters:** Camera type (generic FLIR, max 45 nm, ID/zoom-detection-classification 20 nm); thermal signature; range.
- **Behavior / rules:** FLIR "picked them up once again at half the distance we did with our cameras" — far shorter than contrail-aided TV/LLTV. Shares the IR limitation: no contrail detection. Counter-intuitively, its DB max range (45 nm) is LARGER than LLTV's (30 nm), yet in practice it detects later — the cameras' real advantage comes from contrails, not listed max range. ID (zoom detection/classification) range = 20 nm.
- **Outputs / effects:** Shorter practical detection range vs contrailing targets despite a higher catalog max range; thermal night detection without contrail benefit.
- **Edge cases / quirks:** Big myth-buster — higher listed max range does NOT mean earlier detection; vs contrailing high fliers the contrail-blind FLIR loses to TV/LLTV; detect range (45) exceeds ID range (20).
- **Source:** ORRsS2Jx14s
- **Confidence:** High

---

## 3. Environmental & Geometric Penalties on Sensors

### Weather / cloud-layer occlusion of optical & IR sensors
- **Models:** Clouds and weather between sensor and target block visual/IR line of sight; radar is not blocked the same way.
- **Inputs / parameters:** Cloud-layer altitude band (e.g., clouds at ~20,000-25,000 ft); sensor type (optical/IR affected); aircraft altitude relative to cloud base; rain intensity; cloud cover.
- **Behavior / rules:** A cloud layer between sensor and target blocks optical/IR. Demonstrated: at 12 nm with buildings present, none were visible due to intervening clouds; fix is to drop below the layer before using FLIR/cameras (presenter repeatedly maneuvers under cloud to restore the view). In the EO-comparison test, heavy rain was used but clouds were deliberately omitted because "we're not going to be able to see it at all" with clouds — implying cloud cover blocks EO detection entirely; under heavy rain at night, LLTV still detected while other EO types struggled (rain degrades but does not equally blind all EO).
- **Outputs / effects:** Optical/IR detection suppressed until the line of sight is clear of cloud; flying below restores acquisition; rain reduces EO performance; clouds can cause total EO loss.
- **Edge cases / quirks:** Qualitative only (no transmittance numbers). Radar still works above clouds (F-18/Eurofighter examples). LLTV is the most rain-resistant of the four EO sensors.
- **Source:** 8wfY7-TT4Xo, ORRsS2Jx14s
- **Confidence:** High

### Slant-range / oblique-aspect penalty for airborne visual sensors
- **Models:** An aircraft looking down at a surface target sees it at an oblique angle, not a clean side/top profile, degrading detection.
- **Inputs / parameters:** Sensor altitude and horizontal distance (the look-down/oblique geometry); whether the sensor is cued.
- **Behavior / rules:** At altitude the target is viewed at an oblique angle (not flat side or top), harder to resolve. Combined with no cue, an uncued high airborne sensor "won't be able to see it until we get a lot closer." Demonstrated: a Harrier with a 30 nm-capable pod picked up/IDed targets only at ~22.3 nm uncued, with engageable confidence only at ~15 nm (the critical engage distance for that pod).
- **Outputs / effects:** Effective acquisition range shortened relative to the flat-aspect database number when viewing from an oblique/elevated geometry.
- **Edge cases / quirks:** Qualitative — no formula for the slant penalty. Engage-quality ID appeared at a specific critical distance (15 nm) matching a stored pod value.
- **Source:** A7oqIAMhKF8
- **Confidence:** Med

### Terrain / land-cover identification penalty
- **Models:** Ground clutter / land-cover type adds difficulty to identifying surface targets.
- **Inputs / parameters:** Land-cover type under the target (e.g., cropland); range.
- **Behavior / rules:** Identifying ground targets carries a land-cover-dependent penalty. Cropland is described as NOT having a "massive penalty," implying other terrains impose larger penalties; even so the aircraft had to close to ~1.5 nm to read side affiliation in cropland.
- **Outputs / effects:** Modifies the close-in identification range required for ground targets.
- **Edge cases / quirks:** Only cropland (low penalty) is quantified by comparison; heavier-clutter terrains implied worse but unspecified.
- **Source:** 8wfY7-TT4Xo
- **Confidence:** Med

### Sensor scan rate / revisit interval
- **Models:** How frequently a search sensor sweeps its field, affecting how quickly it notices things.
- **Inputs / parameters:** Sensor "scannage" value in seconds (e.g., 10).
- **Behavior / rules:** Each search sensor has a scan interval; the Harrier TIALD is "scannage of 10" — one full look-around every 10 seconds. Faster scan = quicker detection opportunities.
- **Outputs / effects:** Governs detection latency / how often a sensor gets a chance to acquire contacts.
- **Edge cases / quirks:** Only one example value given; interacts with the search-vs-cued mechanic (uncued searching is slow).
- **Source:** A7oqIAMhKF8
- **Confidence:** Med

---

## 4. Radar Detection Model — RCS, Range Scaling, Track Formation

### Radar detection fidelity scales with radar generation (detect vs locate vs classify-parked-units)
- **Models:** More modern radars yield progressively richer information about a contact, from mere presence up to identifying individual units parked on a deck/airfield.
- **Inputs / parameters:** Radar generation/era; type (mechanically scanned vs phased/AESA); band/wavelength; range; line of sight; cloud/weather (radar penetrates clouds).
- **Behavior / rules:** Three explicit fidelity tiers by generation: (1) OLDER/early radars (e.g., APS-139 on E-2A/E-2C) only tell you "something is there" — a blob of unclear contacts, "worthless from a targeting perspective"; closing range improves it only slightly. (2) SLIGHTLY NEWER radars tell you specifically WHERE something is and roughly what TYPE. (3) LATEST phased-array/AESA (e.g., AN/APY-9 on E-2D, J-STARS, F-35 nose radar) are precise enough to (a) detect ships immediately at long range, (b) determine a ship is aircraft-carrying AND count how many aircraft are on its deck and even ID the TYPE of those parked aircraft, (c) identify ground units and moored buoys with attached cruisers, all through cloud. Modern radars carry IFF, classification, and NCTR (Non-Cooperative Target Recognition — ID a specific aircraft type by its engines). Detection ("spotted") precedes identification ("identified") — even powerful radar may spot before it can fully ID.
- **Outputs / effects:** Contact detection state, position accuracy, type/classification fidelity, and (AESA) the count and type of sub-units (aircraft on deck, etc.).
- **Edge cases / quirks:** Radar sees through clouds (unlike visual). J-STARS/AESA work best at a 90° (broadside) aspect to the target — noted as real-world, "might be a little bit different inside the Sim." Turning a radar OFF loses the contacts it was providing (info decays). A ship's own name is hard to get from radar alone unless that ship turns its radar on.
- **Source:** agqnyM3Hwkg
- **Confidence:** High

### Radar cross-section modeled per aspect (front/side/rear/bottom) in m²
- **Models:** Each aircraft has direction-dependent RCS values that determine detection range from that angle.
- **Inputs / parameters:** Per-aspect RCS from the database (front, side, rear, bottom); current presented aspect; loadout.
- **Behavior / rules:** DB entries list RCS by aspect. F-16: front 4.65 dBsm/m², side 2.9 m², rear 4.7 m² (numbers as stated, units imperfect in transcript). F-104: nose 2.7 m², side 6.5, rear 2.7 — nose slightly smaller than the F-16, and the F-104 was detected slightly closer. Aircraft also have a bottom aspect, the widest part, more visible directly under/closer. External loadouts dramatically increase RCS (e.g., GBU-49s make the value "massive"); internal carriage keeps it small.
- **Outputs / effects:** Detection range per contact scales with the RCS of the aspect currently presented to the radar.
- **Edge cases / quirks:** Real radars use "splat plots" of detectability vs angle; the optimal stealth approach angle is classified and not exposed in CMO. Loadout selection visibly changes the RCS field in the editor.
- **Source:** 1r4P_gI-Pdw
- **Confidence:** High

### Detection range scales weakly with RCS for a high-power radar (small % per aspect change)
- **Models:** Against a very high-power EWR, large RCS differences produce only small detection-range differences (radar-range-equation fourth-root behavior).
- **Inputs / parameters:** Target RCS (aspect/type); radar transmit power (P-37: 250 nmi rated, "probably instrumented ~200").
- **Behavior / rules:** Observed vs the P-37: F-16 at 211 nmi, F-104 at 207 nmi → 207/211 ≈ "2% difference." Side-aspect copies at 212 and 210; 209/213 ≈ "2%" again. Changing aspect alone shifted range only ~2-3% — "just because you've changed your aspect doesn't guarantee you won't be detected by high raw-power early-warning radars." Per-aspect RCS differences map to only a few nautical miles at ~250 nmi.
- **Outputs / effects:** Detection-range deltas of only ~2-3% from aspect alone against a powerful radar.
- **Edge cases / quirks:** "Don't know the actual minutia of the calculation." Earth curvature would block the radar's full range when zoomed out but is ignored in the demo. The weak scaling is why aspect alone is unreliable concealment.
- **Source:** 1r4P_gI-Pdw
- **Confidence:** High

### Track formation requires multiple sweeps; refresh follows scan interval
- **Models:** Initial contact appears on the first sweep; identification/track requires the beam to come around again, and data refreshes each scan period.
- **Inputs / parameters:** Radar scan/rotation interval (P-37 interval = 10 s); elapsed time.
- **Behavior / rules:** New contacts pop immediately on first illumination, but "to identify a track you have to make the radar go around twice." With interval 10, the next refresh (range/speed/heading) comes 10 s later (~13 s into the scenario), when the engine "runs the math" for speed (~350 kn), altitude (~36,000 ft), and range. A message-log option ("new air contact" balloon) plus "reduce to 1x on new contact" auto-slows the game and raises a balloon on detection.
- **Outputs / effects:** Contact → identified track over ≥2 sweeps; periodic kinematic updates at the scan interval.
- **Edge cases / quirks:** The auto-1x-on-new-contact and balloon features are quality-of-life options, not detection physics; the two-sweep + interval gating is the detection mechanic.
- **Source:** 1r4P_gI-Pdw
- **Confidence:** High

### Doppler / receding-target handling
- **Models:** Radars use Doppler shift to reject clutter (stationary/slow returns) and may detect inbound targets better than outbound ones.
- **Inputs / parameters:** Target radial velocity (closing vs receding); radar Doppler-processing characteristics.
- **Behavior / rules:** Doppler clutter rejection keeps returns shifting toward the radar (closing) and filters those shifting away (receding) or near-zero (ground clutter at ~10 kn), which is how fast movers like an F-35 ("600 mph mosquito") are picked out. "In some other systems receding targets are harder to detect" because the radar looks for closing shift. However, for the specific P-37 tested, receding-target max detection range (~211 nmi) was "almost exactly the same" as closing — so for THIS radar closing vs receding range was about equal.
- **Outputs / effects:** Clutter filtered by Doppler; for some radars receding contacts detected at shorter range (not demonstrated on P-37).
- **Edge cases / quirks:** Presenter does NOT know the P-37's exact calculation and says the receding-harder effect is true of "some other systems," not confirmed here — the asymmetric-range claim is qualitative/uncertain.
- **Source:** 1r4P_gI-Pdw
- **Confidence:** Med

### Radar look-down (beam depression) limitation
- **Models:** A radar beam cannot point straight down, so contacts are lost when the aircraft is nearly overhead.
- **Inputs / parameters:** Aircraft position relative to target (overhead vs offset); radar beam/electronic look-down limit.
- **Behavior / rules:** Flying directly over ground targets, the radar loses "everybody" because it "can't point straight down" — the physical/electronic beam limit. Contacts drop off when the platform is overhead.
- **Outputs / effects:** Temporary loss of radar contact on targets directly beneath the aircraft.
- **Edge cases / quirks:** Affects radar specifically (Eurofighter example); does not necessarily affect downward-looking cameras the same way.
- **Source:** 8wfY7-TT4Xo
- **Confidence:** High

### Altitude / terrain masking via Earth curvature (radar horizon)
- **Models:** Flying low lets a target use Earth curvature/terrain to delay or avoid detection.
- **Inputs / parameters:** Target altitude; range; radar horizon (Earth curvature).
- **Behavior / rules:** An F-35 (stealthy, internal 4 missiles) was first detected at 14.99 nmi — nearly the same as the non-stealth jammer — because at close range the wide bottom aspect becomes visible. Dropping the F-35 to "low dangerous altitude" adds the benefit of using Earth curvature (radar horizon) on top of low RCS. The wide bottom aspect is why stealth alone gave only a small (~5-8%, "not even 5%") extra detection reduction at close range.
- **Outputs / effects:** Low altitude reduces effective detection range via radar horizon; bottom aspect limits how stealthy a close target stays.
- **Edge cases / quirks:** Stealth's benefit shrinks at close range because the bottom (widest) aspect dominates; curvature benefit is qualitative here (no numbers).
- **Source:** 1r4P_gI-Pdw
- **Confidence:** Med

---

## 5. ESM / Passive Emitter Geolocation

### ESM passive detection: directional bearing with range ambiguity (a widening cone)
- **Models:** A single ESM receiver knows the emitter's direction but not range, so position is a wide arc/cone that widens with distance.
- **Inputs / parameters:** Emitter emitting (radar must be on); detecting platform's ESM receiver beam width; range to emitter.
- **Behavior / rules:** A single ESM platform detects the emitter whenever its receive beam touches the signal. The fixed angular beam width makes the detected position an arc of ambiguity along the bearing — drawn as a cone: at short range the target is wide relative to the beam so position (even size) is confident; as range grows the same beam covers a larger physical span, so ambiguity grows. Left-clicking the contact shows multiple possible emitter-type reports (e.g., "BP-37 or 5N64 Big Bird"). Common-sense terrain reasoning (radars sit on high ground) is operator-side, not modeled.
- **Outputs / effects:** An ambiguous contact drawn as a cone/arc along the bearing; a candidate emitter-type list; no firing-quality fix from one platform.
- **Edge cases / quirks:** Beam width is a receiver-tech property (1970s "simple ESM" has a huge cone; late-2000s HTS pod is very tight). Antennas live in different airframe locations with different sensitivity — acknowledged as real but largely abstracted by CMO.
- **Source:** cQ6PGSl8Yuw
- **Confidence:** High

### Multi-platform ESM triangulation (intersection of cones)
- **Models:** Two or more separated receivers each give a bearing-cone; the emitter lies in the overlap, so adding receivers narrows the fix.
- **Inputs / parameters:** Number of ESM platforms; their geographic separation; each receiver's beam width/quality; range to emitter; closure over time.
- **Behavior / rules:** One F-16 = one cone. A second F-16 from a different position = a second cone; the location collapses to the intersection ("substantially shrunk"). A third forms the classic navigation triangle and "confirms" position but adds only marginal precision because each platform keeps the same fixed detector-square size at long range. A fourth helps a 4th cone bisect the others. Precision improves more from getting closer than from adding platforms (the beam tightens with reduced range). Quantitatively the uncertainty box shrank from ~1 mile wide → ~0.5 mi → ~1/3 mi → about 0.1 by 0.4 (units left ambiguous) as the F-16s closed to ~62, then ~30, then ~5-8 nmi.
- **Outputs / effects:** Progressively smaller uncertainty ellipse/box; eventually a firing-quality-ish fix at close range.
- **Edge cases / quirks:** Three high-tech HTS platforms at long range still did NOT give a true firing solution; geometry matters (a new cone must cross obliquely to help). A non-emitting target is far harder — triangulation depends on the target emitting.
- **Source:** cQ6PGSl8Yuw
- **Confidence:** High

### Receiver/sensor generation sets ESM fix precision
- **Models:** A modern dedicated ESM pod gives a far tighter bearing than an old generic ESM receiver, independent of platform count.
- **Inputs / parameters:** Receiver type/era (e.g., HTS pod late-2000s vs "1970s simple ESM"); number of receivers.
- **Behavior / rules:** F-16s with the HTS pod (precise, sophisticated harm-targeting, "not 1970s YOLO detection") produce a narrow cone and at ~5-8 nmi give a near-firing-quality fix. Re-running with an F-5E fitted with a manually-added "1970s simple ESM" receiver produces a giant cone of uncertainty; even three F-5s only localize the emitter to "somewhere in Iceland." Removing the F-5's two better receivers so the bad one dominates shows the worst receiver/era governs the result.
- **Outputs / effects:** Cone width and resulting fix accuracy scale with receiver era/quality.
- **Edge cases / quirks:** You can add/remove individual receivers on a platform in the editor; a single poor receiver can dominate. Mixing in a good radar platform (e.g., F-18E phased-array) gives the best fix and saves ammunition vs pure ESM.
- **Source:** cQ6PGSl8Yuw
- **Confidence:** High

### Manual (area) attack against an ambiguous ESM/positional contact
- **Models:** You can fire ballistic/strike weapons at a guessed point or pattern over an uncertainty area; hits depend on the weapon's lethal radius vs the uncertainty size.
- **Inputs / parameters:** Uncertainty-box size; weapon (Iskander/SS-26); number of weapons; aim point(s) chosen by the operator; target hardness/state.
- **Behavior / rules:** With the target localized only to an ambiguous box, use manual engagement (Ctrl-F1 / manual-aimpoint) and "guess" a point in the middle, or pepper multiple aimpoints across the area like a grenade launcher. Firing 8 missiles into one spot of a ~1-mile box missed; the target died only once the box shrank to ~1/3 mile AND missiles were spread across several aimpoints. A "1970s simple ESM" fix was too coarse — 8 SS-26 spread across the region did zero damage (confirmed by switching teams to inspect).
- **Outputs / effects:** Weapons impact chosen aimpoints; target destroyed only if an aimpoint lands within lethal radius of the true position.
- **Edge cases / quirks:** 30 nmi cited as a sensible standoff. Presenter wishes the UI marked where manual-attack aimpoints land. For nuclear weapons you only need the target's general state since the blast "evaporates" it. Within ~8 nmi with a good sensor, even in bad weather, manual ESM attack succeeds.
- **Source:** cQ6PGSl8Yuw
- **Confidence:** Med

### Visual ID is a separate, weather-gated sensor distinct from ESM
- **Models:** Crews can visually ID/precisely locate a target even at night, but cloud cover/weather denies the visual sensor, falling back to the coarser ESM-only fix.
- **Inputs / parameters:** Day/night; weather/cloud cover; range; target.
- **Behavior / rules:** When the F-16s closed, the precise fix and the target's identity actually came from VISUAL identification (shown in unit detail), not ESM — even at the middle of the night. Cranking up the clouds then loses the target completely; it must be re-acquired by ESM only, which is far less precise. CMO resolves the most precise/identified sensor source, and visual is environment-dependent.
- **Outputs / effects:** Identification flag and precise position come from visual when available; revert to a coarse ESM fix when visual is denied.
- **Edge cases / quirks:** Night did NOT block visual by itself; heavy clouds did. The "identified" status is attributed to the specific sensor that achieved it.
- **Source:** cQ6PGSl8Yuw
- **Confidence:** High

---

## 6. OECM / Noise Jamming

### A radar must be energized (emitting) to be jammed
- **Models:** Offensive/noise jamming only affects radars actively transmitting; a powered-down radar cannot be jammed (and also can't detect).
- **Inputs / parameters:** Radar on/off (energized) state; jammer active.
- **Behavior / rules:** With the OECM jammer (SAP-518) on but all enemy radars off, "nothing bad happens" — "a radar must be energized to be jammed." Once radars switch on, in-band ones are jammed "instantaneously." Shutting a radar off removes it as both a sensor and a jamming target.
- **Outputs / effects:** Jamming effect applies only to emitting radars; off radars are unaffected and contribute no tracks.
- **Edge cases / quirks:** Presenter flags the real world is more nuanced; CMO simplifies to an on/off energized state.
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

### Jamming is frequency-band specific (jammer band must overlap radar band)
- **Models:** A jammer only degrades radars whose operating band it covers; out-of-band radars are completely unaffected.
- **Inputs / parameters:** Jammer's covered bands; each radar's operating band(s).
- **Behavior / rules:** The SAP-518 OECM pod covers only G/H/I/J. Activated against a multi-band radar set: the I-band High Screen and G-band Dog Ear are jammed; the B-band EWR (Tall Rack, ~329 mile range) and the E/F-band TPS-43 are completely unaffected and keep identifying targets/altitude. You must jam the band the radar actually uses or you "never get a success at blocking that radar." The wideband ALQ-99E on the EF-111 Raven jams across the whole spectrum (with some exceptions in the radio-frequency range), so it jams every radar at once.
- **Outputs / effects:** Per-radar jam status set only for radars whose band intersects the jammer's bands.
- **Edge cases / quirks:** Real jammers have narrow bandwidth — covering one band (e.g., G) wouldn't cover others; a single device spanning B/G/I is "really impressive" tech and the presenter is "not 100% sure how accurate" CMO's wideband modeling is. The TPS-43 here operates on two bands (E and F).
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

### Jamming degrades but does not fully blind a radar; tracks can still form
- **Models:** Being "jammed" means receiving jamming, not being blanked — radars may still detect/track/identify through noise jamming.
- **Inputs / parameters:** Radar jammed-state; radar capability/era; target line-of-sight to jammer.
- **Behavior / rules:** Even jammed radars "have no issue identifying these targets, getting altitude." "Just because you're jammed doesn't mean you're completely jammed." A jammed display shows a line down the screen and "three boxes down the center" indicating tracking is being made difficult; modern radars are not reduced to 1950s "spaghetti." Even with non-jammed radars off, targets are still detectable. This jamming type "works best on the thing it's jamming for," not blanking whole sectors.
- **Outputs / effects:** Jam indicator (strobe line + center boxes) shown; tracking/ID may persist depending on radar and geometry.
- **Edge cases / quirks:** The platform doing the jamming itself drops off scope (its own emissions mask its position).
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

### Jamming protection depends on jammer→radar line of sight
- **Models:** A standoff jammer only protects targets that lie behind it relative to the radar; targets outside the jammer's line of sight remain trackable.
- **Inputs / parameters:** Relative positions of jammer, protected target, and radar (line of sight).
- **Behavior / rules:** With the jammer off to one side, a bogey not in the jammer's line of sight to the radar stays acquirable, while those screened by the jammer are degraded. Moving the jammer between the radar and the targets dropped those targets off the network; shifting geometry (target rounding a corner) restored line of sight and re-acquired them.
- **Outputs / effects:** Per-target detectability toggles as jammer-target-radar geometry changes.
- **Edge cases / quirks:** Demonstrated by repositioning the jammer (Ctrl-V/Ctrl-B) to interpose it between sensor and targets.
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

### Burn-through: high radar power and/or shorter range defeats jamming
- **Models:** Powerful radars "burn through" jamming at closer ranges; jamming wins as range increases or radar power drops.
- **Inputs / parameters:** Radar transmit power; jammer-to-radar range; jammer power.
- **Behavior / rules:** The high-power Tall Rack EWR locks the wideband EF-111 "easily" because "the power output of the tall rack is extremely high" — it burns through. Turning that radar off loses the EF-111 "completely" because no remaining radar has "the sheer power to burn through the jamming at this range." Sending the jamming aircraft farther out to sea makes them harder to pick up because "the power of the jamming would overwhelm them" at longer range.
- **Outputs / effects:** Detection/track maintained when radar power overcomes jamming at a given range; lost otherwise.
- **Edge cases / quirks:** A power-vs-range balance; no explicit formula given (qualitative).
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

### Aspect/RCS modulates jamming effectiveness (synchronized aspect + jamming denies quality track)
- **Models:** Lower RCS (nose-on) combined with jamming pushes a contact into positional ambiguity; broadside exposure restores track.
- **Inputs / parameters:** Target aspect (RCS presented); jamming active; geometry.
- **Behavior / rules:** While broadside the radar had no trouble identifying the jamming aircraft, but rotating to a smaller cross-section makes the ambiguity "kick in." With both jammers on, synchronizing minimum-RCS aspect with jamming creates a "sweet spot" where it is "very very difficult to get a quality track for the purposes of actually engaging." Same RCS-by-aspect effect compounding with noise jamming.
- **Outputs / effects:** Track quality oscillates with aspect; can drop below engageable threshold at minimum-RCS + jamming.
- **Edge cases / quirks:** Effect appears cyclic as the aircraft turns (the "interesting R" pattern). See the RCS-by-aspect mechanic (§4) for the underlying numbers.
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

### Noise jamming + low RCS stack (multiplicative detection-range reduction)
- **Models:** Jamming and low cross-section stack: each alone is modest, but together they cut detection range far more.
- **Inputs / parameters:** Noise jammer active; target RCS/aspect; line of sight; range.
- **Behavior / rules:** Aspect alone gave ~2% range change. Adding noise jamming: a side-aspect target screened by a jammer dropped completely off the net until line of sight shifted. Nose-aspect + jamming on the F-16 cut detection ~211 → 202 nmi (202/212 ≈ 5% off). On the F-104, detection fell ~207 → 187 nmi — a "10% detection reduction" (~20-25 miles). Conclusion: "jamming plus stealth is the greatest thing ever invented"; the ~2-3% aspect effect "suddenly becomes a 10% reduction" once jamming is added.
- **Outputs / effects:** Detection range reduced ~5-10% (aspect + jamming) vs ~2-3% (aspect alone); contacts can be lost entirely.
- **Edge cases / quirks:** Even with jamming the powerful P-37 still eventually detected closing targets (jamming is "finger-quote jammed" — receiving jamming, not blinded). The 10% reduction is decisive for getting inside an S-300 / weapon-release range.
- **Source:** 1r4P_gI-Pdw
- **Confidence:** High

### Jamming-aircraft survivability via aspect management (minimize side exposure)
- **Models:** A jammer is detected at longer range when showing its side; flying nose-on (thin back-and-forth legs) minimizes detection and keeps it alive.
- **Inputs / parameters:** Jammer flight path/track geometry relative to the radar; aspect presented over time.
- **Behavior / rules:** A jammer flown straight at the radar (nose-on) was detected at ~17 nmi; ones on zig-zag/oblique paths exposing their side were detected farther — 22 nmi (a 5 nmi difference) and 18 nmi. To protect the jammer, design a racetrack that keeps a thin (nose/tail) aspect toward the threat as much as possible, with only brief side exposure at the turns. Nose-on tracks beat broadside "in every way" for survivability, at the cost of less jamming width — mitigated by flying parallel tracks.
- **Outputs / effects:** Jammer detection range varies with exposed aspect; track shaping trades width for survivability.
- **Edge cases / quirks:** Confirmed "by design, not a bug." Same RCS-by-aspect physics as the detectability mechanic, applied to friendly jammers.
- **Source:** 1r4P_gI-Pdw
- **Confidence:** High

### Search vs fire-control radar vs weapon seeker — distinct, concentrated bands resist jamming
- **Models:** Attack/fire-control radars and missile seekers occupy distinct (often higher) bands than search radars and are far more concentrated/harder to jam.
- **Inputs / parameters:** System role (search vs track/engage vs weapon seeker); band per component.
- **Behavior / rules:** SA-21: the Cheese Board air-search radar is on G/H; the Gravestone engagement radar is on G (search/track) and I (for the kill). "Most jammers work on those frequencies." Ordering an engagement, the SA-21 still got "more than a quality track" and launched despite jamming — fire-control radars are "very concentrated" vs conventional search radars. The launched missile's seeker is on the I band — so a jammer not covering I-band would be "a waste of time" against the seeker.
- **Outputs / effects:** Engagement proceeds if jamming misses the FCR/seeker band; the concentrated FCR beam resists jamming.
- **Edge cases / quirks:** Targets that ran ("runners") weren't run down — even with full jamming the side denied a "free cheap shot." Electronic-attack decoys (spoofing multiple false self-copies) are NOT simulated in CMO at this time.
- **Source:** BIiSHFYKFQ8
- **Confidence:** High

---

## 7. DECM / Defensive Deception Jamming

### DECM jam success is a probability roll (DECM generation vs weapon/seeker generation)
- **Models:** Defensive ECM never hides the platform or stops a launch — per incoming weapon it rolls a probability to spoil that weapon's terminal hit, set by the technology-generation matchup.
- **Inputs / parameters:** DECM device generation/era (e.g., 1970s, 2020s); the incoming WEAPON's generation (the matchup uses the weapon's generation, since the seeker itself may carry no generation tag) or the seeker's generation when present (e.g., early-2010s active radar seeker); a random roll (percentile/d100).
- **Behavior / rules:** Per incoming missile the engine computes a jam probability from the DECM-vs-weapon generation gap, then rolls; under the probability the jam SUCCEEDS (weapon misses), else it FAILS and the weapon proceeds to its own hit roll. Verbatim examples: 1970s generic DECM vs 1950s-tech SA-1 weapon ≈ 20% ("about 20%", "one in five"); rolls shown — 79 → fail; later a success on a 1-in-5; on a separate weapon failed with an 81 (needed 20%) then the weapon's own hit roll needed 25, rolled 5 → hit. Upgrading the aircraft's DECM to 2020s tech vs the same 1950s weapon raised jam chance to 35%. Flipping it: an early-2010s active-radar seeker (modern SAM, e.g., SA-21/"SA-27" family) vs the OLD 1970s generic DECM drove jam chance DOWN to 5% (from a prior ~15%) — the modern seeker is that much better. Two separate rolls per engagement: the DECM jam roll, then (if jam fails) the weapon's own probability-of-hit roll.
- **Outputs / effects:** A success/fail jam result per incoming weapon, modifying that weapon's clean-hit chance; on failure, the normal weapon hit-probability roll resolves the engagement.
- **Edge cases / quirks:** GROUND-TRUTH RULE: "the missile seeker will ALWAYS do better than the DECM." DECM "does not give you away" (no emission penalty). DECM does NOT prevent launch and does NOT stop the missile from tracking — it only reduces clean-hit probability and makes the last point of contact ambiguous. The seeker may carry no generation tag while the weapon does — use the weapon's generation then. Even maxed 2020s DECM can still be hit (a weak SAM with a 1-in-4 hit chance can still eventually connect). Numbers are the engine's computed/shown probabilities.
- **Source:** Wu01igw5w9I
- **Confidence:** High

### DECM techniques modeled (range-gate pull-off, side-lobe/angle deception)
- **Models:** DECM works by corrupting the weapon's final track geometry rather than blanket-noise hiding (the older OECM approach).
- **Inputs / parameters:** DECM type/generation; the weapon's tracking mode (range lock, angle lock); engagement phase (terminal/last seconds).
- **Behavior / rules:** DECM is explicitly distinguished from OECM: early ECM/OECM tried to "be the loudest noise in the room"; DECM instead makes the LAST point of contact ambiguous. Modeled techniques: (1) Range-Gate Pull-Off — once locked in range, broaden/widen your blip and drag the range gate off you; (2) side-lobe / angle deception ("side-lo") — trick the weapon into thinking you're slightly left/right of true; (3) modern 2020s DECM uses digital automatic emitter ID and dynamically switches methods constantly, likely via a phased array, to block the seeker. These are the in-fiction rationale for the jam-probability roll.
- **Outputs / effects:** An ambiguous terminal track that, on a successful jam roll, causes a miss; no change to platform detectability.
- **Edge cases / quirks:** Effectiveness still resolves to the generation-vs-generation roll; the technique description is qualitative flavor. DECM is terminal/last-couple-seconds focused.
- **Source:** Wu01igw5w9I
- **Confidence:** Med

### Stacked / multi-platform DECM (every emitter gets one jam attempt per weapon)
- **Models:** Stacking many jammers multiplies the chances to spoil each missile; a single successful jammer is enough.
- **Inputs / parameters:** Number of distinct DECM devices on the platform; each device's individual jam probability (per its generation matchup); per-device random rolls.
- **Behavior / rules:** When DECM triggers, the engine fires EVERY DECM device on that platform, each getting one independent shot at the incoming missile. "It only takes ONE successful platform/jammer to actually work." Demonstrated by loading a 737 with many generic DECM units: each rolled once; the engine showed a final combined success probability of ~one-in-four ("about a 1-in-4 chance"; estimated ~78% over the sequence), and the attacker "had to get through every single one of these jammers," forcing it through many missiles before connecting. Extrapolation: combine with OECM platforms and chaff to build an aircraft "you literally cannot shoot down with a missile."
- **Outputs / effects:** An aggregate per-missile jam outcome combining all onboard jammers (each independently attempting); dramatically increased missiles-to-kill.
- **Edge cases / quirks:** Each device's chance is still bounded by its own generation-vs-weapon matchup (old DECM vs modern seeker stays low even stacked). Framed as a (semi-cheaty) scenario-design trick. OECM and chaff are additional, separate countermeasure layers that compound.
- **Source:** Wu01igw5w9I
- **Confidence:** Med

### Active jammer defeats incoming radar-homing missiles (probabilistic, in flight)
- **Models:** An onboard jammer attempts to defeat each incoming radar-guided missile via a probability roll; success breaks the engagement, failure lets it through.
- **Inputs / parameters:** Jammer present/active on target; missile guidance type (radar); a per-missile roll ("rolled the 74").
- **Behavior / rules:** Stealth targets' jammer was "incredibly successful," defeating most SARH missiles fired at them. One missile connected when the jammer "tried to jam but failed — you rolled the 74 that time," indicating each missile gets an independent randomized jam check.
- **Outputs / effects:** Most radar-guided shots defeated by jamming; an occasional failed jam lets a missile hit.
- **Edge cases / quirks:** Explicitly a random roll per engagement; combined with stealth it makes the target nearly invulnerable to the chosen SARH weapon. (Same family of mechanic as the DECM jam roll above, observed in a SARH-vs-stealth context.)
- **Source:** f9qHbpGR6oA
- **Confidence:** Med

---

## 8. Decoys (Weapons, Units, and Flags)

### Decoy missiles/seducers — kinematics & slow-speed limitation
- **Models:** Air-launched decoys that mimic aircraft to draw SAM engagements, but slow and high-flying.
- **Inputs / parameters:** Decoy speed (~480 kt in the demo); decoy altitude (matched escort at 36,000 ft); decoy launch aimpoint.
- **Behavior / rules:** Decoys fly at fixed modest speed (480 kt). To convince a HUMAN they should fly formation with a real aircraft at matched speed/altitude (the F-16 slowed to 450-480 to match). Being slow, against a competent crew with time they "all get shot down before they're effective." Primarily useful to waste interceptors / occupy a sector (see deflection and threat-sector rules in §10) while a real attacker repositions. Best aimed just outside the SAM minimum range, not at the target.
- **Outputs / effects:** Generates additional radar contacts that draw and waste enemy missiles/attention.
- **Edge cases / quirks:** Against a COMPUTER opponent both real and decoy contacts are treated "basically the same"; a HUMAN can spot a stacked/identical formation and inspect the weapon list to tell decoys apart. Sequencing matters — decoys must arrive BEFORE the real aircraft to be the first engagement priority.
- **Source:** c10b7boXWQk
- **Confidence:** High

### Air-launched decoy behavior (drone-like loiter / "power donuts") + auto-launch
- **Models:** A flying decoy (e.g., ADM-141 TALD-type "towel") is released to mimic a striker, loiters, and "does power donuts" over the target area to confuse and absorb SAM fire.
- **Inputs / parameters:** Decoy weapon loaded on a carrier aircraft (F-14D carrying the "towel"); destination/loiter point; enemy ROE (whether they shoot it).
- **Behavior / rules:** A flying drone-like munition: it "chills" then "does power donuts once it gets to its destination, just to confuse things." Mission logic can AUTO-launch decoys without manual Ctrl+F1 spamming — the aircraft "decided to start flipping them out there" on their own. Effective use: decoys loiter over SAM sites, drawing/absorbing missiles while real strikers and HARM shooters work, "distracting them as everybody pulls out."
- **Outputs / effects:** Decoys present as extra loitering contacts that soak up enemy SAM engagements, protecting real aircraft.
- **Edge cases / quirks:** Only help if the enemy actually engages them (see ROE mechanic, §11); can be launched at low altitude to avoid long-range SAM pot-shots; run out of gas and are expended.
- **Source:** trL6M6PdnMM
- **Confidence:** High

### Decoy units (full units flagged as decoys) — identical signature, optionally lethal
- **Models:** Placeable units that look exactly like the real thing (radar, missiles, building) to confuse the enemy; their quality is indistinguishability, not inertness.
- **Inputs / parameters:** Unit type chosen for the decoy; decoy on/off flag (Shift+Insert to place; right-click "Toggle decoy"); optional capability edits (remove/replace weapon mounts & records; remove or keep sensors/comms).
- **Behavior / rules:** A decoy unit is "exactly identical to other units like it" — it emits REAL radar signals and, by default, can fire REAL missiles that do real damage. Designers can tune it: a shooting decoy keeps weapons; a non-shooting decoy has its weapon mounts/records removed; you can even mount a DIFFERENT platform's missiles (e.g., an SA-2-skinned decoy that actually launches SA-3s) by adding the foreign mount/weapon record and matching radar. Toggling a real unit to decoy keeps its ability to fire. Decoy buildings appear with the same map marking as real ones and can't be distinguished even when visually acquired.
- **Outputs / effects:** Contacts the enemy cannot tell apart from genuine threats; can absorb strikes and waste enemy weapons; can optionally still kill attackers.
- **Edge cases / quirks:** A decoy is flagged in the upper-right with the word "decoy." Even a J-STARS that perfectly detects and IDs everything still classifies the decoy as its mimicked type (e.g., "SA2DE") — sensors cannot reveal decoy status. The losses/expenditures screen does NOT tell you which kills were decoys. A radar-only decoy (no weapons) chirps and draws lock attempts but never fires.
- **Source:** IqnnWO8Erk8
- **Confidence:** High

### Decoy-flag attack-ignore behavior (own and enemy targeting)
- **Models:** Flagging a unit as a decoy causes opposing (and friendly auto-) units to ignore it as a target.
- **Inputs / parameters:** Decoy flag on a unit (even a genuine real aircraft/building); attacking units' target selection.
- **Behavior / rules:** Right-clicking and ordering any unit (even a real aircraft) to be a decoy makes OTHER units IGNORE it for attacks. A designer can flag everything at a base except the one item to be struck, channeling attacks onto the intended target. Demonstrated: of two real aircraft, the decoy-flagged one was not engaged while the other was fired on.
- **Outputs / effects:** Decoy-flagged units are excluded from enemy (and friendly auto-) target selection.
- **Edge cases / quirks:** A decoy-flagged unit is still ARMED — if YOU deliberately take pot-shots at it, it can shoot back. You can also manually order weapons onto a formerly-decoy unit (Shift+F1) and destroy it; the decoy flag only governs automatic target selection, not manual fires.
- **Source:** IqnnWO8Erk8
- **Confidence:** High

### Chaff spoofing of an in-flight radar-guided SAM
- **Models:** Chaff dispensed by the target can decoy/spoof a tracking SAM so it loses lock even when about to intercept.
- **Inputs / parameters:** Chaff dispensed by the target aircraft; missile seeker/guidance type (radar); a spoof/probability roll.
- **Behavior / rules:** After a very close pass an SA-11 ("Sam 11") "vanished"; inspection shows it "was spoofed" — chaff is what kept the aircraft alive, not pure kinematics. Chaff introduces a chance for the radar-guided missile to break lock.
- **Outputs / effects:** Missile breaks lock / is spoofed and misses; target survives.
- **Edge cases / quirks:** Probabilistic, and not the expected cause (presenter initially assumed the missile ran out of fuel); relevant only against radar-guided missiles.
- **Source:** VImBQjG14bM
- **Confidence:** Med

---

## 9. Networked Sensor Fusion, Comms & IADS Posture Automation

### Side-wide automatic communications network (sensor fusion / contact sharing)
- **Models:** All un-jammed units on a side automatically share what they detect across the force.
- **Inputs / parameters:** Unit comms state (in/out of comms, jammed or not); presence of comms devices on the unit; contacts each unit holds.
- **Behavior / rules:** Any un-jammed unit on a side automatically communicates its contacts to nearby friendlies, so one unit's identification is instantly available to the whole side. IADS example: an SA-2 with a TV sensor IDs an inbound as "multi-role," which relays to an SA-5 that then engages on the relayed contact under its WRA — even though the SA-5 has no TV sensor and could not ID independently.
- **Outputs / effects:** A force-wide shared common tactical picture; one sensor's ID enables another unit's engagement.
- **Edge cases / quirks:** Sharing requires the unit to actually be ON the comms network (have comms devices, in comms, not jammed). Identification refines with range — at long range only coarse classification ("multi-role") is available; closer gives finer ID.
- **Source:** gB3Ai9ff7F8
- **Confidence:** High

### Communications disruption / isolation (breaking the IADS link)
- **Models:** Cutting a unit's comms so it can no longer share or receive contacts, breaking up an integrated air defense.
- **Inputs / parameters:** Scenario-feature toggle enabling comms disruption; per-unit comms property ("out of comms" flag, view-POV); presence/absence of a comms device (e.g., UHF radio, data link).
- **Behavior / rules:** Two design methods: (1) Manually flag a unit "out of comms" (requires enabling comms-disruption under scenario features) so it only sees its own POV and shares nothing — applied per unit. (2) Give the unit an actual comms device (UHF radio, secure or unsecure, or a data link) so that if that device is DESTROYED by battle damage the unit automatically drops off the network. A unit with NO comms device can never be disrupted by weapons (nothing to break), so to make a node comms-vulnerable you must first add a comms device.
- **Outputs / effects:** An isolated unit cannot feed its identifications/tracks to the IADS, and the IADS cannot use that node's data.
- **Edge cases / quirks:** Killing only the comms/data-link device (e.g., with a HARM that doesn't kill the launcher) leaves the launcher alive but mute — it may hold a perfect track and even be willing to fire locally but cannot relay, so a dependent shooter (SA-5) loses the feed and may not know whether to fire. Secure vs unsecure "doesn't make that big of a difference" here. A scripted "disconnect everyone on event" is an alternative, but the comms-device method is the quick way to simulate battle damage.
- **Source:** gB3Ai9ff7F8
- **Confidence:** High

### Weapon Release Authorization (WRA) targeting priorities
- **Models:** Per-mission rules ordering which target classes weapons are expended on first.
- **Inputs / parameters:** Ordered target-class priority list (e.g., Priority 1 Piers, 2 Ammo bunkers/structures, 3 SAMs, 4 surveillance radars); target classes/types; optional "limit to types"; per-class priority rank.
- **Behavior / rules:** WRA assigns numbered priorities to target categories so a strike package attacks high-value classes first and only spends leftovers on low-value ones (e.g., don't spend expensive HARMs on surveillance radars). The shooter still reacts opportunistically: in the demo a surveillance radar was struck FIRST despite low priority because it was "the first thing we detected within the zone of influence." WRA also drives auto-engagement of relayed contacts in the IADS (an SA-5 firing on an SA-2-provided ID was "allowed" by its WRA).
- **Outputs / effects:** Determines automatic target-selection order and weapon expenditure per mission/unit.
- **Edge cases / quirks:** Priority is a preference, not absolute — first-detected in-range threats can be engaged ahead of higher-priority classes. Priorities can be set per mission and per target class; classes can be limited to specific types.
- **Source:** IqnnWO8Erk8
- **Confidence:** Med

### Exclusion-zone automatic contact reclassification by violator class
- **Models:** A drawn zone automatically changes a contact's friendly/hostile posture on crossing in, based on the contact's class — automating early-warning ID/engagement decisions.
- **Inputs / parameters:** Zone polygon (reference points); zone type = Exclusion Zone (one of four types); per-violator-class action mapping for three classes — Unknown, Blue (other-team), and Civilian; the contact's current class; position relative to each zone layer.
- **Behavior / rules:** Created via Reference Points Manager → add zone → choose Exclusion Zone → add polygon points → set violator rules. For each of the three violator classes you choose the posture assigned on violation. Demonstrated nested layers: OUTER "ADIZ/orange" zone — Unknown → Unfriendly, Blue → Unfriendly, Civilian → No Change. INNER "shoot-it" zone — Unknown/violator → immediately Red (Hostile), Blue → immediately Red, Civilian → No Change. Crossing the outer line auto-flips a contact to orange/Unfriendly even though its TYPE is unidentified; crossing the inner line flips it to Hostile/Red — purely on geometry + class, independent of mechanical type ID. Lets air defense react (e.g., "pop up" SAMs) on zone violation rather than positive ID.
- **Outputs / effects:** The contact's posture/affiliation color (Unknown → Unfriendly/orange → Hostile/red) changes automatically on zone entry per the configured per-class rule.
- **Edge cases / quirks:** Civilian contacts are explicitly protected (No Change) so they aren't auto-hostile-ized. Reclassification happens without type identification. Zones can be saved/reused and validated; sloppy point selection can grab stray points. Nested zones compound (each crossing escalates posture). The four zone types include Exclusion Zone among others.
- **Source:** N66V6qObLls
- **Confidence:** High

### Early-Warning radar vs Fire-Control radar role distinction
- **Models:** EW radars provide wide-area, lower-fidelity tracks just to flag potential threats; FC radars provide the high-quality tracks needed to actually shoot.
- **Inputs / parameters:** Radar role/type (early-warning/search vs fire-control/guidance); range; track quality required (awareness vs weapon guidance).
- **Behavior / rules:** EW radar's purpose is to give the air-defense network TIME to identify a target and decide whether it is dangerous — it does NOT need to be perfect and does NOT produce fire-control-quality tracks ("we're just looking for something good enough to see if we even need to engage"). FC radars (e.g., Straight Flush, Cherry/Cheese-board guidance radars, Fire Dome) provide the precise tracks used to guide weapons and are typically much shorter range. In the build, long-range search/EW radars (Big Bird linked to SA-20, ~300 km / 200 m resolution; Snow Drift; Score Board ~60 nm) form the detection net, while short-range FC/guidance radars handle the engagement.
- **Outputs / effects:** Network awareness/tracks (EW) vs weapon-guidance-quality tracks (FC); which radar a contact is detected by is shown per contact.
- **Edge cases / quirks:** EW radar height info is "nice to have" but not essential (see 2D/3D rule). FC radars are short range and are the actual shooters' sensors. EW tracks are insufficient for engagement on their own.
- **Source:** N66V6qObLls
- **Confidence:** High

### 2D vs 3D radar — altitude/height information
- **Models:** Radars are either 2D (range/bearing only, no altitude) or 3D (also gives height); affects what an EW track contains.
- **Inputs / parameters:** Radar dimensionality flag (2D vs 3D) from the database; whether height-finding is needed.
- **Behavior / rules:** A 2D radar does NOT give height/altitude; a 3D radar DOES. For early warning, height is less important, so a 2D EW radar is often acceptable; a separate, often shorter-range, dedicated height-finder can get altitude on a contact of interest (e.g., one flagged as flying low). Example 3D radar: TRS-2215 (an old-school 3D phased-array radar).
- **Outputs / effects:** Presence/absence of altitude in the contact's track; choice of whether a height-finder is needed.
- **Edge cases / quirks:** Height-finding can be delegated to a shorter-range 3D/height-finding radar rather than requiring every search radar to be 3D. The 2D/3D attribute is read from the radar's database entry.
- **Source:** N66V6qObLls
- **Confidence:** High

### Radar coverage shaped by terrain, line-of-sight, and emitter altitude (radar horizon / masking)
- **Models:** Radar detection volume is gated by line of sight; terrain masks coverage and mounting a radar higher extends and improves its lobe.
- **Inputs / parameters:** Radar position (lat/lon, especially ELEVATION above terrain); surrounding terrain/relief; target altitude (low-flyers exploit masking); the Line-of-Sight tool's computed visibility.
- **Behavior / rules:** Plan coverage by examining terrain (relief layer) and placing the most powerful radar on the highest peak (e.g., ~6,184 ft hilltop) to maximize reach and gain look-down into coastal lowlands. The in-game Line-of-Sight tool computes exactly where a radar can/can't see; terrain creates blind spots (a coastal gap, a mountain range that hides low-flyers). Mounting the SAME radar higher yields a visibly WIDER lobe than mounting it low. Redundant/overlapping radars eliminate blind spots so "you basically can't sneak up on this island." Demonstrated: a low-altitude F-16 dropped OFF the display because the Big Bird "can't see through this mountain range" — low/min-altitude ingress is used to defeat coverage.
- **Outputs / effects:** The actual detection footprint (lobe) per radar and the network's combined coverage, including exploitable blind spots.
- **Edge cases / quirks:** Low/minimum-altitude flight defeats line of sight and is the primary penetration tactic. A hill-mounted radar can even "see over its shoulder" backwards into a region. Many LoS calculations cause heavy lag. Coverage must be re-checked because map/LoS settings can reset.
- **Source:** N66V6qObLls
- **Confidence:** High

### Passive Coherent Location (PCL) — multilateration off civilian RF
- **Models:** A network of passive receivers detects targets by exploiting reflections of existing civilian radio broadcasts, with no emissions of its own — strong vs stealth.
- **Inputs / parameters:** PCL receiver units (only a few factions field them); RF bands exploited (FM broadcast, UHF); line of sight from MULTIPLE receiver sites; suitable civilian transmitters (e.g., FM towers) that are turned ON.
- **Behavior / rules:** PCL is fully passive/automatic (no active sensor to switch on) and detects targets using ambient radio "picked up from just about anywhere," including FM broadcast and UHF. It requires line of sight from MULTIPLE locations simultaneously — the video deploys four PCL receivers. Because the listed receiver exploits FM, the scenario must also include civilian FM transmitters in range, turned ON (they are non-detecting emitters). Once set up, PCL silently detects penetrators (high and low altitude, alongside the Big Bird radar) with very little warning.
- **Outputs / effects:** Passive position detections on targets illuminated by the civilian RF, attributed to the PCL system; effective vs stealth/low-emission aircraft.
- **Edge cases / quirks:** Requires geometry from multiple receivers (a single PCL is insufficient — needs multilateration). Requires friendly/civilian transmitters present AND switched on; FM towers are non-detecting emitters and easy to forget to enable. PCL itself emits nothing. Only certain nations/groups field PCL units.
- **Source:** N66V6qObLls
- **Confidence:** High

### Auto-detectable emitters & conditional radar activation (IADS survivability / EMCON)
- **Models:** Some emitters are intrinsically known to the enemy at start; radars can be hidden, made mobile, and scripted to switch on only on a trigger to survive first-strike SEAD.
- **Inputs / parameters:** Unit "auto-detectable" flag; radar fixed vs mobile; emission state (on/off); a conditional/Lua trigger (e.g., "turn on if the primary radar is destroyed"); EW/ELINT detectability of active emitters.
- **Behavior / rules:** Fixed/known installations carry an "auto-detectable" flag — the enemy knows their location from the start (it immediately knows where the fixed detectable radars are, but NOT the mobile/hidden ones). Assuming the primary long-range radar is the FIRST target struck ("a Tomahawk in the first 5 seconds of any conflict"), the designer places a portable/mobile backup radar out of the way (clearing its auto-detectable flag so it isn't given away) and uses Lua to keep it OFF until the primary is destroyed, then auto-activates it. Grouping all radars (select + press G to make an "EW group") lets the whole net be switched ON/OFF with one button (EMCON control). Any actively-emitting radar can still be located via EW/ELINT even if not auto-detectable.
- **Outputs / effects:** Which emitters the enemy knows at start; survivability of the radar net under first strike; a backup radar that activates on death-of-primary; one-click group emission control.
- **Edge cases / quirks:** Mobile radars can be repositioned (e.g., "on a pole downtown") and have auto-detectable turned off so the enemy must find them via EW. An emitting radar gives itself away over EW even when not auto-detectable. Watchtowers/visual posts were known to the enemy while radar SITES were not — differential detectability by unit type. Grouping for one-button on/off is the practical EMCON mechanism.
- **Source:** N66V6qObLls
- **Confidence:** Med

---

## 10. SAM Kinematics & Engagement Geometry

### Snap-up / snap-down minimum-engagement altitude (SAM kinematics)
- **Models:** A SAM cannot immediately hit a high target directly overhead because the missile needs horizontal distance to climb to its lethal envelope.
- **Inputs / parameters:** SAM stated engagement range (SA-6: 13 nm) and max altitude (38,000 ft); the "snap up altitude"; horizontal run needed to climb ("seven or eight miles of air"); target altitude (e.g., 36,000 ft).
- **Behavior / rules:** Despite the SA-6's listed 13 nm range and 38,000 ft ceiling, a missile fired at a high, near-overhead target must travel ~7-8 miles horizontally to climb into the range where it can do damage (the "snap up altitude"). So a target loitering at 36,000 ft directly above (inside the listed envelope) is effectively invulnerable — the SAM will not/can't shoot. To get engaged you must descend into a band where the snap-up geometry is satisfiable (the demo stepped 36k → too high, then progressively lower; 12,000 ft is "the sweet range" for classic SAMs; 4,000 ft was the attack altitude that exposed the strike aircraft). Conversely, diving from high to low creates "the world's tightest window" between minimum range and the moment a shot can connect.
- **Outputs / effects:** Determines whether a SAM will engage a given altitude/range; creates altitude bands of invulnerability (too high) and a narrow lethal window on dives.
- **Edge cases / quirks:** Staying ABOVE the SAM's max altitude (e.g., above 36,000 ft for this SA-6) is total immunity. 18,000 ft is described as an "RMS value between snap-down altitude and maximum range" that maximizes wasted interceptor effort against the aircraft. Diving aircraft can be hit on the way down before reaching minimum range.
- **Source:** c10b7boXWQk
- **Confidence:** High

### SAM minimum range (inner no-engage zone)
- **Models:** A SAM cannot engage targets closer than its minimum range.
- **Inputs / parameters:** SAM minimum range; target's slant distance to the launcher.
- **Behavior / rules:** Inside the minimum range the target is safe from that launcher. Demonstrated: the F-16 "stays within its minimum range" to avoid being shot. Tip: don't send decoys all the way to the target; send them to "just outside the minimum range" so the site engages them. However, an aircraft diving from outside can be struck before it crosses into the minimum-range sanctuary.
- **Outputs / effects:** Defines an inner sanctuary where the SAM won't fire; informs decoy/aimpoint placement.
- **Edge cases / quirks:** Transiting from the lethal zone into minimum range can still get you hit en route. Evading near minimum range can push the aircraft back out into a more dangerous region, so "do not evade" is sometimes correct.
- **Source:** c10b7boXWQk
- **Confidence:** High

### Effective (no-escape) range vs maximum kinematic range
- **Models:** A SAM missile's "danger zone"/effective range is smaller than the absolute distance it can fly; past the effective edge it may still chase but is running out of energy and is easily out-run.
- **Inputs / parameters:** Missile current energy/fuel; target range vs the effective-range ring vs the max-range ring; target speed and turn (afterburner, altitude loss).
- **Behavior / rules:** The engagement ring shown ("danger zone") is the effective range. A missile launched while the target is inside it will still pursue if the target then exits — "this missile is not going to quit just because he left his effective range" — continuing until it runs out of energy/fuel. If the target turns away (especially with afterburner / losing altitude) before the missile arrives, the missile is dragged past its effective range, bleeds energy, and eventually "runs out of ammo or out of fuel" and self-terminates/misses. Lowering altitude makes the evader "more effective" at out-running the missile.
- **Outputs / effects:** Missile energy depletes with chase distance; missile misses/expires if dragged beyond effective range before intercept; target survives.
- **Edge cases / quirks:** No simple "effective vs maximum range" UI distinction is enforced — the missile keeps flying past the theoretical edge; very close calls if the target turns back in too early ("you waited too long" / "should have kept burning").
- **Source:** VImBQjG14bM
- **Confidence:** High

### Deflection-shot accuracy penalty (missile end-game probability reduction)
- **Models:** Missiles taking high-angle/crossing (deflection) shots are far less likely to hit.
- **Inputs / parameters:** Engagement geometry (how oblique/crossing — "deflection"); the missile end-game calculation.
- **Behavior / rules:** A target crossing at high deflection (e.g., the decoy run toward Kobi) forces the SAM into a "reduced shot" — the missile end-game applies a probability reduction and many interceptors miss. The presenter exploits this by placing decoys so the site "wastes shots on deflection," choosing the "optimum waste of ammunition" geometry. You can inspect the "missile end game" dialog to see the reduced hit chance.
- **Outputs / effects:** Lowered per-shot hit probability; the SAM expends extra interceptors against high-deflection targets.
- **Edge cases / quirks:** A very competent crew with enough engagement time can still saturate and kill even high-deflection targets, then re-engage the real attacker — deflection wasting is not a guaranteed defense, especially against short-flight-time weapons that reload/cycle fast.
- **Source:** c10b7boXWQk
- **Confidence:** High

### Oblique / 90° crossing geometry degrades a SAM's terminal engagement
- **Models:** A target crossing perpendicular (high-aspect/oblique) is the worst-case shot for a SAM; the interceptor is likely to miss/waste itself.
- **Inputs / parameters:** Target aspect relative to the SAM (crossing angle); track quality.
- **Behavior / rules:** A 90° crossing is "the worst case scenario for any missile shot — an oblique target." An S-300 holds fire on such a track because taking it would "waste my weapon" on an "insane" crossing shot. Presenting a 90° oblique (Tomahawks curving past) makes it very hard for the SAM to engage while other missiles sneak in. Distinct from the FCR-facing limit: even when able to point at the target, the crossing geometry itself spoils the endgame.
- **Outputs / effects:** The SAM declines or misses on perpendicular-crossing targets; engagement effectiveness drops with crossing angle.
- **Edge cases / quirks:** Combine with FCR-facing exploitation for maximum effect. Requires being able to see the target to engage at all (shots refused when the shooter is blind / out of range). (Closely related to the deflection-shot penalty above; both describe the same crossing-angle degradation, observed in separate videos with different system examples.)
- **Source:** Xpcsvs_f3vk
- **Confidence:** High

### Threat-sector radar logic (firing in one direction prevents engaging another)
- **Models:** A single fire-control radar/battery committed to targets on one bearing cannot simultaneously engage targets on a different bearing.
- **Inputs / parameters:** Current target bearings the radar/battery is engaging; bearing of a separate would-be target; the (recently changed) radar logic.
- **Behavior / rules:** Because of the changed radar logic, if the site is firing at targets in one direction, an aircraft approaching from a different direction "cannot be fired upon at all" while the radar is committed. Spread-out decoys on one bearing lock the radar's attention while the real strike aircraft sneaks in from another bearing/over a ridge. Presenter is impressed an SA-6 crew could spin its radar around fast enough to re-engage (implying older/slower systems cannot).
- **Outputs / effects:** Temporary immunity for targets outside the radar's currently-committed sector; enables a flanking/pop-up attack while the site is saturated elsewhere.
- **Edge cases / quirks:** Some advanced systems (e.g., SA-8) can slew/re-engage fast; slower legacy systems are easier to bypass. Terrain masking (ridgeline) combines with this for a pop-up surprise.
- **Source:** c10b7boXWQk
- **Confidence:** Med

### Fire-control radar directionality: a SAM radar illuminates one direction at a time
- **Models:** An FCR must physically face the target it is engaging; it cannot point everywhere at once, so it engages within a single cone at a time, serializing engagements by facing.
- **Inputs / parameters:** FCR field of regard / current facing; target bearings; number of simultaneous engagements.
- **Behavior / rules:** Older "Commando"-era builds let an SA-10's FCR point every direction at once and shoot everything simultaneously; CMO corrected this a few versions ago. Now, on engaging an inbound, a large zone shows the radar's facing — it "concentrates all its energy in this general direction." Until that engagement finishes the radar cannot slew to other targets. The radar physically spins to engage the closest/biggest threat first, then does a 180 to engage the opposite direction afterward — targets outside the current cone are not engaged meanwhile.
- **Outputs / effects:** An engagement-direction cone is drawn; engagements are serialized by radar facing; the radar slews/rotates between threat sectors.
- **Edge cases / quirks:** Two targets in the SAME cone/region simultaneously CAN both be engaged (both in line of sight); the beam visibly turns to keep both illuminated at once.
- **Source:** Xpcsvs_f3vk
- **Confidence:** High

### Multi-axis saturation exploits FCR directionality
- **Models:** Attacking from several directions at once forces a single-FCR SAM site to step its engagements sequentially, overwhelming it.
- **Inputs / parameters:** Attack timing/geometry from multiple bearings; the FCR slew constraint.
- **Behavior / rules:** Because the FCR can face only one sector at a time, coordinating weapons to arrive from multiple directions forces the site to "step its attacks rather than concentrate them." Demonstrated by plotting Tomahawk (B-52-launched) waypoints so missiles converge from different bearings; the presenter doglegs/circles some missiles to waste the site's time so others get into position, draining its missiles ("millions wasted on one SAM site"). Best: stagger arrivals from opposite/multiple axes so the radar must keep slewing.
- **Outputs / effects:** The SAM site is forced to serialize engagements, expending more interceptors and leaving gaps.
- **Edge cases / quirks:** Effective even against an S-300 (older); for an S-400 you'd add JASSMs with EMP. The dogleg/circle timing is operator skill, not a separate engine rule.
- **Source:** Xpcsvs_f3vk
- **Confidence:** High

### Track-via-missile / command-guidance radar must face the target
- **Models:** A phased-array SAM (S-300/SA-10) must keep its radar beam pointed at the target throughout missile flight because the missile is command-guided, not autonomous.
- **Inputs / parameters:** Radar array facing/azimuth; target bearing; missile-in-flight guidance link; beam width/lobe shape (with a default built-in rotation offset).
- **Behavior / rules:** On a fire order the crew slews the flat passively-scanned phased-array to face the target bearing; the radar concentrates all electrical energy into a beam/lobe ("takes a chunk out of the sky"). Missiles must be continuously tracked individually, so the beam must keep facing the target for the whole engagement. After an engagement the array physically rotates to the next target's direction, which takes time. Targets within the same beam-width/lobe can be engaged simultaneously (the narrator guides missiles onto two targets at once because both were within the beam). The default lobe is rotated at an "awkward angle" so it does not perfectly cover a side of the sky; a slightly off-positioned attacker ("to the left by a millimeter") could force the battery to split fire between two lobes.
- **Outputs / effects:** Radar azimuth/facing changes; engageable targets change as the array rotates; engagement begins/continues only while the beam faces the target.
- **Edge cases / quirks:** The default beam rotation leaves an "awkward angle" lobe with coverage gaps; the array can only rotate so many "clock angles" left/right, limiting how far around it can engage; a target sitting between lobes can be missed.
- **Source:** VImBQjG14bM
- **Confidence:** High

### Limited simultaneous engagement (missile guidance) channels
- **Models:** A SAM battery can guide only a fixed maximum number of missiles/targets at once, bounded by its fire-control channels.
- **Inputs / parameters:** Number of missile channels (this SA-10 has 8 — narrator initially said 6); number of targets ordered; rounds-per-target setting.
- **Behavior / rules:** The unit advertises a fixed channel count (corrected 6 → 8). The operator sets rounds-per-target (2 toward each target, then experiments up to 6). When fewer targets are engaged than channels exist, spare channels sit idle — "only two of my missile channels are presently being used" while a second bandit goes unengaged (because the beam wasn't facing it, not because channels were exhausted).
- **Outputs / effects:** Concurrent in-flight guided missiles / engaged targets capped by channel count; rounds-per-target consumes channels.
- **Edge cases / quirks:** Channel availability is gated by both the count AND whether the beam faces the target — idle channels can't help a target outside the beam.
- **Source:** VImBQjG14bM
- **Confidence:** Med

### Drag/bait ("cheese") exploit against command-guided SAMs
- **Models:** An aircraft repeatedly darts into the SAM's effective ring to trigger a launch, then runs so the missile wastes itself; multiple aircraft kept out-of-phase saturate/exhaust the battery.
- **Inputs / parameters:** SAM effective-range ring (re-measured each pass); aircraft entry point and turn timing; number of baiting aircraft and their phase offset; the SAM's slew time.
- **Behavior / rules:** Place a bait aircraft at the edge of the danger zone and order it to dart in then turn ("power donuts"). Each entry tempts a launch; the aircraft turns out before the missile arrives, wasting the shot. Because the array must rotate to re-engage a different threat (clock-angle limit + slew time), staggering multiple aircraft "out of phase" forces the battery to keep rotating and firing, never landing a hit. Net: "keep the missile busy while you fire something else at it" — bait holds the radar on one side while a different weapon (cruise missiles) closes from another.
- **Outputs / effects:** The SAM expends missiles on baited targets; radar attention/azimuth is pinned; the battery is distracted/saturated.
- **Edge cases / quirks:** Timing is fragile — turning back too early ("bad timing") gets the bait killed; re-measure the ring each pass (the effective ring isn't constant); works best flying a "square wave" around the whole danger zone.
- **Source:** VImBQjG14bM
- **Confidence:** Med

### Killing the radar disables the SAM site
- **Models:** Destroying the SAM's radar/array eliminates its ability to detect and guide, neutralizing the site regardless of remaining missiles.
- **Inputs / parameters:** Hits on the battery components; specifically a hit on the radar element.
- **Behavior / rules:** Tomahawks impacting the battery whittle it down; "eventually one of those will hit the radar," after which the threat is gone. The radar is the critical component for engagement.
- **Outputs / effects:** Once the radar is destroyed the site can no longer engage; threat removed.
- **Edge cases / quirks:** Multiple hits may be needed ("how many does it take to kill an SA-10?"); the site keeps firing until the critical radar component is killed.
- **Source:** VImBQjG14bM
- **Confidence:** Med

---

## 11. SAM-vs-Surface, Over-Horizon Datalink & SARH Weapon Employment

### SAMs can engage surface targets in anti-surface (ASuW) mode
- **Models:** Many surface-to-air missiles can be authorized to strike surface/ground targets if a track exists through the clutter.
- **Inputs / parameters:** SAM weapon's anti-surface range; target track quality; ASuW-mode authorization (Ctrl-Shift-F9 → "use SAMs in ASuW mode").
- **Behavior / rules:** Ctrl-Shift-F9 opens anti-surface options including "use SAMs in ASuW mode"; enabling it authorizes the ship to fire its SAMs at surface contacts. Example: SM-6 anti-surface range = 130 miles. "Most/many SAMs" can engage ground targets, including the SA-2, "assuming you can lock onto it through the clutter."
- **Outputs / effects:** SAM inventory becomes usable against surface/ground targets within its anti-surface range.
- **Edge cases / quirks:** Capability is per-weapon ("I should never say most"); ground engagement still requires beating clutter to lock. SM-6 vs small boats is hugely cost-inefficient ("the biggest waste of SM-6s").
- **Source:** 36xJrDAnjvk
- **Confidence:** High

### Auto-engagement refuses sub-threshold-size targets; manual engagement overrides
- **Models:** Even with a good track, fire-doctrine won't auto-shoot at very small targets; the operator must manually allocate weapons.
- **Inputs / parameters:** Target physical size; track quality; engage mode (auto vs manual Ctrl-F1).
- **Behavior / rules:** With the ship in range and holding a good track on small boats, it would NOT auto-launch because "you're not supposed to be attacking targets that are this small." Switching to manual engagement (Ctrl-F1) against the firing weapon, selecting targets, and allocating one weapon each forces the launch. The same reluctance means it won't engage them all simultaneously.
- **Outputs / effects:** No auto-launch below threshold; manual allocation forces engagement.
- **Edge cases / quirks:** The operator must click the actual weapon being used (Shift-F1 to drag a target box, then allocate per target) — mis-clicking allocates nothing.
- **Source:** 36xJrDAnjvk
- **Confidence:** High

### Beyond-horizon shots require third-party datalink guidance, with degraded accuracy
- **Models:** If the shooter can't see the target (over the horizon), the weapon flies under datalink control until its own seeker takes over; over-horizon/datalink shots are far less accurate.
- **Inputs / parameters:** Shooter-target line of sight (horizon); datalink channel availability; third-party sensor (e.g., helicopter radar); the weapon's own seeker range.
- **Behavior / rules:** Shooter and target on opposite sides of the horizon can't see each other, so the ship can't guide its own missile; a helicopter (radar on) provides the track and the missile flies datalink-controlled, only taking over at the end when its active seeker (SM-6: 15 nmi active radar) acquires. Multiple missiles must wait for a datalink channel to free up ("we need to wait until the datalink channel becomes available" — one missile being datalink-controlled blocked a 3rd allocation). Result: datalinked shots have "massively degraded accuracy" — the SM-6 missed by ~7 feet / ~10 meters repeatedly and largely failed against small boats.
- **Outputs / effects:** Missile guided by third-party datalink then terminal seeker; reduced accuracy; channel-limited concurrency.
- **Edge cases / quirks:** "There's not much you can do about" datalink-shot accuracy degradation. A weapon auto-starts firing once it reaches a range where it can engage itself. An apparent firing bug occurred during the demo (acknowledged, not a mechanic).
- **Source:** 36xJrDAnjvk
- **Confidence:** High

### Weapon terminal seeker must acquire the target to reliably hit
- **Models:** An anti-ship/strike missile with an active radar seeker must detect the target with its own seeker in the endgame to score reliably.
- **Inputs / parameters:** Weapon active-seeker range/era (SM-6: 15 nmi active radar; late-2010s seeker); target detectability; geometry.
- **Behavior / rules:** The SM-6's active radar seeker (15 nmi) "actually has to detect that target in order to reliably hit it." Datalinked to roughly the right spot, it then relies on terminal acquisition; against small boats it frequently missed by feet. A purpose-built anti-ship Harpoon (range 75; box/rail launch, not VLS) cleanly hit, and an SM-6 used within own-ship radar/horizon range and good track also cleanly hit a large "container" ship.
- **Outputs / effects:** Reliable hit requires terminal seeker acquisition; mismatched weapon-vs-target seeker performance causes misses.
- **Edge cases / quirks:** Within own-radar/horizon range with a good track, even the SM-6 hits cleanly — the misses were specific to the over-horizon datalink + small-target case.
- **Source:** 36xJrDAnjvk
- **Confidence:** High

### Crew quality affects time-to-target / engagement speed
- **Models:** Higher crew quality reduces the time the platform needs to acquire and solve a firing solution.
- **Inputs / parameters:** Crew quality rating; target.
- **Behavior / rules:** Acquiring a target took ~52 seconds; raising crew quality "will decrease the amount of time it takes them to target that other ship," and the subsequent solution came noticeably faster ("a little too fast").
- **Outputs / effects:** Reduced targeting/solution time with better crew.
- **Edge cases / quirks:** No formula (qualitative); also affects how quickly automatic engagement begins.
- **Source:** 36xJrDAnjvk
- **Confidence:** Med

### Semi-active radar homing (SARH) requires a friendly illuminator on the correct band
- **Models:** A SARH weapon homes on radar energy reflected off the target, so the launching platform must have a radar that ILLUMINATES on the band the seeker expects; no illumination = no guidance.
- **Inputs / parameters:** Missile seeker band (here I-band, inferred from the donor MiG-25's I-band radar); the platform radar's operating bands including a specific "Fire Control – illumination" band entry; target RCS (reflection available).
- **Behavior / rules:** A SARH missile (AA-6/R-40 "Romeo Delta") needs continuous illumination to home. The illuminating radar must operate on the matching band AND have an explicit illumination capability — a radar set says e.g. "operating bands: Fire Control illumination I." Mounting a wrong-band radar (X, J) "won't work"; even an excellent radar (e.g., F-15E's) with NO illumination capability cannot guide ("if we can't illuminate we can't hit the target"). Any sensor on the right band with illumination works — even an enemy/American radar (APG) can illuminate an I-band weapon if its illumination band matches; the donor Flash Dance (MiG-31 Highlark) I-band radar is chosen because it both illuminates and has good range. Insufficient reflection (stealth target) means "not enough reflection" → "no weapon directors available to illuminate the target" even with illumination active.
- **Outputs / effects:** Whether a SARH shot is allowed/guidable; a "no weapon directors available to illuminate" error when illumination/reflection is inadequate; activating the illuminating radar enables the shot.
- **Edge cases / quirks:** AESA-type radars ("aces") are great but CANNOT illuminate, so can't guide SARH; some radars illuminate only ONE target at a time (APG); stealth targets reduce reflection so SARH can fail even within range; the illumination band must be explicitly set to the weapon's band.
- **Source:** f9qHbpGR6oA
- **Confidence:** High

### Mandatory command/missile data link to launch a weapon
- **Models:** Some missiles require a data-link mount on the firing unit; without the correct data link the unit physically cannot launch (or cannot guide).
- **Inputs / parameters:** The weapon's required data-link types (AA-6 has BOTH a "command data link" and a "missile data link"); the comms/data-link records mounted on the firing unit.
- **Behavior / rules:** Adding a SARH weapon record, the editor prompts whether to add its data link but does NOT add it automatically — you pick which. The data link is added to the unit's COMMS, not the weapon mount. There are two distinct AA-6 links: a COMMAND data link and a MISSILE data link. Missing it: a SARH weapon can't track even with illumination; at fire time you get "unable to connect to firing unit with mandatory data link." Fix: add the COMMAND data link (in addition to/instead of just the missile data link) — only then will the unit launch. IR-seeker variants can be "YOLO fired" fire-and-forget but the unit still needs the missile data link to launch.
- **Outputs / effects:** Launch enabled/blocked; "unable to connect to firing unit with mandatory data link" error when the required link is absent; adding the command data link unlocks firing.
- **Edge cases / quirks:** The editor won't auto-add the link and forces a manual choice; the two AA-6 links are easy to confuse; even fire-and-forget IR missiles need the missile data link present to launch.
- **Source:** f9qHbpGR6oA
- **Confidence:** High

### Dynamic Launch Zone (DLZ) gating of weapon release
- **Models:** Each weapon has a computed DLZ; firing inside is recommended, while firing outside is allowed but disadvantaged (low Pk / kinematically poor).
- **Inputs / parameters:** Target range/altitude/aspect; weapon kinematic envelope; current geometry relative to the DLZ.
- **Behavior / rules:** The UI reports being "a little outside of DLZ range for a weapon." You can still order a fire outside the DLZ ("I could probably order it to fire anyway even though it's outside of DLZ range") but it is "a disadvantage." Getting closer brings the target into the DLZ for a proper shot.
- **Outputs / effects:** Recommended vs forced launch; reduced effectiveness when firing outside the DLZ.
- **Edge cases / quirks:** Firing an air-to-air weapon from a ground mount is inherently poor; outside-DLZ shots are permitted but flagged as disadvantaged.
- **Source:** f9qHbpGR6oA
- **Confidence:** High

### Snap-up capability for engaging higher-altitude targets (ground/A2A-on-ground)
- **Models:** A ground/low-altitude launcher firing at a higher target needs sufficient "snap-up" energy; without it the missile cannot reach the target's altitude.
- **Inputs / parameters:** Target altitude vs launcher altitude; missile snap-up performance.
- **Behavior / rules:** Against targets at altitude: "I don't think we're going to have enough snap-up power here" and "not enough snap up to actually hit it." Lowering the targets to 5,000 ft makes shots immediately achievable. Snap-up is the limiting factor for high-altitude intercepts from the ground.
- **Outputs / effects:** Missile reaches/fails to reach target altitude; shot succeeds or falls short.
- **Edge cases / quirks:** Repurposed air-to-air missiles fired from the ground have poor snap-up; reducing target altitude is the workaround demonstrated. (Same underlying snap-up energy concept as the SAM snap-up/snap-down mechanic in §10, here applied to repurposed A2A weapons on a ground mount.)
- **Source:** f9qHbpGR6oA
- **Confidence:** Med

### Stealth / low RCS reduces detection and SARH guidance
- **Models:** Low-RCS (stealth) aircraft are harder to detect on radar and reflect too little energy for SARH missiles to home, lowering hit probability even on clean-looking shots.
- **Inputs / parameters:** Target RCS/stealth flag; illuminating radar power; reflected-energy threshold for guidance.
- **Behavior / rules:** Stealth targets (Su-57) are tracked but reduce reflection so SARH shots report "not enough reflection" / "no weapon directors available to illuminate." Even with many missiles fired in "world's cleanest shots," probability of striking is "relatively low" because "these weapons were just not designed to hit stealth targets." A surface radar (TPS-43) can still track stealth aircraft for awareness, but converting that to a guided kill is unreliable.
- **Outputs / effects:** Reduced detection range and sharply reduced SARH hit probability against stealth; many shots needed for few or no kills.
- **Edge cases / quirks:** Detection (track) and engagement (guide-to-kill) are separated — you can see/track stealth yet fail to guide weapons onto it; against older SARH weapons stealth is nearly immune.
- **Source:** f9qHbpGR6oA
- **Confidence:** High

### Radar horizon / horizontal range limit on ground SAM detection
- **Models:** A ground-based SAM is limited by horizontal (radar-horizon) range; distant targets read "out of range horizontal" until they close in.
- **Inputs / parameters:** Target slant/horizontal range; SAM radar horizontal range limit.
- **Behavior / rules:** Selecting a target, the SAM reports "out of range horizontal," so the operator must wait for the aircraft to close before any engagement. A separate elevated surveillance radar (TPS-43 on a hill) can detect before the SAM itself is in range.
- **Outputs / effects:** Engagement blocked until the target is within horizontal range; separate sensors may detect earlier than the engaging radar.
- **Edge cases / quirks:** Surveillance-radar coverage and engagement-radar coverage differ; the SAM can be cued by another sensor while still "out of range horizontal" itself.
- **Source:** f9qHbpGR6oA
- **Confidence:** Med

---

## 12. Rules of Engagement / Identification Doctrine

### ROE / identification rules govern whether decoys (and threats) get engaged
- **Models:** A side's weapons-control/ROE setting (identify-first vs weapons-free-on-air) determines whether unidentified contacts — including decoys — are engaged, which makes or breaks decoy effectiveness.
- **Inputs / parameters:** Side ROE (e.g., "only shoot at known hostile" vs Ctrl+Shift+F9 "shoot at anything in the air"); contact identification state (yellow = unidentified, must ID before firing).
- **Behavior / rules:** Default tight ROE: contacts stay "unknown/yellow" and "don't shoot at it until you identify it" — so the SAMs do NOT shoot the decoys, and "the whole purpose of the decoys was completely thrown away." The action only starts once a real group is positively identified hostile. Loosening ROE to "shoot at anything in the air" makes the SAMs spam every contact including decoys ("100 SAM twos start spamming these decoys… everything's hostile"), so decoys finally draw fire off the strikers. ROE is per-side and dramatically changes engagement behavior.
- **Outputs / effects:** Whether unidentified contacts/decoys are engaged; tight ROE wastes decoys, permissive ROE makes them effective bait.
- **Edge cases / quirks:** Identify-first ROE means non-emitting/un-IDed SAM sites also stay hidden until they fire; permissive ROE is "very permissive doctrine" causing chaotic over-firing; a designer normally only opens fire this wide if civilian units aren't a concern.
- **Source:** trL6M6PdnMM
- **Confidence:** High

---

## 13. Passive Acoustic (Submarine) Detection

### Underwater source level (dB) is logarithmic, above-ambient
- **Models:** A submarine's radiated noise is an overall intensity in decibels above ambient; because dB is logarithmic, +10 dB is a 10× power increase, not a +10 "volume" increase.
- **Inputs / parameters:** The unit's radiated-noise number (e.g., a Delta-IV boomer at ~31.5 dB at ~3 knots steerage); the logarithmic dB scale (a bel = factor of 10).
- **Behavior / rules:** The orange noise number is "overall intensity" in dB, notably ABOVE zero/ambient (most stereo-style scales are negative). Going 30→40 dB does not add 10 units of loudness; it multiplies power by 10. Real-world Navy spreading charts cited: a 0 dB source is ~−20 dB at 10 yds, ~−40 at 100 yds, ~−60 at 1,000 yds, ~−80 at 10,000 yds, ~−100 at 100,000 yds.
- **Outputs / effects:** Defines the unit's emitted loudness used by passive sonar; sets the baseline for detection-range math.
- **Edge cases / quirks:** Adding 10 dB increases detectability by the implied power of 10, but the realized detection-range gain is far smaller because sound spreads in all directions (see spreading mechanic).
- **Source:** -Q9AfTrF4vM
- **Confidence:** High

### Speed-to-noise relationship and cavitation
- **Models:** A submarine's radiated noise rises with speed; past a threshold the screw cavitates, producing a large noise spike.
- **Inputs / parameters:** Ordered speed (knots); depth (affects cavitation onset); resulting dB.
- **Behavior / rules:** Measured points (Delta-IV boomer): ~3 kn steerage = 31.5 dB; ~5-6 kn = ~42 dB ("about 10 louder"); ~52 dB at a higher setting; "flank" produces cavitation and ~102 dB. The boat "is cavitating right now so he's going to be making an awful lot of noise"; backing speed down reduces it. Each ~+9-10 dB corresponds to a notch up in ordered speed.
- **Outputs / effects:** Radiated dB used by passive sonar increases sharply with speed; cavitation adds a large noise increase.
- **Edge cases / quirks:** Cavitation is depth-dependent (a shallow boomer cavitates at flank); "if you do anything faster than three knots people are going to pick you up from basically anywhere" — these become standoff torpedo ranges.
- **Source:** -Q9AfTrF4vM
- **Confidence:** High

### Passive detection range vs source level (empirical ~33% per 10 dB)
- **Models:** Passive sonar detection range scales with source level by an approximately constant percentage gain per 10 dB, not linearly.
- **Inputs / parameters:** Source dB; receiver (generic hull-mounted sonar on an SKR/Grisha frigate, no VDS); spherical-spreading attenuation; measured detection range.
- **Behavior / rules:** Empirical results, measured by manually ranging the contact (the auto "estimate" of 17 nm is explicitly wrong/"mathematically unlikely"): 31.5 dB → 4.0 nm; 42 dB → 5.7 nm; 52 dB → 7.5 nm; 102 dB → 13 nm. Derived rule: every +10 dB increases detectability by ~33% (42/31.5 = 1.33; 5.7/4 first miscomputed then corrected to ~33%). Predicted 52 dB → 5.7×1.33 ≈ 7.5 nm and it landed "7.5 on the nose." A +20 dB step gives ~50% more range; 30→52 dB made detection dramatically easier. Matches the cited Navy spreading chart.
- **Outputs / effects:** Predicted/actual passive detection range as a function of source level; ~33% range increase per +10 dB.
- **Edge cases / quirks:** "It won't be that even in the real world — that's mathematically unlikely." The auto-estimate range (17 nm) is unreliable and must be confirmed by manual measurement. Passive only — active sonar is "not terribly effective" and deferred.
- **Source:** -Q9AfTrF4vM
- **Confidence:** High

### Spherical spreading / omnidirectional attenuation
- **Models:** A submarine radiates its noise in all directions (not a beam), so the energy attenuates rapidly with range via spherical spreading, drastically reducing what a distant receiver hears.
- **Inputs / parameters:** Source intensity; range; geometry (omnidirectional emission); environment (shallow vs deep).
- **Behavior / rules:** The boat does not "blast 100 dB this way"; it spreads its (e.g., 31.5) dB in every direction, "which actually causes it to attenuate quite dramatically." This is why a big nominal dB still yields modest detection ranges. The cited chart quantifies the falloff (−20 dB per decade of range from the reference).
- **Outputs / effects:** Rapid loss of received level with range; reconciles the large source dB with the relatively short measured detection ranges.
- **Edge cases / quirks:** In shallow water the sound "goes everywhere" and becomes "a nightmare to capture" / reflections make detectability collapse from ~30 mi to ~15 ft (referenced from a prior video).
- **Source:** -Q9AfTrF4vM
- **Confidence:** Med

### Acoustic layer / depth shadowing of sound
- **Models:** An acoustic (sound-speed) layer reflects sound; a submarine deep below the layer becomes very hard to detect because its sound bounces off the layer instead of reaching shallower sensors.
- **Inputs / parameters:** Submarine depth relative to the layer; presence/display of the acoustic layer (toggle "2" to view); source dB.
- **Behavior / rules:** The layer is shown "chilling down here"; sound from below it "goes boing" / bounces off, and the sensor's sound also bounces off it — so a deep boat is "very very unlikely to pick up." Demo: a Delta at ~90 dB would be expected at ~9 nm "if this were conventional," but taken deep (ordered to −800 / reaching ~1,150 ft, well below the layer) it was detected only at 3.5 nm. Rule: "traveling below the sound/acoustic barrier results in 75% less detectability." Going deep is THE counter to being loud.
- **Outputs / effects:** Detection range collapses (~75% reduction) when the submarine is below the acoustic layer despite high source level.
- **Edge cases / quirks:** The 3.5 nm deep-detection matched the chart's near-field value; you may only hear the boat "right as it goes ripping by" or not at all; crush-depth limits how deep you can go (the Delta's crush depth was unknown to the narrator).
- **Source:** -Q9AfTrF4vM
- **Confidence:** High

### Target Motion Analysis (TMA) / maneuver to refine passive range
- **Models:** Passive sonar gives bearing but poor range; an ownship turn produces bearing change that lets the sonar team triangulate (TMA) a better range.
- **Inputs / parameters:** Initial bearing-only contact (with an unreliable auto range estimate, e.g., 17 nm); ownship maneuver (a deliberate course/bearing change); sonar-crew TMA processing.
- **Behavior / rules:** On detection the sonar room "starts doing their target motion analysis (TMA)." The "pro sonar" move is to "execute a turn basically to try to get some bearing change on it in order to be able to read its range." Ordering the bearing change yields "a better listen" and lets the operator measure the true range (~4 nm vs the bogus 17 nm auto estimate).
- **Outputs / effects:** Improved range estimate on a passive contact after maneuvering; bearing change drives the TMA solution.
- **Edge cases / quirks:** The initial auto range estimate is explicitly unreliable ("mathematically unlikely"); without a maneuver the passive solution stays bearing-heavy/range-poor.
- **Source:** -Q9AfTrF4vM
- **Confidence:** Med
