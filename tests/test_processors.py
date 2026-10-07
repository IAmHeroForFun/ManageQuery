import tempfile
from pathlib import Path
from apps.satellite.downloader import SentinelDownloader
from apps.satellite.sar_processor import SARProcessor
from apps.satellite.optical_processor import OpticalProcessor
from apps.satellite.fusion import MaskFusion
from apps.infrastructure.osm_fetcher import OSMFetcher
from apps.infrastructure.damage_assessor import DamageAssessor

def test_satellite_downloader():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        downloader = SentinelDownloader()
        aoi = {"type": "Polygon", "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]}

        s1_res = downloader.download_sentinel1_pair(aoi, "2026-08-26", tmp_path)
        assert s1_res['pre'].exists()
        assert s1_res['post'].exists()

        s2_res = downloader.download_sentinel2(aoi, "2026-08-26", tmp_path)
        assert s2_res.exists()

        dem_res = downloader.download_copernicus_dem(aoi, tmp_path)
        assert dem_res.exists()

def test_sar_and_optical_fusion():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        aoi = {"type": "Polygon", "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]}

        sar_proc = SARProcessor()
        sar_res = sar_proc.compute_change_mask(tmp_path / 'pre.tif', tmp_path / 'post.tif', aoi, tmp_path)
        assert sar_res['mask_geojson'].exists()
        assert sar_res['flood_area_km2'] > 0

        opt_proc = OpticalProcessor()
        opt_res = opt_proc.process_optical_flood(tmp_path / 's2.tif', aoi, tmp_path)
        assert opt_res['mask_geojson'].exists()

        fusion = MaskFusion()
        fused = fusion.fuse(sar_res, opt_res, tmp_path)
        assert Path(fused['geojson_path']).exists()
        assert fused['source'] == 'fused'

def test_osm_fetcher_and_damage_assessment():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        aoi = {"type": "Polygon", "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]}

        fetcher = OSMFetcher()
        osm_paths = fetcher.fetch_infrastructure(aoi, tmp_path)
        assert osm_paths['roads'].exists()
        assert osm_paths['buildings'].exists()
        assert osm_paths['bridges'].exists()

        sar_proc = SARProcessor()
        sar_res = sar_proc.compute_change_mask(tmp_path / 'pre.tif', tmp_path / 'post.tif', aoi, tmp_path)

        assessor = DamageAssessor()
        damage_res = assessor.assess(sar_res['mask_geojson'], osm_paths, tmp_path)

        assert len(damage_res['records']) > 0
        assert damage_res['buildings_affected'] >= 0
        assert damage_res['roads_damaged_km'] >= 0

def test_osm_fetcher_api_key_and_fallback():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        aoi = {"type": "Polygon", "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]}

        # Test with mock API key that falls back cleanly without breaking
        fetcher_with_key = OSMFetcher(api_key="mock_key_unreachable")
        res_with_key = fetcher_with_key.fetch_infrastructure(aoi, tmp_path / "keyed")
        assert res_with_key['roads'].exists()
        assert res_with_key['buildings'].exists()

        # Test without key
        fetcher_no_key = OSMFetcher(api_key="")
        res_no_key = fetcher_no_key.fetch_infrastructure(aoi, tmp_path / "nokey")
        assert res_no_key['roads'].exists()
        assert res_no_key['buildings'].exists()

def test_ocean_detection_and_zero_infrastructure():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        # Mid Arabian Sea: [65.0, 15.0] to [65.5, 15.5]
        ocean_aoi = {
            "type": "Polygon",
            "coordinates": [[[65.0, 15.0], [65.5, 15.0], [65.5, 15.5], [65.0, 15.5], [65.0, 15.0]]]
        }

        fetcher = OSMFetcher()
        osm_paths = fetcher.fetch_infrastructure(ocean_aoi, tmp_path)

        import json
        with open(osm_paths['roads'], 'r', encoding='utf-8') as f:
            roads = json.load(f)
        with open(osm_paths['buildings'], 'r', encoding='utf-8') as f:
            buildings = json.load(f)
        with open(osm_paths['settlements'], 'r', encoding='utf-8') as f:
            settlements = json.load(f)

        assert len(roads['features']) == 0
        assert len(buildings['features']) == 0
        assert len(settlements['features']) == 0

        # Assess damage in sea
        sar_proc = SARProcessor()
        sar_res = sar_proc.compute_change_mask(tmp_path / 'pre.tif', tmp_path / 'post.tif', ocean_aoi, tmp_path)
        assessor = DamageAssessor()
        damage_res = assessor.assess(sar_res['mask_geojson'], osm_paths, tmp_path)
        assert damage_res['buildings_affected'] == 0
        assert damage_res['roads_damaged_km'] == 0.0
        assert damage_res['bridges_damaged'] == 0

