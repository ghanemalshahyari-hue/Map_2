/**
 * FILE: popups.js
 *
 * Leaflet popups need HTML strings, and this file is the workshop: colour pickers, distance inputs, name
 * fields, TMG group editors, and symbol modifier rows all get built here as template strings. Keeping markup
 * generation separate keeps app.js a little more readable and lets you tweak copy or layout in one place.
 * Actual click handlers for many popup actions still live in app.js because they touch map state directly;
 * this module focuses on structure and passes data attributes classes the host can bind to.
 *
 * Core responsibilities:
 *   - buildGeoPopupContent / buildSymbolPopupContent: rich forms for geo shapes and NATO symbols
 *   - buildGroupTmgPopupContent + bindGroupTmgPopupHandlers: multi-segment tactical graphic editing
 *   - Shared bits: escapeHtml patterns, coord rows, fill styles, stroke width, via _ctx helpers
 *
 * Dependencies:
 *   - _ctx from init(ctx): escapeHtml, coord helpers, geo labels, rotation UI fragments, i18n t() when present
 *   - window.AppUtils (e.g. haversineDistance, kmToNauticalMiles) for hints and conversions
 *   - Leaflet types referenced from handlers (L.latLng, etc.) inside bound TMG handlers
 *
 * Bridge name: window.AppPopups
 */
