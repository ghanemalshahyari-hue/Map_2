/**
 * scenario-control-center.js — RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF
 *
 * The Scenario Control Center is a HARD REPLACEMENT for the old Free Fight control window. It is built
 * from scratch: a clean, explicit, panel-based operator flow with its OWN small state machine and its own
 * `scc-*` action ids. It does NOT reuse any of the old window's renderers, binders, diagnostics drawer,
 * COA-card UI, Generate-Commit-Run layout, or any old data-act id (all physically deleted in RMOOZ-...-AG).
 *
 * It owns ONLY the operator UI/flow. It drives the (unchanged) engine — Step-1 taskability gate, COA
 * quality gate, /plan-coas generation, COA commit/execution, continuous scenario, Green/White adjudication,
 * decision log — exclusively through the clean facade `window.RmoozFreeFightDemo.engine`. It never reaches
 * into engine internals and never renders the old window.
 *
 * Operator flow:   Readiness → Prepare COA → COA Review → Commit Order → Run Scenario → Observe → After-action
 * Top-level states: no_scenario · step1_review_required · ready_to_generate · generating_coa · coa_review ·
 *                   committed · scenario_running · scenario_paused · scenario_blocked · scenario_complete
 *
 * One source of truth (all read from the engine): selected COA (engine.selectedIdx/coaPlan),
 * committed COA (engine.committedExec), scenario runtime (engine.scenarioRuntime). No restored committed
 * COA may shadow a newly selected plan (engine.committedIsStale forces re-commit). Clear resets all three.
 */
