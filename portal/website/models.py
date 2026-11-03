from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from zoneinfo import ZoneInfo
from urllib.parse import urlsplit
from wagtail.models import Page
from wagtail.admin.panels import FieldPanel
from wagtail.fields import StreamField
from wagtail import blocks

class HomePage(Page):
    intro = models.TextField(blank=True)
    brand_name = models.CharField(max_length=120, blank=True, help_text="City name in the shared header and footer; falls back to the page title.")
    brand_prefix = models.CharField(max_length=40, blank=True, default="City of")
    hero_title = models.CharField(max_length=160, blank=True, default="Your city,\nat your service.")
    contact_address = models.TextField(blank=True)
    contact_hours = models.TextField(blank=True)
    synthetic_demo = models.BooleanField(default=False, help_text="Show a persistent synthetic demonstration notice.")
    logo = models.ForeignKey("wagtailimages.Image", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    hero_image = models.ForeignKey("wagtailimages.Image", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    content_panels = Page.content_panels + [FieldPanel(name) for name in (
        "brand_name", "brand_prefix", "logo", "hero_image", "hero_title", "intro", "contact_address", "contact_hours", "synthetic_demo")]
    subpage_types = ["website.ServicePage"]
    parent_page_types = ["wagtailcore.Page"]

    def get_context(self, request, *args, **kwargs):
        context = super().get_context(request, *args, **kwargs)
        context["featured_meeting"] = Meeting.objects.filter(
            published=True, cancelled=False, release_media_type="video/mp4"
        ).exclude(release_path="").order_by("-scheduled_start", "-pk").first()
        return context

class ServicePage(Page):
    body = models.TextField(blank=True)
    kind = models.CharField(max_length=20, blank=True, choices=[(value, label) for value, label in (
        ("general", "General information"), ("records", "Public records"), ("permits", "Permits and inspections"),
        ("code", "City code"), ("planning", "Planning and zoning"), ("contact", "Contact"),
        ("government", "Government"), ("privacy", "Privacy"), ("accessibility", "Accessibility"))])
    summary = models.CharField(max_length=300, blank=True)
    heading = models.CharField(max_length=180, blank=True)
    steps = models.TextField(blank=True, help_text="One next step per line.")
    destination_url = models.URLField(blank=True, help_text="HTTPS address of the city's designated service. No new service or account is created here.")
    destination_label = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    contact_details = models.TextField(blank=True)
    questions = StreamField([("question", blocks.StructBlock([
        ("question", blocks.CharBlock()), ("answer", blocks.TextBlock())
    ]))], blank=True, use_json_field=True)
    content_panels = Page.content_panels + [FieldPanel(name) for name in (
        "kind", "summary", "heading", "body", "steps", "destination_label", "destination_url", "department", "contact_details", "questions")]
    parent_page_types = ["website.HomePage"]
    subpage_types = []

    def clean(self):
        super().clean()
        if self.destination_url:
            value = urlsplit(self.destination_url)
            if value.scheme != "https" or not value.hostname or value.username or value.password or any(ord(c) < 33 for c in self.destination_url):
                raise ValidationError({"destination_url": "Use an HTTPS city-service address without credentials."})

    @property
    def next_steps(self):
        return [line.strip() for line in self.steps.splitlines() if line.strip()]

    @property
    def destination_host(self):
        return urlsplit(self.destination_url).netloc if self.destination_url else ""

    @property
    def icon(self):
        return {"records": "file", "permits": "home", "code": "building", "planning": "map", "contact": "message"}.get(self.kind, "file")

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

    @property
    def local_start(self):
        return self.scheduled_start.astimezone(ZoneInfo(self.display_timezone))

    @property
    def has_video(self):
        return not self.cancelled and self.vendor == "townlight" and bool(self.release_path) and self.release_media_type == "video/mp4"

    @property
    def status_label(self):
        if self.cancelled:
            return "Cancelled"
        if self.has_video:
            return "Recording available"
        return "Upcoming meeting" if self.scheduled_start >= timezone.now() else "Meeting documents"

    @property
    def status_class(self):
        return "cancelled" if self.cancelled else "upcoming" if self.scheduled_start >= timezone.now() and not self.has_video else ""
    class Meta:
        constraints = [models.UniqueConstraint(fields=["vendor", "tenant", "external_id"], name="unique_vendor_tenant_meeting")]
        ordering = ["scheduled_start", "pk"]
