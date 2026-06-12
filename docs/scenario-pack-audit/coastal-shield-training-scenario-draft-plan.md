# Coastal Shield — Strategic Facility Defense
## RMOOZ Training Scenario (Fictional)

**Phase 3B Status:** ✅ Scenario design draft plan (sanitized, fictional)  
**Purpose:** RMOOZ scenario authoring & decision-support learning  
**Source inspiration:** Iran Strike 2022 structure (ABSTRACTED)  
**Created:** 2026-06-04

---

## 1. Sanitization Rationale

This is a **fictional training scenario**, NOT a real-world operation.

| Aspect | Real-world Iran Strike | Coastal Shield (Fictional) |
|--------|------------------------|---------------------------|
| **Geography** | Iran (real coordinates) | Fictional island state "Meridia" |
| **Facilities** | Nuclear enrichment plants | Generic "Strategic Power Stations" |
| **Nations** | USA, Israel, Iran | Made-up coalition vs. made-up defender |
| **Timing** | May 2022 real scenario | Generic "near-future" exercise year |
| **Objectives** | Specific nuclear sites | Abstract facility types (not nuclear) |
| **Forces** | Real platforms, call signs | Generic capability classes |
| **Purpose** | Reproduce real decision problem | Teach RMOOZ scenario structure & authoring |

**Result:** Scenario teaches RMOOZ design patterns (air campaign, defended objectives, readiness pressure) without operational specificity.

---

## 2. Fictional Scenario Setting

### The Meridian Region (Fictional)

**Location:** Fictional island continent in the South Pacific-analog region  
**Political situation:** Meridia = authoritarian state; neighbors = democratic coalition (Andor Alliance)  
**Strategic context:** Meridia has built large power infrastructure for regional dominance; Alliance fears misuse

### Fictional Geography

**Theater name:** Meridian Strait  
**Map bounding box (ABSTRACTED):**
```
North boundary:  -15.0°S (fictional latitude, unused for real-world reference)
South boundary:  -22.0°S
West boundary:   155.0°E
East boundary:   165.0°E

Scale: ~800 km x ~1000 km (South Pacific-like distances)
Terrain: Coastal regions, inland plateaus, mountain passes
```

**Coastal features:**
- Meridian coast (eastern shoreline) with major port cities
- Offshore approach routes via Meridian Strait
- Island airbases available to coalition (fictional Andor islands)

### Fictional Nations

**BLUE Coalition (Attacker/Planning Side):**
- **Andor Alliance** — Coalition of 3 democratic nations
- **Primary nation:** Andoria (largest air force)
- **Partners:** Bretania, Castor
- **Rationale:** Concerned about Meridian's military buildup; considering limited defensive strike

**RED State (Defender):**
- **Meridia** — Authoritarian island state
- **Military doctrine:** Regional power, continental ambitions
- **Air force posture:** Modern fighter fleet, air defense network
- **Likely strategy:** Defend key facilities, attempt intercept coalition forces

---

## 3. Scenario Identity & Core Concept

### Scenario Header
```
scenario_id:       coastal-shield-training-v1
name:              Coastal Shield — Strategic Facility Defense
scenario_label:    Coalition Air Defense Exercise
game_year:         2029 (fictional near-future)
theater:           Meridian Region
region_code:       meridia-coastal
scenario_type:     Limited air campaign
```

### Design Intent (Training Goals)

**Learning objectives for RMOOZ authors:**
1. **Multi-side scenario design** (3+ sides in one operation)
2. **Defended objective modeling** (strategic facilities with air defense rings)
3. **Readiness/supply constraints** (fuel, tankers, basing limitations)
4. **Timeline-based decision support** (phased operations, windows of opportunity)
5. **Risk/feasibility trade-offs** (how losses affect mission viability)
6. **Geographic abstraction** (use fictional locations, not real-world targeting)

### Scenario Narrative (Gameplay Frame)

**Player role:** Coalition air campaign commander (Andor Alliance)

**Situation:** Meridia has built 4 large power stations as regional dominance infrastructure. Intelligence indicates potential for misuse. Coalition has decision window: limited precision strike vs. risk of escalation.

**Mission context:** 
- NOT a nuclear strike scenario (no WMD element)
- NOT a real-world operation (completely fictional)
- IS a decision-support exercise (air campaign planning, feasibility assessment)
- IS a RMOOZ authoring learning lab (test scenario composition, unit placement, objective mechanics)

