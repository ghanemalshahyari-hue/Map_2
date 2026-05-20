/**
 * Operator-feedback store.
 *
 * Item #9 from todo.md. Persists per-step accept / reject / note events
 * the operator emits from the adjudicator HUD. Append-only JSONL per
 * scenario so reads are simple (one stream) and writes are crash-safe
 * (no rewriting an index). Learning-store consumes this to fold
 * acceptance/rejection rates into the priors the model sees.
 *
 * Storage:
 *   data/feedback/<scenarioName>.jsonl
 *
 * Event shape (one per line):
 *   {
 *     ts:           ISO string,
 *     scenarioName: string,
 *     stepIndex:    int,
 *     decision:     'accept' | 'reject' | 'note',
 *     trialId:      string,
 *     coaParams:    { posture, reserve_commit_hour, ... } | null,
 *     provider:     'ollama' | 'claude' | null,
 *     model:        string | null,
 *     note:         string | null,
 *   }
 *
 * Why JSONL per scenario instead of one global file: most reads are
 * scenario-scoped (priors for THIS scenario), so per-scenario keeps the
 * read path streaming-fast without an index. We never delete events —
 * stale opinions still describe how the operator USED to evaluate things.
 *
 * Public surface:
 *   append(event)                 → { ok, file, ts }
 *   readAll(scenarioName)         → Event[]
 *   countByScenarioCoa(opts)      → { accept, reject, note, total }
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.join(__dirname, '..', '..');
const DATA_DIR     = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const FEEDBACK_DIR = path.join(DATA_DIR, 'feedback');

const VALID_DECISIONS = new Set(['accept', 'reject', 'note']);

function ensureDir() {
    if (!fs.existsSync(FEEDBACK_DIR)) fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
}

function fileFor(scenarioName) {
    // Defensive sanitization — scenarioName comes from the client. Keep
    // alphanumerics + hyphen + underscore; everything else collapses.
    const safe = String(scenarioName || '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 64);
    return path.join(FEEDBACK_DIR, (safe || 'unknown') + '.jsonl');
}

function normalize(event) {
    const e = event || {};
    const decision = String(e.decision || '').toLowerCase();
    if (!VALID_DECISIONS.has(decision)) return null;
    const stepIndex = Number(e.stepIndex);
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 11) return null;
    if (!e.scenarioName || typeof e.scenarioName !== 'string') return null;
    return {
        ts:           new Date().toISOString(),
        scenarioName: e.scenarioName,
        stepIndex,
        decision,
        trialId:      e.trialId   || null,
        coaParams:    (e.coaParams && typeof e.coaParams === 'object') ? e.coaParams : null,
        provider:     e.provider  || null,
        model:        e.model     || null,
        // Cap the note to 500 chars — operator commentary, not novels.
        note:         e.note ? String(e.note).slice(0, 500) : null,
    };
}

function append(event) {
    const normalized = normalize(event);
    if (!normalized) return { ok: false, error: 'invalid feedback event' };
    ensureDir();
    const file = fileFor(normalized.scenarioName);
    fs.appendFileSync(file, JSON.stringify(normalized) + '\n', 'utf8');
    return { ok: true, file, ts: normalized.ts };
}

function readAll(scenarioName) {
    const file = fileFor(scenarioName);
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
    return out;
}

// Loose COA match used by both the learning store and the priors filter:
// posture + reserve_commit_hour. Loose matches treat missing fields as
// don't-care so a feedback event recorded before COA fields were a
// requirement still aggregates.
function matchesCoa(eventCoa, wantCoa) {
    if (!wantCoa) return true;
    if (!eventCoa) return false;
    if (wantCoa.posture != null && eventCoa.posture != null && wantCoa.posture !== eventCoa.posture) return false;
    const wantHr = Number(wantCoa.reserve_commit_hour);
    const haveHr = Number(eventCoa.reserve_commit_hour);
    if (Number.isFinite(wantHr) && Number.isFinite(haveHr) && wantHr !== haveHr) return false;
    return true;
}

function countByScenarioCoa({ scenarioName, coaParams, ageMs }) {
    const events = readAll(scenarioName);
    const cutoff = ageMs > 0 ? Date.now() - ageMs : 0;
    const out = { accept: 0, reject: 0, note: 0, total: 0, latest: null };
    for (const e of events) {
        if (cutoff && Date.parse(e.ts) < cutoff) continue;
        if (!matchesCoa(e.coaParams, coaParams)) continue;
        out[e.decision] = (out[e.decision] || 0) + 1;
        out.total++;
        if (!out.latest || e.ts > out.latest) out.latest = e.ts;
    }
    return out;
}

module.exports = {
    append,
    readAll,
    countByScenarioCoa,
    FEEDBACK_DIR,
};
