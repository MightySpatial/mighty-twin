"""Initial schema — sites + features with CRS storage/view pattern.

Proof-of-the-pattern migration. Creates:
  * `sites` — one row per digital twin, carrying storage_srid.
  * `features` — geometries stored in the site's native CRS.
  * `features_wgs84` — a VIEW that ST_Transforms features.geom to 4326 for
    the Cesium viewer. Always the read path; writes go through the base.

Works identically on PostGIS and SpatiaLite thanks to GeoAlchemy2 +
mighty_spatial dialect dispatch.

Revision ID: 20260416_0001
Revises: —
Create Date: 2026-04-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

from mighty_models import GUID, JSONType
from mighty_spatial import (
    create_reproject_view,
    create_spatial_index,
    drop_reproject_view,
)

# Alembic identifiers
revision = "20260416_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── sites ────────────────────────────────────────────────────────────
    op.create_table(
        "sites",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("slug", sa.String(128), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        # Storage CRS — default 4326 (no transform). Engineering sites
        # override to a local projected CRS (e.g. 28350 MGA2020 Zone 50).
        sa.Column("storage_srid", sa.Integer, nullable=False, server_default="4326"),
        sa.Column("config", JSONType, nullable=False, server_default=sa.text("'{}'")),
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

    # ── features ─────────────────────────────────────────────────────────
    # Storage geometry uses SRID 0 in the base table so a single schema can
    # host multiple storage CRSs (resolved per-layer/site). Clients never
    # see this table directly — they read from features_wgs84.
    op.create_table(
        "features",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("layer_id", GUID(), nullable=True),
        # srid=0 = "any CRS" at the schema level; actual CRS per-row is
        # enforced at the application layer (API ST_Transforms incoming
        # 4326 features to the site's storage_srid on write).
        sa.Column("geom", Geometry("GEOMETRY", srid=0), nullable=False),
        sa.Column("properties", JSONType, nullable=False, server_default=sa.text("'{}'")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    create_spatial_index("features", "geom")

    # ── features_wgs84 VIEW ──────────────────────────────────────────────
    # The viewer's single source of truth. ST_Transform runs on the fly;
    # both PostGIS and SpatiaLite support this via mighty_spatial dispatch.
    create_reproject_view(
        view_name="features_wgs84",
        source_table="features",
        geom_col="geom",
        target_srid=4326,
    )


def downgrade() -> None:
    drop_reproject_view("features_wgs84")
    op.drop_table("features")
    op.drop_table("sites")
