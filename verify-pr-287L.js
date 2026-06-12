/**
 * verify-pr-287L.js — Browser verification for PR-287L Live Step Status Baseline.
 *
 * Feature: per-step live status (pending / decided / skipped / blocked) stored
 * in-memory in _liveOperatorWorkflowState.stepStatus, keyed by scenarioId::step-N.
 * UI lives INSIDE #sw-live-decision-card (status row), plus a nav badge and a
 * header status chip. Status is operator-set, read-only, never committed/applied.
 *
 * Checklist:
 *  C1.  Open Scenario Workspace.
 *  C2.  #sw-live-step-status-row exists INSIDE #sw-live-decision-card (not a new page/card).
 *  C3.  Status badge defaults to "pending" before any scenario is loaded.
 *  C4.  Three Mark buttons (decided/skipped/blocked) + Clear button present.
 *  C5.  Inject scenario → click "Mark Decided" → card badge reads decided.
 *  C6.  Nav status badge (#sw-nav-status-badge) reflects decided.
 *  C7.  Header status chip (#sw-live-scenario-status) reflects decided.
 *  C8.  Summary rollup shows "Decided 1".
 *  C9.  Click "Mark Skipped" → badge skipped; summary Skipped 1 / Decided 0.
 * C10.  Click "Mark Blocked" → badge blocked.
 * C11.  Click "Clear Status" → badge pending; nothing stored (summary all pending).
 * C12.  Per-step scoping: set step 0 decided, Next → step 1 pending, Prev → step 0 still decided.
 * C13.  Marking status does NOT advance the step (stepIndex unchanged by Mark click).
 * C14.  getLiveScenarioStatusSummary() API returns correct counts.
 * C15.  Stored record is read-only / in-memory (readOnly:true, committed:false, applied:false).
 * C16.  Step navigation still works (Next/Prev change header counter).
 * C17.  No scenario-mutating backend calls.
 * C18.  No forbidden Apply/Commit/Execute/Go-Live/Approve buttons in the status row.
 * C19.  No live unit/map mutation triggered by setting status.
 * C20.  Zero console errors.
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-287L-verify';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const TEST_SCENARIO = {
    scenario_id:    'pr287L-test-live',
    scenario_label: 'PR-287L Test Live Scenario',
    model_version:  'pr287L-v1',
    steps: [
        {
            index: 0, phase: 'briefing', time_label: 'PHASE-0', title: 'Opening move',
            decision_options: [
                { id: 'OPT-HOLD-0', label: 'Hold at step 0', summary: 'Step-0 action' },
                { id: 'OPT-ADV-0',  label: 'Advance at step 0', summary: 'Step-0 advance' }
            ]
        },
        {
            index: 1, phase: 'planning', time_label: 'PHASE-1', title: 'Develop plan',
            decision_options: [
                { id: 'OPT-A-1', label: 'Alpha at step 1', summary: 'Step-1 alpha' },
                { id: 'OPT-B-1', label: 'Beta at step 1',  summary: 'Step-1 beta' }
            ]
        },
        { index: 2, phase: 'execution', time_label: 'PHASE-2', title: 'Execute' }
    ]
};

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok: !!ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

// Click a status button by its data attribute / id inside the live decision card.
async function clickStatus(page, statusValOrClear) {
    await page.evaluate(function(val) {
        var card = document.getElementById('sw-live-decision-card');
        if (!card) return;
        var btn;
        if (val === 'clear') {
            btn = document.getElementById('sw-live-step-status-clear-btn');
        } else {
            btn = card.querySelector('[data-live-step-status="' + val + '"]');
        }
        if (btn) btn.click();
    }, statusValOrClear);
    await page.waitForTimeout(250);
}

async function readBadges(page) {
    return page.evaluate(function() {
        function info(id) {
            var e = document.getElementById(id);
            if (!e) return { found: false };
            return {
                found:  true,
                text:   (e.textContent || '').trim(),
                status: e.getAttribute('data-status')
            };
        }
        var sumEl = document.getElementById('sw-live-step-status-summary');
        return {
            cardBadge: info('sw-live-step-status-badge'),
            navBadge:  info('sw-nav-status-badge'),
            hdrChip:   info('sw-live-scenario-status'),
            summary:   sumEl ? (sumEl.textContent || '').trim() : null,
            stepIdx:   window.RmoozScenario && window.RmoozScenario.stepIndex
        };
    });
}

async function run() {
    const browser = await chromium.launch({ headless: true, slowMo: 60 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const consoleErrors = [];
    const networkCalls  = [];
    const page = await context.newPage();
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

    try {
        // ---- Login ----
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

        // ---- C1: Open Scenario Workspace ----
        console.log('\n--- C1: Open Scenario Workspace ---');
        const swBtn = await page.$('[data-tool="scenario-workspace"]');
        if (swBtn) { await swBtn.click(); await page.waitForTimeout(800); }
        await page.screenshot({ path: path.join(SHOTS_DIR, '01-workspace-open.png') });
        const wsOpen = await page.evaluate(function() {
            var p = document.getElementById('scenario-workspace-panel');
            return p ? p.offsetParent !== null : false;
        });
        check(wsOpen, 'C1: Scenario Workspace panel visible');

        // ---- C2: status row nested INSIDE the live decision card ----
        console.log('\n--- C2: status row inside #sw-live-decision-card ---');
        const nest = await page.evaluate(function() {
            var row  = document.getElementById('sw-live-step-status-row');
            var card = document.getElementById('sw-live-decision-card');
            if (!row || !card) return { found: false };
            return {
                found:    true,
                inCard:   !!row.closest('#sw-live-decision-card'),
                rowVisible: row.offsetParent !== null
            };
        });
        check(nest.found && nest.inCard,
              'C2: #sw-live-step-status-row is nested inside #sw-live-decision-card (not a new page)',
              'inCard:' + nest.inCard);

        // ---- C3: default pending before any scenario ----
        console.log('\n--- C3: default pending state ---');
        const pre = await readBadges(page);
        check(pre.cardBadge.found && pre.cardBadge.status === 'pending',
              'C3: status badge defaults to data-status="pending"',
              'status=' + pre.cardBadge.status + ' text="' + pre.cardBadge.text + '"');

        // ---- C4: the four buttons exist ----
        console.log('\n--- C4: Mark + Clear buttons ---');
        const btns = await page.evaluate(function() {
            var card = document.getElementById('sw-live-decision-card');
            if (!card) return { decided:false, skipped:false, blocked:false, clear:false };
            return {
                decided: !!card.querySelector('[data-live-step-status="decided"]'),
                skipped: !!card.querySelector('[data-live-step-status="skipped"]'),
                blocked: !!card.querySelector('[data-live-step-status="blocked"]'),
                clear:   !!document.getElementById('sw-live-step-status-clear-btn')
            };
        });
        check(btns.decided && btns.skipped && btns.blocked && btns.clear,
              'C4: Mark Decided/Skipped/Blocked + Clear Status buttons present',
              JSON.stringify(btns));

        // ---- Inject test scenario ----
        await page.evaluate(function(testScn) {
            window.RmoozScenario = { scenario: testScn, stepIndex: 0 };
            if (window.AppShellScenarioWorkspace) {
                window.AppShellScenarioWorkspace.refresh();
            }
        }, TEST_SCENARIO);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(SHOTS_DIR, '02-scenario-injected.png') });

        // ---- C5-C8: Mark Decided ----
        console.log('\n--- C5-C8: Mark Decided ---');
        await clickStatus(page, 'decided');
        const dec = await readBadges(page);
        await page.screenshot({ path: path.join(SHOTS_DIR, '03-mark-decided.png') });
        check(dec.cardBadge.status === 'decided',
              'C5: card badge reads decided', 'status=' + dec.cardBadge.status);
        check(dec.navBadge.found && dec.navBadge.status === 'decided',
              'C6: nav status badge reflects decided', 'status=' + dec.navBadge.status);
        check(dec.hdrChip.found && dec.hdrChip.status === 'decided',
              'C7: header status chip reflects decided', 'status=' + dec.hdrChip.status);
        check(dec.summary && /(Decided|محسوم|تقرر|تم)\D*1/.test(dec.summary),
              'C8: summary rollup shows Decided 1', 'summary="' + dec.summary + '"');

        // ---- C13: marking did NOT advance the step ----
        check(dec.stepIdx === 0,
              'C13: marking decided did not advance the step (stepIndex still 0)',
              'stepIndex=' + dec.stepIdx);

        // ---- C9: Mark Skipped ----
        console.log('\n--- C9: Mark Skipped ---');
        await clickStatus(page, 'skipped');
        const skp = await readBadges(page);
        check(skp.cardBadge.status === 'skipped',
              'C9: card badge reads skipped after Mark Skipped',
              'status=' + skp.cardBadge.status + ' summary="' + skp.summary + '"');
        check(skp.summary && /(Skipped|تخطّ|تخطي|متجاوز)\D*1/.test(skp.summary) &&
              /(Decided|محسوم|تقرر|تم)\D*0/.test(skp.summary),
              'C9b: summary shows Skipped 1 / Decided 0 (status replaced, not added)',
              'summary="' + skp.summary + '"');

        // ---- C10: Mark Blocked ----
        console.log('\n--- C10: Mark Blocked ---');
        await clickStatus(page, 'blocked');
        const blk = await readBadges(page);
        await page.screenshot({ path: path.join(SHOTS_DIR, '04-mark-blocked.png') });
        check(blk.cardBadge.status === 'blocked',
              'C10: card badge reads blocked after Mark Blocked',
              'status=' + blk.cardBadge.status);

        // ---- C15: stored record is read-only / in-memory ----
        console.log('\n--- C15: stored record shape ---');
        const rec = await page.evaluate(function() {
            if (!window.AppShellScenarioWorkspace) return null;
            return window.AppShellScenarioWorkspace.getLiveStepStatus(0);
        });
        check(rec && rec.status === 'blocked' && rec.readOnly === true &&
              rec.committed === false && rec.applied === false &&
              rec.backendCommitAllowed === false,
              'C15: getLiveStepStatus(0) record is read-only / not committed / not applied',
              rec ? ('status=' + rec.status + ' readOnly=' + rec.readOnly +
                     ' committed=' + rec.committed + ' applied=' + rec.applied) : 'null');

        // ---- C11: Clear Status ----
        console.log('\n--- C11: Clear Status ---');
        await clickStatus(page, 'clear');
        const clr = await readBadges(page);
        const clrRec = await page.evaluate(function() {
            return window.AppShellScenarioWorkspace.getLiveStepStatus(0);
        });
        check(clr.cardBadge.status === 'pending',
              'C11: card badge reverts to pending after Clear', 'status=' + clr.cardBadge.status);
        check(clrRec && clrRec.status === 'pending' && clrRec.stored === false,
              'C11b: cleared step has no stored record (default pending, stored:false)',
              clrRec ? ('status=' + clrRec.status + ' stored=' + clrRec.stored) : 'null');

        // ---- C12: per-step scoping ----
        console.log('\n--- C12: per-step scoping ---');
        // mark step 0 decided again
        await clickStatus(page, 'decided');
        // navigate to step 1
        await page.evaluate(function() {
            var btn = document.getElementById('sw-nav-next');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        const onStep1 = await readBadges(page);
        check(onStep1.stepIdx === 1 && onStep1.cardBadge.status === 'pending',
              'C12: step 1 shows its own status (pending) — independent of step 0',
              'idx=' + onStep1.stepIdx + ' status=' + onStep1.cardBadge.status);
        // navigate back to step 0
        await page.evaluate(function() {
            var btn = document.getElementById('sw-nav-prev');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        const backStep0 = await readBadges(page);
        check(backStep0.stepIdx === 0 && backStep0.cardBadge.status === 'decided',
              'C12b: returning to step 0 retains its decided status',
              'idx=' + backStep0.stepIdx + ' status=' + backStep0.cardBadge.status);

        // ---- C14: summary API counts ----
        console.log('\n--- C14: getLiveScenarioStatusSummary() ---');
        const summary = await page.evaluate(function() {
            return window.AppShellScenarioWorkspace.getLiveScenarioStatusSummary();
        });
        check(summary && summary.totalSteps === 3 && summary.counts &&
              summary.counts.decided === 1 && summary.counts.pending === 2,
              'C14: summary API counts: total 3, decided 1, pending 2',
              summary ? JSON.stringify(summary.counts) + ' total=' + summary.totalSteps : 'null');

        // ---- C16: step navigation still works ----
        console.log('\n--- C16: step navigation ---');
        const navBefore = await page.evaluate(function() {
            return document.getElementById('sw-live-scenario-step').textContent.trim();
        });
        await page.evaluate(function() {
            var btn = document.getElementById('sw-nav-next');
            if (btn) btn.click();
        });
        await page.waitForTimeout(300);
        const navAfter = await page.evaluate(function() {
            return {
                step: document.getElementById('sw-live-scenario-step').textContent.trim(),
                idx:  window.RmoozScenario.stepIndex
            };
        });
        check(/(Step|الخطوة)\s+2\s+(of|من)\s+3/.test(navAfter.step) && navAfter.idx === 1,
              'C16: Next advances header counter to "Step 2 of 3"',
              'before:"' + navBefore + '" after:"' + navAfter.step + '" idx:' + navAfter.idx);

        // ---- C17: no scenario-mutating backend calls ----
        console.log('\n--- C17-C20: boundaries ---');
        const FORBIDDEN_RE = /\/api\/sim\/commit|applyDecision|executeSimulation|\/api\/scenario\/(commit|apply|mutate|save|advance|decide|update)|gate\s*7/i;
        const badCalls = networkCalls.filter(c => FORBIDDEN_RE.test(c));
        check(badCalls.length === 0,
              'C17: no scenario-mutating backend calls',
              badCalls.length ? 'FORBIDDEN: ' + badCalls.join(' | ') : 'none');

        // ---- C18: no forbidden buttons in the status row ----
        const forbiddenBtns = await page.evaluate(function() {
            var PATTERNS = [/^apply$/i, /^commit$/i, /^execute$/i, /^go live$/i,
                            /^approve$/i, /^confirm$/i, /^run$/i];
            var found = [];
            var row = document.getElementById('sw-live-step-status-row');
            if (!row) return found;
            Array.prototype.slice.call(row.querySelectorAll('button, [role="button"]'))
                .forEach(function(b) {
                    var txt = (b.textContent || '').trim();
                    PATTERNS.forEach(function(p) { if (p.test(txt)) found.push(txt); });
                });
            return found;
        });
        check(forbiddenBtns.length === 0,
              'C18: no Apply/Commit/Execute/Go-Live/Approve buttons in the status row',
              forbiddenBtns.length ? 'FOUND: ' + forbiddenBtns.join(', ') : 'none');

        // ---- C19: no live unit/map mutation triggered by status set ----
        const mapTouched = networkCalls.filter(c =>
            /\/api\/(units|map|overlay)\/(write|mutate|update|save|commit)/i.test(c));
        check(mapTouched.length === 0,
              'C19: setting status triggered no unit/map mutation calls',
              mapTouched.length ? mapTouched.join(' | ') : 'none');

        // ---- C20: console errors ----
        await page.waitForTimeout(400);
        check(consoleErrors.length === 0,
              'C20: zero console errors',
              consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        await page.screenshot({ path: path.join(SHOTS_DIR, '05-final.png') });

    } catch(err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-287L Browser Verification — RESULTS');
    console.log('═'.repeat(65));
    console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
    console.log('═'.repeat(65));
    console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
    console.log('  Screenshots: ' + SHOTS_DIR);

    process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
