/**
 * verify-pr-288L.js — Browser verification for PR-288L Live Operator Event Log.
 *
 * Feature: a tabular operator-action ledger rendered INSIDE the Scenario
 * Workspace (#sw-live-event-log-card, nested in #sw-live-workspace, below the
 * live decision card). Operator actions (decision select/clear, step-status
 * set/clear) append in-memory events to _liveOperatorWorkflowState.events; the
 * ledger surfaces them newest-first with 5 columns
 * (DTG / Severity / Category / Source / Message). Read-only, in-memory, capped
 * at 64. Per MEMORY constraint it must be a TABULAR ledger — no avatars /
 * bubbles / speaker lanes — and must NOT touch the global #event-log.
 *
 * Checklist:
 *  C1.  Open Scenario Workspace (panel visible).
 *  C2.  #sw-live-event-log-card exists and is nested inside #sw-live-workspace.
 *  C3.  Card is placed AFTER #sw-live-decision-card (operator acts, ledger records below).
 *  C4.  Real <table> with <thead> (5 columns) + <tbody id=sw-live-event-log-rows> — tabular.
 *  C5.  NOT chat: no avatar / bubble / speaker-lane elements inside the card.
 *  C6.  Empty by default: empty note shown, Clear-log hidden, count "0 of 64", 0 rows.
 *  --- inject scenario (step 0 has decision_options) ---
 *  C7.  Click "Mark Decided" → 1 row; newest = category step-status, severity info, msg names step 1 + Decided.
 *  C8.  Click a decision option → new TOP row = category decision, severity info, msg names option + step 1.
 *  C9.  Rows are newest-first (decision row above the earlier status row).
 *  C10. Click "Mark Blocked" → top row data-severity="warning".
 *  C11. Click "Mark Skipped" → top row data-severity="notice".
 *  C12. Every rendered row has exactly 5 cells.
 *  C13. Source column reads "Operator".
 *  C14. Count line reads "N of 64 operator events (in memory)".
 *  C15. DTG cell is a formatted timestamp (YYYY-MM-DD HH:MM:SSZ).
 *  C16. Global #event-log ops ledger still present + untouched (separate ledger).
 *  C17. getLiveOperatorEventLog() API: cap 64 + deep-copy isolation (mutation does not leak).
 *  C18. Events persist across a scenario LOAD (audit trail) while step-status resets.
 *  C19. Clear-log button empties the ledger (0 rows, empty shown, Clear hidden, count 0).
 *  C20. Clearing the log leaves step status intact (clear is scoped to events only).
 *  C21. Step navigation still works (Next advances the header counter).
 *  C22. No scenario-mutating backend / unit / map calls.
 *  C23. Zero console errors.
 */

'use strict';

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const APP_URL   = 'http://localhost:8000/app.html';
const SHOTS_DIR = '/Users/engcode/Desktop/Map_2/docs/pr-288L-verify';

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

function mkScenario(id) {
    return {
        scenario_id:    id,
        scenario_label: id + ' label',
        model_version:  'pr288L-v1',
        steps: [
            {
                index: 0, phase: 'briefing', time_label: 'PHASE-0', title: 'Opening move',
                decision_options: [
                    { id: 'OPT-HOLD-0', label: 'Hold at step 0', summary: 'Step-0 hold' },
                    { id: 'OPT-ADV-0',  label: 'Advance at step 0', summary: 'Step-0 advance' }
                ]
            },
            { index: 1, phase: 'planning',  time_label: 'PHASE-1', title: 'Develop plan' },
            { index: 2, phase: 'execution', time_label: 'PHASE-2', title: 'Execute' }
        ]
    };
}
const TEST_SCENARIO   = mkScenario('pr288L-test-live');
const TEST_SCENARIO_2 = mkScenario('pr288L-second-load');

