/**
 * test-pr-286L.js — PR-286L: Live Scenario Decision Action Baseline
 *
 * 75-item coverage per spec.
 * Tests run in Node — pure functions extracted with new Function() sandbox.
 * Verifies live-path-only behaviour, no dry-run state usage.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const CSS_PATH  = path.join(__dirname, 'UI_MOdified/client/style.css');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJ_MAP   = path.join(__dirname, 'UI_MOdified/client/adjudicator-map.js');

const swSrc   = fs.readFileSync(SW_PATH,   'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
const cssSrc  = fs.readFileSync(CSS_PATH,  'utf8');

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

// ── helpers ────────────────────────────────────────────────────────────────

function extractFn(src, name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) start = src.indexOf('function ' + name + ' (');
    if (start < 0) return null;
    var depth = 0, i = start;
    while (i < src.length) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        i++;
    }
    return src.slice(start, i + 1);
}

// Minimal DOM stub
function makeDomStub(ids) {
    var elements = {};
    function makeEl(id) {
        return {
            id: id,
            _hidden:   true,
            _text:     '',
            _children: [],
            _attrs:    { hidden: '' },
            _evt:      {},
            firstChild: null,
            setAttribute: function(k, v) { this._attrs[k] = v; if (k === 'hidden') this._hidden = true; },
            removeAttribute: function(k) { delete this._attrs[k]; if (k === 'hidden') this._hidden = false; },
            hasAttribute: function(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
            getAttribute: function(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
            appendChild: function(child) {
                this._children.push(child);
                this.firstChild = this._children[0];
            },
            removeChild: function(child) {
                var i = this._children.indexOf(child);
                if (i >= 0) this._children.splice(i, 1);
                this.firstChild = this._children[0] || null;
            },
            addEventListener: function(t, fn) { this._evt[t] = fn; },
            get textContent() { return this._text; },
            set textContent(v) { this._text = v; }
        };
    }
    (ids || []).forEach(function(id) { elements[id] = makeEl(id); });
    return {
        getElementById: function(id) { return elements[id] || null; },
        createElement: function(tag) {
            return {
                tagName: tag.toUpperCase(),
                _attrs: {}, _children: [], _text: '',
                className: '', type: '', firstChild: null,
                setAttribute: function(k, v) { this._attrs[k] = v; },
                removeAttribute: function(k) { delete this._attrs[k]; },
                hasAttribute: function(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
                getAttribute: function(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
                appendChild: function(child) {
                    this._children.push(child);
                    this.firstChild = this._children[0];
                },
                removeChild: function(child) {
                    var i = this._children.indexOf(child);
                    if (i >= 0) this._children.splice(i, 1);
                    this.firstChild = this._children[0] || null;
                },
                get textContent() { return this._text; },
                set textContent(v) { this._text = v; }
            };
        }
    };
}

// Build a complete "live decision module" with all 7+ helpers cohabitating in the closure
function buildLiveDecisionModule(rmoozScenario, domStub) {
    var fnNames = [
        'getLiveScenarioIdentity',
        'getActiveLiveStepContext',
        'extractLiveDecisionOptions',
        '_liveOpKey',
        '_liveOpAppendEvent',
        'recordLiveOperatorSelection',
        'clearLiveOperatorSelection',
        'getLiveOperatorWorkflowState',
        '_initLiveDecisionActionCard',
        'paintLiveDecisionActionCard'
    ];
    var bodies = fnNames.map(function(n) {
        var src = extractFn(swSrc, n);
        if (!src) throw new Error('function ' + n + ' not found');
        return src;
    }).join('\n');

    // Sandbox the helpers with shimmed dependencies:
    //  - getScenario / getActiveStepIndex read rmoozScenario directly (NOT closure window)
    //  - tx returns the fallback
    var harness =
        'var window = arguments[0];\n' +
        'var document = arguments[1];\n' +
        'function getScenario() { return (window && window.RmoozScenario) ? window.RmoozScenario.scenario : null; }\n' +
        'function getActiveStepIndex() { return (window && window.RmoozScenario && typeof window.RmoozScenario.stepIndex === "number") ? window.RmoozScenario.stepIndex : 0; }\n' +
        'function tx(k, d) { return d !== undefined ? d : k; }\n' +
        'var _liveOperatorWorkflowState = { selections: {}, events: [] };\n' +
        'var _LIVE_OP_EVENT_CAP = 64;\n' +
        'var _liveDecisionCardWired = false;\n' +
        bodies + '\n' +
        'return {\n' +
        '  getLiveScenarioIdentity: getLiveScenarioIdentity,\n' +
        '  getActiveLiveStepContext: getActiveLiveStepContext,\n' +
        '  extractLiveDecisionOptions: extractLiveDecisionOptions,\n' +
        '  recordLiveOperatorSelection: recordLiveOperatorSelection,\n' +
        '  clearLiveOperatorSelection: clearLiveOperatorSelection,\n' +
        '  getLiveOperatorWorkflowState: getLiveOperatorWorkflowState,\n' +
        '  paintLiveDecisionActionCard: paintLiveDecisionActionCard,\n' +
        '  _getState: function() { return _liveOperatorWorkflowState; }\n' +
        '};';
    var factory = new Function(harness);
    return factory({ RmoozScenario: rmoozScenario }, domStub);
}

// Sample live scenario fixtures
function makeLiveScenario(opts) {
    opts = opts || {};
    var step0 = {
        index: 0, phase: 'briefing',
        decision_options: opts.options0 || [
            { id: 'OPT-HOLD', label: 'Hold position', summary: 'Maintain current posture' },
            { id: 'OPT-ADVANCE', label: 'Advance', summary: 'Move forward 5km' }
        ]
    };
    var step1 = { index: 1, phase: 'planning' /* no options */ };
    var step2 = {
        index: 2, phase: 'decision',
        decisionOptions: [
            { id: 'OPT-A', title: 'Alpha COA' }
        ]
    };
    return {
        scenario_id:    opts.scenarioId || 'test-live-scn-01',
        scenario_label: opts.scenarioLabel || 'Test Live Scenario',
        steps:          [step0, step1, step2]
    };
}

