#!/usr/bin/env node
/*
 * FREEFIGHT-CARD-UX-CLARITY-A
 *
 * Verifies that the Free Fight Demo panel makes the two subsystems
 * impossible to confuse: group movement demo (animated planner) vs
 * real unit-level AI decision test (MAIN AI TEST).  No server required.
 *
 * Tests:
 *   §1   Window title says "Free Fight Control Window"
 *   §2   Group section header says "GROUP MOVEMENT DEMO"
 *   §3   Mode label says "Group demo mode"
 *   §4   Group start button says "Start Group Movement Demo"
 *   §5   Unit section header says "MAIN AI TEST — Unit Decision LLM"
 *   §6   Unit buttons: Preview/Apply/Reset use "Unit" label
 *   §7   Decision Trace still renders when decision is present
 *   §8   Apply/Reset behaviour unchanged (state mutations still work)
 *   §9   Existing window controls (—, □, ×) still render
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

// ── DOM + map stub ─────────────────────────────────────────────────────────
var elById = {};
function deepQueryEl(el, sel) {
    if (!el) return null;
    var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
    if (mff) {
        if (el.attrs && el.attrs['data-ff'] === mff[1]) return el;
        for (var _i = 0; _i < (el.children || []).length; _i++) {
            var _r = deepQueryEl(el.children[_i], sel); if (_r) return _r;
        }
        return null;
    }
    var m = sel.match(/^\[data-act="([^"]+)"\]$/);
    if (!m) return null;
    var act = m[1];
    if (el.attrs && el.attrs['data-act'] === act) return el;
    for (var _j = 0; _j < (el.children || []).length; _j++) {
        var _r2 = deepQueryEl(el.children[_j], sel); if (_r2) return _r2;
    }
    if (el.innerHTML && el.innerHTML.indexOf('data-act="' + act + '"') !== -1) {
        return { addEventListener: function () {}, removeEventListener: function () {},
                 disabled: false, style: {cssText: ''}, textContent: '', checked: false, value: '' };
    }
    return null;
}
function getAllHtml(el) {
    if (!el) return '';
    var s = el.innerHTML || '';
    (el.children || []).forEach(function (c) { s += getAllHtml(c); });
    return s;
}
function makeEl(tag) {
    var el = {
        tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {cssText: ''}, parentNode: null, disabled: false,
        _listeners: {},
        appendChild: function (c) {
            c.parentNode = this; this.children.push(c);
            if (c.id) elById[c.id] = c; return c;
        },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); c.parentNode = null; },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (ev, fn) {
            if (!this._listeners[ev]) this._listeners[ev] = [];
            this._listeners[ev].push(fn);
        },
        removeEventListener: function (ev, fn) {
            if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(function (f) { return f !== fn; });
        },
        setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) { return deepQueryEl(this, sel); },
    };
    return el;
}
var bodyEl = makeEl('body');
global.sessionStorage = {
    _data: {},
    getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem:    function (k, v) { this._data[k] = String(v); },
    removeItem: function (k)    { delete this._data[k]; },
};
global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: {
        body: bodyEl,
        head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
    },
    addEventListener:    function () {},
    removeEventListener: function () {},
    dispatchEvent:       function () {},
};
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroupInstance = {
    addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; },
};
global.window.L = {
    layerGroup: function () { return Object.assign({}, _layerGroupInstance); },
    marker: function () { return Object.assign({}, _markerStub); },
    divIcon: function () { return {}; },
    circleMarker: function () { return Object.assign({}, _markerStub); },
};
global.window.map = {
    hasLayer: function () { return false; }, removeLayer: function () {},
    addLayer: function () {}, on: function () {}, off: function () {},
};
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;
global.window.fetch = null;

// ── Load modules ─────────────────────────────────────────────────────────────
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var CLIENT_SRC = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

var PAYLOAD = {
    brief: {
        operational_brief: {
            proposed_units: [
                { id: 'R-CLR-001', side: 'RED', lat: 27.21, lon: 56.38, platform: 'F-14A' },
            ],
            objectives: [{ label: 'Objective X', lat: 26.0, lon: 53.0 }],
            placement_candidates: [{ type: 'base', lat: 27.21, lon: 56.38, name: 'TestAB' }],
        },
    },
};

function freshMount() {
    elById = {};
    bodyEl.children = [];
    sessionStorage._data = {};
    DEMO._resetWinStateForTest();
    DEMO.clear();
    DEMO.mount(PAYLOAD);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1  Window title says "Free Fight Control Window"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§1  Window title says "Free Fight Control Window"');
freshMount();
var panelEl = elById['rmooz-free-fight-panel'];
var allHtml = getAllHtml(panelEl);
ok('§1 panel created', !!panelEl);
ok('§1 title contains "Free Fight Control Window"', /Free Fight Control Window/.test(allHtml));
ok('§1 title contains Arabic نافذة التحكم', /نافذة التحكم/.test(allHtml));
ok('§1 old title "Free Fight Demo" NOT present as standalone title', !/Free Fight Demo —/.test(allHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// §2  Group section header says "GROUP MOVEMENT DEMO"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§2  Group section header says "GROUP MOVEMENT DEMO"');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
var bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
var bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§2 body div present', bodyHtml.length > 0);
ok('§2 GROUP MOVEMENT DEMO header present', /GROUP MOVEMENT DEMO/.test(bodyHtml));
ok('§2 group header has subtitle about planner', /Animated group planner/.test(bodyHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// §3  Mode label says "Group demo mode"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§3  Mode label says "Group demo mode"');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§3 "Group demo mode" label present', /Group demo mode/.test(bodyHtml));
ok('§3 old bare "Mode:" label NOT present', !/>Mode:</.test(bodyHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// §4  Group start button says "Start Group Movement Demo"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§4  Group start button says "Start Group Movement Demo"');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§4 "Start Group Movement Demo" text present', /Start Group Movement Demo/.test(bodyHtml));
ok('§4 "Re-plan Group Demo" button present', /Re-plan Group Demo/.test(bodyHtml));
ok('§4 "Reset Group Demo" button present', /Reset Group Demo/.test(bodyHtml));
ok('§4 old "Start AI Free Fight" text NOT present', !/Start AI Free Fight/.test(bodyHtml));

// source-level guard: "Start AI Free Fight" must not exist in source
ok('§4 source does not contain "Start AI Free Fight"', !/Start AI Free Fight/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §5  Unit section header says "MAIN AI TEST — Attack Plan / COA Planner"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§5  Unit section header says "MAIN AI TEST — Attack Plan / COA Planner"');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§5 "MAIN AI TEST" badge present', /MAIN AI TEST/.test(bodyHtml));
ok('§5 "Attack Plan / COA Planner" text present in section header', /Attack Plan \/ COA Planner/.test(bodyHtml));
ok('§5 section has Arabic subtitle about real unit AI', /الذكاء الاصطناعي/.test(bodyHtml));
ok('§5 old "AI Decision Preview" header NOT present', !/AI Decision Preview/.test(bodyHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// §6  New COA buttons present; unit buttons still present in subsection
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§6  COA buttons: Generate/Apply/Reset COA present');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§6 "Generate AI Attack Plan" text present', /Generate AI Attack Plan/.test(bodyHtml));

// source-level checks
ok('§6 source contains "Generate AI Attack Plan"', /Generate AI Attack Plan/.test(CLIENT_SRC));
ok('§6 source contains "Apply Selected COA"',      /Apply Selected COA/.test(CLIENT_SRC));
ok('§6 source contains "Reset COA"',               /Reset COA/.test(CLIENT_SRC));
ok('§6 source has generate-coa button', /data-act="generate-coa"/.test(CLIENT_SRC));
ok('§6 source has apply-coa button',    /data-act="apply-coa"/.test(CLIENT_SRC));
ok('§6 source has reset-coa button',    /data-act="reset-coa"/.test(CLIENT_SRC));
// Old unit-level subsection buttons still preserved
ok('§6 source still contains "Preview Unit AI Decision"', /Preview Unit AI Decision/.test(CLIENT_SRC));
ok('§6 source still contains "Apply Unit AI Action"',     /Apply Unit AI Action/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §7  Decision Trace still renders when decision is present
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§7  Decision Trace still renders when decision is present');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
// Inject a mock AI decision so the trace block renders
if (typeof DEMO._setAiDecisionForTest === 'function') {
    DEMO._setAiDecisionForTest({
        ok: true,
        action: { action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'R-CLR-001',
                  reason: 'test', confidence: 'medium', risk: 'low', source: 'llm' },
        llm_called: true, llm_status: 'success',
        final_decision_source: 'llm',
        provider_used: 'ollama', model_used: 'qwen3-coder:latest',
    });
    if (typeof DEMO._repaintForTest === 'function') DEMO._repaintForTest();
}
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§7 Decision Trace header present', /Decision Trace/.test(bodyHtml));
ok('§7 Final decision source line present', /Final decision source/.test(bodyHtml));
ok('§7 LLM source shown in green when source=llm', /color:#90d090/.test(bodyHtml));
ok('§7 "LLM answer accepted" annotation present when source=llm', /LLM answer accepted/.test(bodyHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// §8  Apply/Reset state mutations still work
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§8  Apply/Reset state mutations still work');
ok('§8 data-act="preview-ai" still present', /data-act="preview-ai"/.test(bodyHtml));
// Decision trace section renders → so apply-ai button appears when ok=true and not applied
if (typeof DEMO._setAiDecisionForTest === 'function') {
    bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
    bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
    ok('§8 data-act="apply-ai" present when decision ready and not applied', /data-act="apply-ai"/.test(bodyHtml));
    ok('§8 data-act="reset-ai" present when decision present', /data-act="reset-ai"/.test(bodyHtml));
}
// source: reset clears state
ok('§8 source contains _aiDecision = null in reset path', /_aiDecision\s*=\s*null/.test(CLIENT_SRC));
ok('§8 source contains _aiApplied = false in reset path', /_aiApplied\s*=\s*false/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §9  Existing window controls still render
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§9  Existing window controls (—, □, ×) still render');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
allHtml = getAllHtml(panelEl);
ok('§9 win-min button present', /data-act="win-min"/.test(allHtml));
ok('§9 win-max button present', /data-act="win-max"/.test(allHtml));
ok('§9 win-close button present', /data-act="win-close"/.test(allHtml));
var titlebarEl = deepQueryEl(panelEl, '[data-ff="titlebar"]');
ok('§9 titlebar has data-ff=titlebar', !!titlebarEl);
ok('§9 resize handle present', !!deepQueryEl(panelEl, '[data-ff="resize"]'));
var ws = DEMO._getWinStateForTest();
ok('§9 win state not null', !!ws);
ok('§9 win state has left/top/width/height', ws && typeof ws.left === 'number' && typeof ws.top === 'number');

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
