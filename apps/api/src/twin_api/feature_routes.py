"""Feature CRUD — T+1050.

Per-feature read/update/delete on the spatial features table. The
features table itself isn't a SQLAlchemy model (it's defined in
migration 0001 and accessed via raw SQL) so this module uses
sqlalchemy.text + dialect-aware ST_* functions matching the rest of
the spatial path (submission promote, package importer, feed
materialise).

Endpoints:

  GET    /api/spatial/sites/{slug}/features
         (?layer_id=, ?bbox=lon,lat,lon,lat, ?limit=100)
  GET    /api/spatial/sites/{slug}/features/{feature_id}
  PATCH  /api/spatial/sites/{slug}/features/{feature_id}
         { properties? geometry? }
  DELETE /api/spatial/sites/{slug}/features/{feature_id}

Geometry is always exposed in WGS84 — clients live in 4326. On write
we ST_Transform to the site's storage_srid.

Provenance is preserved through PATCH: properties merge by default
(set ``replace_properties: true`` to overwrite). The
``_source_kind / _source_table_id / _source_row_id`` stamps from
imports + Sheets translations stay intact unless explicitly removed.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from mighty_models import Site

from .auth import AdminUser, CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/spatial", tags=["features"])


def _resolve_site(slug: str, db: DbSession) -> Site:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    return site


def _serialize_row(row: Any) -> dict[str, Any]:
    """Map a result row (id, layer_id, geom_json, properties, created_at)
    onto a stable JSON shape. Geometry is parsed from string when
    PostGIS returns ST_AsGeoJSON's TEXT type."""
    id_ = row[0]
    layer_id = row[1]
    geom_json = row[2]
    properties = row[3]
    created_at = row[4]
    if isinstance(geom_json, str):
        try:
            geometry: Any = json.loads(geom_json)
        except ValueError:
            geometry = None
    else:
        geometry = geom_json
    if isinstance(properties, str):
        try:
            properties = json.loads(properties)
        except ValueError:
            properties = {"_raw": properties}
    return {
        "id": str(id_),
        "type": "Feature",
        "layer_id": str(layer_id) if layer_id else None,
        "geometry": geometry,
        "properties": properties or {},
        "created_at": created_at.isoformat() if created_at else None,
    }


# ── List ────────────────────────────────────────────────────────────────


