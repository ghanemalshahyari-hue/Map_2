/**
 * Document-type classifier — DOC-UNDERSTANDING-1 / Phase D (JS gate).
 *
 * Deterministic, no-LLM heuristic that labels an uploaded military document
 * from its (already-extracted) text. It runs BEFORE generation so the
 * operator sees "AI understood this as: أمر إنذاري / Mixed Operational
 * Document" and so the pipeline can route a single mixed order correctly.
 *
 * It is Arabic-first: text is normalized (diacritics/tatweel stripped,
 * alef/ya/ta-marbuta folded) so "الأَمْر الإِنْذَارِي" matches "الامر
 * الانذاري". The LLM extraction stage (Python) refines; this gives a fast,
 * offline-safe, testable first read and the side-presence flags the
 * dedupe/brief layers need.
 *
 * classifyDocument(text) → {
 *   type,                       // canonical enum (see TYPES)
 *   type_label_ar, type_label_en,
 *   language,                   // 'ar' | 'en' | 'mixed'
 *   confidence,                 // 0..1
 *   contains_both_sides,        // friendly AND enemy sections present
 *   sides_present: { friendly, enemy, neutral },
 *   signals: { scores, matched, structure_markers },
 * }
 */
'use strict';

const TYPES = Object.freeze({
    WARNING_ORDER:  'warning_order',
    OPORD:          'opord',
    FRAGO:          'frago',
    INTEL_SUMMARY:  'intel_summary',
    ENEMY_ORBAT:    'enemy_orbat',
    FRIENDLY_ORBAT: 'friendly_orbat',
    MIXED:          'mixed_operational',
    UNKNOWN:        'unknown',
});

const LABELS = Object.freeze({
    warning_order:     { ar: 'أمر إنذاري',                en: 'Warning Order' },
    opord:             { ar: 'أمر عمليات',                en: 'Operation Order (OPORD)' },
    frago:             { ar: 'أمر تجزئة',                 en: 'Fragmentary Order (FRAGO)' },
    intel_summary:     { ar: 'ملخص استخباراتي',           en: 'Intelligence Summary' },
    enemy_orbat:       { ar: 'النظام القتالي للعدو',       en: 'Enemy ORBAT' },
    friendly_orbat:    { ar: 'النظام القتالي لقواتنا',     en: 'Friendly ORBAT' },
    mixed_operational: { ar: 'وثيقة عمليات مختلطة',        en: 'Mixed Operational Document' },
    unknown:           { ar: 'غير معروف — بحاجة لتأكيد',   en: 'Unknown / needs confirmation' },
});

