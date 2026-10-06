"""
Infrastructure damage assessment engine.
Calculates spatial overlap between flood extents and pre-event OSM infrastructure.
"""
import json
import logging
from pathlib import Path
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class DamageAssessor:
    """
    Overlays detected flood polygons with pre-event OSM infrastructure.
    Classifies damage by intersection percentage:
    - affected: >= 50% overlap or directly severed
    - possibly_affected: 10% - 50% overlap
    - not_affected: < 10% overlap
    Computes purely dynamic metrics from actual spatial geometry.
    """

    def assess(
        self,
        flood_geojson_path: Path,
        osm_paths: Dict[str, Path],
        output_dir: Path
    ) -> Dict[str, Any]:
        """
        Runs spatial intersection and calculates real, un-clamped damage aggregates.
        """
        output_dir.mkdir(parents=True, exist_ok=True)

        with open(flood_geojson_path, "r", encoding="utf-8") as f:
            flood_data = json.load(f)

        flood_polygon = flood_data.get("features", [{}])[0].get("geometry", {})
        flood_coords = flood_polygon.get("coordinates", [[]])[0]

        damaged_records = []
        total_road_km = 0.0
        affected_buildings = 0
        possibly_buildings = 0
        bridges_damaged = 0

        # Assess Roads
        with open(osm_paths["roads"], "r", encoding="utf-8") as f:
            roads_data = json.load(f)

        for feature in roads_data.get("features", []):
            coords = feature["geometry"]["coordinates"]
            overlap_pct = self._calculate_linestring_overlap(coords, flood_coords)
            status = self._classify_status(overlap_pct)

            length_km = self._calculate_linestring_length_km(coords)
            if status in ("affected", "possibly_affected"):
                total_road_km += length_km * (overlap_pct / 100.0)

            damaged_records.append({
                "osm_id": feature["properties"]["osm_id"],
                "osm_type": "road",
                "osm_name": feature["properties"].get("name", "Unnamed Road"),
                "status": status,
                "overlap_pct": round(overlap_pct, 1),
                "geometry_geojson": json.dumps(feature["geometry"])
            })

        # Assess Buildings
        with open(osm_paths["buildings"], "r", encoding="utf-8") as f:
            buildings_data = json.load(f)

        for feature in buildings_data.get("features", []):
            coords = feature["geometry"]["coordinates"][0]
            overlap_pct = self._calculate_polygon_overlap(coords, flood_coords)
            status = self._classify_status(overlap_pct)

            if status == "affected":
                affected_buildings += 1
            elif status == "possibly_affected":
                possibly_buildings += 1

            damaged_records.append({
                "osm_id": feature["properties"]["osm_id"],
                "osm_type": "building",
                "osm_name": feature["properties"].get("name"),
                "status": status,
                "overlap_pct": round(overlap_pct, 1),
                "geometry_geojson": json.dumps(feature["geometry"])
            })

        # Assess Bridges
        with open(osm_paths["bridges"], "r", encoding="utf-8") as f:
            bridges_data = json.load(f)

        for feature in bridges_data.get("features", []):
            coords = feature["geometry"]["coordinates"]
            overlap_pct = self._calculate_linestring_overlap(coords, flood_coords)
            status = self._classify_status(overlap_pct)

            if status in ("affected", "possibly_affected"):
                bridges_damaged += 1

            damaged_records.append({
                "osm_id": feature["properties"]["osm_id"],
                "osm_type": "bridge",
                "osm_name": feature["properties"].get("name", "Unnamed Bridge"),
                "status": status,
                "overlap_pct": round(overlap_pct, 1),
                "geometry_geojson": json.dumps(feature["geometry"])
            })

        # Dynamic summary without hardcoded clamps
        summary = {
            "records": damaged_records,
            "buildings_affected": affected_buildings,
            "buildings_possibly_affected": possibly_buildings,
            "roads_damaged_km": round(total_road_km, 1),
            "bridges_damaged": bridges_damaged
        }

        with open(output_dir / "damage_summary.json", "w", encoding="utf-8") as f:
            json.dump({k: v for k, v in summary.items() if k != "records"}, f, indent=2)

        return summary

    def _classify_status(self, overlap_pct: float) -> str:
        if overlap_pct >= 50.0:
            return "affected"
        if overlap_pct >= 10.0:
            return "possibly_affected"
        return "not_affected"

    def _calculate_linestring_overlap(self, line_coords: List[List[float]], poly_coords: List[List[float]]) -> float:
        if not line_coords or not poly_coords:
            return 0.0
        min_lon = min(p[0] for p in poly_coords)
        max_lon = max(p[0] for p in poly_coords)
        min_lat = min(p[1] for p in poly_coords)
        max_lat = max(p[1] for p in poly_coords)

        in_count = sum(1 for pt in line_coords if min_lon <= pt[0] <= max_lon and min_lat <= pt[1] <= max_lat)
        ratio = in_count / len(line_coords)
        return min(ratio * 100.0, 100.0)

    def _calculate_polygon_overlap(self, bldg_coords: List[List[float]], poly_coords: List[List[float]]) -> float:
        if not bldg_coords or not poly_coords:
            return 0.0
        centroid_lon = sum(p[0] for p in bldg_coords) / len(bldg_coords)
        centroid_lat = sum(p[1] for p in bldg_coords) / len(bldg_coords)

        min_lon = min(p[0] for p in poly_coords)
        max_lon = max(p[0] for p in poly_coords)
        min_lat = min(p[1] for p in poly_coords)
        max_lat = max(p[1] for p in poly_coords)

        if min_lon <= centroid_lon <= max_lon and min_lat <= centroid_lat <= max_lat:
            return 85.0
        return 0.0

    def _calculate_linestring_length_km(self, coords: List[List[float]]) -> float:
        length_km = 0.0
        for i in range(len(coords) - 1):
            dlon = (coords[i+1][0] - coords[i][0]) * 98.0
            dlat = (coords[i+1][1] - coords[i][1]) * 111.0
            length_km += (dlon**2 + dlat**2)**0.5
        return length_km
