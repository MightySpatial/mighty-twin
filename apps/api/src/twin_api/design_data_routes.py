"""Design widget data-source endpoints — surgical reads + writes the
widget needs but the rest of the API doesn't expose.

Five endpoints scoped under a layer:

  GET    /api/sites/{slug}/layers/{layer_id}/source-crs
      4-step CRS fallback (spec §2). Returns {epsg, source} where
      source ∈ data_source_attribute / layer_metadata / geometry_probe /
      site_storage / unknown — so the UI can show provenance.

  GET    /api/sites/{slug}/layers/{layer_id}/fields
      Available property keys on the layer's features (sampled).
      Drives the redline schema-import path + the field/preview pickers.

  POST   /api/sites/{slug}/layers/{layer_id}/preview
      Body: { field, limit? }. Distinct values for the field (≤ 100).
      Drives legend dropdowns + the redline sublayer-field picker.

  GET    /api/sites/{slug}/layers/{layer_id}/pipe-data?diameter_field=...
      All LineString features in the layer + their resolved diameter
      in metres. Used by the 3D pipe renderer when displaying an
      already-imported pipe layer (vs the live-draw pipe tool).

  GET    /api/sites/{slug}/layers/{layer_id}/string-group?polyline_feature_id=...
      The polyline + every ordered child point that v1 imported as a
      vertex. Match by properties._parentPolylineId or
      ._aggregateRelId. Powers the "edit string in redline" flow.

Plus one feature mutation that goes BELOW v2's existing PATCH
/sites/{slug}/features/{id}:

  PUT    /api/sites/{slug}/features/{feature_id}/vertex
      Body: { vertex_index, lon, lat, alt? }. Single ST_SetPoint
      update — keeps the vertex-list editor's micro-edits cheap (one
      round-trip per drag) without re-sending the whole geometry.

Spec §4 data-sources surgical endpoints, plus §2 source-CRS fallback.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from mighty_models import Layer, Site

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/sites", tags=["design-data"])


# ── Helpers ──────────────────────────────────────────────────────────────


def _resolve(slug: str, layer_id: str, db: DbSession) -> tuple[Site, Layer]:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(404, f"Site '{slug}' not found")
    try:
        lid = uuid.UUID(layer_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid layer id") from e
    layer = db.execute(
        select(Layer).where(Layer.id == lid, Layer.site_id == site.id)
    ).scalar_one_or_none()
    if layer is None:
        raise HTTPException(404, "Layer not found")
    return site, layer


def _layer_has_features(layer: Layer, db: DbSession) -> bool:
    """Cheap probe — does the features table hold any row for this layer?"""
    res = db.execute(
        text("SELECT 1 FROM features WHERE layer_id = :lid LIMIT 1"),
        {"lid": str(layer.id)},
    ).first()
    return res is not None


# ── 1. source-crs ────────────────────────────────────────────────────────


@router.get("/{slug}/layers/{layer_id}/source-crs")
def source_crs(slug: str, layer_id: str, _: CurrentUser, db: DbSession) -> dict[str, Any]:
    """4-step CRS fallback (spec §2):

      1. data_source.attributes.{source_srid|source_epsg|epsg}
      2. layer.layer_metadata.{source_srid|source_epsg|epsg}
      3. ST_SRID(geom) on the first feature row for this layer
      4. site.storage_srid

    Returns {epsg, source} where source identifies which step matched
    (or 'unknown' when no probe yields anything > 0)."""
    site, layer = _resolve(slug, layer_id, db)

    # Step 1: data_source.attributes
    if layer.data_source_id:
        ds_attrs = db.execute(
            text("SELECT attributes FROM data_sources WHERE id = :dsid"),
            {"dsid": str(layer.data_source_id)},
        ).scalar()
        if ds_attrs:
            attrs = ds_attrs if isinstance(ds_attrs, dict) else (
                json.loads(ds_attrs) if ds_attrs else {}
            )
            for k in ("source_srid", "source_epsg", "epsg"):
                v = attrs.get(k)
                if isinstance(v, int) and v > 0:
                    return {"epsg": v, "source": "data_source_attributes"}

    # Step 2: layer.layer_metadata
    md = layer.layer_metadata or {}
    for k in ("source_srid", "source_epsg", "epsg"):
        v = md.get(k)
        if isinstance(v, int) and v > 0:
            return {"epsg": v, "source": "layer_metadata"}

    # Step 3: ST_SRID probe on first feature row
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        try:
            row = db.execute(
                text(
                    "SELECT ST_SRID(geom) AS srid FROM features "
                    "WHERE layer_id = :lid LIMIT 1"
                ),
                {"lid": str(layer.id)},
            ).first()
            if row and row.srid and row.srid > 0:
                return {"epsg": int(row.srid), "source": "geometry_probe"}
        except Exception:  # noqa: BLE001
            pass

    # Step 4: site storage SRID — the final fallback. Always populated.
    return {"epsg": int(site.storage_srid), "source": "site_storage"}


# ── 2. fields ────────────────────────────────────────────────────────────


@router.get("/{slug}/layers/{layer_id}/fields")
def list_fields(
    slug: str, layer_id: str, _: CurrentUser, db: DbSession,
    sample_size: int = 200,
) -> dict[str, Any]:
    """Distinct property keys observed across up to ``sample_size`` rows.
    For PostGIS, uses jsonb_object_keys + UNION; SpatiaLite samples in
    Python (less efficient but only used in dev)."""
    _, layer = _resolve(slug, layer_id, db)
    bind = db.get_bind()

    if bind.dialect.name == "postgresql":
        rows = db.execute(
            text(
                """
                SELECT DISTINCT k FROM (
                    SELECT jsonb_object_keys(properties::jsonb) AS k
                    FROM features
                    WHERE layer_id = :lid
                    LIMIT :sample
                ) sub
                ORDER BY k
                """
            ),
            {"lid": str(layer.id), "sample": sample_size},
        ).all()
        keys = [r.k for r in rows if r.k]
    else:
        rows = db.execute(
            text("SELECT properties FROM features WHERE layer_id = :lid LIMIT :sample"),
            {"lid": str(layer.id), "sample": sample_size},
        ).all()
        keys_set: set[str] = set()
        for r in rows:
            props = r[0]
            if isinstance(props, str):
                try:
                    props = json.loads(props)
                except json.JSONDecodeError:
                    continue
            if isinstance(props, dict):
                keys_set.update(props.keys())
        keys = sorted(keys_set)

    return {"layer_id": str(layer.id), "fields": keys}


# ── 3. preview (distinct values) ────────────────────────────────────────


class PreviewBody(BaseModel):
    field: str = Field(..., min_length=1, max_length=128)
    limit: int = Field(100, ge=1, le=500)


@router.post("/{slug}/layers/{layer_id}/preview")
def preview_field(
    slug: str, layer_id: str,
    body: PreviewBody,
    _: CurrentUser, db: DbSession,
) -> dict[str, Any]:
    """Distinct values for ``body.field``, ordered + deduplicated, ≤ limit.
    Drives the redline sublayer-field picker + the legend value dropdowns."""
    _, layer = _resolve(slug, layer_id, db)
    bind = db.get_bind()

    if bind.dialect.name == "postgresql":
        rows = db.execute(
            text(
                """
                SELECT DISTINCT (properties::jsonb)->>:field AS v
                FROM features
                WHERE layer_id = :lid
                  AND (properties::jsonb)->>:field IS NOT NULL
                ORDER BY v
                LIMIT :lim
                """
            ),
            {"lid": str(layer.id), "field": body.field, "lim": body.limit},
        ).all()
        values = [r.v for r in rows]
    else:
        rows = db.execute(
            text("SELECT properties FROM features WHERE layer_id = :lid LIMIT 1000"),
            {"lid": str(layer.id)},
        ).all()
        seen: set[str] = set()
        for r in rows:
            props = r[0]
            if isinstance(props, str):
                try:
                    props = json.loads(props)
                except json.JSONDecodeError:
                    continue
            if isinstance(props, dict):
                v = props.get(body.field)
                if v is not None:
                    seen.add(str(v))
        values = sorted(seen)[: body.limit]

    return {"layer_id": str(layer.id), "field": body.field, "values": values}


# ── 4. pipe-data ─────────────────────────────────────────────────────────


@router.get("/{slug}/layers/{layer_id}/pipe-data")
def pipe_data(
    slug: str, layer_id: str,
    _: CurrentUser, db: DbSession,
    diameter_field: str = "Size",
    uom: str = "mm",
    default_diameter: float = 100.0,
) -> dict[str, Any]:
    """LineString features in the layer + resolved diameter in metres.
    Used by the 3D pipe renderer when displaying an imported pipe layer.

    Read-only — works on top of the features_wgs84 view so coordinates
    arrive already in 4326."""
    _, layer = _resolve(slug, layer_id, db)
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        raise HTTPException(400, "pipe-data requires PostGIS (SpatiaLite path not implemented)")

    rows = db.execute(
        text(
            """
            SELECT
                id::text                AS id,
                ST_AsGeoJSON(geom)::json AS geom,
                properties::jsonb       AS properties
            FROM features_wgs84
            WHERE layer_id = :lid
              AND ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
            """
        ),
        {"lid": str(layer.id)},
    ).all()

    uom_to_m = {"mm": 0.001, "cm": 0.01, "m": 1.0, "in": 0.0254, "ft": 0.3048, "km": 1000.0}
    factor = uom_to_m.get(uom, 0.001)

    items: list[dict[str, Any]] = []
    for r in rows:
        props = r.properties if isinstance(r.properties, dict) else (
            json.loads(r.properties) if r.properties else {}
        )
        raw = props.get(diameter_field)
        try:
            d = float(raw) if raw not in (None, "") else default_diameter
        except (TypeError, ValueError):
            d = default_diameter
        items.append({
            "id": r.id,
            "geometry": r.geom,
            "properties": props,
            "diameter_m": d * factor,
        })

    return {
        "layer_id": str(layer.id),
        "diameter_field": diameter_field,
        "uom": uom,
        "default_diameter": default_diameter,
        "features": items,
    }


# ── 5. string-group ──────────────────────────────────────────────────────


@router.get("/{slug}/layers/{layer_id}/string-group")
def string_group(
    slug: str, layer_id: str,
    _: CurrentUser, db: DbSession,
    polyline_feature_id: str = "",
) -> dict[str, Any]:
    """Polyline + ordered child points for IFC-imported aggregate strings.

    Match logic mirrors v1 (case-insensitive on the underscore variant):
      Primary: properties._parentPolylineId == polyline.feature_id
      Fallback: properties._aggregateRelId == polyline._aggregateRelId
    Vertex order from properties._vertexIndex (numeric)."""
    if not polyline_feature_id:
        raise HTTPException(400, "polyline_feature_id is required")
    _, layer = _resolve(slug, layer_id, db)
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        raise HTTPException(400, "string-group requires PostGIS")

    try:
        pid = uuid.UUID(polyline_feature_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid polyline_feature_id") from e

    poly_row = db.execute(
        text(
            """
            SELECT id::text AS id, ST_AsGeoJSON(geom)::json AS geom,
                   properties::jsonb AS properties
            FROM features_wgs84
            WHERE id = :pid
            """
        ),
        {"pid": str(pid)},
    ).first()
    if poly_row is None:
        raise HTTPException(404, "Polyline feature not found")

    poly_props = poly_row.properties if isinstance(poly_row.properties, dict) else {}
    aggregate_rel_id = (
        poly_props.get("_aggregateRelId") or poly_props.get("aggregateRelId")
    )

    # Primary match — by parent polyline id.
    primary = db.execute(
        text(
            """
            SELECT id::text AS id, ST_AsGeoJSON(geom)::json AS geom,
                   properties::jsonb AS properties
            FROM features_wgs84
            WHERE layer_id = :lid
              AND ST_GeometryType(geom) = 'ST_Point'
              AND (
                (properties::jsonb)->>'_parentPolylineId' = :pid
                OR (properties::jsonb)->>'parentPolylineId' = :pid
              )
            ORDER BY ((properties::jsonb)->>'_vertexIndex')::numeric NULLS LAST
            """
        ),
        {"lid": str(layer.id), "pid": str(pid)},
    ).all()

    # Fallback — match by shared aggregateRelId when no _parentPolylineId.
    if not primary and aggregate_rel_id:
        primary = db.execute(
            text(
                """
                SELECT id::text AS id, ST_AsGeoJSON(geom)::json AS geom,
                       properties::jsonb AS properties
                FROM features_wgs84
                WHERE layer_id = :lid
                  AND ST_GeometryType(geom) = 'ST_Point'
                  AND id <> :pid
                  AND (
                    (properties::jsonb)->>'_aggregateRelId' = :rel
                    OR (properties::jsonb)->>'aggregateRelId' = :rel
                  )
                ORDER BY ((properties::jsonb)->>'_vertexIndex')::numeric NULLS LAST
                """
            ),
            {"lid": str(layer.id), "pid": str(pid), "rel": str(aggregate_rel_id)},
        ).all()

    points = [
        {
            "id": r.id,
            "geometry": r.geom,
            "properties": r.properties if isinstance(r.properties, dict) else {},
        }
        for r in primary
    ]
    return {
        "layer_id": str(layer.id),
        "polyline": {
            "id": poly_row.id,
            "geometry": poly_row.geom,
            "properties": poly_props,
        },
        "points": points,
        "match_strategy": (
            "parentPolylineId" if primary and any(
                "parentPolylineId" in str(p.get("properties", {}))
                or "_parentPolylineId" in str(p.get("properties", {}))
                for p in points
            ) else ("aggregateRelId" if points else "no-match")
        ),
    }


# ── 6. single-vertex update ──────────────────────────────────────────────


class VertexUpdate(BaseModel):
    vertex_index: int = Field(..., ge=0, description="0-based index along the geometry")
    lon: float
    lat: float
    alt: float | None = None


@router.put("/{slug}/features/{feature_id}/vertex")
def update_feature_vertex(
    slug: str, feature_id: str,
    body: VertexUpdate,
    _: CurrentUser, db: DbSession,
) -> dict[str, Any]:
    """Replace a single vertex in a feature's geometry (ST_SetPoint).
    Reprojects the input WGS84 point into the site's storage SRID
    on the way in. Returns the mutated feature's GeoJSON for the
    editor to refresh its local copy."""
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(404, f"Site '{slug}' not found")
    try:
        fid = uuid.UUID(feature_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid feature id") from e

    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        raise HTTPException(400, "vertex update requires PostGIS")

    # Build the new vertex point in WGS84, reproject to storage SRID.
    z_clause = f", {body.alt}" if body.alt is not None else ""
    new_point_wkt = f"POINT({body.lon} {body.lat}{z_clause})"

    # ST_SetPoint takes a 0-based index and a point geometry; the geom is
    # mutated in-place. No-op for index out of range — surface that as 400.
    try:
        result = db.execute(
            text(
                """
                UPDATE features
                SET geom = ST_SetPoint(
                    geom,
                    :idx,
                    ST_Transform(ST_SetSRID(ST_GeomFromText(:wkt), 4326), :srid)
                )
                WHERE id = :fid AND site_id = :sid
                RETURNING id::text, ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geom,
                          properties::jsonb AS properties
                """
            ),
            {
                "fid": str(fid),
                "sid": str(site.id),
                "idx": body.vertex_index,
                "wkt": new_point_wkt,
                "srid": int(site.storage_srid),
            },
        ).first()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"vertex update failed: {e}") from e

    if result is None:
        raise HTTPException(404, "Feature not found")

    db.commit()
    return {
        "id": result.id,
        "geometry": result.geom,
        "properties": result.properties if isinstance(result.properties, dict) else {},
    }
