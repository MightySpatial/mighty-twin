"""Sheets schema-export translator — T+1020.

Translates a Mighty Sheets workbook export (.mishpkg) into a Twin site
package (.mtsite) without touching disk twice. The result is fed to
import_site_package() so Sheets imports take the same code path as
Twin↔Twin federation.

The .mishpkg format we expect (per the Sheets→Twin integration brief):

    workbook.json                — name, description, branding, settings
    tables/<table_id>.json       — table metadata + schema + geometry hint
    tables/<table_id>.csv        — row data (or .ndjson for big tables)
    attachments/<id>.<ext>       — binary library blobs
    workbook.json#references     — formulas / cross-table refs (best-effort)

Translation rules:
    workbook.name                → site.name (slug derived)
    table with columns hint      → Twin layer + materialised features
    table without geom hint      → Twin DataSource (attribute-only)
    workbook.attachments         → Twin library/items
    workbook.branding            → site.config.primary_color +
                                    site.config.logo_url

Geometry promotion: each table declares either
    {"geometry_hint": {"kind": "columns", "lng": "lon", "lat": "lat"}}
    {"geometry_hint": {"kind": "wkt", "column": "geom"}}
    {"geometry_hint": {"kind": "attribute_only"}}    (default)

Tables without geometry hints become attribute-only DataSources joined
to the layer they reference (or unbound, if no FK is declared).

Provenance: every produced entity gets ``source_kind: 'sheets'`` and
the workbook id stamped into source.workbook_id so re-exports back to
Sheets can find their counterparts.
"""

from __future__ import annotations

import csv
import io
import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

from .manifest import (
    DataSourceManifest,
    ExportedBy,
    LayerManifest,
    LibraryFolderManifest,
    LibraryItemManifest,
    LibraryManifest,
    PackageCounts,
    PackageManifest,
    PackageSource,
    SiteManifest,
)


class SheetsTranslationError(Exception):
    """Raised when a .mishpkg can't be translated."""


