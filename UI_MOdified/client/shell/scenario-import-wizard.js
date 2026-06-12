/* ============================================================================
 * scenario-import-wizard.js — UNIFIED-IMPORT-2: one "Import Scenario" flow
 * ----------------------------------------------------------------------------
 * The single primary import experience for normal operators:
 *   Upload red/blue DOCX → Start Scenario Generation → live progress (real,
 *   from checkpoints) → auto publish → auto import → scenario opens on the map.
 *
 * On a stopped/failed run it offers Continue (resume from checkpoint), Restart,
 * View Logs, and — only when ≥ 4 phases were generated — Import Partial Scenario
 * (stamped + badged "Partial Scenario — N/total phases").
 *
 * The three legacy cards (GeoJSON import, DOCX Simulation Import, Local Wargame
 * Output) are RELOCATED — not deleted — into a collapsed "Advanced Import Tools"
 * <details>. Their routes and window.App* APIs are untouched.
 *
 * Orchestration only — never parses DOCX, never calls the LLM, never bypasses
 * port-wargame.js, and keeps the FAST-DOC-2 freshness guard. No import happens
 * before an explicit Start (then auto on success) or an explicit Import-Partial
 * click.
 *
 * Window API: window.AppScenarioImportWizard { refresh, start, importPartial }
 * ========================================================================== */
