'use strict';

const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules', 'playwright'));

let passed = 0;
let failed = 0;
function ok(label, cond, detail) {
    if (cond) {
        passed += 1;
        console.log('  PASS  ' + label);
    } else {
        failed += 1;
        console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : ''));
    }
}

function close(a, b) {
    return Math.abs(+a - +b) < 1e-6;
}

console.log('\n=== MOV2b browser smoke: runtime movement map display ===\n');

(async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const browserErrors = [];

    page.on('console', function (msg) {
        if (msg.type() === 'error') browserErrors.push('console error: ' + msg.text());
    });
    page.on('pageerror', function (err) {
        browserErrors.push('pageerror: ' + (err && err.message || String(err)));
    });

    try {
        await page.setContent([
            '<!doctype html><html><head><meta charset="utf-8">',
            '<style>#map{width:800px;height:600px}.wg-adj-sidc{}</style>',
            '</head><body><div id="map"></div></body></html>'
        ].join(''));
        await page.addScriptTag({ path: path.join(__dirname, 'UI_MOdified', 'lib', 'leaflet.js') });
        await page.evaluate(function () {
            window.t = function (s) { return s; };
            window.map = window.L.map('map').setView([0, 0], 6);
        });
        await page.addScriptTag({ path: path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js') });
        await page.addScriptTag({ path: path.join(__dirname, 'UI_MOdified', 'client', 'wargame', 'adjudicator-map.js') });

        const result = await page.evaluate(function () {
            function clone(v) { return JSON.parse(JSON.stringify(v)); }
            function ll(m) {
                var p = m && m.getLatLng && m.getLatLng();
                return p ? { lat: +p.lat, lng: +p.lng } : null;
            }
            function ownedFromMovementState(state) {
                var positions = state.runtime_positions || {};
                var movements = state.movements || {};
                var out = {};
                Object.keys(positions).forEach(function (uid) {
                    var p = positions[uid];
                    var mv = null;
                    Object.keys(movements).some(function (mid) {
                        var cand = movements[mid];
                        if (cand && String(cand.unit_id || '') === String(uid)) { mv = cand; return true; }
                        return false;
                    });
                    out[uid] = {
                        position: [+p[0], +p[1]],
                        source: 'runtime_movement',
                        movement_status: mv && mv.status || 'moving',
                        movement_id: mv && mv.movement_id || null,
                        eta_elapsed_hours: mv && mv.eta_elapsed_hours,
                        progress: mv && mv.progress
                    };
                });
                return out;
            }
            function publish(state) {
                window.AppAdjudicatorMap.setOwnedRunPositions(ownedFromMovementState(state));
                return ll(marker);
            }

            window.units = [{ uid: 'external-unit', coord: [99, 99] }];
            var unitsBefore = clone(window.units);
            var scenario = {
                name: 'mov2b-browser-smoke',
                map_bbox: [-1, -1, 2, 2],
                obj: { name: 'OBJ', coord: [1, 1], target_depth_km: 1, carver: 1 },
                pipeline: [[0, 0], [1, 1]],
                bls_template: [],
                blue_units_initial: [
                    { unit_uid: 'U1', base_id: 'U1', role: 'infantry', domain: 'ground', coord: [0, 0] }
                ]
            };
            var scenarioBefore = clone(scenario);

            window.AppAdjudicatorMap.drawScenario(scenario);
            var marker = window.AppAdjudicatorMap._findBlueMarkerByBaseId('U1');
            var initial = ll(marker);
            var unitExists = !!window.AppAdjudicatorMap.getUnit('U1');

            var plan = {
                execution_id: 'browser-smoke-move-1',
                effect_kind: 'runtime_movement',
                classification: 'requires_world_state_executor',
                status: 'requires_executor',
                payload: { unit_id: 'U1', from: [0, 0], to: [1, 0], route: [[0, 0], [1, 0]], speed: 0.25 }
            };
            var started = window.AppRuntimeMovement.startMovementExecutionPlans(null, [plan], { elapsed_hours: 0 });
            var moving = window.AppRuntimeMovement.updateRuntimeMovementState(started.state, 2, {});
            var afterMove = publish(moving.state);
            var sourceAfterMove = marker && marker._rmoozRuntimeOwnedPosition && marker._rmoozRuntimeOwnedPosition.source;

            var paused = window.AppRuntimeMovement.updateRuntimeMovementState(moving.state, 3, { paused: true });
            var afterPause = publish(paused.state);

            var resumed = window.AppRuntimeMovement.updateRuntimeMovementState(paused.state, 4, {});
            var afterResume = publish(resumed.state);

            var arrived = window.AppRuntimeMovement.updateRuntimeMovementState(resumed.state, 5, {});
            var afterArrival = publish(arrived.state);

            window.AppAdjudicatorMap.setOwnedRunPositions(null);
            var afterReset = ll(marker);

            return {
                appLoaded: !!(window.AppRuntimeMovement && window.AppAdjudicatorMap && window.L),
                unitExists: unitExists,
                initial: initial,
                afterMove: afterMove,
                afterPause: afterPause,
                afterResume: afterResume,
                afterArrival: afterArrival,
                afterReset: afterReset,
                arrivalCount: arrived.state.arrival_events.length,
                markerOwnedSource: sourceAfterMove,
                scenarioUnchanged: JSON.stringify(scenario) === JSON.stringify(scenarioBefore),
                windowUnitsUnchanged: JSON.stringify(window.units) === JSON.stringify(unitsBefore)
            };
        });

        ok('T-1 app/map movement scripts load without runtime JS error', result.appLoaded && browserErrors.length === 0, browserErrors.join('; '));
        ok('T-2 a test unit marker exists safely', result.unitExists && result.initial && close(result.initial.lat, 0) && close(result.initial.lng, 0));
        ok('T-3 runtime-owned movement position is published', result.markerOwnedSource === 'runtime_movement');
        ok('T-4 marker LatLng changes from A to B', result.afterMove && result.afterMove.lng > result.initial.lng && close(result.afterMove.lat, 0));
        ok('T-5 pause keeps marker LatLng unchanged', close(result.afterPause.lng, result.afterMove.lng) && close(result.afterPause.lat, result.afterMove.lat));
        ok('T-6 resume changes marker LatLng again', result.afterResume.lng > result.afterPause.lng && close(result.afterResume.lat, 0));
        ok('T-7 arrival leaves marker at final coordinate once', close(result.afterArrival.lng, 1) && close(result.afterArrival.lat, 0) && result.arrivalCount === 1);
        ok('T-8 reset clears runtime override or restores marker display', result.afterReset && close(result.afterReset.lng, 0) && close(result.afterReset.lat, 0));
        ok('T-9 window.units is not mutated', result.windowUnitsUnchanged === true);
        ok('T-10 scenario JSON is not mutated', result.scenarioUnchanged === true);
        ok('T-11 no browser console/page errors', browserErrors.length === 0, browserErrors.join('; '));
    } finally {
        await browser.close();
    }

    if (failed) {
        console.error('\nMOV2b browser smoke failed: ' + failed + ' failure(s).');
        process.exit(1);
    }
    console.log('\nMOV2b browser smoke passed: ' + passed + ' assertions.');
})().catch(function (err) {
    console.error(err && err.stack || err);
    process.exit(1);
});
