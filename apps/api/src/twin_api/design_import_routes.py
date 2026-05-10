"""Design widget import — port of MightyDT v1 ``app/modules/design_import``.

Accepts a multipart upload (geojson / shp.zip / gpkg / kml / kmz / dxf /
csv / tsv), parses it through fiona+pyproj+ezdxf, and returns a preview
payload the Design widget renders before the user commits the import:

  {
    filename:       'site.kml',
    extension:      'kml',
    crs_detected:   'EPSG:4326',
    crs_epsg:       4326,
    feature_count:  142,
    geometry_counts:{ point: 12, line: 23, polygon: 107 },
    field_schema:   ['name', 'type', 'install_year'],
    features:       [ { type:'Feature', geometry:..., properties:... }, ... ]
  }

The frontend keeps the parsed FeatureCollection in memory; on commit it
either creates a new SketchLayer + features or routes the features
through the redline workflow. Spec §7 import side.

Notes:
  • Coordinates always returned in WGS84 (4326). When the source carries
    a different CRS, we reproject via pyproj before serialising.
  • CSV auto-detects lon/lat (and optional alt) columns from a small
    alias list — keeps the widget's "drag CSV onto globe" flow working
    without the user wiring columns each time.
  • DXF parses the v1 set: POINT / LINE / LWPOLYLINE / POLYLINE /
    CIRCLE (interpolated to 64 points) / ARC (5° increments) / SPLINE
    (flattened control polyline). preserves properties.layer.
  • KMZ extracts the first .kml inside the archive and reuses the KML
    path. Shapefile zips also extract to a temp dir before parsing.
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/api/design", tags=["design-import"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


# ── Dispatch ─────────────────────────────────────────────────────────────


@router.post("/import")
async def import_design(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)")

    name = file.filename
    ext = Path(name).suffix.lower().lstrip(".")
    if ext == "json":
        ext = "geojson"

    try:
        if ext == "geojson":
            features, source_crs = _parse_geojson(raw)
        elif ext == "csv" or ext == "tsv":
            features, source_crs = _parse_csv(raw, sep="\t" if ext == "tsv" else ",")
        elif ext == "kml":
            features, source_crs = _parse_kml(raw)
        elif ext == "kmz":
            features, source_crs = _parse_kmz(raw)
        elif ext == "dxf":
            features, source_crs = _parse_dxf(raw)
        elif ext in ("zip",):  # shapefile zip
            features, source_crs = _parse_shapefile_zip(raw)
        elif ext == "gpkg":
            features, source_crs = _parse_geopackage(raw)
        else:
            raise HTTPException(415, f"Unsupported file extension: {ext!r}")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001 — surface parser errors to the client
        raise HTTPException(400, f"Could not parse {ext.upper()}: {e}") from e

    # Reproject to 4326 if the source carried a non-4326 CRS.
    target_features, crs_used = _ensure_wgs84(features, source_crs)

    return {
        "filename": name,
        "extension": ext,
        "crs_detected": crs_used.get("label", "EPSG:4326"),
        "crs_epsg": crs_used.get("epsg", 4326),
        "feature_count": len(target_features),
        "geometry_counts": _count_geometries(target_features),
        "field_schema": _collect_fields(target_features),
        "features": target_features,
    }


# ── Parsers ──────────────────────────────────────────────────────────────


def _parse_geojson(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    data = json.loads(raw.decode("utf-8"))
    if data.get("type") == "FeatureCollection":
        feats = list(data.get("features") or [])
    elif data.get("type") == "Feature":
        feats = [data]
    elif "type" in data and "coordinates" in data:
        feats = [{"type": "Feature", "geometry": data, "properties": {}}]
    else:
        raise ValueError("Not a GeoJSON FeatureCollection / Feature / Geometry")
    return feats, {"epsg": 4326, "label": "EPSG:4326"}


def _parse_csv(raw: bytes, *, sep: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)
    rows = list(reader)
    if not rows:
        return [], {"epsg": 4326, "label": "EPSG:4326"}

    # Auto-detect lon / lat / alt columns. Mirrors v1's alias list.
    lon_aliases = ("lon", "longitude", "lng", "x", "easting", "e")
    lat_aliases = ("lat", "latitude", "y", "northing", "n")
    alt_aliases = ("alt", "altitude", "elev", "elevation", "z", "height")
    cols = {c.lower(): c for c in rows[0].keys()}
    lon_col = next((cols[a] for a in lon_aliases if a in cols), None)
    lat_col = next((cols[a] for a in lat_aliases if a in cols), None)
    alt_col = next((cols[a] for a in alt_aliases if a in cols), None)
    if not lon_col or not lat_col:
        raise ValueError(
            f"CSV needs lon/lat columns — couldn't find any of "
            f"{lon_aliases} or {lat_aliases} in {list(cols.values())[:8]}"
        )

    feats: list[dict[str, Any]] = []
    for row in rows:
        try:
            lon = float(row[lon_col])
            lat = float(row[lat_col])
        except (ValueError, TypeError):
            continue
        coords: list[float] = [lon, lat]
        if alt_col and row.get(alt_col):
            try:
                coords.append(float(row[alt_col]))
            except (ValueError, TypeError):
                pass
        properties = {k: v for k, v in row.items() if k not in {lon_col, lat_col, alt_col}}
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coords},
            "properties": properties,
        })
    return feats, {"epsg": 4326, "label": "EPSG:4326"}


def _parse_kml(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return _parse_via_fiona(raw, suffix=".kml", driver="KML")


def _parse_kmz(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        kml_name = next(
            (n for n in zf.namelist() if n.lower().endswith(".kml")),
            None,
        )
        if not kml_name:
            raise ValueError("KMZ archive contains no .kml file")
        kml_bytes = zf.read(kml_name)
    return _parse_kml(kml_bytes)


def _parse_shapefile_zip(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            zf.extractall(tmp)
        shp = next(
            (
                os.path.join(root, f)
                for root, _, files in os.walk(tmp)
                for f in files
                if f.lower().endswith(".shp")
            ),
            None,
        )
        if not shp:
            raise ValueError("Zip contains no .shp file")
        return _parse_via_fiona(Path(shp).read_bytes(), suffix=".shp", driver="ESRI Shapefile", file_path=shp)


def _parse_geopackage(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return _parse_via_fiona(raw, suffix=".gpkg", driver="GPKG")


def _parse_via_fiona(
    raw: bytes,
    *,
    suffix: str,
    driver: str | None,
    file_path: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Common driver wrapper. KML needs the rw flag toggled in fiona's
    drvsupport since OGR builds it as read-only by default."""
    import fiona  # noqa: PLC0415 — heavy import deferred until first use
    fiona.drvsupport.supported_drivers["KML"] = "rw"

    if file_path is None:
        # Materialise the upload to disk because fiona's open() insists on a
        # path (the BytesCollection helper exists but doesn't cover all the
        # drivers we need).
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
            tf.write(raw)
            tf.flush()
            file_path = tf.name
            cleanup = True
    else:
        cleanup = False

    try:
        with fiona.open(file_path, driver=driver) as src:
            crs_label = src.crs.get("init", "EPSG:4326") if src.crs else "EPSG:4326"
            epsg = _epsg_from_crs(src.crs)
            feats: list[dict[str, Any]] = []
            for f in src:
                geom = f["geometry"] if "geometry" in f else f.geometry
                props = dict(f["properties"] if "properties" in f else f.properties)
                feats.append({
                    "type": "Feature",
                    "geometry": dict(geom) if geom else None,
                    "properties": props,
                })
        return feats, {"epsg": epsg, "label": crs_label}
    finally:
        if cleanup:
            try:
                os.unlink(file_path)
            except OSError:
                pass


