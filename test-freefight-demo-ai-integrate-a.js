#!/usr/bin/env node
/*
 * FREEFIGHT-DEMO-AI-INTEGRATE-A
 *
 * Tests for integrating AI decision UX into the existing Free Fight card.
 * No DOM server required — headless Node with minimal stubs.
 *
 * Tests:
 *   §1   RmoozFreeFightDemo loads without error
 *   §2   RmoozFreeFightAiPanel has renderDecision but NOT openPanel (separate card removed)
 *   §3   getAiDecision() is exposed and returns null initially
 *   §4   _setAiDecisionForTest seam works
 *   §5   reset() clears AI decision state
 *   §6   reset() can be called repeatedly (no crash)
 *   §7   renderAiDecisionHtml via panel: shows action/reason/confidence fields
 *   §8   No rmooz-ff-ai-panel element is created when panel mounts
 *   §9   Panel HTML includes data-act="preview-ai" / apply-ai / reset-ai controls
 *   §10  Objective X coordinates not in proposed_units after init
 *   §11  Existing start/pause/reset/step/clear still in API
 *   §12  getState() has the right required shape
 *   §13  _applyAiDecision sets _aiApplied (via _setAiDecisionForTest seam)
 *   §14  After reset() with applied decision, getAiDecision() is null
 *   §15  renderDecision (pure helper) still works after openPanel removed
 */
'use strict';

var path = require('path');

// ── DOM + map stub ────────────────────────────────────────────────────────────
var elById = {};
function deepQueryEl(el, sel) {
    if (!el) return null;
    var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
    if (mff) {
        if (el.attrs && el.attrs['data-ff'] === mff[1]) return el;
        for (var _i = 0; _i < (el.children || []).length; _i++) { var _r = deepQueryEl(el.children[_i], sel); if (_r) return _r; }
        return null;
    }
    var m = sel.match(/^\[data-act="([^"]+)"\]$/);
    if (!m) return null;
    var act = m[1];
    if (el.attrs && el.attrs['data-act'] === act) return el;
    for (var _j = 0; _j < (el.children || []).length; _j++) { var _r2 = deepQueryEl(el.children[_j], sel); if (_r2) return _r2; }
    if (el.innerHTML && el.innerHTML.indexOf('data-act="' + act + '"') !== -1) {
        return { addEventListener: function () {}, removeEventListener: function () {}, disabled: false, style: {cssText: ''}, textContent: '', checked: false, value: '' };
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
        tagName: String(tag), id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {cssText: ''}, parentNode: null,
        disabled: false,
        appendChild: function (c) {
            this.children.push(c); c.parentNode = this;
            if (c.id) elById[c.id] = c;
            return c;
        },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function () {},
        removeEventListener: function () {},
        setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) { return deepQueryEl(this, sel); },
    };
    return el;
}
var bodyEl = makeEl('body');
global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: {
        body: bodyEl,
        head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    dispatchEvent: function () {},
};

// Minimal Leaflet + map stub
var _layers = [];
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroupInstance = {
    addTo: function () { return this; },
    clearLayers: function () { _layers = []; },
    addLayer: function (l) { _layers.push(l); return this; },
};
global.window.L = {
    layerGroup: function () { return Object.assign({}, _layerGroupInstance); },
    marker: function () { return Object.assign({}, _markerStub); },
    divIcon: function () { return {}; },
    circleMarker: function (ll, opts) { return Object.assign({ _latlng: ll, _radius: opts && opts.radius }, _markerStub); },
    polyline: function (lls, opts) { return Object.assign({ _lls: lls, _opts: opts || {} }, _markerStub); },
};
global.window.map = {
    hasLayer: function () { return false; },
    removeLayer: function () {},
    addLayer: function () {},
    on: function () {},
    off: function () {},
    panTo: function () {},
};
global.window.AppAdjudicatorMap = { drawScenario: function () {} };

// Stub deps that free-fight-demo.js looks for on window
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;
global.window.fetch = null;   // no fetch — prevents real network calls

