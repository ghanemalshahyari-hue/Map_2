# CMO Functional Rules — Cluster 2: Doctrine, WRA & Engagement decision-making

**Scope.** Ground-truth, implementable rules for how a CMO unit *decides to fire*: the doctrine
inheritance hierarchy, the WRA (Weapon Release Authorization) state machine, self-defense vs
automatic firing, unit proficiency / OODA reaction timing, targeting priority, salvo sizing, and the
no-escape-zone (NEZ) firing quirks. This is the core decision logic that drives RMOOZ's AI
adjudicator (`server/ai/adjudicator-schema.js`), so the rules below are captured as precisely as the
transcripts allow.

**Videos read (transcripts present in `docs/cmo-captions/`):**
- C: MO — **Doctrine Settings** (`XjfL2uNhGR0`) — *the doctrine reference (primary)*
- C: MO — **WRA** / Weapon Release Authorization (`YepPcVyCtnA`) — *the WRA core (primary)*
- C: MO — **Understanding how WRA and Doctrine interacts** (`H4_mmTVn_Yk`) — *(primary)*
- C: MO — **Unit Proficiency** (`NPvpb7s5SNE`) — *the proficiency reference (primary)*
- C: MO — Understanding the OODA Loop (`s63NJyONLAE`)
- C: MO — No Escape Zone WRA Quirks (`7DIqKLoe3p4`)
- C: MO — Targeting Priority (`v3aWJ3s1zQM`)
- C: MO — Self Defense WRA (`AyjnPvsooWw`)
- C: MO — Self Defense WRA vs Automatic Firing (`fjKeHlO1RsE`)
- C: MO — Estimating and Setting Up Salvo Sizes (`5E-Kl2lq18k`)
- C: MO — Collective Responsibility (`BB6pZ3agGFs`)
- C: MO — Ground Units Automatic Attack (`JqZYvpCP7ik`)
- C: MO — NEZ vs 75% Max Range Missile Fire (`qHuId62Lba8`)
- C: MO — Why won't my weapons fire? (`hCDLw5AZk0E`)
- C: MO — No Escape Zone Launches (`0_DVQq8fIUQ`, partial)

> **AUTO-GENERATED CAVEAT.** All source transcripts are YouTube auto-captions, so spelling and
> exact numbers may be imperfect (e.g. "WRA" often transcribed as "W Ur"/"Wright window", "OODA" as
> "uda"/"oota", "DLZ" as "dlc"). Stated numbers are reproduced verbatim and flagged. Treat any single
> number as illustrative of that specific database unit, not a universal constant.

> **GAP RESOLVED (2026-06-02).** The four top-priority doctrine transcripts — **Doctrine Settings
> (`XjfL2uNhGR0`)**, **WRA (`YepPcVyCtnA`)**, **Understanding how WRA and Doctrine interacts
> (`H4_mmTVn_Yk`)**, and **Unit Proficiency (`NPvpb7s5SNE`)** — are now present in
> `docs/cmo-captions/`. The doctrine inheritance hierarchy, the WRA state machine, self-defense
> behavior, and the proficiency scale below have been **rewritten from those primary sources** and
> upgraded to High confidence. Corrections vs. the earlier secondary-source reconstruction are noted
> inline (look for **CORRECTION** tags).

---

## Doctrine (layers & inheritance)

### Doctrine / ROE scoping levels & inheritance
- **Models:** Rules of engagement are authored at multiple scopes, with narrower (more specific)
  scopes overriding broader ones unless an explicit *force-override* is set at a broader scope.
- **Inputs / parameters:** A doctrine record can be attached at three nested scopes (Doctrine
  Settings video, verbatim): *"this is the entire side's doctrine, it is **a mission**'s doctrine, it
  is an **individual unit**'s doctrine — unless of course you come down here and you tell it to
  automatically **override everybody's doctrine** in the entire … side."* So the authoring scopes are:
  **side (whole side)** → **mission** → **individual unit/group**. WRA and Targeting Priority are
  "just another form of Doctrine and ROE" and scope the same way (Targeting Priority, WRA).
