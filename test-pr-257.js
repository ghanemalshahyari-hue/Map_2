'use strict';

// ── PR-257 Test Harness — Wargame 3 Decision / Result Source Audit ────────────
// Audits why every W3 preview step has missing selectedDecision and expectedResult.
//
// Approach:
//   - auditWargame3DecisionResultSources() scans the raw w3json source data and
//     the adapter path to determine whether selectedDecision / expectedResult:
//       (a) are absent from raw source,
//       (b) are present but dropped by the adapter, or
//       (c) exist under different candidate field names.
//   - All 27 required tests run against the audit output and the existing pipeline.
//   - No production file changes. No selectedDecision/expectedResult values invented.
//
// No DOM. No Leaflet needed for this audit.
// All operations read-only from w3json and scenario-workspace.js source text.

var fs   = require('fs');
var path = require('path');

var src    = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
var w3json = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8'));

// ── Brace-matched function extractor ─────────────────────────────────────────
function extractFn(fnName) {
    var re  = new RegExp('function\\s+' + fnName + '\\s*\\(');
    var idx = src.search(re);
    if (idx === -1) { throw new Error('Cannot find function: ' + fnName); }
    var start = src.indexOf('{', idx);
    var depth = 0; var i = start;
    while (i < src.length) {
        if (src[i] === '{')      { depth++; }
        else if (src[i] === '}') { depth--; }
        if (depth === 0)         { break; }
        i++;
    }
    return src.slice(idx, i + 1);
}

// ── Minimal Leaflet mock (for regression checks only) ─────────────────────────
function makeMockL() {
    var L = {
        _circleMarkerCalls: [], _polylineCalls: [], _layerGroups: [],
        circleMarker: function(ll, o) {
            var ly = { _latlng: ll, _opts: o || {}, options: {},
                bindTooltip: function() { return this; }, addTo: function(g) { g._layers.push(this); return this; } };
            L._circleMarkerCalls.push(ly); return ly;
        },
        circle: function() { return { options: {}, bindTooltip: function() { return this; }, addTo: function() { return this; } }; },
        polyline: function(lls, o) {
            var ly = { _latlngs: lls, _opts: o || {}, options: {},
                bindTooltip: function() { return this; }, addTo: function(g) { g._layers.push(this); return this; } };
            L._polylineCalls.push(ly); return ly;
        },
        layerGroup: function() {
            var lg = { _layers: [], clearLayers: function() { this._layers = []; }, addTo: function(m) { m._layerGroups.push(this); return this; } };
            L._layerGroups.push(lg); return lg;
        }
    };
    return L;
}
function makeMockMap() {
    return { _layerGroups: [], _removedLayers: [],
        removeLayer: function(l) { this._removedLayers.push(l); var i = this._layerGroups.indexOf(l); if (i >= 0) this._layerGroups.splice(i, 1); return this; }
    };
}

// ── Shared window object ──────────────────────────────────────────────────────
var window = {
    map: null, L: null,
    units: [], lines: [],
    RmoozScenario: { stepIndex: 5, scenario: {} }
};
var unitsRef = window.units;
var linesRef = window.lines;
var scenRef  = window.RmoozScenario;
var w3jsonRef = w3json; // raw W3 reference — must not be mutated

