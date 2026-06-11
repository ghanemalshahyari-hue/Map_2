/**
 * JSONC parser — MDMP-EXTERNAL-1 / G-1.
 *
 * External staff tools (the other app's MDMP pipeline) emit "JSON" with
 * comments — `// line`, trailing `value, // note`, and `/* block *​/` — which
 * strict JSON.parse rejects. This is a small, dependency-free, STRING-AWARE
 * cleaner: comments and trailing commas are removed only OUTSIDE string
 * literals, so Arabic narrative containing `//` or `,}` sequences is never
 * corrupted. Regex-based stripping is not safe here (it broke on the real
 * step5.json trailing-comment case) — hence the character walker.
 *
 * parseJsonc(text) →
 *   { ok: true,  value, mode: 'strict' | 'jsonc' }
 *   { ok: false, error }
 */
'use strict';

// Remove // and /* */ comments and trailing commas, tracking string state.
// Comment bytes are replaced with spaces so JSON.parse error positions still
// roughly line up with the original text.
function stripJsonc(text) {
    const src = String(text);
    const n = src.length;
    let out = '';
    let i = 0;
    let inString = false;

    while (i < n) {
        const ch = src[i];

        if (inString) {
            out += ch;
            if (ch === '\\' && i + 1 < n) {        // escape — copy next char blindly
                out += src[i + 1];
                i += 2;
                continue;
            }
            if (ch === '"') inString = false;
            i++;
            continue;
        }

        if (ch === '"') { inString = true; out += ch; i++; continue; }

        // line comment
        if (ch === '/' && src[i + 1] === '/') {
            while (i < n && src[i] !== '\n') { out += ' '; i++; }
            continue;
        }
        // block comment
        if (ch === '/' && src[i + 1] === '*') {
            out += '  '; i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
                out += (src[i] === '\n') ? '\n' : ' ';
                i++;
            }
            if (i < n) { out += '  '; i += 2; }
            continue;
        }
        // trailing comma: lookahead over whitespace/comments to the next
        // significant char; drop the comma when it's a closing } or ].
        if (ch === ',') {
            let j = i + 1;
            while (j < n) {
                const c = src[j];
                if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { j++; continue; }
                if (c === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
                if (c === '/' && src[j + 1] === '*') {
                    j += 2;
                    while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
                    if (j < n) j += 2;
                    continue;
                }
                break;
            }
            if (j < n && (src[j] === '}' || src[j] === ']')) { out += ' '; i++; continue; }
            out += ch; i++;
            continue;
        }

        out += ch;
        i++;
    }
    return out;
}

function parseJsonc(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return { ok: false, error: 'empty input' };
    }
    try { return { ok: true, value: JSON.parse(text), mode: 'strict' }; } catch (_) {}
    try { return { ok: true, value: JSON.parse(stripJsonc(text)), mode: 'jsonc' }; }
    catch (e) { return { ok: false, error: e && e.message }; }
}

module.exports = { parseJsonc, stripJsonc };
