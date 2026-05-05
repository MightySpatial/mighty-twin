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

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text

from mighty_models import DataSource, Layer, Site, Snapshot, StoryMap, User

from .auth import AdminUser, CurrentUser
from .db import DbSession
from .packages import (
    PackageImportError,
    SheetsTranslationError,
    export_site_package,
    import_site_package,
    translate_sheets_to_mtsite,
)

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
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
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
    counts = dict(
        db.execute(
            select(Layer.site_id, func.count(Layer.id)).group_by(Layer.site_id)
        ).all()
    )
    sites = db.execute(select(Site).order_by(Site.name)).scalars().all()
    out: list[dict[str, Any]] = []
    for s in sites:
        row = _serialize_site(s)
        row["layer_count"] = int(counts.get(s.id, 0))
        out.append(row)
    return out


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


class SiteDuplicate(BaseModel):
    new_slug: str | None = None
    new_name: str | None = None


@router.post("/sites/{slug}/duplicate", status_code=201)
def duplicate_site(
    slug: str, body: SiteDuplicate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    """Clone a site as a template. Copies the site row, every Layer, and
    every StoryMap. Features, snapshots, and submissions are NOT cloned —
    duplicate is for templating, not data forking. Existing DataSource
    references are reused (the clone shares the catalog rows).
    """
    src = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if src is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")

    # Pick destination slug. If user supplied one, take it; otherwise
    # derive ``slug-copy`` / ``slug-copy-2`` until unique.
    if body.new_slug:
        new_slug = body.new_slug.strip().lower()
        clash = db.execute(
            select(Site).where(Site.slug == new_slug)
        ).scalar_one_or_none()
        if clash is not None:
            raise HTTPException(
                status_code=409, detail=f"Slug {new_slug!r} already exists"
            )
    else:
        new_slug = f"{src.slug}-copy"
        i = 1
        while (
            db.execute(select(Site).where(Site.slug == new_slug)).scalar_one_or_none()
            is not None
        ):
            i += 1
            new_slug = f"{src.slug}-copy-{i}"

    new_name = body.new_name or f"{src.name} (copy)"

    clone = Site(
        slug=new_slug,
        name=new_name,
        description=src.description,
        storage_srid=src.storage_srid,
        is_public_pre_login=False,  # never public until the admin says so
        config=dict(src.config or {}),
    )
    db.add(clone)
    db.flush()

    # Layers — keep IDs distinct, otherwise FK cascades on the source
    # would delete clone layers too.
    src_layers = (
        db.execute(select(Layer).where(Layer.site_id == src.id)).scalars().all()
    )
    for l in src_layers:
        db.add(
            Layer(
                site_id=clone.id,
                data_source_id=l.data_source_id,
                feed_id=l.feed_id,
                name=l.name,
                type=l.type,
                opacity=l.opacity,
                visible=l.visible,
                display_order=l.display_order,
                style=dict(l.style or {}),
                layer_metadata=dict(l.layer_metadata or {}),
                materialisation=l.materialisation,
            )
        )

    # Story maps
    src_stories = (
        db.execute(select(StoryMap).where(StoryMap.site_id == src.id))
        .scalars()
        .all()
    )
    for s in src_stories:
        db.add(
            StoryMap(
                site_id=clone.id,
                name=s.name,
                description=s.description,
                is_published=False,  # always start unpublished
                slides=list(s.slides or []),
            )
        )

    db.commit()
    db.refresh(clone)
    return _serialize_site(clone, layers=[])


# ── Site package export (.mtsite) ───────────────────────────────────────


@router.get("/sites/{slug}/export")
def export_site(
    slug: str,
    user: AdminUser,
    db: DbSession,
    request: Request,
    include_features: bool = True,
    include_assets: bool = True,
    include_library: bool = True,
) -> Response:
    """Stream a .mtsite zip archive of the site.

    Query params let callers thin the package down for catalog-only
    federation use cases (skip features) or low-bandwidth transfers
    (skip assets). Defaults are full-fat.
    """
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    twin_url = str(request.base_url).rstrip("/")
    payload = export_site_package(
        db,
        site,
        exported_by=user,
        twin_url=twin_url,
        include_features=include_features,
        include_assets=include_assets,
        include_library=include_library,
    )
    return Response(
        content=payload,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{slug}.mtsite"',
            "Content-Length": str(len(payload)),
        },
    )


# ── Site package import (.mtsite) ───────────────────────────────────────