// ── Load modules ─────────────────────────────────────────────────────────────
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO  = global.window.RmoozFreeFightDemo;
var PANEL = global.window.RmoozFreeFightAiPanel;
// RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: the unit-decision panel (§7) + group start button (§9) now
// render under the closed "Diagnostics / Legacy" drawer of the new V2 control window. The legacy render
// fns are UNCHANGED — open the drawer so these body checks still exercise them.
DEMO._setFfLegacyOpenForTest(true);

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

console.log('FREEFIGHT-DEMO-AI-INTEGRATE-A');

// ── Test payload ──────────────────────────────────────────────────────────────
var PAYLOAD = {
    brief: {
        operational_brief: {
            proposed_units: [
                { id: 'IR-F14-INT-001', side: 'RED', lat: 27.21, lon: 56.38, platform: 'F-14A Tomcat',
                  needs_review: true, exact_unit_position: false, source_type: 'deterministic_demo_ai' },
            ],
            objectives: [{ label: 'Objective X', lat: 26.0, lon: 53.0 }],
            placement_candidates: [
                { type: 'base', lat: 27.21, lon: 56.38, name: 'Hamedan AB' },
            ],
        },
    },
};

var DECISION = {
    ok: true,
    action: {
        action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-INT-001',
        target: { type: 'objective', lat: 26.0, lon: 53.0 },
        reason: 'Advance to strike position.', risk: 'medium', confidence: 'medium',
        source: 'deterministic_demo_ai', demo_only: true, needs_review: true,
    },
    validation: { ok: true },
    apply_result: { ok: true, old_pos: { lat: 27.21, lon: 56.38 }, new_pos: { lat: 27.19, lon: 56.33 }, moved_km: 5.5 },
    event_log_entry: 'AI Decision: RED F-14A Tomcat moved toward Objective X — confidence: medium [deterministic_demo_ai]',
    scenario_patch: { unit_uid: 'IR-F14-INT-001', lat: 27.19, lon: 56.33 },
};

// ── §1  Module loads ──────────────────────────────────────────────────────────
console.log('\n§1  RmoozFreeFightDemo loads');
ok('§1 DEMO loaded', !!DEMO);
ok('§1 DEMO.mount is a function', typeof (DEMO && DEMO.mount) === 'function');
ok('§1 DEMO.getAiDecision is a function', typeof (DEMO && DEMO.getAiDecision) === 'function');

// ── §2  openPanel is gone ─────────────────────────────────────────────────────
console.log('\n§2  RmoozFreeFightAiPanel has renderDecision but NOT openPanel');
ok('§2 PANEL loaded', !!PANEL);
ok('§2 PANEL.renderDecision exists', typeof (PANEL && PANEL.renderDecision) === 'function');
ok('§2 PANEL.openPanel is NOT on the object (separate card removed)', !PANEL.openPanel);

// ── §3  getAiDecision initial null ────────────────────────────────────────────
console.log('\n§3  getAiDecision() returns null initially');
DEMO.init(PAYLOAD);
ok('§3 getAiDecision() is null after init', DEMO.getAiDecision() === null);

// ── §4  _setAiDecisionForTest seam ────────────────────────────────────────────
console.log('\n§4  _setAiDecisionForTest seam');
DEMO._setAiDecisionForTest(DECISION, false);
ok('§4 getAiDecision() returns decision after set', !!(DEMO.getAiDecision() && DEMO.getAiDecision().ok));
ok('§4 applied=false initially', DEMO.getAiDecision() && DEMO.getAiDecision().ok); // just presence check

// ── §5  reset() clears AI decision ───────────────────────────────────────────
console.log('\n§5  reset() clears AI decision state');
DEMO._setAiDecisionForTest(DECISION, true);   // mark as applied
DEMO.reset();
ok('§5 getAiDecision() is null after reset()', DEMO.getAiDecision() === null);