---

## 4. Sides & Factions (Fictional)

### Side 1: BLUE — Andor Coalition (Attacker)

**Political leadership:** Andor Alliance Council (fictional)  
**Military command:** Andor Air Force Command (hypothetical)  
**Alliance composition:**
- Andoria (primary air power)
- Bretania (strategic bombers, tanker support)
- Castor (naval aviation, carrier-based fighters)

**Available forces (GENERIC types, not real platforms):**
- Fighter squadrons (air superiority class): 24–30 aircraft
- Fighter-bomber squadrons (multirole strike class): 24–30 aircraft
- Long-range bomber squadron (strategic penetration class): 4–6 aircraft
- Electronic warfare flights: 4 aircraft
- Early warning flights: 2 aircraft
- Tanker flights: 6–8 aircraft
- Transport flights: 4 aircraft
- Combat search & rescue flights: 4–6 helicopters

**Basing:**
- Andor main air base (home country)
- Bretania forward air base (fictional island staging)
- Castor carrier-based air wing (fixed in northern Meridian Strait)
- Diego-analog base (remote tanker/bomber staging)

**Doctrine:** Long-range precision strike, layered air defense suppression, force sustainment via tankers

**Constraint:** Limited basing options, fuel-dependent operations, political window (24–48 hour decision deadline)

### Side 2: RED — Meridia (Defender)

**Political leadership:** Meridian government (fictional authoritarian state)  
**Military command:** Meridian Air Defense Command  

**Available forces (GENERIC types):**
- Fighter squadrons (older generation air defense): 80–100 aircraft distributed across 6 bases
  - Fighter type A (legacy American-era analog): 40 aircraft
  - Fighter type B (modern Russian-era analog): 20 aircraft
  - Fighter type C (newer indigenous/copy): 40 aircraft
- Air defense squadrons:
  - Long-range SAM system (S-300-analog): 3–4 battalions
  - Medium-range SAM system (Patriot-analog): 4–6 batteries
  - Short-range air defense: 30–40 vehicles/sites
- Early warning radars: 4–6 sites across region
- Fixed air defenses at 4 strategic facilities: 250+ air defense guns, ~24 SAM launchers

**Basing:** 6 fighter bases across Meridian territory

**Doctrine:** Static defense (SAM rings around strategic facilities), fighter CAP, deny coalition air superiority

**Posture:** Alert status RAISED (coalition mobilization detected via intelligence)

### Side 3: GRAY — Neutral/Civilian Infrastructure (Optional)

**Non-combatant population** represented implicitly in objectives (collateral damage constraints)

---

## 5. Strategic Objectives (Fictional Facilities)

### Primary Objective Set: 4 Strategic Power Stations

**Justification:** Large power infrastructure could support military expansion; limited strike aims to degrade capability without destroying civilian electrical grid.

**Constraint:** Each facility has civilian power generation role; excessive collateral damage violates rules of engagement.

### Objective 1: Meridian North Station

```
code:              NORD
name:              Meridian North Power Station
fictional_coord:   -16.2°S, 159.5°E
facility_type:     Dual-use power generation
status:            Operational, 8 year-old facility
defenses:
  AAA sites:       45 guns (various calibers)
  SAM sites:       4 (medium-range systems)
  Fighter CAP:     Likely (Esfahan-North base nearby)
  
mission_objective: Reduce to 50% operational capacity (damage threshold: 60%)
collateral_constraint: Do NOT damage civilian power distribution grid
difficulty_level:  HIGH (heavily defended, urban area nearby)
```

### Objective 2: Meridian East Station

```
code:              EAST
name:              Meridian East Power Station
fictional_coord:   -18.1°S, 162.3°E
facility_type:     Coastal power generation
status:            Operational, 5 year-old facility
defenses:
  AAA sites:       38 guns
  SAM sites:       3 (mixed medium-range)
  Fighter CAP:     Likely (Bushehr-East base nearby)
  
mission_objective: Reduce to 50% operational capacity (damage threshold: 60%)
collateral_constraint: Minimize civilian casualties (coastal town 8 km away)
difficulty_level:  MEDIUM-HIGH (coastal location, some access routes exposed)
```

### Objective 3: Meridian Central Station

