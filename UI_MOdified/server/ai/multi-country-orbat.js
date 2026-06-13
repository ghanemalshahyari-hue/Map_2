/**
 * multi-country-orbat.js — DOC-UNDERSTANDING-1 / MULTI-COUNTRY-A
 * ----------------------------------------------------------------------------
 * Coalition Step 1 ORBAT model + projection engine. Turns a multi-country
 * Step 1 input (an Excel workbook with one sheet per country, OR the equivalent
 * JSON) into:
 *
 *   coalitions[]      one per side present (RED / BLUE), with participant list
 *   participants[]    flat { country, side, coalition_id } membership
 *   countries[]       per-country summary (side, base counts, proposed count)
 *   country_orbats[]  per-country detail (air/naval/land bases, units, anchors)
 *   country_bases[]   flat base anchors (both sides) — feeds the map + base card
 *
 * and ALSO projects DOWN into the proven Step 1 review arrays so every existing
 * consumer (review renderer, base-status-panel, placement map anchors) keeps
 * working unchanged:
 *
 *   proposed_units[]        every platform line, tagged side + country
 *   placement_candidates[]  one map anchor per base with coordinates
 *   enemy_bases[]           the RED-side bases (back-compat with STEP1-C)
 *
 * REVIEW / MAP / DEMO FOUNDATION ONLY. Every emitted unit/base/anchor is
 * needs_review:true + exact_unit_position:false. This module NEVER creates
 * final scenario units, unit tasking, COAs, movement, or combat adjudication.
 *
 * Default side map (overridable): Iran → RED; UAE/Qatar/Bahrain/Kuwait/Oman/KSA
 * → BLUE. Unknown country → UNKNOWN (flagged for operator review), never forced.
 *
 * Deterministic, offline, no LLM, no I/O (the xlsx read happens in the caller).
 */
'use strict';

// ── Canonical country dictionary (Arabic + English aliases) ──────────────
const CANON = [
    { key: 'iran',    side: 'RED',  name_en: 'Iran',                 name_ar: 'إيران',
      aliases: ['iran', 'islamic republic of iran', 'إيران', 'ايران', 'الجمهورية الاسلامية الايرانية'] },
    { key: 'uae',     side: 'BLUE', name_en: 'United Arab Emirates', name_ar: 'الإمارات',
      aliases: ['uae', 'u a e', 'united arab emirates', 'emirates', 'الامارات', 'الإمارات', 'الإمارات العربية المتحدة', 'اماراتي'] },
    { key: 'qatar',   side: 'BLUE', name_en: 'Qatar',                name_ar: 'قطر',
      aliases: ['qatar', 'قطر', 'دولة قطر', 'قطري'] },
    { key: 'bahrain', side: 'BLUE', name_en: 'Bahrain',              name_ar: 'البحرين',
      aliases: ['bahrain', 'البحرين', 'بحرين', 'مملكة البحرين'] },
    { key: 'kuwait',  side: 'BLUE', name_en: 'Kuwait',               name_ar: 'الكويت',
      aliases: ['kuwait', 'الكويت', 'كويت', 'دولة الكويت'] },
    { key: 'oman',    side: 'BLUE', name_en: 'Oman',                 name_ar: 'عُمان',
      aliases: ['oman', 'عمان', 'سلطنة عمان', 'عماني'] },
    { key: 'ksa',     side: 'BLUE', name_en: 'Saudi Arabia',         name_ar: 'السعودية',
      aliases: ['ksa', 'k s a', 'saudi', 'saudi arabia', 'السعودية', 'المملكة العربية السعودية', 'سعودي'] },
];

// Fold Arabic diacritics/variants + lowercase so aliases match loosely.
function norm(s) {
    return String(s == null ? '' : s)
        .replace(/[ً-ْٰـ]/g, '')          // tashkeel + tatweel
        .replace(/[أإآ]/g, 'ا')           // hamza alefs → alef
        .replace(/ة/g, 'ه')                          // ta marbuta → ha
        .replace(/ى/g, 'ي')                          // alef maqsura → ya
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

const ALIAS_LOOKUP = (function () {
    const m = {};
    CANON.forEach(function (c) {
        c.aliases.forEach(function (a) { m[norm(a)] = c; });
        m[norm(c.name_en)] = c;
        m[norm(c.name_ar)] = c;
        m[c.key] = c;
    });
    return m;
})();

// Resolve a raw country / sheet name to a canonical entry (or null).
function resolveCountry(rawName) {
    const n = norm(rawName);
    if (!n) return null;
    if (ALIAS_LOOKUP[n]) return ALIAS_LOOKUP[n];
    // substring either direction (handles "دولة قطر" / "Qatar Air Force")
    const keys = Object.keys(ALIAS_LOOKUP);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k.length >= 3 && (n.indexOf(k) !== -1 || k.indexOf(n) !== -1)) return ALIAS_LOOKUP[k];
    }
    return null;
}

