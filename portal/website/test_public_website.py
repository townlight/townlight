# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import io
import json
import tempfile
from datetime import timedelta
from pathlib import Path
from zipfile import ZipFile

from django.core.exceptions import ValidationError
from django.core.files.images import ImageFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from wagtail.images import get_image_model
from wagtail.models import PageViewRestriction

from .models import HomePage, ServicePage, Meeting


class PublicWebsiteTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("setup_demo", stdout=io.StringIO())
        cls.home = HomePage.objects.get()
        cls.records = ServicePage.objects.get(kind="records")
        cls.meeting = Meeting.objects.create(vendor="townlight", tenant="native", external_id="public-sample",
            title="Council Public Session", scheduled_start=timezone.now()-timedelta(days=2),
            display_timezone="America/Denver", source_body=json.dumps({
                "agenda":"Agenda <script>unsafe()</script>", "packet":"Approved packet", "minutes":"Approved minutes",
                "archive_id":"example-archive", "release":{"sha256":"a"*64}}),
            source_digest="b"*64, revision="a"*64, release_path="a"*64+".bin", release_media_type="video/mp4")

    def test_public_navigation_search_and_task_finder_exclude_private_pages(self):
        for title, live, restricted in (("Council Secret draft",False,False),("Council Restricted page",True,True)):
            page=ServicePage(title=title,slug=title.lower().replace(" ","-"),live=live)
            self.home.add_child(instance=page)
            if live: page.save_revision().publish()
            if restricted: PageViewRestriction.objects.create(page=page,restriction_type="password",password="synthetic")
            self.assertEqual(self.client.get("/find-service/",{"service":page.pk}).status_code,404)
        hidden=Meeting.objects.create(vendor="primegov",tenant="synthetic",external_id="hidden",
            title="Council PRIVATE SENTINEL",scheduled_start=timezone.now(),display_timezone="UTC",published=False)
        for url in ("/", "/search/?q=Council", "/meetings/?period=all"):
            response=self.client.get(url)
            self.assertEqual(response.status_code,200)
            for secret in ("Secret draft","Restricted page","PRIVATE SENTINEL"):
                self.assertNotContains(response,secret)
        self.assertRedirects(self.client.get("/find-service/",{"service":self.records.pk}),"/public-records/")
        self.assertEqual(self.client.get("/find-service/",{"service":"https://outside.example/"}).status_code,404)
        self.assertNotContains(self.client.get("/search/?q=Council"),"example-archive")
        self.assertEqual(self.client.get(f"/meetings/{hidden.pk}/").status_code,404)

    def test_filters_timezones_and_statuses_use_published_data(self):
        future=Meeting.objects.create(vendor="primegov",tenant="synthetic",external_id="future",
            title="Planning Commission",scheduled_start=timezone.now()+timedelta(days=3),display_timezone="Pacific/Auckland",cancelled=True)
        self.assertContains(self.client.get("/meetings/"),"Planning Commission")
        self.assertNotIn(self.meeting.pk,[row.pk for row in self.client.get("/meetings/").context["meetings"]])
        self.assertContains(self.client.get("/meetings/?period=past"),"Council Public Session")
        self.assertEqual(list(self.client.get("/meetings/?period=past&series=Planning%20Commission").context["meetings"]),[])
        self.assertContains(self.client.get("/meetings/?period=all&q=Council"),"Council Public Session")
        self.assertContains(self.client.get(f"/meetings/{future.pk}/"),"Cancelled")
        self.assertNotContains(self.client.get(f"/meetings/{future.pk}/"),"<video")

    def test_restricted_site_home_does_not_leak_branding_into_public_meeting_routes(self):
        self.home.brand_name="PRIVATE BRAND SENTINEL";self.home.save()
        PageViewRestriction.objects.create(page=self.home,restriction_type="password",password="synthetic")
        self.assertNotContains(self.client.get(f"/meetings/{self.meeting.pk}/"),"PRIVATE BRAND SENTINEL")
        self.assertNotContains(self.client.get("/search/?q=records"),"Public records")

    def test_documents_escape_text_and_withdrawal_removes_all_public_routes(self):
        for kind in ("agenda","packet","minutes"):
            response=self.client.get(f"/meetings/{self.meeting.pk}/documents/{kind}/")
            self.assertEqual(response.status_code,200)
            self.assertNotContains(response,"<script>unsafe()")
        self.assertContains(self.client.get(f"/meetings/{self.meeting.pk}/documents/agenda/"),"&lt;script&gt;")
        self.meeting.published=False;self.meeting.save()
        for suffix in ("", "release/", "documents/agenda/", "documents/packet/", "documents/minutes/"):
            self.assertEqual(self.client.get(f"/meetings/{self.meeting.pk}/{suffix}").status_code,404)
        self.assertNotContains(self.client.get("/"),"Council Public Session")

    def test_service_destination_and_demo_are_explicit_and_setup_preserves_content(self):
        response=self.client.get("/public-records/")
        self.assertContains(response,"records.juniperfalls.example")
        self.assertContains(response,"You will leave this website")
        self.records.destination_url="javascript:alert(1)"
        with self.assertRaises(ValidationError): self.records.clean()
        self.home.brand_name="Another Community";self.home.synthetic_demo=False;self.home.save()
        call_command("setup_demo",stdout=io.StringIO())
        self.home.refresh_from_db();self.assertEqual(self.home.brand_name,"Another Community")
        self.assertNotContains(self.client.get("/"),"SYNTHETIC DEMONSTRATION")

    def test_city_owned_branding_and_service_content_export_with_image_hash(self):
        # A local synthetic uploaded city image must survive the city-owned export.
        self.meeting.published=False;self.meeting.save()
        with tempfile.TemporaryDirectory() as folder, override_settings(MEDIA_ROOT=folder):
            data=io.BytesIO();Image.new("RGB",(8,8),"teal").save(data,format="PNG");data.seek(0)
            image=get_image_model().objects.create(title="Synthetic seal",file=ImageFile(data,name="seal.png"))
            self.home.logo=image;self.home.save()
            target=Path(folder)/"export"
            call_command("export_public",str(target),stdout=io.StringIO())
            content=json.loads((target/"content.json").read_text())
            home=next(x for x in content["pages"] if x["type"]=="HomePage")
            self.assertEqual(home["brand_name"],"Juniper Falls")
            self.assertTrue((target/home["logo"]["file"]).is_file())
            record=next(x for x in content["pages"] if x["title"]=="Public records")
            self.assertEqual(record["destination_url"],self.records.destination_url)
            manifest=json.loads((target/"manifest.json").read_text())
            asset=next(x for x in manifest["generated_files"] if x["path"].startswith("images/"))
            self.assertEqual(asset["sha256"],hashlib.sha256((target/asset["path"]).read_bytes()).hexdigest())

    def test_source_archive_includes_deployed_styles_scripts_and_illustrations(self):
        with ZipFile(io.BytesIO(self.client.get("/source/").content)) as archive:
            for name in ("portal.css","portal.js","cityscape.svg","chamber.svg"):
                self.assertIn("website/static/website/"+name,archive.namelist())
