# 07 — UI Wireframes & UX Flow
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05
> **Frontend stack:** Django Templates + Leaflet.js + leaflet-draw + Vanilla JS + CSS

---

## UX Flow Overview

```
┌──────────────────┐
│   Landing Page   │  User opens app, sees the map
│   (index.html)   │
└────────┬─────────┘
         │ User draws AOI + picks date + submits
         ▼
┌──────────────────┐
│  Live Dashboard  │  Real-time progress bar + map updates as Celery processes
│   (map.html)     │
└────────┬─────────┘
         │ User clicks "Generate Situation Report"
         ▼
┌──────────────────┐
│ Situation Report │  AI-generated report + PDF download
│  (report.html)   │
└──────────────────┘
```

---

## Design & Color Theme

The interface utilizes a clean, high-contrast response color palette:
- **Green** (`#16a34a` / `#22c55e` / `#15803d`): Primary accents, active badges, connected settlements (`🟢 CONNECTED`).
- **White** (`#ffffff` / `#f8fafc` / `#f1f5f9`): Crisp container backgrounds, clean card surfaces, and dark text contrast.
- **Blue** (`#0284c7` / `#0369a1` / `#38bdf8`): Flood extents, hydro features, links, and map interactive controls.
- **Yellow** (`#eab308` / `#ca8a04` / `#fef08a`): Warning highlights, attention badges, damaged/partially affected infrastructures.
- **Red** (`#ef4444`): Critical cutoff settlements (`🔴 CUT OFF`) and destroyed infrastructure.

Map tiles are powered by **CartoDB Voyager** and **ESRI Satellite/World Imagery** for standard Leaflet compatibility and tile policy compliance.

---

## Page 1 — Index / AOI Selector (`index.html`)

### Purpose
Let the user define their area of interest (either by drawing on the Leaflet map or typing manual coordinates into the bounding box fields) and submit a flood analysis job.

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🛰 FLOOD DAMAGE FROM SPACE                              [About]     │
│ Satellite-based disaster response mapping                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────┐  ┌─────────────────┐  │
│  │                                         │  │  CONFIGURE JOB  │  │
│  │                                         │  │                 │  │
│  │      LEAFLET MAP (CartoDB Voyager)      │  │ Flood Date:     │  │
│  │                                         │  │ [2026-08-26 ▼]  │  │
│  │  [ Nepal centered, zoom ~9 ]            │  │                 │  │
│  │                                         │  │ Manual Bounding:│  │
│  │  ✏ Draw AOI or type coordinates below:  │  │ Min/Max Lat/Lon │  │
│  │  [Min Lon] [Min Lat] [Max Lon] [Max Lat]│  │                 │  │
│  │                                         │  │ ☑ AI Segment.   │  │
│  │  [Selected AOI shown as blue rectangle] │  │ ☑ Flood Path    │  │
│  │                                         │  │ Source Lat/Lon: │  │
│  │                                         │  │ [Click / Type]  │  │
│  │                                         │  │                 │  │
│  │                                         │  │ [🔍 ANALYZE]    │  │
│  └─────────────────────────────────────────┘  └─────────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ℹ Case study: August 2026 Trishuli Flood, Nepal            │    │
│  │   [Load Trishuli preset] to auto-fill AOI + date           │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Tool | Behaviour |
|---|---|---|
| **Leaflet map** | Leaflet.js | Centered on Nepal (lat: 28.0, lon: 84.0, zoom: 8) |
| **Draw tool** | leaflet-draw | Rectangle only; clears previous selection on new draw |
| **Date picker** | `<input type="date">` | Default: `2026-08-26`; max: today |
| **AI segmentation toggle** | Checkbox | Default: checked |
| **Flood path toggle** | Checkbox | Shows source point picker when checked |
| **Source point picker** | Leaflet click handler | Enabled only when flood path checked; places marker |
| **Load Trishuli preset** | Button | Fills AOI (85.1,27.8,85.7,28.5) + date (2026-08-26) |
| **Analyze button** | JS form submit | POSTs to `/api/analysis/`, redirects to `/dashboard/{id}/` |

