/* ============================================================================
 * test-runtime-run-controls-contract-1.js — RUN CONTROLS CONTRACT (batch 1)
 * ----------------------------------------------------------------------------
 * Owner north-star: "Run means time moves. Step means review."
 * Every button that RUNS a scenario must advance the C1/C2 runtime clock
 * (runtime clock -> World State -> map -> journal). Fixed steps[] are snapshots
 * only, never the engine. Legacy fixed-step surfaces must NOT be presented as a
 * scenario run.  See memory: project_run_means_time_moves.
 *
 * Static gate (no server). Reads the shipped source and asserts the contract.
 * Scope of batch 1 (owner ruling 2026-07-05):
 *   - SCC primary run readout says "Scenario time" (World-State clock), not "Turn".
 *   - Manual step/scrub pauses a playing committed run (C2 ownership guard).
 *   - Legacy "Turn-based" Wargame-HUD relabelled Legacy/Diagnostic, not run.
 *   - DOM ids kept for compatibility; turn-engine.js / steps[] NOT removed.
 *   - Timeline / scenario-workspace playback intentionally OUT of scope here.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const C_SCC   = 'UI_MOdified/client/shell/scenario-control-center.js';
const C_FF    = 'UI_MOdified/client/shell/free-fight-demo.js';
const C_MAP   = 'UI_MOdified/client/wargame/adjudicator-map.js';
const C_HTML  = 'UI_MOdified/client/app.html';
const C_I18N  = 'UI_MOdified/client/i18n.js';
const C_WS    = 'UI_MOdified/client/shell/world-state.js';
const C_TURN  = 'UI_MOdified/client/turn-engine.js';

let passed = 0, failed = 0;
function ok(name, cond) {
    if (cond) { passed++; console.log('  PASS  ' + name); }
    else { failed++; console.log('  FAIL  ' + name); }
}

const scc  = read(C_SCC);
const ff   = read(C_FF);
const map  = read(C_MAP);
const html = read(C_HTML);
const i18n = read(C_I18N);
const ws   = read(C_WS);

/* ── A. Primary run uses the runtime clock, readout is scenario TIME ───────── */
ok('A1 SCC exposes the primary Run action (scc-run "Run Scenario")',
    scc.includes("'scc-run'") && scc.includes('Run Scenario'));
ok('A2 SCC run readout shows "Scenario time"',
    scc.includes("kv('Scenario time'"));
ok('A3 SCC time is sourced from the World-State clock label, not fabricated',
    scc.includes('scenarioClockLabel') &&
    /scenarioClockLabel:\s*function/.test(ff) &&
    ff.includes('_scenarioClockLabel') &&
    ff.includes('runClockLabel'));            // _scenarioClockLabel prefers MAP.runClockLabel (C1)
ok('A4 SCC primary readout no longer LEADS with a bare "Turn" headline',
    !scc.includes("kv('Turn', String(scn.scenario_turn)"));

/* ── B. Manual step/scrub pauses a playing committed run (C2 guard) ────────── */
ok('B1 adjudicator applyState pauses the run on a non-snapshot apply while playing',
    map.includes('pauseCommittedRun') &&
    map.includes('runClock') && map.includes('opts.snapshot'));

/* ── C. Legacy fixed-step surface not presented as a scenario RUN ──────────── */
ok('C1 tool tooltip no longer frames the legacy HUD as a scenario run',
    !i18n.includes('Run an operational scenario'));
ok('C2 legacy step control renamed away from "Next Turn"',
    !i18n.includes("'wg-btn-next': 'Next Turn'") &&
    i18n.includes("'wg-btn-next': 'Next snapshot'"));
ok('C3 wargame mode chip is Legacy/Diagnostic, not "Turn-based"',
    !html.includes('wargame-mode-chip">Turn-based') &&
    html.includes('wargame-mode-chip">Legacy'));
ok('C4 legacy panel carries an explicit "not the scenario run" banner',
    html.includes('wg-legacy-banner'));
ok('C5 tool label marks the surface Legacy',
    i18n.includes("'tool-wargame': 'Operational Scenario (Legacy)'"));

/* ── D. Boundaries preserved: DOM compat + nothing deleted ─────────────────── */
ok('D1 DOM ids preserved for compatibility (wg-init/next/reset/hud)',
    html.includes('id="wg-init"') && html.includes('id="wg-next"') &&
    html.includes('id="wg-reset"') && html.includes('id="wargame-hud"'));
ok('D2 turn-engine.js NOT deleted', exists(C_TURN));
ok('D3 steps-as-snapshots mechanism intact (findStepForElapsedHours)',
    ws.includes('findStepForElapsedHours'));

/* ── E. C1/C2 gates still present (run them separately for pass/fail) ──────── */
ok('E1 C1/C2 gate files still present',
    exists('test-scc-runtime-clock-1.js') && exists('test-scc-runtime-clock-2.js'));

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
