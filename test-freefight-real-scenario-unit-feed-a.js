'use strict';
/* ============================================================================
 * test-freefight-real-scenario-unit-feed-a.js — FREEFIGHT-REAL-SCENARIO-UNIT-FEED-A
 * Static checks — no server required.
 * ========================================================================== */

const fs   = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;

function ok(label, cond, detail) {
    if (cond) { console.log('  PASS  ' + label); PASS++; }
    else       { console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); FAIL++; }
}

// ── SECTION 1: client file — _aiDiagnostics state variable ──────────────────
console.log('\n§1  _aiDiagnostics state variable in free-fight-demo.js');
const clientSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
ok('_aiDiagnostics declared in state vars',
    /var _aiDecision.*_aiDiagnostics/.test(clientSrc));
ok('_aiDiagnostics reset in _resetAiDecision',
    /_resetAiDecision[\s\S]{0,1200}_aiDiagnostics\s*=\s*null/.test(clientSrc));

// ── SECTION 2: client — Priority A: window.RmoozScenario ────────────────────
console.log('\n§2  Priority A: window.RmoozScenario.scenario units');
ok('reads RmoozScenario.scenario',
    /RmoozScenario\s*&&\s*\w+\.RmoozScenario\.scenario/.test(clientSrc) ||
    /w\.RmoozScenario\s*&&\s*w\.RmoozScenario\.scenario/.test(clientSrc) ||
    /RmoozScenario\.scenario/.test(clientSrc));
ok('reads red_units from scenario',
    /sc\.red_units/.test(clientSrc) || /scenario\.red_units/.test(clientSrc));
ok('reads blue_units_initial from scenario',
    /sc\.blue_units_initial/.test(clientSrc) || /scenario\.blue_units_initial/.test(clientSrc));
ok('sets sourceUsed = scenario',
    /sourceUsed\s*=\s*'scenario'/.test(clientSrc));

// ── SECTION 3: client — coord normalization ──────────────────────────────────
console.log('\n§3  coord:[lon,lat] normalization in normUnit helper');
ok('normUnit handles u.coord array',
    /Array\.isArray\(u\.coord\)/.test(clientSrc));
ok('normUnit sets lon = coord[0], lat = coord[1]',
    /coord\[0\]/.test(clientSrc) && /coord\[1\]/.test(clientSrc));
ok('normUnit maps uid/unit_uid -> id',
    /u\.id\s*\|\|\s*u\.uid\s*\|\|\s*u\.unit_uid/.test(clientSrc));

// ── SECTION 4: client — Priority B and C fallbacks ──────────────────────────
console.log('\n§4  Priority B (proposed_units) and C (groups) fallbacks');
ok('Priority B reads proposed_units',
    /sourceUsed\s*=\s*'proposed_units'/.test(clientSrc));
ok('Priority C reads _allGroups anchors',
    /sourceUsed\s*=\s*'groups'/.test(clientSrc));

// ── SECTION 5: client — allowed_unit_ids in request body ────────────────────
console.log('\n§5  allowed_unit_ids sent to server');
ok('allowed_unit_ids mapped from units',
    /allowedUnitIds\s*=\s*units\.map/.test(clientSrc));
ok('allowed_unit_ids included in opts',
    /allowed_unit_ids\s*:\s*allowedUnitIds/.test(clientSrc));

// ── SECTION 6: client — diagnostic counts ───────────────────────────────────
console.log('\n§6  unit_diagnostics computed and stored');
ok('tallyRaw counts units_total, with_id, with_coords',
    /dTotal\s*=\s*raw\.length/.test(clientSrc) &&
    /dWithId/.test(clientSrc) && /dWithCoords/.test(clientSrc));
ok('_aiDiagnostics assigned source_used + counts',
    /_aiDiagnostics\s*=\s*\{[\s\S]{0,200}source_used/.test(clientSrc));

// ── SECTION 7: client — UI labels ───────────────────────────────────────────
console.log('\n§7  UI label changes');
// RMOOZ-...-AG: the "Unit Decision LLM" section header + "No movable units found" no-unit message were old
// COA-card labels (renderCoaPlanHtml), physically deleted. The unit-feed ENGINE (diagnostics counts below,
// + the real-scenario unit feed sections above) is unchanged. [[retired-by-AG]]
ok('Group planner fallback message prefixed with Group Planner LLM',
    /Group Planner LLM/.test(clientSrc));
ok('Diagnostic counts rendered in no-unit path',
    /units_total|units_with_id|units_with_coords|units_movable|with_id|with_coords/.test(clientSrc));

// ── SECTION 8: server — allowed_unit_ids in LLM prompt ──────────────────────
console.log('\n§8  allowed_unit_ids in LLM prompt (free-fight-llm-decision.js)');
const llmSrc = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-decision.js'), 'utf8');
ok('allowed_unit_ids extracted from opts',
    /opts\.allowed_unit_ids/.test(llmSrc));
ok('allowed_unit_ids included in JSON prompt',
    /allowed_unit_ids\s*:/.test(llmSrc));
ok('unit_uid constraint in prompt (must be one of)',
    /MUST be one of allowed_unit_ids/.test(llmSrc) ||
    /must be exactly one of/.test(llmSrc));
ok('system message says unit_uid must be in allowed list',
    /unit_uid must be exactly one of/.test(llmSrc));

// ── SECTION 9: server — deterministic fallback on validation failure ─────────
console.log('\n§9  deterministic fallback on LLM validation failure');
ok('ENGINE.decideAction called on llm_invalid_schema',
    /llm_invalid_schema[\s\S]{0,300}ENGINE\.decideAction/.test(llmSrc) ||
    /ENGINE\.decideAction[\s\S]{0,600}llm_invalid_schema/.test(llmSrc));
ok('ENGINE.decideAction called on llm_validation_failed',
    /llm_validation_failed[\s\S]{0,400}ENGINE\.decideAction/.test(llmSrc) ||
    /ENGINE\.decideAction[\s\S]{0,600}llm_validation_failed/.test(llmSrc));
ok('fallback_reason includes deterministic fallback used',
    /deterministic fallback used/.test(llmSrc));

// ── SECTION 10: scenario file — verifies real unit format ───────────────────
console.log('\n§10  Real scenario unit format reference');
const scenFile = path.join(__dirname, 'UI_MOdified/data/scenarios/attack_objective_draft-46.json');
let scenOk = false, uidOk = false, coordOk = false, unitUidOk = false;
try {
    const scen = JSON.parse(fs.readFileSync(scenFile, 'utf8'));
    const ru = Array.isArray(scen.red_units) && scen.red_units[0];
    const bu = Array.isArray(scen.blue_units_initial) && scen.blue_units_initial[0];
    scenOk   = !!(ru && bu);
    uidOk    = !!(ru && (ru.uid || ru.id));
    coordOk  = !!(ru && Array.isArray(ru.coord) && ru.coord.length >= 2);
    unitUidOk = !!(bu && (bu.unit_uid || bu.uid || bu.id));
} catch (e) { /* file missing or unreadable */ }
ok('scenario file has red_units + blue_units_initial', scenOk);
ok('red_units[0] has uid or id', uidOk);
ok('red_units[0] has coord:[lon,lat]', coordOk);
ok('blue_units_initial[0] has unit_uid or uid', unitUidOk);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
