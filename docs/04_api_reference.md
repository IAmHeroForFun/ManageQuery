# 04 — API Reference
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05
> **Base URL (dev):** `http://localhost:8000/api/`
> **Format:** All requests/responses are `application/json`

---

## Authentication

No authentication required for the MVP (local development).
Production deployment should add token auth via `djangorestframework-simplejwt`.

---

## Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analysis/` | Submit a new flood analysis job |
| `GET` | `/api/analysis/{id}/` | Get job status and summary results |
| `GET` | `/api/analysis/` | List all analysis jobs |
| `GET` | `/api/analysis/{id}/flood-extent/` | GeoJSON of flood/debris extent |
| `GET` | `/api/analysis/{id}/damaged-features/` | GeoJSON of damaged OSM features |
| `GET` | `/api/analysis/{id}/cutoff-settlements/` | GeoJSON of cut-off settlements |
| `GET` | `/api/analysis/{id}/flood-path/` | GeoJSON of traced flood path with elevation & ETAs |
| `GET` | `/api/analysis/{id}/segmentation/` | U-Net segmentation result info |
| `POST` | `/api/analysis/{id}/report/` | Trigger Gemini situation report generation |
| `GET` | `/api/analysis/{id}/report/` | Fetch generated situation report |
| `POST` | `/api/analysis/{id}/copilot-qa/` | Interactive Q&A copilot grounded in pipeline statistics |
| `GET` | `/api/analysis/{id}/emsr927-validation/` | Official Copernicus EMS EMSR927 activation validation metrics |

---

## Endpoint Details

---

### `POST /api/analysis/`

Submit a new flood analysis job. Triggers Celery task immediately.

**Request body:**
```json
{
  "aoi": {
    "type": "Polygon",
    "coordinates": [
      [[85.2, 28.1], [85.6, 28.1], [85.6, 28.5], [85.2, 28.5], [85.2, 28.1]]
    ]
  },
  "flood_date": "2026-08-26",
  "use_segmentation": true,
  "trace_flood_path": true,
  "source_point": {
    "type": "Point",
    "coordinates": [85.35, 28.45]
  }
}
```

**Fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `aoi` | GeoJSON Polygon | ✅ | Area of interest |
| `flood_date` | ISO date string | ✅ | Date of flood event (YYYY-MM-DD) |
| `use_segmentation` | boolean | ❌ | Run U-Net bonus (default: true) |
| `trace_flood_path` | boolean | ❌ | Run flood path tracer (default: false) |
| `source_point` | GeoJSON Point | ❌ | Required if `trace_flood_path=true` |

**Response `201 Created`:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued",
  "progress": 0,
  "current_step": "Queued for processing",
  "created_at": "2026-10-05T14:30:00Z"
}
```

**Errors:**
```json
// 400 Bad Request
{ "aoi": ["This field is required."] }
{ "flood_date": ["Date must be before today."] }
{ "source_point": ["Required when trace_flood_path is true."] }
```

**curl example:**
```bash
curl -X POST http://localhost:8000/api/analysis/ \
  -H "Content-Type: application/json" \
  -d '{
    "aoi": {"type":"Polygon","coordinates":[[[85.2,28.1],[85.6,28.1],[85.6,28.5],[85.2,28.5],[85.2,28.1]]]},
    "flood_date": "2026-08-26",
    "use_segmentation": true,
    "trace_flood_path": false
  }'
```

---

### `GET /api/analysis/{id}/`

Get job status and all summary statistics. Used for progress polling (every 3s).

**Response `200 OK`:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "processing",
  "progress": 60,
  "current_step": "Assessing infrastructure damage",
  "aoi": { "type": "Polygon", "coordinates": [...] },
  "flood_date": "2026-08-26",
  "use_segmentation": true,
  "trace_flood_path": false,
  "flood_area_km2": 47.3,
  "buildings_affected": null,
  "roads_damaged_km": null,
  "bridges_damaged": null,
  "settlements_cutoff": null,
  "created_at": "2026-10-05T14:30:00Z",
  "updated_at": "2026-10-05T14:38:12Z",
  "completed_at": null,
  "error_message": null
}
```

**Possible `status` values:**
| Status | Meaning |
|---|---|
| `queued` | Task submitted, worker hasn't started yet |
| `downloading` | Downloading satellite imagery |
| `processing` | Running detection/analysis pipeline |
| `completed` | All results ready |
| `failed` | An error occurred (see `error_message`) |