- **Behavior / rules:**
  - **Default resolution = most-specific wins.** A unit uses its own doctrine if set; else its
    mission's; else the side's. A child scope **inherits** its parent unless it defines its own
    override — demonstrated with WRA: a group set to "no automatic fire," a child unit opened and it
    *"should inherit everything — which you can see it did,"* and a sibling unit *"automatically
    take[s] advantage of that particular feature"* (Self Defense WRA).
  - **Force-override flag (CORRECTION — this is a real, distinct control).** The side Doctrine page
    has a toggle that makes the side's settings **override every mission and unit** ("automatically
    override everybody's doctrine in the entire side") — i.e. a top-down force, the inverse of normal
    most-specific-wins. The earlier reconstruction treated global doctrine as merely the broadest
    fallback and missed this explicit override switch.
  - **Missions re-default doctrine (CORRECTION / addition).** Creating a **mission** can override the
    standing doctrine with a mission-type default — e.g. the **Sea Control** default *"automatically
    turn[s] the radar on … automatically ignore[s] plotted course,"* etc. So mission assignment is an
    active doctrine event, not a passive inherit. *"When you're doing missions they can have a
    different doctrine and WRA than your general forces"* — get it right per mission (WRA).
  - **Per-unit vs inherit is an explicit choice.** In the order-of-battle a unit can be set to
    **"inherited from side"** or to **specify** its own value (shown for proficiency; same model for
    doctrine) — Unit Proficiency.
  - **Scenario-designer lock.** *"Scenario designers can allow you or disallow you from being able to
    change a doctrine setting"* via a per-setting checkbox — locked settings can't be edited by the
    player at runtime (Doctrine Settings).
  - Access: `Ctrl+Shift+F9` opens the side-level Doctrine & ROE; per-unit/group/mission via the WRA /
    Doctrine button on that object.
- **Outputs / effects:** The effective doctrine for any unit is the most-specific defined layer —
  unless the side's force-override flag is on, in which case the side layer wins outright.
- **Edge cases / quirks:** A **manual or automatic player-ordered attack overrides the unit's
  standing doctrine/targeting-priority** (see Targeting Priority and Self-defense below). The Doctrine
  page is **blended with eMCON, weapon-release-optimization, and withdraw/redeploy** settings, which
  the same scoping applies to (Doctrine Settings).
- **Source (primary):** Doctrine Settings (`XjfL2uNhGR0`); WRA (`YepPcVyCtnA`); Understanding how WRA
  and Doctrine interacts (`H4_mmTVn_Yk`); Unit Proficiency (`NPvpb7s5SNE`). Corroborated by Targeting
  Priority (`v3aWJ3s1zQM`); Self Defense WRA (`AyjnPvsooWw`).
- **Confidence:** High.

### Target environments doctrine is keyed on (CORRECTION — was missing)
- **Models:** Doctrine/WRA and ROE are not a single global switch — they are resolved **per target
  environment**, and the environment taxonomy is a small fixed set.
- **Inputs / parameters:** ROE/WRA rows are separated into **air targets**, **surface targets**, and
  **sub-surface (submarine) targets**. **Land and surface are treated as the *same* target type**
  (Doctrine Settings, verbatim: *"land surface and land are considered the same type of target"*).
- **Behavior / rules:** A unit can be (e.g.) **Weapons Hold against air** while **Free against
  surface** simultaneously — the weapons-control state is per-environment, not one global value. This
  is why "Why won't my weapons fire?" diagnoses *"holding fire against air targets"* specifically.
- **Outputs / effects:** Drives which control state / WRA row applies once a contact's environment is
  known.
- **Source:** Doctrine Settings (`XjfL2uNhGR0`).
- **Confidence:** High.

### "Engage opportunity targets" doctrine flag (ground units)
- **Models:** Whether a unit will fire on detected enemies it was not specifically tasked against.
- **Inputs / parameters:** Doctrine boolean **"Engage opportunity targets"** (Yes/No). Sits at the
  bottom of the ROE block, after **"ignore plotted course when attacking"** and the **ambiguous
  targets** setting (Doctrine Settings).
- **Behavior / rules:** When set to **No**, ground units (incl. coastal batteries) **never** attack on
  their own, *even when WRA otherwise permits the weapon* — Doctrine Settings demo: a max-proficiency
  HIMARS in range *"did not fire at the enemy targets even though he was perfectly within range,"*
  because its weapons are *"programmed not to use these weapons [except] self defense … they do not
  attack things unless you give them a doctrine that allows them to do opportunities."* Flipping the
  flag on, *"as soon as they did that he started firing."* A ground unit fires only if (a) the flag is
  **Yes**, or (b) it gets a direct/manual attack order, or (c) it is on a mission that orders
  engagement — *"ground units that do not have the set 'engage opportunities' will not engage … unless
  they're attacked first."* WRA permission alone is **insufficient** for ground units.
- **Outputs / effects:** With the flag on (per side / per group), ground units begin engaging
  detected, identified hostiles in range/LOS.
- **Edge cases / quirks:**
  - WRA can say "allowed" while the unit still holds fire because of this flag — a classic trap. Also
    requires **line of sight** (terrain/vegetation can block; "effects of terrain type" governs LOS).
  - **Air units behave the OPPOSITE way (CORRECTION — was unstated).** Aircraft *do* take targets of
    opportunity by default: *"let's say they have cruise missiles and they're … ordered to attack
    [a place], they take off and attack these guys first because they're targets of opportunity."*
    So an air strike can be derailed by opportunistic engagements on the way out — a distinct,
    opposite default from ground units.
- **Source (primary):** Doctrine Settings (`XjfL2uNhGR0`). Corroborated by Ground Units Automatic
  Attack (`JqZYvpCP7ik`).
