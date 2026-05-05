"""Bulk feature import — T+1390.

Upload a GeoJSON or CSV directly into a layer's features. Reuses the
dialect-aware insert path from feature_routes (PostGIS / SpatiaLite)
so the same byte-level guarantees apply.

Endpoint:

    POST /api/spatial/sites/{slug}/layers/{id}/import-features
        multipart:
            file              .geojson | .json | .csv
            source_srid       int (default 4326 for geojson, required
                              for CSV when not 4326)
            replace_existing  bool (default false)
            lng_column        str (CSV-only; auto-detected if absent)
            lat_column        str (CSV-only; auto-detected if absent)
            wkt_column        str (CSV-only; alternative to lng/lat)

Response:

    { "inserted": int, "skipped": int }

Skipped covers rows / features whose geometry can't be resolved
(missing columns, malformed WKT, non-numeric coords). The endpoint
logs the first few skip reasons in the response under ``skip_reasons``
so the UI can surface them.
"""

from __future__ import annotations

import csv
import io
import json
import re
import uuid
from typing import Any, Iterable

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import select, text

from mighty_models import Layer, Site

from .auth import AdminUser
from .db import DbSession

router = APIRouter(prefix="/api/spatial", tags=["features"])

#: Heuristic — names we'll auto-detect as longitude / latitude columns.
LON_NAMES = {"longitude", "lon", "long", "lng", "x"}
LAT_NAMES = {"latitude", "lat", "y"}
WKT_RE = re.compile(
    r"^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?\s*\)\s*$",
    re.IGNORECASE,
)


@router.post("/sites/{slug}/layers/{layer_id}/import-features")
async def import_features(
    slug: str,
    layer_id: str,
    _: AdminUser,
    db: DbSession,
    file: UploadFile = File(...),
    source_srid: int = Form(4326),
    replace_existing: bool = Form(False),
    lng_column: str | None = Form(None),
    lat_column: str | None = Form(None),
    wkt_column: str | None = Form(None),
) -> dict[str, Any]:
    site = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if site is None:
        raise HTTPException(status_code=404, detail=f"Site {slug!r} not found")
    layer = db.execute(
        select(Layer).where(Layer.id == uuid.UUID(layer_id), Layer.site_id == site.id)
    ).scalar_one_or_none()
    if layer is None:
        raise HTTPException(status_code=404, detail="Layer not found in site")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")

    fname = (file.filename or "").lower()
    if fname.endswith((".geojson", ".json")):
        rows = _iter_geojson(raw)
        # GeoJSON spec is always WGS84 unless a CRS is set. Accept
        # source_srid override when the file has projected coords.
    elif fname.endswith(".csv"):
        rows = _iter_csv(
            raw,
            lng_column=lng_column,
            lat_column=lat_column,
            wkt_column=wkt_column,
        )
    else:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type {fname!r}; expected .geojson, .json, or .csv",
        )

    if replace_existing:
        db.execute(
            text("DELETE FROM features WHERE site_id = :sid AND layer_id = :lid"),
            {"sid": str(site.id), "lid": str(layer.id)},
        )

    inserted, skipped, reasons = _insert_rows(
        db,
        site_id=site.id,
        layer_id=layer.id,
        source_srid=source_srid,
        storage_srid=site.storage_srid,
        rows=rows,
    )
    db.commit()
    return {
        "inserted": inserted,
        "skipped": skipped,
        "skip_reasons": reasons[:5],
    }


# ── Iterators ───────────────────────────────────────────────────────────


def _iter_geojson(raw: bytes) -> Iterable[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON: {e}") from e
    typ = data.get("type")
    if typ == "FeatureCollection":
        for f in data.get("features") or []:
            yield {
                "geometry": f.get("geometry"),
                "properties": f.get("properties") or {},
            }
    elif typ == "Feature":
        yield {
            "geometry": data.get("geometry"),
            "properties": data.get("properties") or {},
        }
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Expected GeoJSON FeatureCollection or Feature, got {typ!r}",
        )


