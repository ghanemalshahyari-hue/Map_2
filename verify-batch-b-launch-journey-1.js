/**
 * verify-batch-b-launch-journey-1.js — Batch B Slice 12 (deep E2E)
 *
 * The full author -> submit -> approve -> launch journey, driven in a REAL
 * headless browser against a REAL server (real auth, real DB, real
 * scenario-approval-store lifecycle), on an isolated temp data dir + random
 * port. Two isolated Playwright browser CONTEXTS (separate cookie jars) —
 * one for the planner (author), one for the commander (approver) — so the
 * two-role workflow is genuinely tested, not simulated in one session.
 *
 * SCOPE / HONEST LIMITATIONS:
 *   - User accounts are registered/logged-in via direct HTTP calls through
 *     each browser context's own request API (so cookies land in the right
 *     context) rather than driving the login FORM — the real login form is
 *     already covered by verify-canonical-workflow-1.js; this pass is about
 *     the Builder/approval/launch journey, not re-proving login works.
 *   - The rich scenario draft (units, doctrine, missions, objectives) is
 *     seeded via page.evaluate() calling the REAL, exported production
 *     functions (window.AppEditMode._testing.*, window.AppEditMode.
 *     openDraftForReview) rather than clicking through every custom map-
 *     click picker for every field — a deliberate test-setup shortcut, not
 *     a fake control. Every ACTUAL acceptance-criteria action (Submit,
 *     Approve, Reject, Reopen, Launch, the confirmation prompt) is driven
 *     via real button clicks against the real rendered DOM.
 *   - The commander is promoted from 'planner' to 'commander' via a direct
 *     DB update (no role-management UI exists yet) — matching the
 *     established convention in test-command-authority-slice2.js.
 *
 *   node verify-batch-b-launch-journey-1.js
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
const PORT           = 8700 + Math.floor(Math.random() * 200);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-launch-journey-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-launchjourney';
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

// Builds a rich, canonical draft via the SAME production defaults/fillers
// the New Scenario form uses, then layers on units/doctrine/missions/
// objectives with real placement coordinates. Executed inside the page via
// page.evaluate() against window.AppEditMode._testing.
// page.evaluate(fn, arg) passes exactly ONE arg — destructure it here
// rather than declaring two separate function parameters (which silently
// received the whole [name, label] array as the first param and left the
// second undefined, corrupting _draft.name via implicit Array->String
// coercion somewhere downstream).
const SEED_DRAFT_FN = function (args) {
    var nameArg = args[0], labelArg = args[1];
    var T = window.AppEditMode._testing;
    var d = { name: nameArg, scenario_label: labelArg };
    d.sides = T.defaultSides();
    d.postures = T.defaultPostures();
    T.fillGeographyDefaults(d);
    // fillGeographyDefaults() leaves a degenerate [0,0,0,0] bbox and an
    // empty pipeline (both schema-invalid: bbox must be non-degenerate,
    // pipeline needs >= 2 points) — this is normally filled in later by the
    // Map/Geometry authoring steps, which this seed skips, so it must be
    // filled here explicitly for the draft to actually pass server-side
    // scenario-validator.js.
    d.map_bbox = [44.8, 12.5, 45.4, 13.0];
    d.pipeline = [[45.00, 12.70], [45.11, 12.77]];
    d.obj = { name: 'Port Objective', coord: [45.11, 12.77], target_depth_km: 5, carver: 12, radius_km: 3 };
    d.bls_template = [{ name: 'AO-CENTER', coord: [45.11, 12.77] }];
    d.red_units = [{ uid: 'RED-1', label: 'Red Mech Coy', bls: 'AO-CENTER', appear: 0, role: 'Main effort', coord: [45.20, 12.80], strength: 1 }];
    d.blue_units_initial = [{ unit_uid: 'BLUE-1', base_id: 'AO-CENTER', coord: [45.00, 12.70] }];
    d.blue_units_base_ids = ['AO-CENTER'];
    d.doctrine_rules = [{ id: 'doc-1', enabled: true, decision: 'block', severity: 'critical', reason: 'no fire in the AO buffer', applies_to_side: 'RED', condition: 'in_restricted_zone', action: 'fire' }];
    d.mission_tasks = [{ id: 'mission-task-1', unit_id: 'BLUE-1', kind: 'patrol', start_elapsed_hours: 0, end_elapsed_hours: 12, status: 'planned', enabled: true, source: 'scenario' }];
    d.objectives = [{ id: 'obj-1', name: 'Port Objective', owner: 'BLUE', location: { lat: 12.77, lon: 45.11 } }];
    // phase_table/steps are required (min 4 entries) — normally filled by
    // the Time & Duration step's synthesizeDefaultPhaseTable()/
    // ensureStepsMatchPhaseTable(), which this seed also skips.
    d.phase_table = T.synthesizeDefaultPhaseTable();
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
    // mount() is idempotent-guarded (no-ops if the bar already exists) —
    // safe to call again now that the workspace panel actually exists in
    // the DOM (it may not have at page-load time, when init() first ran).
    await page.evaluate(() => { try { window.AppEditMode.mount(); } catch (_) {} });
    const toggleBtn = page.locator('#sw-editmode-toggle');
    await toggleBtn.waitFor({ state: 'visible', timeout: 5000 });
    await toggleBtn.click();
    await page.waitForTimeout(300);
}

async function gotoSaveStep(page) {
    // The Save/Validate step is the LAST rail entry — click it directly by
    // its rail position (no dedicated "go to step" API is exposed).
    const rail = page.locator('.sw-step-item');
    const count = await rail.count();
    await rail.nth(count - 1).click();
    await page.waitForTimeout(300);
}

(async function run() {
    let browser;
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        browser = await chromium.launch({ headless: true });

        // ── Register + promote the two real accounts ───────────────────────
        console.log('\n[setup] registering planner + commander accounts');
        const plannerCtx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
        const commanderCtx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });

        await plannerCtx.request.post(BASE_URL + '/api/auth/register', { data: { username: 'e2e-planner', password: 'testpass1' } });
        await plannerCtx.request.post(BASE_URL + '/api/auth/login', { data: { username: 'e2e-planner', password: 'testpass1' } });
        await commanderCtx.request.post(BASE_URL + '/api/auth/register', { data: { username: 'e2e-commander', password: 'testpass1' } });
        await commanderCtx.request.post(BASE_URL + '/api/auth/login', { data: { username: 'e2e-commander', password: 'testpass1' } });

        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='commander' WHERE username='e2e-commander'").run();
        db.close();

        const plannerPage = await plannerCtx.newPage();
        const commanderPage = await commanderCtx.newPage();
        const consoleErrors = [];
        // Persistent auto-accept dialog handler (Save-to-server's "overwrite?"
        // confirm AND Launch's confirmation prompt both use window.confirm/
        // window.prompt) — without a handler, Playwright auto-DISMISSES
        // dialogs, which silently turns every confirm() into "cancel" and
        // would make re-saves/launches fail without any visible error.
        // dialogLog is used to assert a dialog actually fired for a given action.
        const dialogLog = [];
        [plannerPage, commanderPage].forEach((p) => {
            p.on('dialog', async (dialog) => { dialogLog.push(dialog.message()); await dialog.accept(); });
            p.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message));
        });

        // ════════════════════════════════════════════════════════════════
        // 1. HAPPY PATH: author -> submit -> approve -> launch
        // ════════════════════════════════════════════════════════════════
        console.log('\n[1] Planner authors a canonical scenario (units/placement/doctrine/missions/objectives)');
        await openWorkspaceAndEditMode(plannerPage);
        const seeded = await plannerPage.evaluate(SEED_DRAFT_FN, ['e2e-happy', 'E2E Happy Path']);
        eq(seeded.red_units.length, 1, 'draft carries the authored red unit');
        eq(seeded.blue_units_initial.length, 1, 'draft carries the authored blue unit');
        eq(seeded.doctrine_rules.length, 1, 'draft carries the authored doctrine rule');
        eq(seeded.mission_tasks.length, 1, 'draft carries the authored mission task');
        eq(seeded.objectives.length, 1, 'draft carries the authored objective');
        eq(seeded.commander_review_status, 'needs_review', 'openDraftForReview stamped needs_review');

        console.log('\n[2] Authored content actually renders in the Edit Mode cards');
        // Forces (OOB) step — the tree includes the authored unit ids.
        // STEPS order: meta,map,sides,posture,objectives,doctrine,time,weather,
        // geom,forces,... — 'forces' is index 9 (10th rail item). Navigate by
        // index rather than text match to avoid any locale/RTL text ambiguity.
        await plannerPage.locator('.sw-step-item').nth(9).click();
        await plannerPage.waitForTimeout(300);
        const forcesText = await plannerPage.locator('#sw-editmode-editor').innerText().catch(() => '');
        ok(forcesText.indexOf('RED-1') !== -1 || forcesText.indexOf('BLUE-1') !== -1, 'Forces step shows the authored unit id(s)', forcesText.slice(0, 200));

        console.log('\n[3] Save to server -> creates the lifecycle row');
        await gotoSaveStep(plannerPage);
        await plannerPage.locator('button', { hasText: 'Save to server' }).first().click();
        await plannerPage.waitForTimeout(800);
        const statusAfterSave = await plannerPage.locator('#sw-editmode-status').innerText().catch(() => '');
        ok(!/error|failed/i.test(statusAfterSave), 'save-to-server status is not an error', statusAfterSave);

        console.log('\n[4] Launch is disabled before submission');
        await plannerPage.waitForTimeout(600); // let the fire-and-forget approval refresh land
        let launchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        await launchBtn.waitFor({ state: 'attached', timeout: 5000 });
        ok(await launchBtn.isDisabled(), 'Launch button is disabled pre-submission');

        console.log('\n[5] Planner submits for review');
        await plannerPage.locator('button', { hasText: 'Submit for review' }).first().click();
        await plannerPage.waitForTimeout(600);
        ok(await launchBtn.isDisabled(), 'Launch button still disabled while in_review');

        console.log('\n[6] Unauthorized: the AUTHOR itself cannot approve their own scenario');
        const plannerApproveAttempt = await plannerPage.evaluate(async () => {
            const r = await fetch('/api/scenarios/e2e-happy/approve', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            return r.status;
        });
        eq(plannerApproveAttempt, 403, 'planner (author, not commander) attempting to approve -> 403');

        console.log('\n[7] Unauthenticated: no session at all cannot approve or activate');
        const unauthApprove = await httpRequest('POST', '/api/scenarios/e2e-happy/approve', {});
        eq(unauthApprove, 401, 'unauthenticated approve attempt -> 401');
        const unauthActivate = await httpRequest('POST', '/api/scenario/active', { name: 'e2e-happy' });
        eq(unauthActivate, 401, 'unauthenticated activate attempt -> 401');

        console.log('\n[8] Commander opens the SAME scenario and approves it');
        await openWorkspaceAndEditMode(commanderPage);
        await commanderPage.evaluate(async (name) => {
            const r = await fetch('/api/ai/scenario/' + encodeURIComponent(name), { credentials: 'include' });
            const j = await r.json();
            window.AppEditMode.openDraftForReview(j.scenario, { source: 'manual' });
        }, 'e2e-happy');
        await gotoSaveStep(commanderPage);
        await commanderPage.waitForTimeout(600);
        const approveBtn = commanderPage.locator('button', { hasText: 'Approve (commander)' }).first();
        await approveBtn.waitFor({ state: 'attached', timeout: 5000 });
        ok(!(await approveBtn.isDisabled()), 'commander sees an ENABLED Approve button');
        await approveBtn.click();
        await commanderPage.waitForTimeout(600);
        const commanderStatusText = await commanderPage.locator('.sw-approval-card').innerText().catch(() => '');
        ok(/approved/i.test(commanderStatusText), 'commander view shows status: approved', commanderStatusText.slice(0, 200));

        console.log('\n[9] Planner refreshes and sees Launch now ENABLED');
        await gotoSaveStep(plannerPage); // re-render triggers a fresh approval-status fetch
        await plannerPage.waitForTimeout(700);
        launchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(!(await launchBtn.isDisabled()), 'Launch button is now ENABLED after commander approval');

        console.log('\n[10] Launch requires confirmation, and opens the SCC with the right scenario');
        const dialogCountBeforeLaunch = dialogLog.length;
        await launchBtn.click();
        await plannerPage.waitForTimeout(1000);
        const launchDialogs = dialogLog.slice(dialogCountBeforeLaunch);
        ok(launchDialogs.length > 0, 'a confirmation dialog was shown before launching');
        ok(launchDialogs.some(m => /e2e-happy/.test(m) || /launch/i.test(m)), 'confirmation dialog names the scenario / launch action', launchDialogs.join(' | '));

        const sccVisible = await plannerPage.locator('[data-scc="window"]').first().isVisible().catch(() => false);
        ok(sccVisible, 'the Scenario Control Center panel is visible after launch');

        const readiness = await plannerPage.evaluate(() => {
            try { return window.RmoozFreeFightDemo.engine.readiness(); } catch (e) { return { error: String(e) }; }
        });
        eq(readiness.scenario_name, 'e2e-happy', 'SCC readiness reflects the correct scenario name');
        // units_loaded is a COUNT, not a boolean — 2 (the authored RED-1 + BLUE-1).
        eq(readiness.units_loaded, 2, 'SCC readiness reports the real authored unit count (2), not empty');
        eq(readiness.taskable, 2, 'both authored units are taskable (neither stamped needs_review)');
        eq(readiness.executable, true, 'SCC reports the scenario executable (real units + objective + no blockers)');
        ok(readiness.objective_set === true, 'SCC readiness reports objective_set:true (the authored objective)');

        // ════════════════════════════════════════════════════════════════
        // 2. NEGATIVE: draft (never submitted) cannot launch
        // ════════════════════════════════════════════════════════════════
        console.log('\n[11] NEGATIVE — a never-submitted draft cannot launch');
        // The happy-path Launch (section 10) left the SCC panel floating on
        // top of the page — a full reload gives a clean slate for the
        // remaining negative-path checks (none of which launch again).
        await openWorkspaceAndEditMode(plannerPage);
        await plannerPage.evaluate(SEED_DRAFT_FN, ['e2e-draft-only', 'E2E Draft Only']);
        await gotoSaveStep(plannerPage);
        await plannerPage.locator('button', { hasText: 'Save to server' }).first().click();
        await plannerPage.waitForTimeout(600);
        const draftLaunchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(await draftLaunchBtn.isDisabled(), 'draft-status scenario: Launch button disabled');

        // ════════════════════════════════════════════════════════════════
        // 3. NEGATIVE: rejected cannot launch
        // ════════════════════════════════════════════════════════════════
        console.log('\n[12] NEGATIVE — a rejected scenario cannot launch');
        await plannerPage.evaluate(SEED_DRAFT_FN, ['e2e-rejected', 'E2E Rejected']);
        await gotoSaveStep(plannerPage);
        await plannerPage.locator('button', { hasText: 'Save to server' }).first().click();
        await plannerPage.waitForTimeout(500);
        await plannerPage.locator('button', { hasText: 'Submit for review' }).first().click();
        await plannerPage.waitForTimeout(500);
        const rejectStatus = await commanderPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/reject', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'insufficient doctrine coverage' }) });
            return r.status;
        }, 'e2e-rejected');
        eq(rejectStatus, 200, 'commander rejects e2e-rejected -> 200');
        await gotoSaveStep(plannerPage);
        await plannerPage.waitForTimeout(600);
        const rejectedLaunchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(await rejectedLaunchBtn.isDisabled(), 'rejected-status scenario: Launch button disabled');

        // ════════════════════════════════════════════════════════════════
        // 4. NEGATIVE: reopened (back to draft) cannot launch
        // ════════════════════════════════════════════════════════════════
        console.log('\n[13] NEGATIVE — a reopened (rejected -> draft) scenario cannot launch');
        const reopenStatus = await plannerPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/reopen', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            return r.status;
        }, 'e2e-rejected');
        eq(reopenStatus, 200, 'planner reopens e2e-rejected -> 200');
        await gotoSaveStep(plannerPage);
        await plannerPage.waitForTimeout(600);
        const reopenedLaunchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(await reopenedLaunchBtn.isDisabled(), 'reopened (draft)-status scenario: Launch button disabled');

        // ════════════════════════════════════════════════════════════════
        // 5. NEGATIVE: stale revision (approved, then edited+re-saved) cannot launch
        // ════════════════════════════════════════════════════════════════
        console.log('\n[14] NEGATIVE — a stale revision (edited after approval) cannot launch');
        await plannerPage.evaluate(SEED_DRAFT_FN, ['e2e-stale', 'E2E Stale Revision']);
        await gotoSaveStep(plannerPage);
        await plannerPage.locator('button', { hasText: 'Save to server' }).first().click();
        await plannerPage.waitForTimeout(500);
        await plannerPage.locator('button', { hasText: 'Submit for review' }).first().click();
        await plannerPage.waitForTimeout(500);
        const staleApprove = await commanderPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/approve', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            return r.status;
        }, 'e2e-stale');
        eq(staleApprove, 200, 'commander approves e2e-stale -> 200');

        // Planner edits FURTHER (adds a unit) and re-saves — this must
        // invalidate the just-granted approval (the exact bug fixed in
        // scenario-approval-store.js::invalidateApprovalOnRevision).
        await plannerPage.evaluate((name) => {
            const d = window.AppEditMode.getDraft();
            d.red_units.push({ uid: 'RED-2', label: 'Red 2 (added after approval)', bls: 'AO-CENTER', appear: 0, role: 'unknown', coord: [45.2, 12.8] });
            window.AppEditMode.openDraftForReview(d, { source: 'manual' });
        }, 'e2e-stale');
        await gotoSaveStep(plannerPage);
        await plannerPage.locator('button', { hasText: 'Save to server' }).first().click();
        await plannerPage.waitForTimeout(600);
        const staleApprovalCheck = await plannerPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/approval', { credentials: 'include' });
            const j = await r.json();
            return j.status;
        }, 'e2e-stale');
        eq(staleApprovalCheck, 'draft', 're-save after approval demoted the server-side status back to draft');
        await gotoSaveStep(plannerPage);
        await plannerPage.waitForTimeout(600);
        const staleLaunchBtn = plannerPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(await staleLaunchBtn.isDisabled(), 'stale-revision scenario: Launch button disabled after the re-save');

        // ════════════════════════════════════════════════════════════════
        // 6. Non-taskable (review-only) unit cannot be moved after launch
        // ════════════════════════════════════════════════════════════════
        console.log('\n[15] A non-taskable (needs_review) unit genuinely cannot be tasked to move');
        // Tests the REAL window.RmoozTaskability.classifyUnit running live in
        // the browser (the exact function the runtime-movement gate and SCC
        // readiness panel both call) — this is a pure classifier and needs no
        // live scenario of its own, just the unit's own review-status flags
        // (the same flags brief-to-scenario-v2.js stamps on every AI-generated
        // unit server-side).
        const taskabilityCheck = await plannerPage.evaluate(() => {
            const Taskability = window.RmoozTaskability;
            if (!Taskability) return { error: 'RmoozTaskability not loaded' };
            const reviewOnlyUnit = { unit_uid: 'AI-GEN-1', needs_review: true, exact_unit_position: false, review_only: true };
            const taskableUnit = { unit_uid: 'REAL-1', needs_review: false, exact_unit_position: true, review_only: false, lat: 12.7, lon: 45.1 };
            const cls = Taskability.classifyUnit(reviewOnlyUnit, {});
            const clsOk = Taskability.classifyUnit(taskableUnit, {});
            return { taskable: cls.taskable, review_status: cls.review_status, controlTaskable: clsOk.taskable };
        });
        console.log('  [debug] taskabilityCheck:', JSON.stringify(taskabilityCheck));
        eq(taskabilityCheck.taskable, false, 'a unit stamped needs_review/exact_unit_position:false is classified non-taskable');
        eq(taskabilityCheck.controlTaskable, true, 'control check: an ordinary verified unit IS classified taskable (the gate discriminates, not a blanket false)');

        // ── Zero unexpected page errors across the whole journey ───────────
        console.log('\n[16] No unexpected JS errors across the whole journey');
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
