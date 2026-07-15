/* ============================================================================
 * scenario-edit-mode.js — RMOOZ Scenario Workspace "Edit Mode" (slice 1)
 * ----------------------------------------------------------------------------
 * OWNER RULING 2026-06-01 (Ghanem): the scenario workspace becomes editable —
 * a CMO-style "start → build/edit a scenario → fix issues as we proceed" flow,
 * overriding the previously read-only design.
 * See memory [[project_workspace_editable_owner_ruling]] +
 *     docs/cmo-functional-rules/exhaustive/ (CMO behavior rules — source of truth) +
 *     APP_INVENTORY.md "TODO — CMO→RMOOZ capability roadmap" (chosen-function list).
 *
 * SAFETY BOUNDARY PRESERVED (the agreed default):
 *   - Edits mutate an in-memory WORKING COPY draft, then (on Save) the in-memory
 *     `window.RmoozScenario.scenario` — NOT the durable journal.
 *   - The commit/journal path (R1/R2/R3 in docs/read-only-surface-audit.md) is
 *     UNTOUCHED. Nothing here calls /api/sim/commit, writes journal, or downloads.
 *   - Export = copy-to-clipboard (no Blob / <a download>) to respect the locked
 *     journal-download guard.
 *   - Draft safety is checked through the P0 module
 *     (window.AppScenarioAuthoring.isScenarioAuthoringDraftSafe).
 *
 * Slice 1 scope (CMO "first videos" order): Scenario Metadata + Sides + Posture.
 * Geography / Forces / Doctrine / Missions follow in later slices.
 * Vanilla JS, no build step. Self-mounts into #scenario-workspace-panel.
 * ========================================================================== */
