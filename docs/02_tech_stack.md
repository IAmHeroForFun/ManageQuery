# 02 — Technology Stack
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05

---

## Full Stack at a Glance

```
Backend:    Django 5 + Django REST Framework + Celery + Redis
Processing: rasterio + geopandas + pyroSAR + pysheds + networkx
AI/ML:      PyTorch + segmentation-models-pytorch + google-generativeai
Frontend:   Leaflet.js + leaflet-draw + Vanilla JS + CSS
Database:   SQLite (dev) → PostgreSQL + PostGIS (prod)
PDF Export: weasyprint
```

---

## Backend Layer

| Tool | Version | Purpose | License |
|---|---|---|---|
| **Python** | 3.11+ | Primary language | PSF |
| **Django** | ≥ 5.0 | Web framework — routing, ORM, templates, admin | BSD-3 |
| **Django REST Framework** | ≥ 3.15 | REST API serializers, viewsets, routers | BSD-2 |
| **Celery** | ≥ 5.3 | Distributed task queue for background processing | BSD-3 |
| **Redis** | ≥ 7.0 (server) + redis-py ≥ 5.0 | Celery broker + result backend | BSD-3 / MIT |
| **django-environ** | ≥ 0.11 | `.env` file loading for secrets | MIT |
| **weasyprint** | ≥ 60.0 | Generate PDF situation reports from HTML | BSD-3 |
| **Gunicorn** | ≥ 21.0 | Production WSGI server | MIT |

---

## Satellite & Geospatial Processing Layer

| Tool | Version | Purpose | License |
|---|---|---|---|
| **sentinelsat** | ≥ 1.3 | Download Sentinel-1/2 imagery from Copernicus Data Space | GPL-3 |
| **rasterio** | ≥ 1.3 | Read/write GeoTIFF rasters, reproject, window reads | BSD-3 |
| **numpy** | ≥ 1.26 | Array math for SAR log-ratio, NDWI computation | BSD-3 |
| **scipy** | ≥ 1.11 | Otsu threshold, morphological operations on masks | BSD-3 |
| **geopandas** | ≥ 0.14 | Spatial dataframes — OSM overlay, damage classification | BSD-3 |
| **shapely** | ≥ 2.0 | Geometry operations — intersection, buffering | BSD-3 |
| **pyproj** | ≥ 3.6 | Coordinate reference system transformations | MIT |
| **osmnx** | ≥ 1.8 | Build road network graphs from OSM data | MIT |
| **networkx** | ≥ 3.2 | Graph algorithms — BFS for cut-off settlement analysis | BSD-3 |
| **pysheds** | ≥ 0.4 | D8 flow routing on DEM for flood path tracing | MIT |
| **requests** | ≥ 2.31 | HTTP calls to ohsome API, DEM STAC API | Apache-2 |
| **Pillow** | ≥ 10.0 | Image handling, chip extraction for U-Net | LGPL |

> **Note on SAR preprocessing:** For full SAR preprocessing (orbit file → noise removal → calibration → terrain correction), we use either:
> - **ESA SNAP** + `snappy` Python bindings — full graph processing (recommended if SNAP is installed)
> - **pyroSAR** ≥ 0.23 — Python wrapper around SNAP for programmatic pipelines
>
> SNAP is free but requires a separate install: https://step.esa.int/main/download/snap-download/

---

## AI / Machine Learning Layer

| Tool | Version | Purpose | License |
|---|---|---|---|
| **PyTorch** | ≥ 2.1 | U-Net flood segmentation model training + inference | BSD-3 |
| **torchvision** | ≥ 0.16 | Data transforms for SAR image chips | BSD-3 |
| **segmentation-models-pytorch** | ≥ 0.3 | Pre-built U-Net encoder-decoder architectures | MIT |
| **google-generativeai** | ≥ 0.7 | Gemini 1.5 Flash API for AI situation report generation | Apache-2 |

### Gemini Free Tier Details
- **Model:** `gemini-1.5-flash`
- **API key:** Free from https://aistudio.google.com/app/apikey
- **Free quota:** 15 requests/min, 1 million tokens/day
- **Env variable:** `GEMINI_API_KEY`

