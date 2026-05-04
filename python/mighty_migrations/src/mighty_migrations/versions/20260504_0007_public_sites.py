"""Public-pre-login site flag — Phase M.

Adds:
  * sites.is_public_pre_login BOOLEAN — when true, the site is viewable
    without authentication via /p/<slug>. Basic widgets only (Search,
    Layers, Legend, Zoom, Basemap, Compass, Story); admin-leaning
    widgets (Design, Snap, Strike, Terrain, Submissions) are filtered
    out by the frontend's publicWidgets() helper.

Defaults to false so existing sites stay private.

Revision ID: 20260504_0007
Revises: 20260504_0006
Create Date: 2026-05-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260504_0007"
down_revision = "20260504_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sites",
        sa.Column(
            "is_public_pre_login",
            sa.Boolean,
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("sites", "is_public_pre_login")
