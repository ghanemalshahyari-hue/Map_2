/**
 * Append-only commit journal.
 *
 * Single source of truth for "who-mutated-what". Every committed combat-state
 * change in RMOOZ writes one row here, regardless of producer (LLM-narrator,
 * deterministic-sim, or legacy-shim) and regardless of caller (operator UI,
 * Monte Carlo, scripted tests).
 *
 * Architectural invariant (R1 from the boundary plan):
 *   No HTTP response, no in-process call, no client message ever mutates
 *   combat state without writing a row here first.
 *
 * Storage:  data/journal/<run_id>.jsonl, append-only NDJSON, one line per
 *           committed action (or one line with action_id='state-delta' when
 *           a proposal commits as a whole — Step 1 case).
 *
 * Layout of a journal row:
 *   {
 *     ts,                // ISO timestamp
 *     run_id, step, seq, // run_id and a monotonically increasing seq
 *     prev_state_hash,
 *     post_state_hash,
 *     proposal_id,
 *     action_id,         // 'state-delta' when no per-action proposal
 *     decision,          // 'accept' | 'reject' | 'auto'
 *     operator_id,       // 'op:<id>' for UI, 'system:<reason>' for headless
 *     source,            // 'llm-narrator' | 'deterministic-sim' | 'legacy-shim'
 *     mods,              // optional modifications payload
 *   }
 *
 * Hash function: deterministic JSON stringify + sha256. Used to chain
 * prev_state_hash → post_state_hash so the journal can be verified for
 * tamper-resistance and replay.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT       = path.join(__dirname, '..', '..');
const DATA_DIR   = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const JOURNAL_DIR = path.join(DATA_DIR, 'journal');

// Per-run monotonically increasing seq counter. Reset on process restart;
// the journal file on disk holds the durable history.
const seqByRun = new Map();

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function runFile(runId) {
    if (!runId || typeof runId !== 'string') {
        throw new Error('journal.runFile: runId must be a non-empty string');
    }
    return path.join(JOURNAL_DIR, `${runId}.jsonl`);
}

// Deterministic JSON stringify: sort object keys recursively. Used by
// hashState so the same state object always produces the same hash
// regardless of key insertion order.
function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return '[' + value.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function hashState(state) {
    if (state == null) return null;
    return 'sha256:' + crypto.createHash('sha256').update(stableStringify(state)).digest('hex');
}

function nextSeq(runId) {
    const s = (seqByRun.get(runId) || 0) + 1;
    seqByRun.set(runId, s);
    return s;
}

// Replay the on-disk journal to recover the highest seq for a run. Cheap —
// called once per run when the first commit lands.
function primeSeqFromDisk(runId) {
    if (seqByRun.has(runId)) return;
    ensureDir(JOURNAL_DIR);
    const file = runFile(runId);
    if (!fs.existsSync(file)) {
        seqByRun.set(runId, 0);
        return;
    }
    let highest = 0;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
        if (!line) continue;
        try {
            const row = JSON.parse(line);
            if (Number.isInteger(row.seq) && row.seq > highest) highest = row.seq;
        } catch (_) { /* tolerate partial/corrupt rows */ }
    }
    seqByRun.set(runId, highest);
}

/**
 * Append a single commit row to the run's journal.
 *
 *   row: {
 *     run_id, step, prev_state_hash, post_state_hash,
 *     proposal_id, action_id, decision, operator_id, source, mods?
 *   }
 *
 * Returns { seq, ts } so the caller can include them in the HTTP response.
 */
function appendCommit(row) {
    if (!row || typeof row !== 'object') throw new Error('journal.appendCommit: row required');
    if (!row.run_id) throw new Error('journal.appendCommit: run_id required');
    if (!row.proposal_id) throw new Error('journal.appendCommit: proposal_id required');
    if (!row.action_id) throw new Error('journal.appendCommit: action_id required');
    if (!row.decision) throw new Error('journal.appendCommit: decision required');
    if (!row.operator_id) throw new Error('journal.appendCommit: operator_id required');
    if (!row.source) throw new Error('journal.appendCommit: source required');

    primeSeqFromDisk(row.run_id);
    ensureDir(JOURNAL_DIR);

    const ts  = new Date().toISOString();
    const seq = nextSeq(row.run_id);

    const out = {
        ts,
        run_id:          row.run_id,
        step:            row.step != null ? row.step : null,
        seq,
        prev_state_hash: row.prev_state_hash || null,
        post_state_hash: row.post_state_hash || null,
        proposal_id:     row.proposal_id,
        action_id:       row.action_id,
        decision:        row.decision,
        operator_id:     row.operator_id,
        source:          row.source,
        mods:            row.mods || null,
    };

    fs.appendFileSync(runFile(row.run_id), JSON.stringify(out) + '\n');
    return { seq, ts };
}

/**
 * Load every row of a run's journal in order. Used by the AAR coach
 * (Step 2+) and by replay verifiers.
 */
function loadRun(runId) {
    const file = runFile(runId);
    if (!fs.existsSync(file)) return [];
    const out = [];
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
        if (!line) continue;
        try { out.push(JSON.parse(line)); }
        catch (_) { /* skip corrupt row */ }
    }
    return out;
}

/**
 * Returns the path to a run's journal file. Used by tests + tooling.
 */
function pathForRun(runId) {
    return runFile(runId);
}

module.exports = {
    appendCommit,
    loadRun,
    hashState,
    pathForRun,
    JOURNAL_DIR,
};
