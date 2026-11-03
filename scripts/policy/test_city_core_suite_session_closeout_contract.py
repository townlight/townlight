from __future__ import annotations

"""Close-out contracts for city-core suite-session protocol drift and logout."""

import base64
import hashlib
import hmac
import importlib
import importlib.util
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient


WORKSPACE_ROOT = Path(__file__).resolve().parents[3]


def _prepend_path(path: Path) -> None:
    resolved = str(path)
    if resolved not in sys.path:
        sys.path.insert(0, resolved)


def _load_city_core_modules() -> dict[str, object]:
    _prepend_path(WORKSPACE_ROOT / "townlight_core")
    _prepend_path(WORKSPACE_ROOT / "townlight_records" / "backend")
    _prepend_path(WORKSPACE_ROOT / "townlight_meetings")
    _prepend_path(WORKSPACE_ROOT / "townlight_code")

    records_suite_session_path = (
        WORKSPACE_ROOT / "townlight_records" / "backend" / "app" / "auth" / "suite_session.py"
    )
    records_spec = importlib.util.spec_from_file_location(
        "townlight_records_suite_session_closeout_contract",
        records_suite_session_path,
    )
    assert records_spec is not None
    assert records_spec.loader is not None
    records_module = importlib.util.module_from_spec(records_spec)
    sys.modules[records_spec.name] = records_module
    records_spec.loader.exec_module(records_module)

    return {
        "core": importlib.import_module("townlight_core.auth.suite_session"),
        "records": records_module,
        "clerk": importlib.import_module("townlight_meetings.suite_session_compat"),
        "code": importlib.import_module("townlight_code.suite_session_auth"),
    }


def _base64url_json(payload: dict[str, object]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _issue_token_with_header(
    *,
    secret: str,
    header: dict[str, object],
    subject: str,
    roles: frozenset[str],
    session_id: str,
) -> str:
    now = datetime.now(UTC)
    payload_segment = _base64url_json(
        {
            "sub": subject,
            "roles": sorted(roles),
            "sid": session_id,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=15)).timestamp()),
        }
    )
    header_segment = _base64url_json(header)
    signing_input = f"{header_segment}.{payload_segment}"
    signature = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    signature_segment = base64.urlsafe_b64encode(signature).rstrip(b"=").decode("ascii")
    return f"{signing_input}.{signature_segment}"


def test_unsupported_suite_session_header_is_rejected_across_city_core_modules(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "city-core-suite-session-header-secret"
    monkeypatch.setenv("TOWNLIGHT_CORE_SUITE_SESSION_SECRET", secret)
    modules = _load_city_core_modules()
    roles = frozenset({"records_admin", "clerk_admin", "code_admin", "staff"})
    token = _issue_token_with_header(
        secret=secret,
        header={"alg": "HS256", "typ": "JWS"},
        subject="operator@example.gov",
        roles=roles,
        session_id="city-core-header-drift-session",
    )
    records_user = modules["records"].SuiteSessionUser(
        email="operator@example.gov",
        roles=roles,
        must_change_password=False,
    )

    with pytest.raises(PermissionError, match="unsupported header"):
        modules["core"].validate_suite_session_token(token, required_roles=frozenset({"staff"}))
    with pytest.raises(PermissionError, match="unsupported header"):
        modules["records"].validate_suite_session_for_user(
            token,
            user=records_user,
            required_roles={"records_admin"},
        )
    with pytest.raises(PermissionError, match="unsupported header"):
        modules["clerk"].validate_suite_session_token(token, required_roles=frozenset({"clerk_admin"}))
    with pytest.raises(PermissionError, match="unsupported header"):
        modules["code"].validate_suite_session_token(token, required_roles=frozenset({"code_admin"}))


@pytest.mark.asyncio
async def test_townlight_meetings_logout_revokes_suite_session_across_city_core_modules(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "city-core-suite-session-logout-secret"
    revocation_file = tmp_path / "shared-suite-session-logout-revocations.json"
    monkeypatch.setenv("TOWNLIGHT_CORE_SUITE_SESSION_SECRET", secret)
    monkeypatch.setenv("TOWNLIGHT_CORE_SUITE_SESSION_REVOCATION_FILE", str(revocation_file))
    monkeypatch.setenv("TOWNLIGHT_MEETINGS_STAFF_AUTH_MODE", "bearer")

    modules = _load_city_core_modules()
    core = modules["core"]
    records = modules["records"]
    clerk = modules["clerk"]
    code = modules["code"]
    for module in modules.values():
        revoked = getattr(module, "_REVOKED_SESSION_IDS", None)
        if isinstance(revoked, dict):
            revoked.clear()

    roles = frozenset({"records_admin", "clerk_admin", "code_admin", "staff"})
    token = core.issue_suite_session_token(
        subject="operator@example.gov",
        roles=roles,
        session_id="city-core-logout-session",
    )
    records_user = records.SuiteSessionUser(
        email="operator@example.gov",
        roles=roles,
        must_change_password=False,
    )
    assert records.validate_suite_session_for_user(
        token,
        user=records_user,
        required_roles={"records_admin"},
    ).session_id == "city-core-logout-session"

    clerk_main = importlib.import_module("townlight_meetings.main")
    async with AsyncClient(
        transport=ASGITransport(app=clerk_main.app),
        base_url="http://testserver",
        follow_redirects=False,
    ) as client:
        logout_response = await client.post(
            "/staff/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        rejected_response = await client.get(
            "/staff/session",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert logout_response.status_code == 302
    assert logout_response.headers["location"] == "/staff"
    assert revocation_file.exists()
    assert rejected_response.status_code != 200

    for module in modules.values():
        revoked = getattr(module, "_REVOKED_SESSION_IDS", None)
        if isinstance(revoked, dict):
            revoked.clear()

    with pytest.raises(PermissionError, match="revoked"):
        core.validate_suite_session_token(token, required_roles=frozenset({"staff"}))
    with pytest.raises(PermissionError, match="revoked"):
        records.validate_suite_session_for_user(
            token,
            user=records_user,
            required_roles={"records_admin"},
        )
    with pytest.raises(PermissionError, match="revoked"):
        clerk.validate_suite_session_token(token, required_roles=frozenset({"clerk_admin"}))
    with pytest.raises(PermissionError, match="revoked"):
        code.validate_suite_session_token(token, required_roles=frozenset({"code_admin"}))
