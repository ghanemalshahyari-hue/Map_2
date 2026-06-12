#!/usr/bin/env node
/*
 * GIS-TERRAIN-1 / T-4A-L - live placement endpoint terrain opt-in.
 *
 * Covers only the bridge:
 *   - default /api/wargame-sim/placement response has no candidate.terrain
 *   - body includeTerrain:true adds server-side terrain context
 *   - query ?includeTerrain=1 also opts in
 *   - missing DEM still returns 200 with structured warnings
 *   - candidate placement fields stay unchanged after stripping terrain
 *   - no final placement mutation or accept/reject surface appears
 *
 * Run: node test-placement-endpoint-terrain-t4al.js
 */
'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const { spawnSync } = require('child_process');

const bridge = require(path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge.js'));

let passed = 0, failed = 0;
function test(name, fn) {
    Promise.resolve()
        .then(fn)
        .then(() => { console.log('  [PASS] ' + name); passed++; })
        .catch((e) => { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function snap(o) { return JSON.stringify(o); }

function callPlacement(urlPath, body) {
    return new Promise((resolve, reject) => {
        const req = new EventEmitter();
        req.method = 'POST';
        const res = {};
        const url = new URL(urlPath, 'http://127.0.0.1');
        const ctx = {
            url,
            pathname: url.pathname,
            method: 'POST',
            sendJson: function (_res, status, payload) { resolve({ status, body: payload }); },
        };
        const handled = bridge.handle(req, res, ctx);
        if (!handled) return reject(new Error('route was not handled'));
        process.nextTick(() => {
            req.emit('data', Buffer.from(JSON.stringify(body || {}), 'utf8'));
            req.emit('end');
        });
    });
}

function comparableCandidate(c) {
    const copy = JSON.parse(snap(c));
    delete copy.terrain;
    return copy;
}

async function run() {
    console.log('\nT-4A-L - placement endpoint terrain opt-in\n');

    const baseBody = { mentions: ['Bandar Abbas base', 'Chah Bahar base'] };

    await (async () => {
        const r = await callPlacement('/api/wargame-sim/placement', baseBody);
        assert(r.status === 200 && r.body && r.body.ok === true, 'default endpoint must return 200 ok');
        assert(r.body.placement_candidates.length >= 2, 'expected Bandar Abbas and Chah Bahar candidates');
        assert(r.body.placement_candidates.every(c => !('terrain' in c)), 'default candidates must not carry terrain');
    })().then(() => { console.log('  [PASS] default endpoint has no terrain block'); passed++; })
        .catch(e => { console.log('  [FAIL] default endpoint has no terrain block: ' + e.message); failed++; });

    await (async () => {
        const r = await callPlacement('/api/wargame-sim/placement', Object.assign({}, baseBody, { includeTerrain: true }));
        assert(r.status === 200 && r.body.ok === true, 'includeTerrain body must return 200 ok');
        const withCoords = r.body.placement_candidates.filter(c => c.lat != null && c.lon != null);
        assert(withCoords.length >= 2, 'expected coordinate candidates');
        withCoords.forEach(c => {
            assert(c.terrain, 'candidate missing terrain: ' + c.mention);
            assert(typeof c.terrain.terrain_available === 'boolean', 'terrain_available flag');
            assert(Array.isArray(c.terrain.warnings), 'terrain warnings array');
            assert(c.terrain.needs_review === true, 'terrain block remains review-only');
        });
    })().then(() => { console.log('  [PASS] includeTerrain true adds terrain block'); passed++; })
        .catch(e => { console.log('  [FAIL] includeTerrain true adds terrain block: ' + e.message); failed++; });

    await (async () => {
        const r = await callPlacement('/api/wargame-sim/placement?includeTerrain=1', baseBody);
        assert(r.status === 200 && r.body.ok === true, 'query includeTerrain=1 must return 200 ok');
        assert(r.body.placement_candidates.some(c => c.terrain), 'query opt-in should attach terrain');
    })().then(() => { console.log('  [PASS] query includeTerrain=1 opts in'); passed++; })
        .catch(e => { console.log('  [FAIL] query includeTerrain=1 opts in: ' + e.message); failed++; });

    await (async () => {
        const off = await callPlacement('/api/wargame-sim/placement', baseBody);
        const on = await callPlacement('/api/wargame-sim/placement', Object.assign({}, baseBody, { includeTerrain: true }));
        const offCandidates = off.body.placement_candidates;
        const onCandidates = on.body.placement_candidates;
        assert(offCandidates.length === onCandidates.length, 'candidate count unchanged');
        for (let i = 0; i < offCandidates.length; i++) {
            assert(snap(comparableCandidate(onCandidates[i])) === snap(offCandidates[i]),
                'candidate fields changed at index ' + i);
            assert(onCandidates[i].needs_review === true, 'candidate must remain needs_review');
            assert(onCandidates[i].exact_unit_position === false, 'exact_unit_position must remain false');
            assert(!('final_placement' in onCandidates[i]), 'no final placement field');
            assert(!('accepted' in onCandidates[i]) && !('rejected' in onCandidates[i]), 'no accept/reject mutation fields');
        }
    })().then(() => { console.log('  [PASS] candidate placement fields unchanged; no final placement mutation'); passed++; })
        .catch(e => { console.log('  [FAIL] candidate placement fields unchanged; no final placement mutation: ' + e.message); failed++; });

    await (async () => {
        const script = `
const { EventEmitter } = require('events');
const bridge = require(${JSON.stringify(path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge.js'))});
function call() {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    const url = new URL('/api/wargame-sim/placement', 'http://127.0.0.1');
    const ctx = { url, pathname: url.pathname, method: 'POST',
      sendJson: (_res, status, body) => resolve({ status, body }) };
    if (!bridge.handle(req, {}, ctx)) reject(new Error('not handled'));
    process.nextTick(() => { req.emit('data', Buffer.from(JSON.stringify({ mentions: ['27.15, 56.2167'], includeTerrain: true }))); req.emit('end'); });
  });
}
call().then(r => console.log(JSON.stringify(r))).catch(e => { console.error(e.stack || e.message); process.exit(1); });
`;
        const r = spawnSync(process.execPath, ['-e', script], {
            env: Object.assign({}, process.env, { DEM_PATH: path.join(__dirname, '__missing_endpoint_dem__.tif') }),
            encoding: 'utf8',
            timeout: 30000,
        });
        assert(r.status === 0, 'child process failed: ' + (r.stderr || '').slice(0, 300));
        const out = JSON.parse(r.stdout.trim().split('\n').pop());
        assert(out.status === 200 && out.body.ok === true, 'missing DEM endpoint must still return 200 ok');
        const t = out.body.placement_candidates[0] && out.body.placement_candidates[0].terrain;
        assert(t && t.terrain_available === false, 'terrain_available:false expected');
        assert(t.warnings.indexOf('dem_not_configured') !== -1 || t.warnings.indexOf('no_terrain_data') !== -1,
            'structured DEM warning expected');
    })().then(() => { console.log('  [PASS] DEM missing returns structured warning'); passed++; })
        .catch(e => { console.log('  [FAIL] DEM missing returns structured warning: ' + e.message); failed++; });

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}

run();