(function () {
    'use strict';

    var PANEL_ID   = 'scenario-workspace-panel';
    var BAR_ID     = 'sw-editmode-bar';
    var EDITOR_ID  = 'sw-editmode-editor';
    var SIDE_IDS   = ['BLUE', 'RED', 'NEUTRAL'];
    var ROLES      = ['friendly', 'hostile', 'neutral'];
    var POSTURES   = ['FRIENDLY', 'NEUTRAL', 'UNFRIENDLY', 'HOSTILE'];

    var _on    = false;   // edit mode active?
    var _draft = null;    // working-copy scenario draft (deep clone)
    // Slice 2B: cross-card reactivity hook. The Forces card stashes its inner
    // "refresh Add Red availability" callback here when it renders; the Geometry
    // card calls it after every BLS add/remove so the operator doesn't need to
    // close+reopen Edit Mode to see the Add Red button enable.
    var _refreshForcesAvailability = null;
    // Slice 2C: stepped layout state.
    var _activeStep = 0;
    var _showingNewScenarioForm = false;
    // Mirror of the server-side PHASES enum (adjudicator-schema.js:15).
    // Used by Step 6 (Time & Duration). Kept inline to avoid a network call
    // for a 6-item static enum; if the server enum changes, update both.
    var PHASES_ENUM = ['PRE-H', 'PHASE 1', 'PHASE 2A', 'PHASE 2B', 'PHASE 3', 'RESOLUTION'];

    // Slice 2D-1J: "Editing: {name}" indicator state machine. Tells the
    // operator which scenario they're authoring and where it lives.
    //   'unsaved'    — yellow: never saved (just created / loaded into Edit Mode)
    //   'in-memory'  — blue:   Save draft pressed (window.RmoozScenario updated)
    //   'on-disk'    — blue+:  Save As JSON downloaded
    //   'on-server'  — green:  POST /api/scenarios returned 200
    // ANY field edit drops us back to 'unsaved' (the on-screen state diverges
    // from the saved snapshot).
    var _savedState = 'unsaved';

    // Slice 2D: Forces step state (scale-aware tree + detail pane).
    // The old Slice 2B flat list rendered ~1198 inputs on wargame3 (153 units).
    // New: tree groups units by side → echelon; only ONE unit's full editor
    // is rendered at a time in the detail pane below the tree.
    var _selectedUnitSide = null; // 'red' or 'blue'
    var _selectedUnitUid  = null; // uid (red) or unit_uid (blue) of the selected unit
    var _forcesFilter     = '';   // current substring filter for the tree
    var _collapsedForcesGroups = new Set(); // group keys the user has collapsed
    var _forcesPickOnMap  = false;          // 'Pick on map' placement mode active?
    var _forcesPickMapHandlers = null;       // teardown handle for the click+ESC listeners

    // Slice 11: cached server-side approval/lifecycle payload for the
    // currently-open draft's name (draft->in_review->approved/rejected->
    // activated, from scenario-approval-store.js / GET .../approval). Null
    // until the scenario has been saved to the server at least once (no
    // lifecycle row exists before that). Refreshed fire-and-forget on every
    // render of the Save step, same pattern as free-fight-demo.js's
    // _serverApprovalCache.
    var _approvalCache = null; // { scenario_name, status, can_submit, can_review, can_approve, can_activate, history } | null

    /* ---- small helpers ---------------------------------------------------- */
    function el(tag, attrs, kids) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') n.textContent = attrs[k];
            else if (k === 'html') n.innerHTML = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
        (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
        return n;
    }
    function clone(o) { try { return JSON.parse(JSON.stringify(o || {})); } catch (_) { return {}; } }
    function liveScenario() {
        var slot = window.RmoozScenario;
        return (slot && slot.scenario) ? slot.scenario : null;
    }
    function logOperator(msg, payload) {
        try {
            window.AppShellEventLog && window.AppShellEventLog.append({
                severity: 'info', category: 'OPERATOR', source: 'edit-mode',
                message: msg, payload: payload || undefined
            });
        } catch (_) {}
    }

    /* ---- draft defaults (mirror scenario-schema-spec.js sides/postures) ---- */
    function defaultSides() {
        return [
            { id: 'BLUE',    name_en: 'Blue Force',  name_ar: 'القوات الزرقاء', role: 'friendly', color: '#2f6fed' },
            { id: 'RED',     name_en: 'Red Force',   name_ar: 'القوات الحمراء', role: 'hostile',  color: '#d6332e' },
            { id: 'NEUTRAL', name_en: 'Neutral',     name_ar: 'محايد',          role: 'neutral',  color: '#9aa0a6' }
        ];
    }
    function defaultPostures() {
        return {
            BLUE:    { BLUE: 'FRIENDLY', RED: 'HOSTILE',  NEUTRAL: 'NEUTRAL' },
            RED:     { BLUE: 'HOSTILE',  RED: 'FRIENDLY', NEUTRAL: 'NEUTRAL' },
            NEUTRAL: { BLUE: 'NEUTRAL',  RED: 'NEUTRAL',  NEUTRAL: 'FRIENDLY' }
        };
    }

    function buildDraft() {
        var live = liveScenario();
        var d;
        if (live) {
            d = clone(live);
        } else if (window.AppScenarioAuthoring &&
                   typeof window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate === 'function') {
            d = clone(window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate());
        } else {
            d = { scenario_label: '', steps: [] };
        }
        if (!Array.isArray(d.sides) || !d.sides.length) d.sides = defaultSides();
        if (!d.postures || typeof d.postures !== 'object') d.postures = defaultPostures();
        fillGeographyDefaults(d);
        fillForcesDefaults(d);
        if (!d.model_version) d.model_version = 'authored-v1';
        d.authoring_status = 'draft';
        return d;
    }

    /* ---- Slice 2B: forces defaults (red_units, blue_units_initial) ------- */
    function fillForcesDefaults(d) {
        if (!Array.isArray(d.red_units))           d.red_units = [];
        if (!Array.isArray(d.blue_units_initial))  d.blue_units_initial = [];
        if (!Array.isArray(d.blue_units_base_ids)) d.blue_units_base_ids = [];
    }

    /* ---- Slice 2B: blue_units_base_ids is DERIVED from blue_units_initial ---
     * Single source of truth = blue_units_initial[].base_id.  We rebuild the
     * parallel index at Save time so the operator never has to maintain two
     * lists in parallel — and the validator's "lengths must match" warning
     * (scenario-validator.js:145-149) is impossible to trip from the UI. */
    function syncBlueBaseIds(d) {
        if (!Array.isArray(d.blue_units_initial)) { d.blue_units_base_ids = []; return; }
        d.blue_units_base_ids = d.blue_units_initial.map(function (u) {
            return (u && u.base_id != null) ? String(u.base_id) : '';
        });
    }

    /* ---- Slice 2B: forces hard rules (mirrors scenario-validator.js) -----
     * Lines 145-168 of UI_MOdified/server/ai/scenario-validator.js:
     *   - every red_units[i].bls must reference an existing bls_template name
     *   - every red_units[i].appear must be in [0, steps.length-1]
     *   - uid / unit_uid must be non-empty and unique inside their array */
    function validateForcesHardRules(d) {
        var why = [];
        if (d && Array.isArray(d.red_units)) {
            var blsNames = new Set((Array.isArray(d.bls_template) ? d.bls_template : [])
                .map(function (b) { return b && b.name; }).filter(Boolean));
            var lastStep = (Array.isArray(d.steps) && d.steps.length > 0) ? d.steps.length - 1 : null;
            var seenUid  = Object.create(null);
            d.red_units.forEach(function (u, i) {
                if (!u || typeof u !== 'object') {
                    why.push('red_units[' + i + '] is not an object');
                    return;
                }
                if (!u.uid || !String(u.uid).trim()) {
                    why.push('red_units[' + i + '].uid is empty');
                } else if (seenUid[u.uid]) {
                    why.push('red_units[' + i + '].uid duplicates "' + u.uid + '"');
                } else {
                    seenUid[u.uid] = true;
                }
                if (u.bls && !blsNames.has(u.bls)) {
                    why.push('red_units[' + i + '].bls "' + u.bls + '" is not a defined BLS');
                }
                if (Number.isInteger(u.appear) && lastStep != null && (u.appear < 0 || u.appear > lastStep)) {
                    why.push('red_units[' + i + '].appear ' + u.appear + ' out of range [0..' + lastStep + ']');
                }
            });
        }
        if (d && Array.isArray(d.blue_units_initial)) {
            var blueBaseIds = new Set((Array.isArray(d.bls_template) ? d.bls_template : [])
                .filter(function (b) { return b && (b.side === 'BLUE' || !b.side); })
                .map(function (b) { return b && b.name; }).filter(Boolean));
            var seenBlueUid = Object.create(null);
            d.blue_units_initial.forEach(function (u, i) {
                if (!u || typeof u !== 'object') {
                    why.push('blue_units_initial[' + i + '] is not an object');
                    return;
                }
                if (!u.unit_uid || !String(u.unit_uid).trim()) {
                    why.push('blue_units_initial[' + i + '].unit_uid is empty');
                } else if (seenBlueUid[u.unit_uid]) {
                    why.push('blue_units_initial[' + i + '].unit_uid duplicates "' + u.unit_uid + '"');
                } else {
                    seenBlueUid[u.unit_uid] = true;
                }
                if (u.base_id && blueBaseIds.size > 0 && !blueBaseIds.has(u.base_id)) {
                    why.push('blue_units_initial[' + i + '].base_id "' + u.base_id + '" is not a defined BLUE base');
                }
            });
        }
        return { ok: why.length === 0, why: why.join('; ') };
    }

    /* ---- Slice 5: doctrine/ROE/WRA hard rules -----------------------------
     * doctrine-rules.js's normalizers are lenient by design (bad refs/ranges
     * silently coerce to safe defaults, never reject) — that's correct for a
     * runtime evaluator but wrong for authoring, where the operator should
     * see the mistake immediately. This is the authoring-side rejection the
     * runtime module intentionally doesn't do. */
    var DOCTRINE_DECISIONS = ['allow', 'require_approval', 'block'];
    var DOCTRINE_SEVERITIES = ['info', 'warn', 'critical'];
    function validateRuleArrayHardRules(list, arrName, knownSideIds, why) {
        if (!Array.isArray(list)) return;
        var seenId = Object.create(null);
        list.forEach(function (r, i) {
            if (!r || typeof r !== 'object') { why.push(arrName + '[' + i + '] is not an object'); return; }
            if (r.id != null && String(r.id).trim()) {
                if (seenId[r.id]) why.push(arrName + '[' + i + '].id duplicates "' + r.id + '"');
                else seenId[r.id] = true;
            }
            if (r.decision != null && DOCTRINE_DECISIONS.indexOf(r.decision) === -1) {
                why.push(arrName + '[' + i + '].decision "' + r.decision + '" not in ' + DOCTRINE_DECISIONS.join('|'));
            }
            if (r.severity != null && DOCTRINE_SEVERITIES.indexOf(r.severity) === -1) {
                why.push(arrName + '[' + i + '].severity "' + r.severity + '" not in ' + DOCTRINE_SEVERITIES.join('|'));
            }
            if (r.applies_to_side != null && r.applies_to_side !== '' && knownSideIds.length > 0 &&
                knownSideIds.indexOf(r.applies_to_side) === -1) {
                why.push(arrName + '[' + i + '].applies_to_side "' + r.applies_to_side + '" not in defined sides');
            }
            if (r.collateral_risk_max != null && (!Number.isFinite(r.collateral_risk_max) || r.collateral_risk_max < 0 || r.collateral_risk_max > 1)) {
                why.push(arrName + '[' + i + '].collateral_risk_max must be 0..1 (got ' + r.collateral_risk_max + ')');
            }
            if (r.min_confidence != null && (!Number.isFinite(r.min_confidence) || r.min_confidence < 0 || r.min_confidence > 1)) {
                why.push(arrName + '[' + i + '].min_confidence must be 0..1 (got ' + r.min_confidence + ')');
            }
            if (r.max_range_nm != null && (!Number.isFinite(r.max_range_nm) || r.max_range_nm < 0)) {
                why.push(arrName + '[' + i + '].max_range_nm must be >= 0 (got ' + r.max_range_nm + ')');
            }
            if (r.salvo_limit != null && (!Number.isInteger(r.salvo_limit) || r.salvo_limit < 0)) {
                why.push(arrName + '[' + i + '].salvo_limit must be a non-negative integer (got ' + r.salvo_limit + ')');
            }
        });
    }
    function validateDoctrineHardRules(d) {
        var why = [];
        var knownSideIds = (d && Array.isArray(d.sides) ? d.sides : []).map(function (s) { return s && s.id; }).filter(Boolean);
        validateRuleArrayHardRules(d && d.doctrine_rules, 'doctrine_rules', knownSideIds, why);
        validateRuleArrayHardRules(d && d.roe_rules, 'roe_rules', knownSideIds, why);
        validateRuleArrayHardRules(d && d.wra_rules, 'wra_rules', knownSideIds, why);
        return { ok: why.length === 0, why: why.join('; ') };
    }

    /* ---- Slice 7: runtime events/triggers hard rules ----------------------
     * runtime-events.js's SAFE_RUNTIME_EFFECT_KINDS allowlist is enforced at
     * EVALUATION time (an unsafe kind is reported 'blocked', never rejected
     * at authoring time — the event still normalizes fine). This is the
     * authoring-side rejection so an operator can't even save an event whose
     * only effect can never fire. Cross-refs: update_mission_task_status /
     * open_decision_point / close_decision_point payloads should point at
     * ids that actually exist elsewhere in the draft, when those arrays are
     * authored (Slice 8 adds decision_points authoring; mission_tasks is
     * already live from Slice 6). */
    var RUNTIME_SAFE_EFFECT_KINDS = [
        'add_notification', 'set_runtime_flag', 'clear_runtime_flag',
        'open_decision_point', 'close_decision_point', 'update_mission_task_status',
        'request_operator_decision', 'weapon_release'
    ];
    function validateRuntimeHardRules(d) {
        var why = [];
        if (!d || !Array.isArray(d.runtime_events)) return { ok: true, why: '' };
        var seenId = Object.create(null);
        var missionTaskIds = new Set((Array.isArray(d.mission_tasks) ? d.mission_tasks : [])
            .map(function (t) { return t && t.id; }).filter(Boolean));
        var decisionPointIds = new Set((Array.isArray(d.decision_points) ? d.decision_points : [])
            .map(function (p) { return p && p.id; }).filter(Boolean));
        d.runtime_events.forEach(function (ev, i) {
            if (!ev || typeof ev !== 'object') { why.push('runtime_events[' + i + '] is not an object'); return; }
            if (ev.id != null && String(ev.id).trim()) {
                if (seenId[ev.id]) why.push('runtime_events[' + i + '].id duplicates "' + ev.id + '"');
                else seenId[ev.id] = true;
            }
            (Array.isArray(ev.effects) ? ev.effects : []).forEach(function (fx, j) {
                if (!fx || typeof fx !== 'object') { why.push('runtime_events[' + i + '].effects[' + j + '] is not an object'); return; }
                var kind = fx.kind;
                if (kind != null && RUNTIME_SAFE_EFFECT_KINDS.indexOf(kind) === -1) {
                    why.push('runtime_events[' + i + '].effects[' + j + '].kind "' + kind + '" not in the safe allowlist (' + RUNTIME_SAFE_EFFECT_KINDS.join('|') + ')');
                }
                var payload = fx.payload || {};
                if (kind === 'update_mission_task_status' && payload.mission_task_id && missionTaskIds.size > 0 &&
                    !missionTaskIds.has(payload.mission_task_id)) {
                    why.push('runtime_events[' + i + '].effects[' + j + '].payload.mission_task_id "' + payload.mission_task_id + '" not in defined mission_tasks');
                }
                if ((kind === 'open_decision_point' || kind === 'close_decision_point') && payload.decision_point_id &&
                    decisionPointIds.size > 0 && !decisionPointIds.has(payload.decision_point_id)) {
                    why.push('runtime_events[' + i + '].effects[' + j + '].payload.decision_point_id "' + payload.decision_point_id + '" not in defined decision_points');
                }
            });
        });
        return { ok: why.length === 0, why: why.join('; ') };
    }

    /* ---- Slice 2B: combine all hard rules (carver + forces) -------------- */
    function validateAllHardRules(d) {
        var a = validateDraftHardRules(d);
        var b = validateForcesHardRules(d);
        var c = validateObjectivesHardRules(d);
        var e = validateDoctrineHardRules(d);
        var f = validateRuntimeHardRules(d);
        if (a.ok && b.ok && c.ok && e.ok && f.ok) return { ok: true, why: '' };
        var why = [a.why, b.why, c.why, e.why, f.why].filter(Boolean).join('; ');
        return { ok: false, why: why };
    }

    /* ---- Slice 2A: geography defaults (AO, obj, pipeline, BLS, throughput) ---- */
    function defaultGeography() {
        return {
            map_bbox: [0, 0, 0, 0],
            ao_boundaries: [],
            obj: { name: '', coord: [0, 0], target_depth_km: 0, carver: 0, radius_km: 0 },
            pipeline: [],
            throughput_ceilings_km: { H12: 0, H24: 0, H48: 0, H72: 0, H120: 0 },
            bls_template: []
        };
    }
    function fillGeographyDefaults(d) {
        var g = defaultGeography();
        if (!Array.isArray(d.map_bbox) || d.map_bbox.length !== 4) d.map_bbox = g.map_bbox.slice();
        if (!Array.isArray(d.ao_boundaries)) d.ao_boundaries = g.ao_boundaries.slice();
        if (!d.obj || typeof d.obj !== 'object') {
            d.obj = clone(g.obj);
        } else {
            // Explicit per-key fill: clone() was written for objects and
            // would coerce a primitive default of 0 into {} via `o || {}`.
            if (d.obj.name == null)            d.obj.name = '';
            if (!Array.isArray(d.obj.coord) || d.obj.coord.length < 2) d.obj.coord = [0, 0];
            if (d.obj.target_depth_km == null) d.obj.target_depth_km = 0;
            if (d.obj.carver == null)          d.obj.carver = 0;
            if (d.obj.radius_km == null)       d.obj.radius_km = 0;
        }
        if (!Array.isArray(d.pipeline)) d.pipeline = g.pipeline.slice();
        if (!d.throughput_ceilings_km || typeof d.throughput_ceilings_km !== 'object') {
            d.throughput_ceilings_km = clone(g.throughput_ceilings_km);
        } else {
            Object.keys(g.throughput_ceilings_km).forEach(function (k) {
                if (d.throughput_ceilings_km[k] == null) {
                    d.throughput_ceilings_km[k] = g.throughput_ceilings_km[k];
                }
            });
        }
        if (!Array.isArray(d.bls_template)) d.bls_template = g.bls_template.slice();
    }

    /* ---- Slice 2A: hard validation (mirrors scenario-validator) ----------- */
    // scenario-validator.js:214 — obj.carver must be integer 0..60.
    function validateDraftHardRules(d) {
        var why = [];
        if (d && d.obj && d.obj.carver != null) {
            var c = d.obj.carver;
            if (!Number.isInteger(c) || c < 0 || c > 60) {
                why.push('obj.carver must be integer 0..60 (got ' + c + ')');
            }
        }
        return { ok: why.length === 0, why: why.join('; ') };
    }

    /* ---- Slice 2A: objectives validation (Phase 4A) ----------------------- */
    function validateObjectivesHardRules(d) {
        var why = [];
        if (d && Array.isArray(d.objectives)) {
            var knownSideIds = (Array.isArray(d.sides) ? d.sides : []).map(function (s) { return s && s.id; }).filter(Boolean);
            var seenId = Object.create(null);
            d.objectives.forEach(function (obj, i) {
                if (!obj || typeof obj !== 'object') {
                    why.push('objectives[' + i + '] is not an object');
                    return;
                }
                if (!obj.id || !String(obj.id).trim()) {
                    why.push('objectives[' + i + '].id is empty (required)');
                } else if (seenId[obj.id]) {
                    why.push('objectives[' + i + '].id duplicates "' + obj.id + '"');
                } else {
                    seenId[obj.id] = true;
                }
                if (!obj.name || !String(obj.name).trim()) {
                    why.push('objectives[' + i + '].name is empty (required)');
                }
                if (obj.owner && knownSideIds.length > 0 && knownSideIds.indexOf(obj.owner) === -1) {
                    why.push('objectives[' + i + '].owner "' + obj.owner + '" not in defined sides');
                }
                if (obj.location && typeof obj.location === 'object') {
                    var lat = obj.location.lat;
                    var lon = obj.location.lon;
                    if (lat != null && !Number.isFinite(lat)) {
                        why.push('objectives[' + i + '].location.lat must be a valid number (got ' + lat + ')');
                    }
                    if (lon != null && !Number.isFinite(lon)) {
                        why.push('objectives[' + i + '].location.lon must be a valid number (got ' + lon + ')');
                    }
                }
            });
        }
        return { ok: why.length === 0, why: why.join('; ') };
    }

    /* ---- safety gate via the P0 authoring module -------------------------- */
    function draftIsSafe(d) {
        try {
            if (window.AppScenarioAuthoring &&
                typeof window.AppScenarioAuthoring.isScenarioAuthoringDraftSafe === 'function') {
                var wrap = { liveMutationAllowed: false, aiCommitAllowed: false, operatorEditable: true, scenario: d };
                var r = window.AppScenarioAuthoring.isScenarioAuthoringDraftSafe(wrap);
                if (r && r.safe === false) {
                    return { ok: false, why: (r.violations || []).join('; ') || 'draft rejected' };
                }
            }
        } catch (e) { /* non-blocking: real gate is the untouched commit path */ }
        return { ok: true, why: '' };
    }

    /* ---- editor UI -------------------------------------------------------- */
    function fieldRow(labelTxt, inputNode) {
        return el('div', { class: 'sw-kv-row sw-edit-row' }, [
            el('dt', { text: labelTxt }), el('dd', null, [inputNode])
        ]);
    }
    function textInput(value, onInput) {
        var i = el('input', { type: 'text', class: 'sw-edit-input', value: value == null ? '' : String(value) });
        i.addEventListener('input', function () { onInput(i.value); _markDirty(); });
        return i;
    }
    function selectInput(options, value, onChange) {
        var s = el('select', { class: 'sw-edit-input' });
        options.forEach(function (o) {
            var opt = el('option', { value: o, text: o });
            if (o === value) opt.setAttribute('selected', 'selected');
            s.appendChild(opt);
        });
        s.addEventListener('change', function () { onChange(s.value); _markDirty(); });
        return s;
    }
    function numberInput(value, onInput, opts) {
        opts = opts || {};
        var i = el('input', {
            type:  'number',
            class: 'sw-edit-input',
            step:  opts.integer ? '1' : (opts.step || 'any'),
            value: (value == null || value === '') ? '' : String(value)
        });
        if (opts.min != null) i.setAttribute('min', String(opts.min));
        if (opts.max != null) i.setAttribute('max', String(opts.max));
        i.addEventListener('input', function () {
            var raw = i.value;
            if (raw === '' || raw == null) { onInput(null); _markDirty(); return; }
            var n = Number(raw);
            if (!isFinite(n)) { onInput(null); _markDirty(); return; }
            if (opts.integer) n = Math.trunc(n);
            if (opts.min != null && n < opts.min) n = opts.min;
            if (opts.max != null && n > opts.max) n = opts.max;
            onInput(n);
            _markDirty();
        });
        return i;
    }
    function textArea(value, rows, onChange) {
        var t = el('textarea', { class: 'sw-edit-input', rows: String(rows || 4) });
        t.value = value == null ? '' : String(value);
        t.addEventListener('input', function () { onChange(t.value); _markDirty(); });
        return t;
    }
    function checkboxInput(value, onChange) {
        var c = el('input', { type: 'checkbox', class: 'sw-edit-checkbox' });
        c.checked = !!value;
        c.addEventListener('change', function () { onChange(c.checked); _markDirty(); });
        return c;
    }

    /* ---- Slice 2A: coord-list parsing / serialisation -------------------- */
    // "lon, lat" (or "lon  lat") per non-empty line → [[lon, lat], ...]. Bad lines skipped.
    function parseCoordLines(txt) {
        var out = [];
        String(txt || '').split(/\r?\n/).forEach(function (line) {
            var s = line.trim();
            if (!s) return;
            var m = s.split(/[\s,]+/).filter(Boolean);
            if (m.length < 2) return;
            var lon = Number(m[0]), lat = Number(m[1]);
            if (isFinite(lon) && isFinite(lat)) out.push([lon, lat]);
        });
        return out;
    }
    function coordsToLines(coords) {
        return (coords || []).map(function (c) {
            return (c && c.length >= 2) ? (c[0] + ', ' + c[1]) : '';
        }).join('\n');
    }
    // The adjudicator-map renderer expects GeoJSON Polygon coordinates:
    //   ao.coordinates = [ outerRing, hole1, ... ]   (rings of [lon, lat])
    //   ao.coordinates = [[[ring]], ...]             when ao.type === 'MultiPolygon'
    // Slice 2A authors only the outer ring of the first polygon.
    function aoExteriorRing(ao) {
        if (!ao || !ao.coordinates) return [];
        if (ao.type === 'MultiPolygon') {
            return (ao.coordinates[0] && ao.coordinates[0][0]) || [];
        }
        return ao.coordinates[0] || [];
    }
    function setAoExteriorRing(ao, ring) {
        if (ao.type === 'MultiPolygon') ao.coordinates = [[ring]];
        else                            ao.coordinates = [ring];
    }
    function makeMapBboxAoPolygon(bbox) {
        if (!Array.isArray(bbox) || bbox.length !== 4) return null;
        var lo0 = Number(bbox[0]), la0 = Number(bbox[1]),
            lo1 = Number(bbox[2]), la1 = Number(bbox[3]);
        if (![lo0, la0, lo1, la1].every(isFinite)) return null;
        return {
            name: 'AO',
            coordinates: [[[lo0, la0], [lo1, la0], [lo1, la1], [lo0, la1], [lo0, la0]]]
        };
    }

    /* ---- Slice 2A: AO card ----------------------------------------------- */
    function renderAOCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Area of Operations / منطقة العمليات' })
            ])
        ]);

        var bbox = _draft.map_bbox;
        var bboxDl = el('dl', { class: 'sw-kv' });
        ['lon_min', 'lat_min', 'lon_max', 'lat_max'].forEach(function (label, idx) {
            bboxDl.appendChild(fieldRow('map_bbox · ' + label, numberInput(bbox[idx], function (v) {
                bbox[idx] = (v == null ? 0 : v);
            })));
        });
        card.appendChild(bboxDl);

        var aoList = el('div', { class: 'sw-edit-list' });
        function rerenderAOList() {
            aoList.innerHTML = '';
            if (!_draft.ao_boundaries.length) {
                aoList.appendChild(el('div', { class: 'sw-edit-empty', text: '(no AO polygons)' }));
            }
            _draft.ao_boundaries.forEach(function (ao, idx) {
                var nameInp = textInput(ao.name || '', function (v) { ao.name = v; });
                var ringTa  = textArea(coordsToLines(aoExteriorRing(ao)), 4, function (v) {
                    setAoExteriorRing(ao, parseCoordLines(v));
                });
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.ao_boundaries.splice(idx, 1);
                    rerenderAOList();
                });
                aoList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow('Polygon #' + (idx + 1) + ' · name', nameInp),
                        fieldRow('Outer ring (one "lon, lat" per line)', ringTa)
                    ]),
                    rm
                ]));
            });
        }
        rerenderAOList();
        card.appendChild(aoList);

        var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add polygon (empty)' });
        addBtn.addEventListener('click', function () {
            _draft.ao_boundaries.push({
                name: 'AO ' + (_draft.ao_boundaries.length + 1),
                coordinates: [[]]
            });
            rerenderAOList();
        });
        var useBboxBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Use map_bbox as AO' });
        useBboxBtn.addEventListener('click', function () {
            var poly = makeMapBboxAoPolygon(_draft.map_bbox);
            if (!poly) { setStatus('map_bbox must have 4 finite numbers first.', true); return; }
            _draft.ao_boundaries.push(poly);
            rerenderAOList();
            _maybeRepaintMap();
        });
        // 2D-2: draw an AO polygon by clicking vertices on the map.
        var drawAoBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Draw AO on map' });
        drawAoBtn.addEventListener('click', function () {
            _beginPickOnMapPolygon(function (ring) {
                _draft.ao_boundaries.push({
                    name: 'AO ' + (_draft.ao_boundaries.length + 1),
                    coordinates: [ring]
                });
                rerenderAOList();
                _maybeRepaintMap();
                setStatus('AO polygon added (' + (ring.length - 1) + ' vertices).', false);
            }, function () { setStatus('AO draw cancelled.', false); });
        });
        // 2D-2: set objective coord with one click on the map.
        var pickObjBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Set objective on map' });
        pickObjBtn.addEventListener('click', function () {
            if (!_draft.obj || typeof _draft.obj !== 'object') {
                _draft.obj = { name: 'OBJ', coord: [0, 0], target_depth_km: 0, carver: 0, radius_km: 0 };
            }
            _beginPickOnMap(function (coord) {
                _draft.obj.coord = [Number(coord[0]) || 0, Number(coord[1]) || 0];
                _maybeRepaintMap();
                setStatus('Objective set to [' + _draft.obj.coord[0].toFixed(4) + ', ' + _draft.obj.coord[1].toFixed(4) + '].', false);
                // Re-render the Map step so the new coord shows in the obj fields.
                renderEditor();
            }, function () { setStatus('Objective pick cancelled.', false); });
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [drawAoBtn, pickObjBtn, useBboxBtn, addBtn]));

        host.appendChild(card);
    }

    // 2D-2: helper to push the current draft into the live RmoozScenario and
    // repaint the map so the operator sees the new AO/obj/pipeline/BLS
    // shapes immediately (without waiting for Save draft). Read-only repaint;
    // commits + journal are still gated by Save draft.
    function _maybeRepaintMap() {
        try {
            var slot = window.RmoozScenario || (window.RmoozScenario = { scenario: null, stepIndex: 0 });
            // Quick clone so the live scenario reflects current draft geometry.
            // Save draft is still the official commit; this is a preview.
            slot.scenario = clone(_draft);
            if (typeof slot.stepIndex !== 'number') slot.stepIndex = 0;
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.drawScenario === 'function') {
                window.AppAdjudicatorMap.drawScenario(slot.scenario);
            }
        } catch (_) {}
    }

    /* ---- Slice 2A: Geometry card ----------------------------------------- */
    function renderGeometryCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Forces Geometry (Objective + Pipeline + BLS + Throughput) / هندسة القوات' })
            ])
        ]);

        var obj = _draft.obj;
        if (!Array.isArray(obj.coord) || obj.coord.length < 2) obj.coord = [0, 0];
        card.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('obj · name',
                textInput(obj.name, function (v) { obj.name = v; })),
            fieldRow('obj · coord.lon',
                numberInput(obj.coord[0], function (v) { obj.coord[0] = (v == null ? 0 : v); })),
            fieldRow('obj · coord.lat',
                numberInput(obj.coord[1], function (v) { obj.coord[1] = (v == null ? 0 : v); })),
            fieldRow('obj · target_depth_km',
                numberInput(obj.target_depth_km, function (v) { obj.target_depth_km = (v == null ? 0 : v); })),
            // obj.carver: deliberately NOT clamping/truncating in the input so a
            // bad value (75, 6.5, -1) reaches validateDraftHardRules and surfaces
            // a visible red error at Save time — the validator is the single
            // source of truth (scenario-validator.js:214).
            fieldRow('obj · carver (integer 0..60)',
                numberInput(obj.carver, function (v) { obj.carver = v; })),
            fieldRow('obj · radius_km',
                numberInput(obj.radius_km, function (v) { obj.radius_km = (v == null ? 0 : v); }))
        ]));

        var pipeTa = textArea(coordsToLines(_draft.pipeline), 5, function (v) {
            _draft.pipeline = parseCoordLines(v);
        });
        // 2D-2: draw pipeline waypoints on the map (polyline; double-click finishes).
        var drawPipeBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Draw pipeline on map' });
        drawPipeBtn.addEventListener('click', function () {
            _beginPickOnMapPolyline(function (line) {
                _draft.pipeline = line;
                _maybeRepaintMap();
                setStatus('Pipeline replaced with ' + line.length + ' waypoints.', false);
                // Refresh the textarea content so the operator sees the new values.
                pipeTa.value = coordsToLines(line);
            }, function () { setStatus('Pipeline draw cancelled.', false); });
        });
        card.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('pipeline (one "lon, lat" per line; ≥2 waypoints)', pipeTa)
        ]));
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [drawPipeBtn]));

        var t = _draft.throughput_ceilings_km;
        var tDl = el('dl', { class: 'sw-kv' });
        ['H12', 'H24', 'H48', 'H72', 'H120'].forEach(function (k) {
            tDl.appendChild(fieldRow('throughput_ceilings_km · ' + k,
                numberInput(t[k], function (v) { t[k] = (v == null ? 0 : v); })));
        });
        card.appendChild(tDl);

        var blsList = el('div', { class: 'sw-edit-list' });
        function rerenderBlsList() {
            blsList.innerHTML = '';
            if (!_draft.bls_template.length) {
                blsList.appendChild(el('div', { class: 'sw-edit-empty', text: '(no BLS rows)' }));
            }
            _draft.bls_template.forEach(function (b, idx) {
                if (!Array.isArray(b.coord) || b.coord.length < 2) b.coord = [0, 0];
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.bls_template.splice(idx, 1);
                    rerenderBlsList();
                    // Slice 2B: a BLS removal may invalidate red_units[].bls
                    // references and may need to disable Add Red unit.
                    if (typeof _refreshForcesAvailability === 'function') {
                        try { _refreshForcesAvailability(); } catch (_) {}
                    }
                });
                var label = 'BLS #' + (idx + 1);
                // 2D-2: per-BLS pick-on-map button replaces the lon/lat dance.
                var blsPickBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Pick coord on map' });
                blsPickBtn.addEventListener('click', function () {
                    _beginPickOnMap(function (coord) {
                        b.coord = [Number(coord[0]) || 0, Number(coord[1]) || 0];
                        _maybeRepaintMap();
                        rerenderBlsList();
                        setStatus(label + ' coord set to [' + b.coord[0].toFixed(4) + ', ' + b.coord[1].toFixed(4) + '].', false);
                    }, function () { setStatus(label + ' pick cancelled.', false); });
                });
                blsList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · name',
                            textInput(b.name || '', function (v) { b.name = v; })),
                        fieldRow(label + ' · side (BLUE/RED)',
                            selectInput(['BLUE', 'RED'], b.side || 'RED', function (v) { b.side = v; })),
                        fieldRow(label + ' · coord.lon',
                            numberInput(b.coord[0], function (v) { b.coord[0] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · coord.lat',
                            numberInput(b.coord[1], function (v) { b.coord[1] = (v == null ? 0 : v); })),
                        fieldRow(label + ' · role',
                            textInput(b.role || '', function (v) { b.role = v; })),
                        fieldRow(label + ' · throughput',
                            numberInput(b.throughput, function (v) { b.throughput = (v == null ? 0 : v); },
                                        { integer: true, min: 0 })),
                        fieldRow(label + ' · terrain_friction (0..1)',
                            numberInput(b.terrain_friction, function (v) { b.terrain_friction = (v == null ? 0 : v); },
                                        { min: 0, max: 1, step: '0.01' }))
                    ]),
                    el('div', { class: 'sw-edit-actions' }, [blsPickBtn]),
                    rm
                ]));
            });
        }
        rerenderBlsList();
        card.appendChild(blsList);

        var addBls = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add BLS' });
        addBls.addEventListener('click', function () {
            _draft.bls_template.push({
                name: 'BLS-' + (_draft.bls_template.length + 1),
                side: 'RED', coord: [0, 0], role: '', throughput: 0, terrain_friction: 0
            });
            rerenderBlsList();
            rerenderUtilizationSummary();
            // Slice 2B: notify the Forces card so Add Red unit can enable.
            if (typeof _refreshForcesAvailability === 'function') {
                try { _refreshForcesAvailability(); } catch (_) {}
            }
        });

        // ── Base Utilization Summary ──────────────────────────────────────
        var utilizationContainer = el('div', { class: 'sw-utilization-summary' });
        function rerenderUtilizationSummary() {
            utilizationContainer.innerHTML = '';
            var heading = el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Base Utilization Summary' })
            ]);
            utilizationContainer.appendChild(heading);

            var redUnits = _draft.red_units || [];
            var blueUnits = _draft.blue_units_initial || [];
            var blsTemplates = _draft.bls_template || [];

            // Group by base
            var blsByName = {};
            blsTemplates.forEach(function (b) {
                blsByName[b.name] = { base: b, redCount: 0, blueCount: 0 };
            });
            redUnits.forEach(function (u) {
                if (blsByName[u.bls]) blsByName[u.bls].redCount++;
            });
            blueUnits.forEach(function (u) {
                if (blsByName[u.base_id]) blsByName[u.base_id].blueCount++;
            });

            var summaryTable = el('table', { class: 'sw-utilization-table' }, [
                el('tr', {}, [
                    el('th', { text: 'Base Name' }),
                    el('th', { text: 'Side' }),
                    el('th', { text: 'RED Units' }),
                    el('th', { text: 'BLUE Units' }),
                    el('th', { text: 'Total' }),
                    el('th', { text: 'Throughput' })
                ])
            ]);

            Object.keys(blsByName).forEach(function (baseName) {
                var entry = blsByName[baseName];
                var total = entry.redCount + entry.blueCount;
                var throughput = entry.base.throughput || '—';
                var isOversubscribed = throughput !== '—' && total > throughput;

                summaryTable.appendChild(el('tr', { class: isOversubscribed ? 'oversubscribed' : '' }, [
                    el('td', { text: baseName }),
                    el('td', { text: entry.base.side || 'RED' }),
                    el('td', { text: String(entry.redCount) }),
                    el('td', { text: String(entry.blueCount) }),
                    el('td', { text: String(total) }),
                    el('td', { text: String(throughput), class: isOversubscribed ? 'sw-warning' : '' })
                ]));
            });

            utilizationContainer.appendChild(summaryTable);
        }
        rerenderUtilizationSummary();
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addBls]));
        card.appendChild(utilizationContainer);

        host.appendChild(card);
    }

    /* ---- Slice 2D: Forces (OOB) — tree + detail pane (replaces 2B flat) -- */
    // CMO maneuver-role enum: now used as a *datalist* (suggestion list)
    // rather than a strict <select>. Real-world scenarios like wargame3
    // carry 33+ distinct role values (mech_inf_div, sam_s300, submarine, …);
    // a strict <select> would silently overwrite those values when an
    // operator opened the dropdown. Free-text + suggestions preserves data
    // and still makes the CMO 7 visible.
    var RED_UNIT_ROLES = [
        'Main effort', 'Fixing', 'Support', 'External envelopment',
        'Follow-on', 'Exploitation', 'Recon'
    ];

    function nextFreeUid(prefix, list, key) {
        var taken = new Set(list.map(function (u) { return u && u[key]; }).filter(Boolean));
        var i = 1;
        while (taken.has(prefix + '-' + i)) i++;
        return prefix + '-' + i;
    }

    // Group a flat unit list by an echelon key. Returns
    //   { 'division': [u, u, ...], 'brigade': [...], ..., '(no echelon)': [...] }
    // preserving insertion order within each bucket.
    function groupByEchelon(units) {
        var groups = Object.create(null);
        var order  = [];
        units.forEach(function (u) {
            var k = (u && u.echelon) ? String(u.echelon) : '(no echelon)';
            if (!groups[k]) { groups[k] = []; order.push(k); }
            groups[k].push(u);
        });
        return { groups: groups, order: order };
    }

    // Case-insensitive substring match against the fields a user is likely
    // to search by. Returns true for an empty filter (no-op).
    function unitMatchesFilter(u, q) {
        if (!q) return true;
        q = String(q).toLowerCase();
        var hay = [
            u.uid || u.unit_uid || '',
            u.label || '',
            u.role  || '',
            u.bls   || '',
            u.base_id || '',
            u.echelon || ''
        ].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
    }

    // Build a tiny milsymbol SVG for a row. Falls back to a colored dot if
    // milsymbol isn't loaded (Node tests, etc.) so this stays render-safe.
    function buildMiniSymbolHtml(sidc, side) {
        try {
            if (window.ms && typeof window.ms.Symbol === 'function') {
                var s = (sidc && String(sidc).length >= 10) ? String(sidc)
                      : (side === 'red'  ? '10061000001211000000'
                                          : '10031000001211000000');
                var sym = new window.ms.Symbol(s, { size: 18 });
                if (sym.isValid()) return sym.asSVG();
            }
        } catch (_) { /* fall through */ }
        var color = side === 'red' ? '#d6332e' : '#3a76c2';
        return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + '"></span>';
    }

    function _selectUnit(side, uid) {
        _selectedUnitSide = side;
        _selectedUnitUid  = uid;
    }
    function _clearSelection() {
        _selectedUnitSide = null;
        _selectedUnitUid  = null;
        _cancelPickOnMap();
    }
    function _findSelectedUnit(d) {
        if (!_selectedUnitUid || !d) return null;
        if (_selectedUnitSide === 'red') {
            return (d.red_units || []).find(function (u) { return u.uid === _selectedUnitUid; }) || null;
        }
        return (d.blue_units_initial || []).find(function (u) { return u.unit_uid === _selectedUnitUid; }) || null;
    }

    // "Pick on map" placement mode: next Leaflet map click writes the
    // selected unit's coord. ESC cancels. Reuses window.map directly
    // (Leaflet's once() guarantees a single-shot handler). Does NOT call
    // /api/units/place — this is scenario-draft authoring, not the durable
    // ORBAT store.
    function _beginPickOnMap(onPicked, onCancel) {
        _cancelPickOnMap();
        var map = window.map;
        if (!map) { setStatus('Map not ready.', true); return false; }
        _forcesPickOnMap = true;
        try { map.getContainer().style.cursor = 'crosshair'; } catch (_) {}
        // 2D-1O: collapse the overlay so the map underneath is clickable.
        // Adds a global banner inside the bar with cancel button.
        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.classList.add('sw-editmode-picking');
        var bar = document.getElementById(BAR_ID);
        var banner = null;
        if (bar) {
            banner = el('div', { id: 'sw-editmode-pick-banner', class: 'sw-editmode-pick-banner-global' }, [
                el('span', { text: 'Click on the map to set coord' }),
                el('small', { text: 'Press ESC or click Cancel to abort' })
            ]);
            var cancelBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Cancel pick' });
            cancelBtn.addEventListener('click', function () {
                _cancelPickOnMap();
                if (typeof onCancel === 'function') onCancel();
            });
            banner.appendChild(cancelBtn);
            bar.appendChild(banner);
        }
        var onClick = function (e) {
            var lat = e.latlng && e.latlng.lat;
            var lng = e.latlng && e.latlng.lng;
            _cancelPickOnMap();
            if (typeof onPicked === 'function') onPicked([lng, lat]);
        };
        var onKey = function (e) {
            if (e.key === 'Escape') {
                _cancelPickOnMap();
                if (typeof onCancel === 'function') onCancel();
            }
        };
        map.once('click', onClick);
        document.addEventListener('keydown', onKey);
        _forcesPickMapHandlers = { map: map, onClick: onClick, onKey: onKey };
        return true;
    }
    function _cancelPickOnMap() {
        if (!_forcesPickOnMap && !_forcesPickMapHandlers) return;
        _forcesPickOnMap = false;
        var h = _forcesPickMapHandlers;
        _forcesPickMapHandlers = null;
        // 2D-2: a multi-vertex pick (polygon/polyline) installs its own cleanup
        // closure. Invoke it so map handlers + preview layer are torn down.
        if (h && typeof h.externalCleanup === 'function') {
            try { h.externalCleanup(); } catch (_) {}
            return;
        }
        // 2D-1O: tear down the overlay-collapse + banner.
        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.classList.remove('sw-editmode-picking');
        var banner = document.getElementById('sw-editmode-pick-banner');
        if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
        if (!h) return;
        try { if (h.onClick) h.map.off('click', h.onClick); } catch (_) {}
        try { h.map.getContainer().style.cursor = ''; } catch (_) {}
        try { if (h.onKey) document.removeEventListener('keydown', h.onKey); } catch (_) {}
    }

    /* ---- Slice 2D-2: multi-vertex pick (polygon / polyline) -------------- */
    // Shared shape with _beginPickOnMap (single point) — same overlay-collapse,
    // same ESC, same status banner. Click adds a vertex; dblclick finishes
    // (returns array of [lng,lat]); ESC or Cancel button returns null.
    //   mode: 'polygon' draws + closes (last == first) on finish
    //   mode: 'polyline' open-ended (no automatic close)
    function _beginMultiPick(mode, label, onFinish, onCancel) {
        _cancelPickOnMap();
        var map = window.map;
        if (!map) { setStatus('Map not ready.', true); return false; }
        if (!window.L) { setStatus('Leaflet not ready.', true); return false; }
        _forcesPickOnMap = true;
        try { map.getContainer().style.cursor = 'crosshair'; } catch (_) {}

        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.classList.add('sw-editmode-picking');

        var verts = []; // [[lng, lat], ...]
        var preview = null;
        function rerenderPreview() {
            try { if (preview) { map.removeLayer(preview); preview = null; } } catch (_) {}
            if (verts.length < 2) return;
            var latlngs = verts.map(function (c) { return [c[1], c[0]]; });
            if (mode === 'polygon') {
                preview = window.L.polygon(latlngs, {
                    color: '#5da9e8', weight: 2, opacity: 0.85,
                    dashArray: '5 4', fillColor: '#3a96d2', fillOpacity: 0.12,
                    interactive: false
                }).addTo(map);
            } else {
                preview = window.L.polyline(latlngs, {
                    color: '#c9a227', weight: 3, opacity: 0.85,
                    dashArray: '5 4', interactive: false
                }).addTo(map);
            }
        }

        var bar = document.getElementById(BAR_ID);
        var banner = null;
        function setBannerText() {
            if (!banner) return;
            var top = banner.querySelector('.sw-pick-banner-top');
            if (top) top.textContent = label + ' — ' + verts.length + ' vertex' + (verts.length === 1 ? '' : 'es');
        }
        if (bar) {
            banner = el('div', { id: 'sw-editmode-pick-banner', class: 'sw-editmode-pick-banner-global' }, [
                el('span', { class: 'sw-pick-banner-top', text: label + ' — 0 vertices' }),
                el('small', { text: 'Click map to add a vertex · Double-click to finish · ESC to cancel' })
            ]);
            var cancelBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Cancel' });
            cancelBtn.addEventListener('click', function () {
                cleanup();
                if (typeof onCancel === 'function') onCancel();
            });
            var finishBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
                text: 'Finish (or double-click)' });
            finishBtn.addEventListener('click', finish);
            banner.appendChild(finishBtn);
            banner.appendChild(cancelBtn);
            bar.appendChild(banner);
        }

        function onClick(e) {
            // Skip if the click is the first half of a dblclick (Leaflet fires
            // both); use a small grace window to detect that.
            if (e.originalEvent && e.originalEvent._dblClicked) return;
            var lat = e.latlng && e.latlng.lat;
            var lng = e.latlng && e.latlng.lng;
            if (typeof lat !== 'number' || typeof lng !== 'number') return;
            verts.push([lng, lat]);
            rerenderPreview();
            setBannerText();
        }
        function onDblClick(e) {
            if (e && e.originalEvent) e.originalEvent._dblClicked = true;
            try { if (e && e.originalEvent && typeof e.originalEvent.preventDefault === 'function') e.originalEvent.preventDefault(); } catch (_) {}
            // The last single-click usually fires before dblclick; if it just
            // added the dblclick point, keep it as the last vertex. Otherwise
            // ignore the dblclick coordinate.
            finish();
        }
        function finish() {
            if (verts.length < (mode === 'polygon' ? 3 : 2)) {
                setStatus(label + ': need at least ' + (mode === 'polygon' ? 3 : 2) + ' vertices.', true);
                cleanup();
                if (typeof onCancel === 'function') onCancel();
                return;
            }
            var result = verts.slice();
            if (mode === 'polygon') {
                // Close the ring (validator + adjudicator-map expect first==last for safety)
                var first = result[0], last = result[result.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) result.push([first[0], first[1]]);
            }
            cleanup();
            if (typeof onFinish === 'function') onFinish(result);
        }
        function onKey(e) {
            if (e.key === 'Escape') {
                cleanup();
                if (typeof onCancel === 'function') onCancel();
            } else if (e.key === 'Enter') {
                finish();
            }
        }
        function cleanup() {
            try { map.off('click', onClick); } catch (_) {}
            try { map.off('dblclick', onDblClick); } catch (_) {}
            try { map.getContainer().style.cursor = ''; } catch (_) {}
            try { document.removeEventListener('keydown', onKey); } catch (_) {}
            try { if (preview) { map.removeLayer(preview); preview = null; } } catch (_) {}
            _forcesPickOnMap = false;
            _forcesPickMapHandlers = null;
            if (panel) panel.classList.remove('sw-editmode-picking');
            var b = document.getElementById('sw-editmode-pick-banner');
            if (b && b.parentNode) b.parentNode.removeChild(b);
        }

        map.on('click', onClick);
        map.on('dblclick', onDblClick);
        document.addEventListener('keydown', onKey);
        // We don't use the single-shot _forcesPickMapHandlers tuple here —
        // multi-vertex uses its own cleanup closure. Set the in-progress flag
        // so _cancelPickOnMap() called externally (e.g. by another button)
        // can still no-op-safely.
        _forcesPickMapHandlers = { map: map, onClick: null, onKey: null, externalCleanup: cleanup };
        setBannerText();
        return true;
    }

    function _beginPickOnMapPolygon(onFinish, onCancel) {
        return _beginMultiPick('polygon', 'Draw polygon', onFinish, onCancel);
    }
    function _beginPickOnMapPolyline(onFinish, onCancel) {
        return _beginMultiPick('polyline', 'Draw line', onFinish, onCancel);
    }

    function renderForcesCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Forces (OOB) / القوات' })
            ])
        ]);

        // Local handles so the inner rerender callbacks can find them.
        var treeEl   = el('div', { class: 'sw-forces-tree' });
        var detailEl = el('div', { class: 'sw-forces-detail' });

        // ── Toolbar (search + add buttons + counts) ──────────────────
        var blsNames = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
            .map(function (b) { return b && b.name; }).filter(Boolean);

        var searchInp = el('input', {
            type: 'text', class: 'sw-edit-input',
            placeholder: 'Filter by uid / label / role / bls …'
        });
        searchInp.value = _forcesFilter;
        searchInp.addEventListener('input', function () {
            _forcesFilter = searchInp.value || '';
            rerenderTree();
        });

        var addRedBtn  = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Red unit' });
        var addBlueBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Blue unit' });
        addRedBtn.addEventListener('click', function () {
            if (!blsNames.length) {
                setStatus('Add at least one BLS in the Forces Geometry step before adding Red units.', true);
                return;
            }
            var seed = (_draft.bls_template[0] && Array.isArray(_draft.bls_template[0].coord))
                ? _draft.bls_template[0].coord.slice() : [0, 0];
            var uid = nextFreeUid('RED', _draft.red_units, 'uid');
            _draft.red_units.push({
                uid: uid, label: '', bls: blsNames[0], appear: 0,
                role: 'Main effort', coord: seed, strength: 1
            });
            _selectUnit('red', uid);
            rerenderTree(); rerenderDetail();
        });
        addBlueBtn.addEventListener('click', function () {
            var seed = [0, 0];
            if (_draft.blue_units_initial.length &&
                Array.isArray(_draft.blue_units_initial[0].coord) &&
                _draft.blue_units_initial[0].coord.length >= 2) {
                seed = _draft.blue_units_initial[0].coord.slice();
            } else if (Array.isArray(_draft.map_bbox) && _draft.map_bbox.length === 4 &&
                       _draft.map_bbox.every(function (n) { return typeof n === 'number'; })) {
                seed = [(_draft.map_bbox[0] + _draft.map_bbox[2]) / 2,
                        (_draft.map_bbox[1] + _draft.map_bbox[3]) / 2];
            }
            var nextN = _draft.blue_units_initial.length + 1;
            var uid   = nextFreeUid('BLUE', _draft.blue_units_initial, 'unit_uid');
            _draft.blue_units_initial.push({
                unit_uid: uid, base_id: 'B' + nextN, coord: seed
            });
            _selectUnit('blue', uid);
            rerenderTree(); rerenderDetail();
        });

        // Refresh Add Red availability when bls_template changes upstream.
        function refreshAddRedAvailability() {
            blsNames = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
                        .map(function (b) { return b && b.name; }).filter(Boolean);
            if (blsNames.length) addRedBtn.removeAttribute('disabled');
            else                  addRedBtn.setAttribute('disabled', 'disabled');
        }
        refreshAddRedAvailability();
        _refreshForcesAvailability = function () {
            refreshAddRedAvailability();
            rerenderTree();   // bls options in detail pane depend on bls_template
            rerenderDetail();
        };

        var countsEl = el('span', { class: 'sw-forces-counts', text: '' });

        var toolbar = el('div', { class: 'sw-forces-toolbar' }, [
            searchInp, addRedBtn, addBlueBtn, countsEl
        ]);

        // ── Tree rendering ────────────────────────────────────────────
        function groupKey(side, echelon) { return side + ':' + echelon; }
        function renderRow(unit, side) {
            var uid     = unit.uid || unit.unit_uid;
            var sym     = el('span', { class: 'sw-forces-sym', html: buildMiniSymbolHtml(unit.sidc, side) });
            var uidSpan = el('span', { class: 'sw-forces-uid',  text: uid || '' });
            var label   = el('span', { class: 'sw-forces-label', text: unit.label || unit.base_id || '—' });
            var tags = [];
            if (unit.role)    tags.push(el('span', { class: 'sw-forces-tag', text: unit.role }));
            if (unit.bls)     tags.push(el('span', { class: 'sw-forces-tag', text: unit.bls }));
            if (unit.base_id && !unit.bls) tags.push(el('span', { class: 'sw-forces-tag', text: unit.base_id }));
            var rowKids = [sym, uidSpan, label].concat(tags);
            var row = el('div', { class: 'sw-forces-row' + (
                _selectedUnitUid === uid && _selectedUnitSide === side ? ' selected' : '')
            }, rowKids);
            row.addEventListener('click', function () {
                _selectUnit(side, uid);
                rerenderTree();   // update .selected class
                rerenderDetail();
            });
            return row;
        }
        function renderSideGroup(label, sideKey, units) {
            // Filter first; if nothing matches, skip the whole side.
            var visible = units.filter(function (u) { return unitMatchesFilter(u, _forcesFilter); });
            if (!visible.length) return null;
            var grouped = groupByEchelon(visible);
            var sideExpanded = !_collapsedForcesGroups.has(sideKey);
            // When the user is searching, force everything open to surface hits.
            var force = !!_forcesFilter;
            if (force) sideExpanded = true;
            var header = el('div', {
                class: 'sw-forces-group-header sw-forces-side-' + sideKey
            }, [
                el('span', { class: 'sw-forces-group-chev', text: sideExpanded ? '▾' : '▸' }),
                el('span', { text: label }),
                el('span', { class: 'sw-forces-group-count', text: '· ' + visible.length })
            ]);
            header.addEventListener('click', function () {
                if (sideExpanded) _collapsedForcesGroups.add(sideKey);
                else              _collapsedForcesGroups['delete'](sideKey);
                rerenderTree();
            });
            var wrap = el('div', null, [header]);
            if (!sideExpanded) return wrap;

            grouped.order.forEach(function (echelon) {
                var ekey = groupKey(sideKey, echelon);
                var ulist = grouped.groups[echelon];
                var eExpanded = !_collapsedForcesGroups.has(ekey);
                if (force) eExpanded = true;
                var eHeader = el('div', { class: 'sw-forces-group-header sw-forces-group-echelon' }, [
                    el('span', { class: 'sw-forces-group-chev', text: eExpanded ? '▾' : '▸' }),
                    el('span', { text: echelon }),
                    el('span', { class: 'sw-forces-group-count', text: '· ' + ulist.length })
                ]);
                eHeader.addEventListener('click', function () {
                    if (eExpanded) _collapsedForcesGroups.add(ekey);
                    else           _collapsedForcesGroups['delete'](ekey);
                    rerenderTree();
                });
                wrap.appendChild(eHeader);
                if (eExpanded) ulist.forEach(function (u) { wrap.appendChild(renderRow(u, sideKey === 'RED' ? 'red' : 'blue')); });
            });
            return wrap;
        }

        function rerenderTree() {
            treeEl.innerHTML = '';
            var red  = renderSideGroup('RED · ',  'RED',  _draft.red_units          || []);
            var blue = renderSideGroup('BLUE · ', 'BLUE', _draft.blue_units_initial || []);
            if (red)  treeEl.appendChild(red);
            if (blue) treeEl.appendChild(blue);
            if (!red && !blue) {
                treeEl.appendChild(el('div', { class: 'sw-forces-empty',
                    text: _forcesFilter ?
                        ('No units match "' + _forcesFilter + '". Clear the filter to see all.') :
                        '(no units yet — add a BLS in the Forces Geometry step, then click + Red unit)' }));
            }
            // Update toolbar counts (post-filter so it reflects the tree).
            var rt = (_draft.red_units || []).filter(function (u) { return unitMatchesFilter(u, _forcesFilter); }).length;
            var bt = (_draft.blue_units_initial || []).filter(function (u) { return unitMatchesFilter(u, _forcesFilter); }).length;
            var rTotal = (_draft.red_units || []).length;
            var bTotal = (_draft.blue_units_initial || []).length;
            countsEl.textContent = _forcesFilter
                ? ('Showing ' + (rt + bt) + ' of ' + (rTotal + bTotal) + ' units')
                : ('Total: ' + rTotal + ' Red · ' + bTotal + ' Blue');
        }

        // ── Detail pane (single unit's full editor) ──────────────────
        function rerenderDetail() {
            detailEl.innerHTML = '';
            var u = _findSelectedUnit(_draft);
            if (!u) {
                detailEl.appendChild(el('div', { class: 'sw-forces-detail-empty',
                    text: 'Click a unit in the tree above to edit it, or use + Red unit / + Blue unit.' }));
                return;
            }
            var uid = u.uid || u.unit_uid;
            var side = _selectedUnitSide;
            var sideLabel = side === 'red' ? 'RED' : 'BLUE';
            var rmBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
            rmBtn.addEventListener('click', function () {
                if (!window.confirm('Remove ' + sideLabel + ' unit "' + uid + '"?')) return;
                if (side === 'red')  _draft.red_units = _draft.red_units.filter(function (x) { return x !== u; });
                else                  _draft.blue_units_initial = _draft.blue_units_initial.filter(function (x) { return x !== u; });
                _clearSelection();
                rerenderTree(); rerenderDetail();
            });
            var header = el('div', { class: 'sw-forces-detail-header' }, [
                el('span', { class: 'sw-forces-detail-title',
                    text: sideLabel + ' · ' + uid + (u.label ? ' — ' + u.label : '') }),
                rmBtn
            ]);
            detailEl.appendChild(header);

            if (!Array.isArray(u.coord) || u.coord.length < 2) u.coord = [0, 0];

            // Common: uid (read-only — uid changes break ai/world-state cross-refs)
            var fields = [];
            fields.push(fieldRow(side === 'red' ? 'uid' : 'unit_uid',
                (function () {
                    var i = el('input', { type: 'text', class: 'sw-edit-input', value: uid, readonly: 'readonly' });
                    i.style.opacity = '0.7';
                    return i;
                })()));

            if (side === 'red') {
                // Role: free-text + datalist suggestions. Slice 2D bug-fix: was a strict
                // <select> in Slice 2B which silently corrupted wargame3's 33 role values.
                var dlistId = 'sw-cmo-role-list';
                if (!document.getElementById(dlistId)) {
                    var dlist = document.createElement('datalist');
                    dlist.id = dlistId;
                    RED_UNIT_ROLES.forEach(function (r) {
                        var o = document.createElement('option'); o.value = r;
                        dlist.appendChild(o);
                    });
                    document.body.appendChild(dlist);
                }
                var roleInp = el('input', {
                    type: 'text', class: 'sw-edit-input',
                    list: dlistId, value: u.role || ''
                });
                roleInp.addEventListener('input', function () { u.role = roleInp.value; rerenderTree(); });

                // BLS: select that includes the unit's current value even if stale.
                var blsOpts = blsNames.slice();
                if (u.bls && blsOpts.indexOf(u.bls) === -1) blsOpts.push(u.bls);

                fields.push(fieldRow('label',
                    textInput(u.label || '', function (v) { u.label = v; rerenderTree(); })));
                fields.push(fieldRow('bls',
                    selectInput(blsOpts, u.bls || (blsOpts[0] || ''),
                        function (v) { u.bls = v; rerenderTree(); })));
                fields.push(fieldRow('appear (step index)',
                    numberInput(u.appear == null ? 0 : u.appear,
                        function (v) { u.appear = (v == null ? 0 : v); })));
                fields.push(fieldRow('role (free-text; suggestions = 7 CMO maneuver roles)', roleInp));
                fields.push(fieldRow('coord.lon',
                    numberInput(u.coord[0], function (v) { u.coord[0] = (v == null ? 0 : v); })));
                fields.push(fieldRow('coord.lat',
                    numberInput(u.coord[1], function (v) { u.coord[1] = (v == null ? 0 : v); })));
                fields.push(fieldRow('echelon',
                    textInput(u.echelon || '', function (v) { u.echelon = v; rerenderTree(); })));
                fields.push(fieldRow('strength (0..1)',
                    numberInput(u.strength == null ? 1 : u.strength,
                        function (v) { u.strength = (v == null ? 1 : v); },
                        { min: 0, max: 1, step: '0.05' })));
                fields.push(fieldRow('readiness',
                    selectInput(['ready', 'limited', 'not_ready'], u.readiness || 'ready',
                        function (v) { u.readiness = v; rerenderTree(); })));
                fields.push(fieldRow('supply (0..1)',
                    numberInput(u.supply == null ? 0.8 : u.supply,
                        function (v) {
                            if (v == null) u.supply = 0.8;
                            else u.supply = Math.max(0, Math.min(1, v));
                        },
                        { min: 0, max: 1, step: '0.1' })));
                fields.push(fieldRow('sidc',
                    textInput(u.sidc || '', function (v) { u.sidc = v; rerenderTree(); })));
            } else {
                // BLUE base selector: include bases with side=BLUE or no side set
                var blueBaseNames = (Array.isArray(_draft.bls_template) ? _draft.bls_template : [])
                    .filter(function (b) { return b && (b.side === 'BLUE' || !b.side); })
                    .map(function (b) { return b && b.name; }).filter(Boolean);
                var blueBaseOpts = blueBaseNames.slice();
                if (u.base_id && blueBaseOpts.indexOf(u.base_id) === -1) blueBaseOpts.push(u.base_id);

                fields.push(fieldRow('base_id',
                    blueBaseOpts.length > 0 ?
                        selectInput(blueBaseOpts, u.base_id || (blueBaseOpts[0] || ''),
                            function (v) { u.base_id = v; rerenderTree(); }) :
                        textInput(u.base_id || '', function (v) { u.base_id = v; rerenderTree(); })));
                fields.push(fieldRow('label',
                    textInput(u.label || '', function (v) { u.label = v; rerenderTree(); })));
                fields.push(fieldRow('coord.lon',
                    numberInput(u.coord[0], function (v) { u.coord[0] = (v == null ? 0 : v); })));
                fields.push(fieldRow('coord.lat',
                    numberInput(u.coord[1], function (v) { u.coord[1] = (v == null ? 0 : v); })));
                fields.push(fieldRow('role',
                    textInput(u.role || '', function (v) { u.role = v; rerenderTree(); })));
                fields.push(fieldRow('domain',
                    textInput(u.domain || '', function (v) { u.domain = v; rerenderTree(); })));
                fields.push(fieldRow('echelon',
                    textInput(u.echelon || '', function (v) { u.echelon = v; rerenderTree(); })));
                fields.push(fieldRow('readiness',
                    selectInput(['ready', 'limited', 'not_ready'], u.readiness || 'ready',
                        function (v) { u.readiness = v; rerenderTree(); })));
                fields.push(fieldRow('supply (0..1)',
                    numberInput(u.supply == null ? 0.8 : u.supply,
                        function (v) {
                            if (v == null) u.supply = 0.8;
                            else u.supply = Math.max(0, Math.min(1, v));
                        },
                        { min: 0, max: 1, step: '0.1' })));
                fields.push(fieldRow('sidc',
                    textInput(u.sidc || '', function (v) { u.sidc = v; rerenderTree(); })));
            }
            detailEl.appendChild(el('dl', { class: 'sw-kv' }, fields));

            // Pick-on-map action row.
            var pickBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
                text: 'Pick coord on map' });
            var pickBanner = el('div', { class: 'sw-forces-pick-banner', text: '' });
            pickBanner.style.display = 'none';
            pickBtn.addEventListener('click', function () {
                if (_forcesPickOnMap) { _cancelPickOnMap(); pickBanner.style.display = 'none'; return; }
                var started = _beginPickOnMap(function (coord) {
                    u.coord = [Number(coord[0]) || 0, Number(coord[1]) || 0];
                    pickBanner.style.display = 'none';
                    rerenderDetail(); rerenderTree();
                    setStatus('Picked coord [' + u.coord[0].toFixed(4) + ', ' + u.coord[1].toFixed(4) + '] for ' + uid, false);
                }, function () {
                    pickBanner.style.display = 'none';
                });
                if (started) {
                    pickBanner.textContent = 'Click on the map to set ' + uid + '’s coord (ESC to cancel)';
                    pickBanner.style.display = '';
                }
            });
            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [pickBtn]));
            detailEl.appendChild(pickBanner);
        }

        rerenderTree();
        rerenderDetail();

        card.appendChild(toolbar);
        card.appendChild(treeEl);
        card.appendChild(detailEl);
        host.appendChild(card);
    }

    /* ---- Slice 2C: factored existing card renderers ---------------------- */
    /* ---- Metadata Step 1: name sanitiser (module-scope so saveDraft can use it) */
    function sanitiseMetaName(raw) {
        return String(raw || '').toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64);
    }

    /* ---- Metadata Step 1: validated name input (sanitises + shows inline hint) */
    function metaNameInput(initValue, onCommit) {
        var wrap = document.createElement('div');
        var inp  = el('input', { type: 'text', class: 'sw-edit-input',
                                 value: initValue == null ? '' : String(initValue) });
        var hint = el('small', { class: 'sw-meta-hint' });
        wrap.appendChild(inp);
        wrap.appendChild(hint);

        function evaluate(raw) {
            var sane = sanitiseMetaName(raw);
            _draft.name = sane;
            if (!raw) {
                inp.className  = 'sw-edit-input sw-input-err';
                hint.className = 'sw-meta-hint sw-meta-hint--err';
                hint.textContent = '* Required — use letters, digits, and dashes (a-z 0-9 -)';
            } else if (sane !== raw) {
                inp.className  = 'sw-edit-input sw-input-warn';
                hint.className = 'sw-meta-hint sw-meta-hint--warn';
                hint.textContent = 'Saved as: ' + (sane || '(invalid — enter valid characters)');
            } else {
                inp.className  = 'sw-edit-input';
                hint.className = 'sw-meta-hint';
                hint.textContent = '';
            }
            onCommit(sane);
            _markDirty();
        }

        inp.addEventListener('input', function () { evaluate(inp.value); });
        /* On blur, snap the displayed value to the canonical form so the
         * user sees what was actually stored (no silent drift). */
        inp.addEventListener('blur', function () {
            var sane = sanitiseMetaName(inp.value);
            if (inp.value !== sane) { inp.value = sane; }
            evaluate(inp.value);
        });
        evaluate(initValue == null ? '' : String(initValue)); // initial validation
        return wrap;
    }

    /* ---- Metadata Step 1: validated label input (required, plain text) ----- */
    function metaLabelInput(initValue, onCommit) {
        var wrap = document.createElement('div');
        var inp  = el('input', { type: 'text', class: 'sw-edit-input',
                                 value: initValue == null ? '' : String(initValue) });
        var hint = el('small', { class: 'sw-meta-hint' });
        wrap.appendChild(inp);
        wrap.appendChild(hint);

        function evaluate() {
            var v = inp.value;
            if (!v.trim()) {
                inp.className  = 'sw-edit-input sw-input-err';
                hint.className = 'sw-meta-hint sw-meta-hint--err';
                hint.textContent = '* Required';
            } else {
                inp.className  = 'sw-edit-input';
                hint.className = 'sw-meta-hint';
                hint.textContent = '';
            }
            onCommit(v);
            _markDirty();
        }

        inp.addEventListener('input', evaluate);
        evaluate(); // initial validation
        return wrap;
    }

    function renderMetadataCard(host) {
        /* Step 1 hardening: Name sanitises to lowercase-dashes (it becomes the
         * filename on Save-to-server), Label is required plain text. Scenario ID
         * mirrors the sanitised Name on every Name change; the operator can
         * override it independently if needed. model_version defaults to
         * 'authored-v1' when blank. */

        /* Label row (no i18n key for the `*` — done via CSS .sw-meta-req) */
        function labeledRow(labelTxt, required, inputNode) {
            var dt = document.createElement('dt');
            var span = el('span', { text: labelTxt });
            if (required) span.className = 'sw-meta-req';
            dt.appendChild(span);
            var dd = document.createElement('dd');
            dd.appendChild(inputNode);
            var row = el('div', { class: 'sw-kv-row sw-edit-row' });
            row.appendChild(dt);
            row.appendChild(dd);
            return row;
        }

        /* Scenario ID input — follows Name by default, editable independently */
        var idInp = el('input', { type: 'text', class: 'sw-edit-input',
                                  value: _draft.scenario_id == null ? '' : String(_draft.scenario_id) });
        idInp.addEventListener('input', function () { _draft.scenario_id = idInp.value; _markDirty(); });

        var dl = el('dl', { class: 'sw-kv' });
        dl.appendChild(labeledRow(
            'Name / الاسم (filename)',
            true,
            metaNameInput(_draft.name, function (v) {
                renderIndicator();
                /* Auto-sync scenario_id if it was in-step with name */
                if (!idInp.value || idInp.value === _draft.scenario_id) {
                    idInp.value = v;
                    _draft.scenario_id = v;
                }
            })
        ));
        dl.appendChild(labeledRow(
            'Label / التسمية',
            true,
            metaLabelInput(_draft.scenario_label, function (v) {
                _draft.scenario_label = v;
                renderIndicator();
            })
        ));
        dl.appendChild(labeledRow('Scenario ID', false, idInp));
        /* CMO Step 1: Database / version. RMOOZ uses model_version only. */
        dl.appendChild(labeledRow('model_version',
            false,
            (function () {
                var i = el('input', { type: 'text', class: 'sw-edit-input',
                                      value: _draft.model_version || 'authored-v1' });
                if (!_draft.model_version) { _draft.model_version = 'authored-v1'; }
                i.addEventListener('input', function () {
                    _draft.model_version = i.value;
                    _markDirty();
                });
                return i;
            })()
        ));
        dl.appendChild(labeledRow('schema_variant (e.g. "authored", "w3-rich")',
            false,
            textInput(_draft.schema_variant, function (v) { _draft.schema_variant = v; })
        ));

        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Scenario Metadata & Version / بيانات السيناريو + الإصدار' })
            ])
        ]);
        card.appendChild(dl);
        host.appendChild(card);
    }

    /* ---- Sides name validator (Step 3 hardening) ---- */
    function sideNameInput(initValue, onCommit, required) {
        var wrap = document.createElement('div');
        var inp = el('input', { type: 'text', class: 'sw-edit-input',
                               value: initValue == null ? '' : String(initValue) });
        var hint = el('small', { class: 'sw-meta-hint' });
        wrap.appendChild(inp);
        wrap.appendChild(hint);

        function evaluate() {
            var v = inp.value ? inp.value.trim() : '';
            if (required && !v) {
                inp.className = 'sw-edit-input sw-input-err';
                hint.className = 'sw-meta-hint sw-meta-hint--err';
                hint.textContent = '* Required';
            } else {
                inp.className = 'sw-edit-input';
                hint.className = 'sw-meta-hint';
                hint.textContent = '';
            }
            onCommit(v); // pass actual value (empty allowed, but saveDraft will block)
            _markDirty();
        }

        inp.addEventListener('input', evaluate);
        inp.addEventListener('blur', evaluate);
        evaluate(); // initial check
        return wrap;
    }

    function renderSidesCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Sides / الأطراف' })
            ])
        ]);
        _draft.sides.forEach(function (side) {
            card.appendChild(el('dl', { class: 'sw-kv' }, [
                fieldRow(side.id + ' · name (EN) *',
                    sideNameInput(side.name_en, function (v) { side.name_en = v; }, true)),
                fieldRow(side.id + ' · name (AR)',
                    sideNameInput(side.name_ar, function (v) { side.name_ar = v; }, false)),
                fieldRow(side.id + ' · role',
                    selectInput(ROLES, side.role, function (v) { side.role = v; })),
                fieldRow(side.id + ' · color (hex)',
                    textInput(side.color, function (v) { side.color = v; }))
            ]));
        });
        host.appendChild(card);
    }

    function renderPostureCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Posture matrix (from → to) / مصفوفة الموقف' })
            ])
        ]);
        var dl = el('dl', { class: 'sw-kv' });
        SIDE_IDS.forEach(function (from) {
            SIDE_IDS.forEach(function (to) {
                if (from === to) return;
                _draft.postures[from] = _draft.postures[from] || {};
                var cur = _draft.postures[from][to] || 'NEUTRAL';
                dl.appendChild(fieldRow(from + ' → ' + to, selectInput(POSTURES, cur, function (v) {
                    _draft.postures[from][to] = v;
                })));
            });
        });
        card.appendChild(dl);
        host.appendChild(card);
    }

    /* ---- Slice 2A: Objectives card (Step 5) ------------------------------ */
    function renderObjectivesCard(host) {
        // Initialize objectives if not present
        if (!Array.isArray(_draft.objectives)) {
            _draft.objectives = [];
        }

        // Set up shared state for the objectives editor module
        if (typeof window !== 'undefined') {
            window._RMOOZEditModeObjectives = {
                shared: {
                    _draft: _draft,
                    _markDirty: _markDirty
                }
            };
        }

        // Call the module's render function
        if (window.RMOOZEditModeObjectives && typeof window.RMOOZEditModeObjectives.renderObjectivesCard === 'function') {
            window.RMOOZEditModeObjectives.renderObjectivesCard(host);
        } else {
            // Fallback if module not loaded
            host.appendChild(el('div', { class: 'builder-card sw-card' }, [
                el('div', { class: 'builder-card-header' }, [
                    el('span', { class: 'builder-card-title', text: 'Objectives' })
                ]),
                el('div', { class: 'sw-error', text: 'Objectives editor module not loaded. Check console for errors.' })
            ]));
        }
    }

    /* ---- Slice 2C: Time & Duration card (Step 6) ------------------------- */
    // The 6-step Sahil-style default. Mirrors the playbook walkthrough.
    function synthesizeDefaultPhaseTable() {
        return [
            { index: 0, time_label: 'H-3',   elapsed_hours: -3,  phase: 'PRE-H' },
            { index: 1, time_label: 'H+0',   elapsed_hours: 0,   phase: 'PHASE 1' },
            { index: 2, time_label: 'H+12',  elapsed_hours: 12,  phase: 'PHASE 2A' },
            { index: 3, time_label: 'H+36',  elapsed_hours: 36,  phase: 'PHASE 2B' },
            { index: 4, time_label: 'H+72',  elapsed_hours: 72,  phase: 'PHASE 3' },
            { index: 5, time_label: 'H+120', elapsed_hours: 120, phase: 'RESOLUTION' }
        ];
    }
    // Keep phase_table and steps length in lockstep (validator hard rule).
    function ensureStepsMatchPhaseTable(d) {
        if (!Array.isArray(d.phase_table)) d.phase_table = [];
        if (!Array.isArray(d.steps)) d.steps = [];
        while (d.steps.length < d.phase_table.length) {
            var i = d.steps.length;
            var ph = d.phase_table[i] || {};
            d.steps.push({
                index: i, time_label: ph.time_label || ('H+' + i),
                elapsed_hours: ph.elapsed_hours == null ? 0 : ph.elapsed_hours,
                phase: ph.phase || 'PHASE 1'
            });
        }
        while (d.steps.length > d.phase_table.length) d.steps.pop();
        // Re-stamp index/time/phase from phase_table so the two stay aligned.
        d.phase_table.forEach(function (pt, i) {
            if (!d.steps[i]) return;
            d.steps[i].index = i;
            d.steps[i].time_label = pt.time_label;
            d.steps[i].elapsed_hours = pt.elapsed_hours;
            d.steps[i].phase = pt.phase;
        });
    }

    function renderTimeDurationCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Time & Duration (phase_table) / الزمن والمدة' })
            ])
        ]);

        if (!Array.isArray(_draft.phase_table)) _draft.phase_table = [];
        var list = el('div', { class: 'sw-edit-list' });
        function rerender() {
            list.innerHTML = '';
            if (!_draft.phase_table.length) {
                list.appendChild(el('div', { class: 'sw-edit-empty',
                    text: '(no phases — click "Synthesize H-3 → H+120 (6 steps)" below for the Sahil default)' }));
            }
            _draft.phase_table.forEach(function (pt, idx) {
                // Defensive: ensure index field matches array position
                pt.index = idx;
                var rm = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Remove' });
                rm.addEventListener('click', function () {
                    _draft.phase_table.splice(idx, 1);
                    ensureStepsMatchPhaseTable(_draft);
                    rerender();
                });
                var label = 'Step #' + idx;
                list.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · time_label (e.g. "H-3", "H+0")',
                            textInput(pt.time_label || '', function (v) { pt.time_label = v; ensureStepsMatchPhaseTable(_draft); })),
                        fieldRow(label + ' · elapsed_hours',
                            numberInput(pt.elapsed_hours, function (v) { pt.elapsed_hours = (v == null ? 0 : v); ensureStepsMatchPhaseTable(_draft); })),
                        fieldRow(label + ' · phase',
                            selectInput(PHASES_ENUM, pt.phase || 'PHASE 1', function (v) { pt.phase = v; ensureStepsMatchPhaseTable(_draft); }))
                    ]),
                    rm
                ]));
            });
        }
        rerender();
        card.appendChild(list);

        var addRow = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add step' });
        addRow.addEventListener('click', function () {
            var i = _draft.phase_table.length;
            _draft.phase_table.push({ index: i, time_label: 'H+' + i, elapsed_hours: i, phase: 'PHASE 1' });
            ensureStepsMatchPhaseTable(_draft);
            rerender();
        });
        var synth = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Synthesize H-3 → H+120 (6 steps)' });
        synth.addEventListener('click', function () {
            _draft.phase_table = synthesizeDefaultPhaseTable();
            ensureStepsMatchPhaseTable(_draft);
            rerender();
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addRow, synth]));
        card.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'phase_table and steps stay in lockstep on edit (validator hard rule: equal length).' }));

        host.appendChild(card);
    }

    /* ---- Slice 2C: Briefing card (Step 12) ------------------------------- */
    function renderBriefingCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Edit · Briefing (per-step narratives) / التلخيص' })
            ])
        ]);

        if (!Array.isArray(_draft.steps) || !_draft.steps.length) {
            card.appendChild(el('div', { class: 'sw-edit-empty',
                text: '(no steps yet — define phase_table in Step 6 first)' }));
            host.appendChild(card);
            return;
        }

        _draft.steps.forEach(function (st, idx) {
            var sub = el('div', { class: 'sw-edit-subcard' }, [
                el('div', { class: 'sw-edit-subcard-header',
                    text: 'Step ' + idx + ' · ' + (st.time_label || '?') + ' · ' + (st.phase || '?') })
            ]);
            var enTa = textArea(st.narrative_en_baseline || '', 3, function (v) { st.narrative_en_baseline = v; });
            var arTa = textArea(st.narrative_ar_baseline || '', 3, function (v) { st.narrative_ar_baseline = v; });
            arTa.setAttribute('dir', 'rtl');
            sub.appendChild(el('dl', { class: 'sw-kv' }, [
                fieldRow('Narrative (EN)', enTa),
                fieldRow('Narrative (AR / عربي)', arTa)
            ]));
            card.appendChild(sub);
        });

        host.appendChild(card);
    }

    /* ---- Slice 5: Doctrine / ROE / WRA authoring (Forces-card-shell reuse) -
     * Same idiom as renderForcesCard: a grouped list + a single detail pane
     * below it, direct-mutation edits (fieldRow/textInput/... write straight
     * onto the object living inside _draft.{doctrine,roe,wra}_rules), no
     * separate "save the row" step. Written to the CANONICAL field names
     * doctrine-rules.js's baseRule()/normalize*Rules() expect (id, enabled,
     * decision, severity, reason, requires_authority, tags[], + per-kind
     * fields) so authored rules round-trip through the runtime evaluator
     * unchanged rather than through its legacy-alias fallback coercion. */
    var DOCTRINE_RULE_KINDS = [
        { kind: 'doctrine', arrKey: 'doctrine_rules', label: 'Doctrine' },
        { kind: 'roe',       arrKey: 'roe_rules',       label: 'ROE' },
        { kind: 'wra',       arrKey: 'wra_rules',       label: 'WRA' }
    ];
    var _selectedRuleKind = null; // 'doctrine' | 'roe' | 'wra'
    var _selectedRuleId   = null;

    function _ruleKindInfo(kind) {
        return DOCTRINE_RULE_KINDS.find(function (k) { return k.kind === kind; }) || null;
    }
    function nextFreeRuleId(kind, list) {
        var taken = new Set((list || []).map(function (r) { return r && r.id; }).filter(Boolean));
        var i = 1;
        while (taken.has(kind + '-' + i)) i++;
        return kind + '-' + i;
    }
    function _selectRule(kind, id) { _selectedRuleKind = kind; _selectedRuleId = id; }
    function _clearRuleSelection() { _selectedRuleKind = null; _selectedRuleId = null; }
    function _findSelectedRule(d) {
        if (!_selectedRuleKind || !_selectedRuleId || !d) return null;
        var info = _ruleKindInfo(_selectedRuleKind);
        if (!info) return null;
        return (d[info.arrKey] || []).find(function (r) { return r.id === _selectedRuleId; }) || null;
    }
    function defaultRuleForKind(kind, list) {
        var base = { id: nextFreeRuleId(kind, list), enabled: true, decision: 'allow', severity: 'info', reason: '' };
        if (kind === 'doctrine') return Object.assign(base, { applies_to_side: '', condition: '', action: '' });
        if (kind === 'roe') return Object.assign(base, {
            target_domain: '', target_status: '', hostile_confirmed_required: false,
            collateral_risk_max: null, restricted_area_ids: []
        });
        return Object.assign(base, { // wra
            weapon_class: '', target_class: '', max_range_nm: null,
            min_confidence: null, required_sensor_quality: '', salvo_limit: null
        });
    }

    function renderDoctrineCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Doctrine / ROE / WRA · العقيدة / قواعد الاشتباك' })
            ])
        ]);
        card.appendChild(el('div', { class: 'sw-edit-hint', text:
            'Authored constraints the runtime doctrine gate evaluates (never auto-executes weapon_release or move/destroy effects — approval-only). ' +
            'Written to doctrine_rules / roe_rules / wra_rules at scenario top level.' }));

        var listEl   = el('div', { class: 'sw-forces-tree' });
        var detailEl = el('div', { class: 'sw-forces-detail' });

        function rerenderList() {
            listEl.innerHTML = '';
            DOCTRINE_RULE_KINDS.forEach(function (info) {
                var list = Array.isArray(_draft[info.arrKey]) ? _draft[info.arrKey] : [];
                var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ ' + info.label + ' rule' });
                addBtn.addEventListener('click', function () {
                    if (!Array.isArray(_draft[info.arrKey])) _draft[info.arrKey] = [];
                    var rule = defaultRuleForKind(info.kind, _draft[info.arrKey]);
                    _draft[info.arrKey].push(rule);
                    _selectRule(info.kind, rule.id);
                    _markDirty();
                    rerenderList(); rerenderDetail();
                });
                var groupHeader = el('div', { class: 'sw-forces-group-header' }, [
                    el('span', { text: info.label + ' (' + list.length + ')' }), addBtn
                ]);
                listEl.appendChild(groupHeader);
                list.forEach(function (r) {
                    var isSel = _selectedRuleKind === info.kind && _selectedRuleId === r.id;
                    var row = el('div', { class: 'sw-forces-row' + (isSel ? ' selected' : '') }, [
                        el('span', { text: (r.id || '(no id)') + ' — ' + (r.decision || 'allow') + (r.reason ? (': ' + r.reason) : '') })
                    ]);
                    row.addEventListener('click', function () { _selectRule(info.kind, r.id); rerenderDetail(); rerenderList(); });
                    listEl.appendChild(row);
                });
            });
        }

        function rerenderDetail() {
            detailEl.innerHTML = '';
            var r = _findSelectedRule(_draft);
            if (!r) {
                detailEl.appendChild(el('div', { class: 'sw-edit-hint', text: 'Select a rule on the left, or add a new one.' }));
                return;
            }
            var info = _ruleKindInfo(_selectedRuleKind);
            var rmBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove rule' });
            rmBtn.addEventListener('click', function () {
                _draft[info.arrKey] = (_draft[info.arrKey] || []).filter(function (x) { return x !== r; });
                _clearRuleSelection(); _markDirty();
                rerenderList(); rerenderDetail();
            });

            var fields = [];
            fields.push(fieldRow('id', textInput(r.id || '', function (v) { r.id = v; rerenderList(); })));
            fields.push(fieldRow('enabled', checkboxInput(r.enabled !== false, function (v) { r.enabled = v; })));
            fields.push(fieldRow('decision', selectInput(DOCTRINE_DECISIONS, r.decision || 'allow', function (v) { r.decision = v; rerenderList(); })));
            fields.push(fieldRow('severity', selectInput(DOCTRINE_SEVERITIES, r.severity || 'info', function (v) { r.severity = v; })));
            fields.push(fieldRow('reason', textInput(r.reason || '', function (v) { r.reason = v; rerenderList(); })));
            fields.push(fieldRow('requires_authority', checkboxInput(!!r.requires_authority, function (v) { r.requires_authority = v; })));

            if (info.kind === 'doctrine') {
                fields.push(fieldRow('applies_to_side', selectInput(
                    [''].concat((Array.isArray(_draft.sides) ? _draft.sides : []).map(function (s) { return s.id; })),
                    r.applies_to_side || '', function (v) { r.applies_to_side = v; })));
                fields.push(fieldRow('condition', textInput(r.condition || '', function (v) { r.condition = v; })));
                fields.push(fieldRow('action', textInput(r.action || '', function (v) { r.action = v; })));
            } else if (info.kind === 'roe') {
                fields.push(fieldRow('target_domain', textInput(r.target_domain || '', function (v) { r.target_domain = v; })));
                fields.push(fieldRow('target_status', textInput(r.target_status || '', function (v) { r.target_status = v; })));
                fields.push(fieldRow('hostile_confirmed_required', checkboxInput(!!r.hostile_confirmed_required, function (v) { r.hostile_confirmed_required = v; })));
                fields.push(fieldRow('collateral_risk_max (0..1)', numberInput(r.collateral_risk_max, function (v) { r.collateral_risk_max = v; }, { min: 0, max: 1, step: '0.01' })));
            } else { // wra
                fields.push(fieldRow('weapon_class', textInput(r.weapon_class || '', function (v) { r.weapon_class = v; })));
                fields.push(fieldRow('target_class', textInput(r.target_class || '', function (v) { r.target_class = v; })));
                fields.push(fieldRow('max_range_nm', numberInput(r.max_range_nm, function (v) { r.max_range_nm = v; }, { min: 0 })));
                fields.push(fieldRow('min_confidence (0..1)', numberInput(r.min_confidence, function (v) { r.min_confidence = v; }, { min: 0, max: 1, step: '0.01' })));
                fields.push(fieldRow('required_sensor_quality', textInput(r.required_sensor_quality || '', function (v) { r.required_sensor_quality = v; })));
                fields.push(fieldRow('salvo_limit', numberInput(r.salvo_limit, function (v) { r.salvo_limit = v; }, { min: 0, integer: true })));
            }

            detailEl.appendChild(el('dl', { class: 'sw-kv' }, fields));
            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [rmBtn]));
        }

        rerenderList();
        rerenderDetail();
        card.appendChild(listEl);
        card.appendChild(detailEl);
        host.appendChild(card);
    }

    /* ---- Slice 6: Missions / tasking / routes authoring -------------------
     * Same list+detail idiom as renderDoctrineCard, single-array version (no
     * kind grouping — just mission_tasks[]). Written to the CANONICAL field
     * names runtime-events.js's normalizeMissionTasks() expects (id, unit_id,
     * group_id, kind, start_elapsed_hours, end_elapsed_hours, objective_id,
     * status, enabled, source) at scenario top level — that normalizer reads
     * scenario.mission_tasks concatenated with scenario.runtime_scenario.
     * mission_tasks, so top-level is what a live-mounted scenario needs.
     * `route` captures a drawn path via the existing _beginPickOnMapPolyline
     * picker — same pattern already used for the pipeline field in the
     * Geometry card. As of Batch C Slices C1/C2, `route` (and an explicit
     * `unit_ids[]` for group/formation tasks) are REAL runtime inputs —
     * free-fight-demo.js's _startAuthoredMissionMovement() drives the
     * runtime-movement engine from them every tick; they are no longer
     * authoring-only/inert. */
    var _selectedMissionTaskId = null;
    function _selectMissionTask(id) { _selectedMissionTaskId = id; }
    function _clearMissionTaskSelection() { _selectedMissionTaskId = null; }
    function _findSelectedMissionTask(d) {
        if (!_selectedMissionTaskId || !d) return null;
        return (d.mission_tasks || []).find(function (t) { return t.id === _selectedMissionTaskId; }) || null;
    }
    function nextFreeMissionTaskId(list) {
        var taken = new Set((list || []).map(function (t) { return t && t.id; }).filter(Boolean));
        var i = 1;
        while (taken.has('mission-task-' + i)) i++;
        return 'mission-task-' + i;
    }
    var MISSION_TASK_KINDS = ['task', 'patrol', 'strike', 'recon', 'escort', 'resupply', 'hold'];
    var MISSION_TASK_STATUSES = ['planned', 'active', 'complete', 'cancelled'];
    function defaultMissionTask(list) {
        return {
            id: nextFreeMissionTaskId(list), unit_id: '', group_id: '', kind: 'task',
            start_elapsed_hours: null, end_elapsed_hours: null, objective_id: '',
            status: 'planned', enabled: true, source: 'scenario', route: [], unit_ids: []
        };
    }

    function renderMissionsCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Missions / Tasking · المهام' })
            ])
        ]);
        card.appendChild(el('div', { class: 'sw-edit-hint', text:
            'Mission task windows the runtime events engine reads (activeMissionTasks). Written to mission_tasks at scenario top level.' }));

        var listEl   = el('div', { class: 'sw-forces-tree' });
        var detailEl = el('div', { class: 'sw-forces-detail' });

        function rerenderList() {
            listEl.innerHTML = '';
            var list = Array.isArray(_draft.mission_tasks) ? _draft.mission_tasks : [];
            var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Mission task' });
            addBtn.addEventListener('click', function () {
                if (!Array.isArray(_draft.mission_tasks)) _draft.mission_tasks = [];
                var task = defaultMissionTask(_draft.mission_tasks);
                _draft.mission_tasks.push(task);
                _selectMissionTask(task.id);
                _markDirty();
                rerenderList(); rerenderDetail();
            });
            listEl.appendChild(el('div', { class: 'sw-forces-group-header' }, [
                el('span', { text: 'Mission tasks (' + list.length + ')' }), addBtn
            ]));
            list.forEach(function (t) {
                var isSel = _selectedMissionTaskId === t.id;
                var summary = (t.id || '(no id)') + ' — ' + (t.kind || 'task') + ' (' + (t.status || 'planned') + ')' +
                    (t.unit_id ? (' · ' + t.unit_id) : '');
                var row = el('div', { class: 'sw-forces-row' + (isSel ? ' selected' : '') }, [el('span', { text: summary })]);
                row.addEventListener('click', function () { _selectMissionTask(t.id); rerenderDetail(); rerenderList(); });
                listEl.appendChild(row);
            });
        }

        function rerenderDetail() {
            detailEl.innerHTML = '';
            var t = _findSelectedMissionTask(_draft);
            if (!t) {
                detailEl.appendChild(el('div', { class: 'sw-edit-hint', text: 'Select a mission task on the left, or add a new one.' }));
                return;
            }
            var rmBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove mission task' });
            rmBtn.addEventListener('click', function () {
                _draft.mission_tasks = (_draft.mission_tasks || []).filter(function (x) { return x !== t; });
                _clearMissionTaskSelection(); _markDirty();
                rerenderList(); rerenderDetail();
            });

            var routeTa = textArea(coordsToLines(t.route), 4, function (v) { t.route = parseCoordLines(v); });
            var drawRouteBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Draw route on map' });
            drawRouteBtn.addEventListener('click', function () {
                setStatus('Click waypoints on the map, double-click (or Enter) to finish, Esc to cancel.', false);
                _beginPickOnMapPolyline(function (line) {
                    t.route = line;
                    routeTa.value = coordsToLines(line);
                    setStatus('Route captured — ' + line.length + ' waypoints.', false);
                }, function () { setStatus('Route draw cancelled.', false); });
            });

            var fields = [];
            fields.push(fieldRow('id', textInput(t.id || '', function (v) { t.id = v; rerenderList(); })));
            fields.push(fieldRow('unit_id', textInput(t.unit_id || '', function (v) { t.unit_id = v; rerenderList(); })));
            fields.push(fieldRow('group_id', textInput(t.group_id || '', function (v) { t.group_id = v; })));
            // Batch C Slice C2: group_id has no unit-membership registry
            // anywhere in this codebase — an explicit unit_ids[] (>= 2
            // entries) is what actually drives group/formation movement,
            // same resolution the SCC's manual "Movement tasking" form
            // already uses (Group unit IDs + Leader).
            fields.push(fieldRow('unit_ids (comma-separated, for group movement)', textInput(
                Array.isArray(t.unit_ids) ? t.unit_ids.join(', ') : '',
                function (v) { t.unit_ids = String(v || '').split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean); }
            )));
            fields.push(fieldRow('kind', selectInput(MISSION_TASK_KINDS, t.kind || 'task', function (v) { t.kind = v; rerenderList(); })));
            fields.push(fieldRow('status', selectInput(MISSION_TASK_STATUSES, t.status || 'planned', function (v) { t.status = v; rerenderList(); })));
            fields.push(fieldRow('enabled', checkboxInput(t.enabled !== false, function (v) { t.enabled = v; })));
            fields.push(fieldRow('start_elapsed_hours', numberInput(t.start_elapsed_hours, function (v) { t.start_elapsed_hours = v; }, {})));
            fields.push(fieldRow('end_elapsed_hours', numberInput(t.end_elapsed_hours, function (v) { t.end_elapsed_hours = v; }, {})));
            fields.push(fieldRow('objective_id', textInput(t.objective_id || '', function (v) { t.objective_id = v; })));
            fields.push(fieldRow('route (lon, lat per line)', routeTa));

            detailEl.appendChild(el('dl', { class: 'sw-kv' }, fields));
            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [drawRouteBtn]));
            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [rmBtn]));
        }

        rerenderList();
        rerenderDetail();
        card.appendChild(listEl);
        card.appendChild(detailEl);
        host.appendChild(card);
    }

    /* ---- Slice 7: Runtime events / triggers authoring ---------------------
     * Same list+detail idiom as renderMissionsCard, plus a nested per-event
     * effects[] sub-list. Written to the CANONICAL field names runtime-
     * events.js's normalizeRuntimeEvents() expects (id, at_elapsed_hours,
     * at_time, kind, title, description, once, enabled, effects[], tags,
     * source) at scenario top level. Effect kind is a <select> restricted to
     * the 8-item SAFE_RUNTIME_EFFECT_KINDS allowlist — anything else is
     * silently 'blocked' by the runtime gate, so authoring anything outside
     * it would build a rule that can never fire; effect payload is authored
     * as free-form JSON (a textarea, parsed defensively) since payload shape
     * varies per effect kind. `trigger_zone` (a closed polygon ring) is
     * captured via the existing _beginPickOnMapPolygon picker. As of Batch C
     * Slice C4, `trigger_type` ('time'|'geo'|'both', default 'time' so every
     * existing scenario is unaffected) + `trigger_zone` + `trigger_unit_id`
     * (which entity's live position to test; blank = any known position) are
     * REAL runtime inputs — runtime-events.js evaluates them via
     * turf.booleanPointInPolygon, no longer authoring-only/inert. */
    var _selectedEventId = null;
    function _selectEvent(id) { _selectedEventId = id; }
    function _clearEventSelection() { _selectedEventId = null; }
    function _findSelectedEvent(d) {
        if (!_selectedEventId || !d) return null;
        return (d.runtime_events || []).find(function (e) { return e.id === _selectedEventId; }) || null;
    }
    function nextFreeEventId(list) {
        var taken = new Set((list || []).map(function (e) { return e && e.id; }).filter(Boolean));
        var i = 1;
        while (taken.has('runtime-event-' + i)) i++;
        return 'runtime-event-' + i;
    }
    function nextFreeEffectId(list) {
        var taken = new Set((list || []).map(function (e) { return e && e.id; }).filter(Boolean));
        var i = 1;
        while (taken.has('effect-' + i)) i++;
        return 'effect-' + i;
    }
    var RUNTIME_TRIGGER_TYPES = ['time', 'geo', 'both'];
    function defaultRuntimeEvent(list) {
        return {
            id: nextFreeEventId(list), title: '', description: '', kind: 'runtime_event',
            at_elapsed_hours: null, at_time: '', once: true, enabled: true,
            effects: [], tags: [], source: 'scenario', trigger_zone: [],
            trigger_type: 'time', trigger_unit_id: ''
        };
    }
    function defaultRuntimeEffect(list) {
        return { id: nextFreeEffectId(list), kind: RUNTIME_SAFE_EFFECT_KINDS[0], payload: {} };
    }

    function renderEventsCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Events (trigger → condition → action) · الأحداث' })
            ])
        ]);
        card.appendChild(el('div', { class: 'sw-edit-hint', text:
            'Time and/or geo-triggered runtime events the evaluator reads (read-only — approvals/journal only, never auto-executes dangerous effects). ' +
            'trigger_type "geo"/"both" evaluates trigger_zone against trigger_unit_id\'s live position (blank = any unit). ' +
            'Effect kind is restricted to the safe allowlist: ' + RUNTIME_SAFE_EFFECT_KINDS.join(', ') + '.' }));

        var listEl   = el('div', { class: 'sw-forces-tree' });
        var detailEl = el('div', { class: 'sw-forces-detail' });

        function rerenderList() {
            listEl.innerHTML = '';
            var list = Array.isArray(_draft.runtime_events) ? _draft.runtime_events : [];
            var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Runtime event' });
            addBtn.addEventListener('click', function () {
                if (!Array.isArray(_draft.runtime_events)) _draft.runtime_events = [];
                var ev = defaultRuntimeEvent(_draft.runtime_events);
                _draft.runtime_events.push(ev);
                _selectEvent(ev.id);
                _markDirty();
                rerenderList(); rerenderDetail();
            });
            listEl.appendChild(el('div', { class: 'sw-forces-group-header' }, [
                el('span', { text: 'Runtime events (' + list.length + ')' }), addBtn
            ]));
            list.forEach(function (ev) {
                var isSel = _selectedEventId === ev.id;
                var effCount = Array.isArray(ev.effects) ? ev.effects.length : 0;
                var summary = (ev.id || '(no id)') + ' — ' + (ev.title || ev.kind || 'event') + ' (' + effCount + ' effect' + (effCount === 1 ? '' : 's') + ')';
                var row = el('div', { class: 'sw-forces-row' + (isSel ? ' selected' : '') }, [el('span', { text: summary })]);
                row.addEventListener('click', function () { _selectEvent(ev.id); rerenderDetail(); rerenderList(); });
                listEl.appendChild(row);
            });
        }

        function rerenderEffects(container, ev) {
            container.innerHTML = '';
            if (!Array.isArray(ev.effects)) ev.effects = [];
            var addEffBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Effect' });
            addEffBtn.addEventListener('click', function () {
                ev.effects.push(defaultRuntimeEffect(ev.effects));
                _markDirty();
                rerenderEffects(container, ev); rerenderList();
            });
            container.appendChild(el('div', { class: 'sw-forces-group-header' }, [
                el('span', { text: 'Effects (' + ev.effects.length + ')' }), addEffBtn
            ]));
            ev.effects.forEach(function (fx, idx) {
                var kindSel = selectInput(RUNTIME_SAFE_EFFECT_KINDS, fx.kind || RUNTIME_SAFE_EFFECT_KINDS[0], function (v) {
                    fx.kind = v; rerenderList();
                });
                var payloadTa = textArea(JSON.stringify(fx.payload || {}, null, 0), 2, function (v) {
                    try { fx.payload = JSON.parse(v); } catch (_) { /* leave payload unchanged until valid JSON is typed */ }
                });
                var rmEffBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove' });
                rmEffBtn.addEventListener('click', function () {
                    ev.effects = ev.effects.filter(function (x) { return x !== fx; });
                    _markDirty();
                    rerenderEffects(container, ev); rerenderList();
                });
                container.appendChild(el('div', { class: 'sw-kv-row sw-edit-row' }, [
                    el('dt', { text: 'effect[' + idx + ']' }),
                    el('dd', null, [kindSel, payloadTa, rmEffBtn])
                ]));
            });
        }

        function rerenderDetail() {
            detailEl.innerHTML = '';
            var ev = _findSelectedEvent(_draft);
            if (!ev) {
                detailEl.appendChild(el('div', { class: 'sw-edit-hint', text: 'Select an event on the left, or add a new one.' }));
                return;
            }
            var rmBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove event' });
            rmBtn.addEventListener('click', function () {
                _draft.runtime_events = (_draft.runtime_events || []).filter(function (x) { return x !== ev; });
                _clearEventSelection(); _markDirty();
                rerenderList(); rerenderDetail();
            });

            var zoneTa = textArea(coordsToLines(ev.trigger_zone), 3, function (v) { ev.trigger_zone = parseCoordLines(v); });
            var drawZoneBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Draw trigger zone on map' });
            drawZoneBtn.addEventListener('click', function () {
                setStatus('Click vertices on the map, double-click (or Enter) to finish, Esc to cancel.', false);
                _beginPickOnMapPolygon(function (ring) {
                    ev.trigger_zone = ring;
                    zoneTa.value = coordsToLines(ring);
                    setStatus('Trigger zone captured — ' + ring.length + ' vertices.', false);
                }, function () { setStatus('Trigger zone draw cancelled.', false); });
            });

            var fields = [];
            fields.push(fieldRow('id', textInput(ev.id || '', function (v) { ev.id = v; rerenderList(); })));
            fields.push(fieldRow('title', textInput(ev.title || '', function (v) { ev.title = v; rerenderList(); })));
            fields.push(fieldRow('description', textArea(ev.description || '', 2, function (v) { ev.description = v; })));
            fields.push(fieldRow('at_elapsed_hours', numberInput(ev.at_elapsed_hours, function (v) { ev.at_elapsed_hours = v; }, {})));
            fields.push(fieldRow('at_time (ISO, optional)', textInput(ev.at_time || '', function (v) { ev.at_time = v; })));
            fields.push(fieldRow('once', checkboxInput(ev.once !== false, function (v) { ev.once = v; })));
            fields.push(fieldRow('enabled', checkboxInput(ev.enabled !== false, function (v) { ev.enabled = v; })));
            fields.push(fieldRow('tags (comma-separated)', textInput((ev.tags || []).join(', '), function (v) {
                ev.tags = v.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            })));
            fields.push(fieldRow('trigger_type', selectInput(RUNTIME_TRIGGER_TYPES, ev.trigger_type || 'time', function (v) { ev.trigger_type = v; })));
            fields.push(fieldRow('trigger_unit_id (blank = any unit)', textInput(ev.trigger_unit_id || '', function (v) { ev.trigger_unit_id = v; })));
            fields.push(fieldRow('trigger_zone (lon, lat per line)', zoneTa));

            detailEl.appendChild(el('dl', { class: 'sw-kv' }, fields));
            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [drawZoneBtn]));

            var effectsHost = el('div', { class: 'sw-events-effects' });
            rerenderEffects(effectsHost, ev);
            detailEl.appendChild(effectsHost);

            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [rmBtn]));
        }

        rerenderList();
        rerenderDetail();
        card.appendChild(listEl);
        card.appendChild(detailEl);
        host.appendChild(card);
    }

    /* ---- Slice 8: Decision points authoring --------------------------------
     * Same list+detail idiom as renderMissionsCard, plus a nested per-point
     * options[] sub-list (id/label pairs, mirrors the effects[] sub-list
     * pattern from Slice 7). Written to the CANONICAL field names runtime-
     * events.js's normalizeDecisionPoints() expects (id, trigger_elapsed_
     * hours, title, options[], expires_elapsed_hours, status, enabled,
     * source) at scenario top level. */
    var _selectedDecisionPointId = null;
    function _selectDecisionPoint(id) { _selectedDecisionPointId = id; }
    function _clearDecisionPointSelection() { _selectedDecisionPointId = null; }
    function _findSelectedDecisionPoint(d) {
        if (!_selectedDecisionPointId || !d) return null;
        return (d.decision_points || []).find(function (p) { return p.id === _selectedDecisionPointId; }) || null;
    }
    function nextFreeDecisionPointId(list) {
        var taken = new Set((list || []).map(function (p) { return p && p.id; }).filter(Boolean));
        var i = 1;
        while (taken.has('decision-point-' + i)) i++;
        return 'decision-point-' + i;
    }
    function nextFreeOptionId(list) {
        var taken = new Set((list || []).map(function (o) { return o && o.id; }).filter(Boolean));
        var i = 1;
        while (taken.has('option-' + i)) i++;
        return 'option-' + i;
    }
    var DECISION_POINT_STATUSES = ['pending', 'open', 'closed', 'resolved', 'expired'];
    function defaultDecisionPoint(list) {
        return {
            id: nextFreeDecisionPointId(list), title: '', trigger_elapsed_hours: null,
            options: [], expires_elapsed_hours: null, status: 'pending', enabled: true, source: 'scenario'
        };
    }
    function defaultDecisionOption(list) { return { id: nextFreeOptionId(list), label: '' }; }

    function renderDecisionsCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Decision Points · نقاط القرار' })
            ])
        ]);
        card.appendChild(el('div', { class: 'sw-edit-hint', text:
            'Time-based decision points the runtime events engine can surface for operator resolution. Written to decision_points at scenario top level.' }));

        var listEl   = el('div', { class: 'sw-forces-tree' });
        var detailEl = el('div', { class: 'sw-forces-detail' });

        function rerenderList() {
            listEl.innerHTML = '';
            var list = Array.isArray(_draft.decision_points) ? _draft.decision_points : [];
            var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Decision point' });
            addBtn.addEventListener('click', function () {
                if (!Array.isArray(_draft.decision_points)) _draft.decision_points = [];
                var dp = defaultDecisionPoint(_draft.decision_points);
                _draft.decision_points.push(dp);
                _selectDecisionPoint(dp.id);
                _markDirty();
                rerenderList(); rerenderDetail();
            });
            listEl.appendChild(el('div', { class: 'sw-forces-group-header' }, [
                el('span', { text: 'Decision points (' + list.length + ')' }), addBtn
            ]));
            list.forEach(function (dp) {
                var isSel = _selectedDecisionPointId === dp.id;
                var optCount = Array.isArray(dp.options) ? dp.options.length : 0;
                var summary = (dp.id || '(no id)') + ' — ' + (dp.title || 'untitled') + ' (' + optCount + ' option' + (optCount === 1 ? '' : 's') + ', ' + (dp.status || 'pending') + ')';
                var row = el('div', { class: 'sw-forces-row' + (isSel ? ' selected' : '') }, [el('span', { text: summary })]);
                row.addEventListener('click', function () { _selectDecisionPoint(dp.id); rerenderDetail(); rerenderList(); });
                listEl.appendChild(row);
            });
        }

        function rerenderOptions(container, dp) {
            container.innerHTML = '';
            if (!Array.isArray(dp.options)) dp.options = [];
            var addOptBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Option' });
            addOptBtn.addEventListener('click', function () {
                dp.options.push(defaultDecisionOption(dp.options));
                _markDirty();
                rerenderOptions(container, dp); rerenderList();
            });
            container.appendChild(el('div', { class: 'sw-forces-group-header' }, [
                el('span', { text: 'Options (' + dp.options.length + ')' }), addOptBtn
            ]));
            dp.options.forEach(function (o, idx) {
                var idInp = textInput(o.id || '', function (v) { o.id = v; });
                var labelInp = textInput(o.label || '', function (v) { o.label = v; });
                var rmOptBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove' });
                rmOptBtn.addEventListener('click', function () {
                    dp.options = dp.options.filter(function (x) { return x !== o; });
                    _markDirty();
                    rerenderOptions(container, dp); rerenderList();
                });
                container.appendChild(el('div', { class: 'sw-kv-row sw-edit-row' }, [
                    el('dt', { text: 'option[' + idx + ']' }),
                    el('dd', null, [idInp, labelInp, rmOptBtn])
                ]));
            });
        }

        function rerenderDetail() {
            detailEl.innerHTML = '';
            var dp = _findSelectedDecisionPoint(_draft);
            if (!dp) {
                detailEl.appendChild(el('div', { class: 'sw-edit-hint', text: 'Select a decision point on the left, or add a new one.' }));
                return;
            }
            var rmBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove decision point' });
            rmBtn.addEventListener('click', function () {
                _draft.decision_points = (_draft.decision_points || []).filter(function (x) { return x !== dp; });
                _clearDecisionPointSelection(); _markDirty();
                rerenderList(); rerenderDetail();
            });

            var fields = [];
            fields.push(fieldRow('id', textInput(dp.id || '', function (v) { dp.id = v; rerenderList(); })));
            fields.push(fieldRow('title', textInput(dp.title || '', function (v) { dp.title = v; rerenderList(); })));
            fields.push(fieldRow('trigger_elapsed_hours', numberInput(dp.trigger_elapsed_hours, function (v) { dp.trigger_elapsed_hours = v; }, {})));
            fields.push(fieldRow('expires_elapsed_hours', numberInput(dp.expires_elapsed_hours, function (v) { dp.expires_elapsed_hours = v; }, {})));
            fields.push(fieldRow('status', selectInput(DECISION_POINT_STATUSES, dp.status || 'pending', function (v) { dp.status = v; rerenderList(); })));
            fields.push(fieldRow('enabled', checkboxInput(dp.enabled !== false, function (v) { dp.enabled = v; })));

            detailEl.appendChild(el('dl', { class: 'sw-kv' }, fields));

            var optionsHost = el('div', { class: 'sw-events-effects' });
            rerenderOptions(optionsHost, dp);
            detailEl.appendChild(optionsHost);

            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [rmBtn]));
        }

        rerenderList();
        rerenderDetail();
        card.appendChild(listEl);
        card.appendChild(detailEl);
        host.appendChild(card);
    }

    /* ---- Slice 8: Victory / termination conditions authoring ---------------
     * Written to the CANONICAL field names runtime-events.js's
     * normalizeVictoryConditions() expects (id, kind, threshold,
     * evaluate_at_elapsed_hours, continuous, side, status, enabled, source)
     * at scenario top level. `threshold` is genuinely free-form in the
     * evaluator (a plain number OR an object, e.g. `{hours:4}` vs `0.7`) so
     * it's authored as JSON, parsed defensively like an event effect payload.
     * IMPORTANT (per plan): the engine does NOT auto-terminate a scenario on
     * these yet — authored as data only, never overclaimed as live. The card
     * says so explicitly. */
    var _selectedVictoryConditionId = null;
    function _selectVictoryCondition(id) { _selectedVictoryConditionId = id; }
    function _clearVictoryConditionSelection() { _selectedVictoryConditionId = null; }
    function _findSelectedVictoryCondition(d) {
        if (!_selectedVictoryConditionId || !d) return null;
        return (d.victory_conditions || []).find(function (v) { return v.id === _selectedVictoryConditionId; }) || null;
    }
    function nextFreeVictoryConditionId(list) {
        var taken = new Set((list || []).map(function (v) { return v && v.id; }).filter(Boolean));
        var i = 1;
        while (taken.has('victory-condition-' + i)) i++;
        return 'victory-condition-' + i;
    }
    var VICTORY_CONDITION_STATUSES = ['pending', 'met', 'failed', 'expired'];
    function defaultVictoryCondition(list) {
        return {
            id: nextFreeVictoryConditionId(list), kind: 'condition', threshold: null,
            evaluate_at_elapsed_hours: null, continuous: true, side: '', status: 'pending',
            enabled: true, source: 'scenario'
        };
    }

    function renderVictoryCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Victory / Termination Conditions · شروط الحسم' })
            ])
        ]);
        card.appendChild(el('div', { class: 'sw-warning sw-edit-hint', text:
            '⚠ Authored as data only — the engine does NOT auto-evaluate or auto-terminate a scenario on these conditions yet. ' +
            'No destructive evaluation. Written to victory_conditions at scenario top level.' }));

        var listEl   = el('div', { class: 'sw-forces-tree' });
        var detailEl = el('div', { class: 'sw-forces-detail' });

        function rerenderList() {
            listEl.innerHTML = '';
            var list = Array.isArray(_draft.victory_conditions) ? _draft.victory_conditions : [];
            var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: '+ Victory condition' });
            addBtn.addEventListener('click', function () {
                if (!Array.isArray(_draft.victory_conditions)) _draft.victory_conditions = [];
                var vc = defaultVictoryCondition(_draft.victory_conditions);
                _draft.victory_conditions.push(vc);
                _selectVictoryCondition(vc.id);
                _markDirty();
                rerenderList(); rerenderDetail();
            });
            listEl.appendChild(el('div', { class: 'sw-forces-group-header' }, [
                el('span', { text: 'Victory conditions (' + list.length + ')' }), addBtn
            ]));
            list.forEach(function (vc) {
                var isSel = _selectedVictoryConditionId === vc.id;
                var summary = (vc.id || '(no id)') + ' — ' + (vc.kind || 'condition') + (vc.side ? (' · ' + vc.side) : '') + ' (' + (vc.status || 'pending') + ')';
                var row = el('div', { class: 'sw-forces-row' + (isSel ? ' selected' : '') }, [el('span', { text: summary })]);
                row.addEventListener('click', function () { _selectVictoryCondition(vc.id); rerenderDetail(); rerenderList(); });
                listEl.appendChild(row);
            });
        }

        function rerenderDetail() {
            detailEl.innerHTML = '';
            var vc = _findSelectedVictoryCondition(_draft);
            if (!vc) {
                detailEl.appendChild(el('div', { class: 'sw-edit-hint', text: 'Select a victory condition on the left, or add a new one.' }));
                return;
            }
            var rmBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Remove victory condition' });
            rmBtn.addEventListener('click', function () {
                _draft.victory_conditions = (_draft.victory_conditions || []).filter(function (x) { return x !== vc; });
                _clearVictoryConditionSelection(); _markDirty();
                rerenderList(); rerenderDetail();
            });

            var thresholdTa = textArea(vc.threshold == null ? '' : JSON.stringify(vc.threshold), 2, function (v) {
                if (v.trim() === '') { vc.threshold = null; return; }
                try { vc.threshold = JSON.parse(v); } catch (_) { /* leave threshold unchanged until valid JSON is typed */ }
            });

            var fields = [];
            fields.push(fieldRow('id', textInput(vc.id || '', function (v) { vc.id = v; rerenderList(); })));
            fields.push(fieldRow('kind', textInput(vc.kind || '', function (v) { vc.kind = v; rerenderList(); })));
            fields.push(fieldRow('side', selectInput([''].concat((Array.isArray(_draft.sides) ? _draft.sides : []).map(function (s) { return s.id; })),
                vc.side || '', function (v) { vc.side = v; rerenderList(); })));
            fields.push(fieldRow('threshold (JSON: number or object)', thresholdTa));
            fields.push(fieldRow('evaluate_at_elapsed_hours', numberInput(vc.evaluate_at_elapsed_hours, function (v) { vc.evaluate_at_elapsed_hours = v; }, {})));
            fields.push(fieldRow('continuous', checkboxInput(vc.continuous !== false, function (v) { vc.continuous = v; })));
            fields.push(fieldRow('status', selectInput(VICTORY_CONDITION_STATUSES, vc.status || 'pending', function (v) { vc.status = v; rerenderList(); })));
            fields.push(fieldRow('enabled', checkboxInput(vc.enabled !== false, function (v) { vc.enabled = v; })));

            detailEl.appendChild(el('dl', { class: 'sw-kv' }, fields));
            detailEl.appendChild(el('div', { class: 'sw-edit-actions' }, [rmBtn]));
        }

        rerenderList();
        rerenderDetail();
        card.appendChild(listEl);
        card.appendChild(detailEl);
        host.appendChild(card);
    }

    /* ---- Slice 2C: placeholder card for engine-gap steps ----------------- */
    function renderPlaceholderCard(host, opts) {
        opts = opts || {};
        host.appendChild(el('div', { class: 'sw-gap-card' }, [
            el('div', { class: 'sw-gap-card-title', text: opts.title || 'Coming soon' }),
            el('div', { class: 'sw-gap-card-why',
                text: opts.why || 'This CMO build-order step is not yet modeled in RMOOZ.' }),
            el('div', { class: 'sw-gap-card-why',
                text: opts.slice ? ('Planned slice: ' + opts.slice) : '' })
        ]));
    }

    /* ---- Slice 2C: STEPS table (CMO build-order navigator) --------------- */
    // Mirrors docs/cmo-functional-rules/5-build-playbook.md step order. Steps
    // that aren't built yet render a placeholder card and carry gap:true so
    // the rail shows them as engine-GAPs (dashed pill instead of solid).
    var STEPS = [
        { id: 'meta',     title_en: 'Metadata & Version', title_ar: 'البيانات والإصدار',
          render: function (h) { renderMetadataCard(h); } },
        { id: 'map',      title_en: 'Map & AO',            title_ar: 'الخريطة ومنطقة العمليات',
          render: function (h) { renderAOCard(h); } },
        { id: 'sides',    title_en: 'Sides',               title_ar: 'الأطراف',
          render: function (h) { renderSidesCard(h); } },
        { id: 'posture',  title_en: 'Posture',             title_ar: 'الموقف',
          render: function (h) { renderPostureCard(h); } },
        { id: 'objectives', title_en: 'Objectives',        title_ar: 'الأهداف',
          render: function (h) { renderObjectivesCard(h); } },
        { id: 'doctrine', title_en: 'Doctrine / ROE',      title_ar: 'العقيدة / قواعد الاشتباك',
          render: function (h) { renderDoctrineCard(h); } },
        { id: 'time',     title_en: 'Time & Duration',     title_ar: 'الزمن والمدة',
          render: function (h) { renderTimeDurationCard(h); } },
        { id: 'weather',  title_en: 'Weather',             title_ar: 'الطقس', gap: true,
          render: function (h) { renderPlaceholderCard(h, {
            title: 'Weather / Sea State',
            why: 'CMO playbook Step 8 ⚠️ partial — only terrain_note + terrain_friction exist. No weather / sea-state schema yet.',
            slice: 'A later schema-extension slice'
          }); } },
        { id: 'geom',     title_en: 'Forces Geometry',     title_ar: 'هندسة القوات',
          render: function (h) { renderGeometryCard(h); } },
        { id: 'forces',   title_en: 'Forces (OOB)',        title_ar: 'القوات',
          render: function (h) { renderForcesCard(h); } },
        { id: 'missions', title_en: 'Missions',            title_ar: 'المهام',
          render: function (h) { renderMissionsCard(h); } },
        { id: 'events',   title_en: 'Events',              title_ar: 'الأحداث',
          render: function (h) { renderEventsCard(h); } },
        { id: 'decisions', title_en: 'Decision Points',     title_ar: 'نقاط القرار',
          render: function (h) { renderDecisionsCard(h); } },
        { id: 'victory',  title_en: 'Victory Conditions',   title_ar: 'شروط الحسم',
          render: function (h) { renderVictoryCard(h); } },
        { id: 'briefing', title_en: 'Briefing',            title_ar: 'التلخيص',
          render: function (h) { renderBriefingCard(h); } },
        { id: 'save',     title_en: 'Validate & Save',     title_ar: 'التحقق والحفظ',
          render: function (h) { renderSaveStepCard(h); } }
    ];

    /* ---- Slice 2C: per-step completion predicates ------------------------ */
    function isBboxValidish(b) {
        return Array.isArray(b) && b.length === 4 && b.every(function (n) { return typeof n === 'number' && isFinite(n); }) &&
               (b[0] !== 0 || b[1] !== 0 || b[2] !== 0 || b[3] !== 0);
    }
    function stepIsComplete(d, stepIdx) {
        if (!d) return false;
        switch (STEPS[stepIdx] && STEPS[stepIdx].id) {
            case 'meta':     return !!(d.name && d.scenario_label);
            case 'map':      return isBboxValidish(d.map_bbox) && Array.isArray(d.ao_boundaries) && d.ao_boundaries.length > 0;
            case 'sides':    return Array.isArray(d.sides) && d.sides.length >= 2;
            case 'posture':  return !!(d.postures && d.postures.BLUE && d.postures.RED);
            case 'doctrine': return (Array.isArray(d.doctrine_rules) && d.doctrine_rules.length > 0) ||
                                     (Array.isArray(d.roe_rules) && d.roe_rules.length > 0) ||
                                     (Array.isArray(d.wra_rules) && d.wra_rules.length > 0);
            case 'time':     return Array.isArray(d.phase_table) && d.phase_table.length > 0 &&
                                    Array.isArray(d.steps) && d.steps.length === d.phase_table.length;
            case 'weather':  return null; // gap
            case 'geom':     return Array.isArray(d.bls_template) && d.bls_template.length >= 1 &&
                                    d.obj && !!d.obj.name && Array.isArray(d.pipeline) && d.pipeline.length >= 2;
            case 'forces':   return Array.isArray(d.red_units) && d.red_units.length >= 1 &&
                                    Array.isArray(d.blue_units_initial) && d.blue_units_initial.length >= 1;
            case 'missions': return Array.isArray(d.mission_tasks) && d.mission_tasks.length > 0;
            case 'events':   return Array.isArray(d.runtime_events) && d.runtime_events.length > 0;
            case 'decisions': return Array.isArray(d.decision_points) && d.decision_points.length > 0;
            case 'victory':  return Array.isArray(d.victory_conditions) && d.victory_conditions.length > 0;
            case 'briefing': return Array.isArray(d.steps) && d.steps.length > 0 &&
                                    d.steps.every(function (s) { return s && !!s.narrative_en_baseline; });
            case 'save':     return validateAllHardRules(d).ok;
            default:         return false;
        }
    }
    function stepPillClass(d, stepIdx) {
        var step = STEPS[stepIdx];
        if (!step) return 'empty';
        if (step.gap) return 'gap';
        var c = stepIsComplete(d, stepIdx);
        if (c === true)  return 'ok';
        if (c === false) return 'empty';
        return 'gap';
    }

    /* ---- Slice 2C: New Scenario inline form ------------------------------ */
    /* ---- Slice 10: single ingestion door for ALL four entry paths --------
     * Manual (native "New Scenario" form), AI (Slice 9 brief-to-scenario-v2),
     * template (starter-template registry), and import (scenario-import-
     * wizard.js) all converge here. Stamps commander_review_status:
     * 'needs_review' (the SAME literal brief-to-scenario-v2.js already
     * writes for AI drafts — reusing it, not inventing a second convention)
     * + entry_source for provenance. Opens the draft in the editor for
     * operator review. NEVER calls mount()/setMode(true)/activates a
     * scenario — that stays a separate, later, explicitly-gated step
     * (Slice 11 Launch-to-SCC). */
    function openDraftForReview(draft, opts) {
        opts = opts || {};
        var d = clone(draft || {});
        d.commander_review_status = 'needs_review';
        d.entry_source = opts.source || 'unknown';
        _draft = d;
        _activeStep = 0;
        _savedState = 'unsaved';
        renderEditor();
        renderIndicator();
        try {
            logOperator('Scenario draft opened for review (' + d.entry_source + ')',
                { name: d.name || '', source: d.entry_source });
        } catch (_) {}
        return d;
    }

    function renderNewScenarioForm(host) {
        var nameInp  = el('input', { type: 'text', class: 'sw-edit-input', placeholder: 'e.g. my-scenario' });
        var labelInp = el('input', { type: 'text', class: 'sw-edit-input', placeholder: 'Human-readable title' });
        var labelAr  = el('input', { type: 'text', class: 'sw-edit-input', placeholder: 'العنوان بالعربية', dir: 'rtl' });
        // Slice 2D-1K: base-template picker is now a live list. Defaults to
        // '(empty)' so the form is usable even if the API call fails.
        var baseSel  = el('select', { class: 'sw-edit-input' });
        var emptyOpt = el('option', { value: '__empty__', text: '(empty)' });
        baseSel.appendChild(emptyOpt);
        // Fetch the list of saved scenarios — appears as a group below.
        // No blocking; if the fetch fails the form still works with (empty).
        (function () {
            try {
                fetch('/api/ai/scenarios', { credentials: 'include' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) {
                        if (!j || !Array.isArray(j.scenarios) || !j.scenarios.length) return;
                        var grp = el('optgroup', { label: 'Start from existing saved scenario:' });
                        j.scenarios.forEach(function (name) {
                            grp.appendChild(el('option', { value: 'saved:' + name, text: name }));
                        });
                        baseSel.appendChild(grp);
                    })
                    .catch(function () { /* silent — (empty) still works */ });
            } catch (_) {}
        })();
        // Slice 10: starter-template registry (replaces the old hardcoded,
        // dead 'sahil-corridor-sample' option that never actually loaded
        // anything — this one really fetches the template JSON).
        (function () {
            try {
                fetch('/api/scenario-templates', { credentials: 'include' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) {
                        if (!j || !Array.isArray(j.templates) || !j.templates.length) return;
                        var grp = el('optgroup', { label: 'Starter templates:' });
                        j.templates.forEach(function (t) {
                            grp.appendChild(el('option', { value: 'template:' + t.id, text: t.label }));
                        });
                        baseSel.appendChild(grp);
                    })
                    .catch(function () { /* silent — (empty) still works */ });
            } catch (_) {}
        })();
        var cancelBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Cancel' });
        var createBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: 'Create' });
        var statusSpan = el('span', { class: 'sw-edit-status', text: '' });

        // Slice 10: AI brief-to-draft entry path, in the same form so it
        // lands through the same openDraftForReview() door as manual/
        // template/import (never mounts/activates; opens in Edit Mode for
        // operator review — every generated unit is already stamped
        // needs_review:true/exact_unit_position:false server-side).
        var briefTa  = textArea('', 3, function () {});
        var aiGenBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Generate draft with AI (from brief)' });
        aiGenBtn.addEventListener('click', function () {
            var briefText = briefTa.value || '';
            if (briefText.trim().length < 10) {
                statusSpan.textContent = 'Enter a longer brief (at least 10 characters) to generate a draft.';
                statusSpan.style.color = '#d6332e';
                return;
            }
            var name = sanitiseName(nameInp.value) || 'ai-draft-scenario';
            statusSpan.textContent = 'Generating draft from brief …';
            statusSpan.style.color = '#1a7f37';
            fetch('/api/ai/scenario/generate-from-brief', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brief_text: briefText, name: name, scenario_label: labelInp.value || undefined })
            }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
              .then(function (resp) {
                  if (!resp.ok || !resp.body || !resp.body.ok || !resp.body.scenario) {
                      statusSpan.textContent = 'AI generation failed: ' + ((resp.body && resp.body.error) || 'unknown error');
                      statusSpan.style.color = '#d6332e';
                      return;
                  }
                  close();
                  openDraftForReview(resp.body.scenario, { source: 'ai' });
              })
              .catch(function (e) {
                  statusSpan.textContent = 'Network error: ' + (e && e.message);
                  statusSpan.style.color = '#d6332e';
              });
        });

        var form = el('div', { class: 'sw-newscen-form' }, [
            el('div', { class: 'sw-newscen-form-title', text: 'New scenario / سيناريو جديد' }),
            el('dl', { class: 'sw-kv' }, [
                fieldRow('name (filename, sanitised)', nameInp),
                fieldRow('Label (EN)', labelInp),
                fieldRow('Label (AR / عربي)', labelAr),
                fieldRow('Base template', baseSel),
                fieldRow('Brief (optional, for AI generation)', briefTa)
            ]),
            el('div', { class: 'sw-edit-actions' }, [createBtn, cancelBtn, statusSpan]),
            el('div', { class: 'sw-edit-actions' }, [aiGenBtn])
        ]);

        function close() {
            _showingNewScenarioForm = false;
            if (form.parentNode) form.parentNode.removeChild(form);
        }
        function sanitiseName(raw) {
            return String(raw || '').toLowerCase()
                .replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
        }
        cancelBtn.addEventListener('click', close);

        // Slice 10: manual creation still gets its own pre-fill step (defaults
        // for sides/postures/geography/forces a brand-new blank draft needs),
        // then lands through the SAME openDraftForReview() door as AI/
        // template/import — no separate activation path for "manual".
        function applyDraftAndOpen(name, fresh, source) {
            fresh.name = name;
            fresh.scenario_label = labelInp.value || fresh.scenario_label || name;
            if (labelAr.value) fresh.scenario_label_ar = labelAr.value;
            if (!fresh.sides || !fresh.sides.length) fresh.sides = defaultSides();
            if (!fresh.postures) fresh.postures = defaultPostures();
            fillGeographyDefaults(fresh);
            fillForcesDefaults(fresh);
            if (!fresh.schema_variant) fresh.schema_variant = 'authored';
            if (!fresh.model_version)  fresh.model_version  = 'authored-v1';
            fresh.authoring_status = 'draft';
            close();
            openDraftForReview(fresh, { source: source || 'manual' });
        }

        createBtn.addEventListener('click', function () {
            var name = sanitiseName(nameInp.value);
            if (!name) { statusSpan.textContent = 'Name required'; statusSpan.style.color = '#d6332e'; return; }

            var baseSelected = baseSel.value;
            // 2D-1K: if the user picked "Start from existing saved scenario",
            // fetch it and seed the draft from that. The new name is independent
            // (so we don't accidentally overwrite the source). Operator must
            // click Save to server to persist under the new name.
            if (typeof baseSelected === 'string' && baseSelected.indexOf('saved:') === 0) {
                var src = baseSelected.slice('saved:'.length);
                statusSpan.textContent = 'Loading "' + src + '" …';
                statusSpan.style.color = '#1a7f37';
                fetch('/api/ai/scenario/' + encodeURIComponent(src), { credentials: 'include' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) {
                        if (!j || !j.scenario) {
                            statusSpan.textContent = 'Could not load "' + src + '" — falling back to empty.';
                            statusSpan.style.color = '#d6332e';
                            applyDraftAndOpen(name, buildEmptyTemplate());
                            return;
                        }
                        applyDraftAndOpen(name, clone(j.scenario));
                    })
                    .catch(function () {
                        statusSpan.textContent = 'Network error — using empty template.';
                        statusSpan.style.color = '#d6332e';
                        applyDraftAndOpen(name, buildEmptyTemplate());
                    });
                return;
            }
            // Slice 10: starter-template registry pick.
            if (typeof baseSelected === 'string' && baseSelected.indexOf('template:') === 0) {
                var tid = baseSelected.slice('template:'.length);
                statusSpan.textContent = 'Loading template "' + tid + '" …';
                statusSpan.style.color = '#1a7f37';
                fetch('/api/scenario-templates/' + encodeURIComponent(tid), { credentials: 'include' })
                    .then(function (r) { return r.ok ? r.json() : null; })
                    .then(function (j) {
                        if (!j || !j.template) {
                            statusSpan.textContent = 'Could not load template — falling back to empty.';
                            statusSpan.style.color = '#d6332e';
                            applyDraftAndOpen(name, buildEmptyTemplate());
                            return;
                        }
                        applyDraftAndOpen(name, clone(j.template), 'template');
                    })
                    .catch(function () {
                        statusSpan.textContent = 'Network error — using empty template.';
                        statusSpan.style.color = '#d6332e';
                        applyDraftAndOpen(name, buildEmptyTemplate());
                    });
                return;
            }
            // (empty) → standard blank template.
            applyDraftAndOpen(name, buildEmptyTemplate());
        });

        function buildEmptyTemplate() {
            if (window.AppScenarioAuthoring &&
                typeof window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate === 'function') {
                return clone(window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate());
            }
            return { scenario_label: '', steps: [] };
        }

        host.appendChild(form);
    }

    /* ---- Slice 2C: Step 13 — Validate & Save card ------------------------ */
    /* ---- Slice 11: approval workflow + Launch-to-SCC ----------------------
     * Reuses the REAL server-side lifecycle (scenario-approval-store.js,
     * built in Slice 2) — draft->in_review->approved/rejected->activated.
     * There was previously NO client UI calling those endpoints at all; this
     * closes that gap so the Launch button's gate condition is actually
     * reachable through the app, not a permanently-disabled control. */
    function _refreshApprovalStatus(andRerender) {
        if (!_draft || !_draft.name) return Promise.resolve();
        var name = _draft.name;
        return fetch('/api/scenarios/' + encodeURIComponent(name) + '/approval', { credentials: 'include' })
            .then(function (r) { return r.status === 404 ? null : (r.ok ? r.json() : null); })
            .then(function (j) {
                var next = (j && j.ok) ? j : null;
                // renderSaveStepCard() calls _refreshApprovalStatus(true) on every
                // render, which calls renderEditor() -> renderSaveStepCard() again
                // on a change — re-rendering unconditionally here would make that
                // an infinite fetch/render loop. Only re-render when the fetched
                // status actually differs from what's cached.
                var changed = JSON.stringify(next) !== JSON.stringify(_approvalCache);
                _approvalCache = next;
                if (andRerender && changed && _draft && _draft.name === name && _activeStep === STEPS.length - 1) renderEditor();
            })
            .catch(function () { /* leave the last-known cache in place */ });
    }
    function _postApprovalAction(action, reason) {
        if (!_draft || !_draft.name) return Promise.reject(new Error('no draft name'));
        return fetch('/api/scenarios/' + encodeURIComponent(_draft.name) + '/' + action, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reason ? { reason: reason } : {})
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
    }
    /* Batch B Slice 12 (E2E-discovered fixes over the original Slice 11 cut):
     *   1. Re-checks approval status FRESH at the moment of launch — never
     *      trusts the last-rendered _approvalCache, which can be stale (a
     *      re-save after approval invalidates it server-side per
     *      invalidateApprovalOnRevision(), but a cache from before that
     *      re-save would still read "approved" until refreshed).
     *   2. Requires an explicit operator confirmation before launching.
     *   3. Launches the SERVER's approved copy (GET /api/ai/scenario/:name),
     *      never the locally-edited _draft — closes the window between "the
     *      server says approved" and "the operator has since made further
     *      local-only edits that were never saved/reviewed".
     * launchToSCC(opts) — opts.confirmFn overridable for tests (defaults to
     * window.confirm); opts.skipConfirmForTest bypasses the prompt entirely.
     */
    function launchToSCC(opts) {
        opts = opts || {};
        if (!_draft || !_draft.name) { setStatus('Blocked: save to server first — no draft name to launch.', true); return Promise.resolve(false); }
        var name = _draft.name;
        setStatus('Checking approval status …', false);
        return _refreshApprovalStatus(false).then(function () {
            if (!_approvalCache || _approvalCache.scenario_name !== name ||
                (_approvalCache.status !== 'approved' && _approvalCache.status !== 'activated')) {
                setStatus('Blocked: commander approval required before launch (current status: ' +
                    ((_approvalCache && _approvalCache.status) || 'not submitted') + ').', true);
                if (_activeStep === STEPS.length - 1) renderEditor(); // reflect the fresh status in the UI
                return false;
            }
            var confirmFn = opts.confirmFn || window.confirm;
            var proceed = opts.skipConfirmForTest ? true : (typeof confirmFn === 'function' ? confirmFn('Launch "' + name + '" to the Scenario Control Center?') : true);
            if (!proceed) { setStatus('Launch cancelled.', false); return false; }
            return fetch('/api/ai/scenario/' + encodeURIComponent(name), { credentials: 'include' })
                .then(function (r) { return r.ok ? r.json() : null; })
                .then(function (j) {
                    var sc = (j && j.scenario) ? j.scenario : null;
                    if (!sc) { setStatus('Blocked: could not load the approved scenario from the server.', true); return false; }
                    if (!(window.RmoozFreeFightDemo && typeof window.RmoozFreeFightDemo.mount === 'function')) {
                        setStatus('Free Fight engine not loaded (shell/free-fight-demo.js).', true);
                        return false;
                    }
                    window.RmoozScenario = window.RmoozScenario || {};
                    window.RmoozScenario.scenario = sc; // the server's approved copy, not the local _draft
                    var mountOpts = {};
                    if (sc.obj && Array.isArray(sc.obj.coord) && sc.obj.coord.length >= 2) {
                        mountOpts.objective = { lon: sc.obj.coord[0], lat: sc.obj.coord[1] };
                    }
                    // Empty payload is correct here — the SCC engine (RmoozFreeFightDemo.engine
                    // -> scenario-control-center.js) reads window.RmoozScenario.scenario
                    // directly for red_units/blue_units_initial/etc; mount()'s payload only
                    // feeds the separate legacy demo-overlay marker layer, not the SCC.
                    window.RmoozFreeFightDemo.mount({}, mountOpts);
                    logOperator('Scenario launched to Scenario Control Center', { name: sc.name || name });
                    setStatus('Launched "' + (sc.name || name) + '" to the Scenario Control Center.', false);
                    return true;
                })
                .catch(function (e) { setStatus('Network error: ' + (e && e.message), true); return false; });
        });
    }

    function renderSaveStepCard(host) {
        var card = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title',
                             text: 'Validate & Save / التحقق والحفظ' })
            ])
        ]);

        // Summary: which steps are complete?
        var summary = el('dl', { class: 'sw-kv' });
        STEPS.forEach(function (s, i) {
            if (i === STEPS.length - 1) return; // skip self
            var c = stepIsComplete(_draft, i);
            var label = (i + 1) + '. ' + s.title_en;
            var ind = c === true ? '✓' : (c === false ? '—' : '·');
            var color = c === true ? '#1a7f37' : (c === false ? '#c9a227' : '#8d949e');
            var row = el('div', { class: 'sw-kv-row sw-edit-row' }, [
                el('dt', { text: label }),
                el('dd', null, [el('span', { text: ind + (s.gap ? ' (gap)' : ''), style: 'color:' + color })])
            ]);
            summary.appendChild(row);
        });
        card.appendChild(summary);

        // Save action row (in addition to the always-visible save bar below).
        var saveBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Save draft (in-memory) / حفظ المسودة' });
        saveBtn.addEventListener('click', saveDraft);
        var saveAsBtn = el('button', { type: 'button', class: 'sw-edit-btn',
            text: 'Save As JSON (download) / حفظ كملف' });
        saveAsBtn.addEventListener('click', saveAsJson);
        var saveToServerBtn = el('button', { type: 'button', class: 'sw-edit-btn',
            text: 'Save to server / حفظ على الخادم' });
        saveToServerBtn.addEventListener('click', saveToServer);
        var copyBtn = el('button', { type: 'button', class: 'sw-edit-btn',
            text: 'Copy JSON / نسخ' });
        copyBtn.addEventListener('click', copyJson);

        card.appendChild(el('div', { class: 'sw-edit-actions' }, [
            saveBtn, saveAsBtn, saveToServerBtn, copyBtn
        ]));
        card.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'In-memory save updates the live RmoozScenario. Save As / Save to server persist outside the in-memory boundary.' }));

        // Slice 11: commander-approval workflow + Launch-to-SCC. Requires the
        // draft to have been saved to the server at least once (Save to
        // server above) — a lifecycle row is created on first server save.
        var approvalCard = el('div', { class: 'sw-approval-card' });
        approvalCard.appendChild(el('div', { class: 'builder-card-header' }, [
            el('span', { class: 'builder-card-title', text: 'Commander Approval & Launch · موافقة القائد والإطلاق' })
        ]));
        if (!_draft.name) {
            approvalCard.appendChild(el('div', { class: 'sw-edit-hint',
                text: 'Save to server first — approval status is tracked per saved scenario name.' }));
        } else if (!_approvalCache) {
            approvalCard.appendChild(el('div', { class: 'sw-edit-hint',
                text: 'No lifecycle record yet for "' + _draft.name + '" — save to server, then submit for review.' }));
        } else {
            approvalCard.appendChild(el('div', { class: 'sw-edit-hint', text: 'Status: ' + _approvalCache.status }));
        }

        var submitBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Submit for review' });
        var approveBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Approve (commander)' });
        var rejectBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-danger', text: 'Reject' });
        var reopenBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Reopen to draft' });
        if (!_approvalCache || !_approvalCache.can_submit) submitBtn.setAttribute('disabled', 'disabled');
        if (!_approvalCache || !_approvalCache.can_approve) approveBtn.setAttribute('disabled', 'disabled');
        if (!_approvalCache || !_approvalCache.can_approve) rejectBtn.setAttribute('disabled', 'disabled');
        if (!_approvalCache || !(_approvalCache.status === 'approved' || _approvalCache.status === 'rejected')) reopenBtn.setAttribute('disabled', 'disabled');

        submitBtn.addEventListener('click', function () {
            _postApprovalAction('submit-for-review').then(function (r) {
                setStatus(r.ok ? 'Submitted for review.' : ('Blocked: ' + (r.body && r.body.error)), !r.ok);
                _refreshApprovalStatus(true);
            });
        });
        approveBtn.addEventListener('click', function () {
            _postApprovalAction('approve').then(function (r) {
                setStatus(r.ok ? 'Approved.' : ('Blocked: ' + (r.body && r.body.error)), !r.ok);
                _refreshApprovalStatus(true);
            });
        });
        rejectBtn.addEventListener('click', function () {
            var reason = window.prompt ? window.prompt('Reject reason (required):') : 'rejected';
            if (!reason || !reason.trim()) { setStatus('Reject cancelled — a reason is required.', true); return; }
            _postApprovalAction('reject', reason).then(function (r) {
                setStatus(r.ok ? 'Rejected.' : ('Blocked: ' + (r.body && r.body.error)), !r.ok);
                _refreshApprovalStatus(true);
            });
        });
        reopenBtn.addEventListener('click', function () {
            _postApprovalAction('reopen').then(function (r) {
                setStatus(r.ok ? 'Reopened to draft.' : ('Blocked: ' + (r.body && r.body.error)), !r.ok);
                _refreshApprovalStatus(true);
            });
        });
        approvalCard.appendChild(el('div', { class: 'sw-edit-actions' }, [submitBtn, approveBtn, rejectBtn, reopenBtn]));

        var launchBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: 'Launch to Scenario Control Center' });
        var canLaunch = !!(_approvalCache && (_approvalCache.status === 'approved' || _approvalCache.status === 'activated') &&
            validateAllHardRules(_draft).ok && draftIsSafe(_draft).ok);
        if (!canLaunch) launchBtn.setAttribute('disabled', 'disabled');
        launchBtn.addEventListener('click', function () { launchToSCC(); });
        approvalCard.appendChild(el('div', { class: 'sw-edit-actions' }, [launchBtn]));
        approvalCard.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'Launch is enabled only once the server-side lifecycle status is "approved" (or "activated") and all hard rules + the P0 safety gate pass.' }));

        card.appendChild(approvalCard);
        _refreshApprovalStatus(true); // fire-and-forget; re-renders this step if the status changes

        host.appendChild(card);
    }

    /* ---- Slice 2C: Save As JSON (Blob download) -------------------------- */
    function saveAsJson() {
        if (!_draft) return;
        // Sync derived fields first so the file mirrors the in-memory model.
        syncBlueBaseIds(_draft);
        var hard = validateAllHardRules(_draft);
        if (!hard.ok) { setStatus('Blocked: ' + hard.why, true); return; }
        var gate = draftIsSafe(_draft);
        if (!gate.ok) { setStatus('Blocked: ' + gate.why, true); return; }
        try {
            var json = JSON.stringify(_draft, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url  = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = (_draft.name || 'scenario') + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            setStatus('Downloaded ' + a.download, false);
            logOperator('Scenario draft downloaded as JSON', { name: _draft.name || '' });
            _setSavedState('on-disk');
        } catch (e) {
            setStatus('Download failed: ' + (e && e.message), true);
        }
    }

    /* ---- Slice 2C: POST /api/scenarios (durable server save) ------------- */
    function saveToServer() {
        if (!_draft) return;
        syncBlueBaseIds(_draft);
        var hard = validateAllHardRules(_draft);
        if (!hard.ok) { setStatus('Blocked: ' + hard.why, true); return; }
        var gate = draftIsSafe(_draft);
        if (!gate.ok) { setStatus('Blocked: ' + gate.why, true); return; }
        var body = JSON.stringify({ scenario: _draft });
        setStatus('Saving to server …', false);
        fetch('/api/scenarios', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: body
        }).then(function (r) {
            return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
        }).then(function (resp) {
            if (resp.ok) {
                // Slice 12 (E2E-discovered fix): saving a scenario changes its
                // server-side lifecycle row (creates it, or — per Slice 12's
                // stale-revision guard — may demote an approved one back to
                // draft), but nothing previously refreshed the Save step's
                // approval-status UI to reflect that. The operator would have
                // had to navigate away and back to see Submit/Launch update.
                setStatus('Saved to server as "' + resp.body.name + '".', false);
                logOperator('Scenario saved to server', { name: resp.body.name });
                _setSavedState('on-server');
                _refreshApprovalStatus(true);
                return;
            }
            if (resp.status === 409) {
                if (window.confirm('Scenario "' + (_draft.name || '') + '" already exists on the server. Overwrite?')) {
                    fetch('/api/scenarios?overwrite=1', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: body
                    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
                      .then(function (resp2) {
                          if (resp2.ok) {
                              setStatus('Overwritten on server as "' + resp2.body.name + '".', false);
                              logOperator('Scenario overwritten on server', { name: resp2.body.name });
                              _setSavedState('on-server');
                              _refreshApprovalStatus(true);
                          } else {
                              setStatus('Server rejected overwrite: ' + (resp2.body && resp2.body.error || resp2.status), true);
                          }
                      }).catch(function (e) { setStatus('Network error: ' + (e && e.message), true); });
                } else {
                    setStatus('Server save cancelled — scenario already exists.', true);
                }
                return;
            }
            setStatus('Server rejected save: ' + (resp.body && resp.body.error || resp.status), true);
        }).catch(function (e) {
            setStatus('Network error: ' + (e && e.message), true);
        });
    }

    /* ---- Slice 2C: stepped editor render --------------------------------- */
    function renderEditor() {
        var host = document.getElementById(EDITOR_ID);
        if (!host) return;
        host.innerHTML = '';
        if (!_draft) _draft = buildDraft();

        // Clamp _activeStep to valid range so a fresh start lands on Step 1.
        if (_activeStep < 0 || _activeStep >= STEPS.length) _activeStep = 0;

        var layout = el('div', { class: 'sw-step-layout' });
        var rail   = el('div', { class: 'sw-step-rail' });
        var content = el('div', { class: 'sw-step-content' });

        // Build the rail.
        STEPS.forEach(function (s, i) {
            var classes = ['sw-step-item'];
            if (i === _activeStep) classes.push('active');
            if (s.gap)             classes.push('gap');
            var item = el('div', { class: classes.join(' ') }, [
                el('span', { class: 'sw-step-num',   text: String(i + 1) }),
                el('span', { class: 'sw-step-title', text: s.title_en + ' · ' + s.title_ar }),
                el('span', { class: 'sw-step-pill ' + stepPillClass(_draft, i) })
            ]);
            item.addEventListener('click', function () {
                _activeStep = i;
                renderEditor();
            });
            rail.appendChild(item);
        });

        // Render the active step into the content pane.
        try {
            STEPS[_activeStep].render(content);
        } catch (e) {
            content.appendChild(el('div', { class: 'sw-gap-card',
                text: 'Step render failed: ' + (e && e.message) }));
            try { console.warn('[edit-mode] step render error', e); } catch (_) {}
        }

        layout.appendChild(rail);
        layout.appendChild(content);
        host.appendChild(layout);

        // Always-visible bottom actions row (Save / Copy / Status).
        var status = el('span', { id: 'sw-editmode-status', class: 'sw-edit-status', text: '' });
        var saveBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Save draft / حفظ المسودة' });
        saveBtn.addEventListener('click', saveDraft);
        var copyBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Copy JSON / نسخ' });
        copyBtn.addEventListener('click', copyJson);
        host.appendChild(el('div', { class: 'sw-edit-actions' }, [saveBtn, copyBtn, status]));
    }

    function setStatus(txt, isErr) {
        var s = document.getElementById('sw-editmode-status');
        if (!s) return;
        s.textContent = txt;
        s.style.color = isErr ? '#d6332e' : '#1a7f37';
    }

    /* ---- save: validate → apply to in-memory scenario → repaint ----------- */
    function saveDraft() {
        if (!_draft) return;

        /* Step 1 required-field guard — block save before writing to RmoozScenario
         * so no partially-invalid metadata ever replaces a working scenario. */
        var nameOk  = !!(sanitiseMetaName(_draft.name || ''));
        var labelOk = !!(_draft.scenario_label && _draft.scenario_label.trim());
        if (!nameOk)  { setStatus('Name is required (Step 1 — use letters, digits, dashes).', true); return; }
        if (!labelOk) { setStatus('Label is required (Step 1).', true); return; }

        /* Step 3 required-field guard — each side must have a name_en */
        if (Array.isArray(_draft.sides)) {
            for (var i = 0; i < _draft.sides.length; i++) {
                if (!(_draft.sides[i].name_en && _draft.sides[i].name_en.trim())) {
                    setStatus('Step 3: Side "' + (_draft.sides[i].id || 'unknown') + '" requires an English name.', true);
                    return;
                }
            }
        }

        // Slice 2B: keep the derived blue_units_base_ids parallel array in
        // lockstep with the authoritative blue_units_initial. Runs FIRST so
        // the hard-rules check sees the synced state.
        syncBlueBaseIds(_draft);

        // Hard validator rules (Slice 2A carver + Slice 2B forces). Mirrors
        // UI_MOdified/server/ai/scenario-validator.js so the operator gets
        // immediate feedback instead of a later server-side reject.
        var hard = validateAllHardRules(_draft);
        if (!hard.ok) { setStatus('Blocked: ' + hard.why, true); return; }

        var gate = draftIsSafe(_draft);
        if (!gate.ok) { setStatus('Blocked: ' + gate.why, true); return; }

        var slot = window.RmoozScenario || (window.RmoozScenario = { scenario: null, stepIndex: 0 });
        slot.scenario = clone(_draft);                 // in-memory working copy ONLY
        if (typeof slot.stepIndex !== 'number') slot.stepIndex = 0;

        try { window.AppShellScenarioWorkspace && window.AppShellScenarioWorkspace.refresh(); } catch (_) {}

        // Slice 2A: geometry edits must repaint AO/obj/pipeline/BLS markers.
        // Reuses the public AppAdjudicatorMap API (clears-then-redraws);
        // does not duplicate any drawing logic.
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.drawScenario === 'function') {
                window.AppAdjudicatorMap.drawScenario(slot.scenario);
            }
        } catch (_) {}
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.fitScenarioAO === 'function') {
                window.AppAdjudicatorMap.fitScenarioAO();
            }
        } catch (_) {}

        logOperator('Scenario draft edited (metadata/sides/posture/geography) — in-memory only, not committed',
            { label: _draft.scenario_label || '' });
        setStatus('Saved to working copy (not committed). Commit stays gated.', false);
        _setSavedState('in-memory');
    }

    function copyJson() {
        if (!_draft) return;
        var txt = JSON.stringify(_draft, null, 2);
        try {
            navigator.clipboard.writeText(txt).then(
                function () { setStatus('Draft JSON copied to clipboard.', false); },
                function () { setStatus('Clipboard blocked — see console.', true); console.log(txt); }
            );
        } catch (_) { console.log(txt); setStatus('See console for draft JSON.', true); }
    }

    /* ---- Slice 2D-1J: indicator + saved-state badge ---------------------- */
    function _setSavedState(state) {
        // No-op when already in this state — avoids a DOM patch on every keystroke
        // (input helpers call _setSavedState('unsaved') on every change).
        if (_savedState === state) return;
        _savedState = state;
        renderIndicator();
    }
    // Lightweight hook input helpers call after each onInput to mark dirty.
    // Cheap because _setSavedState short-circuits when already 'unsaved'.
    function _markDirty() { _setSavedState('unsaved'); }
    function renderIndicator() {
        var ind = document.getElementById('sw-editmode-indicator');
        if (!ind) return;
        if (!_on || !_draft) { ind.style.display = 'none'; ind.innerHTML = ''; return; }
        ind.style.display = '';
        var name = _draft.name || '(unnamed)';
        var label = _draft.scenario_label || '';
        var badgeText, badgeClass;
        switch (_savedState) {
            case 'in-memory': badgeText = 'saved in-memory'; badgeClass = 'in-memory'; break;
            case 'on-disk':   badgeText = 'saved on disk';   badgeClass = 'on-disk';   break;
            case 'on-server': badgeText = 'saved on server'; badgeClass = 'on-server'; break;
            default:          badgeText = 'unsaved';         badgeClass = 'unsaved';   break;
        }
        ind.innerHTML = '';
        ind.appendChild(el('span', { class: 'sw-editmode-indicator-label', text: 'Editing:' }));
        ind.appendChild(el('span', { class: 'sw-editmode-indicator-name', text: name,
            title: label ? (name + ' — ' + label) : name }));
        ind.appendChild(el('span', { class: 'sw-editmode-badge ' + badgeClass, text: badgeText }));
    }

    /* ---- toggle / mount --------------------------------------------------- */
    function setMode(on) {
        _on = !!on;
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        var strip  = panel.querySelector('.sw-readonly-strip');
        var editor = document.getElementById(EDITOR_ID);
        var btn    = document.getElementById('sw-editmode-toggle');

        if (_on) {
            _draft = buildDraft();
            _savedState = 'unsaved';  // 2D-1J: fresh draft starts unsaved
            if (strip)  strip.style.display = 'none';
            if (editor) { editor.hidden = false; renderEditor(); }
            if (btn) btn.textContent = 'Exit edit mode / إنهاء التحرير';
            // 2D-1M: grow the workspace panel over the map so the rail +
            // content pane have horizontal space to render legibly. Map stays
            // visible to the left of the panel for Pick-on-map.
            panel.classList.add('sw-editmode-wide');
            renderIndicator();
            logOperator('Edit mode ON');
        } else {
            if (strip)  strip.style.display = '';
            if (editor) editor.hidden = true;
            if (btn) btn.textContent = 'Edit mode / تحرير';
            panel.classList.remove('sw-editmode-wide');
            renderIndicator();
            logOperator('Edit mode OFF');
        }
    }
    function toggle() { setMode(!_on); }

    function mount() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel || document.getElementById(BAR_ID)) return;

        var btn = el('button', {
            id: 'sw-editmode-toggle', type: 'button', class: 'sw-edit-btn sw-edit-btn-primary',
            text: 'Edit mode / تحرير'
        });
        btn.addEventListener('click', toggle);

        // Slice 2C: + New scenario opens an inline form to stamp a fresh draft.
        var newBtn = el('button', {
            id: 'sw-editmode-newscen', type: 'button', class: 'sw-edit-btn',
            text: '+ New scenario / سيناريو جديد'
        });
        newBtn.addEventListener('click', function () {
            // Open the form inside the BAR_ID strip itself (not the editor pane,
            // because the editor pane is hidden until Edit Mode is ON).
            if (_showingNewScenarioForm) return;
            _showingNewScenarioForm = true;
            renderNewScenarioForm(document.getElementById(BAR_ID));
        });

        // Slice 2D-1J: "Editing: {name}" indicator + saved-state badge.
        // Mounted but empty until Edit Mode is ON.
        var indicator = el('span', { id: 'sw-editmode-indicator', class: 'sw-editmode-indicator' });
        indicator.style.display = 'none';

        var bar = el('div', { id: BAR_ID, class: 'sw-editmode-bar' }, [btn, newBtn, indicator]);

        var editor = el('div', { id: EDITOR_ID, class: 'sw-editmode-editor', hidden: 'hidden' });

        // Insert the bar + editor right after the workspace status strip (top of panel).
        var strip = panel.querySelector('.sw-readonly-strip');
        if (strip && strip.parentNode) {
            strip.parentNode.insertBefore(bar, strip.nextSibling);
            bar.parentNode.insertBefore(editor, bar.nextSibling);
        } else {
            panel.insertBefore(bar, panel.firstChild);
            panel.insertBefore(editor, bar.nextSibling);
        }
    }

    function init() {
        try { mount(); } catch (e) { try { console.warn('[edit-mode] mount failed', e); } catch (_) {} }
    }

    window.AppEditMode = {
        init: init,
        toggle: toggle,
        setMode: setMode,
        getDraft: function () { return _draft ? clone(_draft) : null; },
        isOn: function () { return _on; },
        // Slice 10: the single ingestion door for manual/AI/template/import.
        openDraftForReview: openDraftForReview,
        // Slice 2A/2B/2C: pure helpers exposed for static Node tests.
        // Not intended for runtime callers.
        _testing: {
            defaultSides:            defaultSides,
            defaultPostures:         defaultPostures,
            defaultGeography:        defaultGeography,
            fillGeographyDefaults:   fillGeographyDefaults,
            validateDraftHardRules:  validateDraftHardRules,
            parseCoordLines:         parseCoordLines,
            coordsToLines:           coordsToLines,
            aoExteriorRing:          aoExteriorRing,
            setAoExteriorRing:       setAoExteriorRing,
            makeMapBboxAoPolygon:    makeMapBboxAoPolygon,
            // Slice 2B
            fillForcesDefaults:      fillForcesDefaults,
            syncBlueBaseIds:         syncBlueBaseIds,
            validateForcesHardRules: validateForcesHardRules,
            validateAllHardRules:    validateAllHardRules,
            RED_UNIT_ROLES:          RED_UNIT_ROLES,
            nextFreeUid:             nextFreeUid,
            // Slice 2C
            STEPS:                       STEPS,
            stepIsComplete:              stepIsComplete,
            stepPillClass:               stepPillClass,
            synthesizeDefaultPhaseTable: synthesizeDefaultPhaseTable,
            ensureStepsMatchPhaseTable:  ensureStepsMatchPhaseTable,
            PHASES_ENUM:                 PHASES_ENUM,
            // Slice 2D
            groupByEchelon:              groupByEchelon,
            unitMatchesFilter:           unitMatchesFilter,
            // Slice 2D-2: multi-vertex picks. Exposed so the static test can
            // exercise the helpers without a real Leaflet map by stubbing
            // window.map + window.L (see test-edit-mode-slice2e.js).
            _beginMultiPick:             _beginMultiPick,
            _beginPickOnMapPolygon:      _beginPickOnMapPolygon,
            _beginPickOnMapPolyline:     _beginPickOnMapPolyline,
            _cancelPickOnMap:            _cancelPickOnMap,
            // Batch B Slice 4: expose the save-gate paths for static tests.
            draftIsSafe:                 draftIsSafe,
            saveAsJson:                  saveAsJson,
            saveToServer:                saveToServer,
            saveDraft:                   saveDraft,
            _setDraftForTest:            function (d) { _draft = d; },
            // Batch B Slice 5: doctrine/ROE/WRA authoring.
            validateDoctrineHardRules:   validateDoctrineHardRules,
            renderDoctrineCard:          renderDoctrineCard,
            defaultRuleForKind:          defaultRuleForKind,
            nextFreeRuleId:              nextFreeRuleId,
            DOCTRINE_RULE_KINDS:         DOCTRINE_RULE_KINDS,
            _selectRuleForTest:          _selectRule,
            _clearRuleSelectionForTest:  _clearRuleSelection,
            // Batch B Slice 6: missions/tasking/routes authoring.
            renderMissionsCard:          renderMissionsCard,
            defaultMissionTask:          defaultMissionTask,
            nextFreeMissionTaskId:       nextFreeMissionTaskId,
            _selectMissionTaskForTest:   _selectMissionTask,
            _clearMissionTaskSelectionForTest: _clearMissionTaskSelection,
            // Batch B Slice 7: runtime events/triggers authoring.
            validateRuntimeHardRules:    validateRuntimeHardRules,
            RUNTIME_SAFE_EFFECT_KINDS:   RUNTIME_SAFE_EFFECT_KINDS,
            renderEventsCard:            renderEventsCard,
            defaultRuntimeEvent:         defaultRuntimeEvent,
            defaultRuntimeEffect:        defaultRuntimeEffect,
            nextFreeEventId:             nextFreeEventId,
            _selectEventForTest:         _selectEvent,
            _clearEventSelectionForTest: _clearEventSelection,
            // Batch B Slice 8: decision points + victory conditions authoring.
            renderDecisionsCard:         renderDecisionsCard,
            defaultDecisionPoint:        defaultDecisionPoint,
            defaultDecisionOption:       defaultDecisionOption,
            nextFreeDecisionPointId:     nextFreeDecisionPointId,
            _selectDecisionPointForTest: _selectDecisionPoint,
            _clearDecisionPointSelectionForTest: _clearDecisionPointSelection,
            renderVictoryCard:           renderVictoryCard,
            defaultVictoryCondition:     defaultVictoryCondition,
            nextFreeVictoryConditionId:  nextFreeVictoryConditionId,
            _selectVictoryConditionForTest: _selectVictoryCondition,
            _clearVictoryConditionSelectionForTest: _clearVictoryConditionSelection,
            // Batch B Slice 11: approval workflow + Launch-to-SCC.
            launchToSCC:                 launchToSCC,
            _refreshApprovalStatus:      _refreshApprovalStatus,
            _postApprovalAction:         _postApprovalAction,
            _setApprovalCacheForTest:    function (v) { _approvalCache = v; },
            _getApprovalCacheForTest:    function () { return _approvalCache; },
            renderSaveStepCard:          renderSaveStepCard
        }
    };
})();
