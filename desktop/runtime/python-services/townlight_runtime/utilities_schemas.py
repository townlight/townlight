"""Pydantic schemas for Townlight utility policy workflows."""

from __future__ import annotations

from typing import Annotated, ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator

StrictPositiveInt = Annotated[int, Field(strict=True, gt=0)]


class _ForbidBlank(BaseModel):
    model_config = ConfigDict(extra="forbid")

    _nonblank_fields: ClassVar[frozenset[str]] = frozenset()

    @field_validator("*", mode="after")
    @classmethod
    def _reject_blank(cls, value: object, info: ValidationInfo) -> object:
        if (
            isinstance(value, str)
            and info.field_name in cls._nonblank_fields
            and not value.strip()
        ):
            raise ValueError("must not be blank")
        return value


class PolicyRegistration(_ForbidBlank):
    _nonblank_fields: ClassVar[frozenset[str]] = frozenset(
        {"policy_id", "title", "text", "citation"}
    )

    policy_id: str = Field(max_length=200)
    title: str = Field(max_length=512)
    text: str = Field(max_length=100_000)
    citation: str = Field(max_length=2_000)
    version: StrictPositiveInt
    approved: Literal[True]


class PolicyDraft(_ForbidBlank):
    _nonblank_fields: ClassVar[frozenset[str]] = frozenset({"policy_id", "body"})

    policy_id: str = Field(max_length=200)
    policy_version: StrictPositiveInt
    body: str = Field(max_length=7_000)
    private_notes: str = Field(max_length=20_000)
    expected_revision: StrictPositiveInt | None


class PolicyApproval(_ForbidBlank):
    expected_revision: StrictPositiveInt
    confirm: Literal[True]


class PolicyRetry(_ForbidBlank):
    expected_revision: StrictPositiveInt
