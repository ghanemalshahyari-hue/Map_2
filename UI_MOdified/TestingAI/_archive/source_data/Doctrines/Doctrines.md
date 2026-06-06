# Doctrines.md — NATO + US doctrine library for the Gulf of Sidra 2026 wargame

Purpose: a single reference index of every doctrine document that governs this simulation, organized by domain (attack + defense) and by force component. Each entry gives the citation, the **key tenet** (one or two sentences), and **how it applies to this scenario** (which side, which step, what coefficient or rule it justifies in WarGamingClaude3).

Two parent families:
- **JP / FM / ATP** — US Joint Publications, Field Manuals, Army Techniques Publications (Joint Chiefs of Staff and Army Publishing Directorate).
- **AJP / ATP-** — NATO Allied Joint Publications and Allied Tactical Publications.

The two families are interoperable: NATO STANAG ratification incorporates US joint doctrine where US is the lead nation.

---

# A. Capstone doctrine — how the operation hangs together

## JP 3-0 / AJP-3 — Joint Operations
- **Tenet:** Joint operations integrate land, maritime, air, space, cyber, and special-operations capabilities under a single Joint Force Commander to achieve unity of effort.
- **Application:** Red is one Joint Force (Southern Region Command / First Corps); Blue is one Joint Task Force (JTF1). Each step in Claude3 reflects an integrated land+air+sea+SOF action by both sides, not separate domains.

## AJP-01 — Allied Joint Doctrine (NATO capstone)
- **Tenet:** Operations are planned through Operational Design — Center of Gravity, Decisive Points, Lines of Operation, Culmination — across the continuum of competition.
- **Application:** Red CoG = the amphibious force + air superiority; Decisive Points = beach lodgement, mine-clearance corridor, OBJ X. Blue CoG = layered AD + naval mines + intact ground reserves. **Culmination** is computed in the model as the step where Red force ratio crosses below 1.5:1 (ADP 3-0).

## ADP 3-0 — Operations (US Army)
- **Tenet:** Unified land operations achieved through decisive action — offense, defense, stability, and DSCA. The defender's culmination occurs when he can no longer sustain combat; the attacker's, when his combat power falls below what's required to continue.
- **Application:** Force-ratio model uses 3:1 attacker (decisive) and 1.5:1 (contested) thresholds throughout.

## FM 3-0 — Operations (US Army)
- **Tenet:** Large-scale combat operations (LSCO) doctrine — multi-domain, peer-or-near-peer. Specifies tempo, depth, and convergence.
- **Application:** This is an LSCO scenario. Red attempts convergence across air/sea/land/SOF in a 30-second window (Houthi-pattern saturation). Blue defends in depth (FM 3-90 fundamentals).

---

# B. Offensive doctrine for the attacker (Red)

## JP 3-02 — Amphibious Operations (Jan 2019 ed.)
- **Tenet:** Amphibious operations have five types: amphibious assault, amphibious raid, amphibious demonstration, amphibious withdrawal, amphibious support to other operations. Each has phases: planning, embarkation, rehearsal, movement, action.
- **Application:** Red's COA matches "amphibious assault" with 3 phases (Phase 1 lodgement 1-2 km, Phase 2 beachhead 8-10 km then 40-50 km, Phase 3 exploitation to 80-100 km Objective X). Phases map directly to steps 6-16.

## AJP-3.1 — Allied Joint Doctrine for Maritime Operations (Edition B, 2025)
- **Tenet:** Sea control, sea denial, power projection, and maritime support. Maritime force generation and sustainment principles.
- **Application:** Red executes **power projection** (115 landing ships + escort) requiring **sea control** of the approach corridor; Blue executes **sea denial** with 400 mines + 8 corvettes + 9 missile boats + 800-1000 km SSM as anti-ship.

## ATP-3.18 / JP 3-02.1 — Amphibious Embarkation and Debarkation
- **Tenet:** Embarkation/debarkation planning factors: load plan, combat-loading sequence, beach throughput, lighterage, causeway operations.
- **Application:** **Throughput model** in Claude3 (vehicles/hour per BLS, summed cap on Red landing rate). Calibrated to 4 BLS × ~1,200 veh/hr ideal → ~16 brigade-equivalents/day cap.

