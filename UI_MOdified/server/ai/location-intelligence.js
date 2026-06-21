/* ============================================================================
 * location-intelligence.js — DOC-UNDERSTANDING-1 / G-3B: Location Intelligence
 * Resolver (deterministic first version).
 * ----------------------------------------------------------------------------
 * Turns location MENTIONS (from a Planning Model / Operational Brief / manual
 * app input) into reviewable PLACEMENT CANDIDATES with confidence, source
 * citations, AO checks, and incident-history awareness.
 *
 * THIS IS NOT FINAL UNIT PLACEMENT. It is candidate generation for commander
 * review — every candidate is needs_review:true (LI-1/LI-4, design §A).
 *
 * resolveMention() is SYNC + offline + pure (inputs never mutated). The LLM rung
 * is a SEPARATE async, opt-in pass (resolveUnresolvedWithLlm) — see §9.
 *
 * Resolution ladder (RMOOZ-RESOLVER-LLM-FALLBACK-A):
 *   A. explicit coordinate in the mention text/input  (highest)
 *   B. internal gazetteer / location_db (exact)
 *   B2. fuzzy gazetteer near-match (rung 2)
 *   MGRS. convert MGRS → lat/lon when present (rung 3)
 *   C. incident_log reference (مجرى الحوادث)
 *   D. UNRESOLVED → eligible for the async LLM fallback (rung 4, opt-in):
 *      provider-agnostic via llm-runtime-config — LOCAL FIRST, gated cloud only
 *      if explicitly enabled; result is ALWAYS a needs_review candidate, never
 *      exact, tagged source local_llm | gated_cloud_llm with provenance.
 * ========================================================================== */
'use strict';

var PM = require('./planning-model.js');   // reuse SOURCE_TYPES + makeSource (one taxonomy)
// RMOOZ-RESOLVER-LLM-FALLBACK-A: the lowest rung (rung 4) is an ASYNC, OPT-IN LLM
// pass (resolveUnresolvedWithLlm) — provider-agnostic, local-first, gated cloud.
// resolveMention itself stays SYNC + offline (rungs 1-3: explicit/gazetteer/fuzzy/MGRS/incident).
var GEOCODE = require('./llm-geocode.js');
// Lazy MGRS → {lat,lon} via the `mgrs` lib if installed; null when unavailable/invalid.
var _mgrsLib = null, _mgrsTried = false;
function mgrsToLatLon(s) {
    if (!_mgrsTried) { _mgrsTried = true; try { _mgrsLib = require('mgrs'); } catch (_) { _mgrsLib = null; } }
    if (!_mgrsLib || typeof _mgrsLib.toPoint !== 'function') return null;
    try {
        var pt = _mgrsLib.toPoint(String(s).replace(/\s+/g, '').toUpperCase()); // [lon, lat]
        if (Array.isArray(pt) && isFinite(pt[0]) && isFinite(pt[1])) return { lat: pt[1], lon: pt[0] };
    } catch (_) { /* invalid MGRS */ }
    return null;
}

