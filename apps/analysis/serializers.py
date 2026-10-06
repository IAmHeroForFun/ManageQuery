import json
from rest_framework import serializers
from .models import (
    AnalysisJob, FloodExtent, DamagedFeature,
    CutoffSettlement, FloodPath, SituationReport
)

class AnalysisJobCreateSerializer(serializers.ModelSerializer):
    aoi = serializers.JSONField(write_only=True)
    source_point = serializers.JSONField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = AnalysisJob
        fields = [
            'id', 'aoi', 'flood_date', 'use_segmentation',
            'trace_flood_path', 'source_point', 'status', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'created_at']

    def validate_aoi(self, value):
        if not isinstance(value, dict) or 'type' not in value or 'coordinates' not in value:
            raise serializers.ValidationError("Valid GeoJSON Polygon is required.")
        return value

    def validate(self, attrs):
        if attrs.get('trace_flood_path'):
            source_point = attrs.get('source_point')
            if not source_point or not isinstance(source_point, dict):
                raise serializers.ValidationError(
                    {"source_point": "source_point is required when trace_flood_path is true."}
                )
        return attrs

    def create(self, validated_data):
        aoi_data = validated_data.pop('aoi')
        source_point_data = validated_data.pop('source_point', None)

        source_lon = None
        source_lat = None
        if source_point_data and 'coordinates' in source_point_data:
            coords = source_point_data['coordinates']
            if len(coords) >= 2:
                source_lon, source_lat = coords[0], coords[1]

        job = AnalysisJob.objects.create(
            aoi_geojson=json.dumps(aoi_data),
            source_point_lon=source_lon,
            source_point_lat=source_lat,
            **validated_data
        )
        return job


class AnalysisJobDetailSerializer(serializers.ModelSerializer):
    aoi = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisJob
        fields = [
            'id', 'status', 'progress', 'current_step', 'error_message',
            'aoi', 'flood_date', 'use_segmentation', 'trace_flood_path',
            'source_point_lon', 'source_point_lat',
            'flood_area_km2', 'buildings_affected', 'buildings_possibly_affected',
            'roads_damaged_km', 'bridges_damaged', 'settlements_cutoff',
            'created_at', 'updated_at', 'completed_at'
        ]

    def get_aoi(self, obj):
        return obj.aoi


class DamagedFeatureSerializer(serializers.ModelSerializer):
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = DamagedFeature
        fields = ['id', 'osm_id', 'osm_type', 'osm_name', 'status', 'overlap_pct', 'geometry']

    def get_geometry(self, obj):
        try:
            return json.loads(obj.geometry_geojson)
        except Exception:
            return None


class CutoffSettlementSerializer(serializers.ModelSerializer):
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = CutoffSettlement
        fields = [
            'id', 'name', 'is_cutoff', 'nearest_hospital',
            'pre_flood_distance_km', 'population_estimate', 'geometry'
        ]

    def get_geometry(self, obj):
        try:
            return json.loads(obj.geometry_geojson)
        except Exception:
            return None


class SituationReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = SituationReport
        fields = [
            'id', 'job_id', 'report_english', 'report_nepali',
            'llm_model', 'created_at', 'pdf_path'
        ]
