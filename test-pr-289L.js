/**
 * test-pr-289L.js — PR-289L: Live Step Involved Units (read-only step context)
 *
 * For the ACTIVE step, derives the units involved this step from
 * window.RmoozScenario.scenario: step.actors (acting) + step.affected (impacted),
 * resolved against the scenario OOB (red_units / blue_units_initial) for identity
 * (label / side / role / domain). Pure read — no mutation, no backend, no
 * adjudication, no casualty/damage numbers (involvement category only).
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

// ── helpers ──────────────────────────────────────────────────────────────────
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
            id: id, _text: '', _children: [], _attrs: { hidden: '' }, _evt: {},
            firstChild: null, className: '', style: {},
            setAttribute: function(k, v) { this._attrs[k] = v; },
            removeAttribute: function(k) { delete this._attrs[k]; },
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
                className: '', firstChild: null,
                setAttribute: function(k, v) { this._attrs[k] = v; },
                removeAttribute: function(k) { delete this._attrs[k]; },
                hasAttribute: function(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
                getAttribute: function(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
                appendChild: function(c) { this._children.push(c); this.firstChild = this._children[0]; },
                get textContent() { return this._text; },
                set textContent(v) { this._text = v; }
            };
        }
    };
}

function buildModule(rmoozScenario, domStub) {
    var fnNames = [
        'getLiveScenarioIdentity', 'getActiveLiveStepContext', '_liveOpLedgerMsg',
        // PR-289L
        'buildLiveOobUnitIndex', 'buildLiveStepInvolvedUnits',
        '_liveInvolveLabel', '_liveSideLabel',
        'getLiveStepInvolvedUnits', 'paintLiveStepInvolvedUnits', '_sluCell',
        // PHASE-6C readiness/supply cells (paintLiveStepInvolvedUnits now calls these)
        '_liveReadinessLabel', '_liveSupplyLabel',
        // TASK-series orders/tasking cells (paint also calls these now)
        '_liveOpKey', '_sluCellOrders', '_sluTaskingLabel'
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
        bodies + '\n' +
        'return {\n' +
        '  buildLiveOobUnitIndex: buildLiveOobUnitIndex,\n' +
        '  buildLiveStepInvolvedUnits: buildLiveStepInvolvedUnits,\n' +
        '  getLiveStepInvolvedUnits: getLiveStepInvolvedUnits,\n' +
        '  paintLiveStepInvolvedUnits: paintLiveStepInvolvedUnits,\n' +
        '  _liveSideLabel: _liveSideLabel,\n' +
        '  _liveInvolveLabel: _liveInvolveLabel\n' +
        '};';
    return (new Function(harness))({ RmoozScenario: rmoozScenario }, domStub);
}

// Synthetic scenario exercising resolution, both-involvement, unresolved fallback,
// and an empty step.
function makeScenario() {
    return {
        scenario_id: 'pr289L-unit-scn',
        scenario_label: 'PR-289L Unit Scenario',
        red_units: [
            { uid: 'R-1', label: 'Red HQ',   role: 'command',  domain: 'land', echelon: 'div' },
            { uid: 'R-2', label: 'Red Mech', role: 'maneuver', domain: 'land', echelon: 'bde' }
        ],
        blue_units_initial: [
            { unit_uid: 'B-1', label: 'Blue Bn',  role: 'defense', domain: 'land' },
            { unit_uid: 'B-2', label: 'Blue Air', role: 'cap',     domain: 'air'  }
        ],
        steps: [
            { index: 0, phase: 'briefing',
              actors: [
                  { uid: 'R-1', side: 'RED', action_component: 'land' },
                  { uid: 'R-2', side: 'RED' }
              ],
              affected: [
                  { uid: 'B-1', side: 'BLUE', status_change: 'damaged_partial', damage_pct: 0.3 },
                  { uid: 'R-2', side: 'RED' }   // R-2 acts AND is affected → 'both'
              ] },
            { index: 1, phase: 'planning' },     // no actors/affected → empty
            { index: 2, phase: 'execution',
              actors:   [ { uid: 'B-2', side: 'BLUE' } ],
              affected: [ { uid: 'X-9', side: 'RED' } ]  // X-9 not in OOB → unresolved fallback
            }
        ]
    };
}

var SLU_IDS = [
    'sw-live-step-units-card', 'sw-live-step-units-rows', 'sw-live-step-units-empty',
    'sw-live-step-units-count', 'sw-live-step-units-table'
];

// ── Section A: Exports (T01-T02) ──────────────────────────────────────────────
console.log('\n─── Section A: Exports ───');
check(swSrc.indexOf('getLiveStepInvolvedUnits:') >= 0, 'T01: getLiveStepInvolvedUnits exported');
check(swSrc.indexOf('paintLiveStepInvolvedUnits:') >= 0, 'T02: paintLiveStepInvolvedUnits exported');

// ── Section B: buildLiveOobUnitIndex (T03-T08) ────────────────────────────────
console.log('\n─── Section B: buildLiveOobUnitIndex ───');
(function() {
    var m = buildModule({ scenario: makeScenario(), stepIndex: 0 }, makeDomStub([]));
    var idx = m.buildLiveOobUnitIndex(makeScenario());
    check(idx.redCount === 2 && idx.blueCount === 2, 'T03: counts red 2 + blue 2',
          'red=' + idx.redCount + ' blue=' + idx.blueCount);
    check(idx.index['R-1'] && idx.index['R-1'].side === 'RED', 'T04: red indexed by uid w/ side RED');
    check(idx.index['B-1'] && idx.index['B-1'].side === 'BLUE', 'T05: blue indexed by unit_uid w/ side BLUE');
    check(idx.index['R-1'].label === 'Red HQ' && idx.index['R-1'].role === 'command' &&
          idx.index['R-1'].domain === 'land', 'T06: identity fields resolved (label/role/domain)');
    var empty = m.buildLiveOobUnitIndex(null);
    check(empty.redCount === 0 && empty.blueCount === 0 && Object.keys(empty.index).length === 0,
          'T07: null scenario → empty index (no crash)');
    var partial = m.buildLiveOobUnitIndex({ red_units: [{ uid: 'R-9' }] });
    check(partial.redCount === 1 && partial.index['R-9'].label === 'R-9' &&
          partial.index['R-9'].role === null,
          'T08: missing label falls back to uid; missing role → null');
})();

// ── Section C: buildLiveStepInvolvedUnits (T09-T20) ───────────────────────────
console.log('\n─── Section C: buildLiveStepInvolvedUnits ───');
(function() {
    var scn = makeScenario();
    var m = buildModule({ scenario: scn, stepIndex: 0 }, makeDomStub([]));
    var b0 = m.buildLiveStepInvolvedUnits(scn.steps[0], scn);
    check(b0.passed === true, 'T09: passed:true for a valid step');
    check(b0.units.length === 3, 'T10: step 0 → 3 unique involved units (R-1,R-2,B-1)',
          String(b0.units.length));
    // ordering: actors first, in order, then affected-only
    check(b0.units[0].uid === 'R-1' && b0.units[1].uid === 'R-2' && b0.units[2].uid === 'B-1',
          'T11: ordering = actors first (R-1,R-2) then affected-only (B-1)',
          b0.units.map(function(u){return u.uid;}).join(','));
    check(b0.units[0].involvement === 'acts', 'T12: R-1 involvement = acts');
    check(b0.units[1].involvement === 'both', 'T13: R-2 (actor + affected) involvement = both');
    check(b0.units[2].involvement === 'affected', 'T14: B-1 involvement = affected');
    check(b0.units[0].side === 'RED' && b0.units[0].label === 'Red HQ' &&
          b0.units[0].role === 'command' && b0.units[0].domain === 'land' && b0.units[0].resolved === true,
          'T15: R-1 fully resolved from OOB');
    check(b0.counts.total === 3 && b0.counts.acting === 2 && b0.counts.affected === 2 && b0.counts.both === 1,
          'T16: counts total 3 / acting 2 / affected 2 / both 1', JSON.stringify(b0.counts));
    check(b0.units[0].readOnly === true, 'T17: units carry readOnly:true');

    // step 2: unresolved unit falls back to entry side + uid label
    var b2 = m.buildLiveStepInvolvedUnits(scn.steps[2], scn);
    var x9 = b2.units.filter(function(u){ return u.uid === 'X-9'; })[0];
    check(x9 && x9.resolved === false && x9.side === 'RED' && x9.label === 'X-9' && x9.role === null,
          'T18: unresolved uid → resolved:false, fallback side, label=uid, role null');
    check(b2.units[0].uid === 'B-2' && b2.units[0].resolved === true && b2.units[0].side === 'BLUE',
          'T19: B-2 resolved BLUE, actor-first ordering holds');

    // null / empty step handling
    var bn = m.buildLiveStepInvolvedUnits(null, scn);
    check(bn.passed === false && bn.units.length === 0 && bn.warnings.indexOf('STEP_NULL_OR_INVALID') >= 0,
          'T20: null step → passed:false, no units, warning');
})();

// ── Section D: getLiveStepInvolvedUnits (T21-T26) ─────────────────────────────
console.log('\n─── Section D: getLiveStepInvolvedUnits ───');
(function() {
    var scn = makeScenario();
    var m0 = buildModule({ scenario: scn, stepIndex: 0 }, makeDomStub([]));
    var g0 = m0.getLiveStepInvolvedUnits();              // default = active (0)
    check(g0.stepIndex === 0 && g0.count === 3 && g0.units.length === 3,
          'T21: active step (0) → count 3', 'idx=' + g0.stepIndex + ' count=' + g0.count);
    check(g0.counts && g0.counts.acting === 2 && g0.counts.affected === 2,
          'T22: counts surfaced on public API', JSON.stringify(g0.counts));

    // explicit stepIndex arg overrides active
    var g1 = m0.getLiveStepInvolvedUnits(1);
    check(g1.stepIndex === 1 && g1.count === 0 && g1.units.length === 0,
          'T23: explicit empty step (1) → count 0', 'count=' + g1.count);
    var g2 = m0.getLiveStepInvolvedUnits(2);
    check(g2.stepIndex === 2 && g2.count === 2, 'T24: explicit step (2) → count 2', 'count=' + g2.count);

    // active index follows the slot
    var mActive = buildModule({ scenario: scn, stepIndex: 2 }, makeDomStub([]));
    check(mActive.getLiveStepInvolvedUnits().stepIndex === 2,
          'T25: default stepIndex tracks window.RmoozScenario.stepIndex');

    // no scenario → safe empty
    var mNone = buildModule({ scenario: null, stepIndex: 0 }, makeDomStub([]));
    var gNone = mNone.getLiveStepInvolvedUnits();
    check(gNone.count === 0 && gNone.units.length === 0, 'T26: no scenario → empty, no crash');
})();

// ── Section E: paintLiveStepInvolvedUnits DOM (T27-T35) ───────────────────────
console.log('\n─── Section E: paint DOM ───');
(function() {
    var scn = makeScenario();
    var dom = makeDomStub(SLU_IDS);
    var m = buildModule({ scenario: scn, stepIndex: 0 }, dom);
    m.paintLiveStepInvolvedUnits();

    var rowsEl  = dom.getElementById('sw-live-step-units-rows');
    var emptyEl = dom.getElementById('sw-live-step-units-empty');
    var countEl = dom.getElementById('sw-live-step-units-count');

    check(rowsEl._children.length === 3, 'T27: 3 rows rendered into tbody',
          String(rowsEl._children.length));
    check(rowsEl._children[0]._children.length === 5,
          'T28: each row has 5 cells (Unit/Side/Role/Domain/Involvement)');
    check(rowsEl._children[0].getAttribute('data-side') === 'RED' &&
          rowsEl._children[2].getAttribute('data-side') === 'BLUE',
          'T29: rows carry data-side (RED first, BLUE B-1)');
    check(rowsEl._children[1].getAttribute('data-involvement') === 'both',
          'T30: R-2 row carries data-involvement="both"');
    check(rowsEl._children[0]._children[0].textContent === 'Red HQ',
          'T31: first cell shows resolved label (Red HQ)', rowsEl._children[0]._children[0].textContent);
    check(emptyEl.hasAttribute('hidden'), 'T32: with rows → empty state hidden');
    check(countEl.textContent.indexOf('3') >= 0 && countEl.textContent.indexOf('2') >= 0,
          'T33: count line shows totals (3 units · 2 acting · 2 affected)', countEl.textContent);

    // empty step
    var dom2 = makeDomStub(SLU_IDS);
    var m2 = buildModule({ scenario: scn, stepIndex: 1 }, dom2);
    m2.paintLiveStepInvolvedUnits();
    check(!dom2.getElementById('sw-live-step-units-empty').hasAttribute('hidden') &&
          dom2.getElementById('sw-live-step-units-rows')._children.length === 0,
          'T34: empty step → empty shown, no rows');
    check(dom2.getElementById('sw-live-step-units-count').textContent.indexOf('0') >= 0,
          'T35: empty step → count shows 0',
          dom2.getElementById('sw-live-step-units-count').textContent);
})();

// ── Section F: app.html IDs + placement (T36-T46) ─────────────────────────────
console.log('\n─── Section F: app.html DOM IDs + placement ───');
[
    'sw-live-step-units-card', 'sw-live-step-units-title', 'sw-live-step-units-subtitle',
    'sw-live-step-units-table', 'sw-live-step-units-rows', 'sw-live-step-units-empty',
    'sw-live-step-units-count'
].forEach(function(id, i) {
    check(htmlSrc.indexOf('id="' + id + '"') >= 0, 'T3' + (6 + i) + ': app.html has #' + id);
});
check((htmlSrc.match(/data-i18n="sw-live-step-units-col-(unit|side|role|domain|involvement)"/g) || []).length === 5,
      'T43: five tabular column headers present (Unit/Side/Role/Domain/Involvement)');
var lwStart = htmlSrc.indexOf('id="sw-live-workspace"');
var cardPos = htmlSrc.indexOf('id="sw-live-step-units-card"');
var decPos  = htmlSrc.indexOf('id="sw-live-decision-card"');
var evlPos  = htmlSrc.indexOf('id="sw-live-event-log-card"');
check(lwStart >= 0 && cardPos > lwStart, 'T44: units card nested inside #sw-live-workspace');
check(cardPos > decPos, 'T45: units card placed AFTER the live decision card');
check(cardPos < evlPos, 'T46: units card placed BEFORE the event-log card (decision → units → log)');

// ── Section G: i18n (T47-T49) ─────────────────────────────────────────────────
console.log('\n─── Section G: i18n keys ───');
var SLU_KEYS = [
    'sw-live-step-units-title', 'sw-live-step-units-subtitle', 'sw-live-step-units-empty',
    'sw-live-step-units-count-fmt', 'sw-live-step-units-col-unit', 'sw-live-step-units-col-side',
    'sw-live-step-units-col-role', 'sw-live-step-units-col-domain', 'sw-live-step-units-col-involvement',
    'sw-live-step-units-side-red', 'sw-live-step-units-side-blue',
    'sw-live-step-units-involve-acts', 'sw-live-step-units-involve-affected', 'sw-live-step-units-involve-both'
];
var enBlock = i18nSrc.slice(i18nSrc.indexOf('en:'), i18nSrc.indexOf('ar:'));
var arBlock = i18nSrc.slice(i18nSrc.indexOf('ar:'));
var missEn = SLU_KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
var missAr = SLU_KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missEn.length === 0, 'T47: all EN involved-units keys present', missEn.join(',') || 'all');
check(missAr.length === 0, 'T48: all AR involved-units keys present', missAr.join(',') || 'all');
check(arBlock.indexOf('الوحدات المعنية') >= 0, 'T49: AR title text present in Arabic');

// ── Section H: CSS (T50-T53) ──────────────────────────────────────────────────
console.log('\n─── Section H: CSS ───');
[
    '.sw-live-step-units-card', '.sw-live-step-units-table',
    '.sw-live-step-units-empty', '.sw-live-step-units-count'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T5' + i + ': CSS ' + sel + ' defined');
});
check(cssSrc.indexOf('tr[data-side="RED"]') >= 0 && cssSrc.indexOf('tr[data-side="BLUE"]') >= 0,
      'T53: per-side row colour rules present');

// ── Section I: wiring (T54-T56) ───────────────────────────────────────────────
console.log('\n─── Section I: wiring ───');
var paintDecisionSrc = extractFn(swSrc, 'paintLiveDecisionActionCard');
check(paintDecisionSrc && /paintLiveStepInvolvedUnits\s*\(/.test(paintDecisionSrc),
      'T54: paintLiveDecisionActionCard calls paintLiveStepInvolvedUnits()');
var refreshArea = swSrc.slice(swSrc.indexOf('refresh: function'), swSrc.indexOf('refresh: function') + 4000);
check(refreshArea.indexOf('paintLiveDecisionActionCard()') >= 0,
      'T55: refresh() paints the decision card (units card repaints in the same chokepoint)');
// involved-units card is closely grouped with the decision/step context (same workspace section)
check(cardPos > lwStart && evlPos > lwStart,
      'T56: units + event-log cards both live in the live workspace section');

// ── Section J: forbidden tokens + no adjudication (T57-T66) ───────────────────
console.log('\n─── Section J: forbidden tokens + no adjudication ───');
var newFns =
    (extractFn(swSrc, 'buildLiveOobUnitIndex')      || '') +
    (extractFn(swSrc, 'buildLiveStepInvolvedUnits') || '') +
    (extractFn(swSrc, '_liveInvolveLabel')          || '') +
    (extractFn(swSrc, '_liveSideLabel')             || '') +
    (extractFn(swSrc, 'getLiveStepInvolvedUnits')   || '') +
    (extractFn(swSrc, 'paintLiveStepInvolvedUnits') || '') +
    (extractFn(swSrc, '_sluCell')                   || '');

check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(newFns), 'T57: no fetch / XHR');
check(!/localStorage|sessionStorage|IndexedDB|indexedDB/.test(newFns),
      'T58: no localStorage / sessionStorage / IndexedDB');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7/i.test(newFns),
      'T59: no Gate 7 / apply / execute / commit endpoint');
check(!/window\.RmoozScenario\.scenario\s*=|window\.RmoozScenario\.stepIndex\s*=/.test(newFns),
      'T60: no scenario / stepIndex mutation (never advances or rewrites the scenario)');
check(!/window\.units\s*=|window\.units\.(push|splice)|_w3PreviewLayer|window\.lines|window\.map\./.test(newFns),
      'T61: no unit / map / overlay mutation');
check(!/_drpPreviewSource|praSelection|expectedResult|AMBER[_ ]?RIDGE/.test(newFns),
      'T62: no dry-run / AMBER / praSelection / expectedResult usage');
// no invented combat outcomes / casualties / adjudication: the new fns must NOT
// read or render damage / status_change / casualty / destroyed / kills fields.
check(!/damage_pct|status_change|casualt|destroyed|kills|losses|adjudicat/i.test(newFns),
      'T63: never surfaces casualty / damage / adjudication fields (involvement category only)');
check(!/addEventListener/.test(newFns), 'T64: read-only — no event listeners wired (no interactivity)');
// the only state the fns touch is a locally-built index object — no module-state writes
check(!/_liveOperatorWorkflowState/.test(newFns),
      'T65: does not touch operator workflow state (pure derivation from scenario)');
check(/buildLiveOobUnitIndex\(/.test(extractFn(swSrc, 'buildLiveStepInvolvedUnits') || ''),
      'T66: derivation resolves identity via the OOB index (not invented)');

// ── Section K: read-only — no forbidden buttons in the card (T67-T68) ─────────
console.log('\n─── Section K: read-only (no action buttons) ───');
var cardHtml = htmlSrc.slice(cardPos, htmlSrc.indexOf('</div>', htmlSrc.indexOf('sw-live-step-units-count')));
check(cardHtml.indexOf('<button') < 0,
      'T67: involved-units card contains no <button> (read-only context list)');
check(!/\b(Apply|Commit|Execute|Run|Go ?Live|Approve|Confirm|Adjudicate)\b/i.test(cardHtml),
      'T68: no Apply/Commit/Execute/Run/Go-Live/Approve/Confirm/Adjudicate affordances');

// ── Section L: protected files unchanged (T69-T74) ────────────────────────────
console.log('\n─── Section L: protected files unchanged ───');
if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T69: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    var appJs = fs.readFileSync(APP_JS, 'utf8');
    check(appJs.indexOf('getLiveStepInvolvedUnits') < 0 && appJs.indexOf('buildLiveStepInvolvedUnits') < 0,
          'T70: app.js unchanged (no PR-289L references)');
}
if (fs.existsSync(ADJ_MAP)) {
    var adjMap = fs.readFileSync(ADJ_MAP, 'utf8');
    check(adjMap.indexOf('getLiveStepInvolvedUnits') < 0 && adjMap.indexOf('buildLiveStepInvolvedUnits') < 0,
          'T71: adjudicator-map.js unchanged (no PR-289L references)');
}
var prevExports = [
    'getLiveStepStatus', 'setLiveStepStatus', 'getLiveScenarioStatusSummary',
    'getLiveOperatorEventLog', 'clearLiveOperatorEventLog', 'paintLiveOperatorEventLog',
    'recordLiveOperatorSelection', 'paintLiveDecisionActionCard', 'loadLiveScenarioFromJson'
];
var missPrev = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missPrev.length === 0, 'T72: prior live exports (incl. PR-287L/288L) still present',
      missPrev.join(',') || 'all');
// PR-288L event-log card is still intact (we inserted BEFORE it, not over it)
check(htmlSrc.indexOf('id="sw-live-event-log-card"') >= 0,
      'T73: PR-288L event-log card still present');
check(htmlSrc.indexOf('id="event-log"') >= 0 && htmlSrc.indexOf('role="log"') >= 0,
      'T74: global #event-log ledger still present + untouched');

// ── Section M: real wargame3.json cross-check (T75-T80) ───────────────────────
console.log('\n─── Section M: real wargame3.json derivation ───');
(function() {
    if (!fs.existsSync(W3_PATH)) { check(true, 'T75-T80: wargame3.json absent — skipped'); return; }
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    var STEP = 8;
    var step = w3.steps[STEP];
    var m = buildModule({ scenario: w3, stepIndex: STEP }, makeDomStub([]));
    var built = m.buildLiveStepInvolvedUnits(step, w3);

    // independent ground-truth from the raw file
    function uniq(arr, role) {
        var seen = {}, n = 0;
        (arr || []).forEach(function(e) {
            var u = e && (e.uid || e.unit_uid || e.id);
            if (u && !seen[u]) { seen[u] = true; n++; }
        });
        return { set: seen, count: n };
    }
    var actU = uniq(step.actors);
    var affU = uniq(step.affected);
    var union = {}; var unionN = 0;
    Object.keys(actU.set).forEach(function(u){ if(!union[u]){union[u]=true;unionN++;} });
    Object.keys(affU.set).forEach(function(u){ if(!union[u]){union[u]=true;unionN++;} });

    check(built.counts.acting === actU.count,
          'T75: acting count matches raw unique step.actors', built.counts.acting + ' vs ' + actU.count);
    check(built.counts.affected === affU.count,
          'T76: affected count matches raw unique step.affected', built.counts.affected + ' vs ' + affU.count);
    check(built.counts.total === unionN && built.units.length === unionN,
          'T77: total = unique union of actors + affected', built.counts.total + ' vs ' + unionN);
    check(built.units.every(function(u){ return ['acts','affected','both'].indexOf(u.involvement) >= 0; }),
          'T78: every unit has a valid involvement category');
    var resolved = built.units.filter(function(u){ return u.resolved; });
    check(resolved.length > 0 && resolved.every(function(u){ return u.side === 'RED' || u.side === 'BLUE'; }),
          'T79: resolved units carry a RED/BLUE side from OOB',
          'resolved=' + resolved.length + '/' + built.units.length);
    check(built.units[0].uid === (step.actors[0] && step.actors[0].uid),
          'T80: first listed unit is the first actor (acting-first ordering on real data)',
          built.units[0].uid + ' vs ' + (step.actors[0] && step.actors[0].uid));
})();

// ── Final ──────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log('  PR-289L Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exit(failed === 0 ? 0 : 1);
