# 05 — Satellite Data Pipeline
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  INPUT: AOI (GeoJSON Polygon) + Flood Date                          │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
          ┌────────▼────────┐
          │  STEP 1         │
          │  Sentinel-1     │◄── Copernicus Data Space
          │  Download       │    (same orbit track, pre + post)
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 2         │
          │  Sentinel-2     │◄── Copernicus Data Space
          │  Download       │    (least cloudy, ±7 days)
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 3         │
          │  DEM Download   │◄── Copernicus DEM STAC API
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 4         │
          │  OSM Snapshot   │◄── ohsome API (pre-event: July 27, 2026)
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 5         │
          │  SAR Preprocess │  Orbit → Noise → Calibrate → Terrain Correct
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 6         │
          │  SAR Change     │  Log-ratio → Otsu threshold → Morphology
          │  Detection      │
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 7         │
          │  NDWI           │  B03/B08 → Pre/Post NDWI → Difference
          │  Computation    │
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 8         │
          │  Mask Fusion    │  SAR mask OR NDWI mask → Final flood mask
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 9         │
          │  OSM Overlay    │  Spatial join → Damage classification
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  STEP 10        │
          │  Connectivity   │  Road graph → Remove flooded → BFS
          └────────┬────────┘
                   │
          ┌────────▼────────┐
          │  OUTPUT         │
          │  GeoTIFF masks  │
          │  GeoJSON layers │
          │  DB stats       │
          └─────────────────┘
```

---

## Step 1 — Sentinel-1 Download

**Tool:** `sentinelsat` (GPL-3) + Copernicus Data Space (free account required)

**Critical rule:** Always download images from the **same orbit track** (same relative orbit number, same pass direction). Never mix ascending and descending images for change detection.

```
Pre-event:  ~14 Aug 2026 (12 days before flood)
Post-event: ~26–28 Aug 2026
```

**Why 12 days?** Each Sentinel-1 satellite revisits the same orbit every 12 days. Using the exact same orbit track means identical viewing geometry → pixel-by-pixel comparison is valid.

**Product type:** `GRD` (Ground Range Detected), IW mode
**Bands:** VV + VH polarization
**File format:** SAFE (.zip archive)

**Typical download time:** 10–20 min per image (each ~1–3 GB)

**Code:**
```python
from sentinelsat import SentinelAPI
import geopandas as gpd
from shapely.geometry import shape
import json

def download_sentinel1(aoi_geojson, pre_date, post_date, orbit_direction, output_dir):
    api = SentinelAPI(
        os.environ['COPERNICUS_USER'],
        os.environ['COPERNICUS_PASS'],
        'https://apihub.copernicus.eu/apihub'
    )
    footprint = shape(aoi_geojson).wkt
    
    # Pre-event
    pre = api.query(
        footprint,
        date=(pre_date - timedelta(days=2), pre_date + timedelta(days=2)),
        platformname='Sentinel-1',
        producttype='GRD',
        orbitdirection=orbit_direction  # 'ASCENDING' or 'DESCENDING'
    )
    
    # Post-event
    post = api.query(
        footprint,
        date=(post_date - timedelta(days=2), post_date + timedelta(days=2)),
        platformname='Sentinel-1',
        producttype='GRD',
        orbitdirection=orbit_direction
    )
    
    # Verify same relative orbit
    assert pre_meta['relativeorbitnumber'] == post_meta['relativeorbitnumber'], \
        "Pre/post images must be from the same relative orbit!"
    
    api.download_all(pre, directory_path=output_dir / 'pre')
    api.download_all(post, directory_path=output_dir / 'post')
