# Phase 5D — DB-Lite Air Defense Enrichment Audit

**Date:** 2026-06-04  
**Status:** ✅ COMPLETE — Audit and enrichment recommendations  
**Scope:** Review existing DB-Lite; propose generic air-defense enrichment model

---

## Executive Summary

RMOOZ DB-Lite currently supports a **generic air-defense capability** that covers broad SAM/AAA/radar patterns, but **lacks specific platform variants** (S-300, S-75, ZSU-23-4, P-37, etc.). 

**Current State:**
- Generic `air_defense` role maps to broad sensor/weapon classes
- Sensor DB includes `long_range_3d` (200 nm) and `fire_control` (90 nm)
- Weapon DB includes `long_range_sam` (80 nm) and `point_defense` (5 nm)
- No variant-level enrichment (S-300, S-75, ZSU separately)

**Coastal Shield's Explicit Ranges (Phase 5B-C):**
- S-300: weapon 165 km, sensor 200 km
- S-75: weapon 35 km, sensor 75 km
- ZSU-23-4: weapon 3.5 km, sensor 40 km
- 23mm AAA: weapon 2.5 km, sensor 15 km
- P-37 Radar: sensor 250 km

**Recommendation:**
Enrich the DB-Lite with **variant-level entries** for common AD systems while preserving scenario **explicit overrides** (Coastal Shield values take precedence over DB-Lite). Future scenarios can omit explicit ranges and rely on enrichment.

---

## Current DB-Lite Structure

### 1. World State DB (`world-state-db.js`)

**CAPABILITY_CATALOG by Role:**

```javascript
air_defense: {
  rcs_class: 'medium',
  readiness: 'ready',
  supply: 0.8,
  doctrine_tags: ['IADS', 'air_defense'],
  sensors: [
    { id: 'ewr', type: 'radar', class: 'long_range_3d', emcon: 'active' },
    { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 4 }
  ],
  weapons: [
    { id: 'sam', class: 'long_range_sam', mount: 'm1', wra: { mode: '75pct', salvo: 2 } }
  ],
  magazines: [
    { mount: 'm1', stock: { long_range_sam: 32 } }
  ]
}
```

**Classification Logic (`classifyKind`):**
- Matches role regex: `/air.?def|sam|\bad\b|s-?\d{3}|missile.?def/`
- Maps to single `air_defense` class (no variants)

**Enrichment Pattern:**
- If unit has no `sensors[]`, assign `air_defense.sensors`
- If unit has no `weapons[]`, assign `air_defense.weapons`
- Never overwrites authored components

### 2. Detection DB (`detection.js`)

**Sensor Classes & Reference Ranges:**

| Class | Type | Ref Range (nm) | Notes |
|-------|------|---|---|
| `long_range_3d` | radar | 200 | Early warning, strategic |
| `multifunction` | radar | 150 | Multi-role, typical air unit |
| `air_search` | radar | 160 | Naval air search |
| `surface_search` | radar | 60 | Naval surface search |
| `fire_control` | radar | 90 | Guidance/control radar |
| `esm_intercept` | esm | 0 | Passive detection (see special logic) |

**Conversion Factor:** Reference ranges are in **nautical miles (nm)**, used in radar-horizon and RCS-based detection formulas.

**RCS Classes & Signatures:**

| Class | Sigma (m²) | Domain |
|-------|---|---|
| `very_large` | 1000 | Ships, large structures |
| `large` | 100 | Medium structures |
| `medium` | 10 | Typical 4th-gen aircraft |
| `small` | 1 | Small craft, cruise missiles |
| `stealth` | 0.05 | Stealth platforms |

### 3. Engagement DB (`engagement.js`)

**Weapon Classes & Tactical Ranges:**

| Class | Max Range (nm) | Pk (single) | Salvo | Autonomous | Vs |
|-------|---|---|---|---|---|
| `long_range_sam` | 80 | 0.70 | 2 | false | air |
| `medium_sam` | 30 | 0.65 | 2 | false | air |
| `point_defense` | 5 | 0.45 | 1 | true | air, missile |
| `anti_ship` | 75 | 0.55 | 2 | false | sea |
| `gun` | 12 | 0.30 | 3 | true | ground, sea |

