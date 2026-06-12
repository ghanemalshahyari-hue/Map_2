/**
 * Monte Carlo runner.
 *
 * Drives N independent trials through the 12-step wargame template, calling
 * the adjudicator agent step-by-step. Per-trial state is isolated; the
 * scenario template is read-only after loadScenario().
 *
 * Concurrency: a simple semaphore bounds the number of in-flight Ollama
 * calls (default parallelism=2). gpt-oss:20b on CPU is memory-bandwidth
 * bound; 2 saturates without thrashing.
 *
 * Storage:
 *   data/mc-runs/<runId>/trial-<NNN>.jsonl   — one JSON line per step
 *   data/mc-runs/<runId>/summary.json        — written when the run completes
 *
 * Progress is streamed to subscribers via an event-emitter; the HTTP SSE
 * handler in web-server.js pipes those events to the client.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const loader     = require('./scenario-loader');
const schema     = require('./adjudicator-schema');
const adjudicator = require('./adjudicator-agent');

const ROOT       = path.join(__dirname, '..', '..');
const DATA_DIR   = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
const MC_DIR     = path.join(DATA_DIR, 'mc-runs');

// In-memory registry of active and recently-completed runs. Keyed by runId.
// Runs survive process lifetime only; resume across restart needs file replay
// (out of scope for v1; trial JSONLs are still on disk).
const runs = new Map();

function ensureDir(p) {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function makeRunId() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rnd = Math.random().toString(36).slice(2, 8);
    return `run-${ts}-${rnd}`;
}

// ── Semaphore (concurrency limiter) ──────────────────────────────────
function semaphore(maxConcurrent) {
    const n = Math.max(1, maxConcurrent | 0);
    let inflight = 0;
    const waiters = [];

    function acquire() {
        return new Promise((resolve) => {
            if (inflight < n) { inflight++; resolve(); }
            else waiters.push(resolve);
        });
    }
    function release() {
        const next = waiters.shift();
        if (next) next();
        else inflight--;
    }
    return { acquire, release };
}

// ── Single trial walk ────────────────────────────────────────────────
async function runOneTrial(run, trialIdx, sem) {
    const scenario = run.scenario;
    const trialFile = path.join(run.dir, `trial-${String(trialIdx).padStart(3, '0')}.jsonl`);
    const trialStream = fs.createWriteStream(trialFile, { flags: 'a' });

    function writeLine(obj) {
        trialStream.write(JSON.stringify(obj) + '\n');
    }

    const trialId  = `${run.id}:t${trialIdx}`;
    const seedBase = (trialIdx * 1000);
    const hintId   = (trialIdx * 37 + 11) % adjudicator.TRIAL_HINTS.length;

    writeLine({
        kind: 'meta',
        trialId, trialIdx,
        seedBase, hintId,
        coa: run.coaParams,
        scenario: scenario.name,
        // Run-level context useful when learning from past trials (item #4).
        // The system-prompt hash + provider + model snapshot let us spot
        // drift; if the prompt is edited between two runs, replays here
        // and now will differ from replays after the edit.
        provider:    run.provider || null,
        model:       run.model || null,
        mockMode:    run.mockMode === true,
        startedAt:   new Date().toISOString(),
    });

    let prev = schema.freshState(scenario);
    writeLine({ kind: 'state', stepIndex: 0, state: prev, validation: { schema_ok: true, seeded: true } });

    let fallbackCount = 0;
    // Per-reason tally so the run summary can answer "which failure modes
    // dominate this COA?" — feeds the learning-store priors (items #5/#6).
    const fallbackReasons = {};

    const stepCount = Array.isArray(scenario.steps) ? scenario.steps.length : 12;
    const transitionCount = Math.max(0, stepCount - 1);
    for (let i = 1; i < stepCount; i++) {
        if (run.cancelled) {
            writeLine({ kind: 'cancelled', stepIndex: i, at: new Date().toISOString() });
            trialStream.end();
            return { trialIdx, cancelled: true };
        }

        await sem.acquire();
        let result;
        try {
            // Boundary plan Step 1: MC routes through the headless
            // propose+commit path so every per-trial state change is
            // journalled with source='llm-narrator' and operator_id=
            // 'system:mc-trial'. MC never reaches the operator-approval
            // surface; structural separation, not opt-in bypass.
            result = await adjudicator.adjudicateStepHeadless({
                scenario,
                stepIndex: i,
                prevState: prev,
                trialId,
                trialSeed: trialId,
                trialHintId: hintId,
                coaParams: run.coaParams,
                model:     run.model || null,
                timeoutMs: run.timeoutMs || null,
                mockMode:  run.mockMode === true,
                provider:  run.provider || null,
                runId:     run.id,
                headless:  { reason: 'mc-trial' },
            });
        } catch (err) {
            sem.release();
            writeLine({ kind: 'error', stepIndex: i, msg: err && err.message });
            trialStream.end();
            return { trialIdx, error: err && err.message };
        }
        sem.release();

        if (!result.ok) {
            fallbackCount++;
            const why = (result.validation && result.validation.fallback) || 'unknown';
            fallbackReasons[why] = (fallbackReasons[why] || 0) + 1;
        }
        prev = result.state;

        // item #4 — persist the full prompt the model saw + the raw text
        // it returned. Skipped in mock mode (no LLM call, nothing to log).
        // Written BEFORE the state row so the JSONL reads in causal order:
        // prompt → raw → state. Each event carries stepIndex so a reader
        // can stream or filter without reconstructing context.
        const isMockResult = !!(result.validation && result.validation.mocked);
        if (!isMockResult) {
            if (result.userPrompt) {
                writeLine({
                    kind: 'prompt',
                    stepIndex: i,
                    systemPromptHash:  result.meta && result.meta.systemPromptHash || null,
                    systemPromptChars: result.meta && result.meta.systemPromptChars || null,
                    userPrompt: result.userPrompt,
                });
            }
            if (result.rawLlm || result.rawText) {
                writeLine({
                    kind: 'raw',
                    stepIndex: i,
                    rawLlm:  result.rawLlm  || null,   // parsed JSON, when parse succeeded
                    rawText: result.rawText || null,   // raw model text, even on parse failure
                });
            }
        }

        writeLine({
            kind: 'state',
            stepIndex: i,
            state: result.state,
            validation: result.validation,
            meta: result.meta,
        });

        run.emitter.emit('progress', {
            runId: run.id,
            trial: trialIdx,
            step:  i,
            of:    transitionCount,
            time_label:        result.state.time_label,
            phase_line_km:     result.state.phase_line_km,
            objective_status:  result.state.objective_status,
            blue_destroyed:    result.state.losses_cumulative.blue_destroyed,
            fallback:          !result.ok,
        });
    }

    const outcome = {
        trialIdx,
        final_objective_status: prev.objective_status,
        final_phase_line_km:    prev.phase_line_km,
        final_blue_destroyed:   prev.losses_cumulative.blue_destroyed,
        final_red_coy_eq_losses:prev.losses_cumulative.red_company_equivalent,
        fallback_step_count:    fallbackCount,
        fallback_reasons:       fallbackReasons,
    };

    writeLine({ kind: 'done', ...outcome, endedAt: new Date().toISOString() });
    // Wait for the trial JSONL to flush to disk before resolving — otherwise
    // the parent batch can fire 'done' before files are readable.
    await new Promise((resolve) => trialStream.end(resolve));

    run.emitter.emit('trial-done', { runId: run.id, ...outcome });
    return outcome;
}

// ── Aggregation ──────────────────────────────────────────────────────
function emptyAggregate(scenarioName, model, trials, parallelism) {
    return {
        runId:            null,
        scenarioName,
        model,
        trialsRequested:  trials,
        trialsCompleted:  0,
        trialsFailed:     0,
        parallelism,
        outcomeCounts:    { CAPTURED: 0, DENIED: 0, THREATENED_terminal: 0, DORMANT_terminal: 0, other: 0 },
        finalPhaseLineKm: [],
        finalBlueDestroyed: [],
        finalRedCoyEqLosses: [],
        fallbackStepCounts: [],
        // run-wide per-reason fallback rollup (items #5/#6). Each reason
        // ('ollama_error', 'parse_failed', 'validation_failed', ...) maps
        // to the total step-occurrences across all trials in the run.
        fallbackReasonCounts: {},
        startedAt:        null,
        endedAt:          null,
        durationMs:       0,
    };
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
    return sorted[idx];
}

function summarizeNumeric(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    return {
        n:      sorted.length,
        min:    sorted[0],
        p10:    percentile(sorted, 10),
        p25:    percentile(sorted, 25),
        p50:    percentile(sorted, 50),
        p75:    percentile(sorted, 75),
        p90:    percentile(sorted, 90),
        max:    sorted[sorted.length - 1],
        mean:   sum / sorted.length,
    };
}

function finalizeAggregate(agg) {
    return {
        ...agg,
        outcomePct: Object.fromEntries(
            Object.entries(agg.outcomeCounts).map(([k, v]) => [k, agg.trialsCompleted ? v / agg.trialsCompleted : 0]),
        ),
        finalPhaseLineKm:     summarizeNumeric(agg.finalPhaseLineKm),
        finalBlueDestroyed:   summarizeNumeric(agg.finalBlueDestroyed),
        finalRedCoyEqLosses:  summarizeNumeric(agg.finalRedCoyEqLosses),
        fallbackStepCounts:   summarizeNumeric(agg.fallbackStepCounts),
    };
}

function classifyOutcome(outcome) {
    const obj = outcome.final_objective_status;
    if (obj === 'CAPTURED')   return 'CAPTURED';
    if (obj === 'DENIED')     return 'DENIED';
    if (obj === 'THREATENED') return 'THREATENED_terminal';
    if (obj === 'DORMANT')    return 'DORMANT_terminal';
    return 'other';
}

// ── Public: start a run ──────────────────────────────────────────────
function startBatch(args) {
    args = args || {};
    const scenarioName = args.scenarioName || loader.DEFAULT_NAME;
    const trials       = Math.max(1, Math.min(1000, args.trials | 0 || 20));
    const parallelism  = Math.max(1, Math.min(8, args.parallelism | 0 || 2));
    const coaParams    = args.coaParams || adjudicator.DEFAULT_COA;
    const model        = args.model     || null;
    const timeoutMs    = args.timeoutMs || null;
    const mockMode     = args.mockMode === true;
    const provider     = args.provider  || null;

    const scenario = loader.loadScenario(scenarioName);

    const runId = makeRunId();
    const dir   = path.join(MC_DIR, runId);
    ensureDir(dir);

    const emitter = new EventEmitter();
    emitter.setMaxListeners(64);

    const agg = emptyAggregate(scenarioName, model, trials, parallelism);
    agg.runId     = runId;
    agg.startedAt = new Date().toISOString();

    const run = {
        id:        runId,
        scenario,
        coaParams,
        model,
        timeoutMs,
        mockMode,
        provider,
        parallelism,
        trials,
        dir,
        emitter,
        aggregate: agg,
        cancelled: false,
        startedAt: Date.now(),
        promise:   null,
        outcomes:  [],
    };

    runs.set(runId, run);

    // Persist run-config alongside trial logs for replay.
    fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({
        runId, scenarioName, trials, parallelism, coaParams, model, mockMode,
        provider,
        startedAt: agg.startedAt,
    }, null, 2), 'utf8');

    const sem = semaphore(parallelism);
    const promises = [];
    for (let t = 0; t < trials; t++) {
        promises.push(runOneTrial(run, t, sem)
            .then(outcome => {
                if (outcome.cancelled) return;
                run.outcomes.push(outcome);
                if (outcome.error) {
                    agg.trialsFailed++;
                } else {
                    agg.trialsCompleted++;
                    const cls = classifyOutcome(outcome);
                    agg.outcomeCounts[cls] = (agg.outcomeCounts[cls] || 0) + 1;
                    agg.finalPhaseLineKm.push(outcome.final_phase_line_km);
                    agg.finalBlueDestroyed.push(outcome.final_blue_destroyed);
                    agg.finalRedCoyEqLosses.push(outcome.final_red_coy_eq_losses);
                    agg.fallbackStepCounts.push(outcome.fallback_step_count);
                    // Roll per-trial reason dict into the run-wide rollup.
                    for (const [reason, count] of Object.entries(outcome.fallback_reasons || {})) {
                        agg.fallbackReasonCounts[reason] = (agg.fallbackReasonCounts[reason] || 0) + count;
                    }
                }
            })
            .catch(err => {
                agg.trialsFailed++;
                run.emitter.emit('error', { runId, trialIdx: -1, msg: err && err.message });
            }));
    }

    run.promise = Promise.all(promises).then(() => {
        agg.endedAt    = new Date().toISOString();
        agg.durationMs = Date.now() - run.startedAt;
        // Stash COA + provider directly in the summary so the learning
        // store can filter past runs by `(scenarioName, posture,
        // reserve_commit_hour)` without joining against run.json.
        agg.coaParams  = run.coaParams;
        agg.provider   = run.provider || null;
        agg.mockMode   = run.mockMode === true;
        const summary  = finalizeAggregate(agg);
        fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
        run.emitter.emit('done', summary);
        return summary;
    });

    return { runId, dir };
}

// ── Public: subscribe to events ──────────────────────────────────────
function subscribe(runId, listener) {
    const run = runs.get(runId);
    if (!run) return null;
    const onProgress  = (e) => listener('progress',   e);
    const onTrialDone = (e) => listener('trial-done', e);
    const onDone      = (e) => listener('done',       e);
    const onError     = (e) => listener('error',      e);
    run.emitter.on('progress',   onProgress);
    run.emitter.on('trial-done', onTrialDone);
    run.emitter.on('done',       onDone);
    run.emitter.on('error',      onError);

    return function unsubscribe() {
        run.emitter.off('progress',   onProgress);
        run.emitter.off('trial-done', onTrialDone);
        run.emitter.off('done',       onDone);
        run.emitter.off('error',      onError);
    };
}

function cancel(runId) {
    const run = runs.get(runId);
    if (!run) return { ok: false, error: 'unknown runId' };
    run.cancelled = true;
    run.emitter.emit('error', { runId, msg: 'cancelled' });
    return { ok: true };
}

function getRunSummary(runId) {
    const run = runs.get(runId);
    if (!run) {
        // Try disk
        const file = path.join(MC_DIR, runId, 'summary.json');
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        return null;
    }
    return finalizeAggregate(run.aggregate);
}

function listRuns() {
    if (!fs.existsSync(MC_DIR)) return [];
    return fs.readdirSync(MC_DIR).filter(d => {
        const stat = fs.statSync(path.join(MC_DIR, d));
        return stat.isDirectory();
    });
}

module.exports = {
    startBatch,
    subscribe,
    cancel,
    getRunSummary,
    listRuns,
    MC_DIR,
};
