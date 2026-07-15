#!/usr/bin/env node
/**
 * scripts/baseline-duplicate-key-check.js
 *
 * JSON.parse silently keeps only the LAST occurrence of a duplicate object
 * key and discards the earlier one with no error. A hand-edited
 * scripts/test-baseline-known-failures.json can end up with two entries for
 * the same test filename (exactly what happened on 2026-07-15: a corrected
 * quarantine entry was inserted as a NEW key instead of replacing the
 * existing one, and the earlier, real entry silently won on parse while the
 * new one sat dead in the file). This scans the RAW file text — before
 * JSON.parse ever runs — for repeated top-level filename keys inside
 * known_failures, so that mistake fails loudly instead of hiding silently.
 */
'use strict';

const FILENAME_KEY_RE = /^[ \t]*"(test-[^"]+\.js)"\s*:\s*\{/gm;

function findDuplicateFilenameKeys(rawText) {
    const seen = new Set();
    const dupes = new Set();
    FILENAME_KEY_RE.lastIndex = 0;
    let m;
    while ((m = FILENAME_KEY_RE.exec(rawText))) {
        const key = m[1];
        if (seen.has(key)) dupes.add(key);
        seen.add(key);
    }
    return Array.from(dupes).sort();
}

module.exports = { findDuplicateFilenameKeys };