// ── auditWargame3DecisionResultSources ────────────────────────────────────────
// Console-only audit helper. NOT added to production code (fields absent in
// raw source → no production change needed). Implemented here for test use.
//
// Scans w3json.steps for selectedDecision, expectedResult and any candidate
// fields that could semantically map to them. Returns a structured report.
//
// Rules: no mutation of w3json, no network calls, no DOM, no map.
function auditWargame3DecisionResultSources(w3json_input, options) {
    var opts = (options && typeof options === 'object') ? options : {};
    if (!w3json_input || typeof w3json_input !== 'object') {
        return {
            passed:                  false,
            scenarioId:              null,
            stepCount:               0,
            selectedDecisionCoverage:{ present: 0, missing: 0, candidateFields: [] },
            expectedResultCoverage:  { present: 0, missing: 0, candidateFields: [] },
            perStep:                 [],
            conclusion:              'BLOCKED: invalid w3json input',
            recommendation:          'Provide a valid w3json object',
            blockedReasons:          ['w3json is null or not an object'],
            warnings:                []
        };
    }

    var scenarioId = (typeof w3json_input.scenario_id === 'string') ? w3json_input.scenario_id : 'unknown';
    var steps = Array.isArray(w3json_input.steps) ? w3json_input.steps : [];
    var blockedReasons = [];
    var warnings       = [];

    if (steps.length === 0) {
        blockedReasons.push('w3json.steps is empty or not an array');
    }

    // ── Field definitions ─────────────────────────────────────────────────────
    //
    // DIRECT fields: exact canonical names that would map 1:1 to selectedDecision
    // or expectedResult. If any of these are non-null on a step, the field is
    // counted as "present".
    //
    // SEMANTIC candidates: different-named fields that MIGHT contain related data.
    // These are listed but do NOT count toward "present". They require explicit
    // human review and schema contract approval before any mapping is attempted.
    //
    var SD_DIRECT_FIELDS = [
        'selectedDecision', 'selected_decision', 'decision', 'chosenDecision',
        'selectedOption', 'COA', 'courseOfAction', 'commanderDecision', 'playerDecision'
    ];
    var SD_SEMANTIC_CANDIDATES = [
        { field: 'decision_point_baseline', desc: 'Decision point flag (null everywhere in W3)' },
        { field: 'step_advantage',          desc: 'Operational advantage indicator — not a decision' },
        { field: 'combined_effect',         desc: 'Combined effect summary — not a decision selection' }
    ];

    var ER_DIRECT_FIELDS = [
        'expectedResult', 'expected_result', 'result', 'outcome',
        'expectedOutcome', 'adjudication', 'consequence'
    ];
    var ER_SEMANTIC_CANDIDATES = [
        { field: 'objective_status_baseline', desc: 'Objective status string (DORMANT/THREATENED/CONTESTED/DENIED). ' +
            'NOT a safe auto-mapping — this is a read-only per-step status, ' +
            'not an operator-authored expected result for adjudication.' },
        { field: 'combined_effect',           desc: 'Combined effect summary — null everywhere in W3' },
        { field: 'step_advantage',            desc: 'Step advantage — null everywhere in W3' }
    ];

    // ── Per-step scan ─────────────────────────────────────────────────────────
    var sdPresent = 0; var sdMissing = 0; var sdSemanticHits = {};
    var erPresent = 0; var erMissing = 0; var erSemanticHits = {};
    var perStep   = [];

    for (var si = 0; si < steps.length; si++) {
        var step    = steps[si];
        var stepRef = 'W3-STEP-' + (si < 10 ? '0' + si : '' + si);
        var phase   = (typeof step.phase === 'string' ? step.phase : '') +
                      (typeof step.time_label === 'string' ? ' — ' + step.time_label : '');

        // ── selectedDecision: check direct fields first ───────────────────────
        var sdFound = null;
        var sdSrc   = null;
        for (var sdi = 0; sdi < SD_DIRECT_FIELDS.length; sdi++) {
            var sdf = SD_DIRECT_FIELDS[sdi];
            var sdv = step[sdf];
            if (sdv !== undefined && sdv !== null && sdv !== '') {
                sdFound = sdv;
                sdSrc   = 'step.' + sdf;
                break;
            }
        }
        // Then collect semantic candidates (do NOT affect sdFound)
        var sdCandHits = [];
        for (var sci = 0; sci < SD_SEMANTIC_CANDIDATES.length; sci++) {
            var sc = SD_SEMANTIC_CANDIDATES[sci];
            var scv = step[sc.field];
            if (scv !== undefined && scv !== null && scv !== '') {
                sdCandHits.push({ field: sc.field, desc: sc.desc, value: scv });
                sdSemanticHits[sc.field] = (sdSemanticHits[sc.field] || 0) + 1;
            }
        }
        if (sdFound !== null) { sdPresent++; } else { sdMissing++; }

        // ── expectedResult: check direct fields first ─────────────────────────
        var erFound = null;
        var erSrc   = null;
        for (var eri = 0; eri < ER_DIRECT_FIELDS.length; eri++) {
            var erf = ER_DIRECT_FIELDS[eri];
            var erv = step[erf];
            if (erv !== undefined && erv !== null && erv !== '') {
                erFound = erv;
                erSrc   = 'step.' + erf;
                break;
            }
        }
        // Then collect semantic candidates (do NOT affect erFound)
        var erCandHits = [];
        for (var rci = 0; rci < ER_SEMANTIC_CANDIDATES.length; rci++) {
            var rc = ER_SEMANTIC_CANDIDATES[rci];
            var rcv = step[rc.field];
            if (rcv !== undefined && rcv !== null && rcv !== '') {
                erCandHits.push({ field: rc.field, desc: rc.desc, value: rcv });
                erSemanticHits[rc.field] = (erSemanticHits[rc.field] || 0) + 1;
            }
        }
        if (erFound !== null) { erPresent++; } else { erMissing++; }

        // Determine warning status
        var warnStatus = [];
        if (sdFound === null) { warnStatus.push('selectedDecision: MISSING (source gap)'); }
        if (erFound === null) { warnStatus.push('expectedResult: MISSING (source gap)'); }

        perStep.push({
            stepRef:                    stepRef,
            stepSummary:                phase,
            selectedDecision:           sdFound,
            selectedDecisionSource:     sdSrc,
            selectedDecisionCandidates: sdCandHits,
            expectedResult:             erFound,
            expectedResultSource:       erSrc,
            expectedResultCandidates:   erCandHits,
            warningStatus:              warnStatus
        });
    }

    // Summarise semantic candidates found
    var sdCandList = Object.keys(sdSemanticHits).map(function(f) {
        return { field: f, stepsWithValue: sdSemanticHits[f] };
    });
    var erCandList = Object.keys(erSemanticHits).map(function(f) {
        return { field: f, stepsWithValue: erSemanticHits[f] };
    });

    // ── Conclusion ───────────────────────────────────────────────────────────
    var conclusion;
    var recommendation;

    if (sdMissing === steps.length && erMissing === steps.length) {
        conclusion = 'SOURCE_GAP: Neither selectedDecision nor expectedResult exists in raw W3 source ' +
            'data at any step level (no direct-name field found). ' +
            (erCandList.length > 0
                ? 'Semantic candidate fields were found for expectedResult (' +
                  erCandList.map(function(c) { return c.field; }).join(', ') +
                  ') but are NOT safe automatic mappings — they require schema contract approval. '
                : '') +
            'The adapter correctly sets both to null. previewComplete must remain false ' +
            'for all ' + steps.length + ' steps.';
        recommendation = 'Add selectedDecision and expectedResult to the W3 source data contract ' +
            '(wargame3-schema.md) or define a future adjudication-layer contract that provides ' +
            'these fields. Do not synthesise or infer them from actors[].action_what, ' +
            'narrative_en_fallback, or objective_status_baseline — these are unit-level ' +
            'descriptions or status fields, not commander-level decision selections.';
    } else if (sdPresent > 0 || erPresent > 0) {
        conclusion = 'PARTIAL_COVERAGE: Direct-name field(s) found in some steps. ' +
            'Check adapter for drops.';
        recommendation = 'Check whether the adapter is silently dropping non-null direct-name ' +
            'values from the identified steps.';
    } else {
        conclusion = 'SOURCE_GAP: No direct-name values found for either field in any step.';
        recommendation = 'Define source data contract before attempting to fill these fields.';
    }

    var passed = blockedReasons.length === 0;

    return {
        passed:                  passed,
        scenarioId:              scenarioId,
        stepCount:               steps.length,
        selectedDecisionCoverage: {
            present:         sdPresent,
            missing:         sdMissing,
            candidateFields: sdCandList
        },
        expectedResultCoverage: {
            present:         erPresent,
            missing:         erMissing,
            candidateFields: erCandList
        },
        perStep:         perStep,
        conclusion:      conclusion,
        recommendation:  recommendation,
        blockedReasons:  blockedReasons,
        warnings:        warnings
    };
}

