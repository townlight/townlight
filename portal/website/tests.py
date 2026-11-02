import copy, hashlib, json, shutil
from pathlib import Path
from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.test import TestCase
from wagtail.models import Page, PageViewRestriction, Site
from .importing import import_fixture
from .models import HomePage, ServicePage, Meeting

FIXTURE = json.loads((Path(__file__).resolve().parent.parent / "fixtures/meeting.json").read_text(encoding="utf-8"))

class PortalTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        root=Page.get_first_root_node()
        cls.home=HomePage(title="Test Home", slug="test-home", intro="Welcome")
        root.add_child(instance=cls.home); cls.home.save_revision().publish()
        site=Site.objects.get(is_default_site=True); site.root_page=cls.home; site.save()
        cls.service=ServicePage(title="Service", slug="service", body="Published content")
        cls.home.add_child(instance=cls.service); cls.service.save_revision().publish()

    def test_import_change_cancel_withdraw_and_failure_atomic(self):
        data=copy.deepcopy(FIXTURE); import_fixture(data); import_fixture(data)
        self.assertEqual(Meeting.objects.count(),1)
        m=Meeting.objects.get(); self.assertEqual(m.scheduled_start.isoformat(),"2030-03-05T01:30:00+00:00")
        self.assertEqual(len(m.agenda),2); self.assertEqual(hashlib.sha256(m.source_body.encode()).hexdigest(),m.source_digest)
        data["meetings"][0]["title"]="Updated"; data["html"]["55"]=data["html"]["55"].replace("Community garden", "New garden")
        import_fixture(data); m.refresh_from_db(); self.assertEqual(m.title,"Updated"); self.assertEqual(m.agenda[1]["title"],"New garden")
        bad=copy.deepcopy(data); bad["meetings"][0]["recording"]="javascript:alert(1)"
        with self.assertRaises(ValueError): import_fixture(bad)
        m.refresh_from_db(); self.assertEqual(m.title,"Updated")
        cancelled=copy.deepcopy(data); cancelled["meetings"][0]["cancelled"]=True; cancelled["meetings"][0]["documentList"]=[]
        import_fixture(cancelled); m.refresh_from_db(); self.assertTrue(m.cancelled)
        self.assertContains(self.client.get(f"/meetings/{m.pk}/"), "Cancelled")
        empty=copy.deepcopy(data); empty["meetings"]=[]; import_fixture(empty); m.refresh_from_db(); self.assertTrue(m.published)
        data["meetings"][0]["withdrawn"]=True; import_fixture(data); m.refresh_from_db(); self.assertFalse(m.published)
        self.assertEqual(self.client.get(f"/meetings/{m.pk}/").status_code,404)

    def test_tenants_privacy_url_and_extraction(self):
        data=copy.deepcopy(FIXTURE); data["meetings"][0]["documentList"].append({"id":2,"title":"private secret", "link":"https://private.example/secret", "private":True})
        import_fixture(data); m=Meeting.objects.get(); self.assertNotIn("private secret",m.source_body)
        data["tenant"]="other"; import_fixture(data); self.assertEqual(Meeting.objects.count(),2)
        for url in ["http://documents.example/x", "https://127.0.0.1/x", "https://user@documents.example/x", "https://documents.example:443/x"]:
            bad=copy.deepcopy(data); bad["meetings"][0]["recording"]=url
            with self.assertRaises(ValueError): import_fixture(bad)
        bad=copy.deepcopy(data); bad["html"]={}
        with self.assertRaises(Exception): import_fixture(bad)
        self.assertEqual(Meeting.objects.count(),2)

    def test_draft_restriction_export_and_source(self):
        import_fixture(copy.deepcopy(FIXTURE))
        draft=ServicePage(title="Secret draft", slug="secret-draft", body="PRIVATE DRAFT", live=False)
        self.home.add_child(instance=draft); draft.save_revision()
        restricted=ServicePage(title="Restricted", slug="restricted", body="PRIVATE PAGE")
        self.home.add_child(instance=restricted); restricted.save_revision().publish()
        PageViewRestriction.objects.create(page=restricted, restriction_type="password", password="local-only")
        self.assertEqual(self.client.get('/secret-draft/').status_code,404)
        self.assertNotContains(self.client.get('/'), "Restricted")
        dest=Path(__file__).resolve().parent.parent / "test-export-owned"
        if dest.exists(): shutil.rmtree(dest)
        try:
            call_command("export_public",str(dest),verbosity=0)
            result=(dest/"content.json").read_text(encoding="utf-8")
            self.assertNotIn("PRIVATE",result); self.assertNotIn("source_body",result); self.assertIn("Sampleville Council",result)
        finally:
            if dest.exists(): shutil.rmtree(dest)
        self.assertEqual(self.client.get('/source/').status_code,200)

    def test_editor_publisher_permissions(self):
        editor=User.objects.create_user("editor", password="synthetic", is_staff=True); editor.groups.add(Group.objects.get(name="Editors"))
        publisher=User.objects.create_user("publisher", password="synthetic", is_staff=True); publisher.groups.add(Group.objects.get(name="Moderators"))
        self.assertTrue(self.service.permissions_for_user(editor).can_edit())
        self.assertFalse(self.service.permissions_for_user(editor).can_publish())
        self.assertTrue(self.service.permissions_for_user(publisher).can_publish())
        self.client.force_login(editor)
        response=self.client.post(f"/admin/pages/{self.service.pk}/edit/", {"title":"Edited draft", "slug":"service", "body":"Draft body", "action-publish":"Publish"})
        self.service.refresh_from_db(); self.assertEqual(self.service.title,"Service")
        self.assertNotContains(self.client.get('/service/'), "Draft body")

    def test_editor_submission_publisher_approval_and_withdrawal_http(self):
        editor=User.objects.create_user("review-editor", password="synthetic", is_staff=True)
        editor.groups.add(Group.objects.get(name="Editors"))
        publisher=User.objects.create_user("review-publisher", password="synthetic", is_staff=True)
        publisher.groups.add(Group.objects.get(name="Moderators"))
        self.client.force_login(editor)
        response=self.client.post(f"/admin/pages/{self.service.pk}/edit/", {"title":"Reviewed service", "slug":"service", "body":"Approved content", "action-submit":"Submit"})
        self.assertEqual(response.status_code,302)
        self.service.refresh_from_db()
        self.assertIsNotNone(self.service.current_workflow_task_state)
        self.assertNotContains(self.client.get('/service/'), "Approved content")
        task_id=self.service.current_workflow_task_state.pk
        self.client.force_login(publisher)
        response=self.client.post(f"/admin/pages/workflow/action/{self.service.pk}/approve/{task_id}/")
        self.assertIn(response.status_code, (200,302))
        self.assertContains(self.client.get('/service/'), "Approved content")
        response=self.client.post(f"/admin/pages/{self.service.pk}/unpublish/", {"confirm":"yes"})
        self.assertEqual(response.status_code,302)
        self.assertEqual(self.client.get('/service/').status_code,404)