def _iter_csv(
    raw: bytes,
    *,
    lng_column: str | None,
    lat_column: str | None,
    wkt_column: str | None,
) -> Iterable[dict[str, Any]]:
    text_payload = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text_payload))
    if reader.fieldnames is None:
        return
    fields_lower = {f.lower(): f for f in reader.fieldnames}
    detected_lng = lng_column or _detect_column(fields_lower, LON_NAMES)
    detected_lat = lat_column or _detect_column(fields_lower, LAT_NAMES)
    if not wkt_column and not (detected_lng and detected_lat):
        # Fall back to literal "wkt" or "geometry" column.
        wkt_column = fields_lower.get("wkt") or fields_lower.get("geometry")
    for row in reader:
        properties = {k: _coerce(v) for k, v in row.items() if k}
        geometry: dict[str, Any] | None = None
        if wkt_column and isinstance(row.get(wkt_column), str):
            geometry = _wkt_point(row[wkt_column])
        elif detected_lng and detected_lat:
            try:
                lng = float(row[detected_lng])
                lat = float(row[detected_lat])
                geometry = {"type": "Point", "coordinates": [lng, lat]}
            except (TypeError, ValueError):
                geometry = None
        yield {"geometry": geometry, "properties": properties}


def _detect_column(fields_lower: dict[str, str], candidates: set[str]) -> str | None:
    for c in candidates:
        if c in fields_lower:
            return fields_lower[c]
    return None


def _wkt_point(s: str) -> dict[str, Any] | None:
    m = WKT_RE.match(s)
    if not m:
        return None
    try:
        return {
            "type": "Point",
            "coordinates": [float(m.group(1)), float(m.group(2))],
        }
    except (TypeError, ValueError):
        return None


def _coerce(raw: Any) -> Any:
    if not isinstance(raw, str):
        return raw
    s = raw.strip()
    if s == "":
        return None
    lower = s.lower()
    if lower in {"true", "yes"}:
        return True
    if lower in {"false", "no"}:
        return False
    if lower in {"null", "n/a", "na", "none"}:
        return None
    if s.startswith("0") and len(s) > 1 and not s.startswith("0."):
        return s
    try:
        if "." in s or "e" in lower:
            return float(s)
        return int(s)
    except ValueError:
        return s


# ── Insert path ─────────────────────────────────────────────────────────


def _insert_rows(
    db: DbSession,
    *,
    site_id: uuid.UUID,
    layer_id: uuid.UUID,
    source_srid: int,
    storage_srid: int,
    rows: Iterable[dict[str, Any]],
) -> tuple[int, int, list[str]]:
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    if is_postgis:
        stmt = text(
            """
            INSERT INTO features (id, site_id, layer_id, geom, properties)
            VALUES (
                :id, :site_id, :layer_id,
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
                :id, :site_id, :layer_id,
                Transform(SetSRID(GeomFromGeoJSON(:geojson), :source_srid), :storage_srid),
                :properties
            )
            """
        )
    inserted = 0
    skipped = 0
    reasons: list[str] = []
    for row in rows:
        geom = row.get("geometry")
        if not isinstance(geom, dict) or "type" not in geom or "coordinates" not in geom:
            skipped += 1
            if len(reasons) < 5:
                reasons.append("missing or malformed geometry")
            continue
        # 3D coords supported on PostGIS; for safety with planar SRIDs
        # strip Z so ST_GeomFromGeoJSON doesn't blow up.
        geom2d = _strip_z(geom)
        properties = row.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        db.execute(
            stmt,
            {
                "id": str(uuid.uuid4()),
                "site_id": str(site_id),
                "layer_id": str(layer_id),
                "geojson": json.dumps(geom2d),
                "source_srid": source_srid,
                "storage_srid": storage_srid,
                "properties": json.dumps(properties),
            },
        )
        inserted += 1
    return inserted, skipped, reasons


def _strip_z(geom: dict[str, Any]) -> dict[str, Any]:
    def drop(c: Any) -> Any:
        if isinstance(c, list) and len(c) >= 2 and isinstance(c[0], (int, float)):
            return [c[0], c[1]]
        if isinstance(c, list):
            return [drop(x) for x in c]
        return c

    return {"type": geom.get("type"), "coordinates": drop(geom.get("coordinates"))}
