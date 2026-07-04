/* ============================================================================
 * test-scc-commit-journal-bridge-1.js — SCC-REAL-STATE-B
 * ----------------------------------------------------------------------------
 * Gate for slice 2: a successful Scenario Control Center operator commit writes
 * ONE durable operator record through the SANCTIONED /api/sim/commit path — the
 * operator's commit act leaves a real, attributable journal trail, not just the
 * in-memory/localStorage mirror.
 *
 * /api/sim/commit only journals a proposal the server already holds, so the SCC
 * bridge first registers a deterministic, LLM-free MOCK proposal via
 * /api/sim/propose (no scenario generation, no demo preview, no Ollama) and then
 * ACCEPT-commits it, carrying operator_id + the selected COA id + an explicit
 * SCC_COMMIT marker.
 *
 * Verifies: (1) free-fight-demo.js defines _journalSccCommit and _commitCoa calls
 * it before returning; (2) it registers a mock proposal then POSTs /api/sim/commit
 * with operator_id + COA id + SCC_COMMIT; (3) it is gated (active commit + typeof
 * fetch) and boundary-safe (no window.units/scenario mutation, fire-and-forget)
 * and does NOT restore AI generation/demo preview; (4) the server contract slice 2
 * relies on (commitStep consumes a proposal + journals + forwards mods; mockMode
 * propose is LLM-free) is intact.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = __dirname;

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

console.log('\n=== SCC-REAL-STATE-B: SCC operator commit -> durable journal (/api/sim/commit) ===\n');

console.log('--- 1. free-fight-demo.js: journal helper present, called on commit, boundary-safe ---');
(function () {
    var ff = src('UI_MOdified/client/shell/free-fight-demo.js');
    assert('T-1  defines _journalSccCommit', ff.indexOf('function _journalSccCommit') !== -1);

    // _commitCoa must call the helper, and the call must precede its `return _coaExec;`.
    var ci = ff.indexOf('function _commitCoa(idx) {');
    var callIdx = ff.indexOf('_journalSccCommit(_coaExec)', ci);
    var retIdx  = ff.indexOf('return _coaExec;', callIdx);
    assert('T-2  _commitCoa calls _journalSccCommit before returning', ci !== -1 && callIdx !== -1 && retIdx !== -1 && callIdx < retIdx);

    var i = ff.indexOf('function _journalSccCommit');
    var body = ff.slice(i, i + 2800);
    assert('T-3  commits through the sanctioned /api/sim/commit path', body.indexOf('/api/sim/commit') !== -1);
    assert('T-4  first registers a deterministic MOCK proposal (/api/sim/propose, mockMode true, LLM-free)',
        body.indexOf('/api/sim/propose') !== -1 && /mockMode:\s*true/.test(body));
    assert('T-5  carries operator_id', /operator_id:\s*operatorId/.test(body) && body.indexOf('CHAT_CONFIG') !== -1);
    assert('T-6  durable record identifies the commit (selected COA id + explicit SCC_COMMIT marker)',
        body.indexOf('selected_coa_id') !== -1 && /coa_id:\s*coaId/.test(body) && body.indexOf("kind: 'SCC_COMMIT'") !== -1);
    assert('T-7  accepts the proposal (accepted_action_ids ALL)', /accepted_action_ids:\s*'ALL'/.test(body));
    assert('T-8  gated to the committed operator run (coaExec.active)', /coaExec\.active/.test(body));
    assert('T-9  inert without fetch (typeof fetch guard)', /typeof\s+w\.fetch\s*!==\s*'function'/.test(body));
    assert('T-10 boundary: no window.units / scenario / steps mutation',
        !/window\.units|scenarioRef\.[\w.]+\s*=[^=]|\.scenario\s*=[^=]|\.steps\s*=[^=]/.test(body));
    assert('T-11 does NOT restore AI generation / demo preview (no coa-gen / adjudicate / generate calls)',
        body.indexOf('/api/ai/coa') === -1 && body.indexOf('/plan-coas') === -1 &&
        body.indexOf('/api/ai/adjudicate') === -1 && body.indexOf('/api/ai/generate') === -1);
    assert('T-12 fire-and-forget (has a .catch so it never throws out of commit)', body.indexOf('.catch(') !== -1);
    assert('T-13 honest LLM-free provenance (source: deterministic-sim, not llm-narrator)',
        /source:\s*'deterministic-sim'/.test(body));
})();

console.log('\n--- 2. server contract slice 2 relies on is intact ---');
(function () {
    var agent = src('UI_MOdified/server/ai/adjudicator-agent.js');
    var web   = src('UI_MOdified/server/web-server.js');

    var ci = agent.indexOf('function commitStep');
    var cbody = agent.slice(ci, ci + 2800);
    assert('T-1  commitStep consumes a server-held proposal then journals (appendCommit)',
        /proposalStore\.consume\(/.test(cbody) && /appendCommit/.test(cbody));
    assert('T-2  commitStep forwards mods to the durable row (COA id lands durably)',
        /mods:\s*body\.mods\s*\|\|\s*null/.test(cbody));
    assert('T-3  mockMode propose is deterministic + LLM-free (skips Ollama)',
        /if\s*\(\s*mockMode\s*\)/.test(agent) && /skips Ollama/.test(agent));
    assert('T-4  web-server routes POST /api/sim/propose AND POST /api/sim/commit',
        /'\/api\/sim\/propose'\s*&&\s*req\.method\s*===\s*'POST'/.test(web) &&
        /'\/api\/sim\/commit'\s*&&\s*req\.method\s*===\s*'POST'/.test(web));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
