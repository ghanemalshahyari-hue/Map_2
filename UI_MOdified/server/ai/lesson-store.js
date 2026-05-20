/**
 * AAR lesson store — structured After Action Review lessons (item #5).
 *
 * Each lesson is a short, structured entry an operator can write after
 * reviewing a step or trial outcome. Lessons are persisted to
 *   data/lessons.jsonl
 * and surfaced in the learned-priors prompt block so future adjudication
 * calls see what the operator previously flagged.
 *
 * Public surface:
 *   append(lesson)            → { ok, id, error? }
 *   listByScenario(name, n)   → lesson[]
 *   listRecent(n)             → lesson[]
 *   countByScenario(name)     → number
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT     = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const FILE     = path.join(DATA_DIR, 'lessons.jsonl');

const VALID_CATEGORIES = new Set([
    'tactics', 'logistics', 'intel', 'fires', 'maneuver', 'general',
]);

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function now() { return new Date().toISOString(); }

function shortId() {
    return crypto.randomBytes(4).toString('hex');
}

function readAll() {
    if (!fs.existsSync(FILE)) return [];
    const raw = fs.readFileSync(FILE, 'utf8').trim();
    if (!raw) return [];
    return raw.split('\n')
        .map(line => {
            try { return JSON.parse(line); }
            catch { return null; }
        })
        .filter(Boolean);
}

function writeAll(lessons) {
    ensureDir(path.dirname(FILE));
    const lines = lessons.map(l => JSON.stringify(l)).join('\n') + '\n';
    fs.writeFileSync(FILE, lines, 'utf8');
}

/**
 * Append a lesson. Auto-generates id and createdAt.
 *
 * Accepted fields:
 *   scenarioName  (string, required)
 *   category      (string, one of VALID_CATEGORIES, default 'general')
 *   title         (string, max 120 chars, required)
 *   narrative     (string, max 2000 chars, optional)
 *   tags          (string[], optional)
 *   runId         (string, optional)
 *   stepIndex     (number, optional)
 *   author        (string, optional)
 */
function append(lesson) {
    lesson = lesson || {};
    const scenarioName = String(lesson.scenarioName || '').trim();
    if (!scenarioName) return { ok: false, error: 'scenarioName is required' };

    const title = String(lesson.title || '').trim().slice(0, 120);
    if (!title) return { ok: false, error: 'title is required' };

    const category = VALID_CATEGORIES.has(lesson.category) ? lesson.category : 'general';
    const narrative = String(lesson.narrative || '').trim().slice(0, 2000);
    const tags = Array.isArray(lesson.tags)
        ? lesson.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10)
        : [];
    const author = String(lesson.author || '').trim().slice(0, 64) || 'unknown';

    const entry = {
        id: shortId(),
        scenarioName,
        category,
        title,
        narrative,
        tags,
        author,
        runId: lesson.runId || null,
        stepIndex: Number.isInteger(lesson.stepIndex) ? lesson.stepIndex : null,
        createdAt: now(),
    };

    const all = readAll();
    all.push(entry);
    writeAll(all);

    return { ok: true, id: entry.id };
}

/**
 * List lessons for a scenario, most recent first.
 * @param {string} scenarioName
 * @param {number} [limit=20]
 */
function listByScenario(scenarioName, limit) {
    const n = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 20));
    return readAll()
        .filter(l => l.scenarioName === scenarioName)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, n);
}

/**
 * List most recent lessons across all scenarios.
 * @param {number} [limit=10]
 */
function listRecent(limit) {
    const n = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 10));
    return readAll()
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, n);
}

function countByScenario(scenarioName) {
    return readAll().filter(l => l.scenarioName === scenarioName).length;
}

module.exports = {
    append,
    listByScenario,
    listRecent,
    countByScenario,
    FILE,
    VALID_CATEGORIES: Array.from(VALID_CATEGORIES),
};
