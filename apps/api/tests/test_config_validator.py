"""Settings validator tests — T+1700.

The prod-mode validator refuses to boot with weak secrets. Cheap to
get wrong, expensive to discover by getting paged at 3am.
"""

from __future__ import annotations

import importlib
import os

import pytest


def _fresh_settings():
    """Get_settings is lru_cached — reload the module so the validator
    actually re-runs against the current env."""
    from twin_api import config

    importlib.reload(config)
    return config.Settings


def test_dev_accepts_default_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    Settings = _fresh_settings()
    s = Settings()
    assert s.jwt_secret == "change-me-in-prod"


def test_prod_rejects_default_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "change-me-in-prod")
    Settings = _fresh_settings()
    with pytest.raises(Exception):
        Settings()


def test_prod_rejects_short_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "short")
    Settings = _fresh_settings()
    with pytest.raises(Exception, match="at least 32"):
        Settings()


def test_prod_accepts_long_secret(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    Settings = _fresh_settings()
    s = Settings()
    assert len(s.jwt_secret) >= 32


def teardown_module(_module):
    """Restore the test env so subsequent suites don't see prod settings."""
    os.environ["ENVIRONMENT"] = "test"
    os.environ["JWT_SECRET"] = "test-secret-do-not-use-in-prod"
    from twin_api import config

    importlib.reload(config)
