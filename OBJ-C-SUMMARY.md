# OBJ-C Planning — Evidence Visibility Summary

**Status:** ✅ PLANNING COMPLETE (No Code Yet)  
**Goal:** Make objective evidence visible and actionable to operator  
**Value:** Proves evidence ledger works before adding more sources

---

## WHAT OBJ-C DELIVERS

### Problem It Solves

**Before:** Readiness evidence stored but invisible
```
Objective Alpha
Status: THREATENED
[Why? Operator can't see evidence]
```

**After:** Evidence visible and explained
```
Objective Alpha
Status: THREATENED
Evidence:
├─ Force Ratio: 2.4
├─ Blue Destroyed: 8
├─ Unit Strength Avg: 0.71
├─ Force Availability: 0.83
├─ Ammo: 1.0 (full)
└─ Supply: 0.74
```

---

## IMPLEMENTATION PLAN

### 1. UI Location

**New component:** `#objective-panel` (right sidebar)
- Mirror `#unit-panel` structure
- Shows when objective marker clicked
- Hidden when objective deselected
- Mutually exclusive with unit panel (one or other, not both)

### 2. Evidence Groups (5 Total)

| Group | Records | Status |
|---|---|---|
| Combat | 4 records | ✅ Exists (OBJ-A) |
| Readiness | 6 records | ✅ Exists (READINESS-A) |
| Control / BLS | 2 records | ✅ Exists (OBJ-A) |
| Contacts | 1 record | ✅ Exists (OBJ-A) |
| Doctrine | 0 records | 📋 Placeholder (future DOCTRINE-A) |

### 3. Display Strategy

**Each evidence record shows:**
```
Label: Value ●●● (confidence dots)
       ↑      ↑
    i18n    0.7–1.0
```

**Example:**
```
Force Ratio: 2.4 ●●●  (confidence 0.95)
Supply: 0.74 ●        (confidence 0.7)
Combat Readiness: ready ●●●
```

### 4. Data Flow

```
Operator clicks objective marker
  ↓
adjudicator-map.js fires 'rmooz:objective-selected'
  ↓
app.js receives event + fetches current step
  ↓
deriveWorldState() → applyDerivations()
  ↓
ws.derived.objective_evidence populated
  ↓
renderObjectivePanel(evidence)
  ↓
Panel appears with 5 grouped sections
```

### 5. Confidence Visualization

**Colored dots:**
- ●●● = High (≥0.9) — from direct measurement
- ●● = Medium (0.75–0.9) — inferred from units
- ● = Lower (<0.75) — fallback or authored

### 6. Empty/Fallback Handling

**Missing entire group:**
```
READINESS EVIDENCE (0 records available)
[No readiness evidence for this step]
```

**Missing individual record:**
```
Force Ratio: —
(Not available)
```

**No evidence at all:**
```
[No evidence available]
Select a different objective or step.
```

---

## SCOPE BOUNDARIES

### Included (✅ In Scope)

- Display objective_evidence from ledger
- Group into 5 categories
- Show confidence indicators
- i18n/RTL support
- Empty/fallback handling
- 48 test assertions
- Browser verification checklist

### NOT Included (❌ Out of Scope)

- Doctrine evidence implementation (placeholder only)
- New formulas (display only)
- Behavior changes to objective logic
- New evidence sources
- Readiness consumption for formulas
- AI integration
- Mutation of world state

---

## TECHNICAL DETAILS

### UI Wireframe

```
┌──────────────────────────────────┐
│ OBJECTIVE DETAIL                 │
├──────────────────────────────────┤
│ OBJ ALPHA                        │
│ Status: THREATENED               │
│ Coord: 19.78°N, 29.77°E          │
├──────────────────────────────────┤
│ ■ COMBAT EVIDENCE (4 records)    │
│   • Force Ratio: 2.4 ●●●         │
│   • Blue Destroyed: 8 ●●●        │
│   • Blue Intact: 92% ●●●         │
│   • Red Losses: 2.3 CE ●●        │
│                                  │
│ ■ READINESS (6 records)          │
│   • Unit Strength: 0.71 ●●       │
│   • Force Availability: 0.83 ... │
│   • Ammunition: 1.0 (full) ●●●   │
│   • Supply: 0.74 ●●              │
│   • Combat Readiness: ready ●●●  │
│   • Casualty Rate: 0% ●●●        │
│                                  │
│ ■ CONTROL / BLS (2 records)      │
│   • BLS Control: 2 ●●●           │
│   • BLS Contested: 1 ●●●         │
│                                  │
│ ■ CONTACTS (1 record)            │
│   • Contacts: 45 total ●●●       │
│     ├─ Firm: 12 ●●●              │
│     ├─ Probable: 20 ●●           │
│     └─ Possible: 13 ●            │
│                                  │
│ ■ DOCTRINE (placeholder)         │
│   (Not yet available)            │
│                                  │
└──────────────────────────────────┘
```

### Data Structure

