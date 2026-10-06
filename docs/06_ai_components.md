# 06 — AI Components
## Mapping Flood Damage from Space

> **Last updated:** 2026-10-05
> **Change log:** Gemini copilot updated to produce **English + Nepali** reports (Track B official spec)

---

## Overview

Three AI components are included:

| Component | Type | Purpose |
|---|---|---|
| **Flood Segmentation U-Net** | Bonus AI #1 | Detect water/debris in Sentinel-1 SAR images using a trained neural network |
| **Flood Path Tracer** | Bonus AI #2 | Trace flood path downstream from upstream point using D8 flow routing on DEM |
| **Gemini Situation Report Copilot** | Core feature | Generate structured English disaster situation report from pipeline statistics |

---

## A. Flood Segmentation U-Net

### Purpose

Train a deep learning model to segment flood-affected pixels directly from Sentinel-1 SAR images. This provides a pixel-level probability map that complements the rule-based log-ratio change detection.

### Input / Output

```
Input:  2-channel SAR image chip (VV band, VH band)
        → Shape: (2, 256, 256) at 10m resolution
Output: 3-class segmentation mask
        → Class 0: Background (dry land, buildings)
        → Class 1: Water (open water, flooded areas)
        → Class 2: Debris (flood debris, mud, deposited material)
        → Shape: (256, 256) with class indices
```

### Architecture

U-Net with pre-trained encoder (transfer learning):

```
Encoder: ResNet-34 (pretrained on ImageNet, adapted for 2-channel input)
Decoder: U-Net decoder with skip connections
Library: segmentation-models-pytorch
```

```python
import segmentation_models_pytorch as smp

class FloodUNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.model = smp.Unet(
            encoder_name='resnet34',
            encoder_weights=None,     # SAR is not RGB — no pretrained weights
            in_channels=2,            # VV + VH
            classes=3,                # water, debris, background
            activation=None,          # raw logits → CrossEntropyLoss
        )
    
    def forward(self, x):
        return self.model(x)
```

### Training Dataset — Kuro Siwo

- **URL:** https://github.com/Orion-AI-Lab/KuroSiwo
- **License:** MIT License
- **Citation:** Bountos et al., 2024 (NeurIPS 2024)
- **Content:** Sentinel-1 SAR chips from global flood events, labeled as water/debris/background
- **Chip size:** 256×256 pixels at 10m
- **Split:** 80% train / 10% val / 10% test

### Training Configuration

```python
# train.py
config = {
    "epochs": 50,
    "batch_size": 8,          # Adjust for GPU/CPU memory
    "learning_rate": 1e-4,
    "optimizer": "AdamW",
    "loss_function": "CrossEntropyLoss",
    "scheduler": "CosineAnnealingLR",
    "early_stopping_patience": 8,
    "val_metric": "iou_score",
    "checkpoint_path": "data/models/flood_unet_best.pth",
}
```

**Training command:**
```bash
python apps/ai/segmentation/train.py \
  --data-dir data/training/kuro_siwo \
  --epochs 50 \
  --batch-size 8 \
  --output data/models/flood_unet_best.pth
```

**Expected training time:**
- GPU (CUDA): ~2–4 hours for 50 epochs
- CPU only: ~8–16 hours (use fewer epochs: 20)

### Evaluation Metrics

| Metric | Target | Formula |
|---|---|---|
| IoU (water) | ≥ 0.65 | Intersection / Union |
| IoU (debris) | ≥ 0.50 | Intersection / Union |
| F1 Score | ≥ 0.70 | 2·P·R / (P+R) |
| Precision | ≥ 0.75 | TP / (TP+FP) |
| Recall | ≥ 0.65 | TP / (TP+FN) |

```python
# evaluate.py
def compute_metrics(pred_mask, true_mask, num_classes=3):
    iou_scores = {}
    for cls in range(num_classes):
        pred_cls = (pred_mask == cls)
        true_cls = (true_mask == cls)
        intersection = (pred_cls & true_cls).sum()
        union = (pred_cls | true_cls).sum()
        iou_scores[cls] = float(intersection) / float(union + 1e-10)
    return iou_scores
```

### Inference Pipeline

```
1. Load pre-trained weights from data/models/flood_unet_best.pth
2. Read post-event Sentinel-1 GeoTIFF (VV + VH bands)
3. Extract overlapping chips (256×256) with 50% overlap
4. Normalize each chip: (x - mean) / std per band
5. Run model inference on each chip
6. Stitch chip predictions back into full-scene mask
7. Apply majority vote in overlapping regions
8. Save output as GeoTIFF (same CRS/extent as input)
9. Compute metrics vs. EMSR927 reference (for validation)
```

