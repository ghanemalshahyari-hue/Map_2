# CMO Functional Rules — Cluster 3: Damage, Weapons Effectiveness & Attrition

**Scope.** How Command: Modern Operations (CMO) computes hit probability, penetration, damage
against target HP/armor, degradation/mission-kill, point-defense saturation, range/altitude
kinematic effects, and special weapons (EMP/microwave/laser-dazzle/nuclear/flak/CRAM). The goal is
that RMOOZ adjudication produces CMO-consistent results rather than an invented approximation.

**Videos read (18 of the Strike & Weapons + adjacent bucket):**
- Tutorial - Bombing (bPVkIPVlNlA) — **core bombing accuracy/damage (primary)**
- Point Defense (3E5MA0i5Wzc) — **point-defense / CIWS resolution (primary)**
- Weapon Penetration (Skejttm4Pv8)
- Air to Ground Weapon Effectiveness (NsNzObOegPk)
- Effect of Altitude on Bombing Accuracy (RDE4S8kzZTQ)
- Effect of ground radar on bombing accuracy (nxaO2Er_9Lw)
- Cluster versus Iron Bombs Comparison (XZ1EdSDI0mE)
- Bunker Busting Bombs (jcBmWBHbj8U)
- Impact of range on missile weapons (2PzsXm-fhFA)
- NEZ vs 75% Max Range Missile Fire (qHuId62Lba8)
- Many missiles vs only one (dIQmufLikyQ)
- Missile Performance at Altitude (dui_lPsECfE)
- Flak Changes and Tactics (kFfhkYXDd2o)
- Jettison Weapons Effects (CwRX1W5LQEU)
- Bombing a ship with unguided bombs (oVs-5gylEcA)
- Weapon Records and Mounts (_4bB81QPcFc)
- EMP Weapons (xzP8hBNXiu0), Microwave Weapons (7UFHmSrJHmM), Tactical Nuclear Weapons (LO2zxtP5yFg),
  Laser Dazzling Weapons (qt-kuIpzVrU), C-RAM (gDeOE5SJRVQ)

