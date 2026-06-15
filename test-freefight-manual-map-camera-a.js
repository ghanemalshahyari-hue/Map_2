#!/usr/bin/env node
/*
 * FREEFIGHT-MANUAL-MAP-CAMERA-A
 * The AI may move units, but the map camera must stay where the operator left it.
 * No automatic panTo / flyTo / fitBounds / setView / zoom on AI movement — unless
 * the operator explicitly switches the camera to Follow AI.
 *
 *  §1  Default camera mode is 'manual'
 *  §2  COA apply moves units but does NOT call map.panTo by default
 *  §3  Continuous-loop turn moves units but does NOT pan by default
 *  §4  Single-unit AI apply does NOT pan by default
 *  §5  Trails / pulse still created during AI movement (manual camera)
 *  §6  Event log + turn log still record movement (manual camera)
 *  §7  No flyTo / fitBounds / setView / setZoom EVER called during AI movement
 *  §8  Follow mode: COA apply DOES pan to the moved centroid
 *  §9  Follow mode: single-unit apply DOES pan to the new position
 * §10  Switching back to manual stops the camera moving again
 * §11  Source: only guarded helpers touch the camera (no raw map.panTo at call sites)
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

// ── DOM/map harness (camera calls are SPIED) ─────────────────────────────────
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

// Camera spies — ANY of these being called during AI movement is a violation in manual mode.
var _cam = { panTo:0, flyTo:0, fitBounds:0, setView:0, setZoom:0, lastPanTo:null };
function resetCam(){ _cam = { panTo:0, flyTo:0, fitBounds:0, setView:0, setZoom:0, lastPanTo:null }; }

var _eventLog = [], _timeouts = [], _intervals = [];
var __fetchHandler = function () { return Promise.resolve({ ok:true, status:200, text:function(){return Promise.resolve('{}');}, json:function(){return Promise.resolve({});} }); };

global.window = {
    innerWidth:1280, innerHeight:800,
    document:{ body:bodyEl, head:makeEl('head'), createElement:function(t){return makeEl(t);}, getElementById:function(id){return elById[id]||null;}, dispatchEvent:function(){}, addEventListener:function(){} },
    addEventListener:function(){}, removeEventListener:function(){}, dispatchEvent:function(){},
    RmoozScenario:null,
    // Mirror the REAL adjudicator-map: drawScenario auto-fits the camera on redraw,
    // UNLESS window.__rmoozSuppressAutoFit is set (the contract free-fight relies on).
    AppAdjudicatorMap:{ drawScenario:function(){ if (!global.window.__rmoozSuppressAutoFit) { try { global.window.map.fitBounds([[0,0],[1,1]]); } catch (_) {} } } },
    AppShellEventLog:{ append:function(e){ _eventLog.push(e); } },
    setTimeout:function(fn,ms){var id={fn:fn,ms:ms};_timeouts.push(id);return id;},
    clearTimeout:function(id){_timeouts=_timeouts.filter(function(x){return x!==id;});},
    setInterval:function(fn,ms){var id={fn:fn,ms:ms};_intervals.push(id);return id;},
    clearInterval:function(id){_intervals=_intervals.filter(function(x){return x!==id;});},
    fetch:function(url,opts){ return __fetchHandler(url,opts); },
};
var _markers=[], _polylines=[];
var stub = { addTo:function(){return this;}, on:function(){return this;}, bindPopup:function(){return this;} };
global.window.L = {
    layerGroup:function(){return {addTo:function(){return this;},clearLayers:function(){_markers=[];_polylines=[];},addLayer:function(m){ if(m&&m._isPolyline)_polylines.push(m); else _markers.push(m); return this;}};},
    marker:function(ll,o){return Object.assign({},stub,{_ll:ll,_opts:o||{}});},
    divIcon:function(o){return {_opts:o};},
    circleMarker:function(ll,o){return Object.assign({},stub,{_ll:ll,_opts:o||{},_isCircleMarker:true});},
    polyline:function(lls,o){return Object.assign({},stub,{_lls:lls,_opts:o||{},_isPolyline:true});},
};
global.window.map = {
    hasLayer:function(){return false;}, removeLayer:function(){}, addLayer:function(){}, on:function(){}, off:function(){},
    panTo:function(ll){ _cam.panTo++; _cam.lastPanTo = ll; },
    flyTo:function(){ _cam.flyTo++; },
    fitBounds:function(){ _cam.fitBounds++; },
    setView:function(){ _cam.setView++; },
    setZoom:function(){ _cam.setZoom++; },
};
global.window.RmoozDemoUnits = { buildGroupsFromAnchors:function(){return [];} };
global.window.RmoozFreeFightAI = null;

var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var PAYLOAD = { brief:{ operational_brief:{ proposed_units:[], objectives:[{label:'Objective X',lat:34.9,lon:48.9}], placement_candidates:[{type:'base',lat:34.5,lon:48.5,name:'AB'}] } } };
function mkUnits(n, side){ var u=[]; for(var i=0;i<n;i++){var lat=34.5+i*0.012,lon=48.5+i*0.012;u.push({uid:side[0]+'-'+String(i+1).padStart(3,'0'),side:side,lat:lat,lon:lon,coord:[lon,lat]});} return u; }
function freshMount(){
    elById={}; bodyEl.children=[]; sessionStorage._data={}; _eventLog=[]; _timeouts=[]; _intervals=[]; _markers=[]; _polylines=[]; resetCam();
    global.window.RmoozScenario = { scenario:{ red_units:mkUnits(10,'RED'), blue_units_initial:mkUnits(6,'BLUE'), obj:{name:'Objective X',coord:[48.9,34.9]} } };
    __fetchHandler = function(){ return Promise.resolve({ ok:true, status:200, text:function(){return Promise.resolve(JSON.stringify({ok:true}));}, json:function(){return Promise.resolve({ok:true});} }); };
    DEMO._resetWinStateForTest(); DEMO.clear(); DEMO.mount(PAYLOAD);
    resetCam(); // ignore any camera calls during mount
}
function realPlan(side){ var b=DEMO._buildLoopRequestBodyForTest(); return PLANNER.planCoas(b.units,b.objectives,{active_side:side||'RED'},{preferSide:side||'RED',useLlm:false,allowed_unit_ids:b.units.map(function(u){return u.id;})}); }
function noCameraMoved(){ return _cam.panTo===0 && _cam.flyTo===0 && _cam.fitBounds===0 && _cam.setView===0 && _cam.setZoom===0; }
function injectUnitDecision(uid, lat, lon){
    DEMO._setAiDecisionForTest({ ok:true, scenario_patch:{ unit_uid:uid, lat:lat, lon:lon },
        action:{ action_type:'MOVE_TOWARD_OBJECTIVE', unit_uid:uid, side:'RED', reason:'t', confidence:'high', risk:'low' },
        event_log_entry:'FF-AI: '+uid+' moved', final_decision_source:'deterministic_demo_ai', llm_called:false, llm_status:'disabled' });
}

(async function main(){
    // ── §1 default manual ────────────────────────────────────────────────────
    console.log('\n§1  Default camera mode is manual');
    freshMount();
    ok('§1 default mode === manual', DEMO._getCameraModeForTest() === 'manual');

    // ── §2 COA apply does not pan ────────────────────────────────────────────
    console.log('\n§2  COA apply moves units but does NOT pan by default');
    freshMount();
    var plan2 = await realPlan('RED');
    DEMO._setCoaPlanForTest(plan2, false, DEMO._pickRecommendedIdxForTest(plan2));
    resetCam();
    DEMO._applySelectedCoaForTest();
    ok('§2 units moved', DEMO._getCoaMovedUnitsForTest().length > 0, 'moved=' + DEMO._getCoaMovedUnitsForTest().length);
    ok('§2 no panTo', _cam.panTo === 0);
    ok('§2 no camera movement at all', noCameraMoved());

    // ── §3 loop turn does not pan ────────────────────────────────────────────
    console.log('\n§3  Continuous-loop turn moves units but does NOT pan by default');
    freshMount();
    var plan3 = await realPlan('RED');
    resetCam();
    DEMO._runTurnCoreForTest(plan3, 0); // instant apply path
    ok('§3 turn applied', DEMO._getLoopStateForTest().turn === 1);
    ok('§3 units moved this turn', DEMO._getCoaMovedUnitsForTest().length > 0);
    ok('§3 no panTo on loop turn', _cam.panTo === 0);
    ok('§3 no camera movement at all', noCameraMoved());

    // ── §4 single-unit apply does not pan ────────────────────────────────────
    console.log('\n§4  Single-unit AI apply does NOT pan by default');
    freshMount();
    injectUnitDecision('R-003', 34.80, 48.80);
    resetCam();
    DEMO._applyAiDecisionForTest();
    ok('§4 no panTo on single-unit apply', _cam.panTo === 0);
    ok('§4 no camera movement at all', noCameraMoved());

    // ── §5 trails/pulse still created ────────────────────────────────────────
    console.log('\n§5  Trails / pulse still created during AI movement (manual camera)');
    freshMount();
    var plan5 = await realPlan('RED');
    DEMO._setCoaPlanForTest(plan5, false, DEMO._pickRecommendedIdxForTest(plan5));
    _markers=[]; _polylines=[]; resetCam();
    DEMO._applySelectedCoaForTest();
    ok('§5 polyline trails created', _polylines.length > 0, 'trails=' + _polylines.length);
    ok('§5 pulse circle markers created', _markers.some(function(m){return m._isCircleMarker;}));
    ok('§5 still no camera movement', noCameraMoved());

    // ── §6 logs still update ─────────────────────────────────────────────────
    console.log('\n§6  Event log + turn log still record movement (manual camera)');
    freshMount();
    var plan6 = await realPlan('RED');
    _eventLog = []; resetCam();
    DEMO._runTurnCoreForTest(plan6, 0);
    ok('§6 event log recorded a turn', _eventLog.some(function(e){return /AI Commander Turn/.test(e.message||'');}));
    ok('§6 turn log has an entry', DEMO._getTurnLogForTest().length === 1);
    ok('§6 still no camera movement', noCameraMoved());

    // ── §7 no flyTo/fitBounds/setView/setZoom ever ───────────────────────────
    console.log('\n§7  No flyTo / fitBounds / setView / setZoom during AI movement');
    freshMount();
    var plan7 = await realPlan('RED');
    DEMO._setCoaPlanForTest(plan7, false, DEMO._pickRecommendedIdxForTest(plan7));
    resetCam();
    DEMO._applySelectedCoaForTest();
    DEMO._runTurnCoreForTest(await realPlan('RED'), 0);
    injectUnitDecision('R-004', 34.7, 48.7); DEMO._applyAiDecisionForTest();
    ok('§7 flyTo never called', _cam.flyTo === 0);
    ok('§7 fitBounds never called', _cam.fitBounds === 0);
    ok('§7 setView never called', _cam.setView === 0);
    ok('§7 setZoom never called', _cam.setZoom === 0);

    // ── §8 follow mode: COA apply pans ───────────────────────────────────────
    console.log('\n§8  Follow mode: COA apply DOES pan to the moved centroid');
    freshMount();
    DEMO._setCameraModeForTest('follow');
    ok('§8 mode is follow', DEMO._getCameraModeForTest() === 'follow');
    var plan8 = await realPlan('RED');
    DEMO._setCoaPlanForTest(plan8, false, DEMO._pickRecommendedIdxForTest(plan8));
    resetCam();
    DEMO._applySelectedCoaForTest();
    ok('§8 panTo called in follow mode', _cam.panTo > 0);
    ok('§8 still no fitBounds/flyTo/setView', _cam.fitBounds === 0 && _cam.flyTo === 0 && _cam.setView === 0);

    // ── §9 follow mode: single-unit apply pans ───────────────────────────────
    console.log('\n§9  Follow mode: single-unit apply DOES pan to the new position');
    freshMount();
    DEMO._setCameraModeForTest('follow');
    injectUnitDecision('R-002', 34.95, 48.95);
    resetCam();
    DEMO._applyAiDecisionForTest();
    ok('§9 panTo called in follow mode', _cam.panTo > 0);
    ok('§9 panned to the new position', _cam.lastPanTo && Math.abs(_cam.lastPanTo[0] - 34.95) < 0.01);

    // ── §10 back to manual stops camera ──────────────────────────────────────
    console.log('\n§10  Switching back to manual stops the camera moving again');
    DEMO._setCameraModeForTest('manual');
    var plan10 = await realPlan('RED');
    DEMO._setCoaPlanForTest(plan10, false, DEMO._pickRecommendedIdxForTest(plan10));
    resetCam();
    DEMO._applySelectedCoaForTest();
    ok('§10 mode back to manual', DEMO._getCameraModeForTest() === 'manual');
    ok('§10 no camera movement after switching back', noCameraMoved());

    // ── §11 source guard ─────────────────────────────────────────────────────
    console.log('\n§11  Source: only guarded helpers touch the camera');
    var src = fs.readFileSync(path.join(__dirname,'UI_MOdified/client/shell/free-fight-demo.js'),'utf8');
    ok('§11 no flyTo in client', !/\.flyTo\(/.test(src));
    ok('§11 no fitBounds in client', !/\.fitBounds\(/.test(src));
    ok('§11 no setView in client', !/\.setView\(/.test(src));
    ok('§11 default mode literal is manual', /_freeFightCameraMode\s*=\s*'manual'/.test(src));
    ok('§11 _maybeFollowAiMovement guards on follow mode', /_maybeFollowAiMovement[\s\S]{0,120}_freeFightCameraMode !== 'follow'/.test(src));
    // The only raw map.panTo must live inside the guarded helper (one occurrence).
    var panToCount = (src.match(/\.map\.panTo\(|W\(\)\.map\.panTo\(/g) || []).length;
    ok('§11 exactly one raw map.panTo (inside the guard)', panToCount === 1, 'count=' + panToCount);
    ok('§11 old _panToMovedCentroid name removed', !/function _panToMovedCentroid\b/.test(src));
    ok('§11 Camera toggle UI present (dynamic buttons + bindings)',
        /data-act="camera-' \+ m\[0\]/.test(src) && /bind\('camera-manual'/.test(src) && /bind\('camera-follow'/.test(src));
    // Runtime proof: the toggle renders in the panel body
    var html11 = bodyEl.querySelector('[data-ff="body"]') ? bodyEl.querySelector('[data-ff="body"]').innerHTML : '';
    ok('§11 Camera control rendered with Manual + Follow AI', /data-ff-loop="camera"/.test(html11) && /Manual/.test(html11) && /Follow AI/.test(html11));

    // ── §12 redraw auto-fit is suppressed during AI movement ─────────────────
    console.log('\n§12  drawScenario auto-fitBounds is suppressed during AI redraws');
    freshMount();
    var plan12 = await realPlan('RED');
    DEMO._setCoaPlanForTest(plan12, false, DEMO._pickRecommendedIdxForTest(plan12));
    resetCam();
    DEMO._applySelectedCoaForTest(); // calls _triggerScenarioRedraw → mock drawScenario tries to fitBounds
    ok('§12 drawScenario did NOT fitBounds (suppressed by free-fight)', _cam.fitBounds === 0, 'fitBounds=' + _cam.fitBounds);
    ok('§12 no camera movement of any kind', noCameraMoved());
    // And the suppression flag is restored to its prior value after the redraw (not left on).
    ok('§12 suppress flag restored after redraw', !global.window.__rmoozSuppressAutoFit);
    // Sanity: when the flag is NOT set, the mock WOULD fit (proves the test can detect a fit).
    resetCam();
    try { global.window.AppAdjudicatorMap.drawScenario({}); } catch (_) {}
    ok('§12 control: unsuppressed drawScenario does fit (test is sensitive)', _cam.fitBounds === 1);

    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
})();
