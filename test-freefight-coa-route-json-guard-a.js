#!/usr/bin/env node
/*
 * FREEFIGHT-COA-ROUTE-JSON-GUARD-A
 * The bug: a stale/wrong server answers POST /plan-coas with plain text
 * "Method Not Allowed" (405); the client called r.json() and threw
 * "Unexpected token 'M' ... is not valid JSON". These tests prove the guard.
 *
 *  §1  _fetchJsonSafe on a non-JSON 405 returns a structured object (no throw)
 *  §2  _isRouteUnavailable + _routeUnavailableText classify it as ROUTE, not LLM
 *  §3  _generateCoaPlan on 405 → route-unavailable UI banner, NOT "LLM failed"
 *  §4  _fetchJsonSafe + _generateCoaPlan on valid JSON still work
 *  §5  runNextTurn on 405 → loop pauses safely, no throw, no turn applied
 *  §6  runNextTurn on valid JSON → a turn applies normally
 *  §7  server planner.routeHealth() reports local-only + provider/model + llm flag
 *  §8  server bridge GET /plan-coas/health returns ok:true JSON
 *  §9  routeHealth blocks a misconfigured remote provider (stays ollama)
 * §10  client renders "Planner route" status + Check button + provider/model
 */
'use strict';

var path = require('path');
var fs   = require('fs');
// RMOOZ-AI-FREE-FIGHT-MODEL-SOT-A: the committed default model lives ONLY in ai-config.js. Tests
// assert against it rather than re-hardcoding a model name (which is exactly the drift we removed).
var AI_CFG = require(path.join(__dirname, 'UI_MOdified/server/ai/ai-config.js'));

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}
function flush() { return new Promise(function (r) { setImmediate(r); }); }

// ── response builders ────────────────────────────────────────────────────────
function resp405PlainText() {
    return {
        status: 405, statusText: 'Method Not Allowed', ok: false,
        text: function () { return Promise.resolve('Method Not Allowed'); },
        json: function () { return Promise.reject(new SyntaxError("Unexpected token 'M', \"Method Not Allowed\" is not valid JSON")); },
    };
}
function respJson(obj, status) {
    status = status || 200;
    return {
        status: status, statusText: status < 400 ? 'OK' : 'Error', ok: status < 400,
        text: function () { return Promise.resolve(JSON.stringify(obj)); },
        json: function () { return Promise.resolve(obj); },
    };
}

// ── DOM/map harness ──────────────────────────────────────────────────────────
var elById = {};
function deepQuery(el, sel) {
    if (!el) return null;
    var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
    if (mff) { if (el.attrs && el.attrs['data-ff'] === mff[1]) return el; for (var i=0;i<(el.children||[]).length;i++){var r=deepQuery(el.children[i],sel);if(r)return r;} return null; }
    var m = sel.match(/^\[data-act="([^"]+)"\]$/); if (!m) return null;
    if (el.attrs && el.attrs['data-act'] === m[1]) return el;
    for (var j=0;j<(el.children||[]).length;j++){var r2=deepQuery(el.children[j],sel);if(r2)return r2;}
    if (el.innerHTML && el.innerHTML.indexOf('data-act="'+m[1]+'"')!==-1) return { addEventListener:function(){}, style:{cssText:''}, textContent:'', checked:false, value:'' };
    return null;
}
function makeEl(tag) {
    return { tagName:String(tag).toUpperCase(), id:'', innerHTML:'', textContent:'', children:[], attrs:{}, style:{cssText:''}, parentNode:null, disabled:false, _listeners:{},
        appendChild:function(c){c.parentNode=this;this.children.push(c);if(c.id)elById[c.id]=c;return c;},
        removeChild:function(c){this.children=this.children.filter(function(x){return x!==c;});c.parentNode=null;},
        insertBefore:function(c){this.children.push(c);return c;},
        setAttribute:function(k,v){this.attrs[k]=String(v==null?'':v);}, getAttribute:function(k){return this.attrs[k]!=null?this.attrs[k]:null;},
        removeAttribute:function(k){delete this.attrs[k];}, hasAttribute:function(k){return this.attrs[k]!=null;},
        addEventListener:function(){}, removeEventListener:function(){}, setPointerCapture:function(){},
        querySelectorAll:function(){return [];}, querySelector:function(sel){return deepQuery(this,sel);} };
}
var bodyEl = makeEl('body');
global.sessionStorage = { _data:{}, getItem:function(k){return this._data[k]!=null?this._data[k]:null;}, setItem:function(k,v){this._data[k]=String(v);}, removeItem:function(k){delete this._data[k];} };

var _eventLog = [], _timeouts = [], _intervals = [];
var __fetchHandler = function () { return Promise.resolve(respJson({ ok:false })); };