(function () {
    'use strict';

    let _ctx = null;

    /**
     * Build the popup HTML for a geographic shape element.
     * Handles: distance, range-circle, range-sector, circle-2pt, semi-circle,
     * rectangle, oval, polygon, freeform, freehand, minefield.
     */
    function buildGeoPopupContent(el, geoType, data) {
        const {
            DEFAULT_GEO_FILL_STYLE, getGeoPrimaryKmValue, formatDistanceSecondaryHintSpanFromKm,
            escapeHtml, getGeoPopupKmLabel, coordInputHtml, formatKmAndNm,
            getFeatureDisplayNameInputHtml, getDrawingRotateControlsHtml, mapPopupCloseButtonHtml,
            getDistanceUnitPrimary,
        } = _ctx;
        const { haversineDistance, kmToNauticalMiles, bearingDegrees } = window.AppUtils;

        const color = data.color || '#3b82f6';
        const fillStyle = data.fillStyle || DEFAULT_GEO_FILL_STYLE;
        const isBlue = color === '#3b82f6' || color.toLowerCase().includes('3b82f6');
        const isRed = color === '#ef4444' || color.toLowerCase().includes('ef4444');
        const isGreen = color === '#22c55e';
        const isYellow = color === '#eab308';
        const isBrown = color === '#92400e';
        const isBlack = color === '#1f2937' || color.toLowerCase().includes('1f2937');
        const colors = [
            { c: '#3b82f6', active: isBlue },
            { c: '#ef4444', active: isRed },
            { c: '#22c55e', active: isGreen },
            { c: '#eab308', active: isYellow },
            { c: '#92400e', active: isBrown },
            { c: '#1f2937', active: isBlack }
        ];
        const colorBtns = colors.map(({ c, active }) =>
            `<button type="button" class="geo-popup-color-btn${active ? ' active' : ''}" data-color="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};border:2px solid ${active ? 'var(--accent)' : '#cbd5e1'};cursor:pointer;margin:2px;"></button>`
        ).join('');
        const fillStyles = ['solid', 'outline', 'vertical', 'horizontal', 'both'];
        const fillStyleBtns = fillStyles.map(s => {
            const active = fillStyle === s;
            const label = s === 'solid' ? (typeof t === 'function' ? t('geo-fill-solid') : 'Solid') :
                s === 'outline' ? (typeof t === 'function' ? t('geo-fill-outline') : 'Outline') :
                s === 'vertical' ? (typeof t === 'function' ? t('geo-fill-vertical') : 'Vertical') :
                s === 'horizontal' ? (typeof t === 'function' ? t('geo-fill-horizontal') : 'Horizontal') :
                (typeof t === 'function' ? t('geo-fill-both') : 'Both');
            return `<button type="button" class="geo-popup-fill-btn${active ? ' active' : ''}" data-fill="${s}" style="padding:4px 8px;font-size:0.7rem;border-radius:4px;cursor:pointer;margin:2px;border:1px solid ${active ? 'var(--accent)' : '#cbd5e1'};">${label}</button>`;
        }).join('');
        const titles = { distance: 'geo-distance', 'range-circle': 'geo-range-circle', 'range-sector': 'geo-range-sector',
            'circle-2pt': 'geo-circle-2pt', 'semi-circle': 'geo-semi-circle', rectangle: 'geo-rectangle', oval: 'geo-oval', polygon: 'geo-polygon', freeform: 'geo-freeform', freehand: 'geo-freehand', minefield: 'geo-minefield' };
        const title = (typeof t === 'function' ? t(titles[geoType] || 'geo-tools') : geoType);
        const primaryKm = getGeoPrimaryKmValue(el, geoType, data);
        let extraMeta = '';
        if (geoType === 'polygon') extraMeta = ` <span style="font-size:0.7rem;color:#64748b;">(${data.sides ?? 6} sides)</span>`;
        if (geoType === 'range-sector' || geoType === 'semi-circle') extraMeta = ` <span dir="ltr" style="font-size:0.7rem;color:#64748b;unicode-bidi:isolate;">· ${data.bearing ?? 0}°</span>`;
        const nmHintHtml = isFinite(primaryKm) ? formatDistanceSecondaryHintSpanFromKm(primaryKm, 2, 'geo-popup-km-nm-hint') : '';
        const geoDistPrimaryNm = getDistanceUnitPrimary() === 'nm';
        const geoDistInputMin = geoDistPrimaryNm ? '0.00054' : '0.001';
        const geoDistInputStep = geoDistPrimaryNm ? '0.0001' : '0.001';
        let geoDistValAttr = '';
        if (isFinite(primaryKm)) {
            if (geoDistPrimaryNm) {
                const nm = kmToNauticalMiles(primaryKm);
                geoDistValAttr = isFinite(nm) ? escapeHtml(String(Math.round(nm * 10000) / 10000)) : '';
            } else {
                geoDistValAttr = escapeHtml(String(Math.round(primaryKm * 10000) / 10000));
            }
        }
        const geoDistUnitSuffix = `<span style="font-size:0.75rem;">${geoDistPrimaryNm ? 'NM' : 'km'}</span>`;
        const kmEditRow = `
            <div dir="ltr" class="geo-popup-km-row" style="margin:6px 0;text-align:left;unicode-bidi:isolate;">
                <label style="font-size:0.7rem;color:#6b7280;display:block;">${escapeHtml(getGeoPopupKmLabel(geoType))}${extraMeta}</label>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
                    <input type="number" step="${geoDistInputStep}" min="${geoDistInputMin}" class="geo-popup-km-input" value="${geoDistValAttr}" style="width:7rem;padding:4px 6px;font-size:0.8rem;border:1px solid #cbd5e1;border-radius:4px;">
                    ${geoDistUnitSuffix}
                    ${nmHintHtml}
                </div>
            </div>`;
        let geoCoordBlock = '';
        if (geoType === 'distance') {
            // Distance routes render their coords inline inside the merged waypoint cards below.
        } else if ((geoType === 'range-circle' || geoType === 'circle-2pt' || geoType === 'range-sector' || geoType === 'semi-circle' || geoType === 'polygon') && data.center) {
            geoCoordBlock = `<label style="display:block;margin:4px 0;font-size:0.7rem;color:#6b7280;text-align:left;">Center: ${coordInputHtml('geo-coord-input geo-coord-center', data.center.lat, data.center.lng, '', 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label>`;
        } else if ((geoType === 'rectangle' || geoType === 'oval' || geoType === 'minefield') && data.corners) {
            const pts = data.corners;
            geoCoordBlock = pts.slice(0, 8).map((p, i) => {
                const lat = p?.lat ?? p?.[0], lng = p?.lng ?? p?.[1];
                if (lat == null || lng == null) return '';
                return `<label style="display:block;margin:4px 0;font-size:0.7rem;color:#6b7280;text-align:left;">${i + 1}: ${coordInputHtml('geo-coord-input', lat, lng, `data-index="${i}"`, 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label>`;
            }).filter(Boolean).join('');
        } else if (geoType === 'freeform' && el?.getLatLngs?.()) {
            const rings = el.getLatLngs();
            const pts = (Array.isArray(rings[0]) && Array.isArray(rings[0][0])) ? rings[0] : (Array.isArray(rings[0]) ? rings : rings);
            geoCoordBlock = pts.slice(0, 10).map((p, i) => {
                const lat = p?.lat ?? p?.[0], lng = p?.lng ?? p?.[1];
                if (lat == null || lng == null) return '';
                return `<label style="display:block;margin:4px 0;font-size:0.7rem;color:#6b7280;text-align:left;">${i + 1}: ${coordInputHtml('geo-coord-input', lat, lng, `data-index="${i}"`, 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label>`;
            }).filter(Boolean).join('');
        }
        if (geoCoordBlock) geoCoordBlock = `<div style="margin:6px 0;padding:6px;background:#f8fafc;border-radius:4px;text-align:left;max-height:80px;overflow-y:auto;">${geoCoordBlock}</div>`;
        const showFillStyle = geoType !== 'distance' && geoType !== 'freehand' && geoType !== 'minefield';
        const showThickness = geoType === 'range-sector' || geoType === 'semi-circle';
        const thicknessLabel = typeof t === 'function' ? t('geo-thickness') : 'Thickness';
        const currentWeight = Number.isFinite(data.weight) ? data.weight : 2;
        const thicknessRow = showThickness
            ? `<div style="margin:6px 0;"><span style="font-size:0.75rem;color:#6b7280;">${thicknessLabel}:</span>
                   <input type="number" class="geo-popup-weight-input" min="1" max="20" step="1" value="${currentWeight}" style="width:60px;padding:2px 4px;font-size:0.8rem;margin-left:6px;">
               </div>`
            : '';
        const showSubdivisions = geoType === 'range-sector' || geoType === 'semi-circle';
        const subdivisionsLabel = typeof t === 'function' ? t('geo-subdivisions') : 'Subdivisions';
        const currentSubdivisions = Number.isFinite(data.subdivisions) && data.subdivisions >= 1 ? data.subdivisions : 1;
        const subdivisionsRow = showSubdivisions
            ? `<div style="margin:6px 0;"><span style="font-size:0.75rem;color:#6b7280;">${subdivisionsLabel}:</span>
                   <input type="number" class="geo-popup-subdivisions-input" min="1" max="10" step="1" value="${currentSubdivisions}" style="width:60px;padding:2px 4px;font-size:0.8rem;margin-left:6px;">
               </div>`
            : '';
        // Per-wedge color + label editor (only when the sector is subdivided).
        let wedgesSection = '';
        if (showSubdivisions && currentSubdivisions > 1) {
            const wedgesArr = Array.isArray(data.wedges) ? data.wedges : [];
            const wedgeLabel = typeof t === 'function' ? t('geo-wedge') : 'Wedge';
            const wedgeLabelPlaceholder = typeof t === 'function' ? t('geo-wedge-label-placeholder') : 'Label';
            const wedgeClearLabel = typeof t === 'function' ? t('geo-wedge-clear-color') : 'Default';
            const wedgesSectionTitle = typeof t === 'function' ? t('geo-wedges') : 'Wedges';
            const labelStyleTitle = typeof t === 'function' ? t('geo-label-style') : 'Label style';
            const labelSizeLabel = typeof t === 'function' ? t('geo-label-size') : 'Size';
            const labelPositionLabel = typeof t === 'function' ? t('geo-label-position') : 'Position';
            const labelFontLabel = typeof t === 'function' ? t('geo-label-font') : 'Font';
            const labelFontDefaultOpt = typeof t === 'function' ? t('geo-label-font-default') : 'Default';
            const currentLabelSize = Number.isFinite(data.labelSize) && data.labelSize >= 8 ? data.labelSize : 14;
            const currentLabelPositionPct = Number.isFinite(data.labelPosition) && data.labelPosition > 0
                ? Math.round(data.labelPosition * 100) : 55;
            const currentLabelFont = typeof data.labelFont === 'string' ? data.labelFont : '';
            const fontOptionsHtml = [
                ['',       labelFontDefaultOpt],
                ['arial',  'Arial'],
                ['tahoma', 'Tahoma'],
                ['segoe',  'Segoe UI'],
                ['serif',  'Serif'],
                ['mono',   'Monospace']
            ].map(([val, lbl]) =>
                `<option value="${val}"${currentLabelFont === val ? ' selected' : ''}>${escapeHtml(lbl)}</option>`
            ).join('');
            const labelStyleSection = `
                <div style="margin:0 0 6px 0;padding:6px;background:#ffffff;border:1px solid #e2e8f0;border-radius:4px;">
                    <div style="font-size:0.72rem;color:#475569;font-weight:700;margin-bottom:4px;">${escapeHtml(labelStyleTitle)}</div>
                    <div style="display:flex;align-items:center;gap:6px;margin:4px 0;">
                        <span style="font-size:0.7rem;color:#6b7280;min-width:58px;">${escapeHtml(labelSizeLabel)}:</span>
                        <input type="range" class="geo-popup-label-size-slider" min="8" max="32" step="1" value="${currentLabelSize}" style="flex:1;">
                        <input type="number" class="geo-popup-label-size-input" min="8" max="32" step="1" value="${currentLabelSize}" style="width:48px;padding:2px 4px;font-size:0.72rem;">
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin:4px 0;">
                        <span style="font-size:0.7rem;color:#6b7280;min-width:58px;">${escapeHtml(labelFontLabel)}:</span>
                        <select class="geo-popup-label-font-select" style="flex:1;padding:2px 4px;font-size:0.72rem;border:1px solid #cbd5e1;border-radius:4px;">${fontOptionsHtml}</select>
                    </div>
                </div>`;
            const rows = [];
            for (let i = 0; i < currentSubdivisions; i++) {
                const w = wedgesArr[i] || {};
                const wColor = w.color || null;
                const wLabelText = typeof w.label === 'string' ? w.label : '';
                const wPosPct = Number.isFinite(w.labelPosition) && w.labelPosition > 0 && w.labelPosition <= 1
                    ? Math.round(w.labelPosition * 100) : 55;
                const swatches = colors.map(({ c }) => {
                    const active = wColor === c;
                    return `<button type="button" class="geo-popup-wedge-color-btn${active ? ' active' : ''}" data-wedge-index="${i}" data-color="${c}" style="width:18px;height:18px;border-radius:50%;background:${c};border:2px solid ${active ? 'var(--accent)' : '#cbd5e1'};cursor:pointer;margin:1px;" title="${c}"></button>`;
                }).join('');
                rows.push(`
                    <div class="geo-popup-wedge-row" data-wedge-index="${i}" style="margin:4px 0;padding:4px;background:#f8fafc;border-radius:4px;text-align:left;display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
                        <span style="font-size:0.72rem;color:#475569;font-weight:600;min-width:52px;">${escapeHtml(wedgeLabel)} ${i + 1}:</span>
                        <span style="display:inline-flex;align-items:center;">${swatches}</span>
                        <button type="button" class="geo-popup-wedge-clear-color-btn" data-wedge-index="${i}" style="padding:1px 6px;font-size:0.65rem;border-radius:4px;border:1px solid #cbd5e1;background:#fff;color:#475569;cursor:pointer;">${escapeHtml(wedgeClearLabel)}</button>
                        <input type="text" class="geo-popup-wedge-label-input" data-wedge-index="${i}" maxlength="60" value="${escapeHtml(wLabelText)}" placeholder="${escapeHtml(wedgeLabelPlaceholder)}" style="flex:1;min-width:80px;padding:2px 4px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;">
                        <div style="flex-basis:100%;display:flex;align-items:center;gap:6px;margin-top:2px;">
                            <span style="font-size:0.65rem;color:#64748b;min-width:52px;">${escapeHtml(labelPositionLabel)}:</span>
                            <input type="range" class="geo-popup-wedge-position-slider" data-wedge-index="${i}" min="10" max="95" step="1" value="${wPosPct}" style="flex:1;">
                            <span class="geo-popup-wedge-position-value" data-wedge-index="${i}" style="font-size:0.65rem;color:#64748b;min-width:34px;text-align:right;">${wPosPct}%</span>
                        </div>
                    </div>`);
            }
            wedgesSection = `
                <div style="margin:6px 0;padding:6px;background:#eef2f7;border-radius:6px;">
                    <div style="font-size:0.75rem;color:#475569;font-weight:700;margin-bottom:4px;">${escapeHtml(wedgesSectionTitle)}</div>
                    ${labelStyleSection}
                    ${rows.join('')}
                </div>`;
        }
        const dragHint = typeof t === 'function' ? t('geo-drag-move') : 'Drag to move';
        const nameFieldHtml = getFeatureDisplayNameInputHtml('geo-display-name-input', data.displayName, title);
        let distanceWaypointsHtml = '';
        if (geoType === 'distance') {
            const pts = data.points?.length ? data.points : (el?.getLatLngs?.() || []);
            const flatPts = Array.isArray(pts[0]) ? pts.flat() : pts;
            const labels = data.pointLabels || [];
            const waypointLabel = typeof t === 'function' ? t('geo-waypoint') : 'Waypoint';
            const addPointLabel = typeof t === 'function' ? t('geo-add-waypoint') : 'Add point';
            const waypointsLabel = typeof t === 'function' ? t('geo-waypoints') : 'Waypoints';
            const removeTitle = typeof t === 'function' ? t('remove') : 'Remove';
            const cards = flatPts.map((p, i) => {
                const lat = p?.lat ?? p?.[0];
                const lng = p?.lng ?? p?.[1];
                const label = labels[i] || '';
                const placeholder = `${waypointLabel} ${i + 1}`;
                const coordHtml = (lat != null && lng != null)
                    ? coordInputHtml('geo-coord-input geo-waypoint-coord-input', lat, lng, `data-index="${i}"`, '')
                    : '';
                const card = `<div class="geo-waypoint-card" data-index="${i}">
                    <div class="geo-waypoint-card-head">
                        <span class="geo-waypoint-num">${i + 1}</span>
                        <input type="text" class="geo-waypoint-name" data-index="${i}" value="${escapeHtml(label)}" placeholder="${escapeHtml(placeholder)}">
                        <button type="button" class="geo-remove-waypoint-btn" data-index="${i}" title="${escapeHtml(removeTitle)}" aria-label="${escapeHtml(removeTitle)}">×</button>
                    </div>
                    <div class="geo-waypoint-card-coord">${coordHtml}</div>
                </div>`;
                let legHtml = '';
                if (i < flatPts.length - 1) {
                    const p1 = flatPts[i + 1];
                    const lat1 = p1?.lat ?? p1?.[0];
                    const lng1 = p1?.lng ?? p1?.[1];
                    if (lat != null && lng != null && lat1 != null && lng1 != null) {
                        const segKm = haversineDistance(lat, lng, lat1, lng1) / 1000;
                        const dec = segKm >= 100 ? 1 : 2;
                        const brg = bearingDegrees({ lat, lng }, { lat: lat1, lng: lng1 });
                        const brgStr = brg.toFixed(0).padStart(3, '0') + '°';
                        const legSrLabel = typeof t === 'function'
                            ? t('geo-segment-between', String(i + 1), String(i + 2))
                            : `Leg ${i + 1}→${i + 2}`;
                        legHtml = `<div class="geo-waypoint-leg" aria-label="${escapeHtml(legSrLabel)}">
                            <span class="geo-waypoint-leg-spine" aria-hidden="true">↓</span>
                            <span class="geo-waypoint-leg-dist" dir="ltr">${formatKmAndNm(segKm, dec)}</span>
                            <span class="geo-waypoint-leg-sep" aria-hidden="true">·</span>
                            <span class="geo-waypoint-leg-bearing" dir="ltr">${brgStr}</span>
                        </div>`;
                    }
                }
                return card + legHtml;
            }).join('');
            distanceWaypointsHtml = `
                <div class="geo-distance-waypoints-section">
                    <div class="geo-distance-waypoints-title">${escapeHtml(waypointsLabel)}</div>
                    <div class="geo-distance-waypoints">${cards}</div>
                    <button type="button" class="geo-add-waypoint-btn">+ ${escapeHtml(addPointLabel)}</button>
                </div>
            `;
        }
        const showGeoRotate = geoType !== 'range-circle' && geoType !== 'circle-2pt';
        return `
            <div class="geo-popup-content" style="text-align:center;">
                <div class="map-popup-header-bar">
                    <div class="geo-popup-drag-handle" title="${escapeHtml(dragHint)}" style="cursor:grab;padding:4px 0 2px;color:#94a3b8;font-size:1rem;user-select:none;">⋮⋮</div>
                    ${mapPopupCloseButtonHtml()}
                </div>
                ${nameFieldHtml}
                ${kmEditRow}
                ${geoCoordBlock}
                ${distanceWaypointsHtml}
                ${showGeoRotate ? getDrawingRotateControlsHtml() : ''}
                ${showFillStyle ? `<div style="margin:6px 0;"><span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('geo-fill-style') : 'Fill Style'}:</span><br>${fillStyleBtns}</div>` : ''}
                ${thicknessRow}
                ${subdivisionsRow}
                ${wedgesSection}
                ${geoType === 'minefield' ? (() => {
                    const mt = data.mineType || 'ap';
                    const types = [
                        { v: 'ap', l: typeof t === 'function' ? t('geo-mine-ap') : 'AP' },
                        { v: 'at', l: typeof t === 'function' ? t('geo-mine-at') : 'AT' },
                        { v: 'mixed', l: typeof t === 'function' ? t('geo-mine-mixed') : 'Mixed' }
                    ];
                    const opts = types.map(o => `<option value="${o.v}" ${o.v === mt ? 'selected' : ''}>${o.l}</option>`).join('');
                    return `<div style="margin:6px 0;"><span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('geo-mine-type') : 'Mine Type'}:</span><br><select class="minefield-type-select" style="padding:4px 8px;font-size:0.8rem;border-radius:4px;border:1px solid #cbd5e1;width:100%;max-width:180px;">${opts}</select></div>`;
                })() : ''}
                <div style="margin:6px 0;"><span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('geo-color') : 'Color'}:</span><br>${colorBtns}</div>
                <small style="color:#6b7280;font-size:0.7rem;">${geoType === 'freehand' ? (typeof t === 'function' ? t('geo-freehand-popup-hint') : 'Use Eraser to trim.') : geoType === 'distance' ? (typeof t === 'function' ? t('geo-drag-waypoints') : 'Drag points to move. Add/remove in popup.') : (typeof t === 'function' ? t('geo-drag-center-hint') : 'Drag the center marker (◆) to move the whole shape.')}</small>
                <br><button class="move-geo-btn" style="margin-right:4px;cursor:pointer;">${typeof t === 'function' ? t('move-symbol') : 'Move'}</button>
                <button class="duplicate-geo-btn" style="margin-right:4px;cursor:pointer;">${typeof t === 'function' ? t('duplicate') : 'Duplicate'}</button>
                <button class="remove-btn" style="margin-top:6px;color:red;cursor:pointer;">${typeof t === 'function' ? t('remove') : 'Remove'}</button>
            </div>
        `;
    }

    /**
     * Build the popup HTML for a NATO milsymbol marker.
     * Includes status, coordinates, range overlays, rotation, and edit fields.
     */
    function buildSymbolPopupContent(marker) {
        const {
            escapeHtml, getCoordSystem, getSymbolPopupDisplayName, getSymbolPopupEmblemHtml,
            coordInputHtml, getDrawingRotateControlsHtml, mapPopupCloseButtonHtml,
            formatApproxAlternateDistanceFromKm, DEFAULT_GEO_FILL_STYLE,
        } = _ctx;
        const { getSidcStatus } = window.AppUtils;
        const { STATUS_OPTIONS } = window.AppSymbology;

        const sidc = marker._sidc || '10031000001200000000';
        const currentStatus = getSidcStatus(sidc);
        const statusKey = marker._statusKey || STATUS_OPTIONS.find(o => o.value === currentStatus)?.key || 'status-operational';
        const latlng = marker.getLatLng();
        const system = getCoordSystem();
        const formatted = typeof CoordUtils !== 'undefined' ? CoordUtils.format(latlng.lat, latlng.lng, system) : (latlng.lat.toFixed(6) + '\u00B0, ' + latlng.lng.toFixed(6) + '\u00B0');
        const labels = typeof CoordUtils !== 'undefined' ? CoordUtils.getInputLabels(system) : { primary: 'Lat', secondary: 'Lng' };
        const isWgs84 = system === 'wgs84';
        const latLabel = typeof t === 'function' ? t('lat') : 'Lat';
        const lngLabel = typeof t === 'function' ? t('lng') : 'Lng';
        const moveLabel = typeof t === 'function' ? t('move-symbol') : 'Move';
        const statusLabel = typeof t === 'function' ? t('status') : 'Status';
        const statusOptionsHtml = STATUS_OPTIONS.map(opt =>
            `<option value="${opt.value}" data-key="${opt.key}" ${opt.key === statusKey ? 'selected' : ''}>${typeof t === 'function' ? t(opt.key) : opt.key}</option>`
        ).join('');
        const inputHtml = isWgs84
            ? `<label>${latLabel}: <input type="text" class="symbol-popup-lat" value="${latlng.lat.toFixed(6)}" style="width:90px;padding:2px 4px;"></label><br>
               <label>${lngLabel}: <input type="text" class="symbol-popup-lng" value="${latlng.lng.toFixed(6)}" style="width:90px;padding:2px 4px;"></label>`
            : `<label>${labels.primary}: ${coordInputHtml('symbol-popup-coord', latlng.lat, latlng.lng, '', 'width:100%;max-width:220px;padding:2px 4px;')}</label>`;
        const circles = marker._rangeCircles || [];
        const sectors = marker._rangeSectors || [];
        const radiusLabel = typeof t === 'function' ? t('geo-radius') : 'Radius (km)';
        const bearingLabel = typeof t === 'function' ? t('geo-bearing') : 'Bearing (°)';
        const apertureLabel = typeof t === 'function' ? t('geo-aperture') : 'Aperture (°)';
        const addRangeLabel = typeof t === 'function' ? t('add-range-circle') : 'Add Range Circle';
        const addSectorLabel = typeof t === 'function' ? t('add-range-semi-cone') : 'Add Range Semi-Cone';
        const removeRangeLabel = typeof t === 'function' ? t('remove-range-circle') : 'Remove Range Circle';
        const removeSectorLabel = typeof t === 'function' ? t('remove-range-semi-cone') : 'Remove Range Semi-Cone';
        const colors = [
            { c: '#3b82f6' }, { c: '#ef4444' }, { c: '#22c55e' }, { c: '#eab308' }, { c: '#92400e' }, { c: '#1f2937' }
        ];
        const fillStyles = ['solid', 'outline'];
        const fillStyleLabels = { solid: typeof t === 'function' ? t('geo-fill-solid') : 'Solid', outline: typeof t === 'function' ? t('geo-fill-outline') : 'Outline' };
        const circleSections = circles.map((circle, idx) => {
            const rc = circle._rangeData || {};
            const rcColor = rc.color || '#3b82f6';
            const rcFill = rc.fillStyle || DEFAULT_GEO_FILL_STYLE;
            const colorBtns = colors.map(({ c }) =>
                `<button type="button" class="symbol-range-color-btn" data-index="${idx}" data-color="${c}" style="width:20px;height:20px;border-radius:50%;background:${c};border:2px solid ${rcColor === c ? 'var(--accent)' : '#cbd5e1'};cursor:pointer;margin:1px;"></button>`
            ).join('');
            const fillStyleBtns = fillStyles.map(s =>
                `<button type="button" class="symbol-range-fill-btn" data-index="${idx}" data-fill="${s}" style="padding:2px 6px;font-size:0.7rem;border-radius:4px;cursor:pointer;margin:1px;border:1px solid ${rcFill === s ? 'var(--accent)' : '#cbd5e1'};">${fillStyleLabels[s]}</button>`
            ).join('');
            const rck = (rc.radiusKm) || 5;
            return `<div class="symbol-range-section" data-index="${idx}" style="margin:8px 0;padding:6px;background:#f1f5f9;border-radius:6px;text-align:left;">
                <b style="font-size:0.8rem;">${typeof t === 'function' ? t('range-circle') : 'Range Circle'} ${idx + 1}</b>
                <label style="display:block;margin-top:4px;font-size:0.75rem;">${radiusLabel}: <input type="number" class="symbol-range-radius" data-index="${idx}" value="${rck.toFixed(1)}" min="0.1" max="500" step="0.5" style="width:60px;padding:2px 4px;"></label>
                <span dir="ltr" style="font-size:0.7rem;color:#64748b;unicode-bidi:isolate;">≈ ${formatApproxAlternateDistanceFromKm(rck)}</span>
                <div style="margin:4px 0;font-size:0.75rem;">${typeof t === 'function' ? t('geo-color') : 'Color'}: ${colorBtns}</div>
                <div style="margin:4px 0;font-size:0.75rem;">${typeof t === 'function' ? t('geo-fill-style') : 'Fill'}: ${fillStyleBtns}</div>
                <button class="symbol-remove-range-btn" data-index="${idx}" style="margin-top:4px;font-size:0.75rem;color:#dc2626;cursor:pointer;">${removeRangeLabel}</button>
               </div>`;
        }).join('');
        const sectorTitle = typeof t === 'function' ? t('geo-range-sector') : 'Range Semi-Cone';
        const sectorSections = sectors.map((poly, idx) => {
            const sd = poly._rangeSectorData || {};
            const sc = sd.color || '#3b82f6';
            const sf = sd.fillStyle || DEFAULT_GEO_FILL_STYLE;
            const colorBtns = colors.map(({ c }) =>
                `<button type="button" class="symbol-sector-color-btn" data-index="${idx}" data-color="${c}" style="width:20px;height:20px;border-radius:50%;background:${c};border:2px solid ${sc === c ? 'var(--accent)' : '#cbd5e1'};cursor:pointer;margin:1px;"></button>`
            ).join('');
            const fillStyleBtns = fillStyles.map(s =>
                `<button type="button" class="symbol-sector-fill-btn" data-index="${idx}" data-fill="${s}" style="padding:2px 6px;font-size:0.7rem;border-radius:4px;cursor:pointer;margin:1px;border:1px solid ${sf === s ? 'var(--accent)' : '#cbd5e1'};">${fillStyleLabels[s]}</button>`
            ).join('');
            const sdk = (sd.radiusKm) || 5;
            return `<div class="symbol-range-sector-section" data-index="${idx}" style="margin:8px 0;padding:6px;background:#f1f5f9;border-radius:6px;text-align:left;">
                <b style="font-size:0.8rem;">${sectorTitle} ${idx + 1}</b>
                <label style="display:block;margin-top:4px;font-size:0.75rem;">${radiusLabel}: <input type="number" class="symbol-sector-radius" data-index="${idx}" value="${sdk.toFixed(1)}" min="0.1" max="500" step="0.5" style="width:60px;padding:2px 4px;"></label>
                <span dir="ltr" style="font-size:0.7rem;color:#64748b;unicode-bidi:isolate;">≈ ${formatApproxAlternateDistanceFromKm(sdk)}</span>
                <label style="display:block;margin-top:4px;font-size:0.75rem;">${bearingLabel}: <input type="number" class="symbol-sector-bearing" data-index="${idx}" value="${Number(sd.bearing ?? 0).toFixed(0)}" min="0" max="360" step="1" style="width:60px;padding:2px 4px;"></label>
                <label style="display:block;margin-top:4px;font-size:0.75rem;">${apertureLabel}: <input type="number" class="symbol-sector-aperture" data-index="${idx}" value="${Number(sd.aperture ?? 90).toFixed(0)}" min="1" max="360" step="1" style="width:60px;padding:2px 4px;"></label>
                <div style="margin:4px 0;font-size:0.75rem;">${typeof t === 'function' ? t('geo-color') : 'Color'}: ${colorBtns}</div>
                <div style="margin:4px 0;font-size:0.75rem;">${typeof t === 'function' ? t('geo-fill-style') : 'Fill'}: ${fillStyleBtns}</div>
                <button class="symbol-remove-sector-btn" data-index="${idx}" style="margin-top:4px;font-size:0.75rem;color:#dc2626;cursor:pointer;">${removeSectorLabel}</button>
               </div>`;
        }).join('');
        const rangeAddRow = `<div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-top:4px;">
                <button type="button" class="symbol-add-range-btn" style="padding:4px 8px;font-size:0.8rem;cursor:pointer;">${addRangeLabel}</button>
                <button type="button" class="symbol-add-range-sector-btn" style="padding:4px 8px;font-size:0.8rem;cursor:pointer;">${addSectorLabel}</button>
            </div>`;
        const rangeCircleHtml = `<div style="margin:4px 0;">${circleSections}${sectorSections}${rangeAddRow}</div>`;
        const rotRow = getDrawingRotateControlsHtml();
        const mods = marker._textModifiers || {};
        const symbolSizeLabel = typeof t === 'function' ? t('symbol-size') : 'Symbol size';
        const currentSymbolSize = Number.isFinite(mods.size) && mods.size > 0 ? mods.size : 25;
        const symbolSizeRow = `
            <div style="margin:6px 0;display:flex;align-items:center;justify-content:center;gap:6px;">
                <label style="font-size:0.8rem;color:#6b7280;">${symbolSizeLabel}:</label>
                <input type="range" class="symbol-popup-size-slider" min="10" max="80" step="1" value="${currentSymbolSize}" style="flex:1;max-width:140px;">
                <input type="number" class="symbol-popup-size-input" min="10" max="80" step="1" value="${currentSymbolSize}" style="width:52px;padding:2px 4px;font-size:0.8rem;">
            </div>`;
        const editLabel = typeof t === 'function' ? t('edit-symbol') : 'Edit';
        const designationLabel = typeof t === 'function' ? t('unique-designation') : 'Designation';
        const additionalLabel = typeof t === 'function' ? t('additional-info') : 'Additional info';
        const altLabel = typeof t === 'function' ? t('altitude-depth') : 'Altitude/Depth';
        const higherLabel = typeof t === 'function' ? t('higher-formation') : 'Higher formation';
        const changeSidcLabel = typeof t === 'function' ? t('change-sidc') : 'Change Symbol (SIDC)';
        const applyLabel = typeof t === 'function' ? t('apply') : 'Apply';
        const displayName = getSymbolPopupDisplayName(sidc, mods);
        const emblemHtml = getSymbolPopupEmblemHtml(marker);

        const editSection = `
            <div class="symbol-edit-section" style="display:none;margin:6px 0;text-align:left;font-size:0.8rem;">
                <div style="margin:4px 0;">
                    <label style="font-size:0.75rem;">${changeSidcLabel}:</label>
                    <div style="display:flex;gap:4px;margin-top:2px;">
                        <input type="text" class="symbol-edit-sidc glass-input" value="${sidc}" style="flex:1;padding:2px 4px;font-size:0.75rem;font-family:monospace;">
                        <button type="button" class="symbol-edit-picker-btn" style="padding:2px 6px;font-size:0.7rem;cursor:pointer;">Picker</button>
                    </div>
                </div>
                <div style="margin:4px 0;">
                    <label style="font-size:0.75rem;">${designationLabel}:</label>
                    <input type="text" class="symbol-edit-designation glass-input" value="${mods.uniqueDesignation || ''}" style="width:100%;padding:2px 4px;font-size:0.8rem;">
                </div>
                <div style="margin:4px 0;">
                    <label style="font-size:0.75rem;">${additionalLabel}:</label>
                    <input type="text" class="symbol-edit-additional glass-input" value="${mods.additionalInformation || ''}" style="width:100%;padding:2px 4px;font-size:0.8rem;">
                </div>
                <div style="display:flex;gap:6px;">
                    <div style="flex:1;margin:4px 0;">
                        <label style="font-size:0.75rem;">${altLabel}:</label>
                        <input type="text" class="symbol-edit-altitude glass-input" value="${mods.altitudeDepth || ''}" style="width:100%;padding:2px 4px;font-size:0.8rem;">
                    </div>
                    <div style="flex:1;margin:4px 0;">
                        <label style="font-size:0.75rem;">${higherLabel}:</label>
                        <input type="text" class="symbol-edit-higher glass-input" value="${mods.higherFormation || ''}" style="width:100%;padding:2px 4px;font-size:0.8rem;">
                    </div>
                </div>
                <button type="button" class="symbol-edit-apply-btn" style="width:100%;margin-top:4px;padding:4px 8px;font-size:0.8rem;cursor:pointer;background:var(--accent);color:#fff;border:none;border-radius:4px;">${applyLabel}</button>
            </div>`;

        return `
            <div class="symbol-popup-content" style="text-align:center;">
                <div class="map-popup-header-bar">${mapPopupCloseButtonHtml()}</div>
                <div class="symbol-popup-emblem-wrap" aria-hidden="true">${emblemHtml}</div>
                <b class="symbol-popup-title">${escapeHtml(displayName)}</b>
                <div style="margin:4px 0;">
                    <label>${statusLabel}:</label>
                    <select class="symbol-popup-status" style="width:100%;max-width:200px;padding:2px 4px;margin-top:2px;">
                        ${statusOptionsHtml}
                    </select>
                </div>
                ${rangeCircleHtml}
                ${symbolSizeRow}
                ${rotRow}
                <small style="color:#6b7280;font-size:0.75rem;">${formatted}</small><br>
                <div style="margin:6px 0;font-size:0.8rem;">
                    ${inputHtml}
                </div>
                <button class="symbol-edit-toggle-btn" style="margin-right:4px;cursor:pointer;">${editLabel}</button>
                <button class="symbol-popup-move-btn" style="margin-right:4px;cursor:pointer;">${moveLabel}</button>
                <button class="duplicate-symbol-btn" style="margin-right:4px;cursor:pointer;">${typeof t === 'function' ? t('duplicate') : 'Duplicate'}</button>
                <button class="remove-btn" style="margin-top: 5px; color: red; cursor: pointer;">${typeof t === 'function' ? t('remove-symbol') : 'Remove Symbol'}</button>
                ${editSection}
            </div>
        `;
    }

    /**
     * Build the popup HTML for a multi-segment (group) tactical map graphic.
     * Handles coordinate editing, style controls, size buttons, and rotation.
     */
    function buildGroupTmgPopupContent(group) {
        const { coordInputHtml, getFeatureDisplayNameInputHtml, getTmgSelectTypeHtml, getDrawingRotateControlsHtml, mapPopupCloseButtonHtml, getTmgLabel } = _ctx;
        const { TACTICAL_GRAPHICS } = window.AppSymbology;
        const data = group._tmgData;
        if (!data) return '';
        const def = TACTICAL_GRAPHICS.find(d => d.id === data.typeId);
        const ptCount = data.segments ? data.segments.length + 1 : 0;
        const pts = [];
        data.segments.forEach((seg, i) => {
            const s = seg._tmgData;
            if (s?.latlng1 && i === 0) pts.push(s.latlng1);
            if (s?.latlng2) pts.push(s.latlng2);
        });
        const coordLines = pts.map((p, i) => {
            return `<label style="display:block;margin:4px 0;font-size:0.7rem;color:#6b7280;text-align:left;">${i + 1}: ${coordInputHtml('group-tmg-coord-input', p.lat, p.lng, `data-index="${i}"`, 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label>`;
        }).join('');
        const coordBlock = coordLines ? `<div style="margin:6px 0;padding:6px;background:#f8fafc;border-radius:4px;text-align:left;max-height:80px;overflow-y:auto;">${coordLines}</div>` : '';
        const tx = (key, fallback) => (typeof t === 'function' ? t(key) : null) || fallback;
        const graphicLabel = tx('tmg-default-name', 'Graphic');
        const groupDefaultTitle = `${def ? getTmgLabel(def) : graphicLabel} ${typeof t === 'function' ? t('tmg-points', String(ptCount)) : `(${ptCount} points)`}`;
        return `
            <div style="text-align:center;">
                <div class="map-popup-header-bar">${mapPopupCloseButtonHtml()}</div>
                ${getFeatureDisplayNameInputHtml('tmg-group-display-name-input', data.displayName, groupDefaultTitle)}
                ${coordBlock}
                ${getTmgSelectTypeHtml(data)}
                ${getDrawingRotateControlsHtml()}
                <button class="turn-tmg-btn" style="margin-top: 5px; margin-right: 4px; cursor: pointer;">${tx('tmg-turn-last', 'Turn last')}</button>
                <button class="add-point-tmg-btn" style="margin-right: 4px; cursor: pointer;">${tx('tmg-add-point', 'Add point')}</button>
                <button class="tmg-size-btn" data-size="smaller" style="cursor: pointer;" title="${tx('tmg-size-smaller', 'Smaller')}">−</button>
                <button class="tmg-size-btn" data-size="bigger" style="cursor: pointer; margin-left: 2px;" title="${tx('tmg-size-bigger', 'Bigger')}">+</button>
                <br>
                <button class="duplicate-tmg-btn" style="margin-right: 4px; cursor: pointer;">${tx('duplicate', 'Duplicate')}</button>
                <button class="remove-tmg-btn" style="margin-top: 5px; color: red; cursor: pointer;">${tx('remove-graphic', 'Remove Graphic')}</button>
                </div>
        `;
    }

    /**
     * Attach all interactive handlers to a rendered multi-segment TMG group popup.
     * Handles coord edits, style/fill/color/width toggles, size scaling, rotation, and add-point mode.
     */
    function bindGroupTmgPopupHandlers(group) {
        const {
            getTmgPopupDomRoot, bindMapPopupCloseButton, bindFeatureDisplayNameInput,
            removeFromLayer, duplicateTmgGroup, getInstructionText, updateLineDrawingControls,
            setReorientingTmgMarker, setAddingPointTmgGroup, TMG_SCALE_FACTOR,
            tmgMidpoint, updateTmgLayer, refreshMultiSegmentTmgGroupSelectionBox,
            getActiveResizeHandle, applyTmgStyle, scheduleSaveToStorage,
            parseCoordInputElement, bindCoordEditorEvents, bindDrawingRotateControls,
            rotateTmgSegmentGroupByDegrees,
        } = _ctx;
        const data = group._tmgData;
        if (!data) return;
        const segments = data.segments;
        const content = getTmgPopupDomRoot(group);
        if (!content) return;
        L.DomEvent.disableClickPropagation(content);
        bindMapPopupCloseButton(content, group);
        bindFeatureDisplayNameInput(content, '.tmg-group-display-name-input', (v) => {
            if (!data) return;
            if (v) data.displayName = v;
            else delete data.displayName;
        });
        const removeBtn = content.querySelector('.remove-tmg-btn');
        if (removeBtn) {
            L.DomEvent.on(removeBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                removeFromLayer(group);
            });
        }
        const dupBtn = content.querySelector('.duplicate-tmg-btn');
        if (dupBtn) {
            L.DomEvent.on(dupBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                duplicateTmgGroup(group);
            });
        }
        content.querySelector('.turn-tmg-btn')?.addEventListener('click', () => {
            setReorientingTmgMarker(segments[segments.length - 1]);
            group.closePopup();
            const instructionText = getInstructionText();
            if (instructionText) instructionText.innerText = t('inst-turn-graphic');
            updateLineDrawingControls?.();
        });
        content.querySelector('.add-point-tmg-btn')?.addEventListener('click', () => {
            setAddingPointTmgGroup(group);
            group.closePopup();
            const instructionText = getInstructionText();
            if (instructionText) instructionText.innerText = t('inst-add-point-done');
            updateLineDrawingControls?.();
        });
        content.querySelectorAll('.tmg-size-btn').forEach(btn => {
            btn.onclick = () => {
                const factor = btn.dataset.size === 'bigger' ? TMG_SCALE_FACTOR : 1 / TMG_SCALE_FACTOR;
                const pts = [segments[0]._tmgData.latlng1];
                segments.forEach(seg => pts.push(seg._tmgData.latlng2));
                const p0 = pts[0];
                const newPts = pts.map(p => L.latLng(
                    p0.lat + (p.lat - p0.lat) * factor,
                    p0.lng + (p.lng - p0.lng) * factor
                ));
                segments.forEach((seg, i) => {
                    seg._tmgData.latlng1 = newPts[i];
                    seg._tmgData.latlng2 = newPts[i + 1];
                    seg.setLatLng(tmgMidpoint(newPts[i], newPts[i + 1]));
                    updateTmgLayer(seg);
                });
                refreshMultiSegmentTmgGroupSelectionBox(group);
                const lastData = segments[segments.length - 1]._tmgData;
                const activeResizeHandle = getActiveResizeHandle();
                if (activeResizeHandle) activeResizeHandle.setLatLng(lastData.latlng2);
            };
        });
        content.querySelectorAll('.tmg-style-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const dashed = btn.dataset.dashed === 'true';
                applyTmgStyle(group, { dashed });
                content.querySelectorAll('.tmg-style-btn').forEach(b => b.classList.toggle('active', b.dataset.dashed === String(dashed)));
                refreshMultiSegmentTmgGroupSelectionBox(group);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.tmg-fill-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const filled = btn.dataset.filled === 'true';
                applyTmgStyle(group, { filled });
                content.querySelectorAll('.tmg-fill-btn').forEach(b => b.classList.toggle('active', b.dataset.filled === String(filled)));
                refreshMultiSegmentTmgGroupSelectionBox(group);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.tmg-color-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const color = btn.dataset.color;
                applyTmgStyle(group, { color });
                content.querySelectorAll('.tmg-color-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.color === color);
                    b.style.borderColor = b.dataset.color === color ? '#fff' : 'transparent';
                });
                refreshMultiSegmentTmgGroupSelectionBox(group);
                scheduleSaveToStorage();
            });
        });
        const syncPopupWidth = () => {
            const inp = content.querySelector('.tmg-width-input');
            const slider = content.querySelector('.tmg-width-slider');
            if (!inp) return;
            const v = parseFloat(inp.value);
            const w = (v >= 1 && v <= 30) ? v : 4;
            inp.value = w;
            if (slider) slider.value = w;
            applyTmgStyle(group, { strokeWidth: w });
            refreshMultiSegmentTmgGroupSelectionBox(group);
        };
        content.querySelector('.tmg-width-input')?.addEventListener('input', syncPopupWidth);
        content.querySelector('.tmg-width-slider')?.addEventListener('input', () => {
            const slider = content.querySelector('.tmg-width-slider');
            const inp = content.querySelector('.tmg-width-input');
            if (slider && inp) { inp.value = slider.value; syncPopupWidth(); }
        });
        content.querySelectorAll('.group-tmg-coord-input').forEach(inp => {
            const applyCoord = () => {
                const idx = parseInt(inp.dataset.index, 10);
                if (isNaN(idx)) return;
                const p = parseCoordInputElement(inp);
                if (!p) return;
                const newLl = L.latLng(p.lat, p.lng);
                if (idx < 0 || idx > segments.length) return;
                if (idx === 0) segments[0]._tmgData.latlng1 = newLl;
                else if (idx === segments.length) segments[idx - 1]._tmgData.latlng2 = newLl;
                else {
                    segments[idx - 1]._tmgData.latlng2 = newLl;
                    segments[idx]._tmgData.latlng1 = newLl;
                }
                segments.forEach((s) => {
                    s.setLatLng(tmgMidpoint(s._tmgData.latlng1, s._tmgData.latlng2));
                    updateTmgLayer(s);
                });
                group.setPopupContent(buildGroupTmgPopupContent(group));
                bindGroupTmgPopupHandlers(group);
                refreshMultiSegmentTmgGroupSelectionBox(group);
                const lastData = segments[segments.length - 1]._tmgData;
                const activeResizeHandle = getActiveResizeHandle();
                if (activeResizeHandle) activeResizeHandle.setLatLng(lastData.latlng2);
                scheduleSaveToStorage();
            };
            bindCoordEditorEvents(inp, applyCoord);
        });
        bindDrawingRotateControls(content, (delta) => {
            rotateTmgSegmentGroupByDegrees(group, delta);
            group.setPopupContent(buildGroupTmgPopupContent(group));
            bindGroupTmgPopupHandlers(group);
        });
    }

    window.AppPopups = {
        init(ctx) { _ctx = ctx; },
        buildGeoPopupContent,
        buildSymbolPopupContent,
        buildGroupTmgPopupContent,
        bindGroupTmgPopupHandlers,
    };
})();
