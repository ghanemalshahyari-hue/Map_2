/**
 * import-plan.js — One-shot "Import Plan" action wired to the tool-rail.
 *
 * Auto-detects two file shapes and dispatches accordingly:
 *
 *   1. Units file (map_template.geojson style)
 *      ── Features with properties.app.kind === "unit"
 *      ── Reads only properties.app.sidc + properties.app.latlng
 *      ── Each lands as a draggable milsymbol via AppImport.addSymbolUnits()
 *
 *   2. Boundary file (blue_edges.geojson style)
 *      ── Features with geometry.type === "LineString" + properties.side
 *         in {"front","other"}
 *      ── Reads only geometry.coordinates
 *      ── Each lands as a native app polyline via AppImport.addPolylineFeatures()
 *
 * Mixed files (both kinds in one FeatureCollection) are supported: a single
 * picked layer holds both. If the user picks "New layer", it is created once
 * (by whichever facade call runs first) and the second call inherits via
 * getActiveLayer().
 *
 * Everything else in the picked file is deliberately ignored.
 */
(function () {
    'use strict';

    // ── Extract units (existing path) ─────────────────────────────────────
    function extractUnits(geojson) {
        const units = [], skipped = [];
        if (!Array.isArray(geojson?.features)) return { units, skipped };

        for (const feat of geojson.features) {
            const app = feat && feat.properties && feat.properties.app;
            if (!app || app.kind !== 'unit') continue;

            const sidc = app.sidc;
            let coords = app.latlng;
            if (!coords && feat.geometry && feat.geometry.type === 'Point') {
                coords = feat.geometry.coordinates;
            }

            if (!sidc || typeof sidc !== 'string' || sidc.length !== 20) {
                skipped.push({ reason: 'invalid SIDC', name: app.name, sidc });
                continue;
            }
            if (!Array.isArray(coords) || coords.length < 2 ||
                typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
                skipped.push({ reason: 'missing coords', name: app.name, sidc });
                continue;
            }
            const lng = coords[0], lat = coords[1];
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                skipped.push({ reason: 'coords out of range', name: app.name, sidc });
                continue;
            }
            units.push({ name: app.name || '', sidc, lng, lat });
        }
        return { units, skipped };
    }

    // ── Extract boundary polylines (new path) ─────────────────────────────
    function extractPolylines(geojson) {
        const lines = [], skipped = [];
        if (!Array.isArray(geojson?.features)) return { lines, skipped };

        for (const feat of geojson.features) {
            const geom = feat?.geometry;
            const side = feat?.properties?.side;
            if (!geom || geom.type !== 'LineString') continue;
            if (side !== 'front' && side !== 'other') continue;

            const rawCoords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
            const coords = rawCoords
                .filter(c => Array.isArray(c) && c.length >= 2 &&
                             typeof c[0] === 'number' && typeof c[1] === 'number')
                .map(c => [c[0], c[1]]); // drop optional z
            if (coords.length < 2) {
                skipped.push({ reason: 'less than 2 valid points', side });
                continue;
            }
            lines.push({ side, coords });
        }
        return { lines, skipped };
    }

    // ── Classify the file so the modal can show what was found ────────────
    function classifyFile(geojson) {
        let units = 0, frontLines = 0, otherLines = 0, otherFeatures = 0;
        const total = Array.isArray(geojson?.features) ? geojson.features.length : 0;
        if (!total) return { units, frontLines, otherLines, otherFeatures, total };

        for (const feat of geojson.features) {
            const app = feat?.properties?.app;
            const side = feat?.properties?.side;
            const geomType = feat?.geometry?.type;
            if (app?.kind === 'unit') units++;
            else if (geomType === 'LineString' && (side === 'front' || side === 'other')) {
                if (side === 'front') frontLines++; else otherLines++;
            }
            else otherFeatures++;
        }
        return { units, frontLines, otherLines, otherFeatures, total };
    }

    // ── Brief toast at the top-center ─────────────────────────────────────
    function showToast(message, level) {
        let el = document.getElementById('import-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'import-toast';
            el.style.cssText = [
                'position:fixed', 'top:60px', 'left:50%', 'transform:translateX(-50%)',
                'z-index:99999', 'padding:10px 18px', 'border-radius:8px',
                'font-family:Tajawal,Segoe UI,sans-serif', 'font-size:14px',
                'box-shadow:0 6px 24px rgba(0,0,0,0.35)', 'pointer-events:none',
                'direction:rtl', 'max-width:580px', 'text-align:center'
            ].join(';');
            document.body.appendChild(el);
        }
        const color = (level === 'error') ? '#ef4444' : (level === 'warn' ? '#eab308' : '#22c55e');
        el.style.background = '#111827';
        el.style.border = '1px solid ' + color;
        el.style.color = '#e5e7eb';
        el.textContent = message;
        el.style.opacity = '1';
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => {
            el.style.transition = 'opacity 0.4s'; el.style.opacity = '0';
        }, 4500);
    }

    // ── Build the "what was found" line for the modal ─────────────────────
    function summariseFound(c) {
        const parts = [];
        if (c.units > 0) parts.push(`<strong style="color:#22c55e;">${c.units}</strong> وحدة`);
        const lines = c.frontLines + c.otherLines;
        if (lines > 0) {
            const breakdown = [];
            if (c.frontLines) breakdown.push(`${c.frontLines} أمامي`);
            if (c.otherLines) breakdown.push(`${c.otherLines} حواف`);
            parts.push(`<strong style="color:#60a5fa;">${lines}</strong> خط (${breakdown.join(' + ')})`);
        }
        return parts.join(' + ');
    }

    // ── Layer-choice modal (now accepts a found-counts object) ────────────
    function chooseLayerTarget(counts, fileNameHint) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:100000',
                'background:rgba(0,0,0,0.55)', 'backdrop-filter:blur(2px)',
                'display:flex', 'align-items:center', 'justify-content:center',
                'font-family:Tajawal,Segoe UI,sans-serif', 'direction:rtl'
            ].join(';');

            const defaultName = ('استيراد · ' + (fileNameHint || '').replace(/\.(geo)?json$/i, ''))
                .replace(/·\s*$/, '').trim();
            const summary = summariseFound(counts);

            overlay.innerHTML = `
                <div style="
                    background:#111827; color:#e5e7eb; border:1px solid #1f2937;
                    border-radius:12px; padding:22px 26px; min-width:340px; max-width:520px;
                    box-shadow:0 12px 48px rgba(0,0,0,0.5); text-align:right;
                ">
                    <h3 style="margin:0 0 8px; font-size:18px; color:#60a5fa;">أين تريد وضع المحتوى؟</h3>
                    <p style="margin:0 0 16px; font-size:14px; color:#cbd5e1;">
                        تم العثور على ${summary} في الملف. اختر الطبقة:
                    </p>

                    <label style="display:block; margin:10px 0 4px; font-size:12px; color:#94a3b8;">اسم الطبقة الجديدة (اختياري)</label>
                    <input type="text" id="import-layer-name"
                           value="${defaultName.replace(/"/g, '&quot;')}"
                           dir="rtl"
                           style="
                               width:100%; padding:8px 10px; background:#0f172a;
                               color:#e5e7eb; border:1px solid #1f2937; border-radius:6px;
                               font-family:Tajawal,Segoe UI,sans-serif; font-size:13px;
                               outline:none; text-align:right;
                           ">

                    <div style="display:flex; gap:8px; margin-top:18px; flex-wrap:wrap;">
                        <button data-choice="new" style="
                            flex:1; min-width:120px; padding:10px 14px; cursor:pointer;
                            background:#3b82f6; color:#fff; border:1px solid #60a5fa;
                            border-radius:6px; font-weight:600; font-size:14px;
                            font-family:Tajawal,Segoe UI,sans-serif;
                        ">📂 طبقة جديدة</button>
                        <button data-choice="active" style="
                            flex:1; min-width:120px; padding:10px 14px; cursor:pointer;
                            background:#1a2434; color:#e5e7eb; border:1px solid #475569;
                            border-radius:6px; font-weight:600; font-size:14px;
                            font-family:Tajawal,Segoe UI,sans-serif;
                        ">📌 الطبقة الحالية</button>
                        <button data-choice="cancel" style="
                            padding:10px 14px; cursor:pointer;
                            background:transparent; color:#94a3b8; border:1px solid #1f2937;
                            border-radius:6px; font-weight:600; font-size:14px;
                            font-family:Tajawal,Segoe UI,sans-serif;
                        ">إلغاء</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            const nameInput = overlay.querySelector('#import-layer-name');
            const newBtn = overlay.querySelector('[data-choice="new"]');
            if (newBtn) newBtn.focus();

            function done(choice) {
                const name = nameInput ? nameInput.value.trim() : '';
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
                resolve({ choice, name });
            }

            overlay.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-choice]');
                if (btn) done(btn.dataset.choice);
                else if (e.target === overlay) done('cancel');
            });
            function escHandler(e) { if (e.key === 'Escape') done('cancel'); }
            document.addEventListener('keydown', escHandler);
        });
    }

    // ── Run the actual import via AppImport ──────────────────────────────
    function runImport(units, lines, counts, choice, name) {
        if (!window.AppImport) {
            showToast('فشل: AppImport غير متوفر (تحقق من تحميل app.js)', 'error');
            return;
        }
        const baseOpts = (choice === 'new')
            ? { newLayer: true, layerName: name || null }
            : {};

        let addedUnits = 0, addedLines = 0, layerName = null;

        // 1) Units first — if we're creating a new layer, this call creates it.
        if (units.length > 0 && typeof window.AppImport.addSymbolUnits === 'function') {
            const r1 = window.AppImport.addSymbolUnits(units, baseOpts);
            addedUnits = r1.added || 0;
            layerName = r1.layerName;
        }

        // 2) Lines next — if a new layer was already created, do NOT create
        //    another one; the second call inherits the active layer.
        if (lines.length > 0 && typeof window.AppImport.addPolylineFeatures === 'function') {
            const secondOpts = (addedUnits > 0) ? {} : baseOpts;
            const r2 = window.AppImport.addPolylineFeatures(lines, secondOpts);
            addedLines = r2.added || 0;
            if (!layerName) layerName = r2.layerName;
        } else if (lines.length > 0) {
            showToast('AppImport.addPolylineFeatures غير متوفر — حدّث app.js', 'warn');
        }

        // Toast
        const parts = [];
        if (addedUnits) parts.push(`${addedUnits} وحدة`);
        if (addedLines) parts.push(`${addedLines} خط`);
        if (parts.length === 0) {
            showToast(`لم يتم استيراد أي شيء من ${counts.total} معلم`, 'warn');
        } else {
            let msg = 'تم استيراد ' + parts.join(' + ');
            if (layerName) msg += ' · ' + layerName;
            showToast(msg, 'info');
        }
        console.log('[Import] result:', { addedUnits, addedLines, layerName, counts });
    }

    // ── Read a File → classify → ask layer → import ───────────────────────
    function readAndImport(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            let geojson;
            try {
                geojson = JSON.parse(e.target.result);
            } catch (err) {
                showToast('خطأ في قراءة JSON: ' + err.message, 'error');
                return;
            }
            const counts = classifyFile(geojson);

            if (counts.units === 0 && counts.frontLines === 0 && counts.otherLines === 0) {
                showToast(`لم يُعثر على وحدات أو حواف في الملف (${counts.total} معلم)`, 'warn');
                return;
            }

            // Extract whichever paths apply
            const { units }  = (counts.units > 0)                                  ? extractUnits(geojson)     : { units: [] };
            const { lines } = (counts.frontLines + counts.otherLines > 0)           ? extractPolylines(geojson) : { lines: [] };

            const pick = await chooseLayerTarget(counts, file.name);
            if (pick.choice === 'cancel') {
                showToast('تم إلغاء الاستيراد', 'warn');
                return;
            }
            runImport(units, lines, counts, pick.choice, pick.name);
        };
        reader.onerror = () => showToast('فشل في قراءة الملف', 'error');
        reader.readAsText(file);
    }

    // ── Open a hidden file picker on demand ───────────────────────────────
    function openFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.geojson,.json,application/json,application/geo+json';
        input.style.display = 'none';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (file) readAndImport(file);
            setTimeout(() => input.remove(), 0);
        });
        document.body.appendChild(input);
        input.click();
    }

    // ── Wire the button click ─────────────────────────────────────────────
    function init() {
        const btn = document.querySelector('.tool-rail-btn[data-tool="import"]');
        if (!btn) {
            console.warn('[Import] tool-rail button not found');
            return;
        }
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openFilePicker();
        });

        // Expose for console debugging
        window.AppImportPlan = {
            extractUnits, extractPolylines, classifyFile, openFilePicker, chooseLayerTarget
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