// ── Section A: Exports present (T1-T7) ────────────────────────────────────
console.log('\n─── Section A: Exports ───');

[
    ['T01', 'getLiveScenarioIdentity'],
    ['T02', 'getActiveLiveStepContext'],
    ['T03', 'extractLiveDecisionOptions'],
    ['T04', 'recordLiveOperatorSelection'],
    ['T05', 'clearLiveOperatorSelection'],
    ['T06', 'getLiveOperatorWorkflowState'],
    ['T07', 'paintLiveDecisionActionCard']
].forEach(function(p) {
    check(swSrc.indexOf(p[1] + ':') >= 0, p[0] + ': ' + p[1] + ' exported');
});

// ── Section B: getLiveScenarioIdentity (T8-T9) ────────────────────────────
console.log('\n─── Section B: getLiveScenarioIdentity ───');

(function() {
    var m = buildLiveDecisionModule({
        scenario: { scenario_id: 'wargame3', scenario_label: 'Brega Assault' },
        stepIndex: 0
    }, makeDomStub([]));
    var id = m.getLiveScenarioIdentity();
    check(id.scenarioId === 'wargame3' && id.scenarioLabel === 'Brega Assault',
          'T08: getLiveScenarioIdentity reads scenario_id + scenario_label',
          id.scenarioId + ' / ' + id.scenarioLabel);

    var m2 = buildLiveDecisionModule({
        scenario: { name: 'NoIdName' },
        stepIndex: 0
    }, makeDomStub([]));
    var id2 = m2.getLiveScenarioIdentity();
    check(id2.scenarioId === 'NoIdName' && id2.scenarioLabel === 'NoIdName',
          'T09: falls back to scenario.name when no id/label',
          id2.scenarioId);
})();

// ── Section C: getActiveLiveStepContext (T10-T12) ─────────────────────────
console.log('\n─── Section C: getActiveLiveStepContext ───');

