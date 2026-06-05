/* ============================================================================
 * home.js — RMOOZ Launch Hub behavior.
 * Auth guard + status clock + bilingual labels + real launch wiring.
 *
 * Button contract:
 *   demo    → go('demo')         — unchanged, native-scenario-loader handles it
 *   load    → file picker → sessionStorage → go('load')
 *   new     → inline notify (authoring in development)
 *   editor  → go('editor')       — app.html shows placeholder notice
 *   resume  → sessionStorage/localStorage check → go or inline notify
 *   others  → go(intent)
 *
 * Storage keys (shared with native-scenario-loader.js):
 *   sessionStorage['rmooz.pending-import']  — raw JSON text waiting for app.html
 *   sessionStorage['rmooz.last-json']       — last successfully loaded JSON (tab-local)
 *   localStorage ['rmooz.last-session']     — {source,id,label,ts} (survives restarts)
 * ========================================================================== */
(function () {
    'use strict';

    var LANG_KEY          = 'rmooz-lang';
    var STORAGE_PENDING   = 'rmooz.pending-import';
    var STORAGE_LAST_JSON = 'rmooz.last-json';
    var STORAGE_LAST_META = 'rmooz.last-session';
    var WORKSPACE_FILE    = 'app.html';

    /* ---- bilingual labels ------------------------------------------------ */
    var I18N = {
        en: {
            'hub-classbar': 'UNCLASSIFIED // TRAINING USE ONLY',
            'hub-id-sub': 'Regional Operational Command & Decision Simulator',
            'hub-logout': 'Logout',
            'hub-stage-tag': '2D Operational Theater · Strategic Overview (preview)',
            'hub-eyebrow': 'Command Launch',
            'hub-title': 'Begin an operation',
            'hub-demo': 'Quick Demo',   'hub-demo-sub': 'Enter the operational workspace with the active scenario.',
            'hub-new': 'Start New Scenario', 'hub-new-sub': 'Open the workspace to build a new scenario.',
            'hub-load': 'Load Scenario',     'hub-load-sub': 'Open a saved scenario in the workspace.',
            'hub-editor': 'Scenario Editor', 'hub-editor-sub': 'Author geography, forces, and steps.',
            'hub-resume': 'Resume Last Session', 'hub-resume-sub': 'Return to the most recent operational view.',
            'hub-import-geojson': 'Import WarGamingGEN GeoJSON', 'hub-import-geojson-sub': 'Load generated GeoJSON phases into RMOOZ.',
            'hub-import-docx': 'DOCX Simulation Import', 'hub-import-docx-sub': 'Stage Red/Blue force documents and import generated results.',
            'hub-settings': 'Settings', 'hub-layers': 'Map Layers', 'hub-help': 'Help / Guide',
            'hub-zulu': 'Zulu', 'hub-local': 'Local', 'hub-mode': 'Map Mode', 'hub-mode-v': '2D Operational',
            'hub-no-scenario': 'No scenario loaded',
            /* notify strings */
            'notify-new':        'Scenario authoring is in development. Use Load Scenario to open a RMOOZ JSON file.',
            'notify-no-session': 'No saved session found. Load a scenario to begin.',
            'notify-resume-file':'Last session: "{label}"{when}. Re-import the file to resume.',
            'notify-file-bad':   'Invalid file — not valid JSON. Select a RMOOZ scenario (.json).',
            'notify-file-big':   'File is too large for this browser session. Try a smaller scenario.',
            'notify-file-read':  'Could not read the file. Try again.'
        },
        ar: {
            'hub-classbar': 'غير مصنّف // للتدريب فقط',
            'hub-id-sub': 'محاكي القيادة واتخاذ القرار العملياتي الإقليمي',
            'hub-logout': 'تسجيل الخروج',
            'hub-stage-tag': 'مسرح عملياتي ثنائي الأبعاد · نظرة استراتيجية (معاينة)',
            'hub-eyebrow': 'إطلاق القيادة',
            'hub-title': 'ابدأ عملية',
            'hub-demo': 'عرض سريع',       'hub-demo-sub': 'ادخل مساحة العمل العملياتية بالسيناريو النشط.',
            'hub-new': 'سيناريو جديد',    'hub-new-sub': 'افتح مساحة العمل لبناء سيناريو جديد.',
            'hub-load': 'تحميل سيناريو',  'hub-load-sub': 'افتح سيناريو محفوظاً في مساحة العمل.',
            'hub-editor': 'محرّر السيناريو', 'hub-editor-sub': 'حرّر الجغرافيا والقوات والخطوات.',
            'hub-resume': 'استئناف آخر جلسة', 'hub-resume-sub': 'عُد إلى آخر عرض عملياتي.',
            'hub-import-geojson': 'استيراد WarGamingGEN GeoJSON', 'hub-import-geojson-sub': 'حمّل مراحل GeoJSON المولّدة إلى RMOOZ.',
            'hub-import-docx': 'استيراد محاكاة DOCX', 'hub-import-docx-sub': 'جهّز وثائق قوات الأحمر/الأزرق واستورد النتائج المولّدة.',
            'hub-settings': 'الإعدادات', 'hub-layers': 'طبقات الخريطة', 'hub-help': 'مساعدة / دليل',
            'hub-zulu': 'زولو', 'hub-local': 'محلي', 'hub-mode': 'نمط الخريطة', 'hub-mode-v': 'ثنائي الأبعاد',
            'hub-no-scenario': 'لا يوجد سيناريو محمّل',
            /* notify strings */
            'notify-new':        'أداة إنشاء السيناريو قيد التطوير. استخدم "تحميل سيناريو" لفتح ملف JSON.',
            'notify-no-session': 'لا توجد جلسة محفوظة. قم بتحميل سيناريو للبدء.',
            'notify-resume-file':'آخر جلسة: "{label}"{when}. أعد استيراد الملف للاستئناف.',
            'notify-file-bad':   'ملف غير صالح — ليس JSON صحيحاً. اختر ملف سيناريو RMOOZ (.json).',
            'notify-file-big':   'الملف كبير جداً لهذه الجلسة. جرّب سيناريو أصغر.',
            'notify-file-read':  'تعذّر قراءة الملف. حاول مرة أخرى.'
        }
    };

    function getLang() {
        try { var l = localStorage.getItem(LANG_KEY); if (l === 'en' || l === 'ar') return l; } catch (_) {}
        return 'ar';
    }
    function tx(key) {
        var d = I18N[getLang()] || I18N.ar;
        return d[key] != null ? d[key] : (I18N.ar[key] || key);
    }
    function applyLang(lang) {
        var dict = I18N[lang] || I18N.ar;
        document.documentElement.lang = lang;
        document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
        var nodes = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            var k = nodes[i].getAttribute('data-i18n');
            if (dict[k] != null) nodes[i].textContent = dict[k];
        }
        var lb = document.getElementById('hub-lang');
        if (lb) lb.textContent = (lang === 'ar') ? 'English' : 'عربي';
        try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
    }

    /* ---- inline notify -------------------------------------------------- */
    function hubNotify(msg, isError, durationMs) {
        var el = document.getElementById('hub-notify');
        if (!el) return;
        el.textContent = msg;
        el.className = 'hub-notify ' + (isError ? 'hub-notify--err' : 'hub-notify--info');
        el.removeAttribute('hidden');
        if (el._t) clearTimeout(el._t);
        el._t = setTimeout(function () { el.setAttribute('hidden', ''); }, durationMs || 6000);
    }

    function resolveClientUrl(target) {
        try { return new URL(target, window.location.href).toString(); }
        catch (_) { return target; }
    }

    function buildWorkspaceUrl(intent) {
        var url = resolveClientUrl(WORKSPACE_FILE);
        if (!intent) return url;
        try {
            var next = new URL(url);
            next.searchParams.set('launch', intent);
            return next.toString();
        } catch (_) {
            return url + '?launch=' + encodeURIComponent(intent);
        }
    }

    /* ---- status clock --------------------------------------------------- */
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function tickClock() {
        var d = new Date();
        var z = document.getElementById('hub-zulu');
        var l = document.getElementById('hub-local');
        if (z) z.textContent = pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z';
        if (l) l.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    /* ---- auth guard ------------------------------------------------------ */
    function guard() {
        try {
            fetch('/api/auth/me', { credentials: 'same-origin' })
                .then(function (r) {
                    if (r.ok) return;
                    try {
                        var loginUrl = new URL(resolveClientUrl('index.html'));
                        loginUrl.searchParams.set('next', 'home.html');
                        location.replace(loginUrl.toString());
                    } catch (_) {
                        location.replace('index.html?next=home.html');
                    }
                })
                .catch(function () { /* offline/dev — do not lock out */ });
        } catch (_) {}
    }

    /* ---- navigation ----------------------------------------------------- */
    function go(intent) {
        window.location.assign(buildWorkspaceUrl(intent));
    }
    function logout() {
        try {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                .finally(function () { location.replace(resolveClientUrl('index.html')); });
        } catch (_) { location.replace(resolveClientUrl('index.html')); }
    }

    /* ---- intent: Load Scenario ------------------------------------------ */
    function handleLoadClick() {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,application/json';
        inp.style.display = 'none';
        document.body.appendChild(inp);

        inp.addEventListener('change', function () {
            var file = inp.files && inp.files[0];
            inp.remove();
            if (!file) return;

            var reader = new FileReader();
            reader.onload = function (e) {
                var text = e.target.result;
                /* quick JSON validity check — the deep validation runs in app.html */
                try { JSON.parse(text); } catch (_) {
                    hubNotify(tx('notify-file-bad'), true);
                    return;
                }
                try {
                    sessionStorage.setItem(STORAGE_PENDING, text);
                } catch (_) {
                    hubNotify(tx('notify-file-big'), true);
                    return;
                }
                go('load');
            };
            reader.onerror = function () { hubNotify(tx('notify-file-read'), true); };
            reader.readAsText(file);
        });

        inp.click();
    }

    /* ---- intent: Start New Scenario ------------------------------------- */
    function handleNewClick() {
        /* Build the minimal blank RMOOZ-native scenario that loadLiveScenarioFromJson
         * accepts. scenario-authoring-schema.js is only available in app.html, so we
         * build inline here. app.html's scenario-edit-mode.js will fill in the full
         * authoring defaults from this seed via its buildDraft() → fillGeographyDefaults
         * + fillForcesDefaults path once Edit Mode opens. */
        var blank = {
            scenario_id:      'new-draft',
            name:             'new-draft',
            scenario_label:   'New Scenario',
            authoring_status: 'draft',
            sides: [
                { id: 'BLUE', name_en: 'Blue Force', name_ar: 'القوات الزرقاء', color: '#2563eb' },
                { id: 'RED',  name_en: 'Red Force',  name_ar: 'القوات الحمراء',  color: '#dc2626' }
            ],
            postures: {
                BLUE: { BLUE: 'FRIENDLY', RED: 'HOSTILE' },
                RED:  { BLUE: 'HOSTILE',  RED: 'FRIENDLY' }
            },
            steps: [{ id: 1, title: 'H+00:00', phase: 'Initial' }]
        };
        try {
            sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(blank));
        } catch (_) {
            hubNotify(tx('notify-file-big'), true);
            return;
        }
        go('new');
    }

    /* ---- intent: Resume Last Session ------------------------------------ */
    function handleResumeClick() {
        /* prefer in-tab session data (survives navigation in the same tab) */
        var hasJson = false;
        try { hasJson = !!sessionStorage.getItem(STORAGE_LAST_JSON); } catch (_) {}
        if (hasJson) { go('resume'); return; }

        /* fall back to lightweight metadata (survives browser restart) */
        var meta = null;
        try { var raw = localStorage.getItem(STORAGE_LAST_META); if (raw) meta = JSON.parse(raw); } catch (_) {}

        if (meta && meta.source === 'demo') {
            /* demo can always be re-loaded without a file */
            go('demo');
            return;
        }
        if (meta && meta.label) {
            var when = '';
            try {
                var d = new Date(meta.ts);
                if (!isNaN(d.getTime())) when = ' on ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
            } catch (_) {}
            var msg = tx('notify-resume-file')
                .replace('{label}', meta.label)
                .replace('{when}', when);
            hubNotify(msg, false, 8000);
            return;
        }
        hubNotify(tx('notify-no-session'), false, 5000);
    }

    /* ---- wire all buttons ----------------------------------------------- */
    function wire() {
        var btns = document.querySelectorAll('[data-intent]');
        for (var i = 0; i < btns.length; i++) {
            (function (btn) {
                var intent = btn.getAttribute('data-intent');
                btn.addEventListener('click', function () {
                    if      (intent === 'load')   { handleLoadClick(); }
                    else if (intent === 'new')    { handleNewClick(); }
                    else if (intent === 'resume') { handleResumeClick(); }
                    else                          { go(intent); }
                });
            })(btns[i]);
        }
        var lb = document.getElementById('hub-lang');
        if (lb) lb.addEventListener('click', function () { applyLang(getLang() === 'ar' ? 'en' : 'ar'); });
        var out = document.getElementById('hub-logout');
        if (out) out.addEventListener('click', logout);
    }

    function init() {
        applyLang(getLang());
        tickClock(); setInterval(tickClock, 1000);
        wire();
        guard();
    }
    if (document.readyState !== 'loading') init();
    else document.addEventListener('DOMContentLoaded', init);
})();