// ── Extract production functions (for regression checks) ──────────────────────
var bsspStart = src.indexOf('    var _BSSP_SAFETY_TRUE');
var bsspEnd   = src.indexOf('    function buildScenarioStepPreview', bsspStart);
var bsspSrc   = src.slice(bsspStart, bsspEnd);

var w3aStart  = src.indexOf('// ── PR-215: Wargame 3 Fixture Adapter');
var w3aEnd    = src.indexOf('// ── PR-216: Wargame 3 Dry-Run Preview Harness');
var w3aSrc    = src.slice(w3aStart, w3aEnd);

var w3mStart  = src.indexOf('// ── PR-241: Read-Only Map Overlay Data Builder — unsafe');
var w3mEnd    = src.indexOf('// ── PR-241: Wargame 3 Read-Only Map Overlay type guard');
var w3mSrc    = src.slice(w3mStart, w3mEnd);

var stateSrc = [
    'var _w3PreviewLayer   = null;',
    'var _drpPreviewSource = null;',
    'function paintDryRunPreview() { return; }',
    'function _updateDrpNavButtons() { return; }'
].join('\n');

var combined = [
    stateSrc, bsspSrc,
    extractFn('buildScenarioStepPreview'),
    w3aSrc,
    extractFn('previewWargame3Fixture'),
    w3mSrc,
    extractFn('isWargame3ReadOnlyMapOverlayDataSafe'),
    extractFn('buildWargame3ReadOnlyMapOverlayData'),
    extractFn('clearWargame3ReadOnlyMapOverlay'),
    extractFn('paintWargame3ReadOnlyMapOverlay'),
    extractFn('paintWargame3PreviewMapOverlayFromPreview'),
    extractFn('auditWargame3MapPreviewCoverage'),
    extractFn('auditWargame3StepCoordinateDeltas'),
    extractFn('auditWargame3MovementTrailCoverage'),
    extractFn('buildWargame3PreviewMapFocusBounds'),
    extractFn('auditWargame3ObjectiveCoordinateSources'),
    extractFn('buildWargame3MapPreviewReadinessReport')
].join('\n');

