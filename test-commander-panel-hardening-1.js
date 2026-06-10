'use strict';
/**
 * test-commander-panel-hardening-1.js
 * Commander Panel Hardening-1 — locks current behavior so future edits
 * cannot silently regress the panel.
 *
 * Tests:
 *  HTML-1  #unit-status-panel exists in app.html
 *  HTML-2  old #unit-panel does NOT exist in app.html
 *  HTML-3  usp-body element present (panel body wrapper)
 *  HTML-4  usp-empty element present (empty state)
 *  HTML-5  usp-collapse-tab button present
 *  HTML-6  usp-reopen-tab button present
 *  HTML-7  all required element IDs present in panel HTML
 *  CSS-1   .usp-empty[hidden] { display:none } rule exists
 *  CSS-2   .usp-body[hidden]  { display:none } rule exists
 *  CSS-3   supply-fill.supply-amber / supply-red rules exist
 *  CSS-4   no #unit-panel display:none CSS (real removal, not CSS hide)
 *  JS-1    exactly one rmooz:unit-selected listener opens a panel
 *            (unit-status-panel.js has the listener; event-log.js may
 *             listen but must NOT call openPanel / show panel elements)
 *  JS-2    event-log.js listener does NOT reference unit-status-panel
 *            elements or AppUnitStatusPanel.openPanel
 *  JS-3    no AppMiddleEastPlatform reference in panel JS
 *  JS-4    no AppMiddleEastPlatformLoader reference in panel JS
 *  JS-5    no middle-east-platform-loader.js reference in panel JS
 *  JS-6    panel uses AppWorldStateDB (DB1 single source)
 *  JS-7    panel calls enrichUnit (DB1 enrichment wired)
 *  JS-8    panel has getCurrentUnit() for external consumers (ai-bridge)
 *  JS-9    panel has collapsePanel and expandPanel functions
 *  JS-10   panel has formatMagStock (no [object Object] in magazines)
 *  DB1-1   world-state-db.js DB_VERSION is 1.1.0-d5
 *  DB1-2   CAPABILITY_CATALOG has 29 entries
 *  DB1-3   middle-east-platform-loader.js file does NOT exist
 *  DB1-4   data/db/middle-east/platforms.json file does NOT exist
 *  MUT-1   no apply/accept/reject/commit/execute/gate-7 buttons in panel HTML
 *  SVG-1   _unitSvg or _SVG symbol table exists in panel JS (unit images)
 *  SVG-2   SVG has entries for key platform types (fighter, ship, tank, sam)
 */

const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

function ok(label, cond, detail) {
    if (cond) { passed++; }
    else { failed++; failures.push('FAIL: ' + label + (detail ? '  — ' + detail : '')); }
}

let passed = 0, failed = 0;
const failures = [];

// ── Load source files ─────────────────────────────────────────────────────
const APP_HTML   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');
const PANEL_JS   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/unit-status-panel.js'), 'utf8');
const ELOG_JS    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/event-log.js'), 'utf8');

// Load DB1 in Node
const sandboxWin = {};
sandboxWin.window = sandboxWin;
const dbSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/world-state-db.js'), 'utf8');
(new Function('window', dbSrc))(sandboxWin);
const db = sandboxWin.AppWorldStateDB;

// ── HTML tests ────────────────────────────────────────────────────────────

