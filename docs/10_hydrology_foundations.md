# 10 — Hydrologic Foundations & Digital Elevation Modeling
## Mapping Flood Damage from Space (MFDFS)

> **Scientific Standards:** Bedient, Huber & Vieux (2019); Chow, Maidment & Mays (1988); Chuvieco (2016)  
> **Applicable Competition Track:** Multimodal AI Hackathon 2026 (Track B: Mapping Flood Damage from Space)

---

## 1. Introduction & Theoretical Framework

The MFDFS pipeline integrates satellite remote sensing with classical hydrology principles to produce rapid, physics-grounded disaster intelligence. Rather than treating satellite raster observations as isolated image classifications, our architecture grounds flood inundation, downhill gravity propagation, and structural vulnerability in recognized hydro-spatial textbooks:

1. **Topographic Gradient & D8 Drainage Routing**: Bedient, Huber & Vieux (2019), *Hydrology and Floodplain Analysis* (5th Edition), Chapter 10: "GIS Applications in Hydrology & Digital Representation of Topography".
2. **Kinematic Channel Wave Propagation**: Chow, Maidment & Mays (1988), *Applied Hydrology*, Chapters 5 & 9: "Hydrologic & Hydraulic Routing".
3. **Radar Backscatter Change & Dielectric Permittivity**: Chuvieco (2016), *Fundamentals of Satellite Remote Sensing*, Section 2.7.4 & Section 7.3.4.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        COPERNICUS DEM-30m                              │
│             Topographic Elevation Grid Matrix: Z(x, y)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              D8 STEEPEST-SLOPE GRADIENT ROUTING                        │
│          Bedient et al. (2019), Eq. 10-1: S_max = max(Δz / L)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 KINEMATIC FLOOD ARRIVAL TIME (ETA)                     │
│         Chow et al. (1988), Chapter 9: t_arr = Σ (ΔL / v_k)            │
│            v_k = c * sqrt(g * h_eff) or Manning celerity               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              SATELLITE SAR RADAR CROSS-VALIDATION                      │
│        Chuvieco (2016): Δσ° = 10 * log10(σ°_post / σ°_pre) <= -3.0 dB  │
│        Specular reflection confirms low-elevation channel flow         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Topographic Modeling: The D8 Steepest-Slope Algorithm

### Mathematical Formulation
Per **Bedient et al. (2019), Section 10.4**, water on a digital surface moves in the direction of the steepest downward gradient. In a raster digital elevation model (DEM) with grid spacing $\Delta x, \Delta y$:

For any central cell $i$ surrounded by an 8-neighborhood kernel $j \in \{1, \dots, 8\}$, the slope $S_{i, j}$ to each neighboring cell is:

$$S_{i, j} = \frac{z_i - z_j}{L_{i, j}}$$

where:
- $z_i$ is the elevation of the center cell (meters).
- $z_j$ is the elevation of neighbor cell $j$.
- $L_{i, j}$ is the planimetric distance between cell centroids:
  - $L = \Delta x$ for orthogonal neighbors (North, South, East, West).
  - $L = \sqrt{2} \Delta x$ for diagonal neighbors (NE, NW, SE, SW).

The flow direction $\vec{D}_i$ is assigned to the neighbor that maximizes $S_{i, j}$:

$$\vec{D}_i = \arg\max_{j} \left( \frac{z_i - z_j}{L_{i, j}} \right) \quad \text{for } z_i > z_j$$

