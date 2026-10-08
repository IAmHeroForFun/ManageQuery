/**
 * Layer Management & GeoJSON Visualizer
 */
const MapLayers = {
    flood: null,
    roads: null,
    buildings: null,
    cutoff: null,
    path: null,
    unet: null,
    emsr927: null
};

// Map of village name -> { latlng, layer }
const SettlementMarkers = {};

async function loadAllDashboardLayers(map, jobId) {
    await Promise.all([
        loadFloodLayer(map, jobId),
        loadDamagedFeaturesLayer(map, jobId),
        loadCutoffSettlementsLayer(map, jobId),
        loadFloodPathLayer(map, jobId)
    ]);
}

async function loadFloodLayer(map, jobId) {
    try {
        const resp = await fetch(`/api/analysis/${jobId}/flood-extent/`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (MapLayers.flood) map.removeLayer(MapLayers.flood);

        MapLayers.flood = L.geoJSON(data, {
            style: {
                color: '#eab308',
                weight: 2.5,
                fillColor: '#facc15',
                fillOpacity: 0.38
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties || {};
                layer.bindPopup(`
                    <div style="font-size:12px;">
                        <strong style="color:#ca8a04;">🌊 Inundated & Saturated Debris Corridor</strong><br>
                        <strong>Sensor:</strong> ${p.source || 'Fused (SAR+Optical)'}<br>
                        <strong>Confidence:</strong> ${(p.confidence ? (p.confidence * 100).toFixed(0) : '88')}%<br>
                        <strong>Calculated Area:</strong> ${p.area_km2 || '--'} km²
                    </div>
                `);
            }
        }).addTo(map);

        if (MapLayers.flood.getLayers().length > 0) {
            map.fitBounds(MapLayers.flood.getBounds(), { padding: [30, 30] });
        }
    } catch (e) {
        console.warn("Could not load flood layer:", e);
    }
}

async function loadDamagedFeaturesLayer(map, jobId) {
    try {
        const resp = await fetch(`/api/analysis/${jobId}/damaged-features/`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (MapLayers.roads) map.removeLayer(MapLayers.roads);
        if (MapLayers.buildings) map.removeLayer(MapLayers.buildings);

        const roadFeatures = data.features.filter(f => f.properties.osm_type === 'road' || f.properties.osm_type === 'bridge');
        const buildingFeatures = data.features.filter(f => f.properties.osm_type === 'building');

        // Separate road segments and bridges for crisp styling
        MapLayers.roads = L.geoJSON({ type: "FeatureCollection", features: roadFeatures }, {
            style: (feature) => {
                const status = feature.properties.status;
                const isBridge = feature.properties.osm_type === 'bridge';
                const isAffected = status === 'affected';
                
                return {
                    color: isAffected ? '#ef4444' : '#f97316',
                    weight: isBridge ? 5.5 : (isAffected ? 3.5 : 2.5),
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: null, // Solid clean lines to avoid crossing dashes
                    opacity: isBridge ? 1.0 : 0.92
                };
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const isSevered = p.status === 'affected';
                const isBridge = p.osm_type === 'bridge';
                layer.bindPopup(`
                    <div style="font-size:12px; min-width: 210px;">
                        <strong style="color:${isSevered ? '#dc2626' : '#d97706'}; font-size:13px;">
                            ${isBridge ? '🌉 ' + (isSevered ? 'SEVERED BRIDGE' : 'BRIDGE AT RISK') : (isSevered ? '🚫 SEVERED ROAD' : '⚠️ CAUTION: WATERLOGGED ROAD')}
                        </strong><br>
                        <strong>Name:</strong> ${p.osm_name || (isBridge ? 'River Crossing Bridge' : 'Corridor Road')}<br>
                        <strong>Infrastructure:</strong> ${p.osm_type.toUpperCase()}<br>
                        <strong>Vehicle Passability:</strong> 
                        <span style="font-weight:700; color:${isSevered ? '#dc2626' : '#d97706'};">
                            ${isSevered ? 'IMPASSABLE TO AMBULANCES' : 'SLOW / 4WD ONLY'}
                        </span><br>
                        <strong>Submerged Overlap:</strong> ${p.overlap_pct}%<br>
                        <small style="color:#64748b;">Source: OpenStreetMap intersected with satellite radar footprint.</small>
                    </div>
                `);
            }
        }).addTo(map);

        // Buildings Layer
        MapLayers.buildings = L.geoJSON({ type: "FeatureCollection", features: buildingFeatures }, {
            style: {
                color: '#7f1d1d',
                weight: 1,
                fillColor: '#991b1b',
                fillOpacity: 0.7
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                layer.bindPopup(`
                    <div style="font-size:12px;">
                        <strong style="color:#991b1b; font-size:13px;">🏚️ Flood-Impacted Structure</strong><br>
                        <strong>Building ID/Name:</strong> ${p.osm_name || p.osm_id}<br>
                        <strong>Status:</strong> <span style="font-weight:700; color:#dc2626;">SUBMERGED / STRUCTURAL THREAT</span><br>
                        <strong>Footprint Inundation:</strong> ${p.overlap_pct}%
                    </div>
                `);
            }
        });

        // Cutoff settlements layer
    } catch (e) {
        console.warn("Could not load damaged features layer:", e);
    }
}

async function loadCutoffSettlementsLayer(map, jobId) {
    try {
        const resp = await fetch(`/api/analysis/${jobId}/cutoff-settlements/`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (MapLayers.cutoff) map.removeLayer(MapLayers.cutoff);

        MapLayers.cutoff = L.geoJSON(data, {
            pointToLayer: (feature, latlng) => {
                const isCutoff = feature.properties.is_cutoff;
                return L.circleMarker(latlng, {
                    radius: isCutoff ? 8 : 6,
                    color: isCutoff ? '#ef4444' : '#16a34a',
                    fillColor: isCutoff ? '#f87171' : '#4ade80',
                    fillOpacity: 0.95,
                    weight: 2
                });
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const coords = feature.geometry.coordinates;
                SettlementMarkers[p.name] = {
                    latlng: [coords[1], coords[0]],
                    layer: layer
                };

                layer.bindPopup(`
                    <div style="font-size:12px; min-width: 220px;">
                        <strong style="color:${p.is_cutoff ? '#ef4444' : '#16a34a'}; font-size:13px;">
                            ${p.is_cutoff ? '🚨 PRIORITY 1: ISOLATED COMMUNITY' : '✅ GROUND EVACUATION ACCESSIBLE'}
                        </strong><br>
                        <strong>Village Name:</strong> ${p.name}<br>
                        <strong>Nearest Medical Center:</strong> ${p.nearest_hospital || 'District Hospital'}<br>
                        <strong>Pre-Flood Highway Distance:</strong> ${p.pre_flood_distance_km || '--'} km<br>
                        <strong>Ground Accessibility:</strong> 
                        ${p.is_cutoff ? '<span style="color:#ef4444;font-weight:700;">ALL ROADS SEVERED — REQUIRES AIRLIFT</span>' : '<span style="color:#16a34a;font-weight:700;">DRIVABLE ROAD ROUTE INTACT</span>'}
                    </div>
                `);
            }
        }).addTo(map);

        // Populate clickable sidebar list
        const listEl = document.getElementById('settlements-list');
        if (listEl) {
            listEl.innerHTML = '';
            data.features.forEach(f => {
                const p = f.properties;
                const coords = f.geometry.coordinates;
                const li = document.createElement('li');
                li.className = 'settlement-item';
                li.style.cursor = 'pointer';
                li.title = 'Click to focus on this village on the map';
                li.innerHTML = `
                    <span><strong>📍 ${p.name}</strong></span>
                    <span class="status-tag ${p.is_cutoff ? 'status-tag-cutoff' : 'status-tag-connected'}">
                        ${p.is_cutoff ? '🔴 CUT OFF' : '🟢 CONNECTED'}
                    </span>
                `;

                li.addEventListener('click', () => {
                    map.flyTo([coords[1], coords[0]], 13, { duration: 1.2 });
                    const entry = SettlementMarkers[p.name];
                    if (entry && entry.layer) {
                        setTimeout(() => entry.layer.openPopup(), 1200);
                    }
                });

                listEl.appendChild(li);
            });
        }
    } catch (e) {
        console.warn("Could not load settlements layer:", e);
    }
}

async function loadFloodPathLayer(map, jobId) {
    try {
        const resp = await fetch(`/api/analysis/${jobId}/flood-path/`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (MapLayers.path) map.removeLayer(MapLayers.path);

        if (!data.features || data.features.length === 0) return;

        MapLayers.path = L.geoJSON(data, {
            style: {
                color: '#a855f7',
                weight: 3.5,
                dashArray: '6, 6',
                opacity: 0.95
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                let etaHtml = '';
                if (p.settlement_etas && p.settlement_etas.length > 0) {
                    etaHtml = `
                        <div style="margin-top:6px; border-top:1px solid #e2e8f0; padding-top:4px;">
                            <strong>⏱️ Downstream Surge Arrival (ETA):</strong>
                            <div style="max-height:110px; overflow-y:auto; margin-top:3px;">
                                ${p.settlement_etas.map(s => `
                                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                                        <span>📍 <strong>${s.name}</strong> (${s.distance_from_origin_km} km)</span>
                                        <span style="color:#d97706; font-weight:700;">+${s.eta_formatted}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else if (p.settlements_on_path && p.settlements_on_path.length > 0) {
                    etaHtml = `<strong>Settlements on trajectory:</strong><br>${p.settlements_on_path.join(', ')}`;
                }

                layer.bindPopup(`
                    <div style="font-size:12px; min-width: 220px;">
                        <strong style="color:#9333ea; font-size:13px;">🟣 Downhill Flow Corridor (OSM/D8)</strong><br>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin: 5px 0; background:#faf5ff; padding:5px; border-radius:4px; font-size:11px;">
                            <div><strong>Path Length:</strong><br>${p.path_length_km} km</div>
                            <div><strong>Elevation Drop:</strong><br>📉 -${p.elevation_drop_m || '--'} m</div>
                            <div><strong>Headwater Elev:</strong><br>🏔️ ${p.start_elevation_m || '--'} m</div>
                            <div><strong>Surge Velocity:</strong><br>⚡ ~${p.avg_speed_kmh || '--'} km/h</div>
                        </div>
                        ${etaHtml}
                    </div>
                `);
            }
        }).addTo(map);
    } catch (e) {
        console.warn("Could not load flood path layer:", e);
    }
}
