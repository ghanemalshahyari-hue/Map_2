/**
 * Scenario loader.
 *
 * Reads + caches `data/scenarios/<name>.json` (emitted by
 * `scripts/port-wargame2.js`). One in-memory cache per process.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const scenarioValidator = require('./scenario-validator');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const SCENARIOS_DIR = path.join(DATA_DIR, 'scenarios');

const DEFAULT_NAME = 'wargame3';
const cache = new Map();

function scenarioFile(name) {
    return path.join(SCENARIOS_DIR, name + '.json');
}

// ── PR-1 (Operational Shell Foundation) ────────────────────────────
// Default per-side identity + posture matrix. Mutates the scenario
// in place when these keys are missing — disk JSON is NOT modified.
// Producers (Wargame3 porter, future in-app editor) may emit explicit
// `sides` / `postures` to override.
const DEFAULT_SIDES = Object.freeze([
    { id: 'BLUE',    name_en: 'Blue Force',  name_ar: 'القوات الزرقاء', color: '#3b82f6' },
    { id: 'RED',     name_en: 'Red Force',   name_ar: 'القوات الحمراء', color: '#ef4444' },
    { id: 'NEUTRAL', name_en: 'Neutral',     name_ar: 'محايد',           color: '#22c55e' },
]);

const DEFAULT_POSTURES = Object.freeze({
    BLUE:    { BLUE: 'FRIENDLY', RED: 'HOSTILE',  NEUTRAL: 'NEUTRAL'  },
    RED:     { BLUE: 'HOSTILE',  RED: 'FRIENDLY', NEUTRAL: 'NEUTRAL'  },
    NEUTRAL: { BLUE: 'NEUTRAL',  RED: 'NEUTRAL',  NEUTRAL: 'FRIENDLY' },
});

function enrichWithSidePostureDefaults(data) {
    if (!data || typeof data !== 'object') return data;
    if (!Array.isArray(data.sides) || data.sides.length === 0) {
        // Deep clone so a producer that later edits scenario.sides doesn't
        // mutate the shared DEFAULT_SIDES constant.
        data.sides = DEFAULT_SIDES.map(s => ({ ...s }));
    }
    if (!data.postures || typeof data.postures !== 'object' || Array.isArray(data.postures)) {
        data.postures = JSON.parse(JSON.stringify(DEFAULT_POSTURES));
    }
    return data;
}

function loadScenario(name) {
    const key = name || DEFAULT_NAME;
    const file = scenarioFile(key);
    if (!fs.existsSync(file)) {
        throw new Error(`scenario not found: ${file} (run scripts/port-wargame2.js)`);
    }
    // mtime-based cache invalidation so re-running port-wargame2.js takes
    // effect without restarting the server.
    const mtimeMs = fs.statSync(file).mtimeMs;
    const cached = cache.get(key);
    if (cached && cached.__mtimeMs === mtimeMs) return cached.data;

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Full schema validation — replaces the old hardcoded `steps.length === 12`
    // check with parametric range enforcement (4-20 steps) plus shape checks on
    // every required field. Bad scenarios fail fast here with a structured
    // error path instead of crashing later in the adjudicator/map/validator.
    const result = scenarioValidator.validateScenario(data);
    if (!result.ok) {
        const err = new Error(
            `scenario "${key}" failed validation (${result.errors.length} error(s)):\n` +
            scenarioValidator.formatErrors(result.errors)
        );
        err.scenarioName       = key;
        err.scenarioErrors     = result.errors;
        err.scenarioWarnings   = result.warnings;
        err.scenarioSummary    = result.summary;
        throw err;
    }
    if (result.warnings.length) {
        console.warn(
            `[scenario-loader] "${key}" loaded with ${result.warnings.length} warning(s):\n` +
            scenarioValidator.formatErrors(result.warnings)
        );
    }

    // PR-1: in-memory enrichment — every scenario downstream sees sides/postures.
    enrichWithSidePostureDefaults(data);

    cache.set(key, { __mtimeMs: mtimeMs, data });
    return data;
}

function getDefaultScenario() {
    return loadScenario(DEFAULT_NAME);
}

function listScenarios() {
    if (!fs.existsSync(SCENARIOS_DIR)) return [];
    return fs.readdirSync(SCENARIOS_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace(/\.json$/, ''));
}

function clearCache() {
    cache.clear();
}

module.exports = {
    loadScenario,
    getDefaultScenario,
    listScenarios,
    clearCache,
    enrichWithSidePostureDefaults,   // exported for unit tests
    DEFAULT_SIDES,
    DEFAULT_POSTURES,
    DEFAULT_NAME,
    SCENARIOS_DIR,
};
