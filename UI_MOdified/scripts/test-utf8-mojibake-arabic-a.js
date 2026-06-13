#!/usr/bin/env node
/*
 * UTF8-MOJIBAKE-ARABIC-FIX-A
 *
 * Root cause: doc-understanding-review.js (whole file) + home.js (2 lines) were
 * re-saved as UTF-8-read-as-Windows-1252 at commit 13cceef, double-encoding every
 * Arabic literal + em-dash (e.g. "AI understood this as â€” ÙÙ‡Ù……"). Fixed by
 * reversing the mojibake back to correct UTF-8 Arabic. The runtime data path
 * (file.text() → JSON.parse → clone → fetch) was always UTF-8-clean.
 *
 * Guards: no mojibake literals in source · the reported label is correct Arabic ·
 * imported Arabic JSON survives the client data path · no encode/decode helper
 * corrupts Arabic · app.html has UTF-8 charset · JSON import reads UTF-8.
 */
'use strict';

var path = require('path');
var fs = require('fs');
var CLIENT = path.join(__dirname, '..', 'client');
function read(p) { return fs.readFileSync(path.join(CLIENT, p), 'utf8'); }

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}

console.log('UTF8-MOJIBAKE-ARABIC-FIX-A');

// Unambiguous Arabic/em-dash mojibake bigrams (UTF-8 read as cp1252/latin1).
// These appear ONLY in corrupted Arabic — safe to assert their absence.
var MOJIBAKE = /â€"|Ø§Ù„|Ù‚Ùˆ|ÙÙ‡|Ø¹Ù|Ø§Ù„Ù‚|Ã˜Â|Ã™Â/;

// ── 1. No mojibake literals remain in the affected/likely source files ──
[
    'shell/doc-understanding-review.js',
    'home.js',
    'shell/base-status-panel.js',
    'shell/scenario-import-wizard.js',
    'shell/scenario-workspace.js',
    'i18n.js',
].forEach(function (f) {
    ok('no mojibake literals in ' + f, !MOJIBAKE.test(read(f)));
});

// ── 2. The reported label + sample Arabic are correct UTF-8 ──
var dur = read('shell/doc-understanding-review.js');
ok('reported label is correct: "AI understood this as — فهم الذكاء الاصطناعي"',
    dur.indexOf('AI understood this as — فهم الذكاء الاصطناعي') !== -1);
ok('Enemy Bases label correct ("قواعد العدو")', dur.indexOf('قواعد العدو') !== -1);
ok('Generate button label correct ("توليد السيناريو")', dur.indexOf('توليد السيناريو') !== -1);
var home = read('home.js');
ok('home.js Blue Force name_ar correct ("القوات الزرقاء")', home.indexOf('القوات الزرقاء') !== -1);
ok('home.js Red Force name_ar correct ("القوات الحمراء")', home.indexOf('القوات الحمراء') !== -1);

// ── 3. Imported Arabic JSON survives the client data path (parse → clone → post) ──
var raw = { countries: [{ name: 'إيران', country_key: 'iran',
    air_bases: [{ name_ar: 'قاعدة بندر عباس الجوية', name_en: 'Bandar Abbas AB',
        units: [{ platform: 'إف-14 توم كات', type_ar: 'مقاتلة', estimated_count: 24 }] }] }] };
var text = JSON.stringify(raw);                 // file.text()
var parsed = JSON.parse(text);                  // JSON.parse(text)
var body = JSON.parse(JSON.stringify(parsed));  // wizard's analyzeBody clone before POST
ok('Arabic country name survives data path', body.countries[0].name === 'إيران');
ok('Arabic base name survives data path', body.countries[0].air_bases[0].name_ar === 'قاعدة بندر عباس الجوية');
ok('Arabic unit name survives data path', body.countries[0].air_bases[0].units[0].platform === 'إف-14 توم كات');
ok('serialized payload has real Arabic, no \\u / mojibake', /قاعدة/.test(JSON.stringify(body)) && !MOJIBAKE.test(JSON.stringify(body)) && !/\\u0/.test(JSON.stringify(body)));

// ── 4. No encode/decode helper corrupts Arabic in the import path ──
var wiz = read('shell/scenario-import-wizard.js');
ok('JSON import reads UTF-8 via file.text() (not escape/atob/latin1)',
    /file\.text\(\)/.test(wiz) && !/\b(escape|unescape)\s*\(/.test(wiz) && !/atob\(|btoa\(|'latin1'|"latin1"|'binary'/.test(wiz));

// ── 5. app.html declares UTF-8 charset ──
var html = read('app.html');
ok('app.html has <meta charset="UTF-8">', /<meta\s+charset=["']?utf-8["']?\s*\/?>/i.test(html));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
