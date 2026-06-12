'use strict';

// ── PR-247 Test Harness ──────────────────────────────────────────────────────
// Tests that _buildUnit accepts a stepIndex parameter, that adaptWargame3ToFixture
// embeds per-step unit locations (_stepUnitLocations) in each step record, and
// that buildScenarioStepPreview uses those per-step locations in unitsReferenced.
// No DOM. No Leaflet. No window.units. No window.lines. No storage. No fetch.

var fs   = require('fs');
var path = require('path');
var src  = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'),
    'utf8'
);

// ── Brace-matched function extractor ─────────────────────────────────────────
function extractFn(source, fnName) {
    var re  = new RegExp('function\\s+' + fnName + '\\s*\\(');
    var idx = source.search(re);
    if (idx === -1) { throw new Error('Cannot find function ' + fnName); }
    var start = source.indexOf('{', idx);
    var depth = 0; var i = start;
    while (i < source.length) {
        if (source[i] === '{')      { depth++; }
        else if (source[i] === '}') { depth--; }
        if (depth === 0)            { break; }
        i++;
    }
    return source.slice(idx, i + 1);
}

// ── Minimal window mock ───────────────────────────────────────────────────────
var window = {};

// ── Extract code blocks ───────────────────────────────────────────────────────
var w3aStart = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd   = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
if (w3aEnd === -1) { throw new Error('Cannot find PR-216 marker'); }
var w3aSrc = src.slice(w3aStart, w3aEnd);

var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var builderSrc = extractFn(src, 'buildScenarioStepPreview');
var harnSrc    = extractFn(src, 'previewWargame3Fixture');

// ── Build execution environment ───────────────────────────────────────────────
var combined = [
    w3aSrc,
    bsspSrc,
    builderSrc,
    harnSrc
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' buildScenarioStepPreview: buildScenarioStepPreview,' +
    ' adaptWargame3ToFixture: adaptWargame3ToFixture,' +
    ' previewWargame3Fixture: previewWargame3Fixture };'
);
var api = fn(window);

// ── Test fixture ──────────────────────────────────────────────────────────────
// 3 RED, 2 BLUE, 3 steps (indices 0–2).
// R-001 moves: step-0=[34.0,31.0], step-1=[34.2,31.2], step-2=[34.4,31.4]
// R-002 static: [35.0,32.0] at all steps
// R-003 off-map sentinel at steps 0–1 [18,32], deploys at step-2 [34.8,31.8]
// B-001 moves: step-0=[36.0,31.5], step-1=[36.3,31.5], step-2=[36.6,31.5]
// B-002 no coord table entry — falls back to unit.coord=[36.5,31.0]
var minW3 = {
    name: 'pr247-test',
    scenario_label: 'PR-247 Coordinate Test',
    ported_from: 'pr247-test',
    obj: { name: 'OBJ-ALPHA', coord: [35.5, 31.5] },
    red_unit_step_coords: {
        'R-001': [[34.0, 31.0], [34.2, 31.2], [34.4, 31.4]],
        'R-002': [[35.0, 32.0], [35.0, 32.0], [35.0, 32.0]],
        'R-003': [[18, 32], [18, 32], [34.8, 31.8]]
    },
    blue_unit_step_coords: {
        'B-001': [[36.0, 31.5], [36.3, 31.5], [36.6, 31.5]]
        // B-002 intentionally absent — tests fallback to unit.coord
    },
    red_units: [
        { uid: 'R-001', label: 'Red Alpha',   echelon: 'plt', role: 'INF', domain: 'LAND', coord: [33.9, 30.9] },
        { uid: 'R-002', label: 'Red Bravo',   echelon: 'plt', role: 'ARM', domain: 'LAND', coord: [35.0, 32.0] },
        { uid: 'R-003', label: 'Red Charlie', echelon: 'plt', role: 'INF', domain: 'LAND', coord: [18, 32] }
    ],
    blue_units_initial: [
        { unit_uid: 'B-001', label: 'Blue Alpha', echelon: 'plt', role: 'INF', domain: 'LAND', coord: [35.9, 31.4] },
        { unit_uid: 'B-002', label: 'Blue Bravo', echelon: 'plt', role: 'ARM', domain: 'LAND', coord: [36.5, 31.0] }
    ],
    steps: [
        {
            index: 0, phase: 'PHASE-1', time_label: 'H+00',
            narrative_en_fallback: 'Initial positioning.',
            actors: [
                { uid: 'R-001', action_what: 'Advance to LD', side: 'RED' },
                { uid: 'B-001', action_what: 'Hold sector',   side: 'BLUE' }
            ]
        },
        {
            index: 1, phase: 'PHASE-1', time_label: 'H+30',
            narrative_en_fallback: 'Advance to contact.',
            actors: [
                { uid: 'R-001', action_what: 'Fire for effect', side: 'RED' },
                { uid: 'B-001', action_what: 'Maneuver',        side: 'BLUE' }
            ]
        },
        {
            index: 2, phase: 'PHASE-2', time_label: 'H+60',
            narrative_en_fallback: 'Exploitation.',
            actors: [
                { uid: 'R-003', action_what: 'Deploy from reserve', side: 'RED' },
                { uid: 'B-001', action_what: 'Assault objective',   side: 'BLUE' }
            ]
        }
    ]
};

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Build fixture ─────────────────────────────────────────────────────────────
var adaptResult = api.adaptWargame3ToFixture(minW3);
var fixture     = adaptResult.fixture;
var steps       = fixture ? fixture.steps : [];

