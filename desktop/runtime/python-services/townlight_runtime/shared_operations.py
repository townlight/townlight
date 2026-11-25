"""Durable replay receipts for shared staff requests that allocate records.

The data and files stay owned by the existing domain. A reservation survives
host loss before a receipt is written and fences an uncertain operation.
"""

import re
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

ALLOCATION = re.compile(
    r"/desktop/v1/(?:meetings/(?:meetings(?:/[0-9a-f-]+/(?:packet-snapshots|council-source))?"
    r"|agenda-items(?:/[0-9a-f-]+/reviews)?|packets/[0-9a-f-]+/(?:council-preview|council-approval))"
    r"|requests(?:/[0-9a-f-]+/actions)?"
    r"|communications/articles(?:/[0-9a-f-]+/(?:revisions|attachments|records))?"
    r"|parks/(?:catalog/(?:resource|program)|households|participants|bookings|sessions|registrations|refunds"
    r"|resources/[0-9a-f-]+/(?:closures|maintenance)"
    r"|attachments/(?:resource|program|booking|registration)/[0-9a-f-]+"
    r"|archives/[^/]+/[0-9a-f-]+/records)"
    r"|municipal-staff/data/parks/preview)"
)


@dataclass(frozen=True)
class Replay:
    status: int | None = None
    body: bytes | None = None
    reason: str | None = None


class SharedOperations:
    def __init__(self, root: Path):
        self.database = root / "config" / "shared-staff-operations.sqlite3"
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS allocation_receipts (
                actor TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL,
                status INTEGER, body BLOB, PRIMARY KEY (actor, operation)
            )""")
            connection.commit()

    def begin(self, actor: str, operation: str, fingerprint: str) -> Replay | None:
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT fingerprint, status, body FROM allocation_receipts WHERE actor = ? AND operation = ?",
                                     (actor, operation)).fetchone()
            if row is not None:
                if row[0] != fingerprint:
                    return Replay(reason="operation-key-conflict")
                if row[1] is None:
                    return Replay(reason="operation-outcome-unknown")
                return Replay(status=row[1], body=row[2])
            connection.execute("INSERT INTO allocation_receipts (actor, operation, fingerprint) VALUES (?, ?, ?)",
                               (actor, operation, fingerprint))
            connection.commit()
            return None

    def complete(self, actor: str, operation: str, status: int, body: bytes):
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute("UPDATE allocation_receipts SET status = ?, body = ? WHERE actor = ? AND operation = ?",
                               (status, body, actor, operation))
            connection.commit()
