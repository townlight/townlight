# SPDX-License-Identifier: AGPL-3.0-only
"""Create fictional editor-owned content once; never replace an existing city site."""
from django.core.management.base import BaseCommand
from wagtail.models import Page, Site
from website.models import HomePage, ServicePage


class Command(BaseCommand):
    help = "Create the fictional Juniper Falls website on a fresh portal. Existing home/content is preserved."

    def handle(self, *args, **options):
        site = Site.objects.get(is_default_site=True)
        if isinstance(site.root_page.specific, HomePage):
            self.stdout.write("Demo already configured; existing content preserved")
            return
        root = Page.get_first_root_node()
        home = HomePage(title="Juniper Falls", slug="townlight", brand_name="Juniper Falls",
            intro="Find the information you need.\nTake part in the decisions that shape our community.",
            contact_address="100 Civic Square · Juniper Falls\nFictional demonstration address",
            contact_hours="Monday–Friday, 8 a.m.–5 p.m. · Example hours", synthetic_demo=True)
        root.add_child(instance=home)
        home.save_revision().publish()
        samples = [
            dict(kind="records", title="Public records", slug="public-records", summary="Find records and request information.",
                heading="Find a record. Ask a question.", body="Start with the information already available on this website. Published meeting agendas, minutes and recordings are grouped together in the meeting archive.",
                steps="Describe the records you need, with dates or a subject if known.\nUse the city's designated records service to submit your request.\nCity staff will review your request and explain the next steps.",
                department="City Clerk’s Office", destination_url="https://records.juniperfalls.example/", destination_label="Continue to the city’s records service",
                questions=[("question", {"question":"Will all city records appear here?", "answer":"Only material approved for public publication appears on this website. Other requests go through the designated records process."})]),
            dict(kind="permits", title="Permits & inspections", slug="permits-inspections", summary="Start with guidance for your project.",
                heading="Before you start your project", body="Building, renovation and land-use projects may need permits or inspections. Review city guidance and speak with staff before applying. This page does not calculate official fees or process applications or payments.",
                steps="Gather a description of your project and its location.\nReview the city’s guidance and contact staff with questions.\nContinue to the existing permit service to apply or check a project.",
                department="Community Development", destination_url="https://permits.juniperfalls.example/", destination_label="Continue to the city’s permit service"),
            dict(kind="code", title="City code", slug="city-code", summary="Find local ordinances and adopted code.",
                heading="Explore the adopted code", body="The municipal code brings local ordinances together by topic. Contact city staff for help understanding how a rule applies.",
                department="City Clerk’s Office", destination_url="https://code.juniperfalls.example/", destination_label="Continue to the city’s code library"),
            dict(kind="planning", title="Planning & zoning", slug="planning-zoning", summary="Understand plans and land use.",
                heading="Understand plans for your community", body="Find the city’s planning guidance and connect with its designated land-use resources. Contact staff about a specific property or proposal.",
                department="Community Development", destination_url="https://planning.juniperfalls.example/", destination_label="Continue to the city’s planning resources"),
            dict(kind="contact", title="Contact city staff", slug="contact", summary="Connect with the right department.",
                heading="Let’s find the right department", body="City Clerk’s Office — public meetings, agendas and records guidance.\n\nCommunity Development — permits, inspections, planning and zoning.\n\nThis is a fictional directory. The adopting city supplies its own public contact details.", department="City Hall"),
            dict(kind="government", title="Your government", slug="your-government", summary="Follow public decisions and find the information behind them.",
                heading="An open view of city business", body="Find upcoming meetings, read published agendas and revisit public decisions. Only records explicitly approved for public publication appear here."),
            dict(kind="privacy", title="Privacy", slug="privacy", summary="About this synthetic demonstration.",
                body="This fictional demonstration has no analytics or resident submission forms. No live city services are connected. Site search covers public titles only. The adopting city must provide its own privacy notice and approved terms before operating a real site; this example is not that policy."),
            dict(kind="accessibility", title="Accessibility", slug="accessibility", summary="Accessing this public website.",
                body="The website includes keyboard navigation, visible focus, a skip link, semantic headings and responsive pages. The city supplies an assistance contact and accessible published materials, including captions or transcripts where applicable. This demonstration does not claim accessibility certification.")]
        for values in samples:
            values.setdefault("contact_details", "100 Civic Square · Juniper Falls\nFictional address and department.\nContact details are supplied by the adopting city." if values.get("department") else "")
            service = ServicePage(**values)
            home.add_child(instance=service)
            service.save_revision().publish()
        site.root_page = home
        site.site_name = "Juniper Falls · Synthetic demonstration"
        site.save()
        self.stdout.write("Created fictional Juniper Falls home and eight information pages")