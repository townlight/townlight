"""Real HTTP roundtrip for private parks attachments."""

from __future__ import annotations

import base64
import hashlib

from parks_http_support import RESOURCE, parks_app

PDF_BYTES = (
    b"%PDF-1.4\n"
    b"1 0 obj\n"
    b"<< /Type /Catalog /Pages 2 0 R >>\n"
    b"endobj\n"
    b"2 0 obj\n"
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n"
    b"endobj\n"
    b"3 0 obj\n"
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\n"
    b"endobj\n"
    b"trailer\n"
    b"<< /Root 1 0 R >>\n"
    b"%%EOF\n"
)
PDF_SHA256 = hashlib.sha256(PDF_BYTES).hexdigest()


def _assert_no_host_path(payload: str, tmp_path) -> None:
    assert str(tmp_path) not in payload


def test_private_resource_attachment_roundtrip(parks_app, tmp_path):
    client, _repository = parks_app

    created = client.post(
        "/desktop/v1/parks/catalog/resource",
        json={"payload": RESOURCE},
    )
    created.raise_for_status()
    resource_id = created.json()["id"]
    assert resource_id

    uploaded = client.post(
        f"/desktop/v1/parks/attachments/resource/{resource_id}",
        json={
            "name": "waiver.pdf",
            "media_type": "application/pdf",
            "content_base64": base64.b64encode(PDF_BYTES).decode("ascii"),
        },
    )
    assert uploaded.status_code == 200
    metadata = uploaded.json()
    attachment_id = metadata["id"]
    assert isinstance(attachment_id, str) and attachment_id
    assert metadata["entity_kind"] == "resource"
    assert metadata["entity_id"] == resource_id
    assert metadata["name"] == "waiver.pdf"
    assert metadata["media_type"] == "application/pdf"
    assert metadata["sha256"] == PDF_SHA256
    assert metadata["size"] == len(PDF_BYTES)
    _assert_no_host_path(uploaded.text, tmp_path)

    content_url = f"/desktop/v1/parks/attachments/{attachment_id}/content"
    downloaded = client.get(content_url)
    assert downloaded.status_code == 200
    assert downloaded.content == PDF_BYTES
    assert hashlib.sha256(downloaded.content).hexdigest() == PDF_SHA256
    assert int(downloaded.headers["content-length"]) == len(PDF_BYTES)
    assert downloaded.headers["x-content-type-options"] == "nosniff"
    assert downloaded.headers["cache-control"] == "no-store"
    assert downloaded.headers["x-content-sha256"] == PDF_SHA256
    assert downloaded.headers["content-type"].startswith("application/pdf")
    _assert_no_host_path(downloaded.content.decode("latin-1"), tmp_path)

    listed = client.get(
        f"/desktop/v1/parks/attachments/resource/{resource_id}"
    )
    assert listed.status_code == 200
    body = listed.json()
    assert body["overflow"] is False
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["id"] == attachment_id
    assert item["entity_kind"] == "resource"
    assert item["entity_id"] == resource_id
    assert item["name"] == "waiver.pdf"
    assert item["media_type"] == "application/pdf"
    assert item["sha256"] == PDF_SHA256
    assert item["size"] == len(PDF_BYTES)
    _assert_no_host_path(listed.text, tmp_path)

    unauth = client.get(content_url, headers={"X-Townlight-Session": ""})
    assert unauth.status_code == 401
