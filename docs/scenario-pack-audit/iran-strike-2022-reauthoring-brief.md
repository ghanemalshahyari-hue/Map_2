# Iran Strike 2022 — RMOOZ Reauthoring Brief

**Phase 3A Status:** ✅ Scenario design brief extracted from HTML briefings  
**Source scenarios:** Iran Strike (2022) CMO Community Scenario Pack 51  
**Target:** RMOOZ-native JSON scenario draft

---

## 1. Scenario Identity

| Field | Value | Source |
|-------|-------|--------|
| **Scenario ID** | `iran-strike-2022` | Original filename |
| **Title** | Iran Strike 2022 | CMO catalog + briefing |
| **Year/Date** | May 2022 | Description briefing |
| **Designer** | KushanGaming (CSP 51) | Pack metadata |
| **Type** | Limited strike / air operation | Briefing classification |
| **CMO Classification** | Sandbox scenario (player-directed) | Designer notes |

---

## 2. Theater & Geography

### Regional Context
- **Theater:** Persian Gulf / Middle East region
- **Scope:** Limited nuclear strike operation (NOT full air campaign)
- **Playable area:** Iran + Adjacent waters + Staging areas (UAE, Saudi Arabia, Diego Garcia, Qatar option)
- **Bounding box estimate:**
  - Northern boundary: Tehran area (36°N approx)
  - Southern boundary: Strait of Hormuz / Arabian Sea (26°N approx)
  - Western boundary: Iraq border (44°E approx)
  - Eastern boundary: Arabian Sea (60°E approx)
  - Vertical extent: 25,000+ feet (fighter/bomber altitude ceiling)

### Key Geographic Features
**Nuclear facilities (PRIMARY OBJECTIVES):**
1. **Arak Heavy Water Plant** — Nuclear facility
2. **Esfahan Uranium Conversion Facility** — Nuclear facility
3. **Fordow Fuel Enrichment Plant** — Underground nuclear facility
4. **Natanz Fuel Enrichment Plant** — Nuclear facility

**Iranian Air Bases (ENEMY FORCES):**
- Bandar Abbas (southern coast) — F-4E
- Bushehr (southern coast) — F-4D
- Chabahar (southeastern coast) — F-4D
- Dezful (inland, central) — F-5E/F
- Esfahan (inland, central) — F-14A [Most dangerous]
- Hamadan (inland, north-central) — F-4E
- Mashhad (inland, northeast) — F-5E
- Omidiyeh (inland, southwest) — F-7N
- Tabriz (inland, northwest) — MiG-29
- Tehran (capital, north-central) — MiG-29

**Friendly Staging Areas:**
- Al Dhafra Air Base (UAE) — Up to 8 fighter squadrons
- Prince Sultan Air Base (Saudi Arabia) — Up to 8 fighter squadrons
- Diego Garcia — Up to 4 bomb squadrons + tankers
- Al Udeid Air Base (Qatar) — Conditional (1 bomb + 2 fighter squadrons if approved)
- Northern Arabian Sea — Harry S. Truman Carrier Strike Group (fixed patrol area)

---

## 3. Political & Military Situation

### Political Background
- **May 2022 Iranian announcement:** Iran rejects international nuclear agreements, will develop nuclear weapons
- **Regional response:** Contingency plans activated across Middle East
- **Allied posture:** US + Israel negotiate joint response
- **Iranian alert status:** RAISED (mobilization detected by intelligence/media)

### Military Posture
- **Attacker side (US/Israel):** Preparing limited, focused strike
- **Defender side (Iran):** Alert status raised; likely defensive preparations underway
- **Coalition status:** US-Israel coordination (separate campaigns or combined)
- **Strategic constraint:** "DO NOT damage nuclear reactors at Arak and Esfahan" (collateral damage prevention)

### Operational Context
- **Scope:** LIMITED strike (not full air campaign like Operation Rising Lion / Desert Storm)
- **Rationale:** Keep computer load reasonable, focus on most critical (hardest-to-neutralize) facilities
- **Primary targets:** 4 nuclear enrichment/conversion facilities
- **Secondary targets:** Iranian air defenses (SAM sites, radars, AAA)
- **Tertiary targets:** Iranian fighter aircraft (defensive intercept)