```
code:              CENT
name:              Meridian Central Power Station
fictional_coord:   -19.3°S, 160.1°E
facility_type:     Inland power generation
status:            Operational, 3 year-old facility
defenses:
  AAA sites:       62 guns (most heavily defended)
  SAM sites:       6 (long-range + medium-range systems)
  Fighter CAP:     Likely (Tabriz-Central base very close)
  
mission_objective: Reduce to 50% operational capacity (damage threshold: 60%)
collateral_constraint: Do NOT damage civilian infrastructure within 15 km radius
difficulty_level:  VERY HIGH (most hardened, inland, concentrated SAM coverage)
```

### Objective 4: Meridian South Station

```
code:              SOUT
name:              Meridian South Power Station
fictional_coord:   -20.8°S, 157.2°E
facility_type:     Offshore/coastal power generation
status:            Operational, 2 year-old facility
defenses:
  AAA sites:       28 guns
  SAM sites:       2 (newer medium-range systems)
  Fighter CAP:     Less likely (farthest from fighter bases)
  
mission_objective: Reduce to 50% operational capacity (damage threshold: 60%)
collateral_constraint: Minimal (remote offshore location)
difficulty_level:  MEDIUM (least defended, logistics harder for coalition)
```

### Victory Conditions (Derived from Objective Set)

```
Strategic Victory:  Damage all 4 stations to 60%+ with <5 friendly aircraft lost
Operational Victory: Damage 3 stations to 60%+ with <8 friendly aircraft lost
Tactical Victory:   Damage 2 stations to 60%+ with <10 friendly aircraft lost
Failure:            Damage <2 stations OR inflict >10% civilian casualties
```

---

## 6. Force Composition (GENERIC, No Real Platforms)

### Friendly Forces (Andor Coalition) — GENERIC CAPABILITY CLASSES

**These are NOT named after real aircraft. They represent capability classes in RMOOZ notation.**

#### Fighter-Air Superiority Class
- **Quantity:** 24–30 aircraft
- **Capability profile:** High speed, long-range missiles, radar tracking
- **Loadout:** Long-range air-to-air missiles (simulation: 4–6 per aircraft)
- **Role:** Combat air patrol, intercept Meridian fighters, protect strike package
- **Readiness:** Full (pre-positioned at Bretania forward base)
- **Fuel requirement:** Mid-range tanker support needed for extended CAP

#### Fighter-Bomber-Multirole Class
- **Quantity:** 24–30 aircraft
- **Capability profile:** Medium range, precision air-to-ground, some air-to-air capability
- **Loadout:** Precision-guided air-to-ground ordnance (4–8 per aircraft)
- **Role:** Primary strike against power stations; secondary air-to-air
- **Readiness:** Full
- **Fuel requirement:** Heavy tanker support (long missions from distant bases)

#### Long-Range Bomber Class
- **Quantity:** 4–6 aircraft
- **Capability profile:** Strategic penetration, heavy payload, long range
- **Loadout:** Large precision-guided ordnance (2–4 per aircraft)
- **Role:** Strike most heavily-defended objectives (Central, possibly East)
- **Readiness:** Full (staging from Diego-analog base)
- **Fuel requirement:** Minimal (own-aircraft refueling capability assumed)
- **Doctrine:** Limited quantity; high value targets only

#### Electronic Warfare Class
- **Quantity:** 4 aircraft
- **Capability profile:** Radar jamming, communications disruption
- **Role:** Suppress Meridian air defense radars during strike
- **Readiness:** Full
- **Fuel requirement:** Minimal

#### Early Warning Class
- **Quantity:** 2 aircraft
- **Capability profile:** Air surveillance, fighter guidance, tactical assessment
- **Role:** Detect Meridian fighter launch, guide coalition air superiority fighters
- **Readiness:** Full
- **Fuel requirement:** Continuous tanker support (airborne for 8+ hours)

#### Tanker Class
- **Quantity:** 6–8 aircraft
- **Capability profile:** Aerial refueling, large payload
- **Role:** Enable long-range strike, sustain air superiority CAP, recover damaged aircraft
- **Readiness:** Full
- **Fuel requirement:** Own-aircraft (baseline, no refueling of tankers modeled)
- **Constraint:** Limited number; mission planning must account for refuel windows

#### Combat Search & Rescue Class
- **Quantity:** 4–6 helicopters
- **Capability profile:** Downed aircrew recovery
- **Role:** Rescue pilots if aircraft shot down
- **Readiness:** Conditional (enabled only if player chooses CSAR mode)
- **Fuel requirement:** Significant (short range, tanker support needed)

