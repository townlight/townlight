import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from website.models import ServiceRequestCatalog
from website.resident_inbox import claim_commands
from website.resident_session import save_credential
from test_resident_flow import (
    _execute_and_ack,
    repository,
    resident_key,
)

pytestmark = pytest.mark.django_db


def test_resident_upload_download_flow(client, repository, resident_key, settings):
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    ServiceRequestCatalog.objects.create(
        pk=311,
        categories=[
            {"code": "roads", "name": "Roads", "department": "Works"}
        ],
        digest="0" * 64,
        updated_at=timezone.now(),
    )

    token = "A" * 43
    result = repository.create_request(
        category="roads",
        description="pothole",
        location="Main",
        contact={"email": "resident@example.com"},
        resident_token=token,
        idempotency_key="photo-test",
    )
    request_id = result["id"]

    s = client.session
    save_credential(s, request_id, token)
    s.save()

    png_bytes = b"\x89PNG\r\n\x1a\n" + b"fixture"
    upload_command_id = uuid.uuid4()
    response = client.post(
        f"/service-requests/requests/{request_id}/",
        {
            "action": "upload",
            "command_id": str(upload_command_id),
            "expected_revision": 1,
            "file": SimpleUploadedFile(
                "photo.png", png_bytes, content_type="image/png"
            ),
        },
    )
    assert response.status_code == 200

    session_key = s.session_key
    items = claim_commands(session_key)
    assert len(items) == 1
    upload_item = items[0]
    assert upload_item["operation"] == "upload_attachment"
    assert upload_item["payload"]["name"] == "photo.png"
    _execute_and_ack(repository, session_key, upload_item)

    upload_command_page = client.get(
        f"/service-requests/commands/{upload_item['id']}/"
    )
    assert upload_command_page.status_code == 200
    assert "committed" in upload_command_page.content.decode().lower()

    resident = repository.get_resident(request_id, token)
    attachments = resident["attachments"]
    assert len(attachments) == 1
    attachment_id = attachments[0]["id"]
    assert attachment_id

    download_command_id = uuid.uuid4()
    response = client.post(
        f"/service-requests/requests/{request_id}/",
        {
            "action": "download",
            "command_id": str(download_command_id),
            "attachment_id": str(attachment_id),
        },
    )
    assert response.status_code == 200

    items = claim_commands(session_key)
    assert len(items) == 1
    download_item = items[0]
    assert download_item["operation"] == "download_attachment"
    _execute_and_ack(repository, session_key, download_item)

    download_command_page = client.get(
        f"/service-requests/commands/{download_item['id']}/"
    )
    assert download_command_page.status_code == 200
    assert download_command_page["Content-Type"] == "image/png"
    assert download_command_page.content == png_bytes