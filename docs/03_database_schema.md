# 03 — Database Schema
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05

---

## Overview

The database stores analysis jobs, all processing results, and generated reports.
- **Development:** SQLite (`db.sqlite3`) — zero-config
- **Production:** PostgreSQL 15 + PostGIS 3 — native geospatial support

---

## Entity-Relationship Overview

```
AnalysisJob
    │
    ├── FloodExtent (1 per job)
    ├── DamagedFeature (many per job)
    ├── CutoffSettlement (many per job)
    ├── FloodPath (0 or 1 per job)
    └── SituationReport (0 or 1 per job)
```

---

## Models

---

### `AnalysisJob`

The root record for every flood analysis request.

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated UUID4 |
| `status` | CharField(20) | `queued` → `downloading` → `processing` → `completed` → `failed` |
| `progress` | IntegerField | 0–100 percent complete |
| `current_step` | CharField(200) | Human-readable step description for UI display |
| `error_message` | TextField (nullable) | Error details if status=failed |
| `aoi_geojson` | TextField | GeoJSON Polygon string (Area of Interest) |
| `flood_date` | DateField | User-specified flood event date |
| `use_segmentation` | BooleanField | Whether to run U-Net bonus component |
| `trace_flood_path` | BooleanField | Whether to run D8 flood path tracer |
| `source_point_lon` | FloatField (nullable) | Longitude of upstream source point |
| `source_point_lat` | FloatField (nullable) | Latitude of upstream source point |
| `sentinel1_pre_path` | CharField(500) | Filesystem path to pre-event Sentinel-1 SAFE |
| `sentinel1_post_path` | CharField(500) | Filesystem path to post-event Sentinel-1 SAFE |
| `sentinel2_path` | CharField(500) | Filesystem path to Sentinel-2 SAFE (nullable) |
| `dem_path` | CharField(500) | Filesystem path to DEM GeoTIFF |
| `flood_area_km2` | FloatField (nullable) | Total flood/debris area in km² |
| `buildings_affected` | IntegerField (nullable) | Count of affected buildings |
| `roads_damaged_km` | FloatField (nullable) | Length of damaged roads in km |
| `bridges_damaged` | IntegerField (nullable) | Count of damaged bridges |
| `settlements_cutoff` | IntegerField (nullable) | Count of cut-off settlements |
| `created_at` | DateTimeField | Auto timestamp on creation |
| `updated_at` | DateTimeField | Auto timestamp on update |
| `completed_at` | DateTimeField (nullable) | Timestamp when processing finished |

**Django model:**
```python
import uuid
from django.db import models

class AnalysisJob(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('downloading', 'Downloading'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    progress = models.IntegerField(default=0)
    current_step = models.CharField(max_length=200, default='Queued for processing')
    error_message = models.TextField(blank=True, null=True)

    aoi_geojson = models.TextField()
    flood_date = models.DateField()
    use_segmentation = models.BooleanField(default=True)
    trace_flood_path = models.BooleanField(default=False)
    source_point_lon = models.FloatField(null=True, blank=True)
    source_point_lat = models.FloatField(null=True, blank=True)

    sentinel1_pre_path = models.CharField(max_length=500, blank=True)
    sentinel1_post_path = models.CharField(max_length=500, blank=True)
    sentinel2_path = models.CharField(max_length=500, blank=True)
    dem_path = models.CharField(max_length=500, blank=True)

    flood_area_km2 = models.FloatField(null=True, blank=True)
    buildings_affected = models.IntegerField(null=True, blank=True)
    roads_damaged_km = models.FloatField(null=True, blank=True)
    bridges_damaged = models.IntegerField(null=True, blank=True)
    settlements_cutoff = models.IntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
```

---

### `FloodExtent`

The flood/debris mask output from SAR + optical fusion.

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated UUID4 |
| `job` | FK → AnalysisJob | Parent job (cascade delete) |
| `geojson_path` | CharField(500) | Path to flood extent GeoJSON file |
| `geotiff_path` | CharField(500) | Path to binary flood mask GeoTIFF |
| `confidence_score` | FloatField | 0.0–1.0 confidence of detection |
| `source` | CharField(20) | `sar_only`, `optical_only`, `fused` |
| `created_at` | DateTimeField | Auto timestamp |

