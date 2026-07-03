'use strict';

/*
 * RMOOZ cleanup gate: AI Proposal Commit Bridge must remain a real live commit path.
 *
 * Product direction:
 * - Buttons that say Accept/Reject must not be UI-only/dry-run.
 * - ACCEPT/REJECT must call /api/sim/commit.
 * - HOLD may stay deferred with no mutation.
 * - This is main-app only and does not touch offline.
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var file = path.join(__dirname, 'UI_MOdified', 'client', 'shell', 'ai-proposal-commit-bridge.js');
var source = fs.readFileSync(file, 'utf8');
var stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
var passed = 0;
var failed = 0;
function assert(label, cond) {
    if (cond) { console.log('PASS ' + label); passed += 1; }
    else { console.error('FAIL ' + label); failed += 1; }
}

console.log('\n=== RMOOZ AI proposal commit bridge live gate ===\n');

assert('commit bridge file exists', fs.existsSync(file));
assert('commit endpoint is /api/sim/commit', /COMMIT_ENDPOINT\s*=\s*['"]\/api\/sim\/commit['"]/.test(stripped));
assert('bridge calls fetch on commit endpoint', /fetch\s*\(\s*COMMIT_ENDPOINT/.test(stripped));
assert('bridge posts operator intent', /operator_id\s*:\s*operatorId\s*\(\s*\)/.test(stripped));
assert('ACCEPT commits all actions', /accepted_action_ids\s*=\s*\(decisionUpper\s*===\s*DECISION\.ACCEPT\)\s*\?\s*['"]ALL['"]\s*:\s*\[\]/.test(stripped));
assert('mode is live not dry run', /mode\s*:\s*['"]live['"]/.test(stripped));
assert('local record marks dryRun false', /dryRun\s*:\s*false/.test(stripped));
assert('commit success records committed result', /lastResult\s*:\s*committed\s*\?\s*['"]commit-ok['"]\s*:\s*['"]reject-ok['"]/.test(stripped));
assert('HOLD remains deferred without server call', /decisionUpper\s*===\s*DECISION\.HOLD/.test(stripped) && /deferred\s*:\s*true/.test(stripped));
assert('no dry-run mode string remains in executable source', !/mode\s*:\s*['"]dry-run['"]/.test(stripped));

var fetchCalls = [];
var journalRecords = [];
var logRows = [];
var sandbox = {
    window: {
        AppShellAIProposalContract: {
            validateProposal: function (proposal) {
                return {
                    valid: true,
                    errors: [],
                    normalized: {
                        id: proposal && proposal.id || 'P-1',
                        summary: proposal && proposal.summary || 'Test proposal',
                        risk: 'LOW'
                    }
                };
            }
        },
        AppShellEventLog: { append: function (row) { logRows.push(row); } },
        AppShellDecisionJournal: { record: function (row) { journalRecords.push(row); } },
        AppConfig: { CHAT_CONFIG: { currentUser: { id: 'operator-1' } } }
    },
    fetch: function (url, opts) {
        fetchCalls.push({ url: url, opts: opts });
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ journal_seq: 7 }); } });
    },
    Promise: Promise,
    Object: Object,
    Set: Set,
    Date: Date,
    String: String,
    console: console
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: file });
var bridge = sandbox.window.AppShellAIProposalCommitBridge;
assert('bridge API is exported', bridge && typeof bridge.commitDecision === 'function' && typeof bridge.getState === 'function');
var ret = bridge.commitDecision('ACCEPT', { id: 'P-LIVE-1', summary: 'Live commit test' });
assert('ACCEPT returns pending live commit result', ret && ret.pending === true && ret.decision === 'ACCEPT');
assert('ACCEPT triggered exactly one fetch call', fetchCalls.length === 1);
assert('ACCEPT fetch target is commit endpoint', fetchCalls[0] && fetchCalls[0].url === '/api/sim/commit');
assert('ACCEPT request is POST', fetchCalls[0] && fetchCalls[0].opts && fetchCalls[0].opts.method === 'POST');
var body = fetchCalls[0] && JSON.parse(fetchCalls[0].opts.body);
assert('ACCEPT body accepts all actions', body && body.accepted_action_ids === 'ALL');
assert('ACCEPT body includes operator id', body && body.operator_id === 'operator-1');

var hold = bridge.commitDecision('HOLD', { id: 'P-HOLD-1', summary: 'Hold test' });
assert('HOLD returns deferred result', hold && hold.deferred === true && hold.committed === false);
assert('HOLD did not trigger another fetch', fetchCalls.length === 1);

setTimeout(function () {
    assert('async success updates local decision journal', journalRecords.some(function (r) { return r.proposalId === 'P-LIVE-1' && r.committed === true && r.dryRun === false; }));
    assert('async success logs journal commit event', logRows.some(function (r) { return r.messageKey === 'elog-evt-commit-applied'; }));
    console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
    if (failed) process.exit(1);
}, 0);