// ── Group A: Adapter passes and step record structure ─────────────────────────

// T01 — adapter passes
assert('T01 — adaptWargame3ToFixture passes',
    adaptResult.passed === true,
    JSON.stringify(adaptResult.blockedReasons)
);

// T02 — correct number of steps
assert('T02 — fixture.steps.length matches input step count',
    steps.length === minW3.steps.length,
    'got: ' + steps.length
);

// T03 — every step has _stepUnitLocations (plain object, not array)
var allHaveLocs = Array.isArray(steps) && steps.length > 0 &&
    steps.every(function (s) {
        return s &&
               typeof s._stepUnitLocations === 'object' &&
               s._stepUnitLocations !== null &&
               !Array.isArray(s._stepUnitLocations);
    });
assert('T03 — every step record has _stepUnitLocations (non-null object, not array)',
    allHaveLocs,
    'sample keys: ' + (steps[0] ? Object.keys(steps[0]).join(', ') : 'none')
);

// T04 — _stepUnitLocations at step-0 has expected unit keys
var s0locs = steps[0] ? steps[0]._stepUnitLocations : {};
assert('T04 — step-0 _stepUnitLocations includes R-001',
    typeof s0locs['R-001'] === 'object' && s0locs['R-001'] !== null,
    'keys: ' + Object.keys(s0locs).join(', ')
);

// T05 — _stepUnitLocations at step-1 has expected unit keys
var s1locs = steps[1] ? steps[1]._stepUnitLocations : {};
assert('T05 — step-1 _stepUnitLocations includes R-001',
    typeof s1locs['R-001'] === 'object' && s1locs['R-001'] !== null,
    'keys: ' + Object.keys(s1locs).join(', ')
);

// ── Group B: Per-step coordinate values in _stepUnitLocations ─────────────────

// T06 — step-0 R-001: [34.0, 31.0] GeoJSON → lat=31.0, lng=34.0
var r001s0 = s0locs['R-001'] || {};
assert('T06 — step-0 R-001 lat=31.0, lng=34.0 (coordTable[R-001][0])',
    r001s0.lat === 31.0 && r001s0.lng === 34.0,
    'lat=' + r001s0.lat + ', lng=' + r001s0.lng
);

