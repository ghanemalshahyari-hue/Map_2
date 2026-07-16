#!/usr/bin/env node
/**
 * test-scenario-revision-compare-slice3.js — Batch D Slice 3
 *
 * Field-level revision compare: a structured, sectioned change summary
 * (units/placement/doctrine/missions/runtime events/objectives/victory
 * conditions/metadata) — not a raw JSON diff — plus the two new read-only
 * HTTP endpoints (list revisions, compare two revisions).
 *
 *   node test-scenario-revision-compare-slice3.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Part 1: pure diff logic ──────────────────────────────────────────────────
(function pureLogic() {
    const COMPARE = require(path.join(ROOT, 'UI_MOdified/server/scenario-revision-compare.js'));

    console.log('\n=== Part 1: pure diff logic ===\n');

    console.log('[1] No-change case');
    const scen = {
        name: 'a', scenario_label: 'A',
        red_units: [{ uid: 'R1', coord: [1, 1], role: 'recon' }],
        blue_units_initial: [{ unit_uid: 'B1', coord: [2, 2] }],
        doctrine_rules: [{ id: 'd1', decision: 'block' }],
        mission_tasks: [{ id: 'm1', unit_id: 'B1' }],
        runtime_events: [{ id: 'e1', kind: 'intel' }],
        objectives: [{ id: 'o1', name: 'Obj' }],
        victory_conditions: [{ id: 'v1', kind: 'force_ratio_below' }],
    };
    const same = JSON.parse(JSON.stringify(scen));
    const noChange = COMPARE.compareScenarios(scen, same);
    eq(noChange.has_changes, false, 'identical scenarios -> has_changes=false');
    eq(noChange.changed_sections.length, 0, 'no changed sections reported');

    console.log('\n[2] Units — added/removed/changed');
    const scenA = JSON.parse(JSON.stringify(scen));
    const scenB = JSON.parse(JSON.stringify(scen));
    scenB.red_units.push({ uid: 'R2', coord: [3, 3], role: 'assault' }); // added
    scenB.blue_units_initial = []; // removed B1
    scenB.red_units[0].role = 'assault'; // changed
    const unitDiff = COMPARE.compareScenarios(scenA, scenB);
    eq(unitDiff.sections.units.added.length, 1, 'one unit added');
    eq(unitDiff.sections.units.added[0].uid, 'R2', 'added unit is R2');
    eq(unitDiff.sections.units.removed.length, 1, 'one unit removed');
    eq(unitDiff.sections.units.removed[0].unit_uid, 'B1', 'removed unit is B1');
    eq(unitDiff.sections.units.changed.length, 1, 'one unit changed');
    eq(unitDiff.sections.units.changed[0].id, 'R1', 'changed unit is R1');
    eq(unitDiff.sections.units.changed[0].fields[0].field, 'role', 'changed field is role');
    eq(unitDiff.sections.units.changed[0].fields[0].before, 'recon', 'role before = recon');
    eq(unitDiff.sections.units.changed[0].fields[0].after, 'assault', 'role after = assault');
    ok(unitDiff.changed_sections.includes('units'), 'units listed in changed_sections');

    console.log('\n[3] Placement — moved units reported distinctly, not buried in unit field changes');
    const scenC = JSON.parse(JSON.stringify(scen));
    const scenD = JSON.parse(JSON.stringify(scen));
    scenD.red_units[0].coord = [9, 9];
    const placeDiff = COMPARE.compareScenarios(scenC, scenD);
    eq(placeDiff.sections.placement.moved.length, 1, 'one unit moved');
    eq(placeDiff.sections.placement.moved[0].id, 'R1', 'moved unit is R1');
    eq(JSON.stringify(placeDiff.sections.placement.moved[0].before), '[1,1]', 'before coord');
    eq(JSON.stringify(placeDiff.sections.placement.moved[0].after), '[9,9]', 'after coord');
    // A coord change also shows up as a unit field change (both are true simultaneously) —
    // placement is an ADDITIONAL lens, not a replacement of the generic unit diff.
    ok(placeDiff.sections.units.changed.some((c) => c.id === 'R1' && c.fields.some((f) => f.field === 'coord')),
        'coord change ALSO appears in the generic units.changed field list');

    console.log('\n[4] Doctrine / missions / runtime events / objectives / victory conditions each diff independently');
    const scenE = JSON.parse(JSON.stringify(scen));
    const scenF = JSON.parse(JSON.stringify(scen));
    scenF.doctrine_rules[0].decision = 'allow';
    scenF.mission_tasks.push({ id: 'm2', unit_id: 'B1' });
    scenF.runtime_events = [];
    scenF.objectives[0].name = 'Renamed Objective';
    scenF.victory_conditions.push({ id: 'v2', kind: 'scenario_timeout' });
    const multiDiff = COMPARE.compareScenarios(scenE, scenF);
    eq(multiDiff.sections.doctrine.changed.length, 1, 'doctrine: 1 changed');
    eq(multiDiff.sections.missions.added.length, 1, 'missions: 1 added');
    eq(multiDiff.sections.runtime_events.removed.length, 1, 'runtime_events: 1 removed');
    eq(multiDiff.sections.objectives.changed.length, 1, 'objectives: 1 changed');
    eq(multiDiff.sections.victory_conditions.added.length, 1, 'victory_conditions: 1 added');
    const expectedSections = ['doctrine', 'missions', 'runtime_events', 'objectives', 'victory_conditions'];
    for (const s of expectedSections) ok(multiDiff.changed_sections.includes(s), s + ' listed in changed_sections');

    console.log('\n[5] Metadata catch-all for everything else (name/label/sides/map/...)');
    const scenG = JSON.parse(JSON.stringify(scen));
    const scenH = JSON.parse(JSON.stringify(scen));
    scenH.scenario_label = 'Renamed Scenario';
    scenH.map_bbox = [0, 0, 1, 1];
    const metaDiff = COMPARE.compareScenarios(scenG, scenH);
    ok(metaDiff.sections.metadata.changed.some((f) => f.field === 'scenario_label'), 'scenario_label change captured in metadata');
    ok(metaDiff.sections.metadata.changed.some((f) => f.field === 'map_bbox'), 'map_bbox change captured in metadata');
    ok(metaDiff.changed_sections.includes('metadata'), 'metadata listed in changed_sections');
    // Confirm metadata does NOT falsely fire when nothing metadata-level changed (part of [4]'s multiDiff):
    ok(!multiDiff.changed_sections.includes('metadata'), 'metadata NOT falsely triggered when only structural sections changed');

    console.log('\n[6] Timing gets its OWN section — phase_table/steps/duration, not buried in metadata');
    const scenI = JSON.parse(JSON.stringify(scen));
    scenI.phase_table = [{ index: 0, elapsed_hours: 0, phase: 'START' }];
    scenI.steps = [{ index: 0, elapsed_hours: 0, phase: 'START' }];
    scenI.duration_hours = 4;
    const timingDiff = COMPARE.compareScenarios(scen, scenI);
    ok(timingDiff.sections.timing.changed.some((f) => f.field === 'phase_table'), 'phase_table change captured in the timing section');
    ok(timingDiff.sections.timing.changed.some((f) => f.field === 'steps'), 'steps change captured in the timing section');
    ok(timingDiff.sections.timing.changed.some((f) => f.field === 'duration_hours'), 'duration_hours change captured in the timing section');
    ok(timingDiff.changed_sections.includes('timing'), 'timing listed in changed_sections');
    ok(!timingDiff.changed_sections.includes('metadata'), 'a pure timing change does NOT also fire metadata (phase_table/steps moved out, not duplicated)');
    ok(!timingDiff.sections.metadata.changed.some((f) => f.field === 'phase_table'), 'phase_table no longer appears under metadata at all');
    eq(timingDiff.summary.timing, 3, 'summary.timing = 3 changed timing fields');

    console.log('\n[7] Summary counts are accurate');
    eq(unitDiff.summary.units, 3, 'summary.units = added(1)+removed(1)+changed(1) = 3');
    eq(placeDiff.summary.placement, 1, 'summary.placement = 1 moved unit');
})();

// ── Part 2: HTTP endpoints — list revisions + compare ────────────────────────
(function e2e() {
    const SAMPLE_PATH   = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
    const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
    const PORT = 8660 + Math.floor(Math.random() * 300);
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-scen-rev-compare-e2e-'));

    function request(method, urlPath, body, cookie) {
        return new Promise((resolve, reject) => {
            const data = body == null ? null : JSON.stringify(body);
            const headers = data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
            if (cookie) headers['Cookie'] = cookie;
            const req = http.request({ method, host: '127.0.0.1', port: PORT, path: urlPath, headers }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let json = null; try { json = JSON.parse(raw); } catch (_) {}
                    const setCookie = res.headers['set-cookie'];
                    let sessionCookie = null;
                    if (setCookie) for (const s of setCookie) { const m = /^(rmooz_session=[^;]+)/.exec(s); if (m) { sessionCookie = m[1]; break; } }
                    resolve({ status: res.statusCode, body: json, sessionCookie });
                });
            });
            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    }
    function waitForServer(timeoutMs) {
        const deadline = Date.now() + (timeoutMs || 15000);
        return new Promise((resolve, reject) => {
            (function tick() {
                request('GET', '/api/ai/scenarios')
                    .then((r) => { if (r.status === 200) resolve(); else throw new Error('bad status ' + r.status); })
                    .catch(() => { if (Date.now() > deadline) reject(new Error('server did not come up')); else setTimeout(tick, 150); });
            })();
        });
    }

    console.log('\n=== Part 2: HTTP endpoints ===\n');
    console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
    const server = spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR, RMOOZ_BOOTSTRAP_PASSWORD: 'verify' }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverErr = '';
    server.stderr.on('data', (b) => { serverErr += b.toString(); });
    function teardown() { try { server.kill(); } catch (_) {} try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }
    process.on('exit', teardown);

    (async () => {
        try {
            await waitForServer(15000);
            const login = await request('POST', '/api/auth/login', { username: 'admin', password: 'verify' });
            const cookie = login.sessionCookie;

            const sample = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));
            const draft = JSON.parse(JSON.stringify(sample));
            draft.name = 'compare-e2e-test';

            console.log('[1] Unauthenticated list/compare -> 401');
            const unauthList = await request('GET', '/api/scenarios/compare-e2e-test/revisions');
            eq(unauthList.status, 401, 'list without session -> 401');

            console.log('\n[2] Create revision 1, then a real content change -> revision 2');
            await request('POST', '/api/scenarios', { scenario: draft }, cookie);
            const draft2 = JSON.parse(JSON.stringify(draft));
            draft2.scenario_label = 'Edited label';
            await request('POST', '/api/scenarios?overwrite=1', { scenario: draft2 }, cookie);

            console.log('\n[3] GET revisions list — 2 entries, ascending, no content_json leaked');
            const list = await request('GET', '/api/scenarios/compare-e2e-test/revisions', null, cookie);
            eq(list.status, 200, 'list 200');
            eq(list.body.revisions.length, 2, '2 revisions listed');
            eq(list.body.revisions[0].revision_number, 1, 'first entry is revision 1');
            eq(list.body.revisions[1].revision_number, 2, 'second entry is revision 2');
            ok(list.body.revisions[0].content_json === undefined, 'list entries do NOT include full content_json');

            console.log('\n[4] GET compare 1 vs 2 — shows the real scenario_label change in metadata');
            const cmp = await request('GET', '/api/scenarios/compare-e2e-test/revisions/1/compare/2', null, cookie);
            eq(cmp.status, 200, 'compare 200');
            eq(cmp.body.has_changes, true, 'has_changes true');
            ok(cmp.body.sections.metadata.changed.some((f) => f.field === 'scenario_label' && f.after === 'Edited label'),
                'metadata diff shows the scenario_label edit');

            console.log('\n[5] Compare with an unknown revision number -> 404');
            const cmp404 = await request('GET', '/api/scenarios/compare-e2e-test/revisions/1/compare/99', null, cookie);
            eq(cmp404.status, 404, 'unknown revision -> 404');

            console.log('\n[6] Compare A vs A (same revision) -> has_changes false');
            const cmpSame = await request('GET', '/api/scenarios/compare-e2e-test/revisions/1/compare/1', null, cookie);
            eq(cmpSame.status, 200, 'same-revision compare 200');
            eq(cmpSame.body.has_changes, false, 'comparing a revision to itself -> no changes');

            console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
            teardown();
            process.exit(fail === 0 ? 0 : 1);
        } catch (e) {
            console.error('[fatal]', e && e.stack || e);
            if (serverErr) console.error('server stderr:', serverErr.slice(0, 1000));
            teardown();
            process.exit(1);
        }
    })();
})();
