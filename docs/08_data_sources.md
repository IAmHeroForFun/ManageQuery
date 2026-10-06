# 08 — Data Sources
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05
> ⚠️ READ CAREFULLY — violating data rules leads to **disqualification**

---

## Data Rules (Competition)

### ✅ Allowed as Inputs

| Dataset | Use |
|---|---|
| Sentinel-1 SAR imagery | Before/after flood detection |
| Sentinel-2 optical imagery | Cloud-free optical change detection (NDWI) |
| Copernicus DEM 30m | Terrain correction, flood path tracing, elevation |
| OpenStreetMap (pre-event snapshot, before 26 Aug 2026) | Buildings, roads, bridges |
| Kuro Siwo dataset | Training data for U-Net segmentation model |
| Sen1Floods11 dataset | Additional training data (optional) |

### ❌ NOT Allowed as Inputs

| Dataset | Why Banned |
|---|---|
| Copernicus EMS / EMSR927 maps | Published damage maps — checking/validation only |
| UNOSAT damage maps | Published damage maps — checking/validation only |
| OpenStreetMap edits made **after** 26 Aug 2026 | Post-event OSM reflects community damage mapping |

> **Breaking any of these rules = immediate disqualification.**

---

## Dataset Details

---

### 1. Sentinel-1 SAR (Primary — Flood Detection)

| Field | Value |
|---|---|
| **URL** | https://dataspace.copernicus.eu |
| **Product type** | GRD (Ground Range Detected), IW (Interferometric Wide) swath |
| **Bands** | VV + VH polarization |
| **Resolution** | ~10m (after terrain correction) |
| **Revisit time** | 6 days (with both satellites), 12 days per orbit track |
| **License** | Copernicus free, full and open data policy |
| **Auth** | Free registration at dataspace.copernicus.eu |
| **File format** | SAFE (.zip) |
| **Attribution** | "Contains modified Copernicus Sentinel data 2026." |

**How to download:**
```python
from sentinelsat import SentinelAPI
api = SentinelAPI('username', 'password', 'https://apihub.copernicus.eu/apihub')
products = api.query(
    footprint,
    date=('20260814', '20260820'),
    platformname='Sentinel-1',
    producttype='GRD'
)
api.download_all(products)
```

**Critical rule:** Always use images from the **same orbit track** (ascending or descending, same relative orbit number). Images from different tracks view terrain at different angles and **cannot be compared pixel-by-pixel**.

**Recommended pairs for Trishuli:**
- Pre-event: ~14 August 2026 (12 days before)
- Post-event: ~26–28 August 2026 (same orbit track)

---

### 2. Sentinel-2 Optical (Secondary — NDWI)

| Field | Value |
|---|---|
| **URL** | https://dataspace.copernicus.eu |
| **Product type** | L2A (atmospherically corrected, surface reflectance) |
| **Bands used** | B03 (Green, 560nm), B08 (NIR, 842nm) for NDWI |
| **Resolution** | 10m (B03, B08) |
| **Revisit time** | 5 days (both satellites) |
| **Cloud issue** | Monsoon season = frequent cloud cover; use only scenes < 20% cloud |
| **License** | Copernicus free, full and open data policy |
| **File format** | SAFE (.zip) |

**Note:** Sentinel-2 may be unavailable for post-flood dates due to monsoon clouds. In that case, fall back to SAR-only detection.

---

### 3. Copernicus DEM 30m

| Field | Value |
|---|---|
| **URL** | https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model |
| **Resolution** | 30m (GLO-30) |
| **CRS** | WGS84 (EPSG:4326) |
| **Format** | GeoTIFF, tiles by 1° × 1° |
| **License** | Free under Copernicus licence (attribution required) |
| **Use** | SAR terrain correction, D8 flood path routing, hydrological analysis |
| **Attribution** | "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved." |

**How to download (STAC API):**
```python
import requests

# Example: tile covering Trishuli area
tile_url = "https://prism-dem-open.copernicus.eu/pd-desk-open-access/prismDownload/COP-DEM_GLO-30-DGED__2023_1/Copernicus_DSM_COG_10_N28_00_E085_00_DEM.tif"
r = requests.get(tile_url)
with open("dem_N28_E085.tif", "wb") as f:
    f.write(r.content)
```

---

### 4. OpenStreetMap — Pre-event Snapshot (ohsome API v2)