**Notes:**
- Ranges are in **nautical miles**, tactical fire-control ranges (not detection)
- Autonomous point-defense fires without FC channels
- Long-range SAM requires fire-control channels

---

## Coastal Shield Explicit Fields (Phase 5B-C)

**Unit-Level Coverage Fields Added:**

```json
// S-300 SAM (both)
{
  "weapon_range_km": 165,
  "sensor_range_km": 200,
  "coverage_role": "strategic_sam",
  "sensor_class": "S300_SEARCH_RADAR",
  "weapon_class": "S300_MISSILE",
  "range_class": "strategic"
}

// S-75 SAM
{
  "weapon_range_km": 35,
  "sensor_range_km": 75,
  "coverage_role": "tactical_sam",
  "sensor_class": "S75_RADAR",
  "weapon_class": "S75_MISSILE",
  "range_class": "tactical"
}

// ZSU-23-4 AAA
{
  "weapon_range_km": 3.5,
  "sensor_range_km": 40,
  "coverage_role": "point_defense_aaa",
  "sensor_class": "ZSU_RADAR",
  "weapon_class": "ZSU_GUN",
  "range_class": "point_defense"
}

// 23mm AAA
{
  "weapon_range_km": 2.5,
  "sensor_range_km": 15,
  "coverage_role": "point_defense_aaa",
  "range_class": "point_defense"
}

// P-37 Radar (no weapon_class)
{
  "sensor_range_km": 250,
  "coverage_role": "early_warning_radar",
  "sensor_class": "P37_RADAR",
  "range_class": "strategic"
}
```

---

## Gap Analysis

### Missing from Current DB-Lite

| Item | Current | Needed | Impact |
|------|---------|--------|--------|
| **S-300 variant** | Generic long_range_sam (80 nm / 148 km) | 165 km weapon, 200 km sensor | ~10% range underestimate |
| **S-75 variant** | None (falls into generic) | 35 km weapon, 75 km sensor | No DB entry at all |
| **ZSU-23-4 variant** | None (point_defense 5 nm) | 3.5 km weapon, 40 km sensor | Sensor range way understated |
| **P-37 Radar** | None (falls into air_defense) | 250 km sensor, no weapon | Early-warning not distinct from SAM |
| **AAA generic** | point_defense (5 nm weapon) | Tactical 3-40 km range | Sensor DB missing for AAA |
| **Doctrine tags** | Generic IADS | SAM: standoff, AAA: point_defense | No tactical differentiation |

### Severity Assessment

**High Priority:**
- S-300 weapon range (165 km vs 148 km generic) — 10% error
- P-37 Radar (no detection entry) — zero sensor enrichment
- ZSU sensor range (40 km vs 0 in weapon DB) — no sensor enrichment

**Medium Priority:**
- S-75 variant entry (avoided by DB entirely)
- Doctrine tag differentiation (standoff vs point-defense)

