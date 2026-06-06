#!/usr/bin/env node
'use strict';

const assert = require('assert');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCENARIOS_DIR = path.join(ROOT, 'data', 'scenarios');

function mkdirp(p) {
    fs.mkdirSync(p, { recursive: true });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await fn()) return true;
        await sleep(100);
    }
    throw new Error('timed out waiting for ' + label);
}

function snapshotScenarioDb() {
    try {
        return fs.readdirSync(SCENARIOS_DIR)
            .filter(n => /\.json$/i.test(n))
            .sort()
            .map(n => {
                const st = fs.statSync(path.join(SCENARIOS_DIR, n));
                return n + ':' + st.size;
            });
    } catch (_) {
        return [];
    }
}

function safeRmTemp(dir) {
    const resolved = path.resolve(dir);
    const base = path.resolve(os.tmpdir());
    if (!resolved.startsWith(base + path.sep)) {
        throw new Error('refusing to remove non-temp path: ' + resolved);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
}

function makeFakeWargameGen(tmp) {
    const testingAi = path.join(tmp, 'TestingAI');
    const wgen = path.join(testingAi, 'WarGamingGEN');
    mkdirp(path.join(wgen, 'inputs'));
    mkdirp(path.join(wgen, 'tests'));
    fs.writeFileSync(path.join(wgen, 'inputs', 'scenario.json'), JSON.stringify({
        phases: Array.from({ length: 6 }, (_, i) => ({ id: 'phase-' + i })),
    }, null, 2));
    fs.writeFileSync(path.join(wgen, 'tests', 'test_full_run.py'), `
const fs = require('fs');
const path = require('path');
const runId = '2026-06-06_00-00-00_unified_import_3';
const runDir = path.join(process.cwd(), 'runs', runId);
const ckDir = path.join(runDir, 'checkpoints');
fs.mkdirSync(ckDir, { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'runs', 'latest.txt'), runId);
let phase = 0;
function writeNext() {
  if (phase < 6) {
    const name = 'phase' + String(phase).padStart(2, '0') + '.json';
    fs.writeFileSync(path.join(ckDir, name), JSON.stringify({ phase }, null, 2));
    phase += 1;
    setTimeout(writeNext, 160);
    return;
  }
  setInterval(() => {}, 1000);
}
writeNext();
`, 'utf8');
    return { testingAi, wgen };
}

function createBridgeCaller(bridge) {
    return function callBridge(method, pathName) {
        return new Promise((resolve, reject) => {
            const url = new URL('http://127.0.0.1' + pathName);
            const req = new EventEmitter();
            const res = {};
            let handled;
            let response = null;
            const timer = setTimeout(() => reject(new Error(method + ' ' + pathName + ' did not respond')), 12000);
            function maybeResolve() {
                if (handled === undefined || !response) return;
                clearTimeout(timer);
                resolve(Object.assign({ handled }, response));
            }
            handled = bridge.handle(req, res, {
                url,
                pathname: url.pathname,
                method,
                scenarios: { clearCache() {}, setActiveName() {} },
                sendJson(_res, status, payload) {
                    response = { status, body: payload };
                    maybeResolve();
                },
            });
            if (!handled) {
                clearTimeout(timer);
                resolve({ handled, status: 404, body: null });
            } else {
                maybeResolve();
            }
        });
    };
}

async function runServerCancelAssertions() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-unified-import-3-'));
    const beforeScenarios = snapshotScenarioDb();
    try {
        const dirs = makeFakeWargameGen(tmp);
        process.env.RMOOZ_TESTINGAI_DIR = dirs.testingAi;
        process.env.RMOOZ_WARGAMEGEN_DIR = dirs.wgen;
        process.env.RMOOZ_ALLOW_SIM_RUN = '1';
        process.env.RMOOZ_PYTHON = process.execPath;
        process.env.RMOOZ_SIM_MODEL = 'unified-import-3-test-model';

        const bridge = require('../server/wargame-sim-bridge');
        const callBridge = createBridgeCaller(bridge);

        const noRun = await callBridge('POST', '/api/wargame-sim/cancel');
        assert.strictEqual(noRun.handled, true, 'cancel route should exist');
        assert.strictEqual(noRun.status, 409, 'cancel should not work when no child is running');
        assert.strictEqual(noRun.body.cancelled, false);
        assert.strictEqual(noRun.body.partial_import_allowed, false, 'under-4/no-checkpoint cancel cannot import partial');

        const start = await callBridge('POST', '/api/wargame-sim/run');
        assert.strictEqual(start.status, 200);
        assert.strictEqual(start.body.started, true);

        const c = bridge._internals.cfg();
        await waitFor(() => {
            const runDir = bridge._internals.latestRunDir(c);
            return bridge._internals.countCheckpoints(runDir) >= 4;
        }, 'fake checkpoints');

        const runDirBeforeCancel = bridge._internals.latestRunDir(c);
        const checkpointsBefore = bridge._internals.countCheckpoints(runDirBeforeCancel);
        assert.ok(checkpointsBefore >= 4, 'fake run should have at least four checkpoints before cancel');

        const cancel = await callBridge('POST', '/api/wargame-sim/cancel');
        assert.ok(cancel.status === 200 || cancel.status === 202, 'cancel should respond with 200/202');
        assert.strictEqual(cancel.body.cancelled, true, 'cancel should report cancelled=true');

        await waitFor(async () => {
            const status = await callBridge('GET', '/api/wargame-sim/status');
            return status.body && status.body.sim && status.body.sim.running === false;
        }, 'sim stopped');

        const status = await callBridge('GET', '/api/wargame-sim/status');
        assert.strictEqual(status.status, 200);
        assert.strictEqual(status.body.sim.running, false, 'cancel should kill active child');
        assert.strictEqual(status.body.sim.status, 'stopped_partial', 'checkpointed cancel should become stopped_partial');
        assert.ok(status.body.sim.phases_done >= checkpointsBefore, 'phases_done should still be reported');
        assert.strictEqual(status.body.sim.partial_import_allowed, status.body.sim.phases_done >= 4);
        assert.strictEqual(status.body.sim.can_resume, true, 'checkpointed cancel should be resumable');

        const checkpointsAfter = bridge._internals.countCheckpoints(runDirBeforeCancel);
        assert.ok(checkpointsAfter >= checkpointsBefore, 'checkpoints should be preserved');
        assert.ok(!fs.existsSync(path.join(c.exportToRmooz, 'latest.json')), 'cancel must not publish');
        assert.ok(!fs.existsSync(path.join(c.exportToRmooz, path.basename(runDirBeforeCancel))), 'cancel must not create export folder');

        const afterScenarios = snapshotScenarioDb();
        assert.deepStrictEqual(afterScenarios, beforeScenarios, 'cancel must not import or mutate scenario DB');
    } finally {
        safeRmTemp(tmp);
    }
}