let passed = 0, failed = 0;
const results = [];
function check(ok, label, detail) {
    results.push({ ok: !!ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

async function clickStatus(page, statusVal) {
    await page.evaluate(function(val) {
        var card = document.getElementById('sw-live-decision-card');
        if (!card) return;
        var btn = card.querySelector('[data-live-step-status="' + val + '"]');
        if (btn) btn.click();
    }, statusVal);
    await page.waitForTimeout(220);
}

async function clickFirstOption(page) {
    return page.evaluate(function() {
        var card = document.getElementById('sw-live-decision-card');
        if (!card) return null;
        var btn = card.querySelector('[data-live-option-id]');
        if (!btn) return null;
        var oid = btn.getAttribute('data-live-option-id');
        btn.click();
        return oid;
    });
}

async function clickClearLog(page) {
    await page.evaluate(function() {
        var btn = document.getElementById('sw-live-event-log-clear-btn');
        if (btn) btn.click();
    });
    await page.waitForTimeout(220);
}

// Read the PAINTED ledger DOM (not the API) — this is the user-facing surface.
async function readLedger(page) {
    return page.evaluate(function() {
        var rowsEl  = document.getElementById('sw-live-event-log-rows');
        var emptyEl = document.getElementById('sw-live-event-log-empty');
        var clearEl = document.getElementById('sw-live-event-log-clear-btn');
        var countEl = document.getElementById('sw-live-event-log-count');
        var trs = rowsEl ? Array.prototype.slice.call(rowsEl.querySelectorAll('tr')) : [];
        var rows = trs.map(function(tr) {
            var tds = Array.prototype.slice.call(tr.querySelectorAll('td'));
            return {
                severity:  tr.getAttribute('data-severity'),
                category:  tr.getAttribute('data-category'),
                cellCount: tds.length,
                dtg:      tds[0] ? (tds[0].textContent || '').trim() : null,
                sevLabel: tds[1] ? (tds[1].textContent || '').trim() : null,
                catLabel: tds[2] ? (tds[2].textContent || '').trim() : null,
                source:   tds[3] ? (tds[3].textContent || '').trim() : null,
                message:  tds[4] ? (tds[4].textContent || '').trim() : null
            };
        });
        return {
            rowCount:     rows.length,
            rows:         rows,
            emptyVisible: emptyEl ? !emptyEl.hasAttribute('hidden') : null,
            clearVisible: clearEl ? !clearEl.hasAttribute('hidden') : null,
            countText:    countEl ? (countEl.textContent || '').trim() : null
        };
    });
}

async function run() {
    const browser = await chromium.launch({ headless: true, slowMo: 50 });
    const context = await browser.newContext({ viewport: { width: 1400, height: 980 } });
    const consoleErrors = [];
    const networkCalls  = [];
    const page = await context.newPage();
    page.on('console',  msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
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

        // Record network only after login so we judge feature-driven traffic.
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

        // ---- C2 / C3: card exists, nested, placed after the decision card ----
        console.log('\n--- C2/C3: card existence + placement ---');
        const place = await page.evaluate(function() {
            var card = document.getElementById('sw-live-event-log-card');
            var ws   = document.getElementById('sw-live-workspace');
            var dec  = document.getElementById('sw-live-decision-card');
            if (!card) return { found: false };
            var afterDecision = false;
            if (dec && card.compareDocumentPosition) {
                afterDecision = !!(dec.compareDocumentPosition(card) &
                                   Node.DOCUMENT_POSITION_FOLLOWING);
            }
            return {
                found:      true,
                inWorkspace: !!(ws && ws.contains(card)),
                afterDecision: afterDecision
            };
        });
        check(place.found && place.inWorkspace,
              'C2: #sw-live-event-log-card nested inside #sw-live-workspace (not a new page)',
              'inWorkspace=' + place.inWorkspace);
        check(place.afterDecision,
              'C3: event-log card placed AFTER #sw-live-decision-card', 'after=' + place.afterDecision);

        // ---- C4: real table with thead (5 cols) + tbody ----
        console.log('\n--- C4: tabular structure ---');
        const tableShape = await page.evaluate(function() {
            var card  = document.getElementById('sw-live-event-log-card');
            var table = document.getElementById('sw-live-event-log-table');
            var rows  = document.getElementById('sw-live-event-log-rows');
            if (!card || !table) return { ok: false };
            var ths = table.querySelectorAll('thead th');
            return {
                ok: true,
                isTable: table.tagName === 'TABLE',
                headCols: ths.length,
                hasTbody: !!rows && rows.tagName === 'TBODY'
            };
        });
        check(tableShape.ok && tableShape.isTable && tableShape.headCols === 5 && tableShape.hasTbody,
              'C4: real <table> with 5-column <thead> + <tbody> ledger',
              'isTable=' + tableShape.isTable + ' cols=' + tableShape.headCols + ' tbody=' + tableShape.hasTbody);

        // ---- C5: NOT chat ----
        console.log('\n--- C5: tabular, not chat ---');
        const chatish = await page.evaluate(function() {
            var card = document.getElementById('sw-live-event-log-card');
            if (!card) return { found: 0 };
            var sel = '[class*="avatar"],[class*="bubble"],[class*="speaker"],' +
                      '[class*="chat-msg"],[class*="message-bubble"],img.avatar';
            return { found: card.querySelectorAll(sel).length };
        });
        check(chatish.found === 0,
              'C5: no avatar / bubble / speaker-lane elements inside the card (tabular, per MEMORY)',
              'chat-ish els=' + chatish.found);

        // ---- C6: empty by default ----
        console.log('\n--- C6: empty default state ---');
        let L = await readLedger(page);
        await page.screenshot({ path: path.join(SHOTS_DIR, '02-empty-ledger.png') });
        check(L.rowCount === 0 && L.emptyVisible === true && L.clearVisible === false &&
              /\b0\s+of\s+64\b/.test(L.countText || ''),
              'C6: empty state — note shown, Clear hidden, count "0 of 64", 0 rows',
              'rows=' + L.rowCount + ' empty=' + L.emptyVisible + ' clear=' + L.clearVisible +
              ' count="' + L.countText + '"');

        // ---- Inject scenario ----
        await page.evaluate(function(scn) {
            window.RmoozScenario = { scenario: scn, stepIndex: 0 };
            if (window.AppShellScenarioWorkspace) window.AppShellScenarioWorkspace.refresh();
        }, TEST_SCENARIO);
        await page.waitForTimeout(350);

        // ---- C7: Mark Decided ----
        console.log('\n--- C7: Mark Decided appends a step-status event ---');
        await clickStatus(page, 'decided');
        L = await readLedger(page);
        const stepIdxAfterStatus = await page.evaluate(function() {
            return window.RmoozScenario && window.RmoozScenario.stepIndex;
        });
        await page.screenshot({ path: path.join(SHOTS_DIR, '03-after-decided.png') });
        check(L.rowCount === 1 && L.rows[0].category === 'step-status' &&
              L.rows[0].severity === 'info' && /\b1\b/.test(L.rows[0].message || '') &&
              /(Decided|محسوم|تقرر|تم)/.test(L.rows[0].message || ''),
              'C7: Mark Decided → 1 row (step-status / info / names step 1 + Decided)',
              'rows=' + L.rowCount + ' cat=' + (L.rows[0] && L.rows[0].category) +
              ' sev=' + (L.rows[0] && L.rows[0].severity) + ' msg="' + (L.rows[0] && L.rows[0].message) + '"');
        check(stepIdxAfterStatus === 0,
              'C7b: marking status did NOT advance the step (stepIndex still 0)',
              'stepIndex=' + stepIdxAfterStatus);

        // ---- C8: decision option select ----
        console.log('\n--- C8/C9: decision option appends a decision event (newest-first) ---');
        const oid = await clickFirstOption(page);
        await page.waitForTimeout(220);
        L = await readLedger(page);
        await page.screenshot({ path: path.join(SHOTS_DIR, '04-after-option.png') });
        check(L.rowCount === 2 && L.rows[0].category === 'decision' &&
              L.rows[0].severity === 'info' && (oid ? (L.rows[0].message || '').indexOf(oid) !== -1 : true),
              'C8: decision option → new TOP row (decision / info / names option)',
              'rows=' + L.rowCount + ' topCat=' + (L.rows[0] && L.rows[0].category) +
              ' oid=' + oid + ' msg="' + (L.rows[0] && L.rows[0].message) + '"');
        check(L.rows[0].category === 'decision' && L.rows[1].category === 'step-status',
              'C9: rows are newest-first (decision above the earlier status row)',
              'order=[' + L.rows.map(function(r){return r.category;}).join(', ') + ']');

        // ---- C10: Mark Blocked → warning ----
        console.log('\n--- C10: Mark Blocked → severity warning ---');
        await clickStatus(page, 'blocked');
        L = await readLedger(page);
        check(L.rows[0].severity === 'warning' && L.rows[0].category === 'step-status',
              'C10: Mark Blocked → top row data-severity="warning"',
              'topSev=' + L.rows[0].severity);

        // ---- C11: Mark Skipped → notice ----
        console.log('\n--- C11: Mark Skipped → severity notice ---');
        await clickStatus(page, 'skipped');
        L = await readLedger(page);
        await page.screenshot({ path: path.join(SHOTS_DIR, '05-severity-rows.png') });
        check(L.rows[0].severity === 'notice',
              'C11: Mark Skipped → top row data-severity="notice"', 'topSev=' + L.rows[0].severity);

        // ---- C12: every row has 5 cells ----
        console.log('\n--- C12/C13/C14/C15: cells, source, count, DTG ---');
        const allFive = L.rows.every(function(r) { return r.cellCount === 5; });
        check(allFive, 'C12: every rendered row has exactly 5 cells (DTG/Sev/Cat/Source/Msg)',
              'cellCounts=[' + L.rows.map(function(r){return r.cellCount;}).join(',') + ']');

        // ---- C13: source = Operator ----
        check(/Operator|المشغّل|المشغل/.test(L.rows[0].source || ''),
              'C13: Source column reads "Operator"', 'source="' + L.rows[0].source + '"');

        // ---- C14: count line ----
        check(/\b4\s+of\s+64\b/.test(L.countText || ''),
              'C14: count line reads "4 of 64 operator events"', 'count="' + L.countText + '"');

        // ---- C15: DTG formatted ----
        check(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}Z$/.test(L.rows[0].dtg || ''),
              'C15: DTG cell is a formatted timestamp (YYYY-MM-DD HH:MM:SSZ)', 'dtg="' + L.rows[0].dtg + '"');

        // ---- C16: global #event-log untouched ----
        console.log('\n--- C16: global #event-log separate + present ---');
        const globalLog = await page.evaluate(function() {
            var g  = document.getElementById('event-log');
            var sw = document.getElementById('sw-live-event-log-card');
            return { present: !!g, distinct: !!g && !!sw && g.id !== sw.id && !g.contains(sw) };
        });
        check(globalLog.present && globalLog.distinct,
              'C16: global #event-log ops ledger still present + distinct from the SW ledger',
              'present=' + globalLog.present + ' distinct=' + globalLog.distinct);

        // ---- C17: API cap + deep-copy isolation ----
        console.log('\n--- C17: API shape (cap + deep-copy) ---');
        const api = await page.evaluate(function() {
            var a = window.AppShellScenarioWorkspace.getLiveOperatorEventLog();
            var before = a.count;
            // mutate the returned copy — must NOT leak into module state
            if (a.events && a.events.length) a.events.push({ injected: true });
            a.rows.length = 0;
            var b = window.AppShellScenarioWorkspace.getLiveOperatorEventLog();
            return { cap: a.cap, before: before, after: b.count, afterRows: b.rows.length };
        });
        check(api.cap === 64 && api.before === 4 && api.after === 4 && api.afterRows === 4,
              'C17: getLiveOperatorEventLog() cap=64 + deep-copy isolation (mutation does not leak)',
              JSON.stringify(api));

        // ---- C18: events persist across a scenario LOAD; step-status resets ----
        console.log('\n--- C18: events persist across load (audit trail) ---');
        const loadRes = await page.evaluate(function(scn) {
            var r = window.AppShellScenarioWorkspace.loadLiveScenarioFromJson(scn);
            var log = window.AppShellScenarioWorkspace.getLiveOperatorEventLog();
            var st  = window.AppShellScenarioWorkspace.getLiveStepStatus(0);
            return { passed: r.passed, count: log.count, statusAfterLoad: st && st.status, stored: st && st.stored };
        }, TEST_SCENARIO_2);
        check(loadRes.passed === true && loadRes.count === 4,
              'C18: events survive a scenario load (audit trail kept across loads)',
              'loadPassed=' + loadRes.passed + ' eventCount=' + loadRes.count);
        check(loadRes.statusAfterLoad === 'pending' && loadRes.stored === false,
              'C18b: contrast — step status WAS reset by the load (scenario-scoped)',
              'status=' + loadRes.statusAfterLoad + ' stored=' + loadRes.stored);

        // ---- C19 / C20: Clear-log empties ledger; step status untouched ----
        console.log('\n--- C19/C20: Clear-log button ---');
        // set a fresh status so we can prove clear-log does NOT touch step status
        await clickStatus(page, 'decided');
        const badgeBefore = await page.evaluate(function() {
            var b = document.getElementById('sw-live-step-status-badge');
            return b ? b.getAttribute('data-status') : null;
        });
        await clickClearLog(page);
        L = await readLedger(page);
        const badgeAfter = await page.evaluate(function() {
            var b = document.getElementById('sw-live-step-status-badge');
            return b ? b.getAttribute('data-status') : null;
        });
        await page.screenshot({ path: path.join(SHOTS_DIR, '06-after-clear.png') });
        check(L.rowCount === 0 && L.emptyVisible === true && L.clearVisible === false &&
              /\b0\s+of\s+64\b/.test(L.countText || ''),
              'C19: Clear-log empties the ledger (0 rows, empty shown, Clear hidden, count 0)',
              'rows=' + L.rowCount + ' empty=' + L.emptyVisible + ' clear=' + L.clearVisible +
              ' count="' + L.countText + '"');
        check(badgeBefore === 'decided' && badgeAfter === 'decided',
              'C20: clearing the log left step status intact (clear scoped to events only)',
              'before=' + badgeBefore + ' after=' + badgeAfter);

        // ---- C21: step navigation still works ----
        console.log('\n--- C21: step navigation ---');
        const navBefore = await page.evaluate(function() {
            var e = document.getElementById('sw-live-scenario-step');
            return e ? (e.textContent || '').trim() : null;
        });
        await page.evaluate(function() {
            var b = document.getElementById('sw-nav-next');
            if (b) b.click();
        });
        await page.waitForTimeout(300);
        const navAfter = await page.evaluate(function() {
            var e = document.getElementById('sw-live-scenario-step');
            return { step: e ? (e.textContent || '').trim() : null,
                     idx: window.RmoozScenario && window.RmoozScenario.stepIndex };
        });
        check(/(Step|الخطوة)\s+2\s+(of|من)\s+3/.test(navAfter.step || '') && navAfter.idx === 1,
              'C21: Next advances the header counter to "Step 2 of 3"',
              'before="' + navBefore + '" after="' + navAfter.step + '" idx=' + navAfter.idx);

        // ---- C22: no forbidden backend / unit / map calls ----
        console.log('\n--- C22/C23: boundaries + console ---');
        const FORBIDDEN_RE = /\/api\/sim\/commit|applyDecision|executeSimulation|\/api\/scenario\/(commit|apply|mutate|save|advance|decide|update)|\/api\/(units|map|overlay)\/(write|mutate|update|save|commit)|gate\s*7/i;
        const badCalls = networkCalls.filter(c => FORBIDDEN_RE.test(c));
        check(badCalls.length === 0,
              'C22: no scenario-mutating backend / unit / map calls',
              badCalls.length ? 'FORBIDDEN: ' + badCalls.join(' | ') : 'none');

        // ---- C23: console errors ----
        await page.waitForTimeout(300);
        check(consoleErrors.length === 0,
              'C23: zero console errors',
              consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : 'clean');
        if (consoleErrors.length) consoleErrors.forEach(e => console.log('    >', e));

        await page.screenshot({ path: path.join(SHOTS_DIR, '07-final.png') });

    } catch (err) {
        console.error('\n  EXCEPTION:', err.message);
        failed++;
        results.push({ ok: false, label: 'Unexpected exception', detail: err.message });
        await page.screenshot({ path: path.join(SHOTS_DIR, 'error.png') }).catch(() => {});
    } finally {
        await browser.close();
    }

    console.log('\n' + '═'.repeat(65));
    console.log('  PR-288L Browser Verification — RESULTS');
    console.log('═'.repeat(65));
    console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
    console.log('═'.repeat(65));
    console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
    console.log('  Screenshots: ' + SHOTS_DIR);
    process.exit(failed === 0 ? 0 : 1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