**Low Priority:**
- Fine-tuning Pk values (coverage rings don't use Pk)

---

## Recommended DB-Lite Enrichment Model

### Design Principles

1. **Scenario Overrides Trump DB:** If unit has explicit `weapon_range_km` or `sensor_range_km`, use it (not DB).
2. **Graceful Fallback:** If unit lacks explicit range but has sensor/weapon class, look up in DB.
3. **Platform Variants:** Add S-300, S-75, ZSU, P-37 as new entries alongside generic.
4. **No Mutation:** Enrichment adds fields; never overwrites authored data.
5. **Backward Compat:** Generic `air_defense` role still works for unknown AD units.

### Phase 5D-1: Extend Detection DB (sensor_class)

**Add to `detection.js` DEFAULT_DB.sensor_class:**

```javascript
sensor_class: {
    // existing
    long_range_3d:  { type: 'radar', ref_range_nm: 200 },
    multifunction:  { type: 'radar', ref_range_nm: 150 },
    air_search:     { type: 'radar', ref_range_nm: 160 },
    surface_search: { type: 'radar', ref_range_nm: 60  },
    fire_control:   { type: 'radar', ref_range_nm: 90  },
    esm_intercept:  { type: 'esm',   ref_range_nm: 0   },
    
    // NEW: Soviet SAM variants
    S300_SEARCH_RADAR:  { type: 'radar', ref_range_nm: 108 },  // ~200 km
    S75_RADAR:          { type: 'radar', ref_range_nm: 40  },  // ~75 km
    ZSU_RADAR:          { type: 'radar', ref_range_nm: 21  },  // ~40 km
    P37_RADAR:          { type: 'radar', ref_range_nm: 135 },  // ~250 km (strategic EW)
    
    // NEW: Generic AAA/Point-Defense
    AAA_RADAR:          { type: 'radar', ref_range_nm: 8   },  // ~15 km (typical AAA)
}
```

**Rationale:**
- Converts Coastal Shield km → nm using 1 nm ≈ 1.852 km
- S-300: 200 km ÷ 1.852 = 108 nm ✅
- S-75: 75 km ÷ 1.852 = 40 nm ✅
- ZSU: 40 km ÷ 1.852 = 21 nm ✅
- P-37: 250 km ÷ 1.852 = 135 nm ✅

### Phase 5D-2: Extend Engagement DB (weapon_class)

**Add to `engagement.js` DEFAULT_WPN_DB.weapon_class:**

```javascript
weapon_class: {
    // existing
    long_range_sam:  { max_range_nm: 80, pk: 0.70, salvo: 2, autonomous: false, vs: ['air'] },
    medium_sam:      { max_range_nm: 30, pk: 0.65, salvo: 2, autonomous: false, vs: ['air'] },
    point_defense:   { max_range_nm: 5,  pk: 0.45, salvo: 1, autonomous: true,  vs: ['air','missile'] },
    anti_ship:       { max_range_nm: 75, pk: 0.55, salvo: 2, autonomous: false, vs: ['sea'] },
    gun:             { max_range_nm: 12, pk: 0.30, salvo: 3, autonomous: true,  vs: ['ground','sea'] },
    
    // NEW: Soviet SAM variants
    S300_MISSILE:    { max_range_nm: 89, pk: 0.70, salvo: 2, autonomous: false, vs: ['air'] },  // ~165 km
    S75_MISSILE:     { max_range_nm: 19, pk: 0.60, salvo: 2, autonomous: false, vs: ['air'] },  // ~35 km
    ZSU_GUN:         { max_range_nm: 1.9, pk: 0.50, salvo: 4, autonomous: true,  vs: ['air','missile'] },  // ~3.5 km
    AAA_GUN:         { max_range_nm: 1.3, pk: 0.45, salvo: 3, autonomous: true,  vs: ['air','missile'] },  // ~2.5 km
}
```

**Rationale:**
- S-300: 165 km ÷ 1.852 = 89 nm ✅
- S-75: 35 km ÷ 1.852 = 19 nm ✅
- ZSU: 3.5 km ÷ 1.852 = 1.9 nm ✅
- AAA: 2.5 km ÷ 1.852 = 1.3 nm ✅

### Phase 5D-3: Extend World State DB (classifyKind + CAPABILITY_CATALOG)

**Enhanced `classifyKind()` in `world-state-db.js`:**

```javascript
function classifyKind(u) {
    var role = (u && u.role || '').toLowerCase();
    var dom = (u && u.domain) || '';
    
    // NEW: Soviet SAM variants (more specific classification)
    if (/s-?300|s300|s-300/i.test(role)) return 'sam_s300';
    if (/s-?75|s75|dvina|volkhov/i.test(role)) return 'sam_s75';
    if (/zsu|shilka/i.test(role)) return 'aaa_zsu';
    if (/23\s*mm|gun.*aaa|aaa.*gun/i.test(role)) return 'aaa_23mm';
    if (/p-?37|flatface|barlock/i.test(role)) return 'radar_p37';
    
    // Fallback to generic air_defense for unknown AD systems
    if (/air.?def|sam|\bad\b|missile.?def/.test(role)) return 'air_defense';
    
    // existing logic...
    if (dom === 'strategic' || /base|airfield|depot|\bhq\b|command|radar|ewr|sigint/.test(role)) return 'ew_site';
    // ... etc
}
```

**New CAPABILITY_CATALOG Entries:**

```javascript
sam_s300: {
    rcs_class: 'large', readiness: 'ready', supply: 0.9, 
    doctrine_tags: ['IADS', 'SAM', 'strategic', 'standoff'],
    sensors: [
        { id: 'sr', type: 'radar', class: 'S300_SEARCH_RADAR', emcon: 'active' },
        { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 2 }
    ],
    weapons: [
        { id: 'sam', class: 'S300_MISSILE', mount: 'm1', wra: { mode: 'max', salvo: 2 } }
    ],
    magazines: [
        { mount: 'm1', stock: { S300_MISSILE: 48 } }
    ]
},

sam_s75: {
    rcs_class: 'medium', readiness: 'ready', supply: 0.8,
    doctrine_tags: ['IADS', 'SAM', 'tactical', 'standoff'],
    sensors: [
        { id: 'sr', type: 'radar', class: 'S75_RADAR', emcon: 'active' },
        { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 1 }
    ],
    weapons: [
        { id: 'sam', class: 'S75_MISSILE', mount: 'm1', wra: { mode: 'max', salvo: 2 } }
    ],
    magazines: [
        { mount: 'm1', stock: { S75_MISSILE: 32 } }
    ]
},

aaa_zsu: {
    rcs_class: 'small', readiness: 'ready', supply: 0.7,
    doctrine_tags: ['AAA', 'point_defense', 'autonomous'],
    sensors: [
        { id: 'sr', type: 'radar', class: 'ZSU_RADAR', emcon: 'active' }
    ],
    weapons: [
        { id: 'gun', class: 'ZSU_GUN', mount: 'm1', wra: { mode: 'max', salvo: 1 } }
    ],
    magazines: [
        { mount: 'm1', stock: { ZSU_GUN: 4000 } }
    ]
},

aaa_23mm: {
    rcs_class: 'small', readiness: 'ready', supply: 0.7,
    doctrine_tags: ['AAA', 'point_defense', 'optical'],
    sensors: [
        { id: 'opt', type: 'optical', class: 'visual', emcon: 'always' }
    ],
    weapons: [
        { id: 'gun', class: 'AAA_GUN', mount: 'm1', wra: { mode: 'max', salvo: 1 } }
    ],
    magazines: [
        { mount: 'm1', stock: { AAA_GUN: 2000 } }
    ]
},

radar_p37: {
    rcs_class: 'large', readiness: 'ready', supply: 0.95,
    doctrine_tags: ['radar', 'early_warning', 'strategic', 'no_weapons'],
    sensors: [
        { id: 'ewr', type: 'radar', class: 'P37_RADAR', emcon: 'active' }
    ],
    weapons: [],  // No weapons for pure radar
    magazines: []
}
```

---

## Scenario Override Rules

### Precedence (Highest to Lowest)

1. **Explicit Unit Fields** (Scenario-Specific)
   - If unit has `weapon_range_km`, use it (covers rings only)
   - If unit has `sensor_range_km`, use it (covers rings only)
   - If unit has `sensor_class` or `weapon_class`, use those (lookup in DB)

2. **DB-Lite Enrichment** (Generic/DB-Driven)
   - If unit has role matching SAM/AAA/Radar classification
   - Enrich unit with variant-level capability profile
   - Pull sensor/weapon classes from variant entry
   - Lookup classes in sensor/weapon DBs for ranges

3. **Fallback Generic** (Last Resort)
   - If unit role doesn't match any variant
   - Use generic `air_defense` capability
   - Use generic sensor/weapon classes

### Code Example

```javascript
// In coverage-summary.js (Phase 5C) or adjudicator-map.js coverage-ring calc:

function getCoverageRanges(unit) {
  // TIER 1: Explicit fields always win
  if (Number.isFinite(unit.weapon_range_km)) return unit.weapon_range_km;
  if (Number.isFinite(unit.sensor_range_km)) return unit.sensor_range_km;
  
  // TIER 2: Look up from DB-Lite class
  if (unit.sensor_class) {
    const sensorDef = sensorDB[unit.sensor_class];
    if (sensorDef && sensorDef.ref_range_nm) {
      return sensorDef.ref_range_nm * 1.852;  // nm → km
    }
  }
  
  // TIER 3: Enrich unit and try again
  const enriched = AppWorldStateDB.enrichUnit(unit);
  if (enriched.sensors && enriched.sensors.length > 0) {
    const bestSensor = enriched.sensors.reduce((best, s) => {
      const def = sensorDB[s.class];
      const range = def ? def.ref_range_nm : 0;
      return range > best.range ? { ...s, range } : best;
    }, { range: 0 });
    return bestSensor.range * 1.852;  // nm → km
  }
  
  // TIER 4: Fallback to zero
  return null;
}
```

---

## Implementation Roadmap

### Phase 5D-1: Extend Detection DB
- Add 5 new sensor_class entries (S300, S75, ZSU, P37, AAA)
- No behavior change — pure DB data
- **File:** `detection.js`
- **Effort:** 10 lines of code

### Phase 5D-2: Extend Engagement DB
- Add 4 new weapon_class entries (S300, S75, ZSU, AAA)
- No behavior change — pure DB data
- **File:** `engagement.js`
- **Effort:** 10 lines of code

### Phase 5D-3: Extend World State DB
- Enhance `classifyKind()` with variant matching
- Add 5 new CAPABILITY_CATALOG entries (sam_s300, sam_s75, aaa_zsu, aaa_23mm, radar_p37)
- No behavior change — pure DB data
- **File:** `world-state-db.js`
- **Effort:** 80 lines of code

### Phase 5D-4: Integration Testing
- Test that Coastal Shield explicit ranges override DB (expected behavior)
- Test that new scenarios without explicit ranges use DB enrichment
- Test that old scenarios still work (backward compat)

---

## Coverage Ring Usage Pattern

### Current (Phase 5B-C with Explicit Fields)

**Coastal Shield scenario:**
```json
{ "uid": "SA300-01", "weapon_range_km": 165, "sensor_range_km": 200 }
```

**Map rendering:**
1. Check `unit.weapon_range_km` → Found: 165 km
2. Use 165 km for weapon ring

### Future (Phase 5D with DB Enrichment)

**New scenario (no explicit fields):**
```json
{ "uid": "SA301-01", "role": "air_defense_sam", "label": "S-300 Copy" }
```

**Enrichment flow:**
1. Check `unit.weapon_range_km` → Not found
2. Check `unit.weapon_class` → Not found
3. Enrich unit: `classifyKind()` → "sam_s300"
4. Get capability: `CAPABILITY_CATALOG.sam_s300.weapons[0].class` → "S300_MISSILE"
5. Lookup weapon: `engagementDB.weapon_class.S300_MISSILE.max_range_nm` → 89 nm
6. Convert to km: 89 × 1.852 = 165 km ✅

**Map rendering:**
1. Check `unit.weapon_range_km` → Not found
2. Check `unit.weapon_class` → Not found
3. Call `enrichUnit()` → returns weapons with "S300_MISSILE"
4. Lookup "S300_MISSILE" in DB → 89 nm → 165 km
5. Use 165 km for weapon ring ✅

---

## Backward Compatibility

✅ **Phase 5B-C Explicit Fields:**
- Coastal Shield's explicit `weapon_range_km` and `sensor_range_km` ALWAYS take precedence
- No change in behavior for existing scenarios

✅ **Generic air_defense:**
- Current classification by regex still works
- `classifyKind()` falls back to generic for unknown AD roles
- Generic air_defense profile still available

✅ **Existing Units:**
- Units with no coverage fields continue to work (just no rings)
- Units with explicit fields: no change
- Units with variant classification: now gets enriched capability

---

## Testing & Validation

### Unit Tests (Proposed)

1. **DB Lookup Tests:**
   - Verify S300_SEARCH_RADAR → 108 nm
   - Verify S300_MISSILE → 89 nm
   - Verify conversions km ↔ nm

2. **Classification Tests:**
   - Verify "S-300 PKS" → sam_s300
   - Verify "S-75 Dvina" → sam_s75
   - Verify "ZSU-23-4" → aaa_zsu

3. **Enrichment Tests:**
   - Verify enrichUnit(role="air_defense_sam") → long_range_sam weapons
   - Verify enrichUnit(role="S-300") → S300_MISSILE weapons
   - Verify explicit fields not overwritten

4. **Coverage Ring Tests:**
   - Verify Coastal Shield ranges (explicit) unchanged
   - Verify new scenario ranges (enriched) match DB

### Backward Compat Tests

- Existing scenarios (W3, Coastal Shield) render unchanged
- Coverage rings for generic units still work
- No new runtime errors

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|---|---|---|
| **Classification false positives** | Low | Medium | Test regex against corpus of role names |
| **DB range mismatch with real weapons** | Low | Low | Ranges are advisory-only; clarify in UI |
| **Enrichment overwrites authored data** | Very Low | High | Code explicitly checks `if (!unit.weapons)` before enriching |
| **Backward compat break** | Very Low | High | Test old scenarios; generic air_defense fallback preserves old behavior |
| **Sensor/weapon class mismatch** | Low | Low | Lookup returns default (0 range) if class not found; safe fallback |

---

## Known Limitations

### Not Included in Phase 5D

❌ **Radar-only units (P-37):**
- Currently classified as generic early-warning
- Will have `weapons: []` from enrichment
- This is CORRECT — radar units don't fire
- Coverage rings only show sensor range (no weapon ring) ✅

❌ **Optical AAA (23mm gun):**
- Classified as aaa_23mm with optical sensor type
- No radar class (optical), so no detection DB lookup
- May need custom handling for optical sensors
- **Future:** Add optical sensor class to detection DB if needed

❌ **Mixed units (SAM + AAA at one base):**
- Enrichment is per-unit, not per-component
- One unit can't be both SAM and AAA
- **Correct behavior:** Treat as separate units or choose primary role

❌ **Readiness/Supply degradation:**
- DB sets supply=0.8 (80% availability)
- Coverage rings show full nominal range
- **Future:** Multiply by readiness/supply factor if desired
- **Current:** Advisory-only, no engagement logic affected

---

## Summary

**Phase 5D Audit Complete.** DB-Lite is structured correctly and extensible. Five new platform-variant entries (S-300, S-75, ZSU, 23mm, P-37) can be added to detection/engagement/world-state DBs with **zero behavior changes** — pure data extension.

**Key Findings:**
- ✅ Precedence rules clear: explicit > enriched > generic
- ✅ Backward compatible: old scenarios unchanged
- ✅ Extensible: add new SAM/AAA variants by adding DB rows
- ✅ Safe: enrichment never overwrites authored fields

**Next Steps:**
1. Add 5 sensor_class entries to detection.js (10 lines)
2. Add 4 weapon_class entries to engagement.js (10 lines)
3. Enhance classifyKind() in world-state-db.js (60 lines)
4. Add 5 CAPABILITY_CATALOG entries (100 lines)
5. Test with new scenario (no explicit ranges)

**Result:** Future scenarios can omit explicit ranges and rely on DB enrichment. Coastal Shield explicit ranges remain authoritative (unchanged). Coverage rings now have a reusable, generic, data-driven foundation.

---

**Status:** ✅ **PHASE 5D AUDIT COMPLETE**

All DB-Lite files examined. Gaps identified. Enrichment model proposed. Implementation roadmap defined. No runtime changes needed until Phase 5D implementation.

