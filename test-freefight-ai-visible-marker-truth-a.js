'use strict';
/* ============================================================================
 * test-freefight-ai-visible-marker-truth-a.js — FREEFIGHT-AI-VISIBLE-MARKER-TRUTH-A
 * Static checks — no server required.
 * ========================================================================== */

const fs   = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;

function ok(label, cond, detail) {
    if (cond) { console.log('  PASS  ' + label); PASS++; }
    else       { console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); FAIL++; }
}

const src = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

// ── SECTION 1: real_unit_updated field set on apply ──────────────────────────
console.log('\n§1  Apply sets real_unit_updated on _aiDecision');
ok('_aiDecision.real_unit_updated assigned in _applyAiDecision',
    /_aiDecision\.real_unit_updated\s*=\s*mv\.found/.test(src));
ok('real_unit_updated field present in source',
    /real_unit_updated/.test(src));

// ── SECTION 2: map_redraw_called field set on apply ──────────────────────────
console.log('\n§2  Apply sets map_redraw_called on _aiDecision');
ok('_aiDecision.map_redraw_called initialised false',
    /_aiDecision\.map_redraw_called\s*=\s*false/.test(src));
ok('_aiDecision.map_redraw_called set from rdResult.fired_count',
    /_aiDecision\.map_redraw_called\s*=\s*rdResult\.fired_count\s*>\s*0/.test(src));
ok('rdResult returned by _triggerScenarioRedraw',
    /var rdResult\s*=\s*_triggerScenarioRedraw\(\)/.test(src));

// ── SECTION 3: _triggerScenarioRedraw returns bridge list ────────────────────
console.log('\n§3  _triggerScenarioRedraw tracks and returns bridge info');
ok('returns object with called_bridges array',
    /return\s*\{\s*called_bridges\s*:\s*called/.test(src));
ok('pushes AppAdjudicatorMap.drawScenario to called',
    /called\.push\s*\(\s*'AppAdjudicatorMap\.drawScenario'\s*\)/.test(src));
ok('pushes rmooz:ff-ai-unit-moved to called',
    /called\.push\s*\(\s*'rmooz:ff-ai-unit-moved'\s*\)/.test(src));
ok('returns fired_count equal to called.length',
    /fired_count\s*:\s*called\.length/.test(src));

// ── SECTION 4: visible_overlay_created field set on apply ───────────────────
console.log('\n§4  Apply sets visible_overlay_created on _aiDecision');
ok('_aiDecision.visible_overlay_created initialised false',
    /_aiDecision\.visible_overlay_created\s*=\s*false/.test(src));
ok('_aiDecision.visible_overlay_created set true after syncMarkers',
    /_aiDecision\.visible_overlay_created\s*=\s*true/.test(src));

// ── SECTION 5: UI status panel renders the three flags ───────────────────────
console.log('\n§5  UI status panel renders Map Movement Truth');
ok('status panel container has data-ff-truth="status"',
    /data-ff-truth="status"/.test(src));
ok('Map Movement Truth label present',
    /Map Movement Truth/.test(src));
ok('Real unit object updated label present',
    /Real unit object updated/.test(src));
ok('Map redraw called label present',
    /Map redraw called/.test(src));
ok('Visible movement layer label present',
    /Visible movement layer/.test(src));
ok('flag helper returns yes/no spans',
    /flag\s*=\s*function\s*\(val\)[\s\S]{0,100}yes[\s\S]{0,100}no/.test(src) ||
    /function flag\s*\(val\)[\s\S]{0,100}yes[\s\S]{0,100}no/.test(src));

// ── SECTION 6: status panel only renders when applied (_aiApplied) ───────────
console.log('\n§6  Status panel is inside the _aiApplied block');
ok('data-ff-truth block appears after _aiApplied check',
    /_aiApplied[\s\S]{0,1400}data-ff-truth="status"/.test(src));
ok('real_unit_updated read from _aiDecision inside applied block',
    /_aiDecision\.real_unit_updated[\s\S]{0,800}data-ff-truth="status"/.test(src) ||
    /real_unit_updated[\s\S]{0,800}data-ff-truth/.test(src));

// ── SECTION 7: Objective X unchanged — bridge does not mutate objectives ─────
console.log('\n§7  _triggerScenarioRedraw does not mutate objective data');
ok('_triggerScenarioRedraw calls drawScenario, not editScenario or setObjective',
    !/setObjective/.test(src.match(/_triggerScenarioRedraw[\s\S]{0,800}/)?.[0] || ''));
ok('_applyMoveToScenario only mutates lat/lon/coord, not objective fields',
    /function _applyMoveToScenario[\s\S]{0,800}coord\[0\][\s\S]{0,200}/.test(src) &&
    !/setObjective|objective_lat|objective_lon/.test(
        src.match(/function _applyMoveToScenario[\s\S]{0,1000}/)?.[0] || ''));
ok('_aiDecision.map_redraw_bridges stored (bridges list)',
    /_aiDecision\.map_redraw_bridges\s*=\s*rdResult\.called_bridges/.test(src));

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
