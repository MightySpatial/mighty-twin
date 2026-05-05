"""Test harness — T+1450.

Lightweight pytest config that lets us run unit tests against the
twin_api package without requiring a live database. Spatial / DB
integration tests live alongside marked ``@pytest.mark.integration``
so CI can run the fast suite by default and the slow suite on demand.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
for sub in (
    "apps/api/src",
    "python/mighty_models/src",
    "python/mighty_db/src",
    "python/mighty_spatial/src",
    "python/mighty_core/src",
    "python/mighty_api/src",
    "python/mighty_migrations/src",
    "python/mighty_licensing/src",
):
    sys.path.insert(0, str(ROOT / sub))

# Set a deterministic JWT secret so signed-token tests round-trip.
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-prod")
os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture(scope="session")
def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]