// T07 — step-1 R-001: [34.2, 31.2] GeoJSON → lat=31.2, lng=34.2
var r001s1 = s1locs['R-001'] || {};
assert('T07 — step-1 R-001 lat=31.2, lng=34.2 (coordTable[R-001][1])',
    r001s1.lat === 31.2 && r001s1.lng === 34.2,
    'lat=' + r001s1.lat + ', lng=' + r001s1.lng
);

// T08 — step-0 and step-1 coords differ for R-001 (unit moved)
assert('T08 — step-0 and step-1 coords differ for R-001',
    r001s0.lat !== r001s1.lat || r001s0.lng !== r001s1.lng,
    's0=' + JSON.stringify(r001s0) + ' s1=' + JSON.stringify(r001s1)
);

// T09 — step-2 R-001: [34.4, 31.4] GeoJSON → lat=31.4, lng=34.4
var s2locs = steps[2] ? steps[2]._stepUnitLocations : {};
var r001s2 = s2locs['R-001'] || {};
assert('T09 — step-2 R-001 lat=31.4, lng=34.4 (coordTable[R-001][2])',
    r001s2.lat === 31.4 && r001s2.lng === 34.4,
    'lat=' + r001s2.lat + ', lng=' + r001s2.lng
);

// T10 — R-002 (static): same coords at all three steps
var r002s0 = s0locs['R-002'] || {};
var r002s1 = s1locs['R-002'] || {};
var r002s2 = s2locs['R-002'] || {};
assert('T10 — static R-002 same coords at steps 0, 1, 2',
    r002s0.lat === r002s1.lat && r002s0.lng === r002s1.lng &&
    r002s0.lat === r002s2.lat && r002s0.lng === r002s2.lng,
    's0=' + JSON.stringify(r002s0) + ' s1=' + JSON.stringify(r002s1)
);

// T11 — R-003 off-map sentinel at step-0: [18,32] is finite so _w3aLonLatToStartLoc
//        returns {lat:32, lng:18} (not null) — this is the existing sentinel behavior
var r003s0 = s0locs['R-003'] || null;
assert('T11 — step-0 R-003 lat=32, lng=18 (off-map sentinel coord is finite)',
    r003s0 !== null && r003s0.lat === 32 && r003s0.lng === 18,
    JSON.stringify(r003s0)
);

// T12 — R-003 deployed at step-2: [34.8, 31.8] GeoJSON → lat=31.8, lng=34.8
var r003s2 = s2locs['R-003'] || null;
assert('T12 — step-2 R-003 lat=31.8, lng=34.8 (deployed at step-2)',
    r003s2 !== null && r003s2.lat === 31.8 && r003s2.lng === 34.8,
    JSON.stringify(r003s2)
);

// T13 — B-001 step-0: [36.0, 31.5] GeoJSON → lat=31.5, lng=36.0
var b001s0 = s0locs['B-001'] || {};
assert('T13 — step-0 B-001 lat=31.5, lng=36.0 (blue coordTable[B-001][0])',
    b001s0.lat === 31.5 && b001s0.lng === 36.0,
    'lat=' + b001s0.lat + ', lng=' + b001s0.lng
);

// T14 — B-001 step-1: [36.3, 31.5] GeoJSON → lat=31.5, lng=36.3
var b001s1 = s1locs['B-001'] || {};
assert('T14 — step-1 B-001 lat=31.5, lng=36.3 (blue coordTable[B-001][1])',
    b001s1.lat === 31.5 && b001s1.lng === 36.3,
    'lat=' + b001s1.lat + ', lng=' + b001s1.lng
);

// T15 — B-002 (no step coord entry) falls back to unit.coord=[36.5, 31.0] → lat=31.0, lng=36.5
var b002s0 = s0locs['B-002'] || null;
assert('T15 — B-002 with no step coord falls back to unit.coord (lat=31.0, lng=36.5)',
    b002s0 !== null && b002s0.lat === 31.0 && b002s0.lng === 36.5,
    JSON.stringify(b002s0)
);

