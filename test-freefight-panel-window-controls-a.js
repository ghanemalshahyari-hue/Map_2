#!/usr/bin/env node
/*
 * FREEFIGHT-PANEL-WINDOW-CONTROLS-A
 *
 * Tests for the Free Fight Demo panel window controls (draggable, resizable,
 * minimizable, maximizable, session-persistent).  No server required.
 *
 * Tests:
 *   §1   Panel renders with titlebar window controls (—, □, ×)
 *   §2   Minimize hides body and keeps titlebar visible
 *   §3   Restore from minimize shows body again
 *   §4   Maximize stores prevRect and uses viewport-sized rect
 *   §5   Restore from maximize returns old rect
 *   §6   Drag clamps within viewport (source check)
 *   §7   Resize clamps to min/max size (source check)
 *   §8   Session restore loads previous rect from sessionStorage
 *   §9   Close removes panel; RmoozFreeFightDemo.clear still works
 *   §10  Existing AI Decision Preview still renders in body
 */
'use strict';

var path = require('path');
var fs   = require('fs');

var PASS = 0, FAIL = 0;
function ok(label, cond, detail) {
    if (cond) { PASS++; console.log('  PASS  ' + label); }
    else       { FAIL++; console.log('  FAIL  ' + label + (detail ? '  (' + detail + ')' : '')); }
}