(function() {
    var sc = makeLiveScenario();
    var m  = buildLiveDecisionModule({ scenario: sc, stepIndex: 2 }, makeDomStub([]));
    var ctx = m.getActiveLiveStepContext();
    check(ctx.stepIndex === 2 && ctx.step && ctx.step.index === 2,
          'T10: reads window.RmoozScenario.stepIndex', ctx.stepIndex);
    check(ctx.totalSteps === 3, 'T10b: totalSteps = scenario.steps.length', ctx.totalSteps);

    var mNo = buildLiveDecisionModule({}, makeDomStub([]));
    var ctxNo = mNo.getActiveLiveStepContext();
    check(ctxNo.scenario === null && ctxNo.step === null && ctxNo.stepIndex === null,
          'T11: handles missing window.RmoozScenario.scenario safely');

    var mEmpty = buildLiveDecisionModule({
        scenario: { scenario_id: 'x' /* no steps */ },
        stepIndex: 0
    }, makeDomStub([]));
    var ctxEmpty = mEmpty.getActiveLiveStepContext();
    check(ctxEmpty.step === null && ctxEmpty.totalSteps === 0,
          'T12: handles missing steps array safely');
})();

// ── Section D: extractLiveDecisionOptions (T13-T22) ───────────────────────
console.log('\n─── Section D: extractLiveDecisionOptions ───');

(function() {
    var m = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 },
        makeDomStub([]));

    // T13: reads decision_options
    var r1 = m.extractLiveDecisionOptions({
        decision_options: [{ id: 'A' }, { id: 'B' }]
    });
    check(r1.passed && r1.options.length === 2 && r1.options[0].sourceField === 'decision_options',
          'T13: reads decision_options');

    // T14: reads decisionOptions
    var r2 = m.extractLiveDecisionOptions({ decisionOptions: [{ id: 'X' }] });
    check(r2.options.length === 1 && r2.options[0].sourceField === 'decisionOptions',
          'T14: reads decisionOptions');

    // T15: reads options
    var r3 = m.extractLiveDecisionOptions({ options: [{ id: 'Y' }] });
    check(r3.options.length === 1 && r3.options[0].sourceField === 'options',
          'T15: reads options');

    // T16: reads coa_options
    var r4 = m.extractLiveDecisionOptions({ coa_options: [{ id: 'Z' }] });
    check(r4.options.length === 1 && r4.options[0].sourceField === 'coa_options',
          'T16: reads coa_options');

    // T17: reads coaOptions
    var r5 = m.extractLiveDecisionOptions({ coaOptions: [{ id: 'W' }] });
    check(r5.options.length === 1 && r5.options[0].sourceField === 'coaOptions',
          'T17: reads coaOptions');

    // T18: ignores invalid entries
    var r6 = m.extractLiveDecisionOptions({
        decision_options: [{ id: 'A' }, null, undefined, 'string', 42, { id: 'B' }]
    });
    check(r6.options.length === 2, 'T18: ignores invalid entries', r6.options.length);

    // T19: normalizes optionId
    var r7 = m.extractLiveDecisionOptions({
        decision_options: [
            { label: 'no-id' }, { coa_id: 'COA-X' }, { option_id: 'OPT-Y' }
        ]
    });
    check(r7.options[0].optionId === 'option-1' &&
          r7.options[1].optionId === 'COA-X' &&
          r7.options[2].optionId === 'OPT-Y',
          'T19: normalizes optionId with fallbacks',
          r7.options.map(function(o){return o.optionId;}).join(','));

    // T20: normalizes label
    var r8 = m.extractLiveDecisionOptions({
        decision_options: [
            { id: 'A', title: 'TitleA' },
            { id: 'B', name: 'NameB' },
            { id: 'C', text: 'TextC' },
            { id: 'D' /* no label source */ }
        ]
    });
    check(r8.options[0].label === 'TitleA' &&
          r8.options[1].label === 'NameB' &&
          r8.options[2].label === 'TextC' &&
          r8.options[3].label === 'D',
          'T20: normalizes label with fallbacks');

    // T21: normalizes summary
    var r9 = m.extractLiveDecisionOptions({
        decision_options: [
            { id: 'A', summary: 'SumA' },
            { id: 'B', description: 'DescB' },
            { id: 'C', rationale: 'RatC' },
            { id: 'D' }
        ]
    });
    check(r9.options[0].summary === 'SumA' &&
          r9.options[1].summary === 'DescB' &&
          r9.options[2].summary === 'RatC' &&
          r9.options[3].summary === null,
          'T21: normalizes summary with fallbacks');

    // T22: does not mutate step
    var step = { decision_options: [{ id: 'A', label: 'Foo' }] };
    var before = JSON.stringify(step);
    m.extractLiveDecisionOptions(step);
    check(JSON.stringify(step) === before, 'T22: extract does not mutate input step');

    // bonus: empty / null
    var rN = m.extractLiveDecisionOptions(null);
    check(rN.passed === false && rN.options.length === 0,
          'T22b: null step → passed:false, options:[]');
    var rE = m.extractLiveDecisionOptions({ /* no options field */ });
    check(rE.passed === true && rE.options.length === 0,
          'T22c: step with no option fields → passed:true, options:[]');
})();

