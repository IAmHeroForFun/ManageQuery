import json
import pytest
from datetime import date
from apps.analysis.models import AnalysisJob
from apps.analysis.tasks import run_flood_analysis

@pytest.mark.django_db
def test_full_pipeline_end_to_end():
    # 1. Create a job
    aoi_data = {
        "type": "Polygon",
        "coordinates": [
            [
                [85.15, 27.95],
                [85.55, 27.95],
                [85.55, 28.45],
                [85.15, 28.45],
                [85.15, 27.95]
            ]
        ]
    }
    job = AnalysisJob.objects.create(
        aoi_geojson=json.dumps(aoi_data),
        flood_date=date(2026, 8, 26),
        use_segmentation=True,
        trace_flood_path=True,
        source_point_lon=85.45,
        source_point_lat=28.36
    )

    # 2. Run the pipeline end to end
    run_flood_analysis(str(job.id))

    # 3. Reload job from database
    job.refresh_from_db()

    # 4. Verify outcomes
    assert job.status == 'completed'
    assert job.progress == 100
    assert job.flood_area_km2 is not None and job.flood_area_km2 > 0
    assert job.buildings_affected is not None and job.buildings_affected > 0
    assert job.roads_damaged_km is not None and job.roads_damaged_km > 0
    assert job.bridges_damaged is not None and job.bridges_damaged > 0
    assert job.settlements_cutoff is not None and job.settlements_cutoff > 0

    # Verify associated models populated
    assert hasattr(job, 'flood_extent')
    assert job.flood_extent.source in ('sar_only', 'fused')
    assert job.damaged_features.count() > 0
    assert job.cutoff_settlements.count() > 0
    assert job.cutoff_settlements.filter(is_cutoff=True).count() > 0
    assert hasattr(job, 'flood_path')
    assert job.flood_path.path_length_km > 0