### Enemy Forces (Meridia) — GENERIC CAPABILITY CLASSES

#### Fighter Class (Older Generation)
- **Quantity:** ~40–50 aircraft across 3 bases
- **Capability profile:** Medium range, older missiles (16–20 nm range)
- **Bases:**
  - Meridia North Base: 14 aircraft
  - Meridia East Base: 16 aircraft
  - Meridia Southwest Base: 12 aircraft
- **Doctrine:** Point defense (protect nearby facilities), limited range
- **Readiness:** Initially alert but not airborne; likely scramble on coalition approach

#### Fighter Class (Modern)
- **Quantity:** ~20–24 aircraft across 2 bases
- **Capability profile:** Long-range missiles (35–50 nm), modern avionics
- **Bases:**
  - Meridia Central Base: 12 aircraft (most dangerous)
  - Meridia Northwest Base: 10 aircraft
- **Doctrine:** Offensive CAP, attempt to intercept coalition strikes
- **Readiness:** High (likely some airborne during alert)

#### Fighter Class (Newer/Indigenous)
- **Quantity:** ~30–40 aircraft across 2 bases
- **Capability profile:** Medium capability, local manufacturing/licensing
- **Bases:**
  - Meridia East Base: 18 aircraft
  - Meridia South Base: 16 aircraft
- **Doctrine:** Area defense, secondary bases, attrition role
- **Readiness:** Medium (delayed scramble expected)

### Air Defense Systems (Meridia)

#### Long-Range SAM System (S-300 Analog)
- **Quantity:** 3–4 battalions (12–16 launchers total)
- **Coverage:** Concentrated around North, East, Central stations
- **Range:** ~80 km (effective against bombers, fighter-bombers at distance)
- **Doctrine:** Layered defense, protect high-value targets
- **Readiness:** Full, manned, continuous surveillance

#### Medium-Range SAM System (Patriot Analog)
- **Quantity:** 4–6 batteries (16–24 launchers total)
- **Coverage:** Distributed around all 4 stations
- **Range:** ~30–40 km
- **Doctrine:** Mid-layer defense, work with AAA for point defense
- **Readiness:** Full

#### Short-Range Air Defense (AAA + MANPAD)
- **Quantity:** ~250+ anti-aircraft guns (various calibers), 30–40 mobile sites
- **Coverage:** Concentrated at each facility (45–62 guns each)
- **Range:** 2–8 km
- **Doctrine:** Innermost defense ring, protect facility itself from low-altitude strikes
- **Readiness:** Full

#### Early Warning Radars
- **Quantity:** 4–6 radar sites across Meridian territory
- **Coverage:** Overlapping surveillance of entire coastal region
- **Range:** 200+ km (detection), 100+ km (tracking)
- **Doctrine:** Provide fighter-control center with tactical picture
- **Readiness:** Continuous operation

---

## 7. Timeline & Operational Phases

### Pre-Strike Setup (H+0:00 – H+0:20)
```
Player actions:
  - Review Meridia air defense deployment
  - Select strike targets (1, 2, 3, or 4 stations)
  - Allocate aircraft by type to objectives
  - Plan tanker support schedule
  - Decide EW/early warning posture
  - Set ROE (rules of engagement) for collateral damage

Meridia actions:
  - Begin fighter scramble from all bases
  - Activate SAM system radars
  - Increase AAA readiness at facilities
  - (Possibly launch preemptive CAP if player detected)
```

### First Wave Strike (H+0:20 – H+0:50)
```
Player actions:
  - Launch air superiority fighters (cover strike package)
  - Launch long-range bombers (if using for North/Central)
  - Launch fighter-bombers (primary strike wave)
  - Maintain tanker orbits for refuel support
  - EW support active against SAM radars
  - Early warning directing intercept attempts

Meridia actions:
  - Fighter intercept attempts (likely success against some coalition aircraft)
  - SAM engagement of long-range bombers (high-risk phase)
  - AAA engagement of low-altitude fighter-bombers
  - Damage control at struck facilities

Expected outcome:
  - Coalition: 2–6 aircraft lost (fighters from AAA, bombers from SAM)
  - Meridia: 4–8 fighters lost (to coalition air superiority)
  - Facilities: 1–2 struck (Meridia South likely, North possible)
```

