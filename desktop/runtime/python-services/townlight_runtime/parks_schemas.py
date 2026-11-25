"""Pydantic request models for the desktop parks API."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


class _ParksModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CatalogSave(_ParksModel):
    payload: dict[str, Any]


class CatalogEdit(_ParksModel):
    expected_revision: int = Field(strict=True, gt=0)
    payload: dict[str, Any]


class Closure(_ParksModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    reason: str = Field(min_length=1, max_length=5_000)
    expected_revision: int = Field(strict=True, gt=0)


class ReasonRevision(_ParksModel):
    expected_revision: int = Field(strict=True, gt=0)
    reason: str = Field(min_length=1, max_length=5_000)


class HouseholdSave(_ParksModel):
    payload: dict[str, Any]


class ParticipantSave(_ParksModel):
    household_id: UUID
    payload: dict[str, Any]


class ParticipantEdit(_ParksModel):
    expected_revision: int = Field(strict=True, gt=0)
    payload: dict[str, Any]


class Window(_ParksModel):
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class Booking(_ParksModel):
    resource_id: UUID
    household_id: UUID
    expected_resource_revision: int = Field(strict=True, gt=0)
    occurrences: list[Window] = Field(min_length=1, max_length=52)
    purpose: str = Field(min_length=1, max_length=2_000)


class BookingTransition(ReasonRevision):
    state: Literal["confirmed", "rejected", "cancelled"]


class Reschedule(ReasonRevision):
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class SessionCreate(_ParksModel):
    program_id: UUID
    starts_at: AwareDatetime
    ends_at: AwareDatetime
    capacity: int = Field(strict=True, ge=1, le=100_000)
    fee_cents: int = Field(strict=True, ge=0)
    currency: str = Field(min_length=3, max_length=3)


class SessionEdit(_ParksModel):
    expected_revision: int = Field(strict=True, gt=0)
    capacity: int | None = Field(default=None, strict=True, ge=1, le=100_000)
    state: Literal["open", "closed", "cancelled"] | None = None
    starts_at: AwareDatetime | None = None
    ends_at: AwareDatetime | None = None


class Registration(_ParksModel):
    session_id: UUID
    participant_id: UUID
    expected_session_revision: int = Field(strict=True, gt=0)


class Payment(_ParksModel):
    amount_cents: int = Field(strict=True, gt=0)
    reference: str = Field(min_length=1, max_length=255)
    idempotency_key: str = Field(min_length=1, max_length=255)


class Refund(_ParksModel):
    payment_ledger_id: UUID
    amount_cents: int = Field(strict=True, gt=0)
    reason: str = Field(min_length=1, max_length=255)
    command_key: str = Field(min_length=1, max_length=255)


class Attachment(_ParksModel):
    name: str = Field(min_length=1, max_length=255)
    media_type: str = Field(min_length=1, max_length=255)
    content_base64: str = Field(min_length=1, max_length=13_981_016)