**Errors:**
```json
// 404 Not Found
{ "detail": "Not found." }
```

---

### `GET /api/analysis/`

List all jobs (most recent first).

**Response `200 OK`:**
```json
[
  {
    "id": "a1b2c3d4-...",
    "status": "completed",
    "flood_date": "2026-08-26",
    "flood_area_km2": 47.3,
    "created_at": "2026-10-05T14:30:00Z"
  },
  ...
]
```

---

### `GET /api/analysis/{id}/flood-extent/`

Returns the flood/debris extent as a GeoJSON FeatureCollection.
Only available when `status=completed`.

**Response `200 OK`:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [...]
      },
      "properties": {
        "source": "fused",
        "confidence": 0.87,
        "area_km2": 47.3
      }
    }
  ]
}
```

**Errors:**
```json
// 202 Accepted (still processing)
{ "detail": "Analysis not yet complete.", "status": "processing", "progress": 45 }
```

---

### `GET /api/analysis/{id}/damaged-features/`

All OSM features assessed for damage, as GeoJSON FeatureCollection.

**Response `200 OK`:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [...] },
      "properties": {
        "osm_id": "way/123456789",
        "osm_type": "road",
        "osm_name": "Araniko Highway",
        "status": "affected",
        "overlap_pct": 87.3
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "osm_id": "way/987654321",
        "osm_type": "building",
        "osm_name": null,
        "status": "possibly_affected",
        "overlap_pct": 22.1
      }
    }
  ]
}
```

**`status` values:**
| Value | Meaning |
|---|---|
| `affected` | ≥ 50% overlap with flood mask |
| `possibly_affected` | 10–50% overlap |
| `not_affected` | < 10% overlap |

---

### `GET /api/analysis/{id}/cutoff-settlements/`

All settlements with road access assessment.

**Response `200 OK`:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [85.31, 28.22] },
      "properties": {
        "name": "Ghatta",
        "is_cutoff": true,
        "nearest_hospital": "Bidur Hospital",
        "pre_flood_distance_km": 12.4,
        "population_estimate": null
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [85.38, 28.18] },
      "properties": {
        "name": "Betrawati",
        "is_cutoff": false,
        "nearest_hospital": "Bidur Hospital",
        "pre_flood_distance_km": 5.2,
        "population_estimate": 3200
      }
    }
  ]
}
```

---

### `GET /api/analysis/{id}/flood-path/`

D8-routed flood path from source point. Only available if `trace_flood_path=true`.

**Response `200 OK`:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[85.35, 28.45], [85.34, 28.42], ...]
      },
      "properties": {
        "source_point": [85.35, 28.45],
        "path_length_km": 34.7,
        "settlements_on_path": ["Ghatta", "Larcha", "Syaule", "Trishuli Bazar"]
      }
    }
  ]
}
```

**Errors:**
```json
// 404 when trace_flood_path=false
{ "detail": "Flood path tracing was not enabled for this job." }
```

---

### `GET /api/analysis/{id}/segmentation/`

U-Net model prediction result info. Only if `use_segmentation=true`.

**Response `200 OK`:**
```json
{
  "geotiff_url": "/media/analysis/a1b2c3d4.../outputs/segmentation.tif",
  "metrics": {
    "iou_water": 0.74,
    "iou_debris": 0.61,
    "f1_score": 0.68
  },
  "model": "FloodUNet",
  "training_data": "Kuro Siwo (MIT License, Bountos et al. 2024)"
}
```

---

### `POST /api/analysis/{id}/report/`

Trigger Gemini AI situation report generation. Returns immediately — report generated synchronously (fast, ~2–5s).

**Request body:** Empty `{}`

**Response `200 OK`:**
```json
{
  "report_english": "SITUATION REPORT — Trishuli Flood, Nepal (26 August 2026)\n\nSatellite analysis of the Bhote Koshi–Trishuli corridor reveals a total inundated and debris-covered area of 47.3 km²...",
  "report_nepali": "स्थिति रिपोर्ट — त्रिशूली बाढी, नेपाल (२६ अगस्त २०२६)\n\nभोटे कोशी–त्रिशूली कोरिडोरको उपग्रह विश्लेषणले कुल ४७.३ वर्ग किलोमिटर क्षेत्र बाढी र मलवाले ढाकिएको देखाएको छ...",
  "generated_at": "2026-10-05T15:04:22Z",
  "llm_model": "gemini-1.5-flash"
}
```

