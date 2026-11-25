"""Tests for the finite service-request delivery loop."""

from __future__ import annotations

import logging
import smtplib
from types import SimpleNamespace

import sqlalchemy as sa
from townlight_runtime.email_settings import EmailSettingsError
from townlight_runtime.service_request_delivery import ServiceRequestDelivery


class FakeStop:
    """Finite stop stand-in that records wait calls."""

    def __init__(self, *, stopped: bool = False, wait_result: bool = True) -> None:
        self._stopped = stopped
        self._wait_result = wait_result
        self.waits: list[float] = []

    def is_set(self) -> bool:
        return self._stopped

    def wait(self, timeout: float) -> bool:
        self.waits.append(timeout)
        return self._wait_result


class FakeStore:
    def __init__(self, transports: list[object | None]) -> None:
        self._transports = transports
        self.calls = 0

    def transport(self) -> object | None:
        index = min(self.calls, len(self._transports) - 1)
        self.calls += 1
        return self._transports[index]


class FakeWorker:
    def __init__(self, outcomes: list[dict[str, object] | None]) -> None:
        self._outcomes = outcomes
        self.processed = 0

    def process_one(self) -> dict[str, object] | None:
        index = min(self.processed, len(self._outcomes) - 1)
        self.processed += 1
        return self._outcomes[index]


def _repo() -> SimpleNamespace:
    return SimpleNamespace(engine=object(), recovery_key=b"key")


def test_disabled_service_does_not_claim() -> None:
    store = FakeStore([None])
    created: list[object] = []

    def factory(*args: object, **kwargs: object) -> FakeWorker:
        created.append((args, kwargs))
        return FakeWorker([{"state": "sent"}])

    delivery = ServiceRequestDelivery(_repo(), store, worker_factory=factory)
    assert delivery.tick(FakeStop()) == 0
    assert store.calls == 1
    assert created == []


def test_tick_processes_at_most_ten() -> None:
    worker = FakeWorker([{"state": "sent"}] * 20)
    store = FakeStore([object()])
    delivery = ServiceRequestDelivery(
        _repo(), store, worker_factory=lambda *args, **kwargs: worker
    )
    assert delivery.tick(FakeStop()) == 10
    assert worker.processed == 10


def test_settings_are_reloaded_on_each_tick() -> None:
    first, second = object(), object()
    store = FakeStore([first, second])
    transports: list[object] = []

    def factory(engine: object, transport: object, *, recovery_key: bytes) -> FakeWorker:
        assert recovery_key == b"key"
        transports.append(transport)
        return FakeWorker([None])

    delivery = ServiceRequestDelivery(_repo(), store, worker_factory=factory)
    assert delivery.tick(FakeStop()) == 0
    assert delivery.tick(FakeStop()) == 0
    assert transports == [first, second]


def test_stop_before_work_does_no_work() -> None:
    store = FakeStore([object()])
    created: list[object] = []

    def factory(*args: object, **kwargs: object) -> FakeWorker:
        created.append((args, kwargs))
        return FakeWorker([{"state": "sent"}])

    delivery = ServiceRequestDelivery(_repo(), store, worker_factory=factory)
    assert delivery.tick(FakeStop(stopped=True)) == 0
    assert store.calls == 0
    assert created == []


def _assert_safe_and_deduplicated(caplog, error: Exception) -> None:
    store = FakeStore([object()])

    def factory(*args: object, **kwargs: object) -> FakeWorker:
        raise error

    delivery = ServiceRequestDelivery(_repo(), store, worker_factory=factory)
    caplog.set_level(logging.WARNING)
    delivery.run(FakeStop())
    delivery.run(FakeStop())
    records = [r for r in caplog.records if r.name.endswith("service_request_delivery")]
    assert len(records) == 1
    text = caplog.text.lower()
    assert "secret" not in text
    assert "payload" not in text


def test_smtp_error_is_logged_safely(caplog) -> None:
    _assert_safe_and_deduplicated(
        caplog, smtplib.SMTPException("secret payload from smtp")
    )


def test_sqlalchemy_error_is_logged_safely(caplog) -> None:
    _assert_safe_and_deduplicated(
        caplog, sa.exc.SQLAlchemyError("secret payload from database")
    )


def test_settings_error_is_logged_safely(caplog) -> None:
    _assert_safe_and_deduplicated(
        caplog, EmailSettingsError("secret payload from settings")
    )
