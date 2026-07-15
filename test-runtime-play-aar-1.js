#!/usr/bin/env node
/**
 * test-runtime-play-aar-1.js — Batch C Slice C8
 *
 * Runtime-play AAR: a real, user-facing AAR already exists
 * (cmo-wargame-after-action-debrief.js) but is scoped to CMO test-
 * instrumentation/release-grading, not "any completed scenario run"
 * (audit-confirmed). This slice extends the EXISTING journal-replay
 * reconstruction (runtime-replay.js, previously built but never wired into
 * app.html) with a new `scenario_end_condition` record kind + a
 * classification layer mirroring the CMO debrief's {key,label,label_ar,
 * status,detail} shape — but keyed to actual victory/failure/timeout
 * outcomes from Slice C7's journal record, kept entirely separate from the
 * CMO evidence-release stack.
 *
 * Part 1 composes the REAL runtime-replay.js module directly (requirable,
 * confirmed) with synthetic journal rows shaped exactly like the real
 * /api/sim/commit payload ({mods:{runtime_journal: record}}) — genuine
 * classification logic, not a mock. Part 2 is a source-scan of
 * free-fight-demo.js/scenario-control-center.js's wiring (the established
 * pattern for these two files throughout Batch C).
 *
 * Sibling to test-runtime-events-journal-1.js. Run:
 *   node test-runtime-play-aar-1.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const RuntimeReplay = require(path.join(ROOT, 'UI_MOdified/client/shell/runtime-replay.js'));
const ffSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
const sccSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-control-center.js'), 'utf8');
const appHtml = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 4000 : b);
}

console.log('\n=== Batch C Slice C8: runtime-play AAR ===\n');

function endConditionRow(code, extra, elapsed) {
    return {
        mods: {
            runtime_journal: Object.assign({
                schema_version: 'runtime-events-journal-v1',
                source: 'runtime-events',
                kind: 'scenario_end_condition',
                action: 'scenario_end_condition',
                run_id: 'run-1',
                elapsed_hours: elapsed != null ? elapsed : 6,
                recorded_at: '2026-07-15T00:00:00Z',
                detail: Object.assign({ code: code, summary: 'Test summary for ' + code }, extra || {})
            })
        }
    };
}

// ── 1. Victory-condition-met (Blue side) narrates as a pass ───────────────
console.log('\n[1] Victory-condition-met (side: blue) narrates as a real "pass" outcome');
{
    const rows = [endConditionRow('victory_condition_met', { victory_condition_id: 'vc-1', side: 'blue' })];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    ok(!!aar.outcome, 'AAR produces a real outcome object');
    eq(aar.outcome.status, 'pass', 'Blue-favoring victory condition classifies as pass');
    eq(aar.outcome.code, 'victory_condition_met', 'outcome code matches the real journal record');
    eq(aar.outcome.victory_condition_id, 'vc-1', 'victory_condition_id is carried through from the real journal detail');
}

// ── 2. Victory-condition-met (Red side) narrates as a fail (Blue perspective) ─
console.log('\n[2] Victory-condition-met (side: red) narrates as a "fail" outcome — same code, side-aware');
{
    const rows = [endConditionRow('victory_condition_met', { victory_condition_id: 'vc-2', side: 'red' })];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    eq(aar.outcome.status, 'fail', 'Red-favoring victory condition classifies as fail, even though the code is identical to test [1]');
}

// ── 3. Timeout run narrates as a warn ───────────────────────────────────────
console.log('\n[3] Timeout run narrates as "warn"');
{
    const rows = [endConditionRow('scenario_timeout')];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    eq(aar.outcome.status, 'warn', 'timeout is a warn, not pass/fail');
    ok(/timed out/i.test(aar.outcome.label), 'label is a real, human-readable timeout narrative', aar.outcome.label);
}

// ── 4. Max-turns run narrates as a warn/inconclusive outcome ───────────────
console.log('\n[4] Max-turns run narrates as inconclusive');
{
    const rows = [endConditionRow('max_turns_reached')];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    eq(aar.outcome.status, 'warn', 'max_turns_reached is a warn (inconclusive), not a clean pass/fail');
}

// ── 5. No end-condition record yet -> no outcome (scenario hasn't ended) ──
console.log('\n[5] No scenario_end_condition record present -> outcome stays null');
{
    const rows = [{ mods: { runtime_journal: { schema_version: 'runtime-events-journal-v1', source: 'runtime-events', kind: 'runtime_event_fired', event_id: 'e1', elapsed_hours: 1 } } }];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    eq(aar.outcome, null, 'a run with no end-condition record is not narrated as any outcome');
    ok(aar.timeline.length === 1, 'the timeline still reconstructs the non-outcome records normally (extension, not a replacement)');
}

// ── 6. Unrecognized end-condition code is honestly labeled, not hidden ────
console.log('\n[6] An unrecognized end-condition code is honestly flagged, not silently dropped');
{
    const rows = [endConditionRow('some_future_code_not_yet_classified')];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    eq(aar.outcome.status, 'unknown', 'unrecognized codes classify as "unknown", not a guessed pass/fail');
    ok(!!aar.outcome.label, 'still produces a real label rather than crashing or omitting the outcome');
}

// ── 7. Multiple end-condition records -> the LAST one wins ────────────────
console.log('\n[7] Multiple scenario_end_condition records (re-run) -> the most recent one is narrated');
{
    const rows = [endConditionRow('scenario_timeout', {}, 3), endConditionRow('objective_secured', {}, 9)];
    const aar = RuntimeReplay.buildRuntimePlayAar(rows);
    eq(aar.outcome.code, 'objective_secured', 'the later (by elapsed_hours sort) end condition is the one narrated');
}

// ── 8. buildRuntimePlayAar extends buildRuntimeReplay, not a parallel impl ─
console.log('\n[8] buildRuntimePlayAar reuses buildRuntimeReplay/buildRuntimeAarSummary (extension, not duplication)');
{
    const rrSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/runtime-replay.js'), 'utf8');
    const fn = block(rrSrc, 'function buildRuntimePlayAar', 'var api = {');
    ok(/var replay = buildRuntimeReplay\(records\);/.test(fn), 'calls the real buildRuntimeReplay() internally');
    ok(/replay\.timeline/.test(fn) && /replay\.summary/.test(fn), 'reuses its timeline/summary output directly, not a re-derived copy');
}

// ── 9. Explicitly does not touch the separate CMO evidence-release stack ──
console.log('\n[9] Does not read/write the separate CMO evidence-release stack');
{
    const rrSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/runtime-replay.js'), 'utf8');
    // Strip comments first — a doc comment explaining the distinction from
    // cmo-wargame-after-action-debrief.js is expected and fine; what must be
    // absent is any actual CODE reference (a call, a read, a require).
    const rrCode = rrSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/cmo-wargame|scenario-evidence|release_status|handoff_decision|blocker_count/.test(rrCode),
        'runtime-replay.js has no CODE reference (outside comments) to the CMO test-instrumentation/evidence-release vocabulary');
    const sccAarFn = block(sccSrc, 'function runtimePlayAarHtml', 'function panel6Evidence');
    ok(!/cmo-wargame|scenario-evidence/.test(sccAarFn), 'the SCC AAR panel section does not reference the CMO/evidence stack either');
}

// ── 10. Wiring: engine facade, journal history tracking, SCC panel, app.html ─
console.log('\n[10] Wiring — engine facade, journal history, SCC panel, app.html script tag');
{
    ok(/runtimePlayAar:\s*function\s*\(\)\s*\{/.test(ffSrc), 'engine facade exposes runtimePlayAar()');
    ok(/st\.journal_record_history\.push\(record\);/.test(ffSrc), '_journalRuntimeRecord tracks a bounded in-memory history for the AAR to reconstruct from');
    ok(/if \(st\.journal_record_history\.length > 200\) st\.journal_record_history\.shift\(\);/.test(ffSrc), 'history is bounded (capped), not unbounded growth');
    ok(/function runtimePlayAarHtml\(eng\)/.test(sccSrc), 'SCC defines runtimePlayAarHtml(eng)');
    ok(/data-scc="runtime-play-aar"/.test(sccSrc), 'renders under a real data-scc hook');
    ok(block(sccSrc, 'function panel6Evidence', 'var trace = eng.executedTrace').indexOf('runtimePlayAarHtml(eng)') >= 0,
        'panel6Evidence calls runtimePlayAarHtml(eng)');
    ok(/shell\/runtime-replay\.js/.test(appHtml), 'app.html now loads runtime-replay.js (previously built but never wired in)');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