- **Confidence:** High.

### Collective responsibility (side-wide hostility propagation)
- **Models:** Whether attacking one unit of a side turns the *entire* side hostile.
- **Inputs / parameters:** Per-side boolean **Collective responsibility** (On/Off), set in the
  scenario editor.
- **Behavior / rules:**
  - **On:** the moment you declare/attack **one** unit of that side hostile, the **whole side** becomes
    hostile to you simultaneously.
  - **Off:** hostility is per-unit — you can "ping off one at a time"; other units of the same side stay
    neutral and do not engage.
  - **Critical interaction with identification:** turning the side hostile does **not** make units fire
    until the firing unit has actually **identified the attacker** as a valid target. In the demo, all
    SAM sites went red on the side but none fired at the attacking F-16 until a sensor (a watchtower
    with good LLTV) positively ID'd the aircraft as belonging to the player's side — *then* every site
    engaged.
- **Outputs / effects:** Controls whether a single engagement escalates the whole faction.
- **Edge cases / quirks:** Recommended Off for civilian/neutral-observer sides so an accidental hit
  doesn't make the whole civilian world declare war. Engagement priority after going hostile: defenders
  shoot at **inbound guided weapons first**, then the delivering aircraft.
- **Source:** Collective Responsibility (`BB6pZ3agGFs`).
- **Confidence:** High.

---

## WRA (states & resolution)

### WRA per-weapon firing authorization
- **Models:** For each weapon a unit carries, under what conditions and at what range it may fire,
  and how many rounds it commits.
- **Inputs / parameters (per weapon, per target-category):**
  - **Weapons per salvo** — *"how many weapons we're going to fire per attack"* (a salvo = one
    engagement). **Shooters per salvo** — *"how many people should try to attack the target at a
    time"*; options are **"fire weapons from enough units to fill the salvo requirement"** or a fixed
    **1 / 2 / 4 units**. WRA verbatim: these two columns **feed each other** — if a 4-missile salvo is
    spread one-per-battery across shooters, each shooter fires one. **Trap:** with a "shotgun / one
    engagement" weapon-state, "shooters/weapons per salvo" caps how much you fire in that single
    engagement (fire 1 of 4 R-60s and the other three are wasted on RTB).
  - **Automatic firing range** — *"the 'I'm going to fire at it' range."* Chosen per target category
    from discrete options: **No Escape Zone (NEZ)**, **50% of max**, **75% of max**, **max range**
    (system default — *"takes into account the dynamic launch zone,"* so it won't fire on a target
    flying out of reach), **No automatic fire**, or a **specific distance**. *Lowering* this below the
    weapon's physical max is the standard way to force kills inside a chosen envelope (WRA demo: an
    S-400 cut from ~200 nm to **50 nm**; a Hawk set to **15 nm** to stay under a mountain mask).
  - **Categories observed:** *unspecified / unidentified*, *aircraft (generic)*, plus fine-grained
    classes — **low/medium/high-performance reconnaissance**, **low/medium/high-performance bombers**,
    **fighters**, **AWACS**, **UAV / Class-2 UAV**, **tankers**, **guided weapons**, **ballistic
    weapons**, and (ground) facility/structure rows.
  - **Self-defense** range (separate axis — see Self-defense section): *"ignore all this junk and
    attack at this distance no matter what"* — max range / specific range / do-not-use-in-self-defense.
  - **Missile-defense value (land/surface targets) (CORRECTION — was missing).** Buildings/ships carry
    an inherited **"missile defense value"** = how many rounds of *this weapon* the game expects it to
    take. A WRA row set to "fire to the target's missile-defense value" can massively over-commit
    against an undefended fixed target (WRA demo: Hawk site MDV would launch **11** missiles; a hangar
    MDV **4**) — useful vs. ships/tanks, wasteful vs. fixed targets, so override to the real
    damage-needed count (e.g. *2 bombs to kill a 600-pt hangar*, *3 Kh-58/AS-10 to kill a 300-pt ammo
    revetment*).
  - **Manual attack ignores automatic firing range** — *"if you're doing a manual attack you can
    always attack at max distance, it will ignore this."*