async function runWizardUiAssertions() {
    const { chromium } = require('playwright');
    const scriptPath = path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js');
    const browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
            || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        let cancelled = false;
        await page.route('http://rmooz.test/harness.html', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><html><body><div id="sw-live-scenario-import-card"></div></body></html>',
        }));
        await page.route('http://rmooz.test/api/wargame-sim/status', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                runEnabled: true,
                docs: { red: true, blue: true },
                export: { all_phases: false },
                sim: cancelled ? {
                    running: false,
                    status: 'stopped_partial',
                    message: 'Generation stopped by operator after 5 of 6 phases.',
                    phases_done: 5,
                    phases_total: 6,
                    partial_available: true,
                    partial_import_allowed: true,
                    can_resume: true,
                    exit_code: 1,
                } : {
                    running: true,
                    status: 'running',
                    message: 'Generating - phase 5 of 6...',
                    phases_done: 5,
                    phases_total: 6,
                    partial_available: false,
                    partial_import_allowed: false,
                    can_resume: true,
                    exit_code: null,
                },
            }),
        }));
        await page.route('http://rmooz.test/api/wargame-sim/cancel', route => {
            cancelled = true;
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, cancelled: true, phases_done: 5, phases_total: 6, partial_import_allowed: true }),
            });
        });
        await page.goto('http://rmooz.test/harness.html');
        await page.addScriptTag({ path: scriptPath });
        await page.waitForSelector('#wg-wz-stop');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('wg-wz-stop')).display !== 'none');
        assert.strictEqual(await page.locator('#wg-wz-stop').textContent(), 'Stop Generation', 'wizard should show Stop while running');

        await page.click('#wg-wz-stop');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('wg-wz-stop')).display === 'none');
        assert.strictEqual(await page.locator('#wg-wz-stopped').evaluate(el => getComputedStyle(el).display), 'block', 'stopped panel should show after cancel');
        assert.notStrictEqual(await page.locator('#wg-wz-continue').evaluate(el => getComputedStyle(el).display), 'none', 'Continue should appear after cancel');
        assert.notStrictEqual(await page.locator('#wg-wz-restart').evaluate(el => getComputedStyle(el).display), 'none', 'Restart should appear after cancel');
        assert.notStrictEqual(await page.locator('#wg-wz-logs').evaluate(el => getComputedStyle(el).display), 'none', 'View Logs should appear after cancel');
        assert.notStrictEqual(await page.locator('#wg-wz-partial').evaluate(el => getComputedStyle(el).display), 'none', 'Import Partial should appear at >=4 phases');

        const under4 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
        await under4.route('http://rmooz-under4.test/harness.html', route => route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><html><body><div id="sw-live-scenario-import-card"></div></body></html>',
        }));
        await under4.route('http://rmooz-under4.test/api/wargame-sim/status', route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                runEnabled: true,
                docs: { red: true, blue: true },
                export: { all_phases: false },
                sim: {
                    running: false,
                    status: 'stopped_partial',
                    message: 'Generation stopped by operator after 3 of 6 phases.',
                    phases_done: 3,
                    phases_total: 6,
                    partial_available: true,
                    partial_import_allowed: false,
                    can_resume: true,
                    exit_code: 1,
                },
            }),
        }));
        await under4.goto('http://rmooz-under4.test/harness.html');
        await under4.addScriptTag({ path: scriptPath });
        await under4.waitForSelector('#wg-wz-partial-note');
        await under4.waitForFunction(() => document.getElementById('wg-wz-partial-note').textContent.includes('at least 4'));
        assert.strictEqual(await under4.locator('#wg-wz-partial').evaluate(el => getComputedStyle(el).display), 'none', 'Import Partial should hide under 4 phases');
    } finally {
        await browser.close();
    }
}

(async () => {
    await runServerCancelAssertions();
    await runWizardUiAssertions();
    console.log('PASS test-unified-import-3-stop-generation');
})().catch(err => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