// T16 — fixture.units catalog still uses step-0 coords for R-001 (backward compat)
var fixtureR001 = (fixture ? fixture.units : []).filter(function (u) { return u.uid === 'R-001'; })[0] || null;
assert('T16 — fixture.units R-001.startLocation is step-0 (lat=31.0, lng=34.0)',
    fixtureR001 !== null &&
    fixtureR001.startLocation !== null &&
    fixtureR001.startLocation.lat === 31.0 &&
    fixtureR001.startLocation.lng === 34.0,
    fixtureR001 ? JSON.stringify(fixtureR001.startLocation) : 'null'
);

// ── Group C: buildScenarioStepPreview uses _stepUnitLocations ─────────────────

var p0 = api.buildScenarioStepPreview(fixture, 'W3-STEP-00');
var p1 = api.buildScenarioStepPreview(fixture, 'W3-STEP-01');
var p2 = api.buildScenarioStepPreview(fixture, 'W3-STEP-02');

// T17 — step-0 preview passes
assert('T17 — buildScenarioStepPreview(W3-STEP-00) passes',
    p0.passed === true,
    JSON.stringify(p0.blockedReasons)
);

// T18 — step-0 preview unitsReferenced contains R-001 with step-0 lat=31.0
var p0R001 = (p0.preview ? p0.preview.unitsReferenced : [])
    .filter(function (u) { return u.uid === 'R-001'; })[0] || null;
assert('T18 — step-0 preview R-001 startLocation lat=31.0 (from _stepUnitLocations[0])',
    p0R001 !== null &&
    p0R001.startLocation !== null &&
    p0R001.startLocation.lat === 31.0,
    JSON.stringify(p0R001 ? p0R001.startLocation : null)
);

// T19 — step-1 preview passes
assert('T19 — buildScenarioStepPreview(W3-STEP-01) passes',
    p1.passed === true,
    JSON.stringify(p1.blockedReasons)
);

// T20 — step-1 preview R-001 has step-1 lat=31.2 (per-step override)
var p1R001 = (p1.preview ? p1.preview.unitsReferenced : [])
    .filter(function (u) { return u.uid === 'R-001'; })[0] || null;
assert('T20 — step-1 preview R-001 startLocation lat=31.2 (from _stepUnitLocations[1])',
    p1R001 !== null &&
    p1R001.startLocation !== null &&
    p1R001.startLocation.lat === 31.2,
    JSON.stringify(p1R001 ? p1R001.startLocation : null)
);

// T21 — step-0 and step-1 preview R-001 startLocations are different (unit moved)
assert('T21 — step-0 and step-1 preview R-001 startLocations differ (unit moved)',
    p0R001 !== null && p1R001 !== null &&
    (p0R001.startLocation.lat !== p1R001.startLocation.lat ||
     p0R001.startLocation.lng !== p1R001.startLocation.lng),
    's0=' + JSON.stringify(p0R001 ? p0R001.startLocation : null) +
    ' s1=' + JSON.stringify(p1R001 ? p1R001.startLocation : null)
);

// T22 — step-2 preview passes
assert('T22 — buildScenarioStepPreview(W3-STEP-02) passes',
    p2.passed === true,
    JSON.stringify(p2.blockedReasons)
);

// T23 — step-2 preview R-003 has deployed lat=31.8 (not off-map lat=32)
var p2R003 = (p2.preview ? p2.preview.unitsReferenced : [])
    .filter(function (u) { return u.uid === 'R-003'; })[0] || null;
assert('T23 — step-2 preview R-003 lat=31.8 (deployed, from _stepUnitLocations[2])',
    p2R003 !== null &&
    p2R003.startLocation !== null &&
    p2R003.startLocation.lat === 31.8,
    JSON.stringify(p2R003 ? p2R003.startLocation : null)
);