global.window = {
    innerWidth:1280, innerHeight:800,
    document:{ body:bodyEl, head:makeEl('head'), createElement:function(t){return makeEl(t);}, getElementById:function(id){return elById[id]||null;}, dispatchEvent:function(){}, addEventListener:function(){} },
    addEventListener:function(){}, removeEventListener:function(){}, dispatchEvent:function(){},
    RmoozScenario:null,
    AppAdjudicatorMap:{ drawScenario:function(){} },
    AppShellEventLog:{ append:function(e){ _eventLog.push(e); } },
    setTimeout:function(fn,ms){var id={fn:fn,ms:ms};_timeouts.push(id);return id;},
    clearTimeout:function(id){_timeouts=_timeouts.filter(function(x){return x!==id;});},
    setInterval:function(fn,ms){var id={fn:fn,ms:ms};_intervals.push(id);return id;},
    clearInterval:function(id){_intervals=_intervals.filter(function(x){return x!==id;});},
    fetch:function(url,opts){ return __fetchHandler(url,opts); },
};
var stub = { addTo:function(){return this;}, on:function(){return this;}, bindPopup:function(){return this;} };
global.window.L = { layerGroup:function(){return {addTo:function(){return this;},clearLayers:function(){},addLayer:function(){return this;}};}, marker:function(){return Object.assign({},stub);}, divIcon:function(){return {};}, circleMarker:function(){return Object.assign({},stub);}, polyline:function(){return Object.assign({},stub);} };
global.window.map = { hasLayer:function(){return false;}, removeLayer:function(){}, addLayer:function(){}, on:function(){}, off:function(){}, panTo:function(){} };
global.window.RmoozDemoUnits = { buildGroupsFromAnchors:function(){return [];} };
global.window.RmoozFreeFightAI = null;

var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;
// RMOOZ-AI-FREE-FIGHT-AI-ONLY-A: this suite tests the route-JSON guard with the deterministic loop
// (the sanctioned "deterministic planner for tests" case). Relax the live AI-only gate so the loop
// runs on deterministic plans here; AI-only enforcement is covered by test-ai-free-fight-ai-only-a.js.
if (typeof DEMO._setAiOnlyGateForTest === 'function') DEMO._setAiOnlyGateForTest(false);

var PAYLOAD = { brief:{ operational_brief:{ proposed_units:[], objectives:[{label:'Objective X',lat:34.9,lon:48.9}], placement_candidates:[{type:'base',lat:34.5,lon:48.5,name:'AB'}] } } };
function mkUnits(n, side){ var u=[]; for(var i=0;i<n;i++){var lat=34.5+i*0.012,lon=48.5+i*0.012;u.push({uid:side[0]+'-'+String(i+1).padStart(3,'0'),side:side,lat:lat,lon:lon,coord:[lon,lat]});} return u; }
function freshMount(){
    elById={}; bodyEl.children=[]; sessionStorage._data={}; _eventLog=[]; _timeouts=[]; _intervals=[];
    global.window.RmoozScenario = { scenario:{ red_units:mkUnits(10,'RED'), blue_units_initial:mkUnits(6,'BLUE'), obj:{name:'Objective X',coord:[48.9,34.9]} } };
    __fetchHandler = function(){ return Promise.resolve(respJson({ ok:true, route:'/api/wargame-sim/free-fight/plan-coas', method:'POST', planner:'free-fight-coa-planner', local_only:true, provider:'ollama', model:AI_CFG.defaultModel, llm_enabled:false })); };
    DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(PAYLOAD);
}
function realPlan(side){ var b=DEMO._buildLoopRequestBodyForTest(); return PLANNER.planCoas(b.units,b.objectives,{active_side:side||'RED'},{preferSide:side||'RED',useLlm:false,allowed_unit_ids:b.units.map(function(u){return u.id;})}); }

