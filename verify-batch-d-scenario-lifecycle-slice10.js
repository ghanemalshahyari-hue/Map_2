/**
 * verify-batch-d-scenario-lifecycle-slice10.js — Batch D Slice 10 (deep E2E)
 *
 * The full immutable-revision lifecycle journey, driven in a REAL headless
 * browser against a REAL server (real auth, real DB, real
 * scenario-approval-store + scenario-revisions-store), on an isolated temp
 * data dir + random port.
 *
 * HARD CONSTRAINT (explicit owner requirement for this slice): the scenario
 * is authored using ONLY visible UI controls and a REAL map click — no
 * page.evaluate() draft injection anywhere in this file. Every other Batch
 * B/C/D browser test (verify-batch-b-launch-journey-1.js included) seeds its
 * draft via window.AppEditMode._testing/openDraftForReview through
 * page.evaluate() as a deliberate test-setup shortcut; this file is the one
 * exception that must NOT take that shortcut, because the whole point of a
 * final deep-E2E pass is to prove the real Builder UI (the "+ New scenario"
 * form, the Geometry step's "Set objective on map" picker, the Scenario
 * Library, the Revisions view) actually works end to end for an operator who
 * has never touched the console.
 *
 * page.evaluate() IS still used in a few places below — but only for
 * negative-path AUTHORIZATION assertions (a plain fetch() checking a status
 * code, matching the established convention in every other Batch A-D test)
 * or for READING already-rendered state (getDraft().name, readiness()) to
 * make an assertion — never to construct or mutate scenario content.
 *
 *   node verify-batch-d-scenario-lifecycle-slice10.js
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
const PORT           = 8940 + Math.floor(Math.random() * 200);
const DATA_DIR       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-batch-d-e2e-'));
const BOOTSTRAP_PW   = 'bootstrap-verify-pw-batchd-e2e';
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

const SCENARIO_NAME = 'd10-e2e-scenario';
const CLONE_NAME     = 'd10-e2e-scenario-clone';

// Edit Mode MUST be toggled ON before "+ New scenario" is clicked. setMode(true)
// unconditionally rebuilds _draft from whatever scenario is currently "live"
// (window.RmoozScenario.scenario) — if Edit Mode is entered AFTER a fresh
// draft already exists, that rebuild silently discards the fresh draft in
// favor of the stale live one. Entering Edit Mode first means the ONLY thing
// that sets _draft afterward is openDraftForReview() (called by Create),
// which is exactly what an operator clicking the real buttons in this order
// would experience — this is not a test-only workaround, it is the correct
// real-world click order.
async function openWorkspaceAndEditMode(page) {
    await page.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const workspaceButton = page.locator('[title*="Live Scenario Workspace"]').first();
    await workspaceButton.waitFor({ state: 'visible', timeout: 8000 });
    await workspaceButton.click();
    await page.waitForTimeout(500);
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

// "Set objective on map" lives on the 'map' step (Map & AO, rail index 1,
// renderAOCard) — NOT the 'geom' step (Forces Geometry, index 8,
// renderGeometryCard, which only has pipeline/BLS map pickers). STEPS order:
// meta,map,sides,posture,objectives,doctrine,time,weather,geom,forces,...
async function gotoMapAoStep(page) {
    await page.locator('.sw-step-item').nth(1).click();
    await page.waitForTimeout(300);
}

(async function run() {
    let browser;
    try {
        await waitForServer(15000);
        console.log('[setup] server up');

        browser = await chromium.launch({ headless: true });

        console.log('\n[setup] registering author + commander accounts (test-identity setup via direct HTTP — established convention, not draft injection)');
        const authorCtx    = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
        const commanderCtx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });

        await authorCtx.request.post(BASE_URL + '/api/auth/register', { data: { username: 'd10-author', password: 'testpass1' } });
        await authorCtx.request.post(BASE_URL + '/api/auth/login', { data: { username: 'd10-author', password: 'testpass1' } });
        await commanderCtx.request.post(BASE_URL + '/api/auth/register', { data: { username: 'd10-commander', password: 'testpass1' } });
        await commanderCtx.request.post(BASE_URL + '/api/auth/login', { data: { username: 'd10-commander', password: 'testpass1' } });

        const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
        const db = new Database(path.join(DATA_DIR, 'app.db'));
        db.prepare("UPDATE users SET role='commander' WHERE username='d10-commander'").run();
        db.close();

        const authorPage    = await authorCtx.newPage();
        const commanderPage = await commanderCtx.newPage();
        const consoleErrors = [];
        const dialogLog = [];
        // Persistent dialog handler on both pages. Confirms are always
        // accepted. Prompts need real text supplied (Playwright's default
        // accept() on a prompt() returns an empty string, which every
        // prompt-gated action here treats as "cancelled" — matching the
        // Cancel-guard tests already covering these functions).
        [authorPage, commanderPage].forEach((p) => {
            p.on('dialog', async (dialog) => {
                dialogLog.push(dialog.message());
                if (dialog.type() === 'prompt') {
                    if (/[Cc]lone/.test(dialog.message())) await dialog.accept(CLONE_NAME);
                    else if (/[Tt]emplate/.test(dialog.message())) await dialog.accept('D10 E2E Template');
                    else await dialog.accept('d10-e2e-prompt-value');
                } else {
                    await dialog.accept();
                }
            });
            p.on('pageerror', (err) => consoleErrors.push('[pageerror] ' + err.message + '\n' + (err.stack || '')));
        });

        // ════════════════════════════════════════════════════════════════
        // 1. Author a scenario through the REAL "+ New scenario" form
        // ════════════════════════════════════════════════════════════════
        console.log('\n[1] Author creates a scenario via the real "+ New scenario" form (Edit Mode entered FIRST)');
        await openWorkspaceAndEditMode(authorPage);
        await authorPage.locator('#sw-editmode-newscen').click();
        const form = authorPage.locator('.sw-newscen-form');
        await form.waitFor({ state: 'visible', timeout: 5000 });
        const formInputs = form.locator('input.sw-edit-input');
        await formInputs.nth(0).fill(SCENARIO_NAME);
        await formInputs.nth(1).fill('D10 E2E Scenario');
        // Starter-template list populates asynchronously (fetch to
        // /api/scenario-templates) — wait for the real option to exist
        // before selecting it, rather than assuming it's there instantly.
        await authorPage.waitForFunction(() => {
            const sel = document.querySelector('.sw-newscen-form select');
            return !!(sel && Array.from(sel.options).some((o) => o.value === 'template:sahil-corridor'));
        }, null, { timeout: 8000 });
        await form.locator('select').selectOption('template:sahil-corridor');
        await form.locator('button', { hasText: 'Create' }).click();
        await authorPage.waitForTimeout(600);

        const draftNameAfterCreate = await authorPage.evaluate(() => (window.AppEditMode.getDraft() || {}).name);
        eq(draftNameAfterCreate, SCENARIO_NAME, 'the NEW draft (not a stale previously-active scenario) is what Edit Mode shows after Create');

        console.log('\n[2] The wizard visibly reflects the new scenario\'s real content (from the template, not blank)');
        await authorPage.locator('.sw-step-item').nth(9).click(); // Forces (OOB)
        await authorPage.waitForTimeout(300);
        const forcesText = await authorPage.locator('#sw-editmode-editor').innerText().catch(() => '');
        ok(forcesText.length > 50, 'Forces step shows real, non-empty authored content from the template', forcesText.slice(0, 150));

        console.log('\n[3] Save to server -> revision 1');
        await gotoSaveStep(authorPage);
        await authorPage.locator('button', { hasText: 'Save to server' }).first().click();
        await authorPage.waitForTimeout(800);
        const statusAfterSave = await authorPage.locator('#sw-editmode-status').innerText().catch(() => '');
        ok(!/error|failed|blocked/i.test(statusAfterSave), 'save-to-server status is not an error', statusAfterSave);

        const revisionsAfterFirstSave = await authorPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/revisions', { credentials: 'include' });
            const j = await r.json();
            return j.revisions;
        }, SCENARIO_NAME);
        eq((revisionsAfterFirstSave || []).length, 1, 'exactly one revision exists after the first real Save');

        console.log('\n[4] Submit for review (real click)');
        await authorPage.locator('button', { hasText: 'Submit for review' }).first().click();
        await authorPage.waitForTimeout(600);

        // ════════════════════════════════════════════════════════════════
        // 2. Self-approval-denial + unauthenticated denial (auth-boundary
        //    checks — plain fetch/http assertions, not content authoring)
        // ════════════════════════════════════════════════════════════════
        console.log('\n[5] Authorization boundaries: author cannot approve their own scenario; no session cannot approve at all');
        const authorApproveAttempt = await authorPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/approve', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            return r.status;
        }, SCENARIO_NAME);
        eq(authorApproveAttempt, 403, 'author (not a commander) attempting to approve their own scenario -> 403');
        const unauthApprove = await httpRequest('POST', '/api/scenarios/' + SCENARIO_NAME + '/approve', {});
        eq(unauthApprove, 401, 'unauthenticated approve attempt -> 401');

        // ════════════════════════════════════════════════════════════════
        // 3. Commander finds + approves the scenario via the real Scenario
        //    Library UI (not a page.evaluate() fetch-and-inject)
        // ════════════════════════════════════════════════════════════════
        console.log('\n[6] Commander opens the Scenario Library (real UI), finds the scenario, opens it in the Builder, approves it');
        await commanderPage.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
        await commanderPage.waitForTimeout(500);
        await commanderPage.locator('.tool-rail-btn[data-tool="scenario-library"]').click();
        const librarySearch = commanderPage.locator('#rmooz-lib-search');
        await librarySearch.waitFor({ state: 'visible', timeout: 5000 });
        await librarySearch.fill(SCENARIO_NAME);
        await commanderPage.waitForTimeout(400);
        const openBuilderBtn = commanderPage.locator('[data-act="open-builder"][data-name="' + SCENARIO_NAME + '"]');
        await openBuilderBtn.waitFor({ state: 'visible', timeout: 5000 });
        await openBuilderBtn.click();
        await commanderPage.waitForTimeout(900); // openInBuilder's own settle delay before switchTool+setMode
        await gotoSaveStep(commanderPage);
        await commanderPage.waitForTimeout(600);
        const approveBtn = commanderPage.locator('button', { hasText: 'Approve (commander)' }).first();
        await approveBtn.waitFor({ state: 'attached', timeout: 5000 });
        ok(!(await approveBtn.isDisabled()), 'commander sees an ENABLED Approve button (reached via the Library, not evaluate())');
        await approveBtn.click();
        await commanderPage.waitForTimeout(600);
        const approvalCardText1 = await commanderPage.locator('.sw-approval-card').innerText().catch(() => '');
        ok(/approved/i.test(approvalCardText1), 'commander view shows status: approved after clicking Approve', approvalCardText1.slice(0, 150));

        // ════════════════════════════════════════════════════════════════
        // 4. Editing an APPROVED scenario via a REAL MAP CLICK creates a new
        //    draft revision and does NOT alter the approved revision
        // ════════════════════════════════════════════════════════════════
        console.log('\n[7] Author edits the APPROVED scenario with a real map click (Set objective on map)');
        await gotoSaveStep(authorPage); // re-render triggers a fresh approval-status fetch
        await authorPage.waitForTimeout(600);
        const approvalBeforeEdit = await authorPage.locator('.sw-approval-card').innerText().catch(() => '');
        ok(/approved/i.test(approvalBeforeEdit), 'author sees the commander\'s approval reflected before making the edit');

        await gotoMapAoStep(authorPage);
        const objBefore = await authorPage.evaluate(() => (window.AppEditMode.getDraft() || {}).obj);
        // Camera positioning only (Leaflet setView), not draft content — the
        // map's default view is a wide global shot, so without this the exact
        // pixel offset below would resolve to a wildly different lon/lat than
        // the AO. A real operator would pan/zoom to the AO the same way
        // before clicking; this is the click-testing equivalent.
        await authorPage.evaluate(() => {
            const bbox = (window.AppEditMode.getDraft() || {}).map_bbox;
            if (window.map && Array.isArray(bbox) && bbox.length === 4) {
                window.map.setView([(bbox[1] + bbox[3]) / 2, (bbox[0] + bbox[2]) / 2], 9);
            }
        });
        await authorPage.waitForTimeout(300);
        await authorPage.locator('#sw-editmode-editor button', { hasText: 'Set objective on map' }).click();
        await authorPage.waitForTimeout(300);
        const mapBox = await authorPage.locator('#map').boundingBox();
        ok(!!mapBox, 'the map element has a real bounding box to click into');
        // A real, physical mouse click on the Leaflet map — this is what
        // fires the picker's map.on('click') handler, exactly as it would
        // for a human operator. Offset from center so it's a genuinely
        // different point than whatever the map's default view center is.
        await authorPage.mouse.click(mapBox.x + mapBox.width / 2 + 60, mapBox.y + mapBox.height / 2 - 40);
        await authorPage.waitForTimeout(400);
        const objAfter = await authorPage.evaluate(() => (window.AppEditMode.getDraft() || {}).obj);
        ok(JSON.stringify(objAfter.coord) !== JSON.stringify(objBefore.coord), 'the real map click actually moved the objective coord', JSON.stringify({ before: objBefore.coord, after: objAfter.coord }));

        console.log('\n[8] Save to server -> revision 2 (a NEW draft revision; the approved revision 1 is untouched)');
        await gotoSaveStep(authorPage);
        await authorPage.locator('button', { hasText: 'Save to server' }).first().click();
        await authorPage.waitForTimeout(800);

        const compareAfterEdit = await authorPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/revisions/1/compare/2', { credentials: 'include' });
            return r.json();
        }, SCENARIO_NAME);
        // obj (the single scenario objective) is tracked under 'metadata' by
        // scenario-revision-compare.js, not 'placement' — 'placement' is
        // specifically the per-unit red_units/blue_units_initial coord diff.
        // Still a real, human-readable consequence of the real map click.
        const objFieldChange = (compareAfterEdit.sections.metadata.changed || []).find((f) => f.field === 'obj');
        ok(!!objFieldChange, 'comparing rev1 vs rev2 shows the obj field changed (the real map click)', JSON.stringify(objFieldChange));
        const rev1ContentUnchanged = await authorPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/revisions', { credentials: 'include' });
            const j = await r.json();
            return j.revisions.length;
        }, SCENARIO_NAME);
        eq(rev1ContentUnchanged, 2, 'exactly two revisions now exist — the edit created a new one, it did not rewrite revision 1');

        console.log('\n[9] The re-save demoted approval back to draft — Launch must now be disabled again');
        await gotoSaveStep(authorPage);
        await authorPage.waitForTimeout(600);
        const approvalAfterEdit = await authorPage.locator('.sw-approval-card').innerText().catch(() => '');
        const statusLineAfterEdit = (approvalAfterEdit.match(/Status:\s*(\S+)/) || [])[1];
        eq(statusLineAfterEdit, 'draft', 'approval status is back to draft after editing the approved scenario');
        const launchBtnAfterEdit = authorPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(await launchBtnAfterEdit.isDisabled(), 'Launch is disabled again — the edited draft cannot launch on the strength of the old approval');

        // ════════════════════════════════════════════════════════════════
        // 5. Re-submit, re-approve (now binding to revision 2), then Launch + Run
        // ════════════════════════════════════════════════════════════════
        console.log('\n[10] Re-submit for review, commander re-approves (binds to revision 2 this time)');
        await authorPage.locator('button', { hasText: 'Submit for review' }).first().click();
        await authorPage.waitForTimeout(600);
        await gotoSaveStep(commanderPage);
        await commanderPage.waitForTimeout(600);
        const approveBtn2 = commanderPage.locator('button', { hasText: 'Approve (commander)' }).first();
        await approveBtn2.waitFor({ state: 'attached', timeout: 5000 });
        ok(!(await approveBtn2.isDisabled()), 'commander sees Approve enabled again for the resubmitted revision 2');
        await approveBtn2.click();
        await commanderPage.waitForTimeout(600);
        const approvedRevision = await authorPage.evaluate(async (name) => {
            const r = await fetch('/api/scenarios/' + name + '/approval', { credentials: 'include' });
            const j = await r.json();
            return j.approved_revision;
        }, SCENARIO_NAME);
        eq(approvedRevision, 2, 'the approval is bound to the exact revision (2) that was actually reviewed, not just "latest"');

        console.log('\n[11] Launch requires confirmation and opens the SCC with the right scenario');
        await gotoSaveStep(authorPage);
        await authorPage.waitForTimeout(700);
        const launchBtn = authorPage.locator('button', { hasText: 'Launch to Scenario Control Center' }).first();
        ok(!(await launchBtn.isDisabled()), 'Launch is enabled after the SECOND approval');
        const dialogCountBeforeLaunch = dialogLog.length;
        await launchBtn.click();
        await authorPage.waitForTimeout(1000);
        const launchDialogs = dialogLog.slice(dialogCountBeforeLaunch);
        ok(launchDialogs.length > 0, 'a confirmation dialog was shown before launching');
        const sccVisible = await authorPage.locator('[data-scc="window"]').first().isVisible().catch(() => false);
        ok(sccVisible, 'the Scenario Control Center panel is visible after launch');

        console.log('\n[12] SCC flow: Readiness -> Prepare (Staff-Safe, deterministic) -> Commit -> Run -> Stop');
        const readinessBeforeRun = await authorPage.evaluate(() => {
            try { return window.RmoozFreeFightDemo.engine.readiness(); } catch (e) { return { error: String(e) }; }
        });
        eq(readinessBeforeRun.scenario_name, SCENARIO_NAME, 'SCC readiness reflects the just-launched scenario');

        // "Run Scenario" only appears once the SCC's own Readiness->Prepare->
        // Review->Commit->Run flow reaches "committed" (scenario-control-
        // center.js's FLOW). Staff-Safe is the deterministic, no-AI COA path —
        // the right choice for a repeatable test (matches the reference: the
        // dev environment's Ollama model isn't installed, so the AI path
        // would be flaky/slow here, not because AI is being avoided on
        // principle).
        await authorPage.locator('[data-scc="advanced-planning-controls"] summary').click();
        await authorPage.waitForTimeout(300);
        const staffSafeBtn = authorPage.locator('[data-act="scc-prepare-staffsafe"]').first();
        await staffSafeBtn.waitFor({ state: 'visible', timeout: 5000 });
        await staffSafeBtn.click();
        await authorPage.waitForTimeout(1500);

        const commitBtn = authorPage.locator('[data-act="scc-commit"]').first();
        await commitBtn.waitFor({ state: 'visible', timeout: 8000 });
        ok(!(await commitBtn.isDisabled()), 'Staff-Safe produced an executable COA — Commit is enabled');
        await commitBtn.click();
        await authorPage.waitForTimeout(800);

        const clockLabelBeforeRun = await authorPage.evaluate(() => {
            try { return window.RmoozFreeFightDemo.engine.scenarioClockLabel(); } catch (e) { return null; }
        });
        const runBtn = authorPage.locator('[data-act="scc-run"]').first();
        await runBtn.waitFor({ state: 'visible', timeout: 5000 });
        await runBtn.click();
        await authorPage.waitForTimeout(3000);
        const stopBtn = authorPage.locator('[data-act="scc-stop"]').first();
        if (await stopBtn.count()) { await stopBtn.click(); await authorPage.waitForTimeout(500); }
        const runtimeStateAfterRun = await authorPage.evaluate(() => {
            try { return window.RmoozFreeFightDemo.engine.runtimeState(); } catch (e) { return null; }
        });
        const clockLabelAfterRun = await authorPage.evaluate(() => {
            try { return window.RmoozFreeFightDemo.engine.scenarioClockLabel(); } catch (e) { return null; }
        });
        ok(runtimeStateAfterRun !== 'stopped' && runtimeStateAfterRun != null, 'clicking Run Scenario actually transitioned the runtime out of "stopped"', String(runtimeStateAfterRun));
        ok(clockLabelAfterRun !== clockLabelBeforeRun, 'the scenario clock label advanced after Run', JSON.stringify({ before: clockLabelBeforeRun, after: clockLabelAfterRun }));

        // ════════════════════════════════════════════════════════════════
        // 6. Archive / Restore-from-archive / Clone / Compare / Provenance —
        //    all via the real Scenario Library + Revisions view UI
        // ════════════════════════════════════════════════════════════════
        console.log('\n[13] Scenario Library -> Revisions view -> Archive (real click + real confirm dialog)');
        await commanderPage.goto(BASE_URL + '/app.html', { waitUntil: 'domcontentloaded' });
        await commanderPage.waitForTimeout(500);
        await commanderPage.locator('.tool-rail-btn[data-tool="scenario-library"]').click();
        await commanderPage.locator('#rmooz-lib-search').fill(SCENARIO_NAME);
        await commanderPage.waitForTimeout(400);
        await commanderPage.locator('[data-act="revisions"][data-name="' + SCENARIO_NAME + '"]').click();
        const revBody = commanderPage.locator('#rmooz-rev-body');
        await revBody.waitFor({ state: 'visible', timeout: 5000 });
        await commanderPage.waitForTimeout(500);

        const archiveBtn = commanderPage.locator('#rmooz-rev-archive');
        await archiveBtn.waitFor({ state: 'visible', timeout: 5000 });
        await archiveBtn.click();
        await commanderPage.waitForTimeout(600);
        const statusAfterArchive = await commanderPage.locator('#rmooz-rev-status').innerText().catch(() => '');
        ok(/[Aa]rchived/.test(statusAfterArchive), 'status line confirms Archived', statusAfterArchive);

        console.log('\n[14] Restore from archive (same toggle button, now relabeled)');
        const restoreArchiveBtn = commanderPage.locator('#rmooz-rev-archive');
        await restoreArchiveBtn.waitFor({ state: 'visible', timeout: 5000 });
        ok(/Restore from Archive/i.test(await restoreArchiveBtn.innerText()), 'the toggle button now reads Restore from Archive');
        await restoreArchiveBtn.click();
        await commanderPage.waitForTimeout(600);
        const statusAfterRestore = await commanderPage.locator('#rmooz-rev-status').innerText().catch(() => '');
        ok(/[Rr]estored/.test(statusAfterRestore), 'status line confirms Restored from archive', statusAfterRestore);

        console.log('\n[15] Clone via the real Clone button + real prompt dialog');
        const cloneBtn = commanderPage.locator('#rmooz-rev-clone');
        await cloneBtn.click();
        await commanderPage.waitForTimeout(600);
        const statusAfterClone = await commanderPage.locator('#rmooz-rev-status').innerText().catch(() => '');
        ok(statusAfterClone.indexOf(CLONE_NAME) !== -1, 'status line names the real clone target', statusAfterClone);
        const cloneCheck = await commanderPage.evaluate(async (name) => {
            const r = await fetch('/api/ai/scenario/' + name, { credentials: 'include' });
            return r.status;
        }, CLONE_NAME);
        eq(cloneCheck, 200, 'the cloned scenario genuinely exists server-side as an independent scenario');

        console.log('\n[16] Compare revisions (real select + real Compare click) shows a human-readable diff of the real map-click edit');
        await commanderPage.locator('#rmooz-rev-a').selectOption('1');
        await commanderPage.locator('#rmooz-rev-b').selectOption('2');
        await commanderPage.locator('#rmooz-rev-compare-btn').click();
        await commanderPage.waitForTimeout(500);
        const diffText = await commanderPage.locator('#rmooz-rev-diff').innerText().catch(() => '');
        ok(diffText.indexOf('obj') !== -1, 'the rendered diff names the changed obj field (the real map-click edit)', diffText.slice(0, 200));
        ok(diffText.indexOf('{') === -1, 'no raw JSON is shown to the operator in the rendered diff');

        console.log('\n[17] Provenance shows the real author/approver chain with the correct approved revision');
        const provenanceText = await commanderPage.locator('.rmooz-rev-provenance').innerText().catch(() => '');
        ok(provenanceText.indexOf('d10-author') !== -1, 'provenance names the real author');
        ok(provenanceText.indexOf('d10-commander') !== -1, 'provenance names the real approving commander');
        ok(/revision 2/.test(provenanceText), 'provenance shows the approval bound to revision 2 (the resubmitted one)');

        // ── Zero unexpected page errors across the whole journey ───────────
        console.log('\n[18] No unexpected JS errors across the whole journey');
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
