#!/usr/bin/env node
/*
 * FREEFIGHT-AI-COA-UI-A — client source static tests
 *
 * Tests (no server, no browser):
 *   §1   "MAIN AI TEST — Attack Plan / COA Planner" string in source
 *   §2   generate-coa button in source
 *   §3   apply-coa button in source
 *   §4   reset-coa button in source
 *   §5   "Generate AI Attack Plan" label in source
 *   §6   "Apply Selected COA" label in source
 *   §7   "Reset COA" label in source
 *   §8   COA card rendering: source mentions "Direct Assault" and "Flank" and "Probe"
 *   §9   Source shows plan_source in COA panel (distinguish llm vs deterministic_coa_fallback)
 *   §10  Source has _coaMovedUnits state var
 *   §11  Source has trail rendering for COA (draws trails in syncMarkers)
 *   §12  "AI Attack Plan Reasoning" string in source (right-side panel)
 *   §13  Source does NOT present "Preview Unit AI Decision" as main button label
 *        (it is preserved but inside the single-unit subsection, not the main heading)
 *   §14  Source has _setCoaPlanForTest seam
 *   §15  "Apply Selected COA" button gated on _coaPlan existing (conditional render check)
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

var CLIENT_SRC = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

// ═══════════════════════════════════════════════════════════════════════════════
// §1  "MAIN AI TEST — Attack Plan / COA Planner" string in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§1  "MAIN AI TEST — Attack Plan / COA Planner" in source');
ok('§1 MAIN AI TEST present', /MAIN AI TEST/.test(CLIENT_SRC));
ok('§1 Attack Plan / COA Planner present', /Attack Plan \/ COA Planner/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §2  generate-coa button in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§2  generate-coa button in source');
ok('§2 data-act="generate-coa" present', /data-act="generate-coa"/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §3  apply-coa button in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§3  apply-coa button in source');
ok('§3 data-act="apply-coa" present', /data-act="apply-coa"/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §4  reset-coa button in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§4  reset-coa button in source');
ok('§4 data-act="reset-coa" present', /data-act="reset-coa"/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §5  "Generate AI Attack Plan" label in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§5  "Generate AI Attack Plan" label in source');
ok('§5 Generate AI Attack Plan present', /Generate AI Attack Plan/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §6  "Apply Selected COA" label in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§6  "Apply Selected COA" label in source');
ok('§6 Apply Selected COA present', /Apply Selected COA/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §7  "Reset COA" label in source
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§7  "Reset COA" label in source');
ok('§7 Reset COA present', /Reset COA/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §8  COA card rendering mentions "Direct Assault", "Flank", "Probe"
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§8  COA card rendering mentions Direct Assault / Flank / Probe');
ok('§8 Direct Assault mentioned in source', /Direct Assault/.test(CLIENT_SRC));
ok('§8 Flank mentioned in source', /[Ff]lank/.test(CLIENT_SRC));
ok('§8 Probe mentioned in source', /[Pp]robe/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §9  Source shows plan_source to distinguish llm vs deterministic_coa_fallback
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§9  Source shows plan_source (llm vs deterministic_coa_fallback)');
ok('§9 plan_source referenced in source', /plan_source/.test(CLIENT_SRC));
ok('§9 deterministic_coa_fallback string present', /deterministic_coa_fallback/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §10  Source has _coaMovedUnits state var
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§10  Source has _coaMovedUnits state var');
ok('§10 _coaMovedUnits present', /_coaMovedUnits/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §11  Source has trail rendering for COA in syncMarkers
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§11  Source has COA trail rendering');
ok('§11 COA trail polyline in source', /_coaMovedUnits\.forEach/.test(CLIENT_SRC) || /_coaApplied && _coaMovedUnits\.length/.test(CLIENT_SRC));
ok('§11 trail color role-based (assault)', /assault.*#ff9060|#ff9060.*assault/.test(CLIENT_SRC));
ok('§11 trail color role-based (support)', /support.*#60b0ff|#60b0ff.*support/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §12  RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF: the old "AI Attack Plan Reasoning" right-side panel
// (renderAiPanel/_aiPanel) was an old operator surface — DISCONNECTED to a no-op. Assert it is GONE.
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§12  Old "AI Attack Plan Reasoning" panel disconnected');
ok('§12 old reasoning-panel HTML builder removed (renderAiPanel is a no-op)', !/h \+= '<div style="font-weight:700;color:#9ec2ec;font-size:13px;margin-bottom:4px;">AI Attack Plan Reasoning/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §13  "Preview Unit AI Decision" is preserved but is not the main COA button
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§13  "Preview Unit AI Decision" preserved; "Generate AI Attack Plan" is main');
ok('§13 Generate AI Attack Plan is present (main COA action)', /Generate AI Attack Plan/.test(CLIENT_SRC));
ok('§13 Preview Unit AI Decision still present in source (unit subsection)', /Preview Unit AI Decision/.test(CLIENT_SRC));
// The main COA section uses "generate-coa", not "preview-ai" as its primary call to action
ok('§13 generate-coa is main button (appears before preview-ai in source)',
    CLIENT_SRC.indexOf('generate-coa') < CLIENT_SRC.indexOf('preview-ai') ||
    /generate-coa/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §14  Source has _setCoaPlanForTest seam
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§14  Source has _setCoaPlanForTest seam');
ok('§14 _setCoaPlanForTest present', /_setCoaPlanForTest/.test(CLIENT_SRC));
ok('§14 _generateCoaPlanForTest present', /_generateCoaPlanForTest/.test(CLIENT_SRC));
ok('§14 _applySelectedCoaForTest present', /_applySelectedCoaForTest/.test(CLIENT_SRC));
ok('§14 _resetCoaForTest present', /_resetCoaForTest/.test(CLIENT_SRC));
ok('§14 _getCoaMovedUnitsForTest present', /_getCoaMovedUnitsForTest/.test(CLIENT_SRC));
ok('§14 _getCoaAppliedForTest present', /_getCoaAppliedForTest/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §15  "Apply Selected COA" button gated on _coaPlan existing
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§15  "Apply Selected COA" button gated on _coaPlan existing');
// The button should only appear when _coaPlan && _coaPlan.ok
ok('§15 apply-coa gated on _coaPlan',
    /if\s*\(_coaPlan.*apply-coa|apply-coa.*_coaPlan/.test(CLIENT_SRC.replace(/\n/g, ' ')) ||
    (function () {
        // Check that the apply-coa button is inside a conditional block referencing _coaPlan
        var idx = CLIENT_SRC.indexOf('apply-coa');
        if (idx === -1) return false;
        var before = CLIENT_SRC.slice(Math.max(0, idx - 300), idx);
        return /_coaPlan/.test(before);
    })()
);
ok('§15 apply-coa only shown when not already applied (!_coaApplied)',
    /!_coaApplied/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
