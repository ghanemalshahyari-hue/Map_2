/**
 * verify-pr-288M.js — BROWSER-CONSOLE verification for PR-288M.
 *
 * PR-288M wires the Scenario Workspace live-load path to the existing
 * adjudicator map: loadLiveScenarioFromJson() now calls the new guarded bridge
 * maybeDrawLiveScenarioOnMap(), which delegates to
 * window.AppAdjudicatorMap.drawScenario() so BLS / scenario markers appear on
 * the map when a scenario is loaded through the workspace.
 *
 * This file is NOT a Node test (that is test-pr-288M.js). It is the in-page
 * routine used to verify the wiring against the LIVE map on the rmooz-web
 * preview server. Paste the whole file into the browser console on
 *   http://localhost:8000/client/app.html
 * (or inject via the preview eval tool), then call:  await verifyPr288M()
 *
 * Prereqs (all true on the rmooz-web verify server):
 *   - window.AppShellScenarioWorkspace.loadLiveScenarioFromJson is present
 *     (i.e. the PR-288M build is loaded — confirm
 *      typeof window.AppShellScenarioWorkspace.maybeDrawLiveScenarioOnMap
 *      === 'function'; hard-reload with ?v=Date.now() if it is not).
 *   - window.L + window.map (Leaflet) initialised, window.AppAdjudicatorMap up.
 *
 * Observed result (2026-05-29, wargame3.json, 17 steps, 1 BLS):
 *   loadPassed             : true
 *   mapDraw                : { painted:true, reason:"painted", warnings:[] }
 *   isScenarioDrawn before : false   after : true
 *   .wg-adj-bls  before    : 0       after : 1     (== bls_template.length)
 *   .leaflet-marker-icon   : 166     (full scenario draw: units + BLS + off-map)
 *   console errors         : none
 *
 * NOTE on screenshots: the headless preview viewport reports height 1px, so a
 * visual screenshot is a blank sliver. Verification is therefore done at the
 * DOM level (marker counts + isScenarioDrawn), which is direct observation of
 * the rendered Leaflet layer rather than an inferred claim.
 */

/* global window, document, fetch */
async function verifyPr288M(scenarioUrl) {
    scenarioUrl = scenarioUrl || '/data/scenarios/wargame3.json';
    var out = { checks: [], passed: 0, failed: 0 };
    function ok(cond, label, detail) {
        out.checks.push({ pass: !!cond, label: label, detail: detail });
        if (cond) out.passed++; else out.failed++;
        // eslint-disable-next-line no-console
        console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + label +
                    (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''));
    }

    var sw  = window.AppShellScenarioWorkspace;
    var map = window.AppAdjudicatorMap;
    ok(sw && typeof sw.loadLiveScenarioFromJson === 'function',
       'load path present');
    ok(sw && typeof sw.maybeDrawLiveScenarioOnMap === 'function',
       'PR-288M bridge is loaded (hard-reload if FAIL)');
    ok(map && typeof map.drawScenario === 'function',
       'AppAdjudicatorMap.drawScenario present');
    ok(typeof window.L !== 'undefined' && !!window.map,
       'Leaflet map is live');

    var drawnBefore = !!(map && map.isScenarioDrawn && map.isScenarioDrawn());
    var blsBefore   = document.querySelectorAll('.wg-adj-bls').length;

    var json   = await (await fetch(scenarioUrl)).json();
    var result = sw.loadLiveScenarioFromJson(json);
    // let Leaflet attach marker DOM
    await new Promise(function (r) { setTimeout(r, 200); });

    var drawnAfter = !!(map && map.isScenarioDrawn && map.isScenarioDrawn());
    var blsAfter   = document.querySelectorAll('.wg-adj-bls').length;
    var blsLen     = Array.isArray(json.bls_template) ? json.bls_template.length : 0;

    ok(result && result.passed === true, 'scenario load passed',
       { scenarioId: result && result.scenarioId, steps: result && result.stepCount });
    ok(result && result.mapDraw && result.mapDraw.painted === true &&
       result.mapDraw.reason === 'painted',
       'load result.mapDraw === painted', result && result.mapDraw);
    ok(drawnBefore === false && drawnAfter === true,
       'isScenarioDrawn() went false → true', { before: drawnBefore, after: drawnAfter });
    ok(blsAfter > blsBefore && blsAfter === blsLen,
       'BLS markers drawn (count == bls_template length)',
       { before: blsBefore, after: blsAfter, bls_template: blsLen });
    ok(document.querySelectorAll('.leaflet-marker-icon').length > 0,
       'scenario markers present on the map',
       { leafletMarkers: document.querySelectorAll('.leaflet-marker-icon').length });

    // eslint-disable-next-line no-console
    console.log('\nPR-288M verify: ' + out.passed + ' passed, ' + out.failed + ' failed → ' +
                (out.failed === 0 ? 'PASS' : 'FAIL'));
    return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { verifyPr288M: verifyPr288M };
