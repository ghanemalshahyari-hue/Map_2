#!/usr/bin/env node
/*
 * RMOZ-COMMANDER-BRIEF-COALITION-A — client integration (loop → brief → UI + log)
 *
 *  §1  Loop turn carries plan.commander_brief into the decision record + _lastBrief
 *  §2  Commander panel renders the Commander Brief block + coalition (GCC for a UAE scenario)
 *  §3  Expanding the brief shows the copyable <textarea> with the full AI Commander Decision text
 *  §4  COALITION event-log line fires on the acting turn
 *  §5  A NATO-country scenario resolves coalition NATO (generic, not GCC-only)
 *  §6  Brief text is review-only and free of engage/destroy/kill verbs
 *  §7  Client source wires _commanderBriefHtml + brief-toggle/brief-copy + coalition log
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

function u(id, side, role, lat, lon, country) { return { uid: id, side: side, role: role, label: role, coord: [lon, lat], country: country }; }

(async function main() {
    var H = loadClientHarness();

    // ── UAE / GCC scenario, RED air unit inside the defended zone ────────────
    var scen = { red_units: [u('R-AIR-1','RED','su-30 fighter',24.58,54.37,'Iran')],
                 blue_units_initial: [u('B-1','BLUE','f-16 fighter',24.50,54.30,'UAE'), u('B-2','BLUE','patriot sam',24.46,54.37,'UAE'), u('B-3','BLUE','radar',24.45,54.40,'UAE'), u('B-4','BLUE','frigate',24.55,54.15,'UAE')],
                 obj: { name: 'Abu Dhabi', coord: [54.37, 24.45] } };
    H.mountScenario(scen, { lat: 24.45, lon: 54.37 }, 'UAE Abu Dhabi defense');
    H.DEMO._setActiveSideForTest('BLUE');
    H.DEMO._setUseLlmForTest(false);
    var body = H.DEMO._buildLoopRequestBodyForTest();
    var plan = await P.planCoas(body.units, body.objectives, Object.assign({ scenario_name: 'UAE Abu Dhabi defense' }, body.context), body.opts);
    H.eventLog.length = 0;
    H.DEMO._runTurnCoreForTest(plan, 0);
    await flush();

    // ── §1 brief carried into the loop ───────────────────────────────────────
    console.log('\n§1  Loop carries plan.commander_brief');
    ok('§1 plan has commander_brief', !!plan.commander_brief);
    var lastBrief = H.DEMO._getLastBriefForTest();
    ok('§1 _lastBrief set after turn', !!lastBrief);
    ok('§1 brief is for BLUE', lastBrief && lastBrief.side === 'BLUE');

    // ── §2 panel renders brief + coalition ───────────────────────────────────
    console.log('\n§2  Commander panel renders Commander Brief + coalition (GCC)');
    H.DEMO._repaintForTest();
    var cmdr = H.elById['rmooz-free-fight-commander-panel'];
    var html = cmdr ? cmdr.innerHTML : '';
    ok('§2 Commander Brief block present', /data-ff-brief="block"/.test(html));
    ok('§2 coalition shown as GCC', /Coalition:[\s\S]{0,80}GCC/.test(html), (html.match(/Coalition:[^<]*/)||[])[0]);
    ok('§2 lead nation UAE shown', /lead: UAE/.test(html));
    ok('§2 "Show full brief (copyable)" toggle present', /data-act="brief-toggle"/.test(html));

    // ── §3 expand → copyable textarea ────────────────────────────────────────
    console.log('\n§3  Expanding shows the copyable brief textarea');
    H.DEMO._setBriefExpandedForTest(true);
    H.DEMO._repaintForTest();
    var html2 = (H.elById['rmooz-free-fight-commander-panel'] || {}).innerHTML || '';
    ok('§3 copyable textarea present', /<textarea[^>]*data-ff-brief="copy"/.test(html2));
    ok('§3 textarea contains AI Commander Decision text', /AI Commander Decision/.test(html2));
    ok('§3 Copy button present when expanded', /data-act="brief-copy"/.test(html2));

    // ── §4 coalition event-log line ──────────────────────────────────────────
    console.log('\n§4  COALITION event-log line fires');
    var msgs = H.eventLog.map(function (e) { return e.message || ''; });
    ok('§4 a COALITION line was logged', msgs.some(function (m) { return /COALITION:/.test(m); }), msgs.filter(function(m){return /COALITION/.test(m);})[0]);
    ok('§4 GCC + lead nation in the COALITION line', msgs.some(function (m) { return /COALITION:.*GCC/.test(m); }));

    // ── §5 NATO scenario (generic, not GCC-only) ─────────────────────────────
    console.log('\n§5  NATO-country scenario resolves coalition NATO');
    var scenNato = { red_units: [u('RX','RED','su-30 fighter',48.30,16.40,'Russia')],
                     blue_units_initial: [u('BX','BLUE','f-16 fighter',48.20,16.37,'Germany'), u('BY','BLUE','patriot sam',48.18,16.36,'France')],
                     obj: { name: 'Vienna Sector', coord: [16.37, 48.21] } };
    H.mountScenario(scenNato, { lat: 48.21, lon: 16.37 }, 'NATO eastern flank');
    H.DEMO._setActiveSideForTest('BLUE'); H.DEMO._setUseLlmForTest(false);
    var b2 = H.DEMO._buildLoopRequestBodyForTest();
    var planNato = await P.planCoas(b2.units, b2.objectives, Object.assign({ scenario_name: 'NATO eastern flank' }, b2.context), b2.opts);
    var natoBrief = planNato.commander_brief;
    ok('§5 NATO scenario → coalition NATO', natoBrief && natoBrief.coalition_posture && natoBrief.coalition_posture.coalition === 'NATO', natoBrief && natoBrief.coalition_posture && natoBrief.coalition_posture.coalition);

    // ── §6 review-only, no kill verbs ────────────────────────────────────────
    console.log('\n§6  Brief is review-only and free of engage/destroy/kill verbs');
    var txt = (lastBrief && lastBrief.text) || '';
    ok('§6 text mentions review-only / commander approval', /review-only|commander approval/i.test(txt));
    ok('§6 no engage/destroy/kill verbs in brief text + actions',
        !/\bengage\b|\bdestroy\b|\bkill\b|open fire/i.test(txt + ' ' + (lastBrief.actions || []).join(' ')));

    // ── §7 source wiring ─────────────────────────────────────────────────────
    console.log('\n§7  Client source wiring');
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    ok('§7 _commanderBriefHtml present', /_commanderBriefHtml/.test(src));
    ok('§7 brief-toggle + brief-copy handlers present', /brief-toggle/.test(src) && /brief-copy/.test(src));
    ok('§7 coalition event_log_entries appended', /coalition_posture[\s\S]{0,120}event_log_entries/.test(src));
    var srcP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'), 'utf8');
    ok('§7 planner attaches commander_brief', /commander_brief\s*=\s*BRIEF\.buildCommanderBrief|_attachCommanderBrief/.test(srcP));

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
                return { addEventListener: function () {}, style: { cssText: '' }, textContent: '', value: '', checked: false, select: function () {} };
            } };
    }
    var bodyEl = makeEl('body');
    global.sessionStorage = { _data: {}, getItem: function (k) { return this._data[k] != null ? this._data[k] : null; }, setItem: function (k, v) { this._data[k] = String(v); }, removeItem: function (k) { delete this._data[k]; } };
    var eventLog = [];
    global.window = {
        innerWidth: 1280, innerHeight: 800,
        document: { body: bodyEl, head: makeEl('head'), createElement: function (t) { return makeEl(t); }, getElementById: function (id) { return elById[id] || null; }, dispatchEvent: function () {}, addEventListener: function () {}, execCommand: function () {} },
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
    function mountScenario(scenario, objLL, scenName) {
        global.window.RmoozScenario = { scenario: scenario };
        var payload = { brief: { operational_brief: { scenario_name: scenName, proposed_units: [], objectives: [{ label: scenario.obj.name, lat: objLL.lat, lon: objLL.lon }], placement_candidates: [{ type: 'base', lat: objLL.lat, lon: objLL.lon, name: 'AB' }] } } };
        DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(payload);
    }
    return { DEMO: DEMO, elById: elById, bodyEl: bodyEl, eventLog: eventLog, mountScenario: mountScenario };
}
