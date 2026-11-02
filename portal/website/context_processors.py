from django.conf import settings

def brand(request):
    return {"site_brand": settings.WAGTAIL_SITE_NAME}