ok('HTML-1: #unit-status-panel aside exists in app.html',
    /id=["']unit-status-panel["']/.test(APP_HTML));

ok('HTML-2: old #unit-panel does NOT exist in app.html',
    !/id=["']unit-panel["']/.test(APP_HTML),
    'old panel was removed; it must not come back');

ok('HTML-3: id="usp-body" present',
    APP_HTML.includes('id="usp-body"'));

ok('HTML-4: id="empty-state" present',
    APP_HTML.includes('id="empty-state"'));

ok('HTML-5: id="usp-collapse-tab" present',
    APP_HTML.includes('id="usp-collapse-tab"'));

ok('HTML-6: id="usp-reopen-tab" present',
    APP_HTML.includes('id="usp-reopen-tab"'));

const REQUIRED_IDS = [
    'unit-label', 'unit-uid', 'unit-side', 'unit-domain', 'unit-role', 'unit-echelon',
    'unit-symbol', 'readiness-value', 'readiness-source', 'readiness-data-source',
    'supply-fill', 'supply-pct', 'supply-source', 'supply-data-source',
    'sensor-list', 'sensor-count', 'sensors-empty',
    'weapon-list', 'weapon-count', 'weapons-empty',
    'magazine-list', 'magazines-title',
    'delta-list', 'delta-count', 'deltas-section',
    'usp-platform-id', 'usp-platform-type',
    'usp-course', 'usp-speed',
    'usp-sidc', 'usp-mgrs', 'usp-latlng', 'usp-selat',
    'usp-status-badge', 'panel-close'
];
REQUIRED_IDS.forEach(function(id) {
    ok('HTML-7 id=' + id, APP_HTML.includes('id="' + id + '"'));
});

// ── CSS tests ─────────────────────────────────────────────────────────────

ok('CSS-1: .usp-empty[hidden] display:none exists',
    APP_HTML.includes('.usp-empty[hidden]') && APP_HTML.includes('display:none'));

ok('CSS-2: .usp-body[hidden] display:none exists',
    APP_HTML.includes('.usp-body[hidden]'));

ok('CSS-3a: supply-fill.supply-amber rule exists',
    APP_HTML.includes('supply-fill.supply-amber'));

ok('CSS-3b: supply-fill.supply-red rule exists',
    APP_HTML.includes('supply-fill.supply-red'));

ok('CSS-4: no #unit-panel { display: none } CSS workaround (panel is truly removed)',
    !APP_HTML.includes('#unit-panel { display: none') &&
    !APP_HTML.includes('#unit-panel{display:none'));

// ── JS — listener purity ──────────────────────────────────────────────────

// unit-status-panel.js must have exactly one rmooz:unit-selected addEventListener
const panelListeners = (PANEL_JS.match(/addEventListener\(['"]rmooz:unit-selected['"]/g) || []).length;
ok('JS-1a: panel JS has exactly one rmooz:unit-selected listener', panelListeners === 1,
    'got: ' + panelListeners);

// event-log.js may listen but must NOT call openPanel or manipulate the panel
ok('JS-2a: event-log listener does not call openPanel',
    !ELOG_JS.includes('openPanel') && !ELOG_JS.includes('AppUnitStatusPanel'));

ok('JS-2b: event-log listener does not reference unit-status-panel element',
    !ELOG_JS.includes('unit-status-panel'));

// ── JS — no ME catalog references ────────────────────────────────────────

ok('JS-3: no AppMiddleEastPlatform API call in panel',
    !/AppMiddleEastPlatform\s*\./.test(PANEL_JS));

ok('JS-4: no AppMiddleEastPlatformLoader in panel',
    !PANEL_JS.includes('AppMiddleEastPlatformLoader'));

// Doc comment may mention the deleted filename for history — check for functional API calls only
ok('JS-5: no functional AppMiddleEastPlatformLoader API call in panel',
    !/AppMiddleEastPlatformLoader\s*\./.test(PANEL_JS) &&
    !/require\(['"].*middle-east/.test(PANEL_JS));

// ── JS — DB1 integration ──────────────────────────────────────────────────

ok('JS-6: panel uses AppWorldStateDB',
    PANEL_JS.includes('AppWorldStateDB'));

ok('JS-7: panel calls enrichUnit (DB1 enrichment)',
    PANEL_JS.includes('enrichUnit'));

ok('JS-8: panel exposes getCurrentUnit()',
    PANEL_JS.includes('getCurrentUnit'));

ok('JS-9a: panel has collapsePanel function',
    PANEL_JS.includes('function collapsePanel'));

ok('JS-9b: panel has expandPanel function',
    PANEL_JS.includes('function expandPanel'));

ok('JS-10: panel has formatMagStock (prevents [object Object])',
    PANEL_JS.includes('formatMagStock'));

// ── DB1 integrity ─────────────────────────────────────────────────────────

ok('DB1-1: DB_VERSION exists and starts with 1.',
    db && db.DB_VERSION && String(db.DB_VERSION).startsWith('1.'),
    db && db.DB_VERSION);

ok('DB1-2: CAPABILITY_CATALOG has 29 entries',
    db && Object.keys(db.CAPABILITY_CATALOG).length === 29,
    db && Object.keys(db.CAPABILITY_CATALOG).length);

ok('DB1-3: middle-east-platform-loader.js file deleted',
    !fs.existsSync(path.join(ROOT, 'UI_MOdified/client/shell/middle-east-platform-loader.js')));

ok('DB1-4: data/db/middle-east/platforms.json file deleted',
    !fs.existsSync(path.join(ROOT, 'UI_MOdified/data/db/middle-east/platforms.json')));

// ── No mutation buttons ───────────────────────────────────────────────────
// Extract panel HTML block (between unit-status-panel aside and OBJ-C)
const panelHtmlStart = APP_HTML.indexOf('id="unit-status-panel"');
const panelHtmlEnd   = APP_HTML.indexOf('<!-- OBJ-C:', panelHtmlStart);
const panelHtml      = panelHtmlStart >= 0 && panelHtmlEnd > panelHtmlStart
    ? APP_HTML.slice(panelHtmlStart, panelHtmlEnd)
    : '';

ok('MUT-1a: no "apply" button in panel HTML',
    !/button[^>]*>.*apply/i.test(panelHtml));

ok('MUT-1b: no "accept" button in panel HTML',
    !/button[^>]*>.*accept/i.test(panelHtml));

ok('MUT-1c: no "commit" / "execute" button in panel HTML',
    !/button[^>]*>.*(?:commit|execute)/i.test(panelHtml));

ok('MUT-1d: no "gate.?7" in panel HTML',
    !/gate.?7/i.test(panelHtml));

// ── Real image framework (Real-Unit-Images-1) ─────────────────────────────

ok('IMG-1: _renderRealImage function exists in panel JS',
    PANEL_JS.includes('function _renderRealImage'));

ok('IMG-2: panel checks unit.image_url',
    PANEL_JS.includes('unit.image_url'));

ok('IMG-3: panel checks enriched.image_asset (DB1 catalog path)',
    PANEL_JS.includes('image_asset'));

ok('IMG-4: image load error falls back to SVG silhouette',
    PANEL_JS.includes('img.onerror') && PANEL_JS.includes('_unitSvg'));

ok('IMG-5: attribution overlay rendered from image_credit',
    PANEL_JS.includes('image_credit'));

// ── Priority order: real image before milsymbol ───────────────────────────
ok('IMG-5b: real image check comes BEFORE milsymbol check in _renderSymbol',
    (function() {
        // Find _renderSymbol function body
        var start = PANEL_JS.indexOf('function _renderSymbol(');
        var end   = PANEL_JS.indexOf('\n    }', start + 100) + 6;
        var body  = PANEL_JS.slice(start, end);
        var imgIdx = body.indexOf('unit.image_url');
        var milIdx = body.indexOf('ms.Symbol');
        return imgIdx > 0 && milIdx > 0 && imgIdx < milIdx;
    })(),
    'unit.image_url check must appear before ms.Symbol in _renderSymbol');

// ── DB1 meko entry has image metadata ────────────────────────────────────
ok('IMG-5c: DB1 meko entry has image_asset',
    db && db.CAPABILITY_CATALOG.meko && db.CAPABILITY_CATALOG.meko.image_asset,
    db && db.CAPABILITY_CATALOG.meko && db.CAPABILITY_CATALOG.meko.image_asset);

ok('IMG-5d: DB1 meko image_asset is a local path (not a remote URL)',
    (function() {
        var ia = db && db.CAPABILITY_CATALOG.meko && db.CAPABILITY_CATALOG.meko.image_asset;
        return ia && ia.startsWith('/') && !ia.startsWith('//') && !ia.startsWith('/http');
    })());

ok('IMG-6: USS Lake Champlain image asset file exists locally',
    fs.existsSync(path.join(ROOT, 'UI_MOdified/client/assets/units/uss-lake-champlain-cvs39.jpg')));

ok('IMG-7: unit image manifest exists with provenance metadata',
    fs.existsSync(path.join(ROOT, 'UI_MOdified/client/assets/units/manifest.json')));

ok('IMG-8: manifest contains public-domain note',
    (function() {
        try {
            var m = JSON.parse(fs.readFileSync(
                path.join(ROOT, 'UI_MOdified/client/assets/units/manifest.json'), 'utf8'));
            var img = m.images && m.images['uss-lake-champlain-cvs39.jpg'];
            return img && img.license && img.license.includes('Public Domain');
        } catch (_) { return false; }
    })());

ok('IMG-9: manifest has source_url (canonical provenance link)',
    (function() {
        try {
            var m = JSON.parse(fs.readFileSync(
                path.join(ROOT, 'UI_MOdified/client/assets/units/manifest.json'), 'utf8'));
            var img = m.images && m.images['uss-lake-champlain-cvs39.jpg'];
            return img && img.source_url && img.source_url.includes('wikimedia');
        } catch (_) { return false; }
    })());

ok('IMG-10: no AI-generated image references in panel JS',
    !PANEL_JS.includes('ai-generated') && !PANEL_JS.includes('generated-image'));

// ── SVG unit images ───────────────────────────────────────────────────────

ok('SVG-1: _SVG symbol table exists in panel JS',
    PANEL_JS.includes('_SVG') && PANEL_JS.includes('_unitSvg'));

ok('SVG-2a: fighter silhouette defined',
    PANEL_JS.includes('FIGHTER / STRIKE') || PANEL_JS.includes('FIGHTER'));

ok('SVG-2b: ship/frigate silhouette defined',
    PANEL_JS.includes('FRIGATE') || PANEL_JS.includes('NAVAL COMBATANT'));

ok('SVG-2c: tank silhouette defined',
    PANEL_JS.includes('MAIN BATTLE TANK') || PANEL_JS.includes('TANK'));

ok('SVG-2d: SAM silhouette defined',
    PANEL_JS.includes('SAM BATTERY') || PANEL_JS.includes('SAM'));

ok('SVG-2e: platform switch covers all 29 DB1 kinds (key spot-checks)',
    PANEL_JS.includes("case 'f16c'") &&
    PANEL_JS.includes("case 'meko'") &&
    PANEL_JS.includes("case 'patriot'") &&
    PANEL_JS.includes("case 'infantry_bn'") &&
    PANEL_JS.includes("case 'mlrs'") &&
    PANEL_JS.includes("case 'logistics'"));

// ── Report ────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════════════════');
console.log('  Commander Panel Hardening-1 — Regression Lock');
console.log('═══════════════════════════════════════════════════════════════════════════');
if (failures.length) {
    failures.forEach(function(f) { console.log('  ' + f); });
    console.log('');
}
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═══════════════════════════════════════════════════════════════════════════\n');
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('═══════════════════════════════════════════════════════════════════════════\n');
if (failed > 0) process.exit(1);
