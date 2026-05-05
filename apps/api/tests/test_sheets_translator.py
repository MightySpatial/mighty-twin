"""Sheets translator round-trip tests — T+1450.

End-to-end: build a synthetic .mishpkg in memory → run
translate_sheets_to_mtsite → unzip the result → assert the manifest
fields and feature stream match.
"""

from __future__ import annotations

import io
import json
import zipfile

import pytest

from twin_api.packages import (
    PackageManifest,
    SheetsTranslationError,
    translate_sheets_to_mtsite,
)


def _build_mishpkg(workbook: dict, tables: dict[str, dict], rows: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("workbook.json", json.dumps(workbook))
        for tid, meta in tables.items():
            zf.writestr(f"tables/{tid}.json", json.dumps(meta))
            if tid in rows:
                zf.writestr(f"tables/{tid}.csv", rows[tid])
    return buf.getvalue()


def test_geo_table_promotes_to_layer():
    pkg = _build_mishpkg(
        workbook={"id": "wb-1", "name": "Test Workbook"},
        tables={
            "sites": {
                "id": "sites",
                "name": "Sites",
                "geometry_hint": {"kind": "columns", "lng": "lon", "lat": "lat"},
            },
        },
        rows={"sites": "id,lon,lat,name\nA,115.86,-31.95,Perth\nB,151.21,-33.87,Sydney\n"},
    )

    out = translate_sheets_to_mtsite(pkg)
    with zipfile.ZipFile(io.BytesIO(out)) as zf:
        manifest = PackageManifest.model_validate_json(zf.read("manifest.json"))
        feats_blob = zf.read("features.ndjson").decode().strip().splitlines()

    assert manifest.source.source_kind == "sheets"
    assert manifest.site.slug == "test-workbook"
    assert manifest.site.name == "Test Workbook"
    assert len(manifest.layers) == 1
    assert manifest.layers[0].name == "Sites"
    assert manifest.layers[0].feature_count == 2
    assert manifest.counts.features == 2
    assert len(feats_blob) == 2

    first = json.loads(feats_blob[0])
    assert first["geometry"]["type"] == "Point"
    assert first["geometry"]["coordinates"] == [115.86, -31.95]
    # Geometry-source columns stripped from properties
    assert "lon" not in first["properties"]
    assert "lat" not in first["properties"]
    # Provenance stamps preserved
    assert first["properties"]["_source_kind"] == "sheets"
    assert first["properties"]["_source_table_id"] == "sites"


def test_attribute_only_table_becomes_data_source():
    pkg = _build_mishpkg(
        workbook={"id": "wb-1", "name": "Notes Only"},
        tables={
            "notes": {
                "id": "notes",
                "name": "Inspection Notes",
                "geometry_hint": {"kind": "attribute_only"},
            },
        },
        rows={"notes": "site_id,note\nA,All clear\nB,Repair needed\n"},
    )

    out = translate_sheets_to_mtsite(pkg)
    with zipfile.ZipFile(io.BytesIO(out)) as zf:
        manifest = PackageManifest.model_validate_json(zf.read("manifest.json"))

    assert len(manifest.layers) == 0
    assert len(manifest.data_sources) == 1
    assert manifest.data_sources[0].name == "Inspection Notes"
    assert manifest.data_sources[0].type == "table"
    inline_rows = manifest.data_sources[0].attributes.get("rows", [])
    assert len(inline_rows) == 2


def test_branding_propagates_to_site_config():
    pkg = _build_mishpkg(
        workbook={
            "id": "wb-1",
            "name": "Branded",
            "branding": {"primary_color": "#22c55e", "logo_url": "https://example.com/logo.png"},
        },
        tables={},
        rows={},
    )
    out = translate_sheets_to_mtsite(pkg)
    with zipfile.ZipFile(io.BytesIO(out)) as zf:
        manifest = PackageManifest.model_validate_json(zf.read("manifest.json"))
    assert manifest.site.config["primary_color"] == "#22c55e"
    assert manifest.site.config["logo_url"] == "https://example.com/logo.png"
    assert manifest.site.config["imported_from_sheets"]["workbook_id"] == "wb-1"


def test_missing_workbook_json_rejects():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("not-the-right-file.txt", "")
    with pytest.raises(SheetsTranslationError, match="workbook.json"):
        translate_sheets_to_mtsite(buf.getvalue())


def test_invalid_zip_rejects():
    with pytest.raises(SheetsTranslationError):
        translate_sheets_to_mtsite(b"not a zip")


def test_empty_translates_to_empty_site():
    pkg = _build_mishpkg(
        workbook={"id": "wb-1", "name": "Empty"},
        tables={},
        rows={},
    )
    out = translate_sheets_to_mtsite(pkg)
    with zipfile.ZipFile(io.BytesIO(out)) as zf:
        manifest = PackageManifest.model_validate_json(zf.read("manifest.json"))
    assert manifest.site.slug == "empty"
    assert manifest.counts.features == 0
    assert manifest.counts.layers == 0
    assert "features.ndjson" not in zf.namelist()
