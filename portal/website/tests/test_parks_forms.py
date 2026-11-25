"""Tests for parks forms without database access."""
import uuid
from datetime import datetime, timedelta, timezone

from django.test import SimpleTestCase

from website.parks_forms import (
    BookingForm,
    HouseholdForm,
    ParticipantEditForm,
    ParticipantForm,
    RegistrationForm,
)


class ParksFormsTests(SimpleTestCase):
    def test_booking_form_payload_and_validation(self):
        resource_id = uuid.uuid4()
        start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=30)
        data = {
            "resource_id": str(resource_id),
            "expected_resource_revision": "1",
            "starts_at": start.isoformat(),
            "ends_at": (start + timedelta(hours=1)).isoformat(),
            "purpose": "Community meeting",
            "repeat_weeks": "2",
        }
        form = BookingForm(data)
        self.assertTrue(form.is_valid(), form.errors)
        payload = form.payload()
        self.assertEqual(
            set(payload),
            {"resource_id", "expected_resource_revision", "occurrences", "purpose"},
        )
        self.assertEqual(payload["resource_id"], str(resource_id))
        self.assertEqual(payload["expected_resource_revision"], 1)
        self.assertEqual(payload["purpose"], data["purpose"])
        self.assertEqual(len(payload["occurrences"]), 2)
        first, second = payload["occurrences"]
        for occurrence in payload["occurrences"]:
            self.assertEqual(set(occurrence), {"starts_at", "ends_at"})
        self.assertEqual(
            datetime.fromisoformat(second["starts_at"]),
            datetime.fromisoformat(first["starts_at"]) + timedelta(days=7),
        )
        self.assertEqual(
            datetime.fromisoformat(second["ends_at"]),
            datetime.fromisoformat(first["ends_at"]) + timedelta(days=7),
        )

        invalid_cases = [
            {"starts_at": "2030-01-01T10:00:00"},
            {"ends_at": "2030-01-01T09:00:00", "starts_at": "2030-01-01T10:00:00+00:00"},
            {"repeat_weeks": "53"},
        ]
        for changes in invalid_cases:
            with self.subTest(changes=changes):
                bad = dict(data)
                bad.update(changes)
                form = BookingForm(bad)
                self.assertFalse(form.is_valid())

    def test_household_participant_edit_and_registration_forms(self):
        household = HouseholdForm({
            "contact_name": "Ada Resident",
            "email": "ada@example.com",
            "language": "en",
        })
        self.assertTrue(household.is_valid(), household.errors)
        self.assertEqual(
            household.payload(),
            {"household": {
                "contact_name": "Ada Resident",
                "email": "ada@example.com",
                "phone": "",
                "address": "",
                "language": "en",
            }},
        )

        participant = ParticipantForm({
            "name": "Sam Resident",
            "birth_date": "2000-01-02",
            "accommodations": "",
        })
        self.assertTrue(participant.is_valid(), participant.errors)
        self.assertEqual(
            participant.payload(),
            {"participant": {
                "name": "Sam Resident",
                "birth_date": "2000-01-02",
                "accommodations": "",
            }},
        )

        participant_id = uuid.uuid4()
        participant_edit = ParticipantEditForm({
            "participant_id": str(participant_id),
            "expected_revision": "3",
            "name": "Sam Resident",
            "birth_date": "2000-01-02",
            "accommodations": "",
        })
        self.assertTrue(participant_edit.is_valid(), participant_edit.errors)
        edited = participant_edit.payload()
        self.assertEqual(set(edited), {"participant", "participant_id", "expected_revision"})
        self.assertEqual(edited["participant"]["name"], "Sam Resident")
        self.assertEqual(edited["participant_id"], str(participant_id))
        self.assertEqual(edited["expected_revision"], 3)

        session_id = uuid.uuid4()
        registration_data = {
            "session_id": str(session_id),
            "expected_session_revision": "2",
            "participant_id": str(participant_id),
        }
        own_participants = [{"id": participant_id, "snapshot": {"name": "Sam Resident"}}]
        registration = RegistrationForm(registration_data, own_participants=own_participants)
        self.assertTrue(registration.is_valid(), registration.errors)
        self.assertEqual(
            registration.payload(),
            {
                "session_id": str(session_id),
                "expected_session_revision": 2,
                "participant_id": str(participant_id),
            },
        )
        foreign = RegistrationForm(
            {**registration_data, "participant_id": str(uuid.uuid4())},
            own_participants=own_participants,
        )
        self.assertFalse(foreign.is_valid())