(function (global) {
    'use strict';

    var C = {
        bg: '#081320', panel: '#0b1a2b', edge: '#274b69', edgeSoft: '#1d3a52', ink: '#dfe9f3',
        dim: '#8fa5b8', accent: '#9ec2ec', good: '#7fd6a0', warn: '#e0a93a', bad: '#f0707a', chip: '#13314f',
    };
    var evidenceOpen = false;   // Panel 6 collapsed by default

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function arr(x) { return Array.isArray(x) ? x : []; }
    function allActions(coa) { var o = []; arr(coa && coa.phases).forEach(function (p) { arr(p.actions).forEach(function (a) { if (a) o.push(a); }); }); return o; }
    function engine() {
        // Browser: window === globalThis. Node tests: the demo lives on global.window, not globalThis.
        var w = (typeof window !== 'undefined' && window) || global;
        var d = (w && w.RmoozFreeFightDemo) || (global && global.RmoozFreeFightDemo);
        return (d && d.engine) || null;
    }

    // ── state machine ──────────────────────────────────────────────────────────────────────────────────
    function sccState(eng) {
        if (eng.isLoading()) return 'generating_coa';
        var scn = eng.scenarioRuntime();
        if (scn && scn.scenario_active) {
            if (scn.scenario_status === 'complete') return 'scenario_complete';
            if (scn.scenario_status === 'paused') return 'scenario_paused';
            if (scn.scenario_status === 'blocked' || scn.pending_replan_reason) return 'scenario_blocked';
            return 'scenario_running';
        }
        var ex = eng.committedExec();
        if (ex && ex.active && !eng.committedIsStale()) {
            if (ex.replan_required) return 'scenario_blocked';
            if (ex.phase_status === 'complete') return 'scenario_complete';
            return 'committed';
        }
        var plan = eng.coaPlan();
        if (plan && plan._step1_blocked) return 'step1_review_required';
        var hasPlan = !!(plan && plan.ok && arr(plan.coas).length);
        if (hasPlan) return 'coa_review';
        var rd = eng.readiness();
        if (!rd.units_loaded && !rd.objective_set) return 'no_scenario';
        if (!rd.executable) return 'step1_review_required';
        return 'ready_to_generate';
    }
    var STATE_LABEL = {
        no_scenario: 'No scenario', step1_review_required: 'Source review required', ready_to_generate: 'Ready to prepare',
        generating_coa: 'Preparing COA…', coa_review: 'COA review', committed: 'Committed',
        scenario_running: 'Running', scenario_paused: 'Paused', scenario_blocked: 'Blocked', scenario_complete: 'Complete',
    };
    var STATE_COLOR = {
        generating_coa: C.warn, scenario_running: C.good, scenario_complete: C.good, scenario_paused: '#cdb86a',
        scenario_blocked: C.bad, step1_review_required: C.bad, committed: C.accent, coa_review: C.accent,
        ready_to_generate: C.accent, no_scenario: C.dim,
    };
    var FLOW = [['1', 'Readiness'], ['2', 'Prepare'], ['3', 'Review'], ['4', 'Commit'], ['5', 'Run']];
    function flowStepFor(state) {
        return ({ no_scenario: 1, step1_review_required: 1, ready_to_generate: 2, generating_coa: 2, coa_review: 3,
            committed: 4, scenario_running: 5, scenario_paused: 5, scenario_blocked: 5, scenario_complete: 5 })[state] || 1;
    }

    // ── small UI atoms ───────────────────────────────────────────────────────────────────────────────────
    function safeRead(fn, fallback) {
        try {
            if (typeof fn !== 'function') return fallback;
            var value = fn();
            return value == null ? fallback : value;
        } catch (_) { return fallback; }
    }
    function lastOf(list) {
        list = arr(list);
        return list.length ? list[list.length - 1] : null;
    }
    function selectedCoaFromExec(ex) {
        return (ex && (ex.selected_coa || ex.selectedCoa || ex.coa || ex.plan)) || null;
    }
    function currentPhaseName(ex) {
        var idx = Number(ex && ex.current_phase_index);
        if (!isFinite(idx) || idx < 0) idx = 0;
        var coa = selectedCoaFromExec(ex);
        var phase = arr(coa && coa.phases)[idx] || null;
        return (phase && (phase.phase || phase.name || phase.title || phase.label || phase.id)) || null;
    }
    function selectedCoaId(ex) {
        var coa = selectedCoaFromExec(ex);
        return (ex && (ex.selected_coa_id || ex.coa_id || ex.plan_id)) ||
            (coa && (coa.plan_id || coa.id || coa.name)) || null;
    }
    function summarizeMovementDebug(rows) {
        var out = { total: 0, moved: 0, blocked: 0, ai_behavior: 0, staff_safe: 0 };
        arr(rows).forEach(function (r) {
            out.total += 1;
            if (r && (r.moved || r.moved_this_tick || r.moved_km_this_tick)) out.moved += 1;
            if (r && r.blocked_reason) out.blocked += 1;
            var src = String((r && r.source) || '');
            if (src === 'ai_behavior' || src === 'degraded_behavior_repaired') out.ai_behavior += 1;
            if (/staff_safe/.test(src)) out.staff_safe += 1;
        });
        return out;
    }
    function decisionSummary(d) {
        if (!d) return null;
        return [d.role || d.actor || '?', d.action || d.decision || '?'].join(' / ') +
            (d.result_summary || d.reason ? ' - ' + (d.result_summary || d.reason) : '');
    }
    function movementSummary(m) {
        if (!m) return null;
        var to = m.to ? (' -> ' + [m.to.lat, m.to.lon].filter(function (v) { return v != null; }).join(',')) : '';
        return String(m.uid || m.unit_uid || '?') + to;
    }
    function runtimeSpeedLabel(ex) {
        var c = ex && ex.clock;
        if (c && isFinite(+c.speed)) return 'x' + (Math.round(+c.speed * 10) / 10);
        return 'x1';
    }
    function eventHoursLabel(hours) {
        if (!isFinite(+hours)) return '—';
        var h = Math.round(+hours * 10) / 10;
        return h === 0 ? 'H' : ('H' + (h < 0 ? '' : '+') + h);
    }
    function nextRuntimeEventLabel(ex) {
        var rt = ex && ex.runtime_events;
        if (rt && isFinite(+rt.next_event_hours)) return eventHoursLabel(+rt.next_event_hours);
        var due = arr(rt && rt.last_due);
        var dps = arr(rt && rt.last_due_decision_points);
        var last = due[0] || dps[0] || null;
        return last ? ('last: ' + (last.title || last.id || 'runtime event')) : '—';
    }
    function runtimeStateLabel(state, scn, ex) {
        if (scn && scn.scenario_status) return STATE_LABEL[state] || scn.scenario_status;
        if (ex && ex.replan_required) return 'Blocked';
        if (ex && ex.paused) return 'Paused';
        if (ex && ex.phase_status === 'complete') return 'Complete';
        return STATE_LABEL[state] || state || 'Ready';
    }
    function reviewCheckpointsHtml(scn, ex) {
        return '';
        var phase = currentPhaseName(ex) || (ex ? ('phase ' + ((Number(ex.current_phase_index) || 0) + 1)) : '—');
        var c = ex && ex.clock;
        var pointer = (c && isFinite(+c.display_step) && +c.display_step >= 0) ? ('frame ' + (+c.display_step + 1)) : 'clock-derived';
        return '<details data-scc="review-checkpoints" style="margin-top:7px;border:1px solid ' + C.edgeSoft + ';border-radius:5px;padding:5px 7px;background:#071421;">' +
            '<summary style="cursor:pointer;color:' + C.dim + ';font-size:10px;font-weight:700;">Internal authored frames</summary>' +
            '<div style="margin-top:5px;">' +
            kv('Internal frame', String((scn && scn.scenario_turn) || 0), C.dim) +
            kv('Internal group', phase, C.dim) +
            kv('Frame pointer', pointer, C.dim) +
            note('Runtime is controlled by scenario time. These details are internal compatibility data, not the scenario run model.', C.dim) +
            '</div></details>';
    }
    function runSnapshot() {
        var eng = engine();
        if (!eng) {
            return {
                version: '1.0.0-cmo-wargame-run-instrumentation-1',
                read_only: true,
                available: false,
                state: 'no_scenario',
                state_label: STATE_LABEL.no_scenario,
                flow_step: 1,
                reason: 'Scenario Control Center engine unavailable'
            };
        }
        var state = safeRead(function () { return sccState(eng); }, 'no_scenario');
        var scn = safeRead(function () { return eng.scenarioRuntime ? eng.scenarioRuntime() : null; }, null) || {};
        var ex = safeRead(function () { return eng.committedExec ? eng.committedExec() : null; }, null) || {};
        var readiness = safeRead(function () { return eng.readiness ? eng.readiness() : null; }, null) || {};
        var trace = arr(safeRead(function () { return eng.executedTrace ? eng.executedTrace() : []; }, []));
        var movementDebug = arr(safeRead(function () { return eng.movementDebug ? eng.movementDebug() : []; }, []));
        var decisionLog = arr(safeRead(function () { return eng.decisionLog ? eng.decisionLog() : []; }, []));
        var networkCalls = arr(safeRead(function () { return eng.networkCalls ? eng.networkCalls() : []; }, []));
        var runBlockedReason = safeRead(function () { return eng.runBlockedReason ? eng.runBlockedReason() : null; }, null);
        var whiteOutcome = safeRead(function () { return eng.whiteOutcome ? eng.whiteOutcome() : null; }, null) || {};
        var greenStatus = safeRead(function () { return eng.greenStatus ? eng.greenStatus() : null; }, null) || {};
        var latestDecision = lastOf(decisionLog);
        var latestMovement = lastOf(trace);
        var pendingReplan = scn.pending_replan_reason || ex.pending_replan_reason ||
            (ex.replan_required ? 'Committed COA requires replan' : null);

        return {
            version: '1.0.0-cmo-wargame-run-instrumentation-1',
            read_only: true,
            available: true,
            state: state,
            state_label: STATE_LABEL[state] || state,
            flow_step: flowStepFor(state),
            scenario_active: !!scn.scenario_active,
            scenario_status: scn.scenario_status || null,
            scenario_turn: Number(scn.scenario_turn || 0),
            current_actor: scn.current_actor || null,
            objective_control: scn.objective_control || null,
            pending_replan_reason: pendingReplan || null,
            end_condition: scn.end_condition || null,
            selected_coa_id: selectedCoaId(ex),
            current_phase_index: Number(ex.current_phase_index || 0),
            current_phase_name: currentPhaseName(ex),
            phase_status: ex.phase_status || null,
            auto_continue: !!safeRead(function () { return eng.autoContinueEnabled ? eng.autoContinueEnabled() : false; }, false),
            run_blocked_reason: runBlockedReason || null,
            white_outcome_summary: whiteOutcome.summary || whiteOutcome.status || whiteOutcome.result || null,
            green_status_summary: greenStatus.summary || greenStatus.status || greenStatus.label || null,
            movement_trace_count: trace.length,
            movement_debug_count: movementDebug.length,
            movement_summary: summarizeMovementDebug(movementDebug),
            decision_log_count: decisionLog.length,
            network_call_count: networkCalls.length,
            latest_decision_summary: decisionSummary(latestDecision),
            latest_movement_summary: movementSummary(latestMovement),
            readiness: {
                executable: !!readiness.executable,
                taskable: Number(readiness.taskable || 0),
                blocked: Number(readiness.blocked || 0),
                message: readiness.message || null,
                scenario_name: readiness.scenario_name || null,
                data_reliability: readiness.data_reliability || null,
                source_status: readiness.source_status || null,
                training_approved: !!readiness.training_approved
            }
        };
    }

    function btnPri(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#15301f;color:' + C.good + ';border-radius:6px;padding:8px 15px;font-size:12.5px;font-weight:700;">' + label + '</button>'; }
    function btnSec(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#9fb8c8;border-radius:6px;padding:7px 12px;font-size:11px;">' + label + '</button>'; }
    function btnWarn(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #7a3030;background:#241414;color:' + C.bad + ';border-radius:6px;padding:7px 12px;font-size:11px;">' + label + '</button>'; }
    function btnGuide() { return '<button data-act="scc-cmo-guide" title="Open the CMO readiness, test-card, and live-run guide in Scenario Evidence" style="font:inherit;cursor:pointer;border:1px solid #2d5f7c;background:#0d2033;color:#9ec2ec;border-radius:10px;padding:3px 9px;font-size:9.5px;font-weight:800;">CMO Test Guide</button>'; }
    function panel(n, title, inner, accent) {
        var col = accent || C.edge;
        return '<section data-scc-panel="' + n + '" style="margin:8px 0;border:1px solid ' + col + ';border-radius:8px;background:' + C.panel + ';overflow:hidden;">' +
            '<header style="display:flex;align-items:center;gap:7px;padding:7px 11px;background:#0a1422;border-bottom:1px solid ' + C.edgeSoft + ';">' +
            '<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;background:' + col + ';color:#06101c;font-size:10px;font-weight:800;">' + n + '</span>' +
            '<span style="font-size:11.5px;font-weight:700;color:' + C.accent + ';letter-spacing:.3px;">' + esc(title) + '</span></header>' +
            '<div style="padding:9px 11px;">' + inner + '</div></section>';
    }
    function kv(label, val, col) { return '<div style="font-size:10.5px;color:' + C.dim + ';margin:1px 0;">' + esc(label) + ': <span style="color:' + (col || C.ink) + ';font-weight:600;">' + esc(val) + '</span></div>'; }
    function note(txt, col) { return '<div style="margin-top:5px;font-size:10px;color:' + (col || C.dim) + ';line-height:1.5;">' + txt + '</div>'; }
    function openCmoTestGuide() {
        var g = (typeof globalThis !== 'undefined' && globalThis) || (typeof global !== 'undefined' && global) || null;
        var w = (typeof window !== 'undefined' && window) || g;
        var usp = (w && w.AppUnitStatusPanel) || (g && g.AppUnitStatusPanel);
        if (usp && typeof usp.openScenarioEvidenceTarget === 'function') {
            usp.openScenarioEvidenceTarget('cmo');
            return true;
        }
        return false;
    }

    // ── header + flow strip ──────────────────────────────────────────────────────────────────────────────
    function headerHtml(state) {
        var col = STATE_COLOR[state] || C.accent;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
            '<span style="font-size:13px;font-weight:800;color:' + C.accent + ';letter-spacing:.3px;">🎯 Scenario Control Center</span>' +
            '<span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">' +
            btnGuide() +
            '<span data-scc-state="' + state + '" style="font-size:9.5px;font-weight:700;color:' + col + ';background:#0c1622;border:1px solid ' + C.edge + ';border-radius:10px;padding:2px 9px;">' + esc(STATE_LABEL[state] || state) + '</span></span></div>';
    }
    function flowHtml(state) {
        var cur = flowStepFor(state);
        var h = '<div data-scc="flow" style="display:flex;gap:3px;flex-wrap:wrap;align-items:center;margin-bottom:8px;padding:5px 7px;border:1px solid ' + C.edgeSoft + ';border-radius:6px;background:#0a1320;">';
        FLOW.forEach(function (s, i) {
            var n = +s[0]; var st = n < cur ? 'done' : (n === cur ? 'current' : 'todo');
            var col = st === 'current' ? '#cfe6ff' : (st === 'done' ? '#5a9a70' : '#5a6f80');
            var bg = st === 'current' ? '#13314f' : 'transparent';
            h += '<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;color:' + col + ';border:1px solid ' + (st === 'current' ? '#3a6fa0' : '#243443') + ';background:' + bg + ';border-radius:10px;padding:2px 7px;' + (st === 'current' ? 'font-weight:700;' : '') + '"><b>' + (st === 'done' ? '✓' : s[0]) + '</b> ' + s[1] + '</span>';
            if (i < FLOW.length - 1) h += '<span style="color:#3a4a59;font-size:9px;">→</span>';
        });
        return h + '</div>';
    }

    // ── Panel 1 — Scenario Readiness ─────────────────────────────────────────────────────────────────────
    function panel1Readiness(eng) {
        var r = eng.readiness();
        var execCol = r.executable ? (r.blocked ? C.warn : C.good) : C.bad;
        var inner = kv('Scenario', r.scenario_name, C.ink) +
            kv('Data reliability', r.data_reliability, r.data_reliability === 'operational' ? C.good : (r.data_reliability === 'none' ? C.dim : C.warn)) +
            kv('Source status', r.source_status, r.source_status === 'sourced' ? C.good : C.warn) +
            kv('Doctrine status', r.doctrine_status, /required$/.test(r.doctrine_status) ? C.warn : C.dim) +
            kv('Commander review', r.commander_review_status, r.commander_review_status === 'pending' ? C.warn : C.dim) +
            '<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">' +
            '<span data-scc="taskable-count" style="font-size:11px;color:' + C.good + ';font-weight:700;">✓ ' + r.taskable + ' taskable</span>' +
            '<span data-scc="blocked-count" style="font-size:11px;color:' + (r.blocked ? C.bad : C.dim) + ';font-weight:700;">⛔ ' + r.blocked + ' blocked</span></div>';
        if (r.blocked) {
            inner += '<div style="margin-top:3px;font-size:9.5px;color:' + C.dim + ';">Blocked by — source ' + r.blocked_by_missing_source + ' · coords ' + r.blocked_by_missing_coordinates + ' · doctrine ' + r.blocked_by_missing_doctrine + ' · commander ' + r.blocked_by_commander_review + '</div>';
            inner += '<div style="margin-top:3px;font-size:9.5px;color:#9fb8c8;">Held (review-only): ' + arr(r.blocked_units).slice(0, 6).map(function (b) { return esc(String(b.id)) + ' (' + esc(b.review_status) + ')'; }).join(' · ') + (r.blocked_units.length > 6 ? ' …' : '') + '</div>';
        }
        if (!r.executable && r.units_loaded) inner += '<div data-scc="no-exec" style="margin-top:6px;padding:6px 9px;border:1px solid ' + C.bad + ';border-radius:5px;background:#1f0d0d;color:' + C.bad + ';font-size:11px;font-weight:700;">No executable COA. Source review required.</div>';
        if (!r.units_loaded) inner += note('No units loaded — load a scenario / Step-1 ORBAT to begin.', C.dim);
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK — explicit operator training-simulation approval (Panel 1).
        // Offered ONLY when units are review-only but training-eligible (blocked by source/doctrine/commander,
        // NOT by missing coordinates). It does NOT lower the gate: it tasks review-only units in SIMULATION
        // mode only, loudly labelled "not source-verified", and the override is recorded in Evidence.
        if (r.training_approved && r.simulation_taskable > 0) {
            inner += '<div data-scc="sim-only-label" style="margin-top:7px;padding:7px 10px;border:1.5px solid #d98a2b;border-radius:6px;background:#241704;color:#f1b84c;font-size:11px;font-weight:800;letter-spacing:.2px;">⚠ SIMULATION ONLY — not source-verified</div>' +
                '<div style="margin-top:3px;font-size:9.5px;color:#d6b483;">' + r.simulation_taskable + ' review-only unit(s) approved for training; source / commander flags remain recorded in Evidence. This is NOT an approved operational order.</div>' +
                '<div style="margin-top:6px;">' + btnWarn('scc-clear-training', '↩ Clear training approval', 'Revert — review-only units are blocked again') + '</div>';
        } else if (!r.executable && r.units_loaded && r.training_eligible > 0) {
            inner += '<div data-scc="training-offer" style="margin-top:7px;padding:7px 10px;border:1px dashed #b07d2a;border-radius:6px;background:#1c1608;">' +
                '<div style="font-size:10.5px;color:#e8d28a;font-weight:700;">Training simulation</div>' +
                '<div style="margin-top:2px;font-size:9.5px;color:#c9b483;">' + r.training_eligible + ' unit(s) are review-only (source / doctrine / commander pending) but have a verified position. Approve them for a <b>training simulation</b> to run a COA now — clearly marked <b>SIMULATION ONLY — not source-verified</b>. Units missing coordinates stay blocked.</div>' +
                '<div style="margin-top:6px;">' + btnPri('scc-approve-training', '✅ Approve Draft for Training Simulation', 'Tasks review-only units in SIMULATION mode only — recorded in Evidence; does not source-verify them') + '</div></div>';
        }
        // objective placement (the loaded scenario usually carries one; offer placement when it does not)
        inner += '<div style="margin-top:7px;display:flex;gap:6px;align-items:center;">' +
            (r.objective_set
                ? '<span data-scc="obj-set" style="font-size:10px;color:' + C.good + ';">◎ Objective set</span> ' + btnSec('scc-clear-obj', '↻ Re-place objective')
                : btnSec('scc-place-obj', '◎ Place Objective X', 'Click the map to set the objective')) + '</div>';
        return panel('1', 'Scenario Readiness', inner, execCol);
    }

    // ── Panel 2 — Prepare COA ────────────────────────────────────────────────────────────────────────────
    function panel2Prepare(eng, state) {
        var r = eng.readiness();
        var inner;
        if (state === 'generating_coa') {
            inner = '<div data-scc="generating" style="display:flex;align-items:center;gap:8px;font-size:12px;color:' + C.warn + ';font-weight:700;">' +
                '<span style="display:inline-block;width:12px;height:12px;border:2px solid ' + C.warn + ';border-top-color:transparent;border-radius:50%;"></span> Preparing COA — running the AI commander…</div>' +
                note('Source gate · taskability resolver · ROE/doctrine · quality requirements ran first; fast-depth AI (analyst skipped) — ~2–5 min on CPU, ~15–30s with GPU. Switch to llama3.2:1b in the header for faster results.', C.dim);
        } else if (!r.executable) {
            inner = '<button data-act="scc-prepare" disabled style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:6px;padding:8px 15px;font-size:12.5px;opacity:.5;">⚙ Prepare COA</button>' +
                note('Prepare COA is blocked: <b>' + esc(r.message || 'Source review required') + '</b> Complete source / doctrine / commander review (Panel 1), then re-check.', C.warn) +
                '<div style="margin-top:6px;">' + btnSec('scc-recheck', '↻ Re-check readiness') + '</div>';
        } else {
            // RMOOZ-PREPARE-COA-PRODUCT-FLOW-A: one primary operator action plus
            // collapsed advanced controls. The strict AI-only and deterministic
            // Staff-Safe buttons remain real functions, but no longer compete with
            // the primary visible "Prepare COA" path.
            var _ar = null; try { _ar = (typeof eng.aiReadiness === 'function') ? eng.aiReadiness() : null; } catch (_) {}
            var _mi = null; try { _mi = (typeof eng.aiModelInfo === 'function') ? eng.aiModelInfo() : null; } catch (_) {}
            var _aiOk = !!(_ar && _ar.ok);
            var _arPending = !!(_ar && !_ar.ok && _ar.code === 'health_pending');
            // ── 1. Smart "Prepare COA" button — always enabled ───────────────────────────────────────────
            var _smartSubtitle = _arPending ? 'checking AI…' : (_aiOk ? 'AI ready' : 'will use Staff-Safe');
            var _smartLabel = 'Prepare COA <span style="font-size:9px;opacity:.7;">(' + _smartSubtitle + ')</span>';
            var _smartBtn = '<button data-act="scc-prepare-smart" title="Always generates a plan — uses AI when ready, Staff-Safe when not" style="font:inherit;cursor:pointer;border:1px solid #2a6e3a;background:#0e2818;color:#6de098;border-radius:6px;padding:8px 15px;font-size:12.5px;font-weight:700;">' + _smartLabel + '</button>';
            // ── Provider / model detail card (always shown) ──────────────────────────────────────────────
            var _prov = (_mi && (_mi.configured_provider || _mi.provider)) || (_ar && _ar.provider) || '…';
            var _selModel = (_mi && _mi.selected_model) || '…';
            var _modelAvailStr = (_mi && _mi.model_available != null) ? String(_mi.model_available) : 'pending';
            var _modelAvailCol = (_mi && _mi.model_available === true) ? C.good : ((_mi && _mi.model_available === false) ? C.bad : C.warn);
            var _reasonStr = (!_aiOk && !_arPending && _ar) ? (_ar.reason || '') : '';
            var _providerCard = '<div data-scc="ai-provider-detail" style="margin-top:6px;margin-bottom:7px;padding:6px 9px;border-radius:5px;border:1px solid ' + C.edgeSoft + ';background:#08121d;font-size:9.5px;">' +
                kv('provider', _prov, _aiOk ? C.good : C.warn) +
                kv('selected_model', _selModel, C.ink) +
                kv('model_available', _modelAvailStr, _modelAvailCol) +
                (_reasonStr ? kv('reason', _reasonStr, C.bad) : '') +
                '</div>';
            // ── Cloud model / local provider mismatch actions ────────────────────────────────────────────
            var _isMismatch = !!(_ar && (_ar.code === 'cloud_model_local_provider' || _ar.code === 'pair_incoherent'));
            var _isCloudDisabled = !!(_ar && !_aiOk && !_arPending && !_isMismatch && _ar.msg && /cloud/i.test(String(_ar.msg)));
            var _mismatchHtml = _isMismatch
                ? '<div data-scc="ai-mismatch" style="margin-bottom:5px;padding:7px 10px;border:1.5px solid ' + C.warn + ';border-radius:5px;background:#1c1500;font-size:10.5px;color:' + C.warn + ';font-weight:700;">Cloud model selected but provider is Ollama. Choose local model or switch to OpenRouter.</div>' +
                  '<div style="margin-bottom:7px;display:flex;gap:6px;flex-wrap:wrap;">' +
                  btnSec('scc-use-local-model', '↩ Choose local Ollama model') + ' ' +
                  btnSec('scc-use-openrouter', '☁ Use OpenRouter/cloud') + '</div>'
                : '';
            var _cloudDisabledHtml = _isCloudDisabled
                ? note('Cloud AI disabled. Enable RMOOZ_ALLOW_CLOUD_AI=1 and OPENROUTER_API_KEY.', C.warn) : '';
            // ── Non-mismatch / non-cloud block message ───────────────────────────────────────────────────
            var _blockMsgHtml = (!_isMismatch && !_isCloudDisabled && !_aiOk && !_arPending && _ar && _ar.msg)
                ? note(esc(String(_ar.msg).split('\n')[0]), C.warn) : '';
            // ── Previous AI failure ──────────────────────────────────────────────────────────────────────
            var _prevPlan = null; try { _prevPlan = eng.coaPlan(); } catch (_) {}
            var _planErr = (_prevPlan && _prevPlan.ok === false && _prevPlan._requestedVia === 'manual_generate')
                ? (_prevPlan._error || _prevPlan._quality_gate_message || null) : null;
            var _planErrHtml = _planErr
                ? '<div data-scc="ai-plan-error" style="margin-bottom:7px;padding:6px 9px;border-radius:5px;border:1.5px solid ' + C.bad + ';background:#1f0d0d;font-size:10px;color:' + C.bad + ';font-weight:700;">' + esc(_planErr) + '</div>'
                : '';
            // ── 2. Strict "Generate Real AI COA" — disabled with exact reason when AI blocked ────────────
            var _strictTitle = _aiOk ? 'Calls the AI model only — never falls back to deterministic' : esc((_ar && _ar.msg) || (_ar && _ar.reason) || 'AI not ready');
            var _strictBtn = _aiOk
                ? btnSec('scc-prepare-ai', '⚡ Generate Real AI COA', _strictTitle)
                : '<button data-act="scc-prepare-ai" disabled title="' + _strictTitle + '" style="font:inherit;cursor:not-allowed;border:1px solid #3a3020;background:#14110a;color:#7a7050;border-radius:6px;padding:7px 13px;font-size:11.5px;opacity:.6;">⚡ Generate Real AI COA</button>';
            var _advancedControls = '<details data-scc="advanced-planning-controls" style="margin-top:7px;border:1px dashed ' + C.edgeSoft + ';border-radius:6px;padding:6px 8px;background:#080f17;">' +
                '<summary style="cursor:pointer;color:' + C.dim + ';font-size:10.5px;font-weight:700;">Advanced planning controls</summary>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;">' +
                _strictBtn + ' ' +
                btnSec('scc-prepare-staffsafe', '🛡 Staff-Safe Now', 'Deterministic role-separated COA — always works, no AI') +
                '</div>' +
                note('<b>Prepare COA</b> always gives a plan (AI when ready, Staff-Safe otherwise). <b>Generate Real AI COA</b> is AI-only — never deterministic. <b>Staff-Safe Now</b> is always fast and deterministic.', C.dim) +
                '</details>';
            inner = _planErrHtml +
                _smartBtn +
                _providerCard +
                _mismatchHtml + _cloudDisabledHtml + _blockMsgHtml +
                _advancedControls;
        }
        return panel('2', 'Prepare COA', inner, state === 'generating_coa' ? C.warn : C.edge);
    }

    // ── Panel 3 — COA Review ─────────────────────────────────────────────────────────────────────────────
    function targetTable(eng, coa) {
        var rows = eng.actionTargets(coa);
        if (!rows.length) return note('No actions in this COA.', C.dim);
        var h = '<div style="overflow-x:auto;margin-top:5px;"><table data-scc="target-table" style="border-collapse:collapse;font-size:9.5px;width:100%;min-width:600px;">' +
            '<thead><tr style="color:' + C.dim + ';text-align:left;">' +
            ['unit', 'role', 'action', 'target', 'lat', 'lon', 'km→obj', 'taskable', 'ROE', 'reason'].map(function (h) { return '<th style="border-bottom:1px solid ' + C.edgeSoft + ';padding:2px 6px;font-weight:600;white-space:nowrap;">' + h + '</th>'; }).join('') +
            '</tr></thead><tbody>';
        rows.forEach(function (r) {
            var tcol = r.taskable ? C.ink : C.bad;
            h += '<tr style="color:' + C.ink + ';">' +
                '<td style="padding:2px 6px;white-space:nowrap;">' + esc(r.unit_uid) + '</td>' +
                '<td style="padding:2px 6px;">' + esc(r.role) + '</td>' +
                '<td style="padding:2px 6px;white-space:nowrap;">' + esc(r.action) + '</td>' +
                '<td style="padding:2px 6px;">' + esc(r.target_type) + '</td>' +
                '<td style="padding:2px 6px;color:' + C.dim + ';">' + (r.target_lat == null ? '—' : r.target_lat) + '</td>' +
                '<td style="padding:2px 6px;color:' + C.dim + ';">' + (r.target_lon == null ? '—' : r.target_lon) + '</td>' +
                '<td style="padding:2px 6px;color:' + C.dim + ';">' + (r.km_from_objective == null ? '—' : r.km_from_objective) + '</td>' +
                '<td style="padding:2px 6px;color:' + tcol + ';font-weight:700;">' + (r.taskable ? 'yes' : 'no') + '</td>' +
                '<td style="padding:2px 6px;color:' + (r.roe_status === 'review-required' ? C.bad : C.dim) + ';white-space:nowrap;">' + esc(r.roe_status) + '</td>' +
                '<td style="padding:2px 6px;color:' + C.dim + ';">' + esc(r.reason || '—') + '</td></tr>';
        });
        return h + '</tbody></table></div>';
    }
    function coaReviewCard(eng, plan, coa, i, selIdx, recIdx) {
        var sel = (i === selIdx);
        var id = (coa.plan_id) || ('COA-' + (i + 1));
        var q = coa._quality || eng.coaQuality(coa);
        var hardBlock = eng.hardBlockReason(coa);
        var blockedUnit = eng.tasksBlockedUnit(coa);
        var executable = !hardBlock && !blockedUnit;
        var border = sel ? '#4a9ed6' : (i === recIdx ? '#2e7d54' : '#2a3f55');
        var llmCalled = !!plan.llm_called || plan.plan_source === 'llm';
        var verdict = executable ? (q && q.pass ? 'commander-quality: PASS' : 'commander-quality: marginal') : 'NOT executable';
        var vcol = executable ? (q && q.pass ? C.good : C.warn) : C.bad;
        var h = '<div data-act="scc-select-' + i + '" data-scc-coa="' + i + '"' + (sel ? ' data-scc-selected="1"' : '') + ' style="cursor:pointer;border:' + (sel ? '2px' : '1px') + ' solid ' + border + ';border-radius:7px;background:' + (sel ? '#0a1c33' : '#0c141d') + ';padding:8px 10px;margin-bottom:7px;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">' +
            '<span style="font-weight:700;font-size:11.5px;color:' + C.ink + ';">' + (sel ? '▶ ' : '') + esc(id) + ' — ' + esc(coa.title || '') + '</span>' +
            '<span style="display:flex;gap:4px;">' + (i === recIdx ? '<span style="background:#1a5030;color:' + C.good + ';border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700;">★ Recommended</span>' : '') + (sel ? '<span style="background:' + C.chip + ';color:#cfe6ff;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700;">Selected</span>' : '') + '</span></div>';
        // RMOOZ-AI-COA-HONESTY-A: prominent AI / NOT-AI badge — visible without opening Evidence panel
        var _isRealAi = false; try { _isRealAi = !!eng.isRealLlm(plan); } catch (_) {}
        var _isPlanningModeSS = String(plan.planning_mode || '').toLowerCase() === 'staff_safe';
        var _aiBadgeColor = _isRealAi ? C.good : (_isPlanningModeSS ? C.dim : C.warn);
        var _aiBadgeLabel = _isRealAi
            ? '🤖 REAL AI COA — plan_source=llm · llm_called=true · llm_status=ok'
            : (_isPlanningModeSS
                ? '🛡 STAFF-SAFE — deterministic · llm_called=false'
                : '⚠ NOT AI — ' + esc(plan.plan_source || 'deterministic') + (llmCalled ? ' · fallback_used=true · ' + esc(plan.llm_status || '') : ' · llm_called=false'));
        h += '<div data-scc="ai-badge" style="margin-top:4px;margin-bottom:2px;padding:3px 8px;border-radius:4px;border:1px solid ' + _aiBadgeColor + ';background:' + (_isRealAi ? '#0a1f14' : (_isPlanningModeSS ? '#0e1a26' : '#1c1500')) + ';font-size:9.5px;font-weight:700;color:' + _aiBadgeColor + ';">' + _aiBadgeLabel + '</div>';
        h += '<div style="margin-top:2px;font-size:9.5px;color:' + C.dim + ';">source <b style="color:' + C.ink + ';">' + esc(plan.plan_source || '—') + '</b> · llm_called <b style="color:' + C.ink + ';">' + (llmCalled ? 'true' : 'false') + '</b> · llm_status <b style="color:' + C.ink + ';">' + esc(plan.llm_status || '—') + '</b> · <b style="color:' + vcol + ';">' + esc(verdict) + (q ? ' (' + q.score + ')' : '') + '</b></div>';
        h += '<div style="font-size:9.5px;color:' + C.dim + ';">risk <b style="color:' + C.ink + ';">' + esc(coa.risk || '—') + '</b> · confidence <b style="color:' + C.ink + ';">' + esc(coa.confidence || '—') + '</b></div>';
        // hard fail message
        if (!executable) {
            var reason = blockedUnit ? ('tasks Step-1 review-only unit ' + blockedUnit) : hardBlock;
            if (hardBlock && /center|converge|one target/.test(String(hardBlock))) {
                h += '<div data-scc="coa-rejected" style="margin-top:4px;padding:5px 8px;border:1px solid ' + C.bad + ';border-radius:5px;background:#1f0d0d;color:' + C.bad + ';font-size:10px;font-weight:700;">Rejected: not commander-quality. All units are moving to the objective center.</div>';
            } else {
                h += '<div data-scc="coa-rejected" style="margin-top:4px;padding:5px 8px;border:1px solid ' + C.bad + ';border-radius:5px;background:#1f0d0d;color:' + C.bad + ';font-size:10px;font-weight:700;">Not executable — ' + esc(reason) + '.</div>';
            }
        }
        // commander structure
        if (coa.commander_intent) h += '<div style="margin-top:3px;font-size:9.5px;color:' + C.ink + ';"><span style="color:' + C.dim + ';">Intent:</span> ' + esc(coa.commander_intent) + '</div>';
        if (coa.main_effort) h += '<div style="font-size:9.5px;color:' + C.ink + ';"><span style="color:' + C.dim + ';">Main effort:</span> ' + esc(coa.main_effort) + '</div>';
        if (coa.supporting_effort) h += '<div style="font-size:9.5px;color:' + C.ink + ';"><span style="color:' + C.dim + ';">Supporting:</span> ' + esc(coa.supporting_effort) + '</div>';
        if (coa.reserve_or_follow_on || coa.security_or_screen) h += '<div style="font-size:9.5px;color:' + C.ink + ';"><span style="color:' + C.dim + ';">Reserve/Security:</span> ' + esc(coa.reserve_or_follow_on || '—') + ' / ' + esc(coa.security_or_screen || '—') + '</div>';
        h += '<div style="font-size:9.5px;color:' + C.dim + ';">Phases: ' + arr(coa.phases).length + ' · ' + arr(coa.phases).map(function (p) { return esc(p.name || 'phase'); }).slice(0, 4).join(' → ') + '</div>';
        if (sel) h += targetTable(eng, coa);
        h += '</div>';
        return h;
    }
    function panel3Review(eng) {
        var plan = eng.coaPlan();
        var coas = arr(plan && plan.coas);
        var selIdx = eng.selectedIdx(), recIdx = eng.recommendedIdx();
        var inner = '<div style="font-size:10px;color:' + C.dim + ';margin-bottom:5px;">Click a COA to review its exact action targets. A COA that sends all units to the objective center is rejected and cannot be committed.</div>';
        coas.forEach(function (coa, i) { inner += coaReviewCard(eng, plan, coa, i, selIdx, recIdx); });
        return panel('3', 'COA Review', inner, C.accent);
    }

    // ── Panel 4 — Commit Order ───────────────────────────────────────────────────────────────────────────
    function panel4Commit(eng, state) {
        var plan = eng.coaPlan();
        var coas = arr(plan && plan.coas);
        var selIdx = eng.selectedIdx();
        var coa = coas[selIdx];
        var inner = '';
        if (state === 'coa_review') {
            var executable = coa && eng.isExecutable(coa);
            var cbr = eng.commitBlockedReason();
            if (cbr) inner += '<div data-scc="commit-blocked" style="margin-bottom:6px;padding:6px 9px;border:1px solid ' + C.bad + ';border-radius:5px;background:#1f0d0d;color:' + C.bad + ';font-size:10px;font-weight:700;">⛔ ' + esc(cbr) + '</div>';
            if (executable) {
                inner += btnPri('scc-commit', '✅ Commit Selected COA (' + esc((coa.plan_id) || ('COA-' + (selIdx + 1))) + ')', 'Locks exactly this reviewed COA for execution') +
                    note('Commit stores the COA you reviewed above — not a stale or pre-gate plan.', C.dim);
            } else {
                inner += '<button data-act="scc-commit" disabled style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:6px;padding:8px 15px;font-size:12.5px;opacity:.5;">✅ Commit Selected COA</button>' +
                    note('Commit is disabled — the selected COA is not executable (see the rejection above). Select an executable COA.', C.warn);
            }
            return panel('4', 'Commit Order', inner, executable ? C.edge : C.bad);
        }
        // committed / running / etc. — show the committed summary + target table
        var ex = eng.committedExec();
        if (ex && ex.selected_coa) {
            var ccoa = ex.selected_coa;
            inner += kv('Committed COA', (ex.selected_coa_id || '—') + ' · ' + esc(ccoa.title || ''), C.good);
            inner += kv('Source', plan && plan.plan_source || ccoa.source_type || '—', C.ink);
            inner += kv('Target summary', eng.targetSummary(ccoa), C.ink);
            inner += targetTable(eng, ccoa);
        }
        return panel('4', 'Committed Order', inner, C.good);
    }

    // ── Panel 5 — Run Scenario ───────────────────────────────────────────────────────────────────────────
    function panel5Run(eng, state) {
        var scn = eng.scenarioRuntime();
        var ex = eng.committedExec();
        var inner = '';
        var rb = eng.runBlockedReason();
        if (rb) inner += '<div data-scc="run-blocked" style="margin-bottom:6px;padding:6px 9px;border:1px solid ' + C.bad + ';border-radius:5px;background:#1f0d0d;color:' + C.bad + ';font-size:10px;font-weight:700;">⛔ ' + esc(rb) + '</div>';
        // controls per state
        var controls = '';
        // RMOOZ-FREE-FIGHT-CONTINUITY: Auto-Continue toggle + an explicit "Continue (BLUE Reaction)" so a
        // manual pause is never a dead-end.
        var autoOn = false; try { autoOn = !!(eng.autoContinueEnabled && eng.autoContinueEnabled()); } catch (_) {}
        var autoBtn = btnSec('scc-auto-continue', '🔁 Auto-Continue: ' + (autoOn ? 'ON' : 'OFF'), 'Auto-commit a deterministic BLUE reaction each turn (no AI on normal ticks) so the fight does not pause for orders.');
        var contBlueBtn = btnPri('scc-continue-blue', '→ Continue (BLUE Reaction)', 'Force one deterministic BLUE reaction and continue this turn (no AI).');
        if (state === 'committed') {
            // RMOOZ-PREPARE-COA-UX-UNBLOCK-A + RMOOZ-FREE-FIGHT-CONTINUITY:
            // primary button runs continuously, while Run Plan once and Auto-Continue remain explicit controls.
            controls = btnPri('scc-run', '🎬 Run Scenario', 'Auto-director: continuous fight — Blue orders generated each turn; stops only on end condition or max turns') +
                ' ' + btnSec('scc-run-once', '▶ Run Plan once', 'Execute the committed COA a single turn then pause') + ' ' + autoBtn + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_running') {
            controls = btnPri('scc-pause', '⏸ Pause') + ' ' + autoBtn + ' ' + btnWarn('scc-stop', '■ Stop') + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_paused') {
            controls = contBlueBtn + ' ' + autoBtn + ' ' + btnSec('scc-run', '▶ Resume (manual)') + ' ' + btnWarn('scc-stop', '■ Stop') + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_blocked') {
            controls = contBlueBtn + ' ' + btnSec('scc-run', '▶ Continue anyway') + ' ' + btnSec('scc-replan', '↻ Replan with AI') + ' ' + autoBtn + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_complete') {
            controls = btnSec('scc-run', '🎬 Run Scenario again') + ' ' + btnWarn('scc-clear', '✕ Clear');
        }
        inner += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;">' + controls + '</div>';
        // live runtime read-out
        if (scn && scn.scenario_active) {
            var w = eng.whiteOutcome();
            // "Run means time moves": the primary readout is scenario time, runtime state, and speed.
            // Authored progress rows stay internal and are not rendered in normal operator UI.
            inner += kv('Scenario time', (function () { try { return (eng.scenarioClockLabel && eng.scenarioClockLabel()) || '—'; } catch (_) { return '—'; } })(), C.good) +
                kv('Runtime state', runtimeStateLabel(state, scn, ex), STATE_COLOR[state] || C.ink) +
                kv('Speed', runtimeSpeedLabel(ex), C.accent) +
                kv('Next runtime event', nextRuntimeEventLabel(ex), C.dim) +
                kv('Current actor', String(scn.current_actor || '—'), C.ink) +
                kv('Objective control', String(scn.objective_control || '—'), scn.objective_control === 'Blue' ? C.good : (scn.objective_control === 'Red' ? C.bad : C.warn)) +
                kv('Last outcome (White)', String(scn.last_outcome || (w && w.summary) || '—'), C.ink) +
                kv('Last movement', String(scn.last_formation_order || '—'), C.dim) +
                kv('Red reaction', String(scn.last_red_maneuver || '—'), C.dim) +
                kv('Green status', (function () { var g = eng.greenStatus(); return g && g.collateral_risk ? ('collateral ' + (g.collateral_risk.band || '—')) : 'refreshed'; })(), C.dim);
            if (scn.pending_replan_reason) {
                inner += note('⚠ ' + esc(scn.pending_replan_reason), C.bad);
                if (scn.scenario_status === 'paused') inner += note('<b>▶ Resume (manual)</b> runs one more turn and pauses again. <b>▶▶ Auto Continue</b> generates deterministic Blue orders automatically every turn (no AI required).', C.dim);
            }
            if (scn.end_condition) inner += note('End condition: ' + esc(scn.end_condition), C.good);
        } else if (state === 'committed') {
            inner += note('Committed — press <b>Run Scenario</b> to begin. There is no hidden Run button before commit.', C.dim);
        }
        return panel('5', 'Run Scenario', inner, state === 'scenario_running' ? C.good : (state === 'scenario_blocked' ? C.bad : C.edge));
    }

    // ── Panel 6 — Debug / Evidence ───────────────────────────────────────────────────────────────────────
    function jsonBlock(label, obj) {
        var txt = '';
        try { txt = obj == null ? '(none)' : JSON.stringify(obj, function (k, v) { return k === '_quality' || k === '_ranking' ? undefined : v; }, 1); } catch (_) { txt = '(unserializable)'; }
        if (txt.length > 2200) txt = txt.slice(0, 2200) + '\n… (truncated)';
        return '<div style="margin-top:6px;"><div style="font-size:9px;color:' + C.dim + ';font-weight:700;">' + esc(label) + '</div>' +
            '<pre style="margin:2px 0 0;padding:6px 8px;background:#06101c;border:1px solid ' + C.edgeSoft + ';border-radius:5px;color:#bcd;font-size:9px;line-height:1.4;overflow:auto;max-height:170px;white-space:pre-wrap;">' + esc(txt) + '</pre></div>';
    }
    // RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: the four Free Fight scripts whose ?v= must match the new build.
    // Reading the live <script> src proves what the BROWSER loaded (cache detector), independent of what
    // the running code believes its version is.
    var FF_REQUIRED_SCRIPTS = [
        { file: 'free-fight-ai.js', v: 'dual-layer-conflict-a' },
        { file: 'free-fight-movement-engine.js', v: 'movement-intelligence-b' },
        { file: 'free-fight-demo.js', v: 'behavior-path-required-a' },
        { file: 'scenario-control-center.js', v: 'dual-layer-conflict-a' },
    ];
    function loadedScriptVersions() {
        var out = {};
        try {
            var srcs = (typeof document !== 'undefined' && document.scripts)
                ? [].slice.call(document.scripts).map(function (s) { return s.src || ''; }) : [];
            FF_REQUIRED_SCRIPTS.forEach(function (r) {
                var hit = srcs.filter(function (s) { return s.indexOf(r.file) !== -1; })[0] || '';
                var m = hit.match(/[?&]v=([^&]+)/);
                out[r.file] = { expected: r.v, loaded: m ? m[1] : null, match: !!m && m[1] === r.v };
            });
        } catch (_) {}
        return out;
    }
    function diagRow(label, value, col) {
        return '<div><span style="color:' + C.dim + ';">' + esc(label) + ':</span> <b style="color:' + (col || '#cfe6ff') + ';">' + esc(String(value)) + '</b></div>';
    }
    function buildDiagnosticsBlock(eng) {
        var d = (function () { try { return eng.diagnostics ? eng.diagnostics() : null; } catch (_) { return null; } })();
        var sv = loadedScriptVersions();
        var allMatch = Object.keys(sv).length > 0 && Object.keys(sv).every(function (k) { return sv[k].match; });
        var aiLiteVis = d ? d.ai_lite_layer_visible : null;
        var aiLiteCol = aiLiteVis === false ? C.good : (aiLiteVis === true ? C.bad : C.dim);
        var srcSum = (d && d.movement_source_summary) || {};
        var html = '<div data-scc="ff-diagnostics" style="margin-top:6px;padding:7px 9px;border:1px solid ' +
            (allMatch ? C.good : C.warn) + ';border-radius:5px;background:#06121e;font-size:9px;color:#bcd;line-height:1.55;">' +
            '<div style="color:' + C.dim + ';font-weight:700;">Runtime build &amp; map-layer diagnostics</div>';
        // build / cache marker
        html += '<div data-scc="diag-build" style="margin-top:3px;">';
        html += diagRow('free_fight_demo_version', d ? d.free_fight_demo_version : '—');
        Object.keys(sv).forEach(function (f) {
            var s = sv[f];
            html += '<div style="font-size:8.5px;"><span style="color:' + C.dim + ';">' + esc(f) + ':</span> ' +
                '<b style="color:' + (s.match ? C.good : C.bad) + ';">' + esc(String(s.loaded || '(not loaded)')) + '</b>' +
                (s.match ? ' <span style="color:' + C.good + ';">✓</span>' : ' <span style="color:' + C.bad + ';">⚠ expected ' + esc(s.v || s.expected || '') + '</span>') + '</div>';
        });
        html += '<div style="margin-top:2px;font-weight:700;color:' + (allMatch ? C.good : C.bad) + ';">' +
            (allMatch ? '✓ Browser is running THIS build' : '⚠ STALE CACHE or version mismatch — hard-refresh') + '</div>';
        html += '</div>';
        // map-layer ownership
        html += '<div data-scc="diag-layer" style="margin-top:4px;border-top:1px solid ' + C.edgeSoft + ';padding-top:3px;">';
        html += diagRow('map_layer_mode', d ? (d.map_layer_mode || '—') : '—');
        html += diagRow('ai_lite_layer_visible', d ? d.ai_lite_layer_visible : '—', aiLiteCol);
        html += diagRow('movement_engine_loaded', d ? d.movement_engine_loaded : '—', (d && d.movement_engine_loaded) ? C.good : C.bad);
        html += '</div>';
        // plan source
        html += '<div data-scc="diag-plan" style="margin-top:4px;border-top:1px solid ' + C.edgeSoft + ';padding-top:3px;">';
        html += diagRow('plan_source', d ? (d.plan_source || '—') : '—');
        html += diagRow('llm_status', d ? (d.llm_status || '—') : '—');
        html += diagRow('selected_coa_id', d ? (d.selected_coa_id || '—') : '—');
        html += '</div>';
        // movement source summary
        html += '<div data-scc="diag-movement" style="margin-top:4px;border-top:1px solid ' + C.edgeSoft + ';padding-top:3px;">';
        html += '<div style="color:' + C.dim + ';font-weight:700;">movement_source_summary</div>';
        html += diagRow('ai_behavior', srcSum.ai_behavior || 0, C.good);
        html += diagRow('degraded_behavior_repaired', srcSum.degraded_behavior_repaired || 0, C.good);
        html += diagRow('staff_safe_movement_engine', srcSum.staff_safe_movement_engine || 0, C.warn);
        html += diagRow('legacy_target', srcSum.legacy_target || 0, (srcSum.legacy_target ? C.bad : C.dim));
        html += diagRow('moved / held / blocked / missing',
            (d ? d.moved_count : 0) + ' / ' + (d ? d.held_count : 0) + ' / ' + (d ? d.blocked_count : 0) + ' / ' + (d ? d.missing_unit_count : 0));
        html += '</div>';
        html += '</div>';
        return html;
    }
    function panel6Evidence(eng) {
        var head = '<button data-act="scc-evidence-toggle" data-scc-evidence-open="' + (evidenceOpen ? '1' : '0') + '" style="font:inherit;cursor:pointer;border:1px solid #3a4658;background:#0c141d;color:' + C.dim + ';border-radius:5px;padding:5px 10px;font-size:10.5px;font-weight:600;">' + (evidenceOpen ? '▾' : '▸') + ' Debug / Evidence</button>';
        if (!evidenceOpen) return panel('6', 'Debug / Evidence', head + note('Proves exactly what is being executed — generated / selected / committed COA JSON, executed movement trace, decision log, network calls. Click to open.', C.dim), C.edgeSoft);
        var inner = head;
        // RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: runtime build + map-layer + movement-source diagnostics.
        // First thing in the panel so an operator screenshot immediately reveals whether the browser ran
        // THIS build or a stale cache, and whether AI-lite preview leaked into execution.
        inner += buildDiagnosticsBlock(eng);
        // executed movement trace
        var trace = eng.executedTrace();
        inner += '<div style="margin-top:6px;font-size:9px;color:' + C.dim + ';font-weight:700;">Executed movement trace (' + trace.length + ')</div>';
        if (trace.length) {
            inner += '<div style="font-size:9px;color:#bcd;font-family:monospace;line-height:1.5;">' + trace.slice(0, 12).map(function (m) {
                return esc(String(m.uid)) + ' ' + esc(m.role || '') + ' → ' + (m.to ? (m.to.lat.toFixed(3) + ',' + m.to.lon.toFixed(3)) : '?');
            }).join('<br>') + '</div>';
        } else { inner += note('(no movement executed yet)', C.dim); }
        // RMOOZ-MOVEMENT-TRUTH-A: per-unit movement debug table (role/target/dist/obj-dist/taskable)
        var mvd = (function () { try { return eng.movementDebug ? eng.movementDebug() : []; } catch (_) { return []; } })();
        if (mvd.length) {
            inner += '<div style="margin-top:6px;font-size:9px;color:' + C.dim + ';font-weight:700;">Movement debug (' + mvd.length + ' actions)</div>';
            inner += '<div style="overflow-x:auto;margin-top:2px;"><table style="border-collapse:collapse;font-size:9px;width:100%;min-width:680px;">';
            // RMOOZ-MOVEMENT-TRUTH-A + RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: show domain/behavior/mode/source +
            // moved-km/remaining-km so the operator can SEE that movement came from the behavior path.
            inner += '<thead><tr>' + ['unit', 'side', 'domain', 'behavior', 'mode', 'source', 'cur lat,lon', 'cur→wp km', 'obj km', 'moved km', 'rem km', 'ok', 'reason'].map(function (h) {
                return '<th style="border-bottom:1px solid ' + C.edgeSoft + ';padding:2px 5px;color:' + C.dim + ';font-weight:700;white-space:nowrap;text-align:left;">' + esc(h) + '</th>';
            }).join('') + '</tr></thead><tbody>';
            mvd.forEach(function (r) {
                var moved = (r.moved != null) ? r.moved : r.moved_this_tick;
                var rowCol = r.blocked_reason ? C.bad : (moved ? C.good : C.ink);
                var sCol = r.side === 'RED' ? '#f09080' : r.side === 'BLUE' ? '#80c0f0' : C.ink;
                var src = String(r.source || '');
                var srcCol = (src === 'ai_behavior' || src === 'degraded_behavior_repaired') ? C.good
                    : /staff_safe/.test(src) ? C.warn
                    : (src === 'ai' || src === 'legacy' || src === 'legacy_target') ? C.bad : C.dim;
                var curLat = (r.cur_lat != null) ? r.cur_lat : null;
                var curLon = (r.cur_lon != null) ? r.cur_lon : null;
                var d2wp = (r.distance_to_waypoint_km != null) ? r.distance_to_waypoint_km : r.dist_km;
                var objKm = (r.distance_to_objective_km != null) ? r.distance_to_objective_km : r.obj_dist_km;
                inner += '<tr>' +
                    '<td style="padding:2px 5px;white-space:nowrap;color:' + rowCol + ';">' + esc(r.uid || '—') + '</td>' +
                    '<td style="padding:2px 5px;font-weight:700;color:' + sCol + ';">' + esc(r.side || '—') + '</td>' +
                    '<td style="padding:2px 5px;color:' + C.dim + ';">' + esc(r.domain || '—') + '</td>' +
                    '<td style="padding:2px 5px;">' + esc(r.behavior || '—') + '</td>' +
                    '<td style="padding:2px 5px;color:' + C.dim + ';">' + esc(r.movement_mode || '—') + '</td>' +
                    '<td style="padding:2px 5px;font-weight:700;font-size:8.5px;color:' + srcCol + ';white-space:nowrap;">' + esc(src || '—') + '</td>' +
                    '<td style="padding:2px 5px;color:' + C.dim + ';font-size:8.5px;">' + (curLat != null ? curLat.toFixed(3) + ',' + curLon.toFixed(3) : '—') + '</td>' +
                    '<td style="padding:2px 5px;">' + (d2wp != null ? d2wp : '—') + '</td>' +
                    '<td style="padding:2px 5px;">' + (objKm != null ? objKm : '—') + '</td>' +
                    '<td style="padding:2px 5px;font-weight:700;color:' + (moved ? C.good : C.dim) + ';">' + (r.moved_km_this_tick != null ? r.moved_km_this_tick : (moved ? '✓' : '—')) + '</td>' +
                    '<td style="padding:2px 5px;color:' + C.dim + ';">' + (r.remaining_km != null ? r.remaining_km : '—') + '</td>' +
                    '<td style="padding:2px 5px;color:' + (r.taskable ? C.good : C.bad) + ';font-weight:700;">' + (r.taskable ? 'yes' : 'no') + '</td>' +
                    '<td style="padding:2px 5px;font-size:8.5px;color:' + C.bad + ';">' + esc(r.blocked_reason || '') + '</td>' +
                    '</tr>';
            });
            inner += '</tbody></table></div>';
        }
        // decision log
        var dl = eng.decisionLog();
        inner += '<div style="margin-top:6px;font-size:9px;color:' + C.dim + ';font-weight:700;">Decision log (last ' + dl.length + ')</div>' +
            '<div style="font-size:9px;color:#bcd;font-family:monospace;line-height:1.5;max-height:120px;overflow:auto;">' + dl.slice().reverse().slice(0, 12).map(function (d) {
                return esc((d.role || '?') + '·' + (d.action || '?') + (d.called_llm ? ' [LLM]' : '') + ' — ' + (d.result_summary || d.reason || ''));
            }).join('<br>') + '</div>';
        // network calls
        var nc = eng.networkCalls();
        inner += '<div style="margin-top:6px;font-size:9px;color:' + C.dim + ';font-weight:700;">Network calls (last ' + nc.length + ')</div>' +
            '<div style="font-size:9px;color:#bcd;font-family:monospace;line-height:1.5;max-height:90px;overflow:auto;">' + (nc.length ? nc.slice().reverse().slice(0, 10).map(function (n) { return esc((n.method || 'GET') + ' ' + n.url); }).join('<br>') : '(none)') + '</div>';
        // RMOOZ-SCC-PREPARE-COA-LIVE-AH: target-equality proof — selected == committed == executed (km from objective).
        var selSum = (function () { try { return eng.targetSummary(eng.rawJson('selected')); } catch (_) { return ''; } })();
        var comSum = (function () { try { return eng.targetSummary(eng.rawJson('committed')); } catch (_) { return ''; } })();
        var exeSum = (function () { try { return eng.executedTargetSummary(); } catch (_) { return ''; } })();
        var eqSelCom = !!comSum && selSum === comSum;
        inner += '<div data-scc="target-equality" style="margin-top:6px;padding:6px 8px;border:1px solid ' + C.edgeSoft + ';border-radius:5px;background:#06101c;font-size:9px;color:#bcd;">' +
            '<div style="color:' + C.dim + ';font-weight:700;">Target-equality proof (km from objective)</div>' +
            '<div data-scc="sel-summary">selected&nbsp;&nbsp;: ' + esc(selSum || '(none)') + '</div>' +
            '<div data-scc="com-summary">committed&nbsp;: ' + esc(comSum || '(not committed)') + (comSum ? (eqSelCom ? ' <span style="color:' + C.good + ';">✓ == selected</span>' : ' <span style="color:' + C.warn + ';">⚠ enforcement replaced the selected COA</span>') : '') + '</div>' +
            '<div data-scc="exe-summary">executed&nbsp;&nbsp;: ' + esc(exeSum || '(not run)') + '</div></div>';
        // RMOOZ-SCC-COA-COMMANDER-QUALITY-AI: AI honesty block — parse/schema/repair/fallback status. A
        // fallback is NEVER dressed as an AI plan; when the AI was called but fell back, say so plainly.
        var le = (function () { try { return eng.llmEvidence ? eng.llmEvidence() : null; } catch (_) { return null; } })();
        if (le) {
            var fbCol = le.fallback_used ? C.warn : (le.is_real_llm ? C.good : C.dim);
            inner += '<div data-scc="ai-honesty" style="margin-top:6px;padding:6px 8px;border:1px solid ' + fbCol + ';border-radius:5px;background:#0a1422;font-size:9px;color:#bcd;">' +
                '<div style="color:' + C.dim + ';font-weight:700;">AI commander honesty</div>' +
                '<div>plan_source: <b style="color:#cfe6ff;">' + esc(le.plan_source || '—') + '</b> · llm_called: <b>' + (le.llm_called ? 'true' : 'false') + '</b> · llm_status: <b style="color:' + fbCol + ';">' + esc(le.llm_status || '—') + '</b></div>' +
                '<div>repair_attempted: <b>' + (le.repair_attempted ? 'true' : 'false') + '</b> · real_llm_plan: <b style="color:' + (le.is_real_llm ? C.good : C.dim) + ';">' + (le.is_real_llm ? 'yes' : 'no') + '</b></div>' +
                (le.fallback_used ? '<div data-scc="ai-fallback" style="color:' + C.warn + ';margin-top:2px;">⚠ AI was called, but a fallback plan was used because the JSON/schema failed' + (le.fallback_reason ? (' (' + esc(le.fallback_reason) + ')') : '') + '.</div>' : '') +
                '</div>';
            if (le.raw_llm_output) inner += jsonBlock('Raw LLM output (preview)', String(le.raw_llm_output).slice(0, 1800));
        }
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: training-simulation override block — records that review-only
        // units were tasked under an explicit operator training approval, NOT a source verification. The
        // readiness JSON below still carries each unit's original source/commander flags (never mutated).
        var rdy = eng.readiness();
        if (rdy.training_approved || rdy.training_eligible > 0) {
            var taCol = rdy.training_approved ? C.warn : C.dim;
            inner += '<div data-scc="training-evidence" style="margin-top:6px;padding:6px 8px;border:1px solid ' + taCol + ';border-radius:5px;background:#1c1608;font-size:9px;color:#d6c79a;">' +
                '<div style="color:' + C.dim + ';font-weight:700;">Step-1 training-simulation approval</div>' +
                '<div>training_approved: <b style="color:' + taCol + ';">' + (rdy.training_approved ? 'true' : 'false') + '</b> · training_eligible: <b>' + rdy.training_eligible + '</b> · simulation_taskable: <b>' + rdy.simulation_taskable + '</b></div>' +
                (rdy.training_approved ? '<div style="color:' + C.warn + ';margin-top:2px;">⚠ ' + rdy.simulation_taskable + ' review-only unit(s) tasked under SIMULATION-ONLY approval — overrides source / doctrine / commander review, NOT source-verified. Original flags retained in the readiness report below.</div>' : '') +
                '</div>';
        }
        // readiness report + raw JSON
        inner += jsonBlock('Readiness report', rdy);
        inner += jsonBlock('Last generated COA plan (raw planner response)', eng.rawJson('generated'));
        inner += jsonBlock('Selected COA', eng.rawJson('selected'));
        inner += jsonBlock('Committed COA', eng.rawJson('committed'));
        return panel('6', 'Debug / Evidence', inner, C.edgeSoft);
    }

    // ── compose ──────────────────────────────────────────────────────────────────────────────────────────
    function render() {
        var eng = engine();
        if (!eng) return '<div style="padding:10px;color:#f0707a;font-size:11px;">Scenario Control Center: engine facade unavailable.</div>';
        var state = sccState(eng);
        var simOnly = false; try { simOnly = !!eng.simulationOnly(); } catch (_) {}
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: a persistent top banner so SIMULATION ONLY is unmissable in
        // every downstream state (COA Review, Commit, Run) — not just Panel 1.
        var simBanner = simOnly ? '<div data-scc="sim-only-banner" style="margin:0 0 8px;padding:7px 11px;border:1.5px solid #d98a2b;border-radius:7px;background:#241704;color:#f1b84c;font-size:11.5px;font-weight:800;text-align:center;letter-spacing:.3px;">⚠ TRAINING SIMULATION ONLY — units are NOT source-verified</div>' : '';
        var body = headerHtml(state) + simBanner + flowHtml(state) + panel1Readiness(eng);
        if (state === 'no_scenario') {
            body += panel('2', 'Prepare COA', '<div style="font-size:10.5px;color:' + C.dim + ';">Load a scenario and place the objective to begin.</div>', C.edgeSoft);
        } else if (state === 'step1_review_required') {
            body += panel2Prepare(eng, state);
        } else if (state === 'ready_to_generate' || state === 'generating_coa') {
            body += panel2Prepare(eng, state);
        } else if (state === 'coa_review') {
            // a stale committed COA (older plan / changed selection) must NOT shadow the newly selected plan
            var ex0 = eng.committedExec();
            if (ex0 && ex0.active && eng.committedIsStale()) {
                body += '<div data-scc="recommit-needed" style="margin:8px 0;padding:7px 10px;border:1px solid ' + C.warn + ';border-radius:6px;background:#1c1708;color:#e8d68a;font-size:10.5px;font-weight:700;">⚠ Selection changed — commit the selected COA before running. The previously committed COA is stale; Run stays hidden until you re-commit.</div>';
            }
            body += panel3Review(eng) + panel4Commit(eng, state);
        } else if (state === 'committed') {
            body += panel4Commit(eng, state) + panel5Run(eng, state);
        } else {  // scenario_running / paused / blocked / complete
            body += panel5Run(eng, state) + panel4Commit(eng, state);
        }
        body += panel6Evidence(eng);
        return '<div data-scc="window" style="margin:6px 0;padding:11px 13px;border:1px solid ' + C.edge + ';border-radius:9px;background:' + C.bg + ';">' + body + '</div>';
    }

    // bindFn is the host's bind(act, fn) helper (scoped to the panel DOM); no-ops on absent ids.
    function bind(bindFn) {
        var eng = engine(); if (!eng || typeof bindFn !== 'function') return;
        // RMOOZ-PREPARE-COA-PRODUCT-FLOW-A: smart (always enabled, AI-or-StaffSafe), strict (AI only), staffsafe.
        bindFn('scc-cmo-guide', function () { openCmoTestGuide(); });
        bindFn('scc-prepare-smart', function () { if (typeof eng.prepareCoaSmart === 'function') eng.prepareCoaSmart(); else eng.prepareStaffSafe(); });
        bindFn('scc-prepare-ai', function () { eng.prepareCoa(); });
        bindFn('scc-prepare', function () { eng.prepareCoa(); });   // legacy alias (direct AI path)
        bindFn('scc-prepare-staffsafe', function () { eng.prepareStaffSafe(); });
        bindFn('scc-recheck', function () { eng.clearAll(); });
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK
        bindFn('scc-approve-training', function () { (eng.approveTrainingSimulation || function () {})(); });
        bindFn('scc-clear-training', function () { (eng.clearTrainingApproval || function () {})(); });
        bindFn('scc-place-obj', function () { eng.placeObjective(); });
        bindFn('scc-clear-obj', function () { eng.clearObjectiveX(); (eng.repaint || function () {})(); });
        bindFn('scc-commit', function () { eng.commit(eng.selectedIdx()); });
        bindFn('scc-run', function () {
            if (state() === 'committed' && typeof eng.runScenarioContinuous === 'function') eng.runScenarioContinuous();
            else eng.runScenario();
        });
        bindFn('scc-run-once', function () { eng.runCommittedOnce(); });
        bindFn('scc-pause', function () { eng.pauseScenario(); });
        bindFn('scc-stop', function () { eng.stopScenario(); });
        // RMOOZ-FREE-FIGHT-CONTINUITY: operator continue + Auto-Continue toggle (no dead-end at a pause).
        bindFn('scc-continue-blue', function () { (eng.continueWithBlueReaction || function () {})(); (eng.repaint || function () {})(); });
        bindFn('scc-auto-continue', function () {
            if (eng.setAutoContinue) eng.setAutoContinue(!(eng.autoContinueEnabled && eng.autoContinueEnabled()));
            else if (typeof eng.enableAutoScenario === 'function') eng.enableAutoScenario();
            (eng.repaint || function () {})();
        });
        bindFn('scc-clear', function () { eng.clearAll(); });
        bindFn('scc-replan', function () { eng.replan(); });
        // RMOOZ-PREPARE-COA-UX-UNBLOCK-A: provider-switch, continuous run, auto-continue bindings
        bindFn('scc-run-continuous', function () { if (typeof eng.runScenarioContinuous === 'function') eng.runScenarioContinuous(); else eng.runScenario(); });
        bindFn('scc-use-local-model', function () { if (typeof eng.switchToLocalModel === 'function') eng.switchToLocalModel(); });
        bindFn('scc-use-openrouter', function () { if (typeof eng.switchToOpenRouter === 'function') eng.switchToOpenRouter(); });
        bindFn('scc-evidence-toggle', function () { evidenceOpen = !evidenceOpen; (eng.repaint || function () {})(); });
        for (var i = 0; i < 8; i++) { (function (idx) { bindFn('scc-select-' + idx, function () { eng.selectCoa(idx); }); })(i); }
    }

    var API = { render: render, bind: bind, runSnapshot: runSnapshot, state: function () { var e = engine(); return e ? sccState(e) : 'no_scenario'; },
        _setEvidenceOpenForTest: function (v) { evidenceOpen = !!v; } };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozScenarioControlCenter = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
