/**
 * Custom prompt + confirm dialogs (Electron's window.prompt/confirm returns null silently)
 * plus a tiny toast helper used to surface previously silent failures.
 *
 * Exposes:
 *   window.customPrompt(message, defaultValue)            → Promise<string|null>
 *   window.customConfirm(message, opts?)                  → Promise<boolean>
 *     opts: { okText, cancelText, danger: true|false, detail: string }
 *   window.rmoozToast(message, kind?, opts?)              → void
 *     kind: 'info' (default) | 'success' | 'warn' | 'error'
 *     opts: { durationMs?: number }
 */
(function () {
  // Inject styles once
  const style = document.createElement('style');
  style.textContent = `
    .custom-prompt-overlay {
      position: fixed; inset: 0; z-index: 100000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.55);
    }
    .custom-prompt-box {
      background: var(--panel-bg, #0f172a);
      border: 1px solid var(--border, #334155);
      border-radius: 8px;
      padding: 20px 24px;
      min-width: 320px; max-width: 480px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      font-family: inherit;
      color: var(--text, #e2e8f0);
    }
    .custom-prompt-title {
      margin: 0 0 12px 0;
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--text, #e2e8f0);
      white-space: pre-wrap;
    }
    .custom-prompt-detail {
      margin: -4px 0 12px 0;
      font-size: 0.85rem;
      opacity: 0.75;
      white-space: pre-wrap;
    }
    .custom-prompt-input {
      width: 100%; box-sizing: border-box;
      padding: 8px 10px;
      font-size: 0.9rem;
      border: 1px solid var(--border, #334155);
      border-radius: 4px;
      background: var(--bg-color, #020617);
      color: var(--text, #e2e8f0);
      outline: none;
    }
    .custom-prompt-input:focus {
      border-color: var(--accent, #22c55e);
    }
    .custom-prompt-buttons {
      display: flex; justify-content: flex-end; gap: 8px;
      margin-top: 16px;
    }
    .custom-prompt-btn {
      padding: 6px 16px; font-size: 0.85rem;
      border-radius: 4px; cursor: pointer;
      border: 1px solid var(--border, #334155);
      background: var(--panel-bg, #0f172a);
      color: var(--text, #e2e8f0);
    }
    .custom-prompt-btn:hover {
      background: var(--bg-color, #020617);
    }
    .custom-prompt-btn:focus-visible {
      outline: 2px solid var(--accent, #22c55e);
      outline-offset: 1px;
    }
    .custom-prompt-btn-ok {
      background: var(--accent, #22c55e);
      color: #fff; border-color: var(--accent, #22c55e);
    }
    .custom-prompt-btn-ok:hover {
      background: var(--accent-hover, #4ade80);
      border-color: var(--accent-hover, #4ade80);
    }
    .custom-prompt-btn-danger {
      background: #dc2626;
      color: #fff; border-color: #dc2626;
    }
    .custom-prompt-btn-danger:hover {
      background: #ef4444;
      border-color: #ef4444;
    }
  `;
  document.head.appendChild(style);

  // ── Toast helper ──────────────────────────────────────────────────
  // Lightweight non-blocking notification. Stacks toasts in a fixed-position
  // container; auto-dismisses after durationMs (default 4000). The toast
  // shows the message and a small × button so users can dismiss early.
  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    .rmooz-toast-stack {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      z-index: 100002;
      display: flex; flex-direction: column; gap: 8px;
      pointer-events: none;
      max-width: 90vw;
    }
    .rmooz-toast {
      pointer-events: auto;
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; min-width: 220px; max-width: 520px;
      border-radius: 6px;
      font: 13px/1.4 system-ui, -apple-system, sans-serif;
      color: #fff; background: #475569;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35);
      opacity: 0; transform: translateY(-6px);
      transition: opacity 160ms ease-out, transform 160ms ease-out;
    }
    .rmooz-toast.visible { opacity: 1; transform: translateY(0); }
    .rmooz-toast--success { background: #16a34a; }
    .rmooz-toast--warn    { background: #d97706; }
    .rmooz-toast--error   { background: #dc2626; }
    .rmooz-toast--info    { background: #0ea5e9; }
    .rmooz-toast-msg  { flex: 1; white-space: pre-wrap; }
    .rmooz-toast-close {
      background: transparent; border: none; color: rgba(255,255,255,0.85);
      cursor: pointer; font-size: 16px; line-height: 1; padding: 0 4px;
    }
    .rmooz-toast-close:hover { color: #fff; }
  `;
  document.head.appendChild(toastStyle);

  function ensureToastStack() {
    let stack = document.getElementById('rmooz-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'rmooz-toast-stack';
      stack.className = 'rmooz-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.setAttribute('aria-atomic', 'true');
      document.body.appendChild(stack);
    }
    return stack;
  }

  window.rmoozToast = function (message, kind, opts) {
    if (!message) return;
    const stack = ensureToastStack();
    const k = (kind === 'success' || kind === 'warn' || kind === 'error' || kind === 'info') ? kind : 'info';
    const dur = (opts && Number.isFinite(opts.durationMs)) ? opts.durationMs : 4000;
    const el = document.createElement('div');
    el.className = 'rmooz-toast rmooz-toast--' + k;
    el.setAttribute('role', k === 'error' || k === 'warn' ? 'alert' : 'status');
    const msg = document.createElement('span');
    msg.className = 'rmooz-toast-msg';
    msg.textContent = String(message);
    const closer = document.createElement('button');
    closer.type = 'button';
    closer.className = 'rmooz-toast-close';
    closer.setAttribute('aria-label', 'Dismiss');
    closer.textContent = '×';
    el.appendChild(msg);
    el.appendChild(closer);
    stack.appendChild(el);
    // Trigger transition on next frame
    requestAnimationFrame(() => el.classList.add('visible'));
    let timer;
    function dismiss() {
      if (!el.parentNode) return;
      el.classList.remove('visible');
      clearTimeout(timer);
      setTimeout(() => { try { el.remove(); } catch (_) {} }, 200);
    }
    closer.addEventListener('click', dismiss);
    if (dur > 0) timer = setTimeout(dismiss, dur);
  };

  // Look up an i18n key if available, otherwise use the provided fallback.
  function tr(key, fallback) {
    try {
      if (typeof window.t === 'function') {
        const v = window.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) { /* ignore */ }
    return fallback;
  }

  function makeOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'custom-prompt-overlay';
    const box = document.createElement('div');
    box.className = 'custom-prompt-box';
    overlay.appendChild(box);
    return { overlay, box };
  }

  /**
   * @param {string} message  - Prompt message/title
   * @param {string} [defaultValue=''] - Pre-filled input value
   * @returns {Promise<string|null>} Resolved with input value or null on cancel
   */
  window.customPrompt = function (message, defaultValue) {
    return new Promise((resolve) => {
      const { overlay, box } = makeOverlay();

      const title = document.createElement('div');
      title.className = 'custom-prompt-title';
      title.textContent = message || '';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'custom-prompt-input';
      input.value = defaultValue || '';

      const buttons = document.createElement('div');
      buttons.className = 'custom-prompt-buttons';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'custom-prompt-btn';
      cancelBtn.textContent = tr('dialog-cancel', 'Cancel');

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'custom-prompt-btn custom-prompt-btn-ok';
      okBtn.textContent = tr('dialog-ok', 'OK');

      buttons.appendChild(cancelBtn);
      buttons.appendChild(okBtn);
      box.appendChild(title);
      box.appendChild(input);
      box.appendChild(buttons);
      document.body.appendChild(overlay);

      let done = false;
      function cleanup(value) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onDocKey, true);
        try { document.body.removeChild(overlay); } catch (_) {}
        resolve(value);
      }
      function onDocKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
      }

      okBtn.addEventListener('click', () => cleanup(input.value));
      cancelBtn.addEventListener('click', () => cleanup(null));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
      });
      document.addEventListener('keydown', onDocKey, true);

      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  };

  /**
   * Styled confirm dialog. Resolves true if user confirms, false if cancels.
   * @param {string} message
   * @param {{ okText?: string, cancelText?: string, danger?: boolean, detail?: string }} [opts]
   * @returns {Promise<boolean>}
   */
  window.customConfirm = function (message, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const { overlay, box } = makeOverlay();

      const title = document.createElement('div');
      title.className = 'custom-prompt-title';
      title.textContent = message || '';
      box.appendChild(title);

      if (o.detail) {
        const detail = document.createElement('div');
        detail.className = 'custom-prompt-detail';
        detail.textContent = String(o.detail);
        box.appendChild(detail);
      }

      const buttons = document.createElement('div');
      buttons.className = 'custom-prompt-buttons';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'custom-prompt-btn';
      cancelBtn.textContent = o.cancelText || tr('dialog-cancel', 'Cancel');

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'custom-prompt-btn ' + (o.danger ? 'custom-prompt-btn-danger' : 'custom-prompt-btn-ok');
      okBtn.textContent = o.okText || tr('dialog-ok', 'OK');

      buttons.appendChild(cancelBtn);
      buttons.appendChild(okBtn);
      box.appendChild(buttons);
      document.body.appendChild(overlay);

      let done = false;
      function cleanup(val) {
        if (done) return; done = true;
        document.removeEventListener('keydown', onDocKey, true);
        try { document.body.removeChild(overlay); } catch (_) {}
        resolve(val);
      }
      function onDocKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
        if (e.key === 'Enter')  { e.preventDefault(); cleanup(true); }
      }

      okBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
      document.addEventListener('keydown', onDocKey, true);

      requestAnimationFrame(() => {
        // Focus the confirm button so Enter goes through it and screen readers announce it.
        try { okBtn.focus(); } catch (_) {}
      });
    });
  };
})();
