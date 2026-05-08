"""Submissions table — Phase T (T+120).

Captures user-submitted Design-widget sketches awaiting moderation.
Features and schema_changes are JSON snapshots so the submission survives
deletion of the source SketchLayer.

Revision ID: 20260505_0009
Revises: 20260504_0008
Create Date: 2026-05-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260505_0009"
down_revision = "20260504_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "submissions",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "submitter_id",
            GUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "sketch_layer_id",
            GUID(),
            sa.ForeignKey("sketch_layers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("features", sa.JSON, nullable=False, server_default=sa.text("'[]'")),
        sa.Column(
            "schema_changes", sa.JSON, nullable=False, server_default=sa.text("'[]'")
        ),
        sa.Column("notes", sa.String, nullable=True),
        sa.Column("review_notes", sa.String, nullable=True),
        sa.Column(
            "reviewed_by_id",
            GUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "promoted_layer_id",
            GUID(),
            sa.ForeignKey("layers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("promoted_feature_count", sa.Integer, nullable=True),
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
    op.create_index("idx_submissions_site", "submissions", ["site_id"])
    op.create_index("idx_submissions_submitter", "submissions", ["submitter_id"])
    op.create_index("idx_submissions_status", "submissions", ["status"])


def downgrade() -> None:
    op.drop_index("idx_submissions_status", table_name="submissions")
    op.drop_index("idx_submissions_submitter", table_name="submissions")
    op.drop_index("idx_submissions_site", table_name="submissions")
    op.drop_table("submissions")
