"""
Celery asynchronous task orchestrator for end-to-end flood damage analysis.
"""
import logging
from datetime import datetime
from pathlib import Path
from django.conf import settings
from django.utils import timezone

try:
    from celery import shared_task
except ImportError:
    # Standard fallback decorator when celery is not installed
    def shared_task(func=None, **kwargs):
        if func is not None and callable(func):
            def wrapper(*a, **kw):
                return func(*a, **kw)
            wrapper.delay = lambda *a, **kw: wrapper(*a, **kw)
            return wrapper

        def decorator(f):
            def wrapper(*a, **kw):
                return f(*a, **kw)
            wrapper.delay = lambda *a, **kw: wrapper(*a, **kw)
            return wrapper
        return decorator

from apps.core.utils import get_job_storage_paths
from .models import (
    AnalysisJob, FloodExtent, DamagedFeature,
    CutoffSettlement, FloodPath
)
from apps.satellite.downloader import SentinelDownloader
from apps.satellite.sar_processor import SARProcessor
from apps.satellite.optical_processor import OpticalProcessor
from apps.satellite.fusion import MaskFusion
from apps.infrastructure.osm_fetcher import OSMFetcher
from apps.infrastructure.damage_assessor import DamageAssessor
from apps.connectivity.graph_analysis import ConnectivityAnalyzer
from apps.connectivity.flood_path import FloodPathTracer
from apps.ai.segmentation.predict import FloodPredictor

logger = logging.getLogger(__name__)

def update_job_progress(job: AnalysisJob, progress: int, current_step: str, status: str = 'processing'):
    job.progress = progress
    job.current_step = current_step
    job.status = status
    job.save(update_fields=['progress', 'current_step', 'status', 'updated_at'])
    logger.info("Job %s -> %d%%: %s", job.id, progress, current_step)

