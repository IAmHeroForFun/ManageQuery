# 01 — System Architecture
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05

---

## Overview

The system is a **Django-based full-stack web application** with a Celery background worker for heavy satellite processing. The frontend is a Leaflet.js dashboard served via Django templates.

```
User Browser ──→ Django REST API ──→ Celery Worker ──→ Satellite APIs
                      │                    │
                      ↓                    ↓
                  SQLite/PG ←────── Processing Pipeline
                      │
                      ↓
              Leaflet.js Dashboard
```

---

## Full System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
│  ┌──────────────┐   ┌─────────────────┐   ┌───────────────────┐ │
│  │ AOI Selector │   │  Live Dashboard  │   │  Situation Report │ │
│  │ (Leaflet Draw│   │  (Leaflet.js +   │   │  (Gemini output)  │ │
│  │  + form)     │   │   Vanilla JS)    │   │                   │ │
│  └──────┬───────┘   └────────┬────────┘   └─────────┬─────────┘ │
└─────────┼────────────────────┼──────────────────────┼───────────┘
          │  HTTP/REST          │  HTTP polling/REST   │ HTTP/REST
          ▼                    ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    DJANGO REST API (Port 8000)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │  Analysis   │  │  GeoJSON     │  │  Situation Report     │   │
│  │  ViewSet    │  │  Views       │  │  View                 │   │
│  └──────┬──────┘  └──────────────┘  └───────────────────────┘   │
│         │ dispatch task                                          │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              CELERY TASK QUEUE (Redis broker)               │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CELERY WORKER (Background)                     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Satellite   │  │ SAR/Optical  │  │ Infrastructure       │   │
│  │  Downloader  │  │ Processor    │  │ Damage Assessor      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌──────────▼───────────┐   │
│  │ Copernicus   │  │ Flood/Debris │  │ Connectivity         │   │
│  │ Data Space   │  │ Mask (fused) │  │ Analyzer (graph BFS) │   │
│  │ ohsome API   │  └──────────────┘  └──────────────────────┘   │
│  │ DEM STAC API │                                                │
│  └──────────────┘  ┌──────────────┐  ┌──────────────────────┐   │
│                    │ U-Net Flood  │  │ Flood Path Tracer    │   │
│                    │ Segmentation │  │ (D8 DEM routing)     │   │
│                    └──────────────┘  └──────────────────────┘   │
│                                                                  │
│                    ┌──────────────────────────┐                  │
│                    │ Gemini AI Report Copilot │                  │
│                    │ (gemini-1.5-flash API)   │                  │
│                    └──────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
          │ save results
          ▼
┌────────────────────────┐     ┌──────────────────────────────┐
│  DATABASE              │     │  FILE SYSTEM (media/)        │
│  SQLite (dev)          │     │  GeoTIFF rasters             │
│  PostgreSQL+PostGIS    │     │  GeoJSON exports             │
│  (prod)                │     │  U-Net weights (.pth)        │
└────────────────────────┘     └──────────────────────────────┘
```

---

## Component Responsibilities

| Component | Technology | Responsibility |
|---|---|---|
| **Django REST API** | Django 5 + DRF | HTTP routing, request validation, response serialization, task dispatch |
| **Celery Worker** | Celery 5 + Redis | Background satellite processing, progress tracking |
| **Redis** | Redis 7 | Celery message broker + result backend |
| **Satellite Downloader** | sentinelsat + requests | Download Sentinel-1/2 SAFE archives, Copernicus DEM tiles |
| **SAR Processor** | rasterio + numpy + scipy | SAR preprocessing, log-ratio change detection, Otsu threshold |
| **Optical Processor** | rasterio + numpy | NDWI computation, optical flood detection |
| **Mask Fusion** | numpy | Logical OR merge of SAR + optical masks |
| **OSM Fetcher** | requests (ohsome API) | Fetch pre-event buildings, roads, bridges as GeoJSON |
| **Damage Assessor** | geopandas + shapely | Spatial intersection of flood mask with OSM features |
| **Connectivity Analyzer** | osmnx + networkx | Road graph construction, flood edge removal, BFS cut-off detection |
| **U-Net Segmentation** | PyTorch + segmentation-models-pytorch | Trained model inference on Sentinel-1 chips |
| **Flood Path Tracer** | pysheds | D8 flow routing on DEM from upstream source point |
| **Gemini Copilot** | google-generativeai | Generate situation report from structured stats dict |
| **Leaflet.js Dashboard** | Leaflet.js + leaflet-draw + Vanilla JS | Interactive map, layer control, progress polling, AOI drawing |
| **Database** | SQLite (dev) / PostgreSQL+PostGIS (prod) | Persist analysis jobs, results, reports |
| **File Storage** | Local filesystem (media/) | GeoTIFF rasters, processed GeoJSONs |

---

## Data Flow — Full Request Lifecycle

```
1. USER draws AOI rectangle on Leaflet map + picks flood date
2. Browser POSTs to /api/analysis/ { aoi, flood_date, options }
3. Django creates AnalysisJob(status="queued") in DB
4. Django returns { job_id, status: "queued" } to browser
5. Django dispatches run_flood_analysis.delay(job_id) to Celery via Redis