(function () {
    'use strict';

    var POLL_MS = 4000;
    var STATUS = '/api/wargame-sim/status';

    // WIZARD-STATE-1: `stopped` tracks whether the stopped/error/cancelled panel
    // is active.  updateStartEnabled() uses it to hide the Start button while the
    // stopped panel occupies its slot (Restart inside the panel serves that role).
    var st = { red: false, blue: false, running: false, polling: false, stopping: false, runEnabled: false, stopped: false,
        // WIZARD-FINGERPRINT-1: true once the operator reconfigures the setup
        // (new DOCX / changed name / changed objective) since the wizard opened.
        // While dirty, an old stopped run must NOT be offered as the current run.
        setupDirty: false };

    function api(method, urlPath, body, raw) {
        var opts = { method: method, credentials: 'same-origin' };
        if (body != null) {
            opts.body = raw ? body : JSON.stringify(body);
            opts.headers = raw ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' };
        }
        return fetch(urlPath, opts).then(function (r) {
            return r.json().then(function (j) { return { status: r.status, body: j }; })
                            .catch(function () { return { status: r.status, body: null }; });
        });
    }

    // ── progress + status helpers ─────────────────────────────────────────────
    function pct(done, total) {
        if (!total) return 20;
        return Math.min(80, 20 + Math.round(60 * (done / total)));
    }

    function mount() {
        var anchor = document.getElementById('sw-live-scenario-import-card');
        if (!anchor || document.getElementById('wg-wizard-card')) return;

        // Primary wizard card — inserted FIRST, above the advanced tools.
        var card = document.createElement('div');
        card.id = 'wg-wizard-card';
        card.className = 'sw-src-subcard';
        card.style.cssText = 'border:1px solid #2e7d54;border-radius:6px;padding:12px;margin-top:8px;background:#161b18;';
        card.innerHTML =
            '<div class="sw-src-subcard-hdr">' +
              '<span class="sw-src-subcard-title" style="color:#7fd6a0;font-size:14px;">Import Scenario</span>' +
              '<span class="sw-src-subcard-sub" style="display:block;font-size:11px;color:#9aa3ad;margin-top:2px;">' +
                'Upload the red &amp; blue team documents, then Start. RMOOZ generates the wargame, ' +
                'tracks progress, and opens the scenario automatically. You don\'t need to deal with GeoJSON, ' +
                'publishing, or folders.</span>' +
            '</div>' +
            '<div class="wg-wz-body">' +
              '<div class="wg-wz-doc-grid">' +
                '<div class="wg-wz-doc-card wg-wz-doc-card--red" data-slot="red">' +
                  '<div class="wg-wz-doc-head">' +
                    '<span class="wg-wz-doc-side">Red team</span>' +
                    '<span class="wg-wz-doc-type">.docx</span>' +
                  '</div>' +
                  '<div class="wg-wz-doc-file" id="wg-wz-red-name">No file selected</div>' +
                  '<label class="wg-wz-file-btn" for="wg-wz-red">' +
                    '<span>Choose DOCX</span>' +
                    '<input type="file" id="wg-wz-red" class="wg-wz-file-input" accept=".docx">' +
                  '</label>' +
                '</div>' +
                '<div class="wg-wz-doc-card wg-wz-doc-card--blue" data-slot="blue">' +
                  '<div class="wg-wz-doc-head">' +
                    '<span class="wg-wz-doc-side">Blue team</span>' +
                    '<span class="wg-wz-doc-type">.docx</span>' +
                  '</div>' +
                  '<div class="wg-wz-doc-file" id="wg-wz-blue-name">No file selected</div>' +
                  '<label class="wg-wz-file-btn" for="wg-wz-blue">' +
                    '<span>Choose DOCX</span>' +
                    '<input type="file" id="wg-wz-blue" class="wg-wz-file-input" accept=".docx">' +
                  '</label>' +
                '</div>' +
              '</div>' +
              // Scenario name (optional) — set/edit before Start. Sent to the
              // importer as ?name=; blank keeps the existing safe default
              // (operation_name → safeName, or the partial auto-name).
              '<div class="wg-wz-name-row" style="margin-top:10px;">' +
                '<label for="wg-wz-name" style="display:block;font-size:12px;margin-bottom:3px;color:#9aa3ad;">Scenario name — اسم السيناريو <span style="color:#6a7a8a;">(optional)</span></label>' +
                '<input type="text" id="wg-wz-name" maxlength="64" autocomplete="off" placeholder="Leave blank to auto-name from the scenario" style="width:100%;padding:6px 8px;border:1px solid #4a5a6a;background:#161b18;color:#e8eaed;border-radius:4px;font-size:13px;box-sizing:border-box;">' +
              '</div>' +
              // PREGEN-CONTROL-2: Scenario Setup (collapsed, for operator to control Objective X)
              '<details id="wg-wz-setup" style="margin-top:8px;border:1px solid #4a5a6a;border-radius:4px;padding:8px;background:#0e1411;">' +
                '<summary style="cursor:pointer;font-weight:500;color:#8fa5b8;">Scenario Setup — تخطيط السيناريو</summary>' +
                '<div style="margin-top:8px;font-size:12px;color:#9aa3ad;">' +
                  '<div style="margin-bottom:6px;">' +
                    '<span>Objective X Position:</span>' +
                    '<span id="wg-wz-obj-default" style="margin-left:8px;color:#7fd6a0;"></span>' +
                  '</div>' +
                  '<div id="wg-wz-obj-override-status" style="margin-bottom:8px;padding:4px;border-radius:3px;color:#e8eaed;display:none;background:#1a2a24;">' +
                    '<span>Override: </span><span id="wg-wz-obj-override-text"></span>' +
                  '</div>' +
                  '<div id="wg-wz-obj-map" style="width:100%;height:240px;border:1px solid #4a5a6a;border-radius:3px;margin-bottom:8px;background:#0a0e12;"></div>' +
                  '<div style="font-size:10px;color:#6a7a8a;margin-bottom:8px;">Drag the marker on the map or enter coordinates below</div>' +
                  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">' +
                    '<div>' +
                      '<label style="display:block;font-size:11px;margin-bottom:3px;color:#9aa3ad;">Longitude</label>' +
                      '<input type="number" id="wg-wz-lon" step="0.01" min="-180" max="180" style="width:100%;padding:4px;border:1px solid #4a5a6a;background:#161b18;color:#e8eaed;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
                    '</div>' +
                    '<div>' +
                      '<label style="display:block;font-size:11px;margin-bottom:3px;color:#9aa3ad;">Latitude</label>' +
                      '<input type="number" id="wg-wz-lat" step="0.01" min="-90" max="90" style="width:100%;padding:4px;border:1px solid #4a5a6a;background:#161b18;color:#e8eaed;border-radius:3px;font-size:12px;box-sizing:border-box;">' +
                    '</div>' +
                  '</div>' +
                  '<div style="display:flex;gap:6px;">' +
                    '<button type="button" id="wg-wz-obj-save" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#22303f;color:#e8eaed;border-radius:3px;padding:4px 10px;font-size:12px;">Save Objective Position</button>' +
                    '<button type="button" id="wg-wz-obj-reset" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:3px;padding:4px 10px;font-size:12px;">Reset to Default</button>' +
                  '</div>' +
                '</div>' +
              '</details>' +
              '<div class="wg-wz-action-row">' +
                '<button type="button" id="wg-wz-start" class="wg-wz-start-btn" disabled>' +
                  'Start Scenario Generation</button>' +
                '<button type="button" id="wg-wz-stop" class="wg-wz-stop-btn" style="display:none;">' +
                  'Stop Generation</button>' +
              '</div>' +
              // progress
              '<div id="wg-wz-progress-wrap" style="display:none;margin-top:4px;">' +
                '<div style="height:14px;background:#0e1411;border:1px solid #2a2f37;border-radius:7px;overflow:hidden;">' +
                  '<div id="wg-wz-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#2e7d54,#5fc98a);transition:width .4s;"></div>' +
                '</div>' +
                '<div id="wg-wz-pctlabel" style="font-size:11px;color:#9aa3ad;margin-top:3px;"></div>' +
              '</div>' +
              '<div id="wg-wz-status" aria-live="polite" style="font-size:12px;min-height:16px;color:#c5ddf0;"></div>' +
              '<div id="wg-wz-badge" style="display:none;font-size:12px;font-weight:600;padding:4px 8px;border-radius:4px;align-self:flex-start;"></div>' +
              // stopped / partial panel
              '<div id="wg-wz-stopped" style="display:none;border-top:1px solid #2a2f37;margin-top:6px;padding-top:8px;">' +
                '<div id="wg-wz-stopped-msg" style="font-size:12px;color:#e0a93a;margin-bottom:6px;"></div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                  '<button type="button" id="wg-wz-continue" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#22303f;color:#e8eaed;border-radius:5px;padding:5px 12px;">Continue Generation</button>' +
                  '<button type="button" id="wg-wz-restart" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Restart Generation</button>' +
                  '<button type="button" id="wg-wz-partial" style="display:none;font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2f2a1c;color:#e8eaed;border-radius:5px;padding:5px 12px;">Import Partial Scenario</button>' +
                  '<button type="button" id="wg-wz-logs" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">View Logs</button>' +
                '</div>' +
                '<div id="wg-wz-partial-note" style="font-size:11px;color:#9aa3ad;margin-top:6px;"></div>' +
                '<pre id="wg-wz-logbox" style="display:none;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;font-size:10px;color:#a8b0bb;background:#0e1411;border:1px solid #2a2f37;border-radius:4px;padding:6px;margin:6px 0 0;"></pre>' +
              '</div>' +
            '</div>';
        anchor.parentNode.insertBefore(card, anchor.nextSibling);

        // Advanced tools <details> — relocate the three legacy cards (kept, not deleted).
        var adv = document.createElement('details');
        adv.id = 'wg-advanced-tools';
        adv.className = 'sw-src-subcard';
        adv.style.cssText = 'margin-top:8px;border:1px solid #2a2f37;border-radius:6px;padding:6px 10px;background:#15171b;';
        adv.innerHTML = '<summary style="cursor:pointer;font-size:12px;color:#9aa3ad;">Advanced Import Tools</summary>' +
                        '<div id="wg-advanced-body" style="margin-top:8px;"></div>';
        card.parentNode.insertBefore(adv, card.nextSibling);
        relocateAdvancedCards(0);

        // ── SOURCE-INSPECTOR-1: read-only "which files build this scenario?" ──
        // Collapsed by default. Explains the source chain + how to change things safely.
        var insp = document.createElement('details');
        insp.id = 'wg-wz-sources';
        insp.className = 'sw-src-subcard';
        insp.style.cssText = 'margin-top:8px;border:1px solid #2a2f37;border-radius:6px;padding:6px 10px;background:#15171b;';
        insp.innerHTML =
            '<summary style="cursor:pointer;font-size:12px;color:#9aa3ad;">Scenario Source Inspector — مصادر بناء السيناريو</summary>' +
            '<div style="margin-top:8px;">' +
              '<div style="font-size:11px;color:#9aa3ad;line-height:1.5;">' +
                'Which files build the scenario, and how to change them safely:' +
                '<ul style="margin:4px 0 6px 16px;padding:0;">' +
                  '<li>To change <b>units</b> → edit the <b>DOCX</b> and regenerate.</li>' +
                  '<li>To change <b>phase count / names</b> → edit <b>scenario.json</b> and regenerate.</li>' +
                  '<li><b>Do not edit generated files</b> (OOB, checkpoints, GeoJSON, export).</li>' +
                  '<li>Step 0 files are <b>planning context</b> unless explicitly wired as generator input.</li>' +
                  '<li><b>GeoJSON is output, not source.</b></li>' +
                '</ul>' +
              '</div>' +
              '<button type="button" id="wg-wz-sources-refresh" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:4px 10px;margin-bottom:6px;">Refresh Sources</button>' +
              '<div id="wg-wz-sources-body" style="font-size:11px;color:#c0c6cd;overflow-x:auto;"></div>' +
            '</div>';
        adv.parentNode.insertBefore(insp, adv.nextSibling);

        function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]; }); }
        function fmtSrcStatus(s) {
            var t = s.status || {};
            switch (s.key) {
                case 'red_docx': case 'blue_docx':
                    return (t.input && t.input.present ? 'present' : 'missing') + (t.staged && t.staged.present ? ' · staged✓' : '');
                case 'scenario_json': return t.present ? ('present · phases_total=' + t.phases_total) : 'missing';
                case 'scenario_overrides': return t.present ? ('override active · lon ' + (t.override && t.override.lon ? t.override.lon.toFixed(2) : '?') + ' lat ' + (t.override && t.override.lat ? t.override.lat.toFixed(2) : '?')) : 'no override yet';
                case 'step0':         return t.present ? (t.count + ' json file(s)') : 'folder absent';
                case 'oob':           return t.present ? ('Red ' + (t.red_units == null ? '?' : t.red_units) + ' · Blue ' + (t.blue_units == null ? '?' : t.blue_units)) : 'missing (no OOB parse yet)';
                case 'checkpoints':   return (t.phases_done || 0) + ' / ' + (t.phases_total == null ? '?' : t.phases_total) + ' phases' + (t.run_id ? (' · ' + t.run_id) : '');
                case 'all_phases':    if (!t.present) return 'no run output yet'; var f = t.features || {}; return 'present · ' + (f.phases == null ? '?' : f.phases) + ' phases · Red ' + (f.red_units == null ? '?' : f.red_units) + ' · Blue ' + (f.blue_units == null ? '?' : f.blue_units);
                case 'export':        return t.run_id ? (t.run_id + (t.stale ? ' · ⚠ STALE' : ' · current')) : 'nothing published';
                case 'rmooz_scenario':return t.active_name ? (t.active_name + (t.meta && t.meta.generation_status ? (' · ' + t.meta.generation_status) : '') + (t.present ? '' : ' (file missing)')) : 'none active';
                default: return '';
            }
        }
        function loadSources() {
            var body = insp.querySelector('#wg-wz-sources-body');
            body.textContent = 'Loading…';
            api('GET', '/api/wargame-sim/sources').then(function (r) {
                var rows = (r.body && r.body.sources) || [];
                if (!rows.length) { body.textContent = 'No source info (server not running?).'; return; }
                var html = '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:520px;">' +
                    '<tr style="color:#7f8893;text-align:left;"><th style="padding:2px 4px;">File</th><th>Type</th><th>Edit</th><th>Used for</th><th>Status</th></tr>';
                rows.forEach(function (s) {
                    var tip = esc(s.how_to_modify || '');
                    var edit = s.editable === true
                        ? '<span style="color:#7fd6a0;" title="' + tip + '">✎ yes</span>'
                        : '<span style="color:#9aa3ad;" title="' + tip + '">🔒 no</span>';
                    html += '<tr style="border-top:1px solid #23262b;vertical-align:top;">' +
                        '<td style="padding:3px 4px;color:#e8eaed;"><b>' + esc(s.file) + '</b></td>' +
                        '<td style="color:#9aa3ad;">' + esc(s.source_type) + '</td>' +
                        '<td>' + edit + '</td>' +
                        '<td style="color:#9aa3ad;max-width:230px;">' + esc(s.used_for) + '</td>' +
                        '<td style="color:#c0c6cd;">' + esc(fmtSrcStatus(s)) + '</td>' +
                        '</tr>';
                });
                body.innerHTML = html + '</table>';
            }).catch(function (e) { body.textContent = 'Sources unavailable: ' + e.message; });
        }
        insp.querySelector('#wg-wz-sources-refresh').addEventListener('click', loadSources);
        loadSources();

        var el = {
            red:    card.querySelector('#wg-wz-red'),
            blue:   card.querySelector('#wg-wz-blue'),
            redRow: card.querySelector('[data-slot="red"]'),
            blueRow: card.querySelector('[data-slot="blue"]'),
            redName: card.querySelector('#wg-wz-red-name'),
            blueName: card.querySelector('#wg-wz-blue-name'),
            name:    card.querySelector('#wg-wz-name'),
            start:  card.querySelector('#wg-wz-start'),
            stop:   card.querySelector('#wg-wz-stop'),
            pwrap:  card.querySelector('#wg-wz-progress-wrap'),
            bar:    card.querySelector('#wg-wz-bar'),
            pctl:   card.querySelector('#wg-wz-pctlabel'),
            status: card.querySelector('#wg-wz-status'),
            badge:  card.querySelector('#wg-wz-badge'),
            stopped:card.querySelector('#wg-wz-stopped'),
            smsg:   card.querySelector('#wg-wz-stopped-msg'),
            cont:   card.querySelector('#wg-wz-continue'),
            restart:card.querySelector('#wg-wz-restart'),
            partial:card.querySelector('#wg-wz-partial'),
            logs:   card.querySelector('#wg-wz-logs'),
            pnote:  card.querySelector('#wg-wz-partial-note'),
            logbox: card.querySelector('#wg-wz-logbox'),
            // PREGEN-CONTROL-2: Scenario Setup elements
            objDefault: card.querySelector('#wg-wz-obj-default'),
            objOverrideStatus: card.querySelector('#wg-wz-obj-override-status'),
            objOverrideText: card.querySelector('#wg-wz-obj-override-text'),
            objLon: card.querySelector('#wg-wz-lon'),
            objLat: card.querySelector('#wg-wz-lat'),
            objSave: card.querySelector('#wg-wz-obj-save'),
            objReset: card.querySelector('#wg-wz-obj-reset'),
        };

        // ── DOC-UNDERSTANDING-1 / Phase E: AI Understanding review screen ──
        // A read-only "what the AI understood" panel shown BEFORE generation.
        // Calls the offline JS-gate /analyze (classify + dedupe + side-separate
        // + seed the Operational Brief) and renders it with four operator
        // actions. No generation happens until Generate is clicked.
        (function buildReviewUi() {
            var actionRow = el.start.parentNode;
            var analyzeBtn = document.createElement('button');
            analyzeBtn.type = 'button';
            analyzeBtn.id = 'wg-wz-analyze';
            analyzeBtn.style.cssText = 'font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#22303f;color:#cfe6ff;border-radius:6px;padding:7px 14px;display:none;';
            analyzeBtn.textContent = 'Review AI Understanding — مراجعة فهم الذكاء الاصطناعي';
            actionRow.appendChild(analyzeBtn);
            var review = document.createElement('div');
            review.id = 'wg-wz-review';
            review.style.cssText = 'display:none;margin-top:10px;border:1px solid #2e5d7d;border-radius:8px;background:#0e1620;padding:12px;';
            actionRow.parentNode.insertBefore(review, actionRow.nextSibling);
            el.analyze = analyzeBtn;
            el.review = review;
            analyzeBtn.addEventListener('click', runAnalyze);
        })();

        function showReviewError(msg) {
            el.review.style.display = 'block';
            el.review.innerHTML = '<div style="color:#e0a93a;font-size:12px;">⚠ ' + esc(msg) + '</div>';
            el.review.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        function runAnalyze() {
            if (!el.analyze) return;
            el.analyze.disabled = true;
            var prev = el.analyze.textContent;
            el.analyze.textContent = 'Analyzing… جارٍ التحليل';
            api('POST', '/api/wargame-sim/analyze').then(function (r) {
                el.analyze.disabled = false; el.analyze.textContent = prev;
                if (!r.body) { showReviewError('No response from analyze (is the server running?).'); return; }
                if (!r.body.ok) { showReviewError((r.body && r.body.error) || ('analyze failed (' + r.status + ')')); return; }
                attachPlacement(r.body).then(function () { renderReview(r.body); });
            }).catch(function (e) { el.analyze.disabled = false; el.analyze.textContent = prev; showReviewError(e.message); });
        }
        // G-3C: enrich the analyze payload with location placement candidates
        // (the G-3B resolver, server-side). Read-only + best-effort — a failure
        // here NEVER blocks the review (the panel just stays empty).
        function attachPlacement(payload) {
            var brief = payload && payload.brief;
            if (!brief) return Promise.resolve(payload);
            return api('POST', '/api/wargame-sim/placement', { brief: brief }).then(function (pr) {
                if (pr && pr.body && pr.body.ok) payload.placement = pr.body;
                return payload;
            }).catch(function () { return payload; });
        }
        // Phase E renderer lives in shell/doc-understanding-review.js (shared
        // with the standalone verify page) so the rendered UI cannot drift.
        function renderReview(p) {
            if (!window.RmoozDocReview || !window.RmoozDocReview.render) {
                showReviewError('review renderer not loaded (shell/doc-understanding-review.js)');
                return;
            }
            window.RmoozDocReview.render(el.review, p, {
                onGenerate: function (template) { generateFromReviewedBrief(p, template); },
                onUploadMore: function () {
                    el.review.style.display = 'none';
                    var grid = card.querySelector('.wg-wz-doc-grid');
                    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                },
                onCancel: function () { el.review.style.display = 'none'; },
            });
            el.review.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Phase F: "Generate from Reviewed Brief" — RMOOZ generates a DRAFT
        // scenario from the APPROVED review payload (the brief), never from raw
        // document chunks or LLM free text. The objective comes from Scenario
        // Setup; without it the server refuses and we ask the operator to set it.
        function generateFromReviewedBrief(payload, template) {
            var lon = parseFloat(el.objLon && el.objLon.value);
            var lat = parseFloat(el.objLat && el.objLat.value);
            var objective = (isFinite(lon) && isFinite(lat)) ? { lon: lon, lat: lat } : undefined;
            var reqBody = {
                brief: payload && payload.brief,
                understanding: payload && payload.understanding,
                template: template || undefined,
                objective: objective,
                name: enteredName() || undefined,
            };
            setStatus('RMOOZ generating a draft scenario from the reviewed brief…');
            api('POST', '/api/wargame-sim/generate', reqBody).then(function (r) {
                if (r.status === 422 && r.body && r.body.requires_objective) {
                    setStatus('Set the objective position on the map first (open "Scenario Setup"), then Generate.', '#e0a93a');
                    var setup = card.querySelector('#wg-wz-setup'); if (setup) setup.open = true;
                    return;
                }
                if (!r.body || !r.body.ok) {
                    setStatus('generate failed: ' + ((r.body && r.body.error) || ('HTTP ' + r.status)), '#e0a93a');
                    return;
                }
                el.review.style.display = 'none';
                var tplName = (r.body.generation && r.body.generation.template) || 'template';
                showBadge('Draft from Brief — ' + tplName + (r.body.draft ? ' (review positions)' : ''), true);
                setStatus('Draft scenario "' + r.body.name + '" generated (RED ' + r.body.red_units + ' / BLUE ' + r.body.blue_units + ', ' + r.body.steps + ' phases) — opening…');
                openScenario(r.body, false).then(function () {
                    setStatus('Draft scenario "' + r.body.name + '" opened. Positions are DRAFT — refine on the map.');
                }).catch(function (e) { setStatus('generated but load failed: ' + e.message, '#e0a93a'); });
            }).catch(function (e) { setStatus('generate error: ' + e.message, '#e0a93a'); });
        }

        function setStatus(msg, color) { el.status.style.color = color || '#c5ddf0'; el.status.textContent = msg || ''; }
        function setProgress(p, label) {
            el.pwrap.style.display = 'block';
            el.bar.style.width = Math.max(0, Math.min(100, p)) + '%';
            el.pctl.textContent = p + '% — ' + (label || '');
        }
        function showBadge(text, partial) {
            el.badge.style.display = 'inline-block';
            el.badge.style.background = partial ? '#3a2f12' : '#1f3a2b';
            el.badge.style.color = partial ? '#e0c060' : '#7fd6a0';
            el.badge.style.border = '1px solid ' + (partial ? '#b8860b' : '#2e7d54');
            el.badge.textContent = text;
        }
        function setLogsVisible(visible) {
            el.logbox.style.display = visible ? 'block' : 'none';
            if (el.logs) el.logs.textContent = visible ? 'Hide Logs' : 'View Logs';
        }
        function writeLog(payload, visible) {
            try {
                el.logbox.textContent = (typeof payload === 'string') ? payload : JSON.stringify(payload, null, 2);
            } catch (_) {
                el.logbox.textContent = String(payload || '');
            }
            setLogsVisible(!!visible);
        }
        function hideStopped() {
            st.stopped = false;
            el.stopped.style.display = 'none';
            el.partial.style.display = 'none';
            el.pnote.textContent = '';
            // Reset per-button overrides so next showStopped() starts clean.
            el.cont.style.display = '';
            el.restart.style.display = '';
            writeLog('', false);
            updateStartEnabled();   // restore Start button visibility
        }
        // WIZARD-FINGERPRINT-1: a stopped/partial run may only be surfaced as the
        // CURRENT run when (a) the server proves the staged setup matches the
        // fingerprint that run was launched with, and (b) the operator hasn't
        // started reconfiguring a new setup since the wizard opened. Conservative:
        // missing metadata or any mismatch → not ours → Start-only.
        function stoppedBelongsToSetup(sim) {
            return !st.setupDirty && !!(sim && sim.setup_matches_stopped_run === true);
        }
        // The operator changed the setup (new DOCX / name / objective). Drop any
        // stale stopped panel and force the clean "ready to Start" state. A late
        // status poll for the old run can no longer repaint the stopped panel.
        function markSetupDirty() {
            st.setupDirty = true;
            if (st.stopped) hideStopped();
        }
        function showFailure(title, payload) {
            st.stopped = true;
            el.pwrap.style.display = 'none';
            el.stopped.style.display = 'block';
            el.smsg.textContent = title;
            el.cont.style.display = 'none';   // no resume after a hard failure
            el.partial.style.display = 'none';
            el.pnote.textContent = '';
            updateStartEnabled();
            writeLog(payload, true);
        }

        var pollTimer = null;
        function clearPollTimer() {
            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }
        }
        function schedulePoll(fn) {
            clearPollTimer();
            pollTimer = setTimeout(fn, POLL_MS);
        }

        // Operator-entered scenario name (optional). Trimmed; null when blank so
        // callers omit ?name= and the server keeps its safe default naming.
        function enteredName() {
            var v = (el.name && el.name.value || '').trim();
            return v || null;
        }
        // Append a name query param onto an import URL when the operator set one.
        function withName(url) {
            var nm = enteredName();
            if (!nm) return url;
            return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'name=' + encodeURIComponent(nm);
        }

        // WIZARD-SAVE-1: build an import URL with optional name/overwrite params.
        // confirm=1 bypasses the FAST-DOC-2 stale guard, which the operator has
        // already accepted by the time a name conflict is being resolved.
        function importUrl(opts) {
            opts = opts || {};
            var u = '/api/wargame-sim/import?confirm=1';
            if (opts.partial)   u += '&partial=1';
            if (opts.name)      u += '&name=' + encodeURIComponent(opts.name);
            if (opts.overwrite) u += '&overwrite=1';
            return u;
        }

        // WIZARD-SAVE-1: on a 409 name_conflict, offer Save-as-suggested (default),
        // Enter-another-name, Replace (explicit confirm), or Cancel — then retry.
        // Recurses if the chosen name also collides. Resolves to the final api()
        // response, or null if the operator cancels. Never replaces without an
        // explicit, separate confirmation.
        function resolveNameConflict(r, partial) {
            if (!r || r.status !== 409 || !r.body || !r.body.name_conflict) return Promise.resolve(r);
            var req = r.body.requestedName, sug = r.body.suggestedName;
            // A) default — save as the suggested unique name.
            if (window.confirm('A scenario named "' + req + '" already exists.\n\nOK = save as "' + sug + '" (recommended)\nCancel = more options')) {
                return api('POST', importUrl({ partial: partial, name: sug })).then(function (r2) { return resolveNameConflict(r2, partial); });
            }
            // B) enter another name (blank → consider Replace).
            var entered = window.prompt('Enter a different scenario name, or leave blank to REPLACE the existing one:', sug);
            if (entered === null) return Promise.resolve(null);            // D) cancel
            entered = entered.trim();
            if (entered) return api('POST', importUrl({ partial: partial, name: entered })).then(function (r2) { return resolveNameConflict(r2, partial); });
            // C) explicit Replace — its own confirmation.
            if (window.confirm('REPLACE the existing scenario "' + req + '"? This permanently overwrites it.')) {
                return api('POST', importUrl({ partial: partial, name: req, overwrite: true })).then(function (r2) { return resolveNameConflict(r2, partial); });
            }
            return Promise.resolve(null);                                  // cancel
        }

        function updateStartEnabled() {
            el.start.disabled = !(st.red && st.blue) || st.running;
            // WIZARD-STATE-1: hide the Start button while the stopped panel is shown
            // so the two are never simultaneously active.  The Restart button inside
            // the stopped panel serves the same action as Start.
            el.start.style.display = st.stopped ? 'none' : '';
            if (el.stop) {
                el.stop.style.display = st.running ? 'inline-flex' : 'none';
                el.stop.disabled = !!st.stopping;
            }
            // DOC-UNDERSTANDING-1 / Phase E: offer "Review AI Understanding" once
            // at least one document is staged (red OR blue) and we're idle.
            if (el.analyze) {
                el.analyze.style.display = st.stopped ? 'none' : '';
                el.analyze.disabled = !(st.red || st.blue) || st.running;
            }
        }

        function slotUi(slot) {
            return slot === 'red'
                ? { row: el.redRow, name: el.redName }
                : { row: el.blueRow, name: el.blueName };
        }

        function markChoosing(slot) {
            var ui = slotUi(slot);
            var other = slotUi(slot === 'red' ? 'blue' : 'red');
            if (other.row) other.row.classList.remove('is-active');
            if (ui.row) {
                ui.row.classList.add('is-active');
                ui.row.classList.remove('is-error');
            }
        }

        function markFilePicked(slot, file) {
            var ui = slotUi(slot);
            if (ui.name) ui.name.textContent = file && file.name ? file.name : 'No file selected';
            if (ui.row) {
                ui.row.classList.toggle('has-file', !!file);
                ui.row.classList.remove('is-error');
            }
        }

        function markReady(slot) {
            var ui = slotUi(slot);
            if (ui.row) {
                ui.row.classList.add('is-ready');
                ui.row.classList.remove('is-active', 'is-error');
            }
        }

        function markError(slot) {
            var ui = slotUi(slot);
            if (ui.row) {
                ui.row.classList.add('is-error');
                ui.row.classList.remove('is-ready');
            }
        }

        function stageDoc(slot, file) {
            markChoosing(slot);
            markFilePicked(slot, file);
            setProgress(0, 'validating ' + slot + ' document');
            if (!/\.docx$/i.test(file.name)) {
                markError(slot);
                setStatus('Please choose a .docx file for ' + slot + '.', '#e05252');
                return;
            }
            setProgress(10, 'staging ' + slot + ' document');
            return api('POST', '/api/wargame-sim/stage-doc?slot=' + slot, file, true).then(function (r) {
                if (r.status !== 200 || !r.body || !r.body.ok) {
                    markError(slot);
                    setStatus('Upload failed for ' + slot + ': ' + ((r.body && r.body.error) || r.status), '#e05252');
                    return;
                }
                st[slot] = true;
                markReady(slot);
                // WIZARD-FINGERPRINT-1: a newly staged DOCX is a new setup. Drop any
                // stale stopped panel and show Start (the server will re-prove a
                // match against the next run, not the old one).
                markSetupDirty();
                setStatus((st.red && st.blue) ? 'Both documents staged. Click Start.' : (slot + ' document staged.'), '#7fc07f');
                updateStartEnabled();
            });
        }

        // ── PREGEN-CONTROL-2: Scenario Setup (Objective X control) ──────────────
        var objMap = null;
        var objMarker = null;
        function loadObjective() {
            api('GET', '/api/wargame-sim/status').then(function (r) {
                if (!r.body || !r.body.sim || !r.body.sim.objective) return;
                var obj = r.body.sim.objective;
                var defObj = obj.default;
                if (defObj && typeof defObj.lon === 'number' && typeof defObj.lat === 'number') {
                    el.objDefault.textContent = defObj.lon.toFixed(2) + ', ' + defObj.lat.toFixed(2);
                    el.objLon.value = defObj.lon;
                    el.objLat.value = defObj.lat;
                }
                var ovObj = obj.override;
                if (ovObj && typeof ovObj.lon === 'number' && typeof ovObj.lat === 'number') {
                    el.objOverrideStatus.style.display = 'block';
                    el.objOverrideText.textContent = ovObj.lon.toFixed(2) + ', ' + ovObj.lat.toFixed(2);
                    el.objLon.value = ovObj.lon;
                    el.objLat.value = ovObj.lat;
                }
                // After inputs are updated, reposition the marker if map is open
                setTimeout(repositionMarker, 0);
            });
        }
        function repositionMarker() {
            // Explicitly reposition marker to current input values (called after loadObjective or user input)
            if (objMap && objMarker) {
                var lon = parseFloat(el.objLon.value);
                var lat = parseFloat(el.objLat.value);
                if (!isNaN(lon) && !isNaN(lat)) {
                    objMarker.setLatLng([lat, lon]);
                    objMap.setView([lat, lon], 7);
                }
            }
        }
        function initObjectiveMap() {
            if (objMap) {
                // Map already initialized — just update marker to current position
                repositionMarker();
                return;
            }
            if (!window.L) return; // Leaflet not loaded
            var mapContainer = card.querySelector('#wg-wz-obj-map');
            if (!mapContainer) return;
            try {
                var lon = parseFloat(el.objLon.value) || 19.55;
                var lat = parseFloat(el.objLat.value) || 29.74;
                objMap = window.L.map(mapContainer, { attributionControl: false }).setView([lat, lon], 7);
                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    { maxZoom: 13, minZoom: 3 }).addTo(objMap);
                objMarker = window.L.marker([lat, lon], { draggable: true }).addTo(objMap);
                objMarker.bindPopup('Objective X — drag to move');
                // Sync marker drag to inputs
                objMarker.on('dragend', function () {
                    var ll = objMarker.getLatLng();
                    el.objLon.value = ll.lng.toFixed(2);
                    el.objLat.value = ll.lat.toFixed(2);
                });
                // Sync input changes to marker
                el.objLon.addEventListener('change', function () {
                    var lon = parseFloat(el.objLon.value);
                    var lat = parseFloat(el.objLat.value);
                    if (!isNaN(lon) && !isNaN(lat)) {
                        objMarker.setLatLng([lat, lon]);
                        objMap.setView([lat, lon], 7);
                    }
                });
                el.objLat.addEventListener('change', function () {
                    var lon = parseFloat(el.objLon.value);
                    var lat = parseFloat(el.objLat.value);
                    if (!isNaN(lon) && !isNaN(lat)) {
                        objMarker.setLatLng([lat, lon]);
                        objMap.setView([lat, lon], 7);
                    }
                });
            } catch (e) {
                console.warn('Could not initialize objective map:', e);
            }
        }
        function saveObjective() {
            var lon = parseFloat(el.objLon.value);
            var lat = parseFloat(el.objLat.value);
            if (isNaN(lon) || isNaN(lat)) {
                el.status.textContent = 'Invalid coordinates.';
                el.status.style.color = '#e05252';
                return;
            }
            el.objSave.disabled = true;
            api('POST', '/api/wargame-sim/objective-override?lon=' + lon + '&lat=' + lat, null).then(function (r) {
                el.objSave.disabled = false;
                if (r.status === 200 && r.body && r.body.ok) {
                    el.status.textContent = 'Objective saved ✓ Check Source Inspector for scenario_overrides.json.';
                    el.status.style.color = '#7fc07f';
                    // WIZARD-FINGERPRINT-1: a changed objective ties to the NEXT run,
                    // not an old stopped one — clear the stale stopped panel.
                    markSetupDirty();
                    loadObjective();
                    // Auto-refresh Source Inspector to show the override
                    setTimeout(function () {
                        try {
                            var insp = card.querySelector('#wg-wz-sources-body');
                            if (insp) {
                                var refreshBtn = card.querySelector('#wg-wz-sources-refresh');
                                if (refreshBtn) refreshBtn.click();
                            }
                        } catch (e) {}
                    }, 200);
                } else {
                    el.status.textContent = 'Failed to save objective: ' + ((r.body && r.body.error) || r.status);
                    el.status.style.color = '#e05252';
                }
            }).catch(function (e) {
                el.objSave.disabled = false;
                el.status.textContent = 'Error saving objective: ' + e.message;
                el.status.style.color = '#e05252';
            });
        }
        function resetObjective() {
            loadObjective();
            el.status.textContent = 'Objective reset to default.';
            el.status.style.color = '#c5ddf0';
        }
        if (el.objSave) el.objSave.addEventListener('click', saveObjective);
        if (el.objReset) el.objReset.addEventListener('click', resetObjective);
        var setupDetails = card.querySelector('#wg-wz-setup');
        if (setupDetails) {
            setupDetails.addEventListener('toggle', function () {
                if (setupDetails.open) {
                    setTimeout(initObjectiveMap, 50); // Defer to allow DOM to render
                }
            });
        }
        loadObjective();

        // ── start / poll ──────────────────────────────────────────────────────
        function start(resume) {
            hideStopped();
            el.badge.style.display = 'none';
            // WIZARD-FINGERPRINT-1: a fresh Start defines the new run's setup, so the
            // setup is no longer "dirty" relative to it. The run-meta the server
            // persists will match this staged setup.
            if (!resume) st.setupDirty = false;
            st.running = true; st.stopping = false; updateStartEnabled();
            // Part A: a fresh run starts at 0 (resume keeps its prior progress).
            // The server gates status so a new run never shows the previous run's
            // phases_done; reset the bar here so it can't flash the old value.
            setProgress(resume ? 20 : 0, resume ? 'resuming run' : 'starting new generation…');
            setStatus(resume ? 'Resuming generation from the last checkpoint…' : 'Starting WarGamingGEN…');
            // Pass the operator's chosen name so the new run's meta records it.
            var runUrl = '/api/wargame-sim/run' + (resume ? '?resume=1' : '');
            if (!resume) { var nm0 = enteredName(); if (nm0) runUrl += '?name=' + encodeURIComponent(nm0); }
            return api('POST', runUrl).then(function (r) {
                var b = r.body || {};
                if (b.ok && (b.started || b.already_running)) { beginPoll(); return; }
                // Disabled or manual mode — guide the operator to Advanced.
                st.running = false; st.stopping = false; updateStartEnabled();
                el.pwrap.style.display = 'none';
                setStatus('⚠ ' + (b.reason || 'Local generation is disabled on this server (RMOOZ_ALLOW_SIM_RUN=1 required). ' +
                    'Use Advanced Import Tools, or import an already-generated output.'), '#e0a93a');
                var d = document.getElementById('wg-advanced-tools'); if (d) d.open = true;
            }).catch(function (e) {
                st.running = false; st.stopping = false; updateStartEnabled();
                showFailure('Start failed before generation could run.', { status: 'error', message: e.message });
                setStatus('Start failed: ' + e.message, '#e05252');
            });
        }

        function beginPoll() {
            if (st.polling) return;
            st.polling = true;
            (function tick() {
                if (!st.polling) return;
                api('GET', STATUS).then(function (r) {
                    var b = r.body || {}; var sim = b.sim || {};
                    st.runEnabled = !!b.runEnabled;
                    if (sim.running) {
                        setProgress(pct(sim.phases_done, sim.phases_total),
                            'generating phase ' + sim.phases_done + ' / ' + sim.phases_total);
                        setStatus(st.stopping ? 'Stopping generation… waiting for the process to exit.' : (sim.message || 'Generating…'), '#e0c060');
                        schedulePoll(tick);
                        return;
                    }
                    st.polling = false; clearPollTimer(); st.running = false; st.stopping = false; updateStartEnabled();
                    var exportReady = !!(b.export && b.export.all_phases);
                    if (sim.status === 'complete' || (sim.exit_code === 0 && exportReady)) {
                        finishSuccess(b);
                    } else if (stoppedBelongsToSetup(sim)) {
                        // The run we just watched belongs to this setup (we started
                        // it; its meta matches) — surface Continue / Partial / Restart.
                        showStopped(b);
                    } else {
                        // WIZARD-FINGERPRINT-1: a late/stale status for an unrelated
                        // run must not repaint the stopped panel over a new setup.
                        hideStopped();
                        setStatus('Ready to start a new generation.', '#c5ddf0');
                        updateStartEnabled();
                    }
                }).catch(function (e) {
                    st.polling = false; clearPollTimer(); st.running = false; st.stopping = false; updateStartEnabled();
                    showFailure('Lost contact with the server while polling.', {
                        status: 'error',
                        message: (e && e.message) ? e.message : 'polling failed'
                    });
                    setStatus('Lost contact with the server while polling.', '#e05252');
                });
            })();
        }

        function waitForStopped(attempt) {
            attempt = attempt || 0;
            return api('GET', STATUS).then(function (r) {
                var b = r.body || {}; var sim = b.sim || {};
                if (sim.running && attempt < 24) {
                    return new Promise(function (resolve) {
                        setTimeout(function () { resolve(waitForStopped(attempt + 1)); }, 1000);
                    });
                }
                st.polling = false; clearPollTimer();
                st.running = false; st.stopping = false; updateStartEnabled();
                if (sim.running) throw new Error('server still reports generation running');
                showStopped(b);
                return b;
            });
        }

        function stopGeneration() {
            if (!st.running) return Promise.resolve();
            st.stopping = true; updateStartEnabled();
            setStatus('Stopping generation… preserving checkpoints and outputs.', '#e0a93a');
            return api('POST', '/api/wargame-sim/cancel').then(function (r) {
                if (r.status !== 200 && r.status !== 202 && r.status !== 409) {
                    throw new Error((r.body && r.body.error) || ('cancel failed (' + r.status + ')'));
                }
                return waitForStopped(0);
            }).catch(function (e) {
                st.stopping = false; updateStartEnabled();
                showFailure('Stop Generation failed.', { status: 'error', message: e.message });
                setStatus('Stop Generation failed: ' + e.message, '#e05252');
            });
        }

        // ── success: ensure published → import → open ──────────────────────────
        function finishSuccess(statusBody) {
            setProgress(85, 'publishing outputs');
            setStatus('Generation complete. Publishing…', '#7fc07f');
            var pub = (statusBody && statusBody.export && statusBody.export.all_phases)
                ? Promise.resolve({ status: 200, body: { ok: true } })
                : api('POST', '/api/wargame-sim/publish');
            pub.then(function () {
                setProgress(95, 'importing scenario');
                return api('POST', withName('/api/wargame-sim/import'));
            }).then(function (r) {
                if (r.status === 409 && r.body && r.body.stale) {
                    // The export we just produced is the one we want — confirm.
                    return api('POST', withName('/api/wargame-sim/import?confirm=1'));
                }
                return r;
            }).then(function (r) {
                return resolveNameConflict(r, false);   // WIZARD-SAVE-1: non-destructive save
            }).then(function (r) {
                if (r === null) {                        // operator cancelled at the conflict prompt
                    st.running = false; updateStartEnabled();
                    setStatus('Import cancelled — the existing scenario was kept.', '#e0a93a');
                    return;
                }
                if (!r || r.status !== 200 || !r.body || !r.body.ok) {
                    throw new Error((r && r.body && r.body.error) || 'import failed');
                }
                return openScenario(r.body, false);
            }).catch(function (e) {
                st.running = false; updateStartEnabled();
                showFailure('Import failed after generation completed.', { status: 'error', message: e.message });
                setStatus('Could not finish import: ' + e.message, '#e05252');
            });
        }

        // ── stopped / partial branch ───────────────────────────────────────────
        // WIZARD-STATE-1: handles 7 mutually-exclusive states:
        //   A. idle                       — not shown (initial poll normalises to this)
        //   B. running                    — not shown (progress panel owns the UI)
        //   C. stopped_no_phases (done=0) — panel + "cancelled before any phases" msg
        //   D. stopped_partial_under_threshold (0<done<4) — panel, Continue, no Import
        //   E. stopped_partial_importable (done>=4) — panel + Import Partial
        //   F. complete                   — finishSuccess() owns this path
        //   G. error                      — panel + error message
        function showStopped(b) {
            var sim = b.sim || {};
            var isError = sim.status === 'error';
            var done = sim.phases_done || 0;
            // Continue only when the server says resuming is safe (has checkpoints).
            var canContinue = !!(sim.can_resume && done > 0);

            st.running = false; st.stopping = false; st.stopped = true;
            updateStartEnabled();     // hides Start button while panel is active
            el.pwrap.style.display = 'none';
            el.stopped.style.display = 'block';

            // Per-button visibility — set explicitly so state is always consistent.
            el.cont.style.display    = canContinue ? '' : 'none';
            el.restart.style.display = '';  // always available in the stopped panel

            if (done === 0) {
                // State C: cancelled/stopped before any checkpoint was written.
                el.smsg.textContent = isError
                    ? 'Generation failed before any phases were produced.'
                    : 'Generation cancelled before any phases were produced.';
                setStatus(isError ? 'Run error shown below.' : 'No phases were generated. You can restart.', isError ? '#e05252' : '#e0a93a');
                el.partial.style.display = 'none';
                el.pnote.textContent = '';
            } else {
                // States D / E: at least one checkpoint exists.
                el.smsg.textContent = 'Generation stopped after ' + done + ' / ' + sim.phases_total + ' phases.';
                setStatus(isError ? 'Run error shown below.' : 'You can continue, restart, or import what was generated.', isError ? '#e05252' : '#e0a93a');
                if (sim.partial_import_allowed) {
                    // State E: enough phases to import.
                    el.partial.style.display = 'inline-block';
                    el.pnote.textContent = '';
                } else {
                    // State D: below import threshold.
                    el.partial.style.display = 'none';
                    el.pnote.textContent = done < 4
                        ? 'Partial import available after at least 4 generated phases. Current: ' + done + '.'
                        : '';
                }
            }

            writeLog({ status: sim.status, message: sim.message, error: sim.error,
                phases_done: done, phases_total: sim.phases_total, last_run_id: sim.last_run_id,
                can_resume: sim.can_resume, exit_code: sim.exit_code }, isError);
        }

        function importPartial(customName) {
            // WIZARD-FINGERPRINT-1: never import a partial run that no longer matches
            // the staged setup (operator changed DOCX / name / objective since it ran).
            if (st.setupDirty) {
                hideStopped();
                setStatus('That partial run is from a different setup. Start a new generation instead.', '#e0a93a');
                return;
            }
            el.partial.disabled = true;
            el.pwrap.style.display = 'block';
            setProgress(85, 'materializing generated phases (no LLM)');
            setStatus('Rebuilding the generated phases from checkpoints…', '#e0c060');
            api('POST', '/api/wargame-sim/regenerate').then(function (r) {
                if (!r.body || !r.body.ok) throw new Error((r.body && (r.body.error || r.body.reason)) || 'regenerate failed');
                setProgress(90, 'publishing partial outputs');
                return api('POST', '/api/wargame-sim/publish');
            }).then(function () {
                setProgress(95, 'importing partial scenario');
                var importUrl = '/api/wargame-sim/import?partial=1';
                if (customName) importUrl += '&name=' + encodeURIComponent(customName);
                return api('POST', importUrl);
            }).then(function (r) {
                if (r.status === 409 && r.body && r.body.stale) {
                    var url = '/api/wargame-sim/import?partial=1&confirm=1';
                    if (customName) url += '&name=' + encodeURIComponent(customName);
                    return api('POST', url);
                }
                return r;
            }).then(function (r) {
                if (r.status === 400 && r.body && /at least 4/.test(r.body.error || '')) {
                    throw new Error(r.body.error);
                }
                return resolveNameConflict(r, true);    // WIZARD-SAVE-1: rename / replace / cancel
            }).then(function (r) {
                if (r === null) {                        // operator cancelled at the conflict prompt
                    el.partial.disabled = false;
                    el.pwrap.style.display = 'none';
                    el.stopped.style.display = 'block';
                    st.stopped = true; updateStartEnabled();
                    setStatus('Partial import cancelled — the existing scenario was kept.', '#e0a93a');
                    return;
                }
                if (r.status !== 200 || !r.body || !r.body.ok) throw new Error((r.body && r.body.error) || 'partial import failed');
                return openScenario(r.body, true);
            }).catch(function (e) {
                el.partial.disabled = false;
                el.pwrap.style.display = 'none';
                el.stopped.style.display = 'block';
                el.smsg.textContent = 'Partial import failed.';
                el.cont.style.display = 'none';
                st.stopped = true;
                updateStartEnabled();
                writeLog({ status: 'error', message: e.message }, true);
                setStatus('Partial import failed: ' + e.message, '#e05252');
            });
        }

        function openScenario(body, partial) {
            // PARTIAL-IMPORT-404-1: guard a missing name and SURFACE the server's real
            // reason instead of the opaque "fetch generated scenario 404" — the GET
            // throws when the loader can't find/validate the file the import just saved;
            // the server body carries the actual path/cause.
            if (!body || !body.name) {
                return Promise.reject(new Error('import did not return a scenario name (body.name missing)'));
            }
            return fetch('/api/ai/scenario/' + encodeURIComponent(body.name), { credentials: 'same-origin' })
                .then(function (rr) {
                    if (rr.ok) return rr.json();
                    return rr.json().catch(function () { return null; }).then(function (errBody) {
                        var detail = (errBody && errBody.error) ? errBody.error : ('HTTP ' + rr.status);
                        throw new Error('could not load the saved scenario "' + body.name + '" (' + rr.status + '): ' + detail);
                    });
                })
                .then(function (json) {
                    // GET /api/ai/scenario returns { ok, scenario: {...} } — unwrap before
                    // passing to the workspace validator, which expects the scenario object
                    // directly (checks json.steps, not json.scenario.steps).
                    var scenarioJson = (json && json.scenario) ? json.scenario : json;
                    var ws = window.AppShellScenarioWorkspace;
                    if (!ws || typeof ws.loadLiveScenarioFromJson !== 'function') throw new Error('workspace loader unavailable');
                    var res = ws.loadLiveScenarioFromJson(scenarioJson);
                    if (!res || res.passed !== true) {
                        var reasons = (res && res.blockedReasons && res.blockedReasons.length)
                            ? res.blockedReasons.join('; ')
                            : 'validation failed';
                        throw new Error('scenario load blocked: ' + reasons);
                    }
                    try { document.dispatchEvent(new CustomEvent('rmooz:wg-import-loaded')); } catch (_) {}
                    // fix(loader): remember this imported scenario so a refresh
                    // restores it (safe pointer — name only, data/scenarios).
                    try {
                        var nsl = window.AppNativeScenarioLoader;
                        if (nsl && typeof nsl.rememberLastLoadedScenario === 'function') {
                            nsl.rememberLastLoadedScenario(body.name);
                        }
                    } catch (_) {}
                    setProgress(100, 'scenario opened');
                    hideStopped();
                    if (partial) showBadge('Partial Scenario — ' + body.generated_phase_count + '/' + body.expected_phase_count + ' phases', true);
                    else showBadge('Scenario imported — ' + body.steps + ' phases', false);
                    setStatus('Opened "' + body.name + '" in the workspace.', '#7fc07f');
                });
        }

        // wire
        el.red.addEventListener('click', function () { markChoosing('red'); });
        el.blue.addEventListener('click', function () { markChoosing('blue'); });
        el.red.addEventListener('focus', function () { markChoosing('red'); });
        el.blue.addEventListener('focus', function () { markChoosing('blue'); });
        if (el.redRow) el.redRow.addEventListener('click', function () { markChoosing('red'); });
        if (el.blueRow) el.blueRow.addEventListener('click', function () { markChoosing('blue'); });
        el.red.addEventListener('change', function () { if (el.red.files[0]) stageDoc('red', el.red.files[0]); });
        el.blue.addEventListener('change', function () { if (el.blue.files[0]) stageDoc('blue', el.blue.files[0]); });
        el.start.addEventListener('click', function () { start(false); });
        el.stop.addEventListener('click', stopGeneration);
        el.cont.addEventListener('click', function () { start(true); });
        el.restart.addEventListener('click', function () {
            if (window.confirm('Restart generation from scratch? The previous run\'s checkpoints stay on disk.')) {
                setProgress(0, '');   // WIZARD-STATE-1: reset bar before fresh start
                start(false);
            }
        });
        el.partial.addEventListener('click', function () { importPartial(enteredName() || undefined); });
        el.logs.addEventListener('click', function () { setLogsVisible(el.logbox.style.display !== 'block'); });
        // WIZARD-FINGERPRINT-1: typing a new scenario name means a new setup — an
        // old stopped run must not be shown as the current run. The name is not
        // part of the server doc/objective fingerprint, so guard it client-side.
        if (el.name) el.name.addEventListener('input', function () {
            if (st.stopped || el.name.value.trim()) markSetupDirty();
        });

        // Initial read-only status: if a prior run stopped mid-way, surface the options.
        api('GET', STATUS).then(function (r) {
            var b = r.body || {}; var sim = b.sim || {};
            st.runEnabled = !!b.runEnabled;
            st.red = !!(b.docs && b.docs.red); st.blue = !!(b.docs && b.docs.blue);
            if (st.red) { try { el.red.previousSibling; } catch (_) {} }
            updateStartEnabled();
            if (sim.running) { st.running = true; updateStartEnabled(); el.pwrap.style.display = 'block'; beginPoll(); }
            // WIZARD-STATE-1: don't show the stopped panel for cancelled+phases_done=0
            // after a browser refresh — that normalises to clean idle (state A).
            // WIZARD-FINGERPRINT-1: AND only when the stopped run belongs to the
            // current staged setup; otherwise stay in the clean Start state so a new
            // setup never inherits an unrelated old run's Continue/Partial options.
            else if ((sim.partial_available || sim.status === 'error' || sim.status === 'stopped_partial' ||
                     (sim.status === 'cancelled' && (sim.phases_done || 0) > 0)) && stoppedBelongsToSetup(sim)) { showStopped(b); }
            else { hideStopped(); }
        }).catch(function () { /* server may be down; wizard still renders */ });

        window.AppScenarioImportWizard = {
            refresh: function () { return api('GET', STATUS); },
            start: function () { return start(false); },
            stop: stopGeneration,
            importPartial: importPartial,
            _el: el,
        };
    }

    // Move the legacy import cards into the Advanced <details> (retry until mounted).
    function relocateAdvancedCards(attempt) {
        var body = document.getElementById('wg-advanced-body');
        if (!body) return;
        var ids = ['wg-geojson-import-card', 'wg-sim-import-card', 'wg-local-import-card'];
        var moved = 0;
        ids.forEach(function (id) {
            var c = document.getElementById(id);
            if (c && c.parentNode !== body) { body.appendChild(c); moved++; }
        });
        if (moved < ids.length && attempt < 12) {
            setTimeout(function () { relocateAdvancedCards(attempt + 1); }, 60);
        }
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
        else mount();
    }
})();
