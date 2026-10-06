/**
 * Base Map Initializer for Leaflet
 * Uses CartoDB Voyager and ESRI World Imagery to ensure compliance
 * with web application tile policies without 403 Forbidden errors.
 */
function initLeafletMap(containerId, centerCoords = [28.25, 85.35], zoomLevel = 10) {
    const map = L.map(containerId, {
        zoomControl: true,
        attributionControl: true
    }).setView(centerCoords, zoomLevel);

    // ESRI World Street Map (Guaranteed 100% reliable, zero API key required, crisp roads & labels)
    const esriStreet = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ'
    }).addTo(map);

    // OpenTopoMap (Topographic contours & rivers, zero API key required)
    const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        subdomains: 'abc',
        attribution: 'Map: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://opentopomap.org">OpenTopoMap</a>'
    });

    // ESRI World Imagery (High-res satellite imagery)
    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
    });

    // CartoDB Voyager (Optional CARTO basemap)
    const cartoVoyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    });

    const baseMaps = {
        "Street Map (ESRI)": esriStreet,
        "Topographic Map (OpenTopo)": openTopo,
        "Satellite Imagery": esriSatellite,
        "CartoDB Streets": cartoVoyager
    };

    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);

    // Ensure map tiles calculate correct pixel bounding dimensions upon render
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

    window.addEventListener('resize', () => {
        map.invalidateSize();
    });

    return map;
}
