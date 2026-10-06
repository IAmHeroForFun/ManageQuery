import tempfile
from pathlib import Path
from apps.ai.segmentation.predict import FloodPredictor
from apps.ai.segmentation.evaluate import compute_segmentation_metrics
from apps.ai.situation_report.generator import SituationReportGenerator

def test_ai_segmentation_inference():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        predictor = FloodPredictor()
        res = predictor.predict_scene(tmp_path / "s1.tif", tmp_path)
        assert Path(res["geotiff_path"]).exists()
        assert res["metrics"]["iou_water"] > 0.5
        assert res["metrics"]["f1_score"] > 0.6

def test_segmentation_metrics():
    preds = [1, 1, 0, 2, 0, 1]
    targets = [1, 0, 0, 2, 2, 1]
    metrics = compute_segmentation_metrics(preds, targets, num_classes=3)
    assert "iou_water" in metrics
    assert "f1_score" in metrics
    assert 0.0 <= metrics["mean_iou"] <= 1.0

def test_bilingual_situation_report_grounding():
    stats = {
        "flood_date": "2026-08-26",
        "area_name": "Bhote Koshi–Trishuli River Corridor, Nepal",
        "flood_area_km2": 47.3,
        "buildings_affected": 312,
        "buildings_possibly_affected": 89,
        "roads_damaged_km": 28.4,
        "bridges_damaged": 7,
        "settlements_cutoff": 5,
        "cutoff_settlement_names": ["Ghatta", "Syaule", "Larcha"],
        "data_source": "Sentinel-1 SAR + Sentinel-2 Optical",
        "analysis_date": "2026-10-05"
    }

    generator = SituationReportGenerator()
    report = generator.generate(stats)

    assert "english" in report
    assert "nepali" in report
    assert len(report["english"]) > 100
    assert len(report["nepali"]) > 100

    # Verify key grounded quantities are present in the text
    assert "47.3" in report["english"]
    assert "312" in report["english"]
    assert "28.4" in report["english"]
    assert "Ghatta" in report["english"]
