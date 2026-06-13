# RMOOZ AI Review Flow — Start Here

This is the permanent engineering entrypoint for the RMOOZ AI import/review/map-preview flow. Read this before changing the review screen, map overlays, preview animation, or draft generation.

## Current known state

The app has several visual layers that can look similar. Future debugging must classify the marker or layer before assuming a placement bug.

## First files to inspect

1. `UI_MOdified/client/shell/scenario-import-wizard.js`
   - Import modal and review trigger.
   - `runAnalyze()` calls the analyze endpoint.
   - `attachPlacement()` adds placement candidates.
   - `generateFromReviewedBrief()` calls draft generation.

2. `UI_MOdified/client/shell/doc-understanding-review.js`
   - Main AI Understanding review renderer.
   - Wires both the older preview animation and the newer Free Fight preview.
   - This is the first place to check for duplicate buttons or duplicate overlay mounting.

3. `UI_MOdified/client/shell/placement-candidates-panel.js`
   - Draws review-only anchor markers.
   - Important marker metadata:
     - `_rmoozStep1PlacementAnchor`
     - `_rmoozReviewOnly`
     - `_rmoozExactUnitPosition = false`
   - Exposes:
     - `window.__rmoozStep1PlacementAnchorLayer`
     - `window.__rmoozStep1PlacementAnchorCount`

4. `UI_MOdified/client/shell/base-status-panel.js`
   - Shows imported proposed rows under a selected anchor.
   - Needs explicit ID matching before name/coordinate fallback.

5. `UI_MOdified/client/shell/demo-units.js`
   - Builds review-only preview groups from proposed rows and anchors.
   - `buildGroupsFromAnchors()` is the preferred helper.

6. `UI_MOdified/client/shell/demo-movement.js`
   - Older preview overlay.
   - Known issue: uses a center/centroid target and is not the newer domain-aware path.
   - Can remain visible when the newer preview is also mounted.

7. `UI_MOdified/client/shell/free-fight-demo.js`
   - Newer preferred preview overlay.
   - Markers should be demo/review-only and not exact positions.

8. `UI_MOdified/client/shell/domain-movement.js`
   - Movement helper for preview behavior only.
   - Does not change draft scenario placement.

9. `UI_MOdified/server/ai/brief-to-scenario.js`
   - Draft generator.
   - Known issue: generated draft coordinates are currently template-based around the selected target point.

10. `UI_MOdified/server/wargame-sim-bridge.js`
   - Main API router.
   - Analyze and placement are read-only.
   - Generate writes a draft.
   - Run is the older legacy path.

## Proven audit findings

- After review render, anchor markers are visible and preview markers should be zero unless a preview is intentionally started.
- Imported proposed rows are not drawn as individual exact map markers during review.
- The older preview overlay and newer Free Fight overlay can both exist at the same time.
- The older preview overlay moves groups toward a computed center point and is not domain-aware.
- The newer preview overlay is the preferred path and marks its markers as review/demo-only.
- If draft items appear around the selected target after Generate, inspect `brief-to-scenario.js`; that is draft-generation behavior, not the review anchor layer.

## Marker classes

- `.step1-review-placement-anchor` = review anchor marker.
- `.rmooz-demo-move-marker` = older preview overlay marker.
- `.rmooz-ff-group` = newer Free Fight preview marker.
- `.rmooz-ff-objective` = review/preview target marker.

## Known root causes

1. Duplicate overlay confusion:
   - Old preview and newer preview can stack.
   - Fix by cross-clearing one preview before mounting the other.

2. Old preview behavior:
   - The older preview uses a computed center point.
   - Fix by hiding/collapsing it, relabeling it as legacy, or routing it through the newer helper.

3. User-facing labels:
   - Moving preview markers need clear labels saying they are preview-only and not imported exact positions.

4. Base Status linking:
   - `base-status-panel.js` should match rows to anchors by explicit ID first.
   - Then fallback to existing name/coordinate matching.

5. Draft generation clarity:
   - `brief-to-scenario.js` should add provenance flags to draft positions so the UI knows they are generated placeholders.

## Next patch checklist

1. Add or verify `clear()` APIs for both preview systems.
2. In the review renderer, clear old preview before mounting newer preview.
3. Clear newer preview before mounting old preview if the old button remains.
4. Add a visible preview-only legend near the preview controls.
5. Strengthen Base Status ID matching.
6. Add draft-position provenance flags in `brief-to-scenario.js`.

## Browser checks

Run after import and review render:

```js
{
  anchors: window.__rmoozStep1PlacementAnchorCount || 0,
  hasAnchorLayer: !!window.__rmoozStep1PlacementAnchorLayer,
  freeFightState: window.RmoozFreeFightDemo && window.RmoozFreeFightDemo.getState && window.RmoozFreeFightDemo.getState(),
  freeFightGroups: window.RmoozFreeFightDemo && window.RmoozFreeFightDemo.getGroups && window.RmoozFreeFightDemo.getGroups()
}
```

Expected before preview starts:

- anchors > 0
- old preview markers = 0
- newer preview markers = 0 unless intentionally mounted

Expected after clear:

- preview markers removed
- review anchors remain

## Decision rule

If a marker appears near the selected target point, classify it first:

1. `.rmooz-ff-group` means newer preview overlay.
2. `.rmooz-demo-move-marker` means old preview overlay.
3. `.step1-review-placement-anchor` means review anchor.
4. Draft item after Generate means inspect `brief-to-scenario.js`.

Do not assume imported proposed rows are misplaced until marker metadata proves it.
