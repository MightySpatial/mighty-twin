"""Settings + system config endpoints.

Two routers, one storage:
  * /api/settings        — app-level branding, overview, etc. PUT bulk
                           with admin role.
  * /api/settings/public — unauthenticated subset (rows where
                           is_public=true). Login page hits this.
  * /api/system/config   — admin namespace, currently the Cesium Ion
                           token. Same ``app_settings`` table; segmented
                           by an explicit allow-list of keys so we don't
                           leak future "system" rows by accident.

Storage: a single ``app_settings(key, value JSONB, is_public, updated_at)``
table. Values can be any JSON-serialisable shape. The API layer is
responsible for shape-validating each key — there's no per-key schema
in the DB on purpose.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from mighty_models import Setting

from .auth import AdminUser
from .db import DbSession

# Keys exposed under /api/system/config. Anything stored in app_settings
# that's NOT in this set stays out of the system endpoint to avoid
# accidental disclosure. Add new keys here as system features land.
SYSTEM_CONFIG_KEYS: set[str] = {"cesium_ion_token"}


# ── Helpers ─────────────────────────────────────────────────────────────


def _all_settings(db) -> dict[str, Any]:
    rows = db.execute(select(Setting)).scalars().all()
    return {row.key: row.value for row in rows}


def _public_settings(db) -> dict[str, Any]:
    rows = (
        db.execute(select(Setting).where(Setting.is_public.is_(True))).scalars().all()
    )
    return {row.key: row.value for row in rows}


def _system_settings(db) -> dict[str, Any]:
    rows = (
        db.execute(select(Setting).where(Setting.key.in_(SYSTEM_CONFIG_KEYS)))
        .scalars()
        .all()
    )
    out: dict[str, Any] = {key: None for key in SYSTEM_CONFIG_KEYS}
    out.update({row.key: row.value for row in rows})
    return out


def _upsert_setting(db, key: str, value: Any) -> Setting:
    row = db.execute(select(Setting).where(Setting.key == key)).scalar_one_or_none()
    if row is None:
        # Auto-creating new keys is allowed but they default to non-public.
        # Public-by-default keys must come from the migration seed.
        row = Setting(key=key, value=value, is_public=False)
        db.add(row)
    else:
        row.value = value
    return row


# ── Routers ─────────────────────────────────────────────────────────────


settings_router = APIRouter(prefix="/api/settings", tags=["settings"])


@settings_router.get("/public")
def get_public_settings(db: DbSession) -> dict[str, Any]:
    """Public subset — no auth required. The login page + sites overview
    map fetch this on initial render so they have something to show
    before the user has signed in.
    """
    return _public_settings(db)


@settings_router.get("")
def get_all_settings(_: AdminUser, db: DbSession) -> dict[str, Any]:
    """Full settings object. Admin only."""
    return _all_settings(db)


class SettingsBody(BaseModel):
    """Bulk update — any provided keys overwrite their stored values.
    Keys not in the body are left untouched (no implicit clear).
    """
    # Pydantic's `extra='allow'` lets the body carry arbitrary keys.
    model_config = {"extra": "allow"}


@settings_router.put("")
def update_all_settings(
    body: SettingsBody, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=False)
    for key, value in payload.items():
        _upsert_setting(db, key, value)
    db.commit()
    return _all_settings(db)


system_router = APIRouter(prefix="/api/system", tags=["system-config"])


@system_router.get("/config")
def get_system_config(_: AdminUser, db: DbSession) -> dict[str, Any]:
    """Admin namespace — currently just the Cesium Ion token + future
    system keys. Frontend's ApiKeysPage hits this.
    """
    return _system_settings(db)


@system_router.put("/config/{key}")
def put_system_config_key(
    key: str, body: dict[str, Any], _: AdminUser, db: DbSession
) -> dict[str, Any]:
    if key not in SYSTEM_CONFIG_KEYS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown system config key {key!r}",
        )
    _upsert_setting(db, key, body.get("value"))
    db.commit()
    return _system_settings(db)
