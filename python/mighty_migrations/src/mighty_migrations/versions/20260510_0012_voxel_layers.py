"""Voxel layers — metadata table for Design widget v2 voxel storage.

Backs the ``/api/sites/{slug}/voxel-layers`` CRUD. Row holds the bits the
listing UI needs (name, scope, datum, block_count); the full .esv JSON
lives in object/file storage keyed by ``id``.

Revision ID: 20260510_0012
Revises: 20260510_0011
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260510_0012"
down_revision = "20260510_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voxel_layers",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("site_slug", sa.String(128), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("scope", sa.String(16), nullable=False),
        sa.Column("owner_email", sa.String(320), nullable=True, index=True),
        sa.Column("datum_lon", sa.Float, nullable=True),
        sa.Column("datum_lat", sa.Float, nullable=True),
        sa.Column("datum_alt", sa.Float, nullable=True),
        sa.Column("block_count", sa.Integer, nullable=False, server_default="0"),
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
        sa.CheckConstraint(
            "scope IN ('site', 'sketch')", name="voxel_layers_scope_check"
        ),
    )
    op.create_index(
        "idx_voxel_layers_site_scope", "voxel_layers", ["site_slug", "scope"]
    )


def downgrade() -> None:
    op.drop_index("idx_voxel_layers_site_scope", table_name="voxel_layers")
    op.drop_table("voxel_layers")