## AJP-3.3 — Allied Joint Doctrine for Air and Space Operations (Edition B, 2024)
- **Tenet:** Six air-power roles: counter-air, counter-land, counter-sea, strategic attack, ISR, contribution to JIPOE. Air component commander (JFACC).
- **Application:** Red sequences counter-air (D-3 sweep vs Blue 36 fighters) → counter-land (D-2 SEAD vs Blue 9th AD Bde) → counter-sea (D-2/D-1 strikes on Blue naval bases) → strategic attack (Red SSM on Blue ports).

## ATP 3-01.4 — Joint Suppression of Enemy Air Defenses (J-SEAD)
- **Tenet:** Joint multi-service tactics for suppressing enemy SAM and AAA systems. Roles: emitter location, attack (HARM, lethal), and electronic attack (jamming, decoys).
- **Application:** Red runs J-SEAD against Blue 9th AD Bde (3 Hawk + 1 S-300). 25-30% of Red strike sorties allocated. Blue strategic AD attrits 10-15% per wave; Red strikers attrit 5% per sortie. Lasts steps 2-5 in Claude3.

## ATP 3-04 / FM 3-04 — Army Aviation
- **Tenet:** Aviation roles: maneuver, reconnaissance, security, fires, sustainment, C2. Air-assault and air-mobile doctrine.
- **Application:** Red 48 attack helos (3 div sqns + 1 air-base sqn) execute Close Combat Attack and air-mobile assault. Red 24 utility helos move 21st SOF Bde for vertical envelopment behind Blue beach defense.

## ATP 3-90.4 — Combined Arms Mobility (2022)
- **Tenet:** Combined-arms mobility = breaching, gap crossing, route clearance, road/airfield construction, traffic management. Enables maneuver.
- **Application:** Red engineers (403 bn at each div + corps-level) breach Blue mine/obstacle belts at BLS-1..4 in step 6-7. Calibration: ~100 m breach lanes per engineer company per hour under contested fire.

## ATP 3-90.5 — Combined Arms Battalion
- **Tenet:** Combined arms bn (mech + armor + supports) is the lowest level for full combined-arms maneuver. Offensive forms: penetration, envelopment, frontal attack, infiltration, turning movement.
- **Application:** Red 4-MID, 9-MID, 1-AD execute combined-arms maneuver in steps 7-16. Penetration in Phase 2A, envelopment in Phase 2B, exploitation in Phase 3.

## FM 3-90 / ADP 3-90 — Tactics / Offensive and Defensive
- **Tenet:** Offensive principles: surprise, concentration, audacity, tempo. Forms of maneuver. **3:1 attacker against prepared defense** is the planning factor for decisive offensive.
- **Application:** Force-ratio thresholds in the model (3:1 decisive, 1.5:1 contested, <1.5:1 culmination).

## ATP 3-09.42 — Fire Support for the Brigade Combat Team
- **Tenet:** Fire support planning at BCT: priority of fires, target list, observation plan, attack guidance matrix. Synchronization with maneuver.
- **Application:** Red 45-equivalent artillery bdes (one per division, 15 arty bns total = 10 medium 155 mm + 5 heavy 175 mm) execute pre-landing fires and on-call CAS-equivalents.

## ATP 3-91 — Division Operations
- **Tenet:** Division as primary tactical HQ; multi-functional brigades support BCTs with attack/recon aviation, fires, logistics.
- **Application:** Red 4-MID, 9-MID, 1-AD command structure follows this doctrine. 1-AD exploits as the division "of decision" in Phase 3.

## ATP 3-92 — Corps Operations
- **Tenet:** Corps as senior tactical HQ; controls multiple divisions plus enablers. Corps shaping operations precede decisive operations.
- **Application:** Red Southern Region Command / First Corps owns the entire operation. Its shaping = SSM strikes, EW, recon, air superiority preparation.

## AJP-3.9 — Allied Joint Doctrine for Joint Targeting
- **Tenet:** Six steps of joint targeting: end-state and commander's objectives, target development, capabilities analysis, commander's decision, mission planning and execution, assessment.
- **Application:** Blue 9th AD Bde batteries are first-priority targets in Red's J-SEAD; Blue corvettes and missile boats are second-priority for Red ASCM/USV/UAV swarm.