---

### `DamagedFeature`

Individual OSM features (buildings, roads, bridges) assessed for damage.

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated UUID4 |
| `job` | FK → AnalysisJob | Parent job (cascade delete) |
| `osm_id` | CharField(50) | OpenStreetMap feature ID |
| `osm_type` | CharField(20) | `building`, `road`, `bridge` |
| `osm_name` | CharField(200) | Feature name from OSM (nullable) |
| `status` | CharField(20) | `affected`, `possibly_affected`, `not_affected` |
| `geometry_geojson` | TextField | GeoJSON geometry of the OSM feature |
| `overlap_pct` | FloatField | % of feature overlapping flood mask |

---

### `CutoffSettlement`

Settlements identified as having no road access to nearest town/hospital.

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated UUID4 |
| `job` | FK → AnalysisJob | Parent job (cascade delete) |
| `name` | CharField(200) | Settlement name from OSM |
| `geometry_geojson` | TextField | GeoJSON point of settlement |
| `is_cutoff` | BooleanField | `True` if no road path exists |
| `nearest_hospital` | CharField(200) | Name of nearest hospital (nullable) |
| `nearest_hospital_geojson` | TextField | GeoJSON point of hospital (nullable) |
| `pre_flood_distance_km` | FloatField | Road distance before flood (nullable) |
| `population_estimate` | IntegerField | OSM population tag if available (nullable) |

---

### `FloodPath`

Downstream flood path from a given upstream source point.

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated UUID4 |
| `job` | FK → AnalysisJob | Parent job (one-to-one) |
| `source_point_geojson` | TextField | GeoJSON Point of upstream origin |
| `path_geojson` | TextField | GeoJSON LineString of traced path |
| `settlements_on_path` | TextField | JSON array of settlement names along path |
| `path_length_km` | FloatField | Total traced path length in km |
| `start_elevation_m` | IntegerField | Elevation at upstream origin point (meters) |
| `end_elevation_m` | IntegerField | Elevation at downstream terminus (meters) |
| `elevation_drop_m` | IntegerField | Total vertical descent $\Delta h$ (meters) |
| `avg_speed_kmh` | FloatField | Estimated hydrodynamic surge velocity (km/h) |
| `settlement_etas` | TextField | JSON list of settlement arrival distances & ETAs |

---

### `SituationReport`

AI-generated situation report for an analysis job.

| Field | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated UUID4 |
| `job` | FK → AnalysisJob | Parent job (one-to-one) |
| `report_english` | TextField | English situation report text |
| `report_nepali` | TextField | Nepali situation report text (नेपाली) |
| `stats_snapshot` | TextField | JSON dump of stats used to generate report |
| `llm_model` | CharField(100) | `gemini-1.5-flash` |
| `generated_at` | DateTimeField | Timestamp of generation |
| `pdf_path` | CharField(500) | Path to PDF export (if generated) |

---

## SQLite vs PostgreSQL/PostGIS Differences

| Feature | SQLite (dev) | PostgreSQL + PostGIS (prod) |
|---|---|---|
| Geometry storage | TextField (GeoJSON strings) | GeometryField (native PostGIS) |
| Spatial queries | Python-side with shapely/geopandas | Native SQL: `ST_Intersects`, `ST_Area` etc. |
| Concurrent writes | Single-writer | Full MVCC concurrent access |
| Performance | Fine for dev/testing | Required for production |

> In production, `geometry_geojson` fields will be replaced with PostGIS `GeometryField` columns and Django GIS (`django.contrib.gis`) will be used.

---

## Indexing Strategy

```python
class Meta:
    indexes = [
        models.Index(fields=['status']),         # Filter jobs by status
        models.Index(fields=['flood_date']),     # Filter by flood date
        models.Index(fields=['created_at']),     # Ordering
        models.Index(fields=['job', 'osm_type']), # DamagedFeature queries
        models.Index(fields=['job', 'is_cutoff']), # CutoffSettlement filter
    ]
```

---

## Migrations

```bash
# Create migrations
python manage.py makemigrations --settings=config.settings.local

# Apply migrations
python manage.py migrate --settings=config.settings.local

# Check migration status
python manage.py showmigrations --settings=config.settings.local
```
