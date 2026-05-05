"""Site-package exporter.

Walks a Site's FK graph (layers, features, data sources, story maps,
library) and writes a self-contained zip archive. Features are emitted
as NDJSON in WGS84 so the package is portable across different
storage CRSs.

The exporter is dialect-aware (PostGIS uses ST_AsGeoJSON +
ST_Transform; SpatiaLite uses AsGeoJSON + Transform without the
namespace prefix) so dev/prod environments produce identical archives.

Streaming: features are read in batches and written line-by-line into
the zipfile member's writer; we avoid loading the full FeatureCollection
into memory. Asset files (data source uploads + library binaries) are
copied byte-by-byte from disk via shutil.copyfileobj.
"""

from __future__ import annotations

import io
import json
import os
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

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
    User,
)

from .manifest import (
    DataSourceManifest,
    ExportedBy,
    FeedManifest,
    LayerManifest,
    LibraryFolderManifest,
    LibraryItemManifest,
    LibraryManifest,
    PackageCounts,
    PackageManifest,
    PackageSource,
    SiteManifest,
    StoryMapManifest,
)

#: Read features in batches of this many rows so the cursor doesn't
#: lock the table for the full export.
FEATURE_BATCH_SIZE = 2000


def export_site_package(
    db: Session,
    site: Site,
    *,
    exported_by: User | None = None,
    twin_url: str | None = None,
    include_features: bool = True,
    include_assets: bool = True,
    include_library: bool = True,
    notes: str | None = None,
) -> bytes:
    """Build a .mtsite archive for ``site`` and return its raw bytes.

    The archive layout::

        <site-slug>.mtsite (zip)
        ├── manifest.json
        ├── features.ndjson           (when include_features)
        └── assets/
            ├── ds-<uuid>.<ext>       (when include_assets)
            └── lib-<uuid>.<ext>      (when include_assets + include_library)
    """
    layers = (
        db.execute(
            select(Layer)
            .where(Layer.site_id == site.id)
            .order_by(Layer.display_order)
        )
        .scalars()
        .all()
    )

    layer_ids = [layer.id for layer in layers]
    data_source_ids = {layer.data_source_id for layer in layers if layer.data_source_id}
    data_sources = (
        db.execute(select(DataSource).where(DataSource.id.in_(data_source_ids))).scalars().all()
        if data_source_ids
        else []
    )
    feed_ids = {layer.feed_id for layer in layers if layer.feed_id}
    feeds = (
        db.execute(select(Feed).where(Feed.id.in_(feed_ids))).scalars().all()
        if feed_ids
        else []
    )
    story_maps = (
        db.execute(select(StoryMap).where(StoryMap.site_id == site.id)).scalars().all()
    )

    library_folders: list[LibraryFolder] = []
    library_items: list[LibraryItem] = []
    if include_library:
        # Library is a workspace-level resource — not site-scoped — so
        # every export currently includes the full tree. Once we have
        # site-scoped library buckets we can filter here.
        library_folders = list(db.execute(select(LibraryFolder)).scalars().all())
        library_items = list(db.execute(select(LibraryItem)).scalars().all())

    # ── Counts ──────────────────────────────────────────────────────
    feature_count = 0
    if include_features and layer_ids:
        feature_count = (
            db.execute(
                text("SELECT COUNT(*) FROM features WHERE site_id = :sid"),
                {"sid": str(site.id)},
            ).scalar()
            or 0
        )

    counts = PackageCounts(
        layers=len(layers),
        features=feature_count,
        data_sources=len(data_sources),
        story_maps=len(story_maps),
        library_folders=len(library_folders),
        library_items=len(library_items),
        feeds=len(feeds),
    )

    # ── Manifest entries ────────────────────────────────────────────
    layer_feature_counts = _layer_feature_counts(db, site.id) if include_features else {}
    layer_manifests = [
        LayerManifest(
            id=str(layer.id),
            name=layer.name,
            type=layer.type,
            data_source_id=str(layer.data_source_id) if layer.data_source_id else None,
            visible=bool(layer.visible),
            opacity=float(layer.opacity or 1.0),
            order=layer.display_order or 0,
            style=layer.style or {},
            metadata=layer.layer_metadata or {},
            feature_count=int(layer_feature_counts.get(layer.id, 0)),
            feed_id=str(layer.feed_id) if layer.feed_id else None,
            materialisation=layer.materialisation or "materialised",
        )
        for layer in layers
    ]

    feed_manifests = [
        FeedManifest(
            id=str(f.id),
            name=f.name,
            description=f.description,
            kind=f.kind,
            url=f.url,
            refresh=f.refresh,
            schedule_cron=f.schedule_cron,
            source_srid=f.source_srid,
            geometry_hint=f.geometry_hint or {"kind": "native"},
            config=f.config or {},
            enabled=bool(f.enabled),
        )
        for f in feeds
    ]

    ds_manifests: list[DataSourceManifest] = []
    asset_writes: list[tuple[str, Path]] = []
    for ds in data_sources:
        asset_path: str | None = None
        if include_assets and ds.url and _is_local_path(ds.url):
            local = Path(ds.url)
            if local.exists():
                ext = local.suffix.lstrip(".") or "bin"
                asset_path = f"assets/ds-{ds.id}.{ext}"
                asset_writes.append((asset_path, local))
        ds_manifests.append(
            DataSourceManifest(
                id=str(ds.id),
                name=ds.name,
                description=ds.description,
                type=ds.type,
                url=ds.url if not asset_path else None,
                size_bytes=ds.size_bytes,
                attributes=ds.attributes or {},
                asset_path=asset_path,
            )
        )

    sm_manifests = [
        StoryMapManifest(
            id=str(sm.id),
            name=sm.name,
            description=sm.description,
            is_published=bool(sm.is_published),
            slides=sm.slides or [],
        )
        for sm in story_maps
    ]

    lib_manifest = LibraryManifest(
        folders=[
            LibraryFolderManifest(
                id=str(f.id),
                parent_id=str(f.parent_id) if f.parent_id else None,
                name=f.name,
                slug=f.slug,
                depth=f.depth,
            )
            for f in library_folders
        ],
        items=[
            LibraryItemManifest(
                id=str(i.id),
                folder_id=str(i.folder_id) if i.folder_id else None,
                name=i.name,
                kind=i.kind,
                url=i.url,
                size_bytes=i.size_bytes,
                metadata=i.item_metadata or {},
            )
            for i in library_items
        ],
    )

    manifest = PackageManifest(
        exported_at=datetime.now(timezone.utc),
        exported_by=ExportedBy(
            id=str(exported_by.id) if exported_by else None,
            name=exported_by.name if exported_by else None,
            email=exported_by.email if exported_by else None,
        ),
        source=PackageSource(twin_url=twin_url, site_slug=site.slug, source_kind="twin"),
        site=SiteManifest(
            slug=site.slug,
            name=site.name,
            description=site.description,
            storage_srid=site.storage_srid,
            is_public_pre_login=bool(site.is_public_pre_login),
            config=site.config or {},
        ),
        counts=counts,
        layers=layer_manifests,
        data_sources=ds_manifests,
        story_maps=sm_manifests,
        library=lib_manifest,
        feeds=feed_manifests,
        features_path="features.ndjson" if include_features else None,
        notes=notes,
    )

    # ── Write zip ───────────────────────────────────────────────────
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "manifest.json",
            manifest.model_dump_json(indent=2, exclude_none=False),
        )

        if include_features and feature_count > 0:
            with zf.open("features.ndjson", mode="w") as fp:
                for line in _stream_features_as_ndjson(db, site.id):
                    fp.write(line.encode("utf-8"))
                    fp.write(b"\n")

        for arcname, source in asset_writes:
            zf.write(source, arcname=arcname)

    return buf.getvalue()


