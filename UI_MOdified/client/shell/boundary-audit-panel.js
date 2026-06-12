/**
 * Operational shell — Boundary Audit Panel (read-only).
 *
 * PR-22, RE-POINTED 2026-06-01 after the owner ruling that opened the
 * operator commit boundary (full unlock — UI mutates). The panel is
 * still a read-only MIRROR; it now reports the OPEN boundary truthfully
 * (commit bridge LIVE, backend commit CONNECTED, real journal ENABLED)
 * instead of the former dry-run/blocked posture. Surfaces still closed
 * (export preview, download lock, client scenario mutation) read as
 * before. The self-test + violation harness assert the NEW invariants.
 *
 * Strict invariants:
 *   1. NEVER mutates any audited module's state. The bridge
 *      exposes only `render()` (idempotent paint) and
 *      `getRowsSnapshot()` (read-only inspection). There is no
 *      setEnabled / setLocked / connect / enable / unlock /
 *      triggerDownload / executeDownload / save / export
 *      method exposed by this module.
 *   2. NEVER calls backend. No `fetch`, `XMLHttpRequest`,
 *      `sendBeacon`. No `/api/sim/propose`, no `/api/sim/commit`.
 *   3. NEVER persists. No `localStorage`, no `sessionStorage`,
 *      no `IndexedDB`. The panel re-derives its content from the
 *      bridges on every render; no internal state of its own
 *      beyond the cached last-rendered snapshot (in-memory only,
 *      dies on reload).
 *   4. NEVER writes files. No `Blob`, no `URL.createObjectURL`,
 *      no `<a download>`, no `link.click()`.
 *   5. NEVER changes PR-14 `ALLOWED_MODES`, PR-17 `TYPE`/`MODE`,
 *      or PR-20's `state.locked`. The Real Journal / Backend
 *      Commit / Scenario Mutation / Download rows are STATIC
 *      boundary readings — this module just labels them.
 *   6. textContent-only rendering. No `innerHTML` in this file.
 *
 * Bridge: window.AppShellBoundaryAuditPanel
 *   render()           – idempotent paint; reads each source
 *                         bridge and updates the DOM in place.
 *   getRowsSnapshot()  – defensive-copy array of the last
 *                         rendered { key, statusKey, tone, count? }
 *                         tuples; for inspection / tests only.
 *   ROW_KEYS           – frozen list of the nine row identifiers
 *   STATUS_KEYS        – frozen list of the closed status set
 *   TONES              – frozen list of the closed tone set
 *
 * Deliberately NOT exposed: any setter, any mutator, any
 *                            network call, any storage handle.
 */
