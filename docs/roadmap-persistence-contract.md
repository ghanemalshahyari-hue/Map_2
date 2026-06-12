# ROADMAP-3 — Roadmap Status Persistence Contract

> **Status:** ✅ IMPLEMENTED by ROADMAP-4 (2026-06-08) — owner-approved; implemented exactly §2–§6.
> **Code:** `server/roadmap-store.js` (new, isolated), `server/web-server.js` (one dispatch line),
> `client/roadmap-page.js` (+ `client/style.css`).
> **Tests:** `test-roadmap-4.js` (31: static + functional + HTTP-hermetic) · `verify-roadmap-4.js`
> (10: live, real server + real cookie auth, non-destructive). ROADMAP-1/1A/2 updated for §5.1 — all four suites green (92).
> **Date:** 2026-06-08 · **Owner:** ghanemalshahyari · **Feature:** `client/roadmap-page.js`

This contract defines — but does **not** implement — how a roadmap item's status becomes
**durable, shared, permissioned, and auditable**, *without any contact with the scenario or
simulation domain*. It is grounded in the real RMOOZ server (`server/web-server.js`,
`server/app-data.js`, `server/sim/journal.js`), not assumptions.

---

## 0. Context

The roadmap overlay (built in ROADMAP-1 / 1A / 2) lets the operator change an item's status —
**مكتمل / قيد العمل / القادم / مؤجل** — via the **"تحديث الحالة"** button, and watch the gauge,
route band, and current-position marker recompute live. Today that change is **in-memory only**
and is lost on reload (UI-only by design). This contract makes it persist — safely.

---

## 1. Owner rulings (the contract decisions)

| # | Question | Ruling |
|---|----------|--------|
| 1 | Where / how to store the status? | **Single JSON file under `data/`** (not SQLite) |
| 2 | Internal JSON or backend? | **No external backend** — the existing RMOOZ Node server (`server/web-server.js`) |
| 3 | Who may edit? | **Admin only** (others read-only) |
| 4 | Visible to all users? | **Yes — shared, one canonical roadmap** (single source of truth) |
| 5 | Change log? | **Yes — lightweight, append-only audit** |
| 6 | Impact on scenarios / simulation? | **None — hard-isolated** (see §6, non-negotiable) |

---

## 2. Storage model

Two **file-based** stores (honoring the "JSON file, no DB" ruling), both under
`DATA_DIR` (= `process.env.RMOOZ_DATA_DIR || <root>/data`). **Neither is web-served** (§6.5).

### (a) `data/roadmap-status.json` — current state (override map)

```json
{
  "schema": "rmooz.roadmap.status/1",
  "updated_at": "2026-06-08T09:12:33.001Z",
  "updated_by": "admin",
  "statuses": {
    "world-state": "completed",
    "detection-engagement": "in_progress"
  }
}
```

- `statuses` is an **override map**: `stableItemId → status`. Only items an admin has changed appear.
- The roadmap **structure** (phases, items, *default* statuses) stays owned by **client code**
  (`PHASES` in `roadmap-page.js`). The file **never stores structure** — only status overrides.
- **Effective status = override if present, else the code default.** This keeps code as the
  structure source-of-truth and survives adding/removing items in code (a stale override for a
  removed item is simply ignored).

### (b) `data/roadmap-status-audit.jsonl` — append-only change log (NDJSON)

Mirrors the durable-journal append style in `server/sim/journal.js` (atomic per-line append):

```json
{"ts":"2026-06-08T09:12:33.001Z","actor":"admin","item_id":"detection-engagement","from":"in_progress","to":"completed"}
```

- **One line per accepted change. Append-only — never rewritten or deleted.**
- `from` = the prior *effective* status as the server knew it (override, or `null` if it was a
  code default the server had no record of). A no-op change (`from === to`) appends **no** row.
- A separate `.jsonl` (vs. embedding history inside the JSON) is deliberate: it keeps the
  read-modify-write of the state file small and uses OS-atomic appends. Still file-based, no DB.

### 2.1 Prerequisite — stable item ids

`PHASES` items currently have **no id** (identified by object reference in memory). Persistence
**requires a stable key.** ROADMAP-4 adds an `id` to each item:

- lowercase, pattern `^[a-z0-9-]{1,64}$`, e.g. `map-2d`, `world-state`, `adjudicator`.
- **Assigned once and never renamed/reused** — renaming an id orphans its override + audit history.
- The **id**, not the title or array index, is the persistence key (titles are editable; order may change).

### 2.2 Atomicity & concurrency (JSON-file specifics)

