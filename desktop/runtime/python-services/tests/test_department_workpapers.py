import sqlite3
from types import SimpleNamespace

import pytest
from civicutility.workflow import UtilityPolicyVersion, UtilityPrincipal
from townlight_runtime.department_workpapers import initialize_department_workpapers


def _assert_repositories(app):
    state = app.state
    assert state.desktop_utilities is not None
    assert state.desktop_library is not None
    assert state.desktop_elections is not None
    assert state.desktop_elections_officials == frozenset()


def test_missing_311_repository_refuses_and_creates_no_data(tmp_path, monkeypatch):
    monkeypatch.delenv("TOWNLIGHT_DATA_DIR", raising=False)
    profile = tmp_path / "profile"
    app = SimpleNamespace(state=SimpleNamespace())

    with pytest.raises(RuntimeError):
        initialize_department_workpapers(app, profile)

    assert not (profile / "Data").exists()


def test_relative_explicit_data_root_rejected(tmp_path, monkeypatch):
    monkeypatch.delenv("TOWNLIGHT_DATA_DIR", raising=False)
    app = SimpleNamespace(state=SimpleNamespace(desktop_service_requests=object()))

    with pytest.raises(ValueError):
        initialize_department_workpapers(
            app, tmp_path / "profile", data_root="relative-workpapers"
        )


def test_custom_absolute_data_dir_persists_policy(tmp_path, monkeypatch):
    custom = tmp_path / "custom-data"
    profile = tmp_path / "profile"
    profile.mkdir()
    (profile / "config").mkdir()
    monkeypatch.setenv("TOWNLIGHT_DATA_DIR", str(custom))

    app1 = SimpleNamespace(state=SimpleNamespace(desktop_service_requests=object()))
    initialize_department_workpapers(app1, profile)
    _assert_repositories(app1)

    principal = UtilityPrincipal(
        "local-admin", "Local Admin", roles=frozenset({"local-admin"})
    )
    policy_text = "Utility payment policy text used to verify durable storage."
    policy = UtilityPolicyVersion(
        "payment", 3, "Payment policy", policy_text, "citation", True
    )
    app1.state.desktop_utilities.register_policy(principal, policy)

    app2 = SimpleNamespace(state=SimpleNamespace(desktop_service_requests=object()))
    initialize_department_workpapers(app2, profile)
    _assert_repositories(app2)

    assert (custom / "utilities.sqlite3").is_file()
    assert (custom / "library.sqlite3").is_file()
    assert (custom / "elections.sqlite3").is_file()
    assert not (profile / "Data").exists()

    conn = sqlite3.connect(custom / "utilities.sqlite3")
    try:
        row = conn.execute(
            "SELECT text FROM policies WHERE policy_id=? AND version=?",
            ("payment", 3),
        ).fetchone()
    finally:
        conn.close()

    assert row == (policy_text,)