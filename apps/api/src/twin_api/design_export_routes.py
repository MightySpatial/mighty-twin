"""Design widget export — port of MightyDT v1 ``app/modules/design_export``.

Accepts a GeoJSON FeatureCollection (already serialized by the React
DownloadPanel) and returns a downloadable file in the requested format
+ CRS. Mirrors v1's contract one-for-one so the frontend sends the same
shape to either backend.

Formats:
    geojson     — pure-Python, always available.
    csv         — pure-Python (shapely WKT), always available.
    shapefile   — geopandas, returned as a zip (multi-file format).
    kml         — fiona/pyproj, single-file XML.
    geopackage  — geopandas single-file SQLite.
    dxf         — ezdxf, CAD interchange.

Out of scope: IFC. v1's design_export didn't ship IFC export either —
the v1 frontend showed it in the dropdown but the route returned a
501; the v2 frontend now omits it.
"""

from __future__ import annotations

import csv
import io
import json
import os
import tempfile
import zipfile
from io import BytesIO, StringIO
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/design", tags=["design-export"])


# ── CRS catalogue (mirrors v1's CRS_PRESETS) ─────────────────────────────

CRS_PRESETS: list[dict[str, Any]] = [
    {"epsg": 4326, "name": "WGS 84 (EPSG:4326)"},
    {"epsg": 3857, "name": "Web Mercator (EPSG:3857)"},
    {"epsg": 4283, "name": "GDA94 (EPSG:4283)"},
    {"epsg": 7844, "name": "GDA2020 (EPSG:7844)"},
    *[
        {"epsg": 7849 + i, "name": f"GDA2020 / MGA Zone {49 + i} (EPSG:{7849 + i})"}
        for i in range(8)
    ],
    *[
        {"epsg": 28349 + i, "name": f"GDA94 / MGA Zone {49 + i} (EPSG:{28349 + i})"}
        for i in range(8)
    ],
    {"epsg": 2193, "name": "NZTM (EPSG:2193)"},
]


@router.get("/export/crs-options")
def get_crs_options() -> dict[str, Any]:
    """Available CRS presets for the export modal — mirrors v1."""
    return {"presets": CRS_PRESETS}


# ── Request / response shape ──────────────────────────────────────────────


class FeatureCollectionIn(BaseModel):
    """Input GeoJSON-shaped FeatureCollection. We accept either a real
    FeatureCollection or v1's ``positions``-array shape (translated by
    `_normalise_features`)."""

    type: str | None = None
    features: list[dict[str, Any]]


class ExportRequest(BaseModel):
    feature_collection: FeatureCollectionIn = Field(
        ...,
        description="GeoJSON FeatureCollection of features to export. "
                    "Geometries assumed to be in EPSG:4326.",
    )
    format: str = Field(
        ...,
        pattern="^(geojson|csv|shapefile|kml|geopackage|dxf)$",
        description="Output format identifier.",
    )
    target_epsg: int = Field(
        4326,
        description="EPSG SRID to reproject features into before export.",
    )
    filename: str = Field(
        "mighty-twin-design",
        max_length=128,
        description="Base filename (no extension) for the downloaded file.",
    )


# ── Geometry / CRS helpers ────────────────────────────────────────────────


