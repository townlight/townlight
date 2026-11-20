# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Authenticated native route to the profile-owned shared connector workspace."""

import sqlite3
from threading import Lock
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError

from townlight_runtime.connectors import ConnectorWorkspace
from townlight_runtime.meetings_bridge import actor, database_url

router = APIRouter(prefix="/desktop/v1/meetings/connectors", tags=["native-connectors"])
_workspace_lock = Lock()


class ConnectorInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal[
        "providers", "capabilities", "identify", "sources", "configure_source", "discover",
        "fetch", "search", "preview", "save_evidence", "save_meeting", "export",
        "plan_write", "commit_write", "receipt", "status", "cancel", "inspect",
    ]
    payload: dict = Field(default_factory=dict)


def canonical_save(**kwargs):
    from sqlalchemy import create_engine
    from townlight_meetings.imported_meetings import commit_meeting_import

    engine = create_engine(database_url(), pool_pre_ping=True)
    try:
        return commit_meeting_import(engine, **kwargs)
    finally:
        engine.dispose()


def workspace(request):
    with _workspace_lock:
        current = getattr(request.app.state, "desktop_connector_workspace", None)
        if current is None:
            current = ConnectorWorkspace(request.app.state.desktop_profile_root, canonical_save=canonical_save)
            request.app.state.desktop_connector_workspace = current
        return current


@router.post("/run")
def run_connector(data: ConnectorInput, request: Request, actor_id: str = Depends(actor)):
    try:
        return workspace(request).execute(
            data.operation, data.payload, actor=actor_id,
            role=getattr(request.state, "native_role", "staff"),
        )
    except (OSError, RuntimeError, ValueError, SQLAlchemyError, sqlite3.Error):
        # Writes may have completed before a database/disk/transport failure.
        # No retry here, no internal paths/credentials/framework errors echoed.
        raise HTTPException(503, "Connector outcome could not be confirmed. Reopen saved work and retry the same selection or exact plan.") from None
