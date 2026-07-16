# Batch E — CMO documented-behavior (manual) audit (real installation)

> **Scope note (accuracy):** This is a **documented-behavior / manual audit** — it reviews the
> official CMO game manual shipped with the real installation. It is **not yet a black-box runtime
> audit** (no live interactive observation of the running application). A separate operator-assisted
> live-observation step is required before any manual-derived model is treated as confirmed
> application behavior.

**Purpose.** The earlier Batch E design (E1–E3) was built from RMOOZ's own code and
`docs/cmo-vs-rmooz-gap-report.md` — not from the actual Command: Modern Operations application. This
audit studies the real installed CMO to validate or correct that design *before* E4–E10 resume.
E1–E3 remain intact and unpushed, treated as **provisional** pending this review.

## 1. Installation record

| Field | Value |
|---|---|
| Product | Command: Modern Operations (CMO) |
| Install path | `U:\SteamLibrary\steamapps\common\Command - Modern Operations` |
| Source | Steam (second library on `U:\`) |
| Steam AppID | `1076160` |
| Steam buildid | `22395538` (manifest `appmanifest_1076160.acf`) |
| Manifest last-updated | 2026-06-03 (UTC) |
| Executable | `Command.exe` (~43.8 MB) + `Launcher.exe`; exe file-version metadata is a generic `1.0.0.0` — the meaningful version fingerprint is the Steam buildid plus the DB build (below) |
| Database build | ships DB3K up to `DB3K_515.db3` and CWDB up to `CWDB_514.db3` (community + classic DBs) |
| Manuals present | `Manuals\CMO manual EBOOK.pdf` (11 MB, the full game manual — primary source), `CMO manual TO PRINT.pdf`, `Command Live Issue 1–13.pdf`; top-level `whatsnew.pdf`, `Tiny Release Notes.pdf`, `End Users Agreement.pdf` |

## 2. Methodology & licensing boundary

- **Read-only, documentation-only.** The single source used was the official game manual, extracted
  to plain text with `pdftotext -layout` into the session scratchpad (transient, outside the repo)
  and read by four focused passes. Behavior below is paraphrased **in our own words** with
  section citations; no manual passage is reproduced at length.
- **Not touched:** the `DB\*.db3` unit-value databases, the `Scenarios\` folder, `GIS`, `Resources`,
  `Lua`, assets, or any executable/source. No unit values, RCS numbers, weapon ranges, or scenario
  content were read or copied. No copy protection or licensing was bypassed. The EULA
  (`End Users Agreement.pdf`) governs redistribution of the software; studying documented behavior to
  build an independent, non-copying implementation is outside that scope.
- **Limitation (stated honestly):** this is a *manual* study, not live interactive observation. A
  coding agent cannot reliably drive CMO's GUI and watch internal state transitions; the manual is
  the authoritative documented-behavior source. Where the manual is silent or ambiguous, the table
  says so rather than guessing.

## 3. Evidence table

Columns: **CMO observed** · **How observed** · **RMOOZ current** · **E1–E3 alignment** · **Required
correction** · **Recommended independent implementation**.

### 3.1 Contact detection progression
- **CMO observed:** A *precision/knowledge gradient*, not named discrete stages. Sensor type sets how
  much is learned: ESM → vague emitter bearing → specific emitter match → triangulated fix; radar →
  track, with NCTR able to positively ID; optical/IIR → confirm identity at short range. Knowledge
  scales with range; a contact is "precise" inside a max-classification zoom threshold, else
  "imprecise" carrying an explicit **range-ambiguity band** (e.g. visual ±10%, imaging IR ±20%,
  non-imaging IRST ±50%). Message log reports transitions ("type-classified as: UCAV").
- **How observed:** §9.1.1 Sensors; §6.3.1 Order-of-Battle Contacts tab; changelog IR/visual notes.
- **RMOOZ current:** DET1 emits `confidence: firm|tentative` + `classification: role/domain|'unknown'`;
  E3 added `identification: unknown|detected|classified`.
- **E1–E3 alignment:** PARTIAL. E3's first three states loosely track CMO's precision/class gradient
  — defensible. But E3 models it as a single ordered ladder that *continues* into
  identified→hostile→friendly (see 3.2).
- **Required correction:** Keep the class/precision gradient; sever it from affiliation.
- **Recommended:** Represent detection as (a) **position precision** (imprecise+ambiguity band →
  precise) and (b) **class knowledge** (unknown-type → category → identity) — two axes, both driven
  by sensor quality × range, matching CMO's gradient. Range-ambiguity band is a natural later add.

### 3.2 Classification vs identity vs side vs hostile  ← headline finding
- **CMO observed:** These are **independent axes**, not one ladder. (1) *Detection/position* — a
  contact exists. (2) *Type/class* — "type-classified" as a category ("4th gen fighter"). (3)
  *Identity* — the specific platform ("TAKR Admiral Kuznetsov"). (4) *Side/affiliation* — a **separate
  property**. The **Awareness** setting proves orthogonality: Normal, Auto Side ID ("side identified
  upon detection" but not type), Auto Side+Unit ID, Omniscient, Blind — side can be known while type
  is unknown, or vice-versa. Uninvestigated contacts are "Bogey #n" (air) / "Skunk #n" (surface).
- **How observed:** §3.1 Message Log; §4.5 WRA panel; §6.3.1 OOB; §6.5 Awareness.
- **RMOOZ current:** E3 defines one enum `IDENTIFICATION_STATES = [unknown, detected, classified,
  identified, hostile, friendly]` — affiliation (hostile/friendly) baked into the *end of the
  identification ladder*. Separately, pre-existing `adjudicator-map.js:1543` sets
  `standardIdentity = side==='RED' ? 'Hostile' : 'Friend'` — affiliation derived directly from
  god's-eye side truth.
- **E1–E3 alignment:** **MISALIGNED.** E3 conflates two independent CMO axes (class-knowledge and
  affiliation) into a single enum — exactly the conflation the owner warned against.
- **Required correction:** Split into three axes: **class/identity knowledge**
  `{unknown, detected, classified, identified}`, **affiliation** `{unknown, friendly, neutral,
  unfriendly, hostile}`, and a separate **fire-authority (WCS)** layer (3.4). E3's enum must drop
  hostile/friendly.
- **Recommended:** `identification` axis stays class-knowledge only. Add a distinct `affiliation`
  field defaulted to `unknown`, resolved by posture/manual designation (3.3) — never by god's-eye
  side. Reconcile the pre-existing map coloring to read affiliation, not raw side.

### 3.3 How a contact becomes hostile
- **CMO observed:** Hostility is a **posture between sides** (Neutral / Friendly / Unfriendly /
  Hostile), NOT an automatic result of detecting an enemy unit. A detected contact inherits the
  detecting side's posture toward the contact's side *once that side is known*; contacts can also be
  manually "Marked (to posture)"; **Collective Responsibility** decides whether marking one unit
  re-postures its whole side. Default affiliation is **unknown** (yellow "Bogey"/"Skunk"). Map colors:
  blue friendly, green neutral, orange unfriendly, red hostile, yellow unknown.
- **How observed:** §6.5.2 Postures; §4.5.9 ROE; §6.3.6 Mark-to-posture.
- **RMOOZ current:** Affiliation auto-derived from side truth (map `RED→Hostile / else→Friend`); no
  posture matrix drives *contact* affiliation (postures exist in the authored scenario schema but
  aren't what colors a live contact).
- **E1–E3 alignment:** MISALIGNED (pre-existing; E3 would have formalized it via the hostile/friendly
  enum end).
- **Required correction:** Affiliation of a *contact* = posture(detecting side → contact's side) once
  side is known, else `unknown`; plus manual mark-to-posture. Never auto-hostile from god's-eye truth.
- **Recommended:** Reuse the authored `postures[from][to]` matrix already in the scenario schema as
  the affiliation source; default unknown until side is resolved.

### 3.4 IFF & uncertainty
- **CMO observed:** **No documented standalone IFF mechanic was found in the reviewed CMO manual
  sections.** No interrogate/transponder/squawk model appears in the reviewed text ("IFF"/"friend or
  foe"/"transponder"/"squawk" returned no real hits across the manual). *Absence from the manual is
  enough to remove IFF from our claimed CMO-parity roadmap, but NOT enough to prove IFF cannot exist
  anywhere in the application* — the live-observation step (§7) should confirm. In the reviewed
  material, affiliation instead resolves via **posture** + **manual designation** (changelog: "unknown
  contacts can now be designated friendly with F, neutral with N"); uncertainty is modeled as
  **sensor imprecision** (range-ambiguity bands, "unknown type" labels, ESM "possible matches"), not
  an IFF confidence value. Absence of identification does **not** make a contact hostile — it stays
  unknown, governed by ROE/WCS.
- **How observed:** whole-manual keyword search; §6.5 Awareness; §4.5.9 ROE; changelog.
- **RMOOZ current:** none yet (E4 was *planned* as "IFF gating before engagement eligibility").
- **E1–E3 alignment:** **E4's "IFF gating" premise is not supported by the reviewed manual** — no
  documented IFF mechanic backs it.
- **Required correction:** Drop "IFF gating" from the claimed CMO-parity roadmap; use the model the
  manual DOES document: engagement eligibility gated by **WCS (Free/Tight/Hold)** × **affiliation** ×
  **identification/ambiguity**, not an IFF pass. (Revisit only if live observation reveals an
  undocumented IFF affordance.)
- **Recommended:** Re-scope E4 as "affiliation + Weapons Control Status gate." WCS per target domain:
  **Hold** (self-defense/manual only), **Tight** (confirmed-hostile only), **Free** (anything not
  confirmed friendly). Ambiguity tolerance ("engage ambiguous": ignore/optimistic/pessimistic) is a
  later refinement.

### 3.5 EMCON
- **CMO observed:** **Not a numbered 1–5 level system.** EMCON is **per-emitter-category** — Radar,
  Active Sonar, OECM (offensive jamming) — each independently **Active** or **Passive**, defaulting to
  **Inherited** (cascades Side → Mission → Group → Parent Unit). Separately, a side-wide **Alert Level**
  (five colors — Green/Blue/Orange/Yellow/Red — with *no intrinsic ordering*) each carries its own
  **Intermittent Emissions** config (duration/interval/jitter/"wake on threat"). "Ignore EMCON when
  under attack" auto-activates emitters defensively.
- **How observed:** §3.3.14 EMCON Tab; §6.3.9; §9.1.1; Lua `ScenEdit_SetEMCON`.
- **RMOOZ current:** per-sensor `emcon` string `active|silent|always` (effectively binary); no
  inheritance, no per-category structure, no alert-level/intermittent model.
- **E1–E3 alignment:** N/A yet (E5 not started) — but the **roadmap wording "graduated EMCON levels
  1–5" is not supported by the reviewed manual**, which documents per-category Active/Passive, not
  numbered levels.
- **Required correction:** Re-scope E5 to per-category (radar/sonar/OECM) Active/Passive + `Inherited`
  cascade, NOT invented numeric levels. Preserve the existing `active|silent` scenarios as the radar
  category's two states.
- **Recommended:** Extend `sensors[].emcon` semantics per category + an `Inherited` default resolving
  up the side/mission/group/unit chain; treat old binary values as the radar-category setting.

### 3.6 Unit proficiency
- **CMO observed:** Five levels — **Novice, Cadet, Regular, Veteran, Ace** (default **Regular**).
  Affects aircraft agility (Novice ~30% of nominal, Ace ≥100%), reaction time, damage control,
  g-tolerance, unguided-weapon accuracy, missile evasion. Set per-side or per-unit.
- **How observed:** §5.4.4 Proficiency Settings; changelog.
- **RMOOZ current:** none (only `strength`, a 0–1 combat-power scalar — a different axis).
- **E1–E3 alignment:** N/A yet (E6). Roadmap direction correct.
- **Required correction:** Use CMO's exact 5-name ladder, default Regular — do not invent names.
- **Recommended:** Add a `proficiency` enum field; first consumer is OODA delay (3.7).

### 3.7 OODA / reaction delay
- **CMO observed:** An **OODA clock** must tick to zero before a unit engages, even after detection.
  Set by *mechanical* factors (combat-system generation — WWII CIC → modern automation) **and** *human*
  factors (crew skill via proficiency). Explicit: **higher proficiency = shorter OODA clock**;
  automated point-defense can ignore it. Later builds split OODA-Targeting vs OODA-Evasion. A live
  per-unit countdown is shown ("cannot engage for another N sec"); no fixed second-values published.
- **How observed:** §6.3.4 OODA Cycle; §9.2.8; changelog.
- **RMOOZ current:** none.
- **E1–E3 alignment:** N/A yet (E6). Roadmap direction correct.
- **Required correction:** Model reaction delay as a countdown gate = f(proficiency, automation
  generation); point-defense exempt. Preview-only (no auto-fire).
- **Recommended:** A per-unit OODA-seconds derived from proficiency (+ optional automation tier),
  surfaced as a "why can't engage yet" reason (3.10), never as an autofire trigger.

### 3.8 Doctrine inheritance
- **CMO observed:** Explicitly hierarchical **Side → Mission → Group/Unit**; every setting defaults to
  **inherited**; a more-specific level overrides its parent unless left inherited; a reset restores
  the inherited default. Doctrine window tabs: General, EMCON, WRA, Withdraw/Redeploy. Key General
  toggles: **Weapons Control Status** per domain (Free/Tight/Hold), Use Nuclear Weapons, Ignore
  Plotted Course, **Engage Ambiguous** (ignore/optimistic/pessimistic), Engage Opportunity, Automatic
  Evasion, BVR logic, Maintain Standoff, etc.
- **How observed:** §3.3.12–3.3.13; §6.3.8.
- **RMOOZ current:** `doctrine_rules`/`roe_rules`/`wra_rules` exist (DOC1) but **flat** — no
  inheritance; evaluated only for runtime `weapon_release` effects, never by ENG1.
- **E1–E3 alignment:** N/A yet (E7).
- **Required correction:** Add Side→Mission→Group/Unit inheritance with an `inherited` default; make
  WCS-per-domain the primary fire gate.
- **Recommended:** Resolve effective doctrine by walking the hierarchy; ENG1 reads the *resolved* WCS.

### 3.9 WRA / DLZ / NEZ / salvo / self-defense
- **CMO observed:** **WRA** = weapon × target-type rows keyed on the target's "Missile Defense Value"
  class; each row sets **quantity per engagement** and **max firing range** (may be < on-paper max);
  unidentified targets use an "Unknown/unspecified" type; MDV "only applies to positively identified
  targets." **DLZ** (Dynamic Launch Zone) = "launch now, target keeps moving as-is" using
  heading/speed/alt + weapon kinematics; **NEZ** (No-Escape Zone) assumes the target runs at current
  (unknown) or **max** (known) speed; the WRA "no-escape-zone launch" toggle waits for the NEZ.
  "Target out of DLZ" is a documented no-fire reason. **Salvo size** is the WRA quantity; "Assign
  Salvo" auto-builds fire missions from it. **Self-defense**: Weapons **Hold** = "fire only in
  immediate self-defense" — a held unit may still fire defensively.
- **How observed:** §3.3.15 WRA; §9.2.9 DLZ; §3.3.1; §3.3.13; v1.07 notes.
- **RMOOZ current:** `wra_rules` author `target_class`/`max_range_nm`/`salvo_limit` but ENG1 **never
  reads them**; ENG1 has its own per-weapon `RANGE_MODE_FACTOR {max, 75pct, nez}`; no DLZ-by-max-speed,
  no self-defense axis.
- **E1–E3 alignment:** N/A yet (E7).
- **Required correction:** Wire ENG1 to the resolved WRA rows; implement DLZ/NEZ per CMO (NEZ uses max
  speed for known types); add a self-defense-under-Hold path — all preview-only.
- **Recommended:** ENG1 consults resolved doctrine/WRA; NEZ/DLZ gate *eligibility*, never autofire.

### 3.10 Targeting priority
- **CMO observed:** Units submit per-target **"firing proposals"**; the side "groups firing proposals
  per-target and selects the **most promising**," by criteria depending on target nature (e.g.
  time-to-impact for aerospace); weapons ordered longest→shortest range. **Manual override** via the
  Weapons Allocation ("Attack Target") dialog. "Mission priority does NOT designate target importance."
- **How observed:** §3.3.1–3.3.2; §7.
- **RMOOZ current:** ENG1 picks nearest detected target; no structured priority; no manual override.
- **E1–E3 alignment:** N/A yet (E8).
- **Required correction:** Proposal/"most-promising" selection with an explicit operator override;
  keep it approval-gated.
- **Recommended:** Compute per-target eligibility proposals; expose an operator override list.

### 3.11 "Why won't it fire?" checklist
- **CMO observed:** §9.2.8 runs an "exhaustive checklist" — ~32 distinct no-fire reasons: mount
  down; nuke authority; target speed/altitude ceiling/floor; BOL-capability; needs precise location;
  not loaded; wrong target type; launch-envelope alt/aspect; **OODA countdown**; ASW drop distance;
  range max/min; boresight/mount arc (arc ignored beyond 5nm); ice constraints; illumination/director/
  datalink channel availability; **DLZ**; downrange/cross-range ambiguity vs the "engage ambiguous"
  doctrine.
- **How observed:** §9.2.8 "My … weapon won't fire!!!".
- **RMOOZ current:** ENG1 returns 4 reasons (`weapons_hold`, `out_of_range`, `winchester`,
  `no_fire_control_channel`); `why-not-panel.js` UI idiom exists.
- **E1–E3 alignment:** N/A yet (E9).
- **Required correction:** Expand ENG1 reason codes toward the in-scope subset of CMO's checklist
  (range max/min, WCS/hold, magazine, target-type suitability, DLZ, OODA, affiliation/ambiguity);
  surface via the existing `why-not-panel.js`.
- **Recommended:** Grow the reason enum; the panel already renders `{code, explanation, source}`.

### 3.12 Terrain masking / LOS
- **CMO observed:** Terrain physically blocks sensor LOS on a life-sized globe; exposed via the **LOS
  Tool**. Two horizon modes — **Radar/ESM electronic horizon** (longer; radar bends "over" the horizon
  a bit) and the shorter **Visual/EO/Laser horizon** — so effective range is horizon- and
  **sensor-type-dependent**. Ground clutter limits look-down; targets diving below the horizon break
  direct-LOS missile lock. Manual states the mechanism, not a numeric horizon formula (the geometric
  `1.23(√h₁+√h₂)` is public physics, not printed there).
- **How observed:** §6 LOS Tool; §9.1.1.
- **RMOOZ current (E2):** `terrain-los.js` sight-line-vs-DEM-profile; server-side via
  `terrain-api.js::profileFor`; single horizon; no sensor-type distinction; no ground clutter.
- **E1–E3 alignment:** DIRECTIONALLY CORRECT but simplified — E2 does not distinguish radar/ESM vs
  visual/EO horizon, and has engineering gaps (see §4).
- **Required correction:** Add sensor-type-specific horizon (radar/ESM longer than visual/EO); fix E2
  engineering gaps.
- **Recommended:** Keep the DEM sight-line check; parameterize the horizon/clutter by sensor type.

## 4. E2 re-audit (five owner criteria)

| Criterion | Verdict | Detail |
|---|---|---|
| No async/network lookup inside `computeContacts` | **PASS** | `terrainApi.profileFor` is synchronous/in-process; `losBlocked` and DET1's loop stay synchronous. No fetch/await. |
| DEM profiles precomputed & cached | **FAIL** | `losBlocked` calls `profileFor` fresh on every `(obs,tgt)` pair — O(N²) per `computeContacts`, recomputed every derivation. No memo/precompute. Worse, it's invoked at `detection.js:143` **before** the range check at `:145`, so it profiles pairs thousands of nm apart that no sensor could reach. |
| Cache invalidates on unit move / revision change | **FAIL** | No cache exists. |
| Missing DEM → explicit, visible fallback | **FAIL** | `available===false` silently returns "clear"; nothing surfaces to operator/journal that terrain masking is inactive. |
| LOS failure can't silently fabricate or suppress contacts | **PARTIAL** | Direction is safe (LOS only *removes* a pair; on error/missing data it fails **open** → never suppresses a real contact, never fabricates one). BUT `catch(_){return false}` swallows failures with zero visibility, so masking can silently become inactive. Needs a non-silent signal. |

**E2 corrections required before it's non-provisional:** (a) memoize terrain profiles within a
`computeContacts` pass keyed by rounded positions (movement/next tick naturally invalidates); (b) only
evaluate LOS for pairs already within sensor range (move the check after the range gate, or gate it);
(c) surface an explicit `los_source: 'dem' | 'unavailable' | 'error'` on the derived output so the
fallback is visible, not silent; (d) keep fail-open but make it observable.

## 5. E3 separation check (owner's specific constraint)

Constraint: "do not let side, posture, or IFF automatically jump a contact to hostile/friendly without
evidence; identification, affiliation, and hostility must remain separate."

- **E3 code as written is technically compliant on the no-auto-jump point:** `identificationFor(method,
  confidence)` only ever returns `unknown | detected | classified` — it never returns hostile/friendly
  and never reads `side`. So E3 itself does not auto-jump a contact to hostile/friendly.
- **But E3's DATA MODEL conflates the axes:** `IDENTIFICATION_STATES = [unknown, detected, classified,
  identified, hostile, friendly]` bakes affiliation into the identification ladder, and E4 was going
  to populate the hostile/friendly end via IFF. CMO (§3.2/3.3/3.4) proves these are independent axes.
- **Verdict:** E3 must be corrected — the enum splits into a class/identity-knowledge axis and a
  separate affiliation axis; hostile/friendly leave the identification ladder entirely. The
  pre-existing `adjudicator-map.js:1543` side→affiliation coloring is a separate, older conflation to
  reconcile at the same time.

## 6. Net effect on the E4–E10 roadmap (proposed, pending review)

- **E3** — correct the identification enum to a class-knowledge axis; add a separate affiliation axis.
- **E4** — **re-scope**: "IFF gating" → "affiliation + Weapons Control Status (Free/Tight/Hold) gate."
  No IFF mechanic is documented in the reviewed manual.
- **E5** — **re-scope**: "graduated EMCON levels 1–5" → per-category (radar/sonar/OECM) Active/Passive
  + `Inherited` cascade (+ optional alert-level/intermittent emissions later).
- **E6** — proficiency ladder = Novice/Cadet/Regular/Veteran/Ace (default Regular); OODA delay =
  f(proficiency, automation), point-defense exempt. (Direction already correct.)
- **E7** — doctrine inheritance (Side→Mission→Group/Unit, `inherited` default); wire ENG1 to resolved
  WRA rows; DLZ/NEZ (NEZ uses max speed for known types); self-defense under Hold.
- **E8** — firing-proposal / "most-promising" target selection + operator override.
- **E9** — expand ENG1 reason codes toward CMO's §9.2.8 checklist subset; reuse `why-not-panel.js`.
- **E10** — deep E2E unchanged in spirit; assertions updated to the corrected axes.

Safety throughout: detection/engagement stay **preview/eligibility only**; `runtime-events.js`'s
dangerous-effect block-list stays untouched; `weapon_release` stays inert.

## 7. Required live CMO observation (operator-assisted) before E4 resumes

This manual audit is documentation, not runtime evidence. Before E4 is implemented, a small
operator-assisted live-observation pass must validate the manual-based model. The coding agent does
NOT drive CMO; the operator opens CMO manually and captures screenshots / a short recording of:

1. A contact report at different knowledge levels (bogey/skunk → type-classified → identified).
2. The side Awareness settings dialog.
3. Manual contact-posture marking (mark-to-posture).
4. The doctrine inheritance display (an "inherited" setting vs an overridden one).
5. WCS Free / Tight / Hold selection.
6. EMCON Radar / Active-Sonar / OECM toggles and the "Inherited" state.
7. WRA target-type / range / salvo settings.
8. A real "weapon will not fire" message / checklist entry.

Capture **behavior and UI structure only** — no database values, unit stats, or scenario content.
Once these confirm (or correct) the manual-derived model, E4 resumes on the validated basis.
