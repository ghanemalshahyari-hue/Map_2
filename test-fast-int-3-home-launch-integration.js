#!/usr/bin/env node
/**
 * test-fast-int-3-home-launch-integration.js
 *
 * FAST-INT-3 verifier — Home Command Launch entries for the WarGamingGEN import
 * flows. Static source checks (no server): the two launch buttons exist on the
 * "Begin an operation" screen, are wired by intent to REVEAL the existing
 * FAST-INT-2 / FAST-DOC-1 cards, do NOT duplicate importer logic, and do NOT
 * mutate scenario state on click.
 *
 *   node test-fast-int-3-home-launch-integration.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function ok(c, label, detail) { if (c) { console.log('  ok   ' + label); pass++; } else { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; } }

const homeHtml = read('UI_MOdified/client/home.html');
const homeJs   = read('UI_MOdified/client/home.js');
const loader   = read('UI_MOdified/client/shell/native-scenario-loader.js');

console.log('\n── home.html: two new launch buttons on Begin an operation ──');
ok(/data-intent="import-geojson"/.test(homeHtml), 'Import WarGamingGEN GeoJSON button present (data-intent=import-geojson)');
ok(/data-intent="import-docx"/.test(homeHtml), 'DOCX Simulation Import button present (data-intent=import-docx)');
ok(/data-i18n="hub-import-geojson"/.test(homeHtml) && /data-i18n="hub-import-geojson-sub"/.test(homeHtml), 'GeoJSON button has i18n label + subtitle');
ok(/data-i18n="hub-import-docx"/.test(homeHtml) && /data-i18n="hub-import-docx-sub"/.test(homeHtml), 'DOCX button has i18n label + subtitle');
// The existing five must remain.
['demo','new','load','editor','resume'].forEach(function (i) {
    ok(new RegExp('data-intent="' + i + '"').test(homeHtml), 'existing launch entry kept: ' + i);
});
// New buttons live inside the same launch group as the originals (before hub-notify).
const launchBlock = homeHtml.slice(0, homeHtml.indexOf('id="hub-notify"'));
ok(/data-intent="import-geojson"/.test(launchBlock) && /data-intent="import-docx"/.test(launchBlock),
   'new buttons are inside the Command Launch action group');

console.log('\n── home.js: i18n strings (EN + AR) ──');
['hub-import-geojson','hub-import-geojson-sub','hub-import-docx','hub-import-docx-sub'].forEach(function (k) {
    const count = (homeJs.match(new RegExp("'" + k + "'", 'g')) || []).length;
    ok(count >= 2, 'i18n key defined in both EN and AR: ' + k, 'found ' + count + ' occurrences');
});
ok(/else\s*\{\s*go\(intent\);\s*\}/.test(homeJs), 'unknown intents fall through to go(intent) → app.html?launch=<intent>');

console.log('\n── native-scenario-loader.js: reveal-only dispatch (no mutation, no dup) ──');
ok(/intent === 'import-geojson'.*revealImportCard\('wg-geojson-import-card'/s.test(loader),
   'import-geojson dispatches to revealImportCard(wg-geojson-import-card)');
ok(/intent === 'import-docx'.*revealImportCard\('wg-sim-import-card'/s.test(loader),
   'import-docx dispatches to revealImportCard(wg-sim-import-card)');
ok(/function revealImportCard/.test(loader), 'revealImportCard helper defined');

// Isolate the revealImportCard body and prove it does NOT import or mutate.
const m = loader.match(/function revealImportCard[\s\S]*?\n    \}/);
const body = m ? m[0] : '';
ok(body.length > 0, 'revealImportCard body located');
ok(!/loadLiveScenarioFromJson/.test(body), 'reveal does NOT call loadLiveScenarioFromJson (no scenario mutation)');
ok(!/buildScenarioFromGeoJson|\/api\/scenario\/import/.test(body), 'reveal does NOT invoke the importer (no duplicate import)');
ok(/switchTool\('scenario-workspace'\)/.test(body) && /scrollIntoView/.test(body), 'reveal opens the workspace panel + scrolls the card into view');

console.log('\n══════════════════════════════════════════');
console.log('  FAST-INT-3 — Passed: ' + pass + '  |  Failed: ' + fail);
console.log('══════════════════════════════════════════');
console.log('  Verdict: ' + (fail === 0 ? 'PASS' : 'FAIL'));
process.exit(fail === 0 ? 0 : 1);
