#!/usr/bin/env node
/**
 * test-edit-mode-map-placement-1.js
 *
 * Static (no server) verifier for Edit Mode map-click unit placement —
 * window.AppEditMode.placeUnitFromMap(sidc, lng, lat, opts).
 *
 * Context: app.js's symbol-tool click handler has always guarded a call to
 * AppEditMode.placeUnitFromMap, but the method never existed — so in Scenario
 * Edit Mode a symbol placed on the map silently fell through to a normal
 * operator-layer marker instead of becoming a draft unit.
 *
 * This test locks in the now-wired behavior AND the owner multi-role review's
 * P0 correctness invariants (corrupting canonical scenario data must be
 * impossible):
 *   1. EXPLICIT affiliation mapping — friend/assumed-friend -> blue,
 *      suspect/hostile -> red; pending/unknown/neutral/malformed -> ambiguous
 *      and NEVER silently coerced to a side.
 *   2. A unit only links to a REAL same-side base; no synthetic/dangling
 *      base_id is ever created — placement is rejected when no base exists.
 *   3. Invalid coordinates create nothing.
 *   4. Off-mode returns false so the caller falls back to a normal marker.
 *   5. The resulting draft still validates against the forces hard-rules.
 *
 * Loads UI_MOdified/client/shell/scenario-edit-mode.js into a minimal DOM
 * sandbox (same pattern as test-edit-mode-slice2b.js). Run:
 *   node test-edit-mode-map-placement-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Load the IIFE into a sandbox (same pattern as slice 2A/2B tests) ──────
const sandboxWindow = { AppEditMode: null };
const stubDoc = {
    createElement: function () { return { setAttribute() {}, appendChild() {}, addEventListener() {}, style: {} }; },
    getElementById: function () { return null; },   // renderEditor()/setStatus() see no host → early return
    addEventListener: function () {},
    removeEventListener: function () {}
};
const fnStub = function () {};
const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
// eslint-disable-next-line no-new-func
new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', src)(
    sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub
);

const API = sandboxWindow.AppEditMode;
const T   = API && API._testing;
ok(!!API, 'AppEditMode exposed');
ok(typeof API.placeUnitFromMap === 'function', 'placeUnitFromMap exposed on public API');
ok(!!T, 'AppEditMode._testing exposed');
if (!API || !T) { console.log('\nFAIL — module did not load'); process.exit(1); }
ok(typeof T.sidcSide === 'function', 'sidcSide exposed');
ok(typeof T.resolvePlacementSide === 'function', 'resolvePlacementSide exposed');
ok(typeof T.nearestBaseName === 'function', 'nearestBaseName exposed');
ok(typeof T._setOnForTest === 'function', '_setOnForTest exposed');

// Build a canonical 20-digit 2525D/APP-6 SIDC whose standard-identity digit
// sits at index 3 (the layout generateSIDC/buildMiniSymbolHtml use). e.g.
// sidcId('6') === '10061000001211000000' (the app's own "hostile" SIDC).
function sidcId(id) { return '100' + id + '1000001211000000'; }
const SIDC = {
    PENDING:        sidcId('0'),
    UNKNOWN:        sidcId('1'),
    ASSUMED_FRIEND: sidcId('2'),
    FRIEND:         sidcId('3'),
    NEUTRAL:        sidcId('4'),
    SUSPECT:        sidcId('5'),
    HOSTILE:        sidcId('6')
};

// ── 0. sanity: our SIDC builder puts the identity digit at index 3 ───────
console.log('\n[0] SIDC builder places identity at index 3');
{
    eq(SIDC.HOSTILE.charAt(3), '6', 'HOSTILE identity digit at index 3');
    eq(SIDC.FRIEND.charAt(3),  '3', 'FRIEND identity digit at index 3');
    eq(SIDC.HOSTILE.length, 20, 'SIDC is 20 chars');
}

// ── 1. explicit affiliation → side mapping (every supported code) ─────────
console.log('\n[1] sidcSide — explicit mapping for every affiliation code');
{
    eq(T.sidcSide(SIDC.FRIEND),         'blue',      'friend (3) → blue');
    eq(T.sidcSide(SIDC.ASSUMED_FRIEND), 'blue',      'assumed friend (2) → blue');
    eq(T.sidcSide(SIDC.HOSTILE),        'red',       'hostile (6) → red');
    eq(T.sidcSide(SIDC.SUSPECT),        'red',       'suspect (5) → red');
    eq(T.sidcSide(SIDC.PENDING),        'ambiguous', 'pending (0) → ambiguous');
    eq(T.sidcSide(SIDC.UNKNOWN),        'ambiguous', 'unknown (1) → ambiguous');
    eq(T.sidcSide(SIDC.NEUTRAL),        'ambiguous', 'neutral (4) → ambiguous (NOT blue)');
}

// ── 2. malformed SIDCs → ambiguous (never a silent side) ─────────────────
console.log('\n[2] sidcSide — malformed SIDCs are ambiguous');
{
    eq(T.sidcSide(''),        'ambiguous', 'empty string → ambiguous');
    eq(T.sidcSide(null),      'ambiguous', 'null → ambiguous');
    eq(T.sidcSide(undefined), 'ambiguous', 'undefined → ambiguous');
    eq(T.sidcSide('10'),      'ambiguous', 'too-short → ambiguous');
    eq(T.sidcSide('10X3'),    'ambiguous', 'short malformed (<10 chars) → ambiguous');
    eq(T.sidcSide('1009000001211000000'), 'ambiguous', 'unexpected identity digit (9) → ambiguous');
    eq(T.sidcSide(12345),     'ambiguous', 'non-string number → ambiguous');
}

// A fresh draft with two RED bases + one BLUE base at known coords.
function freshDraft() {
    return {
        name: 'map-place-test',
        bls_template: [
            { name: 'BLS-RED-N',  side: 'RED',  coord: [10, 10] },
            { name: 'BLS-RED-S',  side: 'RED',  coord: [10,  0] },
            { name: 'BLS-BLUE-E', side: 'BLUE', coord: [20, 20] }
        ],
        red_units: [],
        blue_units_initial: []
    };
}
function setUp(draft) { T._setOnForTest(true); T._setDraftForTest(draft || freshDraft()); }

// ── 3. hostile placement → red_units, nearest RED base, coord from click ──
console.log('\n[3] placeUnitFromMap — hostile symbol');
{
    setUp();
    const res = API.placeUnitFromMap(SIDC.HOSTILE, 10, 9); // near BLS-RED-N [10,10]
    eq(res && res.ok, true, 'result ok:true');
    eq(res && res.side, 'red', 'side red');
    const d = API.getDraft();
    eq(d.red_units.length, 1, 'one red unit added');
    eq(d.blue_units_initial.length, 0, 'no blue unit added');
    const u = d.red_units[0];
    eq(u.uid, 'RED-1', 'red uid assigned');
    eq(u.coord[0], 10, 'coord lon from click');
    eq(u.coord[1], 9,  'coord lat from click');
    eq(u.bls, 'BLS-RED-N', 'auto-linked to NEAREST red base (not the far one)');
    eq(u.role, 'Main effort', 'default role');
    eq(u.strength, 1, 'default strength');
    eq(u.sidc, SIDC.HOSTILE, 'sidc stored for symbol rendering');
    eq(u.appear, 0, 'appears at step 0');
}

// ── 4. friendly placement → blue_units_initial, nearest BLUE base ─────────
console.log('\n[4] placeUnitFromMap — friendly symbol');
{
    setUp();
    const res = API.placeUnitFromMap(SIDC.FRIEND, 21, 21); // near BLS-BLUE-E [20,20]
    eq(res && res.ok, true, 'result ok:true');
    eq(res && res.side, 'blue', 'side blue');
    const d = API.getDraft();
    eq(d.blue_units_initial.length, 1, 'one blue unit added');
    eq(d.red_units.length, 0, 'no red unit added');
    const u = d.blue_units_initial[0];
    eq(u.unit_uid, 'BLUE-1', 'blue unit_uid assigned');
    eq(u.base_id, 'BLS-BLUE-E', 'auto-linked to nearest BLUE base');
    eq(u.sidc, SIDC.FRIEND, 'sidc stored');
}

// ── 5. AMBIGUOUS affiliation → nothing created, never coerced to blue ────
console.log('\n[5] ambiguous affiliation is rejected, not silently placed');
{
    [SIDC.PENDING, SIDC.UNKNOWN, SIDC.NEUTRAL, '', 'junk'].forEach((s, i) => {
        setUp();
        const res = API.placeUnitFromMap(s, 21, 21); // sits on the BLUE base — must still NOT create
        eq(res && res.ok, false, 'ambiguous SIDC #' + i + ' rejected (ok:false)');
        ok(res && res.ambiguous === true, 'ambiguous SIDC #' + i + ' flagged ambiguous');
        const d = API.getDraft();
        eq(d.blue_units_initial.length, 0, 'ambiguous SIDC #' + i + ' created no blue unit');
        eq(d.red_units.length, 0, 'ambiguous SIDC #' + i + ' created no red unit');
    });
}

// ── 6. explicit opts.side resolves an otherwise-ambiguous affiliation ────
console.log('\n[6] explicit side choice overrides ambiguity');
{
    setUp();
    const res = API.placeUnitFromMap(SIDC.NEUTRAL, 21, 21, { side: 'blue' });
    eq(res && res.ok, true, 'neutral + explicit blue → placed');
    eq(API.getDraft().blue_units_initial.length, 1, 'blue unit created via explicit choice');

    setUp();
    const res2 = API.placeUnitFromMap(SIDC.PENDING, 10, 9, { side: 'red' });
    eq(res2 && res2.ok, true, 'pending + explicit red → placed');
    eq(API.getDraft().red_units.length, 1, 'red unit created via explicit choice');
}

// ── 7. NO same-side base → rejected, no synthetic/dangling base_id ───────
console.log('\n[7] no same-side base → rejected (no dangling base_id)');
{
    // Friendly click with no BLUE base present.
    const noBlue = freshDraft();
    noBlue.bls_template = noBlue.bls_template.filter(b => b.side !== 'BLUE');
    setUp(noBlue);
    const res = API.placeUnitFromMap(SIDC.FRIEND, 5, 5);
    eq(res && res.ok, false, 'friendly with no BLUE base rejected');
    ok(res && res.needsBase === true, 'flagged needsBase');
    eq(res && res.side, 'blue', 'reports the side that needs a base');
    eq(API.getDraft().blue_units_initial.length, 0, 'no blue unit created');

    // Hostile click with no RED base present.
    const noRed = freshDraft();
    noRed.bls_template = noRed.bls_template.filter(b => b.side !== 'RED');
    setUp(noRed);
    const res2 = API.placeUnitFromMap(SIDC.HOSTILE, 5, 5);
    eq(res2 && res2.ok, false, 'hostile with no RED base rejected');
    eq(API.getDraft().red_units.length, 0, 'no red unit created');

    // Entirely empty base list → still rejected, still nothing created.
    const empty = freshDraft(); empty.bls_template = [];
    setUp(empty);
    eq((API.placeUnitFromMap(SIDC.HOSTILE, 1, 1) || {}).ok, false, 'no bases at all → rejected');
    eq(API.getDraft().red_units.length, 0, 'empty-base draft creates nothing');
}

// ── 8. invalid coordinates → nothing created ─────────────────────────────
console.log('\n[8] invalid coordinates create nothing');
{
    const bad = [
        ['NaN lon', NaN, 10], ['NaN lat', 10, NaN],
        ['Infinity', Infinity, 10], ['lon > 180', 200, 10],
        ['lon < -180', -200, 10], ['lat > 90', 10, 95], ['lat < -90', 10, -95],
        ['string lon', 'abc', 10], ['null lat', 10, null]
    ];
    bad.forEach(([label, lo, la]) => {
        setUp();
        const res = API.placeUnitFromMap(SIDC.HOSTILE, lo, la);
        eq(res && res.ok, false, 'invalid coord (' + label + ') rejected');
        eq(res && res.reason, 'invalid_coord', 'invalid coord (' + label + ') reason');
        eq(API.getDraft().red_units.length, 0, 'invalid coord (' + label + ') creates nothing');
    });
    // A valid boundary coordinate IS accepted.
    setUp();
    const okRes = API.placeUnitFromMap(SIDC.HOSTILE, 10, 10); // exactly on BLS-RED-N
    eq(okRes && okRes.ok, true, 'valid coord on a base accepted');
}

// ── 9. nearestBaseName side isolation ────────────────────────────────────
console.log('\n[9] nearestBaseName side isolation');
{
    T._setDraftForTest(freshDraft());
    eq(T.nearestBaseName([20, 20], 'RED'),   'BLS-RED-N',  'RED query ignores the BLUE base at that coord');
    eq(T.nearestBaseName([20, 20], 'BLUE'),  'BLS-BLUE-E', 'BLUE query finds the BLUE base');
    eq(T.nearestBaseName([10,  1], 'RED'),   'BLS-RED-S',  'RED query picks the nearer southern base');
    eq(T.nearestBaseName([0,   0], 'NEUTRAL'), null,       'no matching-side base → null');
}

// ── 10. off-mode → false (caller falls back to a normal marker) ──────────
console.log('\n[10] placeUnitFromMap returns false when Edit Mode is off');
{
    T._setOnForTest(false);
    T._setDraftForTest(freshDraft());
    const r = API.placeUnitFromMap(SIDC.HOSTILE, 10, 10);
    eq(r, false, 'returns literal false when _on is false');
    eq(API.getDraft().red_units.length, 0, 'no unit added when edit mode is off');
}

// ── 11. placed units keep the draft valid against forces hard-rules ──────
console.log('\n[11] placed units keep the draft valid');
{
    setUp();
    API.placeUnitFromMap(SIDC.HOSTILE, 10, 9);   // RED-1 → BLS-RED-N
    API.placeUnitFromMap(SIDC.SUSPECT, 10, 1);   // RED-2 → BLS-RED-S
    API.placeUnitFromMap(SIDC.FRIEND, 21, 21);   // BLUE-1 → BLS-BLUE-E
    const d = API.getDraft();
    eq(d.red_units.length, 2, 'two red units placed');
    eq(d.blue_units_initial.length, 1, 'one blue unit placed');
    ok(d.red_units[0].uid !== d.red_units[1].uid, 'repeated placement yields unique red uids');
    const v = T.validateForcesHardRules(d);
    eq(v.ok, true, 'forces hard-rules pass for map-placed units', v.why);
}

// ── Result ───────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
