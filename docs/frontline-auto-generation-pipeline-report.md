# RMOOZ Front-Line Auto-Generation Pipeline

Date: 2026-06-12

## Manual Front-Line Entry Point

- Initial workflow button: `#free-draw-signature-btn`, label `Auto Draw`, in `UI_MOdified/client/app.html`.
- Initial handler: `UI_MOdified/client/free_draw_signature.js`.
  - `initFreeDrawSignatureWorkflow()` wires the button and the map listeners.
  - `activateFreeDrawSignature()` opens the setup popup.
  - `placeSymbolAt()` places the Circle-X anchors.
  - `activateScallopedDrawingMode()` switches the app into the normal line tool and calls `window.selectTmgType('scalloped', lineColor)`.
- Manual front-line draw handler: `UI_MOdified/client/app.js`.
  - The map click handler in line mode pushes Leaflet `L.LatLng` objects into `tmgPoints`.
  - For `selectedTmgType === 'scalloped'`, completion calls `createTmgFromPoints(tmgPoints)`.
  - `createTmgFromPoints()` calls `expandScallopedControlPointsToChordPairs(pts)`, then `addScallopedFrontLineFromChordPairs(...)`.

The produced front-line geometry is app/operator-layer geometry, not scenario geometry. It is stored in Leaflet tactical-mission-graphic objects:

- Single segment: `L.Marker` with `_tmgData = { latlng1, latlng2, typeId: 'scalloped', ... }`.
- Multi segment: `L.LayerGroup` with `_tmgData.segments[]`, where each child segment is the same `L.Marker` structure.

Coordinate order inside the live front-line drawing pipeline is Leaflet `{lat, lng}` / `L.LatLng`. App layer export/import serializes these as `[lat, lng]`. Wargame/GeoJSON bridge helpers use `[lng, lat]` at their boundary, but that is separate from this operator-drawn front-line path.

## Saved Geometry

The front line is added to the active operator layer through `addToActiveLayer(...)`. It is persisted by `scheduleSaveToStorage()` and `UI_MOdified/client/io.js`.

- Export:
  - Single TMG: `kind: 'tmg-single'`, fields `latlng1`, `latlng2`, `typeId`, `color`, `strokeWidth`, `sessionId`, `scallopSide`.
  - Group TMG: `kind: 'tmg-group'`, field `points`, where `points[0]` is the first segment start and subsequent entries are segment ends.
- Import:
  - `importLayersData(...)` recreates segments with `createTmgLayer(...)`.

Point order is preserved. The drawing path may simplify rough freehand baseline polylines in `convertPolylineToTmgScalloped()` via `simplifyPolylinePoints(...)`, and obstacle routing can add intermediate points in `expandScallopedControlPointsToChordPairs(...)`, but the chain direction remains the operator/input direction.

## Auto Button And Output

There are two related buttons:

- `#free-draw-convert-line-btn`, label `Convert line to frontline`, built in `createConvertLineButton()` in `free_draw_signature.js`.
- Post-frontline flank panel buttons:
  - `#fd-bat-front-draw`, `#fd-bat-deep-draw`, `#fd-bat-both`
  - `#fd-brig-front-draw`, `#fd-brig-deep-draw`, `#fd-brig-both`
  - custom equivalents `#fd-cust-front-draw`, `#fd-cust-deep-draw`, `#fd-cust-both`

These call `callFlank(mode, tag)`, which calls `window.autoDrawCircleXFlankLines(opts)` in `app.js`.

Input geometry:

- Circle-X anchors from `getCircleXCenters()`.
- Scalloped front-line segments from `getScallopedSegments()` / `collectOrderedScallopedSegmentsForSession()`.

Output geometry:

- Auto flank polygons/lines rendered by `renderClippedAutoFlankRings(...)`.
- They are tagged with `_autoFlankLine` and `_tmgData.typeId` values such as `auto-flank-area`, `auto-flank-area-outline`, `auto-flank-area-seam`, `auto-flank-area-divider`, plus echelon label markers.
- Output mutates the operator layer and is persisted with `scheduleSaveToStorage()`. It does not write scenario JSON/BLS/objectives.

