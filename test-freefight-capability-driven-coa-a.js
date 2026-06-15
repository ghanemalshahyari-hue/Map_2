#!/usr/bin/env node
/*
 * FREEFIGHT-LLM-CAPABILITY-ANALYST-A — capability-driven COA integration
 * The COA planner must pick assets by CAPABILITY (not just nearest), surface a
 * capability_summary, and the client must show a Capability Intelligence block +
 * CAPABILITY event-log lines.
 *
 *  §1  plan includes capability_summary + unit_capability_profiles
 *  §2  Airspace threat → fighter/interceptor leads the intercept (even if farther than infantry)
 *  §3  Waters threat → naval asset leads (before infantry)
 *  §4  Ground threat → ground unit leads (fighter NOT pulled to a ground block)
 *  §5  Radar/SAM are reported as best sensor/air-defense (support posture, not the assault lead)
 *  §6  Commander panel renders the Capability Intelligence block + best assets
 *  §7  Event log has CAPABILITY lines (air-intercept asset, sensor role, ground held)
 *  §8  Scenario-generic: arbitrary unit IDs/objective still capability-select
 *  §9  Uniform-capability force → selection reduces to proximity (no regression)
 * §10  No exact/classified capability claims surfaced in the COA/profiles
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

function u(id, side, role, lat, lon) { return { uid: id, side: side, role: role, label: role, lat: lat, lon: lon, coord: [lon, lat] }; }
var OBJ = [{ lat: 24.45, lon: 54.37, name: 'Abu Dhabi' }];
function recOf(plan) { return plan.coas.filter(function (c) { return c.recommended; })[0]; }
function interceptLead(plan) { var r = recOf(plan); var a = r.phases[0].actions.filter(function (x) { return x.role === 'intercept' || x.role === 'reinforce' || x.role === 'screen'; }); return a[0] ? a[0].unit_uid : null; }

(async function main() {
    // ── §1 + §2 air threat → fighter leads ───────────────────────────────────
    console.log('\n§1+§2  Air threat → fighter leads intercept; plan carries capability_summary');
    var air = [u('R-AIR', 'RED', 'su-30 fighter', 24.58, 54.37),
               u('B-FIGHT', 'BLUE', 'f-16 fighter', 24.10, 54.10),   // FAR
               u('B-INF1', 'BLUE', 'infantry', 24.44, 54.37),         // NEAR
               u('B-INF2', 'BLUE', 'infantry', 24.45, 54.38),         // NEAR
               u('B-SAM', 'BLUE', 'patriot sam', 24.46, 54.36),
               u('B-RAD', 'BLUE', 'early warning radar', 24.45, 54.40)];
    var planA = await P.planCoas(air, OBJ, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    ok('§1 plan.capability_summary present', !!planA.capability_summary);
    ok('§1 plan.unit_capability_profiles present', Array.isArray(planA.unit_capability_profiles) && planA.unit_capability_profiles.length > 0);
    var leadA = interceptLead(planA);
    ok('§2 fighter B-FIGHT leads intercept despite being farther', leadA === 'B-FIGHT', 'lead=' + leadA);
    ok('§2 best_by_side.BLUE.air_intercept is the fighter', planA.capability_summary.best_by_side.BLUE.air_intercept && planA.capability_summary.best_by_side.BLUE.air_intercept.unit_uid === 'B-FIGHT');

    // ── §3 waters threat → naval leads ───────────────────────────────────────
    console.log('\n§3  Waters threat → naval asset leads (before infantry)');
    var sea = [u('R-NAV', 'RED', 'missile boat', 24.58, 54.37),
               u('B-FRIG', 'BLUE', 'frigate', 24.10, 54.10),   // FAR
               u('B-INF1', 'BLUE', 'infantry', 24.44, 54.37),   // NEAR
               u('B-INF2', 'BLUE', 'infantry', 24.45, 54.38)];
    var planS = await P.planCoas(sea, OBJ, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    var leadS = interceptLead(planS);
    ok('§3 frigate leads vs nearer infantry', leadS === 'B-FRIG', 'lead=' + leadS);
    ok('§3 best naval_screen is the frigate', planS.capability_summary.best_by_side.BLUE.naval_screen && planS.capability_summary.best_by_side.BLUE.naval_screen.unit_uid === 'B-FRIG');

    // ── §4 ground threat → ground leads, fighter NOT pulled ──────────────────
    console.log('\n§4  Ground threat → ground unit leads; fighter not pulled to ground block');
    var gnd = [u('R-GND', 'RED', 'armor', 24.58, 54.37),
               u('B-FIGHT', 'BLUE', 'f-16 fighter', 24.44, 54.37),  // NEAR but wrong domain
               u('B-ARM', 'BLUE', 'armor', 24.10, 54.10),           // FAR
               u('B-INF', 'BLUE', 'infantry', 24.20, 54.20)];
    var planG = await P.planCoas(gnd, OBJ, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    var leadG = interceptLead(planG);
    ok('§4 ground unit (armor/infantry) leads, not the fighter', leadG === 'B-ARM' || leadG === 'B-INF', 'lead=' + leadG);

    // ── §5 radar/SAM as best sensor/air-defense ──────────────────────────────
    console.log('\n§5  Radar/SAM reported as best sensor/air-defense (support posture)');
    var bAir = planA.capability_summary.best_by_side.BLUE;
    ok('§5 best sensor is the radar', bAir.sensor && bAir.sensor.unit_uid === 'B-RAD');
    ok('§5 best air_defense is the SAM', bAir.air_defense && bAir.air_defense.unit_uid === 'B-SAM');

    // ── §6 + §7 client panel + event log ─────────────────────────────────────
    var H = loadClientHarness();
    var scen = { name: 'UAE Abu Dhabi defense', obj: { name: 'Abu Dhabi', coord: [54.37, 24.45] },
        red_units: [u('R-AIR', 'RED', 'su-30 fighter', 24.58, 54.37)],
        blue_units_initial: [u('B-FIGHT', 'BLUE', 'f-16 fighter', 24.30, 54.30), u('B-SAM', 'BLUE', 'patriot sam', 24.46, 54.37), u('B-RAD', 'BLUE', 'early warning radar', 24.45, 54.40), u('B-INF', 'BLUE', 'infantry', 24.40, 54.45)] };
    H.mountScenario(scen, { lat: 24.45, lon: 54.37 });
    H.DEMO._setActiveSideForTest('BLUE'); H.DEMO._setUseLlmForTest(false);
    var body = H.DEMO._buildLoopRequestBodyForTest();
    var plan = await P.planCoas(body.units, body.objectives, body.context, body.opts);
    H.eventLog.length = 0;
    H.DEMO._runTurnCoreForTest(plan, 0);
    await flush();

    console.log('\n§6  Commander panel renders Capability Intelligence block');
    ok('§6 _lastCapability set', !!H.DEMO._getLastCapabilityForTest());
    H.DEMO._repaintForTest();
    var cmdr = H.elById['rmooz-free-fight-commander-panel'];
    var html = cmdr ? cmdr.innerHTML : '';
    ok('§6 Capability Intelligence block present', /data-ff-cap="block"/.test(html));
    ok('§6 shows Best air intercept', /Best air intercept:/.test(html));
    ok('§6 shows source review-required', /review required/.test(html));
    ok('§6 shows Selection logic', /Selection logic:/.test(html));

    console.log('\n§7  Event log has CAPABILITY lines');
    var msgs = H.eventLog.map(function (e) { return e.message || ''; });
    ok('§7 CAPABILITY air-intercept line', msgs.some(function (m) { return /CAPABILITY:.*air-intercept asset/.test(m); }), msgs.filter(function(m){return /CAPABILITY/.test(m);})[0]);
    ok('§7 CAPABILITY sensor line', msgs.some(function (m) { return /CAPABILITY:.*sensor support role/.test(m); }));
    ok('§7 CAPABILITY ground-held line', msgs.some(function (m) { return /CAPABILITY:.*held — not suitable for air intercept/.test(m); }));

    // ── §8 scenario-generic ──────────────────────────────────────────────────
    console.log('\n§8  Scenario-generic capability selection (arbitrary IDs/objective)');
    var arb = [u('ENEMY-X', 'RED', 'su-30 fighter', -10.30, 130.25),
               u('FRIEND-FIGHTER', 'BLUE', 'mirage 2000 fighter', -10.80, 130.80),
               u('FRIEND-INF', 'BLUE', 'infantry', -10.49, 130.25)];
    var planB = await P.planCoas(arb, [{ lat: -10.5, lon: 130.25, name: 'TARGET-ZULU' }], { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    ok('§8 fighter leads for arbitrary scenario', interceptLead(planB) === 'FRIEND-FIGHTER', 'lead=' + interceptLead(planB));

    // ── §9 uniform force → proximity (no regression) ─────────────────────────
    console.log('\n§9  Uniform-capability force → nearest leads (no regression)');
    var uni = [u('R-1', 'RED', 'infantry', 24.58, 54.37),
               u('B-NEAR', 'BLUE', 'infantry', 24.46, 54.37),  // nearest
               u('B-FAR', 'BLUE', 'infantry', 24.10, 54.10)];
    var planU = await P.planCoas(uni, OBJ, { active_side: 'BLUE' }, { preferSide: 'BLUE', useLlm: false });
    ok('§9 nearest infantry leads when capability is uniform', interceptLead(planU) === 'B-NEAR', 'lead=' + interceptLead(planU));

    // ── §10 no classified claims ─────────────────────────────────────────────
    console.log('\n§10  No exact/classified capability claims surfaced');
    var profStr = JSON.stringify(planA.unit_capability_profiles);
    ok('§10 profiles carry review_required', planA.unit_capability_profiles.every(function (p) { return p.review_required === true; }));
    ok('§10 profile source is an allowed enum', planA.unit_capability_profiles.every(function (p) { return ['llm_inferred', 'heuristic', 'explicit_scenario', 'catalog'].indexOf(p.source) !== -1; }));
    ok('§10 no "classified"/exact-range claim in profiles', !/classified|exact range|km range|missile range \d/i.test(profStr));
    var srcMod = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-capability-analyst.js'), 'utf8');
    ok('§10 analyst module disclaims (public/demo/review-only)', /public|demo|abstraction|review.required|not.*classified/i.test(srcMod));
    ok('§10 no hardcoded draft/attack_objective/specific-uid in analyst', !/draft-\d|attack_objective/.test(srcMod) && !/['"][RB]-0\d\d['"]/.test(srcMod));

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
