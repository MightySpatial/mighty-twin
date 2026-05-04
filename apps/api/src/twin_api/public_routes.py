"""Public-pre-login site routes — Phase M.

Unauthenticated read-only access for sites flagged
``is_public_pre_login=true``. The frontend serves a stripped viewer
(basic widgets only) at /p/<slug>; this backend exposes the matching
read endpoints without requiring a Bearer token.

Routes:
  GET /api/public/sites/{slug}              — site metadata (404 if not public)
  GET /api/public/sites/{slug}/layers        — layer list for that site
  GET /api/public/sites/{slug}/data-sources  — read-only DS list
  GET /api/public/settings                   — login splash + branding (alias of /api/settings/public)

Sites that aren't flagged public return 404 (intentionally 404 not 401
so we don't reveal that the site exists at all).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from mighty_models import DataSource, Layer, Setting, Site

from .db import DbSession
from .spatial_routes import _serialize_ds, _serialize_layer, _serialize_site

router = APIRouter(prefix="/api/public", tags=["public"])


def _resolve_public_site(slug: str, db) -> Site:
    site = db.execute(
        select(Site).where(Site.slug == slug, Site.is_public_pre_login.is_(True))
    ).scalar_one_or_none()
    if site is None:
        # 404 (not 401) — don't reveal whether the slug exists privately.
        raise HTTPException(status_code=404, detail="Not found")
    return site


@router.get("/sites/{slug}")
def get_public_site(slug: str, db: DbSession) -> dict[str, Any]:
    site = _resolve_public_site(slug, db)
    layers = (
        db.execute(
            select(Layer).where(Layer.site_id == site.id).order_by(Layer.display_order)
        )
        .scalars()
        .all()
    )
    payload = _serialize_site(site, layers)
    payload["is_public"] = True
    return payload


@router.get("/sites/{slug}/layers")
def list_public_layers(slug: str, db: DbSession) -> list[dict[str, Any]]:
    site = _resolve_public_site(slug, db)
    rows = (
        db.execute(
            select(Layer).where(Layer.site_id == site.id).order_by(Layer.display_order)
        )
        .scalars()
        .all()
    )
    return [_serialize_layer(r) for r in rows]


@router.get("/sites/{slug}/data-sources")
def list_public_data_sources(slug: str, db: DbSession) -> list[dict[str, Any]]:
    site = _resolve_public_site(slug, db)
    # Only data sources referenced by this site's layers are surfaced
    # publicly — others belong to other sites and stay private.
    layers = db.execute(select(Layer).where(Layer.site_id == site.id)).scalars().all()
    ds_ids = {layer.data_source_id for layer in layers if layer.data_source_id}
    if not ds_ids:
        return []
    rows = (
        db.execute(select(DataSource).where(DataSource.id.in_(ds_ids))).scalars().all()
    )
    return [_serialize_ds(d) for d in rows]


@router.get("/settings")
def public_settings(db: DbSession) -> dict[str, Any]:
    """Branding / splash subset — same shape as /api/settings/public so
    public viewers can show the customer logo + name without an extra
    auth flow. """
    rows = (
        db.execute(select(Setting).where(Setting.is_public.is_(True))).scalars().all()
    )
    return {row.key: row.value for row in rows}
