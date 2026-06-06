/* ============================================================================
 * wargame-local-import.js — LOCAL-IMPORT-2: Import Local Wargame Output card
 * ----------------------------------------------------------------------------
 * Lists the WarGamingGEN run folders the operator has COPIED into
 *   data/imports/wargame_outputs/<run_id>/
 * and imports the selected run through the EXISTING server porter — no external
 * TestingAI path, no runs/latest, no stale flat bundle.
 *
 *   GET  /api/wargame-local/status            → run list + freshness
 *   GET  /api/wargame-local/file?run=<id>     → all_phases.geojson (read-only summary)
 *   POST /api/wargame-local/import?run=<id>   → porter → load generated scenario
 *
 * Read-only pre-flight: the summary is computed with the SAME logic as the
 * file-pick card (AppWargameGeoJsonImport.summarizeGeoJson) and NOTHING mutates
 * the live scenario until the operator explicitly clicks Import. The stale guard
 * (HTTP 409) is surfaced; importing an older run requires an explicit confirm.
 *
 * Window API: window.AppWargameLocalImport { refresh(), importRun(runId, opts) }
 * ========================================================================== */
(function () {
    'use strict';

    var STATUS_URL = '/api/wargame-local/status';
    var FILE_URL   = '/api/wargame-local/file';
    var IMPORT_URL = '/api/wargame-local/import';

    function fmtBytes(n) {
        if (!Number.isFinite(n)) return '?';
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Reuse the file-pick card's summarizer when present; tiny inline fallback.
    function summarize(fc, sourceFile) {
        if (window.AppWargameGeoJsonImport && typeof window.AppWargameGeoJsonImport.summarizeGeoJson === 'function') {
            return window.AppWargameGeoJsonImport.summarizeGeoJson(fc, sourceFile);
        }
        var out = { phases: 0, red_units: 0, blue_units: 0, objective: false, source_file: sourceFile || '' };
        if (!fc || !Array.isArray(fc.features)) return out;
        var phases = {}, red = {}, blue = {};
        for (var i = 0; i < fc.features.length; i++) {
            var p = (fc.features[i] && fc.features[i].properties) || {};
            if (Number.isInteger(p.phase)) phases[p.phase] = true;
            if (p.kind === 'objective') out.objective = true;
            if (p.kind === 'unit') {
                var uid = p.uid || p.unit_uid;
                if (uid && p.side === 'RED') red[uid] = true;
                if (uid && p.side === 'BLUE') blue[uid] = true;
            }
        }
        out.phases = Object.keys(phases).length;
        out.red_units = Object.keys(red).length;
        out.blue_units = Object.keys(blue).length;
        return out;
    }

    function getStatus() {
        return fetch(STATUS_URL, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); });
    }

    // Fetch the selected run's all_phases.geojson and summarize it (read-only).
    function preflight(runId) {
        return fetch(FILE_URL + '?run=' + encodeURIComponent(runId), { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) return r.json().then(function (j) { throw new Error((j && j.error) || ('HTTP ' + r.status)); });
                return r.text();
            })
            .then(function (text) {
                var fc = JSON.parse(text);
                return summarize(fc, 'all_phases.geojson');
            });
    }

    function importRun(runId, opts) {
        opts = opts || {};
        var qs = '?run=' + encodeURIComponent(runId) + (opts.confirm ? '&confirm=1' : '');
        return fetch(IMPORT_URL + qs, { method: 'POST', credentials: 'same-origin' })
            .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
            .then(function (resp) {
                if (resp.status === 409 && resp.body && resp.body.stale) {
                    var err = new Error(resp.body.warning || 'A newer local run exists.');
                    err.stale = true; err.freshness = resp.body.freshness;
                    throw err;
                }
                if (resp.status !== 200 || !resp.body || !resp.body.ok) {
                    throw new Error((resp.body && resp.body.error) || ('import failed (HTTP ' + resp.status + ')'));
                }
                // Load the generated scenario through the sanctioned load path.
                return fetch('/api/ai/scenario/' + encodeURIComponent(resp.body.name), { credentials: 'same-origin' })
                    .then(function (r) { if (!r.ok) throw new Error('generated scenario fetch ' + r.status); return r.json(); })
                    .then(function (scenarioJson) {
                        var ws = window.AppShellScenarioWorkspace;
                        if (!ws || typeof ws.loadLiveScenarioFromJson !== 'function') {
                            throw new Error('workspace loader unavailable');
                        }
                        var res = ws.loadLiveScenarioFromJson(scenarioJson);
                        if (!res || res.passed !== true) {
                            var reasons = (res && res.blockedReasons && res.blockedReasons.length)
                                ? res.blockedReasons.join('; ')
                                : 'validation failed';
                            throw new Error('scenario load blocked: ' + reasons);
                        }
                        try { document.dispatchEvent(new CustomEvent('rmooz:wg-import-loaded')); } catch (_) {}
                        return resp.body;
                    });
            });
    }

    // ── UI card ──────────────────────────────────────────────────────────────
    function mount() {
        var anchor = document.getElementById('wg-geojson-import-card')
                  || document.getElementById('sw-live-scenario-import-card');
        if (!anchor || document.getElementById('wg-local-import-card')) return;

        var card = document.createElement('div');
        card.id = 'wg-local-import-card';
        card.className = 'sw-src-subcard';
        card.style.cssText = 'border:1px solid #b8860b;border-radius:6px;padding:10px;margin-top:8px;background:#1c1f24;';
        card.innerHTML =
            '<div class="sw-src-subcard-hdr">' +
              '<span class="sw-src-subcard-title" style="color:#e0c060;">Import Local Wargame Output — from data/imports/wargame_outputs</span>' +
              '<span class="sw-src-subcard-sub" style="display:block;font-size:11px;color:#9aa3ad;margin-top:2px;">' +
                'Copy a WarGamingGEN run folder into data/imports/wargame_outputs/&lt;run_id&gt;/ (with all_phases.geojson), ' +
                'then pick it here. Routed through the existing porter; no external TestingAI path, no runs/latest.</span>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">' +
              '<div style="display:flex;gap:6px;align-items:center;">' +
                '<select id="wg-local-run-select" style="font:inherit;flex:1;background:#2a2f37;color:#e8eaed;border:1px solid #444;border-radius:4px;padding:4px;"></select>' +
                '<button type="button" id="wg-local-refresh-btn" title="Rescan folder" ' +
                  'style="font:inherit;cursor:pointer;border:1px solid #555;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:4px 8px;">⟳</button>' +
              '</div>' +
              '<div id="wg-local-meta" style="font-size:11px;color:#9aa3ad;min-height:14px;"></div>' +
              '<div id="wg-local-summary" style="font-size:11px;color:#9aa3ad;min-height:14px;"></div>' +
              '<div id="wg-local-warn" style="font-size:11px;color:#e0a93a;min-height:0;"></div>' +
              '<button type="button" id="wg-local-import-btn" disabled ' +
                'style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;align-self:flex-start;">' +
                'Import + load selected run</button>' +
              '<div id="wg-local-status" aria-live="polite" style="font-size:12px;min-height:16px;"></div>' +
              '<div id="wg-local-after" style="font-size:11px;color:#7fc07f;min-height:14px;"></div>' +
            '</div>';
        anchor.parentNode.insertBefore(card, anchor.nextSibling);

        var sel     = card.querySelector('#wg-local-run-select');
        var refresh = card.querySelector('#wg-local-refresh-btn');
        var meta    = card.querySelector('#wg-local-meta');
        var sumEl   = card.querySelector('#wg-local-summary');
        var warnEl  = card.querySelector('#wg-local-warn');
        var btn     = card.querySelector('#wg-local-import-btn');
        var statusEl= card.querySelector('#wg-local-status');
        var afterEl = card.querySelector('#wg-local-after');

        var runsById = {};
        var freshness = {};
        var staleConfirmNeeded = false;

        function setMetaFor(runId) {
            var r = runsById[runId];
            if (!r) { meta.textContent = ''; return; }
            var a = r.all_phases || {};
            meta.textContent = 'all_phases: ' + (a.present ? 'yes' : 'NO') +
                (a.present ? ' · ' + fmtBytes(a.size) + ' · ' + (a.mtime || '') + ' · sha ' + String(a.sha256 || '').slice(0, 10) : '') +
                ' · steps=' + r.step_count + ' · manifest=' + (r.manifest ? 'y' : 'n') +
                ' · report=' + (r.report ? 'y' : 'n') + ' · schedule=' + (r.schedule ? 'y' : 'n');
        }

        function onSelect() {
            var runId = sel.value;
            afterEl.textContent = '';
            statusEl.textContent = '';
            sumEl.textContent = 'Reading summary…';
            warnEl.textContent = '';
            staleConfirmNeeded = false;
            btn.disabled = true;
            setMetaFor(runId);
            if (!runId) { sumEl.textContent = ''; return; }

            // Stale warning from status (selected vs newest local run).
            if (freshness && freshness.newest_run_id && runId !== freshness.newest_run_id) {
                var sr = runsById[runId], nr = runsById[freshness.newest_run_id];
                if (sr && nr && (sr.all_phases.mtime_ms || 0) + 1000 < (nr.all_phases.mtime_ms || 0)) {
                    warnEl.textContent = '⚠ Older than newest run "' + freshness.newest_run_id + '". Import will require confirm.';
                    staleConfirmNeeded = true;
                }
            }

            preflight(runId)
                .then(function (s) {
                    sumEl.textContent = 'Summary (read-only): phases=' + s.phases +
                        ' · Red=' + s.red_units + ' · Blue=' + s.blue_units +
                        ' · objective=' + (s.objective ? 'yes' : 'no');
                    btn.disabled = false;
                })
                .catch(function (e) {
                    sumEl.textContent = '';
                    statusEl.style.color = '#e05252';
                    statusEl.textContent = 'Could not read run: ' + e.message;
                });
        }

        function load() {
            sel.innerHTML = '';
            meta.textContent = ''; sumEl.textContent = ''; warnEl.textContent = '';
            afterEl.textContent = ''; statusEl.textContent = 'Scanning data/imports/wargame_outputs…';
            btn.disabled = true;
            return getStatus()
                .then(function (st) {
                    runsById = {}; freshness = (st && st.freshness) || {};
                    var runs = (st && st.runs) || [];
                    if (!runs.length) {
                        statusEl.style.color = '#9aa3ad';
                        statusEl.textContent = 'No local runs found. Copy a folder into ' +
                            (st && st.dir ? st.dir : 'data/imports/wargame_outputs') + '/<run_id>/ (with all_phases.geojson).';
                        var ph = document.createElement('option');
                        ph.value = ''; ph.textContent = '— no runs —';
                        sel.appendChild(ph);
                        return;
                    }
                    statusEl.textContent = '';
                    runs.forEach(function (r) {
                        runsById[r.run_id] = r;
                        var o = document.createElement('option');
                        o.value = r.run_id;
                        o.textContent = r.run_id + (r.run_id === st.latest_run_id ? '  (latest' + (st.latest_source === 'pointer' ? ', pinned)' : ')') : '');
                        sel.appendChild(o);
                    });
                    sel.value = st.selected_run_id || runs[0].run_id;
                    onSelect();
                })
                .catch(function (e) {
                    statusEl.style.color = '#e05252';
                    statusEl.textContent = 'Status failed: ' + e.message;
                });
        }

        sel.addEventListener('change', onSelect);
        refresh.addEventListener('click', load);

        btn.addEventListener('click', function () {
            var runId = sel.value;
            if (!runId) return;
            btn.disabled = true;
            statusEl.style.color = '#c5ddf0';
            statusEl.textContent = 'Importing "' + runId + '" via server porter…';
            importRun(runId, { confirm: staleConfirmNeeded })
                .then(function (resp) {
                    statusEl.style.color = '#7fc07f';
                    statusEl.textContent = 'Imported "' + resp.name + '" and loaded into the workspace.';
                    afterEl.textContent = 'Imported (from server): steps=' + resp.steps +
                        ' · Red=' + resp.red_units + ' · Blue=' + resp.blue_units +
                        ' · objective=' + (resp.objective ? 'yes' : 'no') +
                        ' · provenance=' + resp.source + ' · run=' + resp.source_run +
                        (resp.imported_stale ? ' · (stale, confirmed)' : '');
                })
                .catch(function (e) {
                    statusEl.style.color = '#e05252';
                    statusEl.textContent = 'Import failed: ' + e.message;
                    btn.disabled = false;
                });
        });

        load();
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
        else mount();
    }

    window.AppWargameLocalImport = { refresh: function () { var el = document.getElementById('wg-local-refresh-btn'); if (el) el.click(); }, importRun: importRun };
})();
