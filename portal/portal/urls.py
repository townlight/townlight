from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from wagtail.admin import urls as admin_urls
from wagtail import urls as wagtail_urls
from website import views
urlpatterns = [path("admin/", include(admin_urls)), path("meetings/", views.meetings, name="meetings"), path("meetings/<int:pk>/", views.meeting, name="meeting"), path("meetings/<int:pk>/release/", views.release, name="meeting-release"), path("source/", views.source, name="source"), path("", include(wagtail_urls))]
if settings.DEBUG: urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