_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def translate_sheets_to_mtsite(payload: bytes) -> bytes:
    """Read a .mishpkg blob, return a .mtsite blob.

    The output is a valid archive that import_site_package() can
    consume directly. The translator never touches the database — it
    only does format conversion.
    """
    try:
        src = zipfile.ZipFile(io.BytesIO(payload), mode="r")
    except zipfile.BadZipFile as e:
        raise SheetsTranslationError(f"Not a valid .mishpkg archive: {e}") from e

    if "workbook.json" not in src.namelist():
        raise SheetsTranslationError("Archive is missing workbook.json")

    try:
        workbook = json.loads(src.read("workbook.json").decode("utf-8"))
    except ValueError as e:
        raise SheetsTranslationError(f"workbook.json is not valid JSON: {e}") from e

    workbook_id = str(workbook.get("id") or workbook.get("workbook_id") or uuid.uuid4())
    site_name = (workbook.get("name") or "Imported workbook").strip() or "Imported workbook"
    site_slug = _slugify(workbook.get("slug") or site_name)
    description = workbook.get("description")

    branding = workbook.get("branding") or {}
    site_config: dict[str, Any] = {
        "imported_from_sheets": {
            "workbook_id": workbook_id,
            "imported_at": datetime.now(timezone.utc).isoformat(),
        },
    }
    if branding.get("primary_color"):
        site_config["primary_color"] = branding["primary_color"]
    if branding.get("logo_url"):
        site_config["logo_url"] = branding["logo_url"]

    # ── Walk tables/<id>.json ───────────────────────────────────────
    table_paths = sorted(n for n in src.namelist() if n.startswith("tables/") and n.endswith(".json"))
    layers: list[LayerManifest] = []
    data_sources: list[DataSourceManifest] = []
    feature_lines: list[str] = []
    feature_count_by_layer: dict[str, int] = {}

    for tpath in table_paths:
        try:
            tmeta = json.loads(src.read(tpath).decode("utf-8"))
        except ValueError:
            continue
        table_id = str(tmeta.get("id") or tmeta.get("table_id") or _strip_table_path(tpath))
        table_name = (tmeta.get("name") or table_id).strip() or table_id
        geom_hint = tmeta.get("geometry_hint") or {"kind": "attribute_only"}
        kind = geom_hint.get("kind", "attribute_only")
        rows = list(_load_table_rows(src, table_id))
        attributes_meta = {
            "schema": tmeta.get("schema") or [],
            "from_sheets": {"workbook_id": workbook_id, "table_id": table_id},
            "row_count": len(rows),
        }

        if kind in {"columns", "wkt", "native"} and rows:
            # Promote to a Twin layer; emit a feature per row.
            layer_id = str(uuid.uuid4())
            inserted = 0
            for row in rows:
                geometry = _extract_geometry(row, geom_hint)
                if geometry is None:
                    continue
                # Strip the geometry-source columns from properties so
                # they don't double-up in the attribute drawer.
                properties = {
                    k: v for k, v in row.items() if k not in _hint_columns(geom_hint)
                }
                feature_lines.append(
                    json.dumps(
                        {
                            "type": "Feature",
                            "id": str(uuid.uuid4()),
                            "geometry": geometry,
                            "properties": {
                                **properties,
                                "_source_kind": "sheets",
                                "_source_table_id": table_id,
                                "_source_row_id": str(
                                    row.get("id") or row.get("_row_id") or inserted
                                ),
                            },
                            "_layer_id": layer_id,
                        },
                        separators=(",", ":"),
                    )
                )
                inserted += 1
            feature_count_by_layer[layer_id] = inserted
            layers.append(
                LayerManifest(
                    id=layer_id,
                    name=table_name,
                    type="vector",
                    visible=True,
                    opacity=1.0,
                    order=len(layers),
                    style=tmeta.get("style") or {},
                    metadata={
                        **(tmeta.get("metadata") or {}),
                        "from_sheets": {
                            "workbook_id": workbook_id,
                            "table_id": table_id,
                        },
                    },
                    feature_count=inserted,
                    materialisation="materialised",
                )
            )
        else:
            # Attribute-only — store as a DataSource. Future "join_to"
            # config can reference an existing layer slug.
            ds_id = str(uuid.uuid4())
            data_sources.append(
                DataSourceManifest(
                    id=ds_id,
                    name=table_name,
                    description=tmeta.get("description"),
                    type="table",
                    url=None,
                    size_bytes=None,
                    attributes={
                        **attributes_meta,
                        "rows": rows[:1000],  # cap inline rows; bigger tables
                                              # should ride a real CSV asset
                    },
                    asset_path=None,
                )
            )

    # ── Attachments → library items ─────────────────────────────────
    library_folders: list[LibraryFolderManifest] = []
    library_items: list[LibraryItemManifest] = []
    attach_folder_id: str | None = None
    if any(n.startswith("attachments/") for n in src.namelist()):
        attach_folder_id = str(uuid.uuid4())
        library_folders.append(
            LibraryFolderManifest(
                id=attach_folder_id,
                parent_id=None,
                name=f"{site_name} attachments",
                slug=_slugify(f"{site_name}-attachments"),
                depth=0,
            )
        )
    for path in src.namelist():
        if not path.startswith("attachments/") or path.endswith("/"):
            continue
        info = src.getinfo(path)
        library_items.append(
            LibraryItemManifest(
                id=str(uuid.uuid4()),
                folder_id=attach_folder_id,
                name=path.removeprefix("attachments/"),
                kind=_kind_for_path(path),
                url=None,  # asset embedding is the next iteration
                size_bytes=info.file_size,
                metadata={"from_sheets": {"workbook_id": workbook_id}},
            )
        )

    counts = PackageCounts(
        layers=len(layers),
        features=sum(feature_count_by_layer.values()),
        data_sources=len(data_sources),
        story_maps=0,
        library_folders=len(library_folders),
        library_items=len(library_items),
        feeds=0,
    )

    manifest = PackageManifest(
        exported_at=datetime.now(timezone.utc),
        exported_by=ExportedBy(name="sheets-translator"),
        source=PackageSource(
            twin_url=None,
            site_slug=site_slug,
            source_kind="sheets",
        ),
        site=SiteManifest(
            slug=site_slug,
            name=site_name,
            description=description,
            storage_srid=4326,
            is_public_pre_login=False,
            config=site_config,
        ),
        counts=counts,
        layers=layers,
        data_sources=data_sources,
        story_maps=[],
        library=LibraryManifest(folders=library_folders, items=library_items),
        feeds=[],
        features_path="features.ndjson" if feature_lines else None,
        notes=f"Translated from Mighty Sheets workbook {workbook_id!r}",
    )

    out_buf = io.BytesIO()
    with zipfile.ZipFile(out_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", manifest.model_dump_json(indent=2, exclude_none=False))
        if feature_lines:
            zf.writestr("features.ndjson", "\n".join(feature_lines) + "\n")
    return out_buf.getvalue()


# ── Helpers ─────────────────────────────────────────────────────────────


def _slugify(s: str) -> str:
    return _SLUG_RE.sub("-", s.lower()).strip("-") or "imported"


def _strip_table_path(p: str) -> str:
    return p.removeprefix("tables/").removesuffix(".json")


def _load_table_rows(src: zipfile.ZipFile, table_id: str) -> list[dict[str, Any]]:
    """Try .csv first, then .ndjson, then inline rows from the meta."""
    csv_path = f"tables/{table_id}.csv"
    if csv_path in src.namelist():
        raw = src.read(csv_path).decode("utf-8")
        reader = csv.DictReader(io.StringIO(raw))
        return [dict(r) for r in reader]
    ndjson_path = f"tables/{table_id}.ndjson"
    if ndjson_path in src.namelist():
        rows: list[dict[str, Any]] = []
        for line in src.read(ndjson_path).decode("utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
        return rows
    return []


def _extract_geometry(
    row: dict[str, Any], hint: dict[str, Any]
) -> dict[str, Any] | None:
    kind = hint.get("kind", "attribute_only")
    if kind == "columns":
        lng_col = hint.get("lng") or "longitude"
        lat_col = hint.get("lat") or "latitude"
        try:
            lng = float(row.get(lng_col))
            lat = float(row.get(lat_col))
        except (TypeError, ValueError):
            return None
        return {"type": "Point", "coordinates": [lng, lat]}
    if kind == "wkt":
        # Reuse the feeds.base WKT parser when geometry comes from a
        # WKT column in the Sheets table. Lazy import — the feeds
        # module isn't part of the manifest's dependency graph.
        from ..feeds.base import _wkt_to_geojson  # type: ignore

        col = hint.get("column", "geom")
        return _wkt_to_geojson(row.get(col) if isinstance(row.get(col), str) else "")
    if kind == "native":
        # Sheets shouldn't produce native GeoJSON from a row, but if it
        # does we trust the column "geometry".
        g = row.get("geometry")
        if isinstance(g, str):
            try:
                g = json.loads(g)
            except ValueError:
                return None
        return g if isinstance(g, dict) else None
    return None


def _hint_columns(hint: dict[str, Any]) -> set[str]:
    kind = hint.get("kind")
    if kind == "columns":
        return {hint.get("lng") or "longitude", hint.get("lat") or "latitude"}
    if kind == "wkt":
        return {hint.get("column", "geom")}
    return set()


def _kind_for_path(path: str) -> str:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    if ext in {"png", "jpg", "jpeg", "gif", "webp"}:
        return "photo"
    if ext in {"pdf", "doc", "docx", "txt", "md"}:
        return "document"
    if ext in {"ifc", "ifczip", "glb", "gltf", "obj", "3dtiles"}:
        return "bim"
    return "other"