---

## Frontend Layer

| Tool | Version | Purpose | CDN / Source |
|---|---|---|---|
| **Leaflet.js** | 1.9.x | Interactive map rendering | CDN: unpkg.com |
| **leaflet-draw** | 1.0.x | AOI rectangle drawing tool | CDN: unpkg.com |
| **Vanilla JS** | ES2022 | Map layer loading, polling, form submission | Native |
| **CSS** | Custom | Dashboard layout, progress bar, stat cards | Static files |

> No React, Vue, or Angular — Leaflet works best with pure JS and keeps the stack simple.

---

## Database Layer

| Environment | Engine | Notes |
|---|---|---|
| **Development** | SQLite | Zero-config, file-based: `db.sqlite3` |
| **Production** | PostgreSQL 15 + PostGIS 3 | Native geospatial column support via `django.contrib.gis` |

---

## Development Tools

| Tool | Version | Purpose |
|---|---|---|
| **pytest** | ≥ 7.4 | Test runner |
| **pytest-django** | ≥ 4.7 | Django test fixtures + DB support |
| **factory-boy** | ≥ 3.3 | Test data factories for models |
| **black** | ≥ 23.0 | Code formatter |
| **flake8** | ≥ 6.0 | Linter |
| **python-dotenv** | via django-environ | Load `.env` secrets |

---

## Full `requirements.txt`

```txt
# ── Web Framework ─────────────────────────────────────────────────
django>=5.0
djangorestframework>=3.15
django-environ>=0.11

# ── Background Tasks ──────────────────────────────────────────────
celery>=5.3
redis>=5.0

# ── Satellite Data ────────────────────────────────────────────────
sentinelsat>=1.3

# ── Raster / GIS ──────────────────────────────────────────────────
rasterio>=1.3
numpy>=1.26
scipy>=1.11
geopandas>=0.14
shapely>=2.0
pyproj>=3.6
osmnx>=1.8
networkx>=3.2
pysheds>=0.4
requests>=2.31
Pillow>=10.0

# ── AI / ML ───────────────────────────────────────────────────────
google-generativeai>=0.7
torch>=2.1
torchvision>=0.16
segmentation-models-pytorch>=0.3

# ── PDF Export ────────────────────────────────────────────────────
weasyprint>=60.0

# ── Production ────────────────────────────────────────────────────
gunicorn>=21.0

# ── Dev / Testing ─────────────────────────────────────────────────
pytest>=7.4
pytest-django>=4.7
factory-boy>=3.3
black>=23.0
flake8>=6.0
```

---

## External Services / APIs

| Service | Purpose | Auth | Cost |
|---|---|---|---|
| **Copernicus Data Space** | Sentinel-1/2 download | Free account | Free |
| **ohsome API** (ohsome.org) | OSM pre-event snapshot | None | Free |
| **DEM STAC API** (copernicus.eu) | Copernicus DEM 30m | None | Free |
| **Google AI Studio** | Gemini 1.5 Flash LLM | Free API key | Free (15 RPM) |
| **Copernicus EMS** | EMSR927 reference (validation only) | None | Free |

---

## Why This Stack?

| Decision | Rationale |
|---|---|
| **Django (not Flask/FastAPI)** | Built-in admin, ORM, auth, templating — everything needed without extra setup |
| **DRF** | Most mature REST framework for Django; great serializers + viewsets |
| **Celery + Redis** | Satellite downloads take 10–30 min — background tasks are essential. Redis is lightweight. |
| **rasterio (not GDAL directly)** | Pythonic API over GDAL; handles GeoTIFF natively |
| **geopandas (not raw shapely)** | DataFrame-style spatial operations — much easier for OSM overlay |
| **osmnx** | Builds NetworkX road graphs directly from OSM without needing a local DB |
| **pysheds** | Pure Python D8 flow routing — no C extensions or GRASS needed |
| **Leaflet.js** | Best-in-class open source web mapping library; works perfectly with GeoJSON |
| **Gemini 1.5 Flash** | Free tier, 1M tokens/day, fast inference, no local GPU required |
| **SQLite → PostGIS** | SQLite for zero-config dev; PostGIS for production geospatial queries |