### Implementation in MFDFS (`apps/dem/path_tracer.py`)
In [`apps/dem/path_tracer.py`](file:///mnt/Personal/Projects/Mfdfs/apps/dem/path_tracer.py), this algorithm traces debris flows, glacial lake outburst floods (GLOF), and flash floods downhill from a defined glacial lake or breach initiation point:
1. At each waypoint $(x_k, y_k)$, a $3 \times 3$ elevation window is sampled from Copernicus DEM-30m.
2. The steepest descent vector is computed. If local pit depressions or saddle points occur, the algorithm bridges the depression along the general regional drainage axis.
3. The flow path terminates when reaching the Area of Interest boundary or a flat base elevation.

---

## 3. Kinematic Flood Wave Celerity & Arrival ETA

### Hydrodynamic Basis
Per **Chow, Maidment & Mays (1988), Section 9.1–9.3**, for steep mountain streams and flash flood corridors, the kinematic wave approximation assumes that friction slope equals bed slope ($S_f \approx S_0$).

The kinematic wave celerity $c_k$ (the propagation speed of the flood disturbance) is related to average flow velocity $v$ by:

$$c_k = \frac{dQ}{dA} = \beta v$$

where $\beta \approx 1.5$ for wide rectangular or natural mountain channels governed by Manning's equation.

For high-gradient Himalayan valleys (such as the Melamchi/Trishuli gorge with bed slope $S_0 \in [0.015, 0.05]$):
- Channel velocity: $v \approx 3.0 \text{ to } 7.5 \text{ m/s}$ ($10.8 \text{ to } 27.0 \text{ km/h}$).
- The cumulative arrival time $T_{\text{arr}}$ from the breach source to any downstream village located at path distance $D$ is:

$$T_{\text{arr}} = \sum_{k=1}^{N} \frac{\Delta L_k}{v_k(S_k)}$$

In [`apps/dem/path_tracer.py`](file:///mnt/Personal/Projects/Mfdfs/apps/dem/path_tracer.py), each downstream community along the flow path is assigned an **Estimated Time of Arrival (ETA)** calculated dynamically from its cumulative topographic channel distance.

---

## 4. SAR Radar Dielectric Permittivity & Speckle Physics

### Remote Sensing Physics
Per **Chuvieco (2016), Section 2.7.4 & 7.3.4**:
- **Dielectric Permittivity**: Dry terrestrial soil and rock possess a low relative dielectric constant ($\epsilon_r \approx 3 - 8$). Fresh water has a very high dielectric constant ($\epsilon_r \approx 80$).
- **Specular Reflection**: Calm water surfaces act as smooth electromagnetic specular reflectors at C-band wavelength ($\lambda \approx 5.6 \text{ cm}$ for Sentinel-1). Rather than scattering radar energy back to the antenna, microwave pulses are reflected away into space.
- **Backscatter Drop**: This causes a pronounced drop in radar cross-section $\sigma^0$ (typically dropping below $-18 \text{ to } -22 \text{ dB}$).

### Two-Step Thresholding Strategy
Per Chuvieco (2016, Section 7.3.4.7), single-date thresholding produces high commission errors in flat, radar-dark surfaces (airports, asphalt). MFDFS implements **multitemporal differential log-ratio change detection**:

$$\Delta \sigma^0_{\text{dB}} = 10 \log_{10} \left( \frac{\sigma^0_{\text{post}}}{\sigma^0_{\text{pre}}} \right)$$

Applying Otsu's bimodal histogram thresholding isolates genuine inundation while rejecting permanent calm water bodies and pre-existing smooth surfaces.

---

## 5. Summary Table: Scientific Principles in MFDFS

| Pipeline Component | Scientific Foundation | Textbook Citation | Applied Formula / Standard |
| :--- | :--- | :--- | :--- |
| **DEM Flow Path Tracing** | D8 Steepest Descent Routing | Bedient et al. (2019), Ch. 10 | $S_{\max} = \max_j \frac{z_i - z_j}{L_{i, j}}$ |
| **Downstream Village ETAs** | Kinematic Wave Celerity | Chow et al. (1988), Ch. 9 | $T_{\text{arr}} = \sum \frac{\Delta L}{c_k}$ |
| **SAR Flood Detection** | Specular Radar Reflection & Otsu | Chuvieco (2016), Ch. 2 & 7 | $\Delta \sigma^0_{\text{dB}} = 10 \log_{10}(\sigma^0_{\text{post}} / \sigma^0_{\text{pre}})$ |
| **Road Network Damage** | Spatial Intersection & Network Cutoff | Bedient et al. (2019), Ch. 12 | Topological BFS Graph Disconnection |
| **EMSR927 Benchmark** | Scientific Error Matrix & Cohen's $\kappa$ | Chuvieco (2016), Ch. 8 | $\text{IoU} = \frac{TP}{TP + FP + FN}$, Cohen's $\kappa$ |

---

## 6. Academic References

1. **Bedient, P. B., Huber, W. C., & Vieux, B. E. (2019)**. *Hydrology and Floodplain Analysis* (5th Edition). Pearson / Prentice Hall.
2. **Chow, V. T., Maidment, D. R., & Mays, L. W. (1988)**. *Applied Hydrology*. McGraw-Hill International Editions.
3. **Chuvieco, E. (2016)**. *Fundamentals of Satellite Remote Sensing: An Environmental Approach* (2nd Edition). CRC Press, Taylor & Francis Group.
4. **Raghunath, H. M. (2006)**. *Hydrology: Principles, Analysis and Design* (2nd Edition). New Age International Publishers.
5. **Schumann, G. J.-P. (2024)**. *Earth Observation for Flood Hazard Mapping and Risk Assessment*. Reviews of Geophysics.
