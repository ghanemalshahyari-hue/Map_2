/**
 * Scenario loader.
 *
 * Reads + caches `data/scenarios/<name>.json` (emitted by
 * `scripts/port-wargame2.js`). One in-memory cache per process.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const SCENARIOS_DIR = path.join(DATA_DIR, 'scenarios');

const DEFAULT_NAME = 'wargame2-brega';
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
    if (!Array.isArray(data.steps) || data.steps.length !== 12) {
        throw new Error(`scenario ${key}: expected steps[12], got ${data.steps && data.steps.length}`);
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
    DEFAULT_NAME,
    SCENARIOS_DIR,
};
