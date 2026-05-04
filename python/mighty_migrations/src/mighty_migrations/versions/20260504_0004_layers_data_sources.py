"""Layers + DataSources tables — Phase D port of the DT spatial model.

Two tables:
  * `data_sources` — id, name, type, url, size_bytes, attributes (JSONB), ts
  * `layers` — id, site_id, data_source_id (NULL ok), name, type, opacity,
    visible, display_order, style, layer_metadata, ts

A site has many layers; a layer references a data_source. Data_sources
are reusable across sites (same SHP backing many sites' overlays).
``opacity`` is float; ``visible`` is small-int (0/1) for SQLite-friendly
booleans; ``display_order`` is int (lower renders below).

Revision ID: 20260504_0004
Revises: 20260504_0003
Create Date: 2026-05-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

# Alembic identifiers
revision = "20260504_0004"
down_revision = "20260504_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_sources",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("url", sa.String(2048), nullable=True),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column("attributes", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
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
    op.create_index("idx_data_sources_type", "data_sources", ["type"])

    op.create_table(
        "layers",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "data_source_id",
            GUID(),
            sa.ForeignKey("data_sources.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("opacity", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("visible", sa.Integer, nullable=False, server_default="1"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("style", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "layer_metadata", sa.JSON, nullable=False, server_default=sa.text("'{}'")
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
    op.create_index("idx_layers_site_id", "layers", ["site_id"])


def downgrade() -> None:
    op.drop_index("idx_layers_site_id", table_name="layers")
    op.drop_table("layers")
    op.drop_index("idx_data_sources_type", table_name="data_sources")
    op.drop_table("data_sources")
