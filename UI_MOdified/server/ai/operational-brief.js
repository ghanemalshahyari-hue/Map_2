/**
 * Operational Brief assembly — DOC-UNDERSTANDING-1 / Phase D (JS gate).
 *
 * Deterministic, no-LLM scaffolding that runs before generation:
 *   • buildDocumentSet()  — sha256 content-hash dedupe across upload slots.
 *       The SAME file dropped into both the friendly and the enemy slot is
 *       collapsed into ONE document tagged "Mixed Operational Document"
 *       (Phase G #1) — never two contradictory sources.
 *   • segmentSides()      — split one mixed order's text into friendly /
 *       enemy / neutral buckets by Arabic + English headings (Phase G #3).
 *   • emptyBrief()        — the canonical Operational Brief JSON shape; the
 *       Python LLM stage fills mission/intent/units/prose, this layer seeds
 *       the structural facts (document list, side text, ambiguities).
 *
 * The unified brief is the ONLY input scenario generation reads (Phase F),
 * so generation works from extracted facts, not raw document chunks.
 */
'use strict';

const crypto = require('crypto');
const C = require('./document-classifier');

function sha256(input) {
    const h = crypto.createHash('sha256');
    h.update(Buffer.isBuffer(input) ? input : Buffer.from(String(input != null ? input : ''), 'utf8'));
    return h.digest('hex');
}

// ── Canonical Operational Brief shape (Phase D spec) ────────────────
function emptyBrief() {
    return {
        document_set_id: '',
        documents: [],
        operational_brief: {
            mission: '',
            commander_intent: '',
            area_of_operations: {},
            friendly: { summary: '', units: [], tasks: [] },
            enemy:    { summary: '', units: [], assessed_capabilities: [], tasks: [] },
            neutral:  { civilian: [], infrastructure: [] },
            objectives: [],
            phases: [],
            timeline: [],
            constraints: [],
            assumptions: [],
            ambiguities: [],
            source_citations: [],
        },
    };
}

// ── Slot dedupe → document set ──────────────────────────────────────
// inputs: [{ slot:'red'|'blue'|…, filename, text?, bytes?, hash? }]
// A precomputed `hash` (e.g. of the raw DOCX bytes captured at stage-doc)
// wins; otherwise we hash bytes, else the extracted text.
function buildDocumentSet(inputs) {
    const list = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
    const byHash = new Map();

    for (const item of list) {
        const hash = item.hash || sha256(item.bytes != null ? item.bytes : (item.text || ''));
        if (!byHash.has(hash)) byHash.set(hash, { hash, slots: [], filenames: [], text: '' });
        const g = byHash.get(hash);
        if (item.slot && g.slots.indexOf(item.slot) === -1) g.slots.push(item.slot);
        if (item.filename && g.filenames.indexOf(item.filename) === -1) g.filenames.push(item.filename);
        if (item.text && !g.text) g.text = item.text;     // keep first non-empty text
    }

    const documents = [];
    let anyBothSides = false;
    for (const g of byHash.values()) {
        const cls = C.classifyDocument(g.text || '');
        g.slots.sort();
        const inBothSlots = g.slots.indexOf('red') !== -1 && g.slots.indexOf('blue') !== -1;
        if (cls.contains_both_sides || inBothSlots) anyBothSides = true;
        documents.push({
            filename: g.filenames[0] || null,
            filenames: g.filenames,
            slots: g.slots,
            hash: g.hash,
            detected_type: cls.type,
            type_label_ar: cls.type_label_ar,
            type_label_en: cls.type_label_en,
            language: cls.language,
            confidence: cls.confidence,
            contains_both_sides: cls.contains_both_sides,
            in_both_slots: inBothSlots,
        });
    }

    const sameInBothSlots = documents.some(d => d.in_both_slots);

    // Set-level type: a single source carrying both sides — or the same file
    // in both slots, or several different-side docs — is a Mixed Operational
    // Document. Otherwise the lone document's own type carries through.
    let setType;
    if (anyBothSides || sameInBothSlots) {
        setType = C.TYPES.MIXED;
    } else if (documents.length === 1) {
        setType = documents[0].detected_type;
    } else if (documents.length === 0) {
        setType = C.TYPES.UNKNOWN;
    } else {
        setType = C.TYPES.MIXED;     // multiple distinct documents → combined
    }

    const hashes = documents.map(d => d.hash).sort();
    const setId = 'ds_' + sha256(hashes.join('|')).slice(0, 16);

    return {
        document_set_id: setId,
        documents,
        set_type: setType,
        set_label_ar: (C.LABELS[setType] || C.LABELS.unknown).ar,
        set_label_en: (C.LABELS[setType] || C.LABELS.unknown).en,
        dedupe: {
            input_count: list.length,
            unique_count: documents.length,
            duplicates_removed: list.length - documents.length,
            same_in_both_slots: sameInBothSlots,
        },
    };
}

// ── Side segmentation (Arabic + English headings) ───────────────────
const N_FRIENDLY = C.FRIENDLY_MARKERS.map(C.normalize);
const N_ENEMY    = C.ENEMY_MARKERS.map(C.normalize);
const N_NEUTRAL  = C.NEUTRAL_MARKERS.map(C.normalize);
const N_STRUCT   = C.STRUCTURE_MARKERS.map(C.normalize);

function firstIdx(zone, markers) {
    let min = Infinity;
    for (const m of markers) {
        if (!m) continue;
        const i = zone.indexOf(m);
        if (i !== -1 && i < min) min = i;
    }
    return min;
}
function hasAny(zone, markers) {
    for (const m of markers) if (m && zone.indexOf(m) !== -1) return true;
    return false;
}

// Split text into friendly/enemy/neutral/unmapped. A line is treated as a
// SIDE heading only when a side marker appears in its first 30 normalized
// chars (a heading, not a mid-paragraph mention); ties go to the earliest
// marker. Structure headings (المهمة/التنفيذ/…) reset to "unmapped" so an
// order section doesn't leak into the previous side bucket.
function segmentSides(text) {
    const raw = typeof text === 'string' ? text : '';
    const buckets = { friendly: [], enemy: [], neutral: [], unmapped: [] };
    let cur = 'unmapped';

    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const norm = C.normalize(line);
        const zone = norm.slice(0, 30);
        const fi = firstIdx(zone, N_FRIENDLY);
        const ei = firstIdx(zone, N_ENEMY);
        const ni = firstIdx(zone, N_NEUTRAL);
        const minSide = Math.min(fi, ei, ni);
        if (minSide !== Infinity) {
            cur = (minSide === fi) ? 'friendly' : (minSide === ei) ? 'enemy' : 'neutral';
        } else if (hasAny(zone, N_STRUCT)) {
            cur = 'unmapped';
        }
        buckets[cur].push(line.trim());
    }

    return {
        friendly: buckets.friendly.join('\n'),
        enemy:    buckets.enemy.join('\n'),
        neutral:  buckets.neutral.join('\n'),
        unmapped: buckets.unmapped.join('\n'),
        flags: {
            friendly: buckets.friendly.length > 0,
            enemy:    buckets.enemy.length > 0,
            neutral:  buckets.neutral.length > 0,
        },
    };
}

module.exports = {
    sha256,
    emptyBrief,
    buildDocumentSet,
    segmentSides,
};
