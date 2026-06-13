/**
 * Minimal, dependency-free XLSX → sheets/rows extractor.
 * DOC-UNDERSTANDING-1 / MULTI-COUNTRY-A.
 *
 * An .xlsx is a ZIP of XML parts. We read the parts we need directly with
 * Node's built-in zlib (no python, no npm `xlsx` package) so the analyze gate
 * works fully offline — the same approach as docx-text.js (`word/document.xml`),
 * generalized to read MULTIPLE entries:
 *
 *   xl/workbook.xml            → ordered sheet names + r:id refs
 *   xl/_rels/workbook.xml.rels → r:id → worksheets/sheetN.xml target
 *   xl/sharedStrings.xml       → the shared string table (t="s" cells)
 *   xl/worksheets/sheetN.xml   → rows/cells (shared / inline / number / bool)
 *
 * extractWorkbook(bufferOrPath) → { sheets: [{ name, rows: [[cellText,...]] }] }
 * Returns { sheets: [] } on any failure — never throws. Rows are positional
 * (column letter → index), gaps filled with '' so callers can read by column.
 */
'use strict';

const fs   = require('fs');
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;   // End of Central Directory
const CEN_SIG  = 0x02014b50;   // Central directory file header
const LOC_SIG  = 0x04034b50;   // Local file header

// Read EVERY entry from the central directory into { name: Buffer } (inflated).
function readAllZipEntries(buf) {
    const out = {};
    let eocd = -1;
    const minPos = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= minPos; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) return out;
    const total = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < total; n++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
        const method = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const fnLen = buf.readUInt16LE(p + 28);
        const exLen = buf.readUInt16LE(p + 30);
        const cmLen = buf.readUInt16LE(p + 32);
        const locOff = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + fnLen);
        if (locOff + 30 <= buf.length && buf.readUInt32LE(locOff) === LOC_SIG) {
            const lFn = buf.readUInt16LE(locOff + 26);
            const lEx = buf.readUInt16LE(locOff + 28);
            const dataStart = locOff + 30 + lFn + lEx;
            const data = buf.subarray(dataStart, dataStart + compSize);
            try {
                if (method === 0) out[name] = Buffer.from(data);
                else if (method === 8) out[name] = zlib.inflateRawSync(data);
            } catch (_) { /* skip unreadable entry */ }
        }
        p += 46 + fnLen + exLen + cmLen;
    }
    return out;
}

function decodeEntities(s) {
    return String(s == null ? '' : s)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCp(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
        .replace(/&amp;/g, '&');
}
function safeCp(n) { try { return String.fromCodePoint(n); } catch (_) { return ''; } }

// Concatenate all <t>…</t> text inside a fragment (handles rich-text runs).
function joinText(fragment) {
    let s = '';
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m;
    while ((m = re.exec(fragment))) s += m[1];
    return decodeEntities(s);
}

function parseSharedStrings(xml) {
    const table = [];
    if (!xml) return table;
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml))) table.push(joinText(m[1]));
    return table;
}

// Column letters (A, B, …, AA) → zero-based index.
function colIndex(ref) {
    const m = /^([A-Z]+)/.exec(String(ref || '').toUpperCase());
    if (!m) return -1;
    const s = m[1];
    let n = 0;
    for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
}

function attr(tag, name) {
    const m = new RegExp(name + '="([^"]*)"').exec(tag);
    return m ? m[1] : null;
}

function parseSheet(xml, shared) {
    const rows = [];
    if (!xml) return rows;
    const dataMatch = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
    const body = dataMatch ? dataMatch[1] : xml;
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
    let rm;
    while ((rm = rowRe.exec(body))) {
        const inner = rm[1] || '';
        const cells = [];
        let maxCol = -1;
        const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cm;
        while ((cm = cellRe.exec(inner))) {
            const cTag = cm[1] || '';
            const cBody = cm[2] || '';
            const ref = attr(cTag, 'r');
            const t = attr(cTag, 't');
            let value = '';
            if (t === 'inlineStr') {
                value = joinText(cBody);
            } else {
                const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cBody);
                const raw = vm ? vm[1] : '';
                if (t === 's') {
                    const idx = parseInt(decodeEntities(raw), 10);
                    value = (Number.isFinite(idx) && shared[idx] != null) ? shared[idx] : '';
                } else if (t === 'b') {
                    value = decodeEntities(raw) === '1' ? 'TRUE' : 'FALSE';
                } else {
                    value = decodeEntities(raw);
                }
            }
            const ci = ref ? colIndex(ref) : cells.length;
            const at = ci >= 0 ? ci : cells.length;
            cells[at] = value;
            if (at > maxCol) maxCol = at;
        }
        const row = [];
        for (let i = 0; i <= maxCol; i++) row.push(cells[i] == null ? '' : String(cells[i]));
        rows.push(row);
    }
    return rows;
}

// Map sheet display-names (workbook.xml order) → worksheet XML part.
function resolveSheetParts(entries) {
    const wb = entries['xl/workbook.xml'] ? entries['xl/workbook.xml'].toString('utf8') : '';
    const rels = entries['xl/_rels/workbook.xml.rels'] ? entries['xl/_rels/workbook.xml.rels'].toString('utf8') : '';
    const relMap = {};
    let rm;
    const relRe = /<Relationship\b[^>]*\/>/g;
    while ((rm = relRe.exec(rels))) {
        const id = attr(rm[0], 'Id');
        let target = attr(rm[0], 'Target');
        if (id && target) {
            target = target.replace(/^\/?xl\//, '').replace(/^\//, '');
            relMap[id] = target;
        }
    }
    const sheets = [];
    const sheetRe = /<sheet\b[^>]*\/>/g;
    let sm, ordinal = 0;
    while ((sm = sheetRe.exec(wb))) {
        ordinal++;
        const name = decodeEntities(attr(sm[0], 'name') || ('Sheet' + ordinal));
        const rid = attr(sm[0], 'r:id') || attr(sm[0], 'r:Id') || attr(sm[0], 'id');
        let part = rid && relMap[rid] ? ('xl/' + relMap[rid]) : null;
        if (!part || !entries[part]) part = 'xl/worksheets/sheet' + ordinal + '.xml';
        sheets.push({ name, part });
    }
    return sheets;
}

function extractWorkbook(input) {
    try {
        const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
        if (buf.length < 4 || buf.readUInt32LE(0) !== LOC_SIG) return { sheets: [] };
        const entries = readAllZipEntries(buf);
        const shared = parseSharedStrings(entries['xl/sharedStrings.xml'] ? entries['xl/sharedStrings.xml'].toString('utf8') : '');
        const parts = resolveSheetParts(entries);
        const sheets = parts.map(function (s) {
            const xml = entries[s.part] ? entries[s.part].toString('utf8') : '';
            return { name: s.name, rows: parseSheet(xml, shared) };
        });
        return { sheets };
    } catch (_) {
        return { sheets: [] };
    }
}

module.exports = { extractWorkbook, readAllZipEntries, colIndex };
