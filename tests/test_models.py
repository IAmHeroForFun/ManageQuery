import json
import pytest
from datetime import date
from apps.analysis.models import (
    AnalysisJob, FloodExtent, DamagedFeature,
    CutoffSettlement, FloodPath, SituationReport
)

@pytest.mark.django_db
def test_analysis_job_lifecycle():
    aoi_data = {
        "type": "Polygon",
        "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]
    }
    job = AnalysisJob.objects.create(
        aoi_geojson=json.dumps(aoi_data),
        flood_date=date(2026, 8, 26),
        use_segmentation=True,
        trace_flood_path=True,
        source_point_lon=85.45,
        source_point_lat=28.36
    )

    assert job.status == 'queued'
    assert job.progress == 0
    assert job.aoi['type'] == 'Polygon'
    assert str(job).startswith(f"Job {job.id}")

    # Create associated models
    extent = FloodExtent.objects.create(
        job=job,
        geojson_path='/path/to/extent.geojson',
        source='fused',
        confidence_score=0.91
    )
    assert extent.job == job
    assert job.flood_extent == extent

    damaged = DamagedFeature.objects.create(
        job=job,
        osm_id='way/12345',
        osm_type='road',
        osm_name='Pasang Lhamu Highway',
        status='affected',
        overlap_pct=88.5,
        geometry_geojson='{"type": "LineString", "coordinates": [[85.3, 28.2], [85.4, 28.3]]}'
    )
    assert damaged.status == 'affected'
    assert job.damaged_features.count() == 1

    settlement = CutoffSettlement.objects.create(
        job=job,
        name='Ghatta',
        geometry_geojson='{"type": "Point", "coordinates": [85.3, 28.2]}',
        is_cutoff=True,
        nearest_hospital='Bidur Hospital'
    )
    assert settlement.is_cutoff is True
    assert job.cutoff_settlements.filter(is_cutoff=True).count() == 1

    report = SituationReport.objects.create(
        job=job,
        report_english='Test English Report',
        report_nepali='परीक्षण नेपाली रिपोर्ट',
        stats_snapshot='{}'
    )
    assert report.job == job
    assert job.situation_report.report_english == 'Test English Report'
