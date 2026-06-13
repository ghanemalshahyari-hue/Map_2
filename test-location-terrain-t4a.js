#!/usr/bin/env node
/**
 * GIS-TERRAIN-1 / T-4A — terrain context on Location Intelligence candidates.
 *
 * Proves the opt-in terrain enrichment is ADVISORY ONLY:
 *   • includeTerrain omitted/false ⇒ candidates carry NO terrain key
 *     (G-3B behavior unchanged; the terrain stack is lazy-loaded only on use).
 *   • includeTerrain:true ⇒ every candidate WITH lat/lon gains
 *     candidate.terrain { terrain_available, elevation_m, confidence,
 *     warnings, source, needs_review:true }.
 *   • candidates WITHOUT lat/lon don't crash and get no block.
 *   • missing DEM ⇒ terrain_available:false + structured warnings
 *     (dem_not_configured / no_terrain_data) — proven live when this box has
 *     no DEM AND via a forced-missing-DEM child process.
 *   • the input planning model is never mutated; candidate source metadata,
 *     confidence, lat/lon, placement_type stay untouched; nothing becomes a
 *     final placement (needs_review:true throughout).
 *
 * Run:  node test-location-terrain-t4a.js
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const LI  = require(path.join(__dirname, 'UI_MOdified/server/ai/location-intelligence.js'));
const PM  = require(path.join(__dirname, 'UI_MOdified/server/ai/planning-model.js'));
const dem = require(path.join(__dirname, 'UI_MOdified/server/dem-service.js'));

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  [PASS] ${name}`); passed++; }
    catch (e) { console.log(`  [FAIL] ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const snap = o => JSON.stringify(o);

const DEM_PRESENT = dem.isAvailable();
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  GIS-TERRAIN-1 / T-4A — location candidates + terrain context');
console.log('  DEM on this machine: ' + (DEM_PRESENT ? 'PRESENT' : 'ABSENT — degradation runs live'));
console.log('══════════════════════════════════════════════════════════════════\n');

/* ── default OFF: G-3B behavior unchanged ───────────────────────────── */
test('default (option omitted / false): no terrain key on any candidate', () => {
    const a = LI.resolveMention('قاعدة بندر عباس');
    const b = LI.resolveMention('27.15, 56.2167', { includeTerrain: false });
    [].concat(a, b).forEach(c => assert(!('terrain' in c), 'terrain key must be absent by default'));
    const model = LI.enrichPlanningModelLocations(PM.emptyPlanningModel(), { mentions: ['قاعدة بندر عباس'] });
    model.placement_candidates.forEach(c => assert(!('terrain' in c), 'enrich default must not attach terrain'));
    assert(model.placement_candidates.length > 0, 'sanity: candidates were produced');
});

/* ── opt-in: candidates with lat/lon gain the block ─────────────────── */
test('includeTerrain:true → lat/lon candidate gains complete terrain block', () => {
    const cands = LI.resolveMention('قاعدة بندر عباس', { includeTerrain: true });
    assert(cands.length === 1, 'one gazetteer candidate');
    const c = cands[0], t = c.terrain;
    assert(t, 'terrain block attached');
    assert(typeof t.terrain_available === 'boolean', 'terrain_available flag');
    assert('elevation_m' in t, 'elevation_m present');
    assert(typeof t.confidence === 'string', 'terrain confidence (separate field)');
    assert(Array.isArray(t.warnings), 'warnings array');
    assert(t.needs_review === true, 'needs_review on the block');
    assert(t.source && ['terrain_layer', 'gis_analysis'].indexOf(t.source.type) !== -1,
        'source.type terrain_layer/gis_analysis, got ' + (t.source && t.source.type));
    if (!DEM_PRESENT) {
        assert(t.terrain_available === false, 'terrain_available:false without DEM');
        assert(t.elevation_m === null, 'null elevation without DEM');
        assert(t.warnings.indexOf('dem_not_configured') !== -1 || t.warnings.indexOf('no_terrain_data') !== -1,
            'structured DEM warnings');
    }
});

test('advisory only: candidate fields untouched (confidence/lat/lon/type/source/review)', () => {
    const off = LI.resolveMention('قاعدة بندر عباس')[0];
    const on  = LI.resolveMention('قاعدة بندر عباس', { includeTerrain: true })[0];
    assert(on.confidence === off.confidence, 'candidate confidence unchanged');
    assert(on.lat === off.lat && on.lon === off.lon, 'lat/lon unchanged');
    assert(on.placement_type === off.placement_type, 'placement_type unchanged');
    assert(snap(on.source) === snap(off.source), 'candidate source metadata preserved');
    assert(on.needs_review === true && on.exact_unit_position === off.exact_unit_position,
        'no candidate becomes final placement');
    // strip terrain → identical candidate
    const onCopy = JSON.parse(snap(on)); delete onCopy.terrain;
    assert(snap(onCopy) === snap(off), 'with terrain removed, candidate is byte-identical to default');
});

