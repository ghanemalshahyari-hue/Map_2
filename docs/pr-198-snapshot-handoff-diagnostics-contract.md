# PR-198 — Snapshot Handoff Diagnostics Contract

**Type:** Documentation only  
**Status:** Proposed  
**Depends on:** PR-197 (Snapshot Builder `buildLiveUnitsSnapshot`)  
**Blocks:** PR-199 (`previewReconciliationWithSnapshot` pure helper), PR-200 (Diagnostics display with safe snapshot)

---

## 1. Snapshot Handoff Purpose

UID reconciliation inside the staging diagnostics pipeline requires unit data to match step UIDs against live units. This data must never be pulled from `window.units` by the diagnostics paint function itself.

A `LiveUnitsSnapshot` may be used by diagnostics **only** when it is explicitly supplied by a safe, named caller — not obtained by any automatic, hidden, or global-read mechanism.

The paint function `paintStagingReadinessCard()` must remain a pure renderer. It must not reach out to live globals to acquire data. Any snapshot it uses must arrive as a parameter or via a future safe injection point, fully constructed and validated before it enters the paint path.

This separation ensures:
- The diagnostics path cannot accidentally mutate live state.
- The origin of any unit data used in reconciliation is always traceable to an explicit caller action.
- Removing or replacing the snapshot source cannot silently change diagnostic results.

---

## 2. Allowed and Forbidden Snapshot Sources

### Allowed

| Source | Notes |
|---|---|
| Caller-provided units array passed into `buildLiveUnitsSnapshot(unitsArray, options)` | PR-197. Caller is responsible for supplying the array. The function deep-copies immediately and never reads `window.units`. |
| Future explicit operator-triggered snapshot capture | A future named function (e.g. `captureUnitsSnapshot()`) that the operator consciously invokes. Must call `buildLiveUnitsSnapshot` internally. Must not auto-trigger. |
| Future test harness supplied snapshot | A snapshot constructed from test fixtures, passed directly to the helper. |

### Forbidden

| Forbidden pattern | Reason |
|---|---|
| `paintStagingReadinessCard()` reading `window.units` | Paint functions must be pure renderers, not data collectors. |
| `reconcileUidReferences()` reading `window.units` | This function already accepts a second `unitsSnapshot` parameter for this reason. |
| Hidden automatic snapshot capture on page load, scroll, focus, or any event | Violates explicit-trigger requirement. |
| Persistent snapshot cache (module scope, `window._snapshot`, `localStorage`, etc.) | Stale data risk; violates no-storage rule. |
| Fallback to `window.units` when snapshot is absent or invalid | Silently changes data source; masks missing-snapshot state. |
| `window.units.slice()` or `Object.assign({}, unit)` inside the paint path | Shallow copy — retains live references. |

---

## 3. Diagnostics Behavior

### When no safe snapshot is available (current state as of PR-197)

`paintStagingReadinessCard()` calls `reconcileUidReferences(step, [])` with an empty array. This is intentional and correct.

| Gate | Status |
|---|---|
| UID reconciliation | **Pending** — `confidence: 'low'`, `passed: false` |
| Apply candidate | **Not ready** — `acBuilt.passed === false` |
| Final confirmation | **Not ready** — prerequisite apply candidate not ready |

These states are displayed to the operator as read-only diagnostic rows. No action is blocked by this state — the diagnostics section exists for visibility only. No apply path exists.

### When a safe snapshot is available (future PR-200)

A future implementation will receive a validated `LiveUnitsSnapshot` via an explicit injection point. When that snapshot is present:

1. Validate the snapshot: `isLiveUnitsSnapshotSafe(snapshot)` — reject if not passed.
2. Pass `snapshot.units` (not `snapshot` itself) to `reconcileUidReferences(step, snapshot.units)`.
3. Never store the snapshot after the call completes.
4. Never mutate `snapshot.units` or any element within it.
5. Display the reconciliation result as read-only diagnostic rows only.
6. If the snapshot fails validation, fall back to the empty-array path (step 3 above) — do not fall back to `window.units`.

