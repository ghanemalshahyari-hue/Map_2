# UI-Unit-1 Audit: Commander Unit Status Panel Design

**Date:** 2026-06-04  
**Scope:** Design a read-only Commander Unit Status Panel using data RMOOZ actually has  
**Status:** ✅ COMPLETE — All 10 audit questions answered, MVP design specified, display method documented

---

## Executive Summary

**RESULT: ✅ AUDIT COMPLETE**

RMOOZ has sufficient data to build a useful Commander Unit Status Panel (read-only). Panel should show:
- Unit identity (side, label, role, doctrine tags)
- Readiness/supply (authored + recent deltas)
- Sensors/weapons (from DB-Lite or platform catalog)
- Recent state changes (from event log)

**Recommended MVP:** Slide-out right-panel opened from unit click, showing 5 main sections (identity, readiness/supply, sensors, weapons, recent deltas).

**Display method:** Hierarchical expandable list with icon badges, milsymbol unit preview, read-only data cells.

---

## Audit Question Answers

### Q1: What data is currently available per unit?

**Answer: Rich dataset from three sources**

**Data Available Per Unit:**

| Category | Field | Source | Example |
|----------|-------|--------|---------|
| **Identity** | uid | Scenario JSON | 'R1' |
| **Identity** | label | Scenario JSON | 'RED Company' |
| **Identity** | role | Scenario JSON or DB | 'ground_maneuver' |
| **Identity** | side | Scenario JSON (implied) | 'RED' or 'BLUE' |
| **Readiness** | readiness | Authored (scenario) or event log | 'ready', 'limited', 'degraded' |
| **Supply** | supply | Authored (scenario) or event log | 0.0–1.0 |
| **Sensors** | sensor list | DB-Lite or platform catalog | Array of {id, type, class} |
| **Weapons** | weapon list | DB-Lite or platform catalog | Array of {id, type, class, quantity} |
| **Magazines** | magazines | DB-Lite or platform catalog | Array of {mount, stock} |
| **Doctrine** | doctrine_tags | Scenario or platform catalog | Array of tags |
| **Recent Changes** | deltas | Event log STATE_DELTA entries | Readiness/supply changes |
| **Position** | latitude, longitude | Map/scenario | Coordinates |
| **RCS** | rcs_class | Platform catalog or DB-Lite | 'small', 'medium', 'large' |

---

### Q2: What data is authored in scenario JSON?

**Answer: Core identity + operational state**

**Authored Fields (in scenario JSON):**

```json
{
  "uid": "R1",
  "label": "Mech Company",
  "role": "ground_maneuver",
  "side": "RED",
  "readiness": "ready",          // ← Authored readiness
  "supply": 0.75,                // ← Authored supply
  "latitude": 31.23,
  "longitude": 42.45,
  "doctrine_tags": ["maneuver", "fast_mover"]  // ← Optional
}
```

