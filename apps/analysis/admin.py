from django.contrib import admin
from .models import (
    AnalysisJob, FloodExtent, DamagedFeature,
    CutoffSettlement, FloodPath, SituationReport
)

@admin.register(AnalysisJob)
class AnalysisJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'status', 'progress', 'flood_date', 'flood_area_km2', 'created_at')
    list_filter = ('status', 'flood_date', 'use_segmentation', 'trace_flood_path')
    search_fields = ('id', 'current_step', 'error_message')

@admin.register(FloodExtent)
class FloodExtentAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'source', 'confidence_score', 'created_at')

@admin.register(DamagedFeature)
class DamagedFeatureAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'osm_type', 'osm_id', 'status', 'overlap_pct')
    list_filter = ('status', 'osm_type')

@admin.register(CutoffSettlement)
class CutoffSettlementAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'name', 'is_cutoff', 'nearest_hospital')
    list_filter = ('is_cutoff',)

@admin.register(FloodPath)
class FloodPathAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'path_length_km')

@admin.register(SituationReport)
class SituationReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'llm_model', 'created_at')