```javascript
// What the panel reads:
ws.derived.objective_evidence = [
  {
    objective_id: "alpha",
    evidence_type: "force_ratio",
    value: 2.4,
    source: "balance_summary",
    confidence: 0.95,
    step_index: 5
  },
  {
    objective_id: "alpha",
    evidence_type: "unit_strength_avg",
    value: 0.71,
    source: "engagement_outcomes + balance_summary",
    confidence: 0.85,
    step_index: 5
  },
  // ... more records
]

// Group by evidence_type:
{
  combat: [force_ratio, blue_destroyed_count, ...],
  readiness: [unit_strength_avg, force_availability_ratio, ...],
  control: [bls_control_count, bls_contested_count],
  contacts: [contact_confidence_summary],
  doctrine: []
}
```

### i18n Keys

All labels use existing i18n pattern:
```json
{
  "evidence-force-ratio": "Force Ratio",
  "evidence-blue-destroyed": "Blue Units Destroyed",
  "evidence-unit-strength": "Unit Strength Average",
  ...
  "evidence-group-combat": "Combat Evidence",
  "evidence-group-readiness": "Readiness Evidence",
  ...
}
```

---

## TESTS & VERIFICATION

### Test Plan: 48 Assertions

| Category | Count | Focus |
|---|---|---|
| Grouping Logic | 6 | Evidence sorted correctly |
| Display Rendering | 10 | Values formatted correctly |
| Confidence | 5 | Dots displayed per confidence |
| Empty/Fallback | 4 | Missing data handled |
| i18n | 5 | Translation & RTL |
| Integration | 8 | Panel flow & updates |
| Regression | 5 | 100+ steps, stability |

### Browser Verification Checklist

**25 manual steps:**
```
[ ] Load app at localhost:8000/app.html
[ ] Click objective marker → panel appears
[ ] Panel shows 5 groups (Combat/Readiness/Control/Contacts/Doctrine)
[ ] Confidence dots visible
[ ] Step forward → evidence updates
[ ] Step back → evidence updates
[ ] Click unit → objective panel hidden
[ ] Click objective again → panel reappears
[ ] Switch language (AR) → translated correctly
[ ] RTL layout correct in Arabic
[ ] No console errors
[ ] No layout shifts
[ ] Performance: panel < 200ms to render
[ ] All labels readable in both languages
... (25 items total)
```

---

## VALUE & IMPACT

### Architectural Value

```
Before OBJ-C:
  Evidence stored (OBJ-A) ✅
  Evidence refactored (OBJ-B) ✅
  Evidence generated (READINESS-A) ✅
  Evidence visible ❌ ← BLOCKER
  Evidence useful ❌ ← BLOCKER

After OBJ-C:
  Evidence stored ✅
  Evidence refactored ✅
  Evidence generated ✅
  Evidence visible ✅ ← SOLVED
  Evidence useful ✅ ← SOLVED
```

### Operator Value

- **Understand objective status:** "Why is Alpha THREATENED?" → Read evidence
- **Audit trail:** Evidence explains every status change
- **Context:** Readiness metrics visible alongside combat metrics
- **Confidence:** Dots show reliability of each measurement
- **Future-proof:** Doctrine evidence can be added to same panel

### System Value

- Proves evidence architecture works (before adding DOCTRINE-A)
- Operator familiar with evidence pattern (eases future expansion)
- Parity gate intact (no behavior change, display only)
- Foundation for future OBJ-D (doctrine interpretation)

---

## NEXT STEPS

### After OBJ-C Planning Approval

1. **Implement OBJ-C** (4–6 hours)
   - Create #objective-panel component
   - Wire click event to panel render
   - Group evidence into 5 sections
   - Add confidence dots
   - i18n keys
   - 48 test assertions

2. **Browser Verify** (1 hour)
   - Manual checklist: 25 items
   - Evidence display accuracy
   - Language toggle
   - Step playback

3. **Then: Implement DOCTRINE-A** (3–5 hours)
   - 9 doctrine evidence types
   - 96 test assertions
   - Display in same panel (extend OBJ-C)

4. **Then: Future Phases** (future approval)
   - OBJ-D: Doctrine interpretation
   - WRA: Weapon release authorization
   - Targeting: Doctrine-driven priorities

---

## SUCCESS CRITERIA (All Must Pass)

✅ **Functional**
- Operator can click objective → see evidence
- All 4 groups display with correct data
- Confidence indicators accurate
- No behavior changes (display only)

✅ **Usability**
- Evidence readable and scannable
- Operator can explain objective status via evidence
- Empty/missing data handled gracefully
- Panel responsive (< 200ms)

✅ **Complete**
- 48 test assertions pass
- 25-item browser checklist pass
- All labels i18n'd
- No console errors

✅ **Ready for Expansion**
- Doctrine placeholder visible
- Panel structure allows new groups
- Next evidence sources can be added to same panel

---

**OBJ-C Planning: Complete and Ready for Approval**

