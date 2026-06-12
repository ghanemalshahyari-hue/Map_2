# PR-195 — Live Units Snapshot Contract

**Type:** Documentation only  
**Status:** Proposed  
**Depends on:** PR-194 (Controlled Apply Implementation Discussion)  
**Blocks:** PR-196 (Snapshot Type Guard), PR-197 (Snapshot Builder), PR-198 (UID Reconciliation with Real Snapshot)

---

## 1. Purpose

This document defines the contract for a **live units snapshot** — a safe, caller-triggered, read-only deep copy of the live units array at a specific point in time.

The snapshot is the mechanism by which `reconcileUidReferences` receives unit data without ever reading `window.units` directly. The snapshot is created outside the staging pipeline, passed as a parameter, and never stored in module scope or on `window`.

This contract is documentation only. No runtime code is introduced in this PR.

---

## 2. Background

`reconcileUidReferences(step, unitsSnapshot)` already accepts a second parameter, `unitsSnapshot`. In all current diagnostics (PR-188), an empty array `[]` is passed, which produces `confidence: 'low'` and `acBuilt.passed === false`. This is correct and safe for the current read-only preview.

To allow the apply candidate to reach `passed: true` in diagnostics for the first time, `reconcileUidReferences` must receive a real snapshot. But the snapshot must be constructed safely — no live reference to `window.units` may persist, and the caller must be the explicit, named trigger.

---

## 3. Snapshot Shape

A valid live units snapshot is a plain object with the following fields:

```
{
  snapshotAt:          string,   // ISO 8601 timestamp of when the snapshot was taken
  unitCount:           number,   // integer ≥ 0, must equal units.length
  units:               array,    // deep copy of live units at snapshotAt
  readOnly:            true,     // hard-locked, must not be false
  liveMutationAllowed: false,    // hard-locked, must not be true
  source:              string    // non-empty string identifying caller (e.g. 'operator-manual')
}
```

### Field rules

| Field | Requirement |
|---|---|
| `snapshotAt` | Non-empty string. Must parse as a valid date. Set at the moment of copy, not deferred. |
| `unitCount` | Integer ≥ 0. Must equal `units.length` exactly. Used for integrity validation. |
| `units` | Array. Must be a deep copy — no object reference may point back to any element of `window.units`. |
| `readOnly` | Boolean. Must be exactly `true`. Never `false`, `null`, or absent. |
| `liveMutationAllowed` | Boolean. Must be exactly `false`. Never `true`, `null`, or absent. |
| `source` | Non-empty string. Identifies who triggered the snapshot. Must not be `'auto'`, `'global'`, or `'window'`. |

---

## 4. Caller Obligations

The caller who creates a snapshot (the builder introduced in PR-197) is responsible for:

1. **Explicit trigger only.** The snapshot must be created by a named, intentional caller action. It must not be created automatically on page load, on state change, or on any event listener.

2. **Immediate deep copy.** The caller must deep-copy the live units array at the moment of the call. No deferred copy. No lazy reference. No `Object.assign` shallow clone.

3. **No persistence.** The snapshot must not be stored in module scope, `window`, `localStorage`, `sessionStorage`, or any other persistent location. It is passed as a function argument and goes out of scope when the call completes.

4. **No write-back.** The caller must not write to `snapshot.units[i]` or any nested field after creation.

5. **unitCount integrity.** The caller must set `unitCount` to `units.length` at copy time, not before or after.

6. **source string.** The caller must supply a meaningful `source` string that identifies the context (e.g. `'operator-manual'`, `'diagnostics-preview'`). The string must not imply automation.

---

## 5. Consumer Obligations

Any function that receives a snapshot (including `reconcileUidReferences`) is responsible for:

1. **Treating units as read-only.** The consumer must not write to any element of `snapshot.units`.

2. **Validating before use.** The consumer must check `readOnly === true` and `liveMutationAllowed === false` before trusting the snapshot. If either check fails, the consumer must reject the snapshot and return a failed result.

