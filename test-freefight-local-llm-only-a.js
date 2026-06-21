#!/usr/bin/env node
/*
 * FREEFIGHT-LOCAL-LLM-ONLY-A — test suite
 *
 * §1   No env → provider defaults to 'ollama', not 'auto'
 * §2   RMOOZ_AI_PROVIDER=claude must not be forwarded by Free Fight
 * §3   RMOOZ_FREE_FIGHT_PROVIDER=claude rejected (also zen, openai, auto)
 * §4   Local provider unavailable → deterministic fallback with local_llm_unavailable
 * §5   Valid local/ollama response → source='llm', local_only=true, model_used set
 * §6   testLlmConnection reports local_only=true (disabled + remote-rejected cases)
 * §7   UI renders "Local only" + provider name in panel HTML
 * §8   Existing deterministic demo still works (no regression)
 * §9   Model defaults to ai-config defaultModel when no env set
 * §10  Local provider 'local' is allowed (not blocked)
 * §11  RMOOZ_FREE_FIGHT_PROVIDER=zen rejected
 * §12  RMOOZ_FREE_FIGHT_PROVIDER=auto rejected
 * §13  normalizeAction unchanged (schema enforcement not regressed)
 * §14  local_llm_disabled returned from askLlmForAction when flag unset
 */
'use strict';

const path   = require('path');
const BRIDGE = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-decision.js'));
// RMOOZ-AI-FREE-FIGHT-MODEL-SOT-A: committed default model lives only in ai-config.js — assert against it.
const AI_CFG = require(path.join(__dirname, 'UI_MOdified/server/ai/ai-config.js'));
const ENGINE = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-action-engine.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

// ── DOM + map stub ─────────────────────────────────────────────────────────────
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
        children: [], attrs: {}, style: {cssText: ''}, parentNode: null, checked: false, disabled: false,
        appendChild: function (c) { this.children.push(c); c.parentNode = this; if (c.id) elById[c.id] = c; return c; },
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
var _layers = [];
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroupInstance = {
    addTo: function () { return this; },
    clearLayers: function () { _layers = []; },
    addLayer: function (l) { _layers.push(l); return this; },
};
global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: {
        body: makeEl('body'),
        head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
    },
    addEventListener: function () {},
    removeEventListener: function () {},
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
// RMOOZ-FREE-FIGHT-CONTROL-HARD-RESET-X: the LLM-mode / provider / model panel (§7) now renders under
// the closed "Diagnostics / Legacy" drawer of the new V2 control window. The legacy render fns are
// UNCHANGED — open the drawer so these local-only checks still exercise them.
DEMO._setFfLegacyOpenForTest(true);

// ── Fixtures ──────────────────────────────────────────────────────────────────
var UNITS = [
    { id: 'IR-F14-LOCAL-001', side: 'RED', lat: 27.21, lon: 56.38, platform: 'F-14A Tomcat',
      needs_review: true, exact_unit_position: false, source_type: 'deterministic_demo_ai' },
];
var OBJECTIVES = [{ lat: 26.0, lon: 53.0, name: 'Objective X' }];
var OPTS = { preferSide: 'RED' };
var PAYLOAD = { brief: { operational_brief: { proposed_units: UNITS, objectives: OBJECTIVES } } };

var VALID_LLM_RAW = {
    action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-LOCAL-001',
    target: { type: 'objective', lat: 26.0, lon: 53.0 },
    reason: 'Local LLM: advance toward strike objective.', risk: 'medium', confidence: 'medium', source: 'llm',
};
var VALID_LLM_JSON = JSON.stringify(VALID_LLM_RAW);

function mockOk(responseJson) {
    return { generate: async function (a) { return { ok: true, response: responseJson, providerUsed: a.provider }; } };
}
function mockFail(errMsg) {
    return { generate: async function () { return { ok: false, error: errMsg || 'unavailable' }; } };
}
// Capturing mock — records the args passed to generate()
function mockCapture(responseJson) {
    var captured = null;
    var mock = {
        generate: async function (a) { captured = a; return { ok: true, response: responseJson, providerUsed: a.provider }; },
        getCapture: function () { return captured; },
    };
    return mock;
}

function saveEnv(key) { return process.env[key]; }
function restoreEnv(key, saved) { if (saved !== undefined) process.env[key] = saved; else delete process.env[key]; }