- **Behavior / rules — weapons-control state machine (CORRECTION: exact per-state semantics from the
  primary Doctrine Settings video; the earlier reconstruction had the right *names* but understated
  Hold).** This is **the side ROE setting per target environment** (air / surface / sub-surface), and
  it gates the per-weapon WRA below it:
  - **Weapons Free** — *"we will attack anything that is not friendly."* Fires on neutrals/unknowns
    too; the video's demo shot down civilian aircraft and a friendly F-16 whose radio had been
    knocked off the comms net (it could no longer be IFF'd as friendly). Use only for a side/site
    that historically did so.
  - **Weapons Tight** — *"it will not allow you to attack targets that have a good positive
    identify[ication]; it has hostile unfriendly targets [that] don't get attacked, by the way — they
    do get followed."* I.e. Tight engages **only confirmed-hostile** contacts; positively-identified
    *friendly/neutral* contacts are tracked but not fired on. (The presenter keeps "chaps on Tight"
    as the normal setting.)
  - **Weapons Hold** — *"it won't allow any attacks unless it's in self-defense."* **CORRECTION:**
    Hold is not a blanket no-fire — it still permits **self-defense**. The exact nuance: *"if you
    shoot an anti-ship missile at a target that's set to Hold, he's smart enough to know … to return
    fire at it [the incoming missile], but not to attack the platform that attacked it first."* So a
    Hold unit will engage an **inbound weapon** in self-defense but will **not** counter-attack the
    **shooter**. (Red text "weapons control status is weapons hold" appears in "Why won't my weapons
    fire?")
  - **Manual reclassification override.** The operator can force a contact's identity — *"hitting H/K
    makes it hostile, hitting the F key makes it friendly"* — which changes whether Tight/Free will
    engage it.
  - **No automatic fire** (per weapon, in WRA) — the weapon will never auto-launch; the player must
    manually allocate it. Manual fire is still permitted (with a warning) unless the weapon is also
    barred against that target type.
  - A target's **classification drives which WRA row applies.** If a contact is *unknown*, the
    **unspecified** row is used; once classified (e.g. "bear" bomber, "attack aircraft"), its specific
    row applies. This can flip firing order: in the salvo demo an *unknown* target on the 50% row was
    engaged *before* a closer *identified bomber* on the 75% row, because 75% reaches farther.
  - **ROE is harder than it looks because of the ID lag** (verbatim, Doctrine Settings): *"you'll
    acquire [a] target way sooner than you actually identif[y] the target,"* so Tight may hold fire on
    a contact that is in fact hostile until classification catches up — the structural reason
    aggressive players pre-mark contacts H/K.
- **Diagnosing why a weapon won't fire (ordered checklist from the "Why won't my weapons fire?" video):**
  Use a manual-engage (Shift+F1) to surface the reason. Common blockers, each must clear:
  1. **Weapons control = Hold** for that target environment (e.g. "holding fire against air targets").
  2. **WRA bars the weapon vs this target type** ("do not use weapon against this target type").
  3. **Weapon stowed in magazine** ("cannot fire because the weapons are currently located in our
     magazines") — must be loaded/ready.
  4. **Range gate** — target outside the WRA min/automatic-firing range (e.g. set to 15 nm but target
     at 116 nm; or below a minimum). Green text but still no launch.
  5. **Imprecise target** — sensor track too coarse: "weapon is unable to engage imprecise targets"
     (long-range radar can't point precisely enough). Resolves as track quality improves.
  6. **No illumination / no director** — needs a fire-control/illuminator with LOS
     ("no directors are able to illuminate this target," "insufficient reflection," "no line of sight").
  7. **Weather/LOS for designators** — laser-guided bombs fail when clouds sit between designator and
     target even within the 15 nm / 40,000 ft designator envelope; must descend below the cloud layer
     and **maintain LOS** while guiding.
  8. **Weapon geometry/aspect** — e.g. a Stern-Chase (rear-aspect) IR missile reports "target aspect is
     out of range for this type of weapon" in a head-on pass.
  9. **Reaction (OODA) delay not elapsed** (see Proficiency) — even when acquired, the unit's
     proficiency-scaled per-system reaction countdown must finish before launch.
  Red text = cannot fire; green text = clear. "Shift+F1 and click" is the universal diagnostic.
- **Outputs / effects:** Determines launch / hold and the number of rounds committed.
- **Edge cases / quirks:** Manual allocation can exceed/override automatic limits (e.g. fire up to 30
  at once manually, or force "1 round but 4 shooters"). Ballistic/low-Pk weapons default to 1 per
  salvo because extra rounds are wasted. **Weapon-state RTB rules interact with WRA:** a "one
  engagement / Winchester / fire 25%" doctrine can send a unit home after firing far fewer rounds than
  the WRA salvo would suggest (WRA-vs-Doctrine video: a "fire a quarter" order on a 10-weapon jet =
  3 rounds, then RTB).
- **Source (primary):** WRA (`YepPcVyCtnA`); Doctrine Settings (`XjfL2uNhGR0`); Understanding how WRA
  and Doctrine interacts (`H4_mmTVn_Yk`). Corroborated by Why won't my weapons fire (`hCDLw5AZk0E`);
  Salvo Sizes (`5E-Kl2lq18k`); Self Defense WRA (`AyjnPvsooWw`).
- **Confidence:** High (Free/Tight/Hold names and semantics taken verbatim from the primary
  Doctrine Settings transcript; "weapons hold" red-text corroborated by "Why won't my weapons fire?").

### Salvo sizing vs probability of hit
- **Models:** How many rounds to fire so cumulative Pk is acceptable.
- **Inputs / parameters:** Weapon's single-shot **percent-to-hit** (from DB), **weapons per salvo**,
  number of **fire-control channels** (caps simultaneous rounds), target maneuverability.
- **Behavior / rules:** Cumulative hit chance compounds per added round. Verbatim worked example
  (SA-2 2D, 30% single-shot):
  - 2 missiles → "a half increase, which would give us a 45% chance" (i.e. 0.30 × 1.5).
  - 3 missiles → "52.5%" (0.45 × 1.5 — *note: this is the transcript's stated arithmetic, which is an
    approximation, not 1−(1−p)³ = 65.7%*).
  - SA-2 has **3 missile control channels** → max 3 simultaneous. Default salvo was 2; recommended 3.
  - High-Pk system (Patriot ~95% single-shot) → 1 round vs non-maneuvering, **at least 2** vs a
    maneuvering/beaming target (Pk drops to ~60% when the target knows it's targeted and beams).
- **Outputs / effects:** Sets weapons-per-salvo per target type.
- **Edge cases / quirks:** Guided/ballistic-weapon intercepts default to 1 (low Pk → "waste of time").
  Reported final Pk in-game matched the hand math (~28% for a 3× low-Pk salvo).
  - **Two damage gates, not one (WRA video):** salvo size must satisfy **both** percent-to-hit **and**
    the weapon's *damage points vs. the target's hit points*. Verbatim worked example: an R-60M is
    80% Pk but only **1.2 damage**, while a Backfire-B bomber has **20 damage points** — so a single
    hit won't kill it and the bomber re-attacks while others shoot back. Size the salvo to the
    *durability* of the target, then layer in hit probability.
  - **Proper compounding via a 2-event probability calculator (CORRECTION to the math caveat):** the
    WRA and "WRA↔Doctrine" videos explicitly use a real `P(at least one) = 1−(1−p)^n` calculator, not
    the ×1.5 heuristic — for a **35% Pk** SA-75: **two missiles = 58%**, **three missiles = 72%**.
    Implement this geometric formula; the Salvo-Sizes video's "45% → 52.5%" figures are that tutorial's
    own simplification and are **less accurate** than these numbers.
- **Source (primary):** WRA (`YepPcVyCtnA`); Understanding how WRA and Doctrine interacts
  (`H4_mmTVn_Yk`). Corroborated by Estimating and Setting Up Salvo Sizes (`5E-Kl2lq18k`).
- **Confidence:** High (numbers verbatim; the 52.5% is the Salvo-Sizes tutorial's simplified math,
  superseded by the 58%/72% geometric calc shown in the primary WRA videos).

---

## Self-defense

### Self-defense firing is a separate axis from automatic firing
- **Models:** A unit defending itself when *it* is the target, independent of its general auto-engage
  doctrine.
- **Inputs / parameters:** Per-weapon **Self-defense** range (max range / specific distance /
  do-not-use-in-self-defense), set independently of **Automatic firing range**.
- **Behavior / rules:**
  - **Weapons Hold defines the baseline self-defense behavior (primary source).** Doctrine Settings,
    verbatim: a Hold unit *"won't allow any attacks unless it's in self-defense"* and, when fired upon,
    is *"smart enough to … return fire at it [the incoming missile], but not to attack the platform
    that attacked it first."* So even the side-level Hold state leaves self-defense against the
    **incoming weapon** active while withholding any counter-attack on the **shooter** — the same
    weapon-vs-platform split detailed below.
  - A weapon set to **No automatic fire** but **self-defense allowed** will still not fire at a passing
    threat — because **self-defense only triggers when the unit knows it is the victim** of an attack.
  - **Trigger condition differs by what's incoming:**
    - **Incoming weapon (missile/bomb):** the unit defends only once it recognizes the weapon is
      tracking *it*. In the demo an SA-20 set to "max self-defense" did **not** fire at tactical
      Tomahawks because "it does not know it is the victim" — until they got extremely close, then it
      reacted. Self-defense defends against the **incoming weapon**.
    - **Incoming platform (aircraft) — automatic-fire OFF, self-defense ON:** self-defense defends only
      against the **attacking platform**, and only once attacked. An Arleigh Burke with all weapons on
      self-defense did **not** auto-engage two inbound aircraft; even `auto engage target` was ignored
      ("WRA says only use the weapon for self-defense"). It engaged the *missiles* the attacker fired
      (defending against the inbound weapons), but **never fired back at the attacking aircraft** that
      had released and left.
  - **Fire-control lock as a trigger:** for aircraft, "being attacked" often means being locked by an
    enemy fire-control radar. F-16s with auto-fire OFF / self-defense ON fired AMRAAMs only when an
    enemy aircraft's FCR lit them up or a weapon was launched at them — not at a non-threatening
    contact merely flying by. Detecting an enemy FCR pointed at you = self-defense trigger.
- **Outputs / effects:** Lets a designer make a unit passive offensively yet still able to survive.
- **Edge cases / quirks:** Key distinction the tutorials hammer: **"being attacked by a missile" vs
  "being attacked by a unit"** are *different* triggers. A unit on pure self-defense will not preempt;
  it reacts late, which can be fatal against low-flying sea-skimmers detected only at short slant range.
  Note also the related **"ignore mission/won't-defend-itself"** doctrine toggle (Doctrine Settings):
  if disabled, an attacked unit *won't* auto-activate its jammer/radar/active-sonar, which can
  *preclude* it engaging the incoming weapon at all — self-defense presupposes those sensors come on.
- **Source (primary):** Doctrine Settings (`XjfL2uNhGR0`) — Hold self-defense semantics. Corroborated
  by Self Defense WRA (`AyjnPvsooWw`); Self Defense WRA vs Automatic Firing (`fjKeHlO1RsE`).
- **Confidence:** High.

### Leaker / layered-defense pattern (design consequence)
- **Behavior / rules:** Combine a long-range battery (auto-fire to max) with short-range units set to
  fire only inside a small radius (e.g. SA-20 limited to **10 nm** so inner PD systems handle leakers).
  Automatic-firing range can be cut well below a weapon's physical max (e.g. a 22 nm weapon set to fire
  only inside 15 nm, or a 172 nm SM-6 set to 15 nm) to "dare players" to approach without disabling
  true self-defense. Self-defense still works regardless of the lowered auto range.
- **Source:** Self Defense WRA (`AyjnPvsooWw`); Self Defense WRA vs Automatic Firing (`fjKeHlO1RsE`).
- **Confidence:** High.

---

## Proficiency

### Unit proficiency — named scale & the four things it affects
- **Models:** Crew skill. **CORRECTION (primary source):** proficiency in CMO is a deliberately
  *narrow* modifier — it affects exactly **four** things and explicitly does **NOT** affect sensors or
  weapon accuracy. The earlier reconstruction folded proficiency entirely into OODA timing and was
  unsure of the scale; the Unit Proficiency video resolves both.
- **Inputs / parameters — the named scale (CORRECTION: now confirmed):** an ordered level from
  **Ace → … → Novice** (the video drags the slider *"all the way up to Ace … all the way down to
  Novice,"* with **Regular** as the mid/default and intermediate steps on the slider). Set either at
  the **side** level (Editor → Add/Edit Sides → proficiency) or **per unit** in the order-of-battle as
  **"inherited from side"** *or* a specific level. *"Clicking this switch only affects units set to
  inherit the side's proficiency."*
- **Behavior / rules — proficiency affects these FOUR things, and only these:**
  1. **OODA reaction time (detect-ID → first shot).** Verbatim, for an SA-9/2K11 (Strela-10):
     **Regular = 30 s**, **Ace = 24 s**, **Novice = 60 s (one minute)** from the moment a target is
     *identified hostile and in range* to weapons away. (In-game demo confirmed novice ≈ 1:00, ace
     ≈ 30 s for the same engagement.) Timing is **per system type × proficiency** — modern automated
     systems are inherently faster regardless of crew.
  2. **Missile evasion.** A more proficient crew is better at dodging weapons launched at it
     (*"adjusts his ability to get hit"*). In the strike demo, flipping the defending side from
     regular to novice changed how many friendly aircraft survived inbound SAMs.
  3. **Minimum flight altitude.** Higher proficiency lets aircraft fly lower: an F-4E novice floor
     **150 ft** vs. ace **80 ft**; the gap is far larger for a B-52. (Lower = harder to detect /
     better terrain masking.)
  4. **G-force tolerance.** Higher proficiency sustains tighter turns; a low-proficiency fighter
     (e.g. MiG-15 novice) is forced into a *"wide"* turn and loses the dogfight to an equal aircraft
     with a better crew. *"A good way to simulate lack of g-suits."*
- **Behavior / rules — proficiency does NOT affect (verbatim "things you'd think it would affect but
  don't"):**
  - **Detection / sensors** — *"there's no impact whatsoever on detection."* A novice and an ace
    frigate detected the same air and sub-surface contacts at the **same ~8 nm** range; tiny variances
    were geometry/rounding, not skill.
  - **Weapon accuracy / Pk** — *"weapon attacks are not affected by proficiency … a crew that has a
    very good shot is exactly the same as a crew that has a very bad shot as far as the game is
    concerned."* (Hence losses still occur to incoming guided weapons even at max proficiency — skill
    only helps you *dodge*, not *aim*.)
- **OODA cycle mechanics (carried over, still valid):**
  - **Cycle is consumed per tracked contact and not repeated.** A target that leaves and re-enters
    (e.g. ducks behind a mountain) and is re-identified as the **same contact** can be fired on
    essentially immediately; a target detected early but out of range is engaged the *instant* it
    enters range because its cycle already expired. (OODA Loop video; "Why won't my weapons fire?"
    shows the same delay as a countdown — "36 seconds," up to "282 seconds" for a WWII-vintage CIC.)
  - **Improving proficiency shortens the reaction cycle** (the 30→24 s ace gain above); firing sooner
    also means **re-attacking sooner** and switching targets faster.
- **Outputs / effects:** Drives time-to-first-shot, re-attack cadence, evasion survivability, low-level
  ingress altitude, and dogfight turn performance.
- **Edge cases / quirks:** Even a perfect crew can't beat the database reaction floor for that system.
  Firing the instant a target is acquired but at extreme range still yields poor Pk (a fast shot ≠ a
  good shot — and proficiency won't improve that Pk). Proficiency's turn/altitude effects shrink for
  high-performance airframes (a MiG-29's raw performance swamps the crew gap).
- **Source (primary):** Unit Proficiency (`NPvpb7s5SNE`). Corroborated by Understanding the OODA Loop
  (`s63NJyONLAE`); Why won't my weapons fire (`hCDLw5AZk0E`); proficiency edits in Doctrine Settings
  (`XjfL2uNhGR0`), Self Defense WRA (`AyjnPvsooWw`), and Targeting Priority (`v3aWJ3s1zQM`).
- **Confidence:** High (named scale, the four affected systems, the two non-effects, and the
  30/24/60 s numbers all taken verbatim from the primary Unit Proficiency transcript).

---

## OODA / decision cycle

(Consolidated above under **Proficiency → Unit proficiency**, since CMO models reaction time as the
OODA component of proficiency.) Implementation summary for the adjudicator:

- **Identified-hostile-and-in-range → reaction delay → launch** (then subject to all WRA gates). The
  delay is **a single per-(system × proficiency) figure**, not a universal constant. Verbatim
  anchors from the primary Unit Proficiency video for an SA-9/2K11: **Regular 30 s, Ace 24 s,
  Novice 60 s.** **CORRECTION:** the earlier "≈15 s OODA + separate targeting delay" model came from
  the secondary OODA-Loop walkthrough and **should not** be treated as a fixed universal split — the
  primary source states one combined reaction time that *scales with proficiency*. Other observed
  figures (system-dependent): tens of seconds for classic SAMs, single-digit seconds for modern
  automated systems, up to "282 seconds" for an obsolete WWII-vintage ship CIC.
- Cache the cycle **per (shooter, tracked-contact)** so re-acquisition of the same contact is instant,
  and a target detected-but-out-of-range fires the instant it enters range.
- The reaction delay is a structural "immune window" for the attacker — its length is the shooter's
  per-system reaction time (e.g. ~30 s for the SA-9 example), shortened by higher proficiency.

---

## Targeting priority & salvo sizing

### Targeting Priority lists
- **Models:** Operator-defined ordering of which target types/specific targets a unit prefers when it
  must choose autonomously.
- **Inputs / parameters:** A **Targeting Priority** doctrine record (scopable: global / side / mission
  / group / unit — same scoping as WRA). Each record holds an ordered list of **priority items**; each
  item = a target class (facility/aircraft/structure/etc., down to specific subtypes) + an **engagement
  timing** (default **Immediate**). A per-mission filter restricts choices to target types present in
  the mission.
- **Behavior / rules:**
  - List order matters: **top = first priority, bottom = last.** An explicit **"any/any/any"** entry
    placed in the list means everything else; if put above specific items it makes those specifics
    *lower* priority — order it last.
  - Applies **only when the unit chooses its own target** (autonomous/mission engagement). Example: SAMs
    set to prefer "attack aircraft" engaged the A-6 attacker before the F-4 fighter; carrier strike
    aircraft on a patrol hit their assigned priority structures and avoided duplicating each other on
    the same target.
- **Outputs / effects:** Biases autonomous target selection toward the listed types/order.
- **Edge cases / quirks (emphasized):** **Manual and automatic *player-ordered* attacks ignore the
  targeting priority** — an ordered strike defaults to "attack the thing closest to me that I have a
  weapon for," regardless of the list. Targeting priority is only effective where aircraft/units must
  decide on their own. Pairs naturally with WRA (e.g. SAMs prioritizing a specific aircraft subtype).
- **Source:** Targeting Priority (`v3aWJ3s1zQM`).
- **Confidence:** High.

### No-Escape-Zone (NEZ) firing logic & quirks
- **Models:** Firing only when the target, even turning and running at max speed, cannot escape the
  weapon's reach.
- **Inputs / parameters:** WRA automatic-firing-range option set to **No Escape Zone** (per weapon, per
  target type). NEZ is computed from target **speed, heading, and type** (kinematics) — not a fixed
  range; requires the target to be **classified** to compute its escape kinematics.
- **Behavior / rules:**
  - With NEZ set, the unit **holds fire until the target is inside the no-escape envelope**, then fires.
  - **Classification dependency (the headline quirk):** when the firing unit **knows the target type**,
    NEZ uses that type's true max-escape speed, so e.g. a non-maneuverable Boeing 737 and a fast MiG-31
    flying at the *same observed speed* are engaged at **different** moments — the 737 sooner (smaller
    escape envelope), the MiG-31 only at the last possible second. If the type is unknown, NEZ behaves
    on the generic/observed kinematics.
  - **NEZ vs 75%/max-range tradeoffs** (from the comparison video):
    - Very-long-range high-energy SAMs (e.g. S-400 40N6): **75% of max is fine**; NEZ "waits too long,"
      100%/max "wastes missiles." 75% gave slightly *lower* Pk than NEZ at the closer point in one run
      (≈59–60% at 75% vs ≈68% NEZ for a high-altitude bomber) but far more standoff and earlier kills.
    - **High-altitude air-to-air:** a 75% shot is largely "a freebie / waste of missiles"; real kills
      happen once both close into NEZ — "whoever runs out of missiles first loses."
    - **Low altitude:** the 75% bonus evaporates — missiles fired high then re-entering thick low air
      **stall and are wasted**; **50% (or NEZ) is safer** low. In fog/no warning, a 75% shot can still
      work because the target can't see/dodge the incoming missile.
  - **Self-awareness consequence:** if *you* are identified by the enemy, they're *less* likely to take
    a NEZ shot against you (knowing you're maneuverable), so classification cuts both ways.
- **Outputs / effects:** Trades standoff distance for guaranteed-hit geometry; sets the actual launch
  range dynamically.
- **Edge cases / quirks:** NEZ requires identification to be meaningful — "makes classification more
  important than ever." Forgetting to set NEZ reverts to the target-type's normal range row.
- **Source:** No Escape Zone WRA Quirks (`7DIqKLoe3p4`); NEZ vs 75% Max Range (`qHuId62Lba8`);
  No Escape Zone Launches (`0_DVQq8fIUQ`); range options in Salvo Sizes (`5E-Kl2lq18k`).
- **Confidence:** High.

---

## Cross-video notes & contradictions

- **No hard contradictions found** across the (now complete) primary + secondary transcripts; they
  cross-reference each other (the reaction delay reappears in "Why won't my weapons fire").
- **One reconciliation (not a contradiction):** the secondary OODA-Loop walkthrough described a
  "≈15 s decide + separate targeting cycle (6 s / 36 s)" two-timer model; the **primary** Unit
  Proficiency video states the detect-ID→shot interval as a **single per-(system×proficiency) figure**
  (SA-9: 30 / 24 / 60 s). Model it as one proficiency-scaled reaction time per system; don't hard-code
  a universal 15 s phase.
- **Math caveat (resolved):** the Salvo-Sizes video's "45% → 52.5%" compounding is a ×1.5 heuristic;
  the **primary** WRA / WRA-vs-Doctrine videos use the correct `1−(1−p)^n` calculator (35% → 58% for
  two, 72% for three). **Implement the geometric formula** — it matches the primary sources.
- **Numbers are unit-specific:** the 30/24/60 s reaction times, 6 s vs tens-of-seconds targeting,
  30%/35%/80%/95% Pk, damage-points (R-60M 1.2, Backfire 20, hangar 600), missile-defense values, and
  channel counts (SA-2 = 3) are all per-database-entry illustrations, not constants — pull from the
  unit's record.
- **Biggest implementation traps to encode in the adjudicator:**
  1. WRA permission ≠ will-fire — **ground units** also need **"engage opportunity targets"**, while
     **air units take opportunity targets by default** (opposite defaults).
  2. **Self-defense only triggers when the unit knows it's the victim** (weapon-tracking-me or
     FCR-lock), and defends the *attacker platform* or the *incoming weapon* depending on threat type;
     even **Weapons Hold** retains weapon-vs-incoming self-defense but never counter-attacks the shooter.
  3. **Player-ordered/manual attacks override targeting priority AND ignore the automatic-firing
     range** (fire at max distance, pick nearest valid target).
  4. **Proficiency-scaled reaction delay** gates every auto shot and is cached per tracked contact;
     **proficiency does NOT affect detection or Pk** — only reaction time, evasion, min-altitude, and
     G-tolerance.
  5. **Classification gates NEZ** and decides which WRA row / control-state applies; ROE is keyed per
     **air / surface / sub-surface** environment (land == surface).
  6. **Doctrine resolves most-specific-wins (unit→mission→side)** unless the side's **force-override**
     flag is set; **mission assignment can re-default doctrine** (e.g. Sea Control).
  7. **Salvo size must satisfy both Pk and target damage-points**, and **missile-defense-value** rows
     can wildly over-commit against undefended fixed targets — size to real damage needed.
  8. **Collective responsibility** controls side-wide hostility escalation, but firing still needs the
     attacker to be **identified**.