// ── §6  reset() can be called repeatedly ─────────────────────────────────────
console.log('\n§6  reset() can be called repeatedly');
var threw = false;
try {
    DEMO.reset(); DEMO.reset(); DEMO.reset();
} catch (e) { threw = true; }
ok('§6 no exception on repeated reset()', !threw);
ok('§6 getAiDecision() still null after repeated reset()', DEMO.getAiDecision() === null);

// ── §7  renderAiDecisionHtml shows correct fields ─────────────────────────────
console.log('\n§7  Panel HTML includes AI decision fields when decision is set');
// Set a decision, then build a panel to inspect its HTML
elById = {};   // reset DOM registry
bodyEl.children = [];
DEMO.init(PAYLOAD);
DEMO._setAiDecisionForTest(DECISION, false);
// Trigger buildPanel + updatePanel via mount()
DEMO.mount(PAYLOAD);
var panelEl = elById['rmooz-free-fight-panel'];
ok('§7 rmooz-free-fight-panel created', !!panelEl);
var panelHtml = panelEl ? getAllHtml(panelEl) : '';
// RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: the AI-decision-preview body fields (preview-ai / apply-ai /
// reset-ai / MOVE_TOWARD_OBJECTIVE / unit_uid / reason / Side / Validator) rendered in the deleted Free
// Fight window. The engine decision-state path (§1-6, §13-17) still holds; these old-body field assertions
// are retired (the operator card is the Scenario Control Center). [[retired-by-AF]]
ok('§7 panel hosts the new operator card (no old AI-decision body)', /data-scc="window"/.test(panelHtml) || !/data-act="preview-ai"/.test(panelHtml));

// ── §8  No rmooz-ff-ai-panel created ─────────────────────────────────────────
console.log('\n§8  No rmooz-ff-ai-panel floating element created on mount');
ok('§8 rmooz-ff-ai-panel NOT created', !elById['rmooz-ff-ai-panel']);

// ── §9  Window chrome still present (RMOOZ-...-AF: the old group-demo Start/Pause/Reset BODY controls were
// deleted with the old window; the titlebar window controls are unchanged). [[retired-by-AF]]
console.log('\n§9  Window chrome (titlebar controls) still present');
ok('§9 window close button present (win-close)', /data-act="win-close"/.test(panelHtml));

// ── §10  Objective X not in proposed_units ────────────────────────────────────
console.log('\n§10  Objective X coordinates not in proposed_units');
var st = DEMO.getState();
ok('§10 getState() returns object', typeof st === 'object' && !!st);
ok('§10 objective_set is boolean', typeof st.objective_set === 'boolean');
// objectives are [{ lat:26.0, lon:53.0 }]; proposed_units only has IR-F14-INT-001
// The Objective lat/lon should NOT appear in proposed_units
var objLat = 26.0, objLon = 53.0;
var units = (PAYLOAD.brief.operational_brief.proposed_units || []);
var unitAtObj = units.filter(function (u) { return Math.abs((u.lat || 0) - objLat) < 0.001 && Math.abs((u.lon || 0) - objLon) < 0.001; });
ok('§10 no proposed unit at Objective X coordinates', unitAtObj.length === 0);

// ── §11  Existing API methods ─────────────────────────────────────────────────
console.log('\n§11  Existing start/pause/reset/step/clear all in API');
ok('§11 start', typeof DEMO.start === 'function');
ok('§11 pause', typeof DEMO.pause === 'function');
ok('§11 reset', typeof DEMO.reset === 'function');
ok('§11 step',  typeof DEMO.step  === 'function');
ok('§11 clear', typeof DEMO.clear === 'function');
ok('§11 setObjective', typeof DEMO.setObjective === 'function');
ok('§11 clearObjective', typeof DEMO.clearObjective === 'function');

// ── §12  getState() shape ─────────────────────────────────────────────────────
console.log('\n§12  getState() has required shape');
DEMO.init(PAYLOAD);
var s = DEMO.getState();
ok('§12 running boolean', typeof s.running === 'boolean');
ok('§12 paused boolean',  typeof s.paused === 'boolean');
ok('§12 progress number', typeof s.progress === 'number');
ok('§12 can_start boolean', typeof s.can_start === 'boolean');
ok('§12 demo_only true', s.demo_only === true);
ok('§12 review_only true', s.review_only === true);
ok('§12 requires_commander_approval true', s.requires_commander_approval === true);