test('candidate without lat/lon: no crash, no terrain block', () => {
    const cands = LI.resolveMention('قاعدة مجهولة الاسم', { includeTerrain: true });   // unknown place
    assert(cands.length === 1, 'one unresolved candidate');
    assert(cands[0].lat === null && cands[0].lon === null, 'no coords');
    assert(!('terrain' in cands[0]), 'no terrain block without coords');
    const mg = LI.resolveMention('grid 38SMB46123456', { includeTerrain: true });      // MGRS, unconverted
    assert(!('terrain' in mg[0]), 'mgrs candidate (no lat/lon) gets no block');
});

/* ── model-level enrich ─────────────────────────────────────────────── */
test('enrichPlanningModelLocations({includeTerrain:true}): blocks attached, input NOT mutated', () => {
    const input = PM.emptyPlanningModel();
    input.locations.push({ name: 'قاعدة شاه بهار', source: PM.makeSource({ type: 'uploaded_doc' }) });
    const inputSnap = snap(input);

    const model = LI.enrichPlanningModelLocations(input, {
        mentions: ['قاعدة بندر عباس', '29.74, 19.55'],
        includeTerrain: true,
    });
    assert(snap(input) === inputSnap, 'input planning model not mutated');

    const withCoords = model.placement_candidates.filter(c => c.lat != null && c.lon != null);
    assert(withCoords.length >= 3, 'expected ≥3 coordinate candidates (2 mentions + 1 model location), got ' + withCoords.length);
    withCoords.forEach(c => {
        assert(c.terrain, 'each coord candidate has terrain: ' + c.mention);
        assert(c.terrain.needs_review === true, 'block needs_review');
    });
    model.placement_candidates.filter(c => c.lat == null).forEach(c =>
        assert(!('terrain' in c), 'no-coord candidates carry no block'));
});

test('idempotent second pass: existing terrain blocks are kept, not rebuilt', () => {
    const m1 = LI.enrichPlanningModelLocations(PM.emptyPlanningModel(), { mentions: ['قاعدة بندر عباس'], includeTerrain: true });
    const marker = 'KEEP-ME';
    m1.placement_candidates[0].terrain.warnings.push(marker);
    const m2 = LI.enrichPlanningModelLocations(m1, { includeTerrain: true });          // no new mentions
    const kept = m2.placement_candidates[0];
    assert(kept.terrain.warnings.indexOf(marker) !== -1, 'pre-existing block survived (not overwritten)');
});

/* ── forced missing-DEM child (proves degradation on any machine) ───── */
test('forced-missing DEM: structured terrain_available:false + warnings (child proc)', () => {
    const li = path.join(__dirname, 'UI_MOdified/server/ai/location-intelligence.js').replace(/\\/g, '/');
    const script =
        "const LI=require('" + li + "');" +
        "const c=LI.resolveMention('27.15, 56.2167',{includeTerrain:true})[0];" +
        "console.log(JSON.stringify(c.terrain));";
    const r = spawnSync(process.execPath, ['-e', script], {
        env: Object.assign({}, process.env, { DEM_PATH: path.join(__dirname, '__no_dem_t4a__.tif') }),
        encoding: 'utf8', timeout: 30000,
    });
    assert(r.status === 0, 'child exit 0; stderr: ' + (r.stderr || '').slice(0, 300));
    const t = JSON.parse(r.stdout.trim().split('\n').pop());
    assert(t.terrain_available === false, 'terrain_available:false');
    assert(t.elevation_m === null, 'elevation null');
    assert(t.warnings.indexOf('dem_not_configured') !== -1, 'dem_not_configured warning');
    assert(t.warnings.indexOf('no_terrain_data') !== -1, 'no_terrain_data warning');
    assert(t.needs_review === true, 'needs_review:true');
});

/* ── direct helper sanity ───────────────────────────────────────────── */
test('terrainForCandidate: null without coords; block with coords', () => {
    assert(LI.terrainForCandidate(null) === null, 'null candidate → null');
    assert(LI.terrainForCandidate({ lat: null, lon: null }) === null, 'no coords → null');
    assert(LI.terrainForCandidate({ lat: 999, lon: 0 }) === null, 'invalid lat → null');
    const t = LI.terrainForCandidate({ lat: 31.2, lon: 16.6 });
    assert(t && typeof t.terrain_available === 'boolean' && t.needs_review === true, 'valid coords → block');
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
