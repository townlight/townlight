"""Local-admin Stripe payment settings endpoints for the desktop parks API."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from starlette.concurrency import run_in_threadpool

from townlight_runtime.parks_base import Actor, router
from townlight_runtime.parks_payment_settings import ParksPaymentSettingsError

_SAFE_INVALID = "payment settings are invalid"
_SAFE_UNAVAILABLE = "payment settings unavailable"


class PaymentSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: StrictBool
    secret_key: str | None = Field(default=None, max_length=512)
    clear_secret: StrictBool = False


def _require_local_admin(request: Request) -> None:
    if getattr(request.state, "native_role", None) != "local-admin":
        raise HTTPException(status_code=403, detail="local admin required")


def _payments_store(request: Request) -> Any:
    store = getattr(request.app.state, "desktop_parks_payments", None)
    if store is None:
        raise HTTPException(status_code=503, detail=_SAFE_UNAVAILABLE)
    return store


@router.get("/settings/payments")
async def get_payment_settings(
    request: Request,
    _actor: Actor,
) -> dict[str, Any]:
    _require_local_admin(request)
    store = _payments_store(request)
    try:
        return await run_in_threadpool(store.public_settings)
    except ParksPaymentSettingsError as exc:
        raise HTTPException(status_code=422, detail=_SAFE_INVALID) from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail=_SAFE_UNAVAILABLE) from exc


@router.put("/settings/payments")
async def put_payment_settings(
    request: Request,
    body: PaymentSettingsBody,
    _actor: Actor,
) -> dict[str, Any]:
    _require_local_admin(request)
    store = _payments_store(request)
    payload = body.model_dump(exclude_unset=True)
    try:
        return await run_in_threadpool(store.save, payload)
    except ParksPaymentSettingsError as exc:
        raise HTTPException(status_code=422, detail=_SAFE_INVALID) from exc
    except OSError as exc:
        raise HTTPException(status_code=503, detail=_SAFE_UNAVAILABLE) from exc
