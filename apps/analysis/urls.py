from django.urls import path
from .views import (
    AnalysisJobListCreateView,
    AnalysisJobDetailView,
    FloodExtentView,
    DamagedFeaturesView,
    CutoffSettlementsView,
    FloodPathView,
    SegmentationView,
    SituationReportView,
)

urlpatterns = [
    path('analysis/', AnalysisJobListCreateView.as_view(), name='analysis-list-create'),
    path('analysis/<uuid:pk>/', AnalysisJobDetailView.as_view(), name='analysis-detail'),
    path('analysis/<uuid:pk>/flood-extent/', FloodExtentView.as_view(), name='analysis-flood-extent'),
    path('analysis/<uuid:pk>/damaged-features/', DamagedFeaturesView.as_view(), name='analysis-damaged-features'),
    path('analysis/<uuid:pk>/cutoff-settlements/', CutoffSettlementsView.as_view(), name='analysis-cutoff-settlements'),
    path('analysis/<uuid:pk>/flood-path/', FloodPathView.as_view(), name='analysis-flood-path'),
    path('analysis/<uuid:pk>/segmentation/', SegmentationView.as_view(), name='analysis-segmentation'),
    path('analysis/<uuid:pk>/report/', SituationReportView.as_view(), name='analysis-report'),
]
