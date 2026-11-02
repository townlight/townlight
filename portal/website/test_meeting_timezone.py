import copy
import json
from pathlib import Path

from django.conf import settings
from django.test import TestCase

from .importing import import_fixture
from .models import Meeting


class MeetingTimezoneTests(TestCase):
    def test_detail_renders_each_meetings_local_time(self):
        sample = Path(settings.BASE_DIR) / "fixtures" / "meeting.json"
        data = json.loads(sample.read_text(encoding="utf-8"))
        import_fixture(data)
        meeting = Meeting.objects.get(tenant="sampleville")
        response = self.client.get(f"/meetings/{meeting.pk}/")
        self.assertContains(response, "2030-03-04 18:30 MST (America/Denver)")
        self.assertNotContains(response, "2030-03-05 01:30 UTC")

        eastern = copy.deepcopy(data)
        eastern["tenant"] = "easternsample"
        eastern["timezone"] = "America/New_York"
        import_fixture(eastern)
        meeting = Meeting.objects.get(tenant="easternsample")
        response = self.client.get(f"/meetings/{meeting.pk}/")
        self.assertContains(response, "2030-03-04 18:30 EST (America/New_York)")
        self.assertNotContains(response, "2030-03-04 23:30 UTC")
