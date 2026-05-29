/**
 * test-pr-288L.js — PR-288L: Live Operator Event Log
 *
 * Surfaces _liveOperatorWorkflowState.events (the in-memory operator audit
 * trail, capped at 64) as a READ-ONLY tabular ops ledger:
 * DTG / Severity / Category / Source / Message. NOT chat-style. The ledger
 * columns are derived from raw events at read time; the only writer is
 * clearLiveOperatorEventLog. No scenario/unit/map mutation, backend, or storage.
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
const EVLOG_JS  = path.join(__dirname, 'UI_MOdified/client/shell/event-log.js');

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
            _evt: {}, firstChild: null, className: '',
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

// Build a module with PR-288L event-log functions + their deps. Paint-cascade
// functions (decision card / navigator / header) are stubbed no-ops so the
// event-generating helpers don't trigger unrelated paints during setup.
function buildModule(rmoozScenario, domStub) {
    var fnNames = [
        'getLiveScenarioIdentity', 'getActiveLiveStepContext', 'extractLiveDecisionOptions',
        '_liveOpKey', '_liveOpAppendEvent', 'recordLiveOperatorSelection',
        'clearLiveOperatorSelection',
        'isLiveStepStatusValue', '_liveStepStatusLabel', 'getLiveStepKey',
        'getLiveStepStatus', 'setLiveStepStatus', 'clearLiveStepStatus',
        'getLiveScenarioStatusSummary',
        // PR-288L
        '_liveOpFormatDtg', '_liveOpLedgerMsg', '_liveOpSeverityLabel', '_liveOpCategoryLabel',
        '_liveOpEventToLedgerRow', 'getLiveOperatorEventLog', 'clearLiveOperatorEventLog',
        '_initLiveEventLogCard', 'paintLiveOperatorEventLog', '_evlCell'
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
        'var _LIVE_STEP_STATUS_VALUES = ["pending","decided","skipped","blocked"];\n' +
        'var _LIVE_STEP_STATUS_DEFAULT = "pending";\n' +
        'var _liveEventLogWired = false;\n' +
        'var _liveDecisionCardWired = false;\n' +
        'function paintLiveDecisionActionCard() {}\n' +
        'function paintStepNavigator() {}\n' +
        'function paintLiveScenarioHeader() {}\n' +
        bodies + '\n' +
        'return {\n' +
        '  getLiveOperatorEventLog: getLiveOperatorEventLog,\n' +
        '  clearLiveOperatorEventLog: clearLiveOperatorEventLog,\n' +
        '  paintLiveOperatorEventLog: paintLiveOperatorEventLog,\n' +
        '  _liveOpEventToLedgerRow: _liveOpEventToLedgerRow,\n' +
        '  _liveOpFormatDtg: _liveOpFormatDtg,\n' +
        '  recordLiveOperatorSelection: recordLiveOperatorSelection,\n' +
        '  clearLiveOperatorSelection: clearLiveOperatorSelection,\n' +
        '  setLiveStepStatus: setLiveStepStatus,\n' +
        '  clearLiveStepStatus: clearLiveStepStatus,\n' +
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

var EVL_IDS = [
    'sw-live-event-log-card', 'sw-live-event-log-rows', 'sw-live-event-log-empty',
    'sw-live-event-log-count', 'sw-live-event-log-clear-btn', 'sw-live-event-log-table'
];

// ── Section A: Exports present (T1-T3) ────────────────────────────────────
console.log('\n─── Section A: Exports ───');
[
    ['T01', 'getLiveOperatorEventLog'], ['T02', 'clearLiveOperatorEventLog'],
    ['T03', 'paintLiveOperatorEventLog']
].forEach(function(p) {
    check(swSrc.indexOf(p[1] + ':') >= 0, p[0] + ': ' + p[1] + ' exported on public API');
});

// ── Section B: _liveOpFormatDtg (T4-T7) ───────────────────────────────────
console.log('\n─── Section B: _liveOpFormatDtg ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    check(m._liveOpFormatDtg('2026-05-29T14:03:22.123Z') === '2026-05-29 14:03:22Z',
          'T04: ISO → "YYYY-MM-DD HH:MM:SSZ"', m._liveOpFormatDtg('2026-05-29T14:03:22.123Z'));
    check(m._liveOpFormatDtg(null) === '—', 'T05: null → em dash');
    check(m._liveOpFormatDtg('') === '—', 'T06: empty → em dash');
    check(m._liveOpFormatDtg('not-a-date') === 'not-a-date',
          'T07: unparseable string returned as-is (no crash)');
})();

// ── Section C: _liveOpEventToLedgerRow mapping (T8-T19) ────────────────────
console.log('\n─── Section C: event → ledger row mapping ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));

    var rSel = m._liveOpEventToLedgerRow({ eventType: 'live_decision_selected',
        scenarioId: 'sc', stepIndex: 0, optionId: 'OPT-HOLD', at: '2026-05-29T01:02:03Z' });
    check(rSel.category === 'decision', 'T08: decision_selected → category decision');
    check(rSel.severity === 'info', 'T09: decision_selected → severity info');
    check(rSel.source === 'operator', 'T10: source is operator');
    check(rSel.message.indexOf('OPT-HOLD') >= 0 && rSel.message.indexOf('step 1') >= 0,
          'T11: decision_selected message names option + step (1-based)', rSel.message);

    var rClr = m._liveOpEventToLedgerRow({ eventType: 'live_decision_cleared',
        scenarioId: 'sc', stepIndex: 0, at: '2026-05-29T01:02:03Z' });
    check(rClr.category === 'decision' && rClr.message.indexOf('step 1') >= 0,
          'T12: decision_cleared → category decision, step in message', rClr.message);

    var rDec = m._liveOpEventToLedgerRow({ eventType: 'live_step_status_set',
        scenarioId: 'sc', stepIndex: 1, status: 'decided', at: '2026-05-29T01:02:03Z' });
    check(rDec.category === 'step-status', 'T13: status_set → category step-status');
    check(rDec.severity === 'info', 'T14: status_set decided → severity info');
    check(rDec.message.indexOf('step 2') >= 0 && rDec.message.indexOf('Decided') >= 0,
          'T15: status_set message names step (2) + status label', rDec.message);

    var rSkip = m._liveOpEventToLedgerRow({ eventType: 'live_step_status_set',
        scenarioId: 'sc', stepIndex: 0, status: 'skipped', at: '2026-05-29T01:02:03Z' });
    check(rSkip.severity === 'notice', 'T16: status_set skipped → severity notice', rSkip.severity);

    var rBlk = m._liveOpEventToLedgerRow({ eventType: 'live_step_status_set',
        scenarioId: 'sc', stepIndex: 0, status: 'blocked', at: '2026-05-29T01:02:03Z' });
    check(rBlk.severity === 'warning', 'T17: status_set blocked → severity warning', rBlk.severity);

    var rSc = m._liveOpEventToLedgerRow({ eventType: 'live_step_status_cleared',
        scenarioId: 'sc', stepIndex: 2, at: '2026-05-29T01:02:03Z' });
    check(rSc.category === 'step-status' && rSc.message.indexOf('step 3') >= 0,
          'T18: status_cleared → step-status, step 3 in message', rSc.message);

    var row = rSel;
    check(row.readOnly === true && row.committed === false,
          'T19: ledger row carries readOnly:true, committed:false');
})();

// ── Section D: getLiveOperatorEventLog (T20-T27) ──────────────────────────
console.log('\n─── Section D: getLiveOperatorEventLog ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    var empty = m.getLiveOperatorEventLog();
    check(empty.count === 0 && empty.rows.length === 0,
          'T20: empty log → count 0, no rows');
    check(empty.cap === 64, 'T21: cap exposed (64)', String(empty.cap));

    m.setLiveStepStatus('decided');                 // event 1
    m.recordLiveOperatorSelection('OPT-HOLD');      // event 2
    var log = m.getLiveOperatorEventLog();
    check(log.count === 2 && log.rows.length === 2, 'T22: two actions → count 2, 2 rows');

    // newest-first ordering: rows[0] is the most recent (decision selected)
    check(log.rows[0].eventType === 'live_decision_selected',
          'T23: rows are newest-first', log.rows[0].eventType);
    check(log.rows[1].eventType === 'live_step_status_set',
          'T23b: oldest row last', log.rows[1].eventType);

    // each row has the five ledger columns
    var r0 = log.rows[0];
    check(typeof r0.dtg === 'string' && typeof r0.severityLabel === 'string' &&
          typeof r0.categoryLabel === 'string' && typeof r0.sourceLabel === 'string' &&
          typeof r0.message === 'string',
          'T24: row exposes dtg/severityLabel/categoryLabel/sourceLabel/message');

    // raw chronological events deep-copied (oldest-first)
    check(log.events.length === 2 && log.events[0].eventType === 'live_step_status_set',
          'T25: events[] is raw chronological copy (oldest-first)');
    log.events.push({ eventType: 'HACK' });
    log.rows[0].message = 'HACKED';
    check(m.getLiveOperatorEventLog().count === 2 &&
          m.getLiveOperatorEventLog().rows[0].message !== 'HACKED',
          'T26: returned log is a deep copy (external mutation does not leak)');

    // cap enforcement: push 70 events, expect 64 retained
    var m2 = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    for (var i = 0; i < 70; i++) { m2.setLiveStepStatus(i % 2 ? 'decided' : 'skipped'); }
    var capped = m2.getLiveOperatorEventLog();
    check(capped.count === 64, 'T27: event log capped at 64 (oldest dropped)', String(capped.count));
})();

// ── Section E: clearLiveOperatorEventLog (T28-T31) ────────────────────────
console.log('\n─── Section E: clearLiveOperatorEventLog ───');
(function() {
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m.setLiveStepStatus('decided');
    m.setLiveStepStatus('blocked');
    var before = m.getLiveOperatorEventLog().count;
    var r = m.clearLiveOperatorEventLog();
    check(r.passed === true && r.cleared === true && r.clearedCount === before,
          'T28: clears events (cleared:true, clearedCount = prior count)', JSON.stringify(r));
    check(m.getLiveOperatorEventLog().count === 0, 'T29: log empty after clear');

    var r2 = m.clearLiveOperatorEventLog();
    check(r2.passed === true && r2.cleared === false && r2.clearedCount === 0,
          'T30: clearing empty log → passed:true, cleared:false');

    // clearing the LOG must NOT touch selections or stepStatus state
    var m3 = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, makeDomStub([]));
    m3.setLiveStepStatus('decided');
    m3.recordLiveOperatorSelection('OPT-HOLD');
    m3.clearLiveOperatorEventLog();
    var st = m3._getState();
    check(Object.keys(st.stepStatus).length === 1 && Object.keys(st.selections).length === 1,
          'T31: clearing the event log leaves stepStatus + selections intact');
})();

// ── Section F: paint DOM behaviour (T32-T38) ──────────────────────────────
console.log('\n─── Section F: paintLiveOperatorEventLog DOM ───');
(function() {
    var dom = makeDomStub(EVL_IDS);
    var m = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, dom);
    m.setLiveStepStatus('skipped');               // event 1 (notice)
    m.recordLiveOperatorSelection('OPT-HOLD');    // event 2 (info)
    m.paintLiveOperatorEventLog();

    var rowsEl  = dom.getElementById('sw-live-event-log-rows');
    var emptyEl = dom.getElementById('sw-live-event-log-empty');
    var clearEl = dom.getElementById('sw-live-event-log-clear-btn');
    var countEl = dom.getElementById('sw-live-event-log-count');

    check(rowsEl._children.length === 2, 'T32: two rows rendered into tbody',
          String(rowsEl._children.length));
    // each rendered row has 5 cells
    check(rowsEl._children[0]._children.length === 5,
          'T33: each row has 5 cells (DTG/Severity/Category/Source/Message)');
    // newest first → row 0 is the decision (info), row 1 is the status set (notice)
    check(rowsEl._children[0].getAttribute('data-severity') === 'info' &&
          rowsEl._children[1].getAttribute('data-severity') === 'notice',
          'T34: rows carry data-severity newest-first (info, notice)');
    check(rowsEl._children[0].getAttribute('data-category') === 'decision',
          'T35: row carries data-category');
    check(emptyEl.hasAttribute('hidden') && !clearEl.hasAttribute('hidden'),
          'T36: with rows → empty hidden, Clear button shown');
    check(countEl.textContent.indexOf('2') >= 0 && countEl.textContent.indexOf('64') >= 0,
          'T37: count line shows "2 of 64"', countEl.textContent);

    // empty case
    var dom2 = makeDomStub(EVL_IDS);
    var m2 = buildModule({ scenario: makeLiveScenario(), stepIndex: 0 }, dom2);
    m2.paintLiveOperatorEventLog();
    var empty2 = dom2.getElementById('sw-live-event-log-empty');
    var clear2 = dom2.getElementById('sw-live-event-log-clear-btn');
    var rows2  = dom2.getElementById('sw-live-event-log-rows');
    check(!empty2.hasAttribute('hidden') && clear2.hasAttribute('hidden') &&
          rows2._children.length === 0,
          'T38: no events → empty shown, Clear hidden, no rows');
})();

// ── Section G: app.html DOM IDs + placement (T39-T49) ─────────────────────
console.log('\n─── Section G: app.html DOM IDs ───');
[
    ['T39', 'sw-live-event-log-card'],
    ['T40', 'sw-live-event-log-title'],
    ['T41', 'sw-live-event-log-clear-btn'],
    ['T42', 'sw-live-event-log-subtitle'],
    ['T43', 'sw-live-event-log-table'],
    ['T44', 'sw-live-event-log-rows'],
    ['T45', 'sw-live-event-log-empty'],
    ['T46', 'sw-live-event-log-count']
].forEach(function(p) {
    check(htmlSrc.indexOf('id="' + p[1] + '"') >= 0, p[0] + ': app.html has #' + p[1]);
});
// the five ledger columns are present as table headers (tabular, NOT chat)
check((htmlSrc.match(/data-i18n="sw-live-event-log-col-(dtg|severity|category|source|message)"/g) || []).length === 5,
      'T47: five tabular column headers present (DTG/Severity/Category/Source/Message)');
// event-log card lives inside #sw-live-workspace, AFTER the decision card
var lwStart  = htmlSrc.indexOf('id="sw-live-workspace"');
var lwEnd    = htmlSrc.indexOf('/#sw-live-workspace');
var cardPos  = htmlSrc.indexOf('id="sw-live-event-log-card"');
var decPos   = htmlSrc.indexOf('id="sw-live-decision-card"');
check(cardPos > lwStart && cardPos < lwEnd,
      'T48: event-log card nested inside #sw-live-workspace');
check(cardPos > decPos,
      'T49: event-log card placed after the live decision card');

// ── Section H: i18n keys (T50-T52) ────────────────────────────────────────
console.log('\n─── Section H: i18n keys ───');
var EVL_KEYS = [
    'sw-live-event-log-title', 'sw-live-event-log-subtitle', 'sw-live-event-log-clear',
    'sw-live-event-log-empty', 'sw-live-event-log-col-dtg', 'sw-live-event-log-col-severity',
    'sw-live-event-log-col-category', 'sw-live-event-log-col-source', 'sw-live-event-log-col-message',
    'sw-live-event-log-count-fmt', 'sw-live-event-log-source-operator',
    'sw-live-event-log-sev-info', 'sw-live-event-log-sev-notice', 'sw-live-event-log-sev-warning',
    'sw-live-event-log-cat-decision', 'sw-live-event-log-cat-step-status', 'sw-live-event-log-cat-general',
    'sw-live-event-log-msg-decision-selected', 'sw-live-event-log-msg-decision-cleared',
    'sw-live-event-log-msg-status-set', 'sw-live-event-log-msg-status-cleared'
];
var enBlock = i18nSrc.slice(i18nSrc.indexOf('en:'), i18nSrc.indexOf('ar:'));
var arBlock = i18nSrc.slice(i18nSrc.indexOf('ar:'));
var missEn = EVL_KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
var missAr = EVL_KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missEn.length === 0, 'T50: all EN event-log keys present', missEn.join(',') || 'all');
check(missAr.length === 0, 'T51: all AR event-log keys present', missAr.join(',') || 'all');
check(arBlock.indexOf('سجل أحداث المشغّل الحي') >= 0, 'T52: AR title text present in Arabic');

// ── Section I: CSS (T53-T55) ──────────────────────────────────────────────
console.log('\n─── Section I: CSS ───');
[
    '.sw-live-event-log-card', '.sw-live-event-log-table', '.sw-live-event-log-clear-btn',
    '.sw-live-event-log-empty', '.sw-live-event-log-count', '.sw-evl-cell-message'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T53.' + (i + 1) + ': CSS ' + sel + ' defined');
});
check(cssSrc.indexOf('tr[data-severity="warning"]') >= 0,
      'T54: per-severity row colour rules present');
check(cssSrc.indexOf('.sw-live-event-log-table thead th') >= 0 &&
      cssSrc.indexOf('border-collapse') >= 0,
      'T55: ledger styled as a table (thead th + border-collapse)');

// ── Section J: NOT chat-style (MEMORY: event-log-not-chat) (T56-T58) ──────
console.log('\n─── Section J: tabular ledger, NOT chat ───');
var cardHtml = htmlSrc.slice(cardPos, htmlSrc.indexOf('</div>', htmlSrc.indexOf('sw-live-event-log-count')));
check(cardHtml.indexOf('<table') >= 0 && cardHtml.indexOf('<thead') >= 0 &&
      cardHtml.indexOf('<tbody') >= 0,
      'T56: event-log card uses a real <table>/<thead>/<tbody>');
check(!/avatar|bubble|speaker|chat-lane|message-bubble/i.test(cardHtml + ' ' +
      cssSrc.slice(cssSrc.indexOf('PR-288L'), cssSrc.indexOf('PR-288L') + 2500)),
      'T57: no avatar / bubble / speaker-lane styling (per MEMORY constraint)');
// the GLOBAL #event-log ledger is left untouched (still a log aside)
check(htmlSrc.indexOf('id="event-log"') >= 0 && htmlSrc.indexOf('role="log"') >= 0,
      'T58: global #event-log ops ledger still present + untouched');

// ── Section K: wiring (T59-T62) ───────────────────────────────────────────
console.log('\n─── Section K: wiring ───');
var paintDecisionSrc = extractFn(swSrc, 'paintLiveDecisionActionCard');
check(paintDecisionSrc && /paintLiveOperatorEventLog\s*\(/.test(paintDecisionSrc),
      'T59: paintLiveDecisionActionCard calls paintLiveOperatorEventLog()');
var initSrc = extractFn(swSrc, '_initLiveEventLogCard');
check(initSrc && initSrc.indexOf('sw-live-event-log-clear-btn') >= 0 &&
      initSrc.indexOf('clearLiveOperatorEventLog') >= 0,
      'T60: _initLiveEventLogCard wires the Clear-log button');
var refreshArea = swSrc.slice(swSrc.indexOf('refresh: function'), swSrc.indexOf('refresh: function') + 4000);
check(refreshArea.indexOf('paintLiveDecisionActionCard()') >= 0,
      'T61: refresh() paints the decision card (event log repaints in the same chokepoint)');
var clearFnSrc = extractFn(swSrc, 'clearLiveOperatorEventLog');
check(clearFnSrc && /paintLiveOperatorEventLog\s*\(/.test(clearFnSrc),
      'T62: clearLiveOperatorEventLog repaints the ledger');

// ── Section L: events array intentionally NOT reset on load (T63-T64) ─────
console.log('\n─── Section L: events persistence on load ───');
var loadSrc = extractFn(swSrc, 'loadLiveScenarioFromJson');
check(loadSrc && loadSrc.indexOf('_liveOperatorWorkflowState.events = []') < 0,
      'T63: loadLiveScenarioFromJson does NOT clear events (audit trail kept across loads)');
check(loadSrc && loadSrc.indexOf('_liveOperatorWorkflowState.selections = {}') >= 0,
      'T64: load still resets selections (scenario-scoped) — contrast with events');

// ── Section M: forbidden tokens in new functions (T65-T72) ────────────────
console.log('\n─── Section M: forbidden tokens in new functions ───');
var newFns =
    (extractFn(swSrc, '_liveOpFormatDtg')        || '') +
    (extractFn(swSrc, '_liveOpLedgerMsg')        || '') +
    (extractFn(swSrc, '_liveOpSeverityLabel')    || '') +
    (extractFn(swSrc, '_liveOpCategoryLabel')    || '') +
    (extractFn(swSrc, '_liveOpEventToLedgerRow') || '') +
    (extractFn(swSrc, 'getLiveOperatorEventLog') || '') +
    (extractFn(swSrc, 'clearLiveOperatorEventLog')|| '') +
    (extractFn(swSrc, '_initLiveEventLogCard')   || '') +
    (extractFn(swSrc, 'paintLiveOperatorEventLog')|| '') +
    (extractFn(swSrc, '_evlCell')                || '');

check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(newFns), 'T65: no fetch / XHR');
check(!/localStorage|sessionStorage|IndexedDB|indexedDB/.test(newFns),
      'T66: no localStorage / sessionStorage / IndexedDB');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7/i.test(newFns),
      'T67: no Gate 7 / apply / execute / commit endpoint');
check(!/window\.RmoozScenario\.scenario\s*=|scenario\.\w+\s*=/.test(newFns),
      'T68: no scenario object mutation');
check(!/window\.RmoozScenario\.stepIndex\s*=/.test(newFns),
      'T69: no stepIndex assignment (never advances the step)');
check(!/window\.units\s*=|window\.units\.push|window\.units\.splice/.test(newFns),
      'T70: no window.units mutation');
check(!/_w3PreviewLayer|_swScenarioOverlay|window\.lines|window\.map\./.test(newFns),
      'T71: no map / overlay / lines mutation');
check(!/_drpPreviewSource|praSelection|expectedResult|AMBER[_ ]?RIDGE/.test(newFns),
      'T72: no dry-run / AMBER / praSelection / expectedResult usage');
// clearLiveOperatorEventLog is the ONLY writer, and only to .events
check(/_liveOperatorWorkflowState\.events\s*=\s*\[\]/.test(clearFnSrc),
      'T72b: clearLiveOperatorEventLog only writes _liveOperatorWorkflowState.events = []');

// ── Section N: protected files unchanged (T73-T77) ────────────────────────
console.log('\n─── Section N: protected files unchanged ───');
if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T73: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    var appJs = fs.readFileSync(APP_JS, 'utf8');
    check(appJs.indexOf('getLiveOperatorEventLog') < 0 && appJs.indexOf('_liveOperatorWorkflowState') < 0,
          'T74: app.js unchanged (no PR-288L references)');
}
if (fs.existsSync(ADJ_MAP)) {
    var adjMap = fs.readFileSync(ADJ_MAP, 'utf8');
    check(adjMap.indexOf('getLiveOperatorEventLog') < 0 && adjMap.indexOf('_liveOperatorWorkflowState') < 0,
          'T75: adjudicator-map.js unchanged (no PR-288L references)');
}
if (fs.existsSync(EVLOG_JS)) {
    var evlogJs = fs.readFileSync(EVLOG_JS, 'utf8');
    check(evlogJs.indexOf('getLiveOperatorEventLog') < 0 &&
          evlogJs.indexOf('sw-live-event-log') < 0,
          'T76: global event-log.js renderer untouched (separate from the SW live ledger)');
}
// prior live exports still present
var prevExports = [
    'getLiveScenarioIdentity', 'recordLiveOperatorSelection', 'clearLiveOperatorSelection',
    'paintLiveDecisionActionCard', 'paintLiveScenarioHeader', 'getLiveStepStatus',
    'setLiveStepStatus', 'getLiveScenarioStatusSummary', 'loadLiveScenarioFromJson'
];
var missPrev = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missPrev.length === 0, 'T77: prior live exports still present', missPrev.join(',') || 'all');

// ── Final ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log('  PR-288L Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
