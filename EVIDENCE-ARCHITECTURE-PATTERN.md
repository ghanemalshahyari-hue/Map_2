# Evidence Architecture Pattern — Established by OBJ-C

**Date:** 2026-06-03  
**Pattern:** Evidence Source → Visibility → Consumption  
**Goal:** Prevent ledger growth faster than operator value

---

## THE PATTERN

### Layer 1: Evidence Source

**Creates evidence records in `ws.derived.objective_evidence`**

Example: READINESS-A
```
function computeReadinessEvidence(ws) {
  return [
    { evidence_type: "unit_strength_avg", value: 0.71, confidence: 0.85, ... },
    { evidence_type: "force_availability_ratio", value: 0.83, confidence: 1.0, ... },
    // ... 4 more types
  ];
}
```

Characteristics:
- Pure storage (no interpretation)
- Deterministic computation
- No behavior change
- Adds to evidence ledger

---

### Layer 2: Visibility

**Displays evidence to operator**

Example: OBJ-C (in progress)
```
Objective Panel
├─ Combat Evidence
│  ├─ Force Ratio: 2.4
│  ├─ Blue Destroyed: 8
│  └─ ...
├─ Readiness Evidence
│  ├─ Unit Strength: 0.71
│  ├─ Force Availability: 83%
│  └─ ...
└─ System Evidence (debug)
```

Characteristics:
- Display-only (no mutation)
- Groups evidence by type
- Shows confidence/sources
- Operator understands status
- **Zero behavior change**

---

### Layer 3: Consumption

**Simulation uses evidence for logic**

Example: OBJ-D (future)
```
function computeObjectiveStatus(ws) {
  const evidence = ws.derived.objective_evidence;
  
  // Use doctrine evidence to modify status logic
  const doctrineConstraints = evidence.filter(r => r.evidence_type.includes('doctrine'));
  
  // Apply doctrine rules (awaiting clarification)
  // May change objective behavior
}
```

Characteristics:
- Interprets evidence (scoring, weighting, ranking)
- May change simulation behavior
- Separate approval per layer
- Requires clear rules (e.g., CMO doctrine)

---

## THE ROADMAP FOLLOWING THIS PATTERN

### Phase A: READINESS Evidence

**Layer 1: Source**
```
✅ READINESS-A
   Creates 6 readiness types in objective_evidence
   Status: COMPLETE
```

**Layer 2: Visibility**
```
✅ OBJ-C (in progress)
   Displays readiness in evidence panel
   Status: APPROVED FOR IMPLEMENTATION
```

**Layer 3: Consumption**
```
🔵 FUTURE (when rules clarified)
   Objectives use readiness to modify behavior
   Example: "Force readiness < 70% → reduced engagement capability"
   Status: NOT YET APPROVED
```

---

### Phase B: DOCTRINE Evidence

**Layer 1: Source**
```
📋 DOCTRINE-A (planned)
   Creates 9 doctrine types in objective_evidence
   Status: APPROVED BUT NOT IMPLEMENTED (waiting for visibility)
```

**Layer 2: Visibility**
```
📋 OBJ-C Extension (after OBJ-C base)
   Adds doctrine group to evidence panel
   Same panel, new group
   Status: PLANNED (after OBJ-C core complete)
```

**Layer 3: Consumption**
```
🔵 OBJ-D (future)
   Objectives use doctrine evidence
   May change behavior (awaiting rules)
   Status: NOT YET DESIGNED
```

---

### Phase C: LOGISTICS Evidence

**Layer 1: Source**
```
🔵 LOGISTICS-A (future)
   Creates logistics types in objective_evidence
   Supply drain, throughput, reserves
   Status: NOT YET PLANNED
```

**Layer 2: Visibility**
```
🔵 LOGISTICS-B (after LOGISTICS-A)
   Shows logistics in evidence panel or separate detail view
   Status: NOT YET PLANNED
```

**Layer 3: Consumption**
```
🔵 LOGISTICS-C (future)
   Objectives use logistics for behavior
   May affect engagement capability, movement, supply pressure
   Status: NOT YET DESIGNED
```

---

## WHY THIS PATTERN MATTERS

### Without This Pattern

```
READINESS-A creates 6 evidence types
DOCTRINE-A creates 9 evidence types
LOGISTICS-A creates 8 evidence types
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
23 types stored, but operator doesn't see any of them
0 visibility
0 proven value
❌ Technical debt
```

### With This Pattern

```
READINESS-A creates 6 types
OBJ-C displays them ← Operator sees evidence, understands status
✅ Value proven

DOCTRINE-A creates 9 types
OBJ-C extension displays them ← Operator sees doctrine evidence
✅ Value proven

LOGISTICS-A creates 8 types
LOGISTICS-B displays them ← Operator sees logistics evidence
✅ Value proven

Consumption layers (OBJ-D, LOGISTICS-C) approved only after visibility proves value
```

