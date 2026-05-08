"""Site-package importer.

Inverse of exporter.py. Reads a .mtsite zip, validates its manifest,
provisions the site + layers + data sources + story maps + library
entries, and inserts features through the same dialect-aware spatial
path the T+300 submission promote uses.

Slug collisions are resolved at the API layer — the importer accepts
a target_slug and assumes the caller has already disambiguated. If the
target_slug is taken, the function raises ImportError; the caller
decides whether to suffix with -copy, prompt the user, or merge.

Import is wrapped in a single transaction. On any failure the whole
import rolls back so partial sites can't pollute the DB.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from mighty_models import (
    DataSource,
    Feed,
    Layer,
    LibraryFolder,
    LibraryItem,
    Site,
    StoryMap,
)

from .manifest import PackageManifest


class PackageImportError(Exception):
    """Raised when an import is rejected."""


def import_site_package(
    db: Session,
    payload: bytes,
    *,
    target_slug: str | None = None,
    overwrite_collision: bool = False,
) -> dict[str, Any]:
    """Import a .mtsite archive bytes blob into the database.

    Returns a summary dict with the new site's slug + counts of inserted
    rows. Raises PackageImportError for any validation or collision
    issue.
    """
    try:
        zf = zipfile.ZipFile(io.BytesIO(payload), mode="r")
    except zipfile.BadZipFile as e:
        raise PackageImportError(f"Not a valid .mtsite archive: {e}") from e

    if "manifest.json" not in zf.namelist():
        raise PackageImportError("Archive is missing manifest.json")

    raw_manifest = zf.read("manifest.json").decode("utf-8")
    try:
        manifest = PackageManifest.model_validate_json(raw_manifest)
    except Exception as e:  # noqa: BLE001
        raise PackageImportError(f"manifest.json failed validation: {e}") from e

    major = int(manifest.schema_version.split(".")[0])
    if major != 1:
        raise PackageImportError(
            f"Unsupported schema_version {manifest.schema_version!r} "
            f"(this server reads major version 1)"
        )

    slug = (target_slug or manifest.site.slug).strip()
    if not slug:
        raise PackageImportError("Target slug is empty")

    existing = db.execute(select(Site).where(Site.slug == slug)).scalar_one_or_none()
    if existing is not None and not overwrite_collision:
        raise PackageImportError(
            f"Site with slug {slug!r} already exists — choose a different "
            f"target_slug or pass overwrite_collision=True"
        )
    if existing is not None and overwrite_collision:
        # Cascade-delete the old site; FK ondelete=CASCADE clears layers,
        # features, story maps under it.
        db.delete(existing)
        db.flush()

    counts = {
        "site": 1,
        "layers": 0,
        "data_sources": 0,
        "features": 0,
        "story_maps": 0,
        "library_folders": 0,
        "library_items": 0,
        "feeds": 0,
    }

    # ── Site ────────────────────────────────────────────────────────
    site = Site(
        slug=slug,
        name=manifest.site.name,
        description=manifest.site.description,
        storage_srid=manifest.site.storage_srid,
        is_public_pre_login=manifest.site.is_public_pre_login,
        config={
            **(manifest.site.config or {}),
            "imported_from": {
                "twin_url": manifest.source.twin_url,
                "site_slug": manifest.source.site_slug,
                "source_kind": manifest.source.source_kind,
                "imported_at": datetime.utcnow().isoformat() + "Z",
            },
        },
    )
    db.add(site)
    db.flush()  # so site.id is available for FKs

    # ── Feeds (referenced by layers) ────────────────────────────────
    # Imported feeds have `auth` cleared — secrets don't travel through
    # packages. The importer must rebind credentials by env var on the
    # target instance.
    feed_id_map: dict[str, uuid.UUID] = {}
    for f_m in manifest.feeds:
        new_feed = Feed(
            id=uuid.uuid4(),
            name=f_m.name,
            description=f_m.description,
            kind=f_m.kind,
            url=f_m.url,
            auth=None,
            refresh=f_m.refresh,
            schedule_cron=f_m.schedule_cron,
            source_srid=f_m.source_srid,
            geometry_hint=f_m.geometry_hint or {"kind": "native"},
            config=f_m.config or {},
            enabled=f_m.enabled,
        )
        db.add(new_feed)
        feed_id_map[f_m.id] = new_feed.id
        counts["feeds"] += 1

    # ── Data sources (referenced by layers) ─────────────────────────
    ds_id_map: dict[str, uuid.UUID] = {}  # old id → new id
    for ds_m in manifest.data_sources:
        new_ds = DataSource(
            id=uuid.uuid4(),
            name=ds_m.name,
            description=ds_m.description,
            type=ds_m.type,
            url=ds_m.url,
            size_bytes=ds_m.size_bytes,
            attributes=ds_m.attributes or {},
        )
        db.add(new_ds)
        ds_id_map[ds_m.id] = new_ds.id
        counts["data_sources"] += 1

    # ── Layers ──────────────────────────────────────────────────────
    layer_id_map: dict[str, uuid.UUID] = {}
    for l_m in manifest.layers:
        ds_id = ds_id_map.get(l_m.data_source_id) if l_m.data_source_id else None
        feed_id = feed_id_map.get(l_m.feed_id) if l_m.feed_id else None
        new_layer = Layer(
            id=uuid.uuid4(),
            site_id=site.id,
            data_source_id=ds_id,
            feed_id=feed_id,
            materialisation=l_m.materialisation or "materialised",
            name=l_m.name,
            type=l_m.type,
            visible=1 if l_m.visible else 0,
            opacity=l_m.opacity,
            display_order=l_m.order,
            style=l_m.style or {},
            layer_metadata=l_m.metadata or {},
        )
        db.add(new_layer)
        layer_id_map[l_m.id] = new_layer.id
        counts["layers"] += 1
    db.flush()

    # ── Features (NDJSON stream) ────────────────────────────────────
    if manifest.features_path and manifest.features_path in zf.namelist():
        with zf.open(manifest.features_path) as fp:
            counts["features"] = _insert_features_stream(
                db,
                fp,
                site_id=site.id,
                storage_srid=site.storage_srid,
                layer_id_map=layer_id_map,
            )

    # ── Story maps ──────────────────────────────────────────────────
    for sm_m in manifest.story_maps:
        new_sm = StoryMap(
            id=uuid.uuid4(),
            site_id=site.id,
            name=sm_m.name,
            description=sm_m.description,
            is_published=sm_m.is_published,
            slides=sm_m.slides or [],
        )
        db.add(new_sm)
        counts["story_maps"] += 1

    # ── Library folders + items ─────────────────────────────────────
    folder_id_map: dict[str, uuid.UUID] = {}
    # Sort folders by depth so parents are inserted before children.
    for f_m in sorted(manifest.library.folders, key=lambda f: f.depth):
        parent_id = folder_id_map.get(f_m.parent_id) if f_m.parent_id else None
        new_folder = LibraryFolder(
            id=uuid.uuid4(),
            parent_id=parent_id,
            name=f_m.name,
            slug=f_m.slug,
            depth=f_m.depth,
        )
        db.add(new_folder)
        folder_id_map[f_m.id] = new_folder.id
        counts["library_folders"] += 1
    for i_m in manifest.library.items:
        folder_id = folder_id_map.get(i_m.folder_id) if i_m.folder_id else None
        new_item = LibraryItem(
            id=uuid.uuid4(),
            folder_id=folder_id,
            name=i_m.name,
            kind=i_m.kind,
            url=i_m.url,
            size_bytes=i_m.size_bytes,
            item_metadata=i_m.metadata or {},
        )
        db.add(new_item)
        counts["library_items"] += 1

    db.commit()
    return {
        "site_slug": slug,
        "site_id": str(site.id),
        "counts": counts,
        "schema_version": manifest.schema_version,
    }


def _insert_features_stream(
    db: Session,
    fp,
    *,
    site_id: uuid.UUID,
    storage_srid: int,
    layer_id_map: dict[str, uuid.UUID],
) -> int:
    """Insert each NDJSON line as a row in the features table.

    Geometries arrive in WGS84 (per the manifest contract); ST_Transform
    them to the site's storage_srid. Lines without a valid geometry are
    silently skipped — same lenient policy as T+300 promote.
    """
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
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), :storage_srid),
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
                Transform(GeomFromGeoJSON(:geojson), :storage_srid),
                :properties
            )
            """
        )

    inserted = 0
    for raw_line in fp:
        if isinstance(raw_line, bytes):
            line = raw_line.decode("utf-8").strip()
        else:
            line = raw_line.strip()
        if not line:
            continue
        try:
            feat = json.loads(line)
        except ValueError:
            continue
        geom = feat.get("geometry")
        if not isinstance(geom, dict) or "type" not in geom or "coordinates" not in geom:
            continue
        properties = feat.get("properties")
        if not isinstance(properties, dict):
            properties = {}
        old_layer_id = feat.get("_layer_id") or feat.get("layer_id")
        new_layer_id = layer_id_map.get(old_layer_id) if old_layer_id else None
        db.execute(
            stmt,
            {
                "id": str(uuid.uuid4()),
                "site_id": str(site_id),
                "layer_id": str(new_layer_id) if new_layer_id else None,
                "geojson": json.dumps(geom),
                "storage_srid": storage_srid,
                "properties": json.dumps(properties),
            },
        )
        inserted += 1
    return inserted
