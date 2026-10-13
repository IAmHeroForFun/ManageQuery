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
    if (window.syncLayersWithControls) {
        window.syncLayersWithControls();
    }
}

async function loadFloodLayer(map, jobId) {
    try {
        const resp = await fetch(`/api/analysis/${jobId}/flood-extent/`);
        if (!resp.ok) return;
        const data = await resp.json();

        if (MapLayers.flood && map.hasLayer(MapLayers.flood)) {
            map.removeLayer(MapLayers.flood);
        }

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
                        <strong style="color:#ca8a04;">[INUNDATION] Saturated Debris Corridor</strong><br>
                        <strong>Sensor:</strong> ${p.source || 'Fused (SAR+Optical)'}<br>
                        <strong>Confidence:</strong> ${(p.confidence ? (p.confidence * 100).toFixed(0) : '88')}%<br>
                        <strong>Calculated Area:</strong> ${p.area_km2 || '--'} km²
                    </div>
                `);
            }
        });

        const floodToggle = document.getElementById('toggle-flood');
        if (floodToggle && floodToggle.checked) {
            MapLayers.flood.addTo(map);
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

        if (MapLayers.roads && map.hasLayer(MapLayers.roads)) map.removeLayer(MapLayers.roads);
        if (MapLayers.buildings && map.hasLayer(MapLayers.buildings)) map.removeLayer(MapLayers.buildings);

        const roadFeatures = data.features.filter(f => f.properties.osm_type === 'road' || f.properties.osm_type === 'bridge');
        const buildingFeatures = data.features.filter(f => f.properties.osm_type === 'building');

        // Separate road segments and bridges for crisp styling
        MapLayers.roads = L.geoJSON({ type: "FeatureCollection", features: roadFeatures }, {
            style: (feature) => {
                const status = feature.properties.status;
                const isBridge = feature.properties.osm_type === 'bridge';
                const isAffected = status === 'affected';
                const isPossible = status === 'possibly_affected';
                
                // Red for severed, orange for waterlogged, clean slate for intact passable road
                let strokeColor = '#64748b'; // Intact passable route
                let weight = 2.0;
                let opacity = 0.75;

                if (isAffected) {
                    strokeColor = '#ef4444';
                    weight = isBridge ? 5.5 : 3.8;
                    opacity = 0.95;
                } else if (isPossible) {
                    strokeColor = '#f97316';
                    weight = isBridge ? 4.5 : 3.0;
                    opacity = 0.90;
                } else if (isBridge) {
                    strokeColor = '#3b82f6'; // Intact operational bridge
                    weight = 4.0;
                    opacity = 0.90;
                }

                return {
                    color: strokeColor,
                    weight: weight,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: null,
                    opacity: opacity
                };
            },
            onEachFeature: (feature, layer) => {
                const p = feature.properties;
                const isSevered = p.status === 'affected';
                const isPossible = p.status === 'possibly_affected';
                const isBridge = p.osm_type === 'bridge';

                let statusBadge = `<strong style="color:#059669; font-size:13px;">[PASSABLE] OPERATIONAL ${isBridge ? 'BRIDGE' : 'ROUTE'}</strong>`;
                let vehiclePass = `<span style="font-weight:700; color:#059669;">CLEAR / PASSABLE TO ALL VEHICLES</span>`;

                if (isSevered) {
                    statusBadge = `<strong style="color:#dc2626; font-size:13px;">${isBridge ? '[BRIDGE] SEVERED RIVER CROSSING' : '[SEVERED] IMPASSABLE ROAD'}</strong>`;
                    vehiclePass = `<span style="font-weight:700; color:#dc2626;">IMPASSABLE TO AMBULANCES</span>`;
                } else if (isPossible) {
                    statusBadge = `<strong style="color:#d97706; font-size:13px;">${isBridge ? '[BRIDGE] CROSSING AT RISK' : '[CAUTION] WATERLOGGED ROAD'}</strong>`;
                    vehiclePass = `<span style="font-weight:700; color:#d97706;">CAUTION / 4WD ONLY</span>`;
                }

                layer.bindPopup(`
                    <div style="font-size:12px; min-width: 210px;">
                        ${statusBadge}<br>
                        <strong>Name:</strong> ${p.osm_name || (isBridge ? 'River Crossing Bridge' : 'Corridor Road')}<br>
                        <strong>Infrastructure:</strong> ${p.osm_type.toUpperCase()}<br>
                        <strong>Vehicle Passability:</strong> ${vehiclePass}<br>
                        <strong>Submerged Overlap:</strong> ${p.overlap_pct}%<br>
                        <small style="color:#64748b;">Source: OpenStreetMap intersected with satellite radar footprint.</small>
                    </div>
                `);
            }
        });

        const roadsToggle = document.getElementById('toggle-roads');
        if (roadsToggle && roadsToggle.checked) {
            MapLayers.roads.addTo(map);
        }

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
                        <strong style="color:#991b1b; font-size:13px;">[IMPACTED] Structural Flood Damage</strong><br>
                        <strong>Building ID/Name:</strong> ${p.osm_name || p.osm_id}<br>
                        <strong>Status:</strong> <span style="font-weight:700; color:#dc2626;">SUBMERGED / STRUCTURAL THREAT</span><br>
                        <strong>Footprint Inundation:</strong> ${p.overlap_pct}%
                    </div>
                `);
            }
        });

        const bldgToggle = document.getElementById('toggle-buildings');
        if (bldgToggle && bldgToggle.checked) {
            MapLayers.buildings.addTo(map);
        }

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
                const p = feature.properties;
                const isCutoff = p.is_cutoff;
                const isHosp = p.is_hospital || (p.place === 'hospital') || (p.name && (p.name.includes('Hospital') || p.name.includes('Medical')));

                if (isHosp) {
                    return L.marker(latlng, {
                        icon: L.divIcon({
                            className: 'custom-hosp-marker',
                            html: `<div style="background:#2563eb; color:#fff; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.3);">H</div>`,
                            iconSize: [24, 24],
                            iconAnchor: [12, 12]
                        })
                    });
                }

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

                const isHosp = p.is_hospital || (p.place === 'hospital');
                const reason = p.isolation_reason || (p.is_cutoff ? 'corridor_breached' : 'accessible');

                let statusBadge = '';
                let reasonHtml = '';

                if (isHosp) {
                    statusBadge = `<strong style="color:#2563eb; font-size:13px;">🏥 [REGIONAL MEDICAL FACILITY]</strong>`;
                    reasonHtml = `
                        <div style="margin: 4px 0; padding: 4px; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 2px;">
                            <strong>Facility Type:</strong> Hospital / Emergency Medical Base<br>
                            <strong>Role:</strong> Destination medical hub for receiving flood victims.
                        </div>
                    `;
                } else if (p.is_cutoff) {
                    let reasonText = 'Road route to hospital severed downstream by floodwater. Requires airlift.';
                    if (reason === 'direct_flood') {
                        reasonText = 'Village access road physically submerged by floodwater.';
                    } else if (reason === 'remote_mountain') {
                        reasonText = 'High-elevation mountain terrain without pre-existing drivable road connection.';
                    }
                    statusBadge = `<strong style="color:#dc2626; font-size:13px;">🚨 [ISOLATED VILLAGE] AIRLIFT NEEDED</strong>`;
                    reasonHtml = `
                        <div style="margin: 4px 0; padding: 5px; background: #fef2f2; border-left: 3px solid #ef4444; border-radius: 2px;">
                            <strong>Nearest Evacuation Hospital:</strong> ${p.nearest_hospital || 'Emergency Medical Center'}<br>
                            <strong>Road Distance:</strong> ${p.pre_flood_distance_km || '--'} km<br>
                            <strong>Access Status:</strong> <span style="color:#dc2626; font-weight:700;">CANNOT REACH HOSPITAL</span><br>
                            <small style="color:#7f1d1d;"><strong>Reason:</strong> ${reasonText}</small>
                        </div>
                    `;
                } else {
                    statusBadge = `<strong style="color:#16a34a; font-size:13px;">✅ [ACCESSIBLE VILLAGE] ROAD INTACT</strong>`;
                    reasonHtml = `
                        <div style="margin: 4px 0; padding: 5px; background: #f0fdf4; border-left: 3px solid #22c55e; border-radius: 2px;">
                            <strong>Assigned Hospital:</strong> ${p.nearest_hospital || 'District Hospital'}<br>
                            <strong>Route Distance:</strong> ${p.pre_flood_distance_km || '--'} km<br>
                            <strong>Access Status:</strong> <span style="color:#16a34a; font-weight:700;">DRIVABLE GROUND ROUTE INTACT</span>
                        </div>
                    `;
                }

                layer.bindPopup(`
                    <div style="font-size:12px; min-width: 240px; line-height: 1.4;">
                        ${statusBadge}<br>
                        <strong>${isHosp ? 'Hospital Name' : 'Village / Community'}:</strong> ${p.name}<br>
                        ${reasonHtml}
                    </div>
                `);
            }
        });

        const cutoffToggle = document.getElementById('toggle-cutoff');
        if (cutoffToggle && cutoffToggle.checked) {
            MapLayers.cutoff.addTo(map);
        }

        // Populate clickable sidebar list
        const listEl = document.getElementById('settlements-list');
        if (listEl) {
            listEl.innerHTML = '';
            data.features.forEach(f => {
                const p = f.properties;
                const coords = f.geometry.coordinates;
                const isHosp = p.is_hospital || (p.place === 'hospital');
                const li = document.createElement('li');
                li.className = 'settlement-item';
                li.style.cursor = 'pointer';
                li.title = `Click to focus on this ${isHosp ? 'medical facility' : 'community'} on the map`;
                
                let badgeClass = 'status-tag-connected';
                let badgeText = 'CONNECTED';
                if (isHosp) {
                    badgeClass = 'status-tag-hospital';
                    badgeText = 'MEDICAL BASE';
                } else if (p.is_cutoff) {
                    badgeClass = 'status-tag-cutoff';
                    badgeText = 'CUT OFF';
                }

                li.innerHTML = `
                    <span><strong>${p.name}</strong></span>
                    <span class="status-tag ${badgeClass}" style="${isHosp ? 'background:#dbeafe; color:#1e40af; border:1px solid #93c5fd;' : ''}">
                        ${badgeText}
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
                            <strong>Downstream Surge Arrival (ETA):</strong>
                            <div style="max-height:110px; overflow-y:auto; margin-top:3px;">
                                ${p.settlement_etas.map(s => `
                                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                                        <span><strong>${s.name}</strong> (${s.distance_from_origin_km} km)</span>
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
                        <strong style="color:#9333ea; font-size:13px;">[FLOW CORRIDOR] Downhill Gravity Drainage (OSM/D8)</strong><br>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:4px; margin: 5px 0; background:#faf5ff; padding:5px; border-radius:4px; font-size:11px;">
                            <div><strong>Path Length:</strong><br>${p.path_length_km} km</div>
                            <div><strong>Elevation Drop:</strong><br>-${p.elevation_drop_m || '--'} m</div>
                            <div><strong>Headwater Elev:</strong><br>${p.start_elevation_m || '--'} m</div>
                            <div><strong>Surge Velocity:</strong><br>~${p.avg_speed_kmh || '--'} km/h</div>
                        </div>
                        ${etaHtml}
                    </div>
                `);
            }
        });

        const pathToggle = document.getElementById('toggle-path');
        if (pathToggle && pathToggle.checked) {
            MapLayers.path.addTo(map);
        }
    } catch (e) {
        console.warn("Could not load flood path layer:", e);
    }
}
