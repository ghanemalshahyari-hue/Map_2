#!/usr/bin/env node
'use strict';
/**
 * APP-FLOW-2 (visual) — the bottom-timeline scenario controls must render as
 * readable buttons + a truncating scenario label, not tiny squares. Layout/
 * styling only; no logic/markup-id changes. Source assertions (CSS + markup).
 *
 * Run:  node scripts/test-app-flow-2-visual.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'client', 'app.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'client', 'style.css'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

console.log('\nAPP-FLOW-2 (visual) — markup');
test('scenario buttons use the text-button class and no inline style', () => {
    const grp = HTML.slice(HTML.indexOf('timeline-group--scenario'), HTML.indexOf('timeline-group--transport'));
    assert.ok(/id="tl-load-scenario"[^>]*timeline-btn--text/.test(grp) || /timeline-btn--text[^>]*id="tl-load-scenario"/.test(grp),
        'Load is a text button');
    assert.ok(/id="tl-import-scenario"[^>]*timeline-btn--text/.test(grp) || /timeline-btn--text[^>]*id="tl-import-scenario"/.test(grp),
        'Import is a text button');
    assert.ok(!/id="tl-load-scenario"[^>]*style=/.test(grp), 'Load button: inline style removed');
    assert.ok(!/id="tl-import-scenario"[^>]*style=/.test(grp), 'Import button: inline style removed');
    assert.ok(!/id="tl-scenario-name"[^>]*style=/.test(grp), 'scenario name: inline style removed');
});

console.log('\nAPP-FLOW-2 (visual) — CSS');
test('.timeline-btn--text overrides the square base (auto width + min-width)', () => {
    const i = CSS.indexOf('.timeline-btn--text {');
    assert.ok(i > -1, '.timeline-btn--text rule exists');
    const b = CSS.slice(i, i + 320);
    assert.ok(/width:\s*auto/.test(b), 'width:auto (override 26px square)');
    assert.ok(/min-width:\s*6\d px|min-width:\s*\d{2,}px/.test(b), 'has a min-width');
    assert.ok(/padding:\s*0 12px/.test(b), 'readable horizontal padding');
});
test('.timeline-scenario-name truncates cleanly with ellipsis + max-width', () => {
    const i = CSS.indexOf('.timeline-scenario-name {');
    assert.ok(i > -1, 'rule exists');
    const b = CSS.slice(i, i + 320);
    assert.ok(/text-overflow:\s*ellipsis/.test(b), 'ellipsis');
    assert.ok(/white-space:\s*nowrap/.test(b), 'nowrap');
    assert.ok(/max-width:\s*\d+px/.test(b), 'max-width');
});
test('scenario group adds spacing before the transport group', () => {
    const i = CSS.indexOf('.timeline-group--scenario {');
    assert.ok(i > -1, 'rule exists');
    assert.ok(/margin-inline-end|gap:/.test(CSS.slice(i, i + 200)), 'spacing present');
});
test('load/import keep distinct affordances', () => {
    assert.ok(/#tl-load-scenario\s*\{/.test(CSS) && /#tl-import-scenario\s*\{/.test(CSS), 'both styled distinctly');
});
test('responsive fallback truncates the name on smaller screens', () => {
    assert.ok(/@media \(max-width: \d+px\)[\s\S]{0,200}\.timeline-scenario-name \{ max-width/.test(CSS),
        'media query narrows the scenario name');
});

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-app-flow-2-visual — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
