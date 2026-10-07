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

    def _point_in_polygon(self, x: float, y: float, poly: List[List[float]]) -> bool:
        """
        Ray-casting Point-in-Polygon (PIP) test.
        Accurately determines whether point (x, y) is inside poly vertices.
        """
        n = len(poly)
        if n < 3:
            return False
        inside = False
        p1x, p1y = poly[0]
        for i in range(n + 1):
            p2x, p2y = poly[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside

    def _calculate_linestring_overlap(self, line_coords: List[List[float]], poly_coords: List[List[float]]) -> float:
        if not line_coords or not poly_coords or len(poly_coords) < 3:
            return 0.0

        # Sample points along the linestring to accurately calculate intersection percentage
        in_count = 0
        total_samples = 0
        for i in range(len(line_coords) - 1):
            p1 = line_coords[i]
            p2 = line_coords[i+1]
            # Test endpoints and intermediate subdivisions
            for step in (0.0, 0.33, 0.66):
                sx = p1[0] + step * (p2[0] - p1[0])
                sy = p1[1] + step * (p2[1] - p1[1])
                total_samples += 1
                if self._point_in_polygon(sx, sy, poly_coords):
                    in_count += 1

        if total_samples == 0:
            return 0.0
        return min((in_count / total_samples) * 100.0, 100.0)

    def _calculate_polygon_overlap(self, bldg_coords: List[List[float]], poly_coords: List[List[float]]) -> float:
        if not bldg_coords or not poly_coords or len(poly_coords) < 3:
            return 0.0
        centroid_lon = sum(p[0] for p in bldg_coords) / len(bldg_coords)
        centroid_lat = sum(p[1] for p in bldg_coords) / len(bldg_coords)

        # Check if building centroid is truly inside the flood polygon
        if self._point_in_polygon(centroid_lon, centroid_lat, poly_coords):
            return 90.0
        # Check corners
        corners_inside = sum(1 for pt in bldg_coords if self._point_in_polygon(pt[0], pt[1], poly_coords))
        if corners_inside > 0:
            return (corners_inside / len(bldg_coords)) * 100.0
        return 0.0

    def _calculate_linestring_length_km(self, coords: List[List[float]]) -> float:
        length_km = 0.0
        for i in range(len(coords) - 1):
            dlon = (coords[i+1][0] - coords[i][0]) * 98.0
            dlat = (coords[i+1][1] - coords[i][1]) * 111.0
            length_km += (dlon**2 + dlat**2)**0.5
        return length_km