## Geometry Algorithm

Scalloped front-line rendering:

- `createTmgLayer(latlng1, latlng2, 'scalloped', ...)` computes screen-space direction:
  - `dx = p2.x - p1.x`
  - `dy = p2.y - p1.y`
  - `angle = atan2(dy, dx)`
- The SVG path in `symbology.js` has scallop arcs above the baseline: `Q...,6 ...` against baseline `y=20`.
- Therefore the visual side depends on segment point order. Reversing `latlng1`/`latlng2` rotates the same SVG 180 degrees and flips the scallop side.

Auto-flank generation:

- `getFrontLineAxis()` sums segment vectors and uses that as the directed front axis.
- `getOrderedLCRCircleCentersForAutoFlank(axisData)` sorts anchors along that axis.
- `buildRectangleAutoFlankZoneRings(...)` builds the front path from scalloped segments, normalizes its endpoints toward the left/right anchors, and computes a rear bearing.
- `getAutoFlankRearBearingChord(trueLeft, trueRight)` chooses a perpendicular to the front chord.

Root cause found:

The old side detection in `getScallopBulgeSideRelativeToChord(...)` tried to infer which side the scallops bulged toward by measuring each segment midpoint against the baseline. Segment midpoints lie on the baseline; they are not the SVG arc apex/control point. This made side detection return `null` or an unstable sign, after which `getAutoFlankRearBearingChord(...)` fell back to a fixed `+90` perpendicular. The result looked mirrored when the operator drew the same tactical line in the opposite direction.

This is not a `[lat,lng]` vs `[lng,lat]` bug. It is a missing side-intent bug combined with a midpoint-based visual-side heuristic.

## Implemented Debug Overlay

Added `window.RMOOZFrontLineDebug` in `app.js`:

- `show()` draws temporary debug graphics:
  - `P0`, `P1`, `P2...` original/saved point order.
  - yellow baseline per segment.
  - cyan segment direction arrow.
  - orange normal/control-point direction.
  - console table with points, `dx`, `dy`, side, control point, session id.
- `hide()` clears the overlay.
- `flip()` flips the current session side, redraws the scallops, refreshes auto-flank output, and saves.

The post-frontline panel now includes:

- `Debug Front Line`
- `Flip Side`

## Fix Direction

Added explicit `scallopSide` metadata:

- Operational default `scallopSide = -1`, matching the outside/red-reference side for the verified front-line workflow.
- Flipped `scallopSide = 1`.
- `getTmgIconOptions(...)` rotates scalloped icons by 180 degrees when `scallopSide === -1`, without reversing saved coordinates.
- `getScallopBulgeSideRelativeToChord(...)` now uses `scallopSide` and accounts for whether each saved segment direction is aligned or opposed to the normalized chord.
- `io.js` persists `scallopSide` through export/import.

Recommended product rule:

Keep the explicit UI control. Geometry alone cannot know tactical inside/outside unless RMOOZ is also given friendly/enemy side, AO polygon semantics, or an enemy-side click. A future stronger workflow would be: operator draws the line, then clicks the enemy side. Until then, `Flip Side` is deterministic and auditable.

## Tests

Added `test-frontline-direction-debug.js`.

It verifies:

- Side detection uses `scallopSide`.
- The old midpoint-offset heuristic is removed.
- Scalloped rendering can flip without coordinate reversal.
- Debug/flip controls are present.
- `scallopSide` persists through IO.
- Auto-flank depth/control geometry derives from the same canonical side helper but renders on the opposite side from the scallop arc.

Added/extended `scripts/verify-frontline-persistence.js`.

It drives the browser workflow in Edge, draws a front line, generates the auto-flank structure, flips side, exports, reloads/imports, and asserts:

