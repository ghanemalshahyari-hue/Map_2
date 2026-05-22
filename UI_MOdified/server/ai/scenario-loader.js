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

const DEFAULT_NAME  = 'wargame3';
// _active.json records whichever scenario was last imported or manually
// selected by the operator. Written on import; read on every list request
// so the HUD always boots into the most recently used scenario.
const ACTIVE_FILE   = path.join(SCENARIOS_DIR, '_active.json');
const cache = new Map();

function scenarioFile(name) {
    return path.join(SCENARIOS_DIR, name + '.json');
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

    cache.set(key, { __mtimeMs: mtimeMs, data });
    return data;
}

function getDefaultScenario() {
    return loadScenario(DEFAULT_NAME);
}

function listScenarios() {
    if (!fs.existsSync(SCENARIOS_DIR)) return [];
    return fs.readdirSync(SCENARIOS_DIR)
        .filter(f => f.endsWith('.json') && !f.startsWith('_'))
        .map(f => f.replace(/\.json$/, ''));
}

// Returns the name of the active (last-used) scenario.
// Falls back to the most-recently-modified scenario file, then DEFAULT_NAME.
function getActiveName() {
    try {
        if (fs.existsSync(ACTIVE_FILE)) {
            const d = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
            if (d && d.name && fs.existsSync(scenarioFile(d.name))) return d.name;
        }
    } catch (_) {}
    // Fallback: pick the most recently touched scenario file.
    try {
        const candidates = fs.readdirSync(SCENARIOS_DIR)
            .filter(f => f.endsWith('.json') && !f.startsWith('_'))
            .map(f => ({ name: f.replace(/\.json$/, ''), mtime: fs.statSync(path.join(SCENARIOS_DIR, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
        if (candidates.length) return candidates[0].name;
    } catch (_) {}
    return DEFAULT_NAME;
}

// Persists the active scenario name to _active.json.
function setActiveName(name) {
    try {
        if (!fs.existsSync(SCENARIOS_DIR)) fs.mkdirSync(SCENARIOS_DIR, { recursive: true });
        fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ name, updatedAt: new Date().toISOString() }), 'utf8');
    } catch (e) {
        console.warn('[scenario-loader] could not write _active.json:', e.message);
    }
}

function clearCache() {
    cache.clear();
}

module.exports = {
    loadScenario,
    getDefaultScenario,
    listScenarios,
    getActiveName,
    setActiveName,
    clearCache,
    DEFAULT_NAME,
    SCENARIOS_DIR,
};
