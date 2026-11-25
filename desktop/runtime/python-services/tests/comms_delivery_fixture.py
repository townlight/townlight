from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine

from townlight_comms import migrations
from townlight_comms.workflow import CommunicationsRepository


def make_repo(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'townlight_comms.db'}",
        connect_args={"check_same_thread": False},
    )
    migrations.upgrade(engine)
    return CommunicationsRepository(engine)


def approve_and_schedule(repo, channels):
    created = repo.create(
        "clerk",
        "announcement",
        "City news",
        "Published city announcement.",
        "en",
        [],
        access_review={"reviewed": True, "findings": []},
    )
    announcement_id = created["id"]
    revision_id = created["current_revision"]
    revision_sha = created["revision"]["sha256"]

    repo.review(announcement_id, "clerk", revision_id, "Reviewed.")
    repo.approve(announcement_id, revision_id, revision_sha, "clerk", [])
    repo.capture_source_snapshots(announcement_id, revision_id, revision_sha, [])
    repo.schedule(
        announcement_id,
        revision_id,
        revision_sha,
        "clerk",
        datetime.now(timezone.utc) - timedelta(seconds=1),
        channels,
    )
    return announcement_id


def subscribe(repo, email="reader@example.org"):
    result = repo.request_subscription(email, ["all"], "en")
    repo.confirm_subscription(result["confirmation_token"])
    return result
