# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import json
from datetime import timedelta

import pytest
from cryptography.fernet import Fernet
from django.test import RequestFactory
from django.utils import timezone
from website.models import ServiceRequestCatalog
from website.resident_catalog import read_catalog, receive_catalog

pytestmark = pytest.mark.django_db

TOKEN = "Z" * 43
CATEGORIES = [
    {"code": "pothole", "name": "Pothole repair", "department": "Public Works"},
    {"code": "noise", "name": "Noise complaint", "department": "Code Enforcement"},
]


@pytest.fixture(autouse=True)
def catalog_env(tmp_path, monkeypatch, settings):
    settings.ALLOWED_HOSTS = [
        "localhost", "127.0.0.1", "[::1]", "portal.example", "testserver",
    ]
    resident_key = tmp_path / "resident.key"
    resident_key.write_bytes(Fernet.generate_key())
    publisher_key = tmp_path / "publisher.sha256"
    publisher_key.write_text(hashlib.sha256(TOKEN.encode()).hexdigest(), encoding="ascii")
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", str(resident_key))
    monkeypatch.setenv("TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE", str(publisher_key))
    return resident_key


def body(response):
    return json.loads(response.content)


def canonical(categories):
    return hashlib.sha256(json.dumps(
        categories, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")).hexdigest()


def catalog_payload(categories=None, digest=None):
    categories = CATEGORIES if categories is None else categories
    return {
        "categories": categories,
        "sha256": canonical(categories) if digest is None else digest,
    }


def worker_post(view, payload, *, host="localhost", secure=True, remote="127.0.0.1",
                token=TOKEN, forwarded=None):
    extra = {}
    if token is not None:
        extra["HTTP_AUTHORIZATION"] = "Bearer " + token
    if forwarded:
        extra["HTTP_X_FORWARDED_PROTO"] = forwarded
    raw = payload if isinstance(payload, (bytes, str)) else json.dumps(payload)
    return view(RequestFactory().post(
        "/private/resident/catalog/", data=raw,
        content_type="application/json", HTTP_HOST=host,
        REMOTE_ADDR=remote, secure=secure, **extra,
    ))


def test_valid_catalog_persists_and_reloads_without_echoing_content():
    payload = catalog_payload()
    response = worker_post(receive_catalog, payload)
    assert response.status_code == 200
    assert body(response) == {
        "digest": canonical(CATEGORIES),
        "categories": 2,
        "updated_at": ServiceRequestCatalog.objects.get(pk=311).updated_at.isoformat(),
    }
    assert "Pothole repair" not in response.content.decode("utf-8")
    assert ServiceRequestCatalog.objects.count() == 1
    row = ServiceRequestCatalog.objects.get(pk=311)
    assert row.categories == CATEGORIES
    assert row.digest == canonical(CATEGORIES)

    catalog = read_catalog()
    assert catalog == {
        "categories": CATEGORIES,
        "digest": canonical(CATEGORIES),
        "updated_at": row.updated_at.isoformat(),
        "available": True,
    }

    replaced = [{"code": "graffiti", "name": "Graffiti", "department": "Public Works"}]
    second = worker_post(receive_catalog, catalog_payload(replaced))
    assert second.status_code == 200
    assert ServiceRequestCatalog.objects.count() == 1
    assert read_catalog()["categories"] == replaced


def test_missing_and_stale_catalog_are_explicitly_unavailable():
    assert read_catalog() == {
        "categories": [],
        "digest": "",
        "updated_at": None,
        "available": False,
    }

    ServiceRequestCatalog.objects.create(
        pk=311,
        categories=CATEGORIES,
        digest=canonical(CATEGORIES),
        updated_at=timezone.now() - timedelta(hours=24, seconds=1),
    )
    stale = read_catalog()
    assert stale["available"] is False
    assert stale["categories"] == []
    assert stale["digest"] == canonical(CATEGORIES)


def test_invalid_categories_extras_and_digest_are_rejected():
    extra_top_level = catalog_payload()
    extra_top_level["contact"] = "resident@example.com"
    response = worker_post(receive_catalog, extra_top_level)
    assert response.status_code == 422
    assert ServiceRequestCatalog.objects.count() == 0

    extra_category = [{
        "code": "pothole", "name": "Pothole repair",
        "department": "Public Works", "location": "Main Street",
    }]
    response = worker_post(receive_catalog, catalog_payload(extra_category))
    assert response.status_code == 422

    missing_category_field = [{"code": "pothole", "name": "Pothole repair"}]
    response = worker_post(receive_catalog, catalog_payload(missing_category_field))
    assert response.status_code == 422

    duplicate = [CATEGORIES[0], dict(CATEGORIES[1], code="pothole")]
    response = worker_post(receive_catalog, catalog_payload(duplicate))
    assert response.status_code == 422

    overlong = [{"code": "pothole", "name": "x" * 256, "department": "Public Works"}]
    response = worker_post(receive_catalog, catalog_payload(overlong))
    assert response.status_code == 422

    mismatch = worker_post(receive_catalog, catalog_payload(digest="0" * 64))
    assert mismatch.status_code == 409
    assert body(mismatch) == {"detail": "Catalogue digest mismatch"}
    assert ServiceRequestCatalog.objects.count() == 0

    assert worker_post(receive_catalog, catalog_payload()).status_code == 200
    before = ServiceRequestCatalog.objects.get(pk=311)
    rejected = worker_post(receive_catalog, catalog_payload(
        [{"code": "other", "name": "Other", "department": "Other"}],
        digest="1" * 64,
    ))
    assert rejected.status_code == 409
    after = ServiceRequestCatalog.objects.get(pk=311)
    assert after.categories == before.categories
    assert after.digest == before.digest


def test_unauthorized_and_non_https_callers_are_denied():
    unauthorized = worker_post(receive_catalog, catalog_payload(), host="evil.example")
    assert unauthorized.status_code == 401
    assert body(unauthorized) == {"detail": "Publisher authorization required"}

    missing_bearer = worker_post(
        receive_catalog, catalog_payload(), host="portal.example",
        secure=True, remote="203.0.113.9", token=None,
    )
    assert missing_bearer.status_code == 401

    plain_http = worker_post(
        receive_catalog, catalog_payload(), host="portal.example",
        secure=False, remote="203.0.113.9",
    )
    assert plain_http.status_code == 403
    assert body(plain_http) == {"detail": "HTTPS required"}

    forwarded = worker_post(
        receive_catalog, catalog_payload(), host="portal.example",
        secure=False, remote="203.0.113.9", forwarded="https",
    )
    assert forwarded.status_code == 403
    assert ServiceRequestCatalog.objects.count() == 0


def test_missing_resident_key_configuration_fails_closed(monkeypatch):
    monkeypatch.delenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE")
    response = worker_post(receive_catalog, catalog_payload())
    assert response.status_code == 503
    assert body(response) == {"detail": "Service catalogue unavailable"}
    assert ServiceRequestCatalog.objects.count() == 0
