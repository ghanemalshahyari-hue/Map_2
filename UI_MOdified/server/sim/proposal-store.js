/**
 * In-memory proposal store.
 *
 * Holds Proposals produced by /api/sim/propose (and by the in-process
 * headless path used by Monte Carlo + the legacy shim) until they are
 * committed by /api/sim/commit or expire.
 *
 * Architectural rule (R3): the proposal is not durable state. It is a
 * projection. If the server restarts before commit, the proposal is
 * gone and the operator re-proposes. The journal — written only at
 * commit — is durable.
 *
 * TTL: proposals expire after PROPOSAL_TTL_MS. A lazy sweep happens on
 * every put/get so we never need a background timer.
 */

'use strict';

const crypto = require('crypto');

const PROPOSAL_TTL_MS = Number(process.env.RMOOZ_PROPOSAL_TTL_MS) || 15 * 60 * 1000;  // 15 min

const store = new Map();   // proposal_id → { proposal, expires_at }

function newProposalId() {
    // Short, URL-safe, collision-resistant enough for an in-memory store.
    return 'prop-' + crypto.randomBytes(9).toString('base64url');
}

function sweep() {
    const now = Date.now();
    for (const [id, entry] of store.entries()) {
        if (entry.expires_at <= now) store.delete(id);
    }
}

/**
 * Store a freshly-built proposal. Returns the same proposal augmented
 * with proposal_id and expires_at.
 */
function put(proposal) {
    if (!proposal || typeof proposal !== 'object') {
        throw new Error('proposal-store.put: proposal required');
    }
    sweep();
    const id = proposal.proposal_id || newProposalId();
    const expires_at = Date.now() + PROPOSAL_TTL_MS;
    const stored = { ...proposal, proposal_id: id, expires_at };
    store.set(id, { proposal: stored, expires_at });
    return stored;
}

/**
 * Look up a proposal without consuming it. Returns null if missing or expired.
 */
function get(proposalId) {
    sweep();
    const entry = store.get(proposalId);
    return entry ? entry.proposal : null;
}

/**
 * Look up and remove (single-use). Commits should consume so a stale
 * proposal_id can't be replayed against the same run.
 */
function consume(proposalId) {
    sweep();
    const entry = store.get(proposalId);
    if (!entry) return null;
    store.delete(proposalId);
    return entry.proposal;
}

function size() {
    sweep();
    return store.size;
}

function clearAll() {
    store.clear();
}

module.exports = {
    put,
    get,
    consume,
    size,
    clearAll,
    PROPOSAL_TTL_MS,
};