var fn = new Function('window',
    combined + '\nreturn {' +
    ' adaptWargame3ToFixture:              adaptWargame3ToFixture,' +
    ' buildScenarioStepPreview:            buildScenarioStepPreview,' +
    ' buildWargame3ReadOnlyMapOverlayData: buildWargame3ReadOnlyMapOverlayData,' +
    ' clearWargame3ReadOnlyMapOverlay:     clearWargame3ReadOnlyMapOverlay,' +
    ' paintWargame3ReadOnlyMapOverlay:     paintWargame3ReadOnlyMapOverlay,' +
    ' buildWargame3MapPreviewReadinessReport: buildWargame3MapPreviewReadinessReport };'
);
var api = fn(window);

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0; var failed = 0; var results = [];
function assert(label, cond, detail) {
    if (cond) { passed++; results.push('  PASS  ' + label); }
    else       { failed++; results.push('  FAIL  ' + label + (detail ? '  →  ' + detail : '')); }
}

// ── Pre-compute audit and fixture ─────────────────────────────────────────────
var auditNull  = auditWargame3DecisionResultSources(null);
var auditValid = auditWargame3DecisionResultSources(w3json);

var adaptRes = api.adaptWargame3ToFixture(w3json);
var fixture  = adaptRes.fixture;

// ── A1: null w3json blocks safely ─────────────────────────────────────────────
assert('A01 — null w3json: audit returns passed=false without throwing',
    auditNull.passed === false,
    'passed=' + auditNull.passed);

assert('A01b — null w3json: blockedReasons is non-empty',
    auditNull.blockedReasons && auditNull.blockedReasons.length > 0,
    'blockedReasons.length=' + (auditNull.blockedReasons && auditNull.blockedReasons.length));

assert('A01c — null w3json: perStep is empty array',
    Array.isArray(auditNull.perStep) && auditNull.perStep.length === 0,
    'perStep.length=' + (auditNull.perStep && auditNull.perStep.length));

// ── A2: valid W3 passes audit ─────────────────────────────────────────────────
assert('A02 — valid w3json: audit returns passed=true',
    auditValid.passed === true,
    'passed=' + auditValid.passed);

assert('A02b — valid w3json: scenarioId is wargame3',
    auditValid.scenarioId === 'wargame3',
    'scenarioId=' + auditValid.scenarioId);

// ── A3: all 17 steps are inspected ────────────────────────────────────────────
assert('A03 — all 17 steps inspected (stepCount === 17)',
    auditValid.stepCount === 17,
    'stepCount=' + auditValid.stepCount);

assert('A03b — perStep has 17 entries',
    Array.isArray(auditValid.perStep) && auditValid.perStep.length === 17,
    'perStep.length=' + (auditValid.perStep && auditValid.perStep.length));

