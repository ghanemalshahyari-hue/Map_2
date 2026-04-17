/**
 * Custom prompt dialog for Electron (window.prompt() returns null silently).
 * Exposes window.customPrompt(message, defaultValue) → Promise<string|null>
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
    .custom-prompt-btn-ok {
      background: var(--accent, #22c55e);
      color: #fff; border-color: var(--accent, #22c55e);
    }
    .custom-prompt-btn-ok:hover {
      background: var(--accent-hover, #4ade80);
      border-color: var(--accent-hover, #4ade80);
    }
  `;
  document.head.appendChild(style);

  /**
   * @param {string} message  - Prompt message/title
   * @param {string} [defaultValue=''] - Pre-filled input value
   * @returns {Promise<string|null>} Resolved with input value or null on cancel
   */
  window.customPrompt = function (message, defaultValue) {
    return new Promise((resolve) => {
      // Build DOM
      const overlay = document.createElement('div');
      overlay.className = 'custom-prompt-overlay';

      const box = document.createElement('div');
      box.className = 'custom-prompt-box';

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
      cancelBtn.textContent = 'Cancel';

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'custom-prompt-btn custom-prompt-btn-ok';
      okBtn.textContent = 'OK';

      buttons.appendChild(cancelBtn);
      buttons.appendChild(okBtn);
      box.appendChild(title);
      box.appendChild(input);
      box.appendChild(buttons);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function cleanup(value) {
        document.body.removeChild(overlay);
        resolve(value);
      }

      okBtn.addEventListener('click', () => cleanup(input.value));
      cancelBtn.addEventListener('click', () => cleanup(null));

      // Click outside box = cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(null);
      });

      // Keyboard: Enter = OK, Escape = Cancel
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
        if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
      });

      // Focus the input after a frame (avoids Chromium focus-race)
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  };
})();
