"""Snapshots + sketch_layers tables — Phase H.

Revision ID: 20260504_0006
Revises: 20260504_0005
Create Date: 2026-05-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260504_0006"
down_revision = "20260504_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_snapshots",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "user_id",
            GUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("payload", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "shared_to_gallery",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
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
    op.create_index("idx_snapshots_user_id", "user_snapshots", ["user_id"])
    op.create_index(
        "idx_snapshots_user_site", "user_snapshots", ["user_id", "site_id"]
    )

    op.create_table(
        "sketch_layers",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "user_id",
            GUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("color", sa.String(32), nullable=True),
        sa.Column("visible", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("locked", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("features", sa.JSON, nullable=False, server_default=sa.text("'[]'")),
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
    op.create_index("idx_sketch_layers_user_id", "sketch_layers", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_sketch_layers_user_id", table_name="sketch_layers")
    op.drop_table("sketch_layers")
    op.drop_index("idx_snapshots_user_site", table_name="user_snapshots")
    op.drop_index("idx_snapshots_user_id", table_name="user_snapshots")
    op.drop_table("user_snapshots")
