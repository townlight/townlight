# SPDX-License-Identifier: AGPL-3.0-only
"""Prepare approved Townlight communications for the durable publisher queue."""
import hashlib
import ipaddress
import os
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


class CommunicationsPublisher:
    def __init__(self, repo, queue, public_origin, profile_root):
        parsed = urlsplit(public_origin)
        host = (parsed.hostname or "").lower()
        try:
            loopback = host == "localhost" or ipaddress.ip_address(host).is_loopback
        except ValueError:
            loopback = False
        if (
            parsed.scheme not in ("https", "http")
            or not host
            or parsed.username
            or parsed.password
            or parsed.path
            or parsed.query
            or parsed.fragment
            or (parsed.scheme == "http" and not loopback)
        ):
            raise ValueError("Public origin must be HTTPS, or loopback HTTP without a path")
        try:
            _ = parsed.port
        except ValueError as exc:
            raise ValueError("Public origin has an invalid port") from exc
        self.repo = repo
        self.queue = queue
        self.public_origin = public_origin.rstrip("/")
        self.profile_root = Path(profile_root)

    def prepare_one(self):
        job = self.repo.claim_due()
        if job is None:
            return None

        job_id = job["id"]
        claim_token = job["claim_token"]
        article_id = str(job["article_id"])
        revision = job["revision"]
        action = str(job["action"]).lower()
        actor = job["actor"]
        content = job["content"] or {}
        content_sha = content["sha256"]
        title = content["title"]

        channels = job["channels"] or ()
        if isinstance(channels, str):
            channels = (channels,)
        channels = {str(channel).lower() for channel in channels}
        website_requested = "website" in channels
        email_requested = "email" in channels

        artifact_path = None
        receipt = None
        summary = None
        try:
            if action in ("publish", "correct"):
                snapshots = self.repo.get_source_snapshots(article_id, revision, content_sha)
                artifact = self.repo.build_public_artifact(article_id, revision, content_sha, snapshots)
                artifact_sha = hashlib.sha256(artifact).hexdigest()
                artifacts = self.profile_root / "communications" / "artifacts"
                artifacts.mkdir(parents=True, exist_ok=True)
                artifact_path = artifacts / f"{artifact_sha}.zip"
                fd, temp_name = tempfile.mkstemp(dir=artifacts, prefix=".pending-", suffix=".zip")
                try:
                    with os.fdopen(fd, "wb") as stream:
                        stream.write(artifact)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temp_name, artifact_path)
                    temp_name = None
                finally:
                    if temp_name:
                        try:
                            os.unlink(temp_name)
                        except OSError:
                            pass
                manifest = {
                    "version": 2,
                    "kind": "article",
                    "action": "publish",
                    "meeting_id": article_id,
                    "title": title,
                    "artifact_sha256": artifact_sha,
                    "artifact_size": len(artifact),
                }
            elif action == "withdraw":
                manifest = {
                    "version": 2,
                    "kind": "article",
                    "action": "withdraw",
                    "meeting_id": article_id,
                }
            else:
                raise ValueError("Unsupported publication action")
        except Exception:  # noqa: BLE001 - unexpected failure marks failed; no blind retry
            self.repo.finish_publication(
                job_id,
                claim_token,
                website_receipt=None,
                email_summary=None,
                state="failed",
                error=True,
            )
            return None

        try:
            public_url = None
            if website_requested:
                result = self.queue.enqueue(manifest, actor, content_sha, artifact_path)
                public_url = f"{self.public_origin}/communications/{article_id}/"
                receipt = {
                    "status": "queued",
                    "url": public_url,
                    "queue_sequence": result["sequence"],
                }
            if email_requested:
                email_url = None if action == "withdraw" else public_url
                self.repo.enqueue_publication_email(
                    job_id, claim_token, public_url=email_url
                )
                summary = self.repo.email_summary(job_id)
            self.repo.finish_publication(
                job_id,
                claim_token,
                website_receipt=receipt,
                email_summary=summary,
                state="queued",
            )
        except Exception:  # noqa: BLE001 - unexpected failure marks uncertain; no blind retry
            self.repo.finish_publication(
                job_id,
                claim_token,
                website_receipt=receipt,
                email_summary=summary,
                state="uncertain",
            )
            return None
        return job_id
