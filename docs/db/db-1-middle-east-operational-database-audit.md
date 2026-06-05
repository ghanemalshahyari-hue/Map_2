# DB-1 Audit: RMOOZ Middle East Operational Database Architecture

**Date:** 2026-06-04  
**Scope:** Design safe, offline Middle East operational database inspired by CMO structure  
**Status:** ✅ AUDIT COMPLETE (Read-only; recommendations provided)

---

## Executive Summary

**RMOOZ can safely build a Middle East operational database** using CMO as a structural inspiration (not data copy). The current DB-Lite (world-state-db.js) provides a solid foundation for enrichment. A phased approach starting with a JSON Middle East platform catalog is recommended.

**Key Principles:**
- ✅ Use CMO structure only (role/domain classification, sensor/weapon/magazine hierarchy)
- ✅ Use public/unclassified data (from SIPRI, open military specs, academic sources)
- ✅ Store only operational-relevance data (not classified capabilities)
- ✅ Approximate values where needed (ranges rather than exact specs)
- ✅ Keep offline/private (JSON files in repo, not external DB)
- ✅ Scenario-specific overrides always take precedence

---

## Current Architecture: DB-Lite Analysis

### What RMOOZ Has Today

**File:** `UI_MOdified/client/shell/world-state-db.js`

**Structure:**
```javascript
CAPABILITY_CATALOG = {
    role_key: {
        rcs_class,           // radar cross-section
        readiness,           // default 'ready'
        supply,              // default 0.8
        doctrine_tags: [],
        sensors: [{ id, type, class, emcon, ... }],
        weapons: [{ id, class, mount, wra, ... }],
        magazines: [{ mount, stock: {class: count} }]
    }
}
```

**Current Catalog Entries (6):**
1. `air_defense` — SAM systems
2. `naval_combatant` — Ships
3. `ground_maneuver` — Land forces
4. `air_unit` — Aircraft
5. `ew_site` — Early warning/EW
6. `generic` — Unknown/fallback

**Classification:** Role keywords + domain matching (not table lookup)

**Enrichment:** Fills missing unit fields from catalog, never overwrites authored values

### Strengths
- ✅ Pure functions (safe cloning)
- ✅ Role-based (generic across scenarios)
- ✅ Extensible (add catalog rows)
- ✅ Framework-free (browser + Node)
- ✅ Authored values protected (never overwritten)

