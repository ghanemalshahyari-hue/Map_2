/* ============================================================================
 * wargame-sim-import.js — FAST-DOC-1: "WarGamingGEN DOCX Simulation Import" panel
 * ----------------------------------------------------------------------------
 * Clearly-labeled bridge UI:
 *   1) upload red_team.docx + blue_team.docx  → POST /api/wargame-sim/stage-doc
 *   2) run/stage simulation                    → POST /api/wargame-sim/run
 *      (if local run disabled, shows the EXACT manual command to run)
 *   3) PUBLISH the newest run → dated export    → POST /api/wargame-sim/publish
 *      (REQUIRED after a MANUAL CLI run: copies runs/<ts> → export_to_rmooz/<dated>;
 *       the one-click /run auto-publishes on success, a manual CLI run does NOT)
 *   4) import the generated all_phases.geojson → POST /api/wargame-sim/import
 *      (server reuses scripts/port-wargame.js — no rebuild, no second parser)
 *   5) load the imported scenario on the map   → loadLiveScenarioFromJson
 *
 * DEBUG-DOCX-1: RMOOZ imports the PUBLISHED dated export
 * (export_to_rmooz/<dated>/geojson/all_phases.geojson via latest.json), NOT
 * WarGamingGEN/runs/latest (a stale dir on Windows). So a fresh DOCX→run only
 * reaches the map after a Publish. See
 * docs/integration/debug-docx-1-change-propagation-diagnosis.md.
 *
 * FAST-DOC-2: a read-only freshness panel shows where the import resolves from
 * (latest.txt target / newest run / published export mtime+size+sha + a runs/latest
 * stale-dir flag), and a two-step stale guard warns before importing an export
 * older than the newest run (server also returns 409 unless ?confirm=1). Nothing
 * is deleted; no auto-import. See docs/integration/fast-doc-2-publish-before-import-clarity.md.
 *
 * Status machine: waiting_for_docs → docs_uploaded → simulation_running →
 *                 outputs_found → import_complete | import_failed
 *
 * Never mutates the live scenario until the operator explicitly clicks Import.
 * Window API: window.AppWargameSimImport
 * ========================================================================== */
