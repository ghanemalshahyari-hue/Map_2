# CMO Functional Rules — Naval & Subsurface (Exhaustive)

**Scope.** Every caption-grounded behavior rule for *Command: Modern Operations* naval and
sub-surface warfare: submarine acoustics (self-noise, cavitation, the thermal/acoustic layer,
convergence zones), passive and active sonar (hull / towed-array / dipping / sonobuoy / SOSUS),
submarine propulsion and endurance (diesel-electric, AIP, nuclear), torpedoes (kinematics, guidance
families, DLZ/kinematic range, evasion/decoys), ASW search-and-prosecute tactics (search patterns,
sprint-and-drift, anvil/hammerhead attacks, airborne ASW), submarine- and ship-launched anti-ship
and cruise missiles, special underwater delivery (SDV/DDS), and surface-fleet screen/air-defense
geometry as it bears on the ASW/anti-surface fight.

**This file is exhaustive for the bucket.** It is the merged, de-duplicated union of every rule
extracted from *all* transcripts in the Naval & Subsurface bucket (157 raw extractions). Near-
identical mechanics seen in multiple videos have been merged into a single rule that keeps the
richest wording and cites **all** contributing `source_video_id`s. Where a naval rule below touches
the *general* damage/Pk/armor model (torpedo aspect, missile warhead/fire/flooding, point-defense
saturation, DLZ gating), the relevant general authority is inlined here so this file stands alone.

**Caveat.** Transcripts are YouTube **auto-generated captions** — unit names, weapon designations,
and especially numbers may carry transcription errors (e.g. "Cheval" = Shkval, "McKinatic" =
kinematic, "Toad array" = towed array, "duik"/"659T" garbles). Stated numbers are captured
**verbatim** and are almost always *single-engagement illustrations from one database unit*, not
documented constants. Confidence tags reflect how directly the rule was shown.

---

## 1. Acoustic signatures & self-noise

### Platform acoustic signature / noise level (decibels) drives passive-sonar detectability
- **Models:** how loud a vessel is at a given throttle, and how far that noise propagates so others can hear it.
- **Inputs / parameters:** platform self-noise in decibels at each throttle band (Creep / Cruise / Full / Flank); throttle setting; environmental water conditions; sea state.
- **Behavior / rules:** each platform has a per-throttle decibel signature shown at the bottom of its DB entry. Quiet diesel ~100 dB at full throttle; very modern SSN (Seawolf-class) ~95 dB max; Victor 3 ~110 dB; Romeo diesel ~115-117 dB; modern AIP diesel ~90 dB. Stated verbatim: *"when you're dealing with decibels 1 decibel is the equivalent of squaring"* — i.e. each +1 dB roughly squares the acoustic intensity, so a few extra dB hugely increase detection distance. Demonstrated: at 10 kt same depth (shallow), AIP diesel (90 dB) detected at 3.4 nm, classic SSN (loud) ~3 nm, Seawolf (95 dB) at 2.4 nm — *"those extra few decibels make a huge difference."* Higher decibels = detected at greater range.
- **Outputs / effects:** range at which a passive sonar acquires the platform; whether the platform is detected at all.
- **Edge cases / quirks:** in choppy/high sea state (state 3) ship noise (e.g. 126 dB) still carries; nuclear subs make noise constantly even when stopped because reactors must stay cool, so a parked SSN 1 nm away was "instantly detected" while a stopped diesel/electric makes essentially none.
- **Source:** 4_iJSkAkMrs
- **Confidence:** High

### Own-ship radiated noise (decibels) scales with speed and gates acoustic-seeker lock
- **Models:** a ship's radiated noise rises with speed (in dB) and drives how easily a torpedo's acoustic seeker can lock on, and how far passive listeners hear it.
- **Inputs / parameters:** ship speed (creep / standard / flank); resulting radiated noise in dB (e.g. ~19-20 dB slow, 33 kt "standard", up to 127 dB at flank); a ~1.5 dB extreme-quiet floor floated hypothetically.
- **Behavior / rules:** as speed drops, radiated noise falls (~19-20 dB is "nothing, very very quiet"; full speed reaches 127 dB). The operator minimizes dB to reduce the chance an acoustic-seeking torpedo locks. Against a purely acoustic (non-wake) torpedo, getting quiet and outside the seeker cone can defeat it; against a wake-homer, low dB alone is insufficient (see wake-homing rule).
- **Outputs / effects:** lower dB → lower acoustic detectability and lower acoustic-seeker lock probability; against acoustic-only seekers this can break/avoid lock, but not against wake-homing.
- **Edge cases / quirks:** specific dB readings are demo telemetry, not stated thresholds; only "1.5 dB" is floated as a hypothetical "too quiet to be struck" question (left unanswered — the wake-homer still hit). Noise reduction helps acoustic seekers only.
- **Source:** Sro2YR5zSSQ
- **Confidence:** Med

### Cavitation (speed-vs-depth bubble noise penalty); "Avoid Cavitation" order
- **Models:** propeller cavitation creating a loud bubble cloud that can be louder than the hull itself; the onset speed is depth-dependent.
- **Inputs / parameters:** speed/throttle; current depth; water depth (shallower water lowers cavitation-onset speed); per-hull cavitation-speed threshold (e.g. Norfolk = 13 kt); "Avoid Cavitation" toggle.
- **Behavior / rules:** above a speed threshold the platform "cavitates" (shown by a `CAV` / `cavs` tag). Verbatim: cavitation *"can actually be louder than your ship itself and makes you much easier to detect on broadband scans."* The cavitation-onset speed depends on depth: *"the shallower you are the lower speed your cavitation starts"* — so to use high speed you must go deeper, otherwise you cavitate. An **Avoid Cavitation** order caps speed just below the cavitation threshold for the current depth (slows the platform slightly). A submarine diving to reach full speed is doing so specifically to avoid cavitating. Combined with Sprint-and-Drift, the unit sprints up toward its desired speed but Avoid-Cavitation keeps each sprint below the cavitation limit.
- **Outputs / effects:** large increase in radiated (broadband) noise, greatly raising detection probability; Avoid-Cavitation caps max usable speed (e.g. towed-array search ~10 kt; sprint phase capped at the 13-kt onset).
- **Edge cases / quirks:** while cavitating you also can't hear well yourself (*"if you're going to cavitate you're not going to hear anything sneaking up on you"*). Depth-dependent: the same speed is safe deep but loud in shallow water. Sprint phase is the loud/deaf phase; drift phase is the listening phase — Avoid-Cavitation reconciles the two.
- **Source:** 4_iJSkAkMrs; 2BlkGRBfxtU; 7Bh85no2ge4
- **Confidence:** High

### Self-noise from own speed degrades own sonar (listening-speed / steerage rule)
- **Models:** the faster a pinging/listening platform moves, the more self-noise it makes, hurting its own detection performance — so you slow down to hear.
- **Inputs / parameters:** own platform speed; thresholds named across videos: steerage ~2 kt, creep, ~8 kt "steerage" ideal, 8-10 kt "pretty safe" search speed (even 10 kt is "pretty quick").
- **Behavior / rules:** using any sonar, own speed has a big impact on detection; ideal practice is to slow to ~"steerage"/~8 kt (or creep/~2 kt right before an expected contact) to reduce self-noise in the water while searching. Slower = better passive detection; this is the reason Sprint-and-Drift exists (you cannot listen while fast). See §10 for the surface-ship own-speed-vs-detection-range curve, which quantifies this for one hull.
- **Outputs / effects:** lower own speed → less self-noise → better detection range/quality; higher speed → degraded sonar.
- **Edge cases / quirks:** qualitative guideline (~8 kt "steerage", or creep/~2 kt) — no exact penalty curve stated here (the curve is in §10). Faster speeds trade detection for repositioning.
- **Source:** wKXTZu2pNo4; 2BlkGRBfxtU
- **Confidence:** Med

