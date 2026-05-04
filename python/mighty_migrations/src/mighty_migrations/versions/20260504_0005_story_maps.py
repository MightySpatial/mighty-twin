"""StoryMaps table — Phase E.

Revision ID: 20260504_0005
Revises: 20260504_0004
Create Date: 2026-05-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260504_0005"
down_revision = "20260504_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_maps",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column(
            "is_published", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column("slides", sa.JSON, nullable=False, server_default=sa.text("'[]'")),
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
    op.create_index("idx_story_maps_site_id", "story_maps", ["site_id"])


def downgrade() -> None:
    op.drop_index("idx_story_maps_site_id", table_name="story_maps")
    op.drop_table("story_maps")