## AJP-3.20 — Allied Joint Doctrine for Cyberspace Operations
- **Tenet:** Cyber operations support, enable, or constitute fires. Defensive, offensive, and ISR cyberspace operations.
- **Application:** Not directly modeled in Claude3, but Red 405 EW Bn includes electronic-attack functions that span EW+cyber-adjacent effects on Blue C2.

## ATP 3-12 / FM 3-12 — Cyberspace and Electronic Warfare Operations
- **Tenet:** EW supports operations through electronic attack, electronic protection, electronic warfare support. Spectrum management.
- **Application:** Red 405 EW Bn (4 cos) jams Blue C2 throughout the operation; Blue 505 EW Bn (3 cos: mobile-tactical + strategic-recon + strategic-jamming) jams Red ASCM seekers and ISR data links. **EW decay model** in Claude3: Red's persistent jamming starts 0.75 strength, decays to 0.15 over 16 steps as Blue adapts.

---

# C. Defensive doctrine for the defender (Blue)

## FM 3-90 / ADP 3-90 — Defensive operations
- **Tenet:** Defense types: area defense, mobile defense, retrograde. Defender intent: shape the battle, allow attacker to culminate, then counterattack. Defender benefits from **prepared positions (~1.5× multiplier)**, knowledge of terrain, interior lines, shorter lines of communication.
- **Application:** Blue is in **area defense** at coast + **mobile defense** in depth with reserves. **Prepared-defense × 1.5** multiplier in the combat model. Culmination of Red triggers committed counterattack.

## ATP 3-90.5 (defender chapters) — Combined Arms Battalion defense
- **Tenet:** Engagement areas, battle positions, obstacle plan tied to fires plan. Use of reverse-slope and reverse-shoreline positions.
- **Application:** Blue 51, 52, 54 brigades (and 71, 72, 73 reserve brigades) are arrayed in engagement areas covering all 4 BLS approaches. Blue artillery (551/552/554 + 555 heavy + 556 MRL) ranges in advance on approach corridors.

## ATP 3-37.5 / MCWP 3-17.5 — Combined Arms Countermobility (2014)
- **Tenet:** Countermobility = terrain reinforcement + obstacle employment to disrupt, fix, turn, or block enemy movement. Obstacles must be **covered by observation and fire** to be effective.
- **Application:** Blue's 400 sea mines (offshore) + assumed beach minefields/obstacle belts (FM 3-90 inference for prepared coastal defense) at BLS-1..4 are the centerpiece of defense. Without overwatch (artillery, ATGM, corvette/coastal radar) the mines would be cleared; with overwatch each mine field is a kill zone.

## ATP 3-37.34 — Survivability Operations
- **Tenet:** Protection through hardening, dispersal, concealment, deception. Fighting positions, vehicle survivability, decoys.
- **Application:** Blue Hawk and S-300 batteries use **hardened/dispersed/dummy positions** → SEAD effectiveness reduced (per Vietnam-era SA-2 hit rates dropping to 1:48 once Wild Weasel matured, Iraq 1991 similar pattern).

## ATP 3-01.8 — Techniques for Combined Arms for Air Defense (Jul 2016, w/ ATP 3-01.81 update Aug 2023)
- **Tenet:** Air defense planning at brigade and below. Active and passive measures. Allocation of dedicated AD (Hawk, Patriot) and combined-arms AD (MANPADS, AAA, organic systems).
- **Application:** Blue 561 medium-range SAM bn (4 batteries) covers maneuver units; 1 MANPADS company (4 platoons) provides organic defense. 9th AD Bde provides strategic AD over air bases. Coverage is layered — high (S-300 250 km), medium (Hawk), MANPADS (close).

## ATP 3-01.81 — Counter-Unmanned Aircraft System (C-UAS) — Aug 2023
- **Tenet:** C-UAS defeats Group 1-5 UAS through detect, identify, decide, defeat (kinetic + EW + cyber + directed-energy).
- **Application:** Blue must defeat Red's 24 explosive UAV waves + 24 USVs simultaneously. Blue counter-UAS = Hawk + MANPADS + naval EW + coastal radar + corvette CRAM. Modeled per Israel-Iran 14 Apr 2024 layered intercept (95-99% intercept if not magazine-depleted).

