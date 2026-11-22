from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from wagtail.admin import urls as admin_urls
from wagtail import urls as wagtail_urls
from website import views
from website.publisher_receiver import receive
urlpatterns = [path("admin/", include(admin_urls)), path("meetings/", views.meetings, name="meetings"), path("meetings/<int:pk>/", views.meeting, name="meeting"), path("meetings/<int:pk>/documents/<slug:kind>/", views.meeting_document, name="meeting-document"), path("meetings/<int:pk>/release/", views.release, name="meeting-release"), path("search/", views.search, name="search"), path("source/", views.source, name="source"), path("", include(wagtail_urls))]
if settings.DEBUG: urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns.insert(0, path("find-service/", views.find_service, name="find-service"))
urlpatterns.insert(0, path("townlight/v1/publications/<uuid:meeting_id>/<str:kind>/<int:sequence>/",
                           receive, name="townlight-publisher"))
urlpatterns.insert(0, path("meetings/<int:pk>/packet.pdf", views.packet_pdf, name="meeting-packet-pdf"))
