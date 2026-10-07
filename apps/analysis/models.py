import json
from django.db import models
from apps.core.models import TimeStampedUUIDModel

class AnalysisJob(TimeStampedUUIDModel):
    """
    Root entity representing a request to analyse flood damage in an AOI.
    """
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('downloading', 'Downloading'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued', db_index=True)
    progress = models.IntegerField(default=0)
    current_step = models.CharField(max_length=255, default='Queued for processing')
    error_message = models.TextField(blank=True, null=True)

    aoi_geojson = models.TextField(help_text="User selected AOI geometry in GeoJSON format")
    flood_date = models.DateField(db_index=True)

    use_segmentation = models.BooleanField(default=True, help_text="Run U-Net flood segmentation model")
    trace_flood_path = models.BooleanField(default=False, help_text="Trace flood path downstream using DEM")
    source_point_lon = models.FloatField(null=True, blank=True)
    source_point_lat = models.FloatField(null=True, blank=True)

    # Processed file references
    sentinel1_pre_path = models.CharField(max_length=500, blank=True, default='')
    sentinel1_post_path = models.CharField(max_length=500, blank=True, default='')
    sentinel2_path = models.CharField(max_length=500, blank=True, default='')
    dem_path = models.CharField(max_length=500, blank=True, default='')

    # Aggregate outcome metrics
    flood_area_km2 = models.FloatField(null=True, blank=True)
    buildings_affected = models.IntegerField(null=True, blank=True)
    buildings_possibly_affected = models.IntegerField(null=True, blank=True)
    roads_damaged_km = models.FloatField(null=True, blank=True)
    bridges_damaged = models.IntegerField(null=True, blank=True)
    settlements_cutoff = models.IntegerField(null=True, blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Job {self.id} [{self.status}] - {self.flood_date}"

    @property
    def aoi(self):
        try:
            return json.loads(self.aoi_geojson)
        except Exception:
            return {}


class FloodExtent(TimeStampedUUIDModel):
    """
    Polygon or raster mask of the identified flood/debris extent.
    """
    job = models.OneToOneField(AnalysisJob, on_delete=models.CASCADE, related_name='flood_extent')
    geojson_path = models.CharField(max_length=500)
    geotiff_path = models.CharField(max_length=500, blank=True, default='')
    confidence_score = models.FloatField(default=0.85)
    source = models.CharField(max_length=50, default='fused', help_text="'sar_only', 'optical_only', or 'fused'")

    def __str__(self):
        return f"Flood Extent for Job {self.job_id} ({self.source})"


class DamagedFeature(TimeStampedUUIDModel):
    """
    An OSM infrastructure feature identified as damaged or affected.
    """
    STATUS_CHOICES = [
        ('affected', 'Affected'),
        ('possibly_affected', 'Possibly Affected'),
        ('not_affected', 'Not Affected'),
    ]

    job = models.ForeignKey(AnalysisJob, on_delete=models.CASCADE, related_name='damaged_features')
    osm_id = models.CharField(max_length=100)
    osm_type = models.CharField(max_length=50, help_text="'building', 'road', or 'bridge'")
    osm_name = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='affected', db_index=True)
    overlap_pct = models.FloatField(default=0.0)
    geometry_geojson = models.TextField(help_text="Feature geometry in GeoJSON format")

    class Meta:
        indexes = [
            models.Index(fields=['job', 'status']),
            models.Index(fields=['job', 'osm_type']),
        ]

    def __str__(self):
        return f"{self.osm_type} {self.osm_id} - {self.status}"


class CutoffSettlement(TimeStampedUUIDModel):
    """
    Settlement or village analyzed for road network isolation.
    """
    job = models.ForeignKey(AnalysisJob, on_delete=models.CASCADE, related_name='cutoff_settlements')
    name = models.CharField(max_length=255)
    geometry_geojson = models.TextField(help_text="Point geometry in GeoJSON format")
    is_cutoff = models.BooleanField(default=True, db_index=True)
    nearest_hospital = models.CharField(max_length=255, blank=True, null=True)
    nearest_hospital_geojson = models.TextField(blank=True, null=True)
    pre_flood_distance_km = models.FloatField(null=True, blank=True)
    population_estimate = models.IntegerField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=['job', 'is_cutoff']),
        ]

    def __str__(self):
        status = "Cut Off" if self.is_cutoff else "Connected"
        return f"Settlement {self.name} - {status}"


class FloodPath(TimeStampedUUIDModel):
    """
    D8 flow routed downhill flood path from source point.
    """
    job = models.OneToOneField(AnalysisJob, on_delete=models.CASCADE, related_name='flood_path')
    source_point_geojson = models.TextField()
    path_geojson = models.TextField(help_text="LineString of the flow path")
    settlements_on_path = models.TextField(default='[]', help_text="JSON list of settlements along the path")
    path_length_km = models.FloatField(default=0.0)
    start_elevation_m = models.IntegerField(default=0)
    end_elevation_m = models.IntegerField(default=0)
    elevation_drop_m = models.IntegerField(default=0)
    avg_speed_kmh = models.FloatField(default=0.0)
    settlement_etas = models.TextField(default='[]', help_text="JSON list of settlements with arrival timeline")

    def __str__(self):
        return f"Flood Path for Job {self.job_id} ({self.path_length_km:.1f} km, drop {self.elevation_drop_m}m)"


class SituationReport(TimeStampedUUIDModel):
    """
    AI-generated disaster situation report grounded exclusively on pipeline data.
    """
    job = models.OneToOneField(AnalysisJob, on_delete=models.CASCADE, related_name='situation_report')
    report_english = models.TextField()
    report_nepali = models.TextField(default='')
    stats_snapshot = models.TextField(help_text="JSON snapshot of stats used for LLM generation")
    llm_model = models.CharField(max_length=100, default='gemini-1.5-flash')
    pdf_path = models.CharField(max_length=500, blank=True, default='')

    def __str__(self):
        return f"Situation Report for Job {self.job_id}"
