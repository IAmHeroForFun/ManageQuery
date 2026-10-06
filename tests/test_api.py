import json
import pytest
from datetime import date
from rest_framework.test import APIClient
from apps.analysis.models import AnalysisJob, FloodExtent, DamagedFeature, CutoffSettlement, SituationReport

@pytest.fixture
def client():
    return APIClient()

@pytest.fixture
def sample_job(db):
    aoi_data = {
        "type": "Polygon",
        "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]
    }
    job = AnalysisJob.objects.create(
        aoi_geojson=json.dumps(aoi_data),
        flood_date=date(2026, 8, 26),
        status='completed',
        progress=100,
        flood_area_km2=47.3,
        buildings_affected=312,
        roads_damaged_km=28.4,
        bridges_damaged=7,
        settlements_cutoff=3
    )

    FloodExtent.objects.create(
        job=job,
        geojson_path='',
        source='fused',
        confidence_score=0.91
    )

    DamagedFeature.objects.create(
        job=job,
        osm_id='way/101',
        osm_type='road',
        osm_name='Araniko Link',
        status='affected',
        overlap_pct=85.0,
        geometry_geojson='{"type": "LineString", "coordinates": [[85.3, 28.2], [85.4, 28.3]]}'
    )

    CutoffSettlement.objects.create(
        job=job,
        name='Ghatta',
        geometry_geojson='{"type": "Point", "coordinates": [85.3, 28.2]}',
        is_cutoff=True,
        nearest_hospital='Bidur Hospital'
    )

    return job

@pytest.mark.django_db
def test_create_analysis_job(client):
    payload = {
        "aoi": {
            "type": "Polygon",
            "coordinates": [[[85.2, 28.1], [85.5, 28.1], [85.5, 28.4], [85.2, 28.4], [85.2, 28.1]]]
        },
        "flood_date": "2026-08-26",
        "use_segmentation": True,
        "trace_flood_path": True,
        "source_point": {
            "type": "Point",
            "coordinates": [85.45, 28.36]
        }
    }
    resp = client.post('/api/analysis/', data=payload, format='json')
    assert resp.status_code == 201
    assert 'id' in resp.data
    assert resp.data['status'] in ('queued', 'completed', 'processing')

@pytest.mark.django_db
def test_get_job_detail(client, sample_job):
    resp = client.get(f'/api/analysis/{sample_job.id}/')
    assert resp.status_code == 200
    assert resp.data['status'] == 'completed'
    assert resp.data['flood_area_km2'] == 47.3

@pytest.mark.django_db
def test_get_damaged_features(client, sample_job):
    resp = client.get(f'/api/analysis/{sample_job.id}/damaged-features/')
    assert resp.status_code == 200
    assert resp.data['type'] == 'FeatureCollection'
    assert len(resp.data['features']) == 1
    assert resp.data['features'][0]['properties']['osm_type'] == 'road'

@pytest.mark.django_db
def test_get_cutoff_settlements(client, sample_job):
    resp = client.get(f'/api/analysis/{sample_job.id}/cutoff-settlements/')
    assert resp.status_code == 200
    assert resp.data['type'] == 'FeatureCollection'
    assert len(resp.data['features']) == 1
    assert resp.data['features'][0]['properties']['is_cutoff'] is True

@pytest.mark.django_db
def test_generate_and_fetch_situation_report(client, sample_job):
    # Generate report
    post_resp = client.post(f'/api/analysis/{sample_job.id}/report/')
    assert post_resp.status_code == 201
    assert 'report_english' in post_resp.data
    assert 'report_nepali' in post_resp.data
    assert len(post_resp.data['report_english']) > 50

    # Fetch report
    get_resp = client.get(f'/api/analysis/{sample_job.id}/report/')
    assert get_resp.status_code == 200
    assert get_resp.data['report_english'] == post_resp.data['report_english']