### Form Validation
- AOI must be drawn before submit
- Date must be set
- If flood path enabled: source point must be set
- On submit: button shows spinner, disabled to prevent double-submit

---

## Page 2 — Live Dashboard (`map.html`)

### Purpose
Display real-time processing progress and show all analysis results on an interactive map.

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🛰 FLOOD DAMAGE FROM SPACE  /  Job: a1b2c3d4  [← New Analysis]     │
├────────────────────────────────────┬─────────────────────────────────┤
│                                    │                                  │
│                                    │  📊 SUMMARY STATISTICS          │
│                                    │  ┌───────────────────────────┐  │
│                                    │  │ 🌊 Flood/Debris Area       │  │
│                                    │  │    47.3 km²               │  │
│                                    │  ├───────────────────────────┤  │
│    LEAFLET.JS MAP                  │  │ 🏚 Buildings Affected       │  │
│                                    │  │    312 confirmed           │  │
│  Flood/Debris  ▮ Gold              │  │    89 possibly             │  │
│  Damaged Roads ▮ Red               │  ├───────────────────────────┤  │
│  Cut-off       ▮ Blue              │  │ 🛣 Roads Damaged            │  │
│  Flood Path    ▮ Purple            │  │    28.4 km                │  │
│  U-Net Pred    ▮ Green             │  ├───────────────────────────┤  │
│                                    │  │ 🚫 Settlements Cut Off      │  │
│  [Layer toggles at bottom]         │  │    5 villages              │  │
│                                    │  └───────────────────────────┘  │
│  Click a feature for popup:        │                                  │
│  ┌────────────────────┐            │  🔄 PROCESSING STATUS           │
│  │ Road: Araniko Hwy  │            │  [████████░░░░] 65%             │
│  │ Status: AFFECTED   │            │  Assessing damage...            │
│  │ Overlap: 87%       │            │                                  │
│  └────────────────────┘            │  📋 CUT-OFF SETTLEMENTS          │
│                                    │  ● Ghatta          CUT OFF 🔴   │
│                                    │  ● Syaule          CUT OFF 🔴   │
│                                    │  ● Larcha          CUT OFF 🔴   │
│                                    │  ○ Betrawati       Connected ✓  │
│                                    │  ○ Trishuli Bazar  Connected ✓  │
│                                    │                                  │
│                                    │  [📄 Generate Situation Report]  │
├────────────────────────────────────┴─────────────────────────────────┤
│  Layers: [🌊 Flood] [🔴 Roads] [🏚 Buildings] [🚫 Cut-off] [🟣 Path]  │
└──────────────────────────────────────────────────────────────────────┘
```

### Map Layers (Colour Coding)

| Layer | Colour | Leaflet style | Triggered by |
|---|---|---|---|
| Flood/Debris extent | Gold `#FFD700` | fillOpacity 0.4, weight 2 | status=completed |
| Damaged roads (affected) | Red `#E53E3E` | weight 4, opacity 0.9 | status=completed |
| Damaged roads (possible) | Orange `#ED8936` | weight 3, dashArray '5,5' | status=completed |
| Damaged buildings | Dark red `#742A2A` | fillOpacity 0.7 | status=completed |
| Cut-off settlements | Blue `#2B6CB0` | circle, radius 8 | status=completed |
| Connected settlements | Green `#276749` | circle, radius 6 | status=completed |
| Flood path | Purple `#805AD5` | weight 3, dashArray '8,4' | if trace_flood_path=true |
| U-Net prediction | Teal `#319795` | fillOpacity 0.35 | if use_segmentation=true |

### Progress Bar Behaviour

```javascript
// polling.js
function pollStatus(jobId) {
    const interval = setInterval(async () => {
        const resp = await fetch(`/api/analysis/${jobId}/`);
        const data = await resp.json();
        
        updateProgressBar(data.progress);
        updateCurrentStep(data.current_step);
        
        if (data.status === 'completed') {
            clearInterval(interval);
            loadAllLayers(jobId);
            populateStats(data);
        } else if (data.status === 'failed') {
            clearInterval(interval);
            showError(data.error_message);
        }
    }, 3000); // poll every 3 seconds
}
```