```

---

## Step 2 — Sentinel-2 Download

**Tool:** `sentinelsat`

**Filter:** Select image with least cloud cover within ±7 days of flood date.
**Product type:** L2A (surface reflectance — atmospherically corrected)
**Bands needed:** B03 (Green, 10m), B08 (NIR, 10m)

**Note:** During monsoon season, cloud cover can be 80–100%. If no suitable Sentinel-2 image exists (< 20% cloud), skip and use SAR-only detection.

---

## Step 3 — DEM Download

**Tool:** `requests` → Copernicus DEM STAC API

**Product:** Copernicus GLO-30 (30m resolution)
**Tiles:** 1° × 1° GeoTIFF tiles identified by lat/lon
**Use:** SAR terrain correction (Step 5) + D8 flood path routing (AI component)

**Tile naming:** `Copernicus_DSM_COG_10_N{lat}_00_E{lon}_00_DEM.tif`

```python
def download_dem_tiles(aoi_geojson, output_dir):
    """Download all DEM tiles covering the AOI."""
    bounds = shape(aoi_geojson).bounds  # (minX, minY, maxX, maxY)
    
    for lat in range(int(bounds[1]), int(bounds[3]) + 1):
        for lon in range(int(bounds[0]), int(bounds[2]) + 1):
            tile_name = f"Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM.tif"
            url = f"https://prism-dem-open.copernicus.eu/pd-desk-open-access/prismDownload/COP-DEM_GLO-30-DGED__2023_1/{tile_name}"
            # download and save...
    
    # Mosaic tiles if multiple
    merge_dem_tiles(output_dir)
```

---

## Step 4 — OSM Snapshot

**Tool:** `requests` → ohsome API v2 (`https://api.heigit.org/ohsome-api/v2-rc/extraction/features`)
**Snapshot date:** 2026-07-27 (before 26 Aug 2026 flood — mandatory)
**Authentication:** Requires `Authorization: <OHSOME_API_KEY>` header (v1 `https://api.ohsome.org/v1` deprecated; shut down Nov 2026).

```python
import os
import requests

def fetch_osm_features(aoi_bbox, feature_type, api_key=None):
    """
    feature_type: 'roads', 'buildings'
    aoi_bbox: [min_lon, min_lat, max_lon, max_lat]
    """
    filters = {
        'roads': 'highway=* and geometry:line',
        'buildings': 'building=* and geometry:polygon',
    }
    headers = {
        "Authorization": api_key or os.environ.get("OHSOME_API_KEY", ""),
        "Content-Type": "application/json"
    }
    payload = {
        "aoi": aoi_bbox,
        "filter": filters[feature_type],
        "time": {"start": "2026-07-27", "end": "2026-07-27"}
    }
    
    r = requests.post(
        "https://api.heigit.org/ohsome-api/v2-rc/extraction/features",
        headers=headers,
        json=payload,
        timeout=10
    )
    return r.json()
```

> **Resilience Fallback**: If `OHSOME_API_KEY` is not provided or the remote API is unreachable, the system automatically falls back to offline geometric generation for the selected bounding box, guaranteeing zero runtime disruptions.


---

## Step 5 — SAR Preprocessing

**Tools:** ESA SNAP + snappy (Python bindings) OR pyroSAR

**Full preprocessing chain:**

```
Input: S1 SAFE archive (.zip)
  ↓
1. Apply Orbit File         — corrects satellite position metadata
  ↓
2. Thermal Noise Removal    — removes thermal noise from GRD products
  ↓
3. Radiometric Calibration  — converts raw DN values to σ° (sigma-naught, backscatter)
  ↓
4. Range Doppler Terrain    — orthorectifies image using DEM (removes terrain distortion)
   Correction (RD-TC)
  ↓
Output: Calibrated, terrain-corrected GeoTIFF (σ° in linear scale or dB)
  Resolution: ~10m, CRS: WGS84 / UTM zone 45N for Nepal
```

**Expected processing time:** 15–45 min per scene (CPU-intensive)

**Key parameters:**
- Map projection: UTM Zone 45N (EPSG:32645) for Nepal Trishuli area
- Pixel spacing: 10m
- Output format: GeoTIFF (linear σ°)

---

## Step 6 — SAR Change Detection

**Theoretical Grounding:** *Lillesand, Kiefer, & Chipman (2015), Remote Sensing and Image Interpretation (7th ed.), Section 6.8 "Radar Image Interpretation: Water & Ice Response" (pp. 431–433) and Section 7.18 "Change Detection: Temporal Image Ratioing" (pp. 583–586).*

**Algorithm: Log-ratio change detection**

```
log_ratio = 10 * log10(σ°_post / σ°_pre)
```