---

## 4. Sides & Factions

### Side 1: United States (Attacker)

**Political leadership:** US command (Ninth Air Force)  
**Military command:** Deployed expeditionary air forces  
**Available forces:**
- Up to 8 expeditionary fighter squadrons (deployable to UAE/Saudi)
- Up to 4 expeditionary bomb squadrons (Diego Garcia)
- Harry S. Truman Carrier Strike Group (CVN-75)
  - Carrier Air Wing 1
  - Destroyer Squadron 28
  - Constraint: Cannot leave northern Arabian Sea patrol area
- Support aircraft (tankers, AWACS, EW, transport)
- KC-46A Pegasus tankers (Diego Garcia)
- Optional: Tomahawk cruise missile strikes (if approved via political actions)

**Doctrine/strategy:** Long-range precision strike; carrier-based air support  
**Representative units:** F-15E, F-16C, B-2 bomber, EA-18G, E-2D, KC-10, KC-135  
**Weaponry:** Air-to-air missiles (AIM-120, AIM-9), standoff air-to-ground (AGM-65, JDAM, GBU-28 penetrator), cruise missiles  
**Constraints:**
- Player-selected aircraft loadouts (flexibility in mission planning)
- Deployment menu (player determines force composition)
- Fuel management (tanker support required unless "unlimited fuel" mode)
- Strategic aircraft loss penalty (tankers, AWACS count more than fighters)

### Side 2: Israel (Attacker, Optional)

**Political leadership:** Israeli government  
**Military command:** Israeli Air Force (IAF)  
**Available forces:**
- Entire IAF front-line fighter inventory
- F-15I, F-16I, F-35I (most advanced)
- Special ordnance: GBU-28C/B Deep Throat penetrator bomb (4,700 lb laser-guided)
- Special capability: Jericho III IRBM wing (conventional warheads)
- Support aircraft (tankers, early warning, CSAR)
- Optional: Request overflight rights, US support, early KC-46 delivery via political actions

**Doctrine/strategy:** Precision penetration strike; standoff cruise missile support  
**Weaponry:** Air-to-air missiles (Python-5, Derby, Shafrir), air-to-ground ordnance  
**Constraints:**
- Mobilization already detected (Iran alert status raised)
- Limited number of deepstrike aircraft
- GBU-28 effectiveness against hardened/underground targets

### Side 3: Iran (Defender)

**Political leadership:** Iranian government  
**Military command:** Iranian Air Force + Air Defense Command  
**Available forces (quantified):**

**Fighter aircraft:**
- Bandar Abbas: 1 squadron F-4E Phantom II
- Bushehr: 1 squadron F-4D Phantom II
- Chabahar: 1 squadron F-4D Phantom II
- Dezful: F-5E/F Tiger II
- Esfahan: F-14A Tomcat [MOST DANGEROUS — Phoenix missiles, 81 nm range]
- Hamadan: F-4E Phantom II
- Mashhad: F-5E Tiger II
- Omidiyeh: F-7N Fishcan (MiG-21 copy)
- Tabriz: 1 squadron MiG-29 Fulcrum A
- Tehran: 1 squadron MiG-29 Fulcrum A

**Air defense systems:**
- **Most advanced:** SA-20 (S-300OPMU-2) — likely near Bandar Abbas, Esfahan, Tehran
- **Secondary advanced:** Bavar-373 (domestic Iranian system)
- **Soviet-era:** Various SAM systems, Chinese copies
- **Legacy American:** I-HAWK SAM systems (1960s-era)
- **Fixed facility defenses:** AAA + SAM sites around nuclear facilities

**Fixed facility defenses (quantified):**
| Facility | AAA | SAM |
|----------|-----|-----|
| Arak Heavy Water | 64 | 6 |
| Esfahan Uranium Conversion | 60 | 0 |
| Fordow Fuel Enrichment | 22 | 7 |
| Natanz Fuel Enrichment | 172 | 11 |

**Doctrine/strategy:** Defensive intercept (fighter CAP); static defense (SAM/AAA sites)  
**Constraint:** Aware of incoming strike (via intelligence/media); alert status raised

---

## 5. Mission Objectives (From Briefings)

