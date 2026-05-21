/**
 * FILE: symbology.js
 *
 * Sometimes you just need a single source of truth for “which tactical graphics exist and how they look
 * in the picker.” This file is that catalogue: SVG path strings, fill flags, dashed styles, and the colour
 * chips and status dropdown options the UI clones from. Favourites seed data lives here too for a clean
 * first-run experience before localStorage takes over. No logic beyond assigning window.AppSymbology — edit
 * arrays when you add or tweak symbol definitions.
 *
 * Core responsibilities:
 *   - TACTICAL_GRAPHICS: registry of TMG types (paths, previewPath, pointSymbol, strokeWidth, text, etc.)
 *   - TMG_COLOR_PRESETS, STATUS_OPTIONS for popups and symbol chrome
 *   - FALLBACK_SIDC_FAVORITES: defaults when no saved favourites exist
 *
 * Dependencies:
 *   - None (pure data); exposed as window.AppSymbology for app.js and related UI
 *
 * Bridge name: window.AppSymbology
 */
(function () {
    'use strict';

    // Tactical Mission Graphics registry.
    // viewBox 0 0 100 40 — tail left, head right.
    // bodyPath = full-width body only (no arrowhead) — must span 0–100 for proper segment connection.
    const TACTICAL_GRAPHICS = [
        { id: 'circle-x', label: 'Circle X (Obstacle)', path: 'M34,20 A14,14 0 0,1 6,20 A14,14 0 0,1 34,20 M10,10 L30,30 M30,10 L10,30', filled: false, pointSymbol: true, strokeWidth: 0.6, pointBaseSize: 32 },
        { id: 'scalloped', label: 'Front Line Border', path: 'M0,20 Q2.5,6 5,20 M6,20 Q8.5,6 11,20 M12,20 Q14.5,6 17,20 M18,20 Q20.5,6 23,20 M24,20 Q26.5,6 29,20 M30,20 Q32.5,6 35,20 M36,20 Q38.5,6 41,20 M42,20 Q44.5,6 47,20 M48,20 Q50.5,6 53,20 M54,20 Q56.5,6 59,20 M60,20 Q62.5,6 65,20 M66,20 Q68.5,6 71,20 M72,20 Q74.5,6 77,20 M78,20 Q80.5,6 83,20 M84,20 Q86.5,6 89,20 M90,20 Q92.5,6 95,20 M96,20 Q98,6 100,20', previewPath: 'M0,20 Q5,6 10,20 M14,20 Q19,6 24,20 M28,20 Q33,6 38,20 M42,20 Q47,6 52,20 M56,20 Q61,6 66,20 M70,20 Q75,6 80,20 M84,20 Q89,6 94,20', filled: false, strokeWidth: 2 },
        // Same hollow stepped geometry as CounterAttack (map = getCatkUnifiedDivIcon); solid lines, no label.
        {
            id: 'attack',
            label: 'Attack',
            path: 'M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32',
            previewPath: 'M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32'
        },
        // Maneuver Arrow — smooth bezier with auto-generated dual flanks, animated.
        // Click two points; bend with drag handles. Owned by maneuver-arrow.js,
        // routed past the CATK placement flow by a selectedTmgType check.
        {
            id: 'maneuver-arrow',
            label: 'Maneuver Arrow',
            typeOf: 'maneuver-arrow',
            previewPath: ['M6,32 C25,32 30,8 50,8 C70,8 75,32 88,18 L80,12 M88,18 L80,24', 'M2,34 C24,36 30,16 52,16', 'M10,30 C30,28 36,4 56,4'],
            strokeWidth: 2
        },
        // Main Attack: same as Attack but with a V chevron beyond the arrowhead tip.
        {
            id: 'main-attack',
            label: 'Main Attack',
            path: ['M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32', 'M57,7 L73,18 L57,29'],
            previewPath: ['M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32', 'M57,7 L73,18 L57,29']
        },
        {
            id: 'counterattack',
            label: 'CounterAttack',
            dashed: true,
            path: [{d: 'M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32', dashed: true}],
            previewPath: [{d: 'M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32', dashed: true}],
            text: 'CAT',
            textX: 28,
            textY: 22,
            textSize: 9
        },
        // Counterattack by Fire (CATK): dashed rails + barb extending from tip
        {
            id: 'counterattack-by-fire',
            label: 'Counterattack By Fire',
            dashed: true,
            path: [{d: 'M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32', dashed: true}, {d: 'M64,14 L76,18 L64,22', dashed: true}],
            previewPath: [{d: 'M2,32 L2,24 L20,11 L52,11 L52,7 L68,18 L52,29 L52,23 L34,23 L16,35 L16,32', dashed: true}, {d: 'M64,14 L76,18 L64,22', dashed: true}],
            text: 'CATK',
            textX: 28,
            textY: 22,
            textSize: 8
        },
        { id: 'destroy', label: 'Destroy', path: 'M5,5 L35,35 M35,5 L5,35', filled: false, pointSymbol: true },
        { id: 'tactical-point-plus', label: 'Tactical Point (Plus)', path: 'M20,6 L20,34 M6,20 L34,20', filled: false, pointSymbol: true },
        { id: 'delay', label: 'Delay', path: 'M0,20 Q50,5 100,20', bodyPath: 'M0,20 Q50,5 100,20', filled: false },
        { id: 'withdrawal', label: 'Withdrawal', path: 'M100,20 Q50,35 0,20', filled: false },
        { id: 'retirement', label: 'Retirement', path: 'M100,15 L100,25 L0,25 L0,15', filled: false },
        { id: 'axis-main', label: 'Axis of Main Attack', path: 'M0,18 L100,18 M0,22 L100,22', filled: false },
        { id: 'axis-support', label: 'Axis of Supporting Attack', path: 'M0,15 L100,15 M0,20 L100,20 M0,25 L100,25', filled: false },
        { id: 'block', label: 'Block', path: 'M0,20 L60,20 M60,12 L85,20 L60,28 M92,5 L92,35', filled: false },
        // Breach (Tasks): T-shape — horizontal bar, vertical stem with gap for "B"
        { id: 'breach', label: 'Breach', path: 'M0,12 L100,12 M50,12 L50,16 M50,28 L50,40', filled: false, strokeWidth: 1.5, text: 'B', textX: 50, textY: 22, textSize: 10, textWeight: 700 },
        { id: 'bypass', label: 'Bypass', path: 'M0,30 Q25,32 40,15 Q55,0 75,10 L100,20', filled: false },
        { id: 'canalize', label: 'Canalize', path: 'M0,5 L40,16 L100,16 M0,35 L40,24 L100,24', filled: false },
        { id: 'clear', label: 'Clear', path: 'M8,10 L32,30 M32,10 L8,30 M3,20 L37,20', filled: false, pointSymbol: true },
        { id: 'contain', label: 'Contain', path: 'M0,35 Q50,-10 100,35', filled: false },
        { id: 'disrupt', label: 'Disrupt', path: 'M0,20 L20,20 L28,8 L36,32 L44,20 L60,20 M60,12 L100,20 L60,28', filled: false },
        { id: 'fix', label: 'Fix', path: 'M0,20 L60,20 M60,12 L100,20 L60,28 M40,8 L40,32', filled: false },
        { id: 'follow-and-assume', label: 'Follow And Assume', path: 'M0,20 L60,20 M60,12 L100,20 L60,28', filled: false, dashed: true },
        { id: 'follow-and-support', label: 'Follow And Support', path: 'M0,20 L60,20 M60,12 L100,20 L60,28 M30,10 L30,30 M42,10 L42,30', filled: false, dashed: true },
        { id: 'interdict', label: 'Interdict', path: 'M0,20 L50,20 M70,8 L90,32 M90,8 L70,32', filled: false },
        { id: 'isolate', label: 'Isolate', path: 'M5,20 A15,15 0 1,1 35,20 A15,15 0 1,1 5,20', filled: false, pointSymbol: true },
        { id: 'neutralize', label: 'Neutralize', path: 'M5,35 L35,5', filled: false, pointSymbol: true },
        { id: 'occupy', label: 'Occupy', path: 'M8,20 A12,12 0 1,1 32,20 A12,12 0 1,1 8,20', filled: false, pointSymbol: true },
        { id: 'penetrate', label: 'Penetrate', path: 'M0,20 L60,20 M60,12 L100,20 L60,28 M30,5 L30,35', filled: false },
        { id: 'relief-in-place', label: 'Relief In Place', path: 'M0,14 L55,14 M55,7 L80,14 L55,21 M100,26 L45,26 M45,19 L20,26 L45,33', filled: false },
        { id: 'retain', label: 'Retain', path: 'M8,8 L32,8 L32,32 L8,32 Z', filled: false, pointSymbol: true },
        { id: 'secure', label: 'Secure', path: 'M0,20 L60,20 M75,20 A10,10 0 1,1 95,20 A10,10 0 1,1 75,20', filled: false },
        { id: 'screen', label: 'Screen', path: 'M0,35 Q50,-10 100,35', filled: false, dashed: true },
        { id: 'guard', label: 'Guard', path: 'M0,35 Q50,-10 100,35 M5,35 Q50,0 95,35', filled: false },
        { id: 'cover', label: 'Cover', path: 'M0,35 Q50,-15 100,35 M0,30 Q50,-5 100,30', filled: false },
        { id: 'seize', label: 'Seize', path: 'M5,20 A15,15 0 1,1 35,20 A15,15 0 1,1 5,20 M20,5 L20,35 M5,20 L35,20', filled: false, pointSymbol: true },
        { id: 'withdraw-under-pressure', label: 'Withdraw Under Pressure', path: 'M100,20 Q50,35 0,20 M20,8 L20,32 M30,8 L30,32', filled: false },
    ];

    /** Color presets shown in the TMG style popup. */
    const TMG_COLOR_PRESETS = [
        { id: 'blue',   label: 'Blue',   color: '#3b82f6' },
        { id: 'red',    label: 'Red',    color: '#ef4444' },
        { id: 'green',  label: 'Green',  color: '#22c55e' },
        { id: 'yellow', label: 'Yellow', color: '#eab308' },
        { id: 'brown',  label: 'Brown',  color: '#92400e' },
        { id: 'black',  label: 'Black',  color: '#1f2937' },
    ];

    /** Status digit options for the symbol popup status dropdown. */
    const STATUS_OPTIONS = [
        { value: '0', key: 'status-unknown' },
        { value: '0', key: 'status-operational' },
        { value: '3', key: 'status-fully-capable' },
        { value: '3', key: 'status-partially-capable' },
        { value: '3', key: 'status-temporarily-incapable' },
        { value: '4', key: 'status-not-capable' },
        { value: '4', key: 'status-destroyed' }
    ];

    /**
     * Default SIDC favorites written to localStorage on a brand-new install.
     * Renamed FALLBACK_SIDC_FAVORITES to make the intent explicit:
     * localStorage always takes priority — this is only used when storage is empty or invalid.
     */
    const FALLBACK_SIDC_FAVORITES = [
        { sidc: '10031000001200000000', label: 'Friendly Infantry' },
        { sidc: '10033500001200000000', label: 'Hostile Infantry' },
        { sidc: '10037000001200000000', label: 'Unknown Infantry' }
    ];

    window.AppSymbology = {
        TACTICAL_GRAPHICS,
        TMG_COLOR_PRESETS,
        STATUS_OPTIONS,
        FALLBACK_SIDC_FAVORITES,
    };
})();
