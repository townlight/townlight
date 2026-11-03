from django.conf import settings
from wagtail.models import Site
from .models import HomePage, ServicePage

def brand(request):
    site = Site.find_for_request(request)
    home = site.root_page.specific if site else None
    if not isinstance(home, HomePage) or not HomePage.objects.live().public().filter(pk=home.pk).exists():
        home = None
    # Never build navigation from draft revisions or restricted pages.
    children = list(ServicePage.objects.child_of(home).live().public().order_by("path")) if home else []
    pages = {page.kind: page for page in children if page.kind}
    return {
        "site_brand": (home.brand_name or home.title) if home else settings.WAGTAIL_SITE_NAME,
        "portal_home": home,
        "public_services": [page for page in children if page.kind not in ("privacy", "accessibility", "government")],
        "contact_page": pages.get("contact"), "government_page": pages.get("government"),
        "privacy_page": pages.get("privacy"), "accessibility_page": pages.get("accessibility"),
        "records_page": pages.get("records"), "permits_page": pages.get("permits"),
        "code_page": pages.get("code"), "planning_page": pages.get("planning"),
        "synthetic_demo": bool(home and home.synthetic_demo),
    }
