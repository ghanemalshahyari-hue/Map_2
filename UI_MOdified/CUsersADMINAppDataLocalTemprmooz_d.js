/**
 * Custom prompt + confirm dialogs (Electron's window.prompt/confirm returns null silently).
 * Exposes:
 *   window.customPrompt(message, defaultValue)            → Promise<string|null>
 *   window.customConfirm(message, opts?)                  → Promise<boolean>
 *     opts: { okText, cancelText, danger: true|false, detail: string }
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
