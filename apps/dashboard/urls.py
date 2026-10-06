from django.urls import path
from .views import IndexView, DashboardView, ReportView

urlpatterns = [
    path('', IndexView.as_view(), name='index'),
    path('dashboard/<uuid:job_id>/', DashboardView.as_view(), name='dashboard'),
    path('dashboard/<uuid:job_id>/report/', ReportView.as_view(), name='report'),
]