3. **Not storing the snapshot.** The consumer must not cache or persist the snapshot beyond the immediate call.

4. **Not reading `window.units`.** The consumer must use only `snapshot.units`. It must not fall back to `window.units` if the snapshot is absent or invalid — it must instead return a failed result.

---

## 6. What a Snapshot Is Not

| Prohibited pattern | Reason |
|---|---|
| `var snap = window.units;` | Shallow alias — not a copy |
| `var snap = window.units.slice();` | Shallow copy — nested objects still share references |
| `window._snapshot = buildSnapshot(...)` | Persistence on `window` — forbidden |
| Auto-snapshot on `loadScenario` | Not caller-triggered — forbidden |
| `source: 'auto'` | Implies automation — forbidden |
| `unitCount` set to a hardcoded constant | Not derived from actual array length — forbidden |

---

## 7. Snapshot Lifecycle

```
[Operator or diagnostics UI action]
        │
        ▼
buildLiveUnitsSnapshot(window.units, { source: '...' })   ← PR-197
        │
        ▼  (deep copy, snapshotAt, unitCount, readOnly: true, liveMutationAllowed: false)
        │
        ▼
isLiveUnitsSnapshotSafe(snapshot)                          ← PR-196
        │  passed === true?
        ▼
reconcileUidReferences(step, snapshot.units)               ← existing, unchanged
        │
        ▼
buildApplyCandidate(...)                                   ← PR-187, unchanged
        │
        ▼
[diagnostics display, no mutation]                         ← PR-198
```

The snapshot is created once, passed down the chain, and never re-used or stored.

---

## 8. Relationship to Existing Guards

`isLiveUnitsSnapshotSafe` (PR-196) will validate this contract before the snapshot is consumed. Its checks will include:

- Object, non-null
- `snapshotAt` non-empty string
- `unitCount` integer ≥ 0, equals `units.length`
- `units` is array
- `readOnly === true`
- `liveMutationAllowed === false`
- `source` non-empty string, not in forbidden list
- No unsafe fields (`applyNow`, `commitNow`, `mutateUnits`, etc.)

Until PR-196 is implemented, no runtime validation exists. This document is the authoritative contract.

---

## 9. Forbidden Fields

The following fields must never appear on a snapshot object:

```
applyNow, commitNow, executeNow, mutateUnits, mutateMap, mutateLines,
mutateScenario, backendCommit, autoApply, skipGate, forceApply,
liveApply, autoAdvance, autoConfirm, autoSnapshot
```

Their presence is grounds for type guard rejection in PR-196.

---

## 10. Diagnostics Use (PR-198 Preview)

In PR-198, `paintStagingReadinessCard()` will receive a snapshot from a caller-triggered action rather than passing `[]` to `reconcileUidReferences`. The expected behaviour change:

| Before PR-198 | After PR-198 |
|---|---|
| `reconcileUidReferences(step, [])` | `reconcileUidReferences(step, snapshot.units)` |
| `confidence: 'low'` always | `confidence: 'high'` or `'medium'` if units match |
| `acBuilt.passed === false` always | `acBuilt.passed` can become `true` |
| Apply candidate status: "Not ready — UID reconciliation pending" | Apply candidate status: "Preview only" (first time) |

This is the first point in the pipeline where the full diagnostics chain can complete without a pending state.

---

## 11. Safety Checklist

- [ ] Snapshot shape defined (§3)
- [ ] Caller obligations stated (§4)
- [ ] Consumer obligations stated (§5)
- [ ] Prohibited patterns listed (§6)
- [ ] Lifecycle diagram present (§7)
- [ ] Relationship to guards stated (§8)
- [ ] Forbidden fields listed (§9)
- [ ] Diagnostics impact described (§10)
- [ ] No runtime code introduced
- [ ] No `window.units` read in this PR
- [ ] No mutation in this PR
- [ ] No persistence in this PR
- [ ] No fetch, storage, or download in this PR