// ── Section E: recordLiveOperatorSelection (T23-T34) ──────────────────────
console.log('\n─── Section E: recordLiveOperatorSelection ───');

(function() {
    // T23: blocks if no active step
    var m1 = buildLiveDecisionModule({}, makeDomStub([]));
    var r1 = m1.recordLiveOperatorSelection('OPT-HOLD');
    check(!r1.passed && r1.blockedReasons.indexOf('NO_ACTIVE_LIVE_STEP') >= 0,
          'T23: blocks with NO_ACTIVE_LIVE_STEP when no scenario');

    // T24: blocks if no options
    var m2 = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 1 }, makeDomStub([]));
    var r2 = m2.recordLiveOperatorSelection('OPT-HOLD');
    check(!r2.passed && r2.blockedReasons.indexOf('NO_LIVE_DECISION_OPTIONS') >= 0,
          'T24: blocks NO_LIVE_DECISION_OPTIONS when step has no options');

    // T25: blocks unknown optionId
    var m3 = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    var r3 = m3.recordLiveOperatorSelection('NOPE');
    check(!r3.passed && r3.blockedReasons.indexOf('OPTION_ID_NOT_FOUND') >= 0,
          'T25: blocks OPTION_ID_NOT_FOUND on unknown id');

    // T26: stores valid selection
    var m4 = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    var r4 = m4.recordLiveOperatorSelection('OPT-HOLD');
    check(r4.passed && r4.record && r4.record.optionId === 'OPT-HOLD',
          'T26: stores valid selection record');

    // T27: selection key uses scenarioId + stepIndex
    var st = m4._getState();
    check(Object.keys(st.selections).indexOf('test-live-scn-01::step-0') >= 0,
          'T27: key = scenarioId::step-N',
          Object.keys(st.selections).join(','));

    // T28-T33: record fields
    var rec = r4.record;
    check(rec.recordType === 'live_operator_decision_selection',
          'T28: recordType = live_operator_decision_selection');
    check(rec.readOnly === true,             'T29: readOnly:true');
    check(rec.liveMutationAllowed === false, 'T30: liveMutationAllowed:false');
    check(rec.backendCommitAllowed === false,'T31: backendCommitAllowed:false');
    check(rec.committed === false,           'T32: committed:false');
    check(rec.applied === false,             'T33: applied:false');

    // T34: appends event
    check(st.events.length === 1 && st.events[0].eventType === 'live_decision_selected',
          'T34: appends live_decision_selected event',
          'events:' + st.events.length);
})();

// ── Section F: clearLiveOperatorSelection (T35-T36) ───────────────────────
console.log('\n─── Section F: clearLiveOperatorSelection ───');