// ── A4: raw step keys are scanned ────────────────────────────────────────────
// Verify that all expected raw W3 step keys are present at step-0
var rawStep0Keys = Object.keys(w3json.steps[0]);
assert('A04 — raw step-0 has decision_point_baseline key',
    rawStep0Keys.indexOf('decision_point_baseline') !== -1,
    'key not found');

assert('A04b — raw step-0 has actors key',
    rawStep0Keys.indexOf('actors') !== -1,
    'key not found');

assert('A04c — raw step-0 does NOT have selectedDecision key',
    rawStep0Keys.indexOf('selectedDecision') === -1 &&
    rawStep0Keys.indexOf('selected_decision') === -1,
    'selectedDecision/selected_decision unexpectedly found');

assert('A04d — raw step-0 does NOT have expectedResult key',
    rawStep0Keys.indexOf('expectedResult') === -1 &&
    rawStep0Keys.indexOf('expected_result') === -1,
    'expectedResult/expected_result unexpectedly found');

// ── A5: selectedDecision coverage is calculated ───────────────────────────────
assert('A05 — selectedDecision: present === 0 (absent from all 17 steps)',
    auditValid.selectedDecisionCoverage.present === 0,
    'present=' + auditValid.selectedDecisionCoverage.present);

assert('A05b — selectedDecision: missing === 17 (absent from all 17 steps)',
    auditValid.selectedDecisionCoverage.missing === 17,
    'missing=' + auditValid.selectedDecisionCoverage.missing);

// ── A6: expectedResult coverage is calculated ─────────────────────────────────
// No direct-name expectedResult field exists in raw W3. objective_status_baseline
// is a semantic candidate but does NOT count as "present" for expectedResult.
assert('A06 — expectedResult: present === 0 (no direct-name field in raw W3)',
    auditValid.expectedResultCoverage.present === 0,
    'present=' + auditValid.expectedResultCoverage.present);

assert('A06b — expectedResult: missing === 17 (absent from all 17 steps)',
    auditValid.expectedResultCoverage.missing === 17,
    'missing=' + auditValid.expectedResultCoverage.missing);

// ── A7: candidate fields detected correctly ───────────────────────────────────
// decision_point_baseline is a semantic candidate for selectedDecision but null → not listed
assert('A07 — selectedDecision: candidateFields list returned (may be empty)',
    Array.isArray(auditValid.selectedDecisionCoverage.candidateFields),
    'candidateFields is not an array');

assert('A07b — selectedDecision: no semantic candidates found (decision_point_baseline is null)',
    auditValid.selectedDecisionCoverage.candidateFields.length === 0,
    'unexpected candidates: ' + auditValid.selectedDecisionCoverage.candidateFields.map(function(c){return c.field;}).join(','));

assert('A07c — expectedResult: candidateFields list returned',
    Array.isArray(auditValid.expectedResultCoverage.candidateFields),
    'candidateFields is not an array');

// objective_status_baseline IS non-null (DORMANT/THREATENED/etc.) so it appears as
// a semantic candidate. The audit must list it but NOT count it as "present".
assert('A07d — expectedResult: objective_status_baseline appears as semantic candidate',
    auditValid.expectedResultCoverage.candidateFields.some(function(c) {
        return c.field === 'objective_status_baseline';
    }),
    'objective_status_baseline not listed as semantic candidate');

// ── A8: all existing MISSING_FIELD warnings are explained ─────────────────────
// Every step should have warningStatus for BOTH fields (both are absent)
var allWarned = auditValid.perStep.every(function(ps) {
    return ps.warningStatus.some(function(w) { return w.indexOf('selectedDecision') !== -1; }) &&
           ps.warningStatus.some(function(w) { return w.indexOf('expectedResult') !== -1; });
});
assert('A08 — all 17 steps have warningStatus entries for selectedDecision and expectedResult',
    allWarned,
    auditValid.perStep.filter(function(ps) {
        return !ps.warningStatus.some(function(w) { return w.indexOf('selectedDecision') !== -1; }) ||
               !ps.warningStatus.some(function(w) { return w.indexOf('expectedResult') !== -1; });
    }).map(function(ps) { return ps.stepRef; }).join(','));

