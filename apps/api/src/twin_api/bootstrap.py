"""Startup bootstrap — run Alembic migrations and seed an admin user.

The Railway deploy runs the API container straight into uvicorn with no
pre-start hook, so migrations and seeding have to happen in-process. We
do both at lifespan-startup:

  1. ``alembic upgrade head`` — schema is at the latest revision.
  2. Ensure the bootstrap admin user exists by email — the seed
     migration may have inserted an admin under an env-overridden
     password, so we look up by ``BOOTSTRAP_ADMIN_EMAIL`` and only
     create it (with the documented ``admin123`` password) when it's
     missing. Existing rows are left alone.
"""

from __future__ import annotations

import logging

from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from mighty_migrations import script_location
from mighty_models import User

from .auth import hash_password

logger = logging.getLogger(__name__)

BOOTSTRAP_ADMIN_EMAIL = "admin@mightyspatial.com"
BOOTSTRAP_ADMIN_PASSWORD = "admin123"


def run_migrations(database_url: str) -> None:
    """Apply Alembic migrations up to head against ``database_url``."""
    cfg = Config()
    cfg.set_main_option("script_location", script_location())
    cfg.set_main_option("sqlalchemy.url", database_url)
    logger.info("Running alembic upgrade head…")
    command.upgrade(cfg, "head")
    logger.info("Alembic migrations complete.")


def ensure_admin_user(session_factory: sessionmaker[Session]) -> None:
    """Create the bootstrap admin if it doesn't already exist.

    Idempotent — leaves an existing row alone (password, role, and
    active flag are not overwritten). Belt-and-braces alongside the
    alembic seed: if that seed was opted out via env vars, login still
    works on the documented default credentials.
    """
    with session_factory() as db:
        existing = db.execute(
            select(User).where(User.email == BOOTSTRAP_ADMIN_EMAIL)
        ).scalar_one_or_none()
        if existing is not None:
            return
        db.add(
            User(
                email=BOOTSTRAP_ADMIN_EMAIL,
                name="Admin",
                hashed_password=hash_password(BOOTSTRAP_ADMIN_PASSWORD),
                role="admin",
                is_active=True,
            )
        )
        db.commit()
        logger.warning(
            "Seeded bootstrap admin %s — change the password.",
            BOOTSTRAP_ADMIN_EMAIL,
        )