// Default side for a country, honoring an operator override map.
// overrides keyed by canonical key OR by (normalized) raw name → 'RED'|'BLUE'|'NEUTRAL'.
function sideForCountry(rawName, overrides) {
    const canon = resolveCountry(rawName);
    const ov = overrides || {};
    const byKey = canon && (ov[canon.key] || ov[norm(canon.key)]);
    const byName = ov[norm(rawName)];
    const chosen = byKey || byName;
    if (chosen) return String(chosen).toUpperCase();
    return canon ? canon.side : 'UNKNOWN';
}

// ── Coordinate / number helpers ──────────────────────────────────────────
function toNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const t = v.trim().replace(/[،,]/g, '.').replace(/[^0-9.\-]/g, '');
    if (!t || t === '-' || t === '.') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}
function validLat(n) { return n != null && n >= -90 && n <= 90; }
function validLon(n) { return n != null && n >= -180 && n <= 180; }

function codeFromName(ar, en) {
    const ascii = String(en || ar || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return (ascii[ascii.length - 1] || 'BASE').slice(0, 18);
}
function platformCode(p) {
    const ascii = String(p || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 14);
    return ascii || 'UNIT';
}

// ── Sheet parsing (Excel → countries[]) ───────────────────────────────────
const SECTION_PATTERNS = [
    { type: 'air_base',   re: /\bair\s*base|\bairfield|airbases?\b|جوي|مطار/ },
    { type: 'naval_base', re: /\bnaval\s*base|\bnaval\b|\bport\b|harbou?r|بحري|مينا/ },
    { type: 'land_base',  re: /\bland\s*base|\bground\b|\barmy\b|بري|قواعد\s*بر/ },
];
const COL_KEYS = {
    name_ar:  /name.*ar|ar.*name|الاسم|قاعدة|مطار|مينا|اسم/,
    name_en:  /name.*en|en.*name|english|base\s*name/,
    lat:      /\blat\b|latitude|خط\s*العرض|عرض/,
    lon:      /\blon\b|\blng\b|longitude|خط\s*الطول|طول/,
    platform: /platform|aircraft|system|unit|منصة|طائرة|نظام|وحدة/,
    count:    /count|qty|quantity|number|العدد|الكمية|عدد/,
    type:     /\btype\b|category|النوع|صنف|نوع/,
};

function rowCells(row) { return (Array.isArray(row) ? row : []).map(function (c) { return String(c == null ? '' : c).trim(); }); }
function nonEmpty(cells) { return cells.filter(Boolean); }

function detectSection(cells) {
    const ne = nonEmpty(cells);
    if (!ne.length || ne.length > 3) return null;        // section titles are short
    const joined = norm(ne.join(' '));
    // a column-header row also matches section words ("Air Base Name") — exclude
    // rows that look like headers (carry lat/lon/platform/count keywords).
    if (COL_KEYS.lat.test(joined) || COL_KEYS.lon.test(joined) ||
        COL_KEYS.platform.test(joined) || COL_KEYS.count.test(joined)) return null;
    for (let i = 0; i < SECTION_PATTERNS.length; i++) {
        if (SECTION_PATTERNS[i].re.test(joined)) return SECTION_PATTERNS[i].type;
    }
    return null;
}

function detectHeader(cells) {
    let hits = 0;
    const map = {};
    cells.forEach(function (cell, idx) {
        const n = norm(cell);
        if (!n) return;
        Object.keys(COL_KEYS).forEach(function (key) {
            if (map[key] === undefined && COL_KEYS[key].test(n)) { map[key] = idx; hits++; }
        });
    });
    return hits >= 2 ? map : null;
}

// Positional fallback when no header row was seen: guess name / lat / lon /
// platform / count from cell shapes.
function positionalRead(cells) {
    const out = { name_ar: null, name_en: null, lat: null, lon: null, platform: null, count: null, type: null };
    const nums = [];
    cells.forEach(function (c, i) { const n = toNum(c); if (n != null && /[0-9]/.test(c)) nums.push({ i: i, n: n }); });
    const textCells = cells.map(function (c, i) { return { i: i, t: c }; }).filter(function (x) { return x.t && toNum(x.t) == null; });
    if (textCells[0]) out.name_ar = textCells[0].t;
    if (textCells[1]) out.name_en = textCells[1].t;
    if (textCells[2]) out.platform = textCells[2].t;
    const latlon = nums.filter(function (x) { return validLon(x.n); });
    if (latlon.length >= 2) { out.lat = latlon[0].n; out.lon = latlon[1].n; }
    const counts = nums.filter(function (x) { return Number.isInteger(x.n) && x.n > 0 && x.n < 100000 && !validLatLonPair(x, latlon); });
    if (counts.length) out.count = counts[counts.length - 1].n;
    return out;
}
function validLatLonPair(x, latlon) { return latlon.indexOf(x) !== -1; }

function readByHeader(cells, header) {
    function at(key) { return header[key] !== undefined ? cells[header[key]] : undefined; }
    return {
        name_ar: at('name_ar') || null,
        name_en: at('name_en') || null,
        lat: toNum(at('lat')),
        lon: toNum(at('lon')),
        platform: at('platform') || null,
        count: toNum(at('count')),
        type: at('type') || null,
    };
}

// Parse one workbook (sheets from xlsx-text.extractWorkbook) into countries[].
function parseCountrySheets(sheets, opts) {
    opts = opts || {};
    const warnings = [];
    const countries = (Array.isArray(sheets) ? sheets : []).map(function (sheet) {
        const name = sheet && sheet.name ? String(sheet.name) : '';
        const rows = Array.isArray(sheet && sheet.rows) ? sheet.rows : [];
        const sections = { air_base: [], naval_base: [], land_base: [] };
        let curSection = null;
        let header = null;
        let curBase = null;

        rows.forEach(function (rawRow) {
            const cells = rowCells(rawRow);
            if (!nonEmpty(cells).length) return;

            const sec = detectSection(cells);
            if (sec) { curSection = sec; header = null; curBase = null; return; }

            const hdr = detectHeader(cells);
            if (hdr) { header = hdr; return; }

            if (!curSection) return;                       // data before any section → skip
            const rec = header ? readByHeader(cells, header) : positionalRead(cells);
            const baseName = (rec.name_ar || rec.name_en || '').trim();
            const hasName = !!baseName;
            const hasUnit = !!(rec.platform && String(rec.platform).trim());

            if (hasName) {
                curBase = {
                    base_name_ar: rec.name_ar || '',
                    base_name_en: rec.name_en || '',
                    lat: validLat(rec.lat) ? rec.lat : null,
                    lon: validLon(rec.lon) ? rec.lon : null,
                    site_type: curSection,
                    units: [],
                };
                sections[curSection].push(curBase);
                if (hasUnit) curBase.units.push({ platform: String(rec.platform).trim(), estimated_count: rec.count, type_ar: rec.type || null });
            } else if (hasUnit && curBase) {
                // continuation row: another platform line for the current base
                curBase.units.push({ platform: String(rec.platform).trim(), estimated_count: rec.count, type_ar: rec.type || null });
            }
        });

        const side = sideForCountry(name, opts.sideOverrides);
        if (side === 'UNKNOWN') warnings.push('country_side_unknown: "' + name + '" — assign a side (operator override required)');
        const totalBases = sections.air_base.length + sections.naval_base.length + sections.land_base.length;
        if (!totalBases) warnings.push('no_bases_parsed: "' + name + '"');
        return {
            name: name,
            side_hint: side,
            air_bases: sections.air_base,
            naval_bases: sections.naval_base,
            land_bases: sections.land_base,
        };
    });
    return { countries: countries, warnings: warnings };
}

// ── Input coercion (JSON or parsed-sheets) → normalized countries[] ────────
function coerceCountries(input, opts) {
    if (!input) return { countries: [], warnings: [] };
    if (Array.isArray(input.sheets)) return parseCountrySheets(input.sheets, opts);
    if (Array.isArray(input.countries)) {
        const warnings = [];
        const countries = input.countries.map(function (c) {
            c = c || {};
            const name = c.name || c.country || c.country_name || '';
            const split = { air_base: [], naval_base: [], land_base: [] };
            ['air_bases', 'naval_bases', 'land_bases'].forEach(function (field) {
                const t = field === 'air_bases' ? 'air_base' : (field === 'naval_bases' ? 'naval_base' : 'land_base');
                (Array.isArray(c[field]) ? c[field] : []).forEach(function (b) { split[t].push(coerceBase(b, t)); });
            });
            if (Array.isArray(c.bases)) {
                c.bases.forEach(function (b) {
                    const t = normSiteType((b && (b.site_type || b.base_type || b.type)) || 'land_base');
                    split[t].push(coerceBase(b, t));
                });
            }
            return {
                name: name,
                side_hint: c.side ? String(c.side).toUpperCase() : sideForCountry(name, opts && opts.sideOverrides),
                air_bases: split.air_base, naval_bases: split.naval_base, land_bases: split.land_base,
            };
        });
        return { countries: countries, warnings: warnings };
    }
    return { countries: [], warnings: [] };
}
function normSiteType(s) {
    const t = norm(s);
    if (/naval|port|harbou|بحر|مينا/.test(t)) return 'naval_base';
    if (/land|ground|army|بر/.test(t)) return 'land_base';
    return 'air_base';
}
function coerceBase(b, type) {
    b = b || {};
    const lat = toNum(b.lat != null ? b.lat : b.latitude);
    const lon = toNum(b.lon != null ? b.lon : (b.lng != null ? b.lng : b.longitude));
    return {
        base_name_ar: b.base_name_ar || b.name_ar || b.name || '',
        base_name_en: b.base_name_en || b.name_en || '',
        lat: validLat(lat) ? lat : null,
        lon: validLon(lon) ? lon : null,
        site_type: type,
        units: (Array.isArray(b.units) ? b.units : []).map(function (u) {
            u = u || {};
            return { platform: u.platform || u.name || u.aircraft || u.system || '', estimated_count: toNum(u.estimated_count != null ? u.estimated_count : u.count), type_ar: u.type_ar || u.type || null };
        }).filter(function (u) { return u.platform; }),
    };
}

// ── The build: model + projection ─────────────────────────────────────────
function reviewSource(file, key) {
    return { type: 'multi_country_step1', file: file || 'multi_country_step1', key: key || '', origin: 'multi_country_step1', confidence: 'low' };
}

function buildMultiCountryStep1(input, opts) {
    opts = opts || {};
    const file = opts.file || (input && input.file) || 'multi_country_step1';
    const coerced = coerceCountries(input, opts);
    const rawCountries = coerced.countries;
    const warnings = coerced.warnings.slice();

    const coalitionsBySide = {};                 // side → { id, side, name_en, name_ar, participants:[] }
    const participants = [];
    const countries = [];
    const country_orbats = [];
    const country_bases = [];
    const proposed_units = [];
    const placement_candidates = [];
    const enemy_bases = [];

    function coalitionFor(side) {
        if (!coalitionsBySide[side]) {
            const labels = {
                RED:     { en: 'RED Coalition', ar: 'التحالف الأحمر' },
                BLUE:    { en: 'BLUE Coalition', ar: 'التحالف الأزرق' },
                UNKNOWN: { en: 'Unassigned', ar: 'غير مخصص' },
            };
            const l = labels[side] || labels.UNKNOWN;
            coalitionsBySide[side] = { id: 'coalition-' + side.toLowerCase(), side: side, name_en: l.en, name_ar: l.ar, participants: [] };
        }
        return coalitionsBySide[side];
    }

    rawCountries.forEach(function (rc, ci) {
        const name = rc.name || ('country-' + (ci + 1));
        const side = rc.side_hint || sideForCountry(name, opts.sideOverrides);
        const canon = resolveCountry(name);
        const coalition = coalitionFor(side);
        coalition.participants.push(name);
        participants.push({ country: name, country_key: canon ? canon.key : null, side: side, coalition_id: coalition.id });

        const orbat = {
            country: name, country_key: canon ? canon.key : null, side: side, coalition_id: coalition.id,
            name_en: canon ? canon.name_en : null,
            air_bases: [], naval_bases: [], land_bases: [], proposed_units: [], placement_candidates: [],
        };
        const counts = { air: 0, naval: 0, land: 0, total: 0 };
        let proposedForCountry = 0;

        [['air_bases', 'air_base'], ['naval_bases', 'naval_base'], ['land_bases', 'land_base']].forEach(function (pair) {
            const field = pair[0], type = pair[1];
            (rc[field] || []).forEach(function (b, bi) {
                const baseNameAr = String(b.base_name_ar || '').trim();
                const baseNameEn = String(b.base_name_en || '').trim();
                const lat = validLat(b.lat) ? b.lat : null;
                const lon = validLon(b.lon) ? b.lon : null;
                const code = codeFromName(baseNameAr, baseNameEn);
                const key = norm(name) + '.' + field + '[' + bi + ']';
                const hasCoord = lat != null && lon != null;

                const baseObj = {
                    id: side + '-' + (canon ? canon.key.toUpperCase() : 'CTRY') + '-BASE-' + code + '-' + bi,
                    side: side, country: name, country_key: canon ? canon.key : null,
                    base_name_ar: baseNameAr, base_name_en: baseNameEn,
                    site_type: type, lat: lat, lon: lon,
                    exact_unit_position: false, needs_review: true,
                    confidence: hasCoord ? 'medium' : 'low',
                    warning: 'base_known_exact_unit_position_unknown',
                    warnings: ['base_known_exact_unit_position_unknown'],
                    source_type: 'multi_country_step1_orbat',
                    source: reviewSource(file, key),
                };
                country_bases.push(baseObj);
                orbat[field].push(baseObj);
                if (side === 'RED') enemy_bases.push(baseObj);
                counts[type === 'air_base' ? 'air' : (type === 'naval_base' ? 'naval' : 'land')]++;
                counts.total++;

                if (hasCoord) {
                    const anchor = {
                        mention: baseNameEn || baseNameAr || (name + ' ' + type + ' ' + (bi + 1)),
                        base_name_ar: baseNameAr, base_name_en: baseNameEn,
                        side: side, country: name, country_key: canon ? canon.key : null,
                        site_type: type, lat: lat, lon: lon,
                        coordinate_format: 'base_anchor', placement_type: 'base_location_anchor',
                        exact_unit_position: false, needs_review: true, confidence: 'medium',
                        ao_check: 'unknown',
                        source_type: 'multi_country_step1_orbat',
                        source: reviewSource(file, key),
                        warnings: ['base_known_exact_unit_position_unknown', 'coordinate_requires_location_intelligence_review'],
                    };
                    placement_candidates.push(anchor);
                    orbat.placement_candidates.push(anchor);
                } else {
                    warnings.push('missing_coordinates: ' + key);
                }

                (b.units || []).forEach(function (u, ui) {
                    const platform = String(u.platform || '').trim();
                    if (!platform) return;
                    const estimated = (u.estimated_count != null && Number.isFinite(Number(u.estimated_count))) ? Number(u.estimated_count) : null;
                    if (estimated === null) warnings.push('missing_estimated_count: ' + key + '.units[' + ui + ']');
                    const unit = {
                        id: side + '-' + platformCode(platform) + '-' + code + '-' + bi + '-' + ui,
                        side: side, country: name, country_key: canon ? canon.key : null,
                        base_name_ar: baseNameAr, base_name_en: baseNameEn,
                        site_type: type, lat: lat, lon: lon,
                        platform: platform, type_ar: u.type_ar || null,
                        estimated_count: estimated,
                        // MULTI-COUNTRY-DEMO-A #2: canonical review-only candidate marker.
                        source_type: 'external_excel_orbat_candidate',
                        needs_review: true,
                        confidence: (hasCoord && estimated !== null) ? 'medium' : 'low',
                        exact_unit_position: false,
                        warning: 'base_known_exact_unit_position_unknown',
                        warnings: ['base_known_exact_unit_position_unknown', 'ai_information_requires_review'],
                        source: reviewSource(file, key + '.units[' + ui + ']'),
                    };
                    proposed_units.push(unit);
                    orbat.proposed_units.push(unit);
                    proposedForCountry++;
                });
            });
        });

        country_orbats.push(orbat);
        countries.push({
            name: name, country_key: canon ? canon.key : null, name_en: canon ? canon.name_en : null,
            side: side, coalition_id: coalition.id,
            base_counts: counts, proposed_unit_count: proposedForCountry,
            needs_review: true,
        });
    });

    const coalitions = Object.keys(coalitionsBySide).map(function (s) { return coalitionsBySide[s]; });

    // Per-side coalition totals (countries + base + unit roll-up).
    const coalition_totals = {};
    coalitions.forEach(function (co) {
        coalition_totals[co.side] = { coalition_id: co.id, countries: 0, air_bases: 0, naval_bases: 0, land_bases: 0, total_bases: 0, proposed_units: 0 };
    });
    countries.forEach(function (c) {
        const t = coalition_totals[c.side];
        if (!t) return;
        t.countries++;
        t.air_bases += c.base_counts.air;
        t.naval_bases += c.base_counts.naval;
        t.land_bases += c.base_counts.land;
        t.total_bases += c.base_counts.total;
        t.proposed_units += c.proposed_unit_count;
    });

    return {
        coalitions: coalitions,
        participants: participants,
        countries: countries,
        country_orbats: country_orbats,
        country_bases: country_bases,
        proposed_units: proposed_units,
        placement_candidates: placement_candidates,
        enemy_bases: enemy_bases,
        coalition_totals: coalition_totals,
        red_country_count: countries.filter(function (c) { return c.side === 'RED'; }).length,
        blue_country_count: countries.filter(function (c) { return c.side === 'BLUE'; }).length,
        warnings: warnings,
    };
}

// Wrap the model into a full Operational Brief (set_type = multi_country_step1).
function buildBriefFromMultiCountry(input, opts) {
    opts = opts || {};
    const BRIEF = require('./operational-brief');
    const model = buildMultiCountryStep1(input, opts);
    const brief = BRIEF.emptyBrief();
    brief.set_type = 'multi_country_step1';
    brief.document_set_id = 'ds_multicountry_' + BRIEF.sha256(JSON.stringify(model.participants)).slice(0, 12);
    const file = opts.file || (input && input.file) || 'multi_country_step1';
    brief.documents = [{
        filename: file, slots: [], hash: null,
        detected_type: 'multi_country_step1', mdmp_step: null,
        type_label_ar: 'ربط القوات متعدد الدول (الخطوة 1)',
        type_label_en: 'Coalition Step 1 ORBAT', language: 'ar', confidence: 0.6,
    }];
    const ob = brief.operational_brief;
    ob.coalitions = model.coalitions;
    ob.participants = model.participants;
    ob.countries = model.countries;
    ob.country_orbats = model.country_orbats;
    ob.country_bases = model.country_bases;
    ob.proposed_units = model.proposed_units;
    ob.placement_candidates = model.placement_candidates;
    ob.enemy_bases = model.enemy_bases;
    ob.friendly_trial_bases = [];                 // BLUE coalition bases are real bases, not trial anchors
    ob.coalition_totals = model.coalition_totals;
    ob.ambiguities = model.warnings.slice();
    ob.missing_information = model.warnings.filter(function (w) { return /^missing_/.test(w); });
    // Mission/objectives stay empty — Step 1 ORBAT import is force understanding,
    // not a tasked operation. Operator sets the objective on the map before any
    // generation (no final scenario units / tasking created here).
    const report = {
        set_type: 'multi_country_step1',
        countries: model.countries.length,
        red_country_count: model.red_country_count,
        blue_country_count: model.blue_country_count,
        coalition_totals: model.coalition_totals,
        proposed_units: model.proposed_units.length,
        placement_candidates: model.placement_candidates.length,
        warnings: model.warnings,
        review_only_note: 'review/map/demo foundation only — needs_review + exact_unit_position:false on every unit/base/anchor; no final scenario units, tasking, COA, or adjudication',
    };
    return { brief: brief, model: model, report: report };
}

module.exports = {
    CANON,
    norm,
    resolveCountry,
    sideForCountry,
    parseCountrySheets,
    coerceCountries,
    buildMultiCountryStep1,
    buildBriefFromMultiCountry,
};