**Errors:**
```json
// 400 if analysis not completed
{ "detail": "Analysis must be completed before generating a report." }
// 503 if Gemini API unreachable
{ "detail": "Situation report generation failed. Check GEMINI_API_KEY." }
```

---

### `GET /api/analysis/{id}/report/`

Fetch a previously generated report.

**Response `200 OK`:** Same as POST response above.

**Errors:**
```json
// 404 if no report generated yet
{ "detail": "No situation report found. POST to this endpoint to generate one." }
```

---

### `POST /api/analysis/{id}/copilot-qa/`

Interactive Q&A copilot designed for emergency responders. Answers natural language questions strictly grounded in the verified damage statistics snapshot.

**Request body:**
```json
{
  "question": "Which settlements lost road connectivity to medical facilities?"
}
```

**Response `200 OK`:**
```json
{
  "question": "Which settlements lost road connectivity to medical facilities?",
  "answer": "Based on satellite and road network analysis, 3 settlements are currently cut off: Jalalpore, Maroli, and Jesiya Faliya. All intact road access to regional medical facilities has been severed. Prioritized emergency aerial rescue is recommended.",
  "grounding_stats": {
    "flood_date": "2026-08-26",
    "area_name": "Matwad Valley / Regional Corridor",
    "flood_area_km2": 274.2,
    "buildings_affected": 15,
    "roads_damaged_km": 71.9,
    "settlements_cutoff": 3,
    "cutoff_settlement_names": ["Jalalpore", "Maroli", "Jesiya Faliya"]
  }
}
```

---

### `GET /api/analysis/{id}/emsr927-validation/`

Retrieves Copernicus Emergency Management Service (EMS) EMSR927 activation reference validation benchmark metrics.

**Response `200 OK`:**
```json
{
  "activation_id": "EMSR927",
  "event_title": "August 2026 Trishuli Flood & Debris Flow, Nepal",
  "reference_agency": "Copernicus Emergency Management Service (EMS)",
  "pipeline_flood_area_km2": 274.2,
  "emsr927_reference_area_km2": 257.7,
  "metrics": {
    "intersection_over_union_iou": 0.81,
    "precision": 0.86,
    "recall": 0.84,
    "f1_score": 0.85
  },
  "attribution": "European Union, Copernicus Emergency Management Service data (EMSR927, validation use only)."
}
```

---

## URL Configuration (`apps/analysis/urls.py`)

```python
from django.urls import path
from .views import (
    AnalysisJobListCreateView,
    AnalysisJobDetailView,
    FloodExtentView,
    DamagedFeaturesView,
    CutoffSettlementsView,
    FloodPathView,
    SegmentationView,
    SituationReportView,
    RescuerCopilotQAView,
    EMSR927ValidationView,
)

urlpatterns = [
    path('analysis/', AnalysisJobListCreateView.as_view(), name='analysis-list-create'),
    path('analysis/<uuid:pk>/', AnalysisJobDetailView.as_view(), name='analysis-detail'),
    path('analysis/<uuid:pk>/flood-extent/', FloodExtentView.as_view(), name='analysis-flood-extent'),
    path('analysis/<uuid:pk>/damaged-features/', DamagedFeaturesView.as_view(), name='analysis-damaged-features'),
    path('analysis/<uuid:pk>/cutoff-settlements/', CutoffSettlementsView.as_view(), name='analysis-cutoff-settlements'),
    path('analysis/<uuid:pk>/flood-path/', FloodPathView.as_view(), name='analysis-flood-path'),
    path('analysis/<uuid:pk>/segmentation/', SegmentationView.as_view(), name='analysis-segmentation'),
    path('analysis/<uuid:pk>/report/', SituationReportView.as_view(), name='analysis-report'),
    path('analysis/<uuid:pk>/copilot-qa/', RescuerCopilotQAView.as_view(), name='analysis-copilot-qa'),
    path('analysis/<uuid:pk>/emsr927-validation/', EMSR927ValidationView.as_view(), name='analysis-emsr927-validation'),
]
```
