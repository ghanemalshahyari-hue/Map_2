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
        d.authoring_status = 'draft';
        return d;
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
            if (raw === '' || raw == null) { onInput(null); return; }
            var n = Number(raw);
            if (!isFinite(n)) { onInput(null); return; }
            if (opts.integer) n = Math.trunc(n);
            if (opts.min != null && n < opts.min) n = opts.min;
            if (opts.max != null && n > opts.max) n = opts.max;
            onInput(n);
        });
        return i;
    }
    function textArea(value, rows, onChange) {
        var t = el('textarea', { class: 'sw-edit-input', rows: String(rows || 4) });
        t.value = value == null ? '' : String(value);
        t.addEventListener('input', function () { onChange(t.value); });
        return t;
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

        var addBtn = el('button', { type: 'button', class: 'sw-edit-btn', text: 'Add polygon' });
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
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addBtn, useBboxBtn]));

        host.appendChild(card);
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
        card.appendChild(el('dl', { class: 'sw-kv' }, [
            fieldRow('pipeline (one "lon, lat" per line; ≥2 waypoints)', pipeTa)
        ]));

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
                });
                var label = 'BLS #' + (idx + 1);
                blsList.appendChild(el('div', { class: 'sw-edit-list-item' }, [
                    el('dl', { class: 'sw-kv' }, [
                        fieldRow(label + ' · name',
                            textInput(b.name || '', function (v) { b.name = v; })),
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
                coord: [0, 0], role: '', throughput: 0, terrain_friction: 0
            });
            rerenderBlsList();
        });
        card.appendChild(el('div', { class: 'sw-edit-actions' }, [addBls]));

        host.appendChild(card);
    }

    function renderEditor() {
        var host = document.getElementById(EDITOR_ID);
        if (!host) return;
        host.innerHTML = '';
        if (!_draft) _draft = buildDraft();

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

        /* --- AO geometry (Slice 2A) --- */
        renderAOCard(host);

        /* --- Forces geometry (Slice 2A) --- */
        renderGeometryCard(host);

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

        // Slice 2A: hard validator rule (obj.carver int 0..60). Mirrors
        // UI_MOdified/server/ai/scenario-validator.js so the operator gets
        // immediate feedback instead of a later server-side reject.
        var hard = validateDraftHardRules(_draft);
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
        isOn: function () { return _on; },
        // Slice 2A: pure helpers exposed for static Node tests
        // (test-edit-mode-slice2a.js). Not intended for runtime callers.
        _testing: {
            defaultSides:           defaultSides,
            defaultPostures:        defaultPostures,
            defaultGeography:       defaultGeography,
            fillGeographyDefaults:  fillGeographyDefaults,
            validateDraftHardRules: validateDraftHardRules,
            parseCoordLines:        parseCoordLines,
            coordsToLines:          coordsToLines,
            aoExteriorRing:         aoExteriorRing,
            setAoExteriorRing:      setAoExteriorRing,
            makeMapBboxAoPolygon:   makeMapBboxAoPolygon
        }
    };
})();