**Not Authored (Scenario doesn't specify):**
- ❌ Specific sensors (use defaults)
- ❌ Specific weapons (use defaults)
- ❌ Magazine capacities (use defaults)
- ❌ Damage state
- ❌ Ammo loads
- ❌ Fuel state
- ❌ Crew status

---

### Q3: What data comes from DB-Lite?

**Answer: Fallback defaults for missing platform specs**

**DB-Lite Provides (world-state-db.js):**

```javascript
CAPABILITY_CATALOG = {
  air_defense: {
    rcs_class: 'medium',
    readiness: 'ready',        // Fallback if not authored
    supply: 0.8,               // Fallback if not authored
    doctrine_tags: ['iads'],
    sensors: [
      { id: 'search', type: 'radar', class: '3d_surveillance' },
      { id: 'fire_control', type: 'radar', class: 'fire_control' }
    ],
    weapons: [
      { id: 'sam', type: 'missile', class: 'medium_sam', mount: 'launcher', quantity: 8 }
    ],
    magazines: [
      { mount: 'launcher', stock: { 'medium_sam': 8 } }
    ]
  },
  // ... 6 role-based templates
}
```

**Fallback Rule:**
- If unit.readiness not set → use DB-Lite default
- If unit.supply not set → use DB-Lite default
- If unit.sensors not set → use DB-Lite sensors
- If unit.weapons not set → use DB-Lite weapons

---

### Q4: What data comes from Middle East platform catalog?

**Answer: Regional platform specs with source tracking**

**ME Platform Catalog Provides (db/middle-east/platforms.json):**

```json
{
  "f16c-fighter": {
    "id": "f16c-fighter",
    "label": "F-16C Fighting Falcon",
    "domain": "air",
    "role": "fighter",
    "rcs_class": "medium",
    "readiness_default": "ready",
    "supply_default": 0.8,
    "doctrine_tags": ["air_superiority", "cas"],
    "sensors": [
      { "id": "apg68", "label": "AN/APG-68 radar", "type": "radar", "class": "multifunction" },
      { "id": "ir", "label": "IRST", "type": "ir", "class": "passive" }
    ],
    "weapons": [
      { "id": "aim120", "label": "AIM-120C", "class": "medium_aa_missile", "quantity_typical": 6 },
      { "id": "aim9", "label": "AIM-9 Sidewinder", "class": "short_aa_missile", "quantity_typical": 2 }
    ],
    "magazines": [
      { "mount": "internal", "stock": { "medium_aa_missile": 6, "short_aa_missile": 2 } }
    ],
    "confidence": "medium",
    "approximation_level": "class-based"
  }
}
```

**Enrichment Rule:**
- If unit has platform_id: use ME catalog specs
- If ME catalog missing field: fall back to DB-Lite
- Authored fields always override catalog

---

### Q5: What data comes from event log deltas?

**Answer: Recent operator decisions and state changes**

**Event Log STATE_DELTA Entries:**

```javascript
{
  severity: 'INFO',
  category: 'SYSTEM',
  payload: {
    event_type: 'STATE_DELTA',
    delta_type: 'readiness',      // or 'supply'
    unit_uid: 'R1',
    unit_label: 'RED Company',
    side: 'RED',
    value_before: 'ready',
    value_after: 'limited',
    proposal_id: 'PROP-001',
    timestamp: 1717478400
  }
}
```

**What Can Be Shown from Event Log:**
- ✅ Recent readiness changes (past N events)
- ✅ Recent supply changes (past N events)
- ✅ Which proposal caused the change (proposal_id)
- ✅ When the change was accepted (timestamp)
- ✅ Before/after values (audit trail)

**Timeline of Deltas:**
```
Step 1: R1 accepted delta: readiness ready→limited
Step 2: R1 accepted delta: supply 0.8→0.6
Step 3: R1 accepted delta: readiness limited→degraded
```

---

### Q6: What should appear in Commander Unit Status Panel MVP?

**Answer: Five main sections with read-only display**

**Section 1: Unit Identity (Always Visible)**
```
┌─────────────────────────────────┐
│ Unit Symbol [F-16C]  RED-1      │  ← Milsymbol + side/uid
│ F-16C Fighting Falcon           │  ← Label (from scenario or catalog)
│ Air / Fighter                   │  ← Domain / Role
│ Source: ME Catalog (Medium)     │  ← Provenance + confidence
└─────────────────────────────────┘
```

**Section 2: Readiness & Supply (Critical)**
```
┌─────────────────────────────────┐
│ Readiness: Ready [⬤]            │  ← Current value + icon badge
│   Authored: ready               │  ← Source (scenario)
│   Applied: ready                │  ← After recent deltas
│                                 │
│ Supply: 80% [████░░░░]          │  ← Bar chart + percentage
│   Authored: 75%                 │  ← Original value
│   Applied: 80%                  │  ← After recent deltas
└─────────────────────────────────┘
```

**Section 3: Sensors (Expandable)**
```
┌─────────────────────────────────┐
│ Sensors (2) ▼                   │  ← Expandable list
│ ├─ AN/APG-68 multifunction radar│
│ │  Search: Long-range 3D        │
│ │  Detection class: Long-range  │
│ └─ IRST infrared search/track   │
│    Class: Passive tracking      │
└─────────────────────────────────┘
```

**Section 4: Weapons & Magazines (Expandable)**
```
┌─────────────────────────────────┐
│ Weapons (3) ▼                   │  ← Expandable list
│ ├─ AIM-120C AMRAAM (6x)         │
│ │  Class: Medium air-to-air     │
│ │  Range: Long                  │
│ ├─ AIM-9 Sidewinder (2x)        │
│ │  Class: Short air-to-air      │
│ │  Range: Short                 │
│ └─ AGM-65 Maverick (2x)         │
│    Class: Air-to-ground         │
│    Range: Medium                │
│                                 │
│ Magazines ▼                     │
│ └─ Internal magazine (ready)    │
│    ├─ Medium AA: 6              │
│    ├─ Short AA: 2               │
│    └─ AG: 2                     │
└─────────────────────────────────┘
```

**Section 5: Recent Deltas (Expandable)**
```
┌─────────────────────────────────┐
│ Recent Changes (3) ▼            │  ← Event log deltas
│ ├─ Step 1: Readiness ready→limited
│ │  Proposal: PROP-001           │
│ │  Time: 041326Z                │
│ ├─ Step 2: Supply 80%→60%       │
│ │  Proposal: PROP-002           │
│ │  Time: 041327Z                │
│ └─ (Older deltas off-screen)    │
└─────────────────────────────────┘
```

---

### Q7: What must be hidden/deferred because not simulated yet?

**Answer: Anything requiring active simulation or consumption**

**Hidden (Not Shown in MVP):**
- ❌ **Damage state** — No damage model exists
- ❌ **Ammo consumption** — No consumption logic
- ❌ **Fuel state** — No fuel tracking
- ❌ **Crew status** — No personnel model
- ❌ **Readiness recovery** — No time-based recovery
- ❌ **Supply recovery** — No resupply logic
- ❌ **Movement status** — No continuous movement
- ❌ **Line-of-sight** — No LOS calculation
- ❌ **Engagement status** — No live combat state
- ❌ **Engagement probability** — No firing probability
- ❌ **Detection probability** — No detection model
- ❌ **Hiding/concealment** — No terrain/weather effects
- ❌ **Morale** — No morale system
- ❌ **Fatigue** — No fatigue tracking
- ❌ **Sensor range** — No calculated ranges
- ❌ **Weapon range** — No ballistic calcs

**Explicitly Show as "Not Available":**
- Display reason: "Not simulated in adjudication loop"
- Keep UI clean: use collapsible "Advanced" sections

---

### Q8: Should panel open from map unit click, Involved Units row click, or both?

**Answer: Both, with contextual differences**

**Opening Points:**

**Option A: Map Unit Click (Primary)**
```
User clicks unit symbol on map
         ↓
Panel opens (slide in from right)
Shows: Full unit details
Context: Spatial (what's on the map)
View: Read-only centered view
```

**Option B: Involved Units Row Click (Secondary)**
```
User clicks row in Live Involved Units table
         ↓
Panel opens or updates (same panel)
Shows: Same unit details
Context: Operational (which units are involved)
View: Read-only row-linked view
```

**Option C: Both (Recommended)**

| Trigger | Opens | Context | Panel Size |
|---------|-------|---------|-----------|
| **Map unit symbol click** | Panel (right slide) | Spatial/map | Full width |
| **Involved Units row click** | Same panel updates | Tactical/involvement | Responsive |
| **Panel close** | Returns focus to map | Clean state | Collapsed |

**Contextual Info by Trigger:**
```
From map click:
  └─ Show: Position, role, immediate doctrine context
  
From Involved Units click:
  └─ Show: Unit's involvement in current engagement
  └─ Show: Which step, which units in same engagement
```

---

### Q9: What is the safest read-only MVP?

**Answer: Display-only with zero state mutation**

**MVP Safety Principles:**

**SAFE (Read-Only):**
- ✅ Display unit data from scenario/catalog/event log
- ✅ Show readiness/supply as text + bar charts
- ✅ List sensors/weapons with class/type only (no calcs)
- ✅ Show recent deltas from event log
- ✅ Display milsymbol preview
- ✅ No edit controls

**NOT SAFE (Don't include):**
- ❌ Edit controls (could mutate)
- ❌ Input fields (could mutate)
- ❌ "Apply delta" buttons (state mutation)
- ❌ Live calculations (consumption, recovery)
- ❌ Predicted outcomes (probability)
- ❌ Hidden state (background simulation)

**MVP Data Flow (Read-Only):**
```
Scenario JSON
     ↓
Unit selected
     ↓
Panel opens
     ↓
Gather data:
  - Baseline from scenario
  - Catalog from DB-Lite/ME catalog
  - Deltas from event log
     ↓
Format for display:
  - Unit card
  - Readiness/supply with source
  - Sensors/weapons tables
  - Recent deltas list
     ↓
Render panel (read-only)
     ↓
User closes panel
```

---

### Q10: What tests are required?

**Answer: Seven test categories for read-only display**

**Test Category 1: Data Gathering (3 tests)**
- [ ] Scenario baseline data loads correctly
- [ ] DB-Lite catalog data loads on fallback
- [ ] ME platform catalog data loads with confidence tracking

**Test Category 2: Display Formatting (4 tests)**
- [ ] Readiness shows correct label (ready/limited/degraded)
- [ ] Supply shows correct percentage (0-100%)
- [ ] Sensors show correct type/class labels
- [ ] Weapons show correct type/class/quantity

**Test Category 3: Recent Deltas (3 tests)**
- [ ] Event log deltas display in correct order (newest first)
- [ ] Delta before/after values match event payload
- [ ] Proposal ID links to originating proposal

**Test Category 4: Source Attribution (2 tests)**
- [ ] Scenario-authored data shows correct source
- [ ] Catalog-derived data shows source + confidence

**Test Category 5: No State Mutation (2 tests)**
- [ ] Panel opening doesn't mutate scenario
- [ ] Panel closing doesn't mutate scenario

**Test Category 6: Milsymbol Integration (2 tests)**
- [ ] Unit symbol renders correctly with side/role
- [ ] Symbol updates match unit state (readiness affects display)

**Test Category 7: Edge Cases (4 tests)**
- [ ] Panel displays correctly with minimal authored data
- [ ] Panel displays correctly with full platform catalog data
- [ ] Panel handles units with no recent deltas
- [ ] Panel handles units with no catalog match (uses DB-Lite only)

---

## Display Method: How to Implement

### **Recommended: Right-Slide Panel**

**HTML Structure:**
```html
<aside id="unit-status-panel" class="unit-status-panel" hidden>
  <!-- Close button -->
  <header class="panel-header">
    <h2 id="panel-title">Unit Status</h2>
    <button id="panel-close" aria-label="Close">✕</button>
  </header>
  
  <!-- Panel content sections -->
  <section class="panel-section unit-identity">
    <div class="unit-symbol-preview" id="unit-symbol-preview"></div>
    <div class="unit-name" id="unit-name"></div>
    <div class="unit-classification" id="unit-class"></div>
    <div class="unit-source" id="unit-source"></div>
  </section>
  
  <section class="panel-section readiness-supply">
    <div class="readiness-row">
      <label>Readiness</label>
      <div class="readiness-display" id="readiness-current"></div>
      <div class="readiness-source" id="readiness-source"></div>
    </div>
    <div class="supply-row">
      <label>Supply</label>
      <div class="supply-bar" id="supply-bar"></div>
      <div class="supply-percentage" id="supply-pct"></div>
      <div class="supply-source" id="supply-source"></div>
    </div>
  </section>
  
  <section class="panel-section sensors">
    <h3>Sensors <span id="sensor-count"></span> <button class="expand-toggle">▼</button></h3>
    <ul class="sensor-list" id="sensor-list"></ul>
  </section>
  
  <section class="panel-section weapons">
    <h3>Weapons <span id="weapon-count"></span> <button class="expand-toggle">▼</button></h3>
    <ul class="weapon-list" id="weapon-list"></ul>
    
    <h4>Magazines</h4>
    <ul class="magazine-list" id="magazine-list"></ul>
  </section>
  
  <section class="panel-section recent-deltas">
    <h3>Recent Changes <span id="delta-count"></span> <button class="expand-toggle">▼</button></h3>
    <ul class="delta-list" id="delta-list"></ul>
  </section>
</aside>
```

**CSS Styling:**
```css
.unit-status-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100%;
  width: 400px;
  background: #f5f5f5;
  border-left: 1px solid #ccc;
  box-shadow: -2px 0 8px rgba(0,0,0,0.15);
  z-index: 1000;
  overflow-y: auto;
  animation: slideIn 0.3s ease-out;
}

.unit-symbol-preview {
  width: 80px;
  height: 80px;
  background: #fff;
  border: 1px solid #999;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

.readiness-display {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-weight: bold;
}

.readiness-display.ready { background: #90EE90; }
.readiness-display.limited { background: #FFD700; }
.readiness-display.degraded { background: #FF6B6B; }

.supply-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin: 0.5rem 0;
}

.supply-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #45a049);
  transition: width 0.3s ease;
}

.panel-section {
  padding: 1rem;
  border-bottom: 1px solid #ddd;
}

.sensor-list, .weapon-list, .magazine-list, .delta-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0 0;
}

.sensor-list li, .weapon-list li, .magazine-list li, .delta-list li {
  padding: 0.5rem;
  background: #fff;
  margin: 0.25rem 0;
  border-radius: 4px;
  border-left: 3px solid #2196F3;
  font-size: 0.9rem;
}

.expand-toggle {
  float: right;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
}

.expand-toggle.collapsed { transform: rotate(-90deg); }
```

### **Integration with Milsymbol Units**

**Milsymbol Unit Symbol:**
```javascript
// In units-map.js or similar
function renderUnitSymbol(unit) {
  const ms = new ms.Symbol(
    unit.sidc || computeSIDC(unit),
    { size: 35, ... }
  );
  
  // Add click handler
  ms.getCanvas().addEventListener('click', (e) => {
    e.stopPropagation();
    openUnitStatusPanel(unit);
  });
  
  return ms;
}

// Open status panel on click
function openUnitStatusPanel(unit) {
  const panel = document.getElementById('unit-status-panel');
  const backdrop = document.getElementById('panel-backdrop');
  
  // Populate panel with unit data
  populateUnitStatusPanel(unit);
  
  // Show panel with animation
  panel.removeAttribute('hidden');
  backdrop.removeAttribute('hidden');
  panel.classList.add('active');
}

// Populate panel sections
function populateUnitStatusPanel(unit) {
  // 1. Unit identity
  renderUnitSymbol(unit);  // Render milsymbol preview
  setTextContent('unit-name', `${unit.label} (${unit.uid})`);
  setTextContent('unit-class', `${unit.domain} / ${unit.role}`);
  
  // 2. Get applied state (with deltas)
  const appliedState = getAppliedState(unit);
  const readinessLabel = formatReadinessLabel(appliedState.readiness);
  setTextContent('readiness-current', readinessLabel);
  setTextContent('readiness-source', `Source: ${getReadinessSource(unit)}`);
  
  // 3. Supply bar chart
  renderSupplyBar(appliedState.supply);
  
  // 4. Sensors from catalog
  const sensors = getSensorsForUnit(unit);
  renderSensorList(sensors);
  
  // 5. Weapons from catalog
  const weapons = getWeaponsForUnit(unit);
  renderWeaponList(weapons);
  
  // 6. Recent deltas from event log
  const deltas = getRecentDeltasForUnit(unit);
  renderDeltaList(deltas);
}

// Helper: Get applied state (baseline + recent deltas)
function getAppliedState(unit) {
  const baseline = {
    readiness: unit.readiness || 'ready',
    supply: unit.supply || 0.8
  };
  
  // Get recent deltas from event log
  const deltas = window.AppShellEventLog?.getRows()
    .filter(e => e.payload?.unit_uid === unit.uid && 
                 e.payload?.event_type === 'STATE_DELTA')
    .reverse()
    .slice(0, 1) || [];
  
  // Apply most recent delta
  if (deltas.length > 0) {
    const latest = deltas[0];
    if (latest.payload.delta_type === 'readiness') {
      baseline.readiness = latest.payload.value_after;
    } else if (latest.payload.delta_type === 'supply') {
      baseline.supply = latest.payload.value_after;
    }
  }
  
  return baseline;
}

// Helper: Render readiness with icon badge
function formatReadinessLabel(readiness) {
  const icons = {
    'ready': '⬤ Ready',
    'limited': '⚠ Limited',
    'degraded': '✕ Degraded'
  };
  return icons[readiness] || readiness;
}

// Helper: Render supply bar chart
function renderSupplyBar(supply) {
  const pct = Math.round(supply * 100);
  const bar = document.getElementById('supply-bar');
  const fill = document.createElement('div');
  fill.className = 'supply-fill';
  fill.style.width = `${pct}%`;
  bar.replaceChildren(fill);
  
  document.getElementById('supply-pct').textContent = `${pct}%`;
}

// Helper: Get sensors for unit (from catalog or DB-Lite)
function getSensorsForUnit(unit) {
  // Check ME catalog first
  if (unit.platform_id) {
    const platform = window.AppMiddleEastPlatformLoader?.getPlatform(unit.platform_id);
    if (platform?.sensors) return platform.sensors;
  }
  
  // Fall back to DB-Lite based on role
  const dbRole = window.AppShellWorldStateDB?.classifyKind(unit);
  const dbCatalog = window.AppShellWorldStateDB?.CAPABILITY_CATALOG?.[dbRole];
  return dbCatalog?.sensors || [];
}

// Helper: Get weapons for unit (from catalog or DB-Lite)
function getWeaponsForUnit(unit) {
  if (unit.platform_id) {
    const platform = window.AppMiddleEastPlatformLoader?.getPlatform(unit.platform_id);
    if (platform?.weapons) return platform.weapons;
  }
  
  const dbRole = window.AppShellWorldStateDB?.classifyKind(unit);
  const dbCatalog = window.AppShellWorldStateDB?.CAPABILITY_CATALOG?.[dbRole];
  return dbCatalog?.weapons || [];
}

// Helper: Get recent deltas from event log
function getRecentDeltasForUnit(unit) {
  return window.AppShellEventLog?.getRows()
    .filter(e => e.payload?.unit_uid === unit.uid && 
                 e.payload?.event_type === 'STATE_DELTA')
    .reverse()
    .slice(0, 5) || [];  // Show last 5 deltas
}

// Helper: Render sensor list
function renderSensorList(sensors) {
  const list = document.getElementById('sensor-list');
  list.replaceChildren();
  document.getElementById('sensor-count').textContent = `(${sensors.length})`;
  
  sensors.forEach(sensor => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${sensor.label || sensor.id}</strong>
      <div style="font-size: 0.85rem; color: #666;">
        Type: ${sensor.type} • Class: ${sensor.class}
      </div>
    `;
    list.appendChild(li);
  });
}

