"""Real FastAPI coverage for parks catalog and household staff flows."""

from parks_http_support import parks_app, RESOURCE, HOUSEHOLD, PROGRAM


def _url(client, name, **params):
    return str(client.app.url_path_for(name, **params))


def test_catalog_resource_staff_flow(parks_app):
    client, _repository = parks_app

    unauth = client.get(
        _url(client, "list_catalog", kind="resource"),
        headers={"X-Townlight-Session": "invalid"},
    )
    assert unauth.status_code == 401, unauth.text

    created_response = client.post(
        _url(client, "create_catalog_item", kind="resource"),
        json={"payload": RESOURCE},
    )
    assert created_response.status_code == 200, created_response.text
    created = created_response.json()
    assert set(created) == {"id", "revision", "snapshot", "created_at", "updated_at"}, created
    resource_id = created["id"]
    assert created["snapshot"]["name"] == RESOURCE["name"]

    fetched_response = client.get(
        _url(client, "get_catalog_item", kind="resource", item_id=resource_id)
    )
    assert fetched_response.status_code == 200, fetched_response.text
    fetched = fetched_response.json()
    assert fetched["id"] == resource_id
    assert fetched["snapshot"]["name"] == RESOURCE["name"]
    assert fetched["snapshot"]["public"] is True

    listed_response = client.get(
        _url(client, "list_catalog", kind="resource"), params={"public_only": True}
    )
    assert listed_response.status_code == 200, listed_response.text
    listed = listed_response.json()
    assert isinstance(listed, list), listed
    assert any(
        row["id"] == resource_id
        and row["snapshot"]["name"] == RESOURCE["name"]
        and row["snapshot"]["public"] is True
        for row in listed
    ), listed

    invalid_response = client.post(
        _url(client, "create_catalog_item", kind="resource"),
        json={"payload": "not-an-object"},
    )
    assert invalid_response.status_code == 422, invalid_response.text

    stale_response = client.put(
        _url(client, "update_catalog_item", kind="resource", item_id=resource_id),
        json={
            "expected_revision": created["revision"] + 100,
            "payload": {**RESOURCE, "name": "Stale Cedar Pavilion"},
        },
    )
    assert stale_response.status_code == 409, stale_response.text


def test_household_participant_staff_flow(parks_app):
    client, _repository = parks_app

    household_response = client.post(
        _url(client, "create_household"), json={"payload": HOUSEHOLD}
    )
    assert household_response.status_code == 200, household_response.text
    household = household_response.json()
    assert isinstance(household, dict), household
    household_id = household["id"]

    participant_payload = {
        "name": "Test Participant",
        "birth_date": "2000-01-01",
        "accommodations": "",
    }
    participant_response = client.post(
        _url(client, "create_participant"),
        json={"household_id": household_id, "payload": participant_payload},
    )
    assert participant_response.status_code == 200, participant_response.text
    participant = participant_response.json()
    assert isinstance(participant, dict), participant
    assert participant["snapshot"]["name"] == participant_payload["name"]
    assert participant["snapshot"]["birth_date"] == "2000-01-01"
    assert participant["snapshot"]["accommodations"] == ""

    participants_response = client.get(
        _url(client, "list_participants", household_id=household_id)
    )
    assert participants_response.status_code == 200, participants_response.text
    participants = participants_response.json()
    assert isinstance(participants, list), participants
    assert any(
        row["id"] == participant["id"]
        and row["snapshot"]["name"] == participant_payload["name"]
        and row["snapshot"]["birth_date"] == "2000-01-01"
        and row["snapshot"]["accommodations"] == ""
        for row in participants
    ), participants

    search_response = client.get(
        _url(client, "search_households"), params={"search": HOUSEHOLD["email"]}
    )
    assert search_response.status_code == 200, search_response.text
    search_results = search_response.json()
    assert isinstance(search_results, list), search_results
    assert any(
        row["id"] == household_id
        and row["snapshot"]["email"] == HOUSEHOLD["email"]
        for row in search_results
    ), search_results
