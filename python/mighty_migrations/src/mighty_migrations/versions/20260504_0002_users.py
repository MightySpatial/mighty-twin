"""Users table for local password auth + role-based access.

Adds:
  * `users` — id, email, name, hashed_password (nullable for OAuth),
    role (admin/creator/viewer), avatar_url, is_active, timestamps.

Seeds a dev admin user `admin@mightyspatial.com / admin123`. This is a
**dev-only seed** — production deployments should change the password
immediately via the Setup Wizard / user management UI, or delete the
seed and bootstrap their own admin via env-driven seeding instead.

Role is stored as plain VARCHAR so the column is dialect-neutral (no
Postgres ENUM); validation happens at the API layer via Pydantic.

Revision ID: 20260504_0002
Revises: 20260416_0001
Create Date: 2026-05-04
"""

from __future__ import annotations

import uuid

import bcrypt
import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

# Alembic identifiers
revision = "20260504_0002"
down_revision = "20260416_0001"
branch_labels = None
depends_on = None


# Dev-only seed credentials. Override via DEV_ADMIN_PASSWORD for an
# environment that ships this migration but doesn't want the public
# default. Empty / None = skip the seed entirely.
import os
DEV_ADMIN_EMAIL = os.environ.get("DEV_ADMIN_EMAIL", "admin@mightyspatial.com")
DEV_ADMIN_PASSWORD = os.environ.get("DEV_ADMIN_PASSWORD", "admin123")
DEV_ADMIN_NAME = os.environ.get("DEV_ADMIN_NAME", "Admin")


def upgrade() -> None:
    users = op.create_table(
        "users",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=True),
        sa.Column("role", sa.String(32), nullable=False, server_default="viewer"),
        sa.Column("avatar_url", sa.String(2048), nullable=True),
        sa.Column(
            "is_active", sa.Boolean, nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_users_email", "users", ["email"], unique=True)

    if DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD:
        hashed = bcrypt.hashpw(
            DEV_ADMIN_PASSWORD.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")
        op.bulk_insert(
            users,
            [
                {
                    "id": uuid.uuid4(),
                    "email": DEV_ADMIN_EMAIL.lower(),
                    "name": DEV_ADMIN_NAME,
                    "hashed_password": hashed,
                    "role": "admin",
                    "is_active": True,
                }
            ],
        )


def downgrade() -> None:
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
