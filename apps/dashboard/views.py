from django.shortcuts import render, get_object_or_404
from django.views.generic import TemplateView
from apps.analysis.models import AnalysisJob

class IndexView(TemplateView):
    template_name = 'dashboard/index.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['recent_jobs'] = AnalysisJob.objects.order_by('-created_at')[:5]
        return context


class DashboardView(TemplateView):
    template_name = 'dashboard/map.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        job_id = self.kwargs.get('job_id')
        job = get_object_or_404(AnalysisJob, id=job_id)
        context['job'] = job
        return context


class ReportView(TemplateView):
    template_name = 'dashboard/report.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        job_id = self.kwargs.get('job_id')
        job = get_object_or_404(AnalysisJob, id=job_id)
        context['job'] = job
        context['report'] = getattr(job, 'situation_report', None)
        return context
