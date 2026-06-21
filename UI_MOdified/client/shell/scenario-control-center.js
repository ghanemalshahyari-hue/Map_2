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
        no_scenario: 'No scenario', step1_review_required: 'Step 1 review required', ready_to_generate: 'Ready to prepare',
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
    function btnPri(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#15301f;color:' + C.good + ';border-radius:6px;padding:8px 15px;font-size:12.5px;font-weight:700;">' + label + '</button>'; }
    function btnSec(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #4a5f75;background:#101b27;color:#9fb8c8;border-radius:6px;padding:7px 12px;font-size:11px;">' + label + '</button>'; }
    function btnWarn(act, label, title) { return '<button data-act="' + act + '"' + (title ? ' title="' + esc(title) + '"' : '') + ' style="font:inherit;cursor:pointer;border:1px solid #7a3030;background:#241414;color:' + C.bad + ';border-radius:6px;padding:7px 12px;font-size:11px;">' + label + '</button>'; }
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

    // ── header + flow strip ──────────────────────────────────────────────────────────────────────────────
    function headerHtml(state) {
        var col = STATE_COLOR[state] || C.accent;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
            '<span style="font-size:13px;font-weight:800;color:' + C.accent + ';letter-spacing:.3px;">🎯 Scenario Control Center</span>' +
            '<span data-scc-state="' + state + '" style="font-size:9.5px;font-weight:700;color:' + col + ';background:#0c1622;border:1px solid ' + C.edge + ';border-radius:10px;padding:2px 9px;">' + esc(STATE_LABEL[state] || state) + '</span></div>';
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
        if (!r.executable && r.units_loaded) inner += '<div data-scc="no-exec" style="margin-top:6px;padding:6px 9px;border:1px solid ' + C.bad + ';border-radius:5px;background:#1f0d0d;color:' + C.bad + ';font-size:11px;font-weight:700;">No executable COA. Step 1 review required.</div>';
        if (!r.units_loaded) inner += note('No units loaded — load a scenario / Step-1 ORBAT to begin.', C.dim);
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
                note('Step 1 gate · taskability resolver · ROE/doctrine · quality requirements ran first; the local model can take 30–90s.', C.dim);
        } else if (!r.executable) {
            inner = '<button data-act="scc-prepare" disabled style="font:inherit;cursor:not-allowed;border:1px solid #3a5040;background:#162018;color:#5f8f74;border-radius:6px;padding:8px 15px;font-size:12.5px;opacity:.5;">⚙ Prepare COA</button>' +
                note('Prepare COA is blocked: <b>' + esc(r.message || 'Step 1 review required') + '</b> Complete source / doctrine / commander review (Panel 1), then re-check.', C.warn) +
                '<div style="margin-top:6px;">' + btnSec('scc-recheck', '↻ Re-check readiness') + '</div>';
        } else {
            inner = btnPri('scc-prepare', '⚙ Prepare COA', 'Runs Step-1 gate → taskability → ROE/doctrine → quality, then generates a commander COA') +
                ' <span style="display:inline-block;width:6px;"></span>' + btnSec('scc-prepare-staffsafe', '🛡 Staff-Safe (deterministic)', 'Deterministic role-separated COA — no AI') +
                note('<b>Prepare COA</b> does not blindly call the AI — it first runs the Step-1 gate, the unit taskability resolver, the ROE/doctrine gate and the COA quality requirements; only taskable units are tasked.', C.dim);
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
        h += '<div style="margin-top:3px;font-size:9.5px;color:' + C.dim + ';">source <b style="color:' + C.ink + ';">' + esc(plan.plan_source || '—') + '</b> · llm_called <b style="color:' + C.ink + ';">' + (llmCalled ? 'true' : 'false') + '</b> · llm_status <b style="color:' + C.ink + ';">' + esc(plan.llm_status || '—') + '</b> · <b style="color:' + vcol + ';">' + esc(verdict) + (q ? ' (' + q.score + ')' : '') + '</b></div>';
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
        if (state === 'committed') {
            controls = btnPri('scc-run', '🎬 Run Scenario', 'Continuous fight — deterministic ticks, White adjudication, Green updates, Red reaction; no AI on normal ticks') +
                ' ' + btnSec('scc-run-once', '▶ Run Plan once', 'Execute the committed COA a single playback') + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_running') {
            controls = btnPri('scc-pause', '⏸ Pause') + ' ' + btnWarn('scc-stop', '■ Stop') + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_paused') {
            controls = btnPri('scc-run', '▶ Resume') + ' ' + btnWarn('scc-stop', '■ Stop') + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_blocked') {
            controls = btnSec('scc-run', '▶ Continue anyway') + ' ' + btnSec('scc-replan', '↻ Replan with AI') + ' ' + btnWarn('scc-clear', '✕ Clear');
        } else if (state === 'scenario_complete') {
            controls = btnSec('scc-run', '🎬 Run Scenario again') + ' ' + btnWarn('scc-clear', '✕ Clear');
        }
        inner += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;">' + controls + '</div>';
        // live runtime read-out
        if (scn && scn.scenario_active) {
            var w = eng.whiteOutcome();
            inner += kv('Turn', String(scn.scenario_turn), C.ink) +
                kv('Current actor', String(scn.current_actor || '—'), C.ink) +
                kv('Phase', (ex && ex.selected_coa && arr(ex.selected_coa.phases)[ex.current_phase_index] && arr(ex.selected_coa.phases)[ex.current_phase_index].name) || (ex ? ('phase ' + ((ex.current_phase_index || 0) + 1)) : '—'), C.ink) +
                kv('Objective control', String(scn.objective_control || '—'), scn.objective_control === 'Blue' ? C.good : (scn.objective_control === 'Red' ? C.bad : C.warn)) +
                kv('Last outcome (White)', String(scn.last_outcome || (w && w.summary) || '—'), C.ink) +
                kv('Last movement', String(scn.last_formation_order || '—'), C.dim) +
                kv('Red reaction', String(scn.last_red_maneuver || '—'), C.dim) +
                kv('Green status', (function () { var g = eng.greenStatus(); return g && g.collateral_risk ? ('collateral ' + (g.collateral_risk.band || '—')) : 'refreshed'; })(), C.dim);
            if (scn.pending_replan_reason) inner += note('⚠ ' + esc(scn.pending_replan_reason), C.bad);
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
    function panel6Evidence(eng) {
        var head = '<button data-act="scc-evidence-toggle" data-scc-evidence-open="' + (evidenceOpen ? '1' : '0') + '" style="font:inherit;cursor:pointer;border:1px solid #3a4658;background:#0c141d;color:' + C.dim + ';border-radius:5px;padding:5px 10px;font-size:10.5px;font-weight:600;">' + (evidenceOpen ? '▾' : '▸') + ' Debug / Evidence</button>';
        if (!evidenceOpen) return panel('6', 'Debug / Evidence', head + note('Proves exactly what is being executed — generated / selected / committed COA JSON, executed movement trace, decision log, network calls. Click to open.', C.dim), C.edgeSoft);
        var inner = head;
        // executed movement trace
        var trace = eng.executedTrace();
        inner += '<div style="margin-top:6px;font-size:9px;color:' + C.dim + ';font-weight:700;">Executed movement trace (' + trace.length + ')</div>';
        if (trace.length) {
            inner += '<div style="font-size:9px;color:#bcd;font-family:monospace;line-height:1.5;">' + trace.slice(0, 12).map(function (m) {
                return esc(String(m.uid)) + ' ' + esc(m.role || '') + ' → ' + (m.to ? (m.to.lat.toFixed(3) + ',' + m.to.lon.toFixed(3)) : '?');
            }).join('<br>') + '</div>';
        } else { inner += note('(no movement executed yet)', C.dim); }
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
        // readiness report + raw JSON
        inner += jsonBlock('Readiness report', eng.readiness());
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
        var body = headerHtml(state) + flowHtml(state) + panel1Readiness(eng);
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
        bindFn('scc-prepare', function () { eng.prepareCoa(); });
        bindFn('scc-prepare-staffsafe', function () { eng.prepareStaffSafe(); });
        bindFn('scc-recheck', function () { eng.clearAll(); });
        bindFn('scc-place-obj', function () { eng.placeObjective(); });
        bindFn('scc-clear-obj', function () { eng.clearObjectiveX(); (eng.repaint || function () {})(); });
        bindFn('scc-commit', function () { eng.commit(eng.selectedIdx()); });
        bindFn('scc-run', function () { eng.runScenario(); });
        bindFn('scc-run-once', function () { eng.runCommittedOnce(); });
        bindFn('scc-pause', function () { eng.pauseScenario(); });
        bindFn('scc-stop', function () { eng.stopScenario(); });
        bindFn('scc-clear', function () { eng.clearAll(); });
        bindFn('scc-replan', function () { eng.replan(); });
        bindFn('scc-evidence-toggle', function () { evidenceOpen = !evidenceOpen; (eng.repaint || function () {})(); });
        for (var i = 0; i < 8; i++) { (function (idx) { bindFn('scc-select-' + idx, function () { eng.selectCoa(idx); }); })(i); }
    }

    var API = { render: render, bind: bind, state: function () { var e = engine(); return e ? sccState(e) : 'no_scenario'; },
        _setEvidenceOpenForTest: function (v) { evidenceOpen = !!v; } };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozScenarioControlCenter = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
