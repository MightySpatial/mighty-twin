"""Design widget port — submissions+, schema_change_log, design_models.

Extends the existing ``submissions`` table with the schema-change gating
columns from MightyDT v1's `sketch_submissions`, adds the DDL audit
table, and introduces the 3D model library table the design widget's
"Import Objects" panel reads from.

v2's existing schema already covers:
  * GUID-keyed ``submissions`` (created_at, updated_at, status, features,
    schema_changes, sketch_layer_id) — see migration 20260505_0009.
  * ``data_sources.attributes`` JSON blob holds source-CRS info under
    keys ``source_srid`` / ``source_epsg`` / ``epsg``; no separate
    ``data_source_crs`` / ``data_source_properties`` tables needed in v2
    (v1 used those for normalised storage; v2 collapses to the JSON).

What this migration adds (v1 spec §3 + §9):
  * ``submissions.schema_changes_approved_at``  TIMESTAMPTZ
  * ``submissions.schema_changes_approved_by``  GUID FK→users
  * ``submissions.sketch_metadata``             JSON — redline scope,
        target_data_source_id, target_layer_id, sublayer_field, tables,
        coord mode, height datum, etc. (was sketch_data.sketch in v1).
  * ``submissions.node_count``                  INTEGER — quick stats
        for the admin queue without unmarshalling features.
  * Partial index on submissions filtering by pending schema-changes.
  * ``schema_change_log`` table — per-DDL audit row written by
        approve-schema-changes (spec §9.8 gating contract).
  * ``design_models`` table — 3D model library backing
        /api/design/models (GLB/glTF/STL/IFC).

Revision ID: 20260510_0011
Revises: 20260505_0010
Create Date: 2026-05-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from mighty_models import GUID

revision = "20260510_0011"
down_revision = "20260505_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── submissions: schema-change gating + sketch metadata + stats ─────
    op.add_column(
        "submissions",
        sa.Column("schema_changes_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "submissions",
        sa.Column(
            "schema_changes_approved_by",
            GUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "submissions",
        sa.Column("sketch_metadata", sa.JSON, nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "submissions",
        sa.Column("node_count", sa.Integer, nullable=False, server_default="0"),
    )

    # Partial index — admin "needs your attention" queue. Postgres-only
    # syntax; SQLite skips the WHERE clause silently via dialect bind.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_submissions_schema_changes_pending
            ON submissions ((jsonb_array_length(schema_changes::jsonb)))
            WHERE jsonb_array_length(schema_changes::jsonb) > 0
              AND schema_changes_approved_at IS NULL
            """
        )

    # ── schema_change_log: DDL audit ────────────────────────────────────
    op.create_table(
        "schema_change_log",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "submission_id",
            GUID(),
            sa.ForeignKey("submissions.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("table_name", sa.String(255), nullable=False, index=True),
        sa.Column("column_name", sa.String(255), nullable=False),
        sa.Column("column_type", sa.String(64), nullable=False),
        sa.Column(
            "applied_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "applied_by",
            GUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sql_executed", sa.String, nullable=False),
    )

    # ── design_models: 3D model library ─────────────────────────────────
    op.create_table(
        "design_models",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column(
            "uploaded_by_id",
            GUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "site_id",
            GUID(),
            sa.ForeignKey("sites.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String, nullable=True),
        sa.Column("category", sa.String(64), nullable=False, server_default="custom"),
        sa.Column(
            "tags",
            sa.JSON,
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "format",
            sa.String(16),
            nullable=False,
            comment="'glb' | 'gltf' | 'stl' | 'ifc' (source upload format)",
        ),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("storage_size_bytes", sa.Integer, nullable=True),
        sa.Column("thumbnail_key", sa.String(512), nullable=True),
        sa.Column(
            "georeference",
            sa.JSON,
            nullable=False,
            server_default=sa.text("'{}'"),
            comment="{lon, lat, alt, heading?, pitch?, roll?} or {} for un-georeferenced",
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
    op.create_index("idx_design_models_category", "design_models", ["category"])


def downgrade() -> None:
    op.drop_index("idx_design_models_category", table_name="design_models")
    op.drop_table("design_models")
    op.drop_table("schema_change_log")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS idx_submissions_schema_changes_pending")

    op.drop_column("submissions", "node_count")
    op.drop_column("submissions", "sketch_metadata")
    op.drop_column("submissions", "schema_changes_approved_by")
    op.drop_column("submissions", "schema_changes_approved_at")
