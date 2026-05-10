"""Voxel layers — Design widget v2 voxel storage + voxelisation pipelines.

CRUD over the ``voxel_layers`` Postgres table + the .esv JSON blobs that
sit alongside each row in object/file storage. Plus three pipelines:

  * **Terrain mask** — voxelise a polygon footprint into ground blocks.
    Pass-1 uses a flat-terrain fallback at the layer's datum altitude;
    a real DEM-backed sampler lands once the elevation/GDAL deps are in
    the API image.
  * **Arnis import** — Minecraft → voxel block stream from OSM data.
    Stubbed to 501 in pass-1; needs the Rust ``arnis`` binary plus
    ``anvil-parser`` in the runtime image (Dockerfile work).
  * **IFC export** — voxel layer → IFC file. Stubbed to 501 in pass-1;
    needs ``ifcopenshell`` in the runtime image.

Storage layout — file-system in dev, S3-ready by env var:
    TWIN_VOXEL_LAYERS_DIR  (default /tmp/twin-voxel-layers)
        voxel-layer-{id}.json        -- block_count <= 1000
        voxel-layer-{id}.json.gz     -- block_count >  1000

The Postgres row is the system of record for listings (name, scope,
datum, block_count) so the listing endpoints never need to touch the
.esv blob.
"""

from __future__ import annotations

import gzip
import json
import math
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from shapely.geometry import Polygon, box
from sqlalchemy import select

from mighty_models import VoxelLayer

from .auth import CurrentUser
from .db import DbSession

router = APIRouter(prefix="/api/sites", tags=["voxel-layers"])

VOXEL_DIR = Path(os.environ.get("TWIN_VOXEL_LAYERS_DIR", "/tmp/twin-voxel-layers"))
VOXEL_DIR.mkdir(parents=True, exist_ok=True)

#: Threshold above which the .esv is gzipped on disk.
GZIP_THRESHOLD = 1000

#: Voxel level → block size (metres). level 0 = baseLevelSize; each step
#: doubles. Mirrors the frontend's ``baseLevelSize: 0.125`` so level 3 == 1m.
BASE_LEVEL_SIZE_M = 0.125

#: Minecraft block → our voxel block ``type``. Used by the Arnis pipeline
#: once it's wired up; kept here so the mapping is in one place.
MINECRAFT_TO_VOXEL = {
    "minecraft:stone": "rock",
    "minecraft:grass_block": "topsoil",
    "minecraft:dirt": "terrain",
    "minecraft:water": "water",
    "minecraft:gravel": "overburden",
    "minecraft:iron_ore": "ore",
    "minecraft:gold_ore": "ore",
}

#: Voxel block ``type`` → IFC class for the IFC export. Used by the
#: ifcopenshell-backed exporter once it's wired up.
IFC_CLASS = {
    "rock": "IfcGeographicElement",
    "terrain": "IfcGeographicElement",
    "topsoil": "IfcGeographicElement",
    "overburden": "IfcGeographicElement",
    "ore": "IfcGeographicElement",
    "water": "IfcSpace",
    "concrete": "IfcWall",
    "steel": "IfcBeam",
}


# ── Schemas ──────────────────────────────────────────────────────────────


class Datum(BaseModel):
    lon: float = 0.0
    lat: float = 0.0
    alt: float = 0.0


class Generator(BaseModel):
    id: str
    type: str
    params: dict[str, Any] = Field(default_factory=dict)
    materialType: str = ""
    level: int = 0


class CreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    scope: str = Field(..., pattern=r"^(site|sketch)$")
    datum: Datum = Field(default_factory=Datum)
    generators: list[Generator] | None = None


class UpdateBody(BaseModel):
    """Full-replacement body — exactly the .esv schema. The server
    overwrites ``layerId`` / ``scope`` to match the URL + DB row, ignoring
    whatever the client sends for those fields."""

    version: int = 1
    layerId: str | None = None
    scope: str | None = None
    datum: Datum
    baseLevelSize: float = BASE_LEVEL_SIZE_M
    generators: list[Generator] = Field(default_factory=list)
    blocks: list[dict[str, Any]] = Field(default_factory=list)


class TerrainMaskBody(BaseModel):
    polygon: list[list[float]] = Field(..., min_length=3)
    level: int = Field(3, ge=0, le=8)
    depth_below_surface: int = Field(2, ge=0, le=64)
    scope: str = Field(..., pattern=r"^(site|sketch)$")


class ArnisBbox(BaseModel):
    north: float
    south: float
    east: float
    west: float


class ArnisImportBody(BaseModel):
    bbox: ArnisBbox
    layer_name: str = Field(..., min_length=1, max_length=255)
    scope: str = Field(..., pattern=r"^(site|sketch)$")


