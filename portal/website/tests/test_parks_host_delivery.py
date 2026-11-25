# SPDX-License-Identifier: AGPL-3.0-only
import httpx
import pytest
from django.core.wsgi import get_wsgi_application

from townlight_parks.workflow import ParksRepository
from townlight_runtime.parks_catalog_publish import ParksCatalogPublisher
from website.parks_catalog import read_catalog

from test_parks_catalog import RESOURCE
from test_parks_resident_flow import publisher, resident_key, runtime

pytestmark = pytest.mark.django_db


def test_parks_catalog_publisher_integration(runtime, publisher, settings):
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    parks_engine, _dispatch = runtime
    repo = ParksRepository(parks_engine)

    private = repo.catalog_create(
        "resource", "staff", {**RESOURCE, "name": "Private Hall"}
    )
    public = repo.catalog_create(
        "resource", "staff", {**RESOURCE, "name": "Public Hall", "public": True}
    )

    projection = repo.public_catalog()
    assert [row["id"] for row in projection["resources"]] == [str(public["id"])]
    assert str(private["id"]) not in {row["id"] for row in projection["resources"]}

    assert read_catalog()["available"] is False

    def client_factory(**kwargs):
        return httpx.Client(
            transport=httpx.WSGITransport(get_wsgi_application()), **kwargs
        )

    publisher_obj = ParksCatalogPublisher(
        repo,
        config=lambda: ("https://testserver", publisher),
        client_factory=client_factory,
    )
    assert publisher_obj.tick() is True

    catalog = read_catalog()
    assert catalog["available"] is True
    assert catalog["catalog"] == projection
    resource_ids = {row["id"] for row in catalog["catalog"]["resources"]}
    assert str(private["id"]) not in resource_ids
    assert str(public["id"]) in resource_ids