```python
def predict_scene(model_path, sentinel1_post_tif, output_tif, chip_size=256, overlap=0.5):
    model = FloodUNet()
    model.load_state_dict(torch.load(model_path, map_location='cpu'))
    model.eval()
    
    with rasterio.open(sentinel1_post_tif) as src:
        data = src.read([1, 2]).astype(np.float32)  # VV, VH
        profile = src.profile
    
    # Chip extraction, inference, stitching...
    # (see apps/ai/segmentation/predict.py for full implementation)
    
    output_mask = stitch_chips(chip_predictions, data.shape[1:], chip_size, overlap)
    
    profile.update(dtype='uint8', count=1)
    with rasterio.open(output_tif, 'w', **profile) as dst:
        dst.write(output_mask.astype(np.uint8), 1)
```

---

## B. Flood Path Tracer (D8 Flow Routing)

### Purpose

Given any point upstream in the watershed, trace the flood path downstream using DEM elevation data. Lists all settlements along the traced path.

### Algorithm: D8 (Deterministic 8-Direction)

The D8 algorithm determines flow direction for each DEM cell by finding the steepest descent among its 8 neighbors.

```
For each cell, the water flows to whichever of 8 neighbors is lowest.
Flow direction codes:
  1=E, 2=SE, 4=S, 8=SW, 16=W, 32=NW, 64=N, 128=NE

Flood path: start at source cell → follow D8 directions → accumulate → stop at valley floor/river
```

### Library: pysheds

```python
from pysheds.grid import Grid
import numpy as np

def trace_flood_path(dem_tif, source_lon, source_lat):
    """
    Trace flood path from source point using D8 flow routing.
    Returns GeoJSON LineString of flood path.
    """
    grid = Grid.from_raster(dem_tif)
    dem = grid.read_raster(dem_tif)
    
    # Hydrological preprocessing
    pit_filled = grid.fill_pits(dem)           # Remove DEM artifacts
    flooded = grid.fill_depressions(pit_filled) # Fill depressions
    inflated = grid.resolve_flats(flooded)      # Handle flat areas
    
    # Compute flow direction (D8)
    fdir = grid.flowdir(inflated)
    
    # Compute flow accumulation (catchment area)
    acc = grid.accumulation(fdir)
    
    # Snap source point to nearest high-accumulation cell (river channel)
    x, y = source_lon, source_lat
    x_snap, y_snap = grid.snap_to_mask(acc > 1000, (x, y))
    
    # Trace path downstream
    path = grid.trace_path(fdir, x_snap, y_snap)
    
    # Convert to GeoJSON LineString
    coords = [(lon, lat) for lon, lat in zip(path['lon'], path['lat'])]
    geojson_path = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coords
        }
    }
    return geojson_path
```

### Finding Settlements Along Path

```python
def find_settlements_on_path(path_linestring, settlements_gdf, buffer_m=500):
    """
    Find settlements within 500m of the traced flood path.
    Returns ordered list of settlements (upstream to downstream).
    """
    path_buffered = path_linestring.buffer(buffer_m / 111320)  # degrees approx.
    on_path = settlements_gdf[settlements_gdf.geometry.within(path_buffered)]
    
    # Order by distance along path (upstream → downstream)
    on_path['along_path_dist'] = on_path.geometry.apply(
        lambda p: path_linestring.project(p)
    )
    return on_path.sort_values('along_path_dist')
```

### Output

```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [[85.35, 28.45], [85.34, 28.42], ...]
  },
  "properties": {
    "source_point": [85.35, 28.45],
    "path_length_km": 34.7,
    "settlements_on_path": [
      {"name": "Ghatta", "distance_from_source_km": 8.2},
      {"name": "Larcha", "distance_from_source_km": 15.6},
      {"name": "Syaule", "distance_from_source_km": 24.1}
    ]
  }
}
```

---

## C. Gemini AI Situation Report Copilot

### Purpose

Generate a structured, professional disaster situation report in **English and Nepali** using Google Gemini 1.5 Flash. All statistics come directly from the processing pipeline — the LLM only handles language formatting. Nepali output is required per the official Track B specification.

### Setup

```bash
# Install
pip install google-generativeai

# .env
GEMINI_API_KEY=your_free_api_key_here
```

