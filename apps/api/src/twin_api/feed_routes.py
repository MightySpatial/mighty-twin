"""Feed CRUD + fetch endpoints — T+960.

  GET    /api/feeds                  — list all feeds
  POST   /api/feeds                  — create a feed (admin)
  GET    /api/feeds/{id}             — fetch one
  PATCH  /api/feeds/{id}             — update (admin)
  DELETE /api/feeds/{id}             — remove (admin)
  POST   /api/feeds/{id}/preview     — fetch + return up to N rows for
                                       UI inspection (does not write)
  POST   /api/feeds/{id}/materialise — fetch + insert into the features
                                       table for any layers that
                                       reference this feed with
                                       materialisation='materialised'
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from mighty_models import Feed, Layer, Site

from .auth import AdminUser, CurrentUser
from .db import DbSession
from .feeds import AdapterError, get_adapter
from .feeds.base import apply_geometry_hint

router = APIRouter(prefix="/api/feeds", tags=["feeds"])

KNOWN_KINDS = {
    "geojson_url",
    "csv_url",
    "xlsx_url",
    "wmts",
    "wms",
    "xyz",
    "ogc_api_features",
    "arcgis_rest",
    "sheets_workbook",
    "postgis_direct",
}


def _serialize(f: Feed) -> dict[str, Any]:
    return {
        "id": str(f.id),
        "name": f.name,
        "description": f.description,
        "kind": f.kind,
        "url": f.url,
        "auth": f.auth or None,
        "refresh": f.refresh,
        "schedule_cron": f.schedule_cron,
        "source_srid": f.source_srid,
        "geometry_hint": f.geometry_hint or {"kind": "native"},
        "config": f.config or {},
        "last_fetched_at": f.last_fetched_at.isoformat() if f.last_fetched_at else None,
        "last_revision": f.last_revision,
        "last_error": f.last_error,
        "enabled": bool(f.enabled),
        "created_at": f.created_at.isoformat() if f.created_at else None,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None,
    }


class FeedCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    kind: str
    url: str | None = None
    auth: dict[str, Any] | None = None
    refresh: str = "on_demand"
    schedule_cron: str | None = None
    source_srid: int = 4326
    geometry_hint: dict[str, Any] = Field(default_factory=lambda: {"kind": "native"})
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class FeedUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    auth: dict[str, Any] | None = None
    refresh: str | None = None
    schedule_cron: str | None = None
    source_srid: int | None = None
    geometry_hint: dict[str, Any] | None = None
    config: dict[str, Any] | None = None
    enabled: bool | None = None


@router.get("")
def list_feeds(_: CurrentUser, db: DbSession) -> list[dict[str, Any]]:
    """Catalog list. Joins through Layer to attach the layers each Feed
    is bound to so the FeedsPage can show usage chips and warn before
    deletions break things."""
    rows = db.execute(select(Feed).order_by(Feed.name)).scalars().all()
    membership = db.execute(
        select(
            Layer.feed_id,
            Layer.id,
            Layer.name,
            Site.slug,
            Site.name,
        )
        .join(Site, Site.id == Layer.site_id)
        .where(Layer.feed_id.is_not(None))
    ).all()
    layers_by_feed: dict[Any, list[dict[str, str]]] = {}
    for feed_id, layer_id, layer_name, site_slug, site_name in membership:
        bucket = layers_by_feed.setdefault(feed_id, [])
        bucket.append(
            {
                "id": str(layer_id),
                "name": layer_name,
                "site_slug": site_slug,
                "site_name": site_name,
            }
        )
    out: list[dict[str, Any]] = []
    for r in rows:
        s = _serialize(r)
        s["layers"] = layers_by_feed.get(r.id, [])
        out.append(s)
    return out


@router.post("", status_code=201)
def create_feed(body: FeedCreate, _: AdminUser, db: DbSession) -> dict[str, Any]:
    if body.kind not in KNOWN_KINDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown feed kind {body.kind!r}; expected one of {sorted(KNOWN_KINDS)}",
        )
    if body.refresh not in {"on_demand", "scheduled", "webhook"}:
        raise HTTPException(status_code=400, detail="refresh must be on_demand|scheduled|webhook")
    feed = Feed(
        name=body.name,
        description=body.description,
        kind=body.kind,
        url=body.url,
        auth=body.auth,
        refresh=body.refresh,
        schedule_cron=body.schedule_cron,
        source_srid=body.source_srid,
        geometry_hint=body.geometry_hint,
        config=body.config,
        enabled=body.enabled,
    )
    db.add(feed)
    db.commit()
    db.refresh(feed)
    return _serialize(feed)


@router.get("/{feed_id}")
def get_feed(feed_id: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    feed = db.execute(
        select(Feed).where(Feed.id == uuid.UUID(feed_id))
    ).scalar_one_or_none()
    if feed is None:
        raise HTTPException(status_code=404, detail="Feed not found")
    return _serialize(feed)


@router.patch("/{feed_id}")
def update_feed(
    feed_id: str, body: FeedUpdate, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    feed = db.execute(
        select(Feed).where(Feed.id == uuid.UUID(feed_id))
    ).scalar_one_or_none()
    if feed is None:
        raise HTTPException(status_code=404, detail="Feed not found")
    payload = body.model_dump(exclude_none=True)
    for k, v in payload.items():
        setattr(feed, k, v)
    db.commit()
    db.refresh(feed)
    return _serialize(feed)


@router.delete("/{feed_id}", status_code=204)
def delete_feed(feed_id: str, _: AdminUser, db: DbSession) -> None:
    feed = db.execute(
        select(Feed).where(Feed.id == uuid.UUID(feed_id))
    ).scalar_one_or_none()
    if feed is None:
        raise HTTPException(status_code=404, detail="Feed not found")
    db.delete(feed)
    db.commit()


# ── Adapter actions ─────────────────────────────────────────────────────


class PreviewQuery(BaseModel):
    limit: int = 25


@router.post("/{feed_id}/preview")
def preview_feed(
    feed_id: str,
    _: AdminUser,
    db: DbSession,
    body: PreviewQuery | None = None,
) -> dict[str, Any]:
    """Fetch up to ``limit`` rows through the adapter without writing
    anything. Useful for the UI's "test feed" affordance — the user
    sets a URL + geometry hint and previews what'll come back.
    """
    feed = _resolve_feed(feed_id, db)
    limit = (body.limit if body else None) or 25
    rows: list[dict[str, Any]] = []
    try:
        adapter = get_adapter(feed.kind)
    except AdapterError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        for raw in adapter.fetch(feed):
            row = apply_geometry_hint(raw, feed.geometry_hint or {"kind": "native"})
            rows.append(
                {
                    "geometry": row.get("geometry"),
                    "properties": row.get("properties") or {},
                    "source_key": row.get("source_key"),
                }
            )
            if len(rows) >= limit:
                break
    except AdapterError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {
        "feed_id": str(feed.id),
        "rows": rows,
        "truncated": len(rows) >= limit,
    }


class MaterialiseBody(BaseModel):
    site_slug: str
    layer_id: str
    replace_existing: bool = False


@router.post("/{feed_id}/materialise")
def materialise_feed(
    feed_id: str, body: MaterialiseBody, _: AdminUser, db: DbSession
) -> dict[str, Any]:
    """Run the adapter and insert features into the target layer.

    Two policies via ``replace_existing``:
        False — append rows. Existing features in the layer remain.
        True  — clear the target layer's features first, then insert.

    The Layer's feed_id + materialisation are set so future reruns
    know this layer is feed-backed.
    """
    feed = _resolve_feed(feed_id, db)
    site = db.execute(
        select(Site).where(Site.slug == body.site_slug)
    ).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {body.site_slug!r} not found")
    layer = db.execute(
        select(Layer).where(
            Layer.id == uuid.UUID(body.layer_id), Layer.site_id == site.id
        )
    ).scalar_one_or_none()
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found in site")

    # Bind layer to feed (for future drift checks).
    layer.feed_id = feed.id
    layer.materialisation = "materialised"

    if body.replace_existing:
        bind = db.get_bind()
        delete_sql = text("DELETE FROM features WHERE site_id = :sid AND layer_id = :lid")
        db.execute(delete_sql, {"sid": str(site.id), "lid": str(layer.id)})

    try:
        adapter = get_adapter(feed.kind)
    except AdapterError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    inserted = 0
    skipped = 0
    try:
        for raw in adapter.fetch(feed):
            row = apply_geometry_hint(raw, feed.geometry_hint or {"kind": "native"})
            if not _has_valid_geometry(row.get("geometry")):
                skipped += 1
                continue
            _insert_feature(
                db,
                site_id=site.id,
                layer_id=layer.id,
                source_srid=feed.source_srid,
                storage_srid=site.storage_srid,
                geometry=row["geometry"],
                properties=row.get("properties") or {},
            )
            inserted += 1
    except AdapterError as e:
        feed.last_error = str(e)
        feed.last_fetched_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(status_code=502, detail=str(e)) from e

    feed.last_fetched_at = datetime.now(timezone.utc)
    feed.last_error = None
    db.commit()
    db.refresh(feed)

    return {
        "feed": _serialize(feed),
        "site_slug": body.site_slug,
        "layer_id": body.layer_id,
        "inserted": inserted,
        "skipped": skipped,
    }


# ── Helpers ─────────────────────────────────────────────────────────────


def _resolve_feed(feed_id: str, db: DbSession) -> Feed:
    feed = db.execute(
        select(Feed).where(Feed.id == uuid.UUID(feed_id))
    ).scalar_one_or_none()
    if feed is None:
        raise HTTPException(status_code=404, detail="Feed not found")
    return feed


def _has_valid_geometry(geom: Any) -> bool:
    return (
        isinstance(geom, dict)
        and "type" in geom
        and "coordinates" in geom
    )


def _insert_feature(
    db: DbSession,
    *,
    site_id: uuid.UUID,
    layer_id: uuid.UUID,
    source_srid: int,
    storage_srid: int,
    geometry: dict[str, Any],
    properties: dict[str, Any],
) -> None:
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    if is_postgis:
        stmt = text(
            """
            INSERT INTO features (id, site_id, layer_id, geom, properties)
            VALUES (
                :id,
                :site_id,
                :layer_id,
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), :source_srid), :storage_srid),
                CAST(:properties AS jsonb)
            )
            """
        )
    else:
        stmt = text(
            """
            INSERT INTO features (id, site_id, layer_id, geom, properties)
            VALUES (
                :id,
                :site_id,
                :layer_id,
                Transform(SetSRID(GeomFromGeoJSON(:geojson), :source_srid), :storage_srid),
                :properties
            )
            """
        )
    db.execute(
        stmt,
        {
            "id": str(uuid.uuid4()),
            "site_id": str(site_id),
            "layer_id": str(layer_id),
            "geojson": json.dumps(geometry),
            "source_srid": source_srid,
            "storage_srid": storage_srid,
            "properties": json.dumps(properties),
        },
    )