### Primary Objectives (ALL SIDES)
1. **Damage/destroy Arak Heavy Water Plant**
   - Constraint: DO NOT damage nuclear reactor
   - Defense: 64 AAA + 6 SAM sites
2. **Damage/destroy Esfahan Uranium Conversion Facility**
   - Constraint: DO NOT damage nuclear reactor
   - Defense: 60 AAA + 0 SAM sites
3. **Damage/destroy Fordow Fuel Enrichment Plant**
   - Defense: 22 AAA + 7 SAM sites
   - Recommended attacker: B-2 bomber (penetrating strike)
4. **Damage/destroy Natanz Fuel Enrichment Plant**
   - Defense: 172 AAA + 11 SAM sites (MOST heavily defended)
   - Recommended attacker: F-15E/I with GBU-28 penetrator

### Scoring/Victory (Derived from Gameplay Notes)
- **Attacker wins on:** Successful damage to nuclear facilities (>75% damage = points awarded)
- **Attacker penalties:** Aircraft losses (after 5+ aircraft lost); strategic losses (tankers, AWACS) penalized immediately
- **Secondary objectives:** Downed aircrew recovery (CSAR), if enabled

### Strategic Constraint
- **"With available resources, you should be able to strike all four facilities"** — Suggests 1–2 waves of aircraft, not 4 separate multi-aircraft campaigns

---

## 6. Units & Force Composition

### Attacker Units (USA)

**Required assumptions for RMOOZ representation:**
- Player selects aircraft types, loadouts, and deployment bases during setup
- Scenario does NOT pre-place all aircraft; uses deployment menu
- Tanker support required (unless "unlimited fuel" mode)
- Carrier strike group fixed in patrol area (limited mobility)

**Representative unit types to include:**
- Fighter-bomber: F-15E Strike Eagle
- Air superiority: F-15C Eagle, F-16C Viper
- Stealth striker: B-2 Spirit
- Penetrating strike: B-1B Lancer
- Electronic warfare: EA-18G Growler
- Early warning: E-2D Hawkeye
- Tanker: KC-135 Stratotanker, KC-10 Extender
- Transport: C-130J, MC-130J (CSAR cargo)
- CSAR: HH-60G, HH-60W, MH-60S, MH-60R
- Carrier air wing: Mixed fighters + attack + support

### Attacker Units (Israel, Optional)

**Representative unit types:**
- Air superiority: F-15I Ra'am
- Multirole: F-16I Sufa
- Stealth multirole: F-35I Adir
- Strategic strike: Jericho III IRBM
- Tanker support: Boeing 707 (Israeli variant)
- CSAR: CH-53C Sea Stallion, C-130J (Israeli variant)

### Defender Units (Iran)

**Fighter units (by base):**
- F-4E/D Phantom II (vintage 1960s-70s American)
- F-14A Tomcat (1970s American, most dangerous)
- F-5E/F Tiger II (1960s-70s American)
- F-7N Fishcan (MiG-21 copy, Chinese)
- MiG-29 Fulcrum A (modern Russian)

**Estimated squadron sizes:** 12–18 aircraft per base (typical Cold War squadron)

**Air defense units (static/mobile):**
- SA-20 (S-300OPMU-2) battalion(s) — mobile SAM system
- Bavar-373 battalion(s) — Iranian domestic SAM
- I-HAWK batteries — legacy AAA-integrated SAM
- Fixed AAA sites (around nuclear facilities) — 172–318 total guns
- Early warning radars — distributed across region

---

## 7. Time Period & Timeline

### Calendar
- **Scenario start:** May 2022 (unspecified exact date)
- **Season:** Late spring, Persian Gulf
- **Campaign duration:** Not specified (multi-day expected based on "five minutes of game time" trigger and cyber/recovery mechanics)
- **Temporal mechanics:**
  - First 5 minutes (setup phase): Deployment menu, loadout selection, "Ready All Aircraft"
  - After 5 minutes: Strategic actions disabled, tactical cyber options enabled
  - Weather changes hourly (realistic for region)
  - Recovery timers on cyber-attack effects (several hours in-game)

