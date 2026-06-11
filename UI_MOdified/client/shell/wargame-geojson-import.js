/* ============================================================================
 * wargame-geojson-import.js — FAST-INT-2: WarGamingGEN GeoJSON Import UI Bridge
 * ----------------------------------------------------------------------------
 * A small, clearly-labeled DEV/import surface that routes an external
 * WarGamingGEN GeoJSON (e.g. all_phases.geojson) through the EXISTING server
 * importer and then loads the generated scenario normally.
 *
 *   GeoJSON file → POST /api/scenario/import  (server runs scripts/port-wargame.js)
 *                → GET  /api/ai/scenario/<name>
 *                → AppShellScenarioWorkspace.loadLiveScenarioFromJson(json)
 *
 * This module does NOT parse or convert the GeoJSON itself — the porter is the
 * single source of import logic (no rebuild, no second parser). The only
 * client-side reading it does is a READ-ONLY pre-flight SUMMARY (counts) shown
 * to the operator before they choose to import. It does not mutate the live
 * scenario until the operator explicitly clicks Import.
 *
 * Provenance (stamped server-side): source='WarGamingGEN',
 * source_file=<filename>, generated_from_external_pipeline=true.
 *
 * Window API: window.AppWargameGeoJsonImport
 *   summarizeGeoJson(fc)  → { phases, red_units, blue_units, objective, source_file }
 *   importText(text, {source_file}) → Promise<resp>   (POST + load)
 * ========================================================================== */