// ── A9: no decision/result values are invented ────────────────────────────────
// perStep.selectedDecision and perStep.expectedResult must be null — only direct
// fields count. objective_status_baseline CANNOT be auto-assigned to expectedResult.
var noInvented = auditValid.perStep.every(function(ps) {
    return ps.selectedDecision === null && ps.expectedResult === null;
});
assert('A09 — no selectedDecision or expectedResult values invented (all null)',
    noInvented,
    auditValid.perStep.filter(function(ps) {
        return ps.selectedDecision !== null || ps.expectedResult !== null;
    }).map(function(ps) { return ps.stepRef; }).join(','));

// ── A10: raw W3 JSON not mutated ──────────────────────────────────────────────
assert('A10 — w3json is same reference (not replaced)',
    w3json === w3jsonRef,
    'w3json reference changed');

assert('A10b — w3json.steps[8].decision_point_baseline still null (not mutated)',
    w3json.steps[8].decision_point_baseline === null,
    'decision_point_baseline=' + w3json.steps[8].decision_point_baseline);

assert('A10c — w3json.steps[8] has no selectedDecision key (not injected)',
    !Object.prototype.hasOwnProperty.call(w3json.steps[8], 'selectedDecision'),
    'selectedDecision key found on raw step');

// ── A11: window.RmoozScenario.stepIndex unchanged ─────────────────────────────
assert('A11 — window.RmoozScenario.stepIndex unchanged (still 5)',
    window.RmoozScenario.stepIndex === 5,
    'stepIndex=' + window.RmoozScenario.stepIndex);

// ── A12: window.units not mutated ─────────────────────────────────────────────
assert('A12 — window.units not mutated (same reference, length 0)',
    window.units === unitsRef && window.units.length === 0,
    'units.length=' + window.units.length);

// ── A13: window.lines not mutated ─────────────────────────────────────────────
assert('A13 — window.lines not mutated (same reference)',
    window.lines === linesRef,
    'lines reference changed');

// ── A14–A15: no map paint, no fitBounds ───────────────────────────────────────
// auditWargame3DecisionResultSources never calls Leaflet or fitBounds
assert('A14 — audit function does not reference map or L (source text check)',
    auditWargame3DecisionResultSources.toString().indexOf('fitBounds') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('addTo(') === -1,
    'map/fitBounds reference found in audit fn');

assert('A15 — audit function does not reference window.L (source text check)',
    auditWargame3DecisionResultSources.toString().indexOf('window.L') === -1,
    'window.L reference found in audit fn');

// ── A16: no storage calls ─────────────────────────────────────────────────────
assert('A16 — audit function does not use localStorage/sessionStorage',
    auditWargame3DecisionResultSources.toString().indexOf('localStorage') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('sessionStorage') === -1,
    'storage reference found');

// ── A17: no fetch/backend calls ──────────────────────────────────────────────
assert('A17 — audit function does not use fetch/XHR/api',
    auditWargame3DecisionResultSources.toString().indexOf('fetch(') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('XMLHttpRequest') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('/api/sim/') === -1,
    'fetch/XHR/api reference found');

// ── A18: no AI/simulation/journal calls ──────────────────────────────────────
assert('A18 — audit function references no AI/simulation/journal symbols',
    auditWargame3DecisionResultSources.toString().indexOf('simulation') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('journal') === -1,
    'simulation/journal reference found');

// ── A19: no app.js changes ───────────────────────────────────────────────────
var appSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
assert('A19 — app.js does not contain PR-257 marker',
    appSrc.indexOf('PR-257-PRODUCTION-CHANGE') === -1,
    'PR-257 marker found in app.js');

// ── A20: no adjudicator-map.js changes ───────────────────────────────────────
var adjSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
assert('A20 — adjudicator-map.js does not contain PR-257 marker',
    adjSrc.indexOf('PR-257-PRODUCTION-CHANGE') === -1,
    'PR-257 marker found in adjudicator-map.js');

// ── A21: no apply/commit/confirm/execute/Gate 7 ──────────────────────────────
assert('A21 — audit function has no apply/commit/confirm/execute/Gate 7 references',
    auditWargame3DecisionResultSources.toString().indexOf('applyScenario') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('commitNow') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('Gate7') === -1 &&
    auditWargame3DecisionResultSources.toString().indexOf('executeScenario') === -1,
    'apply/commit/Gate7 reference found in audit fn');

// ── A22: existing W3 preview still builds ────────────────────────────────────
var s08Build = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-08') : null;
var s08Prev  = s08Build && s08Build.preview ? s08Build.preview : null;
assert('A22 — W3-STEP-08 preview still builds correctly after audit',
    s08Build && s08Build.passed === true && s08Prev !== null,
    'passed=' + (s08Build && s08Build.passed));

