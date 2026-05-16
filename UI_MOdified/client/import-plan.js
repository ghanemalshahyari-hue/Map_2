/**
 * import-plan.js — One-shot "Import Plan" action wired to the tool-rail.
 *
 * Strict contract: reads ONLY two fields per unit feature from the input
 * GeoJSON — properties.app.sidc and properties.app.latlng (or geometry
 * coordinates as fallback). Everything else in the file is deliberately
 * ignored. Each unit is added as a symbol via the AppImport facade
 * exposed by app.js, either to the currently-active layer or to a fresh
 * new layer depending on the user's choice in the post-pick modal.
 *
 * The Import button piggybacks on the existing .tool-rail-btn styling but
 * uses data-tool="import" — tool-rail.js's switchTool('import') returns
 * harmlessly (no TOOL_CONFIG entry) so the click does not flip into a
 * "mode". Our dedicated handler runs the file picker instead.
 */
(function () {
    'use strict';

    // ── Core extraction (matches the standalone test page) ────────────────
    function extractUnits(geojson) {
        const result = { total: 0, units: [], skipped: [] };
        if (!geojson || !Array.isArray(geojson.features)) return result;
        result.total = geojson.features.length;

        for (const feat of geojson.features) {
            const app = feat && feat.properties && feat.properties.app;
            if (!app || app.kind !== 'unit') continue;

            const sidc = app.sidc;
            let coords = app.latlng;
            if (!coords && feat.geometry && feat.geometry.type === 'Point') {
                coords = feat.geometry.coordinates;
            }

            if (!sidc || typeof sidc !== 'string' || sidc.length !== 20) {
                result.skipped.push({ reason: 'invalid SIDC', name: app.name, sidc });
                continue;
            }
            if (!Array.isArray(coords) || coords.length < 2 ||
                typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
                result.skipped.push({ reason: 'missing coords', name: app.name, sidc });
                continue;
            }
            const lng = coords[0], lat = coords[1];
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                result.skipped.push({ reason: 'coords out of range', name: app.name, sidc });
                continue;
            }
            result.units.push({ name: app.name || '', sidc, lng, lat });
        }
        return result;
    }

    // ── Brief toast at the top-center of the map ──────────────────────────
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
                'direction:rtl', 'max-width:520px', 'text-align:center'
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
            el.style.transition = 'opacity 0.4s';
            el.style.opacity = '0';
        }, 4000);
    }

    // ── Layer-choice modal: resolves to {choice:'active'|'new', name?:string} ──
    function chooseLayerTarget(unitCount, fileNameHint) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:100000',
                'background:rgba(0,0,0,0.55)', 'backdrop-filter:blur(2px)',
                'display:flex', 'align-items:center', 'justify-content:center',
                'font-family:Tajawal,Segoe UI,sans-serif', 'direction:rtl'
            ].join(';');

            const defaultName = ('استيراد · ' + (fileNameHint || '').replace(/\.(geo)?json$/i, '')).replace(/·\s*$/, '').trim();

            overlay.innerHTML = `
                <div style="
                    background:#111827; color:#e5e7eb; border:1px solid #1f2937;
                    border-radius:12px; padding:22px 26px; min-width:340px; max-width:480px;
                    box-shadow:0 12px 48px rgba(0,0,0,0.5); text-align:right;
                ">
                    <h3 style="margin:0 0 8px; font-size:18px; color:#60a5fa;">أين تريد وضع الوحدات؟</h3>
                    <p style="margin:0 0 16px; font-size:14px; color:#cbd5e1;">
                        تم العثور على <strong style="color:#22c55e;">${unitCount}</strong> وحدة في الملف. اختر الطبقة:
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
            // Focus the new-layer button by default so Enter triggers it
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

    // ── Run the actual import via AppImport ───────────────────────────────
    function runImport(units, totalFeatures, skipped, choice, name) {
        if (!window.AppImport || typeof window.AppImport.addSymbolUnits !== 'function') {
            showToast('فشل: AppImport غير متوفر (تحقق من تحميل app.js)', 'error');
            return;
        }
        const opts = (choice === 'new')
            ? { newLayer: true, layerName: name || null }
            : {};
        const res = window.AppImport.addSymbolUnits(units, opts);

        let msg = `تم استيراد ${res.added} وحدة من ${totalFeatures} معلم`;
        if (res.layerName) msg += ` · ${res.layerName}`;
        if (skipped) msg += ` · ${skipped} متجاهَل`;
        showToast(msg, (res.added === 0 ? 'warn' : 'info'));
        console.log('[Import] result:', { ...res, totalFeatures, skipped });
    }

    // ── Read a File object → ask layer choice → import ────────────────────
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
            const result = extractUnits(geojson);
            if (result.units.length === 0) {
                showToast(`لم يُعثر على وحدات في الملف (${result.total} معلم، ${result.skipped.length} متجاهَل)`, 'warn');
                return;
            }
            const pick = await chooseLayerTarget(result.units.length, file.name);
            if (pick.choice === 'cancel') {
                showToast('تم إلغاء الاستيراد', 'warn');
                return;
            }
            runImport(result.units, result.total, result.skipped.length, pick.choice, pick.name);
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
        window.AppImportPlan = { extractUnits, openFilePicker, chooseLayerTarget };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
