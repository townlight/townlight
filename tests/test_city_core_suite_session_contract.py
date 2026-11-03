"""City-core contract: one TownlightCore suite session works across all four modules."""

from __future__ import annotations

import importlib
import importlib.util
import os
import sys
from pathlib import Path

import pytest


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
UMBRELLA_ROOT = Path(__file__).resolve().parents[1]


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
        "townlight_records_suite_session_contract",
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


def test_one_suite_session_validates_and_revokes_across_city_core_modules(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "city-core-suite-session-contract-secret"
    revocation_file = tmp_path / "shared-suite-session-revocations.json"
    monkeypatch.setenv("TOWNLIGHT_CORE_SUITE_SESSION_SECRET", secret)
    monkeypatch.setenv("TOWNLIGHT_CORE_SUITE_SESSION_REVOCATION_FILE", str(revocation_file))

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
        session_id="city-core-shared-session",
    )

    assert core.validate_suite_session_token(
        token,
        required_roles=frozenset({"staff"}),
    ).subject == "operator@example.gov"

    records_user = records.SuiteSessionUser(
        email="operator@example.gov",
        roles=roles,
        must_change_password=False,
    )
    assert records.validate_suite_session_for_user(
        token,
        user=records_user,
        required_roles={"records_admin"},
    ).subject == "operator@example.gov"

    assert clerk.validate_suite_session_token(
        token,
        required_roles=frozenset({"clerk_admin"}),
    ).session_id == "city-core-shared-session"

    assert code.validate_suite_session_token(
        token,
        required_roles=frozenset({"code_admin"}),
    ).session_id == "city-core-shared-session"

    core.revoke_suite_session("city-core-shared-session")
    assert revocation_file.exists()

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
