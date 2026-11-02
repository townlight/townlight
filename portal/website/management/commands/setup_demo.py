from django.conf import settings
from django.core.management.base import BaseCommand
from wagtail.models import Page, Site
from website.models import HomePage, ServicePage
class Command(BaseCommand):
    help = "Create a synthetic home and service if no portal home exists."
    def handle(self, *args, **options):
        site=Site.objects.get(is_default_site=True)
        if isinstance(site.root_page.specific, HomePage):
            self.stdout.write("Demo already configured"); return
        root=Page.get_first_root_node()
        home=HomePage(title=settings.WAGTAIL_SITE_NAME, slug="townlight", intro="Welcome to our synthetic community.")
        root.add_child(instance=home); home.save_revision().publish()
        service=ServicePage(title="Community services", slug="community-services", body="Explore services for our synthetic community.")
        home.add_child(instance=service); service.save_revision().publish()
        site.root_page=home; site.save()
        self.stdout.write("Created synthetic home and service")