### Operating Tempo
- **Speed of operations:** Player-paced (sandbox scenario)
- **Expected mission duration:** Multi-wave strike (not single-day engagement)
- **Environmental:** Daylight/night cycles, weather effects on aircraft operations

---

## 8. Victory Conditions & Success Criteria

### Explicit (From Briefings)
- **USA briefing:** "With available resources, you should be able to strike all four facilities"
- **Israel briefing:** "It is recommended that you attack the Natanz, Arak, and/or Esfahan facilities"
- **Combined briefing:** "With available resources, you should be able to strike all four facilities"

### Implicit (From Scoring)
- **Success = Damage threshold met:** Facilities damaged to 75%+ count as "mission accomplished"
- **High score = All 4 facilities neutralized + minimal aircraft losses**
- **Failure modes:** Excessive aircraft losses, reactor damage at Arak/Esfahan

### Measurable Objectives (Proposed for RMOOZ)
1. **Primary:** Strike all 4 nuclear facilities (or player chooses subset)
2. **Secondary:** Minimize friendly aircraft losses
3. **Tertiary:** Recover downed aircrew (CSAR, if enabled)
4. **Constraint:** Avoid reactor damage at Arak/Esfahan

---

## 9. Known Units & Platforms (Extracted from Briefings)

### Attacker Aircraft (USA)
- F-15E Strike Eagle (primary deep-strike platform; recommended for Natanz)
- F-16C Viper (versatile multirole)
- B-2 Spirit (stealth penetrator; recommended for Fordow)
- B-1B Lancer (optional)
- F-15C Eagle (air superiority)
- EA-18G Growler (electronic warfare)
- E-2D Hawkeye (early warning)
- KC-135 Stratotanker (air refueling)
- KC-10 Extender (air refueling)
- C-130J Hercules (transport)
- MC-130J Commando II (CSAR cargo, forward refuel points)
- HH-60G Credible Hawk (CSAR)
- HH-60W Jolly Green II (CSAR)
- MH-60S Knighthawk (CSAR)
- MH-60R Seahawk (CSAR)

### Attacker Aircraft (Israel)
- F-15I Ra'am (primary deep-strike; carries GBU-28C/B Deep Throat penetrator)
- F-16I Sufa (multirole)
- F-35I Adir (stealth multirole)
- Jericho III IRBM (strategic strike missile, conventional warheads)
- Boeing 707 (Israeli tanker variant)
- CH-53C Sea Stallion (CSAR)
- C-130J-30 Hercules Shimshon (transport/cargo)

### Defender Aircraft (Iran)
- F-4E Phantom II (1960s, bases: Bandar Abbas, Hamadan)
- F-4D Phantom II (1960s, bases: Bushehr, Chabahar)
- F-14A Tomcat (1970s, base: Esfahan) — **Most dangerous, Phoenix missiles 81 nm range**
- F-5E/F Tiger II (1960s, bases: Dezful, Mashhad)
- F-7N Fishcan (MiG-21 copy, base: Omidiyeh)
- MiG-29 Fulcrum A (modern, bases: Tabriz, Tehran)

### Defender Air Defense Systems
- SA-20 (S-300OPMU-2) SAM — **Most dangerous**
- Bavar-373 SAM (Iranian domestic)
- I-HAWK SAM (American, 1960s-era)
- Various Soviet-era SAM systems
- Chinese-copy SAM systems
- Fixed AAA sites (Vulcan 20mm, M163, etc.)

### Attacker Missiles/Ordnance
- AIM-120 AMRAAM (air-to-air)
- AIM-9 Sidewinder (air-to-air)
- AGM-65 Maverick (air-to-ground)
- JDAM (GPS-guided bomb)
- GBU-28C/B Deep Throat (4,700 lb laser-guided penetrator, Israel only)
- Tomahawk cruise missile (USA, conditional)

---

## 10. Unknowns, Gaps & Assumptions

### Geographic/Coordinate Unknowns
❓ **Exact lat/long of nuclear facilities** — Not in briefings  
❓ **Exact SAM/AAA site placement** — Not in briefings (satellite imagery referenced but not shown)  
❓ **Runway lengths, base infrastructure** — Not in briefings  
❓ **Operating area boundaries** — Not explicitly stated (inferred from base locations)  

