#!/usr/bin/env node
/* test-placement-terrain-t4av.js — GIS-TERRAIN-1 / T-4A-V static checks.
 * Render-only terrain context inside the placement candidates panel.
 *
 * Uses REAL T-4A output (location-intelligence resolveMention with
 * includeTerrain:true → Bandar Abbas / explicit-coord candidates carrying
 * candidate.terrain) rendered through the REAL panel under a window stub.
 *
 * Proves: terrain section renders (advisory-only label, availability,
 * elevation, terrain confidence, warnings, needs_review, source.type);
 * candidates WITHOUT terrain render exactly as before (no terrain markers);
 * terrain_available:false shows a warning chip, not an error; rendering
 * never mutates candidate data; no Accept/Reject controls appear.
 *
 * Run:  node test-placement-terrain-t4av.js
 */
'use strict';
var path = require('path');

global.window = {};
require(path.join(__dirname, 'UI_MOdified/client/shell/placement-candidates-panel.js'));
var Panel = global.window.RmoozPlacementPanel;
var LI  = require(path.join(__dirname, 'UI_MOdified/server/ai/location-intelligence.js'));
var dem = require(path.join(__dirname, 'UI_MOdified/server/dem-service.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label); }
}
function renderHtml(cands) {
    var mount = { innerHTML: '' };
    Panel.render(mount, { placement: { placement_candidates: cands, missing_information: [], conflicts: [] } });
    return mount.innerHTML;
}
var snap = function (o) { return JSON.stringify(o); };

var DEM_PRESENT = dem.isAvailable();
console.log('T-4A-V — terrain context in placement candidates panel (render-only)');
console.log('DEM on this machine: ' + (DEM_PRESENT ? 'PRESENT' : 'ABSENT — unavailable-path renders live') + '\n');

/* ── real T-4A candidates ───────────────────────────────────────────── */
var withTerrain = LI.resolveMention('قاعدة بندر عباس', { includeTerrain: true })[0];
var chabahar    = LI.resolveMention('قاعدة شاه بهار', { includeTerrain: true })[0];
var noTerrain   = LI.resolveMention('قاعدة بندر عباس')[0];                       // default off

ok('fixture sanity: T-4A candidate carries terrain; default-off does not',
   !!withTerrain.terrain && !('terrain' in noTerrain));

/* ── terrain section renders with all required fields ───────────────── */
var beforeSnap = snap(withTerrain);
var html = renderHtml([withTerrain, chabahar]);

ok('terrain section header renders (Terrain context — سياق التضاريس)',
   /Terrain context/.test(html) && /سياق التضاريس/.test(html));
ok('advisory-only label renders (Advisory only — للاستئناس فقط)',
   /Advisory only/.test(html) && /للاستئناس فقط/.test(html));
ok('terrain confidence label renders (ثقة بيانات التضاريس)',
   /Terrain confidence/.test(html) && /ثقة بيانات التضاريس/.test(html));
ok('terrain source.type renders', new RegExp('source: ' + withTerrain.terrain.source.type).test(html));
ok('terrain needs_review badge renders inside the terrain section',
   (html.match(/needs review — مراجعة/g) || []).length >= 3);   // 2 candidate badges + ≥1 terrain badge

if (DEM_PRESENT) {
    ok('elevation renders when terrain available (Elevation — الارتفاع)',
       /Elevation — الارتفاع/.test(html) && / m</.test(html));
} else {
    ok('terrain_available:false renders WARNING chip, not an error',
       /Terrain unavailable — بيانات التضاريس غير متوفرة/.test(html) && !/error/i.test(html));
    ok('structured DEM warnings render with friendly labels',
       /DEM not configured|no terrain data/.test(html) && /تحذيرات/.test(html));
}

/* ── rule 1: candidates without terrain render exactly as before ───── */
var htmlPlain = renderHtml([noTerrain]);
ok('no terrain markers when candidate.terrain is missing',
   !/Terrain context/.test(htmlPlain) && !/سياق التضاريس/.test(htmlPlain) && !/للاستئناس/.test(htmlPlain));
ok('existing card content still renders for terrain-less candidate',
   /Bandar Abbas|بندر عباس/.test(htmlPlain) && /Known base/.test(htmlPlain) && /needs review/.test(htmlPlain));

/* ── rule 3/6: read-only — no mutation, no controls ─────────────────── */
ok('rendering does not mutate candidate data', snap(withTerrain) === beforeSnap);
ok('exact_unit_position stays false and visibly "no"',
   withTerrain.exact_unit_position === false && /exact unit position: <b[^>]*>no/.test(html));
ok('no Accept/Reject controls anywhere', !/<button/i.test(html) && !/Accept|Reject|اعتماد|رفض/.test(html));

/* ── synthetic edge: available terrain block renders elevation line ── */
var synth = JSON.parse(snap(noTerrain));
synth.terrain = { terrain_available: true, elevation_m: 123.4, confidence: 'high',
                  warnings: [], source: { type: 'terrain_layer' }, needs_review: true };
var htmlSynth = renderHtml([synth]);
ok('available block: elevation + value render', /Elevation — الارتفاع/.test(htmlSynth) && /123\.4 m/.test(htmlSynth));
ok('available block: no unavailable chip', !/Terrain unavailable/.test(htmlSynth));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
