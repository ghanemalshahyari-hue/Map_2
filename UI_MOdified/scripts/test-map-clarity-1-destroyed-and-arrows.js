#!/usr/bin/env node
'use strict';
/**
 * MAP-CLARITY-1 — destroyed-unit visibility + restored vector readability.
 *
 * Part A: generic destroyed-state resolver (data-shape, not scenario-name).
 * Part B: restored older/clearer engagement-axis arrow dimensions.
 *
 * The renderer lives inside a browser IIFE (uses window.L), so the resolver
 * logic is replicated here and asserted, and the rendering edits are verified
 * by source assertions — the same pattern the other suites in this repo use.
 *
 * Run:  node scripts/test-map-clarity-1-destroyed-and-arrows.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'client', 'wargame', 'adjudicator-map.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  PASS', name); passed++; }
    catch (e) { console.error('  FAIL', name, '—', e.message); failed++; }
}

// ── Replicated resolver (mirrors attritionStatusOf / isDestroyedStatusChange) ──
const KILL_WORDS = ['destroy', 'killed', 'sunk', 'eliminat', 'neutraliz'];
function isDestroyedStatusChange(sc) {
    if (!sc || typeof sc !== 'string') return false;
    const s = sc.toLowerCase();
    if (s === 'unchanged') return false;
    return KILL_WORDS.some(w => s.indexOf(w) !== -1);
}
function attritionStatusOf(sc) {
    if (!sc || typeof sc !== 'string') return null;
    const s = sc.toLowerCase();
    if (s === 'unchanged') return null;
    if (isDestroyedStatusChange(s)) return 'destroyed';
    return 'degraded';
}
// Mirrors the in-app resolveUnitDestroyedState (generic per-unit destroyed).
function resolveUnitDestroyedState(u) {
    if (!u || typeof u !== 'object') return false;
    if (u.destroyed === true) return true;
    if (isDestroyedStatusChange(u.status)) return true;
    if (isDestroyedStatusChange(u.state)) return true;
    if (isDestroyedStatusChange(u.status_change)) return true;
    if (typeof u.strength === 'number' && u.strength <= 0) return true;
    if (typeof u.current_strength === 'number' && u.current_strength <= 0) return true;
    return false;
}

console.log('\nMAP-CLARITY-1 — Part A: generic destroyed resolver');

// 1–3 + synonyms: any existing "kill" vocabulary → destroyed.
test('1. status "destroyed" → destroyed', () => assert.strictEqual(attritionStatusOf('destroyed'), 'destroyed'));
test('2. status "killed" → destroyed',    () => assert.strictEqual(attritionStatusOf('killed'), 'destroyed'));
test('3. status "sunk" → destroyed',      () => assert.strictEqual(attritionStatusOf('sunk'), 'destroyed'));
test('4. status "eliminated" → destroyed (newly recognized)', () => assert.strictEqual(attritionStatusOf('eliminated'), 'destroyed'));
test('5. status "neutralized" → destroyed (newly recognized)', () => assert.strictEqual(attritionStatusOf('neutralized'), 'destroyed'));
test('6. status "destroyed_total" (substring) → destroyed', () => assert.strictEqual(attritionStatusOf('destroyed_total'), 'destroyed'));

// Non-kill / non-destroyed inputs.
test('7. status "damaged_partial" → degraded (not destroyed)', () => assert.strictEqual(attritionStatusOf('damaged_partial'), 'degraded'));
test('8. status "suppressed" → degraded', () => assert.strictEqual(attritionStatusOf('suppressed'), 'degraded'));
test('9. status "unchanged" → no change (null)', () => assert.strictEqual(attritionStatusOf('unchanged'), null));
test('10. missing/empty status → no change (null)', () => {
    assert.strictEqual(attritionStatusOf(''), null);
    assert.strictEqual(attritionStatusOf(null), null);
    assert.strictEqual(attritionStatusOf(undefined), null);
});
test('11. isDestroyedStatusChange is generic (no scenario/unit names)', () => {
    assert.ok(isDestroyedStatusChange('SUNK') && isDestroyedStatusChange('Eliminated'));
    assert.ok(!isDestroyedStatusChange('unchanged') && !isDestroyedStatusChange(''));
});

// Replica of buildDestroyedIcon (composes the kill-X into the icon HTML) using a
// fake L.divIcon that just records options — verifies the COMPOSITION behaviour.
const _DESTROYED_X_SVG_REPLICA =
    '<svg class="wg-adj-x" viewBox="0 0 100 100" preserveAspectRatio="none" ' +
    'style="position:absolute;top:-15%;left:-15%;width:130%;height:130%;display:block;overflow:visible;pointer-events:none;z-index:1000;">' +
    '<line x1="0" y1="0" x2="100" y2="100" stroke="#ffffff" stroke-width="16" stroke-linecap="round" opacity="0.9"/>' +
    '</svg>';
const fakeL = {
    divIcon: function (opts) { return { __divIcon: true, options: opts }; },
};
function buildDestroyedIconReplica(baseIcon) {
    if (!baseIcon || !baseIcon.options) return null;
    const o = baseIcon.options;
    const size = Array.isArray(o.iconSize) ? o.iconSize : [24, 24];
    const anchor = Array.isArray(o.iconAnchor) ? o.iconAnchor : [size[0] / 2, size[1] / 2];
    const baseHtml = o.html || '';
    const html =
        '<div class="wg-destroyed" style="position:relative;width:' + size[0] + 'px;height:' + size[1] + 'px;">' +
            '<div style="position:absolute;inset:0;width:100%;height:100%;filter:grayscale(1) brightness(0.85);opacity:0.85;">' + baseHtml + '</div>' +
            _DESTROYED_X_SVG_REPLICA +
        '</div>';
    return fakeL.divIcon({ html: html, className: ((o.className || '') + ' wg-destroyed-icon').trim(), iconSize: size, iconAnchor: anchor });
}

console.log('\nMAP-CLARITY-1 — Part A: destroyed X composed into the marker icon HTML');

const baseActive = { options: { html: '<svg class="wg-adj-sidc" width="30" height="30"></svg>', className: 'units-map-marker wg-adj-sidc', iconSize: [30, 30], iconAnchor: [15, 15] } };

test('M1. destroyed icon HTML contains a visible X overlay', () => {
    const di = buildDestroyedIconReplica(baseActive);
    assert.ok(di && /class="wg-adj-x"/.test(di.options.html), 'composed icon must embed the wg-adj-x overlay');
    assert.ok(/stroke-width="16"/.test(di.options.html), 'X halo must be bold');
});
test('M2. destroyed icon keeps the SAME base icon size as active', () => {
    const di = buildDestroyedIconReplica(baseActive);
    assert.deepStrictEqual(di.options.iconSize, baseActive.options.iconSize, 'iconSize must be unchanged');
    assert.deepStrictEqual(di.options.iconAnchor, baseActive.options.iconAnchor, 'anchor must be unchanged');
});
test('M3. active (base) icon HTML has NO X overlay', () => {
    assert.ok(!/wg-adj-x/.test(baseActive.options.html), 'active icon must not contain the kill-X');
});
test('M4. destroyed icon embeds the base symbol (same SIDC svg)', () => {
    const di = buildDestroyedIconReplica(baseActive);
    assert.ok(di.options.html.indexOf(baseActive.options.html) !== -1, 'base symbol must be retained in the destroyed icon');
});
test('M5. renderMarkerByStatus(DESTROYED) rebuilds the icon via setIcon (not just internal state)', () => {
    // markUnitAsDestroyed must compose + setIcon; the destroyed branch must call it.
    const mk = SRC.indexOf('function markUnitAsDestroyed');
    const b = SRC.slice(mk, mk + 900);
    assert.ok(/buildDestroyedIcon\(marker\._baseIcon\)/.test(b), 'markUnitAsDestroyed must build the composed icon');
    assert.ok(/marker\.setIcon\(di\)/.test(b), 'markUnitAsDestroyed must setIcon (rebuild the marker icon)');
    assert.ok(SRC.includes('markUnitAsDestroyed(marker);'), 'renderMarkerByStatus must call markUnitAsDestroyed');
});
test('M6. base icon captured at marker creation (both sides)', () => {
    assert.ok((SRC.match(/m\._baseIcon = icon;/g) || []).length >= 2,
        'both red and blue marker creation must capture _baseIcon');
});
test('M7. buildDestroyedIcon uses the base iconSize (no resize) in source', () => {
    const i = SRC.indexOf('function buildDestroyedIcon');
    const b = SRC.slice(i, i + 1200);
    assert.ok(/iconSize:\s*size/.test(b), 'composed icon must reuse the base size');
    assert.ok(/grayscale\(1\)/.test(b), 'base symbol must be grayed (still visible)');
});

console.log('\nMAP-CLARITY-1 — Part A: generic identity + icon wrapper + path unification');

// Replica of getUnitIdentity (uid normalization across producer shapes).
function getUnitIdentity(u) {
    if (u == null) return null;
    if (typeof u === 'string') return u;
    return u.uid || u.unit_uid || u.id || u.unitId || u.target_uid || u.actor_uid || null;
}
test('N1. getUnitIdentity normalizes uid / unit_uid / id / unitId', () => {
    assert.strictEqual(getUnitIdentity({ uid: 'R-1' }), 'R-1');
    assert.strictEqual(getUnitIdentity({ unit_uid: 'B-1' }), 'B-1');
    assert.strictEqual(getUnitIdentity({ id: 'X-1' }), 'X-1');
    assert.strictEqual(getUnitIdentity({ unitId: 'Y-1' }), 'Y-1');
    assert.strictEqual(getUnitIdentity('Z-1'), 'Z-1');
    assert.strictEqual(getUnitIdentity(null), null);
});
test('N2. getUnitIdentity present + wired in source', () => {
    assert.ok(/function getUnitIdentity/.test(SRC), 'getUnitIdentity missing');
});

// buildUnitMarkerIcon behaviour across base icon types (SIDC / diamond / square).
const DESTROYED = 'destroyed', ACTIVE = 'active';
function buildUnitMarkerIconReplica(baseIcon, status) {
    return status === DESTROYED ? buildDestroyedIconReplica(baseIcon) : baseIcon;
}
const baseSIDC   = { options: { html: '<svg class="wg-adj-sidc"></svg>', className: 'wg-adj-sidc', iconSize: [30, 30], iconAnchor: [15, 15] } };
const baseDiamond= { options: { html: '<div class="diamond"></div>', className: 'wg-adj-diamond', iconSize: [18, 18], iconAnchor: [9, 9] } };
const baseSquare = { options: { html: '<div class="square"></div>', className: 'wg-adj-square', iconSize: [14, 14], iconAnchor: [7, 7] } };

['SIDC', 'diamond', 'square'].forEach((kind, idx) => {
    const base = [baseSIDC, baseDiamond, baseSquare][idx];
    test(`N3.${idx + 1} ${kind} base icon → destroyed icon embeds X at same size`, () => {
        const di = buildUnitMarkerIconReplica(base, DESTROYED);
        assert.ok(/class="wg-adj-x"/.test(di.options.html), kind + ' destroyed must embed X');
        assert.deepStrictEqual(di.options.iconSize, base.options.iconSize, kind + ' size must be unchanged');
        assert.ok(di.options.html.indexOf(base.options.html) !== -1, kind + ' base symbol retained');
    });
});
test('N4. buildUnitMarkerIcon(ACTIVE) returns the base icon unchanged (no X)', () => {
    assert.strictEqual(buildUnitMarkerIconReplica(baseSIDC, ACTIVE), baseSIDC);
    assert.ok(!/wg-adj-x/.test(baseSIDC.options.html));
    assert.ok(/function buildUnitMarkerIcon/.test(SRC), 'buildUnitMarkerIcon missing in source');
});
test('N5. refreshAllMarkerStatuses merges scenario-step destroyed with the registry', () => {
    const i = SRC.indexOf('function refreshAllMarkerStatuses');
    const b = SRC.slice(i, i + 1100);
    assert.ok(/computeStepAttrition\(scenarioRef, lastRenderStepIndex\)/.test(b),
        'must consult the current scenario step');
    assert.ok(/stepStatus\.get\(uid\) === UNIT_STATUS\.DESTROYED/.test(b),
        'must merge step destroyed into the rendered status');
});
test('N6. red death pipeline routes through registry + refresh (no direct X graying)', () => {
    const i = SRC.indexOf('function scheduleRedDestructions');
    const b = SRC.slice(i, i + 1600);
    assert.ok(/isDestroyedStatusChange\(a\.status_change\)/.test(b), 'must use the generic kill resolver');
    assert.ok(/refreshAllMarkerStatuses\(\)/.test(b), 'must refresh via the shared status pass');
    assert.ok(!/grayscale\(100%\) brightness\(0\.35\)/.test(b), 'must NOT gray the marker element (would gray the X)');
});
test('N7. no [DBG] console.log left in the renderer (clean console)', () => {
    assert.ok(!/\[DBG\]/.test(SRC), 'leftover [DBG] console.logs must be removed');
});

console.log('\nMAP-CLARITY-1 — Part A: generic per-unit destroyed resolver');

test('G1. unit.destroyed === true → destroyed overlay', () => {
    assert.strictEqual(resolveUnitDestroyedState({ destroyed: true }), true);
});
test('G2. unit.status === "destroyed" → destroyed overlay', () => {
    assert.strictEqual(resolveUnitDestroyedState({ status: 'destroyed' }), true);
});
test('G3. unit.state === "destroyed" → destroyed overlay', () => {
    assert.strictEqual(resolveUnitDestroyedState({ state: 'destroyed' }), true);
});
test('G4. unit.status_change === "sunk" → destroyed overlay', () => {
    assert.strictEqual(resolveUnitDestroyedState({ status_change: 'sunk' }), true);
});
test('G5. status_change killed/eliminated → destroyed overlay', () => {
    assert.ok(resolveUnitDestroyedState({ status_change: 'killed' }));
    assert.ok(resolveUnitDestroyedState({ status_change: 'eliminated' }));
});
test('G6. strength<=0 / current_strength<=0 → destroyed overlay', () => {
    assert.ok(resolveUnitDestroyedState({ strength: 0 }));
    assert.ok(resolveUnitDestroyedState({ current_strength: 0 }));
});
test('G7. ACTIVE unit → NO destroyed overlay', () => {
    assert.strictEqual(resolveUnitDestroyedState({ status: 'active', strength: 1.0 }), false);
    assert.strictEqual(resolveUnitDestroyedState({ status_change: 'damaged_partial' }), false);
    assert.strictEqual(resolveUnitDestroyedState({}), false);
    assert.strictEqual(resolveUnitDestroyedState(null), false);
});
test('G8. resolver is wired into registration + per-step + gating (source)', () => {
    // Static unit flag → registry status at registration (both sides).
    const reg = SRC.indexOf('function registerBlueUnit');
    assert.ok(/resolveUnitDestroyedState\(unit\)\s*\?\s*UNIT_STATUS\.DESTROYED/.test(SRC.slice(reg, reg + 700)),
        'registerBlueUnit must derive destroyed from the unit object');
    const regR = SRC.indexOf('function registerRedUnit');
    assert.ok(/resolveUnitDestroyedState\(unit\)\s*\?\s*UNIT_STATUS\.DESTROYED/.test(SRC.slice(regR, regR + 1100)),
        'registerRedUnit must derive destroyed from the unit object');
    // Per-step unit_state consumed in computeStepAttrition.
    const cs = SRC.indexOf('function computeStepAttrition');
    assert.ok(/resolveUnitDestroyedState\(us\[uid\]\)/.test(SRC.slice(cs, cs + 2600)),
        'computeStepAttrition must consume per-step unit_state');
    // Gating includes unit_state so unit_state-only scenarios still render.
    const sh = SRC.indexOf('function scenarioHasAttritionData');
    assert.ok(/unit_state/.test(SRC.slice(sh, sh + 500)),
        'scenarioHasAttritionData must include unit_state');
});

console.log('\nMAP-CLARITY-1 — Part A: real attrition path (wargame3 data)');

test('G9. wargame3.json still drives the real affected/arc attrition path', () => {
    const p = path.join(__dirname, '..', 'data', 'scenarios', 'wargame3.json');
    if (!fs.existsSync(p)) { console.log('     (skip — wargame3.json not present)'); return; }
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const steps = Array.isArray(d.steps) ? d.steps : [];
    const aff = steps.reduce((n, s) => n + ((s.affected || []).length), 0);
    const arc = steps.reduce((n, s) => n + ((s.engagement_arcs || []).length), 0);
    assert.ok(aff > 0 || arc > 0, 'wargame3 should carry affected[]/engagement_arcs[] attrition');
    // And the renderer reads those rows.
    assert.ok(SRC.includes('row.affected') && SRC.includes('row.engagement_arcs'),
        'computeStepAttrition must read affected[]/engagement_arcs[]');
});

console.log('\nMAP-CLARITY-1 — Part A: destroyed visible above overlaps (source)');

test('12. destroyed markers lifted above overlaps (setZIndexOffset 2000)', () => {
    assert.ok(/setZIndexOffset\(2000\)/.test(SRC), 'destroyed z-index lift missing');
});
test('13. z-index reset to 0 on non-destroyed states', () => {
    assert.ok((SRC.match(/setZIndexOffset\(0\)/g) || []).length >= 2,
        'expected z-index reset in degraded + active branches');
});
test('14. destroyed marker gets a "Destroyed" title', () => {
    assert.ok(/setAttribute\(['"]title['"],\s*['"]Destroyed['"]\)/.test(SRC), 'destroyed title missing');
});
test('15. destroyed X SVG defined with wg-adj-x class + high z-index', () => {
    assert.ok(SRC.includes('_DESTROYED_X_SVG'), 'kill-X SVG constant missing');
    const i = SRC.indexOf('_DESTROYED_X_SVG =');
    const b = SRC.slice(i, i + 700);
    assert.ok(/class="wg-adj-x"/.test(b) && /z-index:1000/.test(b),
        'kill-X must carry wg-adj-x class and high z-index');
});
test('16. broadened resolver wired into attritionStatusOf', () => {
    assert.ok(SRC.includes('isDestroyedStatusChange') && SRC.includes('_KILL_WORDS'),
        'generic resolver not present in source');
});

console.log('\nMAP-CLARITY-1 — Part B: restored arrow style (source)');

test('17. engagement-axis arrow reduced for clarity (3 / 9 / 13, opacity 0.55)', () => {
    // The restored block must contain the older, clearer dimensions.
    // MAP-CLARITY-1: engagement axis is SECONDARY — slim shaft, modest head, low opacity.
    const start = SRC.indexOf('keep the engagement axis SECONDARY');
    assert.ok(start >= 0, 'engagement-axis clarity comment marker missing');
    const block = SRC.slice(start, start + 800);
    assert.ok(/bodyHalfPx:\s*3\b/.test(block), 'bodyHalfPx not reduced to 3');
    assert.ok(/headHalfPx:\s*9\b/.test(block), 'headHalfPx not reduced to 9');
    assert.ok(/headLenPx:\s*13\b/.test(block), 'headLenPx not reduced to 13');
    assert.ok(/opacity:\s*0\.55/.test(block), 'axis-arrow opacity not reduced to 0.55');
});
test('18. arrow builder is shared for RED + BLUE (no hardcoded side names)', () => {
    // drawAxisArrow is called for both redArcs and blueArcs via the same builder.
    assert.ok(/drawAxisArrow\(redArcs,/.test(SRC) && /drawAxisArrow\(blueArcs,/.test(SRC),
        'shared axis-arrow builder missing for one side');
});

console.log('\nMAP-CLARITY-1 — vector dominance reduced (units stay dominant)');

test('21. salient control band opacity reduced (not a red/purple curtain)', () => {
    const i = SRC.indexOf('control band is context');
    assert.ok(i >= 0, 'salient clarity comment missing');
    const b = SRC.slice(i, i + 700);
    assert.ok(/opacity:\s*accent\.opacity \* 0\.35/.test(b), 'salient stroke opacity not reduced');
    assert.ok(/fillOpacity:\s*accent\.fillOpacity \* 0\.5/.test(b), 'salient fill opacity not reduced');
});
test('22. movement trails are faint + sparse', () => {
    const i = SRC.indexOf('faint, sparse trails');
    assert.ok(i >= 0, 'trail clarity comment missing');
    const b = SRC.slice(i, i + 300);
    assert.ok(/opacity:\s*0\.3\b/.test(b) && /dashArray:\s*'1 9'/.test(b), 'trail not made faint/sparse');
});
test('23. destroyed X drawn ABOVE symbols (high z-index) + bold halo + z-lift', () => {
    const i = SRC.indexOf('_DESTROYED_X_SVG =');
    const b = SRC.slice(i, i + 700);
    assert.ok(/z-index:1000/.test(b), 'destroyed X z-index not raised to 1000');
    assert.ok(/stroke-width="16"/.test(b), 'destroyed X halo not bold');
    assert.ok(/setZIndexOffset\(2000\)/.test(SRC), 'destroyed marker not z-lifted over overlaps');
});
test('24. destroyed treatment does NOT change base unit size (behavioural)', () => {
    // The composed destroyed icon must reuse the base iconSize verbatim.
    const di = buildDestroyedIconReplica(baseActive);
    assert.deepStrictEqual(di.options.iconSize, baseActive.options.iconSize);
    // And buildDestroyedIcon must not hardcode a numeric iconSize array.
    const i = SRC.indexOf('function buildDestroyedIcon');
    const b = SRC.slice(i, i + 1200);
    assert.ok(!/iconSize:\s*\[\s*\d/.test(b), 'destroyed icon must not hardcode a resized iconSize');
});

console.log('\nMAP-CLARITY-1 — generic / no-retarget guards');

test('19. no hardcoded scenario id / objective coord added in new code', () => {
    // None of the new code keys off scenario name or specific coords.
    assert.ok(!/scenario\.id\s*===\s*['"]wargame3['"]/.test(SRC), 'scenario-name branch present');
    const newBits = SRC.slice(SRC.indexOf('_KILL_WORDS'), SRC.indexOf('_KILL_WORDS') + 600)
                  + SRC.slice(SRC.indexOf('keep the engagement axis SECONDARY'), SRC.indexOf('keep the engagement axis SECONDARY') + 400);
    for (const lit of ['19.55', '29.74', '20.63', '30.98', 'Brega', 'Nasser']) {
        assert.ok(newBits.indexOf(lit) === -1, `new code must not hardcode ${lit}`);
    }
});
test('20. engagement arcs stay unit-to-unit (objective only when arc explicitly targets it)', () => {
    // The axis arrow resolves endpoints via resolveEngagementArcCoordinates,
    // which reads arc.coordinates (unit positions) and ONLY substitutes the
    // objective when the arc's target is an objective ref (isObjectiveRef guard).
    // That preserves unit→unit arcs and never blanket-retargets them.
    assert.ok(/resolveEngagementArcCoordinates\(arc, sc\)/.test(SRC),
        'axis arrow must resolve endpoints via resolveEngagementArcCoordinates');
    const rs = SRC.indexOf('function resolveEngagementArcCoordinates');
    const rblock = SRC.slice(rs, rs + 600);
    assert.ok(/arc\.coordinates/.test(rblock), 'resolver must read arc.coordinates (unit positions)');
    assert.ok(/if \(isObjectiveRef\(/.test(rblock),
        'objective substitution must be guarded by isObjectiveRef (no blanket retarget)');
});

console.log('\n' + (failed ? 'FAIL' : 'PASS') +
    ` test-map-clarity-1-destroyed-and-arrows — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