### Gaps for Middle East DB
- ❌ No platform registry (which specific aircraft, ships, missiles)
- ❌ No facility/base catalog (airbases, naval bases, air defense sites)
- ❌ No sensor/weapon detail beyond role (can't distinguish S-400 from Patriot)
- ❌ No doctrine-specific defaults (Iranian vs Saudi vs Israeli doctrine)
- ❌ No readiness/supply variation by platform or region
- ❌ No magazine capacity or ammo type beyond class

---

## Audit Questions: Answered

### Q1: Which CMO-style categories should RMOOZ mirror structurally?

**RECOMMENDED CMO-style structure for RMOOZ DB-1:**

| Category | Purpose | Example |
|----------|---------|---------|
| **Platforms** | Physical units with fixed specs | F-16C, S-400, Destroyer |
| **Sensors** | Detection/tracking equipment | AN/APG-68 radar, EW pod |
| **Weapons** | Offensive systems | AIM-120C, Kh-59, Naval gun |
| **Doctrine Templates** | Operational defaults by nation/role | Iranian air defense doctrine, Saudi logistics |
| **Facilities** | Fixed installations | Bandar Abbas airbase, Al Dhafra air base |
| **Mounts** | Physical attachment points | Aircraft hardpoint 1-7, Ship deck mount |
| **Magazines** | Ammunition storage | Magazine A: 32 SAMs, Magazine B: 64 shells |

**Do NOT copy CMO:**
- ❌ Specific capability coefficients (detection range formulae)
- ❌ Exact historical unit performance data
- ❌ Classified assessment matrices
- ❌ Intelligence-derived capability estimates

**DO use CMO structure:**
- ✅ Entity classification (role, domain, type hierarchy)
- ✅ Component linking (platform → sensors/weapons → mounts → magazines)
- ✅ Template inheritance (generic role defaults)
- ✅ Enrichment pattern (fill missing from catalog)

---

### Q2: What should the Middle East DB include first?

**Priority 1 (Critical Foundation):**
1. Major platform registry (common aircraft, ships, SAM systems)
2. Common sensor types (radar classes, ESM, targeting)
3. Common weapon types (missiles, guns, countermeasures)

**Priority 2 (Operational Context):**
4. Regional air defense architectures (Iran, Saudi, UAE, Israel patterns)
5. Facility types and distributions (airbases, naval bases, SAM sites)
6. Doctrine defaults (readiness posture, supply norms by nation)

**Priority 3 (Advanced):**
7. Magazine capacity curves (realistic ammo loads)
8. Readiness variation by platform/season
9. Supply variation by logistics network

---

### Q3: Which catalogs are needed?

**ESSENTIAL (Phase 1):**
- [x] **Platforms** — Aircraft, ships, SAM systems, helicopters
- [x] **Sensors** — Radar types, ESM, targeting pods
- [x] **Weapons** — Air-to-air, air-to-ground, surface-to-air, naval
- [x] **Doctrine Defaults** — Readiness/supply/doctrine_tags by nation-role

**IMPORTANT (Phase 2):**
- [ ] **Facilities** — Airbases, naval bases, SAM sites, command centers
- [ ] **Mounts** — Aircraft hardpoints, ship deck positions, vehicle attachments
- [ ] **Magazines** — Ammunition capacity curves, realistic loads

**NICE-TO-HAVE (Phase 3+):**
- [ ] **Doctrine Rules** — Specific ROE/WCL by nation
- [ ] **Supply Chains** — Logistics networks, resupply points
- [ ] **Readiness Curves** — Time-to-ready degradation models

---

### Q4: What should stay scenario-specific?

**AUTHORED IN SCENARIO (never override by DB):**
- ✅ Unit positions and formations
- ✅ Unit names and designations (e.g., "2nd Squadron, 3rd Fighter Wing")
- ✅ Unique loadouts (non-standard magazines, mixed weapons)
- ✅ Historical-specific capabilities (U-2 variant A vs variant B)
- ✅ Readiness state at scenario start
- ✅ Supply state at scenario start
- ✅ Doctrine_tags that are scenario-specific

**Can be overridden by DB (if not authored):**
- ❌ rcs_class (use DB if unit doesn't specify)
- ❌ Sensor/weapon defaults (use DB if unit has none)
- ❌ Magazine capacities (use DB if unit has none)
- ❌ Readiness/supply defaults (use DB if unit has none)

**Rule: Authored ≻ DB ≻ Generic fallback**

---

### Q5: What should be global DB data?

**GLOBAL (shared across all scenarios):**
1. **Platform specs** — F-16C characteristics don't change between scenarios
2. **Sensor classes** — "long_range_3d" radar properties are constant
3. **Weapon classes** — AIM-120C characteristics are fixed
4. **Doctrine defaults** — Iranian air defense doctrine is consistent
5. **Magazine capacities** — S-400 TEL carries 16 SAMs consistently

**SCENARIO-SPECIFIC (author in scenario JSON):**
1. Initial unit positions
2. Unit names and markings
3. Starting readiness/supply
4. Special loadouts or deviations
5. Historical accuracy requirements

---

### Q6: What fields are safe to store?

**SAFE TO STORE (public/unclassified):**
- ✅ Platform name (F-16C, S-400, Arleigh Burke)
- ✅ Platform role (fighter, SAM system, destroyer)
- ✅ Platform domain (air, ground, sea, strategic)
- ✅ Sensor type and class (multifunction radar, ESM pod)
- ✅ Weapon type and class (medium air-to-air missile)
- ✅ Approximate magazine capacity (16-32 SAMs typical)
- ✅ RCS classification (small, medium, large)
- ✅ Doctrine tags (IADS, sea_control, maneuver)
- ✅ Operational readiness default (readiness: 'ready')

**APPROXIMATE (not exact):**
- 📊 Supply default (0.7–0.9, not precise logistics consumption rates)
- 📊 Detection range brackets (long, medium, short — not km values)
- 📊 Weapon effective range brackets (not specific coefficients)

**AVOID STORING (classified/intelligence):**
- ❌ Exact RCS values (still classified in most nations)
- ❌ Precise detection range coefficients (classified)
- ❌ Real engagement success rates (classified)
- ❌ Actual unit deployment locations
- ❌ Real readiness percentages per unit
- ❌ Classified capability estimates

---

### Q7: What fields should be approximate rather than exact?

**APPROXIMATE RANGES (operationally useful, not classified):**

| Field | Approximate | NOT Exact |
|-------|------------|-----------|
| Detection range | "long_range_3d" (50-100 nm) | Not 87.3 nm |
| RCS | "medium" (5-10 m²) | Not 7.23 m² |
| Magazine capacity | "16-32 SAMs typical" | Not exact per variant |
| Detection probability | "class-based" (long_range_3d ≈ 90%) | Not 87.4% |
| Engagement probability | "weapon_class-based" | Not 73.8% |
| Supply consumption | Default 0.8 generic | Not 0.7234 for Patriot |
| Readiness default | "ready" or "limited" | Not 92% specific |

**Why approximate is safer:**
- Uses no classified data
- Still operationally meaningful (can distinguish S-400 from Patriot)
- Scales across scenarios without overfitting
- Easier to source from public specs

---

### Q8: Should the first DB be JSON or SQLite?

**RECOMMENDATION: START WITH JSON**

| Aspect | JSON | SQLite |
|--------|------|--------|
| **Offline/Private** | ✅ File in repo | ✅ File in repo |
| **Easy to extend** | ✅ Add row, save | ✅ INSERT, commit |
| **Readable in editor** | ✅ Plain text | ❌ Binary |
| **No dependencies** | ✅ Native | ❌ Needs sqlite3 lib |
| **Startup time** | ✅ Fast | ~ Same |
| **Query complexity** | ❌ Simple filtering | ✅ Join, aggregate |
| **RMOOZ precedent** | ✅ Scenario JSON | ❌ Not in codebase |

**Phase 1 (JSON):**
```json
{
  "platforms": {
    "F-16C": {
      "label": "F-16C Fighting Falcon",
      "domain": "air",
      "role": "fighter",
      "rcs_class": "medium",
      "readiness": "ready",
      "supply": 0.8,
      "sensors": [{"id": "ar", "class": "multifunction", ...}],
      "weapons": [{"id": "aim120", "class": "medium_aa_missile", ...}],
      "magazines": [{"mount": "m1", "stock": {"medium_aa_missile": 6}}]
    }
  }
}
```

**Phase 2+ (SQLite):**
- If query patterns become complex
- If DB grows beyond 1MB JSON
- If client-side filtering becomes slow

---

### Q9: How do we keep the DB offline/private?

**STORAGE STRATEGY:**
1. **JSON files in repository** (not external DB)
   - Path: `UI_MOdified/db/middle-east/platforms.json`
   - Version controlled, auditable, no external dependencies
   
2. **No cloud storage**
   - All data stored locally
   - Never synced to cloud DB
   - Never called from external API

3. **No authentication needed**
   - DB is local, offline
   - Scenario can reference, but data doesn't leave the app

4. **Code-side loading**
   - Load at app startup: `fetch('/db/middle-east/platforms.json')`
   - Cache in memory
   - Server can serve with CORS if needed

5. **No sensitive data**
   - Only public/unclassified specs
   - Safe to publish to open-source repo if desired

**Privacy guarantee:**
- ✅ Everything stored locally
- ✅ No external calls
- ✅ No authentication/tracking
- ✅ User controls when/if data leaves machine

---

### Q10: What is the smallest implementation slice?

**SMALLEST SAFE SLICE (2–4 weeks):**

**Slice A: JSON Middle East Platform Catalog** ← RECOMMENDED

**Contents:**
1. 15–20 representative Middle East platforms:
   - 5 aircraft (F-16C, F-15E, Gripen, MiG-29, Su-27)
   - 4 SAM systems (Patriot, S-400, Hawk, Tor)
   - 3 ships (frigate, destroyer, patrol boat)
   - 2 helicopters (Apache, UH-60)
   - Ground units (tank, IFV, arty battalion)

2. Sensor catalog (5–10 types)
3. Weapon catalog (8–12 types)
4. Doctrine template for each major platform
5. Magazine capacity defaults

**Data sources:**
- SIPRI (free military database)
- Jane's Fighting Ships / Aircraft (paid, but public summaries)
- Open-source military specs (AVweb, defense.gov unclassified)
- Academic papers on Middle East conflicts
- Simplified/approximate values where needed

**Files to create:**
```
UI_MOdified/db/middle-east/
├── platforms.json (main catalog)
├── sensors.json
├── weapons.json
├── facilities.json
└── doctrine-defaults.json
```

**Integration:**
- Loader function in world-state-db.js to load ME catalog
- Fallback to generic DB-Lite if ME catalog missing
- Scenario can override any field

**Effort estimate:**
- Research + data entry: 1 week
- Integration + testing: 1 week
- Validation + refinement: 1 week
- **Total: 3 weeks**

---

## CMO-Inspired Architecture (Not Copy)

### CMO Structural Inspiration

**BORROW FROM CMO:**
✅ Hierarchical classification (platform → role/domain)  
✅ Component linking (platform → sensors/weapons → mounts)  
✅ Template inheritance (role defaults → platform overrides)  
✅ Enrichment pattern (fill missing from catalog)  
✅ Magazine management (mount → stock by class)

**DO NOT COPY FROM CMO:**
❌ Proprietary performance coefficients  
❌ Exact historical unit data  
❌ Classified assessment methods  
❌ Intelligence-derived capability matrices  
❌ Specific unit deployment data  

---

## First Implementation Slice: Option Selection

### Option A: JSON Middle East Platform Catalog ← **RECOMMENDED**
- **Scope:** 15–20 representative platforms, full component hierarchy
- **Data source:** SIPRI, Jane's summaries, public specs, approximations
- **Effort:** 3 weeks (research + entry + integration)
- **Risk:** Low (public data, no dependencies)
- **Value:** Immediate — can build Middle East scenarios with realistic units
- **Next step:** Facilities catalog (Phase 2)

### Option B: Air-Defense Sensor/Weapon Catalog
- **Scope:** S-400, Patriot, Hawk, Tor — detail specs and doctrine
- **Advantage:** Deep focus on key capability area
- **Disadvantage:** Limited to one domain (narrow use)
- **Effort:** 2 weeks (fewer platforms but deeper specs)
- **Dependency:** Need platform catalog for context

### Option C: Facility/Base Catalog
- **Scope:** Airbases, naval bases, SAM sites, command centers (Middle East)
- **Advantage:** Scenario-specific locations
- **Disadvantage:** Requires platform catalog first
- **Effort:** 2–3 weeks (location data + facility types)
- **Dependency:** Need platforms to place in facilities

### Option D: Doctrine/Readiness/Supply Defaults Catalog
- **Scope:** Iran, Saudi, UAE, Israel, Egypt doctrine templates
- **Advantage:** Operational realism (nation-specific defaults)
- **Disadvantage:** Abstract — doesn't enable scenarios alone
- **Effort:** 1–2 weeks (research + template creation)
- **Dependency:** Works best after platform catalog

---

## Recommendation: Option A First

**Phase 1:** JSON Middle East Platform Catalog
- Build the foundation all other slices depend on
- Enables immediate scenario authoring with realistic units
- Low risk, public data only
- Sets pattern for Phases 2+ (facilities, doctrine, magazines)

**Phase 2:** Expand platform variants (B-52, MiG-31, etc.)
**Phase 3:** Add facilities and doctrine templates
**Phase 4:** Deepen magazine/loadout realism
**Phase 5:** (Later) Consider SQLite if query patterns demand it

---

## Architecture Blueprint: DB-1 Expansion

```
Current World-State-DB-Lite:
├── CAPABILITY_CATALOG (6 roles)
│   ├── Generic sensor defaults
│   ├── Generic weapon defaults
│   └── Generic readiness/supply defaults

Proposed DB-1 Expansion:
├── CAPABILITY_CATALOG (6 roles) [unchanged]
├── PLATFORM_REGISTRY (15–20 platforms)
│   ├── F-16C, F-15E, Gripen, MiG-29, Su-27
│   ├── Patriot, S-400, Hawk, Tor, Avenger
│   ├── Frigate, Destroyer, Patrol Boat
│   └── [helicopters, ground units]
├── SENSOR_REGISTRY (5–10 types)
│   ├── "long_range_3d" specifications
│   ├── "fire_control" specifications
│   └── "esm" specifications
├── WEAPON_REGISTRY (8–12 types)
│   ├── "medium_aa_missile" (AIM-120)
│   ├── "long_range_sam" (S-400 missile)
│   └── "medium_sam" (Patriot missile)
├── DOCTRINE_TEMPLATES (5 nations)
│   ├── Iran defaults (readiness/supply/tags)
│   ├── Saudi defaults
│   ├── UAE defaults
│   ├── Israel defaults
│   └── Egypt defaults
└── FACILITY_REGISTRY (Phase 2)
    ├── Bandar Abbas airbase
    ├── Al Dhafra air base
    └── [naval bases, SAM sites]
```

---

## Safety Checklist

Before publishing any DB catalog, verify:

- [ ] **Data source:** SIPRI, Jane's, public specs — no classified material
- [ ] **Approximate values:** Use ranges, not exact specs (no RCS m² precision)
- [ ] **No sensitive capabilities:** Don't include classified assessment methods
- [ ] **Scenario override:** Authored values always take precedence
- [ ] **Offline/private:** No external API calls, all files local
- [ ] **Readable:** Plain JSON, easy to edit and review
- [ ] **Auditable:** Git history shows what changed, why
- [ ] **Attribution:** Cite data sources (SIPRI, Jane's summary, etc.)

---

## Decision: Recommend Option A

**JSON Middle East Platform Catalog** is the strongest first slice:
- ✅ Foundation all other slices depend on
- ✅ Enables Middle East scenario authoring immediately
- ✅ Low risk (public data only)
- ✅ Sets pattern for future phases
- ✅ RMOOZ precedent (scenario JSON already works)
- ✅ 3-week effort (reasonable first phase)

**Implementation path:**
1. Research & data collection (1 week)
2. JSON structure & entry (1 week)
3. Integration & testing (1 week)

**Next phases unlock after Phase 1:**
- Phase 2: Facility/base catalog
- Phase 3: Doctrine templates
- Phase 4: Magazine/loadout realism
- Phase 5: (If needed) SQLite migration for scale

---

## Conclusion

RMOOZ can safely build a Middle East operational database using CMO only as structural inspiration. Start with a JSON platform catalog (Option A), use public data sources, store everything offline/private, and let scenario authors override any field. This approach balances operational realism with safety and simplicity.

---

**Audit completed:** 2026-06-04  
**Recommendation:** Option A — JSON Middle East Platform Catalog (Phase 1)  
**Confidence:** High (public data sources, proven approach)  
**Ready for:** Phase DB-1-A implementation planning
