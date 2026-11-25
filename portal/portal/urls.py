from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from wagtail.admin import urls as admin_urls
from wagtail import urls as wagtail_urls
from website import communications_subscriptions, communications_views, parks_catalog, parks_command_views, parks_household, parks_views, resident_catalog, resident_inbox, resident_views, views
from website.publisher_receiver import receive
urlpatterns = [path("admin/", include(admin_urls)), path("meetings/", views.meetings, name="meetings"), path("meetings/<int:pk>/", views.meeting, name="meeting"), path("meetings/<int:pk>/documents/<slug:kind>/", views.meeting_document, name="meeting-document"), path("meetings/<int:pk>/release/", views.release, name="meeting-release"), path("search/", views.search, name="search"), path("source/", views.source, name="source"), path("communications/subscribe/", communications_subscriptions.subscribe, name="communications-subscribe"), path("communications/confirm/", communications_subscriptions.confirm, name="communications-confirm"), path("communications/preferences/", communications_subscriptions.preferences, name="communications-preferences"), path("communications/subscription-command/<uuid:command_id>/", communications_subscriptions.command_status, name="communications-subscription-command"), path("", include(wagtail_urls))]
if settings.DEBUG: urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
from website.datasets import datasets, download_dataset
urlpatterns.insert(0, path("datasets/", datasets, name="datasets"))
urlpatterns.insert(0, path("datasets/<uuid:dataset_id>/<str:name>", download_dataset, name="dataset-download"))
urlpatterns.insert(0, path("find-service/", views.find_service, name="find-service"))
urlpatterns.insert(0, path("townlight/v1/publications/<uuid:meeting_id>/<str:kind>/<int:sequence>/",
                           receive, name="townlight-publisher"))
urlpatterns.insert(0, path("meetings/<int:pk>/packet.pdf", views.packet_pdf, name="meeting-packet-pdf"))
urlpatterns.insert(0, path("service-requests/", resident_views.home, name="resident-311"))
urlpatterns.insert(0, path("service-requests/track/", resident_views.lookup, name="resident-311-lookup"))
urlpatterns.insert(0, path("service-requests/commands/<uuid:command_id>/", resident_views.command, name="resident-311-command"))
urlpatterns.insert(0, path("service-requests/requests/<uuid:request_uuid>/", resident_views.detail, name="resident-311-detail"))
urlpatterns.insert(0, path("service-requests/recover/", resident_views.recover, name="resident-311-recover"))
urlpatterns.insert(0, path("townlight/v1/resident/catalog/", resident_catalog.receive_catalog, name="townlight-resident-catalog"))
urlpatterns.insert(0, path("townlight/v1/resident/claim/", resident_inbox.claim, name="townlight-resident-claim"))
urlpatterns.insert(0, path("townlight/v1/resident/ack/", resident_inbox.acknowledge, name="townlight-resident-ack"))
urlpatterns.insert(0, path("communications/", communications_views.communications_list, name="communications-list"))
urlpatterns.insert(0, path("communications/<uuid:article_id>/", communications_views.communications_detail, name="communications-detail"))
urlpatterns.insert(0, path("communications/<uuid:article_id>/sources/<int:index>/", communications_views.communications_source, name="communications-source"))
urlpatterns.insert(0, path("communications/<uuid:article_id>/attachments/<uuid:attachment_id>/", communications_views.communications_attachment, name="communications-attachment"))
urlpatterns.insert(0, path("townlight/v1/parks/catalog/", parks_catalog.receive_catalog, name="parks-catalog"))
urlpatterns.insert(0, path("parks/payments/return/", parks_command_views.payments_return, name="parks-payment-return"))
urlpatterns.insert(0, path("parks/commands/<uuid:command_id>/", parks_command_views.command, name="parks-command"))
urlpatterns.insert(0, path("parks/household/", parks_household.household, name="parks-household"))
urlpatterns.insert(0, path("parks/household/<str:token>/", parks_views.capture, name="parks-capture"))
urlpatterns.insert(0, path("parks/household/new/", parks_views.create_household, name="parks-create-household"))
urlpatterns.insert(0, path("parks/programs/<uuid:program_id>/", parks_views.program, name="parks-program"))
urlpatterns.insert(0, path("parks/resources/<uuid:resource_id>/", parks_views.resource, name="parks-resource"))
urlpatterns.insert(0, path("parks/", parks_views.home, name="parks-home"))
