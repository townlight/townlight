from __future__ import annotations

import hashlib
import json
import uuid
from hmac import compare_digest
from typing import Any, Mapping

from . import council_packet, meetings_bridge
from townlight_meetings.packet_assembly import PacketAssemblyRepository


def _canonical_uuid(value: Any) -> str:
    return str(uuid.UUID(str(value)))


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_budget_packet(
    packet_id: Any,
    approval_id: str,
    manifest_sha256: str,
    meeting_id: str,
    agenda_id: str,
    revision_sha256: str,
) -> dict[str, str]:
    profile = meetings_bridge.profile_root()

    def check(store):
        packet = store.get(str(packet_id))
        if packet is None:
            raise ValueError("packet not found")
        manifest, directory = council_packet.approved_public_packet(
            profile, packet, approval_id
        )

        actual_manifest_sha = _sha256_hex((directory / "manifest.json").read_bytes())
        if not compare_digest(actual_manifest_sha, str(manifest_sha256).lower()):
            raise ValueError("packet manifest sha256 mismatch")

        expected_meeting = _canonical_uuid(meeting_id)
        if _canonical_uuid(manifest["meeting_id"]) != expected_meeting:
            raise ValueError("meeting_id mismatch")

        expected_agenda = _canonical_uuid(agenda_id)
        agenda_ids = {_canonical_uuid(item) for item in manifest["agenda_item_ids"]}
        if expected_agenda not in agenda_ids:
            raise ValueError("agenda_id mismatch")

        revision_sources = [
            source
            for source in manifest.get("sources", [])
            if source.get("file_name") == "budget-revision.txt"
        ]
        if len(revision_sources) != 1:
            raise ValueError("expected exactly one budget-revision.txt attachment")
        if not compare_digest(
            str(revision_sources[0].get("sha256", "")).lower(),
            str(revision_sha256).lower(),
        ):
            raise ValueError("revision_sha256 mismatch")

        return {
            "packet_id": str(packet_id),
            "meeting_id": expected_meeting,
            "agenda_id": expected_agenda,
            "manifest_sha256": actual_manifest_sha,
            "revision_sha256": str(revision_sha256).lower(),
        }

    return meetings_bridge.legal_record(PacketAssemblyRepository, check)


def canonical_budget_text(revision: Mapping[str, Any]) -> str:
    try:
        payload = {
            key: revision[key]
            for key in (
                "fiscal_year",
                "lines",
                "prior_year_total_cents",
                "proposed_total_cents",
            )
        }
    except KeyError as exc:
        raise ValueError(f"missing budget revision key: {exc.args[0]}") from exc

    text = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    actual = _sha256_hex(text.encode("utf-8"))
    expected = revision.get("content_sha256")
    if not isinstance(expected, str) or not compare_digest(actual, expected.lower()):
        raise ValueError("content_sha256 mismatch")
    return text
