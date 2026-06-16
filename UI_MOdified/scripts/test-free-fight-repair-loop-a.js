'use strict';
/* ============================================================================
 * test-free-fight-repair-loop-a.js — RMOOZ-AI-COMMANDER-REPAIR-LOOP-A
 * ----------------------------------------------------------------------------
 * Proves the "LLM creates the plan, RMOOZ proves it's real" loop (no real LLM —
 * a stub provider is injected on ai-provider so the path is deterministic):
 *   A) draft uses invalid unit refs → RMOOZ sends a repair prompt → repaired
 *      draft is valid → plan_source='llm', repaired=true, repair_attempts=1.
 *   B) still-invalid after repair → falls to Staff-Safe (deterministic), the
 *      violation trace preserved.
 *   C) planning_mode='staff_safe' skips the LLM entirely (deterministic floor).
 *   D) composeRepairPrompt carries the violations + allowed lists + COA schema.
 *   E) planning_trace shape = REAL role counts + validation checklist + mode,
 *      and carries NO readiness/supply keys (the never-invent rule).
 *   F) client renderPlanningTraceHtml renders Input-understood / AI-reasoning /
 *      Validation + the repaired line + the mode badge; the mode toggle wires
 *      opts.planning_mode.
 *
 * Run: node scripts/test-free-fight-repair-loop-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRV = path.join(__dirname, '..', 'server', 'ai');
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));
const CONTRACT = require(path.join(SRV, 'rmooz-ai-tool-contract.js'));
const AIP = require(path.join(SRV, 'ai-provider.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── stub provider: returns COA JSON keyed on whether the prompt is a draft or a repair ──
process.env.RMOOZ_ALLOW_SIM_RUN = '1';
process.env.RMOOZ_FREE_FIGHT_ATTEMPTS = '1';   // one inner draft attempt → clean call counting
const VALID_COAS = [
  { plan_id:'COA-1', title:'Recon', recommended:true, risk:'low', confidence:'low',
    phases:[{phase_id:'p1', name:'Move', actions:[{unit_uid:'R-1', side:'RED', role:'recon', action_type:'hold', target:{lat:24.70,lon:54.80,type:'coord'}, reason:'hold near', why_unit:'nearest'}]}],
    non_selected_units:[{unit_uid:'R-3', reason:'held in reserve'}], risks:['r'], assumptions:['a'] },
  { plan_id:'COA-2', title:'Screen', recommended:false, risk:'medium', confidence:'low',
    phases:[{phase_id:'p1', name:'Move', actions:[{unit_uid:'R-2', side:'RED', role:'screen', action_type:'hold', target:{lat:24.73,lon:54.83,type:'coord'}, reason:'screen', why_unit:'flank'}]}],
    non_selected_units:[], risks:['r'], assumptions:['a'] },
];
const INVALID_COAS = [
  { plan_id:'COA-1', title:'Bad', recommended:true, risk:'high', phases:[{name:'Move', actions:[{unit_uid:'BOGUS-9', side:'RED', role:'assault', action_type:'attack', target:{lat:24.7,lon:54.8,type:'coord'}, reason:'x'}]}], non_selected_units:[], risks:[], assumptions:[] },
  { plan_id:'COA-2', title:'Bad2', recommended:false, risk:'high', phases:[{name:'Move', actions:[{unit_uid:'BOGUS-8', side:'RED', role:'assault', action_type:'attack', target:{lat:24.7,lon:54.8,type:'coord'}, reason:'x'}]}], non_selected_units:[], risks:[], assumptions:[] },
];
const STUB = { draft: INVALID_COAS, repair: VALID_COAS };
const counters = { draft: 0, repair: 0 };
AIP.generate = function (args) {
  const p = String(args.prompt || ''), sys = String(args.system || '');
  if (/validator_rejections|REJECTED by the staff validator/.test(p + sys)) { counters.repair++; return Promise.resolve({ ok:true, providerUsed:'ollama', response: JSON.stringify({ coas: STUB.repair }) }); }
  if (/coa_requirement/.test(p)) { counters.draft++; return Promise.resolve({ ok:true, providerUsed:'ollama', response: JSON.stringify({ coas: STUB.draft }) }); }
  return Promise.resolve({ ok:false, error:'stub-no-capability-llm' }); // capability analyst → heuristic fallback
};
const UNITS = [
  {id:'R-1', side:'RED', lat:24.70, lon:54.80, platform:'fighter jet'},
  {id:'R-2', side:'RED', lat:24.73, lon:54.83, platform:'frigate'},
  {id:'R-3', side:'RED', lat:24.76, lon:54.86, platform:'tank'},
  {id:'B-1', side:'BLUE', lat:24.40, lon:54.40, platform:'SAM battery'},
  {id:'B-2', side:'BLUE', lat:24.42, lon:54.42, platform:'radar'},
];
const OBJ = [{ lat:24.45, lon:54.35, name:'Objective X' }];
function planOpts(extra) { return Object.assign({ useLlm:true, ai_depth:'normal', preferSide:'RED', commander_mode:'free', allowed_unit_ids:['R-1','R-2','R-3'] }, extra || {}); }

(async function () {
console.log('\n═══ RMOOZ-AI-COMMANDER-REPAIR-LOOP-A ═══\n');

let repairedResult = null;

console.log('A) repair loop — invalid draft → repair → valid');
await atest('draft invalid → repaired → plan_source=llm, repaired=true, repair_attempts=1', async function () {
  STUB.draft = INVALID_COAS; STUB.repair = VALID_COAS; counters.draft = 0; counters.repair = 0;
  const r = await COA.planCoas(UNITS, OBJ, {}, planOpts());
  repairedResult = r;
  assert.strictEqual(r.plan_source, 'llm', 'plan_source should be llm after a successful repair');
  assert.strictEqual(r.repaired, true, 'repaired flag');
  assert.strictEqual(r.repair_attempts, 1, 'one repair attempt');
  assert.strictEqual(r.llm_status, 'ok');
  assert.ok(counters.repair >= 1, 'a repair prompt was sent to the model');
  assert.strictEqual(r.tool_contract && r.tool_contract.repaired, true, 'tool_contract.repaired');
  assert.ok(arr(r.repaired_violations).length >= 1, 'the fixed violations are recorded');
});

console.log('\nB) still invalid after repair → Staff-Safe fallback (violations preserved)');
await atest('repair also invalid → deterministic, fallback_reason preserved', async function () {
  STUB.draft = INVALID_COAS; STUB.repair = INVALID_COAS; counters.draft = 0; counters.repair = 0;
  const r = await COA.planCoas(UNITS, OBJ, {}, planOpts());
  assert.ok(/deterministic/.test(String(r.plan_source)), 'falls back to a deterministic plan');
  assert.ok(counters.repair >= 1, 'a repair was attempted before falling back');
  assert.ok(r.fallback_reason, 'fallback_reason is set');
  assert.strictEqual(r.repaired, false, 'not marked repaired when repair failed');
  assert.strictEqual(r.planning_trace.mode, 'staff_safe', 'trace mode = staff_safe on fallback');
});

console.log('\nC) planning_mode=staff_safe skips the LLM');
await atest('staff_safe mode → no draft/repair calls, deterministic plan', async function () {
  STUB.draft = INVALID_COAS; STUB.repair = VALID_COAS; counters.draft = 0; counters.repair = 0;
  const r = await COA.planCoas(UNITS, OBJ, {}, planOpts({ planning_mode:'staff_safe' }));
  assert.ok(/deterministic/.test(String(r.plan_source)), 'deterministic plan');
  assert.strictEqual(counters.draft, 0, 'the LLM draft was NOT called');
  assert.strictEqual(counters.repair, 0, 'no repair call');
  assert.strictEqual(r.planning_trace.mode, 'staff_safe');
});

console.log('\nD) composeRepairPrompt carries violations + allowed list + schema');
test('repair prompt is well-formed', function () {
  const rp = CONTRACT.composeRepairPrompt({
    previous_coas: INVALID_COAS,
    violations: [{ code:'invented_unit_id', unit_uid:'BOGUS-9', text:'BOGUS-9 is not in allowed_unit_ids' }],
    allowed_unit_ids: ['R-1','R-2','R-3'], allowed_actions: ['hold','flank','recon'],
    objective: { lat:24.45, lon:54.35 }, active_side: 'RED',
  });
  assert.ok(rp.system && rp.prompt, 'has system + prompt');
  assert.ok(/repair/i.test(rp.version), 'version marked /repair');
  assert.ok(/invented_unit_id/.test(rp.prompt), 'carries the violation code');
  assert.ok(/R-1/.test(rp.prompt) && /R-2/.test(rp.prompt), 'carries the allowed unit IDs');
  assert.ok(/"coas"/.test(rp.prompt), 'requests the coas JSON shape');
  assert.ok(/engage|destroy|open_fire/i.test(rp.system + rp.prompt), 'reiterates the no-kill rule');
});

console.log('\nE) planning_trace shape — real data only (no readiness/supply)');
test('trace has real role counts + validation checklist + mode; no readiness/supply', function () {
  const t = repairedResult && repairedResult.planning_trace;
  assert.ok(t, 'planning_trace present');
  assert.strictEqual(t.mode, 'ai_commander');
  const iu = t.input_understood;
  assert.ok(iu && iu.role_counts && typeof iu.role_counts.maneuver === 'number', 'role_counts present');
  assert.ok(iu.total_units >= 1, 'total_units counted');
  assert.ok(iu.enemy_assessment && iu.enemy_assessment.total >= 1, 'enemy assessment (BLUE) counted');
  assert.strictEqual(t.validation.repaired, true, 'validation.repaired reflects the repair');
  assert.ok(t.validation.valid_coa_count >= 2, 'valid_coa_count');
  const blob = JSON.stringify(t).toLowerCase();
  assert.ok(blob.indexOf('readiness') === -1, 'NO readiness key (never-invent)');
  assert.ok(blob.indexOf('supply') === -1, 'NO supply key (never-invent)');
});

console.log('\nF) client — planning-trace render + mode toggle (DOM harness)');
test('renderPlanningTraceHtml + mode toggle wiring', function () {
  const elById = {};
  function makeEl(t) {
    const el = { tagName:t, id:'', className:'', innerHTML:'', textContent:'', children:[], style:{},
      appendChild:function(e){ this.children.push(e); if(e&&e.id) elById[e.id]=e; return e; },
      removeChild:function(e){ var i=this.children.indexOf(e); if(i>=0) this.children.splice(i,1); return e; },
      setAttribute:function(){}, removeAttribute:function(){}, addEventListener:function(){},
      querySelector:function(){ return null; }, querySelectorAll:function(){ return []; }, getAttribute:function(){ return null; } };
    Object.defineProperty(el, 'parentNode', { value:null, writable:true });
    return el;
  }
  global.document = { body:makeEl('body'), head:makeEl('head'), createElement:makeEl, getElementById:function(id){ return elById[id]||null; }, querySelector:function(){ return null; }, addEventListener:function(){} };
  global.window = { document:global.document, AppShellEventLog:{ append:function(){} },
    sessionStorage:(function(){ var d={}; return { getItem:function(k){return d[k]||null;}, setItem:function(k,v){d[k]=String(v);}, removeItem:function(k){delete d[k];} }; })(),
    setTimeout:function(){return 0;}, clearTimeout:function(){}, setInterval:function(){return 0;}, clearInterval:function(){},
    fetch:function(){ return Promise.reject(new Error('no fetch in render test')); } };
  global.window.window = global.window;
  const C = path.join(__dirname, '..', 'client', 'shell');
  require(path.join(C, 'world-state-db.js'));
  require(path.join(C, 'symbol-db.js'));
  require(path.join(C, 'symbol-registry.js'));
  require(path.join(C, 'free-fight-demo.js'));
  const DEMO = global.window.RmoozFreeFightDemo;
  assert.ok(DEMO && typeof DEMO._renderPlanningTraceHtmlForTest === 'function', 'render hook present');

  const html = DEMO._renderPlanningTraceHtmlForTest(repairedResult);
  assert.ok(/AI Commander Mode/.test(html), 'AI Commander mode badge');
  assert.ok(/Input understood/.test(html), 'Input-understood section');
  assert.ok(/AI reasoning/.test(html), 'AI-reasoning section');
  assert.ok(/Validation/.test(html), 'Validation section');
  assert.ok(/units analyzed/.test(html), 'units-analyzed line');
  assert.ok(/Repaired/.test(html), 'shows the repaired line');
  assert.ok(/data-ff-mode="ai_commander"/.test(html), 'mode data attribute');

  // mode toggle wiring → opts.planning_mode
  DEMO._setPlanningModeForTest('staff_safe');
  assert.strictEqual(DEMO._getPlanningModeForTest(), 'staff_safe');
  const body = DEMO._buildAiRequestBodyForTest2();
  assert.strictEqual(body.opts.planning_mode, 'staff_safe', 'planning_mode flows into the request opts');
  DEMO._setPlanningModeForTest('commander');
  assert.strictEqual(DEMO._buildAiRequestBodyForTest2().opts.planning_mode, 'commander');

  // Staff-Safe deterministic plan renders its (amber) badge, not the AI-only "no result" gate.
  const staffHtml = DEMO._renderPlanningTraceHtmlForTest({ planning_trace: { mode:'staff_safe', input_understood:{ total_units:5, role_counts:{}, objectives:1 }, reasoning:[], validation:{ valid_coa_count:3 } } });
  assert.ok(/Staff-Safe Mode/.test(staffHtml), 'Staff-Safe badge renders');
});

test('app.html includes the repair-loop client + toggle buttons exist in source', function () {
  const demoSrc = fs.readFileSync(path.join(__dirname, '..', 'client', 'shell', 'free-fight-demo.js'), 'utf8');
  // Buttons are built by concatenation ('planmode-' + pm[0]); assert the real source tokens.
  assert.ok(/planmode-/.test(demoSrc) && /AI Commander/.test(demoSrc) && /Staff-Safe/.test(demoSrc), 'planning-mode toggle present');
  assert.ok(/bind\('planmode-'/.test(demoSrc), 'planning-mode buttons are bound');
  assert.ok(/renderPlanningTraceHtml/.test(demoSrc), 'trace renderer present');
  const html = fs.readFileSync(path.join(__dirname, '..', 'client', 'app.html'), 'utf8');
  assert.ok(/free-fight-demo\.js\?v=repair-loop-a/.test(html), 'cache-buster bumped');
});

function arr(v) { return Array.isArray(v) ? v : []; }

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
