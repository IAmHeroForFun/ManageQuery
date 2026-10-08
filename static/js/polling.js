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
            // Update Stats & Tactical Mission Brief
            const missionBriefEl = document.getElementById('mission-brief-text');
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

            if (missionBriefEl) {
                if (data.status === 'completed') {
                    const cutoffCount = data.settlements_cutoff || 0;
                    const roadsKm = (data.roads_damaged_km || 0).toFixed(1);
                    const floodArea = (data.flood_area_km2 || 0).toFixed(1);
                    if (cutoffCount > 0) {
                        missionBriefEl.innerHTML = `⚠️ <strong style="color:#ef4444;">HIGH PRIORITY:</strong> <strong>${cutoffCount} settlements</strong> completely isolated from emergency medical care. <strong>${roadsKm} km</strong> of road infrastructure severed by <strong>${floodArea} km²</strong> inundation corridor.`;
                    } else {
                        missionBriefEl.innerHTML = `✅ <strong style="color:#10b981;">ALL SETTLEMENTS CONNECTED:</strong> Minor localized ponding (${floodArea} km²). Emergency vehicle access intact across valley corridors.`;
                    }
                } else if (data.status === 'failed') {
                    missionBriefEl.innerHTML = `❌ <strong style="color:#ef4444;">Pipeline Error:</strong> Satellite processing halted: ${data.error_message || 'Check logs'}`;
                } else {
                    missionBriefEl.innerHTML = `⏳ <strong>ANALYZING:</strong> ${data.current_step || 'Processing satellite SAR/optical imagery...'}`;
                }
            }

            if (data.status === 'completed' && !isCompleted) {
                isCompleted = true;
                clearInterval(pollInterval);
                await loadAllDashboardLayers(map, window.JOB_ID);
                autoFetchSituationReport(window.JOB_ID);
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

    // Auto-generate & fetch situation report for in-dashboard briefing
    let cachedReport = null;
    async function autoFetchSituationReport(jobId) {
        const reportContentEl = document.getElementById('embedded-report-content');
        if (!reportContentEl) return;

        try {
            reportContentEl.textContent = "Synthesizing official disaster situation report (grounded in verified satellite metrics)...";
            let resp = await fetch(`/api/analysis/${jobId}/report/`);
            let data = await resp.json();

            // If not yet generated, trigger generation immediately
            if (!data.report_english) {
                resp = await fetch(`/api/analysis/${jobId}/report/`, { method: 'POST' });
                data = await resp.json();
            }

            cachedReport = data;
            renderMiniReport('english');
        } catch (e) {
            console.warn("Could not auto-generate report:", e);
            if (reportContentEl) {
                reportContentEl.textContent = "Situation report ready in main tab. Click 'Open Rescuer Copilot Q&A' below.";
            }
        }
    }

    function renderMiniReport(lang) {
        const reportContentEl = document.getElementById('embedded-report-content');
        if (!reportContentEl || !cachedReport) return;
        if (lang === 'nepali' && cachedReport.report_nepali) {
            reportContentEl.textContent = cachedReport.report_nepali;
        } else {
            reportContentEl.textContent = cachedReport.report_english || "Report generated.";
        }
    }

    const tabEn = document.getElementById('tab-lang-en');
    const tabNe = document.getElementById('tab-lang-ne');
    if (tabEn && tabNe) {
        tabEn.addEventListener('click', () => {
            tabEn.classList.add('active');
            tabNe.classList.remove('active');
            renderMiniReport('english');
        });
        tabNe.addEventListener('click', () => {
            tabNe.classList.add('active');
            tabEn.classList.remove('active');
            renderMiniReport('nepali');
        });
    }

    // Initial load
    if (isCompleted) {
        loadAllDashboardLayers(map, window.JOB_ID);
        autoFetchSituationReport(window.JOB_ID);
        pollJobStatus(); // Update banner immediately
    } else {
        var pollInterval = setInterval(pollJobStatus, 2500);
        pollJobStatus();
    }
});