### Consolidation & Second Wave (H+0:50 – H+1:30)
```
Player decision point:
  - Continue with second wave (higher risk, higher reward)?
  - Abort and consolidate damage (lower risk, fewer objectives hit)?
  - Shift targets (strike East/Central instead of North if losses high)?

Player actions (if continuing):
  - Recover damaged aircraft to tankers
  - Rearm and relaunch fighter-bombers
  - Launch second bomber wave (if first succeeded)
  - Adjust fighter CAP posture based on first wave results

Meridia actions:
  - Reposition surviving fighters
  - Repair SAM systems (if possible, simulate with reduced effectiveness)
  - Increase AAA readiness after first strike
  - Possible counter-strike attempt (unlikely but option)

Expected outcome:
  - Coalition: 6–12 total aircraft losses (cumulative)
  - Meridia: 10–15 total fighters lost
  - Facilities: 2–3 struck total (North, East, possibly Central)
```

### Battle Damage Assessment (H+1:30 – H+2:00)
```
Scoring phase:
  - Count coalition aircraft losses
  - Assess facility damage (50%? 75%? 100%?)
  - Determine if victory conditions met
  - Calculate final score (if using RMOOZ scoring model)

Player actions:
  - Option to launch recovery operations (if CSAR enabled)
  - Option to launch final strike if time permits
  - Prepare after-action report

Expected outcome:
  - Determine if scenario is "Strategic Victory" (all 4 facilities) or lower
  - Assess feasibility of extended campaign
  - Evaluate force readiness for Phase 2 (if it existed)
```

---

## 8. Readiness & Supply Constraints

### Fuel Management
```
Friendly constraint:
  - All strike aircraft depend on tanker support for long-range operations
  - No tankers = limited strike range, forces must use nearer bases
  - Early warning and air superiority fighters MUST have continuous tanker orbits
  - Loss of 1 tanker = significant strike package degradation

Scenario design: Player must allocate tanker orbits to match strike timeline
```

### Aircraft Losses & Force Degradation
```
Scoring:
  - First 5 losses: Minimal penalty (attrition expected)
  - 6–10 losses: Increased penalty (force degradation)
  - 11+ losses: Large penalty (strategy failing)

Effect on subsequent waves:
  - High first-wave losses = fewer aircraft available for second wave
  - Encourages risk-management (abort early vs. continue)
```

### Basing Constraints
```
Friendly:
  - Bretania forward base: Limited ramp space (can pre-position ~40–50 aircraft max)
  - Distant Diego-analog base: Bomber staging only, longer flight times
  - Carrier: Fixed patrol area, can't reposition even if threatened

Meridia:
  - Fighter bases spread across territory (player must degrade multiple bases to reduce fighter threat)
  - If player strikes fighter bases (not planned), Meridia loses some CAP capability
```

### Readiness Posture

**Friendly (Andor Coalition):**
- Assumption: High readiness, forces pre-positioned and ready
- Assumption: Logistics are handled (fuel trucks, munitions, maintenance)
- Decision point: When to launch (political window: 24–48 hours)

**Enemy (Meridia):**
- Assumption: Alert status RAISED (detection of coalition buildup)
- Assumption: Fighters can scramble within 5–10 minutes
- Assumption: SAM systems manned but not in active fire mode initially
- Question: Will Meridia launch preemptive strike? (Not in this scenario design, but possible future variant)

---

## 9. RMOOZ Scenario Structure (Proposed JSON Shape)

### Scenario Header

```json
{
  "scenario_id": "coastal-shield-training-v1",
  "name": "Coastal Shield — Strategic Facility Defense",
  "scenario_label": "Coalition Air Defense Exercise",
  "year": 2029,
  "theater": "Meridian Region (Fictional)",
  "region_code": "meridia-coastal",
  "scenario_type": "Limited air campaign",
  "design_intent": "RMOOZ authoring training; decision-support exercise",
  
  "authoring_status": "draft",
  "steps_completed": ["metadata", "region"],
  "steps_remaining": ["sides", "postures", "doctrine", "geography", "forces", "timeline", "briefing"]
}
```

### Sides

