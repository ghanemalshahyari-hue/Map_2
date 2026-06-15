'use strict';
/* ============================================================================
 * test-rmooz-ai-tool-contract-a.js — RMOOZ-AI-TOOL-CONTRACT-A
 * ----------------------------------------------------------------------------
 * Static, server-free checks for the MCP-style AI tool-contract layer
 * (rmooz-ai-tool-contract.js): envelope shape, determinism, prompt-pack
 * structure, and the schema/safety validator (invented ids, impossible domain
 * roles, kill actions, teleport, repeated COA family) plus the clean-accept and
 * scenario-generic guarantees.
 *
 * Run: node test-rmooz-ai-tool-contract-a.js
 * Prints PASS:/FAIL:/TOTAL: ; exits 1 on any failure.
 * ========================================================================== */

var path = require('path');
var fs = require('fs');

var MODULE_PATH = path.join(__dirname, 'UI_MOdified', 'server', 'ai', 'rmooz-ai-tool-contract.js');
var TC = require(MODULE_PATH);

var pass = 0, fail = 0;
function ok(cond, label) {
    if (cond) { pass++; console.log('PASS: ' + label); }
    else { fail++; console.log('FAIL: ' + label); }
}

// ── Mixed, fully scenario-generic test scenario (arbitrary uids) ──────────────
// One BLUE fighter, BLUE radar, BLUE SAM, BLUE frigate, BLUE infantry; one RED
// su-30 fighter sitting inside the inferred zone near the objective.
var OBJ = { id: 'OBJ-A', name: 'Defended Site', lat: 24.50, lon: 54.50 };
var UNITS = [
    { uid: 'BLU-FTR-1', side: 'BLUE', platform: 'F-15 fighter', lat: 24.55, lon: 54.55, readiness: 0.9, supply: 0.8 },
    { uid: 'BLU-RDR-1', side: 'BLUE', platform: 'P-37 radar',   lat: 24.60, lon: 54.40, readiness: 0.8, supply: 0.9 },
    { uid: 'BLU-SAM-1', side: 'BLUE', platform: 'S-300 SAM battery', lat: 24.52, lon: 54.52, readiness: 0.85, supply: 0.7 },
    { uid: 'BLU-FRG-1', side: 'BLUE', platform: 'frigate', lat: 24.40, lon: 54.70, readiness: 0.7, supply: 0.6 },
    { uid: 'BLU-INF-1', side: 'BLUE', platform: 'infantry', lat: 24.51, lon: 54.49, readiness: 0.6, supply: 0.5 },
    { uid: 'RED-SU30-1', side: 'RED', platform: 'su-30 fighter', lat: 24.53, lon: 54.51, readiness: 0.8, supply: 0.7 },
];
var CONTEXT = { active_side: 'RED', defending_side: 'BLUE', terrain: 'coastal open desert' };
var INPUT = { units: UNITS, objectives: [OBJ], context: CONTEXT };

function envelopeOk(env, name) {
    return env && env.ok === true && env.tool_name === name &&
        env.version === TC.TOOL_CONTRACT_VERSION &&
        typeof env.source === 'string' &&
        ['low', 'medium', 'high'].indexOf(env.confidence) !== -1 &&
        env.review_required === true &&
        env.data && typeof env.data === 'object';
}