(function() {
    var m = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.recordLiveOperatorSelection('OPT-HOLD');
    var st = m._getState();
    check(Object.keys(st.selections).length === 1, 'T35-setup: selection present');

    var r = m.clearLiveOperatorSelection();
    check(r.passed && r.cleared === true,
          'T35: clearLiveOperatorSelection clears existing selection',
          'cleared:' + r.cleared);

    var st2 = m._getState();
    check(Object.keys(st2.selections).length === 0,
          'T35b: selection map empty after clear');

    var lastEvent = st2.events[st2.events.length - 1];
    check(lastEvent && lastEvent.eventType === 'live_decision_cleared',
          'T36: appends live_decision_cleared event',
          lastEvent && lastEvent.eventType);
})();

// ── Section G: getLiveOperatorWorkflowState (T37-T38) ─────────────────────
console.log('\n─── Section G: getLiveOperatorWorkflowState ───');

(function() {
    var m = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.recordLiveOperatorSelection('OPT-HOLD');
    var copy = m.getLiveOperatorWorkflowState();
    var st   = m._getState();
    check(copy !== st && copy.selections !== st.selections,
          'T37: returns a copy, not the same reference');

    // T38: mutating the copy must not affect internal state
    copy.selections['hack'] = { junk: true };
    copy.events.push({ junk: true });
    check(!st.selections['hack'] && st.events.length === 1,
          'T38: mutating returned copy does NOT mutate internal state');
})();

// ── Section H: Step / scenario keying (T39-T40) ───────────────────────────
console.log('\n─── Section H: step/scenario keying ───');

(function() {
    var m = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.recordLiveOperatorSelection('OPT-HOLD');     // step 0
    // Move to step 2 (has decisionOptions: [{ id: 'OPT-A' }])
    var module = m;  // alias
    // We need to mutate stepIndex on the shared window inside this sandbox
    // Easiest: rebuild module with a different stepIndex, but selections are gone then.
    // Instead, replicate by recording a separate scenario+step combo via NEW module:
    var m2 = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 2 }, makeDomStub([]));
    // Restore previous selection state into m2 to simulate persistence within the same module:
    var carry = m._getState();
    m2._getState().selections = JSON.parse(JSON.stringify(carry.selections));
    m2._getState().events     = JSON.parse(JSON.stringify(carry.events));

    var r = m2.recordLiveOperatorSelection('OPT-A');
    check(r.passed, 'T39-setup: step 2 selection recorded');
    var s = m2._getState();
    check(Object.keys(s.selections).length === 2 &&
          s.selections['test-live-scn-01::step-0'] &&
          s.selections['test-live-scn-01::step-2'],
          'T39: selection on step 0 does NOT affect step 2 (and vice versa)',
          Object.keys(s.selections).join(','));

    // T40: different scenario
    var scB = makeLiveScenario({ scenarioId: 'scn-B' });
    var mB = buildLiveDecisionModule(
        { scenario: scB, stepIndex: 0 }, makeDomStub([]));
    // Pre-load m's selections into mB's state to simulate accumulation
    mB._getState().selections = JSON.parse(JSON.stringify(s.selections));
    mB.recordLiveOperatorSelection('OPT-HOLD');
    var sB = mB._getState();
    check(sB.selections['scn-B::step-0'] && sB.selections['test-live-scn-01::step-0'],
          'T40: selection on scenario A does NOT affect scenario B (different keys)',
          Object.keys(sB.selections).join(','));
})();

// ── Section I: paintLiveDecisionActionCard DOM (T41-T47) ──────────────────
console.log('\n─── Section I: paint DOM behaviour ───');

