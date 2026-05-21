/**
 * Comparison report builder (item #12).
 *
 * Pure data assembly: given a scenario name and optionally a Monte Carlo
 * runId, returns a structured report object comparing
 *
 *   - Baseline       : scenario.steps[i].*_baseline (deterministic)
 *   - Live AI        : trial-000 from the chosen MC run (per-step LLM output)
 *   - MC distribution: aggregated stats across all trials in the run
 *
 * No HTML, no I/O beyond reading data/scenarios + data/mc-runs. The
 * web-server route renders the returned object into HTML; a CLI / API
 * call can consume the JSON directly.
 *
 * Public surface:
 *   buildReport({ scenarioName, runId? }) → ReportObject
 *   listMcRunsForScenario(scenarioName)   → [{ runId, summary, startedAt }, …]
 *   latestMcRunForScenario(scenarioName)  → runId | null
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const loader        = require('./scenario-loader');
const learningStore = require('./learning-store');

const ROOT     = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const MC_DIR   = path.join(DATA_DIR, 'mc-runs');

function safeReadJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return null; }
}

function listMcRunsForScenario(scenarioName) {
    if (!fs.existsSync(MC_DIR)) return [];
    const out = [];
    for (const dirName of fs.readdirSync(MC_DIR)) {
        const dir = path.join(MC_DIR, dirName);
        let stat;
        try { stat = fs.statSync(dir); } catch { continue; }
        if (!stat.isDirectory()) continue;
        const summary = safeReadJson(path.join(dir, 'summary.json'));
        if (!summary) continue;
        if (summary.scenarioName !== scenarioName) continue;
        out.push({ runId: dirName, summary, startedAt: summary.startedAt || null });
    }
    out.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
    return out;
}

function latestMcRunForScenario(scenarioName) {
    // Prefer the most-recent run that actually has data. A half-completed
    // run (interrupted, all trials failed) is technically "latest" but
    // useless as a comparison subject — fall back to it only when nothing
    // better exists.
    const runs = listMcRunsForScenario(scenarioName);
    const withTrials = runs.find(r => r.summary && r.summary.trialsCompleted > 0);
    if (withTrials) return withTrials.runId;
    return runs.length ? runs[0].runId : null;
}

// Read a single trial JSONL, returning per-step state rows keyed by stepIndex.
// We use trial-000 as the "Live AI" exemplar — the MC runner numbers trials
// from 0 so trial-000.jsonl always exists for a completed run.
function readTrialStates(runDir, trialIdx) {
    const file = path.join(runDir, `trial-${String(trialIdx).padStart(3, '0')}.jsonl`);
    if (!fs.existsSync(file)) return null;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const byStep = {};
    let meta = null;
    for (const ln of lines) {
        if (!ln.trim()) continue;
        let obj;
        try { obj = JSON.parse(ln); } catch { continue; }
        if (obj.kind === 'meta') meta = obj;
        else if (obj.kind === 'state' && Number.isInteger(obj.stepIndex)) {
            byStep[obj.stepIndex] = obj;
        }
    }
    return { meta, byStep };
}

// Compact per-step row mirroring the columns we want side-by-side in HTML.
// Renderer doesn't have to dig into nested objects — everything top-level.
function rowFromState(state) {
    if (!state) return null;
    const bls = state.bls_status || {};
    return {
        step_index:        state.step_index,
        time_label:        state.time_label,
        phase:             state.phase,
        phase_line_km:     state.phase_line_km,
        objective_status:  state.objective_status,
        force_ratio:       state.force_ratio,
        ew_effect:         state.ew_effect,
        bls_status:        bls,
        bls_compact:       Object.entries(bls).map(([k, v]) => `${k}:${(v || '').slice(0, 4)}`).join(' '),
        blue_destroyed:    state.losses_cumulative && state.losses_cumulative.blue_destroyed,
        red_coy_eq_losses: state.losses_cumulative && state.losses_cumulative.red_company_equivalent,
        narrative_en:      state.narrative_en || '',
        narrative_ar:      state.narrative_ar || '',
    };
}

function rowFromBaseline(scenario, stepIndex) {
    const s = scenario.steps && scenario.steps[stepIndex];
    if (!s) return null;
    return {
        step_index:        stepIndex,
        time_label:        s.time_label,
        phase:             s.phase,
        phase_line_km:     s.phase_line_km_baseline,
        objective_status:  s.objective_status_baseline,
        force_ratio:       s.force_ratio_baseline,
        ew_effect:         s.ew_effect_baseline,
        bls_status:        s.bls_status_baseline || {},
        bls_compact:       Object.entries(s.bls_status_baseline || {}).map(([k, v]) => `${k}:${(v || '').slice(0, 4)}`).join(' '),
        blue_destroyed:    (s.blue_destroyed_count_baseline != null)
                              ? s.blue_destroyed_count_baseline
                              : (s.blue_destroyed_baseline ? s.blue_destroyed_baseline.length : 0),
        red_coy_eq_losses: s.red_losses_cumulative_baseline,
        narrative_en:      s.narrative_en_fallback || '',
        narrative_ar:      s.narrative_ar_fallback || '',
    };
}

function buildReport({ scenarioName, runId } = {}) {
    if (!scenarioName) throw new Error('buildReport: scenarioName is required');

    const scenario = loader.loadScenario(scenarioName);

    // Resolve the MC run. If the caller didn't pin one, use the most-recent
    // run for the same scenario — that's the report most users actually want
    // ("show me what last week's MC said").
    let resolvedRunId = runId || null;
    if (!resolvedRunId) resolvedRunId = latestMcRunForScenario(scenarioName);

    let runSummary = null;
    let trial0 = null;
    if (resolvedRunId) {
        const runDir = path.join(MC_DIR, resolvedRunId);
        runSummary = safeReadJson(path.join(runDir, 'summary.json'));
        if (!runSummary) {
            // Stale runId — wipe it so the renderer reports "no MC data" instead
            // of trying to render against a half-deleted directory.
            resolvedRunId = null;
        } else {
            trial0 = readTrialStates(runDir, 0);
        }
    }

    const baselineRows = [];
    const liveRows     = [];
    const stepCount    = Array.isArray(scenario.steps) ? scenario.steps.length : 12;
    for (let i = 0; i < stepCount; i++) {
        baselineRows.push(rowFromBaseline(scenario, i));
        const stateRow = trial0 && trial0.byStep && trial0.byStep[i];
        liveRows.push(stateRow ? rowFromState(stateRow.state) : null);
    }

    // Terminal-outcome comparison. Baseline terminal is deterministic;
    // Live terminal is whatever trial 0 ended at; MC is the aggregate.
    const lastIdx      = stepCount - 1;
    const baselineTerm = baselineRows[lastIdx] || {};
    const liveTerm     = liveRows[lastIdx]     || {};
    const mcTerm = runSummary ? {
        outcomeCounts: runSummary.outcomeCounts,
        outcomePct:    runSummary.outcomePct,
        phase_line_km: runSummary.finalPhaseLineKm,
        blue_destroyed:runSummary.finalBlueDestroyed,
        red_coy_eq_losses: runSummary.finalRedCoyEqLosses,
        fallback_steps:runSummary.fallbackStepCounts,
        fallback_reasons: runSummary.fallbackReasonCounts || {},
        trials_completed: runSummary.trialsCompleted,
    } : null;

    // Pull priors as of report-build time. The numbers may differ from what
    // the MC run actually saw (priors evolve as new runs are added), so we
    // label them "as of now" in the rendered report.
    let priors = null;
    try {
        priors = learningStore.computePriors({
            scenarioName,
            coaParams: runSummary ? runSummary.coaParams : null,
        });
    } catch (_) { priors = null; }

    return {
        scenario: {
            name:           scenario.name,
            label:          scenario.scenario_label,
            terrain_note:   scenario.terrain_note,
        },
        coa: runSummary ? runSummary.coaParams : null,
        provider:           runSummary ? runSummary.provider : null,
        model:              runSummary ? runSummary.model    : null,
        runId:              resolvedRunId,
        runStartedAt:       runSummary ? runSummary.startedAt : null,
        runEndedAt:         runSummary ? runSummary.endedAt   : null,
        runDurationMs:      runSummary ? runSummary.durationMs: null,
        runMockMode:        runSummary ? !!runSummary.mockMode: null,
        trialsCompleted:    runSummary ? runSummary.trialsCompleted : 0,
        trialsRequested:    runSummary ? runSummary.trialsRequested : 0,
        baselineRows,
        liveRows,
        mcTerm,
        baselineTerm,
        liveTerm,
        priors,
        availableRunIds:    listMcRunsForScenario(scenarioName).map(r => r.runId),
        generatedAt:        new Date().toISOString(),
    };
}

module.exports = {
    buildReport,
    listMcRunsForScenario,
    latestMcRunForScenario,
    rowFromBaseline,
    rowFromState,
};
