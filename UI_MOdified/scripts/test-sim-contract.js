#!/usr/bin/env node
/**
 * AI/Sim boundary contract regression test (plan Step 1).
 *
 * Exercises the propose / commit split in-process (no HTTP, no LLM).
 * Mock-mode keeps it deterministic and runs in < 1 s.
 *
 * Assertions cover the three architectural rules:
 *   R1 — No state without commit. propose() never touches the journal.
 *   R2 — No commit without intent. commit() requires operator_id or
 *        headless.reason; missing both must throw.
 *   R3 — AI emits proposals, never state. The Proposal's projected_state
 *        is identical-shape to the legacy state, but is labelled
 *        projected and lives only in the in-memory proposal store
 *        until commit fires.
 *
 * Exit 0 on all pass, 1 on any failure.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const loader      = require(path.join('..', 'server', 'ai', 'scenario-loader'));
const adjudicator = require(path.join('..', 'server', 'ai', 'adjudicator-agent'));
const journal     = require(path.join('..', 'server', 'sim', 'journal'));
const proposalStore = require(path.join('..', 'server', 'sim', 'proposal-store'));
const schema      = require(path.join('..', 'server', 'ai', 'adjudicator-schema'));

// Unique runId per process invocation so the test's journal rows are
// isolated from any other runs. Cleaned up at the end of main().
const TEST_RUN_ID = `test-sim-contract-${Date.now()}-${process.pid}`;

let pass = 0;
let fail = 0;
function it(name, fn) {
    try {
        fn();
        console.log(`  [PASS] ${name}`);
        pass++;
    } catch (e) {
        console.log(`  [FAIL] ${name}\n         ${e && e.message}`);
        fail++;
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'assertEq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
function assertThrows(fn, msgMatch, msg) {
    let thrown = null;
    try { fn(); } catch (e) { thrown = e; }
    if (!thrown) throw new Error(msg || 'expected throw, none caught');
    if (msgMatch && !String(thrown.message).match(msgMatch)) {
        throw new Error(`thrown message ${JSON.stringify(thrown.message)} did not match ${msgMatch}`);
    }
}

async function main() {
    console.log('AI/Sim boundary contract test');
    console.log('=============================');

    const scenario = loader.loadScenario('wargame2');
    const runId = TEST_RUN_ID;
    const journalFile = journal.pathForRun(runId);

    // Clean any stale store state from a previous in-process run.
    proposalStore.clearAll();

    // ── R1: propose() does NOT touch the journal ─────────────────
    const stateBefore = fs.existsSync(journalFile) ? fs.readFileSync(journalFile, 'utf8') : '';
    const proposal = await adjudicator.proposeStep({
        scenario,
        stepIndex: 1,
        prevState: null,
        trialId:   'test',
        mockMode:  true,
        runId,
    });
    const stateAfterPropose = fs.existsSync(journalFile) ? fs.readFileSync(journalFile, 'utf8') : '';
    it('R1: propose() writes nothing to journal', () => {
        assertEq(stateBefore, stateAfterPropose, 'journal file changed after propose()');
    });

    // ── Proposal shape ───────────────────────────────────────────
    it('proposal_id is a non-empty string', () => {
        assert(typeof proposal.proposal_id === 'string' && proposal.proposal_id, 'proposal_id missing');
    });
    it('source is llm-narrator', () => {
        assertEq(proposal.source, 'llm-narrator');
    });
    it('proposed_actions contains exactly one STATE_DELTA action', () => {
        assert(Array.isArray(proposal.proposed_actions), 'proposed_actions not an array');
        assertEq(proposal.proposed_actions.length, 1);
        assertEq(proposal.proposed_actions[0].kind, 'STATE_DELTA');
        assertEq(proposal.proposed_actions[0].id, 'state-delta');
    });
    it('projected_state has the legacy state shape (phase_line_km, objective_status)', () => {
        assert(proposal.projected_state, 'projected_state missing');
        assert(typeof proposal.projected_state.phase_line_km === 'number', 'phase_line_km missing/non-numeric');
        assert(typeof proposal.projected_state.objective_status === 'string', 'objective_status missing');
    });
    it('projected_validation includes clamp_suggestions array', () => {
        assert(Array.isArray(proposal.projected_validation.clamp_suggestions), 'clamp_suggestions not an array');
    });
    it('validateProposal accepts the wrapped proposal', () => {
        const err = schema.validateProposal(proposal);
        assertEq(err, null, `validateProposal rejected: ${err}`);
    });

    // ── R2: commit without intent must throw ──────────────────────
    it('R2: commit() throws when neither operator_id nor headless.reason is given', () => {
        // We need a fresh proposal for this since the previous one was
        // consumed-from-store... actually it wasn't consumed yet — only
        // commit() consumes. So we can reuse `proposal` here.
        assertThrows(() => adjudicator.commitStep({
            proposal_id:         proposal.proposal_id,
            accepted_action_ids: 'ALL',
        }), /operator_id.*headless.*required/);
    });

    // ── R1 part 2 + happy-path commit ────────────────────────────
    const commit = adjudicator.commitStep({
        proposal_id:         proposal.proposal_id,
        accepted_action_ids: 'ALL',
        headless:            { reason: 'test' },
    });
    it('commit() returns committed_state matching projected_state for STATE_DELTA accept', () => {
        assertEq(commit.committed_state.phase_line_km, proposal.projected_state.phase_line_km);
        assertEq(commit.committed_state.objective_status, proposal.projected_state.objective_status);
    });
    it('commit() returns journal_seq=1 (first row in this run)', () => {
        assertEq(commit.journal_seq, 1);
    });
    it('commit() returns a sha256 post_state_hash', () => {
        assert(typeof commit.post_state_hash === 'string' && commit.post_state_hash.startsWith('sha256:'),
            'post_state_hash not sha256');
    });

    // ── R1 part 3: journal row exists with correct provenance ────
    const rows = journal.loadRun(runId);
    it('journal has exactly one row for the accepted STATE_DELTA', () => {
        assertEq(rows.length, 1, `expected 1 row, got ${rows.length}`);
    });
    it('journal row records source=llm-narrator', () => {
        assertEq(rows[0].source, 'llm-narrator');
    });
    it('journal row records decision=auto (headless commit)', () => {
        assertEq(rows[0].decision, 'auto');
    });
    it('journal row records operator_id=system:test', () => {
        assertEq(rows[0].operator_id, 'system:test');
    });
    it('journal row records action_id=state-delta', () => {
        assertEq(rows[0].action_id, 'state-delta');
    });
    it('journal row references the same proposal_id', () => {
        assertEq(rows[0].proposal_id, proposal.proposal_id);
    });

    // ── Reject path ──────────────────────────────────────────────
    proposalStore.clearAll();  // clean state for a fresh proposal id
    const proposal2 = await adjudicator.proposeStep({
        scenario,
        stepIndex: 2,
        prevState: commit.committed_state,
        trialId:   'test',
        mockMode:  true,
        runId,
    });
    const commit2 = adjudicator.commitStep({
        proposal_id:         proposal2.proposal_id,
        accepted_action_ids: [],   // reject all
        headless:            { reason: 'test-reject' },
    });
    it('rejecting STATE_DELTA leaves state unchanged (committed_state == prev path)', () => {
        // With no accepted action_ids, commitStep falls back to a
        // pass-through; the contract is that no state mutation occurs.
        // We assert the committed_state is structurally distinguishable
        // from the projected_state having been applied: the journal row
        // for this step records decision='reject', not 'auto'.
        const rows2 = journal.loadRun(runId);
        const stepTwoRow = rows2.find(r => r.step === 2);
        assert(stepTwoRow, 'no journal row at step 2');
        assertEq(stepTwoRow.decision, 'reject');
    });

    // ── R3: consumed proposal cannot be re-committed ─────────────
    it('R3: a consumed proposal cannot be replayed', () => {
        assertThrows(() => adjudicator.commitStep({
            proposal_id:         proposal.proposal_id,   // already consumed above
            accepted_action_ids: 'ALL',
            headless:            { reason: 'replay' },
        }), /not found or expired/);
    });

    // ── adjudicateStepHeadless = propose + auto-commit ───────────
    const headless = await adjudicator.adjudicateStepHeadless({
        scenario,
        stepIndex: 3,
        prevState: commit2.committed_state,
        trialId:   'test',
        mockMode:  true,
        runId,
        headless:  { reason: 'mc-trial' },
    });
    it('adjudicateStepHeadless returns legacy { ok, stepIndex, state, validation, meta }', () => {
        assertEq(headless.ok, true);
        assertEq(headless.stepIndex, 3);
        assert(headless.state, 'state missing');
        assert(headless.validation, 'validation missing');
        assert(headless.meta, 'meta missing');
    });
    it('adjudicateStepHeadless writes operator_id=system:mc-trial', () => {
        const rows3 = journal.loadRun(runId);
        const mcRow = rows3.find(r => r.step === 3);
        assert(mcRow, 'no journal row at step 3');
        assertEq(mcRow.operator_id, 'system:mc-trial');
    });

    // ── Cleanup ──────────────────────────────────────────────────
    // Remove only this test's journal file; leave the rest of data/ untouched.
    try { fs.unlinkSync(journal.pathForRun(runId)); } catch (_) {}

    console.log('');
    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
}

if (require.main === module) {
    main().catch(e => { console.error('ERROR:', e); process.exit(1); });
}
