# DEMO-ACTUAL-1E Preview Evidence Refresh

Date: 2026-06-12

Verification was refreshed on local `main` after the DEMO-ACTUAL-1B/1C/1D commits:

- `3d723f2` `feat(DOC-UNDERSTANDING-1): build AI decision demo scenario preview`
- `d02ab33` `docs(DOC-UNDERSTANDING-1): verify AI decision demo scenario preview`
- `5f40cec` `feat(DOC-UNDERSTANDING-1): improve AI decision preview step quality`
- `5dd93e7` `feat(DOC-UNDERSTANDING-1): improve AI decision preview map visuals`

This refresh also tightens the preview panel height clamp so the richer final-step panel stays clear of the bottom chrome in the verification viewport.

## Fixture Used

Browser verification used `/tmp/Iran_Qatar_step1_updated_red_blue_trial.json`, materialized from `test-external-step1-live-route.js::IRAN_QATAR_STEP1`.

That fixture preserves the wrapped External App Step 1 shape, Hamedan / Bandar Abbas / Chabahar base content, extracted placement candidates, proposed RED unit groups, review-only semantics, and `exact_unit_position:false` behavior.

## Browser Verification

- Loaded the RMOOZ app in Chromium through a local verification server.
- Routed `/api/wargame-sim/analyze`, `/api/wargame-sim/placement`, and `/api/wargame-sim/generate-preview` through the real `wargame-sim-bridge.js`.
- Confirmed Step 1 analyze/review returned `kind:"mdmp_external"` and `External App Step 1`.
- Confirmed `Preview Decision Steps — معاينة خطوات القرار` appears.
- Clicked `Preview Decision Steps`.
- Confirmed Step `1 / 7` renders with `Initial posture — تمركز ابتدائي`, action/reason/risk/evidence, units, related bases, review warning, and legend.
- Confirmed middle Step `4 / 7` renders `Main movement/action — الحركة أو العمل الرئيسي` with active movement/action lines.
- Confirmed final Step `7 / 7` renders `Decision point — نقطة قرار`.
- Confirmed movement/action lines preserve `approximate_route:true` and `requires_review:true`.
- Confirmed preview units, movement lines, target markers, panel, and legend are removed by `Clear Preview / مسح المعاينة`.
- Confirmed no unexpected browser console errors.
- Confirmed the preview panel does not overlap the header, footer, timeline, or status chrome.

## Visual Improvements Refreshed

- Operational seven-step preview titles from DEMO-ACTUAL-1C.
- Step body fields for action, reason, risk, evidence, units involved, related bases/anchors, and review warning.
- Friendly/enemy preview unit marker styling with labels and preview-only tooltips.
- Stronger active movement/action line styling with read-only tooltip/popup metadata.
- Approximate target marker labeled `Approximate target / requires review`.
- Small legend for friendly preview unit, enemy preview unit, approximate movement/action, and requires review.

## Evidence Artifacts

- `docs/demo-actual-1-preview-verification/preview-step-1.png`
- `docs/demo-actual-1-preview-verification/preview-step-middle.png`
- `docs/demo-actual-1-preview-verification/preview-step-final.png`
- `docs/demo-actual-1-preview-verification/preview-clear.png`
- `docs/demo-actual-1-preview-verification/browser-evidence.json`

## Tests Run

- `node test-demo-scenario-preview.js` -> 118 passed
- `node test-base-status-panel-a.js`
- `node test-symbol-db-b.js`
- `node test-step1-unified-bases-map-anchors.js`
- `git diff --check`

## Known Limitations

- Preview only: no final scenario export.
- Routes are approximate and marked `approximate_route:true`.
- Commander/operator review is required before use.
- No Step 3/4/5 ingestion yet.
- No single-file classifier work in this pass.
- No tasking editor or G-4 tasking mutation.
- No imported JSON, `proposed_units`, placement anchor, or live scenario mutation.