@router.get("/sites/{slug}/features")
def list_features(
    slug: str,
    _: CurrentUser,
    db: DbSession,
    layer_id: str | None = None,
    bbox: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    site = _resolve_site(slug, db)
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    geom_func = "ST_AsGeoJSON(ST_Transform(geom, 4326))" if is_postgis else "AsGeoJSON(Transform(geom, 4326))"

    where = ["site_id = :site_id"]
    params: dict[str, Any] = {"site_id": str(site.id), "limit": limit, "offset": offset}

    if layer_id:
        where.append("layer_id = :layer_id")
        params["layer_id"] = str(uuid.UUID(layer_id))

    if bbox:
        try:
            west, south, east, north = (float(x) for x in bbox.split(","))
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail="bbox must be 'west,south,east,north' in WGS84 degrees",
            ) from e
        if is_postgis:
            where.append(
                "ST_Intersects(geom, ST_Transform(ST_MakeEnvelope(:w,:s,:e,:n,4326), :srid))"
            )
        else:
            where.append(
                "Intersects(geom, Transform(BuildMbr(:w,:s,:e,:n,4326), :srid))"
            )
        params.update({"w": west, "s": south, "e": east, "n": north, "srid": site.storage_srid})

    sql = text(
        f"""
        SELECT id, layer_id, {geom_func}::text AS geom_json, properties, created_at
        FROM features
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC, id
        LIMIT :limit OFFSET :offset
        """
    ) if is_postgis else text(
        f"""
        SELECT id, layer_id, {geom_func} AS geom_json, properties, created_at
        FROM features
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC, id
        LIMIT :limit OFFSET :offset
        """
    )

    rows = db.execute(sql, params).all()
    count_sql = text(
        f"SELECT COUNT(*) FROM features WHERE {' AND '.join(where)}"
    )
    total = db.execute(count_sql, params).scalar() or 0

    return {
        "type": "FeatureCollection",
        "features": [_serialize_row(r) for r in rows],
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


# ── Read one ────────────────────────────────────────────────────────────


@router.get("/sites/{slug}/features/{feature_id}")
def get_feature(
    slug: str, feature_id: str, _: CurrentUser, db: DbSession
) -> dict[str, Any]:
    site = _resolve_site(slug, db)
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    geom_func = "ST_AsGeoJSON(ST_Transform(geom, 4326))" if is_postgis else "AsGeoJSON(Transform(geom, 4326))"
    sql = text(
        f"""
        SELECT id, layer_id, {geom_func} AS geom_json, properties, created_at
        FROM features
        WHERE id = :id AND site_id = :site_id
        """
    )
    row = db.execute(
        sql, {"id": str(uuid.UUID(feature_id)), "site_id": str(site.id)}
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    return _serialize_row(row)


# ── Update ──────────────────────────────────────────────────────────────


class FeatureUpdate(BaseModel):
    properties: dict[str, Any] | None = None
    geometry: dict[str, Any] | None = None
    layer_id: str | None = None
    #: When True, ``properties`` overwrites the stored bag entirely
    #: rather than merging key-by-key. Default False (merge).
    replace_properties: bool = False


@router.patch("/sites/{slug}/features/{feature_id}")
def update_feature(
    slug: str,
    feature_id: str,
    body: FeatureUpdate,
    _: AdminUser,
    db: DbSession,
) -> dict[str, Any]:
    site = _resolve_site(slug, db)
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"

    # Fetch current properties so we can merge unless replace_properties.
    current_sql = text(
        "SELECT properties FROM features WHERE id = :id AND site_id = :sid"
    )
    current = db.execute(
        current_sql, {"id": str(uuid.UUID(feature_id)), "sid": str(site.id)}
    ).first()
    if current is None:
        raise HTTPException(status_code=404, detail="Feature not found")
    current_props = current[0]
    if isinstance(current_props, str):
        try:
            current_props = json.loads(current_props)
        except ValueError:
            current_props = {}
    current_props = current_props or {}

    sets: list[str] = []
    params: dict[str, Any] = {
        "id": str(uuid.UUID(feature_id)),
        "sid": str(site.id),
    }

    if body.properties is not None:
        new_props = (
            body.properties
            if body.replace_properties
            else {**current_props, **body.properties}
        )
        if is_postgis:
            sets.append("properties = CAST(:props AS jsonb)")
        else:
            sets.append("properties = :props")
        params["props"] = json.dumps(new_props)

    if body.geometry is not None:
        # Validate geometry shape minimally.
        if (
            not isinstance(body.geometry, dict)
            or "type" not in body.geometry
            or "coordinates" not in body.geometry
        ):
            raise HTTPException(
                status_code=400,
                detail="geometry must be a GeoJSON object with type + coordinates",
            )
        if is_postgis:
            sets.append(
                "geom = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), :srid)"
            )
        else:
            sets.append(
                "geom = Transform(SetSRID(GeomFromGeoJSON(:geojson), 4326), :srid)"
            )
        params["geojson"] = json.dumps(body.geometry)
        params["srid"] = site.storage_srid

    if body.layer_id is not None:
        sets.append("layer_id = :layer_id")
        params["layer_id"] = str(uuid.UUID(body.layer_id)) if body.layer_id else None

    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")

    update_sql = text(
        f"UPDATE features SET {', '.join(sets)} WHERE id = :id AND site_id = :sid"
    )
    db.execute(update_sql, params)
    db.commit()
    return get_feature(slug, feature_id, _, db)


# ── Delete ──────────────────────────────────────────────────────────────


@router.delete("/sites/{slug}/features/{feature_id}", status_code=204)
def delete_feature(
    slug: str, feature_id: str, _: AdminUser, db: DbSession
) -> None:
    site = _resolve_site(slug, db)
    result = db.execute(
        text("DELETE FROM features WHERE id = :id AND site_id = :sid"),
        {"id": str(uuid.UUID(feature_id)), "sid": str(site.id)},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Feature not found")
    db.commit()


# ── Bulk delete (admin convenience) ─────────────────────────────────────


class BulkDeleteBody(BaseModel):
    feature_ids: list[str] = Field(default_factory=list)


@router.post("/sites/{slug}/features/bulk-delete")
def bulk_delete_features(
    slug: str, body: BulkDeleteBody, _: AdminUser, db: DbSession
) -> dict[str, int]:
    site = _resolve_site(slug, db)
    if not body.feature_ids:
        return {"deleted": 0}
    ids = [str(uuid.UUID(fid)) for fid in body.feature_ids]
    result = db.execute(
        text("DELETE FROM features WHERE site_id = :sid AND id = ANY(:ids)")
        if db.get_bind().dialect.name == "postgresql"
        else text("DELETE FROM features WHERE site_id = :sid AND id IN :ids"),
        {"sid": str(site.id), "ids": ids if db.get_bind().dialect.name == "postgresql" else tuple(ids)},
    )
    db.commit()
    return {"deleted": int(result.rowcount or 0)}
