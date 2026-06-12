/**
 * roadmap-page.js — ROADMAP-1
 *
 * Informational, UI-ONLY development roadmap overlay for RMOOZ.
 *
 * STRICT SAFETY CONTRACT:
 *   - No backend, no fetch/XHR, no WebSocket.
 *   - No localStorage / sessionStorage (state is in-memory only).
 *   - Does NOT read or mutate scenarios, units, the map, the simulation,
 *     or the Event Log. It only builds its own #roadmap-overlay DOM.
 *   - No apply/commit/AI-execution controls. Read-only presentation.
 *
 * Arabic-first RTL. Title: "خارطة تطوير RMOOZ".
 */
(function () {
    'use strict';

    // ── Status vocabulary ─────────────────────────────────────────────────────
    var STATUS = {
        completed:   { ar: 'مكتمل',    weight: 1.0,  cls: 'is-completed' },
        in_progress: { ar: 'قيد العمل', weight: 0.5,  cls: 'is-progress'  },
        next:        { ar: 'القادم',    weight: 0.25, cls: 'is-next'      },
        pending:     { ar: 'مؤجل',     weight: 0.0,  cls: 'is-pending'   }
    };
    // Order shown in the ROADMAP-2 status editor.
    var STATUS_ORDER = ['completed', 'in_progress', 'next', 'pending'];

    // ── Roadmap data model (UI-only) ──────────────────────────────────────────
    var PHASES = [
        {
            id: 'p1',
            title: 'الأساس المتين',
            subtitle: 'البنية التحتية: الخرائط والوحدات والمصادقة وجاهزية العمل دون اتصال',
            items: [
                { id: 'map-2d', t: 'نظام الخرائط ثنائي الأبعاد (2D)', s: 'completed', d: 'محرّك خرائط تفاعلي يعتمد على طبقات بلاطات محلية (MBTiles) ويعمل بالكامل دون اتصال بالإنترنت.' },
                { id: 'map-3d', t: 'العرض التضاريسي ثلاثي الأبعاد (3D)', s: 'completed', d: 'مشهد تضاريسي ثلاثي الأبعاد مع نموذج ارتفاعات رقمي (DEM) محلي لإظهار طبيعة الأرض.' },
                { id: 'symbols-app6', t: 'رموز الوحدات العسكرية (APP-6)', s: 'completed', d: 'رموز عسكرية قياسية (APP-6 / MIL-STD) مع هيكل قيادة هرمي كامل للوحدات.' },
                { id: 'tactical-layers', t: 'الطبقات والرسومات التكتيكية', s: 'completed', d: 'إدارة الطبقات والمجلدات والأشكال والرسومات التكتيكية القابلة للتحرير والتنظيم.' },
                { id: 'auth-login', t: 'المصادقة وتسجيل الدخول', s: 'completed', d: 'مصادقة عبر LDAP/الدليل النشط أو حساب محلي، مع إدارة جلسات آمنة.' },
                { id: 'offline-deploy', t: 'النشر دون اتصال (حاويات)', s: 'completed', d: 'حزمة نشر معزولة تعمل بالكامل داخل بيئة مغلقة دون أي اعتماد على الإنترنت.' }
            ]
        },
        {
            id: 'p2',
            title: 'المحاكاة التكتيكية',
            subtitle: 'توليد السيناريوهات ومحرّك حالة العالم والحركة المستمرة',
            items: [
                { id: 'world-state', t: 'محرّك حالة العالم (World State)', s: 'completed', d: 'نموذج مركزي موحّد لحالة القوات والتضاريس والزمن يقود جميع طبقات العرض والتحليل.' },
                { id: 'geojson-io', t: 'استيراد وتصدير GeoJSON', s: 'completed', d: 'استيراد مخرجات التوليد وتصديرها بصيغة GeoJSON قابلة للعرض المباشر على الخريطة.' },
                { id: 'scenario-generation', t: 'توليد السيناريوهات تلقائياً', s: 'in_progress', d: 'توليد مراحل المناورة من ملفات تشكيل القوات باستخدام نموذج لغوي محلي أو مُدار.' },
                { id: 'continuous-movement', t: 'الحركة المستمرة للوحدات', s: 'in_progress', d: 'حركة الوحدات بسلاسة عبر الزمن بدل القفزات، مع إمكانية تشغيل المسارات وإعادة عرضها.' },
                { id: 'detection-engagement', t: 'الكشف والاشتباك (DET/ENG)', s: 'in_progress', d: 'قواعد الكشف ونِسب القوى وحساب نتائج الاشتباك المبنية على العقيدة والنماذج الرياضية.' },
                { id: 'adjudicator', t: 'لوحة المُحكّم (Adjudicator)', s: 'next', d: 'مراجعة النتائج المقترحة لكل مرحلة وعرضها بصرياً للمُشغّل قبل اتخاذ القرار.' }
            ]
        },
        {
            id: 'p3',
            title: 'العمليات المتكاملة',
            subtitle: 'مسارات القرار ودعم القيادة والتحليل المتقدّم',
            items: [
                { id: 'event-log', t: 'سجل الأحداث الموحّد', s: 'completed', d: 'سجلّ جدولي دقيق بالوقت والشدّة والفئة والمصدر — مرجع موثوق وقابل للتدقيق لمجريات العمليات.' },
                { id: 'decision-paths', t: 'مسارات القرار (قبول/رفض/تعليق)', s: 'next', d: 'مسار اعتماد المُشغّل للنتائج المقترحة، مع حفظ دائم قابل للتدقيق لكل قرار.' },
                { id: 'monte-carlo', t: 'محاكاة مونت كارلو', s: 'pending', d: 'تشغيل عدّة تكرارات للسيناريو لتقدير الاحتمالات وتوزيع النتائج المحتملة.' },
                { id: 'ai-decision-support', t: 'دعم القرار بالذكاء الاصطناعي', s: 'pending', d: 'توليد وتفسير مسارات العمل (COA) لمساعدة القائد في تقييم الخيارات واتخاذ القرار.' },
                { id: 'collaborative-planning', t: 'التخطيط التعاوني متعدد المستخدمين', s: 'pending', d: 'تمكين عدّة مخططين من العمل على المسرح نفسه في آنٍ واحد مع مزامنة آمنة وموثوقة.' }
            ]
        },
        {
            id: 'p4',
            title: 'منصة متقدمة شاملة',
            subtitle: 'التكامل مع الأنظمة والتوسّع والتحليلات التنبؤية',
            items: [
                { id: 'c2-integration', t: 'التكامل مع أنظمة القيادة والسيطرة (C2)', s: 'pending', d: 'تبادل البيانات مع أنظمة القيادة والسيطرة الخارجية عبر واجهات قياسية مفتوحة.' },
                { id: 'predictive-analytics', t: 'التحليلات التنبؤية المتقدّمة', s: 'pending', d: 'نماذج تنبؤية لتقدير مسار المعركة المحتمل والمخاطر المستقبلية ودعم التخطيط الاستباقي.' },
                { id: 'distributed-sim', t: 'المحاكاة الموزّعة واسعة النطاق', s: 'pending', d: 'محاكاة موزّعة عبر عدّة عقد لإدارة مسارح عمليات كبيرة ومتزامنة في وقت واحد.' },
                { id: 'ar-vr', t: 'الواقع المعزّز والافتراضي (AR/VR)', s: 'pending', d: 'عرض الموقف العملياتي في بيئات الواقع المعزّز والافتراضي لدعم الإحاطة والتدريب.' },
                { id: 'scalable-platform', t: 'منصّة قابلة للتوسّع متعددة المسارح', s: 'pending', d: 'بنية مرنة قابلة للتوسّع تدير عدّة مسارح ومستخدمين ومصادر بيانات في منظومة واحدة.' }
            ]
        }
    ];

    // ── Helpers ────────────────────────────────────────────────────────────────
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function phaseProgress(phase) {
        var total = phase.items.length || 1;
        var sum = 0;
        phase.items.forEach(function (it) {
            var st = STATUS[it.s] || STATUS.pending;
            sum += st.weight;
        });
        return Math.round((sum / total) * 100);
    }

    function overallCompletion() {
        var items = 0, sum = 0;
        PHASES.forEach(function (p) {
            p.items.forEach(function (it) {
                items++;
                sum += (STATUS[it.s] || STATUS.pending).weight;
            });
        });
        return items ? Math.round((sum / items) * 100) : 0;
    }

    // The "active" phase = the first phase that is not 100% complete.
    function activePhaseId() {
        for (var i = 0; i < PHASES.length; i++) {
            if (phaseProgress(PHASES[i]) < 100) return PHASES[i].id;
        }
        return PHASES[PHASES.length - 1].id;
    }

    // ── Selection + re-render plumbing (ROADMAP-2) ──────────────────────────────
    // selectedItem/selectedPhase are object references into PHASES (stable across
    // re-renders). contentHostRef is the container renderContent() rebuilds.
    var selectedPhase  = null;
    var selectedItem   = null;
    var contentHostRef = null;

    // ROADMAP-4: server-decided edit capability + last-write metadata (read-only mirror).
    var canEdit       = false;
    var lastUpdatedBy = null;
    var lastUpdatedAt = null;

    function rerender() {
        if (contentHostRef) renderContent(contentHostRef);
    }

    // ── Persistence client (ROADMAP-4) — the ONLY network this page makes ───────
    // GET /api/roadmap/status (read; any authenticated user) and
    // POST /api/roadmap/status (admin only). Nothing else. No scenario/sim/map,
    // no Event Log, no storage, no WebSocket — see docs/roadmap-persistence-contract.md.
    function applyServerStatuses(data) {
        if (data && data.statuses) {
            var map = data.statuses;
            PHASES.forEach(function (p) {
                p.items.forEach(function (it) {
                    if (it.id && Object.prototype.hasOwnProperty.call(map, it.id)) {
                        var s = map[it.id];
                        if (STATUS[s]) it.s = s;        // accept only known statuses
                    }
                });
            });
            lastUpdatedBy = data.updated_by || null;
            lastUpdatedAt = data.updated_at || null;
        }
        canEdit = !!(data && data.can_edit);
    }

    function fetchStatus() {
        if (typeof fetch !== 'function') { canEdit = false; rerender(); return; }
        fetch('/api/roadmap/status', { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) { applyServerStatuses(data); rerender(); })
            .catch(function () { canEdit = false; rerender(); });   // offline → read-only, code defaults
    }

    function saveStatus(itemId, status, cb) {
        if (typeof fetch !== 'function') { cb(false, 'الحفظ غير مدعوم في هذا المتصفح.'); return; }
        fetch('/api/roadmap/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ item_id: itemId, status: status })
        }).then(function (r) {
            return r.json().catch(function () { return null; }).then(function (data) {
                if (r.ok && data && data.ok) {
                    if (data.updated_by) lastUpdatedBy = data.updated_by;
                    if (data.updated_at) lastUpdatedAt = data.updated_at;
                    cb(true, null);
                } else {
                    var m = r.status === 403 ? 'لا تملك صلاحية التعديل (المدير فقط).'
                          : r.status === 401 ? 'يلزم تسجيل الدخول أولاً.'
                          : r.status === 400 ? 'قيمة غير مقبولة.'
                          : 'تعذّر الحفظ — حاول مرة أخرى.';
                    cb(false, m);
                }
            });
        }).catch(function () { cb(false, 'تعذّر الاتصال بالخادم.'); });
    }

    // ── Detail panel (with UI-only status editor — ROADMAP-2) ───────────────────
    function showDetail(panel, phase, item) {
        selectedPhase = phase;
        selectedItem  = item;
        var st = STATUS[item.s] || STATUS.pending;
        panel.innerHTML = '';
        panel.classList.add('is-open');

        panel.appendChild(el('div', 'roadmap-detail-eyebrow', phase.title));
        panel.appendChild(el('h3', 'roadmap-detail-title', item.t));

        var meta = el('div', 'roadmap-detail-meta');
        meta.appendChild(el('span', 'roadmap-detail-phase', 'المرحلة: ' + phase.title));
        meta.appendChild(el('span', 'roadmap-status-badge ' + st.cls, st.ar));
        panel.appendChild(meta);

        panel.appendChild(el('p', 'roadmap-detail-body', item.d));

        // ── Status editor (ROADMAP-4): admin-only; persists via /api/roadmap/status.
        // Non-admins (can_edit=false) get a read-only notice instead of the editor.
        if (canEdit) {
            var editor = el('div', 'roadmap-editor');
            editor.appendChild(el('div', 'roadmap-editor-label', 'تغيير الحالة'));

            var seg = el('div', 'roadmap-editor-seg');
            var staged = item.s;             // staged choice — applied only after the server confirms
            var segBtns = {};
            var updateBtn = el('button', 'roadmap-update-btn', 'تحديث الحالة');
            var msg = el('p', 'roadmap-editor-msg', '');

            STATUS_ORDER.forEach(function (key) {
                var b = el('button', 'roadmap-seg-btn ' + STATUS[key].cls, STATUS[key].ar);
                b.type = 'button';
                b.setAttribute('data-status', key);
                if (key === staged) b.classList.add('is-chosen');
                b.addEventListener('click', function () {
                    staged = key;
                    Object.keys(segBtns).forEach(function (k) { segBtns[k].classList.remove('is-chosen'); });
                    b.classList.add('is-chosen');
                    updateBtn.disabled = (staged === item.s);
                    msg.textContent = '';
                });
                segBtns[key] = b;
                seg.appendChild(b);
            });
            editor.appendChild(seg);

            updateBtn.type = 'button';
            updateBtn.disabled = true;       // enabled once a different status is chosen
            updateBtn.addEventListener('click', function () {
                if (staged === item.s) return;
                var target = staged;
                updateBtn.disabled = true;
                updateBtn.textContent = 'جارٍ الحفظ…';
                msg.textContent = '';
                saveStatus(item.id, target, function (ok, errMsg) {
                    if (ok) {
                        item.s = target;     // confirmed & persisted by the server
                        rerender();          // recompute %, marker, route; re-open this item
                    } else {
                        updateBtn.textContent = 'تحديث الحالة';
                        updateBtn.disabled = false;
                        msg.textContent = errMsg || 'تعذّر الحفظ — حاول مرة أخرى.';
                    }
                });
            });
            editor.appendChild(updateBtn);
            editor.appendChild(msg);

            editor.appendChild(el('p', 'roadmap-editor-note',
                'يُحفظ التغيير على الخادم ويظهر لجميع المستخدمين، مع تسجيله في سجل التغييرات.'));
            panel.appendChild(editor);
        } else {
            panel.appendChild(el('p', 'roadmap-editor-readonly',
                'العرض للقراءة فقط — تغيير الحالة متاح للمدير فقط.'));
        }

        panel.appendChild(el('p', 'roadmap-detail-note',
            'هذه اللوحة لا تتصل بالسيناريو أو الخريطة أو المحاكاة أو سجل الأحداث — تحفظ حالة الخارطة فقط.'));
    }

    function defaultDetail(panel) {
        selectedPhase = null;
        selectedItem  = null;
        panel.classList.remove('is-open');
        panel.innerHTML = '';
        panel.appendChild(el('div', 'roadmap-detail-eyebrow', 'تقرير العنصر'));
        panel.appendChild(el('h3', 'roadmap-detail-title', 'اختر عنصراً من الخارطة'));
        panel.appendChild(el('p', 'roadmap-detail-body',
            'انقر على أي بند ضمن المراحل لعرض تفاصيله. المدير يمكنه تحديث الحالة من هنا.'));
    }

    // ── Route band (current-position + moving right-to-left path) ───────────────
    function buildRoute(activeId) {
        var route = el('div', 'roadmap-route');
        route.setAttribute('aria-hidden', 'true');           // decorative; cards carry the real info
        // The flowing line sits behind the nodes and animates right-to-left.
        route.appendChild(el('div', 'roadmap-route-line'));

        var nodes = el('div', 'roadmap-route-nodes');         // RTL flex → node 1 on the right
        PHASES.forEach(function (phase, idx) {
            var node = el('div', 'roadmap-route-node');
            var pp = phaseProgress(phase);
            if (pp >= 100) node.classList.add('is-done');
            if (phase.id === activeId) node.classList.add('is-here');

            var dot = el('span', 'roadmap-route-dot', String(idx + 1));
            var cap = el('span', 'roadmap-route-cap', phase.title);
            node.appendChild(dot);
            node.appendChild(cap);
            if (phase.id === activeId) {
                node.appendChild(el('span', 'roadmap-route-here', 'الموقع الحالي'));
            }
            nodes.appendChild(node);
        });
        route.appendChild(nodes);
        return route;
    }

    // ── Builder (shell + header built ONCE) ─────────────────────────────────────
    var built = false;
    function buildOverlay(overlay) {
        if (built) return;
        built = true;

        var shell = el('div', 'roadmap-shell');

        // Header
        var head = el('header', 'roadmap-head');
        var titleWrap = el('div', 'roadmap-head-titles');
        var h1 = el('h1', 'roadmap-title');
        h1.id = 'roadmap-title';
        h1.textContent = 'خارطة تطوير RMOOZ';
        var sub = el('p', 'roadmap-subtitle', 'المسار نحو منصة محاكاة عملياتية ودعم قيادة متقدمة');
        titleWrap.appendChild(h1);
        titleWrap.appendChild(sub);

        var closeBtn = el('button', 'roadmap-close', '✕');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'إغلاق');
        closeBtn.addEventListener('click', function () { hide(overlay); });

        head.appendChild(titleWrap);
        head.appendChild(closeBtn);

        // Content host is re-rendered on every status edit (ROADMAP-2).
        var contentHost = el('div', 'roadmap-content');
        contentHostRef = contentHost;

        shell.appendChild(head);
        shell.appendChild(contentHost);

        // Click on backdrop (outside the shell) closes.
        overlay.addEventListener('click', function (ev) {
            if (ev.target === overlay) hide(overlay);
        });

        overlay.appendChild(shell);
        renderContent(contentHost);
    }

    // (Re)build gauge + route + phases + detail. Safe to call repeatedly — a
    // ROADMAP-2 status edit re-renders here and re-opens the selected item.
    function renderContent(host) {
        host.innerHTML = '';

        var activeId = activePhaseId();
        var pct = overallCompletion();

        // Completion gauge
        var gauge = el('div', 'roadmap-gauge');
        gauge.appendChild(el('div', 'roadmap-gauge-label', 'نسبة الإنجاز الحالية'));
        gauge.appendChild(el('div', 'roadmap-gauge-value', pct + '%'));
        var track = el('div', 'roadmap-progress-track');
        var flow = el('div', 'roadmap-progress-flow');     // moving right-to-left shimmer
        var fill = el('div', 'roadmap-progress-fill');
        fill.style.width = '0%';
        var marker = el('div', 'roadmap-progress-marker');
        marker.style.right = '0%';
        marker.appendChild(el('span', 'roadmap-progress-marker-label', 'الموقع الحالي'));
        track.appendChild(flow);
        track.appendChild(fill);
        track.appendChild(marker);
        gauge.appendChild(track);
        gauge.appendChild(el('div', 'roadmap-gauge-caption',
            'نتقدّم على المسار من اليمين إلى اليسار — العلامة تشير إلى موقعنا الحالي في خطة التطوير.'));
        setTimeout(function () {
            fill.style.width = pct + '%';
            marker.style.right = pct + '%';
        }, 60);

        gauge.appendChild(buildRoute(activeId));

        // Phases grid + detail panel
        var grid = el('div', 'roadmap-phases');
        var detail = el('aside', 'roadmap-detail');
        detail.setAttribute('aria-live', 'polite');

        var reopen = null;   // restores the open item after a re-render

        PHASES.forEach(function (phase, idx) {
            var pp = phaseProgress(phase);
            var card = el('section', 'roadmap-phase');
            if (phase.id === activeId) card.classList.add('is-active');
            card.setAttribute('data-phase', phase.id);

            var pHead = el('div', 'roadmap-phase-head');
            var num = el('span', 'roadmap-phase-num', String(idx + 1));
            var pTitles = el('div', 'roadmap-phase-titles');
            var titleRow = el('div', 'roadmap-phase-title-row');
            titleRow.appendChild(el('h2', 'roadmap-phase-title', phase.title));
            if (phase.id === activeId) {
                titleRow.appendChild(el('span', 'roadmap-here-badge', 'الموقع الحالي'));
            }
            pTitles.appendChild(titleRow);
            pTitles.appendChild(el('p', 'roadmap-phase-sub', phase.subtitle));
            pHead.appendChild(num);
            pHead.appendChild(pTitles);
            pHead.appendChild(el('div', 'roadmap-phase-pct', pp + '%'));
            card.appendChild(pHead);

            // Thin per-phase progress bar (RTL fill).
            var pBarTrack = el('div', 'roadmap-phase-bar');
            var pBarFill = el('div', 'roadmap-phase-bar-fill');
            pBarFill.style.width = '0%';
            pBarTrack.appendChild(pBarFill);
            card.appendChild(pBarTrack);
            setTimeout((function (f, v) { return function () { f.style.width = v + '%'; }; })(pBarFill, pp), 120);

            var list = el('ul', 'roadmap-item-list');
            phase.items.forEach(function (item) {
                var st = STATUS[item.s] || STATUS.pending;
                var li = el('li', 'roadmap-item ' + st.cls);
                li.setAttribute('tabindex', '0');
                li.setAttribute('role', 'button');

                li.appendChild(el('span', 'roadmap-item-dot'));
                li.appendChild(el('span', 'roadmap-item-label', item.t));
                li.appendChild(el('span', 'roadmap-item-badge', st.ar));

                function open() {
                    grid.querySelectorAll('.roadmap-item.is-selected')
                        .forEach(function (x) { x.classList.remove('is-selected'); });
                    li.classList.add('is-selected');
                    showDetail(detail, phase, item);
                }
                li.addEventListener('click', open);
                li.addEventListener('keydown', function (ev) {
                    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
                });
                // Restore the previously-open item across re-renders (object identity).
                if (item === selectedItem) reopen = open;
                list.appendChild(li);
            });
            card.appendChild(list);
            grid.appendChild(card);
        });

        var body = el('div', 'roadmap-body');
        body.appendChild(grid);
        body.appendChild(detail);

        host.appendChild(gauge);
        host.appendChild(body);

        if (reopen) reopen();
        else defaultDetail(detail);
    }

    // ── Open / close ─────────────────────────────────────────────────────────────
    function show(overlay, btn) {
        buildOverlay(overlay);
        overlay.hidden = false;
        // force reflow then add visible class for transition
        void overlay.offsetWidth;
        overlay.classList.add('is-visible');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        document.addEventListener('keydown', onEsc);
        fetchStatus();                       // ROADMAP-4: sync shared status from the server on open
    }
    function hide(overlay) {
        overlay.classList.remove('is-visible');
        var btn = document.getElementById('roadmap-toggle-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('keydown', onEsc);
        // hide after the transition
        setTimeout(function () { overlay.hidden = true; }, 220);
    }
    function onEsc(ev) {
        if (ev.key === 'Escape') {
            var overlay = document.getElementById('roadmap-overlay');
            if (overlay) hide(overlay);
        }
    }

    // ── Wire up ──────────────────────────────────────────────────────────────────
    function init() {
        var btn = document.getElementById('roadmap-toggle-btn');
        var overlay = document.getElementById('roadmap-overlay');
        if (!btn || !overlay) return;
        btn.addEventListener('click', function () {
            if (overlay.hidden) show(overlay, btn);
            else hide(overlay);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose a tiny read-only API for tests (no state mutation hooks).
    window.RmoozRoadmap = {
        phases: PHASES,
        overallCompletion: overallCompletion,
        open: function () { var o = document.getElementById('roadmap-overlay'); if (o) show(o, document.getElementById('roadmap-toggle-btn')); },
        close: function () { var o = document.getElementById('roadmap-overlay'); if (o) hide(o); }
    };
})();