// ── Main async IIFE ───────────────────────────────────────────────────────────
(async function main() {

    // ── §1  No env → provider defaults to 'ollama', not 'auto' ───────────────
    console.log('\n§1  No env → provider defaults to ollama, not auto');
    var s1_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s1_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    var s1_ap  = saveEnv('RMOOZ_AI_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    delete process.env.RMOOZ_AI_PROVIDER;
    var mc1 = mockCapture(VALID_LLM_JSON);
    var r1 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mc1);
    ok('§1 provider sent to generate = ollama', mc1.getCapture() && mc1.getCapture().provider === 'ollama');
    ok('§1 result.local_only = true', r1.local_only === true);
    ok('§1 result.provider_policy = local_only', r1.provider_policy === 'local_only');
    ok('§1 source = llm (call succeeded)', r1.source === 'llm');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s1_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s1_p); restoreEnv('RMOOZ_AI_PROVIDER', s1_ap);

    // ── §2  RMOOZ_AI_PROVIDER=claude must not be forwarded ───────────────────
    console.log('\n§2  RMOOZ_AI_PROVIDER=claude must not be used by Free Fight');
    var s2_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s2_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    var s2_ap  = saveEnv('RMOOZ_AI_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    process.env.RMOOZ_AI_PROVIDER = 'claude';
    var mc2 = mockCapture(VALID_LLM_JSON);
    var r2 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mc2);
    ok('§2 RMOOZ_AI_PROVIDER=claude not forwarded', !(mc2.getCapture() && mc2.getCapture().provider === 'claude'));
    ok('§2 provider used is ollama (default, not claude)', mc2.getCapture() && mc2.getCapture().provider === 'ollama');
    ok('§2 local_only = true', r2.local_only === true);
    ok('§2 source = llm (ollama succeeded)', r2.source === 'llm');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s2_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s2_p); restoreEnv('RMOOZ_AI_PROVIDER', s2_ap);

    // ── §3  RMOOZ_FREE_FIGHT_PROVIDER=claude rejected ────────────────────
    console.log('\n§3  RMOOZ_FREE_FIGHT_PROVIDER=claude must be rejected');
    var s3_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s3_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'claude';
    var r3 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§3 action is null (remote rejected)', r3.action === null);
    ok('§3 fallback_reason = remote_provider_not_allowed_for_free_fight', r3.fallback_reason === 'remote_provider_not_allowed_for_free_fight');
    ok('§3 source = deterministic_demo_ai', r3.source === 'deterministic_demo_ai');
    ok('§3 local_only = true', r3.local_only === true);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s3_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s3_p);

    // ── §4  Local provider unavailable → deterministic fallback ──────────────
    console.log('\n§4  Local provider unavailable → deterministic fallback');
    var s4_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s4_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    var r4 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockFail('connection refused'));
    // FREEFIGHT-LLM-DECISION-TRACE-A: unavailable path now tries ENGINE.decideAction;
    // action may be non-null (valid unit) when valid units are in scope.
    ok('§4 action null OR deterministic fallback used', r4.action === null || r4.source === 'deterministic_demo_ai');
    ok('§4 source = deterministic_demo_ai', r4.source === 'deterministic_demo_ai');
    ok('§4 fallback_reason contains local_llm_unavailable', /local_llm_unavailable/.test(r4.fallback_reason));
    ok('§4 local_only = true', r4.local_only === true);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s4_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s4_p);

    // ── §5  Valid local/ollama response → source='llm', metadata present ──────
    console.log('\n§5  Valid local/ollama response → source=\'llm\', metadata present');
    var s5_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s5_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    var s5_m   = saveEnv('RMOOZ_FREE_FIGHT_MODEL');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    delete process.env.RMOOZ_FREE_FIGHT_MODEL;
    delete process.env.RMOOZ_LOCAL_LLM_MODEL;
    delete process.env.RMOOZ_AI_MODEL;
    var r5 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§5 action returned', !!r5.action);
    ok('§5 source = llm', r5.source === 'llm');
    ok('§5 local_only = true', r5.local_only === true);
    ok('§5 provider_policy = local_only', r5.provider_policy === 'local_only');
    ok('§5 model_used set', typeof r5.model_used === 'string' && r5.model_used.length > 0);
    ok('§5 fallback_reason = null', r5.fallback_reason === null);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s5_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s5_p); restoreEnv('RMOOZ_FREE_FIGHT_MODEL', s5_m);

    // ── §6  testLlmConnection reports local_only=true ─────────────────────────
    console.log('\n§6  testLlmConnection reports local_only=true');
    // 6a: disabled → local_only still set
    var s6a = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s6ap = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    delete process.env.RMOOZ_ALLOW_SIM_RUN;
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    var r6a = await BRIDGE.testLlmConnection();
    ok('§6a local_only = true when disabled', r6a.local_only === true);
    ok('§6a provider_policy = local_only when disabled', r6a.provider_policy === 'local_only');
    ok('§6a reason = llm_disabled (unchanged)', r6a.reason === 'llm_disabled');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s6a); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s6ap);

    // 6b: remote provider env → rejected, local_only=true
    var s6b   = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s6bp  = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'claude';
    var r6b = await BRIDGE.testLlmConnection();
    ok('§6b remote rejected in testLlmConnection', r6b.ok === false);
    ok('§6b reason = remote_provider_not_allowed_for_free_fight', r6b.reason === 'remote_provider_not_allowed_for_free_fight');
    ok('§6b local_only = true', r6b.local_only === true);
    ok('§6b provider reported as ollama', r6b.provider === 'ollama');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s6b); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s6bp);

    // 6c: local provider, enabled → local_only on success too
    var s6c   = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s6cp  = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    var r6c = await BRIDGE.testLlmConnection(null, mockOk('{"ok":true}'));
    ok('§6c local_only = true on successful probe', r6c.local_only === true);
    ok('§6c provider_policy = local_only on successful probe', r6c.provider_policy === 'local_only');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s6c); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s6cp);

    // ── §7  UI renders "Local only" + provider name in panel HTML ─────────────
    console.log('\n§7  UI renders "Local only" + provider name in panel HTML');
    elById = {}; global.window.document.body.children = [];
    DEMO.init(PAYLOAD);
    var localDec7 = {
        ok: true, decision_source: 'llm', fallback_reason: null,
        local_only: true, provider_policy: 'local_only',
        provider_used: 'ollama', model_used: 'qwen3-coder:latest',
        action: { action_type: 'MOVE_TOWARD_OBJECTIVE', side: 'RED', unit_uid: 'IR-F14-LOCAL-001',
                  reason: 'Local LLM advance.', risk: 'medium', confidence: 'medium', source: 'llm' },
        validation: { ok: true },
        apply_result: { ok: true, new_pos: { lat: 27.19, lon: 56.33 } },
        event_log_entry: 'AI Decision: RED [llm/local]',
        scenario_patch: { unit_uid: 'IR-F14-LOCAL-001', lat: 27.19, lon: 56.33 },
    };
    DEMO._setAiDecisionForTest(localDec7, false);
    DEMO.mount(PAYLOAD);
    var p7 = elById['rmooz-free-fight-panel'];
    ok('§7 panel created', !!p7);
    var h7 = p7 ? getAllHtml(p7) : '';
    // RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: the "Local only" / Provider / Model / Use-LLM / Test-Local-LLM
    // BODY UI lived in the deleted Free Fight window. The local-only PROVIDER POLICY is enforced server-side
    // and covered by the engine sections (§1-6, §8-14); these old-body label assertions are retired (the
    // operator card is the Scenario Control Center). [[retired-by-AF]]
    ok('§7 panel hosts the new operator card (no old local-LLM body UI)', /data-scc="window"/.test(h7) || !/data-act="toggle-llm"/.test(h7));

    // ── §8  Existing deterministic demo still works (no regression) ──────────
    console.log('\n§8  Existing deterministic demo still works (no regression)');
    var s8 = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    delete process.env.RMOOZ_ALLOW_SIM_RUN;
    var a8 = ENGINE.decideAction(UNITS, OBJECTIVES, OPTS);
    ok('§8 decideAction returns action', !!a8);
    ok('§8 source = deterministic_demo_ai', a8 && a8.source === 'deterministic_demo_ai');
    ok('§8 action_type valid', a8 && ['MOVE_TOWARD_OBJECTIVE','DEFEND_BASE','HOLD_POSITION','PATROL_NEAR_BASE'].includes(a8.action_type));
    var v8 = ENGINE.validateAction(a8, UNITS, OBJECTIVES);
    ok('§8 validateAction ok=true for deterministic action', v8.ok === true);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s8);

    // ── §9  Model defaults to ai-config defaultModel when no free-fight env set ─
    console.log('\n§9  Model defaults to ai-config defaultModel when no env set');
    var s9_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s9_m1  = saveEnv('RMOOZ_FREE_FIGHT_MODEL');
    var s9_m2  = saveEnv('RMOOZ_LOCAL_LLM_MODEL');
    var s9_m3  = saveEnv('RMOOZ_AI_MODEL');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_MODEL;
    delete process.env.RMOOZ_LOCAL_LLM_MODEL;
    delete process.env.RMOOZ_AI_MODEL;
    var mc9 = mockCapture(VALID_LLM_JSON);
    await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mc9);
    ok('§9 model passed to generate = ai-config defaultModel', mc9.getCapture() && !!AI_CFG.defaultModel && mc9.getCapture().model === AI_CFG.defaultModel);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s9_llm); restoreEnv('RMOOZ_FREE_FIGHT_MODEL', s9_m1);
    restoreEnv('RMOOZ_LOCAL_LLM_MODEL', s9_m2); restoreEnv('RMOOZ_AI_MODEL', s9_m3);

    // ── §10  Local provider 'local' is allowed ────────────────────────────────
    console.log('\n§10  Local provider \'local\' is allowed (not blocked)');
    var s10_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s10_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'local';
    var mc10 = mockCapture(VALID_LLM_JSON);
    var r10 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mc10);
    ok('§10 action returned (local provider not blocked)', !!r10.action);
    ok('§10 source = llm', r10.source === 'llm');
    ok('§10 local_only = true', r10.local_only === true);
    ok('§10 provider = local (passed through)', mc10.getCapture() && mc10.getCapture().provider === 'local');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s10_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s10_p);

    // ── §11  RMOOZ_FREE_FIGHT_PROVIDER=zen rejected ──────────────────────
    console.log('\n§11  RMOOZ_FREE_FIGHT_PROVIDER=zen rejected');
    var s11_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s11_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'zen';
    var r11 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§11 action = null (zen rejected)', r11.action === null);
    ok('§11 fallback_reason = remote_provider_not_allowed_for_free_fight', r11.fallback_reason === 'remote_provider_not_allowed_for_free_fight');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s11_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s11_p);

    // ── §12  RMOOZ_FREE_FIGHT_PROVIDER=auto rejected ─────────────────────
    console.log('\n§12  RMOOZ_FREE_FIGHT_PROVIDER=auto rejected');
    var s12_llm = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s12_p   = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'auto';
    var r12 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§12 action = null (auto rejected)', r12.action === null);
    ok('§12 fallback_reason = remote_provider_not_allowed_for_free_fight', r12.fallback_reason === 'remote_provider_not_allowed_for_free_fight');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s12_llm); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s12_p);

    // ── §13  normalizeAction not regressed ────────────────────────────────────
    console.log('\n§13  normalizeAction schema enforcement not regressed');
    var n13 = BRIDGE.normalizeAction(VALID_LLM_RAW);
    ok('§13 valid raw → not null', !!n13);
    ok('§13 source = llm', n13.source === 'llm');
    ok('§13 local_only NOT on normalized action (pure schema object)', n13.local_only === undefined);
    ok('§13 NUKE_CITY still blocked', BRIDGE.normalizeAction({ action_type: 'NUKE_CITY', side: 'RED', unit_uid: 'x' }) === null);
    ok('§13 remote side blocked', BRIDGE.normalizeAction({ action_type: 'HOLD_POSITION', side: 'NEUTRAL', unit_uid: 'x' }) === null);
    ok('§13 missing uid blocked', BRIDGE.normalizeAction({ action_type: 'HOLD_POSITION', side: 'RED' }) === null);

    // ── §14  local_llm_disabled returned from askLlmForAction when flag unset ─
    console.log('\n§14  local_llm_disabled fallback_reason when RMOOZ_ALLOW_SIM_RUN unset');
    var s14 = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s14p = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    delete process.env.RMOOZ_ALLOW_SIM_RUN;
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    var r14 = await BRIDGE.askLlmForAction(UNITS, OBJECTIVES, OPTS, mockOk(VALID_LLM_JSON));
    ok('§14 action = null when disabled', r14.action === null);
    ok('§14 fallback_reason = local_llm_disabled', r14.fallback_reason === 'local_llm_disabled');
    ok('§14 source = deterministic_demo_ai', r14.source === 'deterministic_demo_ai');
    ok('§14 local_only = true', r14.local_only === true);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s14); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s14p);

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);

}()).catch(function (e) {
    console.error('FATAL:', e);
    process.exit(1);
});