(function () {
    'use strict';

    var state = { red: false, blue: false, exportReady: false, runEnabled: false, commands: null, freshness: null };

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
            // FAST-DOC-2: render the freshness audit + reset the stale-confirm arming
            // whenever fresh status arrives (so a stale verdict always re-warns once).
            state.freshness = b.freshness || null;
            els._staleArmed = false;
            els.importBtn.textContent = 'Import + load on map';
            renderFreshness(els, b.freshness);
            // Import enables only once the newest run has been published to the dated
            // export. Publish stays clickable (it reports clearly if there's no run yet).
            // Show manual commands when the local runner is off.
            if (!state.runEnabled && state.commands) {
                els.cmds.style.display = 'block';
                els.cmds.textContent =
                    'Local run disabled (set RMOOZ_ALLOW_SIM_RUN=1 to enable one-click). Manual flow:\n' +
                    '1. run the full sim on your DOCX:\n   ' + state.commands.full_run + '\n' +
                    '2. back in RMOOZ, click "Publish latest run" (copies WarGamingGEN/runs/<newest> → the dated\n' +
                    '   export RMOOZ imports — a manual CLI run does NOT publish itself).\n' +
                    '3. Check outputs → Import + load on map.\n' +
                    'Note: RMOOZ imports the published dated export, NOT runs/latest (stale on Windows).';
            } else {
                els.cmds.style.display = 'none';
            }
            return b;
        });
    }

    // FAST-DOC-2: show where the import source resolves from + a stale verdict.
    function renderFreshness(els, fr) {
        if (!els.freshness) return;
        if (!fr) { els.freshness.style.display = 'none'; return; }
        els.freshness.style.display = 'block';
        var L = [];
        L.push('Import source (prefers latest.txt, never runs/latest):');
        L.push('  latest.txt       → ' + (fr.latest_txt && fr.latest_txt.present ? fr.latest_txt.target : '(none)'));
        L.push('  newest run       → ' + ((fr.newest_run && fr.newest_run.name) || '(none)') +
            (fr.newest_run && fr.newest_run.all_phases && fr.newest_run.all_phases.present ? '  [' + fr.newest_run.all_phases.mtime + ']' : ''));
        var ex = fr.export || {};
        L.push('  published export → ' + (ex.run_id || '(none)') +
            (ex.all_phases && ex.all_phases.present
                ? '  [' + ex.all_phases.mtime + ', ' + ex.all_phases.size + ' B, sha ' + String(ex.sha256 || '').slice(0, 12) + ']'
                : ''));
        if (fr.runs_latest && fr.runs_latest.exists) {
            L.push('  ⚠ runs/latest    → ' + (fr.runs_latest.is_real_dir ? 'REAL directory (stale on Windows — using latest.txt; NOT deleted)' : 'symlink') +
                (fr.runs_latest.stale_dir_warning ? ' [STALE]' : ''));
        }
        L.push(fr.stale ? '  ⛔ STALE — ' + (fr.reason || 'import source is not current') : '  ✓ export is current — safe to import');
        els.freshness.textContent = L.join('\n');
        els.freshness.style.color = fr.stale ? '#e0c060' : '#7f9a7f';
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

    function doImport(els, opts) {
        opts = opts || {};
        var fr = state.freshness;
        // FAST-DOC-2 client-side warn-before-import: if the source is stale, the FIRST
        // click only warns + arms; a SECOND explicit click imports with ?confirm=1.
        if (fr && fr.stale && !opts.confirmStale && !els._staleArmed) {
            els._staleArmed = true;
            els.importBtn.textContent = 'Import anyway (stale) ⚠';
            setStatus(els.status, 'import_failed',
                '⚠ ' + (fr.reason || 'Import source looks stale.') +
                ' Publish first, or click "Import anyway (stale)" to override.', true);
            return Promise.resolve();
        }
        var confirmStale = !!(fr && fr.stale && (opts.confirmStale || els._staleArmed));
        setStatus(els.status, 'simulation_running',
            (confirmStale ? 'importing STALE export (operator override) ' : 'importing ') + 'all_phases.geojson via porter…');
        els.importBtn.disabled = true;
        return api('POST', '/api/wargame-sim/import' + (confirmStale ? '?confirm=1' : '')).then(function (r) {
            if (r.status === 409 && r.body && r.body.stale) {
                // Server-side guard fired (defense in depth): arm + warn, don't import.
                els._staleArmed = true;
                els.importBtn.textContent = 'Import anyway (stale) ⚠';
                els.importBtn.disabled = false;
                setStatus(els.status, 'import_failed', '⚠ ' + (r.body.warning || 'stale export') + ' Click again to override, or Publish first.', true);
                return;
            }
            if (r.status !== 200 || !r.body || !r.body.ok) {
                setStatus(els.status, 'import_failed', (r.body && r.body.error) || ('import failed (' + r.status + ')'), true);
                els.importBtn.disabled = false;
                return;
            }
            els._staleArmed = false;
            els.importBtn.textContent = 'Import + load on map';
            var b = r.body;
            els.summary.textContent =
                'Imported "' + b.name + '" · Red=' + b.red_units + ' · Blue=' + b.blue_units +
                ' · phases=' + b.steps + ' · objective=' + (b.objective ? 'yes' : 'no') +
                ' · src=' + b.source_file + ' · report=' + (b.report_present ? 'yes' : 'no') +
                ' · schedule=' + (b.schedule_present ? 'yes' : 'no') +
                ' · provenance=' + b.source + ' (generated_from_docs=' + b.generated_from_docs + ')' +
                (b.imported_stale ? ' · ⚠ STALE-OVERRIDE' : '');
            // Load the imported scenario on the map (explicit user action only).
            return fetch('/api/ai/scenario/' + encodeURIComponent(b.name), { credentials: 'same-origin' })
                .then(function (rr) { if (!rr.ok) throw new Error('fetch generated scenario ' + rr.status); return rr.json(); })
                .then(function (json) {
                    var ws = window.AppShellScenarioWorkspace;
                    if (!ws || typeof ws.loadLiveScenarioFromJson !== 'function') throw new Error('workspace loader unavailable');
                    var res = ws.loadLiveScenarioFromJson(json);
                    if (!res || res.passed !== true) {
                        var reasons = (res && res.blockedReasons && res.blockedReasons.length)
                            ? res.blockedReasons.join('; ')
                            : 'validation failed';
                        throw new Error('scenario load blocked: ' + reasons);
                    }
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
            // Refresh FIRST (sets the generic status line + reveals the command box),
            // THEN write the outcome message LAST so it isn't immediately clobbered.
            return refreshStatus(els).then(function () {
                if (b.ok && (b.started || b.already_running)) {
                    setStatus(els.status, 'simulation_running',
                        (b.already_running ? 'simulation already running' : 'simulation started on your DOCX') +
                        ' — this takes a while. Click "Check outputs" periodically; Import enables when the dated export is ready.');
                } else if (b.ok) {
                    setStatus(els.status, 'outputs_found', 'published to export. Now: Check outputs → Import.');
                } else {
                    // manual mode — the one-click runner is OFF. Be loud + point at the command box.
                    setStatus(els.status, 'docs_uploaded',
                        '⚠ ' + (b.reason || 'Local run is disabled.') +
                        ' Nothing was launched — run the command shown below in a terminal, then click "Publish latest run" → Import.', true);
                }
            });
        });
    }

    function publishRun(els) {
        setStatus(els.status, 'simulation_running', 'publishing newest WarGamingGEN run → dated export…');
        return api('POST', '/api/wargame-sim/publish').then(function (r) {
            var b = r.body || {};
            // Refresh FIRST, THEN write the outcome message last (don't let it clobber).
            return refreshStatus(els).then(function () {
                if (r.status === 200 && b.ok) {
                    setStatus(els.status, 'outputs_found', 'published run ' + b.run_id + ' → export. Now: Check outputs → Import.');
                } else {
                    setStatus(els.status, state.red && state.blue ? 'docs_uploaded' : 'waiting_for_docs',
                        (b.error || 'nothing to publish') + ' — run the sim first (a fresh runs/<ts> must exist), then Publish.', true);
                }
            });
        }).catch(function (e) { setStatus(els.status, 'import_failed', e.message, true); });
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
                'Flow: <b>1.</b> upload red/blue .docx → <b>2.</b> Run / Stage → <b>3.</b> Publish latest run → ' +
                '<b>4.</b> Check outputs → <b>5.</b> Import + load. ' +
                'RMOOZ imports the <b>published dated export</b> (not runs/latest), via the existing porter — ' +
                'it never parses DOCX, never calls the LLM.</span>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">' +
              '<label style="font-size:12px;">red_team.docx <input type="file" id="wg-sim-red" accept=".docx"></label>' +
              '<label style="font-size:12px;">blue_team.docx <input type="file" id="wg-sim-blue" accept=".docx"></label>' +
              '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                '<button type="button" id="wg-sim-run" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Run / Stage Simulation</button>' +
                '<button type="button" id="wg-sim-publish" title="Copy WarGamingGEN/runs/<newest> → the dated export RMOOZ imports. Required after a manual CLI run." style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Publish latest run</button>' +
                '<button type="button" id="wg-sim-refresh" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Check outputs</button>' +
                '<button type="button" id="wg-sim-import" disabled style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;">Import + load on map</button>' +
              '</div>' +
              '<div id="wg-sim-status" aria-live="polite" style="font-size:12px;min-height:16px;"></div>' +
              '<pre id="wg-sim-freshness" style="display:none;white-space:pre-wrap;font-size:10px;color:#9aa3ad;background:#12151a;border:1px solid #2a2f37;border-radius:4px;padding:6px;margin:0;"></pre>' +
              '<pre id="wg-sim-cmds" style="display:none;white-space:pre-wrap;font-size:10px;color:#a8b0bb;background:#12151a;border:1px solid #2a2f37;border-radius:4px;padding:6px;margin:0;"></pre>' +
              '<div id="wg-sim-summary" style="font-size:11px;color:#7fc07f;min-height:14px;"></div>' +
            '</div>';
        anchor.parentNode.insertBefore(card, anchor.nextSibling);

        var els = {
            red:       card.querySelector('#wg-sim-red'),
            blue:      card.querySelector('#wg-sim-blue'),
            runBtn:    card.querySelector('#wg-sim-run'),
            publishBtn:card.querySelector('#wg-sim-publish'),
            refreshBtn:card.querySelector('#wg-sim-refresh'),
            importBtn: card.querySelector('#wg-sim-import'),
            status:    card.querySelector('#wg-sim-status'),
            freshness: card.querySelector('#wg-sim-freshness'),
            cmds:      card.querySelector('#wg-sim-cmds'),
            summary:   card.querySelector('#wg-sim-summary'),
            _staleArmed: false,
        };

        els.red.addEventListener('change', function () { if (els.red.files[0]) stageDoc('red', els.red.files[0], els); });
        els.blue.addEventListener('change', function () { if (els.blue.files[0]) stageDoc('blue', els.blue.files[0], els); });
        els.runBtn.addEventListener('click', function () { runSim(els); });
        els.publishBtn.addEventListener('click', function () { publishRun(els); });
        els.refreshBtn.addEventListener('click', function () { refreshStatus(els); });
        els.importBtn.addEventListener('click', function () { doImport(els, { confirmStale: els._staleArmed }); });

        refreshStatus(els).catch(function () { setStatus(els.status, 'waiting_for_docs', 'bridge status unavailable (server not running?)', true); });

        window.AppWargameSimImport = {
            refresh: function () { return refreshStatus(els); },
            publishNow: function () { return publishRun(els); },
            importNow: function () { return doImport(els); },
            _els: els,
        };
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
        else mount();
    }
})();