// ── Arabic-aware normalization ──────────────────────────────────────
// Strip harakat/tatweel and fold alef/ya/ta-marbuta variants, lowercase
// latin, collapse whitespace. Applied to BOTH the text and the keyword
// table so matching is consistent.
function normalize(s) {
    if (typeof s !== 'string') return '';
    return s
        .replace(/[ً-ْٰ]/g, '')      // harakat + superscript alef
        .replace(/ـ/g, '')                      // tatweel
        .replace(/[آأإٱ]/g, 'ا') // آأإٱ → ا
        .replace(/ى/g, 'ي')                // ى → ي
        .replace(/ة/g, 'ه')                // ة → ه
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

// Keyword → { type, weight }. Strong title phrases weigh 3, partials 2.
const TYPE_SIGNALS = [
    // Warning order (الأمر الإنذاري)
    { kw: 'أمر إنذاري',          type: TYPES.WARNING_ORDER, w: 3 },
    { kw: 'الأمر الإنذاري',      type: TYPES.WARNING_ORDER, w: 3 },
    { kw: 'امر انذار',           type: TYPES.WARNING_ORDER, w: 2 },
    { kw: 'warning order',       type: TYPES.WARNING_ORDER, w: 3 },
    { kw: 'warno',               type: TYPES.WARNING_ORDER, w: 3 },
    // OPORD
    { kw: 'أمر عمليات',          type: TYPES.OPORD, w: 3 },
    { kw: 'امر العمليات',        type: TYPES.OPORD, w: 3 },
    { kw: 'operation order',     type: TYPES.OPORD, w: 3 },
    { kw: 'opord',               type: TYPES.OPORD, w: 3 },
    // FRAGO
    { kw: 'أمر تجزئة',           type: TYPES.FRAGO, w: 3 },
    { kw: 'امر مجزأ',            type: TYPES.FRAGO, w: 2 },
    { kw: 'fragmentary order',   type: TYPES.FRAGO, w: 3 },
    { kw: 'frago',               type: TYPES.FRAGO, w: 3 },
    // Intel summary
    { kw: 'ملخص استخباراتي',     type: TYPES.INTEL_SUMMARY, w: 3 },
    { kw: 'موجز استخباراتي',     type: TYPES.INTEL_SUMMARY, w: 3 },
    { kw: 'تقدير الموقف الاستخباراتي', type: TYPES.INTEL_SUMMARY, w: 3 },
    { kw: 'intelligence summary', type: TYPES.INTEL_SUMMARY, w: 3 },
    { kw: 'intsum',              type: TYPES.INTEL_SUMMARY, w: 3 },
    { kw: 'intel summary',       type: TYPES.INTEL_SUMMARY, w: 3 },
    // Enemy ORBAT
    { kw: 'النظام القتالي للعدو', type: TYPES.ENEMY_ORBAT, w: 3 },
    { kw: 'تشكيل قوات العدو',    type: TYPES.ENEMY_ORBAT, w: 2 },
    { kw: 'enemy order of battle', type: TYPES.ENEMY_ORBAT, w: 3 },
    { kw: 'enemy orbat',         type: TYPES.ENEMY_ORBAT, w: 3 },
    // Friendly ORBAT
    { kw: 'النظام القتالي لقواتنا', type: TYPES.FRIENDLY_ORBAT, w: 3 },
    { kw: 'تشكيل قواتنا',        type: TYPES.FRIENDLY_ORBAT, w: 2 },
    { kw: 'friendly order of battle', type: TYPES.FRIENDLY_ORBAT, w: 3 },
    { kw: 'friendly orbat',      type: TYPES.FRIENDLY_ORBAT, w: 3 },
];

// Side-presence markers.
const FRIENDLY_MARKERS = ['قواتنا', 'القوات الصديقة', 'قواتنا الصديقة', 'friendly forces', 'own forces', 'blue forces'];
const ENEMY_MARKERS    = ['قوات العدو', 'قوة العدو', 'تشكيل العدو', 'العدو', 'enemy forces', 'hostile forces', 'red forces'];
const NEUTRAL_MARKERS  = ['المدنيين', 'مدنيين', 'البنية التحتية', 'محايد', 'civilian', 'infrastructure', 'neutral'];

// Operational-order structure headings (Arabic doctrine + English).
const STRUCTURE_MARKERS = [
    'الموقف', 'المهمة', 'التنفيذ', 'مراحل العملية', 'التعليمات التنسيقية',
    'الإسناد', 'القيادة والسيطرة', 'منطقة العمليات', 'المحاور', 'الأهداف',
    'التوقيتات', 'القيود', 'الافتراضات', 'المخاطر', 'نية القائد',
    'situation', 'mission', 'execution', 'service support', 'command and signal',
    'coordinating instructions', "commander's intent",
];

// Pre-normalize keyword tables once.
const N_TYPE_SIGNALS = TYPE_SIGNALS.map(s => ({ kw: normalize(s.kw), type: s.type, w: s.w }));
const N_FRIENDLY = FRIENDLY_MARKERS.map(normalize);
const N_ENEMY    = ENEMY_MARKERS.map(normalize);
const N_NEUTRAL  = NEUTRAL_MARKERS.map(normalize);
const N_STRUCT   = STRUCTURE_MARKERS.map(normalize);

function anyPresent(haystack, needles) {
    for (const n of needles) if (n && haystack.indexOf(n) !== -1) return true;
    return false;
}
function countPresent(haystack, needles) {
    let c = 0;
    for (const n of needles) if (n && haystack.indexOf(n) !== -1) c++;
    return c;
}

function detectLanguage(raw) {
    const ar = (raw.match(/[؀-ۿ]/g) || []).length;
    const la = (raw.match(/[A-Za-z]/g) || []).length;
    if (ar === 0 && la === 0) return 'en';
    if (ar > la * 1.5) return 'ar';
    if (la > ar * 1.5) return 'en';
    return (ar > 0 && la > 0) ? 'mixed' : (ar > 0 ? 'ar' : 'en');
}

function classifyDocument(text, opts) {
    opts = opts || {};
    const raw = typeof text === 'string' ? text : '';
    const n = normalize(raw);

    // Score each type.
    const scores = {};
    const matched = [];
    for (const sig of N_TYPE_SIGNALS) {
        if (sig.kw && n.indexOf(sig.kw) !== -1) {
            scores[sig.type] = (scores[sig.type] || 0) + sig.w;
            matched.push(sig.type);
        }
    }

    const sides_present = {
        friendly: anyPresent(n, N_FRIENDLY),
        enemy:    anyPresent(n, N_ENEMY),
        neutral:  anyPresent(n, N_NEUTRAL),
    };
    const structure_markers = countPresent(n, N_STRUCT);
    const contains_both_sides = sides_present.friendly && sides_present.enemy;

    // Pick the top-scoring type.
    let top = TYPES.UNKNOWN, topScore = 0, second = 0;
    for (const [type, sc] of Object.entries(scores)) {
        if (sc > topScore) { second = topScore; top = type; topScore = sc; }
        else if (sc > second) { second = sc; }
    }

    // No explicit type title, but it reads as a full order spanning both
    // sides → Mixed Operational Document.
    if (topScore === 0 && contains_both_sides && structure_markers >= 2) {
        top = TYPES.MIXED;
        topScore = 2;
    }

    // Confidence from absolute score + margin over runner-up.
    let confidence;
    if (top === TYPES.UNKNOWN)      confidence = 0.2;
    else if (topScore >= 3)         confidence = 0.85;
    else if (topScore === 2)        confidence = 0.7;
    else                            confidence = 0.5;
    if (top !== TYPES.UNKNOWN && (topScore - second) >= 2) confidence = Math.min(0.99, confidence + 0.1);

    return {
        type: top,
        type_label_ar: (LABELS[top] || LABELS.unknown).ar,
        type_label_en: (LABELS[top] || LABELS.unknown).en,
        language: detectLanguage(raw),
        confidence,
        contains_both_sides,
        sides_present,
        signals: { scores, matched, structure_markers },
    };
}

module.exports = {
    classifyDocument,
    normalize,
    detectLanguage,
    TYPES,
    LABELS,
    // exposed for tests / the dedupe layer:
    FRIENDLY_MARKERS, ENEMY_MARKERS, NEUTRAL_MARKERS, STRUCTURE_MARKERS,
};