**Decision needed:** Will RMOOZ use real-world coordinates for these Iranian locations, or place them generically on a simplified map?

### Force Composition Unknowns
❓ **Squadron sizes at each Iranian base** — Not quantified (assumed 12–18 aircraft)  
❓ **SAM system quantities and placement** — Only facility-specific counts given; overall deployment strategy unknown  
❓ **US/Israeli aircraft loadouts** — Player-selectable (not pre-determined)  
❓ **Exact tanker fleet size** — Diego Garcia deployment mentioned but not detailed  

**Decision needed:** RMOOZ will require scenario author to decide squadron sizes, SAM deployments, and initial loadouts.

### Mechanical Unknowns (CMO-specific)
❓ **Cyber warfare mechanics** — CMO has cyber operations; RMOOZ may not  
❓ **Political actions system** — Israel negotiation, Qatar overflight, US deployment menu; not standard RMOOZ  
❓ **CSAR mechanics** — CMO has detailed CSAR rules; RMOOZ's readiness/reliability system may differ  
❓ **Scoring system** — CMO awards points for facility damage; RMOOZ step completion model is different  

**Decision needed:** RMOOZ representation will simplify or omit these mechanics; focus on core scenario (strike aircraft vs. air defenses).

### Scenario Flow Unknowns
❓ **Campaign duration** — Not specified (could be 1 hour, 8 hours, multi-day)  
❓ **Number of waves** — Not specified  
❓ **Iranian response strategy** — Active intercept vs. defensive?  
❓ **Weather conditions** — Noted as dynamic but not specified at start  

**Decision needed:** RMOOZ scenario will define a single "pulse" strike (1–2 hours of gameplay) rather than multi-day campaign.

---

## 11. What Can Be Represented in RMOOZ Now

### ✅ Straightforward Mappings
- **Sides:** USA/Israel (attackers) vs. Iran (defender) — 2 or 3 sides
- **Objectives:** Strike 4 nuclear facilities (destroyable objectives)
- **Geometry:** Persian Gulf theater map with marked objective locations
- **Air bases:** 10 Iranian + 4–6 friendly staging areas
- **Units:** Fighter squadrons, SAM batteries, CSAR helicopters
- **Doctrine:** Offensive air campaign (USA/Israel) vs. defensive CAP (Iran)
- **Timeline:** Single operational phase (H+0:00 to H+2:00 or similar)
- **Readiness:** Can set initial Iranian alert status (raised) vs. friendly (staged in)

### 🟡 Partial/Simplified Mappings
- **Cyber warfare:** Omit or simplify to "electronic warfare" units (EW jamming effects)
- **Political actions:** Omit (not RMOOZ native); assume US/Israel cooperation is decided
- **CSAR mechanics:** Include CSAR units but not specialized recovery rules; treat as transport
- **Scoring:** Use RMOOZ step-completion model (phases, objectives) instead of point scoring
- **Aircraft loadouts:** Pre-determine reasonable loadouts instead of player-selection menu

### 🔴 Not Representable in RMOOZ
- **Deployment menu** — RMOOZ does not have dynamic force composition mid-game
- **Cyber operations center** — Not a native RMOOZ mechanic (no cyber system)
- **Fuel unlimited mode** — RMOOZ fuel model is simpler; assume tanker support is provided
- **Dynamic weather** — RMOOZ weather is static per scenario
- **Recovery timers** (cyber effect cooldown) — Simplified to static effects

---

## 12. Proposed RMOOZ Scenario Shape

### Core Identity
```
scenario_id:     iran-strike-2022-pilot
name:            Iran Strike 2022 (RMOOZ Pilot)
label:           Nuclear Strike on Iran
year:            2022
theater:         Persian Gulf
region_code:     MEast/Iran
```

### Sides (3-way conflict)
```
sides:
  - id: USA
    name_en: United States
    name_ar: الولايات المتحدة
    color: #0066cc
  - id: ISRAEL
    name_en: Israel
    name_ar: إسرائيل
    color: #00b8ff
  - id: IRAN
    name_en: Iran
    name_ar: إيران
    color: #cc0000

postures:
  USA:     { USA: FRIENDLY,     ISRAEL: FRIENDLY,   IRAN: HOSTILE }
  ISRAEL:  { USA: FRIENDLY,     ISRAEL: FRIENDLY,   IRAN: HOSTILE }
  IRAN:    { USA: HOSTILE,      ISRAEL: HOSTILE,    IRAN: FRIENDLY }
```

