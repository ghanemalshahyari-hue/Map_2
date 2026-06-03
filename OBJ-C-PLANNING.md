# OBJ-C Planning — Evidence Visibility

**Date:** 2026-06-03  
**Scope:** Make objective evidence visible and useful to the operator (planning only, no code)  
**Goal:** Display objective_evidence ledger contents in UI, grouped by evidence type

---

## 0. IMPLEMENTATION BOUNDARIES (STRICT)

### OBJ-C Is: Display Layer Only

✅ **ALLOWED:**
- Show evidence records grouped by type
- Display evidence values and confidence indicators
- Sort/arrange evidence visually
- Show sources (where evidence came from)
- Explain thresholds (e.g., "< 2 to block CAPTURED")
- Add System Evidence debug group (collapsible)
- Enable operator to understand WHY a status is set

❌ **FORBIDDEN:**
- Score or weight evidence
- Rank evidence by importance
- Change objective_status_display output
- Recommend actions
- Explain doctrine (that's OBJ-D+)
- New formulas or calculations
- Consumption of evidence for simulation logic
- Mutation of world state

### Pattern Enforced

```
Evidence Source (READINESS-A, DOCTRINE-A, etc.)
  ↓ generates evidence
Visibility (OBJ-C) — THIS LAYER
  ↓ displays evidence
Consumption (OBJ-D+) — FUTURE
  ↓ interprets evidence for simulation
```

OBJ-C stops at visibility. It does NOT consume.

---

## 1. UI LOCATION & LAYOUT

### Primary Location: New Objective Detail Panel

**Create:** `#objective-panel` — A read-only detail panel that appears when operator clicks on objective marker on map.

**Layout Pattern:** Mirror `#unit-panel` structure
- Header: Objective name, status, location
- Body: Grouped evidence sections
- Empty state: "Click an objective on the map to view evidence"

**Placement:** Right sidebar (same region as `#unit-panel`)
- When objective selected: Show objective-panel
- When unit selected: Show unit-panel (one or the other, not both)
- When nothing selected: Show context-panel (original default)

### UI Wireframe

```
┌─────────────────────────────────────┐
│  OBJECTIVE DETAIL                   │
├─────────────────────────────────────┤
│  OBJ ALPHA                          │
│  Status: THREATENED                 │
│  Coord: 19.78°N, 29.77°E            │
│  (1 step selected)                  │
├─────────────────────────────────────┤
│  ■ COMBAT EVIDENCE (4 records)      │
│    • Force Ratio: 2.4 ●●● (0.95)   │
│    • Blue Destroyed: 8 ●●● (1.0)   │
│    • Blue Intact: 92% ●●● (1.0)    │
│    • Red Losses: 2.3 CE ●● (0.9)   │
│                                     │
│  ■ READINESS EVIDENCE (6 records)   │
│    • Unit Strength Avg: 0.71 ●● ... │
│    • Force Availability: 0.83 ...   │
│    • Ammunition: 1.0 (full) ...     │
│    • Supply: 0.74 ●● (0.7) ...      │
│    • Combat Readiness: ready ...    │
│    • Casualty Rate: 0% ...          │
│                                     │
│  ■ CONTROL / BLS (2 records)        │
│    • BLS Control: 2 ●●● ...         │
│    • BLS Contested: 1 ●●● ...       │
│                                     │
│  ■ CONTACTS (1 record)              │
│    • Contact Summary: 45 total ...  │
│      ├─ Firm: 12 ●●●              │
│      ├─ Probable: 20 ●●           │
│      └─ Possible: 13 ●            │
│                                     │
│  ■ DOCTRINE (placeholder)           │
│    (Doctrine evidence not yet        │
│     available; future layer)        │
│                                     │
└─────────────────────────────────────┘
```

---

## 2. DATA FLOW

### From Ledger to UI

```
Step 1: Operator clicks objective marker on map
  ↓
Step 2: adjudicator-map.js fires 'rmooz:objective-selected' event
  ↓
Step 3: app.js receives event
  ↓
Step 4: Fetch ws.derived.objective_evidence from current world state
  ↓
Step 5: Group records by evidence_type
  ↓
Step 6: Render objective-panel with grouped evidence
  ↓
Step 7: Show in right sidebar (hide unit-panel if visible)
```

### Data Source

**Read from:** `ws.derived.objective_evidence` (OBJ-A ledger)

**What's available:**
- Array of 15–20 evidence records (after READINESS-A)
- Each record: `{ objective_id, evidence_type, value, source, confidence, step_index }`

**When available:**
- After `applyDerivations(ws)` runs in world state engine
- Guaranteed non-null if objective exists (fallback to empty if degraded)

### Event Flow

```javascript
// Map click
adjudicator-map.js:
  L.marker.on('click', (e) => {
    window.dispatchEvent(new CustomEvent('rmooz:objective-selected', {
      detail: { objective_id, step_index }
    }));
  });

// App receives & renders
app.js:
  window.addEventListener('rmooz:objective-selected', (e) => {
    const ws = deriveWorldState(scenario, e.detail.step_index);
    const evidence = ws.derived.objective_evidence;
    renderObjectivePanel(e.detail.objective_id, evidence);
  });
```

---

## 3. EVIDENCE GROUPING STRATEGY

### Six Groups (In Order)

**Group 1: COMBAT EVIDENCE** (Existing OBJ-A)
- force_ratio
- blue_destroyed_count
- blue_intact_ratio
- red_company_equivalent

**Group 2: READINESS EVIDENCE** (READINESS-A)
- unit_strength_avg
- force_availability_ratio
- ammunition_sustainability
- supply_sustainability
- combat_readiness_state
- casualty_rate

**Group 3: CONTROL / BLS EVIDENCE** (OBJ-A)
- bls_control_count
- bls_contested_count

**Group 4: CONTACTS EVIDENCE** (OBJ-A)
- contact_confidence_summary

**Group 5: DOCTRINE EVIDENCE** (Placeholder, DOCTRINE-A Future)
- (Not yet implemented)
- Show placeholder card: "Doctrine evidence not yet available"

**Group 6: SYSTEM EVIDENCE** (Hidden by Default, Debugging)
- evidence_record_count (total records in ledger)
- last_derivation_step (step index of last computation)
- confidence_average (avg confidence across all records)
- ledger_complete (boolean: all sources populated)
- degraded_scenario (boolean: fallback mode active)

**Note:** System Evidence is shown in a collapsible "Debug Info" section, useful for troubleshooting doctrine/logistics/AI evidence but not part of the primary operator display.

### Grouping Logic

```javascript
function groupEvidenceByType(evidenceArray) {
  return {
    combat: [
      'force_ratio',
      'blue_destroyed_count',
      'blue_intact_ratio',
      'red_company_equivalent'
    ],
    readiness: [
      'unit_strength_avg',
      'force_availability_ratio',
      'ammunition_sustainability',
      'supply_sustainability',
      'combat_readiness_state',
      'casualty_rate'
    ],
    control: [
      'bls_control_count',
      'bls_contested_count'
    ],
    contacts: [
      'contact_confidence_summary'
    ],
    doctrine: [
      // placeholder; no types yet
    ]
  };
}
```

---

## 4. DISPLAY LABELS & FORMATTING

### Evidence Type Labels (i18n Keys)

| evidence_type | English Label | AR i18n Key | Display Pattern |
|---|---|---|---|
| **force_ratio** | Force Ratio | `evidence-force-ratio` | Value (threshold < 2) |
| **blue_destroyed_count** | Blue Destroyed | `evidence-blue-destroyed` | Value + count (threshold > 25%) |
| **blue_intact_ratio** | Blue Intact | `evidence-blue-intact` | Percentage (threshold > 75%) |
| **red_company_equivalent** | Red Losses (CE) | `evidence-red-losses` | Value + unit (threshold > 6) |
| **unit_strength_avg** | Unit Strength Avg | `evidence-unit-strength` | Decimal 0–1 + bar |
| **force_availability_ratio** | Force Availability | `evidence-force-avail` | Percentage + bar |
| **ammunition_sustainability** | Ammunition | `evidence-ammo` | Percentage + bar + (full/low/empty) |
| **supply_sustainability** | Supply Status | `evidence-supply` | Percentage + bar |
| **combat_readiness_state** | Combat Readiness | `evidence-readiness` | Enum (ready/limited/not_ready) |
| **casualty_rate** | Casualty Rate | `evidence-casualty` | Percentage + bar |
| **bls_control_count** | BLS Control | `evidence-bls-control` | Count |
| **bls_contested_count** | BLS Contested | `evidence-bls-contested` | Count |
| **contact_confidence_summary** | Contacts | `evidence-contacts` | Grouped by confidence level |
| engagement_outcomes_total | Engagements | `evidence-engagements` | Count |
| engagement_effectiveness_ratio | Engagement Success | `evidence-engagement-success` | Percentage |

### Display Format Examples

```
Combat Evidence:
  Force Ratio: 2.4
    (threshold: < 2 to block CAPTURED)
  
  Blue Destroyed: 8
    (8 units lost; threshold: > 25% to block CAPTURED)
  
  Blue Intact: 92%
    (92% of force still active)
  
  Red Losses: 2.3 CE
    (company-equivalent; threshold: > 6 to block CAPTURED)

Readiness Evidence:
  Unit Strength Avg: 0.71
    (71% average operational capability)
  
  Force Availability: 83%
    (83% of units still active, not destroyed)
  
  Ammunition: 1.0 (full)
    (100% magazine estimate, zero consumed)
  
  Supply: 74%
    (average supply across force)
  
  Combat Readiness: ready
    (majority of units are ready)
  
  Casualty Rate: 0%
    (no units lost yet)

Control / BLS:
  BLS Control: 2
    (2 BLS points secured/controlled)
  
  BLS Contested: 1
    (1 BLS point contested)

Contacts:
  Contacts: 45 total
    Firm: 12
    Probable: 20
    Possible: 13
```

---

## 5. CONFIDENCE DISPLAY

### Visual Indicator: Confidence Bars

**Three approaches (pick one):**

**Option A: Colored Dots (Simple)**
```
Force Ratio: 2.4 ●●●  (0.95 confidence)
Blue Destroyed: 8 ●●●  (1.0 confidence)
Unit Strength: 0.71 ●●  (0.85 confidence)
Supply: 0.74 ●        (0.7 confidence)
```
- 1 dot = 0.6–0.75 confidence
- 2 dots = 0.75–0.9 confidence
- 3 dots = 0.9–1.0 confidence

**Option B: Percentage & Tooltip (Detailed)**
```
Force Ratio: 2.4
  Confidence: 95% [ⓘ]
  (Tooltip on hover: "From balance_summary; high reliability")
```

**Option C: Subtle Background (Minimalist)**
```
Force Ratio: 2.4        ← High confidence (dark background)
Supply: 0.74            ← Lower confidence (lighter background)
```

**Recommendation:** Option A (colored dots) — matches existing density, easy to scan.

### Confidence Thresholds

```
confidence >= 0.9  ●●●  High reliability
0.75 <= confidence < 0.9  ●●   Medium reliability
confidence < 0.75  ●   Lower reliability / inferred / fallback
```

### Tooltip/Help Text

Hover over confidence indicator shows:
```
"High confidence: from direct measurement (balance_summary)"
vs.
"Medium confidence: inferred from unit states (readiness_avg)"
vs.
"Lower confidence: fallback or authored value"
```

---

## 6. EMPTY & FALLBACK HANDLING

### Missing Evidence Records

**If entire group empty:**
```
READINESS EVIDENCE (0 records available)
  [No readiness evidence available for this step]
  (Data is missing; may be from prior to READINESS-A implementation)
```

**If individual record null:**
```
Force Ratio: —
  (Not available for this step)
```

**If objective has no evidence:**
```
OBJECTIVE SELECTED
Status: DORMANT

[No evidence available]
This objective was not evaluated at this step.
Select a different step or objective.
```

### Fallback Rendering

```javascript
function renderEvidenceGroup(group, records) {
  if (!records || records.length === 0) {
    return `<p class="no-evidence">${i18n.get('evidence-group-empty')}</p>`;
  }
  
  return records.map(r => renderRecord(r)).join('');
}
```

### Degraded Scenario Handling

If `ws.degraded === true` (W3 fallback):
```
[Evidence ledger unavailable]
Using fallback objective status from scenario state.
Full evidence not available in this scenario variant.
```

---

## 7. ARABIC / ENGLISH LABEL STRATEGY

### i18n Keys Pattern

**Naming:** `evidence-{type}-{variant}`

Example:
```json
{
  "en": {
    "evidence-force-ratio": "Force Ratio",
    "evidence-force-ratio-unit": "(threshold < 2 to block CAPTURED)",
    "evidence-blue-destroyed": "Blue Units Destroyed",
    "evidence-blue-destroyed-unit": "units",
    
    "evidence-group-combat": "Combat Evidence",
    "evidence-group-readiness": "Readiness Evidence",
    "evidence-group-control": "Control / BLS",
    "evidence-group-contacts": "Contacts",
    "evidence-group-doctrine": "Doctrine",
    
    "evidence-group-empty": "No evidence available",
    "evidence-confidence": "Confidence"
  },
  "ar": {
    "evidence-force-ratio": "نسبة القوة",
    "evidence-force-ratio-unit": "(العتبة < 2 لحظر الاستيلاء)",
    "evidence-blue-destroyed": "الوحدات الزرقاء المدمرة",
    "evidence-blue-destroyed-unit": "وحدات",
    ...
  }
}
```

### RTL Display Handling

**All evidence panel is RTL-aware:**
- Numbers and units right-aligned in Arabic (LTR numbers with `dir="ltr"`)
- Threshold symbols (< > =) work in both directions
- Percent signs positioned correctly per language
- Tooltip text left/right positioned based on dir attribute

**Example HTML:**
```html
<div class="evidence-record" lang="ar" dir="rtl">
  <dt>نسبة القوة</dt>
  <dd>
    <span class="value" dir="ltr">2.4</span>
    <span class="unit"></span>
    <span class="confidence">●●●</span>
  </dd>
</div>
```

---

## 8. TEST PLAN

### Unit Tests (30 Assertions)

**Grouping Logic (6 assertions)**
```
✓ Combat records grouped correctly (4 types)
✓ Readiness records grouped correctly (6 types)
✓ Control records grouped correctly (2 types)
✓ Contacts grouped correctly (1 type)
✓ Empty group handled (no records = empty array)
✓ Unknown type excluded (not displayed)
```

**Display Rendering (10 assertions)**
```
✓ Objective header renders: name, status, coord
✓ Force Ratio displayed with threshold
✓ Blue Destroyed displayed with unit count
✓ Unit Strength Avg normalized (0.0–1.0)
✓ Force Availability as percentage
✓ Ammunition display shows state (full/partial/empty)
✓ Supply displayed as percentage
✓ Combat Readiness enum correct
✓ Casualty Rate displayed as percentage
✓ BLS Control count displayed
```

**Confidence Rendering (5 assertions)**
```
✓ Confidence >= 0.9 shows ●●●
✓ Confidence 0.75–0.9 shows ●●
✓ Confidence < 0.75 shows ●
✓ Tooltip text accurate
✓ Missing confidence handled (fallback to ●)
```

**Empty/Fallback (4 assertions)**
```
✓ Empty group shows "No evidence available"
✓ Null value displays "—"
✓ Degraded scenario shows fallback message
✓ No evidence at all shows "Select an objective"
```

**i18n (5 assertions)**
```
✓ All evidence labels translated (EN)
✓ All evidence labels translated (AR)
✓ Numbers display with correct locale
✓ Thresholds translate correctly
✓ RTL layout correct for AR
```

### Integration Tests (8 Assertions)

```
✓ Click objective → panel appears
✓ Click unit → objective panel hidden
✓ Select different step → evidence updates
✓ Back to main map → panel hidden
✓ No parity gate needed (display only)
✓ no mutation of world state
✓ Data flow: marker click → panel render is < 200ms
✓ Evidence matches ledger values exactly
```

### Regression Tests (5 Assertions)

```
✓ 100+ scenario steps (steps 0–7): panel renders at each step
✓ Evidence values change when step changes
✓ Confidence values stable across steps
✓ No script errors in console
✓ No CSS layout shifts (repaint only)
```

### Total Test Assertions: 48
- 30 unit tests
- 8 integration tests
- 5 regression tests
- 5 i18n tests

---

## 9. BROWSER VERIFICATION

### Manual Test Checklist

**Step 1: Load & Navigate**
```
[ ] App loads at http://localhost:8000/app.html
[ ] Scenario (W3) loads and playback ready
[ ] Objective markers visible on map (colored by status)
```

**Step 2: Open Objective Panel**
```
[ ] Click objective marker (OBJ NASSER)
[ ] Right panel appears with objective detail
[ ] Panel shows: name, status, coordinate
[ ] Panel shows: "Click to see evidence"
```

**Step 3: Evidence Display**
```
[ ] Combat Evidence section appears
    [ ] Force Ratio: 2.4 ●●●
    [ ] Blue Destroyed: 8 ●●●
    [ ] Blue Intact: 92% ●●●
    [ ] Red Losses: 2.3 CE ●●
    
[ ] Readiness Evidence section appears
    [ ] Unit Strength Avg: 0.71 ●●
    [ ] Force Availability: 0.83 ●●●
    [ ] Ammunition: 1.0 (full) ●●●
    [ ] Supply: 0.74 ●●
    [ ] Combat Readiness: ready ●●●
    [ ] Casualty Rate: 0% ●●●
    
[ ] Control / BLS section appears
    [ ] BLS Control: 2
    [ ] BLS Contested: 1
    
[ ] Contacts section appears
    [ ] Contacts: 45 total
    [ ] Breakdown: Firm/Probable/Possible
    
[ ] Doctrine placeholder appears
    [ ] "Doctrine evidence not yet available"
```

**Step 4: Playback**
```
[ ] Step forward (next step)
[ ] Evidence updates to step 6 values
[ ] Confidence icons stable
```

**Step 5: Language Toggle**
```
[ ] Switch to Arabic (if implemented)
[ ] All labels translated
[ ] RTL layout correct
[ ] Numbers still LTR
[ ] Panel readable in both languages
```

**Step 6: Edge Cases**
```
[ ] Click unit instead → objective panel hidden, unit panel shown
[ ] Click nothing → objective panel hidden
[ ] Select step before READINESS-A → readiness section empty
[ ] Select degraded scenario → fallback message shown
```

---

## 10. SUCCESS CRITERIA

### Functional (All Must Pass)

✅ **Evidence Visible**
- Operator can click objective → see evidence ledger
- All 4 groups (Combat, Readiness, Control, Contacts) display
- Doctrine placeholder visible (not yet implemented)

✅ **Data Accurate**
- Evidence values match ws.derived.objective_evidence exactly
- Confidence indicators match confidence field (0.7–1.0)
- Evidence updates when step changes

✅ **No Behavior Changes**
- objective_status_display output identical (display only)
- No new formulas
- No new evidence sources
- Parity gate intact (if ledger missing, fallback works)

✅ **Usability**
- Panel opens in < 200ms
- Evidence readable and scannable (grouped, labeled, clear)
- Operator can explain objective status by reading evidence
- Empty/missing evidence handled gracefully

✅ **i18n Complete**
- All labels translated (EN + AR)
- RTL layout correct
- No hardcoded English text in panel

### Performance (All Must Pass)

✅ **No Layout Shift**
- Panel render < 200ms
- No reflow/repaint cascade
- Confidence dots load instantly

✅ **No Memory Leak**
- Close panel → no dangling listeners
- Switch steps → old evidence released
- No cumulative growth in memory

### Coverage (All Must Pass)

✅ **Test Suite: 48 Assertions**
- 30 unit tests (grouping, rendering, confidence, i18n)
- 8 integration tests (flow, parity, updates)
- 5 regression tests (100+ steps, edge cases)
- 5 i18n tests (translation, RTL)

✅ **Browser Verification**
- Manual checklist: 25 items
- Step forward/back: evidence updates
- Language toggle: readable in both

---

## 11. IMPLEMENTATION READINESS

### Preconditions (All Met)

✅ objective_evidence ledger exists (OBJ-A)  
✅ Readiness evidence generated (READINESS-A)  
✅ Unit panel pattern exists (reference for objective panel)  
✅ i18n system in place (pattern to follow)  
✅ Map click handlers available (event dispatch)

### What's NOT Included

❌ Doctrine evidence (placeholder only, DOCTRINE-A future)  
❌ New formulas (display only)  
❌ Behavior changes (read-only panel)  
❌ AI integration (not in scope)  
❌ Readiness consumption for formulas (display only, no behavior change)

### What's Included

✅ New objective-panel UI component  
✅ Evidence grouping (5 groups)  
✅ Confidence visualization (colored dots)  
✅ i18n/RTL support  
✅ 48 test assertions  
✅ Browser verification checklist  

---

## 12. VALUE DELIVERED

**Before OBJ-C:**
```
Objective Alpha
Status: THREATENED
[No explanation; operator can't see evidence]
```

**After OBJ-C:**
```
Objective Alpha
Status: THREATENED
Evidence:
├─ Combat: Force Ratio 2.4, Blue Destroyed 8, ...
├─ Readiness: Strength 0.71, Availability 0.83, Ammo full, ...
├─ Control: 2 BLS secured, 1 contested
├─ Contacts: 45 targets (12 firm, 20 probable, 13 possible)
└─ Doctrine: [placeholder]
```

**Outcome:**
- ✅ Operator understands WHY status is THREATENED
- ✅ Evidence system proven useful
- ✅ Ready to add DOCTRINE-A and future sources
- ✅ Audit trail: "Why did objective change?" → Read evidence

---

**OBJ-C Planning: Evidence Visibility & Audit Trail — Complete**

