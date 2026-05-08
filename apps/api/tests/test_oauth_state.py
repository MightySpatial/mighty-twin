"""OAuth state-token tests — T+1450.

The state token carries the user's ``next`` URL through the identity-
provider hop and prevents CSRF (the callback verifies it). It's a
short-lived signed JWT with a provider field — wrong provider, expired
token, tampered token must all reject.
"""

from __future__ import annotations

import time
from datetime import timedelta

import jwt
import pytest

from twin_api.oauth_routes import _state_token, _verify_state, STATE_TTL


def test_state_round_trip():
    token = _state_token("/admin/sites", "google")
    next_url = _verify_state(token, "google")
    assert next_url == "/admin/sites"


def test_state_provider_mismatch_rejects():
    token = _state_token("/", "google")
    with pytest.raises(Exception, match="State"):
        _verify_state(token, "microsoft")


def test_state_expired_rejects(monkeypatch):
    """Forge a state token with iat 10 minutes ago — STATE_TTL is 5 min."""
    from twin_api.config import get_settings

    settings = get_settings()
    payload = {
        "next": "/",
        "provider": "google",
        "nonce": "test",
        "iat": int(time.time()) - 600,
        "exp": int(time.time()) - 300,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(Exception):
        _verify_state(token, "google")


def test_state_tampered_signature_rejects():
    token = _state_token("/", "google")
    # Flip a middle char of the signature segment. Avoid the last char:
    # base64url's last position carries only 4 meaningful bits for a
    # 32-byte HMAC, so swaps within the same nibble decode identically
    # and look genuine to the verifier — flake-prone.
    head, payload, sig = token.rsplit(".", 2)
    mid = len(sig) // 2
    flipped = "A" if sig[mid] != "A" else "B"
    bad_sig = sig[:mid] + flipped + sig[mid + 1 :]
    bad_token = f"{head}.{payload}.{bad_sig}"
    with pytest.raises(Exception):
        _verify_state(bad_token, "google")


def test_state_ttl_is_short():
    """Sanity: the TTL hasn't accidentally been bumped to a long value
    — short-lived tokens are the whole point of state."""
    assert STATE_TTL <= timedelta(minutes=15)
