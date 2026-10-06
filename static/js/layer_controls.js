/**
 * Layer Visibility Toggle Handlers
 */
document.addEventListener('DOMContentLoaded', () => {
    function setupToggle(checkboxId, layerKey) {
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;

        checkbox.addEventListener('change', () => {
            const layer = MapLayers[layerKey];
            if (!layer || !window.dashboardMap) return;

            if (checkbox.checked) {
                if (!window.dashboardMap.hasLayer(layer)) {
                    window.dashboardMap.addLayer(layer);
                }
            } else {
                if (window.dashboardMap.hasLayer(layer)) {
                    window.dashboardMap.removeLayer(layer);
                }
            }
        });
    }

    setupToggle('toggle-flood', 'flood');
    setupToggle('toggle-roads', 'roads');
    setupToggle('toggle-buildings', 'buildings');
    setupToggle('toggle-cutoff', 'cutoff');
    setupToggle('toggle-path', 'path');
});
