# 11. Project Limitations (A Plain-English Guide)

This document provides a realistic, human-understandable explanation of what the **Mapping Flood Damage from Space (MFDFS)** system can and cannot do. It is written for disaster managers, field coordinators, judges, and developers to understand the practical boundaries of satellite remote sensing, open-source mapping data, and automated algorithms during real-world disasters.

---

## 1. Satellite Remote Sensing Limitations

### 1.1 "Satellites Don't Hover in One Spot" (Revisit Time)
- **The Reality**: Satellites like Sentinel-1 (Radar) and Sentinel-2 (Optical) orbit the Earth in fixed paths. They pass over the exact same location once every **5 to 12 days**.
- **What this means in a disaster**: If a flash flood or glacial lake outburst (GLOF) strikes at 2:00 PM on a Tuesday, we may not have a new satellite image until days later, unless specialized commercial satellites (which cost thousands of dollars per capture) are tasked.
- **How we handle it**: The system is designed for **rapid event assessment** once pre- and post-flood radar pairs become available from the Copernicus constellation.

### 1.2 "Radar Shadows in Steep Mountains" (Layover & Shadowing)
- **The Reality**: Sentinel-1 looks sideways at the Earth using radar pulses. In steep mountain ranges like the Himalayas, towering peaks block the radar signal, casting a "radar shadow" over deep canyons and north-facing slopes.
- **What this means**: Floodwater sitting in the bottom of an extremely narrow, steep valley might be partially obscured by mountain shadows.

### 1.3 "Seeing Water Under Dense Trees and City Buildings"
- **The Reality**: The radar we use (C-band, ~5.6 cm wavelength) bounces off tree leaves and dense forest canopies. It also bounces repeatedly off tall concrete skyscrapers (called "double-bounce").
- **What this means**: Water submerged under a thick jungle canopy or in a narrow alleyway between 20-story buildings is harder for space radar to detect than water in open fields, farmland, or standard residential neighborhoods.

---

## 2. OpenStreetMap (OSM) Road & Building Data Limitations

### 2.1 "Crowdsourced Data Can Have Gaps in Remote Areas"
- **The Reality**: The maps of roads and buildings come from OpenStreetMap, which is built by volunteer cartographers and satellite digitizers around the world.
- **What this means**:
  - In major cities (like Mumbai or Kathmandu), roads and hospitals are mapped with extreme detail.
  - In remote rural mountain hamlets, small unpaved footpaths or newly built dirt tracks might not be completely mapped yet, or might have small disconnected gaps where one dirt track doesn't visually touch the main highway in the database.

### 2.2 "Language and Script Differences"
- **The Reality**: In countries like Nepal or India, local mappers frequently enter place names in their native script (e.g., Devanagari script `किउल`) rather than English Roman script (`Kiul`).
- **What this means**: Without automated fallback translation rules, local names can appear in foreign scripts on international command dashboards.

---

## 3. Road Passability & Hospital Routing Limitations

### 3.1 "Why a Village Is Marked Cut-Off Even When Its Local Roads Are Dry"
- **The Reality**: In mountain valleys, all traffic must pass through a single river gorge or bridge to get down to the regional hospital.
- **What this means**: If a bridge 10 km down the valley is washed away by floodwater, the entire valley above it is cut off from ambulances—even if the village high on the ridge is completely dry and safe from water.
- **Human explanation**: "Cut off" does not mean "submerged under water"; it means **ground ambulances cannot physically drive between this village and the hospital**.

### 3.2 "Binary Passable vs. Impassable Simplification"
- **The Reality**: In the software, roads are evaluated as either **passable** or **severed**.
- **What this means in the real world**: In reality, a road with 30 cm of muddy water might be completely impassable to a standard civilian ambulance or sedan, but easily passable to a military 6x6 high-clearance truck, a tractor, or a motorboat.

---

## 4. Digital Elevation Model (DEM) Topography Limitations

### 4.1 "Pixel Size of the Earth's Surface" (30-Meter Resolution)
- **The Reality**: The global elevation data we use (Copernicus DEM) has a pixel resolution of **30 meters $\times$ 30 meters** per cell.
- **What this means**: The system accurately models broad valley slopes, river drainage corridors, and mountain gravity flow paths. However, it cannot see small roadside concrete gutters, 2-meter flood barrier walls, or individual drainage culverts, which require centimeter-level drone surveys or costly 1-meter LiDAR data.

---

## 5. AI Copilot & Automated Situation Report Limitations

### 5.1 "AI Generates Briefings, Not Military Orders"
- **The Reality**: The Gemini 1.5 Flash bilingual copilot takes raw satellite metrics (square kilometers flooded, kilometers of road severed, hospital distances) and turns them into human-readable situation reports in English and Nepali.
- **What this means**: While our system strictly grounds the AI to prevent numerical hallucinations (enforcing zero made-up statistics), automated reports are meant to **assist human incident commanders**, not replace the final judgment of on-the-ground disaster relief personnel.

---

## 6. Summary: What MFDFS Is and Isn't

| What MFDFS IS | What MFDFS IS NOT |
| :--- | :--- |
| ✅ A rapid satellite-based reconnaissance tool for large-scale disaster triage. | ❌ A real-time live video feed or turn-by-turn GPS navigation system. |
| ✅ An automated identifier of cut-off communities that need emergency airlifts. | ❌ A replacement for local police/military reconnaissance on the ground. |
| ✅ An all-weather radar penetration system that sees through monsoon clouds. | ❌ A tool that can see through solid rock or beneath dense jungle canopies. |
| ✅ A bilingual emergency briefing assistant grounded in verified physics. | ❌ An autonomous authority making final evacuation decisions. |