def _normalise_features(features: list[dict[str, Any]]) -> dict[str, Any]:
    """Coerce input features into a standard GeoJSON FeatureCollection.

    Accepts either:
        • a Standard GeoJSON Feature ({type, geometry, properties}); or
        • v1's node-style ({geometryType, positions, attributes}).
    """
    out: list[dict[str, Any]] = []
    for f in features:
        # Already a GeoJSON Feature — keep as-is.
        if f.get("type") == "Feature" and f.get("geometry"):
            out.append(f)
            continue

        # v1 node-style fallback. ``geometryType`` distinguishes from GeoJSON.
        positions = f.get("positions") or []
        geom_type = f.get("geometryType") or f.get("geometry") or "point"
        attrs = {**(f.get("attributes") or {})}
        if f.get("name"):
            attrs["name"] = f["name"]
        if not positions:
            continue
        if geom_type == "point":
            pos = positions[0] if isinstance(positions[0], list) else positions
            coords = [pos[0], pos[1], pos[2] if len(pos) > 2 else 0]
            geometry = {"type": "Point", "coordinates": coords}
        elif geom_type in ("polyline", "linestring") and len(positions) >= 2:
            coords = [
                [p[0], p[1], p[2] if len(p) > 2 else 0] for p in positions
            ]
            geometry = {"type": "LineString", "coordinates": coords}
        elif geom_type == "polygon" and len(positions) >= 3:
            coords = [
                [p[0], p[1], p[2] if len(p) > 2 else 0] for p in positions
            ]
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            geometry = {"type": "Polygon", "coordinates": [coords]}
        else:
            continue

        clean_attrs = {k: v for k, v in attrs.items() if not k.startswith("_")}
        out.append({"type": "Feature", "geometry": geometry, "properties": clean_attrs})

    return {"type": "FeatureCollection", "features": out}


def _reproject(fc: dict[str, Any], source_epsg: int, target_epsg: int) -> dict[str, Any]:
    """Reproject a GeoJSON FeatureCollection. No-op when source == target."""
    if source_epsg == target_epsg:
        return fc
    from pyproj import Transformer  # local — heavy import

    tx = Transformer.from_crs(f"EPSG:{source_epsg}", f"EPSG:{target_epsg}", always_xy=True)

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

    new_features = []
    for f in fc.get("features", []):
        g = f.get("geometry") or {}
        new_features.append({
            **f,
            "geometry": {**g, "coordinates": xform(g.get("coordinates", []), g.get("type", ""))},
        })
    return {"type": "FeatureCollection", "features": new_features}


def _geojson_to_csv(fc: dict[str, Any]) -> str:
    """GeoJSON FC → CSV with WKT geometry column."""
    from shapely.geometry import shape

    features = fc.get("features", [])
    if not features:
        return ""
    keys: set[str] = set()
    for f in features:
        keys.update((f.get("properties") or {}).keys())
    cols = sorted(keys)

    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(["geometry_wkt", *cols])
    for f in features:
        try:
            wkt = shape(f["geometry"]).wkt
        except Exception:
            wkt = ""
        props = f.get("properties") or {}
        writer.writerow([wkt, *[props.get(k, "") for k in cols]])
    return out.getvalue()


# ── Format handlers ──────────────────────────────────────────────────────