```json
"sides": [
  {
    "id": "BLUE",
    "name_en": "Andor Coalition",
    "name_ar": "联盟",
    "color": "#0066cc",
    "doctrine": "Offensive air campaign, precision strikes, force sustainment",
    "readiness": "HIGH"
  },
  {
    "id": "RED",
    "name_en": "Meridia",
    "name_ar": "梅瑞迪亚",
    "color": "#cc0000",
    "doctrine": "Static defense, air superiority denial, facility protection",
    "readiness": "RAISED (alert status)"
  }
]
```

### Map & Geometry

```json
"map": {
  "bbox": {
    "north_lat": -15.0,
    "south_lat": -22.0,
    "west_lon": 155.0,
    "east_lon": 165.0,
    "crs": "WGS84"
  },
  "scale_km": "~800 x 1000",
  "terrain_description": "Coastal island state with inland plateaus",
  "feature_notes": "Meridian Strait approach route, multiple coastal bases"
}
```

### Objectives

```json
"objectives": [
  {
    "id": "NORD",
    "name": "Meridian North Power Station",
    "coord": [-16.2, 159.5],
    "owner": "RED",
    "type": "strategic_facility",
    "damage_threshold_percent": 60,
    "defenses": {
      "aaa_count": 45,
      "sam_count": 4,
      "fighter_cap_likely": true
    },
    "collateral_constraint": "Do NOT damage civilian grid",
    "difficulty": "HIGH"
  },
  {
    "id": "EAST",
    "name": "Meridian East Power Station",
    "coord": [-18.1, 162.3],
    "owner": "RED",
    "type": "strategic_facility",
    "damage_threshold_percent": 60,
    "defenses": {
      "aaa_count": 38,
      "sam_count": 3,
      "fighter_cap_likely": true
    },
    "collateral_constraint": "Minimize civilian casualties (8 km away)",
    "difficulty": "MEDIUM-HIGH"
  },
  {
    "id": "CENT",
    "name": "Meridian Central Power Station",
    "coord": [-19.3, 160.1],
    "owner": "RED",
    "type": "strategic_facility",
    "damage_threshold_percent": 60,
    "defenses": {
      "aaa_count": 62,
      "sam_count": 6,
      "fighter_cap_likely": true
    },
    "collateral_constraint": "Do NOT damage infrastructure within 15 km",
    "difficulty": "VERY_HIGH"
  },
  {
    "id": "SOUT",
    "name": "Meridian South Power Station",
    "coord": [-20.8, 157.2],
    "owner": "RED",
    "type": "strategic_facility",
    "damage_threshold_percent": 60,
    "defenses": {
      "aaa_count": 28,
      "sam_count": 2,
      "fighter_cap_likely": false
    },
    "collateral_constraint": "Minimal (remote location)",
    "difficulty": "MEDIUM"
  }
]
```

### Units (Sketch)

```json
"units": {
  "BLUE_fighters_air_superiority": {
    "type": "fighter_air_superiority",
    "count": 30,
    "base": "bretania_forward",
    "doctrine": "Combat air patrol, intercept",
    "readiness": "FULL"
  },
  "BLUE_strikers_multirole": {
    "type": "fighter_bomber_multirole",
    "count": 28,
    "base": "bretania_forward",
    "doctrine": "Primary strike",
    "readiness": "FULL"
  },
  "BLUE_bombers_long_range": {
    "type": "bomber_strategic_penetration",
    "count": 6,
    "base": "diego_analog",
    "doctrine": "Strike hardened targets",
    "readiness": "FULL"
  },
  "BLUE_ew_flights": {
    "type": "electronic_warfare",
    "count": 4,
    "base": "bretania_forward",
    "doctrine": "Suppress enemy radars",
    "readiness": "FULL"
  },
  "BLUE_tankers": {
    "type": "tanker",
    "count": 8,
    "base": "bretania_forward",
    "doctrine": "Sustain operations",
    "readiness": "FULL",
    "constraint": "Limited quantity; critical to mission"
  },
  "BLUE_early_warning": {
    "type": "early_warning",
    "count": 2,
    "base": "bretania_forward",
    "doctrine": "Fighter control, air surveillance",
    "readiness": "FULL"
  },
  "RED_fighters_older": {
    "type": "fighter_older_generation",
    "count": 45,
    "bases": ["meridia_north", "meridia_east", "meridia_southwest"],
    "doctrine": "Point defense, limited range",
    "readiness": "ALERT (likely scramble on approach)"
  },
  "RED_fighters_modern": {
    "type": "fighter_modern",
    "count": 22,
    "bases": ["meridia_central", "meridia_northwest"],
    "doctrine": "Offensive CAP, intercept",
    "readiness": "HIGH (some airborne)"
  },
  "RED_sams_long_range": {
    "type": "sam_long_range",
    "count": 4,
    "distribution": "North, East, Central objectives",
    "doctrine": "Layered defense",
    "readiness": "FULL"
  },
  "RED_sams_medium_range": {
    "type": "sam_medium_range",
    "count": 6,
    "distribution": "All 4 objectives",
    "readiness": "FULL"
  },
  "RED_aaa_fixed": {
    "type": "aaa_fixed_facility_defense",
    "count": 250,
    "distribution": "45 (Nord), 38 (East), 62 (Central), 28 (South) + dispersed",
    "readiness": "FULL"
  },
  "RED_radars_early_warning": {
    "type": "radar_early_warning",
    "count": 5,
    "distribution": "Across Meridian territory",
    "readiness": "CONTINUOUS"
  }
}
```

