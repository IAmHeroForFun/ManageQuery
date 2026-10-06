import tempfile
import json
from pathlib import Path
from apps.infrastructure.osm_fetcher import OSMFetcher
from apps.connectivity.graph_analysis import ConnectivityAnalyzer
from apps.connectivity.flood_path import FloodPathTracer

def test_connectivity_analysis():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        aoi = {"type": "Polygon", "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]}

        fetcher = OSMFetcher()
        osm_paths = fetcher.fetch_infrastructure(aoi, tmp_path)

        with open(osm_paths["roads"], "r") as f:
            roads_data = json.load(f)

        road_ids = [feat["properties"]["osm_id"] for feat in roads_data.get("features", [])]
        damaged_features = [{"osm_id": r_id, "status": "affected"} for r_id in road_ids]

        analyzer = ConnectivityAnalyzer()
        results = analyzer.analyze_settlement_isolation(damaged_features, osm_paths, tmp_path)
        assert len(results) > 0

        # When all roads are severed, non-hub settlements are isolated
        cutoff_villages = [r["name"] for r in results if r["is_cutoff"]]
        assert len(cutoff_villages) >= 1

def test_flood_path_tracing():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        aoi = {"type": "Polygon", "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]}

        fetcher = OSMFetcher()
        osm_paths = fetcher.fetch_infrastructure(aoi, tmp_path)

        tracer = FloodPathTracer()
        res = tracer.trace_path_downstream(85.45, 28.36, tmp_path / "dem.tif", osm_paths, tmp_path)

        path_data = json.loads(res["path_geojson"])
        assert path_data["type"] == "LineString"
        assert len(path_data["coordinates"]) > 10
        assert res["path_length_km"] > 0
        settlements = json.loads(res["settlements_on_path"])
        assert len(settlements) > 0
