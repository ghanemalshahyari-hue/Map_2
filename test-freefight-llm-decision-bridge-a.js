#!/usr/bin/env node
/*
 * FREEFIGHT-LLM-DECISION-BRIDGE-A — test suite
 *
 * §1   LLM disabled (no env var) → deterministic path works
 * §2   LLM enabled but provider unavailable → deterministic fallback with reason
 * §3   LLM returns valid JSON action → source='llm'
 * §4   LLM returns invalid JSON (garbage text) → fallback llm_invalid_json
 * §5   LLM returns illegal action_type (NUKE_CITY) → fallback llm_invalid_schema
 * §6   LLM action passes ENGINE.validateAction before apply
 * §7   UI shows decision_source and fallback_reason in panel HTML
 * §8   Apply/Reset still work after LLM decision
 * §9   Use LLM checkbox state (_setUseLlmForTest seam)
 * §10  normalizeAction: all fields normalised correctly
 * §11  normalizeAction: blocked for unknown action_type
 * §12  normalizeAction: blocked for unknown side
 * §13  normalizeAction: blocked when unit_uid is missing
 * §14  testLlmConnection returns ok:false when llm_disabled
 */
'use strict';

const path   = require('path');
const BRIDGE = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-decision.js'));
const ENGINE = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-action-engine.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

// ── DOM + map stub ────────────────────────────────────────────────────────────
var elById = {};
function makeEl(tag) {
    var el = {
        tagName: String(tag), id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {}, parentNode: null, checked: false, disabled: false,
        appendChild: function (c) { this.children.push(c); c.parentNode = this; if (c.id) elById[c.id] = c; return c; },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) {
            var m = sel && sel.match(/\[data-act="([^"]+)"\]/);
            if (!m) return null;
            var act = m[1];
            if (this.innerHTML && this.innerHTML.indexOf('data-act="' + act + '"') !== -1) {
                return { addEventListener: function () {}, disabled: false, style: {}, textContent: '', checked: false };
            }
            return null;
        },
    };
    return el;
}
var _layers = [];
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroupInstance = {
    addTo: function () { return this; },
    clearLayers: function () { _layers = []; },
    addLayer: function (l) { _layers.push(l); return this; },
};
global.window = {
    document: {
        body: makeEl('body'),
        head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
    },
    addEventListener: function () {},
    dispatchEvent: function () {},
    L: {
        layerGroup: function () { return Object.assign({}, _layerGroupInstance); },
        marker: function () { return Object.assign({}, _markerStub); },
        divIcon: function () { return {}; },
        circleMarker: function (ll, opts) { return Object.assign({ _latlng: ll, _radius: opts && opts.radius }, _markerStub); },
    },
    map: { hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {} },
    RmoozDemoUnits: { buildGroupsFromAnchors: function () { return []; } },
    RmoozFreeFightAI: null,
    fetch: null,
};

require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

// ── Fixtures ──────────────────────────────────────────────────────────────────
var UNITS = [
    { id: 'IR-F14-LLM-001', side: 'RED', lat: 27.21, lon: 56.38, platform: 'F-14A Tomcat',
      needs_review: true, exact_unit_position: false, source_type: 'deterministic_demo_ai' },
];
var OBJECTIVES = [{ lat: 26.0, lon: 53.0, name: 'Objective X' }];
var OPTS = { preferSide: 'RED' };

var VALID_LLM_RAW = {
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-LLM-001',
    target: { type: 'objective', lat: 26.0, lon: 53.0 },
    reason: 'Advance toward strike objective.', risk: 'medium', confidence: 'medium', source: 'llm',
};
var VALID_LLM_JSON = JSON.stringify(VALID_LLM_RAW);
var PAYLOAD = { brief: { operational_brief: { proposed_units: UNITS, objectives: OBJECTIVES } } };

function mockOk(responseJson) {
    return { generate: async function () { return { ok: true, response: responseJson, providerUsed: 'mock-claude' }; } };
}
function mockFail(errMsg) {
    return { generate: async function () { return { ok: false, error: errMsg || 'unavailable' }; } };
}