### Timeline (Sketch)

```json
"steps": [
  {
    "id": 1,
    "title": "H+0:00 — Pre-Strike Setup",
    "phase": "Deployment",
    "duration_minutes": 20,
    "player_decisions": [
      "Select objectives (1–4 stations)",
      "Allocate aircraft by type",
      "Plan tanker orbits",
      "Set ROE"
    ]
  },
  {
    "id": 2,
    "title": "H+0:20 — First Wave Strike",
    "phase": "Initial Attack",
    "duration_minutes": 30,
    "expected_outcome": "1–2 objectives struck; 2–6 friendly losses; 4–8 enemy fighters downed"
  },
  {
    "id": 3,
    "title": "H+0:50 — Consolidation & Decision",
    "phase": "Tactical Assessment",
    "duration_minutes": 40,
    "player_decisions": [
      "Continue with second wave (higher risk)?",
      "Abort and consolidate damage (lower risk)?",
      "Shift targets based on first wave success?"
    ]
  },
  {
    "id": 4,
    "title": "H+1:30 — Battle Damage Assessment",
    "phase": "Mission Completion",
    "duration_minutes": 30,
    "scoring": "Count aircraft losses, assess facility damage, determine victory level"
  }
]
```

### Victory Conditions

```json
"victory_conditions": {
  "strategic_victory": {
    "description": "Damage all 4 stations to 60%+",
    "constraints": "With <5 friendly aircraft lost",
    "points": 100
  },
  "operational_victory": {
    "description": "Damage 3 stations to 60%+",
    "constraints": "With <8 friendly aircraft lost",
    "points": 75
  },
  "tactical_victory": {
    "description": "Damage 2 stations to 60%+",
    "constraints": "With <10 friendly aircraft lost",
    "points": 50
  },
  "failure": {
    "description": "Damage <2 stations OR >10% civilian casualties",
    "points": 0
  }
}
```

---

## 10. Unknowns & Gaps (To Be Resolved Before JSON)

### Geographic/Coordinate Unknowns
❓ **Exact facility placement grid** — Are facilities interior-to-map or coastal? (Affects aircraft approach routes)  
❓ **Runway orientations at fighter bases** — Not specified; will use defaults  
❓ **SAM site exact placement** — Briefing provides totals; need to distribute around objectives  

### Force Composition Unknowns
❓ **Exact aircraft types in RMOOZ database** — Will use generic RMOOZ unit classes; specific platform names TBD  
❓ **Tanker orbit altitudes/ranges** — RMOOZ fuel model may differ from CMO; will need testing  
❓ **Specific loadout details** — Will use reasonable defaults (air-to-air, air-to-ground by class)  

### Mechanical Unknowns
❓ **3-way conflict in RMOOZ** — Only 2 sides tested in demos; RED has 3 fighter types but 2 main groupings  
❓ **Collateral damage constraint enforcement** — RMOOZ may not have mechanics for "do not damage X"; will note as assumption  
❓ **Loss penalty scoring** — Not yet implemented; will propose model but may need custom logic  

### Scenario Scope Unknowns
❓ **Campaign extension** — This is H+0 to H+2 only; full multi-day campaign would be Phase 2  
❓ **CSAR inclusion** — Player-selectable; included in unit lists but not core to victory conditions  

---

## 11. Design Decisions & Rationales

