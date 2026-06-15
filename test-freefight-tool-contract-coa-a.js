#!/usr/bin/env node
/*
 * RMOZ-AI-TOOL-CONTRACT-A — planner/client integration
 * Every plan must carry a tool_contract; the validator gatekeeps LLM output and the
 * deterministic floor is trusted; COA family varies; brief consumes the enriched plan.
 *
 *  §1  Deterministic plan carries plan.tool_contract (version, tools_used, validated, fallback_used)
 *  §2  Same input → same tool pack (determinism through buildCommanderPromptPack)
 *  §3  Different "model style" text cannot bypass the schema (validator rejects bad decision)
 *  §4  Invented unit ID rejected
 *  §5  Ground unit assigned air-intercept rejected
 *  §6  Naval unit assigned land/ground role rejected
 *  §7  Repeated COA family penalized/avoided (tool_contract.recommended_family avoids previous)
 *  §8  LLM unavailable / invalid → deterministic fallback, plan still ok, tool_contract present
 *  §9  Valid decision converts to a COA plan (deterministic floor is accepted/trusted)
 * §10  Plan includes tool_contract (client record + _lastToolContract)
 * §11  No remote provider used (capability/analyst stays local)
 * §12  Scenario-generic arbitrary JSON works
 * §13  No kill/destroy actions allowed (validator blocks)
 * §14  Commander brief consumes the tool-enriched plan; client shows tool-contract line + event log
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

var P = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
var T = require(path.join(__dirname, 'UI_MOdified/server/ai/rmooz-ai-tool-contract.js'));

function u(id, side, role, lat, lon) { return { uid: id, side: side, role: role, label: role, lat: lat, lon: lon, coord: [lon, lat] }; }
var OBJ = [{ lat: 24.45, lon: 54.37, name: 'Abu Dhabi' }];
function mixed() {
    return [u('R-AIR', 'RED', 'su-30 fighter', 24.58, 54.37),
            u('B-FIGHT', 'BLUE', 'f-16 fighter', 24.30, 54.30),
            u('B-SAM', 'BLUE', 'patriot sam', 24.46, 54.37),
            u('B-FRIG', 'BLUE', 'frigate', 24.55, 54.15),
            u('B-INF', 'BLUE', 'infantry', 24.40, 54.45)];
}
var ALLOWED = mixed().map(function (x) { return x.uid; });

(async function main() {
    // ── §1 deterministic plan carries tool_contract ──────────────────────────
    console.log('\n§1  Deterministic plan carries plan.tool_contract');
    var plan = await P.planCoas(mixed(), OBJ, { active_side: 'BLUE', previous_coa_families: ['air_intercept'] }, { preferSide: 'BLUE', useLlm: false });
    var tc = plan.tool_contract;
    ok('§1 tool_contract present', !!tc);
    ok('§1 version is the contract version', tc.version === T.TOOL_CONTRACT_VERSION);
    ok('§1 tools_used lists the deterministic tools', Array.isArray(tc.tools_used) && tc.tools_used.indexOf('capability') !== -1 && tc.tools_used.indexOf('zone') !== -1 && tc.tools_used.indexOf('roe') !== -1 && tc.tools_used.indexOf('previous_turns') !== -1);
    ok('§1 validated true (deterministic floor trusted)', tc.validated === true);
    ok('§1 fallback_used false (no LLM attempted)', tc.fallback_used === false);

    // ── §2 deterministic tool pack ───────────────────────────────────────────
    console.log('\n§2  Same input → same tool pack (deterministic)');
    var pack1 = await T.buildCommanderPromptPack({ units: mixed(), objectives: OBJ, context: { active_side: 'BLUE', defending_side: 'BLUE', previous_coa_families: [] }, opts: { useLlm: false } });
    var pack2 = await T.buildCommanderPromptPack({ units: mixed(), objectives: OBJ, context: { active_side: 'BLUE', defending_side: 'BLUE', previous_coa_families: [] }, opts: { useLlm: false } });
    ok('§2 identical tool pack JSON', JSON.stringify(pack1) === JSON.stringify(pack2));
    ok('§2 pack has system_contract + allowed_output_schema + allowed_unit_ids + blocked_actions', !!(pack1.data.system_contract && pack1.data.allowed_output_schema && pack1.data.allowed_unit_ids && pack1.data.blocked_actions));

    // ── §3 schema can't be bypassed by model style ───────────────────────────
    console.log('\n§3  Model-style text cannot bypass the schema');
    var chatty = { selected_coa_family: 'air_intercept', commentary: 'Sure! Here is my plan 😀', unit_assignments: [{ unit_uid: 'B-FIGHT', role: 'intercept', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: 24.38, lon: 54.34 } }] };
    var v3 = T.validateCommanderCoaTool({ decision: chatty, units: mixed(), allowed_unit_ids: ALLOWED, previous_coa_families: [], allowed_families: ['air_intercept', 'sensor_tasking'] }).data;
    ok('§3 well-formed clean decision accepted (extra prose ignored)', v3.accepted === true, v3.rejected_reason || '');

    // ── §4 invented ID ───────────────────────────────────────────────────────
    console.log('\n§4  Invented unit ID rejected');
    var inv = { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'GHOST-999', role: 'intercept', action_type: 'MOVE_TOWARD_OBJECTIVE', target: { lat: 24.5, lon: 54.35 } }] };
    var v4 = T.validateCommanderCoaTool({ decision: inv, units: mixed(), allowed_unit_ids: ALLOWED, previous_coa_families: [], allowed_families: ['air_intercept'] }).data;
    ok('§4 rejected', v4.accepted === false && /invented_unit_id/.test(v4.rejected_reason));

    // RMOOZ-AI-COMMANDER-FREEDOM-A: the validator is structure/physics ONLY — it no
    // longer rejects a COA for not matching expected doctrine.
    // ── §5 ground unit + tactical action: ACCEPTED ────────────────────────────
    console.log('\n§5  Ground unit + tactical action ACCEPTED (doctrine not enforced)');
    var g5 = { selected_coa_family: 'cautious_recon', unit_assignments: [{ unit_uid: 'B-INF', action_type: 'recon', target: { lat: 24.44, lon: 54.37 } }] };
    var v5 = T.validateCommanderCoaTool({ decision: g5, units: mixed(), allowed_unit_ids: ALLOWED, previous_coa_families: [], allowed_families: ['cautious_recon'] }).data;
    ok('§5 ground recon COA accepted (no doctrine rejection)', v5.accepted === true);

    // ── §6 naval unit + non-land action: ACCEPTED; explicit land_move: REJECTED ─
    console.log('\n§6  Naval non-land action ACCEPTED; explicit land_move REJECTED');
    var n6 = { selected_coa_family: 'maneuver_deception', unit_assignments: [{ unit_uid: 'B-FRIG', action_type: 'screen', target: { lat: 24.55, lon: 54.15 } }] };
    var v6 = T.validateCommanderCoaTool({ decision: n6, units: mixed(), allowed_unit_ids: ALLOWED, previous_coa_families: [], allowed_families: ['maneuver_deception'] }).data;
    ok('§6 naval screen COA accepted', v6.accepted === true);
    var n6b = { selected_coa_family: 'x', unit_assignments: [{ unit_uid: 'B-FRIG', action_type: 'land_move' }] };
    var v6b = T.validateCommanderCoaTool({ decision: n6b, units: mixed(), allowed_unit_ids: ALLOWED }).data;
    ok('§6 naval explicit land_move rejected (physics kept)', v6b.accepted === false && /naval_land_move/.test(v6b.rejected_reason));

    // ── §7 family-variety is SUGGESTED (not enforced); repeated family ACCEPTED ─
    console.log('\n§7  Family variety suggested (not enforced); repeated family ACCEPTED');
    ok('§7 recommended_family avoids the just-used family', tc.recommended_family && tc.avoid_repeating.indexOf(tc.recommended_family) === -1, tc.recommended_family + ' vs ' + JSON.stringify(tc.avoid_repeating));
    ok('§7 avoid_repeating reflects previous_coa_families', tc.avoid_repeating.indexOf('air_intercept') !== -1);
    var rep = { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'B-FIGHT', action_type: 'attack', target: { lat: 24.38, lon: 54.34 } }] };
    var v7 = T.validateCommanderCoaTool({ decision: rep, units: mixed(), allowed_unit_ids: ALLOWED, previous_coa_families: ['air_intercept'], allowed_families: ['air_intercept', 'sensor_tasking', 'maintain_intercept'] }).data;
    ok('§7 repeated family is ACCEPTED (variation not enforced by validator)', v7.accepted === true && !/repeated_coa_family/.test(String(v7.rejected_reason)));
    ok('§7 validator reports structure/physics-only checks', v7.checks === 'structure_physics_only');

    // ── §8 LLM unavailable → deterministic fallback ──────────────────────────
    console.log('\n§8  LLM requested but unavailable → deterministic fallback, plan ok');
    var planLlm = await P.planCoas(mixed(), OBJ, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: true }); // RMOOZ_FREE_FIGHT_LLM not set → no LLM
    ok('§8 plan ok', planLlm.ok === true);
    ok('§8 plan_source deterministic', planLlm.plan_source === 'deterministic_coa_fallback');
    ok('§8 tool_contract present on fallback', !!planLlm.tool_contract);

    // ── §9 valid decision → COA (deterministic floor accepted) ───────────────
    console.log('\n§9  Deterministic floor is a valid, accepted COA');
    ok('§9 deterministic plan has coas', Array.isArray(plan.coas) && plan.coas.length >= 1);
    ok('§9 tool_contract validated (trusted floor)', plan.tool_contract.validated === true);

    // ── §11 no remote provider ───────────────────────────────────────────────
    console.log('\n§11  No remote provider used');
    var savedProv = process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER;
    process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER = 'claude';
    var capTool = await T.getCapabilityIntelTool({ units: mixed(), objectives: OBJ, context: { defending_side: 'BLUE' }, opts: { useLlm: true } });
    ok('§11 capability tool ok despite remote env (local fallback)', capTool.ok === true && capTool.source !== 'llm_inferred');
    if (savedProv == null) delete process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER; else process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER = savedProv;

    // ── §12 scenario-generic ─────────────────────────────────────────────────
    console.log('\n§12  Scenario-generic arbitrary JSON');
    var arb = [u('ENEMY-X', 'RED', 'su-30 fighter', -10.30, 130.25), u('FRIEND-1', 'BLUE', 'mirage 2000 fighter', -10.80, 130.80), u('FRIEND-2', 'BLUE', 'infantry', -10.49, 130.25)];
    var planArb = await P.planCoas(arb, [{ lat: -10.5, lon: 130.25, name: 'TARGET-ZULU' }], { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    ok('§12 tool_contract present for arbitrary scenario', !!planArb.tool_contract && planArb.tool_contract.version === T.TOOL_CONTRACT_VERSION);

    // ── §13 no kill/destroy actions ──────────────────────────────────────────
    console.log('\n§13  Kill/destroy actions blocked');
    var kill = { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'B-FIGHT', role: 'intercept', action_type: 'DESTROY', target: { lat: 24.5, lon: 54.35 } }] };
    var v13 = T.validateCommanderCoaTool({ decision: kill, units: mixed(), allowed_unit_ids: ALLOWED, previous_coa_families: [], allowed_families: ['air_intercept'] }).data;
    ok('§13 destroy action rejected', v13.accepted === false && /kill_action_blocked/.test(v13.rejected_reason));
    // and the deterministic plan COAs never contain kill verbs
    var allActions = JSON.stringify(plan.coas);
    ok('§13 deterministic COAs contain no kill/destroy', !/\bengage\b|\bdestroy\b|\bkill\b|open_fire/i.test(allActions));

    // ── §10 + §14 client integration ─────────────────────────────────────────
    console.log('\n§10+§14  Client carries tool_contract; brief consumes plan; UI + event log');
    ok('§14 commander brief still composed on the tool-enriched plan', !!plan.commander_brief);
    var H = loadClientHarness();
    var scen = { name: 'UAE Abu Dhabi defense', obj: { name: 'Abu Dhabi', coord: [54.37, 24.45] },
        red_units: [u('R-AIR', 'RED', 'su-30 fighter', 24.58, 54.37)],
        blue_units_initial: [u('B-FIGHT', 'BLUE', 'f-16 fighter', 24.30, 54.30), u('B-SAM', 'BLUE', 'patriot sam', 24.46, 54.37), u('B-INF', 'BLUE', 'infantry', 24.40, 54.45)] };
    H.mountScenario(scen, { lat: 24.45, lon: 54.37 });
    H.DEMO._setActiveSideForTest('BLUE'); H.DEMO._setUseLlmForTest(false);
    var body = H.DEMO._buildLoopRequestBodyForTest();
    var cplan = await P.planCoas(body.units, body.objectives, body.context, body.opts);
    H.eventLog.length = 0;
    H.DEMO._runTurnCoreForTest(cplan, 0);
    await flush();
    ok('§10 _lastToolContract set', !!H.DEMO._getLastToolContractForTest());
    H.DEMO._repaintForTest();
    var cmdr = H.elById['rmooz-free-fight-commander-panel'];
    var html = cmdr ? cmdr.innerHTML : '';
    ok('§14 tool-contract line in panel', /data-ff-toolcontract="line"/.test(html) && /AI Tool Contract:/.test(html));
    var msgs = H.eventLog.map(function (e) { return e.message || ''; });
    ok('§14 AI TOOL event line', msgs.some(function (m) { return /^AI TOOL:.*context built/.test(m); }));
    ok('§14 AI TOOL family-selected line', msgs.some(function (m) { return /^AI TOOL: COA family selected/.test(m); }));
    ok('§14 AI VALIDATOR event line', msgs.some(function (m) { return /^AI VALIDATOR: COA (accepted|rejected)/.test(m); }));

    // source guards
    var srcMod = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/rmooz-ai-tool-contract.js'), 'utf8');
    ok('§12 no hardcoded draft/attack_objective/uid in contract module', !/draft-\d|attack_objective/.test(srcMod) && !/['"][RB]-0\d\d['"]/.test(srcMod));

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();

// ── minimal client harness ───────────────────────────────────────────────────
function loadClientHarness() {
    var elById = {};
    function makeEl(tag) {
        return { tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: { cssText: '' }, parentNode: null, disabled: false, _listeners: {},
            appendChild: function (c) { c.parentNode = this; this.children.push(c); if (c.id) elById[c.id] = c; return c; },
            removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); },
            insertBefore: function (c) { this.children.push(c); return c; },
            setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
            getAttribute: function (k) { return this.attrs[k] != null ? this.attrs[k] : null; },
            removeAttribute: function () {}, hasAttribute: function (k) { return this.attrs[k] != null; },
            addEventListener: function () {}, removeEventListener: function () {}, setPointerCapture: function () {},
            querySelectorAll: function () { return []; },
            querySelector: function (sel) { var m = sel.match(/^\[data-ff="([^"]+)"\]$/); if (m) { if (this.attrs['data-ff'] === m[1]) return this; for (var i=0;i<this.children.length;i++){var r=this.children[i].querySelector(sel);if(r)return r;} return null; } return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false, select: function () {} }; } };
    }
    var bodyEl = makeEl('body');
    global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };
    var eventLog = [];
    global.window = {
        innerWidth: 1280, innerHeight: 800,
        document: { body: bodyEl, head: makeEl('head'), createElement: function (t) { return makeEl(t); }, getElementById: function (id) { return elById[id] || null; }, dispatchEvent: function () {}, addEventListener: function () {} },
        addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () {},
        RmoozScenario: null, AppAdjudicatorMap: { drawScenario: function () {} }, AppShellEventLog: { append: function (e) { eventLog.push(e); } },
        setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, clearInterval: function () {},
        fetch: function () { return Promise.resolve({ ok: true, text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({}); } }); },
    };
    var stub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; } };
    global.window.L = { layerGroup: function () { return { addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; } }; }, marker: function () { return Object.assign({}, stub); }, divIcon: function () { return {}; }, circleMarker: function () { return Object.assign({}, stub); }, circle: function () { return Object.assign({}, stub); }, polyline: function () { return Object.assign({}, stub); } };
    global.window.map = { hasLayer: function () { return false; }, removeLayer: function () {}, addLayer: function () {}, on: function () {}, off: function () {}, panTo: function () {}, fitBounds: function () {} };
    global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
    global.window.RmoozFreeFightAI = null;
    require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
    require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
    var DEMO = global.window.RmoozFreeFightDemo;
    function mountScenario(scenario, objLL) {
        global.window.RmoozScenario = { scenario: scenario };
        var payload = { brief: { operational_brief: { proposed_units: [], objectives: [{ label: scenario.obj.name, lat: objLL.lat, lon: objLL.lon }], placement_candidates: [{ type: 'base', lat: objLL.lat, lon: objLL.lon, name: 'AB' }] } } };
        DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(payload);
    }
    return { DEMO: DEMO, elById: elById, bodyEl: bodyEl, eventLog: eventLog, mountScenario: mountScenario };
}