The apply candidate may reach `passed: true` for the first time once a valid snapshot flows through this path. This changes the diagnostic status row from "Not ready — UID reconciliation pending" to "Preview only". It does not open any apply path.

---

## 4. Future Implementation Contract

A future pure helper `previewReconciliationWithSnapshot` may be introduced in PR-199 to encapsulate the reconciliation-with-snapshot logic cleanly, without entangling it with the paint function.

### Proposed signature

```js
previewReconciliationWithSnapshot(importedStep, liveUnitsSnapshot)
```

### Return shape

```
{
  passed:          boolean,
  rrResult:        object | null,   // result from reconcileUidReferences, or null if rejected
  blockedReasons:  string[],
  warnings:        string[]
}
```

### Required behaviours

| Rule | Detail |
|---|---|
| `liveUnitsSnapshot` is required | If absent or null, return `passed: false` with reason `'liveUnitsSnapshot required'`. |
| Validate before use | Call `isLiveUnitsSnapshotSafe(liveUnitsSnapshot)` first. If not passed, return `passed: false`. |
| Do not read `window.units` | Use only `liveUnitsSnapshot.units`. No fallback to globals. |
| Do not store result | Return value only. No module-scope cache. |
| Do not mutate | Must not write to `importedStep`, `liveUnitsSnapshot`, or any nested object. |
| Return display-only result | The `rrResult` is passed to the paint function for display. It must not be passed to `buildApplyCandidate` outside of diagnostics until Gate 5 is formally wired. |

### What this helper is not

- It is not a Gate 5 live reconciliation path.
- It is not an apply trigger.
- It is not a commit path.
- It is not a state mutation path.
- It must not be called automatically.

---

## 5. Still Forbidden

The following are forbidden in all current and future PRs in this sequence unless a separate security review and explicit sign-off occurs:

- Direct `window.units` read inside `paintStagingReadinessCard`
- Direct `window.units` copy inside any diagnostics function
- Live apply of any kind
- Map mutation (`window.lines`, overlay layers, tile state)
- Unit mutation (`window.units[i].*`)
- Scenario mutation (`window.RmoozScenario.*`)
- Backend commit (`/api/sim/*`)
- Persistence of any kind (module scope, `window.*`, `localStorage`, `sessionStorage`, `IndexedDB`)
- Export or download of snapshots, proposals, candidates, or confirmations
- Auto-triggered snapshot capture (event listeners, `setTimeout`, `setInterval`, load hooks)
- Gate 7 UI of any kind (apply button, commit button, confirm button)

---

## 6. Recommended Next PRs

| PR | Type | Description |
|---|---|---|
| **PR-199** | Pure JS | `previewReconciliationWithSnapshot(importedStep, liveUnitsSnapshot)` — pure helper, no UI, no storage, self-checks with `isLiveUnitsSnapshotSafe` |
| **PR-200** | Runtime + HTML + CSS | Diagnostics display update: wire `previewReconciliationWithSnapshot` into `paintStagingReadinessCard` with an explicitly supplied safe snapshot; apply candidate may reach `passed: true` for the first time |
| **PR-201+** | Documentation | Operator identity contract — defines `operatorId` source, validation, and safe injection path for Gate 7 step 2 |
| **Later only** | Documentation | Controlled staging state discussion — prerequisite before any Gate 7 UI exists |

---

## 7. Safety Checklist

- [ ] Snapshot handoff purpose stated (§1)
- [ ] Allowed snapshot sources listed (§2)
- [ ] Forbidden snapshot sources listed (§2)
- [ ] Diagnostics behavior when no snapshot available (§3)
- [ ] Diagnostics behavior when safe snapshot available (§3)
- [ ] Future helper contract defined: signature, return shape, required behaviours (§4)
- [ ] What the helper is not — listed explicitly (§4)
- [ ] Still-forbidden list present (§5)
- [ ] Recommended next PRs listed (§6)
- [ ] No runtime code introduced
- [ ] No `window.units` read in this PR
- [ ] No mutation in this PR
- [ ] No storage in this PR
- [ ] No fetch, backend, or download in this PR
- [ ] No UI, no card, no button in this PR