def _parse_dxf(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    import ezdxf  # noqa: PLC0415

    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as tf:
        tf.write(raw)
        tf.flush()
        path = tf.name

    try:
        doc = ezdxf.readfile(path)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    msp = doc.modelspace()
    feats: list[dict[str, Any]] = []
    for entity in msp:
        et = entity.dxftype()
        layer = entity.dxf.layer if hasattr(entity.dxf, "layer") else "0"
        props = {"layer": layer}

        if et == "POINT":
            p = entity.dxf.location
            feats.append(_feat({"type": "Point", "coordinates": [p.x, p.y, p.z]}, props))
        elif et == "LINE":
            a = entity.dxf.start
            b = entity.dxf.end
            feats.append(_feat({"type": "LineString", "coordinates": [
                [a.x, a.y, a.z], [b.x, b.y, b.z],
            ]}, props))
        elif et == "LWPOLYLINE":
            pts = [[v[0], v[1], 0.0] for v in entity.get_points()]
            geom_type = "Polygon" if entity.closed and len(pts) >= 3 else "LineString"
            if geom_type == "Polygon":
                if pts[0] != pts[-1]:
                    pts.append(pts[0])
                feats.append(_feat({"type": "Polygon", "coordinates": [pts]}, props))
            else:
                feats.append(_feat({"type": "LineString", "coordinates": pts}, props))
        elif et == "POLYLINE":
            pts = [[v.dxf.location.x, v.dxf.location.y, v.dxf.location.z] for v in entity.vertices]
            feats.append(_feat({"type": "LineString", "coordinates": pts}, props))
        elif et == "CIRCLE":
            cx, cy = entity.dxf.center.x, entity.dxf.center.y
            r = entity.dxf.radius
            n = 64
            ring = [[cx + r * math.cos(2 * math.pi * i / n),
                     cy + r * math.sin(2 * math.pi * i / n), 0.0] for i in range(n)]
            ring.append(ring[0])
            feats.append(_feat({"type": "Polygon", "coordinates": [ring]}, props))
        elif et == "ARC":
            cx, cy = entity.dxf.center.x, entity.dxf.center.y
            r = entity.dxf.radius
            a0 = math.radians(entity.dxf.start_angle)
            a1 = math.radians(entity.dxf.end_angle)
            if a1 < a0:
                a1 += 2 * math.pi
            step = math.radians(5)
            n = max(2, int(math.ceil((a1 - a0) / step)))
            pts = []
            for i in range(n + 1):
                a = a0 + (a1 - a0) * (i / n)
                pts.append([cx + r * math.cos(a), cy + r * math.sin(a), 0.0])
            feats.append(_feat({"type": "LineString", "coordinates": pts}, props))
        elif et == "SPLINE":
            try:
                pts = [[p.x, p.y, p.z] for p in entity.flattening(0.05)]
            except Exception:  # noqa: BLE001
                pts = [[p[0], p[1], p[2] if len(p) > 2 else 0.0] for p in entity.control_points]
            if pts:
                feats.append(_feat({"type": "LineString", "coordinates": pts}, props))
        # Unknown entity types are silently dropped — the v1 parser does
        # the same.

    # DXF has no CRS metadata. Caller can change crs_epsg on the preview
    # if they know.
    return feats, {"epsg": None, "label": "Unknown (DXF)"}


# ── Helpers ──────────────────────────────────────────────────────────────


def _feat(geom: dict[str, Any], props: dict[str, Any]) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geom, "properties": props}