(function () {
    'use strict';

    // ── Closed-set row identifiers ───────────────────────────────
    const ROW_KEYS = Object.freeze([
        'proposalService',
        'commitBridge',
        'decisionRecords',
        'realJournal',
        'journalDraft',
        'exportPackage',
        'download',
        'backendCommit',
        'scenarioMutation',
    ]);

    // ── Closed-set status i18n keys ──────────────────────────────
    const STATUS_KEYS = Object.freeze({
        notConnected: 'ba-status-not-connected',
        connected:    'ba-status-connected',
        dryRunOnly:   'ba-status-dry-run-only',
        inMemoryOnly: 'ba-status-in-memory-only',
        notEnabled:   'ba-status-not-enabled',
        previewOnly:  'ba-status-preview-only',
        locked:       'ba-status-locked',
        blocked:      'ba-status-blocked',
        forbidden:    'ba-status-forbidden',
        unknown:      'ba-status-unknown',
    });

    // ── Closed-set tone palette ──────────────────────────────────
    const TONES = Object.freeze(['green', 'yellow', 'red', 'grey']);

    // Last-rendered snapshot, kept only so getRowsSnapshot() can
    // return a defensive copy without re-reading the bridges. Not
    // a source of truth; render() rebuilds it from scratch.
    let lastSnapshot = [];

    // ── Pure derivers (one per row) ──────────────────────────────
    // Each deriver returns { statusKey, tone, extra? }. They do NOT
    // mutate anything and treat the bridges as read-only.
    function deriveProposalService() {
        const b = window.AppShellAIProposalBridge;
        if (!b || typeof b.getState !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        let s;
        try { s = b.getState(); } catch (_) { return { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
        const on = !!(s && s.serviceEnabled);
        return on
            ? { statusKey: STATUS_KEYS.connected,    tone: 'green' }
            : { statusKey: STATUS_KEYS.notConnected, tone: 'grey'  };
    }

    function deriveCommitBridge() {
        const b = window.AppShellAIProposalCommitBridge;
        if (!b || typeof b.getState !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        // UNLOCKED 2026-06-01: the bridge performs a real commit. Report
        // 'connected' when it reports mode:'live', else fall back.
        let s; try { s = b.getState(); } catch (_) { return { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
        return (s && s.mode === 'live')
            ? { statusKey: STATUS_KEYS.connected,  tone: 'green'  }
            : { statusKey: STATUS_KEYS.dryRunOnly, tone: 'yellow' };
    }

    function deriveDecisionRecords() {
        const b = window.AppShellDecisionJournal;
        if (!b || typeof b.getState !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        let s;
        try { s = b.getState(); } catch (_) { return { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
        const count = (s && typeof s.count === 'number') ? s.count : 0;
        return { statusKey: STATUS_KEYS.inMemoryOnly, tone: 'yellow', extra: { count } };
    }

    function deriveRealJournal() {
        // Static boundary reading derived from PR-14's closed-set
        // `ALLOWED_MODES`. The audit module never writes to that Set
        // — it only checks whether the only allowed mode is DRY_RUN.
        const b = window.AppShellJournalContract;
        if (!b || !b.ALLOWED_MODES || typeof b.ALLOWED_MODES.has !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        // UNLOCKED 2026-06-01: REAL is now allowed, so a real journal is
        // enabled (the durable write lives server-side at
        // data/journal/<run>.jsonl).
        const realAllowed = b.ALLOWED_MODES.has('REAL');
        return realAllowed
            ? { statusKey: STATUS_KEYS.connected,  tone: 'green' }
            : { statusKey: STATUS_KEYS.notEnabled, tone: 'red'  };
    }

    function deriveJournalDraft() {
        const b = window.AppShellJournalDraftPreview;
        if (!b || typeof b.getState !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        try { b.getState(); } catch (_) { return { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
        return { statusKey: STATUS_KEYS.previewOnly, tone: 'yellow' };
    }

    function deriveExportPackage() {
        const b = window.AppShellJournalExportPreview;
        if (!b || typeof b.getState !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        try { b.getState(); } catch (_) { return { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
        return { statusKey: STATUS_KEYS.previewOnly, tone: 'yellow' };
    }

    function deriveDownload() {
        const b = window.AppShellJournalDownloadGuard;
        if (!b || typeof b.getState !== 'function') {
            return { statusKey: STATUS_KEYS.unknown, tone: 'grey' };
        }
        let s;
        try { s = b.getState(); } catch (_) { return { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
        // PR-20 ships locked-by-design; the guard exposes no setter
        // to unlock, so this is effectively a static red row.
        if (s && s.locked) return { statusKey: STATUS_KEYS.locked, tone: 'red' };
        // Future-only branch: unlocked but disabled.
        if (s && !s.enabled) return { statusKey: STATUS_KEYS.notConnected, tone: 'grey' };
        return { statusKey: STATUS_KEYS.connected, tone: 'green' };
    }

    function deriveBackendCommit() {
        // UNLOCKED 2026-06-01: the commit bridge now POSTs /api/sim/commit
        // for ACCEPT/REJECT (operator intent + journal write). Report
        // connected (was a static 'blocked' boundary).
        return { statusKey: STATUS_KEYS.connected, tone: 'green' };
    }

    function deriveScenarioMutation() {
        // Static boundary — every PR in this series has preserved
        // "no scenario state mutation" as a hard invariant.
        return { statusKey: STATUS_KEYS.forbidden, tone: 'red' };
    }

    const DERIVERS = {
        proposalService:  deriveProposalService,
        commitBridge:     deriveCommitBridge,
        decisionRecords:  deriveDecisionRecords,
        realJournal:      deriveRealJournal,
        journalDraft:     deriveJournalDraft,
        exportPackage:    deriveExportPackage,
        download:         deriveDownload,
        backendCommit:    deriveBackendCommit,
        scenarioMutation: deriveScenarioMutation,
    };

    // ── i18n helper ───────────────────────────────────────────────
    function t(key, ...params) {
        if (typeof window.t === 'function') {
            try {
                const v = window.t(key, ...params);
                if (typeof v === 'string' && v && v !== key) return v;
            } catch (_) { /* fall through */ }
        }
        return null;
    }

    // ── DOM paint (textContent only, no innerHTML) ───────────────
    function paintRow(rowEl, statusKey, tone, extra) {
        const chip = rowEl.querySelector('.ba-status');
        if (!chip) return;
        chip.setAttribute('data-state', statusKey);
        chip.setAttribute('data-tone', tone);
        chip.setAttribute('data-i18n', statusKey);
        const localized = t(statusKey);
        // Fallback English text — exactly mirrors the closed set
        // and only used when window.t() is unavailable / returns
        // the key. Localization comes from i18n.js.
        const fallback = ({
            'ba-status-not-connected': 'Not connected',
            'ba-status-connected':     'Connected',
            'ba-status-dry-run-only':  'Dry-run only',
            'ba-status-in-memory-only':'In-memory only',
            'ba-status-not-enabled':   'Not enabled',
            'ba-status-preview-only':  'Preview only',
            'ba-status-locked':        'Locked',
            'ba-status-blocked':       'Blocked',
            'ba-status-forbidden':     'Forbidden',
            'ba-status-unknown':       'Unknown',
        })[statusKey] || 'Unknown';
        let text = localized || fallback;
        if (extra && typeof extra.count === 'number') text = text + ' (' + extra.count + ')';
        chip.textContent = text;
    }

    function render() {
        const root = document.getElementById('ba-panel');
        if (!root) return;
        const snapshot = [];
        ROW_KEYS.forEach((key) => {
            const rowEl = root.querySelector('.ba-row[data-row="' + key + '"]');
            if (!rowEl) return;
            const derive = DERIVERS[key];
            if (typeof derive !== 'function') return;
            let out;
            try { out = derive(); } catch (_) { out = { statusKey: STATUS_KEYS.unknown, tone: 'grey' }; }
            paintRow(rowEl, out.statusKey, out.tone, out.extra);
            snapshot.push({
                key:       key,
                statusKey: out.statusKey,
                tone:      out.tone,
                count:     (out.extra && typeof out.extra.count === 'number') ? out.extra.count : undefined,
            });
        });
        lastSnapshot = snapshot;
    }

    function getRowsSnapshot() {
        // Defensive copy — caller cannot mutate our cache.
        return lastSnapshot.map((r) => Object.assign({}, r));
    }

    // ── Optional UI/NOTICE Event Log row ─────────────────────────
    function logOnceRendered() {
        const log = window.AppShellEventLog;
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity:    'NOTICE',
                category:    'UI',                                  // closed-set; PR-6 gate
                source:      'boundary-audit-panel',
                messageKey:  'elog-evt-boundary-audit-rendered',
                message:     'Boundary audit panel rendered',
            });
        } catch (_) { /* never throw */ }
    }

    // ═════════════════════════════════════════════════════════════
    // PR-23 — Read-only self-test
    // -------------------------------------------------------------
    // `runSelfTest()` performs eight read-only checks against the
    // existing bridges and reports PASS / FAIL per check, plus an
    // overall result. It NEVER mutates any audited module's state.
    //
    // Each check uses ONLY read-only entry points:
    //   getState() / isAllowed() / validateJournalEntry() /
    //   validateExportPackage() / Object.keys() / Set.prototype.has()
    //
    // Synthetic validator inputs are created in-function (local
    // scope) — they are not stored in any bridge and are GC'd
    // when runSelfTest() returns.
    //
    // Strict invariants in this section:
    //   1. NO fetch / XHR / sendBeacon.
    //   2. NO Blob / URL.createObjectURL / <a download>.
    //   3. NO localStorage / sessionStorage / IndexedDB.
    //   4. NO setEnabled / setLocked / connect / unlock / enable
    //      called on any audited module.
    //   5. NO scenario state read or write that could trigger a
    //      side effect. The "before/after" snapshot uses only
    //      read methods, and check #8 proves they match.
    // ═════════════════════════════════════════════════════════════

    // Closed-set check identifiers (order = render order).
    const CHECK_KEYS = Object.freeze([
        'proposalServiceDisabled',
        'commitBridgeDryRun',
        'decisionRecordsInMemory',
        'realJournalRejected',
        'exportSafetyFlagsRejected',
        'downloadGuardLocked',
        'noForbiddenMethods',
        'scenarioUnchanged',
    ]);

    const CHECK_LABEL_KEYS = Object.freeze({
        proposalServiceDisabled:    'ba-check-proposal-service',
        commitBridgeDryRun:         'ba-check-commit-bridge',
        decisionRecordsInMemory:    'ba-check-decision-records',
        realJournalRejected:        'ba-check-real-journal',
        exportSafetyFlagsRejected:  'ba-check-export-package',
        downloadGuardLocked:        'ba-check-download-guard',
        noForbiddenMethods:         'ba-check-backend-commit',
        scenarioUnchanged:          'ba-check-scenario-mutation',
    });

    // Forbidden method names — if any audited bridge exposes one,
    // check #7 fails. PR-21's `downloadPackage` is allowed because
    // it is the guarded short-circuit and is NOT in this list.
    const FORBIDDEN_METHODS = Object.freeze([
        'triggerDownload',
        'executeDownload',
        'save',
        'export',
    ]);

    // Names of the bridges that must NOT expose a forbidden method.
    const AUDITED_BRIDGES = Object.freeze([
        'AppShellAIProposalBridge',
        'AppShellAIProposalCommitBridge',
        'AppShellDecisionJournal',
        'AppShellJournalContract',
        'AppShellJournalDraftPreview',
        'AppShellJournalExportContract',
        'AppShellJournalExportPreview',
        'AppShellJournalDownloadGuard',
    ]);

    // Last result kept ONLY for getSelfTestState() inspection and
    // for the language-switch repaint. Not a source of truth.
    let lastSelfTest = null;

    // ── Read-only signature snapshot (for check #8) ──────────────
    function snapshotScenarioSignature() {
        const sig = {};
        try {
            const sp = window.AppShellSidePicker;
            sig.side = (sp && typeof sp.getSide === 'function') ? sp.getSide() : null;
        } catch (_) { sig.side = null; }
        try {
            const dj = window.AppShellDecisionJournal;
            const s = (dj && typeof dj.getState === 'function') ? dj.getState() : null;
            sig.decisionCount = (s && typeof s.count === 'number') ? s.count : null;
        } catch (_) { sig.decisionCount = null; }
        try {
            const inb = window.AppShellAIProposalInbox;
            const lst = (inb && typeof inb.listProposals === 'function') ? inb.listProposals() : null;
            sig.inboxLen = Array.isArray(lst) ? lst.length : null;
        } catch (_) { sig.inboxLen = null; }
        try {
            const g = window.AppShellJournalDownloadGuard;
            sig.downloadIsAllowed = (g && typeof g.isAllowed === 'function') ? g.isAllowed() : null;
        } catch (_) { sig.downloadIsAllowed = null; }
        return sig;
    }

    // ── Individual check functions ───────────────────────────────
    function checkProposalServiceDisabled() {
        // UNLOCKED 2026-06-01: enabling the proposal service is now a
        // normal operator action, not a violation. Pass when the bridge
        // is present (service availability is operator-controlled).
        const b = window.AppShellAIProposalBridge;
        if (!b || typeof b.getState !== 'function') {
            return { pass: false, reasonKey: 'ba-reason-bridge-missing' };
        }
        try { b.getState(); } catch (_) { return { pass: false, reasonKey: 'ba-reason-bridge-missing' }; }
        return { pass: true, reasonKey: 'ba-reason-service-wired' };
    }

    function checkCommitBridgeDryRun() {
        // UNLOCKED 2026-06-01: the commit bridge is LIVE. Pass when it
        // reports mode:'live' (was: pass only while it stayed dry-run).
        const b = window.AppShellAIProposalCommitBridge;
        if (!b || typeof b.getState !== 'function') {
            return { pass: false, reasonKey: 'ba-reason-bridge-missing' };
        }
        let s; try { s = b.getState(); } catch (_) { return { pass: false, reasonKey: 'ba-reason-bridge-missing' }; }
        return (s && s.mode === 'live')
            ? { pass: true,  reasonKey: 'ba-reason-commit-live'   }
            : { pass: false, reasonKey: 'ba-reason-commit-dryrun' };
    }

    function checkDecisionRecordsInMemory() {
        const b = window.AppShellDecisionJournal;
        if (!b || typeof b.getState !== 'function') {
            return { pass: false, reasonKey: 'ba-reason-bridge-missing' };
        }
        const s = b.getState();
        if (!s || typeof s.count !== 'number') {
            return { pass: false, reasonKey: 'ba-reason-no-count' };
        }
        // Read-only storage probe — we never WRITE to localStorage.
        // We only enumerate keys to confirm the journal didn't leak
        // a persistence key.
        let leaked = false;
        try {
            const ks = Object.keys(localStorage);
            leaked = ks.some((k) => /decision-journal|ai-proposal-decision|journal-record/i.test(k));
        } catch (_) { leaked = false; }
        return leaked
            ? { pass: false, reasonKey: 'ba-reason-decision-persisted' }
            : { pass: true,  reasonKey: 'ba-reason-decision-memory'   };
    }

    function checkRealJournalRejected() {
        const c = window.AppShellJournalContract;
        if (!c || typeof c.validateJournalEntry !== 'function') {
            return { pass: false, reasonKey: 'ba-reason-contract-missing' };
        }
        // UNLOCKED 2026-06-01: REAL journaling is now enabled. Confirm
        // ALLOWED_MODES includes REAL.
        if (!(c.ALLOWED_MODES && typeof c.ALLOWED_MODES.has === 'function' && c.ALLOWED_MODES.has('REAL'))) {
            return { pass: false, reasonKey: 'ba-reason-real-rejected' };
        }
        // Synthetic local payload — never stored. Validator must ACCEPT
        // a well-formed REAL committed entry.
        const payload = {
            type:      'PROPOSAL_DECISION',
            mode:      'REAL',
            committed: true,
            dryRun:    false,
            decision:  'ACCEPT',
            risk:      'LOW',
            summary:   'self-test synthetic — real committed entry',
            actor:     { type: 'OPERATOR' },
            proposal:  { id: 'self-test', confidence: 0 },
            result:    { stateMutation: true, journalPersisted: true, backendCommitCalled: true },
        };
        let out;
        try { out = c.validateJournalEntry(payload); } catch (_) { out = { valid: false }; }
        return (out && out.valid === true)
            ? { pass: true,  reasonKey: 'ba-reason-real-allowed'  }
            : { pass: false, reasonKey: 'ba-reason-real-rejected' };
    }

    function checkExportSafetyFlagsRejected() {
        const c = window.AppShellJournalExportContract;
        if (!c || typeof c.validateExportPackage !== 'function') {
            return { pass: false, reasonKey: 'ba-reason-contract-missing' };
        }
        // Synthetic payload with a flipped safety flag — validator must reject.
        const tampered = {
            type:    'JOURNAL_EXPORT_PREVIEW',
            mode:    'PREVIEW_ONLY',
            entries: [],
            counts:  { entries: 0 },
            realJournalEnabled: true,                                  // forbidden
            fileWritten:        false,
            downloadCreated:    false,
            backendCalled:      false,
            stateMutation:      false,
        };
        let out1;
        try { out1 = c.validateExportPackage(tampered); } catch (_) { out1 = { valid: true }; }
        // Wrong TYPE/MODE — validator must reject.
        const wrongType = {
            type:    'REAL_EXPORT',
            mode:    'EXPORT',
            entries: [],
            counts:  { entries: 0 },
            realJournalEnabled: false,
            fileWritten:        false,
            downloadCreated:    false,
            backendCalled:      false,
            stateMutation:      false,
        };
        let out2;
        try { out2 = c.validateExportPackage(wrongType); } catch (_) { out2 = { valid: true }; }
        const ok = (out1 && out1.valid === false) && (out2 && out2.valid === false);
        return ok
            ? { pass: true,  reasonKey: 'ba-reason-export-rejected' }
            : { pass: false, reasonKey: 'ba-reason-export-accepted' };
    }

    function checkDownloadGuardLocked() {
        const g = window.AppShellJournalDownloadGuard;
        if (!g || typeof g.getState !== 'function' || typeof g.isAllowed !== 'function') {
            return { pass: false, reasonKey: 'ba-reason-guard-missing' };
        }
        const s = g.getState();
        const lockedOk  = !!(s && s.locked === true);
        const allowedNo = g.isAllowed() === false;
        return (lockedOk && allowedNo)
            ? { pass: true,  reasonKey: 'ba-reason-guard-locked'   }
            : { pass: false, reasonKey: 'ba-reason-guard-unlocked' };
    }

    function checkNoForbiddenMethods() {
        const offenders = [];
        AUDITED_BRIDGES.forEach((name) => {
            const obj = window[name];
            if (!obj || typeof obj !== 'object') return;
            const keys = Object.keys(obj);
            FORBIDDEN_METHODS.forEach((m) => {
                if (keys.indexOf(m) !== -1) offenders.push(name + '.' + m);
            });
        });
        return (offenders.length === 0)
            ? { pass: true,  reasonKey: 'ba-reason-no-forbidden'   }
            : { pass: false, reasonKey: 'ba-reason-forbidden-exposed', detail: offenders.join(', ') };
    }

    function checkScenarioUnchanged(beforeSig, afterSig) {
        try {
            const a = JSON.stringify(beforeSig || {});
            const b = JSON.stringify(afterSig  || {});
            return (a === b)
                ? { pass: true,  reasonKey: 'ba-reason-scenario-unchanged' }
                : { pass: false, reasonKey: 'ba-reason-scenario-changed'   };
        } catch (_) {
            return { pass: false, reasonKey: 'ba-reason-scenario-snapshot-failed' };
        }
    }

    // ── Self-test driver ─────────────────────────────────────────
    function runSelfTest() {
        const beforeSig = snapshotScenarioSignature();

        const out = {};
        try { out.proposalServiceDisabled   = checkProposalServiceDisabled();   } catch (_) { out.proposalServiceDisabled   = { pass: false, reasonKey: 'ba-reason-internal-error' }; }
        try { out.commitBridgeDryRun        = checkCommitBridgeDryRun();        } catch (_) { out.commitBridgeDryRun        = { pass: false, reasonKey: 'ba-reason-internal-error' }; }
        try { out.decisionRecordsInMemory   = checkDecisionRecordsInMemory();   } catch (_) { out.decisionRecordsInMemory   = { pass: false, reasonKey: 'ba-reason-internal-error' }; }
        try { out.realJournalRejected       = checkRealJournalRejected();       } catch (_) { out.realJournalRejected       = { pass: false, reasonKey: 'ba-reason-internal-error' }; }
        try { out.exportSafetyFlagsRejected = checkExportSafetyFlagsRejected(); } catch (_) { out.exportSafetyFlagsRejected = { pass: false, reasonKey: 'ba-reason-internal-error' }; }
        try { out.downloadGuardLocked       = checkDownloadGuardLocked();       } catch (_) { out.downloadGuardLocked       = { pass: false, reasonKey: 'ba-reason-internal-error' }; }
        try { out.noForbiddenMethods        = checkNoForbiddenMethods();        } catch (_) { out.noForbiddenMethods        = { pass: false, reasonKey: 'ba-reason-internal-error' }; }

        const afterSig = snapshotScenarioSignature();
        out.scenarioUnchanged = checkScenarioUnchanged(beforeSig, afterSig);

        const allPass = CHECK_KEYS.every((k) => out[k] && out[k].pass === true);
        const result = {
            ok:         allPass,
            ranAt:      Date.now(),
            checks:     out,
            beforeSig:  beforeSig,
            afterSig:   afterSig,
        };
        lastSelfTest = result;
        paintSelfTest(result);
        logSelfTest(result);
        return Object.assign({}, result);                              // defensive copy
    }

    function getSelfTestState() {
        // Defensive copy — caller cannot mutate the cached result.
        if (!lastSelfTest) return null;
        const checks = {};
        Object.keys(lastSelfTest.checks || {}).forEach((k) => {
            checks[k] = Object.assign({}, lastSelfTest.checks[k]);
        });
        return {
            ok:        lastSelfTest.ok,
            ranAt:     lastSelfTest.ranAt,
            checks:    checks,
            beforeSig: Object.assign({}, lastSelfTest.beforeSig || {}),
            afterSig:  Object.assign({}, lastSelfTest.afterSig  || {}),
        };
    }

    // ── Paint helpers (textContent only) ─────────────────────────
    function formatRanAt(ts) {
        if (!ts) return '';
        try {
            const d = new Date(ts);
            const pad = (n) => (n < 10 ? '0' + n : '' + n);
            return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        } catch (_) { return ''; }
    }

    function paintSelfTest(result) {
        const summary = document.getElementById('ba-selftest-summary');
        const ranAt   = document.getElementById('ba-selftest-ran-at');
        const list    = document.getElementById('ba-selftest-rows');
        if (!summary || !ranAt || !list) return;

        const overall = result && result.ok;
        const overallKey = (result == null) ? 'ba-selftest-not-run' : (overall ? 'ba-selftest-passed' : 'ba-selftest-failed');
        summary.setAttribute('data-state', (result == null) ? 'not-run' : (overall ? 'pass' : 'fail'));
        summary.setAttribute('data-i18n',  overallKey);
        const localized = t(overallKey);
        const fallback = (overallKey === 'ba-selftest-passed') ? 'Self-test passed'
                       : (overallKey === 'ba-selftest-failed') ? 'Self-test failed'
                       :                                          'Not run';
        summary.textContent = localized || fallback;

        if (result == null) {
            ranAt.textContent = '—';
            // Clear list via textContent path (no innerHTML).
            while (list.firstChild) list.removeChild(list.firstChild);
            return;
        }
        ranAt.textContent = formatRanAt(result.ranAt);

        // Rebuild rows from scratch — same closed set every time.
        while (list.firstChild) list.removeChild(list.firstChild);
        CHECK_KEYS.forEach((key) => {
            const check = result.checks[key];
            const labelKey  = CHECK_LABEL_KEYS[key];
            const li = document.createElement('li');
            li.className = 'ba-check-row';
            li.setAttribute('data-check', key);

            const label = document.createElement('span');
            label.className = 'ba-check-label';
            label.setAttribute('data-i18n', labelKey);
            const labelText = t(labelKey) || labelKey;
            label.textContent = labelText;

            const status = document.createElement('span');
            status.className = 'ba-check-status';
            const passKey = check.pass ? 'ba-check-pass' : 'ba-check-fail';
            status.setAttribute('data-result', check.pass ? 'pass' : 'fail');
            status.setAttribute('data-i18n', passKey);
            const passText = t(passKey) || (check.pass ? 'PASS' : 'FAIL');
            status.textContent = passText;

            const reason = document.createElement('span');
            reason.className = 'ba-check-reason';
            reason.setAttribute('data-i18n', check.reasonKey);
            const reasonText = t(check.reasonKey) || check.reasonKey;
            reason.textContent = check.detail ? (reasonText + ' — ' + check.detail) : reasonText;

            li.appendChild(label);
            li.appendChild(status);
            li.appendChild(reason);
            list.appendChild(li);
        });
        // PR-25: keep the regression summary in sync after every
        // self-test repaint (including the initial "Not run" paint).
        try { renderRegressionSummary(); } catch (_) { /* never throw */ }
    }

    function logSelfTest(result) {
        const log = window.AppShellEventLog;
        if (!log || typeof log.append !== 'function') return;
        const failedKeys = CHECK_KEYS.filter((k) => result.checks[k] && result.checks[k].pass === false);
        try {
            log.append({
                severity:   result.ok ? 'NOTICE'  : 'WARNING',
                category:   'UI',                                   // closed-set; PR-6 gate
                source:     'boundary-audit-panel',
                messageKey: result.ok ? 'elog-evt-boundary-selftest-passed' : 'elog-evt-boundary-selftest-failed',
                message:    result.ok ? 'Boundary self-test passed' : 'Boundary self-test failed',
                payload:    {
                    failedChecks: failedKeys,
                    ranAt:        result.ranAt,
                },
            });
        } catch (_) { /* never throw */ }
    }

    // Button wiring — single click handler bound at init().
    function bindSelfTestButton() {
        const btn = document.getElementById('ba-selftest-run-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            try { runSelfTest(); } catch (_) { /* never throw */ }
        });
    }

    // ═════════════════════════════════════════════════════════════
    // PR-24 — Read-only Violation Test Harness
    // -------------------------------------------------------------
    // `runViolationTests()` runs ten synthetic violation attempts
    // and confirms each is rejected by the existing contracts /
    // guards. The harness is read-only:
    //   - Tests 1-6 are pure validator calls with synthetic local
    //     payloads. Validators are pure functions.
    //   - Test 7 calls the guard's documented setEnabled() entry
    //     point. PR-20 designed this as a rejection-only path
    //     while locked; the harness asserts the rejection.
    //   - Test 8 calls downloadPackage() and verifies via internal
    //     spies that NO Blob / URL.createObjectURL / anchor.click
    //     is invoked during the call (PR-21's short-circuit path).
    //   - Tests 9-10 call commitDecision() with invalid inputs.
    //     PR-12 commit bridge rejects before any dry-run work.
    //
    // Strict invariants in this section:
    //   1. NO fetch / XHR / sendBeacon — except via the existing
    //      guarded surfaces which we EXPECT to short-circuit. Test
    //      #8 installs spies to verify zero file/blob/anchor
    //      activity during downloadPackage(); spies are restored.
    //   2. NO Blob / URL.createObjectURL / <a download> directly
    //      from this harness file (only as spy counters).
    //   3. NO localStorage / sessionStorage / IndexedDB writes.
    //   4. NO setLocked / unlock / enable on PR-20 guard. setEnabled
    //      is called only to verify rejection in test #7; the
    //      guard's state.locked remains true.
    //   5. Scenario-safe signature {side, decisionCount, inboxLen,
    //      downloadIsAllowed} must be byte-identical before/after.
    // ═════════════════════════════════════════════════════════════

    // Closed-set violation-test identifiers (order = render order).
    const VIOLATION_KEYS = Object.freeze([
        'journalRealMode',
        'journalCommittedTrue',
        'journalDryRunFalse',
        'exportNonPreviewMode',
        'exportFileWrittenTrue',
        'exportDownloadCreatedTrue',
        'downloadGuardEnableAttempt',
        'downloadPackageAttempt',
        'commitInvalidDecision',
        'commitInvalidProposal',
        'copyAuditFieldGuard',      // PR-37: inspector unknown-payload guard
        'copyAuditAgeTimerCleanup', // PR-39: age-label timer cleared on reset
    ]);

    const VIOLATION_LABEL_KEYS = Object.freeze({
        journalRealMode:            'ba-vtest-journal-real',
        journalCommittedTrue:       'ba-vtest-journal-committed',
        journalDryRunFalse:         'ba-vtest-journal-dryrun-false',
        exportNonPreviewMode:       'ba-vtest-export-mode',
        exportFileWrittenTrue:      'ba-vtest-export-file-written',
        exportDownloadCreatedTrue:  'ba-vtest-export-download-created',
        downloadGuardEnableAttempt: 'ba-vtest-guard-enable',
        downloadPackageAttempt:     'ba-vtest-download-package',
        commitInvalidDecision:      'ba-vtest-commit-invalid-decision',
        commitInvalidProposal:      'ba-vtest-commit-invalid-proposal',
        copyAuditFieldGuard:        'ba-vtest-copy-audit-field-guard',
        copyAuditAgeTimerCleanup:   'ba-vtest-copy-audit-age-timer-cleanup',
    });

    let lastViolationTests = null;

    // ── Minimal valid base payloads (local, GC'd at call exit) ───
    function baseJournalEntry() {
        return {
            type:      'PROPOSAL_DECISION',
            mode:      'DRY_RUN',
            committed: false,
            dryRun:    true,
            decision:  'ACCEPT',
            risk:      'LOW',
            summary:   'vtest synthetic — must be rejected',
            actor:     { type: 'OPERATOR' },
            proposal:  { id: 'vtest', confidence: 0 },
            result:    { stateMutation: false, journalPersisted: false, backendCommitCalled: false },
        };
    }
    function baseExportPackage() {
        return {
            type:    'JOURNAL_EXPORT_PREVIEW',
            mode:    'PREVIEW_ONLY',
            entries: [],
            counts:  { entries: 0 },
            realJournalEnabled: false,
            fileWritten:        false,
            downloadCreated:    false,
            backendCalled:      false,
            stateMutation:      false,
        };
    }
    function validSampleProposal() {
        // PR-8 provides the canonical sample; fall back to a
        // minimal-but-valid literal if the contract isn't loaded.
        const C = window.AppShellAIProposalContract;
        if (C && typeof C.createSampleProposal === 'function') {
            try { return C.createSampleProposal(); } catch (_) { /* fall through */ }
        }
        return null;
    }

    // ── Individual violation tests ────────────────────────────────
    // Each returns { rejected: bool, reasonKey, detail? }.
    // UNLOCKED 2026-06-01: REAL / committed:true / dryRun:false are no
    // longer violations. These three now confirm the OPEN contract
    // still rejects MALFORMED real entries (missing id / bad actor /
    // bad result shape) — the contract still guards entry integrity.
    function baseRealEntry() {
        return {
            type:      'PROPOSAL_DECISION',
            mode:      'REAL',
            committed: true,
            dryRun:    false,
            decision:  'ACCEPT',
            risk:      'LOW',
            summary:   'vtest synthetic — real, malformed on purpose',
            actor:     { type: 'OPERATOR' },
            proposal:  { id: 'vtest' },
            result:    { stateMutation: true, journalPersisted: true, backendCommitCalled: true },
        };
    }
    function vtestJournalRealMode() {
        const C = window.AppShellJournalContract;
        if (!C || typeof C.validateJournalEntry !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const p = baseRealEntry(); p.proposal = { id: '' };          // missing proposal id
        let out; try { out = C.validateJournalEntry(p); } catch (_) { out = { valid: true }; }
        return (out && out.valid === false)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestJournalCommittedTrue() {
        const C = window.AppShellJournalContract;
        if (!C || typeof C.validateJournalEntry !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const p = baseRealEntry(); p.actor = { type: 'BOGUS' };      // bad actor type
        let out; try { out = C.validateJournalEntry(p); } catch (_) { out = { valid: true }; }
        return (out && out.valid === false)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestJournalDryRunFalse() {
        const C = window.AppShellJournalContract;
        if (!C || typeof C.validateJournalEntry !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const p = baseRealEntry(); p.result = 'not-an-object';       // bad result shape
        let out; try { out = C.validateJournalEntry(p); } catch (_) { out = { valid: true }; }
        return (out && out.valid === false)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestExportNonPreviewMode() {
        const C = window.AppShellJournalExportContract;
        if (!C || typeof C.validateExportPackage !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const p = baseExportPackage(); p.type = 'REAL_EXPORT'; p.mode = 'EXPORT';
        let out; try { out = C.validateExportPackage(p); } catch (_) { out = { valid: true }; }
        return (out && out.valid === false)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestExportFileWrittenTrue() {
        const C = window.AppShellJournalExportContract;
        if (!C || typeof C.validateExportPackage !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const p = baseExportPackage(); p.fileWritten = true;
        let out; try { out = C.validateExportPackage(p); } catch (_) { out = { valid: true }; }
        return (out && out.valid === false)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestExportDownloadCreatedTrue() {
        const C = window.AppShellJournalExportContract;
        if (!C || typeof C.validateExportPackage !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const p = baseExportPackage(); p.downloadCreated = true;
        let out; try { out = C.validateExportPackage(p); } catch (_) { out = { valid: true }; }
        return (out && out.valid === false)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestDownloadGuardEnableAttempt() {
        const g = window.AppShellJournalDownloadGuard;
        if (!g || typeof g.setEnabled !== 'function' || typeof g.getState !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        let ret;
        try { ret = g.setEnabled(true); } catch (_) { ret = true; }
        const s = g.getState();
        const stillLocked = !!(s && s.locked === true);
        const returnedFalsy = (ret === false || ret === null || ret === undefined);
        return (stillLocked && returnedFalsy)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-locked' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestDownloadPackageAttempt() {
        const e = window.AppShellJournalExportPreview;
        if (!e || typeof e.downloadPackage !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        // Install local spies on the file/network paths for the
        // duration of this single call only. Counters increment if
        // PR-21's short-circuit ever leaked. Restored in finally.
        const spy = { blob: 0, objURL: 0, anchorClick: 0 };
        const _Blob = window.Blob;
        const _coURL = URL.createObjectURL;
        const _click = HTMLAnchorElement.prototype.click;
        window.Blob = function () { spy.blob++; return new _Blob(...arguments); };
        URL.createObjectURL = function () { spy.objURL++; return _coURL.apply(this, arguments); };
        HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download')) spy.anchorClick++; return _click.apply(this, arguments); };
        let ret;
        try { ret = e.downloadPackage(); } catch (_) { ret = 'threw'; }
        finally {
            window.Blob = _Blob;
            URL.createObjectURL = _coURL;
            HTMLAnchorElement.prototype.click = _click;
        }
        const returnedNull = (ret === null);
        const cleanSpies   = (spy.blob === 0 && spy.objURL === 0 && spy.anchorClick === 0);
        return (returnedNull && cleanSpies)
            ? { rejected: true,  reasonKey: 'ba-vtest-r-returned-null' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted',
                detail: returnedNull ? ('side-effects: ' + JSON.stringify(spy)) : ('returned: ' + JSON.stringify(ret)) };
    }
    function vtestCommitInvalidDecision() {
        const b = window.AppShellAIProposalCommitBridge;
        if (!b || typeof b.commitDecision !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        const sample = validSampleProposal();
        let ret;
        try { ret = b.commitDecision('REAL_COMMIT', sample); } catch (_) { ret = 'threw'; }
        const rejected = (ret === null) || (ret && ret.ok === false) || (ret && ret.committed === true ? false : ret == null);
        return rejected
            ? { rejected: true,  reasonKey: 'ba-vtest-r-returned-null' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }
    function vtestCommitInvalidProposal() {
        const b = window.AppShellAIProposalCommitBridge;
        if (!b || typeof b.commitDecision !== 'function') return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };
        // Deliberately invalid — missing required fields. The PR-8
        // contract should reject inside the commit bridge.
        const badProposal = { id: '' };
        let ret;
        try { ret = b.commitDecision('ACCEPT', badProposal); } catch (_) { ret = 'threw'; }
        const rejected = (ret === null) || (ret && ret.ok === false);
        return rejected
            ? { rejected: true,  reasonKey: 'ba-vtest-r-returned-null' }
            : { rejected: false, reasonKey: 'ba-vtest-r-accepted' };
    }

    // PR-37 — Inspector unknown-payload guard check.
    // Paints two synthetic payloads (success + failure), each carrying
    // all 7 allowed fields plus 11 forbidden extras with a sentinel value.
    // Asserts:
    //   A. Sentinel never appears in inspector DOM text (unknown values blocked).
    //   B. No data-field outside COPY_AUDIT_DISPLAY_FIELDS is rendered.
    //   C. bytes/reason visibility follows success vs failure path.
    // Restores previous inspector state (or null) in finally.
    // Read-only: no storage, no network, no clipboard, no scenario mutation.
    function vtestCopyAuditFieldGuard() {
        // Capture current inspector payload so we can restore it afterward.
        const prevPayload = lastCopyAuditPayload;

        try {
            // Sentinel: a string that cannot appear in any i18n translation or
            // normal display value. Its presence in the DOM would mean an
            // unknown payload key reached the inspector via an unguarded path.
            const SENTINEL = 'GUARD-TEST-PAYLOAD-MUST-NOT-APPEAR';

            const unknownExtras = {
                summary:         SENTINEL,
                affectedUnits:   SENTINEL,
                expectedEffect:  SENTINEL,
                actor:           SENTINEL,
                proposal:        SENTINEL,
                result:          SENTINEL,
                units:           SENTINEL,
                lines:           SENTINEL,
                map:             SENTINEL,
                coords:          SENTINEL,
                hiddenSecret:    SENTINEL,
            };

            // Phase A — success path (action = safety-checklist-copy).
            // bytes row must be visible; reason row must be hidden.
            const successPayload = Object.assign({
                source:           'boundary-audit-panel',
                action:           'safety-checklist-copy',
                bytes:            7,
                checklistVisible: true,
                copySource:       'visible-pre-textcontent',
                timestamp:        new Date().toISOString(),
            }, unknownExtras);

            paintChecklistCopyAuditDetails(successPayload);

            const root = document.getElementById('ba-copy-audit');
            if (!root) return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };

            const sentinelInSuccess = (root.textContent || '').indexOf(SENTINEL) !== -1;

            const renderedA = Array.from(
                root.querySelectorAll('.ba-copy-audit-row[data-field]')
            ).map(function (r) { return r.getAttribute('data-field'); });
            const unknownRenderedA = renderedA.filter(function (f) {
                return COPY_AUDIT_DISPLAY_FIELDS.indexOf(f) === -1;
            });

            const bytesRowA  = root.querySelector('.ba-copy-audit-row[data-field="bytes"]');
            const reasonRowA = root.querySelector('.ba-copy-audit-row[data-field="reason"]');
            const bytesVisibleA  = !!(bytesRowA  && !bytesRowA.hasAttribute('hidden'));
            const reasonHiddenA  = !!(reasonRowA &&  reasonRowA.hasAttribute('hidden'));

            // Phase B — failure path (action = safety-checklist-copy-failed).
            // reason row must be visible; bytes row must be hidden.
            const failurePayload = Object.assign({
                source:           'boundary-audit-panel',
                action:           'safety-checklist-copy-failed',
                reason:           'permission-denied',
                checklistVisible: true,
                copySource:       'visible-pre-textcontent',
                timestamp:        new Date().toISOString(),
            }, unknownExtras);

            paintChecklistCopyAuditDetails(failurePayload);

            const sentinelInFailure = (root.textContent || '').indexOf(SENTINEL) !== -1;

            const renderedB = Array.from(
                root.querySelectorAll('.ba-copy-audit-row[data-field]')
            ).map(function (r) { return r.getAttribute('data-field'); });
            const unknownRenderedB = renderedB.filter(function (f) {
                return COPY_AUDIT_DISPLAY_FIELDS.indexOf(f) === -1;
            });

            const bytesRowB  = root.querySelector('.ba-copy-audit-row[data-field="bytes"]');
            const reasonRowB = root.querySelector('.ba-copy-audit-row[data-field="reason"]');
            const bytesHiddenB   = !!(bytesRowB  &&  bytesRowB.hasAttribute('hidden'));
            const reasonVisibleB = !!(reasonRowB && !reasonRowB.hasAttribute('hidden'));

            const passed = !sentinelInSuccess
                        && !sentinelInFailure
                        && unknownRenderedA.length === 0
                        && unknownRenderedB.length === 0
                        && bytesVisibleA
                        && reasonHiddenA
                        && bytesHiddenB
                        && reasonVisibleB;

            return passed
                ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
                : { rejected: false, reasonKey: 'ba-vtest-r-accepted',
                    detail: JSON.stringify({
                        sentinelInSuccess,
                        sentinelInFailure,
                        unknownRenderedA,
                        unknownRenderedB,
                        bytesVisibleA,
                        reasonHiddenA,
                        bytesHiddenB,
                        reasonVisibleB,
                    }) };
        } catch (_) {
            return { rejected: false, reasonKey: 'ba-vtest-r-internal-error' };
        } finally {
            // Restore: repaint the previous payload (or null).
            // This ensures the synthetic payload never lingers in
            // the operator-visible inspector after the test exits.
            try { paintChecklistCopyAuditDetails(prevPayload != null ? prevPayload : null); } catch (_) { /* never throw */ }
        }
    }

    // PR-39 — Copy-audit age-label timer cleanup guard.
    // Verifies that the PR-34 age-label interval is started when a
    // valid payload is painted and stopped (element hidden + text
    // cleared) when the inspector is reset via the null-paint path.
    // Observable proxy for copyAuditAgeTimer (module-private):
    //   started  → ageEl has no [hidden], textContent non-empty
    //   stopped  → ageEl has [hidden], textContent === ''
    // No long-running timer is left behind: the null paint clears it,
    // and the finally restore re-establishes the original state.
    // Read-only: no storage, no network, no clipboard, no scenario mutation.
    function vtestCopyAuditAgeTimerCleanup() {
        const prevPayload = lastCopyAuditPayload;

        try {
            const ageEl = document.getElementById('ba-copy-audit-age');
            if (!ageEl) return { rejected: false, reasonKey: 'ba-vtest-r-bridge-missing' };

            // Step 1: Paint a synthetic payload carrying a valid timestamp.
            // The paint path should: remove [hidden] from ageEl, set its
            // textContent to the localised age string, and start the
            // 30-second refresh interval.
            paintChecklistCopyAuditDetails({
                source:           'boundary-audit-panel',
                action:           'safety-checklist-copy',
                bytes:            3,
                checklistVisible: true,
                copySource:       'visible-pre-textcontent',
                timestamp:        new Date().toISOString(),
            });

            const ageVisibleAfterPaint = !ageEl.hasAttribute('hidden');
            const ageTextAfterPaint    = (typeof ageEl.textContent === 'string'
                                          && ageEl.textContent.length > 0);

            // Step 2: Paint null — the same timer-cleanup path taken by
            // the page reload init and by clearChecklistCopyAuditDetails().
            // Should: set [hidden] on ageEl, empty its textContent, and
            // call clearInterval on the running interval handle.
            paintChecklistCopyAuditDetails(null);

            const ageHiddenAfterNull = ageEl.hasAttribute('hidden');
            const ageEmptyAfterNull  = (ageEl.textContent === '');

            const passed = ageVisibleAfterPaint
                        && ageTextAfterPaint
                        && ageHiddenAfterNull
                        && ageEmptyAfterNull;

            return passed
                ? { rejected: true,  reasonKey: 'ba-vtest-r-rejected' }
                : { rejected: false, reasonKey: 'ba-vtest-r-accepted',
                    detail: JSON.stringify({
                        ageVisibleAfterPaint,
                        ageTextAfterPaint,
                        ageHiddenAfterNull,
                        ageEmptyAfterNull,
                    }) };
        } catch (_) {
            return { rejected: false, reasonKey: 'ba-vtest-r-internal-error' };
        } finally {
            // Restore: repaint the previous payload (or null) so the
            // operator-visible inspector reflects its pre-test state.
            // lastCopyAuditPayload is untouched because paintChecklistCopyAuditDetails
            // never writes it; the language-change repaint will use the
            // correct cached value.
            try { paintChecklistCopyAuditDetails(prevPayload != null ? prevPayload : null); } catch (_) { /* never throw */ }
        }
    }

    const VIOLATION_TESTS = {
        journalRealMode:            vtestJournalRealMode,
        journalCommittedTrue:       vtestJournalCommittedTrue,
        journalDryRunFalse:         vtestJournalDryRunFalse,
        exportNonPreviewMode:       vtestExportNonPreviewMode,
        exportFileWrittenTrue:      vtestExportFileWrittenTrue,
        exportDownloadCreatedTrue:  vtestExportDownloadCreatedTrue,
        downloadGuardEnableAttempt: vtestDownloadGuardEnableAttempt,
        downloadPackageAttempt:     vtestDownloadPackageAttempt,
        commitInvalidDecision:      vtestCommitInvalidDecision,
        commitInvalidProposal:      vtestCommitInvalidProposal,
        copyAuditFieldGuard:        vtestCopyAuditFieldGuard,
        copyAuditAgeTimerCleanup:   vtestCopyAuditAgeTimerCleanup,
    };

    // ── Driver ───────────────────────────────────────────────────
    function runViolationTests() {
        const beforeSig = snapshotScenarioSignature();

        const out = {};
        VIOLATION_KEYS.forEach((key) => {
            const fn = VIOLATION_TESTS[key];
            let res;
            try { res = fn(); } catch (_) { res = { rejected: false, reasonKey: 'ba-vtest-r-internal-error' }; }
            out[key] = res;
        });

        const afterSig = snapshotScenarioSignature();
        const sigUnchanged = (JSON.stringify(beforeSig) === JSON.stringify(afterSig));

        const allRejected = VIOLATION_KEYS.every((k) => out[k] && out[k].rejected === true);
        const result = {
            ok:           allRejected && sigUnchanged,
            ranAt:        Date.now(),
            tests:        out,
            sigUnchanged: sigUnchanged,
            beforeSig:    beforeSig,
            afterSig:     afterSig,
        };
        lastViolationTests = result;
        paintViolationTests(result);
        logViolationTests(result);
        return Object.assign({}, result);                              // defensive copy
    }

    function getViolationTestState() {
        if (!lastViolationTests) return null;
        const tests = {};
        Object.keys(lastViolationTests.tests || {}).forEach((k) => {
            tests[k] = Object.assign({}, lastViolationTests.tests[k]);
        });
        return {
            ok:           lastViolationTests.ok,
            ranAt:        lastViolationTests.ranAt,
            tests:        tests,
            sigUnchanged: lastViolationTests.sigUnchanged,
            beforeSig:    Object.assign({}, lastViolationTests.beforeSig || {}),
            afterSig:     Object.assign({}, lastViolationTests.afterSig  || {}),
        };
    }

    // ── Paint (textContent only) ─────────────────────────────────
    function paintViolationTests(result) {
        const summary = document.getElementById('ba-vtest-summary');
        const ranAt   = document.getElementById('ba-vtest-ran-at');
        const list    = document.getElementById('ba-vtest-rows');
        if (!summary || !ranAt || !list) return;

        const overallKey = (result == null) ? 'ba-vtest-not-run' : (result.ok ? 'ba-vtest-passed' : 'ba-vtest-failed');
        summary.setAttribute('data-state', (result == null) ? 'not-run' : (result.ok ? 'pass' : 'fail'));
        summary.setAttribute('data-i18n',  overallKey);
        const fallback = (overallKey === 'ba-vtest-passed') ? 'Violation tests passed'
                       : (overallKey === 'ba-vtest-failed') ? 'Violation tests failed'
                       :                                       'Not run';
        summary.textContent = t(overallKey) || fallback;

        if (result == null) {
            ranAt.textContent = '—';
            while (list.firstChild) list.removeChild(list.firstChild);
            return;
        }
        ranAt.textContent = formatRanAt(result.ranAt);

        while (list.firstChild) list.removeChild(list.firstChild);
        VIOLATION_KEYS.forEach((key) => {
            const v = result.tests[key];
            const labelKey = VIOLATION_LABEL_KEYS[key];
            const li = document.createElement('li');
            li.className = 'ba-vtest-row';
            li.setAttribute('data-test', key);

            const label = document.createElement('span');
            label.className = 'ba-vtest-label';
            label.setAttribute('data-i18n', labelKey);
            label.textContent = t(labelKey) || labelKey;

            const status = document.createElement('span');
            status.className = 'ba-vtest-result';
            const sKey = v.rejected ? 'ba-vtest-rejected' : 'ba-vtest-accepted';
            status.setAttribute('data-result', v.rejected ? 'rejected' : 'accepted');
            status.setAttribute('data-i18n', sKey);
            status.textContent = t(sKey) || (v.rejected ? 'REJECTED' : 'ACCEPTED');

            const reason = document.createElement('span');
            reason.className = 'ba-vtest-reason';
            reason.setAttribute('data-i18n', v.reasonKey);
            const reasonText = t(v.reasonKey) || v.reasonKey;
            reason.textContent = v.detail ? (reasonText + ' — ' + v.detail) : reasonText;

            li.appendChild(label);
            li.appendChild(status);
            li.appendChild(reason);
            list.appendChild(li);
        });
        // PR-25: keep the regression summary in sync after every
        // violation-tests repaint (including the initial "Not run").
        try { renderRegressionSummary(); } catch (_) { /* never throw */ }
    }

    function logViolationTests(result) {
        const log = window.AppShellEventLog;
        if (!log || typeof log.append !== 'function') return;
        const accepted = VIOLATION_KEYS.filter((k) => result.tests[k] && result.tests[k].rejected === false);
        try {
            log.append({
                severity:   result.ok ? 'NOTICE'  : 'WARNING',
                category:   'UI',                                   // closed-set; PR-6 gate
                source:     'boundary-audit-panel',
                messageKey: result.ok ? 'elog-evt-boundary-vtests-passed' : 'elog-evt-boundary-vtests-failed',
                message:    result.ok ? 'Boundary violation tests passed' : 'Boundary violation tests failed',
                payload:    {
                    unexpectedlyAccepted: accepted,
                    sigUnchanged:         result.sigUnchanged,
                    ranAt:                result.ranAt,
                },
            });
        } catch (_) { /* never throw */ }
    }

    function bindViolationTestButton() {
        const btn = document.getElementById('ba-vtest-run-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            try { runViolationTests(); } catch (_) { /* never throw */ }
        });
    }

    // ═════════════════════════════════════════════════════════════
    // PR-25 — Safety Regression Summary (read-only mirror)
    // -------------------------------------------------------------
    // The summary card reads ONLY the module-private cache of the
    // latest PR-23 self-test and PR-24 violation-test results, and
    // paints a compact overall status:
    //   - Clean (green)              both passed
    //   - Attention required (red)   either failed
    //   - Attention required (yellow) one or both not yet run
    //
    // Strict invariants in this section:
    //   1. NEVER triggers a test. The summary does not call
    //      runSelfTest() or runViolationTests().
    //   2. NEVER persists. lastSelfTest / lastViolationTests live
    //      only in this module's closure; reload erases them.
    //   3. NO fetch / XHR / sendBeacon / Blob / URL.createObjectURL
    //      / <a download> / localStorage / sessionStorage.
    //   4. textContent-only DOM updates. No innerHTML.
    // ═════════════════════════════════════════════════════════════

    const SUMMARY_OVERALL_KEYS = Object.freeze({
        clean:     'ba-summary-clean',
        attention: 'ba-summary-attention',
        notRun:    'ba-summary-not-run',
    });

    const SUMMARY_PERROW_KEYS = Object.freeze({
        notRun: 'ba-summary-perrow-not-run',
        passed: 'ba-summary-perrow-passed',
        failed: 'ba-summary-perrow-failed',
    });

    function perRowState(testResult) {
        if (testResult == null) return 'notRun';
        return testResult.ok ? 'passed' : 'failed';
    }

    function overallStateAndTone(selfState, violationState) {
        const failedAny  = (selfState === 'failed') || (violationState === 'failed');
        const passedBoth = (selfState === 'passed') && (violationState === 'passed');
        if (failedAny)  return { overall: 'attention', tone: 'red'    };
        if (passedBoth) return { overall: 'clean',     tone: 'green'  };
        return                 { overall: 'attention', tone: 'yellow' }; // includes any "notRun"
    }

    function getRegressionSummary() {
        const selfState   = perRowState(lastSelfTest);
        const violationState = perRowState(lastViolationTests);
        const { overall, tone } = overallStateAndTone(selfState, violationState);
        // Most-recent ranAt across both, for display only. May be null.
        const ranAts = [];
        if (lastSelfTest      && typeof lastSelfTest.ranAt      === 'number') ranAts.push(lastSelfTest.ranAt);
        if (lastViolationTests && typeof lastViolationTests.ranAt === 'number') ranAts.push(lastViolationTests.ranAt);
        const lastResultAt = ranAts.length ? Math.max.apply(null, ranAts) : null;
        return {
            overall:        overall,
            overallToneKey: tone,
            overallI18n:    SUMMARY_OVERALL_KEYS[overall === 'clean' ? 'clean' :
                                                  (selfState === 'notRun' && violationState === 'notRun') ? 'notRun' :
                                                  'attention'],
            selfTest:       { state: selfState,      i18n: SUMMARY_PERROW_KEYS[selfState] },
            violationTests: { state: violationState, i18n: SUMMARY_PERROW_KEYS[violationState] },
            lastResultAt:   lastResultAt,
        };
    }

    // Track the last rendered overall state so we only emit a
    // UI/NOTICE row when the state actually changes — keeps the
    // Event Log readable rather than spammed on every repaint.
    let lastSummaryOverallEmitted = null;
    function renderRegressionSummary() {
        const root = document.getElementById('ba-summary');
        if (!root) return;
        const s = getRegressionSummary();

        const overallEl = document.getElementById('ba-summary-overall');
        if (overallEl) {
            overallEl.setAttribute('data-state', s.overall);
            overallEl.setAttribute('data-tone',  s.overallToneKey);
            overallEl.setAttribute('data-i18n',  s.overallI18n);
            const fallback = (s.overallI18n === 'ba-summary-clean')     ? 'Clean'
                           : (s.overallI18n === 'ba-summary-not-run')   ? 'Not run'
                           :                                              'Attention required';
            overallEl.textContent = t(s.overallI18n) || fallback;
        }

        const selfEl = document.getElementById('ba-summary-selftest-state');
        if (selfEl) {
            const key = s.selfTest.i18n;
            selfEl.setAttribute('data-state', s.selfTest.state);
            selfEl.setAttribute('data-i18n',  key);
            const fallback = (key === 'ba-summary-perrow-passed') ? 'Passed'
                           : (key === 'ba-summary-perrow-failed') ? 'Failed'
                           :                                        'Not run';
            selfEl.textContent = t(key) || fallback;
        }

        const vEl = document.getElementById('ba-summary-vtest-state');
        if (vEl) {
            const key = s.violationTests.i18n;
            vEl.setAttribute('data-state', s.violationTests.state);
            vEl.setAttribute('data-i18n',  key);
            const fallback = (key === 'ba-summary-perrow-passed') ? 'Passed'
                           : (key === 'ba-summary-perrow-failed') ? 'Failed'
                           :                                        'Not run';
            vEl.textContent = t(key) || fallback;
        }

        const ranAtEl = document.getElementById('ba-summary-ran-at');
        if (ranAtEl) {
            ranAtEl.textContent = s.lastResultAt ? formatRanAt(s.lastResultAt) : '—';
        }

        // PR-26: dispatch a UI-only event so the safety badge in
        // #ai-proposal-section can mirror the overall state without
        // polling. Payload carries summary stats only — no proposal,
        // no journal, no backend data. Fires on every repaint; the
        // badge handler is cheap (single textContent update).
        try {
            document.dispatchEvent(new CustomEvent('rmooz:safety-regression-summary-changed', {
                detail: {
                    overall:        s.overall,
                    tone:           s.overallToneKey,
                    selfTest:       s.selfTest.state,
                    violationTests: s.violationTests.state,
                    lastResultAt:   s.lastResultAt || null,
                },
            }));
        } catch (_) { /* never throw */ }

        // Optional UI/NOTICE log row — emit ONLY when the overall
        // state actually transitions. Prevents log spam on language
        // switches and incidental repaints. NEVER claims a feature
        // is enabled. Closed-set category UI; PR-6 gate.
        const overallKey = s.overall + ':' + s.overallToneKey;
        if (overallKey !== lastSummaryOverallEmitted) {
            lastSummaryOverallEmitted = overallKey;
            const log = window.AppShellEventLog;
            if (log && typeof log.append === 'function') {
                try {
                    log.append({
                        severity:    'NOTICE',
                        category:    'UI',
                        source:      'boundary-audit-panel',
                        messageKey:  'elog-evt-boundary-summary-rendered',
                        message:     'Safety regression summary rendered',
                        payload:     {
                            overall:        s.overall,
                            tone:           s.overallToneKey,
                            selfTest:       s.selfTest.state,
                            violationTests: s.violationTests.state,
                        },
                    });
                } catch (_) { /* never throw */ }
            }
        }
    }

    // ═════════════════════════════════════════════════════════════
    // PR-28 — Safety Checklist Preview (read-only)
    // -------------------------------------------------------------
    // `generateChecklist()` builds a strictly summarized plain JS
    // object whose values are ALL primitives (status enum strings,
    // booleans, ISO timestamp, static notes array). The object is
    // rendered into a <pre> via textContent — no innerHTML, no
    // Blob, no anchor download, no fetch.
    //
    // Strict invariants in this section:
    //   1. NO proposal body, NO journal entry payload, NO export
    //      entry payload, NO map / unit / line / scenario object.
    //      Only closed-set status enums and safety flags.
    //   2. NO fetch / XHR / sendBeacon / Blob / URL.createObjectURL
    //      / <a download>.
    //   3. NO localStorage / sessionStorage / IndexedDB.
    //   4. NO setter is called on any audited bridge. State reads
    //      use getState / getRowsSnapshot / getSelfTestState /
    //      getViolationTestState / getRegressionSummary — every one
    //      returns a defensive copy.
    //   5. NEVER auto-generates on page load. Operator must click
    //      Generate.
    // ═════════════════════════════════════════════════════════════

    // Closed-set mapping from PR-22 STATUS_KEYS → the brief's
    // UPPER_SNAKE_CASE enum values for the checklist.
    const CHECKLIST_BOUNDARY_ENUM = Object.freeze({
        'ba-status-not-connected':  'NOT_CONNECTED',
        'ba-status-connected':      'CONNECTED',
        'ba-status-dry-run-only':   'DRY_RUN_ONLY',
        'ba-status-in-memory-only': 'IN_MEMORY_ONLY',
        'ba-status-not-enabled':    'NOT_ENABLED',
        'ba-status-preview-only':   'PREVIEW_ONLY',
        'ba-status-locked':         'LOCKED',
        'ba-status-blocked':        'BLOCKED',
        'ba-status-forbidden':      'FORBIDDEN',
        'ba-status-unknown':        'UNKNOWN',
    });

    // Cached last checklist (in-memory only). Cleared on
    // clearChecklist() and dead on reload.
    let lastChecklist = null;

    function boundariesEnumMap() {
        // Re-derive the 9 boundary rows so the checklist reflects
        // the CURRENT state (not the cached lastSnapshot which may
        // be from an earlier paint cycle).
        const out = {};
        ROW_KEYS.forEach((key) => {
            const derive = DERIVERS[key];
            let row;
            try { row = (typeof derive === 'function') ? derive() : null; }
            catch (_) { row = null; }
            const statusKey = (row && row.statusKey) || STATUS_KEYS.unknown;
            out[key] = CHECKLIST_BOUNDARY_ENUM[statusKey] || 'UNKNOWN';
        });
        return out;
    }

    function testResultEnum(result) {
        if (!result) return 'NOT_RUN';
        return result.ok ? 'PASSED' : 'FAILED';
    }

    function regressionResultEnum(summary) {
        if (!summary) return 'NOT_RUN';
        if (summary.overall === 'clean') return 'CLEAN';
        // PR-25 maps "both not run" → overall 'attention', tone yellow.
        // For the checklist enum we surface NOT_RUN when neither
        // result exists, ATTENTION_REQUIRED otherwise.
        const selfRun = !!lastSelfTest;
        const vRun    = !!lastViolationTests;
        if (!selfRun && !vRun) return 'NOT_RUN';
        return 'ATTENTION_REQUIRED';
    }

    function buildChecklistObject() {
        let summary = null;
        try { summary = getRegressionSummary(); } catch (_) { summary = null; }
        return {
            type:             'SAFETY_CHECKLIST_PREVIEW',
            mode:             'PREVIEW_ONLY',
            generatedAt:      new Date(Date.now()).toISOString(),
            app:              'RMOOZ',
            // Safety flags for the CHECKLIST-GENERATION action itself —
            // generating this preview still writes no file, creates no
            // download, calls no backend, and mutates no scenario state.
            // (System-level commit posture is in `boundaries` + `notes`.)
            localOnly:        true,
            fileWritten:      false,
            downloadCreated:  false,
            backendCalled:    false,
            scenarioMutation: false,
            boundaries:       boundariesEnumMap(),
            tests: {
                selfTest:        testResultEnum(lastSelfTest),
                violationTests:  testResultEnum(lastViolationTests),
                regression:      regressionResultEnum(summary),
            },
            notes: [
                'Operator commit: LIVE — ACCEPT/REJECT POST /api/sim/commit',
                'Real journal: ENABLED — durable rows at data/journal/<run>.jsonl',
                'Decision Records: in-memory UI mirror only',
                'Export: preview only · Download: locked',
                'No client scenario-state mutation',
            ],
        };
    }

    function logChecklist(severity, messageKey, fallback, payload) {
        const log = window.AppShellEventLog;
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity:   severity,
                category:   'UI',                                   // closed-set; PR-6 gate
                source:     'boundary-audit-panel',
                messageKey: messageKey,
                message:    fallback,
                payload:    (payload && typeof payload === 'object') ? payload : undefined,
            });
        } catch (_) { /* never throw */ }
    }

    function paintChecklist(obj) {
        const body  = document.getElementById('ba-checklist-body');
        const empty = document.getElementById('ba-checklist-empty');
        const clear = document.getElementById('ba-checklist-clear-btn');
        const copy  = document.getElementById('ba-checklist-copy-btn');
        if (!body || !empty) return;
        if (obj == null) {
            body.textContent = '';
            body.setAttribute('hidden', '');
            empty.removeAttribute('hidden');
            if (clear) clear.setAttribute('disabled', '');
            // PR-29: when no checklist exists, the Copy button is
            // disabled — nothing to copy. aria-disabled mirrors the
            // disabled attribute for assistive tech.
            if (copy) {
                copy.setAttribute('disabled', '');
                copy.setAttribute('aria-disabled', 'true');
            }
            return;
        }
        let json;
        try { json = JSON.stringify(obj, null, 2); } catch (_) { json = ''; }
        // textContent ONLY — never innerHTML.
        body.textContent = json;
        body.removeAttribute('hidden');
        empty.setAttribute('hidden', '');
        if (clear) clear.removeAttribute('disabled');
        // PR-29: enable Copy once a checklist exists.
        if (copy) {
            copy.removeAttribute('disabled');
            copy.setAttribute('aria-disabled', 'false');
        }
    }

    // ── PR-29: Copy checklist JSON to clipboard (clipboard-only) ─
    // Reads ONLY the visible <pre>.textContent. No fallback to
    // execCommand, no Blob, no anchor download, no file write,
    // no backend call. If clipboard is unavailable or denied,
    // log UI/WARNING and flash the transient chip. The Copy
    // button is enabled only when a checklist exists.
    // ── PR-30: closed-shape, primitive-only audit payload ────────
    // The Event Log row for copy success/failure carries ONLY:
    //   source, action, bytes|reason, checklistVisible,
    //   copySource, timestamp.
    // The payload deliberately omits the copied JSON, the checklist
    // object, any proposal/journal/export/scenario data, and any
    // free-text error message — only closed-set reason codes.
    const CHECKLIST_COPY_REASONS = Object.freeze({
        UNAVAILABLE:        'unavailable',
        PERMISSION_DENIED:  'permission-denied',
        EMPTY:              'empty',
        UNKNOWN:            'unknown',
    });

    function classifyClipboardFailure(err) {
        if (!err) return CHECKLIST_COPY_REASONS.UNKNOWN;
        const name = (err && err.name) ? String(err.name) : '';
        const msg  = String((err && err.message) || '').toLowerCase();
        if (name === 'NotAllowedError') return CHECKLIST_COPY_REASONS.PERMISSION_DENIED;
        if (/permission|not\s*allowed|denied|notallowed/.test(msg)) return CHECKLIST_COPY_REASONS.PERMISSION_DENIED;
        return CHECKLIST_COPY_REASONS.UNKNOWN;
    }

    function checklistVisibleNow() {
        const body = document.getElementById('ba-checklist-body');
        if (!body) return false;
        if (body.hasAttribute('hidden')) return false;
        return !!(body.textContent && body.textContent.length);
    }

    function buildChecklistCopyAuditPayload(status, extra) {
        extra = extra || {};
        const payload = {
            source:           'boundary-audit-panel',
            action:           (status === 'ok') ? 'safety-checklist-copy' : 'safety-checklist-copy-failed',
            checklistVisible: checklistVisibleNow(),
            copySource:       'visible-pre-textcontent',
            timestamp:        new Date(Date.now()).toISOString(),
        };
        if (status === 'ok') {
            // Closed-set primitive: numeric byte count of the
            // visible <pre>.textContent. NOT the text itself.
            payload.bytes = (typeof extra.bytes === 'number' && isFinite(extra.bytes) && extra.bytes >= 0)
                ? extra.bytes
                : 0;
        } else {
            // Closed-set reason enum only — never a free-text error
            // message that could leak DOM, network, or origin info.
            const allowed = ['unavailable', 'permission-denied', 'empty', 'unknown'];
            payload.reason = (allowed.indexOf(extra.reason) !== -1) ? extra.reason : 'unknown';
        }
        return payload;
    }

    // ── PR-31: Safety Checklist Copy Payload Inspector ──────────
    // Display-only mirror of the last PR-30 audit payload. Cached
    // in module memory; reload erases it. The paint helper uses a
    // FIXED ALLOWLIST of field names — anything outside that list
    // is never read or rendered, so future payload extensions
    // cannot accidentally leak into the inspector. textContent
    // only; no innerHTML, no template injection.
    //
    // PR-36: COPY_AUDIT_DISPLAY_FIELDS is the single source of
    // truth for BOTH the permitted field set AND the locked display
    // order. The sequence below matches the DOM row order in
    // app.html exactly. Any payload key absent from this list is
    // silently ignored — no arbitrary payload content can reach the
    // inspector DOM regardless of how the payload object is shaped.
    let lastCopyAuditPayload = null;
    const COPY_AUDIT_DISPLAY_FIELDS = Object.freeze([
        'source',           // originating module name
        'action',           // closed-set: safety-checklist-copy | safety-checklist-copy-failed
        'bytes',            // success only: character count of copied text
        'reason',           // failure only: closed-set failure reason enum
        'checklistVisible', // boolean: was the <pre> visible at copy time?
        'copySource',       // always "visible-pre-textcontent" in this build
        'timestamp',        // ISO-8601 string of the copy attempt
    ]);

    // ── PR-34: Age label helper (UI-only, memory-only) ───────────
    // Derives a localized time-ago string from the copy audit
    // payload timestamp. Reads ONLY the ISO string passed in.
    // Never reads Event Log, clipboard, proposal, journal, or
    // scenario data. Returns '' when the timestamp is unusable.
    function formatCopyAuditAge(timestampIso) {
        if (!timestampIso || typeof timestampIso !== 'string') return '';
        let ts;
        try { ts = Date.parse(timestampIso); } catch (_) { return ''; }
        if (!ts || isNaN(ts)) return '';
        const diffMin = Math.floor((Date.now() - ts) / 60000);
        if (diffMin < 1)  return t('ba-copy-audit-age-just-now') || 'just now';
        if (diffMin === 1) return t('ba-copy-audit-age-1-min')   || '1 min ago';
        if (diffMin === 2) return t('ba-copy-audit-age-2-min')   || '2 mins ago';
        return t('ba-copy-audit-age-n-min', diffMin) || (diffMin + ' mins ago');
    }

    // ── PR-130: Copy audit value display humanization ────────────
    // Maps closed-set raw payload strings to operator-readable
    // display text via i18n keys. The payload object is NEVER
    // modified — this helper operates on a local copy of the raw
    // string and is called only inside paintChecklistCopyAuditDetails.
    //
    // Unmapped values fall back to the raw string so future payload
    // extensions are displayed safely without a code change.
    //
    // Fields exempt from mapping (already operator-readable):
    //   bytes      — numeric character count
    //   timestamp  — ISO-8601 string; age label provides context
    function humanizeCopyAuditValue(field, outRaw) {
        switch (field) {
            case 'source':
                if (outRaw === 'boundary-audit-panel')
                    return t('ba-copy-audit-value-source-boundary') || 'Boundary audit panel';
                break;
            case 'action':
                if (outRaw === 'safety-checklist-copy')
                    return t('ba-copy-audit-value-action-copy') || 'Safety checklist copied';
                if (outRaw === 'safety-checklist-copy-failed')
                    return t('ba-copy-audit-value-action-copy-failed') || 'Safety checklist copy failed';
                break;
            case 'copySource':
                if (outRaw === 'visible-pre-textcontent')
                    return t('ba-copy-audit-value-copy-source-visible-pre') || 'Visible checklist preview text';
                break;
            case 'checklistVisible':
                if (outRaw === 'true')  return t('ba-copy-audit-value-true')  || 'Yes';
                if (outRaw === 'false') return t('ba-copy-audit-value-false') || 'No';
                break;
            case 'reason':
                if (outRaw === 'empty')
                    return t('ba-copy-audit-value-reason-empty') || 'Empty checklist';
                if (outRaw === 'permission-denied')
                    return t('ba-copy-audit-value-reason-permission-denied') || 'Clipboard permission denied';
                if (outRaw === 'unavailable')
                    return t('ba-copy-audit-value-reason-unavailable') || 'Clipboard unavailable';
                if (outRaw === 'unknown')
                    return t('ba-copy-audit-value-reason-unknown') || 'Unknown reason';
                break;
            default:
                break;
        }
        return outRaw; // unmapped — display raw, safe fallback
    }

    function paintChecklistCopyAuditDetails(payload) {
        const root = document.getElementById('ba-copy-audit');
        if (!root) return;
        // PR-33: last-action badge inside the inspector <summary>.
        const badge = document.getElementById('ba-copy-audit-status-badge');
        if (payload == null) {
            // Hidden + every row reset. Used only by reload path
            // (init paints null), never by Clear checklist per
            // PR-31 brief: latest details stay visible if they
            // already exist.
            root.setAttribute('hidden', '');
            // PR-36: reset rows in locked display order; unknown keys are absent.
            COPY_AUDIT_DISPLAY_FIELDS.forEach((f) => {
                const row = root.querySelector('.ba-copy-audit-row[data-field="' + f + '"]');
                if (!row) return;
                const val = row.querySelector('.ba-copy-audit-value');
                if (val) val.textContent = '—';
                if (f === 'bytes' || f === 'reason') row.setAttribute('hidden', '');
            });
            // PR-33: badge follows the inspector — hide on null payload.
            if (badge) {
                badge.setAttribute('hidden', '');
                badge.removeAttribute('data-state');
                badge.removeAttribute('data-i18n');
                badge.textContent = '';
            }
            // PR-34: hide age span and stop any running interval timer.
            const ageElNull = document.getElementById('ba-copy-audit-age');
            if (ageElNull) { ageElNull.setAttribute('hidden', ''); ageElNull.textContent = ''; }
            if (copyAuditAgeTimer) { clearInterval(copyAuditAgeTimer); copyAuditAgeTimer = null; }
            return;
        }
        // Reveal the <details> (still defaults to closed by browser
        // unless the user opened it; do NOT force [open], operator
        // choice).
        root.removeAttribute('hidden');

        // PR-36: walk COPY_AUDIT_DISPLAY_FIELDS in locked order —
        // the single source of truth for permitted fields and their
        // display sequence. Payload keys outside this list are
        // silently ignored; no arbitrary content reaches the DOM.
        const isSuccess = payload.action === 'safety-checklist-copy';
        COPY_AUDIT_DISPLAY_FIELDS.forEach((f) => {
            const row = root.querySelector('.ba-copy-audit-row[data-field="' + f + '"]');
            if (!row) return;
            const val = row.querySelector('.ba-copy-audit-value');
            // Mode-specific row visibility: success → bytes only,
            // failure → reason only.
            if (f === 'bytes') {
                if (isSuccess) row.removeAttribute('hidden'); else row.setAttribute('hidden', '');
            } else if (f === 'reason') {
                if (!isSuccess) row.removeAttribute('hidden'); else row.setAttribute('hidden', '');
            }
            if (!val) return;
            // Render via textContent ONLY. Coerce primitive types
            // to safe display strings; objects/functions are
            // refused (the allowlist already excludes nested
            // structures, but defense-in-depth).
            const raw = payload[f];
            let out;
            if (raw == null) {
                out = '—';
            } else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
                out = String(raw);
            } else {
                out = '—';
            }
            // PR-130: display-only humanization. The raw payload value is
            // preserved in lastCopyAuditPayload and is never modified here.
            // outRaw is the pre-mapping string; humanizeCopyAuditValue()
            // returns a localized display string for known closed-set values
            // and falls back to outRaw for bytes, timestamp, and any future
            // unmapped values. The raw value is written to val.title so
            // operators can inspect the technical enum via tooltip.
            const outRaw = out;
            out = (out === '—') ? out : humanizeCopyAuditValue(f, out);
            val.title = outRaw;
            val.textContent = out;
        });

        // PR-33: badge paint — derived ONLY from payload.action.
        // Closed set: 'safety-checklist-copy' → ok / Copy OK.
        //              'safety-checklist-copy-failed' → err / Copy failed.
        // Anything else (defensive) → hide the badge.
        if (badge) {
            if (isSuccess) {
                const key = 'ba-copy-audit-status-ok';
                badge.setAttribute('data-state', 'ok');
                badge.setAttribute('data-i18n',  key);
                badge.textContent = t(key) || 'Copy OK';
                badge.removeAttribute('hidden');
            } else if (payload.action === 'safety-checklist-copy-failed') {
                const key = 'ba-copy-audit-status-failed';
                badge.setAttribute('data-state', 'err');
                badge.setAttribute('data-i18n',  key);
                badge.textContent = t(key) || 'Copy failed';
                badge.removeAttribute('hidden');
            } else {
                // Defensive: payload.action outside the closed set.
                badge.setAttribute('hidden', '');
                badge.removeAttribute('data-state');
                badge.removeAttribute('data-i18n');
                badge.textContent = '';
            }
        }

        // PR-34: age label — derived only from payload.timestamp.
        // Starts (or restarts) a module-private setInterval so the
        // label refreshes while the inspector is open. The timer:
        //   - never writes storage
        //   - never emits Event Log rows
        //   - never touches clipboard, checklist, or scenario state
        // Cleared on paint null / Clear audit details / reload path.
        const ageEl = document.getElementById('ba-copy-audit-age');
        if (ageEl) {
            const ts = (payload && typeof payload.timestamp === 'string') ? payload.timestamp : null;
            if (ts) {
                ageEl.textContent = formatCopyAuditAge(ts);
                ageEl.removeAttribute('hidden');
                if (copyAuditAgeTimer) { clearInterval(copyAuditAgeTimer); copyAuditAgeTimer = null; }
                copyAuditAgeTimer = setInterval(function () {
                    try {
                        const el = document.getElementById('ba-copy-audit-age');
                        if (el && !el.hasAttribute('hidden')) el.textContent = formatCopyAuditAge(ts);
                    } catch (_) { /* never throw */ }
                }, 30000);
            } else {
                ageEl.setAttribute('hidden', '');
                ageEl.textContent = '';
            }
        }
    }

    // ── PR-32: Clear inspector display (UI-only, memory-only) ────
    // Resets the inspector to its pre-copy state without touching
    // ANY other module memory or DOM:
    //   - lastCopyAuditPayload → null
    //   - paintChecklistCopyAuditDetails(null) → hides <details>,
    //     reset every row to "—", re-hides bytes/reason rows.
    //
    // It does NOT touch:
    //   - lastChecklist (PR-28 cache) — checklist <pre> stays
    //   - the Safety Checklist Generate / Clear / Copy buttons
    //   - the Event Log history (no new row emitted)
    //   - clipboard, network, storage, scenario state
    //
    // The next successful copyChecklist() call will re-cache and
    // re-paint the inspector from scratch.
    function clearChecklistCopyAuditDetails() {
        lastCopyAuditPayload = null;
        // PR-34: stop the age-label interval before painting null so
        // the timer cannot fire between this call and the paint.
        if (copyAuditAgeTimer) { clearInterval(copyAuditAgeTimer); copyAuditAgeTimer = null; }
        try { paintChecklistCopyAuditDetails(null); } catch (_) { /* never throw */ }
    }

    function bindChecklistCopyAuditClearButton() {
        const btn = document.getElementById('ba-copy-audit-clear-btn');
        if (!btn) return;
        btn.addEventListener('click', (ev) => {
            // Prevent the click from bubbling to the <details>
            // <summary> toggler — operator clicks "clear", not "toggle".
            try { ev.stopPropagation(); } catch (_) {}
            try { clearChecklistCopyAuditDetails(); } catch (_) { /* never throw */ }
        });
    }

    let checklistCopyTimer  = null;
    // PR-34: module-private age-label timer. Cleared on paint null /
    // Clear audit details / reload. Never writes storage or emits rows.
    let copyAuditAgeTimer   = null;
    function flashChecklistCopyStatus(state, fallbackLabel, i18nKey) {
        const chip = document.getElementById('ba-checklist-copy-status');
        if (!chip) return;
        chip.setAttribute('data-state', state);
        chip.setAttribute('data-i18n',  i18nKey);
        const localized = t(i18nKey);
        chip.textContent = localized || fallbackLabel;
        chip.removeAttribute('hidden');
        if (checklistCopyTimer) { clearTimeout(checklistCopyTimer); checklistCopyTimer = null; }
        checklistCopyTimer = setTimeout(() => {
            try {
                chip.setAttribute('hidden', '');
                chip.textContent = '';
            } catch (_) { /* never throw */ }
            checklistCopyTimer = null;
        }, 1600);
    }

    function copyChecklist() {
        // Guard: no checklist yet → nothing to copy. Button is
        // disabled too; defensive early-return inside the function.
        if (!lastChecklist) return Promise.resolve(false);
        const body = document.getElementById('ba-checklist-body');
        // Read EXACT visible text from the <pre>. This is the only
        // string that ever reaches the clipboard. NOT re-serialized.
        const text = (body && body.textContent) || '';
        // PR-31: helper — build the payload ONCE, cache it for the
        // inspector mirror, then hand it to the Event Log row. The
        // cached copy is a deep clone so future code paths cannot
        // mutate what the inspector renders.
        const recordAudit = (status, extra) => {
            const payload = buildChecklistCopyAuditPayload(status, extra);
            try { lastCopyAuditPayload = JSON.parse(JSON.stringify(payload)); } catch (_) { lastCopyAuditPayload = payload; }
            try { paintChecklistCopyAuditDetails(lastCopyAuditPayload); } catch (_) { /* never throw */ }
            return payload;
        };

        if (!text) {
            // PR-30: closed-shape failure payload, reason="empty".
            logChecklist('WARNING', 'elog-evt-safety-checklist-copy-failed',
                         'Safety checklist preview copy failed',
                         recordAudit('fail', { reason: CHECKLIST_COPY_REASONS.EMPTY }));
            flashChecklistCopyStatus('err', 'Checklist copy failed', 'ba-checklist-copy-failed');
            return Promise.resolve(false);
        }
        const clip = (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
            ? navigator.clipboard
            : null;
        if (!clip) {
            // PR-30: closed-shape failure payload, reason="unavailable".
            logChecklist('WARNING', 'elog-evt-safety-checklist-copy-failed',
                         'Safety checklist preview copy failed',
                         recordAudit('fail', { reason: CHECKLIST_COPY_REASONS.UNAVAILABLE }));
            flashChecklistCopyStatus('err', 'Checklist copy failed', 'ba-checklist-copy-failed');
            return Promise.resolve(false);
        }
        // Hand off the EXACT visible string — no regeneration, no
        // re-stringification of the cached object, no inclusion of
        // hidden state. The clipboard receives EXACTLY what the
        // operator can already see in the <pre>.
        return clip.writeText(text).then(() => {
            // PR-30: closed-shape success payload — primitive byte
            // count only; the copied JSON does NOT appear in the
            // Event Log row.
            logChecklist('NOTICE', 'elog-evt-safety-checklist-copied',
                         'Safety checklist preview copied',
                         recordAudit('ok', { bytes: text.length }));
            flashChecklistCopyStatus('ok', 'Checklist copied', 'ba-checklist-copied');
            return true;
        }, (err) => {
            // PR-30: classify the rejection into the closed set.
            // Never echo the raw err.message — only a closed enum.
            const reason = classifyClipboardFailure(err);
            logChecklist('WARNING', 'elog-evt-safety-checklist-copy-failed',
                         'Safety checklist preview copy failed',
                         recordAudit('fail', { reason: reason }));
            flashChecklistCopyStatus('err', 'Checklist copy failed', 'ba-checklist-copy-failed');
            return false;
        });
    }

    function generateChecklist() {
        let obj;
        try { obj = buildChecklistObject(); }
        catch (e) {
            logChecklist('WARNING', 'elog-evt-safety-checklist-failed',
                         'Safety checklist preview failed',
                         { reason: (e && e.message) ? String(e.message).slice(0, 120) : 'unknown' });
            return null;
        }
        lastChecklist = obj;
        paintChecklist(obj);
        logChecklist('NOTICE', 'elog-evt-safety-checklist-generated',
                     'Safety checklist preview generated',
                     {
                         regression:     obj.tests.regression,
                         selfTest:       obj.tests.selfTest,
                         violationTests: obj.tests.violationTests,
                         // payload carries summary stats only — no
                         // proposal body, no journal entry payload.
                     });
        // Defensive copy — caller cannot mutate our cache.
        try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return null; }
    }

    function clearChecklist() {
        lastChecklist = null;
        paintChecklist(null);
        logChecklist('NOTICE', 'elog-evt-safety-checklist-cleared',
                     'Safety checklist preview cleared');
    }

    function getChecklistState() {
        // Defensive copy — caller cannot mutate our cache.
        if (!lastChecklist) return null;
        try { return JSON.parse(JSON.stringify(lastChecklist)); }
        catch (_) { return null; }
    }

    function bindChecklistButtons() {
        const gen = document.getElementById('ba-checklist-gen-btn');
        const clr = document.getElementById('ba-checklist-clear-btn');
        const cpy = document.getElementById('ba-checklist-copy-btn');
        if (gen) gen.addEventListener('click', () => {
            try { generateChecklist(); } catch (_) { /* never throw */ }
        });
        if (clr) clr.addEventListener('click', () => {
            try { clearChecklist(); } catch (_) { /* never throw */ }
        });
        if (cpy) cpy.addEventListener('click', () => {
            try { copyChecklist(); } catch (_) { /* never throw */ }
        });
    }

    // ── Event subscriptions (paint reactively) ───────────────────
    // We listen ONLY to the existing UI events the surfaces already
    // dispatch. We never dispatch a state-changing event ourselves.
    function subscribe() {
        document.addEventListener('rmooz:ai-proposal-bridge-state',           render);
        document.addEventListener('rmooz:ai-proposal-decision-journal-changed', render);
        document.addEventListener('rmooz:download-guard-state-changed',       render);
    }

    // ── Initial paint + i18n re-paint on language switch ─────────
    function init() {
        subscribe();
        render();
        logOnceRendered();
        // PR-23: wire the self-test button and paint the empty
        // "Not run" summary so the UI is consistent on load.
        bindSelfTestButton();
        paintSelfTest(null);
        // PR-24: wire the violation-test button + initial empty
        // "Not run" paint.
        bindViolationTestButton();
        paintViolationTests(null);
        // PR-25: initial paint of the regression summary. Reads
        // lastSelfTest/lastViolationTests (both null on load) so
        // the card renders as "Not run / Attention required".
        try { renderRegressionSummary(); } catch (_) {}
        // PR-28: wire the checklist Generate / Clear buttons and
        // paint the empty state. NEVER auto-generates on load.
        bindChecklistButtons();
        paintChecklist(null);
        // PR-31: paint the copy-audit inspector empty on load.
        // The <details> stays hidden until the first copy attempt.
        try { paintChecklistCopyAuditDetails(null); } catch (_) {}
        // PR-32: wire the inspector's Clear audit details button.
        try { bindChecklistCopyAuditClearButton(); } catch (_) {}
        // Re-paint on EN <-> AR switch so localized status chips
        // refresh in place (textContent only).
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { render(); } catch (_) {}
            // Re-paint the self-test row with the last result (if any)
            // so PASS/FAIL/reason translations switch languages too.
            try { paintSelfTest(lastSelfTest); } catch (_) {}
            try { paintViolationTests(lastViolationTests); } catch (_) {}
            try { renderRegressionSummary(); } catch (_) {}
            // PR-31: re-paint the copy-audit inspector if a payload
            // exists so the row LABELS pick up the new language.
            // The cached payload itself doesn't change.
            try { if (lastCopyAuditPayload) paintChecklistCopyAuditDetails(lastCopyAuditPayload); } catch (_) {}
            if (typeof prev === 'function') { try { prev(lang); } catch (_) {} }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        // Defer one microtask so all preceding bridges are published.
        Promise.resolve().then(init);
    }

    window.AppShellBoundaryAuditPanel = {
        render,
        getRowsSnapshot,
        // PR-23: read-only self-test. Returns a defensive copy of
        // the result and paints the UI. NEVER mutates any audited
        // module's state; uses only getState / isAllowed /
        // validateJournalEntry / validateExportPackage / Object.keys.
        runSelfTest,
        getSelfTestState,
        CHECK_KEYS,
        FORBIDDEN_METHODS,
        AUDITED_BRIDGES,
        // PR-24: read-only violation test harness. Runs ten
        // synthetic violations and confirms each is rejected by
        // the existing contracts / guards. Synthetic payloads are
        // local objects, never persisted. The PR-21 short-circuit
        // path is exercised with internal spies that count Blob /
        // createObjectURL / anchor.click invocations during the
        // call (must remain 0).
        runViolationTests,
        getViolationTestState,
        VIOLATION_KEYS,
        // PR-25: read-only safety regression summary. Returns a
        // defensive copy of the current overall state derived from
        // the latest PR-23 + PR-24 results. NEVER triggers a test.
        getRegressionSummary,
        renderRegressionSummary,
        // PR-28: read-only safety checklist preview. Builds a
        // short summary object from the existing read-only entry
        // points and renders it via textContent only. NEVER writes
        // files, NEVER downloads, NEVER persists. Operator must
        // click Generate; no auto-run on page load.
        generateChecklist,
        clearChecklist,
        getChecklistState,
        // PR-29: clipboard-only copy of the visible checklist
        // preview. Reads ONLY <pre>.textContent and hands it to
        // navigator.clipboard.writeText. No execCommand fallback,
        // no Blob, no anchor download, no file write, no backend
        // call. Returns Promise<boolean>.
        copyChecklist,
        ROW_KEYS,
        STATUS_KEYS,
        TONES,
        // Deliberately omitted: setEnabled, setLocked, connect,
        //                       enableReal, triggerDownload,
        //                       executeDownload, save, export.
        // This module is a mirror — operators change boundaries
        // at their actual source, never through this panel.
    };
})();
