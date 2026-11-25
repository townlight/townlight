import json

import pytest
from cryptography.fernet import Fernet

from townlight_parks.stripe_transport import PaymentProviderError, StripeTransport
from townlight_runtime.parks_payment_settings import (
    ParksPaymentSettingsError,
    ParksPaymentSettingsStore,
)
from townlight_runtime.parks_payments import ParksPayments

SECRET = "sk_test_abcdefghijklmnop123456789"
SAFE_ERROR = "Parks payment settings are unavailable."


def test_settings_encrypt_never_echo_and_preserve_or_clear_secret(tmp_path):
    key = Fernet.generate_key()
    store = ParksPaymentSettingsStore(tmp_path / "profile", lambda: key)

    assert store.public_settings() == {
        "configured": False,
        "enabled": False,
        "provider": "stripe",
        "mode": None,
        "secret_configured": False,
        "currency": "USD",
    }
    assert store.transport() is None

    with pytest.raises(ParksPaymentSettingsError) as exc:
        store.save({"enabled": True})
    assert str(exc.value) == SAFE_ERROR

    public = store.save({"enabled": True, "secret_key": SECRET})
    assert public["enabled"] is True
    assert public["mode"] == "test"
    assert public["secret_configured"] is True
    assert SECRET not in json.dumps(public)

    raw = (tmp_path / "profile" / "config" / "secrets" / "parks-payments.json").read_bytes()
    assert SECRET.encode() not in raw

    transport = store.transport()
    assert isinstance(transport, StripeTransport)

    disabled = store.save({"enabled": False})
    assert disabled["enabled"] is False
    assert disabled["secret_configured"] is True
    assert disabled["mode"] == "test"
    assert store.transport() is None

    cleared = store.save({"enabled": False, "clear_secret": True})
    assert cleared["secret_configured"] is False
    assert cleared["mode"] is None
    assert store.transport() is None


class FakeRepo:
    def __init__(self, fail_checkout=False):
        self.pending = {"checkout": ["checkout-1"], "refund": ["refund-1"]}
        self.fail_checkout = fail_checkout
        self.pending_calls = 0
        self.submitted = []

    def _pending(self, kind, limit):
        self.pending_calls += 1
        assert limit == 10
        return [{"id": intent_id} for intent_id in self.pending[kind]]

    def checkout_pending(self, limit):
        return self._pending("checkout", limit)

    def refund_pending(self, limit):
        return self._pending("refund", limit)

    def _submit(self, kind, intent_id, actor, transport):
        self.submitted.append((kind, intent_id, actor, transport))
        if kind == "checkout" and self.fail_checkout:
            raise PaymentProviderError("provider down")
        self.pending[kind].remove(intent_id)

    def checkout_submit(self, intent_id, actor, transport):
        self._submit("checkout", intent_id, actor, transport)

    def refund_submit(self, intent_id, actor, transport):
        self._submit("refund", intent_id, actor, transport)


class FixedStore:
    def __init__(self, transport):
        self._transport = transport

    def transport(self):
        return self._transport


def test_worker_uses_exact_submit_arguments_disabled_store_and_retry_backoff():
    transport = object()
    repo = FakeRepo(fail_checkout=True)
    worker = ParksPayments(repo, FixedStore(transport))

    assert worker.tick() == 1
    assert repo.submitted == [
        ("checkout", "checkout-1", "system:parks-payments", transport),
        ("refund", "refund-1", "system:parks-payments", transport),
    ]

    assert worker.tick() == 0
    checkout_attempts = [entry for entry in repo.submitted if entry[0] == "checkout"]
    assert checkout_attempts == [
        ("checkout", "checkout-1", "system:parks-payments", transport)
    ]

    idle_repo = FakeRepo()
    idle_worker = ParksPayments(idle_repo, FixedStore(None))
    assert idle_worker.tick() == 0
    assert idle_repo.pending_calls == 0
    assert idle_repo.submitted == []
