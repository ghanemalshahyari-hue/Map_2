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

    // ── Small HTML-escape helper for file names in the modal ──────────────
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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

    // ── Extract deployment slots (units.geojson style: flat props, Point) ──
    // A slot is a Point feature whose properties carry sidc + unit (and
    // optionally area + score), with NO `properties.app` envelope. The unit
    // code (cXYZ / pXYc / bXc / lc) encodes the intended echelon — the
    // facade later derives the right SIDC echelon digit from this prefix.
    function extractSlots(geojson) {
        const slots = [], skipped = [];
        if (!Array.isArray(geojson?.features)) return { slots, skipped };

        for (const feat of geojson.features) {
            const geom  = feat?.geometry;
            const props = feat?.properties;
            if (!geom || geom.type !== 'Point')          continue;
            if (!props || !props.sidc || !props.unit)    continue;
            if (props.app)                                continue; // unit-style file → handled by extractUnits

            const coords = geom.coordinates;
            if (!Array.isArray(coords) || coords.length < 2 ||
                typeof coords[0] !== 'number' || typeof coords[1] !== 'number') {
                skipped.push({ reason: 'invalid coords', unit: props.unit });
                continue;
            }
            const lng = coords[0], lat = coords[1];
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                skipped.push({ reason: 'coords out of range', unit: props.unit });
                continue;
            }
            slots.push({
                unit:  String(props.unit),
                area:  props.area || null,
                sidc:  String(props.sidc),
                score: typeof props.score === 'number' ? props.score : null,
                lng, lat,
            });
        }
        return { slots, skipped };
    }

    // ── Extract attack arrows (enemy.geojson style) ───────────────────────
    // A feature is an attack arrow iff its geometry is a LineString and
    // `properties.kind` is one of the app's CATK-family typeIds. Affiliation
    // (`hostile` | `friendly`) is read from `properties.side`; the role
    // (`main` | `supporting` | `feint`) is preserved as metadata.
    const ATTACK_KINDS = new Set(['attack', 'main-attack', 'counterattack', 'counterattack-by-fire']);
    function extractAttackArrows(geojson) {
        const arrows = [], skipped = [];
        if (!Array.isArray(geojson?.features)) return { arrows, skipped };

        for (const feat of geojson.features) {
            const geom = feat?.geometry;
            const props = feat?.properties;
            if (!geom || geom.type !== 'LineString') continue;
            if (!props || !ATTACK_KINDS.has(props.kind)) continue;

            const rawCoords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
            const coords = rawCoords
                .filter(c => Array.isArray(c) && c.length >= 2 &&
                             typeof c[0] === 'number' && typeof c[1] === 'number')
                .map(c => [c[0], c[1]]); // drop optional z
            if (coords.length < 2) {
                skipped.push({ reason: 'less than 2 valid points', kind: props.kind });
                continue;
            }
            arrows.push({
                kind: props.kind,
                side: props.side || 'hostile',
                role: props.role || 'main',
                coords,
            });
        }
        return { arrows, skipped };
    }

    // ── Extract boundary polylines + demote interior fronts ───────────────
    // Two-pass:
    //   Pass 1 — collect every LineString with side ∈ {front,other}, tally
    //            endpoint-frequency across all of them.
    //   Pass 2 — for each "front" line, if BOTH endpoints appear ≥3 times in
    //            the frequency map, the line is an interior divider between
    //            adjacent AOs. Demote it to "other" so it renders as a plain
    //            polyline rather than a scalloped FLOT, and no circle-X
    //            obstacles are placed for it.
    function extractPolylines(geojson) {
        const lines = [], skipped = [];
        let demoted = 0;
        if (!Array.isArray(geojson?.features)) return { lines, skipped, demoted };

        const raw = [];
        const freq = new Map();
        // Round to 6 decimals (~10 cm) so floating-point near-duplicates merge.
        const keyOf = (pt) => pt[0].toFixed(6) + ',' + pt[1].toFixed(6);
        const bump  = (pt) => freq.set(keyOf(pt), (freq.get(keyOf(pt)) || 0) + 1);

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
            raw.push({ side, coords });
            bump(coords[0]);
            bump(coords[coords.length - 1]);
        }

        const INTERIOR_THRESHOLD = 3;
        for (const ln of raw) {
            let effective = ln.side;
            if (ln.side === 'front') {
                const a = freq.get(keyOf(ln.coords[0]))                          || 0;
                const b = freq.get(keyOf(ln.coords[ln.coords.length - 1])) || 0;
                if (a >= INTERIOR_THRESHOLD && b >= INTERIOR_THRESHOLD) {
                    effective = 'other';
                    demoted++;
                }
            }
            lines.push({ side: effective, coords: ln.coords, originalSide: ln.side });
        }
        return { lines, skipped, demoted };
    }

    // ── Classify the file so the modal can show what was found ────────────
    // Also pre-computes how many of the front lines will be demoted to plain
    // polylines (interior dividers between adjacent AOs) so the modal can
    // honestly preview the rendering before the user confirms.
    function classifyFile(geojson) {
        let units = 0, slots = 0, frontLines = 0, otherLines = 0, otherFeatures = 0, interiorFronts = 0;
        let attackArrows = 0, hostileSlots = 0;
        const total = Array.isArray(geojson?.features) ? geojson.features.length : 0;
        if (!total) return { units, slots, hostileSlots, frontLines, otherLines, otherFeatures, interiorFronts, attackArrows, total };

        // Tally endpoint frequencies once for the demotion preview.
        const freq = new Map();
        const keyOf = (pt) => pt[0].toFixed(6) + ',' + pt[1].toFixed(6);
        for (const feat of geojson.features) {
            const geom = feat?.geometry;
            const side = feat?.properties?.side;
            if (geom?.type === 'LineString' && (side === 'front' || side === 'other')) {
                const c = geom.coordinates;
                if (Array.isArray(c) && c.length >= 2 && Array.isArray(c[0]) && Array.isArray(c[c.length - 1])) {
                    const k1 = keyOf(c[0]); freq.set(k1, (freq.get(k1) || 0) + 1);
                    const k2 = keyOf(c[c.length - 1]); freq.set(k2, (freq.get(k2) || 0) + 1);
                }
            }
        }

        for (const feat of geojson.features) {
            const app = feat?.properties?.app;
            const side = feat?.properties?.side;
            const props = feat?.properties;
            const geomType = feat?.geometry?.type;
            if (app?.kind === 'unit') units++;
            else if (geomType === 'LineString' && props && ATTACK_KINDS.has(props.kind)) {
                // Attack arrow: kind ∈ CATK family on a LineString
                attackArrows++;
            }
            else if (geomType === 'Point' && !app && props && props.sidc && props.unit) {
                // Slot file shape: flat sidc + unit, no `app` envelope.
                slots++;
                // Detect hostile slots so the modal shows the right wording.
                // SIDC position 3 = affiliation: '6' = Hostile.
                if (typeof props.sidc === 'string' && props.sidc.charAt(3) === '6') {
                    hostileSlots++;
                }
            }
            else if (geomType === 'LineString' && (side === 'front' || side === 'other')) {
                if (side === 'front') {
                    frontLines++;
                    const c = feat.geometry.coordinates;
                    const a = freq.get(keyOf(c[0]))                  || 0;
                    const b = freq.get(keyOf(c[c.length - 1])) || 0;
                    if (a >= 3 && b >= 3) interiorFronts++;
                } else otherLines++;
            }
            else otherFeatures++;
        }
        return { units, slots, hostileSlots, frontLines, otherLines, otherFeatures, interiorFronts, attackArrows, total };
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
        if (c.attackArrows > 0) parts.push(`<strong style="color:#ef4444;">${c.attackArrows}</strong> سهم هجوم`);
        if (c.slots > 0) {
            const hostile = c.hostileSlots || 0;
            if (hostile > 0 && hostile === c.slots) {
                parts.push(`<strong style="color:#ef4444;">${c.slots}</strong> موقع نشر معادٍ`);
            } else if (hostile > 0) {
                parts.push(`<strong style="color:#fbbf24;">${c.slots}</strong> موقع نشر (${c.slots - hostile} صديق + ${hostile} معادٍ)`);
            } else {
                parts.push(`<strong style="color:#fbbf24;">${c.slots}</strong> موقع نشر`);
            }
        }
        const lines = c.frontLines + c.otherLines;
        if (lines > 0) {
            const breakdown = [];
            if (c.frontLines) {
                const interior = c.interiorFronts || 0;
                if (interior > 0) {
                    const realFronts = c.frontLines - interior;
                    breakdown.push(`${realFronts} أمامي + ${interior} داخلي`);
                } else {
                    breakdown.push(`${c.frontLines} أمامي`);
                }
            }
            if (c.otherLines) breakdown.push(`${c.otherLines} حواف`);
            parts.push(`<strong style="color:#60a5fa;">${lines}</strong> خط (${breakdown.join(' + ')})`);
        }
        if (c.interiorFronts > 0) {
            parts.push(`<span style="color:#94a3b8; font-size:12px;">(الخطوط الداخلية ستُرسم كخطوط عادية)</span>`);
        }
        return parts.join(' + ');
    }

    // ── Layer-choice modal (accepts counts + an array of file names) ──────
    function chooseLayerTarget(counts, fileNames) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'z-index:100000',
                'background:rgba(0,0,0,0.55)', 'backdrop-filter:blur(2px)',
                'display:flex', 'align-items:center', 'justify-content:center',
                'font-family:Tajawal,Segoe UI,sans-serif', 'direction:rtl'
            ].join(';');

            const names = Array.isArray(fileNames) ? fileNames : (fileNames ? [fileNames] : []);
            const defaultName = names.length === 1
                ? ('استيراد · ' + names[0].replace(/\.(geo)?json$/i, '')).replace(/·\s*$/, '').trim()
                : ('استيراد · ' + names.length + ' ملفات');
            const summary = summariseFound(counts);
            const filesBlock = names.length > 1
                ? `<div style="margin:0 0 12px; padding:8px 10px; background:#0f172a;
                        border:1px solid #1f2937; border-radius:6px;
                        font-size:12px; color:#94a3b8;">
                        <div style="margin-bottom:4px; color:#60a5fa;">📂 ${names.length} ملفات:</div>
                        ${names.map(n => `<div style="font-family:Consolas,monospace; direction:ltr; text-align:right;">• ${escapeHtml(n)}</div>`).join('')}
                    </div>`
                : '';

            overlay.innerHTML = `
                <div style="
                    background:#111827; color:#e5e7eb; border:1px solid #1f2937;
                    border-radius:12px; padding:22px 26px; min-width:340px; max-width:560px;
                    box-shadow:0 12px 48px rgba(0,0,0,0.5); text-align:right;
                ">
                    <h3 style="margin:0 0 8px; font-size:18px; color:#60a5fa;">أين تريد وضع المحتوى؟</h3>
                    <p style="margin:0 0 12px; font-size:14px; color:#cbd5e1;">
                        تم العثور على ${summary}. اختر الطبقة:
                    </p>
                    ${filesBlock}

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
    function runImport(units, slots, arrows, lines, counts, choice, name) {
        if (!window.AppImport) {
            showToast('فشل: AppImport غير متوفر (تحقق من تحميل app.js)', 'error');
            return;
        }
        const baseOpts = (choice === 'new')
            ? { newLayer: true, layerName: name || null }
            : {};

        // Split lines by side: front → scalloped TMG + obstacles, other → plain polyline
        const frontLines = lines.filter(l => l.side === 'front');
        const otherLines = lines.filter(l => l.side === 'other');

        let addedUnits = 0, addedSlots = 0, addedArrows = 0,
            addedFront = 0, addedOther = 0, addedObstacles = 0;
        let layerName = null;
        let layerCreated = false;

        // Helper: only the first call that actually adds something should
        // create the new layer. Subsequent calls inherit the active layer.
        const optsFor = () => (layerCreated ? {} : baseOpts);

        // 1) Units (map_template.geojson-style)
        if (units.length > 0 && typeof window.AppImport.addSymbolUnits === 'function') {
            const r = window.AppImport.addSymbolUnits(units, optsFor());
            addedUnits = r.added || 0;
            if (addedUnits > 0) {
                layerName = r.layerName;
                if (baseOpts.newLayer) layerCreated = true;
            }
        }

        // 2) Slots (units.geojson-style — deployment positions with unit codes)
        if (slots.length > 0 && typeof window.AppImport.addSlots === 'function') {
            const r = window.AppImport.addSlots(slots, optsFor());
            addedSlots = r.added || 0;
            if (addedSlots > 0) {
                if (!layerName) layerName = r.layerName;
                if (baseOpts.newLayer) layerCreated = true;
            }
        } else if (slots.length > 0) {
            showToast('AppImport.addSlots غير متوفر — حدّث app.js', 'warn');
        }

        // 3) Attack arrows → CATK-family parametric arrow (tmg-group + typeId)
        if (arrows.length > 0 && typeof window.AppImport.addAttackArrows === 'function') {
            const r = window.AppImport.addAttackArrows(arrows, optsFor());
            addedArrows = r.added || 0;
            if (addedArrows > 0) {
                if (!layerName) layerName = r.layerName;
                if (baseOpts.newLayer) layerCreated = true;
            }
        } else if (arrows.length > 0) {
            showToast('AppImport.addAttackArrows غير متوفر — حدّث app.js', 'warn');
        }

        // 4) Front lines → scalloped TMG + circle-X obstacles
        if (frontLines.length > 0 && typeof window.AppImport.addFrontLines === 'function') {
            const r = window.AppImport.addFrontLines(frontLines, optsFor());
            addedFront     = r.addedLines     || 0;
            addedObstacles = r.addedObstacles || 0;
            if (addedFront > 0) {
                if (!layerName) layerName = r.layerName;
                if (baseOpts.newLayer) layerCreated = true;
            }
        } else if (frontLines.length > 0) {
            showToast('AppImport.addFrontLines غير متوفر — حدّث app.js', 'warn');
        }

        // 4) Other lines → plain polylines (unchanged)
        if (otherLines.length > 0 && typeof window.AppImport.addPolylineFeatures === 'function') {
            const r = window.AppImport.addPolylineFeatures(otherLines, optsFor());
            addedOther = r.added || 0;
            if (addedOther > 0) {
                if (!layerName) layerName = r.layerName;
                if (baseOpts.newLayer) layerCreated = true;
            }
        } else if (otherLines.length > 0) {
            showToast('AppImport.addPolylineFeatures غير متوفر — حدّث app.js', 'warn');
        }

        // Toast — show whichever counts apply
        const parts = [];
        if (addedUnits)     parts.push(`${addedUnits} وحدة`);
        if (addedSlots) {
            const hostile = counts.hostileSlots || 0;
            if (hostile > 0 && hostile === addedSlots) parts.push(`${addedSlots} موقع نشر معادٍ`);
            else                                       parts.push(`${addedSlots} موقع نشر`);
        }
        if (addedArrows)    parts.push(`${addedArrows} سهم هجوم`);
        if (addedFront)     parts.push(`${addedFront} خط أمامي`);
        if (addedOther)     parts.push(`${addedOther} حافة`);
        if (addedObstacles) parts.push(`${addedObstacles} عقبة`);
        if (parts.length === 0) {
            showToast(`لم يتم استيراد أي شيء من ${counts.total} معلم`, 'warn');
        } else {
            let msg = 'تم استيراد ' + parts.join(' + ');
            if (layerName) msg += ' · ' + layerName;
            showToast(msg, 'info');
        }
        console.log('[Import] result:', {
            addedUnits, addedSlots, addedArrows, addedFront, addedOther, addedObstacles, layerName, counts
        });
    }

    // ── Read a single File as parsed JSON, in a Promise ───────────────────
    function readFileAsJson(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try { resolve({ file, geojson: JSON.parse(e.target.result), error: null }); }
                catch (err) { resolve({ file, geojson: null, error: err.message }); }
            };
            reader.onerror = () => resolve({ file, geojson: null, error: 'read failed' });
            reader.readAsText(file);
        });
    }

    // ── Read N files → classify each → aggregate → ask layer → import ──────
    async function processFiles(files) {
        if (!files || !files.length) return;
        const arr = Array.from(files);
        const results = await Promise.all(arr.map(readFileAsJson));

        // Aggregate across all files
        const totals = {
            units: 0, slots: 0, hostileSlots: 0,
            attackArrows: 0,
            frontLines: 0, otherLines: 0,
            otherFeatures: 0, interiorFronts: 0, total: 0,
        };
        const allUnits  = [];
        const allSlots  = [];
        const allArrows = [];
        const allLines  = [];
        const fileNames = [];
        const errors    = [];

        let fileIdx = 0;
        for (const r of results) {
            if (r.error || !r.geojson) {
                errors.push(`${r.file.name}: ${r.error || 'invalid JSON'}`);
                continue;
            }
            fileNames.push(r.file.name);
            const counts = classifyFile(r.geojson);
            totals.units          += counts.units;
            totals.slots          += counts.slots;
            totals.hostileSlots   += counts.hostileSlots   || 0;
            totals.attackArrows   += counts.attackArrows   || 0;
            totals.frontLines     += counts.frontLines;
            totals.otherLines     += counts.otherLines;
            totals.otherFeatures  += counts.otherFeatures;
            totals.interiorFronts += counts.interiorFronts || 0;
            totals.total          += counts.total;

            // One formationId per FILE — but only if the file contains an
            // attack arrow, since a "formation" implies an attack vector +
            // the units that move along it. Friendly slot-only files stay
            // untagged so they don't get accidentally grouped with arrows.
            const fileFormationId = (counts.attackArrows > 0)
                ? ('formation-' + Date.now().toString(36) + '-' + (fileIdx++))
                : null;

            if (counts.units > 0) {
                const { units } = extractUnits(r.geojson);
                allUnits.push(...units);
            }
            if (counts.slots > 0) {
                const { slots } = extractSlots(r.geojson);
                if (fileFormationId) {
                    for (const s of slots) s._formationId = fileFormationId;
                }
                allSlots.push(...slots);
            }
            if (counts.attackArrows > 0) {
                const { arrows } = extractAttackArrows(r.geojson);
                for (const a of arrows) a._formationId = fileFormationId;
                allArrows.push(...arrows);
            }
            if (counts.frontLines + counts.otherLines > 0) {
                const { lines } = extractPolylines(r.geojson);
                allLines.push(...lines);
            }
        }

        if (errors.length) {
            showToast('خطأ في قراءة بعض الملفات: ' + errors.join(' · '), 'error');
            if (allUnits.length === 0 && allSlots.length === 0 && allArrows.length === 0 && allLines.length === 0) return;
        }

        if (allUnits.length === 0 && allSlots.length === 0 && allArrows.length === 0 && allLines.length === 0) {
            showToast(`لم يُعثر على أي محتوى قابل للاستيراد في ${arr.length} ملف`, 'warn');
            return;
        }

        const pick = await chooseLayerTarget(totals, fileNames);
        if (pick.choice === 'cancel') {
            showToast('تم إلغاء الاستيراد', 'warn');
            return;
        }
        runImport(allUnits, allSlots, allArrows, allLines, totals, pick.choice, pick.name);
    }

    // ── Open a hidden multi-file picker on demand ─────────────────────────
    function openFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true; // ← allow picking multiple files at once
        input.accept = '.geojson,.json,application/json,application/geo+json';
        input.style.display = 'none';
        input.addEventListener('change', () => {
            const files = input.files;
            if (files && files.length > 0) processFiles(files);
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
            extractUnits, extractSlots, extractAttackArrows, extractPolylines,
            classifyFile, openFilePicker, chooseLayerTarget
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
