#!/usr/bin/env python3
"""Headless acceptance-fixture server for Townlight installed-app exercises.

This process is a fixture, not an acceptance result. Actual candidate workflows
must be run against it before acceptance can be claimed. It creates only files
under the caller-supplied owned --root, never relays mail, and never disables
TLS verification or patches the real email transport.
"""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import os
import secrets
import signal
import ssl
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path

sys.dont_write_bytecode = True

from aiosmtpd.controller import Controller
from cryptography import x509
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

HOST = "127.0.0.1"
SYNTHETIC_TOKEN_BYTES = 32


def _atomic_write(path: Path, data: bytes, mode: int = 0o600) -> None:
    """Write a file atomically without deleting any fixture-owned file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    with os.fdopen(fd, "wb") as handle:
        os.fchmod(handle.fileno(), mode)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temp_name, path)


def _write_json(path: Path, value: dict) -> None:
    body = json.dumps(value, indent=2, sort_keys=True, allow_nan=False)
    _atomic_write(path, (body + "\n").encode("utf-8"), 0o600)


def _make_certificate(tls_dir: Path) -> tuple[Path, Path]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.now(timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(days=2))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("localhost"),
                    x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                ]
            ),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    cert_path = tls_dir / "localhost.crt"
    key_path = tls_dir / "localhost.key"
    _atomic_write(
        key_path,
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ),
    )
    _atomic_write(cert_path, certificate.public_bytes(serialization.Encoding.PEM))
    return cert_path, key_path


class CaptureHandler:
    """Capture every local synthetic SMTP message without relaying it."""

    def __init__(self, mail_dir: Path) -> None:
        self.mail_dir = mail_dir
        self._lock = threading.Lock()

    async def handle_DATA(self, server, session, envelope) -> str:
        try:
            data = getattr(envelope, "content", None) or getattr(envelope, "original_content", None) or b""
            if isinstance(data, str):
                data = data.encode("utf-8", "surrogateescape")
            if not isinstance(data, bytes):
                data = bytes(data)
            message = BytesParser(policy=policy.default).parsebytes(data)
            with self._lock:
                ident = f"email-{time.time_ns()}-{uuid.uuid4().hex[:10]}"
            headers = {}
            for name in ("From", "To", "Cc", "Bcc", "Subject", "Date", "Message-ID"):
                headers[name.lower()] = [str(item) for item in message.get_all(name, [])]
            metadata = {
                "id": ident,
                "mail_from": envelope.mail_from,
                "recipients": list(envelope.rcpt_tos or []),
                "headers": headers,
                "size": len(data),
                "received_at": datetime.now(timezone.utc).isoformat(),
                "eml": f"{ident}.eml",
                "json": f"{ident}.json",
            }
            _atomic_write(self.mail_dir / f"{ident}.eml", data)
            _atomic_write(
                self.mail_dir / f"{ident}.json",
                json.dumps(metadata, indent=2, sort_keys=True, allow_nan=False).encode("utf-8"),
            )
            return "250 Message captured by Townlight fixture"
        except Exception:
            return "451 Fixture capture failed"


def _configure_portal_env(
    root: Path,
    portal_port: int,
    cert_path: Path,
    token_path: Path,
    token_sha_path: Path,
    resident_key_path: Path,
    db_path: Path,
) -> dict[str, str]:
    secret_key = secrets.token_urlsafe(64)
    origins = f"http://127.0.0.1:{portal_port},http://localhost:{portal_port}"
    os.environ.update(
        {
            "DJANGO_SETTINGS_MODULE": "portal.settings",
            "TOWNLIGHT_SECRET_KEY": secret_key,
            "TOWNLIGHT_DEBUG": "1",
            "TOWNLIGHT_ALLOWED_HOSTS": "127.0.0.1,localhost",
            "TOWNLIGHT_CSRF_TRUSTED_ORIGINS": origins,
            "TOWNLIGHT_BASE_URL": f"http://127.0.0.1:{portal_port}",
            "TOWNLIGHT_DB": str(db_path),
            "TOWNLIGHT_MEDIA_ROOT": str(root / "media"),
            "TOWNLIGHT_STATIC_ROOT": str(root / "static"),
            "TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE": str(resident_key_path),
            "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE": str(token_sha_path),
            "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_FILE": str(token_path),
            "TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN": f"http://127.0.0.1:{portal_port}",
            "TOWNLIGHT_SHARED_STAFF_HOST": "1",
            "SSL_CERT_FILE": str(cert_path),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    return {
        "TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN": f"http://127.0.0.1:{portal_port}",
        "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_FILE": str(token_path),
        "TOWNLIGHT_SHARED_STAFF_HOST": "1",
        "SSL_CERT_FILE": str(cert_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Townlight headless acceptance fixture")
    parser.add_argument("--root", required=True, help="absolute owned temporary root")
    parser.add_argument("--portal-root", required=True, help="actual repository portal directory")
    parser.add_argument("--portal-port", type=int, default=24680)
    parser.add_argument("--smtp-port", type=int, default=24681)
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_absolute():
        parser.error("--root must be an absolute path")
    root = root.resolve()
    portal_root = Path(args.portal_root).resolve()
    if not portal_root.is_dir():
        parser.error("--portal-root must be an existing directory")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)

    mail_dir = root / "mail"
    tls_dir = root / "tls"
    mail_dir.mkdir(parents=True, exist_ok=True)
    tls_dir.mkdir(parents=True, exist_ok=True)

    cert_path, key_path = _make_certificate(tls_dir)
    token = secrets.token_urlsafe(SYNTHETIC_TOKEN_BYTES)
    token_path = root / "publisher.token"
    token_sha_path = root / "publisher-token.sha256"
    resident_key_path = root / "resident.key"
    db_path = root / "portal.sqlite3"
    _atomic_write(token_path, token.encode("ascii"))
    _atomic_write(
        token_sha_path,
        (hashlib.sha256(token.encode("ascii")).hexdigest() + "\n").encode("ascii"),
        0o644,
    )
    _atomic_write(resident_key_path, Fernet.generate_key())

    runtime_environment = _configure_portal_env(
        root, args.portal_port, cert_path, token_path, token_sha_path,
        resident_key_path, db_path,
    )

    sys.path.insert(0, str(portal_root))
    from django.core.management import call_command
    import django

    django.setup()
    call_command("migrate", interactive=False, verbosity=0, run_syncdb=True)

    from portal.wsgi import application
    from waitress import create_server

    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.minimum_version = ssl.TLSVersion.TLSv1_2
    server_context.load_cert_chain(certfile=str(cert_path), keyfile=str(key_path))

    smtp_controller: Controller | None = None
    waitress_server = None
    stopping = threading.Event()

    def stop_owned() -> None:
        if stopping.is_set():
            return
        stopping.set()
        if smtp_controller is not None:
            try:
                smtp_controller.stop()
            except Exception:
                pass
        if waitress_server is not None:
            try:
                waitress_server.close()
            except Exception:
                pass

    def handle_term(signum, frame) -> None:
        stop_owned()
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, handle_term)

    try:
        smtp_controller = Controller(
            CaptureHandler(mail_dir),
            hostname=HOST,
            port=args.smtp_port,
            tls_context=server_context,
            require_starttls=True,
            auth_required=False,
        )
        smtp_controller.start()

        waitress_server = create_server(
            application, host=HOST, port=args.portal_port, threads=8
        )
        state_path = root / "fixture-state.json"
        _write_json(
            state_path,
            {
                "pid": os.getpid(),
                "root": str(root),
                "ports": {"portal": args.portal_port, "smtp": args.smtp_port},
                "paths": {
                    "fixture_state": str(state_path),
                    "cert": str(cert_path),
                    "tls_key": str(key_path),
                    "mail": str(mail_dir),
                    "portal_db": str(db_path),
                    "publisher_token": str(token_path),
                    "publisher_token_sha256": str(token_sha_path),
                    "resident_key": str(resident_key_path),
                },
                "runtime_environment": runtime_environment,
                "acceptance": False,
                "note": "Fixture only; actual candidate workflows are required for acceptance.",
            },
        )
        waitress_server.run()
    except KeyboardInterrupt:
        pass
    finally:
        stop_owned()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
