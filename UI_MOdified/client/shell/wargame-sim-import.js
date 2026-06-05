/* ============================================================================
 * wargame-sim-import.js — FAST-DOC-1: "WarGamingGEN DOCX Simulation Import" panel
 * ----------------------------------------------------------------------------
 * Clearly-labeled bridge UI:
 *   1) upload red_team.docx + blue_team.docx  → POST /api/wargame-sim/stage-doc
 *   2) run/stage simulation                    → POST /api/wargame-sim/run
 *      (if local run disabled, shows the EXACT manual command to run)
 *   3) import the generated all_phases.geojson → POST /api/wargame-sim/import
 *      (server reuses scripts/port-wargame.js — no rebuild, no second parser)
 *   4) load the imported scenario on the map   → loadLiveScenarioFromJson
 *
 * Status machine: waiting_for_docs → docs_uploaded → simulation_running →
 *                 outputs_found → import_complete | import_failed
 *
 * Never mutates the live scenario until the operator explicitly clicks Import.
 * Window API: window.AppWargameSimImport
 * ========================================================================== */
(function () {
    'use strict';

    var state = { red: false, blue: false, exportReady: false, runEnabled: false, commands: null };

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

    function setStatus(el, phase, msg, isErr) {
        if (!el) return;
        var color = isErr ? '#e05252'
            : phase === 'import_complete' ? '#7fc07f'
            : phase === 'simulation_running' ? '#e0c060' : '#c5ddf0';
        el.style.color = color;
        el.textContent = '[' + phase + '] ' + (msg || '');
    }

    function refreshStatus(els) {
        return api('GET', '/api/wargame-sim/status').then(function (r) {
            var b = r.body || {};
            state.red = !!(b.docs && b.docs.red);
            state.blue = !!(b.docs && b.docs.blue);
            state.exportReady = !!(b.export && b.export.all_phases);
            state.runEnabled = !!b.runEnabled;
            state.commands = b.commands || null;
            var phase = state.exportReady ? 'outputs_found'
                : (state.red && state.blue) ? 'docs_uploaded'
                : 'waiting_for_docs';
            var bits = [];
            bits.push('red.docx ' + (state.red ? '✓' : '—'));
            bits.push('blue.docx ' + (state.blue ? '✓' : '—'));
            if (b.export) bits.push('export ' + (b.export.all_phases ? 'ready' : 'pending') +
                (b.export.report ? ' +report' : '') + (b.export.schedule ? ' +schedule' : ''));
            setStatus(els.status, phase, bits.join(' · '));
            els.importBtn.disabled = !state.exportReady;
            // Show manual commands when the local runner is off.
            if (!state.runEnabled && state.commands) {
                els.cmds.style.display = 'block';
                els.cmds.textContent =
                    'Local run disabled (set RMOOZ_ALLOW_SIM_RUN=1 to enable one-click). To generate manually, then Check / Import:\n' +
                    '• full sim (uses your DOCX): ' + state.commands.full_run + '\n' +
                    '• then in RMOOZ: Check outputs → Import';
            } else {
                els.cmds.style.display = 'none';
            }
            return b;
        });
    }

    function stageDoc(slot, file, els) {
        setStatus(els.status, 'simulation_running', 'uploading ' + slot + '_team.docx…');
        return api('POST', '/api/wargame-sim/stage-doc?slot=' + slot, file, true).then(function (r) {
            if (r.status !== 200 || !r.body || !r.body.ok) {
                setStatus(els.status, 'import_failed', (r.body && r.body.error) || ('upload failed (' + r.status + ')'), true);
                return;
            }
            return refreshStatus(els);
        });
    }

    function doImport(els) {
        setStatus(els.status, 'simulation_running', 'importing generated all_phases.geojson via porter…');
        els.importBtn.disabled = true;
        return api('POST', '/api/wargame-sim/import').then(function (r) {
            if (r.status !== 200 || !r.body || !r.body.ok) {
                setStatus(els.status, 'import_failed', (r.body && r.body.error) || ('import failed (' + r.status + ')'), true);
                els.importBtn.disabled = false;
                return;
            }
            var b = r.body;
            els.summary.textContent =
                'Imported "' + b.name + '" · Red=' + b.red_units + ' · Blue=' + b.blue_units +
                ' · phases=' + b.steps + ' · objective=' + (b.objective ? 'yes' : 'no') +
                ' · src=' + b.source_file + ' · report=' + (b.report_present ? 'yes' : 'no') +
                ' · schedule=' + (b.schedule_present ? 'yes' : 'no') +
                ' · provenance=' + b.source + ' (generated_from_docs=' + b.generated_from_docs + ')';
            // Load the imported scenario on the map (explicit user action only).
            return fetch('/api/ai/scenario/' + encodeURIComponent(b.name), { credentials: 'same-origin' })
                .then(function (rr) { if (!rr.ok) throw new Error('fetch generated scenario ' + rr.status); return rr.json(); })
                .then(function (json) {
                    var ws = window.AppShellScenarioWorkspace;
                    if (ws && typeof ws.loadLiveScenarioFromJson === 'function') ws.loadLiveScenarioFromJson(json);
                    setStatus(els.status, 'import_complete', 'loaded "' + b.name + '" on the map.');
                    // Tell the launch popup (if open) to close so the map is revealed.
                    try { document.dispatchEvent(new CustomEvent('rmooz:wg-import-loaded')); } catch (_) {}
                });
        }).catch(function (e) {
            setStatus(els.status, 'import_failed', e.message, true);
            els.importBtn.disabled = false;
        });
    }

    function runSim(els) {
        setStatus(els.status, 'simulation_running', 'requesting run…');
        return api('POST', '/api/wargame-sim/run').then(function (r) {
            var b = r.body || {};
            if (b.ok && (b.started || b.already_running)) {
                // Long full sim launched on the staged DOCX — runs in background.
                setStatus(els.status, 'simulation_running',
                    (b.already_running ? 'simulation already running' : 'simulation started on your DOCX') +
                    ' — this takes a while. Click "Check outputs" periodically; Import enables when the dated export is ready.');
                return refreshStatus(els);
            }
            if (b.ok) {
                setStatus(els.status, 'outputs_found', 'published to export.');
                return refreshStatus(els);
            }
            // manual mode — surface the exact command(s)
            setStatus(els.status, state.red && state.blue ? 'docs_uploaded' : 'waiting_for_docs',
                b.reason || 'run the documented command manually, then Check / Import.');
            return refreshStatus(els);
        });
    }

    function mount() {
        var anchor = document.getElementById('wg-geojson-import-card')
                  || document.getElementById('sw-live-scenario-import-card');
        if (!anchor || document.getElementById('wg-sim-import-card')) return;

        var card = document.createElement('div');
        card.id = 'wg-sim-import-card';
        card.className = 'sw-src-subcard';
        card.style.cssText = 'border:1px solid #4a7bb8;border-radius:6px;padding:10px;margin-top:8px;background:#1c1f24;';
        card.innerHTML =
            '<div class="sw-src-subcard-hdr">' +
              '<span class="sw-src-subcard-title" style="color:#7fb0e0;">WarGamingGEN DOCX Simulation Import</span>' +
              '<span class="sw-src-subcard-sub" style="display:block;font-size:11px;color:#9aa3ad;margin-top:2px;">' +
                'Upload red_team.docx + blue_team.docx → stage for WarGamingGEN → run/regenerate → import generated ' +
                'all_phases.geojson via the existing porter. RMOOZ never parses DOCX, never calls the LLM.</span>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">' +
              '<label style="font-size:12px;">red_team.docx <input type="file" id="wg-sim-red" accept=".docx"></label>' +
              '<label style="font-size:12px;">blue_team.docx <input type="file" id="wg-sim-blue" accept=".docx"></label>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button type="button" id="wg-sim-run" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Run / Stage Simulation</button>' +
                '<button type="button" id="wg-sim-refresh" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Check outputs</button>' +
                '<button type="button" id="wg-sim-import" disabled style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Import + load on map</button>' +
              '</div>' +
              '<div id="wg-sim-status" aria-live="polite" style="font-size:12px;min-height:16px;"></div>' +
              '<pre id="wg-sim-cmds" style="display:none;white-space:pre-wrap;font-size:10px;color:#a8b0bb;background:#12151a;border:1px solid #2a2f37;border-radius:4px;padding:6px;margin:0;"></pre>' +
              '<div id="wg-sim-summary" style="font-size:11px;color:#7fc07f;min-height:14px;"></div>' +
            '</div>';
        anchor.parentNode.insertBefore(card, anchor.nextSibling);

        var els = {
            red:       card.querySelector('#wg-sim-red'),
            blue:      card.querySelector('#wg-sim-blue'),
            runBtn:    card.querySelector('#wg-sim-run'),
            refreshBtn:card.querySelector('#wg-sim-refresh'),
            importBtn: card.querySelector('#wg-sim-import'),
            status:    card.querySelector('#wg-sim-status'),
            cmds:      card.querySelector('#wg-sim-cmds'),
            summary:   card.querySelector('#wg-sim-summary'),
        };

        els.red.addEventListener('change', function () { if (els.red.files[0]) stageDoc('red', els.red.files[0], els); });
        els.blue.addEventListener('change', function () { if (els.blue.files[0]) stageDoc('blue', els.blue.files[0], els); });
        els.runBtn.addEventListener('click', function () { runSim(els); });
        els.refreshBtn.addEventListener('click', function () { refreshStatus(els); });
        els.importBtn.addEventListener('click', function () { doImport(els); });

        refreshStatus(els).catch(function () { setStatus(els.status, 'waiting_for_docs', 'bridge status unavailable (server not running?)', true); });

        window.AppWargameSimImport = {
            refresh: function () { return refreshStatus(els); },
            importNow: function () { return doImport(els); },
            _els: els,
        };
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
        else mount();
    }
})();