// ── DOM + map stub ─────────────────────────────────────────────────────────
var elById = {};
function deepQueryEl(el, sel) {
    if (!el) return null;
    var mff = sel.match(/^\[data-ff="([^"]+)"\]$/);
    if (mff) {
        if (el.attrs && el.attrs['data-ff'] === mff[1]) return el;
        for (var _i = 0; _i < (el.children || []).length; _i++) {
            var _r = deepQueryEl(el.children[_i], sel); if (_r) return _r;
        }
        return null;
    }
    var m = sel.match(/^\[data-act="([^"]+)"\]$/);
    if (!m) return null;
    var act = m[1];
    if (el.attrs && el.attrs['data-act'] === act) return el;
    for (var _j = 0; _j < (el.children || []).length; _j++) {
        var _r2 = deepQueryEl(el.children[_j], sel); if (_r2) return _r2;
    }
    if (el.innerHTML && el.innerHTML.indexOf('data-act="' + act + '"') !== -1) {
        return { addEventListener: function () {}, removeEventListener: function () {},
                 disabled: false, style: {cssText: ''}, textContent: '', checked: false, value: '' };
    }
    return null;
}
function getAllHtml(el) {
    if (!el) return '';
    var s = el.innerHTML || '';
    (el.children || []).forEach(function (c) { s += getAllHtml(c); });
    return s;
}
function makeEl(tag) {
    var el = {
        tagName: String(tag).toUpperCase(), id: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {cssText: ''}, parentNode: null, disabled: false,
        _listeners: {},
        appendChild: function (c) {
            c.parentNode = this; this.children.push(c);
            if (c.id) elById[c.id] = c; return c;
        },
        removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); c.parentNode = null; },
        insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
        setAttribute: function (k, v) { this.attrs[k] = String(v == null ? '' : v); },
        getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function (ev, fn) {
            if (!this._listeners[ev]) this._listeners[ev] = [];
            this._listeners[ev].push(fn);
        },
        removeEventListener: function (ev, fn) {
            if (this._listeners[ev]) this._listeners[ev] = this._listeners[ev].filter(function (f) { return f !== fn; });
        },
        setPointerCapture: function () {},
        querySelectorAll: function () { return []; },
        querySelector: function (sel) { return deepQueryEl(this, sel); },
    };
    return el;
}
var bodyEl = makeEl('body');
global.sessionStorage = {
    _data: {},
    getItem:    function (k)    { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
    setItem:    function (k, v) { this._data[k] = String(v); },
    removeItem: function (k)    { delete this._data[k]; },
};
global.window = {
    innerWidth: 1280, innerHeight: 800,
    document: {
        body: bodyEl,
        head: makeEl('head'),
        createElement: function (t) { return makeEl(t); },
        getElementById: function (id) { return elById[id] || null; },
    },
    addEventListener:    function () {},
    removeEventListener: function () {},
    dispatchEvent:       function () {},
};
var _markerStub = { addTo: function () { return this; }, on: function () { return this; }, bindPopup: function () { return this; }, openPopup: function () { return this; } };
var _layerGroupInstance = {
    addTo: function () { return this; }, clearLayers: function () {}, addLayer: function () { return this; },
};
global.window.L = {
    layerGroup: function () { return Object.assign({}, _layerGroupInstance); },
    marker: function () { return Object.assign({}, _markerStub); },
    divIcon: function () { return {}; },
    circleMarker: function () { return Object.assign({}, _markerStub); },
};
global.window.map = {
    hasLayer: function () { return false; }, removeLayer: function () {},
    addLayer: function () {}, on: function () {}, off: function () {},
};
global.window.RmoozDemoUnits = { buildGroupsFromAnchors: function () { return []; } };
global.window.RmoozFreeFightAI = null;
global.window.fetch = null;

// ── Load modules ─────────────────────────────────────────────────────────────
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var CLIENT_SRC = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');

var PAYLOAD = {
    brief: {
        operational_brief: {
            proposed_units: [
                { id: 'R-WIN-001', side: 'RED', lat: 27.21, lon: 56.38, platform: 'F-14A' },
            ],
            objectives: [{ label: 'Objective X', lat: 26.0, lon: 53.0 }],
            placement_candidates: [{ type: 'base', lat: 27.21, lon: 56.38, name: 'TestAB' }],
        },
    },
};

// ── helper: fresh mount ──────────────────────────────────────────────────────
function freshMount() {
    elById = {};
    bodyEl.children = [];
    sessionStorage._data = {};
    DEMO._resetWinStateForTest();
    DEMO.clear();
    DEMO.mount(PAYLOAD);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1  Panel renders with titlebar window controls
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§1  Panel renders with titlebar window controls');
freshMount();
var panelEl = elById['rmooz-free-fight-panel'];
ok('§1 panel element created', !!panelEl);
ok('§1 panel has flex column layout', /flex-direction:column/.test(panelEl.style.cssText || ''));
ok('§1 panel overflow hidden', /overflow:hidden/.test(panelEl.style.cssText || ''));

var titlebar = panelEl && deepQueryEl(panelEl, '[data-ff="titlebar"]');
ok('§1 titlebar child present (data-ff=titlebar)', !!titlebar);
ok('§1 titlebar has cursor:move', titlebar && /cursor:move/.test(titlebar.style.cssText || ''));

var allHtml = getAllHtml(panelEl);
ok('§1 win-min button present', /data-act="win-min"/.test(allHtml));
ok('§1 win-max button present', /data-act="win-max"/.test(allHtml));
ok('§1 win-close button present', /data-act="win-close"/.test(allHtml));

var bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
ok('§1 scrollable body present (data-ff=body)', !!bodyDiv);
ok('§1 body has overflow-y:auto', bodyDiv && /overflow-y:auto/.test(bodyDiv.style.cssText || ''));

var rh = panelEl && deepQueryEl(panelEl, '[data-ff="resize"]');
ok('§1 resize handle present (data-ff=resize)', !!rh);
ok('§1 resize handle has se-resize cursor', rh && /se-resize/.test(rh.style.cssText || ''));
ok('§1 resize handle shows ↘', rh && rh.textContent === '↘');

// ═══════════════════════════════════════════════════════════════════════════════
// §2  Minimize hides body and keeps titlebar visible
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§2  Minimize hides body, titlebar stays');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
ok('§2 body visible before minimize', bodyDiv && bodyDiv.style.display !== 'none');
DEMO._winMinimizeForTest();
ok('§2 body hidden after minimize', bodyDiv && bodyDiv.style.display === 'none');
titlebar = panelEl && deepQueryEl(panelEl, '[data-ff="titlebar"]');
ok('§2 titlebar still in DOM', !!titlebar);
ok('§2 _winState.minimized = true', !!(DEMO._getWinStateForTest() && DEMO._getWinStateForTest().minimized));

// ═══════════════════════════════════════════════════════════════════════════════
// §3  Restore from minimize shows body again
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§3  Restore from minimize shows body again');
DEMO._winMinimizeForTest();  // toggle back
ok('§3 body visible after second toggle', bodyDiv && bodyDiv.style.display !== 'none');
ok('§3 _winState.minimized = false', !(DEMO._getWinStateForTest() && DEMO._getWinStateForTest().minimized));

// ═══════════════════════════════════════════════════════════════════════════════
// §4  Maximize stores prevRect and applies viewport-sized rect
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§4  Maximize stores prevRect and uses viewport size');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
var ws = DEMO._getWinStateForTest();
var origLeft = ws.left, origTop = ws.top, origW = ws.width, origH = ws.height;
DEMO._winMaximizeForTest();
var wsMax = DEMO._getWinStateForTest();
ok('§4 maximized = true', wsMax && wsMax.maximized);
ok('§4 prevRect stored', wsMax && !!wsMax.prevRect);
ok('§4 prevRect.left matches original', wsMax && wsMax.prevRect && wsMax.prevRect.left === origLeft);
ok('§4 prevRect.width matches original', wsMax && wsMax.prevRect && wsMax.prevRect.width === origW);
// Panel CSS should reflect viewport (1280×800, margin 12px left, 72px top, 24px width, 90px height)
ok('§4 panel left = 12px', panelEl.style.left === '12px');
ok('§4 panel top = 72px', panelEl.style.top === '72px');
ok('§4 panel width = ' + (1280 - 24) + 'px', panelEl.style.width === (1280 - 24) + 'px');
ok('§4 panel height = ' + (800 - 90) + 'px', panelEl.style.height === (800 - 90) + 'px');
ok('§4 resize handle hidden when maximized', deepQueryEl(panelEl, '[data-ff="resize"]').style.display === 'none');

// ═══════════════════════════════════════════════════════════════════════════════
// §5  Restore from maximize returns old rect
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§5  Restore from maximize returns old rect');
DEMO._winMaximizeForTest();  // toggle back (restore)
var wsRest = DEMO._getWinStateForTest();
ok('§5 maximized = false after restore', wsRest && !wsRest.maximized);
ok('§5 left restored', wsRest && wsRest.left === origLeft);
ok('§5 top restored',  wsRest && wsRest.top  === origTop);
ok('§5 width restored',  wsRest && wsRest.width  === origW);
ok('§5 height restored', wsRest && wsRest.height === origH);
ok('§5 panel left CSS restored', panelEl.style.left === origLeft + 'px');

// ═══════════════════════════════════════════════════════════════════════════════
// §6  Drag clamps within viewport (source check)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§6  Drag clamps within viewport');
ok('§6 drag handler uses pointerdown', /attachDrag/.test(CLIENT_SRC) || /pointerdown/.test(CLIENT_SRC));
ok('§6 left clamped to 0 minimum', /Math\.max\(0/.test(CLIENT_SRC));
ok('§6 left clamped to vw - width', /vw\s*-\s*_winState\.width/.test(CLIENT_SRC));
ok('§6 top clamped to vh - 40', /vh\s*-\s*40/.test(CLIENT_SRC));
ok('§6 pointer capture used', /setPointerCapture/.test(CLIENT_SRC));
ok('§6 drag blocked when target is button', /tagName.*BUTTON|BUTTON.*tagName/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §7  Resize clamps to min/max size (source check)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§7  Resize clamps to min/max size');
ok('§7 FF_WIN_MINW = 420 in source', /FF_WIN_MINW\s*=\s*420/.test(CLIENT_SRC));
ok('§7 FF_WIN_MINH = 260 in source', /FF_WIN_MINH\s*=\s*260/.test(CLIENT_SRC));
ok('§7 resize uses Math.max with FF_WIN_MINW', /Math\.max\(.*FF_WIN_MINW/.test(CLIENT_SRC));
ok('§7 resize uses Math.max with FF_WIN_MINH', /Math\.max\(.*FF_WIN_MINH/.test(CLIENT_SRC));
ok('§7 resize clamps width to vw - left', /vw\s*-\s*_winState\.left/.test(CLIENT_SRC));
ok('§7 resize clamps height to vh - top', /vh\s*-\s*_winState\.top/.test(CLIENT_SRC));
ok('§7 resize cursor se-resize on handle', /se-resize/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §8  Session restore loads previous rect from sessionStorage
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§8  Session restore loads previous rect');
var savedRect = { left: 200, top: 150, width: 500, height: 480, minimized: false, maximized: false, prevRect: null };
sessionStorage.setItem('rmooz.freeFightPanel.window', JSON.stringify(savedRect));
elById = {}; bodyEl.children = [];
DEMO._resetWinStateForTest();
DEMO.clear();
DEMO.mount(PAYLOAD);
var wsLoaded = DEMO._getWinStateForTest();
ok('§8 left loaded from sessionStorage', wsLoaded && wsLoaded.left === 200);
ok('§8 top loaded from sessionStorage',  wsLoaded && wsLoaded.top  === 150);
ok('§8 width loaded from sessionStorage',  wsLoaded && wsLoaded.width  === 500);
ok('§8 height loaded from sessionStorage', wsLoaded && wsLoaded.height === 480);
ok('§8 session key is rmooz.freeFightPanel.window', /rmooz\.freeFightPanel\.window/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §9  Close removes panel; RmoozFreeFightDemo.clear still works
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§9  Close removes panel; clear() still works');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
ok('§9 panel exists before clear', !!panelEl && !!panelEl.parentNode);
DEMO.clear();
ok('§9 panel removed after clear()', !panelEl.parentNode);
ok('§9 clear() does not throw', true);
var threw9 = false;
try { DEMO.clear(); DEMO.clear(); } catch (e) { threw9 = true; }
ok('§9 repeated clear() does not throw', !threw9);
ok('§9 getAiDecision() null after clear', DEMO.getAiDecision() === null);
ok('§9 win-close button triggers clear (source check)',
    /win-close.*clear|closeBtn.*addEventListener.*click.*clear/.test(CLIENT_SRC));

// ═══════════════════════════════════════════════════════════════════════════════
// §10  AI Decision panel still renders in body with new COA Planner header
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n§10  AI Decision panel still renders in body with new COA Planner header');
freshMount();
panelEl = elById['rmooz-free-fight-panel'];
bodyDiv = panelEl && deepQueryEl(panelEl, '[data-ff="body"]');
var bodyHtml = bodyDiv ? bodyDiv.innerHTML : '';
ok('§10 body div has content', bodyHtml.length > 0);
ok('§10 data-act="preview-ai" in body', /data-act="preview-ai"/.test(bodyHtml));
ok('§10 data-act="start" in body', /data-act="start"/.test(bodyHtml));
ok('§10 data-act="reset" in body', /data-act="reset"/.test(bodyHtml));
ok('§10 MAIN AI TEST header present',  /MAIN AI TEST/.test(bodyHtml));
ok('§10 Attack Plan / COA Planner label present', /Attack Plan \/ COA Planner/.test(bodyHtml));
ok('§10 Place Objective button present', /Place.*Objective X|Objective X/.test(bodyHtml));

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(52));
console.log('PASS: ' + PASS + '  FAIL: ' + FAIL + '  TOTAL: ' + (PASS + FAIL));
if (FAIL > 0) process.exit(1);
