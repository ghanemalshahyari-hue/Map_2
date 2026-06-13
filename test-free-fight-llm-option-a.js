#!/usr/bin/env node
'use strict';

const assert = require('assert');

const llm = require('./UI_MOdified/server/ai/free-fight-llm-plan.js');
global.RmoozFreeFightAI = require('./UI_MOdified/client/shell/free-fight-ai.js');
global.RmoozDemoUnits = {
    buildGroupsFromAnchors: () => [
        { id: 'red-1', side: 'RED', country: 'RED', country_key: 'red', base_name_en: 'Red Base', category_counts: { air_attack: 2 }, total: 2, member_ids: ['r1'], anchor: { lat: 25.0, lon: 52.0 } },
        { id: 'red-2', side: 'RED', country: 'RED', country_key: 'red', base_name_en: 'Red Forward', category_counts: { uav: 1 }, total: 1, member_ids: ['r2'], anchor: { lat: 25.4, lon: 52.3 } },
        { id: 'blue-1', side: 'BLUE', country: 'BLUE', country_key: 'blue', base_name_en: 'Blue Base', category_counts: { air_defense: 2 }, total: 2, member_ids: ['b1'], anchor: { lat: 26.4, lon: 53.4 } },
        { id: 'blue-2', side: 'BLUE', country: 'BLUE', country_key: 'blue', base_name_en: 'Blue Screen', category_counts: { naval_surface: 1 }, total: 1, member_ids: ['b2'], anchor: { lat: 26.1, lon: 53.2 } },
    ],
};

const demo = require('./UI_MOdified/client/shell/free-fight-demo.js');

function payload() { return { brief: { operational_brief: {} } }; }
function resetHarness() {
    demo.clear();
    demo.init(payload());
    demo.setObjective({ lat: 26.0, lon: 53.0 });
}
function validPlan() {
    return {
        ok: true,
        planner: 'llm_advisory',
        red_attack_plan: [
            { demo_group_id: 'red-2', reason: 'Closest available review group.', route_summary: 'Advisory route from anchor toward Objective X.', confidence: 'medium', warnings: [] },
        ],
        blue_reaction_plan: [
            { demo_group_id: 'blue-1', reaction_type: 'intercept', intercept_or_defend_location: { lat: 26.08, lon: 53.08 }, reason: 'Best positioned defender.', route_summary: 'Advisory defensive movement toward standoff point.', confidence: 'medium', warnings: [] },
        ],
        warnings: [],
        missing_information: [],
        confidence: 'medium',
    };
}
function clientValidResponse() {
    return Object.assign(llm.validateAndSanitize(validPlan(), global.RmoozDemoUnits.buildGroupsFromAnchors()), {
        provider_used: 'mock',
    });
}
async function maybeAwait(v) {
    if (v && typeof v.then === 'function') return v;
    return v;
}

(async function run() {
    const groups = global.RmoozDemoUnits.buildGroupsFromAnchors();

    const accepted = llm.validateAndSanitize(validPlan(), groups);
    assert.equal(accepted.ok, true, 'valid mocked LLM advisory plan is accepted');
    assert.equal(accepted.red_attack_plan[0].demo_group_id, 'red-2');

    const badId = llm.validateAndSanitize(Object.assign(validPlan(), {
        red_attack_plan: [{ demo_group_id: 'missing', reason: 'Review.', route_summary: 'Review.', confidence: 'low', warnings: [] }],
    }), groups);
    assert.equal(badId.ok, false, 'invalid group id falls back/rejects');

    resetHarness();
    demo.setPlannerMode('deterministic');
    let st = demo.start();
    assert.equal(st.running, true, 'deterministic mode works with no LLM env');
    assert.equal(st.planner, 'deterministic');

    resetHarness();
    demo.setPlannerMode('llm');
    global.fetch = async () => ({ json: async () => ({ ok: false, reason: 'llm_disabled' }) });
    st = await maybeAwait(demo.start());
    assert.equal(st.running, true, 'LLM disabled fallback still starts movement');
    assert.equal(st.planner, 'deterministic');
    assert.equal(st.fallback_reason, 'llm_disabled');

    resetHarness();
    demo.setPlannerMode('llm');
    global.fetch = async () => { const e = new Error('timeout'); e.name = 'AbortError'; throw e; };
    st = await maybeAwait(demo.start());
    assert.equal(st.running, true, 'LLM timeout falls back');
    assert.equal(st.fallback_reason, 'timeout');

    resetHarness();
    demo.setPlannerMode('llm');
    global.fetch = async () => ({ json: async () => { throw new SyntaxError('bad json'); } });
    st = await maybeAwait(demo.start());
    assert.equal(st.running, true, 'invalid LLM JSON falls back');
    assert.equal(st.planner, 'deterministic');

    resetHarness();
    demo.setPlannerMode('llm');
    global.fetch = async () => ({ json: async () => ({ ok: false, reason: 'validation_failed', validation: { ok: false, errors: ['bad id'] } }) });
    st = await maybeAwait(demo.start());
    assert.equal(st.running, true, 'invalid group id response falls back');
    assert.equal(st.fallback_reason, 'validation_failed');

    resetHarness();
    demo.setPlannerMode('llm');
    global.fetch = async () => ({ json: async () => clientValidResponse() });
    st = await maybeAwait(demo.start());
    assert.equal(st.running, true, 'movement still starts after valid LLM advisory');
    assert.equal(st.planner, 'llm_advisory');
    assert.equal(st.validation_result, 'accepted');
    assert.equal(demo.getRed()[0].id, 'red-2');

    demo.step();
    assert.ok(demo.getState().progress > 0, 'movement advances');
    st = demo.reset();
    assert.equal(st.progress, 0, 'reset works');
    assert.equal(demo.getGroups().every(g => g.demo_only && g.review_only && g.requires_commander_approval && g.exact_unit_position === false), true, 'no final units');
    assert.equal(demo.getGroups().some(g => g.world_state_mutation || g.final_tasking || g.damage || g.kill_probability), false, 'no world-state mutation fields');

    console.log('PASS free-fight LLM option A');
})().catch(err => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
