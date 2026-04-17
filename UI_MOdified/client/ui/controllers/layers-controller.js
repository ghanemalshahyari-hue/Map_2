/**
 * layers-controller.js — Search filtering for the layers panel.
 *
 * Watches #layers-search-input and hides layer-row / folder-group
 * elements whose name doesn't match the query. Uses a simple
 * case-insensitive substring match on .layer-name and .folder-name.
 */

const searchInput = document.getElementById('layers-search-input');
const layersList  = document.getElementById('layers-list');

function filterLayers(query) {
    if (!layersList) return;
    const q = (query || '').toLowerCase().trim();

    // Filter individual layer rows (top-level, outside folders)
    layersList.querySelectorAll(':scope > .layer-row').forEach(row => {
        const name = row.querySelector('.layer-name');
        const text = name ? name.textContent.toLowerCase() : '';
        row.style.display = (!q || text.includes(q)) ? '' : 'none';
    });

    // Filter folder groups
    layersList.querySelectorAll(':scope > .folder-group').forEach(folder => {
        const folderName = folder.querySelector('.folder-name');
        const folderText = folderName ? folderName.textContent.toLowerCase() : '';
        const folderMatch = !q || folderText.includes(q);

        // Check child layers inside the folder
        let anyChildVisible = false;
        folder.querySelectorAll('.layer-row').forEach(row => {
            const name = row.querySelector('.layer-name');
            const text = name ? name.textContent.toLowerCase() : '';
            const match = !q || text.includes(q);
            row.style.display = match ? '' : 'none';
            if (match) anyChildVisible = true;
        });

        // Show folder if its name matches or any child matches
        folder.style.display = (folderMatch || anyChildVisible) ? '' : 'none';
    });
}

export function bindLayersPanelEvents() {
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
        filterLayers(searchInput.value);
    });
}

export function clearLayersSearch() {
    if (searchInput) {
        searchInput.value = '';
        filterLayers('');
    }
}
