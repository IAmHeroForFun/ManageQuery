# 00 — Project Overview
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05
> **Status:** Planning → Pre-build documentation phase

---

## Challenge Summary

| Detail | Value |
|---|---|
| **Challenge name** | Space Track — Mapping Flood Damage from Space |
| **Duration** | 15 days |
| **Team size** | Up to 4 members |
| **Case study event** | August 2026 Trishuli Flood, Nepal |
| **Evaluation** | Live — on area & date chosen by judges on the day |
| **Data** | Free and open satellite, elevation, and map data |

---

## Problem Statement

On **26 August 2026**, a partial collapse of a high-altitude glacier in northern Nepal triggered an avalanche of ice and rock that sent a flood of water, mud, and debris down the **Bhote Koshi–Trishuli river corridor**.

- Nepal's NDRRMA reported **1,342 deaths** by 6 September
- Almost **4,900 people** were still missing or out of contact
- Ground sensors, roads, bridges, and communications were destroyed

Rescue teams urgently needed to know:
1. **Where** the flood hit worst
2. **What infrastructure** was damaged
3. **Which settlements** were completely cut off

Free satellite data covers every valley of the Himalaya. Radar satellites see through monsoon clouds. The challenge is turning raw data into **trustworthy answers, quickly enough to matter**.

---

## The 3 Core Questions

```
┌─────────────────────────────────────────────────────────┐
│  Q1: WHERE DID THE FLOOD HIT?                           │
│  → Map flooded and debris-covered areas using           │
│    Sentinel-1 radar and Sentinel-2 optical imagery      │
├─────────────────────────────────────────────────────────┤
│  Q2: WHAT WAS DAMAGED?                                  │
│  → Overlay OpenStreetMap buildings, roads, bridges      │
│    and estimate which ones were hit                     │
├─────────────────────────────────────────────────────────┤
│  Q3: WHO IS CUT OFF?                                    │
│  → Using road network graph analysis, find settlements  │
│    with no remaining road connection to a town/hospital │
└─────────────────────────────────────────────────────────┘
```

---

## What We Are Building

A **full-stack web application** (Django + Leaflet.js) that:

1. Accepts a user-drawn or globally placed **Area of Interest (AOI)** and a **flood date**
2. Automatically downloads Sentinel-1 (SAR) and Sentinel-2 (optical) satellite images
3. Runs **SAR change detection** to produce a flood/debris mask
4. Fuses with **NDWI optical change detection**
5. Overlays live **OpenStreetMap infrastructure** (OSM 0.6 direct vector parsing & OHSome v2)
6. Runs **road graph connectivity analysis** to identify cut-off settlements
7. Applies a trained **U-Net flood segmentation model** (Bonus AI #1)
8. Traces the **flood path downstream** snapping to OSM river canyons with elevation drop & ETAs (Bonus AI #2)
9. Generates bilingual **Gemini AI situation reports** in **English** and **Nepali** (`नेपाली`)
10. Provides an interactive **Rescuer Mission Copilot Q&A widget** (zero-hallucination chat)
11. Benchmarks accuracy against official **Copernicus EMS Activation EMSR927**
12. Displays everything on an **interactive dark tactical Leaflet.js dashboard**

---

## Bonus AI Components

| Component | Description |
|---|---|
| **Flood Segmentation Model** | U-Net trained on Kuro Siwo dataset — detects water/debris in SAR images |
| **Flood Path & Canyon Tracer** | Snaps to OSM riverbeds + D8 slope descent — computes elevation drop $\Delta h$, surge speed, and settlement arrival times (ETAs) |
| **AI Situation Report Generator** | Gemini 1.5 Flash — generates structured bilingual reports in English & Nepali strictly grounded in pipeline statistics |
| **Rescuer Mission Copilot** | Zero-hallucination interactive chat answering natural-language field questions from analysis data |
| **Copernicus EMS Benchmark** | Live EMSR927 activation validation modal calculating IoU, precision, and recall |

---

## Judging Criteria

| Category | Weight |
|---|---|
| Flood and damage mapping quality | **30%** |
| AI component | **25%** |
| Cut-off settlement analysis | **20%** |
| Report, Q&A understanding, honesty about limitations | **15%** |
| Dashboard and situation report usability | **10%** |

---

## Submission Checklist

- [ ] GitHub repository with a `README.md` explaining how to run the system
- [ ] Report (max 6 pages), including a limitations section
- [ ] 3-minute demo video
- [ ] Required data attributions and training-dataset citations
- [ ] Case-study results compared with EMSR927 reference maps

---

## Required Attribution (Every Submission)

```
"Contains modified Copernicus Sentinel data 2026."
"Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and
 © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS
 by the European Union and ESA; all rights reserved."
"© OpenStreetMap contributors."
"Training data: Bountos et al., 2024 (Kuro Siwo, MIT License)."
```

---

## Documentation Index

| File | Description |
|---|---|
| [`01_architecture.md`](./01_architecture.md) | System architecture + data flow diagrams |
| [`02_tech_stack.md`](./02_tech_stack.md) | All libraries, tools, versions, and links |
| [`03_database_schema.md`](./03_database_schema.md) | Models, fields, relationships, ERD |
| [`04_api_reference.md`](./04_api_reference.md) | All REST endpoints, request/response specs |
| [`05_data_pipeline.md`](./05_data_pipeline.md) | Satellite processing pipeline step-by-step |
| [`06_ai_components.md`](./06_ai_components.md) | U-Net, flood path tracer, Gemini LLM |
| [`07_ui_wireframes.md`](./07_ui_wireframes.md) | Page layouts, component descriptions, UX flow |
| [`08_data_sources.md`](./08_data_sources.md) | Datasets, licenses, download links, attributions |
| [`09_setup_guide.md`](./09_setup_guide.md) | Install, configure, and run the project |

---

## Ethical Note

> This disaster is recent — 1,342 confirmed deaths, ~4,900 missing as of early Sep 2026.
> - Do **not** use images of victims in demos or reports
> - Systems built here are **educational prototypes**, not operational tools
> - Be **honest about limitations** in all outputs and the report
