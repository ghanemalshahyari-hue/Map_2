# DEMO-ACTUAL-1B Preview Verification

Date: 2026-06-12

Current baseline commit: `3d723f2` (`feat(DOC-UNDERSTANDING-1): build AI decision demo scenario preview`)

## Fixture Used

Browser verification used `/tmp/Iran_Qatar_step1_updated_red_blue_trial.json`, generated from the current Iran/Qatar Step 1 test fixture shape in `test-external-step1-live-route.js`.

The named fixture was not present in the clean checkout, so the verification fixture preserved the same Step 1 wrapper pattern, Hamedan / Bandar Abbas / Chabahar base content, placement candidate, and review-only semantics.

## What Was Verified

- Loaded the RMOOZ app in Chromium.
- Uploaded the Step 1 JSON through the MDMP JSON picker.
- Ran `Review AI Understanding`.
- Confirmed `Preview Decision Steps — معاينة خطوات القرار` appears.
- Clicked the preview button.
- Confirmed the preview panel appears.
- Confirmed Step `1 / 6`, middle Step `4 / 6`, and final Step `6 / 6` render.
- Confirmed movement/action lines update on middle and final steps.
- Confirmed the visible `Clear Preview / مسح المعاينة` control removes the preview panel and all preview layers.
- Confirmed browser console had no unexpected errors or warnings after auth / plan / SSE verification stubs were supplied.
- Confirmed the panel warning includes `preview_only`, `approximate_route`, and `requires_review`.
- Confirmed the panel is bounded away from the header and bottom timeline/status band.

## Screenshot Evidence

- `docs/demo-actual-1-preview-verification/preview-step-1.png`
- `docs/demo-actual-1-preview-verification/preview-step-middle.png`
- `docs/demo-actual-1-preview-verification/preview-step-final.png`
- `docs/demo-actual-1-preview-verification/preview-clear.png`
- `docs/demo-actual-1-preview-verification/browser-verification.json`

## Tests Run

- `node test-demo-scenario-preview.js`
- `node test-base-status-panel-a.js`
- `node test-symbol-db-b.js`
- `node test-g4-tasking-overlay-preview-indicator.js`
- `node test-step1-unified-bases-map-anchors.js`
- `git diff --check`

## Known Limitations

- The local real server auth path returned HTTP 500 in this environment, so browser verification used a small local verification server that stubs auth, plan bootstrap, and SSE shell endpoints while routing `/api/wargame-sim/analyze`, `/api/wargame-sim/placement`, and `/api/wargame-sim/generate-preview` through the real `wargame-sim-bridge.js`.
- The Scenario Workspace opens, but the source/import subsection is collapsed in the headless harness; the harness revealed that existing subsection to drive the upload/analyze path.
- Preview movement remains intentionally approximate and review-only. It does not create final scenario units, persist data, mutate imported JSON, mutate `proposed_units`, or write live scenario state.