# ── Storage helpers ──────────────────────────────────────────────────────


def _blob_paths(layer_id: uuid.UUID) -> tuple[Path, Path]:
    """Return (plain, gzipped) candidate paths for the .esv blob."""
    base = VOXEL_DIR / f"voxel-layer-{layer_id}.json"
    return base, base.with_suffix(".json.gz")


def _read_esv(layer_id: uuid.UUID) -> dict[str, Any] | None:
    plain, gz = _blob_paths(layer_id)
    if gz.exists():
        with gzip.open(gz, "rt", encoding="utf-8") as f:
            return json.load(f)
    if plain.exists():
        with plain.open("r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _write_esv(layer_id: uuid.UUID, esv: dict[str, Any]) -> int:
    """Persist .esv JSON. Returns the block count for the caller to mirror
    into the DB row. Removes the alternate-extension stale file when the
    chosen format flips between gz/plain."""
    block_count = len(esv.get("blocks", []))
    plain, gz = _blob_paths(layer_id)
    payload = json.dumps(esv, separators=(",", ":")).encode("utf-8")
    if block_count > GZIP_THRESHOLD:
        with gzip.open(gz, "wb") as f:
            f.write(payload)
        plain.unlink(missing_ok=True)
    else:
        plain.write_bytes(payload)
        gz.unlink(missing_ok=True)
    return block_count


def _delete_blob(layer_id: uuid.UUID) -> None:
    plain, gz = _blob_paths(layer_id)
    plain.unlink(missing_ok=True)
    gz.unlink(missing_ok=True)


def _default_esv(
    layer_id: uuid.UUID,
    scope: str,
    datum: Datum,
    generators: list[Generator] | None,
) -> dict[str, Any]:
    return {
        "version": 1,
        "layerId": str(layer_id),
        "scope": scope,
        "datum": {"lon": datum.lon, "lat": datum.lat, "alt": datum.alt},
        "baseLevelSize": BASE_LEVEL_SIZE_M,
        "generators": [g.model_dump() for g in (generators or [])],
        "blocks": [],
    }


def _serialize_meta(row: VoxelLayer) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "site_slug": row.site_slug,
        "name": row.name,
        "scope": row.scope,
        "owner_email": row.owner_email,
        "datum": {
            "lon": row.datum_lon,
            "lat": row.datum_lat,
            "alt": row.datum_alt,
        },
        "block_count": row.block_count,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _resolve_layer(
    slug: str, layer_id: str, db: DbSession, user: CurrentUser
) -> VoxelLayer:
    try:
        lid = uuid.UUID(layer_id)
    except ValueError as e:
        raise HTTPException(400, "Invalid layer id") from e
    row = db.execute(
        select(VoxelLayer).where(
            VoxelLayer.id == lid, VoxelLayer.site_slug == slug
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Voxel layer not found")
    # Sketch-scoped layers are private to the owner. Site-scoped layers
    # are visible to anyone authenticated for the site.
    if row.scope == "sketch" and row.owner_email != user.email:
        raise HTTPException(404, "Voxel layer not found")
    return row


# ── CRUD ─────────────────────────────────────────────────────────────────


@router.get("/{slug}/voxel-layers")
def list_voxel_layers(
    slug: str, user: CurrentUser, db: DbSession
) -> list[dict[str, Any]]:
    """All scope='site' layers for the site, plus the caller's own
    scope='sketch' drafts. Other users' sketches are hidden."""
    rows = db.execute(
        select(VoxelLayer)
        .where(VoxelLayer.site_slug == slug)
        .where(
            (VoxelLayer.scope == "site")
            | (
                (VoxelLayer.scope == "sketch")
                & (VoxelLayer.owner_email == user.email)
            )
        )
        .order_by(VoxelLayer.created_at.desc())
    ).scalars().all()
    return [_serialize_meta(r) for r in rows]


@router.post("/{slug}/voxel-layers", status_code=201)
def create_voxel_layer(
    slug: str, body: CreateBody, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    row = VoxelLayer(
        site_slug=slug,
        name=body.name,
        scope=body.scope,
        owner_email=user.email if body.scope == "sketch" else None,
        datum_lon=body.datum.lon,
        datum_lat=body.datum.lat,
        datum_alt=body.datum.alt,
        block_count=0,
    )
    db.add(row)
    db.flush()  # populate row.id without committing
    _write_esv(row.id, _default_esv(row.id, body.scope, body.datum, body.generators))
    db.commit()
    db.refresh(row)
    return _serialize_meta(row)


@router.get("/{slug}/voxel-layers/{layer_id}")
def get_voxel_layer(
    slug: str, layer_id: str, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    row = _resolve_layer(slug, layer_id, db, user)
    esv = _read_esv(row.id)
    if esv is None:
        # Row exists but blob is missing (storage drift or race during
        # create). Re-seed an empty .esv from the row's datum so the
        # client gets a usable document.
        esv = _default_esv(
            row.id,
            row.scope,
            Datum(
                lon=row.datum_lon or 0.0,
                lat=row.datum_lat or 0.0,
                alt=row.datum_alt or 0.0,
            ),
            None,
        )
        _write_esv(row.id, esv)
    return {"meta": _serialize_meta(row), "esv": esv}


@router.put("/{slug}/voxel-layers/{layer_id}")
def update_voxel_layer(
    slug: str,
    layer_id: str,
    body: UpdateBody,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    """Full .esv replacement. Server-controlled fields (layerId, scope)
    are forced to match the URL/DB row regardless of body content."""
    row = _resolve_layer(slug, layer_id, db, user)
    esv = body.model_dump()
    esv["layerId"] = str(row.id)
    esv["scope"] = row.scope
    block_count = _write_esv(row.id, esv)
    row.block_count = block_count
    row.datum_lon = body.datum.lon
    row.datum_lat = body.datum.lat
    row.datum_alt = body.datum.alt
    db.commit()
    db.refresh(row)
    return {"meta": _serialize_meta(row), "esv": esv}


@router.delete("/{slug}/voxel-layers/{layer_id}", status_code=204)
def delete_voxel_layer(
    slug: str, layer_id: str, user: CurrentUser, db: DbSession
) -> None:
    row = _resolve_layer(slug, layer_id, db, user)
    _delete_blob(row.id)
    db.delete(row)
    db.commit()


# ── Terrain mask (flat-terrain fallback) ────────────────────────────────


def _block_size(level: int) -> float:
    return BASE_LEVEL_SIZE_M * (2**level)


def _lonlat_to_enu(
    lon: float, lat: float, datum_lon: float, datum_lat: float
) -> tuple[float, float]:
    """Equirectangular projection at the datum latitude. Accurate to
    ~0.1% over voxel-design footprints (sub-km), which is well within
    one block at level >= 0."""
    cos_lat = math.cos(math.radians(datum_lat))
    east_m = (lon - datum_lon) * 111_320.0 * cos_lat
    north_m = (lat - datum_lat) * 111_320.0
    return east_m, north_m


@router.post("/{slug}/voxel-layers/{layer_id}/terrain-mask")
def terrain_mask(
    slug: str,
    layer_id: str,
    body: TerrainMaskBody,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, Any]:
    """Voxelise a polygon footprint into ground blocks.

    Pass-1: **flat-terrain fallback**. Treats the layer's datum altitude
    as the ground surface, so terrain_k = 0 for every column. Each (i,j)
    column inside the polygon receives blocks at k ∈
    [-depth_below_surface, 0] with type='terrain'.

    A real DEM sampler (Copernicus 30m via the ``elevation`` package)
    will replace the flat fallback once GDAL is in the API image — at
    which point each (i,j) column gets its own terrain_k from sampling
    the DEM at the column centroid.
    """
    row = _resolve_layer(slug, layer_id, db, user)
    if row.datum_lon is None or row.datum_lat is None:
        raise HTTPException(
            400, "Layer has no datum; set one when creating the layer"
        )

    esv = _read_esv(row.id) or _default_esv(
        row.id,
        row.scope,
        Datum(lon=row.datum_lon, lat=row.datum_lat, alt=row.datum_alt or 0.0),
        None,
    )

    block_size = _block_size(body.level)
    poly = Polygon(body.polygon)
    if not poly.is_valid:
        raise HTTPException(400, "Polygon is invalid (self-intersecting?)")

    # Polygon bbox → ENU bbox → integer (i,j) range at the level grid.
    minx, miny, maxx, maxy = poly.bounds
    e0, n0 = _lonlat_to_enu(minx, miny, row.datum_lon, row.datum_lat)
    e1, n1 = _lonlat_to_enu(maxx, maxy, row.datum_lon, row.datum_lat)
    i_min = math.floor(min(e0, e1) / block_size)
    i_max = math.ceil(max(e0, e1) / block_size)
    j_min = math.floor(min(n0, n1) / block_size)
    j_max = math.ceil(max(n0, n1) / block_size)

    # Existing block index keyed by (i,j,k,level) so we don't double-add.
    seen: set[tuple[int, int, int, int]] = set()
    for b in esv.get("blocks", []):
        seen.add((b["i"], b["j"], b["k"], b.get("level", 0)))

    new_blocks: list[dict[str, Any]] = []
    for i in range(i_min, i_max + 1):
        for j in range(j_min, j_max + 1):
            # Column centroid in lon/lat — convert ENU centroid back via
            # the inverse of _lonlat_to_enu. Using shapely .contains on
            # the centroid avoids the edge-case ambiguity of corner tests.
            east_centre = (i + 0.5) * block_size
            north_centre = (j + 0.5) * block_size
            cos_lat = math.cos(math.radians(row.datum_lat))
            lon_c = row.datum_lon + east_centre / (111_320.0 * cos_lat)
            lat_c = row.datum_lat + north_centre / 111_320.0
            if not poly.contains(box(lon_c, lat_c, lon_c, lat_c).centroid):
                continue
            terrain_k = 0  # flat-terrain fallback
            for k in range(terrain_k - body.depth_below_surface, terrain_k + 1):
                key = (i, j, k, body.level)
                if key in seen:
                    continue
                seen.add(key)
                new_blocks.append({
                    "i": i,
                    "j": j,
                    "k": k,
                    "level": body.level,
                    "type": "terrain",
                    "materialPreset": None,
                    "faceTextures": None,
                    "attrs": None,
                })

    esv.setdefault("blocks", []).extend(new_blocks)
    block_count = _write_esv(row.id, esv)
    row.block_count = block_count
    db.commit()
    return {
        "blocks_added": len(new_blocks),
        "layer_id": str(row.id),
        "block_count": block_count,
        "terrain_source": "flat-fallback",
    }


# ── Arnis import (stub) ─────────────────────────────────────────────────


@router.post(
    "/{slug}/voxel-layers/import-arnis",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def import_arnis(
    slug: str, body: ArnisImportBody, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    """Arnis OSM-to-Minecraft → voxel layer pipeline.

    TODO(pass-2): wire up once the runtime image carries the deps.

    Required runtime additions (Dockerfile work, separate task):
      1. Install the Rust ``arnis`` CLI binary (cargo build or prebuilt).
         There is no ``pip install arnis`` package — Arnis is a Rust
         project. Subprocess against the binary; capture .mca output to
         a tmp dir.
      2. ``pip install anvil-parser`` to read the .mca region files.
      3. The pipeline is long-running (minutes for a city block), so it
         must execute as a FastAPI BackgroundTasks job and write status
         to a ``voxel_jobs`` table (also pass-2 — the job-poll endpoint
         below is contract-only until then).

    Mapping (constant, defined at module top): minecraft:stone→rock,
    grass_block→topsoil, dirt→terrain, water→water, gravel→overburden,
    iron_ore/gold_ore→ore, everything else→rock.

    Coordinates: bbox SW corner becomes the layer datum; one Minecraft
    block (1m³) maps to one level-3 voxel block.
    """
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "Arnis pipeline not yet implemented. Requires the Rust 'arnis' "
            "binary + 'anvil-parser' in the API image; tracked as separate "
            "Dockerfile work."
        ),
    )


@router.get("/{slug}/voxel-layers/jobs/{job_id}")
def get_voxel_job(
    slug: str, job_id: str, user: CurrentUser, db: DbSession
) -> dict[str, Any]:
    """Poll a long-running voxelisation job (Arnis import, etc.).

    TODO(pass-2): backed by a ``voxel_jobs`` table once Arnis lands.
    Returning 404 unconditionally for now — the only producer of jobs
    (import-arnis) is itself a 501 stub, so no job_id can be valid.
    """
    raise HTTPException(404, "Job not found")


# ── IFC export (stub) ───────────────────────────────────────────────────


@router.get(
    "/{slug}/voxel-layers/{layer_id}/export-ifc",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
)
def export_ifc(
    slug: str, layer_id: str, user: CurrentUser, db: DbSession
) -> Any:
    """Voxel layer → IFC (.ifc) file download.

    TODO(pass-2): implement once ``ifcopenshell`` is in the API image.

    Plan when it lands:
      * One ``IfcGeographicElement`` per material region (or per
        generator if generators are tracked on the source row).
      * Geometry: brep box per block, optionally merged per material
        region for size.
      * IFC class from the IFC_CLASS map (defined at module top):
        rock/terrain/topsoil/overburden/ore→IfcGeographicElement,
        water→IfcSpace, concrete→IfcWall, steel→IfcBeam.
      * Geo-reference set on IfcProject from the layer's datum (lon,
        lat, alt) via IfcMapConversion.
    """
    # Resolve first so a missing/forbidden layer surfaces as 404 rather
    # than 501 — the 501 is specifically about the export step.
    _resolve_layer(slug, layer_id, db, user)
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            "IFC export not yet implemented. Requires 'ifcopenshell' in the "
            "API image; tracked as separate Dockerfile work."
        ),
    )
