/**
 * AOI Selector and Form Submission Handler with Bidirectional Coordinate Sync
 */
document.addEventListener('DOMContentLoaded', () => {
    const map = initLeafletMap('map', [28.25, 85.35], 10);
    const drawnItems = new L.FeatureGroup().addTo(map);

    let currentAoiPolygon = null;
    let sourceMarker = null;

    // Coordinate inputs
    const inputMinLon = document.getElementById('aoi-min-lon');
    const inputMinLat = document.getElementById('aoi-min-lat');
    const inputMaxLon = document.getElementById('aoi-max-lon');
    const inputMaxLat = document.getElementById('aoi-max-lat');

    const inputSourceLon = document.getElementById('source-lon');
    const inputSourceLat = document.getElementById('source-lat');

    // Default Trishuli AOI Coordinates
    const TRISHULI_PRESET = {
        minLon: 85.1500,
        minLat: 27.9500,
        maxLon: 85.5500,
        maxLat: 28.4500,
        sourceLon: 85.4500,
        sourceLat: 28.3600
    };

    function createBboxPolygon(minLon, minLat, maxLon, maxLat) {
        return {
            type: "Polygon",
            coordinates: [
                [
                    [minLon, minLat],
                    [maxLon, minLat],
                    [maxLon, maxLat],
                    [minLon, maxLat],
                    [minLon, minLat]
                ]
            ]
        };
    }

    function renderAoiOnMap(geojsonPolygon, fit = true) {
        drawnItems.clearLayers();
        currentAoiPolygon = geojsonPolygon;
        const layer = L.geoJSON(geojsonPolygon, {
            style: {
                color: "#0284c7",
                weight: 2.5,
                fillColor: "#38bdf8",
                fillOpacity: 0.22
            }
        }).addTo(drawnItems);

        if (fit) {
            map.fitBounds(layer.getBounds(), { padding: [25, 25] });
        }
        const statusEl = document.getElementById('aoi-status-text');
        if (statusEl) statusEl.textContent = "AOI configured and validated.";
    }

    function syncInputsFromPolygon(coords) {
        if (!coords || coords.length < 3) return;
        const lons = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);

        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        if (inputMinLon) inputMinLon.value = minLon.toFixed(4);
        if (inputMinLat) inputMinLat.value = minLat.toFixed(4);
        if (inputMaxLon) inputMaxLon.value = maxLon.toFixed(4);
        if (inputMaxLat) inputMaxLat.value = maxLat.toFixed(4);
    }

    function syncPolygonFromInputs() {
        const minLon = parseFloat(inputMinLon.value);
        const minLat = parseFloat(inputMinLat.value);
        const maxLon = parseFloat(inputMaxLon.value);
        const maxLat = parseFloat(inputMaxLat.value);

        if (isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat)) return;
        if (minLon >= maxLon || minLat >= maxLat) return;

        const poly = createBboxPolygon(minLon, minLat, maxLon, maxLat);
        renderAoiOnMap(poly, true);
    }

    // Bind input listeners for manual AOI typing
    [inputMinLon, inputMinLat, inputMaxLon, inputMaxLat].forEach(input => {
        if (input) {
            input.addEventListener('input', syncPolygonFromInputs);
            input.addEventListener('change', syncPolygonFromInputs);
        }
    });

    // Setup Leaflet Draw Control
    const drawControl = new L.Control.Draw({
        draw: {
            polygon: false,
            polyline: false,
            circle: false,
            circlemarker: false,
            marker: false,
            rectangle: {
                shapeOptions: {
                    color: '#0284c7',
                    weight: 2.5,
                    fillColor: '#38bdf8',
                    fillOpacity: 0.22
                }
            }
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (event) => {
        drawnItems.clearLayers();
        const layer = event.layer;
        drawnItems.addLayer(layer);
        currentAoiPolygon = layer.toGeoJSON().geometry;

        const ring = currentAoiPolygon.coordinates[0];
        syncInputsFromPolygon(ring);

        const statusEl = document.getElementById('aoi-status-text');
        if (statusEl) statusEl.textContent = "Custom Area of Interest drawn on map.";
    });

    // Preset button
    const btnPreset = document.getElementById('btn-load-trishuli');
    if (btnPreset) {
        btnPreset.addEventListener('click', () => {
            if (inputMinLon) inputMinLon.value = TRISHULI_PRESET.minLon.toFixed(4);
            if (inputMinLat) inputMinLat.value = TRISHULI_PRESET.minLat.toFixed(4);
            if (inputMaxLon) inputMaxLon.value = TRISHULI_PRESET.maxLon.toFixed(4);
            if (inputMaxLat) inputMaxLat.value = TRISHULI_PRESET.maxLat.toFixed(4);

            if (inputSourceLon) inputSourceLon.value = TRISHULI_PRESET.sourceLon.toFixed(4);
            if (inputSourceLat) inputSourceLat.value = TRISHULI_PRESET.sourceLat.toFixed(4);

            syncPolygonFromInputs();
            setSourceMarker(TRISHULI_PRESET.sourceLon, TRISHULI_PRESET.sourceLat);
        });
    }

    // Source Point Marker & Sync
    function setSourceMarker(lon, lat, pan = false) {
        if (isNaN(lon) || isNaN(lat)) return;
        if (sourceMarker) {
            map.removeLayer(sourceMarker);
        }
        sourceMarker = L.circleMarker([lat, lon], {
            radius: 8,
            color: '#a855f7',
            fillColor: '#c084fc',
            fillOpacity: 0.95,
            weight: 2.5
        }).addTo(map);
        sourceMarker.bindTooltip(`Upstream Origin [${lon.toFixed(4)}, ${lat.toFixed(4)}]`, { permanent: false });

        if (pan) {
            map.panTo([lat, lon]);
        }
    }

    // Handle manual typing of source point coordinates
    function syncSourceMarkerFromInputs() {
        if (!inputSourceLon || !inputSourceLat) return;
        const lon = parseFloat(inputSourceLon.value);
        const lat = parseFloat(inputSourceLat.value);
        if (!isNaN(lon) && !isNaN(lat)) {
            setSourceMarker(lon, lat, false);
        }
    }

    if (inputSourceLon && inputSourceLat) {
        inputSourceLon.addEventListener('input', syncSourceMarkerFromInputs);
        inputSourceLat.addEventListener('input', syncSourceMarkerFromInputs);
    }

    // Map click to place source point
    map.on('click', (e) => {
        const traceCheckbox = document.getElementById('trace-flood-path');
        if (traceCheckbox && traceCheckbox.checked) {
            const lon = parseFloat(e.latlng.lng.toFixed(4));
            const lat = parseFloat(e.latlng.lat.toFixed(4));
            if (inputSourceLon) inputSourceLon.value = lon.toFixed(4);
            if (inputSourceLat) inputSourceLat.value = lat.toFixed(4);
            setSourceMarker(lon, lat);
        }
    });

    // Toggle source point display container
    const tracePathToggle = document.getElementById('trace-flood-path');
    const sourceContainer = document.getElementById('source-point-container');
    if (tracePathToggle && sourceContainer) {
        tracePathToggle.addEventListener('change', () => {
            sourceContainer.style.display = tracePathToggle.checked ? 'block' : 'none';
        });
    }

    // Initial render with default coordinates
    syncPolygonFromInputs();
    syncSourceMarkerFromInputs();

    // Form Submission
    const form = document.getElementById('form-analysis');
    const btnSubmit = document.getElementById('btn-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Ensure current polygon matches the typed inputs
        syncPolygonFromInputs();

        if (!currentAoiPolygon) {
            alert("Please provide an Area of Interest using the coordinates or map drawing tool.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "⏳ Initializing Satellite Pipeline...";

        const payload = {
            aoi: currentAoiPolygon,
            flood_date: document.getElementById('flood-date').value,
            use_segmentation: document.getElementById('use-segmentation').checked,
            trace_flood_path: document.getElementById('trace-flood-path').checked,
        };

        if (payload.trace_flood_path && inputSourceLon && inputSourceLat) {
            payload.source_point = {
                type: "Point",
                coordinates: [
                    parseFloat(inputSourceLon.value),
                    parseFloat(inputSourceLat.value)
                ]
            };
        }

        try {
            const resp = await fetch('/api/analysis/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const err = await resp.json();
                throw new Error(JSON.stringify(err));
            }

            const data = await resp.json();
            window.location.href = `/dashboard/${data.id}/`;
        } catch (error) {
            console.error("Submission failed:", error);
            alert("Failed to submit analysis: " + error.message);
            btnSubmit.disabled = false;
            btnSubmit.textContent = "🚀 Run Satellite Flood Analysis";
        }
    });
});
