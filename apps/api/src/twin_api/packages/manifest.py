"""Site-package manifest schema.

The manifest is the index file at the root of a .mtsite archive. It
declares the schema version, the site's metadata, and per-entity
inventories so an importer can validate the archive before unpacking.

Schema versioning follows semver:
  Major bump  — incompatible structural change (importer must reject)
  Minor bump  — additive (importer can read, may ignore new fields)
  Patch bump  — typo / docs / non-functional

The companion features.ndjson + assets/ + library/ files are referenced
from this manifest by relative path so importers know what to expect.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

PACKAGE_SCHEMA_VERSION = "1.0.0"


class ExportedBy(BaseModel):
    id: str | None = None
    name: str | None = None
    email: str | None = None


class PackageSource(BaseModel):
    """Where the package came from. ``twin_url`` is the API base of the
    exporting instance (when known). ``site_slug`` is the slug at export
    time — the importer may pick a different slug to avoid collision."""

    twin_url: str | None = None
    site_slug: str
    source_kind: Literal["twin", "sheets", "feed_snapshot"] = "twin"


class SiteManifest(BaseModel):
    slug: str
    name: str
    description: str | None = None
    storage_srid: int = 4326
    is_public_pre_login: bool = False
    config: dict[str, Any] = Field(default_factory=dict)


class LayerManifest(BaseModel):
    id: str
    name: str
    type: str
    data_source_id: str | None = None
    visible: bool = True
    opacity: float = 1.0
    order: int = 0
    style: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    feature_count: int = 0


class DataSourceManifest(BaseModel):
    id: str
    name: str
    description: str | None = None
    type: str
    url: str | None = None
    size_bytes: int | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    #: Relative path inside the archive where the binary blob lives, or
    #: ``None`` when the data source is URL-only (no local asset).
    asset_path: str | None = None


class StoryMapManifest(BaseModel):
    id: str
    name: str
    description: str | None = None
    is_published: bool = False
    slides: list[dict[str, Any]] = Field(default_factory=list)


class LibraryFolderManifest(BaseModel):
    id: str
    parent_id: str | None = None
    name: str
    slug: str
    depth: int = 0


class LibraryItemManifest(BaseModel):
    id: str
    folder_id: str | None = None
    name: str
    kind: str
    url: str | None = None
    size_bytes: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LibraryManifest(BaseModel):
    folders: list[LibraryFolderManifest] = Field(default_factory=list)
    items: list[LibraryItemManifest] = Field(default_factory=list)


class PackageCounts(BaseModel):
    layers: int = 0
    features: int = 0
    data_sources: int = 0
    story_maps: int = 0
    library_folders: int = 0
    library_items: int = 0


class PackageManifest(BaseModel):
    """Root manifest for a .mtsite archive."""

    schema_version: str = PACKAGE_SCHEMA_VERSION
    package_kind: Literal["mtsite"] = "mtsite"
    exported_at: datetime
    exported_by: ExportedBy = Field(default_factory=ExportedBy)
    source: PackageSource

    site: SiteManifest
    counts: PackageCounts = Field(default_factory=PackageCounts)

    layers: list[LayerManifest] = Field(default_factory=list)
    data_sources: list[DataSourceManifest] = Field(default_factory=list)
    story_maps: list[StoryMapManifest] = Field(default_factory=list)
    library: LibraryManifest = Field(default_factory=LibraryManifest)

    #: Path inside the archive of the NDJSON feature stream. Always
    #: WGS84 — the importer ST_Transforms back to the target site's
    #: storage_srid on insert. Optional so catalog-only exports can
    #: omit the file entirely.
    features_path: str | None = "features.ndjson"

    #: Path prefix for embedded asset binaries (data sources, library
    #: items). Relative paths in the per-entity manifests are resolved
    #: against this root.
    assets_root: str = "assets/"

    #: Optional notes from the exporter — provenance, environment, etc.
    notes: str | None = None