Get key: https://aistudio.google.com/app/apikey (free, no card required)

### Full Implementation

```python
import google.generativeai as genai
from django.conf import settings
import os

class SituationReportGenerator:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    def generate(self, stats: dict) -> dict:
        """
        Generate situation reports in both English and Nepali.
        Returns: { "english": "...", "nepali": "..." }
        
        ALL numbers must come from the stats dict — never invented by the LLM.
        """
        english = self.model.generate_content(self._build_prompt(stats, language="english")).text
        nepali  = self.model.generate_content(self._build_prompt(stats, language="nepali")).text
        return {"english": english, "nepali": nepali}

    def _build_prompt(self, stats: dict, language: str) -> str:
        lang_instruction = {
            "english": "Write the report in formal English.",
            "nepali":  "सम्पूर्ण रिपोर्ट औपचारिक नेपाली भाषामा लेख्नुहोस्। (Write the entire report in formal Nepali language.)"
        }[language]

        return f"""You are a professional disaster response analyst writing an official situation report.

STRICT RULE: Use ONLY the numbers provided below. Do not estimate, extrapolate, or invent any figures.

--- VERIFIED DATA FROM SATELLITE ANALYSIS ---
Event: Flood on {stats['flood_date']} in {stats['area_name']}
Data source: {stats['data_source']}
Analysis completed: {stats['analysis_date']}

FLOOD EXTENT:
- Total inundated/debris area: {stats['flood_area_km2']:.1f} km²

INFRASTRUCTURE DAMAGE:
- Buildings confirmed affected: {stats['buildings_affected']}
- Buildings possibly affected: {stats['buildings_possibly_affected']}
- Roads damaged: {stats['roads_damaged_km']:.1f} km
- Bridges damaged or destroyed: {stats['bridges_damaged']}

ACCESS:
- Settlements with no road access to nearest town/hospital: {stats['settlements_cutoff']}
- Names of cut-off settlements: {', '.join(stats['cutoff_settlement_names'])}
--- END DATA ---

{lang_instruction}

Write a formal situation report (150–200 words) with these sections:
1. SUMMARY — overview of flood impact using only the data above
2. INFRASTRUCTURE DAMAGE — specific damage figures
3. POPULATION ACCESS — cut-off settlements, urgency for rescue
4. DATA LIMITATIONS — note that Sentinel satellites revisit every 12 days;
   cloud cover may affect optical imagery; assessment is a prototype and not
   a substitute for ground verification

End with: "Satellite data: Contains modified Copernicus Sentinel data 2026."

Do not include any numbers not listed in the data above."""

```

### Rate Limits & Error Handling

```python
import time
from google.api_core.exceptions import ResourceExhausted

def generate_with_retry(self, stats, max_retries=3):
    for attempt in range(max_retries):
        try:
            return self.generate(stats)
        except ResourceExhausted:
            if attempt < max_retries - 1:
                time.sleep(60)  # Wait 1 min before retry (rate limit reset)
            else:
                raise
```

**Free tier limits:**
- 15 requests per minute
- 1,000,000 tokens per day
- Context window: 1M tokens (more than sufficient)

### Example Output

```
SITUATION REPORT — Trishuli Flood, Nepal (26 August 2026)
Analysis Date: 5 October 2026 | Source: Sentinel-1 SAR + Sentinel-2 optical

SUMMARY
Satellite analysis of the Bhote Koshi–Trishuli corridor reveals a total
inundated and debris-covered area of 47.3 km² following the 26 August 2026
glacial outburst flood. The event has caused widespread destruction along the
river valley.

INFRASTRUCTURE DAMAGE
Assessment indicates 312 buildings have been confirmed affected, with an
additional 89 buildings possibly affected. Road damage extends to 28.4 km of
the valley road network, and 7 bridges have been damaged or destroyed,
severely disrupting transportation links.

POPULATION ACCESS
Five settlements have been identified with no remaining road connection to the
nearest town or hospital: Ghatta, Syaule, and Larcha, among others. Immediate
aerial or alternative access for rescue operations is required.

DATA LIMITATIONS
Sentinel satellites revisit each location every 12 days, meaning damage
that occurred between revisit dates may not be fully captured. Monsoon cloud
cover may have limited optical imagery availability. This assessment is an
educational prototype and must be verified by ground teams before operational use.

Satellite data: Contains modified Copernicus Sentinel data 2026.
```