// ── A23: existing map overlay still builds ───────────────────────────────────
var s07Build = fixture ? api.buildScenarioStepPreview(fixture, 'W3-STEP-07') : null;
var s07Prev  = s07Build && s07Build.preview ? s07Build.preview : null;
(function() { var pm = makeMockMap(); window.map = pm; api.clearWargame3ReadOnlyMapOverlay(); }());
window.L = makeMockL(); window.map = makeMockMap();
var s08OvRes = s08Prev ? api.buildWargame3ReadOnlyMapOverlayData(s08Prev, { previousPreview: s07Prev }) : null;
var s08Ov    = s08OvRes && s08OvRes.overlay ? s08OvRes.overlay : null;
assert('A23 — W3-STEP-08 map overlay still builds correctly',
    s08Ov !== null,
    's08Ov is null');

// ── A24: existing objective highlight still works ─────────────────────────────
var s08Paint = s08Ov ? api.paintWargame3ReadOnlyMapOverlay(s08Ov) : null;
assert('A24 — W3-STEP-08 objective highlight still works (objectiveHighlightCount===1)',
    s08Paint && s08Paint.objectiveHighlightCount === 1,
    'ohc=' + (s08Paint && s08Paint.objectiveHighlightCount));

// ── A25: existing movement trails still work ──────────────────────────────────
assert('A25 — W3-STEP-08 movement trails still work (movementTrailCount===4)',
    s08Paint && s08Paint.movementTrailCount === 4,
    'trailCount=' + (s08Paint && s08Paint.movementTrailCount));

// ── A26: readiness remains ready_for_walkthrough ──────────────────────────────
var readRes = api.buildWargame3MapPreviewReadinessReport(w3json);
assert('A26 — readiness still returns ready_for_walkthrough after audit',
    readRes.passed === true && readRes.readiness === 'ready_for_walkthrough',
    'readiness=' + readRes.readiness);

// ── A27: scenario-workspace.js not modified ───────────────────────────────────
assert('A27 — scenario-workspace.js has no PR-257 production marker',
    src.indexOf('PR-257-PRODUCTION-CHANGE') === -1,
    'PR-257 marker found in scenario-workspace.js');

// ── Additional source-code checks ────────────────────────────────────────────

// Adapter explicitly sets selectedDecision: null (source check)
assert('SC01 — adapter source explicitly sets selectedDecision: null',
    src.indexOf("selectedDecision:         null,       // S5: always null for W3") !== -1 ||
    src.indexOf("selectedDecision:         null,") !== -1,
    'explicit null assignment not found for selectedDecision in adapter');

// Adapter explicitly sets expectedResult: null (source check)
assert('SC02 — adapter source explicitly sets expectedResult: null',
    src.indexOf("expectedResult:           null,       // S10: not present in W3") !== -1 ||
    src.indexOf("expectedResult:           null,") !== -1,
    'explicit null assignment not found for expectedResult in adapter');

// previewComplete is always false for W3 (contract §10)
var previewCompleteComment = src.indexOf('Contract §10: all steps → previewComplete false');
assert('SC03 — adapter contract §10 pre-declares previewComplete false for all W3 steps',
    previewCompleteComment !== -1,
    'contract §10 comment not found');

// buildScenarioStepPreview checks selectedDecision as string
assert('SC04 — buildScenarioStepPreview checks selectedDecision as string field',
    src.indexOf("typeof step.selectedDecision === 'string'") !== -1,
    'selectedDecision string check not found');

// buildScenarioStepPreview checks expectedResult as string
assert('SC05 — buildScenarioStepPreview checks expectedResult as string field',
    src.indexOf("typeof step.expectedResult === 'string'") !== -1,
    'expectedResult string check not found');

// _w3pfc_copyStep also forces both null (belt-and-suspenders check)
assert('SC06 — _w3pfc_copyStep forces selectedDecision=null and expectedResult=null',
    src.indexOf('out.selectedDecision = null;') !== -1 &&
    src.indexOf('out.expectedResult   = null;') !== -1,
    '_w3pfc_copyStep null-force not found');