def _layer_feature_counts(db: Session, site_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = db.execute(
        text(
            "SELECT layer_id, COUNT(*) FROM features "
            "WHERE site_id = :sid AND layer_id IS NOT NULL "
            "GROUP BY layer_id"
        ),
        {"sid": str(site_id)},
    ).all()
    out: dict[uuid.UUID, int] = {}
    for row in rows:
        layer_id = row[0]
        if isinstance(layer_id, str):
            layer_id = uuid.UUID(layer_id)
        out[layer_id] = int(row[1])
    return out


def _stream_features_as_ndjson(db: Session, site_id: uuid.UUID) -> Iterable[str]:
    """Yield one JSON line per feature in the site, geometry transformed
    to WGS84 (EPSG:4326). Dialect-aware: uses PostGIS function names by
    default, falls back to SpatiaLite's unprefixed forms."""
    bind = db.get_bind()
    is_postgis = bind.dialect.name == "postgresql"
    if is_postgis:
        sql = text(
            """
            SELECT id, layer_id,
                   ST_AsGeoJSON(ST_Transform(geom, 4326)) AS geom_json,
                   properties, created_at
            FROM features
            WHERE site_id = :sid
            ORDER BY created_at, id
            """
        )
    else:
        sql = text(
            """
            SELECT id, layer_id,
                   AsGeoJSON(Transform(geom, 4326)) AS geom_json,
                   properties, created_at
            FROM features
            WHERE site_id = :sid
            ORDER BY created_at, id
            """
        )

    result = db.execute(sql, {"sid": str(site_id)})
    while True:
        batch = result.fetchmany(FEATURE_BATCH_SIZE)
        if not batch:
            break
        for row in batch:
            id_ = row[0]
            layer_id = row[1]
            geom_json = row[2]
            properties = row[3]
            created_at = row[4]
            try:
                geometry = json.loads(geom_json) if isinstance(geom_json, str) else geom_json
            except (TypeError, ValueError):
                geometry = None
            if isinstance(properties, str):
                try:
                    properties = json.loads(properties)
                except ValueError:
                    properties = {"_raw": properties}
            yield json.dumps(
                {
                    "type": "Feature",
                    "id": str(id_),
                    "geometry": geometry,
                    "properties": properties or {},
                    "_layer_id": str(layer_id) if layer_id else None,
                    "_created_at": created_at.isoformat() if created_at else None,
                },
                separators=(",", ":"),
            )


def _is_local_path(url: str) -> bool:
    """Return True when the URL looks like a local filesystem path
    rather than a remote http/https/gs/s3 reference."""
    if not url:
        return False
    if url.startswith(("http://", "https://", "gs://", "s3://", "azure://")):
        return False
    # Bare path like /tmp/foo, ./bar, or C:\\baz
    return os.sep in url or url.startswith(".") or url.startswith("/")