### Feature Click Popup (Leaflet)

Clicking any map feature shows a popup:
```
┌─────────────────────────────┐
│  🛣 Araniko Highway         │
│  Type: Road                 │
│  OSM ID: way/123456789      │
│  Status: ■ AFFECTED         │
│  Flood overlap: 87%         │
└─────────────────────────────┘
```

---

## Page 3 — Situation Report (`report.html`)

### Purpose
Display the Gemini AI-generated situation report and allow PDF download.

### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🛰 FLOOD DAMAGE FROM SPACE  /  Situation Report  [← Back to Map]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [ English 🇬🇧 ]  [ नेपाली 🇳🇵 ]   ← Language tabs                  │
│  ─────────────────────────────────────────────────────              │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SITUATION REPORT — Trishuli Flood, Nepal (26 August 2026)    │  │
│  │  Analysis Date: 5 October 2026                                 │  │
│  │  Generated by: Gemini 1.5 Flash (Google AI)                   │  │
│  ├────────────────────────────────────────────────────────────────┤  │
│  │                                                                │  │
│  │  SUMMARY (or: सारांश in Nepali tab)                           │  │
│  │  Satellite analysis of the Bhote Koshi–Trishuli corridor...   │  │
│  │                                                                │  │
│  │  INFRASTRUCTURE DAMAGE (or: पूर्वाधार क्षति)                 │  │
│  │  Assessment indicates 312 buildings confirmed affected...      │  │
│  │                                                                │  │
│  │  POPULATION ACCESS (or: जनसंख्या पहुँच)                      │  │
│  │  Five settlements have no road access...                       │  │
│  │                                                                │  │
│  │  DATA LIMITATIONS (or: डेटाका सीमाहरू)                       │  │
│  │  Sentinel satellites revisit every 12 days...                  │  │
│  │                                                                │  │
│  │  Satellite data: Contains modified Copernicus Sentinel data   │  │
│  │  2026.                                                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  [📥 Download English PDF] [📥 Download Nepali PDF]                  │
│  [🔄 Regenerate Report]   [← Back to Map]                           │
│                                                                      │
│  ────────────────────────────────────────────────────────────────   │
│  ⚠ This report is an educational prototype. All numbers come        │
│    from satellite analysis only. Ground truth verification required. │
│                                                                      │
│  Attribution:                                                        │
│  Contains modified Copernicus Sentinel data 2026.                   │
│  Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014        │
│  © OpenStreetMap contributors.                                       │
│  Training data: Bountos et al., 2024 (Kuro Siwo, MIT License)       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## URL Structure (Django)

```python
# dashboard/urls.py
urlpatterns = [
    path('', views.IndexView.as_view(), name='index'),
    path('dashboard/<uuid:job_id>/', views.DashboardView.as_view(), name='dashboard'),
    path('dashboard/<uuid:job_id>/report/', views.ReportView.as_view(), name='report'),
]
```

---

## JavaScript Files

| File | Purpose |
|---|---|
| `map.js` | Initialize Leaflet map, set default view, tile layers |
| `aoi_selector.js` | leaflet-draw integration, extract coords on rectangle drawn |
| `layers.js` | Functions: `loadFloodLayer()`, `loadDamageLayer()`, `loadCutoffLayer()`, `loadPathLayer()` |
| `polling.js` | `setInterval` polling → progress bar + auto-load layers on complete |
| `report.js` | "Generate Report" button → POST, display response, trigger PDF download |

---

## Responsive Design Notes

- Sidebar (right panel) collapses to bottom panel on mobile screens (< 768px)
- Map takes full width on mobile
- Progress bar and stats remain visible above map on mobile
- PDF download still works on mobile

---

## Accessibility

- All map features have ARIA labels
- Progress bar uses `aria-valuenow` attribute
- Color-coded layers have tooltips for colorblind accessibility
- Keyboard navigation for form fields