(async function main(){
    // ── §1 _fetchJsonSafe never throws on plain-text 405 ─────────────────────
    console.log('\n§1  _fetchJsonSafe on non-JSON 405 returns structured object (no throw)');
    freshMount();
    __fetchHandler = function(){ return Promise.resolve(resp405PlainText()); };
    var threw = false, r1 = null;
    try { r1 = await DEMO._fetchJsonSafeForTest('/api/wargame-sim/free-fight/plan-coas', { method:'POST' }); }
    catch (e) { threw = true; }
    ok('§1 did not throw', !threw);
    ok('§1 ok === false', r1 && r1.ok === false);
    ok('§1 reason === non_json_response', r1 && r1.reason === 'non_json_response');
    ok('§1 status === 405', r1 && r1.status === 405);
    ok('§1 body_preview captured "Method Not Allowed"', r1 && /Method Not Allowed/.test(r1.body_preview));
    ok('§1 route echoed', r1 && /plan-coas/.test(r1.route));

    // ── §2 classify as ROUTE not LLM ─────────────────────────────────────────
    console.log('\n§2  _isRouteUnavailable + message classify as ROUTE, not LLM');
    ok('§2 _isRouteUnavailable true for non_json_response', DEMO._isRouteUnavailableForTest(r1) === true);
    ok('§2 _isRouteUnavailable true for {status:405}', DEMO._isRouteUnavailableForTest({ status:405 }) === true);
    ok('§2 _isRouteUnavailable false for a real plan', DEMO._isRouteUnavailableForTest({ ok:true, coas:[] }) === false);
    var msg = DEMO._routeUnavailableTextForTest(r1);
    ok('§2 message says "Planner route unavailable"', /Planner route unavailable/.test(msg));
    ok('§2 message tells operator to start the real server', /Start the real RMOOZ server/.test(msg));
    ok('§2 message does NOT blame the LLM', !/LLM/i.test(msg));

    // ── §3 _generateCoaPlan on 405 → route banner, not LLM failed ────────────
    console.log('\n§3  _generateCoaPlan on 405 shows route-unavailable, not LLM failed');
    freshMount();
    __fetchHandler = function(){ return Promise.resolve(resp405PlainText()); };
    DEMO._generateCoaPlanForTest2();
    await flush(); await flush();
    var plan3 = DEMO._getCoaPlanForTest();
    ok('§3 _coaPlan flagged route unavailable', plan3 && plan3._route_unavailable === true);
    ok('§3 _routeUnavailableMsg set', /Planner route unavailable/.test(DEMO._getRouteUnavailableMsgForTest() || ''));
    DEMO._repaintForTest();
    var bodyHtml = bodyEl.querySelector('[data-ff="body"]') ? bodyEl.querySelector('[data-ff="body"]').innerHTML : '';
    ok('§3 UI renders route-unavailable banner', /data-ff-coa="route-unavailable"|data-ff-loop="route-unavailable"/.test(bodyHtml));
    ok('§3 UI text mentions route, not "LLM failed"', /Planner route unavailable/.test(bodyHtml) && !/LLM failed/i.test(bodyHtml));

    // ── §4 valid JSON still works ────────────────────────────────────────────
    console.log('\n§4  Valid JSON plan still works');
    freshMount();
    var good = await realPlan('RED');
    __fetchHandler = function(){ return Promise.resolve(respJson(good)); };
    var r4 = await DEMO._fetchJsonSafeForTest('/api/wargame-sim/free-fight/plan-coas', { method:'POST' });
    ok('§4 _fetchJsonSafe returns parsed plan', r4 && r4.ok === true && Array.isArray(r4.coas));
    DEMO._generateCoaPlanForTest2();
    await flush(); await flush();
    var plan4 = DEMO._getCoaPlanForTest();
    ok('§4 _coaPlan.ok true', plan4 && plan4.ok === true);
    ok('§4 _coaPlan has coas', plan4 && Array.isArray(plan4.coas) && plan4.coas.length >= 1);
    ok('§4 no route-unavailable flag on success', !(plan4 && plan4._route_unavailable));

    // ── §5 runNextTurn on 405 → loop pauses safely ───────────────────────────
    console.log('\n§5  runNextTurn on 405 pauses the loop safely (no throw, no turn)');
    freshMount();
    __fetchHandler = function(){ return Promise.resolve(resp405PlainText()); };
    var loopThrew = false;
    try { DEMO._startLoopForTest(); await flush(); await flush(); }
    catch (e) { loopThrew = true; }
    var st5 = DEMO._getLoopStateForTest();
    ok('§5 starting the loop did not throw', !loopThrew);
    ok('§5 no turn was applied', st5.turn === 0, 'turn=' + st5.turn);
    ok('§5 loop is paused after route failure', st5.paused === true);
    ok('§5 route-unavailable message set', /Planner route unavailable/.test(DEMO._getRouteUnavailableMsgForTest() || ''));
    var loggedRoute = _eventLog.some(function(e){ return /route unavailable|does not support POST/i.test(e.message||''); });
    var loggedLlmFail = _eventLog.some(function(e){ return /LLM failed/i.test(e.message||''); });
    ok('§5 event log records route problem', loggedRoute);
    ok('§5 event log does NOT say "LLM failed"', !loggedLlmFail);

    // ── §6 runNextTurn on valid JSON → turn applies ──────────────────────────
    console.log('\n§6  runNextTurn on valid JSON applies a turn');
    freshMount();
    var good6 = await realPlan('RED');
    __fetchHandler = function(){ return Promise.resolve(respJson(good6)); };
    DEMO._stepOnceForTest();
    await flush(); await flush();
    var st6 = DEMO._getLoopStateForTest();
    ok('§6 a turn was applied (turn===1)', st6.turn === 1, 'turn=' + st6.turn);
    ok('§6 no route-unavailable message on success', !DEMO._getRouteUnavailableMsgForTest());

    // ── §7 server planner.routeHealth() ──────────────────────────────────────
    console.log('\n§7  planner.routeHealth() reports local-only + provider/model');
    var rh = PLANNER.routeHealth();
    ok('§7 local_only true', rh.local_only === true);
    ok('§7 provider_policy local_only', rh.provider_policy === 'local_only');
    ok('§7 provider is ollama (local)', rh.provider === 'ollama');
    ok('§7 model defaults to ai-config defaultModel', rh.model === AI_CFG.defaultModel && !!rh.model);
    ok('§7 llm_enabled is boolean', typeof rh.llm_enabled === 'boolean');
    ok('§7 remote providers listed as blocked', Array.isArray(rh.remote_providers_blocked) && rh.remote_providers_blocked.indexOf('claude') !== -1);

    // ── §8 server bridge GET /plan-coas/health ───────────────────────────────
    console.log('\n§8  bridge GET /plan-coas/health returns ok JSON');
    var BRIDGE = require(path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge.js'));
    var sent = null;
    var handled = BRIDGE.handle({ method:'GET' }, {}, {
        url:'/api/wargame-sim/free-fight/plan-coas/health',
        pathname:'/api/wargame-sim/free-fight/plan-coas/health',
        method:'GET',
        sendJson:function(res, status, payload){ sent = { status:status, payload:payload }; },
        scenarios:{},
    });
    // RMOOZ-AI-EXECUTION-SINGLE-GATE-A: the health endpoint now resolves model_available
    // asynchronously, so await the response before asserting.
    await flush(); await flush(); await flush();
    ok('§8 bridge handled the health route', handled === true);
    ok('§8 health returns 200', sent && sent.status === 200);
    ok('§8 health ok:true', sent && sent.payload && sent.payload.ok === true);
    ok('§8 health names the route + POST method', sent && sent.payload.route === '/api/wargame-sim/free-fight/plan-coas' && sent.payload.method === 'POST');
    ok('§8 health local_only + provider/model', sent && sent.payload.local_only === true && sent.payload.provider === 'ollama' && sent.payload.model === AI_CFG.defaultModel);

    // ── §9 remote provider blocked in routeHealth ────────────────────────────
    console.log('\n§9  routeHealth blocks a misconfigured remote provider');
    var savedProv = process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'claude';
    var rhRemote = PLANNER.routeHealth();
    ok('§9 remote provider is blocked (reported as ollama)', rhRemote.provider === 'ollama');
    ok('§9 provider_blocked flag true', rhRemote.provider_blocked === true);
    ok('§9 still local_only', rhRemote.local_only === true);
    if (savedProv == null) delete process.env.RMOOZ_FREE_FIGHT_PROVIDER; else process.env.RMOOZ_FREE_FIGHT_PROVIDER = savedProv;

    // ── §10 client renders route status + check button + provider/model ──────
    // RMOOZ-AI-USER-FRIENDLY-MODEL-FLOW-A: the route status / Check button / provider+model now live
    // under the collapsed "Advanced diagnostics" block (the everyday surface is the simple model flow).
    console.log('\n§10  Client renders Planner route status + Check button + provider/model (under Advanced)');
    freshMount();
    DEMO._setRouteHealthForTest({ ok: true, allow_sim_run: true, model_available: true,
        provider: 'ollama', configured_provider: 'ollama', model: AI_CFG.defaultModel });
    DEMO._repaintForTest();
    var html10 = bodyEl.querySelector('[data-ff="body"]') ? bodyEl.querySelector('[data-ff="body"]').innerHTML : '';
    ok('§10 route diagnostics rendered under Advanced diagnostics', /data-ff-loop="advanced-diagnostics"/.test(html10));
    ok('§10 "Planner route:" label present', /Planner route:/.test(html10));
    ok('§10 "Check route" button present', /data-act="loop-route-check"/.test(html10));
    ok('§10 local-only policy shown', /Local-only policy/.test(html10) || /local only/i.test(html10));
    ok('§10 model (ai-config default) shown', html10.indexOf(AI_CFG.defaultModel) !== -1);
    // source-level: all three fetch sites use _fetchJsonSafe
    var src = fs.readFileSync(path.join(__dirname,'UI_MOdified/client/shell/free-fight-demo.js'),'utf8');
    var safeCount = (src.match(/_fetchJsonSafe\(/g) || []).length;
    ok('§10 _fetchJsonSafe used at >=4 call sites', safeCount >= 4, 'count=' + safeCount);
    ok('§10 no raw r.json() left on plan-coas/test-llm/demo-ai-step path',
        !/free-fight\/(plan-coas|test-llm|demo-ai-step)[\s\S]{0,200}return r\.json\(\)/.test(src));

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();
