# 🛰️ Mapping Flood Damage from Space (Mfdfs)

**Multimodal AI Hackathon 2026 — Track B Solution**
*Automated Disaster Response & Infrastructure Damage Mapping via Satellite Radar and Optical Imagery*

---

## 📌 Executive Summary

When roads, bridges, and phone lines are swept away by mountain floods, rescue teams need to know where the damage is and which communities are cut off. **Mfdfs** is an end-to-end disaster analysis system and interactive geospatial web application built with **Django**, **Celery**, **Leaflet.js**, and **Google Gemini 1.5 Flash**.

Case study: **The August 2026 Trishuli Flood, Nepal** (Bhote Koshi corridor glacial lake outburst).

---

## 🌟 Core Capabilities

1. **Where did the flood hit?**
   - Ingests **Sentinel-1 SAR** (synthetic aperture radar) pre/post image pairs strictly from the same relative orbit track (sees through monsoon clouds).
   - Ingests cloud-filtered **Sentinel-2 L2A** optical imagery to compute NDWI: `(Green - NIR) / (Green + NIR)`.
   - Multi-sensor fusion outputs geo-referenced flood and debris extent masks.

2. **What was damaged?**
   - Ingests pre-event OpenStreetMap snapshots (prior to 26 Aug 2026 via ohsome API).
   - Intersects flood polygons with roads, bridges, and buildings.
   - Computes overlap percentages and classifies damage (`affected`, `possibly_affected`, `not_affected`).

3. **Who is cut off?**
   - Constructs a topological network graph using `networkx`.
   - Prunes flooded road segments.
   - Evaluates reachability from every settlement to regional hospital centers.
   - Flags isolated settlements requiring emergency aerial rescue.

4. **AI Bonus Components**:
   - **Flood Segmentation Model**: PyTorch U-Net architecture trained on the Kuro Siwo benchmark dataset to distinguish open water vs saturated debris.
   - **Flood Path Tracer**: Hydrological D8 flow routing across Copernicus DEM 30m elevation terrain from any upstream source point.
   - **Gemini AI Situation Report Copilot**: Formulates disaster reports in **English** and **Nepali** grounded with strict zero-hallucination rules.

---

## 🏗️ Architecture

```
User (Browser) ──► Django REST API ──► Celery Task Queue (Redis)
                         │                    │
                         │                    ▼
                         │          Sentinel-1 / Sentinel-2 / DEM / OSM
                         │                    │
                         │                    ▼
                         │          SAR Change Detection + Mask Fusion
                         │                    │
                         │                    ▼
                         │          OSM Damage Overlay & NetworkX BFS
                         │                    │
                         ▼                    ▼
                    SQLite / PostGIS ◄── Persisted Results
                         ▲
                         │
                 Leaflet.js Dashboard + Gemini Situation Report
```

---

## 🚀 Quickstart & Setup

### 1. Prerequisites
- Linux / macOS with Python 3.11+
- Redis Server (optional for background Celery tasks, local synchronous fallback built-in)

### 2. Virtual Environment & Dependencies
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey):
```env
GEMINI_API_KEY=your_gemini_key_here
```

### 4. Database Setup & Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Run the Server
```bash
python manage.py runserver
```
Visit `http://localhost:8000` to open the interactive AOI selector and dashboard.

---

## 🧪 Running Automated Tests
```bash
pytest tests/ -v
```

---

## 📜 Required Attributions

- *"Contains modified Copernicus Sentinel data 2026."*
- *"Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved."*
- *"© OpenStreetMap contributors."*
- *"Training data: Bountos et al., 2024 (Kuro Siwo, MIT License)."*
