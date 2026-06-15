'use strict';
/* ============================================================================
 * test-freefight-coa-commander-narrative-a.js — FREEFIGHT-COA-COMMANDER-NARRATIVE-A
 * Static + pure-function checks — no server process required.
 * ========================================================================== */

const fs   = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { console.log('  PASS  ' + label); PASS++; }
    else       { console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); FAIL++; }
}

const PLANNER = require('./UI_MOdified/server/ai/free-fight-coa-planner.js');

// Build a deterministic RED force pool with coords.
function redPool(n) {
    var units = [];
    for (var i = 0; i < n; i++) {
        units.push({ id: 'R-' + String(i + 1).padStart(3, '0'), side: 'RED',
                     lat: 34.5 + i * 0.01, lon: 48.5 + i * 0.01,
                     coord: [48.5 + i * 0.01, 34.5 + i * 0.01] });
    }
    return units;
}
const OBJ = [{ lat: 34.9, lon: 48.9, name: 'Objective X' }];

// ── SECTION 1: new exports exist ─────────────────────────────────────────────
console.log('\n§1  COA planner exports narrative functions');
ok('computeRoleBreakdown exported',       typeof PLANNER.computeRoleBreakdown === 'function');
ok('buildCoaRationale exported',          typeof PLANNER.buildCoaRationale === 'function');
ok('buildExpectedEnemyReaction exported', typeof PLANNER.buildExpectedEnemyReaction === 'function');
ok('buildCommanderAssessment exported',   typeof PLANNER.buildCommanderAssessment === 'function');
ok('enrichCoasWithNarrative exported',    typeof PLANNER.enrichCoasWithNarrative === 'function');

// ── SECTION 2: computeRoleBreakdown counts roles ─────────────────────────────
console.log('\n§2  computeRoleBreakdown counts roles across phases');
const fakeCoa = { phases: [{ actions: [
    { role: 'assault' }, { role: 'assault' }, { role: 'support' }, { role: 'reserve' }, { role: 'reserve' }, { role: 'reserve' },
] }] };
const rb2 = PLANNER.computeRoleBreakdown(fakeCoa);
ok('assault counted', rb2.assault === 2, 'got ' + rb2.assault);
ok('support counted', rb2.support === 1, 'got ' + rb2.support);
ok('reserve counted', rb2.reserve === 3, 'got ' + rb2.reserve);

