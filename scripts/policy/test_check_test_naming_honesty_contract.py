from __future__ import annotations

"""Contract tests for the test-naming honesty policy gate."""

from pathlib import Path

from check_test_naming_honesty import scan_test_naming_honesty


def test_live_named_test_that_monkeypatches_named_boundary_fails(tmp_path: Path) -> None:
    bad_test = tmp_path / "test_townlight_code_live_handoff_emitter.py"
    bad_test.write_text(
        "\n".join(
            [
                "def test_handoff(monkeypatch):",
                "    monkeypatch.setattr(townlight_code_handoff, '_send_townlight_code_handoff_payload', lambda *args: None)",
            ]
        ),
        encoding="utf-8",
    )

    findings = scan_test_naming_honesty([bad_test])

    assert findings == [
        {
            "path": str(bad_test),
            "line": 2,
            "message": (
                "Live/real-wire/integration test filename monkeypatches the named boundary; "
                "rename it as unit/shape coverage or exercise the real boundary."
            ),
        }
    ]


def test_unit_named_test_may_monkeypatch_without_live_claim(tmp_path: Path) -> None:
    unit_test = tmp_path / "test_townlight_code_handoff_emitter_unit.py"
    unit_test.write_text(
        "\n".join(
            [
                "def test_handoff(monkeypatch):",
                "    monkeypatch.setattr(townlight_code_handoff, '_send_townlight_code_handoff_payload', lambda *args: None)",
            ]
        ),
        encoding="utf-8",
    )

    assert scan_test_naming_honesty([unit_test]) == []
