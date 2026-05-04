"""Library folders + items — Phase P.

Revision ID: 20260504_0008
Revises: 20260504_0007
Create Date: 2026-05-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260504_0008"
down_revision = "20260504_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "library_folders",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "parent_id",
            GUID(),
            sa.ForeignKey("library_folders.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("depth", sa.Integer, nullable=False, server_default="0"),
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
    op.create_index("idx_library_folders_parent", "library_folders", ["parent_id"])
    op.create_unique_constraint(
        "uq_library_folders_parent_slug", "library_folders", ["parent_id", "slug"]
    )

    op.create_table(
        "library_items",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "folder_id",
            GUID(),
            sa.ForeignKey("library_folders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(64), nullable=False),
        sa.Column("url", sa.String(2048), nullable=True),
        sa.Column("size_bytes", sa.Integer, nullable=True),
        sa.Column(
            "item_metadata", sa.JSON, nullable=False, server_default=sa.text("'{}'")
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
    op.create_index("idx_library_items_folder", "library_items", ["folder_id"])


def downgrade() -> None:
    op.drop_index("idx_library_items_folder", table_name="library_items")
    op.drop_table("library_items")
    op.drop_index("idx_library_folders_parent", table_name="library_folders")
    op.drop_constraint("uq_library_folders_parent_slug", "library_folders", type_="unique")
    op.drop_table("library_folders")