// T24 — static R-002 has identical coords across step-0 and step-1 _stepUnitLocations
assert('T24 — static R-002 same coords at step-0 and step-1 (no movement)',
    r002s0.lat === r002s1.lat && r002s0.lng === r002s1.lng,
    's0=' + JSON.stringify(r002s0) + ' s1=' + JSON.stringify(r002s1)
);

// T25 — resolved unit copies primitives only (startLocation is a fresh object, not the frozen original)
assert('T25 — preview resolved unit startLocation is a plain object (not === frozen _stepUnitLocations entry)',
    p0R001 !== null &&
    p0R001.startLocation !== null &&
    p0R001.startLocation !== s0locs['R-001'],
    'same reference (should be a copy)'
);

// ── Group D: Non-W3 fixture backward compatibility ────────────────────────────

var amberFix = {
    fixtureId: 'ar', fixtureName: 'AMBER RIDGE', packageId: 'ar', packageName: 'AR',
    readOnly: true, liveMutationAllowed: false,
    units: [{
        uid: 'U1', name: 'Alpha', side: 'friendly', role: 'INF', echelon: 'PLT', aliases: [],
        startLocation: { description: 'LD', lat: 34.0, lng: 36.0 }
    }],
    objectives: [],
    steps: [{
        step_id: 'AMBER-STEP-01', stepIndex: 0, title: 'Step 1',
        situation: 'Blue forces advance.',
        selectedDecision: 'Maneuver along axis RED',
        friendlyActions:     [{ uid: 'U1', action: 'Move forward' }],
        enemyCounterActions: [],
        objectivesReferenced: [],
        unitsReferenced:     ['U1'],
        expectedResult:      'Secure the ridge',
        missingDataExpected: [],
        readOnly: true,
        safety: {
            dryRunOnly: true, previewOnly: true,
            liveMutationAllowed: false, backendCommitAllowed: false,
            mapMutationAllowed: false, unitMutationAllowed: false,
            scenarioMutationAllowed: false
        }
    }]
};
var amberRes = api.buildScenarioStepPreview(amberFix, 'AMBER-STEP-01');

// T26 — non-W3 fixture without _stepUnitLocations still passes
assert('T26 — non-W3 fixture without _stepUnitLocations passes',
    amberRes.passed === true,
    JSON.stringify(amberRes.blockedReasons)
);

// T27 — non-W3 U1 startLocation comes from fixture.units catalog (lat=34.0)
var amberU1 = (amberRes.preview ? amberRes.preview.unitsReferenced : [])
    .filter(function (u) { return u.uid === 'U1'; })[0] || null;
assert('T27 — non-W3 U1 startLocation uses catalog (lat=34.0, lng=36.0)',
    amberU1 !== null &&
    amberU1.startLocation !== null &&
    amberU1.startLocation.lat === 34.0 &&
    amberU1.startLocation.lng === 36.0,
    JSON.stringify(amberU1 ? amberU1.startLocation : null)
);

// ── Group E: previewWargame3Fixture integration ───────────────────────────────

var har0 = api.previewWargame3Fixture(minW3, 'W3-STEP-00');
var har1 = api.previewWargame3Fixture(minW3, 'W3-STEP-01');

// T28 — previewWargame3Fixture step-0 passes
assert('T28 — previewWargame3Fixture(W3-STEP-00) passes',
    har0.passed === true,
    JSON.stringify(har0.blockedReasons)
);

// T29 — previewWargame3Fixture step-1 passes
assert('T29 — previewWargame3Fixture(W3-STEP-01) passes',
    har1.passed === true,
    JSON.stringify(har1.blockedReasons)
);

// T30 — previewWargame3Fixture step-1 R-001 lat=31.2 (step-specific coord)
var h1R001 = (har1.preview ? har1.preview.unitsReferenced : [])
    .filter(function (u) { return u.uid === 'R-001'; })[0] || null;
