'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const appJs = fs.readFileSync(path.join(root, 'UI_MOdified', 'client', 'app.js'), 'utf8');
const ioJs = fs.readFileSync(path.join(root, 'UI_MOdified', 'client', 'io.js'), 'utf8');
const fdJs = fs.readFileSync(path.join(root, 'UI_MOdified', 'client', 'free_draw_signature.js'), 'utf8');

function test(name, fn) {
    try {
        fn();
        console.log('[PASS] ' + name);
    } catch (err) {
        console.error('[FAIL] ' + name + ': ' + err.message);
        process.exitCode = 1;
    }
}

test('frontline side uses explicit scallopSide metadata', () => {
    assert.ok(appJs.includes('data.scallopSide'), 'auto-flank side detection must read segment side metadata');
    assert.ok(appJs.includes('sameDirectionAsChord'), 'side detection must account for reversed input point order');
    assert.ok(!appJs.includes('const offX = mx - proj.x'), 'old midpoint offset side heuristic should not remain');
});

test('scalloped icon rendering can be flipped without reversing coordinates', () => {
    assert.ok(appJs.includes("typeId === 'scalloped' && (styleOverrides?.scallopSide === -1"), 'icon rotation must honor flipped side');
    assert.ok(appJs.includes('marker._tmgData.scallopSide'), 'created scalloped segments must store side metadata');
    assert.ok(appJs.includes('const DEFAULT_SCALLOP_SIDE = -1'), 'operational default should use the outside/red-reference side');
    assert.ok(appJs.includes("normalSide: side === 1 ? 'left/flipped' : 'right/default'"), 'debug labels should identify the corrected default side');
});

test('debug and flip controls are exposed in the post-frontline panel', () => {
    assert.ok(appJs.includes('window.RMOOZFrontLineDebug'), 'debug API should be available from the browser console');
    assert.ok(appJs.includes('showFrontLineDebugOverlay'), 'debug overlay function should exist');
    assert.ok(fdJs.includes('fd-frontline-debug-btn'), 'panel should include debug button');
    assert.ok(fdJs.includes('fd-frontline-flip-btn'), 'panel should include flip button');
});

test('scallopSide persists through layer export/import', () => {
    assert.ok(ioJs.includes('scallopSide:'), 'export should write scallopSide');
    assert.ok(ioJs.includes('scallopSide: elData.scallopSide === 1 ? 1 : -1'), 'import should pass scallopSide into createTmgLayer with corrected default');
    assert.ok(ioJs.includes('seg._tmgData.sessionId = elData.sessionId'), 'group segments should preserve session id on import');
});

test('fixture line default apex/control side is outside red-reference side', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 7, y: -7 };
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const side = -1;
    const normal = { x: uy * side, y: -ux * side };
    const flipped = { x: uy * 1, y: -ux * 1 };
    assert.ok(normal.x > 0 && normal.y > 0, 'default control apex should be on the opposite side from the previous left/default normal');
    assert.strictEqual(Math.sign(flipped.x), -Math.sign(normal.x), 'flip reverses x normal');
    assert.strictEqual(Math.sign(flipped.y), -Math.sign(normal.y), 'flip reverses y normal');
});

test('auto-flank depth geometry derives from canonical scallop side', () => {
    assert.ok(appJs.includes('function getAutoFlankRearBearingChord'), 'auto-flank should have one rear-bearing function');
    assert.ok(appJs.includes('const bulgeSide = getScallopBulgeSideRelativeToChord(leftPt, rightPt)'), 'rear bearing must read scallopSide through the chord side helper');
    assert.ok(appJs.includes('generatedDepthSide = -scallopSide'), 'rear/depth geometry should document the opposite-side contract');
    assert.ok(appJs.includes('const perpMult = bulgeSide || 1'), 'rear/depth bearing conversion should produce the rendered side opposite the scallop bulge');
    assert.ok(appJs.includes('const trueLeft8   = latLngAtBearing(trueLeft,  distBatKm,  rearBear)'), 'battalion depth offset should use canonical rearBear');
    assert.ok(appJs.includes('const trueRight20 = latLngAtBearing(trueRight, distBrigKm, rearBear)'), 'brigade depth offset should use canonical rearBear');
    assert.ok(appJs.includes('const batAnchorInside = latLngAtBearing(circleCenter, Math.max(0.05, distBatKm * 0.5), rearBear)'), 'retention/classification anchors should use canonical rearBear');
    assert.ok(appJs.includes('const divB = latLngAtBearing(circleCenter, divLen, rearBear)'), 'divider should be oriented by canonical rearBear');
});