- Writes to `roadmap-status.json` use **atomic temp-write + rename** (reuse the existing
  `atomicWriteFile()` pattern in `server/app-data.js`): write `…json.tmp`, then `fs.renameSync`
  over the target. **No reader ever sees a half-written file.**
- The handler does a **synchronous** read-modify-write (Node single thread → no interleave).
  The only writer is the admin, so contention is rare; atomicity still guards a crash mid-write.
- Audit rows use `fs.appendFileSync` (OS-atomic per line), same as the sim journal.
- Missing/corrupt state file → treated as **empty overrides** (effective = code defaults). A
  corrupt file is copied to `.bak` and replaced — never silently extended.

---

## 3. API surface (new, isolated handler)

A **new** module `server/roadmap-store.js` exposes
`handleRoadmapApi(req, res, pathname, method, sendJson, readJsonBody)`, dispatched in
`server/web-server.js` next to `handlePrefsApi` (before the static-file fallback). It **imports
nothing from `server/ai/` or `server/sim/`.**

### `GET /api/roadmap/status`
- **Auth:** any authenticated session → `200`. Unauthenticated → `401`.
- Returns the override map **plus this session's edit capability**:

```json
{
  "schema": "rmooz.roadmap.status/1",
  "updated_at": "2026-06-08T09:12:33.001Z",
  "updated_by": "admin",
  "statuses": { "detection-engagement": "completed" },
  "can_edit": true
}
```
- `can_edit` lets the client show/hide the editor **without knowing roles** (server decides).

### `POST /api/roadmap/status`
- **Auth:** **admin only.** Unauthenticated → `401`; authenticated non-admin → `403`.
- **Body** — a single change (matches the button: one item at a time):

```json
{ "item_id": "detection-engagement", "status": "completed" }
```
- **Validation** (else `400`, no write): `status ∈ {completed, in_progress, next, pending}`;
  `item_id` matches `^[a-z0-9-]{1,64}$`. (The server is **structure-agnostic** — it does not own
  the item list, so it validates *shape*, not membership.)
- **On success:** read → `statuses[item_id] = status` → atomic write → append audit row
  (`actor` = session username) → `200`:

```json
{ "ok": true, "item_id": "detection-engagement", "status": "completed", "updated_at": "…", "updated_by": "admin" }
```

> No `DELETE`/reset endpoint in this contract. "Reset" = an admin sets the item back to its code
> default; the override simply records that value.

---

## 4. Permission model (the admin gate)

There is **no admin role today** — every authenticated user is role `planner`, and even the
bootstrap `admin` account has role `planner` (`server/app-data.js`). The contract introduces a
**minimal, configurable gate**, computed **server-side** from the session user — **never trusted
from the client**:

```js
function isRoadmapAdmin(user) {
  return !!user && (
    user.role === 'admin' ||
    ADMIN_USERNAMES.includes(user.username)
  );
}
// ADMIN_USERNAMES = (process.env.RMOOZ_ROADMAP_ADMINS || 'admin').split(',').map(s => s.trim());
```

- Defaults to the existing bootstrap **`admin`** account; configurable via `RMOOZ_ROADMAP_ADMINS`
  (comma list). Nothing domain-specific is hardcoded beyond the app's existing default username.
- **Forward-compatible:** if a real `admin` role is later added to `app.db`, the `role` check
  already honors it and the username allowlist can be retired.
- Enforced on **POST only**. `GET` is open to any authed user; `can_edit` in its response =
  `isRoadmapAdmin(session user)`.

---

## 5. Client integration contract (`roadmap-page.js`, ROADMAP-4)

- **On overlay open:** `GET /api/roadmap/status` → merge `statuses` over the in-code `PHASES`
  defaults **by item id** → rerender (gauge/route/marker reflect the shared state). Cache `can_edit`.
- **Editor visibility:** the ROADMAP-2 status editor + **"تحديث الحالة"** render **only when
  `can_edit === true`.** Non-admins (and unauth) see the roadmap **read-only** — the editor block
  is *omitted*, not merely disabled.
- **On "تحديث الحالة":** `POST {item_id, status}`. `200` → apply in-memory + rerender (confirmed).
  `4xx`/network failure → keep the prior status and show a small inline message
  (e.g. *"تعذّر الحفظ — تحقّق من الصلاحية أو الاتصال"*); **never appear saved when it wasn't.**