### Geographic Bounding Box
```
map_bbox: {
  north_lat: 36.5,          # Tehran area
  south_lat: 26.0,          # Strait of Hormuz
  west_lon: 44.0,           # Iraq border
  east_lon: 60.0            # Arabian Sea
}
```

### Objectives (Destroyable)
```
objectives:
  - id: ARAK
    name: Arak Heavy Water Plant
    location: ~34.0°N, 49.5°E
    owner: IRAN
    type: nuclear_facility
    damage_threshold: 75%
    constraints: "Do not damage reactor"
    
  - id: ESFAHAN
    name: Esfahan Uranium Conversion Facility
    location: ~32.9°N, 51.7°E
    owner: IRAN
    type: nuclear_facility
    damage_threshold: 75%
    constraints: "Do not damage reactor"
    
  - id: FORDOW
    name: Fordow Fuel Enrichment Plant
    location: ~36.2°N, 50.2°E
    owner: IRAN
    type: nuclear_facility
    damage_threshold: 75%
    is_hardened: true  # Underground
    
  - id: NATANZ
    name: Natanz Fuel Enrichment Plant
    location: ~33.7°N, 51.7°E
    owner: IRAN
    type: nuclear_facility
    damage_threshold: 75%
    is_hardened: true
    defenses_heavy: true  # 172 AAA + 11 SAM
```

### Units (Simplified Representation)

**Friendly Forces (USA):**
- Deployed fighter squadrons (4–6 squadrons, 18–24 aircraft)
- Deployed bomber squadron (8 aircraft)
- Tanker support (4–6 tankers)
- AWACS (2 aircraft)
- CSAR flight (4–6 helicopters)
- Carrier air wing (F/A-18, EA-18G, E-2D, 12–18 total)

**Friendly Forces (Israel):**
- Fighter squadrons (F-15I, F-16I, F-35I, 24–30 total)
- Jericho III IRBM battalion (4–6 missiles)
- Tanker support (2–3 aircraft)

**Enemy Forces (Iran):**
- Fighter squadrons at 10 bases (estimated 120–180 aircraft total)
- SAM battalions (3–5 SA-20 battalions + 2–3 Bavar-373 + 4–6 I-HAWK batteries)
- Fixed air defenses at 4 nuclear facilities (AAA + SAM as detailed)
- Early warning radars (3–5 radar sites)

### Timeline

```
steps:
  1. Pre-Strike Setup (H+0:00 – H+0:20)
     - Friendly forces deploy, stage at bases
     - Tanker support starts patrol
     - Ready aircraft for strike
  
  2. First Wave Strike (H+0:20 – H+0:50)
     - First wave fighters + bombers depart bases
     - AWACS provides air surveillance
     - Intercept Iranian fighters
     - Strike first objectives (e.g., Fordow, Natanz)
  
  3. Second Wave / Consolidation (H+0:50 – H+1:30)
     - Tanker refuel returning aircraft
     - Second wave departs (if available)
     - Strike remaining objectives (Arak, Esfahan if not already hit)
     - Manage CSAR operations
  
  4. Battle Damage Assessment (H+1:30 – H+2:00)
     - Determine which facilities are neutralized
     - Count aircraft losses
     - Assess mission success
```

### Victory Conditions

```
Success levels:
  - Tactical Victory: Neutralize 2+ nuclear facilities
  - Operational Victory: Neutralize 3+ nuclear facilities
  - Strategic Victory: Neutralize all 4 facilities + <5 friendly aircraft lost
  - Failure: Neutralize <2 facilities OR damage reactor at Arak/Esfahan
```

### Readiness / Doctrine Assumptions

```
Friendly posture:
  - USA: High readiness, staged deployment, multiple basing options
  - Israel: Mobilization detected, high alert, coordinated with USA

Iran posture:
  - Alert status: RAISED (aware of incoming strike)
  - Fighter CAP likely active or scrambling
  - SAM batteries at high readiness
  - Likely expectation: Multi-wave strike, will attempt to defend all facilities
```

