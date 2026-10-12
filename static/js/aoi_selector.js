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
    let isDraggingBox = false;
    let dragStartLatLng = null;
    let dragStartBounds = null;
    let justFinishedDragging = false;

    // Fixed 1-Size Footprint: Locked to ~18 x 18 km (0.16° x 0.16°) for maximum satellite & DEM accuracy
    const FIXED_SPAN_LON = 0.1600;
    const FIXED_SPAN_LAT = 0.1600;
    const HALF_SPAN_LON = FIXED_SPAN_LON / 2; // 0.0800
    const HALF_SPAN_LAT = FIXED_SPAN_LAT / 2; // 0.0800

    // Region Presets (Locked to exact 18 x 18 km high-accuracy operational box)
    const REGION_PRESETS = {
        trishuli: {
            name: "Trishuli Basin, Nepal",
            floodDate: "2026-08-26",
            minLon: 85.2700, minLat: 28.1000, maxLon: 85.4300, maxLat: 28.2600,
            sourceLon: 85.4000, sourceLat: 28.2300
        },
        melamchi: {
            name: "Melamchi River Basin, Nepal",
            floodDate: "2021-06-15",
            minLon: 85.5000, minLat: 27.8500, maxLon: 85.6600, maxLat: 28.0100,
            sourceLon: 85.6000, sourceLat: 27.9800
        },
        gujarat: {
            name: "Gujarat Coast, India",
            floodDate: "2024-08-28",
            minLon: 72.8200, minLat: 20.8300, maxLon: 72.9800, maxLat: 20.9900,
            sourceLon: 72.9400, sourceLat: 20.9600
        },
        mumbai: {
            name: "Mumbai Suburban Corridor, India",
            floodDate: "2026-08-26",
            minLon: 72.8200, minLat: 19.1200, maxLon: 72.9800, maxLat: 19.2800,
            sourceLon: 72.9100, sourceLat: 19.2400
        },
        rhine: {
            name: "Rhine Valley, Europe",
            floodDate: "2021-07-14",
            minLon: 7.0200, minLat: 50.4500, maxLon: 7.1800, maxLat: 50.6100,
            sourceLon: 7.1400, sourceLat: 50.5700
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
            const widthKm = (Math.abs(maxLon - minLon) * 105).toFixed(1);
            const heightKm = (Math.abs(maxLat - minLat) * 111).toFixed(1);
            statusEl.innerHTML = `<strong>AOI Footprint:</strong> ~${widthKm} × ${heightKm} km &nbsp;|&nbsp; <span style="background:rgba(16,185,129,0.15);color:#059669;font-weight:600;padding:2px 8px;border-radius:4px;font-size:0.78rem;">🔒 Fixed High-Accuracy Box</span>`;
        }
    }

    /**
     * Builds interactive move-only handle on top of the fixed AOI bounding box
     */
    function updateInteractiveHandles(bounds) {
        handlesGroup.clearLayers();

        const center = bounds.getCenter();

        // 1. Center Move Handle (Move-Only: preserves exact fixed footprint)
        const centerIcon = L.divIcon({
            className: 'aoi-center-handle',
            html: '<div class="handle-center-dot" title="Drag to MOVE the fixed box anywhere">✥ MOVE</div>',
            iconSize: [68, 28],
            iconAnchor: [34, 14]
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
                saveSessionState();
            }
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
            dashArray: "4, 4",
            className: "draggable-aoi-box"
        }).addTo(drawnItems);

        // Direct surface dragging: drag anywhere inside the blue box
        activeRectLayer.on('mousedown', (e) => {
            isDraggingBox = true;
            dragStartLatLng = e.latlng;
            dragStartBounds = activeRectLayer.getBounds();
            map.dragging.disable();
            L.DomEvent.stopPropagation(e);
        });

        activeRectLayer.on('touchstart', (e) => {
            if (e.latlng) {
                isDraggingBox = true;
                dragStartLatLng = e.latlng;
                dragStartBounds = activeRectLayer.getBounds();
                map.dragging.disable();
                L.DomEvent.stopPropagation(e);
            }
        });

        updateInteractiveHandles(bounds);

        if (fit) {
            map.fitBounds(bounds, { padding: [35, 35] });
        }
    }

    /**
     * Positions the fixed 18 x 18 km AOI box centered at (cLng, cLat)
     */
    function moveBoxToCenter(cLng, cLat, pan = false) {
        if (isNaN(cLng) || isNaN(cLat)) return;
        const newMinLon = cLng - HALF_SPAN_LON;
        const newMaxLon = cLng + HALF_SPAN_LON;
        const newMinLat = cLat - HALF_SPAN_LAT;
        const newMaxLat = cLat + HALF_SPAN_LAT;

        syncInputsFromCoords(newMinLon, newMinLat, newMaxLon, newMaxLat);
        const poly = createBboxPolygon(newMinLon, newMinLat, newMaxLon, newMaxLat);
        renderAoiOnMap(poly, false);

        // Keep origin marker positioned logically near upstream edge of new AOI
        const traceCheckbox = document.getElementById('trace-flood-path');
        if (traceCheckbox && traceCheckbox.checked) {
            const sLon = cLng + 0.03;
            const sLat = cLat + 0.03;
            if (inputSourceLon) inputSourceLon.value = sLon.toFixed(4);
            if (inputSourceLat) inputSourceLat.value = sLat.toFixed(4);
            setSourceMarker(sLon, sLat, false);
        }

        saveSessionState();
        if (pan) {
            map.panTo([cLat, cLng]);
        }
    }

    function syncPolygonFromInputs() {
        const minLon = parseFloat(inputMinLon.value);
        const minLat = parseFloat(inputMinLat.value);
        let maxLon = parseFloat(inputMaxLon.value);
        let maxLat = parseFloat(inputMaxLat.value);

        if (isNaN(minLon) || isNaN(minLat)) return;

        // Preserve fixed footprint around center coordinates
        const cLon = !isNaN(maxLon) ? (minLon + maxLon) / 2 : minLon + HALF_SPAN_LON;
        const cLat = !isNaN(maxLat) ? (minLat + maxLat) / 2 : minLat + HALF_SPAN_LAT;

        const finalMinLon = cLon - HALF_SPAN_LON;
        const finalMaxLon = cLon + HALF_SPAN_LON;
        const finalMinLat = cLat - HALF_SPAN_LAT;
        const finalMaxLat = cLat + HALF_SPAN_LAT;

        syncInputsFromCoords(finalMinLon, finalMinLat, finalMaxLon, finalMaxLat);
        const poly = createBboxPolygon(finalMinLon, finalMinLat, finalMaxLon, finalMaxLat);
        renderAoiOnMap(poly, true);
    }

    // Manual input listeners
    [inputMinLon, inputMinLat, inputMaxLon, inputMaxLat].forEach(input => {
        if (input) {
            input.addEventListener('change', syncPolygonFromInputs);
        }
    });

    // Region Presets Button Click Handlers
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
        chip.addEventListener('click', (e) => {
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const key = chip.getAttribute('data-preset');
            const preset = REGION_PRESETS[key];
            if (preset) {
                applyPreset(preset);
                
                // If user clicked specifically on the Auto-Run badge, immediately trigger submission!
                const isAutoRunClick = e.target.classList.contains('preset-run-badge') || e.target.closest('.preset-run-badge');
                if (isAutoRunClick) {
                    executeAnalysisSubmission();
                }
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

        const dateInput = document.getElementById('flood-date');
        if (dateInput && preset.floodDate) {
            dateInput.value = preset.floodDate;
        }

        const poly = createBboxPolygon(preset.minLon, preset.minLat, preset.maxLon, preset.maxLat);
        renderAoiOnMap(poly, true);
        setSourceMarker(preset.sourceLon, preset.sourceLat, false);
        saveSessionState();
    }

    // "Center Box Here" Action Button
    const btnRecenter = document.getElementById('btn-recenter-aoi');
    if (btnRecenter) {
        btnRecenter.addEventListener('click', () => {
            const mapCenter = map.getCenter();
            moveBoxToCenter(mapCenter.lng, mapCenter.lat, false);
        });
    }

    // "Reset to Standard Box" Action Button
    const btnResetAoi = document.getElementById('btn-reset-aoi');
    if (btnResetAoi) {
        btnResetAoi.addEventListener('click', () => {
            const activeChip = document.querySelector('.preset-chip.active');
            const key = activeChip ? activeChip.getAttribute('data-preset') : 'trishuli';
            const preset = REGION_PRESETS[key] || REGION_PRESETS.trishuli;
            applyPreset(preset);
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
            saveSessionState();
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
            saveSessionState();
        }
    }

    if (inputSourceLon && inputSourceLat) {
        inputSourceLon.addEventListener('change', syncSourceMarkerFromInputs);
        inputSourceLat.addEventListener('change', syncSourceMarkerFromInputs);
    }

    // Dragging handlers for direct box dragging (mouse + touch)
    const onMapMoveBox = (e) => {
        if (!isDraggingBox || !dragStartBounds || !dragStartLatLng) return;
        const dLat = e.latlng.lat - dragStartLatLng.lat;
        const dLng = e.latlng.lng - dragStartLatLng.lng;
        const newSw = L.latLng(dragStartBounds.getSouth() + dLat, dragStartBounds.getWest() + dLng);
        const newNe = L.latLng(dragStartBounds.getNorth() + dLat, dragStartBounds.getEast() + dLng);
        if (activeRectLayer) {
            activeRectLayer.setBounds(L.latLngBounds(newSw, newNe));
        }
    };

    const endBoxDrag = () => {
        if (isDraggingBox) {
            isDraggingBox = false;
            map.dragging.enable();
            justFinishedDragging = true;
            setTimeout(() => { justFinishedDragging = false; }, 250);
            if (activeRectLayer) {
                const b = activeRectLayer.getBounds();
                const center = b.getCenter();
                moveBoxToCenter(center.lng, center.lat, false);
            }
        }
    };

    map.on('mousemove', onMapMoveBox);
    map.on('touchmove', onMapMoveBox);
    map.on('mouseup', endBoxDrag);
    map.on('touchend', endBoxDrag);
    if (map.getContainer()) {
        map.getContainer().addEventListener('mouseleave', endBoxDrag);
    }

    // 1-Click / 1-Tap AOI Positioning: Click anywhere on the map to jump the 18x18 km box immediately!
    map.on('click', (e) => {
        if (justFinishedDragging) return;
        // Don't reposition if user clicked an interactive handle or marker
        if (e.originalEvent && e.originalEvent.target &&
            (e.originalEvent.target.closest('.upstream-source-marker') ||
             e.originalEvent.target.closest('.aoi-center-handle'))) {
            return;
        }
        moveBoxToCenter(e.latlng.lng, e.latlng.lat, false);
    });

    // Place & City Live Geocoding Search Bar
    const COMMON_LOCATIONS = {
        "mumbai": { lat: 19.2000, lng: 72.9000 },
        "trishuli": { lat: 28.1800, lng: 85.3500 },
        "melamchi": { lat: 27.9300, lng: 85.5800 },
        "kathmandu": { lat: 27.7172, lng: 85.3240 },
        "pokhara": { lat: 28.2096, lng: 83.9856 },
        "gujarat": { lat: 20.9100, lng: 72.9000 },
        "surat": { lat: 21.1702, lng: 72.8311 },
        "delhi": { lat: 28.6139, lng: 77.2090 },
        "rhine": { lat: 50.5300, lng: 7.1000 },
        "kolkata": { lat: 22.5726, lng: 88.3639 },
        "chennai": { lat: 13.0827, lng: 80.2707 },
        "dhaka": { lat: 23.8103, lng: 90.4125 },
        "patna": { lat: 25.5941, lng: 85.1376 },
        "guwahati": { lat: 26.1445, lng: 91.7362 }
    };

    const searchInput = document.getElementById('aoi-place-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = searchInput.value.trim().toLowerCase();
                if (!q) return;

                // 1. Fast match from local presets and major cities
                for (const [k, v] of Object.entries(COMMON_LOCATIONS)) {
                    if (q.includes(k) || k.includes(q)) {
                        map.flyTo([v.lat, v.lng], 11, { duration: 1.0 });
                        moveBoxToCenter(v.lng, v.lat, false);
                        return;
                    }
                }

                // 2. Fall back to OpenStreetMap Nominatim geocoding
                try {
                    searchInput.placeholder = "🔍 Searching...";
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
                    const data = await res.json();
                    if (data && data.length > 0) {
                        const lat = parseFloat(data[0].lat);
                        const lng = parseFloat(data[0].lon);
                        map.flyTo([lat, lng], 11, { duration: 1.0 });
                        moveBoxToCenter(lng, lat, false);
                    } else {
                        alert(`Location "${searchInput.value}" not found. Try another city or place name.`);
                    }
                } catch (err) {
                    console.error("Geocoding failed:", err);
                    alert("Place search temporarily unavailable. You can click anywhere on the map to jump the box there.");
                } finally {
                    searchInput.placeholder = "🔍 Search place (e.g. Mumbai, Pokhara)...";
                }
            }
        });
    }

    // Toggle source point display container
    const tracePathToggle = document.getElementById('trace-flood-path');
    const sourceContainer = document.getElementById('source-point-container');
    if (tracePathToggle && sourceContainer) {
        tracePathToggle.addEventListener('change', () => {
            sourceContainer.style.display = tracePathToggle.checked ? 'block' : 'none';
        });
    }

    // Save state to localStorage
    // Save state to localStorage (preserves exact location where user left off)
    function saveSessionState() {
        if (!currentAoiPolygon) return;
        const curMinLon = parseFloat(inputMinLon.value);
        const curMaxLon = parseFloat(inputMaxLon.value);
        const curMinLat = parseFloat(inputMinLat.value);
        const curMaxLat = parseFloat(inputMaxLat.value);

        const centerLon = (curMinLon + curMaxLon) / 2;
        const centerLat = (curMinLat + curMaxLat) / 2;

        const state = {
            centerLon: centerLon,
            centerLat: centerLat,
            minLon: curMinLon,
            minLat: curMinLat,
            maxLon: curMaxLon,
            maxLat: curMaxLat,
            sourceLon: parseFloat(inputSourceLon ? inputSourceLon.value : 85.40),
            sourceLat: parseFloat(inputSourceLat ? inputSourceLat.value : 28.23),
            floodDate: document.getElementById('flood-date') ? document.getElementById('flood-date').value : "2026-08-26",
            mapCenter: map.getCenter(),
            mapZoom: map.getZoom()
        };
        try {
            localStorage.setItem('mfdfs_last_aoi_state', JSON.stringify(state));
        } catch (e) {
            console.warn("Could not save map state to localStorage", e);
        }
    }

    // Restore last user location or fall back to Trishuli default if first visit
    function restoreLastOrPresetState() {
        try {
            const raw = localStorage.getItem('mfdfs_last_aoi_state');
            if (raw) {
                const s = JSON.parse(raw);
                const cLon = !isNaN(s.centerLon) ? s.centerLon : ((s.minLon + s.maxLon) / 2);
                const cLat = !isNaN(s.centerLat) ? s.centerLat : ((s.minLat + s.maxLat) / 2);

                if (!isNaN(cLon) && !isNaN(cLat)) {
                    // Reconstruct locked 18x18 km box around saved center
                    const minLon = cLon - HALF_SPAN_LON;
                    const maxLon = cLon + HALF_SPAN_LON;
                    const minLat = cLat - HALF_SPAN_LAT;
                    const maxLat = cLat + HALF_SPAN_LAT;

                    syncInputsFromCoords(minLon, minLat, maxLon, maxLat);
                    const poly = createBboxPolygon(minLon, minLat, maxLon, maxLat);
                    renderAoiOnMap(poly, false);

                    const sLon = !isNaN(s.sourceLon) ? s.sourceLon : (cLon + 0.05);
                    const sLat = !isNaN(s.sourceLat) ? s.sourceLat : (cLat + 0.05);
                    if (inputSourceLon) inputSourceLon.value = sLon.toFixed(4);
                    if (inputSourceLat) inputSourceLat.value = sLat.toFixed(4);
                    setSourceMarker(sLon, sLat, false);

                    const dateInput = document.getElementById('flood-date');
                    if (dateInput && s.floodDate) {
                        dateInput.value = s.floodDate;
                    }

                    if (s.mapCenter && s.mapZoom) {
                        map.setView([s.mapCenter.lat, s.mapCenter.lng], s.mapZoom);
                    } else {
                        map.setView([cLat, cLon], 11);
                    }
                    return; // Successfully restored where user left off!
                }
            }
        } catch (e) {
            console.warn("Could not restore last AOI state:", e);
        }

        // If no prior session exists, default to Trishuli preset
        applyPreset(REGION_PRESETS.trishuli);
    }

    // Initial render: restore where user left off last time
    restoreLastOrPresetState();

    // Attach session saving only to explicit input modifications
    [inputMinLon, inputMinLat, inputMaxLon, inputMaxLat, inputSourceLon, inputSourceLat].forEach(inp => {
        if (inp) inp.addEventListener('change', saveSessionState);
    });


    // Form Submission & Auto-Run Execution
    const form = document.getElementById('form-analysis');
    const btnSubmit = document.getElementById('btn-submit');

    async function executeAnalysisSubmission() {
        if (!currentAoiPolygon) {
            alert("Please provide an Area of Interest using the interactive map or preset chips.");
            return;
        }

        // Always remember current box location before executing
        saveSessionState();

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = "⏳ Initializing Satellite Pipeline...";
        }

        const dateInput = document.getElementById('flood-date');
        const segCheck = document.getElementById('use-segmentation');
        const pathCheck = document.getElementById('trace-flood-path');

        const payload = {
            aoi: currentAoiPolygon,
            flood_date: dateInput ? dateInput.value : "2026-08-26",
            use_segmentation: segCheck ? segCheck.checked : true,
            trace_flood_path: pathCheck ? pathCheck.checked : true,
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
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = "🚀 Run Satellite Flood Analysis";
            }
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        executeAnalysisSubmission();
    });
});