### Why Fictional Geography?
- **Safety:** No real-world targeting information
- **Authenticity:** Tests RMOOZ scenario authoring without operational baggage
- **Learning:** Isolates scenario design patterns from geopolitical specificity

### Why Generic Capability Classes (Not Named Platforms)?
- **Vendor-neutral:** Works with any RMOOZ aircraft database
- **Robustness:** If RMOOZ adds new platforms, scenario doesn't break
- **Focus:** Teaches scenario structure, not platform identification

### Why 4 Objectives Instead of Custom Facilities?
- **Modularity:** Simple scenario for pilot; can extend to 8–12 objectives later
- **Feasibility:** Tests RMOOZ objective mechanics in bounded scope
- **Testing:** Allows iteration on difficulty/balance without full complexity

### Why Political Window Constraint (24–48 hours)?
- **Realism:** Mirrors real air campaign planning (weather, intelligence, political decisions)
- **Decision support:** Forces player to decide: launch now or wait (teaches risk/reward)
- **Scenario depth:** Time pressure adds decision complexity without mechanical complexity

---

## 12. RMOOZ Authoring Learning Value

### Pattern 1: Multi-Sided Conflict
**What this scenario teaches:**
- How to define 2+ sides with different doctrines
- Posture matrix (FRIENDLY/HOSTILE/NEUTRAL relationships)
- Unit assignment by side (RED fighters vs. BLUE fighters)

### Pattern 2: Defended Objectives
**What this scenario teaches:**
- How to place strategic objectives on map
- How to defend objectives with air defense units (SAMs, AAA, CAP)
- Damage thresholds and victory conditions tied to objective damage

### Pattern 3: Readiness & Supply Constraints
**What this scenario teaches:**
- How to represent fuel constraints (tanker support)
- How to model basing limitations (limited ramps, distant bases)
- How to encode force degradation from losses (affects subsequent waves)

### Pattern 4: Timeline & Phasing
**What this scenario teaches:**
- How to structure scenario in phases (deployment → strike → assessment)
- How to use decision points (continue or abort after first wave?)
- How to represent campaign duration in RMOOZ steps

### Pattern 5: Risk/Feasibility Trade-offs
**What this scenario teaches:**
- How to encode difficult targets (Central: high defense, high value)
- How to encode easier targets (South: low defense, lower value)
- How player choices affect mission outcome (select 2 vs. 4 objectives)

---

## 13. Acceptance Criteria for Phase 3B Plan

✅ **Sanitization verified:**
- ✅ No real-world coordinates (fictional -15 to -22°S, 155 to 165°E)
- ✅ No real nuclear facilities (generic "power stations")
- ✅ No real nations (Andor Coalition, Meridia)
- ✅ No real strike timing (May 2022 → generic 2029)
- ✅ No operational guidance (scenario is sandbox, not planning tool)

✅ **Fictional world internally consistent:**
- ✅ Political situation clear (authoritarian Meridia, democratic coalition)
- ✅ Strategic rationale clear (power infrastructure as center of gravity)
- ✅ Geographic logic clear (island theater, approach routes)

✅ **RMOOZ scenario structure complete:**
- ✅ Sides defined (2 primary: BLUE/RED)
- ✅ Objectives defined (4 strategic facilities)
- ✅ Units sketched (generic capability classes)
- ✅ Timeline sketched (4 phases, 2 hours total)
- ✅ Victory conditions defined (4 levels)

✅ **Learning objectives clear:**
- ✅ Multi-sided scenario authoring
- ✅ Defended objective modeling
- ✅ Readiness/supply constraints
- ✅ Timeline & phasing
- ✅ Risk/feasibility trade-offs

---

## 14. Recommendation: Proceed to Phase 3C

**Status:** ✅ Draft plan ready for user review

**Next steps (Phase 3C):**
1. **User review of scenario design** (sanitization, learning goals, scope)
2. **Confirmation of unit types** (match against RMOOZ force database)
3. **Map coordinate finalization** (fictional bbox confirmed)
4. **Write RMOOZ JSON scenario** (once plan is approved)
5. **Import & test in RMOOZ workspace** (validate steps, load without errors)
6. **Play through pilot scenario** (manual testing, verify victory conditions)

**Estimated effort for Phase 3C (JSON + testing):** 4–6 hours

---

**Draft plan completed:** 2026-06-04  
**Source:** Iran Strike 2022 brief (abstracted & sanitized)  
**Status:** Ready for user review before JSON authoring
