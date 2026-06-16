'use strict';
/* ============================================================================
 * test-free-fight-demo-pacing-c.js — RMOOZ-AI-COMMANDER-DEMO-PACING-C
 * ----------------------------------------------------------------------------
 * Proves the demo-pacing change (no battle/scoring/DB-Lite/terrain logic changed):
 *   A) Staff-Safe FAST path (planning_mode=staff_safe + depth=fast + useLlm=false)
 *      makes ZERO LLM calls (neither the COA-generation LLM nor the capability
 *      analyst), yet still returns a deterministic plan + a Staff-Safe trace.
 *   B) AI Commander still CALLS the LLM.
 *   C) The client's _generateCoaPlan shapes the request per mode:
 *      staff_safe → {useLlm:false, ai_depth:'fast'}; commander → {useLlm:true, depth≠'fast'}.
 *   D) The UI timing labels + the mode-aware Generate button text are present.
 *   E) Fallback (AI Commander timeout) stays VISIBLY labelled, not silent.
 *
 * Run: node scripts/test-free-fight-demo-pacing-c.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRV = path.join(__dirname, '..', 'server', 'ai');
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));
const AIP = require(path.join(SRV, 'ai-provider.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
function arr(v) { return Array.isArray(v) ? v : []; }

process.env.RMOOZ_ALLOW_SIM_RUN = '1';   // isolate the staff_safe/fast behaviour from the exec gate
process.env.RMOOZ_FREE_FIGHT_ATTEMPTS = '1';

let llmCalls = 0;
const VALID = [
  { plan_id:'COA-1', title:'Recon', recommended:true, risk:'low', confidence:'low', phases:[{name:'Move',actions:[{unit_uid:'R-1',side:'RED',role:'recon',action_type:'hold',target:{lat:25.30,lon:51.20,type:'coord'},reason:'x',why_unit:'y'}]}], non_selected_units:[], risks:['r'], assumptions:['a'] },
  { plan_id:'COA-2', title:'Screen', recommended:false, risk:'medium', confidence:'low', phases:[{name:'Move',actions:[{unit_uid:'R-2',side:'RED',role:'screen',action_type:'hold',target:{lat:25.33,lon:51.23,type:'coord'},reason:'x',why_unit:'y'}]}], non_selected_units:[], risks:['r'], assumptions:['a'] },
];
AIP.generate = function () { llmCalls++; return Promise.resolve({ ok:true, providerUsed:'ollama', response: JSON.stringify({ coas: VALID }) }); };

const UNITS = [
  { id:'R-1', side:'RED', country:'Qatar', lat:25.30, lon:51.20, platform:'fighter jet' },
  { id:'R-2', side:'RED', country:'Qatar', lat:25.33, lon:51.23, platform:'frigate' },
  { id:'R-3', side:'RED', country:'Qatar', lat:25.36, lon:51.26, platform:'armor' },
  { id:'B-1', side:'BLUE', country:'Bahrain', lat:25.55, lon:51.42, platform:'SAM battery' },
];
const OBJ = [{ lat:25.30, lon:51.20, name:'Objective X' }];

(async function () {
console.log('\n═══ RMOOZ-AI-COMMANDER-DEMO-PACING-C ═══\n');

console.log('A) Staff-Safe FAST path makes ZERO LLM calls');
await atest('staff_safe + depth=fast + useLlm=false → 0 LLM calls, deterministic, trace mode staff_safe', async function () {
  llmCalls = 0;
  const r = await COA.planCoas(UNITS, OBJ, {}, { planning_mode:'staff_safe', ai_depth:'fast', useLlm:false, preferSide:'RED', commander_mode:'free' });
  assert.strictEqual(llmCalls, 0, 'NO LLM call (neither COA-gen nor capability analyst) — got ' + llmCalls);
  assert.ok(/deterministic/.test(String(r.plan_source)), 'deterministic plan (got ' + r.plan_source + ')');
  assert.strictEqual(r.planning_trace.mode, 'staff_safe', 'trace mode = staff_safe');
  assert.ok(arr(r.coas).length >= 1, 'still produced COAs');
});

console.log('\nB) AI Commander still calls the LLM');
await atest('commander + depth=normal + useLlm=true → LLM is called', async function () {
  llmCalls = 0;
  const r = await COA.planCoas(UNITS, OBJ, {}, { planning_mode:'commander', ai_depth:'normal', useLlm:true, preferSide:'RED', commander_mode:'free' });
  assert.ok(llmCalls >= 1, 'the LLM was called at least once (got ' + llmCalls + ')');
  assert.strictEqual(r.planning_trace.mode, 'ai_commander', 'trace mode = ai_commander');
});

console.log('\nC) Client _generateCoaPlan shapes the request per mode (DOM harness, stubbed fetch)');
test('staff_safe → {useLlm:false, ai_depth:fast}; commander → {useLlm:true, depth≠fast}', function () {
  const elById={}; function mk(t){const e={tagName:t,id:'',innerHTML:'',textContent:'',children:[],style:{},appendChild:function(x){this.children.push(x);if(x&&x.id)elById[x.id]=x;return x;},removeChild:function(x){return x;},setAttribute:function(){},removeAttribute:function(){},addEventListener:function(){},querySelector:function(){return null;},querySelectorAll:function(){return[];},getAttribute:function(){return null;}};Object.defineProperty(e,'parentNode',{value:null,writable:true});return e;}
  const captured=[];
  global.document={body:mk('b'),head:mk('h'),createElement:mk,getElementById:function(id){return elById[id]||null;},querySelector:function(){return null;},addEventListener:function(){}};
  global.window={document:global.document,AppShellEventLog:{append:function(){}},sessionStorage:{getItem:function(){return null;},setItem:function(){},removeItem:function(){}},setTimeout:function(){return 0;},clearTimeout:function(){},setInterval:function(){return 0;},clearInterval:function(){},
    fetch:function(url,opts){ try{ captured.push(JSON.parse(opts.body)); }catch(_){} return Promise.resolve({ ok:true, status:200, statusText:'OK', text:function(){ return Promise.resolve(JSON.stringify({ ok:true, plan_source:'deterministic_diverse_coa', coas:[], planning_trace:{mode:'staff_safe'} })); } }); } };
  global.window.window=global.window;
  const C=path.join(__dirname,'..','client','shell');
  require(path.join(C,'world-state-db.js')); require(path.join(C,'symbol-db.js')); require(path.join(C,'symbol-registry.js')); require(path.join(C,'free-fight-demo.js'));
  const DEMO=global.window.RmoozFreeFightDemo;
  // minimal scenario so _buildAiRequestBody has units
  global.window.RmoozScenario={scenario:{red_units:[{id:'R-1',side:'RED',lat:25.3,lon:51.2,coord:[51.2,25.3]}],blue_units_initial:[],obj:{name:'Objective X',coord:[51.2,25.3]}}};
  global.window.__rmoozFreeFightObjective={lat:25.3,lon:51.2};
  DEMO.mount({brief:{operational_brief:{proposed_units:[{id:'R-1',side:'RED',lat:25.3,lon:51.2,platform:'jet'}],objectives:[{label:'Objective X',lat:25.3,lon:51.2}]}}});

  captured.length=0; DEMO._setPlanningModeForTest('staff_safe'); DEMO._generateCoaPlanForTest();
  const ss=captured[0]; assert.ok(ss,'staff_safe request captured');
  assert.strictEqual(ss.opts.useLlm,false,'staff_safe useLlm=false');
  assert.strictEqual(ss.opts.ai_depth,'fast','staff_safe ai_depth=fast');
  assert.strictEqual(ss.opts.planning_mode,'staff_safe','staff_safe planning_mode flows');

  captured.length=0; DEMO._setPlanningModeForTest('commander'); DEMO._setAiDepthForTest('fast'); DEMO._generateCoaPlanForTest();
  const cm=captured[0]; assert.ok(cm,'commander request captured');
  assert.strictEqual(cm.opts.useLlm,true,'commander useLlm=true');
  assert.notStrictEqual(cm.opts.ai_depth,'fast','commander never sends fast (bumped to normal)');
  assert.strictEqual(cm.opts.planning_mode,'commander','commander planning_mode flows');
});

console.log('\nD) UI timing labels + mode-aware Generate button (source)');
test('timing labels + Staff-Safe button text present', function () {
  const src = fs.readFileSync(path.join(__dirname,'..','client','shell','free-fight-demo.js'),'utf8');
  assert.ok(/Full local AI planning — may take 2–5 minutes\./.test(src), 'AI Commander timing label');
  assert.ok(/Fast deterministic planning — AI explanation optional\./.test(src), 'Staff-Safe timing label');
  assert.ok(/Generate Staff-Safe Plan/.test(src), 'mode-aware Staff-Safe button text');
});

console.log('\nE) AI Commander timeout fallback stays visibly labelled');
test('a timeout plan renders the honest Staff-Safe fallback label (not silent)', function () {
  // global.window.RmoozFreeFightDemo is mounted from test C.
  const DEMO = global.window.RmoozFreeFightDemo;
  const plan = { ok:true, _requestedVia:'manual_generate', plan_source:'deterministic_diverse_coa', llm_called:true, llm_status:'timeout', fallback_reason:'local_llm_unavailable: Backend timed out after 300000ms', fallback_message:'Local AI timed out — used Staff-Safe planner. Raise RMOOZ_FREE_FIGHT_TIMEOUT_MS or use a faster model.', allow_sim_run:true, coas:[{plan_id:'COA-1',title:'Defense',recommended:true,phases:[{name:'Move',actions:[{unit_uid:'R-1',side:'RED',role:'hold',action_type:'hold',target:{lat:25.3,lon:51.2}}]}],non_selected_units:[],risks:[],assumptions:[]}], planning_trace:{mode:'staff_safe',input_understood:{total_units:3,role_counts:{},objectives:1},reasoning:[],validation:{valid_coa_count:1}} };
  const html = DEMO._renderCoaPlanHtmlForTest(plan);
  const tmp = global.document.createElement('div'); // not a real DOM; parse via regex on the string instead
  const txt = String(html);
  assert.ok(/timed out/i.test(txt), 'shows the timeout reason');
  assert.ok(/Staff-Safe planner/i.test(txt), 'names the Staff-Safe planner');
  assert.ok(/Staff-Safe Mode/i.test(txt), 'shows the Staff-Safe badge');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