// Helper: Render weapon list
function renderWeaponList(weapons) {
  const list = document.getElementById('weapon-list');
  list.replaceChildren();
  document.getElementById('weapon-count').textContent = `(${weapons.length})`;
  
  weapons.forEach(weapon => {
    const li = document.createElement('li');
    const qty = weapon.quantity_typical || weapon.quantity || '';
    li.innerHTML = `
      <strong>${weapon.label || weapon.id} ${qty ? `(${qty}x)` : ''}</strong>
      <div style="font-size: 0.85rem; color: #666;">
        Class: ${weapon.class} • Range: ${weapon.range_class || 'N/A'}
      </div>
    `;
    list.appendChild(li);
  });
}

// Helper: Render recent deltas list
function renderDeltaList(deltas) {
  const list = document.getElementById('delta-list');
  list.replaceChildren();
  document.getElementById('delta-count').textContent = `(${deltas.length})`;
  
  deltas.forEach(delta => {
    const li = document.createElement('li');
    const deltaType = delta.payload.delta_type;
    const before = delta.payload.value_before;
    const after = delta.payload.value_after;
    
    li.innerHTML = `
      <strong>${deltaType === 'readiness' ? 'Readiness' : 'Supply'}</strong>
      <div style="font-size: 0.85rem;">
        ${before} → ${after}
      </div>
      <div style="font-size: 0.75rem; color: #999;">
        Proposal: ${delta.payload.proposal_id || 'N/A'}
      </div>
    `;
    list.appendChild(li);
  });
}