@shared_task
def run_flood_analysis(job_id: str, *args, **kwargs):
    """
    Main asynchronous pipeline running the complete workflow end-to-end.
    """
    try:
        job = AnalysisJob.objects.get(id=job_id)
    except AnalysisJob.DoesNotExist:
        logger.error("AnalysisJob %s not found.", job_id)
        return

    try:
        paths = get_job_storage_paths(job.id, settings.MEDIA_ROOT)
        aoi = job.aoi
        flood_date_str = str(job.flood_date)

        # ---------------------------------------------------------------------
        # STEP 1: Download Satellite & DEM Data (10% - 25%)
        # ---------------------------------------------------------------------
        update_job_progress(job, 10, "Downloading Sentinel-1 SAR & Sentinel-2 imagery...", status='downloading')
        downloader = SentinelDownloader()
        s1_files = downloader.download_sentinel1_pair(aoi, flood_date_str, paths['raw'])
        s2_file = downloader.download_sentinel2(aoi, flood_date_str, paths['raw'])
        dem_file = downloader.download_copernicus_dem(aoi, paths['raw'])

        job.sentinel1_pre_path = str(s1_files['pre'])
        job.sentinel1_post_path = str(s1_files['post'])
        job.sentinel2_path = str(s2_file) if s2_file else ""
        job.dem_path = str(dem_file)
        job.save()

        update_job_progress(job, 25, "Fetching pre-event OpenStreetMap infrastructure...")
        osm_fetcher = OSMFetcher()
        osm_paths = osm_fetcher.fetch_infrastructure(aoi, paths['raw'])

        # ---------------------------------------------------------------------
        # STEP 2: SAR Change Detection (35% - 45%)
        # ---------------------------------------------------------------------
        update_job_progress(job, 35, "Running Sentinel-1 SAR log-ratio change detection...", status='processing')
        sar_proc = SARProcessor(despeckle=True)
        sar_result = sar_proc.compute_change_mask(s1_files['pre'], s1_files['post'], aoi, paths['processed'])

        # ---------------------------------------------------------------------
        # STEP 3: Optical NDWI & Sensor Fusion (50% - 55%)
        # ---------------------------------------------------------------------
        update_job_progress(job, 50, "Processing Sentinel-2 NDWI & fusing sensor masks...")
        optical_proc = OpticalProcessor()
        optical_result = optical_proc.process_optical_flood(s2_file, aoi, paths['processed']) if s2_file else None

        fusion = MaskFusion()
        fused_result = fusion.fuse(sar_result, optical_result, paths['outputs'])

        # Persist Flood Extent
        FloodExtent.objects.update_or_create(
            job=job,
            defaults={
                'geojson_path': fused_result['geojson_path'],
                'geotiff_path': fused_result['geotiff_path'],
                'confidence_score': fused_result['confidence'],
                'source': fused_result['source'],
            }
        )
        job.flood_area_km2 = fused_result['area_km2']

        # ---------------------------------------------------------------------
        # STEP 4: OSM Infrastructure Damage Assessment (65% - 70%)
        # ---------------------------------------------------------------------
        update_job_progress(job, 65, "Assessing damage to buildings, roads, and bridges...")
        assessor = DamageAssessor()
        damage_summary = assessor.assess(Path(fused_result['geojson_path']), osm_paths, paths['outputs'])

        # Save Damaged Features
        DamagedFeature.objects.filter(job=job).delete()
        feature_objs = [
            DamagedFeature(
                job=job,
                osm_id=rec['osm_id'],
                osm_type=rec['osm_type'],
                osm_name=rec.get('osm_name'),
                status=rec['status'],
                overlap_pct=rec['overlap_pct'],
                geometry_geojson=rec['geometry_geojson']
            )
            for rec in damage_summary['records']
        ]
        DamagedFeature.objects.bulk_create(feature_objs)

        job.buildings_affected = damage_summary['buildings_affected']
        job.buildings_possibly_affected = damage_summary['buildings_possibly_affected']
        job.roads_damaged_km = damage_summary['roads_damaged_km']
        job.bridges_damaged = damage_summary['bridges_damaged']

        # ---------------------------------------------------------------------
        # STEP 5: Road Graph Connectivity Analysis (75% - 80%)
        # ---------------------------------------------------------------------
        update_job_progress(job, 75, "Analyzing road network graph and finding cut-off settlements...")
        connectivity = ConnectivityAnalyzer()
        cutoff_results = connectivity.analyze_settlement_isolation(
            damage_summary['records'], osm_paths, paths['outputs']
        )

        CutoffSettlement.objects.filter(job=job).delete()
        cutoff_objs = [
            CutoffSettlement(
                job=job,
                name=rec['name'],
                geometry_geojson=rec['geometry_geojson'],
                is_cutoff=rec['is_cutoff'],
                nearest_hospital=rec['nearest_hospital'],
                nearest_hospital_geojson=rec['nearest_hospital_geojson'],
                pre_flood_distance_km=rec['pre_flood_distance_km'],
                population_estimate=rec['population_estimate']
            )
            for rec in cutoff_results
        ]
        CutoffSettlement.objects.bulk_create(cutoff_objs)
        job.settlements_cutoff = sum(1 for r in cutoff_results if r['is_cutoff'])

        # ---------------------------------------------------------------------
        # STEP 6: AI Bonus #1 — U-Net Segmentation (85%)
        # ---------------------------------------------------------------------
        if job.use_segmentation:
            update_job_progress(job, 85, "Applying U-Net deep learning flood segmentation model...")
            predictor = FloodPredictor()
            predictor.predict_scene(s1_files['post'], paths['outputs'])

        # ---------------------------------------------------------------------
        # STEP 7: AI Bonus #2 — D8 Flood Path Tracing (92%)
        # ---------------------------------------------------------------------
        if job.trace_flood_path and job.source_point_lon and job.source_point_lat:
            update_job_progress(job, 92, "Tracing downhill flood path with D8 elevation routing...")
            tracer = FloodPathTracer()
            path_result = tracer.trace_path_downstream(
                job.source_point_lon, job.source_point_lat, dem_file, osm_paths, paths['outputs']
            )
            FloodPath.objects.update_or_create(
                job=job,
                defaults={
                    'source_point_geojson': path_result['source_point_geojson'],
                    'path_geojson': path_result['path_geojson'],
                    'settlements_on_path': path_result['settlements_on_path'],
                    'path_length_km': path_result['path_length_km'],
                    'start_elevation_m': path_result.get('start_elevation_m', 0),
                    'end_elevation_m': path_result.get('end_elevation_m', 0),
                    'elevation_drop_m': path_result.get('elevation_drop_m', 0),
                    'avg_speed_kmh': path_result.get('avg_speed_kmh', 0.0),
                    'settlement_etas': path_result.get('settlement_etas', '[]'),
                }
            )

        # ---------------------------------------------------------------------
        # COMPLETE JOB
        # ---------------------------------------------------------------------
        job.progress = 100
        job.current_step = "Analysis completed successfully."
        job.status = "completed"
        job.completed_at = timezone.now()
        job.save()
        logger.info("Job %s completed successfully.", job.id)

    except Exception as e:
        logger.exception("Error processing analysis job %s: %s", job_id, e)
        job.status = "failed"
        job.error_message = str(e)
        job.current_step = f"Processing error: {str(e)[:150]}"
        job.save()
