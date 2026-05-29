/**
 * test-pr-287L.js — PR-287L: Live Step Status Baseline
 *
 * Per-step operator status (pending | decided | skipped | blocked) for the
 * live scenario workflow. Stored in _liveOperatorWorkflowState.stepStatus,
 * keyed by "<scenarioId>::step-<index>". In-memory annotation only — never
 * mutates the scenario, never advances stepIndex, never commits/applies.
 *
 * Pure functions extracted with a new Function() sandbox (ES5, no deps).
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

function check(ok, label, detail) {
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

function makeDomStub(ids) {
    var elements = {};
    function makeEl(id) {
        return {
            id: id, _hidden: true, _text: '', _children: [], _attrs: { hidden: '' },
            _evt: {}, firstChild: null,
            setAttribute: function(k, v) { this._attrs[k] = v; if (k === 'hidden') this._hidden = true; },
            removeAttribute: function(k) { delete this._attrs[k]; if (k === 'hidden') this._hidden = false; },
            hasAttribute: function(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
            getAttribute: function(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
            appendChild: function(c) { this._children.push(c); this.firstChild = this._children[0]; },
            removeChild: function(c) { var i = this._children.indexOf(c); if (i >= 0) this._children.splice(i, 1); this.firstChild = this._children[0] || null; },
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
                tagName: tag.toUpperCase(), _attrs: {}, _children: [], _text: '',
                className: '', type: '', firstChild: null,
                setAttribute: function(k, v) { this._attrs[k] = v; },
                removeAttribute: function(k) { delete this._attrs[k]; },
                hasAttribute: function(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
                getAttribute: function(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
                appendChild: function(c) { this._children.push(c); this.firstChild = this._children[0]; },
                removeChild: function(c) { var i = this._children.indexOf(c); if (i >= 0) this._children.splice(i, 1); this.firstChild = this._children[0] || null; },
                get textContent() { return this._text; },
                set textContent(v) { this._text = v; }
            };
        }
    };
}

// Build a live-status module with all PR-287L helpers + their deps in one closure.
function buildModule(rmoozScenario, domStub) {
    var fnNames = [
        'getLiveScenarioIdentity', 'getActiveLiveStepContext', 'extractLiveDecisionOptions',
        '_liveOpKey', '_liveOpAppendEvent', 'recordLiveOperatorSelection',
        'clearLiveOperatorSelection', 'getLiveOperatorWorkflowState',
        '_initLiveDecisionActionCard', 'paintLiveDecisionActionCard',
        'isLiveStepStatusValue', '_liveStepStatusLabel', 'getLiveStepKey',
        'getLiveStepStatus', 'setLiveStepStatus', 'clearLiveStepStatus',
        'getLiveScenarioStatusSummary', 'paintLiveStepStatusRow'
    ];
    var bodies = fnNames.map(function(n) {
        var src = extractFn(swSrc, n);
        if (!src) throw new Error('function ' + n + ' not found in scenario-workspace.js');
        return src;
    }).join('\n');

    var harness =
        'var window = arguments[0];\n' +
        'var document = arguments[1];\n' +
        'function getScenario() { return (window && window.RmoozScenario) ? window.RmoozScenario.scenario : null; }\n' +
        'function getActiveStepIndex() { return (window && window.RmoozScenario && typeof window.RmoozScenario.stepIndex === "number") ? window.RmoozScenario.stepIndex : 0; }\n' +
        'function getActiveStep() { var s = getScenario(); var i = getActiveStepIndex(); return (s && Array.isArray(s.steps)) ? (s.steps[i] || null) : null; }\n' +
        'function tx(k, d) { return d !== undefined ? d : k; }\n' +
        'var _liveOperatorWorkflowState = { selections: {}, events: [], stepStatus: {} };\n' +
        'var _LIVE_OP_EVENT_CAP = 64;\n' +
        'var _liveDecisionCardWired = false;\n' +
        'var _LIVE_STEP_STATUS_VALUES = ["pending","decided","skipped","blocked"];\n' +
        'var _LIVE_STEP_STATUS_DEFAULT = "pending";\n' +
        bodies + '\n' +
        'return {\n' +
        '  getLiveStepKey: getLiveStepKey,\n' +
        '  getLiveStepStatus: getLiveStepStatus,\n' +
        '  setLiveStepStatus: setLiveStepStatus,\n' +
        '  clearLiveStepStatus: clearLiveStepStatus,\n' +
        '  getLiveScenarioStatusSummary: getLiveScenarioStatusSummary,\n' +
        '  paintLiveStepStatusRow: paintLiveStepStatusRow,\n' +
        '  recordLiveOperatorSelection: recordLiveOperatorSelection,\n' +
        '  isLiveStepStatusValue: isLiveStepStatusValue,\n' +
        '  _getState: function() { return _liveOperatorWorkflowState; },\n' +
        '  _getWindow: function() { return window; }\n' +
        '};';
    return (new Function(harness))({ RmoozScenario: rmoozScenario }, domStub);
}

function makeLiveScenario(opts) {
    opts = opts || {};
    return {
        scenario_id:    opts.scenarioId || 'test-live-scn-01',
        scenario_label: opts.scenarioLabel || 'Test Live Scenario',
        steps: [
            { index: 0, phase: 'briefing',
              decision_options: [
                  { id: 'OPT-HOLD', label: 'Hold position' },
                  { id: 'OPT-ADVANCE', label: 'Advance' }
              ] },
            { index: 1, phase: 'planning' },
            { index: 2, phase: 'decision' }
        ]
    };
}

var STATUS_IDS = [
    'sw-live-step-status-row', 'sw-live-step-status-badge', 'sw-live-step-status-actions',
    'sw-live-step-status-reason', 'sw-live-step-status-summary'
];

// ── Section A: Exports present (T1-T6) ────────────────────────────────────
console.log('\n─── Section A: Exports ───');
[
    ['T01', 'getLiveStepKey'], ['T02', 'getLiveStepStatus'], ['T03', 'setLiveStepStatus'],
    ['T04', 'clearLiveStepStatus'], ['T05', 'getLiveScenarioStatusSummary'],
    ['T06', 'paintLiveStepStatusRow']
].forEach(function(p) {
    check(swSrc.indexOf(p[1] + ':') >= 0, p[0] + ': ' + p[1] + ' exported on public API');
});

// ── Section B: getLiveStepKey (T7) ────────────────────────────────────────
console.log('\n─── Section B: getLiveStepKey ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    check(m.getLiveStepKey('wargame3', 8) === 'wargame3::step-8',
          'T07: key = "<scenarioId>::step-<index>"', m.getLiveStepKey('wargame3', 8));
})();

// ── Section C: getLiveStepStatus default (T8-T11) ─────────────────────────
console.log('\n─── Section C: getLiveStepStatus default ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 1 }, makeDomStub([]));
    var st = m.getLiveStepStatus();   // active step (1), nothing stored
    check(st.status === 'pending', 'T08: default status is pending', st.status);
    check(st.stored === false, 'T09: default has stored:false', String(st.stored));
    check(st.stepIndex === 1, 'T10: defaults to active stepIndex', String(st.stepIndex));

    var mNo = buildModule({}, makeDomStub([]));
    var stNo = mNo.getLiveStepStatus();
    check(stNo.status === 'pending' && stNo.scenarioId === null,
          'T11: no scenario → pending default, scenarioId null');
})();

// ── Section D: setLiveStepStatus (T12-T26) ────────────────────────────────
console.log('\n─── Section D: setLiveStepStatus ───');
(function() {
    // T12: blocks when no active step
    var mNo = buildModule({}, makeDomStub([]));
    var rNo = mNo.setLiveStepStatus('decided');
    check(!rNo.passed && rNo.blockedReasons.indexOf('NO_ACTIVE_LIVE_STEP') >= 0,
          'T12: blocks NO_ACTIVE_LIVE_STEP when no scenario');

    // T13: blocks invalid status value
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    var rBad = m.setLiveStepStatus('approve');
    check(!rBad.passed && rBad.blockedReasons.indexOf('INVALID_STATUS_VALUE') >= 0,
          'T13: blocks INVALID_STATUS_VALUE for non-enum status');

    // T14-T15: stores decided
    var r = m.setLiveStepStatus('decided');
    check(r.passed && r.record && r.record.status === 'decided',
          'T14: stores decided status');
    check(m._getState().stepStatus['test-live-scn-01::step-0'],
          'T15: stored under scenarioId::step-0 key',
          Object.keys(m._getState().stepStatus).join(','));

    // T16-T23: record safety fields
    var rec = r.record;
    check(rec.recordType === 'live_step_status',     'T16: recordType = live_step_status');
    check(rec.source === 'operator',                 'T17: source = operator');
    check(rec.readOnly === true,                     'T18: readOnly:true');
    check(rec.liveMutationAllowed === false,         'T19: liveMutationAllowed:false');
    check(rec.backendCommitAllowed === false,        'T20: backendCommitAllowed:false');
    check(rec.committed === false,                   'T21: committed:false');
    check(rec.applied === false,                     'T22: applied:false');
    check(typeof rec.updatedAt === 'string' && rec.updatedAt.length > 0,
          'T23: updatedAt ISO timestamp set');

    // T24: appends live_step_status_set event
    var st = m._getState();
    var lastEvt = st.events[st.events.length - 1];
    check(lastEvt && lastEvt.eventType === 'live_step_status_set' && lastEvt.status === 'decided',
          'T24: appends live_step_status_set event', lastEvt && lastEvt.eventType);

    // T25: reason option captured
    var rReason = m.setLiveStepStatus('blocked', { reason: 'awaiting ISR' });
    check(rReason.passed && rReason.record.reason === 'awaiting ISR' && rReason.record.status === 'blocked',
          'T25: reason option captured on record');

    // T26: stepIndex option targets a different step
    var rIdx = m.setLiveStepStatus('skipped', { stepIndex: 2 });
    check(rIdx.passed && rIdx.record.stepIndex === 2 &&
          m._getState().stepStatus['test-live-scn-01::step-2'],
          'T26: options.stepIndex targets a specific step', rIdx.record.stepIndex);
})();

// ── Section E: scenario is never mutated / step never advances (T27-T29) ──
console.log('\n─── Section E: no scenario / step mutation ───');
(function() {
    var sc = makeLiveScenario();
    var before = JSON.stringify(sc);
    var m = buildModule({ scenario: sc, stepIndex: 0 }, makeDomStub([]));
    m.setLiveStepStatus('decided');
    check(JSON.stringify(sc) === before, 'T27: scenario object is NOT mutated by setLiveStepStatus');
    check(m._getWindow().RmoozScenario.stepIndex === 0,
          'T28: stepIndex is NOT advanced by setLiveStepStatus',
          String(m._getWindow().RmoozScenario.stepIndex));
    // selecting status does not touch decision selections map
    check(Object.keys(m._getState().selections).length === 0,
          'T29: setLiveStepStatus does not create decision selections');
})();

// ── Section F: decisionId linking (T30) ───────────────────────────────────
console.log('\n─── Section F: decisionId linking ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.recordLiveOperatorSelection('OPT-HOLD');     // create a selection on step 0
    var r = m.setLiveStepStatus('decided');        // no explicit decisionId
    check(r.passed && r.record.decisionId === 'OPT-HOLD',
          'T30: setLiveStepStatus links decisionId from existing live selection',
          r.record.decisionId);
})();

// ── Section G: getLiveStepStatus after set (T31-T33) ──────────────────────
console.log('\n─── Section G: getLiveStepStatus after set ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.setLiveStepStatus('decided');
    var st = m.getLiveStepStatus(0);
    check(st.status === 'decided' && st.stored === true,
          'T31: returns stored record (status decided, stored:true)');
    // deep copy independence
    st.status = 'HACKED';
    check(m.getLiveStepStatus(0).status === 'decided',
          'T32: returned record is a deep copy (mutation does not leak)');
    // unstored step still pending
    check(m.getLiveStepStatus(1).status === 'pending' && m.getLiveStepStatus(1).stored === false,
          'T33: untouched step still pending/unstored');
})();

// ── Section H: clearLiveStepStatus (T34-T37) ──────────────────────────────
console.log('\n─── Section H: clearLiveStepStatus ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.setLiveStepStatus('blocked');
    var r = m.clearLiveStepStatus();
    check(r.passed && r.cleared === true, 'T34: clears an existing status (cleared:true)');
    check(!m._getState().stepStatus['test-live-scn-01::step-0'],
          'T35: status record removed from state');
    check(m.getLiveStepStatus(0).status === 'pending',
          'T36: step reverts to pending after clear');
    var lastEvt = m._getState().events[m._getState().events.length - 1];
    check(lastEvt && lastEvt.eventType === 'live_step_status_cleared',
          'T37: appends live_step_status_cleared event', lastEvt && lastEvt.eventType);

    // clearing when none → passed:true, cleared:false
    var r2 = m.clearLiveStepStatus(1);
    check(r2.passed && r2.cleared === false, 'T37b: clear with no record → cleared:false, passed:true');
})();

// ── Section I: getLiveScenarioStatusSummary (T38-T43) ─────────────────────
console.log('\n─── Section I: getLiveScenarioStatusSummary ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    var s0 = m.getLiveScenarioStatusSummary();
    check(s0.totalSteps === 3 && s0.counts.pending === 3,
          'T38: all steps pending by default', JSON.stringify(s0.counts));
    check(s0.steps.length === 3, 'T39: steps[] length = totalSteps');

    m.setLiveStepStatus('decided', { stepIndex: 0 });
    m.setLiveStepStatus('skipped', { stepIndex: 1 });
    var s1 = m.getLiveScenarioStatusSummary();
    check(s1.counts.decided === 1 && s1.counts.skipped === 1 && s1.counts.pending === 1,
          'T40: counts reflect set statuses', JSON.stringify(s1.counts));
    check(s1.decidedCount === 1, 'T41: decidedCount convenience field');
    check(s1.resolvedCount === 2, 'T42: resolvedCount = decided+skipped+blocked', String(s1.resolvedCount));
    check(s1.pendingCount === 1, 'T43: pendingCount convenience field');

    var mNo = buildModule({}, makeDomStub([]));
    check(mNo.getLiveScenarioStatusSummary().totalSteps === 0,
          'T43b: no scenario → totalSteps 0');
})();

// ── Section J: scenario / step scoping (T44-T45) ──────────────────────────
console.log('\n─── Section J: scoping ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.setLiveStepStatus('decided', { stepIndex: 0 });
    m.setLiveStepStatus('blocked', { stepIndex: 2 });
    var keys = Object.keys(m._getState().stepStatus);
    check(keys.indexOf('test-live-scn-01::step-0') >= 0 &&
          keys.indexOf('test-live-scn-01::step-2') >= 0 &&
          keys.length === 2,
          'T44: per-step keys are independent', keys.join(','));

    var scB = makeLiveScenario({ scenarioId: 'scn-B' });
    var mB = buildModule({ scenario: scB, stepIndex: 0 }, makeDomStub([]));
    mB._getState().stepStatus = JSON.parse(JSON.stringify(m._getState().stepStatus)); // carry-over
    mB.setLiveStepStatus('decided', { stepIndex: 0 });
    var kB = Object.keys(mB._getState().stepStatus);
    check(kB.indexOf('scn-B::step-0') >= 0 && kB.indexOf('test-live-scn-01::step-0') >= 0,
          'T45: scenario A status does not collide with scenario B', kB.join(','));
})();

// ── Section K: paint DOM behaviour (T46-T50) ──────────────────────────────
console.log('\n─── Section K: paintLiveStepStatusRow DOM ───');
(function() {
    // T46: badge reflects stored status
    var dom = makeDomStub(STATUS_IDS);
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, dom);
    m.setLiveStepStatus('decided');
    m.paintLiveStepStatusRow();
    var badge = dom.getElementById('sw-live-step-status-badge');
    check(badge.getAttribute('data-status') === 'decided' && badge.textContent === 'Decided',
          'T46: badge data-status + label reflect stored status', badge.getAttribute('data-status'));

    // T47: actions shown when active step exists
    var acts = dom.getElementById('sw-live-step-status-actions');
    check(!acts.hasAttribute('hidden'), 'T47: actions visible with active step');

    // T48: summary shows rollup text
    var sum = dom.getElementById('sw-live-step-status-summary');
    check(sum.textContent.indexOf('of') >= 0 && sum.textContent.indexOf('3') >= 0,
          'T48: summary shows "... of <total>"', sum.textContent);

    // T49: reason shown when set
    var dom2 = makeDomStub(STATUS_IDS);
    var m2 = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, dom2);
    m2.setLiveStepStatus('blocked', { reason: 'awaiting ISR' });
    m2.paintLiveStepStatusRow();
    var reasonEl = dom2.getElementById('sw-live-step-status-reason');
    check(!reasonEl.hasAttribute('hidden') && reasonEl.textContent.indexOf('awaiting ISR') >= 0,
          'T49: reason row shown with reason text', reasonEl.textContent);

    // T50: actions hidden + pending badge when no scenario
    var dom3 = makeDomStub(STATUS_IDS);
    var m3 = buildModule({}, dom3);
    m3.paintLiveStepStatusRow();
    var acts3 = dom3.getElementById('sw-live-step-status-actions');
    var badge3 = dom3.getElementById('sw-live-step-status-badge');
    check(acts3.hasAttribute('hidden') && badge3.getAttribute('data-status') === 'pending',
          'T50: no scenario → actions hidden, badge pending');
})();

// ── Section L: app.html DOM IDs (T51-T58) ─────────────────────────────────
console.log('\n─── Section L: app.html DOM IDs ───');
[
    ['T51', 'sw-live-step-status-row'],
    ['T52', 'sw-live-step-status-badge'],
    ['T53', 'sw-live-step-status-actions'],
    ['T54', 'sw-live-step-status-clear-btn'],
    ['T55', 'sw-live-step-status-reason'],
    ['T56', 'sw-live-step-status-summary'],
    ['T57', 'sw-nav-status-badge'],
    ['T58', 'sw-live-scenario-status']
].forEach(function(p) {
    check(htmlSrc.indexOf('id="' + p[1] + '"') >= 0, p[0] + ': app.html has #' + p[1]);
});
// status buttons carry data-live-step-status
check((htmlSrc.match(/data-live-step-status="(decided|skipped|blocked)"/g) || []).length === 3,
      'T58b: three Mark buttons with data-live-step-status (decided/skipped/blocked)');
// status row lives inside the existing live decision card (not a new page)
check(htmlSrc.indexOf('id="sw-live-decision-card"') >= 0 &&
      htmlSrc.indexOf('sw-live-step-status-row') > htmlSrc.indexOf('id="sw-live-decision-card"'),
      'T58c: status row nested inside #sw-live-decision-card');

// ── Section M: i18n keys (T59-T60) ────────────────────────────────────────
console.log('\n─── Section M: i18n keys ───');
var STATUS_KEYS = [
    'sw-live-step-status-label', 'sw-live-step-status-pending', 'sw-live-step-status-decided',
    'sw-live-step-status-skipped', 'sw-live-step-status-blocked', 'sw-live-step-status-mark-decided',
    'sw-live-step-status-mark-skipped', 'sw-live-step-status-mark-blocked', 'sw-live-step-status-clear',
    'sw-live-step-status-reason-prefix'
];
var enBlock = i18nSrc.slice(i18nSrc.indexOf('en:'), i18nSrc.indexOf('ar:'));
var arBlock = i18nSrc.slice(i18nSrc.indexOf('ar:'));
var missEn = STATUS_KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
var missAr = STATUS_KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missEn.length === 0, 'T59: all EN status keys present', missEn.join(',') || 'all');
check(missAr.length === 0, 'T60: all AR status keys present', missAr.join(',') || 'all');
check(arBlock.indexOf('حالة الخطوة') >= 0, 'T60b: AR label text present in Arabic');

// ── Section N: CSS (T61) ──────────────────────────────────────────────────
console.log('\n─── Section N: CSS ───');
[
    '.sw-live-step-status-row', '.sw-live-step-status-badge', '.sw-live-step-status-actions',
    '.sw-live-step-status-btn', '.sw-live-step-status-clear-btn', '.sw-live-step-status-summary',
    '.sw-nav-status-badge', '.sw-live-scenario-status'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T61.' + (i + 1) + ': CSS ' + sel + ' defined');
});
check(cssSrc.indexOf('.sw-live-step-status-badge[data-status="decided"]') >= 0,
      'T61b: badge has per-status colour rules');

// ── Section O: wiring (T62-T66) ───────────────────────────────────────────
console.log('\n─── Section O: wiring ───');
var paintDecisionSrc = extractFn(swSrc, 'paintLiveDecisionActionCard');
check(paintDecisionSrc && /paintLiveStepStatusRow\s*\(/.test(paintDecisionSrc),
      'T62: paintLiveDecisionActionCard calls paintLiveStepStatusRow()');
var initSrc = extractFn(swSrc, '_initLiveDecisionActionCard');
check(initSrc && initSrc.indexOf('data-live-step-status') >= 0 &&
      initSrc.indexOf('sw-live-step-status-clear-btn') >= 0,
      'T63: click delegation wires status buttons + clear');
var refreshArea = swSrc.slice(swSrc.indexOf('refresh: function'), swSrc.indexOf('refresh: function') + 4000);
check(refreshArea.indexOf('paintLiveDecisionActionCard()') >= 0,
      'T64: refresh() still paints the live decision card (status row repaints with it)');
var navSrc = extractFn(swSrc, 'paintStepNavigator');
check(navSrc && navSrc.indexOf('sw-nav-status-badge') >= 0,
      'T65: paintStepNavigator paints the nav status badge');
var headerSrc = extractFn(swSrc, 'paintLiveScenarioHeader');
check(headerSrc && headerSrc.indexOf('sw-live-scenario-status') >= 0,
      'T66: paintLiveScenarioHeader paints the header status');

// ── Section P: reset on scenario load + state shape (T67-T68) ─────────────
console.log('\n─── Section P: reset on load + state shape ───');
var loadSrc = extractFn(swSrc, 'loadLiveScenarioFromJson');
check(loadSrc && loadSrc.indexOf('_liveOperatorWorkflowState.stepStatus = {}') >= 0,
      'T67: loadLiveScenarioFromJson resets stepStatus (scenario-scoped)');
check(/stepStatus:\s*\{\}/.test(swSrc),
      'T68: _liveOperatorWorkflowState declares stepStatus: {}');

// ── Section Q: forbidden tokens in new functions (T69-T76) ────────────────
console.log('\n─── Section Q: forbidden tokens in new functions ───');
var newFns =
    (extractFn(swSrc, 'getLiveStepKey')               || '') +
    (extractFn(swSrc, 'getLiveStepStatus')            || '') +
    (extractFn(swSrc, 'setLiveStepStatus')            || '') +
    (extractFn(swSrc, 'clearLiveStepStatus')          || '') +
    (extractFn(swSrc, 'getLiveScenarioStatusSummary') || '') +
    (extractFn(swSrc, 'paintLiveStepStatusRow')       || '') +
    (extractFn(swSrc, 'isLiveStepStatusValue')        || '') +
    (extractFn(swSrc, '_liveStepStatusLabel')         || '');

check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(newFns), 'T69: no fetch / XHR');
check(!/localStorage|sessionStorage|IndexedDB|indexedDB/.test(newFns),
      'T70: no localStorage / sessionStorage / IndexedDB');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7/i.test(newFns),
      'T71: no Gate 7 / apply / execute / commit endpoint');
check(!/window\.RmoozScenario\.scenario\s*=|scenario\.\w+\s*=/.test(newFns),
      'T72: no scenario object mutation');
check(!/window\.RmoozScenario\.stepIndex\s*=/.test(newFns),
      'T73: no stepIndex assignment (never advances the step)');
check(!/window\.units\s*=|window\.units\.push|window\.units\.splice/.test(newFns),
      'T74: no window.units mutation');
check(!/_w3PreviewLayer|_swScenarioOverlay|window\.lines|window\.map\./.test(newFns),
      'T75: no map / overlay / lines mutation');
check(!/_drpPreviewSource|praSelection|_w3CoaReviewRecord|expectedResult|AMBER[_ ]?RIDGE/.test(newFns),
      'T76: no dry-run / AMBER / praSelection / expectedResult usage');

// ── Section R: protected files unchanged (T77-T79) ────────────────────────
console.log('\n─── Section R: protected files unchanged ───');
if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T77: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    var appJs = fs.readFileSync(APP_JS, 'utf8');
    check(appJs.indexOf('setLiveStepStatus') < 0 && appJs.indexOf('_liveOperatorWorkflowState') < 0,
          'T78: app.js unchanged (no PR-287L references)');
}
if (fs.existsSync(ADJ_MAP)) {
    var adjMap = fs.readFileSync(ADJ_MAP, 'utf8');
    check(adjMap.indexOf('setLiveStepStatus') < 0 && adjMap.indexOf('_liveOperatorWorkflowState') < 0,
          'T79: adjudicator-map.js unchanged (no PR-287L references)');
}
// prior live exports still present
var prevExports = [
    'getLiveScenarioIdentity', 'getActiveLiveStepContext', 'recordLiveOperatorSelection',
    'clearLiveOperatorSelection', 'paintLiveDecisionActionCard', 'paintLiveScenarioHeader',
    'validateLiveScenarioJson', 'loadLiveScenarioFromJson'
];
var missPrev = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missPrev.length === 0, 'T79b: prior live exports still present', missPrev.join(',') || 'all');

// ── Final ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log('  PR-287L Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
