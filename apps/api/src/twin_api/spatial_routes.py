"""Spatial CRUD — sites, layers, data sources.

Phase D ports the MightyDT spatial admin model:
  * /api/spatial/sites              — list / create
  * /api/spatial/sites/{slug}        — get / update / delete
  * /api/spatial/sites/{slug}/layers — nested layer CRUD
  * /api/spatial/data-sources        — list / create
  * /api/spatial/data-sources/{id}   — get / delete

All write paths require admin (or creator) role; reads require any auth.
Sites are addressed by slug for URL-friendliness; layers + data sources
by UUID.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from mighty_models import DataSource, Layer, Site

from .auth import AdminUser, CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/spatial", tags=["spatial"])


# ── Sites ───────────────────────────────────────────────────────────────


def _serialize_site(s: Site, layers: list[Layer] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": str(s.id),
        "slug": s.slug,
        "name": s.name,
        "description": s.description,
        "storage_srid": s.storage_srid,
        "is_public_pre_login": bool(s.is_public_pre_login),
        **(s.config or {}),
    }
    if layers is not None:
        out["layers"] = [_serialize_layer(layer) for layer in layers]
    return out


class SiteCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    storage_srid: int = 4326
    config: dict[str, Any] = Field(default_factory=dict)
    is_public_pre_login: bool = False


class SiteUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    storage_srid: int | None = None
    config: dict[str, Any] | None = None
    is_public_pre_login: bool | None = None
    model_config = {"extra": "allow"}


@router.get("/sites")
def list_sites(_: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    sites = db.execute(select(Site).order_by(Site.name)).scalars().all()
    return [_serialize_site(s) for s in sites]


@router.get("/sites/{slug}")
def get_site(slug: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    layers = (
        db.execute(
            select(Layer).where(Layer.site_id == site.id).order_by(Layer.display_order)
        )
        .scalars()
        .all()
    )
    return _serialize_site(site, layers)


@router.post("/sites", status_code=201)
def create_site(body: SiteCreate, _: AdminUser, db: DbSession) -> dict[str, Any]:
    if db.execute(select(Site).where(Site.slug == body.slug)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Slug already in use")
    site = Site(
        slug=body.slug,
        name=body.name,
        description=body.description,
        storage_srid=body.storage_srid,
        config=body.config,
        is_public_pre_login=body.is_public_pre_login,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return _serialize_site(site, [])


@router.patch("/sites/{slug}")
def update_site(
    slug: str, body: SiteUpdate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    payload = body.model_dump(exclude_none=True, exclude={"config"})
    for k, v in payload.items():
        if hasattr(site, k):
            setattr(site, k, v)
    if body.config is not None:
        # Merge over existing config so partial updates don't clobber.
        site.config = {**(site.config or {}), **body.config}
    db.commit()
    db.refresh(site)
    return _serialize_site(site)


@router.delete("/sites/{slug}", status_code=204)
def delete_site(slug: str, _: AdminUser, db: DbSession) -> None:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    db.delete(site)
    db.commit()


# ── Layers (nested under sites) ─────────────────────────────────────────


def _serialize_layer(layer: Layer) -> dict[str, Any]:
    return {
        "id": str(layer.id),
        "site_id": str(layer.site_id),
        "data_source_id": str(layer.data_source_id) if layer.data_source_id else None,
        "name": layer.name,
        "type": layer.type,
        "opacity": layer.opacity,
        "visible": bool(layer.visible),
        "order": layer.display_order,
        "style": layer.style or {},
        "metadata": layer.layer_metadata or {},
    }


class LayerCreate(BaseModel):
    name: str
    type: str
    data_source_id: str | None = None
    visible: bool = True
    opacity: float = 1.0
    order: int = 0
    style: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class LayerUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    data_source_id: str | None = None
    visible: bool | None = None
    opacity: float | None = None
    order: int | None = None
    style: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


def _resolve_site(slug: str, db) -> Site:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    return site


@router.get("/sites/{slug}/layers")
def list_layers(slug: str, _: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    site = _resolve_site(slug, db)
    rows = (
        db.execute(
            select(Layer).where(Layer.site_id == site.id).order_by(Layer.display_order)
        )
        .scalars()
        .all()
    )
    return [_serialize_layer(r) for r in rows]


@router.post("/sites/{slug}/layers", status_code=201)
def create_layer(
    slug: str, body: LayerCreate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    site = _resolve_site(slug, db)
    ds_id = uuid.UUID(body.data_source_id) if body.data_source_id else None
    layer = Layer(
        site_id=site.id,
        data_source_id=ds_id,
        name=body.name,
        type=body.type,
        opacity=body.opacity,
        visible=1 if body.visible else 0,
        display_order=body.order,
        style=body.style,
        layer_metadata=body.metadata,
    )
    db.add(layer)
    db.commit()
    db.refresh(layer)
    return _serialize_layer(layer)


@router.patch("/sites/{slug}/layers/{layer_id}")
def update_layer(
    slug: str,
    layer_id: str,
    body: LayerUpdate,
    _: AdminUser,
    db: DbSession,
) -> dict[str, Any]:
    site = _resolve_site(slug, db)
    layer = db.execute(
        select(Layer).where(Layer.id == uuid.UUID(layer_id), Layer.site_id == site.id)
    ).scalar_one_or_none()
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found")
    if body.name is not None: layer.name = body.name
    if body.type is not None: layer.type = body.type
    if body.data_source_id is not None:
        layer.data_source_id = uuid.UUID(body.data_source_id) if body.data_source_id else None
    if body.visible is not None: layer.visible = 1 if body.visible else 0
    if body.opacity is not None: layer.opacity = body.opacity
    if body.order is not None: layer.display_order = body.order
    if body.style is not None: layer.style = body.style
    if body.metadata is not None: layer.layer_metadata = body.metadata
    db.commit()
    db.refresh(layer)
    return _serialize_layer(layer)


@router.delete("/sites/{slug}/layers/{layer_id}", status_code=204)
def delete_layer(slug: str, layer_id: str, _: AdminUser, db: DbSession) -> None:
    site = _resolve_site(slug, db)
    layer = db.execute(
        select(Layer).where(Layer.id == uuid.UUID(layer_id), Layer.site_id == site.id)
    ).scalar_one_or_none()
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found")
    db.delete(layer)
    db.commit()


# ── Data sources ────────────────────────────────────────────────────────


def _serialize_ds(ds: DataSource) -> dict[str, Any]:
    return {
        "id": str(ds.id),
        "name": ds.name,
        "description": ds.description,
        "type": ds.type,
        "url": ds.url,
        "size_bytes": ds.size_bytes,
        "attributes": ds.attributes or {},
    }


class DataSourceCreate(BaseModel):
    name: str
    description: str | None = None
    type: str
    url: str | None = None
    size_bytes: int | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


@router.get("/data-sources")
def list_data_sources(_: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    rows = db.execute(select(DataSource).order_by(DataSource.name)).scalars().all()
    return [_serialize_ds(d) for d in rows]


@router.get("/data-sources/{ds_id}")
def get_data_source(ds_id: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    ds = db.execute(
        select(DataSource).where(DataSource.id == uuid.UUID(ds_id))
    ).scalar_one_or_none()
    if ds is None:
        raise HTTPException(status_code=404, detail="DataSource not found")
    return _serialize_ds(ds)


@router.get("/data-sources/{ds_id}/attributes")
def get_data_source_attributes(
    ds_id: str, _: CurrentUser, db: DbSession
) -> dict[str, Any]:
    """The frontend's DataSourcePage hits this for the attribute schema +
    feature preview. v1 just returns the attributes JSON; full feature
    pagination comes when the upload pipeline is wired (Phase F)."""
    ds = db.execute(
        select(DataSource).where(DataSource.id == uuid.UUID(ds_id))
    ).scalar_one_or_none()
    if ds is None:
        raise HTTPException(status_code=404, detail="DataSource not found")
    return {"attributes": ds.attributes or {}, "features": []}


@router.post("/data-sources", status_code=201)
def create_data_source(
    body: DataSourceCreate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    ds = DataSource(
        name=body.name,
        description=body.description,
        type=body.type,
        url=body.url,
        size_bytes=body.size_bytes,
        attributes=body.attributes,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _serialize_ds(ds)


@router.delete("/data-sources/{ds_id}", status_code=204)
def delete_data_source(ds_id: str, _: AdminUser, db: DbSession) -> None:
    ds = db.execute(
        select(DataSource).where(DataSource.id == uuid.UUID(ds_id))
    ).scalar_one_or_none()
    if ds is None:
        raise HTTPException(status_code=404, detail="DataSource not found")
    db.delete(ds)
    db.commit()
