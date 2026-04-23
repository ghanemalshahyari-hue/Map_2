/**
 * FILE: units-orbat.js
 * ORBAT (Order of Battle) tree view — renders a military hierarchy as a
 * tidy-tree chart of NATO symbols (milsymbol) with pan / zoom / export.
 *
 * Public API:
 *   window.AppUnitsOrbat.open(rootNode)
 *   window.AppUnitsOrbat.close()
 */
(function () {
    'use strict';

    // Layout constants (SVG coordinate space — 1 unit = 1 px at 100% zoom).
    const NODE_W        = 150;
    const NODE_H        = 134;
    const SYMBOL_SLOT_W = 120;
    const SYMBOL_SLOT_H = 82;
    const SYMBOL_BASE   = 40;   // hint for milsymbol; final size is a rescale of its natural bbox
    const H_GAP         = 38;
    const V_GAP         = 60;
    const PADDING       = 56;
    const MIN_ZOOM      = 0.2;
    const MAX_ZOOM      = 3.0;

    // ── DOM refs (filled on first open) ─────────────────────────────────────
    let modal, backdrop, closeBtn, canvasEl, stageEl, subjectEl;
    let zoomInBtn, zoomOutBtn, zoomLabelEl, fitBtn, expandBtn, collapseBtn;
    let exportPngBtn, exportSvgBtn;
    let bound = false;

    // ── Runtime state ───────────────────────────────────────────────────────
    let currentRoot = null;                 // unit object (with .children)
    const collapsed = new Set();            // ids of collapsed nodes
    let svgEl = null;                       // current SVG element in stage
    let viewState = { zoom: 1, tx: 0, ty: 0 };
    let contentSize = { w: 0, h: 0 };       // chart natural size (SVG units)

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (v && v !== key) return v;
        }
        return fallback;
    }

    // ── DOM lookup + event binding (idempotent) ─────────────────────────────
    function ensureBound() {
        if (bound) return true;
        modal       = document.getElementById('orbat-modal');
        if (!modal) return false;
        backdrop    = document.getElementById('orbat-modal-backdrop');
        closeBtn    = document.getElementById('orbat-modal-close');
        canvasEl    = document.getElementById('orbat-canvas');
        stageEl     = document.getElementById('orbat-stage');
        subjectEl   = document.getElementById('orbat-subject-name');
        zoomInBtn   = document.getElementById('orbat-zoom-in');
        zoomOutBtn  = document.getElementById('orbat-zoom-out');
        zoomLabelEl = document.getElementById('orbat-zoom-label');
        fitBtn      = document.getElementById('orbat-fit-btn');
        expandBtn   = document.getElementById('orbat-expand-btn');
        collapseBtn = document.getElementById('orbat-collapse-btn');
        exportPngBtn = document.getElementById('orbat-export-png');
        exportSvgBtn = document.getElementById('orbat-export-svg');

        backdrop?.addEventListener('click', close);
        closeBtn?.addEventListener('click', close);
        zoomInBtn?.addEventListener('click', () => zoomBy(1.2));
        zoomOutBtn?.addEventListener('click', () => zoomBy(1 / 1.2));
        fitBtn?.addEventListener('click', fitToScreen);
        expandBtn?.addEventListener('click', () => { collapsed.clear(); render(); fitToScreen(); });
        collapseBtn?.addEventListener('click', () => { collapseToLevel(1); render(); fitToScreen(); });
        exportPngBtn?.addEventListener('click', () => exportImage('png'));
        exportSvgBtn?.addEventListener('click', () => exportImage('svg'));

        document.addEventListener('keydown', onKeyDown);
        bindPanZoom();

        bound = true;
        return true;
    }

    function onKeyDown(e) {
        if (modal?.classList.contains('hidden')) return;
        // Don't intercept typing inside inputs/textareas.
        const tag = (e.target?.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

        const panStep = e.shiftKey ? 120 : 60;
        switch (e.key) {
            case 'Escape': close(); break;
            case '+': case '=': e.preventDefault(); zoomBy(1.2); break;
            case '-': case '_': e.preventDefault(); zoomBy(1 / 1.2); break;
            case '0': e.preventDefault(); fitToScreen(); break;
            case 'ArrowLeft':  e.preventDefault(); panBy( panStep, 0); break;
            case 'ArrowRight': e.preventDefault(); panBy(-panStep, 0); break;
            case 'ArrowUp':    e.preventDefault(); panBy(0,  panStep); break;
            case 'ArrowDown':  e.preventDefault(); panBy(0, -panStep); break;
        }
    }

    // ── Pan + zoom ──────────────────────────────────────────────────────────
    function bindPanZoom() {
        if (!canvasEl) return;
        let dragging = false;
        let sx = 0, sy = 0, startTx = 0, startTy = 0;

        canvasEl.addEventListener('mousedown', (e) => {
            // Let node clicks through (they call stopPropagation in handler).
            if (e.target.closest('.orbat-node-hit')) return;
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            startTx = viewState.tx; startTy = viewState.ty;
            canvasEl.classList.add('dragging');
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            viewState.tx = startTx + (e.clientX - sx);
            viewState.ty = startTy + (e.clientY - sy);
            applyTransform();
        });
        window.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            canvasEl.classList.remove('dragging');
        });

        canvasEl.addEventListener('wheel', (e) => {
            if (modal?.classList.contains('hidden')) return;
            e.preventDefault();
            // Finer step per tick for a smoother feel.
            const step = e.ctrlKey ? 1.18 : 1.08;
            const factor = e.deltaY < 0 ? step : 1 / step;
            const rect = canvasEl.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            zoomAt(factor, cx, cy, false);
        }, { passive: false });

        // Double-click empty canvas → fit. Double-click a node is handled by
        // the node's own listener (collapse/expand), so we skip it here.
        canvasEl.addEventListener('dblclick', (e) => {
            if (e.target.closest('.orbat-node-hit')) return;
            fitToScreen();
        });
    }

    function applyTransform(animate = false) {
        if (!stageEl) return;
        if (animate) stageEl.classList.add('animating'); else stageEl.classList.remove('animating');
        stageEl.style.transform = `translate(${viewState.tx}px, ${viewState.ty}px) scale(${viewState.zoom})`;
        if (zoomLabelEl) zoomLabelEl.textContent = Math.round(viewState.zoom * 100) + '%';
        if (animate) {
            // Allow the transition to run, then remove the class so drag is instant again.
            clearTimeout(applyTransform._t);
            applyTransform._t = setTimeout(() => stageEl.classList.remove('animating'), 260);
        }
    }

    function zoomBy(factor, animate = true) {
        const rect = canvasEl.getBoundingClientRect();
        zoomAt(factor, rect.width / 2, rect.height / 2, animate);
    }

    function zoomAt(factor, cx, cy, animate = false) {
        const prev = viewState.zoom;
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * factor));
        if (next === prev) return;
        const k = next / prev;
        viewState.tx = cx - k * (cx - viewState.tx);
        viewState.ty = cy - k * (cy - viewState.ty);
        viewState.zoom = next;
        applyTransform(animate);
    }

    function fitToScreen(animate = true) {
        if (!canvasEl || !contentSize.w) return;
        const rect = canvasEl.getBoundingClientRect();
        const availW = rect.width - 32;
        const availH = rect.height - 32;
        // Allow small trees to comfortably fill the viewport — cap at 1.5 so we don't upscale to blur.
        const fitCap = 1.5;
        const z = Math.min(availW / contentSize.w, availH / contentSize.h, fitCap);
        viewState.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
        viewState.tx = (rect.width  - contentSize.w * viewState.zoom) / 2;
        viewState.ty = (rect.height - contentSize.h * viewState.zoom) / 2;
        applyTransform(animate);
    }

    function panBy(dx, dy, animate = true) {
        viewState.tx += dx;
        viewState.ty += dy;
        applyTransform(animate);
    }

    // ── Open / close ────────────────────────────────────────────────────────
    function open(rootNode) {
        if (!ensureBound() || !rootNode) return;
        currentRoot = rootNode;
        collapsed.clear();
        collapseToLevel(2); // sensible default: show top two layers expanded
        subjectEl.textContent = rootNode.name || '';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        // Wait a frame so layout has dimensions before we fit.
        render();
        requestAnimationFrame(() => fitToScreen());
    }

    function close() {
        if (!modal) return;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        currentRoot = null;
        if (stageEl) stageEl.innerHTML = '';
        svgEl = null;
    }

    function collapseToLevel(maxDepth) {
        collapsed.clear();
        (function walk(n, d) {
            if (!n) return;
            if (d >= maxDepth && n.children?.length) collapsed.add(n.id);
            (n.children || []).forEach(c => walk(c, d + 1));
        })(currentRoot, 0);
    }

    // ── Tidy-tree layout (Reingold–Tilford simplified) ──────────────────────
    // Produces a layout tree of { node, x, y, width, children } in SVG coords.
    function buildLayoutTree(n, depth = 0) {
        const isCollapsed = collapsed.has(n.id);
        const kids = (!isCollapsed && n.children?.length)
            ? n.children.map(c => buildLayoutTree(c, depth + 1))
            : [];
        return { node: n, depth, collapsed: isCollapsed, children: kids, x: 0, y: 0, width: 0 };
    }

    // First pass: lay out each subtree, computing its total width and the
    // parent node's x position within that subtree's local frame.
    // Each node gets: .width (subtree width), .parentX (self x in local frame),
    // and each child gets .relX (child subtree's left edge in parent's frame).
    function layoutSubtree(t) {
        if (!t.children.length) {
            t.width = NODE_W;
            t.parentX = 0;
            return;
        }
        let cursor = 0;
        for (const c of t.children) {
            layoutSubtree(c);
            c.relX = cursor;
            cursor += c.width + H_GAP;
        }
        const childrenWidth = cursor - H_GAP;
        // Parent sits centered over the midpoint of the first and last child's centers.
        const firstChild = t.children[0];
        const lastChild  = t.children[t.children.length - 1];
        const firstCenterX = firstChild.relX + firstChild.parentX + NODE_W / 2;
        const lastCenterX  = lastChild.relX  + lastChild.parentX  + NODE_W / 2;
        const desiredParentCenter = (firstCenterX + lastCenterX) / 2;
        let parentLeft = desiredParentCenter - NODE_W / 2;

        // If the parent would stick out to the left of the children's block, shift everything right.
        if (parentLeft < 0) {
            const shift = -parentLeft;
            for (const c of t.children) c.relX += shift;
            parentLeft = 0;
        }
        const parentRight = parentLeft + NODE_W;
        t.parentX = parentLeft;
        t.width = Math.max(childrenWidth, parentRight);
    }

    // Second pass: convert local frames into absolute (absX, y).
    function resolvePositions(t, offsetX = 0, depth = 0) {
        t.y = depth * (NODE_H + V_GAP);
        t.absX = offsetX + (t.parentX || 0);
        for (const c of t.children) {
            resolvePositions(c, offsetX + c.relX, depth + 1);
        }
    }

    function collectAll(t, out = []) { out.push(t); for (const c of t.children) collectAll(c, out); return out; }

    // ── Render ──────────────────────────────────────────────────────────────
    function render() {
        if (!currentRoot || !stageEl) return;

        const layout = buildLayoutTree(currentRoot);
        layoutSubtree(layout);
        resolvePositions(layout);

        const all = collectAll(layout);
        let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const t of all) {
            if (t.absX < minX) minX = t.absX;
            if (t.absX + NODE_W > maxX) maxX = t.absX + NODE_W;
            if (t.y + NODE_H > maxY) maxY = t.y + NODE_H;
        }
        // Normalize to start at (PADDING, PADDING)
        const offset = PADDING - minX;
        for (const t of all) t.absX += offset;
        const w = (maxX - minX) + PADDING * 2;
        const h = maxY + PADDING * 2;
        contentSize = { w, h };

        svgEl = buildSvg(layout, w, h);
        stageEl.innerHTML = '';
        stageEl.appendChild(svgEl);
        stageEl.style.width  = w + 'px';
        stageEl.style.height = h + 'px';
        applyTransform();
    }

    function buildSvg(layout, w, h) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('xmlns', svgNS);
        svg.setAttribute('width',  w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.classList.add('orbat-svg');

        // Connector layer (drawn first so nodes overlap it)
        const connectors = document.createElementNS(svgNS, 'g');
        connectors.setAttribute('class', 'orbat-connectors');
        svg.appendChild(connectors);

        // Nodes layer
        const nodesG = document.createElementNS(svgNS, 'g');
        nodesG.setAttribute('class', 'orbat-nodes');
        svg.appendChild(nodesG);

        // Draw connectors and nodes
        (function walk(t) {
            if (t.children.length) drawConnectors(connectors, t);
            drawNode(nodesG, t);
            for (const c of t.children) walk(c);
        })(layout);

        return svg;
    }

    function drawConnectors(group, t) {
        // All x coords already include the PADDING offset from render().
        // y coords are raw — addLine adds PADDING to them.
        const parentCx = t.absX + NODE_W / 2;
        const parentBottomY = t.y + NODE_H;
        const midY = parentBottomY + V_GAP / 2;

        // Parent stub: single vertical line parent-bottom → bus-bar.
        addLine(group, parentCx, parentBottomY, parentCx, midY);

        // Bus bar: horizontal line spanning all children's centers at midY.
        let minCx = parentCx, maxCx = parentCx;
        for (const c of t.children) {
            const cx = c.absX + NODE_W / 2;
            if (cx < minCx) minCx = cx;
            if (cx > maxCx) maxCx = cx;
        }
        if (minCx !== maxCx) addLine(group, minCx, midY, maxCx, midY);

        // Child stubs: vertical from bus-bar down to each child top.
        for (const c of t.children) {
            const childCx = c.absX + NODE_W / 2;
            addLine(group, childCx, midY, childCx, c.y);
        }
    }

    function addLine(group, x1, y1, x2, y2) {
        // Apply PADDING offset to y coords (x was normalized in resolvePositions + offset).
        const svgNS = 'http://www.w3.org/2000/svg';
        const ln = document.createElementNS(svgNS, 'line');
        ln.setAttribute('x1', x1);
        ln.setAttribute('y1', y1 + PADDING);
        ln.setAttribute('x2', x2);
        ln.setAttribute('y2', y2 + PADDING);
        group.appendChild(ln);
    }

    function drawNode(group, t) {
        const svgNS = 'http://www.w3.org/2000/svg';
        const n = t.node;
        const side = n.side || 'friendly';
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', `orbat-node orbat-node-side-${side} orbat-node-level-${n.level ?? 0}` + (t.collapsed ? ' orbat-collapsed' : ''));
        g.setAttribute('transform', `translate(${t.absX}, ${t.y + PADDING})`);
        g.setAttribute('data-id', n.id);

        // Outer card (info panel color, dark)
        const card = document.createElementNS(svgNS, 'rect');
        card.setAttribute('class', 'orbat-node-card');
        card.setAttribute('x', 0);
        card.setAttribute('y', 0);
        card.setAttribute('width', NODE_W);
        card.setAttribute('height', NODE_H);
        card.setAttribute('rx', 10);
        g.appendChild(card);

        // Light inner panel for the symbol — gives black-on-white contrast
        // for the frame & echelon modifiers (the real military-chart look).
        const symPanel = document.createElementNS(svgNS, 'rect');
        symPanel.setAttribute('class', 'orbat-node-sym-panel');
        symPanel.setAttribute('x', 1);
        symPanel.setAttribute('y', 1);
        symPanel.setAttribute('width', NODE_W - 2);
        symPanel.setAttribute('height', SYMBOL_SLOT_H);
        // Only round the TOP corners — bottom meets the dark info panel flush.
        // SVG rect rx rounds all corners; we approximate by using a path instead.
        symPanel.remove();
        const symPanelPath = document.createElementNS(svgNS, 'path');
        symPanelPath.setAttribute('class', 'orbat-node-sym-panel');
        const R = 9; // inner radius, slightly less than outer rx
        const W = NODE_W - 2;
        const H = SYMBOL_SLOT_H;
        symPanelPath.setAttribute('d',
            `M 1,${1 + R}` +
            ` a ${R},${R} 0 0 1 ${R},${-R}` +
            ` h ${W - 2 * R}` +
            ` a ${R},${R} 0 0 1 ${R},${R}` +
            ` v ${H - R}` +
            ` h ${-W}` +
            ` z`
        );
        g.appendChild(symPanelPath);

        // Sharp divider between the two panels
        const sep = document.createElementNS(svgNS, 'line');
        sep.setAttribute('class', 'orbat-node-sep');
        sep.setAttribute('x1', 0);
        sep.setAttribute('x2', NODE_W);
        sep.setAttribute('y1', SYMBOL_SLOT_H + 1);
        sep.setAttribute('y2', SYMBOL_SLOT_H + 1);
        g.appendChild(sep);

        // Symbol — nested <svg> with viewBox auto-scales into the reserved slot.
        const sym = buildMilSymbol(n.sidc, SYMBOL_BASE);
        if (sym) {
            const SLOT_PAD = 8;
            const slotW = SYMBOL_SLOT_W - SLOT_PAD * 2;
            const slotH = SYMBOL_SLOT_H - SLOT_PAD * 2;
            // Pick width/height preserving aspect, fitting inside slotW x slotH.
            const aspect = sym.width / sym.height;
            let renderedW, renderedH;
            if (slotW / aspect <= slotH) {
                renderedW = slotW;
                renderedH = slotW / aspect;
            } else {
                renderedH = slotH;
                renderedW = slotH * aspect;
            }
            const symX = (NODE_W - renderedW) / 2;
            const symY = SLOT_PAD + (slotH - renderedH) / 2;
            sym.el.setAttribute('x', symX);
            sym.el.setAttribute('y', symY);
            sym.el.setAttribute('width',  renderedW);
            sym.el.setAttribute('height', renderedH);
            sym.el.setAttribute('class', 'orbat-node-sym');
            g.appendChild(sym.el);
        }

        // Name text (clipped via <title> for overflow)
        const name = document.createElementNS(svgNS, 'text');
        name.setAttribute('class', 'orbat-node-name');
        name.setAttribute('x', NODE_W / 2);
        name.setAttribute('y', SYMBOL_SLOT_H + 18);
        name.setAttribute('text-anchor', 'middle');
        name.textContent = truncate(n.name || '', 18);
        g.appendChild(name);

        // Code / childcount row
        const meta = document.createElementNS(svgNS, 'text');
        meta.setAttribute('class', 'orbat-node-meta');
        meta.setAttribute('x', NODE_W / 2);
        meta.setAttribute('y', SYMBOL_SLOT_H + 32);
        meta.setAttribute('text-anchor', 'middle');
        const childN = n.children?.length || 0;
        meta.textContent = (n.code ? n.code : '') + (childN ? (n.code ? '  •  ' : '') + childN + (childN === 1 ? ' sub' : ' subs') : '');
        g.appendChild(meta);

        // Collapse indicator (three dots) when the node has hidden children
        if (t.collapsed && n.children?.length) {
            const dots = document.createElementNS(svgNS, 'text');
            dots.setAttribute('class', 'orbat-collapsed-dots');
            dots.setAttribute('x', NODE_W / 2);
            dots.setAttribute('y', NODE_H + 14);
            dots.setAttribute('text-anchor', 'middle');
            dots.textContent = '•••';
            g.appendChild(dots);
        }

        // Hover hit-rect on top so click works anywhere over the card
        const hit = document.createElementNS(svgNS, 'rect');
        hit.setAttribute('class', 'orbat-node-hit');
        hit.setAttribute('x', 0); hit.setAttribute('y', 0);
        hit.setAttribute('width', NODE_W); hit.setAttribute('height', NODE_H);
        hit.setAttribute('fill', 'transparent');
        hit.style.cursor = (n.children?.length ? 'pointer' : 'default');
        hit.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!n.children?.length) return;
            if (collapsed.has(n.id)) collapsed.delete(n.id); else collapsed.add(n.id);
            render();
        });
        g.appendChild(hit);

        // <title> for native tooltip
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = (n.name || '') + (n.code ? ` (${n.code})` : '');
        g.appendChild(title);

        group.appendChild(g);
    }

    function truncate(s, max) {
        if (!s) return '';
        if (s.length <= max) return s;
        return s.slice(0, max - 1) + '…';
    }

    // Build a milsymbol as a nested <svg> element. Nested <svg> auto-scales
    // its contents to whatever width/height we set (respecting its viewBox),
    // so the caller can just size + position it and everything stays inside.
    function buildMilSymbol(sidc, size) {
        try {
            if (window.ms && typeof window.ms.Symbol === 'function') {
                const sym = new window.ms.Symbol(sidc, { size, simpleStatusModifier: true });
                if (sym.isValid()) {
                    const dim = sym.getSize();
                    const doc = new DOMParser().parseFromString(sym.asSVG(), 'image/svg+xml');
                    const nested = doc.documentElement; // the milsymbol <svg>, self-contained with its own viewBox
                    // Strip explicit width/height — we'll set our own per-instance so it scales.
                    nested.removeAttribute('width');
                    nested.removeAttribute('height');
                    // Guarantee a viewBox (milsymbol always sets one, but be defensive).
                    if (!nested.getAttribute('viewBox')) {
                        nested.setAttribute('viewBox', `0 0 ${dim.width} ${dim.height}`);
                    }
                    nested.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    return { el: nested, width: dim.width, height: dim.height };
                }
            }
        } catch (_) { /* fall through */ }
        // Fallback placeholder — also a nested <svg> so call-site code is uniform.
        const svgNS = 'http://www.w3.org/2000/svg';
        const fallback = document.createElementNS(svgNS, 'svg');
        fallback.setAttribute('viewBox', `0 0 ${size} ${size}`);
        fallback.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', 1); r.setAttribute('y', 1);
        r.setAttribute('width',  size - 2); r.setAttribute('height', size - 2);
        r.setAttribute('fill', 'rgba(148,163,184,0.12)');
        r.setAttribute('stroke', 'rgba(148,163,184,0.5)');
        r.setAttribute('rx', 4);
        fallback.appendChild(r);
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', size / 2); t.setAttribute('y', size / 2 + 5);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('font-size', size * 0.4);
        t.setAttribute('fill', '#94a3b8');
        t.textContent = '?';
        fallback.appendChild(t);
        return { el: fallback, width: size, height: size };
    }

    // ── Export ──────────────────────────────────────────────────────────────
    function buildExportableSvg() {
        if (!svgEl) return null;
        // Clone and inline the stylesheet we need — the live SVG relies on external CSS.
        const clone = svgEl.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        style.textContent = inlineExportCss();
        clone.insertBefore(style, clone.firstChild);
        // Add a background rect so exported images aren't transparent.
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', 0); bg.setAttribute('y', 0);
        bg.setAttribute('width',  contentSize.w);
        bg.setAttribute('height', contentSize.h);
        bg.setAttribute('fill', '#0f172a');
        clone.insertBefore(bg, clone.firstChild);
        return clone;
    }

    function inlineExportCss() {
        return `
            .orbat-connectors line { stroke: rgba(148,163,184,0.55); stroke-width: 1.6; fill: none; }
            .orbat-node-card { fill: #111827; stroke: rgba(148,163,184,0.28); stroke-width: 1; }
            .orbat-node-side-friendly .orbat-node-card { stroke: rgba(59,130,246,0.55); }
            .orbat-node-side-hostile  .orbat-node-card { stroke: rgba(239,68,68,0.55); }
            .orbat-node-side-neutral  .orbat-node-card { stroke: rgba(234,179,8,0.55); }
            .orbat-node-side-unknown  .orbat-node-card { stroke: rgba(148,163,184,0.55); }
            .orbat-node-sym-panel { fill: #f1f5f9; stroke: rgba(100,116,139,0.25); stroke-width: 0.6; }
            .orbat-node-sep { stroke: rgba(15,23,42,0.35); stroke-width: 1; }
            .orbat-node-name { fill: #e5e7eb; font: 600 12px system-ui, -apple-system, Segoe UI, sans-serif; }
            .orbat-node-meta { fill: #94a3b8; font: 500 10px ui-monospace, Menlo, Consolas, monospace; letter-spacing: 0.04em; }
            .orbat-collapsed-dots { fill: #94a3b8; font: 700 14px system-ui; letter-spacing: 2px; }
        `;
    }

    function exportImage(kind) {
        const clone = buildExportableSvg();
        if (!clone) return;
        const serializer = new XMLSerializer();
        const svgStr = serializer.serializeToString(clone);

        if (kind === 'svg') {
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            triggerDownload(blob, filenameFor('svg'));
            return;
        }

        // PNG: rasterize via Image → canvas
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const scale = 2; // retina-ish
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(contentSize.w * scale);
            canvas.height = Math.round(contentSize.h * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob((pngBlob) => {
                if (pngBlob) triggerDownload(pngBlob, filenameFor('png'));
            }, 'image/png');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            alert(tr('orbat-export-failed', 'Export failed'));
        };
        img.src = url;
    }

    function filenameFor(ext) {
        const name = (currentRoot?.name || 'orbat').replace(/[^\w؀-ۿ\-_.]+/g, '_').slice(0, 40);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        return `orbat-${name}-${stamp}.${ext}`;
    }

    function triggerDownload(blob, filename) {
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);
    }

    // ── Public API ──────────────────────────────────────────────────────────
    window.AppUnitsOrbat = { open, close };
})();
