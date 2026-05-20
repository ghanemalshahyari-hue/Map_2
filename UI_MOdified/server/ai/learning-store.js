/**
 * Learning store — read-side aggregator over past Monte Carlo runs.
 *
 * Items #5 + #6 from todo.md. The store doesn't write anything new
 * itself — monte-carlo-runner.js already writes
 *   data/mc-runs/<runId>/summary.json (run-level aggregate)
 *   data/mc-runs/<runId>/trial-NNN.jsonl (per-step events, item #4)
 * which together carry everything we need for "learned priors before each
 * adjudication".
 *
 * Public surface:
 *   computePriors({ scenarioName, coaParams, ageMs? })
 *     → priors object, or null if no matching runs exist
 *   summarizeMatchedRuns(...)
 *     → diagnostic helper used by tests
 *
 * The priors object carries every field item #6 calls out:
 *   - capture / denial rates                 → outcomePct
 *   - average phase line                     → finalPhaseLineKm.{median,mean}
 *   - losses                                 → finalBlueDestroyed, finalRedCoyEqLosses
 *   - common failure reasons                 → fallbackReasonsTop
 *   - model reliability                      → fallbackRate, schemaOkRate
 *
 * Filtering: matches scenarios by name and COA by exact posture +
 * reserve_commit_hour (the two operator-facing knobs). main_effort_axis
 * is currently fixed to 'BLS-3' so we don't filter on it. Mock-only
 * runs are excluded — replaying baseline doesn't teach the model
 * anything beyond what's already in the scenario file.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const feedbackStore = require('./feedback-store');

const ROOT     = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const MC_DIR   = path.join(DATA_DIR, 'mc-runs');

const DEFAULT_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function safeReadJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { return null; }
}

function listSummaries() {
    if (!fs.existsSync(MC_DIR)) return [];
    const out = [];
    for (const name of fs.readdirSync(MC_DIR)) {
        const d = path.join(MC_DIR, name);
        let stat;
        try { stat = fs.statSync(d); } catch { continue; }
        if (!stat.isDirectory()) continue;
        const summary = safeReadJson(path.join(d, 'summary.json'));
        if (!summary) continue;
        // Fall back to run.json when older summaries don't carry coaParams
        // (the field was added with items #5/#6). Best-effort enrichment.
        if (!summary.coaParams) {
            const runCfg = safeReadJson(path.join(d, 'run.json'));
            if (runCfg && runCfg.coaParams) {
                summary.coaParams = runCfg.coaParams;
                summary.provider  = summary.provider  || runCfg.provider  || null;
                summary.mockMode  = summary.mockMode != null ? summary.mockMode : !!runCfg.mockMode;
            }
        }
        out.push({ runId: name, dir: d, summary });
    }
    return out;
}

function matches(summary, scenarioName, coaParams, ageCutoff) {
    if (!summary || summary.scenarioName !== scenarioName) return false;
    // Skip mock-only runs — they replay scenario baselines, which doesn't
    // teach the model anything novel. Including them would bias priors
    // toward the baseline distribution rather than the LLM's behavior.
    if (summary.mockMode === true) return false;
    if (summary.trialsCompleted === 0) return false;
    if (ageCutoff != null && summary.endedAt) {
        const ended = Date.parse(summary.endedAt);
        if (Number.isFinite(ended) && ended < ageCutoff) return false;
    }
    if (coaParams && summary.coaParams) {
        const want = coaParams.posture;
        const have = summary.coaParams.posture;
        if (want != null && have != null && want !== have) return false;
        const wantHr = Number(coaParams.reserve_commit_hour);
        const haveHr = Number(summary.coaParams.reserve_commit_hour);
        if (Number.isFinite(wantHr) && Number.isFinite(haveHr) && wantHr !== haveHr) return false;
    }
    return true;
}

// Weighted merge of summarizeNumeric outputs across N runs. Reconstructs
// a synthetic combined sample from per-run means by repeating each mean
// `n` times. Cheap and good enough at the precision we report (rounded
// to 1 decimal); full re-aggregation would need the trial JSONLs.
function mergeNumeric(stats) {
    const samples = [];
    for (const s of stats) {
        if (!s || !Number.isFinite(s.n) || !Number.isFinite(s.mean)) continue;
        for (let i = 0; i < s.n; i++) samples.push(s.mean);
    }
    if (!samples.length) return null;
    samples.sort((a, b) => a - b);
    const sum = samples.reduce((a, b) => a + b, 0);
    const p = (q) => samples[Math.max(0, Math.min(samples.length - 1, Math.floor(q * (samples.length - 1))))];
    return {
        n:      samples.length,
        min:    samples[0],
        p25:    p(0.25),
        median: p(0.50),
        p75:    p(0.75),
        max:    samples[samples.length - 1],
        mean:   sum / samples.length,
    };
}

function pct(part, whole) {
    if (!whole) return 0;
    return Math.round((part / whole) * 1000) / 10; // one decimal place
}

function topReasons(reasonCounts, k) {
    const entries = Object.entries(reasonCounts || {}).sort((a, b) => b[1] - a[1]);
    return entries.slice(0, k).map(([reason, n]) => ({ reason, count: n }));
}

function computePriors({ scenarioName, coaParams, ageMs } = {}) {
    if (!scenarioName) return null;
    const ageCutoff = (ageMs == null) ? (Date.now() - DEFAULT_AGE_MS)
                    : (ageMs > 0 ? Date.now() - ageMs : null);

    const all = listSummaries();
    const matched = all.filter(r => matches(r.summary, scenarioName, coaParams, ageCutoff));

    // Even with zero MC runs, operator feedback alone is useful — early
    // single-step iteration generates accept/reject signal before anyone
    // runs a Monte Carlo. We fall through to a minimal priors object in
    // that case (handled below; formatLearnedPriorsBlock copes).
    let earlyFeedback = null;
    if (matched.length === 0) {
        try {
            earlyFeedback = feedbackStore.countByScenarioCoa({ scenarioName, coaParams, ageMs: ageMs != null ? ageMs : DEFAULT_AGE_MS });
        } catch (_) { /* ignore */ }
        if (!earlyFeedback || earlyFeedback.total === 0) return null;
        return {
            scenarioName,
            coaFilter: coaParams ? {
                posture:             coaParams.posture || null,
                reserve_commit_hour: coaParams.reserve_commit_hour != null ? Number(coaParams.reserve_commit_hour) : null,
            } : null,
            runsSampled:        0,
            trialsSampled:      0,
            outcomeCounts:      {},
            outcomePct:         {},
            finalPhaseLineKm:   null,
            finalBlueDestroyed: null,
            finalRedCoyEqLosses:null,
            fallbackRate:       0,
            fallbackReasonsTop: [],
            schemaOkRate:       0,
            operatorFeedback: {
                accept: earlyFeedback.accept,
                reject: earlyFeedback.reject,
                note:   earlyFeedback.note,
                total:  earlyFeedback.total,
                operatorAcceptPct: (earlyFeedback.accept + earlyFeedback.reject) > 0
                    ? pct(earlyFeedback.accept, earlyFeedback.accept + earlyFeedback.reject)
                    : null,
                latest: earlyFeedback.latest,
            },
            runIds:      [],
            latestRunAt: null,
        };
    }

    // Per-bucket totals across matched runs.
    const outcomeTotals = {};
    let trialsCompleted = 0;
    let fallbackSteps   = 0;
    let totalSteps      = 0;
    const fallbackReasonCounts = {};
    const finalPlStats          = [];
    const finalBlueStats        = [];
    const finalRedStats         = [];
    const fallbackStepStats     = [];
    const runIds                = [];
    const startedAts            = [];

    for (const { runId, summary } of matched) {
        trialsCompleted += summary.trialsCompleted || 0;
        for (const [k, v] of Object.entries(summary.outcomeCounts || {})) {
            outcomeTotals[k] = (outcomeTotals[k] || 0) + v;
        }
        for (const [r, n] of Object.entries(summary.fallbackReasonCounts || {})) {
            fallbackReasonCounts[r] = (fallbackReasonCounts[r] || 0) + n;
        }
        // 11 LLM-resolved steps per completed trial; the seed step (0) doesn't
        // count toward the model-reliability rate.
        totalSteps    += (summary.trialsCompleted || 0) * 11;
        // fallbackStepCounts is the per-trial summary on each run; the runner
        // produces this from summarizeNumeric so we have {n, mean, ...}.
        const fbStat = summary.fallbackStepCounts;
        if (fbStat && Number.isFinite(fbStat.mean) && Number.isFinite(fbStat.n)) {
            fallbackSteps += fbStat.mean * fbStat.n;
            fallbackStepStats.push(fbStat);
        }
        if (summary.finalPhaseLineKm)    finalPlStats.push(summary.finalPhaseLineKm);
        if (summary.finalBlueDestroyed)  finalBlueStats.push(summary.finalBlueDestroyed);
        if (summary.finalRedCoyEqLosses) finalRedStats.push(summary.finalRedCoyEqLosses);
        runIds.push(runId);
        if (summary.startedAt) startedAts.push(summary.startedAt);
    }

    const outcomePct = {};
    for (const [k, v] of Object.entries(outcomeTotals)) outcomePct[k] = pct(v, trialsCompleted);

    // Operator feedback fold-in (item #9). Same scenario+COA filter so a
    // priors object only reports feedback that's actually about this kind
    // of run. Defensive against an unwritable / corrupt feedback dir.
    let feedback = null;
    try {
        feedback = feedbackStore.countByScenarioCoa({ scenarioName, coaParams, ageMs: ageMs != null ? ageMs : DEFAULT_AGE_MS });
    } catch (_) {
        feedback = null;
    }
    const feedbackTotal = feedback ? (feedback.accept + feedback.reject) : 0;
    const operatorAcceptPct = feedbackTotal > 0 ? pct(feedback.accept, feedbackTotal) : null;

    return {
        scenarioName,
        coaFilter: coaParams ? {
            posture:             coaParams.posture || null,
            reserve_commit_hour: coaParams.reserve_commit_hour != null ? Number(coaParams.reserve_commit_hour) : null,
        } : null,
        runsSampled:        runIds.length,
        trialsSampled:      trialsCompleted,
        outcomeCounts:      outcomeTotals,
        outcomePct,
        finalPhaseLineKm:   mergeNumeric(finalPlStats),
        finalBlueDestroyed: mergeNumeric(finalBlueStats),
        finalRedCoyEqLosses:mergeNumeric(finalRedStats),
        fallbackRate:       totalSteps ? pct(fallbackSteps, totalSteps) : 0,
        fallbackReasonsTop: topReasons(fallbackReasonCounts, 4),
        // Crude model reliability proxy: 100 - fallbackRate. Refines once
        // we have enough feedback to compute operatorAcceptPct (which is
        // the truer signal — schema_ok says nothing about whether the
        // adjudication was *correct*).
        schemaOkRate:       totalSteps ? Math.round((1 - fallbackSteps / totalSteps) * 1000) / 10 : 0,
        // Operator-feedback rollup. null when no feedback at all in scope.
        operatorFeedback:   (feedback && feedback.total > 0) ? {
            accept:           feedback.accept,
            reject:           feedback.reject,
            note:             feedback.note,
            total:            feedback.total,
            operatorAcceptPct,
            latest:           feedback.latest,
        } : null,
        runIds,
        // Most-recent matched run's startedAt, useful for "as of …" framing.
        latestRunAt:        startedAts.sort().pop() || null,
    };
}

function summarizeMatchedRuns(scenarioName, coaParams) {
    const ageCutoff = Date.now() - DEFAULT_AGE_MS;
    return listSummaries()
        .filter(r => matches(r.summary, scenarioName, coaParams, ageCutoff))
        .map(r => ({ runId: r.runId, trials: r.summary.trialsCompleted, started: r.summary.startedAt }));
}

module.exports = {
    computePriors,
    summarizeMatchedRuns,
    DEFAULT_AGE_MS,
    MC_DIR,
};
