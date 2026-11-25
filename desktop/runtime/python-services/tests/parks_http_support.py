"""Shared real-FastAPI fixture for desktop parks staff tests."""

from __future__ import annotations

import os

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("TOWNLIGHT_JWT_SECRET", "test-secret")

from datetime import UTC, datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from townlight_parks.migrations import upgrade
from townlight_parks.workflow import ParksRepository
from townlight_records.database import get_async_session
from townlight_runtime.parks_base import current_actor
from townlight_runtime.parks_staff import router

RESOURCE = {
    "name": "Cedar Pavilion",
    "address": "1 Cedar Lane",
    "timezone": "UTC",
    "description": "A test resource.",
    "amenities": ["restrooms", "parking"],
    "accessibility": "Step-free access",
    "hours": {
        day: [["00:00", "24:00"]]
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    },
    "public": True,
    "approval_required": False,
    "buffer_before_minutes": 0,
    "buffer_after_minutes": 0,
    "fee_cents": 100,
    "deposit_cents": 20,
    "currency": "USD",
}
HOUSEHOLD = {
    "contact_name": "Test Household",
    "email": "test@example.test",
    "phone": None,
    "address": None,
    "language": "en",
}
PROGRAM = {
    "title": "Summer Day Camp",
    "description": "A test program.",
    "timezone": "UTC",
    "public": True,
    "min_age": None,
    "max_age": None,
    "eligibility_text": "Open to all eligible participants.",
    "accessibility": "Step-free access",
}

HOURS = tuple(f"{hour:02d}:00" for hour in range(25))
_STAFF_ID = UUID("00000000-0000-0000-0000-000000000001")


def future_slot(hour: int = 12) -> datetime:
    """Return 12:00 UTC ten days from today, or another requested hour."""
    if not 0 <= hour <= 24:
        raise ValueError("hour must be between 0 and 24")
    day = (datetime.now(UTC) + timedelta(days=10)).date()
    if hour == 24:
        return datetime.combine(day + timedelta(days=1), time.min, UTC)
    return datetime.combine(day, time(hour=hour), UTC)




async def _no_database():
    yield object()


def _staff_actor(
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
) -> SimpleNamespace:
    if proof != "test-staff":
        raise HTTPException(status_code=401, detail="invalid session")
    return SimpleNamespace(id=_STAFF_ID)


@pytest.fixture()
def parks_app(tmp_path: Path):
    engine = create_engine(
        f"sqlite:///{(tmp_path / 'parks.sqlite3').as_posix()}",
        connect_args={"check_same_thread": False},
    )
    try:
        upgrade(engine)
        repository = ParksRepository(engine)
        app = FastAPI()
        app.state.desktop_parks = repository
        app.state.desktop_parks_key = Fernet.generate_key()
        app.dependency_overrides[current_actor] = _staff_actor
        app.dependency_overrides[get_async_session] = _no_database
        app.include_router(router)
        with TestClient(
            app,
            headers={"X-Townlight-Session": "test-staff"},
        ) as client:
            yield client, repository
    finally:
        engine.dispose()