## ATP 3-01.7 — Air Defense Artillery Brigade Techniques (Mar 2016)
- **Tenet:** ADA brigade organization, employment, and engagement procedures for Patriot/THAAD/Avenger.
- **Application:** Blue 9th AD Bde (3 Hawk bns + 1 S-300 bn + 1 35 mm AAA bn + radars) is the Patriot/THAAD-equivalent. Magazine depth ~150 missiles per Hawk bn (open-source estimate); under saturation pressure, depletion drives Blue intercept rate from 0.85 to 0.40 over multiple waves.

## ATP 3-90.8 (legacy) / ATP 3-37.5 — Obstacle plan integration
- **Tenet:** Obstacle types: existing, reinforcing (mines, wire, antitank ditch). Obstacle effects: disrupt, fix, turn, block. Tied to engagement area.
- **Application:** Blue beach obstacle belts + tank ditches + AT minefields behind beaches reinforce existing terrain (sabkhas, water polygons). Coupled with 502 ATGM bn (36 launchers) and brigade arty.

## NATO ATP-71 — Mine Countermeasures (legacy NATO MCM)
- **Tenet:** Mine-warfare doctrine: mine threat assessment, mine-hunting vs mine-sweeping, route survey, Q-route maintenance.
- **Application:** Blue 3 mine-layers + 2 mine-hunters. Red 2 + 2 = 4 minesweepers. **Clearance rate model** in Claude3: ~50 mines/day per sweeper, minus 30-50% attrition under coastal fire (Wonsan 1950 baseline).

## AJP-3.1 (Annex on harbor and coastal defense) — Coastal defense
- **Tenet:** Coastal defense uses CDCM (coastal-defense cruise missiles), coastal artillery, surveillance, and naval forces in concert.
- **Application:** Blue's 800-1000 km SSM bde could be re-tasked as coastal-defense ASCM. Blue's 4 coastal radar systems + 20 patrol boats + corvettes provide surveillance and engagement.

## ATP 3-91 (defender chapters) — Division defense
- **Tenet:** Defending division shapes the close, deep, support area. Deep operations on attacker's follow-on echelons.
- **Application:** Blue strikes Red's follow-on echelons (9-MID, 1-AD afloat or staging) with 800-1000 km SSM and air-launched standoff weapons. **This is what hits Red sortie generation before Day 1.**

## ATP 3-37.11 — Chemical, Biological, Radiological, and Nuclear (CBRN) operations
- **Tenet:** CBRN passive defense, decontamination, contamination avoidance.
- **Application:** Red 406 chem-def bn and Blue 506 chem-def bn provide CBRN survivability if used. **Source docs do not indicate Red intends NBC use — modeled as support only, per the prompt.**

---

# D. Naval / maritime-specific doctrine

## NWP 3-02 / JP 3-02 (Marine Corps Amphibious)
- **Tenet:** US Navy / Marine Corps amphibious doctrine; landing force operations, ship-to-shore movement, naval gunfire support coordination.
- **Application:** Red has no aircraft carriers but has **3 naval-air support platforms** (likely helicopter carrier / LHD-equivalent) and 26 hovercraft for ship-to-shore. Red 4-MID + 9-MID + 1-AD landing force structure follows this doctrine.

## NWP 3-15 / JP 3-15 — Mine Warfare
- **Tenet:** Mine warfare offensive (laying) and defensive (clearance). Mine threat tiers: drifting, moored contact, magnetic-acoustic-pressure influence.
- **Application:** Blue's 400 pre-laid mines include moored contact + magnetic-influence (per modern OOB). Red MCM force (4 sweepers) must clear by mine-hunting (slow, safe) or mine-sweeping (faster, sweeper-attritional).

## NTRP 3-22 — Naval Surface Warfare
- **Tenet:** Surface combatant tactics for ASW, ASUW (anti-surface warfare), AAW (anti-air warfare). Composite warfare commander structure.
- **Application:** Red 18 destroyers + 19 frigates + 38 missile boats (= 75 surface combatants) vs Blue 8 corvettes + 9 missile boats (= 17 combatants). Red has 4.4:1 surface advantage. Counterbalance: mines, ASCM range from Blue SSM, EW.

## AJP-3.3.3 — Allied Joint Doctrine for Air-Maritime Coordination
- **Tenet:** Air component supports maritime component through anti-submarine, anti-surface, ISR, fleet AD. Coordination measures for joint engagement.
- **Application:** Red Sqn 21 attack helos + Su-24 strikers attack Blue corvettes; Blue Rafale multi-role + 24 naval helos attack Red landing ships and provide ASW against 3 Red subs.

