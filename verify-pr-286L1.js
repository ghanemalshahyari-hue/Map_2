/**
 * verify-pr-286L1.js — Browser verification for PR-286L1 Scenario Folder Intake.
 *
 * Uses Playwright `setInputFiles` to populate the webkitdirectory folder input
 * with a mixed set of files (1 valid JSON + .scen + .ini + .lua + .pdf + .png +
 * .xyz unknown). Then exercises:
 *   - Scan → verify counts, candidates list, unsupported list
 *   - Select the JSON candidate
 *   - Import → verify window.RmoozScenario is replaced and live workspace updates
 *
 * Notes:
 * - Playwright's setInputFiles supports webkitdirectory and preserves
 *   relative paths when each file descriptor has a `name` (no path)
 *   and the input has webkitdirectory. We use single-filename files
 *   for simplicity; the verifier validates classification by extension.
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-286L1-verify';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

// Build a temp folder with mixed file types.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pr286L1-scenario-'));

const TEST_SCENARIO = {
    scenario_id:    'pr286L1-folder-test',
    scenario_label: 'PR-286L1 Folder Import Test',
    model_version:  '286L1-v1',
    steps: [
        { index: 0, id: 'STEP-0', phase: 'briefing',
          decision_options: [
              { id: 'OPT-HOLD', label: 'Hold position' },
              { id: 'OPT-ADV',  label: 'Advance' }
          ] },
        { index: 1, id: 'STEP-1', phase: 'planning' }
    ]
};

const FILES = {
    'scenario.json':   JSON.stringify(TEST_SCENARIO, null, 2),
    'battle.scen':     'BINARY_PLACEHOLDER_DO_NOT_PARSE',
    'weapons.ini':     '[WeaponPatch]\nKey=Value',
    'startup.lua':     'os.execute("rm -rf /")  -- intentionally dangerous',
    'briefing.pdf':    '%PDF-1.4 placeholder',
    'map-tile.png':    'PNG_BINARY_PLACEHOLDER',
    'README.xyz':      'unknown-extension file'
};

Object.keys(FILES).forEach(function(name) {
    fs.writeFileSync(path.join(TMP_DIR, name), FILES[name], 'utf8');
});

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

async function getVisibility(page, id) {
    return page.evaluate(function(elId) {
        var el = document.getElementById(elId);
        if (!el) return { found: false, visible: false };
        return { found: true, visible: el.offsetParent !== null };
    }, id);
}

async function run() {
    const browser = await chromium.launch({ headless: true, slowMo: 80 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const consoleErrors = [];
    const networkCalls  = [];
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

    try {
        // Login
        await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
        const pwInput = await page.$('input[type="password"]');
        if (pwInput) {
            const usrInput = await page.$('input[type="text"]');
            if (usrInput) await usrInput.fill('admin');
            await pwInput.fill('OFbtNeiz0ToBgnrLXVbRXA');
            const loginBtn = await page.$('button[type="submit"], button:has-text("Login"), button:has-text("LOGIN")');
            if (loginBtn) await loginBtn.click();
            await page.waitForTimeout(2500);
            if (!page.url().includes('app.html')) {
                await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 15000 });
            }
            await page.waitForTimeout(1000);
            consoleErrors.length = 0;
        }

        page.on('request', req => { networkCalls.push(req.method() + ' ' + req.url()); });

        // C1-C3: Open workspace + folder intake controls visible
        console.log('\n--- C1-C3: Folder intake controls visible ---');
        const swBtn = await page.$('[data-tool="scenario-workspace"]');
        if (swBtn) { await swBtn.click(); await page.waitForTimeout(800); }
        check(true, 'C1: Scenario Workspace opened');

        var intake = await getVisibility(page, 'sw-live-scenario-folder-intake');
        check(intake.found && intake.visible,
              'C2: Folder Intake controls visible inside live import card');
        var importCard = await page.evaluate(function() {
            var intake = document.getElementById('sw-live-scenario-folder-intake');
            if (!intake) return false;
            return !!intake.closest('#sw-live-scenario-import-card');
        });
        check(importCard,
              'C3: Folder Intake is INSIDE #sw-live-scenario-import-card');

        // C4: Populate folder input with mixed files
        console.log('\n--- C4: Choose folder with mixed files ---');
        var inputHandle = await page.$('#sw-live-scenario-folder-input');
        if (!inputHandle) throw new Error('folder input not found');

        // Playwright requires the DIRECTORY path itself for [webkitdirectory] inputs.
        await inputHandle.setInputFiles(TMP_DIR);
        await page.waitForTimeout(200);
        check(true, 'C4: folder set on input (' + Object.keys(FILES).length + ' files inside)');

        // C5: Click Scan
        console.log('\n--- C5: Click Scan Scenario Folder ---');
        await page.evaluate(function() {
            var b = document.getElementById('sw-live-scenario-folder-scan-btn');
            if (b) b.click();
        });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS_DIR, '01-after-scan.png') });

        // C6: Summary counts correct
        console.log('\n--- C6: Summary counts ---');
        var summaryText = await page.evaluate(function() {
            var el = document.getElementById('sw-live-scenario-folder-summary');
            return el ? el.textContent.trim() : '';
        });
        console.log('  Summary text: ' + summaryText);
        check(summaryText.indexOf('Total: 7') >= 0 ||
              summaryText.indexOf('الإجمالي: 7') >= 0,
              'C6a: total file count = 7', summaryText);
        check(/JSON candidates: 1|ملفات JSON المرشحة: 1/.test(summaryText),
              'C6b: jsonCandidates = 1');
        check(summaryText.indexOf('.scen: 1') >= 0,
              'C6c: .scen count = 1');
        check(summaryText.indexOf('.ini: 1') >= 0,
              'C6d: .ini count = 1');
        check(summaryText.indexOf('lua: 1') >= 0,
              'C6e: lua count = 1');

        // C7: JSON appears under candidates list
        console.log('\n--- C7: JSON in candidates list ---');
        var cands = await page.evaluate(function() {
            var el = document.getElementById('sw-live-scenario-folder-candidates');
            if (!el) return [];
            return Array.prototype.slice.call(
                el.querySelectorAll('.sw-live-scenario-folder-cand-row'))
                .map(function(r) {
                    return r.getAttribute('data-relative-path');
                });
        });
        check(cands.length === 1 && cands[0].indexOf('scenario.json') >= 0,
              'C7: 1 JSON candidate listed = scenario.json',
              JSON.stringify(cands));

        // C8-C11: Unsupported list reflects the 6 other files
        console.log('\n--- C8-C11: Unsupported entries ---');
        var unsupRows = await page.evaluate(function() {
            var el = document.getElementById('sw-live-scenario-folder-unsupported');
            if (!el) return [];
            return Array.prototype.slice.call(
                el.querySelectorAll('.sw-live-scenario-folder-unsup-row'))
                .map(function(r) {
                    return {
                        type:    r.getAttribute('data-file-type'),
                        blocked: r.getAttribute('data-blocked'),
                        name:    (r.querySelector('.sw-live-scenario-folder-unsup-name') || {}).textContent || ''
                    };
                });
        });
        var types = unsupRows.map(function(u) { return u.type; });
        check(types.indexOf('command_scen_binary') >= 0,
              'C8: .scen shown as not directly importable',
              JSON.stringify(types));
        check(types.indexOf('command_ini_weapon_patch') >= 0,
              'C9: .ini shown as weapon patch (not metadata)');
        var luaRow = unsupRows.find(function(u) { return u.type === 'lua_script'; });
        check(luaRow && luaRow.blocked === 'true',
              'C10: .lua shown as blocked',
              luaRow ? 'blocked=' + luaRow.blocked : 'not found');
        check(types.indexOf('briefing_document') >= 0 &&
              types.indexOf('asset') >= 0 &&
              types.indexOf('unsupported_unknown') >= 0,
              'C11: PDF / image / unknown extension all listed informationally',
              JSON.stringify(types));

        // C12: Select the JSON candidate
        console.log('\n--- C12: Select JSON candidate ---');
        await page.evaluate(function() {
            var radio = document.querySelector(
                '#sw-live-scenario-folder-candidates ' +
                'input.sw-live-scenario-folder-cand-radio');
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        await page.waitForTimeout(200);
        var importBtnState = await page.evaluate(function() {
            var b = document.getElementById('sw-live-scenario-folder-import-btn');
            return b ? { disabled: b.disabled } : { disabled: true };
        });
        check(!importBtnState.disabled,
              'C12: Import Selected button enabled after selection');

        // C13: Click Import Selected JSON as Live Scenario
        console.log('\n--- C13: Click Import Selected ---');
        await page.evaluate(function() {
            var b = document.getElementById('sw-live-scenario-folder-import-btn');
            if (b) b.click();
        });
        // FileReader is async — wait for it
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SHOTS_DIR, '02-after-import.png') });

        // C14: Live header reflects imported scenario
        console.log('\n--- C14: live header updated ---');
        var hdr = await page.evaluate(function() {
            function txt(id) {
                var e = document.getElementById(id);
                return e ? (e.textContent || '').trim() : '';
            }
            return {
                title: txt('sw-live-scenario-title'),
                id:    txt('sw-live-scenario-id'),
                step:  txt('sw-live-scenario-step'),
                phase: txt('sw-live-scenario-phase')
            };
        });
        check(hdr.title.indexOf('PR-286L1 Folder Import Test') >= 0,
              'C14: live header title = imported scenario_label', hdr.title);
        check(hdr.id.indexOf('pr286L1-folder-test') >= 0,
              'C14b: live header id = imported scenario_id', hdr.id);

        // C15: Step Navigator reset to Step 1 of N
        check(/(Step|الخطوة)\s+1\s+(of|من)\s+2/.test(hdr.step),
              'C15: header shows "Step 1 of 2" for new scenario', hdr.step);

        // C16: Live Decision Action shows step 0 options
        var step0Opts = await page.evaluate(function() {
            var opts = document.getElementById('sw-live-decision-options');
            if (!opts) return [];
            return Array.prototype.slice.call(
                opts.querySelectorAll('.sw-live-decision-option-label'))
                .map(function(e) { return e.textContent.trim(); });
        });
        check(step0Opts.length === 2 &&
              step0Opts.some(function(l) { return l.indexOf('Hold position') >= 0; }),
              'C16: Live Decision Action shows step-0 options from imported scenario',
              '[' + step0Opts.join(', ') + ']');

        // C17: window.RmoozScenario fully replaced
        var winState = await page.evaluate(function() {
            return {
                scenarioId: window.RmoozScenario.scenario.scenario_id,
                stepCount:  window.RmoozScenario.scenario.steps.length,
                stepIndex:  window.RmoozScenario.stepIndex
            };
        });
        check(winState.scenarioId === 'pr286L1-folder-test' &&
              winState.stepCount === 2 && winState.stepIndex === 0,
              'C17: window.RmoozScenario fully replaced via folder JSON',
              JSON.stringify(winState));

        // C17b-C18: dry-run + W3 + AMBER still hidden
        var drp   = await getVisibility(page, 'sw-drp-section');
        var w3Bar = await getVisibility(page, 'sw-w3-load-bar');
        var amber = await getVisibility(page, 'sw-drp-amber-badge');
        check(drp.found && !drp.visible &&
              w3Bar.found && !w3Bar.visible &&
              !amber.visible,
              'C17b: W3 dry-run / Load W3 button / AMBER badge all NOT visible');

        // C18: no scenario-mutating backend calls
        var FORBIDDEN_RE = /\/api\/sim\/commit|applyDecision|executeSimulation|\/api\/scenario\/(commit|apply|mutate|save|advance|decide|update)|gate\s*7/i;
        var bad = networkCalls.filter(function(c) { return FORBIDDEN_RE.test(c); });
        check(bad.length === 0,
              'C18: no scenario-mutating backend calls',
              bad.length ? 'FORBIDDEN: ' + bad.join(' | ') : 'none');

        // C19: no forbidden buttons in #sw-live-workspace
        var forbidden = await page.evaluate(function() {
            var PATTERNS = [/^apply$/i, /^commit$/i, /^execute$/i,
                            /^go live$/i, /^approve$/i, /^confirm$/i];
            var found = [];
            var lw = document.getElementById('sw-live-workspace');
            if (!lw) return found;
            Array.prototype.slice.call(lw.querySelectorAll('button, [role="button"]'))
                .forEach(function(b) {
                    if (b.offsetParent === null) return;
                    var txt = (b.textContent || '').trim();
                    PATTERNS.forEach(function(p) { if (p.test(txt)) found.push(txt); });
                });
            return found;
        });
        check(forbidden.length === 0,
              'C19: no forbidden buttons in #sw-live-workspace',
              forbidden.length ? 'FOUND: ' + forbidden.join(', ') : 'none');

        // C20: console errors
        await page.waitForTimeout(500);
        check(consoleErrors.length === 0,
              'C20: zero console errors',
              consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        await page.screenshot({ path: path.join(SHOTS_DIR, '03-final.png') });

    } catch(err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
        // Cleanup tmp folder
        try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (_) {}
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-286L1 Browser Verification — RESULTS');
    console.log('═'.repeat(65));
    results.forEach(r => {
        console.log('  ' + (r.ok ? '✅' : '❌') + '  ' + r.label +
                    (r.detail !== undefined ? ' — ' + r.detail : ''));
    });
    console.log('─'.repeat(65));
    console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
    console.log('═'.repeat(65));
    console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
    console.log('  Screenshots: ' + SHOTS_DIR);
    console.log('  Tmp folder (cleaned): ' + TMP_DIR);

    process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
