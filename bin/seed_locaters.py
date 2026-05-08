#!/usr/bin/env python3
"""Seed the Locaters utility-location demo data into Mighty Twin.

Creates one site per BURNS_ROAD / NAMBUCCA_STREET / WOLSELEY_ROAD with
one layer per utility type (water / gas / electric / sewer / drain /
comms / unidentified). Source GeoJSON is in EPSG:7856 (MGA2020 Zone
56); we set storage_srid=7856 on each site so the geometries land in
their native projected CRS — the viewer reads from the _wgs84 view
which reprojects on read.

Idempotent: if a site with the slug already exists, the script skips
its full ingest. Pass --force to drop+recreate.

Usage::

    cd ~/Projects/mighty-twin
    uv run python bin/seed_locaters.py
    uv run python bin/seed_locaters.py --force                    # recreate
    uv run python bin/seed_locaters.py --root /path/to/Input      # custom data dir
    uv run python bin/seed_locaters.py --only burns-road          # one site only
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

# Make the in-repo packages importable (we don't depend on uv install
# layout — this script is run via uv run which sets PYTHONPATH).
ROOT = Path(__file__).resolve().parent.parent
for sub in ("python/mighty_models/src", "python/mighty_db/src", "apps/api/src"):
    sys.path.insert(0, str(ROOT / sub))

from sqlalchemy import select, text  # noqa: E402

from mighty_models import DataSource, Layer, Site  # noqa: E402
from mighty_db import get_engine, get_session_factory  # noqa: E402


DEFAULT_INPUT = (
    "/Users/rahman/Library/CloudStorage/OneDrive-MightySpatial/"
    "MightySpatial/Clients/Active/Locaters/Locaters_DT/Input"
)

# Utility-type registry — drives both folder pattern matching and the
# per-layer style. Codes match the underscore in the geojson filename
# (utility_<code>_<date>.geojson).
UTILITIES = {
    "water": {"name": "Water", "color": "#3b82f6"},
    "gas": {"name": "Gas", "color": "#fbbf24"},
    "elec": {"name": "Electric", "color": "#ef4444"},
    "sewer": {"name": "Sewer", "color": "#a16207"},
    "drain": {"name": "Stormwater drain", "color": "#06b6d4"},
    "comms": {"name": "Comms", "color": "#a855f7"},
    "unid": {"name": "Unidentified", "color": "#9ca3af"},
}

UTILITY_FILE_RE = re.compile(r"^utility_([a-z]+)_\d+\.geojson$", re.IGNORECASE)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-") or "site"


def detect_centroid(features: list[dict[str, Any]]) -> tuple[float, float] | None:
    """Compute a rough lon/lat centroid from a few features in 7856 → 4326.
    Best effort — used to set the site's default camera target. Falls back
    to None if reprojection isn't available."""
    if not features:
        return None
    try:
        from pyproj import Transformer  # type: ignore
    except ImportError:
        return None
    transformer = Transformer.from_crs("EPSG:7856", "EPSG:4326", always_xy=True)
    xs: list[float] = []
    ys: list[float] = []
    for f in features[:50]:
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if geom.get("type") == "Point":
            xs.append(coords[0])
            ys.append(coords[1])
        elif geom.get("type") == "LineString":
            for c in coords:
                xs.append(c[0])
                ys.append(c[1])
        elif geom.get("type") == "Polygon":
            for ring in coords:
                for c in ring:
                    xs.append(c[0])
                    ys.append(c[1])
    if not xs:
        return None
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    lon, lat = transformer.transform(cx, cy)
    return lon, lat


def find_road_dirs(root: Path) -> list[Path]:
    return sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith("."))


def insert_features(
    db,
    *,
    site_id: uuid.UUID,
    layer_id: uuid.UUID,
    storage_srid: int,
    features: list[dict[str, Any]],
) -> int:
    """Direct insert from EPSG:7856 GeoJSON via PostGIS. Skips features
    whose geometry isn't a sane GeoJSON object."""
    if not features:
        return 0
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    if is_postgis:
        stmt = text(
            """
            INSERT INTO features (id, site_id, layer_id, geom, properties)
            VALUES (
                :id, :site_id, :layer_id,
                ST_SetSRID(ST_GeomFromGeoJSON(:geojson), :storage_srid),
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
                SetSRID(GeomFromGeoJSON(:geojson), :storage_srid),
                :properties
            )
            """
        )
    inserted = 0
    for feat in features:
        geom = feat.get("geometry")
        if not isinstance(geom, dict) or "type" not in geom or "coordinates" not in geom:
            continue
        properties = feat.get("properties") or {}
        # 3D coordinates trip ST_GeomFromGeoJSON when the source CRS is
        # planar — strip Z for the demo seed (heights are in metres
        # absolute and not what the layer's clamping wants anyway).
        geom2d = strip_z(geom)
        db.execute(
            stmt,
            {
                "id": str(uuid.uuid4()),
                "site_id": str(site_id),
                "layer_id": str(layer_id),
                "geojson": json.dumps(geom2d),
                "storage_srid": storage_srid,
                "properties": json.dumps(properties),
            },
        )
        inserted += 1
    return inserted