- **Graceful degradation:** if `GET` fails (offline / server down), the page behaves **exactly as
  ROADMAP-2** — code defaults, in-memory only — so a persistence outage never breaks the roadmap
  (read-only fallback; edits just won't persist).
- The **two** roadmap endpoints are the **only** network calls the page may make.

### 5.1 Test-contract change (deliberate, bounded)

ROADMAP-1/1A/2 static suites assert `roadmap-page.js` contains **no `fetch`** and **no `/api/`**.
ROADMAP-4 **relaxes this to exactly:** the page may call **`GET`/`POST /api/roadmap/status` and
nothing else.** All other prohibitions stay enforced — **no** scenario/sim/journal/commit,
**no** `localStorage`/`sessionStorage`, **no** XHR/WebSocket, **no** `rmooz:*` mutation dispatch,
**no** `window.units`/`map`/`lines` writes. This relaxation is conscious and limited to those two endpoints.

---

## 6. ISOLATION INVARIANTS — scenario/sim safety (answer to Q6, **non-negotiable**)

1. **Dedicated handler** `server/roadmap-store.js`; imports **nothing** from `server/ai/` or
   `server/sim/`. *(A static test asserts zero such imports.)*
2. Reads/writes **only** `data/roadmap-status.json` and `data/roadmap-status-audit.jsonl`. Never
   touches `scenarios/`, `journal/<run>.jsonl`, World State, units, `mc-runs/`, or `app.db` scenario data.
3. **Never** calls `adjudicator` / `commitStep` / `commitDecisions` / `journal.appendCommit` or any
   `/api/sim/*` route. No `operator_id`, no `run_id`, no proposal/decision concepts.
4. Because it touches **none** of the 9 sim-boundary rows audited by `boundary-audit-panel.js`,
   that audit is **unaffected** — `scenarioMutation` stays FORBIDDEN/green. The roadmap endpoints
   are orthogonal to, and invisible from, the boundary audit.
5. `data/` is **not web-served** (static serving is limited to `client/` + `ROOT`, and `/api/` is
   matched first), so the JSON files are reachable **only** via the audited API — never via a
   direct `fetch`/static path.
6. The roadmap "status" vocabulary (مكتمل/…) is a **documentation/planning label** with **zero**
   causal link to readiness, supply, World State, or any sim enum. Changing a roadmap status
   changes **only the roadmap display.**

---

## 7. Out of scope (deferred)

- **Real-time push:** other users see a change only on their next open/`GET` (no WebSocket).
  Possible future **ROADMAP-5**.
- **Editing roadmap structure** (add/remove/reorder phases/items) from the UI — structure stays code-owned.
- Per-item notes, owners, dates, or links to real features/scenarios.
- Reconciling the UI roadmap with `docs/rmooz-development-roadmap.md` (a separate planning artifact).
- A general **RBAC** system — only the minimal admin gate (§4) is introduced.

---

## 8. ROADMAP-4 implementation outline *(for approval — not done here)*

**Files**
- `server/roadmap-store.js` *(new)* — read/merge/write/audit + `isRoadmapAdmin` + `handleRoadmapApi`.
- `server/web-server.js` — one dispatch line `if (roadmap.handleRoadmapApi(...)) return;` before static.
- `client/roadmap-page.js` — `GET`-on-open + merge + `can_edit` gating + `POST`-on-update + failure
  UX + offline fallback; **add a stable `id` to each `PHASES` item.**

**Tests**
- `test-roadmap-4.js` *(static)* — handler imports nothing from ai/sim; admin gate present;
  status/`item_id` validation; atomic-write + audit-append used; client wires only the two
  endpoints; the relaxed-but-bounded safety contract (§5.1).
- `verify-roadmap-4.js` *(server; curl/Playwright)* — `GET` default → `200` + `can_edit`;
  `POST` as admin → `200`, state file written, audit line appended; `POST` as non-admin → `403`;
  `POST` bad status → `400`; reload reflects persisted state; non-admin sees read-only.

**Acceptance** — all of the above green; ROADMAP-1/1A/2 suites still green (with the §5.1
documented relaxation); `boundary-audit` unchanged.

---

## 9. Approval gate

This contract was the gate. ✅ **Approved and implemented by ROADMAP-4** (exactly §2–§6) — **no
scenario or simulation code touched at any point.** Verified by 31 static/functional/HTTP-hermetic
tests (`test-roadmap-4.js`) and 10 live tests against the real server with real cookie auth
(`verify-roadmap-4.js`, which snapshots + restores the data dir so it is non-destructive). The §5.1
relaxation was applied to the ROADMAP-1/1A/2 suites; all four roadmap suites pass (92 tests total).