def _stream(content: bytes, media_type: str, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _export_geojson(fc: dict[str, Any], filename: str) -> StreamingResponse:
    return _stream(
        json.dumps(fc, indent=2).encode("utf-8"),
        "application/geo+json",
        f"{filename}.geojson",
    )


def _export_csv(fc: dict[str, Any], filename: str) -> StreamingResponse:
    return _stream(
        _geojson_to_csv(fc).encode("utf-8"),
        "text/csv",
        f"{filename}.csv",
    )


def _export_shapefile(fc: dict[str, Any], filename: str, target_epsg: int) -> StreamingResponse:
    """Shapefile is multi-file — group by geometry type, zip the lot."""
    import geopandas as gpd

    if not fc.get("features"):
        raise HTTPException(400, "No features to export.")
    gdf = gpd.GeoDataFrame.from_features(fc["features"])
    gdf.set_crs(epsg=target_epsg, inplace=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        groups: dict[str, list] = {}
        for _, row in gdf.iterrows():
            gt = row.geometry.geom_type if row.geometry is not None else "Unknown"
            groups.setdefault(gt, []).append(row)

        buf = BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for gt, rows in groups.items():
                sub = gpd.GeoDataFrame(rows, crs=gdf.crs)
                sub_path = os.path.join(tmpdir, f"{filename}_{gt}")
                sub.to_file(sub_path, driver="ESRI Shapefile")
                for sib in Path(sub_path).parent.glob(f"{filename}_{gt}*"):
                    zf.write(sib, sib.name)
        buf.seek(0)
        return _stream(buf.read(), "application/zip", f"{filename}.zip")


def _export_kml(fc: dict[str, Any], filename: str, target_epsg: int) -> StreamingResponse:
    import fiona  # type: ignore[import-not-found]
    import geopandas as gpd

    fiona.drvsupport.supported_drivers["KML"] = "rw"
    if not fc.get("features"):
        raise HTTPException(400, "No features to export.")
    gdf = gpd.GeoDataFrame.from_features(fc["features"])
    gdf.set_crs(epsg=target_epsg, inplace=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, f"{filename}.kml")
        gdf.to_file(out_path, driver="KML")
        with open(out_path, "rb") as fh:
            content = fh.read()
    return _stream(content, "application/vnd.google-earth.kml+xml", f"{filename}.kml")


def _export_geopackage(fc: dict[str, Any], filename: str, target_epsg: int) -> StreamingResponse:
    import geopandas as gpd

    if not fc.get("features"):
        raise HTTPException(400, "No features to export.")
    gdf = gpd.GeoDataFrame.from_features(fc["features"])
    gdf.set_crs(epsg=target_epsg, inplace=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = os.path.join(tmpdir, f"{filename}.gpkg")
        gdf.to_file(out_path, driver="GPKG")
        with open(out_path, "rb") as fh:
            content = fh.read()
    return _stream(content, "application/geopackage+sqlite3", f"{filename}.gpkg")


def _export_dxf(fc: dict[str, Any], filename: str) -> StreamingResponse:
    import ezdxf

    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    for f in fc.get("features", []):
        geom = f.get("geometry") or {}
        gt = geom.get("type", "")
        coords = geom.get("coordinates", [])
        layer = ((f.get("properties") or {}).get("layer")) or "0"
        if layer not in doc.layers:
            doc.layers.add(layer)

        if gt == "Point" and coords:
            msp.add_point(coords[:3], dxfattribs={"layer": layer})
        elif gt == "LineString" and len(coords) >= 2:
            pts = [c[:3] for c in coords]
            msp.add_lwpolyline(pts, dxfattribs={"layer": layer})
        elif gt == "Polygon" and coords:
            ring = coords[0]
            pts = [c[:3] for c in ring]
            if pts and pts[0] == pts[-1]:
                pts = pts[:-1]
            poly = msp.add_lwpolyline(pts, dxfattribs={"layer": layer})
            poly.close()

    # ezdxf 1.x writes to a text stream; route through StringIO then encode.
    text_buf = io.StringIO()
    doc.write(text_buf)
    return _stream(
        text_buf.getvalue().encode("utf-8"),
        "application/dxf",
        f"{filename}.dxf",
    )


# ── Route ────────────────────────────────────────────────────────────────


@router.post("/export")
def export_design(body: ExportRequest) -> StreamingResponse:
    """Export a FeatureCollection in the requested format + CRS.

    The frontend serializes its sketch features client-side (already in
    EPSG:4326 GeoJSON) and POSTs them here for formats that need a server
    library (Shapefile, KML, GeoPackage, DXF). GeoJSON and CSV land here
    too so a single request shape covers every format.
    """
    fmt = body.format.lower()
    if not body.feature_collection.features:
        raise HTTPException(400, "No features to export.")

    fc = _normalise_features(body.feature_collection.features)
    if not fc.get("features"):
        raise HTTPException(400, "No exportable geometries in payload.")

    if body.target_epsg != 4326:
        fc = _reproject(fc, 4326, body.target_epsg)

    fname = body.filename or "mighty-twin-design"

    if fmt == "geojson":
        return _export_geojson(fc, fname)
    if fmt == "csv":
        return _export_csv(fc, fname)
    if fmt == "shapefile":
        return _export_shapefile(fc, fname, body.target_epsg)
    if fmt == "kml":
        return _export_kml(fc, fname, body.target_epsg)
    if fmt == "geopackage":
        return _export_geopackage(fc, fname, body.target_epsg)
    if fmt == "dxf":
        return _export_dxf(fc, fname)

    # Pydantic validator should have caught this, but be explicit.
    raise HTTPException(400, f"Unsupported export format: {fmt}")
