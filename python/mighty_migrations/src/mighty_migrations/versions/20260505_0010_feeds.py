"""External data feeds table — T+960.

Adds the Feed model + feed_id/materialisation columns on Layer so a
layer can be backed by a recurring external source (URL feed, OGC API,
ArcGIS REST, Sheets workbook, etc.).

Revision ID: 20260505_0010
Revises: 20260505_0009
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260505_0010"
down_revision = "20260505_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feeds",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("url", sa.String(2048), nullable=True),
        sa.Column("auth", sa.JSON, nullable=True),
        sa.Column("refresh", sa.String(32), nullable=False, server_default="on_demand"),
        sa.Column("schedule_cron", sa.String(64), nullable=True),
        sa.Column("source_srid", sa.Integer, nullable=False, server_default="4326"),
        sa.Column(
            "geometry_hint",
            sa.JSON,
            nullable=False,
            server_default=sa.text("'{\"kind\":\"native\"}'"),
        ),
        sa.Column("config", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_revision", sa.String(255), nullable=True),
        sa.Column("last_error", sa.String, nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
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
    op.create_index("idx_feeds_kind", "feeds", ["kind"])

    # Layer additions: feed_id + materialisation
    op.add_column(
        "layers",
        sa.Column(
            "feed_id",
            GUID(),
            sa.ForeignKey("feeds.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "layers",
        sa.Column(
            "materialisation",
            sa.String(32),
            nullable=False,
            server_default="materialised",
        ),
    )
    op.create_index("idx_layers_feed", "layers", ["feed_id"])


def downgrade() -> None:
    op.drop_index("idx_layers_feed", table_name="layers")
    op.drop_column("layers", "materialisation")
    op.drop_column("layers", "feed_id")
    op.drop_index("idx_feeds_kind", table_name="feeds")
    op.drop_table("feeds")
