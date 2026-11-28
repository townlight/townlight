"""Pydantic schemas for the communications draft/review/approval workflow."""

from __future__ import annotations

from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

SourceKind = Literal["meetings", "code", "notice", "311", "parks", "library", "elections"]
DraftKind = Literal[
    "meeting_summary",
    "ordinance_explainer",
    "announcement",
    "faq",
    "newsletter",
]
Channel = Literal["website", "email"]
ScheduleAction = Literal["publish", "correct", "withdraw"]


class SourceSelector(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: SourceKind
    id: str = Field(min_length=1, max_length=200)


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=512)
    body: str = Field(min_length=1, max_length=100_000)
    kind: DraftKind
    language: str = Field(default="en", min_length=1, max_length=16)
    sources: list[SourceSelector] = Field(default_factory=list, min_length=0, max_length=50)
    access_reviewed: bool = Field(default=False, strict=True)
    translation_provenance: dict | None = None


class RevisionDraft(Draft):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(strict=True, gt=0)


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(strict=True, gt=0)
    note: str = Field(min_length=1, max_length=5000)


class Approval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(strict=True, gt=0)
    expected_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    confirm: Literal[True]


class Schedule(Approval):
    model_config = ConfigDict(extra="forbid")

    due_at: AwareDatetime
    channels: list[Channel] = Field(min_length=1, max_length=2)
    action: ScheduleAction = "publish"


SourceLookup = SourceSelector