- Default structural generated side is `-scallopSide`.
- Flipped structural generated side reverses while preserving `generatedDepthSide = -scallopSide`.
- Exported JSON includes `scallopSide`.
- Reload/import preserves side and generated type counts.
- No console/page errors occur.

## Full Auto-Generated Structure Audit

The geometry produced after the front line is drawn and a flank button is clicked is created by `autoDrawCircleXFlankLines(...)` in `UI_MOdified/client/app.js`.

| Geometry | Style | Creator | Side source | Persistence |
| --- | --- | --- | --- | --- |
| Blue scalloped front-line segments | `typeId: scalloped`, friendly blue `#3b82f6` | `createTmgLayer(...)`, grouped by `addScallopedFrontLineFromChordPairs(...)` | Directly stores `scallopSide`; visual flip is done by icon rotation | Exported/imported as `tmg-single` or `tmg-group` with `scallopSide` |
| Auto-flank/depth area polygons | `auto-flank-area`, fill/stroke blue, `fillOpacity: 0.08` | `renderClippedAutoFlankRings(...)` from rings built in `buildRectangleAutoFlankZoneRings(...)` | Uses `rearBear` from `getAutoFlankRearBearingChord(...)`, which converts the scallop combat side into the opposite rendered rear/depth side | Exported/imported as polygon/multipolygon with `autoFlank` metadata |
| Auto-flank area outlines | `auto-flank-area-outline`, blue polyline | `addAreaOutlinePolyline(...)` | Derived from the already-side-selected polygon rings | Exported/imported as polyline with `autoFlank` metadata |
| Battalion/deep seam line | `auto-flank-area-seam`, blue polyline | `renderClippedAutoFlankRings(...)` from `seamSegment` | `seamSegment` is built from `trueLeft8/trueRight8`, both offset using canonical `rearBear` | Exported/imported as polyline with `autoFlank` metadata |
| Battalion divider/control line | `auto-flank-area-divider`, blue polyline | `renderClippedAutoFlankRings(...)` from `battalionDivider` | Divider endpoint `divB` uses canonical `rearBear`; `divA` uses the opposite bearing only to make a full cut line through the area | Exported/imported as polyline with `autoFlank` metadata |
| Echelon/support labels | `auto-flank-echelon`, label markers | `addAutoFlankEchelonMarkers(...)` | No independent side logic; labels are stamped on generated polygons/seams/dividers | Not exported directly; re-derived from imported auto-flank geometry |
| Temporary orange debug control vectors | orange debug lines/points | `showFrontLineDebugOverlay()` | Directly uses `scallopSide` as source of truth for the control/apex side | Temporary only; not persisted |

No separate old normal-side logic remains in the auto-flank/depth path. The only tactical side choice is the front-line `scallopSide`; all generated polygons, outlines, seams, dividers, and labels are downstream of that decision and render on `-scallopSide`.

## Browser Verification

Latest browser proof was run with:

```powershell
node scripts\verify-frontline-persistence.js
```

Artifacts:

- `docs/frontline-verification-artifacts/frontline-before-flip.png`
- `docs/frontline-verification-artifacts/frontline-after-flip.png`
- `docs/frontline-verification-artifacts/frontline-after-reload.png`
- `docs/frontline-verification-artifacts/frontline-export.geojson`
- `docs/frontline-verification-artifacts/frontline-verification-result.json`

Observed result:

- Before flip: `scallopSide = -1`; generated structural side `1`; generated types `auto-flank-area: 2`, `auto-flank-area-outline: 2`, `auto-flank-echelon: 8`.
- After flip: `scallopSide = 1`; generated structural side `-1`; generated types `auto-flank-area: 1`, `auto-flank-area-outline: 1`, `auto-flank-echelon: 3`.
- After reload/import: `scallopSide = 1`; generated structural side `-1`; generated type counts unchanged from after flip.
- Exported front-line app payload includes `"scallopSide": 1`.
- Console errors: none. Page errors: none.