---

## 13. What Requires Future RMOOZ Features/Decisions

### Level 1: Editor Support Needed
- **Hardened facility representation** — Fordow/Natanz are underground; how to show visually?
- **Objective constraints** — "Do not damage reactor" rule; how to enforce?
- **Multi-phase scoring** — Award points for partial facility damage (75% = mission kill)?

### Level 2: Scenario Design Decisions
- **Exact SAM placement grid** — 174 AAA guns + 25 SAM sites around 4 facilities; need geographic dispersal
- **Friendly force staging timeline** — When do US/Israeli aircraft arrive? (Pre-placed vs. reinforcement?)
- **Iranian fighter response** — Immediate CAP or delayed scramble? (Affects difficulty)
- **Campaign length** — 1-hour strike pulse or multi-day campaign? (Affects scope)

### Level 3: Simulation Features Not Yet Tested in RMOOZ
- **3-way conflict** (USA + Israel vs. Iran) — RMOOZ has 2-side demo; 3 sides untested
- **Carrier strike group ops** — Harry S. Truman Carrier Strike Group fixed patrol; untested in RMOOZ
- **Strategic aircraft penalties** — Score penalty for tanker/AWACS loss; untested
- **CSAR operations** — Downed aircrew recovery; likely needs custom readiness logic

---

## 14. Recommended Simplifications for RMOOZ Pilot

To create a viable RMOOZ pilot (not a perfect CMO port), recommend:

### Scope Reduction
- **Single playable side:** USA (or Israel separately)
- **Duration:** 2-hour operational scenario (not multi-day campaign)
- **Objective count:** 2 primary + 2 secondary (not 4 equally important)
- **Force size:** ~80–100 friendly units (vs. 300+ in full CMO scenario)

### Feature Simplifications
- **No cyber warfare** — Remove cyber operations menu; focus on air battle
- **No political actions** — Assume coalition is formed, bases available
- **No CSAR** — Remove downed aircrew recovery; focus on strike
- **No dynamic deployments** — Friendly aircraft pre-placed at bases; no deployment menu
- **Static victory condition** — "Damage all objectives to 75%" (not point scoring)

### Map Simplifications
- **Reduced SAM/AAA sites** — Place 30–40 total (not 174 AAA + 25 SAM)
- **Consolidated air bases** — Use 5–6 Iranian bases instead of 10 (group by region)
- **Friendly staging:** 2–3 bases instead of 4–6 options

---

## 15. Conclusion & Handoff to Phase 3B

✅ **Phase 3A Complete:** Comprehensive scenario design brief extracted from HTML briefings.

**Key findings:**
- **Scenario type:** Sandbox air campaign (2022, limited nuclear strike)
- **Playable sides:** 2–3 (USA/Israel attackers vs. Iran defender)
- **Primary mechanics:** Strike operations, air defense suppression, force management
- **Complexity level:** Medium-to-high (182+ enemy aircraft, 30+ SAM systems)
- **RMOOZ fit:** Excellent for demonstrating air combat, multi-side operations, objective-driven gameplay

**Unknowns flagged:**
- Exact geographic coordinates (will use real-world Iran locations or abstracted map?)
- SAM/AAA site exact placement (briefing provides totals, not coordinates)
- Campaign duration (1-hour strike pulse or multi-day?)
- 3-way conflict untested in RMOOZ (requires verification)

**Recommended next step (Phase 3B):**
1. Confirm map/coordinate approach (real-world vs. abstracted)
2. Decide playable force (USA only, or Israel, or both?)
3. Propose minimal RMOOZ JSON structure (3 sides, 4 objectives, ~100 units)
4. Map units to RMOOZ-available force database (confirm F-15E, F-16C, MiG-29, etc. exist)
5. Submit draft for review before writing JSON

**No RMOOZ app code changes required.** Scenario will use existing Edit Mode steps (Metadata, Region, Sides, Postures, Doctrine, Geography, Forces, Timeline, Briefing).

---

**Briefing completed:** 2026-06-04  
**Source:** 7 HTML briefing files (Iran Strike 2022 CMO Community Scenario Pack 51)  
**Briefing status:** Ready for Phase 3B scenario draft design