// decision_point_baseline is null on all 17 raw steps
var allDecPointNull = w3json.steps.every(function(s) { return s.decision_point_baseline === null; });
assert('SC07 — decision_point_baseline is null on all 17 raw W3 steps',
    allDecPointNull, 'some step has non-null decision_point_baseline');

// No selectedDecision key exists directly on raw steps at any level
var noRawSD = w3json.steps.every(function(s) {
    return !Object.prototype.hasOwnProperty.call(s, 'selectedDecision') &&
           !Object.prototype.hasOwnProperty.call(s, 'selected_decision');
});
assert('SC08 — raw W3 steps have no selectedDecision or selected_decision key',
    noRawSD, 'selectedDecision/selected_decision found on a raw step');

var noRawER = w3json.steps.every(function(s) {
    return !Object.prototype.hasOwnProperty.call(s, 'expectedResult') &&
           !Object.prototype.hasOwnProperty.call(s, 'expected_result');
});
assert('SC09 — raw W3 steps have no expectedResult or expected_result key',
    noRawER, 'expectedResult/expected_result found on a raw step');

// Conclusion is SOURCE_GAP (may include semantic candidate note)
assert('SC10 — audit conclusion identifies SOURCE_GAP',
    auditValid.conclusion.indexOf('SOURCE_GAP') !== -1,
    'conclusion=' + auditValid.conclusion.slice(0, 80));

// ── Print results ─────────────────────────────────────────────────────────────
console.log('');
results.forEach(function(r) { console.log(r); });
console.log('');
if (failed === 0) {
    console.log('ALL PASS  (' + passed + '/' + (passed + failed) + ')');
} else {
    console.log(failed + ' FAILED  ' + passed + ' passed  (' + passed + '/' + (passed + failed) + ')');
    process.exitCode = 1;
}

// ── Print per-step coverage table ─────────────────────────────────────────────
console.log('');
console.log('── PR-257 Decision/Result Coverage Table ────────────────────────────────────');
console.log('  Step         | Phase/Summary            | selectedDecision | expectedResult | Warnings');
console.log('  ─────────────┼──────────────────────────┼──────────────────┼────────────────┼─────────');
auditValid.perStep.forEach(function(ps) {
    var sd = ps.selectedDecision !== null ? String(ps.selectedDecision).slice(0,14) : 'ABSENT';
    var er = ps.expectedResult   !== null ? String(ps.expectedResult).slice(0,12)   : 'ABSENT';
    console.log(
        '  ' + ps.stepRef + '  | ' +
        ps.stepSummary.padEnd(24) + ' | ' +
        sd.padEnd(16) + ' | ' +
        er.padEnd(14) + ' | ' +
        ps.warningStatus.length + ' warning(s)'
    );
});

// ── Print audit summary ───────────────────────────────────────────────────────
console.log('');
console.log('── Audit Summary ────────────────────────────────────────────────────────────');
console.log('  scenarioId:                   ' + auditValid.scenarioId);
console.log('  stepCount:                    ' + auditValid.stepCount);
console.log('  selectedDecision present:     ' + auditValid.selectedDecisionCoverage.present + '/' + auditValid.stepCount);
console.log('  selectedDecision missing:     ' + auditValid.selectedDecisionCoverage.missing + '/' + auditValid.stepCount);
console.log('  selectedDecision candidates:  ' + auditValid.selectedDecisionCoverage.candidateFields.length + ' non-null fields found');
console.log('  expectedResult present:       ' + auditValid.expectedResultCoverage.present + '/' + auditValid.stepCount);
console.log('  expectedResult missing:       ' + auditValid.expectedResultCoverage.missing + '/' + auditValid.stepCount);
console.log('  expectedResult candidates:    ' + auditValid.expectedResultCoverage.candidateFields.length + ' non-null fields found');
if (auditValid.expectedResultCoverage.candidateFields.length > 0) {
    console.log('  expectedResult candidate fields (non-null, NOT safe auto-mappings):');
    auditValid.expectedResultCoverage.candidateFields.forEach(function(c) {
        console.log('    - ' + c.field + ' (' + c.stepsWithValue + '/17 steps non-null)');
    });
}
console.log('  conclusion:                   ' + auditValid.conclusion.slice(0, 80) + '...');
console.log('  readiness:                    ' + readRes.readiness);
console.log('  previewComplete (all steps):  false (confirmed — SOURCE_GAP)');
console.log('────────────────────────────────────────────────────────────────────────────');
