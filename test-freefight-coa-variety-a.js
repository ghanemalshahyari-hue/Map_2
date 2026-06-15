#!/usr/bin/env node
/*
 * RMOZ-INTEL-CAPABILITY-TERRAIN-ZONE-A — COA variety + capability-matched selection
 *
 *  §1  buildScenarioIntel attaches superiority / zone / ROE / families / best assets
 *  §2  COA family changes when the previous turn used the same family (variation engine)
 *  §3  Airspace violation → best BLUE assets are air interceptors (capability match)
 *  §4  Water/naval threat → best BLUE assets are naval (capability match)
 *  §5  Ground threat near objective → ground assets / ground_blocking family
 *  §6  planCoas attaches plan.intel with recommended_coa_families
 *  §7  Loop threads previous_coa_families and rotates the recommended family across turns
 *  §8  Intel Snapshot UI block renders (superiority + zone + ROE + best assets)
 *  §9  Event log narrates INTEL / ROE / CAPABILITY / TERRAIN on a BLUE turn
 * §10  Scenario-generic: arbitrary unit IDs / objective; no hardcoded draft/uid in modules
 * §11  No classified claims — modules carry demo/review-only/public abstraction disclaimers
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

var INTEL   = require(path.join(__dirname, 'UI_MOdified/server/ai/scenario-intel.js'));
var COAVAR  = require(path.join(__dirname, 'UI_MOdified/server/ai/coa-variation-engine.js'));
var P       = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

function u(id, side, role, lat, lon) { return { uid: id, side: side, role: role, label: role, coord: [lon, lat] }; }
var OBJ = [{ lat: 24.33, lon: 54.66, name: 'OBJ X' }];

// ── §1 intel aggregator shape ────────────────────────────────────────────────
console.log('\n§1  buildScenarioIntel attaches the full snapshot');
var airUnits = [u('R-1','RED','f-14 tomcat',24.48,54.66), u('B-1','BLUE','f-15 fighter',24.30,54.62), u('B-2','BLUE','patriot sam',24.31,54.66), u('B-3','BLUE','radar',24.33,54.70)];
var intel = INTEL.buildScenarioIntel(airUnits, OBJ, { active_side:'RED', defending_side:'BLUE', scenario_name:'UAE Abu Dhabi defense' });
ok('§1 has superiority object', intel.superiority && typeof intel.superiority.air === 'string');
ok('§1 has zone_state', !!intel.zone_state);
ok('§1 has roe_state + alert_state', !!intel.roe_state && !!intel.alert_state);
ok('§1 has recommended_coa_families array', Array.isArray(intel.recommended_coa_families) && intel.recommended_coa_families.length > 0);
ok('§1 has best_blue_assets', Array.isArray(intel.best_blue_assets) && intel.best_blue_assets.length > 0);
ok('§1 carries review-only flags', intel.demo_only === true && intel.review_only === true);

// ── §2 COA family variation ──────────────────────────────────────────────────
console.log('\n§2  COA family changes when previous turn used the same family');
var sit = { zone_state: { zone_type: 'airspace', violation: true, severity: 'alert' }, threat_domain: 'air' };
var v1 = COAVAR.selectCoaFamily(sit, [], {}, {}, 'INTERCEPT');
var v2 = COAVAR.selectCoaFamily(sit, [v1.recommended_family], {}, {}, 'INTERCEPT');
ok('§2 first pick is a family', typeof v1.recommended_family === 'string' && v1.recommended_family.length > 0);
ok('§2 second pick differs from the just-used family', v2.recommended_family !== v1.recommended_family, v1.recommended_family + ' → ' + v2.recommended_family);
ok('§2 avoid_repeating lists the previous family', Array.isArray(v2.avoid_repeating) && v2.avoid_repeating.indexOf(v1.recommended_family) !== -1);

// ── §3 air threat → interceptors ─────────────────────────────────────────────
console.log('\n§3  Airspace violation → best BLUE assets are air interceptors');
var best3 = intel.best_blue_assets;
ok('§3 top BLUE asset is the fighter (air interceptor)', best3[0] && /fighter|interceptor/.test(best3[0].class || ''), best3[0] && best3[0].class);
ok('§3 best_asset_role is air-oriented', /intercept|air/.test(intel.best_asset_role || ''), intel.best_asset_role);

// ── §4 naval threat → naval assets ───────────────────────────────────────────
console.log('\n§4  Water/naval threat → best BLUE assets are naval');
var navalUnits = [u('R-9','RED','missile boat',24.45,54.66), u('B-7','BLUE','frigate',24.30,54.66), u('B-8','BLUE','corvette',24.31,54.64), u('B-9','BLUE','infantry',24.32,54.65)];
var navalIntel = INTEL.buildScenarioIntel(navalUnits, OBJ, { active_side:'RED', defending_side:'BLUE', terrain:'sea coastal' });
ok('§4 top BLUE asset is naval (frigate/corvette)', navalIntel.best_blue_assets[0] && /frigate|corvette|naval/.test(navalIntel.best_blue_assets[0].class || ''), navalIntel.best_blue_assets[0] && navalIntel.best_blue_assets[0].class);

// ── §5 ground threat → ground assets / blocking ──────────────────────────────
console.log('\n§5  Ground threat near objective → ground assets / ground_blocking family');
var groundUnits = [u('R-5','RED','armor',24.45,54.66), u('B-10','BLUE','armor',24.30,54.66), u('B-11','BLUE','infantry',24.31,54.64)];
var groundIntel = INTEL.buildScenarioIntel(groundUnits, OBJ, { active_side:'RED', defending_side:'BLUE' });
ok('§5 zone violation detected for ground intruder', groundIntel.zone_state.violation === true);
ok('§5 best ground asset present', groundIntel.best_blue_assets[0] && /armor|infantry/.test(groundIntel.best_blue_assets[0].class || ''), groundIntel.best_blue_assets[0] && groundIntel.best_blue_assets[0].class);

// ── §6 planCoas attaches intel ───────────────────────────────────────────────
console.log('\n§6  planCoas attaches plan.intel');
(async function () {
    var plan = await P.planCoas(airUnits, OBJ, { active_side:'BLUE', previous_coa_families:[] }, { preferSide:'BLUE', useLlm:false });
    ok('§6 plan.intel present', !!plan.intel);
    ok('§6 plan.intel has recommended_coa_families', plan.intel && Array.isArray(plan.intel.recommended_coa_families));
    ok('§6 plan.intel best_blue_assets present', plan.intel && Array.isArray(plan.intel.best_blue_assets) && plan.intel.best_blue_assets.length > 0);

    // ── §7 loop rotates family across turns ──────────────────────────────────
    console.log('\n§7  Loop threads previous_coa_families and rotates the family');
    var H = loadClientHarness();
    var scen = { red_units: [u('R-1','RED','f-14 tomcat',24.48,54.66)],
                 blue_units_initial: [u('B-1','BLUE','f-15 fighter',24.30,54.62), u('B-2','BLUE','patriot sam',24.31,54.66), u('B-3','BLUE','radar',24.33,54.70), u('B-4','BLUE','frigate',24.20,54.80), u('B-5','BLUE','infantry',24.31,54.64)],
                 obj: { name: 'OBJ X', coord: [54.66, 24.33] } };
    H.mountScenario(scen, { lat: 24.33, lon: 54.66 });
    H.DEMO._setActiveSideForTest('BLUE');
    H.DEMO._setUseLlmForTest(false);
    // turn 1
    var b1 = H.DEMO._buildLoopRequestBodyForTest();
    var p1 = await P.planCoas(b1.units, b1.objectives, b1.context, b1.opts);
    H.DEMO._runTurnCoreForTest(p1, 0); await flush();
    var fam1 = (H.DEMO._getLastIntelForTest() || {}).recommended_coa_family;
    var hist1 = H.DEMO._getCoaFamilyHistoryForTest();
    // turn 2 — must thread the previous family
    H.DEMO._setActiveSideForTest('BLUE'); // keep BLUE acting for a clean comparison
    var b2 = H.DEMO._buildLoopRequestBodyForTest();
    ok('§7 turn-2 request carries previous_coa_families', Array.isArray(b2.context.previous_coa_families) && b2.context.previous_coa_families.length >= 1, JSON.stringify(b2.context.previous_coa_families));
    var p2 = await P.planCoas(b2.units, b2.objectives, b2.context, b2.opts);
    H.DEMO._runTurnCoreForTest(p2, 0); await flush();
    var fam2 = (H.DEMO._getLastIntelForTest() || {}).recommended_coa_family;
    ok('§7 family history recorded', H.DEMO._getCoaFamilyHistoryForTest().length >= 2, JSON.stringify(H.DEMO._getCoaFamilyHistoryForTest()));
    ok('§7 turn-2 family differs from turn-1 (variation)', fam1 && fam2 && fam1 !== fam2, fam1 + ' → ' + fam2);

    // ── §8 Intel Snapshot UI block ───────────────────────────────────────────
    console.log('\n§8  Intel Snapshot UI block renders');
    H.DEMO._repaintForTest();
    var cmdr = H.elById['rmooz-free-fight-commander-panel'];
    var html = cmdr ? cmdr.innerHTML : '';
    ok('§8 Intel Snapshot block present', /data-ff-intel="block"/.test(html));
    ok('§8 shows superiority labels (Air/Naval/Ground/Sensor)', /Air:/.test(html) && /Naval:/.test(html) && /Sensor:/.test(html));
    ok('§8 shows Best BLUE assets + COA family', /Best BLUE assets:/.test(html) && /COA family:/.test(html));

    // ── §9 event log narration ───────────────────────────────────────────────
    console.log('\n§9  Event log narrates INTEL / ROE / CAPABILITY / TERRAIN');
    var msgs = H.eventLog.map(function (e) { return e.message || ''; });
    ok('§9 INTEL line present', msgs.some(function (m) { return /^INTEL:/.test(m); }), msgs.filter(function(m){return /INTEL/.test(m);})[0]);
    ok('§9 ROE line present', msgs.some(function (m) { return /^ROE:/.test(m); }));
    ok('§9 CAPABILITY line present', msgs.some(function (m) { return /^CAPABILITY:/.test(m); }));
    ok('§9 TERRAIN line present', msgs.some(function (m) { return /^TERRAIN:/.test(m); }));

    // ── §10 scenario-generic / no hardcoding ─────────────────────────────────
    console.log('\n§10  Scenario-generic + no hardcoded draft/uid in intel modules');
    var arbIntel = INTEL.buildScenarioIntel(
        [u('ZULU-9','RED','su-30 fighter',-10.4,130.25), u('YANKEE-3','BLUE','s-300 sam',-10.5,130.25)],
        [{ lat:-10.5, lon:130.25, name:'TARGET-ZULU' }], { active_side:'RED', defending_side:'BLUE' });
    ok('§10 arbitrary scenario produces a valid snapshot', !!arbIntel.zone_state && Array.isArray(arbIntel.best_blue_assets));
    ['platform-capability-catalog','terrain-effects-engine','sovereign-zone-engine','contact-detection-engine','roe-escalation-engine','coa-variation-engine','scenario-intel'].forEach(function (m) {
        var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/' + m + '.js'), 'utf8');
        ok('§10 ' + m + ' has no hardcoded draft/attack_objective/specific-uid', !/draft-\d|attack_objective/.test(src) && !/['"][RB]-0\d\d['"]/.test(src));
    });

    // ── §11 no classified claims ─────────────────────────────────────────────
    console.log('\n§11  No classified claims — public/demo abstraction disclaimers present');
    var capSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/platform-capability-catalog.js'), 'utf8');
    ok('§11 capability catalog carries a public/demo/abstraction/review-only disclaimer',
        /public|demo|abstraction|review-only|not.*classified|illustrative/i.test(capSrc));
    // The catalog must explicitly DISCLAIM classified data (not claim to hold any).
    ok('§11 catalog explicitly disclaims classified data',
        /no classified data|not classified|not.*authoritative/i.test(capSrc));
    ok('§11 no positive "classified ranges/specs" CLAIM in catalog',
        !/classified (missile|radar )?(ranges?|spec|specification)s?\s*[:=]/i.test(capSrc));

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
            querySelector: function (sel) {
                var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
                if (mff) { if (this.attrs['data-ff'] === mff[1]) return this; for (var i=0;i<this.children.length;i++){var r=this.children[i].querySelector(sel);if(r)return r;} return null; }
                return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false };
            } };
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
    global.window.L = { layerGroup: function () { return { addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; } }; }, marker: function () { return Object.assign({}, stub); }, divIcon: function () { return {}; }, circleMarker: function () { return Object.assign({}, stub); }, polyline: function () { return Object.assign({}, stub); } };
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