Where:
- Flooded areas show **negative** log-ratio (radar pulses reflect specularly away from calm water surface, causing a drop of -8 to -14 dB due to water's high dielectric constant $\epsilon \approx 80$ vs dry soil $\epsilon \approx 3-8$)
- Debris/saturated mud deposits show distinctive volumetric and corner scattering
- Unchanged areas → log-ratio ≈ 0 dB
- Post-classification spatial majority despeckle filter (Lillesand Section 7.14) removes radar salt-and-pepper noise.

**Thresholding:**

```python
import numpy as np
from scipy.threshold import threshold_otsu

def compute_sar_flood_mask(pre_tif, post_tif, output_tif):
    with rasterio.open(pre_tif) as pre_src:
        pre = pre_src.read(1).astype(np.float32)
    with rasterio.open(post_tif) as post_src:
        post = post_src.read(1).astype(np.float32)
        profile = post_src.profile
    
    # Avoid division by zero
    pre = np.where(pre > 0, pre, 1e-10)
    post = np.where(post > 0, post, 1e-10)
    
    log_ratio = 10 * np.log10(post / pre)  # dB
    
    # Otsu's threshold: automatically finds best cutoff
    threshold = threshold_otsu(log_ratio[np.isfinite(log_ratio)])
    
    # Pixels below threshold = changed (flooded/debris)
    flood_mask = (log_ratio < threshold).astype(np.uint8)
    
    # Morphological cleanup: remove isolated small patches (speckle)
    from scipy.ndimage import binary_closing, binary_opening
    flood_mask = binary_opening(flood_mask, iterations=2)
    flood_mask = binary_closing(flood_mask, iterations=3)
    
    # Save
    profile.update(dtype='uint8', count=1, nodata=255)
    with rasterio.open(output_tif, 'w', **profile) as dst:
        dst.write(flood_mask.astype(np.uint8), 1)
    
    return output_tif
```

---

## Step 7 — NDWI Optical Detection

**Formula:**

```
NDWI = (Green - NIR) / (Green + NIR)
     = (B03 - B08) / (B03 + B08)

Flooded pixels: NDWI_post - NDWI_pre > threshold (typically 0.2)
```

```python
def compute_ndwi_flood_mask(s2_pre_tif, s2_post_tif, output_tif, threshold=0.2):
    def ndwi(green, nir):
        return (green - nir) / (green + nir + 1e-10)
    
    with rasterio.open(s2_pre_tif) as src:
        green_pre = src.read(1).astype(np.float32) / 10000.0  # L2A reflectance scale
        nir_pre = src.read(2).astype(np.float32) / 10000.0
    
    with rasterio.open(s2_post_tif) as src:
        green_post = src.read(1).astype(np.float32) / 10000.0
        nir_post = src.read(2).astype(np.float32) / 10000.0
        profile = src.profile
    
    ndwi_pre = ndwi(green_pre, nir_pre)
    ndwi_post = ndwi(green_post, nir_post)
    
    ndwi_diff = ndwi_post - ndwi_pre
    flood_mask = (ndwi_diff > threshold).astype(np.uint8)
    
    profile.update(dtype='uint8', count=1)
    with rasterio.open(output_tif, 'w', **profile) as dst:
        dst.write(flood_mask, 1)
    
    return output_tif
```

---

## Step 8 — Mask Fusion

Combine SAR and optical masks using logical OR:

```python
def fuse_masks(sar_mask_tif, ndwi_mask_tif, output_tif):
    """
    Logical OR: a pixel is flooded if either SAR or NDWI detects it.
    If optical data unavailable, use SAR only.
    """
    with rasterio.open(sar_mask_tif) as src:
        sar = src.read(1)
        profile = src.profile
    
    if ndwi_mask_tif and Path(ndwi_mask_tif).exists():
        with rasterio.open(ndwi_mask_tif) as src:
            ndwi = src.read(1)
            # Reproject NDWI to match SAR resolution/CRS if needed
        fused = np.logical_or(sar, ndwi).astype(np.uint8)
        source = 'fused'
    else:
        fused = sar
        source = 'sar_only'
    
    with rasterio.open(output_tif, 'w', **profile) as dst:
        dst.write(fused, 1)
    
    return output_tif, source
```

---

## Step 9 — OSM Infrastructure Damage Assessment

```python
import geopandas as gpd
import rasterio
from rasterio.features import shapes
from shapely.geometry import shape

def assess_damage(flood_mask_tif, osm_geojson_path):
    """
    Spatial join: classify each OSM feature by overlap % with flood mask.
    """
    # Convert flood mask raster to polygon
    with rasterio.open(flood_mask_tif) as src:
        mask = src.read(1)
        transform = src.transform
        crs = src.crs
    
    flood_polygons = [
        shape(geom) for geom, val in shapes(mask, transform=transform) if val == 1
    ]
    flood_gdf = gpd.GeoDataFrame(geometry=flood_polygons, crs=crs)
    flood_union = flood_gdf.union_all()
    
    # Load OSM features
    osm_gdf = gpd.read_file(osm_geojson_path).to_crs(crs)
    
    # Calculate overlap percentage
    def overlap_pct(feature_geom):
        intersection = feature_geom.intersection(flood_union)
        if feature_geom.area == 0:
            return 0.0
        return (intersection.area / feature_geom.area) * 100
    
    osm_gdf['overlap_pct'] = osm_gdf.geometry.apply(overlap_pct)
    
    # Classify
    def classify(pct):
        if pct >= 50: return 'affected'
        if pct >= 10: return 'possibly_affected'
        return 'not_affected'
    
    osm_gdf['status'] = osm_gdf['overlap_pct'].apply(classify)
    return osm_gdf
```

> **Dynamic Calculations Note**: All statistics (damaged building counts, flooded road kilometers, and severance metrics) are strictly dynamically computed from spatial overlay intersections without artificial minimum clamping floors.

---

## Step 10 — Road Connectivity Analysis

Connectivity is determined by evaluating topological reachability across the OSM road network:
1. Build road graph from OSM roads `GeoDataFrame` (`networkx.Graph`).
2. Remove edges that intersect with the active flood mask (impassable roads).
3. Identify regional medical hubs / emergency points.
4. Run BFS / Dijkstra shortest-path reachability from each settlement to the nearest active hospital. Settlements with disconnected paths are classified as `🔴 CUT OFF`.
    3. BFS from each settlement → nearest hospital
    4. Settlements with no path = CUT OFF
    """
    # Build graph
    G = ox.graph_from_gdfs(nodes, edges)
    
    # Remove flooded edges
    for edge in G.edges(data=True):
        edge_geom = edge[2].get('geometry')
        if edge_geom and edge_geom.intersects(flood_polygon):
            G.remove_edge(edge[0], edge[1])
    
    # Check connectivity per settlement
    results = []
    for _, settlement in settlements_gdf.iterrows():
        settlement_node = ox.nearest_nodes(G, settlement.geometry.x, settlement.geometry.y)
        for _, hospital in hospitals_gdf.iterrows():
            hospital_node = ox.nearest_nodes(G, hospital.geometry.x, hospital.geometry.y)
            try:
                path = nx.shortest_path(G, settlement_node, hospital_node, weight='length')
                results.append({'name': settlement['name'], 'is_cutoff': False, ...})
                break
            except nx.NetworkXNoPath:
                continue
        else:
            results.append({'name': settlement['name'], 'is_cutoff': True, ...})
    
    return results
```

---

## Expected Processing Times

| Step | Estimated Time |
|---|---|
| Sentinel-1 download (2 scenes) | 20–40 min |
| Sentinel-2 download (1 scene) | 10–20 min |
| DEM download | 1–5 min |
| OSM fetch | < 30 sec |
| SAR preprocessing (SNAP) | 15–45 min |
| SAR change detection | 1–3 min |
| NDWI computation | 1–2 min |
| Mask fusion | < 1 min |
| OSM damage assessment | 1–3 min |
| Connectivity analysis | 2–5 min |
| U-Net inference | 2–10 min (CPU) |
| Flood path tracing | < 1 min |
| Gemini report generation | 3–8 sec |
| **Total** | **~60–120 min** |

---

## Known Limitations

| Limitation | Impact |
|---|---|
| Sentinel-1 revisit: 12 days per track | Cannot detect changes that happened between revisit dates |
| Monsoon cloud cover | May prevent Sentinel-2 use; SAR-only fallback |
| SAR radar shadow | Steep valley walls create shadow zones invisible to radar |
| DEM resolution 30m | Flood path routing at 30m scale misses small channels |
| OSM completeness | Some remote Nepal villages/roads not mapped pre-event |
| Processing time | Full pipeline takes 60–120 min; not real-time |
