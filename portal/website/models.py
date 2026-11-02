from django.db import models
from wagtail.models import Page
from wagtail.admin.panels import FieldPanel

class HomePage(Page):
    intro = models.TextField(blank=True)
    content_panels = Page.content_panels + [FieldPanel("intro")]
    subpage_types = ["website.ServicePage"]
    parent_page_types = ["wagtailcore.Page"]

class ServicePage(Page):
    body = models.TextField(blank=True)
    content_panels = Page.content_panels + [FieldPanel("body")]
    parent_page_types = ["website.HomePage"]
    subpage_types = []

class Meeting(models.Model):
    vendor = models.CharField(max_length=30)
    tenant = models.CharField(max_length=63)
    external_id = models.CharField(max_length=120)
    title = models.CharField(max_length=400)
    scheduled_start = models.DateTimeField()
    display_timezone = models.CharField(max_length=80)
    cancelled = models.BooleanField(default=False)
    published = models.BooleanField(default=True)
    agenda = models.JSONField(default=list)
    documents = models.JSONField(default=list)
    recording_url = models.URLField(blank=True)
    source_url = models.URLField()
    source_body = models.TextField()
    source_digest = models.CharField(max_length=64)
    revision = models.CharField(max_length=120)
    imported_at = models.DateTimeField(auto_now=True)
    release_path = models.CharField(max_length=80, blank=True, editable=False)
    release_media_type = models.CharField(max_length=80, blank=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["vendor", "tenant", "external_id"], name="unique_vendor_tenant_meeting")]
        ordering = ["scheduled_start", "pk"]