(function() {
    var IDS = [
        'sw-live-decision-card', 'sw-live-decision-step', 'sw-live-decision-empty',
        'sw-live-decision-options', 'sw-live-decision-selected',
        'sw-live-decision-clear-btn', 'sw-live-decision-event'
    ];

    // T41: empty state when no scenario
    var dom1 = makeDomStub(IDS);
    var m1   = buildLiveDecisionModule({}, dom1);
    m1.paintLiveDecisionActionCard();
    var empty1 = dom1.getElementById('sw-live-decision-empty');
    check(!empty1.hasAttribute('hidden') && empty1.textContent.length > 0,
          'T41: empty state shown when no scenario',
          empty1.textContent);

    // T42: no-options state when step has no options
    var dom2 = makeDomStub(IDS);
    var m2   = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 1 }, dom2);
    m2.paintLiveDecisionActionCard();
    var opts2 = dom2.getElementById('sw-live-decision-options');
    var hasNoOptionsMessage = opts2._children.some(function(c) {
        return c.className === 'sw-live-decision-no-options';
    });
    check(hasNoOptionsMessage, 'T42: no-options message shown when step has no options');

    // T43: renders option rows when present
    var dom3 = makeDomStub(IDS);
    var m3   = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, dom3);
    m3.paintLiveDecisionActionCard();
    var opts3 = dom3.getElementById('sw-live-decision-options');
    var rowCount = opts3._children.filter(function(c) {
        return c.className === 'sw-live-decision-option-row';
    }).length;
    check(rowCount === 2, 'T43: renders one row per option', 'rows:' + rowCount);

    // T44: clicking select records selection (via direct call since DOM stub doesn't dispatch real events)
    var sel = m3.recordLiveOperatorSelection('OPT-HOLD');
    check(sel.passed, 'T44: recordLiveOperatorSelection on selectable option succeeds');

    // T45: paint shows selected label
    var dom4 = makeDomStub(IDS);
    var m4 = buildLiveDecisionModule(
        { scenario: makeLiveScenario(), stepIndex: 0 }, dom4);
    m4.recordLiveOperatorSelection('OPT-HOLD');
    // record already triggered paint; check the dom
    var selEl = dom4.getElementById('sw-live-decision-selected');
    check(!selEl.hasAttribute('hidden') && selEl.textContent.indexOf('Hold position') >= 0,
          'T45: paint shows selected label after recording',
          selEl.textContent);

    // T46: clear button hides selected
    m4.clearLiveOperatorSelection();
    var selEl2 = dom4.getElementById('sw-live-decision-selected');
    var clrEl  = dom4.getElementById('sw-live-decision-clear-btn');
    check(selEl2.hasAttribute('hidden') && clrEl.hasAttribute('hidden'),
          'T46: clear hides selected label + clear button');

    // T47: event text appears
    var evtEl = dom4.getElementById('sw-live-decision-event');
    check(!evtEl.hasAttribute('hidden') && evtEl.textContent.indexOf('live_decision_cleared') >= 0,
          'T47: event text shown after clear', evtEl.textContent);
})();

// ── Section J: app.html DOM IDs (T48-T51) ─────────────────────────────────
console.log('\n─── Section J: app.html DOM IDs ───');

check(htmlSrc.indexOf('id="sw-live-decision-card"') >= 0,
      'T48: app.html contains #sw-live-decision-card');
check(htmlSrc.indexOf('id="sw-live-decision-options"') >= 0,
      'T49: app.html contains #sw-live-decision-options');
check(htmlSrc.indexOf('id="sw-live-decision-selected"') >= 0,
      'T50: app.html contains #sw-live-decision-selected');
check(htmlSrc.indexOf('id="sw-live-decision-clear-btn"') >= 0,
      'T51: app.html contains #sw-live-decision-clear-btn');

// ── Section K: i18n EN/AR keys (T52-T53) ──────────────────────────────────
console.log('\n─── Section K: i18n keys ───');

var EN_KEYS = [
    'sw-live-decision-title', 'sw-live-decision-subtitle', 'sw-live-decision-no-step',
    'sw-live-decision-no-options', 'sw-live-decision-select-btn',
    'sw-live-decision-selected-label', 'sw-live-decision-clear-btn',
    'sw-live-decision-event-prefix', 'sw-live-decision-note',
    'sw-live-decision-step-prefix', 'sw-live-decision-of',
    'sw-live-decision-no-selection'
];
var enBlockStart = i18nSrc.indexOf('en:');
var enBlockEnd   = i18nSrc.indexOf('ar:');
var enBlock      = i18nSrc.slice(enBlockStart, enBlockEnd);
var arBlock      = i18nSrc.slice(enBlockEnd);

