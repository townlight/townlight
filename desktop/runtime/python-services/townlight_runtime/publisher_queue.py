# SPDX-License-Identifier: AGPL-3.0-only
"""Durable Windows outbound queue for staff-approved public artifacts."""
import hashlib
import json
import logging
import os
import re
import sqlite3
import ssl
import tempfile
import threading
import time
import zipfile
from contextlib import closing
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx

LOG = logging.getLogger(__name__)
TOKEN = re.compile(r"[A-Za-z0-9_-]{43,128}")
CHUNK = 1024**2


class PublisherQueue:
    def __init__(self, profile):
        self.root = Path(profile) / "publisher"

    def connect(self):
        self.root.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.root / "queue.sqlite3", timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            meeting_id TEXT NOT NULL, kind TEXT NOT NULL, sequence INTEGER NOT NULL,
            digest TEXT NOT NULL, blob TEXT NOT NULL, actor TEXT NOT NULL, approval TEXT,
            created_at INTEGER NOT NULL, action TEXT NOT NULL, state TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, last_error TEXT,
            PRIMARY KEY (meeting_id, kind, sequence)
        )""")
        return db

    def enqueue(self, manifest, actor, approval=None, artifact=None):
        meeting_id, kind = manifest["meeting_id"], manifest["kind"]
        self.root.mkdir(parents=True, exist_ok=True)
        name = f"{uuid4().hex}.zip"
        final = self.root / name
        staged = None
        try:
            with tempfile.NamedTemporaryFile(dir=self.root, prefix=".pending-", delete=False) as file:
                staged = Path(file.name)
                self.write_bundle(file, manifest, artifact)
                file.flush()
                os.fsync(file.fileno())
            with staged.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            with closing(self.connect()) as db, db:
                db.execute("BEGIN IMMEDIATE")
                prior = db.execute("""SELECT * FROM jobs WHERE meeting_id=? AND kind=?
                    ORDER BY sequence DESC LIMIT 1""", (meeting_id, kind)).fetchone()
                if prior and prior["digest"] == digest and prior["state"] != "rejected":
                    return job_status(prior)
                if manifest["action"] == "withdraw" and not prior:
                    raise ValueError("There is no queued publication for this meeting")
                sequence = prior["sequence"] + 1 if prior else 1
                os.replace(staged, final)
                staged = None
                db.execute("""INSERT INTO jobs
                    (meeting_id,kind,sequence,digest,blob,actor,approval,created_at,action,state)
                    VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (meeting_id, kind, sequence, digest, name, actor, approval, int(time.time()),
                     manifest["action"], "queued"))
                if prior and prior["state"] in ("queued", "retrying", "rejected"):
                    db.execute("""UPDATE jobs SET state='superseded' WHERE meeting_id=? AND kind=? AND sequence=?""",
                               (meeting_id, kind, prior["sequence"]))
                result = db.execute("SELECT * FROM jobs WHERE meeting_id=? AND kind=? AND sequence=?",
                                    (meeting_id, kind, sequence)).fetchone()
            self.remove_finished()
            return job_status(result)
        finally:
            if staged:
                staged.unlink(missing_ok=True)

    @staticmethod
    def write_bundle(file, data, artifact):
        # Set fixed ZipInfo metadata so an identical approval has an identical digest.
        name = "packet.pdf" if data["kind"] == "packet" else "release.bin"
        with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as bundle:
            bundle.writestr(zipfile.ZipInfo("manifest.json"), json.dumps(data, sort_keys=True, ensure_ascii=False))
            if artifact is None:
                return
            sha = hashlib.sha256()
            size = 0
            with artifact.open("rb") as source, bundle.open(zipfile.ZipInfo(name), "w", force_zip64=True) as dest:
                while chunk := source.read(CHUNK):
                    size += len(chunk)
                    if size > data["artifact_size"]:
                        raise ValueError("Approved artifact changed")
                    sha.update(chunk)
                    dest.write(chunk)
            if size != data["artifact_size"] or sha.hexdigest() != data["artifact_sha256"]:
                raise ValueError("Approved artifact changed")

    def status(self, meeting_id):
        with closing(self.connect()) as db:
            rows = db.execute("""SELECT j.* FROM jobs j WHERE meeting_id=? AND NOT EXISTS (
                SELECT 1 FROM jobs newer WHERE newer.meeting_id=j.meeting_id AND newer.kind=j.kind
                AND newer.sequence>j.sequence) ORDER BY j.kind""", (str(meeting_id),)).fetchall()
        return [job_status(row) for row in rows]

    def next_job(self):
        with closing(self.connect()) as db:
            return db.execute("""SELECT * FROM jobs WHERE state IN ('queued','retrying') AND retry_at<=?
                ORDER BY CASE WHEN action='withdraw' THEN 0 ELSE 1 END,retry_at,created_at,sequence LIMIT 1""",
                              (int(time.time()),)).fetchone()

    def finish(self, job, state, message=None):
        attempts = job["attempts"] + 1
        retry = int(time.time()) + min(300, 2 ** min(9, attempts)) if state == "retrying" else 0
        with closing(self.connect()) as db, db:
            db.execute("""UPDATE jobs SET state=?, attempts=?, retry_at=?, last_error=?
                WHERE meeting_id=? AND kind=? AND sequence=? AND state IN ('queued','retrying')""",
                (state, attempts, retry, message, job["meeting_id"], job["kind"], job["sequence"]))
        self.remove_finished()

    def remove_finished(self):
        with closing(self.connect()) as db:
            rows = db.execute("SELECT blob FROM jobs WHERE state IN ('delivered','superseded') AND blob<>''").fetchall()
            for row in rows:
                try:
                    (self.root / row["blob"]).unlink(missing_ok=True)
                except OSError:
                    # Windows won't remove an in-flight sender's open handle. Try next time.
                    continue
                with db:
                    db.execute("UPDATE jobs SET blob='' WHERE blob=?", (row["blob"],))

    def deliver(self, job):
        try:
            origin, token = publisher_config()
        except (ValueError, OSError, UnicodeError):
            self.finish(job, "retrying", "Portal destination or service credential is unavailable")
            return
        path = self.root / job["blob"]
        endpoint = f"/townlight/v1/publications/{job['meeting_id']}/{job['kind']}/{job['sequence']}/"
        if not path.is_file():
            self.finish(job, "rejected", "Approved outbound bundle is missing")
            return
        try:
            with path.open("rb") as source, httpx.Client(
                base_url=origin, verify=ssl.create_default_context(), follow_redirects=False,
                trust_env=False, timeout=httpx.Timeout(120, connect=10),
            ) as client:
                response = client.post(endpoint, content=iter(lambda: source.read(CHUNK), b""), headers={
                    "Content-Length": str(path.stat().st_size),
                    "Content-Type": "application/zip",
                    "X-Townlight-SHA256": job["digest"],
                    "Authorization": "Bearer " + token,
                })
        except (httpx.HTTPError, OSError):
            self.finish(job, "retrying", "Portal connection or transfer failed")
            return
        if response.status_code == 200:
            try:
                if response.json().get("status") in ("applied", "unchanged"):
                    self.finish(job, "delivered")
                    return
            except (AttributeError, ValueError):
                pass
        if response.status_code in (400, 409, 413):
            self.finish(job, "rejected", f"Portal rejected the publication (HTTP {response.status_code})")
        else:
            self.finish(job, "retrying", f"Portal unavailable or credential rejected (HTTP {response.status_code})")

    def run(self, stop: threading.Event):
        while not stop.is_set():
            try:
                job = self.next_job()
                if job:
                    self.deliver(job)
                    continue
            except (OSError, sqlite3.Error):
                LOG.warning("Townlight publication queue is unavailable; will retry")
            stop.wait(2)


def job_status(row):
    return {field: row[field] for field in (
        "meeting_id", "kind", "sequence", "action", "state", "created_at", "attempts", "last_error",
    )}


def publisher_config():
    origin = os.environ.get("TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN", "").rstrip("/")
    parsed = urlsplit(origin)
    local = parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "::1")
    if (not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment
            or (parsed.scheme != "https" and not local)):
        raise ValueError("Configure the trusted HTTPS portal origin")
    path = Path(os.environ.get("TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_FILE", ""))
    if not path.is_absolute():
        raise ValueError("Configure the publisher credential file")
    with path.open(encoding="ascii") as source:
        token = source.read(200).strip()
    if not TOKEN.fullmatch(token):
        raise ValueError("Invalid publisher credential")
    return origin, token
