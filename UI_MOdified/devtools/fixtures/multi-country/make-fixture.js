#!/usr/bin/env node
/*
 * make-fixture.js — MULTI-COUNTRY-A test workbook generator.
 *
 * Builds a dependency-free .xlsx (stored ZIP + CRC32, no npm `xlsx`) that
 * mirrors the structure of the real نظام المعركة(1).xlsx the owner referenced
 * (which is not on this dev box): ONE sheet per country (Iran, UAE, Qatar,
 * Bahrain, Kuwait, Oman, KSA), each with "Air Bases / Naval Bases / Land Bases"
 * sections, a header row, and base + platform-line rows with coordinates.
 *
 * The same xlsx-text.js reader + multi-country-orbat.js parser consume the real
 * workbook unchanged — drop نظام المعركة(1).xlsx next to this file (or set
 * RMOOZ_MULTICOUNTRY_XLSX) and the test prefers it over this fixture.
 *
 *   require: { COUNTRY_DATA, FIXTURE_SHEETS, buildFixtureWorkbookBuffer }
 *   CLI:     node make-fixture.js   → writes battle-system-fixture.xlsx here
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Realistic-ish Gulf ORBAT (illustrative coordinates; review-only demo data).
const COUNTRY_DATA = [
    { sheet: 'Iran', bases: {
        air_base: [
            { ar: 'قاعدة بندر عباس الجوية', en: 'Bandar Abbas AB', lat: 27.21, lon: 56.38,
              units: [ { p: 'F-14A Tomcat', c: 24, t: 'مقاتلة' }, { p: 'F-4E Phantom', c: 16, t: 'مقاتلة' } ] },
            { ar: 'قاعدة حمدان الجوية', en: 'Hamedan AB', lat: 35.21, lon: 48.65,
              units: [ { p: 'Su-24 Fencer', c: 10, t: 'قاذفة' } ] },
        ],
        naval_base: [
            { ar: 'ميناء بندر عباس البحري', en: 'Bandar Abbas Naval', lat: 27.15, lon: 56.21,
              units: [ { p: 'Kilo Submarine', c: 3, t: 'غواصة' }, { p: 'Moudge Frigate', c: 2, t: 'فرقاطة' } ] },
        ],
        land_base: [
            { ar: 'قاعدة شيراز البرية', en: 'Shiraz Land', lat: 29.60, lon: 52.53,
              units: [ { p: 'S-300 SAM', c: 4, t: 'دفاع جوي' }, { p: 'Armored Battalion', c: 1, t: 'مدرعات' } ] },
        ],
    } },
    { sheet: 'UAE', bases: {
        air_base: [
            { ar: 'قاعدة الظفرة الجوية', en: 'Al Dhafra AB', lat: 24.25, lon: 54.55,
              units: [ { p: 'F-16E Block 60', c: 24, t: 'مقاتلة' }, { p: 'Mirage 2000-9', c: 12, t: 'مقاتلة' } ] },
        ],
        naval_base: [
            { ar: 'قاعدة زايد البحرية', en: 'Zayed Port Naval', lat: 24.52, lon: 54.37,
              units: [ { p: 'Baynunah Corvette', c: 6, t: 'كورفيت' } ] },
        ],
        land_base: [
            { ar: 'قاعدة السلع البرية', en: 'As Sila Land', lat: 24.02, lon: 51.80,
              units: [ { p: 'Patriot PAC-3', c: 3, t: 'دفاع جوي' } ] },
        ],
    } },
    { sheet: 'Qatar', bases: {
        air_base: [
            { ar: 'قاعدة العديد الجوية', en: 'Al Udeid AB', lat: 25.117, lon: 51.315,
              units: [ { p: 'Rafale', c: 12, t: 'مقاتلة' }, { p: 'F-15QA', c: 12, t: 'مقاتلة' } ] },
        ],
        naval_base: [
            { ar: 'قاعدة الدوحة البحرية', en: 'Doha Naval', lat: 25.28, lon: 51.60,
              units: [ { p: 'Al Zubarah Corvette', c: 4, t: 'كورفيت' } ] },
        ],
        land_base: [
            { ar: 'قاعدة الريان البرية', en: 'Al Rayyan Land', lat: 25.28, lon: 51.42,
              units: [ { p: 'NASAMS', c: 2, t: 'دفاع جوي' } ] },
        ],
    } },
    { sheet: 'Bahrain', bases: {
        air_base: [
            { ar: 'قاعدة عيسى الجوية', en: 'Isa AB', lat: 25.92, lon: 50.59,
              units: [ { p: 'F-16C Block 70', c: 16, t: 'مقاتلة' } ] },
        ],
        naval_base: [
            { ar: 'قاعدة سلمان البحرية', en: 'Salman Naval', lat: 26.20, lon: 50.65,
              units: [ { p: 'Oliver Hazard Perry Frigate', c: 1, t: 'فرقاطة' } ] },
        ],
        land_base: [
            { ar: 'قاعدة الرفاع البرية', en: 'Riffa Land', lat: 26.13, lon: 50.55,
              units: [ { p: 'Patriot PAC-2', c: 2, t: 'دفاع جوي' } ] },
        ],
    } },
    { sheet: 'Kuwait', bases: {
        air_base: [
            { ar: 'قاعدة أحمد الجابر الجوية', en: 'Ahmad al-Jaber AB', lat: 28.93, lon: 47.79,
              units: [ { p: 'F/A-18C Hornet', c: 32, t: 'مقاتلة' }, { p: 'Eurofighter Typhoon', c: 8, t: 'مقاتلة' } ] },
        ],
        naval_base: [
            { ar: 'قاعدة محمد الأحمد البحرية', en: 'Mohammed Al-Ahmad Naval', lat: 29.00, lon: 48.13,
              units: [ { p: 'Um Almaradim FAC', c: 8, t: 'زورق' } ] },
        ],
        land_base: [
            { ar: 'قاعدة علي السالم البرية', en: 'Ali Al Salem Land', lat: 29.35, lon: 47.52,
              units: [ { p: 'Patriot PAC-3', c: 5, t: 'دفاع جوي' } ] },
        ],
    } },
    { sheet: 'Oman', bases: {
        air_base: [
            { ar: 'قاعدة المصنعة الجوية', en: 'Al Musannah AB', lat: 23.63, lon: 57.49,
              units: [ { p: 'F-16C Block 50', c: 12, t: 'مقاتلة' }, { p: 'Hawk 203', c: 12, t: 'هجوم خفيف' } ] },
        ],
        naval_base: [
            { ar: 'قاعدة سعيد بن سلطان البحرية', en: 'Said bin Sultan Naval', lat: 23.60, lon: 58.50,
              units: [ { p: 'Khareef Corvette', c: 3, t: 'كورفيت' } ] },
        ],
        land_base: [
            { ar: 'قاعدة ثمريت البرية', en: 'Thumrait Land', lat: 17.66, lon: 54.02,
              units: [ { p: 'Rapier SAM', c: 2, t: 'دفاع جوي' } ] },
        ],
    } },
    { sheet: 'KSA', bases: {
        air_base: [
            { ar: 'قاعدة الملك عبدالعزيز الجوية', en: 'King Abdulaziz AB Dhahran', lat: 26.27, lon: 50.15,
              units: [ { p: 'F-15SA Eagle', c: 24, t: 'مقاتلة' }, { p: 'Typhoon', c: 12, t: 'مقاتلة' }, { p: 'Tornado IDS', c: 12, t: 'هجوم' } ] },
        ],
        naval_base: [
            { ar: 'قاعدة الجبيل البحرية', en: 'Jubail Naval', lat: 27.03, lon: 49.66,
              units: [ { p: 'Al Riyadh Frigate', c: 3, t: 'فرقاطة' }, { p: 'Avenger MCM', c: 2, t: 'كاسحة ألغام' } ] },
        ],
        land_base: [
            { ar: 'قاعدة حفر الباطن البرية', en: 'Hafr Al-Batin Land', lat: 28.43, lon: 45.96,
              units: [ { p: 'Patriot PAC-3', c: 6, t: 'دفاع جوي' }, { p: 'PAC-3 MSE', c: 4, t: 'دفاع جوي' } ] },
        ],
    } },
];

const HEADER = ['اسم القاعدة', 'Base Name EN', 'Lat', 'Lon', 'Platform', 'Count', 'Type'];
const SECTION_TITLE = {
    air_base:   'Air Bases — قواعد جوية',
    naval_base: 'Naval Bases — قواعد بحرية',
    land_base:  'Land Bases — قواعد برية',
};

// One country → a row matrix (section title, header, base + continuation rows).
function sheetToRows(country) {
    const rows = [];
    ['air_base', 'naval_base', 'land_base'].forEach(function (type) {
        const list = (country.bases && country.bases[type]) || [];
        if (!list.length) return;
        rows.push([SECTION_TITLE[type]]);
        rows.push(HEADER.slice());
        list.forEach(function (b) {
            const u0 = (b.units && b.units[0]) || {};
            rows.push([b.ar, b.en, b.lat, b.lon, u0.p || '', u0.c == null ? '' : u0.c, u0.t || '']);
            (b.units || []).slice(1).forEach(function (u) {
                rows.push(['', '', '', '', u.p || '', u.c == null ? '' : u.c, u.t || '']);
            });
        });
    });
    return rows;
}

const FIXTURE_SHEETS = COUNTRY_DATA.map(function (c) { return { name: c.sheet, rows: sheetToRows(c) }; });

// ── Minimal dependency-free .xlsx writer (stored ZIP + CRC32) ─────────────
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        let c = (crc ^ buf[i]) & 0xFF;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
function xmlEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch];
    });
}
function colLetter(n) {
    let s = ''; n++;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - (m + 1)) / 26; }
    return s;
}
function worksheetXml(rows) {
    const body = rows.map(function (row, ri) {
        const cells = row.map(function (v, ci) {
            if (v === '' || v == null) return '';
            const ref = colLetter(ci) + (ri + 1);
            if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"><v>' + v + '</v></c>';
            return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(String(v)) + '</t></is></c>';
        }).join('');
        return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + body + '</sheetData></worksheet>';
}
function zipStore(files) {
    const locals = [], central = [];
    let offset = 0;
    files.forEach(function (f) {
        const nameBuf = Buffer.from(f.name, 'utf8');
        const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
        const crc = crc32(data);
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
        lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
        lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
        locals.push(lh, nameBuf, data);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
        ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
        ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
        ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf);
        offset += lh.length + nameBuf.length + data.length;
    });
    const localBuf = Buffer.concat(locals);
    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16); eocd.writeUInt16LE(0, 20);
    return Buffer.concat([localBuf, cdBuf, eocd]);
}

function buildFixtureWorkbookBuffer() {
    const sheets = FIXTURE_SHEETS;
    const NS = 'http://schemas.openxmlformats.org/';
    const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) { return '<sheet name="' + xmlEsc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
        '</sheets></workbook>';
    const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + NS + 'package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '</Relationships>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="' + NS + 'package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '</Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="' + NS + 'package/2006/relationships">' +
        '<Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>';
    const files = [
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rootRels },
        { name: 'xl/workbook.xml', data: workbookXml },
        { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: worksheetXml(s.rows) }); });
    return zipStore(files);
}

module.exports = { COUNTRY_DATA, FIXTURE_SHEETS, sheetToRows, buildFixtureWorkbookBuffer };

if (require.main === module) {
    const out = path.join(__dirname, 'battle-system-fixture.xlsx');
    fs.writeFileSync(out, buildFixtureWorkbookBuffer());
    console.log('wrote ' + out + ' (' + FIXTURE_SHEETS.length + ' country sheets)');
}
