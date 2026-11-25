"""Finance, reconciliation, checkout, and notification routes for parks."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from fastapi import Query

from townlight_runtime.parks_base import Actor, Repo, _actor_id, _call, router
from townlight_runtime.parks_schemas import Payment, Refund


@router.get("/obligations/{uuid}")
async def obligation_get(uuid: UUID, repo: Repo, _actor: Actor) -> Any:
    return await _call(repo.obligation_get, str(uuid))


@router.get("/obligations/{uuid}/receipt")
async def obligation_receipt(uuid: UUID, repo: Repo, _actor: Actor) -> Any:
    return await _call(repo.payment_receipt, str(uuid))


@router.post("/obligations/{uuid}/offline-payment")
async def offline_payment(
    uuid: UUID,
    body: Payment,
    repo: Repo,
    actor: Actor,
) -> Any:
    return await _call(
        repo.record_offline_payment,
        str(uuid),
        _actor_id(actor),
        body.amount_cents,
        body.reference,
        body.idempotency_key,
    )


@router.post("/obligations/{uuid}/offline-refund")
async def offline_refund(
    uuid: UUID,
    body: Payment,
    repo: Repo,
    actor: Actor,
) -> Any:
    return await _call(
        repo.record_offline_refund,
        str(uuid),
        _actor_id(actor),
        body.amount_cents,
        body.reference,
        body.idempotency_key,
    )


@router.get("/reconciliation")
async def reconciliation(
    repo: Repo,
    _actor: Actor,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> Any:
    return await _call(repo.reconciliation, limit, offset)


@router.post("/refunds")
async def refund_prepare(
    body: Refund,
    repo: Repo,
    actor: Actor,
) -> Any:
    # Durable preparation only. A host-tick worker performs any transport.
    return await _call(
        repo.refund_prepare,
        str(body.payment_ledger_id),
        _actor_id(actor),
        body.amount_cents,
        body.reason,
        body.command_key,
    )


@router.get("/refunds/{id}")
async def refund_get(id: UUID, repo: Repo, _actor: Actor) -> Any:
    return await _call(repo.refund_get, str(id))


@router.get("/checkouts/{id}")
async def checkout_get(id: UUID, repo: Repo, _actor: Actor) -> Any:
    return await _call(repo.checkout_get, str(id))


@router.get("/notifications/{kind}/{id}")
async def notification_summary(
    kind: Literal["booking", "registration"],
    id: UUID,
    repo: Repo,
    _actor: Actor,
) -> Any:
    return await _call(repo.notification_summary, kind, str(id))