var missingEn = EN_KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
check(missingEn.length === 0, 'T52: all EN keys present',
      missingEn.length ? 'MISSING: ' + missingEn.join(', ') : 'all present');

var missingAr = EN_KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missingAr.length === 0, 'T53: all AR keys present',
      missingAr.length ? 'MISSING: ' + missingAr.join(', ') : 'all present');
// AR should also include Arabic characters
check(arBlock.indexOf('إجراء القرار الحي') >= 0,
      'T53b: AR title text present in Arabic block');

// ── Section L: CSS (T54) ──────────────────────────────────────────────────
console.log('\n─── Section L: CSS ───');

[
    '.sw-live-decision-card', '.sw-live-decision-subtitle',
    '.sw-live-decision-options', '.sw-live-decision-option-row',
    '.sw-live-decision-select-btn', '.sw-live-decision-selected',
    '.sw-live-decision-clear-btn', '.sw-live-decision-empty'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T54.' + (i + 1) + ': CSS ' + sel + ' defined');
});

// ── Section M: protected DOM IDs / functions unchanged (T55-T57) ──────────
console.log('\n─── Section M: protected DOM IDs / behaviour ───');

check(htmlSrc.indexOf('id="sw-nav-counter"') >= 0,
      'T55: Step Navigator IDs unchanged (#sw-nav-counter)');
check(htmlSrc.indexOf('id="sw-nav-step-info"') >= 0,
      'T55b: #sw-nav-step-info unchanged');

// T56: goToStep behaviour unchanged
var gotoSrc = extractFn(swSrc, 'goToStep');
check(gotoSrc && gotoSrc.indexOf('paintLiveDecisionActionCard') < 0,
      'T56: goToStep does not directly call paintLiveDecisionActionCard (refresh() chain handles it)');

// T57: dry-run DOM IDs unchanged
check(htmlSrc.indexOf('id="sw-drp-section"') >= 0,
      'T57: #sw-drp-section unchanged');
check(htmlSrc.indexOf('id="sw-drp-unit-scope"') >= 0,
      'T57b: #sw-drp-unit-scope unchanged');

// ── Section N: no dry-run usage in new live functions (T58-T65) ───────────
console.log('\n─── Section N: no dry-run / forbidden tokens in new functions ───');

var liveFnsSrc =
    (extractFn(swSrc, 'getLiveScenarioIdentity')     || '') +
    (extractFn(swSrc, 'getActiveLiveStepContext')    || '') +
    (extractFn(swSrc, 'extractLiveDecisionOptions')  || '') +
    (extractFn(swSrc, 'recordLiveOperatorSelection') || '') +
    (extractFn(swSrc, 'clearLiveOperatorSelection')  || '') +
    (extractFn(swSrc, 'getLiveOperatorWorkflowState')|| '') +
    (extractFn(swSrc, 'paintLiveDecisionActionCard') || '') +
    (extractFn(swSrc, '_initLiveDecisionActionCard') || '');

check(liveFnsSrc.indexOf('_drpPreviewSource')      < 0, 'T58: no _drpPreviewSource usage');
check(liveFnsSrc.indexOf('_drpPreviewStepRef')     < 0, 'T59: no _drpPreviewStepRef usage');
check(!/AMBER[_ ]?RIDGE|RmoozDryRunFixtures/.test(liveFnsSrc),
      'T60: no AMBER RIDGE / dry-run fixture usage');