---

## IMPLEMENTATION ORDER

### Locked Sequence

```
1. READINESS-A (COMPLETE) ✅
   Evidence source for readiness

2. OBJ-C (IN PROGRESS) → (Approved for implementation)
   Visibility for readiness evidence
   ✓ Operator sees readiness
   ✓ OBJ-C Value Audit gates next phase

3. DOCTRINE-A (Waiting for #2) → (Approved but not implemented)
   Evidence source for doctrine
   ✓ 9 doctrine types stored

4. OBJ-C Extension (after #3)
   Visibility for doctrine evidence
   ✓ Operator sees doctrine

5. OBJ-D (Future, after #4) → (Not yet approved)
   Consumption for doctrine
   ✓ Objectives use doctrine evidence

6. LOGISTICS-A (Future) → (Not yet planned)
   Evidence source for logistics

7. LOGISTICS-B (after #6)
   Visibility for logistics

8. LOGISTICS-C (Future)
   Consumption for logistics
```

**Key Rule:** No consumption layer (OBJ-D+) approved until visibility layer proves value in audit.

---

## APPROVAL GATES

### Gate 1: Evidence Source Approval
**Question:** "Is the evidence schema correct and minimal?"
**Answer:** Plan + approval (DOCTRINE-A already approved)

### Gate 2: Visibility Approval
**Question:** "Is evidence visible and operator value proven?"
**Answer:** OBJ-C Value Audit (after implementation)

### Gate 3: Consumption Approval
**Question:** "Are interpretation rules clear and safe?"
**Answer:** Future, case-by-case (awaiting design)

---

## PROOF OF PATTERN

### OBJ-C Proves It Works

After OBJ-C Value Audit, the answer to these questions must be:

1. **"Can operator explain objective status?"** → YES (visibility works)
2. **"Is evidence visible?"** → YES (evidence display works)
3. **"Did simulation behavior change?"** → NO (display layer is safe)
4. **"Can you add more evidence types?"** → YES (DOCTRINE-A ready)

If all 4 are YES, the pattern is proven and DOCTRINE-A implementation is approved.

---

## PREVENTING LEDGER SPRAWL

### Anti-Pattern (What We Avoid)

```
Create evidence
  ↓
Create more evidence
  ↓
Create more evidence
  ↓
Nothing is visible
  ↓
Nothing uses evidence
  ↓
❌ 30+ types, zero operator value
```

### Correct Pattern (What We Do)

```
Create evidence (READINESS-A)
  ↓
Display evidence (OBJ-C)
  ↓
Audit proves value
  ✅ Operator understands status
  ✅ Evidence is useful
  ↓
Create more evidence (DOCTRINE-A)
  ↓
Display evidence (OBJ-C extension)
  ↓
Audit proves value
  ✅ More evidence visible
  ✅ Operator's understanding richer
  ↓
Consumption (OBJ-D)
  ↓
Simulation uses evidence
  ✅ Evidence drives behavior
```

**Key:** Visibility happens before consumption. Evidence is visible before being consumed.

---

## THE ROADMAP

```
Immediate (This week)
├─ OBJ-C Implementation (4–6 hrs)
├─ OBJ-C Value Audit (30 min)
└─ Approve DOCTRINE-A (if audit passes)

Short-term (Next sessions)
├─ DOCTRINE-A Implementation (3–5 hrs)
├─ OBJ-C Extension (1–2 hrs, add doctrine group)
├─ OBJ-C Value Audit Extension (30 min)
└─ Plan OBJ-D (doctrine interpretation)

Medium-term (Future)
├─ OBJ-D Implementation (awaiting rules)
├─ LOGISTICS-A/B Planning & Implementation
├─ LOGISTICS-C Implementation
└─ AI Integration (if approved)

Long-term (When Rules Clear)
├─ PROFICIENCY Evidence
├─ MORALE Evidence
├─ FATIGUE Evidence
└─ Other simulation layers
```

---

## SUMMARY

**The Evidence Architecture Pattern:**

1. **Source:** Create evidence (minimal, deterministic, no behavior change)
2. **Visibility:** Display evidence (operator understands status, reads evidence)
3. **Audit:** Verify operator value (5 success criteria)
4. **Consumption:** Use evidence (only after visibility proven)

**OBJ-C establishes this pattern for all future evidence sources.**

After OBJ-C Value Audit passes, DOCTRINE-A becomes the template for every new evidence layer.

No more storage without visibility.
No more visibility without audit.
No more consumption without clear rules.

**Evidence architecture is now: Source → Visibility → Audit → Consumption.**