---

# E. SOF and unconventional warfare doctrine

## JP 3-05 / AJP-3.5 — Special Operations
- **Tenet:** SOF core tasks: direct action, special reconnaissance, unconventional warfare, FID, counter-terrorism, hostage rescue, counter-proliferation, MISO/PSYOPS, civil affairs.
- **Application:** Red 21st SOF Bde (4 bns) = direct action + special reconnaissance behind Blue beach defense. Blue 80th SOF Bn (3 cos + 12 air-assault helos) = direct action raids on Red beachhead C2 and lodgement nodes.

## ATP 3-18.4 — Special Forces Direct Action
- **Tenet:** SOF direct action operations: planning, infiltration, target action, exfiltration. Helicopter and HALO/HAHO insertion.
- **Application:** Red 21st SOF Bde air-assault insertion at H-2 to H+0 (Cyprus 1974 model, with airborne attrition coefficient 5-8% if Blue is alerted, 2% if surprise).

---

# F. Sustainment and logistics doctrine

## ATP 4-91 — Division Sustainment Operations (Nov 2022)
- **Tenet:** Division sustainment brigade integrates supply, transport, maintenance, medical, mortuary affairs.
- **Application:** Red 407 supply-and-transport, 408 maintenance, 409 medical (× 3 divisions = 9 sustainment bns) move ashore in waves. **Beach throughput cap** in Claude3 governs sustainment buildup.

## ATP 4-92 — Field Army and Corps Sustainment Operations (Mar 2023)
- **Tenet:** Corps and field army sustainment for LSCO.
- **Application:** Red corps-level sustainment from naval bases A/B → amphibious lift → beach throughput → divisional supply. Blue strikes on Red naval bases (via SSM) cut sustainment at source.

---

# G. Numbered checklist — how each doctrine entry feeds the Claude3 model

| # | Doctrine | Used in step(s) | Effect |
|---|---|---|---|
| 1 | JP 3-02 amphibious phases | 6-16 | Phase boundaries |
| 2 | AJP-3.1 maritime ops | 0-5 | Sea-control vs sea-denial |
| 3 | ATP 3-01.4 J-SEAD | 2-5 | Red 25-30% strike sorties → SEAD |
| 4 | ATP 3-01.8 C-AD | 0-16 | Blue layered AD intercept rate |
| 5 | ATP 3-01.81 C-UAS | 6-9 | Counter-USV/UAV intercept |
| 6 | ATP 3-37.5 countermobility | 0 | Blue 400-mine field + beach obstacles |
| 7 | ATP 3-90.4 mobility | 6-7 | Red engineer breach rates |
| 8 | AJP-3.3 air ops | 2-9 | Red air sortie sequencing |
| 9 | ATP 3-04 aviation | 6-16 | 48 Red attack helos, 12 Blue attack helos |
| 10 | NWP 3-15 mine warfare | 1-5 | Mine clearance attrition |
| 11 | NTRP 3-22 surface warfare | 4-5 | Surface fleet engagement model |
| 12 | FM 3-90 attacker 3:1 | 6-16 | Force ratio thresholds |
| 13 | ADP 3-0 culmination | 11-16 | Red culmination trigger |
| 14 | JP 3-05 SOF | 1, 6, 11 | Red 21st SOF + Blue 80th SOF raids |
| 15 | ATP 3-12 EW | 0-16 | EW decay schedule |
| 16 | ATP 4-91/4-92 sustainment | 6-16 | Beach throughput limit, Red SSM strike on Red ports kills Red sustainment |
| 17 | AJP-3.9 targeting | 1-5 | Target priority: Blue AD > Blue corvettes > Blue C2 > Blue artillery |

---

# H. Notes on doctrine currency

- **Most-recent ed. confirmed via web search:**
  - JP 3-02 Amphibious Operations — Jan 2019
  - AJP-3.1 Maritime — Edition B, 2025
  - AJP-3.2 Land — Edition B
  - AJP-3.3 Air & Space — Edition B, 2024
  - ATP 3-90.4 Mobility — 2022
  - ATP 3-01.81 C-UAS — Aug 2023
  - ATP 4-91 Division Sustainment — Nov 2022
  - ATP 4-92 Field Army/Corps Sustainment — Mar 2023
  - ATP 3-09.42 Fire Support BCT — 2016
  - ATP 3-92 Corps Ops — Apr 2016
  - ATP 3-91 Division Ops — Oct 2014

