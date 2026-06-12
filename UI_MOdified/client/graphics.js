/**
 * FILE: graphics.js
 *
 * Tactical symbols on the map need crisp vector paths: minefield labels, scalloped defensive lines, and the
 * hollow curved “counterattack by fire” rails are all computed here in pixel or abstract space. The code
 * is deliberately free of Leaflet so you can reason about geometry without a map instance — inputs are
 * numbers and {x,y} points, outputs are SVG path data or corner coordinates for arrowheads. One small
 * exception: it pulls catkCubicBezierScalar from AppUtils so curve sampling stays identical everywhere.
 *
 * Core responsibilities:
 *   - TMG predicates: counterattack-style types, placement i18n keys, inner labels (CAT / CATK)
 *   - buildScallopedPath, getMinefieldLabelText; CATK spine sampling, offset rails, path d strings, arrow geometry
 *
 * Dependencies:
 *   - window.AppUtils.catkCubicBezierScalar (utils.js must load before this file)
 *   - No DOM or Leaflet; consumers pass in already-projected points where needed
 *
 * Bridge name: window.AppGraphics
 */
(function () {
    'use strict';

    // catkCubicBezierScalar is a pure scalar helper that lives in AppUtils.
    // Declared here as a local alias so catkSampleCatmullRomSpine can call it directly.
    const catkCubicBezierScalar = window.AppUtils.catkCubicBezierScalar;

    // --- Minefield & scalloped-line helpers ---

    /** Returns the NATO abbreviation label for a minefield type string. */
    function getMinefieldLabelText(mineType) {
        if (mineType === 'at')    return 'M/T';
        if (mineType === 'mixed') return 'M/X';
        return 'M/P';
    }

    /** Build the SVG <path d="…"> string for a scalloped defensive-works line. */
    function buildScallopedPath(numWaves) {
        const parts = [];
        const peakY = 4;   // wave peak (lower = taller wave, viewBox height 40)
        const baseY = 20;
        for (let i = 0; i < numWaves; i++) {
            const x1   = i * 100 / numWaves;
            const x2   = (i + 1) * 100 / numWaves;
            const midX = (x1 + x2) / 2;
            parts.push(`M${x1},${baseY} Q${midX},${peakY} ${x2},${baseY}`);
        }
        return parts.join(' ');
    }

    // --- Counterattack / TMG type predicates ---

    /** True for typeIds that use the counterattack-style multi-point rendering. */
    function isCounterattackStyleMultiPointType(typeId) {
        return typeId === 'counterattack-by-fire' || typeId === 'counterattack' || typeId === 'attack' || typeId === 'main-attack';
    }

    /** Inner label text for a counterattack-style TMG icon. */
    function counterattackStyleInnerLabel(typeId) {
        if (typeId === 'attack' || typeId === 'main-attack') return '';
        if (typeId === 'counterattack') return 'CAT';
        return 'CATK';
    }

    /** i18n key used by the placement instruction tooltip for a given TMG type. */
    function instPlaceTmgKeyForTypeId(typeId) {
        return isCounterattackStyleMultiPointType(typeId) ? 'inst-place-tmg-catk' : 'inst-place-tmg';
    }

    // --- CATK curve / geometry math (≈ getCurvePoints / getArrowPoints) ---

    /**
     * Dense samples along a Catmull–Rom spine (≈ getCurvePoints).
     * Input / output: arrays of plain {x, y} pixel-space points.
     * Used for the hollow / double-rail CATK body rendering.
     */
    function catkSampleCatmullRomSpine(pts, stepsPerSeg) {
        const n = pts.length;
        if (n < 2) return pts.slice();
        const out = [];
        const pushDedupe = (x, y) => {
            const q = { x, y };
            const last = out[out.length - 1];
            if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 0.12) out.push(q);
        };
        pushDedupe(pts[0].x, pts[0].y);
        for (let i = 0; i < n - 1; i++) {
            const p0 = i > 0 ? pts[i - 1] : pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = i < n - 2 ? pts[i + 2] : pts[i + 1];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            for (let s = 1; s <= stepsPerSeg; s++) {
                const t = s / stepsPerSeg;
                pushDedupe(
                    catkCubicBezierScalar(p1.x, cp1x, cp2x, p2.x, t),
                    catkCubicBezierScalar(p1.y, cp1y, cp2y, p2.y, t)
                );
            }
        }
        return out;
    }

    /** Offset open polyline perpendicular by dist (two rails = ±dist from center spine). */
    function catkOffsetOpenPolyline(pts, dist) {
        const n = pts.length;
        if (n < 2) return [];
        const res = [];
        for (let i = 0; i < n; i++) {
            let ex;
            let ey;
            if (i === 0) {
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const L = Math.hypot(dx, dy) || 1;
                ex = -dy / L;
                ey = dx / L;
            } else if (i === n - 1) {
                const dx = pts[n - 1].x - pts[n - 2].x;
                const dy = pts[n - 1].y - pts[n - 2].y;
                const L = Math.hypot(dx, dy) || 1;
                ex = -dy / L;
                ey = dx / L;
            } else {
                const v1x = pts[i].x - pts[i - 1].x;
                const v1y = pts[i].y - pts[i - 1].y;
                const v2x = pts[i + 1].x - pts[i].x;
                const v2y = pts[i + 1].y - pts[i].y;
                const L1 = Math.hypot(v1x, v1y) || 1;
                const L2 = Math.hypot(v2x, v2y) || 1;
                const n1x = -v1y / L1;
                const n1y = v1x / L1;
                const n2x = -v2y / L2;
                const n2y = v2x / L2;
                let bx = n1x + n2x;
                let by = n1y + n2y;
                const bL = Math.hypot(bx, by);
                if (bL < 1e-6) {
                    ex = n1x;
                    ey = n1y;
                } else {
                    bx /= bL;
                    by /= bL;
                    const dot = bx * n1x + by * n1y;
                    const m = dot > 0.22 ? Math.min(3, 1 / dot) : 1;
                    ex = bx * m;
                    ey = by * m;
                }
            }
            res.push({ x: pts[i].x + ex * dist, y: pts[i].y + ey * dist });
        }
        return res;
    }

    /** Convert an array of {x, y} points to an SVG path `d` attribute string. */
    function catkPolylineToPathD(pts) {
        if (!pts.length) return '';
        let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
        for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
        return d;
    }

    /**
     * Stepped NATO-style arrowhead corners in layer-pixel space (≈ getArrowPoints).
     * 90° outward from each rail, then 45° sides to tip.
     * Returns { A, B } — the two stepped corner points used to draw the head outline.
     */
    function catkSteppedArrowHeadCornersAbs(tipAbs, Ll_abs, Rr_abs, minLegPx = 4, headWidthFactor = 1.0) {
        const mid = { x: (Ll_abs.x + Rr_abs.x) / 2, y: (Ll_abs.y + Rr_abs.y) / 2 };
        let ux = tipAbs.x - mid.x;
        let uy = tipAbs.y - mid.y;
        const uLen = Math.hypot(ux, uy) || 1;
        ux /= uLen;
        uy /= uLen;
        let px = -uy;
        let py = ux;
        if (((Ll_abs.x - mid.x) * px + (Ll_abs.y - mid.y) * py) < 0) {
            px = -px;
            py = -py;
        }
        const perpDx = px * headWidthFactor;
        const perpDy = py * headWidthFactor;
        const sqrt2 = Math.SQRT2;
        const dTop = { x: (ux - perpDx) / sqrt2, y: (uy - perpDy) / sqrt2 };
        const dBot = { x: (ux + perpDx) / sqrt2, y: (uy + perpDy) / sqrt2 };
        let m = sqrt2 * ((tipAbs.x - Ll_abs.x) * ux + (tipAbs.y - Ll_abs.y) * uy);
        let n = sqrt2 * ((tipAbs.x - Rr_abs.x) * ux + (tipAbs.y - Rr_abs.y) * uy);
        m = Math.max(minLegPx, m);
        n = Math.max(minLegPx, n);
        return {
            A: { x: tipAbs.x - m * dTop.x, y: tipAbs.y - m * dTop.y },
            B: { x: tipAbs.x - n * dBot.x, y: tipAbs.y - n * dBot.y }
        };
    }

    // --- Parametric arrow geometry ---

    function parametricArrowUnitVector(direction) {
        const dx = Number(direction?.x) || 0;
        const dy = Number(direction?.y) || 0;
        const len = Math.hypot(dx, dy) || 1;
        return {
            x: dx / len,
            y: dy / len
        };
    }

    function parametricArrowOffsetPoint(point, vector, dist) {
        return {
            x: point.x + vector.x * dist,
            y: point.y + vector.y * dist
        };
    }

    /**
     * Straight-arrow geometry driven by a small set of control parameters.
     * The yellow neck handle edits the body/head transition location (`neckOffset`)
     * and body width, while the tail handle edits `tailLength`.
     */
    function buildParametricArrowGeometry(params) {
        const tip = { x: Number(params?.tip?.x) || 0, y: Number(params?.tip?.y) || 0 };
        const dir = parametricArrowUnitVector(params?.direction || { x: 1, y: 0 });
        const normal = { x: -dir.y, y: dir.x };

        const neckOffset = Math.max(0, Number(params?.neckOffset) || 0);
        const headLength = Math.max(0, Number(params?.headLength ?? neckOffset) || 0);
        const tailLength = Math.max(0, Number(params?.tailLength) || 0);
        const bodyHalf = Math.max(0, (Number(params?.bodyWidth) || 0) / 2);
        const headHalf = Math.max(bodyHalf, (Number(params?.headWidth) || 0) / 2);

        const neckCenter = parametricArrowOffsetPoint(tip, dir, -neckOffset);
        const headBaseCenter = parametricArrowOffsetPoint(tip, dir, -headLength);
        const tailCenter = parametricArrowOffsetPoint(neckCenter, dir, -tailLength);

        const bodyLeftTail = parametricArrowOffsetPoint(tailCenter, normal, bodyHalf);
        const bodyRightTail = parametricArrowOffsetPoint(tailCenter, normal, -bodyHalf);
        const bodyLeftNeck = parametricArrowOffsetPoint(neckCenter, normal, bodyHalf);
        const bodyRightNeck = parametricArrowOffsetPoint(neckCenter, normal, -bodyHalf);
        const headLeftBase = parametricArrowOffsetPoint(headBaseCenter, normal, headHalf);
        const headRightBase = parametricArrowOffsetPoint(headBaseCenter, normal, -headHalf);

        return {
            tip,
            dir,
            normal,
            neckCenter,
            headBaseCenter,
            tailCenter,
            bodyHalf,
            headHalf,
            bodyLeftTail,
            bodyRightTail,
            bodyLeftNeck,
            bodyRightNeck,
            headLeftBase,
            headRightBase
        };
    }

    /** Oriented dashed edit rectangle used only as a transient overlay. */
    function buildParametricArrowOverlayRect(params, longPad = 0, widePad = 0) {
        const g = buildParametricArrowGeometry(params);
        const halfWidth = Math.max(g.bodyHalf, g.headHalf) + Math.max(0, widePad);
        const frontCenter = parametricArrowOffsetPoint(g.tip, g.dir, Math.max(0, longPad));
        const backCenter = parametricArrowOffsetPoint(g.tailCenter, g.dir, -Math.max(0, longPad));
        return [
            parametricArrowOffsetPoint(frontCenter, g.normal, halfWidth),
            parametricArrowOffsetPoint(frontCenter, g.normal, -halfWidth),
            parametricArrowOffsetPoint(backCenter, g.normal, -halfWidth),
            parametricArrowOffsetPoint(backCenter, g.normal, halfWidth)
        ];
    }

    // --- Export ---

    window.AppGraphics = {
        getMinefieldLabelText,
        buildScallopedPath,
        isCounterattackStyleMultiPointType,
        counterattackStyleInnerLabel,
        instPlaceTmgKeyForTypeId,
        catkSampleCatmullRomSpine,
        catkOffsetOpenPolyline,
        catkPolylineToPathD,
        catkSteppedArrowHeadCornersAbs,
        buildParametricArrowGeometry,
        buildParametricArrowOverlayRect,
    };
})();