// Close panel on button click
document.getElementById('panel-close').addEventListener('click', closeUnitStatusPanel);

function closeUnitStatusPanel() {
  const panel = document.getElementById('unit-status-panel');
  const backdrop = document.getElementById('panel-backdrop');
  panel.setAttribute('hidden', '');
  backdrop.setAttribute('hidden', '');
  panel.classList.remove('active');
}
```

---

## MVP Sections Specification

### **Section 1: Unit Identity (Always Expanded)**
- Unit symbol preview (milsymbol 80x80px)
- Label (from scenario)
- Domain / Role (from scenario or catalog)
- Source attribution (DB-Lite / ME Catalog with confidence)

### **Section 2: Readiness & Supply (Always Expanded)**
- **Readiness display:**
  - Current status with icon badge (⬤ Ready, ⚠ Limited, ✕ Degraded)
  - Source: "Authored" or "Applied (Step N)"
  - No edit controls
  
- **Supply display:**
  - Percentage + bar chart (0-100%)
  - Color gradient (green→yellow→red)
  - Source: "Authored" or "Applied (Step N)"

### **Section 3: Sensors (Expandable)**
- Count badge (number of sensors)
- List of sensors:
  - Label or ID
  - Type (radar, IR, visual, etc.)
  - Class (multifunction, fire_control, etc.)
- Expandable/collapsible

### **Section 4: Weapons & Magazines (Expandable)**
- **Weapons:**
  - Count badge
  - List: Label, Type, Class, Typical Quantity
  - Range class (short/medium/long)
  
- **Magazines:**
  - List of magazine mounts
  - Stock by weapon class
  - No edit/modify capability

### **Section 5: Recent Deltas (Expandable)**
- Count badge (last N deltas)
- Timeline of recent state changes:
  - Delta type (readiness/supply)
  - Before → After values
  - Proposal ID reference
  - Timestamp
- Limit to last 5 deltas

---

## Recommended Next Implementation Slice

### **Phase UI-Unit-1-A: Static Panel Framework**

**Scope:**
- [ ] Slide-in panel HTML/CSS structure
- [ ] Open from unit click (map integration)
- [ ] Populate with scenario data only (no catalog yet)
- [ ] Display readiness/supply from baseline
- [ ] No interactivity beyond open/close

**Files to Create:**
- `UI_MOdified/client/shell/unit-status-panel.js` (module)
- `UI_MOdified/client/style/unit-status-panel.css` (styles)

**Files to Modify:**
- `UI_MOdified/client/app.html` (add panel HTML)
- `UI_MOdified/client/shell/units-map.js` (add click handler)
- `UI_MOdified/client/shell/map-engine.js` (integrate panel open)

**Tests:**
- Panel opens on unit click
- Panel shows correct unit data
- Panel closes cleanly
- Baseline data displayed correctly

---

## Conclusion

**MVP is safe and feasible.** RMOOZ has sufficient data (scenario + DB-Lite + event log) to build a read-only Commander Unit Status Panel. Panel should show:
- ✅ Unit identity with milsymbol preview
- ✅ Readiness/supply with source attribution
- ✅ Sensors/weapons from catalog (with fallback)
- ✅ Recent deltas from event log
- ✅ No edit controls or mutations

**Display method:** Right-slide panel opened from unit click, integrated with milsymbol unit symbols.

**Next slice:** Phase UI-Unit-1-A (static panel with scenario data only).

---

**Audit completed:** 2026-06-04  
**Document:** docs/ui/unit-status/ui-unit-1-commander-unit-status-panel-audit.md (850+ lines)  
**Status:** Ready for implementation planning  
**Risk:** Very low (read-only display)  
**Data sources:** Scenario + DB-Lite + ME Catalog + Event Log

