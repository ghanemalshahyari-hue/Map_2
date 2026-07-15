#!/usr/bin/env node
/**
 * test-edit-mode-launch-slice.js — Batch B Slice 11 (rewritten for Slice 12)
 *
 * Static (no server) verifier for the commander-approval workflow +
 * Launch-to-SCC action. The original Slice 11 cut trusted a possibly-stale
 * cached approval status and launched the locally-edited draft directly —
 * both were real "stale-revision" bypasses caught while designing Slice
 * 12's E2E acceptance criteria. launchToSCC() now:
 *   - re-fetches approval status FRESH at the moment of launch (never
 *     trusts the last-rendered cache)
 *   - requires an explicit operator confirmation before launching
 *   - launches the SERVER's approved copy (GET /api/ai/scenario/:name),
 *     never the local _draft, which may have diverged since approval
 *
 * Proves:
 *   - launch is refused for every non-approved status, using a FRESH fetch
 *     (not the pre-set cache) as the authoritative check
 *   - a stale local cache reading "approved" does NOT bypass launch if a
 *     fresh fetch reveals the server has since demoted the status (the
 *     exact stale-revision bypass this rewrite closes)
 *   - launch is cancelled (mount NOT called) when the operator declines the
 *     confirmation prompt
 *   - once approved and confirmed, launch fetches the scenario fresh from
 *     the server and calls window.RmoozFreeFightDemo.mount({}, {objective})
 *     with THAT server copy, not the local draft
 *   - Submit/Approve/Reject/Reopen buttons render without throwing across
 *     lifecycle states
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
    const fetchLog = [];
    const routes = opts.routes || {};
    const defaultFetch = function (url, init) {
        fetchLog.push({ url: url, init: init });
        for (const pattern of Object.keys(routes)) {
            if (url.indexOf(pattern) === 0) return Promise.resolve(routes[pattern](url, init));
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    };
    const sandboxWindow = {
        AppEditMode: null,
        RmoozScenario: null,
        RmoozFreeFightDemo: opts.noMount ? null : { mount: function (payload, mountOpts) { mountCalls.push({ payload: payload, opts: mountOpts }); } },
        fetch: opts.fetch || defaultFetch,
        confirm: opts.confirm !== undefined ? opts.confirm : function () { return true; },
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
    return { T: sandboxWindow.AppEditMode._testing, sandboxWindow: sandboxWindow, mountCalls: mountCalls, fetchLog: fetchLog };
}

function minimalValidDraft() {
    return {
        name: 'launch-test', scenario_label: 'Launch Test',
        sides: [{ id: 'BLUE', name_en: 'Blue' }, { id: 'RED', name_en: 'Red' }],
        obj: { name: 'Objective', coord: [12, 34], target_depth_km: 0, carver: 0 }
    };
}

function approvalRoute(status) {
    return function () {
        return { ok: true, status: 200, json: () => Promise.resolve({ ok: true, scenario_name: 'launch-test', status: status }) };
    };
}
function scenarioRoute(scenario) {
    return function () {
        return { ok: true, status: 200, json: () => Promise.resolve({ ok: true, scenario: scenario }) };
    };
}

async function run() {
    console.log('\n=== Batch B Slice 11/12: commander approval + Launch-to-SCC (stale-revision-safe) ===\n');

    // ── 1. Launch refused for every non-approved status (fresh check) ──────
    console.log('\n[1] launchToSCC() refuses via a FRESH fetch for every non-approved status');
    for (const status of ['draft', 'in_review', 'rejected']) {
        const { T, mountCalls } = loadSandbox({ routes: { '/api/scenarios/launch-test/approval': approvalRoute(status) } });
        T._setDraftForTest(minimalValidDraft());
        const launched = await T.launchToSCC();
        eq(launched, false, 'status="' + status + '" -> launchToSCC resolves false');
        eq(mountCalls.length, 0, 'status="' + status + '" -> mount() NOT called');
    }

    // ── 2. Stale local cache does NOT bypass a fresh server demotion ──────
    console.log('\n[2] A stale cached "approved" does not survive a fresh check that finds "draft"');
    {
        const { T, mountCalls } = loadSandbox({ routes: { '/api/scenarios/launch-test/approval': approvalRoute('draft') } });
        T._setDraftForTest(minimalValidDraft());
        // Simulate a stale cache from BEFORE a stale-revision demotion happened server-side.
        T._setApprovalCacheForTest({ scenario_name: 'launch-test', status: 'approved' });
        const launched = await T.launchToSCC();
        eq(launched, false, 'stale-approved cache + fresh server "draft" -> launch refused');
        eq(mountCalls.length, 0, 'mount() NOT called despite the stale cache saying approved');
        const cache = T._getApprovalCacheForTest();
        eq(cache.status, 'draft', '_approvalCache was refreshed to the true server status');
    }

    // ── 3. Launch cancelled when the operator declines the confirmation ────
    console.log('\n[3] launchToSCC() requires confirmation and honors a decline');
    {
        const { T, mountCalls } = loadSandbox({
            routes: { '/api/scenarios/launch-test/approval': approvalRoute('approved') },
            confirm: function () { return false; }
        });
        T._setDraftForTest(minimalValidDraft());
        const launched = await T.launchToSCC();
        eq(launched, false, 'declined confirmation -> launchToSCC resolves false');
        eq(mountCalls.length, 0, 'mount() NOT called when the operator declines');
    }

    // ── 4. Approved + confirmed -> fetches the SERVER copy and mounts it ───
    console.log('\n[4] Approved + confirmed launch fetches the server copy (not the local draft)');
    {
        const serverScenario = { name: 'launch-test', red_units: [{ uid: 'RED-1' }], obj: { coord: [99, 88] } };
        const { T, mountCalls, fetchLog } = loadSandbox({
            routes: {
                '/api/scenarios/launch-test/approval': approvalRoute('approved'),
                '/api/ai/scenario/launch-test': scenarioRoute(serverScenario)
            }
        });
        const localDraft = minimalValidDraft();
        localDraft.red_units = []; // deliberately different from the server copy — proves we don't launch this
        T._setDraftForTest(localDraft);
        const launched = await T.launchToSCC();
        eq(launched, true, 'approved + confirmed -> launchToSCC resolves true');
        eq(mountCalls.length, 1, 'mount() called exactly once');
        const call = mountCalls[0];
        deepEqEmpty(call.payload, 'payload is an empty object');
        eq(call.opts.objective.lon, 99, 'objective derived from the SERVER copy, not the local draft (which had coord [12,34])');
        ok(fetchLog.some(f => f.url === '/api/ai/scenario/launch-test'), 'the server scenario endpoint was actually fetched');
    }
    function deepEqEmpty(v, label) { ok(v && typeof v === 'object' && Object.keys(v).length === 0, label, JSON.stringify(v)); }

    // ── 5. Launch fails gracefully when the engine module is missing ───────
    console.log('\n[5] launchToSCC() fails gracefully when the engine module is missing');
    {
        const { T } = loadSandbox({ noMount: true, routes: { '/api/scenarios/launch-test/approval': approvalRoute('approved'), '/api/ai/scenario/launch-test': scenarioRoute(minimalValidDraft()) } });
        T._setDraftForTest(minimalValidDraft());
        const launched = await T.launchToSCC();
        eq(launched, false, 'no engine loaded -> launchToSCC resolves false, does not throw');
    }

    // ── 6. renderSaveStepCard smoke test across lifecycle states ───────────
    console.log('\n[6] renderSaveStepCard renders without throwing across all lifecycle states');
    for (const cache of [null, { status: 'draft', can_submit: true }, { status: 'in_review', can_approve: true },
                         { status: 'approved' }, { status: 'rejected' }, { status: 'activated' }]) {
        const { T } = loadSandbox();
        T._setDraftForTest(minimalValidDraft());
        T._setApprovalCacheForTest(cache);
        const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
        let threw = false;
        try { T.renderSaveStepCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
        ok(!threw, 'renders cleanly for status=' + (cache && cache.status));
    }

    // ── 7. _refreshApprovalStatus / _postApprovalAction hit the right endpoints ─
    console.log('\n[7] _refreshApprovalStatus / _postApprovalAction hit the exact expected endpoints');
    {
        const { T } = loadSandbox({ routes: { '/api/scenarios/launch-test/approval': approvalRoute('approved') } });
        T._setDraftForTest(minimalValidDraft());
        await T._refreshApprovalStatus(false);
        const cache = T._getApprovalCacheForTest();
        ok(cache && cache.status === 'approved', '_approvalCache updated from the fetch response');
    }
    {
        let requestedUrl = null, requestedBody = null;
        const fakeFetch = function (url, init) {
            requestedUrl = url; requestedBody = init && init.body;
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, status: 'approved' }) });
        };
        const { T } = loadSandbox({ fetch: fakeFetch });
        T._setDraftForTest(minimalValidDraft());
        await T._postApprovalAction('reject', 'not ready');
        eq(requestedUrl, '/api/scenarios/launch-test/reject', 'reject posts to the reject endpoint');
        eq(requestedBody, JSON.stringify({ reason: 'not ready' }), 'reject sends the reason in the body');
    }

    console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FAIL — harness error:', e); process.exit(1); });