**Caveat.** Transcripts are auto-generated (imperfect wording) and the presenter often reads the
on-screen "weapon endgame" report aloud. Numbers quoted below are verbatim from those reports for
single illustrative engagements, **not** documented formulas — treat exact percentages as examples,
not constants. Several key parameters (a weapon's penetration value) are explicitly stated to be
**hidden/obfuscated** in the player-visible database — though the Bombing tutorial does expose a
usable **HE-vs-light-armor ~80% damage-reduction** shortcut and a **published per-ship "missile
defense rating."**

---

## Hit probability

### Probability-to-hit pipeline (weapon endgame report)
- **Models:** CMO resolves each shot as a **base Pk for the weapon**, then applies a chain of
  multiplicative/additive modifiers, then rolls against the final number.
- **Inputs / parameters:** base/original probability of hit (per weapon record), target speed,
  range/distance, target agility (nominal, then adjusted for altitude + empty-weight fraction),
  shooter proficiency, impact/intercept angle ("deflection"), illumination/line-of-sight, EW
  (jam/spoof).
- **Behavior / rules:** the endgame box lists the steps explicitly. Example chain read aloud
  (CwRX1W5LQEU, SA-2 vs F-15E): "original probability of hit 30% (from the weapon) → adjusted for
  actual speed 20% (−10% for speed) → agility/altitude/empty-weight-fraction modifiers → final
  agility modifier −5 → **final probability of hit 8%**", then "result was a 65, rolled a miss"
  (i.e. a single d100 roll vs the final Pk; higher roll = miss). Other readings: range adjustment
  knocks ~10% off at extreme range (2PzsXm-fhFA: "percent to hit adjusted for distance 46… final
  ~20%"); target speed/agility dominate for fast jets; **deflection/intercept angle matters "almost
  more than empty weight fraction"** — a hard beam/turn (square-to-missile vs forward-oblique)
  changes Pk by several points (CwRX1W5LQEU).
- **Outputs / effects:** single hit/miss per weapon; misses logged with reason (spoofed, stalled,
  high-deflection no-effect, malfunction).
- **Edge cases / quirks:** **"adjusted for distance"** only appears when firing near max range — a
  closer (≤ ~half-range) shot shows *no* distance penalty (2PzsXm-fhFA). EW can override the entire
  chain: "spoofed/jammed" zeroes the shot regardless of computed Pk.
- **Source:** Jettison Weapons Effects (CwRX1W5LQEU); Impact of range on missile weapons (2PzsXm-fhFA)
- **Confidence:** High (mechanic shape), Low (specific numbers)

### Weapon malfunction / dud roll
- **Models:** independent reliability roll per weapon, applied even on a geometrically perfect hit.
- **Inputs / parameters:** weapon reliability (per record). GBU-28 example quoted at "15% chance of
  malfunctioning."
- **Behavior / rules:** if the weapon malfunctions it does no damage ("whistling noise and thunk"),
  regardless of aim. Older PGMs (GBU-10/28) shown repeatedly dudding; reason for firing several.
- **Outputs / effects:** no-damage event, target untouched.
- **Source:** Bunker Busting Bombs (jcBmWBHbj8U); Weapon Penetration (Skejttm4Pv8)
- **Confidence:** Med

### Bomb-sight tier is the dominant unguided-accuracy term
- **Models:** for **unguided** bombs the single biggest accuracy driver is the **aircraft's bomb-sight
  class** (a per-platform DB field, "bomb sight … in game terms"), not the bomb. Four tiers, each a
  generational step in CEP.
- **Inputs / parameters:** bomb-sight tier — **Basic** ("not great," e.g. S-3B), **Ballistic
  computing** ("~1960s," equiv. Mk.21 sight, Mirage F1), **Advanced computing** (CCIP, F-16CJ; the
  **B-52 is rated Advanced computing**), **Advanced navigation / INS-GPS** (best possible, F-18C,
  F-35, Su-34); plus pilot proficiency, weather/wind, visibility, target damage points.
- **Behavior / rules:** controlled "bombs per target killed" runs against the same depot, **all at
  the platform's default high altitude**, holding everything but the sight constant:
  - **Basic sight, Mk-82 @ 200 ft:** *"dropped 120 500-pound bombs, total losses a single ammo pad —
    that was horrible"* → **~120 bombs / 1 kill**; "with a basic sight you're as effective as World
    War 1 bombers."
  - **Ballistic computing (Mirage F1), 250 kg @ 200 ft:** *"168 … and we got three"* → **~56 bombs /
    kill.**
  - **Advanced computing (B-52) @ 36,000 ft:** *"540 bombs … six … about 100 bombs for every single
    target"* → **~90 bombs / kill** even from 36k.
  - **Advanced INS-GPS (F-18C), Mk-82 @ 200 ft:** *"less than a hundred bombs and killed three … 33
    bombs per target"* → **~33 bombs / kill** — the floor.
- **Outputs / effects:** picks how many aircraft/bombs a target needs; the operator is told to
  literally divide damage-points by per-hit damage and then multiply by the sight's hit ratio.
- **Source:** Tutorial - Bombing (bPVkIPVlNlA)
- **Confidence:** High (mechanic + the four quoted ratios for these illustrative runs)

### Accuracy vs bombing altitude (resolved: altitude matters *only* below the top sight tier)
- **Models:** unguided-bomb accuracy falls off with altitude **for lower bomb-sight tiers**, but the
  effect **flattens out at the Advanced-INS tier** — the previously-flagged "non-monotonic vs
  monotonic" contradiction is resolved by the primary Bombing tutorial: **altitude is conditioned on
  sight quality.**
- **Inputs / parameters:** release altitude, **bomb-sight tier** (the gate), wind (grows with
  altitude), weapon min-release / fuze-arming altitude, local terrain elevation.
- **Behavior / rules (Bombing tutorial, authoritative):** *"in general the accuracy is about the same
  until you get to advanced INS — once you start getting into that category you can start dropping from
  very high altitudes unguided without being nervous about it."* So:
  - **Basic / Ballistic / Advanced-computing sights:** lower = more accurate; *"the older the
    bomb-sight system the lower altitude you're going to have to be to be effective."* Wind at 36,000 ft
    "deviates significantly," so high drops rely on **volume** (more bombs) to compensate.
  - **Advanced INS-GPS sight:** can drop accurately from very high altitude — altitude penalty
    effectively removed. (This is the F-18C result above: 33 bombs/kill from a low pass, and the
    narrator says he'd "still hit" from high with this system.)
  This supersedes the earlier RDE4S8kzZTQ "non-monotonic survival curve" reading: that curve reflects a
  **GPS/CCIP-sighted** aircraft where altitude barely matters, *plus* a min-release floor at the very
  bottom — not a true mid-altitude accuracy peak. Treat the RDE4S8kzZTQ survivor counts as a single
  noisy sample, and the **sight-tier rule above as the governing model.**
- **Outputs / effects:** sets the trade between AAA exposure (low) and miss rate (high) for non-top
  sights; top-tier INS aircraft can stay high and safe **and** accurate. See range/altitude.
- **Source:** Tutorial - Bombing (bPVkIPVlNlA) (primary); Effect of Altitude on Bombing Accuracy
  (RDE4S8kzZTQ) (secondary sample)
- **Confidence:** High

### Minimum release altitude & terrain-blocked drops ("won't drop")
- **Models:** a bomb has a **minimum / default release altitude**; below it (or with terrain in the
  way) the weapon **does not release at all** — a precondition gate before any Pk roll.
- **Inputs / parameters:** weapon min-release / retarder-arming altitude, **AGL vs local terrain
  elevation**, auto- vs manual-attack mode, commanded attack altitude.
- **Behavior / rules:** default mission **attack altitude = 2,000 ft AGL**; an **auto-attack with no
  altitude set dives to 200 ft AGL** (and into any AAA there). To set a custom attack altitude you
  must use **manual attack** ("whip manual attack"). Retarder/air-brake bombs (Snake-Eye, BLU) attack
  *very* low — **~80 ft AGL** — and are **"virtually useless on a windy day."** Demonstrated failure
  modes: a bomber **too high over a mountain** would not drop (the bomb path was terrain-blocked); and
  setting altitude **too low** relative to local terrain elevation also blocked release until raised
  to a clear AGL. **GPS/sat-nav bombs refuse to target anything in the water** ("it assumes it's not
  going to hit it").
- **Outputs / effects:** "where are my bombs?" — no release event, target untouched, no expenditure.
- **Source:** Tutorial - Bombing (bPVkIPVlNlA)
- **Confidence:** High

### Ground/attack radar does NOT improve unguided bomb accuracy
- **Models:** turning on the aircraft's air-to-ground radar from IP→Winchester produced **identical**
  damage (same buildings/aircraft killed) as radar-off in a controlled rerun.
- **Behavior / rules:** radar's value is **detection** (finding more targets), not a Pk modifier on
  the drop. The large lethality gain in the demo came from changing **WRA salvo size** (drop 4 at a
  time across spread targets) — i.e. allocation/doctrine, not the radar.
- **Source:** Effect of ground radar on bombing accuracy (nxaO2Er_9Lw)
- **Confidence:** High

### Wind / terrain degrade unguided & cluster accuracy
- **Behavior / rules:** high wind (Sea State 4-ish) scatters unguided and especially cluster bombs
  ("notorious for getting carried by the wind"); rough terrain (jungle vs open desert) "dramatically
  degrades the quality of the weapon." Guidance (laser/INS/WCMD) is what removes the wind term.
- **Source:** Cluster vs Iron Bombs (XZ1EdSDI0mE); Air to Ground Weapon Effectiveness (NsNzObOegPk)
- **Confidence:** Med

---

## Penetration & damage

### Armor vs penetration resolution (core damage model)
- **Models:** damage = (weapon damage points) × (fraction that gets through armor), where the
  through-fraction is governed by comparing the weapon's **penetration value** to the target's
  **armor class**. Target has **damage points (HP)**; armor classes are Light / Medium / Heavy /
  **Special** (e.g. battleship/bunker "special 201–500 mm" — a class label, not literal mm).
- **Inputs / parameters:** weapon damage points (e.g. Mark 82 ≈ 130; GBU-31/Mk-84 ≈ 363; Hellfire
  ≈ 8; Harpoon ≈ 166); weapon penetration value (**HIDDEN in the player DB even when the record says
  "penetrator"**); target armor class; target damage points / HP.
- **Behavior / rules (stated rules):**
  - **No armor:** 100% of damage applies. (Tent/straw target took full damage.)
  - **Non-penetrator vs armor:** only a small fraction gets through. Examples read from the
    endgame: light/wood structure absorbed ~8% (92% got through); **special armor absorbed ~96%
    (only ~4% of a non-penetrator's damage got through)**.
  - **Penetrator with penetration ≥ armor:** "automatically penetrates it completely" = 100%
    penetration. If penetration is **far above** the armor it does **double damage** (the "no armor"
    case also yields ~double damage — a penetrator over-matching an unarmored target did 2× its
    damage points). If penetration is **balanced/matched** to special armor, "you do basically your
    full damage" — endgame showed special-armor hit = "100 penetration, armor penetrated, 40%
    penetration" doing only partial HP.
  - **Below-threshold damage does nothing:** "once you get below a certain amount of damage it
    doesn't do anything" — tiny weapons (.50 cal vs battleship) never accumulate effective damage.
- **Outputs / effects:** HP reduction → percent-damaged readout; armor reduction shown as a
  percentage in the endgame log.
- **Edge cases / quirks:** the **same weapon does ~2× damage to an unarmored target as to a matched
  target** — counterintuitive but stated explicitly. Penetration is invisible to the operator, so
  you cannot pre-compute through-fraction from the UI.
- **Source:** Weapon Penetration (Skejttm4Pv8)
- **Confidence:** High (qualitative rules), Med (the explicit "double damage" / 4% figures)

### Bomb damage arithmetic — HE-vs-armor 80% reduction & the divide-to-kill rule
- **Models:** the Bombing tutorial states the through-armor model **as an explicit operator formula**,
  corroborating and quantifying the hidden-penetration model above: required hits =
  `ceil( target damage points ÷ (weapon damage × through-fraction) )`.
- **Inputs / parameters:** target **damage points** + **armor class** (both visible on the DB page),
  weapon **damage points** + **warhead type** (HE / SAP / AP / penetrator), number of clean hits.
- **Behavior / rules (verbatim worked examples):**
  - **High-Explosive (HE) vs armor → "~80% reduction-ish in the amount of damage":** a Mk-82 (130
    damage, HE) on a **light-armor** building "is probably going to be closer to **104**" (130 × ~0.8).
    Against a 450-dmg light-armor building → **5 direct hits** needed (450 ÷ 104). *(Note the ~0.8
    multiplier here is the same effect as Skejttm4Pv8's "non-penetrator vs armor passes only a small
    fraction"; the Bombing tutorial pins the **light-armor HE retained fraction at ~20% loss / ~80%
    retained**, far gentler than Skejttm4Pv8's special-armor ~4%.)*
  - **Bigger yield trades accuracy for fewer bombs:** Mk-83 = 303 damage HE → 303 × 4 × 0.8 ≈ **1,000**,
    so a single aircraft's four bombs destroy the 450-dmg building. *"The bigger your yield the less
    need for accuracy."*
  - **Below-threshold damage rule** is consistent: tiny per-hit damage never accumulates a kill.
  - **Heavier armor classes (T-80 tank, hardened bunkers) "require special weapons"** — HE alone is
    insufficient regardless of count.
- **Outputs / effects:** lets the operator pre-compute salvo size from the visible DB even though raw
  penetration is hidden — the HE armor multiplier is the knowable shortcut.
- **Edge cases / quirks:** the ~80% figure is stated as "ish" and only demonstrated for **light**
  armor; do not extrapolate the exact multiplier to medium/heavy/special (those fall back to the
  penetration-vs-armor table in the core damage model).
- **Source:** Tutorial - Bombing (bPVkIPVlNlA)
- **Confidence:** High (the divide-to-kill mechanic), Med (the exact ~0.8 light-armor multiplier)

### Warhead type modifies the armor term (HE / SAP / AP / penetrator)
- **Models:** a bomb's **warhead class** sets *how* its damage interacts with armor — a discrete tag
  on the weapon record, orthogonal to its raw damage points.
- **Inputs / parameters:** warhead tag (High-Explosive / Semi-Armor-Piercing / Armor-Piercing /
  Penetrator), target armor class & hardness/burial.
- **Behavior / rules:**
  - **High-Explosive (HE):** ~80% damage **loss** against (light) armor as above; full damage only vs
    unarmored.
  - **Semi-Armor-Piercing (SAP)** (e.g. S-14): **ignores light armor and delivers full damage** (the
    250-dmg SAP "is gonna do all 250" to a building); reduced vs a bunker but still better than HE.
  - **Armor-Piercing (AP):** "punches a hole … the projectile goes out the other side" — **low damage
    but can penetrate anything.** Good against armor, poor as a structure-killer.
  - **Penetrator** (e.g. GBU-109): designed for **"100 meters of earth before exploding on an
    underground bunker"** → **"100% of the damage hits whatever you damage"** on hardened/buried
    targets (matches the Bunker-Busting mechanic).
- **Outputs / effects:** the warhead tag is the per-weapon multiplier the operator reads to decide HE
  for soft/area, SAP to beat light armor, penetrator for buried/hardened.
- **Source:** Tutorial - Bombing (bPVkIPVlNlA); Weapon Penetration (Skejttm4Pv8)
- **Confidence:** High

### Guidance taxonomy & illumination/coordinate gating (bombs)
- **Models:** bombs are sorted by **guidance type**, and each type imposes a **precondition** on
  whether/where it can be employed (a gate before the Pk/CEP roll). CEP itself is a per-munition
  accuracy+reliability rating ("all these munitions have a rating based on CEP").
- **Inputs / parameters:** guidance class — **Unguided**, **Command** (man-in-the-loop, e.g. Walleye /
  RB-05 flown on a joystick), **Passive** (IR / **laser-guided LGB** — needs continuous illumination),
  **Sat-nav** (GPS / GLONASS — JDAM), **Laser-JDAM** (laser *or* GPS); plus illuminator availability,
  laser stand-off range, target coordinates, weather/cloud LOS.
- **Behavior / rules:**
  - **LGB / laser-guided:** needs a laser **on the target at all times**; **if the illuminator dies
    mid-flight the bomb "goes huh and crashes."** Laser-guided bombs **only see the laser to ~2 miles
    (≈ 10,000 ft)** — so a self-lasing aircraft must fly into ~10k-ft LOS — **unless** it carries a
    modern **targeting pod good to ~40,000 ft.** Released near the launch-envelope floor (GBU-10 run
    held at **11,000 ft**); aircraft turned to keep the target lit after release.
  - **Sat-nav (GPS/GLONASS):** "fly to the coordinate you tell them" — can be **dropped from ~60,000
    ft** and the aircraft turns home; **cannot hit a moving target**, and **won't engage a target in
    the water.** CAB-500 = 319 damage warhead; **JSOW ≈ 50 nm** glide radius.
  - **Radar bombing (B-52 / advanced):** sees **through cloud** — drop without optical LOS as long as
    the target is detected (only fails vs a contact you must see, e.g. a man in the woods).
  - **Cloud/weather:** kills passive/laser guidance entirely ("laser-guided bombs are worthless");
    sat-nav and radar bombing are unaffected. Wind ruins unguided **and** air-brake/retarder bombs and
    "even LGBs … especially when the weather gets really bad."
- **Outputs / effects:** explains drop-altitude choices and "why won't it release" for guided stores;
  feeds CEP into the hit roll once the gate passes.
- **Source:** Tutorial - Bombing (bPVkIPVlNlA)
- **Confidence:** High

### Salvo allocation & attack geometry on hard linear targets (WRA, flight size, bridge axis)
- **Models:** **lethality per sortie is set by allocation, not just per-bomb accuracy** — flight size,
  Weapon-Release-Authorization (WRA) salvo size, and **run-in geometry** decide whether bombs land on
  the target.
- **Inputs / parameters:** flight size (small = column "like ants," hits a point target accurately;
  large = covers area), WRA salvo (default for unguided = **"all weapons" → drops the entire stack on
  the first target**; guided defaults differ), attack heading vs target's long axis, re-attack
  doctrine.
- **Behavior / rules:**
  - **Flight size & WRA:** set WRA **below** the full stack to force re-attacks and spread bombs across
    multiple aim points; a 6-ship flight on a small target wastes ordnance unless WRA is tuned. (This
    is the same allocation lever as the ground-radar demo in the existing spec.)
  - **Linear target (bridge, 150 dmg pts, light armor):** **cannot attack perpendicular** with
    unguided bombs (only an LGB can) — a perpendicular run **missed** even from a good aircraft; attack
    **along the bridge axis** (or a Vietnam-style **oblique** to avoid the defenses sited on both ends)
    so the bomb stick's scatter falls **along** the span. Switching from perpendicular to with-axis
    gave **"100% more damage to that bridge."** Stacking aircraft **in trail** so they hit the **same
    point** concentrates damage on a hard target.
  - **Worked plan (bridge):** 150 ÷ (Mk-82 104 effective) ≈ 2 solid hits; estimated aircraft needed by
    sight at altitude — **Basic ≈ 50 aircraft, low-altitude ≈ a quarter of that, Ballistic ~that many,
    Advanced-INS ≈ 2 aircraft / ~4 bombs.** The INS run killed the bridge with 2 of 4 bombs.
- **Outputs / effects:** turns target damage-points + armor + sight tier into an aircraft/bomb count
  and a recommended run-in heading.
- **Source:** Tutorial - Bombing (bPVkIPVlNlA); Effect of ground radar on bombing accuracy (nxaO2Er_9Lw)
- **Confidence:** High

### Ship armor is directional (belt vs deck)
- **Models:** ships carry **per-zone armor** (belt armor RHA value vs **deck armor**, often *none*
  on modern carriers/cruisers). Impact geometry selects which armor the weapon must defeat.
- **Inputs / parameters:** belt armor (e.g. 90–140 mm RHA), deck armor (frequently 0 on modern hulls),
  impact angle (low/side = belt; steep/top-down = deck), bomb size, salvo pattern.
- **Behavior / rules:** a top-down/oblique stick "goes through the deck" (little/no deck armor) and
  does heavy damage; a low side-on run hits the thick belt and is largely absorbed (example: ~34%
  penetration on a side hit, then "armor sucked it all off… no real damage," ~5% total). Modern
  defensive layout is broadside-optimized, so stern/bow approach reduces defensive fire. Old
  battleships (Iowa) have **special armor on both belt and deck** — unguided/light weapons "knock
  antennas off" only.
- **Outputs / effects:** identical bombs produce catastrophic vs near-zero damage purely from
  geometry. Fires + flooding can finish a ship even after a moderate penetration (lightly armored
  carrier sunk by 4× 250 kg cluster bombs via accumulated holes/fire/flood).
- **Source:** Bombing a ship with unguided bombs (oVs-5gylEcA); Cluster vs Iron Bombs (XZ1EdSDI0mE)
- **Confidence:** High

### Underground / hardened bunkers & required penetrators
- **Models:** hardened/underground targets have ~2× the damage points of a surface bunker and very
  strong armor; some flagged "penetrators required."
- **Inputs / parameters:** bunker type (surface hardened ≈ 1,600 dmg pts; underground ≈ double),
  clean-hit vs near-miss, weapon penetration & explosive size, (designer-set) burial depth.
- **Behavior / rules:** big non-penetrators (Mk-84/GBU-31) on an underground target did only ~10%
  per clean hit ("shaking china", no fire/flood since not floodable). Penetrators (GBU-28/37/57,
  CAB-1500) do far more **when the hit is clean**; a near-miss of even 31–45 ft against a bunker is
  effectively a gutter-ball. Later penetrators trade some penetration for **larger explosive** and
  are also usable on runways. The GBU-57 MOP "does more damage than any of these bunkers can
  survive" on a clean hit. **Detection gate:** an undetectable (no-signature) underground target
  can't be targeted at all unless the designer set auto-detect.
- **Edge cases / quirks:** accuracy, not warhead, is usually the limiter — "you'll need a lot more
  weapons than you expect when hitting a target you can't see."
- **Source:** Bunker Busting Bombs (jcBmWBHbj8U)
- **Confidence:** High

### Weapon-type effectiveness vs target class (area vs point)
- **Models:** lethality depends on (target hardness × dispersion of the weapon). CMO ranks weapon
  classes by how their damage spreads vs concentrates.
- **Behavior / rules (from the A-G shootout):**
  - **Iron/low-drag bombs:** great vs stationary hard targets; **near-useless vs armor unless near-
    direct hit**; soft targets die from proximity alone.
  - **Cluster bombs (CEM many-bomblet OR few-large-bomblet):** "incredibly effective against all
    varieties." Bomblet size barely changes damage; smaller bomblets are slightly easier to get
    hits ("go small or go home"). Poor vs very hard/underground targets and vs hardened bridges.
    Some (INS WCMD) **cannot engage moving targets / cannot be used on ships**.
  - **Unguided rockets:** can kill anything (even tanks) but need huge volume — 690 rockets fired
    and one target still standing.
  - **Guided missiles (Maverick):** pinpoint single-target plinkers — "2 missiles → 2 kills"; bad
    for area damage; require detecting+locking the target first (failed to lock cold ground targets
    lacking thermal signature).
  - **Guns/strafe:** require very low passes; air-to-air airframes strafing ground = mostly misses.
- **Outputs / effects:** "heavier targets require heavier munitions; area kills want conventional/
  cluster, not single PGMs."
- **Source:** Air to Ground Weapon Effectiveness (NsNzObOegPk); Cluster vs Iron Bombs (XZ1EdSDI0mE)
- **Confidence:** High

### Many small missiles vs one large (saturation vs lethality)
- **Behavior / rules:** 20 Hellfires (8 dmg each) into a carrier = total damage **3** (scattered:
  picked off MGs, radars, an elevator); a single Harpoon (166 dmg) ≈ **double** the damage and more
  concentrated. Against an Iowa even 3 Harpoons ≈ 7% (special/medium armor everywhere). Conclusion:
  small missiles **help penetrate defenses** (quantity) but **do not "death-by-a-thousand-cuts"**
  big armored hulls — they strip light topside systems, not HP.
- **Source:** Many missiles vs only one (dIQmufLikyQ)
- **Confidence:** High

---

## Degradation / mission-kill states

### Component/system damage, fire & flooding
- **Models:** a hit applies HP/percent damage **and** can knock out individual subsystems (radars,
  comms/data-link, FCR, engines, guns, sensors, "eyeballs"/crew vision). Ships additionally track
  **fire** and **flooding** as ongoing/spreading states resolved by a damage-control crew.
- **Behavior / rules:** "you're always going to shoot a radar whenever you take damage" — radars/
  radios are the most fragile and degrade first. Engines can be damaged or destroyed; multi-engine
  aircraft survive single-engine loss. Ship outcome can be driven by **fire + flooding** even at low
  HP% ("flooding will get worse → sinks"); flooding can ironically put out a fire. Damage-control
  reduces fire/flood over time if HP isn't fatal.
- **Outputs / effects:** mission-kill (sensors/comms gone but platform alive) vs hard-kill (HP/sink/
  destroyed). Losing all crew "eyeballs" (see laser-dazzle) = loss of control = effective kill.
- **Source:** Many missiles vs only one (dIQmufLikyQ); Cluster vs Iron Bombs (XZ1EdSDI0mE); Flak
  (kFfhkYXDd2o)
- **Confidence:** High

### Flak proximity-fused graded hit (not binary)
- **Models:** recent patch changed flak from "hit = 1 damage" to a **graded near-miss model** with a
  proximity-fuse Pk bonus.
- **Inputs / parameters:** proximity fuse (+Pk by burst-weight band, e.g. "81–150 → probability of
  hit increased by 4"), target altitude, target speed (subsonic = no penalty; Mach 2 reduces Pk by
  the same factor), proficiency, aircraft weight, deflection.
- **Behavior / rules:** each shell that "hits" applies a **fractional** damage scaled by how close
  the burst was (logged values like 0.84, 0.42, 0.1 damage), not a flat 1. Pk vs altitude (KS-19
  field): 500 ft ≈ 12%, 1,000–5,000 ft ≈ 4%, **≥6,000 ft drops to 1%** — so ~6,000 ft is the
  "magical" safe altitude. High speed multiplies Pk down ("Mach 2 → effective flack probability
  reduced by the same factor"). It is the **accumulation** of fractional hits over many shells that
  is lethal; one clean deflection-free ("straight-in") shot is the dangerous one.
- **Outputs / effects:** typically degradation (engine fire, lost radio) rather than instant kill on
  a tough multi-engine airframe; light aircraft can be downed.
- **Source:** Flak Changes and Tactics (kFfhkYXDd2o)
- **Confidence:** High

### Jettison ordnance under attack
- **Models:** doctrine flag (Ctrl-Shift-F9 → "jettison ordnance when under attack") drops stores to
  cut weight → raises agility → lowers incoming missile Pk.
- **Inputs / parameters:** empty-weight fraction (e.g. 0.97 loaded → 0.54 clean), which feeds the
  agility term in the Pk chain.
- **Behavior / rules:** dumping stores changed final incoming Pk only **~3%** (F-15E 10%→7%; B-52
  21%→18%; dumping fuel too gave +4% more). Effect shrinks as enemy weapon quality rises (vs S-300
  the high-deflection/intercept-angle term dominates and jettison "didn't matter," 42% either way).
  The **initial hard turn to create a deflection shot matters more than weight.** Trade-off: dumping
  fails the mission.
- **Source:** Jettison Weapons Effects (CwRX1W5LQEU)
- **Confidence:** High

---

## Point defense & saturation

### Fire-control single-target bottleneck & saturation (C-RAM / PD)
- **Models:** point-defense / C-RAM systems are **partially automated, engage one target at a time**,
  short-ranged; saturation overwhelms the fire-control loop.
- **Inputs / parameters:** number of incoming projectiles, PD range, PD fire-control throughput,
  time-of-flight of the interceptor vs the threat's terminal window.
- **Behavior / rules:** vs a **single** rocket, C-RAM is "very effective"; vs a salvo (90+ rockets)
  it collapses — each launcher must finish targeting one before the next, so multiple PD units
  redundantly chase the same leaker and "panic," letting most through. Some threats are **not valid
  targets** for a given system (TOR/Pantsir could not engage rockets; only flagged CRAM mounts can).
  A ballistic/Scud threat ("fireball" re-entry) gives only a ~2.5 s engagement window — interceptor
  bullets physically can't reach it; PD effectively fails.
- **Outputs / effects:** first leaker that lands tends to wreck nearby soft PD units, cascading the
  failure.
- **Edge cases / quirks:** projectiles are modeled differently by type — **mortar shells are a
  trajectory calculation with no in-game object to shoot at (cannot be intercepted)**, whereas
  **rockets are real in-game objects** that CRAM can target. Salvo size and arrival concurrency are
  the saturation levers.
- **Source:** C-RAM (gDeOE5SJRVQ)
- **Confidence:** High

### Point-defense layer ladder — per-system Pk vs a high-speed anti-ship missile
- **Models:** ship air defense is a **layered ladder of independent systems**, each resolved with
  its own per-engagement Pk and its own concurrency limit; CMO scores every layer separately.
  Demonstrated by stripping a victim ship down to **one** PD system at a time and firing P-15 / KH-22
  anti-ship missiles at it (an E-2D Hawkeye provided early over-horizon spotting).
- **Inputs / parameters:** PD type & its fire-control mode (visual / radar / SARH / active-seeker /
  laser), PD effective range (gun arc + range), rate of fire / rounds per burst, number & speed of
  incoming missiles, fore/aft mount coverage arcs, detection range vs sea-skimmer.
- **Behavior / rules (per layer, verbatim Pk where read aloud):**
  - **Dual-purpose 5"/127 mm guns (40 mm / .50 cal era), variable-fuze, visual- or radar-directed:**
    "embarrassingly bad at reliably hitting a specific target traveling at high speed." Endgame read
    **"overall probability to hit 1% each time"** over three rounds → effectively **last-ditch or
    shore-bombardment only**. Engagement is also **gated by the tiny gun range** — can't fire until
    the missile is inside it, so the slow rate of fire caps how many shots you get.
  - **CIWS gun (AK-630 = 30 mm firing 400 rounds per engagement; Phalanx-class):** thousands of
    bullets expended, endgame **"overall probability of hit ~45%"** — "not bad … good system against
    a leaker," and "dynamite against helicopters." But it is **last-ditch** and **cannot keep up with
    many missiles at a time** (must finish one before the next). "Beaming" the threat lets *both* the
    nose and aft CIWS engage the same inbound.
  - **SARH point-defense missile (Sea Sparrow / RIM-7, even 1970s):** a clear improvement — shot down
    several with little effort and **can re-attack on a miss**, **but can engage only one target at a
    time** because of the semi-active-radar-homing illumination limit.
  - **ESSM (Evolved Sea Sparrow, four per VLS cell, "up to 256 per ship"):** engages a salvo "very
    efficiently" — quad-pack density removes the magazine bottleneck.
  - **Modern active-seeker short-range missile:** **auto-retargets the next missile** the instant the
    previous one misses or kills, "effortlessly cuts through that many missiles" — no single-target
    bottleneck.
  - **Long-range SAM repurposed for PD (SM-2/SM-3):** can begin engaging at **maximum range
    immediately** ("cut those missiles as if they weren't even in the sky"), but a **sea-skimming
    missile isn't noticed until ~20 nm out**, which "reduces the effectiveness of extremely long-range
    SAMs." Note the **cost mismatch** — "$10,000,000 missiles at $100,000 anti-ship missiles" — so a
    balance of layers is needed.
  - **Defensive laser:** "if you can see it you can hit it"; has **~10,000 laser shots**, kills KH-22s
    "without even cracking." **Beaten by clouds/fog/bad weather (laser can't see through fog)** and by
    not being detected at all.
- **Outputs / effects:** each leaker that gets through applies full missile damage; the demo cruiser
  reached **99.1% damaged, on fire and flooding** even while its CIWS kept scoring — i.e. PD attrites
  the salvo but a saturated ladder still takes fatal hits.
- **Edge cases / quirks:** the **best optimization is geometry, not hardware** — "put your systems
  with the best anti-ship/anti-air missile systems in the way of the incoming attack"; oversaturation
  **from multiple directions** is the canonical way to defeat a layered defense.
- **Source:** Point Defense (3E5MA0i5Wzc)
- **Confidence:** High (ladder shape & quoted Pk per illustrative engagement)

### Missile-defense rating (DB readout) & all-aspect coverage
- **Models:** every ship carries a published **"missile defense rating"** on its database page —
  *"how many missiles it will take in order to score a hit with usual probability."* It is a single
  scalar summarizing the whole PD ladder against a reference threat.
- **Inputs / parameters:** ship PD fit; reference threat (Harpoon-class) used for the rating.
- **Behavior / rules:** example — **CG-52 Bunker Hill = "it will take 96 harpoons in order to hit
  this ship"**; in test it shrugged off ~100. The defense is **all-aspect**: "his missile defense
  system faces all directions at all times" — firing from many different angles **makes no
  difference**, so off-axis/multi-bearing attack does **not** by itself degrade a top-tier AAW ship
  (contrast the saturation-from-multiple-directions tactic, which works by overwhelming throughput,
  not by finding a blind arc).
- **Outputs / effects:** lets the operator pre-estimate salvo size needed for a leaker; a salvo below
  the rating is expected to be fully defeated.
- **Edge cases / quirks:** the rating is against a *reference* missile — a faster/higher-diving threat
  (KH-22 at Mach 4.2 / ~75,000 ft, diving) is far harder than the Harpoon baseline implies.
- **Source:** Point Defense (3E5MA0i5Wzc)
- **Confidence:** High

### Detecting & defeating the salvo (launch-detection, jamming the FC director)
- **Models:** an inbound is only engaged once **detected**, and PD can be defeated upstream by
  denying detection or by jamming the **fire-control director / missile-guidance seeker** rather than
  out-shooting it.
- **Inputs / parameters:** missile cruise altitude (sea-skimmer ≈ 800 ft → detected by cruise
  altitude, but lost in **sea clutter**, worse in bad weather), AWACS support, jammer power vs the
  ship's (very powerful) radar, jammer-vs-missile altitude geometry, weather/time-of-day.
- **Behavior / rules:** primary defeats, in order of effectiveness — **(1) don't let the ship detect
  the launch at all** ("make sure it never notices that missiles were launched"); **(2) jam the FC
  directors or the missile's guidance seeker.** Ships have *"very powerful radars that make it very
  difficult to jam them effectively"*; a jammer flying **below** the missiles' altitude failed to
  protect them (the seeker still acquired). Bad weather + night degrade the ship's optical/visual fix
  and the laser, but a dedicated air-search radar (APY-class) or the missile's own active seeker can
  still acquire.
- **Outputs / effects:** successful upstream denial = the PD ladder never fires; otherwise every layer
  runs its own Pk roll as above.
- **Source:** Point Defense (3E5MA0i5Wzc)
- **Confidence:** High

### Set WRA range below max to avoid wasted interceptors (salvo economy)
- **Behavior / rules:** firing defensive missiles (e.g. SM-2/ESSM) at **max range** wastes them —
  they "fire over the heads" of fast maneuvering threats. Reducing WRA engage range improves Pk per
  shot and conserves the magazine vs saturation. (Offensive analog under range/altitude.)
- **Source:** Impact of range on missile weapons (2PzsXm-fhFA)
- **Confidence:** High

---

## Range / altitude effects

### Missile kinematics: altitude bands, lofting, atmospheric energy bleed
- **Models:** missiles are aerodynamic objects with **altitude-banded top speeds**, motor burn then
  coast, optional **loft**; thick low air bleeds energy and kills range.
- **Inputs / parameters:** launch altitude, target altitude, altitude-band max speed (AMRAAM: <12,000
  ft capped ~1,620 kt; ≥36,000 ft nearly double), motor burn time, target maneuver.
- **Behavior / rules:** firing from **low altitude** never lets the motor reach top-band speed → much
  shorter effective range; a lofted missile fired at <½ indicated range can **stall before reaching
  a target only ~12 nm away** if it must climb/descend through thick air. Best long-range geometry
  = shooter high, motor burns in thin air, then dive onto target. A maneuvering target that runs can
  out-bleed a coasting (motor-out) missile. **DLZ/min-range:** even with no NEZ doctrine, you cannot
  fire outside the weapon's dynamic launch zone (must be kinematically able to hit).
- **Outputs / effects:** "in range" on the map ≠ a kill; stalled missiles log as no-joy.
- **Source:** Missile Performance at Altitude (dui_lPsECfE)
- **Confidence:** High

### Range penalty in the Pk chain + half-range rule of thumb
- **Behavior / rules:** at extreme range the endgame adds "percent to hit adjusted for distance"
  (~−10% example), compounding with target-speed/agility to leave ~20% Pk; firing at **~half range**
  removes the distance term entirely (e.g. 25%→ higher) and uses fewer missiles for a kill. For a
  long-range high-energy SAM (S-400/40N6), 75% of max range is fine; for the F-14 Phoenix, max-range
  shots "never hit anything."
- **Source:** Impact of range on missile weapons (2PzsXm-fhFA)
- **Confidence:** High

### NEZ vs 75%-range firing doctrine
- **Behavior / rules:** experiment outcomes —
  - **Long-range high-energy SAM:** 75% range ≈ NEZ (Pk ~59–68% either way); no reason to wait for
    NEZ; don't leave at 100% (wastes missiles).
  - **Air-to-air, high altitude:** a 75%-range shot is largely a "freebie waste" against a target
    with energy/EW to defeat it; **kills mostly happen once both close into the NEZ.**
  - **Low altitude:** the 75% bonus disappears — missiles stall in thick air; **~50% range is safer**.
  EW/spoofing repeatedly decided these engagements more than the range choice.
- **Source:** NEZ vs 75% Max Range (qHuId62Lba8)
- **Confidence:** High

### Bombing altitude vs AAA exposure (and a slant-range quirk)
- **Behavior / rules:** AAA (ZSU-23) max altitude is in straight-line terms — a fast high-passing
  jet's **slant range** can exceed the gun's effective envelope even when nominal altitude ≤ ceiling,
  so it never fires (F-16 at ~5,000 ft over 10,000-ft-ceiling ZSU: no shots). Combine with the
  non-monotonic accuracy curve: ~5,000 ft can be both reasonably accurate and AAA-safe; going to
  ~800–2,000 ft buys accuracy but enters AAA Pk ~75%.
- **Source:** Effect of Altitude on Bombing Accuracy (RDE4S8kzZTQ); Flak (kFfhkYXDd2o)
- **Confidence:** Med

---

## Special weapons (EMP / microwave / nuclear / flak / laser-dazzle)

### EMP weapons
- **Models:** area (omnidirectional) or focused (directional, Pro-edition only) electromagnetic pulse
  that damages **electronics/comms**, not structure; line-of-sight, speed-of-light.
- **Inputs / parameters:** target electronics modernity, **radar/emitter ON vs OFF**, range to burst,
  warhead type (JASSM/JDAM EMP, or nuclear-as-EMP), terrain masking.
- **Behavior / rules:** effect scales with (a) **how modern** the electronics are and (b) **whether
  they're powered on** — a modern S-300 with radar on was destroyed at ½ mi and damaged at 1 mi;
  same system **radar off** only nipped; a legacy SA-2 with radar on took **no** damage in LOS.
  Omnidirectional bursts hit a whole cluster around the impact point but **consistently detonate
  short (~1 nm)** — aim long. ~2 nm = no effect. Knocks out comms (use with comms-disruption option
  to break a formation's links). **Nuclear EMP:** tiny nukes' blast outruns their EMP (just use the
  blast); **large** nukes EMP at very long range (speed-of-light, ahead of the blast). LOS — mask
  behind terrain to avoid.
- **Outputs / effects:** sensor/comms mission-kill; no HP/structure loss by itself.
- **Source:** EMP Weapons (xzP8hBNXiu0)
- **Confidence:** High

### Microwave weapons (HPM)
- **Models:** "miniature EMP at the point you aim" — wide-beam or tight-beam; **anti-drone / anti-air
  only** (valid contacts = unknown / micro-UAV / aircraft; **no surface or ground targets**, no
  incoming-missile intercept in this generation).
- **Behavior / rules:** each pulse damages target electronics/sensors (e.g. FLIR/"eyes"), worsening
  with closer range; with **comms-disruption ON** it can knock a unit fully out of contact (you lose
  control of your own out-of-comms unit). No effect on biological crew. Cannot retask to defend
  against cruise missiles despite their having a damageable seeker.
- **Source:** Microwave Weapons (7UFHmSrJHmM)
- **Confidence:** High

### Laser dazzlers
- **Models:** damages the **crew "Mark-1 eyeball"** (or a UAV's TV/IR cameras), not the platform HP.
- **Inputs / parameters:** range (≤ ~10 nm), aspect/angle (hitting the belly makes hitting the pilot
  harder), **clear LOS** (clouds/weather block it entirely), base Pk + range penalty.
- **Behavior / rules:** dazzling blinds → **"lost control"**; aircraft/helos enter an automatic slow
  death-spiral into the ground. Ships don't crash — they go temporarily blind, then "find new
  eyeballs below deck"; enough sustained dazzling **destroys** all eyeballs = permanent loss of
  control. UAVs: TV cameras have gain/safety protection, so dazzling damages but rarely kills them.
  **Countered by clouds/weather or staying outside ~10 nm / breaking LOS** — cannot dazzle through
  cloud.
- **Source:** Laser Dazzling Weapons (qt-kuIpzVrU)
- **Confidence:** High

### Tactical / strategic nuclear weapons
- **Models:** large-area blast + thermal + radiation + EMP; tactical vs strategic is defined by
  **use, not yield** (200 kt "tactical" exists; 15 kt "strategic" exists).
- **Behavior / rules:** ground targets need an awkwardly large blast to catch dispersed troops (a
  10 kt obliterated a town but a tank ~1.5 mi out survived; a 15 Mt did the same job, "just bigger").
  Designed-best use is **air** (one warhead clears a tight bomber formation — the air-burst Genie /
  BOMARC needed near-contact at long range, very inaccurate) and **underwater** (B-57 nuclear depth
  bomb ≈ 7–8 nm lethal underwater radius, water transmits shock far). SAM radars are **EMP-blinded**
  by nearby nuclear bursts. "Avoid weapon effects" option exists; the shooter can still self-damage.
- **Source:** Tactical Nuclear Weapons (LO2zxtP5yFg)
- **Confidence:** Med

### Weapon records vs mounts (loadout/data-link gating of any fire)
- **Models:** a fired weapon needs a **weapon record + mount** AND the correct **data-link / guidance
  / illuminator** present, or it silently won't launch.
- **Behavior / rules:** SARH weapons need an illuminator (else "cannot fire — illumination issue");
  data-link missiles need the matching command/missile/two-way link; a platform also needs a weapon
  **director** and may impose a ready/engage **delay** (~307 s example) even when armed. Aircraft
  loadouts revert on landing **unless** the mount was added to the unit (not just the loadout). High
  rate-of-fire records (RoF 60) are magazine/loading entries, not employable weapons.
- **Outputs / effects:** explains "why won't my weapon fire" — a precondition gate before any Pk roll.
- **Source:** Weapon Records and Mounts (_4bB81QPcFc)
- **Confidence:** High

---

## Contradictions / tensions flagged
- **Altitude vs accuracy — RESOLVED (primary Bombing tutorial bPVkIPVlNlA):** the apparent conflict
  between RDE4S8kzZTQ's "non-monotonic" curve and NsNzObOegPk's "under 10,000 ft = reliable" rule of
  thumb is settled by the explicit rule *"accuracy is about the same until you get to advanced INS —
  then you can drop from very high altitudes unguided without being nervous."* **Altitude penalty is
  conditioned on bomb-sight tier:** real and roughly monotonic for Basic/Ballistic/Advanced-computing
  sights, effectively gone for Advanced-INS. The RDE4S8kzZTQ survivor curve was a GPS/CCIP aircraft
  (top-ish tier) plus a min-release floor — not a genuine mid-altitude accuracy peak. See *Accuracy vs
  bombing altitude* above.
- **"Lethality" framing:** Cluster bombs are rated near-universally lethal (NsNzObOegPk, XZ1EdSDI0mE)
  yet explicitly poor vs hardened/underground/heavy-armor targets and unusable on moving ships
  (INS variants) — effectiveness is strictly target-class-conditional, not absolute.
- **Hidden parameters:** penetration values are obfuscated (Skejttm4Pv8), so the through-armor
  fraction cannot be reproduced exactly from the operator-visible DB — any RMOOZ port must model an
  internal penetration-vs-armor table.
