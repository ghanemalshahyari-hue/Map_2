#!/usr/bin/env node
/**
 * test-brief-to-scenario-v2-1.js — Batch B Slice 9 (pure logic, no server)
 *
 * Verifies UI_MOdified/server/ai/brief-to-scenario-v2.js — the NEW
 * brief-to-draft AI generation module (the retired ai/brief-to-scenario.js
 * is untouched; see test-retire-legacy-brief-scenario-generator-main-batch-1.js).
 *
 * Proves:
 *   - a too-short brief_text is rejected without ever calling the LLM
 *   - skeletonDraft() produces a schema-shaped, honest placeholder scenario
 *   - applyProposedUnits() converts LLM-fill output into canonical
 *     red_units/blue_units_initial/neutral_units entries, always stamped
 *     needs_review:true/exact_unit_position:false/review_only:true
 *   - the repair loop retries once on failure before giving up (matching
 *     free-fight-coa-planner.js's default repair budget of 1)
 *   - a fully successful generation round-trips through the REAL
 *     scenario-normalizer.js + scenario-validator.js and validates ok:true
 *   - a persistently-failing LLM falls back to an honest, zero-unit
 *     skeleton (never fabricates units) — validation is allowed to be
 *     ok:false in that case, which is the correct, non-deceptive outcome
 *   - the module never touches the filesystem and exposes no write/activate
 *     path (source-scan: no fs.writeFile / scenarios.save* calls)
 *
 * node test-brief-to-scenario-v2-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const MODULE_PATH = path.join(ROOT, 'UI_MOdified/server/ai/brief-to-scenario-v2.js');
const M = require(MODULE_PATH);

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

const LONG_BRIEF = 'Red forces have staged a mechanized brigade near the coastal highway. Blue forces are preparing an amphibious landing to seize the port objective.';

console.log('\n=== Batch B Slice 9: brief-to-scenario-v2 (pure) ===\n');

async function run() {
    // ── 1. Too-short brief_text is rejected, LLM never called ──────────────
    console.log('\n[1] brief_text validation');
    {
        let fillCalled = false;
        const r = await M.generateScenarioDraftFromBrief({ brief_text: 'short', fillFn: () => { fillCalled = true; return Promise.resolve({}); } });
        eq(r.ok, false, 'too-short brief_text -> ok:false');
        ok(!!r.error, 'error message present');
        eq(fillCalled, false, 'LLM fill was never called for a rejected brief');

        const r2 = await M.generateScenarioDraftFromBrief({});
        eq(r2.ok, false, 'missing brief_text -> ok:false');
    }

    // ── 2. skeletonDraft shape ──────────────────────────────────────────────
    console.log('\n[2] skeletonDraft() — honest placeholder shape');
    {
        const d = M.skeletonDraft({ name: 'my-scen', scenario_label: 'My Label', center_lon: 10, center_lat: 20 });
        eq(d.name, 'my-scen', 'name carried through');
        eq(d.scenario_label, 'My Label', 'scenario_label carried through');
        ok(Array.isArray(d.map_bbox) && d.map_bbox.length === 4, 'map_bbox is a 4-tuple');
        eq(d.obj.coord[0], 10, 'obj.coord uses the given center lon');
        eq(d.obj.coord[1], 20, 'obj.coord uses the given center lat');
        eq(d.obj.carver, 0, 'obj.carver defaults to 0 (valid, honest)');
        ok(Array.isArray(d.bls_template) && d.bls_template.length === 1, 'exactly one default bls_template entry');
        eq(d.red_units.length, 0, 'red_units starts empty (no invented units)');
        eq(d.blue_units_initial.length, 0, 'blue_units_initial starts empty');
        ok(d.phase_table.length >= 4 && d.phase_table.length <= 20, 'phase_table satisfies the schema count bound (4-20)');
        eq(d.phase_table.length, d.steps.length, 'steps mirrors phase_table length');
    }

    // ── 3. applyProposedUnits — canonical field mapping + review stamps ────
    console.log('\n[3] applyProposedUnits() — canonical mapping + review-only stamps');
    {
        const d = M.skeletonDraft({ center_lon: 5, center_lat: 6 });
        const center = d.obj.coord;
        M.applyProposedUnits(d, [
            { side: 'RED', platform: 'Mech Brigade', role: 'land', confidence: 'high' },
            { side: 'BLUE', platform: 'Amphib Task Force', role: 'naval', confidence: 'medium' },
            { side: 'GREEN', platform: 'Fishing fleet', role: 'unknown', confidence: 'low' }
        ], center);
        eq(d.red_units.length, 1, 'one RED unit mapped to red_units');
        eq(d.blue_units_initial.length, 1, 'one BLUE unit mapped to blue_units_initial');
        eq((d.neutral_units || []).length, 1, 'non-RED/BLUE side falls through to neutral_units');
        const ru = d.red_units[0];
        eq(ru.uid, 'RED-1', 'red unit gets a canonical uid');
        eq(ru.bls, 'AO-CENTER', 'red unit references the default bls_template entry');
        eq(ru.needs_review, true, 'red unit needs_review:true');
        eq(ru.exact_unit_position, false, 'red unit exact_unit_position:false');
        eq(ru.review_only, true, 'red unit review_only:true');
        ok(ru.coord[0] === center[0] && ru.coord[1] === center[1], 'red unit coord is the honest placeholder center');
        const bu = d.blue_units_initial[0];
        eq(bu.unit_uid, 'BLUE-1', 'blue unit gets a canonical unit_uid');
        eq(bu.base_id, 'AO-CENTER', 'blue unit references the default bls_template entry');
        eq(bu.needs_review, true, 'blue unit needs_review:true');
        eq(bu.exact_unit_position, false, 'blue unit exact_unit_position:false');
        eq(d.blue_units_base_ids.length, d.blue_units_initial.length, 'blue_units_base_ids stays in lockstep');
    }

    // ── 4. Full generation — LLM succeeds first try -> validates ok:true ───
    console.log('\n[4] Full generation, LLM succeeds first try');
    {
        let calls = 0;
        const fakeFill = () => { calls++; return Promise.resolve({
            ok: true,
            brief: { operational_brief: { proposed_units: [
                { side: 'RED', platform: 'Mech Brigade', role: 'land', confidence: 'high', source_evidence: 'mech brigade near coast' },
                { side: 'BLUE', platform: 'Amphib Task Force', role: 'naval', confidence: 'medium', source_evidence: 'amphibious landing' }
            ], mission: 'Seize the port objective' } },
            llm_fill: { available: true, model: 'fake-model-1', units_added: 2, bases_added: 0 }
        }); };
        const r = await M.generateScenarioDraftFromBrief({ brief_text: LONG_BRIEF, fillFn: fakeFill });
        eq(r.ok, true, 'generation returns ok:true');
        eq(calls, 1, 'LLM fill called exactly once on first-try success');
        eq(r.ai_status.llm_available, true, 'ai_status reports llm_available:true');
        eq(r.ai_status.attempts, 1, 'ai_status reports 1 attempt');
        eq(r.scenario.red_units.length, 1, 'one red unit in the final scenario');
        eq(r.scenario.blue_units_initial.length, 1, 'one blue unit in the final scenario');
        eq(r.validation.ok, true, 'validates ok:true against the REAL scenario-validator.js', JSON.stringify(r.validation.errors));
        ok(/Seize the port objective/.test(r.scenario.scenario_label), 'mission text folded into scenario_label');
    }

    // ── 5. Repair loop: fails once, succeeds on repair attempt ─────────────
    console.log('\n[5] Repair loop — fails once, succeeds on retry');
    {
        let calls = 0;
        const flakyFill = () => {
            calls++;
            if (calls === 1) return Promise.resolve({ llm_fill: { available: false, reason: 'transient timeout' } });
            return Promise.resolve({
                ok: true,
                brief: { operational_brief: { proposed_units: [{ side: 'RED', platform: 'Recon Team', role: 'land' }] } },
                llm_fill: { available: true, model: 'fake-model-2' }
            });
        };
        const r = await M.generateScenarioDraftFromBrief({ brief_text: LONG_BRIEF, fillFn: flakyFill });
        eq(calls, 2, 'LLM fill called twice (1 fail + 1 repair)');
        eq(r.ai_status.llm_available, true, 'final ai_status reports success after repair');
        eq(r.ai_status.attempts, 2, 'ai_status reports 2 attempts');
        eq(r.scenario.red_units.length, 1, 'repair-attempt unit made it into the final scenario');
    }

    // ── 6. Persistent failure -> honest deterministic fallback, no invented units ─
    console.log('\n[6] Persistent LLM failure — honest zero-unit fallback');
    {
        let calls = 0;
        const alwaysFail = () => { calls++; return Promise.resolve({ llm_fill: { available: false, reason: 'model not installed' } }); };
        const r = await M.generateScenarioDraftFromBrief({ brief_text: LONG_BRIEF, fillFn: alwaysFail });
        eq(r.ok, true, 'the ORCHESTRATION itself still succeeds (a real, if incomplete, draft is returned)');
        ok(calls >= 2, 'repair budget was exhausted before giving up (>= 2 attempts)', String(calls));
        eq(r.ai_status.llm_available, false, 'ai_status honestly reports llm_available:false');
        eq(r.scenario.red_units.length, 0, 'NO units fabricated when the LLM is unavailable');
        eq(r.scenario.blue_units_initial.length, 0, 'NO units fabricated when the LLM is unavailable');
        eq(r.validation.ok, false, 'validation is honestly ok:false (0 units on each required side) — not force-faked to true');
    }

    // ── 7. Source-scan: never writes to disk, never activates ─────────────
    console.log('\n[7] Source-scan — no filesystem writes, no activation calls');
    {
        const src = fs.readFileSync(MODULE_PATH, 'utf8');
        ok(!/fs\.writeFile|fs\.appendFile|require\(['"]fs['"]\)/.test(src), 'module never requires or calls fs.write*/append*');
        ok(!/setActiveName|scenarios\.save/.test(src), 'module never calls scenario-store save/activate helpers');
    }

    console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
}

run().catch(e => { console.error('FAIL — harness error:', e); process.exit(1); });
