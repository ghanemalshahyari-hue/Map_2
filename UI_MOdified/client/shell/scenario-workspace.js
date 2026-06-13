/**
 * scenario-workspace.js — PR-42 + PR-44: Scenario Workspace Shell (read-only).
 *
 * PR-42: Read-only operator overview of the current scenario state.
 * PR-44: Scenario Phase Timeline — in-memory placeholder phases, read-only.
 *
 * SAFETY INVARIANTS (enforced by design):
 *   - No scenario mutation (window.units, window.lines, map, adjudicator, app.js)
 *   - No backend API calls, no fetch, no XHR
 *   - No file writes
 *   - No Blob / URL.createObjectURL / <a download>
 *   - No localStorage / sessionStorage / IndexedDB
 *   - Event Log: SYSTEM / UI / OPERATOR categories only
 *   - Commit: dry-run only (not called here at all)
 *   - Proposal Service: NOT_CONNECTED / disabled (read-only mirror)
 *   - AI proposes only — Operator approves / rejects / holds
 */
(function () {
    'use strict';

    // ── PR-49: Passive read-only scenario accessor ───────────────────────
    // Any external module may set:
    //   window.RmoozScenario = { scenario: {...}, stepIndex: 0 }
    // scenario-workspace.js ONLY reads this slot — never writes to it.
    // No fetch, no XHR, no persistence, no mutation.
    function getScenario() {
        var slot = window.RmoozScenario;
        if (!slot || typeof slot !== 'object') return null;
        return slot.scenario || null;
    }
    function getActiveStepIndex() {
        var slot = window.RmoozScenario;
        if (!slot || typeof slot !== 'object') return 0;
        return (typeof slot.stepIndex === 'number') ? slot.stepIndex : 0;
    }
    function getActiveStep() {
        var sc = getScenario();
        if (!sc || !Array.isArray(sc.steps) || !sc.steps.length) return null;
        var idx = getActiveStepIndex();
        return sc.steps[idx] || sc.steps[0] || null;
    }
    function resolveLiveValue(liveKey) {
        // Returns a live string from the scenario slot or null if unavailable.
        // Dot-path ('obj.name') resolves on the scenario root object.
        // Bare key resolves on the active step first, then on the scenario root.
        if (!liveKey) return null;
        var sc = getScenario();
        if (!sc) return null;
        if (liveKey.indexOf('.') !== -1) {
            var parts = liveKey.split('.');
            var obj = sc;
            for (var pi = 0; pi < parts.length; pi++) {
                if (obj === null || obj === undefined || typeof obj !== 'object') return null;
                obj = obj[parts[pi]];
            }
            return (obj !== null && obj !== undefined) ? String(obj) : null;
        }
        var step = getActiveStep();
        if (step) {
            var sv = step[liveKey];
            if (sv !== null && sv !== undefined && sv !== '') return String(sv);
        }
        var rv = sc[liveKey];
        return (rv !== null && rv !== undefined && rv !== '') ? String(rv) : null;
    }

    // ── i18n helper ──────────────────────────────────────────────────────
    function tx(key, fallback) {
        if (typeof window.t === 'function') {
            var v = window.t(key);
            if (v && v !== key) return v;
        }
        return (fallback !== undefined) ? fallback : key;
    }

    // ── Safe Event Log append (SYSTEM/info only) ─────────────────────────
    function logSystem(msgKey, fallback) {
        var log = window.AppShellEventLog;
        if (log && typeof log.append === 'function') {
            log.append({
                severity:   'info',
                category:   'SYSTEM',
                source:     'scenario-workspace',
                messageKey: msgKey,
                message:    fallback,
            });
        }
    }

    // ── DOM references ───────────────────────────────────────────────────
    var safetyChip   = document.getElementById('sw-safety-chip');
    var serviceChip  = document.getElementById('sw-service-chip');
    var lastDecision = document.getElementById('sw-last-decision');

    // ── Safety state mirror ──────────────────────────────────────────────
    // Subscribes to rmooz:safety-regression-summary-changed; never runs tests.
    var SAFETY_TONE = { notRun: 'yellow', clean: 'green', attention: 'red', unknown: 'grey' };
    var SAFETY_KEY  = {
        notRun:    'ap-safety-not-run',
        clean:     'ap-safety-clean',
        attention: 'ap-safety-attention',
        unknown:   'ap-safety-unknown',
    };

    function paintSafety(state) {
        if (!safetyChip) return;
        var s   = (SAFETY_TONE[state]) ? state : 'notRun';
        var key = SAFETY_KEY[s];
        safetyChip.setAttribute('data-tone',  SAFETY_TONE[s]);
        safetyChip.setAttribute('data-state', s);
        safetyChip.setAttribute('data-i18n',  key);
        safetyChip.textContent = tx(key, s);
    }

    document.addEventListener('rmooz:safety-regression-summary-changed', function (e) {
        var summary = e && e.detail;
        paintSafety(summary && summary.overall);
    });

    // ── Proposal service state mirror ────────────────────────────────────
    // Reads AppShellAIProposalBridge.getState() — pure read, no mutation.
    function paintService() {
        if (!serviceChip) return;
        var bridge  = window.AppShellAIProposalBridge;
        var s       = (bridge && typeof bridge.getState === 'function') ? bridge.getState() : null;
        var enabled = s && s.serviceEnabled;
        var status  = s && s.serviceStatus;

        var state, key;
        if (!enabled) {
            state = 'not-connected'; key = 'ap-service-not-connected';
        } else if (status === 'requesting') {
            state = 'requesting';    key = 'ap-service-requesting';
        } else if (status === 'connected') {
            state = 'connected';     key = 'ap-service-connected';
        } else if (status === 'failed') {
            state = 'failed';        key = 'ap-service-failed';
        } else {
            state = 'not-connected'; key = 'ap-service-not-connected';
        }

        serviceChip.setAttribute('data-state', state);
        serviceChip.setAttribute('data-i18n',  key);
        serviceChip.textContent = tx(key, state);
    }

    document.addEventListener('rmooz:ai-proposal-service-changed',      paintService);
    document.addEventListener('rmooz:ai-proposal-bridge-state-changed',  paintService);

    // ── Last operator decision mirror ────────────────────────────────────
    // Reads in-memory AppShellAIProposalDecisionJournal — no persistence.
    function paintLastDecision() {
        if (!lastDecision) return;
        var journal = window.AppShellAIProposalDecisionJournal;
        if (!journal || typeof journal.getState !== 'function') return;

        var state   = journal.getState();
        var records = state && state.records;
        if (!Array.isArray(records) || records.length === 0) {
            lastDecision.setAttribute('data-i18n', 'sw-value-no-decision');
            lastDecision.textContent = tx('sw-value-no-decision', 'No decisions recorded');
            return;
        }

        var latest   = records[records.length - 1];
        var decision = latest && latest.decision;
        var id       = latest && latest.proposalId;
        if (decision) {
            lastDecision.removeAttribute('data-i18n');
            lastDecision.textContent = decision.toUpperCase() +
                (id ? ' — ' + String(id).slice(0, 8) : '');
        }
    }

    document.addEventListener('rmooz:ai-proposal-decision',    paintLastDecision);
    document.addEventListener('rmooz:decision-record-stored',  paintLastDecision);

    // ── PR-49: Scenario Overview Fields ─────────────────────────────────
    // Wires #sw-name, #sw-status, #sw-phase to window.RmoozScenario slot.
    // Falls back gracefully to static i18n values when no scenario is loaded.
    function paintScenarioOverview() {
        var sc   = getScenario();
        var step = getActiveStep();
        var dash = tx('sw-value-none', '—');

        var nameEl   = document.getElementById('sw-name');
        var statusEl = document.getElementById('sw-status');
        var phaseEl  = document.getElementById('sw-phase');

        if (nameEl) {
            if (sc) {
                nameEl.removeAttribute('data-i18n');
                nameEl.textContent = sc.scenario_label || sc.name ||
                                     tx('sw-value-not-loaded', 'No scenario loaded');
            } else {
                nameEl.setAttribute('data-i18n', 'sw-value-not-loaded');
                nameEl.textContent = tx('sw-value-not-loaded', 'No scenario loaded');
            }
        }

        if (statusEl) {
            if (sc && step && step.objective_status_baseline) {
                statusEl.removeAttribute('data-i18n');
                statusEl.textContent = step.objective_status_baseline;
            } else {
                statusEl.setAttribute('data-i18n', 'sw-value-idle');
                statusEl.textContent = tx('sw-value-idle', 'Idle');
            }
        }

        if (phaseEl) {
            if (sc && step && step.phase) {
                phaseEl.removeAttribute('data-i18n');
                phaseEl.textContent = step.phase;
            } else {
                phaseEl.setAttribute('data-i18n', 'sw-value-none');
                phaseEl.textContent = dash;
            }
        }
    }

    // ── PR-44 / PR-287D: Scenario Phase Timeline ─────────────────────────
    // Read-only. Renders the loaded scenario's phases, grouped from
    // getScenario().phase_table — a per-time-step grid where many rows share
    // a phase name. We collapse it to the distinct phases in first-seen order
    // and show each phase's time-label span.
    //
    // current / complete / upcoming is derived read-only from the active step's
    // phase (getActiveStep().phase, driven by window.RmoozScenario.stepIndex —
    // the only allowed write, owned by goToStep()). paintPhaseTimeline() is
    // already repainted on every goToStep(), so the highlight tracks step nav.
    //
    // No scenario mutation. No phase_table mutation. No backend. No storage.
    // No commit. No Event Log entries. textContent only (no innerHTML).
    function paintPhaseTimeline() {
        var list = document.getElementById('spt-phase-list');
        if (!list) return;
        list.innerHTML = '';

        function renderEmpty() {
            var li = document.createElement('li');
            li.className = 'spt-item spt-item--empty';
            var body = document.createElement('div');
            body.className = 'spt-body';
            var msg = document.createElement('div');
            msg.className = 'spt-empty-msg';
            msg.setAttribute('data-i18n', 'spt-empty');
            msg.textContent = tx('spt-empty', 'Load a scenario to see its phase timeline.');
            body.appendChild(msg);
            li.appendChild(body);
            list.appendChild(li);
        }

        var sc    = getScenario();
        var table = (sc && Array.isArray(sc.phase_table)) ? sc.phase_table : null;
        if (!table || table.length === 0) { renderEmpty(); return; }

        // Collapse per-step rows into distinct phases (first-seen order).
        function rowLabel(row) {
            if (row && row.time_label != null && String(row.time_label) !== '') return String(row.time_label);
            if (row && typeof row.elapsed_hours === 'number') {
                return 'D' + (row.elapsed_hours < 0 ? '-' : '+') + Math.abs(row.elapsed_hours) + 'h';
            }
            return '';
        }
        var order  = [];   // phase names, first-seen order
        var byName = {};   // name -> { name, first, last, count }
        table.forEach(function (row) {
            var name = (row && row.phase != null) ? String(row.phase) : '';
            if (name === '') return;
            if (!Object.prototype.hasOwnProperty.call(byName, name)) {
                byName[name] = { name: name, first: rowLabel(row), last: rowLabel(row), count: 1 };
                order.push(name);
            } else {
                var d   = byName[name];
                var lbl = rowLabel(row);
                if (lbl !== '') d.last = lbl;
                d.count += 1;
            }
        });
        if (order.length === 0) { renderEmpty(); return; }

        // Current phase from the active step (read-only). -1 → none resolvable.
        var step = (typeof getActiveStep === 'function') ? getActiveStep() : null;
        var currentPhaseName = (step && step.phase != null) ? String(step.phase) : null;
        var currentPos = (currentPhaseName != null && Object.prototype.hasOwnProperty.call(byName, currentPhaseName))
            ? order.indexOf(currentPhaseName) : -1;

        order.forEach(function (name, i) {
            var d      = byName[name];
            var status = (currentPos < 0)   ? 'not-started'
                       : (i <  currentPos)  ? 'complete'
                       : (i === currentPos) ? 'current'
                       : 'not-started';
            var statusKey = 'spt-status-' + status;

            var li = document.createElement('li');
            li.className = 'spt-item spt-item--' + status;

            // dot marker column
            var marker = document.createElement('div');
            marker.className = 'spt-marker';
            var dot = document.createElement('span');
            dot.className = 'spt-dot';
            dot.setAttribute('aria-hidden', 'true');
            marker.appendChild(dot);

            // body column
            var body = document.createElement('div');
            body.className = 'spt-body';

            var nameRow = document.createElement('div');
            nameRow.className = 'spt-name-row';

            // Phase name is scenario data (a designator like "PHASE 2A"),
            // not an i18n key — textContent only, no data-i18n.
            var nameEl = document.createElement('span');
            nameEl.className = 'spt-name';
            nameEl.textContent = d.name;

            var badge = document.createElement('span');
            badge.className = 'spt-badge spt-badge--' + status;
            badge.setAttribute('data-i18n', statusKey);
            badge.textContent = tx(statusKey, status);

            nameRow.appendChild(nameEl);
            nameRow.appendChild(badge);

            // Time-label span (data-derived; LTR keeps the arrow stable in RTL).
            var desc = document.createElement('div');
            desc.className = 'spt-desc';
            desc.setAttribute('dir', 'ltr');
            desc.textContent = (d.count > 1 && d.last && d.last !== d.first)
                ? (d.first + ' → ' + d.last)
                : d.first;

            body.appendChild(nameRow);
            body.appendChild(desc);

            li.appendChild(marker);
            li.appendChild(body);
            list.appendChild(li);
        });
    }

    // ── PR-287E: Scenario Unit Composition ───────────────────────────────
    // Pure read of scenario.blue_units_initial + scenario.red_units. No DOM,
    // no map, no window.units, no network, no mutation (concat builds a new
    // array; tally only reads). Returns counts + by-domain / by-echelon tallies.
    function computeUnitComposition(scenario) {
        var sc   = scenario || null;
        var blue = (sc && Array.isArray(sc.blue_units_initial)) ? sc.blue_units_initial : [];
        var red  = (sc && Array.isArray(sc.red_units))          ? sc.red_units          : [];

        function hasCoord(u) {
            var c = u && u.coord;
            if (c == null) return false;
            if (Array.isArray(c)) return c.length >= 2 && c[0] != null && c[1] != null;
            if (typeof c === 'object') return c.lat != null && c.lng != null;
            return false;
        }
        function tally(units, key, acc) {
            units.forEach(function (u) {
                var v = (u && u[key] != null && String(u[key]) !== '') ? String(u[key]) : '(none)';
                acc[v] = (acc[v] || 0) + 1;
            });
            return acc;
        }

        var all = blue.concat(red);
        return {
            total:        all.length,
            blue:         blue.length,
            red:          red.length,
            byDomain:     tally(all, 'domain',  {}),
            byEchelon:    tally(all, 'echelon', {}),
            missingCoord: all.filter(function (u) { return !hasCoord(u); }).length
        };
    }

    // Read-only render of the composition into #uild-comp-list. textContent only.
    // Fixed labels carry data-i18n; category names (domain/echelon) are scenario
    // data rendered via textContent (no data-i18n). Empty state when no scenario.
    function paintUnitComposition() {
        var list = document.getElementById('uild-comp-list');
        if (!list) return;
        list.innerHTML = '';

        function addRow(labelKey, labelText, valueText) {
            var row = document.createElement('div');
            row.className = 'sw-kv-row';
            var dt = document.createElement('dt');
            if (labelKey) { dt.setAttribute('data-i18n', labelKey); dt.textContent = tx(labelKey, labelText); }
            else          { dt.textContent = labelText; }   // scenario data — no i18n
            var dd = document.createElement('dd');
            dd.textContent = valueText;
            row.appendChild(dt); row.appendChild(dd);
            list.appendChild(row);
        }
        function addHdr(labelKey, labelText) {
            var row = document.createElement('div');
            row.className = 'sw-kv-row uild-section-hdr';
            var dt = document.createElement('dt');
            dt.setAttribute('data-i18n', labelKey);
            dt.textContent = tx(labelKey, labelText);
            row.appendChild(dt);
            row.appendChild(document.createElement('dd'));
            list.appendChild(row);
        }
        function addBreakdown(tallyObj, hdrKey, hdrText) {
            var keys = Object.keys(tallyObj);
            if (keys.length === 0) return;
            keys.sort(function (a, b) { return tallyObj[b] - tallyObj[a] || (a < b ? -1 : a > b ? 1 : 0); });
            addHdr(hdrKey, hdrText);
            keys.forEach(function (k) { addRow(null, k, String(tallyObj[k])); });
        }

        var sc = getScenario();
        var hasUnits = sc && (Array.isArray(sc.blue_units_initial) || Array.isArray(sc.red_units));
        if (!hasUnits) {
            var er = document.createElement('div');
            er.className = 'sw-kv-row uild-comp--empty';
            var ed = document.createElement('dd');
            ed.className = 'uild-empty-msg';
            ed.setAttribute('data-i18n', 'uild-empty');
            ed.textContent = tx('uild-empty', 'Load a scenario to see unit composition.');
            er.appendChild(ed);
            list.appendChild(er);
            return;
        }

        var c = computeUnitComposition(sc);
        addRow('uild-field-total',         'Total units',         String(c.total));
        addRow('uild-field-blue',          'Blue units',          String(c.blue));
        addRow('uild-field-red',           'Red units',           String(c.red));
        addRow('uild-field-missing-coord', 'Missing coordinates', String(c.missingCoord));
        addBreakdown(c.byDomain,  'uild-field-domain',  'By domain');
        addBreakdown(c.byEchelon, 'uild-field-echelon', 'By echelon');
    }

    // ── PR-287F: Red Attrition (step-aware) ──────────────────────────────
    // Pure read of one step object. No DOM, no map, no window.units, no
    // network, no mutation. Returns red battle-damage aggregates for the step.
    function computeStepAttrition(step) {
        var st = step || null;
        var losses = (st && typeof st.red_losses_cumulative_baseline === 'number')
                     ? st.red_losses_cumulative_baseline : null;
        var degraded = (st && Array.isArray(st.red_degraded_baseline))
                       ? st.red_degraded_baseline.length : null;
        var strengthObj = (st && st.red_strength_baseline &&
                           typeof st.red_strength_baseline === 'object')
                          ? st.red_strength_baseline : null;
        var strengthSum = null, strengthFull = null, strengthTotal = null;
        if (strengthObj) {
            var keys = Object.keys(strengthObj);
            strengthTotal = keys.length;
            strengthSum = 0; strengthFull = 0;
            keys.forEach(function (k) {
                var v = strengthObj[k];
                if (typeof v === 'number') {
                    strengthSum += v;
                    if (v >= 1) strengthFull++;
                }
            });
            strengthSum = Math.round(strengthSum * 10) / 10;
        }
        return {
            losses:        losses,
            degraded:      degraded,
            strengthSum:   strengthSum,
            strengthFull:  strengthFull,
            strengthTotal: strengthTotal
        };
    }

    // Read-only render of step attrition into #sw-attr-list. textContent only.
    // Fixed labels carry data-i18n. Empty state when no scenario / no step.
    function paintStepAttrition() {
        var list = document.getElementById('sw-attr-list');
        if (!list) return;
        list.innerHTML = '';
        var dash = tx('sw-value-none', '—');

        function addRow(labelKey, labelText, valueText) {
            var row = document.createElement('div');
            row.className = 'sw-kv-row';
            var dt = document.createElement('dt');
            dt.setAttribute('data-i18n', labelKey);
            dt.textContent = tx(labelKey, labelText);
            var dd = document.createElement('dd');
            dd.textContent = valueText;
            row.appendChild(dt); row.appendChild(dd);
            list.appendChild(row);
        }

        var sc   = getScenario();
        var step = getActiveStep();
        if (!sc || !step) {
            var er = document.createElement('div');
            er.className = 'sw-kv-row uild-comp--empty';
            var ed = document.createElement('dd');
            ed.className = 'uild-empty-msg';
            ed.setAttribute('data-i18n', 'sw-attr-empty');
            ed.textContent = tx('sw-attr-empty', 'Load a scenario to see red attrition.');
            er.appendChild(ed);
            list.appendChild(er);
            return;
        }

        var a = computeStepAttrition(step);
        addRow('sw-attr-losses',   'Cumulative losses', a.losses   !== null ? String(a.losses)   : dash);
        addRow('sw-attr-degraded', 'Degraded units',    a.degraded !== null ? String(a.degraded) : dash);
        addRow('sw-attr-strength', 'Strength index',    a.strengthSum !== null ? a.strengthSum.toFixed(1) : dash);
        addRow('sw-attr-full',     'Full-strength units',
               (a.strengthFull !== null && a.strengthTotal !== null)
               ? (String(a.strengthFull) + ' / ' + String(a.strengthTotal)) : dash);
    }

    // PR-287G: pure read of one step object — engagement tempo counts.
    // Prefer the precomputed n_* count; fall back to array length; never assume a key.
    function computeStepActivity(step) {
        var st = step || null;
        function cnt(numKey, arrKey) {
            if (st && typeof st[numKey] === 'number') return st[numKey];
            if (st && Array.isArray(st[arrKey])) return st[arrKey].length;
            return null;
        }
        return {
            actors:   cnt('n_actors',          'actors'),
            affected: cnt('n_affected',        'affected'),
            arcs:     cnt('n_engagement_arcs', 'engagement_arcs')
        };
    }

    // Read-only render of engagement tempo into #sw-tempo-list. textContent only.
    // Fixed labels carry data-i18n. Empty state when no scenario / no step.
    function paintStepActivity() {
        var list = document.getElementById('sw-tempo-list');
        if (!list) return;
        list.innerHTML = '';
        var dash = tx('sw-value-none', '—');

        function addRow(labelKey, labelText, valueText) {
            var row = document.createElement('div');
            row.className = 'sw-kv-row';
            var dt = document.createElement('dt');
            dt.setAttribute('data-i18n', labelKey);
            dt.textContent = tx(labelKey, labelText);
            var dd = document.createElement('dd');
            dd.textContent = valueText;
            row.appendChild(dt); row.appendChild(dd);
            list.appendChild(row);
        }

        var sc   = getScenario();
        var step = getActiveStep();
        if (!sc || !step) {
            var er = document.createElement('div');
            er.className = 'sw-kv-row uild-comp--empty';
            var ed = document.createElement('dd');
            ed.className = 'uild-empty-msg';
            ed.setAttribute('data-i18n', 'sw-tempo-empty');
            ed.textContent = tx('sw-tempo-empty', 'Load a scenario to see engagement tempo.');
            er.appendChild(ed);
            list.appendChild(er);
            return;
        }

        var a = computeStepActivity(step);
        addRow('sw-tempo-actors',   'Actors engaged',  a.actors   !== null ? String(a.actors)   : dash);
        addRow('sw-tempo-affected', 'Units affected',  a.affected !== null ? String(a.affected) : dash);
        addRow('sw-tempo-arcs',     'Engagement arcs', a.arcs      !== null ? String(a.arcs)     : dash);
    }

    // ── PR-45: Operator Intent Draft Card ────────────────────────────────
    // In-memory placeholder fields — no backend, no mutation, no persistence.
    // PR-49: liveKey drives resolveLiveValue(). Dot-paths ('obj.name') resolve
    // on the scenario root; bare keys resolve on the active step.
    // null liveKey → always use i18n fallback (no scenario wiring).
    var OID_FIELDS = [
        { labelKey: 'oid-field-phase',          valueKey: 'oid-value-phase',          mod: 'phase',     liveKey: 'phase'                   },
        { labelKey: 'oid-field-objective',      valueKey: 'oid-value-objective',      mod: '',          liveKey: 'obj.name'                },
        { labelKey: 'oid-field-decision-point', valueKey: 'oid-value-decision-point', mod: '',          liveKey: 'decision_point_baseline' },
        { labelKey: 'oid-field-narrative',      valueKey: 'oid-value-narrative',      mod: 'narrative', liveKey: 'narrative_en_fallback'   },
        { labelKey: 'oid-field-force-ratio',    valueKey: 'oid-value-force-ratio',    mod: '',          liveKey: 'force_ratio_baseline'    },
        { labelKey: 'oid-field-phase-line',     valueKey: 'oid-value-phase-line',     mod: '',          liveKey: 'phase_line_km_baseline'  },
        { labelKey: 'oid-field-constraints',    valueKey: 'oid-value-constraints',    mod: '',          liveKey: null                      },
        { labelKey: 'oid-field-safety',         valueKey: 'oid-value-safety',         mod: '',          liveKey: null                      },
        { labelKey: 'oid-status-label',         valueKey: 'oid-status-value',         mod: 'status',    liveKey: null                      },
    ];

    function paintIntentCard() {
        var kv = document.getElementById('oid-kv-list');
        if (!kv) return;
        kv.innerHTML = '';

        OID_FIELDS.forEach(function (field) {
            var row = document.createElement('div');
            row.className = 'oid-row';

            var label = document.createElement('dt');
            label.className = 'oid-label';
            label.setAttribute('data-i18n', field.labelKey);
            label.textContent = tx(field.labelKey, field.labelKey);

            var value = document.createElement('dd');
            value.className = 'oid-value' + (field.mod ? ' oid-value--' + field.mod : '');

            // PR-49: use live scenario data when available, else i18n fallback
            var liveVal = resolveLiveValue(field.liveKey || null);
            if (liveVal !== null) {
                // Do NOT set data-i18n — applyLanguage() would overwrite a live value.
                // paintIntentCard() is always called on language change via chainLang,
                // so live values are re-resolved on each language switch.
                value.textContent = liveVal;
            } else {
                value.setAttribute('data-i18n', field.valueKey);
                value.textContent = tx(field.valueKey, '');
            }

            row.appendChild(label);
            row.appendChild(value);
            kv.appendChild(row);
        });

        // Disclaimer paragraph (static in HTML, but keep i18n in sync)
        var disclaimer = document.getElementById('oid-disclaimer');
        if (disclaimer) {
            disclaimer.setAttribute('data-i18n', 'oid-disclaimer');
            disclaimer.textContent = tx('oid-disclaimer', '');
        }

        // Draft badge (static in HTML, but keep i18n in sync)
        var badge = document.querySelector('#oid-card .oid-draft-badge');
        if (badge) {
            badge.setAttribute('data-i18n', 'oid-draft-badge');
            badge.textContent = tx('oid-draft-badge', 'Draft only');
        }
    }

    // ── PR-46: AI Proposal Card ───────────────────────────────────────────
    // Mock/in-memory preview only — no backend, no AI service, no mutation.
    var APC_FIELDS = [
        { labelKey: 'apc-field-title',           valueKey: 'apc-value-title',           mod: ''       },
        { labelKey: 'apc-field-source',          valueKey: 'apc-value-source',          mod: 'source' },
        { labelKey: 'apc-field-linked-intent',   valueKey: 'apc-value-linked-intent',   mod: ''       },
        { labelKey: 'apc-field-summary',         valueKey: 'apc-value-summary',         mod: ''       },
        { labelKey: 'apc-field-assumptions',     valueKey: 'apc-value-assumptions',     mod: ''       },
        { labelKey: 'apc-field-risks',           valueKey: 'apc-value-risks',           mod: ''       },
        { labelKey: 'apc-field-operator-action', valueKey: 'apc-value-operator-action', mod: 'action' },
        { labelKey: 'apc-field-status',          valueKey: 'apc-value-status',          mod: 'status' },
    ];

    function paintProposalCard() {
        var kv = document.getElementById('apc-kv-list');
        if (!kv) return;
        kv.innerHTML = '';

        APC_FIELDS.forEach(function (field) {
            var row = document.createElement('div');
            row.className = 'apc-row';

            var label = document.createElement('dt');
            label.className = 'apc-label';
            label.setAttribute('data-i18n', field.labelKey);
            label.textContent = tx(field.labelKey, field.labelKey);

            var value = document.createElement('dd');
            value.className = 'apc-value' + (field.mod ? ' apc-value--' + field.mod : '');

            // PR-49: wire apc-value-linked-intent to live scenario phase when available.
            if (field.valueKey === 'apc-value-linked-intent') {
                var livePhase = resolveLiveValue('phase');
                if (livePhase !== null) {
                    value.textContent = tx('apc-linked-intent-prefix', 'Operator Intent Draft') +
                                        ' (' + livePhase + ')';
                } else {
                    value.setAttribute('data-i18n', field.valueKey);
                    value.textContent = tx(field.valueKey, '');
                }
            } else {
                value.setAttribute('data-i18n', field.valueKey);
                value.textContent = tx(field.valueKey, '');
            }

            row.appendChild(label);
            row.appendChild(value);
            kv.appendChild(row);
        });

        // Disclaimer paragraph
        var disclaimer = document.getElementById('apc-disclaimer');
        if (disclaimer) {
            disclaimer.setAttribute('data-i18n', 'apc-disclaimer');
            disclaimer.textContent = tx('apc-disclaimer', '');
        }

        // Mock badge
        var badge = document.querySelector('#apc-card .apc-mock-badge');
        if (badge) {
            badge.setAttribute('data-i18n', 'apc-mock-badge');
            badge.textContent = tx('apc-mock-badge', 'Mock preview');
        }
    }

    // ── PR-47: Proposal Review Action Shell ──────────────────────────────
    // UI-only preview — no mutation, no persistence, no commit, no backend.
    // praSelection holds the current in-memory-only preview choice.
    var praSelection = null; // 'approve' | 'reject' | 'hold' | null

    function paintProposalActions() {
        // Re-render button labels and disclaimer for current language.
        // Does NOT reset the selection state — keeps UI consistent on lang switch.
        var btnApprove = document.getElementById('pra-btn-approve');
        var btnReject  = document.getElementById('pra-btn-reject');
        var btnHold    = document.getElementById('pra-btn-hold');
        var selLabel   = document.querySelector('#pra-selection-row .pra-selection-label');
        var selValue   = document.getElementById('pra-selection-value');
        var disclaimer = document.getElementById('pra-disclaimer');
        var badge      = document.querySelector('#pra-card .pra-preview-badge');

        if (btnApprove) { btnApprove.setAttribute('data-i18n', 'pra-btn-approve'); btnApprove.textContent = tx('pra-btn-approve', 'Approve'); }
        if (btnReject)  { btnReject.setAttribute('data-i18n',  'pra-btn-reject');  btnReject.textContent  = tx('pra-btn-reject',  'Reject');  }
        if (btnHold)    { btnHold.setAttribute('data-i18n',    'pra-btn-hold');    btnHold.textContent    = tx('pra-btn-hold',    'Hold');    }
        if (selLabel)   { selLabel.setAttribute('data-i18n', 'pra-selection-label'); selLabel.textContent = tx('pra-selection-label', 'Preview selection'); }
        if (badge)      { badge.setAttribute('data-i18n', 'pra-preview-badge');     badge.textContent    = tx('pra-preview-badge', 'Preview only'); }

        if (selValue) {
            if (praSelection) {
                var selKey = 'pra-selection-' + praSelection;
                selValue.setAttribute('data-i18n', selKey);
                selValue.setAttribute('data-decision', praSelection);
                selValue.textContent = tx(selKey, praSelection);
            } else {
                selValue.setAttribute('data-i18n', 'pra-no-selection');
                selValue.removeAttribute('data-decision');
                selValue.textContent = tx('pra-no-selection', '—');
            }
        }

        if (disclaimer) {
            disclaimer.setAttribute('data-i18n', 'pra-disclaimer');
            disclaimer.textContent = tx('pra-disclaimer', '');
        }
    }

    function initProposalActions() {
        // Wire click handlers once. Each handler:
        //   1. Updates praSelection (in-memory only)
        //   2. Toggles .pra-btn--selected class on buttons
        //   3. Calls paintProposalActions() to refresh the preview label
        // No persistence. No API calls. No mutation. No event log.
        var btns = {
            approve: document.getElementById('pra-btn-approve'),
            reject:  document.getElementById('pra-btn-reject'),
            hold:    document.getElementById('pra-btn-hold'),
        };

        Object.keys(btns).forEach(function (decision) {
            var btn = btns[decision];
            if (!btn) return;
            btn.addEventListener('click', function () {
                // Toggle: clicking the active selection resets to null
                praSelection = (praSelection === decision) ? null : decision;

                // Update selected state on all buttons
                Object.keys(btns).forEach(function (d) {
                    if (btns[d]) {
                        if (praSelection === d) {
                            btns[d].classList.add('pra-btn--selected');
                        } else {
                            btns[d].classList.remove('pra-btn--selected');
                        }
                    }
                });

                paintProposalActions();
                paintDecisionSummary();
                // No event log. No decision record. No API call.
            });
        });
    }

    // ── PR-48: Decision Preview Summary ─────────────────────────────────
    // Mirrors praSelection state. UI-only. No persistence. No mutation.
    var DPS_STATIC_FIELDS = [
        { labelKey: 'dps-field-scenario-effect', valueKey: 'dps-scenario-effect',  mod: 'static'  },
        { labelKey: 'dps-field-record-status',   valueKey: 'dps-record-status',    mod: 'static'  },
        { labelKey: 'dps-field-commit-status',   valueKey: 'dps-commit-status',    mod: 'static'  },
        { labelKey: 'dps-field-source-scenario', valueKey: 'dps-source-scenario',  mod: 'static'  },
    ];

    function paintDecisionSummary() {
        var list = document.getElementById('dps-kv-list');
        if (!list) return;

        // Determine decision label and meaning key from praSelection
        var decisionMod, decisionValueKey, meaningKey;
        if (praSelection === 'approve') {
            decisionMod      = 'approve';
            decisionValueKey = 'dps-value-approve';
            meaningKey       = 'dps-meaning-approve';
        } else if (praSelection === 'reject') {
            decisionMod      = 'reject';
            decisionValueKey = 'dps-value-reject';
            meaningKey       = 'dps-meaning-reject';
        } else if (praSelection === 'hold') {
            decisionMod      = 'hold';
            decisionValueKey = 'dps-value-hold';
            meaningKey       = 'dps-meaning-hold';
        } else {
            decisionMod      = 'none';
            decisionValueKey = 'dps-value-no-selection';
            meaningKey       = 'dps-meaning-none';
        }

        // Build rows array: decision, meaning, 4 statics, safety
        var rows = [];

        // Row 1: preview decision
        rows.push({
            label:    tx('dps-field-decision', 'Preview decision'),
            value:    tx(decisionValueKey, '—'),
            valueMod: 'decision',
            dataDec:  decisionMod,
        });

        // Row 2: meaning
        rows.push({
            label:    tx('dps-field-meaning', 'Meaning'),
            value:    tx(meaningKey, '—'),
            valueMod: 'meaning',
            dataDec:  null,
        });

        // Rows 3-6: static fields
        DPS_STATIC_FIELDS.forEach(function (f) {
            rows.push({
                label:    tx(f.labelKey, f.labelKey),
                value:    tx(f.valueKey, f.valueKey),
                valueMod: f.mod,
                dataDec:  null,
            });
        });

        // Row 7: safety note
        rows.push({
            label:    tx('dps-field-safety', 'Safety note'),
            value:    tx('dps-safety-note', 'Preview only. No decision is recorded and the scenario is unchanged.'),
            valueMod: 'safety',
            dataDec:  null,
        });

        // Render
        var html = '';
        rows.forEach(function (row) {
            var decAttr = row.dataDec ? (' data-decision="' + row.dataDec + '"') : '';
            html += '<div class="dps-row">';
            html += '<dt class="dps-label">' + row.label + '</dt>';
            html += '<dd class="dps-value dps-value--' + row.valueMod + '"' + decAttr + '>' + row.value + '</dd>';
            html += '</div>';
        });
        list.innerHTML = html;
    }

    // ── PR-68: Scenario Metadata Snapshot Card ──────────────────────────
    // Read-only. Reads window.RmoozScenario.scenario metadata fields only.
    // No mutation, no backend, no storage, no event log.

    function paintMetaCard() {
        var labelEl  = document.getElementById('sw-meta-label-val');
        var stepsEl  = document.getElementById('sw-meta-steps-val');
        var phasesEl = document.getElementById('sw-meta-phases-val');
        var bboxEl   = document.getElementById('sw-meta-bbox-val');
        var schemaEl = document.getElementById('sw-meta-schema-val');
        if (!labelEl) return;

        var sc   = getScenario();
        var dash = tx('sw-value-none', '—');

        function setVal(el, v) { if (el) { el.removeAttribute('data-i18n'); el.textContent = (v != null && v !== '') ? String(v) : dash; } }

        if (!sc) {
            setVal(labelEl, null); setVal(stepsEl, null);
            setVal(phasesEl, null); setVal(bboxEl, null); setVal(schemaEl, null);
            return;
        }

        // Label / name
        var lbl = (sc.scenario_label != null && sc.scenario_label !== '') ? sc.scenario_label
                : (sc.name          != null && sc.name          !== '') ? sc.name : null;
        setVal(labelEl, lbl);

        // Step count
        var steps = Array.isArray(sc.steps) ? sc.steps.length : null;
        setVal(stepsEl, steps);

        // Phase count — may be array or already a number
        var phases = Array.isArray(sc.phase_table) ? sc.phase_table.length
                   : (typeof sc.phase_table === 'number' ? sc.phase_table : null);
        setVal(phasesEl, phases);

        // Bounding box [W, S, E, N] → "W, S – E, N"
        var bbox    = sc.map_bbox;
        var bboxStr = (Array.isArray(bbox) && bbox.length === 4)
            ? bbox.slice(0, 2).map(function(v){ return Number(v).toFixed(2); }).join(', ')
              + ' – '
              + bbox.slice(2, 4).map(function(v){ return Number(v).toFixed(2); }).join(', ')
            : null;
        setVal(bboxEl, bboxStr);

        // Schema variant
        setVal(schemaEl, (sc.schema_variant != null && sc.schema_variant !== '') ? sc.schema_variant : null);
    }

    // ── PR-132: Scenario Briefing Panel ─────────────────────────────────
    // Read-only display of scenario briefing fields added in PR-132:
    //   purpose_en/ar, end_state_en/ar, constraints[], assumptions[].
    // Language-aware: uses _ar variants when document dir="rtl".
    // textContent only — no innerHTML, no markdown, no links.
    // No mutation, no backend, no storage, no Event Log entries.
    function paintBriefingCard() {
        var purposeEl     = document.getElementById('sw-brfg-purpose');
        var endStateEl    = document.getElementById('sw-brfg-end-state');
        var constraintsEl = document.getElementById('sw-brfg-constraints-list');
        var assumptionsEl = document.getElementById('sw-brfg-assumptions-list');
        var sourceEl      = document.getElementById('sw-brfg-source');
        if (!purposeEl) return;

        var sc   = getScenario();
        var dash = tx('sw-value-none', '—');
        var isAr = (document.documentElement.getAttribute('dir') === 'rtl' ||
                    document.documentElement.getAttribute('lang') === 'ar');

        function setTxt(el, val) {
            if (!el) return;
            el.removeAttribute('data-i18n');
            el.textContent = (val !== null && val !== undefined && String(val).trim() !== '')
                ? String(val) : dash;
        }

        function setList(el, arr) {
            if (!el) return;
            el.innerHTML = '';  // safe: we only appendChild li with textContent
            if (!Array.isArray(arr) || arr.length === 0) {
                var li = document.createElement('li');
                li.textContent = tx('sw-act-none', 'None recorded');
                el.appendChild(li);
                return;
            }
            arr.forEach(function (item) {
                var li = document.createElement('li');
                li.textContent = String(item);
                el.appendChild(li);
            });
        }

        if (!sc) {
            setTxt(purposeEl, null);
            setTxt(endStateEl, null);
            setList(constraintsEl, null);
            setList(assumptionsEl, null);
            setTxt(sourceEl, null);
            return;
        }

        var purpose  = isAr ? (sc.purpose_ar  || sc.purpose_en)  : (sc.purpose_en  || sc.purpose_ar);
        var endState = isAr ? (sc.end_state_ar || sc.end_state_en) : (sc.end_state_en || sc.end_state_ar);
        setTxt(purposeEl,  purpose  || null);
        setTxt(endStateEl, endState || null);
        setList(constraintsEl, sc.constraints  || null);
        setList(assumptionsEl, sc.assumptions  || null);

        // Source: model_version + ported_from if present
        var src = sc.model_version || sc.name || null;
        if (src && sc.ported_from) src = src + ' · ' + sc.ported_from;
        setTxt(sourceEl, src);
    }

    // ── PR-132/134/136: goToStep ─────────────────────────────────────────────
    // The single safe step-advance function. Updates window.RmoozScenario.stepIndex
    // (the only allowed write) and repaints all step-aware cards.
    // No scenario mutation. No backend. No storage. No animation.
    // No engagement arcs. No unit_state reads. No combat data.
    // Hoisted to module scope so startPlayback() can reference it directly.
    function goToStep(newIdx) {
        var sc    = getScenario();
        var steps = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        if (!steps.length) return;
        if (newIdx < 0 || newIdx >= steps.length) return;
        // Update global step index — only stepIndex, never scenario object
        window.RmoozScenario.stepIndex = newIdx;
        // Clear preview mode so walkthrough card shows live mode
        previewStepIndex = null;
        // P4 (Wargame3 live): advance the map unit markers to the new step using the
        // scenario's step-aware coordinates (red_unit_step_coords / blue_unit_step_coords
        // via updateUnitPositions). Makes manual nav AND play/pause visibly move the
        // laydown through the phases. Read-only: marker positions only — no scenario
        // mutation, no combat sim. Safe no-op when the scenario isn't drawn on the map.
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.applyStepProgress === 'function') {
                window.AppAdjudicatorMap.applyStepProgress(newIdx);
            }
        } catch (_) { /* no-op */ }
        // RUNFIX-1 diagnostics: publish this run path's source summary so the
        // Play-vs-Trial mismatch is observable (window.__rmoozRunDiag.playAnimation;
        // set window.__rmoozRunDiagVerbose=true for a console line per step).
        try {
            var _mk = (window.AppAdjudicatorMap && window.AppAdjudicatorMap.getScenarioMarkers)
                ? window.AppAdjudicatorMap.getScenarioMarkers() : { red: [], blue: [] };
            var _sample = [].concat(_mk.red || [], _mk.blue || [])
                .map(function (m) { return { uid: m && m._unitId, ll: m && m.getLatLng && m.getLatLng() }; })
                .filter(function (s) { return s.uid && s.ll; })
                .sort(function (a, b) { return String(a.uid).localeCompare(String(b.uid)); })
                .slice(0, 5)
                .map(function (s) { return { uid: s.uid, lat: +s.ll.lat.toFixed(5), lng: +s.ll.lng.toFixed(5) }; });
            var _ptr = null;
            try { _ptr = JSON.parse(localStorage.getItem('rmooz.last-loaded') || 'null'); } catch (_) {}
            window.__rmoozRunDiag = window.__rmoozRunDiag || {};
            window.__rmoozRunDiag.playAnimation = {
                path: 'scenario-workspace goToStep → AppAdjudicatorMap.applyStepProgress (client step render)',
                scenario_id: sc && sc.scenario_id || null,
                scenario_name: sc && sc.name || null,
                scenario_label: sc && sc.scenario_label || null,
                step_index: newIdx,
                step_count: steps.length,
                unit_count: ((sc && sc.red_units && sc.red_units.length) || 0)
                          + ((sc && sc.blue_units_initial && sc.blue_units_initial.length) || 0),
                sample_units: _sample,
                world_state_projection: false,  // synthetic per-step state; positions from step coord tables
                preview_or_live: 'live step navigation (NOT adjudicated)',
                scenario_source: 'window.RmoozScenario.scenario' +
                    (_ptr && sc && _ptr.name === sc.name ? ' (= localStorage last-loaded pointer "' + _ptr.name + '")' : ' (in-memory)'),
                ts: Date.now(),
            };
            if (window.__rmoozRunDiagVerbose) console.debug('[run-diag]', 'playAnimation', window.__rmoozRunDiag.playAnimation);
        } catch (_) { /* diagnostics never break the run */ }
        // P4: keep the VISIBLE bottom transport bar coherent with the active step.
        // timeline.js is UI-only (its scenario-time stays at H+00:00), so sync the
        // time readout + phase chip here from the step's own time_label / phase.
        try {
            var _curStep = steps[newIdx] || {};
            var _tlTime = document.getElementById('tl-scenario-time');
            var _lbl = _curStep.time_label || _curStep.timeLabel;
            if (_tlTime && _lbl) _tlTime.textContent = String(_lbl);
            var _tlPhaseGroup = document.getElementById('tl-phase-group');
            var _phase = _curStep.phase;
            if (_tlPhaseGroup && _phase) {
                var _btns = _tlPhaseGroup.querySelectorAll('button');
                for (var _i = 0; _i < _btns.length; _i++) {
                    var _match = (_btns[_i].textContent || '').trim().toUpperCase() === String(_phase).trim().toUpperCase();
                    _btns[_i].classList.toggle('is-active', _match);
                    _btns[_i].setAttribute('aria-pressed', _match ? 'true' : 'false');
                }
            }
        } catch (_) { /* no-op */ }
        // Repaint all step-aware cards
        paintStepNavigator();
        paintScenarioOverview();
        paintPhaseTimeline();
        paintIntentCard();
        paintProposalCard();
        paintStepSummaryCard();
        paintNarrativeCard();
        paintDecisionPointCard();
        paintForceRatioCard();
        paintWalkthroughCard();
        paintActionsCard();
        paintScenarioOverlay();       // PR-138: rebuild overlay for new step
        paintDecisionPackageCards(); // PR-142: refresh decision package view for new step
        // PR-287F: step-aware red attrition + per-step BLS status.
        paintStepAttrition();
        paintBlsCard();
        paintStepActivity();          // PR-287G: step-aware engagement tempo
        // PR-287L2: keep the live scenario header + live decision card coherent on step nav.
        if (typeof paintLiveScenarioHeader === 'function')   { paintLiveScenarioHeader(); }
        if (typeof paintLiveDecisionActionCard === 'function'){ paintLiveDecisionActionCard(); }
    }

    // ── P4 (Wargame3 live): bottom transport bar → step playback bridge ──────────
    // shell/timeline.js is UI-only — it dispatches rmooz:timeline-ui-action but
    // nothing advanced the live scenario. Wire play / pause / step / speed to
    // goToStep so the visible transport bar moves the laydown through the 17
    // phases. Read-only: only stepIndex + marker positions change (via goToStep).
    // No combat sim, no AI, no decision options, no scenario mutation, no storage.
    var _swPlayTimer = null;
    var _swPlaySpeed = 1;
    function _swStepCount() { var sc = getScenario(); return (sc && Array.isArray(sc.steps)) ? sc.steps.length : 0; }
    function _swPlayIntervalMs() { return Math.max(60, Math.round(2000 / Math.max(1, _swPlaySpeed))); }
    function _swStopPlay() { if (_swPlayTimer) { clearInterval(_swPlayTimer); _swPlayTimer = null; } }
    function _swStartPlay() {
        _swStopPlay();
        if (!window.RmoozScenario || !_swStepCount()) return;
        _swPlayTimer = setInterval(function () {
            var total = _swStepCount();
            var cur = getActiveStepIndex();
            if (cur >= total - 1) {
                _swStopPlay();
                var pauseBtn = document.getElementById('tl-pause'); // reset transport visuals at end
                if (pauseBtn) { try { pauseBtn.click(); } catch (_) { /* no-op */ } }
                return;
            }
            goToStep(cur + 1);
        }, _swPlayIntervalMs());
    }
    function _bindTimelineTransport() {
        if (window.__swTimelineBridgeBound) return;
        window.__swTimelineBridgeBound = true;
        // Canonical runner (shell/scenario-runner.js) owns the bottom transport
        // when present — it is the single engine. This legacy bridge only binds
        // as a fallback, so we never run two playback timers off one click.
        if (window.AppScenarioRunner) return;
        document.addEventListener('rmooz:timeline-ui-action', function (e) {
            var action = e && e.detail && e.detail.action;
            var value  = e && e.detail && e.detail.value;
            if (!window.RmoozScenario || !_swStepCount()) return; // only drive a loaded live scenario
            switch (action) {
                case 'play':          _swStartPlay(); break;
                case 'pause':         _swStopPlay();  break;
                case 'step-forward':  _swStopPlay(); goToStep(getActiveStepIndex() + 1); break;
                case 'step-back':     _swStopPlay(); goToStep(getActiveStepIndex() - 1); break;
                case 'speed-changed': {
                    var sp = parseFloat(value);
                    if (isFinite(sp) && sp > 0) _swPlaySpeed = sp;
                    if (_swPlayTimer) _swStartPlay(); // restart at the new cadence
                    break;
                }
                default: break;
            }
        });
    }
    if (typeof document !== 'undefined') { _bindTimelineTransport(); }

    // ── PR-132/134/136: Step Navigator ───────────────────────────────────────
    function paintStepNavigator() {
        var counterEl   = document.getElementById('sw-nav-counter');
        var stepInfoEl  = document.getElementById('sw-nav-step-info');
        var btnFirst    = document.getElementById('sw-nav-first');
        var btnPrev     = document.getElementById('sw-nav-prev');
        var btnNext     = document.getElementById('sw-nav-next');
        var btnLast     = document.getElementById('sw-nav-last');
        var phaseBadge  = document.getElementById('sw-nav-phase-badge');
        var phaseOfEl   = document.getElementById('sw-nav-phase-of');
        if (!counterEl) return;

        var sc      = getScenario();
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var curIdx  = getActiveStepIndex();
        var total   = steps.length;
        var step    = steps[curIdx] || null;

        // Button disabled states
        var atStart = (!total || curIdx <= 0);
        var atEnd   = (!total || curIdx >= total - 1);
        if (btnFirst) btnFirst.disabled = atStart;
        if (btnPrev)  btnPrev.disabled  = atStart;
        if (btnNext)  btnNext.disabled  = atEnd;
        if (btnLast)  btnLast.disabled  = atEnd;

        if (!total || !step) {
            if (counterEl)  counterEl.textContent  = '— / —';
            if (stepInfoEl) stepInfoEl.textContent = '—';
            if (phaseBadge) { phaseBadge.textContent = '—'; phaseBadge.removeAttribute('data-phase'); }
            if (phaseOfEl)  phaseOfEl.textContent  = '—';
            // PR-287L: reset status badge when no live step.
            var navStatusElEmpty = document.getElementById('sw-nav-status-badge');
            if (navStatusElEmpty) {
                navStatusElEmpty.setAttribute('data-status', 'pending');
                navStatusElEmpty.textContent = '—';
            }
            paintPlayButton();
            return;
        }

        // Step counter: "3 / 17"
        if (counterEl) counterEl.textContent = (curIdx + 1) + ' / ' + total;

        // Step info: time_label only — phase shown in badge
        if (stepInfoEl) stepInfoEl.textContent = step.time_label || '—';

        // Phase badge: "PHASE 2A" with data-phase for CSS colour
        var phaseName = step.phase || '';
        if (phaseBadge) {
            phaseBadge.textContent = phaseName || '—';
            if (phaseName) {
                phaseBadge.setAttribute('data-phase', phaseName);
            } else {
                phaseBadge.removeAttribute('data-phase');
            }
        }

        // Phase-in-step counter: "Step 3 of 5 in PRE-H"
        if (phaseOfEl && phaseName) {
            var stepsInPhase = steps.filter(function (s) { return s.phase === phaseName; });
            var posInPhase   = stepsInPhase.indexOf(step) + 1;  // 1-based
            var totalInPhase = stepsInPhase.length;
            phaseOfEl.textContent = tx('sw-nav-phase-of', 'Step {0} of {1} in {2}')
                .replace('{0}', String(posInPhase))
                .replace('{1}', String(totalInPhase))
                .replace('{2}', phaseName);
        } else if (phaseOfEl) {
            phaseOfEl.textContent = '—';
        }

        // PR-287L: per-step status badge for the active live step.
        var navStatusEl = document.getElementById('sw-nav-status-badge');
        if (navStatusEl && typeof getLiveStepStatus === 'function') {
            var navSt = getLiveStepStatus(curIdx).status;
            navStatusEl.setAttribute('data-status', navSt);
            navStatusEl.textContent = (typeof _liveStepStatusLabel === 'function')
                ? _liveStepStatusLabel(navSt) : navSt;
        }

        paintPlayButton();   // PR-136: keep play button state in sync
    }

    // ── PR-136: Play button repaint ───────────────────────────────────────────
    // Pure display repaint only. No timer start/stop. No state mutation beyond DOM.
    function paintPlayButton() {
        var btn = document.getElementById('sw-nav-play');
        var sel = document.getElementById('sw-nav-speed');
        if (!btn) return;
        var sc      = getScenario();
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var curIdx  = getActiveStepIndex();
        var hasScenario = !!(steps.length);
        var atEnd   = hasScenario && (curIdx >= steps.length - 1);
        // Disable when no scenario, or at final step while not currently playing
        btn.disabled = !hasScenario || (atEnd && !_swIsPlaying);
        btn.setAttribute('aria-pressed', _swIsPlaying ? 'true' : 'false');
        btn.textContent = _swIsPlaying
            ? tx('sw-nav-pause', '⏸ Pause')
            : tx('sw-nav-play',  '▶ Play');
        if (sel) sel.disabled = !hasScenario;
    }

    // ── PR-138: Read-only unit position overlay ───────────────────────────────
    // Reads blue_unit_step_coords / red_unit_step_coords from the scenario.
    // Renders L.circleMarker dots on a private L.layerGroup — no window.units
    // mutation, no engagement arcs, no combat data, no backend, no storage.

    function ensureScenarioOverlay() {
        if (_swScenarioOverlay) return _swScenarioOverlay;
        if (!window.L || !window.map) return null;
        _swScenarioOverlay = window.L.layerGroup();
        _swScenarioOverlay.addTo(window.map);
        return _swScenarioOverlay;
    }

    function clearScenarioOverlay() {
        if (_swScenarioOverlay) _swScenarioOverlay.clearLayers();
    }

    function stopScenarioOverlay() {
        clearScenarioOverlay();
        if (_swScenarioOverlay && window.map) {
            window.map.removeLayer(_swScenarioOverlay);
        }
        _swScenarioOverlay = null;
        _swOverlayEnabled  = false;
        paintOverlayToggleButton();
    }

    function isOffMapSentinel(coord) {
        // Deliberate out-of-bounds coord used for undeployed red units: [lng=18, lat=32]
        return coord[0] === 18 && coord[1] === 32;
    }

    function getOverlayUnitLabel(unit) {
        return unit.label || unit.name_ar || unit.uid || unit.unit_uid || '';
    }

    function buildScenarioOverlay(stepIdx) {
        if (!_swOverlayEnabled) return;
        var sc = getScenario();
        if (!sc || !window.map || !window.L) return;
        var grp = ensureScenarioOverlay();
        if (!grp) return;
        clearScenarioOverlay();

        // Build unit label lookup maps from initial unit arrays
        var blueLabels = {};
        var redLabels  = {};
        if (sc.blue_units_initial) {
            Object.keys(sc.blue_units_initial).forEach(function (k) {
                var u = sc.blue_units_initial[k];
                var id = u.unit_uid || u.base_id || k;
                blueLabels[id] = u;
            });
        }
        if (sc.red_units) {
            Object.keys(sc.red_units).forEach(function (k) {
                var u = sc.red_units[k];
                var id = u.uid || k;
                redLabels[id] = u;
            });
        }

        var step      = sc.steps && sc.steps[stepIdx];
        var unitState = (step && step.unit_state) ? step.unit_state : {};

        var blueColor = '#3b82f6';
        var redColor  = '#ef4444';
        var sides = sc.sides || [];
        for (var si = 0; si < sides.length; si++) {
            if (sides[si].id === 'BLUE') blueColor = sides[si].color;
            if (sides[si].id === 'RED')  redColor  = sides[si].color;
        }

        function addMarkers(coordTable, labelMap, color) {
            if (!coordTable) return;
            var uids = Object.keys(coordTable);
            for (var i = 0; i < uids.length; i++) {
                var uid = uids[i];
                var arr = coordTable[uid];
                if (!arr || !arr[stepIdx]) continue;
                var coord = arr[stepIdx];
                if (!Array.isArray(coord) || coord.length < 2) continue;
                if (isOffMapSentinel(coord)) continue;
                // Coord table stores [lng, lat] WGS84 — Leaflet needs [lat, lng]
                var lat = coord[1];
                var lng = coord[0];
                var state      = unitState[uid] || {};
                var isActor    = !!state.is_actor;
                var isAffected = !!state.is_affected;
                var radius      = isActor ? 7 : 5;
                var fillOpacity = isAffected ? 0.65 : 0.45;
                var marker = window.L.circleMarker([lat, lng], {
                    radius:      radius,
                    color:       color,
                    fillColor:   color,
                    fillOpacity: fillOpacity,
                    opacity:     0.75,
                    weight:      1.5,
                    className:   'sw-overlay-dot'
                });
                var unit = labelMap[uid];
                if (unit) {
                    var lbl = getOverlayUnitLabel(unit);
                    if (lbl) marker.bindTooltip(lbl, { permanent: false, direction: 'top' });
                }
                marker.addTo(grp);
            }
        }

        addMarkers(sc.blue_unit_step_coords, blueLabels, blueColor);
        addMarkers(sc.red_unit_step_coords,  redLabels,  redColor);
    }

    function paintScenarioOverlay() {
        if (!_swOverlayEnabled) {
            clearScenarioOverlay();
            paintOverlayToggleButton();
            return;
        }
        buildScenarioOverlay(getActiveStepIndex());
        paintOverlayToggleButton();
    }

    function paintOverlayToggleButton() {
        var btn = document.getElementById('sw-nav-overlay-toggle');
        if (!btn) return;
        var sc     = getScenario();
        var hasMap = !!(window.map && window.L);
        btn.disabled    = !sc || !hasMap;
        // PR-287L2: relabel for clarity — "Show Live Unit Overlay" / "Hide Live Unit Overlay".
        btn.textContent = _swOverlayEnabled
            ? tx('sw-nav-overlay-hide', 'Hide Live Unit Overlay')
            : tx('sw-nav-overlay-show', 'Show Live Unit Overlay');
        // PR-287L2: keep live scenario header map-status row in sync with toggle state.
        if (typeof paintLiveScenarioHeader === 'function') {
            try { paintLiveScenarioHeader(); } catch (_) { /* no-op */ }
        }
    }

    // ── PR-142: Decision Package preview — read-only, in-memory, no backend ──
    // SAFETY: No fetch. No Blob. No storage. No mutation. No combat fields.
    // No auto-adjudication. Rejects any package without read_only === true.

    function normaliseConfidence(value) {
        if (value === null || value === undefined) return null;
        // PR-145: fixture packages use string labels — map before parseFloat
        if (typeof value === 'string') {
            var strMap = { HIGH: 0.80, MEDIUM: 0.55, LOW: 0.30, UNKNOWN: null };
            var upper  = value.toUpperCase();
            if (Object.prototype.hasOwnProperty.call(strMap, upper)) return strMap[upper];
        }
        var n = parseFloat(value);
        return isNaN(n) ? null : Math.min(1, Math.max(0, n));
    }

    function normaliseSides(sides) {
        if (!Array.isArray(sides)) return [];
        return sides.map(function (s) {
            if (typeof s === 'string') return { id: s, name: s };
            return { id: String(s.id || s.name || ''), name: String(s.name || s.id || '') };
        });
    }

    function normaliseObjective(objective) {
        if (!objective || typeof objective !== 'object') return null;
        return {
            coord:   Array.isArray(objective.coord) ? objective.coord : null,
            name_ar: String(objective.name_ar || objective.name || ''),
            name_en: String(objective.name_en || objective.name || ''),
            name:    String(objective.name || objective.name_en || objective.name_ar || ''),
            id:      String(objective.id || ''),
            status:  objective.status ? String(objective.status) : null
        };
    }

    function normaliseDecisionPoint(dp) {
        if (!dp || typeof dp !== 'object') return null;
        return {
            question_ar: String(dp.question_ar || dp.question || ''),
            question_en: String(dp.question_en || dp.question || ''),
            required:    dp.required !== false
        };
    }

    function normaliseAction(action) {
        if (!action || typeof action !== 'object') return null;
        return {
            uid:       String(action.uid || action.actor_uid || action.unit_uid || ''), // PR-145: actor_uid
            side:      String(action.side || ''),
            action:    String(action.action || ''),
            from_step: action.from_step !== undefined ? action.from_step : null,
            to_step:   action.to_step   !== undefined ? action.to_step   : null
        };
    }

    function normaliseAffectedUnit(item) {
        if (!item) return null;
        // PR-145: fixture packages pass plain UID strings in affected_units[]
        if (typeof item === 'string') {
            return { uid: item, side: '', status_change: '' };
        }
        if (typeof item !== 'object') return null;
        return {
            uid:           String(item.uid || item.unit_uid || ''),
            side:          String(item.side || ''),
            status_change: String(item.status_change || item.change || '')
        };
    }

    // PR-142A: normalise a step.units[] entry — uid/side/name/role/status/position.
    // Reads position from unit.position or unit.coord ([lng,lat]). No coord flip — display only.
    // No combat fields. No mutation.
    function normaliseUnit(unit) {
        if (!unit || typeof unit !== 'object') return null;
        var pos = null;
        if (Array.isArray(unit.position) && unit.position.length >= 2) {
            pos = [unit.position[0], unit.position[1]];
        } else if (Array.isArray(unit.coord) && unit.coord.length >= 2) {
            pos = [unit.coord[0], unit.coord[1]];
        }
        return {
            uid:     String(unit.uid      || unit.unit_uid || ''),
            side:    String(unit.side     || ''),
            name:    String(unit.name     || unit.name_en  || unit.name_ar || ''),
            name_ar: String(unit.name_ar  || unit.name     || ''),
            name_en: String(unit.name_en  || unit.name     || ''),
            role:    String(unit.role     || ''),
            status:  String(unit.status   || ''),
            position: pos   // [lng, lat] or null
        };
    }

    function normaliseResult(result) {
        if (!result || typeof result !== 'object') return null;
        return {
            // PR-145: fixture packages use effect_ar/effect_en; try before generic summary fallback
            summary_ar: String(result.summary_ar || result.effect_ar || result.summary || ''),
            summary_en: String(result.summary_en || result.effect_en || result.summary || '')
        };
    }

    function getObjectiveStatusClass(status) {
        if (!status) return '';
        var s = String(status).toLowerCase().replace(/[^a-z_]/g, '');
        // PR-145: extended with dormant/threatened/contested found in DP_01 fixtures
        var allowed = ['secure','held','complete','watched','at_risk','ready','open','in_progress',
                       'dormant','threatened','contested'];
        return allowed.indexOf(s) >= 0 ? 'sw-dpkg-status-' + s : '';
    }

    function normaliseDecisionPackage(manifest, steps) {
        if (!manifest || typeof manifest !== 'object') {
            throw new Error('Invalid manifest');
        }
        if (manifest.read_only !== true) {
            throw new Error('Package rejected: read_only !== true');
        }
        if (manifest.no_auto_adjudication !== true) {
            throw new Error('Package rejected: no_auto_adjudication !== true');
        }
        var warnings = [];
        var normSteps = [];
        if (Array.isArray(steps)) {
            normSteps = steps.map(function (raw, idx) {
                var obj      = normaliseObjective(raw.objective);
                var dps      = Array.isArray(raw.decision_points)
                    ? raw.decision_points.map(normaliseDecisionPoint).filter(Boolean) : [];
                var affected = Array.isArray(raw.affected_units)
                    ? raw.affected_units.map(normaliseAffectedUnit).filter(Boolean) : [];
                // PR-142A: normalise step.units[] — primary units list for Units Card
                var units    = Array.isArray(raw.units)
                    ? raw.units.map(normaliseUnit).filter(Boolean) : [];
                var result   = normaliseResult(raw.result);
                if (obj === null) warnings.push('Step ' + idx + ': missing objective');
                return {
                    step_index:      raw.step_index !== undefined ? Number(raw.step_index) : idx,
                    objective:       obj,
                    decision_points: dps,
                    confidence:      normaliseConfidence(raw.confidence),
                    units:           units,    // PR-142A: full step unit roster
                    affected_units:  affected, // retained for Step Card summary
                    result:          result,
                    source_trace:     raw.source_trace     || null,  // PR-152 passthrough
                    time_label:       raw.time_label      || '',     // PR-155 passthrough
                    phase:            raw.phase           || '',     // PR-155 passthrough
                    objective_status:  raw.objective_status  || '',    // PR-155 passthrough
                    selected_decision: raw.selected_decision !== undefined
                                       ? raw.selected_decision : null,  // PR-156
                    actions:           Array.isArray(raw.actions)         ? raw.actions         : [],  // PR-156
                    counter_actions:   Array.isArray(raw.counter_actions) ? raw.counter_actions : [],  // PR-156
                    risks:             raw.risks || null,   // PR-156
                    notes:             raw.notes || null,   // PR-156
                    options:           Array.isArray(raw.options) ? raw.options : [],  // PR-159: needed for selected_decision label lookup
                    // PR-166: passthrough fields — no UI impact; needed for PR-167 staging
                    step_id:           raw.step_id   || '',
                    situation:         raw.situation  || null,  // { summary_ar, summary_en }
                    safety:            raw.safety     || null   // per-step safety flags
                };
            });
        } else {
            warnings.push('No steps array in package');
        }
        return {
            manifest:             manifest,
            steps:                normSteps,
            warnings:             warnings,
            read_only:            true,
            no_auto_adjudication: true
        };
    }

    // ── PR-168: Staging Candidate Validator ─────────────────────────────────
    // Pure function. No side effects, no I/O, no mutation, no UI, no fetch,
    // no storage. Accepts one normalised step (output of normaliseDecisionPackage)
    // and returns a StagingValidationResult. Not called from any UI path.
    // Exposed on window.AppShellScenarioWorkspace.validateStagingCandidate for
    // console/test access only.
    function validateStagingCandidate(step) {
        if (!step || typeof step !== 'object') {
            return {
                passed: false,
                checks: {
                    hasStepIdentity:     false,
                    hasSituationContext: false,
                    hasSafetyFlags:      false,
                    hasSelectedDecision: false,
                    hasUnitReferences:   false,
                    hasSourceTrace:      false
                },
                blockedReasons: ['input is not a valid normalised step object'],
                warnings:       []
            };
        }

        var blocked  = [];
        var warnings = [];
        var checks   = {};

        // 1. hasStepIdentity
        var indexOk = typeof step.step_index === 'number' && isFinite(step.step_index);
        var idOk    = typeof step.step_id    === 'string' && step.step_id.length > 0;
        checks.hasStepIdentity = indexOk && idOk;
        if (!checks.hasStepIdentity) {
            blocked.push('missing step identity (step_index or step_id absent)');
        }

        // 2. hasSituationContext — warning only, not a hard block
        var sit      = step.situation;
        var hasArTxt = sit && typeof sit.summary_ar === 'string' && sit.summary_ar.trim().length > 0;
        var hasEnTxt = sit && typeof sit.summary_en === 'string' && sit.summary_en.trim().length > 0;
        checks.hasSituationContext = !!(hasArTxt || hasEnTxt);
        if (!checks.hasSituationContext) {
            warnings.push('missing situation context (situation.summary_ar / summary_en absent)');
        }

        // 3. hasSafetyFlags — hard block if safety explicitly permits auto-apply or real commit
        var safety     = step.safety;
        var unsafeFlag = false;
        if (safety && typeof safety === 'object') {
            if (safety.auto_apply         === true
             || safety.allow_commit       === true
             || safety.no_auto_adjudication === false
             || safety.read_only            === false) {
                unsafeFlag = true;
            }
        }
        checks.hasSafetyFlags = !unsafeFlag;
        if (unsafeFlag) {
            blocked.push('unsafe safety flags (safety explicitly permits auto-apply or real commit)');
        }

        // 4. hasSelectedDecision — hard block if absent; warning if unresolvable string
        var sd        = step.selected_decision;
        var sdPresent = sd !== null && sd !== undefined && sd !== '';
        checks.hasSelectedDecision = sdPresent;
        if (!sdPresent) {
            blocked.push('no decision selected (selected_decision is absent or null)');
        } else if (typeof sd === 'string') {
            var opts     = Array.isArray(step.options) ? step.options : [];
            var resolves = opts.some(function (opt) {
                return opt && (opt.id === sd || opt.value === sd
                            || opt.label === sd || opt.label_ar === sd || opt.label_en === sd);
            });
            if (!resolves) {
                warnings.push('selected_decision is an unresolved raw ID — cannot confirm it maps to an option object');
            }
        }

        // 5. hasUnitReferences — hard block if empty + hard block on non-numeric coords
        var units    = Array.isArray(step.units)           ? step.units           : [];
        var affected = Array.isArray(step.affected_units)  ? step.affected_units  : [];
        var acts     = Array.isArray(step.actions)         ? step.actions         : [];
        var cacts    = Array.isArray(step.counter_actions) ? step.counter_actions : [];
        var anyRefs  = (units.length > 0 || affected.length > 0 || acts.length > 0 || cacts.length > 0);
        checks.hasUnitReferences = anyRefs;
        if (!anyRefs) {
            blocked.push('no unit/action references (units, affected_units, actions, counter_actions all empty)');
        }

        // Coordinate validation — hard block on non-numeric coords when coords are present
        var badCoords = false;
        units.forEach(function (u) {
            if (!u || !u.position) return;
            var pos = u.position;
            var lat = pos.lat !== undefined ? pos.lat : (Array.isArray(pos) ? pos[1] : undefined);
            var lng = pos.lng !== undefined ? pos.lng : (Array.isArray(pos) ? pos[0] : undefined);
            if (lat !== undefined && (!isFinite(Number(lat)) || !isFinite(Number(lng)))) {
                badCoords = true;
            }
        });
        var obj = step.objective;
        if (obj && Array.isArray(obj.coord)) {
            var cLng = obj.coord[0], cLat = obj.coord[1];
            if (!isFinite(Number(cLng)) || !isFinite(Number(cLat))) {
                badCoords = true;
            }
        }
        if (badCoords) {
            checks.hasUnitReferences = false;
            blocked.push('invalid coordinates (non-numeric coordinate value found)');
        }

        if (units.length > 0) {
            var anyPos = units.some(function (u) { return u && u.position; });
            if (!anyPos) warnings.push('no unit positions — units present but no position data');
        }
        if (acts.length === 0 && cacts.length === 0 && anyRefs) {
            warnings.push('no actions or counter-actions recorded for this step');
        }

        // 6. hasSourceTrace — warning only, not a hard block
        var st   = step.source_trace;
        var stOk = st && typeof st === 'object'
                && typeof st.source_file === 'string' && st.source_file.length > 0;
        checks.hasSourceTrace = !!stOk;
        if (!checks.hasSourceTrace) {
            warnings.push('missing source trace (source_trace or source_trace.source_file absent)');
        }

        return {
            passed:         blocked.length === 0,
            checks:         checks,
            blockedReasons: blocked,
            warnings:       warnings
        };
    }

    // ── PR-172: Staging Proposal Safety Constants & Type Guard ───────────────
    // Pure constants and a pure guard function. No side effects, no I/O,
    // no mutation, no UI. Not called from any UI path in this PR.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    // STAGING_PROPOSAL_SAFETY — the exact safety invariant every StagingProposal
    // must satisfy. All five flags are hard-locked. Frozen so no caller can mutate
    // the reference and produce a falsely "safe" candidate.
    var STAGING_PROPOSAL_SAFETY = Object.freeze({
        dryRun:               true,
        committed:            false,
        autoApplyAllowed:     false,
        liveMutationAllowed:  false,
        backendCommitAllowed: false
    });

    // Unsafe status values — any of these means the proposal has left the safe
    // pre-approval lifecycle and must not be accepted by the guard.
    var _UNSAFE_STATUSES = ['approved', 'applied', 'committed', 'live', 'executing'];

    // Fields whose presence (with a truthy value) is an immediate hard block.
    var _UNSAFE_FIELDS = [
        'applyNow', 'commitNow', 'mutateLiveScenario',
        'mutateMap', 'mutateUnits', 'backendCommit'
    ];

    // isStagingProposalSafe(candidate)
    // Returns { passed: boolean, blockedReasons: string[] }.
    // Passes only when all five STAGING_PROPOSAL_SAFETY flags match exactly,
    // no unsafe status is set, no unsafe fields are present, and
    // proposedEffects contains no live-mutation markers.
    function isStagingProposalSafe(candidate) {
        var blocked = [];

        if (!candidate || typeof candidate !== 'object') {
            return { passed: false, blockedReasons: ['input is not an object'] };
        }

        // 1. Safety sub-object must exist
        var s = candidate.safety;
        if (!s || typeof s !== 'object') {
            blocked.push('safety object is absent or not an object');
            return { passed: false, blockedReasons: blocked };
        }

        // 2. Five hard-locked flag checks
        if (s.dryRun !== true)
            blocked.push('safety.dryRun must be true');
        if (s.committed !== false)
            blocked.push('safety.committed must be false');
        if (s.autoApplyAllowed !== false)
            blocked.push('safety.autoApplyAllowed must be false');
        if (s.liveMutationAllowed !== false)
            blocked.push('safety.liveMutationAllowed must be false');
        if (s.backendCommitAllowed !== false)
            blocked.push('safety.backendCommitAllowed must be false');

        // 3. Status must not be an unsafe lifecycle value
        if (candidate.status !== undefined && candidate.status !== null) {
            var st = String(candidate.status).toLowerCase();
            for (var i = 0; i < _UNSAFE_STATUSES.length; i++) {
                if (st === _UNSAFE_STATUSES[i]) {
                    blocked.push('status "' + candidate.status + '" indicates a committed or applied state');
                    break;
                }
            }
        }

        // 4. Top-level unsafe fields
        for (var j = 0; j < _UNSAFE_FIELDS.length; j++) {
            var f = _UNSAFE_FIELDS[j];
            if (candidate[f]) blocked.push('unsafe field present: ' + f);
        }

        // 5. proposedEffects must not carry live-mutation markers
        var fx = candidate.proposedEffects;
        if (fx && typeof fx === 'object') {
            if (fx.liveMutation)    blocked.push('proposedEffects.liveMutation is set');
            if (fx.applyToLive)     blocked.push('proposedEffects.applyToLive is set');
            if (fx.mutateMap)       blocked.push('proposedEffects.mutateMap is set');
        }

        return {
            passed:         blocked.length === 0,
            blockedReasons: blocked
        };
    }

    // ── PR-173: Staging Proposal Builder (dry-run, pure function) ────────────
    // Builds a StagingProposal from a validated normalised step.
    // Pure function — no side effects, no I/O, no mutation, no UI, no storage.
    // Does NOT create global state. Does NOT store the returned proposal.
    // Exposed on window.AppShellScenarioWorkspace.buildStagingProposal for
    // console/test access only. Not called from any UI path in this PR.
    //
    // options (all optional):
    //   packageId, packageName, createdBy, nowIso, idPrefix
    function buildStagingProposal(normalisedStep, options) {
        var opts = (options && typeof options === 'object') ? options : {};

        // 1. Validate first — hard blocks abort immediately
        var validation = validateStagingCandidate(normalisedStep);
        if (!validation.passed) {
            return {
                passed:         false,
                proposal:       null,
                blockedReasons: validation.blockedReasons,
                warnings:       validation.warnings
            };
        }

        // 2. Deep-clone helper — structuredClone with JSON fallback
        function deepClone(val) {
            if (val === null || val === undefined) return val;
            if (typeof structuredClone === 'function') {
                try { return structuredClone(val); } catch (_) {}
            }
            try { return JSON.parse(JSON.stringify(val)); } catch (_) { return null; }
        }

        // 3. Generate a unique ID that is stable enough for a dry-run session
        var pfx = typeof opts.idPrefix === 'string' ? opts.idPrefix : 'SP';
        var id  = pfx + '-' + Date.now().toString(36).toUpperCase()
                + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();

        // 4. Timestamp
        var createdAt = (typeof opts.nowIso === 'string' && opts.nowIso)
            ? opts.nowIso
            : new Date().toISOString();

        // 5. Source provenance
        var st         = normalisedStep.source_trace || null;
        var sourceFile = (st && typeof st.source_file === 'string') ? st.source_file : null;

        // 6. Build proposal — all step arrays/objects are deep copies; no live refs
        var proposal = {
            id:          id,
            packageId:   typeof opts.packageId   === 'string' ? opts.packageId   : '',
            packageName: typeof opts.packageName === 'string' ? opts.packageName : '',
            stepId:      normalisedStep.step_id    || '',
            stepIndex:   normalisedStep.step_index,
            createdAt:   createdAt,
            createdBy:   typeof opts.createdBy === 'string' ? opts.createdBy : null,

            status: 'draft',

            validation: {
                passed:         validation.passed,
                checks:         deepClone(validation.checks),
                blockedReasons: deepClone(validation.blockedReasons),
                warnings:       deepClone(validation.warnings)
            },

            // Copy constant values into a new plain object.
            // Must NOT be a reference to STAGING_PROPOSAL_SAFETY — callers
            // must not be able to affect the constant by mutating the proposal.
            safety: {
                dryRun:               STAGING_PROPOSAL_SAFETY.dryRun,
                committed:            STAGING_PROPOSAL_SAFETY.committed,
                autoApplyAllowed:     STAGING_PROPOSAL_SAFETY.autoApplyAllowed,
                liveMutationAllowed:  STAGING_PROPOSAL_SAFETY.liveMutationAllowed,
                backendCommitAllowed: STAGING_PROPOSAL_SAFETY.backendCommitAllowed
            },

            source: {
                sourceFile:  sourceFile,
                sourceTrace: deepClone(st)
            },

            snapshot: {
                situation:        deepClone(normalisedStep.situation),
                objective:        deepClone(normalisedStep.objective),
                selectedDecision: deepClone(normalisedStep.selected_decision),
                units:            deepClone(normalisedStep.units)           || [],
                affectedUnits:    deepClone(normalisedStep.affected_units)  || [],
                actions:          deepClone(normalisedStep.actions)         || [],
                counterActions:   deepClone(normalisedStep.counter_actions) || [],
                result:           deepClone(normalisedStep.result)
            },

            // Empty until UID reconciliation solves package-UID → live-UID mapping
            proposedEffects: {
                unitStatusChanges:   [],
                unitPositionChanges: [],
                mapOverlays:         [],
                timelineNotes:       []
            },

            operatorReview: {
                reviewedBy: null,
                reviewedAt: null,
                decision:   'pending',
                notes:      null
            }
        };

        // 7. Self-check — run the type guard on our own output before returning
        var guard = isStagingProposalSafe(proposal);
        if (!guard.passed) {
            return {
                passed:         false,
                proposal:       null,
                blockedReasons: ['isStagingProposalSafe self-check failed: ' + guard.blockedReasons.join('; ')],
                warnings:       validation.warnings
            };
        }

        return {
            passed:         true,
            proposal:       proposal,
            blockedReasons: [],
            warnings:       validation.warnings
        };
    }

    // ── PR-177: Operator Review Record Type Guard ─────────────────────────────
    // Pure constants and a pure guard function. No side effects, no I/O,
    // no mutation, no UI, no storage. Not called from any UI path in this PR.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    // Decisions that are valid and safe for a finalised review record.
    // 'pending' is intentionally absent — a finalised record must have a decision.
    var _REVIEW_ALLOWED_DECISIONS = ['approve_dry_run', 'reject', 'hold'];

    // Decisions that are explicitly forbidden (PR-176 §4 copy-hardening rules).
    var _REVIEW_FORBIDDEN_DECISIONS = ['apply', 'commit', 'execute', 'run_live', 'accept_and_apply'];

    // Top-level fields whose presence (with a truthy value) is an immediate hard block.
    var _REVIEW_UNSAFE_FIELDS = [
        'applyNow', 'commitNow', 'executeNow',
        'mutateMap', 'mutateUnits', 'mutateLines',
        'mutateScenario', 'backendCommit', 'autoApprove'
    ];

    // isOperatorReviewRecordSafe(record)
    // Returns { passed: boolean, blockedReasons: string[] }.
    // Passes only when: record is a valid object; proposalId and reviewedAt are
    // present; decision is one of the three allowed values (not any forbidden alias);
    // no unsafe fields are set; and any safetySnapshot / validationSnapshot
    // sub-objects satisfy their respective invariants.
    function isOperatorReviewRecordSafe(record) {
        var blocked = [];

        if (!record || typeof record !== 'object') {
            return { passed: false, blockedReasons: ['input is not an object'] };
        }

        // 1. Required identity fields
        if (!record.proposalId || typeof record.proposalId !== 'string') {
            blocked.push('proposalId is required and must be a non-empty string');
        }
        if (!record.reviewedAt || typeof record.reviewedAt !== 'string') {
            blocked.push('reviewedAt is required and must be a non-empty string');
        }

        // 2. Decision must be present and must not be a forbidden alias
        if (record.decision === undefined || record.decision === null) {
            blocked.push('decision is required');
        } else {
            var dec = String(record.decision).toLowerCase();

            var isForbidden = false;
            for (var i = 0; i < _REVIEW_FORBIDDEN_DECISIONS.length; i++) {
                if (dec === _REVIEW_FORBIDDEN_DECISIONS[i]) {
                    blocked.push('decision "' + record.decision + '" is a forbidden value — must be approve_dry_run, reject, or hold');
                    isForbidden = true;
                    break;
                }
            }

            if (!isForbidden) {
                var isAllowed = false;
                for (var j = 0; j < _REVIEW_ALLOWED_DECISIONS.length; j++) {
                    if (record.decision === _REVIEW_ALLOWED_DECISIONS[j]) {
                        isAllowed = true;
                        break;
                    }
                }
                if (!isAllowed) {
                    blocked.push('decision "' + record.decision + '" is not a recognised review decision');
                }
            }
        }

        // 3. Unsafe top-level fields
        for (var k = 0; k < _REVIEW_UNSAFE_FIELDS.length; k++) {
            var uf = _REVIEW_UNSAFE_FIELDS[k];
            if (record[uf]) blocked.push('unsafe field present: ' + uf);
        }

        // 4. safetySnapshot — if present, all five safety flags must match invariants
        if (record.safetySnapshot !== undefined && record.safetySnapshot !== null) {
            var ss = record.safetySnapshot;
            if (typeof ss !== 'object') {
                blocked.push('safetySnapshot must be an object');
            } else {
                if (ss.dryRun !== true)
                    blocked.push('safetySnapshot.dryRun must be true');
                if (ss.committed !== false)
                    blocked.push('safetySnapshot.committed must be false');
                if (ss.autoApplyAllowed !== false)
                    blocked.push('safetySnapshot.autoApplyAllowed must be false');
                if (ss.liveMutationAllowed !== false)
                    blocked.push('safetySnapshot.liveMutationAllowed must be false');
                if (ss.backendCommitAllowed !== false)
                    blocked.push('safetySnapshot.backendCommitAllowed must be false');
            }
        }

        // 5. validationSnapshot — if present, block if hard blockedReasons exist
        if (record.validationSnapshot !== undefined && record.validationSnapshot !== null) {
            var vs = record.validationSnapshot;
            if (typeof vs !== 'object') {
                blocked.push('validationSnapshot must be an object');
            } else if (Array.isArray(vs.blockedReasons) && vs.blockedReasons.length > 0) {
                blocked.push('validationSnapshot has ' + vs.blockedReasons.length +
                             ' hard blocked reason(s) — record is not safe to accept');
            }
        }

        return {
            passed:         blocked.length === 0,
            blockedReasons: blocked
        };
    }

    // ── PR-179: Dry-Run Confirmation Type Guard ───────────────────────────────
    // Pure constants and a pure guard function. No side effects, no I/O,
    // no mutation, no UI, no storage. Not called from any UI path in this PR.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    // The only permitted mode value for a DryRunConfirmation (PR-178 §3).
    var DRY_RUN_CONFIRMATION_MODE = 'dry_run_only';

    // Mode/status strings that imply live action — forbidden in any DryRunConfirmation.
    var _DRC_FORBIDDEN_MODES = ['apply', 'commit', 'execute', 'run_live', 'go_live', 'live'];

    // Top-level fields whose presence (truthy) is an immediate hard block.
    var _DRC_UNSAFE_FIELDS = [
        'applyNow', 'commitNow', 'executeNow',
        'mutateMap', 'mutateUnits', 'mutateLines',
        'mutateScenario', 'backendCommit', 'autoAdvance', 'liveApply'
    ];

    // Names of the four required effectsPreview arrays.
    var _DRC_EFFECTS_ARRAYS = [
        'unitStatusChanges', 'unitPositionChanges', 'mapOverlays', 'timelineNotes'
    ];

    // isDryRunConfirmationSafe(candidate)
    // Returns { passed: boolean, blockedReasons: string[] }.
    // Passes only when: candidate is a valid object; required identity fields are
    // present; all three hard-locked booleans are correct; mode is "dry_run_only";
    // effectsPreview exists with valid arrays; no unsafe fields or live-mutation
    // markers are present; and any safetySnapshot sub-object satisfies its invariants.
    function isDryRunConfirmationSafe(candidate) {
        var blocked = [];

        if (!candidate || typeof candidate !== 'object') {
            return { passed: false, blockedReasons: ['input is not an object'] };
        }

        // 1. Required identity fields
        if (!candidate.proposalId || typeof candidate.proposalId !== 'string') {
            blocked.push('proposalId is required and must be a non-empty string');
        }
        if (!candidate.confirmedAt || typeof candidate.confirmedAt !== 'string') {
            blocked.push('confirmedAt is required and must be a non-empty string');
        }

        // 2. mode must be exactly "dry_run_only" — check forbidden aliases first
        if (candidate.mode === undefined || candidate.mode === null) {
            blocked.push('mode is required');
        } else {
            var m = String(candidate.mode).toLowerCase();
            var modeForbidden = false;
            for (var i = 0; i < _DRC_FORBIDDEN_MODES.length; i++) {
                if (m === _DRC_FORBIDDEN_MODES[i]) {
                    blocked.push('mode "' + candidate.mode + '" implies live action — only "dry_run_only" is permitted');
                    modeForbidden = true;
                    break;
                }
            }
            if (!modeForbidden && candidate.mode !== DRY_RUN_CONFIRMATION_MODE) {
                blocked.push('mode must be "dry_run_only", got "' + candidate.mode + '"');
            }
        }

        // 3. Hard-locked boolean invariants
        if (candidate.liveScenarioChanged !== false) {
            blocked.push('liveScenarioChanged must be false');
        }
        if (candidate.committed !== false) {
            blocked.push('committed must be false');
        }
        if (candidate.blockedFromLiveApply !== true) {
            blocked.push('blockedFromLiveApply must be true');
        }

        // 4. effectsPreview must exist as an object with all four arrays
        var fx = candidate.effectsPreview;
        if (!fx || typeof fx !== 'object') {
            blocked.push('effectsPreview is required and must be an object');
        } else {
            for (var j = 0; j < _DRC_EFFECTS_ARRAYS.length; j++) {
                var key = _DRC_EFFECTS_ARRAYS[j];
                if (!Array.isArray(fx[key])) {
                    blocked.push('effectsPreview.' + key + ' must be an array');
                }
            }
            // Live-mutation markers inside effectsPreview
            if (fx.liveMutation)    blocked.push('effectsPreview.liveMutation is set');
            if (fx.applyToLive)     blocked.push('effectsPreview.applyToLive is set');
            if (fx.mutateMap)       blocked.push('effectsPreview.mutateMap is set');
            if (fx.mutateUnits)     blocked.push('effectsPreview.mutateUnits is set');
            if (fx.commitToScenario) blocked.push('effectsPreview.commitToScenario is set');
        }

        // 5. Unsafe top-level fields
        for (var k = 0; k < _DRC_UNSAFE_FIELDS.length; k++) {
            var uf = _DRC_UNSAFE_FIELDS[k];
            if (candidate[uf]) blocked.push('unsafe field present: ' + uf);
        }

        // 6. safetySnapshot — if present, all five flags must match invariants
        if (candidate.safetySnapshot !== undefined && candidate.safetySnapshot !== null) {
            var ss = candidate.safetySnapshot;
            if (typeof ss !== 'object') {
                blocked.push('safetySnapshot must be an object');
            } else {
                if (ss.dryRun !== true)
                    blocked.push('safetySnapshot.dryRun must be true');
                if (ss.committed !== false)
                    blocked.push('safetySnapshot.committed must be false');
                if (ss.autoApplyAllowed !== false)
                    blocked.push('safetySnapshot.autoApplyAllowed must be false');
                if (ss.liveMutationAllowed !== false)
                    blocked.push('safetySnapshot.liveMutationAllowed must be false');
                if (ss.backendCommitAllowed !== false)
                    blocked.push('safetySnapshot.backendCommitAllowed must be false');
            }
        }

        return {
            passed:         blocked.length === 0,
            blockedReasons: blocked
        };
    }

    // ── PR-180: Dry-Run Confirmation Builder (pure function) ─────────────────
    // Builds a DryRunConfirmation from a safe StagingProposal and a safe
    // OperatorReviewRecord whose decision is "approve_dry_run".
    // Pure function — no side effects, no I/O, no mutation, no UI, no storage.
    // Does NOT create global state. Does NOT store the returned confirmation.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.
    // Not wired to any UI path in this PR.
    //
    // options (all optional): confirmedBy, confirmedAt, notes
    function buildDryRunConfirmation(proposal, reviewRecord, options) {
        var opts = (options && typeof options === 'object') ? options : {};
        var blocked = [];
        var warnings = [];

        // 1. Proposal safety check
        var propGuard = isStagingProposalSafe(proposal);
        if (!propGuard.passed) {
            return {
                passed:         false,
                confirmation:   null,
                blockedReasons: ['proposal failed isStagingProposalSafe: ' + propGuard.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        // 2. Review record safety check
        var recGuard = isOperatorReviewRecordSafe(reviewRecord);
        if (!recGuard.passed) {
            return {
                passed:         false,
                confirmation:   null,
                blockedReasons: ['reviewRecord failed isOperatorReviewRecordSafe: ' + recGuard.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        // 3. Decision must be approve_dry_run — pending/reject/hold all block
        if (!reviewRecord || reviewRecord.decision !== 'approve_dry_run') {
            var got = reviewRecord ? ('"' + reviewRecord.decision + '"') : 'absent';
            return {
                passed:         false,
                confirmation:   null,
                blockedReasons: ['reviewRecord.decision must be "approve_dry_run", got ' + got],
                warnings:       warnings
            };
        }

        // 4. Deep-clone helper — structuredClone with JSON fallback
        function deepClone(val) {
            if (val === null || val === undefined) return val;
            if (typeof structuredClone === 'function') {
                try { return structuredClone(val); } catch (_) {}
            }
            try { return JSON.parse(JSON.stringify(val)); } catch (_) { return null; }
        }

        // 5. Timestamp
        var confirmedAt = (typeof opts.confirmedAt === 'string' && opts.confirmedAt)
            ? opts.confirmedAt
            : new Date().toISOString();

        // 6. Warn if effectsPreview will be empty (expected until UID reconciliation)
        warnings.push('effectsPreview arrays are empty — UID reconciliation is not yet solved');

        // 7. Build confirmation — all values copied; no live references to inputs
        var confirmation = {
            proposalId:   proposal.id || '',
            confirmedBy:  typeof opts.confirmedBy === 'string' ? opts.confirmedBy : null,
            confirmedAt:  confirmedAt,

            // Hard-locked mode and invariants — never overridable at construction
            mode:                 DRY_RUN_CONFIRMATION_MODE,
            liveScenarioChanged:  false,
            committed:            false,
            blockedFromLiveApply: true,

            // Deep copies of safety, validation, and review state at build time
            safetySnapshot:     deepClone(proposal.safety),
            validationSnapshot: deepClone(proposal.validation),
            reviewSnapshot: {
                decision:   reviewRecord.decision,
                reviewedBy: reviewRecord.reviewedBy || null,
                reviewedAt: reviewRecord.reviewedAt || null,
                notes:      reviewRecord.notes      || null
            },

            // Empty until UID reconciliation maps package UIDs to live RMOOZ UIDs
            effectsPreview: {
                unitStatusChanges:   [],
                unitPositionChanges: [],
                mapOverlays:         [],
                timelineNotes:       []
            },

            notes: typeof opts.notes === 'string' ? opts.notes : null
        };

        // 8. Self-check — run the type guard on our own output before returning
        var selfCheck = isDryRunConfirmationSafe(confirmation);
        if (!selfCheck.passed) {
            return {
                passed:         false,
                confirmation:   null,
                blockedReasons: ['isDryRunConfirmationSafe self-check failed: ' + selfCheck.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        return {
            passed:         true,
            confirmation:   confirmation,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // ── PR-183: UID Reconciliation Result Type Guard ──────────────────────────
    // Pure constants and a pure guard function. No side effects, no I/O,
    // no mutation, no UI, no storage, no UID matching logic.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    // Permitted confidence values for a ReconciliationResult (PR-182 §3).
    var RECONCILIATION_CONFIDENCE_LEVELS = Object.freeze(
        ['high', 'medium', 'low', 'blocked']
    );

    // Permitted matchMethod values for each MatchedUnit (PR-182 §5).
    // Any method not in this list is an immediate hard block.
    var MATCH_METHODS = Object.freeze(
        ['exact_uid_match', 'alias_match', 'name_type_match', 'location_proximity_match']
    );

    // matchMethod strings that imply guessing — forbidden in any MatchedUnit.
    var _RR_FORBIDDEN_METHODS = ['guessed', 'ai_guess', 'manual_guess', 'forced_match'];

    // Top-level fields whose presence (truthy) is an immediate hard block.
    var _RR_UNSAFE_FIELDS = [
        'applyNow', 'commitNow', 'mutateLiveUnits', 'mutateUnits',
        'mutateMap', 'mutateLines', 'mutateScenario',
        'backendCommit', 'autoApply', 'liveApply'
    ];

    // Per-unit fields whose presence (truthy) inside a matchedUnits item is a hard block.
    // Covers both singular and plural forms to catch naming variations.
    var _RR_UNIT_UNSAFE_FIELDS = [
        'applyNow', 'mutateUnit', 'mutateUnits', 'forceMatch',
        'commitNow', 'liveApply', 'autoApply'
    ];

    // isReconciliationResultSafe(candidate)
    // Returns { passed: boolean, blockedReasons: string[] }.
    // Passes only when: candidate is a valid object; readOnly and liveMutationAllowed
    // are hard-locked; confidence is one of the four permitted values; all five arrays
    // exist; internal consistency rules hold (passed/confidence/conflicts/blockedReasons);
    // no unsafe fields; and each matchedUnit has a permitted matchMethod.
    function isReconciliationResultSafe(candidate) {
        var blocked = [];

        if (!candidate || typeof candidate !== 'object') {
            return { passed: false, blockedReasons: ['input is not an object'] };
        }

        // 1. Hard-locked safety flags
        if (candidate.readOnly !== true) {
            blocked.push('readOnly must be true');
        }
        if (candidate.liveMutationAllowed !== false) {
            blocked.push('liveMutationAllowed must be false');
        }

        // 2. Confidence must be a permitted value
        var confValid = false;
        if (candidate.confidence === undefined || candidate.confidence === null) {
            blocked.push('confidence is required');
        } else {
            for (var i = 0; i < RECONCILIATION_CONFIDENCE_LEVELS.length; i++) {
                if (candidate.confidence === RECONCILIATION_CONFIDENCE_LEVELS[i]) {
                    confValid = true;
                    break;
                }
            }
            if (!confValid) {
                blocked.push('confidence "' + candidate.confidence + '" is not a permitted value');
            }
        }

        // 3. Required arrays
        var arrayFields = ['matchedUnits', 'unresolvedUnits', 'conflicts', 'warnings', 'blockedReasons'];
        for (var j = 0; j < arrayFields.length; j++) {
            if (!Array.isArray(candidate[arrayFields[j]])) {
                blocked.push(arrayFields[j] + ' must be an array');
            }
        }

        // 4. Internal consistency: passed === true constraints
        if (candidate.passed === true) {
            // confidence must be high or medium
            if (confValid && candidate.confidence !== 'high' && candidate.confidence !== 'medium') {
                blocked.push('passed is true but confidence is "' + candidate.confidence + '" — must be high or medium');
            }
            // no conflicts
            if (Array.isArray(candidate.conflicts) && candidate.conflicts.length > 0) {
                blocked.push('passed is true but conflicts array is non-empty (' + candidate.conflicts.length + ')');
            }
            // no blockedReasons
            if (Array.isArray(candidate.blockedReasons) && candidate.blockedReasons.length > 0) {
                blocked.push('passed is true but blockedReasons array is non-empty (' + candidate.blockedReasons.length + ')');
            }
        }

        // 5. confidence === "blocked" requires passed === false
        if (confValid && candidate.confidence === 'blocked' && candidate.passed === true) {
            blocked.push('confidence is "blocked" but passed is true — must be false');
        }

        // 6. Unsafe top-level fields
        for (var k = 0; k < _RR_UNSAFE_FIELDS.length; k++) {
            var uf = _RR_UNSAFE_FIELDS[k];
            if (candidate[uf]) blocked.push('unsafe field present: ' + uf);
        }

        // 7. Validate each matchedUnit entry
        if (Array.isArray(candidate.matchedUnits)) {
            for (var m = 0; m < candidate.matchedUnits.length; m++) {
                var unit = candidate.matchedUnits[m];
                if (!unit || typeof unit !== 'object') {
                    blocked.push('matchedUnits[' + m + '] is not an object');
                    continue;
                }

                // Check for forbidden match methods
                var methodForbidden = false;
                if (unit.matchMethod !== undefined) {
                    for (var n = 0; n < _RR_FORBIDDEN_METHODS.length; n++) {
                        if (unit.matchMethod === _RR_FORBIDDEN_METHODS[n]) {
                            blocked.push('matchedUnits[' + m + '].matchMethod "' + unit.matchMethod + '" is a forbidden guess-based method');
                            methodForbidden = true;
                            break;
                        }
                    }
                    // Must also be in the allowed list
                    if (!methodForbidden) {
                        var methodAllowed = false;
                        for (var p = 0; p < MATCH_METHODS.length; p++) {
                            if (unit.matchMethod === MATCH_METHODS[p]) {
                                methodAllowed = true;
                                break;
                            }
                        }
                        if (!methodAllowed) {
                            blocked.push('matchedUnits[' + m + '].matchMethod "' + unit.matchMethod + '" is not a recognised match method');
                        }
                    }
                }

                // Check for unsafe flags on the unit itself
                for (var q = 0; q < _RR_UNIT_UNSAFE_FIELDS.length; q++) {
                    var uuf = _RR_UNIT_UNSAFE_FIELDS[q];
                    if (unit[uuf]) {
                        blocked.push('matchedUnits[' + m + '] has unsafe flag: ' + uuf);
                    }
                }
            }
        }

        return {
            passed:         blocked.length === 0,
            blockedReasons: blocked
        };
    }

    // ── PR-184: UID Reconciliation Read-Only Builder ──────────────────────────
    // Pure function + private helpers. No side effects, no I/O, no mutation, no UI,
    // no storage, no window.units access. The caller must supply a pre-copied
    // liveUnitsSnapshot — the function must never read window.units itself.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    // Private helpers — all pure, no global references.

    function _rrClone(val) {
        if (val === null || val === undefined) return val;
        if (typeof structuredClone === 'function') {
            try { return structuredClone(val); } catch (_) {}
        }
        try { return JSON.parse(JSON.stringify(val)); } catch (_) { return null; }
    }

    // Returns uid/id/unit_id as a trimmed non-empty string, or null.
    function _rrNormId(unit) {
        if (!unit) return null;
        if (typeof unit === 'string') return unit.trim() || null;
        var v = unit.uid || unit.id || unit.unit_id || '';
        return String(v).trim() || null;
    }

    // Returns name_en / name / name_ar as lowercase trimmed string, or null.
    function _rrNormName(unit) {
        if (!unit) return null;
        var n = unit.name_en || unit.name || unit.name_ar ||
                unit.label_en || unit.label || '';
        return typeof n === 'string' ? n.trim().toLowerCase() || null : null;
    }

    // Returns side/faction/team as uppercase trimmed string, or null.
    function _rrUnitSide(unit) {
        if (!unit) return null;
        var s = unit.side || unit.faction || unit.team || '';
        return typeof s === 'string' ? s.trim().toUpperCase() || null : null;
    }

    // Returns type/category as lowercase trimmed string, or null.
    function _rrUnitType(unit) {
        if (!unit) return null;
        var t = unit.type || unit.category || unit.unit_type || '';
        return typeof t === 'string' ? t.trim().toLowerCase() || null : null;
    }

    // Returns [num, num] coordinate pair or null.
    // Validates each component is finite and within [-180, 180].
    function _rrUnitCoords(unit) {
        if (!unit) return null;
        var pair = null;
        if (Array.isArray(unit.position) && unit.position.length >= 2) {
            pair = [parseFloat(unit.position[0]), parseFloat(unit.position[1])];
        } else if (Array.isArray(unit.coordinates) && unit.coordinates.length >= 2) {
            pair = [parseFloat(unit.coordinates[0]), parseFloat(unit.coordinates[1])];
        } else if (unit.lat !== undefined && unit.lng !== undefined) {
            pair = [parseFloat(unit.lat), parseFloat(unit.lng)];
        }
        if (!pair) return null;
        if (!isFinite(pair[0]) || !isFinite(pair[1])) return null;
        if (pair[0] < -180 || pair[0] > 180 || pair[1] < -180 || pair[1] > 180) return null;
        return pair;
    }

    // Returns true if the unit has any position-like field set.
    function _rrHasCoordData(unit) {
        if (!unit) return false;
        return !!(unit.position || unit.coordinates ||
                  (unit.lat !== undefined && unit.lng !== undefined));
    }

    // Haversine great-circle distance in km between two [num, num] pairs.
    function _rrHaversineKm(a, b) {
        var R    = 6371;
        var dLat = (b[0] - a[0]) * Math.PI / 180;
        var dLng = (b[1] - a[1]) * Math.PI / 180;
        var lat1 = a[0] * Math.PI / 180;
        var lat2 = b[0] * Math.PI / 180;
        var s    = Math.sin(dLat / 2);
        var t    = Math.sin(dLng / 2);
        var h    = s * s + Math.cos(lat1) * Math.cos(lat2) * t * t;
        return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    // reconcileUidReferences(importedStep, liveUnitsSnapshot, options)
    //
    // Matches units in importedStep against caller-supplied liveUnitsSnapshot using
    // four read-only methods in priority order: exact_uid_match → alias_match →
    // name_type_match → location_proximity_match.
    //
    // options (all optional):
    //   maxDistanceKm  — proximity threshold (default 5 km)
    //
    // Returns { passed, result: ReconciliationResult|null, blockedReasons, warnings }.
    // Never reads window.units. Caller must copy window.units before passing.
    function reconcileUidReferences(importedStep, liveUnitsSnapshot, options) {
        var opts = (options && typeof options === 'object') ? options : {};

        // 1. Input validation — hard abort on bad inputs
        if (!importedStep || typeof importedStep !== 'object') {
            return {
                passed: false, result: null,
                blockedReasons: ['importedStep must be a non-null object'],
                warnings: []
            };
        }
        if (!Array.isArray(liveUnitsSnapshot)) {
            return {
                passed: false, result: null,
                blockedReasons: ['liveUnitsSnapshot must be provided by the caller as an array — never pass window.units directly'],
                warnings: []
            };
        }

        var maxDist  = (typeof opts.maxDistanceKm === 'number' && opts.maxDistanceKm > 0)
                        ? opts.maxDistanceKm : 5;
        var blocked  = [];
        var warnings = [];

        // 2. Collect imported units and build UID index for action validation
        var importedUnits = Array.isArray(importedStep.units) ? importedStep.units : [];
        if (importedUnits.length === 0) {
            warnings.push('importedStep.units is empty — no units to reconcile');
        }

        var importedIdIndex = {};
        for (var ii = 0; ii < importedUnits.length; ii++) {
            var iid = _rrNormId(importedUnits[ii]);
            if (iid) importedIdIndex[iid] = true;
        }

        // 3. Validate action references against imported unit index
        var actions = Array.isArray(importedStep.actions) ? importedStep.actions : [];
        for (var ai = 0; ai < actions.length; ai++) {
            var act = actions[ai];
            if (!act) continue;
            var actUid = _rrNormId(act) ||
                         String(act.actor_uid || act.unit_uid || '').trim() || null;
            if (actUid && !importedIdIndex[actUid]) {
                blocked.push('action references unit "' + actUid + '" not present in importedStep.units');
            }
        }

        // 4. Match each imported unit against the live snapshot
        var matchedUnits    = [];
        var unresolvedUnits = [];
        var conflicts       = [];
        var hasWeakMatch    = false;

        for (var mi = 0; mi < importedUnits.length; mi++) {
            var imp      = importedUnits[mi];
            var impId    = _rrNormId(imp);
            var impName  = _rrNormName(imp);
            var impSide  = _rrUnitSide(imp);
            var impType  = _rrUnitType(imp);
            var impCoords = _rrUnitCoords(imp);

            // If the unit claims position data but coordinates are invalid, hard block
            if (_rrHasCoordData(imp) && !impCoords) {
                blocked.push('imported unit "' + (impId || impName || '?') + '" has invalid or out-of-range coordinates');
                continue;
            }

            var candidates = [];

            // Method 1: exact_uid_match
            if (impId) {
                for (var li1 = 0; li1 < liveUnitsSnapshot.length; li1++) {
                    var lu1 = liveUnitsSnapshot[li1];
                    if (_rrNormId(lu1) === impId) {
                        candidates.push({ unit: lu1, method: 'exact_uid_match' });
                    }
                }
            }

            // Method 2: alias_match (only if no exact match)
            if (candidates.length === 0 && impId) {
                for (var li2 = 0; li2 < liveUnitsSnapshot.length; li2++) {
                    var lu2 = liveUnitsSnapshot[li2];
                    var aliases = lu2.aliases || lu2.alternateIds || lu2.alternate_ids;
                    if (!Array.isArray(aliases)) continue;
                    for (var ali = 0; ali < aliases.length; ali++) {
                        if (String(aliases[ali] || '').trim() === impId) {
                            candidates.push({ unit: lu2, method: 'alias_match' });
                            break;
                        }
                    }
                }
            }

            // Method 3: name_type_match (only if no match yet)
            if (candidates.length === 0 && impName) {
                for (var li3 = 0; li3 < liveUnitsSnapshot.length; li3++) {
                    var lu3 = liveUnitsSnapshot[li3];
                    var liveName3 = _rrNormName(lu3);
                    var liveType3 = _rrUnitType(lu3);
                    if (!liveName3 || liveName3 !== impName) continue;
                    if (impType && liveType3 && impType !== liveType3) continue;
                    candidates.push({ unit: lu3, method: 'name_type_match' });
                }
                if (candidates.length > 0) hasWeakMatch = true;
            }

            // Method 4: location_proximity_match (only if no match yet)
            if (candidates.length === 0 && impCoords) {
                for (var li4 = 0; li4 < liveUnitsSnapshot.length; li4++) {
                    var lu4 = liveUnitsSnapshot[li4];
                    var liveCoords4 = _rrUnitCoords(lu4);
                    if (!liveCoords4) continue;
                    var liveSide4 = _rrUnitSide(lu4);
                    if (impSide && liveSide4 && impSide !== liveSide4) continue;
                    var dist4 = _rrHaversineKm(impCoords, liveCoords4);
                    if (dist4 <= maxDist) {
                        candidates.push({ unit: lu4, method: 'location_proximity_match', dist: dist4 });
                    }
                }
                if (candidates.length > 0) hasWeakMatch = true;
            }

            // Evaluate candidates
            if (candidates.length === 0) {
                unresolvedUnits.push(_rrClone(imp) || { uid: impId });

            } else if (candidates.length > 1) {
                var candIds = candidates.map(function (c) { return _rrNormId(c.unit) || '?'; });
                conflicts.push({
                    importedId:   impId,
                    importedName: impName,
                    candidates:   candIds
                });
                blocked.push('imported unit "' + (impId || impName || '?') + '" matched ' +
                             candidates.length + ' live units (' + candIds.join(', ') + ') — conflict');

            } else {
                var best      = candidates[0];
                var liveSideB = _rrUnitSide(best.unit);

                // Side/faction mismatch is a hard block even for a single candidate
                if (impSide && liveSideB && impSide !== liveSideB) {
                    blocked.push('side mismatch for imported unit "' + (impId || impName || '?') +
                                 '": imported "' + impSide + '" vs live "' + liveSideB + '"');
                    conflicts.push({ importedId: impId, reason: 'side_mismatch' });
                } else {
                    var isWeak = (best.method === 'name_type_match' ||
                                  best.method === 'location_proximity_match');
                    var noteStr = null;
                    if (best.method === 'name_type_match') {
                        noteStr = 'matched by name — verify this is the correct unit';
                    } else if (best.method === 'location_proximity_match') {
                        noteStr = 'proximity match ' + best.dist.toFixed(2) + ' km — verify this is the correct unit';
                    }
                    if (isWeak) {
                        warnings.push('weak match for unit "' + (impId || impName || '?') +
                                      '" via ' + best.method + ' — operator should verify');
                    }
                    matchedUnits.push({
                        importedId:   impId   || '',
                        importedName: impName || null,
                        liveUid:      _rrNormId(best.unit)   || '',
                        liveName:     _rrNormName(best.unit) || null,
                        matchMethod:  best.method,
                        confidence:   isWeak ? 'medium' : 'high',
                        notes:        noteStr
                    });
                }
            }
        }

        // 5. Determine overall confidence and passed
        var confidence;
        if (blocked.length > 0 || conflicts.length > 0) {
            confidence = 'blocked';
        } else if (unresolvedUnits.length > 0) {
            confidence = 'low';
        } else if (hasWeakMatch) {
            confidence = 'medium';
        } else {
            confidence = (importedUnits.length === 0) ? 'low' : 'high';
        }
        var passed = (confidence === 'high' || confidence === 'medium');

        // 6. Assemble ReconciliationResult
        var result = {
            passed:              passed,
            confidence:          confidence,
            matchedUnits:        matchedUnits,
            unresolvedUnits:     unresolvedUnits,
            conflicts:           conflicts,
            warnings:            warnings.slice(),
            blockedReasons:      blocked.slice(),
            readOnly:            true,
            liveMutationAllowed: false
        };

        // 7. Self-check — run the type guard on our own output before returning
        var selfCheck = isReconciliationResultSafe(result);
        if (!selfCheck.passed) {
            return {
                passed:         false,
                result:         null,
                blockedReasons: ['isReconciliationResultSafe self-check failed: ' +
                                  selfCheck.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        return {
            passed:         passed,
            result:         result,
            blockedReasons: blocked,
            warnings:       warnings
        };
    }

    // ── PR-186: Apply Candidate Type Guard ───────────────────────────────────
    // Pure type guard for future in-memory ApplyCandidate objects (PR-185 §3).
    // No object creation. No UI. No apply path. No storage.
    // SAFETY: Read-only. Does NOT mutate any input.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    var APPLY_MODE_VALUES = Object.freeze(['operator_controlled']);

    var _AC_EFFECTS_ARRAYS = Object.freeze([
        'unitStatusChanges', 'unitPositionChanges', 'mapOverlays', 'timelineNotes'
    ]);

    var _AC_UNSAFE_FIELDS = Object.freeze([
        'applyNow', 'commitNow', 'executeNow', 'mutateMap', 'mutateUnits', 'mutateLines',
        'mutateScenario', 'backendCommit', 'autoApply', 'skipGate', 'forceApply',
        'liveApply', 'autoAdvance', 'autoConfirm'
    ]);

    var _AC_EFFECTS_ITEM_UNSAFE = Object.freeze([
        'applyNow', 'mutateUnit', 'mutateUnits', 'commitNow', 'liveApply', 'autoApply'
    ]);

    function isApplyCandidateSafe(candidate) {
        var blocked = [];

        // 1. Must be a non-null object
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            return { passed: false, blockedReasons: ['candidate must be a non-null object'] };
        }

        // 2. applyMode must be 'operator_controlled'
        if (candidate.applyMode !== 'operator_controlled') {
            blocked.push('applyMode must be "operator_controlled"; got "' + candidate.applyMode + '"');
        }

        // 3. Hard-locked construction defaults — all must be exactly these values
        if (candidate.operatorConfirmed !== false) {
            blocked.push('operatorConfirmed must be false (hard-locked at construction); got ' +
                         JSON.stringify(candidate.operatorConfirmed));
        }
        if (candidate.liveMutationPlanned !== false) {
            blocked.push('liveMutationPlanned must be false (hard-locked at construction); got ' +
                         JSON.stringify(candidate.liveMutationPlanned));
        }
        if (candidate.backendCommitPlanned !== false) {
            blocked.push('backendCommitPlanned must be false (hard-locked at construction); got ' +
                         JSON.stringify(candidate.backendCommitPlanned));
        }

        // 4. Gate passage flags — both must be true
        if (candidate.dryRunReviewed !== true) {
            blocked.push('dryRunReviewed must be true (Gate 4 required); got ' +
                         JSON.stringify(candidate.dryRunReviewed));
        }
        if (candidate.uidReconciliationPassed !== true) {
            blocked.push('uidReconciliationPassed must be true (Gate 5 required); got ' +
                         JSON.stringify(candidate.uidReconciliationPassed));
        }

        // 5. confidence must be 'high' or 'medium' (per PR-185 §2 Gate 5)
        if (candidate.confidence !== 'high' && candidate.confidence !== 'medium') {
            blocked.push('confidence must be "high" or "medium"; got "' + candidate.confidence + '"');
        }

        // 6. blockedReasons must be an empty array at construction
        if (!Array.isArray(candidate.blockedReasons)) {
            blocked.push('blockedReasons must be an array; got ' + typeof candidate.blockedReasons);
        } else if (candidate.blockedReasons.length > 0) {
            blocked.push('blockedReasons must be empty at construction; has ' +
                         candidate.blockedReasons.length + ' entries');
        }

        // 7. No unsafe top-level fields
        for (var i = 0; i < _AC_UNSAFE_FIELDS.length; i++) {
            if (candidate[_AC_UNSAFE_FIELDS[i]]) {
                blocked.push('candidate has unsafe field: ' + _AC_UNSAFE_FIELDS[i]);
            }
        }

        // 8. proposedEffects must be an object with four array fields
        var pe = candidate.proposedEffects;
        if (!pe || typeof pe !== 'object' || Array.isArray(pe)) {
            blocked.push('proposedEffects must be a non-null object');
        } else {
            for (var j = 0; j < _AC_EFFECTS_ARRAYS.length; j++) {
                var key = _AC_EFFECTS_ARRAYS[j];
                if (!Array.isArray(pe[key])) {
                    blocked.push('proposedEffects.' + key + ' must be an array');
                } else {
                    // Check each item for unsafe mutation markers
                    for (var k = 0; k < pe[key].length; k++) {
                        var item = pe[key][k];
                        if (item && typeof item === 'object') {
                            for (var m = 0; m < _AC_EFFECTS_ITEM_UNSAFE.length; m++) {
                                if (item[_AC_EFFECTS_ITEM_UNSAFE[m]]) {
                                    blocked.push('proposedEffects.' + key + '[' + k + '] has unsafe flag: ' +
                                                 _AC_EFFECTS_ITEM_UNSAFE[m]);
                                }
                            }
                        }
                    }
                }
            }
        }

        return { passed: blocked.length === 0, blockedReasons: blocked };
    }

    // ── PR-187: Apply Candidate Builder ──────────────────────────────────────
    // Pure function. No UI. No apply path. No storage. No backend. No mutation.
    // Re-runs all preceding guards (Gates 2–6) before building.
    // operatorConfirmed, liveMutationPlanned, backendCommitPlanned are hard-locked
    // false at construction — Gate 7 (future PR-189+) is the only path that may
    // change them.
    // proposedEffects is copied from confirmation.effectsPreview; all arrays remain
    // empty until a later PR wires reconciliation output into them.
    // Returns { passed, candidate|null, blockedReasons, warnings }.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.
    function buildApplyCandidate(proposal, reviewRecord, confirmation, reconciliationResult, options) {
        var blocked = [];
        var warnings = [];

        // Gate 2 — isStagingProposalSafe
        var g2 = isStagingProposalSafe(proposal);
        if (!g2.passed) {
            blocked.push('Gate 2 failed — isStagingProposalSafe: ' + g2.blockedReasons.join('; '));
        }

        // Gate 3 — isOperatorReviewRecordSafe + decision
        var g3 = isOperatorReviewRecordSafe(reviewRecord);
        if (!g3.passed) {
            blocked.push('Gate 3 failed — isOperatorReviewRecordSafe: ' + g3.blockedReasons.join('; '));
        } else if (!reviewRecord || reviewRecord.decision !== 'approve_dry_run') {
            blocked.push('Gate 3 failed — reviewRecord.decision must be "approve_dry_run"; got "' +
                         (reviewRecord ? reviewRecord.decision : 'null') + '"');
        }

        // Gate 4 — isDryRunConfirmationSafe
        var g4 = isDryRunConfirmationSafe(confirmation);
        if (!g4.passed) {
            blocked.push('Gate 4 failed — isDryRunConfirmationSafe: ' + g4.blockedReasons.join('; '));
        }

        // Gate 5 — isReconciliationResultSafe + confidence + no conflicts
        var g5 = isReconciliationResultSafe(reconciliationResult);
        if (!g5.passed) {
            blocked.push('Gate 5 failed — isReconciliationResultSafe: ' + g5.blockedReasons.join('; '));
        } else {
            if (reconciliationResult.confidence !== 'high' && reconciliationResult.confidence !== 'medium') {
                blocked.push('Gate 5 failed — confidence must be "high" or "medium"; got "' +
                             reconciliationResult.confidence + '"');
            }
            if (reconciliationResult.conflicts && reconciliationResult.conflicts.length > 0) {
                blocked.push('Gate 5 failed — conflicts must be empty; has ' +
                             reconciliationResult.conflicts.length + ' conflict(s)');
            }
        }

        if (blocked.length > 0) {
            return { passed: false, candidate: null, blockedReasons: blocked, warnings: warnings };
        }

        // Deep clone helper — structuredClone with JSON fallback
        function _acClone(val) {
            try { return structuredClone(val); } catch (e) {
                try { return JSON.parse(JSON.stringify(val)); } catch (e2) { return val; }
            }
        }

        // Surface reconciliation warnings for operator review at Gate 7
        if (reconciliationResult.warnings && reconciliationResult.warnings.length > 0) {
            for (var i = 0; i < reconciliationResult.warnings.length; i++) {
                warnings.push(reconciliationResult.warnings[i]);
            }
        }

        // Populate proposedEffects from confirmation.effectsPreview (currently all []).
        // Arrays remain empty until a later PR wires reconciliation output into them.
        var ep = (confirmation && confirmation.effectsPreview) ? confirmation.effectsPreview : {};
        var proposedEffects = {
            unitStatusChanges:   Array.isArray(ep.unitStatusChanges)   ? _acClone(ep.unitStatusChanges)   : [],
            unitPositionChanges: Array.isArray(ep.unitPositionChanges) ? _acClone(ep.unitPositionChanges) : [],
            mapOverlays:         Array.isArray(ep.mapOverlays)         ? _acClone(ep.mapOverlays)         : [],
            timelineNotes:       Array.isArray(ep.timelineNotes)       ? _acClone(ep.timelineNotes)       : []
        };

        // Build the candidate.
        // operatorConfirmed, liveMutationPlanned, backendCommitPlanned are HARD-LOCKED false.
        // confirmationId and reconciliationId are future fields — empty until those
        // objects carry identity fields in a later PR.
        var candidate = {
            proposalId:              (proposal && proposal.id) ? String(proposal.id) : '',
            confirmationId:          '',
            reconciliationId:        '',
            applyMode:               'operator_controlled',
            dryRunReviewed:          true,
            uidReconciliationPassed: true,
            confidence:              reconciliationResult.confidence,
            operatorConfirmed:       false,
            liveMutationPlanned:     false,
            backendCommitPlanned:    false,
            proposedEffects:         proposedEffects,
            blockedReasons:          [],
            warnings:                warnings.slice()
        };

        // Gate 6 — isApplyCandidateSafe self-check
        var g6 = isApplyCandidateSafe(candidate);
        if (!g6.passed) {
            return {
                passed:         false,
                candidate:      null,
                blockedReasons: ['isApplyCandidateSafe self-check failed: ' +
                                  g6.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        return {
            passed:         true,
            candidate:      candidate,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // ── PR-191: Apply Confirmation Type Guard ─────────────────────────────────
    // Pure type guard for future in-memory ApplyConfirmation objects (PR-189/190).
    // No object creation. No UI. No apply path. No storage.
    // SAFETY: Read-only. Does NOT mutate any input.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.

    var APPLY_CONFIRMATION_MODE_VALUES = Object.freeze(['operator_two_step']);

    var _ACF_UNSAFE_FIELDS = Object.freeze([
        'autoApply', 'skipStep1', 'forceConfirm', 'autoConfirm', 'skipGate',
        'commitNow', 'applyNow', 'executeNow', 'mutateMap', 'mutateUnits',
        'mutateLines', 'backendCommit', 'liveApply', 'autoAdvance'
    ]);

    function isApplyConfirmationSafe(confirmation) {
        var blocked = [];

        // 1. Must be a non-null object
        if (!confirmation || typeof confirmation !== 'object' || Array.isArray(confirmation)) {
            return { passed: false, blockedReasons: ['confirmation must be a non-null object'] };
        }

        // 2. mode must be 'operator_two_step'
        if (confirmation.mode !== 'operator_two_step') {
            blocked.push('mode must be "operator_two_step"; got "' + confirmation.mode + '"');
        }

        // 3. applyMode must be 'operator_controlled'
        if (confirmation.applyMode !== 'operator_controlled') {
            blocked.push('applyMode must be "operator_controlled"; got "' + confirmation.applyMode + '"');
        }

        // 4. step1Complete must be true (Step 1 must be done before this object is built)
        if (confirmation.step1Complete !== true) {
            blocked.push('step1Complete must be true; got ' +
                         JSON.stringify(confirmation.step1Complete));
        }

        // 5. step2Complete must be false at construction — Gate 7 Step 2 handler sets it true
        if (confirmation.step2Complete !== false) {
            blocked.push('step2Complete must be false (hard-locked at construction); got ' +
                         JSON.stringify(confirmation.step2Complete));
        }

        // 6. operatorId must be a non-empty string
        if (!confirmation.operatorId || typeof confirmation.operatorId !== 'string' ||
            confirmation.operatorId.trim().length === 0) {
            blocked.push('operatorId must be a non-empty string');
        }

        // 7. confirmedAt must be a non-empty string (ISO timestamp or equivalent)
        if (!confirmation.confirmedAt || typeof confirmation.confirmedAt !== 'string' ||
            confirmation.confirmedAt.trim().length === 0) {
            blocked.push('confirmedAt must be a non-empty string');
        }

        // 8. blockedReasons must be an empty array at construction
        if (!Array.isArray(confirmation.blockedReasons)) {
            blocked.push('blockedReasons must be an array; got ' + typeof confirmation.blockedReasons);
        } else if (confirmation.blockedReasons.length > 0) {
            blocked.push('blockedReasons must be empty at construction; has ' +
                         confirmation.blockedReasons.length + ' entries');
        }

        // 9. No unsafe fields
        for (var i = 0; i < _ACF_UNSAFE_FIELDS.length; i++) {
            if (confirmation[_ACF_UNSAFE_FIELDS[i]]) {
                blocked.push('confirmation has unsafe field: ' + _ACF_UNSAFE_FIELDS[i]);
            }
        }

        return { passed: blocked.length === 0, blockedReasons: blocked };
    }

    // ── PR-192: Apply Confirmation Builder ───────────────────────────────────
    // Pure function. No UI. No apply path. No storage. No backend. No mutation.
    // step2Complete is hard-locked false at construction — the Gate 7 Step 2 handler
    // in the future controlled apply PR is the only path that may set it true.
    // Does not mutate applyCandidate or operatorContext.
    // Returns { passed, confirmation|null, blockedReasons, warnings }.
    // Exposed on window.AppShellScenarioWorkspace for console/test access only.
    function buildApplyConfirmation(applyCandidate, operatorContext, options) {
        var blocked  = [];
        var warnings = [];

        // 1. Re-run isApplyCandidateSafe — Gate 6 re-check
        var g6 = isApplyCandidateSafe(applyCandidate);
        if (!g6.passed) {
            blocked.push('isApplyCandidateSafe failed: ' + g6.blockedReasons.join('; '));
        }

        // 2–4. Hard-locked construction invariants must still be false
        if (!applyCandidate || applyCandidate.operatorConfirmed !== false) {
            blocked.push('applyCandidate.operatorConfirmed must be false (hard-locked); got ' +
                         JSON.stringify(applyCandidate ? applyCandidate.operatorConfirmed : null));
        }
        if (!applyCandidate || applyCandidate.liveMutationPlanned !== false) {
            blocked.push('applyCandidate.liveMutationPlanned must be false; got ' +
                         JSON.stringify(applyCandidate ? applyCandidate.liveMutationPlanned : null));
        }
        if (!applyCandidate || applyCandidate.backendCommitPlanned !== false) {
            blocked.push('applyCandidate.backendCommitPlanned must be false; got ' +
                         JSON.stringify(applyCandidate ? applyCandidate.backendCommitPlanned : null));
        }

        // 5. operatorContext.operatorId must be a non-empty string
        if (!operatorContext || typeof operatorContext !== 'object') {
            blocked.push('operatorContext must be a non-null object');
        } else if (!operatorContext.operatorId ||
                   typeof operatorContext.operatorId !== 'string' ||
                   operatorContext.operatorId.trim().length === 0) {
            blocked.push('operatorContext.operatorId must be a non-empty string');
        }

        if (blocked.length > 0) {
            return { passed: false, confirmation: null, blockedReasons: blocked, warnings: warnings };
        }

        // Surface any candidate warnings for the operator
        if (applyCandidate.warnings && applyCandidate.warnings.length > 0) {
            for (var i = 0; i < applyCandidate.warnings.length; i++) {
                warnings.push(applyCandidate.warnings[i]);
            }
        }

        // 6. Build confirmation — step2Complete and operatorConfirmed hard-locked false
        var confirmation = {
            candidateId:            (applyCandidate.proposalId || '') + '-conf',
            proposalId:             applyCandidate.proposalId || '',
            mode:                   'operator_two_step',
            applyMode:              'operator_controlled',
            step1Complete:          true,
            step2Complete:          false,
            operatorId:             operatorContext.operatorId.trim(),
            confirmedAt:            (options && options.confirmedAt)
                                        ? String(options.confirmedAt)
                                        : new Date().toISOString(),
            warningAcknowledged:    false,
            finalChecklistReviewed: false,
            blockedReasons:         [],
            notes:                  (options && options.notes != null) ? String(options.notes) : null
        };

        // 11. isApplyConfirmationSafe self-check
        var selfCheck = isApplyConfirmationSafe(confirmation);
        if (!selfCheck.passed) {
            return {
                passed:         false,
                confirmation:   null,
                blockedReasons: ['isApplyConfirmationSafe self-check failed: ' +
                                  selfCheck.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        return {
            passed:         true,
            confirmation:   confirmation,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // ── PR-196: Live Units Snapshot Type Guard ───────────────────────────────
    // Pure type guard. No snapshot builder. No window.units read. No mutation. No storage.
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    var _LUSS_UNSAFE_TOP = Object.freeze([
        'applyNow', 'commitNow', 'mutateLiveUnits', 'mutateUnits', 'mutateMap',
        'mutateLines', 'mutateScenario', 'backendCommit', 'autoApply', 'liveApply',
        'writeBack', 'persist', 'save', 'exportNow', 'downloadNow'
    ]);
    var _LUSS_UNSAFE_UNIT = Object.freeze([
        'applyNow', 'commitNow', 'mutateLiveUnits', 'mutateUnits', 'mutateMap',
        'mutateLines', 'mutateScenario', 'backendCommit', 'autoApply', 'liveApply',
        'writeBack'
    ]);
    function isLiveUnitsSnapshotSafe(snapshot) {
        var reasons = [];

        // 1. Non-null object, not array
        if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
            return { passed: false, blockedReasons: ['snapshot must be a non-null object and not an array'] };
        }

        // 2. readOnly must be exactly true
        if (snapshot.readOnly !== true) {
            reasons.push('snapshot.readOnly must be true');
        }

        // 3. liveMutationAllowed must be exactly false
        if (snapshot.liveMutationAllowed !== false) {
            reasons.push('snapshot.liveMutationAllowed must be false');
        }

        // 4. createdAt must be a non-empty string
        if (typeof snapshot.createdAt !== 'string' || snapshot.createdAt.trim() === '') {
            reasons.push('snapshot.createdAt must be a non-empty string');
        }

        // 5. source must be a non-empty string (not in forbidden list)
        var _LUSS_FORBIDDEN_SOURCES = ['auto', 'global', 'window', ''];
        if (typeof snapshot.source !== 'string' || snapshot.source.trim() === '') {
            reasons.push('snapshot.source must be a non-empty string');
        } else if (_LUSS_FORBIDDEN_SOURCES.indexOf(snapshot.source.trim()) !== -1) {
            reasons.push('snapshot.source must not be "auto", "global", or "window"');
        }

        // 6. units must be an array
        if (!Array.isArray(snapshot.units)) {
            reasons.push('snapshot.units must be an array');
        }

        // 7. unitCount must equal units.length if present
        if (snapshot.hasOwnProperty('unitCount')) {
            if (typeof snapshot.unitCount !== 'number' || !Number.isFinite(snapshot.unitCount) ||
                Math.floor(snapshot.unitCount) !== snapshot.unitCount || snapshot.unitCount < 0) {
                reasons.push('snapshot.unitCount must be a non-negative integer');
            } else if (Array.isArray(snapshot.units) && snapshot.unitCount !== snapshot.units.length) {
                reasons.push('snapshot.unitCount (' + snapshot.unitCount + ') must equal snapshot.units.length (' + snapshot.units.length + ')');
            }
        }

        // 8. blockedReasons must be an array
        if (!Array.isArray(snapshot.blockedReasons)) {
            reasons.push('snapshot.blockedReasons must be an array');
        }

        // 9. If passed === true, blockedReasons must be empty
        if (snapshot.passed === true && Array.isArray(snapshot.blockedReasons) && snapshot.blockedReasons.length > 0) {
            reasons.push('snapshot.blockedReasons must be empty when snapshot.passed is true');
        }

        // 10. Reject unsafe top-level fields
        for (var ti = 0; ti < _LUSS_UNSAFE_TOP.length; ti++) {
            if (snapshot.hasOwnProperty(_LUSS_UNSAFE_TOP[ti])) {
                reasons.push('unsafe top-level field present: ' + _LUSS_UNSAFE_TOP[ti]);
            }
        }

        // Validate each unit item
        if (Array.isArray(snapshot.units)) {
            for (var ui = 0; ui < snapshot.units.length; ui++) {
                var unit = snapshot.units[ui];
                if (!unit || typeof unit !== 'object' || Array.isArray(unit)) {
                    reasons.push('snapshot.units[' + ui + '] must be a non-null object');
                    continue;
                }
                for (var uf = 0; uf < _LUSS_UNSAFE_UNIT.length; uf++) {
                    if (unit.hasOwnProperty(_LUSS_UNSAFE_UNIT[uf])) {
                        reasons.push('snapshot.units[' + ui + '] contains unsafe field: ' + _LUSS_UNSAFE_UNIT[uf]);
                    }
                }
            }
        }

        return { passed: reasons.length === 0, blockedReasons: reasons };
    }

    // ── PR-197: Live Units Snapshot Builder ──────────────────────────────────
    // Pure builder. Caller supplies units array. No window.units read. No storage. No mutation.
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    function buildLiveUnitsSnapshot(unitsArray, options) {
        var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var warnings = [];
        var blocked = [];

        // Rule 1: unitsArray must be an array
        if (!Array.isArray(unitsArray)) {
            return {
                passed:         false,
                snapshot:       null,
                blockedReasons: ['unitsArray must be an array'],
                warnings:       warnings
            };
        }

        // Rule 2–3: Immediate deep copy; no live references kept
        var copiedUnits;
        try {
            copiedUnits = JSON.parse(JSON.stringify(unitsArray));
        } catch (e) {
            return {
                passed:         false,
                snapshot:       null,
                blockedReasons: ['deep copy of unitsArray failed: ' + e.message],
                warnings:       warnings
            };
        }

        // Rule 7: Build snapshot with hard-locked safety fields
        var snapshot = {
            passed:              true,
            readOnly:            true,
            liveMutationAllowed: false,
            source:              (typeof opts.source === 'string' && opts.source.trim() !== '')
                                     ? opts.source
                                     : 'caller_provided_snapshot',
            createdAt:           (typeof opts.createdAt === 'string' && opts.createdAt.trim() !== '')
                                     ? opts.createdAt
                                     : new Date().toISOString(),
            unitCount:           copiedUnits.length,
            units:               copiedUnits,
            warnings:            [],
            blockedReasons:      []
        };

        // Rule 8: isLiveUnitsSnapshotSafe self-check
        var selfCheck = isLiveUnitsSnapshotSafe(snapshot);
        if (!selfCheck.passed) {
            return {
                passed:         false,
                snapshot:       null,
                blockedReasons: ['isLiveUnitsSnapshotSafe self-check failed: ' +
                                  selfCheck.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        return {
            passed:         true,
            snapshot:       snapshot,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // ── PR-199: Preview Reconciliation With Snapshot ─────────────────────────
    // Pure helper. Validates snapshot, then passes snapshot.units to reconcileUidReferences.
    // No window.units read. No storage. No mutation. Not wired to diagnostics yet.
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    function previewReconciliationWithSnapshot(importedStep, liveUnitsSnapshot, options) {
        var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var warnings = [];

        // Rule 1: importedStep required
        if (!importedStep || typeof importedStep !== 'object' || Array.isArray(importedStep)) {
            return {
                passed:         false,
                rrResult:       null,
                blockedReasons: ['importedStep must be a non-null object'],
                warnings:       warnings
            };
        }

        // Rule 2: liveUnitsSnapshot required
        if (!liveUnitsSnapshot || typeof liveUnitsSnapshot !== 'object' || Array.isArray(liveUnitsSnapshot)) {
            return {
                passed:         false,
                rrResult:       null,
                blockedReasons: ['liveUnitsSnapshot required — must be a non-null object'],
                warnings:       warnings
            };
        }

        // Rule 3–4: validate snapshot with isLiveUnitsSnapshotSafe
        var snapCheck = isLiveUnitsSnapshotSafe(liveUnitsSnapshot);
        if (!snapCheck.passed) {
            return {
                passed:         false,
                rrResult:       null,
                blockedReasons: ['liveUnitsSnapshot failed safety check: ' +
                                  snapCheck.blockedReasons.join('; ')],
                warnings:       warnings
            };
        }

        // Rule 5: pass snapshot.units (array) to reconcileUidReferences
        // Rule 6–7: snapshot and importedStep are not mutated
        // Rule 9: window.units is never read here
        var rrBuilt = reconcileUidReferences(importedStep, liveUnitsSnapshot.units, opts);

        // Propagate any warnings from reconciliation
        if (Array.isArray(rrBuilt.warnings)) {
            for (var wi = 0; wi < rrBuilt.warnings.length; wi++) {
                warnings.push(rrBuilt.warnings[wi]);
            }
        }

        if (!rrBuilt.passed || !rrBuilt.result) {
            return {
                passed:         false,
                rrResult:       null,
                blockedReasons: rrBuilt.blockedReasons || ['reconcileUidReferences did not pass'],
                warnings:       warnings
            };
        }

        // Rule 8: result is returned only, never stored
        return {
            passed:         true,
            rrResult:       rrBuilt.result,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // ── PR-202: Operator Identity Type Guard ─────────────────────────────────
    // Pure type guard. No identity creation. No storage. No mutation. No UI.
    // options.mode: "diagnostics" (default) or "live".
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    var _OI_ALLOWED_SOURCES  = Object.freeze(['explicit_input', 'authenticated_session', 'test_harness']);
    var _OI_LIVE_SOURCES     = Object.freeze(['explicit_input', 'authenticated_session']);
    var _OI_UNSAFE_FIELDS    = Object.freeze([
        'applyNow', 'commitNow', 'executeNow', 'autoApprove', 'autoConfirm',
        'skipGate', 'skipIdentity', 'impersonate', 'mutateMap', 'mutateUnits',
        'mutateLines', 'mutateScenario', 'backendCommit', 'liveApply',
        'persist', 'save', 'exportNow', 'downloadNow'
    ]);
    function isOperatorIdentitySafe(identity, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var mode     = (opts.mode === 'live') ? 'live' : 'diagnostics';
        var reasons  = [];
        var warnings = [];

        // 1. Non-null object, not array
        if (!identity || typeof identity !== 'object' || Array.isArray(identity)) {
            return { passed: false, blockedReasons: ['identity must be a non-null object and not an array'], warnings: warnings };
        }

        // 2. operatorId non-empty string after trim
        if (typeof identity.operatorId !== 'string' || identity.operatorId.trim() === '') {
            reasons.push('operatorId must be a non-empty string');
        }

        // 3. source must be one of the allowed values
        if (_OI_ALLOWED_SOURCES.indexOf(identity.source) === -1) {
            reasons.push('source must be one of: ' + _OI_ALLOWED_SOURCES.join(', '));
        }

        // 4. capturedAt non-empty string
        if (typeof identity.capturedAt !== 'string' || identity.capturedAt.trim() === '') {
            reasons.push('capturedAt must be a non-empty string');
        }

        // 5. readOnly must be exactly true
        if (identity.readOnly !== true) {
            reasons.push('readOnly must be true');
        }

        // 6. liveMutationAllowed must be exactly false
        if (identity.liveMutationAllowed !== false) {
            reasons.push('liveMutationAllowed must be false');
        }

        // 7. permissions must be an object
        if (!identity.permissions || typeof identity.permissions !== 'object' || Array.isArray(identity.permissions)) {
            reasons.push('permissions must be a non-null object');
        } else {
            // 8. permissions.canApproveDryRun must be boolean
            if (typeof identity.permissions.canApproveDryRun !== 'boolean') {
                reasons.push('permissions.canApproveDryRun must be boolean');
            }
            // 9. permissions.canConfirmControlledApply must be boolean
            if (typeof identity.permissions.canConfirmControlledApply !== 'boolean') {
                reasons.push('permissions.canConfirmControlledApply must be boolean');
            }
        }

        // 10. verified must be boolean
        if (typeof identity.verified !== 'boolean') {
            reasons.push('verified must be boolean');
        }

        // 11. Live-mode additional checks
        if (mode === 'live') {
            if (identity.verified !== true) {
                reasons.push('verified must be true for live mode');
            }
            if (_OI_LIVE_SOURCES.indexOf(identity.source) === -1) {
                reasons.push('source "' + identity.source + '" is not permitted for live mode');
            }
            if (identity.permissions && identity.permissions.canConfirmControlledApply !== true) {
                reasons.push('permissions.canConfirmControlledApply must be true for live mode');
            }
        }

        // 12. Diagnostics mode: test_harness passes but warns
        if (mode === 'diagnostics' && identity.source === 'test_harness') {
            warnings.push('source is "test_harness" — identity is valid for diagnostics only; must not unlock live apply');
        }

        // Unsafe fields — block if any truthy unsafe field is present
        for (var ui = 0; ui < _OI_UNSAFE_FIELDS.length; ui++) {
            if (identity[_OI_UNSAFE_FIELDS[ui]]) {
                reasons.push('unsafe field present: ' + _OI_UNSAFE_FIELDS[ui]);
            }
        }

        return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
    }

    // ── PR-207: Staging State Type Guard ─────────────────────────────────────
    // Pure type guard. No staging state creation. No storage. No mutation. No UI.
    // options.identityMode: "diagnostics" (default) or "live".
    // options.context: "reset_verification" unlocks cleared-state pass with warning.
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    var _SSS_ALLOWED_STATUS   = Object.freeze(['draft', 'reviewing', 'ready_for_final_review', 'blocked', 'cleared']);
    var _SSS_FORBIDDEN_STATUS = Object.freeze(['applied', 'committed', 'live', 'executed', 'auto_applied']);
    var _SSS_UNSAFE_FIELDS    = Object.freeze([
        'applyNow', 'commitNow', 'executeNow', 'runLive', 'liveApply',
        'mutateMap', 'mutateUnits', 'mutateLines', 'mutateScenario', 'backendCommit',
        'persist', 'save', 'exportNow', 'downloadNow',
        'autoApprove', 'autoConfirm', 'skipGate', 'skipReview', 'forceApply'
    ]);
    var _SSS_PIPELINE_FIELDS  = Object.freeze([
        'proposal', 'reviewRecord', 'dryRunConfirmation', 'reconciliationResult',
        'applyCandidate', 'applyConfirmation', 'finalChecklist', 'operatorIdentity'
    ]);
    var _SSS_REQUIRED_FINAL   = Object.freeze([
        'proposal', 'reviewRecord', 'dryRunConfirmation', 'reconciliationResult',
        'applyCandidate', 'applyConfirmation', 'operatorIdentity'
    ]);
    function isStagingStateSafe(state, options) {
        var opts         = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var identityMode = (opts.identityMode === 'live') ? 'live' : 'diagnostics';
        var context      = (typeof opts.context === 'string') ? opts.context : '';
        var reasons      = [];
        var warnings     = [];

        // 1. Non-null object, not array
        if (!state || typeof state !== 'object' || Array.isArray(state)) {
            return { passed: false, blockedReasons: ['state must be a non-null object and not an array'], warnings: warnings };
        }

        // 2. id non-empty string
        if (typeof state.id !== 'string' || state.id.trim() === '') {
            reasons.push('id must be a non-empty string');
        }

        // 3. createdAt non-empty string
        if (typeof state.createdAt !== 'string' || state.createdAt.trim() === '') {
            reasons.push('createdAt must be a non-empty string');
        }

        // 4. status must be allowed (distinguish forbidden from unknown)
        if (_SSS_ALLOWED_STATUS.indexOf(state.status) === -1) {
            if (_SSS_FORBIDDEN_STATUS.indexOf(state.status) !== -1) {
                reasons.push('status "' + state.status + '" is a forbidden staging state value');
            } else {
                reasons.push('status must be one of: ' + _SSS_ALLOWED_STATUS.join(', '));
            }
        }

        // 5. readOnly must be exactly true
        if (state.readOnly !== true) {
            reasons.push('readOnly must be true');
        }

        // 6. liveMutationAllowed must be exactly false
        if (state.liveMutationAllowed !== false) {
            reasons.push('liveMutationAllowed must be false');
        }

        // 7. backendCommitAllowed must be exactly false
        if (state.backendCommitAllowed !== false) {
            reasons.push('backendCommitAllowed must be false');
        }

        // 8. blockedReasons must be array
        if (!Array.isArray(state.blockedReasons)) {
            reasons.push('blockedReasons must be an array');
        }

        // 9. warnings must be array
        if (!Array.isArray(state.warnings)) {
            reasons.push('warnings must be an array');
        }

        // Unsafe fields on top-level state object
        for (var ui = 0; ui < _SSS_UNSAFE_FIELDS.length; ui++) {
            if (state[_SSS_UNSAFE_FIELDS[ui]]) {
                reasons.push('unsafe field present on state: ' + _SSS_UNSAFE_FIELDS[ui]);
            }
        }

        // step2Complete on top-level state
        if (state.step2Complete === true) {
            reasons.push('state.step2Complete must not be true — Gate 7 not yet implemented');
        }

        // 10. Cleared state
        if (state.status === 'cleared') {
            var clearedAllNull = true;
            for (var ci = 0; ci < _SSS_PIPELINE_FIELDS.length; ci++) {
                var cf = _SSS_PIPELINE_FIELDS[ci];
                if (state[cf] !== null && state[cf] !== undefined) {
                    clearedAllNull = false;
                    reasons.push('cleared state must have ' + cf + ' set to null');
                }
            }
            if (clearedAllNull) {
                if (context === 'reset_verification') {
                    warnings.push('state is cleared — valid in reset-verification context only');
                } else {
                    reasons.push('cleared state is not active and cannot be used outside reset-verification context');
                }
            }
            // Short-circuit: skip sub-guard checks for cleared state
            return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
        }

        // 11. ready_for_final_review: all required sub-objects must be non-null
        if (state.status === 'ready_for_final_review') {
            for (var ri = 0; ri < _SSS_REQUIRED_FINAL.length; ri++) {
                var rf = _SSS_REQUIRED_FINAL[ri];
                if (state[rf] === null || state[rf] === undefined) {
                    reasons.push('ready_for_final_review requires ' + rf + ' to be non-null');
                }
            }
        }

        // 12. Sub-guard checks for non-null sub-objects
        var isDraftReviewBlocked = (state.status === 'draft' || state.status === 'reviewing' || state.status === 'blocked');

        if (state.proposal !== null && state.proposal !== undefined) {
            var propChk = isStagingProposalSafe(state.proposal);
            if (!propChk.passed) {
                reasons.push('proposal failed safety check: ' + propChk.blockedReasons.join('; '));
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('proposal is not yet populated');
        }

        if (state.reviewRecord !== null && state.reviewRecord !== undefined) {
            var rrChk = isOperatorReviewRecordSafe(state.reviewRecord);
            if (!rrChk.passed) {
                reasons.push('reviewRecord failed safety check: ' + rrChk.blockedReasons.join('; '));
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('reviewRecord is not yet populated');
        }

        if (state.dryRunConfirmation !== null && state.dryRunConfirmation !== undefined) {
            var drcChk = isDryRunConfirmationSafe(state.dryRunConfirmation);
            if (!drcChk.passed) {
                reasons.push('dryRunConfirmation failed safety check: ' + drcChk.blockedReasons.join('; '));
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('dryRunConfirmation is not yet populated');
        }

        if (state.reconciliationResult !== null && state.reconciliationResult !== undefined) {
            var rcChk = isReconciliationResultSafe(state.reconciliationResult);
            if (!rcChk.passed) {
                reasons.push('reconciliationResult failed safety check: ' + rcChk.blockedReasons.join('; '));
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('reconciliationResult is not yet populated');
        }

        if (state.applyCandidate !== null && state.applyCandidate !== undefined) {
            var acChk = isApplyCandidateSafe(state.applyCandidate);
            if (!acChk.passed) {
                reasons.push('applyCandidate failed safety check: ' + acChk.blockedReasons.join('; '));
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('applyCandidate is not yet populated');
        }

        if (state.applyConfirmation !== null && state.applyConfirmation !== undefined) {
            if (state.applyConfirmation.step2Complete === true) {
                reasons.push('applyConfirmation.step2Complete must not be true — Gate 7 not yet implemented');
            }
            var confChk = isApplyConfirmationSafe(state.applyConfirmation);
            if (!confChk.passed) {
                reasons.push('applyConfirmation failed safety check: ' + confChk.blockedReasons.join('; '));
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('applyConfirmation is not yet populated');
        }

        if (state.operatorIdentity !== null && state.operatorIdentity !== undefined) {
            var oiChk = isOperatorIdentitySafe(state.operatorIdentity, { mode: identityMode });
            if (!oiChk.passed) {
                reasons.push('operatorIdentity failed safety check: ' + oiChk.blockedReasons.join('; '));
            }
            if (Array.isArray(oiChk.warnings)) {
                for (var wi = 0; wi < oiChk.warnings.length; wi++) {
                    warnings.push('operatorIdentity warning: ' + oiChk.warnings[wi]);
                }
            }
        } else if (isDraftReviewBlocked) {
            warnings.push('operatorIdentity is not yet populated');
        }

        return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
    }

    // ── PR-211 / PR-220: Scenario Step Preview Builder ───────────────────────
    // Pure function. No DOM. No map. No window.units. No window.RmoozScenario.
    // No storage. No network. No mutation of fixture or any global.
    // Consumes a dry-run fixture (window.RmoozDryRunFixtures.AMBER_RIDGE or
    // any conforming object) and a stepRef, returns a ScenarioPlaybackPreview.
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    // No script tag added to app.html in this PR.
    // PR-220: proposedVisualEffects now also includes step.visualEffects rows
    //         (pre-built engagement_arc text rows from the W3 adapter).
    //         Fixtures without step.visualEffects are unaffected.

    var _BSSP_SAFETY_TRUE  = Object.freeze(['dryRunOnly', 'previewOnly']);
    var _BSSP_SAFETY_FALSE = Object.freeze([
        'liveMutationAllowed', 'backendCommitAllowed',
        'mapMutationAllowed', 'unitMutationAllowed', 'scenarioMutationAllowed'
    ]);

    function buildScenarioStepPreview(fixture, stepRef, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var reasons  = [];
        var warnings = [];

        // Rule 1: fixture must be a non-null object, not an array
        if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
            return { passed: false, preview: null,
                blockedReasons: ['fixture must be a non-null object and not an array'], warnings: warnings };
        }

        // Rule 2: fixture.readOnly must be exactly true
        if (fixture.readOnly !== true) {
            return { passed: false, preview: null,
                blockedReasons: ['fixture.readOnly must be true'], warnings: warnings };
        }

        // Rule 3: fixture.liveMutationAllowed must be exactly false
        if (fixture.liveMutationAllowed !== false) {
            return { passed: false, preview: null,
                blockedReasons: ['fixture.liveMutationAllowed must be false'], warnings: warnings };
        }

        // Rule 4: fixture.steps must be an array
        if (!Array.isArray(fixture.steps)) {
            return { passed: false, preview: null,
                blockedReasons: ['fixture.steps must be an array'], warnings: warnings };
        }

        // Rules 5-7: locate step from stepRef (string id / number index / step object)
        var step = null;
        var stepsLen = fixture.steps.length;
        if (typeof stepRef === 'string') {
            for (var si = 0; si < stepsLen; si++) {
                if (fixture.steps[si] && fixture.steps[si].step_id === stepRef) {
                    step = fixture.steps[si]; break;
                }
            }
        } else if (typeof stepRef === 'number') {
            for (var ni = 0; ni < stepsLen; ni++) {
                if (fixture.steps[ni] && fixture.steps[ni].stepIndex === stepRef) {
                    step = fixture.steps[ni]; break;
                }
            }
        } else if (stepRef && typeof stepRef === 'object' && !Array.isArray(stepRef) &&
                   typeof stepRef.step_id === 'string') {
            for (var oi2 = 0; oi2 < stepsLen; oi2++) {
                if (fixture.steps[oi2] && fixture.steps[oi2].step_id === stepRef.step_id) {
                    step = fixture.steps[oi2]; break;
                }
            }
        }

        if (!step) {
            return { passed: false, preview: null,
                blockedReasons: ['step not found for stepRef: ' + String(stepRef)], warnings: warnings };
        }

        // Rule 8: validate step safety block — all 7 flags required
        var ss = step.safety;
        if (!ss || typeof ss !== 'object' || Array.isArray(ss)) {
            return { passed: false, preview: null,
                blockedReasons: ['step.safety must be a non-null object'], warnings: warnings };
        }
        for (var ti = 0; ti < _BSSP_SAFETY_TRUE.length; ti++) {
            if (ss[_BSSP_SAFETY_TRUE[ti]] !== true) {
                reasons.push('step.safety.' + _BSSP_SAFETY_TRUE[ti] + ' must be true');
            }
        }
        for (var fi = 0; fi < _BSSP_SAFETY_FALSE.length; fi++) {
            if (ss[_BSSP_SAFETY_FALSE[fi]] !== false) {
                reasons.push('step.safety.' + _BSSP_SAFETY_FALSE[fi] + ' must be false');
            }
        }
        if (reasons.length > 0) {
            return { passed: false, preview: null, blockedReasons: reasons, warnings: warnings };
        }

        // ── Build look-up indexes (read-only; no writes to fixture) ──────────
        var fixtureUnits = Array.isArray(fixture.units) ? fixture.units : [];
        var uidIndex   = {};
        var aliasIndex = {};
        for (var ui = 0; ui < fixtureUnits.length; ui++) {
            var fu = fixtureUnits[ui];
            if (fu && typeof fu.uid === 'string') {
                uidIndex[fu.uid] = fu;
                if (Array.isArray(fu.aliases)) {
                    for (var ai = 0; ai < fu.aliases.length; ai++) {
                        if (typeof fu.aliases[ai] === 'string') {
                            aliasIndex[fu.aliases[ai]] = fu;
                        }
                    }
                }
            }
        }

        var fixtureObjs = Array.isArray(fixture.objectives) ? fixture.objectives : [];
        var objIndex = {};
        for (var oo = 0; oo < fixtureObjs.length; oo++) {
            var fo = fixtureObjs[oo];
            if (fo && typeof fo.objectiveId === 'string') {
                objIndex[fo.objectiveId] = fo;
            }
        }

        // ── Rule 9: resolve unitsReferenced ─────────────────────────────────
        var resolvedUnits = [];
        var unitsRef = Array.isArray(step.unitsReferenced) ? step.unitsReferenced : [];
        for (var ri = 0; ri < unitsRef.length; ri++) {
            var refUid = unitsRef[ri];
            var ru     = uidIndex[refUid] || aliasIndex[refUid] || null;
            if (!ru) {
                // Rule: unknown unit UID — UNKNOWN_UNIT warning
                warnings.push({
                    code:       'UNKNOWN_UNIT',
                    step_id:    step.step_id,
                    targetType: 'unit',
                    targetId:   refUid,
                    message:    'Unit "' + refUid + '" not found in fixture.units',
                    severity:   'warning'
                });
                resolvedUnits.push({ uid: refUid, resolved: false, displayName: refUid, startLocation: null });
            } else {
                // PR-247: prefer per-step location; fall back to catalog (step-0) location
                var _stepLoc = (step._stepUnitLocations &&
                                typeof step._stepUnitLocations === 'object' &&
                                !Array.isArray(step._stepUnitLocations))
                               ? (step._stepUnitLocations[refUid] || null) : null;
                var _resolvedLoc = _stepLoc || ru.startLocation || null;
                // Rule 11: null startLocation → MISSING_COORDINATE warning
                if (!_resolvedLoc) {
                    warnings.push({
                        code:       'MISSING_COORDINATE',
                        step_id:    step.step_id,
                        targetType: 'unit',
                        targetId:   refUid,
                        message:    'Unit "' + ru.name + '" (' + refUid + ') has no start location',
                        severity:   'warning'
                    });
                }
                // Rule 22: copy primitives only — no live object reference
                resolvedUnits.push({
                    uid:           ru.uid,
                    resolved:      true,
                    displayName:   ru.name,
                    side:          ru.side,
                    type:          ru.type,
                    role:          ru.role,
                    startLocation: _resolvedLoc
                        ? { description: String(_resolvedLoc.description || ''),
                            lat: _resolvedLoc.lat,
                            lng: _resolvedLoc.lng }
                        : null
                });
            }
        }

        // ── Rule 10: resolve objectivesReferenced ────────────────────────────
        var resolvedObjectives = [];
        var objRef   = Array.isArray(step.objectivesReferenced) ? step.objectivesReferenced : [];
        var isAmbig  = Array.isArray(step.missingDataExpected) &&
                       step.missingDataExpected.indexOf('objectivesReferenced_ambiguous') !== -1;
        for (var oji = 0; oji < objRef.length; oji++) {
            var refId = objRef[oji];
            var ro    = objIndex[refId] || null;
            if (!ro) {
                warnings.push({
                    code:       'UNKNOWN_OBJECTIVE',
                    step_id:    step.step_id,
                    targetType: 'objective',
                    targetId:   refId,
                    message:    'Objective "' + refId + '" not found in fixture.objectives',
                    severity:   'warning'
                });
                resolvedObjectives.push({ id: refId, description: refId, clear: false, desiredEffect: '' });
            } else {
                // Rule 15: ambiguous objective reference
                if (isAmbig) {
                    warnings.push({
                        code:       'AMBIGUOUS_OBJECTIVE',
                        step_id:    step.step_id,
                        targetType: 'objective',
                        targetId:   refId,
                        message:    'Objective "' + ro.name + '" (' + refId + ') is not the primary objective for this phase — requires operator review',
                        severity:   'warning'
                    });
                }
                // PR-252: propagate fixture objective location (lat/lng) through the
                // preview pipeline so buildWargame3ReadOnlyMapOverlayData can draw it.
                // Coordinate source: w3json.obj.coord → _w3aLonLatToStartLoc → fixture.objectives[N].location
                var _roLoc = null;
                if (ro.location && typeof ro.location === 'object' &&
                    typeof ro.location.lat === 'number' && isFinite(ro.location.lat) &&
                    typeof ro.location.lng === 'number' && isFinite(ro.location.lng)) {
                    _roLoc = { description: String(ro.location.description || ''),
                               lat: ro.location.lat, lng: ro.location.lng };
                }
                resolvedObjectives.push({
                    id:           ro.objectiveId,
                    description:  ro.name,
                    clear:        !isAmbig,
                    desiredEffect: typeof ro.desiredEffect === 'string' ? ro.desiredEffect : '',
                    location:     _roLoc
                });
            }
        }

        // ── Rules 12-14: missing-field and empty-field warnings ──────────────
        var decisionOk = (typeof step.selectedDecision === 'string' && step.selectedDecision !== '');
        if (!decisionOk) {
            warnings.push({
                code:       'MISSING_FIELD',
                step_id:    step.step_id,
                targetType: 'step',
                targetId:   step.step_id,
                message:    'selectedDecision is missing — step cannot be marked preview-complete',
                severity:   'warning'
            });
        }

        var resultOk = (typeof step.expectedResult === 'string' && step.expectedResult !== '');
        if (!resultOk) {
            warnings.push({
                code:       'MISSING_FIELD',
                step_id:    step.step_id,
                targetType: 'step',
                targetId:   step.step_id,
                message:    'expectedResult is missing — step cannot be marked preview-complete',
                severity:   'warning'
            });
        }

        var counterActionsArr = Array.isArray(step.enemyCounterActions) ? step.enemyCounterActions : null;
        var counterOk = counterActionsArr !== null && counterActionsArr.length > 0;
        if (counterActionsArr !== null && !counterOk) {
            warnings.push({
                code:       'INCOMPLETE_FIELD',
                step_id:    step.step_id,
                targetType: 'step',
                targetId:   step.step_id,
                message:    'enemyCounterActions is empty — enemy response not defined for this step',
                severity:   'warning'
            });
        }

        // ── Rule 20: proposedVisualEffects — text descriptions only ──────────
        // No map objects, no coordinates from live sources, no Leaflet calls.
        var proposedVisualEffects = [];
        var fActions = Array.isArray(step.friendlyActions) ? step.friendlyActions : [];
        for (var fai = 0; fai < fActions.length; fai++) {
            var fa = fActions[fai];
            if (fa && typeof fa.uid === 'string' && typeof fa.action === 'string') {
                var faUnit = uidIndex[fa.uid] || aliasIndex[fa.uid];
                proposedVisualEffects.push({
                    type:        'friendly_action',
                    description: (faUnit ? faUnit.name : fa.uid) + ': ' + fa.action,
                    unitUid:     fa.uid
                });
            }
        }
        var eActions = counterActionsArr || [];
        for (var eai = 0; eai < eActions.length; eai++) {
            var ea = eActions[eai];
            if (ea && typeof ea.uid === 'string' && typeof ea.counterAction === 'string') {
                var eaUnit = uidIndex[ea.uid] || aliasIndex[ea.uid];
                proposedVisualEffects.push({
                    type:        'enemy_counter_action',
                    description: (eaUnit ? eaUnit.name : ea.uid) + ': ' + ea.counterAction,
                    unitUid:     ea.uid
                });
            }
        }
        // PR-220: include pre-built text-only effects from fixture step (e.g., engagement_arc rows
        // from the W3 adapter). Primitives only — no map objects, no coordinates, no Leaflet.
        // Existing fixtures without step.visualEffects are unaffected (treated as empty array).
        var prebuiltEffects = Array.isArray(step.visualEffects) ? step.visualEffects : [];
        for (var pvi = 0; pvi < prebuiltEffects.length; pvi++) {
            var pve = prebuiltEffects[pvi];
            if (pve && typeof pve === 'object' && !Array.isArray(pve) &&
                typeof pve.type === 'string' && typeof pve.description === 'string') {
                proposedVisualEffects.push({
                    type:        String(pve.type),
                    description: String(pve.description),
                    unitUid:     typeof pve.unitUid   === 'string' ? pve.unitUid   : null,
                    targetUid:   typeof pve.targetUid === 'string' ? pve.targetUid : null
                });
            }
        }

        var previewComplete = decisionOk && resultOk && counterOk;

        // ── Rule 22: assemble preview — primitives only, no fixture references ─
        var preview = {
            fixtureId:             typeof fixture.fixtureId === 'string'  ? fixture.fixtureId  : '',
            fixtureName:           typeof fixture.fixtureName === 'string' ? fixture.fixtureName : '',
            packageId:             typeof fixture.packageId === 'string'   ? fixture.packageId   : '',
            packageName:           typeof fixture.packageName === 'string' ? fixture.packageName : '',
            activeStepId:          step.step_id,
            activeStepIndex:       typeof step.stepIndex === 'number' ? step.stepIndex : 0,
            totalSteps:            stepsLen,
            stepSummary:           typeof step.title === 'string' ? step.title : '',
            situation:             typeof step.situation === 'string' ? step.situation : null,
            decision:              decisionOk ? step.selectedDecision : null,
            unitsReferenced:       resolvedUnits,
            objectivesReferenced:  resolvedObjectives,
            proposedVisualEffects:   proposedVisualEffects,
            objectiveStatusBaseline: typeof step.objectiveStatusBaseline === 'string' ? step.objectiveStatusBaseline : null,
            missingDataWarnings:     warnings.map(function (w) { return w.message; }),
            warningsDetail:          warnings,   // PR-222: full { code, message } objects for grouped display
            expectedResult:          resultOk ? step.expectedResult : null,
            previewComplete:         previewComplete,
            safety: {
                dryRunOnly:              true,
                previewOnly:             true,
                liveMutationAllowed:     false,
                backendCommitAllowed:    false,
                mapMutationAllowed:      false,
                unitMutationAllowed:     false,
                scenarioMutationAllowed: false,
                noLiveMapWrite:          true,
                noStepIndexMutation:     true
            },
            readOnly:            true,
            liveMutationAllowed: false
        };

        // PR-269: carry decisionOptions from fixture step into preview (read-only, no mutation).
        // Covers ALL navigation paths (initial load AND prev/next/jump which call
        // buildScenarioStepPreview directly). Step must have a non-empty decisionOptions array.
        if (Array.isArray(step.decisionOptions) && step.decisionOptions.length > 0) {
            preview.decisionOptions = step.decisionOptions;
        }

        return { passed: true, preview: preview, blockedReasons: [], warnings: warnings };
    }

    // ── PR-215: Wargame 3 Fixture Adapter ────────────────────────────────────
    // Pure in-memory transform: parsed Wargame 3 JSON object → AMBER RIDGE-shaped
    // dry-run fixture ready for buildScenarioStepPreview.
    // SAFETY: Does NOT mutate w3json. No DOM. No map. No window.units.
    //         No window.RmoozScenario. No storage. No network. No staging state.
    //         Returned fixture is deep-frozen. Gate 7 forbidden. No apply path.
    // Contract: docs/pr-214-wargame-fixture-adapter-contract.md
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    // No app.html script tag. No UI wiring.

    var _W3A_SAFETY = Object.freeze({
        dryRunOnly:              true,
        previewOnly:             true,
        liveMutationAllowed:     false,
        backendCommitAllowed:    false,
        mapMutationAllowed:      false,
        unitMutationAllowed:     false,
        scenarioMutationAllowed: false
    });

    // W3 uses full-form echelon strings (division, brigade, etc.) already.
    // This map normalises abbreviated forms too, for robustness.
    var _W3A_ECHELON_MAP = Object.freeze({
        'div':       'division',  'division':  'division',
        'bde':       'brigade',   'brigade':   'brigade',
        'bn':        'battalion', 'battalion': 'battalion',
        'coy':       'company',   'company':   'company',
        'sqn':       'squadron',  'squadron':  'squadron',
        'flot':      'flotilla',  'flotilla':  'flotilla',
        'plt':       'platoon',   'plat':      'platoon',   'platoon': 'platoon',
        'tm':        'team',      'team':      'team',
        'unit':      'unit'
    });

    function _w3aNormaliseEchelon(raw) {
        if (!raw || typeof raw !== 'string') { return 'unknown'; }
        var key = raw.toLowerCase().trim();
        return _W3A_ECHELON_MAP[key] || key;
    }

    // Convert a GeoJSON [lon, lat] array to { lat, lng }.
    // Both unit.coord and step coord arrays in W3 follow GeoJSON convention.
    function _w3aLonLatToStartLoc(description, coordArr) {
        if (!Array.isArray(coordArr) || coordArr.length < 2) { return null; }
        var lon = coordArr[0];
        var lat = coordArr[1];
        if (typeof lat !== 'number' || typeof lon !== 'number') { return null; }
        if (!isFinite(lat) || !isFinite(lon)) { return null; }
        return { description: description, lat: lat, lng: lon };
    }

    // Minimal deep-freeze helper — freezes obj and all enumerable nested objects.
    // Stops at non-objects. Does not modify the structure.
    function _w3aDeepFreeze(obj) {
        if (!obj || typeof obj !== 'object') { return obj; }
        if (Object.isFrozen(obj)) { return obj; }
        Object.freeze(obj);
        var keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            var val = obj[keys[i]];
            if (val && typeof val === 'object' && !Object.isFrozen(val)) {
                _w3aDeepFreeze(val);
            }
        }
        return obj;
    }

    function adaptWargame3ToFixture(w3json, options) {
        var opts           = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var blockedReasons = [];
        var warnings       = [];

        // ── Validation ────────────────────────────────────────────────────────
        // V1: w3json must be a non-null object, not an array
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            return { passed: false, fixture: null,
                     blockedReasons: ['w3json must be a non-null object (not array)'], warnings: warnings };
        }
        // V2: steps must be a non-empty array
        if (!Array.isArray(w3json.steps) || w3json.steps.length === 0) {
            return { passed: false, fixture: null,
                     blockedReasons: ['w3json.steps must be a non-empty array'], warnings: warnings };
        }
        // V3: red_units must be an array (soft — warn, do not block)
        if (!Array.isArray(w3json.red_units)) {
            blockedReasons.push('w3json.red_units must be an array');
        }
        // V4: blue_units_initial must be an array (soft — warn, do not block)
        if (!Array.isArray(w3json.blue_units_initial)) {
            blockedReasons.push('w3json.blue_units_initial must be an array');
        }
        if (blockedReasons.length > 0) {
            return { passed: false, fixture: null, blockedReasons: blockedReasons, warnings: warnings };
        }

        // Per-step coord lookup tables — fall back to {} if absent
        var redCoords  = (w3json.red_unit_step_coords  && typeof w3json.red_unit_step_coords  === 'object' && !Array.isArray(w3json.red_unit_step_coords))  ? w3json.red_unit_step_coords  : {};
        var blueCoords = (w3json.blue_unit_step_coords && typeof w3json.blue_unit_step_coords === 'object' && !Array.isArray(w3json.blue_unit_step_coords)) ? w3json.blue_unit_step_coords : {};
        if (!w3json.red_unit_step_coords)  { warnings.push({ code: 'MISSING_FIELD', field: 'red_unit_step_coords',  message: 'No per-step RED coordinates — startLocations will fall back to unit.coord' }); }
        if (!w3json.blue_unit_step_coords) { warnings.push({ code: 'MISSING_FIELD', field: 'blue_unit_step_coords', message: 'No per-step BLUE coordinates — startLocations will fall back to unit.coord' }); }

        // ── Unit mapping (Contract §4, Rules U1–U11) ─────────────────────────
        var units  = [];
        var uidSet = {};    // uid → true, for unitsReferenced validation

        function _buildUnit(rawUnit, side, coordTable, stepIndex) {
            // U2: UID key differs between RED (uid) and BLUE (unit_uid)
            var uid = null;
            if (side === 'enemy') {
                uid = (rawUnit.uid      && typeof rawUnit.uid      === 'string') ? rawUnit.uid.trim()      : null;
            } else {
                uid = (rawUnit.unit_uid && typeof rawUnit.unit_uid === 'string') ? rawUnit.unit_uid.trim() :
                      (rawUnit.uid      && typeof rawUnit.uid      === 'string') ? rawUnit.uid.trim()      : null;
            }
            if (!uid) { return null; }

            // U8: startLocation from step-specific coord; fall back to step 0, then unit.coord (PR-247)
            var sIdx     = (typeof stepIndex === 'number' && stepIndex >= 0) ? stepIndex : 0;
            var stepArr  = coordTable[uid];
            var rawCoord = (stepArr && Array.isArray(stepArr[sIdx])) ? stepArr[sIdx] :
                           (stepArr && Array.isArray(stepArr[0]))    ? stepArr[0]    : rawUnit.coord;
            var sl       = _w3aLonLatToStartLoc(uid + ' — step ' + sIdx, rawCoord);

            // U3: display name: label > name_en > uid (no name_en in W3 JSON but guard for future)
            var name = uid;
            if (rawUnit.label   && typeof rawUnit.label   === 'string' && rawUnit.label.trim())   { name = rawUnit.label.trim(); }
            else if (rawUnit.name_en && typeof rawUnit.name_en === 'string' && rawUnit.name_en.trim()) { name = rawUnit.name_en.trim(); }

            return {
                uid:           uid,
                name:          name,
                side:          side,
                type:          (rawUnit.domain && typeof rawUnit.domain === 'string') ? rawUnit.domain : 'unknown',
                echelon:       _w3aNormaliseEchelon(rawUnit.echelon),
                role:          (rawUnit.role   && typeof rawUnit.role   === 'string') ? rawUnit.role   : 'unknown',
                startLocation: sl || null,  // null triggers MISSING_COORDINATE in builder
                aliases:       [],          // U9: no aliases in W3
                readOnly:      true         // U10
            };
        }

        var redUnits = w3json.red_units || [];
        for (var ri = 0; ri < redUnits.length; ri++) {
            var ru = _buildUnit(redUnits[ri], 'enemy', redCoords);
            if (!ru) {
                warnings.push({ code: 'MISSING_FIELD', field: 'red_units['+ri+'].uid', message: 'RED unit at index '+ri+' has no uid — skipped' });
                continue;
            }
            if (!ru.startLocation) {
                warnings.push({ code: 'MISSING_COORDINATE', field: ru.uid+'.startLocation', message: 'RED unit '+ru.uid+' has no valid start coordinate' });
            }
            units.push(ru);
            uidSet[ru.uid] = true;
        }

        var blueUnits = w3json.blue_units_initial || [];
        for (var bi = 0; bi < blueUnits.length; bi++) {
            var bu = _buildUnit(blueUnits[bi], 'friendly', blueCoords);
            if (!bu) {
                warnings.push({ code: 'MISSING_FIELD', field: 'blue_units_initial['+bi+'].unit_uid', message: 'BLUE unit at index '+bi+' has no uid — skipped' });
                continue;
            }
            if (!bu.startLocation) {
                warnings.push({ code: 'MISSING_COORDINATE', field: bu.uid+'.startLocation', message: 'BLUE unit '+bu.uid+' has no valid start coordinate' });
            }
            units.push(bu);
            uidSet[bu.uid] = true;
        }

        // U11: unit count sanity
        if (units.length < 100 || units.length > 200) {
            warnings.push({ code: 'UNIT_COUNT_ANOMALY', field: 'units', message: 'Unit count out of expected range: ' + units.length + ' (expected 100–200)' });
        }

        // ── Objective mapping (Contract §5, Rules OBJ1–OBJ3) ─────────────────
        // W3 has one primary objective (w3json.obj) with no id field.
        // objective_status_baseline per step is a plain string status — single objective.
        var objectives = [];
        var objIdSet   = {};
        var W3_PRIMARY_OBJ_ID = 'W3-OBJ-PRIMARY';

        if (w3json.obj && typeof w3json.obj === 'object' && !Array.isArray(w3json.obj)) {
            var objCoord = _w3aLonLatToStartLoc(
                (w3json.obj.name && typeof w3json.obj.name === 'string') ? w3json.obj.name : W3_PRIMARY_OBJ_ID,
                w3json.obj.coord
            );
            objectives.push({
                objectiveId:   W3_PRIMARY_OBJ_ID,
                name:          (w3json.obj.name && typeof w3json.obj.name === 'string') ? w3json.obj.name : W3_PRIMARY_OBJ_ID,
                type:          'seize',
                location:      objCoord ? { description: objCoord.description, lat: objCoord.lat, lng: objCoord.lng } : null,
                desiredEffect: 'Seize primary objective — derived from W3 scenario',
                readOnly:      true
            });
            objIdSet[W3_PRIMARY_OBJ_ID] = true;
        } else {
            warnings.push({ code: 'MISSING_FIELD', field: 'w3json.obj', message: 'No primary objective in w3json.obj' });
        }

        // ── Step mapping (Contract §6, Rules S1–S12) ─────────────────────────
        var steps       = [];
        var expWarnings = [];
        var expResults  = [];

        for (var si = 0; si < w3json.steps.length; si++) {
            var step = w3json.steps[si];
            var sIdx = (typeof step.index === 'number') ? step.index : si;
            var sId  = 'W3-STEP-' + (sIdx < 10 ? '0' + sIdx : '' + sIdx);

            // S4: situation from narrative_en_fallback, fall back to AR
            var situation = null;
            if (typeof step.narrative_en_fallback === 'string' && step.narrative_en_fallback.trim()) {
                situation = step.narrative_en_fallback.trim();
            } else if (typeof step.narrative_ar_fallback === 'string' && step.narrative_ar_fallback.trim()) {
                situation = step.narrative_ar_fallback.trim();
            }

            // S6/S7: friendlyActions from BLUE actors, enemyCounterActions from RED actors
            var actors         = Array.isArray(step.actors) ? step.actors : [];
            var friendlyActs   = [];
            var enemyCActions  = [];
            for (var ai = 0; ai < actors.length; ai++) {
                var actor = actors[ai];
                if (!actor || typeof actor !== 'object') { continue; }
                var aWhat = (typeof actor.action_what === 'string' && actor.action_what.trim()) ? actor.action_what.trim() : '';
                var aUid  = (typeof actor.uid         === 'string' && actor.uid.trim())         ? actor.uid.trim()         : null;
                if (!aWhat || !aUid) { continue; }
                if (actor.side === 'BLUE') {
                    friendlyActs.push({ uid: aUid, action: aWhat });
                } else if (actor.side === 'RED') {
                    enemyCActions.push({ uid: aUid, counterAction: aWhat });
                }
            }

            // S8: unitsReferenced — deduplicated union of actor + affected UIDs
            var affected    = Array.isArray(step.affected) ? step.affected : [];
            var seenUids    = {};
            var unitsRefArr = [];
            var combined    = actors.concat(affected);
            for (var ci = 0; ci < combined.length; ci++) {
                var ent    = combined[ci];
                var entUid = (ent && typeof ent.uid === 'string' && ent.uid.trim()) ? ent.uid.trim() : null;
                if (entUid && !seenUids[entUid]) {
                    seenUids[entUid] = true;
                    unitsRefArr.push(entUid);
                    if (!uidSet[entUid]) {
                        expWarnings.push({ stepId: sId, field: 'unitsReferenced', warningType: 'UNKNOWN_UNIT', detail: entUid });
                    }
                }
            }

            // S9: objectivesReferenced — W3 has one objective; reference it each step
            // objective_status_baseline is a plain string (status label), not a map.
            // The primary objective is always in scope for all 17 steps.
            var objRefs = objIdSet[W3_PRIMARY_OBJ_ID] ? [W3_PRIMARY_OBJ_ID] : [];

            // PR-220 / S9b: preserve per-step objective status string.
            // Kept as a plain string — no map, no Leaflet, no coordinate.
            // Does NOT affect previewComplete (decided/result logic unchanged).
            var objStatusBase = (typeof step.objective_status_baseline === 'string' && step.objective_status_baseline.trim())
                ? step.objective_status_baseline.trim() : null;

            // PR-220 / S13: translate engagement_arcs to text-only visual effect rows.
            // No coordinates, no Leaflet objects, no live unit references.
            // Description = primitives only: actor_uid → target_uid [cause_what] (status_change).
            var engArcs     = Array.isArray(step.engagement_arcs) ? step.engagement_arcs : [];
            var arcEffects  = [];
            for (var avi = 0; avi < engArcs.length; avi++) {
                var arc = engArcs[avi];
                if (!arc || typeof arc !== 'object') { continue; }
                var arcActor  = (typeof arc.actor_uid   === 'string' && arc.actor_uid.trim())   ? arc.actor_uid.trim()   : null;
                var arcTarget = (typeof arc.target_uid  === 'string' && arc.target_uid.trim())  ? arc.target_uid.trim()  : null;
                var arcCause  = (typeof arc.cause_what  === 'string' && arc.cause_what.trim())  ? arc.cause_what.trim()  : '';
                var arcStatus = (typeof arc.status_change === 'string' && arc.status_change.trim()) ? arc.status_change.trim() : '';
                if (!arcActor && !arcCause) { continue; }  // skip arcs with no useful data
                var descParts = [];
                if (arcActor)  { descParts.push(arcActor); }
                if (arcTarget) { descParts.push('→ ' + arcTarget); }
                if (arcCause)  { descParts.push('[' + arcCause + ']'); }
                if (arcStatus) { descParts.push('(' + arcStatus + ')'); }
                arcEffects.push({
                    type:        'engagement_arc',
                    description: descParts.join(' '),
                    unitUid:     arcActor,
                    targetUid:   arcTarget,
                    readOnly:    true
                });
            }

            // S11: missingDataExpected — always selectedDecision + expectedResult for W3
            var missingDE = ['selectedDecision', 'expectedResult'];
            if (!situation) { missingDE.push('situation'); }

            // PR-247: build per-step unit location map — uid → startLocation for step sIdx.
            // _buildUnit is called with sIdx so each step reflects the correct coord entry.
            var _sLocs = {};
            for (var _sli = 0; _sli < redUnits.length; _sli++) {
                var _slRu = _buildUnit(redUnits[_sli], 'enemy', redCoords, sIdx);
                if (_slRu && _slRu.uid && _slRu.startLocation) { _sLocs[_slRu.uid] = _slRu.startLocation; }
            }
            for (var _sli2 = 0; _sli2 < blueUnits.length; _sli2++) {
                var _slBu = _buildUnit(blueUnits[_sli2], 'friendly', blueCoords, sIdx);
                if (_slBu && _slBu.uid && _slBu.startLocation) { _sLocs[_slBu.uid] = _slBu.startLocation; }
            }

            steps.push({
                step_id:                  sId,
                stepIndex:                sIdx,
                title:                    (step.phase || '') + (step.time_label ? ' — ' + step.time_label : ''),
                situation:                situation,
                selectedDecision:         null,       // S5: always null for W3 — never synthesised
                friendlyActions:          friendlyActs,
                enemyCounterActions:      enemyCActions,
                unitsReferenced:          unitsRefArr,
                objectivesReferenced:     objRefs,
                objectiveStatusBaseline:  objStatusBase, // PR-220: plain string — DORMANT/THREATENED/CONTESTED/DENIED
                visualEffects:            arcEffects,    // PR-220: text-only engagement arc rows — no map objects
                expectedResult:           null,       // S10: not present in W3
                missingDataExpected:      missingDE,
                _stepUnitLocations:       _sLocs,     // PR-247: per-step uid→startLocation
                safety:              {
                    dryRunOnly:              true,
                    previewOnly:             true,
                    liveMutationAllowed:     false,
                    backendCommitAllowed:    false,
                    mapMutationAllowed:      false,
                    unitMutationAllowed:     false,
                    scenarioMutationAllowed: false
                },
                readOnly:            true
            });

            // Contract §9: pre-declare guaranteed per-step warnings
            expWarnings.push({ stepId: sId, field: 'selectedDecision', warningType: 'MISSING_FIELD' });
            expWarnings.push({ stepId: sId, field: 'expectedResult',   warningType: 'MISSING_FIELD' });

            // Contract §10: all steps → previewComplete false
            expResults.push({ stepId: sId, previewComplete: false, notes: 'Missing: selectedDecision, expectedResult' });
        }

        // ── Top-level fixture assembly ────────────────────────────────────────
        var fixture = {
            fixtureId:              'wargame3-fixture-v1',
            fixtureName:            (typeof w3json.name           === 'string' && w3json.name)           ? w3json.name           : 'wargame3',
            description:            'Adapted from Wargame 3 — dry-run preview only',
            sourceType:             'wargame3_adapted',
            readOnly:               true,
            liveMutationAllowed:    false,
            packageId:              (typeof w3json.ported_from    === 'string') ? w3json.ported_from    : 'wargame3',
            packageName:            (typeof w3json.scenario_label === 'string') ? w3json.scenario_label : 'Wargame 3',
            units:                  units,
            objectives:             objectives,
            steps:                  steps,
            expectedWarnings:       expWarnings,
            expectedPreviewResults: expResults,
            safety:                 {
                dryRunOnly:              true,
                previewOnly:             true,
                liveMutationAllowed:     false,
                backendCommitAllowed:    false,
                mapMutationAllowed:      false,
                unitMutationAllowed:     false,
                scenarioMutationAllowed: false
            }
        };

        // Rule SF5: deep-freeze the output. Does not touch w3json (input).
        _w3aDeepFreeze(fixture);

        return { passed: true, fixture: fixture, blockedReasons: [], warnings: warnings };
    }

    // ── PR-269: Wargame 3 Decision Options Fixture Overlay ───────────────────
    // Read-only, in-memory fixture overlay that injects validated decisionOptions[]
    // into designated fixture steps at runtime — without editing wargame3.json and
    // without DevTools.
    // SAFETY: Does NOT mutate the frozen fixture. No DOM. No map. No window.units.
    //         No window.RmoozScenario. No storage. No network. No staging state.
    //         No apply path. No Gate 7. Returns a NEW fixture copy with frozen options.
    //         Input fixture is never touched.

    // Default overlay data for Wargame 3 Step 08 (W3-STEP-08).
    // Three read-only COA options covering the primary decision points.
    var W3_DECISION_OPTIONS_FIXTURE_OVERLAY = Object.freeze({
        'W3-STEP-08': Object.freeze([
            Object.freeze({
                id:              'W3-STEP-08-OPT-HOLD',
                label:           'Hold Current Position',
                description:     'Maintain current defensive line and consolidate logistics before advancing.',
                intent:          'Preserve combat power while awaiting resupply.',
                source:          'instructor',
                readOnly:        true,
                affectedUnits:   Object.freeze(['2BN', '3BN']),
                expectedEffects: Object.freeze(['Logistics consolidation', 'Defensive posture maintained']),
                risks:           Object.freeze(['Enemy may reinforce gap', 'Window of opportunity may close']),
                priority:        1,
                displayIndex:    0,
                displayLabel:    'COA A — Hold'
            }),
            Object.freeze({
                id:              'W3-STEP-08-OPT-REINFORCE',
                label:           'Reinforce the Gap',
                description:     'Redirect 3BN to seal the identified gap in the eastern flank.',
                intent:          'Prevent exploitation of the eastern gap by OPFOR.',
                source:          'instructor',
                readOnly:        true,
                affectedUnits:   Object.freeze(['3BN', 'ARTY-PLT']),
                expectedEffects: Object.freeze(['Eastern flank secured', 'Gap sealed within 6 hours']),
                risks:           Object.freeze(['3BN stretched thin', 'Western sector weakened']),
                priority:        2,
                displayIndex:    1,
                displayLabel:    'COA B — Reinforce'
            }),
            Object.freeze({
                id:              'W3-STEP-08-OPT-DELAY',
                label:           'Delay and Withdraw',
                description:     'Execute a controlled delay to draw OPFOR forward before counterattack.',
                intent:          'Create conditions for a decisive counterattack from depth.',
                source:          'instructor',
                readOnly:        true,
                affectedUnits:   Object.freeze(['2BN', '3BN', 'RECON-SQN']),
                expectedEffects: Object.freeze(['OPFOR overextended', 'Counterattack conditions set']),
                risks:           Object.freeze(['Terrain loss', 'Population concerns', 'Logistics complexity']),
                priority:        3,
                displayIndex:    2,
                displayLabel:    'COA C — Delay'
            })
        ])
    });

    // applyWargame3DecisionOptionsFixtureOverlay(fixture, overlayMap?)
    //   Pure function. Copies the frozen fixture shallowly, then for each step
    //   referenced in the overlay map, creates a new step object with decisionOptions[]
    //   injected (only if every option passes isWargame3DecisionOptionSafe).
    //   Returns { passed, fixture (new copy), appliedStepRefs[], rejectedStepRefs[],
    //             blockedReasons[], warnings[] }.
    //   Rules:
    //     R1  fixture must be a non-null, non-array object with readOnly === true.
    //     R2  overlayMap defaults to W3_DECISION_OPTIONS_FIXTURE_OVERLAY if omitted/null.
    //     R3  overlay must be a non-null, non-array object.
    //     R4  If overlay has no own keys, return passed:true with empty appliedStepRefs.
    //     R5  Each step's options array is validated item-by-item via
    //         isWargame3DecisionOptionSafe; any invalid option skips that step entirely
    //         (records warning, adds to rejectedStepRefs — does NOT block).
    //     R6  Input fixture is never mutated (it may be frozen).
    //     R7  Returned fixture.steps is a new array; step objects that received options
    //         are new plain objects (key-by-key copy); untouched step objects are reused
    //         references (safe — only reading, not writing).
    //     R8  New fixture is deep-frozen via _w3aDeepFreeze before return.
    function applyWargame3DecisionOptionsFixtureOverlay(fixture, overlayMap) {
        var blockedReasons = []; var warnings = [];
        var appliedStepRefs = []; var rejectedStepRefs = [];

        // R1: fixture guard
        if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
            return { passed: false, fixture: null, appliedStepRefs: [], rejectedStepRefs: [],
                     blockedReasons: ['fixture must be a non-null, non-array object'], warnings: warnings };
        }
        if (fixture.readOnly !== true) {
            return { passed: false, fixture: null, appliedStepRefs: [], rejectedStepRefs: [],
                     blockedReasons: ['fixture.readOnly must be true'], warnings: warnings };
        }

        // R2: default overlay map
        var overlay = (overlayMap !== undefined && overlayMap !== null) ? overlayMap
                                                                        : W3_DECISION_OPTIONS_FIXTURE_OVERLAY;

        // R3: overlay type guard
        if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
            return { passed: false, fixture: null, appliedStepRefs: [], rejectedStepRefs: [],
                     blockedReasons: ['overlayMap must be a non-null, non-array object'], warnings: warnings };
        }

        // R4: no-op if empty
        var overlayKeys = Object.keys(overlay);
        if (overlayKeys.length === 0) {
            return { passed: true, fixture: fixture, appliedStepRefs: [], rejectedStepRefs: [],
                     blockedReasons: [], warnings: warnings };
        }

        // Build a step-index lookup (stepRef → array index) from the frozen fixture
        var stepIndexByRef = {};
        var originalSteps = Array.isArray(fixture.steps) ? fixture.steps : [];
        for (var si = 0; si < originalSteps.length; si++) {
            var s = originalSteps[si];
            if (s && typeof s.step_id === 'string' && s.step_id) {
                stepIndexByRef[s.step_id] = si;
            }
        }

        // Build the new steps array (R7: copy, not mutate)
        var newSteps = originalSteps.slice();
        for (var ki = 0; ki < overlayKeys.length; ki++) {
            var stepRef = overlayKeys[ki];
            var rawOptions = overlay[stepRef];

            // Must be a non-empty array
            if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
                warnings.push({ code: 'W3_OVERLAY_EMPTY_OPTIONS', message: 'overlay for ' + stepRef + ' is empty or not an array — skipped' });
                rejectedStepRefs.push(stepRef);
                continue;
            }

            // Validate each option — R5: all must pass or the whole step is skipped
            var validatedOptions = [];
            var stepRejected = false;
            for (var oi = 0; oi < rawOptions.length; oi++) {
                var optCheck = isWargame3DecisionOptionSafe(rawOptions[oi]);
                if (!optCheck.passed) {
                    warnings.push({ code: 'W3_OVERLAY_INVALID_OPTION', message: 'overlay option ' + oi + ' for ' + stepRef + ' failed validation: ' + optCheck.blockedReasons.join('; ') });
                    stepRejected = true;
                    break;
                }
                validatedOptions.push(rawOptions[oi]);
            }
            if (stepRejected) {
                rejectedStepRefs.push(stepRef);
                continue;
            }

            // Find the step in the fixture
            if (!Object.prototype.hasOwnProperty.call(stepIndexByRef, stepRef)) {
                warnings.push({ code: 'W3_OVERLAY_STEP_NOT_FOUND', message: 'overlay step ' + stepRef + ' not found in fixture — skipped' });
                rejectedStepRefs.push(stepRef);
                continue;
            }
            var targetIdx = stepIndexByRef[stepRef];
            var origStep = originalSteps[targetIdx];

            // R7: key-by-key copy of the step object, then inject decisionOptions
            var newStep = {};
            var origKeys = Object.keys(origStep);
            for (var ok = 0; ok < origKeys.length; ok++) {
                newStep[origKeys[ok]] = origStep[origKeys[ok]];
            }
            newStep.decisionOptions = validatedOptions.slice();
            newSteps[targetIdx] = newStep;
            appliedStepRefs.push(stepRef);
        }

        // R7: build new fixture object (key-by-key copy of fixture top-level)
        var newFixture = {};
        var fixtureKeys = Object.keys(fixture);
        for (var fk = 0; fk < fixtureKeys.length; fk++) {
            newFixture[fixtureKeys[fk]] = fixture[fixtureKeys[fk]];
        }
        newFixture.steps = newSteps;

        // R8: deep-freeze the new fixture
        _w3aDeepFreeze(newFixture);

        return {
            passed:          true,
            fixture:         newFixture,
            appliedStepRefs: appliedStepRefs,
            rejectedStepRefs: rejectedStepRefs,
            blockedReasons:  [],
            warnings:        warnings
        };
    }

    // ── PR-273: Wargame 3 Expected Result Source Layer ───────────────────────
    // Frozen instructor-expected result candidates for W3-STEP-08 COA options.
    //
    // SAFETY — this source layer is pure data only.
    //   No UI.  No apply.  No execute.  No commit.  No Gate 7.
    //   No simulation.  No adjudication engine.  No live scenario mutation.
    //   No storage.  No network.  No map.  No movement.  No casualties.
    //   No detection.  No weapon effects.  No tactical success/failure outcomes.
    //   previewComplete remains false.
    //   selectedDecision remains ONLY inside the dry-run record (PR-266/268/270).
    //   expectedEffects, objective_status_baseline, and proposedVisualEffects
    //   are NOT used here.
    //
    // resultType uses "expected" (allowed by isWargame3ExpectedResultSafe).
    // confidence uses "instructor_defined" (allowed by isWargame3ExpectedResultSafe).
    // source uses "instructor" (allowed by isWargame3ExpectedResultSafe).
    // linkedDecisionId matches the selectedDecision.id format produced by
    //   buildWargame3OperatorSelectionDryRunRecord: "SEL-<stepRef>-<optionId>".

    var W3_EXPECTED_RESULT_FIXTURE_SOURCE = Object.freeze({
        'W3-STEP-08': Object.freeze({
            'W3-STEP-08-OPT-HOLD': Object.freeze({
                id:               'W3-STEP-08-EXP-HOLD',
                linkedDecisionId: 'SEL-W3-STEP-08-W3-STEP-08-OPT-HOLD',
                linkedOptionRef:  'W3-STEP-08-OPT-HOLD',
                label:            'Expected result — hold current position',
                description:      'Defensive posture remains stable while the threatened objective remains under observation. No live movement, damage, detection, or adjudicated success is created by this fixture.',
                resultType:       'expected',
                source:           'instructor',
                confidence:       'instructor_defined',
                readOnly:         true
            }),
            'W3-STEP-08-OPT-REINFORCE': Object.freeze({
                id:               'W3-STEP-08-EXP-REINFORCE',
                linkedDecisionId: 'SEL-W3-STEP-08-W3-STEP-08-OPT-REINFORCE',
                linkedOptionRef:  'W3-STEP-08-OPT-REINFORCE',
                label:            'Expected result — reinforce the gap',
                description:      'Planning focus shifts toward the threatened gap while the preview remains dry-run only. No live relocation, combat result, or scenario mutation is created by this fixture.',
                resultType:       'expected',
                source:           'instructor',
                confidence:       'instructor_defined',
                readOnly:         true
            }),
            'W3-STEP-08-OPT-DELAY': Object.freeze({
                id:               'W3-STEP-08-EXP-DELAY',
                linkedDecisionId: 'SEL-W3-STEP-08-W3-STEP-08-OPT-DELAY',
                linkedOptionRef:  'W3-STEP-08-OPT-DELAY',
                label:            'Expected result — delay and withdraw',
                description:      'Decision timing is deferred and withdrawal planning is reviewed as a dry-run branch. No live withdrawal order, success state, failure state, or adjudicated result is created by this fixture.',
                resultType:       'expected',
                source:           'instructor',
                confidence:       'instructor_defined',
                readOnly:         true
            })
        })
    });

    // getWargame3ExpectedResultForReview(record, options?)
    //   Pure function. Looks up the instructor expected result candidate for a
    //   validated operatorSelectionDryRunRecord. No DOM. No map. No storage.
    //   No mutation. No network. No Gate 7. No apply. No previewComplete change.
    //   Does NOT attach the result to preview, step, or any global state.
    //   Returns { passed, expectedResult: object|null, blockedReasons[], warnings[] }.
    //
    //   Rules:
    //     1. record must pass isWargame3OperatorSelectionDryRunRecordSafe.
    //     2. stepRef / optionRef extracted from validated record fields.
    //     3. Look up W3_EXPECTED_RESULT_FIXTURE_SOURCE[stepRef][optionRef].
    //        Fail safely if not found.
    //     4. Create a shallow copy of the source entry — never return the frozen object.
    //     5. Validate copy via isWargame3ExpectedResultSafe.
    //     6. Cross-check copy.linkedDecisionId === record.selectedDecision.id.
    //     7. Cross-check copy.linkedOptionRef === record.optionRef.
    //     8. Confirm copy.readOnly === true.
    //     9. Confirm copy.source is an allowed safe source.
    //    10. Return { passed: true, expectedResult: copy, ... } on success.
    //        record is never mutated. source constant is never mutated.
    function getWargame3ExpectedResultForReview(record, options) {
        var blockedReasons = []; var warnings = [];
        var _opts = options || {};

        // Rule 1: validate record
        var recCheck = isWargame3OperatorSelectionDryRunRecordSafe(record, _opts);
        if (!recCheck.passed) {
            return { passed: false, expectedResult: null,
                     blockedReasons: recCheck.blockedReasons, warnings: recCheck.warnings };
        }

        // Rule 2: extract from validated record (safe — recCheck passed)
        var stepRef   = record.stepRef;
        var optionRef = record.optionRef;

        // Rule 3: look up in source constant — fail safely if not found
        var stepBucket = W3_EXPECTED_RESULT_FIXTURE_SOURCE[stepRef];
        if (!stepBucket || typeof stepBucket !== 'object' || Array.isArray(stepBucket)) {
            blockedReasons.push('no expected result source found for stepRef: ' + stepRef);
            return { passed: false, expectedResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        var sourceEntry = stepBucket[optionRef];
        if (!sourceEntry || typeof sourceEntry !== 'object' || Array.isArray(sourceEntry)) {
            blockedReasons.push('no expected result source found for optionRef: ' + optionRef);
            return { passed: false, expectedResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 4: shallow copy — do not return the frozen source object directly
        var copy = {};
        var entryKeys = Object.keys(sourceEntry);
        for (var ki = 0; ki < entryKeys.length; ki++) {
            copy[entryKeys[ki]] = sourceEntry[entryKeys[ki]];
        }

        // Rule 5: validate the copy
        var erCheck = isWargame3ExpectedResultSafe(copy, _opts);
        if (!erCheck.passed) {
            return { passed: false, expectedResult: null,
                     blockedReasons: erCheck.blockedReasons, warnings: erCheck.warnings };
        }

        // Rule 6: cross-check linkedDecisionId === record.selectedDecision.id
        if (copy.linkedDecisionId !== record.selectedDecision.id) {
            blockedReasons.push(
                'expectedResult.linkedDecisionId does not match record.selectedDecision.id');
            return { passed: false, expectedResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 7: cross-check linkedOptionRef === record.optionRef
        if (copy.linkedOptionRef !== record.optionRef) {
            blockedReasons.push(
                'expectedResult.linkedOptionRef does not match record.optionRef');
            return { passed: false, expectedResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 8: confirm readOnly
        if (copy.readOnly !== true) {
            blockedReasons.push('expectedResult.readOnly must be true');
            return { passed: false, expectedResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 9: confirm source is an allowed safe source
        var _erAllowedSources = ['instructor', 'adjudication', 'source_expected'];
        if (_erAllowedSources.indexOf(copy.source) === -1) {
            blockedReasons.push(
                'expectedResult.source is not an allowed safe source: ' + copy.source);
            return { passed: false, expectedResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 10: return copy only
        return { passed: true, expectedResult: copy, blockedReasons: [], warnings: warnings };
    }

    // hasWargame3ExpectedResultForReview(record)
    //   Pure function. Indicates whether a reviewed COA record has an expected
    //   result candidate available in the source layer. Calls
    //   getWargame3ExpectedResultForReview internally; does NOT mutate anything.
    //   Returns { passed, available, stepRef, optionRef, blockedReasons[], warnings[] }.
    function hasWargame3ExpectedResultForReview(record) {
        var stepRef   = null;
        var optionRef = null;

        // Extract identifiers from record for informational return (may be null if invalid)
        if (record && typeof record === 'object' && !Array.isArray(record)) {
            stepRef   = (typeof record.stepRef   === 'string' && record.stepRef)
                        ? record.stepRef   : null;
            optionRef = (typeof record.optionRef === 'string' && record.optionRef)
                        ? record.optionRef : null;
        }

        var getResult = getWargame3ExpectedResultForReview(record);

        if (!getResult.passed) {
            return {
                passed:         false,
                available:      false,
                stepRef:        stepRef,
                optionRef:      optionRef,
                blockedReasons: getResult.blockedReasons,
                warnings:       getResult.warnings
            };
        }

        return {
            passed:         true,
            available:      true,
            stepRef:        stepRef,
            optionRef:      optionRef,
            blockedReasons: [],
            warnings:       []
        };
    }

    // ── PR-274: Wargame 3 Scenario Review Session State Builder ─────────────────
    // Pure helper. Builds a read-only session-state object summarising the current
    // Wargame 3 scenario review workflow for a given preview step.
    //
    // SAFETY:
    //   No DOM.  No map paint.  No Leaflet.  No storage.  No network.
    //   No window.RmoozScenario mutation.  No window.units.  No window.lines.
    //   No apply/execute/commit/Gate 7.  No simulation.  No expectedResult wiring.
    //   previewComplete: false always.  selectedDecision remains only inside record.
    //   Does not mutate preview, decisionOptions, or reviewed record.
    //
    // buildWargame3ScenarioReviewSessionState(preview, options?)
    //   preview — a Wargame 3 dry-run preview object (from buildScenarioStepPreview).
    //   options.overlay — optional read-only overlay from buildWargame3ReadOnlyMapOverlayData;
    //                     if supplied, counts are summarised (no map paint).
    //   Returns { passed, session: object|null, blockedReasons[], warnings[] }.
    function buildWargame3ScenarioReviewSessionState(preview, options) {
        var blockedReasons = []; var warnings = [];
        var opts = (options && typeof options === 'object' && !Array.isArray(options))
                   ? options : {};

        // Rule 1: preview must be a non-null, non-array object
        if (!preview || typeof preview !== 'object' || Array.isArray(preview)) {
            blockedReasons.push('preview must be a non-null, non-array object');
            return { passed: false, session: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 2: must be a W3 preview (activeStepId must match /^W3-STEP-/i)
        var stepRef = (typeof preview.activeStepId === 'string' && preview.activeStepId)
                      ? preview.activeStepId : '';
        if (!stepRef || !/^W3-STEP-/i.test(stepRef)) {
            blockedReasons.push(
                'preview is not a Wargame 3 preview (activeStepId must match W3-STEP-*)');
            return { passed: false, session: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // ── Scenario identity ──────────────────────────────────────────────────
        var scenarioId   = (typeof preview.fixtureId   === 'string' && preview.fixtureId)
                           ? preview.fixtureId   : null;
        var scenarioName = (typeof preview.fixtureName === 'string' && preview.fixtureName)
                           ? preview.fixtureName : null;

        // ── Step identity ──────────────────────────────────────────────────────
        var stepIndex  = (typeof preview.activeStepIndex === 'number')
                         ? preview.activeStepIndex : null;
        var totalSteps = (typeof preview.totalSteps === 'number')
                         ? preview.totalSteps : null;

        // ── Objective status baseline ──────────────────────────────────────────
        var objectiveStatus = (typeof preview.objectiveStatusBaseline === 'string' &&
                               preview.objectiveStatusBaseline)
                              ? preview.objectiveStatusBaseline : null;

        // ── Decision options ───────────────────────────────────────────────────
        var decisionOptionsAvailable = false;
        var decisionOptionCount      = 0;

        if (Array.isArray(preview.decisionOptions) && preview.decisionOptions.length > 0) {
            for (var di = 0; di < preview.decisionOptions.length; di++) {
                var doCheck = isWargame3DecisionOptionSafe(preview.decisionOptions[di]);
                if (doCheck.passed) { decisionOptionCount++; }
            }
            decisionOptionsAvailable = decisionOptionCount > 0;
        }

        // ── Reviewed COA ───────────────────────────────────────────────────────
        // 1. Try preview-local memory first (module-private).
        // 2. Fall back to preview.operatorSelectionDryRunRecord if present.
        var reviewedCoaRecord = null;

        var _memRec = _getW3CoaReviewRecordForStep(stepRef);
        if (_memRec) {
            var _memCheck = isWargame3OperatorSelectionDryRunRecordSafe(_memRec);
            if (_memCheck.passed) { reviewedCoaRecord = _memRec; }
        }

        if (!reviewedCoaRecord &&
            preview.operatorSelectionDryRunRecord &&
            typeof preview.operatorSelectionDryRunRecord === 'object' &&
            !Array.isArray(preview.operatorSelectionDryRunRecord)) {
            var _pvRecCheck = isWargame3OperatorSelectionDryRunRecordSafe(
                                  preview.operatorSelectionDryRunRecord);
            if (_pvRecCheck.passed) {
                reviewedCoaRecord = preview.operatorSelectionDryRunRecord;
            }
        }

        var reviewedCoa = { available: false, optionRef: null, label: null, status: null };
        if (reviewedCoaRecord) {
            reviewedCoa.available = true;
            reviewedCoa.optionRef = (typeof reviewedCoaRecord.optionRef === 'string')
                                    ? reviewedCoaRecord.optionRef : null;
            reviewedCoa.label     = (reviewedCoaRecord.selectedDecision &&
                                     typeof reviewedCoaRecord.selectedDecision.label === 'string')
                                    ? reviewedCoaRecord.selectedDecision.label : null;
            reviewedCoa.status    = (typeof reviewedCoaRecord.status === 'string')
                                    ? reviewedCoaRecord.status : null;
        }

        // ── Map overlay summary ────────────────────────────────────────────────
        // Reads supplied read-only overlay counts only — no map paint, no Leaflet.
        var mapOverlaySummary = {
            markerCount:             0,
            movementTrailCount:      0,
            objectiveHighlightCount: 0,
            warningCount:            0
        };
        if (opts.overlay &&
            typeof opts.overlay === 'object' &&
            !Array.isArray(opts.overlay) &&
            opts.overlay.readOnly === true) {
            mapOverlaySummary.markerCount             =
                Array.isArray(opts.overlay.markers)
                ? opts.overlay.markers.length : 0;
            mapOverlaySummary.movementTrailCount      =
                Array.isArray(opts.overlay.movementTrails)
                ? opts.overlay.movementTrails.length : 0;
            mapOverlaySummary.objectiveHighlightCount =
                Array.isArray(opts.overlay.objectiveHighlights)
                ? opts.overlay.objectiveHighlights.length : 0;
            mapOverlaySummary.warningCount            =
                Array.isArray(opts.overlay.warnings)
                ? opts.overlay.warnings.length : 0;
        }

        // ── Warning summary ────────────────────────────────────────────────────
        var _W3SRS_MAX_WARN_CODES = 20;
        var warningSummary = { warningCount: 0, warningCodes: [] };
        var _rawWarns = Array.isArray(preview.warningsDetail)        ? preview.warningsDetail
                      : Array.isArray(preview.missingDataWarnings)   ? preview.missingDataWarnings
                      : [];
        warningSummary.warningCount = _rawWarns.length;
        for (var wsi = 0; wsi < Math.min(_rawWarns.length, _W3SRS_MAX_WARN_CODES); wsi++) {
            var _wItem = _rawWarns[wsi];
            if (typeof _wItem === 'string') {
                warningSummary.warningCodes.push(_wItem);
            } else if (_wItem && typeof _wItem === 'object') {
                var _wCode = (typeof _wItem.code === 'string' && _wItem.code)  ? _wItem.code
                           : (typeof _wItem.type === 'string' && _wItem.type)  ? _wItem.type
                           : null;
                if (_wCode) { warningSummary.warningCodes.push(_wCode); }
            }
        }

        // ── Assemble read-only session object ─────────────────────────────────
        var session = {
            sessionType:          'wargame3_review_session',
            source:               'dry_run_preview',
            readOnly:             true,
            dryRunOnly:           true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,

            scenarioId:    scenarioId,
            scenarioName:  scenarioName,

            stepRef:    stepRef,
            stepIndex:  stepIndex,
            totalSteps: totalSteps,

            objectiveStatus: objectiveStatus,

            decisionOptionsAvailable: decisionOptionsAvailable,
            decisionOptionCount:      decisionOptionCount,

            reviewedCoa: reviewedCoa,

            expectedResultAttached: false,
            previewComplete:        false,

            mapOverlaySummary: mapOverlaySummary,

            warningSummary: warningSummary
        };

        return { passed: true, session: session, blockedReasons: [], warnings: warnings };
    }

    // ── PR-216: Wargame 3 Dry-Run Preview Harness ────────────────────────────
    // Console-only test harness. Chains adaptWargame3ToFixture → buildScenarioStepPreview.
    // SAFETY: Does NOT store fixture or preview globally. No DOM. No map. No window.units.
    //         No window.RmoozScenario. No storage. No network. No staging state.
    //         No apply path. No UI mutation. w3json is never mutated.
    //         UI display of Wargame 3 is deferred to PR-217.
    // Exposed on window.AppShellScenarioWorkspace for console testing only.
    // Usage: AppShellScenarioWorkspace.previewWargame3Fixture(w3json [, stepRef])
    //        stepRef defaults to "W3-STEP-00" if omitted.

    function previewWargame3Fixture(w3json, stepRef) {
        var ref  = (stepRef !== undefined && stepRef !== null) ? stepRef : 'W3-STEP-00';
        var warns = [];

        // Rule 1: w3json is required
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            return { passed: false, fixture: null, preview: null,
                     blockedReasons: ['w3json is required and must be a non-null object (not array)'],
                     warnings: warns };
        }

        // Rule 2: adapt w3json → dry-run fixture
        var adaptResult = adaptWargame3ToFixture(w3json);
        if (!adaptResult.passed) {
            return { passed: false, fixture: null, preview: null,
                     blockedReasons: adaptResult.blockedReasons,
                     warnings: adaptResult.warnings || warns };
        }
        var fixture = adaptResult.fixture;
        // Carry adapter-level warnings (e.g. coord anomalies) into harness result
        if (adaptResult.warnings && adaptResult.warnings.length) {
            warns = warns.concat(adaptResult.warnings);
        }

        // PR-269: apply decision options fixture overlay (in-memory, no I/O, no mutation of
        // the frozen adapted fixture). If overlay passes, use the new fixture copy. If
        // overlay finds no applicable steps or is rejected, continue with original fixture.
        var overlayResult = applyWargame3DecisionOptionsFixtureOverlay(fixture);
        if (overlayResult.passed && overlayResult.fixture && overlayResult.appliedStepRefs.length > 0) {
            fixture = overlayResult.fixture;
            if (overlayResult.warnings && overlayResult.warnings.length) {
                warns = warns.concat(overlayResult.warnings);
            }
        }

        // Rule 4: build preview for requested step
        var bsspResult = buildScenarioStepPreview(fixture, ref);
        if (!bsspResult.passed) {
            return { passed: false, fixture: fixture, preview: null,
                     blockedReasons: bsspResult.blockedReasons,
                     warnings: warns.concat(bsspResult.warnings || []) };
        }
        if (bsspResult.warnings && bsspResult.warnings.length) {
            warns = warns.concat(bsspResult.warnings);
        }

        // Rules 6/7: return results — fixture and preview are NOT stored globally.
        // Caller receives them for inspection only; they are discarded when the
        // function returns unless the caller explicitly holds the reference.
        return {
            passed:         true,
            fixture:        fixture,
            preview:        bsspResult.preview,
            blockedReasons: [],
            warnings:       warns
        };
    }

    // ── PR-145: Parsed Decision Package Fixture Adapter ──────────────────────
    // Pure in-memory transform: DP_01/02/03 fixture shape → normaliser shape.
    // SAFETY: Does NOT mutate rawPackage. No I/O. No fetch. No storage. No mutation.
    // Returns a cloned {manifest, steps} safe to pass to loadDecisionPackagePreview().
    function adaptDecisionPackageFixture(rawPackage) {
        if (!rawPackage || typeof rawPackage !== 'object') {
            throw new Error('adaptDecisionPackageFixture: input must be an object {manifest, steps}');
        }
        var rm = rawPackage.manifest || {};  // raw manifest — never mutated
        var rs = Array.isArray(rawPackage.steps) ? rawPackage.steps : [];

        // ── Manifest remapping (Rules 1–7) ───────────────────────────────
        var sidesBlue = (rm.sides && rm.sides.BLUE) ? rm.sides.BLUE : {};
        var manifest = {
            // Rule 1: name
            name:                 rm.name || rm.scenario_title_en || rm.scenario_title_ar ||
                                  rm.scenario_id || '',
            // Rule 2: version
            version:              rm.version || rm.package_version || '',
            // Rule 3: date — slice ISO-8601 timestamp to YYYY-MM-DD
            date:                 rm.date ||
                                  (rm.created_at ? String(rm.created_at).slice(0, 10) : '') || '',
            // Rule 4: classification
            classification:       rm.classification || rm.outcome || 'TRAINING_ONLY',
            // Rule 5: team — extract from sides.BLUE if present
            team:                 rm.team || sidesBlue.label_en || sidesBlue.name_en ||
                                  sidesBlue.label_ar || 'BLUE',
            // Rule 6: _loadedAt — always stamp at adapt time
            _loadedAt:            Date.now(),
            // Rule 7: objective — preserved exactly for step injection
            objective:            rm.objective || null,
            // Passthrough: safety gates (normaliser will re-check these)
            read_only:            rm.read_only,
            no_auto_adjudication: rm.no_auto_adjudication,
            generated_by_ai:      rm.generated_by_ai,
            outcome:              rm.outcome,
            // Passthrough: display metadata
            source_notes:         rm.source_notes || '',
            scenario_id:          rm.scenario_id   || ''
        };

        // Confidence string-label table (Rule 5 in step adapter)
        var CONF_MAP = { HIGH: 0.80, MEDIUM: 0.55, LOW: 0.30, UNKNOWN: null };

        // Rule 1: sort steps by step_index ascending before adapting
        var sorted = rs.slice().sort(function (a, b) {
            return (a.step_index !== undefined ? Number(a.step_index) : 0) -
                   (b.step_index !== undefined ? Number(b.step_index) : 0);
        });

        // Helper: remap actor_uid → uid in actions / counter_actions (Rules 6/7)
        function adaptActions(arr) {
            if (!Array.isArray(arr)) return [];
            return arr.map(function (a) {
                if (!a || typeof a !== 'object') return a;
                return {
                    uid:            a.uid || a.actor_uid || a.unit_uid || '',
                    side:           a.side           || '',
                    action:         a.action         || '',
                    intended_effect: a.intended_effect || '',
                    from_step:      a.from_step !== undefined ? a.from_step : null,
                    to_step:        a.to_step   !== undefined ? a.to_step   : null
                };
            });
        }

        // ── Step remapping (Rules 2–11) ──────────────────────────────────
        var steps = sorted.map(function (raw) {

            // Rule 2: decision_points — singular → array
            var dps;
            if (Array.isArray(raw.decision_points) && raw.decision_points.length) {
                dps = raw.decision_points;
            } else if (raw.decision_point && typeof raw.decision_point === 'object') {
                dps = [raw.decision_point];
            } else {
                dps = [];
            }

            // Rule 3: affected_units — strings → objects
            var affectedUnits = Array.isArray(raw.affected_units)
                ? raw.affected_units.map(function (item) {
                    return (typeof item === 'string')
                        ? { uid: item, side: '', status_change: '' }
                        : (item || null);
                }).filter(Boolean)
                : [];

            // Rule 4: result — bridge effect_ar/en → summary_ar/en
            var rr = raw.result || {};
            var result = {
                summary_ar:  rr.summary_ar  || rr.effect_ar  || rr.summary || '',
                summary_en:  rr.summary_en  || rr.effect_en  || rr.summary || '',
                effect_ar:   rr.effect_ar   || '',
                effect_en:   rr.effect_en   || ''
            };

            // Rule 5: confidence string → float
            var conf = raw.confidence;
            if (typeof conf === 'string') {
                var mapped = CONF_MAP[conf.toUpperCase()];
                conf = (mapped !== undefined) ? mapped : parseFloat(conf);
            }

            // Rule 8: objective — step-level or inject from manifest
            var stepObj = raw.objective || null;
            if (!stepObj && manifest.objective) {
                var mo = manifest.objective;
                var moCoord = Array.isArray(mo.coord)     ? mo.coord     :
                              Array.isArray(mo.position)  ? mo.position  : null;
                stepObj = {
                    id:       mo.id      || mo.name || '',
                    name:     mo.name    || mo.name_en || mo.name_ar || '',
                    name_ar:  mo.name_ar || mo.name  || '',
                    name_en:  mo.name_en || mo.name  || '',
                    coord:    moCoord,
                    position: moCoord,
                    status:   raw.objective_status || ''
                };
            } else if (stepObj && !stepObj.status && raw.objective_status) {
                // Merge step-level status into cloned objective — never mutate raw
                stepObj = {
                    id:       stepObj.id      || '',
                    name:     stepObj.name    || '',
                    name_ar:  stepObj.name_ar || '',
                    name_en:  stepObj.name_en || '',
                    coord:    stepObj.coord   || stepObj.position || null,
                    position: stepObj.position || stepObj.coord   || null,
                    status:   raw.objective_status
                };
            }

            // Rules 9/10/11: units / source_trace / safety — preserve as-is (shallow copy)
            return {
                step_index:       raw.step_index !== undefined ? Number(raw.step_index) : 0,
                step_id:          raw.step_id    || '',
                time_label:       raw.time_label || '',
                phase:            raw.phase      || '',
                situation:        raw.situation  || {},
                objective:        stepObj,
                decision_points:  dps,
                options:          Array.isArray(raw.options) ? raw.options : [],
                selected_decision: raw.selected_decision !== undefined ? raw.selected_decision : null,
                confidence:       conf !== undefined ? conf : null,
                actions:          adaptActions(raw.actions),
                counter_actions:  adaptActions(raw.counter_actions),
                units:            Array.isArray(raw.units) ? raw.units : [],
                affected_units:   affectedUnits,
                objective_status: raw.objective_status || '',
                result:           result,
                source_trace:     raw.source_trace || {},
                safety:           raw.safety       || {},
                risks:            Array.isArray(raw.risks) ? raw.risks.slice() : (raw.risks || null),  // PR-159 fix 1
                notes:            raw.notes || null  // PR-159 fix 1
            };
        });

        return { manifest: manifest, steps: steps };
    }

    // PR-145: Wrapper — adapt raw fixture package then load into preview cards.
    // No file I/O. No storage. No mutation. No backend.
    // On adapter error: stores error string and calls paintDecisionPackageCards().
    function loadParsedDecisionPackageFixture(rawPackage) {
        _swDecisionPackage   = null;
        _swDecisionSteps     = [];
        _swDecisionLoadError = null;
        try {
            var adapted = adaptDecisionPackageFixture(rawPackage);
            loadDecisionPackagePreview(adapted.manifest, adapted.steps);
        } catch (e) {
            _swDecisionLoadError = 'Adapter: ' + String(e && e.message ? e.message : e);
            paintDecisionPackageCards();
        }
    }

    function loadDecisionPackagePreview(manifest, steps) {
        _swDecisionPackage   = null;
        _swDecisionSteps     = [];
        _swDecisionLoadError = null;
        try {
            var pkg = normaliseDecisionPackage(manifest, steps);
            _swDecisionPackage = pkg;
            _swDecisionSteps   = pkg.steps;
        } catch (e) {
            _swDecisionLoadError = String(e && e.message ? e.message : e);
        }
        paintDecisionPackageCards();
    }

    function paintDecisionManifestCard() {
        var card = document.getElementById('sw-dp-manifest-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        card.hidden = false;
        var m = _swDecisionPackage.manifest;
        var setVal = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = (val !== null && val !== undefined && String(val) !== '')
                ? String(val) : '—';
        };
        setVal('sw-dpkg-val-name',    m.name || m.wargame || '');
        setVal('sw-dpkg-val-version', m.version || '');
        setVal('sw-dpkg-val-class',   m.classification || '');
        setVal('sw-dpkg-val-team',    m.team || '');
        setVal('sw-dpkg-val-date',    m.date || '');
        setVal('sw-dpkg-val-steps',   _swDecisionSteps.length);
    }

    // PR-160: rewritten to use buildImportedStepSummary for compact 7-field display.
    // dp-section is hidden; decision point shown as single compact row instead.
    function paintDecisionStepCard() {
        var card = document.getElementById('sw-dp-step-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        card.hidden = false;

        var stepIdx  = getActiveStepIndex();
        var stepData = null;
        for (var i = 0; i < _swDecisionSteps.length; i++) {
            if (_swDecisionSteps[i].step_index === stepIdx) { stepData = _swDecisionSteps[i]; break; }
        }

        var emptyEl       = document.getElementById('sw-dpkg-step-empty');
        var resultSection = document.getElementById('sw-dpkg-result-section');
        var dpSection     = document.getElementById('sw-dpkg-dp-section');
        if (dpSection) dpSection.hidden = true;

        if (!stepData) {
            if (emptyEl) emptyEl.hidden = false;
            if (resultSection) resultSection.hidden = true;
            ['sw-dpkg-step-active-row','sw-dpkg-step-obj-row','sw-dpkg-step-decision-row',
             'sw-dpkg-step-selected-row','sw-dpkg-step-status-row','sw-dpkg-step-conf-row',
             'sw-dpkg-step-units-count-row']
                .forEach(function (id) { var el = document.getElementById(id); if (el) el.hidden = true; });
            return;
        }

        if (emptyEl) emptyEl.hidden = true;
        var sum   = buildImportedStepSummary(stepData);
        var isRTL = (document.documentElement.dir === 'rtl');

        var setVal = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = (val !== null && val !== undefined && String(val) !== '')
                ? String(val) : '—';
        };

        // Active step
        setVal('sw-dpkg-step-active', sum.activeLabel);
        var activeRow = document.getElementById('sw-dpkg-step-active-row');
        if (activeRow) activeRow.hidden = false;

        // Objective name
        var objRow = document.getElementById('sw-dpkg-step-obj-row');
        var objEl  = document.getElementById('sw-dpkg-val-objective');
        if (stepData.objective) {
            var objName = isRTL ? stepData.objective.name_ar : stepData.objective.name_en;
            if (!objName) objName = stepData.objective.name;
            if (objEl) objEl.textContent = objName || '—';
            if (objRow) objRow.hidden = false;
        } else {
            if (objRow) objRow.hidden = true;
        }

        // Decision point compact row
        setVal('sw-dpkg-step-decision', sum.decisionPoint);
        var decRow = document.getElementById('sw-dpkg-step-decision-row');
        if (decRow) decRow.hidden = false;

        // Selected decision
        setVal('sw-dpkg-step-selected', sum.selectedDecision);
        var selRow = document.getElementById('sw-dpkg-step-selected-row');
        if (selRow) selRow.hidden = false;

        // Objective status badge
        var statusRow   = document.getElementById('sw-dpkg-step-status-row');
        var statusBadge = document.getElementById('sw-dpkg-status-badge');
        if (sum.objectiveStatus && sum.objectiveStatus !== '—') {
            var cls = getObjectiveStatusClass(sum.objectiveStatus);
            if (statusBadge) {
                statusBadge.textContent = sum.objectiveStatus;
                statusBadge.className   = 'sw-dpkg-status' + (cls ? ' ' + cls : '');
            }
            if (statusRow) statusRow.hidden = false;
        } else {
            if (statusRow) statusRow.hidden = true;
        }

        // Confidence
        var confRow = document.getElementById('sw-dpkg-step-conf-row');
        var confEl  = document.getElementById('sw-dpkg-val-confidence');
        if (sum.confidenceLabel !== '—') {
            if (confEl) confEl.textContent = sum.confidenceLabel;
            if (confRow) confRow.hidden = false;
        } else {
            if (confRow) confRow.hidden = true;
        }

        // Units count
        setVal('sw-dpkg-step-units-count', String(sum.unitsCount));
        var unitsRow = document.getElementById('sw-dpkg-step-units-count-row');
        if (unitsRow) unitsRow.hidden = false;

        // Result summary
        var resultText = document.getElementById('sw-dpkg-result-text');
        if (sum.resultSummary && sum.resultSummary !== '—') {
            if (resultText) resultText.textContent = sum.resultSummary;
            if (resultSection) resultSection.hidden = false;
        } else {
            if (resultSection) resultSection.hidden = true;
        }
    }

    // PR-161: count units by side and status for the summary strip.
    // Read-only — does not mutate units array or window state.
    function buildImportedUnitsSummary(units) {
        var friendly = 0, enemy = 0, other = 0;
        var statusCounts = {};
        units.forEach(function (u) {
            var side = String(u.side || '').toUpperCase().trim();
            if (side === 'BLUE' || side === 'FRIENDLY' || side === 'صديق' || side === 'صديقة') {
                friendly++;
            } else if (side === 'RED' || side === 'ENEMY' || side === 'عدو') {
                enemy++;
            } else {
                other++;
            }
            if (u.status) {
                var s = String(u.status).toUpperCase();
                statusCounts[s] = (statusCounts[s] || 0) + 1;
            }
        });
        var statusParts = [];
        Object.keys(statusCounts).sort().forEach(function (s) {
            statusParts.push(s + '\xb7' + statusCounts[s]);
        });
        return {
            total:         units.length,
            friendly:      friendly,
            enemy:         enemy,
            other:         other,
            statusSummary: statusParts.length ? statusParts.join('  ') : '—'
        };
    }

    // PR-142A + PR-161: Reads step.units[] roster with compact summary strip.
    // No affected_units. No mutation. Columns: UID · Side · Name · Role · Status · Position.
    function paintDecisionUnitsCard() {
        var card = document.getElementById('sw-dp-units-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        card.hidden = false;
        var stepIdx  = getActiveStepIndex();
        var stepData = null;
        for (var i = 0; i < _swDecisionSteps.length; i++) {
            if (_swDecisionSteps[i].step_index === stepIdx) { stepData = _swDecisionSteps[i]; break; }
        }
        var tbody    = document.getElementById('sw-dpkg-units-body');
        var emptyEl  = document.getElementById('sw-dpkg-units-empty');
        var tbl      = document.getElementById('sw-dpkg-units-table');
        var summaryEl = document.getElementById('sw-dpkg-units-summary');
        var statusEl  = document.getElementById('sw-dpkg-units-status-summary');
        if (!tbody) return;
        tbody.replaceChildren();
        var units = (stepData && Array.isArray(stepData.units)) ? stepData.units : [];
        if (!units.length) {
            if (tbl)      tbl.hidden      = true;
            if (emptyEl)  emptyEl.hidden  = false;
            if (summaryEl) summaryEl.hidden = true;
            if (statusEl)  statusEl.hidden  = true;
            ['sw-dpkg-units-total','sw-dpkg-units-friendly','sw-dpkg-units-enemy','sw-dpkg-units-other']
                .forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = '0'; });
            return;
        }
        if (tbl)     tbl.hidden     = false;
        if (emptyEl) emptyEl.hidden = true;

        // Summary strip
        var sum = buildImportedUnitsSummary(units);
        var setCount = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = String(val);
        };
        setCount('sw-dpkg-units-total',    sum.total);
        setCount('sw-dpkg-units-friendly', sum.friendly);
        setCount('sw-dpkg-units-enemy',    sum.enemy);
        setCount('sw-dpkg-units-other',    sum.other);
        if (summaryEl) summaryEl.hidden = false;
        if (statusEl) {
            statusEl.textContent = sum.statusSummary;
            statusEl.hidden = (sum.statusSummary === '—');
        }

        // Unit rows
        var isRTL = (document.documentElement.dir === 'rtl');
        units.forEach(function (u) {
            var tr = document.createElement('tr');
            var tdUid = document.createElement('td');
            tdUid.className   = 'sw-dpkg-col-uid';
            tdUid.textContent = u.uid || '—';
            tr.appendChild(tdUid);
            var tdSide = document.createElement('td');
            tdSide.className   = 'sw-dpkg-col-side';
            tdSide.textContent = u.side || '—';
            tr.appendChild(tdSide);
            var tdName = document.createElement('td');
            tdName.className   = 'sw-dpkg-col-name';
            var nm = isRTL ? (u.name_ar || u.name_en || u.name)
                           : (u.name_en || u.name_ar || u.name);
            tdName.textContent = nm || '—';
            tr.appendChild(tdName);
            var tdRole = document.createElement('td');
            tdRole.className   = 'sw-dpkg-col-role';
            tdRole.textContent = u.role || '—';
            tr.appendChild(tdRole);
            var tdStatus = document.createElement('td');
            tdStatus.className   = 'sw-dpkg-col-status';
            tdStatus.textContent = u.status || '—';
            tr.appendChild(tdStatus);
            var tdPos = document.createElement('td');
            tdPos.className   = 'sw-dpkg-col-position';
            tdPos.textContent = u.position
                ? u.position[0].toFixed(4) + ', ' + u.position[1].toFixed(4)
                : '—';
            tr.appendChild(tdPos);
            tbody.appendChild(tr);
        });
    }

    // PR-163: compact source summary for the main Source card.
    // Reads _swDecisionPackage, _swDecisionSteps, _swDecisionImportValidation only.
    // No mutation. No I/O. No fetch. No storage.
    function buildImportedSourceSummary() {
        var v     = _swDecisionImportValidation;
        var steps = _swDecisionSteps;

        // packageSource: JSON import if validation exists; sample otherwise
        var packageSource = _swDecisionPackage
            ? (v ? tx('sw-dpkg-source-local-import', 'Local JSON import')
                 : tx('sw-dpkg-source-sample',       'Sample package'))
            : tx('sw-dpkg-source-not-available', 'Not available');

        // validationText: reuse status strings from paintImportValidationCard
        var validationText = !v
            ? tx('sw-dpkg-val-not-run', 'Not run')
            : v.status === 'imported' ? tx('sw-dpkg-val-imported', 'Imported')
            : v.status === 'rejected' ? tx('sw-dpkg-val-rejected', 'Rejected')
            : tx('sw-dpkg-val-not-run', 'Not run');

        // warningCount: duplicate + gap indices from validation
        var warnCount = 0;
        if (v) {
            warnCount += (v.duplicateStepIndices && v.duplicateStepIndices.length)
                ? v.duplicateStepIndices.length : 0;
            warnCount += (v.missingStepIndices && v.missingStepIndices.length)
                ? v.missingStepIndices.length : 0;
        }

        // activeStepSource + sourceTraceState
        var activeStepSource = tx('sw-dpkg-source-not-available', 'Not available');
        var tracePresent     = false;
        if (_swDecisionPackage && Array.isArray(steps)) {
            var stepIdx  = getActiveStepIndex();
            for (var i = 0; i < steps.length; i++) {
                if (steps[i].step_index === stepIdx) {
                    var st = steps[i].source_trace;
                    if (st && st.source_file) {
                        activeStepSource = st.source_file;
                        tracePresent     = true;
                    }
                    break;
                }
            }
        }

        return {
            packageSource:    packageSource,
            validationText:   validationText,
            warningCount:     warnCount,
            activeStepSource: activeStepSource,
            sourceTraceState: tracePresent
                ? tx('sw-dpkg-source-trace-present', 'Present')
                : tx('sw-dpkg-source-trace-missing', 'Missing'),
            tracePresent:     tracePresent
        };
    }

    // PR-163: compact source status — package origin, validation, warnings, active step trace.
    function paintDecisionSourceCard() {
        var card = document.getElementById('sw-dp-source-card');
        if (!card) return;
        if (!_swDecisionPackage && !_swDecisionLoadError) { card.hidden = true; return; }
        card.hidden = false;

        var errEl = document.getElementById('sw-dpkg-load-error');
        var dl    = card.querySelector('dl');
        if (_swDecisionLoadError) {
            if (errEl) { errEl.textContent = _swDecisionLoadError; errEl.hidden = false; }
            if (dl)    dl.hidden = true;
            return;
        }
        if (errEl) errEl.hidden = true;
        if (dl)    dl.hidden    = false;

        var sum    = buildImportedSourceSummary();
        var setVal = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = (val !== null && val !== undefined && String(val) !== '')
                ? String(val) : '—';
        };

        setVal('sw-dpkg-source-package',       sum.packageSource);
        setVal('sw-dpkg-source-validation',    sum.validationText);
        setVal('sw-dpkg-source-warning-count', String(sum.warningCount));
        setVal('sw-dpkg-source-active-step',   sum.activeStepSource);

        var traceEl = document.getElementById('sw-dpkg-source-trace-state');
        if (traceEl) {
            traceEl.textContent = sum.sourceTraceState;
            traceEl.className   = sum.tracePresent
                ? 'sw-dpkg-source-present'
                : 'sw-dpkg-source-missing';
        }
    }

    function paintDecisionPackageCards() {
        try { paintDecisionManifestCard();    } catch (_) {}
        try { paintDecisionStepCard();        } catch (_) {}
        try { paintDecisionUnitsCard();       } catch (_) {}
        try { paintDecisionSourceCard();      } catch (_) {}
        try { paintDecisionLoaderRow();       } catch (_) {}  // PR-143
        try { paintImportValidationCard();    } catch (_) {}  // PR-151
        try { paintSourceTraceReviewCard();      } catch (_) {}  // PR-152
        try { paintStepIndexWarningBanner();        } catch (_) {}  // PR-153
        try { paintPackageReadinessChecklist();     } catch (_) {}  // PR-154
        try { paintImportedStepListPanel();         } catch (_) {}  // PR-155
        try { paintImportedStepDetailPanel();       } catch (_) {}  // PR-156
        try { paintImportDiagnosticsPanel();        } catch (_) {}  // PR-157
        try { paintStagingReadinessCard();          } catch (_) {}  // PR-169
    }

    // PR-143: Show/hide clear button based on whether a package is loaded.
    // No mutation. No fetch. No storage.
    function paintDecisionLoaderRow() {
        var clearBtn = document.getElementById('sw-dpkg-clear-sample');
        if (!clearBtn) return;
        clearBtn.hidden = !_swDecisionPackage;
        // PR-146B: reset fixture selector when no package is loaded
        if (!_swDecisionPackage) {
            var sel = document.getElementById('sw-dpkg-fixture-select');
            if (sel) sel.value = '';
        }
    }

    // ── PR-151: Import Validation Summary ────────────────────────────────────
    // Pure computation on already-parsed data. No I/O. No fetch. No storage.
    // Called by importDecisionPackageJson and early-rejection paths only.

    function buildImportValidationSummary(manifest, steps, options) {
        var opts     = options  || {};
        var stepsArr = Array.isArray(steps) ? steps : [];

        // Collect numeric step_index values
        var indices = stepsArr.map(function (s) {
            return (s && typeof s.step_index === 'number') ? s.step_index : null;
        }).filter(function (v) { return v !== null; });

        // Duplicate detection
        var seen  = {};
        var dupes = [];
        indices.forEach(function (idx) {
            if (seen[idx] !== undefined) {
                if (dupes.indexOf(String(idx)) === -1) dupes.push(String(idx));
            } else {
                seen[idx] = true;
            }
        });

        // Gap detection (min..max range)
        var gaps = [];
        if (indices.length > 1) {
            var sorted = indices.slice().sort(function (a, b) { return a - b; });
            for (var g = sorted[0] + 1; g < sorted[sorted.length - 1]; g++) {
                if (indices.indexOf(g) === -1) gaps.push(String(g));
            }
        }

        return {
            status:               opts.status || 'not_run',
            manifestValid:        !!(manifest && typeof manifest === 'object'),
            stepsLoaded:          stepsArr.length,
            duplicateStepIndices: dupes,
            missingStepIndices:   gaps,
            safetyGatePassed:     opts.safetyGatePassed !== undefined
                                  ? opts.safetyGatePassed : null,
            localReadOnly:        true,   // always true for PR-148 importer path
            scenarioChanged:      false,  // always false — importer never mutates scenario
            message:              opts.message || ''
        };
    }

    function paintImportValidationCard() {
        var card = document.getElementById('sw-dpkg-validation-card');
        if (!card) return;
        if (!_swDecisionImportValidation) { card.hidden = true; return; }
        card.hidden = false;

        var v = _swDecisionImportValidation;
        var setVal = function (id, val, cls) {
            var el = document.getElementById(id);
            if (!el) return;
            el.textContent = (val !== null && val !== undefined) ? String(val) : '—';
            el.className   = cls || '';
        };

        var passT  = tx('sw-dpkg-val-pass',    'Pass');
        var failT  = tx('sw-dpkg-val-fail',    'Fail');
        var noneT  = tx('sw-dpkg-val-none',    'None');
        var notRT  = tx('sw-dpkg-val-not-run', 'Not run');
        var yesT   = tx('sw-dpkg-val-yes',     'Yes');
        var noT    = tx('sw-dpkg-val-no',       'No');

        // Import status
        var stText = v.status === 'imported' ? tx('sw-dpkg-val-imported', 'Imported') :
                     v.status === 'rejected' ? tx('sw-dpkg-val-rejected', 'Rejected') : notRT;
        var stCls  = v.status === 'imported' ? 'sw-dpkg-validation-pass' :
                     v.status === 'rejected' ? 'sw-dpkg-validation-fail' :
                     'sw-dpkg-validation-neutral';
        setVal('sw-v151-status', stText, stCls);

        // Manifest
        setVal('sw-v151-manifest',
               v.manifestValid ? passT : failT,
               v.manifestValid ? 'sw-dpkg-validation-pass' : 'sw-dpkg-validation-fail');

        // Steps loaded
        setVal('sw-v151-steps', String(v.stepsLoaded), '');

        // Duplicates
        var dupText = v.duplicateStepIndices.length
            ? v.duplicateStepIndices.join(', ') : noneT;
        setVal('sw-v151-dupes', dupText,
               v.duplicateStepIndices.length ? 'sw-dpkg-validation-fail' : 'sw-dpkg-validation-pass');

        // Gaps
        var gapText = v.missingStepIndices.length
            ? v.missingStepIndices.join(', ') : noneT;
        setVal('sw-v151-gaps', gapText,
               v.missingStepIndices.length ? 'sw-dpkg-validation-fail' : 'sw-dpkg-validation-pass');

        // Safety gate
        var sfText = v.safetyGatePassed === true  ? passT :
                     v.safetyGatePassed === false ? failT : notRT;
        var sfCls  = v.safetyGatePassed === true  ? 'sw-dpkg-validation-pass' :
                     v.safetyGatePassed === false ? 'sw-dpkg-validation-fail' :
                     'sw-dpkg-validation-neutral';
        setVal('sw-v151-safety', sfText, sfCls);

        // Local read only (always Yes)
        setVal('sw-v151-local', v.localReadOnly ? yesT : noT,
               v.localReadOnly ? 'sw-dpkg-validation-pass' : 'sw-dpkg-validation-fail');

        // Scenario changed (always No)
        setVal('sw-v151-scenario', v.scenarioChanged ? yesT : noT,
               v.scenarioChanged ? 'sw-dpkg-validation-fail' : 'sw-dpkg-validation-pass');
    }

    // ── PR-152: Source Trace Review ──────────────────────────────────────────
    // Reads source_trace from the active step (preserved by normaliser passthrough)
    // and source_notes from the manifest. Text only. No I/O. No links. No fetch.
    function getActiveDecisionSourceTrace() {
        if (!_swDecisionPackage) return null;
        var stepIdx   = getActiveStepIndex();
        var stepTrace = null;
        for (var i = 0; i < _swDecisionSteps.length; i++) {
            if (_swDecisionSteps[i].step_index === stepIdx) {
                stepTrace = _swDecisionSteps[i].source_trace || null;
                break;
            }
        }
        return {
            step:         stepTrace,
            packageNotes: _swDecisionPackage.manifest.source_notes || ''
        };
    }

    // PR-152 + PR-162: shows source trace fields; empty state when no active step or no trace.
    function paintSourceTraceReviewCard() {
        var card = document.getElementById('sw-dpkg-source-review-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        card.hidden = false;

        var trace    = getActiveDecisionSourceTrace();
        var st       = (trace && trace.step) ? trace.step : null;
        var dl       = card.querySelector('dl');
        var emptyEl  = document.getElementById('sw-dpkg-source-empty');
        var hasTrace = st && (st.source_file || st.source_geojson || st.source_image
                              || st.source_report || st.reference || st.note);

        if (!hasTrace) {
            if (dl)      dl.hidden      = true;
            if (emptyEl) emptyEl.hidden = false;
            ['sw-src-review-step-file','sw-src-review-geojson','sw-src-review-image',
             'sw-src-review-report','sw-src-review-note','sw-src-review-package-notes']
                .forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = ''; });
            return;
        }

        if (dl)      dl.hidden      = false;
        if (emptyEl) emptyEl.hidden = true;
        var empty = tx('sw-src-review-empty', '—');
        var setVal = function (id, val) {
            var el = document.getElementById(id);
            if (!el) return;
            el.textContent = (val !== null && val !== undefined && String(val) !== '')
                ? String(val) : empty;
        };
        setVal('sw-src-review-step-file',     st.source_file    || '');
        setVal('sw-src-review-geojson',       st.source_geojson || '');
        setVal('sw-src-review-image',         st.source_image   || '');
        setVal('sw-src-review-report',        st.source_report  || st.reference || '');
        setVal('sw-src-review-note',          st.note           || '');
        setVal('sw-src-review-package-notes', (trace && trace.packageNotes) ? trace.packageNotes : '');
    }

    // ── PR-153: Step Index Warning Banner ────────────────────────────────────
    // Shows an amber banner when the validated import has duplicate or missing
    // step_index values. Does not block preview. No mutation. No I/O. No fetch.
    function paintStepIndexWarningBanner() {
        var banner = document.getElementById('sw-dpkg-step-warning');
        if (!banner) return;
        var v = _swDecisionImportValidation;
        if (!v) { banner.hidden = true; return; }
        var dupes = v.duplicateStepIndices || [];
        var gaps  = v.missingStepIndices   || [];
        if (!dupes.length && !gaps.length) { banner.hidden = true; return; }
        banner.hidden = false;
        var titleEl = document.getElementById('sw-step-warning-title');
        var msgEl   = document.getElementById('sw-step-warning-message');
        if (titleEl) titleEl.textContent = tx('sw-step-warning-title', 'Step index warning');
        if (msgEl) {
            var msg;
            if (dupes.length && gaps.length) {
                msg = tx('sw-step-warning-duplicate-gap',
                         'Duplicate step_index values detected: {duplicates}. Missing step_index values detected: {gaps}. Preview is still read-only.')
                    .replace('{duplicates}', dupes.join(', '))
                    .replace('{gaps}',       gaps.join(', '));
            } else if (dupes.length) {
                msg = tx('sw-step-warning-duplicate-only',
                         'Duplicate step_index values detected: {values}. Preview is still read-only.')
                    .replace('{values}', dupes.join(', '));
            } else {
                msg = tx('sw-step-warning-gap-only',
                         'Missing step_index values detected: {values}. Preview is still read-only.')
                    .replace('{values}', gaps.join(', '));
            }
            msgEl.textContent = msg;
        }
    }

    // ── PR-154: Package Readiness Checklist ──────────────────────────────────
    // Pure computation on module-private state. No I/O. No fetch. No storage.
    // No window.units/lines/RmoozScenario mutation. Read-only. Non-blocking.
    function buildPackageReadinessChecklist() {
        var pkg = _swDecisionPackage;
        var steps = _swDecisionSteps;
        var v = _swDecisionImportValidation;

        // Manifest loaded
        var manifestLoaded = pkg && pkg.manifest ? 'ok' : 'fail';

        // Steps loaded
        var stepsLoaded = (Array.isArray(steps) && steps.length > 0) ? 'ok' : 'fail';

        // Safety gate
        var safetyGatePassed = 'not_run';
        if (v) {
            safetyGatePassed = v.safetyGatePassed === true  ? 'ok'   :
                               v.safetyGatePassed === false ? 'fail' : 'not_run';
        }

        // No duplicate step_index
        var noDuplicateStepIndex = 'not_run';
        if (v) {
            noDuplicateStepIndex = (v.duplicateStepIndices && v.duplicateStepIndices.length)
                ? 'warn' : 'ok';
        }

        // No missing step_index gaps
        var noMissingStepIndexGaps = 'not_run';
        if (v) {
            noMissingStepIndexGaps = (v.missingStepIndices && v.missingStepIndices.length)
                ? 'warn' : 'ok';
        }

        // Source trace present (at least one step has source_trace with a source_file)
        var sourceTracePresent = 'warn';
        if (Array.isArray(steps)) {
            for (var si = 0; si < steps.length; si++) {
                if (steps[si] && steps[si].source_trace &&
                    steps[si].source_trace.source_file) {
                    sourceTracePresent = 'ok'; break;
                }
            }
        }

        // Units present (at least one step has units.length > 0)
        var unitsPresent = 'warn';
        if (Array.isArray(steps)) {
            for (var ui = 0; ui < steps.length; ui++) {
                if (steps[ui] && Array.isArray(steps[ui].units) && steps[ui].units.length > 0) {
                    unitsPresent = 'ok'; break;
                }
            }
        }

        // Preview only confirmed (manifest flags)
        var previewOnlyConfirmed = 'fail';
        if (pkg && pkg.manifest &&
            pkg.manifest.read_only === true &&
            pkg.manifest.no_auto_adjudication === true) {
            previewOnlyConfirmed = 'ok';
        }

        // Scenario unchanged
        var scenarioUnchanged = 'not_run';
        if (v) {
            scenarioUnchanged = v.scenarioChanged === false ? 'ok' : 'fail';
        }

        return {
            manifestLoaded:         manifestLoaded,
            stepsLoaded:            stepsLoaded,
            safetyGatePassed:       safetyGatePassed,
            noDuplicateStepIndex:   noDuplicateStepIndex,
            noMissingStepIndexGaps: noMissingStepIndexGaps,
            sourceTracePresent:     sourceTracePresent,
            unitsPresent:           unitsPresent,
            previewOnlyConfirmed:   previewOnlyConfirmed,
            scenarioUnchanged:      scenarioUnchanged
        };
    }

    function paintPackageReadinessChecklist() {
        var card = document.getElementById('sw-dpkg-readiness-card');
        if (!card) return;
        if (!_swDecisionPackage && !_swDecisionImportValidation) { card.hidden = true; return; }
        card.hidden = false;

        var cl = buildPackageReadinessChecklist();

        var okT      = tx('sw-ready-ok',      'OK');
        var warnT    = tx('sw-ready-warn',     'Check');
        var failT    = tx('sw-ready-fail',     'Fail');
        var notRunT  = tx('sw-ready-not-run',  'Not run');

        function setRow(id, status) {
            var el = document.getElementById(id);
            if (!el) return;
            var text  = status === 'ok'      ? okT     :
                        status === 'warn'    ? warnT   :
                        status === 'fail'    ? failT   : notRunT;
            var cls   = status === 'ok'      ? 'sw-dpkg-readiness-ok'      :
                        status === 'warn'    ? 'sw-dpkg-readiness-warn'    :
                        status === 'fail'    ? 'sw-dpkg-readiness-fail'    :
                                              'sw-dpkg-readiness-neutral';
            el.textContent = text;
            el.className   = 'sw-dpkg-readiness-value ' + cls;
        }

        setRow('sw-ready-manifest',   cl.manifestLoaded);
        setRow('sw-ready-steps',      cl.stepsLoaded);
        setRow('sw-ready-safety',     cl.safetyGatePassed);
        setRow('sw-ready-duplicates', cl.noDuplicateStepIndex);
        setRow('sw-ready-gaps',       cl.noMissingStepIndexGaps);
        setRow('sw-ready-source',     cl.sourceTracePresent);
        setRow('sw-ready-units',      cl.unitsPresent);
        setRow('sw-ready-preview',    cl.previewOnlyConfirmed);
        setRow('sw-ready-scenario',   cl.scenarioUnchanged);
    }

    // ── PR-155: Imported Package Step List ───────────────────────────────────
    // Pure read of _swDecisionSteps. No I/O. No mutation. No links. No onclick.
    function buildImportedStepListRows() {
        if (!Array.isArray(_swDecisionSteps)) return [];
        return _swDecisionSteps.map(function (step) {
            var conf = step.confidence;
            var confStr = (conf !== null && conf !== undefined && typeof conf === 'number')
                ? Math.round(conf * 100) + '%' : '—';
            var status = (step.objective && step.objective.status)
                ? step.objective.status
                : (step.objective_status || '—');
            return {
                index:         step.step_index !== undefined ? step.step_index : '—',
                time:          step.time_label  || '—',
                phase:         step.phase       || '—',
                status:        status,
                confidence:    confStr,
                unitsCount:    Array.isArray(step.units) ? step.units.length : 0,
                hasSourceTrace: !!(step.source_trace && step.source_trace.source_file)
            };
        });
    }

    function paintImportedStepListPanel() {
        var card = document.getElementById('sw-dpkg-step-list-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        var rows = buildImportedStepListRows();
        card.hidden = false;
        var tbody = document.getElementById('sw-dpkg-step-list-body');
        if (!tbody) return;
        tbody.replaceChildren();
        if (!rows.length) {
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.setAttribute('colspan', '7');
            emptyCell.textContent = tx('sw-step-list-empty', 'No imported steps.');
            emptyCell.className = 'sw-dpkg-step-list-empty';
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
            return;
        }
        var yesT = tx('sw-step-list-source-yes', 'Yes');
        var noT  = tx('sw-step-list-source-no',  'No');
        rows.forEach(function (row) {
            var tr = document.createElement('tr');
            var cells = [
                String(row.index),
                row.time,
                row.phase,
                row.status,
                row.confidence,
                String(row.unitsCount),
                row.hasSourceTrace ? yesT : noT
            ];
            cells.forEach(function (val, ci) {
                var td = document.createElement('td');
                td.textContent = val;
                if (ci === 6) {
                    td.className = row.hasSourceTrace
                        ? 'sw-dpkg-step-list-source-yes'
                        : 'sw-dpkg-step-list-source-no';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    // ── PR-156: Imported Step Details Drilldown ──────────────────────────────
    // Read-only. No I/O. No mutation. No onclick. No links.

    function getActiveImportedDecisionStep() {
        if (!Array.isArray(_swDecisionSteps) || !_swDecisionSteps.length) return null;
        var idx = getActiveStepIndex();
        for (var i = 0; i < _swDecisionSteps.length; i++) {
            if (_swDecisionSteps[i].step_index === idx) return _swDecisionSteps[i];
        }
        return null;
    }

    function buildImportedStepDetail(step) {
        var isRTL  = (document.documentElement.dir === 'rtl');
        var noneT  = tx('sw-step-detail-none', 'None');

        // Active label
        var activeLabel = '#' + step.step_index
            + ' \xb7 ' + (step.time_label || '—')
            + ' \xb7 ' + (step.phase      || '—');

        // Decision point — first entry, language-aware
        var dpText = noneT;
        if (Array.isArray(step.decision_points) && step.decision_points.length) {
            var dp = step.decision_points[0];
            dpText = (isRTL ? dp.question_ar : dp.question_en)
                  || dp.question_ar || dp.question_en
                  || dp.question   || dp.text || noneT;
        }

        // Selected decision — PR-159 fix 2: resolve plain string ID against step.options[]
        var selText = noneT;
        var sd = step.selected_decision;
        if (sd !== null && sd !== undefined) {
            if (typeof sd === 'object') {
                selText = (isRTL ? sd.label_ar : sd.label_en)
                       || sd.label_ar || sd.label_en
                       || sd.text_ar  || sd.text_en
                       || sd.id || String(sd);
            } else {
                var sdStr  = String(sd);
                var optLabel = null;
                if (Array.isArray(step.options)) {
                    for (var oi = 0; oi < step.options.length; oi++) {
                        var opt = step.options[oi];
                        if (opt && String(opt.id) === sdStr) {
                            optLabel = isRTL
                                ? (opt.label_ar || opt.text_ar || opt.name_ar ||
                                   opt.label_en || opt.text_en || opt.name_en)
                                : (opt.label_en || opt.text_en || opt.name_en ||
                                   opt.label_ar || opt.text_ar || opt.name_ar);
                            break;
                        }
                    }
                }
                selText = optLabel || sdStr;
            }
        }

        // Counts
        var actionsCount    = Array.isArray(step.actions)        ? step.actions.length        : 0;
        var counterCount    = Array.isArray(step.counter_actions) ? step.counter_actions.length : 0;
        var affectedCount   = Array.isArray(step.affected_units)  ? step.affected_units.length  : 0;

        // Risks / notes
        var risksNotes = noneT;
        if (step.risks) {
            var r = step.risks;
            risksNotes = Array.isArray(r) ? r.join(', ') : String(r);
        } else if (step.notes) {
            risksNotes = String(step.notes);
        } else if (step.result) {
            var rs = (isRTL ? step.result.summary_ar : step.result.summary_en)
                  || step.result.summary_ar || step.result.summary_en || '';
            if (rs) risksNotes = rs;
        }

        // Source note
        var sourceNote = (step.source_trace && step.source_trace.note)
            ? String(step.source_trace.note) : noneT;

        return {
            activeLabel:       activeLabel,
            decisionPoint:     dpText,
            selectedDecision:  selText,
            actionsCount:      String(actionsCount),
            counterActionsCount: String(counterCount),
            affectedUnitsCount:  String(affectedCount),
            risksNotes:        risksNotes,
            sourceNote:        sourceNote
        };
    }

    // PR-160: compact 7-field summary for the main step preview card.
    // Delegates active/decision/selected extraction to buildImportedStepDetail.
    function buildImportedStepSummary(step) {
        var isRTL = (document.documentElement.dir === 'rtl');
        var d = buildImportedStepDetail(step);

        var objStatus = '—';
        if (step.objective && step.objective.status) {
            objStatus = step.objective.status;
        } else if (step.objective_status) {
            objStatus = step.objective_status;
        }

        var resultSummary = '—';
        if (step.result) {
            var rs = isRTL
                ? (step.result.summary_ar || step.result.effect_ar
                   || step.result.summary_en || step.result.effect_en)
                : (step.result.summary_en || step.result.effect_en
                   || step.result.summary_ar || step.result.effect_ar);
            if (rs) resultSummary = rs;
        }

        var confidenceLabel = '—';
        if (step.confidence !== null && step.confidence !== undefined) {
            var c = Number(step.confidence);
            if (!isNaN(c)) confidenceLabel = Math.round(c * 100) + '%';
        }

        return {
            activeLabel:      d.activeLabel,
            decisionPoint:    d.decisionPoint,
            selectedDecision: d.selectedDecision,
            objectiveStatus:  objStatus,
            resultSummary:    resultSummary,
            confidenceLabel:  confidenceLabel,
            unitsCount:       Array.isArray(step.units) ? step.units.length : 0
        };
    }

    function paintImportedStepDetailPanel() {
        var card = document.getElementById('sw-dpkg-step-detail-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        card.hidden = false;

        var step = getActiveImportedDecisionStep();
        var setVal = function (id, val) {
            var el = document.getElementById(id);
            if (el) el.textContent = (val !== null && val !== undefined && String(val) !== '')
                ? String(val) : '—';
        };

        if (!step) {
            var emptyMsg = tx('sw-step-detail-empty', 'No imported step is active.');
            setVal('sw-step-detail-active',      emptyMsg);
            setVal('sw-step-detail-decision',    '');
            setVal('sw-step-detail-selected',    '');
            setVal('sw-step-detail-actions',     '');
            setVal('sw-step-detail-counter',     '');
            setVal('sw-step-detail-affected',    '');
            setVal('sw-step-detail-risks',       '');
            setVal('sw-step-detail-source-note', '');
            return;
        }

        var d = buildImportedStepDetail(step);
        setVal('sw-step-detail-active',      d.activeLabel);
        setVal('sw-step-detail-decision',    d.decisionPoint);
        setVal('sw-step-detail-selected',    d.selectedDecision);
        setVal('sw-step-detail-actions',     d.actionsCount);
        setVal('sw-step-detail-counter',     d.counterActionsCount);
        setVal('sw-step-detail-affected',    d.affectedUnitsCount);
        setVal('sw-step-detail-risks',       d.risksNotes);
        setVal('sw-step-detail-source-note', d.sourceNote);
    }

    // ── PR-157: Import Diagnostics Collapsible Panel ─────────────────────────────
    // Controls visibility of #sw-dpkg-diagnostics and its body.
    // No mutation. No I/O. No fetch. No storage.
    function paintImportDiagnosticsPanel() {
        var wrapper = document.getElementById('sw-dpkg-diagnostics');
        var body    = document.getElementById('sw-dpkg-diagnostics-body');
        var toggle  = document.getElementById('sw-dpkg-diagnostics-toggle');
        var stateEl = document.getElementById('sw-dpkg-diagnostics-state');
        if (!wrapper) return;
        var hasData = !!(_swDecisionPackage || _swDecisionImportValidation);
        wrapper.hidden = !hasData;
        if (!hasData) return;
        if (body)    body.hidden = !_swDiagnosticsOpen;
        if (stateEl) stateEl.textContent = _swDiagnosticsOpen ? '−' : '+';
        if (toggle)  toggle.setAttribute('aria-expanded', _swDiagnosticsOpen ? 'true' : 'false');
    }

    function initImportDiagnosticsToggle() {
        var toggle = document.getElementById('sw-dpkg-diagnostics-toggle');
        if (!toggle) return;
        toggle.addEventListener('click', function () {
            _swDiagnosticsOpen = !_swDiagnosticsOpen;
            paintImportDiagnosticsPanel();
        });
    }

    // ── PR-169: Staging Readiness Card ───────────────────────────────────────
    // Calls validateStagingCandidate (PR-168) on the active imported step.
    // No apply path. No staging object. No mutation. Display only.
    function paintStagingReadinessCard(context) {
        // PR-200: optional context for explicit snapshot handoff. No window.units read.
        // context.liveUnitsSnapshot may carry a pre-validated LiveUnitsSnapshot from caller.
        var ctx = (context && typeof context === 'object' && !Array.isArray(context)) ? context : {};
        var card = document.getElementById('sw-diag-staging-card');
        if (!card) return;
        if (!_swDecisionPackage) { card.hidden = true; return; }
        card.hidden = false;

        var okT   = tx('sw-staging-pass',     'Pass');
        var warnT = tx('sw-staging-review',   'Review');
        var failT = tx('sw-staging-must-fix', 'Must fix');

        function setCheck(id, passed, isHardBlock) {
            var el = document.getElementById(id);
            if (!el) return;
            if (passed) {
                el.textContent = okT;
                el.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
            } else if (isHardBlock) {
                el.textContent = failT;
                el.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-fail';
            } else {
                el.textContent = warnT;
                el.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-warn';
            }
        }

        var step = getActiveImportedDecisionStep();
        if (!step) {
            var noStepT = tx('sw-staging-no-step', 'No active step');
            var overall = document.getElementById('sw-staging-overall');
            if (overall) {
                overall.textContent = noStepT;
                overall.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
            }
            ['sw-staging-identity', 'sw-staging-situation', 'sw-staging-safety',
             'sw-staging-decision', 'sw-staging-units',    'sw-staging-trace'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) { el.textContent = '—'; el.className = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral'; }
            });
            var bc = document.getElementById('sw-staging-blocked-count');
            var wc = document.getElementById('sw-staging-warnings-count');
            if (bc) bc.textContent = '—';
            if (wc) wc.textContent = '—';
            return;
        }

        var result = validateStagingCandidate(step);
        var c      = result.checks;

        // Six checks — situation and source-trace are warnings-only (not hard blocks)
        setCheck('sw-staging-identity',  c.hasStepIdentity,     true);
        setCheck('sw-staging-situation', c.hasSituationContext,  false);
        setCheck('sw-staging-safety',    c.hasSafetyFlags,       true);
        setCheck('sw-staging-decision',  c.hasSelectedDecision,  true);
        setCheck('sw-staging-units',     c.hasUnitReferences,    true);
        setCheck('sw-staging-trace',     c.hasSourceTrace,       false);

        // Overall status
        var overallEl = document.getElementById('sw-staging-overall');
        if (overallEl) {
            if (result.passed) {
                overallEl.textContent = tx('sw-staging-ready', 'Ready');
                overallEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
            } else {
                var n = result.blockedReasons.length;
                overallEl.textContent = tx('sw-staging-blocked', 'Blocked') + ' · ' + n;
                overallEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-fail';
            }
        }

        // Counts
        var blockedEl  = document.getElementById('sw-staging-blocked-count');
        var warningsEl = document.getElementById('sw-staging-warnings-count');
        if (blockedEl)  blockedEl.textContent  = String(result.blockedReasons.length);
        if (warningsEl) warningsEl.textContent = String(result.warnings.length);

        // PR-174: Dry-run proposal preview — display only; proposal not stored
        var propSection      = document.getElementById('sw-staging-prop-section');
        var drcSection       = document.getElementById('sw-drc-section');
        var acSection        = document.getElementById('sw-ac-section');
        var confSection      = document.getElementById('sw-conf-section');
        var builtProp          = null;  // held for PR-181/188/193 sections below
        var syntheticRecord    = null;  // held for PR-188/193
        var drcBuilt           = null;  // held for PR-188/193
        var acBuilt            = null;  // held for PR-193
        // PR-204: hoisted so the final checklist section can read them
        var rrBuilt            = null;
        var rrSnapshotBlocked  = false;
        var rrSnapshotSupplied = false;
        var oiIdentity         = null;
        var oiCheckResult      = null;
        var oiPresent          = false;

        if (propSection) {
            if (!result.passed) {
                propSection.hidden = true;
                if (drcSection) drcSection.hidden = true;
            } else {
                var pkg     = _swDecisionPackage || {};
                var mf      = pkg.manifest || {};
                var pkgId   = mf.package_id || mf.name || '';
                var pkgName = mf.name || '';
                var built   = buildStagingProposal(step, { packageId: pkgId, packageName: pkgName });
                if (!built.passed || !built.proposal) {
                    propSection.hidden = true;
                    if (drcSection) drcSection.hidden = true;
                } else {
                    var prop = built.proposal;
                    builtProp = prop;
                    propSection.hidden = false;

                    var statusEl = document.getElementById('sw-staging-prop-status');
                    if (statusEl) {
                        statusEl.textContent = prop.status;
                        statusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var stepIdEl = document.getElementById('sw-staging-prop-step-id');
                    if (stepIdEl) stepIdEl.textContent = prop.stepId || '—';

                    var pkgEl = document.getElementById('sw-staging-prop-package');
                    if (pkgEl) pkgEl.textContent = prop.packageName || prop.packageId || '—';

                    var dryRunEl = document.getElementById('sw-staging-prop-dryrun');
                    if (dryRunEl) {
                        dryRunEl.textContent = tx('sw-staging-prop-yes', 'Yes');
                        dryRunEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var committedEl = document.getElementById('sw-staging-prop-committed');
                    if (committedEl) {
                        committedEl.textContent = tx('sw-staging-prop-no', 'No');
                        committedEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var effectsEl = document.getElementById('sw-staging-prop-effects');
                    if (effectsEl) {
                        var fx    = prop.proposedEffects || {};
                        var total = (fx.unitStatusChanges   || []).length +
                                    (fx.unitPositionChanges || []).length +
                                    (fx.mapOverlays         || []).length +
                                    (fx.timelineNotes       || []).length;
                        effectsEl.textContent = total === 0
                            ? tx('sw-staging-prop-effects-none', '0 — UID reconciliation pending')
                            : String(total);
                    }
                }
            }
        }

        // PR-181: Dry-run confirmation preview — display only; confirmation not stored.
        // Uses a synthetic review record (decision: approve_dry_run) solely for display.
        // No real operator review has occurred — this is a readiness preview only.
        if (drcSection) {
            if (!builtProp) {
                drcSection.hidden = true;
            } else {
                syntheticRecord = {
                    proposalId:         builtProp.id || 'SP-DIAG',
                    reviewedAt:         new Date().toISOString(),
                    reviewedBy:         null,
                    decision:           'approve_dry_run',
                    notes:              null,
                    safetySnapshot: {
                        dryRun:               true,
                        committed:            false,
                        autoApplyAllowed:     false,
                        liveMutationAllowed:  false,
                        backendCommitAllowed: false
                    },
                    validationSnapshot: {
                        passed:         true,
                        blockedReasons: [],
                        warnings:       []
                    }
                };

                drcBuilt = buildDryRunConfirmation(builtProp, syntheticRecord);

                if (!drcBuilt.passed || !drcBuilt.confirmation) {
                    drcSection.hidden = true;
                } else {
                    var drc = drcBuilt.confirmation;
                    drcSection.hidden = false;

                    var drcModeEl = document.getElementById('sw-drc-mode');
                    if (drcModeEl) {
                        drcModeEl.textContent = tx('sw-drc-mode-value', 'Dry-run only');
                        drcModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var drcLiveEl = document.getElementById('sw-drc-live');
                    if (drcLiveEl) {
                        drcLiveEl.textContent = tx('sw-drc-live-value', 'No live changes');
                        drcLiveEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var drcCommEl = document.getElementById('sw-drc-committed');
                    if (drcCommEl) {
                        drcCommEl.textContent = tx('sw-drc-committed-value', 'No');
                        drcCommEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var drcBlockEl = document.getElementById('sw-drc-blocked');
                    if (drcBlockEl) {
                        drcBlockEl.textContent = tx('sw-drc-blocked-value', 'Yes (blocked)');
                        drcBlockEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    }

                    var drcFxEl = document.getElementById('sw-drc-effects');
                    if (drcFxEl) {
                        var drcFx  = drc.effectsPreview || {};
                        var drcTot = (drcFx.unitStatusChanges   || []).length +
                                     (drcFx.unitPositionChanges || []).length +
                                     (drcFx.mapOverlays         || []).length +
                                     (drcFx.timelineNotes       || []).length;
                        drcFxEl.textContent = drcTot === 0
                            ? tx('sw-drc-effects-none', '0 — UID reconciliation pending')
                            : String(drcTot);
                    }
                }
            }
        }

        // PR-188 / PR-200: Apply candidate preview — display only; candidate not stored.
        // PR-200: routes through previewReconciliationWithSnapshot when ctx.liveUnitsSnapshot
        // is present. Falls back to empty [] when absent. Never reads window.units.
        if (acSection) {
            if (!builtProp || !drcBuilt || !drcBuilt.passed || !drcBuilt.confirmation) {
                acSection.hidden = true;
            } else {
                var acDrc = drcBuilt.confirmation;

                // PR-200: snapshot routing — three paths:
                //   A) ctx.liveUnitsSnapshot absent → empty [] (existing behaviour)
                //   B) ctx.liveUnitsSnapshot present but unsafe → blocked
                //   C) ctx.liveUnitsSnapshot present and safe → previewReconciliationWithSnapshot
                rrBuilt            = null;
                rrSnapshotBlocked  = false;
                rrSnapshotSupplied = !!(ctx.liveUnitsSnapshot);

                if (rrSnapshotSupplied) {
                    var acSnapGuard = isLiveUnitsSnapshotSafe(ctx.liveUnitsSnapshot);
                    if (!acSnapGuard.passed) {
                        // Path B: snapshot present but unsafe
                        rrSnapshotBlocked = true;
                        rrBuilt = {
                            passed:         false,
                            result:         null,
                            blockedReasons: ['Snapshot failed safety check: ' +
                                              acSnapGuard.blockedReasons.join('; ')],
                            warnings:       []
                        };
                    } else {
                        // Path C: safe snapshot — use previewReconciliationWithSnapshot
                        var acPrev = previewReconciliationWithSnapshot(step, ctx.liveUnitsSnapshot);
                        rrBuilt = acPrev.passed
                            ? { passed: true,  result: acPrev.rrResult, blockedReasons: [],                    warnings: acPrev.warnings }
                            : { passed: false, result: null,            blockedReasons: acPrev.blockedReasons, warnings: acPrev.warnings };
                    }
                } else {
                    // Path A: no snapshot — pass empty array; confidence will be 'low'
                    rrBuilt = reconcileUidReferences(step, []);
                }

                var rrResult = (rrBuilt && rrBuilt.result) ? rrBuilt.result : {
                    passed:              false,
                    confidence:          'low',
                    matchedUnits:        [],
                    unresolvedUnits:     [],
                    conflicts:           [],
                    warnings:            [],
                    blockedReasons:      rrSnapshotBlocked
                                             ? ['Snapshot failed safety check']
                                             : ['UID reconciliation pending — no live units snapshot'],
                    readOnly:            true,
                    liveMutationAllowed: false
                };

                acBuilt = buildApplyCandidate(builtProp, syntheticRecord, acDrc, rrResult);
                acSection.hidden = false;

                var acModeEl = document.getElementById('sw-ac-mode');
                if (acModeEl) {
                    acModeEl.textContent = tx('sw-ac-mode-value', 'Operator controlled');
                    acModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var acDryrunEl = document.getElementById('sw-ac-dryrun');
                if (acDryrunEl) {
                    acDryrunEl.textContent = tx('sw-ac-dryrun-value', 'Yes');
                    acDryrunEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                // UID row: Blocked | Unresolved | Pass | Pending
                var acUidEl = document.getElementById('sw-ac-uid');
                if (acUidEl) {
                    if (rrSnapshotBlocked) {
                        acUidEl.textContent = tx('sw-ac-uid-blocked', 'Blocked — snapshot unsafe');
                        acUidEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-fail';
                    } else if (rrBuilt && rrBuilt.passed) {
                        acUidEl.textContent = tx('sw-ac-uid-pass', 'Pass');
                        acUidEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    } else if (rrSnapshotSupplied) {
                        acUidEl.textContent = tx('sw-ac-uid-unresolved', 'Unresolved');
                        acUidEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-warn';
                    } else {
                        acUidEl.textContent = tx('sw-ac-uid-pending', 'Pending');
                        acUidEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var acConfirmedEl = document.getElementById('sw-ac-confirmed');
                if (acConfirmedEl) {
                    acConfirmedEl.textContent = tx('sw-ac-confirmed-value', 'No');
                    acConfirmedEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var acLiveEl = document.getElementById('sw-ac-live');
                if (acLiveEl) {
                    acLiveEl.textContent = tx('sw-ac-live-value', 'No live changes');
                    acLiveEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var acBackendEl = document.getElementById('sw-ac-backend');
                if (acBackendEl) {
                    acBackendEl.textContent = tx('sw-ac-backend-value', 'No');
                    acBackendEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var acFxEl = document.getElementById('sw-ac-effects');
                if (acFxEl) {
                    if (acBuilt.passed && acBuilt.candidate) {
                        var acFx    = acBuilt.candidate.proposedEffects || {};
                        var acTotal = (acFx.unitStatusChanges   || []).length +
                                      (acFx.unitPositionChanges || []).length +
                                      (acFx.mapOverlays         || []).length +
                                      (acFx.timelineNotes       || []).length;
                        acFxEl.textContent = acTotal === 0
                            ? tx('sw-ac-effects-none', '0 — UID reconciliation pending')
                            : String(acTotal);
                    } else {
                        acFxEl.textContent = tx('sw-ac-effects-none', '0 — UID reconciliation pending');
                    }
                }

                // Status row: Preview only | Blocked | Unresolved | Pending
                var acStatusEl = document.getElementById('sw-ac-status');
                if (acStatusEl) {
                    if (acBuilt.passed) {
                        acStatusEl.textContent = tx('sw-ac-status-ready', 'Preview only');
                        acStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    } else if (rrSnapshotBlocked) {
                        acStatusEl.textContent = tx('sw-ac-status-blocked', 'Not ready — snapshot unsafe');
                        acStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-fail';
                    } else if (rrSnapshotSupplied) {
                        acStatusEl.textContent = tx('sw-ac-status-unresolved', 'Not ready — UID reconciliation unresolved');
                        acStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-warn';
                    } else {
                        acStatusEl.textContent = tx('sw-ac-status-pending', 'Not ready — UID reconciliation pending');
                        acStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }
            }
        }

        // PR-193: Apply confirmation preview — display only; confirmation not stored.
        // Uses a synthetic diagnostics operatorId — not a real operator identity.
        // Shown whenever prop+DRC are ready; status row reflects candidate readiness.
        // step2Complete remains false; no Gate 7 UI; no apply path.
        if (confSection) {
            if (!builtProp || !drcBuilt || !drcBuilt.passed || !drcBuilt.confirmation) {
                confSection.hidden = true;
            } else {
                var syntheticOpCtx = { operatorId: 'diagnostics-preview' };
                // confBuilt may fail (low confidence) — status row handles the not-ready state
                var confBuilt = (acBuilt && acBuilt.passed && acBuilt.candidate)
                    ? buildApplyConfirmation(acBuilt.candidate, syntheticOpCtx,
                                             { confirmedAt: new Date().toISOString() })
                    : { passed: false, confirmation: null, blockedReasons: ['Apply candidate not ready — UID reconciliation pending'], warnings: [] };
                confSection.hidden = false;

                var confModeEl = document.getElementById('sw-conf-mode');
                if (confModeEl) {
                    confModeEl.textContent = tx('sw-conf-mode-value', 'Two-step operator');
                    confModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var confApplyModeEl = document.getElementById('sw-conf-applymode');
                if (confApplyModeEl) {
                    confApplyModeEl.textContent = tx('sw-conf-applymode-value', 'Operator controlled');
                    confApplyModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var confStep1El = document.getElementById('sw-conf-step1');
                if (confStep1El) {
                    confStep1El.textContent = tx('sw-conf-step1-value', 'Yes');
                    confStep1El.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var confStep2El = document.getElementById('sw-conf-step2');
                if (confStep2El) {
                    confStep2El.textContent = tx('sw-conf-step2-value', 'No');
                    confStep2El.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var confOpIdEl = document.getElementById('sw-conf-opid');
                if (confOpIdEl) {
                    confOpIdEl.textContent = tx('sw-conf-opid-value', 'Unavailable — diagnostics preview');
                    confOpIdEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                }

                var confWarnEl = document.getElementById('sw-conf-warn');
                if (confWarnEl) {
                    confWarnEl.textContent = tx('sw-conf-warn-value', 'No');
                    confWarnEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var confChkEl = document.getElementById('sw-conf-checklist');
                if (confChkEl) {
                    confChkEl.textContent = tx('sw-conf-checklist-value', 'No');
                    confChkEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                }

                var confStatusEl = document.getElementById('sw-conf-status');
                if (confStatusEl) {
                    if (confBuilt.passed) {
                        confStatusEl.textContent = tx('sw-conf-status-ready', 'Preview only');
                        confStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    } else {
                        confStatusEl.textContent = tx('sw-conf-status-pending', 'Not ready — apply candidate not ready');
                        confStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                // PR-203: Operator identity preview rows — read-only; no apply path; no storage.
                // ctx.operatorIdentity is never stored or cached — display only.
                oiIdentity    = ctx.operatorIdentity || null;
                oiCheckResult = null;
                oiPresent     = !!(oiIdentity);

                if (oiPresent) {
                    oiCheckResult = isOperatorIdentitySafe(oiIdentity, { mode: 'diagnostics' });
                }

                var oiStatusEl = document.getElementById('sw-oi-status');
                if (oiStatusEl) {
                    if (!oiPresent) {
                        oiStatusEl.textContent = tx('sw-oi-status-unavailable', 'Unavailable');
                        oiStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else if (!oiCheckResult.passed) {
                        oiStatusEl.textContent = tx('sw-oi-status-blocked', 'Blocked — identity unsafe');
                        oiStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-fail';
                    } else if (oiIdentity.source === 'test_harness') {
                        oiStatusEl.textContent = tx('sw-oi-status-diagonly', 'Diagnostics only');
                        oiStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-warn';
                    } else {
                        oiStatusEl.textContent = tx('sw-oi-status-valid', 'Valid — diagnostics preview');
                        oiStatusEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var oiOpIdEl = document.getElementById('sw-oi-opid');
                if (oiOpIdEl) {
                    if (!oiPresent || !oiCheckResult.passed) {
                        oiOpIdEl.textContent = tx('sw-oi-opid-unavailable', 'Unavailable');
                        oiOpIdEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else {
                        oiOpIdEl.textContent = String(oiIdentity.operatorId || '');
                        oiOpIdEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var oiSourceEl = document.getElementById('sw-oi-source');
                if (oiSourceEl) {
                    if (!oiPresent || !oiCheckResult.passed) {
                        oiSourceEl.textContent = tx('sw-oi-source-none', 'None');
                        oiSourceEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else {
                        oiSourceEl.textContent = String(oiIdentity.source || '');
                        oiSourceEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var oiVerifiedEl = document.getElementById('sw-oi-verified');
                if (oiVerifiedEl) {
                    if (!oiPresent || !oiCheckResult.passed) {
                        oiVerifiedEl.textContent = tx('sw-oi-status-unavailable', 'Unavailable');
                        oiVerifiedEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else if (oiIdentity.verified === true) {
                        oiVerifiedEl.textContent = tx('sw-oi-verified-confirmed', 'Confirmed');
                        oiVerifiedEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    } else {
                        oiVerifiedEl.textContent = tx('sw-oi-verified-not', 'Not confirmed');
                        oiVerifiedEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var oiCanConfirmEl = document.getElementById('sw-oi-can-confirm');
                if (oiCanConfirmEl) {
                    if (!oiPresent || !oiCheckResult.passed) {
                        oiCanConfirmEl.textContent = tx('sw-oi-status-unavailable', 'Unavailable');
                        oiCanConfirmEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else if (oiIdentity.permissions && oiIdentity.permissions.canConfirmControlledApply === true) {
                        oiCanConfirmEl.textContent = tx('sw-oi-can-confirm-permitted', 'Permitted');
                        oiCanConfirmEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else {
                        oiCanConfirmEl.textContent = tx('sw-oi-can-confirm-not', 'Not permitted');
                        oiCanConfirmEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var oiModeEl = document.getElementById('sw-oi-mode');
                if (oiModeEl) {
                    if (!oiPresent || !oiCheckResult.passed) {
                        oiModeEl.textContent = tx('sw-oi-mode-none', 'None');
                        oiModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    } else if (oiIdentity.source === 'test_harness') {
                        oiModeEl.textContent = tx('sw-oi-mode-diagonly', 'Diagnostics only');
                        oiModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-warn';
                    } else {
                        oiModeEl.textContent = tx('sw-oi-mode-eligible', 'Live eligible — not yet active');
                        oiModeEl.className   = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                }

                var oiWarningsEl = document.getElementById('sw-oi-warnings');
                if (oiWarningsEl) {
                    var oiWarnText = tx('sw-oi-warnings-none', 'None');
                    var oiWarnCls  = 'sw-dpkg-readiness-value sw-dpkg-readiness-ok';
                    if (oiCheckResult && Array.isArray(oiCheckResult.warnings) && oiCheckResult.warnings.length > 0) {
                        oiWarnText = oiCheckResult.warnings[0];
                        oiWarnCls  = 'sw-dpkg-readiness-value sw-dpkg-readiness-warn';
                    } else if (!oiPresent) {
                        oiWarnText = tx('sw-oi-does-not-unlock', 'Does not unlock apply');
                        oiWarnCls  = 'sw-dpkg-readiness-value sw-dpkg-readiness-neutral';
                    }
                    oiWarningsEl.textContent = oiWarnText;
                    oiWarningsEl.className   = oiWarnCls;
                }
            }
        }

        // PR-204: Final checklist preview — read-only summary of Gates 1–7 + identity.
        // Uses only local paint-flow variables. No storage. No apply unlock. No global created.
        var fclSection = document.getElementById('sw-fcl-section');
        if (fclSection) {
            fclSection.hidden = false;

            var gate1Pass = !!(result && result.passed);
            var gate2Pass = !!builtProp;
            var gate3Pass = !!syntheticRecord;
            var gate4Pass = !!(drcBuilt && drcBuilt.passed);
            var gate5Pass = !!(rrBuilt && rrBuilt.passed);
            var gate6Pass = !!(acBuilt && acBuilt.passed);
            var gate7IdentityValid = oiPresent && !!(oiCheckResult && oiCheckResult.passed) &&
                                      oiIdentity && oiIdentity.source !== 'test_harness';
            var gate7DiagOnly      = oiPresent && !!(oiCheckResult && oiCheckResult.passed) &&
                                      oiIdentity && oiIdentity.source === 'test_harness';
            var allDiagPass = gate1Pass && gate2Pass && gate3Pass && gate4Pass &&
                              gate5Pass && gate6Pass;

            function fclSet(id, text, cls) {
                var el = document.getElementById(id);
                if (el) { el.textContent = text; el.className = 'sw-dpkg-readiness-value ' + cls; }
            }
            function fclGate(id, passed, blocked, pending) {
                if (blocked) {
                    fclSet(id, tx('sw-fcl-blocked', 'Blocked'), 'sw-dpkg-readiness-fail');
                } else if (passed) {
                    fclSet(id, tx('sw-fcl-pass', 'Read-only'), 'sw-dpkg-readiness-ok');
                } else if (pending) {
                    fclSet(id, tx('sw-fcl-pending', 'Pending'), 'sw-dpkg-readiness-neutral');
                } else {
                    fclSet(id, tx('sw-fcl-not-ready', 'Not ready'), 'sw-dpkg-readiness-neutral');
                }
            }

            // Overall
            var fclOverallText, fclOverallCls;
            if (allDiagPass && gate7IdentityValid) {
                fclOverallText = tx('sw-fcl-overall-diag-complete', 'Diagnostics only — no apply controls');
                fclOverallCls  = 'sw-dpkg-readiness-warn';
            } else {
                fclOverallText = tx('sw-fcl-overall-not-ready', 'Not ready');
                fclOverallCls  = 'sw-dpkg-readiness-neutral';
            }
            fclSet('sw-fcl-overall', fclOverallText, fclOverallCls);

            // Gates 1–6
            fclGate('sw-fcl-gate1', gate1Pass,  false,             false);
            fclGate('sw-fcl-gate2', gate2Pass,  false,             !gate1Pass);
            fclGate('sw-fcl-gate3', gate3Pass,  false,             !gate2Pass);
            fclGate('sw-fcl-gate4', gate4Pass,  false,             !gate3Pass);
            fclGate('sw-fcl-gate5', gate5Pass,  rrSnapshotBlocked, !gate4Pass);
            fclGate('sw-fcl-gate6', gate6Pass,  false,             !gate5Pass);

            // Gate 7: never implemented — step2Complete always false
            if (gate7DiagOnly) {
                fclSet('sw-fcl-gate7', tx('sw-fcl-diagonly', 'Diagnostics only'), 'sw-dpkg-readiness-warn');
            } else if (gate7IdentityValid) {
                fclSet('sw-fcl-gate7', tx('sw-fcl-gate7-no-impl', 'Not implemented'), 'sw-dpkg-readiness-neutral');
            } else {
                fclSet('sw-fcl-gate7', tx('sw-fcl-not-ready', 'Not ready'), 'sw-dpkg-readiness-neutral');
            }

            // Identity
            if (!oiPresent) {
                fclSet('sw-fcl-identity', tx('sw-fcl-identity-none', 'Unavailable'), 'sw-dpkg-readiness-neutral');
            } else if (!oiCheckResult || !oiCheckResult.passed) {
                fclSet('sw-fcl-identity', tx('sw-fcl-blocked', 'Blocked'), 'sw-dpkg-readiness-fail');
            } else if (gate7DiagOnly) {
                fclSet('sw-fcl-identity', tx('sw-fcl-identity-diagonly', 'Diagnostics only'), 'sw-dpkg-readiness-warn');
            } else {
                fclSet('sw-fcl-identity', tx('sw-fcl-identity-valid', 'Valid — diagnostics preview'), 'sw-dpkg-readiness-neutral');
            }

            // Live status: always no controls (step2Complete === false; no Gate 7 UI)
            fclSet('sw-fcl-live', tx('sw-fcl-no-controls', 'No apply controls'), 'sw-dpkg-readiness-neutral');
        }
    }

    // ── PR-143: Built-in sample Decision Package ─────────────────────────────
    // 3-step synthetic training scenario. Fictional. No real-world operation.
    // No engagement arcs. No combat fields. TRAINING_ONLY.
    // read_only: true. no_auto_adjudication: true. generated_by_ai: true.
    // Safe to call at any time — returns a plain object, touches nothing on window.
    function buildDecisionPackageSample() {
        var manifest = {
            name:                 'SAMPLE-TRAINING-01',
            wargame:              'SAMPLE TRAINING EXERCISE',
            version:              '1.0',
            date:                 '2026-05-25',
            classification:       'TRAINING ONLY',
            team:                 'BLUE — SAMPLE',
            description_ar:       'سيناريو تدريبي وهمي لاختبار واجهة عرض حزمة القرار.',
            description_en:       'Synthetic training scenario for Decision Package preview UI test.',
            read_only:            true,
            no_auto_adjudication: true,
            generated_by_ai:      true,
            outcome:              'TRAINING_ONLY',
            _loadedAt:            Date.now()
        };
        var steps = [
            {
                step_index: 0,
                step_id:    'STEP-SAMPLE-01',
                time_label: 'D+1 / 06:00',
                phase:      'PHASE 1 — ADVANCE',
                situation: {
                    summary_ar: 'القوة الزرقاء تتقدم نحو الهدف التدريبي. القوة الحمراء في وضع الدفاع.',
                    summary_en: 'Blue force advancing toward training objective. Red force in defensive posture.'
                },
                objective: {
                    id:      'OBJ-SAMPLE-A',
                    name_ar: 'الهدف التدريبي ألفا',
                    name_en: 'Training Objective Alpha',
                    status:  'OPEN',
                    coord:   [38.0800, 24.0800]
                },
                decision_points: [
                    {
                        question_ar: 'هل تتقدم بوتيرة سريعة أم تنتظر للتنسيق مع العناصر المجاورة؟',
                        question_en: 'Advance at speed or hold for coordination with adjacent elements?',
                        required:    true
                    }
                ],
                options: [
                    { id: 'OPT-A', label_ar: 'تقدم سريع',       label_en: 'Rapid advance' },
                    { id: 'OPT-B', label_ar: 'انتظار التنسيق',  label_en: 'Hold for coordination' }
                ],
                selected_decision: 'OPT-A',
                confidence: 0.75,
                actions: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', action: 'ADVANCE' },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', action: 'SUPPORT' }
                ],
                counter_actions: [
                    { uid: 'RED-SAMPLE-01', side: 'RED', action: 'OBSERVE' }
                ],
                units: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', name_ar: 'قوة ألفا',    name_en: 'Alpha Force',    role: 'Commander', status: 'ACTIVE',   position: [38.0000, 24.0000] },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', name_ar: 'قوة الدعم',   name_en: 'Support Force',  role: 'Support',   status: 'ACTIVE',   position: [38.0500, 24.0500] },
                    { uid: 'RED-SAMPLE-01',  side: 'RED',  name_ar: 'قوة العقبة',  name_en: 'Opposing Force', role: 'Defense',   status: 'ACTIVE',   position: [38.1000, 24.1000] }
                ],
                affected_units: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', status_change: 'ADVANCING' }
                ],
                objective_status: 'OPEN',
                result: {
                    summary_ar: 'القوة الزرقاء بدأت التقدم. لا تغيير في حالة الهدف.',
                    summary_en: 'Blue force initiated advance. No change to objective status.'
                },
                source_trace: { package_id: 'SAMPLE-TRAINING-01', generated: '2026-05-25', tool: 'PR-143 built-in sample' },
                safety: { read_only: true, no_auto_adjudication: true, generated_by_ai: true, outcome: 'TRAINING_ONLY' }
            },
            {
                step_index: 1,
                step_id:    'STEP-SAMPLE-02',
                time_label: 'D+1 / 10:00',
                phase:      'PHASE 1 — ADVANCE',
                situation: {
                    summary_ar: 'القوة الزرقاء اقتربت من الهدف. القوة الحمراء أعادت تمركزها.',
                    summary_en: 'Blue force has closed on objective. Red force has repositioned.'
                },
                objective: {
                    id:      'OBJ-SAMPLE-A',
                    name_ar: 'الهدف التدريبي ألفا',
                    name_en: 'Training Objective Alpha',
                    status:  'WATCHED',
                    coord:   [38.0800, 24.0800]
                },
                decision_points: [
                    {
                        question_ar: 'هل تبادر بالهجوم أم تنتظر تأكيد موضع العدو؟',
                        question_en: 'Initiate assault or wait for confirmation of adversary position?',
                        required:    true
                    }
                ],
                options: [
                    { id: 'OPT-A', label_ar: 'مبادرة بالهجوم',  label_en: 'Initiate assault' },
                    { id: 'OPT-B', label_ar: 'انتظار التأكيد',  label_en: 'Wait for confirmation' }
                ],
                selected_decision: 'OPT-B',
                confidence: 0.60,
                actions: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', action: 'HOLD' },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', action: 'RECONNAISSANCE' }
                ],
                counter_actions: [
                    { uid: 'RED-SAMPLE-01', side: 'RED', action: 'REPOSITION' }
                ],
                units: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', name_ar: 'قوة ألفا',   name_en: 'Alpha Force',    role: 'Commander', status: 'HOLDING',      position: [38.0600, 24.0600] },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', name_ar: 'قوة الدعم',  name_en: 'Support Force',  role: 'Support',   status: 'RECONN',       position: [38.0700, 24.0700] },
                    { uid: 'RED-SAMPLE-01',  side: 'RED',  name_ar: 'قوة العقبة', name_en: 'Opposing Force', role: 'Defense',   status: 'REPOSITIONED', position: [38.0900, 24.0900] }
                ],
                affected_units: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', status_change: 'HOLDING' },
                    { uid: 'RED-SAMPLE-01',  side: 'RED',  status_change: 'REPOSITIONED' }
                ],
                objective_status: 'WATCHED',
                result: {
                    summary_ar: 'تأخير القوة الزرقاء اكتسب معلومات عن مواضع العدو.',
                    summary_en: 'Blue force delay gained intelligence on adversary positions.'
                },
                source_trace: { package_id: 'SAMPLE-TRAINING-01', generated: '2026-05-25', tool: 'PR-143 built-in sample' },
                safety: { read_only: true, no_auto_adjudication: true, generated_by_ai: true, outcome: 'TRAINING_ONLY' }
            },
            {
                step_index: 2,
                step_id:    'STEP-SAMPLE-03',
                time_label: 'D+1 / 14:00',
                phase:      'PHASE 2 — SECURE',
                situation: {
                    summary_ar: 'القوة الزرقاء حققت الهدف بعد تنسيق ناجح.',
                    summary_en: 'Blue force achieved objective after successful coordination.'
                },
                objective: {
                    id:      'OBJ-SAMPLE-A',
                    name_ar: 'الهدف التدريبي ألفا',
                    name_en: 'Training Objective Alpha',
                    status:  'SECURE',
                    coord:   [38.0800, 24.0800]
                },
                decision_points: [
                    {
                        question_ar: 'هل تثبّت الموضع أم تستعد للمرحلة التالية؟',
                        question_en: 'Consolidate position or prepare for next phase?',
                        required:    false
                    }
                ],
                options: [
                    { id: 'OPT-A', label_ar: 'تثبيت الموضع',              label_en: 'Consolidate' },
                    { id: 'OPT-B', label_ar: 'الاستعداد للمرحلة التالية', label_en: 'Prepare next phase' }
                ],
                selected_decision: 'OPT-A',
                confidence: 0.90,
                actions: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', action: 'CONSOLIDATE' },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', action: 'SECURE_PERIMETER' }
                ],
                counter_actions: [],
                units: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', name_ar: 'قوة ألفا',   name_en: 'Alpha Force',    role: 'Commander', status: 'SECURED',   position: [38.0800, 24.0800] },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', name_ar: 'قوة الدعم',  name_en: 'Support Force',  role: 'Support',   status: 'SECURING',  position: [38.0750, 24.0750] },
                    { uid: 'RED-SAMPLE-01',  side: 'RED',  name_ar: 'قوة العقبة', name_en: 'Opposing Force', role: 'Defense',   status: 'WITHDRAWN', position: null }
                ],
                affected_units: [
                    { uid: 'BLUE-SAMPLE-01', side: 'BLUE', status_change: 'SECURED' },
                    { uid: 'BLUE-SAMPLE-02', side: 'BLUE', status_change: 'SECURING' },
                    { uid: 'RED-SAMPLE-01',  side: 'RED',  status_change: 'WITHDRAWN' }
                ],
                objective_status: 'SECURE',
                result: {
                    summary_ar: 'الهدف مؤمَّن. القوة الزرقاء ناجحة في مرحلة التقدم.',
                    summary_en: 'Objective secured. Blue force successful in advance phase.'
                },
                source_trace: { package_id: 'SAMPLE-TRAINING-01', generated: '2026-05-25', tool: 'PR-143 built-in sample' },
                safety: { read_only: true, no_auto_adjudication: true, generated_by_ai: true, outcome: 'TRAINING_ONLY' }
            }
        ];
        return { manifest: manifest, steps: steps };
    }

    // PR-146B: Built-in fixture-shaped Decision Packages for the static selector.
    // Returns objects in raw fixture shape (scenario_title_en, effect_ar/en, actor_uid, etc.)
    // so the PR-145 adapter (adaptDecisionPackageFixture) is exercised end-to-end.
    // All data is synthetic/training-only. No real-world operation data.
    // No fetch. No storage. No window mutation. Safe to call at any time.
    function buildDecisionFixture(kind) {
        if (kind === 'dp01') {
            return {
                manifest: {
                    scenario_id:       'DP_01_COASTAL',
                    scenario_title_en: 'Coastal Corridor',
                    scenario_title_ar: 'الممر الساحلي',
                    package_version:   '1.0.0',
                    created_at:        '2026-05-01T00:00:00Z',
                    classification:    'TRAINING_ONLY',
                    read_only:            true,
                    no_auto_adjudication: true,
                    generated_by_ai:      true,
                    outcome:           'TRAINING_ONLY',
                    sides: { BLUE: { label_en: 'Blue Coastal Force' } }
                },
                steps: [
                    {
                        step_index: 0, step_id: 'step00',
                        time_label: 'H+0', phase: 'PREPARE',
                        objective_status: 'DORMANT', confidence: 'HIGH',
                        situation: {
                            summary_ar: 'القوة الزرقاء تتخذ مواقع دفاعية على الممر الساحلي.',
                            summary_en: 'Blue force establishes defensive positions along the coastal corridor.'
                        },
                        decision_point: {
                            question_en: 'Hold defense or move reserve?',
                            question_ar: 'تثبيت الدفاع أم تحريك الاحتياط؟',
                            required: true
                        },
                        options: [
                            { id: 'A', text_en: 'Hold defense',  text_ar: 'تثبيت الدفاع',  risk: 'LOW'    },
                            { id: 'B', text_en: 'Move reserve',  text_ar: 'تحريك الاحتياط', risk: 'MEDIUM' }
                        ],
                        selected_decision: 'A',
                        actions:         [{ actor_uid: 'BLUE-COY-01', action: 'defend',        intended_effect: 'hold corridor'       }],
                        counter_actions: [{ actor_uid: 'RED-MECH-01', action: 'advance_probe', intended_effect: 'test corridor access' }],
                        affected_units: ['BLUE-COY-01', 'RED-MECH-01'],
                        units: [
                            { uid: 'BLUE-COY-01', side: 'BLUE', name: 'Blue coastal company', role: 'defense',     position: [45.80, 16.50], status: 'ACTIVE' },
                            { uid: 'BLUE-RES-01', side: 'BLUE', name: 'Blue reserve platoon', role: 'reserve',     position: [45.72, 16.38], status: 'ACTIVE' },
                            { uid: 'RED-MECH-01', side: 'RED',  name: 'Red mechanized group', role: 'main_effort', position: [45.74, 16.36], status: 'ACTIVE' }
                        ],
                        result: { effect_en: 'Defensive positions held. No significant contact.', effect_ar: 'المواضع الدفاعية محفوظة. لا تماس يُذكر.' },
                        source_trace: { source_file: 'steps/step00.json', confidence: 'HIGH', note: 'Synthetic — PR-146B static selector.' },
                        safety: { read_only: true, dry_run_only: true, no_auto_adjudication: true, display_only: true }
                    },
                    {
                        step_index: 1, step_id: 'step01',
                        time_label: 'H+6', phase: 'PHASE 1',
                        objective_status: 'THREATENED', confidence: 'MEDIUM',
                        situation: {
                            summary_ar: 'القوة الحمراء تضغط على المحور الساحلي.',
                            summary_en: 'Red force pressure increases on coastal axis.'
                        },
                        decision_point: {
                            question_en: 'Commit reserve or request support?',
                            question_ar: 'تفعيل الاحتياط أم طلب الدعم؟',
                            required: true
                        },
                        options: [
                            { id: 'A', text_en: 'Commit reserve',  text_ar: 'تفعيل الاحتياط', risk: 'MEDIUM' },
                            { id: 'B', text_en: 'Request support', text_ar: 'طلب الدعم',        risk: 'LOW'    }
                        ],
                        selected_decision: 'B',
                        actions:         [{ actor_uid: 'BLUE-RES-01', action: 'screen_or_reposition', intended_effect: 'protect objective approach' }],
                        counter_actions: [{ actor_uid: 'RED-MECH-01', action: 'advance',              intended_effect: 'exploit gap'               }],
                        affected_units: ['BLUE-RES-01', 'RED-MECH-01'],
                        units: [
                            { uid: 'BLUE-COY-01', side: 'BLUE', name: 'Blue coastal company', role: 'defense',     position: [45.80, 16.50], status: 'HOLDING'       },
                            { uid: 'BLUE-RES-01', side: 'BLUE', name: 'Blue reserve platoon', role: 'reserve',     position: [45.72, 16.38], status: 'REPOSITIONING' },
                            { uid: 'RED-MECH-01', side: 'RED',  name: 'Red mechanized group', role: 'main_effort', position: [45.74, 16.36], status: 'ADVANCING'     }
                        ],
                        result: { effect_en: 'Reserve repositioned. Support request submitted.', effect_ar: 'تم تحريك الاحتياط. طلب الدعم مقدَّم.' },
                        source_trace: { source_file: 'steps/step01.json', confidence: 'MEDIUM', note: 'Synthetic — PR-146B static selector.' },
                        safety: { read_only: true, dry_run_only: true, no_auto_adjudication: true, display_only: true }
                    }
                ]
            };
        }
        if (kind === 'dp02') {
            return {
                manifest: {
                    scenario_id:       'DP_02_DESERT',
                    scenario_title_en: 'Desert Logistics Route',
                    scenario_title_ar: 'المسار اللوجستي الصحراوي',
                    package_version:   '1.0.0',
                    created_at:        '2026-05-02T00:00:00Z',
                    classification:    'TRAINING_ONLY',
                    read_only:            true,
                    no_auto_adjudication: true,
                    generated_by_ai:      true,
                    outcome:           'TRAINING_ONLY',
                    sides: { BLUE: { label_en: 'Blue Logistics Force' } }
                },
                steps: [
                    {
                        step_index: 0, step_id: 'step00',
                        time_label: 'T+0m', phase: 'OBSERVE',
                        objective_status: 'OPEN', confidence: 'MEDIUM',
                        situation: {
                            summary_ar: 'القوة الزرقاء تؤمّن عقدة لوجستية ومسار تمويني في البيئة الصحراوية.',
                            summary_en: 'Blue force secures a logistics node and supply route in desert terrain.'
                        },
                        decision_point: {
                            question_en: 'Continue on current route or reroute?',
                            question_ar: 'الاستمرار في المسار الحالي أم التحويل؟',
                            required: false
                        },
                        options: [
                            { id: 'A', text_en: 'Continue with monitoring', text_ar: 'الاستمرار مع المراقبة', risk: 'MEDIUM' },
                            { id: 'B', text_en: 'Reroute',                 text_ar: 'تغيير المسار',           risk: 'LOW'    }
                        ],
                        selected_decision: null,
                        actions:         [{ actor_uid: 'RED-UAV-01',  action: 'observe_route', intended_effect: 'identify movement pattern' }],
                        counter_actions: [{ actor_uid: 'BLUE-QRF-01', action: 'reposition',    intended_effect: 'secure alternate route'    }],
                        affected_units: ['BLUE-QRF-01', 'RED-UAV-01'],
                        units: [
                            { uid: 'BLUE-LOG-01', side: 'BLUE', name: 'Blue logistics node',       role: 'logistics', position: [53.92, 23.62], status: 'ACTIVE' },
                            { uid: 'BLUE-QRF-01', side: 'BLUE', name: 'Blue quick reaction force', role: 'reserve',   position: [53.45, 23.35], status: 'ACTIVE' },
                            { uid: 'RED-UAV-01',  side: 'RED',  name: 'Red UAV observation cell',  role: 'uav',       position: [53.25, 23.95], status: 'ACTIVE' }
                        ],
                        result: { effect_en: 'Route under observation. Decision pending.', effect_ar: 'المسار تحت المراقبة. القرار معلّق.' },
                        source_trace: { source_file: 'steps/step00.json', confidence: 'MEDIUM', note: 'Synthetic — PR-146B static selector.' },
                        safety: { read_only: true, dry_run_only: true, no_auto_adjudication: true, display_only: true }
                    },
                    {
                        step_index: 1, step_id: 'step01',
                        time_label: 'T+30m', phase: 'ORIENT',
                        objective_status: 'WATCHED', confidence: 'LOW',
                        situation: {
                            summary_ar: 'رُصدت طائرة مسيّرة معادية تراقب محور التمويل.',
                            summary_en: 'Enemy UAV confirmed observing the supply axis.'
                        },
                        decision_point: {
                            question_en: 'Divert convoy or establish screen?',
                            question_ar: 'تحويل القافلة أم نشر ستار حماية؟',
                            required: true
                        },
                        options: [
                            { id: 'A', text_en: 'Divert convoy',    text_ar: 'تحويل القافلة',    risk: 'LOW'  },
                            { id: 'B', text_en: 'Establish screen', text_ar: 'نشر ستار حماية', risk: 'HIGH' }
                        ],
                        selected_decision: 'A',
                        actions:         [{ actor_uid: 'BLUE-QRF-01', action: 'divert',  intended_effect: 'avoid UAV observation zone' }],
                        counter_actions: [{ actor_uid: 'RED-UAV-01',  action: 'persist', intended_effect: 'track alternate route'      }],
                        affected_units: ['BLUE-LOG-01', 'BLUE-QRF-01'],
                        units: [
                            { uid: 'BLUE-LOG-01', side: 'BLUE', name: 'Blue logistics node',       role: 'logistics', position: [53.92, 23.62], status: 'DIVERTING' },
                            { uid: 'BLUE-QRF-01', side: 'BLUE', name: 'Blue quick reaction force', role: 'reserve',   position: [53.55, 23.40], status: 'SCREENING' },
                            { uid: 'RED-UAV-01',  side: 'RED',  name: 'Red UAV observation cell',  role: 'uav',       position: [53.25, 23.95], status: 'ACTIVE'    }
                        ],
                        result: { effect_en: 'Convoy diverted to alternate route. UAV coverage reduced.', effect_ar: 'تم تحويل القافلة. تغطية المسيّرة انخفضت.' },
                        source_trace: { source_file: 'steps/step01.json', confidence: 'LOW', note: 'Synthetic — PR-146B static selector.' },
                        safety: { read_only: true, dry_run_only: true, no_auto_adjudication: true, display_only: true }
                    }
                ]
            };
        }
        if (kind === 'dp03') {
            return {
                manifest: {
                    scenario_id:       'DP_03_URBAN',
                    scenario_title_en: 'Urban Evacuation',
                    scenario_title_ar: 'الإخلاء الحضري',
                    package_version:   '1.0.0',
                    created_at:        '2026-05-03T00:00:00Z',
                    classification:    'TRAINING_ONLY',
                    read_only:            true,
                    no_auto_adjudication: true,
                    generated_by_ai:      true,
                    outcome:           'TRAINING_ONLY',
                    sides: { BLUE: { label_en: 'Blue Evacuation Force' } }
                },
                steps: [
                    {
                        step_index: 0, step_id: 'step00',
                        time_label: 'H+0', phase: 'PREPARE',
                        objective_status: 'READY', confidence: 'HIGH',
                        situation: {
                            summary_ar: 'يُنسّق الفريق الأزرق الحركة الآمنة نحو نقطة الإخلاء في بيئة حضرية.',
                            summary_en: 'Blue coordinates safe movement to evacuation point in urban environment.'
                        },
                        decision_point: {
                            question_en: 'Which evacuation route should be selected?',
                            question_ar: 'أي مسار إخلاء يتم اختياره؟',
                            required: true
                        },
                        options: [
                            { id: 'A', text_en: 'Northern route', text_ar: 'المسار الشمالي', risk: 'MEDIUM' },
                            { id: 'B', text_en: 'Southern route', text_ar: 'المسار الجنوبي', risk: 'LOW'    }
                        ],
                        selected_decision: 'B',
                        actions:         [{ actor_uid: 'BLUE-EVAC-01',   action: 'coordinate_movement', intended_effect: 'safe passage'   }],
                        counter_actions: [{ actor_uid: 'RED-DISRUPT-01', action: 'delay',               intended_effect: 'force reroute'  }],
                        affected_units: ['BLUE-EVAC-01', 'BLUE-MED-01'],
                        units: [
                            { uid: 'BLUE-EVAC-01',   side: 'BLUE', name: 'Evacuation coordination team', role: 'civil_support', position: [31.50, 30.18], status: 'ACTIVE' },
                            { uid: 'BLUE-MED-01',    side: 'BLUE', name: 'Medical support point',        role: 'medical',       position: [31.42, 30.05], status: 'ACTIVE' },
                            { uid: 'RED-DISRUPT-01', side: 'RED',  name: 'Opposing disruption group',    role: 'disruption',    position: [31.15, 30.38], status: 'ACTIVE' }
                        ],
                        result: { effect_en: 'Evacuation decision displayed. Southern route selected.', effect_ar: 'تم عرض قرار الإخلاء. تم اختيار المسار الجنوبي.' },
                        source_trace: { source_file: 'steps/step00.json', confidence: 'HIGH', note: 'Synthetic — PR-146B static selector.' },
                        safety: { read_only: true, dry_run_only: true, no_auto_adjudication: true, display_only: true }
                    }
                ]
            };
        }
        return null;
    }

    // PR-143: Wire load-sample / clear-sample buttons (called once in init).
    // No file picker. No fetch. No storage. No window.units/lines. No scenario mutation.
    function initDecisionPackageSampleLoader() {
        var loadBtn     = document.getElementById('sw-dpkg-load-sample');
        var clearBtn    = document.getElementById('sw-dpkg-clear-sample');
        var fixtureSel  = document.getElementById('sw-dpkg-fixture-select');
        var fixtureBtn  = document.getElementById('sw-dpkg-load-fixture');

        if (loadBtn) {
            loadBtn.addEventListener('click', function () {
                var sample = buildDecisionPackageSample();
                loadDecisionPackagePreview(sample.manifest, sample.steps);
                // paintDecisionPackageCards() is called by loadDecisionPackagePreview
                // paintDecisionLoaderRow() is called by paintDecisionPackageCards()
            });
        }
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _swDecisionPackage          = null;
                _swDecisionSteps            = [];
                _swDecisionLoadError        = null;
                _swDecisionImportValidation = null;  // PR-151: hide validation card on clear
                _swDiagnosticsOpen          = false;  // PR-162: reset panel to collapsed on clear
                paintDecisionPackageCards();
                // paintDecisionLoaderRow() resets select + hides clear button
            });
        }
        // PR-146B: Load fixture button — reads select, calls adapter, paints cards.
        // No file picker. No fetch. No storage. No backend. No scenario mutation.
        if (fixtureBtn) {
            fixtureBtn.addEventListener('click', function () {
                var kind = fixtureSel ? fixtureSel.value : '';
                if (!kind) return;
                var raw = buildDecisionFixture(kind);
                if (!raw) return;
                loadParsedDecisionPackageFixture(raw);
            });
        }
    }

    // ── PR-148: Read-Only JSON Decision Package Importer ────────────────────────
    // Browser File API only (FileReader.readAsText — read-only by design).
    // No fetch. No backend. No storage. No writes. JSON only. Max 2 MB per file.
    // importDecisionPackageJson does NOT clear state before success:
    //   failed import keeps _swDecisionPackage / _swDecisionSteps intact.

    function isJsonFile(file) {
        if (!file) return false;
        var name = (file.name || '').toLowerCase();
        return name.slice(-5) === '.json' || file.type === 'application/json';
    }

    function assertJsonFileSafe(file) {
        if (!file || !isJsonFile(file)) {
            throw new Error(tx('sw-dpkg-import-error-not-json', 'Only .json files are allowed.')
                            + (file ? ': ' + file.name : ''));
        }
        if (file.size > 2 * 1024 * 1024) {
            throw new Error(tx('sw-dpkg-import-error-too-large', 'JSON file is too large.')
                            + ': ' + file.name);
        }
    }

    function readJsonFile(file) {
        return new Promise(function (resolve, reject) {
            try { assertJsonFileSafe(file); } catch (e) { return reject(e); }
            var reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    resolve(JSON.parse(evt.target.result));
                } catch (e) {
                    reject(new Error(
                        tx('sw-dpkg-import-error-parse', 'JSON parse error')
                        + ' (' + file.name + '): ' + e.message
                    ));
                }
            };
            reader.onerror = function () {
                reject(new Error('FileReader error: '
                    + (reader.error ? reader.error.message : 'unknown')));
            };
            reader.readAsText(file, 'UTF-8');
        });
    }

    function readJsonFiles(fileList) {
        var arr = Array.from(fileList || []);
        // Validate ALL files before reading any — no partial loads
        try { arr.forEach(assertJsonFileSafe); } catch (e) { return Promise.reject(e); }
        return Promise.all(arr.map(readJsonFile));
    }

    // Safe commit wrapper — does NOT touch _swDecisionPackage/_swDecisionSteps until
    // both adapter and normaliser succeed. On error, previous package remains visible.
    function importDecisionPackageJson(manifestData, stepsData) {
        _swDecisionLoadError = null;
        try {
            var adapted = adaptDecisionPackageFixture({ manifest: manifestData, steps: stepsData });
            var pkg     = normaliseDecisionPackage(adapted.manifest, adapted.steps);
            // Only commit after full success
            _swDecisionPackage = pkg;
            _swDecisionSteps   = pkg.steps;
            // PR-151: build validation summary on success
            _swDecisionImportValidation = buildImportValidationSummary(
                manifestData, stepsData,
                { status: 'imported', safetyGatePassed: true }
            );
        } catch (e) {
            _swDecisionLoadError = String(e && e.message ? e.message : e);
            // _swDecisionPackage and _swDecisionSteps unchanged
            // PR-151: detect whether safety gate specifically caused rejection
            var safetyFailed = !!(e.message && e.message.indexOf('Package rejected') !== -1);
            _swDecisionImportValidation = buildImportValidationSummary(
                manifestData, stepsData,
                {
                    status:           'rejected',
                    safetyGatePassed: safetyFailed ? false : null,
                    message:          _swDecisionLoadError
                }
            );
        }
        paintDecisionPackageCards();
    }

    function initDecisionPackageJsonImporter() {
        var manifestInput = document.getElementById('sw-dpkg-manifest-input');
        var stepsInput    = document.getElementById('sw-dpkg-steps-input');
        var importBtn     = document.getElementById('sw-dpkg-import-json');
        if (!importBtn) return;

        importBtn.addEventListener('click', function () {
            var manifestFiles = manifestInput ? manifestInput.files : null;
            var stepsFiles    = stepsInput    ? stepsInput.files    : null;

            // Synchronous validation — no file reading yet, previous package intact
            if (!manifestFiles || manifestFiles.length === 0) {
                _swDecisionLoadError = tx('sw-dpkg-import-error-no-manifest',
                                         'Select one manifest JSON file.');
                _swDecisionImportValidation = buildImportValidationSummary(null, [],
                    { status: 'rejected', safetyGatePassed: null, message: _swDecisionLoadError });
                paintDecisionPackageCards();
                return;
            }
            if (!stepsFiles || stepsFiles.length === 0) {
                _swDecisionLoadError = tx('sw-dpkg-import-error-no-steps',
                                         'Select at least one step JSON file.');
                _swDecisionImportValidation = buildImportValidationSummary(null, [],
                    { status: 'rejected', safetyGatePassed: null, message: _swDecisionLoadError });
                paintDecisionPackageCards();
                return;
            }

            var manifestFile = manifestFiles[0];
            var stepFilesArr = Array.from(stepsFiles);

            if (!isJsonFile(manifestFile)) {
                _swDecisionLoadError = tx('sw-dpkg-import-error-not-json',
                                         'Only .json files are allowed.') + ': ' + manifestFile.name;
                _swDecisionImportValidation = buildImportValidationSummary(null, [],
                    { status: 'rejected', safetyGatePassed: null, message: _swDecisionLoadError });
                paintDecisionPackageCards();
                return;
            }
            for (var i = 0; i < stepFilesArr.length; i++) {
                if (!isJsonFile(stepFilesArr[i])) {
                    _swDecisionLoadError = tx('sw-dpkg-import-error-not-json',
                                             'Only .json files are allowed.') + ': ' + stepFilesArr[i].name;
                    _swDecisionImportValidation = buildImportValidationSummary(null, [],
                        { status: 'rejected', safetyGatePassed: null, message: _swDecisionLoadError });
                    paintDecisionPackageCards();
                    return;
                }
            }

            // Async read — errors propagate to catch, which keeps previous package visible
            readJsonFile(manifestFile).then(function (manifestData) {
                return readJsonFiles(stepFilesArr).then(function (stepsData) {
                    if (!stepsData.length) {
                        _swDecisionLoadError = tx('sw-dpkg-import-error-empty-steps',
                                                  'No step files were loaded.');
                        _swDecisionImportValidation = buildImportValidationSummary(null, [],
                            { status: 'rejected', safetyGatePassed: null,
                              message: _swDecisionLoadError });
                        paintDecisionPackageCards();
                        return;
                    }
                    stepsData.sort(function (a, b) {
                        return (typeof (a && a.step_index) === 'number' ? a.step_index : 0)
                             - (typeof (b && b.step_index) === 'number' ? b.step_index : 0);
                    });
                    importDecisionPackageJson(manifestData, stepsData);
                });
            }).catch(function (e) {
                _swDecisionLoadError = String(e && e.message ? e.message : e);
                _swDecisionImportValidation = buildImportValidationSummary(null, [],
                    { status: 'rejected', safetyGatePassed: null, message: _swDecisionLoadError });
                paintDecisionPackageCards();
            });
        });
    }

    // ── PR-136: Playback engine ───────────────────────────────────────────────
    // Only mutates: _swPlayIntervalId, _swIsPlaying, window.RmoozScenario.stepIndex
    // No animation. No backend. No storage. No engagement arcs. No combat data.

    function stopPlayback() {
        // Canonical engine owns the timer when present (single-engine rule).
        if (window.AppScenarioRunner) {
            try { window.AppScenarioRunner.pause(); } catch (_) { /* no-op */ }
            _swIsPlaying = false;
            paintPlayButton();
            return;
        }
        if (_swPlayIntervalId !== null) {
            clearInterval(_swPlayIntervalId);
            _swPlayIntervalId = null;
        }
        _swIsPlaying = false;
        paintPlayButton();
    }

    function startPlayback() {
        // Canonical engine owns playback when present (single timer, shared by
        // the nav Play button, the bottom transport, and turn-engine Start).
        if (window.AppScenarioRunner) {
            try { window.AppScenarioRunner.play(); } catch (_) { /* no-op */ }
            return; // play-button visual synced via the rmooz:scenario-run listener
        }
        var sc    = getScenario();
        var steps = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        if (!steps.length) return;
        if (getActiveStepIndex() >= steps.length - 1) return; // already at last step
        // Duplicate timer guard — always clear before creating a new interval
        if (_swPlayIntervalId !== null) {
            clearInterval(_swPlayIntervalId);
            _swPlayIntervalId = null;
        }
        _swIsPlaying = true;
        paintPlayButton();
        _swPlayIntervalId = setInterval(function () {
            var cur = getActiveStepIndex();
            var sc2 = getScenario();
            var tot = (sc2 && Array.isArray(sc2.steps)) ? sc2.steps.length : 0;
            if (!tot || cur >= tot - 1) {
                stopPlayback();
                return;
            }
            goToStep(cur + 1);
            // Auto-stop check after advance (boundary second layer)
            if (getActiveStepIndex() >= tot - 1) {
                stopPlayback();
            }
        }, _swPlaySpeedMs);
    }

    function restartPlaybackTimerIfPlaying() {
        if (!_swIsPlaying) return;
        if (_swPlayIntervalId !== null) {
            clearInterval(_swPlayIntervalId);
            _swPlayIntervalId = null;
        }
        startPlayback();
    }

    function initStepNavigator() {
        // ── Canonical runner integration (one-time) ──────────────────────────
        // Register goToStep as THE preview renderer so the canonical engine
        // moves markers + repaints cards exactly like manual nav, and mirror the
        // engine's play state onto the nav Play button regardless of which
        // control (nav / bottom transport / turn-engine Start) started playback.
        if (window.AppScenarioRunner && !window.__swRunnerBound) {
            window.__swRunnerBound = true;
            try { window.AppScenarioRunner.registerPreviewRenderer(goToStep); } catch (_) { /* no-op */ }
            document.addEventListener('rmooz:scenario-run', function (e) {
                var ev = e && e.detail && e.detail.event;
                if (ev === 'play') { _swIsPlaying = true; }
                else if (ev === 'pause' || ev === 'ended') { _swIsPlaying = false; }
                else { return; }
                try { paintPlayButton(); } catch (_) { /* no-op */ }
            });
        }
        var btnPlay  = document.getElementById('sw-nav-play');
        var speedSel = document.getElementById('sw-nav-speed');
        var btnFirst = document.getElementById('sw-nav-first');
        var btnPrev  = document.getElementById('sw-nav-prev');
        var btnNext  = document.getElementById('sw-nav-next');
        var btnLast  = document.getElementById('sw-nav-last');

        // Play/Pause toggle
        if (btnPlay) {
            btnPlay.addEventListener('click', function () {
                if (_swIsPlaying) {
                    stopPlayback();
                } else {
                    startPlayback();
                }
            });
        }

        // Speed selector: restrict to allowed values; fallback to 2000
        var ALLOWED_SPEEDS = { '4000': 4000, '2000': 2000, '800': 800, '300': 300 };
        if (speedSel) {
            speedSel.addEventListener('change', function () {
                var v = ALLOWED_SPEEDS[String(speedSel.value)];
                _swPlaySpeedMs = (v !== undefined) ? v : 2000;
                if (window.AppScenarioRunner) {
                    try { window.AppScenarioRunner.setSpeed(_swPlaySpeedMs); } catch (_) { /* no-op */ }
                } else {
                    restartPlaybackTimerIfPlaying();
                }
            });
        }

        // Manual navigation — always stop playback before stepping
        if (btnFirst) {
            btnFirst.addEventListener('click', function () {
                stopPlayback();
                goToStep(0);
            });
        }
        if (btnPrev) {
            btnPrev.addEventListener('click', function () {
                stopPlayback();
                goToStep(getActiveStepIndex() - 1);
            });
        }
        if (btnNext) {
            btnNext.addEventListener('click', function () {
                stopPlayback();
                goToStep(getActiveStepIndex() + 1);
            });
        }
        if (btnLast) {
            btnLast.addEventListener('click', function () {
                stopPlayback();
                var sc    = getScenario();
                var steps = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
                goToStep(steps.length - 1);
            });
        }

        // PR-138: Overlay toggle — enable/disable the unit position dot layer
        var btnOverlay = document.getElementById('sw-nav-overlay-toggle');
        if (btnOverlay) {
            btnOverlay.addEventListener('click', function () {
                _swOverlayEnabled = !_swOverlayEnabled;
                if (_swOverlayEnabled) {
                    paintScenarioOverlay();
                } else {
                    stopScenarioOverlay();
                }
            });
        }

        // Lifecycle cleanup: pause when panel hides, clear on page unload
        document.addEventListener('rmooz:panel-hidden', stopPlayback);
        window.addEventListener('beforeunload', stopPlayback);
        // PR-138: clean up overlay layer when panel hides or page unloads
        document.addEventListener('rmooz:panel-hidden', stopScenarioOverlay);
        window.addEventListener('beforeunload', stopScenarioOverlay);
    }

    // ── PR-132: Actions & Effects Card ──────────────────────────────────
    // Read-only display of actors[] and affected[] for the current step.
    // W3 (schema_variant: "w3-rich") only — gracefully shows dash for W1/W2.
    // textContent only. No map drawing. No engagement arcs. No combat data.
    // No mutation, no backend, no storage, no Event Log entries.
    function paintActionsCard() {
        var detailsEl  = document.getElementById('sw-act-details');
        var actorsList = document.getElementById('sw-act-actors-list');
        var affList    = document.getElementById('sw-act-affected-list');
        if (!detailsEl) return;

        var sc      = getScenario();
        var liveIdx = getActiveStepIndex();
        var dispIdx = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var step    = steps[dispIdx] || null;
        var none    = tx('sw-act-none', 'None recorded');

        // Only show for W3-rich steps that carry actor data
        var actors   = (step && Array.isArray(step.actors))   ? step.actors   : null;
        var affected = (step && Array.isArray(step.affected)) ? step.affected : null;

        if (!actors && !affected) {
            detailsEl.setAttribute('hidden', '');
            return;
        }
        detailsEl.removeAttribute('hidden');

        function buildList(el, items, isActors) {
            if (!el) return;
            el.innerHTML = '';
            if (!items || items.length === 0) {
                var li = document.createElement('li');
                li.textContent = none;
                el.appendChild(li);
                return;
            }
            items.forEach(function (entry) {
                var li   = document.createElement('li');
                // Side tag
                var side = document.createElement('span');
                side.className = 'sw-act-item-side';
                side.setAttribute('data-side', entry.side || '');
                side.textContent = entry.side || '';
                li.appendChild(side);
                // Summary text — textContent only, no innerHTML
                var text;
                if (isActors) {
                    // Actors: "action_what (action_component)"
                    text = (entry.action_what || '');
                    if (entry.action_component) text += ' [' + entry.action_component + ']';
                } else {
                    // Affected: "status_change — cause_what"
                    text = (entry.status_change || '');
                    if (entry.cause_what) text += ' — ' + entry.cause_what;
                }
                var span = document.createElement('span');
                span.textContent = text || '—';
                li.appendChild(span);
                el.appendChild(li);
            });
        }

        buildList(actorsList, actors,   true);
        buildList(affList,    affected, false);
    }

    // ── PR-61: Objective Snapshot Card ──────────────────────────────────
    // Read-only display of scenario.obj fields.
    // No network calls. No mutation. No persistence. No Event Log entries.
    function paintObjectiveCard() {
        var sc   = getScenario();
        var obj  = (sc && sc.obj) ? sc.obj : null;
        var dash = tx('sw-value-none', '—');

        function setOF(id, val) {
            var el = document.getElementById(id);
            if (!el) return;
            var v = (val !== null && val !== undefined && val !== '') ? String(val) : null;
            if (v !== null) {
                el.removeAttribute('data-i18n');
                el.textContent = v;
            } else {
                el.setAttribute('data-i18n', 'sw-value-none');
                el.textContent = dash;
            }
        }

        // coord may be [lon, lat] array — join for display
        var coordRaw = obj && obj.coord;
        var coordVal = Array.isArray(coordRaw) ? coordRaw.join(', ') : coordRaw;

        setOF('sw-obj-name',   obj && obj.name);
        setOF('sw-obj-depth',  obj && obj.target_depth_km);
        setOF('sw-obj-carver', obj && obj.carver);
        setOF('sw-obj-coord',  coordVal);
    }

    // ── PR-62: BLS Snapshot Card ─────────────────────────────────────────
    // Read-only BLS entry list. Reads window.RmoozScenario.scenario.bls_template only.
    // No network, no mutation, no persistence.
    function paintBlsCard() {
        var list = document.getElementById('sw-bls-list');
        if (!list) return;
        var sc  = getScenario();
        var bls = (sc && Array.isArray(sc.bls_template) && sc.bls_template.length > 0)
                  ? sc.bls_template : null;
        list.innerHTML = '';
        if (!bls) {
            var empty = document.createElement('li');
            empty.className = 'sw-bls-empty';
            empty.setAttribute('data-i18n', 'sw-bls-empty');
            empty.textContent = tx('sw-bls-empty', 'No BLS data');
            list.appendChild(empty);
            return;
        }
        var dash = tx('sw-value-none', '—');
        // PR-287F: per-step BLS status (joins bls_template by `name`). Step-aware
        // via getActiveStep(); scenario data rendered as textContent (no i18n).
        var step      = getActiveStep();
        var statusMap = (step && step.bls_status_baseline &&
                         typeof step.bls_status_baseline === 'object')
                        ? step.bls_status_baseline : null;
        bls.forEach(function(entry) {
            var li = document.createElement('li');
            li.className = 'sw-bls-row';
            var n    = (entry.name !== null && entry.name !== undefined && entry.name !== '')
                       ? String(entry.name) : dash;
            var r    = (entry.role !== null && entry.role !== undefined && entry.role !== '')
                       ? String(entry.role) : dash;
            var cRaw = entry.coord;
            var cStr = Array.isArray(cRaw) ? cRaw.join(', ')
                     : (cRaw != null ? String(cRaw) : null);
            var c    = (cStr !== null && cStr !== '') ? cStr : dash;
            var nameEl  = document.createElement('span');
            nameEl.className  = 'sw-bls-name';
            nameEl.textContent = n;
            var statusRaw = statusMap ? statusMap[entry.name] : null;
            var statusEl  = document.createElement('span');
            statusEl.className = 'sw-bls-status';
            if (statusRaw !== null && statusRaw !== undefined && statusRaw !== '') {
                var sStr = String(statusRaw);
                statusEl.textContent = sStr;
                statusEl.setAttribute('data-status', sStr.toLowerCase());
            } else {
                statusEl.textContent = dash;
            }
            var headEl  = document.createElement('div');
            headEl.className = 'sw-bls-head';
            headEl.appendChild(nameEl);
            headEl.appendChild(statusEl);
            var roleEl  = document.createElement('span');
            roleEl.className  = 'sw-bls-role';
            roleEl.textContent = r;
            var coordEl = document.createElement('span');
            coordEl.className = 'sw-bls-coord';
            coordEl.textContent = c;
            li.appendChild(headEl);
            li.appendChild(roleEl);
            li.appendChild(coordEl);
            list.appendChild(li);
        });
    }

    // ── PR-65: Force Summary Balance Strip ───────────────────────────────
    // Read-only. Reads blue_units_initial + red_units from window.RmoozScenario.
    // No mutation, no backend, no storage, no event log.

    function paintForceSummaryStrip() {
        var blueNumEl  = document.getElementById('sw-fs-blue-num');
        var redNumEl   = document.getElementById('sw-fs-red-num');
        var ratioValEl = document.getElementById('sw-fs-ratio-val');
        if (!blueNumEl || !redNumEl || !ratioValEl) return;

        var sc         = getScenario();
        var dash       = tx('sw-value-none', '—');
        var blueUnits  = (sc && Array.isArray(sc.blue_units_initial)) ? sc.blue_units_initial : null;
        var redUnits   = (sc && Array.isArray(sc.red_units))          ? sc.red_units          : null;
        var blueCount  = blueUnits !== null ? blueUnits.length : null;
        var redCount   = redUnits  !== null ? redUnits.length  : null;

        blueNumEl.textContent  = blueCount !== null ? String(blueCount) : dash;
        redNumEl.textContent   = redCount  !== null ? String(redCount)  : dash;

        if (blueCount !== null && redCount !== null && redCount > 0) {
            ratioValEl.textContent = (blueCount / redCount).toFixed(1) + ' : 1';
        } else {
            ratioValEl.textContent = dash;
        }
    }

    // ── BFC: Blue Force Snapshot Card ──────────────────────────────────
    // Read-only blue unit list. Reads window.RmoozScenario.scenario.blue_units_initial only.
    // Capped at SW_BF_CAP rows; overflow shown as "+N more". No network, no mutation, no persistence.
    var SW_BF_CAP = 10;

    function paintBlueForceCard() {
        var countEl = document.getElementById('sw-bf-count');
        var list    = document.getElementById('sw-bf-list');
        var moreEl  = document.getElementById('sw-bf-more');
        if (!list) return;
        var sc    = getScenario();
        var units = (sc && Array.isArray(sc.blue_units_initial) && sc.blue_units_initial.length > 0)
                    ? sc.blue_units_initial : null;
        list.innerHTML = '';
        if (moreEl)  { moreEl.setAttribute('hidden', ''); }
        if (countEl) { countEl.setAttribute('hidden', ''); }
        if (!units) {
            var empty = document.createElement('li');
            empty.className = 'sw-bf-empty';
            empty.setAttribute('data-i18n', 'sw-bf-empty');
            empty.textContent = tx('sw-bf-empty', 'No blue force data');
            list.appendChild(empty);
            return;
        }
        var total = units.length;
        var shown = Math.min(total, SW_BF_CAP);
        if (countEl) {
            countEl.removeAttribute('hidden');
            var cntNum = document.getElementById('sw-bf-count-num');
            if (cntNum) cntNum.textContent = total;
        }
        var dash = tx('sw-value-none', '—');
        for (var i = 0; i < shown; i++) {
            var entry = units[i];
            var li    = document.createElement('li');
            li.className = 'sw-bf-row';
            var name = (entry.label    != null && entry.label    !== '') ? String(entry.label)
                     : (entry.name_ar  != null && entry.name_ar  !== '') ? String(entry.name_ar)
                     : (entry.unit_uid != null && entry.unit_uid !== '') ? String(entry.unit_uid)
                     : dash;
            var ech  = (entry.echelon  != null && entry.echelon  !== '') ? String(entry.echelon) : dash;
            var role = (entry.role     != null && entry.role     !== '') ? String(entry.role)    : dash;
            var nameEl = document.createElement('span'); nameEl.className = 'sw-bf-name'; nameEl.textContent = name;
            var echEl  = document.createElement('span'); echEl.className  = 'sw-bf-ech';  echEl.textContent  = ech;
            var sepEl  = document.createElement('span'); sepEl.className  = 'sw-bf-sep';  sepEl.textContent  = ' · ';
            var roleEl = document.createElement('span'); roleEl.className = 'sw-bf-role'; roleEl.textContent = role;
            var metaEl = document.createElement('span'); metaEl.className = 'sw-bf-meta';
            metaEl.appendChild(echEl); metaEl.appendChild(sepEl); metaEl.appendChild(roleEl);
            var appEl = document.createElement('span'); appEl.className = 'sw-bf-app';
            if (entry.appear != null) {
                var appLblEl = document.createElement('span');
                appLblEl.className = 'sw-bf-app-lbl';
                appLblEl.setAttribute('data-i18n', 'sw-bf-appear-label');
                appLblEl.textContent = tx('sw-bf-appear-label', 'step');
                var appValEl = document.createElement('span');
                appValEl.className = 'sw-bf-app-val';
                appValEl.textContent = ' ' + String(entry.appear);
                appEl.appendChild(appLblEl); appEl.appendChild(appValEl);
            } else {
                appEl.textContent = dash;
            }
            li.appendChild(nameEl); li.appendChild(metaEl); li.appendChild(appEl);
            list.appendChild(li);
        }
        if (moreEl && total > SW_BF_CAP) {
            moreEl.removeAttribute('hidden');
            var moreNum = document.getElementById('sw-bf-more-num');
            if (moreNum) moreNum.textContent = '+' + (total - SW_BF_CAP);
        }
    }

    // ── PR-64: Red Force Snapshot Card ───────────────────────────────────
    // Read-only red unit list. Reads window.RmoozScenario.scenario.red_units only.
    // Capped at SW_RF_CAP rows; overflow shown as "+N more". No network, no mutation, no persistence.
    var SW_RF_CAP = 10;

    function paintRedForceCard() {
        var countEl = document.getElementById('sw-rf-count');
        var list    = document.getElementById('sw-rf-list');
        var moreEl  = document.getElementById('sw-rf-more');
        if (!list) return;
        var sc    = getScenario();
        var units = (sc && Array.isArray(sc.red_units) && sc.red_units.length > 0)
                    ? sc.red_units : null;
        list.innerHTML = '';
        if (moreEl)  { moreEl.setAttribute('hidden', ''); }
        if (countEl) { countEl.setAttribute('hidden', ''); }
        if (!units) {
            var empty = document.createElement('li');
            empty.className = 'sw-rf-empty';
            empty.setAttribute('data-i18n', 'sw-rf-empty');
            empty.textContent = tx('sw-rf-empty', 'No red force data');
            list.appendChild(empty);
            return;
        }
        var total = units.length;
        var shown = Math.min(total, SW_RF_CAP);
        if (countEl) {
            countEl.removeAttribute('hidden');
            var cntNum = document.getElementById('sw-rf-count-num');
            if (cntNum) cntNum.textContent = total;
        }
        var dash = tx('sw-value-none', '—');
        for (var i = 0; i < shown; i++) {
            var entry = units[i];
            var li    = document.createElement('li');
            li.className = 'sw-rf-row';
            // Name: label → uid → name_ar → dash
            var name = (entry.label   != null && entry.label   !== '') ? String(entry.label)
                     : (entry.uid     != null && entry.uid     !== '') ? String(entry.uid)
                     : (entry.name_ar != null && entry.name_ar !== '') ? String(entry.name_ar)
                     : dash;
            var ech  = (entry.echelon != null && entry.echelon !== '') ? String(entry.echelon) : dash;
            var role = (entry.role    != null && entry.role    !== '') ? String(entry.role)    : dash;
            var nameEl  = document.createElement('span');
            nameEl.className = 'sw-rf-name';
            nameEl.textContent = name;
            var echEl   = document.createElement('span');
            echEl.className  = 'sw-rf-ech';
            echEl.textContent = ech;
            var sepEl   = document.createElement('span');
            sepEl.className  = 'sw-rf-sep';
            sepEl.textContent = ' · ';
            var roleEl  = document.createElement('span');
            roleEl.className = 'sw-rf-role';
            roleEl.textContent = role;
            var metaEl  = document.createElement('span');
            metaEl.className = 'sw-rf-meta';
            metaEl.appendChild(echEl);
            metaEl.appendChild(sepEl);
            metaEl.appendChild(roleEl);
            // Appear: data-i18n label + numeric value (split-span for auto-translation)
            var appEl = document.createElement('span');
            appEl.className = 'sw-rf-app';
            if (entry.appear != null) {
                var appLblEl = document.createElement('span');
                appLblEl.className = 'sw-rf-app-lbl';
                appLblEl.setAttribute('data-i18n', 'sw-rf-appear-label');
                appLblEl.textContent = tx('sw-rf-appear-label', 'step');
                var appValEl = document.createElement('span');
                appValEl.className = 'sw-rf-app-val';
                appValEl.textContent = ' ' + String(entry.appear);
                appEl.appendChild(appLblEl);
                appEl.appendChild(appValEl);
            } else {
                appEl.textContent = dash;
            }
            li.appendChild(nameEl);
            li.appendChild(metaEl);
            li.appendChild(appEl);
            list.appendChild(li);
        }
        if (moreEl && total > SW_RF_CAP) {
            moreEl.removeAttribute('hidden');
            var moreNum = document.getElementById('sw-rf-more-num');
            if (moreNum) moreNum.textContent = '+' + (total - SW_RF_CAP);
        }
    }

    // ── PR-52 / PR-53: Live Walkthrough Card ────────────────────────────
    // Read-only operational briefing card for the current active step.
    // Reads window.RmoozScenario via PR-49 accessors only.
    // No network calls. No mutation. No persistence.

    // PR-53: preview step index — null means "show live step".
    // Only lives in module memory. Never written to storage.
    var previewStepIndex = null;

    // PR-57: last known live step index — detects live step advances for flash indicator.
    // -1 = "not yet seen" (suppresses flash on the very first refresh call).
    // Module-private. Never on window. Never in storage.
    var lastLiveStepIndex = -1;

    // PR-58: timestamp of the most recent live step change (Date object or null).
    // Set on the first refresh() and on every subsequent step advance.
    // Module-private. Never on window. Never in storage.
    var lastLiveStepUpdatedAt = null;

    // PR-221: Dry-run preview navigation state — preview-only, module-private.
    // Stores the current Wargame 3 adapted fixture and step ref so UI nav buttons
    // can call buildScenarioStepPreview without re-running the full adapter.
    // SAFETY: _drpPreviewSource is the deep-frozen fixture from adaptWargame3ToFixture.
    //         It is NOT a live scenario object. It is NOT stored in localStorage.
    //         It does NOT affect window.RmoozScenario.stepIndex.
    //         It is cleared/overwritten on each new paintWargame3Preview() call.
    //         _drpPreviewMode "amber" hides the nav bar (AMBER RIDGE has no multi-step nav here).
    var _drpPreviewSource  = null;   // deep-frozen W3 fixture | null
    var _drpPreviewStepRef = null;   // "W3-STEP-NN" | null
    var _drpPreviewMode    = 'amber'; // "amber" | "wargame3"
    // PR-270: preview-local COA review memory — IIFE-scoped only.
    // Shape: { stepRef: string, record: operatorSelectionDryRunRecord } | null.
    // NOT on window. NOT in localStorage/sessionStorage/IndexedDB/cookie/URL.
    // Cleared on page unload (IIFE variable). Cleared on step navigation.
    // Only set by _handleW3CoaReviewClick. Only read by _getW3CoaReviewRecordForStep.
    var _w3CoaReviewRecord = null;
    // PR-275: module-private current W3 scenario review session snapshot.
    // Shape: wargame3_review_session object (from buildWargame3ScenarioReviewSessionState) | null.
    // IIFE-scoped only. NOT on window. NOT in localStorage/sessionStorage/IndexedDB/cookie/URL.
    // Set by _updateW3ScenarioReviewSession. Cleared by _clearW3ScenarioReviewSession.
    // Synced on every W3 _paintToDOM call, COA review click, and clear review click.
    var _w3ScenarioReviewSession = null;

    // PR-277: W3 Scenario Workflow State — module-private, IIFE-scoped only.
    // Higher-level than _w3ScenarioReviewSession. Summarises the active W3 workflow
    // across the current in-memory app session.
    // Shape: wargame3_scenario_review_workflow object | null.
    // NOT on window. NOT in localStorage/sessionStorage/IndexedDB/cookie/URL.
    // Set by _updateW3ScenarioWorkflowStateFromCurrentSession.
    // Cleared by _clearW3ScenarioWorkflowState.
    // Synced after every _updateW3ScenarioReviewSession call.
    // No expectedResult. previewComplete always false. No storage. No backend.
    var _w3ScenarioWorkflowState = null;

    // PR-281: current external catalog entry for the preview panel.
    // Set by setExternalScenarioPreviewEntry. Read by paintExternalScenarioPreviewEntry.
    // Module-private. Never stored. Never fetched. Never committed.
    var _extPreviewEntry = null;

    // PR-282: current capped catalog subset for the selector panel.
    // Set by setExternalScenarioCatalogSubset. Read by paintExternalScenarioCatalogSelector.
    // Module-private. Never stored. Never fetched. Never committed.
    var _externalScenarioCatalogSubset = null;

    // PR-60: popover open/closed — module-private, never on window, never in storage.
    var healthPopoverOpen = false;

    // PR-136: Playback timer state — module-private, never exported, never stored.
    // Advances window.RmoozScenario.stepIndex only. No animation. No backend.
    var _swPlayIntervalId = null;   // setInterval handle; null when stopped
    var _swIsPlaying      = false;  // boolean playback status
    var _swPlaySpeedMs    = 2000;   // interval delay in ms; default: Normal (2 s/step)

    // PR-138: Overlay state — module-private, never exported, never stored.
    // L.layerGroup only. No window.units mutation. No engagement arcs. No backend.
    var _swScenarioOverlay = null;  // L.layerGroup handle; null when not attached
    var _swOverlayEnabled  = false; // boolean toggle state

    // PR-242: Wargame 3 read-only preview overlay — module-private, never exported as data.
    // One private L.layerGroup only. Never touches live unit markers, lines, or scenario layers.
    // Cleared before each new paint. Safe to call clear repeatedly.
    var _w3PreviewLayer = null;  // L.layerGroup handle; null when not attached

    // PR-286L: Live operator workflow state — module-private, IIFE-scoped only.
    // First production-oriented live decision selection layer.
    // Keyed by scenarioId + "::step-" + stepIndex.
    // NOT persisted. NOT on window. NOT in localStorage/sessionStorage/IndexedDB/cookie/URL.
    // Selection.readOnly:true, liveMutationAllowed:false, backendCommitAllowed:false.
    // Does NOT mutate window.RmoozScenario.scenario. Does NOT auto-advance stepIndex.
    // Does NOT call /api/sim/commit. Does NOT execute combat/effects. No Gate 7.
    var _liveOperatorWorkflowState = {
        selections: {},   // key → live_operator_decision_selection record
        events:     [],   // chronological event log (capped at _LIVE_OP_EVENT_CAP)
        stepStatus: {}    // PR-287L: key → live_step_status record (pending default)
    };
    var _LIVE_OP_EVENT_CAP     = 64;
    var _liveDecisionCardWired = false;

    // PR-287L: Live Step Status Baseline.
    // Per-step operator status annotation for the live scenario workflow.
    // Default status is "pending" (no stored record). Status is an annotation
    // ONLY — it never mutates the scenario, never advances stepIndex, never
    // commits / applies / executes anything, never touches the backend.
    var _LIVE_STEP_STATUS_VALUES  = ['pending', 'decided', 'skipped', 'blocked'];
    var _LIVE_STEP_STATUS_DEFAULT = 'pending';

    // PR-142: Decision Package preview state — module-private, never exported, never stored.
    // No backend. No fetch. No Blob. No localStorage. No mutation of window.units / window.lines.
    // Read-only fixture data only. No combat fields. No auto-adjudication. Rejects non-read_only.
    var _swDecisionPackage          = null;  // normalised manifest object or null
    var _swDecisionSteps            = [];    // normalised step objects array
    var _swDecisionLoadError        = null;  // error string or null
    var _swDecisionImportValidation = null;  // PR-151: last import validation summary or null
    var _swDiagnosticsOpen          = false; // PR-157: diagnostics panel toggle state

    // ── PR-71: Step Phase Summary Card ───────────────────────────────────
    // Read-only. Reads displayed step via previewStepIndex (module closure).
    // No mutation, no backend, no storage, no event log.

    function paintStepSummaryCard() {
        var stepEl  = document.getElementById('sw-sps-step-val');
        var timeEl  = document.getElementById('sw-sps-time-val');
        var phaseEl = document.getElementById('sw-sps-phase-val');
        var dpEl    = document.getElementById('sw-sps-dp-val');
        var objEl   = document.getElementById('sw-sps-obj-val');
        var modeEl  = document.getElementById('sw-sps-mode-badge');
        if (!stepEl) return;

        var sc      = getScenario();
        var liveIdx = getActiveStepIndex();
        var dispIdx = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var step    = steps[dispIdx] || null;
        var dash    = tx('sw-value-none', '—');

        function setVal(el, val) {
            if (!el) return;
            var v = (val !== null && val !== undefined && val !== '') ? String(val) : null;
            el.removeAttribute('data-i18n');
            el.textContent = (v !== null) ? v : dash;
        }

        // Mode badge — set data-i18n so DOM scanner auto-translates on language change
        if (modeEl) {
            var isPreview = (previewStepIndex !== null);
            var modeKey   = isPreview ? 'sw-wt-badge-preview' : 'sw-wt-badge-live';
            modeEl.setAttribute('data-mode',  isPreview ? 'preview' : 'live');
            modeEl.setAttribute('data-i18n',  modeKey);
            modeEl.textContent = tx(modeKey, isPreview ? 'Preview' : 'Live step');
        }

        if (!sc || !step) {
            setVal(stepEl, null); setVal(timeEl, null);
            setVal(phaseEl, null); setVal(dpEl, null); setVal(objEl, null);
            return;
        }

        setVal(stepEl, dispIdx + 1);
        setVal(timeEl,  step.time_label);
        setVal(phaseEl, step.phase);
        setVal(dpEl,    step.decision_point_baseline);
        setVal(objEl,   step.objective_status_baseline);
    }

    // ── PR-72: Step Narrative Snapshot Card ──────────────────────────────
    // Read-only. Reads narrative_en_fallback from displayed step (live or preview).
    // No mutation, no backend, no storage, no event log.

    function paintNarrativeCard() {
        var bodyEl    = document.getElementById('sw-sn-body');
        var stepNumEl = document.getElementById('sw-sn-step-num');
        var modeEl    = document.getElementById('sw-sn-mode-badge');
        if (!bodyEl) return;

        var sc      = getScenario();
        var liveIdx = getActiveStepIndex();
        var dispIdx = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var step    = steps[dispIdx] || null;
        var dash    = tx('sw-value-none', '—');

        // Mode badge — set data-i18n so DOM scanner auto-translates on language change
        if (modeEl) {
            var isPreview = (previewStepIndex !== null);
            var modeKey   = isPreview ? 'sw-wt-badge-preview' : 'sw-wt-badge-live';
            modeEl.setAttribute('data-mode', isPreview ? 'preview' : 'live');
            modeEl.setAttribute('data-i18n', modeKey);
            modeEl.textContent = tx(modeKey, isPreview ? 'Preview' : 'Live step');
        }

        // Step number + time — the "Step/الخطوة" word is a sibling data-i18n span
        // handled automatically by the DOM scanner; only the number part is set here.
        if (stepNumEl) {
            stepNumEl.removeAttribute('data-i18n');
            if (step) {
                var timePart = step.time_label ? (' · ' + step.time_label) : '';
                stepNumEl.textContent = (dispIdx + 1) + timePart;
            } else {
                stepNumEl.textContent = dash;
            }
        }

        // Narrative body — source data may remain English per spec
        bodyEl.removeAttribute('data-i18n');
        var narr = step ? (step.narrative_en_fallback || null) : null;
        bodyEl.textContent = (narr !== null && narr !== '') ? narr : dash;
    }

    // ── PR-74: Step Decision Point Snapshot Card ─────────────────────────
    // Read-only. Reads step/time/decision_point/objective from displayed step.
    // No mutation, no backend, no storage, no event log.

    function paintDecisionPointCard() {
        var stepEl  = document.getElementById('sw-dp-step-val');
        var timeEl  = document.getElementById('sw-dp-time-val');
        var dpEl    = document.getElementById('sw-dp-dp-val');
        var objEl   = document.getElementById('sw-dp-obj-val');
        var modeEl  = document.getElementById('sw-dp-mode-badge');
        if (!stepEl) return;

        var sc      = getScenario();
        var liveIdx = getActiveStepIndex();
        var dispIdx = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var step    = steps[dispIdx] || null;
        var dash    = tx('sw-value-none', '—');

        function setVal(el, val) {
            if (!el) return;
            var v = (val !== null && val !== undefined && val !== '') ? String(val) : null;
            el.removeAttribute('data-i18n');
            el.textContent = (v !== null) ? v : dash;
        }

        // Mode badge — set data-i18n so DOM scanner auto-translates on language change
        if (modeEl) {
            var isPreview = (previewStepIndex !== null);
            var modeKey   = isPreview ? 'sw-wt-badge-preview' : 'sw-wt-badge-live';
            modeEl.setAttribute('data-mode', isPreview ? 'preview' : 'live');
            modeEl.setAttribute('data-i18n', modeKey);
            modeEl.textContent = tx(modeKey, isPreview ? 'Preview' : 'Live step');
        }

        if (!sc || !step) {
            setVal(stepEl, null); setVal(timeEl, null);
            setVal(dpEl, null);   setVal(objEl, null);
            return;
        }

        setVal(stepEl, dispIdx + 1);
        setVal(timeEl, step.time_label);
        setVal(dpEl,   step.decision_point_baseline);
        setVal(objEl,  step.objective_status_baseline);
    }

    // ── PR-73: Step Force Ratio Snapshot Card ────────────────────────────
    // Read-only. Reads force/EW/phase_line/objective from displayed step.
    // No mutation, no backend, no storage, no event log.

    function paintForceRatioCard() {
        var ratioEl = document.getElementById('sw-fr-ratio-val');
        var ewEl    = document.getElementById('sw-fr-ew-val');
        var plEl    = document.getElementById('sw-fr-pl-val');
        var objEl   = document.getElementById('sw-fr-obj-val');
        var modeEl  = document.getElementById('sw-fr-mode-badge');
        if (!ratioEl) return;

        var sc      = getScenario();
        var liveIdx = getActiveStepIndex();
        var dispIdx = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var step    = steps[dispIdx] || null;
        var dash    = tx('sw-value-none', '—');

        function setVal(el, val) {
            if (!el) return;
            var v = (val !== null && val !== undefined && val !== '') ? String(val) : null;
            el.removeAttribute('data-i18n');
            el.textContent = (v !== null) ? v : dash;
        }

        // Mode badge — set data-i18n so DOM scanner auto-translates on language change
        if (modeEl) {
            var isPreview = (previewStepIndex !== null);
            var modeKey   = isPreview ? 'sw-wt-badge-preview' : 'sw-wt-badge-live';
            modeEl.setAttribute('data-mode', isPreview ? 'preview' : 'live');
            modeEl.setAttribute('data-i18n', modeKey);
            modeEl.textContent = tx(modeKey, isPreview ? 'Preview' : 'Live step');
        }

        if (!sc || !step) {
            setVal(ratioEl, null); setVal(ewEl, null);
            setVal(plEl, null);   setVal(objEl, null);
            return;
        }

        setVal(ratioEl, step.force_ratio_baseline);
        setVal(ewEl,    step.ew_effect_baseline);
        // phase_line_km_baseline: 0 is a valid value — check null/undefined only
        var plRaw = step.phase_line_km_baseline;
        setVal(plEl, (plRaw !== null && plRaw !== undefined) ? plRaw : null);
        setVal(objEl, step.objective_status_baseline);
    }

    function paintWalkthroughCard() {
        var sc      = getScenario();
        var liveIdx = getActiveStepIndex();
        var steps   = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var dash    = tx('sw-value-none', '—');

        // PR-53: use preview index when set, else fall back to live
        var dispIdx = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
        var step    = steps[dispIdx] || null;

        function setField(id, val, fallbackKey) {
            var el = document.getElementById(id);
            if (!el) return;
            var v = (val !== null && val !== undefined && val !== '') ? String(val) : null;
            if (v !== null) {
                el.removeAttribute('data-i18n');
                el.textContent = v;
            } else {
                var fk = fallbackKey || 'sw-value-none';
                el.setAttribute('data-i18n', fk);
                el.textContent = tx(fk, dash);
            }
        }

        // Composite step counter: "N / M"
        var stepVal = steps.length ? (dispIdx + 1) + ' / ' + steps.length : null;

        // phase_line_km_baseline can be 0 (valid) — extract explicitly
        var plVal = (step && step.phase_line_km_baseline !== null &&
                     step.phase_line_km_baseline !== undefined)
            ? step.phase_line_km_baseline : null;

        setField('sw-wt-scenario', sc && (sc.scenario_label || sc.name),  'sw-value-not-loaded');
        setField('sw-wt-step',     stepVal,                                'sw-value-none');
        setField('sw-wt-time',     step && step.time_label,                'sw-value-none');
        setField('sw-wt-phase',    step && step.phase,                     'sw-value-none');
        setField('sw-wt-status',   step && step.objective_status_baseline, 'sw-value-none');
        setField('sw-wt-decision', step && step.decision_point_baseline,   'sw-value-none');
        setField('sw-wt-narrative',step && step.narrative_en_fallback,     'sw-value-none');
        setField('sw-wt-force',    step && step.force_ratio_baseline,      'sw-value-none');
        setField('sw-wt-phaseline',plVal,                                  'sw-value-none');
        setField('sw-wt-objective',sc && sc.obj && sc.obj.name,            'sw-value-none');

        // PR-53: update step badge (live / preview tone)
        var badge = document.getElementById('sw-wt-step-badge');
        if (badge) {
            var isPreview = (previewStepIndex !== null);
            badge.setAttribute('data-tone', isPreview ? 'preview' : 'live');
            var bKey = isPreview ? 'sw-wt-badge-preview' : 'sw-wt-badge-live';
            badge.setAttribute('data-i18n', bKey);
            badge.textContent = tx(bKey, isPreview ? 'Preview' : 'Live step');
        }

        // PR-53: show/hide preview notice
        var notice = document.getElementById('sw-wt-preview-notice');
        if (notice) {
            if (previewStepIndex !== null) {
                notice.removeAttribute('hidden');
                var nKey = 'sw-wt-preview-notice';
                notice.setAttribute('data-i18n', nKey);
                notice.textContent = tx(nKey, 'Preview only. This does not change the active scenario step.');
            } else {
                notice.setAttribute('hidden', '');
            }
        }

        // PR-53: update prev / next / reset disabled states
        var btnPrev  = document.getElementById('sw-wt-ctrl-prev');
        var btnNext  = document.getElementById('sw-wt-ctrl-next');
        var btnReset = document.getElementById('sw-wt-ctrl-reset');
        if (btnPrev)  btnPrev.disabled  = (!steps.length || dispIdx <= 0);
        if (btnNext)  btnNext.disabled  = (!steps.length || dispIdx >= steps.length - 1);
        if (btnReset) btnReset.disabled = (previewStepIndex === null);

        // PR-54: source/status row — live vs preview indicator + step indices
        var isPreviewMode = (previewStepIndex !== null);
        var srcRow    = document.getElementById('sw-wt-source-row');
        var srcStatus = document.getElementById('sw-wt-source-status');
        var srcIdx    = document.getElementById('sw-wt-source-idx');
        if (srcRow)    srcRow.setAttribute('data-preview', isPreviewMode ? 'true' : 'false');
        if (srcStatus) {
            var sKey = isPreviewMode ? 'sw-wt-source-preview' : 'sw-wt-source-live';
            srcStatus.setAttribute('data-i18n', sKey);
            srcStatus.textContent = tx(sKey, isPreviewMode ? 'Displaying preview step only' : 'Displaying live adjudicator step');
        }
        if (srcIdx) {
            var liveLbl = tx('sw-wt-source-live-lbl', 'Live');
            var dispLbl = tx('sw-wt-source-disp-lbl', 'Displayed');
            srcIdx.textContent = liveLbl + ': ' + (liveIdx + 1) + ' / ' + dispLbl + ': ' + (dispIdx + 1);
        }

        // PR-55: live vs preview comparison strip
        var cmpStrip = document.getElementById('sw-wt-cmp-strip');
        if (cmpStrip) {
            if (!isPreviewMode) {
                cmpStrip.setAttribute('hidden', '');
            } else {
                cmpStrip.removeAttribute('hidden');
                // Refresh i18n labels every time strip shows — covers language switch
                var cmpLabelMap = [
                    ['sw-wt-cmp-title',        'Live → Preview'],
                    ['sw-wt-cmp-field-step',   'Step'],
                    ['sw-wt-cmp-field-time',   'Time'],
                    ['sw-wt-cmp-field-phase',  'Phase'],
                    ['sw-wt-cmp-field-status', 'Objective status'],
                ];
                cmpLabelMap.forEach(function(pair) {
                    var el = cmpStrip.querySelector('[data-i18n="' + pair[0] + '"]');
                    if (el) el.textContent = tx(pair[0], pair[1]);
                });
                // Comparison values — live step data vs displayed preview step data
                var liveStep = steps[liveIdx] || null;
                var cmpDash  = tx('sw-value-none', '—');
                var cmpVal = function(v) {
                    return (v !== null && v !== undefined && v !== '') ? String(v) : cmpDash;
                };
                var elLiveStep   = document.getElementById('sw-wt-cmp-live-step');
                var elPrevStep   = document.getElementById('sw-wt-cmp-prev-step');
                var elLiveTime   = document.getElementById('sw-wt-cmp-live-time');
                var elPrevTime   = document.getElementById('sw-wt-cmp-prev-time');
                var elLivePhase  = document.getElementById('sw-wt-cmp-live-phase');
                var elPrevPhase  = document.getElementById('sw-wt-cmp-prev-phase');
                var elLiveStat   = document.getElementById('sw-wt-cmp-live-status');
                var elPrevStat   = document.getElementById('sw-wt-cmp-prev-status');
                if (elLiveStep)  elLiveStep.textContent  = cmpVal(liveIdx + 1);
                if (elPrevStep)  elPrevStep.textContent  = cmpVal(dispIdx + 1);
                if (elLiveTime)  elLiveTime.textContent  = cmpVal(liveStep && liveStep.time_label);
                if (elPrevTime)  elPrevTime.textContent  = cmpVal(step && step.time_label);
                if (elLivePhase) elLivePhase.textContent = cmpVal(liveStep && liveStep.phase);
                if (elPrevPhase) elPrevPhase.textContent = cmpVal(step && step.phase);
                if (elLiveStat)  elLiveStat.textContent  = cmpVal(liveStep && liveStep.objective_status_baseline);
                if (elPrevStat)  elPrevStat.textContent  = cmpVal(step && step.objective_status_baseline);
            }
        }
        // PR-59: update data health badge
        paintHealthBadge(sc, dispIdx);
        // PR-60: repaint popover rows if open (no-op when closed)
        paintHealthPopover(sc, dispIdx);
        // PR-58: update live step change timestamp display
        paintStepTimestamp();
        // PR-71: update Step Phase Summary Card with same displayed step
        paintStepSummaryCard();
        // PR-72: update Step Narrative Snapshot Card with same displayed step
        paintNarrativeCard();
        // PR-73: update Step Force Ratio Snapshot Card with same displayed step
        paintForceRatioCard();
        // PR-74: update Step Decision Point Snapshot Card with same displayed step
        paintDecisionPointCard();
    }

    // PR-59: inspect already-loaded scenario for minimum required walkthrough fields.
    // Returns 'healthy', 'partial', or 'none'. Read-only — never mutates anything.
    function checkScenarioHealth(sc, dispIdx) {
        if (!sc) return 'none';
        var step = (sc.steps && sc.steps[dispIdx]) || null;
        var checks = [
            !!(sc.scenario_label || sc.name),                    // 1. label / name
            !!(sc.steps && sc.steps.length > 0),                 // 2. steps array non-empty
            !!step,                                               // 3. displayed step exists
            !!(sc.obj && sc.obj.name),                           // 4. objective name
            !!(step && step.phase),                              // 5. phase on displayed step
            !!(step && step.time_label),                         // 6. time label on displayed step
        ];
        var pass = checks.filter(Boolean).length;
        if (pass === checks.length) return 'healthy';
        if (pass > 0)              return 'partial';
        return 'none';
    }

    // PR-59: paint the Data Health badge from the result of checkScenarioHealth().
    // Called from paintWalkthroughCard() so language switch + preview changes refresh it.
    function paintHealthBadge(sc, dispIdx) {
        var badge = document.getElementById('sw-wt-health-badge');
        if (!badge) return;
        var state = checkScenarioHealth(sc, dispIdx);
        badge.setAttribute('data-state', state);
        var keyMap = {
            'healthy': 'sw-wt-health-healthy',
            'partial': 'sw-wt-health-partial',
            'none':    'sw-wt-health-none',
        };
        var fallMap = {
            'healthy': 'Healthy',
            'partial': 'Partial',
            'none':    'No scenario',
        };
        var key = keyMap[state];
        badge.setAttribute('data-i18n', key);
        badge.textContent = tx(key, fallMap[state]);
    }

    // PR-60: repaint the health details popover list rows.
    // Called from paintWalkthroughCard() on every paint — no-op when popover is closed.
    // Never mutates scenario data. Never calls backend. Never writes storage.
    function paintHealthPopover(sc, dispIdx) {
        var popover = document.getElementById('sw-wt-health-popover');
        if (!popover || !healthPopoverOpen) return;
        var step = (sc && Array.isArray(sc.steps)) ? (sc.steps[dispIdx] || null) : null;
        var checks = [
            { key: 'sw-wt-hpop-check-label',      pass: !!(sc && (sc.scenario_label || sc.name)) },
            { key: 'sw-wt-hpop-check-steps',      pass: !!(sc && sc.steps && sc.steps.length > 0) },
            { key: 'sw-wt-hpop-check-step',       pass: !!step },
            { key: 'sw-wt-hpop-check-objective',  pass: !!(sc && sc.obj && sc.obj.name) },
            { key: 'sw-wt-hpop-check-phase',      pass: !!(step && step.phase) },
            { key: 'sw-wt-hpop-check-time',       pass: !!(step && step.time_label) },
        ];
        var fallLabels = [
            'Scenario name', 'Steps array', 'Displayed step',
            'Objective name', 'Step phase', 'Step time label',
        ];
        var list = document.getElementById('sw-wt-health-pop-list');
        if (!list) return;
        list.innerHTML = '';
        checks.forEach(function(c, i) {
            var li   = document.createElement('li');
            li.className = 'sw-wt-hpop-row';
            var lbl  = document.createElement('span');
            lbl.className = 'sw-wt-hpop-label';
            lbl.textContent = tx(c.key, fallLabels[i]);
            var stat = document.createElement('span');
            stat.className = 'sw-wt-hpop-status';
            stat.setAttribute('data-status', c.pass ? 'ok' : 'missing');
            var sKey = c.pass ? 'sw-wt-hpop-ok' : 'sw-wt-hpop-missing';
            stat.textContent = tx(sKey, c.pass ? 'OK' : 'Missing');
            li.appendChild(lbl);
            li.appendChild(stat);
            list.appendChild(li);
        });
        // Refresh "read-only" note on language switch
        var note = popover.querySelector('[data-i18n="sw-wt-health-pop-note"]');
        if (note) note.textContent = tx('sw-wt-health-pop-note', 'Read-only · Does not change scenario data.');
    }

    // PR-60: wire the Data Health details button (called once in init).
    function initHealthPopover() {
        var btn = document.getElementById('sw-wt-health-btn');
        if (!btn) return;
        btn.addEventListener('click', function() {
            healthPopoverOpen = !healthPopoverOpen;
            var popover = document.getElementById('sw-wt-health-popover');
            if (popover) {
                if (healthPopoverOpen) { popover.removeAttribute('hidden'); }
                else                   { popover.setAttribute('hidden', ''); }
            }
            btn.setAttribute('aria-expanded', healthPopoverOpen ? 'true' : 'false');
            // Repaint rows immediately on open
            if (healthPopoverOpen) {
                var sc      = getScenario();
                var liveIdx = getActiveStepIndex();
                var dIdx    = (previewStepIndex !== null) ? previewStepIndex : liveIdx;
                paintHealthPopover(sc, dIdx);
            }
        });
    }

    // PR-58: paint "Live step updated: HH:MM:SS".
    // Called from paintWalkthroughCard() so language switches also refresh the label text.
    // Only visible after the first refresh(); hidden before any step is seen.
    function paintStepTimestamp() {
        var el    = document.getElementById('sw-wt-step-ts');
        var valEl = document.getElementById('sw-wt-step-ts-val');
        if (!el) return;
        if (!lastLiveStepUpdatedAt) {
            el.setAttribute('hidden', '');
            return;
        }
        el.removeAttribute('hidden');
        var lblEl = el.querySelector('[data-i18n="sw-wt-updated-label"]');
        if (lblEl) {
            lblEl.textContent = tx('sw-wt-updated-label', 'Live step updated:');
        }
        if (valEl) {
            var d  = lastLiveStepUpdatedAt;
            var hh = String(d.getHours()).padStart(2, '0');
            var mm = String(d.getMinutes()).padStart(2, '0');
            var ss = String(d.getSeconds()).padStart(2, '0');
            valEl.textContent = hh + ':' + mm + ':' + ss;
        }
    }

    // PR-53: wire up prev / next / reset click handlers (called once in init)
    function initWalkthroughControls() {
        var btnPrev  = document.getElementById('sw-wt-ctrl-prev');
        var btnNext  = document.getElementById('sw-wt-ctrl-next');
        var btnReset = document.getElementById('sw-wt-ctrl-reset');

        if (btnPrev) {
            btnPrev.addEventListener('click', function () {
                var sc    = getScenario();
                var steps = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
                var cur   = (previewStepIndex !== null) ? previewStepIndex : getActiveStepIndex();
                if (steps.length && cur > 0) {
                    previewStepIndex = cur - 1;
                    paintWalkthroughCard();
                }
            });
        }
        if (btnNext) {
            btnNext.addEventListener('click', function () {
                var sc    = getScenario();
                var steps = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
                var cur   = (previewStepIndex !== null) ? previewStepIndex : getActiveStepIndex();
                if (steps.length && cur < steps.length - 1) {
                    previewStepIndex = cur + 1;
                    paintWalkthroughCard();
                }
            });
        }
        if (btnReset) {
            btnReset.addEventListener('click', function () {
                previewStepIndex = null;
                paintWalkthroughCard();
            });
        }
    }

    // ── Language change ──────────────────────────────────────────────────
    (function chainLang() {
        var prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { paintSafety(safetyChip && safetyChip.getAttribute('data-state')); } catch (_) {}
            try { paintService(); }              catch (_) {}
            try { paintLastDecision(); }         catch (_) {}
            try { paintScenarioOverview(); }     catch (_) {}
            try { paintPhaseTimeline(); }        catch (_) {}
            try { paintIntentCard(); }           catch (_) {}
            try { paintProposalCard(); }         catch (_) {}
            try { paintProposalActions(); }      catch (_) {}
            try { paintDecisionSummary(); }      catch (_) {}
            try { paintMetaCard(); }             catch (_) {}  // PR-68
            try { paintObjectiveCard(); }        catch (_) {}  // PR-61
            try { paintBlsCard(); }              catch (_) {}  // PR-62
            try { paintForceSummaryStrip(); }    catch (_) {}  // PR-65
            try { paintBlueForceCard(); }        catch (_) {}  // BFC
            try { paintRedForceCard(); }         catch (_) {}  // PR-64
            try { paintWalkthroughCard(); }      catch (_) {}
            try { paintBriefingCard(); }         catch (_) {}  // PR-132
            try { paintStepNavigator(); }        catch (_) {}  // PR-132
            try { paintActionsCard(); }          catch (_) {}  // PR-132
            try { paintPlayButton(); }           catch (_) {}  // PR-136
            if (typeof prev === 'function') prev(lang);
        };
    })();

    // ── PR-126: Language repaint robustness ──────────────────────────────
    // app.js directly replaces window.onLanguageChange without chaining,
    // which silently breaks the chainLang() handler above and prevents all
    // live-wired scenario workspace fields from repainting on language
    // switch. The chainLang() block is intentionally preserved (it will
    // resume working if app.js is ever fixed), but we add a secondary
    // trigger here that is immune to the chain-break:
    //
    //   • applyLanguage() in i18n.js dispatches 'rmooz:language-changed'
    //     AFTER calling window.onLanguageChange — always, regardless of
    //     what that handler contains.
    //   • This listener fires synchronously in the same call stack, so
    //     window.t() already reflects the new language when paint functions
    //     call tx() here.
    //   • No new data sources, no scenario mutation, no backend, no
    //     storage. All paint functions are pure DOM rebuilds from live
    //     scenario data already in memory.
    document.addEventListener('rmooz:language-changed', function () {
        try { paintSafety(safetyChip && safetyChip.getAttribute('data-state')); } catch (_) {}
        try { paintService(); }              catch (_) {}
        try { paintLastDecision(); }         catch (_) {}
        try { paintScenarioOverview(); }     catch (_) {}
        try { paintPhaseTimeline(); }        catch (_) {}
        try { paintIntentCard(); }           catch (_) {}
        try { paintProposalCard(); }         catch (_) {}
        try { paintProposalActions(); }      catch (_) {}
        try { paintDecisionSummary(); }      catch (_) {}
        try { paintMetaCard(); }             catch (_) {}
        try { paintObjectiveCard(); }        catch (_) {}
        try { paintBlsCard(); }              catch (_) {}
        try { paintForceSummaryStrip(); }    catch (_) {}
        try { paintBlueForceCard(); }        catch (_) {}
        try { paintRedForceCard(); }         catch (_) {}
        try { paintWalkthroughCard(); }      catch (_) {}
        try { paintBriefingCard(); }             catch (_) {}  // PR-132
        try { paintStepNavigator(); }            catch (_) {}  // PR-132
        try { paintActionsCard(); }              catch (_) {}  // PR-132
        try { paintPlayButton(); }               catch (_) {}  // PR-136
        try { paintOverlayToggleButton(); }      catch (_) {}  // PR-138
        try { paintDecisionPackageCards(); }     catch (_) {}  // PR-142
    });

    // ── Init ─────────────────────────────────────────────────────────────
    function init() {
        paintSafety('notRun');
        paintService();
        paintLastDecision();
        paintScenarioOverview();
        paintPhaseTimeline();
        paintIntentCard();
        paintProposalCard();
        paintProposalActions();
        paintDecisionSummary();
        paintMetaCard();             // PR-68
        paintObjectiveCard();        // PR-61
        paintBlsCard();              // PR-62
        paintForceSummaryStrip();    // PR-65
        paintBlueForceCard();        // BFC
        paintRedForceCard();         // PR-64
        paintUnitComposition();      // PR-287E: Scenario Unit Composition readout
        paintStepAttrition();        // PR-287F: step-aware Red Attrition readout
        paintStepActivity();         // PR-287G: step-aware Engagement Tempo readout
        paintWalkthroughCard();
        paintBriefingCard();         // PR-132
        paintStepNavigator();        // PR-132
        paintActionsCard();          // PR-132
        paintPlayButton();           // PR-136
        paintOverlayToggleButton();   // PR-138
        paintDecisionPackageCards(); // PR-142
        initProposalActions();
        initWalkthroughControls();   // PR-53: wire step-nav buttons (once)
        initHealthPopover();         // PR-60: wire Data Health details button (once)
        initStepNavigator();                  // PR-132: wire global step-nav buttons (once)
        initDecisionPackageSampleLoader();    // PR-143: wire sample load/clear buttons (once)
        initDecisionPackageJsonImporter();   // PR-148: wire JSON file import button (once)
        initImportDiagnosticsToggle();       // PR-157: wire diagnostics toggle button (once)
        _initDrpNavButtons();               // PR-221: wire preview nav prev/next buttons (once)
        _initW3LoadButton();                // PR-232: wire Wargame 3 preview load button (once)
        // PR-287L0: Removed auto-paint of AMBER RIDGE / W3 dry-run on workspace init.
        // User direction: production workspace must focus on the live scenario.
        // Dry-run functions remain available via window.AppShellScenarioWorkspace
        // for developer/console use only. Was: paintDryRunPreview();  (PR-212)
        // Also clear any lingering W3 preview map overlay from a previous session.
        if (typeof clearWargame3ReadOnlyMapOverlay === 'function') {
            try { clearWargame3ReadOnlyMapOverlay(); } catch (e) { /* no-op */ }
        }
        _initExtPreviewSection();            // PR-281: external scenario preview hook (inject once)
        initExternalScenarioCatalogSelector(); // PR-282: wire catalog selector change listener
        initLegacySummaryToggle();           // PR-287C: wire collapsed legacy summary toggle
        initSecondaryCardsToggle();          // PR-287L2: wire collapsed secondary tools toggle
        initLiveScenarioImport();            // PR-286L0: wire Live Scenario Import button
        initLiveScenarioFolderImport();      // PR-286L1: wire Scenario Folder Intake
        initSourceAdvancedImportsToggle();   // PR-286L1A: wire collapsed advanced-imports toggle
        paintLiveScenarioHeader();           // PR-287L2: paint live scenario header on first render
        logSystem('elog-evt-sw-rendered', 'Scenario workspace panel rendered');
    }

    // ── PR-221: Dry-run preview navigation helpers ────────────────────────────
    // _updateDrpNavButtons: shows/hides the nav bar and sets prev/next disabled state.
    // _initDrpNavButtons:   wires click handlers once on DOMContentLoaded.
    // SAFETY: No map calls. No window.units access. No window.RmoozScenario write.
    //         No storage. No fetch. No backend. No apply/commit/confirm path.

    function _updateDrpNavButtons() {
        var nav     = document.getElementById('sw-drp-nav');
        var prevBtn = document.getElementById('sw-drp-prev-btn');
        var nextBtn = document.getElementById('sw-drp-next-btn');
        var info    = document.getElementById('sw-drp-nav-step-info');
        // PR-229: nav hint — shown when nav is visible
        var hint    = document.getElementById('sw-drp-nav-hint');
        // PR-236: bottom nav mirror
        var botNav     = document.getElementById('sw-drp-bottom-nav');
        var botPrevBtn = document.getElementById('sw-drp-prev-bottom-btn');
        var botNextBtn = document.getElementById('sw-drp-next-bottom-btn');
        var botInfo    = document.getElementById('sw-drp-bottom-step-counter');
        // PR-239: jump control
        var jumpRow    = document.getElementById('sw-drp-jump-row');
        var jumpSelect = document.getElementById('sw-drp-jump-select');
        if (!nav) { return; }

        if (_drpPreviewMode !== 'wargame3' || !_drpPreviewSource || !_drpPreviewStepRef) {
            nav.hidden = true;
            if (botNav)    { botNav.hidden = true; }
            if (hint)      { hint.hidden = true; }
            if (jumpRow)   { jumpRow.hidden = true; }
            if (prevBtn)   { prevBtn.disabled = true; }
            if (nextBtn)   { nextBtn.disabled = true; }
            if (info)      { info.textContent = ''; }
            if (botPrevBtn){ botPrevBtn.disabled = true; }
            if (botNextBtn){ botNextBtn.disabled = true; }
            if (botInfo)   { botInfo.textContent = ''; }
            return;
        }

        var m      = _drpPreviewStepRef.match(/W3-STEP-(\d+)/i);
        var curIdx = m ? parseInt(m[1], 10) : 0;
        var total  = (_drpPreviewSource.steps && _drpPreviewSource.steps.length) ? _drpPreviewSource.steps.length : 17;
        var atStart = (curIdx === 0);
        var atEnd   = (curIdx >= total - 1);
        var label   = tx('sw-drp-nav-step', 'Step') + ' ' + (curIdx + 1) + ' / ' + total;

        nav.hidden = false;
        if (botNav) { botNav.hidden = false; }
        // PR-229: show hint and apply i18n text if locale changed since last paint
        if (hint) {
            hint.hidden = false;
            hint.textContent = tx('sw-drp-nav-hint', 'Preview only — live step unchanged');
        }
        // PR-239: rebuild jump options and show row
        if (jumpRow)   { jumpRow.hidden = false; }
        if (jumpSelect) { _buildW3JumpOptions(jumpSelect, _drpPreviewSource, _drpPreviewStepRef); }
        if (prevBtn)   { prevBtn.disabled = atStart; }
        if (nextBtn)   { nextBtn.disabled = atEnd; }
        if (info)      { info.textContent = label; }
        if (botPrevBtn){ botPrevBtn.disabled = atStart; }
        if (botNextBtn){ botNextBtn.disabled = atEnd; }
        if (botInfo)   { botInfo.textContent = label; }
    }

    function _initDrpNavButtons() {
        var prevBtn    = document.getElementById('sw-drp-prev-btn');
        var nextBtn    = document.getElementById('sw-drp-next-btn');
        // PR-236: bottom nav mirror buttons
        var botPrevBtn = document.getElementById('sw-drp-prev-bottom-btn');
        var botNextBtn = document.getElementById('sw-drp-next-bottom-btn');

        // Shared handlers — preview-only, no state mutation
        function doPrev() {
            // Guard: preview-only — does NOT mutate window.RmoozScenario.stepIndex
            if (_drpPreviewMode !== 'wargame3' || !_drpPreviewSource || !_drpPreviewStepRef) { return; }
            var m      = _drpPreviewStepRef.match(/W3-STEP-(\d+)/i);
            var curIdx = m ? parseInt(m[1], 10) : 0;
            var next   = Math.max(0, curIdx - 1);
            var nn     = next < 10 ? ('0' + next) : String(next);
            var nextRef = 'W3-STEP-' + nn;
            var res = buildScenarioStepPreview(_drpPreviewSource, nextRef);
            if (res.passed && res.preview) {
                // PR-270: clear preview-local COA review memory when the step changes.
                // Keeps memory if boundary step repeats (e.g. prev at step 0 stays on step 0).
                if (nextRef !== _drpPreviewStepRef) { _clearW3CoaReviewRecord(); }
                paintDryRunPreview(res.preview);    // override path — no state change inside
                _drpPreviewStepRef = nextRef;       // update preview-only step tracker
                _updateDrpNavButtons();
            }
        }

        function doNext() {
            // Guard: preview-only — does NOT mutate window.RmoozScenario.stepIndex
            if (_drpPreviewMode !== 'wargame3' || !_drpPreviewSource || !_drpPreviewStepRef) { return; }
            var m      = _drpPreviewStepRef.match(/W3-STEP-(\d+)/i);
            var curIdx = m ? parseInt(m[1], 10) : 0;
            var total  = (_drpPreviewSource.steps && _drpPreviewSource.steps.length) ? _drpPreviewSource.steps.length : 17;
            var next   = Math.min(total - 1, curIdx + 1);
            var nn     = next < 10 ? ('0' + next) : String(next);
            var nextRef = 'W3-STEP-' + nn;
            var res = buildScenarioStepPreview(_drpPreviewSource, nextRef);
            if (res.passed && res.preview) {
                // PR-270: clear preview-local COA review memory when the step changes.
                if (nextRef !== _drpPreviewStepRef) { _clearW3CoaReviewRecord(); }
                paintDryRunPreview(res.preview);    // override path — no state change inside
                _drpPreviewStepRef = nextRef;       // update preview-only step tracker
                _updateDrpNavButtons();
            }
        }

        if (prevBtn)    { prevBtn.addEventListener('click', doPrev); }
        if (nextBtn)    { nextBtn.addEventListener('click', doNext); }
        if (botPrevBtn) { botPrevBtn.addEventListener('click', doPrev); }
        if (botNextBtn) { botNextBtn.addEventListener('click', doNext); }

        // PR-239: jump select — preview-only direct step jump
        var jumpSelect = document.getElementById('sw-drp-jump-select');
        if (jumpSelect) {
            jumpSelect.addEventListener('change', function () {
                var targetRef = this.value;
                // Guard: preview-only — does NOT mutate window.RmoozScenario.stepIndex
                if (!targetRef || _drpPreviewMode !== 'wargame3' || !_drpPreviewSource) { return; }
                var res = buildScenarioStepPreview(_drpPreviewSource, targetRef);
                if (res.passed && res.preview) {
                    // PR-270: clear preview-local COA review memory when jumping to another step.
                    if (targetRef !== _drpPreviewStepRef) { _clearW3CoaReviewRecord(); }
                    paintDryRunPreview(res.preview);
                    _drpPreviewStepRef = targetRef;
                    _updateDrpNavButtons();
                }
            });
        }
    }

    // ── PR-232: Wargame 3 preview load button ─────────────────────────────────
    // Wires the #sw-w3-load-btn button once on DOMContentLoaded.
    // On click: calls buildW3PreviewFromLoadedScenario() then paintWargame3Preview().
    // SAFETY: Display-only shortcut.
    //         Does NOT mutate window.RmoozScenario.stepIndex.
    //         Does NOT mutate window.RmoozScenario.scenario.
    //         Does NOT touch window.units, window.lines, or the map.
    //         No fetch. No storage. No backend. No apply/commit/confirm. No Gate 7.

    function _initW3LoadButton() {
        var btn      = document.getElementById('sw-w3-load-btn');
        var statusEl = document.getElementById('sw-w3-load-status');
        if (!btn) { return; }

        btn.addEventListener('click', function () {
            // Clear any previous error message
            if (statusEl) { statusEl.hidden = true; statusEl.textContent = ''; }

            // Build a safe read-only deep-copy of the loaded W3 scenario
            var built = buildW3PreviewFromLoadedScenario();

            if (!built.passed) {
                // Show blocked reasons as read-only status text — no mutation
                if (statusEl) {
                    var reasons = built.blockedReasons.join('; ');
                    statusEl.textContent = tx('sw-w3-load-error', 'Preview failed: ') + reasons;
                    statusEl.hidden = false;
                }
                return;
            }

            // Paint preview from step 0 — display-only, no state mutation
            paintWargame3Preview(built.w3json, 'W3-STEP-00');
        });
    }

    // ── PR-239: Jump select option builder — W3 preview only ─────────────────
    // Rebuilds <option> list from source.steps. Text-only. No mutation. No map.
    function _buildW3JumpOptions(select, source, curRef) {
        select.innerHTML = '';
        var steps = (source && source.steps) ? source.steps : [];
        var total = steps.length;
        for (var i = 0; i < total; i++) {
            var step   = steps[i];
            var stepId = (step && typeof step.step_id === 'string') ? step.step_id
                       : ('W3-STEP-' + (i < 10 ? '0' + i : String(i)));
            var title  = (step && typeof step.title === 'string') ? step.title : '';
            var opt    = document.createElement('option');
            opt.value  = stepId;
            var label  = tx('sw-drp-nav-step', 'Step') + ' ' + (i + 1) + ' / ' + total + ' — ' + stepId;
            if (title) {
                var clipped = title.length > 28 ? title.slice(0, 25) + '…' : title;
                label += ' — ' + clipped;
            }
            opt.textContent = label;
            if (curRef && stepId.toLowerCase() === curRef.toLowerCase()) { opt.selected = true; }
            select.appendChild(opt);
        }
    }

    // ── PR-222: Dry-run preview display helpers ───────────────────────────────

    // Map effect type string → readable label for the dry-run preview panel.
    // Text only — no map, no Leaflet, no window.units, no window.RmoozScenario.
    function _drpEffectTypeLabel(type) {
        if (type === 'friendly_action')      { return tx('sw-drp-effect-friendly', 'Friendly action'); }
        if (type === 'enemy_counter_action') { return tx('sw-drp-effect-counter',  'Enemy response');  }
        if (type === 'engagement_arc')       { return tx('sw-drp-effect-arc',      'Engagement');      }
        return String(type).replace(/_/g, ' ');
    }

    // Group and format dry-run preview warnings by code for readability.
    // Groups repeated codes (e.g., MISSING_FIELD ×2, UNKNOWN_UNIT ×3).
    // Text only — no DOM writes, no map, no window.units, no window.RmoozScenario.
    function _drpFormatWarnings(warnsArr) {
        if (!warnsArr || !warnsArr.length) { return tx('sw-drp-none', 'None'); }
        var groups    = {};
        var codeOrder = [];
        for (var wi = 0; wi < warnsArr.length; wi++) {
            var w    = warnsArr[wi];
            var code = (w && typeof w.code === 'string' && w.code) ? w.code : 'INFO';
            var msg  = (w && typeof w.message === 'string') ? w.message
                     : (typeof w === 'string') ? w : String(w);
            if (!groups[code]) { groups[code] = []; codeOrder.push(code); }
            groups[code].push(msg);
        }
        var lines = [];
        for (var ci = 0; ci < codeOrder.length; ci++) {
            var c   = codeOrder[ci];
            var arr = groups[c];
            if (arr.length === 1) {
                lines.push('[' + c + '] ' + arr[0]);
            } else {
                lines.push('[' + c + '] ×' + arr.length + ':');
                for (var mi = 0; mi < arr.length; mi++) {
                    lines.push('  · ' + arr[mi]);
                }
            }
        }
        return lines.join('\n');
    }

    // ── PR-240: Preview Event Log — W3 only ─────────────────────────────────
    // Derives all rows from the existing preview object + warnsArr.
    // NOT a real simulation journal. NOT connected to server/AI/storage/journal.
    // No fetch. No mutation. No map. Text display only.
    function _buildW3EventLog(p, warnsArr) {
        var block = document.getElementById('sw-drp-event-log');
        var body  = document.getElementById('sw-drp-evl-body');
        if (!block || !body) { return; }

        body.innerHTML = '';

        function addRow(timeVal, typeCode, srcVal, msgVal) {
            var row = document.createElement('div');
            row.className = 'sw-evl-row sw-evl-row--' + typeCode;
            var cols = [
                { cls: 'sw-evl-time', val: timeVal || '—' },
                { cls: 'sw-evl-type', val: typeCode        },
                { cls: 'sw-evl-src',  val: srcVal  || '—' },
                { cls: 'sw-evl-msg',  val: msgVal  || '—' },
            ];
            for (var ci = 0; ci < cols.length; ci++) {
                var el = document.createElement('span');
                el.className = cols[ci].cls;
                el.textContent = cols[ci].val;
                row.appendChild(el);
            }
            body.appendChild(row);
        }

        // Time token — phase prefix from step title (e.g. "PRE-H" from "PRE-H — P0")
        var stepId    = p.activeStepId || '—';
        var timeToken = stepId;
        if (typeof p.stepSummary === 'string' && p.stepSummary) {
            var dashIdx   = p.stepSummary.indexOf(' — ');
            var rawToken  = dashIdx > -1 ? p.stepSummary.slice(0, dashIdx).trim() : p.stepSummary.trim();
            timeToken = rawToken.length > 12 ? rawToken.slice(0, 11) + '…' : rawToken;
        }

        // 1. STEP row
        var stepMsg = (typeof p.stepSummary === 'string' && p.stepSummary) ? p.stepSummary
                    : (typeof p.situation === 'string' && p.situation)
                        ? p.situation.split('\n')[0].slice(0, 80) : '—';
        addRow(timeToken, 'STEP', 'PREVIEW', stepMsg);

        // 2. OBJECTIVE row — only when objectiveStatusBaseline is set
        var obs = (typeof p.objectiveStatusBaseline === 'string' && p.objectiveStatusBaseline)
            ? p.objectiveStatusBaseline : null;
        if (obs) {
            var objDesc = (p.objectivesReferenced && p.objectivesReferenced.length > 0)
                ? p.objectivesReferenced[0].description : '';
            addRow(timeToken, 'OBJ', 'PREVIEW', obs + (objDesc ? ' — ' + objDesc : ''));
        }

        // 3. UNIT rows — up to 4 key units
        var units = (p.unitsReferenced && p.unitsReferenced.length > 0) ? p.unitsReferenced : [];
        var MAX_U = 4;
        for (var ui = 0; ui < Math.min(units.length, MAX_U); ui++) {
            var u     = units[ui];
            var uSide = (u.side || '').toUpperCase() || 'PREVIEW';
            addRow(timeToken, 'UNIT', uSide, u.displayName + (u.role ? ' / ' + u.role : ''));
        }
        if (units.length > MAX_U) {
            addRow(timeToken, 'UNIT', 'PREVIEW',
                '+' + (units.length - MAX_U) + ' ' + tx('sw-drp-sum-more', 'more'));
        }

        // 4. EFFECT row — count only; no descriptions to avoid confusion with live effects
        var effCount = (p.proposedVisualEffects && p.proposedVisualEffects.length) || 0;
        if (effCount > 0) {
            addRow(timeToken, 'EFFECT', 'PREVIEW',
                tx('sw-evl-effects-msg', 'Text-only preview effects available') + ': ' + effCount);
        }

        // 5. WARNING rows — source-gap and other preview warnings from warnsArr
        var warns = warnsArr || [];
        for (var wi = 0; wi < warns.length; wi++) {
            var w    = warns[wi];
            var wMsg = (w && typeof w.message === 'string') ? w.message
                     : (typeof w === 'string') ? w : String(w);
            addRow(timeToken, 'WARN', 'PREVIEW', wMsg);
        }

        block.hidden = false;
    }

    // ── PR-264: Read-Only Decision Options Painter — W3 only ─────────────────
    // Reads p.decisionOptions (array or absent/null). Calls
    // buildWargame3DecisionOptionsPreviewData to validate and filter.
    // Renders read-only COA cards inside #sw-drp-decision-options-body.
    // FORBIDDEN: apply, selection, mutation, map writes, fetch, storage.
    // If no valid options: section stays hidden — no fake option, no noise.
    // No Gate 7. No apply/execute/commit/confirm controls. Text display only.
    function _paintW3DecisionOptions(p) {
        var section = document.getElementById('sw-drp-decision-options');
        var body    = document.getElementById('sw-drp-decision-options-body');
        var countEl = document.getElementById('sw-drp-decision-options-count');
        if (!section || !body) { return; }

        // Wrap decisionOptions in a step proxy for the adapter
        var stepProxy = {
            decisionOptions: (p && Array.isArray(p.decisionOptions))
                ? p.decisionOptions : null
        };
        var data = buildWargame3DecisionOptionsPreviewData(stepProxy);

        if (!data.hasOptions) {
            section.hidden = true;
            body.innerHTML = '';
            if (countEl) { countEl.textContent = ''; }
            return;
        }

        body.innerHTML = '';

        for (var i = 0; i < data.options.length; i++) {
            var opt  = data.options[i];
            var card = document.createElement('div');
            card.className = 'sw-drp-do-card';

            // Read-only badge
            var badge = document.createElement('span');
            badge.className = 'sw-drp-do-readonly-badge';
            badge.textContent = tx('sw-drp-decision-options-readonly', 'Read-only COA option');
            card.appendChild(badge);

            // Display label (e.g. "COA 1 of 3 — Strike north")
            var labelEl = document.createElement('div');
            labelEl.className = 'sw-drp-do-label';
            labelEl.textContent = opt.displayLabel || opt.label;
            card.appendChild(labelEl);

            // Description
            if (opt.description) {
                var descEl = document.createElement('div');
                descEl.className = 'sw-drp-do-desc';
                descEl.textContent = opt.description;
                card.appendChild(descEl);
            }

            // Intent
            if (opt.intent) {
                var intentRow = document.createElement('div');
                intentRow.className = 'sw-drp-do-meta-row';
                var intentLbl = document.createElement('span');
                intentLbl.className = 'sw-drp-do-meta-key';
                intentLbl.textContent = tx('sw-drp-decision-options-intent', 'Intent') + ':';
                var intentVal = document.createElement('span');
                intentVal.className = 'sw-drp-do-meta-val';
                intentVal.textContent = opt.intent;
                intentRow.appendChild(intentLbl);
                intentRow.appendChild(intentVal);
                card.appendChild(intentRow);
            }

            // Affected units count
            if (opt.affectedUnitsCount > 0) {
                var auRow = document.createElement('div');
                auRow.className = 'sw-drp-do-meta-row';
                var auLbl = document.createElement('span');
                auLbl.className = 'sw-drp-do-meta-key';
                auLbl.textContent = tx('sw-drp-decision-options-affected-units', 'Affected units') + ':';
                var auVal = document.createElement('span');
                auVal.className = 'sw-drp-do-meta-val';
                auVal.textContent = String(opt.affectedUnitsCount);
                auRow.appendChild(auLbl);
                auRow.appendChild(auVal);
                card.appendChild(auRow);
            }

            // Anticipated effects count
            if (opt.expectedEffectsCount > 0) {
                var eeRow = document.createElement('div');
                eeRow.className = 'sw-drp-do-meta-row';
                var eeLbl = document.createElement('span');
                eeLbl.className = 'sw-drp-do-meta-key';
                eeLbl.textContent = tx('sw-drp-decision-options-anticipated-effects', 'Anticipated effects') + ':';
                var eeVal = document.createElement('span');
                eeVal.className = 'sw-drp-do-meta-val';
                eeVal.textContent = String(opt.expectedEffectsCount);
                eeRow.appendChild(eeLbl);
                eeRow.appendChild(eeVal);
                card.appendChild(eeRow);
            }

            // Risks count
            if (opt.risksCount > 0) {
                var rRow = document.createElement('div');
                rRow.className = 'sw-drp-do-meta-row';
                var rLbl = document.createElement('span');
                rLbl.className = 'sw-drp-do-meta-key';
                rLbl.textContent = tx('sw-drp-decision-options-risks', 'Risks') + ':';
                var rVal = document.createElement('span');
                rVal.className = 'sw-drp-do-meta-val';
                rVal.textContent = String(opt.risksCount);
                rRow.appendChild(rLbl);
                rRow.appendChild(rVal);
                card.appendChild(rRow);
            }

            // Priority (optional)
            if (opt.priority !== null && opt.priority !== undefined) {
                var pRow = document.createElement('div');
                pRow.className = 'sw-drp-do-meta-row';
                var pLbl = document.createElement('span');
                pLbl.className = 'sw-drp-do-meta-key';
                pLbl.textContent = tx('sw-drp-decision-options-priority', 'Priority') + ':';
                var pVal = document.createElement('span');
                pVal.className = 'sw-drp-do-meta-val';
                pVal.textContent = String(opt.priority);
                pRow.appendChild(pLbl);
                pRow.appendChild(pVal);
                card.appendChild(pRow);
            }

            // PR-268: "Review COA" in-app dry-run review button.
            // Only rendered for valid options (this loop covers data.options only —
            // blocked options are excluded by buildWargame3DecisionOptionsPreviewData).
            // FORBIDDEN label words: Select / Confirm / Apply / Execute / Commit /
            //   Approve / Go Live / Run / Start / Launch / Gate 7.
            var reviewBtn = document.createElement('button');
            reviewBtn.type = 'button';
            reviewBtn.className = 'sw-drp-coa-review-btn';
            reviewBtn.setAttribute('data-w3-coa-review', opt.id);
            reviewBtn.textContent = tx('sw-drp-coa-review-btn', 'Review COA');
            // IIFE closure captures p and opt.id — no shared mutable reference.
            // Listener is on the button element; discarded when body.innerHTML='' re-renders.
            (function (capturedP, capturedOptId) {
                reviewBtn.addEventListener('click', function () {
                    _handleW3CoaReviewClick(capturedP, capturedOptId);
                });
            }(p, opt.id));
            card.appendChild(reviewBtn);

            body.appendChild(card);
        }

        // Blocked notice — informational only; no retry, no mutation
        if (data.blockedOptionCount > 0) {
            var blockedEl = document.createElement('div');
            blockedEl.className = 'sw-drp-do-blocked-notice';
            blockedEl.textContent = tx('sw-drp-decision-options-blocked',
                'Some options were blocked by safety validation.');
            body.appendChild(blockedEl);
        }

        if (countEl) {
            countEl.textContent = '(' + data.validOptionCount + ')';
        }

        section.hidden = false;
    }

    // ── PR-270: Preview-Local COA Review Memory Helpers ─────────────────────
    // Pure in-memory helpers. No DOM mutation. No storage. No backend.
    // No window mutation. No map. No fetch. No Gate 7.

    // _clearW3CoaReviewRecord():
    //   Sets module-private _w3CoaReviewRecord to null.
    //   Called by nav handlers when the target step differs from the stored step.
    //   Called by _handleW3CoaReviewClick failure path to clean up stale state.
    //   Does NOT touch DOM — next _paintToDOM call sees null and hides the section.
    function _clearW3CoaReviewRecord() {
        _w3CoaReviewRecord = null;
    }

    // _getW3CoaReviewRecordForStep(stepRef):
    //   Returns the stored dry-run record if stepRef matches and record is valid.
    //   Returns null if: no memory, stepRef mismatch, or safety check fails.
    //   On safety failure, clears memory (defensive — avoids stale corrupt data).
    function _getW3CoaReviewRecordForStep(stepRef) {
        if (!_w3CoaReviewRecord) { return null; }
        if (_w3CoaReviewRecord.stepRef !== stepRef) { return null; }
        var check = isWargame3OperatorSelectionDryRunRecordSafe(_w3CoaReviewRecord.record);
        if (!check.passed) {
            _w3CoaReviewRecord = null;
            return null;
        }
        return _w3CoaReviewRecord.record;
    }

    // ── PR-275: W3 Scenario Review Session Sync Helpers ──────────────────────
    // Pure in-memory helpers. No DOM mutation. No storage. No backend.
    // No window mutation. No map. No fetch. No Gate 7.
    // These keep _w3ScenarioReviewSession in sync with the current preview.

    // _clearW3ScenarioReviewSession():
    //   Sets _w3ScenarioReviewSession to null.
    //   Called when a non-W3 step is painted or the review session becomes invalid.
    function _clearW3ScenarioReviewSession() {
        _w3ScenarioReviewSession = null;
    }

    // _updateW3ScenarioReviewSession(preview, options?):
    //   Calls buildWargame3ScenarioReviewSessionState(preview, options).
    //   On success: stores the session in _w3ScenarioReviewSession.
    //   On failure: clears _w3ScenarioReviewSession to null.
    //   Returns the { passed, session, blockedReasons, warnings } result.
    //   Does NOT mutate preview. Does NOT mutate options.overlay.
    //   Does NOT create expectedResult. Does NOT set previewComplete.
    //   Does NOT create selectedDecision outside dry-run record.
    //   Does NOT paint map. Does NOT use storage or backend.
    function _updateW3ScenarioReviewSession(preview, options) {
        var result = buildWargame3ScenarioReviewSessionState(preview, options || {});
        if (result.passed && result.session) {
            _w3ScenarioReviewSession = result.session;
        } else {
            _w3ScenarioReviewSession = null;
        }
        return result;
    }

    // getW3ScenarioReviewSession():
    //   Public accessor. Returns a shallow copy of the current session snapshot.
    //   If no session is active, returns { passed: false, session: null, ... }.
    //   Never returns a direct mutable reference to the internal session.
    //   No DOM. No storage. No backend. No mutation.
    function getW3ScenarioReviewSession() {
        if (!_w3ScenarioReviewSession) {
            return { passed: false, session: null,
                     blockedReasons: ['no active W3 scenario review session'], warnings: [] };
        }
        // Shallow copy — do not expose the internal reference directly
        var _copy = {};
        var _keys = Object.keys(_w3ScenarioReviewSession);
        for (var _ki = 0; _ki < _keys.length; _ki++) {
            _copy[_keys[_ki]] = _w3ScenarioReviewSession[_keys[_ki]];
        }
        return { passed: true, session: _copy, blockedReasons: [], warnings: [] };
    }

    // ── PR-277: W3 Scenario Workflow State Helpers ───────────────────────────
    // Pure in-memory helpers. No DOM mutation. No storage. No backend. No network.
    // No window mutation. No map. No fetch. No Gate 7. No AI. No simulation.
    // No journal. No expectedResult. previewComplete always false.
    // No apply/execute/commit. No selectedDecision outside dry-run record.

    // buildW3ScenarioWorkflowStateFromSession(session, previousState, options?)
    //   Pure builder. Derives a workflow state object from a valid W3 review session.
    //   Does NOT mutate session, previousState, or any preview object.
    //   Does NOT call getWargame3ExpectedResultForReview.
    //   Does NOT attach expectedResult. Does NOT set previewComplete.
    //   Does NOT write storage. Does NOT call backend. Does NOT paint map.
    //   Returns { passed, workflow: object|null, blockedReasons[], warnings[] }.
    function buildW3ScenarioWorkflowStateFromSession(session, previousState, options) {
        var blockedReasons = []; var warnings = [];

        // Rule 1: session must be a non-null, non-array object
        if (!session || typeof session !== 'object' || Array.isArray(session)) {
            blockedReasons.push('session must be a non-null, non-array object');
            return { passed: false, workflow: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 2: session must be a valid wargame3_review_session
        if (session.sessionType !== 'wargame3_review_session') {
            blockedReasons.push('session.sessionType must be wargame3_review_session');
            return { passed: false, workflow: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 3: session must have a valid W3 stepRef
        var stepRef = (typeof session.stepRef === 'string' && session.stepRef)
                      ? session.stepRef : '';
        if (!stepRef || !/^W3-STEP-/i.test(stepRef)) {
            blockedReasons.push('session.stepRef must match W3-STEP-*');
            return { passed: false, workflow: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // ── Carry over visitedStepRefs from previousState (immutably) ─────────
        var prevVisited = [];
        if (previousState &&
            typeof previousState === 'object' &&
            !Array.isArray(previousState) &&
            Array.isArray(previousState.visitedStepRefs)) {
            // Copy — do NOT mutate previousState
            for (var vi = 0; vi < previousState.visitedStepRefs.length; vi++) {
                prevVisited.push(previousState.visitedStepRefs[vi]);
            }
        }
        // Append current step if not already present
        var visitedStepRefs = prevVisited;
        if (visitedStepRefs.indexOf(stepRef) === -1) {
            visitedStepRefs = visitedStepRefs.concat([stepRef]);
        }
        var visitedCount = visitedStepRefs.length;

        // ── availableDecisionSteps — carry over + add if decisionOptionsAvailable ─
        var prevDecSteps = [];
        if (previousState &&
            typeof previousState === 'object' &&
            !Array.isArray(previousState) &&
            Array.isArray(previousState.availableDecisionSteps)) {
            for (var di = 0; di < previousState.availableDecisionSteps.length; di++) {
                prevDecSteps.push(previousState.availableDecisionSteps[di]);
            }
        }
        var availableDecisionSteps = prevDecSteps;
        if (session.decisionOptionsAvailable === true) {
            if (availableDecisionSteps.indexOf(stepRef) === -1) {
                availableDecisionSteps = availableDecisionSteps.concat([stepRef]);
            }
        }
        var availableDecisionStepCount = availableDecisionSteps.length;

        // ── decisionReview — from session.reviewedCoa ──────────────────────────
        var reviewedCoa = (session.reviewedCoa &&
                           typeof session.reviewedCoa === 'object' &&
                           !Array.isArray(session.reviewedCoa))
                          ? session.reviewedCoa : {};
        var drActive    = reviewedCoa.available === true;
        var decisionReview = {
            active:    drActive,
            stepRef:   drActive ? stepRef : null,
            optionRef: drActive ? (typeof reviewedCoa.optionRef === 'string'
                                   ? reviewedCoa.optionRef : null) : null,
            label:     drActive ? (typeof reviewedCoa.label === 'string'
                                   ? reviewedCoa.label : null) : null,
            status:    drActive ? (typeof reviewedCoa.status === 'string'
                                   ? reviewedCoa.status : null) : null
        };

        // ── workflowFlags ──────────────────────────────────────────────────────
        // hasNavigated: true when more than one unique step has been visited
        var workflowFlags = {
            hasLoadedScenario:      true,
            hasNavigated:           visitedCount > 1,
            hasDecisionOptions:     availableDecisionStepCount > 0,
            hasActiveReview:        drActive,
            expectedResultAttached: false,   // LOCKED — PR-277: must remain false
            previewComplete:        false    // LOCKED — PR-277: must remain false
        };

        // ── Assemble workflow object ───────────────────────────────────────────
        var workflow = {
            workflowType:         'wargame3_scenario_review_workflow',
            source:               'dry_run_preview',
            readOnly:             true,
            dryRunOnly:           true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,

            scenarioId:   (typeof session.scenarioId   === 'string' && session.scenarioId)
                          ? session.scenarioId : null,
            scenarioName: (typeof session.scenarioName === 'string' && session.scenarioName)
                          ? session.scenarioName : null,

            activeStepRef:   stepRef,
            activeStepIndex: (typeof session.stepIndex  === 'number') ? session.stepIndex  : null,
            totalSteps:      (typeof session.totalSteps === 'number') ? session.totalSteps : null,

            visitedStepRefs: visitedStepRefs,
            visitedCount:    visitedCount,

            decisionReview: decisionReview,

            availableDecisionSteps:     availableDecisionSteps,
            availableDecisionStepCount: availableDecisionStepCount,

            workflowFlags: workflowFlags,

            lastUpdatedStepRef: stepRef
        };

        return { passed: true, workflow: workflow,
                 blockedReasons: [], warnings: warnings };
    }

    // _updateW3ScenarioWorkflowStateFromCurrentSession():
    //   Reads the current _w3ScenarioReviewSession via getW3ScenarioReviewSession().
    //   On valid session: builds a new workflow state and stores it.
    //   On invalid/missing session: clears workflow state to null.
    //   Returns { passed, workflow, blockedReasons, warnings }.
    //   No UI. No storage. No backend. No DOM. No map.
    function _updateW3ScenarioWorkflowStateFromCurrentSession() {
        var sr = getW3ScenarioReviewSession();
        if (!sr.passed || !sr.session) {
            _w3ScenarioWorkflowState = null;
            return { passed: false, workflow: null,
                     blockedReasons: ['no valid W3 review session'], warnings: [] };
        }
        var result = buildW3ScenarioWorkflowStateFromSession(
            sr.session, _w3ScenarioWorkflowState);
        if (result.passed && result.workflow) {
            // Store a frozen copy — prevent external callers from mutating the stored state
            _w3ScenarioWorkflowState = result.workflow;
        } else {
            _w3ScenarioWorkflowState = null;
        }
        return result;
    }

    // getW3ScenarioWorkflowState():
    //   Public accessor. Returns a shallow copy of the current workflow state.
    //   If none, returns { passed: false, workflow: null, ... }.
    //   Never returns a direct mutable reference to the internal state.
    //   No DOM. No storage. No backend. No mutation.
    function getW3ScenarioWorkflowState() {
        if (!_w3ScenarioWorkflowState) {
            return { passed: false, workflow: null,
                     blockedReasons: ['no active W3 scenario workflow state'], warnings: [] };
        }
        // Shallow copy of top-level fields — do not expose the internal reference
        var _copy = {};
        var _keys = Object.keys(_w3ScenarioWorkflowState);
        for (var _ki = 0; _ki < _keys.length; _ki++) {
            _copy[_keys[_ki]] = _w3ScenarioWorkflowState[_keys[_ki]];
        }
        return { passed: true, workflow: _copy, blockedReasons: [], warnings: [] };
    }

    // _clearW3ScenarioWorkflowState():
    //   Sets _w3ScenarioWorkflowState to null.
    //   No DOM. No storage. No backend.
    function _clearW3ScenarioWorkflowState() {
        _w3ScenarioWorkflowState = null;
    }

    // ── PR-268: COA Dry-Run Review Click Handler — W3 only ───────────────────
    // Called when the user clicks "Review COA" on a valid W3 decision option card.
    // Builds an in-memory dry-run selection record; attaches it only to the current
    // in-memory preview object (p); repaints the Selection Review card (PR-267).
    // FORBIDDEN: mutation of wargame3 source JSON, window.RmoozScenario.scenario,
    //            window.RmoozScenario.stepIndex, window.units, window.lines.
    // FORBIDDEN: fetch, localStorage, sessionStorage, IndexedDB, backend.
    // FORBIDDEN: Gate 7, apply, execute, commit, confirm, approve, go-live controls.
    // FORBIDDEN: creating selectedDecision outside the dry-run record.
    // FORBIDDEN: creating expectedResult or changing previewComplete.
    // No map writes. No Leaflet calls. No marker mutation.
    // On nav (prev/next/jump), paintDryRunPreview receives a fresh p without this
    // field → Selection Review auto-clears without any extra cleanup code.
    function _handleW3CoaReviewClick(p, optionId) {
        if (!p || typeof optionId !== 'string' || !optionId) { return; }

        // Build a shallow step proxy from the preview object.
        // Only stepRef and decisionOptions are needed by the builder.
        // Does NOT mutate p.decisionOptions or the wargame3 source JSON.
        var stepProxy = {
            stepRef:         typeof p.activeStepId === 'string' ? p.activeStepId : '',
            decisionOptions: Array.isArray(p.decisionOptions)   ? p.decisionOptions : []
        };

        var result = buildWargame3OperatorSelectionDryRunRecord(stepProxy, optionId, {
            status:     'draft',
            operatorId: null,
            createdAt:  null
        });

        if (!result.passed || !result.record) {
            // Builder rejected — do not render unsafe data; clear memory + review section.
            _clearW3CoaReviewRecord();   // PR-270: discard any stale stored record
            var sec = document.getElementById('sw-drp-selection-review');
            if (sec) { sec.hidden = true; }
            return;
        }

        // PR-270: persist record in preview-local memory for this step.
        // Survives same-step repaints; clears on navigation to another step.
        // IIFE-scoped only — NOT localStorage, NOT sessionStorage, NOT window, NOT storage.
        var _clickStepRef = typeof p.activeStepId === 'string' ? p.activeStepId : '';
        _w3CoaReviewRecord = _clickStepRef ? { stepRef: _clickStepRef, record: result.record } : null;

        // Attach record to the current in-memory preview object only.
        // This is NOT wargame3.json, NOT scenario state, NOT any storage.
        // selectedDecision lives only inside the dry-run record — never at p level.
        p.operatorSelectionDryRunRecord = result.record;

        // PR-271: update COA under review indicator immediately on click.
        // Uses _getW3CoaReviewRecordForStep (which reads _w3CoaReviewRecord set above).
        _paintW3CoaUnderReviewIndicator(p);

        // PR-275: sync scenario review session — record is now stored, p has record field.
        // reviewedCoa.available will be true in the updated session.
        _updateW3ScenarioReviewSession(p);

        // PR-277: sync scenario workflow state — builds on top of the review session.
        // decisionReview.active will be true in the updated workflow.
        _updateW3ScenarioWorkflowStateFromCurrentSession();

        // Repaint the Selection Review card (PR-267 painter validates before rendering).
        _paintW3OperatorSelectionReview(p);
    }

    // ── PR-267: Operator Selection Dry-Run Review Painter — W3 only ───────────
    // Reads p.operatorSelectionDryRunRecord (or p.selectionDryRunRecord).
    // Validates with isWargame3OperatorSelectionDryRunRecordSafe before ANY render.
    // Paints read-only review rows into #sw-drp-selection-review.
    // FORBIDDEN: buttons, inputs, controls, apply/execute/commit/confirm/Gate 7.
    // FORBIDDEN: creating selectedDecision in preview, expectedResult, previewComplete.
    // FORBIDDEN: reading window.RmoozScenario, window.units, window.lines.
    // FORBIDDEN: fetch, localStorage, sessionStorage, IndexedDB, backend.
    // FORBIDDEN: Leaflet, fitBounds, addLayer, paintMap, map writes.
    // If no record or invalid record: section stays hidden — no noise.
    // No selectedDecision in preview pipeline. No expectedResult. No previewComplete.
    function _paintW3OperatorSelectionReview(p) {
        var section = document.getElementById('sw-drp-selection-review');
        if (!section) { return; }

        // Prefer operatorSelectionDryRunRecord; fall back to selectionDryRunRecord
        var rawRecord = (p && p.operatorSelectionDryRunRecord &&
                         typeof p.operatorSelectionDryRunRecord === 'object' &&
                         !Array.isArray(p.operatorSelectionDryRunRecord))
            ? p.operatorSelectionDryRunRecord
            : (p && p.selectionDryRunRecord &&
               typeof p.selectionDryRunRecord === 'object' &&
               !Array.isArray(p.selectionDryRunRecord))
                ? p.selectionDryRunRecord
                : null;

        // PR-272: locate clear button once — shared by both paths below
        var clearBtn = document.getElementById('sw-drp-selection-review-clear-btn');

        // No record: hide section, hide clear button, return
        if (!rawRecord) {
            section.hidden = true;
            if (clearBtn) { clearBtn.hidden = true; }
            return;
        }

        // Validate the record before rendering ANY field
        var validation = isWargame3OperatorSelectionDryRunRecordSafe(rawRecord);
        if (!validation.passed) {
            section.hidden = true;
            if (clearBtn) { clearBtn.hidden = true; }
            return;
        }

        // Record is safe — render read-only fields
        var rec = rawRecord;

        function setVal(id, text) {
            var el = document.getElementById(id);
            if (el) { el.textContent = text; }
        }

        // Status
        setVal('sw-drp-selection-review-status',
            typeof rec.status === 'string' ? rec.status : '—');

        // Selected COA label (from validated selectedDecision)
        var coaLabel = (rec.selectedDecision &&
                        typeof rec.selectedDecision.label === 'string' &&
                        rec.selectedDecision.label)
            ? rec.selectedDecision.label : '—';
        setVal('sw-drp-selection-review-coa', coaLabel);

        // Option reference
        setVal('sw-drp-selection-review-option-ref',
            typeof rec.optionRef === 'string' ? rec.optionRef : '—');

        // Dry-run only — always true for a valid record
        setVal('sw-drp-selection-review-dry-run',
            tx('sw-drp-selection-review-yes', 'Yes'));

        // Live mutation — always false for a valid record
        setVal('sw-drp-selection-review-live-mutation',
            tx('sw-drp-selection-review-no', 'No'));

        // Backend commit — always false for a valid record
        setVal('sw-drp-selection-review-backend-commit',
            tx('sw-drp-selection-review-no', 'No'));

        // Expected result — not available in this PR scope
        setVal('sw-drp-selection-review-expected-result',
            tx('sw-drp-selection-review-not-available', 'Not available yet'));

        // Preview complete — not possible without expectedResult + enemyCounterActions
        setVal('sw-drp-selection-review-preview-complete',
            tx('sw-drp-selection-review-no', 'No'));

        // PR-272: show clear button and wire click handler.
        // Uses assignment (not addEventListener) to prevent listener accumulation.
        if (clearBtn) {
            clearBtn.hidden = false;
            clearBtn.onclick = function () { _handleW3CoaReviewClearClick(p); };
        }

        section.hidden = false;
    }

    // ── PR-271: COA Under Review Indicator Painter ───────────────────────────
    // Paints the #sw-drp-sum-coa-chip chip inside the W3 compact step summary.
    // Source: preview-local dry-run record memory only (_getW3CoaReviewRecordForStep).
    // Displays: label from record.selectedDecision.label — nothing else.
    // FORBIDDEN: localStorage, sessionStorage, fetch, window.RmoozScenario, window.units,
    //            window.lines, map, Gate 7, apply, execute, commit, confirm, approve.
    // FORBIDDEN: creating expectedResult, changing previewComplete, adding controls.
    // Hidden by default. Hidden when no review active. Hidden for non-W3 steps.
    function _paintW3CoaUnderReviewIndicator(p) {
        var chip = document.getElementById('sw-drp-sum-coa-chip');
        if (!chip) { return; }

        // Only relevant for W3 preview steps
        var stepRef = (p && typeof p.activeStepId === 'string') ? p.activeStepId : '';
        if (!stepRef || !/^W3-STEP-/i.test(stepRef)) {
            chip.textContent = '';
            chip.hidden = true;
            return;
        }

        // Read from preview-local dry-run record — no storage, no backend
        var rec = _getW3CoaReviewRecordForStep(stepRef);

        // Extract label from selectedDecision only — no raw JSON, no optionRef as text
        var label = (rec &&
                     rec.selectedDecision &&
                     typeof rec.selectedDecision.label === 'string' &&
                     rec.selectedDecision.label !== '')
                    ? rec.selectedDecision.label : null;

        if (label) {
            chip.textContent = tx('sw-drp-coa-under-review-label', 'COA under review') + ': ' + label;
            chip.hidden = false;
        } else {
            chip.textContent = '';
            chip.hidden = true;
        }
    }

    // ── PR-272: Clear COA Review Click Handler ───────────────────────────────
    // Called when the user clicks the "Clear review" button inside
    // #sw-drp-selection-review.  Clears preview-local COA review memory,
    // hides the review section, and refreshes the under-review chip.
    //
    // FORBIDDEN: localStorage, sessionStorage, IndexedDB, cookie, URL param.
    // FORBIDDEN: fetch, /api/sim/commit, any backend call.
    // FORBIDDEN: window.RmoozScenario mutation, window.units, window.lines.
    // FORBIDDEN: map markers, Leaflet, Gate 7, apply, execute, confirm, approve.
    // FORBIDDEN: previewComplete change, expectedResult creation.
    // NO step navigation.  NO scenario state change.
    function _handleW3CoaReviewClearClick(p) {
        // 1. Wipe the preview-local COA review memory
        _clearW3CoaReviewRecord();

        // 2. If we have a local preview object reference, drop the record from it
        //    so subsequent painters in this repaint cycle see a clean p.
        if (p && typeof p === 'object') {
            delete p.operatorSelectionDryRunRecord;
        }

        // 3. Hide the review section
        var section = document.getElementById('sw-drp-selection-review');
        if (section) { section.hidden = true; }

        // 4. Hide the clear button itself
        var clearBtn = document.getElementById('sw-drp-selection-review-clear-btn');
        if (clearBtn) { clearBtn.hidden = true; }

        // 5. Refresh the under-review chip (memory is now null so it will hide)
        _paintW3CoaUnderReviewIndicator(p);

        // PR-275: sync scenario review session after review is cleared.
        // reviewedCoa.available will be false in the updated session.
        _updateW3ScenarioReviewSession(p);

        // PR-277: sync scenario workflow state — decisionReview.active will be false.
        _updateW3ScenarioWorkflowStateFromCurrentSession();
    }

    // ── PR-238: Compact step summary — W3 preview only ──────────────────────
    // Derives all fields from the existing preview object (p). No AI. No backend.
    // No fetch. No storage. No mutation. No map. Text display only.
    function _paintW3StepSummary(p) {
        var block = document.getElementById('sw-drp-step-summary');
        if (!block) { return; }

        // Step focus — first line of situation, clipped to 150 chars
        var focusEl = document.getElementById('sw-drp-sum-focus');
        if (focusEl) {
            var sit = (typeof p.situation === 'string' && p.situation) ? p.situation : '';
            var firstLine = sit.split('\n')[0].trim();
            focusEl.textContent = firstLine.length > 150
                ? firstLine.slice(0, 147) + '…'
                : (firstLine || '—');
        }

        // Objective status chip — colored by status value, reuses data-status attribute
        var objChip = document.getElementById('sw-drp-sum-obj-chip');
        if (objChip) {
            var obs = (typeof p.objectiveStatusBaseline === 'string' && p.objectiveStatusBaseline)
                ? p.objectiveStatusBaseline : null;
            if (obs) {
                objChip.textContent = tx('sw-drp-sum-obj-label', 'Objective') + ': ' + obs;
                objChip.setAttribute('data-status', obs.toLowerCase());
                objChip.hidden = false;
            } else {
                objChip.hidden = true;
            }
        }

        // Effects count chip
        var effChip = document.getElementById('sw-drp-sum-effects-chip');
        if (effChip) {
            var effCount = (p.proposedVisualEffects && p.proposedVisualEffects.length) || 0;
            if (effCount > 0) {
                effChip.textContent = effCount + ' ' + tx('sw-drp-sum-effects-label', 'effects');
                effChip.hidden = false;
            } else {
                effChip.hidden = true;
            }
        }

        // Source gap chip — shown when decision/result are absent (W3 norm)
        var gapChip = document.getElementById('sw-drp-sum-gap-chip');
        if (gapChip) {
            if (!p.decision || !p.expectedResult) {
                gapChip.textContent = tx('sw-drp-sum-gap-label', 'Decision/result pending');
                gapChip.hidden = false;
            } else {
                gapChip.hidden = true;
            }
        }

        // Key units — first 4 display names, then "+N more" suffix
        var unitsEl = document.getElementById('sw-drp-sum-units');
        if (unitsEl) {
            var units  = (p.unitsReferenced && p.unitsReferenced.length > 0) ? p.unitsReferenced : [];
            var MAX_U  = 4;
            if (units.length > 0) {
                var names = units.slice(0, MAX_U).map(function (u) { return u.displayName; }).join(' · ');
                if (units.length > MAX_U) {
                    names += ' +' + (units.length - MAX_U) + ' ' + tx('sw-drp-sum-more', 'more');
                }
                unitsEl.textContent = names;
                unitsEl.hidden = false;
            } else {
                unitsEl.hidden = true;
            }
        }

        // PR-271: COA under review chip — sourced from preview-local dry-run record only.
        // Clears automatically when _getW3CoaReviewRecordForStep returns null (step change).
        _paintW3CoaUnderReviewIndicator(p);

        // PR-285A: Scope label — engaged preview units only, not full OOB.
        paintWargame3PreviewUnitScope(p);

        block.hidden = false;
    }

    // ── PR-285A: Wargame 3 Preview Unit Scope Summary ─────────────────────────
    // Helper: builds engaged-unit scope summary for W3 dry-run preview.
    // shownUnits = preview.unitsReferenced.length (same array as _paintW3StepSummary).
    // totalUnits = _drpPreviewSource.units.length  (deep-frozen fixture catalog).
    // Non-W3 or null preview → passed:true, summary:null.
    // No map read. No window.units. No live state. No mutation. Pure derivation.
    function buildWargame3PreviewUnitScopeSummary(preview, options) {
        options = options || {};
        var warnings = [];

        if (!preview || typeof preview !== 'object') {
            return { passed: true, summary: null, blockedReasons: [], warnings: [] };
        }
        var isW3 = typeof preview.activeStepId === 'string' &&
                   /^W3-STEP-/i.test(preview.activeStepId);
        if (!isW3) {
            return { passed: true, summary: null, blockedReasons: [], warnings: [] };
        }

        // shownUnits — from unitsReferenced (same source as _paintW3StepSummary)
        var shownUnits = null;
        if (preview.unitsReferenced &&
                typeof preview.unitsReferenced.length === 'number') {
            shownUnits = preview.unitsReferenced.length;
        }

        // totalUnits — fixture unit catalog length (deep-frozen, never mutated)
        var totalUnits = null;
        if (_drpPreviewSource &&
                _drpPreviewSource.units &&
                typeof _drpPreviewSource.units.length === 'number') {
            totalUnits = _drpPreviewSource.units.length;
        } else {
            warnings.push('TOTAL_UNITS_UNAVAILABLE');
        }

        // capped — shownUnits exceeds map overlay marker cap (mirrors MAX_MARKERS = 12)
        var _SCOPE_MAP_CAP = 12;
        var capped = (shownUnits !== null && shownUnits > _SCOPE_MAP_CAP);

        return {
            passed:  true,
            summary: {
                scopeType:                       'engaged_preview_units_only',
                isWargame3:                      true,
                shownUnits:                      shownUnits,
                totalUnits:                      totalUnits,
                capped:                          capped,
                fullOobShown:                    false,
                liveNavigatorRequiredForFullOob: true
            },
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // PR-285A: Paint the W3 preview unit scope label.
    // Shows "Engaged preview units only — N of T shown" for W3 previews.
    // Hides #sw-drp-unit-scope for non-W3 fixtures (AMBER RIDGE, etc.).
    // No map read. No window.units read. No live state. No mutation.
    // Called automatically by _paintW3StepSummary on every W3 preview render.
    function paintWargame3PreviewUnitScope(preview) {
        var scopeEl = document.getElementById('sw-drp-unit-scope');
        if (!scopeEl) { return; }

        var result = buildWargame3PreviewUnitScopeSummary(preview);

        if (!result.passed || !result.summary) {
            scopeEl.setAttribute('hidden', '');
            return;
        }

        var s      = result.summary;
        var mainEl = document.getElementById('sw-drp-unit-scope-main');
        var subEl  = document.getElementById('sw-drp-unit-scope-sub');

        if (mainEl) {
            var mainText;
            if (s.shownUnits !== null && s.totalUnits !== null) {
                var tpl = tx('sw-drp-scope-main-count',
                             'Engaged preview units only — {shown} of {total} shown');
                mainText = tpl
                    .replace('{shown}', String(s.shownUnits))
                    .replace('{total}', String(s.totalUnits));
            } else {
                mainText = tx('sw-drp-scope-main', 'Engaged preview units only');
            }
            if (s.capped) {
                mainText += ' — ' + tx('sw-drp-scope-capped',
                                             'Marker display may be capped.');
            }
            mainEl.textContent = mainText;
        }

        if (subEl) {
            subEl.textContent = tx('sw-drp-scope-sub',
                'Not full Order of Battle. Use Live Scenario Step Navigator for full force posture.');
        }

        scopeEl.removeAttribute('hidden');
    }

    // ── PR-212 / PR-217: Scenario Dry-Run Preview Paint ─────────────────────
    // PR-212: Default path — reads AMBER_RIDGE from window.RmoozDryRunFixtures.
    // PR-217: Override path — accepts a pre-built preview object from the caller.
    // Populates #sw-drp-section with text-only, read-only content.
    // No map access. No window.units access. No window.RmoozScenario access.
    // No storage. No network. No mutation. No apply controls. No Gate 7 UI.
    // previewOverride must carry readOnly:true and liveMutationAllowed:false.
    // Neither path stores the preview or fixture globally.
    function paintDryRunPreview(previewOverride) {
        var section = document.getElementById('sw-drp-section');
        if (!section) { return; }

        function setText(id, val) {
            var el = document.getElementById(id);
            if (el) { el.textContent = (val !== null && val !== undefined && val !== '') ? val : '—'; }
        }

        // ── Shared inner renderer: paints p + warnsArr into the DOM ─────────────
        // warnsArr: array of { code, message } objects — used for grouped display.
        // Text only — no map writes, no Leaflet calls, no window.units access.
        // PR-222: improved readability — W3 context badge, obj-status row,
        //         readable effect labels, grouped warnings, distinct status text.
        function _paintToDOM(p, warnsArr) {
            section.hidden = false;

            // PR-222: detect W3 mode from step ID prefix — no external state needed.
            var isW3 = (typeof p.activeStepId === 'string' && /^W3-STEP-/i.test(p.activeStepId));

            // PR-283A: AMBER RIDGE training-fixture badge — shown when DRP panel is showing
            // the static AMBER RIDGE fixture (before W3 is loaded). Hidden once W3 is active.
            // No behavior change — label/clarity only.
            var amberBadgeEl = document.getElementById('sw-drp-amber-badge');
            if (amberBadgeEl) { amberBadgeEl.hidden = isW3; }

            // PR-223: W3 context bar — shown for Wargame 3, hidden for other fixtures.
            // Identifies source, mode, and read-only constraint at a glance.
            var _w3ctx = document.getElementById('sw-drp-w3-context');
            if (_w3ctx) {
                _w3ctx.hidden = !isW3;
                if (isW3) {
                    _w3ctx.textContent = tx('sw-drp-w3-context',
                        'Wargame 3  ·  Dry-Run Preview  ·  Read-only');
                }
            }

            // PR-223: Fixture row — for W3 show package name only (context bar carries the badge).
            // For non-W3 keep existing format: fixtureName — packageName.
            var fixtureText = isW3
                ? (p.packageName || tx('sw-drp-w3-source', 'Wargame 3'))
                : ((p.fixtureName || '') + (p.packageName ? ' — ' + p.packageName : ''));
            setText('sw-drp-fixture', fixtureText);
            setText('sw-drp-step',       p.activeStepId + ' (' + (p.activeStepIndex + 1) + ' / ' + p.totalSteps + ')');
            setText('sw-drp-step-title', p.stepSummary);

            // Step content
            setText('sw-drp-situation', p.situation || t('sw-drp-missing'));

            // PR-222: W3 never carries decision/result in source — show pending label.
            if (isW3) {
                setText('sw-drp-decision', tx('sw-drp-w3-no-decision', 'Pending — not set in W3 source'));
                setText('sw-drp-result',   tx('sw-drp-w3-no-result',   'Pending — not set in W3 source'));
            } else {
                setText('sw-drp-decision', p.decision       || t('sw-drp-missing'));
                setText('sw-drp-result',   p.expectedResult || t('sw-drp-missing'));
            }

            // Units: text list — no map markers, no window.units access
            var unitsEl = document.getElementById('sw-drp-units');
            if (unitsEl) {
                if (p.unitsReferenced && p.unitsReferenced.length > 0) {
                    unitsEl.textContent = p.unitsReferenced.map(function (u) {
                        return u.displayName + ' (' + u.side + ')' + (u.resolved ? '' : ' [?]');
                    }).join(' · ');
                } else {
                    unitsEl.textContent = '—';
                }
            }

            // Objectives: text list
            var objEl = document.getElementById('sw-drp-objectives');
            if (objEl) {
                if (p.objectivesReferenced && p.objectivesReferenced.length > 0) {
                    objEl.textContent = p.objectivesReferenced.map(function (o) {
                        return o.description + (o.clear ? '' : ' [' + t('sw-drp-requires-review') + ']');
                    }).join(' · ');
                } else {
                    objEl.textContent = '—';
                }
            }

            // PR-222: Objective status baseline — Wargame 3 only.
            // Row is hidden for non-W3 fixtures. Shows colored badge by status.
            // No map. No window.units. Text only.
            var objStatusEl  = document.getElementById('sw-drp-obj-status');
            var objStatusRow = document.getElementById('sw-drp-obj-status-row');
            if (objStatusRow) { objStatusRow.hidden = !isW3; }
            if (objStatusEl) {
                var obsVal = (typeof p.objectiveStatusBaseline === 'string' && p.objectiveStatusBaseline)
                    ? p.objectiveStatusBaseline : '—';
                objStatusEl.textContent = obsVal;
                if (obsVal !== '—') {
                    objStatusEl.setAttribute('data-status', obsVal.toLowerCase());
                } else {
                    objStatusEl.removeAttribute('data-status');
                }
            }

            // PR-222/223: Proposed effects — readable type labels with bullet prefix.
            // Text-only — no map rendering, no Leaflet calls, no coordinates.
            var effectsEl = document.getElementById('sw-drp-effects');
            if (effectsEl) {
                if (p.proposedVisualEffects && p.proposedVisualEffects.length > 0) {
                    effectsEl.textContent = p.proposedVisualEffects.map(function (e) {
                        return '• ' + _drpEffectTypeLabel(e.type) + ': ' + e.description;
                    }).join('\n');
                } else {
                    effectsEl.textContent = t('sw-drp-none');
                }
            }

            // PR-222/229: Warnings — grouped by code for readability.
            // PR-229: In W3 mode, if all warnings are MISSING_FIELD (decision/result absent),
            // use informational style + plain label instead of error orange + code format.
            var warnEl = document.getElementById('sw-drp-warnings');
            if (warnEl) {
                if (warnsArr && warnsArr.length > 0) {
                    var allExpected = isW3 && warnsArr.every(function (w) {
                        return w.code === 'MISSING_FIELD';
                    });
                    if (allExpected) {
                        warnEl.textContent =
                            tx('sw-drp-w3-expected-warns', 'W3 source gaps (expected in preview):')
                            + '\n  · ' + tx('sw-drp-w3-no-decision-warn', 'Decision not set in source')
                            + '\n  · ' + tx('sw-drp-w3-no-result-warn',   'Result not set in source');
                        warnEl.classList.remove('sw-drp-warn-text');
                        warnEl.classList.add('sw-drp-warn-expected');
                    } else {
                        warnEl.textContent = _drpFormatWarnings(warnsArr);
                        warnEl.classList.add('sw-drp-warn-text');
                        warnEl.classList.remove('sw-drp-warn-expected');
                    }
                } else {
                    warnEl.textContent = t('sw-drp-none');
                    warnEl.classList.remove('sw-drp-warn-text');
                    warnEl.classList.remove('sw-drp-warn-expected');
                }
            }

            // PR-222: Status row — W3 gets distinct "Partial — missing decision/result · Read-only".
            var statusText;
            if (p.previewComplete) {
                statusText = t('sw-drp-complete');
            } else if (isW3) {
                statusText = tx('sw-drp-partial-w3', 'Partial — missing decision/result')
                           + '  ·  ' + tx('sw-drp-read-only', 'Read-only');
            } else {
                statusText = t('sw-drp-partial');
            }
            setText('sw-drp-status', statusText);
            setText('sw-drp-safety', t('sw-drp-preview-only') + ' · ' + t('sw-drp-no-live-changes'));

            // PR-238: compact step summary — W3 only; hide for other fixtures
            if (isW3) {
                _paintW3StepSummary(p);
            } else {
                var _sumBlock = document.getElementById('sw-drp-step-summary');
                if (_sumBlock) { _sumBlock.hidden = true; }
            }

            // PR-240: preview event log — W3 only; hide for other fixtures
            if (isW3) {
                _buildW3EventLog(p, warnsArr);
            } else {
                var _evlBlock = document.getElementById('sw-drp-event-log');
                if (_evlBlock) { _evlBlock.hidden = true; }
            }

            // PR-264: read-only decision options panel — W3 only.
            // Hidden in production (W3 source has no decisionOptions).
            // Visible only when p.decisionOptions is injected (e.g. fixture tests).
            if (isW3) {
                _paintW3DecisionOptions(p);
            } else {
                var _doBlock = document.getElementById('sw-drp-decision-options');
                if (_doBlock) { _doBlock.hidden = true; }
            }

            // PR-267 / PR-270: read-only operator selection dry-run review panel — W3 only.
            // PR-270: inject preview-local COA review record so the review survives
            // same-step repaints (panel reopen, fixture reload on same step, etc.).
            // No injection happens on step change — _getW3CoaReviewRecordForStep returns
            // null when stored stepRef doesn't match, and nav handlers call
            // _clearW3CoaReviewRecord() before each step change.
            if (isW3) {
                var _curStepRef = typeof p.activeStepId === 'string' ? p.activeStepId : '';
                var _storedRec  = _getW3CoaReviewRecordForStep(_curStepRef);
                if (_storedRec) {
                    // Inject stored record so painter sees it on fresh preview objects.
                    // Does NOT create selectedDecision, expectedResult, or previewComplete.
                    p.operatorSelectionDryRunRecord = _storedRec;
                }
                _paintW3OperatorSelectionReview(p);
            } else {
                var _srBlock = document.getElementById('sw-drp-selection-review');
                if (_srBlock) { _srBlock.hidden = true; }
            }

            // PR-243: read-only map overlay bridge — W3 only.
            // All nav paths (initial load, prev, next, jump) converge here.
            // Non-W3 path clears any residual W3 preview overlay.
            if (isW3) {
                paintWargame3PreviewMapOverlayFromPreview(p);
            } else {
                clearWargame3ReadOnlyMapOverlay();
            }

            // PR-275: sync W3 scenario review session — called after all painters.
            // Keeps _w3ScenarioReviewSession in sync with the current preview step.
            // Non-W3 path clears the session.
            // No storage. No backend. No map paint. No DOM. No mutation.
            if (isW3) {
                _updateW3ScenarioReviewSession(p);
                // PR-277: sync workflow state on top of the review session.
                // visitedStepRefs grows as user navigates W3 steps.
                // No storage. No backend. No map. No DOM.
                _updateW3ScenarioWorkflowStateFromCurrentSession();
            } else {
                _clearW3ScenarioReviewSession();
                // PR-277: non-W3 path clears workflow state too.
                _clearW3ScenarioWorkflowState();
            }
        }

        // ── PR-217: override path ─────────────────────────────────────────────────────
        if (previewOverride !== undefined && previewOverride !== null) {
            // V1: must be a non-null, non-array object
            if (typeof previewOverride !== 'object' || Array.isArray(previewOverride)) {
                section.hidden = false;
                setText('sw-drp-status', t('sw-drp-not-ready') + ': previewOverride must be a non-null object');
                setText('sw-drp-safety', t('sw-drp-preview-only') + ' · ' + t('sw-drp-no-live-changes'));
                return;
            }
            // V2: readOnly must be exactly true
            if (previewOverride.readOnly !== true) {
                section.hidden = false;
                setText('sw-drp-status', t('sw-drp-not-ready') + ': previewOverride.readOnly must be true');
                setText('sw-drp-safety', t('sw-drp-preview-only') + ' · ' + t('sw-drp-no-live-changes'));
                return;
            }
            // V3: liveMutationAllowed must be exactly false
            if (previewOverride.liveMutationAllowed !== false) {
                section.hidden = false;
                setText('sw-drp-status', t('sw-drp-not-ready') + ': previewOverride.liveMutationAllowed must be false');
                setText('sw-drp-safety', t('sw-drp-preview-only') + ' · ' + t('sw-drp-no-live-changes'));
                return;
            }
            // PR-222: prefer warningsDetail (full { code, message } objects, added by PR-222 builder)
            // so grouped display works correctly; fall back to missingDataWarnings plain strings.
            var overrideWarns;
            if (Array.isArray(previewOverride.warningsDetail) && previewOverride.warningsDetail.length > 0) {
                overrideWarns = previewOverride.warningsDetail;
            } else {
                overrideWarns = (previewOverride.missingDataWarnings || []).map(function (m) {
                    return { code: 'INFO', message: typeof m === 'string' ? m : String(m) };
                });
            }
            // Does not store previewOverride globally. Caller holds the reference.
            _paintToDOM(previewOverride, overrideWarns);
            return;
        }

        // ── PR-212: default path — AMBER RIDGE Step 1 ────────────────────────────────
        // PR-221: reset nav state — AMBER RIDGE has no multi-step nav here.
        _drpPreviewMode    = 'amber';
        _drpPreviewSource  = null;
        _drpPreviewStepRef = null;
        _updateDrpNavButtons();

        var fixtures = (typeof window !== 'undefined' &&
                        typeof window.RmoozDryRunFixtures !== 'undefined')
                       ? window.RmoozDryRunFixtures : null;

        if (!fixtures || !fixtures.AMBER_RIDGE) {
            section.hidden = false;
            setText('sw-drp-status', 'Fixture not loaded');
            setText('sw-drp-safety', t('sw-drp-preview-only') + ' · ' + t('sw-drp-no-live-changes'));
            return;
        }

        var result = buildScenarioStepPreview(fixtures.AMBER_RIDGE, 'AMBER-STEP-01');

        if (!result.passed || !result.preview) {
            section.hidden = false;
            setText('sw-drp-status', t('sw-drp-not-ready') + (result.blockedReasons.length ? ': ' + result.blockedReasons[0] : ''));
            setText('sw-drp-safety', t('sw-drp-preview-only') + ' · ' + t('sw-drp-no-live-changes'));
            return;
        }

        _paintToDOM(result.preview, result.warnings || []);
    }

    // ── PR-217 / PR-221: Wargame 3 paint helper ──────────────────────────────────
    // Chains previewWargame3Fixture(w3json, stepRef) → paintDryRunPreview(result.preview).
    // PR-221: also sets module-local preview navigation state so UI nav buttons work.
    // SAFETY: result.fixture is the deep-frozen adapted fixture from the W3 adapter.
    //         It is stored in _drpPreviewSource (preview-only, module-private).
    //         It does NOT mutate window.RmoozScenario.stepIndex.
    //         It does NOT touch window.units, window.lines, or the map.
    //         No fetch. No storage. No backend. No staging. No Gate 7.
    //         w3json is NOT stored — only the deep-frozen fixture is kept.
    // stepRef defaults to "W3-STEP-00". Returns harness result for console inspection.
    function paintWargame3Preview(w3json, stepRef) {
        var ref    = (stepRef !== undefined && stepRef !== null) ? stepRef : 'W3-STEP-00';
        var result = previewWargame3Fixture(w3json, ref);
        if (result.passed && result.preview) {
            // PR-221: update preview-only navigation state.
            // PR-285A: set _drpPreviewSource BEFORE painting so paintWargame3PreviewUnitScope
            // can read totalUnits during the first paint (fixes step-00 scope label).
            // Stores the deep-frozen fixture (not w3json) for subsequent button navigation.
            _drpPreviewSource  = result.fixture;   // deep-frozen — read-only, preview-only
            _drpPreviewStepRef = ref;
            _drpPreviewMode    = 'wargame3';
            // PR-233: #sw-drp-section is now at the top of #scenario-workspace-panel
            // (no longer inside the diagnostics chain), so no parent-chain reveal is needed.
            paintDryRunPreview(result.preview);
            _updateDrpNavButtons();
        }
        // Returned for console inspection only — not stored globally.
        return result;
    }

    // ── PR-218: Wargame 3 Step Navigation Preview ─────────────────────────────
    // Pure navigation helper — computes the next step, paints the preview, and
    // returns the navigation envelope for console inspection.
    // SAFETY: Does NOT store currentStepRef or nextStepRef globally.
    //         Does NOT mutate window.RmoozScenario.stepIndex.
    //         Does NOT mutate window.units, window.lines, or the map.
    //         No fetch. No storage. No backend. No staging state. No Gate 7.
    // currentStepRef: "W3-STEP-NN" string | numeric index | null → defaults to 0.
    // delta: integer offset (default 1 = forward one step). Clamped to [0, 16].
    // Returns { passed, fixture, preview, blockedReasons, warnings,
    //           nextStepRef, nextStepIndex, atStart, atEnd }.
    var _W3_STEP_COUNT = 17; // steps 0..16 (W3-STEP-00 … W3-STEP-16)

    function stepWargame3Preview(w3json, currentStepRef, delta) {
        // ── Parse currentStepRef → currentIndex ──────────────────────────────
        var currentIndex = 0;
        if (currentStepRef !== undefined && currentStepRef !== null) {
            if (typeof currentStepRef === 'number' && isFinite(currentStepRef)) {
                currentIndex = Math.floor(currentStepRef);
            } else if (typeof currentStepRef === 'string') {
                var m = currentStepRef.match(/W3-STEP-(\d+)/i);
                if (m) { currentIndex = parseInt(m[1], 10); }
            }
        }

        // ── Apply delta (defaults to 1 = forward one step) ───────────────────
        var d = (delta !== undefined && delta !== null &&
                 typeof delta === 'number' && isFinite(delta))
            ? Math.floor(delta) : 1;
        var nextIndex = currentIndex + d;

        // ── Clamp to [0, _W3_STEP_COUNT - 1] ─────────────────────────────────
        if (nextIndex < 0) { nextIndex = 0; }
        if (nextIndex > _W3_STEP_COUNT - 1) { nextIndex = _W3_STEP_COUNT - 1; }

        // ── Build zero-padded step ref ─────────────────────────────────────
        var nn = (nextIndex < 10) ? ('0' + nextIndex) : String(nextIndex);
        var nextStepRef = 'W3-STEP-' + nn;

        // ── Paint preview (no global storage) ────────────────────────────────
        var result = paintWargame3Preview(w3json, nextStepRef);

        // ── Return navigation envelope ────────────────────────────────────────
        return {
            passed:         result.passed,
            fixture:        result.fixture,
            preview:        result.preview,
            blockedReasons: result.blockedReasons,
            warnings:       result.warnings,
            nextStepRef:    nextStepRef,
            nextStepIndex:  nextIndex,
            atStart:        nextIndex === 0,
            atEnd:          nextIndex === (_W3_STEP_COUNT - 1)
        };
    }

    // ── PR-226: Wargame 3 Manual Source Helper ─────────────────────────────
    // Reads window.RmoozScenario.scenario (read-only).
    // Builds and returns a safe deep-copy w3json for paintWargame3Preview().
    // Console-only helper. No DOM. No map. No window.units. No storage.
    // No network. Never mutates the source object.

    /** @private JSON round-trip deep copy for plain objects/arrays. */
    function _w3pfc_deepCopy(val) {
        if (val === null || val === undefined) { return val; }
        return JSON.parse(JSON.stringify(val));
    }

    /** @private Copy one step object, forcing selectedDecision/expectedResult null. */
    function _w3pfc_copyStep(step) {
        if (!step || typeof step !== 'object') { return null; }
        var out = {};
        if (step.index             !== undefined) { out.index             = step.index; }
        if (step.phase             !== undefined) { out.phase             = step.phase; }
        if (step.time_label        !== undefined) { out.time_label        = step.time_label; }
        if (step.narrative_en_fallback !== undefined) {
            out.narrative_en_fallback = step.narrative_en_fallback;
        }
        if (step.narrative_ar_fallback !== undefined) {
            out.narrative_ar_fallback = step.narrative_ar_fallback;
        }
        if (step.objective_status_baseline !== undefined) {
            out.objective_status_baseline = step.objective_status_baseline;
        }
        out.actors          = _w3pfc_deepCopy(step.actors          || []);
        out.affected        = _w3pfc_deepCopy(step.affected        || []);
        out.engagement_arcs = _w3pfc_deepCopy(step.engagement_arcs || []);
        // Always null in preview — decision/result are never copied from source
        out.selectedDecision = null;
        out.expectedResult   = null;
        return out;
    }

    /**
     * PR-226 — buildW3PreviewFromLoadedScenario
     * Reads window.RmoozScenario.scenario (read-only), builds a safe deep-copy
     * w3json that can be passed directly to paintWargame3Preview().
     *
     * Behaviour:
     *   - Returns passed:false immediately if source is missing or incomplete.
     *   - Deep-copies all data; the source object is never mutated.
     *   - Forces selectedDecision=null, expectedResult=null on every step.
     *   - Fills scenario_id with "wg3-live" when absent from source.
     *   - Runs adaptWargame3ToFixture(w3json) for validation unless
     *     options.validate === false. Adapter failures are collected as
     *     warnings, not blockers (w3json is still returned).
     *   - No DOM, no map, no window.units, no storage, no fetch.
     *
     * @param  {Object}  [options]
     * @param  {boolean} [options.validate=true]
     * @returns {{ passed:boolean, w3json:Object|null, blockedReasons:string[], warnings:Object[] }}
     */
    function buildW3PreviewFromLoadedScenario(options) {
        var opts           = (options && typeof options === 'object') ? options : {};
        var blockedReasons = [];
        var warnings       = [];

        // ── 1. Source guard ─────────────────────────────────────────────────
        if (!window.RmoozScenario) {
            blockedReasons.push('window.RmoozScenario is not defined');
            return { passed: false, w3json: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        var src = window.RmoozScenario.scenario;
        if (!src || typeof src !== 'object') {
            blockedReasons.push('window.RmoozScenario.scenario is missing or not an object');
            return { passed: false, w3json: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // ── 2. Required-field guard ─────────────────────────────────────────
        if (!src.name && !src.scenario_label) {
            blockedReasons.push('scenario has no name or scenario_label');
        }
        if (!Array.isArray(src.steps) || src.steps.length === 0) {
            blockedReasons.push('scenario.steps is missing or empty');
        }
        if (blockedReasons.length > 0) {
            return { passed: false, w3json: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // ── 3. Build w3json — deep copy; src is never mutated ───────────────
        var w3json         = {};

        // Identity
        w3json.scenario_id    = src.scenario_id    || 'wg3-live';
        w3json.name           = src.name           || '';
        w3json.scenario_label = src.scenario_label || '';
        if (src.ported_from !== undefined) { w3json.ported_from = src.ported_from; }

        // Objective
        w3json.obj = _w3pfc_deepCopy(src.obj || null);

        // Unit tables
        w3json.red_units          = _w3pfc_deepCopy(src.red_units          || null);
        w3json.blue_units_initial = _w3pfc_deepCopy(src.blue_units_initial || null);

        // Coordinate tables — root format { uid: [[lon,lat], …] }
        w3json.red_unit_step_coords  = _w3pfc_deepCopy(src.red_unit_step_coords  || null);
        w3json.blue_unit_step_coords = _w3pfc_deepCopy(src.blue_unit_step_coords || null);

        // Steps
        w3json.steps = [];
        for (var si = 0; si < src.steps.length; si++) {
            var copiedStep = _w3pfc_copyStep(src.steps[si]);
            if (copiedStep !== null) {
                w3json.steps.push(copiedStep);
            } else {
                warnings.push({ code: 'W3PFC_STEP_SKIP', step: si,
                                message: 'step ' + si + ' was null or non-object; skipped' });
            }
        }

        // ── 4. Absent-optional-field warnings ───────────────────────────────
        if (!src.red_units) {
            warnings.push({ code: 'W3PFC_NO_RED_UNITS',
                            message: 'scenario.red_units is absent' });
        }
        if (!src.blue_units_initial) {
            warnings.push({ code: 'W3PFC_NO_BLUE_UNITS',
                            message: 'scenario.blue_units_initial is absent' });
        }
        if (!src.red_unit_step_coords) {
            warnings.push({ code: 'W3PFC_NO_RED_COORDS',
                            message: 'scenario.red_unit_step_coords is absent' });
        }
        if (!src.blue_unit_step_coords) {
            warnings.push({ code: 'W3PFC_NO_BLUE_COORDS',
                            message: 'scenario.blue_unit_step_coords is absent' });
        }

        // ── 5. Optional adapter validation ──────────────────────────────────
        if (opts.validate !== false) {
            try {
                var adapterResult = adaptWargame3ToFixture(w3json);
                if (!adapterResult.passed) {
                    for (var bi = 0; bi < adapterResult.blockedReasons.length; bi++) {
                        warnings.push({ code: 'W3PFC_ADAPTER_BLOCKED',
                                        message: adapterResult.blockedReasons[bi] });
                    }
                }
                if (Array.isArray(adapterResult.warnings)) {
                    for (var awi = 0; awi < adapterResult.warnings.length; awi++) {
                        warnings.push(adapterResult.warnings[awi]);
                    }
                }
            } catch (adapterErr) {
                warnings.push({ code: 'W3PFC_ADAPTER_EXCEPTION',
                                message: String(adapterErr) });
            }
        }

        return {
            passed:         true,
            w3json:         w3json,
            blockedReasons: blockedReasons,
            warnings:       warnings
        };
    }

    // ── PR-241: Read-Only Map Overlay Data Builder — unsafe field lists ──────
    // These lists match the spec: forbidden mutation/action keys at top level
    // and inside nested overlay items (markers, objectiveHighlights, effectHints).
    var _W3MOD_UNSAFE_TOP = Object.freeze([
        'applyNow', 'commitNow', 'executeNow', 'liveApply',
        'mutateMap', 'mutateUnits', 'mutateLines', 'mutateScenario',
        'changeStepIndex', 'persist', 'save', 'fetch', 'backendCommitPlanned'
    ]);
    var _W3MOD_UNSAFE_NESTED = Object.freeze([
        'applyNow', 'commitNow', 'executeNow', 'liveApply',
        'mutateMap', 'mutateUnits', 'mutateLines', 'mutateScenario',
        'changeStepIndex', 'persist', 'save', 'fetch', 'backendCommitPlanned'
    ]);

    // ── PR-241: Wargame 3 Read-Only Map Overlay type guard ───────────────────
    // Pure function. No DOM. No map. No window.units. No window.RmoozScenario.
    // No storage. No network. No mutation.
    // Returns { passed: boolean, blockedReasons: string[] }.
    function isWargame3ReadOnlyMapOverlayDataSafe(overlay) {
        var reasons = [];

        // 1. Non-null object, not array
        if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
            return { passed: false, blockedReasons: ['overlay must be a non-null object and not an array'] };
        }

        // 2. overlayType must be exact sentinel
        if (overlay.overlayType !== 'wargame3_preview_read_only') {
            reasons.push('overlay.overlayType must be "wargame3_preview_read_only"');
        }

        // 3. source must be "dry_run_preview"
        if (overlay.source !== 'dry_run_preview') {
            reasons.push('overlay.source must be "dry_run_preview"');
        }

        // 4. readOnly must be exactly true
        if (overlay.readOnly !== true) {
            reasons.push('overlay.readOnly must be true');
        }

        // 5. liveMutationAllowed must be exactly false
        if (overlay.liveMutationAllowed !== false) {
            reasons.push('overlay.liveMutationAllowed must be false');
        }

        // 6–11. Array fields
        if (!Array.isArray(overlay.markers))             { reasons.push('overlay.markers must be an array'); }
        if (!Array.isArray(overlay.objectiveHighlights)) { reasons.push('overlay.objectiveHighlights must be an array'); }
        if (!Array.isArray(overlay.effectHints))         { reasons.push('overlay.effectHints must be an array'); }
        if (!Array.isArray(overlay.movementTrails))      { reasons.push('overlay.movementTrails must be an array'); }
        if (!Array.isArray(overlay.warnings))            { reasons.push('overlay.warnings must be an array'); }
        if (!Array.isArray(overlay.blockedReasons))      { reasons.push('overlay.blockedReasons must be an array'); }

        // 11. No unsafe top-level fields
        for (var ti = 0; ti < _W3MOD_UNSAFE_TOP.length; ti++) {
            if (overlay.hasOwnProperty(_W3MOD_UNSAFE_TOP[ti])) {
                reasons.push('unsafe top-level field present: ' + _W3MOD_UNSAFE_TOP[ti]);
            }
        }

        // 12. No unsafe fields inside markers
        if (Array.isArray(overlay.markers)) {
            for (var mi = 0; mi < overlay.markers.length; mi++) {
                var mk = overlay.markers[mi];
                if (mk && typeof mk === 'object' && !Array.isArray(mk)) {
                    for (var mf = 0; mf < _W3MOD_UNSAFE_NESTED.length; mf++) {
                        if (mk.hasOwnProperty(_W3MOD_UNSAFE_NESTED[mf])) {
                            reasons.push('overlay.markers[' + mi + '] contains unsafe field: ' + _W3MOD_UNSAFE_NESTED[mf]);
                        }
                    }
                }
            }
        }

        // 12b. No unsafe fields inside objectiveHighlights
        if (Array.isArray(overlay.objectiveHighlights)) {
            for (var ohi = 0; ohi < overlay.objectiveHighlights.length; ohi++) {
                var oh = overlay.objectiveHighlights[ohi];
                if (oh && typeof oh === 'object' && !Array.isArray(oh)) {
                    for (var ohf = 0; ohf < _W3MOD_UNSAFE_NESTED.length; ohf++) {
                        if (oh.hasOwnProperty(_W3MOD_UNSAFE_NESTED[ohf])) {
                            reasons.push('overlay.objectiveHighlights[' + ohi + '] contains unsafe field: ' + _W3MOD_UNSAFE_NESTED[ohf]);
                        }
                    }
                }
            }
        }

        // 12c. No unsafe fields inside effectHints
        if (Array.isArray(overlay.effectHints)) {
            for (var ehi = 0; ehi < overlay.effectHints.length; ehi++) {
                var ehv = overlay.effectHints[ehi];
                if (ehv && typeof ehv === 'object' && !Array.isArray(ehv)) {
                    for (var ehf = 0; ehf < _W3MOD_UNSAFE_NESTED.length; ehf++) {
                        if (ehv.hasOwnProperty(_W3MOD_UNSAFE_NESTED[ehf])) {
                            reasons.push('overlay.effectHints[' + ehi + '] contains unsafe field: ' + _W3MOD_UNSAFE_NESTED[ehf]);
                        }
                    }
                }
            }
        }

        // 12d. No unsafe fields inside movementTrails
        if (Array.isArray(overlay.movementTrails)) {
            for (var tri = 0; tri < overlay.movementTrails.length; tri++) {
                var trv = overlay.movementTrails[tri];
                if (trv && typeof trv === 'object' && !Array.isArray(trv)) {
                    for (var trf = 0; trf < _W3MOD_UNSAFE_NESTED.length; trf++) {
                        if (trv.hasOwnProperty(_W3MOD_UNSAFE_NESTED[trf])) {
                            reasons.push('overlay.movementTrails[' + tri + '] contains unsafe field: ' + _W3MOD_UNSAFE_NESTED[trf]);
                        }
                    }
                }
            }
        }

        return { passed: reasons.length === 0, blockedReasons: reasons };
    }

    // ── PR-259: Wargame 3 Decision/Result Type Guards ────────────────────────
    // Pure functions. No DOM. No map. No window.units. No window.RmoozScenario.
    // No storage. No network. No mutation. All return { passed, blockedReasons, warnings }.

    var _W3DRS_UNSAFE_FIELDS = Object.freeze([
        'applyNow', 'commitNow', 'executeNow', 'liveApply',
        'mutateUnits', 'mutateMap', 'mutateScenario', 'backendCommit',
        'autoApply', 'aiGenerated', 'simulationCommitted', 'gate7Approved'
    ]);
    var _W3DRS_FORBIDDEN_STATUS_TOKENS = Object.freeze([
        'DORMANT', 'THREATENED', 'CONTESTED', 'DENIED',
        'ACTIVE', 'COMPLETE', 'SUCCESS', 'FAILURE'
    ]);

    function isWargame3SelectedDecisionSafe(value, options) {
        var reasons = []; var warnings = [];

        if (value === null || value === undefined) {
            return { passed: false, blockedReasons: ['selectedDecision must not be null or undefined'], warnings: [] };
        }

        if (typeof value === 'string') {
            if (value === '') {
                reasons.push('selectedDecision string must not be empty');
            } else if (_W3DRS_FORBIDDEN_STATUS_TOKENS.indexOf(value) !== -1) {
                reasons.push('selectedDecision must not be a forbidden objective-status token: ' + value);
            }
            return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
            if (typeof value.id !== 'string' || value.id === '') {
                reasons.push('selectedDecision.id must be a non-empty string');
            }
            if (typeof value.label !== 'string' || value.label === '') {
                reasons.push('selectedDecision.label must be a non-empty string');
            }
            if (typeof value.description !== 'string') {
                reasons.push('selectedDecision.description must be a string');
            }
            var sdSources = ['operator', 'source_option', 'instructor'];
            if (sdSources.indexOf(value.source) === -1) {
                reasons.push('selectedDecision.source must be one of: ' + sdSources.join(', '));
            }
            var sdConfidence = ['explicit', 'instructor_defined'];
            if (sdConfidence.indexOf(value.confidence) === -1) {
                reasons.push('selectedDecision.confidence must be one of: ' + sdConfidence.join(', '));
            }
            if (value.readOnly !== true) {
                reasons.push('selectedDecision.readOnly must be true');
            }
            if (value.selectedAt !== null && typeof value.selectedAt !== 'string') {
                reasons.push('selectedDecision.selectedAt must be a string or null');
            }
            if (value.selectedBy !== null && typeof value.selectedBy !== 'string') {
                reasons.push('selectedDecision.selectedBy must be a string or null');
            }
            if (value.optionRef !== null && typeof value.optionRef !== 'string') {
                reasons.push('selectedDecision.optionRef must be a string or null');
            }
            for (var sdi = 0; sdi < _W3DRS_UNSAFE_FIELDS.length; sdi++) {
                if (Object.prototype.hasOwnProperty.call(value, _W3DRS_UNSAFE_FIELDS[sdi])) {
                    reasons.push('selectedDecision contains unsafe field: ' + _W3DRS_UNSAFE_FIELDS[sdi]);
                }
            }
            return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
        }

        reasons.push('selectedDecision must be a non-empty string or a structured object');
        return { passed: false, blockedReasons: reasons, warnings: warnings };
    }

    function isWargame3ExpectedResultSafe(value, options) {
        var reasons = []; var warnings = [];

        if (value === null || value === undefined) {
            return { passed: false, blockedReasons: ['expectedResult must not be null or undefined'], warnings: [] };
        }

        if (typeof value === 'string') {
            if (value === '') {
                reasons.push('expectedResult string must not be empty');
            } else if (_W3DRS_FORBIDDEN_STATUS_TOKENS.indexOf(value) !== -1) {
                reasons.push('expectedResult must not be a forbidden objective-status token: ' + value);
            }
            return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
        }

        if (typeof value === 'object' && !Array.isArray(value)) {
            if (typeof value.id !== 'string' || value.id === '') {
                reasons.push('expectedResult.id must be a non-empty string');
            }
            if (typeof value.label !== 'string' || value.label === '') {
                reasons.push('expectedResult.label must be a non-empty string');
            }
            if (typeof value.description !== 'string') {
                reasons.push('expectedResult.description must be a string');
            }
            var erSources = ['adjudication', 'instructor', 'source_expected'];
            if (erSources.indexOf(value.source) === -1) {
                reasons.push('expectedResult.source must be one of: ' + erSources.join(', '));
            }
            var erResultTypes = ['expected', 'observed', 'adjudicated'];
            if (erResultTypes.indexOf(value.resultType) === -1) {
                reasons.push('expectedResult.resultType must be one of: ' + erResultTypes.join(', '));
            }
            var erConfidence = ['explicit', 'adjudicated', 'instructor_defined'];
            if (erConfidence.indexOf(value.confidence) === -1) {
                reasons.push('expectedResult.confidence must be one of: ' + erConfidence.join(', '));
            }
            if (value.readOnly !== true) {
                reasons.push('expectedResult.readOnly must be true');
            }
            if (value.linkedDecisionId !== null && typeof value.linkedDecisionId !== 'string') {
                reasons.push('expectedResult.linkedDecisionId must be a string or null');
            }
            for (var eri = 0; eri < _W3DRS_UNSAFE_FIELDS.length; eri++) {
                if (Object.prototype.hasOwnProperty.call(value, _W3DRS_UNSAFE_FIELDS[eri])) {
                    reasons.push('expectedResult contains unsafe field: ' + _W3DRS_UNSAFE_FIELDS[eri]);
                }
            }
            return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
        }

        reasons.push('expectedResult must be a non-empty string or a structured object');
        return { passed: false, blockedReasons: reasons, warnings: warnings };
    }

    function isWargame3DecisionOptionSafe(value, options) {
        var reasons = []; var warnings = [];

        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return { passed: false, blockedReasons: ['decisionOption must be a non-null object'], warnings: [] };
        }

        if (typeof value.id !== 'string' || value.id === '') {
            reasons.push('decisionOption.id must be a non-empty string');
        }
        if (typeof value.label !== 'string' || value.label === '') {
            reasons.push('decisionOption.label must be a non-empty string');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'affectedUnits') && !Array.isArray(value.affectedUnits)) {
            reasons.push('decisionOption.affectedUnits must be an array');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'expectedEffects') && !Array.isArray(value.expectedEffects)) {
            reasons.push('decisionOption.expectedEffects must be an array');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'risks') && !Array.isArray(value.risks)) {
            reasons.push('decisionOption.risks must be an array');
        }
        if (Object.prototype.hasOwnProperty.call(value, 'source')) {
            var doSources = ['source_json', 'instructor'];
            if (doSources.indexOf(value.source) === -1) {
                reasons.push('decisionOption.source must be one of: ' + doSources.join(', '));
            }
        }
        if (value.readOnly !== true) {
            reasons.push('decisionOption.readOnly must be true');
        }
        for (var doi = 0; doi < _W3DRS_UNSAFE_FIELDS.length; doi++) {
            if (Object.prototype.hasOwnProperty.call(value, _W3DRS_UNSAFE_FIELDS[doi])) {
                reasons.push('decisionOption contains unsafe field: ' + _W3DRS_UNSAFE_FIELDS[doi]);
            }
        }
        return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
    }

    function validateWargame3DecisionResultPair(step, options) {
        var reasons = []; var warnings = [];

        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            return {
                passed:                  false,
                blockedReasons:          ['step must be a non-null object'],
                warnings:                [],
                selectedDecisionStatus:  { present: false, passed: false },
                expectedResultStatus:    { present: false, passed: false },
                previewCompleteEligible: false
            };
        }

        var sdValue   = step.selectedDecision;
        var sdPresent = sdValue !== null && sdValue !== undefined;
        var sdResult  = sdPresent
            ? isWargame3SelectedDecisionSafe(sdValue, options)
            : { passed: false, blockedReasons: ['selectedDecision is absent'], warnings: [] };
        for (var sdi = 0; sdi < sdResult.blockedReasons.length; sdi++) {
            reasons.push('selectedDecision: ' + sdResult.blockedReasons[sdi]);
        }

        var erValue   = step.expectedResult;
        var erPresent = erValue !== null && erValue !== undefined;
        var erResult  = erPresent
            ? isWargame3ExpectedResultSafe(erValue, options)
            : { passed: false, blockedReasons: ['expectedResult is absent'], warnings: [] };
        for (var eri = 0; eri < erResult.blockedReasons.length; eri++) {
            reasons.push('expectedResult: ' + erResult.blockedReasons[eri]);
        }

        var ecaOk = Array.isArray(step.enemyCounterActions) && step.enemyCounterActions.length > 0;
        if (!ecaOk) {
            reasons.push('enemyCounterActions must be a non-empty array');
        }

        if (erPresent &&
            step.objective_status_baseline !== null &&
            step.objective_status_baseline !== undefined &&
            step.expectedResult === step.objective_status_baseline) {
            reasons.push('expectedResult must not be copied from objective_status_baseline');
        }

        if (erPresent &&
            step.proposedVisualEffects !== null &&
            step.proposedVisualEffects !== undefined &&
            step.expectedResult === step.proposedVisualEffects) {
            warnings.push('expectedResult must not be copied from proposedVisualEffects');
        }

        return {
            passed:                  reasons.length === 0,
            blockedReasons:          reasons,
            warnings:                warnings,
            selectedDecisionStatus:  { present: sdPresent, passed: sdResult.passed },
            expectedResultStatus:    { present: erPresent, passed: erResult.passed },
            previewCompleteEligible: sdResult.passed && erResult.passed && ecaOk
        };
    }

    // ── PR-263: Wargame 3 Decision Options Preview Adapter ───────────────────
    // Pure function. No DOM. No map. No window.units. No window.RmoozScenario.
    // No storage. No network. No mutation. No selectedDecision creation.
    // No expectedResult creation. No previewComplete change.
    //
    // Reads step.decisionOptions[], validates each option with
    // isWargame3DecisionOptionSafe, and returns display-safe read-only COA data.
    //
    // Returns:
    //   { passed, options[], blockedOptions[], optionCount, validOptionCount,
    //     blockedOptionCount, hasOptions, displayMode, warnings[], blockedReasons[] }
    //
    // Each valid option in options[]:
    //   { id, label, description, intent, source, readOnly:true,
    //     affectedUnitsCount, expectedEffectsCount, risksCount,
    //     affectedUnits[], expectedEffects[], risks[],
    //     priority, displayIndex, displayLabel }
    //
    // displayMode: "read_only" when at least one valid option exists;
    //              "hidden"    when options are absent, empty, or all blocked.
    function buildWargame3DecisionOptionsPreviewData(step, options) {
        var opts = options || {};

        // Rule 1: null/non-object step
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            return {
                passed:             false,
                options:            [],
                blockedOptions:     [],
                optionCount:        0,
                validOptionCount:   0,
                blockedOptionCount: 0,
                hasOptions:         false,
                displayMode:        'hidden',
                warnings:           [],
                blockedReasons:     ['step must be a non-null object']
            };
        }

        // Rules 2–3: missing or null decisionOptions — not an error, just hidden
        if (!Object.prototype.hasOwnProperty.call(step, 'decisionOptions') ||
            step.decisionOptions === null || step.decisionOptions === undefined) {
            return {
                passed:             true,
                options:            [],
                blockedOptions:     [],
                optionCount:        0,
                validOptionCount:   0,
                blockedOptionCount: 0,
                hasOptions:         false,
                displayMode:        'hidden',
                warnings:           [],
                blockedReasons:     []
            };
        }

        // Rule 4: decisionOptions must be an array
        if (!Array.isArray(step.decisionOptions)) {
            return {
                passed:             false,
                options:            [],
                blockedOptions:     [],
                optionCount:        0,
                validOptionCount:   0,
                blockedOptionCount: 0,
                hasOptions:         false,
                displayMode:        'hidden',
                warnings:           [],
                blockedReasons:     ['step.decisionOptions must be an array']
            };
        }

        // Empty array: not an error; display mode is hidden
        if (step.decisionOptions.length === 0) {
            return {
                passed:             true,
                options:            [],
                blockedOptions:     [],
                optionCount:        0,
                validOptionCount:   0,
                blockedOptionCount: 0,
                hasOptions:         false,
                displayMode:        'hidden',
                warnings:           [],
                blockedReasons:     []
            };
        }

        var validItems   = [];
        var blockedItems = [];
        var dispIdx      = 0;
        var totalCount   = step.decisionOptions.length;

        for (var i = 0; i < totalCount; i++) {
            var raw         = step.decisionOptions[i];
            var guardResult = isWargame3DecisionOptionSafe(raw);

            if (guardResult.passed) {
                dispIdx++;

                // Build sanitized display-safe object.
                // Only known safe fields are copied — raw object is never spread.
                var safeId     = typeof raw.id    === 'string' ? raw.id    : '';
                var safeLabel  = typeof raw.label  === 'string' ? raw.label  : '';
                var safeDesc   = typeof raw.description === 'string' ? raw.description : '';
                var safeIntent = typeof raw.intent      === 'string' ? raw.intent      : '';
                var safeSrc    = (raw.source === 'source_json' || raw.source === 'instructor')
                    ? raw.source : 'source_json';
                var safeAU     = Array.isArray(raw.affectedUnits)   ? raw.affectedUnits.slice()   : [];
                var safeEE     = Array.isArray(raw.expectedEffects) ? raw.expectedEffects.slice() : [];
                var safeRisks  = Array.isArray(raw.risks)           ? raw.risks.slice()           : [];

                // Rule 29: priority — allowed only when string or number; never object
                var safePriority = null;
                if (Object.prototype.hasOwnProperty.call(raw, 'priority')) {
                    if (typeof raw.priority === 'string' || typeof raw.priority === 'number') {
                        safePriority = raw.priority;
                    }
                }

                var dispLabel = 'COA ' + dispIdx + ' of ' + totalCount + ' — ' + safeLabel;

                validItems.push({
                    id:                   safeId,
                    label:                safeLabel,
                    description:          safeDesc,
                    intent:               safeIntent,
                    source:               safeSrc,
                    readOnly:             true,
                    affectedUnitsCount:   safeAU.length,
                    expectedEffectsCount: safeEE.length,
                    risksCount:           safeRisks.length,
                    affectedUnits:        safeAU,
                    expectedEffects:      safeEE,
                    risks:                safeRisks,
                    priority:             safePriority,
                    displayIndex:         dispIdx,
                    displayLabel:         dispLabel
                });

            } else {
                // Rule 8: record blocked options with only safe-to-expose metadata
                var blkId    = (raw && typeof raw === 'object' && typeof raw.id    === 'string') ? raw.id    : null;
                var blkLabel = (raw && typeof raw === 'object' && typeof raw.label === 'string') ? raw.label : null;
                blockedItems.push({
                    id:             blkId,
                    label:          blkLabel,
                    blockedReasons: guardResult.blockedReasons
                });
            }
        }

        // Rules 9–10: displayMode
        var displayMode = validItems.length > 0 ? 'read_only' : 'hidden';

        return {
            passed:             true,
            options:            validItems,
            blockedOptions:     blockedItems,
            optionCount:        totalCount,
            validOptionCount:   validItems.length,
            blockedOptionCount: blockedItems.length,
            hasOptions:         validItems.length > 0,
            displayMode:        displayMode,
            warnings:           [],
            blockedReasons:     []
        };
    }

    // ── PR-266: Wargame 3 Operator Selection Dry-Run Record Helpers ──────────
    // Pure functions. No DOM. No map. No window.units. No window.RmoozScenario.
    // No storage. No network. No mutation. No expectedResult creation.
    // No previewComplete change. No apply. No commit. No execute. No Gate 7.
    // No simulation. No journal.
    //
    // isWargame3OperatorSelectionDryRunRecordSafe(record, options?)
    //   Validates a dry-run selection record against all required shape rules.
    //   Returns { passed, blockedReasons[], warnings[] }.
    //
    // buildWargame3OperatorSelectionDryRunRecord(step, optionId, options?)
    //   Builds a safe in-memory dry-run selection record from a step + optionId.
    //   Uses buildWargame3DecisionOptionsPreviewData to validate the source options.
    //   Returns { passed, record|null, blockedReasons[], warnings[] }.

    var _W3SEL_VALID_STATUSES       = ['draft', 'selected_for_review', 'cancelled'];
    var _W3SEL_FORBIDDEN_REC_FIELDS = ['expectedResult', 'previewComplete'];

    function isWargame3OperatorSelectionDryRunRecordSafe(record, options) {
        var reasons = []; var warnings = [];

        // Rule 1: null/array/non-object
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            return {
                passed: false,
                blockedReasons: ['record must be a non-null, non-array object'],
                warnings: []
            };
        }

        // Rule 2: required top-level string fields
        if (typeof record.id !== 'string' || record.id === '') {
            reasons.push('record.id must be a non-empty string');
        }
        if (typeof record.stepRef !== 'string' || record.stepRef === '') {
            reasons.push('record.stepRef must be a non-empty string');
        }
        if (typeof record.optionRef !== 'string' || record.optionRef === '') {
            reasons.push('record.optionRef must be a non-empty string');
        }

        // Rules 5, 7, 8, 9, 3: selectedDecision
        if (!record.selectedDecision ||
            typeof record.selectedDecision !== 'object' ||
            Array.isArray(record.selectedDecision)) {
            reasons.push('record.selectedDecision must be a non-null, non-array object');
        } else {
            // Rule 5: delegate to base guard
            var sdResult = isWargame3SelectedDecisionSafe(record.selectedDecision, options);
            if (!sdResult.passed) {
                for (var sdi = 0; sdi < sdResult.blockedReasons.length; sdi++) {
                    reasons.push('selectedDecision: ' + sdResult.blockedReasons[sdi]);
                }
            }
            // Rule 7: source must be "operator"
            if (record.selectedDecision.source !== 'operator') {
                reasons.push('record.selectedDecision.source must be "operator"');
            }
            // Rule 8: confidence must be "explicit"
            if (record.selectedDecision.confidence !== 'explicit') {
                reasons.push('record.selectedDecision.confidence must be "explicit"');
            }
            // Rule 9: readOnly must be true
            if (record.selectedDecision.readOnly !== true) {
                reasons.push('record.selectedDecision.readOnly must be true');
            }
            // Rule 3: optionRef cross-check with selectedDecision.optionRef
            if (typeof record.optionRef === 'string' && record.optionRef !== '' &&
                typeof record.selectedDecision.optionRef === 'string') {
                if (record.selectedDecision.optionRef !== record.optionRef) {
                    reasons.push(
                        'record.selectedDecision.optionRef must match record.optionRef');
                }
            }
        }

        // Rules 6, 4: sourceOption
        if (!record.sourceOption ||
            typeof record.sourceOption !== 'object' ||
            Array.isArray(record.sourceOption)) {
            reasons.push('record.sourceOption must be a non-null, non-array object');
        } else {
            // Rule 6: delegate to option guard
            var soResult = isWargame3DecisionOptionSafe(record.sourceOption, options);
            if (!soResult.passed) {
                for (var soi = 0; soi < soResult.blockedReasons.length; soi++) {
                    reasons.push('sourceOption: ' + soResult.blockedReasons[soi]);
                }
            }
            // Rule 4: optionRef cross-check with sourceOption.id
            if (typeof record.optionRef === 'string' && record.optionRef !== '' &&
                typeof record.sourceOption.id === 'string') {
                if (record.sourceOption.id !== record.optionRef) {
                    reasons.push('record.sourceOption.id must match record.optionRef');
                }
            }
        }

        // Rules 10–12: safety flags
        if (record.dryRunOnly !== true) {
            reasons.push('record.dryRunOnly must be true');
        }
        if (record.liveMutationAllowed !== false) {
            reasons.push('record.liveMutationAllowed must be false');
        }
        if (record.backendCommitAllowed !== false) {
            reasons.push('record.backendCommitAllowed must be false');
        }

        // Rule 13: status value
        if (_W3SEL_VALID_STATUSES.indexOf(record.status) === -1) {
            reasons.push('record.status must be one of: ' +
                _W3SEL_VALID_STATUSES.join(', '));
        }

        // Rule 14: unsafe fields on the record itself
        for (var ufi = 0; ufi < _W3DRS_UNSAFE_FIELDS.length; ufi++) {
            if (Object.prototype.hasOwnProperty.call(record, _W3DRS_UNSAFE_FIELDS[ufi])) {
                reasons.push('record contains unsafe field: ' + _W3DRS_UNSAFE_FIELDS[ufi]);
            }
        }

        // Rules 15–16: forbidden high-level fields
        for (var ffi = 0; ffi < _W3SEL_FORBIDDEN_REC_FIELDS.length; ffi++) {
            if (Object.prototype.hasOwnProperty.call(
                    record, _W3SEL_FORBIDDEN_REC_FIELDS[ffi])) {
                reasons.push('record must not contain field: ' +
                    _W3SEL_FORBIDDEN_REC_FIELDS[ffi]);
            }
        }

        return { passed: reasons.length === 0, blockedReasons: reasons, warnings: warnings };
    }

    function buildWargame3OperatorSelectionDryRunRecord(step, optionId, options) {
        var opts = options || {};

        // Rule 1: null/non-object step
        if (!step || typeof step !== 'object' || Array.isArray(step)) {
            return {
                passed: false, record: null,
                blockedReasons: ['step must be a non-null, non-array object'],
                warnings: []
            };
        }

        // Rule 2: missing/empty optionId
        if (typeof optionId !== 'string' || optionId === '') {
            return {
                passed: false, record: null,
                blockedReasons: ['optionId must be a non-empty string'],
                warnings: []
            };
        }

        // Resolve stepRef — prefer explicit stepRef, then activeStepId, then step_id
        var stepRef = (typeof step.stepRef    === 'string' && step.stepRef)    ? step.stepRef
                    : (typeof step.activeStepId === 'string' && step.activeStepId) ? step.activeStepId
                    : (typeof step.step_id      === 'string' && step.step_id)      ? step.step_id
                    : '';
        if (!stepRef) {
            return {
                passed: false, record: null,
                blockedReasons: ['step must provide stepRef, activeStepId, or step_id as a non-empty string'],
                warnings: []
            };
        }

        // Rules 3–4: validate decisionOptions through PR-263 adapter
        var previewData = buildWargame3DecisionOptionsPreviewData(step);
        if (!previewData.passed) {
            return {
                passed: false, record: null,
                blockedReasons: previewData.blockedReasons,
                warnings: previewData.warnings
            };
        }
        if (!previewData.hasOptions) {
            return {
                passed: false, record: null,
                blockedReasons: ['step has no valid decisionOptions to select from'],
                warnings: []
            };
        }

        // Rules 5–7: find the requested option in the validated set
        var safeOption = null;
        for (var i = 0; i < previewData.options.length; i++) {
            if (previewData.options[i].id === optionId) {
                safeOption = previewData.options[i];
                break;
            }
        }
        if (!safeOption) {
            // Check whether optionId was blocked by the guard
            var wasBlocked = false;
            for (var j = 0; j < previewData.blockedOptions.length; j++) {
                if (previewData.blockedOptions[j].id === optionId) {
                    wasBlocked = true;
                    break;
                }
            }
            return {
                passed: false, record: null,
                blockedReasons: [
                    wasBlocked
                        ? 'option "' + optionId + '" was blocked by safety validation'
                        : 'option "' + optionId + '" not found in step.decisionOptions'
                ],
                warnings: []
            };
        }

        // Resolve optional builder inputs
        var operatorId = (typeof opts.operatorId === 'string' && opts.operatorId)
            ? opts.operatorId : null;
        var createdAt  = (typeof opts.createdAt  === 'string' && opts.createdAt)
            ? opts.createdAt  : null;
        var status     = (typeof opts.status === 'string') ? opts.status : 'draft';

        // Validate status before building
        if (_W3SEL_VALID_STATUSES.indexOf(status) === -1) {
            return {
                passed: false, record: null,
                blockedReasons: ['options.status must be one of: ' +
                    _W3SEL_VALID_STATUSES.join(', ')],
                warnings: []
            };
        }

        // Rule 8: build selectedDecision sub-object
        var selectedDecision = {
            id:          'SEL-' + stepRef + '-' + safeOption.id,
            label:       safeOption.label,
            description: 'Operator selected ' + safeOption.label + ' for ' + stepRef + '.',
            source:      'operator',
            selectedAt:  createdAt,
            selectedBy:  operatorId,
            optionRef:   safeOption.id,
            confidence:  'explicit',
            readOnly:    true
        };

        // Rule 9: build sourceOption snapshot (core fields only from the safe option)
        var sourceOption = {
            id:          safeOption.id,
            label:       safeOption.label,
            description: safeOption.description,
            intent:      safeOption.intent,
            source:      safeOption.source,
            readOnly:    true
        };

        // Rule 10: assemble the dry-run record
        var record = {
            id:                   'W3-SEL-' + stepRef + '-' + safeOption.id,
            stepRef:              stepRef,
            optionRef:            safeOption.id,
            selectedDecision:     selectedDecision,
            sourceOption:         sourceOption,
            status:               status,
            dryRunOnly:           true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,
            createdAt:            createdAt,
            createdBy:            operatorId
        };

        // Rule 11: validate the assembled record with the type guard
        var finalCheck = isWargame3OperatorSelectionDryRunRecordSafe(record, opts);
        if (!finalCheck.passed) {
            return {
                passed: false, record: null,
                blockedReasons: finalCheck.blockedReasons,
                warnings: finalCheck.warnings
            };
        }

        return { passed: true, record: record, blockedReasons: [], warnings: [] };
    }

    // ── PR-241: Wargame 3 Read-Only Map Overlay Data Builder ────────────────
    // Pure function. Converts a safe preview object into read-only overlay data
    // suitable for future map visualization PRs.
    //
    // Safety invariants:
    //   - Reads only from the supplied preview argument. No window.RmoozScenario,
    //     window.units, window.lines, or DOM reads.
    //   - No coordinates invented: lat/lon stay null when absent from preview.
    //   - Capped at 12 markers (MAX_MARKERS). Excess units produce a warning.
    //   - Effect hints are text-only descriptions — no map graphics, no Leaflet.
    //   - Preview input is never mutated.
    //   - Self-checked with isWargame3ReadOnlyMapOverlayDataSafe before returning.
    //
    // Returns { passed, overlay|null, blockedReasons, warnings }.
    function buildWargame3ReadOnlyMapOverlayData(preview, options) {
        var blocked  = [];
        var warnings = [];

        // ── Input guard ─────────────────────────────────────────────────────
        if (!preview || typeof preview !== 'object' || Array.isArray(preview)) {
            blocked.push('preview must be a non-null object and not an array');
            return { passed: false, overlay: null, blockedReasons: blocked, warnings: warnings };
        }
        if (preview.readOnly !== true) {
            blocked.push('preview.readOnly must be true');
        }
        if (preview.liveMutationAllowed !== false) {
            blocked.push('preview.liveMutationAllowed must be false');
        }
        if (blocked.length > 0) {
            return { passed: false, overlay: null, blockedReasons: blocked, warnings: warnings };
        }

        // ── Identity ────────────────────────────────────────────────────────
        var stepRef = (typeof preview.activeStepId === 'string' && preview.activeStepId)
                    ? preview.activeStepId : '—';
        var title   = (typeof preview.stepSummary  === 'string' && preview.stepSummary)
                    ? preview.stepSummary  : '';
        var phase   = '';
        if (title) {
            var dashIdx = title.indexOf(' — ');
            if (dashIdx > -1) { phase = title.slice(0, dashIdx).trim(); }
        }
        if (!phase && stepRef !== '—') { phase = stepRef; }

        // ── A. Markers — from preview.unitsReferenced only ──────────────────
        var MAX_MARKERS = 12;
        var markers          = [];
        var rawUnits         = Array.isArray(preview.unitsReferenced) ? preview.unitsReferenced : [];
        var unitsMissingCoord = 0;

        if (rawUnits.length === 0) {
            warnings.push({ code: 'W3MOD_NO_UNITS',
                            message: 'preview has no unitsReferenced — marker overlay will be empty' });
        }

        for (var ui = 0; ui < Math.min(rawUnits.length, MAX_MARKERS); ui++) {
            var u = rawUnits[ui];
            if (!u || typeof u !== 'object' || Array.isArray(u)) { continue; }

            var lat      = null;
            var lon      = null;
            var hasCoord = false;

            if (u.startLocation && typeof u.startLocation === 'object') {
                var rawLat = u.startLocation.lat;
                var rawLon = (u.startLocation.lng !== undefined) ? u.startLocation.lng
                           : (u.startLocation.lon !== undefined) ? u.startLocation.lon : undefined;
                if (typeof rawLat === 'number' && isFinite(rawLat) &&
                    typeof rawLon === 'number' && isFinite(rawLon)) {
                    lat      = rawLat;
                    lon      = rawLon;
                    hasCoord = true;
                }
            }
            if (!hasCoord) { unitsMissingCoord++; }

            markers.push({
                kind:          'unit_preview_marker',
                uid:           (typeof u.uid         === 'string') ? u.uid         : '',
                name:          (typeof u.displayName === 'string') ? u.displayName
                              :(typeof u.name        === 'string') ? u.name        : '',
                side:          (typeof u.side  === 'string') ? u.side  : '',
                role:          (typeof u.role  === 'string') ? u.role  : '',
                lat:           lat,
                lon:           lon,
                hasCoordinate: hasCoord,
                source:        'preview_unit',
                readOnly:      true
            });
        }

        if (rawUnits.length > MAX_MARKERS) {
            warnings.push({ code: 'W3MOD_MARKERS_CAPPED',
                            message: 'unitsReferenced has ' + rawUnits.length + ' entries; capped at ' + MAX_MARKERS });
        }
        if (unitsMissingCoord > 0) {
            warnings.push({ code: 'W3MOD_UNITS_NO_COORD',
                            message: unitsMissingCoord + ' unit(s) have no start location — lat/lon left null' });
        }

        // ── B. Objective highlights ─────────────────────────────────────────
        var objectiveHighlights = [];
        var rawObjs  = Array.isArray(preview.objectivesReferenced) ? preview.objectivesReferenced : [];
        var objStatus = (typeof preview.objectiveStatusBaseline === 'string' &&
                         preview.objectiveStatusBaseline)
                      ? preview.objectiveStatusBaseline : null;
        var objsMissingCoord = 0;

        for (var oi2 = 0; oi2 < rawObjs.length; oi2++) {
            var obj = rawObjs[oi2];
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { continue; }

            // PR-252: read objective coordinate from .location if propagated by buildScenarioStepPreview.
            // Source: w3json.obj.coord → _w3aLonLatToStartLoc → fixture.objectives[N].location
            //         → buildScenarioStepPreview resolvedObjectives[N].location → here.
            // Coordinates are never invented: null stays null when source is absent.
            var _ohLat = null, _ohLon = null, _ohHasCoord = false;
            if (obj.location && typeof obj.location === 'object') {
                var _ohRawLat = obj.location.lat;
                var _ohRawLon = (obj.location.lng !== undefined) ? obj.location.lng
                               : (obj.location.lon !== undefined) ? obj.location.lon : undefined;
                if (typeof _ohRawLat === 'number' && isFinite(_ohRawLat) &&
                    typeof _ohRawLon === 'number' && isFinite(_ohRawLon)) {
                    _ohLat      = _ohRawLat;
                    _ohLon      = _ohRawLon;
                    _ohHasCoord = true;
                }
            }
            if (!_ohHasCoord) { objsMissingCoord++; }

            objectiveHighlights.push({
                kind:          'objective_preview_highlight',
                objectiveId:   (typeof obj.id          === 'string') ? obj.id          : '',
                name:          (typeof obj.description === 'string') ? obj.description : '',
                status:        (oi2 === 0 && objStatus) ? objStatus : '',
                lat:           _ohLat,
                lon:           _ohLon,
                hasCoordinate: _ohHasCoord,
                source:        'preview_objective',
                readOnly:      true
            });
        }

        if (objsMissingCoord > 0) {
            warnings.push({ code: 'W3MOD_OBJS_NO_COORD',
                            message: objsMissingCoord + ' objective(s) carry no coordinate data — lat/lon left null' });
        }
        if (rawObjs.length === 0 && !objStatus) {
            warnings.push({ code: 'W3MOD_NO_OBJECTIVES',
                            message: 'preview has no objectivesReferenced and no objectiveStatusBaseline' });
        }

        // ── C. Effect hints — text only, no map graphics ────────────────────
        var effectHints  = [];
        var rawEffects   = Array.isArray(preview.proposedVisualEffects) ? preview.proposedVisualEffects : [];

        for (var efi = 0; efi < rawEffects.length; efi++) {
            var eff = rawEffects[efi];
            if (!eff || typeof eff !== 'object' || Array.isArray(eff)) { continue; }
            if (typeof eff.type !== 'string' || typeof eff.description !== 'string') { continue; }

            effectHints.push({
                kind:       'text_only_effect_hint',
                effectType: String(eff.type),
                message:    String(eff.description),
                source:     'proposed_visual_effect',
                readOnly:   true
            });
        }

        if (rawEffects.length === 0) {
            warnings.push({ code: 'W3MOD_NO_EFFECTS',
                            message: 'preview has no proposedVisualEffects — effect hint list will be empty' });
        }

        // ── D. Carry forward preview warnings ──────────────────────────────
        var previewWarns = Array.isArray(preview.warningsDetail) ? preview.warningsDetail : [];
        for (var wi = 0; wi < previewWarns.length; wi++) {
            var pw = previewWarns[wi];
            if (!pw) { continue; }
            if (typeof pw === 'string') {
                warnings.push({ code: 'PREVIEW_WARN', message: pw });
            } else if (typeof pw === 'object' && !Array.isArray(pw) &&
                       typeof pw.message === 'string') {
                warnings.push({ code: (typeof pw.code === 'string') ? pw.code : 'PREVIEW_WARN',
                                message: pw.message });
            }
        }

        // ── E. Movement trails — delta between options.previousPreview and current ──
        // Trails are only emitted when BOTH endpoints have valid finite coordinates
        // AND the positions actually differ. With current W3 data all step coordinates
        // are identical (adapter always uses coordTable[uid][0]), so movementTrails
        // will be empty until per-step coordinates are available in the adapter.
        var movementTrails = [];
        var bldOpts      = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var prevPreview  = (bldOpts.previousPreview &&
                            typeof bldOpts.previousPreview === 'object' &&
                            !Array.isArray(bldOpts.previousPreview)) ? bldOpts.previousPreview : null;

        if (prevPreview && Array.isArray(prevPreview.unitsReferenced)) {
            var prevUnitMap = {};
            var prevUnitsArr = prevPreview.unitsReferenced;
            for (var pui = 0; pui < prevUnitsArr.length; pui++) {
                var pu2 = prevUnitsArr[pui];
                if (pu2 && typeof pu2 === 'object' && typeof pu2.uid === 'string' && pu2.uid) {
                    prevUnitMap[pu2.uid] = pu2;
                }
            }

            for (var tui = 0; tui < rawUnits.length; tui++) {
                var tu = rawUnits[tui];
                if (!tu || typeof tu !== 'object' || typeof tu.uid !== 'string' || !tu.uid) { continue; }
                var prevUnit = prevUnitMap[tu.uid];
                if (!prevUnit) { continue; }

                var fromLat = null, fromLon = null;
                if (prevUnit.startLocation && typeof prevUnit.startLocation === 'object') {
                    var pfLat = prevUnit.startLocation.lat;
                    var pfLon = (prevUnit.startLocation.lng !== undefined) ? prevUnit.startLocation.lng
                               : (prevUnit.startLocation.lon !== undefined) ? prevUnit.startLocation.lon : undefined;
                    if (typeof pfLat === 'number' && isFinite(pfLat) &&
                        typeof pfLon === 'number' && isFinite(pfLon)) {
                        fromLat = pfLat;
                        fromLon = pfLon;
                    }
                }

                var toLat = null, toLon = null;
                if (tu.startLocation && typeof tu.startLocation === 'object') {
                    var ptLat = tu.startLocation.lat;
                    var ptLon = (tu.startLocation.lng !== undefined) ? tu.startLocation.lng
                               : (tu.startLocation.lon !== undefined) ? tu.startLocation.lon : undefined;
                    if (typeof ptLat === 'number' && isFinite(ptLat) &&
                        typeof ptLon === 'number' && isFinite(ptLon)) {
                        toLat = ptLat;
                        toLon = ptLon;
                    }
                }

                if (fromLat === null || toLat === null) { continue; }
                if (fromLat === toLat && fromLon === toLon) { continue; }

                movementTrails.push({
                    kind:          'unit_preview_movement_trail',
                    uid:           tu.uid,
                    name:          (typeof tu.displayName === 'string') ? tu.displayName
                                  :(typeof tu.name        === 'string') ? tu.name        : '',
                    side:          (typeof tu.side  === 'string') ? tu.side  : '',
                    role:          (typeof tu.role  === 'string') ? tu.role  : '',
                    fromLat:       fromLat,
                    fromLon:       fromLon,
                    toLat:         toLat,
                    toLon:         toLon,
                    hasCoordinate: true,
                    source:        'preview_step_delta',
                    readOnly:      true
                });
            }
        }

        // ── Assemble overlay ────────────────────────────────────────────────
        var overlay = {
            overlayType:         'wargame3_preview_read_only',
            source:              'dry_run_preview',
            stepRef:             stepRef,
            title:               title,
            phase:               phase,
            readOnly:            true,
            liveMutationAllowed: false,
            markers:             markers,
            objectiveHighlights: objectiveHighlights,
            effectHints:         effectHints,
            movementTrails:      movementTrails,
            warnings:            warnings,
            blockedReasons:      blocked
        };

        // ── Self-check ──────────────────────────────────────────────────────
        var guard = isWargame3ReadOnlyMapOverlayDataSafe(overlay);
        if (!guard.passed) {
            return { passed: false, overlay: null,
                     blockedReasons: guard.blockedReasons, warnings: warnings };
        }

        return { passed: true, overlay: overlay,
                 blockedReasons: blocked, warnings: warnings };
    }

    // ── PR-243: Wargame 3 Preview Map Overlay Bridge ─────────────────────────
    // Internal helper — called once per _paintToDOM render when isW3 is true.
    // Chains: buildWargame3ReadOnlyMapOverlayData(preview) →
    //         paintWargame3ReadOnlyMapOverlay(overlay)
    //
    // Safety invariants:
    //   - Only called with a preview that already passed readOnly/liveMutationAllowed checks.
    //   - Validates the preview is genuinely W3 (activeStepId matches /^W3-STEP-/).
    //   - If any step fails, clears the previous W3 preview overlay and returns safely.
    //   - Does not read window.units, window.lines, or window.RmoozScenario.
    //   - Does not mutate window.RmoozScenario.stepIndex.
    //   - Does not fetch, store, or call backend/AI/simulation.
    //   - Does not add UI controls.
    function paintWargame3PreviewMapOverlayFromPreview(preview) {
        var blocked  = [];
        var warnings = [];

        // 1. Basic preview guard (callers already validate readOnly/liveMutationAllowed,
        //    but re-check here for defensive safety in direct console calls).
        if (!preview || typeof preview !== 'object' || Array.isArray(preview)) {
            clearWargame3ReadOnlyMapOverlay();
            return { passed: false, painted: false, markerCount: 0,
                     objectiveHighlightCount: 0, effectHintCount: 0,
                     movementTrailCount: 0, skippedCount: 0,
                     blockedReasons: ['preview must be a non-null object'], warnings: warnings };
        }
        if (preview.readOnly !== true || preview.liveMutationAllowed !== false) {
            clearWargame3ReadOnlyMapOverlay();
            blocked.push('preview must have readOnly:true and liveMutationAllowed:false');
            return { passed: false, painted: false, markerCount: 0,
                     objectiveHighlightCount: 0, effectHintCount: 0,
                     movementTrailCount: 0, skippedCount: 0,
                     blockedReasons: blocked, warnings: warnings };
        }

        // 2. W3 identity guard — only proceed for W3-STEP-NN prefixed previews
        var isW3Preview = (typeof preview.activeStepId === 'string' &&
                           /^W3-STEP-/i.test(preview.activeStepId));
        if (!isW3Preview) {
            clearWargame3ReadOnlyMapOverlay();
            return { passed: true, painted: false, markerCount: 0,
                     objectiveHighlightCount: 0, effectHintCount: 0,
                     movementTrailCount: 0, skippedCount: 0,
                     blockedReasons: [],
                     warnings: [{ code: 'W3BRIDGE_NOT_W3',
                                  message: 'preview is not a W3-STEP preview — overlay cleared' }] };
        }

        // 2b. Compute previousPreview for delta movement trails (PR-245).
        // Parses the current step index from activeStepId and builds step N-1.
        // Only attempted when _drpPreviewSource is loaded (W3 nav is active).
        // Does NOT mutate _drpPreviewStepRef or window.RmoozScenario.
        var previousPreview = null;
        var stepIdM = preview.activeStepId.match(/W3-STEP-(\d+)/i);
        if (stepIdM && _drpPreviewSource) {
            var curStepIdx = parseInt(stepIdM[1], 10);
            if (curStepIdx > 0) {
                var prevStepIdx = curStepIdx - 1;
                var prevNN      = prevStepIdx < 10 ? ('0' + prevStepIdx) : String(prevStepIdx);
                var prevStepRef = 'W3-STEP-' + prevNN;
                var ppResult    = buildScenarioStepPreview(_drpPreviewSource, prevStepRef);
                if (ppResult.passed && ppResult.preview) {
                    previousPreview = ppResult.preview;
                }
            }
        }

        // 3. Build overlay data from preview (PR-241/245)
        var buildResult = buildWargame3ReadOnlyMapOverlayData(preview, { previousPreview: previousPreview });
        if (!buildResult.passed || !buildResult.overlay) {
            clearWargame3ReadOnlyMapOverlay();
            return { passed: false, painted: false, markerCount: 0,
                     objectiveHighlightCount: 0, effectHintCount: 0,
                     movementTrailCount: 0, skippedCount: 0,
                     blockedReasons: buildResult.blockedReasons,
                     warnings: buildResult.warnings };
        }

        // 4. Paint the overlay (PR-242) — clears previous before painting
        var paintResult = paintWargame3ReadOnlyMapOverlay(buildResult.overlay);
        return {
            passed:                  paintResult.passed,
            painted:                 paintResult.painted,
            markerCount:             paintResult.markerCount,
            objectiveHighlightCount: paintResult.objectiveHighlightCount,
            effectHintCount:         paintResult.effectHintCount,
            movementTrailCount:      paintResult.movementTrailCount,
            skippedCount:            paintResult.skippedCount,
            blockedReasons:          paintResult.blockedReasons,
            warnings:                paintResult.warnings
        };
    }

    // ── PR-242: Wargame 3 Read-Only Map Overlay Paint Hook ──────────────────
    // clearWargame3ReadOnlyMapOverlay — removes only the private preview layer.
    // Does NOT touch live unit markers, lines, or any other map layer.
    // Safe to call repeatedly even when no preview layer exists.
    function clearWargame3ReadOnlyMapOverlay() {
        var cleared = false;
        try {
            if (_w3PreviewLayer) {
                _w3PreviewLayer.clearLayers();
                if (window.map) { window.map.removeLayer(_w3PreviewLayer); }
                _w3PreviewLayer = null;
                cleared = true;
            }
        } catch (ex) {
            return { passed: false, cleared: false,
                     blockedReasons: ['clearWargame3ReadOnlyMapOverlay exception: ' + String(ex)],
                     warnings: [] };
        }
        return { passed: true, cleared: cleared, blockedReasons: [], warnings: [] };
    }

    // paintWargame3ReadOnlyMapOverlay — converts PR-241 overlay data into temporary
    // read-only Leaflet markers/highlights on a private layer group.
    //
    // Safety invariants:
    //   - Validates input with isWargame3ReadOnlyMapOverlayDataSafe before any paint.
    //   - Clears previous preview layer before creating a new one.
    //   - Only paints markers/objectives that have hasCoordinate === true.
    //   - Never invents or looks up coordinates from window.units or scenario.
    //   - Effect hints are counted but not painted (no safe coordinates yet).
    //   - Never touches window.units, window.lines, window.RmoozScenario.
    //   - Never touches live scenario layers or other map layers.
    //   - No fetch, no storage, no backend, no simulation, no journal.
    function paintWargame3ReadOnlyMapOverlay(overlay, options) {
        var blocked     = [];
        var warnings    = [];
        var markerCount = 0;
        var objCount    = 0;
        var effCount    = 0;
        var trailCount  = 0;
        var skipped     = 0;

        // 1. Type guard
        var guard = isWargame3ReadOnlyMapOverlayDataSafe(overlay);
        if (!guard.passed) {
            return { passed: false, painted: false,
                     markerCount: 0, objectiveHighlightCount: 0,
                     effectHintCount: 0, skippedCount: 0,
                     blockedReasons: guard.blockedReasons, warnings: warnings };
        }

        // 2. Map availability guard
        if (!window.L || !window.map) {
            blocked.push('Leaflet map is unavailable (window.L or window.map missing)');
            return { passed: false, painted: false,
                     markerCount: 0, objectiveHighlightCount: 0,
                     effectHintCount: 0, skippedCount: 0,
                     blockedReasons: blocked, warnings: warnings };
        }

        // 3. Clear previous preview layer before painting
        clearWargame3ReadOnlyMapOverlay();

        // 4. Create fresh private layer group
        try {
            _w3PreviewLayer = window.L.layerGroup();
            _w3PreviewLayer.addTo(window.map);
        } catch (ex) {
            _w3PreviewLayer = null;
            blocked.push('Failed to create preview layer group: ' + String(ex));
            return { passed: false, painted: false,
                     markerCount: 0, objectiveHighlightCount: 0,
                     effectHintCount: 0, skippedCount: 0,
                     blockedReasons: blocked, warnings: warnings };
        }

        // 5. Markers — from overlay.markers only; coordinates never invented
        var _SIDE_COLOR = { blue: '#5B9BD5', friendly: '#5B9BD5',
                            red: '#E05252',  enemy: '#E05252',
                            neutral: '#6FAD6F', unknown: '#A0A0A0' };
        var rawMarkers = overlay.markers;
        for (var mi = 0; mi < rawMarkers.length; mi++) {
            var mk = rawMarkers[mi];
            if (!mk) { continue; }
            if (!mk.hasCoordinate ||
                typeof mk.lat !== 'number' || !isFinite(mk.lat) ||
                typeof mk.lon !== 'number' || !isFinite(mk.lon)) {
                skipped++;
                warnings.push({ code: 'W3PAINT_NO_COORD',
                                message: 'marker "' + (mk.uid || '?') + '" skipped — no drawable coordinate' });
                continue;
            }
            try {
                var side  = (typeof mk.side === 'string') ? mk.side.toLowerCase() : 'unknown';
                var color = _SIDE_COLOR[side] || '#FFA500';
                var cm    = window.L.circleMarker([mk.lat, mk.lon], {
                    radius:      6,
                    color:       color,
                    fillColor:   color,
                    fillOpacity: 0.30,
                    opacity:     0.75,
                    weight:      1.5,
                    className:   'sw-w3-preview-marker'
                });
                cm.options.readOnly = true;
                var ttLines = ['[PREVIEW] ' + (mk.name || mk.uid || '?')];
                if (mk.side) { ttLines.push(mk.side.toUpperCase()); }
                if (mk.role) { ttLines.push(mk.role); }
                if (mk.uid)  { ttLines.push('uid: ' + mk.uid); }
                cm.bindTooltip(ttLines.join(' · '), { permanent: false, direction: 'top' });
                cm.addTo(_w3PreviewLayer);
                markerCount++;
            } catch (mex) {
                skipped++;
                warnings.push({ code: 'W3PAINT_MARKER_ERR',
                                message: 'marker "' + (mk.uid || '?') + '" error: ' + String(mex) });
            }
        }

        if (rawMarkers.length === 0) {
            warnings.push({ code: 'W3PAINT_NO_MARKER_DATA',
                            message: 'overlay.markers is empty — no drawable marker coordinates' });
        } else if (markerCount === 0) {
            warnings.push({ code: 'W3PAINT_ALL_MARKERS_SKIPPED',
                            message: 'all ' + rawMarkers.length + ' marker(s) skipped — no drawable coordinates' });
        }

        // 6. Objective highlights — from overlay.objectiveHighlights only
        var rawObjs = overlay.objectiveHighlights;
        for (var oi = 0; oi < rawObjs.length; oi++) {
            var oh = rawObjs[oi];
            if (!oh) { continue; }
            if (!oh.hasCoordinate ||
                typeof oh.lat !== 'number' || !isFinite(oh.lat) ||
                typeof oh.lon !== 'number' || !isFinite(oh.lon)) {
                skipped++;
                warnings.push({ code: 'W3PAINT_OBJ_NO_COORD',
                                message: 'objective "' + (oh.objectiveId || '?') + '" skipped — no drawable coordinate' });
                continue;
            }
            try {
                // PR-253: circleMarker (pixel radius) — not a range/weapon/detection circle
                var ohc = window.L.circleMarker([oh.lat, oh.lon], {
                    radius:      10,
                    color:       '#FF8C00',
                    fillColor:   '#FFA500',
                    fillOpacity: 0.25,
                    opacity:     0.85,
                    weight:      2.5,
                    className:   'sw-w3-preview-obj'
                });
                ohc.options.readOnly = true;
                var ohParts = ['[PREVIEW OBJ]', (oh.name || oh.objectiveId || '?')];
                if (oh.objectiveId) { ohParts.push('id: ' + oh.objectiveId); }
                if (oh.status)      { ohParts.push('status: ' + oh.status); }
                ohParts.push('read-only preview');
                ohc.bindTooltip(ohParts.join(' \xb7 '), { permanent: false, direction: 'top' });
                ohc.addTo(_w3PreviewLayer);
                objCount++;
            } catch (oex) {
                skipped++;
                warnings.push({ code: 'W3PAINT_OBJ_ERR',
                                message: 'objective "' + (oh.objectiveId || '?') + '" error: ' + String(oex) });
            }
        }

        if (rawObjs.length === 0) {
            warnings.push({ code: 'W3PAINT_NO_OBJ_DATA',
                            message: 'overlay.objectiveHighlights is empty — no drawable objective coordinates' });
        } else if (objCount === 0) {
            warnings.push({ code: 'W3PAINT_ALL_OBJS_SKIPPED',
                            message: 'all ' + rawObjs.length + ' objective(s) skipped — no drawable coordinates' });
        }

        // 7. Effect hints — count only; no map graphics without verified coordinates
        effCount = Array.isArray(overlay.effectHints) ? overlay.effectHints.length : 0;
        if (effCount > 0) {
            warnings.push({ code: 'W3PAINT_EFFECTS_TEXT_ONLY',
                            message: effCount + ' effect hint(s) available but not painted — no verified coordinates yet' });
        }

        // 8. Movement trails — from overlay.movementTrails (PR-245)
        var rawTrails = Array.isArray(overlay.movementTrails) ? overlay.movementTrails : [];
        for (var tri2 = 0; tri2 < rawTrails.length; tri2++) {
            var trail = rawTrails[tri2];
            if (!trail) { continue; }
            if (!trail.hasCoordinate ||
                typeof trail.fromLat !== 'number' || !isFinite(trail.fromLat) ||
                typeof trail.fromLon !== 'number' || !isFinite(trail.fromLon) ||
                typeof trail.toLat   !== 'number' || !isFinite(trail.toLat)   ||
                typeof trail.toLon   !== 'number' || !isFinite(trail.toLon)) {
                skipped++;
                warnings.push({ code: 'W3PAINT_TRAIL_NO_COORD',
                                message: 'trail "' + (trail.uid || '?') + '" skipped — no drawable coordinate pair' });
                continue;
            }
            try {
                var tSide  = (typeof trail.side === 'string') ? trail.side.toLowerCase() : 'unknown';
                var tColor = _SIDE_COLOR[tSide] || '#FFA500';
                var tLine  = window.L.polyline([
                    [trail.fromLat, trail.fromLon],
                    [trail.toLat,   trail.toLon]
                ], {
                    color:     tColor,
                    opacity:   0.65,
                    weight:    2,
                    dashArray: '6 3',
                    className: 'sw-w3-preview-trail'
                });
                tLine.options.readOnly = true;
                var ttParts = ['[PREVIEW TRAIL] ' + (trail.name || trail.uid || '?')];
                if (trail.side) { ttParts.push(trail.side.toUpperCase()); }
                if (trail.role) { ttParts.push(trail.role); }
                tLine.bindTooltip(ttParts.join(' · '), { permanent: false, direction: 'center' });
                tLine.addTo(_w3PreviewLayer);
                trailCount++;
            } catch (tex) {
                skipped++;
                warnings.push({ code: 'W3PAINT_TRAIL_ERR',
                                message: 'trail "' + (trail.uid || '?') + '" error: ' + String(tex) });
            }
        }

        return {
            passed:                  true,
            painted:                 (markerCount + objCount + trailCount) > 0,
            markerCount:             markerCount,
            objectiveHighlightCount: objCount,
            effectHintCount:         effCount,
            movementTrailCount:      trailCount,
            skippedCount:            skipped,
            blockedReasons:          blocked,
            warnings:                warnings
        };
    }

    // ── PR-244: Wargame 3 Map Preview Coverage Audit ─────────────────────────
    // Console-only diagnostic helper. Iterates every W3 step, builds overlay data
    // via the PR-241/242/243 pipeline, and reports coordinate coverage.
    //
    // Safety invariants:
    //   - Input: w3json only. No window.units, window.lines, window.RmoozScenario reads.
    //   - No window.RmoozScenario.stepIndex mutation.
    //   - Default: does NOT paint the map (options.paint defaults to false).
    //   - options.paint === true: paints only the single step named in options.stepRef.
    //   - adaptWargame3ToFixture runs once; buildScenarioStepPreview runs once per step.
    //   - No fetch. No storage. No backend. No AI. No simulation. No journal.
    //   - No UI controls added. No Gate 7/apply/commit/confirm/execute.
    //
    // Returns { passed, scenarioId, stepCount, drawableStepCount, nonDrawableStepCount,
    //           totalMarkers, totalDrawableMarkers, totalSkippedMarkers,
    //           totalObjectiveHighlights, totalEffectHints, steps[], blockedReasons, warnings }.
    function auditWargame3MapPreviewCoverage(w3json, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var blocked  = [];
        var warnings = [];

        // ── Input guard ─────────────────────────────────────────────────────
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            blocked.push('w3json must be a non-null object and not an array');
            return { passed: false, scenarioId: '', stepCount: 0,
                     drawableStepCount: 0, nonDrawableStepCount: 0,
                     totalMarkers: 0, totalDrawableMarkers: 0, totalSkippedMarkers: 0,
                     totalObjectiveHighlights: 0, totalEffectHints: 0,
                     steps: [], blockedReasons: blocked, warnings: warnings };
        }

        // ── Adapt once ──────────────────────────────────────────────────────
        var adaptResult = adaptWargame3ToFixture(w3json);
        if (!adaptResult.passed || !adaptResult.fixture) {
            return { passed: false, scenarioId: '', stepCount: 0,
                     drawableStepCount: 0, nonDrawableStepCount: 0,
                     totalMarkers: 0, totalDrawableMarkers: 0, totalSkippedMarkers: 0,
                     totalObjectiveHighlights: 0, totalEffectHints: 0,
                     steps: [], blockedReasons: adaptResult.blockedReasons,
                     warnings: adaptResult.warnings || [] };
        }
        var fixture   = adaptResult.fixture;
        var scenId    = (typeof w3json.scenario_id === 'string' && w3json.scenario_id)
                      ? w3json.scenario_id : (typeof fixture.fixtureId === 'string' ? fixture.fixtureId : '');
        var stepCount = Array.isArray(fixture.steps) ? fixture.steps.length : 0;

        if (stepCount === 0) {
            blocked.push('fixture has no steps');
            return { passed: false, scenarioId: scenId, stepCount: 0,
                     drawableStepCount: 0, nonDrawableStepCount: 0,
                     totalMarkers: 0, totalDrawableMarkers: 0, totalSkippedMarkers: 0,
                     totalObjectiveHighlights: 0, totalEffectHints: 0,
                     steps: [], blockedReasons: blocked, warnings: warnings };
        }

        // ── Per-step audit ──────────────────────────────────────────────────
        var steps                  = [];
        var totalMarkers           = 0;
        var totalDrawableMarkers   = 0;
        var totalSkippedMarkers    = 0;
        var totalObjHighlights     = 0;
        var totalEffectHints       = 0;
        var totalMovementTrails    = 0;
        var drawableStepCount      = 0;
        var nonDrawableStepCount   = 0;

        // Optional single-step paint target
        var paintEnabled = (opts.paint === true);
        var paintTarget  = (typeof opts.stepRef === 'string' && opts.stepRef) ? opts.stepRef : null;

        var auditPrevStepPreview = null;  // PR-245: carries previous step preview for trail delta

        for (var si = 0; si < stepCount; si++) {
            var rawStep = fixture.steps[si];
            var nn      = si < 10 ? ('0' + si) : String(si);
            var stepRef = (rawStep && typeof rawStep.step_id === 'string' && rawStep.step_id)
                        ? rawStep.step_id : ('W3-STEP-' + nn);
            var title   = (rawStep && typeof rawStep.title === 'string') ? rawStep.title : '';
            var phase   = '';
            if (title) {
                var dIdx = title.indexOf(' — ');
                if (dIdx > -1) { phase = title.slice(0, dIdx).trim(); }
            }

            // Build preview for this step
            var bsspResult = buildScenarioStepPreview(fixture, stepRef);
            if (!bsspResult.passed || !bsspResult.preview) {
                warnings.push({ code: 'W3AUDIT_STEP_FAIL',
                                message: 'step ' + stepRef + ' failed to build: ' +
                                         (bsspResult.blockedReasons[0] || 'unknown') });
                steps.push({
                    stepRef: stepRef, title: title, phase: phase,
                    markerCount: 0, drawableMarkerCount: 0, skippedMarkerCount: 0,
                    objectiveHighlightCount: 0, drawableObjectiveCount: 0,
                    effectHintCount: 0, warningCount: 0,
                    previewComplete: false, mapPreviewUseful: false,
                    warnings: bsspResult.blockedReasons || []
                });
                nonDrawableStepCount++;
                continue;
            }
            var preview = bsspResult.preview;

            // Build overlay data (PR-245: pass previous step preview for trail delta)
            var overlayResult = buildWargame3ReadOnlyMapOverlayData(preview, { previousPreview: auditPrevStepPreview });
            if (!overlayResult.passed || !overlayResult.overlay) {
                warnings.push({ code: 'W3AUDIT_OVERLAY_FAIL',
                                message: 'step ' + stepRef + ' overlay build failed: ' +
                                         (overlayResult.blockedReasons[0] || 'unknown') });
                nonDrawableStepCount++;
                steps.push({
                    stepRef: stepRef, title: title, phase: phase,
                    markerCount: 0, drawableMarkerCount: 0, skippedMarkerCount: 0,
                    objectiveHighlightCount: 0, drawableObjectiveCount: 0,
                    effectHintCount: 0, warningCount: 0,
                    previewComplete: preview.previewComplete || false,
                    mapPreviewUseful: false,
                    warnings: overlayResult.blockedReasons || []
                });
                continue;
            }
            var overlay = overlayResult.overlay;

            // Count markers
            var markers        = overlay.markers;
            var mTotal         = markers.length;
            var mDrawable      = 0;
            var mSkipped       = 0;
            for (var mi = 0; mi < markers.length; mi++) {
                var mk = markers[mi];
                if (mk && mk.hasCoordinate === true &&
                    typeof mk.lat === 'number' && isFinite(mk.lat) &&
                    typeof mk.lon === 'number' && isFinite(mk.lon)) {
                    mDrawable++;
                } else {
                    mSkipped++;
                }
            }

            // Count objective highlights
            var objHighlights   = overlay.objectiveHighlights;
            var ohTotal         = objHighlights.length;
            var ohDrawable      = 0;
            for (var oi = 0; oi < objHighlights.length; oi++) {
                var oh = objHighlights[oi];
                if (oh && oh.hasCoordinate === true &&
                    typeof oh.lat === 'number' && isFinite(oh.lat) &&
                    typeof oh.lon === 'number' && isFinite(oh.lon)) {
                    ohDrawable++;
                }
            }

            // Count effect hints
            var effHints = overlay.effectHints;
            var effCount = effHints ? effHints.length : 0;

            // Count movement trails (PR-245)
            var trailHints     = Array.isArray(overlay.movementTrails) ? overlay.movementTrails : [];
            var trailHintCount = trailHints.length;

            // Carry overlay + preview warnings into step record
            var stepWarns = [];
            var allWarnSrc = (overlayResult.warnings || []).concat(bsspResult.warnings || []);
            for (var wi = 0; wi < allWarnSrc.length; wi++) {
                var w = allWarnSrc[wi];
                if (w && typeof w === 'object' && typeof w.message === 'string') {
                    stepWarns.push(w);
                } else if (typeof w === 'string') {
                    stepWarns.push({ code: 'INFO', message: w });
                }
            }

            var mapUseful = (mDrawable > 0 || ohDrawable > 0);

            // Aggregate totals
            totalMarkers         += mTotal;
            totalDrawableMarkers += mDrawable;
            totalSkippedMarkers  += mSkipped;
            totalObjHighlights   += ohTotal;
            totalEffectHints     += effCount;
            totalMovementTrails  += trailHintCount;
            if (mapUseful) { drawableStepCount++; } else { nonDrawableStepCount++; }

            // Optional single-step paint
            if (paintEnabled && paintTarget && stepRef === paintTarget) {
                paintWargame3PreviewMapOverlayFromPreview(preview);
            }

            // PR-245: advance previous-step pointer for next iteration's trail delta
            auditPrevStepPreview = preview;

            steps.push({
                stepRef:                stepRef,
                title:                  title,
                phase:                  phase,
                markerCount:            mTotal,
                drawableMarkerCount:    mDrawable,
                skippedMarkerCount:     mSkipped,
                objectiveHighlightCount: ohTotal,
                drawableObjectiveCount: ohDrawable,
                effectHintCount:        effCount,
                movementTrailCount:     trailHintCount,
                warningCount:           stepWarns.length,
                previewComplete:        preview.previewComplete || false,
                mapPreviewUseful:       mapUseful,
                warnings:              stepWarns
            });
        }

        return {
            passed:                  true,
            scenarioId:              scenId,
            stepCount:               stepCount,
            drawableStepCount:       drawableStepCount,
            nonDrawableStepCount:    nonDrawableStepCount,
            totalMarkers:            totalMarkers,
            totalDrawableMarkers:    totalDrawableMarkers,
            totalSkippedMarkers:     totalSkippedMarkers,
            totalObjectiveHighlights: totalObjHighlights,
            totalEffectHints:        totalEffectHints,
            totalMovementTrails:     totalMovementTrails,
            steps:                   steps,
            blockedReasons:          blocked,
            warnings:                warnings
        };
    }

    // ── PR-246: Wargame 3 Step Coordinate Delta Audit ────────────────────────
    // Console-only diagnostic. Audits W3 source coordinate fields and adapted
    // fixture output to identify why movementTrails are empty.
    //
    // Safety invariants:
    //   - Input: w3json only. No window.units, window.lines, window.RmoozScenario reads.
    //   - No window.RmoozScenario.stepIndex mutation.
    //   - Does NOT paint the map. Does NOT call paintWargame3ReadOnlyMapOverlay.
    //   - Does NOT call clearWargame3ReadOnlyMapOverlay.
    //   - No fetch. No storage. No backend. No AI. No simulation. No journal.
    //   - No UI controls. No Gate 7/apply/commit/confirm/execute.
    //   - w3json is never mutated.
    //
    // Returns full delta audit object (see spec for complete return shape).
    function auditWargame3StepCoordinateDeltas(w3json, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var blocked  = [];
        var warnings = [];
        var sourceFieldFindings = [];
        var adapterFindings     = [];

        // ── Input guard ─────────────────────────────────────────────────────
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            blocked.push('w3json must be a non-null object and not an array');
            return { passed: false, scenarioId: '', stepCount: 0, unitCount: 0,
                     unitsWithAnyCoordinates: 0, unitsWithStepCoordinateArrays: 0,
                     unitsWithCoordinateDeltas: 0, totalCoordinateSamples: 0,
                     totalDeltaPairs: 0, totalStaticPairs: 0,
                     sourceFieldFindings: blocked, adapterFindings: [],
                     units: [], stepPairs: [], blockedReasons: blocked, warnings: warnings };
        }

        var scenarioId = (typeof w3json.scenario_id === 'string' && w3json.scenario_id)
                       ? w3json.scenario_id : '';

        // ── A. Source-level coordinate field detection ───────────────────────
        // Inspect the four known per-step coordinate tables.
        var W3_COORD_FIELDS = [
            'blue_unit_step_coords', 'red_unit_step_coords',
            'blue_unit_step_prev',   'red_unit_step_prev'
        ];
        var coordTables = {};
        for (var cfi = 0; cfi < W3_COORD_FIELDS.length; cfi++) {
            var cfn = W3_COORD_FIELDS[cfi];
            var cfv = w3json[cfn];
            if (cfv && typeof cfv === 'object' && !Array.isArray(cfv)) {
                coordTables[cfn] = cfv;
                var cfUids = Object.keys(cfv);
                var cfFirst = cfUids[0];
                var cfArr   = cfFirst ? cfv[cfFirst] : null;
                var cfLen   = (cfArr && Array.isArray(cfArr)) ? cfArr.length : 0;
                sourceFieldFindings.push({ field: cfn, present: true,
                                           uidCount: cfUids.length, entryCountPerUid: cfLen });
            } else {
                sourceFieldFindings.push({ field: cfn, present: false,
                                           uidCount: 0, entryCountPerUid: 0 });
                warnings.push({ code: 'SOURCE_FIELD_MISSING',
                                message: 'W3 source is missing field: ' + cfn });
            }
        }

        // ── B. Adapter: run once for names and step count ────────────────────
        var adapterFixture   = null;
        var adapterPassed    = false;
        var adapterStepCount = 0;
        try {
            var adaptR = adaptWargame3ToFixture(w3json);
            adapterPassed    = !!(adaptR.passed && adaptR.fixture);
            if (adapterPassed) {
                adapterFixture   = adaptR.fixture;
                adapterStepCount = Array.isArray(adapterFixture.steps) ? adapterFixture.steps.length : 0;
            }
        } catch (adaptEx) {
            blocked.push('adaptWargame3ToFixture threw: ' + String(adaptEx));
        }

        // Build display-name map from fixture.units
        var nameMap = {};
        if (adapterFixture && Array.isArray(adapterFixture.units)) {
            for (var nmi = 0; nmi < adapterFixture.units.length; nmi++) {
                var nu2 = adapterFixture.units[nmi];
                if (nu2 && typeof nu2.uid === 'string' && nu2.uid) {
                    nameMap[nu2.uid] = (nu2.name && String(nu2.name).trim()) ? String(nu2.name).trim() : nu2.uid;
                }
            }
        }

        // ── C. Per-unit source delta analysis ────────────────────────────────
        // Off-map sentinel: [lon=18, lat=32] — units not yet deployed.
        function _isOffMapCoord(coord) {
            return Array.isArray(coord) && coord.length >= 2 &&
                   coord[0] === 18 && coord[1] === 32;
        }
        // Coord tuple is [lon, lat] in W3 source data.
        function _coordToLatLon(coord) {
            if (!Array.isArray(coord) || coord.length < 2) { return null; }
            var cLon = coord[0], cLat = coord[1];
            if (typeof cLon !== 'number' || !isFinite(cLon) ||
                typeof cLat !== 'number' || !isFinite(cLat)) { return null; }
            return { lat: cLat, lon: cLon };
        }

        var unitAudits           = [];
        var totalSamples         = 0;
        var totalDeltas246       = 0;
        var totalStaticPairs246  = 0;
        var unitsWithAnyCoords   = 0;
        var unitsWithStepArrays  = 0;
        var unitsWithDeltasCount = 0;

        // Audit only the primary current-position tables (not _prev variants)
        var P246_AUDIT_TABLES = [
            { field: 'blue_unit_step_coords', side: 'friendly' },
            { field: 'red_unit_step_coords',  side: 'enemy' }
        ];

        for (var ati = 0; ati < P246_AUDIT_TABLES.length; ati++) {
            var atEntry = P246_AUDIT_TABLES[ati];
            var atTable = coordTables[atEntry.field] || {};
            var atUids  = Object.keys(atTable);

            for (var aui246 = 0; aui246 < atUids.length; aui246++) {
                var p246uid  = atUids[aui246];
                var p246arr  = atTable[p246uid];
                var p246name = nameMap[p246uid] || p246uid;

                if (!Array.isArray(p246arr)) {
                    unitAudits.push({ uid: p246uid, name: p246name, side: atEntry.side,
                                      sourceFieldsFound: [atEntry.field],
                                      sampleCount: 0, validSampleCount: 0,
                                      deltaPairCount: 0, staticPairCount: 0,
                                      firstCoordinate: null, lastCoordinate: null,
                                      changed: false, notes: ['coord entry is not an array'] });
                    continue;
                }

                unitsWithStepArrays++;

                var validEntries = [];
                for (var vei = 0; vei < p246arr.length; vei++) {
                    var vc = _coordToLatLon(p246arr[vei]);
                    if (vc) {
                        validEntries.push({ stepIndex: vei, lat: vc.lat, lon: vc.lon,
                                            offMap: _isOffMapCoord(p246arr[vei]) });
                    }
                }

                totalSamples += validEntries.length;
                if (validEntries.length > 0) { unitsWithAnyCoords++; }

                var p246first   = validEntries.length > 0 ? validEntries[0] : null;
                var p246last    = validEntries.length > 0 ? validEntries[validEntries.length - 1] : null;
                var p246changed = false;
                var p246delta   = 0;
                var p246static  = 0;
                var p246notes   = [];

                for (var dpi = 1; dpi < validEntries.length; dpi++) {
                    var p246prev = validEntries[dpi - 1];
                    var p246cur  = validEntries[dpi];
                    if (p246prev.lat !== p246cur.lat || p246prev.lon !== p246cur.lon) {
                        p246delta++;
                        p246changed = true;
                    } else {
                        p246static++;
                    }
                }

                totalDeltas246      += p246delta;
                totalStaticPairs246 += p246static;
                if (p246changed) { unitsWithDeltasCount++; }

                // Classify movement pattern
                var p246deployStep = null;
                if (p246first && p246first.offMap && p246last && !p246last.offMap) {
                    for (var fdi = 0; fdi < validEntries.length; fdi++) {
                        if (!validEntries[fdi].offMap) { p246deployStep = validEntries[fdi].stepIndex; break; }
                    }
                    p246notes.push('deploys from off-map at step-index ' + p246deployStep);
                }
                if (!p246changed) { p246notes.push('static across all ' + p246arr.length + ' steps'); }
                else if (p246changed && p246deployStep === null) {
                    p246notes.push('position changes within deployed area');
                }

                unitAudits.push({
                    uid:               p246uid,
                    name:              p246name,
                    side:              atEntry.side,
                    sourceFieldsFound: [atEntry.field],
                    sampleCount:       p246arr.length,
                    validSampleCount:  validEntries.length,
                    deltaPairCount:    p246delta,
                    staticPairCount:   p246static,
                    firstCoordinate:   p246first ? { lat: p246first.lat, lon: p246first.lon } : null,
                    lastCoordinate:    p246last  ? { lat: p246last.lat,  lon: p246last.lon  } : null,
                    changed:           p246changed,
                    notes:             p246notes
                });
            }
        }

        var unitCount246 = unitAudits.length;

        // ── D. Adapter-level step comparison ────────────────────────────────
        var stepPairs        = [];
        var adapterDeltaTotal = 0;

        if (adapterPassed && adapterStepCount > 0) {
            var p246Steps = adapterFixture.steps;

            // Build preview for every step
            var stepPreviews = [];
            for (var sti246 = 0; sti246 < p246Steps.length; sti246++) {
                var rawSt246 = p246Steps[sti246];
                var sRef246  = (rawSt246 && typeof rawSt246.step_id === 'string' && rawSt246.step_id)
                             ? rawSt246.step_id : ('W3-STEP-' + (sti246 < 10 ? '0' + sti246 : String(sti246)));
                var pr246 = null;
                try {
                    var bsspR246 = buildScenarioStepPreview(adapterFixture, sRef246);
                    if (bsspR246.passed && bsspR246.preview) { pr246 = bsspR246.preview; }
                } catch (prEx246) {
                    warnings.push({ code: 'PREVIEW_EXCEPTION',
                                    message: 'step ' + sRef246 + ': ' + String(prEx246) });
                }
                stepPreviews.push({ stepRef: sRef246, preview: pr246 });
            }

            // Check if adapter output has ANY delta from step 0 across all steps
            var adapterHasDeltas = false;
            var p246s0map = {};
            if (stepPreviews[0] && stepPreviews[0].preview) {
                var p0us = stepPreviews[0].preview.unitsReferenced || [];
                for (var s0i = 0; s0i < p0us.length; s0i++) {
                    if (p0us[s0i] && p0us[s0i].uid) {
                        p246s0map[p0us[s0i].uid] = p0us[s0i].startLocation;
                    }
                }
            }
            for (var sti2a = 1; sti2a < stepPreviews.length && !adapterHasDeltas; sti2a++) {
                if (!stepPreviews[sti2a].preview) { continue; }
                var sp2us = stepPreviews[sti2a].preview.unitsReferenced || [];
                for (var sui2 = 0; sui2 < sp2us.length; sui2++) {
                    var su2 = sp2us[sui2];
                    if (!su2 || !su2.uid || !su2.startLocation) { continue; }
                    var s0sl2 = p246s0map[su2.uid];
                    if (s0sl2 && (su2.startLocation.lat !== s0sl2.lat ||
                                  su2.startLocation.lng !== s0sl2.lng)) {
                        adapterHasDeltas = true;
                        break;
                    }
                }
            }

            // Adapter-level findings
            if (adapterHasDeltas) {
                adapterFindings.push('Adapter output has per-step coordinate deltas — adapter is step-aware.');
            } else {
                adapterFindings.push(
                    'Adapter output is static: all 17 step previews return step-0 coordinates for every unit.');
                adapterFindings.push(
                    'Root cause: _buildUnit (scenario-workspace.js ~line 3649) always reads ' +
                    'coordTable[uid][0] and labels it "uid — step 0". ' +
                    'Fix (PR-247): pass stepIndex into per-step coordinate resolution, ' +
                    'read coordTable[uid][stepIndex] instead.');
            }
            if (totalDeltas246 > 0 && !adapterHasDeltas) {
                adapterFindings.push(
                    'Source contains ' + totalDeltas246 + ' coordinate delta pairs across ' +
                    unitsWithDeltasCount + ' units, but adapter output has 0 deltas. ' +
                    'Adapter is discarding all per-step movement data.');
                adapterFindings.push(
                    'movementTrails are empty because buildWargame3ReadOnlyMapOverlayData receives ' +
                    'identical startLocation objects for every step from the adapter.');
            } else if (totalDeltas246 === 0) {
                adapterFindings.push(
                    'Source data has no coordinate deltas. ' +
                    'movementTrails would be empty even after fixing the adapter.');
            }

            // Source summary finding
            sourceFieldFindings.push({
                field: 'SUMMARY', present: true,
                finding: unitsWithDeltasCount + ' of ' + unitCount246 + ' source units have per-step ' +
                         'coordinate deltas. Primarily RED units deploying from off-map [18,32] at step-index 5+.'
            });

            // Build per-step-pair comparison (adapter output, not source)
            for (var spi246 = 1; spi246 < stepPreviews.length; spi246++) {
                var fromSP246 = stepPreviews[spi246 - 1];
                var toSP246   = stepPreviews[spi246];
                var movedCnt  = 0;
                var staticCnt = 0;
                var missCnt   = 0;
                var sampleMov = [];

                if (!fromSP246.preview || !toSP246.preview) {
                    stepPairs.push({ fromStepRef: fromSP246.stepRef, toStepRef: toSP246.stepRef,
                                     movedUnitCount: 0, staticUnitCount: 0,
                                     missingUnitCount: 0, sampleMovedUnits: [] });
                    continue;
                }

                var fromMap246 = {};
                var fromUs246 = fromSP246.preview.unitsReferenced || [];
                for (var fui246 = 0; fui246 < fromUs246.length; fui246++) {
                    var fu246 = fromUs246[fui246];
                    if (fu246 && fu246.uid) { fromMap246[fu246.uid] = fu246.startLocation; }
                }

                var toUs246 = toSP246.preview.unitsReferenced || [];
                for (var tui246 = 0; tui246 < toUs246.length; tui246++) {
                    var tu246 = toUs246[tui246];
                    if (!tu246 || !tu246.uid) { continue; }
                    var fromSL246 = fromMap246[tu246.uid];
                    if (!fromSL246 || !tu246.startLocation) { missCnt++; continue; }
                    if (fromSL246.lat !== tu246.startLocation.lat ||
                        fromSL246.lng !== tu246.startLocation.lng) {
                        movedCnt++;
                        adapterDeltaTotal++;
                        if (sampleMov.length < 3) {
                            sampleMov.push({ uid: tu246.uid,
                                from: { lat: fromSL246.lat, lon: fromSL246.lng },
                                to:   { lat: tu246.startLocation.lat, lon: tu246.startLocation.lng } });
                        }
                    } else {
                        staticCnt++;
                    }
                }

                stepPairs.push({ fromStepRef: fromSP246.stepRef, toStepRef: toSP246.stepRef,
                                 movedUnitCount:   movedCnt,
                                 staticUnitCount:  staticCnt,
                                 missingUnitCount: missCnt,
                                 sampleMovedUnits: sampleMov });
            }

        } else if (!adapterPassed) {
            adapterFindings.push('Adapter failed — cannot compare step-level coordinates.');
        }

        return {
            passed:                        blocked.length === 0,
            scenarioId:                    scenarioId,
            stepCount:                     adapterStepCount,
            unitCount:                     unitCount246,
            unitsWithAnyCoordinates:       unitsWithAnyCoords,
            unitsWithStepCoordinateArrays: unitsWithStepArrays,
            unitsWithCoordinateDeltas:     unitsWithDeltasCount,
            totalCoordinateSamples:        totalSamples,
            totalDeltaPairs:               totalDeltas246,
            totalStaticPairs:              totalStaticPairs246,
            sourceFieldFindings:           sourceFieldFindings,
            adapterFindings:               adapterFindings,
            units:                         unitAudits,
            stepPairs:                     stepPairs,
            blockedReasons:                blocked,
            warnings:                      warnings
        };
    }

    // ── PR-249: Wargame 3 Movement Trail Coverage Audit ──────────────────────
    // Console-only diagnostic helper. Measures read-only movement trail coverage
    // across all 16 step transitions (N-1 → N for steps 1–16) after PR-247 fixed
    // per-step coordinate propagation.
    //
    // Safety invariants:
    //   - Input: w3json only. No window.units, window.lines, window.RmoozScenario reads.
    //   - No window.RmoozScenario.stepIndex mutation.
    //   - Default: does NOT paint the map (options.paint defaults to false).
    //   - options.paint === true: paints only the one step named in options.stepRef.
    //     Does NOT paint all transitions. Does NOT flicker through steps.
    //   - adaptWargame3ToFixture runs once; buildScenarioStepPreview runs once per step.
    //   - buildWargame3ReadOnlyMapOverlayData runs once per transition.
    //   - No fetch. No storage. No backend. No AI. No simulation. No journal.
    //   - No UI controls. No Gate 7/apply/commit/confirm/execute.
    //   - w3json is never mutated.
    //
    // Usage: AppShellScenarioWorkspace.auditWargame3MovementTrailCoverage(w3json [, options])
    //   options.paint    (default false): paint one specific step.
    //   options.stepRef  (default none): required when paint===true.
    //
    // Returns { passed, scenarioId, stepCount, transitionCount, transitionsWithTrails,
    //           transitionsWithoutTrails, totalMovementTrails, maxTrailsInTransition,
    //           averageTrailsPerTransition, markerTotal, effectHintTotal,
    //           sideBreakdown, transitions[], bestTransitions[], clutteredTransitions[],
    //           quietTransitions[], blockedReasons[], warnings[] }.
    function auditWargame3MovementTrailCoverage(w3json, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var blocked  = [];
        var warnings = [];

        // ── Empty-result helper ──────────────────────────────────────────────
        function _p249Empty(blk, wrn) {
            return {
                passed: false, scenarioId: '', stepCount: 0, transitionCount: 0,
                transitionsWithTrails: 0, transitionsWithoutTrails: 0,
                totalMovementTrails: 0, maxTrailsInTransition: 0,
                averageTrailsPerTransition: 0, markerTotal: 0, effectHintTotal: 0,
                sideBreakdown: { friendly: 0, enemy: 0, neutral: 0, unknown: 0 },
                transitions: [], bestTransitions: [], clutteredTransitions: [],
                quietTransitions: [], blockedReasons: blk || [], warnings: wrn || []
            };
        }

        // ── Input guard ──────────────────────────────────────────────────────
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            blocked.push('w3json must be a non-null object and not an array');
            return _p249Empty(blocked, warnings);
        }

        // ── Adapt once ───────────────────────────────────────────────────────
        var p249adapt = adaptWargame3ToFixture(w3json);
        if (!p249adapt.passed || !p249adapt.fixture) {
            return _p249Empty(p249adapt.blockedReasons, p249adapt.warnings || []);
        }
        var p249fix    = p249adapt.fixture;
        var p249scenId = (typeof w3json.scenario_id === 'string' && w3json.scenario_id)
                       ? w3json.scenario_id
                       : (typeof p249fix.fixtureId === 'string' ? p249fix.fixtureId : '');
        var p249stepCt = Array.isArray(p249fix.steps) ? p249fix.steps.length : 0;

        if (p249stepCt === 0) {
            blocked.push('fixture has no steps');
            return _p249Empty(blocked, warnings);
        }

        // ── Build one preview per step ───────────────────────────────────────
        var p249previews = [];
        for (var p249si = 0; p249si < p249stepCt; p249si++) {
            var p249raw = p249fix.steps[p249si];
            var p249nn  = p249si < 10 ? ('0' + p249si) : String(p249si);
            var p249ref = (p249raw && typeof p249raw.step_id === 'string' && p249raw.step_id)
                        ? p249raw.step_id : ('W3-STEP-' + p249nn);
            var p249pr  = null;
            var p249br  = buildScenarioStepPreview(p249fix, p249ref);
            if (p249br.passed && p249br.preview) {
                p249pr = p249br.preview;
            } else {
                warnings.push({ code: 'P249_STEP_FAIL',
                                message: 'step ' + p249ref + ' preview failed: ' +
                                         (p249br.blockedReasons[0] || 'unknown') });
            }
            p249previews.push({ stepRef: p249ref, preview: p249pr, rawStep: p249raw });
        }

        // ── Per-transition audit ─────────────────────────────────────────────
        var p249transitions = [];
        var p249totalTrails = 0;
        var p249totalMk     = 0;
        var p249totalEff    = 0;
        var p249maxTrails   = 0;
        var p249sides       = { friendly: 0, enemy: 0, neutral: 0, unknown: 0 };

        var p249paintOn     = (opts.paint === true);
        var p249paintTgt    = (typeof opts.stepRef === 'string' && opts.stepRef) ? opts.stepRef : null;
        var p249paintResult = null;

        for (var p249ti = 1; p249ti < p249stepCt; p249ti++) {
            var p249from     = p249previews[p249ti - 1];
            var p249to       = p249previews[p249ti];
            var p249fromRef  = p249from.stepRef;
            var p249toRef    = p249to.stepRef;
            var p249toRaw    = p249to.rawStep;
            var p249toTitle  = (p249toRaw && typeof p249toRaw.title === 'string') ? p249toRaw.title : '';
            var p249toPhase  = '';
            if (p249toTitle) {
                var p249di = p249toTitle.indexOf(' — ');
                if (p249di > -1) { p249toPhase = p249toTitle.slice(0, p249di).trim(); }
            }

            // Skip if either preview is missing
            if (!p249from.preview || !p249to.preview) {
                p249transitions.push({
                    fromStepRef: p249fromRef, toStepRef: p249toRef,
                    toTitle: p249toTitle, toPhase: p249toPhase,
                    markerCount: 0, movementTrailCount: 0,
                    friendlyTrailCount: 0, enemyTrailCount: 0, unknownTrailCount: 0,
                    effectHintCount: 0, visuallyUseful: false,
                    clutterRisk: 'low', sampleTrails: []
                });
                continue;
            }

            // Build overlay with previous-step preview for trail delta
            var p249ovRes = buildWargame3ReadOnlyMapOverlayData(
                p249to.preview, { previousPreview: p249from.preview });
            if (!p249ovRes.passed || !p249ovRes.overlay) {
                warnings.push({ code: 'P249_OVERLAY_FAIL',
                                message: 'transition ' + p249fromRef + ' → ' + p249toRef +
                                         ' overlay failed: ' + (p249ovRes.blockedReasons[0] || 'unknown') });
                p249transitions.push({
                    fromStepRef: p249fromRef, toStepRef: p249toRef,
                    toTitle: p249toTitle, toPhase: p249toPhase,
                    markerCount: 0, movementTrailCount: 0,
                    friendlyTrailCount: 0, enemyTrailCount: 0, unknownTrailCount: 0,
                    effectHintCount: 0, visuallyUseful: false,
                    clutterRisk: 'low', sampleTrails: []
                });
                continue;
            }
            var p249ov = p249ovRes.overlay;

            // Count markers, effect hints, trails
            var p249mkCt  = Array.isArray(p249ov.markers)        ? p249ov.markers.length        : 0;
            var p249effCt = Array.isArray(p249ov.effectHints)    ? p249ov.effectHints.length    : 0;
            var p249rawTr = Array.isArray(p249ov.movementTrails) ? p249ov.movementTrails        : [];
            var p249trCt  = p249rawTr.length;

            // Trail side counts
            var p249fr = 0, p249en = 0, p249ne = 0, p249un = 0;
            for (var p249tsi = 0; p249tsi < p249rawTr.length; p249tsi++) {
                var p249t   = p249rawTr[p249tsi];
                var p249sd  = (p249t && typeof p249t.side === 'string') ? p249t.side : '';
                if      (p249sd === 'friendly') { p249fr++; p249sides.friendly++; }
                else if (p249sd === 'enemy')    { p249en++; p249sides.enemy++;    }
                else if (p249sd === 'neutral')  { p249ne++; p249sides.neutral++;  }
                else                            { p249un++; p249sides.unknown++;  }
            }

            // Sample trails — cap at 5
            var p249sample = [];
            var p249cap    = Math.min(p249rawTr.length, 5);
            for (var p249sci = 0; p249sci < p249cap; p249sci++) {
                var p249st = p249rawTr[p249sci];
                if (p249st) {
                    p249sample.push({
                        uid:     typeof p249st.uid  === 'string' ? p249st.uid  : '',
                        name:    typeof p249st.name === 'string' ? p249st.name : '',
                        side:    typeof p249st.side === 'string' ? p249st.side : '',
                        fromLat: p249st.fromLat, fromLon: p249st.fromLon,
                        toLat:   p249st.toLat,   toLon:   p249st.toLon
                    });
                }
            }

            // visuallyUseful — at least one marker or trail with coordinate
            var p249visU = (p249trCt > 0 || p249mkCt > 0);

            // clutterRisk — based on trail count alone
            var p249clut = p249trCt <= 4 ? 'low' : p249trCt <= 12 ? 'medium' : 'high';

            // Aggregate
            p249totalTrails += p249trCt;
            p249totalMk     += p249mkCt;
            p249totalEff    += p249effCt;
            if (p249trCt > p249maxTrails) { p249maxTrails = p249trCt; }

            // Optional single-step paint (paint===true AND stepRef provided AND this is the target)
            if (p249paintOn && p249paintTgt && p249toRef === p249paintTgt) {
                p249paintResult = paintWargame3ReadOnlyMapOverlay(p249ov);
            }

            p249transitions.push({
                fromStepRef:        p249fromRef,
                toStepRef:          p249toRef,
                toTitle:            p249toTitle,
                toPhase:            p249toPhase,
                markerCount:        p249mkCt,
                movementTrailCount: p249trCt,
                friendlyTrailCount: p249fr,
                enemyTrailCount:    p249en,
                unknownTrailCount:  p249un,
                effectHintCount:    p249effCt,
                visuallyUseful:     p249visU,
                clutterRisk:        p249clut,
                sampleTrails:       p249sample
            });
        }

        // ── Summary stats ────────────────────────────────────────────────────
        var p249transCt  = p249transitions.length;
        var p249withTr   = 0;
        for (var p249wi = 0; p249wi < p249transCt; p249wi++) {
            if (p249transitions[p249wi].movementTrailCount > 0) { p249withTr++; }
        }
        var p249withoutTr = p249transCt - p249withTr;
        var p249avg       = p249transCt > 0
                          ? Math.round((p249totalTrails / p249transCt) * 100) / 100 : 0;

        // bestTransitions — top 5 by movementTrailCount desc, then markerCount desc
        var p249sorted = p249transitions.slice().sort(function (a, b) {
            if (b.movementTrailCount !== a.movementTrailCount) {
                return b.movementTrailCount - a.movementTrailCount;
            }
            return b.markerCount - a.markerCount;
        });
        var p249best = p249sorted.slice(0, 5);

        // clutteredTransitions — clutterRisk === 'high'
        var p249clutter = p249transitions.filter(function (tr) { return tr.clutterRisk === 'high'; });

        // quietTransitions — 0 movement trails
        var p249quiet = p249transitions.filter(function (tr) { return tr.movementTrailCount === 0; });

        var p249result = {
            passed:                     true,
            scenarioId:                 p249scenId,
            stepCount:                  p249stepCt,
            transitionCount:            p249transCt,
            transitionsWithTrails:      p249withTr,
            transitionsWithoutTrails:   p249withoutTr,
            totalMovementTrails:        p249totalTrails,
            maxTrailsInTransition:      p249maxTrails,
            averageTrailsPerTransition: p249avg,
            markerTotal:                p249totalMk,
            effectHintTotal:            p249totalEff,
            sideBreakdown:              p249sides,
            transitions:                p249transitions,
            bestTransitions:            p249best,
            clutteredTransitions:       p249clutter,
            quietTransitions:           p249quiet,
            blockedReasons:             blocked,
            warnings:                   warnings
        };

        if (p249paintOn && p249paintTgt && p249paintResult !== null) {
            p249result.paintResult = p249paintResult;
        }

        return p249result;
    }

    // ── PR-250: Wargame 3 Read-Only Map Focus Helper ─────────────────────────
    //
    // buildWargame3PreviewMapFocusBounds(overlay, options?)
    //   Pure function. Given a safe W3 read-only overlay, collects all drawable
    //   coordinates (marker positions, objective positions, movement trail
    //   endpoints) and returns the bounding box and center needed to focus the
    //   map on the visible preview content.
    //
    // Safety invariants:
    //   - Validates input with isWargame3ReadOnlyMapOverlayDataSafe. Blocks if invalid.
    //   - Reads only from the supplied overlay argument.
    //   - Does NOT read window.units, window.lines, window.RmoozScenario.
    //   - Does NOT mutate window.RmoozScenario.stepIndex.
    //   - Does NOT call map.fitBounds or create any Leaflet layers/markers.
    //   - Does NOT paint the map or create UI.
    //   - Does NOT invent coordinates; null/non-finite coords are skipped.
    //   - effectHints and warnings are never used as coordinate sources.
    //   - Overlay input is never mutated.
    //   - No fetch, no storage, no backend, no AI, no simulation, no journal.
    //   - No Gate 7/apply/commit/confirm/execute controls.
    //
    // Returns { passed, hasBounds, pointCount, bounds, center, sourceCounts,
    //           blockedReasons, warnings }.
    //   bounds  → { south, west, north, east } | null
    //   center  → { lat, lon } | null
    //   sourceCounts → { markers, objectives, movementTrailEndpoints }
    function buildWargame3PreviewMapFocusBounds(overlay, options) {
        var blocked  = [];
        var warnings = [];

        // Empty-result helper (blocked)
        function _p250Blocked(blk, wrn) {
            return {
                passed: false, hasBounds: false, pointCount: 0,
                bounds: null, center: null,
                sourceCounts: { markers: 0, objectives: 0, movementTrailEndpoints: 0 },
                blockedReasons: blk || [], warnings: wrn || []
            };
        }

        // 1. Validate overlay with the established type guard
        var guard = isWargame3ReadOnlyMapOverlayDataSafe(overlay);
        if (!guard.passed) {
            return _p250Blocked(guard.blockedReasons, warnings);
        }

        var lats       = [];
        var lons       = [];
        var markerPts  = 0;
        var objPts     = 0;
        var trailPts   = 0;

        // A. Markers — only when hasCoordinate === true and both lat/lon are finite
        var rawMk = overlay.markers;
        for (var mi = 0; mi < rawMk.length; mi++) {
            var mk = rawMk[mi];
            if (!mk) { continue; }
            if (mk.hasCoordinate === true &&
                typeof mk.lat === 'number' && isFinite(mk.lat) &&
                typeof mk.lon === 'number' && isFinite(mk.lon)) {
                lats.push(mk.lat);
                lons.push(mk.lon);
                markerPts++;
            }
        }

        // B. Objective highlights — only when hasCoordinate === true and finite
        var rawOh = overlay.objectiveHighlights;
        for (var oi = 0; oi < rawOh.length; oi++) {
            var oh = rawOh[oi];
            if (!oh) { continue; }
            if (oh.hasCoordinate === true &&
                typeof oh.lat === 'number' && isFinite(oh.lat) &&
                typeof oh.lon === 'number' && isFinite(oh.lon)) {
                lats.push(oh.lat);
                lons.push(oh.lon);
                objPts++;
            }
        }

        // C. Movement trail endpoints — both from and to; all four values must be finite
        var rawTr = overlay.movementTrails;
        for (var tri = 0; tri < rawTr.length; tri++) {
            var tr = rawTr[tri];
            if (!tr) { continue; }
            if (typeof tr.fromLat === 'number' && isFinite(tr.fromLat) &&
                typeof tr.fromLon === 'number' && isFinite(tr.fromLon) &&
                typeof tr.toLat   === 'number' && isFinite(tr.toLat)   &&
                typeof tr.toLon   === 'number' && isFinite(tr.toLon)) {
                lats.push(tr.fromLat);
                lons.push(tr.fromLon);
                lats.push(tr.toLat);
                lons.push(tr.toLon);
                trailPts += 2;
            }
        }

        // effectHints: deliberately NOT used as coordinate source (spec rule)
        // warnings:    deliberately NOT used as coordinate source (spec rule)

        var srcCounts = { markers: markerPts, objectives: objPts,
                          movementTrailEndpoints: trailPts };
        var pointCount = lats.length;

        if (pointCount === 0) {
            warnings.push({ code: 'W3BOUNDS_NO_COORDS',
                            message: 'no drawable preview coordinates — bounds cannot be calculated' });
            return {
                passed: true, hasBounds: false, pointCount: 0,
                bounds: null, center: null,
                sourceCounts: srcCounts, blockedReasons: blocked, warnings: warnings
            };
        }

        // Bounds: iterate accumulated lats/lons
        var south = lats[0], north = lats[0];
        var west  = lons[0], east  = lons[0];
        for (var bi = 1; bi < lats.length; bi++) {
            if (lats[bi] < south) { south = lats[bi]; }
            if (lats[bi] > north) { north = lats[bi]; }
            if (lons[bi] < west)  { west  = lons[bi]; }
            if (lons[bi] > east)  { east  = lons[bi]; }
        }

        return {
            passed:     true,
            hasBounds:  true,
            pointCount: pointCount,
            bounds:     { south: south, west: west, north: north, east: east },
            center:     { lat: (south + north) / 2, lon: (west + east) / 2 },
            sourceCounts:   srcCounts,
            blockedReasons: blocked,
            warnings:       warnings
        };
    }

    // focusWargame3PreviewMapBounds(overlay, options?)
    //   Uses buildWargame3PreviewMapFocusBounds to calculate safe bounds, then
    //   optionally calls window.map.fitBounds ONLY when options.apply === true.
    //
    //   Manual/console-only helper. Not wired into any UI or auto-navigation.
    //   Default behaviour: calculate bounds only; do NOT pan the map viewport.
    //
    // Safety invariants:
    //   - Validates overlay via buildWargame3PreviewMapFocusBounds (which calls
    //     isWargame3ReadOnlyMapOverlayDataSafe). Blocks if invalid.
    //   - If options.apply !== true, returns focused:false without touching map.
    //   - If options.apply === true: requires window.map + window.L; calls
    //     window.map.fitBounds only — no scenario/unit/line/stepIndex mutation.
    //   - Never creates Leaflet markers or layer groups.
    //   - Never reads window.units, window.lines, window.RmoozScenario.
    //   - No fetch, no storage, no backend, no AI, no simulation, no journal.
    //   - No Gate 7/apply/commit/confirm/execute controls.
    //
    // Returns { passed, focused, focusResult, blockedReasons, warnings }.
    function focusWargame3PreviewMapBounds(overlay, options) {
        var blocked  = [];
        var warnings = [];
        var opts     = (options && typeof options === 'object' && !Array.isArray(options))
                     ? options : {};

        // 1. Build bounds (validates overlay internally)
        var boundsRes = buildWargame3PreviewMapFocusBounds(overlay, opts);
        if (!boundsRes.passed) {
            return {
                passed: false, focused: false, focusResult: boundsRes,
                blockedReasons: boundsRes.blockedReasons, warnings: warnings
            };
        }

        // 2. No coordinates → return safely
        if (!boundsRes.hasBounds) {
            warnings.push({ code: 'W3FOCUS_NO_BOUNDS',
                            message: 'no drawable coordinates — map focus skipped' });
            return {
                passed: true, focused: false, focusResult: boundsRes,
                blockedReasons: blocked, warnings: warnings
            };
        }

        // 3. apply !== true → dry-run only; map viewport untouched
        if (opts.apply !== true) {
            return {
                passed: true, focused: false, focusResult: boundsRes,
                blockedReasons: blocked, warnings: warnings
            };
        }

        // 4. apply === true → require Leaflet map
        if (!window.map || !window.L) {
            blocked.push('window.map or window.L unavailable — cannot call fitBounds');
            return {
                passed: false, focused: false, focusResult: boundsRes,
                blockedReasons: blocked, warnings: warnings
            };
        }

        // 5. Viewport-only pan — no scenario/unit/line/stepIndex mutation
        try {
            var b  = boundsRes.bounds;
            var pd = (typeof opts.padding === 'number' && isFinite(opts.padding) &&
                      opts.padding >= 0) ? opts.padding : 20;
            window.map.fitBounds(
                [[b.south, b.west], [b.north, b.east]],
                { padding: [pd, pd], animate: false }
            );
            return {
                passed: true, focused: true, focusResult: boundsRes,
                blockedReasons: blocked, warnings: warnings
            };
        } catch (ex) {
            blocked.push('map.fitBounds exception: ' + String(ex));
            return {
                passed: false, focused: false, focusResult: boundsRes,
                blockedReasons: blocked, warnings: warnings
            };
        }
    }

    // ── PR-251: Wargame 3 Map Preview Operational Readiness Report ───────────
    //
    // buildWargame3MapPreviewReadinessReport(w3json, options?)
    //   Console-only. Combines auditWargame3MapPreviewCoverage,
    //   auditWargame3StepCoordinateDeltas, auditWargame3MovementTrailCoverage,
    //   and buildWargame3PreviewMapFocusBounds into a single readiness summary.
    //
    // Answers:
    //   - Is W3 read-only map preview ready for practical walkthrough testing?
    //   - Are markers working?
    //   - Are movement trails working?
    //   - Are focus bounds working?
    //   - Which steps/transitions are strongest?
    //   - What gaps remain?
    //   - What should the next functional PR be?
    //
    // readiness values:
    //   "ready_for_walkthrough" — all core systems operational, no blockers
    //   "needs_review"          — core systems work but one or more gaps present
    //   "blocked"               — critical failure prevents map walkthrough
    //
    // Safety invariants:
    //   - Uses w3json input only. No window.units, window.lines, window.RmoozScenario.
    //   - Does NOT mutate window.RmoozScenario.stepIndex.
    //   - Does NOT paint the map. Does NOT call paintWargame3ReadOnlyMapOverlay.
    //   - Does NOT call focusWargame3PreviewMapBounds with apply:true.
    //   - Does NOT call map.fitBounds.
    //   - w3json is never mutated.
    //   - No fetch, no storage, no backend, no AI, no simulation, no journal.
    //   - No Gate 7/apply/commit/confirm/execute controls.
    //
    // Returns { passed, readiness, scenarioId, summary, strongestSteps,
    //           strongestTransitions, quietTransitions, remainingGaps, blockers,
    //           recommendedNextPR, sourceReports, blockedReasons, warnings }.
    function buildWargame3MapPreviewReadinessReport(w3json, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options))
                     ? options : {};
        var blocked  = [];
        var warnings = [];

        // ── Empty-result helper ──────────────────────────────────────────────
        function _p251Empty(rdns, blk, wrn) {
            return {
                passed: false, readiness: rdns || 'blocked',
                scenarioId: '',
                summary: {
                    stepCount: 0, markerCoverage: 'none', drawableSteps: 0,
                    totalMarkers: 0, totalDrawableMarkers: 0,
                    totalMovementTrails: 0, transitionsWithTrails: 0,
                    transitionsWithoutTrails: 0, maxTrailsInTransition: 0,
                    objectiveCoordinateCoverage: 'none', focusBoundsAvailable: false
                },
                strongestSteps: [], strongestTransitions: [],
                quietTransitions: [], remainingGaps: [], blockers: blk || [],
                recommendedNextPR: { id: 'PR-252',
                    title: 'Wargame 3 Map Preview Blocker Investigation',
                    reason: (blk && blk[0]) || 'A blocking failure must be resolved.' },
                sourceReports: { mapCoverage: null, coordinateDeltas: null,
                                 movementTrails: null, sampleFocusBounds: null },
                blockedReasons: blk || [], warnings: wrn || []
            };
        }

        // ── Input guard ──────────────────────────────────────────────────────
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            blocked.push('w3json must be a non-null object and not an array');
            return _p251Empty('blocked', blocked, warnings);
        }

        // ── 1. Run all three audit helpers ───────────────────────────────────
        var p251cov    = auditWargame3MapPreviewCoverage(w3json);
        var p251delta  = auditWargame3StepCoordinateDeltas(w3json);
        var p251trails = auditWargame3MovementTrailCoverage(w3json);

        // Hard blocker: if coverage audit fails, nothing else can be built
        if (!p251cov.passed) {
            var p251covBlk = p251cov.blockedReasons.length > 0
                           ? p251cov.blockedReasons
                           : ['auditWargame3MapPreviewCoverage failed'];
            return _p251Empty('blocked', p251covBlk, p251cov.warnings || []);
        }

        // Propagate non-fatal audit failures as warnings only
        if (!p251delta.passed) {
            warnings.push({ code: 'P251_DELTA_AUDIT_FAIL',
                            message: 'auditWargame3StepCoordinateDeltas failed: ' +
                                     (p251delta.blockedReasons[0] || 'unknown') });
        }
        if (!p251trails.passed) {
            warnings.push({ code: 'P251_TRAIL_AUDIT_FAIL',
                            message: 'auditWargame3MovementTrailCoverage failed: ' +
                                     (p251trails.blockedReasons[0] || 'unknown') });
        }

        // ── 2. Extract key metrics ───────────────────────────────────────────
        var p251scenId     = p251cov.scenarioId || '';
        var p251stepCt     = p251cov.stepCount;
        var p251drawableSt = p251cov.drawableStepCount;
        var p251totalMk    = p251cov.totalMarkers;
        var p251drawableMk = p251cov.totalDrawableMarkers;
        var p251totalObj   = p251cov.totalObjectiveHighlights || 0;

        var p251totalTr  = p251trails.passed ? p251trails.totalMovementTrails    : 0;
        var p251withTr   = p251trails.passed ? p251trails.transitionsWithTrails  : 0;
        var p251withoutTr = p251trails.passed ? p251trails.transitionsWithoutTrails : 0;
        var p251maxTr    = p251trails.passed ? p251trails.maxTrailsInTransition  : 0;
        var p251cluttered = (p251trails.passed && Array.isArray(p251trails.clutteredTransitions))
                          ? p251trails.clutteredTransitions : [];
        var p251bestTrans = (p251trails.passed && Array.isArray(p251trails.bestTransitions))
                          ? p251trails.bestTransitions : [];
        var p251quietTrans = (p251trails.passed && Array.isArray(p251trails.quietTransitions))
                           ? p251trails.quietTransitions : [];

        // ── 3. Count drawable objectives from per-step data ──────────────────
        var p251drawableObj = 0;
        var p251steps = Array.isArray(p251cov.steps) ? p251cov.steps : [];
        for (var p251oi = 0; p251oi < p251steps.length; p251oi++) {
            p251drawableObj += (p251steps[p251oi].drawableObjectiveCount || 0);
        }

        // ── 4. Coverage strings ──────────────────────────────────────────────
        var p251mkCov  = p251totalMk === 0   ? 'none'
                       : p251drawableMk === 0 ? 'none'
                       : p251drawableMk === p251totalMk ? 'full' : 'partial';
        var p251objCov = p251totalObj === 0   ? 'none'
                       : p251drawableObj === 0 ? 'missing'
                       : p251drawableObj === p251totalObj ? 'full' : 'partial';

        // ── 5. Strongest steps — top 5 by drawableMarkers + movementTrails ───
        var p251stepsSorted = p251steps.slice().sort(function (a, b) {
            var aScore = (a.drawableMarkerCount || 0) + (a.movementTrailCount || 0) * 2;
            var bScore = (b.drawableMarkerCount || 0) + (b.movementTrailCount || 0) * 2;
            return bScore - aScore;
        });
        var p251strongSteps = p251stepsSorted.slice(0, 5).map(function (s) {
            return {
                stepRef:        s.stepRef,
                title:          s.title || '',
                drawableMarkers: s.drawableMarkerCount || 0,
                movementTrails: s.movementTrailCount   || 0
            };
        });

        // ── 6. Sample focus bounds — use best transition's to-step ───────────
        var p251focusBoundsAvail  = false;
        var p251sampleFocusBounds = null;

        // Adapt once for focus bounds (audits each adapt internally; this is
        // a separate call for the bounds sample — correct, not redundant)
        var p251adaptR = adaptWargame3ToFixture(w3json);
        if (p251adaptR.passed && p251adaptR.fixture) {
            var p251fix = p251adaptR.fixture;
            // Prefer strongest transition; fall back to any drawable step
            var p251fromRef = null;
            var p251toRef   = null;

            if (p251bestTrans.length > 0) {
                p251fromRef = p251bestTrans[0].fromStepRef;
                p251toRef   = p251bestTrans[0].toStepRef;
            } else {
                // Fallback: use first two drawable steps
                var p251found = 0;
                for (var p251fi = 0; p251fi < p251steps.length && p251found < 2; p251fi++) {
                    if (p251steps[p251fi].mapPreviewUseful) {
                        if (p251found === 0) { p251fromRef = p251steps[p251fi].stepRef; }
                        else                 { p251toRef   = p251steps[p251fi].stepRef; }
                        p251found++;
                    }
                }
                if (!p251toRef && p251fromRef) {
                    p251toRef   = p251fromRef;
                    p251fromRef = null;   // single step, no previous
                }
            }

            if (p251toRef) {
                var p251fromRes = p251fromRef
                    ? buildScenarioStepPreview(p251fix, p251fromRef) : null;
                var p251toRes   = buildScenarioStepPreview(p251fix, p251toRef);
                var p251fromPv  = (p251fromRes && p251fromRes.preview) ? p251fromRes.preview : null;
                var p251toPv    = (p251toRes   && p251toRes.preview)   ? p251toRes.preview   : null;

                if (p251toPv) {
                    var p251ovOpts = p251fromPv
                        ? { previousPreview: p251fromPv } : {};
                    var p251ovRes = buildWargame3ReadOnlyMapOverlayData(p251toPv, p251ovOpts);
                    if (p251ovRes.passed && p251ovRes.overlay) {
                        var p251fbRes = buildWargame3PreviewMapFocusBounds(p251ovRes.overlay);
                        if (p251fbRes.passed) {
                            p251sampleFocusBounds = p251fbRes;
                            p251focusBoundsAvail  = p251fbRes.hasBounds === true;
                        }
                    }
                }
            }
        } else {
            warnings.push({ code: 'P251_ADAPT_FAIL',
                            message: 'adaptWargame3ToFixture failed for focus bounds sample: ' +
                                     (p251adaptR.blockedReasons[0] || 'unknown') });
        }

        // ── 7. Remaining gaps (evidence-based only) ──────────────────────────
        var p251gaps = [];

        if (p251totalObj > 0 && p251drawableObj === 0) {
            p251gaps.push({
                code:     'OBJECTIVE_COORDS_MISSING',
                message:  p251totalObj + ' objective highlight(s) present but have no spatial ' +
                          'coordinates — cannot display on map',
                severity: 'warning'
            });
        }
        if (p251withoutTr > 0) {
            p251gaps.push({
                code:     'QUIET_TRANSITIONS',
                message:  p251withoutTr + ' transition(s) have 0 movement trails — ' +
                          'earliest steps may lack movement data',
                severity: 'info'
            });
        }
        if (p251totalTr === 0 && p251trails.passed) {
            p251gaps.push({
                code:     'NO_MOVEMENT_TRAILS',
                message:  'No movement trails found across all transitions',
                severity: 'warning'
            });
        }
        if (!p251focusBoundsAvail) {
            p251gaps.push({
                code:     'FOCUS_BOUNDS_UNAVAILABLE',
                message:  'Focus bounds unavailable — no overlay had drawable coordinates',
                severity: 'warning'
            });
        }
        if (p251cluttered.length > 0) {
            p251gaps.push({
                code:     'CLUTTERED_TRANSITIONS',
                message:  p251cluttered.length + ' transition(s) have high clutter risk (≥13 trails)',
                severity: 'info'
            });
        }

        // ── 8. Readiness classification ──────────────────────────────────────
        var p251readiness;

        if (p251drawableMk === 0) {
            // Hard block: no markers can be drawn at all
            blocked.push('totalDrawableMarkers is 0 — no map content can be rendered');
            p251readiness = 'blocked';
        } else if (
            p251drawableSt === p251stepCt &&
            p251totalTr    > 0           &&
            p251cluttered.length === 0   &&
            p251focusBoundsAvail         &&
            p251totalObj === 0           // no objectives means no objective coord gap
        ) {
            // All core conditions met with no objective gap
            p251readiness = 'ready_for_walkthrough';
        } else if (
            p251drawableSt === p251stepCt &&
            p251totalTr    > 0           &&
            p251cluttered.length === 0   &&
            p251focusBoundsAvail         &&
            p251totalObj > 0 &&
            p251drawableObj === p251totalObj  // objectives ARE drawable
        ) {
            p251readiness = 'ready_for_walkthrough';
        } else {
            // One or more helpful pieces incomplete — needs review
            p251readiness = 'needs_review';
        }

        // ── 9. Recommended next PR ───────────────────────────────────────────
        var p251nextPR;
        if (p251readiness === 'ready_for_walkthrough') {
            p251nextPR = {
                id:     'PR-252',
                title:  'Wargame 3 Manual Map Walkthrough Test',
                reason: 'Preview markers, movement trails, and focus bounds are ready ' +
                        'for manual step-by-step scenario walkthrough testing.'
            };
        } else if (p251readiness === 'needs_review' &&
                   p251totalObj > 0 && p251drawableObj === 0) {
            p251nextPR = {
                id:     'PR-252',
                title:  'Wargame 3 Objective Coordinate Mapping',
                reason: 'Objective highlights exist but cannot be spatially displayed ' +
                        'because objective coordinates are missing.'
            };
        } else if (p251readiness === 'blocked') {
            p251nextPR = {
                id:     'PR-252',
                title:  'Wargame 3 Map Preview Blocker Investigation',
                reason: blocked[0] || 'A blocking failure must be resolved before walkthrough testing.'
            };
        } else {
            // needs_review, non-objective gap
            p251nextPR = {
                id:     'PR-252',
                title:  'Wargame 3 Manual Map Walkthrough Test',
                reason: 'Preview markers and movement trails are working; ' +
                        'proceed to manual walkthrough testing.'
            };
        }

        return {
            passed:    p251readiness !== 'blocked',
            readiness: p251readiness,
            scenarioId: p251scenId,
            summary: {
                stepCount:                   p251stepCt,
                markerCoverage:              p251mkCov,
                drawableSteps:               p251drawableSt,
                totalMarkers:                p251totalMk,
                totalDrawableMarkers:        p251drawableMk,
                totalMovementTrails:         p251totalTr,
                transitionsWithTrails:       p251withTr,
                transitionsWithoutTrails:    p251withoutTr,
                maxTrailsInTransition:       p251maxTr,
                objectiveCoordinateCoverage: p251objCov,
                focusBoundsAvailable:        p251focusBoundsAvail
            },
            strongestSteps:       p251strongSteps,
            strongestTransitions: p251bestTrans.slice(0, 5),
            quietTransitions:     p251quietTrans,
            remainingGaps:        p251gaps,
            blockers:             blocked,
            recommendedNextPR:    p251nextPR,
            sourceReports: {
                mapCoverage:      p251cov,
                coordinateDeltas: p251delta,
                movementTrails:   p251trails,
                sampleFocusBounds: p251sampleFocusBounds
            },
            blockedReasons: blocked,
            warnings:       warnings
        };
    }

    // ── PR-252: Wargame 3 Objective Coordinate Source Audit ──────────────────
    //
    // auditWargame3ObjectiveCoordinateSources(w3json, options?)
    //   Console-only. Inspects all W3 data fields to identify objective
    //   coordinate sources, reports which objectives have direct coordinates,
    //   which can be mapped, and which remain missing.
    //
    //   W3 has one primary objective (w3json.obj) with an explicit coord field.
    //   After PR-252 pipeline fix, this coordinate flows through:
    //     w3json.obj.coord → _w3aLonLatToStartLoc → fixture.objectives[N].location
    //     → buildScenarioStepPreview → preview.objectivesReferenced[N].location
    //     → buildWargame3ReadOnlyMapOverlayData → overlay.objectiveHighlights[N].lat/lon
    //
    // Safety invariants:
    //   - Uses w3json input only. No window.units, window.lines, window.RmoozScenario.
    //   - Does NOT mutate window.RmoozScenario.stepIndex or any global state.
    //   - Does NOT paint the map or call map.fitBounds.
    //   - Coordinates are never invented: only reports what raw data contains.
    //   - No fetch, no storage, no backend, no AI, no simulation, no journal.
    //   - No Gate 7/apply/commit/confirm/execute controls.
    //
    // Returns { passed, scenarioId, objectiveCount, objectivesWithDirectCoordinates,
    //           objectivesWithMappedCoordinates, objectivesMissingCoordinates,
    //           candidateSourceFields, objectives[], blockedReasons, warnings }.
    function auditWargame3ObjectiveCoordinateSources(w3json, options) {
        var opts     = (options && typeof options === 'object' && !Array.isArray(options))
                     ? options : {};
        var blocked  = [];
        var warnings = [];

        // ── Empty-result helper ──────────────────────────────────────────────
        function _p252Empty(blk, wrn) {
            return {
                passed: false, scenarioId: '',
                objectiveCount: 0,
                objectivesWithDirectCoordinates:  0,
                objectivesWithMappedCoordinates:  0,
                objectivesMissingCoordinates:     0,
                candidateSourceFields: [],
                objectives:    [],
                blockedReasons: blk || [], warnings: wrn || []
            };
        }

        // ── Input guard ──────────────────────────────────────────────────────
        if (!w3json || typeof w3json !== 'object' || Array.isArray(w3json)) {
            blocked.push('w3json must be a non-null object and not an array');
            return _p252Empty(blocked, warnings);
        }

        var p252scenId = (typeof w3json.scenario_id === 'string' && w3json.scenario_id)
                       ? w3json.scenario_id : '';

        // ── Candidate source field survey ────────────────────────────────────
        // Report every spatial field that exists in w3json, not just objectives.
        // Gives a complete picture of available coordinate sources.
        var p252srcFields = [];

        if (w3json.obj && typeof w3json.obj === 'object' && !Array.isArray(w3json.obj) &&
            Array.isArray(w3json.obj.coord) && w3json.obj.coord.length >= 2) {
            p252srcFields.push({
                field:       'w3json.obj.coord',
                description: 'Primary objective direct coordinate (GeoJSON [lon, lat])',
                value:       [w3json.obj.coord[0], w3json.obj.coord[1]]
            });
        }
        if (Array.isArray(w3json.bls_template)) {
            for (var p252bi = 0; p252bi < w3json.bls_template.length; p252bi++) {
                var p252bls = w3json.bls_template[p252bi];
                if (p252bls && Array.isArray(p252bls.coord) && p252bls.coord.length >= 2) {
                    p252srcFields.push({
                        field:       'w3json.bls_template[' + p252bi + '].coord',
                        description: 'Beach Landing Site "' + (p252bls.name || p252bi) +
                                     '" coordinate — spatial context, not an objective',
                        value:       [p252bls.coord[0], p252bls.coord[1]]
                    });
                }
            }
        }
        if (Array.isArray(w3json.off_map_markers)) {
            for (var p252omi = 0; p252omi < w3json.off_map_markers.length; p252omi++) {
                var p252omk = w3json.off_map_markers[p252omi];
                if (p252omk && Array.isArray(p252omk.coord) && p252omk.coord.length >= 2) {
                    p252srcFields.push({
                        field:       'w3json.off_map_markers[' + p252omi + '].coord',
                        description: 'Off-map marker "' + (p252omk.id || p252omi) + '" (' +
                                     (p252omk.type || '?') + ') — not an objective',
                        value:       [p252omk.coord[0], p252omk.coord[1]]
                    });
                }
            }
        }

        // ── Objective parsing ────────────────────────────────────────────────
        // W3 uses a single primary objective object (w3json.obj), not an array.
        // Fields: name, coord [lon, lat], radius_km, target_depth_km, carver.
        var p252objectives = [];
        var p252withDirect = 0;
        var p252withMapped = 0;
        var p252missing    = 0;

        if (!w3json.obj || typeof w3json.obj !== 'object' || Array.isArray(w3json.obj)) {
            warnings.push({ code: 'P252_NO_OBJ_FIELD',
                            message: 'w3json.obj is missing or not an object — no primary objective found' });
        } else {
            var p252rawObj  = w3json.obj;
            var p252objName = (typeof p252rawObj.name === 'string' && p252rawObj.name)
                            ? p252rawObj.name : 'W3-OBJ-PRIMARY';

            // Check for direct coordinate (GeoJSON [lon, lat] convention)
            var p252directCoord = null;
            if (Array.isArray(p252rawObj.coord) && p252rawObj.coord.length >= 2) {
                var p252cLon = p252rawObj.coord[0];
                var p252cLat = p252rawObj.coord[1];
                if (typeof p252cLon === 'number' && isFinite(p252cLon) &&
                    typeof p252cLat === 'number' && isFinite(p252cLat)) {
                    p252directCoord = { lat: p252cLat, lon: p252cLon };
                    p252withDirect++;
                } else {
                    warnings.push({ code: 'P252_OBJ_COORD_INVALID',
                                    message: 'w3json.obj.coord exists but values are non-finite' });
                    p252missing++;
                }
            } else {
                warnings.push({ code: 'P252_OBJ_NO_COORD',
                                message: 'w3json.obj has no coord field — objective cannot be drawn' });
                p252missing++;
            }

            var p252conf  = p252directCoord ? 'direct' : 'missing';
            var p252notes = [];
            if (p252directCoord) {
                p252notes.push('Coordinate source: w3json.obj.coord [' +
                               p252rawObj.coord[0] + ', ' + p252rawObj.coord[1] +
                               '] (GeoJSON [lon, lat]) → lat=' + p252cLat + ' lon=' + p252cLon);
                p252notes.push('PR-252 pipeline: w3json.obj.coord → _w3aLonLatToStartLoc → ' +
                               'fixture.objectives[0].location → ' +
                               'buildScenarioStepPreview resolvedObjectives[0].location → ' +
                               'buildWargame3ReadOnlyMapOverlayData overlay.objectiveHighlights[0]');
                if (typeof p252rawObj.radius_km === 'number') {
                    p252notes.push('radius_km=' + p252rawObj.radius_km +
                                   ' present in source data — not used for range circles in this PR');
                }
            } else {
                p252notes.push('No coordinate source found — objective cannot be drawn on map');
            }

            p252objectives.push({
                objectiveId:      'W3-OBJ-PRIMARY',
                name:             p252objName,
                status:           'see per-step objective_status_baseline (DORMANT→DENIED)',
                directCoordinate: p252directCoord,
                mappedCoordinate: null,
                source:           p252directCoord ? 'w3json.obj.coord' : null,
                confidence:       p252conf,
                notes:            p252notes
            });
        }

        return {
            passed:                           blocked.length === 0,
            scenarioId:                       p252scenId,
            objectiveCount:                   p252objectives.length,
            objectivesWithDirectCoordinates:  p252withDirect,
            objectivesWithMappedCoordinates:  p252withMapped,
            objectivesMissingCoordinates:     p252missing,
            candidateSourceFields:            p252srcFields,
            objectives:                       p252objectives,
            blockedReasons:                   blocked,
            warnings:                         warnings
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    // ── PR-278: Wargame 3 Scenario Workflow Walkthrough Runner ───────────────
    // Pure in-memory runner. Processes W3 preview steps in sequence and returns
    // a compact workflow walkthrough result.
    // SAFETY: No DOM. No map. No storage. No backend. No network. No fetch.
    //         No window.RmoozScenario. No window.units. No window.lines.
    //         No mutation of previewSource, fixture, or any step.
    //         No expectedResult. previewComplete always false.
    //         selectedDecision exists only inside the dry-run record (review test only).
    //         Default: updateLiveState false — runner is pure, does NOT touch module state.
    //         No AI. No simulation. No journal. No Gate 7. No apply/execute/commit.
    //
    // runWargame3ScenarioWorkflowWalkthrough(previewSource, options?)
    //   previewSource — W3 adapted fixture (readOnly:true + steps[]) OR raw W3 JSON.
    //   options.reviewFirstAvailable  boolean, default true.
    //   options.maxSteps              number, default all steps.
    //   options.startStepRef          string step ref to start from.
    //   options.stopStepRef           string step ref to stop at (inclusive).
    //   options.includeWarnings       boolean, default true.
    //   options.updateLiveState       boolean, default false.
    //   Returns { passed, walkthrough:object|null, blockedReasons[], warnings[] }.
    function runWargame3ScenarioWorkflowWalkthrough(previewSource, options) {
        var opts           = (options && typeof options === 'object' && !Array.isArray(options))
                            ? options : {};
        var blockedReasons = [];
        var warnings       = [];

        // Options
        var reviewFirstAvailable = opts.reviewFirstAvailable !== false;           // default true
        var maxStepsOpt          = (typeof opts.maxSteps === 'number' && opts.maxSteps > 0)
                                   ? Math.floor(opts.maxSteps) : 0;
        var startStepRef         = (typeof opts.startStepRef === 'string' && opts.startStepRef)
                                   ? opts.startStepRef : null;
        var stopStepRef          = (typeof opts.stopStepRef === 'string' && opts.stopStepRef)
                                   ? opts.stopStepRef : null;
        var includeWarnings      = opts.includeWarnings !== false;                // default true
        var updateLiveState      = opts.updateLiveState === true;                 // default false

        // Rule 1: previewSource must be a non-null, non-array object
        if (!previewSource || typeof previewSource !== 'object' || Array.isArray(previewSource)) {
            blockedReasons.push('previewSource must be a non-null, non-array object');
            return { passed: false, walkthrough: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Resolve fixture — accept pre-adapted fixture or raw w3json
        var fixture = null;

        if (previewSource.readOnly === true && Array.isArray(previewSource.steps)) {
            // Already an adapted fixture — use directly without mutation
            fixture = previewSource;
        } else if (Array.isArray(previewSource.steps)) {
            // Raw w3json — adapt via pipeline (no DOM, no map, no mutation)
            var adaptResult = adaptWargame3ToFixture(previewSource);
            if (!adaptResult.passed) {
                return { passed: false, walkthrough: null,
                         blockedReasons: adaptResult.blockedReasons,
                         warnings: adaptResult.warnings || warnings };
            }
            fixture = adaptResult.fixture;
            if (adaptResult.warnings && adaptResult.warnings.length) {
                warnings = warnings.concat(adaptResult.warnings);
            }
            // Apply decision options overlay
            var overlayResult = applyWargame3DecisionOptionsFixtureOverlay(fixture);
            if (overlayResult.passed && overlayResult.fixture &&
                overlayResult.appliedStepRefs.length > 0) {
                fixture = overlayResult.fixture;
            }
        } else {
            blockedReasons.push(
                'previewSource must be a W3 adapted fixture (readOnly:true + steps[]) ' +
                'or a raw W3 JSON with a steps array');
            return { passed: false, walkthrough: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Collect W3 steps only (filter by step_id prefix)
        var allSteps = [];
        for (var ci = 0; ci < fixture.steps.length; ci++) {
            var cs = fixture.steps[ci];
            if (cs && typeof cs.step_id === 'string' && /^W3-STEP-/i.test(cs.step_id)) {
                allSteps.push(cs);
            }
        }

        if (allSteps.length === 0) {
            blockedReasons.push('fixture must have at least one W3-STEP-* step');
            return { passed: false, walkthrough: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Apply range: startStepRef
        var startIndex = 0;
        if (startStepRef) {
            for (var sti = 0; sti < allSteps.length; sti++) {
                if (allSteps[sti].step_id === startStepRef) { startIndex = sti; break; }
            }
        }
        var stepsToWalk = allSteps.slice(startIndex);

        // Apply range: stopStepRef
        if (stopStepRef) {
            var stopIndex = -1;
            for (var soi = 0; soi < stepsToWalk.length; soi++) {
                if (stepsToWalk[soi].step_id === stopStepRef) { stopIndex = soi; break; }
            }
            if (stopIndex !== -1) { stepsToWalk = stepsToWalk.slice(0, stopIndex + 1); }
        }

        // Apply range: maxSteps
        if (maxStepsOpt > 0 && stepsToWalk.length > maxStepsOpt) {
            stepsToWalk = stepsToWalk.slice(0, maxStepsOpt);
        }

        // ── Walk each step (pure — no DOM, no map) ─────────────────────────
        var visitedStepRefs        = [];
        var availableDecisionSteps = [];
        var prevWorkflow           = null;
        var finalStepRef           = null;
        var scenarioId             = null;
        var scenarioName           = null;
        var totalSteps             = fixture.steps.length;
        var stepWarnings           = [];

        for (var wi = 0; wi < stepsToWalk.length; wi++) {
            var wStep    = stepsToWalk[wi];
            var wStepRef = wStep.step_id;

            // Build step preview — no DOM, no map, no mutation
            var pvResult = buildScenarioStepPreview(fixture, wStepRef);
            if (!pvResult.passed || !pvResult.preview) {
                if (includeWarnings) {
                    stepWarnings.push('step ' + wStepRef + ': preview build failed: ' +
                        (pvResult.blockedReasons || []).join('; '));
                }
                continue;
            }
            var preview = pvResult.preview;
            if (pvResult.warnings && pvResult.warnings.length && includeWarnings) {
                for (var pwi = 0; pwi < pvResult.warnings.length; pwi++) {
                    stepWarnings.push(pvResult.warnings[pwi]);
                }
            }

            // Build review session from this preview
            var sessResult = buildWargame3ScenarioReviewSessionState(preview, {});
            if (!sessResult.passed || !sessResult.session) {
                if (includeWarnings) {
                    stepWarnings.push('step ' + wStepRef + ': session build failed');
                }
                continue;
            }
            var session = sessResult.session;

            // Capture scenario identity from first valid session
            if (!scenarioId   && session.scenarioId)   { scenarioId   = session.scenarioId; }
            if (!scenarioName && session.scenarioName)  { scenarioName = session.scenarioName; }

            // Build / update workflow state from session
            var wfResult = buildW3ScenarioWorkflowStateFromSession(session, prevWorkflow);
            if (!wfResult.passed || !wfResult.workflow) {
                if (includeWarnings) {
                    stepWarnings.push('step ' + wStepRef + ': workflow build failed');
                }
                continue;
            }
            prevWorkflow = wfResult.workflow;

            // Capture breadcrumbs from workflow (immutable copies via slice)
            visitedStepRefs        = wfResult.workflow.visitedStepRefs.slice(0);
            availableDecisionSteps = wfResult.workflow.availableDecisionSteps.slice(0);
            finalStepRef           = wStepRef;
        }

        if (stepWarnings.length) {
            warnings = warnings.concat(stepWarnings);
        }

        // ── Review / clear test cycle (options.reviewFirstAvailable) ──────
        // Validates that the first available decision step can be:
        //   1. Have a dry-run record built (buildWargame3OperatorSelectionDryRunRecord).
        //   2. Have that record validated (isWargame3OperatorSelectionDryRunRecordSafe).
        //   3. Session updated to show reviewedCoa.available === true.
        //   4. Session cleared back to reviewedCoa.available === false.
        // selectedDecision exists ONLY inside the dry-run record — never at preview level.
        // No expectedResult. previewComplete stays false. No DOM. No map. No storage.
        var reviewedCoaTest = {
            attempted:  false,
            stepRef:    null,
            optionRef:  null,
            label:      null,
            recordSafe: false,
            cleared:    false
        };

        if (reviewFirstAvailable && availableDecisionSteps.length > 0) {
            var rvStepRef = availableDecisionSteps[0];

            var rvPvResult = buildScenarioStepPreview(fixture, rvStepRef);
            if (rvPvResult.passed && rvPvResult.preview) {
                var rvPreview = rvPvResult.preview;
                var rvOptions = Array.isArray(rvPreview.decisionOptions)
                                ? rvPreview.decisionOptions : [];

                // Find first safe decision option
                var firstSafeOpt = null;
                for (var roi = 0; roi < rvOptions.length; roi++) {
                    var roCheck = isWargame3DecisionOptionSafe(rvOptions[roi]);
                    if (roCheck.passed) { firstSafeOpt = rvOptions[roi]; break; }
                }

                if (firstSafeOpt) {
                    reviewedCoaTest.attempted = true;
                    reviewedCoaTest.stepRef   = rvStepRef;
                    reviewedCoaTest.optionRef = firstSafeOpt.id;
                    reviewedCoaTest.label     = (typeof firstSafeOpt.label === 'string')
                                                ? firstSafeOpt.label : null;

                    // Build dry-run record — selectedDecision lives ONLY inside the record
                    var stepProxy = { stepRef: rvStepRef, decisionOptions: rvOptions };
                    var recResult = buildWargame3OperatorSelectionDryRunRecord(
                        stepProxy, firstSafeOpt.id,
                        { status: 'draft', operatorId: null, createdAt: null }
                    );

                    if (recResult.passed && recResult.record) {
                        // Validate the record
                        var recCheck = isWargame3OperatorSelectionDryRunRecordSafe(recResult.record);
                        reviewedCoaTest.recordSafe = recCheck.passed;

                        if (recCheck.passed) {
                            // Simulate review: preview with record attached
                            // selectedDecision is inside the record only — not at preview level
                            var reviewPreview = {
                                activeStepId:                  rvStepRef,
                                activeStepIndex:               rvPreview.activeStepIndex,
                                totalSteps:                    rvPreview.totalSteps,
                                fixtureId:                     rvPreview.fixtureId,
                                fixtureName:                   rvPreview.fixtureName,
                                decisionOptions:               rvOptions,
                                operatorSelectionDryRunRecord: recResult.record
                            };
                            var rvSessResult = buildWargame3ScenarioReviewSessionState(
                                reviewPreview, {});

                            if (rvSessResult.passed && rvSessResult.session &&
                                rvSessResult.session.reviewedCoa.available === true) {
                                // Review active — workflow updated (not stored to live state)
                                buildW3ScenarioWorkflowStateFromSession(
                                    rvSessResult.session, prevWorkflow);
                            }

                            // Simulate clear: preview WITHOUT the record
                            var clearPreview = {
                                activeStepId:    rvStepRef,
                                activeStepIndex: rvPreview.activeStepIndex,
                                totalSteps:      rvPreview.totalSteps,
                                fixtureId:       rvPreview.fixtureId,
                                fixtureName:     rvPreview.fixtureName,
                                decisionOptions: rvOptions
                            };
                            var clrSessResult = buildWargame3ScenarioReviewSessionState(
                                clearPreview, {});

                            if (clrSessResult.passed && clrSessResult.session &&
                                clrSessResult.session.reviewedCoa.available === false) {
                                reviewedCoaTest.cleared = true;
                            }
                        }
                    }
                }
            }
        }

        // Completeness: all W3 steps in the fixture were visited.
        // True only when the full allSteps set is covered — not just the bounded walk.
        // maxSteps / startStepRef / stopStepRef each reduce visitedCount below allSteps.length,
        // making completedWalkthrough false for partial runs.
        var completedWalkthrough = (allSteps.length > 0) &&
                                   (visitedStepRefs.length === allSteps.length);

        // ── Assemble walkthrough result ────────────────────────────────────
        var walkthrough = {
            walkthroughType:           'wargame3_scenario_workflow_walkthrough',
            source:                    'dry_run_preview',
            readOnly:                  true,
            dryRunOnly:                true,
            liveMutationAllowed:       false,
            backendCommitAllowed:      false,

            scenarioId:    scenarioId,
            scenarioName:  scenarioName,

            totalSteps:      totalSteps,
            visitedStepRefs: visitedStepRefs,
            visitedCount:    visitedStepRefs.length,

            availableDecisionSteps:     availableDecisionSteps,
            availableDecisionStepCount: availableDecisionSteps.length,

            reviewedCoaTest: reviewedCoaTest,

            safetyFlags: {
                expectedResultAttached: false,   // LOCKED — never set
                previewComplete:        false,   // LOCKED — never set
                liveMutationAllowed:    false,
                backendCommitAllowed:   false
            },

            finalStepRef:         finalStepRef,
            completedWalkthrough: completedWalkthrough
        };

        // PR-277 live state: ONLY update if explicitly opted-in.
        // Default is false — runner is pure and does NOT touch _w3ScenarioWorkflowState.
        if (updateLiveState === true) {
            _updateW3ScenarioWorkflowStateFromCurrentSession();
        }

        return { passed: true, walkthrough: walkthrough,
                 blockedReasons: [], warnings: warnings };
    }

    // checkWargame3ScenarioWorkflowAcceptance(previewSource, options?)
    //   Runs the full PR-278 walkthrough and checks 14 required acceptance conditions.
    //   Pure in-memory. No DOM. No map. No storage. No backend. No mutation.
    //   previewSource — adapted fixture (readOnly:true + steps[]) or raw W3 JSON.
    //   options  — passed through to runWargame3ScenarioWorkflowWalkthrough.
    //   Returns { passed, acceptanceResult:object|null, blockedReasons[], warnings[] }.
    //   acceptanceResult.readiness: 'accepted_for_next_phase' | 'blocked'.
    //   acceptanceResult.nextPhase: 'scenario_import_adapter_layer' | 'workflow_stabilization'.
    //   checkedAt is always null (no Date, no storage, no backend).
    function checkWargame3ScenarioWorkflowAcceptance(previewSource, options) {
        var opts           = (options && typeof options === 'object' && !Array.isArray(options))
                            ? options : {};
        var blockedReasons = [];
        var warnings       = [];

        // Rule 1: previewSource must be a non-null, non-array object
        if (!previewSource || typeof previewSource !== 'object' || Array.isArray(previewSource)) {
            blockedReasons.push('previewSource must be a non-null, non-array object');
            return { passed: false, acceptanceResult: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Run the walkthrough — always reviewFirstAvailable:true, updateLiveState:false
        var wtResult = runWargame3ScenarioWorkflowWalkthrough(previewSource, {
            reviewFirstAvailable: true,
            updateLiveState:      false
        });

        if (!wtResult.passed || !wtResult.walkthrough) {
            return { passed: false, acceptanceResult: null,
                     blockedReasons: wtResult.blockedReasons || blockedReasons,
                     warnings:       wtResult.warnings       || warnings };
        }

        var wt = wtResult.walkthrough;

        // Merge walkthrough warnings
        if (wtResult.warnings && wtResult.warnings.length) {
            warnings = warnings.concat(wtResult.warnings);
        }

        // ── Decision step coverage ─────────────────────────────────────────
        var requiredDecisionStepRefs  = ['W3-STEP-08'];
        var detectedDecisionStepRefs  = Array.isArray(wt.availableDecisionSteps)
                                        ? wt.availableDecisionSteps.slice(0) : [];
        var decisionStepCoveragePassed = true;
        for (var ri = 0; ri < requiredDecisionStepRefs.length; ri++) {
            if (detectedDecisionStepRefs.indexOf(requiredDecisionStepRefs[ri]) === -1) {
                decisionStepCoveragePassed = false;
                break;
            }
        }

        // ── 14 Acceptance checks ───────────────────────────────────────────
        var visitedRefs = Array.isArray(wt.visitedStepRefs) ? wt.visitedStepRefs : [];

        // Check 1: completedWalkthrough === true
        if (wt.completedWalkthrough !== true) {
            blockedReasons.push('completedWalkthrough must be true; got ' +
                                wt.completedWalkthrough);
        }
        // Check 2: totalSteps === 17
        if (wt.totalSteps !== 17) {
            blockedReasons.push('totalSteps must be 17; got ' + wt.totalSteps);
        }
        // Check 3: visitedCount === 17
        if (wt.visitedCount !== 17) {
            blockedReasons.push('visitedCount must be 17; got ' + wt.visitedCount);
        }
        // Check 4: visitedStepRefs includes W3-STEP-00
        if (visitedRefs.indexOf('W3-STEP-00') === -1) {
            blockedReasons.push('visitedStepRefs must include W3-STEP-00');
        }
        // Check 5: visitedStepRefs includes W3-STEP-08
        if (visitedRefs.indexOf('W3-STEP-08') === -1) {
            blockedReasons.push('visitedStepRefs must include W3-STEP-08');
        }
        // Check 6: visitedStepRefs includes W3-STEP-16
        if (visitedRefs.indexOf('W3-STEP-16') === -1) {
            blockedReasons.push('visitedStepRefs must include W3-STEP-16');
        }
        // Check 7: availableDecisionSteps includes W3-STEP-08
        if (!decisionStepCoveragePassed) {
            blockedReasons.push('availableDecisionSteps must include W3-STEP-08');
        }
        // Check 8: reviewedCoaTest.attempted === true
        if (!wt.reviewedCoaTest || wt.reviewedCoaTest.attempted !== true) {
            blockedReasons.push('reviewedCoaTest.attempted must be true');
        }
        // Check 9: reviewedCoaTest.recordSafe === true
        if (!wt.reviewedCoaTest || wt.reviewedCoaTest.recordSafe !== true) {
            blockedReasons.push('reviewedCoaTest.recordSafe must be true');
        }
        // Check 10: reviewedCoaTest.cleared === true
        if (!wt.reviewedCoaTest || wt.reviewedCoaTest.cleared !== true) {
            blockedReasons.push('reviewedCoaTest.cleared must be true');
        }
        // Check 11: safetyFlags.expectedResultAttached === false
        if (!wt.safetyFlags || wt.safetyFlags.expectedResultAttached !== false) {
            blockedReasons.push('safetyFlags.expectedResultAttached must be false');
        }
        // Check 12: safetyFlags.previewComplete === false
        if (!wt.safetyFlags || wt.safetyFlags.previewComplete !== false) {
            blockedReasons.push('safetyFlags.previewComplete must be false');
        }
        // Check 13: safetyFlags.liveMutationAllowed === false
        if (!wt.safetyFlags || wt.safetyFlags.liveMutationAllowed !== false) {
            blockedReasons.push('safetyFlags.liveMutationAllowed must be false');
        }
        // Check 14: safetyFlags.backendCommitAllowed === false
        if (!wt.safetyFlags || wt.safetyFlags.backendCommitAllowed !== false) {
            blockedReasons.push('safetyFlags.backendCommitAllowed must be false');
        }

        var passed    = (blockedReasons.length === 0);
        var readiness = passed ? 'accepted_for_next_phase' : 'blocked';
        var nextPhase = passed ? 'scenario_import_adapter_layer' : 'workflow_stabilization';

        var allStepsVisited = (wt.visitedCount === 17) && (wt.completedWalkthrough === true);

        var reviewCycle = wt.reviewedCoaTest || {
            attempted: false, stepRef: null, optionRef: null,
            label: null, recordSafe: false, cleared: false
        };

        var acceptanceResult = {
            acceptanceType:       'wargame3_scenario_workflow_acceptance',
            source:               'dry_run_preview',
            readOnly:             true,
            dryRunOnly:           true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,

            scenarioId:   wt.scenarioId,
            scenarioName: wt.scenarioName,

            requiredStepCount:  17,
            visitedStepCount:   wt.visitedCount,
            allStepsVisited:    allStepsVisited,

            requiredDecisionStepRefs:  requiredDecisionStepRefs,
            detectedDecisionStepRefs:  detectedDecisionStepRefs,
            decisionStepCoveragePassed: decisionStepCoveragePassed,

            reviewCycle: {
                attempted:  reviewCycle.attempted,
                passed:     (reviewCycle.attempted === true &&
                             reviewCycle.recordSafe === true &&
                             reviewCycle.cleared    === true),
                stepRef:    reviewCycle.stepRef,
                optionRef:  reviewCycle.optionRef,
                recordSafe: reviewCycle.recordSafe,
                cleared:    reviewCycle.cleared
            },

            safetyChecks: {
                expectedResultAttached:                false,  // LOCKED — never set
                previewComplete:                       false,  // LOCKED — never set
                liveMutationAllowed:                   false,
                backendCommitAllowed:                  false,
                selectedDecisionOnlyInsideDryRunRecord: true
            },

            readiness: readiness,
            nextPhase: nextPhase,
            checkedAt: null
        };

        return {
            passed:           passed,
            acceptanceResult: acceptanceResult,
            blockedReasons:   blockedReasons,
            warnings:         warnings
        };
    }

    // buildExternalScenarioCatalog(sourceManifest, options?)
    //   Pure catalog builder for external scenario manifests.
    //   No file reading. No fetch. No parsing of .scen/.pdf/.lua. No DOM. No map.
    //   No storage. No backend. No W3 workflow. No live scenario. No mutation.
    //   No adaptWargame3ToFixture. No previewWargame3Fixture. No expectedResult.
    //   sourceManifest — plain object with sourceKind, sourceName, files[].
    //   Returns { passed, catalog:object|null, blockedReasons[], warnings[] }.
    //   catalog shape: { catalogType, source, readOnly, dryRunOnly,
    //     liveMutationAllowed, backendCommitAllowed, sourceKind, sourceName,
    //     totalFiles, totalFolders, scenarioFileCount, companionFileCount,
    //     documentFileCount, assetFileCount, scriptFileCount,
    //     scenarioEntries[], folderSummary[], documentSummary[], scriptSummary[],
    //     importReadiness:{catalogOnly,previewOnly,conversionReady,liveApplyReady,
    //       requiresHumanReview}, unsupportedItems[], warningSummary }.
    function buildExternalScenarioCatalog(sourceManifest, options) {
        var opts           = (options && typeof options === 'object' && !Array.isArray(options))
                            ? options : {};
        var blockedReasons = [];
        var warnings       = [];

        // Rule 1: sourceManifest must be a plain non-null, non-array object
        if (!sourceManifest || typeof sourceManifest !== 'object' || Array.isArray(sourceManifest)) {
            blockedReasons.push('sourceManifest must be a non-null, non-array object');
            return { passed: false, catalog: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 2: sourceManifest.files must be an array
        if (!Array.isArray(sourceManifest.files)) {
            blockedReasons.push('sourceManifest.files must be an array');
            return { passed: false, catalog: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var files   = sourceManifest.files;
        var folders = Array.isArray(sourceManifest.folders) ? sourceManifest.folders : [];

        var sourceKind = (typeof sourceManifest.sourceKind === 'string' && sourceManifest.sourceKind)
                         ? sourceManifest.sourceKind : null;
        var sourceName = (typeof sourceManifest.sourceName === 'string' && sourceManifest.sourceName)
                         ? sourceManifest.sourceName : null;

        // Extension sets for categorisation — no file reading, no parsing
        var _EXT_SCENARIO  = ['.scen'];
        var _EXT_COMPANION = ['.ini'];
        var _EXT_DOCUMENT  = ['.pdf', '.docx', '.rtf', '.xlsx', '.txt'];
        var _EXT_ASSET     = ['.html', '.css', '.jpg', '.jpeg', '.png', '.gif'];
        var _EXT_SCRIPT    = ['.lua'];

        var scenarioFileCount  = 0;
        var companionFileCount = 0;
        var documentFileCount  = 0;
        var assetFileCount     = 0;
        var scriptFileCount    = 0;

        var scenarioFiles  = [];
        var companionFiles = [];
        var documentFiles  = [];
        var scriptFiles    = [];
        var unsupportedItems = [];

        for (var fi = 0; fi < files.length; fi++) {
            var f = files[fi];
            if (!f || typeof f !== 'object' || Array.isArray(f)) { continue; }
            var ext = (typeof f.extension === 'string') ? f.extension.toLowerCase() : '';

            if (_EXT_SCENARIO.indexOf(ext) !== -1) {
                scenarioFileCount++;
                scenarioFiles.push(f);
            } else if (_EXT_COMPANION.indexOf(ext) !== -1) {
                companionFileCount++;
                companionFiles.push(f);
            } else if (_EXT_DOCUMENT.indexOf(ext) !== -1) {
                documentFileCount++;
                documentFiles.push(f);
            } else if (_EXT_ASSET.indexOf(ext) !== -1) {
                assetFileCount++;
            } else if (_EXT_SCRIPT.indexOf(ext) !== -1) {
                scriptFileCount++;
                scriptFiles.push(f);
            } else {
                unsupportedItems.push({
                    path:      (typeof f.path      === 'string') ? f.path      : '',
                    name:      (typeof f.name      === 'string') ? f.name      : '',
                    extension: ext,
                    reason:    'extension not recognized'
                });
            }
        }

        // ── Build scenario entries ─────────────────────────────────────────
        var scenarioEntries = [];
        for (var si = 0; si < scenarioFiles.length; si++) {
            var sf      = scenarioFiles[si];
            var sfPath  = (typeof sf.path   === 'string') ? sf.path   : '';
            var sfName  = (typeof sf.name   === 'string') ? sf.name   : '';
            var sfFold  = (typeof sf.folder === 'string') ? sf.folder : null;

            // Title: filename without extension
            var titleBase = sfName;
            var doti = titleBase.lastIndexOf('.');
            if (doti !== -1) { titleBase = titleBase.slice(0, doti); }

            // Stable id: index + slug from title
            var idSlug = 'extscen-' + si + '-' +
                         titleBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

            // Companion .ini: same base name + .ini, same folder
            var companionIniPath = null;
            var expectedIni = titleBase + '.ini';
            for (var ci = 0; ci < companionFiles.length; ci++) {
                var cf = companionFiles[ci];
                if ((typeof cf.name === 'string') &&
                    cf.name.toLowerCase() === expectedIni.toLowerCase() &&
                    ((typeof cf.folder === 'string') ? cf.folder : null) === sfFold) {
                    companionIniPath = (typeof cf.path === 'string') ? cf.path : null;
                    break;
                }
            }

            // documentRefs: documents in the same non-null folder
            var documentRefs = [];
            for (var di = 0; di < documentFiles.length; di++) {
                var df     = documentFiles[di];
                var dfFold = (typeof df.folder === 'string') ? df.folder : null;
                if (dfFold !== null && dfFold === sfFold) {
                    var dfPath = (typeof df.path === 'string') ? df.path : null;
                    if (dfPath) { documentRefs.push(dfPath); }
                }
            }

            // scriptRefs: scripts whose folder path contains the scenario title
            var scriptRefs = [];
            if (titleBase) {
                for (var scri = 0; scri < scriptFiles.length; scri++) {
                    var scrf    = scriptFiles[scri];
                    var scrFold = (typeof scrf.folder === 'string') ? scrf.folder : '';
                    if (scrFold && scrFold.toLowerCase().indexOf(titleBase.toLowerCase()) !== -1) {
                        var scrPath = (typeof scrf.path === 'string') ? scrf.path : null;
                        if (scrPath) { scriptRefs.push(scrPath); }
                    }
                }
            }

            scenarioEntries.push({
                id:                  idSlug,
                title:               titleBase,
                path:                sfPath,
                extension:           '.scen',
                folder:              sfFold,
                companionIniPath:    companionIniPath,
                documentRefs:        documentRefs,
                scriptRefs:          scriptRefs,
                importStatus:        'cataloged_only',
                conversionReady:     false,
                requiresHumanReview: true
            });
        }

        // ── Folder summary ─────────────────────────────────────────────────
        var folderSummary = [];
        for (var foli = 0; foli < folders.length; foli++) {
            var fol = folders[foli];
            if (fol && typeof fol === 'object' && !Array.isArray(fol)) {
                folderSummary.push({
                    path: (typeof fol.path === 'string') ? fol.path : '',
                    name: (typeof fol.name === 'string') ? fol.name : ''
                });
            }
        }

        // ── Document summary ───────────────────────────────────────────────
        var documentSummary = [];
        for (var dsi = 0; dsi < documentFiles.length; dsi++) {
            var dsf = documentFiles[dsi];
            documentSummary.push({
                path:      (typeof dsf.path      === 'string') ? dsf.path      : '',
                name:      (typeof dsf.name      === 'string') ? dsf.name      : '',
                extension: (typeof dsf.extension === 'string') ? dsf.extension.toLowerCase() : ''
            });
        }

        // ── Script summary ─────────────────────────────────────────────────
        var scriptSummary = [];
        for (var ssi = 0; ssi < scriptFiles.length; ssi++) {
            var ssf = scriptFiles[ssi];
            scriptSummary.push({
                path:      (typeof ssf.path === 'string') ? ssf.path : '',
                name:      (typeof ssf.name === 'string') ? ssf.name : '',
                extension: '.lua'
            });
        }

        // ── Warning summary ────────────────────────────────────────────────
        var warningCodes = [];
        if (unsupportedItems.length > 0) {
            warningCodes.push('unsupported_file_extensions');
            warnings.push('unsupported file extensions found: ' + unsupportedItems.length + ' file(s)');
        }
        if (!sourceKind) {
            warningCodes.push('source_kind_missing');
            warnings.push('sourceManifest.sourceKind not set');
        }
        if (!sourceName) {
            warningCodes.push('source_name_missing');
            warnings.push('sourceManifest.sourceName not set');
        }

        var catalog = {
            catalogType:          'external_scenario_catalog',
            source:               'external_manifest',
            readOnly:             true,
            dryRunOnly:           true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,

            sourceKind: sourceKind,
            sourceName: sourceName,

            totalFiles:   files.length,
            totalFolders: folders.length,

            scenarioFileCount:  scenarioFileCount,
            companionFileCount: companionFileCount,
            documentFileCount:  documentFileCount,
            assetFileCount:     assetFileCount,
            scriptFileCount:    scriptFileCount,

            scenarioEntries: scenarioEntries,
            folderSummary:   folderSummary,
            documentSummary: documentSummary,
            scriptSummary:   scriptSummary,

            importReadiness: {
                catalogOnly:         true,
                previewOnly:         true,
                conversionReady:     false,
                liveApplyReady:      false,
                requiresHumanReview: true
            },

            unsupportedItems: unsupportedItems,
            warningSummary: {
                warningCount: warningCodes.length,
                warningCodes: warningCodes
            }
        };

        return { passed: true, catalog: catalog,
                 blockedReasons: blockedReasons, warnings: warnings };
    }

    // summarizeExternalScenarioCatalog(catalog)
    //   Compact summary for an already-built external scenario catalog.
    //   Pure. No DOM. No storage. No backend. No mutation.
    //   catalog — result of buildExternalScenarioCatalog.
    //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
    //   summary shape: { sourceKind, sourceName, totalFiles, scenarioFileCount,
    //     companionFileCount, documentFileCount, assetFileCount, scriptFileCount,
    //     unsupportedCount, importMode:'catalog_only',
    //     nextRecommendedAction:'human_review' }.
    function summarizeExternalScenarioCatalog(catalog) {
        var blockedReasons = [];
        var warnings       = [];

        // Rule 1: catalog must be a non-null, non-array object
        if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
            blockedReasons.push('catalog must be a non-null, non-array object');
            return { passed: false, summary: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Rule 2: catalog.catalogType must be 'external_scenario_catalog'
        if (catalog.catalogType !== 'external_scenario_catalog') {
            blockedReasons.push('catalog.catalogType must be external_scenario_catalog');
            return { passed: false, summary: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var unsupportedCount = Array.isArray(catalog.unsupportedItems)
                               ? catalog.unsupportedItems.length : 0;

        var summary = {
            sourceKind:            catalog.sourceKind,
            sourceName:            catalog.sourceName,
            totalFiles:            typeof catalog.totalFiles         === 'number' ? catalog.totalFiles         : 0,
            scenarioFileCount:     typeof catalog.scenarioFileCount  === 'number' ? catalog.scenarioFileCount  : 0,
            companionFileCount:    typeof catalog.companionFileCount === 'number' ? catalog.companionFileCount : 0,
            documentFileCount:     typeof catalog.documentFileCount  === 'number' ? catalog.documentFileCount  : 0,
            assetFileCount:        typeof catalog.assetFileCount     === 'number' ? catalog.assetFileCount     : 0,
            scriptFileCount:       typeof catalog.scriptFileCount    === 'number' ? catalog.scriptFileCount    : 0,
            unsupportedCount:      unsupportedCount,
            importMode:            'catalog_only',
            nextRecommendedAction: 'human_review'
        };

        return { passed: true, summary: summary,
                 blockedReasons: blockedReasons, warnings: warnings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PR-280B: Single External Scenario Catalog Entry — smoke-test helper.
    //
    // buildSingleExternalScenarioCatalogEntry(sourceManifest, selectorOrOptions?)
    //   Pure helper — no file reading, no fetch, no .scen parsing, no .ini metadata.
    //   No Lua execution.  No DOM.  No map.  No storage.  No backend.  No mutation.
    //   No adaptWargame3ToFixture.  No previewWargame3Fixture.  No expectedResult.
    //   No previewComplete.  No selectedDecision.
    //
    //   sourceManifest    — PR-280A external_scenario_source_manifest object.
    //   selectorOrOptions — optional plain object:
    //     { scenarioId, title, path,
    //       preferHighConfidence (default true),
    //       avoidLua             (default true),
    //       requireXlsxMatch     (default false) }
    //
    //   Returns { passed, entry:object|null, blockedReasons[], warnings[] }.
    //   entry shape: { entryType:'external_scenario_catalog_entry', source,
    //     readOnly:true, dryRunOnly:true, catalogOnly:true, previewOnly:true,
    //     liveMutationAllowed:false, backendCommitAllowed:false,
    //     sourceKind, sourceName, scenarioId, title, year, author, notes,
    //     path, fileName, sizeBytes, campaignSeries, folderGroup, confidence,
    //     hasIniWeaponPatch, iniWeaponPatchPath, iniTreatedAsMetadata:false,
    //     hasHtmlBriefing, htmlBriefingPaths, hasDocumentBriefing, documentBriefingPaths,
    //     hasLua, luaScriptPaths, luaExecutionBlocked:true,
    //     scenBinaryParsed:false, conversionReady:false, requiresHumanReview:true,
    //     importStatus:'catalog_entry_only', sourceTrace, safetyFlags }.
    // ─────────────────────────────────────────────────────────────────────────
    function buildSingleExternalScenarioCatalogEntry(sourceManifest, selectorOrOptions) {
        var opts           = (selectorOrOptions && typeof selectorOrOptions === 'object' &&
                              !Array.isArray(selectorOrOptions))
                             ? selectorOrOptions : {};
        var blockedReasons = [];
        var warnings       = [];

        // ── Guard: sourceManifest ─────────────────────────────────────────
        if (!sourceManifest || typeof sourceManifest !== 'object' || Array.isArray(sourceManifest)) {
            blockedReasons.push('sourceManifest must be a non-null, non-array object');
            return { passed: false, entry: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        if (!Array.isArray(sourceManifest.scenarios)) {
            blockedReasons.push('sourceManifest.scenarios must be an array');
            return { passed: false, entry: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var scenarios  = sourceManifest.scenarios;
        var sourceKind = (typeof sourceManifest.sourceKind === 'string' && sourceManifest.sourceKind)
                         ? sourceManifest.sourceKind : null;
        var sourceName = (typeof sourceManifest.sourceName === 'string' && sourceManifest.sourceName)
                         ? sourceManifest.sourceName : null;

        // ── Selector options ──────────────────────────────────────────────
        var selId    = (typeof opts.scenarioId === 'string' && opts.scenarioId) ? opts.scenarioId : null;
        var selPath  = (typeof opts.path       === 'string' && opts.path)       ? opts.path       : null;
        var selTitle = (typeof opts.title      === 'string' && opts.title)      ? opts.title      : null;
        var preferHighConf   = (opts.preferHighConfidence !== false);   // default true
        var avoidLua         = (opts.avoidLua             !== false);   // default true
        var requireXlsxMatch = (opts.requireXlsxMatch     === true);   // default false

        var selected = null;

        // ── Explicit selector: scenarioId ─────────────────────────────────
        if (selId) {
            for (var si = 0; si < scenarios.length; si++) {
                if (scenarios[si] && scenarios[si].scenarioId === selId) {
                    selected = scenarios[si];
                    break;
                }
            }
            if (!selected) {
                blockedReasons.push('scenarioId not found in sourceManifest.scenarios: ' + selId);
                return { passed: false, entry: null,
                         blockedReasons: blockedReasons, warnings: warnings };
            }
        // ── Explicit selector: path ───────────────────────────────────────
        } else if (selPath) {
            for (var pi = 0; pi < scenarios.length; pi++) {
                if (scenarios[pi] && scenarios[pi].path === selPath) {
                    selected = scenarios[pi];
                    break;
                }
            }
            if (!selected) {
                blockedReasons.push('path not found in sourceManifest.scenarios: ' + selPath);
                return { passed: false, entry: null,
                         blockedReasons: blockedReasons, warnings: warnings };
            }
        // ── Explicit selector: title ──────────────────────────────────────
        } else if (selTitle) {
            var selTitleLower = selTitle.toLowerCase();
            for (var ti = 0; ti < scenarios.length; ti++) {
                var tsc = scenarios[ti];
                if (tsc && typeof tsc.title === 'string' &&
                    tsc.title.toLowerCase() === selTitleLower) {
                    selected = tsc;
                    break;
                }
            }
            if (!selected) {
                blockedReasons.push('title not found in sourceManifest.scenarios: ' + selTitle);
                return { passed: false, entry: null,
                         blockedReasons: blockedReasons, warnings: warnings };
            }
        // ── Default selection ─────────────────────────────────────────────
        } else {
            // Scoring: high confidence +4, no Lua +2, XLSX-matched +1.
            // Walk all scenarios; select highest score (first-wins on tie).
            var bestScore = -1;
            for (var di = 0; di < scenarios.length; di++) {
                var cand = scenarios[di];
                if (!cand || typeof cand !== 'object') { continue; }
                if (requireXlsxMatch) {
                    var st = cand.sourceTrace;
                    if (!st || st.titleFrom !== 'xlsx') { continue; }
                }
                var score = 0;
                if (preferHighConf && cand.confidence === 'high')             { score += 4; }
                if (avoidLua      && cand.hasLua !== true)                    { score += 2; }
                if (cand.sourceTrace && cand.sourceTrace.titleFrom === 'xlsx') { score += 1; }
                if (score > bestScore) { bestScore = score; selected = cand; }
            }
            // Absolute fallback: first non-null entry, only when no hard filter is active.
            // requireXlsxMatch:true is a hard filter — do not bypass it with a fallback.
            if (!selected && !requireXlsxMatch) {
                for (var fi = 0; fi < scenarios.length; fi++) {
                    if (scenarios[fi] && typeof scenarios[fi] === 'object') {
                        selected = scenarios[fi];
                        break;
                    }
                }
            }
            if (!selected) {
                var filterNote = requireXlsxMatch
                    ? ' (requireXlsxMatch:true — no xlsx-matched scenarios found)'
                    : '';
                blockedReasons.push('no suitable scenario found in sourceManifest.scenarios' +
                                    filterNote);
                return { passed: false, entry: null,
                         blockedReasons: blockedReasons, warnings: warnings };
            }
        }

        // ── Build entry — read-only copy; never mutate selected/sourceManifest ──
        var rawTrace = (selected.sourceTrace && typeof selected.sourceTrace === 'object' &&
                        !Array.isArray(selected.sourceTrace))
                       ? selected.sourceTrace : {};

        var entry = {
            entryType:            'external_scenario_catalog_entry',
            source:               'external_scenario_source_manifest',
            readOnly:             true,
            dryRunOnly:           true,
            catalogOnly:          true,
            previewOnly:          true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,

            sourceKind: sourceKind,
            sourceName: sourceName,

            scenarioId: (typeof selected.scenarioId === 'string') ? selected.scenarioId : null,
            title:      (typeof selected.title      === 'string') ? selected.title      : '',
            year:       (typeof selected.year       === 'number') ? selected.year       : null,
            author:     (typeof selected.author     === 'string' && selected.author)
                        ? selected.author : null,
            notes:      (typeof selected.xlsxNotes  === 'string' && selected.xlsxNotes)
                        ? selected.xlsxNotes : null,

            path:      (typeof selected.path     === 'string') ? selected.path     : null,
            fileName:  (typeof selected.fileName === 'string') ? selected.fileName : null,
            sizeBytes: (typeof selected.sizeBytes === 'number') ? selected.sizeBytes : null,

            campaignSeries: (typeof selected.campaignSeries === 'string' && selected.campaignSeries)
                            ? selected.campaignSeries : null,
            folderGroup:    (typeof selected.folderGroup    === 'string')
                            ? selected.folderGroup : null,
            confidence:     (['high', 'medium', 'low'].indexOf(selected.confidence) !== -1)
                            ? selected.confidence : 'low',

            hasIniWeaponPatch:  (selected.hasIniWeaponPatch === true),
            iniWeaponPatchPath: (typeof selected.iniWeaponPatchPath === 'string' &&
                                 selected.iniWeaponPatchPath)
                                ? selected.iniWeaponPatchPath : null,
            iniTreatedAsMetadata: false,  // HARD LOCK — .ini is weapon-patch only

            hasHtmlBriefing:    (selected.hasHtmlBriefing === true),
            htmlBriefingPaths:  Array.isArray(selected.htmlBriefingPaths)
                                ? selected.htmlBriefingPaths.slice() : [],

            hasDocumentBriefing:   (selected.hasDocumentBriefing === true),
            documentBriefingPaths: Array.isArray(selected.documentBriefingPaths)
                                   ? selected.documentBriefingPaths.slice() : [],

            hasLua:             (selected.hasLua === true),
            luaScriptPaths:     Array.isArray(selected.luaScriptPaths)
                                ? selected.luaScriptPaths.slice() : [],
            luaExecutionBlocked: true,   // HARD LOCK — Lua never executed

            scenBinaryParsed:    false,  // HARD LOCK
            conversionReady:     false,  // HARD LOCK
            requiresHumanReview: true,   // HARD LOCK
            importStatus:        'catalog_entry_only',

            sourceTrace: {
                titleFrom:        (typeof rawTrace.titleFrom        === 'string')
                                  ? rawTrace.titleFrom        : null,
                yearFrom:         (typeof rawTrace.yearFrom         === 'string')
                                  ? rawTrace.yearFrom         : null,
                authorFrom:       (typeof rawTrace.authorFrom       === 'string')
                                  ? rawTrace.authorFrom       : null,
                notesFrom:        (typeof rawTrace.notesFrom        === 'string')
                                  ? rawTrace.notesFrom        : null,
                relationshipFrom: (typeof rawTrace.relationshipFrom === 'string')
                                  ? rawTrace.relationshipFrom : null
            },

            safetyFlags: {
                expectedResultAttached:   false,
                previewComplete:          false,
                selectedDecisionAttached: false,
                liveMutationAllowed:      false,
                backendCommitAllowed:     false
            }
        };

        return { passed: true, entry: entry,
                 blockedReasons: blockedReasons, warnings: warnings };
    }

    // summarizeSingleExternalScenarioCatalogEntry(entry)
    //   Compact summary for a single external scenario catalog entry.
    //   Pure.  No DOM.  No storage.  No backend.  No mutation.
    //   entry — built by buildSingleExternalScenarioCatalogEntry.
    //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
    //   summary shape: { scenarioId, title, year, author, confidence,
    //     importMode:'single_catalog_entry_only',
    //     hasReadableBriefingReference, hasLuaBlocked,
    //     nextRecommendedAction:'manual_preview_review' }.
    function summarizeSingleExternalScenarioCatalogEntry(entry) {
        var blockedReasons = [];
        var warnings       = [];

        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            blockedReasons.push('entry must be a non-null, non-array object');
            return { passed: false, summary: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        if (entry.entryType !== 'external_scenario_catalog_entry') {
            blockedReasons.push('entry.entryType must be external_scenario_catalog_entry; got: ' +
                                JSON.stringify(entry.entryType));
            return { passed: false, summary: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var hasReadableBriefingReference = (entry.hasHtmlBriefing === true ||
                                            entry.hasDocumentBriefing === true);

        var summary = {
            scenarioId:                   entry.scenarioId,
            title:                        entry.title,
            year:                         entry.year,
            author:                       entry.author,
            confidence:                   entry.confidence,
            importMode:                   'single_catalog_entry_only',
            hasReadableBriefingReference: hasReadableBriefingReference,
            hasLuaBlocked:                (entry.hasLua === true &&
                                           entry.luaExecutionBlocked === true),
            nextRecommendedAction:        'manual_preview_review'
        };

        return { passed: true, summary: summary,
                 blockedReasons: blockedReasons, warnings: warnings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PR-280C: Filtered/paginated external scenario catalog subset builder.
    //
    // buildExternalScenarioCatalogFromManifest(sourceManifest, options?)
    //   Pure helper.  No .scen parsing.  No .ini metadata.  No Lua execution.
    //   No DOM.  No map.  No storage.  No backend.  No mutation.  No UI.
    //   No adaptWargame3ToFixture.  No previewWargame3Fixture.  No expectedResult.
    //   No previewComplete.  No selectedDecision.
    //
    //   Returns at most 25 entries (hard cap).
    //   Supports filter, sort, and pagination over sourceManifest.scenarios.
    //
    //   options: {
    //     limit?               number  (default 10, capped at 25)
    //     offset?              number  (default 0)
    //     campaignSeries?      string  (exact match, case-insensitive)
    //     confidence?          "high" | "medium" | "low"
    //     requireXlsxMatch?    boolean (default false)
    //     avoidLua?            boolean (default true)
    //     includeLuaBlocked?   boolean (default false — overrides avoidLua when true)
    //     requireHtmlBriefing? boolean (default false)
    //     requireDocumentBriefing? boolean (default false)
    //     titleSearch?         string  (case-insensitive substring)
    //     sortBy?              "scenarioId"|"title"|"year"|"confidence" (default "scenarioId")
    //     sortDirection?       "asc"|"desc" (default "asc")
    //   }
    //
    //   Returns { passed, catalog:object|null, blockedReasons[], warnings[] }.
    //   catalog shape: { catalogType:'external_scenario_catalog_subset', source,
    //     readOnly:true, dryRunOnly:true, catalogOnly:true, previewOnly:true,
    //     liveMutationAllowed:false, backendCommitAllowed:false,
    //     sourceKind, sourceName,
    //     totalAvailableScenarios, totalMatchedScenarios, returnedCount,
    //     limit, offset, hasMore, filtersApplied, entries[],
    //     safetyFlags, importReadiness, warningSummary }.
    // ─────────────────────────────────────────────────────────────────────────
    function buildExternalScenarioCatalogFromManifest(sourceManifest, options) {
        var opts           = (options && typeof options === 'object' && !Array.isArray(options))
                             ? options : {};
        var blockedReasons = [];
        var warnings       = [];
        var warningCodes   = [];

        // ── Guard ──────────────────────────────────────────────────────────
        if (!sourceManifest || typeof sourceManifest !== 'object' || Array.isArray(sourceManifest)) {
            blockedReasons.push('sourceManifest must be a non-null, non-array object');
            return { passed: false, catalog: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        if (!Array.isArray(sourceManifest.scenarios)) {
            blockedReasons.push('sourceManifest.scenarios must be an array');
            return { passed: false, catalog: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var scenarios               = sourceManifest.scenarios;
        var totalAvailableScenarios = scenarios.length;
        var sourceKind = (typeof sourceManifest.sourceKind === 'string' && sourceManifest.sourceKind)
                         ? sourceManifest.sourceKind : null;
        var sourceName = (typeof sourceManifest.sourceName === 'string' && sourceManifest.sourceName)
                         ? sourceManifest.sourceName : null;

        // ── Parse options ──────────────────────────────────────────────────
        var MAX_LIMIT      = 25;
        var rawLimit       = (typeof opts.limit  === 'number') ? Math.floor(opts.limit)         : 10;
        var offset         = (typeof opts.offset === 'number') ? Math.max(0, Math.floor(opts.offset)) : 0;
        var limit          = Math.max(1, rawLimit);
        if (limit > MAX_LIMIT) {
            limit = MAX_LIMIT;
            warningCodes.push('LIMIT_CLAMPED');
            warnings.push('limit clamped to ' + MAX_LIMIT + ' (requested: ' + rawLimit + ')');
        }

        var filterCampaignSeries    = (typeof opts.campaignSeries === 'string' && opts.campaignSeries)
                                      ? opts.campaignSeries : null;
        var filterConfidence        = (['high', 'medium', 'low'].indexOf(opts.confidence) !== -1)
                                      ? opts.confidence : null;
        var requireXlsxMatch        = (opts.requireXlsxMatch        === true);
        var avoidLua                = (opts.avoidLua                !== false);  // default true
        var includeLuaBlocked       = (opts.includeLuaBlocked       === true);   // default false
        var requireHtmlBriefing     = (opts.requireHtmlBriefing     === true);   // default false
        var requireDocumentBriefing = (opts.requireDocumentBriefing === true);   // default false
        var titleSearch             = (typeof opts.titleSearch === 'string' && opts.titleSearch)
                                      ? opts.titleSearch : null;
        var titleSearchLower        = titleSearch ? titleSearch.toLowerCase() : null;
        var sortBy        = (['title', 'year', 'confidence', 'scenarioId'].indexOf(opts.sortBy) !== -1)
                            ? opts.sortBy : 'scenarioId';
        var sortDirection = (opts.sortDirection === 'desc') ? 'desc' : 'asc';

        // ── Filter ─────────────────────────────────────────────────────────
        // Rule: if (avoidLua && !includeLuaBlocked) → skip Lua scenarios.
        // includeLuaBlocked overrides avoidLua when true.
        var filtered = [];
        for (var fi = 0; fi < scenarios.length; fi++) {
            var s = scenarios[fi];
            if (!s || typeof s !== 'object' || Array.isArray(s)) { continue; }

            if (s.hasLua === true && avoidLua && !includeLuaBlocked) { continue; }

            if (filterConfidence !== null && s.confidence !== filterConfidence) { continue; }

            if (requireXlsxMatch) {
                var st = s.sourceTrace;
                if (!st || st.titleFrom !== 'xlsx') { continue; }
            }

            if (filterCampaignSeries !== null) {
                if (typeof s.campaignSeries !== 'string' ||
                    s.campaignSeries.toLowerCase() !== filterCampaignSeries.toLowerCase()) {
                    continue;
                }
            }

            if (requireHtmlBriefing     && s.hasHtmlBriefing     !== true) { continue; }
            if (requireDocumentBriefing && s.hasDocumentBriefing !== true) { continue; }

            if (titleSearchLower !== null) {
                if (typeof s.title !== 'string' ||
                    s.title.toLowerCase().indexOf(titleSearchLower) === -1) { continue; }
            }

            filtered.push(s);
        }

        // ── Sort ───────────────────────────────────────────────────────────
        var CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };
        filtered.sort(function (a, b) {
            var va, vb;
            if (sortBy === 'title') {
                va = (typeof a.title === 'string') ? a.title.toLowerCase() : '';
                vb = (typeof b.title === 'string') ? b.title.toLowerCase() : '';
            } else if (sortBy === 'year') {
                va = (typeof a.year === 'number') ? a.year : 9999;
                vb = (typeof b.year === 'number') ? b.year : 9999;
            } else if (sortBy === 'confidence') {
                va = (CONFIDENCE_RANK[a.confidence] !== undefined) ? CONFIDENCE_RANK[a.confidence] : 99;
                vb = (CONFIDENCE_RANK[b.confidence] !== undefined) ? CONFIDENCE_RANK[b.confidence] : 99;
            } else {
                // scenarioId (default)
                va = (typeof a.scenarioId === 'string') ? a.scenarioId : '';
                vb = (typeof b.scenarioId === 'string') ? b.scenarioId : '';
            }
            var cmp = (va < vb) ? -1 : (va > vb) ? 1 : 0;
            return (sortDirection === 'desc') ? -cmp : cmp;
        });

        var totalMatchedScenarios = filtered.length;

        // ── Paginate ───────────────────────────────────────────────────────
        var page         = filtered.slice(offset, offset + limit);
        var returnedCount = page.length;
        var hasMore      = (offset + returnedCount) < totalMatchedScenarios;

        // ── Build entries — delegate to PR-280B helper (≤25 calls max) ────
        var entries = [];
        for (var ei = 0; ei < page.length; ei++) {
            var er = buildSingleExternalScenarioCatalogEntry(sourceManifest,
                         { scenarioId: page[ei].scenarioId });
            if (er.passed && er.entry) { entries.push(er.entry); }
        }

        // ── Assemble catalog ───────────────────────────────────────────────
        var catalog = {
            catalogType:          'external_scenario_catalog_subset',
            source:               'external_scenario_source_manifest',
            readOnly:             true,
            dryRunOnly:           true,
            catalogOnly:          true,
            previewOnly:          true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,

            sourceKind: sourceKind,
            sourceName: sourceName,

            totalAvailableScenarios: totalAvailableScenarios,
            totalMatchedScenarios:   totalMatchedScenarios,
            returnedCount:           returnedCount,
            limit:                   limit,
            offset:                  offset,
            hasMore:                 hasMore,

            filtersApplied: {
                campaignSeries:          filterCampaignSeries,
                confidence:              filterConfidence,
                requireXlsxMatch:        requireXlsxMatch,
                avoidLua:                avoidLua,
                includeLuaBlocked:       includeLuaBlocked,
                requireHtmlBriefing:     requireHtmlBriefing,
                requireDocumentBriefing: requireDocumentBriefing,
                titleSearch:             titleSearch,
                sortBy:                  sortBy,
                sortDirection:           sortDirection
            },

            entries: entries,

            safetyFlags: {
                scenBinaryParsed:         false,
                iniTreatedAsMetadata:     false,
                luaExecuted:              false,
                expectedResultAttached:   false,
                previewComplete:          false,
                selectedDecisionAttached: false,
                liveMutationAllowed:      false,
                backendCommitAllowed:     false
            },

            importReadiness: {
                catalogOnly:         true,
                previewOnly:         true,
                conversionReady:     false,
                liveApplyReady:      false,
                requiresHumanReview: true
            },

            warningSummary: {
                warningCount: warningCodes.length,
                warningCodes: warningCodes.slice()
            }
        };

        return { passed: true, catalog: catalog,
                 blockedReasons: blockedReasons, warnings: warnings };
    }

    // summarizeExternalScenarioCatalogSubset(catalog)
    //   Compact summary for a PR-280C external_scenario_catalog_subset.
    //   Pure.  No DOM.  No storage.  No backend.  No mutation.
    //   catalog — built by buildExternalScenarioCatalogFromManifest.
    //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
    //   summary.importMode: 'catalog_subset_only'.
    //   summary.nextRecommendedAction: 'manual_subset_review'.
    function summarizeExternalScenarioCatalogSubset(catalog) {
        var blockedReasons = [];
        var warnings       = [];

        if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
            blockedReasons.push('catalog must be a non-null, non-array object');
            return { passed: false, summary: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        if (catalog.catalogType !== 'external_scenario_catalog_subset') {
            blockedReasons.push('catalog.catalogType must be external_scenario_catalog_subset; got: ' +
                                JSON.stringify(catalog.catalogType));
            return { passed: false, summary: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var summary = {
            sourceKind:               catalog.sourceKind,
            sourceName:               catalog.sourceName,
            totalAvailableScenarios:  (typeof catalog.totalAvailableScenarios === 'number')
                                      ? catalog.totalAvailableScenarios : 0,
            totalMatchedScenarios:    (typeof catalog.totalMatchedScenarios   === 'number')
                                      ? catalog.totalMatchedScenarios   : 0,
            returnedCount:            (typeof catalog.returnedCount           === 'number')
                                      ? catalog.returnedCount           : 0,
            hasMore:                  (catalog.hasMore === true),
            importMode:               'catalog_subset_only',
            nextRecommendedAction:    'manual_subset_review',
            filtersApplied:           (catalog.filtersApplied && typeof catalog.filtersApplied === 'object')
                                      ? catalog.filtersApplied : {},
            warningCount:             (catalog.warningSummary &&
                                       typeof catalog.warningSummary.warningCount === 'number')
                                      ? catalog.warningSummary.warningCount : 0
        };

        return { passed: true, summary: summary,
                 blockedReasons: blockedReasons, warnings: warnings };
    }

    // ── PR-281: External Scenario Preview Hook ───────────────────────────
    // Read-only metadata panel injected into #scenario-workspace-panel.
    // Shows title / year / author / confidence / campaign / path / briefing flags
    // for exactly one external_scenario_catalog_entry.
    // SAFETY: No .scen parsing. No .ini metadata usage. No Lua execution.
    //         No Import / Apply / Run / Execute / Commit / Confirm / Approve buttons.
    //         No storage. No backend. No fetch. No mutation. No Gate 7.
    //         _extPreviewEntry is module-private and never written to DOM storage.

    // _initExtPreviewSection — injects the #sw-ext-preview-section skeleton once.
    // Called from init(). Idempotent — safe to call multiple times.
    // PR-283: injects into #sw-external-catalog-source-card (before #sw-ext-trace-section)
    //         when that card exists; falls back to #scenario-workspace-panel.
    function _initExtPreviewSection() {
        if (document.getElementById('sw-ext-preview-section')) return;

        // PR-283: prefer to inject inside the external catalog subcard
        var target = document.getElementById('sw-external-catalog-source-card') ||
                     document.getElementById('scenario-workspace-panel');
        if (!target) return;

        var sec = document.createElement('div');
        sec.id = 'sw-ext-preview-section';
        sec.className = 'sw-ext-preview-section';
        sec.setAttribute('aria-label', 'External Scenario Preview');

        // Section header reuses existing .sw-w3-section-hdr classes — no new CSS.
        sec.innerHTML =
            '<div class="sw-w3-section-hdr">' +
                '<span class="sw-w3-section-hdr-title">External Scenario Preview</span>' +
                '<span class="sw-w3-section-hdr-sub">' +
                    'Catalog entry only — read-only. No import. No live scenario.' +
                '</span>' +
            '</div>' +
            '<p id="sw-ext-preview-empty" class="sw-ext-preview-empty">' +
                'No external scenario selected.' +
            '</p>' +
            '<dl id="sw-ext-preview-body" class="sw-dpkg-grid" hidden></dl>';

        // Insert before #sw-ext-trace-section when it is a direct child of the target,
        // so the visual order is: selector → preview → trace.
        var traceEl = document.getElementById('sw-ext-trace-section');
        if (traceEl && traceEl.parentNode === target) {
            target.insertBefore(sec, traceEl);
        } else {
            target.appendChild(sec);
        }
    }

    // paintExternalScenarioPreviewEntry — renders entry fields into the panel.
    // Passing null / undefined / wrong type resets to empty state.
    // Calling without argument uses the module-level _extPreviewEntry.
    function paintExternalScenarioPreviewEntry(entryArg) {
        var entry = (arguments.length > 0) ? entryArg : _extPreviewEntry;
        var emptyEl = document.getElementById('sw-ext-preview-empty');
        var bodyEl  = document.getElementById('sw-ext-preview-body');
        if (!emptyEl || !bodyEl) return;

        if (!entry || typeof entry !== 'object' ||
                entry.entryType !== 'external_scenario_catalog_entry') {
            emptyEl.removeAttribute('hidden');
            bodyEl.setAttribute('hidden', '');
            bodyEl.innerHTML = '';
            // PR-284: clear trace when preview is cleared
            if (typeof paintExternalScenarioSourceTrace === 'function') {
                paintExternalScenarioSourceTrace(null);
            }
            return;
        }

        emptyEl.setAttribute('hidden', '');
        bodyEl.removeAttribute('hidden');

        function row(label, val) {
            var display = (val !== undefined && val !== null && String(val).length > 0)
                          ? String(val) : '—'; // em-dash for empty
            return '<div class="sw-dpkg-row"><dt>' + label + '</dt>' +
                   '<dd>' + display + '</dd></div>';
        }
        function boolRow(label, boolVal) {
            return row(label, boolVal ? 'Yes' : 'No');
        }

        var html = '';
        html += row('Title',               entry.title);
        html += row('Year',                entry.year);
        html += row('Author',              entry.author);
        html += row('Confidence',          entry.confidence);
        html += row('Campaign / Folder',   entry.campaignSeries);
        html += row('Source Path',         entry.scenFilePath);
        if (entry.iniWeaponPatchPath) {
            html += row('Weapon Patch Only (not metadata)', entry.iniWeaponPatchPath);
        }
        html += boolRow('HTML Briefing',        entry.hasHtmlBriefing);
        html += boolRow('Document Briefing',    entry.hasDocumentBriefing);
        if (entry.hasLua) {
            html += boolRow('Lua Execution Blocked', entry.luaExecutionBlocked);
        }
        html += row('Import Status',            entry.importStatus);
        html += boolRow('Human Review Required',entry.requiresHumanReview);
        html += boolRow('INI as Metadata',      entry.iniTreatedAsMetadata);
        html += boolRow('Binary Parsed',        entry.scenBinaryParsed);

        bodyEl.innerHTML = html;

        // PR-284: cascade — refresh source trace panel when preview entry changes.
        if (typeof paintExternalScenarioSourceTrace === 'function') {
            paintExternalScenarioSourceTrace(entry);
        }
    }

    // setExternalScenarioPreviewEntry — stores entry + paints panel.
    // Returns { accepted:true } on success or { accepted:false, reason:string } on bad input.
    function setExternalScenarioPreviewEntry(entry) {
        if (!entry || typeof entry !== 'object' ||
                entry.entryType !== 'external_scenario_catalog_entry') {
            _extPreviewEntry = null;
            paintExternalScenarioPreviewEntry(null);
            return { accepted: false,
                     reason: 'entry must be an external_scenario_catalog_entry object' };
        }
        _extPreviewEntry = entry;
        paintExternalScenarioPreviewEntry(entry);
        return { accepted: true };
    }

    // ── PR-282: External Scenario Catalog Selector ──────────────────────
    // Compact read-only selector that binds a capped PR-280C catalog subset
    // to the #sw-ext-select-section in app.html and wires a change event so the
    // operator can pick one scenario which then appears in the PR-281 preview panel.
    //
    // SAFETY: No import. No apply. No run. No execute. No commit. No confirm.
    //         No approve. No go-live. No .scen parsing. No .ini metadata usage.
    //         No Lua execution. No W3 adapter. No W3 workflow state mutation.
    //         No map/Leaflet/fitBounds. No localStorage/sessionStorage/IndexedDB.
    //         No fetch/backend/AI/simulation/journal. No Gate 7.
    //         All flags remain: luaExecutionBlocked:true, scenBinaryParsed:false,
    //         iniTreatedAsMetadata:false, conversionReady:false, requiresHumanReview:true.

    // setExternalScenarioCatalogSubset(catalog)
    // Accepts a PR-280C catalog object and stores a deep copy in module-private state.
    // catalog must have:
    //   catalogType === 'external_scenario_catalog_subset'
    //   readOnly / dryRunOnly / catalogOnly / previewOnly all true
    //   liveMutationAllowed / backendCommitAllowed both false
    //   entries Array with length <= 25
    function setExternalScenarioCatalogSubset(catalog) {
        var blockedReasons = [];
        if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
            blockedReasons.push('catalog must be a non-null object');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.catalogType !== 'external_scenario_catalog_subset') {
            blockedReasons.push('catalogType must be external_scenario_catalog_subset');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.readOnly !== true) {
            blockedReasons.push('readOnly must be true');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.dryRunOnly !== true) {
            blockedReasons.push('dryRunOnly must be true');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.catalogOnly !== true) {
            blockedReasons.push('catalogOnly must be true');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.previewOnly !== true) {
            blockedReasons.push('previewOnly must be true');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.liveMutationAllowed !== false) {
            blockedReasons.push('liveMutationAllowed must be false');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.backendCommitAllowed !== false) {
            blockedReasons.push('backendCommitAllowed must be false');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (!Array.isArray(catalog.entries)) {
            blockedReasons.push('catalog.entries must be an Array');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        if (catalog.entries.length > 25) {
            blockedReasons.push('catalog.entries.length must not exceed 25 (received ' + catalog.entries.length + ')');
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        // Deep copy — do not hold a reference to the caller's object
        try {
            _externalScenarioCatalogSubset = JSON.parse(JSON.stringify(catalog));
        } catch (e) {
            blockedReasons.push('catalog could not be deep-copied: ' + e.message);
            return { passed: false, catalog: null, blockedReasons: blockedReasons, warnings: [] };
        }
        return { passed: true, catalog: _externalScenarioCatalogSubset, blockedReasons: [], warnings: [] };
    }

    // getExternalScenarioCatalogSubset()
    // Returns a copy of the stored catalog, or null.
    function getExternalScenarioCatalogSubset() {
        if (!_externalScenarioCatalogSubset) return null;
        try {
            return JSON.parse(JSON.stringify(_externalScenarioCatalogSubset));
        } catch (e) {
            return null;
        }
    }

    // clearExternalScenarioCatalogSubset()
    // Clears stored catalog. Does not touch the selector DOM (call paint separately if needed).
    function clearExternalScenarioCatalogSubset() {
        _externalScenarioCatalogSubset = null;
        return { passed: true, cleared: true };
    }

    // paintExternalScenarioCatalogSelector(catalogOrNull)
    // Populates #sw-ext-select-control from catalog.entries (max 25).
    // Null / missing entries → disable select, show empty message.
    // Never renders more than 25 options. Never renders all 630.
    // No buttons. No import path. No mutation.
    function paintExternalScenarioCatalogSelector(catalogOrNull) {
        var selectEl = document.getElementById('sw-ext-select-control');
        var countEl  = document.getElementById('sw-ext-select-count');
        if (!selectEl) return;

        var catalog = (catalogOrNull && typeof catalogOrNull === 'object' &&
                       catalogOrNull.catalogType === 'external_scenario_catalog_subset' &&
                       Array.isArray(catalogOrNull.entries) &&
                       catalogOrNull.entries.length > 0) ? catalogOrNull : null;

        if (!catalog) {
            selectEl.disabled = true;
            // Clear options and add a single placeholder
            selectEl.innerHTML = '';
            var emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = 'No external scenarios available.';
            selectEl.appendChild(emptyOpt);
            if (countEl) countEl.textContent = 'No external scenarios available.';
            return;
        }

        // Populate options — hard cap at 25
        var entries = catalog.entries;
        var safeLen = Math.min(entries.length, 25);
        selectEl.innerHTML = '';

        // Blank first option as prompt
        var promptOpt = document.createElement('option');
        promptOpt.value = '';
        promptOpt.textContent = 'Select scenario';
        selectEl.appendChild(promptOpt);

        for (var i = 0; i < safeLen; i++) {
            var e = entries[i];
            if (!e || typeof e !== 'object') continue;
            var opt = document.createElement('option');
            opt.value = e.scenarioId || '';
            // Compact label: "TITLE — YEAR — AUTHOR"
            var labelParts = [];
            if (e.title)  labelParts.push(e.title);
            if (e.year)   labelParts.push(String(e.year));
            if (e.author) labelParts.push(e.author);
            opt.textContent = labelParts.join(' — ');  // em-dash
            selectEl.appendChild(opt);
        }

        selectEl.disabled = false;

        // Status / count line: "Showing X of Y matched scenarios"
        if (countEl) {
            var returnedCount = typeof catalog.returnedCount === 'number' ? catalog.returnedCount : safeLen;
            var totalMatched  = typeof catalog.totalMatchedScenarios === 'number' ? catalog.totalMatchedScenarios : safeLen;
            countEl.textContent = 'Showing ' + returnedCount + ' of ' + totalMatched + ' matched scenarios.';
        }
    }

    // _handleExternalScenarioSelectChange()
    // Change handler wired to #sw-ext-select-control.
    // Reads selected scenarioId → finds entry in stored catalog → calls set+paint preview.
    // Does NOT mutate catalog. Does NOT import. Does NOT create live scenario.
    // Does NOT touch W3 state. Does NOT touch map.
    function _handleExternalScenarioSelectChange() {
        var selectEl  = document.getElementById('sw-ext-select-control');
        var countEl   = document.getElementById('sw-ext-select-count');
        if (!selectEl || !_externalScenarioCatalogSubset) return;

        var selectedId = selectEl.value;
        if (!selectedId) {
            // Blank option selected — clear preview
            paintExternalScenarioPreviewEntry(null);
            if (countEl) {
                var returnedCount = typeof _externalScenarioCatalogSubset.returnedCount === 'number'
                    ? _externalScenarioCatalogSubset.returnedCount
                    : (_externalScenarioCatalogSubset.entries ? _externalScenarioCatalogSubset.entries.length : 0);
                var totalMatched  = typeof _externalScenarioCatalogSubset.totalMatchedScenarios === 'number'
                    ? _externalScenarioCatalogSubset.totalMatchedScenarios : returnedCount;
                countEl.textContent = 'Showing ' + returnedCount + ' of ' + totalMatched + ' matched scenarios.';
            }
            return;
        }

        // Find the matching entry
        var entries = _externalScenarioCatalogSubset.entries || [];
        var found = null;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i] && entries[i].scenarioId === selectedId) {
                found = entries[i];
                break;
            }
        }

        if (!found) {
            // Unknown scenarioId — ignore safely
            if (countEl) countEl.textContent = 'Scenario not found in current subset.';
            return;
        }

        // Set and paint the preview — both calls are idempotent and read-only
        setExternalScenarioPreviewEntry(found);
        paintExternalScenarioPreviewEntry(found);

        if (countEl) countEl.textContent = 'Scenario selected for preview.';
    }

    // initExternalScenarioCatalogSelector()
    // Wires the change listener to #sw-ext-select-control once.
    // Called from init(). Does not load manifest. Does not fetch. Does not auto-populate.
    function initExternalScenarioCatalogSelector() {
        var selectEl = document.getElementById('sw-ext-select-control');
        if (!selectEl) return;
        selectEl.addEventListener('change', _handleExternalScenarioSelectChange);
    }

    // previewExternalScenarioCatalogSubsetFromManifest(sourceManifest, options)
    // Builds a capped PR-280C catalog from the PR-280A manifest, stores it, paints the selector.
    // Default options: { limit:10, avoidLua:true, sortBy:'scenarioId', sortDirection:'asc' }.
    // Does NOT auto-preview the first entry unless options.autoPreviewFirst === true.
    // Must not render all 630. Must not use storage/fetch/backend.
    // Returns { passed, catalog, selectedEntry, blockedReasons, warnings }.
    function previewExternalScenarioCatalogSubsetFromManifest(sourceManifest, options) {
        var opts = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
        var blockedReasons = [], warnings = [];

        // Default filter options
        var buildOpts = {
            limit:         (typeof opts.limit === 'number')    ? opts.limit    : 10,
            avoidLua:      (opts.avoidLua !== false),
            sortBy:        opts.sortBy        || 'scenarioId',
            sortDirection: opts.sortDirection || 'asc'
        };
        // Pass through any additional filter options
        if (opts.offset        !== undefined) buildOpts.offset        = opts.offset;
        if (opts.campaignSeries !== undefined) buildOpts.campaignSeries = opts.campaignSeries;
        if (opts.confidence    !== undefined) buildOpts.confidence    = opts.confidence;
        if (opts.requireXlsxMatch !== undefined) buildOpts.requireXlsxMatch = opts.requireXlsxMatch;
        if (opts.includeLuaBlocked !== undefined) buildOpts.includeLuaBlocked = opts.includeLuaBlocked;
        if (opts.requireHtmlBriefing !== undefined) buildOpts.requireHtmlBriefing = opts.requireHtmlBriefing;
        if (opts.requireDocumentBriefing !== undefined) buildOpts.requireDocumentBriefing = opts.requireDocumentBriefing;
        if (opts.titleSearch   !== undefined) buildOpts.titleSearch   = opts.titleSearch;

        // Build subset catalog using PR-280C (cap enforced there)
        var buildResult = buildExternalScenarioCatalogFromManifest(sourceManifest, buildOpts);
        if (!buildResult.passed) {
            return { passed: false, catalog: null, selectedEntry: null,
                     blockedReasons: buildResult.blockedReasons, warnings: buildResult.warnings };
        }

        var catalog = buildResult.catalog;
        // Propagate any PR-280C warnings
        if (buildResult.warnings && buildResult.warnings.length) {
            for (var w = 0; w < buildResult.warnings.length; w++) {
                warnings.push(buildResult.warnings[w]);
            }
        }

        // Store + paint selector
        var setResult = setExternalScenarioCatalogSubset(catalog);
        if (!setResult.passed) {
            return { passed: false, catalog: null, selectedEntry: null,
                     blockedReasons: setResult.blockedReasons, warnings: warnings };
        }
        paintExternalScenarioCatalogSelector(catalog);

        // Auto-preview first entry if requested
        var selectedEntry = null;
        if (opts.autoPreviewFirst === true && catalog.entries && catalog.entries.length > 0) {
            selectedEntry = catalog.entries[0];
            setExternalScenarioPreviewEntry(selectedEntry);
            paintExternalScenarioPreviewEntry(selectedEntry);
            // Sync the select control to the first option
            var selectEl = document.getElementById('sw-ext-select-control');
            if (selectEl && selectEl.options.length > 1) {
                selectEl.selectedIndex = 1;  // index 0 is the blank prompt
            }
            // Update count line
            var countEl = document.getElementById('sw-ext-select-count');
            if (countEl) countEl.textContent = 'Scenario selected for preview.';
        }

        return { passed: true, catalog: catalog, selectedEntry: selectedEntry,
                 blockedReasons: [], warnings: warnings };
    }

    // ── PR-284: External Scenario Source Trace Inspector ────────────────────
    // buildExternalScenarioSourceTrace(entry)
    // Validates a catalog entry and builds a read-only source trace object.
    // Returns { passed, trace, blockedReasons, warnings }.
    // Warnings do NOT block passed:true.
    // Safety: no fetch, no XHR, no localStorage, no Gate 7, no mutation.
    function buildExternalScenarioSourceTrace(entry) {
        var blockedReasons = [];
        var warnings = [];

        // Null / type guard
        if (!entry || typeof entry !== 'object') {
            blockedReasons.push('ENTRY_NULL_OR_INVALID');
            return { passed: false, trace: null, blockedReasons: blockedReasons, warnings: warnings };
        }
        if (entry.entryType !== 'external_scenario_catalog_entry') {
            blockedReasons.push('WRONG_ENTRY_TYPE');
            return { passed: false, trace: null, blockedReasons: blockedReasons, warnings: warnings };
        }

        // Safety flag checks — any deviation means this entry slipped past a gate
        if (entry.readOnly !== true) {
            blockedReasons.push('READ_ONLY_NOT_SET');
        }
        if (entry.liveMutationAllowed === true) {
            blockedReasons.push('LIVE_MUTATION_NOT_BLOCKED');
        }
        if (entry.backendCommitAllowed === true) {
            blockedReasons.push('BACKEND_COMMIT_NOT_BLOCKED');
        }
        if (entry.scenBinaryParsed === true) {
            blockedReasons.push('SCEN_BINARY_PARSED');
        }
        if (entry.iniTreatedAsMetadata === true) {
            blockedReasons.push('INI_TREATED_AS_METADATA');
        }
        if (entry.luaExecutionBlocked === false) {
            blockedReasons.push('LUA_EXECUTION_NOT_BLOCKED');
        }
        if (entry.conversionReady === true) {
            blockedReasons.push('CONVERSION_READY_UNEXPECTEDLY_SET');
        }
        if (entry.requiresHumanReview === false) {
            blockedReasons.push('HUMAN_REVIEW_BYPASSED');
        }

        if (blockedReasons.length > 0) {
            return { passed: false, trace: null, blockedReasons: blockedReasons, warnings: warnings };
        }

        // Build source-trace fields from entry
        var st = entry.sourceTrace || {};

        // Warnings (do NOT block passed:true)
        if (entry.confidence !== 'high') {
            warnings.push('LOW_CONFIDENCE');
        }
        if (st.titleFrom === 'filename') {
            warnings.push('TITLE_FROM_FILENAME_ONLY');
        }
        if (!entry.author || entry.author === 'Unknown') {
            warnings.push('AUTHOR_MISSING');
        }
        if (entry.hasLua === true) {
            warnings.push('LUA_PRESENT_BLOCKED');
        }
        if (entry.hasHtmlBriefing !== true && entry.hasDocBriefing !== true) {
            warnings.push('NO_READABLE_BRIEFING_REFERENCE');
        }

        var trace = {
            traceType:            'external_scenario_source_trace',
            source:               'external_scenario_catalog_entry',
            readOnly:             true,
            catalogOnly:          true,
            previewOnly:          true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,
            scenarioId:           entry.scenarioId || '',
            title:                entry.title      || '',
            confidence:           entry.confidence || 'unknown',
            sourceTrace: {
                titleFrom:        st.titleFrom        || 'unknown',
                yearFrom:         st.yearFrom         || 'unknown',
                authorFrom:       st.authorFrom       || 'unknown',
                notesFrom:        st.notesFrom        || 'none',
                relationshipFrom: st.relationshipFrom || 'none'
            },
            policies: {
                scenBinaryParsed:     false,
                iniTreatedAsMetadata: false,
                iniPurpose:           'weapon_patch_only',
                luaExecuted:          false,
                luaExecutionBlocked:  true,
                conversionReady:      false,
                requiresHumanReview:  true
            },
            readiness: {
                importStatus:        entry.importStatus || 'catalog_entry_only',
                catalogEntryOnly:    true,
                metadataPreviewReady: true,
                conversionReady:     false,
                liveApplyReady:      false,
                humanReviewRequired: true
            },
            references: {
                path:                  entry.path                  || '',
                iniWeaponPatchPath:    entry.iniWeaponPatchPath    || null,
                htmlBriefingPaths:     entry.htmlBriefingPaths     || [],
                documentBriefingPaths: entry.documentBriefingPaths || [],
                luaScriptPaths:        entry.luaScriptPaths        || []
            },
            warningCodes: warnings.slice()
        };

        return { passed: true, trace: trace, blockedReasons: [], warnings: warnings };
    }

    // paintExternalScenarioSourceTrace(entryOrNull)
    // Renders the source trace for entryOrNull into #sw-ext-trace-body,
    // or shows the empty state when null / build failed.
    // No fetch, no XHR, no localStorage, no Gate 7, no mutation.
    function paintExternalScenarioSourceTrace(entryOrNull) {
        var bodyEl  = document.getElementById('sw-ext-trace-body');
        var emptyEl = document.getElementById('sw-ext-trace-empty');

        if (!bodyEl || !emptyEl) { return; }   // section not in DOM yet

        if (!entryOrNull) {
            bodyEl.setAttribute('hidden', '');
            emptyEl.removeAttribute('hidden');
            return;
        }

        var result = buildExternalScenarioSourceTrace(entryOrNull);
        if (!result.passed) {
            bodyEl.setAttribute('hidden', '');
            emptyEl.removeAttribute('hidden');
            return;
        }

        var t   = result.trace;
        var st  = t.sourceTrace;
        var po  = t.policies;
        var re  = t.readiness;

        function _setText(id, val) {
            var el = document.getElementById(id);
            if (el) { el.textContent = val; }
        }

        // Confidence — also set data-attribute for CSS colouring
        var confEl = document.getElementById('sw-ext-trace-confidence');
        if (confEl) {
            confEl.textContent = t.confidence;
            confEl.setAttribute('data-confidence', t.confidence);
        }

        // Source-trace fields
        _setText('sw-ext-trace-title-from',        st.titleFrom);
        _setText('sw-ext-trace-year-from',         st.yearFrom);
        _setText('sw-ext-trace-author-from',       st.authorFrom);
        _setText('sw-ext-trace-notes-from',        st.notesFrom);
        _setText('sw-ext-trace-relationship-from', st.relationshipFrom);

        // Policy fields
        _setText('sw-ext-trace-ini-policy',    po.iniPurpose);
        _setText('sw-ext-trace-lua-policy',    po.luaExecutionBlocked ? 'blocked' : 'allowed');
        _setText('sw-ext-trace-binary-policy', po.scenBinaryParsed    ? 'parsed'  : 'not_parsed');

        // Human review / readiness
        _setText('sw-ext-trace-human-review', re.humanReviewRequired ? 'required' : 'not_required');
        _setText('sw-ext-trace-readiness',    re.importStatus);

        // Warnings
        _setText('sw-ext-trace-warnings',
                 t.warningCodes.length > 0 ? t.warningCodes.join(', ') : 'none');

        // Show body, hide empty
        bodyEl.removeAttribute('hidden');
        emptyEl.setAttribute('hidden', '');
    }

    // ── PR-287L2: Live Scenario Header ──────────────────────────────────
    // Reads window.RmoozScenario only (via existing getScenario / getActiveStepIndex).
    // Paints a compact header strip at the top of #sw-live-workspace that names the
    // scenario, its id, the active step counter, the phase, and the load source.
    // No backend. No mutation. No storage. No Gate 7. Safely no-ops if DOM missing.
    function paintLiveScenarioHeader() {
        var titleEl  = document.getElementById('sw-live-scenario-title');
        var idEl     = document.getElementById('sw-live-scenario-id');
        var stepEl   = document.getElementById('sw-live-scenario-step');
        var phaseEl  = document.getElementById('sw-live-scenario-phase');
        var srcEl    = document.getElementById('sw-live-scenario-source');
        // If header DOM is not present (older app version), no-op silently.
        if (!titleEl && !idEl && !stepEl && !phaseEl && !srcEl) return;

        var sc   = getScenario();
        var idx  = getActiveStepIndex();
        var step = getActiveStep();

        // Title: scenario_label / title / name / scenario_id / fallback
        var title;
        if (sc) {
            title = sc.scenario_label || sc.title || sc.name || sc.scenario_id ||
                    tx('sw-live-scenario-active-fallback', 'Active live scenario');
        } else {
            title = tx('sw-live-scenario-active-fallback', 'Active live scenario');
        }
        if (titleEl) { titleEl.textContent = title; }

        // ID
        var sid = sc ? (sc.scenario_id || sc.id ||
                        tx('sw-live-scenario-id-unknown', 'unknown')) :
                       tx('sw-live-scenario-id-unknown', 'unknown');
        if (idEl) { idEl.textContent = String(sid); }

        // Step counter: "Step N of T"
        if (stepEl) {
            if (sc && Array.isArray(sc.steps) && sc.steps.length > 0) {
                stepEl.textContent =
                    tx('sw-live-decision-step-prefix', 'Step') + ' ' +
                    (idx + 1) + ' ' +
                    tx('sw-live-decision-of', 'of') + ' ' +
                    sc.steps.length;
            } else {
                stepEl.textContent = '—';
            }
        }

        // Phase: step.phase || step.time_label || step.title || dash
        if (phaseEl) {
            var phase = step ? (step.phase || step.time_label || step.title ||
                                 step.kind_native) : null;
            phaseEl.textContent = phase ? String(phase) : '—';
        }

        // Source / model
        if (srcEl) {
            var src = sc ? (sc.model_version || sc.ported_from ||
                            sc.schema_variant ||
                            tx('sw-live-scenario-source-fallback', 'Live workspace')) :
                           tx('sw-live-scenario-source-fallback', 'Live workspace');
            srcEl.textContent = String(src);
        }

        // PR-287L2: Live map overlay status (reflects _swOverlayEnabled closure variable).
        // No mutation of overlay state; this is read-only display.
        var mapEl = document.getElementById('sw-live-map-status');
        if (mapEl) {
            var hasMap = !!(typeof window !== 'undefined' && window.map && window.L);
            var enabled = (typeof _swOverlayEnabled !== 'undefined') && _swOverlayEnabled === true;
            var stateAttr;
            var stateText;
            if (!sc || !hasMap) {
                stateAttr = 'unavailable';
                stateText = tx('sw-live-overlay-available', 'Overlay available');
            } else if (enabled) {
                stateAttr = 'on';
                stateText = tx('sw-live-overlay-on', 'Overlay on');
            } else {
                stateAttr = 'off';
                stateText = tx('sw-live-overlay-off', 'Overlay off');
            }
            mapEl.setAttribute('data-state', stateAttr);
            mapEl.textContent = stateText;
        }

        // PR-287L: active live step status in the header meta strip.
        var statusEl = document.getElementById('sw-live-scenario-status');
        if (statusEl && typeof getLiveStepStatus === 'function') {
            if (sc && step) {
                var hSt = getLiveStepStatus(idx).status;
                statusEl.setAttribute('data-status', hSt);
                statusEl.textContent = (typeof _liveStepStatusLabel === 'function')
                    ? _liveStepStatusLabel(hSt) : hSt;
            } else {
                statusEl.setAttribute('data-status', 'pending');
                statusEl.textContent = '—';
            }
        }
    }

    // ── PR-287L2: Secondary cards toggle ────────────────────────────────
    // PR-287C: Wires #sw-legacy-summary-toggle to show/hide #sw-legacy-summary-body.
    // Idempotent. No data mutation. No storage. No backend.
    var _legacySummaryToggleWired = false;
    function initLegacySummaryToggle() {
        if (_legacySummaryToggleWired) return;
        var btn  = document.getElementById('sw-legacy-summary-toggle');
        var body = document.getElementById('sw-legacy-summary-body');
        if (!btn || !body) return;
        _legacySummaryToggleWired = true;
        btn.addEventListener('click', function() {
            var isHidden = body.hasAttribute('hidden');
            if (isHidden) {
                body.removeAttribute('hidden');
                btn.setAttribute('aria-expanded', 'true');
                btn.textContent = tx('sw-legacy-summary-toggle-hide',
                                     'Hide legacy summary');
            } else {
                body.setAttribute('hidden', '');
                btn.setAttribute('aria-expanded', 'false');
                btn.textContent = tx('sw-legacy-summary-toggle-show',
                                     'Show legacy summary');
            }
        });
    }

    // Wires #sw-secondary-cards-toggle to show/hide #sw-secondary-cards-body.
    // Idempotent. No data mutation. No storage. No backend.
    var _secondaryToggleWired = false;
    function initSecondaryCardsToggle() {
        if (_secondaryToggleWired) return;
        var btn  = document.getElementById('sw-secondary-cards-toggle');
        var body = document.getElementById('sw-secondary-cards-body');
        if (!btn || !body) return;
        _secondaryToggleWired = true;
        btn.addEventListener('click', function() {
            var isHidden = body.hasAttribute('hidden');
            if (isHidden) {
                body.removeAttribute('hidden');
                btn.setAttribute('aria-expanded', 'true');
                btn.textContent = tx('sw-secondary-cards-toggle-hide',
                                     'Hide secondary tools');
            } else {
                body.setAttribute('hidden', '');
                btn.setAttribute('aria-expanded', 'false');
                btn.textContent = tx('sw-secondary-cards-toggle-show',
                                     'Show secondary tools');
            }
        });
    }

    // ── PR-286L0: Live Scenario Import Baseline ─────────────────────────
    // Validates a JSON object and (if valid) replaces window.RmoozScenario
    // with the normalized scenario. FileReader-only. No fetch / no upload /
    // no backend / no /api/sim/commit / no Gate 7 / no apply/execute/commit.
    // No .scen / .ini parsing. No Lua execution. No decision-package reuse.

    // Unsafe fields rejected ANYWHERE in the imported scenario.
    var _LIVE_IMPORT_UNSAFE_KEYS = [
        'scenario_compressed', 'Scenario_Compressed',
        'compressed', 'compressedPayload',
        'lua', 'script', 'scripts',
        'execute', 'executeNow', 'applyNow', 'commitNow',
        'gate7Approved',
        'backendUrl', 'fetchUrl', 'apiUrl', 'urlToFetch',
        'storageKey', 'localStorage', 'sessionStorage', 'indexedDB'
    ];

    function validateLiveScenarioJson(json) {
        var warnings       = [];
        var blockedReasons = [];

        if (json === null || json === undefined) {
            blockedReasons.push('INPUT_NULL');
            return { passed: false, normalizedScenario: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        if (typeof json !== 'object' || Array.isArray(json)) {
            blockedReasons.push('INPUT_NOT_OBJECT');
            return { passed: false, normalizedScenario: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        function _checkUnsafe(obj, path) {
            if (!obj || typeof obj !== 'object') return;
            for (var i = 0; i < _LIVE_IMPORT_UNSAFE_KEYS.length; i++) {
                var k = _LIVE_IMPORT_UNSAFE_KEYS[i];
                if (Object.prototype.hasOwnProperty.call(obj, k)) {
                    blockedReasons.push('UNSAFE_FIELD:' + k + '@' + path);
                }
            }
            if (obj.liveMutationAllowed === true) {
                blockedReasons.push('LIVE_MUTATION_ALLOWED@' + path);
            }
            if (obj.backendCommitAllowed === true) {
                blockedReasons.push('BACKEND_COMMIT_ALLOWED@' + path);
            }
        }

        _checkUnsafe(json, 'root');
        if (Array.isArray(json.steps)) {
            for (var si = 0; si < json.steps.length; si++) {
                _checkUnsafe(json.steps[si], 'steps[' + si + ']');
            }
        }
        if (blockedReasons.length > 0) {
            return { passed: false, normalizedScenario: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        if (!Array.isArray(json.steps) || json.steps.length === 0) {
            blockedReasons.push('STEPS_MISSING_OR_EMPTY');
            return { passed: false, normalizedScenario: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        var STEP_RECOGNIZED = [
            'id', 'step_id', 'title', 'phase', 'time_label',
            'narrative', 'narrative_en', 'narrative_ar',
            'situation', 'decision_point_baseline', 'objective_status_baseline',
            'actors', 'affected'
        ];
        var stepsWithoutTitleOrPhase = 0;
        var stepsWithOptions          = 0;

        for (var sj = 0; sj < json.steps.length; sj++) {
            var step = json.steps[sj];
            if (!step || typeof step !== 'object' || Array.isArray(step)) {
                blockedReasons.push('STEP_NOT_OBJECT:' + sj);
                return { passed: false, normalizedScenario: null,
                         blockedReasons: blockedReasons, warnings: warnings };
            }
            var hasAny = false;
            for (var fi = 0; fi < STEP_RECOGNIZED.length; fi++) {
                var rf = STEP_RECOGNIZED[fi];
                var rv = step[rf];
                if (rv !== undefined && rv !== null && rv !== '') {
                    hasAny = true; break;
                }
            }
            if (!hasAny) {
                blockedReasons.push('STEP_NO_RECOGNIZED_FIELDS:' + sj);
                return { passed: false, normalizedScenario: null,
                         blockedReasons: blockedReasons, warnings: warnings };
            }
            if (!step.title && !step.phase) { stepsWithoutTitleOrPhase++; }
            if (Array.isArray(step.decision_options)  ||
                Array.isArray(step.decisionOptions)   ||
                Array.isArray(step.options)           ||
                Array.isArray(step.coa_options)       ||
                Array.isArray(step.coaOptions)) {
                stepsWithOptions++;
            }
        }

        // Deep-copy so post-load mutations of the original do NOT leak through.
        var copy;
        try { copy = JSON.parse(JSON.stringify(json)); }
        catch (e) {
            blockedReasons.push('DEEP_COPY_FAILED');
            return { passed: false, normalizedScenario: null,
                     blockedReasons: blockedReasons, warnings: warnings };
        }

        // Normalize scenario_id
        var originalSid = copy.scenario_id;
        if (!copy.scenario_id) {
            copy.scenario_id = copy.id || copy.name || 'imported-live-scenario';
            if (!copy.id && !copy.name) {
                warnings.push('SCENARIO_ID_FALLBACK_USED');
            }
        }
        // Normalize scenario_label
        if (!copy.scenario_label) {
            copy.scenario_label = copy.title || copy.name || copy.scenario_id;
        }

        // Coordinate-table warning
        if (!copy.blue_unit_step_coords && !copy.red_unit_step_coords) {
            warnings.push('NO_COORDINATE_TABLES');
        }
        // Decision options warning
        if (stepsWithOptions === 0) {
            warnings.push('NO_DECISION_OPTIONS_IN_ANY_STEP');
        }
        // Step labelling warning
        if (stepsWithoutTitleOrPhase === copy.steps.length) {
            warnings.push('STEPS_LACK_TITLES_AND_PHASES');
        }

        return { passed: true, normalizedScenario: copy,
                 blockedReasons: [], warnings: warnings };
    }

    // PR-288M: bridge the live scenario-load path to the existing adjudicator
    // map. READ-ONLY wiring — delegates entirely to the already-shipped
    // window.AppAdjudicatorMap.drawScenario() (wargame/adjudicator-map.js),
    // which clears-then-redraws BLS / AO / unit markers from scenario data.
    // This helper invents no geometry, duplicates no drawing logic, and mutates
    // no scenario / unit / line data — it only decides whether it is SAFE to
    // call drawScenario and reports the outcome. options is reserved for future
    // callers and intentionally unused for now.
    // Returns { painted:boolean, reason:string, warnings:string[] }.
    function maybeDrawLiveScenarioOnMap(scenario, options) {
        options = options || {};
        var result = { painted: false, reason: '', warnings: [] };

        if (!scenario || typeof scenario !== 'object') {
            result.reason = 'no-scenario';
            return result;
        }
        if (typeof window === 'undefined' || !window.AppAdjudicatorMap) {
            result.reason = 'map-api-unavailable';
            return result;
        }
        var api = window.AppAdjudicatorMap;
        if (typeof api.drawScenario !== 'function') {
            result.reason = 'draw-unavailable';
            return result;
        }

        // BLS markers are the headline payload for this PR; note (don't block)
        // when a scenario carries none so a sparse map is explained.
        if (!Array.isArray(scenario.bls_template) || scenario.bls_template.length === 0) {
            result.warnings.push('no-bls-template');
        }

        var drew;
        try {
            drew = api.drawScenario(scenario);
        } catch (err) {
            result.reason = 'draw-threw';
            result.warnings.push(String((err && err.message) || err));
            return result;
        }

        // drawScenario() returns false when the Leaflet map isn't ready
        // (operator not on the map view yet). Expected, non-error state.
        if (drew === false) {
            result.reason = 'map-not-ready';
            return result;
        }

        // Confirm via the map's own predicate when available.
        if (typeof api.isScenarioDrawn === 'function' && !api.isScenarioDrawn()) {
            result.reason = 'draw-unconfirmed';
            result.warnings.push('isScenarioDrawn-false-after-draw');
            return result;
        }

        result.painted = true;
        result.reason = 'painted';
        return result;
    }

    function loadLiveScenarioFromJson(json, options) {
        options = options || {};
        var v = validateLiveScenarioJson(json);
        if (!v.passed || !v.normalizedScenario) {
            return {
                passed:         false,
                scenarioId:     null,
                scenarioLabel:  null,
                stepCount:      0,
                blockedReasons: v.blockedReasons,
                warnings:       v.warnings
            };
        }
        var s = v.normalizedScenario;

        // Reset live operator workflow selections — they belong to the old scenario.
        // Events are kept as the audit trail; selections + step status are scenario-scoped.
        if (typeof _liveOperatorWorkflowState !== 'undefined' &&
            _liveOperatorWorkflowState && _liveOperatorWorkflowState.selections) {
            _liveOperatorWorkflowState.selections = {};
            _liveOperatorWorkflowState.stepStatus = {};   // PR-287L: status is scenario-scoped
        }

        // Replace window.RmoozScenario. ONLY two fields written: scenario + stepIndex.
        window.RmoozScenario = { scenario: s, stepIndex: 0 };

        // P2 (Wargame3 live): mirror the loaded scenario's OOB into the ORBAT dock
        // (read-only scenario ORBAT — no server, no mutation). Safe no-op when the
        // dock isn't present/bound yet.
        try {
            if (window.AppUnitsOrbatDock && typeof window.AppUnitsOrbatDock.refresh === 'function') {
                window.AppUnitsOrbatDock.refresh();
            }
        } catch (_) { /* no-op */ }

        // P3 (Wargame3 live): present a clean, map-forward demo view — collapse the
        // side tool panels (all re-openable via their existing controls) and re-frame
        // the AO once the panel-collapse transition settles. View state only: no
        // scenario/unit/ORBAT mutation, no server, no storage.
        try {
            if (window.AppMapHidePanels && typeof window.AppMapHidePanels.hideAll === 'function') {
                window.AppMapHidePanels.hideAll();
            }
            setTimeout(function () {
                try {
                    if (window.map && typeof window.map.invalidateSize === 'function') window.map.invalidateSize();
                    if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.fitScenarioAO === 'function') {
                        window.AppAdjudicatorMap.fitScenarioAO();
                    }
                } catch (_) { /* no-op */ }
            }, 360);
        } catch (_) { /* no-op */ }

        // Repaint live workspace via the existing full refresh path.
        // refresh() never calls paintDryRunPreview, never paints AMBER, never touches
        // any preview/dry-run state — verified by PR-287L0.
        if (window.AppShellScenarioWorkspace &&
            typeof window.AppShellScenarioWorkspace.refresh === 'function') {
            try { window.AppShellScenarioWorkspace.refresh(); }
            catch (_) { /* no-op */ }
        } else {
            // Fallback for sandboxed contexts where refresh isn't bound yet.
            if (typeof paintLiveScenarioHeader      === 'function') paintLiveScenarioHeader();
            if (typeof paintStepNavigator           === 'function') paintStepNavigator();
            if (typeof paintLiveDecisionActionCard  === 'function') paintLiveDecisionActionCard();
            if (typeof paintScenarioOverview        === 'function') paintScenarioOverview();
            if (typeof paintScenarioOverlay         === 'function') paintScenarioOverlay();
        }

        // PR-288M: also draw the freshly-loaded scenario on the adjudicator map
        // (BLS / AO / unit markers) through the existing map subsystem. Guarded
        // + safe: a no-op when the map isn't present or not ready, and never
        // throws back into the load path. Outcome surfaced on result.mapDraw.
        var mapDraw = maybeDrawLiveScenarioOnMap(s, options);

        return {
            passed:         true,
            scenarioId:     s.scenario_id || null,
            scenarioLabel:  s.scenario_label || null,
            stepCount:      Array.isArray(s.steps) ? s.steps.length : 0,
            blockedReasons: [],
            warnings:       v.warnings,
            mapDraw:        mapDraw
        };
    }

    function getCurrentLiveScenarioSummary() {
        var sc  = getScenario();
        var idx = getActiveStepIndex();
        if (!sc) {
            return {
                scenarioId:      null,
                scenarioLabel:   null,
                stepIndex:       null,
                stepCount:       0,
                activeStepId:    null,
                activeStepPhase: null
            };
        }
        var step = (Array.isArray(sc.steps) && sc.steps[idx]) ? sc.steps[idx] : null;
        var sid = null, sph = null;
        if (step) {
            sid = step.id || step.step_id || step.stepId || step.phase ||
                  (typeof step.index === 'number' ? 'step-' + step.index : null);
            sph = step.phase || step.time_label || step.title || null;
        }
        return {
            scenarioId:      sc.scenario_id || sc.id || sc.name || null,
            scenarioLabel:   sc.scenario_label || sc.title || sc.name || null,
            stepIndex:       idx,
            stepCount:       Array.isArray(sc.steps) ? sc.steps.length : 0,
            activeStepId:    sid !== null ? String(sid) : null,
            activeStepPhase: sph !== null ? String(sph) : null
        };
    }

    var _liveImportWired = false;
    function initLiveScenarioImport() {
        if (_liveImportWired) return;
        var btn       = document.getElementById('sw-live-scenario-import-btn');
        var input     = document.getElementById('sw-live-scenario-import-input');
        var statusEl  = document.getElementById('sw-live-scenario-import-status');
        var summaryEl = document.getElementById('sw-live-scenario-import-summary');
        if (!btn || !input) return;
        _liveImportWired = true;

        function _setStatus(msg, level) {
            if (!statusEl) return;
            statusEl.textContent = msg;
            statusEl.setAttribute('data-level', level || 'info');
        }
        function _setSummary(text) {
            if (!summaryEl) return;
            if (text) {
                summaryEl.textContent = text;
                summaryEl.removeAttribute('hidden');
            } else {
                summaryEl.textContent = '';
                summaryEl.setAttribute('hidden', '');
            }
        }
        function _looksLikeStep1OrOperationalJson(json) {
            if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
            if (json.operational_brief && typeof json.operational_brief === 'object') return true;
            if (json.participants || json.enemy_forces || json.friendly_forces) return true;
            if (Array.isArray(json.proposed_units) || Array.isArray(json.placement_candidates) || Array.isArray(json.country_bases)) return true;
            if (Array.isArray(json.countries) && json.countries.some(function (c) {
                return c && typeof c === 'object' && (Array.isArray(c.bases) || Array.isArray(c.air_bases) || Array.isArray(c.naval_bases) || Array.isArray(c.land_bases));
            })) return true;
            return false;
        }

        btn.addEventListener('click', function() {
            var file = input.files && input.files[0];
            if (!file) {
                _setStatus(tx('sw-live-import-no-file', 'No file selected.'), 'warn');
                _setSummary('');
                return;
            }
            // FileReader only — never fetch, never XHR, never upload.
            var reader = new FileReader();
            reader.onload = function(e) {
                var json;
                try { json = JSON.parse(e.target.result); }
                catch (parseErr) {
                    _setStatus(tx('sw-live-import-blocked', 'Import blocked.') +
                               ' · JSON parse error', 'error');
                    _setSummary('');
                    return;
                }
                var result = loadLiveScenarioFromJson(json);
                if (result.passed) {
                    _setStatus(tx('sw-live-import-success', 'Import successful.'), 'ok');
                    var lines = [];
                    lines.push(tx('sw-live-import-scenario-loaded', 'Scenario loaded') +
                               ': ' + (result.scenarioLabel || result.scenarioId || '—'));
                    lines.push(tx('sw-live-import-steps', 'Steps') + ': ' + result.stepCount);
                    if (result.warnings && result.warnings.length) {
                        lines.push(tx('sw-live-import-warnings', 'Warnings') +
                                   ': ' + result.warnings.join(', '));
                    }
                    _setSummary(lines.join(' · '));
                } else {
                    _setStatus(tx('sw-live-import-blocked', 'Import blocked.'), 'error');
                    if (_looksLikeStep1OrOperationalJson(json)) {
                        _setSummary('This loader expects a full RMOOZ scenario with steps[]. Use Review AI Understanding for Step 1 / operational JSON.');
                    } else {
                        _setSummary(result.blockedReasons.join(', '));
                    }
                }
            };
            reader.onerror = function() {
                _setStatus(tx('sw-live-import-blocked', 'Import blocked.') +
                           ' · FileReader error', 'error');
                _setSummary('');
            };
            reader.readAsText(file);
        });
    }

    // ── PR-286L1: Scenario Folder Import Intake ─────────────────────────
    // Scans a local folder for RMOOZ-compatible JSON candidates. Classifies
    // files by name/extension only (NO content read during scan). User selects
    // one JSON candidate, which is then read via FileReader.readAsText and
    // routed through PR-286L0's loadLiveScenarioFromJson(). .scen / .ini /
    // Lua / briefings / assets are detected but NOT importable.

    var _liveScenarioFolderScanState = {
        files:                [],   // raw File objects (production); mock objects (tests)
        candidates:           [],   // JSON candidate metadata only
        selectedRelativePath: null, // operator's chosen JSON candidate
        summary:              null, // last scan summary counts
        _unsupportedView:     []    // mirror of unsupported for paint-only use
    };

    function classifyScenarioFolderFile(file) {
        if (!file || typeof file !== 'object') {
            return {
                fileName:     '',
                relativePath: '',
                extension:    '',
                fileType:     'invalid',
                importable:   false,
                blocked:      false,
                reason:       'Invalid file object'
            };
        }
        var name = String(file.name || '');
        var rel  = String(file.webkitRelativePath || file.name || '');
        var dotIdx = name.lastIndexOf('.');
        var ext = (dotIdx >= 0 && dotIdx < name.length - 1)
                  ? name.slice(dotIdx + 1).toLowerCase()
                  : '';

        var fileType   = 'unsupported_unknown';
        var importable = false;
        var blocked    = false;
        var reason     = 'Unsupported file type';

        switch (ext) {
            case 'json':
                fileType   = 'json';
                importable = true;
                reason     = 'RMOOZ-compatible JSON candidate';
                break;
            case 'scen':
                fileType = 'command_scen_binary';
                reason   = 'Command .scen binary is not directly importable';
                break;
            case 'ini':
                fileType = 'command_ini_weapon_patch';
                reason   = '.ini weapon patch is not scenario metadata';
                break;
            case 'lua':
                fileType = 'lua_script';
                blocked  = true;
                reason   = 'Lua scripts are blocked';
                break;
            case 'pdf':
            case 'docx':
            case 'html':
            case 'htm':
            case 'rtf':
            case 'txt':
                fileType = 'briefing_document';
                reason   = 'Briefing/document source only';
                break;
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'svg':
            case 'webp':
            case 'gif':
                fileType = 'asset';
                reason   = 'Asset file only';
                break;
        }

        return {
            fileName:     name,
            relativePath: rel,
            extension:    ext,
            fileType:     fileType,
            importable:   importable,
            blocked:      blocked,
            reason:       reason
        };
    }

    function scanScenarioFolderFiles(fileList, options) {
        options = options || {};
        var warnings = [];

        if (!fileList || typeof fileList.length !== 'number') {
            return {
                passed:         false,
                summary:        null,
                candidates:     [],
                unsupported:    [],
                blockedReasons: ['FILELIST_INVALID'],
                warnings:       warnings
            };
        }

        var summary = {
            totalFiles:      0,
            jsonCandidates:  0,
            unsupportedScen: 0,
            unsupportedIni:  0,
            blockedLua:      0,
            briefingDocs:    0,
            assets:          0,
            other:           0
        };
        var candidates  = [];
        var unsupported = [];

        for (var i = 0; i < fileList.length; i++) {
            var f = fileList[i];
            var c = classifyScenarioFolderFile(f);
            summary.totalFiles++;

            if (c.fileType === 'json') {
                summary.jsonCandidates++;
                candidates.push({
                    fileName:     c.fileName,
                    relativePath: c.relativePath,
                    extension:    c.extension,
                    fileType:     c.fileType,
                    importable:   true,
                    _fileIndex:   i  // index into _liveScenarioFolderScanState.files
                });
            } else {
                if      (c.fileType === 'command_scen_binary')      summary.unsupportedScen++;
                else if (c.fileType === 'command_ini_weapon_patch') summary.unsupportedIni++;
                else if (c.fileType === 'lua_script')               summary.blockedLua++;
                else if (c.fileType === 'briefing_document')        summary.briefingDocs++;
                else if (c.fileType === 'asset')                    summary.assets++;
                else                                                 summary.other++;

                unsupported.push({
                    fileName:     c.fileName,
                    relativePath: c.relativePath,
                    extension:    c.extension,
                    fileType:     c.fileType,
                    blocked:      c.blocked,
                    reason:       c.reason
                });
            }
        }

        if (candidates.length === 0) {
            warnings.push('NO_JSON_CANDIDATES');
        }
        if (summary.unsupportedScen > 0) {
            warnings.push('SCEN_FILES_DETECTED_BUT_NOT_IMPORTABLE');
        }
        if (summary.unsupportedIni > 0) {
            warnings.push('INI_FILES_ARE_WEAPON_PATCHES_NOT_METADATA');
        }

        return {
            passed:         true,
            summary:        summary,
            candidates:     candidates,
            unsupported:    unsupported,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    function getLiveScenarioFolderScanState() {
        // Deep copy via JSON round-trip (skips raw File objects which are not serialisable).
        return {
            files:                [],  // intentionally omitted — Files are not deep-copyable
            candidates:           JSON.parse(JSON.stringify(
                                      _liveScenarioFolderScanState.candidates || [])),
            selectedRelativePath: _liveScenarioFolderScanState.selectedRelativePath,
            summary:              _liveScenarioFolderScanState.summary
                                  ? JSON.parse(JSON.stringify(_liveScenarioFolderScanState.summary))
                                  : null
        };
    }

    function _resolveFolderCandidate(relativePathOrIndex) {
        var cands = _liveScenarioFolderScanState.candidates || [];
        if (cands.length === 0) {
            return { found: false, blockedReasons: ['NO_CANDIDATES_AVAILABLE'] };
        }
        var idx = -1;
        if (typeof relativePathOrIndex === 'number') {
            if (relativePathOrIndex >= 0 && relativePathOrIndex < cands.length) {
                idx = relativePathOrIndex;
            }
        } else if (typeof relativePathOrIndex === 'string' && relativePathOrIndex) {
            for (var i = 0; i < cands.length; i++) {
                if (cands[i].relativePath === relativePathOrIndex) { idx = i; break; }
            }
        }
        if (idx < 0) {
            return { found: false, blockedReasons: ['SELECTION_NOT_FOUND'] };
        }
        return { found: true, candidateIndex: idx, fileIndex: cands[idx]._fileIndex };
    }

    function importSelectedFolderScenarioJson(relativePathOrIndex, options) {
        options = options || {};
        var warnings = [];

        var sel = _resolveFolderCandidate(relativePathOrIndex);
        if (!sel.found) {
            return {
                passed:         false,
                scenarioId:     null,
                scenarioLabel:  null,
                stepCount:      0,
                blockedReasons: sel.blockedReasons,
                warnings:       warnings
            };
        }

        // Test path: text is pre-supplied → parse + load synchronously.
        if (typeof options.text === 'string') {
            var json;
            try { json = JSON.parse(options.text); }
            catch (e) {
                return {
                    passed:         false,
                    scenarioId:     null,
                    scenarioLabel:  null,
                    stepCount:      0,
                    blockedReasons: ['JSON_PARSE_ERROR'],
                    warnings:       warnings
                };
            }
            return loadLiveScenarioFromJson(json);
        }

        // Production path: FileReader.readAsText only. NO fetch / NO XHR / NO upload.
        if (typeof FileReader === 'undefined') {
            return {
                passed:         false,
                scenarioId:     null,
                scenarioLabel:  null,
                stepCount:      0,
                blockedReasons: ['FILEREADER_UNAVAILABLE'],
                warnings:       warnings
            };
        }
        var file = _liveScenarioFolderScanState.files[sel.fileIndex];
        if (!file) {
            return {
                passed:         false,
                scenarioId:     null,
                scenarioLabel:  null,
                stepCount:      0,
                blockedReasons: ['FILE_REFERENCE_LOST'],
                warnings:       warnings
            };
        }

        var reader = new FileReader();
        reader.onload = function(e) {
            var json;
            try { json = JSON.parse(e.target.result); }
            catch (err) {
                var fail = {
                    passed:         false,
                    scenarioId:     null,
                    scenarioLabel:  null,
                    stepCount:      0,
                    blockedReasons: ['JSON_PARSE_ERROR'],
                    warnings:       []
                };
                if (typeof options.onComplete === 'function') options.onComplete(fail);
                return;
            }
            var result = loadLiveScenarioFromJson(json);
            if (typeof options.onComplete === 'function') options.onComplete(result);
        };
        reader.onerror = function() {
            var fail = {
                passed:         false,
                scenarioId:     null,
                scenarioLabel:  null,
                stepCount:      0,
                blockedReasons: ['FILEREADER_ERROR'],
                warnings:       []
            };
            if (typeof options.onComplete === 'function') options.onComplete(fail);
        };
        reader.readAsText(file);

        return {
            passed:         null,    // deferred
            deferred:       true,
            scenarioId:     null,
            scenarioLabel:  null,
            stepCount:      0,
            blockedReasons: [],
            warnings:       warnings
        };
    }

    // ── PR-286L1A: Scenario Source Hub Simplification ───────────────────
    // Wires the #sw-source-advanced-toggle button to show/hide
    // #sw-source-advanced-body. Idempotent. No data mutation. No backend.
    var _sourceAdvancedToggleWired = false;
    function initSourceAdvancedImportsToggle() {
        if (_sourceAdvancedToggleWired) return;
        var btn  = document.getElementById('sw-source-advanced-toggle');
        var body = document.getElementById('sw-source-advanced-body');
        if (!btn || !body) return;
        _sourceAdvancedToggleWired = true;
        btn.addEventListener('click', function() {
            var hidden = body.hasAttribute('hidden');
            if (hidden) {
                body.removeAttribute('hidden');
                btn.setAttribute('aria-expanded', 'true');
                btn.textContent = tx('sw-source-advanced-toggle-hide',
                                     'Hide advanced imports');
            } else {
                body.setAttribute('hidden', '');
                btn.setAttribute('aria-expanded', 'false');
                btn.textContent = tx('sw-source-advanced-toggle-show',
                                     'Show advanced imports');
            }
        });
    }

    var _liveFolderImportWired = false;
    function initLiveScenarioFolderImport() {
        if (_liveFolderImportWired) return;
        var folderInput   = document.getElementById('sw-live-scenario-folder-input');
        var scanBtn       = document.getElementById('sw-live-scenario-folder-scan-btn');
        var summaryEl     = document.getElementById('sw-live-scenario-folder-summary');
        var candidatesEl  = document.getElementById('sw-live-scenario-folder-candidates');
        var unsupportedEl = document.getElementById('sw-live-scenario-folder-unsupported');
        var importBtn     = document.getElementById('sw-live-scenario-folder-import-btn');
        if (!folderInput || !scanBtn) return;
        _liveFolderImportWired = true;

        function _clearChildren(el) {
            if (!el) return;
            while (el.firstChild) el.removeChild(el.firstChild);
        }
        function _renderSummary() {
            if (!summaryEl) return;
            var s = _liveScenarioFolderScanState.summary;
            if (!s) { summaryEl.textContent = ''; return; }
            var parts = [];
            parts.push(tx('sw-folder-summary-total',    'Total') + ': ' + s.totalFiles);
            parts.push(tx('sw-live-scenario-folder-candidates-hdr', 'JSON candidates') +
                       ': ' + s.jsonCandidates);
            if (s.unsupportedScen > 0) parts.push('.scen: ' + s.unsupportedScen);
            if (s.unsupportedIni > 0)  parts.push('.ini: '  + s.unsupportedIni);
            if (s.blockedLua > 0)      parts.push('lua: '   + s.blockedLua);
            if (s.briefingDocs > 0)    parts.push(tx('sw-folder-summary-docs',  'docs')   + ': ' + s.briefingDocs);
            if (s.assets > 0)          parts.push(tx('sw-folder-summary-assets','assets') + ': ' + s.assets);
            if (s.other > 0)           parts.push(tx('sw-folder-summary-other', 'other')  + ': ' + s.other);
            summaryEl.textContent = parts.join(' · ') + ' — ' +
                                    tx('sw-live-scenario-folder-scan-complete',
                                       'Folder scan complete.');
        }
        function _renderCandidates() {
            _clearChildren(candidatesEl);
            var cands = _liveScenarioFolderScanState.candidates || [];
            if (cands.length === 0) {
                var none = document.createElement('p');
                none.className = 'sw-live-scenario-folder-empty';
                none.textContent = tx('sw-live-scenario-folder-no-candidates',
                                      'No JSON candidates found.');
                if (candidatesEl) candidatesEl.appendChild(none);
                return;
            }
            for (var i = 0; i < cands.length; i++) {
                var c = cands[i];
                var row = document.createElement('label');
                row.className = 'sw-live-scenario-folder-cand-row';
                row.setAttribute('data-relative-path', c.relativePath || c.fileName);
                var radio = document.createElement('input');
                radio.type  = 'radio';
                radio.name  = 'sw-live-scenario-folder-cand';
                radio.value = c.relativePath || c.fileName;
                radio.className = 'sw-live-scenario-folder-cand-radio';
                radio.addEventListener('change', function(evt) {
                    _liveScenarioFolderScanState.selectedRelativePath = evt.target.value;
                    if (importBtn) importBtn.disabled = false;
                });
                row.appendChild(radio);
                var label = document.createElement('span');
                label.className = 'sw-live-scenario-folder-cand-name';
                label.textContent = c.relativePath || c.fileName;
                row.appendChild(label);
                if (candidatesEl) candidatesEl.appendChild(row);
            }
        }
        function _renderUnsupported() {
            _clearChildren(unsupportedEl);
            var unsup = _liveScenarioFolderScanState._unsupportedView || [];
            if (unsup.length === 0) return;
            for (var i = 0; i < unsup.length; i++) {
                var u = unsup[i];
                var row = document.createElement('div');
                row.className = 'sw-live-scenario-folder-unsup-row';
                row.setAttribute('data-blocked', u.blocked ? 'true' : 'false');
                row.setAttribute('data-file-type', u.fileType);
                var name = document.createElement('span');
                name.className = 'sw-live-scenario-folder-unsup-name';
                name.textContent = u.relativePath || u.fileName;
                row.appendChild(name);
                var reason = document.createElement('span');
                reason.className = 'sw-live-scenario-folder-unsup-reason';
                reason.textContent = u.reason || '';
                row.appendChild(reason);
                if (unsupportedEl) unsupportedEl.appendChild(row);
            }
        }

        scanBtn.addEventListener('click', function() {
            var files = folderInput.files;
            if (!files || !files.length) {
                if (summaryEl) {
                    summaryEl.textContent = tx('sw-live-scenario-folder-no-files',
                                               'No folder files selected.');
                }
                return;
            }
            var result = scanScenarioFolderFiles(files);
            // Store raw Files so the selected JSON can be read later.
            _liveScenarioFolderScanState.files = [];
            for (var i = 0; i < files.length; i++) {
                _liveScenarioFolderScanState.files.push(files[i]);
            }
            _liveScenarioFolderScanState.candidates           = result.candidates;
            _liveScenarioFolderScanState.summary              = result.summary;
            _liveScenarioFolderScanState.selectedRelativePath = null;
            _liveScenarioFolderScanState._unsupportedView     = result.unsupported;

            _renderSummary();
            _renderCandidates();
            _renderUnsupported();

            if (importBtn) importBtn.disabled = true;
        });

        if (importBtn) {
            importBtn.disabled = true;
            importBtn.addEventListener('click', function() {
                var sel = _liveScenarioFolderScanState.selectedRelativePath;
                if (!sel) return;
                importBtn.disabled = true;

                var statusEl    = document.getElementById('sw-live-scenario-import-status');
                var summaryStat = document.getElementById('sw-live-scenario-import-summary');

                importSelectedFolderScenarioJson(sel, {
                    onComplete: function(result) {
                        if (statusEl) {
                            statusEl.textContent = result.passed
                                ? tx('sw-live-import-success', 'Import successful.')
                                : tx('sw-live-import-blocked', 'Import blocked.');
                            statusEl.setAttribute('data-level',
                                result.passed ? 'ok' : 'error');
                        }
                        if (summaryStat) {
                            if (result.passed) {
                                var lines = [];
                                lines.push(tx('sw-live-import-scenario-loaded',
                                              'Scenario loaded') + ': ' +
                                           (result.scenarioLabel || result.scenarioId || '—'));
                                lines.push(tx('sw-live-import-steps', 'Steps') + ': ' +
                                           result.stepCount);
                                if (result.warnings && result.warnings.length) {
                                    lines.push(tx('sw-live-import-warnings', 'Warnings') +
                                               ': ' + result.warnings.join(', '));
                                }
                                summaryStat.textContent = lines.join(' · ');
                            } else {
                                summaryStat.textContent =
                                    (result.blockedReasons || []).join(', ');
                            }
                            summaryStat.removeAttribute('hidden');
                        }
                        if (!result.passed) importBtn.disabled = false;
                    }
                });
            });
        }
    }

    // ── PR-286L: Live Scenario Decision Action Baseline ──────────────────
    // First production-oriented live decision selection layer.
    // Reads window.RmoozScenario only via existing getScenario/getActiveStep accessors.
    // Never mutates the scenario object. Never advances stepIndex. Never calls backend.
    // Never uses dry-run / W3 / AMBER RIDGE / external catalog / praSelection /
    // _drpPreviewSource / _drpPreviewStepRef / _w3CoaReviewRecord. Pure live path.

    function getLiveScenarioIdentity() {
        var sc = getScenario();
        if (!sc || typeof sc !== 'object') {
            return { scenarioId: 'unknown_scenario', scenarioLabel: 'unknown_scenario' };
        }
        var sid = sc.scenario_id || sc.id || sc.name || 'unknown_scenario';
        var lbl = sc.scenario_label || sc.title || sc.name || sid;
        return { scenarioId: String(sid), scenarioLabel: String(lbl) };
    }

    function getActiveLiveStepContext() {
        var sc = getScenario();
        if (!sc) {
            return {
                scenario:      null,
                scenarioId:    null,
                scenarioLabel: null,
                stepIndex:     null,
                step:          null,
                stepId:        null,
                stepTitle:     null,
                totalSteps:    0
            };
        }
        var idn   = getLiveScenarioIdentity();
        var steps = Array.isArray(sc.steps) ? sc.steps : [];
        var idx   = getActiveStepIndex();
        var step  = steps[idx] || null;
        var sid   = null;
        var stt   = null;
        if (step) {
            sid = step.id || step.step_id || step.stepId || step.phase ||
                  (typeof step.index === 'number' ? 'step-' + step.index : null);
            stt = step.title || step.step_title || step.label || step.name ||
                  step.phase || step.kind_native || null;
        }
        return {
            scenario:      sc,
            scenarioId:    idn.scenarioId,
            scenarioLabel: idn.scenarioLabel,
            stepIndex:     idx,
            step:          step,
            stepId:        sid !== null ? String(sid) : null,
            stepTitle:     stt !== null ? String(stt) : null,
            totalSteps:    steps.length
        };
    }

    function extractLiveDecisionOptions(step) {
        var warnings       = [];
        var blockedReasons = [];
        if (!step || typeof step !== 'object') {
            return { passed: false, options: [],
                     blockedReasons: ['STEP_NULL_OR_INVALID'], warnings: warnings };
        }
        var SEARCH_FIELDS = [
            'decision_options', 'decisionOptions', 'options',
            'coa_options', 'coaOptions'
        ];
        var srcField = null;
        var srcArr   = null;
        for (var i = 0; i < SEARCH_FIELDS.length; i++) {
            var f = SEARCH_FIELDS[i];
            if (Array.isArray(step[f]) && step[f].length > 0) {
                srcField = f;
                srcArr   = step[f];
                break;
            }
        }
        if (!srcField) {
            return { passed: true, options: [], blockedReasons: [], warnings: warnings };
        }
        var out = [];
        for (var j = 0; j < srcArr.length; j++) {
            var raw = srcArr[j];
            if (!raw || typeof raw !== 'object') { continue; }
            var oid = raw.id || raw.option_id || raw.optionId ||
                      raw.coa_id || raw.coaId || ('option-' + (j + 1));
            var lbl = raw.label || raw.title || raw.name || raw.text || String(oid);
            var sum = (typeof raw.summary === 'string' && raw.summary) ? raw.summary :
                      (typeof raw.description === 'string' && raw.description) ? raw.description :
                      (typeof raw.rationale === 'string' && raw.rationale) ? raw.rationale : null;
            out.push({
                optionId:    String(oid),
                label:       String(lbl),
                summary:     sum,
                sourceField: srcField,
                readOnly:    true
            });
        }
        return { passed: true, options: out, blockedReasons: blockedReasons, warnings: warnings };
    }

    function _liveOpKey(scenarioId, stepIndex) {
        return String(scenarioId) + '::step-' + String(stepIndex);
    }

    function _liveOpAppendEvent(evt) {
        _liveOperatorWorkflowState.events.push(evt);
        var over = _liveOperatorWorkflowState.events.length - _LIVE_OP_EVENT_CAP;
        if (over > 0) {
            _liveOperatorWorkflowState.events.splice(0, over);
        }
    }

    function recordLiveOperatorSelection(optionId, options) {
        options = options || {};
        var warnings       = [];
        var blockedReasons = [];

        var ctx = getActiveLiveStepContext();
        if (!ctx.scenario || !ctx.step || ctx.stepIndex === null) {
            blockedReasons.push('NO_ACTIVE_LIVE_STEP');
            return { passed: false, record: null, blockedReasons: blockedReasons, warnings: warnings };
        }
        if (typeof optionId !== 'string' || !optionId) {
            blockedReasons.push('OPTION_ID_INVALID');
            return { passed: false, record: null, blockedReasons: blockedReasons, warnings: warnings };
        }
        var ext = extractLiveDecisionOptions(ctx.step);
        if (!ext.options || ext.options.length === 0) {
            blockedReasons.push('NO_LIVE_DECISION_OPTIONS');
            return { passed: false, record: null, blockedReasons: blockedReasons, warnings: warnings };
        }
        var match = null;
        for (var i = 0; i < ext.options.length; i++) {
            if (ext.options[i].optionId === optionId) { match = ext.options[i]; break; }
        }
        if (!match) {
            blockedReasons.push('OPTION_ID_NOT_FOUND');
            return { passed: false, record: null, blockedReasons: blockedReasons, warnings: warnings };
        }

        var nowIso = (new Date()).toISOString();
        var record = {
            recordType:           'live_operator_decision_selection',
            scenarioId:           ctx.scenarioId,
            scenarioLabel:        ctx.scenarioLabel,
            stepIndex:            ctx.stepIndex,
            stepId:               ctx.stepId,
            optionId:             match.optionId,
            optionLabel:          match.label,
            optionSummary:        match.summary,
            selectedAt:           nowIso,
            source:               'operator_live_ui',
            readOnly:             true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,
            committed:            false,
            applied:              false
        };
        var key = _liveOpKey(ctx.scenarioId, ctx.stepIndex);
        _liveOperatorWorkflowState.selections[key] = record;
        _liveOpAppendEvent({
            eventType:  'live_decision_selected',
            scenarioId: ctx.scenarioId,
            stepIndex:  ctx.stepIndex,
            optionId:   match.optionId,
            at:         nowIso,
            readOnly:   true,
            committed:  false
        });

        paintLiveDecisionActionCard();
        return { passed: true, record: record, blockedReasons: [], warnings: warnings };
    }

    function clearLiveOperatorSelection(options) {
        options = options || {};
        var warnings       = [];
        var blockedReasons = [];

        var ctx = getActiveLiveStepContext();
        if (!ctx.scenario || ctx.stepIndex === null) {
            blockedReasons.push('NO_ACTIVE_LIVE_STEP');
            return { passed: false, cleared: false,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        var key     = _liveOpKey(ctx.scenarioId, ctx.stepIndex);
        var existed = Object.prototype.hasOwnProperty.call(
                          _liveOperatorWorkflowState.selections, key);
        if (existed) {
            delete _liveOperatorWorkflowState.selections[key];
        }
        _liveOpAppendEvent({
            eventType:  'live_decision_cleared',
            scenarioId: ctx.scenarioId,
            stepIndex:  ctx.stepIndex,
            at:         (new Date()).toISOString(),
            readOnly:   true,
            committed:  false
        });
        paintLiveDecisionActionCard();
        return { passed: true, cleared: existed,
                 blockedReasons: [], warnings: warnings };
    }

    function getLiveOperatorWorkflowState() {
        // Deep copy via JSON round-trip — external callers must never see internal references.
        return JSON.parse(JSON.stringify(_liveOperatorWorkflowState));
    }

    // ── PR-287L: Live Step Status Baseline ──────────────────────────────
    // pending (default) | decided | skipped | blocked. In-memory only.
    // Annotation ONLY: never mutates scenario, never advances stepIndex,
    // never commits/applies/executes, no backend, no storage, no Gate 7.

    function isLiveStepStatusValue(status) {
        for (var i = 0; i < _LIVE_STEP_STATUS_VALUES.length; i++) {
            if (_LIVE_STEP_STATUS_VALUES[i] === status) { return true; }
        }
        return false;
    }

    function _liveStepStatusLabel(status) {
        switch (status) {
            case 'decided': return tx('sw-live-step-status-decided', 'Decided');
            case 'skipped': return tx('sw-live-step-status-skipped', 'Skipped');
            case 'blocked': return tx('sw-live-step-status-blocked', 'Blocked');
            default:        return tx('sw-live-step-status-pending', 'Pending');
        }
    }

    function getLiveStepKey(scenarioId, stepIndex) {
        // Same keyspace as live decision selections: "<scenarioId>::step-<index>".
        return _liveOpKey(scenarioId, stepIndex);
    }

    function getLiveStepStatus(stepIndex) {
        var sc  = getScenario();
        var idn = getLiveScenarioIdentity();
        var idx = (typeof stepIndex === 'number') ? stepIndex : getActiveStepIndex();
        if (!sc || typeof idx !== 'number' || idx < 0) {
            return {
                scenarioId: sc ? idn.scenarioId : null,
                stepIndex:  (typeof idx === 'number' ? idx : null),
                status:     _LIVE_STEP_STATUS_DEFAULT,
                reason:     null,
                updatedAt:  null,
                source:     'default',
                decisionId: null,
                stored:     false
            };
        }
        var key = getLiveStepKey(idn.scenarioId, idx);
        var rec = _liveOperatorWorkflowState.stepStatus[key];
        if (rec && typeof rec === 'object') {
            return JSON.parse(JSON.stringify(rec));   // deep copy of stored record (stored:true)
        }
        return {
            scenarioId: idn.scenarioId,
            stepIndex:  idx,
            status:     _LIVE_STEP_STATUS_DEFAULT,
            reason:     null,
            updatedAt:  null,
            source:     'default',
            decisionId: null,
            stored:     false
        };
    }

    function setLiveStepStatus(status, options) {
        options = options || {};
        var warnings       = [];
        var blockedReasons = [];

        var ctx = getActiveLiveStepContext();
        var idx = (typeof options.stepIndex === 'number') ? options.stepIndex : ctx.stepIndex;

        if (!ctx.scenario || idx === null || typeof idx !== 'number' || idx < 0) {
            blockedReasons.push('NO_ACTIVE_LIVE_STEP');
            return { passed: false, record: null, blockedReasons: blockedReasons, warnings: warnings };
        }
        if (!isLiveStepStatusValue(status)) {
            blockedReasons.push('INVALID_STATUS_VALUE');
            return { passed: false, record: null, blockedReasons: blockedReasons, warnings: warnings };
        }

        var nowIso = (new Date()).toISOString();
        var reason = (typeof options.reason === 'string' && options.reason) ? options.reason : null;
        var decisionId = (typeof options.decisionId === 'string' && options.decisionId)
                         ? options.decisionId : null;
        // If no decisionId supplied, link to an existing live decision selection for this step.
        if (!decisionId) {
            var selKey = _liveOpKey(ctx.scenarioId, idx);
            var sel    = _liveOperatorWorkflowState.selections[selKey];
            if (sel && sel.optionId) { decisionId = sel.optionId; }
        }

        var record = {
            recordType:           'live_step_status',
            scenarioId:           ctx.scenarioId,
            scenarioLabel:        ctx.scenarioLabel,
            stepIndex:            idx,
            stepId:               ctx.stepId,
            status:               status,
            reason:               reason,
            updatedAt:            nowIso,
            source:               'operator',
            decisionId:           decisionId,
            readOnly:             true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false,
            committed:            false,
            applied:              false,
            stored:               true
        };
        var key = getLiveStepKey(ctx.scenarioId, idx);
        _liveOperatorWorkflowState.stepStatus[key] = record;
        _liveOpAppendEvent({
            eventType:  'live_step_status_set',
            scenarioId: ctx.scenarioId,
            stepIndex:  idx,
            status:     status,
            at:         nowIso,
            readOnly:   true,
            committed:  false
        });

        if (typeof paintLiveDecisionActionCard === 'function') { paintLiveDecisionActionCard(); }
        if (typeof paintStepNavigator === 'function')          { paintStepNavigator(); }
        if (typeof paintLiveScenarioHeader === 'function')     { paintLiveScenarioHeader(); }
        return { passed: true, record: JSON.parse(JSON.stringify(record)),
                 blockedReasons: [], warnings: warnings };
    }

    function clearLiveStepStatus(stepIndex) {
        var warnings       = [];
        var blockedReasons = [];

        var ctx = getActiveLiveStepContext();
        var idx = (typeof stepIndex === 'number') ? stepIndex : ctx.stepIndex;
        if (!ctx.scenario || idx === null || typeof idx !== 'number' || idx < 0) {
            blockedReasons.push('NO_ACTIVE_LIVE_STEP');
            return { passed: false, cleared: false,
                     blockedReasons: blockedReasons, warnings: warnings };
        }
        var key     = getLiveStepKey(ctx.scenarioId, idx);
        var existed  = Object.prototype.hasOwnProperty.call(
                           _liveOperatorWorkflowState.stepStatus, key);
        if (existed) {
            delete _liveOperatorWorkflowState.stepStatus[key];
        }
        _liveOpAppendEvent({
            eventType:  'live_step_status_cleared',
            scenarioId: ctx.scenarioId,
            stepIndex:  idx,
            at:         (new Date()).toISOString(),
            readOnly:   true,
            committed:  false
        });
        if (typeof paintLiveDecisionActionCard === 'function') { paintLiveDecisionActionCard(); }
        if (typeof paintStepNavigator === 'function')          { paintStepNavigator(); }
        if (typeof paintLiveScenarioHeader === 'function')     { paintLiveScenarioHeader(); }
        return { passed: true, cleared: existed,
                 blockedReasons: [], warnings: warnings };
    }

    function getLiveScenarioStatusSummary() {
        var sc     = getScenario();
        var idn    = getLiveScenarioIdentity();
        var counts = { pending: 0, decided: 0, skipped: 0, blocked: 0 };
        var perStep = [];
        if (!sc || !Array.isArray(sc.steps) || sc.steps.length === 0) {
            return {
                scenarioId:    sc ? idn.scenarioId : null,
                totalSteps:    0,
                counts:        counts,
                decidedCount:  0,
                resolvedCount: 0,
                pendingCount:  0,
                steps:         perStep
            };
        }
        var total = sc.steps.length;
        for (var i = 0; i < total; i++) {
            var key = getLiveStepKey(idn.scenarioId, i);
            var rec = _liveOperatorWorkflowState.stepStatus[key];
            var st  = (rec && isLiveStepStatusValue(rec.status)) ? rec.status : _LIVE_STEP_STATUS_DEFAULT;
            if (Object.prototype.hasOwnProperty.call(counts, st)) { counts[st]++; }
            else { counts.pending++; }
            perStep.push({ stepIndex: i, status: st, stored: !!rec });
        }
        return {
            scenarioId:    idn.scenarioId,
            totalSteps:    total,
            counts:        counts,
            decidedCount:  counts.decided,
            resolvedCount: counts.decided + counts.skipped + counts.blocked,
            pendingCount:  counts.pending,
            steps:         perStep
        };
    }

    // DOM paint for the per-step status row inside #sw-live-decision-card.
    function paintLiveStepStatusRow() {
        var row = document.getElementById('sw-live-step-status-row');
        if (!row) { return; }
        var badgeEl  = document.getElementById('sw-live-step-status-badge');
        var actsEl   = document.getElementById('sw-live-step-status-actions');
        var reasonEl = document.getElementById('sw-live-step-status-reason');
        var sumEl    = document.getElementById('sw-live-step-status-summary');

        var ctx = getActiveLiveStepContext();

        // No active live step → neutral pending badge, hide actions + reason.
        if (!ctx.scenario || !ctx.step) {
            if (badgeEl) {
                badgeEl.setAttribute('data-status', 'pending');
                badgeEl.textContent = _liveStepStatusLabel('pending');
            }
            if (actsEl)   { actsEl.setAttribute('hidden', ''); }
            if (reasonEl) { reasonEl.textContent = ''; reasonEl.setAttribute('hidden', ''); }
            if (sumEl)    { sumEl.textContent = ''; }
            return;
        }
        if (actsEl) { actsEl.removeAttribute('hidden'); }

        var status = getLiveStepStatus(ctx.stepIndex);
        if (badgeEl) {
            badgeEl.setAttribute('data-status', status.status);
            badgeEl.textContent = _liveStepStatusLabel(status.status);
        }
        if (reasonEl) {
            if (status.reason) {
                reasonEl.textContent =
                    tx('sw-live-step-status-reason-prefix', 'Reason') + ': ' + status.reason;
                reasonEl.removeAttribute('hidden');
            } else {
                reasonEl.textContent = '';
                reasonEl.setAttribute('hidden', '');
            }
        }
        // Scenario-wide rollup: "Decided N · Skipped N · Blocked N · Pending N of T".
        if (sumEl) {
            var sm = getLiveScenarioStatusSummary();
            sumEl.textContent =
                _liveStepStatusLabel('decided') + ' ' + sm.counts.decided + ' · ' +
                _liveStepStatusLabel('skipped') + ' ' + sm.counts.skipped + ' · ' +
                _liveStepStatusLabel('blocked') + ' ' + sm.counts.blocked + ' · ' +
                _liveStepStatusLabel('pending') + ' ' + sm.counts.pending + ' ' +
                tx('sw-live-decision-of', 'of') + ' ' + sm.totalSteps;
        }
        // Highlight the active status button.
        if (actsEl && actsEl.getElementsByTagName) {
            var btns = actsEl.getElementsByTagName('button');
            for (var b = 0; b < btns.length; b++) {
                var bv = btns[b].getAttribute && btns[b].getAttribute('data-live-step-status');
                if (bv) {
                    if (bv === status.status) { btns[b].setAttribute('data-active', 'true'); }
                    else { btns[b].removeAttribute('data-active'); }
                }
            }
        }
    }

    // ── PR-288L: Live Operator Event Log ────────────────────────────────
    // Surfaces _liveOperatorWorkflowState.events (the in-memory operator audit
    // trail, capped at _LIVE_OP_EVENT_CAP) as a READ-ONLY tabular ops ledger:
    // DTG / Severity / Category / Source / Message. NOT chat-style — no avatars,
    // bubbles, or speaker lanes. Ledger columns are DERIVED from raw events at
    // read time, so the append sites stay lean and the events array remains the
    // single source of truth. No scenario/unit/map mutation. No backend. No
    // storage. No Gate 7. The only writer is clearLiveOperatorEventLog (operator).
    var _liveEventLogWired = false;

    function _liveOpFormatDtg(iso) {
        if (typeof iso !== 'string' || !iso) { return '—'; }
        // ISO 8601 → compact "YYYY-MM-DD HH:MM:SSZ" (UTC, no ms noise).
        var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso);
        if (m) { return m[1] + ' ' + m[2] + 'Z'; }
        return iso;
    }

    function _liveOpLedgerMsg(key, fallback, vars) {
        var s = tx(key, fallback);
        vars = vars || {};
        for (var k in vars) {
            if (Object.prototype.hasOwnProperty.call(vars, k)) {
                s = s.split('{' + k + '}').join(vars[k]);
            }
        }
        return s;
    }

    function _liveOpSeverityLabel(sev) {
        switch (sev) {
            case 'warning': return tx('sw-live-event-log-sev-warning', 'Warning');
            case 'notice':  return tx('sw-live-event-log-sev-notice',  'Notice');
            default:        return tx('sw-live-event-log-sev-info',     'Info');
        }
    }

    function _liveOpCategoryLabel(cat) {
        switch (cat) {
            case 'decision':    return tx('sw-live-event-log-cat-decision',    'Decision');
            case 'step-status': return tx('sw-live-event-log-cat-step-status', 'Step Status');
            default:            return tx('sw-live-event-log-cat-general',     'General');
        }
    }

    function _liveOpEventToLedgerRow(evt) {
        evt = evt || {};
        var type    = evt.eventType || 'unknown';
        var stepNo  = (typeof evt.stepIndex === 'number') ? (evt.stepIndex + 1) : null;
        var stepTxt = (stepNo !== null) ? String(stepNo) : '—';

        var severity = 'info';
        var category = 'general';
        var message  = type;

        if (type === 'live_decision_selected') {
            category = 'decision';
            message  = _liveOpLedgerMsg('sw-live-event-log-msg-decision-selected',
                                        'Selected decision option {option} on step {step}',
                                        { step: stepTxt, option: (evt.optionId || '—') });
        } else if (type === 'live_decision_cleared') {
            category = 'decision';
            message  = _liveOpLedgerMsg('sw-live-event-log-msg-decision-cleared',
                                        'Cleared decision on step {step}',
                                        { step: stepTxt });
        } else if (type === 'live_step_status_set') {
            category = 'step-status';
            if (evt.status === 'blocked')      { severity = 'warning'; }
            else if (evt.status === 'skipped') { severity = 'notice'; }
            message = _liveOpLedgerMsg('sw-live-event-log-msg-status-set',
                                       'Marked step {step} {status}',
                                       { step: stepTxt,
                                         status: _liveStepStatusLabel(evt.status || 'pending') });
        } else if (type === 'live_step_status_cleared') {
            category = 'step-status';
            message  = _liveOpLedgerMsg('sw-live-event-log-msg-status-cleared',
                                        'Cleared status on step {step}',
                                        { step: stepTxt });
        }

        return {
            dtg:           _liveOpFormatDtg(evt.at),
            severity:      severity,
            severityLabel: _liveOpSeverityLabel(severity),
            category:      category,
            categoryLabel: _liveOpCategoryLabel(category),
            source:        'operator',
            sourceLabel:   tx('sw-live-event-log-source-operator', 'Operator'),
            message:       message,
            eventType:     type,
            scenarioId:    (typeof evt.scenarioId === 'string') ? evt.scenarioId : null,
            stepIndex:     (typeof evt.stepIndex === 'number') ? evt.stepIndex : null,
            at:            (typeof evt.at === 'string') ? evt.at : null,
            readOnly:      true,
            committed:     false
        };
    }

    function getLiveOperatorEventLog() {
        var raw  = (_liveOperatorWorkflowState && _liveOperatorWorkflowState.events) || [];
        var rows = [];
        // Newest first for display.
        for (var i = raw.length - 1; i >= 0; i--) {
            rows.push(_liveOpEventToLedgerRow(raw[i]));
        }
        return {
            count:  raw.length,
            cap:    _LIVE_OP_EVENT_CAP,
            rows:   rows,                                  // newest-first ledger rows
            events: JSON.parse(JSON.stringify(raw))        // raw chronological copy
        };
    }

    function clearLiveOperatorEventLog() {
        var had = (_liveOperatorWorkflowState && _liveOperatorWorkflowState.events) ?
                  _liveOperatorWorkflowState.events.length : 0;
        if (_liveOperatorWorkflowState) { _liveOperatorWorkflowState.events = []; }
        if (typeof paintLiveOperatorEventLog === 'function') { paintLiveOperatorEventLog(); }
        return { passed: true, cleared: had > 0, clearedCount: had };
    }

    function _initLiveEventLogCard() {
        if (_liveEventLogWired) { return; }
        var card = document.getElementById('sw-live-event-log-card');
        if (!card) { return; }
        _liveEventLogWired = true;
        card.addEventListener('click', function(evt) {
            var t = evt.target;
            if (!t) { return; }
            if (t.id === 'sw-live-event-log-clear-btn') {
                clearLiveOperatorEventLog();
            }
        });
    }

    function paintLiveOperatorEventLog() {
        var card = document.getElementById('sw-live-event-log-card');
        if (!card) { return; }
        _initLiveEventLogCard();

        function _h(el) { if (el) { el.setAttribute('hidden', ''); } }
        function _s(el) { if (el) { el.removeAttribute('hidden'); } }

        var rowsEl  = document.getElementById('sw-live-event-log-rows');
        var emptyEl = document.getElementById('sw-live-event-log-empty');
        var countEl = document.getElementById('sw-live-event-log-count');
        var clearEl = document.getElementById('sw-live-event-log-clear-btn');
        var tableEl = document.getElementById('sw-live-event-log-table');

        var log     = getLiveOperatorEventLog();
        var rows    = log.rows;
        var hasRows = rows.length > 0;

        if (rowsEl) {
            while (rowsEl.firstChild) { rowsEl.removeChild(rowsEl.firstChild); }
            for (var i = 0; i < rows.length; i++) {
                var r  = rows[i];
                var tr = document.createElement('tr');
                tr.className = 'sw-evl-row';
                if (tr.setAttribute) {
                    tr.setAttribute('data-severity', r.severity);
                    tr.setAttribute('data-category', r.category);
                }
                _evlCell(tr, 'sw-evl-cell-dtg',      r.dtg);
                _evlCell(tr, 'sw-evl-cell-severity', r.severityLabel);
                _evlCell(tr, 'sw-evl-cell-category', r.categoryLabel);
                _evlCell(tr, 'sw-evl-cell-source',   r.sourceLabel);
                _evlCell(tr, 'sw-evl-cell-message',  r.message);
                rowsEl.appendChild(tr);
            }
        }

        if (hasRows) { _h(emptyEl); _s(clearEl); }
        else         { _s(emptyEl); _h(clearEl); }
        if (tableEl && tableEl.style) { tableEl.style.display = hasRows ? '' : 'none'; }
        if (countEl) {
            countEl.textContent = _liveOpLedgerMsg(
                'sw-live-event-log-count-fmt', '{n} of {cap} operator events (in memory)',
                { n: String(log.count), cap: String(log.cap) });
        }
    }

    function _evlCell(tr, cls, text) {
        var td = document.createElement('td');
        td.className = cls;
        td.textContent = (text === null || text === undefined) ? '' : String(text);
        tr.appendChild(td);
    }

    // ───────────────────────────────────────────────────────────────────────
    // PR-289L: Live Step Involved Units (read-only step context).
    // For the ACTIVE step, lists the units involved this step — derived from
    // window.RmoozScenario.scenario: step.actors (units acting) + step.affected
    // (units impacted), resolved against the scenario OOB (red_units /
    // blue_units_initial) for identity (label / side / role / domain). Pure read:
    // no mutation, no backend, no adjudication, no casualty/damage numbers — only
    // unit identity + involvement category (acts / affected). Painted at the
    // shared paintLiveDecisionActionCard chokepoint so it tracks the active step.
    // ───────────────────────────────────────────────────────────────────────

    function buildLiveOobUnitIndex(scenario) {
        var index = {};
        var redCount = 0, blueCount = 0;
        if (scenario && typeof scenario === 'object') {
            var red = Array.isArray(scenario.red_units) ? scenario.red_units : [];
            for (var i = 0; i < red.length; i++) {
                var ru = red[i];
                if (!ru || typeof ru !== 'object') { continue; }
                var rid = ru.uid || ru.unit_uid || ru.id || ru.base_id;
                if (rid === undefined || rid === null || rid === '') { continue; }
                index[String(rid)] = {
                    uid:       String(rid),
                    side:      'RED',
                    label:     ru.label || ru.name || ru.name_ar || String(rid),
                    role:      ru.role || null,
                    domain:    ru.domain || null,
                    echelon:   ru.echelon || null,
                    readiness: ru.readiness || 'ready',
                    supply:    typeof ru.supply === 'number' ? ru.supply : 0.8
                };
                redCount++;
            }
            var blue = Array.isArray(scenario.blue_units_initial) ? scenario.blue_units_initial : [];
            for (var j = 0; j < blue.length; j++) {
                var bu = blue[j];
                if (!bu || typeof bu !== 'object') { continue; }
                var bid = bu.unit_uid || bu.uid || bu.base_id || bu.id;
                if (bid === undefined || bid === null || bid === '') { continue; }
                index[String(bid)] = {
                    uid:       String(bid),
                    side:      'BLUE',
                    label:     bu.label || bu.name || bu.name_ar || String(bid),
                    role:      bu.role || null,
                    domain:    bu.domain || null,
                    echelon:   bu.echelon || null,
                    readiness: bu.readiness || 'ready',
                    supply:    typeof bu.supply === 'number' ? bu.supply : 0.8
                };
                blueCount++;
            }
        }
        return { index: index, redCount: redCount, blueCount: blueCount };
    }

    function buildLiveStepInvolvedUnits(step, scenario) {
        var warnings = [];
        if (!step || typeof step !== 'object') {
            return { passed: false, units: [],
                     counts: { total: 0, acting: 0, affected: 0, both: 0 },
                     warnings: ['STEP_NULL_OR_INVALID'] };
        }
        var oob      = buildLiveOobUnitIndex(scenario);
        var actors   = Array.isArray(step.actors)   ? step.actors   : [];
        var affected = Array.isArray(step.affected) ? step.affected : [];

        var order = [];      // first-seen order: actors first, then affected-only
        var byUid = {};

        function _touch(entry, role) {
            if (!entry || typeof entry !== 'object') { return; }
            var uid = entry.uid || entry.unit_uid || entry.id;
            if (uid === undefined || uid === null || uid === '') { return; }
            uid = String(uid);
            var rec = byUid[uid];
            if (!rec) {
                var resolved = oob.index[uid] || null;
                rec = {
                    uid:      uid,
                    side:     (resolved && resolved.side) || entry.side || null,
                    label:    (resolved && resolved.label) || uid,
                    role:     resolved ? resolved.role : null,
                    domain:   resolved ? resolved.domain : null,
                    resolved: !!resolved,
                    acts:     false,
                    affected: false
                };
                byUid[uid] = rec;
                order.push(uid);
            }
            if (role === 'actor')    { rec.acts = true; }
            if (role === 'affected') { rec.affected = true; }
            if (!rec.side && entry.side) { rec.side = entry.side; }
        }

        for (var a = 0; a < actors.length; a++)   { _touch(actors[a],   'actor'); }
        for (var f = 0; f < affected.length; f++) { _touch(affected[f], 'affected'); }

        var units  = [];
        var acting = 0, aff = 0, both = 0;
        for (var k = 0; k < order.length; k++) {
            var u = byUid[order[k]];
            var involvement = (u.acts && u.affected) ? 'both' : (u.acts ? 'acts' : 'affected');
            if (u.acts)               { acting++; }
            if (u.affected)           { aff++; }
            if (u.acts && u.affected) { both++; }
            var oobRec = oob.index[u.uid] || {};
            units.push({
                uid:         u.uid,
                side:        u.side ? String(u.side).toUpperCase() : null,
                label:       u.label,
                role:        u.role,
                domain:      u.domain,
                involvement: involvement,   // 'acts' | 'affected' | 'both'
                resolved:    u.resolved,
                readiness:   oobRec.readiness || 'ready',
                supply:      typeof oobRec.supply === 'number' ? oobRec.supply : 0.8,
                readOnly:    true
            });
        }
        if (!oob.redCount && !oob.blueCount) { warnings.push('NO_OOB_UNITS_FOR_RESOLUTION'); }
        return {
            passed: true,
            units:  units,
            counts: { total: units.length, acting: acting, affected: aff, both: both },
            warnings: warnings
        };
    }

    function _liveInvolveLabel(involvement) {
        switch (involvement) {
            case 'acts':     return tx('sw-live-step-units-involve-acts', 'Acts');
            case 'affected': return tx('sw-live-step-units-involve-affected', 'Affected');
            case 'both':     return tx('sw-live-step-units-involve-both', 'Acts + Affected');
            default:         return '—';
        }
    }
    function _liveSideLabel(side) {
        if (side === 'RED')  { return tx('sw-live-step-units-side-red', 'Red'); }
        if (side === 'BLUE') { return tx('sw-live-step-units-side-blue', 'Blue'); }
        return side || '—';
    }
    function _liveReadinessLabel(readiness) {
        switch (readiness) {
            case 'ready':     return tx('sw-live-step-units-readiness-ready', 'Ready');
            case 'limited':   return tx('sw-live-step-units-readiness-limited', 'Limited');
            case 'not_ready': return tx('sw-live-step-units-readiness-not-ready', 'Not Ready');
            default:          return readiness || '—';
        }
    }
    function _liveSupplyLabel(supply) {
        if (typeof supply === 'number') {
            var pct = Math.round(supply * 100);
            return pct + '%';
        }
        return '—';
    }

    function getLiveStepInvolvedUnits(stepIndex) {
        var sc    = getScenario();
        var steps = (sc && Array.isArray(sc.steps)) ? sc.steps : [];
        var idx   = (typeof stepIndex === 'number') ? stepIndex : getActiveStepIndex();
        var step  = steps[idx] || null;
        var built = buildLiveStepInvolvedUnits(step, sc);
        return {
            stepIndex: idx,
            count:     built.counts.total,
            counts:    built.counts,
            units:     built.units,
            warnings:  built.warnings
        };
    }

    function paintLiveStepInvolvedUnits() {
        var card = document.getElementById('sw-live-step-units-card');
        if (!card) { return; }

        function _h(el) { if (el) { el.setAttribute('hidden', ''); } }
        function _s(el) { if (el) { el.removeAttribute('hidden'); } }

        var rowsEl  = document.getElementById('sw-live-step-units-rows');
        var emptyEl = document.getElementById('sw-live-step-units-empty');
        var countEl = document.getElementById('sw-live-step-units-count');
        var tableEl = document.getElementById('sw-live-step-units-table');

        var ctx     = getActiveLiveStepContext();
        var built   = buildLiveStepInvolvedUnits(ctx.step, ctx.scenario);
        var units   = built.units;
        var hasRows = units.length > 0;

        if (rowsEl) {
            while (rowsEl.firstChild) { rowsEl.removeChild(rowsEl.firstChild); }
            for (var i = 0; i < units.length; i++) {
                var u  = units[i];
                var tr = document.createElement('tr');
                tr.className = 'sw-slu-row';
                if (tr.setAttribute) {
                    tr.setAttribute('data-side', u.side || 'NA');
                    tr.setAttribute('data-involvement', u.involvement);
                }
                _sluCell(tr, 'sw-slu-cell-unit',      u.label || u.uid);
                _sluCell(tr, 'sw-slu-cell-side',      _liveSideLabel(u.side));
                _sluCell(tr, 'sw-slu-cell-role',      u.role || '—');
                _sluCell(tr, 'sw-slu-cell-domain',    u.domain || '—');
                _sluCell(tr, 'sw-slu-cell-involve',   _liveInvolveLabel(u.involvement));
                _sluCell(tr, 'sw-slu-cell-readiness', _liveReadinessLabel(u.readiness));
                _sluCell(tr, 'sw-slu-cell-supply',    _liveSupplyLabel(u.supply));
                // TASK1-D: tasking indicator — reads ws.derived.unit_tasking (read-only)
                _sluCellOrders(tr, u.uid);
                rowsEl.appendChild(tr);
            }
        }

        if (hasRows) { _h(emptyEl); }
        else         { _s(emptyEl); }
        if (tableEl && tableEl.style) { tableEl.style.display = hasRows ? '' : 'none'; }
        if (countEl) {
            countEl.textContent = _liveOpLedgerMsg(
                'sw-live-step-units-count-fmt',
                '{n} units this step · {acting} acting · {affected} affected',
                { n:        String(built.counts.total),
                  acting:   String(built.counts.acting),
                  affected: String(built.counts.affected) });
        }
    }

    function _sluCell(tr, cls, text) {
        var td = document.createElement('td');
        td.className = cls;
        td.textContent = (text === null || text === undefined) ? '' : String(text);
        tr.appendChild(td);
    }

    /**
     * TASK1-D: look up component_label for a unit uid from the current world state.
     * Uses the same AppAdjudicatorMap.getWorldState() accessor as the Commander Panel.
     * Returns null when: no world state, unit has no actor this step.
     * Never throws; fully guarded.
     *
     * @param {string} uid
     * @returns {string|null}
     */
    function _sluTaskingLabel(uid) {
        if (!uid) return null;
        try {
            var map = window.AppAdjudicatorMap;
            if (!map || typeof map.getWorldState !== 'function') return null;
            var ws = map.getWorldState();
            if (!ws || !ws.derived || !ws.derived.unit_tasking) return null;
            var t = ws.derived.unit_tasking[uid];
            if (!t) return null;
            return t.component_label || t.action_component || 'Tasked';
        } catch (_) { return null; }
    }

    /**
     * TASK1-D: create the Orders cell for a row.
     * When tasking data exists: renders a compact chip with the component label.
     * When absent: plain '—' in muted style.
     *
     * @param {HTMLElement} tr  - table row
     * @param {string}      uid - unit uid
     */
    function _sluCellOrders(tr, uid) {
        var td = document.createElement('td');
        td.className = 'sw-slu-cell-orders';
        var label = _sluTaskingLabel(uid);
        if (label) {
            var chip = document.createElement('span');
            chip.className = 'sw-slu-orders-chip';
            chip.textContent = label;
            chip.title = label;  // tooltip for truncated text
            td.appendChild(chip);
        } else {
            td.textContent = '—';
        }
        tr.appendChild(td);
    }

    function _initLiveDecisionActionCard() {
        if (_liveDecisionCardWired) return;
        var card = document.getElementById('sw-live-decision-card');
        if (!card) return;
        _liveDecisionCardWired = true;
        // Event delegation — buttons are re-rendered on each paint.
        card.addEventListener('click', function(evt) {
            var t = evt.target;
            if (!t) return;
            // PR-287L: step status actions (Mark Decided / Skipped / Blocked / Clear).
            if (t.id === 'sw-live-step-status-clear-btn') {
                clearLiveStepStatus();
                return;
            }
            var statusVal = (t.getAttribute && t.getAttribute('data-live-step-status')) || null;
            if (statusVal) { setLiveStepStatus(statusVal); return; }
            if (t.id === 'sw-live-decision-clear-btn') {
                clearLiveOperatorSelection();
                return;
            }
            var oid = (t.getAttribute && t.getAttribute('data-live-option-id')) || null;
            if (oid) { recordLiveOperatorSelection(oid); }
        });
    }

    function paintLiveDecisionActionCard() {
        var card = document.getElementById('sw-live-decision-card');
        if (!card) return;
        _initLiveDecisionActionCard();

        // PR-287L: paint the per-step status row (handles its own no-step state).
        if (typeof paintLiveStepStatusRow === 'function') { paintLiveStepStatusRow(); }

        // PR-288L: repaint the live operator event-log ledger on every action
        // and on every refresh/goToStep cycle (this fn is the shared chokepoint).
        if (typeof paintLiveOperatorEventLog === 'function') { paintLiveOperatorEventLog(); }

        // PR-289L: repaint the read-only involved-units context for the active step.
        if (typeof paintLiveStepInvolvedUnits === 'function') { paintLiveStepInvolvedUnits(); }

        var emptyEl = document.getElementById('sw-live-decision-empty');
        var stepEl  = document.getElementById('sw-live-decision-step');
        var optsEl  = document.getElementById('sw-live-decision-options');
        var selEl   = document.getElementById('sw-live-decision-selected');
        var clearEl = document.getElementById('sw-live-decision-clear-btn');
        var evtEl   = document.getElementById('sw-live-decision-event');

        function _hide(el)  { if (el) el.setAttribute('hidden', ''); }
        function _show(el)  { if (el) el.removeAttribute('hidden'); }
        function _clear(el) { if (el) { while (el.firstChild) el.removeChild(el.firstChild); } }

        var ctx = getActiveLiveStepContext();

        // No active live step → empty state
        if (!ctx.scenario || !ctx.step) {
            if (stepEl)  stepEl.textContent = '';
            _clear(optsEl);
            if (selEl)   { selEl.textContent = ''; _hide(selEl); }
            if (clearEl) _hide(clearEl);
            if (evtEl)   { evtEl.textContent = ''; _hide(evtEl); }
            if (emptyEl) {
                emptyEl.textContent = tx('sw-live-decision-no-step',
                                         'No live scenario step available.');
                _show(emptyEl);
            }
            return;
        }
        _hide(emptyEl);

        // Step indicator: "Step N of T · <stepId>"
        if (stepEl) {
            var line =
                tx('sw-live-decision-step-prefix', 'Step') + ' ' +
                (ctx.stepIndex + 1) + ' ' +
                tx('sw-live-decision-of', 'of') + ' ' + ctx.totalSteps;
            if (ctx.stepId) { line += ' · ' + ctx.stepId; }
            stepEl.textContent = line;
        }

        // Decision options
        var ext = extractLiveDecisionOptions(ctx.step);
        if (optsEl) {
            _clear(optsEl);
            if (ext.options.length === 0) {
                var none = document.createElement('p');
                none.className = 'sw-live-decision-no-options';
                none.textContent = tx('sw-live-decision-no-options',
                                      'No decision options available for this live step.');
                optsEl.appendChild(none);
            } else {
                for (var i = 0; i < ext.options.length; i++) {
                    var o   = ext.options[i];
                    var row = document.createElement('div');
                    row.className = 'sw-live-decision-option-row';
                    row.setAttribute('data-option-id', o.optionId);

                    var lblWrap = document.createElement('div');
                    lblWrap.className = 'sw-live-decision-option-label';
                    lblWrap.textContent = o.label;
                    row.appendChild(lblWrap);

                    if (o.summary) {
                        var sumEl = document.createElement('div');
                        sumEl.className = 'sw-live-decision-option-summary';
                        sumEl.textContent = o.summary;
                        row.appendChild(sumEl);
                    }

                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'sw-live-decision-select-btn';
                    btn.setAttribute('data-live-option-id', o.optionId);
                    btn.textContent = tx('sw-live-decision-select-btn', 'Select');
                    row.appendChild(btn);

                    optsEl.appendChild(row);
                }
            }
        }

        // Selected (per scenario+step)
        var key      = _liveOpKey(ctx.scenarioId, ctx.stepIndex);
        var existing = _liveOperatorWorkflowState.selections[key] || null;
        if (existing && selEl) {
            selEl.textContent =
                tx('sw-live-decision-selected-label', 'Selected') + ': ' +
                existing.optionLabel;
            _show(selEl);
            _show(clearEl);
        } else {
            if (selEl)   { selEl.textContent = ''; _hide(selEl); }
            if (clearEl) _hide(clearEl);
        }

        // Last event for this scenario+step (if any)
        if (evtEl) {
            var events = _liveOperatorWorkflowState.events;
            var lastForStep = null;
            for (var k = events.length - 1; k >= 0; k--) {
                var ev = events[k];
                if (ev && ev.scenarioId === ctx.scenarioId && ev.stepIndex === ctx.stepIndex) {
                    lastForStep = ev; break;
                }
            }
            if (lastForStep) {
                evtEl.textContent =
                    tx('sw-live-decision-event-prefix', 'Live workflow event') + ': ' +
                    lastForStep.eventType + ' · ' + (lastForStep.at || '');
                _show(evtEl);
            } else {
                evtEl.textContent = '';
                _hide(evtEl);
            }
        }
    }

    // ── Public API (read-only) ───────────────────────────────────────────
    window.AppShellScenarioWorkspace = {
        refresh: function () {
            // PR-57/58: compare current live step to last known.
            // -1 guard suppresses flash on the very first refresh (page load).
            var curLiveIdx  = getActiveStepIndex();
            var stepChanged = (curLiveIdx !== lastLiveStepIndex);

            // PR-57: flash the card when live step advances (not on first seed)
            if (lastLiveStepIndex !== -1 && stepChanged) {
                var flashCard = document.getElementById('sw-wt-card');
                if (flashCard) {
                    flashCard.classList.remove('sw-wt-card--step-flash');
                    void flashCard.offsetWidth;                              // restart CSS animation if already running
                    flashCard.classList.add('sw-wt-card--step-flash');
                    setTimeout(function () { flashCard.classList.remove('sw-wt-card--step-flash'); }, 900);
                }
            }

            // PR-58: record timestamp on first load (seed) or any step change
            if (lastLiveStepIndex === -1 || stepChanged) {
                lastLiveStepUpdatedAt = new Date();
            }

            lastLiveStepIndex = curLiveIdx;

            paintSafety(safetyChip && safetyChip.getAttribute('data-state'));
            paintService();
            paintLastDecision();
            paintScenarioOverview();
            paintPhaseTimeline();
            paintIntentCard();
            paintProposalCard();
            paintProposalActions();
            paintDecisionSummary();
            paintMetaCard();           // PR-68: Scenario Metadata Snapshot Card
            paintObjectiveCard();      // PR-61: Objective Snapshot Card
            paintBlsCard();            // PR-62: BLS Snapshot Card
            paintForceSummaryStrip();  // PR-65: Force Summary Balance Strip
            paintBlueForceCard();      // BFC: Blue Force Snapshot Card
            paintRedForceCard();       // PR-64: Red Force Snapshot Card
            paintUnitComposition();    // PR-287E: Scenario Unit Composition readout
            paintStepAttrition();      // PR-287F: step-aware Red Attrition readout
            paintStepActivity();       // PR-287G: step-aware Engagement Tempo readout
            previewStepIndex = null;   // PR-53 Option A: live step advanced → reset preview
            paintWalkthroughCard();
            paintBriefingCard();           // PR-132
            paintStepNavigator();          // PR-132
            paintActionsCard();            // PR-132
            paintPlayButton();             // PR-136
            paintOverlayToggleButton();    // PR-138
            paintDecisionPackageCards();   // PR-142
            paintLiveDecisionActionCard(); // PR-286L: live operator decision card
            paintLiveScenarioHeader();     // PR-287L2: live scenario header strip
        },
        // PR-142: Load a read-only Decision Package for in-panel preview.
        // Caller must supply in-memory manifest and steps objects.
        // No backend. No file I/O. No storage. Normaliser rejects non-read_only packages.
        loadDecisionPackage: function (manifest, steps) {
            loadDecisionPackagePreview(manifest, steps);
        },
        // PR-145: Load an already-parsed fixture package through the in-memory adapter.
        // Input: { manifest, steps } in DP_01/02/03 fixture shape or PR-143 sample shape.
        // Adapter normalises field names before passing to loadDecisionPackagePreview().
        // No file I/O. No backend. No storage. No mutation. Pure in-memory transform.
        loadFixture: function (rawPackage) {
            loadParsedDecisionPackageFixture(rawPackage);
        },
        // PR-168: Pure staging candidate validator. No UI, no mutation, no apply path.
        // Accepts a single normalised step; returns { passed, checks, blockedReasons, warnings }.
        validateStagingCandidate: validateStagingCandidate,
        // PR-172: Staging proposal safety constants and type guard.
        // STAGING_PROPOSAL_SAFETY: frozen object with all five hard-locked safety flags.
        // isStagingProposalSafe: pure guard; returns { passed, blockedReasons }.
        STAGING_PROPOSAL_SAFETY:  STAGING_PROPOSAL_SAFETY,
        isStagingProposalSafe:    isStagingProposalSafe,
        // PR-173: Staging proposal builder. Pure function, dry-run only, no storage.
        // Accepts a normalised step + options; returns { passed, proposal, blockedReasons, warnings }.
        buildStagingProposal:     buildStagingProposal,
        // PR-177: Operator review record type guard. Pure function, no UI, no storage.
        // Accepts a future OperatorReviewRecord; returns { passed, blockedReasons }.
        isOperatorReviewRecordSafe: isOperatorReviewRecordSafe,
        // PR-179: Dry-run confirmation type guard. Pure function, no UI, no storage.
        // DRY_RUN_CONFIRMATION_MODE: the only permitted mode string ("dry_run_only").
        // isDryRunConfirmationSafe: accepts a future DryRunConfirmation; returns { passed, blockedReasons }.
        DRY_RUN_CONFIRMATION_MODE:  DRY_RUN_CONFIRMATION_MODE,
        isDryRunConfirmationSafe:   isDryRunConfirmationSafe,
        // PR-180: Dry-run confirmation builder. Pure function, no UI, no storage.
        // Accepts a StagingProposal + OperatorReviewRecord (decision must be approve_dry_run).
        // Returns { passed, confirmation|null, blockedReasons, warnings }.
        buildDryRunConfirmation:    buildDryRunConfirmation,
        // PR-183: UID reconciliation result type guard. Pure function, no UI, no storage.
        // RECONCILIATION_CONFIDENCE_LEVELS: frozen array of permitted confidence strings.
        // MATCH_METHODS: frozen array of permitted matchMethod strings.
        // isReconciliationResultSafe: accepts a future ReconciliationResult; returns { passed, blockedReasons }.
        RECONCILIATION_CONFIDENCE_LEVELS: RECONCILIATION_CONFIDENCE_LEVELS,
        MATCH_METHODS:                    MATCH_METHODS,
        isReconciliationResultSafe:       isReconciliationResultSafe,
        // PR-184: UID reconciliation read-only builder. Pure function, no UI, no storage.
        // Never reads window.units — caller must supply a pre-copied liveUnitsSnapshot.
        // Returns { passed, result: ReconciliationResult|null, blockedReasons, warnings }.
        reconcileUidReferences:           reconcileUidReferences,
        // PR-186: Apply candidate type guard. Pure function, no UI, no mutation, no storage.
        // APPLY_MODE_VALUES: frozen array — only permitted value is 'operator_controlled'.
        // isApplyCandidateSafe: accepts a future ApplyCandidate; returns { passed, blockedReasons }.
        APPLY_MODE_VALUES:                APPLY_MODE_VALUES,
        isApplyCandidateSafe:             isApplyCandidateSafe,
        // PR-187: Apply candidate builder. Pure function, not wired to UI, no storage.
        // Re-runs Gates 2–6 before building. operatorConfirmed/liveMutationPlanned/
        // backendCommitPlanned hard-locked false at construction. Gate 7 sets them in future PR.
        // Returns { passed, candidate|null, blockedReasons, warnings }.
        buildApplyCandidate:              buildApplyCandidate,
        // PR-191: Apply confirmation type guard. Pure function, no UI, no mutation, no storage.
        // APPLY_CONFIRMATION_MODE_VALUES: frozen array — only permitted value is 'operator_two_step'.
        // isApplyConfirmationSafe: accepts a future ApplyConfirmation; returns { passed, blockedReasons }.
        APPLY_CONFIRMATION_MODE_VALUES:   APPLY_CONFIRMATION_MODE_VALUES,
        isApplyConfirmationSafe:          isApplyConfirmationSafe,
        // PR-192: Apply confirmation builder. Pure function, not wired to UI, no storage.
        // step2Complete hard-locked false at construction — Gate 7 Step 2 handler sets it in future PR.
        // Returns { passed, confirmation|null, blockedReasons, warnings }.
        buildApplyConfirmation:           buildApplyConfirmation,
        // PR-196: Live units snapshot type guard. Pure function. No window.units read.
        // No mutation. No storage.
        // isLiveUnitsSnapshotSafe: validates a future LiveUnitsSnapshot; returns { passed, blockedReasons }.
        isLiveUnitsSnapshotSafe:          isLiveUnitsSnapshotSafe,
        // PR-197: Live units snapshot builder. Pure function. Caller supplies units array.
        // No window.units read inside function. No storage. No mutation of originals.
        // Self-checks with isLiveUnitsSnapshotSafe before returning.
        // Returns { passed, snapshot|null, blockedReasons, warnings }.
        buildLiveUnitsSnapshot:           buildLiveUnitsSnapshot,
        // PR-199: Preview reconciliation with snapshot. Pure helper. Not wired to diagnostics.
        // Validates snapshot with isLiveUnitsSnapshotSafe, then passes snapshot.units to
        // reconcileUidReferences. No window.units read. No storage. No mutation.
        // Returns { passed, rrResult|null, blockedReasons, warnings }.
        previewReconciliationWithSnapshot: previewReconciliationWithSnapshot,
        // PR-202: Operator identity type guard. Pure function. No identity creation.
        // No storage. No UI. options.mode: "diagnostics" (default) or "live".
        // Returns { passed, blockedReasons, warnings }.
        isOperatorIdentitySafe:            isOperatorIdentitySafe,
        // PR-207: Staging state type guard. Pure function. No staging state creation.
        // No storage. No UI. options.identityMode: "diagnostics" (default) or "live".
        // options.context: "reset_verification" for cleared-state verification.
        // Returns { passed, blockedReasons, warnings }.
        isStagingStateSafe:                isStagingStateSafe,
        // PR-211: Scenario step preview builder. Pure function. No DOM. No map.
        // No window.units. No window.RmoozScenario. No storage. No network.
        // buildScenarioStepPreview(fixture, stepRef, options?)
        // stepRef: step_id string | stepIndex number | step object with step_id.
        // Returns { passed, preview|null, blockedReasons, warnings }.
        buildScenarioStepPreview:          buildScenarioStepPreview,
        // PR-212 / PR-217: Paint the dry-run preview panel.
        // Default (no arg): AMBER RIDGE Step 1. Override (previewOverride arg): any safe preview.
        // previewOverride must have readOnly:true and liveMutationAllowed:false.
        // No map. No window.units. No global storage. No live mutation.
        paintDryRunPreview:                paintDryRunPreview,
        // PR-217: Wargame 3 console paint helper. Chains previewWargame3Fixture → paintDryRunPreview.
        // No file loading. No fetch. No global storage. No map. No window.units.
        // paintWargame3Preview(w3json, stepRef?)  stepRef defaults to "W3-STEP-00".
        // Returns harness result for console inspection.
        paintWargame3Preview:              paintWargame3Preview,
        // PR-215: Wargame 3 fixture adapter. Pure function. No DOM. No map.
        // No window.units. No window.RmoozScenario. No storage. No network.
        // adaptWargame3ToFixture(w3json, options?)
        // Returns { passed, fixture|null, blockedReasons, warnings }.
        // Fixture is deep-frozen. w3json is never mutated.
        adaptWargame3ToFixture:            adaptWargame3ToFixture,
        // PR-216: Wargame 3 dry-run preview harness. Console-only.
        // Chains adaptWargame3ToFixture → buildScenarioStepPreview.
        // No global storage. No UI mutation. No map. No window.units.
        // previewWargame3Fixture(w3json, stepRef?)
        // stepRef defaults to "W3-STEP-00". Returns { passed, fixture, preview, blockedReasons, warnings }.
        previewWargame3Fixture:            previewWargame3Fixture,
        // PR-218: Wargame 3 step navigation preview. Console-only.
        // Computes nextStepRef from currentStepRef + delta, paints preview, returns navigation envelope.
        // Does NOT mutate window.RmoozScenario.stepIndex. No global state. No fetch. No storage.
        // stepWargame3Preview(w3json, currentStepRef?, delta?)
        //   currentStepRef: "W3-STEP-NN" | numeric index | null → defaults to 0
        //   delta: integer (default 1). Clamped to keep nextStepIndex in [0, 16].
        // Returns { passed, fixture, preview, blockedReasons, warnings,
        //           nextStepRef, nextStepIndex, atStart, atEnd }.
        stepWargame3Preview:               stepWargame3Preview,
        // PR-226: Wargame 3 Manual Source Helper. Console-only.
        // Reads window.RmoozScenario.scenario (read-only). Builds a safe deep-copy
        // w3json for paintWargame3Preview(). No DOM. No map. No window.units.
        // No storage. No network. Source is never mutated.
        // buildW3PreviewFromLoadedScenario(options?)
        //   options.validate (default true): run adaptWargame3ToFixture after build.
        // Returns { passed, w3json, blockedReasons, warnings }.
        buildW3PreviewFromLoadedScenario:  buildW3PreviewFromLoadedScenario,
        // PR-241/245: Read-Only Map Overlay Data type guard. Pure function. No DOM. No map.
        // No window.units. No window.RmoozScenario. No storage. No network.
        // isWargame3ReadOnlyMapOverlayDataSafe(overlay)
        // Checks overlayType, source, readOnly, liveMutationAllowed, array fields
        // (markers, objectiveHighlights, effectHints, movementTrails, warnings, blockedReasons),
        // and absence of unsafe mutation/action keys at top level and in all nested items.
        // Returns { passed, blockedReasons }.
        isWargame3ReadOnlyMapOverlayDataSafe: isWargame3ReadOnlyMapOverlayDataSafe,
        // PR-241/245: Read-Only Map Overlay Data Builder. Pure function. No DOM. No map.
        // No window.units. No window.RmoozScenario. No storage. No network.
        // buildWargame3ReadOnlyMapOverlayData(preview, options?)
        //   options.previousPreview: prior-step preview for movement trail delta (PR-245).
        // Converts a safe W3 dry-run preview object into overlay data.
        // Markers capped at 12. Coordinates never invented — lat/lon remain null when absent.
        // Movement trails only emitted when from ≠ to and both endpoints are finite.
        // Self-checked with isWargame3ReadOnlyMapOverlayDataSafe before returning.
        // Returns { passed, overlay|null, blockedReasons, warnings }.
        buildWargame3ReadOnlyMapOverlayData: buildWargame3ReadOnlyMapOverlayData,
        // PR-246: Wargame 3 Step Coordinate Delta Audit. Console-only diagnostic.
        // auditWargame3StepCoordinateDeltas(w3json, options?)
        // Audits raw W3 source coordinate fields (blue/red_unit_step_coords, _prev variants),
        // the adaptWargame3ToFixture output, and per-step buildScenarioStepPreview output
        // to identify why movementTrails are empty.
        // Reports: source delta counts, adapter delta counts, per-unit and per-step-pair analysis,
        // root cause findings, and PR-247 fix recommendation.
        // No window.units. No window.lines. No window.RmoozScenario mutation.
        // No map paint. No fetch. No storage. No backend. No AI. No simulation. No journal.
        // No Gate 7/apply/commit/confirm/execute.
        // Returns { passed, scenarioId, stepCount, unitCount, unitsWithAnyCoordinates,
        //           unitsWithStepCoordinateArrays, unitsWithCoordinateDeltas,
        //           totalCoordinateSamples, totalDeltaPairs, totalStaticPairs,
        //           sourceFieldFindings[], adapterFindings[], units[], stepPairs[],
        //           blockedReasons[], warnings[] }.
        auditWargame3StepCoordinateDeltas: auditWargame3StepCoordinateDeltas,
        // PR-249: Wargame 3 Movement Trail Coverage Audit. Console-only diagnostic.
        // auditWargame3MovementTrailCoverage(w3json, options?)
        // Measures read-only movement trail coverage across all 16 step transitions (N-1→N).
        // Runs after PR-247 fixed per-step coordinate propagation.
        // options.paint  (default false): if true, paints only options.stepRef overlay.
        // options.stepRef: required when paint===true; no default painting otherwise.
        // No window.units. No window.lines. No window.RmoozScenario mutation.
        // No fetch. No storage. No backend. No AI. No simulation. No journal.
        // No Gate 7/apply/commit/confirm/execute.
        // Returns { passed, scenarioId, stepCount, transitionCount, transitionsWithTrails,
        //           transitionsWithoutTrails, totalMovementTrails, maxTrailsInTransition,
        //           averageTrailsPerTransition, markerTotal, effectHintTotal,
        //           sideBreakdown, transitions[], bestTransitions[], clutteredTransitions[],
        //           quietTransitions[], blockedReasons[], warnings[] }.
        auditWargame3MovementTrailCoverage: auditWargame3MovementTrailCoverage,
        // PR-244/245: Wargame 3 Map Preview Coverage Audit. Console-only diagnostic helper.
        // auditWargame3MapPreviewCoverage(w3json, options?)
        // Adapts w3json once, then iterates every step via buildScenarioStepPreview +
        // buildWargame3ReadOnlyMapOverlayData (with previous-step delta for PR-245 trails).
        // Reports coordinate coverage and trail counts per step.
        // options.paint (default false): if true, paints only options.stepRef via the
        // existing read-only overlay hook — does NOT auto-paint all steps.
        // No window.units. No window.lines. No window.RmoozScenario mutation.
        // No fetch. No storage. No backend. No AI. No simulation. No journal.
        // Returns { passed, scenarioId, stepCount, drawableStepCount, nonDrawableStepCount,
        //           totalMarkers, totalDrawableMarkers, totalSkippedMarkers,
        //           totalObjectiveHighlights, totalEffectHints, totalMovementTrails,
        //           steps[], blockedReasons, warnings }.
        auditWargame3MapPreviewCoverage:          auditWargame3MapPreviewCoverage,
        // PR-243/245: Wargame 3 Preview Map Overlay Bridge. Internal + console helper.
        // paintWargame3PreviewMapOverlayFromPreview(preview)
        // Chains buildWargame3ReadOnlyMapOverlayData → paintWargame3ReadOnlyMapOverlay.
        // Validates preview is W3-STEP before proceeding; clears overlay if not.
        // PR-245: computes previousPreview from _drpPreviewSource (step N-1) and passes
        // it to buildWargame3ReadOnlyMapOverlayData for movement trail delta calculation.
        // Called automatically from _paintToDOM on every W3 preview render.
        // No window.units. No window.lines. No window.RmoozScenario mutation.
        // No fetch. No storage. No backend. No apply/commit/Gate 7.
        // Returns { passed, painted, markerCount, objectiveHighlightCount, effectHintCount, movementTrailCount, skippedCount, blockedReasons, warnings }.
        paintWargame3PreviewMapOverlayFromPreview: paintWargame3PreviewMapOverlayFromPreview,
        // PR-242/245: Wargame 3 Read-Only Map Overlay Paint Hook.
        // paintWargame3ReadOnlyMapOverlay(overlay, options?)
        // Paints temporary read-only preview markers/highlights/trails from a PR-241
        // overlay object onto a private L.layerGroup. Validates with
        // isWargame3ReadOnlyMapOverlayDataSafe first. Clears previous preview layer
        // before painting. Only paints items with hasCoordinate === true.
        // PR-245: paints movementTrails as L.polyline (dashed, side-colored).
        // Never invents coordinates. Never touches window.units, window.lines,
        // window.RmoozScenario, or any live scenario/unit layer.
        // Effect hints counted but not painted (no safe coordinates yet).
        // Returns { passed, painted, markerCount, objectiveHighlightCount, effectHintCount, movementTrailCount, skippedCount, blockedReasons, warnings }.
        paintWargame3ReadOnlyMapOverlay:     paintWargame3ReadOnlyMapOverlay,
        // PR-242: Wargame 3 Read-Only Map Overlay Clear.
        // clearWargame3ReadOnlyMapOverlay()
        // Removes only the private preview layer created by paintWargame3ReadOnlyMapOverlay.
        // Does NOT remove live unit markers, lines, scenario layers, or other map layers.
        // Safe to call repeatedly. Returns { passed, cleared, blockedReasons, warnings }.
        clearWargame3ReadOnlyMapOverlay:     clearWargame3ReadOnlyMapOverlay,
        // PR-250: Wargame 3 Read-Only Map Focus Bounds Builder. Pure function. No DOM. No map.
        // No window.units. No window.lines. No window.RmoozScenario. No storage. No network.
        // buildWargame3PreviewMapFocusBounds(overlay, options?)
        // Validates overlay with isWargame3ReadOnlyMapOverlayDataSafe, then collects
        // drawable coordinates from markers, objectiveHighlights, and movementTrail
        // endpoints. effectHints and warnings are never used as coordinate sources.
        // Returns { passed, hasBounds, pointCount, bounds{south,west,north,east}|null,
        //           center{lat,lon}|null, sourceCounts{markers,objectives,
        //           movementTrailEndpoints}, blockedReasons, warnings }.
        buildWargame3PreviewMapFocusBounds:  buildWargame3PreviewMapFocusBounds,
        // PR-250: Wargame 3 Read-Only Map Focus Helper. Manual/console-only. No auto-pan.
        // focusWargame3PreviewMapBounds(overlay, options?)
        // Calls buildWargame3PreviewMapFocusBounds, then optionally calls
        // window.map.fitBounds ONLY when options.apply === true. Default: no pan.
        // Never creates markers/layers. Never mutates scenario/units/lines/stepIndex.
        // No fetch, no storage, no backend, no AI, no simulation, no journal.
        // No Gate 7/apply/commit/confirm/execute controls.
        // Returns { passed, focused, focusResult, blockedReasons, warnings }.
        focusWargame3PreviewMapBounds:       focusWargame3PreviewMapBounds,
        // PR-251: Wargame 3 Map Preview Operational Readiness Report. Console-only.
        // buildWargame3MapPreviewReadinessReport(w3json, options?)
        // Combines auditWargame3MapPreviewCoverage, auditWargame3StepCoordinateDeltas,
        // auditWargame3MovementTrailCoverage, and buildWargame3PreviewMapFocusBounds
        // into a single readiness summary answering: are markers/trails/bounds ready
        // for practical walkthrough testing? What gaps remain? What is the next PR?
        // readiness: "ready_for_walkthrough" | "needs_review" | "blocked"
        // No window.units. No window.lines. No window.RmoozScenario mutation.
        // No map paint. No fitBounds. No fetch. No storage. No backend.
        // No AI. No simulation. No journal. No Gate 7/apply/commit/confirm/execute.
        // Returns { passed, readiness, scenarioId, summary, strongestSteps,
        //           strongestTransitions, quietTransitions, remainingGaps, blockers,
        //           recommendedNextPR, sourceReports, blockedReasons, warnings }.
        buildWargame3MapPreviewReadinessReport: buildWargame3MapPreviewReadinessReport,
        // PR-252: Wargame 3 Objective Coordinate Source Audit. Console-only.
        // auditWargame3ObjectiveCoordinateSources(w3json, options?)
        // Inspects all W3 data fields to identify objective coordinate sources.
        // W3 has one primary objective (w3json.obj) with coord [lon, lat].
        // PR-252 fixes the pipeline so this coordinate flows through the preview
        // stack into overlay.objectiveHighlights[0].lat/lon/hasCoordinate.
        // No window.units. No window.lines. No window.RmoozScenario mutation.
        // No map paint. No fitBounds. No invented coordinates. No range circles.
        // No fetch. No storage. No backend. No AI. No simulation. No journal.
        // No Gate 7/apply/commit/confirm/execute.
        // Returns { passed, scenarioId, objectiveCount,
        //           objectivesWithDirectCoordinates, objectivesWithMappedCoordinates,
        //           objectivesMissingCoordinates, candidateSourceFields[],
        //           objectives[], blockedReasons[], warnings[] }.
        auditWargame3ObjectiveCoordinateSources: auditWargame3ObjectiveCoordinateSources,
        // PR-259: Wargame 3 Decision/Result type guards. Pure functions. No DOM. No map.
        // No window.units. No window.RmoozScenario. No storage. No network. No mutation.
        // isWargame3SelectedDecisionSafe(value, options?)
        //   Returns { passed, blockedReasons, warnings }.
        //   Accepts: non-empty string (not a forbidden status token) or structured object
        //   with { id, label, description, source, selectedAt, selectedBy, optionRef,
        //   confidence, readOnly:true }. Forbidden tokens: DORMANT THREATENED CONTESTED
        //   DENIED ACTIVE COMPLETE SUCCESS FAILURE. Rejects all unsafe mutation fields.
        isWargame3SelectedDecisionSafe:   isWargame3SelectedDecisionSafe,
        // PR-259: isWargame3ExpectedResultSafe(value, options?)
        //   Returns { passed, blockedReasons, warnings }.
        //   Accepts: non-empty string (not a forbidden status token) or structured object
        //   with { id, label, description, source, resultType, linkedDecisionId,
        //   confidence, readOnly:true }. Same forbidden tokens as above. objective_status_baseline
        //   must NOT be the source of this value — enforced by validateWargame3DecisionResultPair.
        isWargame3ExpectedResultSafe:     isWargame3ExpectedResultSafe,
        // PR-259: isWargame3DecisionOptionSafe(value, options?)
        //   Returns { passed, blockedReasons, warnings }.
        //   Validates a COA option object: required { id, label, readOnly:true },
        //   optional arrays { affectedUnits, expectedEffects, risks },
        //   source: "source_json"|"instructor". Rejects unsafe mutation fields.
        isWargame3DecisionOptionSafe:     isWargame3DecisionOptionSafe,
        // PR-259: validateWargame3DecisionResultPair(step, options?)
        //   Returns { passed, blockedReasons, warnings,
        //     selectedDecisionStatus:{present,passed}, expectedResultStatus:{present,passed},
        //     previewCompleteEligible }.
        //   Validates selectedDecision + expectedResult on a step object together.
        //   Blocks if objective_status_baseline is copied to expectedResult.
        //   Blocks if enemyCounterActions is absent/empty.
        //   previewCompleteEligible: true only when all three pass.
        //   Does NOT set step.previewComplete — wire-up deferred to future PR.
        validateWargame3DecisionResultPair: validateWargame3DecisionResultPair,
        // PR-263: Wargame 3 Decision Options Preview Adapter. Pure function.
        // No DOM. No map. No window.units. No window.RmoozScenario. No storage.
        // No network. No mutation. No selectedDecision. No expectedResult.
        // No previewComplete change.
        // buildWargame3DecisionOptionsPreviewData(step, options?)
        //   Validates step.decisionOptions[] with isWargame3DecisionOptionSafe.
        //   Returns display-safe read-only COA data for future preview UI.
        //   displayMode: "read_only" when valid options exist; "hidden" otherwise.
        //   Returns { passed, options[], blockedOptions[], optionCount,
        //     validOptionCount, blockedOptionCount, hasOptions, displayMode,
        //     warnings[], blockedReasons[] }.
        //   Each item in options[]: { id, label, description, intent, source,
        //     readOnly:true, affectedUnitsCount, expectedEffectsCount, risksCount,
        //     affectedUnits[], expectedEffects[], risks[], priority,
        //     displayIndex, displayLabel }.
        buildWargame3DecisionOptionsPreviewData: buildWargame3DecisionOptionsPreviewData,
        // PR-264: Read-Only Decision Options Painter (DOM; W3 only).
        // Returns undefined. No apply. No mutation. No map. No fetch. No storage.
        _paintW3DecisionOptions:                 _paintW3DecisionOptions,
        // PR-267: Read-Only Operator Selection Dry-Run Review Painter (DOM; W3 only).
        // Returns undefined. No apply. No mutation. No map. No fetch. No storage.
        // No buttons/inputs/controls. No expectedResult. No previewComplete change.
        // Hidden unless p.operatorSelectionDryRunRecord passes the record guard.
        _paintW3OperatorSelectionReview:         _paintW3OperatorSelectionReview,
        // PR-268: COA dry-run review click handler (exported for source verification tests)
        _handleW3CoaReviewClick:                 _handleW3CoaReviewClick,
        // PR-270: Preview-local COA review memory helpers (exported for source verification tests).
        // NOTE: _w3CoaReviewRecord itself is NOT exported — it is IIFE-private only.
        // Clear: sets module-private memory to null. No DOM. No storage. No backend.
        // Get: returns stored record for exact step if valid; null otherwise.
        _clearW3CoaReviewRecord:         _clearW3CoaReviewRecord,
        _getW3CoaReviewRecordForStep:    _getW3CoaReviewRecordForStep,
        // PR-271: COA under review indicator painter (exported for source verification tests).
        // Reads preview-local dry-run record only. No apply. No mutation. No Gate 7.
        // DOM chip: #sw-drp-sum-coa-chip. Label only — no unsafe fields.
        _paintW3CoaUnderReviewIndicator: _paintW3CoaUnderReviewIndicator,
        // PR-272: Clear COA review click handler (exported for source verification tests).
        // Clears preview-local memory + hides review section + hides chip.
        // No storage. No backend. No map. No step navigation. No Gate 7.
        _handleW3CoaReviewClearClick:    _handleW3CoaReviewClearClick,
        // PR-266: Wargame 3 Operator Selection Dry-Run Record Helpers.
        // Pure functions. No DOM. No map. No storage. No network. No mutation.
        // No expectedResult. No previewComplete change. No apply/commit/Gate 7.
        //
        // isWargame3OperatorSelectionDryRunRecordSafe(record, options?)
        //   Returns { passed, blockedReasons[], warnings[] }.
        //   Validates dry-run selection record shape, safety flags, cross-references,
        //   forbidden fields (expectedResult, previewComplete), unsafe fields (12),
        //   selectedDecision via isWargame3SelectedDecisionSafe, and sourceOption via
        //   isWargame3DecisionOptionSafe.
        //
        // buildWargame3OperatorSelectionDryRunRecord(step, optionId, options?)
        //   Returns { passed, record|null, blockedReasons[], warnings[] }.
        //   Builds a safe dry-run selection record from a validated decisionOptions item.
        //   options.operatorId (string|omit), options.createdAt (string|omit),
        //   options.status ("draft"|"selected_for_review"|"cancelled", default "draft").
        //   record shape: { id, stepRef, optionRef, selectedDecision, sourceOption,
        //     status, dryRunOnly:true, liveMutationAllowed:false,
        //     backendCommitAllowed:false, createdAt, createdBy }.
        isWargame3OperatorSelectionDryRunRecordSafe:
                                         isWargame3OperatorSelectionDryRunRecordSafe,
        buildWargame3OperatorSelectionDryRunRecord:
                                         buildWargame3OperatorSelectionDryRunRecord,
        // PR-269: Wargame 3 Decision Options Fixture Overlay.
        // Pure function. No DOM. No map. No storage. No network. No mutation of the frozen fixture.
        // Returns { passed, fixture (new copy), appliedStepRefs[], rejectedStepRefs[],
        //           blockedReasons[], warnings[] }.
        // Default overlayMap is W3_DECISION_OPTIONS_FIXTURE_OVERLAY (3 options for W3-STEP-08).
        // Call with no second argument to apply the default instructor-provided COA options.
        W3_DECISION_OPTIONS_FIXTURE_OVERLAY:         W3_DECISION_OPTIONS_FIXTURE_OVERLAY,
        applyWargame3DecisionOptionsFixtureOverlay:  applyWargame3DecisionOptionsFixtureOverlay,
        // PR-273: Wargame 3 Expected Result Source Layer.
        // Pure functions + frozen source constant. No DOM. No map. No storage. No network.
        // No mutation. No UI. No apply. No execute. No commit. No Gate 7. No simulation.
        // previewComplete remains false. selectedDecision remains only inside the dry-run record.
        // expectedEffects, objective_status_baseline, proposedVisualEffects are NOT used.
        //
        // W3_EXPECTED_RESULT_FIXTURE_SOURCE — frozen object keyed by stepRef → optionRef.
        //   Instructor-defined expected result candidates for W3-STEP-08
        //   (OPT-HOLD, OPT-REINFORCE, OPT-DELAY).
        //
        // getWargame3ExpectedResultForReview(record, options?)
        //   Validates record, looks up source, copies entry, validates copy,
        //   cross-checks linkedDecisionId + linkedOptionRef + readOnly + source.
        //   Returns { passed, expectedResult: object|null, blockedReasons[], warnings[] }.
        //   Does NOT attach expectedResult to preview, step, or global state.
        //
        // hasWargame3ExpectedResultForReview(record)
        //   Returns { passed, available, stepRef, optionRef, blockedReasons[], warnings[] }.
        //   Uses getWargame3ExpectedResultForReview internally — no mutation.
        W3_EXPECTED_RESULT_FIXTURE_SOURCE:           W3_EXPECTED_RESULT_FIXTURE_SOURCE,
        getWargame3ExpectedResultForReview:          getWargame3ExpectedResultForReview,
        hasWargame3ExpectedResultForReview:          hasWargame3ExpectedResultForReview,
        // PR-275: W3 Scenario Review Session Navigation Sync.
        // Module-private _w3ScenarioReviewSession (NOT exported — IIFE-private).
        // Synced by _updateW3ScenarioReviewSession on every _paintToDOM W3 render,
        // after each Review COA click, and after each Clear review click.
        // getW3ScenarioReviewSession() — public accessor; returns a shallow copy.
        // _updateW3ScenarioReviewSession(preview, options?) — exported for tests only.
        // _clearW3ScenarioReviewSession() — exported for tests only.
        getW3ScenarioReviewSession:           getW3ScenarioReviewSession,
        _updateW3ScenarioReviewSession:       _updateW3ScenarioReviewSession,
        _clearW3ScenarioReviewSession:        _clearW3ScenarioReviewSession,
        // PR-277: W3 Scenario Workflow State.
        // Module-private _w3ScenarioWorkflowState (NOT exported — IIFE-private).
        // Higher-level than the review session; tracks full W3 workflow breadcrumbs.
        // Synced after every _updateW3ScenarioReviewSession call.
        // No expectedResult. previewComplete always false. No storage. No backend.
        //
        // buildW3ScenarioWorkflowStateFromSession(session, previousState, options?)
        //   Pure builder. Returns { passed, workflow:object|null, blockedReasons[], warnings[] }.
        //   workflow shape: { workflowType, source, readOnly, dryRunOnly,
        //     liveMutationAllowed, backendCommitAllowed, scenarioId, scenarioName,
        //     activeStepRef, activeStepIndex, totalSteps,
        //     visitedStepRefs[], visitedCount,
        //     decisionReview:{active,stepRef,optionRef,label,status},
        //     availableDecisionSteps[], availableDecisionStepCount,
        //     workflowFlags:{hasLoadedScenario,hasNavigated,hasDecisionOptions,
        //       hasActiveReview,expectedResultAttached:false,previewComplete:false},
        //     lastUpdatedStepRef }.
        // getW3ScenarioWorkflowState() — public accessor; returns a shallow copy.
        // _updateW3ScenarioWorkflowStateFromCurrentSession() — exported for tests.
        // _clearW3ScenarioWorkflowState() — exported for tests.
        buildW3ScenarioWorkflowStateFromSession:          buildW3ScenarioWorkflowStateFromSession,
        getW3ScenarioWorkflowState:                       getW3ScenarioWorkflowState,
        _updateW3ScenarioWorkflowStateFromCurrentSession: _updateW3ScenarioWorkflowStateFromCurrentSession,
        _clearW3ScenarioWorkflowState:                    _clearW3ScenarioWorkflowState,
        // PR-274: Wargame 3 Scenario Review Session State Builder.
        // Pure function. No DOM. No map. No storage. No network. No mutation.
        // No UI. No apply. No execute. No commit. No Gate 7. No simulation.
        // No expectedResult wiring. previewComplete: false always.
        // selectedDecision remains only inside the dry-run record.
        //
        // buildWargame3ScenarioReviewSessionState(preview, options?)
        //   preview — W3 dry-run preview object (from buildScenarioStepPreview).
        //   options.overlay — optional read-only map overlay for count summary.
        //   Returns { passed, session: object|null, blockedReasons[], warnings[] }.
        //   session shape: { sessionType, source, readOnly, dryRunOnly,
        //     liveMutationAllowed, backendCommitAllowed, scenarioId, scenarioName,
        //     stepRef, stepIndex, totalSteps, objectiveStatus,
        //     decisionOptionsAvailable, decisionOptionCount,
        //     reviewedCoa:{available,optionRef,label,status},
        //     expectedResultAttached:false, previewComplete:false,
        //     mapOverlaySummary:{markerCount,movementTrailCount,
        //       objectiveHighlightCount,warningCount},
        //     warningSummary:{warningCount,warningCodes[]} }.
        buildWargame3ScenarioReviewSessionState: buildWargame3ScenarioReviewSessionState,
        // PR-278: Wargame 3 Scenario Workflow Walkthrough Runner.
        // Pure in-memory runner. No DOM. No map. No storage. No backend. No network.
        // No window.RmoozScenario. No window.units. No mutation. No expectedResult.
        // previewComplete always false. selectedDecision only inside dry-run record.
        // Default updateLiveState:false — pure, does not touch _w3ScenarioWorkflowState.
        //
        // runWargame3ScenarioWorkflowWalkthrough(previewSource, options?)
        //   previewSource — adapted fixture (readOnly:true + steps[]) or raw W3 JSON.
        //   options.reviewFirstAvailable  boolean (default true) — run review/clear cycle.
        //   options.maxSteps              number — cap number of steps walked.
        //   options.startStepRef          string — start from this step ref.
        //   options.stopStepRef           string — stop at this step ref (inclusive).
        //   options.includeWarnings       boolean (default true).
        //   options.updateLiveState       boolean (default false).
        //   Returns { passed, walkthrough:object|null, blockedReasons[], warnings[] }.
        //   walkthrough shape: { walkthroughType, source, readOnly, dryRunOnly,
        //     liveMutationAllowed, backendCommitAllowed, scenarioId, scenarioName,
        //     totalSteps, visitedStepRefs[], visitedCount,
        //     availableDecisionSteps[], availableDecisionStepCount,
        //     reviewedCoaTest:{attempted,stepRef,optionRef,label,recordSafe,cleared},
        //     safetyFlags:{expectedResultAttached:false,previewComplete:false,...},
        //     finalStepRef, completedWalkthrough }.
        runWargame3ScenarioWorkflowWalkthrough: runWargame3ScenarioWorkflowWalkthrough,
        // PR-279: Wargame 3 Scenario Workflow Acceptance Check.
        // Pure in-memory acceptance checker. No DOM. No map. No storage. No backend.
        // No mutation. No expectedResult. previewComplete always false.
        // selectedDecision only inside dry-run record. checkedAt always null.
        //
        // checkWargame3ScenarioWorkflowAcceptance(previewSource, options?)
        //   previewSource — adapted fixture (readOnly:true + steps[]) or raw W3 JSON.
        //   options — passed through to runWargame3ScenarioWorkflowWalkthrough.
        //   Returns { passed, acceptanceResult:object|null, blockedReasons[], warnings[] }.
        //   acceptanceResult shape: { acceptanceType, source, readOnly, dryRunOnly,
        //     liveMutationAllowed, backendCommitAllowed, scenarioId, scenarioName,
        //     requiredStepCount, visitedStepCount, allStepsVisited,
        //     requiredDecisionStepRefs[], detectedDecisionStepRefs[],
        //     decisionStepCoveragePassed,
        //     reviewCycle:{attempted,passed,stepRef,optionRef,recordSafe,cleared},
        //     safetyChecks:{expectedResultAttached:false,previewComplete:false,
        //       liveMutationAllowed:false,backendCommitAllowed:false,
        //       selectedDecisionOnlyInsideDryRunRecord:true},
        //     readiness:'accepted_for_next_phase'|'blocked',
        //     nextPhase:'scenario_import_adapter_layer'|'workflow_stabilization',
        //     checkedAt:null }.
        checkWargame3ScenarioWorkflowAcceptance: checkWargame3ScenarioWorkflowAcceptance,
        // PR-280: External Scenario Catalog Builder.
        // Pure catalog builder — no file reading, no fetch, no parsing, no DOM.
        // No map. No storage. No backend. No W3 workflow. No live scenario. No mutation.
        // No adaptWargame3ToFixture. No previewWargame3Fixture.
        // No expectedResult. No previewComplete. No selectedDecision.
        //
        // buildExternalScenarioCatalog(sourceManifest, options?)
        //   sourceManifest — plain object with sourceKind, sourceName, files[].
        //   Returns { passed, catalog:object|null, blockedReasons[], warnings[] }.
        //
        // summarizeExternalScenarioCatalog(catalog)
        //   catalog — result of buildExternalScenarioCatalog.
        //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
        //   summary.importMode: 'catalog_only'.
        //   summary.nextRecommendedAction: 'human_review'.
        buildExternalScenarioCatalog:     buildExternalScenarioCatalog,
        summarizeExternalScenarioCatalog: summarizeExternalScenarioCatalog,
        // PR-280B: Single External Scenario Catalog Entry — smoke-test helper.
        // Pure.  No .scen parsing.  No .ini metadata.  No Lua execution.
        // No DOM.  No map.  No storage.  No backend.  No mutation.
        // No adaptWargame3ToFixture.  No previewWargame3Fixture.
        // No expectedResult.  No previewComplete.  No selectedDecision.
        //
        // buildSingleExternalScenarioCatalogEntry(sourceManifest, selectorOrOptions?)
        //   sourceManifest — PR-280A external_scenario_source_manifest object.
        //   selectorOrOptions — { scenarioId?, title?, path?,
        //     preferHighConfidence? (default true), avoidLua? (default true),
        //     requireXlsxMatch? (default false) }
        //   Returns { passed, entry:object|null, blockedReasons[], warnings[] }.
        //   entry.entryType: 'external_scenario_catalog_entry'.
        //   entry.importStatus: 'catalog_entry_only'.
        //   entry.luaExecutionBlocked: true (always).
        //   entry.scenBinaryParsed: false (always).
        //   entry.iniTreatedAsMetadata: false (always).
        //   entry.safetyFlags: { expectedResultAttached:false, previewComplete:false,
        //     selectedDecisionAttached:false, liveMutationAllowed:false,
        //     backendCommitAllowed:false }.
        //
        // summarizeSingleExternalScenarioCatalogEntry(entry)
        //   entry — built by buildSingleExternalScenarioCatalogEntry.
        //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
        //   summary.importMode: 'single_catalog_entry_only'.
        //   summary.nextRecommendedAction: 'manual_preview_review'.
        buildSingleExternalScenarioCatalogEntry:   buildSingleExternalScenarioCatalogEntry,
        summarizeSingleExternalScenarioCatalogEntry: summarizeSingleExternalScenarioCatalogEntry,
        // PR-280C: Filtered/paginated external scenario catalog subset builder.
        // Pure.  No .scen parsing.  No .ini metadata.  No Lua execution.
        // No DOM.  No map.  No storage.  No backend.  No mutation.  No UI.
        // No adaptWargame3ToFixture.  No previewWargame3Fixture.
        // No expectedResult.  No previewComplete.  No selectedDecision.
        // Hard cap: at most 25 entries returned.
        //
        // buildExternalScenarioCatalogFromManifest(sourceManifest, options?)
        //   options: { limit?(≤25), offset?, campaignSeries?, confidence?,
        //     requireXlsxMatch?, avoidLua?(default true), includeLuaBlocked?,
        //     requireHtmlBriefing?, requireDocumentBriefing?,
        //     titleSearch?, sortBy?, sortDirection? }
        //   Returns { passed, catalog:object|null, blockedReasons[], warnings[] }.
        //   catalog.catalogType: 'external_scenario_catalog_subset'.
        //   catalog.entries[]: each entry is an external_scenario_catalog_entry.
        //   catalog.safetyFlags: all false (luaExecuted, scenBinaryParsed, etc.).
        //   catalog.warningSummary.warningCodes: may contain 'LIMIT_CLAMPED'.
        //
        // summarizeExternalScenarioCatalogSubset(catalog)
        //   catalog — built by buildExternalScenarioCatalogFromManifest.
        //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
        //   summary.importMode: 'catalog_subset_only'.
        //   summary.nextRecommendedAction: 'manual_subset_review'.
        buildExternalScenarioCatalogFromManifest:   buildExternalScenarioCatalogFromManifest,
        summarizeExternalScenarioCatalogSubset:     summarizeExternalScenarioCatalogSubset,
        // PR-281: External Scenario Preview Hook — DOM read-only panel.
        // paintExternalScenarioPreviewEntry(entry?) — renders entry into #sw-ext-preview-section.
        //   Omit argument to repaint from stored _extPreviewEntry.
        //   Passing null/wrong-type resets to empty state.
        // setExternalScenarioPreviewEntry(entry) — stores entry + calls paint.
        //   Returns { accepted:true } or { accepted:false, reason:string }.
        // SAFETY: No import button. No apply. No commit. No mutation. No storage.
        paintExternalScenarioPreviewEntry: paintExternalScenarioPreviewEntry,
        setExternalScenarioPreviewEntry:   setExternalScenarioPreviewEntry,
        // PR-282: External Scenario Catalog Selector.
        // setExternalScenarioCatalogSubset(catalog) — stores PR-280C catalog (deep-copy).
        //   Returns { passed, catalog, blockedReasons, warnings }.
        //   Validates: catalogType, readOnly, dryRunOnly, catalogOnly, previewOnly,
        //   liveMutationAllowed:false, backendCommitAllowed:false, entries.length ≤ 25.
        // getExternalScenarioCatalogSubset() — returns copy of stored catalog, or null.
        // clearExternalScenarioCatalogSubset() — clears stored catalog.
        //   Returns { passed:true, cleared:true }.
        // paintExternalScenarioCatalogSelector(catalogOrNull) — populates #sw-ext-select-control.
        //   Max 25 options. Disables select when null/empty.
        //   Option label: "TITLE — YEAR — AUTHOR". Option value: scenarioId.
        //   No Import/Apply/Run/Execute/Commit/Confirm/Approve/GoLive controls.
        // previewExternalScenarioCatalogSubsetFromManifest(sourceManifest, options?) —
        //   Builds capped subset from PR-280A manifest, stores+paints selector.
        //   Default options: { limit:10, avoidLua:true, sortBy:'scenarioId', sortDirection:'asc' }.
        //   autoPreviewFirst:true auto-selects first entry into PR-281 preview panel.
        //   Returns { passed, catalog, selectedEntry, blockedReasons, warnings }.
        // SAFETY: No import. No apply. No commit. No mutation. No storage. No fetch.
        //         No W3 state. No map. No Gate 7. No .scen parsing. No .ini metadata.
        //         No Lua execution. No expectedResult. No selectedDecision. No previewComplete.
        setExternalScenarioCatalogSubset:              setExternalScenarioCatalogSubset,
        getExternalScenarioCatalogSubset:              getExternalScenarioCatalogSubset,
        clearExternalScenarioCatalogSubset:            clearExternalScenarioCatalogSubset,
        paintExternalScenarioCatalogSelector:          paintExternalScenarioCatalogSelector,
        previewExternalScenarioCatalogSubsetFromManifest: previewExternalScenarioCatalogSubsetFromManifest,
        // PR-284: External Scenario Source Trace Inspector.
        // buildExternalScenarioSourceTrace(entry) — builds a read-only trace object.
        //   Returns { passed, trace:object|null, blockedReasons[], warnings[] }.
        //   trace.traceType: 'external_scenario_source_trace'.
        //   trace.policies: all safety flags (scenBinaryParsed:false, iniTreatedAsMetadata:false,
        //     iniPurpose:'weapon_patch_only', luaExecuted:false, luaExecutionBlocked:true, etc.).
        //   trace.readiness: catalogEntryOnly, metadataPreviewReady, conversionReady:false, etc.
        //   Warnings: LOW_CONFIDENCE, TITLE_FROM_FILENAME_ONLY, AUTHOR_MISSING,
        //             LUA_PRESENT_BLOCKED, NO_READABLE_BRIEFING_REFERENCE.
        //   Warnings are informational — do not block passed:true.
        // paintExternalScenarioSourceTrace(entryOrNull) — renders trace into #sw-ext-trace-body.
        //   Null/wrong-type shows empty state "No source trace available."
        //   Called automatically by paintExternalScenarioPreviewEntry via cascade.
        // SAFETY: No .scen parsing. No .ini metadata usage. No Lua execution. No map.
        //         No W3 state. No storage. No fetch. No Gate 7. No mutation.
        //         No expectedResult. No selectedDecision. No previewComplete.
        buildExternalScenarioSourceTrace: buildExternalScenarioSourceTrace,
        paintExternalScenarioSourceTrace:  paintExternalScenarioSourceTrace,
        // PR-285A: W3 Preview Unit Scope Label.
        // buildWargame3PreviewUnitScopeSummary(preview, options?) — pure helper.
        //   Returns { passed, summary:object|null, blockedReasons[], warnings[] }.
        //   summary.scopeType: 'engaged_preview_units_only'.
        //   summary.isWargame3: true for W3 previews only; non-W3 → summary:null.
        //   summary.shownUnits: preview.unitsReferenced.length.
        //   summary.totalUnits: _drpPreviewSource.units.length (fixture catalog).
        //   summary.capped: true if shownUnits > 12 (mirrors MAX_MARKERS).
        //   summary.fullOobShown: false always.
        //   summary.liveNavigatorRequiredForFullOob: true always.
        //   Warning TOTAL_UNITS_UNAVAILABLE when fixture catalog unavailable.
        // paintWargame3PreviewUnitScope(preview) — DOM paint.
        //   Hides #sw-drp-unit-scope for non-W3 fixtures.
        //   Shows "Engaged preview units only — N of T shown" for W3.
        //   No map read. No live state. No mutation.
        //   Called automatically by _paintW3StepSummary on every W3 render.
        buildWargame3PreviewUnitScopeSummary: buildWargame3PreviewUnitScopeSummary,
        paintWargame3PreviewUnitScope:        paintWargame3PreviewUnitScope,
        // PR-286L: Live Scenario Decision Action Baseline.
        // First production-oriented live decision selection layer.
        // Reads window.RmoozScenario only via existing live accessors.
        // No mutation of scenario. No backend. No commit. No apply. No auto-advance.
        // No dry-run. No W3 fixture data. No AMBER RIDGE. No external catalog.
        // No praSelection. No _w3CoaReviewRecord. No expectedResult. No previewComplete.
        //
        // getLiveScenarioIdentity() — pure read.
        //   Returns { scenarioId, scenarioLabel } from scenario.scenario_id / .id / .name.
        // getActiveLiveStepContext() — pure read of window.RmoozScenario.
        //   Returns { scenario, scenarioId, scenarioLabel, stepIndex, step, stepId,
        //             stepTitle, totalSteps }. All null when no scenario loaded.
        // extractLiveDecisionOptions(step) — pure normaliser.
        //   Searches step.decision_options | decisionOptions | options | coa_options | coaOptions.
        //   Returns { passed, options[], blockedReasons[], warnings[] }.
        //   Each option: { optionId, label, summary, sourceField, readOnly:true }.
        //   Never invents options. Never mutates step.
        // recordLiveOperatorSelection(optionId, options?) — stores + paints.
        //   Stores in _liveOperatorWorkflowState.selections[scenarioId::step-N].
        //   Appends event to _liveOperatorWorkflowState.events (capped at 64).
        //   Returns { passed, record|null, blockedReasons[], warnings[] }.
        //   record.recordType: 'live_operator_decision_selection'.
        //   record.readOnly:true, liveMutationAllowed:false, backendCommitAllowed:false,
        //   committed:false, applied:false.
        // clearLiveOperatorSelection(options?) — removes selection for current live step.
        //   Returns { passed, cleared, blockedReasons[], warnings[] }.
        // getLiveOperatorWorkflowState() — deep copy of internal state.
        // paintLiveDecisionActionCard() — DOM paint into #sw-live-decision-card.
        //   Empty state for no scenario. No-options state when step has no options.
        //   Renders one row per option. Shows selected option + clear button.
        //   Called automatically every refresh().
        getLiveScenarioIdentity:        getLiveScenarioIdentity,
        getActiveLiveStepContext:       getActiveLiveStepContext,
        extractLiveDecisionOptions:     extractLiveDecisionOptions,
        recordLiveOperatorSelection:    recordLiveOperatorSelection,
        clearLiveOperatorSelection:     clearLiveOperatorSelection,
        getLiveOperatorWorkflowState:   getLiveOperatorWorkflowState,
        paintLiveDecisionActionCard:    paintLiveDecisionActionCard,
        // PR-287L: Live Step Status Baseline.
        // getLiveStepKey(scenarioId, stepIndex) — pure key builder ("<scenarioId>::step-<i>").
        // getLiveStepStatus(stepIndex?) — returns the stored status record, or a synthesized
        //   { status:'pending', stored:false, source:'default' } default. Deep copy. Pure read.
        // setLiveStepStatus(status, options?) — status ∈ pending|decided|skipped|blocked.
        //   options.reason (string), options.stepIndex (number), options.decisionId (string).
        //   Stores in _liveOperatorWorkflowState.stepStatus["<scenarioId>::step-<i>"], appends
        //   a live_step_status_set event, repaints decision card + navigator + header.
        //   ANNOTATION ONLY: never mutates the scenario, never advances the step, never
        //   commits/applies/executes, no backend, no storage, no Gate 7. record.readOnly:true,
        //   liveMutationAllowed:false, backendCommitAllowed:false, committed:false, applied:false.
        //   Returns { passed, record|null, blockedReasons[], warnings[] }.
        //   blockedReasons: NO_ACTIVE_LIVE_STEP, INVALID_STATUS_VALUE.
        // clearLiveStepStatus(stepIndex?) — removes the status record (reverts to pending).
        //   Returns { passed, cleared, blockedReasons[], warnings[] }.
        // getLiveScenarioStatusSummary() — tallies status across all steps. Pure read.
        //   Returns { scenarioId, totalSteps, counts:{pending,decided,skipped,blocked},
        //             decidedCount, resolvedCount, pendingCount, steps[] }.
        // paintLiveStepStatusRow() — DOM paint into #sw-live-step-status-row.
        getLiveStepKey:                 getLiveStepKey,
        getLiveStepStatus:              getLiveStepStatus,
        setLiveStepStatus:              setLiveStepStatus,
        clearLiveStepStatus:            clearLiveStepStatus,
        getLiveScenarioStatusSummary:   getLiveScenarioStatusSummary,
        paintLiveStepStatusRow:         paintLiveStepStatusRow,
        // PR-288L: Live Operator Event Log (read-only tabular ops ledger).
        // getLiveOperatorEventLog() — derives ledger rows from
        //   _liveOperatorWorkflowState.events (the in-memory operator audit trail).
        //   Returns { count, cap, rows:[{dtg,severity,category,source,message,...}]
        //   newest-first, events:[raw chronological copy] }. Pure read.
        // clearLiveOperatorEventLog() — empties the in-memory events array and
        //   repaints. The ONLY writer. Returns { passed, cleared, clearedCount }.
        //   No backend. No storage. No scenario/unit/map mutation. No Gate 7.
        // paintLiveOperatorEventLog() — DOM paint into #sw-live-event-log-card
        //   as a DTG/Severity/Category/Source/Message table. NOT chat-style.
        getLiveOperatorEventLog:        getLiveOperatorEventLog,
        clearLiveOperatorEventLog:      clearLiveOperatorEventLog,
        paintLiveOperatorEventLog:      paintLiveOperatorEventLog,
        // PR-289L: Live Step Involved Units (read-only step context list).
        // getLiveStepInvolvedUnits(stepIndex?) — derives the units involved in a
        //   step from window.RmoozScenario.scenario: step.actors + step.affected,
        //   resolved against scenario OOB (red_units / blue_units_initial) for
        //   identity. Returns { stepIndex, count, counts:{total,acting,affected,both},
        //   units:[{uid,side,label,role,domain,involvement,resolved,readOnly}],
        //   warnings[] }. Pure read — no mutation, no backend, no adjudication,
        //   no casualty/damage numbers (involvement category only).
        // paintLiveStepInvolvedUnits() — DOM paint into #sw-live-step-units-card
        //   as a Unit/Side/Role/Domain/Involvement table for the active step.
        getLiveStepInvolvedUnits:       getLiveStepInvolvedUnits,
        paintLiveStepInvolvedUnits:     paintLiveStepInvolvedUnits,
        // PR-287L2: Live Scenario Workspace Consolidation.
        // paintLiveScenarioHeader() — reads window.RmoozScenario only.
        //   Paints scenario title, id, "Step N of T", phase, source into
        //   #sw-live-scenario-header. Safely no-ops if header DOM is absent.
        //   Called by refresh() and goToStep(). No mutation. No backend. No storage.
        // initSecondaryCardsToggle() — idempotently wires the collapsed
        //   #sw-secondary-cards-toggle button to show/hide #sw-secondary-cards-body.
        //   No data mutation. No storage. No backend.
        paintLiveScenarioHeader:        paintLiveScenarioHeader,
        // PR-287C: initLegacySummaryToggle() — idempotently wires the collapsed
        //   #sw-legacy-summary-toggle button to show/hide #sw-legacy-summary-body.
        //   No data mutation. No storage. No backend.
        initLegacySummaryToggle:        initLegacySummaryToggle,
        initSecondaryCardsToggle:       initSecondaryCardsToggle,
        // PR-286L0: Live Scenario Import Baseline.
        // validateLiveScenarioJson(json) — pure validator + normaliser.
        //   Returns { passed, normalizedScenario|null, blockedReasons[], warnings[] }.
        //   Blocks unsafe fields (lua, script, scenario_compressed, applyNow,
        //   gate7Approved, backendUrl, fetchUrl, storage keys, liveMutationAllowed:true,
        //   backendCommitAllowed:true). Requires non-empty steps array.
        //   Each step must have at least one of: id/step_id/title/phase/time_label/
        //   narrative/situation/decision_point_baseline/objective_status_baseline/
        //   actors/affected. Deep-copies input. Normalises scenario_id / scenario_label.
        //   Warns: NO_COORDINATE_TABLES, NO_DECISION_OPTIONS_IN_ANY_STEP,
        //   STEPS_LACK_TITLES_AND_PHASES, SCENARIO_ID_FALLBACK_USED.
        // loadLiveScenarioFromJson(json, options?) — validate + apply.
        //   On success: replaces window.RmoozScenario = { scenario, stepIndex: 0 },
        //   clears _liveOperatorWorkflowState.selections (scenario-scoped),
        //   calls refresh() to repaint live workspace.
        //   On failure: does NOT touch window.RmoozScenario.
        //   Returns { passed, scenarioId, scenarioLabel, stepCount, blockedReasons[], warnings[] }.
        //   NO fetch / no upload / no backend / no /api/sim/commit / no Gate 7.
        //   NO .scen / .ini parsing. NO Lua execution. NO decision-package reuse.
        // getCurrentLiveScenarioSummary() — pure read of window.RmoozScenario.
        //   Returns { scenarioId, scenarioLabel, stepIndex, stepCount,
        //             activeStepId, activeStepPhase }.
        // initLiveScenarioImport() — wires the #sw-live-scenario-import-btn click.
        //   FileReader.readAsText only. Idempotent.
        validateLiveScenarioJson:       validateLiveScenarioJson,
        loadLiveScenarioFromJson:       loadLiveScenarioFromJson,
        // PR-288M: guarded bridge from the live load path to the adjudicator map.
        //   maybeDrawLiveScenarioOnMap(scenario, options?) → delegates to
        //   window.AppAdjudicatorMap.drawScenario(); returns { painted, reason,
        //   warnings }. No geometry, no duplicate draw logic, no data mutation.
        maybeDrawLiveScenarioOnMap:     maybeDrawLiveScenarioOnMap,
        getCurrentLiveScenarioSummary:  getCurrentLiveScenarioSummary,
        // PR-287E: pure read of scenario unit arrays → { total, blue, red,
        //   byDomain, byEchelon, missingCoord }. No DOM / map / mutation.
        computeUnitComposition:         computeUnitComposition,
        // PR-287F: pure read of one step → { losses, degraded, strengthSum,
        //   strengthFull, strengthTotal }. No DOM / map / mutation.
        computeStepAttrition:           computeStepAttrition,
        computeStepActivity:            computeStepActivity,
        initLiveScenarioImport:         initLiveScenarioImport,
        // PR-286L1: Scenario Folder Import Intake.
        // classifyScenarioFolderFile(file) — pure, classify by extension only.
        //   .json → importable. .scen / .ini → unsupported. .lua → blocked.
        //   docs/.pdf/.docx/.html/.htm/.rtf/.txt → unsupported (briefing only).
        //   images → unsupported (asset only). Anything else → unsupported_unknown.
        //   NO content read. NO regex matching on body. Names/paths only.
        // scanScenarioFolderFiles(fileList, options?) — pure, classifies all files.
        //   Returns { passed, summary, candidates[], unsupported[], blockedReasons[], warnings[] }.
        //   summary counts per category. warnings: NO_JSON_CANDIDATES,
        //   SCEN_FILES_DETECTED_BUT_NOT_IMPORTABLE, INI_FILES_ARE_WEAPON_PATCHES_NOT_METADATA.
        // getLiveScenarioFolderScanState() — deep copy of module state.
        // importSelectedFolderScenarioJson(relativePathOrIndex, options?) — async import.
        //   options.text (string): synchronous test path — parse + load directly.
        //   options.onComplete (fn): production async path — FileReader.readAsText then
        //   loadLiveScenarioFromJson(); callback receives the result.
        //   Returns { passed, scenarioId, scenarioLabel, stepCount, blockedReasons, warnings }
        //   synchronously on the test path, or { passed:null, deferred:true } on the async path.
        //   NO .scen / .ini parsing. NO Lua execution. NO fetch. NO upload.
        // initLiveScenarioFolderImport() — wires the Scan + Import-Selected buttons.
        //   Idempotent. FileReader-only async. NO upload. NO backend.
        classifyScenarioFolderFile:      classifyScenarioFolderFile,
        scanScenarioFolderFiles:         scanScenarioFolderFiles,
        getLiveScenarioFolderScanState:  getLiveScenarioFolderScanState,
        importSelectedFolderScenarioJson: importSelectedFolderScenarioJson,
        initLiveScenarioFolderImport:    initLiveScenarioFolderImport,
        // PR-286L1A: Scenario Source Hub Simplification.
        // initSourceAdvancedImportsToggle() — idempotently wires the
        // #sw-source-advanced-toggle button to show/hide #sw-source-advanced-body.
        // Decision Package Import lives inside the body — collapsed by default
        // so the Live Scenario Import card stays visually primary.
        initSourceAdvancedImportsToggle: initSourceAdvancedImportsToggle,
    };
})();