def strip_z(geom: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of geom with z dropped from every coordinate."""
    t = geom.get("type")
    coords = geom.get("coordinates")

    def drop(c):
        if isinstance(c, list) and len(c) >= 2 and isinstance(c[0], (int, float)):
            return [c[0], c[1]]
        if isinstance(c, list):
            return [drop(x) for x in c]
        return c

    return {"type": t, "coordinates": drop(coords)}


def seed_site_for_road(
    db,
    road_dir: Path,
    *,
    force: bool = False,
) -> tuple[str, dict[str, int]]:
    site_name = road_dir.name.replace("_", " ").title()
    slug = slugify(site_name)

    existing = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if existing is not None:
        if not force:
            return slug, {"skipped": 1}
        db.delete(existing)
        db.flush()

    # Walk the road's geojson set
    files: list[tuple[str, Path]] = []
    for f in sorted(road_dir.iterdir()):
        m = UTILITY_FILE_RE.match(f.name)
        if not m:
            continue
        code = m.group(1).lower()
        if code not in UTILITIES:
            continue
        files.append((code, f))
    if not files:
        return slug, {"skipped": 1, "reason": "no-utility-geojsons"}

    # Pre-load one feature collection to derive the camera centroid.
    first_collection = json.loads(files[0][1].read_text())
    centroid = detect_centroid(first_collection.get("features") or [])

    site = Site(
        slug=slug,
        name=site_name,
        description=f"Underground utility location data for {site_name}.",
        storage_srid=7856,
        is_public_pre_login=False,
        config={
            "primary_color": "#2453ff",
            "default_camera": (
                {
                    "longitude": centroid[0] if centroid else 151.2,
                    "latitude": centroid[1] if centroid else -33.87,
                    "height": 400,
                }
                if centroid
                else {"longitude": 151.2, "latitude": -33.87, "height": 4000}
            ),
            "imported_from_locaters_demo": True,
        },
    )
    db.add(site)
    db.flush()

    counts: dict[str, int] = {}
    for order, (code, path) in enumerate(files):
        meta = UTILITIES[code]
        ds = DataSource(
            id=uuid.uuid4(),
            name=f"{meta['name']} ({site_name})",
            type="geojson",
            url=str(path),
            attributes={"source_path": str(path), "source_srid": 7856},
        )
        db.add(ds)

        layer = Layer(
            id=uuid.uuid4(),
            site_id=site.id,
            data_source_id=ds.id,
            name=meta["name"],
            type="vector",
            visible=1,
            opacity=1.0,
            display_order=order,
            style={"strokeColor": meta["color"], "lineWidth": 3, "opacity": 0.9},
            layer_metadata={"utility_code": code, "source_path": str(path)},
        )
        db.add(layer)
        db.flush()

        coll = json.loads(path.read_text())
        n = insert_features(
            db,
            site_id=site.id,
            layer_id=layer.id,
            storage_srid=7856,
            features=coll.get("features") or [],
        )
        counts[code] = n

    db.commit()
    return slug, counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=os.environ.get("LOCATERS_INPUT", DEFAULT_INPUT))
    parser.add_argument("--force", action="store_true", help="Drop + recreate sites that already exist")
    parser.add_argument("--only", help="Only seed this slug (e.g. burns-road)")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"ERROR: input directory not found at {root}", file=sys.stderr)
        return 1

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        # Try the dev defaults the rebuild script uses.
        database_url = "postgresql://mightytwin:mightytwin_dev@localhost:5432/mightytwin"
    engine = get_engine(database_url, pool_pre_ping=True)
    Session = get_session_factory(engine)

    summary: list[tuple[str, dict[str, int]]] = []
    with Session() as db:
        for road_dir in find_road_dirs(root):
            slug = slugify(road_dir.name.replace("_", " ").title())
            if args.only and args.only != slug:
                continue
            print(f"Seeding {slug}…", flush=True)
            ret_slug, counts = seed_site_for_road(db, road_dir, force=args.force)
            summary.append((ret_slug, counts))

    print()
    print("Seed complete:")
    for slug, counts in summary:
        if "skipped" in counts:
            print(f"  {slug}: skipped (use --force to recreate)")
        else:
            total = sum(counts.values())
            per_layer = ", ".join(f"{k}={v}" for k, v in counts.items())
            print(f"  {slug}: {total} features ({per_layer})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
