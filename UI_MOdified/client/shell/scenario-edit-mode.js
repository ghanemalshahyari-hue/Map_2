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
 * Slice 1 (done): Scenario Metadata + Sides + Posture.
 * Slice 2 (in progress, CMO build-order): Geography — Objective (this step);
 *   BLS / pipeline / AO and Forces/OOB placement follow. Forces/Doctrine/Missions later.
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
        d.authoring_status = 'draft';
        return d;
    }

    /* ---- "New scenario" seeds (build fresh, not edit the loaded one) ------- */
    function buildBlankDraft() {
        var d;
        if (window.AppScenarioAuthoring &&
            typeof window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate === 'function') {
            d = clone(window.AppScenarioAuthoring.buildStandardScenarioAuthoringTemplate());
        } else {
            d = { scenario_label: '', scenario_id: '', steps: [] };
        }
        if (!Array.isArray(d.sides) || !d.sides.length) d.sides = defaultSides();
        if (!d.postures || typeof d.postures !== 'object') d.postures = defaultPostures();
        d.authoring_status = 'draft';
        return d;
    }
    function startBlankScenario() {
        _draft = buildBlankDraft();
        renderEditor();
        setStatus('New BLANK scenario started — build it step by step, then Save to working copy.', false);
        logOperator('New blank scenario started');
    }
    function startScenarioFromSample() {
        setStatus('Loading sample…', false);
        fetch('/samples/sample-sahil-corridor.json', { credentials: 'same-origin' })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (j) {
                _draft = clone(j);
                if (!Array.isArray(_draft.sides) || !_draft.sides.length) _draft.sides = defaultSides();
                if (!_draft.postures || typeof _draft.postures !== 'object') _draft.postures = defaultPostures();
                _draft.authoring_status = 'draft';
                renderEditor();
                setStatus('New scenario seeded from sample (Sahil Corridor). Edit, then Save to working copy.', false);
                logOperator('New scenario started from sample');
            })
            .catch(function (e) { setStatus('Could not load sample: ' + e.message, true); });
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
        i.addEventListener('input', function () { onInput(i.value); });
        return i;
    }
    function selectInput(options, value, onChange) {
        var s = el('select', { class: 'sw-edit-input' });
        options.forEach(function (o) {
            var opt = el('option', { value: o, text: o });
            if (o === value) opt.setAttribute('selected', 'selected');
            s.appendChild(opt);
        });
        s.addEventListener('change', function () { onChange(s.value); });
        return s;
    }
    function numberInput(value, onInput, opts) {
        opts = opts || {};
        var attrs = { type: 'number', class: 'sw-edit-input', value: (value == null ? '' : String(value)) };
        if (opts.step != null) attrs.step = String(opts.step);
        if (opts.min  != null) attrs.min  = String(opts.min);
        if (opts.max  != null) attrs.max  = String(opts.max);
        var i = el('input', attrs);
        i.addEventListener('input', function () {
            var n = parseFloat(i.value);
            onInput(isFinite(n) ? n : null);
        });
        return i;
    }
    /* One-shot map-click coord capture — reuses app.js's __APP_UNITS_PLACING hook
       (app.js routes the next map click to onClick(latlng) then we clear it).
       cb receives (lon, lat) in scenario [lon,lat] convention. */
    function pickCoordOnMap(cb) {
        window.__APP_UNITS_PLACING = {
            unitId: '__scenario_authoring_coord__',
            onClick: function (latlng) {
                window.__APP_UNITS_PLACING = null;
                try { if (latlng) cb(latlng.lng, latlng.lat); } catch (_) {}
            }
        };
    }

    function renderEditor() {
        var host = document.getElementById(EDITOR_ID);
        if (!host) return;
        host.innerHTML = '';
        if (!_draft) _draft = buildDraft();

        /* --- New scenario picker (Blank vs From-sample) — build fresh, not edit loaded --- */
        var newCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'New scenario / سيناريو جديد' })
            ])
        ]);
        var blankBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Blank / فارغ' });
        blankBtn.addEventListener('click', function () {
            if (window.confirm('Start a new BLANK scenario? This replaces the current draft (the loaded scenario is untouched until you Save).')) startBlankScenario();
        });
        var sampleBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'From sample / من نموذج' });
        sampleBtn.addEventListener('click', function () {
            if (window.confirm('Start from the sample scenario (Sahil Corridor)? This replaces the current draft.')) startScenarioFromSample();
        });
        newCard.appendChild(el('div', { class: 'sw-edit-actions' }, [blankBtn, sampleBtn]));
        newCard.appendChild(el('div', { class: 'sw-edit-hint',
            text: 'Blank = empty template, build from scratch (CMO step by step). From sample = the validated Sahil Corridor example to edit.' }));
        host.appendChild(newCard);

        /* --- Scenario Metadata --- */
        var meta = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Scenario Metadata / بيانات السيناريو' })
            ]),
            el('dl', { class: 'sw-kv' }, [
                fieldRow('Label / التسمية', textInput(_draft.scenario_label, function (v) { _draft.scenario_label = v; })),
                fieldRow('Scenario ID', textInput(_draft.scenario_id, function (v) { _draft.scenario_id = v; }))
            ])
        ]);
        host.appendChild(meta);

        /* --- Sides --- */
        var sidesCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Sides / الأطراف' })
            ])
        ]);
        _draft.sides.forEach(function (side) {
            sidesCard.appendChild(el('dl', { class: 'sw-kv' }, [
                fieldRow(side.id + ' · name (EN)', textInput(side.name_en, function (v) { side.name_en = v; })),
                fieldRow(side.id + ' · name (AR)', textInput(side.name_ar, function (v) { side.name_ar = v; })),
                fieldRow(side.id + ' · role',      selectInput(ROLES, side.role, function (v) { side.role = v; })),
                fieldRow(side.id + ' · color',     textInput(side.color, function (v) { side.color = v; }))
            ]));
        });
        host.appendChild(sidesCard);

        /* --- Posture matrix --- */
        var postCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Posture matrix (from → to) / مصفوفة الموقف' })
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
        postCard.appendChild(dl);
        host.appendChild(postCard);

        /* --- Geography · Objective (Slice 2, CMO build-order step: define the area/objective
               before placing units — see docs/cmo-functional-rules/exhaustive/scenario-authoring) --- */
        _draft.obj = _draft.obj || { name: 'OBJ', coord: [0, 0], target_depth_km: 40, carver: 0 };
        if (!Array.isArray(_draft.obj.coord) || _draft.obj.coord.length < 2) _draft.obj.coord = [0, 0];
        var objCard = el('div', { class: 'builder-card sw-card' }, [
            el('div', { class: 'builder-card-header' }, [
                el('span', { class: 'builder-card-title', text: 'Edit · Geography: Objective / الجغرافيا: الهدف' })
            ])
        ]);
        objCard.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('Objective name / اسم الهدف', textInput(_draft.obj.name, function (v) { _draft.obj.name = v; })),
            fieldRow('Longitude / خط الطول',  numberInput(_draft.obj.coord[0], function (v) { _draft.obj.coord[0] = v; }, { step: 'any' })),
            fieldRow('Latitude / خط العرض',   numberInput(_draft.obj.coord[1], function (v) { _draft.obj.coord[1] = v; }, { step: 'any' })),
            fieldRow('Target depth km / عمق الهدف', numberInput(_draft.obj.target_depth_km, function (v) { _draft.obj.target_depth_km = v; }, { step: 1, min: 0 })),
            fieldRow('Carve index 0–60', numberInput(_draft.obj.carver, function (v) { _draft.obj.carver = v; }, { min: 0, max: 60, step: 1 }))
        ]));
        var pickBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Pick on map / تحديد على الخريطة' });
        pickBtn.addEventListener('click', function () {
            pickCoordOnMap(function (lon, lat) {
                _draft.obj.coord = [lon, lat];
                renderEditor();
                setStatus('Objective set from map: ' + lon.toFixed(4) + ', ' + lat.toFixed(4), false);
            });
            setStatus('Click the map to set the objective…', false);
        });
        objCard.appendChild(el('div', { class: 'sw-edit-actions' }, [pickBtn]));
        host.appendChild(objCard);

        /* --- actions --- */
        var status = el('span', { id: 'sw-editmode-status', class: 'sw-edit-status', text: '' });
        var saveBtn = el('button', { type: 'button', class: 'sw-edit-btn sw-edit-btn-primary', text: 'Save draft / حفظ المسودة' });
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
        var gate = draftIsSafe(_draft);
        if (!gate.ok) { setStatus('Blocked: ' + gate.why, true); return; }

        var slot = window.RmoozScenario || (window.RmoozScenario = { scenario: null, stepIndex: 0 });
        slot.scenario = clone(_draft);                 // in-memory working copy ONLY
        if (typeof slot.stepIndex !== 'number') slot.stepIndex = 0;

        try { window.AppShellScenarioWorkspace && window.AppShellScenarioWorkspace.refresh(); } catch (_) {}
        // Slice 2: live map feedback — best-effort redraw of the scenario from the draft.
        try {
            if (window.AppAdjudicatorMap && typeof window.AppAdjudicatorMap.drawScenario === 'function'
                && slot.scenario && slot.scenario.obj && Array.isArray(slot.scenario.obj.coord)) {
                window.AppAdjudicatorMap.drawScenario(slot.scenario);
            }
        } catch (_) {}
        logOperator('Scenario draft edited (metadata/sides/posture/objective) — in-memory only, not committed',
            { label: _draft.scenario_label || '' });
        setStatus('Saved to working copy (not committed). Commit stays gated.', false);
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
            if (strip)  strip.style.display = 'none';
            if (editor) { editor.hidden = false; renderEditor(); }
            if (btn) btn.textContent = 'Exit edit mode / إنهاء التحرير';
            logOperator('Edit mode ON');
        } else {
            if (strip)  strip.style.display = '';
            if (editor) editor.hidden = true;
            if (btn) btn.textContent = 'Edit mode / تحرير';
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
        var bar = el('div', { id: BAR_ID, class: 'sw-editmode-bar' }, [btn]);

        var editor = el('div', { id: EDITOR_ID, class: 'sw-editmode-editor', hidden: 'hidden' });

        // Insert the bar + editor right after the read-only strip (top of panel).
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
        isOn: function () { return _on; }
    };
})();
