# OBJ-C Implementation — APPROVED

**Date:** 2026-06-03  
**Status:** ✅ APPROVED FOR IMPLEMENTATION  
**Scope:** Display Layer Only (Strict Boundaries)  
**Timeline:** 4–6 hours

---

## IMPLEMENTATION SCOPE (LOCKED)

### ✅ ALLOWED — Display Layer

**Core Display:**
- Show objective_evidence ledger records grouped by type
- Display evidence values with confidence indicators
- Show sources (balance_summary, engagement_outcomes, etc.)
- Explain thresholds (e.g., "Force Ratio < 2 blocks CAPTURED")
- Add collapsible System Evidence debug group

**UI Components:**
- New `#objective-panel` in right sidebar
- 6 evidence groups (Combat/Readiness/Control/Contacts/Doctrine/System)
- Confidence dots (●●● / ●● / ●)
- i18n/RTL support (English + Arabic)
- Empty/fallback handling

### ❌ FORBIDDEN — Interpretation Layer

**DO NOT:**
- Score or weight evidence
- Rank evidence by importance
- Change objective_status_display output
- Add new formulas or thresholds
- Recommend actions to operator
- Explain doctrine (that's OBJ-D)
- Consume evidence for simulation logic
- Mutate world state

---

## IMPLEMENTATION DETAILS

### Six Evidence Groups

| Group | Purpose | Records | Status |
|---|---|---|---|
| **Combat** | Force balance metrics | 4 | ✅ Exists (OBJ-A) |
| **Readiness** | Unit operational state | 6 | ✅ Exists (READINESS-A) |
| **Control** | Objective control status | 2 | ✅ Exists (OBJ-A) |
| **Contacts** | Detection summary | 1 | ✅ Exists (OBJ-A) |
| **Doctrine** | Doctrine rules (placeholder) | 0 | 📋 Future (DOCTRINE-A) |
| **System** | Debug info (collapsible) | 5 | ✨ NEW |

### System Evidence (Debug Group)

```
System Evidence [Debug Info] (Collapsible)
- Evidence Records: 17 (total count)
- Last Derivation Step: 5 (when computed)
- Confidence Average: 0.86 (avg reliability)
- Ledger Complete: true (all sources ready)
- Degraded Scenario: false (full World State)
```

**Use:** Troubleshooting doctrine/logistics/AI evidence later

### Example Display

```
Objective Alpha
Status: THREATENED
Coord: 19.78°N, 29.77°E

■ COMBAT EVIDENCE (4 records)
  • Force Ratio: 2.4 ●●● (high confidence)
    (threshold < 2 to block CAPTURED)
  • Blue Destroyed: 8 ●●● (high confidence)
    (threshold > 25% to block CAPTURED)
  • Blue Intact: 92% ●●● (high confidence)
  • Red Losses: 2.3 CE ●● (medium confidence)
    (threshold > 6 to block CAPTURED)

■ READINESS EVIDENCE (6 records)
  • Unit Strength Avg: 0.71 ●● (medium)
  • Force Availability: 83% ●●● (high)
  • Ammunition: 1.0 (full) ●●● (high)
  • Supply: 74% ●● (medium)
  • Combat Readiness: ready ●●● (high)
  • Casualty Rate: 0% ●●● (high)

■ CONTROL / BLS (2 records)
  • BLS Control: 2 ●●● (high)
  • BLS Contested: 1 ●●● (high)

■ CONTACTS (1 record)
  • Contacts: 45 total ●●● (high)
    ├─ Firm: 12 ●●●
    ├─ Probable: 20 ●●
    └─ Possible: 13 ●

■ DOCTRINE (placeholder)
  (Doctrine evidence not yet available)

[Debug Info ▾]
  Evidence Records: 17
  Last Derivation Step: 5
  Confidence Average: 0.86
  Ledger Complete: true
  Degraded Scenario: false
```

---

## BOUNDARIES ENFORCED

### Display Layer (OBJ-C) ✅

```
Input: ws.derived.objective_evidence (read-only)
  ↓
Process: Group by type, format values, calculate confidence
  ↓
Output: Render in #objective-panel (read-only)
```

**What happens:** Evidence is visible and explained to operator

### NOT Interpretation Layer ❌

```
DO NOT:
  - Input: evidence values
  - Process: score, weight, rank, interpret
  - Output: recommendations, behavior changes
```

**Why:** That's OBJ-D+ (future phases)

---

## PATTERN FOR FUTURE LAYERS

### The Evidence Architecture Pattern

**Established by OBJ-C:**

```
Evidence Source (generates data)
  ↓
  Create evidence records in ws.derived.objective_evidence
  Example: READINESS-A (6 types)

Visibility (displays data)
  ↓
  OBJ-C: Group evidence, show in UI
  No behavior change, no interpretation
  Operator sees evidence, understands status

Consumption (uses data)
  ↓
  OBJ-D+: Objectives read evidence
  May change behavior (future approval)
  Simulation consumes evidence

Example: Doctrine Future
```

Source → Visibility → Consumption

```
DOCTRINE-A
  └─ Creates 9 doctrine evidence types

OBJ-C Extension
  └─ Adds doctrine group to evidence panel
  └─ Still display-only

OBJ-D (Future)
  └─ Objectives refactored to use doctrine evidence
  └─ May change behavior (awaiting rules)
```

---

## SUCCESS CRITERIA

### Before Implementation
- ✅ OBJ-C planning complete
- ✅ 6 evidence groups designed (including System)
- ✅ UI mockup approved
- ✅ i18n keys mapped
- ✅ Test plan ready (48 assertions)
- ✅ Browser verification checklist ready

### During Implementation
- ✅ Create #objective-panel component
- ✅ Wire click event (adjudicator-map → panel)
- ✅ Group evidence by type
- ✅ Render confidence dots
- ✅ Add i18n support
- ✅ Handle empty/fallback cases
- ✅ All 48 test assertions pass

### After Implementation (OBJ-C Value Audit)
- ✅ Operator can explain objective status from evidence
- ✅ Readiness evidence visible and updates with steps
- ✅ Evidence sources and confidence shown
- ✅ Objective behavior completely unchanged (parity gate)
- ✅ System Evidence available for debugging

---

## TIMELINE

| Phase | Time | Task |
|---|---|---|
| Implementation | 4–6 hrs | Code #objective-panel, wire events, render groups |
| Testing | 1–2 hrs | Run 48 assertions, fix any failures |
| Browser Verify | 1 hr | Manual checklist (25 items) |
| Value Audit | 30 min | Verify operator value delivered |
| **Total** | **6–9 hrs** | Ready for next phase |

---

## NEXT PHASE GATE

**After OBJ-C Value Audit passes:**

### ✅ IF ALL CRITERIA MET:
```
OBJ-C successfully delivered operator value
Evidence visibility proven useful
System is safe for next layer

Approve: DOCTRINE-A implementation
Timeline: 3–5 hours
```

### ❌ IF ANY CRITERIA FAIL:
```
Issue: [specific failure]
Fix: [recommended fix]
Re-audit after fixes
Do not proceed to DOCTRINE-A until OBJ-C audited successfully
```

---

## THE PATTERN THIS ESTABLISHES

After OBJ-C, the roadmap becomes predictable:

```
1. READINESS-A (done)  → Evidence Source ✅
2. OBJ-C (now)         → Visibility ✅
3. DOCTRINE-A          → Evidence Source (planned)
4. OBJ-C Extension     → Visibility (same panel)
5. OBJ-D               → Consumption (future)
   ↓
6. LOGISTICS-A         → Evidence Source
7. OBJ-C Extension     → Visibility (same panel)
8. LOGISTICS-B         → Visibility (detailed)
9. OBJ-E               → Consumption (future)
```

**Each new evidence source gets:**
1. Planning & approval
2. Implementation (evidence generation)
3. Visibility (add to OBJ-C panel)
4. Value audit
5. Consumption layer (future)

This prevents ledger growth > operator value.

---

## KEY PRINCIPLE

**"Stored evidence that is not visible is technical debt."**

OBJ-C closes this debt.

After OBJ-C:
- Evidence is visible ✅
- Operator understands status ✅
- Architecture is transparent ✅
- Ready for next sources ✅

---

## APPROVAL SIGNATURE

**User Approval:** 2026-06-03
- ✅ Approve OBJ-C implementation
- ✅ Keep it display-only
- ✅ Add System Evidence group
- ✅ Enforce strict boundaries
- ✅ Run OBJ-C Value Audit after completion

**Implementation Status:** Ready to begin

**Next Approval Gate:** OBJ-C Value Audit (post-implementation)

---

**OBJ-C: Display Layer Only. Evidence Visibility. Operator Value. Ready to implement.**

