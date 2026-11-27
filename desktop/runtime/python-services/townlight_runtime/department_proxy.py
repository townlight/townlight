"""Exact staff-route allowlist for department-scoped desktop proxy forwarding."""

from __future__ import annotations

import re
from urllib.parse import parse_qsl

_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_REVISION_RE = re.compile(r"\A[0-9]+\Z")
_BAD_PERCENT_RE = re.compile(r"%(?![0-9a-fA-F]{2})")
_MAX_REVISION = 2147483647

_UTILITIES = "townlight_utilities"
_LIBRARY = "townlight_library"
_ELECTIONS = "townlight_elections"


def _parse_query(query: str) -> dict[str, str] | None:
    if query == "":
        return {}
    if query.startswith("?") or "#" in query or _BAD_PERCENT_RE.search(query):
        return None
    try:
        pairs = parse_qsl(
            query,
            keep_blank_values=True,
            strict_parsing=True,
            encoding="utf-8",
            errors="strict",
        )
    except (UnicodeError, ValueError):
        return None

    values: dict[str, str] = {}
    for key, value in pairs:
        if key in values:
            return None
        values[key] = value
    return values


def _revision_query(query: str) -> bool:
    values = _parse_query(query)
    if values is None:
        return False
    if not values:
        return True
    if set(values) != {"revision"}:
        return False
    value = values["revision"]
    if _REVISION_RE.fullmatch(value) is None:
        return False
    try:
        revision = int(value)
    except ValueError:
        return False
    return 1 <= revision <= _MAX_REVISION


def _query_ok(kind: str | None, query: str) -> bool:
    if kind is None:
        return query == ""
    if kind == "revision":
        return _revision_query(query)
    return False


_ROUTES: tuple[tuple[str, re.Pattern[str], str, str | None], ...] = (
    (
        "GET",
        re.compile(r"\A/desktop/v1/utilities/policies\Z"),
        _UTILITIES,
        None,
    ),
    (
        "POST",
        re.compile(r"\A/desktop/v1/utilities/policies\Z"),
        _UTILITIES,
        None,
    ),
    (
        "GET",
        re.compile(rf"\A/desktop/v1/utilities/requests/{_UUID}\Z"),
        _UTILITIES,
        None,
    ),
    (
        "POST",
        re.compile(
            rf"\A/desktop/v1/utilities/requests/{_UUID}/(?:draft|approve|retry)\Z"
        ),
        _UTILITIES,
        None,
    ),
    (
        "GET",
        re.compile(r"\A/desktop/v1/library/items\Z"),
        _LIBRARY,
        None,
    ),
    (
        "POST",
        re.compile(r"\A/desktop/v1/library/items\Z"),
        _LIBRARY,
        None,
    ),
    (
        "GET",
        re.compile(rf"\A/desktop/v1/library/items/{_UUID}\Z"),
        _LIBRARY,
        "revision",
    ),
    (
        "GET",
        re.compile(rf"\A/desktop/v1/library/items/{_UUID}/source\Z"),
        _LIBRARY,
        "revision",
    ),
    (
        "POST",
        re.compile(
            rf"\A/desktop/v1/library/items/{_UUID}/(?:revisions|approval|receipts)\Z"
        ),
        _LIBRARY,
        None,
    ),
    (
        "GET",
        re.compile(r"\A/desktop/v1/elections/items\Z"),
        _ELECTIONS,
        None,
    ),
    (
        "POST",
        re.compile(r"\A/desktop/v1/elections/items\Z"),
        _ELECTIONS,
        None,
    ),
    (
        "GET",
        re.compile(rf"\A/desktop/v1/elections/items/{_UUID}\Z"),
        _ELECTIONS,
        "revision",
    ),
    (
        "GET",
        re.compile(rf"\A/desktop/v1/elections/items/{_UUID}/source\Z"),
        _ELECTIONS,
        "revision",
    ),
    (
        "POST",
        re.compile(
            rf"\A/desktop/v1/elections/items/{_UUID}/(?:revisions|approval|receipts)\Z"
        ),
        _ELECTIONS,
        None,
    ),
    (
        "GET",
        re.compile(r"\A/desktop/v1/elections/settings\Z"),
        _ELECTIONS,
        None,
    ),
    (
        "POST",
        re.compile(r"\A/desktop/v1/elections/settings\Z"),
        _ELECTIONS,
        None,
    ),
)


def department_route(method: str, path: str, query: str) -> str | None:
    """Return the required technical module id for an exact approved route."""
    if not isinstance(method, str) or not isinstance(path, str) or not isinstance(query, str):
        return None
    for route_method, pattern, module, query_kind in _ROUTES:
        if method != route_method or pattern.fullmatch(path) is None:
            continue
        if not _query_ok(query_kind, query):
            return None
        return module
    return None
