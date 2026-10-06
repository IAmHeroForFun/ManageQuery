/**
 * Real-Time Status Polling Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    if (!window.JOB_ID) return;

    const map = initLeafletMap('dashboard-map', [28.25, 85.35], 11);
    window.dashboardMap = map;

    // Display AOI bounding boundary initially
    if (window.JOB_AOI) {
        L.geoJSON(window.JOB_AOI, {
            style: {
                color: '#3b82f6',
                weight: 1.5,
                dashArray: '4, 4',
                fillOpacity: 0.05
            }
        }).addTo(map);
    }

    const progressBar = document.getElementById('progress-bar-fill');
    const stepText = document.getElementById('current-step-text');
    const statusBadge = document.getElementById('job-status-badge');

    const statFloodArea = document.getElementById('stat-flood-area');
    const statBuildings = document.getElementById('stat-buildings');
    const statRoads = document.getElementById('stat-roads');
    const statCutoff = document.getElementById('stat-cutoff');

    let isCompleted = window.JOB_STATUS === 'completed';

    async function pollJobStatus() {
        try {
            const resp = await fetch(`/api/analysis/${window.JOB_ID}/`);
            if (!resp.ok) return;

            const data = await resp.json();

            // Update Progress Bar
            if (progressBar) progressBar.style.width = `${data.progress}%`;
            if (stepText) stepText.textContent = data.current_step;

            if (statusBadge) {
                statusBadge.textContent = data.status.toUpperCase();
                statusBadge.className = `job-status badge-${data.status}`;
            }

            // Update Stats
            if (data.flood_area_km2 !== null && statFloodArea) {
                statFloodArea.textContent = data.flood_area_km2.toFixed(1);
            }
            if (data.buildings_affected !== null && statBuildings) {
                statBuildings.textContent = data.buildings_affected;
            }
            if (data.roads_damaged_km !== null && statRoads) {
                statRoads.textContent = data.roads_damaged_km.toFixed(1);
            }
            if (data.settlements_cutoff !== null && statCutoff) {
                statCutoff.textContent = data.settlements_cutoff;
            }

            if (data.status === 'completed' && !isCompleted) {
                isCompleted = true;
                clearInterval(pollInterval);
                await loadAllDashboardLayers(map, window.JOB_ID);
            } else if (data.status === 'failed') {
                clearInterval(pollInterval);
                if (stepText) {
                    stepText.textContent = "Error: " + (data.error_message || "Processing failed.");
                    stepText.style.color = "#ef4444";
                }
            }
        } catch (e) {
            console.warn("Polling error:", e);
        }
    }

    // Initial load
    if (isCompleted) {
        loadAllDashboardLayers(map, window.JOB_ID);
    } else {
        var pollInterval = setInterval(pollJobStatus, 2500);
        pollJobStatus();
    }
});