/* ── Arabic-aware normalization (LI-10) ─────────────────────────────────── */
function normalize(s) {
    return String(s == null ? '' : s)
        .replace(/[ـ]/g, '')                       // tatweel
        .replace(/[ً-ْٰ]/g, '')          // harakat / diacritics
        .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
        .replace(/ى/g, 'ي')                   // ى → ي
        .replace(/ة/g, 'ه')                   // ة → ه
        .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي') // ؤ→و ئ→ي
        .replace(/[‌‍‎‏]/g, '')     // bidi/zero-width
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/* ── Tiny in-memory test gazetteer (fixture; LI-7 = reviewed data) ──────── */
// coords are [lon, lat] internally (RMOOZ convention) but exposed as lat/lon.
var GAZETTEER = [
    { location_id: 'IR-NAVBASE-BANDAR-ABBAS', canonical: 'Bandar Abbas Naval Base',
      kind: 'naval_base', lat: 27.15, lon: 56.2167, confidence: 'high',
      aliases: ['Bandar Abbas', 'Bandar-e Abbas', 'بندر عباس', 'بندرعباس', 'قاعدة بندر عباس'] },
    { location_id: 'IR-NAVBASE-CHABAHAR', canonical: 'Chabahar Naval Base',
      kind: 'naval_base', lat: 25.29, lon: 60.62, confidence: 'high',
      aliases: ['Chabahar', 'Chah Bahar', 'Shah Bahar', 'شاه بهار', 'تشابهار', 'چابهار', 'قاعدة شاه بهار'] },
    { location_id: 'OBJ-X', canonical: 'Objective X',
      kind: 'objective', lat: 29.74, lon: 19.55, confidence: 'medium',
      aliases: ['Objective X', 'الهدف', 'هدف اكس', 'objective x'] },
];
var BASE_KINDS = ['naval_base', 'airbase', 'army_base', 'base', 'port'];

// alias index: normalized alias → [entries]; longest aliases matched first.
var ALIAS_INDEX = (function () {
    var rows = [];
    GAZETTEER.forEach(function (e) {
        e.aliases.forEach(function (a) { rows.push({ norm: normalize(a), entry: e }); });
        rows.push({ norm: normalize(e.canonical), entry: e });
    });
    rows.sort(function (a, b) { return b.norm.length - a.norm.length; });
    return rows;
})();

/* ── Deterministic id (djb2 → base36; no RNG/Date) ──────────────────────── */
function hashId(parts) {
    var s = parts.join('|'), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'pc-' + h.toString(36);
}

/* ── 1. Coordinate format detection ─────────────────────────────────────── */
var DMS_RE   = /(\d{1,3})\s*[°:\s]\s*(\d{1,2})\s*['′:\s]\s*(\d{1,2}(?:\.\d+)?)?\s*["″]?\s*([NSEW])/gi;
var MGRS_RE  = /\b(\d{1,2}[C-X][A-Z]{2}\d{2,10})\b/i;
var DEC_PAIR = /(-?\d{1,3}(?:\.\d+))\s*°?\s*([NS])?\s*[,;]?\s+(-?\d{1,3}(?:\.\d+))\s*°?\s*([EW])?/i;
var DEC_COMMA = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function inLat(v) { return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90; }
function inLon(v) { return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180; }

function detectCoordinate(text) {
    var t = String(text == null ? '' : text);

    // DMS (need a NS pair and an EW pair)
    var dms = [], m; DMS_RE.lastIndex = 0;
    while ((m = DMS_RE.exec(t)) !== null) {
        var dec = parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + (m[3] ? parseFloat(m[3]) : 0) / 3600;
        var hemi = m[4].toUpperCase();
        if (hemi === 'S' || hemi === 'W') dec = -dec;
        dms.push({ dec: dec, axis: (hemi === 'N' || hemi === 'S') ? 'lat' : 'lon' });
    }
    var lat = null, lon = null;
    var dLat = dms.filter(function (x) { return x.axis === 'lat'; })[0];
    var dLon = dms.filter(function (x) { return x.axis === 'lon'; })[0];
    if (dLat && dLon) {
        return { format: 'dms', lat: +dLat.dec.toFixed(6), lon: +dLon.dec.toFixed(6), raw: t.trim(), warnings: [] };
    }

    // MGRS-like → candidate, NOT converted in G-3B
    var mg = MGRS_RE.exec(t);
    if (mg) return { format: 'mgrs_candidate', lat: null, lon: null, raw: mg[1], warnings: ['mgrs_not_converted'] };

    // Decimal — bare "lat, lon" comma pair, then labeled/spaced pair
    var warnings = [];
    var c = DEC_COMMA.exec(t);
    if (c) {
        lat = parseFloat(c[1]); lon = parseFloat(c[2]);
        if (inLat(lat) && inLon(lon)) { warnings.push('coordinate_latlon_order_assumed'); return { format: 'decimal', lat: lat, lon: lon, raw: t.trim(), warnings: warnings }; }
    }
    var p = DEC_PAIR.exec(t);
    if (p) {
        var a = parseFloat(p[1]), b = parseFloat(p[3]);
        var aHemi = p[2] ? p[2].toUpperCase() : null, bHemi = p[4] ? p[4].toUpperCase() : null;
        if (aHemi === 'S') a = -a; if (bHemi === 'W') b = -b;
        if (aHemi === 'N' || aHemi === 'S') { lat = a; lon = b; }
        else if (bHemi === 'E' || bHemi === 'W') { lon = b; lat = a; }
        else { lat = a; lon = b; warnings.push('coordinate_latlon_order_assumed'); }
        if (inLat(lat) && inLon(lon)) return { format: 'decimal', lat: +lat.toFixed(6), lon: +lon.toFixed(6), raw: p[0].trim(), warnings: warnings };
    }
    return null;
}

/* ── 2. Named-location extraction + gazetteer resolve ───────────────────── */
function resolveGazetteer(phraseNorm) {
    var hits = [];
    for (var i = 0; i < ALIAS_INDEX.length; i++) {
        if (phraseNorm.indexOf(ALIAS_INDEX[i].norm) !== -1 && ALIAS_INDEX[i].norm.length >= 3) {
            if (hits.indexOf(ALIAS_INDEX[i].entry) === -1) hits.push(ALIAS_INDEX[i].entry);
        }
    }
    return hits;   // >1 distinct entry ⇒ ambiguous
}

// قاعدة/ميناء/مطار/مدينة <name>  and  base/port/airfield <name>
var PLACE_PHRASE_RE = /(قاعدة|ميناء|مطار|مدينة|base|port|airfield|airbase)\s+([^\s،.,]+(?:\s+[^\s،.,]+)?)/gi;

/** Extract distinct place mentions from free text: gazetteer hits first, then
 *  any place-phrase that does NOT resolve (so unknown places still surface). */
function extractPlaceMentions(text) {
    var t = String(text == null ? '' : text);
    var tNorm = normalize(t);
    var mentions = [], seenLoc = {}, seenPhrase = {};

    // gazetteer hits anywhere in the text
    ALIAS_INDEX.forEach(function (row) {
        if (row.norm.length >= 3 && tNorm.indexOf(row.norm) !== -1 && !seenLoc[row.entry.location_id]) {
            seenLoc[row.entry.location_id] = true;
            mentions.push({ phrase: row.entry.canonical, normalized: normalize(row.entry.canonical), location_id: row.entry.location_id });
        }
    });

    // place-noun phrases that did NOT resolve → unknown mentions
    var m; PLACE_PHRASE_RE.lastIndex = 0;
    while ((m = PLACE_PHRASE_RE.exec(t)) !== null) {
        var phrase = m[0].trim();
        var pNorm = normalize(phrase);
        if (resolveGazetteer(pNorm).length) continue;            // already covered above
        if (seenPhrase[pNorm]) continue;
        seenPhrase[pNorm] = true;
        mentions.push({ phrase: phrase, normalized: pNorm, location_id: null });
    }
    return mentions;
}

/* ── 6. Incident history (مجرى الحوادث) parser ──────────────────────────── */
var EVENT_LEXICON = [
    { type: 'destroyed_reported', kw: ['destroyed', 'دمر', 'دُمّر', 'تدمير', 'مدمر'] },
    { type: 'damaged_reported',   kw: ['damaged', 'أصيب', 'اصيب', 'متضرر', 'تضرر', 'إصابة'] },
    { type: 'active_reported',    kw: ['active', 'نشط', 'فعال', 'يعمل', 'عامل'] },
    { type: 'last_seen',          kw: ['last seen', 'آخر رصد', 'شوهد', 'رصد', 'رُصد'] },
];
var DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

function classifyEvent(text) {
    var n = normalize(text);
    for (var i = 0; i < EVENT_LEXICON.length; i++) {
        for (var j = 0; j < EVENT_LEXICON[i].kw.length; j++) {
            if (n.indexOf(normalize(EVENT_LEXICON[i].kw[j])) !== -1) return EVENT_LEXICON[i].type;
        }
    }
    return 'unknown';
}

/** Normalize one incident entry (object or plain text). Deterministic. */
function parseIncident(entry, opts) {
    var o = opts || {};
    var e = (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : { text: String(entry == null ? '' : entry) };
    var text = e.text || e.raw_text || e.raw || '';
    var mention = e.location || e.place_phrase || e.mention ||
        (function () { var ms = extractPlaceMentions(text); return ms.length ? ms[0].phrase : null; })();
    var eventType = e.event_type && EVENT_LEXICON.concat([{ type: 'unknown' }]).some(function (x) { return x.type === e.event_type; })
        ? e.event_type : classifyEvent((text || '') + ' ' + (e.status_assertion || ''));
    var dateMatch = DATE_RE.exec(String(e.date || e.dtg || text || ''));
    var src = PM.makeSource({
        type: (PM.SOURCE_TYPES.indexOf(e.source_type) !== -1) ? e.source_type : 'incident_log',
        file: e.file || (e.citation && e.citation.doc_ref) || null,
        key: e.incident_id || e.id || null,
        origin: 'incident_log',
        confidence: e.confidence || (e.source && e.source.confidence) || 'medium',
    });
    return {
        incident_id: e.incident_id || e.id || null,
        mention: mention,
        normalized_name: mention != null ? normalize(mention) : null,
        location_id: e.location_id || null,
        event_type: eventType,
        date: dateMatch ? dateMatch[1] : null,
        confidence: src.confidence,
        source: src,
        raw: text || null,
    };
}
function parseIncidents(list) { return (Array.isArray(list) ? list : []).map(function (x) { return parseIncident(x); }); }

/** Match a candidate to incidents (by location_id or normalized name). Returns
 *  the incident_status block + warnings, or null. Stale only if opts.as_of. */
function matchIncident(candidate, incidents, opts) {
    var o = opts || {};
    var inc = (Array.isArray(incidents) ? incidents : []).filter(function (i) {
        if (candidate.location_id && i.location_id && candidate.location_id === i.location_id) return true;
        return candidate.normalized_name && i.normalized_name && candidate.normalized_name === i.normalized_name;
    });
    if (!inc.length) return null;
    var SEV = { destroyed_reported: 4, damaged_reported: 3, active_reported: 2, last_seen: 1, unknown: 0 };
    inc.sort(function (a, b) {
        var s = (SEV[b.event_type] || 0) - (SEV[a.event_type] || 0);
        if (s) return s;
        return String(b.date || '').localeCompare(String(a.date || ''));
    });
    var top = inc[0];
    var warnings = [];
    if (top.event_type === 'destroyed_reported') warnings.push('incident_destroyed');
    else if (top.event_type === 'damaged_reported') warnings.push('incident_damaged');
    var stale = false;
    if (o.as_of && top.date && o.staleness_days) {
        var ageMs = Date.parse(o.as_of) - Date.parse(top.date);          // both caller-supplied; no Date.now
        if (isFinite(ageMs) && ageMs > o.staleness_days * 86400000) { stale = true; warnings.push('stale_intel'); }
    }
    if (inc.length > 1 && inc.some(function (i) { return i.event_type !== top.event_type; })) warnings.push('incident_conflicting');
    return {
        status: { event_type: top.event_type, date: top.date, confidence: top.confidence,
                  source: top.source, stale: stale, matched: inc.length },
        warnings: warnings,
    };
}

/* ── 7. AO validation ───────────────────────────────────────────────────── */
function pointInPolygon(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        var hit = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (hit) inside = !inside;
    }
    return inside;
}
function aoCheck(lat, lon, ao) {
    if (lat == null || lon == null || !ao) return 'unknown';
    var bbox = null, ring = null;
    if (Array.isArray(ao) && ao.length === 4 && ao.every(function (n) { return typeof n === 'number'; })) bbox = ao;
    else if (ao.bbox && Array.isArray(ao.bbox) && ao.bbox.length === 4) bbox = ao.bbox;
    else if (Array.isArray(ao) && ao.length && Array.isArray(ao[0])) ring = ao;
    else if (ao.coordinates && Array.isArray(ao.coordinates)) ring = Array.isArray(ao.coordinates[0][0]) ? ao.coordinates[0] : ao.coordinates;
    if (bbox) return (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) ? 'inside' : 'outside_warn';
    if (ring && ring.length >= 3) return pointInPolygon(lon, lat, ring) ? 'inside' : 'outside_warn';
    return 'unknown';
}

/* ── T-4A: advisory terrain context (GIS-TERRAIN-1) ─────────────────────── */
// OPT-IN ONLY (includeTerrain:true). Lazy-required so the default path never
// loads the terrain stack and existing G-3B behavior stays byte-identical.
// Terrain is ADVISORY context for the commander: it never rejects a
// candidate, never moves lat/lon, never changes candidate.confidence or
// placement_type — the block carries its own separate terrain confidence.
var _terrainMod;                 // undefined = not tried, null = unavailable
function terrainModule() {
    if (_terrainMod !== undefined) return _terrainMod;
    try { _terrainMod = require('../terrain-analysis.js'); }
    catch (_) { _terrainMod = null; }
    return _terrainMod;
}

/** Build the advisory terrain block for one candidate. Returns null when the
 *  candidate has no usable lat/lon (no crash, no block). Missing DEM (or a
 *  missing terrain module) degrades to terrain_available:false + warnings —
 *  never a failure (L6: needs_review always true). */
function terrainForCandidate(candidate) {
    if (!candidate || !inLat(candidate.lat) || !inLon(candidate.lon)) return null;
    var TA = terrainModule();
    if (!TA) {
        return {
            terrain_available: false, elevation_m: null, confidence: 'low',
            warnings: ['terrain_module_unavailable', 'no_terrain_data'],
            source: PM.makeSource({ type: 'gis_analysis', key: 'point_terrain',
                                    origin: 'location_intelligence', confidence: 'low' }),
            needs_review: true,
        };
    }
    var p = TA.analyzePointTerrain(candidate.lat, candidate.lon);
    if (!p || p.ok !== true) {
        return {
            terrain_available: false, elevation_m: null, confidence: 'low',
            warnings: ['no_terrain_data'],
            source: PM.makeSource({ type: 'gis_analysis', key: 'point_terrain',
                                    origin: 'location_intelligence', confidence: 'low' }),
            needs_review: true,
        };
    }
    return {
        terrain_available: p.available === true && p.elevation_m !== null,
        elevation_m: p.elevation_m,
        confidence: p.confidence,
        warnings: (p.warnings || []).slice(),
        source: p.source,                      // terrain_layer — a direct point read
        needs_review: true,
    };
}

/** Idempotently attach terrain blocks to every candidate in `list` that has
 *  lat/lon and no terrain block yet. Mutates only the (already-cloned)
 *  candidates handed in — callers own the clone boundary. */
function attachTerrainToCandidates(list) {
    (Array.isArray(list) ? list : []).forEach(function (c) {
        if (!c || c.terrain) return;
        var t = terrainForCandidate(c);
        if (t) c.terrain = t;
    });
}

/* ── 3–5. Core: resolve a mention into placement candidate(s) ───────────── */
/**
 * resolveMention(mention, opts?) → [candidate, ...]
 *   mention: a free-text string, or { text|phrase, location_id?, source?, exact? }
 *   opts: { ao?, incidents?(parsed or raw), llm_candidate?({lat,lon,...}),
 *           inputSource?(source.type for explicit coords; default manual_app_entry),
 *           as_of?, staleness_days?,
 *           includeTerrain? (T-4A: attach advisory candidate.terrain; default OFF) }
 * Priority: explicit coord > gazetteer > incident_log > llm placeholder.
 */
/* ── Rung 2: fuzzy gazetteer near-match (Arabic-aware, token-overlap + edit-distance).
 * Returns { entry, score, matched } only for a CONFIDENT near-match (>=0.72), else
 * null — never a wild guess. The resulting candidate is still needs_review at low conf. */
function _lev(a, b) {
    a = a || ''; b = b || ''; var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = []; for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
        var cur = [i];
        for (var k = 1; k <= n; k++) {
            var cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
            cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
        }
        prev = cur;
    }
    return prev[n];
}
function fuzzyGazetteer(phrase) {
    var phraseNorm = normalize(phrase);
    if (phraseNorm.length < 3) return null;
    var pTok = phraseNorm.split(' ').filter(Boolean);
    var best = null;
    ALIAS_INDEX.forEach(function (row) {
        var a = row.norm; if (!a || a.length < 3) return;
        var aTok = a.split(' ').filter(Boolean);
        var overlap = pTok.filter(function (t) { return aTok.indexOf(t) !== -1; }).length;
        var tokScore = overlap / Math.max(pTok.length, aTok.length, 1);
        var edScore = 1 - _lev(phraseNorm, a) / Math.max(phraseNorm.length, a.length, 1);
        var score = Math.max(tokScore, edScore);
        if (!best || score > best.score) best = { entry: row.entry, score: score, matched: a };
    });
    return (best && best.score >= 0.72) ? best : null;
}

function resolveMention(mention, opts) {
    var o = opts || {};
    var inObj = (mention && typeof mention === 'object') ? mention : { text: String(mention == null ? '' : mention) };
    var text = inObj.text || inObj.phrase || '';
    var incidents = (o.incidents || []).map(function (i) { return (i && i.normalized_name !== undefined) ? i : parseIncident(i); });
    var inputType = (PM.SOURCE_TYPES.indexOf(o.inputSource) !== -1) ? o.inputSource : 'manual_app_entry';
    var candidates = [];

    function build(fields, methodChain) {
        var warnings = (fields.warnings || []).slice();
        var ao_check = aoCheck(fields.lat, fields.lon, o.ao);
        if (ao_check === 'outside_warn') warnings.push('outside_ao');
        var cand = {
            id: hashId([text, fields.normalized_name || '', fields.location_id || '', String(fields.lat), String(fields.lon), fields.placement_type]),
            mention: text || (inObj.phrase || null),
            normalized_name: fields.normalized_name != null ? fields.normalized_name : (text ? normalize(text) : null),
            location_id: fields.location_id != null ? fields.location_id : null,
            lat: fields.lat != null ? fields.lat : null,
            lon: fields.lon != null ? fields.lon : null,
            coordinate_format: fields.coordinate_format || null,
            placement_type: fields.placement_type,
            exact_unit_position: !!fields.exact_unit_position,
            confidence: fields.confidence,
            needs_review: true,                                   // G-3B: ALWAYS review (candidate generation)
            source: fields.source,
            evidence: methodChain,
            warnings: warnings,
            ao_check: ao_check,
            incident_status: null,
        };
        var im = matchIncident(cand, incidents, o);
        if (im) { cand.incident_status = im.status; im.warnings.forEach(function (w) { if (cand.warnings.indexOf(w) === -1) cand.warnings.push(w); }); }
        // T-4A: opt-in advisory terrain context (no-op without lat/lon).
        if (o.includeTerrain === true) {
            var terr = terrainForCandidate(cand);
            if (terr) cand.terrain = terr;
        }
        candidates.push(cand);
    }

    // Resolution ladder — record every rung tried in evidence.
    var evidence = [];
    var coord = detectCoordinate(text);
    evidence.push({ method: 'explicit_coordinate', hit: !!coord });

    var gaz = resolveGazetteer(normalize(text));
    if (inObj.location_id) {                                       // caller already resolved the id
        var pinned = GAZETTEER.filter(function (e) { return e.location_id === inObj.location_id; });
        if (pinned.length) gaz = pinned;
    }
    evidence.push({ method: 'gazetteer', hit: gaz.length > 0, location_ids: gaz.map(function (e) { return e.location_id; }) });

    var incRef = incidents.filter(function (i) {
        return i.normalized_name && normalize(text).indexOf(i.normalized_name) !== -1 && i.location_id;
    });
    evidence.push({ method: 'incident_log', hit: incRef.length > 0 });
    evidence.push({ method: 'llm_candidate', hit: !!o.llm_candidate });

    /* A. explicit coordinate (highest priority) */
    if (coord && coord.lat != null) {
        build({
            normalized_name: text ? normalize(text) : null,
            location_id: gaz.length === 1 ? gaz[0].location_id : null,   // name context if any
            lat: coord.lat, lon: coord.lon, coordinate_format: coord.format,
            placement_type: inObj.exact === false ? 'approximate' : 'exact_unit_position',
            exact_unit_position: inObj.exact !== false,
            confidence: 'high',
            warnings: coord.warnings,
            source: PM.makeSource({ type: inObj.source && inObj.source.type ? inObj.source.type : inputType,
                                    file: inObj.source && inObj.source.file, key: 'explicit_coordinate', origin: 'mention', confidence: 'high' }),
        }, evidence);
        return candidates;
    }
    if (coord && coord.format === 'mgrs_candidate') {
        /* Rung 3: convert MGRS → lat/lon when the `mgrs` lib is available. The result
         * is a reviewable candidate (needs_review, NOT exact) — operator confirms. */
        var mg = mgrsToLatLon(coord.raw);
        if (mg) {
            build({
                normalized_name: text ? normalize(text) : null, location_id: null,
                lat: mg.lat, lon: mg.lon, coordinate_format: 'mgrs',
                placement_type: 'mgrs_converted', exact_unit_position: false, confidence: 'medium',
                warnings: ['mgrs_converted', 'requires_review'],
                source: PM.makeSource({ type: inputType, key: 'mgrs_converted', origin: 'mgrs', confidence: 'medium' }),
            }, evidence.concat([{ method: 'mgrs_convert', hit: true, raw: coord.raw }]));
            return candidates;
        }
        build({                                   // lib unavailable / invalid grid → keep un-converted
            normalized_name: text ? normalize(text) : null, location_id: null,
            lat: null, lon: null, coordinate_format: 'mgrs_candidate',
            placement_type: 'suspected', exact_unit_position: false, confidence: 'low',
            warnings: coord.warnings,
            source: PM.makeSource({ type: inputType, key: 'mgrs_candidate', origin: 'mention', confidence: 'low' }),
        }, evidence.concat([{ method: 'mgrs_convert', hit: false, raw: coord.raw }]));
        return candidates;
    }

    /* B. gazetteer */
    if (gaz.length === 1) {
        var e = gaz[0];
        var isBase = BASE_KINDS.indexOf(e.kind) !== -1;
        build({
            normalized_name: normalize(e.canonical), location_id: e.location_id,
            lat: e.lat, lon: e.lon, coordinate_format: 'named',
            placement_type: isBase ? 'known_base' : 'known_location',
            exact_unit_position: false, confidence: e.confidence,
            warnings: isBase ? ['base_known_exact_unit_position_unknown'] : [],
            source: PM.makeSource({ type: 'location_db', key: e.location_id, origin: 'gazetteer', confidence: e.confidence }),
        }, evidence);
        return candidates;
    }
    if (gaz.length > 1) {                                         // ambiguous
        gaz.forEach(function (e) {
            build({
                normalized_name: normalize(e.canonical), location_id: e.location_id,
                lat: e.lat, lon: e.lon, coordinate_format: 'named',
                placement_type: 'ambiguous', exact_unit_position: false, confidence: 'low',
                warnings: ['ambiguous_location'],
                source: PM.makeSource({ type: 'location_db', key: e.location_id, origin: 'gazetteer', confidence: 'low' }),
            }, evidence);
        });
        return candidates;
    }

    /* B2. fuzzy gazetteer near-match (rung 2) — only when there was no exact hit */
    var fz = (gaz.length === 0 && text) ? fuzzyGazetteer(text) : null;
    if (fz) {
        var fe = fz.entry;
        build({
            normalized_name: normalize(fe.canonical), location_id: fe.location_id,
            lat: fe.lat, lon: fe.lon, coordinate_format: 'named',
            placement_type: 'fuzzy_match', exact_unit_position: false, confidence: 'low',
            warnings: ['fuzzy_gazetteer_match', 'requires_review'],
            source: PM.makeSource({ type: 'location_db', key: fe.location_id, origin: 'gazetteer_fuzzy', confidence: 'low' }),
        }, evidence.concat([{ method: 'gazetteer_fuzzy', hit: true, score: Math.round(fz.score * 100) / 100, location_id: fe.location_id }]));
        return candidates;
    }

    /* C. incident_log reference */
    if (incRef.length) {
        var ic = incRef[0];
        build({
            normalized_name: ic.normalized_name, location_id: ic.location_id,
            lat: null, lon: null, coordinate_format: 'named',
            placement_type: 'suspected', exact_unit_position: false, confidence: ic.confidence || 'low',
            warnings: ['from_incident_only'],
            source: PM.makeSource({ type: 'incident_log', key: ic.location_id, origin: 'incident_log', confidence: ic.confidence || 'low' }),
        }, evidence);
        return candidates;
    }

    /* D. llm_candidate placeholder (only if passed in) */
    if (o.llm_candidate && typeof o.llm_candidate === 'object') {
        var l = o.llm_candidate;
        build({
            normalized_name: text ? normalize(text) : null, location_id: null,
            lat: inLat(l.lat) ? l.lat : null, lon: inLon(l.lon) ? l.lon : null, coordinate_format: 'named',
            placement_type: 'suspected', exact_unit_position: false, confidence: 'low',
            warnings: ['llm_only_source'],
            source: PM.makeSource({ type: 'llm_candidate', key: 'llm_candidate', origin: 'llm', confidence: 'low' }),
        }, evidence);
        return candidates;
    }

    /* Unresolved named place */
    build({
        normalized_name: text ? normalize(text) : null, location_id: null,
        lat: null, lon: null, coordinate_format: text ? 'named' : null,
        placement_type: 'unknown_named', exact_unit_position: false, confidence: 'low',
        warnings: ['unknown_location'],
        source: PM.makeSource({ type: inputType, key: 'unresolved', origin: 'mention', confidence: 'low' }),
    }, evidence);
    return candidates;
}

/* ── 8. Planning Model integration ──────────────────────────────────────── */
function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function arr(v) { return Array.isArray(v) ? v : []; }

/**
 * enrichPlanningModelLocations(planningModel, options) → NEW model (cloned).
 *   options: { mentions?[ string | {text,source?} ], ao?, incidents?,
 *              llm_candidates?, as_of?, staleness_days?,
 *              includeTerrain? (T-4A: attach advisory candidate.terrain blocks;
 *                               default OFF — omitted/false keeps G-3B behavior
 *                               unchanged, terrain stack never even loads) }
 * Appends model.placement_candidates from: options.mentions + model objects
 * that carry a name but no coordinate. Preserves source metadata, surfaces
 * ambiguous mentions as conflicts, lists unresolved mentions in
 * missing_information. NEVER mutates the input.
 */
function enrichPlanningModelLocations(planningModel, options) {
    var o = options || {};
    var model = Object.assign(PM.emptyPlanningModel(), clone(planningModel) || {});
    if (!Array.isArray(model.placement_candidates)) model.placement_candidates = [];
    if (!Array.isArray(model.conflicts)) model.conflicts = [];
    if (!Array.isArray(model.missing_information)) model.missing_information = [];

    var incidents = parseIncidents(o.incidents != null ? o.incidents : model.incidents);
    var ao = o.ao != null ? o.ao
        : (arr(model.area_of_operation)[0] && (arr(model.area_of_operation)[0].bbox || arr(model.area_of_operation)[0].geometry)) || null;

    // collect mentions: explicit caller mentions + named model objects lacking a coordinate
    var jobs = [];
    arr(o.mentions).forEach(function (m, i) {
        var text = (m && typeof m === 'object') ? (m.text || m.phrase) : m;
        // a free-text statement may carry several place phrases (the two-base case)
        var phrases = extractPlaceMentions(String(text || ''));
        if (detectCoordinate(String(text || '')) || !phrases.length) {
            jobs.push({ mention: m, src: (m && m.source) || null, key: 'options.mentions[' + i + ']' });
        } else {
            phrases.forEach(function (p) { jobs.push({ mention: { text: p.phrase, location_id: p.location_id, source: (m && m.source) || null }, src: (m && m.source) || null, key: 'options.mentions[' + i + '].' + p.normalized }); });
        }
    });
    function hasCoord(e) { return e && (typeof e.lat === 'number' || (Array.isArray(e.position) && e.position.length >= 2) || (e.coord && e.coord.length >= 2)); }
    arr(model.objectives).forEach(function (e, i) { if (!hasCoord(e) && (e.name || e.id)) jobs.push({ mention: { text: e.name || e.id }, src: e.source, key: 'objectives[' + i + ']' }); });
    arr(model.locations).forEach(function (e, i) { if (!hasCoord(e) && (e.name || e.id)) jobs.push({ mention: { text: e.name || e.id }, src: e.source, key: 'locations[' + i + ']' }); });

    jobs.forEach(function (job) {
        var cands = resolveMention(job.mention, {
            ao: ao, incidents: incidents, llm_candidate: null,
            inputSource: (job.src && job.src.type) || 'manual_app_entry',
            as_of: o.as_of, staleness_days: o.staleness_days,
            includeTerrain: o.includeTerrain === true,             // T-4A passthrough
        });
        // ambiguous mention (multiple distinct candidates) → conflict
        var distinct = cands.filter(function (c) { return c.location_id; }).map(function (c) { return c.location_id; });
        if (cands.length > 1 && distinct.length > 1) {
            model.conflicts.push({
                collection: 'placement_candidates', key: job.key,
                mention: cands[0].mention, candidate_ids: cands.map(function (c) { return c.id; }),
                resolution: 'needs_review', needs_review: true,
            });
        }
        cands.forEach(function (c) {
            c.source_key = job.key;                               // provenance back-pointer
            model.placement_candidates.push(c);
            if (c.placement_type === 'unknown_named') {
                var tag = 'unresolved_location:' + (c.normalized_name || job.key);
                if (model.missing_information.indexOf(tag) === -1) model.missing_information.push(tag);
            }
        });
    });

    // T-4A: when opted in, also cover candidates that were already on the
    // (cloned) model from earlier passes — idempotent, existing blocks kept.
    if (o.includeTerrain === true) attachTerrainToCandidates(model.placement_candidates);

    return model;
}

/* ── 9. Rung 4: LLM fallback pass (ASYNC, OPT-IN) ───────────────────────────
 * RMOOZ-RESOLVER-LLM-FALLBACK-A. For candidates still WITHOUT a coordinate, ask
 * the configured LLM provider (local-first; gated cloud only if explicitly
 * enabled) for an APPROXIMATE coordinate. Bounded by opts.limit. Operates on a
 * CLONE (pure). GUARDRAILS (hard): every LLM coordinate →
 *   coord_status:'candidate' · source:'local_llm'|'gated_cloud_llm' ·
 *   needs_review:true · exact_unit_position:false · confidence + provenance.
 * No silent guessing (the model may answer "no coordinate" → stays unresolved);
 * never exact; no cloud egress unless the gated cloud mode is enabled upstream. */
function _needsLlm(c) {
    if (!c) return false;
    var hasCoord = typeof c.lat === 'number' && typeof c.lon === 'number';
    return !hasCoord && !!(c.mention || c.normalized_name);
}
async function resolveUnresolvedWithLlm(candidates, opts) {
    opts = opts || {};
    var list = Array.isArray(candidates) ? candidates.map(clone) : [];
    var limit = Number.isFinite(opts.limit) ? opts.limit : 10;
    var report = { attempted: 0, resolved: 0, unresolved: 0, provider: null, model: null, source: null, blocked: false, reason: null, items: [] };
    var targets = list.filter(_needsLlm).slice(0, Math.max(0, limit));
    for (var i = 0; i < targets.length; i++) {
        var c = targets[i];
        report.attempted++;
        var name = c.mention || c.normalized_name || '';
        var ctx = { country: opts.country || c.country, kind: c.kind || c.placement_type, side: c.side, model: opts.model };
        var g;
        try { g = await GEOCODE.geocodeNamedPlace(name, ctx); }
        catch (e) { g = { ok: false, reason: 'exception: ' + (e && e.message) }; }
        report.provider = g.provider || report.provider;
        report.model = g.model || report.model;
        if (g && g.ok) {
            c.lat = g.lat; c.lon = g.lon;
            c.coordinate_format = 'decimal_degrees';
            c.coord_status = 'candidate';            // never 'exact'
            c.placement_type = 'llm_candidate';
            c.exact_unit_position = false;           // NEVER exact automatically
            c.needs_review = true;                   // ALWAYS review
            c.confidence = g.confidence || 'low';
            c.source = PM.makeSource({ type: 'llm_candidate', key: g.source, origin: g.source, confidence: c.confidence });
            c.llm_provenance = { provider: g.provider, model: g.model, reasoning: g.reasoning, raw: g.raw, generated_by: g.source };
            if (!Array.isArray(c.warnings)) c.warnings = [];
            ['llm_generated_coordinate', 'requires_review', 'not_source_verified'].forEach(function (w) { if (c.warnings.indexOf(w) === -1) c.warnings.push(w); });
            report.source = g.source;
            report.resolved++;
            report.items.push({ name: name, lat: g.lat, lon: g.lon, source: g.source, confidence: c.confidence, model: g.model });
        } else {
            report.unresolved++;
            if (g && (g.reason === 'provider_blocked_local_only' || /blocked|unavailable/.test(String(g.reason || '')))) { report.blocked = true; report.reason = g.reason; }
            if (!Array.isArray(c.warnings)) c.warnings = [];
            if (c.warnings.indexOf('llm_could_not_resolve') === -1) c.warnings.push('llm_could_not_resolve');
            report.items.push({ name: name, resolved: false, reason: g && g.reason });
        }
    }
    return { candidates: list, report: report };
}

module.exports = {
    GAZETTEER,
    fuzzyGazetteer,
    mgrsToLatLon,
    resolveUnresolvedWithLlm,
    normalize,
    detectCoordinate,
    extractPlaceMentions,
    resolveGazetteer,
    parseIncident,
    parseIncidents,
    matchIncident,
    aoCheck,
    resolveMention,
    enrichPlanningModelLocations,
    // T-4A (GIS-TERRAIN-1): advisory terrain context for candidates.
    terrainForCandidate,
    attachTerrainToCandidates,
};
