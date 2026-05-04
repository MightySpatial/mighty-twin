"""App settings table — key/value store for runtime-configurable knobs.

Adds:
  * `app_settings` — key, value (JSONB), is_public, updated_at.

Seeds the public defaults the login page + overview map need on first
load (login_splash_*, overview_mode, overview_camera) and a placeholder
row for the Cesium Ion token (admin-only). All seeds are idempotent —
``ON CONFLICT (key) DO NOTHING`` so re-running the migration is safe.

Revision ID: 20260504_0003
Revises: 20260504_0002
Create Date: 2026-05-04
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# Alembic identifiers
revision = "20260504_0003"
down_revision = "20260504_0002"
branch_labels = None
depends_on = None


# Default seed rows. Keep this list short and only add things the UI
# actually needs to render with no admin intervention.
SEED_ROWS = [
    # Public — exposed via /api/settings/public
    ("login_splash_title", "MightyTwin", True),
    ("login_splash_subtitle", "Spatial digital twin", True),
    ("overview_mode", "all_sites_map", True),  # 'all_sites_map' | 'preload_site'
    ("overview_camera", None, True),  # {longitude, latitude, height} or null
    ("preload_site_slug", None, True),  # site slug when overview_mode='preload_site'
    # Admin-only — exposed via /api/settings (admin) or /api/system/config
    ("cesium_ion_token", "", False),
    # NOTE: Phase Q/R/S keys (autodetect_rules, branding, widget_layout)
    # land via app code on first read with `_ensure_setting()` defaults
    # rather than this seed list — keeps the migration small and
    # idempotent across versions.
]


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", sa.JSON, nullable=True),
        sa.Column(
            "is_public", sa.Boolean, nullable=False, server_default=sa.false()
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    bind = op.get_bind()
    dialect = bind.dialect.name
    for key, value, is_public in SEED_ROWS:
        json_value = sa.cast(sa.literal(_json_dumps(value)), sa.JSON)
        if dialect == "postgresql":
            op.execute(
                sa.text(
                    "INSERT INTO app_settings (key, value, is_public) "
                    "VALUES (:key, CAST(:value AS JSONB), :is_public) "
                    "ON CONFLICT (key) DO NOTHING"
                ).bindparams(key=key, value=_json_dumps(value), is_public=is_public)
            )
        else:
            # SQLite: INSERT OR IGNORE; JSON stored as TEXT
            op.execute(
                sa.text(
                    "INSERT OR IGNORE INTO app_settings (key, value, is_public) "
                    "VALUES (:key, :value, :is_public)"
                ).bindparams(key=key, value=_json_dumps(value), is_public=is_public)
            )


def downgrade() -> None:
    op.drop_table("app_settings")


def _json_dumps(value: object) -> str:
    import json
    return json.dumps(value)
