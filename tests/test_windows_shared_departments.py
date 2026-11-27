import pytest
from townlight_runtime.department_proxy import department_route
from townlight_runtime.shared_operations import ALLOCATION

UID = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize(
    "method,path,query,module",
    [
        ("GET", "/desktop/v1/utilities/policies", "", "townlight_utilities"),
        ("POST", f"/desktop/v1/utilities/requests/{UID}/draft", "", "townlight_utilities"),
        ("GET", "/desktop/v1/library/items", "", "townlight_library"),
        ("GET", f"/desktop/v1/library/items/{UID}/source", "revision=2", "townlight_library"),
        ("GET", "/desktop/v1/elections/settings", "", "townlight_elections"),
        ("POST", f"/desktop/v1/elections/items/{UID}/approval", "", "townlight_elections"),
    ],
)
def test_supported_exact_routes(method, path, query, module):
    assert department_route(method, path, query) == module


@pytest.mark.parametrize(
    "method,path,query",
    [
        ("DELETE", "/desktop/v1/utilities/policies", ""),
        ("GET", "/desktop/v1/utilities/policies/extra", ""),
        ("GET", f"/desktop/v1/library/items/{UID}/source", "revision=2&extra=1"),
        ("GET", f"/desktop/v1/library/items/{UID}/source", "revision=2&revision=3"),
        ("GET", f"/desktop/v1/library/items/{UID}/source", "revision=0"),
        ("GET", f"/desktop/v1/library/items/{UID}/source", "revision=2147483648"),
    ],
)
def test_denied_routes(method, path, query):
    assert department_route(method, path, query) is None


@pytest.mark.parametrize(
    "path,expected",
    [
        ("/desktop/v1/library/items", True),
        ("/desktop/v1/elections/items", True),
        (f"/desktop/v1/library/items/{UID}/revisions", True),
        (f"/desktop/v1/elections/items/{UID}/revisions", True),
        (f"/desktop/v1/library/items/{UID}/approval", False),
        (f"/desktop/v1/elections/items/{UID}/receipts", False),
        (f"/desktop/v1/library/items/{UID}/source", False),
    ],
)
def test_allocation_fullmatch(path, expected):
    assert bool(ALLOCATION.fullmatch(path)) is expected