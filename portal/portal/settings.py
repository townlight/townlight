import os
from pathlib import Path
from django.core.exceptions import ImproperlyConfigured
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get("TOWNLIGHT_SECRET_KEY", "local-demo-only-change-before-deployment")
DEBUG = os.environ.get("TOWNLIGHT_DEBUG", "1") == "1"
if not DEBUG and (len(SECRET_KEY) < 50 or SECRET_KEY == "local-demo-only-change-before-deployment"):
    raise ImproperlyConfigured("Set a unique TOWNLIGHT_SECRET_KEY of at least 50 characters for deployment")
ALLOWED_HOSTS = os.environ.get("TOWNLIGHT_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
CSRF_TRUSTED_ORIGINS = [item for item in os.environ.get("TOWNLIGHT_CSRF_TRUSTED_ORIGINS", "").split(",") if item]
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
# Enable only behind a proxy which removes incoming forwarded headers and sets
# X-Forwarded-Proto itself. The default never trusts a caller-supplied header.
if os.environ.get("TOWNLIGHT_TRUST_TLS_PROXY") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
INSTALLED_APPS = ["website", "wagtail.contrib.forms", "wagtail.contrib.redirects", "wagtail.embeds", "wagtail.sites", "wagtail.users", "wagtail.snippets", "wagtail.documents", "wagtail.images", "wagtail.search", "wagtail.admin", "wagtail", "modelcluster", "taggit", "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "django.contrib.sessions.middleware.SessionMiddleware", "django.middleware.common.CommonMiddleware", "django.middleware.csrf.CsrfViewMiddleware", "django.contrib.auth.middleware.AuthenticationMiddleware", "django.contrib.messages.middleware.MessageMiddleware", "django.middleware.clickjacking.XFrameOptionsMiddleware", "wagtail.contrib.redirects.middleware.RedirectMiddleware"]
ROOT_URLCONF = "portal.urls"
TEMPLATES = [{"BACKEND":"django.template.backends.django.DjangoTemplates", "DIRS":[BASE_DIR / "website/templates"], "APP_DIRS":True, "OPTIONS":{"context_processors":["django.template.context_processors.request", "django.contrib.auth.context_processors.auth", "django.contrib.messages.context_processors.messages", "website.context_processors.brand"]}}]
WSGI_APPLICATION = "portal.wsgi.application"
DATABASES = {"default":{"ENGINE":"django.db.backends.sqlite3", "NAME":os.environ.get("TOWNLIGHT_DB", str(BASE_DIR / "db.sqlite3"))}}
STATIC_URL = "/static/"
STATIC_ROOT = Path(os.environ.get("TOWNLIGHT_STATIC_ROOT", str(BASE_DIR / "static-collected")))
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
WAGTAIL_SITE_NAME = os.environ.get("TOWNLIGHT_BRAND", "Townlight Beta 1")
WAGTAILADMIN_BASE_URL = os.environ.get("TOWNLIGHT_BASE_URL", "http://localhost:8000")
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