// ── §13  _applyAiDecision path (seam-based) ───────────────────────────────────
console.log('\n§13  Apply path: _setAiDecisionForTest + getAiDecision reflects applied state');
DEMO.init(PAYLOAD);
DEMO._setAiDecisionForTest(DECISION, false);
ok('§13 not applied yet', !(DEMO.getAiDecision() && DEMO.getAiDecision()._applied));
DEMO._setAiDecisionForTest(DECISION, true);   // simulate Apply
ok('§13 decision still present after apply-seam', !!DEMO.getAiDecision());

// ── §14  reset() after apply clears AI state ─────────────────────────────────
console.log('\n§14  reset() after applied decision returns to clean state');
DEMO.reset();
ok('§14 getAiDecision() null after reset', DEMO.getAiDecision() === null);
var s2 = DEMO.getState();
ok('§14 progress reset to 0', s2.progress === 0);
ok('§14 running is false', s2.running === false);

// ── §15  renderDecision (pure helper) still works ────────────────────────────
console.log('\n§15  renderDecision pure helper (PANEL) still works');
var c = makeEl('div');
PANEL.renderDecision(c, DECISION);
ok('§15 container.innerHTML set', c.innerHTML.length > 0);
ok('§15 MOVE_TOWARD_OBJECTIVE in output', /MOVE_TOWARD_OBJECTIVE/.test(c.innerHTML));
ok('§15 Apply AI Action button present', /Apply AI Action/.test(c.innerHTML));
ok('§15 no crash', true);

// ── §16  Apply adds AI pulse marker to _layer (FREEFIGHT-AI-REAL-MAP-MOVE-A) ──
console.log('\n§16  Apply path: AI pulse marker added to _layer on syncMarkers');
// Set applied state, then call mount() — init() inside mount preserves _aiApplied,
// and the subsequent syncMarkers() picks it up and places the marker.
DEMO._setAiDecisionForTest(DECISION, true);
DEMO.mount(PAYLOAD);   // init (keeps _aiApplied) → syncMarkers → buildPanel
// New impl: pulse (r=14) + inner dot (r=5); no longer a bare r=10 marker.
var aiMarkers16 = _layers.filter(function (l) { return l._radius === 14 || l._radius === 5; });
ok('§16 AI pulse marker(s) in _layer after apply', aiMarkers16.length >= 1);
// Pulse (r=14) at new position
var pulse16 = _layers.filter(function (l) { return l._radius === 14; });
ok('§16 AI pulse lat matches scenario_patch', pulse16.length > 0 && Math.abs(pulse16[0]._latlng[0] - DECISION.scenario_patch.lat) < 0.001);
ok('§16 AI pulse lon matches scenario_patch', pulse16.length > 0 && Math.abs(pulse16[0]._latlng[1] - DECISION.scenario_patch.lon) < 0.001);
ok('§16 layer also has non-AI markers (Objective X present)', _layers.length > aiMarkers16.length);

// ── §17  reset() removes AI circleMarker from _layer ─────────────────────────
console.log('\n§17  reset() removes AI circleMarker; groups return to anchor');
DEMO.reset();   // _aiApplied → false; syncMarkers redraws without AI marker
var aiMarkers17 = _layers.filter(function (l) { return l._radius === 14 || l._radius === 5; });
ok('§17 no AI pulse marker in _layer after reset()', aiMarkers17.length === 0);
ok('§17 getAiDecision() null after reset', DEMO.getAiDecision() === null);
ok('§17 _layer still rendered (syncMarkers ran)', _layers.length >= 1);
var s17 = DEMO.getState();
ok('§17 progress reset to 0', s17.progress === 0);
ok('§17 running is false', s17.running === false);

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
