/**
 * verify-batch-c-runtime-fidelity-journey-1.js — Batch C Slice C10 (deep E2E)
 *
 * The full author -> approve -> launch -> RUN journey, driven in a REAL
 * headless browser against a REAL server (real auth, real DB, real
 * scenario-approval-store lifecycle), proving the product's north star:
 * "build a scenario in-app, press Play, and watch it unfold." Extends
 * verify-batch-b-launch-journey-1.js's proven scaffolding (steps 1-2 here
 * mirror that file almost exactly) with the runtime-fidelity mechanics
 * built in Slices C1-C9: mission-task movement, group/formation movement,
 * geo-trigger zones, decision points, victory conditions, the runtime-play
 * AAR, and the dangerous-effect safety lock.
 *
 * OWNER CORRECTION (this revision): the first version of this file proved
 * the dangerous-effect gate by injecting the event WHILE COA-phase budget
 * remained — which avoided a real defect instead of proving the runtime
 * contract. Owner ruling, verbatim: "Play means scenario time moves; phases/
 * steps are review or task structure." A scenario may have 3 short COA
 * phases, a 2-hour runtime, and an event at H+90 minutes, or a timeout/
 * victory condition after the phases finish — that event MUST still be
 * evaluated while scenario time is running. The underlying defect (runtime-
 * event/clock ticking silently stopped once COA phases exhausted) has since
 * been fixed at the source (free-fight-demo.js::_tickScenarioClockAndRuntimeEvents,
 * called from both _coaExecTick() and _scenarioTransition()) and is proven
 * directly, exhaustively, by test-runtime-post-phase-continuity-1.js. THIS
 * file now injects its dangerous effect (and resolves its victory condition)
 * genuinely AFTER all 3 committed COA phases have exhausted — a live,
 * end-to-end confirmation of that fix, not a repeat of its unit-level proof.
 *
 * SCOPE / HONEST LIMITATIONS (same spirit as Batch B Slice 12's own notes):
 *   - Login/registration, the Builder authoring UI, and the approval
 *     workflow reuse the exact same proven mechanism as Batch B's E2E
 *     (direct HTTP register/login per browser context; openDraftForReview()
 *     seeding via the real production functions; every ACTUAL acceptance
 *     action — Submit/Approve/Launch/confirmation — driven via real button
 *     clicks) — not re-litigated here in detail.
 *   - The committed-COA plan itself is injected via the SAME test-only
 *     facade helpers (_setCoaPlanForTest/_setCoaSelectedIdxForTest/
 *     _commitCoaForTest/_runScenarioForTest/_scenarioTickForTest) that
 *     test-free-fight-auto-scenario-director-ab.js already uses in this
 *     exact style — a real, established, sanctioned test mechanism in this
 *     codebase (not a shortcut invented for this slice), used here instead
 *     of driving a live AI/LLM COA-generation call. Ticking is driven
 *     manually (deterministic, no wall-clock waits) rather than relying on
 *     the real 500ms setInterval, for a fast and flake-free gate.
 *   - The committed COA is a SHORT (3-phase) all-HOLD_POSITION plan —
 *     matching the owner's own "3 short COA phases" example exactly, not an
 *     inflated phase count. Once phases exhaust, manual mode auto-pauses
 *     for new Blue orders each tick; resuming via _runScenarioForTest() (the
 *     real "operator clicks Run again" action) is what keeps scenario TIME
 *     moving afterward — proving the fix's actual operating mode, not a
 *     remaining-phase-budget trick.
 *   - The victory condition is authored disabled and enabled live partway
 *     through the run (after the dangerous-effect proof), so its
 *     composition-based threshold — which would otherwise be satisfied from
 *     tick 1 — doesn't end the scenario before the post-phase-exhaustion
 *     dangerous-effect check gets its turn. This is a test-sequencing
 *     choice, not a product behavior.
 *   - The dangerous-effect check (goal g) is proven by injecting a live
 *     runtime_event with a hard-blocked effect kind directly into the
 *     mounted window.RmoozScenario.scenario (bypassing the authoring save
 *     gate entirely, which would refuse to save one per Batch B Slice 4/7)
 *     — a stronger proof than re-authoring it through the Builder.
 *
 *   node verify-batch-c-runtime-fidelity-journey-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT          = __dirname;
const SERVER_SCRIPT  = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORT           = 8900 + Math.floor(Math.random() * 200);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-runtime-fidelity-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-runtimefidelity';
const BASE_URL       = 'http://127.0.0.1:' + PORT;

fs.mkdirSync(path.join(DATA_DIR, 'scenarios'), { recursive: true });

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function httpRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : JSON.stringify(body);
        const headers = data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
        const req = http.request({ method, host: '127.0.0.1', port: PORT, path: urlPath, headers }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
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
            httpRequest('GET', '/api/ai/scenarios')
                .then((status) => { if (status === 200) resolve(); else throw new Error('bad status ' + status); })
                .catch(() => { if (Date.now() > deadline) reject(new Error('server did not come up')); else setTimeout(tick, 150); });
        })();
    });
}

console.log('[setup] booting web-server.js on port ' + PORT + ' with DATA_DIR=' + DATA_DIR);
const server = spawn(process.execPath, [SERVER_SCRIPT], {
    env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR, RMOOZ_BOOTSTRAP_PASSWORD: BOOTSTRAP_PW }),
    stdio: ['ignore', 'pipe', 'pipe']
});
let serverErr = '';
server.stderr.on('data', (b) => { serverErr += b.toString(); });
server.stdout.on('data', () => {});
function teardown() {
    try { server.kill(); } catch (_) {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}
process.on('exit', teardown);

// Rich draft covering every Batch C mechanic: a single-unit mission task
// (BLUE-1, short route), a group mission task (BLUE-2/BLUE-3, unit_ids), a
// geo-trigger runtime event watching BLUE-1's destination, a decision point,
// and a force_ratio_below victory condition — authored DISABLED (enabled
// live later, see the file header note on test sequencing).
const SEED_DRAFT_FN = function (args) {
    var nameArg = args[0], labelArg = args[1];
    var T = window.AppEditMode._testing;
    var d = { name: nameArg, scenario_label: labelArg };
    d.sides = T.defaultSides();
    d.postures = T.defaultPostures();
    T.fillGeographyDefaults(d);
    d.map_bbox = [44.8, 12.5, 45.4, 13.0];
    d.pipeline = [[45.00, 12.70], [45.11, 12.77]];
    d.obj = { name: 'Port Objective', coord: [45.11, 12.77], target_depth_km: 5, carver: 12, radius_km: 3 };
    d.bls_template = [{ name: 'AO-CENTER', coord: [45.11, 12.77] }];
    // free-fight-demo.js's _sideUnitCount()/_whiteScenarioOutcome() require an
    // EXPLICIT `side` string on every unit object (not just implied by which
    // canonical array it's in) — without it, _sideUnitCount('BLUE') reads 0,
    // which the v1 draft's always-enabled victory condition masked entirely
    // (checked before blue_unable_to_continue in _scenarioEndCondition, so it
    // always won first). Authoring it disabled here (see file header) exposed
    // the gap. Fixed by adding `side` explicitly, matching the convention
    // test-free-fight-auto-scenario-director-ab.js's own units already use.
    d.red_units = [{ uid: 'RED-1', side: 'RED', label: 'Red Recon Coy', bls: 'AO-CENTER', appear: 0, role: 'recon', coord: [45.30, 12.90], strength: 1, echelon: 'company' }];
    d.blue_units_initial = [
        { unit_uid: 'BLUE-1', side: 'BLUE', base_id: 'AO-CENTER', coord: [45.00, 12.70], echelon: 'battalion' },
        { unit_uid: 'BLUE-2', side: 'BLUE', base_id: 'AO-CENTER', coord: [45.02, 12.71], echelon: 'battalion' },
        { unit_uid: 'BLUE-3', side: 'BLUE', base_id: 'AO-CENTER', coord: [45.02, 12.72], echelon: 'battalion' }
    ];
    d.blue_units_base_ids = ['AO-CENTER'];
    d.mission_tasks = [
        { id: 'mission-task-1', unit_id: 'BLUE-1', kind: 'patrol', start_elapsed_hours: 0, status: 'planned', enabled: true, source: 'scenario',
          route: [[45.00, 12.70], [45.03, 12.705]] },
        { id: 'mission-task-2', unit_id: 'BLUE-2', unit_ids: ['BLUE-2', 'BLUE-3'], kind: 'patrol', start_elapsed_hours: 0, status: 'planned', enabled: true, source: 'scenario',
          route: [[45.02, 12.715], [45.05, 12.72]] }
    ];
    d.runtime_events = [
        { id: 'geo-event-1', trigger_type: 'geo', trigger_unit_id: 'BLUE-1', enabled: true, once: true, source: 'scenario',
          trigger_zone: [[45.025, 12.70], [45.035, 12.70], [45.035, 12.71], [45.025, 12.71], [45.025, 12.70]],
          effects: [{ id: 'geo-effect-1', kind: 'add_notification', payload: { message: 'BLUE-1 entered the objective approach zone' } }] }
    ];
    d.decision_points = [
        { id: 'dp-1', trigger_elapsed_hours: 0, title: 'Initial posture', enabled: true, source: 'scenario',
          options: [{ id: 'opt-hold', label: 'Hold and observe' }, { id: 'opt-advance', label: 'Advance to contact' }] }
    ];
    // Authored DISABLED — enabled live mid-run, after the post-phase-
    // exhaustion dangerous-effect proof (see file header). Otherwise this
    // composition-based threshold (2x BLUE battalion vs 1x RED company) is
    // satisfied from tick 1 and would end the scenario before that proof.
    d.victory_conditions = [
        { id: 'vc-1', kind: 'force_ratio_below', threshold: 2, side: 'blue', enabled: false, source: 'scenario' }
    ];
    d.doctrine_rules = [{ id: 'doc-1', enabled: true, decision: 'block', severity: 'critical', reason: 'no fire in the AO buffer', applies_to_side: 'RED', condition: 'in_restricted_zone', action: 'fire' }];
    d.objectives = [{ id: 'obj-1', name: 'Port Objective', owner: 'BLUE', location: { lat: 12.77, lon: 45.11 } }];
    // NOT T.synthesizeDefaultPhaseTable() — that default starts at H-3 (a
    // pre-H-hour prep convention), which would make elapsed_hours:0-scheduled
    // mission tasks/events (H+0, the owner's own reference point) require 12
    // extra ticks just to reach H+0 before anything scheduled "at H+0" could
    // ever be due. This scenario authors its own table starting at H+0 with
    // a 10-hour span — comfortably covering the owner's "2-hour runtime"
    // example with margin for the post-phase-exhaustion ticking below.
    d.phase_table = [
        { index: 0, time_label: 'H+0', elapsed_hours: 0, phase: 'PHASE 1' },
        { index: 1, time_label: 'H+2', elapsed_hours: 2, phase: 'PHASE 2' },
        { index: 2, time_label: 'H+6', elapsed_hours: 6, phase: 'PHASE 3' },
        { index: 3, time_label: 'H+10', elapsed_hours: 10, phase: 'RESOLUTION' }
    ];
    T.ensureStepsMatchPhaseTable(d);
    T.fillForcesDefaults(d);
    window.AppEditMode.openDraftForReview(d, { source: 'manual' });
    return window.AppEditMode.getDraft();
};

async function openWorkspaceAndEditMode(page) {
    await page.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const workspaceButton = page.locator('[title*="Live Scenario Workspace"]').first();
    await workspaceButton.waitFor({ state: 'visible', timeout: 8000 });
    await workspaceButton.click();
    await page.waitForTimeout(500);
    await page.evaluate(() => { try { window.AppEditMode.mount(); } catch (_) {} });
    const toggleBtn = page.locator('#sw-editmode-toggle');
    await toggleBtn.waitFor({ state: 'visible', timeout: 5000 });
    await toggleBtn.click();
    await page.waitForTimeout(300);
}
async function gotoSaveStep(page) {
    const rail = page.locator('.sw-step-item');
    const count = await rail.count();
    await rail.nth(count - 1).click();
    await page.waitForTimeout(300);
}

// A SHORT plan: 3 HOLD_POSITION phases — the owner's own "3 short COA
// phases" example, not an inflated phase count worked around with a large
// tick budget. Exhausts after exactly 3 ticks (0.75h at 0.25h/tick).
const PHASE_COUNT = 3;
function shortPlan() {
    const phases = [];
    for (let i = 0; i < PHASE_COUNT; i++) {
        phases.push({ name: 'Hold ' + i, actions: [{ unit_uid: 'BLUE-1', action_type: 'HOLD_POSITION', role: 'assault' }] });
    }
    return {
        ok: true, plan_source: 'deterministic', recommended_plan_id: 'COA-1', validation: { ok: true },
        coas: [{ plan_id: 'COA-1', recommended: true, title: 'Hold and observe', side: 'BLUE', risk: 'low', confidence: 'high', phases: phases }]
    };
}

(async function run() {
    let browser;
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        browser = await chromium.launch({ headless: true });

        console.log('\n[setup] registering planner + commander accounts');
        const plannerCtx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
        const commanderCtx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });

        await plannerCtx.request.post(BASE_URL + '/api/auth/register', { data: { username: 'e2ec-planner', password: 'testpass1' } });
        await plannerCtx.request.post(BASE_URL + '/api/auth/login', { data: { username: 'e2ec-planner', password: 'testpass1' } });
        await commanderCtx.request.post(BASE_URL + '/api/auth/register', { data: { username: 'e2ec-commander', password: 'testpass1' } });
        await commanderCtx.request.post(BASE_URL + '/api/auth/login', { data: { username: 'e2ec-commander', password: 'testpass1' } });

        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='commander' WHERE username='e2ec-commander'").run();
        db.close();

        const plannerPage = await plannerCtx.newPage();
        const commanderPage = await commanderCtx.newPage();
        const consoleErrors = [];
        const dialogLog = [];
        [plannerPage, commanderPage].forEach((p) => {
            p.on('dialog', async (dialog) => { dialogLog.push(dialog.message()); await dialog.accept(); });
            p.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message));
        });

        // ════════════════════════════════════════════════════════════════
        // 1. Author -> submit -> approve -> launch (mirrors Batch B Slice 12)
        // ════════════════════════════════════════════════════════════════
        console.log('\n[1] Planner authors a scenario with mission tasks, group task, geo-trigger, decision point, victory condition');
        await openWorkspaceAndEditMode(plannerPage);
        const seeded = await plannerPage.evaluate(SEED_DRAFT_FN, ['e2ec-fidelity', 'E2E Runtime Fidelity']);
        eq(seeded.mission_tasks.length, 2, 'draft carries both mission tasks (single + group)');
        eq(seeded.runtime_events.length, 1, 'draft carries the geo-trigger runtime event');
        eq(seeded.decision_points.length, 1, 'draft carries the decision point');
        eq(seeded.victory_conditions.length, 1, 'draft carries the victory condition (authored disabled)');

        console.log('\n[2] Save -> submit -> commander approves -> launch');
        await gotoSaveStep(plannerPage);
        await plannerPage.locator('button', { hasText: 'Save to server' }).first().click();
        await plannerPage.waitForTimeout(700);
        await plannerPage.locator('button', { hasText: 'Submit for review' }).first().click();
        await plannerPage.waitForTimeout(500);

        await openWorkspaceAndEditMode(commanderPage);
        await commanderPage.evaluate(async (name) => {
            const r = await fetch('/api/ai/scenario/' + encodeURIComponent(name), { credentials: 'include' });
            const j = await r.json();
            window.AppEditMode.openDraftForReview(j.scenario, { source: 'manual' });
        }, 'e2ec-fidelity');
        await gotoSaveStep(commanderPage);
        await commanderPage.waitForTimeout(600);
        const approveBtn = commanderPage.locator('button', { hasText: 'Approve (commander)' }).first();
        await approveBtn.waitFor({ state: 'attached', timeout: 5000 });
        await approveBtn.click();
        await commanderPage.waitForTimeout(600);

        await gotoSaveStep(plannerPage);
        await plannerPage.waitForTimeout(700);
        const launchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(!(await launchBtn.isDisabled()), 'Launch button is ENABLED after commander approval');
        await launchBtn.click();
        await plannerPage.waitForTimeout(1000);
        const sccVisible = await plannerPage.locator('[data-scc="window"]').first().isVisible().catch(() => false);
        ok(sccVisible, 'the Scenario Control Center panel is visible after launch');

        const readiness = await plannerPage.evaluate(() => window.RmoozFreeFightDemo.engine.readiness());
        eq(readiness.units_loaded, 4, 'SCC readiness reports all 4 authored units (1 RED + 3 BLUE)');

        // ════════════════════════════════════════════════════════════════
        // 2. Commit a SHORT deterministic COA and Run — manual mode
        // ════════════════════════════════════════════════════════════════
        console.log('\n[3] Commit a deterministic (no-AI) 3-phase COA (the owner\'s own example) and Run the scenario');
        const commitInfo = await plannerPage.evaluate((plan) => {
            // Note: the test-only _setCoaPlanForTest/_commitCoaForTest/_runScenarioForTest/
            // _scenarioTickForTest helpers live on the TOP-LEVEL window.RmoozFreeFightDemo
            // object (matching test-free-fight-auto-scenario-director-ab.js's own DEMO.xxx
            // usage) — NOT under .engine, which is a separate, smaller SCC-facing facade.
            const DEMO = window.RmoozFreeFightDemo;
            DEMO._setScenarioAutoContinueForTest(false);   // manual mode — isolates Red/Blue auto-maneuver noise from the dangerous-effect position check below
            DEMO._setCoaPlanForTest(plan);
            DEMO._setCoaSelectedIdxForTest(0);
            const ex = DEMO._commitCoaForTest(0);
            return { committed: !!ex, phaseCount: ex && ex.selected_coa ? ex.selected_coa.phases.length : 0 };
        }, shortPlan());
        ok(commitInfo.committed, 'a real committed _coaExec was built (deterministic plan, no AI)', JSON.stringify(commitInfo));
        eq(commitInfo.phaseCount, PHASE_COUNT, 'the committed COA carries exactly ' + PHASE_COUNT + ' phases');

        await plannerPage.evaluate(() => { window.RmoozFreeFightDemo._runScenarioForTest(); });

        console.log('\n[4] Tick through the 3 short phases (mission-task movement + geo-trigger + decision-point window)');
        const midRunStatus = await plannerPage.evaluate((n) => {
            const DEMO = window.RmoozFreeFightDemo;
            const eng = DEMO.engine;
            for (let i = 0; i < n; i++) DEMO._scenarioTickForTest();
            return {
                missionTasks: eng.missionTaskRuntimeStatus(),
                events: eng.runtimeEventStatusBoard(),
                decisions: eng.runtimeDecisionPoints(),
                coaExec: DEMO._getCoaExecForTest()
            };
        }, PHASE_COUNT);
        console.log('  [debug] mid-run mission task statuses:', JSON.stringify(midRunStatus.missionTasks));
        console.log('  [debug] mid-run event board:', JSON.stringify(midRunStatus.events));
        ok(midRunStatus.coaExec && midRunStatus.coaExec.phase_status === 'complete',
            'sanity: all ' + PHASE_COUNT + ' COA phases are genuinely exhausted by now', JSON.stringify(midRunStatus.coaExec && midRunStatus.coaExec.phase_status));

        console.log('\n[5] Mission-task-driven unit movement genuinely happened');
        const task1 = midRunStatus.missionTasks.filter(t => t.id === 'mission-task-1')[0];
        ok(!!task1, 'mission-task-1 status is reported');
        ok(task1 && (task1.status === 'active' || task1.status === 'complete'), 'mission-task-1 (BLUE-1, single unit) is active or complete — genuinely started/moved', JSON.stringify(task1));

        console.log('\n[6] Mission-task-driven GROUP movement (formation) genuinely happened');
        const task2 = midRunStatus.missionTasks.filter(t => t.id === 'mission-task-2')[0];
        ok(!!task2, 'mission-task-2 status is reported');
        ok(task2 && task2.is_group === true, 'mission-task-2 is correctly classified as a group task');
        ok(task2 && (task2.status === 'active' || task2.status === 'complete'), 'mission-task-2 (BLUE-2/BLUE-3 formation) is active or complete', JSON.stringify(task2));

        console.log('\n[7] Geo trigger fired once BLUE-1 reached the authored zone');
        const geoEvent = midRunStatus.events.filter(e => e.id === 'geo-event-1')[0];
        ok(!!geoEvent, 'geo-event-1 status is reported');
        ok(geoEvent && geoEvent.status === 'fired', 'geo-event-1 fired (BLUE-1 genuinely entered the authored trigger_zone)', JSON.stringify(geoEvent));

        console.log('\n[8] Decision point opened and is resolvable');
        ok(midRunStatus.decisions.length > 0, 'at least one decision point is open', JSON.stringify(midRunStatus.decisions));
        const dp1 = midRunStatus.decisions.filter(d => d.id === 'dp-1')[0];
        ok(!!dp1, 'dp-1 specifically is open');
        if (dp1) {
            const resolved = await plannerPage.evaluate(() => window.RmoozFreeFightDemo.engine.resolveRuntimeDecisionPoint('dp-1', 'opt-advance'));
            ok(resolved && resolved.status !== 'not_found', 'resolveRuntimeDecisionPoint succeeds for a real open decision point', JSON.stringify(resolved));
            const history = await plannerPage.evaluate(() => window.RmoozFreeFightDemo.engine.runtimeDecisionHistory());
            const resolvedDp1 = history.filter(h => h.id === 'dp-1')[0];
            ok(!!resolvedDp1 && resolvedDp1.selected_option_label === 'Advance to contact', 'decision history shows dp-1 resolved with the real chosen option label', JSON.stringify(resolvedDp1));
        }

        // ════════════════════════════════════════════════════════════════
        // 3. Dangerous effect injected AFTER phase exhaustion -> never
        //    executes. This is the corrected proof: the event's
        //    at_elapsed_hours is scheduled genuinely later than the 3-phase
        //    COA's own exhaustion point (0.75h), and reaching it requires
        //    ticking THROUGH the resume-after-auto-pause path
        //    (_runScenarioForTest(), the real "operator clicks Run again"
        //    action) — proving _tickScenarioClockAndRuntimeEvents() keeps
        //    firing from inside _scenarioTransition(), not _coaExecTick().
        // ════════════════════════════════════════════════════════════════
        console.log('\n[9] A hard-blocked dangerous effect scheduled AFTER all COA phases exhaust never executes');
        const redBefore = await plannerPage.evaluate(() => {
            const sc = window.RmoozScenario.scenario;
            return sc.red_units[0].lat + ',' + sc.red_units[0].lon;
        });
        await plannerPage.evaluate(() => {
            const sc = window.RmoozScenario.scenario;
            // 3 phases exhaust at 0.75h (3 * 0.25h/tick) — 1.25h is genuinely
            // AFTER exhaustion, not inside the remaining phase budget.
            sc.runtime_events.push({
                id: 'dangerous-event-1', at_elapsed_hours: 1.25, enabled: true, once: true, source: 'scenario',
                effects: [{ id: 'fx-dangerous-1', kind: 'move_unit', payload: { unit_id: 'RED-1', to: [99, 99] } }]
            });
        });
        const postExhaustionTick = await plannerPage.evaluate(() => {
            const DEMO = window.RmoozFreeFightDemo;
            // Resume-aware ticking: phases are already exhausted, so manual
            // mode auto-pauses ("needs new Blue orders") after every
            // _scenarioTransition() call — resuming via _runScenarioForTest()
            // each time is the real production action that keeps scenario
            // TIME moving; this is NOT ticking within a remaining phase
            // budget (there is none left).
            for (let i = 0; i < 10; i++) {
                const sc = DEMO._getScenarioForTest();
                if (!sc || sc.scenario_status !== 'running') DEMO._runScenarioForTest();
                else DEMO._scenarioTickForTest();
            }
            return DEMO._getCoaExecForTest().clock.current_hours;
        });
        ok(postExhaustionTick >= 1.25, 'the scenario clock genuinely advanced past the dangerous event\'s scheduled time while phases were already exhausted', postExhaustionTick);
        const dangerousStatus = await plannerPage.evaluate(() => window.RmoozFreeFightDemo.engine.runtimeEventStatusBoard().filter(e => e.id === 'dangerous-event-1')[0]);
        ok(!!dangerousStatus, 'dangerous-event-1 status is reported (not silently ignored)');
        ok(dangerousStatus && dangerousStatus.status === 'blocked', 'dangerous-event-1 is BLOCKED, never fired/applied', JSON.stringify(dangerousStatus));
        const redAfter = await plannerPage.evaluate(() => {
            const sc = window.RmoozScenario.scenario;
            return sc.red_units[0].lat + ',' + sc.red_units[0].lon;
        });
        eq(redAfter, redBefore, 'RED-1\'s position is UNCHANGED — the dangerous move_unit effect never executed even though scenario time kept moving past phase exhaustion');

        // ════════════════════════════════════════════════════════════════
        // 4. Victory condition (enabled live now) ends the scenario after
        //    phase exhaustion; the AAR narrates it
        // ════════════════════════════════════════════════════════════════
        console.log('\n[10] Enable the victory condition live and continue ticking past phase exhaustion -> it ends the scenario');
        await plannerPage.evaluate(() => {
            window.RmoozScenario.scenario.victory_conditions.forEach(function (vc) { vc.enabled = true; });
        });
        const finalState = await plannerPage.evaluate(() => {
            const DEMO = window.RmoozFreeFightDemo;
            let end = null;
            for (let i = 0; i < 15; i++) {
                const sc = DEMO._getScenarioForTest();
                if (!sc || sc.scenario_status !== 'running') DEMO._runScenarioForTest();
                else DEMO._scenarioTickForTest();
                end = DEMO._getScenarioForTest();
                if (end && end.scenario_status === 'complete') break;
            }
            return end;
        });
        console.log('  [debug] final scenario state:', JSON.stringify(finalState && { scenario_status: finalState.scenario_status, end_condition: finalState.end_condition }));
        ok(!!finalState, 'scenario state is reported');
        eq(finalState && finalState.scenario_status, 'complete', 'scenario reached status:complete');
        eq(finalState && finalState.end_condition, 'victory_condition_met', 'the REAL end condition is victory_condition_met (the authored force_ratio_below condition), not a generic fallback code — resolved entirely AFTER phase exhaustion');

        console.log('\n[11] The runtime-play AAR narrates the real outcome');
        const aar = await plannerPage.evaluate(() => window.RmoozFreeFightDemo.engine.runtimePlayAar());
        ok(!!(aar && aar.outcome), 'AAR produces a real outcome (scenario_end_condition was genuinely journaled)', JSON.stringify(aar && aar.outcome));
        ok(aar && aar.outcome && aar.outcome.code === 'victory_condition_met', 'AAR outcome code matches the real end condition');
        ok(aar && aar.outcome && aar.outcome.status === 'pass', 'AAR classifies this Blue-favoring victory as a "pass"', JSON.stringify(aar && aar.outcome));

        console.log('\n[12] No unexpected JS errors across the whole journey');
        ok(consoleErrors.length === 0, 'zero page errors', consoleErrors.slice(0, 5).join(' | '));

        console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
        await browser.close();
        teardown();
        process.exit(fail === 0 ? 0 : 1);
    } catch (e) {
        console.log('FAIL — harness error: ' + (e && e.message));
        console.log(e && e.stack);
        if (serverErr) console.log('  server stderr:', serverErr.slice(0, 2000));
        try { if (browser) await browser.close(); } catch (_) {}
        teardown();
        process.exit(1);
    }
})();
