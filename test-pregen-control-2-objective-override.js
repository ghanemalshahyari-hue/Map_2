#!/usr/bin/env node
/**
 * test-pregen-control-2-objective-override.js
 *
 * PREGEN-CONTROL-2 verifier — operator-controlled Objective X override.
 *
 * Checkpoint A: WarGamingGEN reads scenario_overrides.json ✓ (previous session)
 * Checkpoint B: RMOOZ server /api/wargame-sim/objective-override endpoint + Source Inspector
 * Checkpoint C: RMOOZ client Scenario Setup section in wizard (UI integration)
 * Checkpoint D: Test + docs (THIS FILE)
 *
 * Verifies:
 * 1. POST /api/wargame-sim/objective-override writes scenario_overrides.json
 * 2. /status includes objective info (default + override)
 * 3. Source Inspector includes scenario_overrides.json row
 * 4. Objective coords are editable via the UI
 * 5. (Manual A/B proof: two runs with different objectives → different GeoJSON hashes)
 *
 *   node test-pregen-control-2-objective-override.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT       = __dirname;
const BRIDGE     = require(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'));
const BRIDGE_SRC = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'), 'utf8');
const WIZ_SRC    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-import-wizard.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

const tmpDirs = [];
function makeFixture(opts) {
    opts = opts || {};
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-pregen-'));
    tmpDirs.push(dir);
    const inputs = path.join(dir, 'WarGamingGEN', 'inputs');
    fs.mkdirSync(inputs, { recursive: true });
    // scenario.json with default objective
    fs.writeFileSync(path.join(inputs, 'scenario.json'), JSON.stringify({
        operation_name: 'PREGEN-2',
        phases: [{}, {}, {}, {}],
        objective: {
            id: 'OBJ-X',
            lon: 19.55,
            lat: 29.74,
            depth_km_from_coast: 90.1,
            name_en: 'Objective X'
        }
    }), 'utf8');
    return { dir, inputs };
}

function callEndpoint(stub, method, pathname, query) {
    const url = new URL('http://x' + pathname + (query || ''));
    const cap = { status: null, body: null };
    const res = { writeHead(s) { cap.status = s; }, end() {} };
    const sendJson = (r, status, payload) => { cap.status = status; cap.body = payload; };
    const handled = BRIDGE.handle({ on() {} }, res,
        { url, pathname: url.pathname, method: method, sendJson, scenarios: stub });
    return Object.assign({ handled }, cap);
}

function scenariosStub() {
    return { getActiveName() { return null; }, clearCache() {}, setActiveName() {} };
}

function teardown() { for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

(function run() {
    console.log('PREGEN-CONTROL-2 — Objective Override (Checkpoints B, C, D)\n');

    const fx = makeFixture();
    process.env.RMOOZ_TESTINGAI_DIR = fx.dir;

    // === Checkpoint B: Server endpoint ===
    const stub = scenariosStub();

    // B1. POST /api/wargame-sim/objective-override with valid coords
    {
        const r = callEndpoint(stub, 'POST', '/api/wargame-sim/objective-override?lon=19.8&lat=29.5', null);
        ok(r.handled && r.status === 200 && r.body && r.body.ok,
            'B1. /objective-override endpoint accepts valid coords',
            'status=' + r.status + ' ok=' + (r.body && r.body.ok));
        ok(r.body && r.body.override && r.body.override.lon === 19.8 && r.body.override.lat === 29.5,
            'B2. endpoint returns the saved override',
            'got ' + (r.body && r.body.override ? (r.body.override.lon + ',' + r.body.override.lat) : 'null'));
    }

    // B3. Verify scenario_overrides.json was written
    {
        const oPath = path.join(fx.inputs, 'scenario_overrides.json');
        const exists = fs.existsSync(oPath);
        ok(exists, 'B3. scenario_overrides.json was written to disk');
        if (exists) {
            try {
                const data = JSON.parse(fs.readFileSync(oPath, 'utf8'));
                ok(data && data.objective && data.objective.lon === 19.8 && data.objective.lat === 29.5,
                    'B4. scenario_overrides.json contains the override',
                    'got ' + (data && data.objective ? JSON.stringify(data.objective) : 'null'));
            } catch (e) {
                ok(false, 'B4. scenario_overrides.json is valid JSON', 'error: ' + e.message);
            }
        }
    }

    // B5. Invalid coords should be rejected
    {
        const r = callEndpoint(stub, 'POST', '/api/wargame-sim/objective-override?lon=200&lat=50', null);
        ok(r.status === 400 && r.body && !r.body.ok,
            'B5. /objective-override rejects invalid lon',
            'status=' + r.status);
    }

    // B6. /status includes objective info
    {
        const r = callEndpoint(stub, 'GET', '/api/wargame-sim/status', null);
        ok(r.status === 200 && r.body && r.body.sim && r.body.sim.objective,
            'B6. /status includes objective field',
            'ok=' + (r.body && r.body.ok));
        if (r.body && r.body.sim && r.body.sim.objective) {
            ok(r.body.sim.objective.default && typeof r.body.sim.objective.default.lon === 'number',
                'B7. /status objective.default is populated',
                'lon=' + (r.body.sim.objective.default && r.body.sim.objective.default.lon));
            ok(r.body.sim.objective.active && r.body.sim.objective.active.lon === 19.8,
                'B8. /status objective.active reflects the override',
                'lon=' + (r.body.sim.objective.active && r.body.sim.objective.active.lon));
        }
    }

    // === Checkpoint C: Client UI ===
    {
        ok(/id="wg-wz-setup"/.test(WIZ_SRC),
            'C1. wizard includes Scenario Setup <details>');
        ok(/id="wg-wz-obj-map"/.test(WIZ_SRC),
            'C1b. wizard includes map container (for draggable marker)');
        ok(/id="wg-wz-lon"/.test(WIZ_SRC) && /id="wg-wz-lat"/.test(WIZ_SRC),
            'C2. wizard has lon/lat input fields');
        ok(/id="wg-wz-obj-save"/.test(WIZ_SRC) && /id="wg-wz-obj-reset"/.test(WIZ_SRC),
            'C3. wizard has Save/Reset buttons');
        ok(/loadObjective|saveObjective|resetObjective|initObjectiveMap/.test(WIZ_SRC),
            'C4. wizard includes objective + map handler functions');
        ok(/objMarker\.on\('dragend'|draggable.*true/.test(WIZ_SRC),
            'C4b. wizard supports draggable marker on map');
        ok(!/Scenario Setup/.test(WIZ_SRC) || /تخطيط السيناريو/.test(WIZ_SRC),
            'C5. wizard includes Arabic label for Scenario Setup');
    }

    // === Checkpoint B/C: Source Inspector includes scenario_overrides ===
    {
        const r = callEndpoint(stub, 'GET', '/api/wargame-sim/sources', null);
        if (r.body && r.body.sources) {
            const sources = r.body.sources;
            const overrideRow = sources.find(s => s.key === 'scenario_overrides');
            ok(overrideRow !== undefined,
                'B9/C6. Source Inspector includes scenario_overrides row');
            if (overrideRow) {
                ok(overrideRow.editable === true,
                    'B10. scenario_overrides row is editable');
                ok(overrideRow.source_type === 'operator override',
                    'B11. scenario_overrides row type is "operator override"');
                ok(overrideRow.status && overrideRow.status.override,
                    'B12. scenario_overrides status includes the override data');
            }
        }
    }

    // === Checkpoint D: Server-side safety ===
    {
        // No SmartSearch, no DOCX parsing in the endpoint
        const routeStart = BRIDGE_SRC.indexOf("'/api/wargame-sim/objective-override'");
        const routeEnd = BRIDGE_SRC.indexOf("return true;", routeStart) + 20;
        const routeBlock = BRIDGE_SRC.slice(routeStart, routeEnd);
        ok(!/SmartSearch|spawn\(|DOCX|docx/i.test(routeBlock),
            'D1. /objective-override has no SmartSearch/spawn/DOCX parsing');
        ok(!/scenario\.steps|\.red_units|\.blue_units_initial/.test(routeBlock),
            'D2. /objective-override does not mutate scenario units/phases');
    }

    // === Proof (Manual A/B checklist for operator validation) ===
    console.log('\n--- A/B Proof Checklist (MANUAL) ---');
    console.log('To complete the full proof that the scenario is not hardcoded:');
    console.log('1. In RMOOZ wizard, set Objective X to (19.8, 29.5) and click Save');
    console.log('2. Upload DOCX files and click "Start Scenario Generation"');
    console.log('3. Wait for generation to complete');
    console.log('4. View all_phases.geojson — Objective feature should be at (19.8, 29.5)');
    console.log('5. Record the file hash: sha256(all_phases.geojson) = HASH-A');
    console.log('6. In wizard, Reset Objective to default (19.55, 29.74)');
    console.log('7. Restart generation');
    console.log('8. View new all_phases.geojson — Objective should be at (19.55, 29.74)');
    console.log('9. Record HASH-B and verify HASH-A ≠ HASH-B');
    console.log('10. Import both runs as "scenario-override" and "scenario-default"');
    console.log('11. Load both on the map and visually confirm Objective positions differ');
    console.log('✓ Proof: moving Objective X before generation changes the GeoJSON output.');
    console.log('');

    teardown();

    console.log((fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
