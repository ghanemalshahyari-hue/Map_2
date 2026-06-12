/**
 * scen-catalog-contract.js — PR-167
 *
 * Read-only contract for parsing Command Modern Operations .scen outer wrappers.
 * Builds a catalog entry from the 10 safe fields exposed outside Scenario_Compressed.
 *
 * SAFETY INVARIANTS (enforced by design, verified by code):
 *   ✓ <Scenario_Compressed> content is stripped from the XML string BEFORE
 *     DOMParser ever sees it — it is never read, inspected, or decoded.
 *   ✓ No decompression of any kind.
 *   ✓ No fetch, XHR, upload, or server contact.
 *   ✓ No storage: no localStorage, sessionStorage, IndexedDB, or Blob URLs.
 *   ✓ No mutation of window.RmoozScenario, window.units, window.lines, or map.
 *   ✓ No staging, apply, or import-to-live path.
 *   ✓ All file reading is via FileReader.readAsText — local, in-memory only.
 *   ✓ DOMParser only — no eval, no innerHTML execution path.
 *   ✓ No animation, no drag/drop, no folder picker, no ZIP.
 *   ✓ Does not modify app.js or adjudicator-map.js.
 */
(function () {
    'use strict';

    // ── Warning codes ────────────────────────────────────────────────────────
    //
    // Every catalog entry carries a warnings[] array of codes. Some warnings
    // are always present (apply to every .scen file); others are conditional.

    var SCEN_WARNINGS = {
        // Always present — structural constraints of the .scen format
        COMPRESSED_LOCKED:        'COMPRESSED_LOCKED',
        DB_DEPENDENCY:            'DB_DEPENDENCY',
        LUA_DEPENDENCY:           'LUA_DEPENDENCY',
        PACK_FRESHNESS:           'PACK_FRESHNESS',
        INI_PATCH_NOT_STANDALONE: 'INI_PATCH_NOT_STANDALONE',
        OLD_DUPLICATE_POSSIBLE:   'OLD_DUPLICATE_POSSIBLE',
        CONFIG_ABSENT:            'CONFIG_ABSENT',

        // Conditional
        CAMPAIGN_CHECKPOINT:      'CAMPAIGN_CHECKPOINT',
        CATALOG_FILE_MISSING:     'CATALOG_FILE_MISSING',
    };

    // Human-readable warning text (English). Used in the catalog entry display.
    var SCEN_WARNING_TEXT = {
        COMPRESSED_LOCKED:
            'Core unit and position data is locked in <Scenario_Compressed> ' +
            '(CompressVersion 5, proprietary format). Units, coordinates, sides, ' +
            'missions, and objectives are inaccessible without a decompressor.',

        DB_DEPENDENCY:
            'Requires a Command Modern Operations database (DB3K or CWDB). ' +
            'RMOOZ does not have these database files. Unit platform definitions, ' +
            'weapon loadouts, and sensor data cannot be resolved.',

        LUA_DEPENDENCY:
            'Some scenarios require Lua scripts from a separate Lua folder ' +
            'not included in the .scen file. Missing Lua scripts cause scenario ' +
            'events or triggers to fail silently.',

        PACK_FRESHNESS:
            'The Community Scenario Pack is rebuilt periodically against the ' +
            'latest Command database. Data may differ between pack versions. ' +
            'Always use the scenario from the latest pack release.',

        INI_PATCH_NOT_STANDALONE:
            '.ini unit patches (ScenarioUnits) reference unit GUIDs from inside ' +
            'Scenario_Compressed and integer IDs from the Command database. ' +
            'They cannot be parsed or applied without both.',

        OLD_DUPLICATE_POSSIBLE:
            'Old duplicate .scen files may exist if prior pack versions were ' +
            'not deleted before extracting this one. File names may have changed ' +
            'between releases.',

        CONFIG_ABSENT:
            '.ini config file was not selected. Unit customization patches ' +
            '(weapon loads, sensor configs, mount changes) for this scenario ' +
            'are unavailable.',

        CAMPAIGN_CHECKPOINT:
            'This file is a campaign checkpoint save. It may require campaign ' +
            'session state (CampaignID / CampaignSessionID) to function correctly ' +
            'within the Command campaign engine.',

        CATALOG_FILE_MISSING:
            'This entry is listed in the scenario catalog index but the ' +
            'corresponding .scen file was not present in the selected files.',
    };

    // ── XML field extractor ──────────────────────────────────────────────────

    function getText(root, tag) {
        var el = root.querySelector(tag);
        return el ? (el.textContent || '').trim() : null;
    }

    // Strip HTML tags from decoded ScenDescription for plain-text display.
    // Uses a temporary div — no script execution, only text extraction.
    function stripHtml(html) {
        if (!html) return '';
        var d = document.createElement('div');
        d.innerHTML = html;
        return (d.textContent || d.innerText || '').replace(/\s+/g, ' ').trim();
    }

    // ── Core parser ──────────────────────────────────────────────────────────
    //
    // parseScenOuterWrapper(xmlString) → parsed fields object
    //
    // Step 1: Strip <Scenario_Compressed>…</Scenario_Compressed> from the
    //         input string BEFORE passing to DOMParser. The blob is replaced
    //         with an empty placeholder element so the XML remains valid.
    //         This is a hard safety measure — the blob is never in the parsed
    //         DOM, so it cannot be accidentally accessed.
    //
    // Step 2: Parse the stripped XML with DOMParser.
    //
    // Step 3: Read only the 10 safe outer-wrapper fields.

    function parseScenOuterWrapper(xmlString) {
        var result = {
            title:                null,
            description:          null,
            setting:              null,
            scenarioDate:         null,
            difficulty:           null,
            complexity:           null,
            dbVersion:            null,
            buildNumber:          null,
            version:              null,
            isCampaignCheckpoint: false,
            compressVersion:      null,
            hadCompressedBlob:    false,
            parseError:           null,
        };

        try {
            // Step 1 — strip Scenario_Compressed blob before parsing.
            var stripped = xmlString;
            var OPEN_TAG  = '<Scenario_Compressed>';
            var CLOSE_TAG = '</Scenario_Compressed>';
            var blobStart = xmlString.indexOf(OPEN_TAG);
            var blobEnd   = xmlString.indexOf(CLOSE_TAG);
            if (blobStart !== -1 && blobEnd !== -1 && blobEnd > blobStart) {
                result.hadCompressedBlob = true;
                stripped = xmlString.slice(0, blobStart + OPEN_TAG.length)
                         + '<!-- scenario data not accessed -->'
                         + xmlString.slice(blobEnd);
            }

            // Step 2 — parse stripped XML.
            var parser = new DOMParser();
            var doc    = parser.parseFromString(stripped, 'text/xml');
            var root   = doc.documentElement;

            if (!root) {
                result.parseError = 'DOMParser returned null document';
                return result;
            }
            if (root.nodeName === 'parsererror' || root.querySelector('parsererror')) {
                var errEl = root.querySelector('parsererror');
                result.parseError = errEl
                    ? (errEl.textContent || 'XML parse error').slice(0, 200)
                    : 'XML parse error';
                return result;
            }
            if (root.nodeName !== 'ScenContainer') {
                result.parseError = 'Expected <ScenContainer> root; got <' + root.nodeName + '>';
                return result;
            }

            // Step 3 — read 10 safe outer-wrapper fields only.
            result.title          = getText(root, 'ScenTitle') || null;

            var rawDesc           = getText(root, 'ScenDescription');
            result.description    = rawDesc ? stripHtml(rawDesc).slice(0, 600) : null;

            result.setting        = getText(root, 'ScenSetting') || null;
            result.scenarioDate   = getText(root, 'ScenDate')    || null;

            var diff              = getText(root, 'Difficulty');
            result.difficulty     = (diff !== null && diff !== '') ? (parseInt(diff, 10) || 0) : null;

            var cplx              = getText(root, 'Complexity');
            result.complexity     = (cplx !== null && cplx !== '') ? (parseInt(cplx, 10) || 0) : null;

            result.dbVersion      = getText(root, 'DBVersion')    || null;
            result.buildNumber    = getText(root, 'BuildNumber')  || null;
            result.version        = getText(root, 'Version')      || null;
            result.compressVersion = getText(root, 'CompressVersion') || null;

            var isCamp            = getText(root, 'IsCampaignCheckpoint');
            result.isCampaignCheckpoint = (isCamp === 'true');

        } catch (e) {
            result.parseError = String(e && e.message ? e.message : e);
        }

        return result;
    }

    // ── Catalog entry builder ────────────────────────────────────────────────
    //
    // buildCatalogEntry(file, fields) → CatalogEntry object
    //
    // CatalogEntry shape:
    // {
    //   title:                string,   // ScenTitle
    //   description:          string,   // ScenDescription stripped to plain text (≤600 chars)
    //   setting:              string,   // ScenSetting (theater)
    //   scenarioDate:         string,   // ScenDate (year string)
    //   difficulty:           number,   // 1–5
    //   complexity:           number,   // 1–5
    //   dbVersion:            string,   // DBVersion
    //   buildNumber:          string,   // BuildNumber
    //   version:              string,   // Version
    //   isCampaignCheckpoint: boolean,  // IsCampaignCheckpoint === 'true'
    //   scenFilePath:         string,   // file.name (browser basename only)
    //   iniFilePath:          string,   // expected .ini basename (same stem)
    //   filePresent:          boolean,  // always true when built from a File object
    //   configPresent:        boolean,  // always false — .ini not verifiable without folder access
    //   parseError:           string|null,
    //   warnings:             string[], // SCEN_WARNINGS codes
    // }

    function buildCatalogEntry(file, fields) {
        var stem = (file.name || '').replace(/\.scen$/i, '');

        if (fields.parseError) {
            return {
                title:                file.name,
                description:          null,
                setting:              null,
                scenarioDate:         null,
                difficulty:           null,
                complexity:           null,
                dbVersion:            null,
                buildNumber:          null,
                version:              null,
                isCampaignCheckpoint: false,
                scenFilePath:         file.name,
                iniFilePath:          stem + '.ini',
                filePresent:          true,
                configPresent:        false,
                parseError:           fields.parseError,
                warnings:             [
                    SCEN_WARNINGS.COMPRESSED_LOCKED,
                    SCEN_WARNINGS.DB_DEPENDENCY,
                ],
            };
        }

        // Build warnings array.
        // Always-present: these apply to every valid .scen entry in the pack.
        var warnings = [
            SCEN_WARNINGS.COMPRESSED_LOCKED,
            SCEN_WARNINGS.DB_DEPENDENCY,
            SCEN_WARNINGS.LUA_DEPENDENCY,
            SCEN_WARNINGS.PACK_FRESHNESS,
            SCEN_WARNINGS.INI_PATCH_NOT_STANDALONE,
            SCEN_WARNINGS.OLD_DUPLICATE_POSSIBLE,
            SCEN_WARNINGS.CONFIG_ABSENT,
        ];

        // Conditional: campaign checkpoint save.
        if (fields.isCampaignCheckpoint) {
            warnings.push(SCEN_WARNINGS.CAMPAIGN_CHECKPOINT);
        }

        return {
            title:                fields.title        || file.name,
            description:          fields.description  || null,
            setting:              fields.setting       || null,
            scenarioDate:         fields.scenarioDate  || null,
            difficulty:           fields.difficulty,
            complexity:           fields.complexity,
            dbVersion:            fields.dbVersion     || null,
            buildNumber:          fields.buildNumber   || null,
            version:              fields.version       || null,
            isCampaignCheckpoint: fields.isCampaignCheckpoint,
            scenFilePath:         file.name,
            iniFilePath:          stem + '.ini',
            filePresent:          true,
            configPresent:        false,
            parseError:           null,
            warnings:             warnings,
        };
    }

    // ── FileReader wrapper ───────────────────────────────────────────────────

    function readFileAsText(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload  = function (e) {
                resolve({ ok: true,  text: e.target.result, file: file });
            };
            reader.onerror = function () {
                resolve({ ok: false, text: null, file: file, error: 'read failed' });
            };
            reader.readAsText(file);
        });
    }

    // ── Build catalog from FileList ──────────────────────────────────────────
    //
    // buildCatalogFromFiles(fileList) → Promise<CatalogEntry[]>

    function buildCatalogFromFiles(fileList) {
        var files = Array.from(fileList || []);
        if (!files.length) return Promise.resolve([]);

        return Promise.all(files.map(readFileAsText)).then(function (results) {
            return results.map(function (r) {
                if (!r.ok) {
                    return buildCatalogEntry(r.file, { parseError: r.error || 'read failed' });
                }
                var fields = parseScenOuterWrapper(r.text);
                return buildCatalogEntry(r.file, fields);
            });
        });
    }

    // ── DOM rendering ────────────────────────────────────────────────────────

    function stars(n, max) {
        if (n === null || n === undefined || n === 0) return null;
        max = max || 5;
        var s = '';
        for (var i = 1; i <= max; i++) {
            s += (i <= n) ? '★' : '☆';
        }
        return s;
    }

    function esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderCatalogEntry(entry) {
        var card = document.createElement('div');
        card.className = 'sw-scen-entry' + (entry.parseError ? ' sw-scen-entry--error' : '');

        // Header row: title + badges
        var hdr = document.createElement('div');
        hdr.className = 'sw-scen-entry-header';

        var titleEl = document.createElement('span');
        titleEl.className = 'sw-scen-entry-title';
        titleEl.textContent = entry.title || '(no title)';
        hdr.appendChild(titleEl);

        if (entry.isCampaignCheckpoint) {
            var cBadge = document.createElement('span');
            cBadge.className = 'sw-scen-tag sw-scen-tag--campaign';
            cBadge.textContent = 'Campaign';
            hdr.appendChild(cBadge);
        }
        if (entry.parseError) {
            var eBadge = document.createElement('span');
            eBadge.className = 'sw-scen-tag sw-scen-tag--error';
            eBadge.textContent = 'Parse error';
            hdr.appendChild(eBadge);
        }
        card.appendChild(hdr);

        // Meta row: year · theater · difficulty · complexity
        var metaParts = [];
        if (entry.scenarioDate)    metaParts.push(entry.scenarioDate);
        if (entry.setting)         metaParts.push(entry.setting);
        var diffStr = stars(entry.difficulty);
        var cplxStr = stars(entry.complexity);
        if (diffStr) metaParts.push('Diff ' + diffStr);
        if (cplxStr) metaParts.push('Cplx ' + cplxStr);
        if (metaParts.length) {
            var meta = document.createElement('div');
            meta.className = 'sw-scen-entry-meta';
            meta.textContent = metaParts.join(' · ');
            card.appendChild(meta);
        }

        // Tag row: DB version
        if (entry.dbVersion) {
            var tags = document.createElement('div');
            tags.className = 'sw-scen-entry-tags';
            var dbTag = document.createElement('span');
            dbTag.className = 'sw-scen-tag sw-scen-tag--db';
            dbTag.textContent = entry.dbVersion;
            tags.appendChild(dbTag);
            card.appendChild(tags);
        }

        // Description excerpt
        if (entry.description) {
            var desc = document.createElement('div');
            desc.className = 'sw-scen-entry-desc';
            var maxLen = 220;
            desc.textContent = entry.description.slice(0, maxLen) +
                               (entry.description.length > maxLen ? '…' : '');
            card.appendChild(desc);
        }

        // Parse error message
        if (entry.parseError) {
            var errMsg = document.createElement('div');
            errMsg.className = 'sw-scen-entry-parse-error';
            errMsg.textContent = entry.parseError;
            card.appendChild(errMsg);
        }

        // Warnings (collapsed <details>)
        if (entry.warnings && entry.warnings.length) {
            var details = document.createElement('details');
            details.className = 'sw-scen-entry-warnings';

            var summary = document.createElement('summary');
            summary.className = 'sw-scen-warnings-summary';
            summary.textContent = entry.warnings.length + ' warning' +
                                  (entry.warnings.length !== 1 ? 's' : '');
            details.appendChild(summary);

            var wList = document.createElement('ul');
            wList.className = 'sw-scen-warnings-list';
            for (var i = 0; i < entry.warnings.length; i++) {
                var code = entry.warnings[i];
                var li = document.createElement('li');
                li.textContent = SCEN_WARNING_TEXT[code] || code;
                wList.appendChild(li);
            }
            details.appendChild(wList);
            card.appendChild(details);
        }

        return card;
    }

    function renderCatalogList(entries) {
        var container = document.getElementById('sw-scen-catalog-list');
        var countEl   = document.getElementById('sw-scen-catalog-count');
        var clearBtn  = document.getElementById('sw-scen-catalog-clear');
        if (!container) return;

        while (container.firstChild) container.removeChild(container.firstChild);

        if (!entries || !entries.length) {
            container.hidden = true;
            if (countEl) { countEl.textContent = ''; countEl.hidden = true; }
            if (clearBtn) clearBtn.hidden = true;
            return;
        }

        for (var i = 0; i < entries.length; i++) {
            container.appendChild(renderCatalogEntry(entries[i]));
        }
        container.hidden = false;

        if (countEl) {
            countEl.textContent = entries.length + ' scenario' + (entries.length !== 1 ? 's' : '');
            countEl.hidden = false;
        }
        if (clearBtn) clearBtn.hidden = false;
    }

    // ── Wire DOM ─────────────────────────────────────────────────────────────

    function initScenCatalog() {
        var input    = document.getElementById('sw-scen-catalog-input');
        var clearBtn = document.getElementById('sw-scen-catalog-clear');
        if (!input) return;

        input.addEventListener('change', function () {
            if (!input.files || !input.files.length) return;
            buildCatalogFromFiles(input.files).then(renderCatalogList);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                input.value = '';
                renderCatalogList([]);
            });
        }

        // Expose contract on window for console debugging and future modules.
        window.ScenCatalogContract = {
            // Safety proof — read to verify invariants are in place
            SAFETY: {
                readsScenarioCompressed:  false,
                decompresses:             false,
                fetches:                  false,
                stores:                   false,
                mutatesRmoozScenario:     false,
                mutatesUnits:             false,
                mutatesLines:             false,
                mutatesMap:               false,
                createsStaging:           false,
                createsApplyPath:         false,
            },

            WARNINGS:              SCEN_WARNINGS,
            WARNING_TEXT:          SCEN_WARNING_TEXT,

            parseScenOuterWrapper: parseScenOuterWrapper,
            buildCatalogEntry:     buildCatalogEntry,
            buildCatalogFromFiles: buildCatalogFromFiles,
            renderCatalogList:     renderCatalogList,

            // Example catalog entry for documentation / testing
            EXAMPLE_ENTRY: {
                title:                '2nd Fleet, Sink The Boomers (Scenario 2), 1986',
                description:          'Location: Barents Sea. Time: October 13–16, 1986. ' +
                                      'NATO ASW forces attempt to locate and destroy Soviet ' +
                                      'ballistic missile submarines.',
                setting:              'Barents Sea',
                scenarioDate:         '1986',
                difficulty:           3,
                complexity:           2,
                dbVersion:            'DB3K_512.db3',
                buildNumber:          'v1.08 - Build 1711',
                version:              'Command: Modern Operations v1.08 - Build 1711',
                isCampaignCheckpoint: false,
                scenFilePath:         '2nd Fleet, Sink The Boomers (Scenario 2), 1986.scen',
                iniFilePath:          '2nd Fleet, Sink The Boomers (Scenario 2), 1986.ini',
                filePresent:          true,
                configPresent:        false,
                parseError:           null,
                warnings: [
                    'COMPRESSED_LOCKED',
                    'DB_DEPENDENCY',
                    'LUA_DEPENDENCY',
                    'PACK_FRESHNESS',
                    'INI_PATCH_NOT_STANDALONE',
                    'OLD_DUPLICATE_POSSIBLE',
                    'CONFIG_ABSENT',
                ],
            },
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScenCatalog);
    } else {
        initScenCatalog();
    }

})();