- **Items where the public Army Pubs catalog page rejected my fetch** (armypubs.army.mil ECONNREFUSED) but standard titles are well established in open literature.

# I. Sources

- [JP 3-02 Amphibious Operations (2019) — Harvard Book Store listing](https://www.harvard.com/book/9781660257423)
- [JP 3-02 Amphibious Operations (2014) — DTIC mirror](https://defenseinnovationmarketplace.dtic.mil/wp-content/uploads/2018/02/JointDoctrineAmphibiousOperations.pdf)
- [AJP-3.1 Maritime Operations (Ed A) — NISP](https://nisp.nw3.dk/standard/nato-ajp-3.1-ed.a-v1.html)
- [AJP-3.2 Land Operations — COEMED/STANAG](https://coemed.org/files/stanags/01_AJP/AJP-3.2_EDA_V1_E_2288.pdf)
- [AJP-3.3 Air & Space Operations Ed B — COEMED](https://www.coemed.org/files/stanags/01_AJP/AJP-3.3_EDB_V1_E_3700.pdf)
- [AJP-3.3.3 Air-Maritime Coordination — GOV.UK archive](https://assets.publishing.service.gov.uk/media/667d6e2897ea0c79abfe4d29/20140101_ARCHIVE-AJP3_3_3A_Mar_Coord.pdf)
- [AJP-3 Conduct of Operations — COEMED](https://www.coemed.org/files/stanags/01_AJP/AJP-3_EDC_V1_E_2490.pdf)
- [ATP 3-90.4 Combined Arms Mobility (2022) — My Army Publications listing](https://myarmypublications.com/product/atp-3-90-4-combined-arms-mobility-2022-big-size/)
- [ATP 3-37.5 Combined Arms Countermobility (2014)](https://www.coursehero.com/file/44798772/atp3-90x8-1pdf/)
- [ATP 3-01.4 J-SEAD — ALSA](https://www.alsa.mil/mttps/jsead/)
- [ATP 3-01.8 Combined Arms for Air Defense (2016) — RDL Army](https://rdl.train.army.mil/catalog-ws/view/100.ATSC/2A925153-3068-4A11-8435-F0B7522EFCD7-1470229928173/atp3_01x8.pdf)
- [ATP 3-01.81 C-UAS (Aug 2023) — FAS](https://irp.fas.org/doddir/army/atp3-01-81.pdf)
- [ATP 3-01.7 ADA Brigade Techniques (2016) — GovInfo](https://www.govinfo.gov/content/pkg/GOVPUB-D101-PURL-gpo83851/pdf/GOVPUB-D101-PURL-gpo83851.pdf)
- [ATP 3-91 Division Operations (2014) — Army Pubs PDF](https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/atp3_91.pdf)
- [ATP 3-92 Corps Operations (2016) — Army Pubs PDF](https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/atp3_92.pdf)
- [ATP 3-09.42 Fire Support for the BCT — GovInfo](https://www.govinfo.gov/content/pkg/GOVPUB-D101-PURL-gpo115479/pdf/GOVPUB-D101-PURL-gpo115479.pdf)
- [ATP 3-09.90 Division Artillery & Fire Support](https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/ARN5999_ATP%203-09x90%20FINAL%20WEB%201.pdf)
- [ATP 4-91 Division Sustainment Operations (Nov 2022)](https://rdl.train.army.mil/catalog-ws/view/100.ATSC/748F9135-2443-4D11-B087-E3D59CA7BDB9-1668430433135/ATP4_91.pdf)
- [ATP 4-92 Field Army and Corps Sustainment (Mar 2023)](https://rdl.train.army.mil/catalog-ws/view/100.ATSC/65408573-698C-4F8D-9E1F-2601F0FC572B-1678885396892/atp4_92.pdf)
- [FM 3-04 Army Aviation — FAS](https://irp.fas.org/doddir/army/fm3_04.pdf)
- [Army Publishing Directorate — ATP product map](https://armypubs.army.mil/ProductMaps/PubForm/ATP.aspx)
- [Suppression of enemy air defenses — Wikipedia (doctrinal background)](https://en.wikipedia.org/wiki/Suppression_of_enemy_air_defenses)