6. CELERY WORKER picks up task:
   6a. Download Sentinel-1 pre/post (same orbit track, 12 days apart)
   6b. Download Sentinel-2 (least cloudy in ±7 day window)
   6c. Download Copernicus DEM for AOI
   6d. Fetch OSM snapshot from ohsome API (pre-event: before 26 Aug 2026)
   6e. Preprocess SAR → compute log-ratio → Otsu threshold → flood mask
   6f. Compute NDWI pre/post → difference → optical flood mask
   6g. Fuse SAR + optical masks → final flood/debris mask (GeoTIFF + GeoJSON)
   6h. Spatial join flood mask with OSM features → damage classification
   6i. Build road graph, remove flooded edges → BFS → cut-off settlements
   6j. U-Net inference on Sentinel-1 post chips → segmentation GeoTIFF
   6k. D8 flow routing on DEM from source point → flood path GeoJSON
   6l. Save all results to DB + media/ directory
   6m. Update AnalysisJob(status="completed")

7. BROWSER polls GET /api/analysis/{id}/ every 3 seconds
   → progress % and current_step displayed in UI

8. On status="completed":
   → Browser fetches GeoJSON layers one by one
   → Adds each as a Leaflet layer with color coding
   → Summary stats panel populates

9. USER clicks "Generate Situation Report"
   → POST /api/analysis/{id}/report/
   → Celery (or sync) calls Gemini API with structured stats
   → Report text returned and displayed
   → User can download as PDF (weasyprint)
```

---

## Inter-Service Communication

| Connection | Protocol | Details |
|---|---|---|
| Browser → Django | HTTP REST | JSON request/response, GeoJSON for map layers |
| Django → Celery | Redis (AMQP-style) | Task dispatch with job_id argument |
| Celery → Copernicus DS | HTTPS | sentinelsat library (OData API) |
| Celery → ohsome API | HTTPS | REST GET with GeoJSON body |
| Celery → Gemini API | HTTPS | google-generativeai SDK |
| Django → DB | SQLite/PostgreSQL | Django ORM |
| Browser polling | HTTP GET | Every 3s until status=completed |

---

## Deployment Architecture

### Local Development
```
Terminal 1: python manage.py runserver --settings=config.settings.local
Terminal 2: celery -A config.celery worker --loglevel=info
Terminal 3: redis-server
```

### Production (Future)
```
Nginx → Gunicorn (Django) → PostgreSQL/PostGIS
                         → Redis → Celery workers (2+)
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Background processing | Celery + Redis | Non-blocking — satellite downloads take 10–30 min |
| Progress updates | Browser polling (3s) | Simple, no WebSocket complexity needed |
| Flood mask storage | GeoTIFF + GeoJSON | GeoTIFF for raster ops, GeoJSON for Leaflet display |
| DB (dev) | SQLite | Zero-config for local development |
| DB (prod) | PostgreSQL + PostGIS | Native geospatial type support |
| Frontend framework | Vanilla JS + Leaflet.js | No React/Vue complexity; lightweight; Leaflet is ideal for maps |
| LLM | Gemini 1.5 Flash (free) | No local GPU needed; 1M tokens/day free; fast inference |
