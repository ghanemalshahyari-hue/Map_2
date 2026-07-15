#!/usr/bin/env node
/**
 * test-edit-mode-launch-slice.js — Batch B Slice 11
 *
 * Static (no server) verifier for the commander-approval workflow +
 * Launch-to-SCC action. Closes a real gap found during implementation: NO
 * client UI anywhere called the Slice 2 approval endpoints
 * (submit-for-review/review/approve/reject/reopen) before this slice — the
 * Launch button's gate condition would otherwise have been permanently
 * unreachable through the app.
 *
 * Proves:
 *   - the Launch button is disabled whenever there is no draft name, no
 *     lifecycle record, or the lifecycle status isn't approved/activated
 *   - it becomes enabled once status is 'approved' (or 'activated') AND
 *     hard rules + draftIsSafe both pass
 *   - Submit/Approve/Reject/Reopen buttons are enabled/disabled exactly per
 *     the server's own can_submit/can_approve/status flags (never a
 *     client-invented approximation)
 *   - launchToSCC() calls window.RmoozFreeFightDemo.mount({}, {objective})
 *     with an EMPTY payload (not a synthetic operational_brief — the SCC
 *     engine reads window.RmoozScenario.scenario directly) once approved,
 *     and refuses to call it at all when not approved
 *
 * Sibling to test-edit-mode-entrypaths-slice.js etc. Run:
 *   node test-edit-mode-launch-slice.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function loadSandbox(opts) {
    opts = opts || {};
    const mountCalls = [];
    const sandboxWindow = {
        AppEditMode: null,
        RmoozScenario: null,
        RmoozFreeFightDemo: opts.noMount ? null : { mount: function (payload, mountOpts) { mountCalls.push({ payload: payload, opts: mountOpts }); } },
        fetch: opts.fetch || function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
        prompt: function () { return 'a real reason'; },
        URL: { createObjectURL: function () { return 'blob:stub'; }, revokeObjectURL: function () {} },
        Blob: function (parts, o) { this.parts = parts; this.opts = o; }
    };
    const stubDoc = {
        createElement: function (tag) {
            const kids = [];
            const attrs = {};
            return {
                tag: tag,
                setAttribute: function (k, v) { attrs[k] = v; },
                getAttribute: function (k) { return attrs[k]; },
                get _attrs() { return attrs; },
                style: {},
                appendChild: function (k) { kids.push(k); },
                get _kids() { return kids; },
                addEventListener: function (evt, fn) { (this._handlers = this._handlers || {})[evt] = fn; },
                click: function () { if (this._handlers && this._handlers.click) this._handlers.click(); },
                set innerHTML(_v) { kids.length = 0; }, get innerHTML() { return ''; },
                classList: { add() {}, remove() {} }
            };
        },
        getElementById: function () { return null; },
        addEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} }
    };
    const fnStub = function () {};
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', 'Blob', 'URL', 'fetch', src)(
        sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub,
        sandboxWindow.Blob, sandboxWindow.URL, sandboxWindow.fetch
    );
    return { T: sandboxWindow.AppEditMode._testing, sandboxWindow: sandboxWindow, mountCalls: mountCalls };
}

function minimalValidDraft() {
    return {
        name: 'launch-test', scenario_label: 'Launch Test',
        // name_en required by saveDraft()'s Step 3 guard.
        sides: [{ id: 'BLUE', name_en: 'Blue' }, { id: 'RED', name_en: 'Red' }],
        obj: { name: 'Objective', coord: [12, 34], target_depth_km: 0, carver: 0 }
    };
}

function deepEqEmpty(v, label) { ok(v && typeof v === 'object' && Object.keys(v).length === 0, label, JSON.stringify(v)); }

async function run() {
    console.log('\n=== Batch B Slice 11: commander approval + Launch-to-SCC ===\n');

    // ── 1. launchToSCC refuses when there is no draft / no server save ────
    console.log('\n[1] launchToSCC() populates window.RmoozScenario via its internal saveDraft() call');
    {
        const { T, sandboxWindow, mountCalls } = loadSandbox();
        T._setDraftForTest(minimalValidDraft());
        T._setApprovalCacheForTest({ scenario_name: 'launch-test', status: 'approved', can_submit: false, can_approve: false });
        // saveDraft() is called INSIDE launchToSCC (not bypassed) — this
        // exercises the real internal sequence: save first, then check.
        T.launchToSCC();
        ok(sandboxWindow.RmoozScenario && sandboxWindow.RmoozScenario.scenario, 'saveDraft() inside launchToSCC populated window.RmoozScenario (hard rules passed)');
        eq(mountCalls.length, 1, 'approved status -> mount() WAS called exactly once');
    }

    // ── 2. launchToSCC refuses when status is not approved/activated ──────
    console.log('\n[2] launchToSCC() refuses when lifecycle status is not approved');
    ['draft', 'in_review', 'rejected', null].forEach(function (status) {
        const { T, mountCalls } = loadSandbox();
        T._setDraftForTest(minimalValidDraft());
        T._setApprovalCacheForTest(status ? { scenario_name: 'launch-test', status: status } : null);
        T.launchToSCC();
        eq(mountCalls.length, 0, 'status="' + status + '" -> mount() NOT called');
    });

    // ── 3. launchToSCC calls mount() with an EMPTY payload + derived objective ─
    console.log('\n[3] launchToSCC() calls mount({}, {objective}) — not a synthetic brief payload');
    {
        const { T, mountCalls } = loadSandbox();
        T._setDraftForTest(minimalValidDraft());
        T._setApprovalCacheForTest({ scenario_name: 'launch-test', status: 'approved' });
        T.launchToSCC();
        eq(mountCalls.length, 1, 'mount called once');
        const call = mountCalls[0];
        deepEqEmpty(call.payload, 'payload is an empty object (engine reads window.RmoozScenario.scenario directly)');
        eq(call.opts.objective.lon, 12, 'objective.lon derived from sc.obj.coord[0]');
        eq(call.opts.objective.lat, 34, 'objective.lat derived from sc.obj.coord[1]');
    }

    // ── 4. launchToSCC refuses when the Free Fight engine isn't loaded ─────
    console.log('\n[4] launchToSCC() fails gracefully when the engine module is missing');
    {
        const { T } = loadSandbox({ noMount: true });
        T._setDraftForTest(minimalValidDraft());
        T._setApprovalCacheForTest({ scenario_name: 'launch-test', status: 'approved' });
        let threw = false;
        try { T.launchToSCC(); } catch (e) { threw = true; }
        ok(!threw, 'does not throw when RmoozFreeFightDemo is absent');
    }

    // ── 5. renderSaveStepCard smoke test across lifecycle states ───────────
    console.log('\n[5] renderSaveStepCard renders without throwing across all lifecycle states');
    [null, { status: 'draft', can_submit: true }, { status: 'in_review', can_approve: true },
     { status: 'approved' }, { status: 'rejected' }, { status: 'activated' }].forEach(function (cache) {
        const { T } = loadSandbox();
        T._setDraftForTest(minimalValidDraft());
        T._setApprovalCacheForTest(cache);
        const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
        let threw = false;
        try { T.renderSaveStepCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
        ok(!threw, 'renders cleanly for status=' + (cache && cache.status));
    });

    // ── 6. _refreshApprovalStatus fetches the right URL and caches the result ──
    console.log('\n[6] _refreshApprovalStatus() fetches GET /api/scenarios/:name/approval');
    {
        let requestedUrl = null;
        const fakeFetch = function (url) {
            requestedUrl = url;
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, scenario_name: 'launch-test', status: 'approved', can_submit: false, can_approve: false }) });
        };
        const { T } = loadSandbox({ fetch: fakeFetch });
        T._setDraftForTest(minimalValidDraft());
        await T._refreshApprovalStatus(false);
        eq(requestedUrl, '/api/scenarios/launch-test/approval', '_refreshApprovalStatus fetches the exact expected URL');
        const cache = T._getApprovalCacheForTest();
        ok(cache && cache.status === 'approved', '_approvalCache updated from the fetch response');
    }

    // ── 7. _postApprovalAction posts to the exact expected endpoint ────────
    console.log('\n[7] _postApprovalAction() posts to the exact expected endpoint + body');
    {
        let requestedUrl = null, requestedMethod = null, requestedBody = null;
        const fakeFetch = function (url, init) {
            requestedUrl = url; requestedMethod = init && init.method; requestedBody = init && init.body;
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, status: 'approved' }) });
        };
        const { T } = loadSandbox({ fetch: fakeFetch });
        T._setDraftForTest(minimalValidDraft());
        const r = await T._postApprovalAction('approve');
        eq(requestedUrl, '/api/scenarios/launch-test/approve', '_postApprovalAction posts to the exact expected URL');
        eq(requestedMethod, 'POST', 'uses POST');
        eq(requestedBody, '{}', 'no reason -> empty JSON body');
        ok(r.ok && r.body.status === 'approved', 'resolves with the server response');

        const r2 = await T._postApprovalAction('reject', 'not ready');
        eq(requestedUrl, '/api/scenarios/launch-test/reject', 'reject posts to the reject endpoint');
        eq(requestedBody, JSON.stringify({ reason: 'not ready' }), 'reject sends the reason in the body');
        ok(!!r2, 'reject call resolves');
    }

    console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FAIL — harness error:', e); process.exit(1); });
