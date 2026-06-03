#!/usr/bin/env node
/**
 * test-edit-mode-slice2a.js
 *
 * Static (no server) verifier for Edit Mode Slice 2A — Geography.
 *
 * Loads UI_MOdified/client/shell/scenario-edit-mode.js into a minimal DOM
 * sandbox, then exercises the pure helpers exposed under
 * window.AppEditMode._testing and confirms the resulting draft validates
 * green against the real server-side validator at
 * UI_MOdified/server/ai/scenario-validator.js.
 *
 * Matches the project's other test-*.js convention. Run:
 *   node test-edit-mode-slice2a.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const SAMPLE_PATH    = path.join(ROOT, 'docs/cmo-functional-rules/sample-sahil-corridor.json');
const VALIDATOR_PATH = path.join(ROOT, 'UI_MOdified/server/ai/scenario-validator.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function deepEq(a, b, label) {
    ok(JSON.stringify(a) === JSON.stringify(b), label,
       'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

// ── Load the IIFE into a sandbox ─────────────────────────────────────────
// The module mounts onto window.AppEditMode. We give it a no-op DOM so the
// pure helpers under _testing become callable without rendering anything.
const sandboxWindow = { AppEditMode: null };
const stubDoc = {
    createElement: function () { return { setAttribute() {}, appendChild() {}, addEventListener() {}, style: {} }; },
    getElementById: function () { return null; },
    addEventListener: function () {}
};
const fnStub = function () {};
const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', src)(
    sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub
);

const T = sandboxWindow.AppEditMode && sandboxWindow.AppEditMode._testing;
ok(!!T, 'AppEditMode._testing exposed');
if (!T) { process.exit(1); }

// ── 1. fillGeographyDefaults fills missing keys, never clobbers authored ──
console.log('\n[1] fillGeographyDefaults — defaults');
{
    const d = {};
    T.fillGeographyDefaults(d);
    deepEq(d.map_bbox,              [0, 0, 0, 0],                  'map_bbox default');
    deepEq(d.ao_boundaries,         [],                             'ao_boundaries default empty');
    deepEq(d.obj,                   { name: '', coord: [0, 0],
                                       target_depth_km: 0, carver: 0,
                                       radius_km: 0 },              'obj default shape');
    deepEq(d.pipeline,              [],                             'pipeline default empty');
    deepEq(d.throughput_ceilings_km,
           { H12: 0, H24: 0, H48: 0, H72: 0, H120: 0 },              'throughput_ceilings_km default');
    deepEq(d.bls_template,          [],                             'bls_template default empty');
}

console.log('\n[1] fillGeographyDefaults — no clobber on authored values');
{
    const d = {
        map_bbox:               [18, 29, 20, 31],
        obj:                    { name: 'OBJ X', coord: [19, 30], carver: 6 },  // missing depth/radius
        pipeline:               [[18.5, 29.5], [19.5, 30.5]],
        throughput_ceilings_km: { H24: 18 },                                     // missing other keys
        bls_template:           [{ name: 'BLS-A', coord: [18.7, 30.1] }]
    };
    T.fillGeographyDefaults(d);
    deepEq(d.map_bbox,              [18, 29, 20, 31],         'authored map_bbox preserved');
    eq(d.obj.name,                  'OBJ X',                   'authored obj.name preserved');
    eq(d.obj.carver,                6,                         'authored obj.carver preserved');
    eq(d.obj.target_depth_km,       0,                         'missing obj.target_depth_km filled');
    eq(d.obj.radius_km,             0,                         'missing obj.radius_km filled');
    deepEq(d.pipeline,              [[18.5, 29.5], [19.5, 30.5]], 'authored pipeline preserved');
    eq(d.throughput_ceilings_km.H24, 18,                       'authored H24 preserved');
    eq(d.throughput_ceilings_km.H48, 0,                        'missing H48 filled');
    eq(d.bls_template.length,       1,                         'authored bls_template preserved');
}

// ── 2. validateDraftHardRules — obj.carver gate ──────────────────────────
console.log('\n[2] validateDraftHardRules — obj.carver');
{
    eq(T.validateDraftHardRules({ obj: { carver: 6   } }).ok, true,  'carver=6 accepted');
    eq(T.validateDraftHardRules({ obj: { carver: 0   } }).ok, true,  'carver=0 accepted');
    eq(T.validateDraftHardRules({ obj: { carver: 60  } }).ok, true,  'carver=60 accepted');
    eq(T.validateDraftHardRules({ obj: { carver: 61  } }).ok, false, 'carver=61 rejected');
    eq(T.validateDraftHardRules({ obj: { carver: -1  } }).ok, false, 'carver=-1 rejected');
    eq(T.validateDraftHardRules({ obj: { carver: 75  } }).ok, false, 'carver=75 rejected');
    eq(T.validateDraftHardRules({ obj: { carver: 6.5 } }).ok, false, 'carver=6.5 rejected (non-integer)');
    eq(T.validateDraftHardRules({ obj: {} }).ok,              true,  'no carver accepted (validator only fires when present)');
}

// ── 3. makeMapBboxAoPolygon — Use map_bbox as AO ─────────────────────────
console.log('\n[3] makeMapBboxAoPolygon — 4-corner closed polygon');
{
    const poly = T.makeMapBboxAoPolygon([18.0, 29.8, 19.8, 30.9]);
    ok(!!poly, 'polygon returned');
    eq(poly.name, 'AO', 'polygon name "AO"');
    ok(Array.isArray(poly.coordinates) && poly.coordinates.length === 1, 'one ring (Polygon shape)');
    const ring = poly.coordinates[0];
    eq(ring.length, 5, 'ring has 5 points (4 corners + closing repeat)');
    deepEq(ring[0], [18.0, 29.8], 'ring[0] = bbox SW');
    deepEq(ring[1], [19.8, 29.8], 'ring[1] = bbox SE');
    deepEq(ring[2], [19.8, 30.9], 'ring[2] = bbox NE');
    deepEq(ring[3], [18.0, 30.9], 'ring[3] = bbox NW');
    deepEq(ring[4], [18.0, 29.8], 'ring[4] closes back to SW');

    ok(T.makeMapBboxAoPolygon(null)  === null, 'null bbox → null');
    ok(T.makeMapBboxAoPolygon([1,2]) === null, 'short bbox → null');
    ok(T.makeMapBboxAoPolygon([NaN, 0, 1, 1]) === null, 'NaN bbox → null');
}

// ── 4. parseCoordLines / coordsToLines — pipeline order preserved ────────
console.log('\n[4] parseCoordLines / coordsToLines — order + add/remove');
{
    const initial = [[18.70, 30.20], [18.85, 30.24], [19.00, 30.30]];
    const lines   = T.coordsToLines(initial);
    deepEq(T.parseCoordLines(lines), initial, 'round-trip preserves order');

    // operator types extra waypoint at the end
    const extended = lines + '\n19.20, 30.45';
    deepEq(T.parseCoordLines(extended),
           [[18.70, 30.20], [18.85, 30.24], [19.00, 30.30], [19.20, 30.45]],
           'append at end preserves order');

    // operator removes the middle line
    const removedMiddle = '18.70, 30.20\n19.00, 30.30';
    deepEq(T.parseCoordLines(removedMiddle),
           [[18.70, 30.20], [19.00, 30.30]],
           'remove middle preserves remaining order');

    // bad lines are skipped, not fatal
    deepEq(T.parseCoordLines('18.0, 29.8\nnot a coord\n\n19.0, 30.0'),
           [[18.0, 29.8], [19.0, 30.0]],
           'bad/blank lines skipped');

    // accepts space- or tab-separated input
    deepEq(T.parseCoordLines('18.0 29.8\n19.0\t30.0'),
           [[18.0, 29.8], [19.0, 30.0]],
           'whitespace separators accepted');
}

// ── 5. AO outer-ring round-trip (Polygon shape the renderer expects) ─────
console.log('\n[5] aoExteriorRing / setAoExteriorRing');
{
    const ao = { name: 'AO', coordinates: [[]] };
    T.setAoExteriorRing(ao, [[18, 29], [19, 29], [19, 30], [18, 30], [18, 29]]);
    deepEq(ao.coordinates, [[[18, 29], [19, 29], [19, 30], [18, 30], [18, 29]]],
           'setAoExteriorRing wraps ring in [ring] for Polygon shape');
    deepEq(T.aoExteriorRing(ao), [[18, 29], [19, 29], [19, 30], [18, 30], [18, 29]],
           'aoExteriorRing reads outer ring back');

    const mp = { name: 'MP', type: 'MultiPolygon', coordinates: [[[]]] };
    T.setAoExteriorRing(mp, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
    deepEq(T.aoExteriorRing(mp), [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
           'MultiPolygon outer ring round-trips');
}

// ── 6. Real validator pass — Sahil sample + Slice 2A edits ───────────────
console.log('\n[6] real scenario-validator — sample after Slice 2A edits');
{
    const validator = require(VALIDATOR_PATH);
    const sample    = JSON.parse(fs.readFileSync(SAMPLE_PATH, 'utf8'));

    // 6a: untouched sample is already ok:true (baseline)
    const baseline = validator.validateScenario(sample);
    eq(baseline.ok, true, 'baseline Sahil sample validates ok:true');

    // 6b: simulate the "Edit mode → Geography" round-trip on the sample:
    //  - fill defaults (idempotent — sample already has them)
    //  - operator changes obj.carver 6 → 12
    //  - operator appends a pipeline waypoint via textarea round-trip
    //  - operator clicks "Use map_bbox as AO" — adds a 4-corner polygon
    const edited = JSON.parse(JSON.stringify(sample));
    T.fillGeographyDefaults(edited);
    edited.obj.carver = 12;
    edited.pipeline   = T.parseCoordLines(
        T.coordsToLines(edited.pipeline) + '\n19.22, 30.46'
    );
    edited.ao_boundaries.push(T.makeMapBboxAoPolygon(edited.map_bbox));
    eq(T.validateDraftHardRules(edited).ok, true, 'edited draft passes Slice 2A hard rules');
    const editedR = validator.validateScenario(edited);
    eq(editedR.ok, true, 'edited Sahil sample still validates ok:true');
    ok(editedR.errors.length === 0, 'no errors after Slice 2A edits');

    // 6c: carver out of range produces no schema error (validator floor is 0..60),
    //     but Slice 2A's client hard-rule rejects it client-side:
    const bad = JSON.parse(JSON.stringify(sample));
    bad.obj.carver = 75;
    eq(T.validateDraftHardRules(bad).ok, false, 'carver=75 blocked by Slice 2A hard rule');
    const badR = validator.validateScenario(bad);
    eq(badR.ok, false, 'carver=75 also rejected by server validator');
}

// ── Result ───────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
