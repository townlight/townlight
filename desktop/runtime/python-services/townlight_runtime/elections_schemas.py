"""Validated request bodies for the staff elections publication API."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

_Positive = Annotated[int, Field(strict=True, gt=0)]
_Hex64 = Annotated[str, Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ElectionCreate(_Model):
    title: str = Field(min_length=1, max_length=200)
    jurisdiction: str = Field(min_length=1, max_length=200)
    election: str = Field(min_length=1, max_length=200)
    official_source: str = Field(default="", max_length=2048)
    source_version: str = Field(default="", max_length=100)
    description: str = Field(min_length=1, max_length=5000)
    private_notes: str = Field(default="", max_length=5000)


class ElectionEdit(_Model):
    expected_revision: _Positive
    title: str | None = Field(default=None, min_length=1, max_length=200)
    jurisdiction: str | None = Field(default=None, min_length=1, max_length=200)
    election: str | None = Field(default=None, min_length=1, max_length=200)
    official_source: str | None = Field(default=None, max_length=2048)
    source_version: str | None = Field(default=None, max_length=100)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    private_notes: str | None = Field(default=None, max_length=5000)


class ElectionApproval(_Model):
    expected_revision: _Positive
    expected_sha256: _Hex64
    confirm: Literal[True]


class ElectionReceipts(_Model):
    source_revision: _Positive
    article_id: UUID
    article_revision: _Positive


__all__ = [
    "ElectionApproval",
    "ElectionCreate",
    "ElectionEdit",
    "ElectionReceipts",
]
