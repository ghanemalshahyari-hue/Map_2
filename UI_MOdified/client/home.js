/* ============================================================================
 * home.js — RMOOZ Launch Hub behavior (PR1).
 * Auth guard + status clock + bilingual labels + transition into app.html.
 * Scenario-GLOBAL: no scenario hardcoding. Buttons carry an `intent` hint in the
 * URL (?launch=<intent>) for a later slice (PR2) to act on; for PR1 every action
 * transitions into the existing operational workspace (no dead stubs).
 * No backend writes, no mutation, no engine.
 * ========================================================================== */
(function () {
    'use strict';

    var LANG_KEY = 'rmooz-lang';
    var WORKSPACE = '/app.html';

    /* ---- bilingual labels (RTL-first) ---------------------------------- */
    var I18N = {
        en: {
            'hub-classbar': 'UNCLASSIFIED // TRAINING USE ONLY',
            'hub-id-sub': 'Regional Operational Command & Decision Simulator',
            'hub-logout': 'Logout',
            'hub-stage-tag': '2D Operational Theater · Strategic Overview (preview)',
            'hub-eyebrow': 'Command Launch',
            'hub-title': 'Begin an operation',
            'hub-demo': 'Quick Demo', 'hub-demo-sub': 'Enter the operational workspace with the active scenario.',
            'hub-new': 'Start New Scenario', 'hub-new-sub': 'Open the workspace to build a new scenario.',
            'hub-load': 'Load Scenario', 'hub-load-sub': 'Open a saved scenario in the workspace.',
            'hub-editor': 'Scenario Editor', 'hub-editor-sub': 'Author geography, forces, and steps.',
            'hub-resume': 'Resume Last Session', 'hub-resume-sub': 'Return to the most recent operational view.',
            'hub-settings': 'Settings', 'hub-layers': 'Map Layers', 'hub-help': 'Help / Guide',
            'hub-zulu': 'Zulu', 'hub-local': 'Local', 'hub-mode': 'Map Mode', 'hub-mode-v': '2D Operational',
            'hub-no-scenario': 'No scenario loaded'
        },
        ar: {
            'hub-classbar': 'غير مصنّف // للتدريب فقط',
            'hub-id-sub': 'محاكي القيادة واتخاذ القرار العملياتي الإقليمي',
            'hub-logout': 'تسجيل الخروج',
            'hub-stage-tag': 'مسرح عملياتي ثنائي الأبعاد · نظرة استراتيجية (معاينة)',
            'hub-eyebrow': 'إطلاق القيادة',
            'hub-title': 'ابدأ عملية',
            'hub-demo': 'عرض سريع', 'hub-demo-sub': 'ادخل مساحة العمل العملياتية بالسيناريو النشط.',
            'hub-new': 'سيناريو جديد', 'hub-new-sub': 'افتح مساحة العمل لبناء سيناريو جديد.',
            'hub-load': 'تحميل سيناريو', 'hub-load-sub': 'افتح سيناريو محفوظاً في مساحة العمل.',
            'hub-editor': 'محرّر السيناريو', 'hub-editor-sub': 'حرّر الجغرافيا والقوات والخطوات.',
            'hub-resume': 'استئناف آخر جلسة', 'hub-resume-sub': 'عُد إلى آخر عرض عملياتي.',
            'hub-settings': 'الإعدادات', 'hub-layers': 'طبقات الخريطة', 'hub-help': 'مساعدة / دليل',
            'hub-zulu': 'زولو', 'hub-local': 'محلي', 'hub-mode': 'نمط الخريطة', 'hub-mode-v': 'ثنائي الأبعاد',
            'hub-no-scenario': 'لا يوجد سيناريو محمّل'
        }
    };

    function getLang() {
        try { var l = localStorage.getItem(LANG_KEY); if (l === 'en' || l === 'ar') return l; } catch (_) {}
        return 'ar';
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

    /* ---- status clock (Zulu + local) ----------------------------------- */
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function tickClock() {
        var d = new Date();
        var z = document.getElementById('hub-zulu');
        var l = document.getElementById('hub-local');
        if (z) z.textContent = pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + 'Z';
        if (l) l.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    /* ---- auth guard (lightweight; mirrors server-sync's contract) ------- */
    function guard() {
        try {
            fetch('/api/auth/me', { credentials: 'same-origin' })
                .then(function (r) { if (!r.ok) location.replace('/?next=/home.html'); })
                .catch(function () { /* offline/dev — do not lock the user out */ });
        } catch (_) {}
    }

    /* ---- navigation into the operational workspace --------------------- */
    function go(intent) {
        // Every action transitions into the existing workspace. The intent hint is
        // a harmless query param a later slice (PR2) can read; app.html ignores it today.
        var url = WORKSPACE + (intent ? ('?launch=' + encodeURIComponent(intent)) : '');
        window.location.assign(url);
    }
    function logout() {
        // Best-effort logout, then back to the login page.
        try {
            fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
                .finally(function () { location.replace('/'); });
        } catch (_) { location.replace('/'); }
    }

    function wire() {
        var btns = document.querySelectorAll('[data-intent]');
        for (var i = 0; i < btns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () { go(btn.getAttribute('data-intent')); });
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
