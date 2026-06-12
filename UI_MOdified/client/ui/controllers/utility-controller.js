/**
 * utility-controller.js — Toggle open/close for the utility (settings) panel.
 *
 * The utility panel is an <aside> that slides out over the map.
 * Opened by the header settings button, closed by its own close button
 * or by clicking outside.
 */

const utilityPanel   = document.getElementById('utility-panel');
const settingsBtn    = document.getElementById('settings-toggle-btn');
const closeBtn       = document.getElementById('utility-panel-close');

function isOpen() {
    return utilityPanel && !utilityPanel.classList.contains('hidden');
}

function open() {
    if (!utilityPanel) return;
    utilityPanel.classList.remove('hidden');
    utilityPanel.setAttribute('aria-hidden', 'false');
}

function close() {
    if (!utilityPanel) return;
    utilityPanel.classList.add('hidden');
    utilityPanel.setAttribute('aria-hidden', 'true');
}

function toggle() {
    isOpen() ? close() : open();
}

export function bindUtilityPanelEvents() {
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', close);
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!isOpen()) return;
        if (utilityPanel.contains(e.target)) return;
        if (settingsBtn && settingsBtn.contains(e.target)) return;
        close();
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) {
            close();
        }
    });
}