(async function run() {
    // ── §1 every tool returns the envelope ────────────────────────────────────
    var oob = TC.getScenarioOobTool(INPUT);
    var cap = await TC.getCapabilityIntelTool(INPUT);
    var terr = TC.getTerrainIntelTool(INPUT);
    var zone = TC.getSovereignZoneIntelTool(INPUT);
    var contact = TC.getContactPictureTool(INPUT);
    var roeEnv = TC.getRoeStateTool(INPUT);
    var prev = TC.getPreviousTurnsTool(INPUT);
    var coa = TC.getCoaFamilyOptionsTool(INPUT);

    ok(envelopeOk(oob, 'getScenarioOobTool'), '§1 getScenarioOobTool envelope');
    ok(envelopeOk(cap, 'getCapabilityIntelTool'), '§1 getCapabilityIntelTool envelope');
    ok(envelopeOk(terr, 'getTerrainIntelTool'), '§1 getTerrainIntelTool envelope');
    ok(envelopeOk(zone, 'getSovereignZoneIntelTool'), '§1 getSovereignZoneIntelTool envelope');
    ok(envelopeOk(contact, 'getContactPictureTool'), '§1 getContactPictureTool envelope');
    ok(envelopeOk(roeEnv, 'getRoeStateTool'), '§1 getRoeStateTool envelope');
    ok(envelopeOk(prev, 'getPreviousTurnsTool'), '§1 getPreviousTurnsTool envelope');
    ok(envelopeOk(coa, 'getCoaFamilyOptionsTool'), '§1 getCoaFamilyOptionsTool envelope');

    // ── §2 determinism (stringify equality) ───────────────────────────────────
    var oob2 = TC.getScenarioOobTool(INPUT);
    ok(JSON.stringify(oob) === JSON.stringify(oob2), '§2 getScenarioOobTool deterministic');

    var coaA = TC.getCoaFamilyOptionsTool(INPUT);
    var coaB = TC.getCoaFamilyOptionsTool(INPUT);
    ok(JSON.stringify(coaA) === JSON.stringify(coaB), '§2 getCoaFamilyOptionsTool deterministic');

    var candidates = [
        { family: 'air_intercept', units: ['BLU-FTR-1'], target: OBJ },
        { family: 'ground_block', units: ['BLU-INF-1'], target: OBJ },
        { family: 'naval_screen', units: ['BLU-FRG-1'], target: OBJ },
    ];
    var scoreA = TC.scoreCoaCandidatesTool(Object.assign({ candidates: candidates }, INPUT));
    var scoreB = TC.scoreCoaCandidatesTool(Object.assign({ candidates: candidates }, INPUT));
    ok(envelopeOk(scoreA, 'scoreCoaCandidatesTool'), '§2 scoreCoaCandidatesTool envelope');
    ok(JSON.stringify(scoreA) === JSON.stringify(scoreB), '§2 scoreCoaCandidatesTool deterministic');

    // ── §3 prompt pack deterministic + has the required fields ────────────────
    var pack1 = await TC.buildCommanderPromptPack(INPUT);
    var pack2 = await TC.buildCommanderPromptPack(INPUT);
    ok(envelopeOk(pack1, 'buildCommanderPromptPack'), '§3 buildCommanderPromptPack envelope');
    ok(JSON.stringify(pack1) === JSON.stringify(pack2), '§3 buildCommanderPromptPack deterministic');
    var pd = pack1.data;
    ok(typeof pd.system_contract === 'string' && pd.system_contract.length > 0, '§3 has system_contract');
    ok(pd.allowed_output_schema && typeof pd.allowed_output_schema === 'object', '§3 has allowed_output_schema');
    ok(Array.isArray(pd.allowed_unit_ids) && pd.allowed_unit_ids.length === 6, '§3 has allowed_unit_ids');
    ok(Array.isArray(pd.allowed_coa_families) && pd.allowed_coa_families.length > 0, '§3 has allowed_coa_families');
    ok(JSON.stringify(pd.blocked_actions) === JSON.stringify(['engage', 'destroy', 'open_fire']), '§3 blocked_actions correct');
    ok(Array.isArray(pd.required_fields) && pd.required_fields.indexOf('selected_coa_family') !== -1, '§3 has required_fields');

    var allowedIds = pd.allowed_unit_ids;
    var allowedFamilies = pd.allowed_coa_families;

    // ── §4 schema enforcement: missing structure + non-allowed family-repeat ──
    var bad1 = TC.validateCommanderCoaTool({ decision: { recommended_coa: 'x' }, units: UNITS, allowed_unit_ids: allowedIds });
    ok(bad1.ok === true && bad1.data.accepted === false &&
        bad1.data.violations.some(function (v) { return v.code === 'missing_required_structure'; }),
        '§4 missing required structure rejected');

    var bad1b = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'BLU-FTR-1', role: 'intercept' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        previous_coa_families: ['air_intercept'],
        allowed_families: ['air_intercept', 'maintain_intercept', 'sensor_tasking'],
    });
    // RMOOZ-AI-COMMANDER-FREEDOM-A: repeated family is NO LONGER rejected — forcing
    // variation is doctrine, not physics. The validator checks structure/physics only.
    ok(bad1b.data.accepted === true &&
        !bad1b.data.violations.some(function (v) { return v.code === 'repeated_coa_family'; }),
        '§4 repeated family is ACCEPTED (doctrine removed)');

    // ── §5 invented unit id ────────────────────────────────────────────────────
    var inv = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'GHOST-1', role: 'intercept' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        allowed_families: allowedFamilies,
    });
    ok(inv.data.accepted === false &&
        inv.data.violations.some(function (v) { return v.code === 'invented_unit_id'; }),
        '§5 invented unit id rejected');

    // ── §6 ground unit + tactical action: ACCEPTED (doctrine not enforced) ──────
    var g = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'cautious_recon', unit_assignments: [{ unit_uid: 'BLU-INF-1', action_type: 'recon' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        allowed_families: allowedFamilies,
    });
    ok(g.data.accepted === true,
        '§6 ground unit assigned a tactical action is ACCEPTED (validator does not judge doctrine)');

    // ── §7 naval unit + ground role: ACCEPTED; but explicit land_move: REJECTED ──
    var nv = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'ground_block', unit_assignments: [{ unit_uid: 'BLU-FRG-1', action_type: 'defend' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        allowed_families: allowedFamilies,
    });
    ok(nv.data.accepted === true,
        '§7 naval unit with a non-land action is ACCEPTED (doctrine removed)');
    var nvLand = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'x', unit_assignments: [{ unit_uid: 'BLU-FRG-1', action_type: 'land_move' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
    });
    ok(nvLand.data.accepted === false &&
        nvLand.data.violations.some(function (v) { return v.code === 'naval_land_move'; }),
        '§7 naval explicit land_move IS rejected (physics kept)');

    // ── §8 aircraft + ground action: ACCEPTED (doctrine removed) ────────────────
    var ac = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'ground_block', unit_assignments: [{ unit_uid: 'BLU-FTR-1', action_type: 'defend' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        allowed_families: allowedFamilies,
    });
    ok(ac.data.accepted === true,
        '§8 aircraft with a ground action is ACCEPTED (doctrine removed)');

    // ── §9 kill/destroy action ─────────────────────────────────────────────────
    var kill = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'BLU-FTR-1', role: 'intercept', action_type: 'destroy' }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        allowed_families: allowedFamilies,
    });
    ok(kill.data.accepted === false &&
        kill.data.violations.some(function (v) { return v.code === 'kill_action_blocked'; }),
        '§9 kill/destroy action rejected');

    // ── §10 teleport (target > 0.15° away) ─────────────────────────────────────
    var tp = TC.validateCommanderCoaTool({
        decision: { selected_coa_family: 'air_intercept', unit_assignments: [{ unit_uid: 'BLU-FTR-1', role: 'intercept', target: { lat: 28.0, lon: 58.0 } }] },
        units: UNITS, allowed_unit_ids: allowedIds,
        allowed_families: allowedFamilies,
    });
    ok(tp.data.accepted === false &&
        tp.data.violations.some(function (v) { return v.code === 'teleport_guard'; }),
        '§10 teleport guard rejected');

    // ── §11 repeated COA family is ACCEPTED (variation is encouraged, not enforced) ─
    var rep = TC.validateCommanderCoaTool({
        decision: {
            selected_coa_family: 'air_intercept',
            unit_assignments: [{ unit_uid: 'BLU-FTR-1', role: 'intercept' }],
        },
        units: UNITS, allowed_unit_ids: allowedIds,
        previous_coa_families: ['air_intercept'],
        allowed_families: ['air_intercept', 'maintain_intercept', 'sensor_tasking'],
    });
    ok(rep.data.accepted === true &&
        !rep.data.violations.some(function (v) { return v.code === 'repeated_coa_family'; }),
        '§11 repeated COA family is ACCEPTED (doctrine removed)');
    ok(rep.data.checks === 'structure_physics_only',
        '§11 validator reports structure/physics-only checks');

    // ── §12 a clean decision → accepted:true ───────────────────────────────────
    var clean = TC.validateCommanderCoaTool({
        decision: {
            commander_decision_id: 'dec-test',
            active_side: 'BLUE',
            selected_coa_family: 'air_intercept',
            recommended_coa: 'intercept the intruder',
            unit_assignments: [
                { unit_uid: 'BLU-FTR-1', role: 'intercept', action_type: 'intercept_posture', target: { lat: 24.54, lon: 54.54 } },
                { unit_uid: 'BLU-RDR-1', role: 'sensor', action_type: 'sensor_tasking' },
            ],
            review_required: true,
        },
        units: UNITS, allowed_unit_ids: allowedIds,
        previous_coa_families: ['naval_screen'],
        allowed_families: allowedFamilies,
    });
    ok(clean.data.accepted === true && clean.data.violations.length === 0,
        '§12 clean decision accepted');

    // ── §13 getCoaFamilyOptionsTool avoid_repeating reflects previous ─────────
    var coaPrev = TC.getCoaFamilyOptionsTool({
        units: UNITS, objectives: [OBJ],
        context: Object.assign({}, CONTEXT, { previous_coa_families: ['air_intercept', 'maintain_intercept'] }),
    });
    ok(JSON.stringify(coaPrev.data.avoid_repeating) === JSON.stringify(['air_intercept', 'maintain_intercept']),
        '§13 avoid_repeating reflects previous_coa_families');
    ok(coaPrev.data.avoid_repeating.indexOf(coaPrev.data.recommended_family) === -1,
        '§13 recommended_family not in avoid_repeating');

    // ── §14 capability tool: best fighter top air_intercept; ground/naval not-rec
    var capTop = (cap.data.best.air_intercept[0] || {}).unit_uid;
    ok(capTop === 'BLU-FTR-1', '§14 best.air_intercept top is the fighter');
    ok(cap.data.not_recommended_for.air_intercept.indexOf('BLU-INF-1') !== -1 &&
        cap.data.not_recommended_for.air_intercept.indexOf('BLU-FRG-1') !== -1,
        '§14 not_recommended_for.air_intercept includes ground + naval units');

    // ── §15 no remote provider: claude env still works via heuristic ───────────
    var savedProvider = process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER;
    var savedFlag = process.env.RMOOZ_FREE_FIGHT_LLM;
    process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER = 'claude';
    process.env.RMOOZ_FREE_FIGHT_LLM = '1';
    var capRemote = null, threw = false;
    try {
        capRemote = await TC.getCapabilityIntelTool(Object.assign({ opts: { useLlm: true } }, INPUT));
    } catch (e) { threw = true; }
    if (savedProvider == null) delete process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER; else process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER = savedProvider;
    if (savedFlag == null) delete process.env.RMOOZ_FREE_FIGHT_LLM; else process.env.RMOOZ_FREE_FIGHT_LLM = savedFlag;
    ok(!threw && capRemote && capRemote.ok === true && capRemote.source !== 'llm_inferred',
        '§15 remote provider blocked → heuristic, no throw, source not llm');

    // ── §16 scenario-generic + disclaimer + no kill verbs in module CODE ───────
    var src = fs.readFileSync(MODULE_PATH, 'utf8');
    // Strip block + line comments so we only inspect executable code.
    var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(!/draft-\d+/i.test(src) && !/attack_objective/i.test(src), '§16 no hardcoded draft/scenario name');
    ok(!/BLU-FTR-1|RED-SU30-1|BLU-INF-1/.test(src), '§16 no hardcoded test uid in module source');
    ok(/review[_ ]?only|review_required/i.test(src), '§16 review-only disclaimer present');
    // No kill/destroy verbs as executable string LITERALS the module emits as actions.
    // The validator references them only inside a regex; assert no kill verb appears
    // as a produced action string (e.g. action_type:'destroy') in code.
    ok(!/action_type\s*[:=]\s*['"](engage|destroy|kill|open_fire)['"]/i.test(code),
        '§16 no kill/destroy action emitted in module code');

    // ── totals ─────────────────────────────────────────────────────────────────
    var total = pass + fail;
    console.log('\nTOTAL: ' + total + '  PASS: ' + pass + '  FAIL: ' + fail);
    if (fail > 0) process.exit(1);
})().catch(function (e) {
    console.log('FAIL: harness threw — ' + (e && e.stack || e));
    console.log('\nTOTAL: ' + (pass + fail + 1) + '  PASS: ' + pass + '  FAIL: ' + (fail + 1));
    process.exit(1);
});
