# Symbol DB Integration Design

## Selected Object Panel Contract

`window.openSelectedObjectPanel(object)` is the common read-only entry point for map/review selections.

Supported object kinds:

- `unit`: delegates to the existing Commander Unit Status Panel path.
- `base`: renders BASE-STATUS-A content for Step 1 base anchors and proposed unit groups.
- `infrastructure`: renders `Infrastructure status support pending`.
- unknown values: render an unsupported placeholder and do not throw.

Step 1 placement anchors call:

```js
openSelectedObjectPanel({
  object_kind: "base",
  source: "step1_external_app",
  review_only: true,
  exact_unit_position: false,
  data: candidateOrBaseData
});
```

The base view remains review-only. It displays base identity, side, type, location, grouped proposed units, catalog-required placeholders, doctrine-required status, and evidence/message log entries. It must not create final units, placement, tasking, COA, movement, execution, or world-state state.

## Catalog Boundary

Step 1 external app data can identify candidate base anchors and proposed platforms, but it is not a final symbol or capability database match. BASE-STATUS-A therefore uses category-only placeholders until a catalog record is available.

Required future integration points:

- stable base identifier or normalized base name
- platform catalog key or candidate keys
- symbol category candidate
- confidence and review status
- source file and source type
- doctrine requirement status

Until catalog integration is complete, missing sensors, weapons, comms, logistics, and doctrine-specific fields must render as catalog-required placeholders rather than inferred operational truth.
