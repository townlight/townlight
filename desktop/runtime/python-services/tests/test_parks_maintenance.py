"""Real HTTP coverage for parks maintenance to canonical 311 requests."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import create_engine
from townlight_311.workflow import ServiceRequestRepository

from parks_http_support import RESOURCE, _staff_actor, parks_app
from townlight_runtime.service_requests import audit_actor, service_request_actor

PARKS_BASE = "/desktop/v1/parks"


def test_parks_maintenance_uses_canonical_service_request(parks_app, tmp_path):
    client, parksrepo = parks_app
    engine = create_engine(
        f"sqlite:///{(tmp_path / '311.db').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    try:
        requests_repo = ServiceRequestRepository(engine)
        app = client.app
        app.state.desktop_service_requests = requests_repo
        app.dependency_overrides[service_request_actor] = _staff_actor

        staff_id = str(_staff_actor("test-staff").id)
        requests_repo.save_category(
            "parks",
            "Maintenance",
            "Public Works",
            True,
            staff_id,
        )

        resource = parksrepo.catalog_create("resource", "staff", RESOURCE)
        resource_id = resource["id"]
        command_id = str(uuid4())
        payload = {
            "command_id": command_id,
            "category": "parks",
            "description": "repairbench",
            "contact": {},
        }
        maintenance_path = f"{PARKS_BASE}/resources/{resource_id}/maintenance"

        first = client.post(maintenance_path, json=payload)
        assert first.status_code == 200, first.text
        first_body = first.json()
        request_id = first_body["request"]["id"]
        link_id = first_body["link"]["id"]

        retry = client.post(maintenance_path, json=payload)
        assert retry.status_code == 200, retry.text
        retry_body = retry.json()
        assert retry_body["request"]["id"] == request_id
        assert retry_body["link"]["id"] == link_id

        listed = client.get(maintenance_path)
        assert listed.status_code == 200, listed.text
        linked = next(
            item for item in listed.json() if item["request"]["id"] == request_id
        )
        staff_request = requests_repo.get_staff(request_id)
        assert linked["request"]["id"] == request_id
        assert linked["request"] == staff_request

        app.dependency_overrides[service_request_actor] = lambda: SimpleNamespace(
            id=uuid4()
        )
        forbidden = client.post(
            maintenance_path,
            json={**payload, "command_id": str(uuid4())},
        )
        assert forbidden.status_code == 403, forbidden.text

        app.dependency_overrides[service_request_actor] = _staff_actor
        missing_auth = client.post(
            maintenance_path,
            json={**payload, "command_id": str(uuid4())},
            headers={"X-Townlight-Session": ""},
        )
        assert missing_auth.status_code == 401, missing_auth.text

        actor = audit_actor(_staff_actor("test-staff"))
        current = requests_repo.get_staff(request_id)
        assert current["state"] == "submitted"

        previous_revision = current["revision"]
        requests_repo.transition(
            request_id,
            previous_revision,
            actor,
            "triaged",
            "maintenance triage",
        )
        current = requests_repo.get_staff(request_id)
        assert current["state"] == "triaged"
        assert current["revision"] > previous_revision
        linked = client.get(f"{PARKS_BASE}/maintenance/{link_id}")
        assert linked.status_code == 200, linked.text
        assert linked.json()["request"] == current

        previous_revision = current["revision"]
        requests_repo.transition(
            request_id,
            previous_revision,
            actor,
            "assigned",
            "assign public works",
            assignee="Public Works",
        )
        current = requests_repo.get_staff(request_id)
        assert current["state"] == "assigned"
        assert current["assignee"] == "Public Works"
        assert current["revision"] > previous_revision
        linked = client.get(f"{PARKS_BASE}/maintenance/{link_id}")
        assert linked.status_code == 200, linked.text
        assert linked.json()["request"] == current

        for target, reason in (
            ("in_progress", "work started"),
            ("resolved", "work completed"),
            ("closed", "request closed"),
        ):
            previous_revision = current["revision"]
            requests_repo.transition(
                request_id,
                previous_revision,
                actor,
                target,
                reason,
            )
            current = requests_repo.get_staff(request_id)
            assert current["state"] == target
            assert current["revision"] > previous_revision
            linked = client.get(f"{PARKS_BASE}/maintenance/{link_id}")
            assert linked.status_code == 200, linked.text
            assert linked.json()["request"] == current

        events = requests_repo.get_staff(request_id)["events"]
        assert isinstance(events, list) and events
        assert events[-1]["kind"] == "state_changed"
        assert events[-1]["payload"]["to"] == "closed"

        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000d49444154789c6360000000020001e221bc330000000049454e44ae426082"
        )
        attachment = requests_repo.add_attachment(
            request_id,
            current["revision"],
            actor,
            name="maintenance.png",
            media_type="image/png",
            content=png,
            public=False,
        )
        assert isinstance(attachment, dict)
        attachment_id = attachment["id"]
        assert attachment["name"] == "maintenance.png"
        assert attachment["media_type"] == "image/png"
        assert attachment["size"] == len(png)
        expected_sha256 = hashlib.sha256(png).hexdigest()
        assert attachment["sha256"] == expected_sha256
        stored = requests_repo.get_attachment_staff(request_id, attachment_id)
        assert stored["content"] == png
        assert stored["sha256"] == expected_sha256
    finally:
        engine.dispose()
