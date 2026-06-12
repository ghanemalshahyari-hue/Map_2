/**
 * Minimal, dependency-free DOCX → plain-text extractor.
 * DOC-UNDERSTANDING-1 / Phase D (JS gate).
 *
 * A .docx is a ZIP whose `word/document.xml` holds the body text. We read
 * that one entry directly with Node's built-in zlib (no python, no npm
 * package) so the analyze gate works fully offline. The extracted text
 * feeds the deterministic classifier + side-segmenter; the heavier docling
 * + LLM extraction (Python) layers on top when an endpoint is reachable.
 *
 * extractDocxText(bufferOrPath) → string ('' on any failure — never throws).
 */
'use strict';

const fs   = require('fs');
const zlib = require('zlib');

const EOCD_SIG  = 0x06054b50;   // End of Central Directory
const CEN_SIG   = 0x02014b50;   // Central directory file header
const LOC_SIG   = 0x04034b50;   // Local file header

// Find the `word/document.xml` entry via the central directory and inflate it.
function readZipEntry(buf, wantName) {
    // Locate EOCD by scanning backwards (comment ≤ 65535 bytes).
    let eocd = -1;
    const minPos = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= minPos; i--) {
        if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
    }
    if (eocd < 0) return null;

    const total = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);     // central directory offset

    for (let n = 0; n < total; n++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break;
        const method   = buf.readUInt16LE(p + 10);
        const compSize = buf.readUInt32LE(p + 20);
        const fnLen    = buf.readUInt16LE(p + 28);
        const exLen    = buf.readUInt16LE(p + 30);
        const cmLen    = buf.readUInt16LE(p + 32);
        const locOff   = buf.readUInt32LE(p + 42);
        const name     = buf.toString('utf8', p + 46, p + 46 + fnLen);

        if (name === wantName) {
            // Compute data start from the LOCAL header (its name/extra lengths
            // can differ from the central record).
            if (buf.readUInt32LE(locOff) !== LOC_SIG) return null;
            const lFn = buf.readUInt16LE(locOff + 26);
            const lEx = buf.readUInt16LE(locOff + 28);
            const dataStart = locOff + 30 + lFn + lEx;
            const data = buf.subarray(dataStart, dataStart + compSize);
            if (method === 0) return Buffer.from(data);              // stored
            if (method === 8) return zlib.inflateRawSync(data);      // deflate
            return null;
        }
        p += 46 + fnLen + exLen + cmLen;
    }
    return null;
}

function decodeEntities(s) {
    return s
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCp(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => safeCp(parseInt(d, 10)))
        .replace(/&amp;/g, '&');     // last, so we don't double-decode
}
function safeCp(n) { try { return String.fromCodePoint(n); } catch (_) { return ''; } }

// WordprocessingML → text: paragraphs/tabs/breaks become whitespace; tags drop.
function documentXmlToText(xml) {
    let s = xml
        .replace(/<w:tab\b[^>]*\/?>/g, '\t')
        .replace(/<w:br\b[^>]*\/?>/g, '\n')
        .replace(/<\/w:p>/g, '\n')
        .replace(/<[^>]+>/g, '');
    s = decodeEntities(s);
    return s.replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function extractDocxText(input) {
    try {
        const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
        // A real DOCX begins with the ZIP local-header magic "PK\x03\x04".
        if (buf.length < 4 || buf.readUInt32LE(0) !== LOC_SIG) return '';
        const xml = readZipEntry(buf, 'word/document.xml');
        if (!xml) return '';
        return documentXmlToText(xml.toString('utf8'));
    } catch (_) {
        return '';
    }
}

module.exports = { extractDocxText, documentXmlToText };