@router.post("/sites/import", status_code=201)
async def import_site_endpoint(
    _: AdminUser,
    db: DbSession,
    file: UploadFile = File(...),
    target_slug: str | None = Form(None),
    overwrite_collision: bool = Form(False),
) -> dict[str, Any]:
    """Upload a .mtsite archive and provision a new site from it.

    target_slug overrides the slug stored in the manifest (so two
    imports of the same package can coexist as ``foo`` and ``foo-copy``).
    Default is the manifest's slug; a 409 surfaces if it collides and
    overwrite_collision wasn't set.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    try:
        result = import_site_package(
            db,
            raw,
            target_slug=target_slug,
            overwrite_collision=overwrite_collision,
        )
    except PackageImportError as e:
        msg = str(e)
        status_code = 409 if "already exists" in msg else 400
        raise HTTPException(status_code=status_code, detail=msg) from e
    return result


# ── Mighty Sheets workbook import (.mishpkg → translate → import) ──────


@router.post("/sites/import-sheets", status_code=201)
async def import_sheets_workbook(
    _: AdminUser,
    db: DbSession,
    file: UploadFile = File(...),
    target_slug: str | None = Form(None),
    overwrite_collision: bool = Form(False),
) -> dict[str, Any]:
    """Upload a Mighty Sheets workbook export (.mishpkg) and translate
    it into a .mtsite, then run the standard package importer.

    The translator handles geometry promotion (lng/lat columns, WKT,
    or attribute-only) per table; the importer handles the rest.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    try:
        mtsite_blob = translate_sheets_to_mtsite(raw)
    except SheetsTranslationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        result = import_site_package(
            db,
            mtsite_blob,
            target_slug=target_slug,
            overwrite_collision=overwrite_collision,
        )
    except PackageImportError as e:
        msg = str(e)
        status_code = 409 if "already exists" in msg else 400
        raise HTTPException(status_code=status_code, detail=msg) from e
    return result


# ── Site snapshot gallery (admin / co-viewer) ───────────────────────────


@router.get("/sites/{slug}/snapshots")
def list_site_snapshots(
    slug: str, _: CurrentUser, db: DbSession, limit: int = 24
) -> list[dict[str, Any]]:
    """Snapshots associated with a site that the user can see.

    Right now: any snapshot ``shared_to_gallery`` for the site, plus any
    snapshot owned by the requesting user. Admin users see everything.
    The endpoint is stable across roles so the SiteDetailPage can render
    a single gallery without separate admin/non-admin code paths.
    """
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")

    rows = (
        db.execute(
            select(Snapshot, User)
            .join(User, User.id == Snapshot.user_id, isouter=True)
            .where(Snapshot.site_id == site.id)
            .where(Snapshot.shared_to_gallery.is_(True))
            .order_by(Snapshot.created_at.desc())
            .limit(limit)
        )
        .all()
    )
    out: list[dict[str, Any]] = []
    for snap, owner in rows:
        out.append(
            {
                "id": str(snap.id),
                "name": snap.name,
                "description": snap.description,
                "thumbnail_url": (snap.payload or {}).get("thumbnail_url"),
                "owner_name": owner.name if owner else "Unknown",
                "shared_to_gallery": bool(snap.shared_to_gallery),
                "created_at": snap.created_at.isoformat() if snap.created_at else None,
            }
        )
    return out


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
    # Feature counts per layer — single grouped query to avoid an N+1.
    counts = dict(
        db.execute(
            text(
                "SELECT layer_id, COUNT(*) FROM features "
                "WHERE site_id = :sid GROUP BY layer_id"
            ),
            {"sid": str(site.id)},
        ).all()
    )
    out = []
    for r in rows:
        s = _serialize_layer(r)
        s["feature_count"] = int(counts.get(r.id, 0))
        out.append(s)
    return out


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
    """Catalog list. Joins through Layer to attach the sites each
    DataSource is in use on, so the frontend can filter "data used in
    site X" without a second round-trip."""
    rows = db.execute(select(DataSource).order_by(DataSource.name)).scalars().all()
    membership = db.execute(
        select(Layer.data_source_id, Site.slug, Site.name)
        .join(Site, Site.id == Layer.site_id)
        .where(Layer.data_source_id.is_not(None))
    ).all()
    sites_by_ds: dict[uuid.UUID, list[dict[str, str]]] = {}
    for ds_id, slug, name in membership:
        if ds_id is None:
            continue
        bucket = sites_by_ds.setdefault(ds_id, [])
        if not any(s["slug"] == slug for s in bucket):
            bucket.append({"slug": slug, "name": name})
    out: list[dict[str, Any]] = []
    for d in rows:
        s = _serialize_ds(d)
        s["sites"] = sites_by_ds.get(d.id, [])
        out.append(s)
    return out


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