(function () {
    'use strict';

    var IMPORT_URL = '/api/scenario/import';

    // ---- read-only pre-flight summary (no mutation, no conversion) ----------
    // Counts distinct unit-feature uids per side, distinct phases, and whether
    // an objective feature is present. Tolerant of both the combined
    // `all_phases.geojson` (features tagged with properties.phase) and a single
    // per-step FeatureCollection.
    function summarizeGeoJson(fc, sourceFile) {
        var out = { phases: 0, red_units: 0, blue_units: 0, objective: false, source_file: sourceFile || '' };
        if (!fc || !Array.isArray(fc.features)) return out;
        var phases = {}, red = {}, blue = {}, hasObj = false;
        for (var i = 0; i < fc.features.length; i++) {
            var f = fc.features[i];
            var p = (f && f.properties) || {};
            if (Number.isInteger(p.phase)) phases[p.phase] = true;
            if (p.kind === 'objective') hasObj = true;
            if (p.kind === 'unit') {
                var uid = p.uid || p.unit_uid;
                if (uid && p.side === 'RED')  red[uid]  = true;
                if (uid && p.side === 'BLUE') blue[uid] = true;
            }
        }
        // Single-step FC: phase lives on FC.properties, not per-feature.
        if (!Object.keys(phases).length && fc.properties && Number.isInteger(fc.properties.phase)) {
            phases[fc.properties.phase] = true;
        }
        out.phases     = Object.keys(phases).length;
        out.red_units  = Object.keys(red).length;
        out.blue_units = Object.keys(blue).length;
        out.objective  = hasObj;
        return out;
    }

    function deriveName(fc, sourceFile) {
        var op = fc && fc.properties && typeof fc.properties.operation_name === 'string'
            ? fc.properties.operation_name.trim() : '';
        var base = op || (sourceFile || 'wargame-import').replace(/\.[^.]+$/, '');
        return base.toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'wargame-import';
    }

    // ---- the import: POST raw text → load the generated scenario ------------
    function importText(text, opts) {
        opts = opts || {};
        var sourceFile = opts.source_file || 'all_phases.geojson';
        var fc;
        try { fc = JSON.parse(text); }
        catch (e) { return Promise.reject(new Error('Not valid JSON: ' + e.message)); }

        var name = deriveName(fc, sourceFile);
        var qs   = '?name=' + encodeURIComponent(name) + '&source_file=' + encodeURIComponent(sourceFile);

        return fetch(IMPORT_URL + qs, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: text
        })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (resp) {
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
                    // Tell the launch popup (if open) to close so the map is revealed.
                    try { document.dispatchEvent(new CustomEvent('rmooz:wg-import-loaded')); } catch (_) {}
                    return resp.body;   // the after-summary
                });
        });
    }

    // ---- UI card (clearly labeled, mounted beside the existing import) ------
    function fmtSummary(label, s) {
        return label + ': phases=' + s.phases +
               ' · Red=' + s.red_units +
               ' · Blue=' + s.blue_units +
               ' · objective=' + (s.objective ? 'yes' : 'no') +
               (s.source_file ? ' · src=' + s.source_file : '');
    }

    function mount() {
        var anchor = document.getElementById('sw-live-scenario-import-card');
        if (!anchor || document.getElementById('wg-geojson-import-card')) return;

        var card = document.createElement('div');
        card.id = 'wg-geojson-import-card';
        card.className = 'sw-src-subcard';
        card.style.cssText = 'border:1px solid #b8860b;border-radius:6px;padding:10px;margin-top:8px;background:#1c1f24;';
        card.innerHTML =
            '<div class="sw-src-subcard-hdr">' +
              '<span class="sw-src-subcard-title" style="color:#e0c060;">Import WarGamingGEN GeoJSON — read-only generated scenario</span>' +
              '<span class="sw-src-subcard-sub" style="display:block;font-size:11px;color:#9aa3ad;margin-top:2px;">' +
                'Routes the external all_phases.geojson through the existing server importer (port-wargame.js). ' +
                'No data is invented; provenance is tagged WarGamingGEN.</span>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">' +
              '<input type="file" id="wg-geojson-import-input" accept=".geojson,.json,application/json" style="font:inherit;">' +
              '<div id="wg-geojson-import-before" style="font-size:11px;color:#9aa3ad;min-height:14px;"></div>' +
              '<button type="button" id="wg-geojson-import-btn" disabled ' +
                'style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:5px 12px;align-self:flex-start;">' +
                'Import + load generated scenario</button>' +
              '<div id="wg-geojson-import-status" aria-live="polite" style="font-size:12px;min-height:16px;"></div>' +
              '<div id="wg-geojson-import-after" style="font-size:11px;color:#7fc07f;min-height:14px;"></div>' +
            '</div>';
        anchor.parentNode.insertBefore(card, anchor.nextSibling);

        var input  = card.querySelector('#wg-geojson-import-input');
        var btn    = card.querySelector('#wg-geojson-import-btn');
        var before = card.querySelector('#wg-geojson-import-before');
        var status = card.querySelector('#wg-geojson-import-status');
        var after  = card.querySelector('#wg-geojson-import-after');
        var pendingText = null, pendingFile = '';

        input.addEventListener('change', function () {
            after.textContent = '';
            status.textContent = '';
            btn.disabled = true;
            pendingText = null;
            var file = input.files && input.files[0];
            if (!file) { before.textContent = ''; return; }
            pendingFile = file.name;
            var reader = new FileReader();
            reader.onload = function (e) {
                pendingText = e.target.result;
                try {
                    var fc = JSON.parse(pendingText);
                    var s = summarizeGeoJson(fc, file.name);
                    before.textContent = fmtSummary('Source (pre-import, read-only)', s);
                    btn.disabled = false;   // operator may now explicitly import
                } catch (err) {
                    before.textContent = '';
                    status.style.color = '#e05252';
                    status.textContent = 'Not valid JSON: ' + err.message;
                }
            };
            reader.onerror = function () { status.textContent = 'Could not read file.'; };
            reader.readAsText(file);
        });

        btn.addEventListener('click', function () {
            if (!pendingText) return;
            btn.disabled = true;
            status.style.color = '#c5ddf0';
            status.textContent = 'Importing via server porter…';
            importText(pendingText, { source_file: pendingFile })
                .then(function (resp) {
                    status.style.color = '#7fc07f';
                    status.textContent = 'Imported "' + resp.name + '" and loaded into the workspace.';
                    after.textContent = fmtSummary('Imported (after, from server)', {
                        phases: resp.steps, red_units: resp.red_units, blue_units: resp.blue_units,
                        objective: resp.objective, source_file: resp.source_file
                    }) + ' · provenance=' + resp.source;
                })
                .catch(function (e) {
                    status.style.color = '#e05252';
                    status.textContent = 'Import failed: ' + e.message;
                    btn.disabled = false;
                });
        });
    }

    if (typeof window !== 'undefined' && window.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
        else mount();
    }

    window.AppWargameGeoJsonImport = {
        summarizeGeoJson: summarizeGeoJson,
        deriveName: deriveName,
        importText: importText
    };
})();
