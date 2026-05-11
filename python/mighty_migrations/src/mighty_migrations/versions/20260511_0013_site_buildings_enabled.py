"""Site buildings_enabled flag — Cesium OSM 3D buildings toggle.

Adds:
  * sites.buildings_enabled BOOLEAN — when true (the default), the viewer
    mounts Cesium's ``createOsmBuildingsAsync()`` tileset (Cesium ion
    asset 96188) on the globe for this site. Admins can flip it off from
    the site editor per-site.

Defaults to true so existing sites pick up the new globe layer without
extra admin work.

Revision ID: 20260511_0013
Revises: 20260510_0012
Create Date: 2026-05-11
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260511_0013"
down_revision = "20260510_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sites",
        sa.Column(
            "buildings_enabled",
            sa.Boolean,
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("sites", "buildings_enabled")