| Field | Value |
|---|---|
| **URL** | https://api.heigit.org/ohsome-api/v2-rc/ (v1 `https://api.ohsome.org/v1` deprecated Nov 2026) |
| **Authentication** | Mandatory `Authorization: <OHSOME_API_KEY>` (Free signup via HeiGIT dashboard) |
| **Snapshot date** | Must be **before 26 August 2026** — use **27 July 2026** |
| **Features needed** | Buildings (`building=* and geometry:polygon`), roads (`highway=* and geometry:line`), bridges (`bridge=yes`) |
| **License** | ODbL (Open Database Licence) |
| **Attribution** | "© OpenStreetMap contributors." |
| **Output format** | GeoJSON / GeoParquet |

**How to fetch:**
```python
import os
import requests

headers = {
    "Authorization": os.environ.get("OHSOME_API_KEY", ""),
    "Content-Type": "application/json"
}
payload = {
    "aoi": [85.2, 28.1, 85.6, 28.5],  # [minLon, minLat, maxLon, maxLat]
    "filter": "highway=* and geometry:line",
    "time": {"start": "2026-07-27", "end": "2026-07-27"}
}
r = requests.post(
    "https://api.heigit.org/ohsome-api/v2-rc/extraction/features",
    headers=headers,
    json=payload
)
roads_geojson = r.json()
```

> **Offline / Unauthenticated Fallback:** If `OHSOME_API_KEY` is not provided, the local system synthesizes vector infrastructure directly within the bounding box so processing proceeds uninterrupted.


**Important:** A modified version of the OSM data, if published, must stay under ODbL.

---

### 5. Kuro Siwo — Training Dataset (U-Net)

| Field | Value |
|---|---|
| **URL** | https://github.com/Orion-AI-Lab/KuroSiwo |
| **Purpose** | Training data for U-Net flood segmentation model |
| **Content** | Sentinel-1 SAR image chips labeled as: water, debris, background |
| **License** | **MIT License** (NeurIPS 2024 paper) |
| **Citation** | Bountos et al., 2024 — NeurIPS 2024 |
| **Required credit** | "Training data: Bountos et al., 2024 (Kuro Siwo, MIT License)." |
| **Coverage** | Global flood events, including Asian river corridors |

**How to download:**
```bash
git clone https://github.com/Orion-AI-Lab/KuroSiwo
cd KuroSiwo
# Follow README for dataset download instructions
```

---

### 6. Sen1Floods11 — Optional Training Dataset

| Field | Value |
|---|---|
| **URL** | https://github.com/cloudtostreet/Sen1Floods11 |
| **Purpose** | Optional additional training data for U-Net |
| **Content** | Sentinel-1 chips with flood labels across 11 flood events |
| **License** | CC BY 4.0 (fine for non-commercial educational use) |
| **Citation** | Bonafilia et al., CVPR Workshops 2020 |
| **Note** | Original repo has no license file; mirrors list CC BY 4.0 |

---

### 7. Copernicus EMS — EMSR927 (VALIDATION ONLY)

| Field | Value |
|---|---|
| **URL** | https://mapping.emergency.copernicus.eu |
| **Activation** | EMSR927 — August 2026 Trishuli flood |
| **Purpose** | **Validation and comparison only — NEVER as model input** |
| **Content** | Official damage maps, flood extent polygons, affected buildings |
| **License** | Free of charge |
| **Attribution** | "European Union, Copernicus Emergency Management Service data" |

---

## Required Attribution (Copy-Paste for Submissions)

Include in **every submission** — report, README, and dashboard footer:

```
Contains modified Copernicus Sentinel data 2026.

Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and
© Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS
by the European Union and ESA; all rights reserved.

© OpenStreetMap contributors.

Training data: Bountos et al., 2024 (Kuro Siwo, MIT License).
NeurIPS 2024. https://github.com/Orion-AI-Lab/KuroSiwo
```

---

## Data Download Checklist

Before starting code:
- [ ] Register at https://dataspace.copernicus.eu (free)
- [ ] Get Google AI Studio API key at https://aistudio.google.com/app/apikey (free)
- [ ] Clone Kuro Siwo repo and download training data
- [ ] Download Copernicus DEM tiles for Trishuli area (N28/E085, N28/E084, N27/E085)
- [ ] Test ohsome API with a small Trishuli bounding box

---

## Trishuli AOI Reference Coordinates

```
Bounding box (approximate corridor):
  Min Lon: 85.1  Max Lon: 85.7
  Min Lat: 27.8  Max Lat: 28.5

Copernicus DEM tiles needed:
  N28_E085, N28_E084, N27_E085, N27_E084

Sentinel-1 orbit track: Check Sentinel-1 observation scenario
  for Nepal (ascending + descending available)
```
