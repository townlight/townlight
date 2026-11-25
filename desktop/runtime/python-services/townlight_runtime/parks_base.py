"""Shared FastAPI dependencies for the desktop parks API."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from townlight_parks.store import (
    Conflict,
    InvalidInput,
    NotFound,
    Unauthorized,
)
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

router = APIRouter(prefix="/desktop/v1/parks", tags=["parks"])

ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]
Db = Annotated[AsyncSession, Depends(get_async_session)]


def get_repository(request: Request) -> Any:
    repo = getattr(request.app.state, "desktop_parks", None)
    if repo is None:
        raise HTTPException(status_code=503, detail="parks unavailable")
    return repo


Repo = Annotated[Any, Depends(get_repository)]


async def current_actor(
    request: Request,
    session: Db,
    proof: ProofHeader = None,
) -> User:
    return await mapped_native_actor(
        request,
        session,
        proof,
        "townlight_parks",
    )


Actor = Annotated[User, Depends(current_actor)]


async def _call(func: Any, *args: Any, **kwargs: Any) -> Any:
    """Run a parks store method in the thread pool and map store errors."""
    try:
        return await run_in_threadpool(func, *args, **kwargs)
    except InvalidInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Unauthorized as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="parks storage unavailable",
        ) from exc


def _actor_id(actor: User) -> str:
    return str(actor.id)
