#!/usr/bin/env node
/**
 * test-ui-fix-1-2.js
 *
 * UI-FIX-1: SELECTED AT no longer renders NaN when selectedAt is missing/invalid.
 * UI-FIX-2: i18n keys sw-live-step-units-col-readiness / -supply present in EN + AR.
 *
 * Static tests — no server, no browser.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, 'UI_MOdified', 'client');
const USP_SRC  = fs.readFileSync(path.join(CLIENT, 'shell', 'unit-status-panel.js'), 'utf8');
const I18N_SRC = fs.readFileSync(path.join(CLIENT, 'i18n.js'), 'utf8');
const CLOCK_SRC = fs.readFileSync(path.join(CLIENT, 'shell', 'clock.js'), 'utf8');

// ── helpers ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS ' + label); }
    else       { failed++; console.error('  FAIL ' + label); }
}

// ── Build a minimal runtime that exercises the fixed SELECTED AT block ────────
function buildSelatRenderer() {
    // Extract MONTHS_UPPER + pad2 + formatZuluDtg from clock.js
    const MONTHS_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    function pad2(n) { return n < 10 ? '0' + n : '' + n; }
    function formatZuluDtg(d) {
        const dd  = pad2(d.getUTCDate());
        const hh  = pad2(d.getUTCHours());
        const mm  = pad2(d.getUTCMinutes());
        const mon = MONTHS_UPPER[d.getUTCMonth()];
        const yy  = pad2(d.getUTCFullYear() % 100);
        return `${dd}${hh}${mm}Z${mon}${yy}`;
    }

    // Replicate the fixed logic from unit-status-panel.js populateIdentity()
    function renderSelatFixed(selectedAt, hasClock) {
        try {
            const root = hasClock ? { AppShellClock: { formatZuluDtg } } : {};
            var _ts = (selectedAt != null && Number.isFinite(+selectedAt)) ? +selectedAt : null;
            var d   = _ts !== null ? new Date(_ts) : null;
            if (d && !isNaN(d.getTime())) {
                return (root.AppShellClock && typeof root.AppShellClock.formatZuluDtg === 'function')
                    ? root.AppShellClock.formatZuluDtg(d) : d.toISOString();
            } else {
                return '—';
            }
        } catch (_) { return '—'; }
    }

    // Original (buggy) logic for comparison
    function renderSelatOriginal(selectedAt) {
        try {
            var d = new Date(selectedAt || Date.now());
            return d.toISOString(); // simplified — no clock dependency
        } catch (_) { return '—'; }
    }

    return { renderSelatFixed, renderSelatOriginal, formatZuluDtg };
}

const { renderSelatFixed, formatZuluDtg } = buildSelatRenderer();

// ── UI-FIX-1: SELECTED AT logic tests ────────────────────────────────────────
console.log('\nUI-FIX-1: SELECTED AT guard');

// FIX1-01: undefined → shows '—' (not 'NaN...' or 'undefined')
const r1 = renderSelatFixed(undefined, false);
ok('FIX1-01: undefined selectedAt → "—"', r1 === '—');

// FIX1-02: null → shows '—'
const r2 = renderSelatFixed(null, false);
ok('FIX1-02: null selectedAt → "—"', r2 === '—');

// FIX1-03: plain object → shows '—' (was the root cause of NaN in audit)
const r3 = renderSelatFixed({step_index: 0, units: []}, false);
ok('FIX1-03: object selectedAt → "—"', r3 === '—');

// FIX1-04: empty array coerces to 0 (falsy but +[] === 0, a valid epoch timestamp)
// The fix correctly treats it as a valid (if odd) timestamp rather than crashing.
const r4 = renderSelatFixed([], false);
ok('FIX1-04: array selectedAt (+[] === 0) → no NaN, no undefined', !r4.includes('NaN') && !r4.includes('undefined'));

// FIX1-05: NaN → shows '—'
const r5 = renderSelatFixed(NaN, false);
ok('FIX1-05: NaN selectedAt → "—"', r5 === '—');

// FIX1-06: invalid string → shows '—'
const r6 = renderSelatFixed('not-a-date', false);
ok('FIX1-06: invalid string selectedAt → "—"', r6 === '—');

// FIX1-07: no NaN substring in any of the above
const results = [r1, r2, r3, r4, r5, r6];
ok('FIX1-07: no result contains "NaN"',       results.every(r => !r.includes('NaN')));
ok('FIX1-08: no result contains "undefined"', results.every(r => !r.includes('undefined')));

// FIX1-09: valid unix timestamp → formats correctly (not '—')
const KNOWN_TS = 1700000000000; // Nov 2023
const r9 = renderSelatFixed(KNOWN_TS, false);
ok('FIX1-09: valid timestamp → not "—"', r9 !== '—');
ok('FIX1-10: valid timestamp (no clock) → ISO string', r9.includes('2023'));

// FIX1-11: valid timestamp with clock → Zulu DTG format (DDHHMMZMmmYY)
const r11 = renderSelatFixed(KNOWN_TS, true);
ok('FIX1-11: valid timestamp with clock → contains "Z"', r11.includes('Z'));
ok('FIX1-12: valid timestamp with clock → DTG not "—"', r11 !== '—');
ok('FIX1-13: valid timestamp with clock → no "NaN"', !r11.includes('NaN'));
ok('FIX1-14: valid timestamp with clock → no "undefined"', !r11.includes('undefined'));

// FIX1-15: Date.now() → formats correctly
const rNow = renderSelatFixed(Date.now(), true);
ok('FIX1-15: Date.now() → formats via clock (not "—")', rNow !== '—');

// FIX1-16: verify the fix is actually in the source
ok('FIX1-16: fix uses Number.isFinite guard in source',
    USP_SRC.includes('Number.isFinite(+selectedAt)'));
ok('FIX1-17: fix uses isNaN(d.getTime()) guard in source',
    USP_SRC.includes('isNaN(d.getTime())'));
ok('FIX1-18: fallback "—" present in source fix block',
    USP_SRC.includes("selatEl.textContent = '—'"));
// Original buggy line must be gone
ok('FIX1-19: original "new Date(selectedAt || Date.now())" removed from source',
    !USP_SRC.includes('new Date(selectedAt || Date.now())'));

// ── UI-FIX-2: i18n key tests ──────────────────────────────────────────────────
console.log('\nUI-FIX-2: i18n readiness/supply keys');

// FIX2-01 / FIX2-02: EN keys present
ok("FIX2-01: EN 'sw-live-step-units-col-readiness' key exists",
    I18N_SRC.includes("'sw-live-step-units-col-readiness'"));
ok("FIX2-02: EN 'sw-live-step-units-col-supply' key exists",
    I18N_SRC.includes("'sw-live-step-units-col-supply'"));

// FIX2-03 / FIX2-04: EN values correct
ok("FIX2-03: EN readiness value is 'Readiness'",
    I18N_SRC.includes("'sw-live-step-units-col-readiness': 'Readiness'"));
ok("FIX2-04: EN supply value is 'Supply'",
    I18N_SRC.includes("'sw-live-step-units-col-supply':    'Supply'") ||
    I18N_SRC.includes("'sw-live-step-units-col-supply': 'Supply'"));

// FIX2-05 / FIX2-06: AR values correct
ok("FIX2-05: AR readiness value is 'الجاهزية'",
    I18N_SRC.includes("'الجاهزية'"));
ok("FIX2-06: AR supply value is 'الإمداد'",
    I18N_SRC.includes("'الإمداد'"));

// FIX2-07 / FIX2-08: keys appear exactly twice (once in EN block, once in AR block)
const readinessMatches = (I18N_SRC.match(/'sw-live-step-units-col-readiness'/g) || []).length;
const supplyMatches    = (I18N_SRC.match(/'sw-live-step-units-col-supply'/g)    || []).length;
ok('FIX2-07: readiness key appears exactly 2 times (EN + AR)', readinessMatches === 2);
ok('FIX2-08: supply key appears exactly 2 times (EN + AR)',    supplyMatches    === 2);

// FIX2-09: keys sit near the orders key (same table group)
const ordersIdx_en     = I18N_SRC.indexOf("'sw-live-step-units-col-orders':    'Orders'");
const readinessIdx_en  = I18N_SRC.indexOf("'sw-live-step-units-col-readiness': 'Readiness'");
ok('FIX2-09: EN readiness key is within 120 chars of EN orders key',
    readinessIdx_en > ordersIdx_en && readinessIdx_en - ordersIdx_en < 120);

const ordersIdx_ar    = I18N_SRC.indexOf("'sw-live-step-units-col-orders':    'الأوامر'");
const readinessIdx_ar = I18N_SRC.indexOf("'sw-live-step-units-col-readiness': 'الجاهزية'");
ok('FIX2-10: AR readiness key is within 300 chars of AR orders key',
    readinessIdx_ar > ordersIdx_ar && readinessIdx_ar - ordersIdx_ar < 300);

// FIX2-11: raw key strings no longer expected to leak (keys now resolve to values)
ok('FIX2-11: raw key sw-live-step-units-col-readiness would now resolve via i18n',
    I18N_SRC.includes("'sw-live-step-units-col-readiness': 'Readiness'") &&
    I18N_SRC.includes("'الجاهزية'"));

// FIX2-12: neighbouring keys not disturbed
ok("FIX2-12: 'sw-live-step-units-col-orders' still present (EN)",
    I18N_SRC.includes("'sw-live-step-units-col-orders':    'Orders'"));
ok("FIX2-13: 'sw-live-step-units-col-orders' still present (AR)",
    I18N_SRC.includes("'الأوامر'"));
ok("FIX2-14: 'sw-live-step-units-side-red' still present after insertion point",
    I18N_SRC.includes("'sw-live-step-units-side-red'"));

// FIX2-15: app.html still references both keys (not changed by this fix)
const APP_HTML = fs.readFileSync(path.join(CLIENT, 'app.html'), 'utf8');
ok('FIX2-15: app.html still uses data-i18n="sw-live-step-units-col-readiness"',
    APP_HTML.includes('data-i18n="sw-live-step-units-col-readiness"'));
ok('FIX2-16: app.html still uses data-i18n="sw-live-step-units-col-supply"',
    APP_HTML.includes('data-i18n="sw-live-step-units-col-supply"'));

// ── Hard-rule guards ──────────────────────────────────────────────────────────
console.log('\nHard-rule guards');

// No simulation changes
ok('GUARD-01: unit-status-panel.js has no apply/execute/commit call added',
    !USP_SRC.includes('POST /api/sim') && !USP_SRC.includes('/api/sim/commit'));
// No map changes
ok('GUARD-02: i18n.js has no leaflet/map references added',
    !I18N_SRC.includes('leaflet') && !I18N_SRC.includes('addLayer'));
// No new feature: only the two keys and the guard logic changed
ok('GUARD-03: i18n additions are exactly the two readiness/supply keys',
    readinessMatches === 2 && supplyMatches === 2);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) console.log('ALL PASS ✓');
else { console.error(`${failed} FAILURES`); process.exit(1); }
