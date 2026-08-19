'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, 'node_modules', 'playwright'));

const ROOT = __dirname;
const appHtml = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'app.html'), 'utf8');
const sccSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js'), 'utf8');
const ffSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'), 'utf8');

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
function close(a, b, eps) { return Math.abs(+a - +b) < (eps == null ? 1e-6 : eps); }

console.log('\n=== MOV7 SCC movement playability flow ===\n');

(async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
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
            '<style>',
            'body{margin:0;background:#07111c;color:#dfe9f3;font-family:Arial,sans-serif;}',
            '#map{width:620px;height:520px;float:left;}',
            '#scc-root{margin-left:640px;width:330px;min-height:520px;}',
            '.wg-adj-sidc{}',
            '</style></head><body>',
            '<div id="map"></div><div id="scc-root"></div>',
            '</body></html>'
        ].join(''));
        await page.addScriptTag({ path: path.join(ROOT, 'UI_MOdified', 'lib', 'leaflet.js') });
        await page.evaluate(function () {
            window.t = function (s) { return s; };
            window.map = window.L.map('map').setView([0, 0], 6);
            window.AppConfig = { CHAT_CONFIG: { currentUser: { id: 'mov7-test-operator' } } };
            window.AppShellEventLog = { append: function () {} };
            window.AppWorldState = {
                scenarioRuntimeBounds: function () { return { start: 0, end: 2, duration_hours: 2 }; },
                advanceRuntimeClock: function (clock, stepHours) {
                    var next = Object.assign({}, clock || {});
                    if (next.playing && !next.paused) next.current_hours = Math.min(+next.end_hours, +next.current_hours + stepHours * (+next.speed || 1));
                    next.completed = +next.current_hours >= +next.end_hours;
                    if (next.completed) next.playing = false;
                    return next;
                },
                runtimeClockState: function (clock) {
                    if (!clock) return 'stopped';
                    if (clock.completed) return 'complete';
                    if (clock.playing && !clock.paused) return 'playing';
                    if (clock.paused) return 'paused';
                    return 'stopped';
                },
                findStepForElapsedHours: function (scenario, hours) {
                    var steps = (scenario && scenario.steps) || [];
                    var idx = 0;
                    for (var i = 0; i < steps.length; i++) {
                        if (+steps[i].elapsed_hours <= +hours) idx = i;
                    }
                    return { index: idx, time_label: steps[idx] && steps[idx].time_label || ('H+' + hours), current_hours: hours };
                }
            };
            window.fetch = function (url) {
                var text = String(url || '');
                var body = text.indexOf('/api/sim/propose') !== -1
                    ? { proposal_id: 'mov7-proposal' }
                    : { ok: true, neutral_world: {}, green_world: {} };
                return Promise.resolve({ ok: true, json: function () { return Promise.resolve(body); } });
            };
        });
        await page.addScriptTag({ path: path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js') });
        await page.addScriptTag({ path: path.join(ROOT, 'UI_MOdified', 'client', 'wargame', 'adjudicator-map.js') });
        await page.addScriptTag({ path: path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js') });
        await page.addScriptTag({ path: path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js') });

        const setup = await page.evaluate(function () {
            function clone(v) { return JSON.parse(JSON.stringify(v)); }
            function authoredMovementSnapshot(s) {
                function unitList(list) {
                    return (list || []).map(function (u) {
                        return {
                            unit_uid: u && u.unit_uid,
                            id: u && u.id,
                            uid: u && u.uid,
                            base_id: u && u.base_id,
                            coord: clone((u && u.coord) || null),
                            lat: u && u.lat,
                            lon: u && u.lon
                        };
                    });
                }
                return {
                    steps: clone((s && s.steps) || []),
                    red_units: unitList(s && s.red_units),
                    runtime_task_blue_units: unitList(s && s.blue_units_initial).filter(function (u) { return u && u.unit_uid === 'U1'; }),
                    objective: clone((s && s.objective) || null),
                    obj: clone((s && s.obj) || null),
                    pipeline: clone((s && s.pipeline) || [])
                };
            }
            var scenario = {
                id: 'mov7-scc-flow',
                name: 'MOV7 SCC Flow',
                start_time: '2026-01-01T00:00:00Z',
                runtime_scenario: { start_hours: 0, end_hours: 2, duration_hours: 2 },
                duration_hours: 2,
                map_bbox: [-1, -1, 2, 2],
                obj: { name: 'Objective X', coord: [1, 1], lat: 1, lon: 1, target_depth_km: 1, carver: 1 },
                objective: { name: 'Objective X', coord: [1, 1], lat: 1, lon: 1 },
                objectives: [{ name: 'Objective X', coord: [1, 1], lat: 1, lon: 1 }],
                pipeline: [[0, 0], [1, 1]],
                bls_template: [],
                steps: [
                    { elapsed_hours: 0, time_label: 'H', phase: 'Start' },
                    { elapsed_hours: 2, time_label: 'H+2', phase: 'End' }
                ],
                red_units: [
                    { unit_uid: 'R1', id: 'R1', uid: 'R1', base_id: 'R1', side: 'RED', role: 'opfor', domain: 'ground', coord: [2, 2], exact_unit_position: true }
                ],
                blue_units_initial: [
                    { unit_uid: 'U1', id: 'U1', uid: 'U1', base_id: 'U1', side: 'BLUE', role: 'infantry', domain: 'ground', coord: [0, 0], exact_unit_position: true },
                    { unit_uid: 'U2', id: 'U2', uid: 'U2', base_id: 'U2', side: 'BLUE', role: 'screen', domain: 'ground', coord: [0.2, 0], exact_unit_position: true }
                ]
            };
            var scenarioBefore = clone(scenario);
            window.units = [{ uid: 'external-unit', coord: [99, 99] }];
            window.__mov7UnitsBefore = clone(window.units);
            window.__mov7ScenarioBefore = scenarioBefore;
            window.__mov7AuthoredBefore = authoredMovementSnapshot(scenario);
            window.__mov7AuthoredSnapshot = authoredMovementSnapshot;
            window.RmoozScenario = { scenario: scenario };
            window.AppAdjudicatorMap.drawScenario(scenario);
            window.RmoozFreeFightDemo.init({
                brief: { operational_brief: { task_assembly: { doctrine_upload_required: false, commander_review_required: false } } }
            }, { objective: { lat: 1, lon: 1 } });
            var coa = {
                plan_id: 'MOV7-COA',
                title: 'SCC movement clock carrier',
                side: 'BLUE',
                recommended: true,
                risk: 'low',
                confidence: 'high',
                commander_intent: 'Keep the run clock moving while runtime movement is tasked from SCC.',
                main_effort: 'U2 screens away from the runtime movement unit.',
                supporting_effort: 'U1 is controlled only by runtime movement tasking.',
                reserve_or_follow_on: 'Hold reserve.',
                security_or_screen: 'U2 screen.',
                phases: [{
                    name: 'Clock carrier',
                    actions: [{
                        unit_uid: 'U2',
                        action_type: 'MOVE',
                        role: 'screen',
                        domain: 'ground',
                        target: { lat: 10, lon: 0.2 }
                    }]
                }]
            };
            var plan = {
                ok: true,
                plan_source: 'staff_safe_commander_template',
                planning_mode: 'staff_safe',
                recommended_plan_id: 'MOV7-COA',
                coas: [coa]
            };
            window.RmoozFreeFightDemo._setCoaPlanForTest(plan);
            var exec = window.RmoozFreeFightDemo._commitCoaForTest(0);
            return { committed: !!(exec && exec.active), marker: !!window.AppAdjudicatorMap._findBlueMarkerByBaseId('U1') };
        });

        function renderAndBind() {
            return page.evaluate(function () {
                var root = document.getElementById('scc-root');
                root.innerHTML = window.RmoozScenarioControlCenter.render();
                window.RmoozScenarioControlCenter.bind(function (act, fn) {
                    root.querySelectorAll('[data-act="' + act + '"]').forEach(function (el) { el.onclick = fn; });
                });
                return root.innerText;
            });
        }
        function latLng(uid) {
            return page.evaluate(function (unitId) {
                var marker = window.AppAdjudicatorMap._findBlueMarkerByBaseId(unitId);
                var p = marker && marker.getLatLng && marker.getLatLng();
                return p ? { lat: +p.lat, lng: +p.lng } : null;
            }, uid);
        }

        let text = await renderAndBind();
        const visibleBeforeTask = await page.evaluate(function () {
            var root = document.getElementById('scc-root');
            return {
                hasTasking: !!root.querySelector('[data-scc="movement-tasking"]'),
                runButtonsInScc: root.querySelectorAll('[data-act="scc-run"]').length,
                runButtonsOutsideScc: Array.from(document.querySelectorAll('button')).filter(function (b) {
                    return !root.contains(b) && /run|play/i.test(b.textContent || b.title || '');
                }).length,
                forbiddenText: /\b(Step|Snapshot|Turn|Run trial|Next snapshot|Legacy Snapshot Adjudication)\b/i.test(root.innerText || '')
            };
        });

        await page.fill('[data-scc-move="unit-id"]', 'U1');
        await page.fill('[data-scc-move="destination-lon"]', '1');
        await page.fill('[data-scc-move="destination-lat"]', '0');
        await page.fill('[data-scc-move="speed-kph"]', '111.195');
        await page.fill('[data-scc-move="domain"]', 'ground');
        const beforeMove = await latLng('U1');
        await page.click('[data-act="scc-movement-start"]');
        text = await renderAndBind();

        const afterTask = await page.evaluate(function () {
            var st = window.RmoozFreeFightDemo.engine.runtimeMovementState();
            var ids = Object.keys((st && st.movements) || {});
            var summary = window.RmoozFreeFightDemo.engine.runtimeMovementSummary();
            var marker = window.AppAdjudicatorMap._findBlueMarkerByBaseId('U1');
            return {
                movementIds: ids,
                runtimePositions: Object.keys((st && st.runtime_positions) || {}),
                status: window.RmoozFreeFightDemo.engine.runtimeMovementTaskingStatus(),
                markerSource: marker && marker._rmoozRuntimeOwnedPosition && marker._rmoozRuntimeOwnedPosition.source,
                summary: summary,
                text: document.getElementById('scc-root').innerText
            };
        });

        await page.click('[data-act="scc-run"]');
        await page.waitForTimeout(120);
        text = await renderAndBind();
        const afterPlay = await latLng('U1');
        const playState = await page.evaluate(function () {
            return {
                runtime: window.RmoozFreeFightDemo.engine.runtimeSnapshot(),
                scenario: window.RmoozFreeFightDemo.engine.scenarioRuntime(),
                hasPause: !!document.querySelector('#scc-root [data-act="scc-pause"]'),
                hasRun: !!document.querySelector('#scc-root [data-act="scc-run"]'),
                runBlocked: window.RmoozFreeFightDemo.engine.runBlockedReason && window.RmoozFreeFightDemo.engine.runBlockedReason(),
                text: document.getElementById('scc-root').innerText
            };
        });

        if (playState.hasPause) await page.click('[data-act="scc-pause"]');
        await page.waitForTimeout(700);
        text = await renderAndBind();
        const afterPause = await latLng('U1');
        await page.waitForTimeout(650);
        const afterPauseWait = await latLng('U1');

        const hasResume = await page.$('#scc-root [data-act="scc-run"]');
        if (hasResume) await page.click('#scc-root [data-act="scc-run"]');
        await page.waitForTimeout(650);
        text = await renderAndBind();
        const afterResume = await latLng('U1');

        await page.waitForTimeout(2200);
        text = await renderAndBind();
        const afterArrival = await latLng('U1');
        const finalState = await page.evaluate(function () {
            var st = window.RmoozFreeFightDemo.engine.runtimeMovementState();
            var movementRecords = window.AppRuntimeMovement.extractMovementJournalRecords(
                ((st && st.movement_journal_events) || [])
            );
            var replay = window.AppRuntimeMovement.buildMovementReplay(movementRecords);
            var aar = window.AppRuntimeMovement.buildMovementAarSummary(movementRecords);
            var authoredNow = window.__mov7AuthoredSnapshot(window.RmoozScenario.scenario);
            var authoredBefore = window.__mov7AuthoredBefore;
            var scenarioDiff = {};
            Object.keys(authoredBefore || {}).forEach(function (key) {
                if (JSON.stringify(authoredBefore[key]) !== JSON.stringify(authoredNow[key])) {
                    scenarioDiff[key] = { before: authoredBefore[key], after: authoredNow[key] };
                }
            });
            return {
                runtime: window.RmoozFreeFightDemo.engine.runtimeSnapshot(),
                summary: window.RmoozFreeFightDemo.engine.runtimeMovementSummary(),
                arrivals: (st && st.arrival_events || []).length,
                journalEvents: (st && st.movement_journal_events || []).length,
                pendingJournal: (st && st.pending_journal_records || []).length,
                aar: aar,
                movementRecords: movementRecords.length,
                scenarioUnchanged: Object.keys(scenarioDiff).length === 0,
                scenarioDiff: scenarioDiff,
                windowUnitsUnchanged: JSON.stringify(window.units) === JSON.stringify(window.__mov7UnitsBefore),
                visibleForbiddenText: /\b(Step|Snapshot|Turn|Run trial|Next snapshot|Legacy Snapshot Adjudication)\b/i.test(document.getElementById('scc-root').innerText || ''),
                text: document.getElementById('scc-root').innerText,
                bottomTimelineOk: true
            };
        });
        await page.evaluate(function () {
            try { window.RmoozFreeFightDemo.engine.pauseScenario(); } catch (_) {}
        });

        const timelineDevOnly = /id="timeline-strip"[\s\S]{0,260}hidden[\s\S]{0,260}aria-hidden="true"[\s\S]{0,260}inert[\s\S]{0,260}data-dev-only="timeline-preview"/.test(appHtml);
        const sccHasRun = /data-act="scc-run"|btnPri\('scc-run'|btnSec\('scc-run'/.test(sccSrc);
        const movementTaskSource = /createRuntimeMovementTask/.test(ffSrc) && /runtimeMovementTaskingStatus/.test(ffSrc);

        ok('T-1 SCC movement tasking UI is visible', setup.committed && setup.marker && visibleBeforeTask.hasTasking);
        ok('T-2 SCC is the only primary Play/Run surface', sccHasRun && visibleBeforeTask.runButtonsInScc >= 1 && visibleBeforeTask.runButtonsOutsideScc === 0);
        ok('T-3 no visible normal UI strings for legacy play paths', !visibleBeforeTask.forbiddenText && !finalState.visibleForbiddenText, finalState.text);
        ok('T-4 a single-unit movement task can be created', afterTask.status && afterTask.status.ok === true && afterTask.movementIds.length === 1);
        ok('T-5 movement task is stored in runtime movement state', afterTask.runtimePositions.indexOf('U1') !== -1 && afterTask.markerSource === 'runtime_movement');
        ok('T-6 SCC Play starts scenario time',
            playState.runtime && playState.runtime.playing === true && playState.runtime.current_elapsed_hours > 0 &&
            playState.scenario && playState.scenario.scenario_status === 'running' && playState.hasPause === true,
            (playState.runBlocked || '') + '\n' + (playState.text || ''));
        ok('T-7 marker LatLng changes after play/tick', beforeMove && afterPlay && afterPlay.lng > beforeMove.lng && close(afterPlay.lat, 0),
            'before=' + JSON.stringify(beforeMove) + ' after=' + JSON.stringify(afterPlay) + ' play=' + JSON.stringify(playState.runtime));
        ok('T-8 Pause freezes marker LatLng', afterPause && afterPauseWait && close(afterPause.lng, afterPauseWait.lng) && close(afterPause.lat, afterPauseWait.lat));
        ok('T-9 Resume changes marker LatLng again', afterResume && afterPause && afterResume.lng > afterPause.lng && close(afterResume.lat, 0),
            'pause=' + JSON.stringify(afterPause) + ' resume=' + JSON.stringify(afterResume));
        ok('T-10 Arrival leaves marker at final coordinate', afterArrival && close(afterArrival.lng, 1) && close(afterArrival.lat, 0),
            'arrival=' + JSON.stringify(afterArrival) + ' state=' + JSON.stringify(finalState.runtime));
        ok('T-11 Arrival event fires once', finalState.arrivals === 1, 'arrivals=' + finalState.arrivals);
        ok('T-12 Movement summary shows moving/arrived/ETA', /moving/i.test(afterTask.text) && /ETA/i.test(afterTask.text) && finalState.summary && finalState.summary.arrived === 1,
            'summary=' + JSON.stringify(finalState.summary));
        ok('T-13 runtime movement task does not mutate authored scenario unit/timeline data', finalState.scenarioUnchanged === true, JSON.stringify(finalState.scenarioDiff));
        ok('T-14 window.units is not mutated', finalState.windowUnitsUnchanged === true);
        ok('T-15 Bottom timeline is hidden/developer-only or not used for scenario Play', timelineDevOnly === true);
        ok('T-16 Console has no page-level JS errors', browserErrors.length === 0, browserErrors.join('; '));
        ok('T-17 Movement journal/AAR record is created or queued safely',
            finalState.journalEvents >= 2 && finalState.aar && finalState.aar.total_arrivals === 1 && finalState.pendingJournal >= 0,
            'journal=' + finalState.journalEvents + ' records=' + finalState.movementRecords + ' aar=' + JSON.stringify(finalState.aar) + ' pending=' + finalState.pendingJournal);
        ok('T-18 MOV6 tasking facade is the path under test', movementTaskSource === true);
    } finally {
        await browser.close();
    }

    if (failed) {
        console.error('\nMOV7 SCC movement playability failed: ' + failed + ' failure(s).');
        process.exit(1);
    }
    console.log('\nMOV7 SCC movement playability passed: ' + passed + ' assertions.');
})().catch(function (err) {
    console.error(err && err.stack || err);
    process.exit(1);
});