def _epsg_from_crs(crs: Any) -> int | None:
    if not crs:
        return None
    init = crs.get("init") if isinstance(crs, dict) else None
    if init and init.upper().startswith("EPSG:"):
        try:
            return int(init.split(":", 1)[1])
        except ValueError:
            return None
    # Newer fiona reports CRS as {'$schema':...} — try pyproj.CRS to extract.
    try:
        from pyproj import CRS  # noqa: PLC0415
        c = CRS.from_user_input(crs)
        epsg = c.to_epsg()
        return epsg
    except Exception:  # noqa: BLE001
        return None


def _ensure_wgs84(
    features: list[dict[str, Any]],
    source_crs: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Reproject to 4326 if needed. No-op when source is already WGS84
    or when the CRS is unknown (caller treats as WGS84 with a warning)."""
    epsg = source_crs.get("epsg")
    if epsg is None or epsg == 4326:
        return features, source_crs
    try:
        from pyproj import Transformer  # noqa: PLC0415
        tx = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    except Exception:  # noqa: BLE001
        return features, source_crs

    def xform(coords: Any, geom_type: str) -> Any:
        if geom_type == "Point":
            x, y = tx.transform(coords[0], coords[1])
            return [x, y, coords[2] if len(coords) > 2 else 0]
        if geom_type in ("LineString", "MultiPoint"):
            return [xform(c, "Point") for c in coords]
        if geom_type in ("Polygon", "MultiLineString"):
            return [xform(r, "LineString") for r in coords]
        if geom_type == "MultiPolygon":
            return [xform(p, "Polygon") for p in coords]
        return coords

    out = []
    for f in features:
        g = f.get("geometry") or {}
        if g and "coordinates" in g and "type" in g:
            f = {**f, "geometry": {**g, "coordinates": xform(g["coordinates"], g["type"])}}
        out.append(f)
    return out, {"epsg": 4326, "label": f"reprojected from EPSG:{epsg}"}


def _count_geometries(features: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for f in features:
        g = (f.get("geometry") or {}).get("type", "Unknown")
        counts[g] = counts.get(g, 0) + 1
    return counts


def _collect_fields(features: list[dict[str, Any]]) -> list[str]:
    fields: set[str] = set()
    for f in features:
        props = f.get("properties") or {}
        if isinstance(props, dict):
            fields.update(props.keys())
    return sorted(fields)