// ── Main async IIFE ───────────────────────────────────────────────────────────
(async function main() {

    // §1  LLM disabled → deterministic path works
    console.log('\n§1  LLM disabled (no env var) → deterministic path works');
    var savedEnv1 = process.env.RMOOZ_FREE_FIGHT_LLM;
    delete process.env.RMOOZ_FREE_FIGHT_LLM;
    var a1 = ENGINE.decideAction(UNITS, OBJECTIVES, OPTS);
    ok('§1 decideAction returns action', !!a1);
    ok('§1 source = deterministic_demo_ai', a1 && a1.source === 'deterministic_demo_ai');
    ok('§1 action_type valid', a1 && ['MOVE_TOWARD_OBJECTIVE','DEFEND_BASE','HOLD_POSITION','PATROL_NEAR_BASE'].includes(a1.action_type));
    if (savedEnv1 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv1;

    // §2  LLM enabled but provider unavailable → fallback
    console.log('\n§2  LLM enabled but provider unavailable → fallback with reason');
    var savedEnv2 = process.env.RMOOZ_FREE_FIGHT_LLM;
    process.env.RMOOZ_FREE_FIGHT_LLM = '1';
    var r2 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockFail('connection refused'));
    ok('§2 action is null on fallback', r2.action === null);
    ok('§2 source = deterministic_demo_ai', r2.source === 'deterministic_demo_ai');
    ok('§2 fallback_reason is a string', typeof r2.fallback_reason === 'string' && r2.fallback_reason.length > 0);
    ok('§2 fallback_reason contains llm_unavailable', /llm_unavailable/.test(r2.fallback_reason));
    if (savedEnv2 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv2; else delete process.env.RMOOZ_FREE_FIGHT_LLM;

    // §3  LLM returns valid JSON → source='llm'
    console.log('\n§3  LLM returns valid JSON action → source=\'llm\'');
    var savedEnv3 = process.env.RMOOZ_FREE_FIGHT_LLM;
    process.env.RMOOZ_FREE_FIGHT_LLM = '1';
    var r3 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§3 action returned', !!r3.action);
    ok('§3 source = llm', r3.source === 'llm');
    ok('§3 fallback_reason null', r3.fallback_reason === null);
    ok('§3 action_type = MOVE_TOWARD_OBJECTIVE', r3.action && r3.action.action_type === 'MOVE_TOWARD_OBJECTIVE');
    ok('§3 provider_used = mock-claude', r3.provider_used === 'mock-claude');
    if (savedEnv3 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv3; else delete process.env.RMOOZ_FREE_FIGHT_LLM;

    // §4  LLM returns invalid JSON → fallback llm_invalid_json
    console.log('\n§4  LLM returns invalid JSON (garbage text) → fallback');
    var savedEnv4 = process.env.RMOOZ_FREE_FIGHT_LLM;
    process.env.RMOOZ_FREE_FIGHT_LLM = '1';
    var r4 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk('Sorry, I cannot help with that.'));
    ok('§4 action is null', r4.action === null);
    ok('§4 source = deterministic_demo_ai', r4.source === 'deterministic_demo_ai');
    ok('§4 fallback_reason = llm_invalid_json', r4.fallback_reason === 'llm_invalid_json');
    if (savedEnv4 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv4; else delete process.env.RMOOZ_FREE_FIGHT_LLM;

    // §5  LLM returns illegal action_type → blocked/fallback
    console.log('\n§5  LLM returns illegal action_type (NUKE_CITY) → fallback');
    var savedEnv5 = process.env.RMOOZ_FREE_FIGHT_LLM;
    process.env.RMOOZ_FREE_FIGHT_LLM = '1';
    var illegalJson = JSON.stringify({ action_type: 'NUKE_CITY', side: 'RED', unit_uid: 'IR-F14-LLM-001', reason: 'test', risk: 'high', confidence: 'high', source: 'llm' });
    var r5 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(illegalJson));
    ok('§5 source = deterministic_demo_ai', r5.source === 'deterministic_demo_ai');
    ok('§5 fallback_reason contains llm_invalid_schema',
        typeof r5.fallback_reason === 'string' && r5.fallback_reason.includes('llm_invalid_schema'));
    // FREEFIGHT-REAL-SCENARIO-UNIT-FEED-A: when valid units exist, deterministic fallback
    // returns an action (not null). When units is empty, action would be null.
    ok('§5 action null OR deterministic (schema fail, valid units → deterministic fallback used)',
        r5.action === null || (r5.action && r5.source === 'deterministic_demo_ai'));
    if (savedEnv5 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv5; else delete process.env.RMOOZ_FREE_FIGHT_LLM;

    // §6  LLM action passes ENGINE.validateAction before apply
    console.log('\n§6  LLM action passes ENGINE.validateAction before apply');
    var n6 = BRIDGE.normalizeAction(VALID_LLM_RAW);
    ok('§6 normalizeAction not null', !!n6);
    var val6 = ENGINE.validateAction(n6, UNITS, OBJECTIVES);
    ok('§6 validateAction ok=true', val6.ok === true);
    var units6 = UNITS.map(function (u) { return Object.assign({}, u); });
    var apply6 = ENGINE.applyAction(n6, units6);
    ok('§6 applyAction ok=true', apply6.ok === true);
    ok('§6 apply has new_pos', !!(apply6.ok && apply6.new_pos));
    ok('§6 source = llm', n6.source === 'llm');
    ok('§6 demo_only = true', n6.demo_only === true);
    ok('§6 needs_review = true', n6.needs_review === true);

    // §7  UI shows decision_source and fallback_reason in panel HTML
    console.log('\n§7  UI shows decision_source and fallback_reason in panel HTML');
    elById = {}; global.window.document.body.children = [];
    DEMO.init(PAYLOAD);
    var llmDec7 = {
        ok: true, decision_source: 'llm', fallback_reason: null,
        action: { action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-LLM-001',
                  reason: 'LLM advance.', risk: 'medium', confidence: 'medium', source: 'llm' },
        validation: { ok: true }, apply_result: { ok: true, new_pos: { lat: 27.19, lon: 56.33 } },
        event_log_entry: 'AI Decision: RED [llm]',
        scenario_patch: { unit_uid: 'IR-F14-LLM-001', lat: 27.19, lon: 56.33 },
    };
    DEMO._setAiDecisionForTest(llmDec7, false);
    DEMO.mount(PAYLOAD);
    var p7 = elById['rmooz-free-fight-panel'];
    ok('§7 panel created', !!p7);
    var h7 = p7 ? p7.innerHTML : '';
    ok('§7 Decision source: llm shown', /Decision source.*llm/.test(h7));
    ok('§7 green colour for llm source', /#90d090/.test(h7));
    ok('§7 no Fallback reason line when null', !/Fallback reason/.test(h7));
    ok('§7 Use LLM checkbox present', /data-act="toggle-llm"/.test(h7));
    ok('§7 Test LLM button present', /data-act="test-llm"/.test(h7));

    var fbDec7 = {
        ok: true, decision_source: 'deterministic_demo_ai', fallback_reason: 'llm_disabled',
        action: { action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-LLM-001',
                  reason: 'Fallback.', risk: 'low', confidence: 'low', source: 'deterministic_demo_ai' },
        validation: { ok: true }, apply_result: { ok: true, new_pos: { lat: 27.18, lon: 56.30 } },
        event_log_entry: 'AI Decision: RED [det]', scenario_patch: null,
    };
    DEMO._setAiDecisionForTest(fbDec7, false);
    DEMO.mount(PAYLOAD);
    p7 = elById['rmooz-free-fight-panel'];
    h7 = p7 ? p7.innerHTML : '';
    ok('§7 Decision source: deterministic_demo_ai shown', /Decision source.*deterministic_demo_ai/.test(h7));
    ok('§7 Fallback reason shown', /Fallback reason/.test(h7));
    ok('§7 fallback value llm_disabled shown', /llm_disabled/.test(h7));

    // §8  Apply/Reset still work after LLM decision
    console.log('\n§8  Apply/Reset still work after LLM decision');
    elById = {}; global.window.document.body.children = []; _layers = [];
    DEMO.init(PAYLOAD);
    var llmDec8 = {
        ok: true, decision_source: 'llm', fallback_reason: null,
        action: { action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-LLM-001',
                  reason: 'LLM advance.', risk: 'medium', confidence: 'medium', source: 'llm' },
        validation: { ok: true }, apply_result: { ok: true, new_pos: { lat: 27.19, lon: 56.33 } },
        event_log_entry: 'AI Decision: RED [llm]',
        scenario_patch: { unit_uid: 'IR-F14-LLM-001', lat: 27.19, lon: 56.33 },
    };
    DEMO._setAiDecisionForTest(llmDec8, true);
    DEMO.mount(PAYLOAD);
    ok('§8 getAiDecision() returns decision', !!DEMO.getAiDecision());
    var aiM8 = _layers.filter(function (l) { return l._radius === 10; });
    ok('§8 AI circleMarker added', aiM8.length === 1);
    DEMO.reset();
    ok('§8 getAiDecision() null after reset', DEMO.getAiDecision() === null);
    var aiM8r = _layers.filter(function (l) { return l._radius === 10; });
    ok('§8 AI circleMarker removed', aiM8r.length === 0);
    var s8 = DEMO.getState();
    ok('§8 progress=0 after reset', s8.progress === 0);
    ok('§8 running=false after reset', s8.running === false);

    // §9  Use LLM checkbox state via _setUseLlmForTest seam
    console.log('\n§9  Use LLM checkbox state via _setUseLlmForTest seam');
    ok('§9 getUseLlm() is false initially', DEMO.getUseLlm() === false);
    DEMO._setUseLlmForTest(true);
    ok('§9 getUseLlm() = true after set', DEMO.getUseLlm() === true);
    elById = {}; global.window.document.body.children = [];
    DEMO.init(PAYLOAD);
    DEMO._setAiDecisionForTest({
        ok: true, decision_source: 'llm', fallback_reason: null,
        action: { action_type: 'HOLD_POSITION', side: 'RED', unit_uid: 'IR-F14-LLM-001',
                  reason: 'test', risk: 'low', confidence: 'high', source: 'llm' },
        validation: { ok: true }, apply_result: { ok: false }, event_log_entry: '', scenario_patch: null,
    }, false);
    DEMO.mount(PAYLOAD);
    var p9 = elById['rmooz-free-fight-panel'];
    var h9 = p9 ? p9.innerHTML : '';
    ok('§9 checkbox checked when _useLlm=true', /data-act="toggle-llm"[^>]* checked/.test(h9) || /checked[^>]*data-act="toggle-llm"/.test(h9));
    DEMO._setUseLlmForTest(false);
    ok('§9 getUseLlm() reset to false', DEMO.getUseLlm() === false);

    // §10  normalizeAction: all fields normalised correctly
    console.log('\n§10  normalizeAction: all fields normalised correctly');
    var n10 = BRIDGE.normalizeAction(VALID_LLM_RAW);
    ok('§10 not null', !!n10);
    ok('§10 action_type uppercased', n10.action_type === 'MOVE_TOWARD_OBJECTIVE');
    ok('§10 side uppercased', n10.side === 'RED');
    ok('§10 unit_uid preserved', n10.unit_uid === 'IR-F14-LLM-001');
    ok('§10 source forced to llm', n10.source === 'llm');
    ok('§10 demo_only true', n10.demo_only === true);
    ok('§10 review_only true', n10.review_only === true);
    ok('§10 needs_review true', n10.needs_review === true);
    ok('§10 reason preserved', n10.reason === 'Advance toward strike objective.');
    ok('§10 risk preserved', n10.risk === 'medium');
    ok('§10 confidence preserved', n10.confidence === 'medium');
    ok('§10 target lat/lon preserved', n10.target && n10.target.lat === 26.0 && n10.target.lon === 53.0);
    var n10b = BRIDGE.normalizeAction(Object.assign({}, VALID_LLM_RAW, { risk: 'EXTREME', confidence: 'VERY_HIGH' }));
    ok('§10 unknown risk normalised to medium', n10b && n10b.risk === 'medium');
    ok('§10 unknown confidence normalised to medium', n10b && n10b.confidence === 'medium');

    // §11  normalizeAction: blocked for unknown action_type
    console.log('\n§11  normalizeAction: blocked for unknown action_type');
    ok('§11 NUKE_CITY blocked', BRIDGE.normalizeAction({ action_type: 'NUKE_CITY', side: 'RED', unit_uid: 'x' }) === null);
    ok('§11 empty string blocked', BRIDGE.normalizeAction({ action_type: '', side: 'RED', unit_uid: 'x' }) === null);
    ok('§11 null input → null', BRIDGE.normalizeAction(null) === null);
    ok('§11 non-object → null', BRIDGE.normalizeAction('MOVE_TOWARD_OBJECTIVE') === null);

    // §12  normalizeAction: blocked for unknown side
    console.log('\n§12  normalizeAction: blocked for unknown side');
    ok('§12 NEUTRAL blocked', BRIDGE.normalizeAction({ action_type: 'HOLD_POSITION', side: 'NEUTRAL', unit_uid: 'x' }) === null);
    ok('§12 missing side blocked', BRIDGE.normalizeAction({ action_type: 'HOLD_POSITION', unit_uid: 'x' }) === null);

    // §13  normalizeAction: blocked when unit_uid is missing
    console.log('\n§13  normalizeAction: blocked when unit_uid is missing');
    ok('§13 missing uid blocked', BRIDGE.normalizeAction({ action_type: 'HOLD_POSITION', side: 'RED' }) === null);
    ok('§13 empty uid blocked', BRIDGE.normalizeAction({ action_type: 'HOLD_POSITION', side: 'RED', unit_uid: '' }) === null);

    // §14  testLlmConnection returns ok:false when llm_disabled
    console.log('\n§14  testLlmConnection returns ok:false when llm_disabled');
    var savedEnv14 = process.env.RMOOZ_FREE_FIGHT_LLM;
    delete process.env.RMOOZ_FREE_FIGHT_LLM;
    var r14 = await BRIDGE.testLlmConnection();
    ok('§14 ok=false when llm_disabled', r14.ok === false);
    ok('§14 reason=llm_disabled', r14.reason === 'llm_disabled');
    ok('§14 latency_ms=0', r14.latency_ms === 0);
    if (savedEnv14 !== undefined) process.env.RMOOZ_FREE_FIGHT_LLM = savedEnv14;

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);

}()).catch(function (e) {
    console.error('FATAL:', e);
    process.exit(1);
});