check(liveFnsSrc.indexOf('praSelection')           < 0, 'T61: no praSelection usage');
check(liveFnsSrc.indexOf('_w3CoaReviewRecord')     < 0, 'T62: no _w3CoaReviewRecord usage');
check(liveFnsSrc.indexOf('expectedResult')         < 0, 'T63: no expectedResult created');
// T64: not setting step.selectedDecision (the record has its own fields, but the scenario step is never assigned)
check(!/\bstep\.selectedDecision\s*=/.test(liveFnsSrc) &&
      !/scenario\.\w+\s*=/.test(liveFnsSrc),
      'T64: no selectedDecision assignment on scenario step / no scenario field assignment');
check(!/previewComplete\s*:\s*true/.test(liveFnsSrc),
      'T65: no previewComplete:true set');

// ── Section O: no scenario / unit / map mutation in new code (T66-T68) ────
console.log('\n─── Section O: no scenario / unit / map mutation ───');

// T66: no scenario object assignment
check(!/window\.RmoozScenario\.scenario\s*=/.test(liveFnsSrc) &&
      !/RmoozScenario\.scenario\.steps\[\d*\]\s*=/.test(liveFnsSrc),
      'T66: no window.RmoozScenario.scenario mutation');
// T67: no window.units mutation
check(!/window\.units\s*=/.test(liveFnsSrc) &&
      !/window\.units\.\w+\s*=/.test(liveFnsSrc) &&
      !/window\.units\.push|window\.units\.splice/.test(liveFnsSrc),
      'T67: no window.units mutation');
// T68: no map / layer / lines mutation
check(!/_w3PreviewLayer|_swScenarioOverlay|window\.lines|window\.map\./.test(liveFnsSrc),
      'T68: no map / overlay / lines mutation');

// ── Section P: no backend / storage / Gate-7 (T69-T71) ────────────────────
console.log('\n─── Section P: no backend / storage / Gate 7 ───');

check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(liveFnsSrc),
      'T69: no fetch / XHR / backend call');
check(!/localStorage|sessionStorage|IndexedDB|indexedDB/.test(liveFnsSrc),
      'T70: no localStorage / sessionStorage / IndexedDB');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7/i.test(liveFnsSrc),
      'T71: no Gate 7 / apply / execute / commit');

// ── Section Q: protected source files unchanged (T72-T74) ─────────────────
console.log('\n─── Section Q: protected files unchanged ───');

if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T72: wargame3.json unchanged (70 red + 83 blue)');
}

if (fs.existsSync(APP_JS)) {
    var appJs = fs.readFileSync(APP_JS, 'utf8');
    check(appJs.indexOf('paintLiveDecisionActionCard') < 0 &&
          appJs.indexOf('_liveOperatorWorkflowState') < 0,
          'T73: app.js unchanged (no PR-286L references)');
}
if (fs.existsSync(ADJ_MAP)) {
    var adjMap = fs.readFileSync(ADJ_MAP, 'utf8');
    check(adjMap.indexOf('paintLiveDecisionActionCard') < 0 &&
          adjMap.indexOf('_liveOperatorWorkflowState') < 0,
          'T74: adjudicator-map.js unchanged (no PR-286L references)');
}

// ── T75: no console errors / refresh wiring sanity ────────────────────────
console.log('\n─── T75: refresh() wiring sanity ───');

// refresh() must include paintLiveDecisionActionCard() call
var refreshArea = swSrc.slice(swSrc.indexOf('refresh: function'),
                              swSrc.indexOf('refresh: function') + 4000);
check(refreshArea.indexOf('paintLiveDecisionActionCard()') >= 0,
      'T75: refresh() calls paintLiveDecisionActionCard()');

// previous PR exports still present
var prevExports = [
    'buildExternalScenarioSourceTrace',
    'paintExternalScenarioSourceTrace',
    'buildWargame3PreviewUnitScopeSummary',
    'paintWargame3PreviewUnitScope',
    'previewExternalScenarioCatalogSubsetFromManifest',
    'buildScenarioStepPreview',
    'checkWargame3ScenarioWorkflowAcceptance'
];
var missingExports = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missingExports.length === 0, 'T75b: all previous PR exports still present',
      missingExports.length ? 'MISSING: ' + missingExports.join(', ') : 'all present');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-286L Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