assert('T30 — previewWargame3Fixture step-1 R-001 lat=31.2 (per-step coord)',
    h1R001 !== null && h1R001.startLocation !== null && h1R001.startLocation.lat === 31.2,
    JSON.stringify(h1R001 ? h1R001.startLocation : null)
);

// T31 — previewWargame3Fixture step-0 R-001 lat=31.0 (step-0 coord)
var h0R001 = (har0.preview ? har0.preview.unitsReferenced : [])
    .filter(function (u) { return u.uid === 'R-001'; })[0] || null;
assert('T31 — previewWargame3Fixture step-0 R-001 lat=31.0',
    h0R001 !== null && h0R001.startLocation !== null && h0R001.startLocation.lat === 31.0,
    JSON.stringify(h0R001 ? h0R001.startLocation : null)
);

// T32 — step-0 and step-1 R-001 startLocations differ via previewWargame3Fixture
assert('T32 — previewWargame3Fixture step-0 vs step-1 R-001 coords differ',
    h0R001 !== null && h1R001 !== null &&
    (h0R001.startLocation.lat !== h1R001.startLocation.lat ||
     h0R001.startLocation.lng !== h1R001.startLocation.lng),
    's0=' + JSON.stringify(h0R001 ? h0R001.startLocation : null) +
    ' s1=' + JSON.stringify(h1R001 ? h1R001.startLocation : null)
);

// ── Group F: Safety checks ────────────────────────────────────────────────────

// T33 — PR-247 code markers are present in source
var m1 = src.indexOf('// U8: startLocation from step-specific coord; fall back to step 0, then unit.coord (PR-247)');
var m2 = src.indexOf('// PR-247: build per-step unit location map');
var m3 = src.indexOf('// PR-247: prefer per-step location; fall back to catalog (step-0) location');
assert('T33 — all three PR-247 code markers present in source',
    m1 !== -1 && m2 !== -1 && m3 !== -1,
    'markers: m1=' + m1 + ' m2=' + m2 + ' m3=' + m3
);

// T34 — _buildUnit now has 4-param signature (stepIndex)
assert('T34 — _buildUnit declares stepIndex as 4th parameter',
    src.indexOf('function _buildUnit(rawUnit, side, coordTable, stepIndex)') !== -1,
    'signature not found'
);

// T35 — _stepUnitLocations is present in the steps.push call
assert('T35 — _stepUnitLocations field embedded in steps.push',
    src.indexOf('_stepUnitLocations:       _sLocs') !== -1 ||
    src.indexOf('_stepUnitLocations:  _sLocs') !== -1 ||
    src.indexOf('_stepUnitLocations: _sLocs') !== -1,
    'field not found in steps.push'
);

// T36 — no fetch/localStorage/commit in PR-247 code blocks
var pr247block =
    (m1 !== -1 ? src.slice(m1, m1 + 400) : '') +
    (m2 !== -1 ? src.slice(m2, m2 + 600) : '') +
    (m3 !== -1 ? src.slice(m3, m3 + 600) : '');
var pr247clean = pr247block
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
assert('T36 — no fetch/localStorage/commit in PR-247 code blocks',
    pr247clean.indexOf('fetch(') === -1 &&
    pr247clean.indexOf('localStorage') === -1 &&
    !/\bcommit\b/.test(pr247clean),
    'violation detected'
);

// T37 — no window.units / window.lines / window.RmoozScenario in PR-247 blocks
assert('T37 — no window.units/lines/RmoozScenario in PR-247 code blocks',
    pr247clean.indexOf('window.units') === -1 &&
    pr247clean.indexOf('window.lines') === -1 &&
    pr247clean.indexOf('window.RmoozScenario') === -1,
    'violation detected'
);

// ── Results ───────────────────────────────────────────────────────────────────
results.forEach(function (r) { console.log(r); });
console.log(
    '\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') +
    '  (' + passed + '/' + (passed + failed) + ')'
);
process.exit(failed > 0 ? 1 : 0);
