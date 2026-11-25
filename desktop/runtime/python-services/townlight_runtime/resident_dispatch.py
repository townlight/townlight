# SPDX-License-Identifier: AGPL-3.0-only
"""Repository adapter routing resident commands between 311 and comms."""
from __future__ import annotations

import townlight_311.store as store311
import townlight_comms.store as store_comms
import townlight_parks.store as store_parks

_COMMS_OPERATIONS = ("comms_subscribe", "comms_confirm", "comms_preferences")
_PARKS_OPERATIONS = (
    "parks_create_household",
    "parks_read_household",
    "parks_add_participant",
    "parks_update_participant",
    "parks_create_booking",
    "parks_cancel_booking",
    "parks_reschedule_booking",
    "parks_register",
    "parks_cancel_registration",
    "parks_availability",
    "parks_prepare_checkout",
    "parks_read_checkout",
)


class ResidentRepositoryDispatch:
    def __init__(self, service_requests, communications, key, public_origin, parks=None):
        self._service_requests = service_requests
        self._communications = communications
        self._key = key
        self._public_origin = public_origin
        self._parks = parks

    def categories(self):
        return self._service_requests.categories()

    def execute_resident_command(self, command_id, operation, payload):
        if operation in _PARKS_OPERATIONS:
            if self._parks is None:
                raise store311.Conflict("Parks unavailable") from None
            try:
                return self._parks.execute_resident_command(
                    command_id,
                    operation.removeprefix("parks_"),
                    payload,
                    key=self._key,
                    public_origin=self._public_origin,
                )
            except store_parks.InvalidInput:
                raise store311.InvalidInput("Invalid resident command") from None
            except store_parks.Unauthorized:
                raise store311.Unauthorized("Resident command not authorized") from None
            except store_parks.NotFound:
                raise store311.NotFound("Resident command not found") from None
            except store_parks.Conflict:
                raise store311.Conflict("Resident command conflict") from None
        if operation not in _COMMS_OPERATIONS:
            return self._service_requests.execute_resident_command(
                command_id, operation, payload
            )
        try:
            return self._communications.execute_subscription_command(
                command_id,
                operation,
                payload,
                key=self._key,
                public_origin=self._public_origin,
            )
        except store_comms.InvalidInput:
            raise store311.InvalidInput("Invalid resident command") from None
        except store_comms.Unauthorized:
            raise store311.Unauthorized("Resident command not authorized") from None
        except store_comms.NotFound:
            raise store311.NotFound("Resident command not found") from None
        except store_comms.Conflict:
            raise store311.Conflict("Resident command conflict") from None


__all__ = ["ResidentRepositoryDispatch"]