### Nuclear submarines always make noise (no silent-stop); diesel-electric can hit ~0 dB
- **Models:** a nuclear sub can never fully silence — the reactor must keep running, so it always radiates some noise; a diesel-electric at a full stop radiates essentially nothing.
- **Inputs / parameters:** propulsion type (nuclear vs diesel-electric); stop/idle state.
- **Behavior / rules:** a nuclear sub *"can't actually stop making noise"* — at idle it still radiates (Seawolf example = **10 dB at idle**, because the reactor can't be shut down without overheating), so a parked SSN 1 nm away is "instantly detected." A diesel-electric at a true full stop makes effectively **zero** acoustic noise: a depth-charge-armed ASW ship parked ~20 ft directly above a stopped diesel had "no idea in the universe" a sub was there — but the instant the sub is given even **one knot** of speed it is detected instantly.
- **Outputs / effects:** a non-zero noise floor for nuclear subs at all times (~10 dB idle), making them always at least faintly detectable passively; diesel-electrics can become passively undetectable at a full stop.
- **Edge cases / quirks:** the reactor floor (~10 dB) is irreducible. Shore/bottom-proximity range reductions (§5) still help a nuke hide, just less than a fully-stopped DE sub. Even 1 kt breaks a stopped DE sub's silence.
- **Source:** 4_iJSkAkMrs; GCw3lt2s7Qo; pUnPoUGluIU
- **Confidence:** High

---

## 2. The acoustic layer, convergence zones & passive detection

### Acoustic layer (thermocline) — above-vs-below-layer detection asymmetry
- **Models:** the ocean thermocline: a depth band where temperature/pressure change rapidly, splitting acoustic propagation into an above-layer and below-layer regime. Sensors on opposite sides of the layer from a target struggle to hear it.
- **Inputs / parameters:** layer depth and thickness (viewable via F2 / mouse-over the sea; presets selectable, also manually settable on a sub; example band -131 ft to -217 ft); platform depth relative to the layer; sensor type (hull-mounted vs towed/variable-depth); water depth (shallow water removes the duct effect).
- **Behavior / rules:** a platform **above** the layer is easy to hear from the surface but cannot hear (or be heard by) things below it; a platform **below** the layer is hard to detect from the surface but also can't hear above it. Hull-mounted sonar is *"always going to be shallower because it's connected directly to the ship; it can never see through the acoustic layer."* Towed/variable-depth sonar (TASS/VDS) is sensitive **below** the layer (very low frequency). If sensor and target are on **opposite** sides, detection becomes very difficult or impossible — demo: a sub ordered shallow while the hunter dove deep went "completely gone." Crossing to the **same** side as the target (diving "deep deep deep" where no layer exists) restores detection **and** allows classification (not just detection). Counterintuitive demo: a sub just below the layer was detected first because the frigate's towed array reflected sound off the seabed into the array; a deep diver was caught by the towed array at ~8-9 nm while a sub at "bow layer" (just above the layer) wasn't detected until 3 nm.
- **Outputs / effects:** determines whether a given sensor can detect/classify a given sub at all, and at what range; reverses the "who is detected first" ordering depending on whether the searcher uses hull-mounted vs towed sonar; a thick layer can make a sub inside it effectively invisible with room above and below.
- **Edge cases / quirks:** in shallow water there is no convergence zone / duct, so a sub loses its long-range hiding advantage but is also harder to detect at a distance; towed arrays can't deploy in water that is too shallow, leaving the ship "completely incapable" of detecting a sub below the layer. At low latitudes / equator the layer-loss problem is a known, complicated issue. Getting physically right on top of a lost target can reacquire it by direct listening. Identify a sensor's band by inspecting it (low-frequency = below-layer; hull sonar = above-layer).
- **Source:** Nk5M6gYaEvI; mcTpZ8-86Q4
- **Confidence:** High

### Convergence zones (CZ) — annular passive detection rings
- **Models:** sound bouncing between surface and deep ocean refracting back up at periodic ranges, creating concentric detection bands separated by gaps.
- **Inputs / parameters:** water depth (deep water required); sound source; sonar listening depth.
- **Behavior / rules:** when selecting a deep-water sonar platform, faint concentric rings appear: you can hear a target inside a CZ band, lose it in the gap, then reacquire it when closer (the sound "bounces" over distance from the center point). CZs require deep water — in shallow water (e.g. off Sri Lanka, or the shallow Strait of Hormuz) *"there's no convective zone... the water is so shallow you don't get that effect,"* which makes the sub much harder to pick up at long range.
- **Outputs / effects:** adds outer detection rings to a platform's passive sonar coverage; losing CZs in shallow water shrinks effective long-range detection.
- **Edge cases / quirks:** doubles as a stealth factor — deliberately moving into shallow water to "lose my CZs" makes a firing sub much harder to detect.
- **Source:** Nk5M6gYaEvI
- **Confidence:** High

### Convergence zones / layer depth depend on latitude and temperature
- **Models:** long-range CZ formation and the depth of the acoustic layer vary with both water temperature and latitude (distance from the North Pole).
- **Inputs / parameters:** latitude; water temperature; depth of the acoustic layer.
- **Behavior / rules:** CZs are stated to depend on **both** temperature **and** how far you are from the North Pole; an update corrected an older calculation that didn't account for latitude. Practical rule: the further up in latitude you go, the **deeper** the acoustic layer sits (and near the pole the layer may not exist at the depths shown). Therefore submarine operations must be significantly **deeper** at high latitudes to exploit below-layer / CZ detection.
- **Outputs / effects:** detection range and the depth at which the layer sits change with latitude; affects whether sensor and target are on the same side of the layer.
- **Edge cases / quirks:** near the North Pole the F2 depth view may show **no** acoustic layer at the displayed depths; a deep sensor can then both detect and classify with no layer to block it. Physical derivation is on the website; only the qualitative latitude→deeper-layer rule is given in-game. No verbatim formula stated.
- **Source:** mcTpZ8-86Q4
- **Confidence:** Med

### Surface-ship passive detection range vs own speed
- **Models:** a surface ASW ship's own self-noise from speed degrades its passive (hull) sonar detection range against a submerged target.
- **Inputs / parameters:** searcher own speed in knots (0, 5, 10, 15, 20, 25, 30, 33); passive hull sonar; submerged target (~200 ft). Detection range = closest approach at first detection.
- **Behavior / rules:** observed passive detections by speed (Oliver Hazard Perry hull sonar): **30 kt** (flank) and **25 kt** → no detection / sailed right over (25 kt gave only a last-second ~1.4 nm detection in one pass); **20 kt** → ~1.1 nm (also 1.5/1.6 nm other passes); **15 kt** → ~1.5 nm; **10/15/20/25 kt** all detect within ~0.3 nm of each other (roughly the ~1 nm class); **5 kt** → ~5.7 nm; **0 kt** (parked) → ~6.3 nm. Stated rules: **0 kt and 5 kt give essentially the same radius (~5.7-6.3 nm)**; going **5→10 kt removes about two nautical miles** (down to ~4 nm); any **15-20 kt reduces max radius to about one nautical mile**; anything **>20 kt = probably detectable yourself** and very poor as a searcher; **5→10 kt is about a 20% reduction** in detection range, which can be huge against a very quiet target.
- **Outputs / effects:** passive max detection range (nm) as a function of own speed; very high speeds make ASW search ineffective.
- **Edge cases / quirks:** numbers vary pass-to-pass (estimates of closest approach). A "19 nm" initial readout was a likely misprint (real ~3.5 nm for that towed-array case). A 30-kt searcher repeatedly failed to detect the sub at all.
- **Source:** 2-MOJNezMeo
- **Confidence:** High

### Stationary platform gives no extra passive listening benefit beyond zero-speed range
- **Models:** a ship sitting still does not hear better than one creeping slowly; the benefit comes from low own-noise, not from being a large hull.
- **Inputs / parameters:** searcher speed = 0; hull size; passive sonar.
- **Behavior / rules:** a parked (0 kt) frigate detected the target at ~6.3 nm — essentially the **same** radius as 5 kt (~5.7 nm). The large stationary frigate had "no specific benefit" for underwater listening beyond what its zero speed already provided. You can get surprisingly close to a submarine before a stationary ship detects it.
- **Outputs / effects:** zero-speed detection radius equals the 5-kt radius; no hull-size bonus to passive listening.
- **Edge cases / quirks:** 0 kt and 5 kt treated as equivalent.
- **Source:** 2-MOJNezMeo
- **Confidence:** High

### Target speed couples detectability and classifiability (faster = louder = easier to ID)
- **Models:** a faster target is both easier to detect **and** easier to classify; slowing degrades both for the searcher.
- **Inputs / parameters:** target speed (e.g. ~12 kt vs ~5 kt); own passive sensor.
- **Behavior / rules:** holding all else equal, faster targets are picked up almost immediately and classified easily; reducing speed (12→5 kt) makes them both harder to detect and "vastly more difficult to identify" (less acoustic energy / less narrowband spectra to work with). At low speed detection can still eventually succeed as a faint trace, but exact-type classification may fail (you may only declare a generic "subsurface contact"). When a sub flees a torpedo at high speed it becomes very quick to classify (see §7).
- **Outputs / effects:** detection range/probability and classification confidence both rise with target speed and fall as it slows.
- **Edge cases / quirks:** at ~5 kt the contact may be barely a faint line; speeds quoted are demo settings, not stated thresholds.
- **Source:** PMTfEjrclcc
- **Confidence:** High

### Target depth degrades localization & identification; own depth lowers background noise
- **Models:** a target at its proper/deeper operating depth is harder to localize and identify; ordering own platform deeper lowers background noise and improves contrast.
- **Inputs / parameters:** target operating depth; own-platform depth; ambient/background water-noise level.
- **Behavior / rules:** when a contact slips to its proper depth, TMA math gets harder (position harder to pin) and identification degrades — the deeper contact's solution lagged the shallower ones (final-detected distance ~half that of the easy ones in the demo). Separately, ordering **own** platform deeper reduces background noise, raising contrast so the same contacts become much more obvious on the narrowband display and far easier to identify.
- **Outputs / effects:** deeper target → slower/worse localization and ID; deeper own-platform → lower background noise → better contrast and easier ID.
- **Edge cases / quirks:** qualitative — no numeric depth thresholds. The benefit of going deeper is attributed to falling background noise, not to the target getting louder.
- **Source:** PMTfEjrclcc
- **Confidence:** Med

### Broadband vs narrowband displays; spectral (tonal) signature matching for classification
- **Models:** broadband shows loudness-by-bearing for **detection**; narrowband shows frequency content for **classification**; a contact is identified by matching its received tonals against a candidate's expected spectra.
- **Inputs / parameters:** bearing axis; received acoustic energy per bearing; per-bearing frequency spectrum (waterfall); candidate platform's expected "display signature"; range (sets which frequency lanes are receivable).
- **Behavior / rules:** broadband = how loud the water is along each bearing (spot that *something* is there, e.g. a loud return at 270). Narrowband = what the sound on a bearing is made of (frequency tonals). Workflow: detect on broadband (assign trackers to loud bearings), then switch to narrowband to read distinctive tonal blips per direction; open the contact's signature display and compare received tonals to the candidate library. High-frequency tonals are **not** received at long range, so candidates can be narrowed by which frequency lanes are present. When received spectra match a candidate's expected spectra (e.g. two low tonals matching), classify confidently (e.g. Delta IV) and set allegiance (assumed hostile). In Command the onboard crew (auto-crew) does this matching **automatically**.
- **Outputs / effects:** broadband → bearing of energy peaks (detection); narrowband → frequency tonals per bearing (classification input); contact classified to platform type and assigned allegiance.
- **Edge cases / quirks:** at low target speed there is too little narrowband spectra to distinguish the exact variant even when the broad class is obvious; high-frequency lanes drop out with range. Classifying a contact can optionally drop the track, forcing reacquisition.
- **Source:** PMTfEjrclcc
- **Confidence:** High

### Submarine propulsion type vs time-to-classify (nuclear identified first)
- **Models:** nuclear, AIP, and diesel-electric subs are **detected** at similar ranges when all submerged at equal speed/depth, but differ in how quickly they can be **classified** (identified by type).
- **Inputs / parameters:** propulsion type (nuclear / AIP / diesel-electric-on-battery); all subs at equal speed and equal depth; selected propulsion mode (electric, AIP, diesel); searcher (Oliver Hazard Perry).
- **Behavior / rules:** when all three run submerged on quiet plants at equal speed/depth, **detection** (initial contact) happens at about the same time for all three. **Classification** order differs: the **nuclear** sub is identified by type **first** because reactor noise is "so distinctive." The AIP and diesel-electric (on battery) subs are not classifiable until the searcher nearly passes over the top of them; AIP classified next, the battery-electric Kilo classified **last**. Core rule: nuclear subs are **easier to identify** than their diesel and AIP equivalents (always picked up/identified first).
- **Outputs / effects:** type-classification timing/order; detection range itself roughly equal across types when submerged and quiet.
- **Edge cases / quirks:** differences are "more a tactical decision than an acoustic decision" for raw detection. AIP did "a little bit better" than electric in one run. Surface/snorkel and high speed change this (next rule).
- **Source:** JCm6oIw7oGM
- **Confidence:** High

### Near-surface / periscope-depth diesel running → immediate identification
- **Models:** running diesel engines at/near the surface produces a distinctive frequency that makes the sub immediately identifiable acoustically; being near the surface also makes it visually detectable.
- **Inputs / parameters:** depth (periscope/surface vs submerged); engine in use (diesel vs AIP/battery); weather/visibility.
- **Behavior / rules:** when subs come up to periscope depth and run **diesels**, the diesel-running sub is **identified immediately** (distinctive diesel frequency), while subs at the same range not on diesels are heard at about the same time but not classified as fast. Demo: a sub left on **AIP** at periscope depth was **not** immediately identified (only diesel-runners were). The nuclear sub remained unidentifiable until much closer, where its "super-duper low frequencies" become classifiable. Rule: anywhere near the surface you are not only equally detectable but **also easier to identify**.
- **Outputs / effects:** immediate type identification for diesel-on-surface; near-surface increases both acoustic-ID ease and visual detectability.
- **Edge cases / quirks:** weather deliberately worsened (heavy overcast) so the periscope couldn't be spotted visually "for free" — without radar you can't see through it. Detection **range** for the three was about equal; only **identification** differed by propulsion/engine state.
- **Source:** JCm6oIw7oGM
- **Confidence:** High

### Passive contact starts bearing-only → Target Motion Analysis (TMA) localizes it
- **Models:** passive sonar first yields only a bearing line; repeated bearings over time (running bearings) plus own-ship motion resolve range/course/position.
- **Inputs / parameters:** successive passive bearing measurements over time; own-ship motion; assumed/estimated target speed and heading; (manual) two timed "mark position" stamps.
- **Behavior / rules:** on first passive contact the system reports only that N submarines lie somewhere along a bearing (no range). TMA: as time passes and own ship moves, new bearings are taken; by assuming target speed/heading and "doing the math," a fit line is merged against the running-bearing data until it converges on course → position. **Manual TMA worked example:** right-click "mark position" at T1 and again 2 min later; 1240 m traveled in 2 min → 1240/2 = 620 m/min → 620/60 = 10.33 m/s → ~**20 kt** (quick rule: m/s × 2 ≈ kt); 620 m/min ≈ **0.7 nm/min** (≈0.7 nm per 2-min tick on the map); course = bearing of the line through the two marks (result **140°**). These feed an intercept.
- **Outputs / effects:** from a bearing-only fan, TMA produces a localized position, course, and depth per contact, plus target speed and per-minute distance for planning an intercept.
- **Edge cases / quirks:** no range until TMA converges; the solve is faster with more bearing spread (own-ship maneuvering). In Command the towed array updates effectively instantly; in the Dangerous Waters comparison the towed array must physically catch up to own ship before reading true. A smart skipper who slows and zig-zags breaks the constant-course/speed assumption.
- **Source:** PMTfEjrclcc; dApaT5CcfS8
- **Confidence:** High

### Acoustic masking by a louder ship — masking angle grows with depth difference
- **Models:** a loud civilian ship (e.g. very large cargo vessel) masks a nearby submarine from passive sonar; the masking is geometric and **weaker** the deeper the target is relative to the masker.
- **Inputs / parameters:** loud masking-ship position; submarine position and **depth**; listener position; line-of-sight from listener through target relative to the noise source; "masking angle" = the 3-D angular separation between masker and submarine as seen by the listener.
- **Behavior / rules:** a sub hidden behind a loud ship (small angular separation as seen by the listener) is masked and not detected. Because depth adds a vertical component, a **deeper** sub has a **greater** masking angle (greater 3-D separation from the surface noise source) and is therefore detected **more** readily than a shallow sub at the same horizontal range. So **the deeper you go, the less effective another vessel's masking is.** Detection also depends on LOS: a listener whose LOS to the sub does not pass close to the noisy ships can detect it, while a listener lined up so the sub sits near the masker stays blind.
- **Outputs / effects:** detected vs masked status per sub; depth and listener geometry decide which masked subs are picked up.
- **Edge cases / quirks:** a shallow sub with **no** masker is detected instantly (~3 nm). Demo: of two masked subs at equal horizontal range, the **deep** one (max depth ~344 ft) was detected (larger masking angle) and the shallow masked one stayed hidden — counterintuitive vs the "deep = quiet" rule because masking geometry dominates here.
- **Source:** 6kxB4hJsHsI
- **Confidence:** High

### Self-masking when the listener nears any loud noise source; don't cluster ASW assets
- **Models:** as an ASW ship approaches a loud noise source, that source masks the listener from sounds around it; co-located ASW ships mask each other (and themselves) — the "soccer goalie" problem.
- **Inputs / parameters:** listener-to-noise-source distance; relative bearings of targets vs the loud source; geometry of own surface group relative to own/fixed sonar arrays.
- **Behavior / rules:** as a listening Perry got physically closer to loud cargo ships it began **masking itself** from all the sound around them and **lost** both previously tracked subs. Rule: ASW vehicles should **not** be placed near each other or near loud contacts, or they mask each other. At fleet scale, if a carrier group "gets in the way of my little underwater microphones, I'm not going to be able to hear anything" — reposition the group out of the listening line, and use a towed array dragged behind a ship so it hears in the direction away from / behind the group as it leaves.
- **Outputs / effects:** loss of tracks as the listener nears a loud source; reduced detection for clustered ASW units; loss/recovery of coverage depending on own-force geometry.
- **Edge cases / quirks:** tracks can be reacquired once the listener gets very close to the subs themselves (direct/short-range listening), but identification still requires passing nearly overhead. A towed array specifically restores rear/away-facing detection while transiting away from the threat.
- **Source:** 6kxB4hJsHsI; ZSVjL25akYU
- **Confidence:** High

### Environmental effects on sonar (rain, wind/sea state, temperature, seabed, sea-state weather)
- **Models:** weather and bottom composition modulate how well passive sonar works and how sound reflects; high sea state degrades both sonar and radar.
- **Inputs / parameters:** rain intensity; wind / sea state (Sea State 3 "choppy and loud"; Sea State 4 "awful"); water temperature; seabed material (rock vs sand/mud); water depth; cloud cover.
- **Behavior / rules:** heavy rain: "the pure sonar operators are never going to be able to hear a thing." High wind/rough sea churns the water and suppresses passive detection (good for a hiding sub, bad if you must attack — rely on a datalinked track). Temperature + depth set the CZs/layer. Seabed: rock reflects sound much harder than sand; a sub can park on the seabed and "turn invisible" if it shuts everything down. **Clouds do not affect sonar** (but interfere with laser designation). Sea State 3 (126 dB ship) did **not** mask the ship. Quantitative weather example: a SOSUS-rated nuclear-sub detection of "350 to 400 miles" was hand-reduced to "300 to 350 miles" for Sea State 4 + light rain. Rough water also makes a periscope "pretty tough to detect" by radar. *(See §14: rough seas/terrain also degrade detection of sea-skimming missiles.)*
- **Outputs / effects:** reduced passive detection range in rain/high wind; altered reflection and CZ/layer geometry from temperature/seabed/depth; reduced radar/periscope detection in high sea state.
- **Edge cases / quirks:** in bad weather "passive sensors are basically useless up to a certain range," forcing reliance on active or external cueing. Deeper water = easier to detect a sub (more reflection) but gives the sub more room to hide. The 400→300-350 mi figure is a manual operator estimate; the game applies the reduction internally.
- **Source:** 4_iJSkAkMrs; ZSVjL25akYU; GCw3lt2s7Qo
- **Confidence:** Med

### Proximity to ocean floor / shore collapses detection range (~10%)
- **Models:** operating close to the seabed / shoreline collapses **both** passive and active detection ranges for everyone, due to bottom reflection/absorption and ambient clutter.
- **Inputs / parameters:** bottom depth / proximity to seabed and shore; bottom type (sand/mud vs stone); ambient noise (wind, rain, waves); sensor-platform depth.
- **Behavior / rules:** deep open ocean — a Constellation frigate detected a sub at **26 nm** with its VDS (towed-body/CAPTAS). Same sub type only ~20 ft off the bottom — detected at only ~**2.6-3 nm**: 2.6/26 ≈ "**~10% of the detection range when close to the shore**" (roughly a 10× reduction). The degradation is **symmetric**: it cuts submarine-vs-ship detection too (kilos near shore detected an incoming frigate only at ~2.1 nm / <1 nm "knife range" vs several nm in deep water). It applies to **surface** detection as well, not just subsurface. Bottom type matters: soft sand/mud absorbs+reflects; stone is more chaotic.
- **Outputs / effects:** all acoustic detection ranges (passive and active, both directions) shrink to roughly **10%** near the seabed/shore relative to deep water.
- **Edge cases / quirks:** unclear whether CMO also models a hard bottom making the sub itself **louder** (hull reflections). Weather/ambient noise was intentionally raised for realism (wind → louder waves, rain → louder water; clouds have no acoustic effect). The ~10% figure is from one example pair.
- **Source:** GCw3lt2s7Qo
- **Confidence:** High

---

## 3. Sonar sensor types (hull / towed array / SOSUS / PCL)

### Towed array (TASS / VDS) — depth, rear bearing, and shore constraints
- **Models:** a towed array/VDS body streams behind the host and can be deployed **below** the acoustic layer to hear targets the hull sensor cannot; it is the most sensitive deep-water sensor but unusable inshore.
- **Inputs / parameters:** towed-array deployment depth (settable, can be below the layer); host depth; target depth/side of layer; target bearing relative to host (front vs rear); water depth / shore proximity; deploy/retract toggle.
- **Behavior / rules:** the towed array "dips" **below** the layer, so a host **above** the layer can still detect a target below it. The array is towed **behind** the host, so its detections appear to the **rear**, not the front. If the host itself dives below the layer, its hull sensor goes below too and can lose targets that are above. Toggling the array on makes it "much much easier to listen as we leave" — improving passive detection especially astern, where the hull/own-group would otherwise mask. **Quantitatively:** with the towed array at 10 kt, detection occurred at ~**3.5 nm** vs hull-only — framed as roughly **half the speed giving about twice the detection radius** ("about twice," not more than twice). **Shore constraint:** a platform too close to shore **cannot** use its towed array — dragging it across a shallow bottom would snag it on a rock and snap it off; such platforms fall back to less sensitive sensors. To make a deep-vs-shallow comparison fair, the deep ship's towed array was manually removed (it still detected via its VDS/CAPTAS).
- **Outputs / effects:** detection of below-layer targets from an above-layer host; bearing geometry biased to the stern; extended range (≈2× at half speed); availability gated by depth/shore proximity.
- **Edge cases / quirks:** only some platforms carry a towed array. The array has a **fixed operating depth** — if the target sits **shallower** than the array, the array can pass under/over it and **miss** it despite the range advantage (the "19 nm" misprint case was really ~3.5 nm). VDS/CAPTAS remains usable when the towed array isn't.
- **Source:** mcTpZ8-86Q4; ZSVjL25akYU; 2-MOJNezMeo; GCw3lt2s7Qo
- **Confidence:** High

### Sonar baffles — rear acoustic blind cone, and baffle-clearing maneuvers
- **Models:** a submarine/ship cannot hear directly astern because its own machinery/propeller noise masks that bearing (a Pac-Man-shaped blind cone).
- **Inputs / parameters:** platform heading; own-propeller noise; presence of a towed array (can fill the baffle); bearing to contact relative to the stern; a rapid course change.
- **Behavior / rules:** passive coverage shows a cut-out cone directly behind the platform — *"the submarine cannot hear anything behind itself."* Heading directly toward a contact presents "our entire baffles" to it. A towed array stowed behind the platform (or a wide-aperture trailing array) can cover this blind spot. To detect threats astern you must periodically turn ("clear your baffles"). Demonstrated baffle-clearing patterns: 90° course-reversal legs of equal length (e.g. 1.7 nm legs; the 0.7 comes from "the tangent of 45 degrees"), or a square-wave zigzag set **opposite** the target's own zigzag so both periodically clear baffles. An attacker that slips into a target's baffles can take a "free shot" that the target never hears.
- **Outputs / effects:** defines a rear arc with no passive detection; maneuvering trades speed/position to periodically cover it; getting into a destroyer's or sub's baffles negates its 360° sonar ring.
- **Edge cases / quirks:** zigzag legs "can't make them too big" but if too small they're ineffective; smaller tacks minimize baffle-pointing time; avoid cavitating during the turns or the maneuver noise gives you away. A straight-line beeline intercept blinds you to the threat astern.
- **Source:** YugP2j3pX50; dApaT5CcfS8; wKXTZu2pNo4
- **Confidence:** High

### SOSUS / fixed bottom array — bearing-only cueing, type ID, ambiguous fix
- **Models:** a fixed seabed hydrophone line (a giant series of underwater microphones) detects subs transiting a chokepoint and provides an initial, sometimes very imprecise, cue.
- **Inputs / parameters:** the fixed array unit (a line across a strait / open ocean); transiting submarine; its acoustic signature/loudness; sea state/weather.
- **Behavior / rules:** SOSUS gives **bearing, not range** — *"won't tell you how far away anything is, but it'll tell you there's something interesting in that direction."* A target directly over/near the array can show an **estimated range of zero** and appear "right on top of it" — a large uncertainty cone, not a precise position. Over time it produces a bearing **line** for a better idea of position, used to vector an aircraft inward. With **multiple** arrays you can **cross-fix (triangulate)** a position. SOSUS can also **classify type** when the contact is loud enough (it identified a contact as a "Victor 3" in-game; estimated range from known detection ranges + signature loudness rather than from the array).
- **Outputs / effects:** initial detection + bearing/uncertainty cone to cue search assets; can read range 0 (uncertain) when overhead; possible type ID; triangulated position with 2+ arrays.
- **Edge cases / quirks:** the range-0 readout is an ambiguity artifact, not a real zero range. A loud/fast sub is picked up more readily; quiet/deep ones may never be detected. Contacts may be biologics (whales). Sea State 4 + light rain reduces the detection range used to bound the contact (see §2 weather rule).
- **Source:** dApaT5CcfS8; ZSVjL25akYU; i1WkusTHN7k
- **Confidence:** High

### PCL / passive coherent location receivers — NOT YET IMPLEMENTED
- **Models:** future detection of units via passive reflection of civilian radio/TV signals (passive coherent location).
- **Inputs / parameters:** broadcast-station facilities (newly added units); PCL receivers; ambient broadcast signals reflecting off targets.
- **Behavior / rules:** new broadcast-station facilities were added in anticipation of PCL receivers, which would detect units from passive radio signals (e.g. a TV signal bouncing off an airplane picked up by a special receiver).
- **Outputs / effects:** would provide passive detections without own emissions.
- **Edge cases / quirks:** explicitly **not** in the program yet — facilities exist but the detection capability is not active.
- **Source:** mcTpZ8-86Q4
- **Confidence:** Low

---

## 4. Active sonar

### Active vs passive sonar — emit-and-reveal, the intercept-range asymmetry, no ID
- **Models:** passive = listen only; active = emit a ping and listen for the return (like radar) — emitting reveals your position because the ping is heard much farther than it can detect.
- **Inputs / parameters:** sensor mode (active/passive) per unit; emitter's own active range; listener's acoustic-intercept capability.
- **Behavior / rules:** passive listens for noise; active broadcasts. **Intercept asymmetry (stated two ways):** in one video, "you can detect [with] active sonar three times the distance of what you can detect people with it" (heard at ~**3×** its own detection range); in another, acoustic-intercept range ≈ **2×** the ping's effective detection range (Seawolf ~70 nm ping → heard pinging out to ~140 nm; Oliver Hazard Perry weak set → heard out to ~10 nm). Treat as "heard well beyond its own range." An enemy with acoustic-intercept hears your ping and localizes you before you'd see them — the intercepting listener gets a contact even though it can't yet read the emitter's speed/direction, and the position-confidence polygon can be tight (~2 nm wide), already a sufficient targeting solution for an active-guided torpedo. Active gives a precise bearing/track **but "you can't actually identify the target"** — only that something is there (a "goblin"). Demo: a passive-only Perry tracked and ID'd a quiet Kilo via towed array, while an identical Perry pinging actively detected nothing useful (target below its hull-sonar layer) yet gave itself away. Active is a last resort, used only to finalize a targeting solution.
- **Outputs / effects:** active → precise bearing/track but no identification and broadcasts your location at ~2-3× range (tight confidence ellipse enables a torpedo shot); passive → stealthy but slower and weather-limited.
- **Edge cases / quirks:** helicopters dipping sonar default to **passive** even when commanded to dip — you must explicitly enable active. Turning active off instantly loses the contact ("lost that contact almost instantaneously"). Best practice: flip active on at the last second to avoid retaliation (some modern subs carry SAMs vs the helicopter). The emitter often knows nothing about the listener while the listener nearly pinpoints the emitter.
- **Source:** 4_iJSkAkMrs; Nk5M6gYaEvI; wKXTZu2pNo4
- **Confidence:** High

### Active sonar effective range is short in CMO (nominal vs real); scan interval
- **Models:** active sonar in CMO is far less effective than in arcade sub sims — real detection ranges are short and depend on the target's active-sonar cross-section; each system has a scan interval.
- **Inputs / parameters:** sonar system stats (range rating; scan interval — e.g. SQS-56 late-70s, ~5 nm range, **15-second** scan interval; BQQ-cube/BQQ-10 on Seawolf = 70 nm active+passive; BQS-24 Midas = active-only under-ice); target's active detection-range profile by aspect (dB strength).
- **Behavior / rules:** active detection ranges are short relative to advertised — targets ~5-6 nm away were only detected after pinging for a while; the SQS-56 = 15 s between returns (sound takes a long time to come back). A target's detectability is given as an **active-sonar response profile per aspect**: unarmed Narco sub = 8 dB front / 40 dB side / 8 dB rear; Typhoon = 40 dB front / 300 dB side (huge → very obvious). The frigate's weak SQS-56 frequently detected subs at near-zero range (one at "range of zero," another at 1.3 nm) while the Seawolf's powerful suite did the real detecting — illustrating how poor a weak/old active set is. Active-vs-passive **range gain is marginal**: by speed (Perry, AN/SQS-56 active+passive) — 25 kt → 1.4 nm (same as passive); 20 kt → 1.9-2.0 nm (slightly better); 10 kt → ~5 nm (best at that speed); 5/0 kt → ~5-5.6 nm (negligible over passive). Rule: active reaches ~**six miles up to ~15 kt**; 20-25 kt "don't matter much"; once past the cavitation range (~>15 kt) you lose reliable active engagement.
- **Outputs / effects:** whether/at what range a ping return classifies a contact; weak sets give tiny ranges (down to 0 nm), strong sets much larger; high own-speed kills reliability.
- **Edge cases / quirks:** detection can occur at literally 0 nm with a poor system. Subs in the scenario were "smart enough" not to flee when pinged.
- **Source:** wKXTZu2pNo4; 2-MOJNezMeo
- **Confidence:** High

### Target motion (Doppler) aids active detection; stationary targets still detectable
- **Models:** a moving target returns a Doppler-shifted ping that's easier to detect, but a non-moving target can still be picked up actively (unlike passive, which needs noise).
- **Inputs / parameters:** target speed (moving vs stationary); target depth relative to the layer.
- **Behavior / rules:** of two contacts, the moving one (5 kt) was easier (Doppler shift); the stationary one was still detected actively at ~**6 nm** despite zero speed, and active returns provided **depth and speed** on the contacts. Contrast: passively a stationary diesel-electric makes no noise and is invisible — **active sonar is the answer to a silent/stationary sub** (and to minesweeping and other no-passive-noise things).
- **Outputs / effects:** a contact with depth+speed attributes; moving targets detected more readily; stationary targets still detectable actively.
- **Edge cases / quirks:** active is specifically the counter to a zero-noise stopped DE sub.
- **Source:** wKXTZu2pNo4
- **Confidence:** High

### Acoustic layer blocks active returns by depth
- **Models:** a subsurface acoustic/thermal layer reflects active ping energy; a target on the far side of the layer from the emitter is shielded even if physically closer.
- **Inputs / parameters:** layer depth; emitter depth vs target depth (same side vs opposite side); target depth readouts (e.g. 131 ft = just inside/above layer; the layer boundary; -196.9 ft on the bottom); a favorable detection band shown ~-70 to -120 ft for a surface emitter.
- **Behavior / rules:** a target at 131 ft (inside/just under the layer) is detectable; a target on the floor at ~-197 ft is **below** the layer and the surface ship's pings ricochet off the layer ("bouncing off the acoustic layer") so it stays undetected even though physically closer than a detected one. The Seawolf, being deep/**under** the layer, detected the deep bottom-sitting sub (-197 ft, speed 0) when the surface frigate could not — being on the same side as the target is much easier. The tool-tip showed the favorable band ~-70 to -120 ft for the surface emitter; outside it (deeper, under the layer) the emitter was "making a ton of noise for almost nothing." Ordering a sub to dive under the layer changes which platform can hear it.
- **Outputs / effects:** active detection succeeds/fails based on whether emitter and target share a side of the layer; a deep listener under the layer detects deep targets a surface emitter cannot.
- **Edge cases / quirks:** physically closer targets can be undetectable if across the layer. Bottom interaction (sand/mud/stone) adds further complexity to returns.
- **Source:** wKXTZu2pNo4
- **Confidence:** High

### Active sonar baffles, beam pointing & broadside (90°) detection
- **Models:** active sonar coverage has baffles (a blind rear arc) and requires roughly pointing at/near the target; a ~90° beam aspect is the canonical detection geometry.
- **Inputs / parameters:** relative bearing of target to the pinging hull (on-beam ~90° vs in the baffles); a trailing-wire / wide-aperture array for rear coverage; target aspect.
- **Behavior / rules:** when the pinging hull turns so the target falls "just outside our baffles," the active track is lost ("can't hear it very well"); turning back to point at it regains the track. A trailing-wire / wide-aperture array lets a sub hear/reacquire contacts **behind** it (the rear arc the bow array can't cover) — a Seawolf "hears things behind you better because you've got that trailing wire," and reacquired a lost contact with its wide-aperture array. Active can also detect things directly **beside** you ("hear and see things next to you"), enabling a posture where you sit on a target's beam to both track it and listen for incoming weapons to the side.
- **Outputs / effects:** track held/lost depending on whether the target is within the active arc or in the baffles; rear contacts recoverable via the trailing array; beam-sitting doubles as a defensive listening posture.
- **Edge cases / quirks:** baffle = rear blind arc for the hull-mounted set; the trailing array covers it.
- **Source:** wKXTZu2pNo4
- **Confidence:** Med

### Aspect / target cross-section effect on active detection (damped by square-law)
- **Models:** how much of a target's surface the ping sees (nose vs broadside) affects return strength, but received energy scales with the **square of distance**, so for some geometries nose vs beam barely differ in realized range.
- **Inputs / parameters:** target aspect (bow-on vs beam/90°); target physical size/cross-section; range.
- **Behavior / rules:** for a tiny sub (small nose and small side), aspect made little difference. For a huge Typhoon, the side return is far larger (40 dB front vs 300 dB side). Yet in practice a Typhoon was detected at ~6 nm on the nose and at about the **same** ~5-6 nm on a perfect 90° beam — attributed to received energy spreading "at the square of the distance," so the much larger beam cross-section didn't translate into a proportionally longer detection range.
- **Outputs / effects:** return dB varies strongly with aspect for large targets, but realized detection range is damped by inverse-square spreading, giving similar nose-vs-beam ranges in the examples.
- **Edge cases / quirks:** counter-intuitive that 300-dB-side vs 40-dB-front yields similar detection range — explained by square-of-distance spreading. For small targets, aspect ~irrelevant.
- **Source:** wKXTZu2pNo4
- **Confidence:** Med

---

## 5. Depth, environment & operating limits

### Depth floor / shallow-water operating limits
- **Models:** water too shallow physically prevents a sub from submerging or transiting at depth.
- **Inputs / parameters:** local water depth; submarine size (sail height); commanded transit depth.
- **Behavior / rules:** if water depth is less than the sub's draft/sail clearance the sub "wouldn't even be able to hide our sail" and "can't actually travel at all" submerged (example: -66 ft water too shallow to hide the sail). You can order a transit at a specific depth only if the seabed allows (e.g. transit at 600 ft where depth was 659 ft). Shallow water also removes CZs and prevents towed-array deployment.
- **Outputs / effects:** constrains achievable depth; forces shallower/exposed operation in shoal water.
- **Edge cases / quirks:** double-edged — harder to detect a sub at long range (no CZ) but the sub can't dive deep to hide and towed-array hunters are disabled.
- **Source:** 4_iJSkAkMrs
- **Confidence:** High

### Ice shelf blocks air-dropped sonobuoys / under-ice concealment
- **Models:** submarines under an ice shelf cannot be prosecuted with sonobuoys; ice + shallow-noise / deep-slow running aids concealment.
- **Inputs / parameters:** ice-shelf boundary (yellow line on the map); sub depth (shallow = noisy vs deep = quiet); seafloor depth (e.g. ~800 ft off Greenland vs 8,000 ft trench).
- **Behavior / rules:** under the ice you "can't drop sonobuoys on him because they'd land on the ice and go conk." A sub hides by going under the ice **and** staying shallow — but shallow is noisy. Deep water (8,000 ft) "does very little" acoustically (hard to hear the bottom), and very-deep + very-slow subs are "very unlikely to pick up" (e.g. a missed Delta II going very slow and very deep; a missed Alpha at 12 kt). The ice's main benefit to the sub is denying overhead sonobuoy drops.
- **Outputs / effects:** inability to seed buoys under ice; lower detection probability for deep/slow/under-ice subs.
- **Edge cases / quirks:** you likely cannot drop a sonobuoy through ice at all; deep+slow contacts evade detection even with assets overhead.
- **Source:** ZSVjL25akYU
- **Confidence:** High

---

## 6. EMCON & emissions exposure

### EMCON / emissions exposure (mast, surface-search radar, active sonar give you away)
- **Models:** any active emission or surface-poking sensor can be intercepted (ESM/visual), revealing and getting a sub killed.
- **Inputs / parameters:** EMCON state per unit/sensor; whether mast/periscope/snorkel is above water; radar and sonar active states.
- **Behavior / rules:** submarine survival is about not being seen. Stated detection triggers: poke a mast above water → tracked visually ("mark one eyeball"); turn on a surface-search radar on the surface → detected by ESM; use active sonar → active-sonar intercept. Verbatim rule on active emitters: *"anything that's active can be detected at about 1.5 times the range of the thing that's emitting."* Setting EMCON locks sensors off; on entering a mission area units may auto-enable equipment, so **lock EMCON before transit**. A periscope-depth sub raises ESM masts to listen for any enemy radar (nav/air-search/jammer) and can then engage that emitter; American modern-sub periscopes are "tough to detect" but not impossible.
- **Outputs / effects:** each emission/exposure generates an interceptable signal that lets the enemy localize and engage you.
- **Edge cases / quirks:** two different multipliers are stated for how far an active emitter is heard relative to its own range — **3×** for active sonar (Nk5M6gYaEvI), **2×** in another active-sonar demo (wKXTZu2pNo4), and **1.5×** for active emitters generally (-3pP4_FAg68); treat as qualitative "heard well beyond its own detection range." A sub at periscope depth showing its mast was killed by aircraft on the surface ("please don't stick your mast out of the water").
- **Source:** -3pP4_FAg68; 4_iJSkAkMrs
- **Confidence:** Med

### Periscope/mast visual detection geometry (look-down vs look-across) and Doppler
- **Models:** spotting a raised periscope/mast visually is much harder looking **down** from altitude than looking **across** the surface; a moving periscope is easier via Doppler.
- **Inputs / parameters:** searching-sensor altitude/aspect (aircraft radar/visual looking down vs a near-surface look-across); searcher radar sensitivity; periscope/mast physical size; periscope-bearer's speed.
- **Behavior / rules:** looking **down** into the water at a periscope is much harder than looking **across** the water at it ("not the same thing"); a steep look-down from an aircraft repeatedly failed to get a periscope hit even nearly overhead. More sensitive radar helps (swap toward a P-8). Periscopes/masts are physically very small → poor radar targets. Moving fast while periscope-raised is "one of the easiest and dumbest things you can do" — it produces a **Doppler** shift that makes you much easier to detect; go slow (creep) to stay hidden.
- **Outputs / effects:** probability of a visual/radar periscope detection — lower with look-down geometry and small masts, higher with sensitive radar, close-aboard look-across, and any periscope motion (Doppler).
- **Edge cases / quirks:** even nearly overhead at close range the look-down angle prevented a hit. A raised periscope is also detectable on radar whenever up. Rough seas degrade periscope radar detection further (§2).
- **Source:** pUnPoUGluIU
- **Confidence:** Med

### Snorkel/visible-mast detection defeats acoustic masking
- **Models:** hiding in a ship's wake works only while fully submerged; any mast/snorkel above the water is visually detectable and removes the masking advantage.
- **Inputs / parameters:** whether any part of the submarine (snorkel/mast) is above the waterline; observers' visual sensors.
- **Behavior / rules:** you can hide in a loud ship's wake acoustically, but if anything is visible coming out of the water (e.g. a poked-up snorkel), observers can **see** it, which completely eliminates the masking technique.
- **Outputs / effects:** visual detection overrides the acoustic mask, exposing the sub.
- **Edge cases / quirks:** qualitative; ties masking effectiveness to staying fully submerged.
- **Source:** 6kxB4hJsHsI
- **Confidence:** Med

### Radar emission (ESM) self-betrayal; EMCON discipline (fleet scale)
- **Models:** active radar reveals the emitter to enemy ESM; you detect enemies by their emissions and vice versa. Distinct emitters are fingerprinted by type.
- **Inputs / parameters:** per-platform radar EMCON state (active vs off); enemy ESM sensitivity; emitter radar signature (Big Bulge A/J, Puffball, etc.).
- **Behavior / rules:** "if we turn our radar on, we're letting everyone [know]." Keep **everything dark** except the AWACS (E-2 Hawkeye, told to go active radar on station) and the intercepting fighters. Conversely, a Soviet Tu-95 was detected "at long range based on his radar emissions" ("should have left his radar off until closer"). Emitter fingerprinting: Big Bulge A comes from exactly one aircraft type → instant hostile ID; Big Bulge J = recon; Puffball = a different type. The correct enemy play is to leave radar off until close; the AI sometimes violates it, giving you a free long-range detection.
- **Outputs / effects:** passive (ESM) detections and type IDs of emitters; your own counter-detectability.
- **Edge cases / quirks:** ASW aircraft/ships keep radar off but may still use active sonar.
- **Source:** ZSVjL25akYU
- **Confidence:** High

---

## 7. Submarine propulsion & endurance

### Diesel-electric battery & propulsion endurance (snorkel & AIP); speed bands, noise, coasting
- **Models:** conventional subs run on finite battery underwater and must recharge via diesel (snorkel) or AIP; the trade is silence vs endurance. Noise rises with speed and depends on whether masts are out.
- **Inputs / parameters:** ordered speed band (creep / cruise / full / flank); depth/mast state (submerged vs periscope/snorkel with masts extended); battery charge level; presence of snorkel/AIP; doctrine recharge settings.
- **Behavior / rules:** a submerged diesel runs on battery; running fast drains it quickly. **Endurance examples:** a classic Romeo ~2 h at the test speed; a Kilo at "full" (10 kt) quoted "4 hours endurance... 40 miles"; at flank (~12-20 kt) ~1 h 20 min / 25 nm before batteries are "totally toast." Other tables: 4 days 20 h (shallow cruise), 1 month 1 week (snorkeling sibling at low speed), ~4 h 39 min / 46 nm at full. **Noise rises with speed** at a shared speed: ~15 dB vs 16.7 dB (snorkeling sibling), 47 dB vs 63 dB submerged, up to 88 dB at flank (~12 kt) and 69 dB at 15 kt. To recharge a non-AIP diesel you come up to **periscope depth and snorkel** (run the diesel on surface air) — which is **louder** than pure-electric at the same speed (16.7 vs 15 dB) because of the running diesels, not the depth. **Masts out** speed-cap the boat (the type shown couldn't exceed ~10 kt on flank — exceeding it bends masts, causes cavitation, and prevents recharging). **Coasting:** noise decays as speed bleeds off (still ~17 dB while coasting at 13 kt). At a true **full stop** a DE sub makes effectively **zero** acoustic noise (see §1 nuclear rule). A drained diesel can be forced to a near full-stop, unable even to creep, until recharged.
- **Outputs / effects:** available speed/range over time; per-speed radiated noise (dB); charging state; forced surfacing/stopping when battery depletes; recharge only at periscope depth (diesel) or port (AIP).
- **Edge cases / quirks:** masts/snorkel/periscope up → detectable on **radar** and speed-capped ~10 kt. AIP lets a diesel run diesel-speed submerged without surfacing, unlike a classic Romeo. A diesel that runs out mid-exercise was "incapable of completing" it and had to surface — a stated lesson for diesel players. Nuclear subs have effectively unlimited endurance/speed but are always somewhat noisy.
- **Source:** 4_iJSkAkMrs; JCm6oIw7oGM; pUnPoUGluIU
- **Confidence:** High

### Air-Independent Propulsion (AIP) as a third fuel source (submerged recharge)
- **Models:** some SSKs (e.g. Type 212) carry a third power source — AIP — letting them run **and** recharge the battery while fully submerged, at the cost of being non-renewable until port.
- **Inputs / parameters:** three tracked resources — diesel, battery, AIP; per-motor performance tables (AIP motor top speed 20 kt; electric motor top speed 20 kt) in "units per minute"; ordered speed; doctrine "Air Independent Propulsion usage" setting (engaged-offensive / engaged-defensive / always). AIP-boat submerged endurance ~1 h 9 min at flank; creep endurance hundreds of hours ("215 hours at creep", "100 hours").
- **Behavior / rules:** AIP is **non-rechargeable in the field** — refill only at port. AIP engagement is set in **Doctrine (Ctrl+Shift+F9)**, not via right-click; values: use when engaged-offensive, engaged-defensive, or "always." When AIP kicks in the sub switches battery→AIP automatically. At high speed (15 kt, ~69 dB) demand is so large that **AIP alone can't hold the battery** — battery still drains even with AIP on. As speed drops the battery/AIP draw ratio shifts: ~36 dB ran roughly equally off battery and AIP; at creep it ran **primarily on AIP** and barely touched the battery. With AIP set to "always" at low speed, AIP can be burned to actively **regenerate the battery underwater** — recharge submerged with no snorkel, staying undetectable to MPA. Turning AIP off at low submerged speed made **no** change to radiated noise (already quiet); a full stop kills noise and stops producing electricity.
- **Outputs / effects:** battery vs AIP draw ratio; battery charge (can rise underwater via AIP); AIP reserve (depletes, port-only refill); radiated noise; submerged recharge without exposing masts.
- **Edge cases / quirks:** AIP cannot keep up at high speed (battery still drains). No in-UI per-minute consumption rate is shown. Recharge-underwater-on-AIP is rare (few subs have it). Most scenarios don't start with full AIP — refilling is a long process.
- **Source:** pUnPoUGluIU; JCm6oIw7oGM
- **Confidence:** High

### Doctrine battery auto-recharge thresholds
- **Models:** sub doctrine auto-manages battery recharging by surfacing to snorkel/periscope depth at configurable charge thresholds, which differ by posture.
- **Inputs / parameters:** Doctrine panel (Ctrl+Shift+F9) recharge section: "recharge battery during transit" threshold; "recharge battery on offensive/defensive" threshold; current battery %.
- **Behavior / rules:** **"recharge battery during transit"** default example: at **60%** battery the sub automatically comes up to periscope depth and recharges. **"recharge battery on offense or defense"** default example: only do so at **10%** battery. Both thresholds are user-editable.
- **Outputs / effects:** sub autonomously climbs to periscope/snorkel depth and runs diesels to recharge when the relevant threshold is crossed.
- **Edge cases / quirks:** thresholds differ by posture (transit 60% vs offensive/defensive 10%) so an engaged sub stays deep/quiet much longer before exposing itself.
- **Source:** pUnPoUGluIU
- **Confidence:** High

### Auto-dive on tasking
- **Models:** a submarine ordered onto a task submerges on its own to an appropriate depth without an explicit depth order.
- **Inputs / parameters:** assignment of an order/tasking to a surfaced/periscope-depth sub.
- **Behavior / rules:** when ordered to do something, the sub dove automatically ("he Dove automatically, I did not tell him to do that"); the player can override (answer "no") to keep it at periscope depth instead.
- **Outputs / effects:** sub depth changes automatically toward a deeper/appropriate setting on tasking.
- **Edge cases / quirks:** player can decline the auto-dive prompt to hold periscope depth.
- **Source:** pUnPoUGluIU
- **Confidence:** Med

### Submarine speed vs torpedo escape; high speed makes a sub instantly classifiable
- **Models:** a fast enough submarine can outrun a torpedo, but running at high speed makes it very loud and easy to detect/classify, and it self-deafens its own towed array.
- **Inputs / parameters:** sub max speed (nuclear ~32 kt; AIP/diesel ~20 kt at flank); torpedo speed; whether the sub detects the launch; cavitation state.
- **Behavior / rules:** a nuclear sub at ~**32 kt** can literally **outrun** a Mark-46-class torpedo (the torpedo can't catch it), whereas ~20-kt boats (AIP/diesel) **cannot** escape. On being fired upon, a sub detects the launch within about "half a second," immediately turns away and accelerates ("books it"). Because it then races at high speed, all subs become very quick and easy to **classify**; the slower you go the quieter, the faster the easier to ID. At 20 kt a sub's **own** towed array is "basically going to be useless" (self-noise), and it is loud enough to be picked up by surface sonar.
- **Outputs / effects:** torpedo hit vs escape by relative speed; rapid classification once a sub flees; loss of own towed-array sensing at high speed.
- **Edge cases / quirks:** nuclear at 32 kt shown **not** cavitating, while a slower boat ordered to flank does cavitate. The nuclear's speed advantage defeats the weapon entirely. The standard sub torpedo-defense is "outrun + decoy" (see §9).
- **Source:** JCm6oIw7oGM; 2BlkGRBfxtU
- **Confidence:** High

---

## 8. Torpedoes — kinematics & guidance

### Torpedo dual-speed kinematics: practical/DLZ range vs kinematic range, and the speed-range trade
- **Models:** a torpedo can run fast/short or slow/long. The doctrine/data page exposes a **practical (DLZ) range** (best-chance-hit auto shot) and a longer **kinematic range** (slow the propeller to extend endurance, trading transit speed for distance).
- **Inputs / parameters:** torpedo speed settings (high vs low); target speed; data-block fields — practical range and kinematic range at given speeds; fuel burn per second; whether "allow kinematic launches" is enabled in doctrine.
- **Behavior / rules:** doctrine shows **two** ranges per torpedo. **Practical range** = within the weapon's DLZ given target speed, fired at HIGH speed → SHORTER range; **kinematic range** = how far it can be launched, fired at LOW speed → LONGER range. Worked examples:
  - **Mark-48 ADCAP (Mod7):** practical/automatic best-shot range **21 nm**; kinematic **27 nm @ 50 kt** (propeller slowed for endurance) and **20 nm @ 65 kt** (runs fast inside 21 nm); intermediate behavior in between.
  - **Generic example:** ~50 kt high speed with short range vs ~35 kt low speed with the longer kinematic range; "50 kt if launched <12 nm (automatic/practical), 35 kt at the 12 nm kinematic launch" — yet a separate "you cannot escape from me" assured-hit ring was only **5 nm**.
  - **Fizik-1:** cruise **70 kt for 11 miles** (~9-min run); low ("McKinatic") speed **30 kt for 22 nm**; fuel **4.66 fuel-points/sec at full speed** (≈ ~9 min of run time); observed slightly **more** range than advertised at low speed.
  You must explicitly enable kinematic launches in doctrine to use the long-range slow mode; choose high-vs-low speed deliberately before engaging.
- **Outputs / effects:** sets the torpedo's run speed and maximum launch range; selecting longer range forces a slower, longer-endurance run; max-range launches are possible well past the listed practical range.
- **Edge cases / quirks:** practical/DLZ range **shrinks as target speed rises**. Firing beyond the assured ("no-escape") ring lets a fast target turn and outrun the weapon. The longer the shot, the slower the torpedo and the more reaction time the target has (offset if the target has no internal sonar). Advertised ranges are "effective" and overstate practical reach.
- **Source:** QSTes0qt8_k; hUtHFA6EFZM; njLblgsMRuM; Sro2YR5zSSQ
- **Confidence:** High

### WRA "Kinematic range for torpedoes" firing-permission setting + DLZ gating
- **Models:** a weapon-release-authorization toggle controls whether the engine lets you fire torpedoes out to kinematic range (automatic and/or manual); the DLZ still gates every shot.
- **Inputs / parameters:** WRA option "Kinematic range for torpedoes" with values **automatic-and-manual** vs **manual-launches-only**; firing mode (Shift-F1 / Ctrl-F1 manual engage); target range vs the chosen mode's DLZ; target top speed.
- **Behavior / rules:** by default a target **beyond** the normal firing range cannot be engaged ("outside the firing range/arc") even with weapons ready. Setting "Kinematic range for torpedoes" to **manual-launches-only** (vs automatic-and-manual) then allows the operator, via manual engage (Shift-F1, select target), to take the **extended-range kinematic shot** previously blocked — distinguishing auto vs manual so the AI doesn't auto-burn weapons on marginal long shots while the human still can. **Even with the setting enabled, the DLZ still blocks shots outside it:** Shift-F1/Ctrl-F1 + click refuses the shot if the target is "outside its DLZ range (Dynamic Launch Zone)." The DLZ is computed from the chosen speed mode's effective range **and** the target's ability to flee (top speed); it recomputes continuously as range/speed change. When the target is slow enough that the torpedo "can probably get to the target in time," the shot becomes allowed (the operator waited ~5 seconds for the firing solution to close). A slow cargo target opens the DLZ that a fast warship would close. Firing also required a confirming **sonobuoy drop** to establish target range before the attack would execute in one ASW example. **General DLZ/min-range gate (applies to all weapons):** even with no NEZ doctrine set, you cannot fire outside the weapon's **dynamic launch zone** — the weapon must be kinematically able to reach the target (missiles fired beyond their energy envelope stall and log as no-joy; "in range" on the map ≠ a kill).
- **Outputs / effects:** enables manual firing out to kinematic range; without it the shot is disallowed beyond practical range; DLZ still blocks any kinematically impossible shot.
- **Edge cases / quirks:** target must be detected to fire. A confirming sonobuoy drop may be required before an air/ship ASW shot will execute. Aircraft must descend into the allowed altitude band (next rule, §11).
- **Source:** hUtHFA6EFZM; njLblgsMRuM
- **Confidence:** High

### Lead/intercept firing solution; effective chase speed = torpedo − target; evasion geometry
- **Models:** a torpedo cannot aim at the target's current position — it must lead to where the target will be; a tail-chase closes only at the **speed difference**; the target's turn lengthens or shortens the realized intercept.
- **Inputs / parameters:** torpedo speed; target speed and course; range to the intended impact point; attack geometry (beam / bow / tail-chase); target turn direction.
- **Behavior / rules:** the game auto-computes the intercept on a manual launch; worked logic: to hit a target 5 nm away at impact with a 50-kt torpedo, time = 5/50 = **6 min**; a 10-kt target covers 10/60 = 0.167 nm/min → ~**1 nm** over 6 min, so fire when the target is ~1 nm short of the impact point. **No-solution rule:** if target speed **≥** torpedo speed, **no firing angle yields an intercept** — a 50-kt USET cannot be fired at a 55-kt ship at any angle; slowing the ship to 45 kt restores a solution. **Effective chase speed (tail chase) = torpedo speed − target speed:** verbatim "for every 27 nautical miles this [target] travels, this one [torpedo] travels 30 ... over an entire hour I only travel three nautical miles farther" (30−27 = 3 kt closure; 30−16 = 14 kt vs a 16-kt ship). Time-to-intercept = distance ÷ closure (11 nm ÷ 14 kt ≈ **47 min**). A 30-kt torpedo chasing a 27-kt target gains so little it runs out of fuel before catching a target ~11 nm out; against a 16-kt ship the 14-kt closure can finish the 11-nm chase before fuel-out. **Evasion geometry:** a target turning **away** (running down the torpedo's axis) maximizes the distance and can cause fuel-exhaustion; a target turning **toward/across** the path "reduced the distance between the torpedo and the target" — a left turn "saved me six minutes" (hit at 10:04 vs the calculated 10:12). This same closure math "works with missiles too."
- **Outputs / effects:** a lead aim-point and launch timing; a valid lead solution or none (engine blocks the shot when no intercept exists); time-to-hit and whether fuel suffices; realized intercept distance differs from straight-line estimate by the target's turn.
- **Edge cases / quirks:** the static solution assumes constant course/speed; a small launch delay shifts impact. Against alert warships the target maneuvers and the static solution fails. DLZ-range gating also applies ("out of DLZ range" until closer). High-speed torpedo mode burns out before the slower long-range mode's closure pays off.
- **Source:** YugP2j3pX50; Sro2YR5zSSQ; njLblgsMRuM
- **Confidence:** High

### Torpedo guidance types and target-class restrictions
- **Models:** different torpedo seekers (straight-running, pattern, acoustic active/passive, wire-guided, wake-homing) with hard rules on which target types each can engage.
- **Inputs / parameters:** torpedo guidance type; target type (surface vs submerged sub); target noise; target wake.
- **Behavior / rules:**
  - **Straight-runner:** no homing, needs a firing solution and surprise; effective fired in patterns (WWII style).
  - **Pattern:** if it misses the initial target it enters the defined box and zigzags/circles searching for any target.
  - **Acoustic homing (most common):** passive (listens for noise) and active (pings) modes; can lock the loudest contact and reverts to a snake/circle search if it loses lock; can accidentally home on its own launcher.
  - **Wake-homing (e.g. 53-65/SET-65):** aims ahead of the ship, then works backward following the surface **wake**; near-impossible to decoy by noise but must get behind the ship; *"utterly worthless against submarines because unless they're on the surface there's no wake."*
  - **Wire-guided (e.g. Mark 48):** steerable after launch via a torpedo wire — re-vector mid-run, do donuts, decoy, or trick the target; begins autonomous search at the wire's end; risk of running out of fuel.
  Hard rule restated: certain torpedoes can only engage certain targets — wake-homers can't hit subs, etc.
- **Outputs / effects:** determines homing behavior, re-attack/search pattern, and which target classes can be killed.
- **Edge cases / quirks:** acoustic seekers can be defeated by a target slowing/quieting below the seeker threshold, or by noisemakers; wake-homers defeat noise decoys but are blind vs submerged subs; wire-guided weapon goes autonomous at end-of-wire.
- **Source:** QSTes0qt8_k
- **Confidence:** High

### Torpedo acoustic detection cone (seeker geometry)
- **Models:** a torpedo has a directional acoustic detection **cone** ahead of it; a target outside the cone is not heard until the torpedo turns. Cone width is weapon-specific.
- **Inputs / parameters:** torpedo seeker cone (width/orientation along its heading); target position relative to the cone; target acoustic noise level.
- **Behavior / rules:** the running torpedo projects a forward acoustic detection cone; the evader's goal is to get the ship out of (or never enter) it. A target outside the cone is not tracked; reducing own noise and changing position can keep the ship outside it. Different torpedoes have different cone sizes — the USET shows a "much bigger acoustic cone" than a wake-homer's narrower one.
- **Outputs / effects:** inside cone + audible → tracked/homed; outside cone → not tracked until the torpedo reorients.
- **Edge cases / quirks:** a wider cone (USET) makes "stay outside the cone" evasion much harder than against a narrow-cone weapon.
- **Source:** Sro2YR5zSSQ
- **Confidence:** High

### Torpedo terminal snake / reacquire pattern (circular search, miss-then-reattack)
- **Models:** when a torpedo reaches the end of its run/cone without a target, it snakes/circles to reacquire and can then re-attack; some torpedoes run a circular pattern by design.
- **Inputs / parameters:** torpedo at end-of-leg with no lock; built-in snake/circle search behavior; nearby target signature; manufacturer-specific pattern type.
- **Behavior / rules:** if the torpedo runs to the end of its leg without holding the target, it begins turning all over ("snake pattern") searching; on re-sensing a target it turns and flies right at it. This makes slipping out of the initial cone insufficient — the snake often re-finds the target. Some torpedoes are "circular running" by design. Demo: a torpedo "completely missed the target," kept running, then scored a hit after re-acquiring (a torpedo that misses on first pass can continue to search/lock within remaining endurance). A wake-homer additionally crosses and turns hard onto a detected wake during this phase.
- **Outputs / effects:** torpedo executes a reacquisition snake/circle; on re-detection it re-attacks; consumes torpedo run time.
- **Edge cases / quirks:** pattern type is weapon/manufacturer-specific; a hovering helo's dipping sonar can monitor the run. Designers deliberately included the snake; it's why these torpedoes "don't give up."
- **Source:** Sro2YR5zSSQ; 2BlkGRBfxtU; 0gSWMv2kiO4
- **Confidence:** High

### Wake-homing torpedo tracking
- **Models:** a wake-homing torpedo tracks the ship's **wake** (plus acoustic signature), so slowing/stopping alone does **not** break lock.
- **Inputs / parameters:** target's wake trail; target acoustic signature/noise (dB); torpedo wake + acoustic seeker.
- **Behavior / rules:** the wake-homer listens to find the target, then chases by **following its wake**; it also uses the acoustic signature. Attempts to defeat it by full-stop (55→~0 kt with a last-second turn to bleed speed), by stopping after maneuvering out of line, by climbing into/opposite the cone at full power, or by crossing its own wake **all failed** — the torpedo reacquired via the wake and snake pattern every time (one hit at ~0.5 nm). Even at 19-20 dB ("very very quiet," ~40 kt) and at a full stop it still tracked: stopping does **not** defeat a wake-homer. A conventional passive/acoustic torpedo (no wake homing), by contrast, **can** be evaded by a fast ship clearing its acoustic cone before the seeker gets into position.
- **Outputs / effects:** torpedo re-finds and strikes the target via the wake even at very low/zero speed and low noise.
- **Edge cases / quirks:** wake-homers ignore acoustic decoys (noisemakers are why wake-homing was developed); they are blind vs submerged subs (no wake).
- **Source:** Sro2YR5zSSQ; QSTes0qt8_k
- **Confidence:** High

### Bearing-only launch (BOL) torpedo
- **Models:** firing a torpedo down a bearing without a full targeting solution, letting it search along that line.
- **Inputs / parameters:** a bearing (line of fire); torpedo seeker; presence of any engageable target along the bearing.
- **Behavior / rules:** with only a rough bearing to a contact (or to an incoming torpedo) you can fire a torpedo that, on leaving the tube, automatically searches along the fired bearing for any engageable target. Used offensively to spread shots along suspected enemy bearings, and defensively as a **"pop shot"** — immediately fire down the bearing of an incoming torpedo to hit whoever launched it (the "knife fight in a telephone booth" counter-fire).
- **Outputs / effects:** a torpedo prosecuting along a bearing with no guaranteed lock; may acquire any valid target it crosses.
- **Edge cases / quirks:** no guaranteed hit; can miss wide if the contact isn't actually on that bearing. Often a desperation/retaliation shot.
- **Source:** QSTes0qt8_k
- **Confidence:** High

### Torpedo aspect (beam / bow / stern / baffle) effect on damage and hit probability
- **Models:** the angle at which a torpedo strikes determines damage location, kill probability, and whether the target can evade. **General armor/HP damage model (applies here):** damage = (weapon damage points) × (fraction that gets through armor), where the through-fraction compares the weapon's **penetration value** (hidden in the player DB) to the target's **armor class** (None / Light / Medium / Heavy / Special). No armor = ~100% (a penetrator far over-matching an unarmored target does ~2× damage); a non-penetrator vs armor passes only a small fraction (special armor absorbs ~96%, ~4% through); a penetrator matched to the armor does ~full single damage; below-threshold per-hit damage never accumulates a kill. Targets carry **damage points (HP)**; HP reduction drives the percent-damaged readout.
- **Inputs / parameters:** aim aspect relative to target (beam ~90°, bow/nose, stern/tail, baffle from astern); target type (merchant vs warship); target speed; whether the target hears the launch.
- **Behavior / rules:**
  - **Beam (~90°, center hit):** can break a ship in two (hog/sag) and was the **only** aspect observed to cause **flooding** in the test set; most damaging vs merchants.
  - **Nose/bow:** torpedo may run under the bow and detonate further aft; clean hit wrecks propulsion.
  - **Stern/tail:** hits engineering/rudder area, big fire, but was the **least** effective (target running away; may outrun it).
  - **Baffle (directly astern):** target can't hear it → a "free shot."
  Against a **merchant/carrier** any clean aspect works (it can't hear the torpedo). Against an **alert warship**: a beam shot fails because the destroyer turns away and outruns a 50-kt torpedo (a 32-kt destroyer that heard the launch escaped); a **nose** shot is preferred vs destroyers because turning to flee bleeds speed and buys the torpedo time; a baffle shot works if you sneak in undetected. **Surprise (target not hearing the launch) matters more than a textbook-clean kinematic angle.** Damage on a ULCC: two torpedoes ~6.8% damage but mission-killed propulsion and started fires that eventually sank it.
- **Outputs / effects:** damage location (propulsion/rudder/bridge/CIC/datalink), flooding/fire, mission-kill vs sink, and whether the target can evade.
- **Edge cases / quirks:** per-hit randomness ("a little bit of random probability"). A warship that **hears** your launch (you cavitate or fire inside its sonar range) immediately counter-fires bearing-only torpedoes and turns to run, often defeating the shot; a slow (5 kt) target has time to turn and outrun a nose shot, a faster target does not. Beam vs warship: "you had better hope they can't hear you."
- **Source:** YugP2j3pX50
- **Confidence:** High

### Wire-guided torpedo retargeting / turn-around (incl. over-the-shoulder rear shot)
- **Models:** a wire-guided torpedo can be re-aimed in flight (even turned 180° to engage a pursuer **astern**) as long as the guiding platform and wire stay connected.
- **Inputs / parameters:** wire-guided torpedo in flight; guiding platform still connected; new target solution; Ctrl-F1 manual-engagement click point (including directly astern); engagement arc; minimum range (~5 nm noted).
- **Behavior / rules:** after a wire-guided torpedo runs past or needs to re-engage, the operator can **turn it around** and send it back because it remains under wire guidance — this enabled a kill after the first pass. **Over-the-shoulder rear shot:** while being chased (even with an enemy torpedo inbound), press Ctrl-F1 and click directly **behind** own submarine; the wire-guided torpedo steers around and runs straight backward toward the pursuer who launched at you. Geometry note: clicking too far behind put the point "outside of the engagement arc"; clicking closer (within ~5 nm) brought it into a valid solution, then Fire. Wire guidance is what lets the weapon "do really funny things" like reversing direction after launch.
- **Outputs / effects:** torpedo redirected in flight to re-attack or to track rearward to a pursuer despite forward-facing tubes; extends a single shot's effective engagement.
- **Edge cases / quirks:** depends on the launcher keeping the **wire intact** — closing the tube / snapping the wire / removing the launching sub ends guidance and the torpedo goes autonomous (see §9). A target astern can fall "outside the engagement arc" if too far — must be within range (~5 nm cited). Historically needed rear-facing tubes; now any wire-guided torpedo can point forward, fire, and turn back.
- **Source:** hUtHFA6EFZM; KvTfNasjV_A
- **Confidence:** High

### Rocket torpedo / stand-off ASW weapon (splash-point delivery)
- **Models:** a torpedo delivered by rocket to a distant water-entry point, extending ASW engagement range beyond close-in torpedo range so the firer isn't in a "knife fight in a phone booth."
- **Inputs / parameters:** designated splash/drop point (placed via Ctrl-F1 manual attack **at a location**, not on the target); target estimated position and heading.
- **Behavior / rules:** instead of firing directly at the contact, designate a water-entry point; the rocket flies the torpedo there and drops it ("splash"). After entering the water the torpedo runs a **circular** homing pattern (rotates to detect) then pursues. This adds reach. Firing **directly** at the target lets him turn and run (~40 kt flank) so the torpedo may never catch up, or he dodges with countermeasures — motivating placed (anvil) shots instead. *(See also the specialty rocket-assisted torpedo in §8 below and the anvil tactic in §12.)*
- **Outputs / effects:** torpedo delivered to a chosen point at range; begins a circular search on splash, then homes.
- **Edge cases / quirks:** both ship-launched and submarine-launched rocket-torpedo versions exist.
- **Source:** 0gSWMv2kiO4
- **Confidence:** High

### Max-range (kinematic) shot vs the AI engagement envelope (tactic)
- **Models:** firing at maximum kinematic range can put a torpedo on a target before that target is itself in range to shoot back.
- **Inputs / parameters:** own detection range; own torpedo kinematic range; the AI opponent's expected engagement range.
- **Behavior / rules:** because the AI expects to engage only inside its own (shorter) range, launching a kinematic max-range torpedo from **outside** that envelope means the enemy receives a torpedo much sooner than it can return one. Presented as a valid strategy, especially vs other submarines.
- **Outputs / effects:** enemy engaged before it can return fire (first-shot advantage from superior reach).
- **Edge cases / quirks:** the catch is you must **detect** the target at that range; the long slow run gives more reaction time, so it works best against targets that can't hear/see it (e.g. no internal sonar).
- **Source:** hUtHFA6EFZM
- **Confidence:** Med

### Torpedo depth-floor limit — light/ASW torpedoes can fail to reach a deep submarine
- **Models:** a torpedo has a maximum (or behavior-limited) operating depth; a deep submarine can be below what some torpedoes can reach, causing a dud/non-kill.
- **Inputs / parameters:** torpedo type/depth capability; submarine depth.
- **Behavior / rules:** against a deep submarine, certain torpedoes "will never be able to get deep enough to actually engage" it. Demo: a torpedo shoots straight down toward a deep target and fails to sink it ("didn't even sink him; that's always going to happen every single time").
- **Outputs / effects:** torpedo fails to achieve a kill against an over-deep target.
- **Edge cases / quirks:** stated as consistent ("every single time") for the too-deep case in that demo; the target's depth must be within the weapon's envelope for a kill. Out-diving below a torpedo's max depth is also a stated **evasion** (see §9).
- **Source:** 6kxB4hJsHsI
- **Confidence:** Med

### Specialty weapons: Shkval, Status-6/Poseidon, ASROC/SS-N rocket-torpedo, CAPTOR mine, anti-torpedo torpedo
- **Models:** a family of unusual underwater weapons with distinct delivery/behavior.
- **Inputs / parameters:** weapon type; target type/range; launch platform.
- **Behavior / rules:**
  - **Shkval** ("Cheval"): rocket-powered supercavitating torpedo ~**200 kt**, essentially a straight-runner with mid-course adjustment and terminal active guidance; can be retargeted; tracks despite extreme speed (laser-guided-like terminal).
  - **Status-6** ("Kanyon/Poseidon"): nuclear cruise-torpedo with onboard reactor, ~**50-megaton** warhead, ~**1,500 nm** range, very quiet even at cruise — launch mid-ocean and hit a major port.
  - **Rocket-assisted torpedo** (RUM-139 VL-ASROC = Mk46 on a rocket): flies like a cruise missile to near the submerged target, drops the torpedo where it circles and prosecutes — lets a **ship** kill a sub at standoff without closing into torpedo danger; both East/West have equivalents.
  - **CAPTOR mine** (encapsulated torpedo): a torpedo sealed in a bottom mine; when a submarine passes close it releases its torpedo at the sub — **targets only submarines**, cannot be used against ships; deployable in minefields (placeable via editor, e.g. 75 units) and droppable from B-52s.
  - **Anti-torpedo torpedo** (e.g. on a frigate): detects and engages incoming torpedoes directly; runs a snake/circle search to intercept — "trying to track a torpedo with a torpedo is not an easy task" (low success, limited rounds).
- **Outputs / effects:** standoff sub kills (ASROC), assured high-speed hits (Shkval), strategic-scale destruction (Status-6), automatic ambush of passing subs (CAPTOR), point-defense torpedo interception.
- **Edge cases / quirks:** CAPTOR is sub-only by design. Anti-torpedo torpedoes have limited reliability and few rounds (often miss). Air-launch (lightweight) torpedoes can be dropped by aircraft/helicopters; heavyweight torpedoes are ship/sub-bound with longer range.
- **Source:** QSTes0qt8_k
- **Confidence:** High

---

## 9. Torpedo defense & evasion

### Acoustic decoys / countermeasures (Nixie) — probabilistic seduction
- **Models:** trailed/towed acoustic decoys (e.g. Nixie) make noise to lure a noise-homing torpedo onto themselves; whether the decoy works is resolved by a **probability roll**.
- **Inputs / parameters:** decoy device (towed Nixie) and its **reliability percentage**; torpedo seeker type; own speed; own-ship noise (dB); maneuver to interpose the decoy.
- **Behavior / rules:** the Nixie sits behind the ship and makes noise to lure acoustic torpedoes; doctrine is to turn so the decoy is **interposed** between ship and torpedo and to cut own noise (drop to creep). Each decoy has a **reliability percentage** that "simply says there's a [X]% chance of the system even beginning to work" — a **gate roll** on whether the decoy functions at all. Verbatim outcome: a decoy with a "30% chance of succeeding" — the sim "rolled a 92 on a 30," so it **failed** and the ship was hit. Across multiple attempts (33 kt / 127 dB and at creep) it repeatedly failed. On a **success** the torpedo homes on the decoy; on a failed roll the ship is struck — outcome is stochastic. *(For a submarine's own decoy use vs a chasing torpedo, see "high-speed dash + decoy" below.)*
- **Outputs / effects:** probabilistic seduction of an incoming acoustic torpedo; kinematic evasion success/failure otherwise.
- **Edge cases / quirks:** **wake-homers ignore acoustic decoys.** High own-noise (127 dB, 33 kt) works against the decoy; cutting to creep to lower noise still failed in the demo. A "hit twice by the same weapon" oddity was attributed to a bad-data display artifact.
- **Source:** QSTes0qt8_k; Sro2YR5zSSQ; dApaT5CcfS8
- **Confidence:** High

### General torpedo-defeat tactics (outrun / out-dive / beam / avoid detection)
- **Models:** kinematic evasion options in stated priority, plus the overriding "never be targeted."
- **Inputs / parameters:** torpedo seeker type; own speed vs torpedo speed; torpedo max operating depth; seeker arc/range.
- **Behavior / rules:** general torpedo defenses, in stated priority: **(1)** outrun it if you're fast enough; **(2)** out-dive / out-climb it — some torpedoes have a max depth, and diving below that depth defeats them (see §8 depth-floor); **(3)** "beam" the torpedo so you fall outside its seeker's sensing arc/range. **Best of all:** avoid detection so you're never targeted. A favored cheap-but-viable tactic: deliberately **bait** a torpedo, outrun it, then kill the launching sub with a helicopter — though future subs carrying underwater-launched SAMs complicate this.
- **Outputs / effects:** kinematic evasion success/failure; baiting can be turned into a counter-kill.
- **Edge cases / quirks:** slow ships (Oliver Hazard Perry) **can't outrun** and that option is "right out"; outrunning needs a fast ship (~33 kt). Wake-homers ignore the acoustic dimension entirely.
- **Source:** QSTes0qt8_k; Sro2YR5zSSQ
- **Confidence:** Med

### Submarine torpedo-evasion: high-speed dash + acoustic decoy defeats a single torpedo
- **Models:** a submarine that detects an incoming torpedo dashes away and launches decoys; a lone homing torpedo can be seduced by a decoy and lose lock.
- **Inputs / parameters:** incoming torpedo (e.g. Mk-46); sub dash speed (~27-28 kt); acoustic decoy launched by the sub; torpedo seeker logic.
- **Behavior / rules:** on detecting the torpedo the sub accelerates hard and runs; it deploys an acoustic decoy; the torpedo "eats the decoy," sails past the sub, loses its target, and goes into **circle (reattack search)** mode. A **single** torpedo is therefore often defeated — the kill in the demo came from launching **additional** torpedoes from another axis that arrive while the sub is preoccupied/over-confident, overwhelming it ("all jumping on him at once"). When a sub flees a stern/behind shot it just runs and you lose contact "from all the noise he's making," forcing a re-search (see also §12 hammerhead/anvil and §7 speed-vs-escape).
- **Outputs / effects:** lone torpedo decoyed → miss + circle/search; saturation from a second axis achieves the kill.
- **Edge cases / quirks:** outrunning ("I could outrun it no problem") plus a decoy is the sub's standard defense; defeating it requires multiple converging weapons. A sub running fast also drives it into the chasing torpedo's baffle exploitation issue from the **attacker's** side (§12).
- **Source:** dApaT5CcfS8; 2BlkGRBfxtU
- **Confidence:** Med

### Automatic torpedo evasion (Ctrl+Shift+F9) behavior
- **Models:** auto-evasion makes the ship sprint directly away from the launched torpedo, degrading badly when the torpedo's position is poorly known.
- **Inputs / parameters:** automatic-evasion toggle (Ctrl+Shift+F9); quality of own track on the incoming torpedo; ship speed (flank).
- **Behavior / rules:** with auto-evasion on, the ship turns 180° and sprints opposite the launched torpedo. If it lacks a good fix it behaves chaotically — "power donut" 180s, repeatedly turning to locate the weapon; each time the torpedo changes position the ship re-panics. This panicked maneuvering tended to **get the ship killed** in the demo.
- **Outputs / effects:** ship autonomously runs from the torpedo (180° + sprint); erratic circling when the torpedo fix is poor.
- **Edge cases / quirks:** quality of the torpedo position fix drives behavior; with a poor fix the auto routine is counterproductive — the speaker prefers **manual** evasion over the auto donuts.
- **Source:** Sro2YR5zSSQ
- **Confidence:** High

### Wire-guided enemy torpedo exploited by a small late course change
- **Models:** a wire-guided torpedo is steered on the launcher's best (possibly **stale**) solution, so a late **small** turn by the target can slip it.
- **Inputs / parameters:** enemy wire-guided torpedo under active guidance; launcher's last solution on own ship (possibly stale); own small course adjustment; own speed.
- **Behavior / rules:** when the firing submarine guides its torpedo by wire on the operator's **best/last** position rather than the current one, a **small** course change by the target can put it off the guided track — the wire "backfires" and the weapon fails to follow. Other ways to break a wire-guided shot: close the tube / snap the wire / remove the launching sub (autonomy then resumes).
- **Outputs / effects:** with a small turn the wire-guided torpedo fails to follow; the target escapes that shot.
- **Edge cases / quirks:** a naive **90°** turn does **not** work (the launcher just cuts the corner and re-intercepts); only a small/late adjustment exploiting stale wire data worked. Overall conclusion: **there is no guaranteed torpedo evasion** — the standard run-away method is still the best available.
- **Source:** Sro2YR5zSSQ
- **Confidence:** Med

### Reconnaissance-by-fire / fake torpedo shot (provoke self-ID)
- **Models:** a gamey but in-sim tactic — a quiet, hard-to-ID sub can be forced to accelerate (get loud and identifiable) by scaring it with a nearby torpedo.
- **Inputs / parameters:** a held but unidentified subsurface contact; a torpedo fired on a bearing **offset/oblique to (behind)** the target rather than directly at it; a passive sensor positioned to listen; own platform slowed (creep) to stay quiet while shooting.
- **Behavior / rules:** fire a torpedo **behind/oblique** to the target so it hears it; on hearing it the target may panic and accelerate, running fast away. Accelerating makes it much louder, letting your passive sensors **classify** it. Whether it takes the bait depends on the angle/timing the torpedo is dropped; a poorly aligned shot may fail to spook it. Firing this torpedo did **not** count as declaring war. Pairs with the active-sonar beam-listening posture so you can hear both your outgoing weapon and any return fire.
- **Outputs / effects:** if provoked, target speed and radiated noise spike, enabling identification; the firing act itself mutated nothing else (no war declaration).
- **Edge cases / quirks:** outcome is angle/timing dependent — the narrator failed to time it once and used an oblique shot; the target sometimes does not react. Explicitly flagged as a "gamey" exploit.
- **Source:** Ue4xgT8jqMo; wKXTZu2pNo4
- **Confidence:** Med

---

## 10. ASW search tactics & patterns

### ASW patrol/search doctrine: spread assets, sprint-and-drift, EMCON, 1/3 rule, find-with-X-kill-with-Y
- **Models:** operational ASW search built on patrol-zone missions, transit-vs-on-station speed management, and asset division.
- **Inputs / parameters:** patrol/prosecution zone (reference-point area); transit throttle vs on-station throttle; EMCON; the "1/3 rule" for sortie reserve; single-vs-grouped aircraft; restrict-to-zone setting.
- **Behavior / rules:** **spread** ASW elements out rather than grouping them — any one detector can cue a helicopter/aircraft to kill. **Transit fast** to reach the zone, then drop to **creep/cruise** on station to listen ("drift and sprint" / "sprint and drift") — going fast on station gets you heard and engaged; setting transit to flank gets ships detected. Use **patrol missions** (let the AI distribute search within a random area; less micromanagement, realistic comms limits). Keep **EMCON locked** until inside the patrol area. Apply the **"1/3 rule"** to keep aircraft in reserve and assign **single** aircraft to maximize on-station presence. Doctrine: **find the sub with the destroyer, then attack with the helicopter from the air.** Shrink the search zone over time as the target advances toward its objective, and concentrate more assets into a smaller area to raise detection probability.
- **Outputs / effects:** mission-driven search coverage; speed-managed quiet listening on station; layered detect-then-kill engagement.
- **Edge cases / quirks:** going fast (high noise) on station defeats the search; ships closing too near an undetected SSN risk free torpedo shots. No guarantees — a slow, deep, quiet opponent may never be found; success is largely a function of how densely assets can be concentrated in the right area.
- **Source:** Nk5M6gYaEvI; 7Bh85no2ge4; 2BlkGRBfxtU
- **Confidence:** High

### Sprint-and-Drift movement (desired average speed)
- **Models:** a platform alternately sprints fast then drifts slow so a sensor unit covers ground while still getting quiet listening windows, while holding a target **average** speed over the whole route.
- **Inputs / parameters:** a waypoint route (e.g. an expanding/box ladder search); a single "desired average speed" value (example: 15 kt); the Sprint-and-Drift toggle (set via F2 on a waypoint or on the unit itself).
- **Behavior / rules:** set Sprint-and-Drift on the **unit** with a desired average speed; subsequent waypoints **inherit** that order so you don't set each waypoint manually. If set per-waypoint with the average speed left **blank**, it does **not** work ("desired average speed / average sprint-drift speed not entered"). If a downstream waypoint speed is **zero**, the order is ignored ("one or more speed is set to zero, cannot estimate DTG/TTG/fuel quantity"). Running: the unit watches its running average-speed-over-ground vs target — below target it **sprints** (observed up to ~33 kt from a 5-kt cruise) then **slows right before** the next waypoint; above target it speeds up again. Repeats automatically across the whole pattern.
- **Outputs / effects:** speed continuously modulated (sprint/drift cycle) to converge the journey average on the entered desired average; arrival timing/DTG/TTG depend on a non-zero speed being set.
- **Edge cases / quirks:** blank average → feature inert; any waypoint speed = 0 → order ignored and time/fuel can't be computed. Slowing near a waypoint is deliberate so the platform is quiet/listening as it turns. Pairs with Avoid-Cavitation (§1) to keep each sprint below the cavitation speed.
- **Source:** Ue4xgT8jqMo
- **Confidence:** High

### ASW raster (stacked-ladder) search pattern
- **Models:** systematic area-coverage sweep that mows a search box in long parallel legs (like a typewriter).
- **Inputs / parameters:** manually plotted waypoints (long parallel legs + short connecting legs); searcher speed; leg spacing/length.
- **Behavior / rules:** plot a series of long parallel transit legs across the box, each offset down by a short connecting leg, covering one zone then dropping to the next. Legs can be extended down a known enemy transit path to catch a target early. Searcher ordered to a speed slow enough to keep sensors usable (§1 cavitation).
- **Outputs / effects:** search platform follows the plotted course; coverage sweeps the area zone by zone.
- **Edge cases / quirks:** because each long leg takes a long time, a quiet sub can go silent as the searcher passes and slip through behind it; long dwell per leg is the cost of coverage.
- **Source:** 7Bh85no2ge4
- **Confidence:** High

### ASW sawtooth (zigzag) search pattern
- **Models:** zigzag sweep that constantly changes heading to improve passive target localization (TMA).
- **Inputs / parameters:** two alternating aim points to zigzag between; leg/"tack" size; searcher speed.
- **Behavior / rules:** plot a zigzag by repeatedly aiming toward one point then back toward the other across the expected zone. Frequent heading changes are deliberate — switching direction **aids TMA** so a passive target can be pinpointed more easily. Small tacks also **minimize** the time the searcher's baffles point the wrong way.
- **Outputs / effects:** searcher follows a zigzag track; improved passive localization vs a straight sweep.
- **Edge cases / quirks:** best when the target is known to be in a concentrated area; nearly identical to the raster pattern but adds the TMA benefit from direction changes.
- **Source:** 7Bh85no2ge4
- **Confidence:** High

### ASW expanding-box (expanding square) search pattern
- **Models:** spiral-out square search used to reacquire a contact near its last-known position.
- **Inputs / parameters:** start point (typically the last detection point); progressively lengthening leg distances.
- **Behavior / rules:** the searcher starts at a point and runs outward in a box that grows a little on each successive leg, spiraling outward from the seed.
- **Outputs / effects:** searcher spirals outward covering area around the seed point.
- **Edge cases / quirks:** strength is reacquiring where a detected target disappeared; downside is each successive leg takes much longer, making continued coverage progressively slower.
- **Source:** 7Bh85no2ge4
- **Confidence:** High

### ASW barrier patrol via repeatable-loop patrol mission
- **Models:** a picket line continuously swept back and forth as a last line of defense so a transiting sub must cross it.
- **Inputs / parameters:** two (or more) reference points defining the line/region; a patrol-type mission set to ASW patrol; assigned units; on-station count; "repeatable loop" toggle.
- **Behavior / rules:** create reference points, build a Patrol mission (mode = patrol, type = ASW patrol), assign units (e.g. keep one on station at a time), then enable **"repeatable loop"** so assigned units travel back and forth along the line/pattern continuously. The repeatable-loop tool can drive a unit to follow an entire arbitrary plotted pattern, not just a straight line. Patrol and prosecution regions can be defined separately.
- **Outputs / effects:** assigned units cycle the barrier line/pattern indefinitely until reassigned; a sub crossing the line risks detection.
- **Edge cases / quirks:** if the loop/barrier is too big, a unit can't get back to the far end before a target slips through; with few aircraft you must size the barrier to your units. A wide enough barrier makes it impossible for a sub to transit the zone without bumping a sensor.
- **Source:** 7Bh85no2ge4
- **Confidence:** High

### Intercept feasibility / parallel-the-sub math (speed-time-distance)
- **Models:** planning an ambush of a transiting sub requires speed/time/distance arithmetic against the sub's detection ring; works far better vs slow diesels than fast nuclear boats.
- **Inputs / parameters:** sub speed (e.g. 20 kt); sub detection ring (~40 nm for an Akula per intel); searcher speeds (Perry full = 30 kt, max = 33 kt); transit times read from the order UI (e.g. "5 h 49 m at desired"); sub distance covered = speed × time.
- **Behavior / rules:** at 20 kt the sub's own towed array is "basically useless" (self-noise), but the loud Perry is detectable inside the ~40 nm ring. Intercept feasibility by hand: at **30 kt** the leg takes ~5 h 49 m, in which the 20-kt sub covers ~116-160 nm — too far, not viable; at **33 kt** → ~5 h 17 m, still no good; adjusting the waypoint to ~6 h 5 m → sub covers ~120-129 nm, "workable." Conclusion: paralleling a fast modern sub requires very aggressive speed; the technique works much better against slow diesel subs.
- **Outputs / effects:** go/no-go on the intercept plan; required searcher speed and turn-in geometry.
- **Edge cases / quirks:** driving straight at the sub exposes your **baffles** (the rear blind zone you can't hear through, §3). Works far better vs slow diesels than high-speed nuclear boats.
- **Source:** dApaT5CcfS8
- **Confidence:** Med

---

## 11. Airborne ASW (helicopters, MPA, sonobuoys)

### Helicopter dipping sonar & sonobuoys (airborne ASW prosecution)
- **Models:** helicopters lower a dipping sonar and drop sonobuoys to localize subs from the relative safety of the air.
- **Inputs / parameters:** helicopter altitude (must be low/hover, ~150 ft, "a little higher than minimum") and hover state; dipping-sonar capability; active/passive setting; dip depth; sonobuoy type (passive "P" / active "A") and deployment depth (shallow/deep markers); on-station dwell timer.
- **Behavior / rules:** right-click → order dipping sonar; the helicopter must be out of forward motion / low (~150 ft) to lower the transducer, then a **dwell timer** counts down before it can move again. By default the dip is **passive** even if you commanded it — you must explicitly enable **active**; active is reserved for the last second to avoid being shot down (some modern subs carry SAMs). **Sonobuoys** are dropped (passive "P" or active "A," with depth markers) to listen; right-click to drop at a chosen depth/mode (a buoy has no active option for depths it can't reach). The dipping sonar "dips that sonar very very deep," so it can acquire a sub running deep that hull sonar would miss. Helicopters are hard to shoot down and "will wreck" a sub once they roughly know its location; killing is done with air-dropped torpedoes (e.g. Mk54).
- **Outputs / effects:** precise underwater localization/ID without surface-ship risk; on-station dwell timer; sub kill via air torpedo.
- **Edge cases / quirks:** sonobuoys have a **limited lifespan** and self-destruct after a time; their depth (above/below layer) must match the target's band or they won't hear it. Helicopters have short endurance/range so they continuously cycle on/off station; can't be used at all in sufficiently bad weather. The persistent-passive-only mistake (forgetting to enable active) is explicitly called out.
- **Source:** -3pP4_FAg68; 7Bh85no2ge4
- **Confidence:** High

### Maritime-patrol / fixed-wing ASW aircraft (sonobuoy fields + radar suppression)
- **Models:** big ASW aircraft saturate an area with sonobuoys and use radar to keep subs submerged / catch surfaced or mast-exposed subs; surveillance aircraft lack sonobuoys but deter with radar.
- **Inputs / parameters:** aircraft type (dedicated ASW e.g. Tu-142 with 100+ sonobuoys, ~9 hr endurance, fast/loud; Western P-3/P-8/CP-140 — vs surveillance Tu-95RT/Tu-16R with radar but **no** sonobuoys); active-radar doctrine; station altitude; search-area size.
- **Behavior / rules:** dedicated ASW aircraft fly relatively low, drop dense sonobuoy fields, and carry torpedoes — they "pollute" a transit lane so densely that a sub can't cross "without getting your feet wet" unless deep **and** slow. Surveillance aircraft (Tu-95RT/Tu-16R) carry no sonobuoys and can't detect submerged subs, but running their radar keeps diesel-sub crews' heads down (ESM panic) and instantly catches anyone who surfaces or exposes a mast. Active radar from MPA caught a sub on the surface from long range. Flying **higher** extends the surface-search radar horizon (raised MPA to 10,000 ft). **Station altitude rule of thumb:** 1,000 ft is "perfect for any MPA"; transit at full speed to arrive fast, then patrol.
- **Outputs / effects:** wide-area sonobuoy coverage and radar deterrence; surfaced/mast-exposed subs detected and killed; submerged-deep-slow subs may still evade.
- **Edge cases / quirks:** even saturating with many buoys gives no guarantee — a deep, slow, quiet sub (with buoys placed **above** the layer) can pass undetected (a fast deep LA-class slipped through; buoys above the layer won't hear a sub below it even at 15 kt).
- **Source:** Nk5M6gYaEvI; 2BlkGRBfxtU
- **Confidence:** High

### ASW-patrol sonobuoy auto-deployment (spacing, paired active+passive, alternation, expiry)
- **Models:** an MPA on an ASW patrol/transit automatically seeds the water with sonobuoys at a fixed overlap spacing to form a detection tripwire.
- **Inputs / parameters:** an ASW Patrol mission (area or two-point) assigned to an MPA (P-3/CP-140/Aurora); mission sensor toggles; aircraft entering the zone; sonobuoy types (passive DIFAR / active DICASS); station altitude; radar EMCON (off to stay covert).
- **Behavior / rules:** on a Patrol mission set to **ASW**, the aircraft proceeds to the patrol reference point and **begins ejecting sonobuoys on zone entry**. It is "smart enough to drop **both an active and a passive** at the same time" (one source) and, on automatic drop, to **alternate** passive vs active types (another source) — and "smart enough to know not to drop any more" once the field is saturated. Default auto-spacing is about **7 nautical miles** apart, sized so each buoy's coverage circle slightly **overlaps** its neighbor. Buoys have a finite life (one showed ~6 hours remaining) and **expire**; while flying the pattern the aircraft **redeploys** more buoys to keep the barrier populated. Recommend only **one** aircraft per buoy field at a time, else they "waste a lot of time" over-seeding.
- **Outputs / effects:** a line/field of paired/alternating active+passive sonobuoys at ~7 nm spacing with slight overlap; a persistent tripwire that flags a sub if it makes noise crossing; expired buoys auto-replaced.
- **Edge cases / quirks:** aircraft altitude matters for ejection — narration questions whether buoys can be ejected from ~25,000 ft and tells it to descend (implies a max drop altitude; no exact ceiling stated). Without the ASW patrol mission an aircraft just searches with onboard sensors and lays **no** buoys. Radar left off to avoid cueing the sub via its ESM.
- **Source:** Ue4xgT8jqMo; 7Bh85no2ge4; Nk5M6gYaEvI; 2BlkGRBfxtU
- **Confidence:** High

### Manual sonobuoy placement (waypoints / linear repeatable barrier)
- **Models:** ways to override the MPA's automatic scatter so the player controls exactly where buoys are laid (a straight line / barrier).
- **Inputs / parameters:** either (a) plotted waypoints inside the mission zone, or (b) a Patrol mission built as a straight two-point line, type = ASW Patrol, behavior set to **"repeatable loop"** (not random) with the loop count set to **1**; manual drop keys (square bracket `[` = passive, right bracket `]` = active).
- **Behavior / rules:** **Method A** — drop a waypoint at the top and bottom of the desired line; the aircraft flies the path and lays buoys in a textbook straight line along it (can be drawn freehand to "spell shapes"). **Method B** — create a straight-line two-point Patrol, set ASW Patrol, change behavior from random to **"repeatable loop" = 1**; the aircraft proceeds direct to the reference point, flies the line dropping buoys, then sets up a **barrier CAP** patrolling/zig-zagging back and forth along that track. Because it zig-zags the track, when a buoy expires it redeploys more and keeps the barrier alive. Manual single drops via the bracket keys also work.
- **Outputs / effects:** a precisely placed straight barrier of sonobuoys along the chosen track, continuously maintained by the looping aircraft.
- **Edge cases / quirks:** nudge the aircraft's approach angle so it lines up cleanly with the track. "Repeatable loop = 1" is what produces the persistent barrier-patrol behavior rather than a one-pass random scatter.
- **Source:** Ue4xgT8jqMo; 7Bh85no2ge4
- **Confidence:** Med

### Helicopter ASW sensor doctrine (radar / dipping sonar / periscope search / throttle)
- **Models:** sensor-emission choices on an ASW patrol trade stealth vs detection capability.
- **Inputs / parameters:** mission doctrine / WRA toggles — active radar on/off, sonar (dipping) on/off; on-station throttle (cruise vs loiter).
- **Behavior / rules:** for an ocean-hawk-type helo, leaving active **radar ON** enables **periscope search** (catch a sub that raises its head) at the cost of revealing own position; flip **sonar ON** so the helo periodically dips. Set on-station throttle to **cruise** (not loiter) so the helo can actually reach the far side of a large area before returning to base.
- **Outputs / effects:** helo emits radar (periscope-search capable) and periodically dips sonar; cruise throttle extends reach.
- **Edge cases / quirks:** disabling radar hides own position but disables periscope search; loiter throttle is too slow to cross a large area before bingo/return, so cruise is preferred for long-distance coverage.
- **Source:** 7Bh85no2ge4
- **Confidence:** High

### Air prosecution of a sub — localize before weapon release; MAD/expanding-box; airborne torpedo altitude
- **Models:** an ASW aircraft must **localize** a sub (sonobuoys/MAD) before it can drop a torpedo, and air-dropped torpedoes can only be released within an allowed altitude band.
- **Inputs / parameters:** initial bearing/area contact (e.g. from SOSUS); search pattern (expanding box / spiral) at minimum / MAD-search altitude; sonobuoy field; confidence of target position; launching aircraft altitude (must drop low — ≤ ~1,000 ft; 1,400/2,000 ft too high) and torpedo range (e.g. near-Tip Mod 5 = **4 nm**; Mk54).
- **Behavior / rules:** build an **expanding-box** search over the suspected area, drop to minimum/MAD altitude, and prosecute along the start vector (e.g. a SOSUS bearing line) tracking inward; weapons can be zeroed so the aircraft only localizes. The aircraft **descends** ("skip across the water," below clouds, ~300 ft) and drops a pattern of sonobuoys to refine, attacking **only** once it knows exactly where the sub is — "until he knows where it is, it's a waste of time to drop a torpedo on his head." Even with a good track the attack can **miss** ("we weren't as confident about that position as we thought"). On ordering a torpedo drop, the helo/aircraft "has to be a thousand feet above ground level"; at 2,000 ft it refuses and must descend; the torpedo must also be dropped **within** its short range (the 4-nm near-Tip means "drop this right on his head"). High-altitude release (P-8) is blocked (would need a parachute) — descend into the band first; the operator chooses how many to drop (e.g. two Mk54s). Helicopters are preferred over surface ships for the attack to avoid retaliatory torpedoes; a hovering helo's dipping sonar can monitor the run.
- **Outputs / effects:** refined sub track; torpedo release gated by altitude and range; possible miss if the position was overestimated.
- **Edge cases / quirks:** "very difficult to prosecute a submarine contact underwater, even from the air"; **position confidence** is itself a modeled quantity that decays/varies (see §15). Overflying a sub is risky (a good sonar operator may hear you). P-3 is a slow turboprop — "ASW = awfully slow warfare." Underwater-only torpedoes are safer near friendly/civilian surface traffic.
- **Source:** -3pP4_FAg68; 7Bh85no2ge4; dApaT5CcfS8; 2BlkGRBfxtU; ZSVjL25akYU
- **Confidence:** High

### Subsurface contact classification (a contact is not yet a sub)
- **Models:** a detected subsurface contact requires further prosecution to classify — it may not be a submarine.
- **Inputs / parameters:** initial detection (sonobuoy/array); follow-up sensor passes (active sonar circling, dipping sonar); "a lot of math."
- **Behavior / rules:** a subsurface contact "doesn't have to be a submarine — could also be whales." After initial detection the platform must **positively identify** the target ("a lot of math is going to have to happen"); an aircraft circles ("Big Wide Circle") / drops active buoys to refine until "positively confirmed." Only then is attack appropriate.
- **Outputs / effects:** contact identity (sub vs biologic/other), confidence level, target track quality.
- **Edge cases / quirks:** whales explicitly cited as false contacts; you can waste a torpedo prosecuting an unclassified contact.
- **Source:** 2BlkGRBfxtU
- **Confidence:** High

---

## 12. ASW attack coordination & short-range weapons

### Anvil / hammerhead (two-axis pincer) torpedo attack
- **Models:** attack from two angles so evading one torpedo drives the sub into the other; back the sub against a shore so it has nowhere to run.
- **Inputs / parameters:** two (or more) attack platforms/drop points on different bearings; target track; target's expected turn-and-accelerate reaction; first drop ~1 nm off the target's nose; inter-shot delay (~30 s at the demo range); a "wall"/shore to pin the sub; the "within ~0.4 of target range" firing requirement; a confirming sonobuoy drop.
- **Behavior / rules:** the **anvil**: drop the first torpedo ~1 nm **ahead** of the target's nose; on splash the circular-searching torpedo makes the target hear it, turn around, and run. Time the **second** drop to land right as the target begins accelerating away (note the clock at first launch, fire the second a fixed delay later, ~30 s here) so it lands in the escape path. If the target is perpendicular/oblique, do extra geometry to lead the run; if bow-on it's trivial (one behind, one ahead). The **hammerhead** is the same idea generalized: set attackers on two converging axes (a triangle) so "as it turns to run from the first torpedo it runs face-first into the other," pushing the sub toward shore where it has "nowhere to go" — "the absolute best way to guarantee a hit"; overwhelm the target ("don't give it any quarter"). To fire, a platform must close to within about **0.4** of the target's max-range envelope (and may require a confirming sonobuoy drop). Classic execution: a helicopter forces the sub to flee at high speed straight toward a waiting frigate; the heli fires a max-range torpedo from behind while the frigate fires two Mk-46s from ahead, wedging the sub on two axes.
- **Outputs / effects:** torpedo released only when within the required range fraction; the sub is boxed — hit head-on by the second weapon, or trapped between converging torpedoes.
- **Edge cases / quirks:** place the drop **behind** the current position because the target will have turned; only land it in the general vicinity. The 30 s / 0.4 figures are range-dependent operator judgment, not stated constants. Even with perfect placement a given torpedo may miss but is "required to reattack." Aircraft must be at minimum altitude (1,000 ft was too high) to drop. Driving the sub into shallows denies it the room to outrun a stern shot (§7).
- **Source:** dApaT5CcfS8; 0gSWMv2kiO4; 2BlkGRBfxtU
- **Confidence:** High

### Reload priority / weapon reconfiguration (what a sub/ship can engage)
- **Models:** magazine loadouts must be reconfigured for the mission, and reloading takes in-game time; a platform only engages with what's loaded.
- **Inputs / parameters:** available weapons in magazine; reload-priority selection (Weapons & Mounts); reload time per weapon.
- **Behavior / rules:** set **reload priority** to swap in mission-appropriate ordnance (e.g. drop wake-homers, load anti-sub acoustic/rocket torpedoes for ASW). Reloading consumes real in-game minutes — a wire-guided Mk48 took "another minute" to finish loading before it could fire, blocking the shot until done. Wrong loadout means weapons fired won't track the target (wake-homers vs a submerged sub "are not actually going to track").
- **Outputs / effects:** determines which weapons are immediately available; imposes a reload delay before a swapped weapon can fire.
- **Edge cases / quirks:** engaging during a reload is impossible until the tube finishes; mismatched weapon-vs-target type simply won't prosecute.
- **Source:** 4_iJSkAkMrs
- **Confidence:** Med

### ASW depth-bomb / mortar weapons require a SURFACED target (RBU hedgehogs & depth charges)
- **Models:** short-range surface-ship ASW mortars/depth charges are only employable against shallow/surfaced subs and kill by cumulative near-misses.
- **Inputs / parameters:** weapon type (RBU-6000 hedgehog / depth charge); target depth (surfaced vs submerged); range; remaining ammo.
- **Behavior / rules:** RBU-style hedgehog mortars ("RBU/B-6000") fire ahead at short range (a launch at ~3 nm shown) and are "very deadly at short range"; you kill a sub "not with a direct hit but with a lot of indirect hits" (cumulative damage / flooding). Critically, some ships "can only engage him if he was on the surface" — if the sub is submerged the weapon can't be used and you fall back to depth charges. Engaging a periscope-depth ("goblin at periscope depth") sub is a huge mistake by the sub because it becomes vulnerable to these.
- **Outputs / effects:** short-range area attacks producing cumulative damage; flooding/sinking; unusable when the target is deep.
- **Edge cases / quirks:** limited ammo (only a couple RBU salvos before switching to depth charges). A submerged sub may simultaneously be launching torpedoes back. Some ships (the Tarantul) "can't even shoot them."
- **Source:** Nk5M6gYaEvI
- **Confidence:** Med

---

## 13. Submarine-launched missiles

### Submarine anti-ship missile alpha-strike ("shotgun" BOL salvo)
- **Models:** a missile-armed SSN/SSG localizes emitters via ESM, then salvos anti-ship missiles before retaliation arrives.
- **Inputs / parameters:** anti-ship missile range (e.g. TASM ~110-250 nm); a rough target bearing/position from ESM triangulation; visual launch-detection range (~12-15 nm); number of missiles.
- **Behavior / rules:** at periscope depth the sub triangulates an emitter over time (two listening passes give a bearing fix), marks the estimated position accounting for elapsed target movement (distance = speed × time), then salvos many missiles down that bearing as a **"shotgun."** Because launch is visible at close range (~12.5 nm), the enemy counter-fires "a second later," so you must launch and immediately run/dive. The example dumped ~**40 Tomahawks** across predicted positions; many were defeated by jamming/decoys but several leaked through. Identification before firing is still required (could be friendly).
- **Outputs / effects:** large standoff missile salvo against a localized surface target; immediate retaliation risk; sub must egress.
- **Edge cases / quirks:** many missiles wasted to jamming/illumination-spoofing; risk of hitting civilians with an imprecise BOL salvo. Stated as why submarines are no longer permitted to carry such anti-ship missiles. Must be quick to clear the area before counter-fire lands.
- **Source:** 4_iJSkAkMrs
- **Confidence:** Med

### Submarine-launched cruise missile: range vs reaction-time trade & emissions dependency
- **Models:** firing a sub-launched cruise missile far away gives the target more reaction time; the target's reaction depends entirely on whether **its** sensors are emitting.
- **Inputs / parameters:** launch range to target; whether the target is emitting (radar on) or radar-silent (e.g. on ASW duty); presence of a friendly emitter (helicopter/MPA radar); missile sea-skim profile (~30 ft, ~530 kt) and any terminal sprint; the missile's own seeker going active.
- **Behavior / rules:** conventional wisdom = maximize distance, but that's contradictory: more range = more warning. A target on ASW duty keeps radars **off** / is not emitting, so it does **not** notice the incoming missile until the missile's own seeker goes **active** — in the close example the missile was only picked up at ~**3 nm** (when active). If the target's radar is **on**, it sees the missile much earlier — at long range it'd have ~**15 minutes** to start firing defensive missiles; so against an emitting target you must shoot from **short** range so it has no time to react. Against a non-emitting target you can fire from essentially any distance. Some missiles have a **terminal sprint**: pick up speed at the last second and accelerate into the target, destroying it "instantly." Defenders may attempt soft-kill (spoof/jam) and the missile may malfunction. A Rapier SAM platoon could **not** engage the sea-skimming cruise missile ("not designed to be able to do that").
- **Outputs / effects:** detection timing of the missile (early vs only at terminal-active); defender reaction window; hit/miss/spoof outcome.
- **Edge cases / quirks:** long range can be **worse** vs an emitting defender (more reaction time); some short-range SAMs simply can't engage sea-skimmers; terminal-active seeker reveals the missile late; non-emitting targets get minimal warning.
- **Source:** oVFjZ3Jb--g
- **Confidence:** High

### Minimum launch depth for sub-launched missiles
- **Models:** a submarine must rise to shallow/periscope depth to fire surface-breaking missiles; firing too deep fails.
- **Inputs / parameters:** current sub depth; missile type (surface-breaking cruise missile).
- **Behavior / rules:** you "have to get up to pretty shallow before you can actually launch one of these"; you can't shoot them from deep — at depth they'd "fizzle before they got up to the surface" to break the water. One launch occurred around ~**164 ft** depth (shallow enough to fire).
- **Outputs / effects:** launch permitted only above a shallow depth threshold; deep launch attempts fail (missile fizzles).
- **Edge cases / quirks:** exact max-launch depth not stated; ~164 ft shown as a workable shallow depth.
- **Source:** oVFjZ3Jb--g
- **Confidence:** Med

### Missile breaching the surface reveals the launching submarine
- **Models:** when a sub-launched missile breaks the surface within visual **or** radar range of an enemy unit, the launching submarine's position is revealed as a surface contact.
- **Inputs / parameters:** whether an enemy unit (helicopter visual / ship radar) is within line-of-sight or radar range of the launch point at the moment the missile breaches.
- **Behavior / rules:** because the missile "broke the surface in view of an enemy unit" (a helicopter's visual and the destroyer's radar), the system generates a "surface unknown / contact on water" at the launch location — the previously hidden sub becomes visible. "It knows where the missile basically popped out of the water." Independent of the missile being tracked downrange.
- **Outputs / effects:** a new surface contact at the submarine's launch position; the sub is no longer hidden.
- **Edge cases / quirks:** requires an enemy unit in visual or radar range of the breach point; if none can see/scan the breach, the launch position isn't revealed. Detection of the breach also depends on the observing sensor — a nearby helicopter's weaker radar failed to give the surface-breach warning even right next to it, while a better radar did.
- **Source:** oVFjZ3Jb--g
- **Confidence:** High

---

## 14. Surface anti-ship missiles (offense & defense)

### Anti-ship missile flight profile (sea-skimming + altitude-dependent cruise speed)
- **Models:** cruise missiles fly low to delay detection; some have different speeds at high vs low altitude.
- **Inputs / parameters:** missile cruise altitude (sea-skimming, e.g. "30 feet above sea level"); altitude regime (high/low); per-missile cruise-speed table.
- **Behavior / rules:** missiles transit at very low altitude ("sea-skimming") which makes them harder to detect/acquire. Some have **two** cruise speeds keyed to altitude: BrahMos does ~**Mach 2.8** at higher altitude and ~**2.19 Mach** at low altitude; Harpoon cruises ~**0.86 Mach**; Onyx/BrahMos low-altitude run shown at **1,450 knots**; Caliber/Sizzler cruises slow (~**530 knots**) until terminal. Lower altitude → harder to detect but (for two-regime missiles) lower top speed.
- **Outputs / effects:** detection range / acquisition probability against the missile; time-to-target; interceptor engagement window.
- **Edge cases / quirks:** sea-skimming at 30 ft is "not on the water but 30 feet is enough" to still be hard to detect; rough seas / terrain further degrade detection of skimmers and periscopes.
- **Source:** Avtu34yzCh0
- **Confidence:** High

### Missile speed vs interceptor engagement difficulty
- **Models:** faster incoming missiles are disproportionately harder to shoot down.
- **Inputs / parameters:** incoming missile speed; defender weapon acquisition capability; engagement window.
- **Behavior / rules:** as missile speed rises, defenders get a smaller engagement window **and** need much more precision — "you're off by a tiny bit that's more than enough to completely miss." At very high speeds (BrahMos/Onyx ~**1,450 kt** sea-skimming) "a lot of these ships will not be able to engage these weapons because they're too fast to actually be acquired properly," so only certain CIWS (SeaRAM/"C Viper"-type, Phalanx) can attempt, waiting "to the last possible second." Slow missiles (Harpoon ~0.86 Mach, Exocet) were all intercepted (~2 interceptors per attacker, nothing through). **General point-defense ladder (per-layer, each scored separately):** ship air defense is a layered ladder of independent systems each with its own per-engagement Pk and concurrency limit — dual-purpose 5"/127 mm guns ("overall probability to hit ~1%," last-ditch only); CIWS gun (AK-630/Phalanx ~45% per engagement, but one target at a time); SARH PD missile (Sea Sparrow — re-attacks on a miss but single-target via illumination); ESSM (quad-packed, removes the magazine bottleneck); modern active-seeker short-range missile (auto-retargets, no bottleneck); long-range SAM repurposed for PD (engages at max range but a sea-skimmer isn't noticed until ~20 nm); defensive laser ("if you can see it you can hit it," ~10,000 shots, beaten by fog/clouds). Each leaker that gets through applies full missile damage.
- **Outputs / effects:** which defensive weapons can engage; hit/leak probability; number of interceptors expended.
- **Edge cases / quirks:** acquisition can outright **fail** above some (unstated) speed threshold — qualitative only. Defenders also waste shots / fire late against fast skimmers.
- **Source:** Avtu34yzCh0
- **Confidence:** Med

### Terminal sprint (Klub/Caliber "Sizzler" rocket-boosted variant)
- **Models:** some missiles accelerate sharply in the terminal phase to defeat defenses.
- **Inputs / parameters:** missile variant (rocket-booster / "T version"); terminal-maneuver settings (terminal maneuver, zigzag, bearing-only launch); trigger distance to target.
- **Behavior / rules:** the Caliber/Sizzler cruises slow (~530 kt) then at the last second "picks up a ton of extra speed" to sneak past defenses; the booster/terminal sprint engages when it gets close. This compresses the defender's reaction time at the worst moment.
- **Outputs / effects:** sharp late speed increase; reduced defender reaction; higher leak rate (few defensive weapons fired in response in the demo).
- **Edge cases / quirks:** tied to the specific T/rocket-booster sub-variant, not all Calibers; the speed-up is a distinct terminal trigger, not gradual.
- **Source:** Avtu34yzCh0
- **Confidence:** Med

### Terminal target reselection / re-attack
- **Models:** anti-ship missiles can switch targets at the last second and re-attack within a saturated group.
- **Inputs / parameters:** cluster of nearby targets; missile seeker (active/passive radar); original assigned target.
- **Behavior / rules:** on arrival into a group of ships, missiles "change their targets at the last second" and perform a visible **re-attack** (turning back onto a target). BrahMos was noted "accurately targeting the thing I shot at" (the seeker can hold the assigned target), but in a saturated group missiles re-select among available targets; some missed and flew off ("firing off into the woods").
- **Outputs / effects:** which ship in a group actually gets hit; possibility of a missile re-attacking rather than going ballistic on a miss.
- **Edge cases / quirks:** distinct seeker types (active vs passive radar) on different missiles; saturation makes the assignment chaotic.
- **Source:** Avtu34yzCh0
- **Confidence:** Med

### Weapon reliability stat
- **Models:** each weapon has an inherent reliability that affects whether it works as launched. **General dud/reliability roll:** an independent reliability roll is applied per weapon even on a geometrically perfect hit — if the weapon malfunctions it does no damage regardless of aim (older PGMs are shown repeatedly dudding, e.g. a GBU-28 quoted at "15% chance of malfunctioning"). This is a distinct roll from the hit/Pk roll.
- **Inputs / parameters:** per-weapon reliability rating (shown in the weapon database).
- **Behavior / rules:** Harpoon "incredibly reliable"; Exocet "not quite as good"; BrahMos slightly more reliable than Harpoon; Onyx and Caliber "about the same reliability as many of these weapons." Reliability is a distinct DB field separate from range/speed/warhead.
- **Outputs / effects:** probability a launched weapon functions correctly (dud/failure chance).
- **Edge cases / quirks:** purely qualitative here — no numeric reliability percentages stated for these missiles.
- **Source:** Avtu34yzCh0
- **Confidence:** Med

### Warhead damage, fires, and flooding aftermath
- **Models:** hits cause warhead damage plus persistent **fire** and **flooding** that can sink a ship over time. **General fire/flood/subsystem model:** a hit applies HP/percent damage **and** can knock out individual subsystems (radars, comms/data-link, FCR, engines, guns, sensors) — radars/radios are the most fragile and degrade first ("you're always going to shoot a radar whenever you take damage"). Ships additionally track **fire** and **flooding** as ongoing/spreading states resolved by a damage-control crew: a ship outcome can be driven by fire + flooding even at low HP% ("flooding will get worse → sinks"), flooding can ironically put out a fire, and damage-control reduces fire/flood over time if HP isn't fatal. This yields **mission-kill** (sensors/comms gone but platform alive) vs **hard-kill** (HP/sink/destroyed).
- **Inputs / parameters:** warhead size (Harpoon ~500 lb, BrahMos ~440 lb); number of accumulated hits; ship type/size; crew damage-control.
- **Behavior / rules:** a single hit "will definitely start some fires." Fires persist and grow over time; a ship can put a fire out (damage control) or "the fire is going to win that fight" and sink it. Flooding is modeled separately and can interact ("the flooding will put the fire out... he's going to go swimming"). Large/armored ships absorb many hits — the Iowa took 7-10+ hits and was "still going." Many ships are only "damaged" after one hit, not sunk.
- **Outputs / effects:** immediate damage state; ongoing fire and flooding progression; eventual sink-or-survive over elapsed time.
- **Edge cases / quirks:** hardened/large hulls survive double-digit hits; fire vs flooding can offset each other; warhead size alone doesn't guarantee a sink.
- **Source:** Avtu34yzCh0
- **Confidence:** Med

### Saturation / time-on-top attack to overwhelm defenses
- **Models:** defenses are saturated if enough missiles arrive faster than interceptors can engage. **General fire-control-throughput / saturation mechanic:** point-defense fire control engages essentially **one target at a time** — each launcher must finish targeting one threat before the next, so a large concurrent salvo overwhelms the loop (multiple PD units redundantly chase the same leaker and "panic," letting most through). The best optimization is **geometry, not hardware** — oversaturation from multiple directions is the canonical way to defeat a layered defense (overwhelming *throughput*, not finding a blind arc).
- **Inputs / parameters:** total missiles allocated (allocate N per target); arrival timing; defender interceptor inventory & rate of fire; launch-to-fire spool-up (~30-36 s off the rack).
- **Behavior / rules:** allocating only **2 missiles per ship** (≈32-50 launched) left the convoy's defenses intact (Harpoon/Exocet: ~2 interceptors per attacker, zero leakers). The "key to sinking the convoy is not letting them have a chance" — allocate **5 per target** (~**240 missiles** total) so defenders "didn't really have a lot of weapons they could use to fire off" and the whole fleet sank. Defenders run out of ready interceptors under saturation. Launch has a fixed spool-up (~30 s) before missiles leave the rack.
- **Outputs / effects:** leak rate through the defensive screen; interceptor depletion; ships sunk vs damaged.
- **Edge cases / quirks:** high-speed missiles saturate more effectively (fewer defenders can engage each); defenders also waste shots and fire their own weapons uselessly.
- **Source:** Avtu34yzCh0
- **Confidence:** High

### Terrain masking of launch/approach
- **Models:** land terrain hides the launching platform and delays detection of inbound missiles.
- **Inputs / parameters:** terrain/island between shooter and target; missile path; target sensor line-of-sight.
- **Behavior / rules:** firing from behind an island means defenders only see the missiles "when they pop over the terrain," giving an even shorter reaction time — a deliberate "perfect setup" for sea-skimming high-speed missiles.
- **Outputs / effects:** delayed detection of inbound missiles; shorter defender reaction window; concealment of the launch platform.
- **Edge cases / quirks:** only effective for low/sea-skimming flight profiles that the terrain can actually mask.
- **Source:** Avtu34yzCh0
- **Confidence:** Med

### Effective closure for anti-ship missiles (= missile − target speed)
- **Models:** the tail-chase closure math from torpedoes (§8) applies equally to missiles.
- **Inputs / parameters:** missile speed; target ship speed; geometry.
- **Behavior / rules:** the worked closure rule "works with missiles too" — effective closure = missile speed − target speed; a slow missile (e.g. ~530-kt Caliber) chasing a fast-moving group closes only at the difference, lengthening time-to-impact and reaction window. See §8 for the full derivation.
- **Outputs / effects:** time-to-hit and reaction window for a missile shot mirror the torpedo closure model.
- **Edge cases / quirks:** cross-referenced from the torpedo rule; no separate numeric example for missiles.
- **Source:** njLblgsMRuM
- **Confidence:** Med

---

## 15. Fleet screen, formations & air defense (naval context)

> These rules came from the naval/ASW bucket transcripts and govern how a surface group is arranged
> around a high-value unit — directly relevant to where ASW/anti-surface sensors and weapons sit. The
> general air-defense Pk / per-layer point-defense ladder these screens rely on is summarized inline
> under *Missile speed vs interceptor engagement difficulty* (§14).

### Group formation editing (pivot/leader + relative vs fixed bearing placement)
- **Models:** naval task-group station-keeping where escorts hold position relative to a guide ship.
- **Inputs / parameters:** selected group; designated pivot/leader (e.g. the carrier); per-member "Place member"; bearing mode = **relative** (rotates with heading) vs **fixed** (compass-fixed offset); range/offset from leader (nm); click point on map.
- **Behavior / rules:** (1) **G** groups selected ships; (2) designate a pivot/leader; (3) for each escort, open the group panel, click **Place member**, choose **relative** or **fixed** bearing; (4) click the map where the member sits — the unit powers off and transits to station as fast as it can. Example stations: AAW destroyer ahead at ~10 nm (can tighten to 7.5), ASW screen at ~15 nm (29 nm is "way too far"), a support/replenishment ship next to the carrier at ~1-2.5 nm — all slightly **off the centerline**. While forming up, reduce speed (~10 kt "steerage") so members reach station, then an acceleration waypoint bumps the group to cruise.
- **Outputs / effects:** each member gets an ordered station (bearing+range) relative to the leader; ships transit to and maintain that geometry as the group moves; group speed set per leg via waypoints.
- **Edge cases / quirks:** relative-vs-fixed must be set correctly per member/waypoint or stations won't rotate as intended (the presenter repeatedly had to flip waypoints to fixed). Placing slightly off-centerline is intentional to defeat an attacker's assumption that the group is in a straight line behind the lead contact. Forming up takes real time, so slow the group during assembly.
- **Source:** E6uDwCxeI9M
- **Confidence:** High

### Layered defensive screen by warfare domain (AAW / ASuW / ASW), biased to threat axis
- **Models:** a carrier-group screen partitioned into anti-air, anti-surface, and anti-submarine layers positioned toward the threat axis.
- **Inputs / parameters:** threat axis; each escort's domain strength (AAW vs ASW hull); standoff per layer; number of escorts.
- **Behavior / rules:** build the screen in distinct layers — ASuW, AAW, ASW. Position the AAW-strong destroyer ~**10 nm** in front of the leader (toward the threat). Position **ASW** escorts further out at ~**15-20 nm** (the doctrinally ideal ASW setup is a **pair** of destroyers, so a single ASW hull is a compromise). The threat is assumed to come from the transit/objective direction, so the heaviest screen is forward along that axis. A submarine with good sonar is pushed out **ahead, early**, as a forward picket. Subsurface helicopters, when used, are kept "about the same range as everything else."
- **Outputs / effects:** spatial arrangement of escorts into nested rings/sectors keyed to threat axis; each domain covered by the best-suited hull.
- **Edge cases / quirks:** with only two destroyers the screen is thinner than doctrine wants (no ASW pair); ASW range is a qualitative 15-20 nm band, not a formula.
- **Source:** E6uDwCxeI9M
- **Confidence:** High

### AAW screen placement — "half the air-defense ring" standoff
- **Models:** position anti-air escorts so their SAM umbrella covers the protected unit with margin.
- **Inputs / parameters:** escort's max air-defense weapon range (the "air-defense ring", e.g. 90 nm); the protected HVU; threat axis; Ctrl+D measuring tool; M key to place.
- **Behavior / rules:** the "magic number" is to station an AAW escort about **half its air-defense ring** away from the HVU, **toward the threat**. Worked example: a Ctrl+D drag shows a **90-mile** ring → half = **45 nm** along the threat bearing (Ctrl+D to measure 45 nm, press M, drop the ship). The rule scales: a Type 42 (Exeter) with ~60 nm range → half ≈ **35 nm** (rounded ~35-40). General: "use one half of that range as your way to think about it."
- **Outputs / effects:** each AAW escort sits ~½ its SAM range from the HVU on the threat-facing side, so its envelope reaches well in front of the protected unit.
- **Edge cases / quirks:** per-hull (90→45, 60→35); the 90-mi ring is unusually long; position must be threat-facing; the half-range is sometimes rounded.
- **Source:** LCw_eLNeRpI
- **Confidence:** High

### One-third overlap rule for adjacent AAW escorts
- **Models:** mutual-support spacing so neighboring air-defense umbrellas overlap enough to cover gaps without bunching ships.
- **Inputs / parameters:** two adjacent AAW escorts and their rings; Map Settings → Range Symbols (filter to air weapons); merge-range-symbols toggle; the ~⅓-ring spacing.
- **Behavior / rules:** adjacent AAW escorts should have roughly a **one-third overlap** of their air-defense rings, while still keeping each ~45 nm from the HVU. To check: Map Settings → Range Symbols, disable all, re-enable only **air weapons** so only the air-defense rings show; optionally "merge range symbols." If two rings overlap much more than a third, slide one outward (e.g. to a flank) and still be "legal" as long as they stay within ~⅓ of a ring of each other and ~45 nm from the HVU. Target spacing ≈ "a third of a ring" between neighbors.
- **Outputs / effects:** neighboring escorts provide mutually supporting, slightly overlapping SAM coverage with no undefended seam, without redundant stacking.
- **Edge cases / quirks:** excessive overlap (one ring engulfing another) is wasteful; the range-symbol display gets cluttered, so filter to one weapon type to judge overlap.
- **Source:** LCw_eLNeRpI
- **Confidence:** High

### Sensor range vs weapon range distinction (esp. underwater/ASW)
- **Models:** the detection envelope is **separate** from the kill envelope; you must detect first, then close to weapon range.
- **Inputs / parameters:** Map Settings → Range Symbols filters: underwater weapons vs underwater sensors (and air weapons, etc.); per-platform effective weapon range vs sensor range.
- **Behavior / rules:** CMO distinguishes **sensor range** (detection) from **weapon range** (effective engagement). Example: the Bremen's torpedo reaches only ~**4 nm**, while a Virginia's underwater weapon range is ~**21.6 nm**. To kill a sub you must first **detect** it (sensor range) and **then** get within your underwater **weapon** range. For ASW screen layout, turn **off** the underwater-weapon range display and turn **on** the underwater-sensor range display, because positioning is driven by detection coverage, not torpedo reach. In the real world a helicopter does the close-in delivery so the ship doesn't have to physically move to weapon range — but in-sim without a helo the ship itself must close.
- **Outputs / effects:** two different rings per platform; ASW positioning is planned off sensor coverage while engagement still requires closing to weapon range.
- **Edge cases / quirks:** effective torpedo ranges are short (4 nm) vs long sub torpedo ranges (21.6 nm) — a big asymmetry; without helicopters the firing platform must maneuver into weapon range after detection.
- **Source:** LCw_eLNeRpI
- **Confidence:** High

### ASW submarine screening — ~20 nm ahead of the HVU (threat-axis biased)
- **Models:** friendly attack submarines stationed forward of the force to detect/intercept enemy subs along the threat axis.
- **Inputs / parameters:** friendly submarines (Rubis, Virginia); HVU (carrier); threat axis; ~20 nm standoff; their long underwater sensor coverage.
- **Behavior / rules:** station friendly subs ~**20 nm** from the HVU; place one ~20 nm out and a second ~20 nm out along the threat-axis direction. Preference is to keep submarines **ahead of** the fleet, biased toward the threat axis. With long sub sensor ranges there's heavy overlap, so 20 nm still gives full coverage.
- **Outputs / effects:** friendly subs hold ~20 nm forward stations with overlapping underwater sensor coverage along the threat direction.
- **Edge cases / quirks:** preference is forward of the fleet (the demo used generic 20-nm points); large sub sensor ranges → lots of overlap at 20 nm.
- **Source:** LCw_eLNeRpI
- **Confidence:** High

### ASW frigate "20 nm cross" all-flank screen
- **Models:** anti-submarine frigates ringed at the four cardinal points because a sub attack can come from any direction.
- **Inputs / parameters:** ASW-capable frigates (Norfolk, Bremen, Karel Doorman, Navarra); HVU center; ~20 nm per flank; four points (front, port, aft, starboard).
- **Behavior / rules:** because "when it comes to ASW you can be struck at any time, anywhere," concentrate ASW frigates at ~**20 nm per flank** — one at each point of a cross around the HVU (front, left, rear, right), forming a 360° ASW ring at ~20 nm radius with overlapping coverage. Contrast AAW escorts (biased to the known threat axis); the ASW ring is **all-around** because subs are omnidirectional threats.
- **Outputs / effects:** four ASW frigates evenly ringed ~20 nm out on all flanks giving all-around anti-submarine coverage.
- **Edge cases / quirks:** all-around placement specifically because the submarine threat is non-directional; ~20 nm is the stated per-flank radius.
- **Source:** LCw_eLNeRpI
- **Confidence:** High

### Close-in "cheap-in-front-of-expensive" picket destroyer placement
- **Models:** a radar-capable but short-ranged escort tucked just behind/near the HVU to add sensor coverage without masking the HVU's own weapons.
- **Inputs / parameters:** a destroyer with good radar but short weapon range (Horizon); direction of travel; spacing from carrier (~1 mi default, ~2.1 mi used); the maxim "cheap stuff always gets in front of the expensive stuff."
- **Behavior / rules:** reserve one short-ranged radar destroyer and place it close to the HVU, slightly **behind** relative to the direction of travel, so it adds radar coverage without "masking the firearms" of the carrier. Typical spacing ~1 mile; the presenter measured ~3 mi and dialed back to ~**2.1 mi**. Doctrine: put cheap/expendable hulls in front of valuable ones so they absorb/screen threats.
- **Outputs / effects:** short-ranged radar destroyer sits a couple miles off (slightly aft of) the carrier, extending the picture without blocking weapon arcs.
- **Edge cases / quirks:** placed slightly behind so as not to mask weapon arcs; direction-of-travel assumption determines what "behind" means.
- **Source:** LCw_eLNeRpI
- **Confidence:** Med

### Patrol/CAP mission with patrol area, station altitude, flight-size throttling
- **Models:** combat air patrol: aircraft cycle on/off a station with a fixed number airborne, balancing coverage vs fuel/sortie rate.
- **Inputs / parameters:** patrol-area polygon (fixed vs relative bearing to a reference); CAP distance (~150 nm); station altitude; flight size (e.g. 2); the "1/3 rule"; one-unit-at-a-time launch; EMCON/radar; ROE checkboxes.
- **Behavior / rules:** create a patrol mission, draw its polygon, and tie it (and its waypoints) to the carrier group via **fixed-bearing** reference points so it moves with the group. Assign aircraft with a flight size (2 at a time) under the **1/3 rule**. CAP is flown at a deliberately **lower-than-max** altitude (reduced to **25,000 ft**) — trading a little range to get the radar "closer to the ground" to better detect low things like sub-launched/sea-skimming cruise missiles (counter to "max altitude for max loiter"). Carrier-aviation range is limited, so each 2-ship can only loiter ~**45 minutes** before relief; launching only 2 at a time follows directly from fuel/range math (the next group may not be ready before the current one bingos).
- **Outputs / effects:** aircraft launch, fly to the area, orbit on station, and rotate; airborne count held at flight size; coverage defined by the polygon.
- **Edge cases / quirks:** polygon must be tied with fixed bearing to the carrier or it won't track the moving group; lower altitude costs range/loiter but improves low-altitude detection; short legs may leave a coverage gap if relief isn't ready; the 1/3 rule's exact arithmetic isn't spelled out.
- **Source:** E6uDwCxeI9M
- **Confidence:** High

### Three-layer CAP architecture (far / flank-mid / ready-deck alert) + AWACS placement
- **Models:** defense-in-depth air defense — outer intercept line, inner flank guard, deck-alert reaction force — fronted by airborne early warning.
- **Inputs / parameters:** threat axis; CAP region geometry; alert-status grouping; manual vs automatic launch; AWACS sensor range; loop/orbit waypoint; EMCON (allow radar).
- **Behavior / rules:** CAP in three layers: **(1) Far CAP** — engages distant threats first, ~150 nm out toward the threat axis, set as a **fixed-bearing** region (so it doesn't drift over neutral territory) with a prosecution zone; **(2) Inner/flank CAP** ("midcap") — guards the closer sides/flanks, shaped into polygons tied to the carrier group; **(3) ready-deck alert** ("alert status five" / 5-minute CAP) — aircraft kept on deck for emergencies. The deck-alert group can be put on an **"Opportunity to Intercept"** mission anchored on the carrier (auto-scrambles on a red contact) or, as chosen, left on deck for **manual** launch so it doesn't panic-launch on every contact. **AWACS/AEW:** establish first (first thing launched); position at roughly **half the distance of your longest-ranged AWACS** reach — with CAP ~150 nm out, the orbit was set forward of the group as a single fixed reference point relative to the carrier (a continuous loop / "power donut"), launch one unit at a time, radar on upon arrival, EMCON set to allow radar. Result: the AEW can "see deep" and gives early warning.
- **Outputs / effects:** nested air-defense coverage with an outer kill line, flank protection, and a held reserve; persistent forward radar picture; early detection well before threats reach the screen.
- **Edge cases / quirks:** auto-launch ("Opportunity to Intercept" around the carrier) reacts to any red contact (undesirable for small ops); flank-cap polygons over land become awkward shapes that must be hand-edited; layers must use fixed bearing to track the group; "half the longest AWACS" is a rule of thumb; EMCON must explicitly allow radar or the AEW won't emit.
- **Source:** E6uDwCxeI9M; ZSVjL25akYU
- **Confidence:** High

### Patrol mission: small patrol area vs larger engagement/prosecution zone + ROE gating
- **Models:** a patrol mission can have a small loiter box but a much larger zone in which it may engage detected targets; weapon release is gated by geography (and configured range).
- **Inputs / parameters:** patrol-area reference points (small, ~100 nm leg); a separate engagement/prosecution zone (large, out to ~260 mi); movement style (repeatable loop); throttle/speed limits; on-station count; ROE/doctrine checkboxes — "Engage targets inside prosecution area," "Engage targets outside patrol area," "Engage within weapons range"; weapon engagement-range / "max range" setting.
- **Behavior / rules:** define two zones — a small loiter area (repeatable loop) and a larger prosecution zone. Anything detected **inside** the engagement zone is automatically attacked: aircraft "immediately abandon the patrol route, go take a look, then come back." Toggle the ROE checkboxes so the CAP keeps orbiting and does **not** engage hostiles until a contact actually crosses into the prosecution zone — then it breaks to engage. Keep on-station numbers limited (4 of N) to retain a reserve. Pressing **P** on a target removes it as a target so the fighter drops the chase and returns to patrol. A separate **max-range / weapon-release** setting governs at what range missiles fire.
- **Outputs / effects:** loiter pattern plus autonomous engagement of contacts within the larger zone; auto-return to patrol after; engagement withheld outside the authorized area (prevents straying into neutral airspace).
- **Edge cases / quirks:** if max/engagement range isn't set, fighters may fail to "shoot at maximum range" and instead close into a dogfight ("somebody forgot to set the max range"); keep the zone off neutral countries. Works for both AAW and ASW patrol types.
- **Source:** E6uDwCxeI9M; ZSVjL25akYU
- **Confidence:** High

### Reference-point anchoring to a moving group (fixed-bearing vs rotating-bearing)
- **Models:** mission/zone reference points can be tied to a moving unit so the mission travels with it.
- **Inputs / parameters:** selected reference points; anchor option — "make selected ref points relative" with **fixed bearing** vs **rotating bearing**; the carrier/parent group; or relative-to-a-tracked-contact.
- **Behavior / rules:** selecting ref points and choosing **relative fixed bearing** to the carrier makes them move **with** the carrier (Hawkeye station, CAP axis follow the group, keeping shape). **Rotating bearing** makes a zone whose size/orientation **changes** as the group moves (used for a 35-mile ASW box so it scales with the group). You can also set an attack zone relative to a known enemy contact so "if he moves around, the mission follows him."
- **Outputs / effects:** mission geometry that auto-tracks the parent group (or a tracked contact).
- **Edge cases / quirks:** map-projection distortion near the poles "will give you a headache" when placing relative axes; fixed-bearing keeps shape, rotating-bearing rescales.
- **Source:** ZSVjL25akYU
- **Confidence:** Med

### Contact position confidence, ageing, and Mark Position
- **Models:** a contact track has a **confidence/uncertainty that grows as time passes** since last detection; you can stamp a position.
- **Inputs / parameters:** time since last detection (e.g. "11 minutes ago," "2 hours and going slow"); assumed target speed; Mark Position tool (right-click); Shift-drag to move a whole mission.
- **Behavior / rules:** after losing contact, the likely-area **expands** as a function of elapsed time × assumed speed ("this was 11 minutes ago so they're probably anywhere in this position"). Manually move the search mission to the projected position (drag the whole mission with Shift) and re-seed buoys. **Mark Position** (right-click) stamps the time/place of the last sighting so you can reason about where the target is now. The longer it's been (hours), the **lower** the chance of re-acquisition.
- **Outputs / effects:** an estimated current-position area; updated search placement; a timestamped last-known mark.
- **Edge cases / quirks:** after hours, re-acquisition is "very unlikely"; confidence visibly tightens when triangulated by two arrays (e.g. two SOSUS lines, §3) and loosens with time; right-click also offers Mark Hostile.
- **Source:** ZSVjL25akYU
- **Confidence:** High

### Unassisted self-defense missile engagement / value of off-board sensors (E-2)
- **Models:** a warship can engage incoming anti-ship missiles with its own organic SAMs even without external cueing, but networked early warning makes interception far more reliable.
- **Inputs / parameters:** incoming anti-ship missile; defending ship's own radar (on/off); air-defense weapons; presence/absence of an off-board AEW (E-2); hostility/posture setting of the opposing side.
- **Behavior / rules:** demo — a heavy incoming salvo vs a dense screen. A Tico (Bunker Hill CG) took a hit while its **own radar was not active** (defended/absorbed unassisted). Lesson: with an **E-2 (AEW)** watching, inbound raiders would have been detected early and F-35s/CAP would intercept them before they closed — networked sensing dramatically improves defense. Also: an opposing side must be explicitly set **hostile** or it won't shoot at all ("probably would help if I set the other team to actually be hostile").
- **Outputs / effects:** ships fire organic SAMs at incoming missiles; without off-board AEW some leakers get through; with AEW threats are intercepted at range.
- **Edge cases / quirks:** a ship can be hit even unassisted (radar off) and the HVU carrier still survived behind the screen; sides not set hostile hold fire entirely.
- **Source:** LCw_eLNeRpI
- **Confidence:** Med

### Standoff via enemy weapon/radar range ("beat them on range")
- **Models:** if you stay outside an attacker's weapon **or** targeting-radar range, it cannot engage you.
- **Inputs / parameters:** enemy missile ranges (Kipper/Kingfish 175 mi; Kitchen Mod 1 215 mi); enemy maritime-recon radar range (Big Bulge J = **260 nm**); own position.
- **Behavior / rules:** read each threat's max weapon range from the DB; if the carrier never lets the bomber inside that range, "they can't touch us." The Tu-95's Big Bulge J reaches **260 nm** — keep the carrier farther than 260 nm and it can't even detect/target you. Strategy: force long enemy ingress, then deny the last leg into weapon range; many Soviet raids were "driven off" before reaching missile range and "never found our carrier."
- **Outputs / effects:** whether the enemy can detect/launch on you; engagement avoided by geometry.
- **Edge cases / quirks:** Soviet bombers had no fighter escort / no A2A, letting the carrier "speed-chess" with its Hawkeye and F-14s; a far raid arrives low on fuel and at a disadvantage.
- **Source:** ZSVjL25akYU
- **Confidence:** High

### Carrier-aircraft fuel/range & sortie-cycle as the limiting factor
- **Models:** carrier aircraft have short legs and a long re-arm/cycle delay, capping how far and how persistently you can project air power.
- **Inputs / parameters:** loadout-specific endurance/radius (Heavy Barrier CAP ≈ 1.5 hr at 150 mi; an F-14 shown mid-mission with 35 min/~206 mi, etc.); launch-all vs stagger; deck re-spot/refuel/re-arm delay (~**3 hours** to ready the next set); intercept speed (cruise vs flank).
- **Behavior / rules:** launching **all** aircraft at once means "I don't have my next set ready for another 3 hours" → a coverage gap after the airborne group's ~1.5 hr endurance. So: don't commit everything; keep a couple interceptors on deck ready; set CAP/barrier **near** the carrier (~150 mi axis, ~100 nm leg = "15 minutes flying time"), not far forward, or aircraft arrive on fumes. To engage a far raid, send **fresh** aircraft and **recall** low-fuel ones rather than dashing the current group out of range. Limit intercept speed to **cruise** (not flank) or "they will run out of fuel before they get in range." The one F-14 lost in the run was lost to **fuel exhaustion** (ditched), not enemy fire.
- **Outputs / effects:** whether aircraft can reach/engage and return; coverage gaps; fuel-loss attrition.
- **Edge cases / quirks:** continually cycle groups in/out; an interceptor can be ordered to attack but still "just won't have the fuel"; recall before bingo to avoid ditching; full-tank fresh launch needed for long intercepts.
- **Source:** ZSVjL25akYU
- **Confidence:** High

### Anti-ship missile engagement & target identification (Exocet example)
- **Models:** surface strike with a sea-skimming anti-ship missile against an under-classified surface contact, fired from beyond the target's reach.
- **Inputs / parameters:** surface contact (suspected patrol craft, class partly unknown); available ASuW weapons (Exocet Block 2/3); option to send an analyst to identify; the target's own (short) weapon range vs your reach; decoy/jammer load.
- **Behavior / rules:** when a surface threat appears and the force lacks a dedicated ASuW platform, fire ship-launched anti-ship missiles (Exocet) at it. You can dispatch an **analyst** to classify an unknown contact; the geometry showed the contact's likely short weapon range couldn't reach the carrier, but the operator engaged anyway with a long-range Exocet so the target "won't even know it got shot at" (fired from beyond its reaction range). The Exocet is highlighted as one of the few anti-ship missiles with a real combat track record.
- **Outputs / effects:** anti-ship missile launched at the surface contact; target struck, often without warning if fired from outside its detection/weapon envelope.
- **Edge cases / quirks:** CAP-optimized air wings leave the group short on dedicated anti-surface capability; identification improves by sending an analyst first; engaging from beyond the enemy's range yields a surprise hit; the operator deliberately avoided a particular munition — weapon selection matters per target.
- **Source:** E6uDwCxeI9M
- **Confidence:** Med

---

## 16. Special delivery & clever shots

### SDV / DDS (dry-dock shelter) submerged deployment and endurance
- **Models:** a DDS-equipped submarine launches SDV mini-subs **underwater** without surfacing; SDVs have very short endurance.
- **Inputs / parameters:** submarine with DDS; SDV craft (e.g. SDV Mark 8 Mod 1, max **2** carried); launch action (F7, launch as group); SDV endurance (**6 h 45 min** stated).
- **Behavior / rules:** a DDS lets a sub deploy SDVs while submerged ("without surfacing"). Select sub → F7 → launch SDVs as a group; embarked troops board, the DDS floods and opens, and the SDVs float out. SDVs then transit on their own short endurance — "6 hour and 45 minutes" / "basically no range." The submarine then creeps away at max depth.
- **Outputs / effects:** SDVs in the water carrying their team; submarine free to depart submerged.
- **Edge cases / quirks:** carrying limit (only 2 SDVs); SDV endurance is the binding constraint; deploying too close to shore can leave the sub "poking out of the water" if too shallow.
- **Source:** i1WkusTHN7k
- **Confidence:** High

### Zero cargo capacity of submarines and SDVs (no troop-as-cargo loading) + teleport workaround
- **Models:** subs and SDVs cannot carry "cargo"; troops can't be loaded into them as cargo objects — forcing an Event-Editor teleport for the troop deployment.
- **Inputs / parameters:** submarine cargo capacity (none); SDV cargo capacity (none); an Event = Trigger (Unit Enters Area: Target type Submarine, subtype SDV, a date/time window, target area) + Condition ("Scenario has started") + Action (Teleport to Area: selected units, FROM marshalling area, TO destination beachhead area).
- **Behavior / rules:** submarines "have no cargo capacity"; the SDV "also has no cargo capacity," so you cannot load troops as cargo into an SDV and then a sub. **Workaround:** create the troop units elsewhere and **teleport** them into position when the SDV arrives. Build the event: the trigger fires when an SDV enters the defined deploy zone within the allowed window; the condition "Scenario has started" must be true; the action **teleports** the SEALs from their marshalling zone to the beachhead — they "immediately arrive." You must pick the correct **FROM** (origin) vs **TO** (destination) area, and lock reference points so players can't move zones. This replaces Lua for simple unit movement.
- **Outputs / effects:** troops cannot be physically embarked via cargo; units are instantly relocated from marshalling to destination when trigger + condition are satisfied.
- **Edge cases / quirks:** easy to swap FROM/TO by mistake; reference points should be locked; the date/time window can accidentally be set to a wrong day/year.
- **Source:** i1WkusTHN7k
- **Confidence:** High

### Over-the-shoulder / reverse cruise-missile shot (Tomahawk) to evade directional SAMs
- **Models:** land-attack cruise missiles can be routed the "long way around" to approach from an undefended bearing.
- **Inputs / parameters:** launching platform heading; target region; intervening SAM sites and their coverage arcs (directional vs omnidirectional); missile waypoint/route.
- **Behavior / rules:** although the shortest path to a ~30 nm target is a straight line, the Tomahawk is fired in the **opposite** direction (over the shoulder) and routed all the way around to attack from a different bearing — because the SAM sites defending the target are **directional** (cover only a sector); approaching from outside their facing arc avoids their engagement zone. The missile flies the long route and strikes from the unguarded side.
- **Outputs / effects:** cruise missile attacks from a bearing the directional SAMs don't cover, raising leakage probability, at the cost of extra flight distance/fuel.
- **Edge cases / quirks:** only advantageous against **directional** SAM coverage (a 360° SAM gains nothing from the detour); the reverse route costs range/flight time.
- **Source:** KvTfNasjV_A
- **Confidence:** High

### High-off-boresight (side / over-shoulder) air-to-air missile shot
- **Models:** modern high-off-boresight dogfight missiles can be launched well off the nose (sideways, even ~180°) instead of requiring a forward firing cone.
- **Inputs / parameters:** forward-fired A2A missile with high-off-boresight capability; target bearing relative to own aircraft (abeam, or behind); missile energy state.
- **Behavior / rules:** flying alongside an enemy aircraft, you can shoot "straight sideways" rather than maneuvering into a tail chase — these new-generation missiles come out the side even though they're forward-fired; some variants effectively fire backward, performing up to a **180°** turn after launch. Trade-off: an extreme off-boresight / reversing turn **bleeds energy** ("runs out of energy when you do that"), reducing effective range/Pk (the demo missed the kill).
- **Outputs / effects:** missile departs off-axis (abeam or rearward) and turns toward the target without the launching aircraft pointing at it.
- **Edge cases / quirks:** extreme off-boresight / 180° shots cost energy and can fail to reach; capability varies by weapon (only certain high-off-boresight missiles can do large turns or fire rearward); still nominally a "forward-fired" weapon.
- **Source:** KvTfNasjV_A
- **Confidence:** Med

---

## Cross-references & resolved tensions

- **Active-emitter intercept multiplier — three figures, treat as qualitative.** Stated as **3×** (active
  sonar, Nk5M6gYaEvI), **2×** (active sonar demo, wKXTZu2pNo4), and **1.5×** (active emitters generally,
  -3pP4_FAg68). They are single-engagement readings; the governing rule is "an active emitter is heard
  **well beyond** its own detection range," so pinging/emitting is a strong self-betrayal. (§4, §6.)
- **"Deep = quiet" vs masking geometry.** Going deep generally lowers detectability and lets you run
  faster (§7), **but** when hiding behind a loud ship the **masking angle grows with depth**, so a deeper
  masked sub is detected *more* readily than a shallow masked one (§2). Depth helps when *you* are the
  noise source to be hidden; it hurts the *geometry* of someone else's mask.
- **Towed array doubles range yet can miss a shallow target.** Halving speed ≈ doubling detection range
  via the towed array (§3, §2), but the array's **fixed operating depth** can pass under/over a target
  **shallower** than the array, missing it entirely (§3). Range advantage ≠ guaranteed detection.
- **Stopping defeats acoustic torpedoes but not wake-homers.** A fast ship clearing the seeker cone (or
  going very quiet) can beat a conventional acoustic torpedo, but a **wake-homer** re-finds the target via
  its wake even at a full stop (§8). Match the evasion to the seeker type.
- **No guaranteed torpedo evasion.** Across decoys (probabilistic gate roll), auto-evasion (counter-
  productive on a poor fix), and wire-guided exploits (only a small late turn works, not a 90°), the
  stated conclusion is that **running away is the best available defense** and nothing is guaranteed (§9).
- **Long range cuts both ways.** For missiles, more range = more **target reaction time**; against an
  **emitting** defender shoot from short range, against a **non-emitting** target you can shoot from any
  distance (§13). For torpedoes, long kinematic range can beat the AI's engagement envelope **if** you can
  detect that far, but gives a maneuvering target more time (§8).
- **Damage, fire/flooding, point-defense saturation, dud rolls, and DLZ gating** all follow the general
  models inlined above (torpedo aspect = general armor/HP model; warhead/fire/flooding = subsystem +
  fire/flood model; missile-vs-interceptor = per-layer point-defense ladder + fire-control-throughput
  saturation; weapon reliability = independent dud roll; kinematic-range firing = DLZ/min-range gate);
  the naval rules above are the sub-surface/anti-ship *observations* of those mechanics, not separate
  models.
