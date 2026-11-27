"""Validated request bodies for the staff library publication API."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

_Positive = Annotated[int, Field(strict=True, gt=0)]
_Hex64 = Annotated[str, Field(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LibraryCreate(_Model):
    title: str = Field(min_length=1, max_length=200)
    starts_at: str = Field(min_length=1)
    location: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    private_notes: str = Field(default="", max_length=5000)


class LibraryEdit(_Model):
    expected_revision: _Positive
    title: str | None = Field(default=None, min_length=1, max_length=200)
    starts_at: str | None = Field(default=None, min_length=1)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=5000)
    private_notes: str | None = Field(default=None, max_length=5000)


class LibraryApproval(_Model):
    expected_revision: _Positive
    expected_sha256: _Hex64
    confirm: Literal[True]


class LibraryReceipts(_Model):
    source_revision: _Positive
    article_id: UUID
    article_revision: _Positive


__all__ = [
    "LibraryApproval",
    "LibraryCreate",
    "LibraryEdit",
    "LibraryReceipts",
]