// ── SECTION 3: planCoas attaches role_breakdown to every COA ─────────────────
console.log('\n§3  planCoas (deterministic) attaches role_breakdown to every COA');
let plan;
(async function () { plan = await PLANNER.planCoas(redPool(16), OBJ, {}, { useLlm: false, preferSide: 'RED' }); })();
// planCoas with useLlm:false resolves synchronously (no awaited I/O) — wait a tick.
function runChecks() {
    ok('plan.ok', plan && plan.ok === true);
    ok('plan has 3 coas', plan && Array.isArray(plan.coas) && plan.coas.length === 3, 'got ' + (plan && plan.coas && plan.coas.length));
    ok('every COA has role_breakdown object',
        plan.coas.every(function (c) { return c.role_breakdown && typeof c.role_breakdown === 'object'; }));

    // §4 rationale
    console.log('\n§4  Every COA has non-empty rationale');
    ok('every COA rationale is non-empty array',
        plan.coas.every(function (c) { return Array.isArray(c.rationale) && c.rationale.length > 0; }));

    // §5 expected_enemy_reaction
    console.log('\n§5  Every COA has non-empty expected_enemy_reaction');
    ok('every COA expected_enemy_reaction non-empty',
        plan.coas.every(function (c) { return Array.isArray(c.expected_enemy_reaction) && c.expected_enemy_reaction.length > 0; }));

    // §6 honesty flag
    console.log('\n§6  expected enemy reaction flagged preview-only (not simulated)');
    ok('every COA has enemy_reaction_preview_only:true',
        plan.coas.every(function (c) { return c.enemy_reaction_preview_only === true; }));

    // §7 commander_assessment
    console.log('\n§7  planCoas returns commander_assessment mentioning force pool');
    ok('commander_assessment is a non-empty string',
        typeof plan.commander_assessment === 'string' && plan.commander_assessment.length > 10);
    ok('commander_assessment mentions force pool count',
        /Force pool:\s*16/.test(plan.commander_assessment), plan.commander_assessment);

    // §8 recommended_plan_id
    console.log('\n§8  recommended_plan_id matches the recommended COA');
    const recCoa = plan.coas.filter(function (c) { return c.recommended; })[0];
    ok('exactly one COA recommended', plan.coas.filter(function (c) { return c.recommended; }).length === 1);
    ok('recommended_plan_id equals recommended COA plan_id',
        recCoa && plan.recommended_plan_id === recCoa.plan_id, plan.recommended_plan_id);

    // §9 source honesty
    console.log('\n§9  commander_assessment is truthful about source');
    ok('deterministic plan_source', plan.plan_source === 'deterministic_coa_fallback');
    ok('assessment says deterministic / review-only',
        /deterministic planner/i.test(plan.commander_assessment) && /review-only/i.test(plan.commander_assessment));
    ok('assessment does NOT claim LLM',
        !/local LLM/i.test(plan.commander_assessment));

    // §10 high-risk rationale mentions exposure
    console.log('\n§10  High-risk COA rationale mentions exposure / risk');
    const highCoa = plan.coas.filter(function (c) { return c.risk === 'high'; })[0];
    ok('a high-risk COA exists', !!highCoa);
    ok('high-risk rationale mentions exposure/risk',
        highCoa && highCoa.rationale.join(' ').toLowerCase().match(/exposure|risk|tempo/) !== null);

    // §11 rationale mentions reserve when reserve units exist
    console.log('\n§11  Rationale mentions reserve/holding when reserve units exist');
    const directCoa = plan.coas.filter(function (c) { return c.plan_id === 'COA-1'; })[0];
    ok('Direct Assault has reserve units', directCoa && directCoa.role_breakdown.reserve > 0);
    ok('Direct Assault rationale mentions reserve/holding',
        directCoa && /reserve|holding/i.test(directCoa.rationale.join(' ')));

    // §12 role_breakdown sums to total actions (no invented/dropped units)
    console.log('\n§12  role_breakdown sums to total actions (no invented units)');
    ok('each COA role_breakdown sum equals its action count',
        plan.coas.every(function (c) {
            var sum = Object.keys(c.role_breakdown).reduce(function (s, k) { return s + c.role_breakdown[k]; }, 0);
            var actions = (c.phases || []).reduce(function (s, ph) { return s + (ph.actions || []).length; }, 0);
            return sum === actions;
        }));

    // §13 assessment with no objective warns
    console.log('\n§13  buildCommanderAssessment warns when no objective set');
    const noObjAssess = PLANNER.buildCommanderAssessment(plan.coas, null, {}, 'deterministic_coa_fallback');
    ok('no-objective assessment warns to define Objective X',
        /define Objective X/i.test(noObjAssess), noObjAssess);

    // §14 recon-only COA expected reaction
    console.log('\n§14  buildExpectedEnemyReaction non-empty for recon-only COA');
    const reconReaction = PLANNER.buildExpectedEnemyReaction(
        { risk: 'low', objective_id: 'Objective X' }, { recon: 2, assault: 0, hold: 5 });
    ok('recon-only reaction non-empty', Array.isArray(reconReaction) && reconReaction.length > 0);
    ok('recon-only reaction mentions conceal/displace',
        /conceal|displace/i.test(reconReaction.join(' ')), reconReaction.join(' '));

    // §15 enrichCoasWithNarrative keeps LLM-supplied rationale
    console.log('\n§15  enrichCoasWithNarrative keeps LLM-supplied rationale (additive)');
    const llmCoa = { plan_id: 'COA-1', title: 'X', risk: 'medium', objective_id: 'Objective X',
                     rationale: ['LLM-authored why bullet'],
                     phases: [{ actions: [{ role: 'assault', unit_uid: 'R-001' }] }] };
    PLANNER.enrichCoasWithNarrative([llmCoa], { name: 'Objective X' }, {}, 'llm');
    ok('LLM rationale preserved', llmCoa.rationale.length === 1 && llmCoa.rationale[0] === 'LLM-authored why bullet');
    ok('role_breakdown still computed for LLM COA', llmCoa.role_breakdown && llmCoa.role_breakdown.assault === 1);

    runClientChecks();
    finish();
}

// ── CLIENT static checks ─────────────────────────────────────────────────────
function runClientChecks() {
    const src = fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

    console.log('\n§16  Client: "Commander AI Assessment" banner');
    ok('Commander AI Assessment string present', /Commander AI Assessment/.test(src));
    ok('assessment banner has data-ff-coa="assessment"', /data-ff-coa="assessment"/.test(src));

    console.log('\n§17  Client: commander-decision block for selected COA');
    ok('commander-decision block present', /data-ff-coa="commander-decision"/.test(src));
    ok('block titled "Commander Decision"', /Commander Decision/.test(src));

    console.log('\n§18  Client reads narrative fields');
    ok('renders commander_assessment',        /_coaPlan\.commander_assessment/.test(src));
    ok('renders recommended_plan_id',         /_coaPlan\.recommended_plan_id/.test(src));
    ok('renders selCoa.rationale (Why)',      /selCoa\.rationale/.test(src) && /Why:/.test(src));
    ok('renders selCoa.expected_enemy_reaction', /selCoa\.expected_enemy_reaction/.test(src));
    ok('renders role_breakdown / roleLine',   /role_breakdown/.test(src) && /roleLine/.test(src));

    console.log('\n§19  Client: enemy reaction labeled preview (honesty)');
    ok('"preview — not yet simulated" label present', /preview — not yet simulated/.test(src));
    ok('"Likely enemy reaction" label present', /Likely enemy reaction/.test(src));

    console.log('\n§20  No counteraction-loop buttons added yet (scope guard)');
    ok('no run-counteraction button', !/data-act="run-counteraction"/.test(src));
    ok('no next-turn button',         !/data-act="next-turn"/.test(src));
    ok('COA buttons unchanged (generate/apply/reset only)',
        /data-act="generate-coa"/.test(src) && /data-act="apply-coa"/.test(src) && /data-act="reset-coa"/.test(src));
}

function finish() {
    console.log('\n' + '─'.repeat(52));
    console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
    if (FAIL > 0) process.exit(1);
}

// planCoas(useLlm:false) has no awaited I/O, but is async — defer checks one tick.
setTimeout(runChecks, 0);
