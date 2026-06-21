# Coordinate-token forensics — 2026-06-21

**Question (owner):** classify these four tokens and, *if any are source-code operational
defaults / fallback movement targets, remove them or derive them from the scenario*; if they
are scenario/test/export data, document that they are data (not engine logic) and leave them.

- `52.58079679659417` (looks like a longitude)
- `23.771019062376116` (looks like a latitude)
- `auto-flank-area`
- `free-draw-1781590991682`

**Verdict (all four): NONE is a hardcoded source-code default or fallback movement target.**
There is nothing to remove or re-derive. The Free Fight movement/COA path is **not** anchored to
any of these literals. Details + evidence below.

---

## 1. `52.58079679659417` / `23.771019062376116` — transient runtime-computed values

| Search scope | Result |
|---|---|
| `UI_MOdified/client/**` (client engine/UI `.js`) | **0 hits** |
| `UI_MOdified/server/**` (server/AI `.js`) | **0 hits** |
| `UI_MOdified/data/**` (saved drawings / plans / runtime) | **0 hits** |
| `UI_MOdified/scripts/**` (tests/fixtures) | **0 hits** |
| `docs/**` (reports / export artifacts) | **0 hits** |
| `git grep` (all tracked files), exact full precision | **0 hits** |
| `Select-String` over disk incl. gitignored, exact full precision | **0 hits** |

The **exact** 14–15-significant-figure values exist **nowhere on disk**. That precision is the
signature of a floating-point computation (e.g. a Turf centroid / a linear interpolation between
two map points), not a hand-authored default — hand-authored defaults in this codebase are round
(e.g. the objective override `lon: 51.01, lat: 24.81`).

A 6-digit **stem** search (`52.5807` / `23.7710`) *does* match — but only **coastline vertices**
inside the basemap GIS layer `obstacle.geojson` (e.g. `UI_MOdified/Offline_Deployment/map_data/base/obstacle.geojson`,
`UI_MOdified/maps/obstacle.geojson`). Those are unrelated Gulf shoreline points that merely begin
with the same six digits and carry different trailing digits. That file is **static map reference
data (GIS)** — class ②, not engine logic.

**Class:** transient runtime-computed value (not persisted). **Action:** none — not a source default.

## 2. `auto-flank-area` — frontline geometry **type-tag / CSS className** (not a coordinate)

Defined and consumed by the **front-line auto-generation** feature:

- `UI_MOdified/client/app.js` — `_tmgData.typeId` / Leaflet `className` for the auto-generated
  depth-area polygons and their outline/seam/divider variants
  (lines ~4504, 4518, 4691, 4826, 4967, 5004, 5032, 5397, 5521, 5571, 5582, 5591, 5653).
- `UI_MOdified/client/io.js:915,952` — import fallback tag: `elData.autoFlank.typeId || 'auto-flank-area'`.
- `docs/frontline-verification-artifacts/frontline-verification-result.json` — appears as a
  rendered `typeId`/`className` count → **generated/export artifact** (class ④).
- `docs/frontline-auto-generation-pipeline-report.md` — documents it as the polygon type tag.

It is a **style/type label** attached to geometry derived from the operator's drawn front line —
**not** a coordinate and **not** a movement target. **Class:** ① source *label* + ④ export
artifact. **Action:** none.

## 3. `free-draw-1781590991682` — runtime **session-ID** (generator is source; instances are data)

- **Generator (source logic, legitimate):** `UI_MOdified/client/free_draw_signature.js:1939`
  ```js
  window.freeDrawSignatureSessionId = 'free-draw-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  ```
  This mints a unique runtime session ID; it is a **pattern**, never a hardcoded coordinate/target.
- **Persisted instances (runtime saved drawings, class ⑤):** the saved plan GeoJSON files carry
  frozen instances — e.g. `UI_MOdified/data/users/0cfff4f3-.../plans/7408ca01-...geojson`
  has `"sessionId": "free-draw-1782041033229-8050"`; the archived
  `UI_MOdified/TestingAI/_archive/source_data/nato-map-layers.geojson` has
  `"free-draw-1779102734736-4570"`.
- The **exact** timestamp the owner cited (`…1781590991682`) is **not present** on disk — it is a
  different draw session than the persisted ones, consistent with a transient/older runtime ID.

**Class:** ① source *ID generator* + ⑤ runtime saved-drawing data. **Action:** none.

---

## Why this matters

The owner's concern was that "AI movement" might secretly be driven by hardcoded coordinate
defaults (which would make it *not* real, scenario-derived AI). **It is not.** No engine module
contains these coordinates; movement targets come from the scenario/objective/COA, and the
`free-draw`/`auto-flank` tokens are a runtime ID generator and a geometry style-tag respectively.

Separately verified the same session: the Free Fight COA planner produces a **real local-LLM plan**
(`plan_source=llm`, `provider_used=ollama`, no cloud) once pointed at a locally-installed model —
see `UI_MOdified/scripts/verify-coa-llm-local-e2e.js`.
