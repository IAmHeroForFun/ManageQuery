/**
 * Interactive AOI Selector with Direct Drag & Drop, Corner Handles, and Region Presets
 */
document.addEventListener('DOMContentLoaded', () => {
    const map = initLeafletMap('map', [28.25, 85.35], 10);

    // Layers
    const drawnItems = new L.FeatureGroup().addTo(map);
    const handlesGroup = new L.LayerGroup().addTo(map);

    let currentAoiPolygon = null;
    let activeRectLayer = null;
    let sourceMarker = null;

    // Region Presets (Coordinates & Optimal Views for global floodplains)
    const REGION_PRESETS = {
        trishuli: {
            name: "Trishuli Basin, Nepal",
            minLon: 85.1500, minLat: 27.9500, maxLon: 85.5500, maxLat: 28.4500,
            sourceLon: 85.4500, sourceLat: 28.3600
        },
        gujarat: {
            name: "Gujarat Coast, India",
            minLon: 72.8200, minLat: 20.8400, maxLon: 72.9800, maxLat: 20.9800,
            sourceLon: 72.9400, sourceLat: 20.9600
        },
        melamchi: {
            name: "Melamchi River Basin, Nepal",
            minLon: 85.4800, minLat: 27.7800, maxLon: 85.6800, maxLat: 28.0800,
            sourceLon: 85.6000, sourceLat: 28.0200
        },
        rhine: {
            name: "Rhine Valley, Europe",
            minLon: 7.0000, minLat: 50.4500, maxLon: 7.2000, maxLat: 50.6000,
            sourceLon: 7.1500, sourceLat: 50.5600
        }
    };

    // Form inputs
    const inputMinLon = document.getElementById('aoi-min-lon');
    const inputMinLat = document.getElementById('aoi-min-lat');
    const inputMaxLon = document.getElementById('aoi-max-lon');
    const inputMaxLat = document.getElementById('aoi-max-lat');
    const inputSourceLon = document.getElementById('source-lon');
    const inputSourceLat = document.getElementById('source-lat');

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

    function syncInputsFromCoords(minLon, minLat, maxLon, maxLat) {
        if (inputMinLon) inputMinLon.value = minLon.toFixed(4);
        if (inputMinLat) inputMinLat.value = minLat.toFixed(4);
        if (inputMaxLon) inputMaxLon.value = maxLon.toFixed(4);
        if (inputMaxLat) inputMaxLat.value = maxLat.toFixed(4);

        const statusEl = document.getElementById('aoi-status-text');
        if (statusEl) {
            const widthKm = ((maxLon - minLon) * 105).toFixed(1);
            const heightKm = ((maxLat - minLat) * 111).toFixed(1);
            statusEl.textContent = `AOI active: ~${widthKm} × ${heightKm} km box ready.`;
        }
    }

    /**
     * Builds interactive drag & resize handles on top of the AOI bounding box
     */
    function updateInteractiveHandles(bounds) {
        handlesGroup.clearLayers();

        const southWest = bounds.getSouthWest();
        const northEast = bounds.getNorthEast();
        const center = bounds.getCenter();

        const corners = [
            { pos: [northEast.lat, southWest.lng], role: 'nw', cursor: 'nwse-resize' },
            { pos: [northEast.lat, northEast.lng], role: 'ne', cursor: 'nesw-resize' },
            { pos: [southWest.lat, northEast.lng], role: 'se', cursor: 'nwse-resize' },
            { pos: [southWest.lat, southWest.lng], role: 'sw', cursor: 'nesw-resize' }
        ];

        // 1. Center Move Handle
        const centerIcon = L.divIcon({
            className: 'aoi-center-handle',
            html: '<div class="handle-center-dot" title="Drag to MOVE the entire box">✥ MOVE</div>',
            iconSize: [64, 26],
            iconAnchor: [32, 13]
        });

        const centerMarker = L.marker(center, {
            icon: centerIcon,
            draggable: true,
            zIndexOffset: 1000
        }).addTo(handlesGroup);

        let initialCenter = center;
        let initialBounds = bounds;

        centerMarker.on('dragstart', (e) => {
            initialCenter = e.target.getLatLng();
            initialBounds = activeRectLayer ? activeRectLayer.getBounds() : bounds;
        });

        centerMarker.on('drag', (e) => {
            const currentPos = e.target.getLatLng();
            const dLat = currentPos.lat - initialCenter.lat;
            const dLng = currentPos.lng - initialCenter.lng;

            const newSw = L.latLng(initialBounds.getSouth() + dLat, initialBounds.getWest() + dLng);
            const newNe = L.latLng(initialBounds.getNorth() + dLat, initialBounds.getEast() + dLng);
            const newBounds = L.latLngBounds(newSw, newNe);

            if (activeRectLayer) {
                activeRectLayer.setBounds(newBounds);
            }
        });

        centerMarker.on('dragend', (e) => {
            if (activeRectLayer) {
                const b = activeRectLayer.getBounds();
                syncInputsFromCoords(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
                currentAoiPolygon = createBboxPolygon(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
                updateInteractiveHandles(b);
            }
        });

        // 2. Corner Resize Handles
        corners.forEach(corner => {
            const cornerIcon = L.divIcon({
                className: `aoi-corner-handle corner-${corner.role}`,
                html: '<div class="handle-corner-dot" title="Drag to RESIZE box"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const marker = L.marker(corner.pos, {
                icon: cornerIcon,
                draggable: true,
                zIndexOffset: 900
            }).addTo(handlesGroup);

            marker.on('drag', (e) => {
                const p = e.target.getLatLng();
                const curBounds = activeRectLayer ? activeRectLayer.getBounds() : bounds;
                let minLat = curBounds.getSouth();
                let maxLat = curBounds.getNorth();
                let minLon = curBounds.getWest();
                let maxLon = curBounds.getEast();

                if (corner.role === 'nw') {
                    maxLat = p.lat;
                    minLon = p.lng;
                } else if (corner.role === 'ne') {
                    maxLat = p.lat;
                    maxLon = p.lng;
                } else if (corner.role === 'se') {
                    minLat = p.lat;
                    maxLon = p.lng;
                } else if (corner.role === 'sw') {
                    minLat = p.lat;
                    minLon = p.lng;
                }

                // Ensure bounds maintain positive dimensions
                const validSw = L.latLng(Math.min(minLat, maxLat - 0.02), Math.min(minLon, maxLon - 0.02));
                const validNe = L.latLng(Math.max(maxLat, minLat + 0.02), Math.max(maxLon, minLon + 0.02));
                const updatedBounds = L.latLngBounds(validSw, validNe);

                if (activeRectLayer) {
                    activeRectLayer.setBounds(updatedBounds);
                }
            });

            marker.on('dragend', () => {
                if (activeRectLayer) {
                    const b = activeRectLayer.getBounds();
                    syncInputsFromCoords(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
                    currentAoiPolygon = createBboxPolygon(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
                    updateInteractiveHandles(b);
                }
            });
        });
    }

    /**
     * Renders the interactive AOI on the map
     */
    function renderAoiOnMap(geojsonPolygon, fit = true) {
        drawnItems.clearLayers();
        handlesGroup.clearLayers();
        currentAoiPolygon = geojsonPolygon;

        const coords = geojsonPolygon.coordinates[0];
        const lons = coords.map(c => c[0]);
        const lats = coords.map(c => c[1]);
        const bounds = L.latLngBounds(
            [Math.min(...lats), Math.min(...lons)],
            [Math.max(...lats), Math.max(...lons)]
        );

        activeRectLayer = L.rectangle(bounds, {
            color: "#0284c7",
            weight: 2.5,
            fillColor: "#38bdf8",
            fillOpacity: 0.22,
            dashArray: "4, 4"
        }).addTo(drawnItems);

        updateInteractiveHandles(bounds);

        if (fit) {
            map.fitBounds(bounds, { padding: [35, 35] });
        }
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

    // Manual input listeners
    [inputMinLon, inputMinLat, inputMaxLon, inputMaxLat].forEach(input => {
        if (input) {
            input.addEventListener('input', syncPolygonFromInputs);
            input.addEventListener('change', syncPolygonFromInputs);
        }
    });

    // Leaflet Draw Control (for drawing new rectangles)
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
        edit: false
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (event) => {
        const layer = event.layer;
        const b = layer.getBounds();
        syncInputsFromCoords(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        currentAoiPolygon = createBboxPolygon(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        renderAoiOnMap(currentAoiPolygon, false);
    });

    // Region Presets Button Click Handlers
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const key = chip.getAttribute('data-preset');
            const preset = REGION_PRESETS[key];
            if (preset) {
                applyPreset(preset);
            }
        });
    });

    function applyPreset(preset) {
        if (inputMinLon) inputMinLon.value = preset.minLon.toFixed(4);
        if (inputMinLat) inputMinLat.value = preset.minLat.toFixed(4);
        if (inputMaxLon) inputMaxLon.value = preset.maxLon.toFixed(4);
        if (inputMaxLat) inputMaxLat.value = preset.maxLat.toFixed(4);

        if (inputSourceLon) inputSourceLon.value = preset.sourceLon.toFixed(4);
        if (inputSourceLat) inputSourceLat.value = preset.sourceLat.toFixed(4);

        const poly = createBboxPolygon(preset.minLon, preset.minLat, preset.maxLon, preset.maxLat);
        renderAoiOnMap(poly, true);
        setSourceMarker(preset.sourceLon, preset.sourceLat, false);
    }

    // "Center Box Here" Action Button
    const btnRecenter = document.getElementById('btn-recenter-aoi');
    if (btnRecenter) {
        btnRecenter.addEventListener('click', () => {
            const mapCenter = map.getCenter();
            // Preserve current width & height of AOI, center around mapCenter
            const curMinLon = parseFloat(inputMinLon.value) || 85.15;
            const curMaxLon = parseFloat(inputMaxLon.value) || 85.55;
            const curMinLat = parseFloat(inputMinLat.value) || 27.95;
            const curMaxLat = parseFloat(inputMaxLat.value) || 28.45;

            const halfWidth = Math.abs(curMaxLon - curMinLon) / 2;
            const halfHeight = Math.abs(curMaxLat - curMinLat) / 2;

            const newMinLon = mapCenter.lng - halfWidth;
            const newMaxLon = mapCenter.lng + halfWidth;
            const newMinLat = mapCenter.lat - halfHeight;
            const newMaxLat = mapCenter.lat + halfHeight;

            syncInputsFromCoords(newMinLon, newMinLat, newMaxLon, newMaxLat);
            const poly = createBboxPolygon(newMinLon, newMinLat, newMaxLon, newMaxLat);
            renderAoiOnMap(poly, false);
        });
    }

    // Draggable Upstream Source Origin Marker
    function setSourceMarker(lon, lat, pan = false) {
        if (isNaN(lon) || isNaN(lat)) return;
        if (sourceMarker) {
            map.removeLayer(sourceMarker);
        }

        const sourceIcon = L.divIcon({
            className: 'upstream-source-marker',
            html: '<div class="source-pin"><span class="source-pin-icon">💧</span><span class="source-pin-label">Origin</span></div>',
            iconSize: [38, 38],
            iconAnchor: [19, 36]
        });

        sourceMarker = L.marker([lat, lon], {
            icon: sourceIcon,
            draggable: true,
            zIndexOffset: 1200
        }).addTo(map);

        const updateTooltip = (pLng, pLat) => {
            // Rough elevation estimate for immediate UI feedback
            let elevEst = '';
            if (pLng >= 84.5 && pLng <= 86.5 && pLat >= 27.5 && pLat <= 29.0) {
                const estM = Math.round(2200 + Math.max(0, (pLat - 27.8) / 0.8) * 2600);
                elevEst = ` • ~${estM}m elev`;
            }
            return `💧 Upstream Flood Origin [${pLng.toFixed(4)}, ${pLat.toFixed(4)}]${elevEst}<br><small style="color:#cbd5e1;">(Drag to reposition flood source)</small>`;
        };

        sourceMarker.bindTooltip(updateTooltip(lon, lat), {
            permanent: false,
            direction: 'top'
        });

        sourceMarker.on('drag', (e) => {
            const pos = e.target.getLatLng();
            if (inputSourceLon) inputSourceLon.value = pos.lng.toFixed(4);
            if (inputSourceLat) inputSourceLat.value = pos.lat.toFixed(4);
        });

        sourceMarker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            sourceMarker.setTooltipContent(updateTooltip(pos.lng, pos.lat));
        });

        if (pan) {
            map.panTo([lat, lon]);
        }
    }

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

    // Map click places the Upstream Origin Marker if flood path tracing is active
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

    // Save state to localStorage
    function saveSessionState() {
        if (!currentAoiPolygon) return;
        const state = {
            minLon: parseFloat(inputMinLon.value),
            minLat: parseFloat(inputMinLat.value),
            maxLon: parseFloat(inputMaxLon.value),
            maxLat: parseFloat(inputMaxLat.value),
            sourceLon: parseFloat(inputSourceLon ? inputSourceLon.value : 85.45),
            sourceLat: parseFloat(inputSourceLat ? inputSourceLat.value : 28.36),
            mapCenter: map.getCenter(),
            mapZoom: map.getZoom()
        };
        try {
            localStorage.setItem('mfdfs_last_aoi_state', JSON.stringify(state));
        } catch (e) {
            console.warn("Could not save map state to localStorage", e);
        }
    }

    // Restore state from localStorage or load Trishuli default
    function restoreSessionState() {
        let restored = false;
        try {
            const raw = localStorage.getItem('mfdfs_last_aoi_state');
            if (raw) {
                const s = JSON.parse(raw);
                if (!isNaN(s.minLon) && !isNaN(s.minLat) && !isNaN(s.maxLon) && !isNaN(s.maxLat)) {
                    if (inputMinLon) inputMinLon.value = s.minLon.toFixed(4);
                    if (inputMinLat) inputMinLat.value = s.minLat.toFixed(4);
                    if (inputMaxLon) inputMaxLon.value = s.maxLon.toFixed(4);
                    if (inputMaxLat) inputMaxLat.value = s.maxLat.toFixed(4);
                    if (inputSourceLon) inputSourceLon.value = s.sourceLon.toFixed(4);
                    if (inputSourceLat) inputSourceLat.value = s.sourceLat.toFixed(4);

                    const poly = createBboxPolygon(s.minLon, s.minLat, s.maxLon, s.maxLat);
                    renderAoiOnMap(poly, true);
                    setSourceMarker(s.sourceLon, s.sourceLat, false);

                    if (s.mapCenter && s.mapZoom) {
                        map.setView([s.mapCenter.lat, s.mapCenter.lng], s.mapZoom);
                    }
                    restored = true;
                }
            }
        } catch (e) {
            console.warn("Failed to parse saved map state", e);
        }

        if (!restored) {
            applyPreset(REGION_PRESETS.trishuli);
        }
    }

    // Initial render: restore previous session or default to Trishuli
    restoreSessionState();

    // Attach session saving to input and map modifications
    [inputMinLon, inputMinLat, inputMaxLon, inputMaxLat, inputSourceLon, inputSourceLat].forEach(inp => {
        if (inp) inp.addEventListener('change', saveSessionState);
    });
    map.on('moveend', saveSessionState);


    // Form Submission
    const form = document.getElementById('form-analysis');
    const btnSubmit = document.getElementById('btn-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentAoiPolygon) {
            alert("Please provide an Area of Interest using the interactive map or preset chips.");
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
